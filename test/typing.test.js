import test from "node:test";
import assert from "node:assert/strict";
import { romanToIndic } from "../lib/typing.js";

test("Telugu: long vowels, final anusvara and double consonants", () => {
  assert.equal(romanToIndic("namaskaaram", "te"), "నమస్కారం");
  assert.equal(romanToIndic("bagunnaanu", "te"), "బగున్నాను");
  assert.equal(romanToIndic("lakshmi", "te"), "లక్ష్మి");
});
test("Telugu: capital E and O give long vowels, capitalised words are normal words", () => {
  assert.equal(romanToIndic("nEnu", "te"), "నేను");
  assert.equal(romanToIndic("Nenu", "te"), "నెను");
});
test("Telugu: word-final consonant gets a virama", () => {
  assert.equal(romanToIndic("pen", "te"), "పెన్");
});
test("Hindi", () => {
  assert.equal(romanToIndic("namaste", "hi"), "नमस्ते");
  assert.equal(romanToIndic("aap kaise ho", "hi"), "आप कैसे हो");
});
test("Kannada", () => {
  assert.equal(romanToIndic("namaskaara", "kn"), "ನಮಸ್ಕಾರ");
});
test("digits, punctuation and native script pass through", () => {
  assert.equal(romanToIndic("5 baje?", "hi"), "5 बजे?");
  assert.equal(romanToIndic("నేను", "te"), "నేను");
});
