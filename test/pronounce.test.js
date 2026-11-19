import test from "node:test";
import assert from "node:assert/strict";
import { pronounce } from "../lib/pronounce.js";

test("Hindi: namaste", () => {
  assert.deepEqual(pronounce("नमस्ते", "hi"), { telugu: "నమస్తే", roman: "namaste" });
});
test("Hindi: final 'a' is dropped", () => {
  assert.deepEqual(pronounce("नाम", "hi"), { telugu: "నామ్", roman: "naam" });
});
test("Hindi: full sentence", () => {
  assert.equal(pronounce("आप कैसे हैं?", "hi").roman, "aap kaise hain?");
});
test("Kannada converts to Telugu script", () => {
  assert.equal(pronounce("ನಮಸ್ಕಾರ", "kn").telugu, "నమస్కార");
});
test("English has no Telugu script", () => {
  assert.equal(pronounce("hello", "en").telugu, null);
});
