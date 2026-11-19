const LANGS = {
  en: { name: "English",         short: "English", stt: "en-IN", tts: "en-IN", example: "" },
  te: { name: "Telugu (తెలుగు)", short: "Telugu",  stt: "te-IN", tts: "te-IN", example: "nenu bagunnanu" },
  hi: { name: "Hindi (हिन्दी)",  short: "Hindi",   stt: "hi-IN", tts: "hi-IN", example: "aap kaise hain" },
  kn: { name: "Kannada (ಕನ್ನಡ)", short: "Kannada", stt: "kn-IN", tts: "kn-IN", example: "neevu hegiddiri" },
};

const $ = id => document.getElementById(id);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e; };
const source = $("source"), text = $("text"), goBtn = $("go"), micBtn = $("mic");
const setStatus = msg => { $("status").textContent = msg; };
const setAuthStatus = msg => { $("auth-status").textContent = msg; };

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};
let token = store.get("anuvaadToken");
let user = null;
let lastText = "", lastSource = "en";

// ---------------- API helper ----------------
async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  let res;
  try { res = await fetch("/api" + path, { ...opts, headers }); }
  catch { throw new Error(navigator.onLine ? "Cannot reach the server." : "You are offline. Connect to the internet and try again."); }
  const data = res.status === 204 ? null : await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token && !path.startsWith("/auth/")) logout();
    throw new Error(data?.error || "Something went wrong. Try again.");
  }
  return data;
}

// ---------------- accounts ----------------
let authMode = "login";
function setAuthMode(m) {
  authMode = m;
  $("tab-login").classList.toggle("active", m === "login");
  $("tab-signup").classList.toggle("active", m === "signup");
  $("name-row").hidden = m !== "signup";
  $("auth-submit").textContent = m === "signup" ? "Create account" : "Log in";
  $("password").autocomplete = m === "signup" ? "new-password" : "current-password";
  setAuthStatus("");
}
$("tab-login").onclick = () => setAuthMode("login");
$("tab-signup").onclick = () => setAuthMode("signup");

function openAccount(msg = "") {
  $("account").hidden = false; setAuthStatus(msg);
  $("account").scrollIntoView({ behavior: "smooth", block: "start" });
  $("email").focus();
}

$("auth-form").onsubmit = async e => {
  e.preventDefault();
  const body = { email: $("email").value, password: $("password").value };
  if (authMode === "signup") body.name = $("name").value;
  setAuthStatus("Please wait…");
  try {
    const d = await api("/auth/" + authMode, { method: "POST", body: JSON.stringify(body) });
    token = d.token; user = d.user; store.set("anuvaadToken", token);
    $("password").value = ""; $("account").hidden = true; setAuthStatus("");
    onAuthChange();
  } catch (err) { setAuthStatus(err.message); }
};

function logout() { token = null; user = null; phrases = []; history = []; store.set("anuvaadToken", null); onAuthChange(); }
$("account-btn").onclick = () => {
  if (user) logout();
  else if ($("account").hidden) openAccount(); else $("account").hidden = true;
};

function onAuthChange() {
  $("whoami").textContent = user ? (user.name || user.email) : "";
  $("account-btn").textContent = user ? "Log out" : "Log in";
  $("library").hidden = !user;
  if (user) loadLibrary();
}

// ---------------- language + typing in English letters ----------------
for (const [code, l] of Object.entries(LANGS)) {
  const o = el("option", "", l.name); o.value = code; source.append(o);
}
source.value = "en";

const typingOn = () => source.value !== "en" && $("typing").checked;
const hasLatin = () => /[A-Za-z]/.test(text.value);
let previewTimer = null, previewSeq = 0, previewValue = "";

function updateTypingUI() {
  const l = LANGS[source.value];
  $("typing-row").hidden = source.value === "en";
  $("typing-label").textContent = `Type ${l.short} using English letters`;
  $("typing-hint").textContent = `Write it the way it sounds, like “${l.example}”. Use capital E or O for long e and o. Your ${l.short} letters appear below.`;
  schedulePreview();
}
source.onchange = updateTypingUI;
$("typing").onchange = schedulePreview;
text.addEventListener("input", schedulePreview);

function schedulePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(updatePreview, 300); }
function hidePreview() { previewSeq++; $("preview").hidden = true; previewValue = ""; }

async function toNative(raw) {
  const d = await api(`/transliterate?lang=${source.value}&text=${encodeURIComponent(raw)}`);
  return d.text || raw;
}

async function updatePreview() {
  if (!typingOn() || !hasLatin()) return hidePreview();
  const seq = ++previewSeq;
  try {
    const out = await toNative(text.value.trim());
    if (seq !== previewSeq) return;
    previewValue = out;
    $("preview-label").textContent = `In ${LANGS[source.value].short} letters`;
    $("preview-text").textContent = out;
    $("preview").hidden = false;
  } catch { if (seq === previewSeq) hidePreview(); }
}

$("use-preview").onclick = () => {
  text.value = previewValue; $("typing").checked = false; hidePreview(); text.focus();
};

// ---------------- translate ----------------
async function translate() {
  let q = text.value.trim();
  if (!q) return setStatus("Type or speak a sentence first.");
  setStatus("Translating…"); goBtn.disabled = true;
  try {
    if (typingOn() && hasLatin()) q = await toNative(q);
    const data = await api("/translate", { method: "POST", body: JSON.stringify({ text: q, source: source.value }) });
    lastText = q; lastSource = source.value;
    render(data); setStatus("");
    if (user) loadHistory();
  } catch (e) { setStatus(e.message); }
  finally { goBtn.disabled = false; }
}
goBtn.onclick = translate;
text.addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) translate(); });

