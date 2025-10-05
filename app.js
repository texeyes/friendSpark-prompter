// FriendSpark Prompter - Complete JS with "Reply-then-Pivot" grounding
// All logic runs on-device. No network calls.

// -------------------------------
// Utility: DOM
// -------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// -------------------------------
// Tone Profiles
// -------------------------------
const TONE_PROFILES = {
  warm: {
    maxSentences: 2,
    emojiAllowed: false,
    style: "empathetic and caring",
    hedges: ["I think", "Maybe", "Perhaps"],
    openers: ["Thanks for sharing that—", "I appreciate you telling me—", "That sounds—"]
  },
  playful: {
    maxSentences: 2,
    emojiAllowed: true,
    style: "lighthearted and fun",
    hedges: ["totally", "definitely"],
    openers: ["Haha", "Oh wow", "That's so cool"]
  },
  curious: {
    maxSentences: 2,
    emojiAllowed: false,
    style: "inquisitive and engaged",
    hedges: ["I wonder", "I'm curious"],
    openers: ["What surprised you most about", "How did you feel when", "What was the best part of"]
  },
  supportive: {
    maxSentences: 2,
    emojiAllowed: false,
    style: "compassionate and reassuring",
    hedges: ["It sounds like", "I can imagine"],
    openers: ["I'm here for you—", "That must have been—", "I understand how—"]
  },
  brief: {
    maxSentences: 1,
    emojiAllowed: false,
    style: "concise and direct",
    hedges: [],
    openers: ["Nice—", "Got it—", "Heard—"]
  }
};

// -------------------------------
// State
// -------------------------------
const state = {
  tone: localStorage.getItem("fs_tone") || "warm",
  sincerity: Number(localStorage.getItem("fs_sincerity") || 7),
  directness: Number(localStorage.getItem("fs_directness") || 6),
  variants: [],
  debounce: null
};

// -------------------------------
// Heuristics: Analyze message (regex-only)
// -------------------------------
function analyzeMessage(text) {
  const t = (text || "").trim();
  const sentences = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  const first = sentences[0] || t;

  // Gist: remove fillers, clamp to ~16 tokens
  const gist = first
    .replace(/\b(like|just|really|literally|basically|kinda|sort of)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 16)
    .join(" ");

  // Proper-noun runs (naive), places, activities, time cues
  const properRuns = [...t.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g)].map(m => m[1]); // heuristic proper nouns [web:42]
  const places = [...t.matchAll(/\b(park|cafe|coffee|downtown|office|airport|studio|gym|trail|museum|bar|restaurant|Yosemite|Big Bend)\b/gi)].map(m => m[0]);
  const activities = [...t.matchAll(/\b(hike|launch|interview|deadline|trip|move|show|setlist|pitch|demo|release|exam|presentation)\b/gi)].map(m => m[0]);
  const dates = [...t.matchAll(/\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/g)].map(m => m[0]);
  const days = [...t.matchAll(/\b(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day\b/gi)].map(m => m[0]);
  const times = [...t.matchAll(/\b(today|tonight|tomorrow|this weekend|next week|this week)\b/gi)].map(m => m[0]);

  // Sentiment/valence (very light)
  const pos = /\b(amazing|great|awesome|stoked|excited|fun|won|promoted|unreal)\b/i.test(t);
  const neg = /\b(tired|exhausted|anxious|worried|rough|hard|tough|sick|failed|late|wrecked)\b/i.test(t);
  const valenceAdj = pos ? "awesome" : (neg ? "tough" : "big");

  const primaryEntity = properRuns[0] || activities[0] || places[0] || "";
  const timeCue = times[0] || days[0] || dates[0] || "";

  // Fallback noun-ish token
  const headNoun = (t.match(/\b([a-z]{3,})\b/gi) || []).slice(-1)[0] || "";

  // Question target prefers entity > activity > place
  const questionTarget = primaryEntity || activities[0] || places[0] || "that";

  // Urgency
  const urgency = /!|sorry|asap|urgent/i.test(t);

  return {
    gist,
    primaryEntity,
    headNoun,
    valenceAdj,
    questionTarget,
    timeCue,
    urgency,
    source: t
  };
}

// -------------------------------
// Reflective listening builders
// -------------------------------
// Open with a paraphrase that uses friend content, then add ONE pivot (ask OR invite) [web:10][web:19]
function reflectiveOpener(cues) {
  const gistLower = cues.gist.toLowerCase();
  const topic = (cues.primaryEntity || cues.headNoun || "that").toLowerCase();
  const candidates = [
    `It sounds like ${gistLower}`,
    `So ${gistLower}`,
    `You’re saying ${gistLower}`
  ];
  const chosen = candidates.find(c => c.includes(topic)) || candidates[0];
  return chosen.replace(/\s*[.,-]*\s*$/, "") + "—";
}

