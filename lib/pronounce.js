// Pronunciation guide: Hindi / Kannada / Telugu text -> Telugu script + Roman letters.
// No libraries needed: Devanagari, Telugu and Kannada Unicode blocks are laid out in
// the same order (ISCII), so converting to Telugu is a code-point shift.

const DEVA_SPECIAL = {
  0x0958: 0x0c15, 0x0959: 0x0c16, 0x095a: 0x0c17, 0x095b: 0x0c1c, // क़ ख़ ग़ ज़ -> క ఖ గ జ
  0x095c: 0x0c21, 0x095d: 0x0c22, 0x095e: 0x0c2b, 0x095f: 0x0c2f, // ड़ ढ़ फ़ य़
  0x0911: 0x0c06, 0x090d: 0x0c0e, 0x0949: 0x0c3e, 0x0945: 0x0c46, // ऑ ऍ ॉ ॅ
  0x093c: null,                                                    // nukta: no Telugu equivalent
  0x0964: 0x2e, 0x0965: 0x2e,                                      // danda -> "."
};

function devaToTelugu(ch) {
  const c = ch.charCodeAt(0);
  if (c in DEVA_SPECIAL) return DEVA_SPECIAL[c] === null ? "" : String.fromCharCode(DEVA_SPECIAL[c]);
  return c >= 0x0900 && c <= 0x097f ? String.fromCharCode(c + 0x300) : ch;
}

function kannadaToTelugu(ch) {
  const c = ch.charCodeAt(0);
  if (c === 0x0cbc) return "";                       // nukta
  if (c === 0x0cde) return String.fromCharCode(0x0c33); // archaic ೞ -> ళ
  return c >= 0x0c81 && c <= 0x0cef ? String.fromCharCode(c - 0x80) : ch;
}

// Hindi drops the final "a" (naam, not naama): add a virama after a final consonant.
function hindiFinalA(text) {
  return text.replace(/[\u0900-\u0963\u0966-\u097F]+/g, (w) => {
    const last = w.charCodeAt(w.length - 1);
    const consonant = (last >= 0x0915 && last <= 0x0939) || (last >= 0x0958 && last <= 0x095f) || last === 0x093c;
    return consonant ? w + "\u094d" : w;
  });
}

// Telugu block offsets (code - 0x0C00)
const CONS = { 0x15: "k", 0x16: "kh", 0x17: "g", 0x18: "gh", 0x19: "ng", 0x1a: "ch", 0x1b: "chh", 0x1c: "j", 0x1d: "jh", 0x1e: "ny",
  0x1f: "t", 0x20: "th", 0x21: "d", 0x22: "dh", 0x23: "n", 0x24: "t", 0x25: "th", 0x26: "d", 0x27: "dh", 0x28: "n",
  0x2a: "p", 0x2b: "ph", 0x2c: "b", 0x2d: "bh", 0x2e: "m", 0x2f: "y", 0x30: "r", 0x31: "r", 0x32: "l", 0x33: "l", 0x34: "zh",
  0x35: "v", 0x36: "sh", 0x37: "sh", 0x38: "s", 0x39: "h" };
const VOWEL = { 0x05: "a", 0x06: "aa", 0x07: "i", 0x08: "ee", 0x09: "u", 0x0a: "oo", 0x0b: "ri", 0x0e: "e", 0x0f: "e", 0x10: "ai", 0x12: "o", 0x13: "o", 0x14: "au" };
const MATRA = { 0x3e: "aa", 0x3f: "i", 0x40: "ee", 0x41: "u", 0x42: "oo", 0x43: "ri", 0x46: "e", 0x47: "e", 0x48: "ai", 0x4a: "o", 0x4b: "o", 0x4c: "au" };

function teluguToRoman(tel, lang) {
  const nasal = lang === "hi" ? "n" : "m";
  const s = [...tel];
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const k = s[i].charCodeAt(0) - 0xc00;
    if (k < 0 || k > 0x7f) { out += s[i]; continue; }
    if (CONS[k]) {
      out += CONS[k];
      const n = s[i + 1] ? s[i + 1].charCodeAt(0) - 0xc00 : -1;
      if (MATRA[n]) { out += MATRA[n]; i++; }
      else if (n === 0x4d) i++;       // virama: no vowel
      else out += "a";                // inherent vowel
    } else if (VOWEL[k]) out += VOWEL[k];
    else if (k === 0x02) out += nasal;
    else if (k === 0x01) out += "n";
    else if (k === 0x03) out += "h";
    else if (k >= 0x66 && k <= 0x6f) out += String(k - 0x66);
  }
  return lang === "hi" ? out.replace(/jny/g, "gy") : out;
}

/** @returns {{telugu: string|null, roman: string}} */
export function pronounce(text, lang) {
  let telugu;
  if (lang === "hi") telugu = [...hindiFinalA(text)].map(devaToTelugu).join("");
  else if (lang === "kn") telugu = [...text].map(kannadaToTelugu).join("");
  else if (lang === "te") telugu = text;
  else return { telugu: null, roman: text }; // English: use audio instead
  return { telugu, roman: teluguToRoman(telugu, lang) };
}