function render(data) {
  const box = $("results");
  box.replaceChildren();
  for (const r of data.results) {
    const card = el("section", "panel");
    card.append(el("p", "lang-name", LANGS[r.lang].name));
    if (r.error) { card.append(el("p", "muted", r.error)); box.append(card); continue; }

    card.append(el("p", "out-text", r.translation));
    if (r.telugu && r.lang !== "te") {
      const say = el("div", "say");
      say.append(el("p", "say-label", "Say it like this (Telugu script)"), el("p", "say-text", r.telugu));
      card.append(say);
    }
    if (r.lang !== "en") card.append(el("p", "roman", r.roman));

    const row = el("div", "row");
    const play = el("button", "primary", "Play");
    const slow = el("button", "", "Play slowly");
    const save = el("button", "", "Save");
    play.onclick = () => speak(r.translation, r.lang, false);
    slow.onclick = () => speak(r.translation, r.lang, true);
    save.onclick = () => savePhrase(r, save);
    row.append(play, slow, save); card.append(row);
    box.append(card);
  }
  box.firstChild?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function savePhrase(r, btn) {
  if (!user) return openAccount("Log in to save phrases.");
  try {
    await api("/phrases", { method: "POST", body: JSON.stringify({
      text: lastText, source: lastSource, lang: r.lang, translation: r.translation, telugu: r.telugu || "", roman: r.roman || "" }) });
    btn.textContent = "Saved"; loadPhrases();
  } catch (e) { setStatus(e.message); }
}

// ---------------- audio: server voice first, device voice as backup ----------------
let audio = null;
function stopAudio() {
  if (audio) { audio.pause(); audio = null; }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}
function deviceSpeak(str, lang, slow) {
  if (!("speechSynthesis" in window)) return setStatus("Audio is not available right now.");
  const u = new SpeechSynthesisUtterance(str);
  u.lang = LANGS[lang].tts; u.rate = slow ? 0.55 : 1;
  const v = speechSynthesis.getVoices().find(v => v.lang.replace("_", "-").toLowerCase().startsWith(lang));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}
function speak(str, lang, slow) {
  stopAudio(); setStatus("Loading audio…");
  const a = new Audio(`/api/speak?lang=${lang}&slow=${slow ? 1 : 0}&text=${encodeURIComponent(str)}`);
  audio = a;
  let fellBack = false;
  const fallback = () => {
    if (fellBack || audio !== a) return;
    fellBack = true; setStatus("Online voice unavailable. Using this device's voice.");
    deviceSpeak(str, lang, slow);
  };
  a.onplaying = () => setStatus("");
  a.onerror = fallback;
  a.play().catch(fallback);
}

// ---------------- speak-to-type ----------------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
micBtn.onclick = () => {
  if (!SR) return setStatus("Voice input is not supported in this browser. Try Chrome.");
  if (rec) { rec.stop(); return; }
  rec = new SR();
  rec.lang = LANGS[source.value].stt; rec.interimResults = true;
  rec.onstart = () => { micBtn.classList.add("recording"); micBtn.textContent = "Listening… tap to stop"; setStatus(""); };
  rec.onresult = e => { text.value = Array.from(e.results).map(r => r[0].transcript).join(" "); };
  rec.onerror = e => setStatus(e.error === "not-allowed" ? "Microphone access is blocked. Allow it in the browser's site settings." : "Could not hear that. Try again.");
  rec.onend = () => { micBtn.classList.remove("recording"); micBtn.textContent = "Speak"; rec = null; if (text.value.trim()) translate(); };
  rec.start();
};

// ---------------- library: saved phrases + history ----------------
let libTab = "phrases", phrases = [], history = [];
function setLibTab(t) {
  libTab = t;
  $("tab-phrases").classList.toggle("active", t === "phrases");
  $("tab-history").classList.toggle("active", t === "history");
  renderLibrary();
}
$("tab-phrases").onclick = () => setLibTab("phrases");
$("tab-history").onclick = () => setLibTab("history");

const loadPhrases = async () => { try { phrases = await api("/phrases"); renderLibrary(); } catch (e) { setStatus(e.message); } };
const loadHistory = async () => { try { history = await api("/history"); renderLibrary(); } catch {} };
const loadLibrary = () => Promise.all([loadPhrases(), loadHistory()]);

function renderLibrary() {
  const ul = $("lib-list");
  ul.replaceChildren();
  const items = libTab === "phrases" ? phrases : history;
  $("lib-empty").hidden = items.length > 0;
  $("lib-empty").textContent = libTab === "phrases"
    ? "Saved phrases appear here. Translate something and tap Save."
    : "Your recent sentences appear here.";
  $("clear-history").hidden = libTab !== "history" || history.length === 0;

  for (const p of items) {
    const li = el("li");
    const acts = el("div", "acts");
    if (libTab === "phrases") {
      li.append(el("div", "t", p.translation + (p.telugu && p.lang !== "te" ? "  —  " + p.telugu : "")), el("div", "p", `${LANGS[p.lang].short}  ·  ${p.text}`));
      const play = el("button", "small", "Play"); play.onclick = () => speak(p.translation, p.lang, false);
      const del = el("button", "small", "Delete");
      del.onclick = async () => { try { await api("/phrases/" + p._id, { method: "DELETE" }); loadPhrases(); } catch (e) { setStatus(e.message); } };
      acts.append(play, del);
    } else {
      li.append(el("div", "t", p.text), el("div", "p", LANGS[p.source].short));
      const again = el("button", "small", "Translate");
      again.onclick = () => { source.value = p.source; updateTypingUI(); $("typing").checked = false; text.value = p.text; hidePreview(); translate(); };
      acts.append(again);
    }
    li.append(acts); ul.append(li);
  }
}
$("clear-history").onclick = async () => { try { await api("/history", { method: "DELETE" }); history = []; renderLibrary(); } catch (e) { setStatus(e.message); } };

// ---------------- start ----------------
updateTypingUI();
if (token) {
  api("/auth/me").then(d => { user = d.user; onAuthChange(); }).catch(() => { token = null; store.set("anuvaadToken", null); });
}
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