function buildAsk(cues) {
  return cues.questionTarget && cues.questionTarget !== "that"
    ? `what was the best part of ${cues.questionTarget}?`
    : `what was the standout moment?`;
}

function buildInvite(cues) {
  if (cues.timeCue) return `want to catch up ${cues.timeCue} to hear more?`;
  return `up for a 15‑min call this week to swap details?`;
}

// Ensure output contains at least one grounded token from the source [web:16][web:33]
function validateGrounding(src, out, cues) {
  const must = (cues.primaryEntity || cues.headNoun || "").toLowerCase();
  if (!must) return true;
  return out.toLowerCase().includes(must);
}

// Minimal tone shaping
function applyTone(text, toneKey) {
  const tone = TONE_PROFILES[toneKey] || TONE_PROFILES.warm;
  let t = text;

  if (toneKey === "playful") {
    // Add a light emoji if positive valence
    if (!/[\u{1F300}-\u{1FAFF}]/u.test(t)) t = t.replace(/\?$/, " 🤔?");
  } else if (toneKey === "supportive") {
    if (!/if that helps\.$/.test(t)) t = t.replace(/\?$/, "? if that helps.");
  } else if (toneKey === "brief") {
    t = t.replace(/\s+/g, " ").trim();
  }

  // Sentence budget enforcement
  const max = tone.maxSentences;
  const parts = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (parts.length > max) t = parts.slice(0, max).join(" ");
  return t;
}

function buildReflectiveThenPivot(cues, toneKey, move) {
  const opener = reflectiveOpener(cues); // reflect first [web:10][web:19]
  const pivot = move === "ask" ? buildAsk(cues) : buildInvite(cues);
  let line = `${opener} that’s ${cues.valenceAdj}—${pivot}`;

  // Apply tone styling
  line = applyTone(line, toneKey);

  return line;
}

// -------------------------------
// Composer: 3 variants with rationale tags
// -------------------------------
function composeVariants(text, toneKey, params = {}) {
  const cues = analyzeMessage(text);

  // Build three candidates
  const raw = [
    buildReflectiveThenPivot(cues, toneKey, "ask"),
    buildReflectiveThenPivot(cues, toneKey, "invite"),
    buildReflectiveThenPivot(cues, toneKey, cues.urgency ? "ask" : "invite")
  ];

  // Grounding check and tagging
  const variants = raw.map(r => {
    let out = r;
    if (!validateGrounding(text, out, cues)) {
      // Try fallback grounding using headNoun if missing
      const fallbackCues = { ...cues, primaryEntity: cues.headNoun };
      out = buildReflectiveThenPivot(fallbackCues, toneKey, "ask");
    }
    const tags = out.match(/best part|standout/i)
      ? ["mirror-feeling", "ask-specific"]
      : ["mirror-feeling", "invite-micro-plan"];
    return { text: out, tags };
  });

  return variants;
}

// -------------------------------
// Web Share + Clipboard fallback (MDN pattern) [web:32][web:39]
// -------------------------------
async function shareText(text) {
  try {
    if (navigator.canShare && navigator.canShare({ text })) {
      await navigator.share({ title: "FriendSpark Reply", text });
      return true;
    }
  } catch (_) { /* fall through to clipboard */ }

  try {
    await navigator.clipboard.writeText(text);
    toast("Copied to clipboard");
    return true;
  } catch (e) {
    toast("Copy failed");
    return false;
  }
}

// -------------------------------
// UI Wiring
// -------------------------------
function initUI() {
  // Tone chips
  $$(".tone-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".tone-chip").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.tone = btn.dataset.tone;
      localStorage.setItem("fs_tone", state.tone);
      debouncedGenerate();
    });
  });

  // Sliders
  const sincerity = $("#sincerity");
  const directness = $("#directness");
  if (sincerity) {
    sincerity.value = state.sincerity;
    sincerity.addEventListener("input", () => {
      state.sincerity = Number(sincerity.value);
      localStorage.setItem("fs_sincerity", String(state.sincerity));
      debouncedGenerate();
    });
  }
  if (directness) {
    directness.value = state.directness;
    directness.addEventListener("input", () => {
      state.directness = Number(directness.value);
      localStorage.setItem("fs_directness", String(state.directness));
      debouncedGenerate();
    });
  }

  // Textarea input
  const ta = $("#message-input");
  if (ta) {
    ta.addEventListener("input", debouncedGenerate);
  }

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    // Cmd/Ctrl+Enter to generate
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      generate();
    }
    // 1/2/3 to copy variants
    if (["1", "2", "3"].includes(e.key)) {
      const idx = Number(e.key) - 1;
      const v = state.variants[idx];
      if (v) {
        navigator.clipboard.writeText(v.text).then(() => toast("Copied"));
      }
    }
  });

  // Initial render
  generate();
}

