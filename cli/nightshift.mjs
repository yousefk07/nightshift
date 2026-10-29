#!/usr/bin/env node
// nightshift: the terminal side of Nightshift. Same account, bots, chats and bot room as the web app.
// No dependencies; needs Node 20+. Settings live in ~/.nightshift/config.json.

import { mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

const DIR = join(homedir(), ".nightshift");
const FILE = join(DIR, "config.json");
const BOTS = ["inbox", "research", "followup", "brief"];
const tty = process.stdout.isTTY;
const c = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const dim = c(2), bold = c(1), cyan = c(36), yellow = c(33), green = c(32), red = c(31);

const load = () => {
  try { return JSON.parse(readFileSync(FILE, "utf8")); } catch { return {}; }
};
const save = (cfg) => {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(cfg, null, 2));
  try { chmodSync(FILE, 0o600); } catch {}
};
const die = (msg) => { console.error(red(msg)); process.exit(1); };

async function api(path, { method = "GET", json, stream } = {}) {
  const cfg = load();
  if (!cfg.url || !cfg.token) die("Not signed in. In the web app, make a CLI token, then: nightshift login <url> <token>");
  const res = await fetch(cfg.url.replace(/\/+$/, "") + path, {
    method,
    headers: { Authorization: `Bearer ${cfg.token}`, ...(json ? { "Content-Type": "application/json" } : {}) },
    body: json ? JSON.stringify(json) : undefined,
  });
  if (!res.ok) {
    let msg = await res.text();
    try { msg = JSON.parse(msg).error ?? msg; } catch {}
    die(`${res.status}: ${msg}`);
  }
  return stream ? res : res.json();
}

// Reads an NDJSON stream from /api/chat or /run, printing text as it arrives and tool use as dim lines.
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
      else if (e.type === "action") line(yellow(`  ⏸ waiting for your OK: ${e.title}  (nightshift approve ${e.id.slice(0, 8)})`));
      else if (e.type === "room") line(dim(`  ↗ bot room: ${e.text}`));
      else if (e.type === "stopped") line(yellow(`  paused: ${e.reason}`));
      else if (e.type === "error") line(red(e.error));
      else if (e.type === "done") done = e;
    }
  }
  if (!atLineStart) out("\n");
  if (done?.cost_usd != null) console.log(dim(`  ${done.status} · $${Number(done.cost_usd).toFixed(4)}`));
  return done;
}

const botName = (bots, id) => bots.find((b) => b.id === id)?.name ?? "?";
const ago = (iso) => {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  return m < 1 ? "now" : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};

async function findAction(prefix) {
  const { actions } = await api("/api/actions");
  const hit = actions.filter((a) => a.id.startsWith(prefix));
  if (hit.length !== 1) die(hit.length ? "That matches more than one action; give more of the id." : "No waiting action with that id.");
  return hit[0];
}

