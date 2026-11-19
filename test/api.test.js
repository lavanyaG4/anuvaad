import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { startDb, testApp } from "./helpers.js";

let stop, app;
before(async () => { stop = await startDb(); app = testApp(); });
after(async () => { await stop(); });

const signup = (email = "asha@example.com", extra = {}) =>
  request(app).post("/api/auth/signup").send({ email, password: "correct-horse", name: "Asha", ...extra });
const bearer = (token) => ({ Authorization: `Bearer ${token}` });

test("health check", async () => {
  const res = await request(app).get("/api/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test("translate returns the other three languages with pronunciation", async () => {
  const res = await request(app).post("/api/translate").send({ text: "hello", source: "en" });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.results.map((r) => r.lang), ["te", "hi", "kn"]);
  const hi = res.body.results.find((r) => r.lang === "hi");
  assert.equal(hi.telugu, "నమస్తే");
  assert.equal(hi.roman, "namaste");
});

test("translate from Telugu returns English without Telugu-script pronunciation", async () => {
  const res = await request(app).post("/api/translate").send({ text: "నమస్కారం", source: "te" });
  const en = res.body.results.find((r) => r.lang === "en");
  assert.equal(en.translation, "hello");
  assert.equal(en.telugu, null);
});

test("translate validates input", async () => {
  assert.equal((await request(app).post("/api/translate").send({ text: "", source: "en" })).status, 400);
  assert.equal((await request(app).post("/api/translate").send({ text: "hi", source: "fr" })).status, 400);
  assert.equal((await request(app).post("/api/translate").send({ text: "x".repeat(501), source: "en" })).status, 400);
});

test("one failing language does not break the others", async () => {
  const flaky = testApp({ translateText: async (_t, _s, target) => { if (target === "kn") throw new Error("down"); return "नमस्ते"; } });
  const res = await request(flaky).post("/api/translate").send({ text: "hello", source: "en" });
  assert.equal(res.status, 200);
  assert.ok(res.body.results.find((r) => r.lang === "kn").error);
  assert.ok(res.body.results.find((r) => r.lang === "hi").translation);
});

test("502 when every translation fails", async () => {
  const down = testApp({ translateText: async () => { throw new Error("down"); } });
  const res = await request(down).post("/api/translate").send({ text: "hello", source: "en" });
  assert.equal(res.status, 502);
});

test("signup, duplicate, weak password and bad email", async () => {
  const ok = await signup();
  assert.equal(ok.status, 201);
  assert.ok(ok.body.token);
  assert.equal(ok.body.user.email, "asha@example.com");
  assert.equal(ok.body.user.passwordHash, undefined);
  assert.equal((await signup()).status, 409);
  assert.equal((await signup("new@example.com", { password: "short" })).status, 400);
  assert.equal((await signup("not-an-email")).status, 400);
});

test("login works, wrong password and unknown email are rejected the same way", async () => {
  const good = await request(app).post("/api/auth/login").send({ email: "ASHA@example.com", password: "correct-horse" });
  assert.equal(good.status, 200);
  const bad = await request(app).post("/api/auth/login").send({ email: "asha@example.com", password: "wrong-password" });
  const none = await request(app).post("/api/auth/login").send({ email: "nobody@example.com", password: "whatever-123" });
  assert.equal(bad.status, 401);
  assert.equal(none.status, 401);
  assert.equal(bad.body.error, none.body.error);
});

test("/auth/me needs a valid token", async () => {
  assert.equal((await request(app).get("/api/auth/me")).status, 401);
  assert.equal((await request(app).get("/api/auth/me").set(bearer("garbage"))).status, 401);
  const { body } = await request(app).post("/api/auth/login").send({ email: "asha@example.com", password: "correct-horse" });
  const me = await request(app).get("/api/auth/me").set(bearer(body.token));
  assert.equal(me.status, 200);
  assert.equal(me.body.user.name, "Asha");
});

