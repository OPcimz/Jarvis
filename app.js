/* Mark LII — public console
 * Talks to Supabase directly (no backend) via the anon key, same tables
 * the assistant reads/writes to on your PC. See supabase_schema.sql.
 */

const LS_URL = "marklii_supabase_url";
const LS_KEY = "marklii_supabase_key";

let sb = null;

function initSupabase() {
  const url = localStorage.getItem(LS_URL);
  const key = localStorage.getItem(LS_KEY);
  if (!url || !key) return false;
  sb = window.supabase.createClient(url, key);
  return true;
}

function showSetup() {
  document.getElementById("setup").classList.remove("hidden");
  document.getElementById("app").classList.add("hidden");
}

function showApp() {
  document.getElementById("setup").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
}

document.getElementById("setupSave").addEventListener("click", () => {
  const url = document.getElementById("setupUrl").value.trim().replace(/\/$/, "");
  const key = document.getElementById("setupKey").value.trim();
  if (!url || !key) return;
  localStorage.setItem(LS_URL, url);
  localStorage.setItem(LS_KEY, key);
  location.reload();
});

async function checkConnection() {
  const el = document.getElementById("connStatus");
  try {
    const { error } = await sb.from("tasks").select("id", { count: "exact", head: true });
    if (error) throw error;
    el.classList.add("ok");
    el.querySelector(".status-text").textContent = "connected";
  } catch (e) {
    el.classList.remove("ok");
    el.querySelector(".status-text").textContent = "connection failed";
    console.error(e);
  }
}

/* ── Tabs ─────────────────────────────────────────────────────────────── */

document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "system") loadSystemStatus();
  });
});

/* ── Books ────────────────────────────────────────────────────────────── */

let booksCache = {}; // { title: { video: [notes...] } }

async function loadBooks() {
  const { data, error } = await sb
    .from("book_notes")
    .select("book_title,video_label,notes,created_at")
    .order("created_at", { ascending: true });
  if (error) { console.error(error); return; }

  booksCache = {};
  for (const row of data) {
    const b = row.book_title, v = row.video_label || "General";
    booksCache[b] ??= {};
    booksCache[b][v] ??= [];
    booksCache[b][v].push(row.notes);
  }
  renderBookGrid();
}

function renderBookGrid() {
  const grid = document.getElementById("bookGrid");
  const empty = document.getElementById("bookEmpty");
  grid.innerHTML = "";
  const titles = Object.keys(booksCache);
  empty.classList.toggle("hidden", titles.length > 0);

  for (const title of titles) {
    const videoCount = Object.keys(booksCache[title]).length;
    const btn = document.createElement("button");
    btn.className = "grid-btn";
    btn.innerHTML = `${escapeHtml(title)}<span class="count">${videoCount} video${videoCount === 1 ? "" : "s"}</span>`;
    btn.addEventListener("click", () => openBook(title));
    grid.appendChild(btn);
  }
}

function openBook(title) {
  document.getElementById("bookGrid").classList.add("hidden");
  document.getElementById("bookEmpty").classList.add("hidden");
  document.getElementById("noteView").classList.add("hidden");
  const view = document.getElementById("videoView");
  view.classList.remove("hidden");
  document.getElementById("videoBookTitle").textContent = title;

  const grid = document.getElementById("videoGrid");
  grid.innerHTML = "";
  for (const video of Object.keys(booksCache[title])) {
    const count = booksCache[title][video].length;
    const btn = document.createElement("button");
    btn.className = "grid-btn";
    btn.innerHTML = `${escapeHtml(video)}<span class="count">${count} point${count === 1 ? "" : "s"}</span>`;
    btn.addEventListener("click", () => openVideo(title, video));
    grid.appendChild(btn);
  }
}

function openVideo(title, video) {
  document.getElementById("videoView").classList.add("hidden");
  const view = document.getElementById("noteView");
  view.classList.remove("hidden");
  document.getElementById("noteVideoTitle").textContent = `${title} — ${video}`;

  const list = document.getElementById("noteList");
  list.innerHTML = "";
  for (const note of booksCache[title][video]) {
    const li = document.createElement("li");
    li.textContent = note;
    list.appendChild(li);
  }
}

document.getElementById("backToBooks").addEventListener("click", () => {
  document.getElementById("videoView").classList.add("hidden");
  document.getElementById("bookGrid").classList.remove("hidden");
  renderBookGrid();
});
document.getElementById("backToVideos").addEventListener("click", () => {
  document.getElementById("noteView").classList.add("hidden");
  document.getElementById("videoView").classList.remove("hidden");
});