function debouncedGenerate() {
  if (state.debounce) clearTimeout(state.debounce);
  state.debounce = setTimeout(generate, 500);
}

function generate() {
  const input = $("#message-input")?.value || "";
  renderSkeletons();
  if (!input.trim()) {
    state.variants = [];
    renderResults([]);
    return;
  }
  const variants = composeVariants(input, state.tone, {
    sincerity: state.sincerity,
    directness: state.directness
  });
  state.variants = variants;
  renderResults(variants);
}

// -------------------------------
function renderSkeletons() {
  const out = $("#output");
  if (!out) return;
  out.innerHTML = `
    <div class="skeleton card"></div>
    <div class="skeleton card"></div>
    <div class="skeleton card"></div>
  `;
}

function renderResults(variants) {
  const out = $("#output");
  if (!out) return;
  if (!variants.length) {
    out.innerHTML = `<div class="empty">Paste a message to get 3 grounded replies.</div>`;
    return;
  }
  out.innerHTML = variants
    .map((v, i) => renderSuggestionCard(v, i))
    .join("");

  // Wire buttons
  variants.forEach((v, i) => {
    $(`#copy-${i}`)?.addEventListener("click", async () => {
      await navigator.clipboard.writeText(v.text);
      toast("Copied");
    });
    $(`#share-${i}`)?.addEventListener("click", async () => {
      await shareText(v.text);
    });
    $(`#card-${i}`)?.addEventListener("click", () => {
      openCardModal(v);
    });
  });

  // Announce for screen readers
  const live = $("#results-live");
  if (live) {
    live.textContent = "Results ready";
  }
}

function renderSuggestionCard(variant, idx) {
  const pills = variant.tags.map(t => `<span class="tag">${t}</span>`).join(" ");
  return `
    <div class="card suggestion">
      <div class="suggestion-text">${escapeHtml(variant.text)}</div>
      <div class="rationales">${pills}</div>
      <div class="actions">
        <button id="copy-${idx}" class="btn">Copy</button>
        <button id="share-${idx}" class="btn">Share</button>
        <button id="card-${idx}" class="btn btn-secondary">Make Reply Card</button>
      </div>
    </div>
  `;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[m]));
}

// -------------------------------
// Reply Card (Canvas) - minimal
// -------------------------------
function openCardModal(variant) {
  const modal = $("#card-modal");
  if (!modal) return;
  modal.classList.add("open");
  const canvas = $("#card-canvas");
  drawCard(canvas, {
    title: "FriendSpark Reply",
    body: variant.text,
    tags: variant.tags,
    palette: ["#2563eb", "#22c55e"]
  });

  $("#card-close")?.addEventListener("click", () => modal.classList.remove("open"));
  $("#card-export")?.addEventListener("click", async () => {
    canvas.toBlob((blob) => {
      const a = document.createElement("a");
      a.download = "friendspark-reply.png";
      a.href = URL.createObjectURL(blob);
      a.click();
      URL.revokeObjectURL(a.href);
    });
  });
}

function drawCard(canvas, { title, body, tags, palette }) {
  const w = 1080, h = 1350;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");

  // Gradient bg
  const g = ctx.createLinearGradient(0,0,w,h);
  g.addColorStop(0, palette[0]);
  g.addColorStop(1, palette[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0,0,w,h);

  // Title
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 56px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText(title, 60, 100);

  // Body (wrapped)
  ctx.font = "40px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  const lines = wrapText(ctx, body, 60, 180, w - 120, 56);
  lines.forEach((line, i) => ctx.fillText(line, 60, 180 + i*56));

  // Tags
  ctx.font = "28px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  const tagStr = tags.join(" · ");
  ctx.fillText(tagStr, 60, h - 120);

  // Footer
  ctx.font = "26px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText(new Date().toLocaleDateString(), w - 260, h - 60);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  words.forEach(word => {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  });
  if (line) lines.push(line);
  return lines.slice(0, 18); // clamp
}

// -------------------------------
// Toast
// -------------------------------
function toast(msg) {
  let el = $("#toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 1600);
}

// -------------------------------
// Init
// -------------------------------
document.addEventListener("DOMContentLoaded", initUI);
