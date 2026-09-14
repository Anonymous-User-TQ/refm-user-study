/* Motion retargeting user study — front end.
 *
 * Design notes that matter for the validity of the results:
 *  - Method identity is never exposed to the participant. Each clip gets a
 *    fresh random permutation of methods onto the letters A, B, C, ..., so
 *    neither position nor label leaks which method produced a video.
 *  - The permutation is stored with the response, so the mapping is
 *    recoverable at analysis time.
 *  - Ties are permitted by design: ranks are chosen independently per method
 *    rather than by ordering a list.
 *  - Nothing is transmitted until the participant submits.
 */
"use strict";

const CFG = window.STUDY_CONFIG || {};
const CRITERIA = [
  { key: "overall", label: "Overall quality",
    hint: "Which is the best animation overall?" },
  { key: "penetration", label: "Self-penetration",
    hint: "Least body-through-body intersection first." },
  { key: "semantic", label: "Semantic preservation",
    hint: "Which best preserves the same action as the reference?" },
];
const STORAGE_KEY = "refm-user-study-session-v1";

const state = {
  manifest: null,
  participantId: null,
  startedAt: null,
  clips: [],        // [{ id, file, letters: [{letter, method}] }]
  responses: [],    // responses[i] = { overall: {method: rank}, ... }
  index: 0,
};

/* ------------------------------------------------------------------ utils */

const $ = (id) => document.getElementById(id);

function shuffled(items) {
  // Fisher-Yates with crypto randomness, so the permutation is not predictable
  // from a seed a participant could influence.
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function uuid() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function show(screenId) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.add("hidden"));
  $(screenId).classList.remove("hidden");
  window.scrollTo(0, 0);
}

/* --------------------------------------------------------------- session */

function buildSession(manifest) {
  const methods = Object.keys(manifest.methods);
  const wanted = Number(CFG.clipsPerParticipant) || 0;
  let pool = shuffled(manifest.clips);
  if (wanted > 0 && wanted < pool.length) pool = pool.slice(0, wanted);

  return pool.map((clip) => {
    const order = shuffled(methods);
    return {
      id: clip.id,
      file: clip.file,
      // letters[i].letter is what the participant sees; .method is the truth.
      letters: order.map((method, i) => ({
        letter: String.fromCharCode(65 + i),
        method,
      })),
    };
  });
}

function saveSession() {
  if (!CFG.allowResume) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      participantId: state.participantId,
      startedAt: state.startedAt,
      clips: state.clips,
      responses: state.responses,
      index: state.index,
    }));
  } catch (_) { /* storage disabled; resume simply won't work */ }
}

function loadSession() {
  if (!CFG.allowResume) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const s = JSON.parse(raw);
    if (!Array.isArray(s.clips) || s.clips.length === 0) return null;
    return s;
  } catch (_) { return null; }
}

function clearSession() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (_) { /* ignore */ }
}

/* ------------------------------------------------------------------- UI */

function videoPath(method, file) {
  const root = state.manifest.videoRoot || "videos";
  return `${root}/${method}/${encodeURIComponent(file)}`;
}

function renderClip() {
  const clip = state.clips[state.index];
  const total = state.clips.length;

  $("clip-index").textContent = String(state.index + 1);
  $("clip-total").textContent = String(total);
  $("progress-fill").style.width = `${((state.index) / total) * 100}%`;
  $("btn-back").disabled = state.index === 0;
  $("btn-next").textContent =
    state.index === total - 1 ? "Finish" : "Next clip";

  const ref = $("video-reference");
  ref.src = videoPath(state.manifest.reference, clip.file);
  ref.load();

  // Video grid, labelled by letter only.
  const grid = $("video-grid");
  grid.textContent = "";
  clip.letters.forEach(({ letter, method }) => {
    const cell = document.createElement("div");
    cell.className = "cell";

    const tag = document.createElement("div");
    tag.className = "tag";
    tag.textContent = letter;

    const v = document.createElement("video");
    v.src = videoPath(method, clip.file);
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = "auto";
    v.setAttribute("aria-label", `Result ${letter}`);

    cell.append(tag, v);
    grid.append(cell);
  });

  renderRankingBlocks(clip);
  playAll();
}