/* ── Scheduler ────────────────────────────────────────────────────────── */

async function loadTasks() {
  const [{ data: habits, error: e1 }, { data: oneOff, error: e2 }] = await Promise.all([
    sb.from("tasks").select("id,description,due_time,recurrence")
      .eq("status", "pending").neq("recurrence", "none")
      .order("due_time", { ascending: true }),
    sb.from("tasks").select("id,description,due_date,due_time,status")
      .eq("recurrence", "none")
      .order("due_date", { ascending: true }).order("due_time", { ascending: true }),
  ]);
  if (e1 || e2) { console.error(e1 || e2); return; }

  const habitList = document.getElementById("habitList");
  habitList.innerHTML = "";
  if (habits && habits.length) {
    const label = document.createElement("div");
    label.className = "section-label";
    label.textContent = "Daily habits";
    habitList.appendChild(label);
    for (const h of habits) {
      const row = document.createElement("div");
      row.className = "task-row";
      row.innerHTML = `
        <span class="task-when">${escapeHtml((h.due_time || "").slice(0, 5))}</span>
        <span class="task-desc">${escapeHtml(h.description)}</span>
        <span class="recur-badge">${escapeHtml(h.recurrence)}</span>
        <button class="task-done">Remove</button>
      `;
      row.querySelector(".task-done").addEventListener("click", async () => {
        await sb.from("tasks").delete().eq("id", h.id);
        loadTasks();
      });
      habitList.appendChild(row);
    }
  }

  const list = document.getElementById("taskList");
  const empty = document.getElementById("taskEmpty");
  list.innerHTML = "";
  const data = oneOff || [];
  empty.classList.toggle("hidden", data.length > 0 || (habits && habits.length > 0));

  for (const t of data) {
    const row = document.createElement("div");
    row.className = "task-row" + (t.status === "done" ? " done" : "");
    const when = [t.due_date || "", (t.due_time || "").slice(0, 5)].filter(Boolean).join(" ");
    row.innerHTML = `
      <span class="task-when">${escapeHtml(when || "—")}</span>
      <span class="task-desc">${escapeHtml(t.description)}</span>
      <button class="task-done">${t.status === "done" ? "Undo" : "Done"}</button>
    `;
    row.querySelector(".task-done").addEventListener("click", async () => {
      await sb.from("tasks").update({ status: t.status === "done" ? "pending" : "done" }).eq("id", t.id);
      loadTasks();
    });
    list.appendChild(row);
  }
}

document.getElementById("taskForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const description = document.getElementById("taskDesc").value.trim();
  const repeat = document.getElementById("taskRepeat").value;
  const due_time = document.getElementById("taskTime").value || null;
  if (!description) return;

  const row = { description, due_time, status: "pending" };
  if (repeat === "none") {
    row.due_date = document.getElementById("taskDate").value || new Date().toISOString().slice(0, 10);
    row.recurrence = "none";
  } else {
    row.due_date = null;
    row.recurrence = repeat;
  }
  const { error } = await sb.from("tasks").insert(row);
  if (error) { console.error(error); return; }
  e.target.reset();
  document.getElementById("taskDate").value = new Date().toISOString().slice(0, 10);
  loadTasks();
});

/* ── Phone ────────────────────────────────────────────────────────────── */

let lastOutboxId = 0;
let lastInboxId = 0;

function addChatMsg(kind, text) {
  const log = document.getElementById("chatLog");
  const div = document.createElement("div");
  div.className = "msg msg-" + kind;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return div;
}

