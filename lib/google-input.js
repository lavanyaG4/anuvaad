// Google Input Tools (free, unofficial): turns "nenu bagunnanu" into Telugu letters.
const ITC = { te: "te-t-i0-und", hi: "hi-t-i0-und", kn: "kn-t-i0-und" };

export async function fetchTranslit(text, lang) {
  const url = "https://inputtools.google.com/request?num=1&cp=0&cs=1&ie=utf-8&oe=utf-8&app=anuvaad" +
    `&itc=${ITC[lang]}&text=${encodeURIComponent(text)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`input tools ${res.status}`);
  const data = await res.json();
  if (data[0] !== "SUCCESS") throw new Error("input tools failed");
  return data[1].map((seg) => seg[1]?.[0] ?? seg[0]).join(" ").trim();
}
