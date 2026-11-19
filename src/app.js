import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pino from "pino";
import pinoHttp from "pino-http";
import mongoose from "mongoose";
import { z } from "zod";
import { User, Phrase, History } from "./models.js";
import { hashPassword, checkPassword, DUMMY_HASH, signToken, authMiddleware } from "./auth.js";
import { translateText as defaultTranslate } from "../lib/translator.js";
import { fetchSpeech as defaultSpeech } from "../lib/tts.js";
import { fetchTranslit as defaultTranslit } from "../lib/google-input.js";
import { pronounce } from "../lib/pronounce.js";
import { romanToIndic } from "../lib/typing.js";

const LANGS = ["en", "te", "hi", "kn"];
const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

const lang = z.enum(LANGS, { errorMap: () => ({ message: "Choose English, Telugu, Hindi or Kannada." }) });
const translateBody = z.object({
  text: z.string().trim().min(1, "Type a sentence first.").max(500, "Please keep it under 500 characters."),
  source: lang,
});
const email = z.string().trim().toLowerCase().email("Enter a valid email address.");
const signupBody = z.object({
  email,
  password: z.string().min(8, "Password must be at least 8 characters.").max(72, "Password is too long."),
  name: z.string().trim().max(60).optional().default(""),
});
const loginBody = z.object({ email, password: z.string().min(1, "Enter your password.").max(72) });
const phraseBody = z.object({
  text: z.string().trim().max(500).default(""),
  source: lang,
  lang,
  translation: z.string().trim().min(1, "Nothing to save.").max(1000),
  telugu: z.string().trim().max(1000).optional().default(""),
  roman: z.string().trim().max(1000).optional().default(""),
});

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name });
const ah = (fn) => (req, res, next) => fn(req, res, next).catch(next); // Express 4 needs this for async routes

/**
 * Builds the Express app. External services are injectable so tests never touch the network.
 */