async function loadPhoneHistory() {
  const [{ data: inbox }, { data: outbox }] = await Promise.all([
    sb.from("phone_inbox").select("id,message,created_at").order("created_at", { ascending: true }).limit(30),
    sb.from("phone_outbox").select("id,message,created_at").order("created_at", { ascending: true }).limit(30),
  ]);
  const merged = [
    ...(inbox || []).map(r => ({ ...r, kind: "user" })),
    ...(outbox || []).map(r => ({ ...r, kind: "mark" })),
  ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  document.getElementById("chatLog").innerHTML = "";
  merged.forEach(m => addChatMsg(m.kind, m.message));

  lastInboxId = Math.max(0, ...(inbox || []).map(r => r.id));
  lastOutboxId = Math.max(0, ...(outbox || []).map(r => r.id));
}

async function pollOutbox() {
  const { data } = await sb
    .from("phone_outbox")
    .select("id,message,created_at")
    .gt("id", lastOutboxId)
    .order("id", { ascending: true });
  if (!data || !data.length) return;
  for (const row of data) {
    addChatMsg("mark", row.message);
    lastOutboxId = row.id;
    if (document.getElementById("speakReplies").checked) speak(row.message);
  }
}
setInterval(() => { if (sb) pollOutbox(); }, 4000);

document.getElementById("chatForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  addChatMsg("user", text);
  addChatMsg("sys", "Sent — Mark LII will pick this up next time it's running on your PC.");
  const { error } = await sb.from("phone_inbox").insert({ message: text, processed: false });
  if (error) console.error(error);
});

/* Speech-to-text (mic button) and text-to-speech (reply readback). Both are
 * plain browser APIs — graceful no-op on browsers without support. */

const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
const micBtn = document.getElementById("micBtn");
if (SpeechRec) {
  const rec = new SpeechRec();
  rec.continuous = false;
  rec.interimResults = false;
  rec.onresult = (e) => {
    document.getElementById("chatInput").value = e.results[0][0].transcript;
    micBtn.classList.remove("live");
  };
  rec.onend = () => micBtn.classList.remove("live");
  micBtn.addEventListener("click", () => {
    micBtn.classList.add("live");
    rec.start();
  });
} else {
  micBtn.style.display = "none";
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  window.speechSynthesis.speak(u);
}

/* ── System ───────────────────────────────────────────────────────────── */

function fmtAgo(iso) {
  const secs = (Date.now() - new Date(iso).getTime()) / 1000;
  if (secs < 60) return `${Math.floor(secs)}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

function setBar(el, pct, warnAt = 75, dangerAt = 90) {
  el.style.width = Math.min(100, Math.max(0, pct)) + "%";
  el.classList.toggle("warn", pct >= warnAt && pct < dangerAt);
  el.classList.toggle("danger", pct >= dangerAt);
}

async function loadSystemStatus() {
  const { data, error } = await sb.from("kv_store").select("value").eq("key", "pc_status").maybeSingle();
  if (error || !data) {
    document.getElementById("sysUpdated").textContent = "No status synced yet — open Mark LII on your PC first.";
    return;
  }
  const s = data.value;
  const stale = (Date.now() - new Date(s.updated_at).getTime()) > 60000;
  document.getElementById("sysOffline").classList.toggle("hidden", !stale);
  document.getElementById("sysUpdated").textContent = "Last synced " + fmtAgo(s.updated_at);

  document.getElementById("statCpu").textContent = `${s.cpu_percent ?? "—"}%`;
  setBar(document.getElementById("barCpu"), s.cpu_percent ?? 0);

  document.getElementById("statMem").textContent = `${s.ram_percent ?? "—"}% (${s.ram_used_gb ?? "?"}/${s.ram_total_gb ?? "?"} GB)`;
  setBar(document.getElementById("barMem"), s.ram_percent ?? 0);

  document.getElementById("statNet").textContent = s.net_mbps != null
    ? (s.net_mbps < 1 ? `${(s.net_mbps * 1024).toFixed(0)} KB/s` : `${s.net_mbps.toFixed(1)} MB/s`)
    : "—";
  document.getElementById("statGpu").textContent = s.gpu_percent != null ? `${s.gpu_percent}%` : "N/A";
  document.getElementById("statTmp").textContent = s.cpu_temp_c != null ? `${s.cpu_temp_c}°C` : "N/A";
  document.getElementById("statUptime").textContent = s.uptime || "—";
  document.getElementById("statProc").textContent = s.process_count ?? "—";
  document.getElementById("statOs").textContent = s.os || "—";
  document.getElementById("statMic").textContent = s.muted ? "Muted" : "Live";
}
setInterval(() => { if (sb && document.getElementById("tab-system").classList.contains("active")) loadSystemStatus(); }, 10000);

/* ── Utils ────────────────────────────────────────────────────────────── */

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ── Boot ─────────────────────────────────────────────────────────────── */

(function boot() {
  if (!initSupabase()) { showSetup(); return; }
  showApp();
  checkConnection();
  loadBooks();
  loadTasks();
  loadPhoneHistory();
  // Prefill today's date in the quick-add form.
  document.getElementById("taskDate").value = new Date().toISOString().slice(0, 10);
})();
