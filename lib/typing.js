// Type in English letters, get Indian-language letters.
//   te: "namaskaaram" -> నమస్కారం      hi: "namaste" -> नमस्ते      kn: "namaskaara" -> ನಮಸ್ಕಾರ
// One engine produces Telugu, then Unicode's parallel layout converts it to Hindi or Kannada.
// This is the offline backup. The server tries Google Input Tools first, which understands
// natural spelling better (e.g. "nenu" -> నేను).
//
// Typing guide: aa ee oo = long vowels. Capital E and O = long e and o (nEnu -> నేను).
// Capital T D N L S = retroflex sounds (ట డ ణ ళ ష).  Double a letter for a double sound (nn -> న్న).

const VIRAMA = "్";

const VOWELS = [ // [roman, independent, matra]
  ["aa", "ఆ", "ా"], ["ai", "ఐ", "ై"], ["au", "ఔ", "ౌ"], ["ee", "ఈ", "ీ"], ["ii", "ఈ", "ీ"],
  ["oo", "ఊ", "ూ"], ["uu", "ఊ", "ూ"],
  ["a", "అ", ""], ["i", "ఇ", "ి"], ["u", "ఉ", "ు"], ["e", "ఎ", "ె"], ["o", "ఒ", "ొ"],
  ["A", "ఆ", "ా"], ["I", "ఈ", "ీ"], ["U", "ఊ", "ూ"], ["E", "ఏ", "ే"], ["O", "ఓ", "ో"],
];

const CONSONANTS = [ // longest patterns first
  ["ksh", "క్ష"], ["chh", "ఛ"], ["Th", "ఠ"], ["Dh", "ఢ"],
  ["kh", "ఖ"], ["gh", "ఘ"], ["ch", "చ"], ["jh", "ఝ"], ["th", "థ"], ["dh", "ధ"], ["ph", "ఫ"], ["bh", "భ"], ["sh", "శ"], ["ny", "ఞ"],
  ["k", "క"], ["g", "గ"], ["c", "క"], ["j", "జ"], ["T", "ట"], ["D", "డ"], ["N", "ణ"], ["t", "త"], ["d", "ద"], ["n", "న"],
  ["p", "ప"], ["f", "ఫ"], ["b", "బ"], ["m", "మ"], ["y", "య"], ["r", "ర"], ["l", "ల"], ["L", "ళ"], ["v", "వ"], ["w", "వ"],
  ["s", "స"], ["S", "ష"], ["h", "హ"], ["z", "జ"], ["q", "క"], ["x", "క్స"],
];

function tokenize(word) {
  const tokens = [];
  let i = 0;
  while (i < word.length) {
    const v = VOWELS.find(([k]) => word.startsWith(k, i));
    if (v) { tokens.push({ t: "V", ind: v[1], mat: v[2] }); i += v[0].length; continue; }
    const c = CONSONANTS.find(([k]) => word.startsWith(k, i));
    if (c) { tokens.push({ t: "C", key: c[0], v: c[1] }); i += c[0].length; continue; }
    tokens.push({ t: "X", v: word[i] }); i++;
  }
  return tokens;
}

function convertWord(word, lang) {
  if (/^[A-Z][a-z]+$/.test(word)) word = word.toLowerCase(); // "Nenu" is just a capitalised word
  const tokens = tokenize(word);
  let out = "";
  let afterConsonant = false;
  tokens.forEach((t, i) => {
    if (t.t === "V") { out += afterConsonant ? t.mat : t.ind; afterConsonant = false; return; }
    if (t.t === "X") { out += t.v; afterConsonant = false; return; }
    if (afterConsonant) out += VIRAMA; // two consonants in a row form a cluster
    const finalM = i === tokens.length - 1 && i > 0 && tokens[i - 1].t === "V" && t.key === "m";
    if (finalM && lang !== "hi") { out += "ం"; afterConsonant = false; } // namaskaaram -> ...రం
    else { out += t.v; afterConsonant = true; }
  });
  return afterConsonant ? out + VIRAMA : out;
}

const shift = (s, fn) => [...s].map((ch) => {
  const c = ch.charCodeAt(0);
  return c >= 0x0c00 && c <= 0x0c7f ? String.fromCharCode(fn(c)) : ch;
}).join("");

export function romanToIndic(text, lang) {
  const telugu = text.replace(/[A-Za-z]+/g, (w) => convertWord(w, lang));
  if (lang === "te") return telugu;
  if (lang === "kn") return shift(telugu, (c) => c + 0x80);
  // Hindi has no short e/o, and does not write a virama on a word-final consonant
  const hindi = shift(telugu, (c) => ({ 0x0c0e: 0x0c0f, 0x0c12: 0x0c13, 0x0c46: 0x0c47, 0x0c4a: 0x0c4b }[c] ?? c) - 0x300);
  return hindi.replace(/\u094d(?![\u0900-\u097f])/g, "");
}
