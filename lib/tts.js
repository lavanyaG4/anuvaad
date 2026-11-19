// Text-to-speech through Google's free endpoint: the same voice on every device.
function chunk(text, max = 180) {
  const parts = [];
  let cur = "";
  for (const word of text.split(/\s+/)) {
    if (cur && (cur + " " + word).length > max) { parts.push(cur); cur = word; }
    else cur = cur ? cur + " " + word : word;
  }
  if (cur) parts.push(cur);
  return parts;
}

export async function fetchSpeech(text, lang, slow = false) {
  const buffers = [];
  for (const part of chunk(text)) {
    const url = "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob" +
      `&tl=${lang}&ttsspeed=${slow ? 0.3 : 1}&q=${encodeURIComponent(part)}`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`tts ${res.status}`);
    buffers.push(Buffer.from(await res.arrayBuffer()));
  }
  return Buffer.concat(buffers);
}
