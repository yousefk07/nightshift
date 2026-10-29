#!/usr/bin/env node
// nightshift: the terminal side of Nightshift. Same account, bots, approvals and bot room as the web app.
// No dependencies; needs Node 20+. Settings live in ~/.nightshift/config.json.

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";

const DIR = join(homedir(), ".nightshift");
const FILE = join(DIR, "config.json");
const DEFAULT_URL = process.env.NIGHTSHIFT_URL || "https://nightshift-gold-nine.vercel.app";
const tty = process.stdout.isTTY;
const c = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const dim = c(2), bold = c(1), cyan = c(36), yellow = c(33), green = c(32), red = c(31);
const GLYPH = { working: green("●"), needs_you: yellow("▲"), idle: dim("○"), blocked: red("■"), failed: red("✕"), paused: dim("‖") };

const load = () => {
  try { return JSON.parse(readFileSync(FILE, "utf8")); } catch { return {}; }
};
const save = (cfg) => {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(cfg, null, 2));
  try { chmodSync(FILE, 0o600); } catch {}
};
const die = (msg) => { console.error(red(msg)); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, { method = "GET", json, stream, anon } = {}) {
  const cfg = load();
  const url = (cfg.url || DEFAULT_URL).replace(/\/+$/, "");
  if (!anon && !cfg.token) die("Not signed in. Run: nightshift login");
  const res = await fetch(url + path, {
    method,
    headers: { ...(anon ? {} : { Authorization: `Bearer ${cfg.token}` }), ...(json ? { "Content-Type": "application/json" } : {}) },
    body: json ? JSON.stringify(json) : undefined,
  });
  if (stream) {
    if (!res.ok) die(`${res.status}: ${await res.text()}`);
    return res;
  }
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { error: text }; }
  if (!res.ok && res.status !== 202) die(`${res.status}: ${body.error ?? text}`);
  return body;
}

const openBrowser = (url) => {
  const cmd = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try { spawn(cmd[0], cmd[1], { stdio: "ignore", detached: true }).unref(); } catch {}
};

// Reads an NDJSON stream from /api/chat or /run: text as it arrives, tool use and status as dim lines.
async function follow(res) {
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "", done = null, atLineStart = true;
  const out = (s) => { process.stdout.write(s); atLineStart = s.endsWith("\n"); };
  const line = (s) => { if (!atLineStart) out("\n"); out(s + "\n"); };
  for (;;) {
    const { value, done: end } = await reader.read();
    if (end) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const raw = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!raw) continue;
      const e = JSON.parse(raw);
      if (e.type === "text") out(e.delta);
      else if (e.type === "tool") line(dim(`  · ${e.name}`));
      else if (e.type === "action") line(yellow(`  ▲ needs your approval: ${e.title}${e.risk === "money" ? " (money)" : ""}`));
      else if (e.type === "room") line(dim(`  ↗ bot room: ${e.text}`));
      else if (e.type === "stopped") line(yellow(`  paused: ${e.reason}`));
      else if (e.type === "error") line(red(e.error));
      else if (e.type === "done") done = e;
    }
  }
  if (!atLineStart) out("\n");
  if (done?.actions?.length) console.log(dim(`  ${done.actions.length} waiting: nightshift queue`));
  return done;
}

const money = (cents, cur) => (cents == null ? "" : `${(cents / 100).toLocaleString("en-US", { style: "currency", currency: cur || "USD" })}`);
const ago = (iso) => {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  return m < 1 ? "now" : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};
const clock = (iso) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

// Finds a hired bot by id, persona name or role ("sage", "Penny", "invoices").
async function botId(word) {
  if (!word) die("Say which bot (nightshift status lists them).");
  const { desks } = await api("/api/office");
  const w = word.toLowerCase();
  const hit = desks.find((d) => d.kind === w || d.name.toLowerCase() === w || d.role.toLowerCase() === w);
  if (!hit) die(`No bot called ${word} on your team. Try: ${desks.map((d) => d.name.toLowerCase()).join(", ")}`);
  return hit;
}

