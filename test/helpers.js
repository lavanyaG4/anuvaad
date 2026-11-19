import mongoose from "mongoose";
import pino from "pino";
import { createApp } from "../src/app.js";
import { User, Phrase, History } from "../src/models.js";

// Uses TEST_MONGODB_URI (CI) or starts a throwaway in-memory MongoDB (local).
export async function startDb() {
  let uri = process.env.TEST_MONGODB_URI;
  let mem;
  if (!uri) {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    mem = await MongoMemoryServer.create();
    uri = mem.getUri();
  }
  await mongoose.connect(uri, { dbName: `anuvaad_test_${process.pid}` });
  await Promise.all([User.init(), Phrase.init(), History.init()]);
  return async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    await mem?.stop();
  };
}

const SAMPLE = { en: "hello", te: "నమస్కారం", hi: "नमस्ते", kn: "ನಮಸ್ಕಾರ" };

export function testApp(overrides = {}) {
  return createApp({
    jwtSecret: "test-secret",
    logger: pino({ level: "silent" }),
    rateLimit: false,
    translateText: async (_text, _source, target) => SAMPLE[target],
    fetchSpeech: async () => Buffer.from("fake-mp3-bytes"),
    fetchTranslit: async () => { throw new Error("offline"); },
    ...overrides,
  });
}