const cmds = {
  async login(url, token) {
    if (!url || !token?.startsWith("ns_")) die("Usage: nightshift login <app url> <ns_token>");
    save({ url, token });
    const me = await api("/api/me");
    console.log(green(`Signed in as ${me.email} (${me.workspace.name}).`));
  },
  logout() {
    save({});
    console.log("Signed out.");
  },

  async status() {
    const me = await api("/api/me");
    console.log(`${bold(me.workspace.name)} · ${me.email}`);
    console.log(`Today: $${me.spent_today_usd.toFixed(3)} of $${Number(me.workspace.daily_budget_usd).toFixed(2)} · ${yellow(me.pending + " waiting for you")} · ${me.open_flags} flags`);
    console.log(`Connected: ${me.connections.map((x) => `${x.provider} (${x.account})${x.status === "ok" ? "" : red(" !")}`).join(", ") || "nothing yet"}${me.search ? ", web search" : ""}`);
  },

  async bots(kind, setting) {
    if (kind) {
      const patch = { ask: { approval: "ask" }, auto: { approval: "auto" }, on: { enabled: true }, off: { enabled: false } }[setting];
      if (!BOTS.includes(kind) || !patch) die("Usage: nightshift bots <inbox|research|followup|brief> <ask|auto|on|off>");
      const { bot } = await api(`/api/bots/${kind}`, { method: "PATCH", json: patch });
      console.log(`${bot.name}: ${bot.enabled ? "on" : "off"}, ${bot.approval === "ask" ? "asks before acting" : "acts on its own"}`);
      return;
    }
    const me = await api("/api/me");
    for (const b of me.bots) {
      const when = b.next_run_at ? `next ${new Date(b.next_run_at).toLocaleString()}` : "when asked";
      console.log(`${(b.enabled ? green("●") : dim("○"))} ${bold(b.name.padEnd(14))} ${b.kind.padEnd(9)} ${(b.approval === "ask" ? "asks first" : "acts alone").padEnd(11)} ${dim(when)}`);
    }
  },

  async chat(kind, ...words) {
    if (!BOTS.includes(kind)) die("Usage: nightshift chat <inbox|research|followup|brief> [message]");
    let thread_id;
    const send = async (message) => {
      const done = await follow(await api("/api/chat", { method: "POST", json: { bot: kind, message, thread_id }, stream: true }));
      thread_id = done?.thread_id ?? thread_id;
    };
    if (words.length) return send(words.join(" "));
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    console.log(dim(`Chatting with ${kind}. Empty line or Ctrl+C to leave.`));
    for (;;) {
      const msg = (await rl.question(cyan("you › "))).trim();
      if (!msg) break;
      await send(msg);
    }
    rl.close();
  },

  async run(kind, ...words) {
    if (!BOTS.includes(kind)) die("Usage: nightshift run <inbox|research|followup|brief> [task]");
    await follow(await api(`/api/bots/${kind}/run`, { method: "POST", json: words.length ? { task: words.join(" ") } : {}, stream: true }));
  },

  async room(...words) {
    const watch = words[0] === "--watch";
    if (words.length && !watch) {
      const r = await api("/api/room", { method: "POST", json: { message: words.join(" ") } });
      console.log(r.queued.length ? dim(`Handed to ${r.queued.length} bot(s); they answer here on the next round (within 5 min).`) : dim("Posted."));
      return;
    }
    const me = await api("/api/me");
    let last = "";
    const show = async () => {
      const { messages } = await api(`/api/room${last ? `?after=${encodeURIComponent(last)}` : ""}`);
      for (const m of messages) {
        const who = m.role === "owner" ? cyan("you") : m.role === "system" ? dim("nightshift") : bold(botName(me.bots, m.bot_id));
        console.log(`${dim(ago(m.created_at).padStart(4))} ${who}: ${m.content}`);
        last = m.created_at;
      }
    };
    await show();
    if (!watch) return;
    console.log(dim("Watching the room (Ctrl+C to stop)."));
    for (;;) {
      await new Promise((r) => setTimeout(r, 5000));
      await show();
    }
  },

  async approvals() {
    const [{ actions }, me] = await Promise.all([api("/api/actions"), api("/api/me")]);
    if (!actions.length) return console.log("Nothing waiting for you.");
    for (const a of actions) {
      console.log(`${yellow(a.id.slice(0, 8))} ${bold(botName(me.bots, a.bot_id))}: ${a.title} ${dim(ago(a.created_at))}`);
      if (a.payload.body) console.log(dim(String(a.payload.body).split("\n").map((l) => "    " + l).join("\n")));
    }
    console.log(dim("\nnightshift approve <id>  ·  nightshift reject <id>  ·  nightshift show <id>"));
  },
  async show(id) {
    const a = await findAction(id ?? "");
    console.log(bold(a.title));
    console.log(JSON.stringify(a.payload, null, 2));
  },
  async approve(id) {
    const a = await findAction(id ?? "");
    const r = await api(`/api/actions/${a.id}`, { method: "POST", json: { decision: "approve" } });
    console.log(r.status === "done" ? green(`Done: ${a.title}`) : red(`Failed: ${r.error}`));
  },
  async reject(id) {
    const a = await findAction(id ?? "");
    await api(`/api/actions/${a.id}`, { method: "POST", json: { decision: "reject" } });
    console.log(`Rejected: ${a.title}`);
  },

  async flags() {
    const [{ flags }, me] = await Promise.all([api("/api/flags"), api("/api/me")]);
    if (!flags.length) return console.log("No open flags.");
    for (const f of flags) console.log(`${[dim("·"), yellow("!"), red("!!")][f.importance - 1]} ${bold(f.title)} ${dim(`(${botName(me.bots, f.bot_id)}, ${ago(f.created_at)})`)}\n    ${f.why}${f.url ? dim(" " + f.url) : ""}`);
  },
  async brief() {
    const { date, brief } = await api("/api/brief");
    console.log(brief ?? dim(`No brief for ${date} yet. Run one now: nightshift run brief`));
  },

  async connect(provider, a, b) {
    if (provider === "stripe" && a) return console.log(await api("/api/connect/stripe", { method: "POST", json: { key: a } }));
    if (provider === "shopify" && a && b) return console.log(await api("/api/connect/shopify", { method: "POST", json: { shop: a, token: b } }));
    if (provider === "google" || provider === "microsoft") return console.log(`Open ${load().url}/api/connect/${provider} in your browser while signed in.`);
    die("Usage: nightshift connect stripe <rk_live_...>  |  nightshift connect shopify <store.myshopify.com> <shpat_...>  |  nightshift connect google|microsoft");
  },

  help() {
    console.log(`${bold("nightshift")}: your business bots from the terminal

  login <url> <token>          sign in (make the token in the web app)
  status                       spend today, what's waiting, what's connected
  bots [bot ask|auto|on|off]   the team, or change one bot's switch
  chat <bot> [message]         talk to a bot (no message: a conversation)
  run <bot> [task]             run a bot now
  room [message | --watch]     read the bot room, say something (@inbox ...), or watch it
  approvals                    what's waiting for your OK
  approve|reject|show <id>     decide on one
  flags                        what the bots flagged
  brief                        today's morning brief
  connect <provider> ...       stripe, shopify, google, microsoft

  bots: ${BOTS.join(", ")}`);
  },
};

const [cmd = "help", ...args] = process.argv.slice(2);
const fn = cmds[cmd] ?? (cmd === "--help" || cmd === "-h" ? cmds.help : null);
if (!fn) die(`Unknown command "${cmd}". Try: nightshift help`);
await fn(...args);
