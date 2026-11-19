// Translation backend. server.js only calls translateText(), so you can swap this
// file for IndicTrans2 (served from a small Python service) later.
const TIMEOUT = 8000;

async function viaGoogle(text, source, target) {
  const url = "https://translate.googleapis.com/translate_a/single?client=gtx&dt=t" +
    `&sl=${source}&tl=${target}&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
  if (!res.ok) throw new Error(`google ${res.status}`);
  const data = await res.json();
  return data[0].map((seg) => seg[0]).join("").trim();
}

async function viaMyMemory(text, source, target) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${source}|${target}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
  if (!res.ok) throw new Error(`mymemory ${res.status}`);
  const data = await res.json();
  return (data.responseData?.translatedText || "").trim();
}

export async function translateText(text, source, target) {
  if (source === target) return text;
  try {
    const out = await viaGoogle(text, source, target);
    if (out) return out;
  } catch { /* fall through to the backup service */ }
  return viaMyMemory(text, source, target);
}