test("phrasebook: save, de-duplicate, list, delete", async () => {
  assert.equal((await request(app).get("/api/phrases")).status, 401);
  const { body } = await request(app).post("/api/auth/login").send({ email: "asha@example.com", password: "correct-horse" });
  const h = bearer(body.token);
  const phrase = { text: "hello", source: "en", lang: "hi", translation: "नमस्ते", telugu: "నమస్తే", roman: "namaste" };

  const a = await request(app).post("/api/phrases").set(h).send(phrase);
  const b = await request(app).post("/api/phrases").set(h).send(phrase);
  assert.equal(a.status, 201);
  assert.equal(a.body._id, b.body._id); // saving the same phrase twice keeps one copy

  const list = await request(app).get("/api/phrases").set(h);
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].telugu, "నమస్తే");

  assert.equal((await request(app).post("/api/phrases").set(h).send({ ...phrase, translation: "" })).status, 400);
  assert.equal((await request(app).delete(`/api/phrases/${a.body._id}`).set(h)).status, 204);
  assert.equal((await request(app).get("/api/phrases").set(h)).body.length, 0);
});

test("users cannot delete each other's phrases", async () => {
  const owner = (await request(app).post("/api/auth/login").send({ email: "asha@example.com", password: "correct-horse" })).body.token;
  const other = (await signup("ravi@example.com", { name: "Ravi" })).body.token;
  const phrase = { text: "hello", source: "en", lang: "kn", translation: "ನಮಸ್ಕಾರ" };
  const saved = await request(app).post("/api/phrases").set(bearer(owner)).send(phrase);
  await request(app).delete(`/api/phrases/${saved.body._id}`).set(bearer(other));
  assert.equal((await request(app).get("/api/phrases").set(bearer(owner))).body.length, 1);
  assert.equal((await request(app).get("/api/phrases").set(bearer(other))).body.length, 0);
});

test("history is recorded for logged-in users and can be cleared", async () => {
  const token = (await request(app).post("/api/auth/login").send({ email: "asha@example.com", password: "correct-horse" })).body.token;
  await request(app).post("/api/translate").set(bearer(token)).send({ text: "good morning", source: "en" });
  await request(app).post("/api/translate").set(bearer(token)).send({ text: "good morning", source: "en" });
  await new Promise((r) => setTimeout(r, 100)); // history is written in the background
  const list = await request(app).get("/api/history").set(bearer(token));
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].count, 2);
  assert.equal((await request(app).delete("/api/history").set(bearer(token))).status, 204);
  assert.equal((await request(app).get("/api/history").set(bearer(token))).body.length, 0);
});

test("transliterate uses Google when available, local engine otherwise", async () => {
  const local = await request(app).get("/api/transliterate").query({ lang: "hi", text: "namaste" });
  assert.deepEqual(local.body, { text: "नमस्ते", via: "local" });

  const online = testApp({ fetchTranslit: async () => "నేను బాగున్నాను" });
  const g = await request(online).get("/api/transliterate").query({ lang: "te", text: "nenu bagunnanu" });
  assert.deepEqual(g.body, { text: "నేను బాగున్నాను", via: "google" });

  const native = await request(app).get("/api/transliterate").query({ lang: "te", text: "నేను" });
  assert.equal(native.body.via, "none");
  assert.equal((await request(app).get("/api/transliterate").query({ lang: "en", text: "hi" })).status, 400);
});

test("speak returns audio and validates input", async () => {
  const ok = await request(app).get("/api/speak").query({ lang: "hi", text: "नमस्ते" });
  assert.equal(ok.status, 200);
  assert.match(ok.headers["content-type"], /audio\/mpeg/);
  assert.equal((await request(app).get("/api/speak").query({ lang: "xx", text: "hi" })).status, 400);
  const broken = testApp({ fetchSpeech: async () => { throw new Error("down"); } });
  assert.equal((await request(broken).get("/api/speak").query({ lang: "hi", text: "नमस्ते" })).status, 502);
});

test("unknown API routes return JSON 404 and bad JSON returns 400", async () => {
  assert.equal((await request(app).get("/api/nope")).status, 404);
  const bad = await request(app).post("/api/translate").set("Content-Type", "application/json").send("{oops");
  assert.equal(bad.status, 400);
});