export function createApp(deps = {}) {
  const {
    translateText = defaultTranslate,
    fetchSpeech = defaultSpeech,
    fetchTranslit = defaultTranslit,
    jwtSecret,
    logger = pino({ level: process.env.LOG_LEVEL || "info", redact: ["req.headers.authorization"] }),
  } = deps;
  const auth = authMiddleware(jwtSecret);
  const limiter = (limit) =>
    deps.rateLimit === false
      ? (_req, _res, next) => next()
      : rateLimit({ windowMs: 60_000, limit, standardHeaders: true, legacyHeaders: false,
                    message: { error: "Too many requests. Please wait a minute and try again." } });

  const parse = (schema, data, res) => {
    const r = schema.safeParse(data);
    if (!r.success) { res.status(400).json({ error: r.error.issues[0].message }); return null; }
    return r.data;
  };

  // Small in-memory cache so repeated sentences are instant
  const cache = new Map();
  const remember = (k, v) => { if (cache.size >= 500) cache.delete(cache.keys().next().value); cache.set(k, v); };

  const app = express();
  app.set("trust proxy", 1); // real client IPs behind Render's proxy
  app.use(helmet({ contentSecurityPolicy: { directives: { "upgrade-insecure-requests": null } } }));
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/api/health" } }));
  app.use(express.json({ limit: "10kb" }));
  app.use(express.static(PUBLIC));

  const api = express.Router();
  api.get("/health", (_req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));

  // ---- accounts ----
  api.post("/auth/signup", limiter(10), ah(async (req, res) => {
    const body = parse(signupBody, req.body, res); if (!body) return;
    let user;
    try {
      user = await User.create({ email: body.email, name: body.name, passwordHash: await hashPassword(body.password) });
    } catch (e) {
      if (e.code === 11000) return res.status(409).json({ error: "An account with this email already exists. Try logging in." });
      throw e;
    }
    res.status(201).json({ token: signToken(user.id, jwtSecret), user: publicUser(user) });
  }));

  api.post("/auth/login", limiter(10), ah(async (req, res) => {
    const body = parse(loginBody, req.body, res); if (!body) return;
    const user = await User.findOne({ email: body.email }).select("+passwordHash");
    const ok = await checkPassword(body.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) return res.status(401).json({ error: "Incorrect email or password." });
    res.json({ token: signToken(user.id, jwtSecret), user: publicUser(user) });
  }));

  api.get("/auth/me", auth.required, ah(async (req, res) => {
    const user = await User.findById(req.userId);
    if (!user) return res.status(401).json({ error: "Please log in." });
    res.json({ user: publicUser(user) });
  }));

  // ---- translate: one sentence in, the other three languages out ----
  api.post("/translate", limiter(30), auth.optional, ah(async (req, res) => {
    const body = parse(translateBody, req.body, res); if (!body) return;
    const { text, source } = body;

    const results = await Promise.all(LANGS.filter((l) => l !== source).map(async (target) => {
      const key = `${source}|${target}|${text}`;
      try {
        let r = cache.get(key);
        if (!r) {
          const translation = await translateText(text, source, target);
          if (!translation) throw new Error("empty translation");
          r = { lang: target, translation, ...pronounce(translation, target) };
          remember(key, r);
        }
        return r;
      } catch (e) {
        req.log.warn({ err: e.message, target }, "translation failed");
        return { lang: target, error: "Could not translate into this language. Try again." };
      }
    }));
    if (results.every((r) => r.error)) {
      return res.status(502).json({ error: "The translation service is not reachable. Check your internet connection and try again." });
    }

    if (req.userId) { // logged-in users get a history of what they translated
      History.findOneAndUpdate({ user: req.userId, source, text }, { $set: { lastUsedAt: new Date() }, $inc: { count: 1 } }, { upsert: true })
        .catch((e) => req.log.warn({ err: e.message }, "history write failed"));
    }
    res.json({ source, results });
  }));

  // ---- typing in English letters -> native script ----
  api.get("/transliterate", limiter(120), ah(async (req, res) => {
    const l = z.enum(["te", "hi", "kn"]).safeParse(req.query.lang);
    if (!l.success) return res.status(400).json({ error: "Choose Telugu, Hindi or Kannada." });
    const text = typeof req.query.text === "string" ? req.query.text.trim().slice(0, 300) : "";
    if (!/[A-Za-z]/.test(text)) return res.json({ text, via: "none" });
    try {
      const out = await fetchTranslit(text, l.data);
      if (out) return res.json({ text: out, via: "google" });
    } catch (e) { req.log.warn({ err: e.message }, "input tools failed, using local engine"); }
    res.json({ text: romanToIndic(text, l.data), via: "local" });
  }));

  // ---- audio ----
  api.get("/speak", limiter(60), ah(async (req, res) => {
    const l = lang.safeParse(req.query.lang);
    const text = typeof req.query.text === "string" ? req.query.text.trim().slice(0, 500) : "";
    if (!l.success || !text) return res.status(400).json({ error: "Nothing to speak." });
    try {
      const audio = await fetchSpeech(text, l.data, req.query.slow === "1");
      res.set({ "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=86400" }).send(audio);
    } catch (e) {
      req.log.warn({ err: e.message }, "tts failed");
      res.status(502).json({ error: "Audio is not available right now." });
    }
  }));

  // ---- saved phrases ----
  api.get("/phrases", auth.required, ah(async (req, res) => {
    res.json(await Phrase.find({ user: req.userId }).sort({ createdAt: -1 }).limit(200).lean());
  }));

  api.post("/phrases", auth.required, ah(async (req, res) => {
    const b = parse(phraseBody, req.body, res); if (!b) return;
    const doc = await Phrase.findOneAndUpdate(
      { user: req.userId, lang: b.lang, translation: b.translation },
      { $setOnInsert: { source: b.source, text: b.text, telugu: b.telugu, roman: b.roman } },
      { upsert: true, new: true }
    ).lean();
    res.status(201).json(doc);
  }));

  api.delete("/phrases/:id", auth.required, ah(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid phrase id." });
    await Phrase.deleteOne({ _id: req.params.id, user: req.userId }); // scoped to the owner
    res.status(204).end();
  }));

  // ---- history ----
  api.get("/history", auth.required, ah(async (req, res) => {
    res.json(await History.find({ user: req.userId }).sort({ lastUsedAt: -1 }).limit(30).lean());
  }));

  api.delete("/history", auth.required, ah(async (req, res) => {
    await History.deleteMany({ user: req.userId });
    res.status(204).end();
  }));

  app.use("/api", api);
  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));
  app.use((err, req, res, _next) => {
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON." });
    if (err.type === "entity.too.large") return res.status(413).json({ error: "Request is too large." });
    req.log.error(err);
    res.status(500).json({ error: "Something went wrong on the server." });
  });
  return app;
}