function renderRankingBlocks(clip) {
  const host = $("ranking-blocks");
  host.textContent = "";
  const saved = state.responses[state.index] || {};
  const n = clip.letters.length;

  CRITERIA.forEach((crit) => {
    const block = document.createElement("fieldset");
    block.className = "rank-block";

    const legend = document.createElement("legend");
    legend.textContent = crit.label;
    block.append(legend);

    const hint = document.createElement("p");
    hint.className = "muted small";
    hint.textContent = `${crit.hint} Rank 1 is best. Ties are allowed.`;
    block.append(hint);

    const rows = document.createElement("div");
    rows.className = "rank-rows";

    clip.letters.forEach(({ letter, method }) => {
      const row = document.createElement("div");
      row.className = "rank-row";

      const name = document.createElement("span");
      name.className = "rank-label";
      name.textContent = letter;
      row.append(name);

      const opts = document.createElement("div");
      opts.className = "rank-options";
      for (let r = 1; r <= n; r++) {
        const id = `${crit.key}-${letter}-${r}`;
        const input = document.createElement("input");
        input.type = "radio";
        input.name = `${crit.key}-${letter}`;
        input.id = id;
        input.value = String(r);
        if (saved[crit.key] && saved[crit.key][method] === r) input.checked = true;
        input.addEventListener("change", () => {
          captureCurrent();
          updateValidation();
        });

        const lab = document.createElement("label");
        lab.setAttribute("for", id);
        lab.textContent = String(r);
        lab.title = r === 1 ? "Best" : (r === n ? "Worst" : `Rank ${r}`);

        opts.append(input, lab);
      }
      row.append(opts);
      rows.append(row);
    });

    block.append(rows);
    host.append(block);
  });

  updateValidation();
}

function captureCurrent() {
  const clip = state.clips[state.index];
  const out = {};
  CRITERIA.forEach((crit) => {
    out[crit.key] = {};
    clip.letters.forEach(({ letter, method }) => {
      const sel = document.querySelector(
        `input[name="${crit.key}-${letter}"]:checked`);
      if (sel !== null) out[crit.key][method] = Number(sel.value);
    });
  });
  state.responses[state.index] = out;
  saveSession();
}

function missingCriteria() {
  const clip = state.clips[state.index];
  const r = state.responses[state.index] || {};
  return CRITERIA.filter((crit) => {
    const got = r[crit.key] ? Object.keys(r[crit.key]).length : 0;
    return got < clip.letters.length;
  });
}

function updateValidation() {
  const missing = missingCriteria();
  const el = $("validation");
  if (missing.length === 0) {
    el.textContent = "";
    el.classList.remove("warn");
    $("btn-next").disabled = false;
  } else {
    el.textContent = `Rank every result under: ${missing.map((m) => m.label).join(", ")}`;
    el.classList.add("warn");
    $("btn-next").disabled = true;
  }
}

/* ------------------------------------------------------ video transport */

function allVideos() {
  return [$("video-reference"), ...document.querySelectorAll("#video-grid video")];
}

function playAll() {
  allVideos().forEach((v) => {
    v.currentTime = 0;
    const p = v.play();
    // Autoplay can be refused; the participant can press Replay all.
    if (p !== undefined && typeof p.catch === "function") p.catch(() => {});
  });
}

function pauseAll() { allVideos().forEach((v) => v.pause()); }

/* --------------------------------------------------------------- submit */

function buildPayload() {
  return {
    schema: "refm-user-study/v1",
    participantId: state.participantId,
    startedAt: state.startedAt,
    submittedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    expertise: $("q-expertise").value,
    comments: $("q-comments").value.slice(0, 2000),
    criteria: CRITERIA.map((c) => c.key),
    // One entry per clip. `order` records the letter the participant saw for
    // each method, so the blinding is fully reconstructible.
    clips: state.clips.map((clip, i) => ({
      clipId: clip.id,
      order: Object.fromEntries(clip.letters.map((x) => [x.method, x.letter])),
      ranks: state.responses[i] || {},
    })),
  };
}