function roomLine(m, bots) {
  const who = m.role === "owner" ? cyan("you") : m.role === "system" ? dim("nightshift") : bold((bots.find((b) => b.id === m.bot_id)?.name ?? "bot").toLowerCase());
  const tag = m.kind === "handoff" ? cyan(" → handoff") : m.kind === "hold" ? yellow(" ‖ hold") : "";
  return `${dim(clock(m.created_at))} ${who}${tag}  ${m.content}`;
}

const cmds = {
  // `nightshift login` opens the browser to approve this device; `login <url> <token>` uses a key you made.
  async login(urlOrNothing, token) {
    if (token?.startsWith("ns_")) {
      save({ url: urlOrNothing, token });
      const me = await api("/api/me");
      return console.log(green(`Signed in as ${me.user.email} (${me.workspace.name}).`));
    }
    const url = (urlOrNothing && urlOrNothing.startsWith("http") ? urlOrNothing : load().url) || DEFAULT_URL;
    save({ url });
    const code = await api("/api/device/code", { method: "POST", json: { device: `${hostname()}`.slice(0, 60) }, anon: true });
    console.log(`Approve this device in your browser: ${bold(code.verification_url)}`);
    console.log(`Code: ${bold(code.user_code)}`);
    openBrowser(code.verification_url);
    const until = Date.now() + code.expires_in * 1000;
    while (Date.now() < until) {
      await sleep(code.interval * 1000);
      const r = await api("/api/device/token", { method: "POST", json: { device_code: code.device_code }, anon: true });
      if (r.token) {
        save({ url, token: r.token });
        const me = await api("/api/me");
        return console.log(green(`Signed in as ${me.user.email} (${me.workspace.name}).`));
      }
    }
    die("The code expired. Run nightshift login again.");
  },
  logout() {
    save({ url: load().url });
    console.log("Signed out.");
  },

  async status() {
    const [me, office] = await Promise.all([api("/api/me"), api("/api/office")]);
    console.log(`${bold("nightshift")} · ${me.workspace.name.toLowerCase()}  ${clock(new Date())}  ${green("●")} ${office.working} working  ${office.waiting_total ? yellow(`▲ ${office.waiting_total} waiting`) : ""}`);
    for (const d of office.desks) {
      const next = d.status === "idle" && d.next_run_at ? dim(`  next check ${clock(d.next_run_at)}`) : "";
      console.log(`  ${GLYPH[d.status] ?? "○"} ${bold(d.name.toLowerCase().padEnd(10))} ${dim(d.role.padEnd(16))} ${d.status_text}${next}`);
    }
    if (!me.plan.active) console.log(red(`\nYour ${me.plan.name.toLowerCase()} has ended. Pick a plan in Settings → Billing.`));
  },

  async queue() {
    const desk = await api("/api/desk");
    if (!desk.queue.length) return console.log("All clear. Nothing is waiting for you.");
    console.log(dim(`${desk.queue.length} waiting · about ${desk.minutes} minute${desk.minutes === 1 ? "" : "s"}\n`));
    for (const q of desk.queue) console.log(`  ${bold(String(q.n).padStart(2))}  ${q.bot.toLowerCase().padEnd(10)} ${q.title}  ${q.risk === "money" ? yellow(money(q.amount_cents, q.currency)) : ""}`);
    console.log(dim("\nnightshift approve 1 2  ·  nightshift discard 3  ·  nightshift view 1"));
  },
  async view(n) {
    const { actions } = await api("/api/actions");
    const a = actions[Number(n) - 1] ?? die(`No item ${n}.`);
    console.log(bold(a.title));
    for (const [k, v] of Object.entries(a.payload)) console.log(`${dim(k.padEnd(12))} ${typeof v === "string" ? v.replace(/\n/g, "\n" + " ".repeat(13)) : JSON.stringify(v)}`);
  },
  async approve(...nums) {
    if (!nums.length) die("Usage: nightshift approve <n> [n ...]   (numbers from nightshift queue)");
    const { results } = await api("/api/actions/batch", { method: "POST", json: { decision: "approve", numbers: nums.map(Number) } });
    for (const r of results) console.log(r.error ? red(`✕ ${r.title ?? r.id}: ${r.error}`) : green(`✓ ${r.title}`) + dim(`  (sends in 8s · nightshift undo)`));
    save({ ...load(), lastApproved: results.filter((r) => !r.error).map((r) => r.id) });
  },
  async discard(...nums) {
    const { results } = await api("/api/actions/batch", { method: "POST", json: { decision: "discard", numbers: nums.map(Number) } });
    for (const r of results) console.log(r.error ? red(`✕ ${r.error}`) : `Discarded: ${r.title}`);
  },
  async undo() {
    const ids = load().lastApproved ?? [];
    if (!ids.length) die("Nothing to undo.");
    for (const id of ids) {
      const r = await fetch(`${load().url}/api/actions/${id}/undo`, { method: "POST", headers: { Authorization: `Bearer ${load().token}` } }).then((x) => x.json());
      console.log(r.error ? red(r.error) : "Taken back.");
    }
    save({ ...load(), lastApproved: [] });
  },
  async revise(n, ...words) {
    const { actions } = await api("/api/actions");
    const a = actions[Number(n) - 1] ?? die(`No item ${n}.`);
    await api(`/api/actions/${a.id}`, { method: "POST", json: { decision: "revise", note: words.join(" ") } });
    console.log("Sent back for changes. The new draft will show up in your queue.");
  },

  // `nightshift ask sage "..."`: the bot works on it and answers in the bot room.
  async ask(word, ...words) {
    const bot = await botId(word);
    if (!words.length) die('Usage: nightshift ask <bot> "what you want"');
    await api("/api/room", { method: "POST", json: { message: `@${bot.name} ${words.join(" ")}` } });
    console.log(`${bold(bot.name.toLowerCase())}: On it. I'll post results to the bot room and add them to tomorrow's brief.`);
  },
  async chat(word, ...words) {
    const bot = await botId(word);
    let thread_id;
    const send = async (message) => {
      const done = await follow(await api("/api/chat", { method: "POST", json: { bot: bot.kind, message, thread_id }, stream: true }));
      thread_id = done?.thread_id ?? thread_id;
    };
    if (words.length) return send(words.join(" "));
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    console.log(dim(`Chatting with ${bot.name}. Empty line to leave.`));
    for (;;) {
      const msg = (await rl.question(cyan("you › "))).trim();
      if (!msg) break;
      await send(msg);
    }
    rl.close();
  },
  async run(word, ...words) {
    const bot = await botId(word);
    await follow(await api(`/api/bots/${encodeURIComponent(bot.kind)}/run`, { method: "POST", json: words.length ? { task: words.join(" ") } : {}, stream: true }));
  },
  async pause(word) {
    const bot = await botId(word);
    await api(`/api/bots/${encodeURIComponent(bot.kind)}`, { method: "PATCH", json: { enabled: false } });
    console.log(`${bot.name} is paused.`);
  },
  async resume(word) {
    const bot = await botId(word);
    await api(`/api/bots/${encodeURIComponent(bot.kind)}`, { method: "PATCH", json: { enabled: true } });
    console.log(`${bot.name} is back on shift.`);
  },

  // The live bot room. Type a line to post it; "@nudge hold Harbor Café" gives a bot a job.
  async room(...words) {
    if (words.length) {
      const r = await api("/api/room", { method: "POST", json: { message: words.join(" ") } });
      return console.log(r.queued.length ? dim("Handed off; they'll answer here shortly.") : dim("Posted."));
    }
    const [{ messages, in_the_room, holds }, office] = await Promise.all([api("/api/room"), api("/api/office")]);
    console.log(`${bold("nightshift")} · bot-room  ${green("●")} ${office.working} working  ${office.needs_you.length ? yellow(`▲ ${office.needs_you.join(", ")} needs you`) : ""}`);
    for (const m of messages.slice(-30)) console.log(roomLine(m, in_the_room));
    if (holds.length) console.log(dim(`holds: ${holds.map((h) => `${h.label} (${h.by})`).join(", ")}`));
    if (!process.stdin.isTTY) return;
    const cfg = load();
    const res = await fetch(`${cfg.url}/api/stream?since=${encodeURIComponent(messages.at(-1)?.created_at ?? new Date().toISOString())}`, { headers: { Authorization: `Bearer ${cfg.token}` } });
    const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: cyan("› ") });
    rl.prompt();
    rl.on("line", async (l) => {
      if (l.trim()) await api("/api/room", { method: "POST", json: { message: l.trim() } });
      rl.prompt();
    });
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const event = block.match(/^event: (.+)$/m)?.[1], data = block.match(/^data: (.+)$/m)?.[1];
        if (!data) continue;
        const d = JSON.parse(data);
        const show = (s) => { process.stdout.write("\r\x1b[K" + s + "\n"); rl.prompt(true); };
        if (event === "message" && d.thread_id) show(roomLine(d, in_the_room));
        if (event === "bot" && d.status === "working" && /typing|Writing|Drafting/i.test(d.status_text)) show(dim(`${d.name.toLowerCase()} is ${d.status_text.toLowerCase()}…`));
        if (event === "action" && d.status === "pending") show(yellow(`▲ needs your approval: ${d.title} ${money(d.amount_cents, d.currency)}  (nightshift queue)`));
      }
    }
    rl.close();
  },

  async brief() {
    const { date, brief, final_at } = await api("/api/brief");
    if (!brief) return console.log(dim(`No brief for ${date} yet. It's written before ${final_at}.`));
    console.log(bold(brief.headline || `Morning brief · ${date}`) + (brief.status === "draft" ? dim(`  (draft · final at ${final_at})`) : ""));
    console.log(brief.content);
  },
  async flags() {
    const { flags } = await api("/api/flags");
    if (!flags.length) return console.log("No open flags.");
    for (const f of flags) console.log(`${[dim("·"), yellow("!"), red("!!")][f.importance - 1]} ${bold(f.title)} ${dim(ago(f.created_at))}\n    ${f.why}`);
  },
  async hire(id) {
    if (!id) {
      const { bots, industry } = await api("/api/catalog");
      console.log(dim(`Bots for ${industry} (nightshift hire <id>):\n`));
      for (const b of bots) console.log(`  ${b.hired ? green("✓") : b.suggested ? yellow("+") : " "} ${bold(b.name.padEnd(10))} ${b.role.padEnd(20)} ${dim(b.id)}${b.missing.length ? red(`  needs ${b.missing.join(", ")}`) : ""}`);
      return;
    }
    const { bot } = await api("/api/bots", { method: "POST", json: { kind: id } });
    console.log(green(`${bot.name} joined the team.`));
  },

  help() {
    console.log(`${bold("nightshift")}: your night shift, from the terminal

  login                        sign in (approves this device in your browser)
  status                       who's working, who needs you
  queue                        what's waiting, numbered
  approve <n> [n ...]          approve by number (8 seconds to undo)
  undo                         take back what you just approved
  discard <n> · view <n>       discard or read one
  revise <n> <what to change>  "Ask Ledger": send it back with a note
  ask <bot> "<job>"            give a bot a job; it answers in the bot room
  chat <bot> [message]         talk to one bot
  run <bot> [task]             run a bot now
  pause <bot> · resume <bot>
  room [message]               the live bot room (type to post, @mention a bot)
  brief · flags                today's brief, open flags
  hire [id]                    the catalog for your industry, or hire one

  Tip: add "nightshift brief" to your shell profile.`);
  },
};

const [cmd = "help", ...args] = process.argv.slice(2);
const fn = cmds[cmd] ?? (cmd === "--help" || cmd === "-h" ? cmds.help : null);
if (!fn) die(`Unknown command "${cmd}". Try: nightshift help`);
await fn(...args);