function downloadPayload(payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)],
                        { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `response-${payload.participantId}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function submit() {
  const btn = $("btn-submit");
  const status = $("submit-status");
  btn.disabled = true;
  status.textContent = "Submitting…";
  status.className = "status";

  const payload = buildPayload();
  const endpoint = (CFG.submitEndpoint || "").trim();

  if (endpoint === "") {
    downloadPayload(payload);
    clearSession();
    $("done-message").textContent =
      "Your responses were saved to a file in your downloads. Please send that file to the study organiser.";
    show("screen-done");
    return;
  }

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`server responded ${res.status}`);
    clearSession();
    $("done-message").textContent = "Your responses have been recorded.";
    show("screen-done");
  } catch (err) {
    if (CFG.downloadOnFailure !== false) {
      downloadPayload(payload);
      clearSession();
      $("done-message").textContent =
        "We could not reach the server, so your responses were saved to a file in your downloads instead. Please send that file to the study organiser.";
      show("screen-done");
    } else {
      status.textContent = `Submission failed: ${err.message}. Please try again.`;
      status.className = "status error";
      btn.disabled = false;
    }
  }
}

/* ----------------------------------------------------------------- init */

function startTask() {
  show("screen-task");
  renderClip();
}

async function init() {
  let manifest;
  try {
    const res = await fetch("assets/clips.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    manifest = await res.json();
  } catch (err) {
    document.body.innerHTML =
      `<div class="wrap narrow"><h1>Setup incomplete</h1>
       <p>Could not load <code>assets/clips.json</code> (${err.message}).</p>
       <p>Run <code>python3 scripts/build_manifest.py</code> and redeploy.</p></div>`;
    return;
  }
  state.manifest = manifest;

  const nMethods = Object.keys(manifest.methods).length;
  $("intro-n-methods").textContent = String(nMethods);
  $("intro-duration").textContent = String(CFG.estimatedMinutes || 15);

  const prior = loadSession();
  if (prior !== null) {
    $("resume-note").textContent =
      `You have an unfinished session (clip ${prior.index + 1} of ${prior.clips.length}). Starting will resume it.`;
    $("resume-note").classList.remove("hidden");
  }

  $("consent-box").addEventListener("change", (e) => {
    $("btn-start").disabled = !e.target.checked;
  });

  $("btn-start").addEventListener("click", () => {
    if (prior !== null) {
      state.participantId = prior.participantId;
      state.startedAt = prior.startedAt;
      state.clips = prior.clips;
      state.responses = prior.responses;
      state.index = Math.min(prior.index, prior.clips.length - 1);
    } else {
      state.participantId = uuid();
      state.startedAt = new Date().toISOString();
      state.clips = buildSession(manifest);
      state.responses = [];
      state.index = 0;
    }
    saveSession();
    startTask();
  });

  $("btn-next").addEventListener("click", () => {
    captureCurrent();
    if (missingCriteria().length > 0) { updateValidation(); return; }
    if (state.index === state.clips.length - 1) {
      pauseAll();
      show("screen-submit");
      return;
    }
    state.index += 1;
    saveSession();
    renderClip();
  });

  $("btn-back").addEventListener("click", () => {
    captureCurrent();
    if (state.index === 0) return;
    state.index -= 1;
    saveSession();
    renderClip();
  });

  $("btn-replay").addEventListener("click", playAll);
  $("btn-pause").addEventListener("click", pauseAll);
  $("btn-help").addEventListener("click", () => $("help-modal").classList.remove("hidden"));
  $("btn-help-close").addEventListener("click", () => $("help-modal").classList.add("hidden"));
  $("btn-submit").addEventListener("click", submit);
  $("btn-download").addEventListener("click", () => downloadPayload(buildPayload()));
}

document.addEventListener("DOMContentLoaded", init);
