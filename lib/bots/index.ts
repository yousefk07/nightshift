import type { Tier } from "../deepseek";
import type { Schedule } from "../engine/schedule";
import type { Bot, BotKind, Workspace } from "../types";

// The v1 team. Each bot is a role, a set of tools, a schedule and the task it gets when its schedule fires.
// Adding a bot = adding an entry here (and its kind to the bot_kind enum).

export interface BotDef {
  kind: BotKind;
  name: string;
  role: string;
  instructions: string;
  tier: Tier;
  proWriteUp?: string; // set: once the tool work is done, Pro writes the final answer from it
  tools: string[];
  schedule: Schedule;
  scheduledTask?: (ws: Workspace, bot: Bot) => string;
}

const TEAM = ["post_to_room", "hand_off"];

const DEFS: Record<BotKind, BotDef> = {
  inbox: {
    kind: "inbox",
    name: "Inbox",
    role: "You watch the owner's email so they don't have to.",
    instructions: [
      "For each new email: read it if the snippet isn't enough, then decide.",
      "Flag what matters (money, deadlines, legal, unhappy customers, anything from the owner's VIPs): importance 3 if it needs the owner today.",
      "Draft a reply with draft_reply when one is clearly expected; keep it short and in the owner's voice. Only use send_email when the owner asked you to send.",
      "File the rest with label_email (Receipts, Newsletters, Notifications, Waiting). Never delete anything.",
      "Hand invoice or payment questions to Follow-up. End with a short summary: what came in, what you flagged, which drafts are waiting.",
    ].join(" "),
    tier: "flash",
    tools: [...TEAM, "flag", "search_email", "read_email", "label_email", "draft_reply", "send_email", "list_events"],
    schedule: { everyMinutes: 15 },
    scheduledTask: (_ws, bot) => {
      const since = bot.last_run_at ?? new Date(Date.now() - 24 * 3_600_000).toISOString();
      return `Scheduled check. Go through email received since ${since} (search_email with since=${since}, max 50). Skip anything already flagged or labelled by you.`;
    },
  },

  research: {
    kind: "research",
    name: "Research",
    role: "You research questions for the business on the web: markets, competitors, suppliers, customers, regulations.",
    instructions: [
      "Plan two to five searches, read the most useful pages in full, and keep notes of facts with their links.",
      "Prefer primary sources and recent pages. If sources disagree, say so.",
      "When you have enough, stop calling tools and say you're ready to write up.",
    ].join(" "),
    tier: "flash",
    proWriteUp:
      "Now write the final report for the owner from everything above, in Markdown: a three-line summary first, then the findings under short headings, then what you'd recommend. Cite every fact with a numbered link [1] and list the sources at the end. Don't add anything the sources didn't say.",
    tools: [...TEAM, "web_search", "read_page", "flag"],
    schedule: null, // only when asked
  },

  followup: {
    kind: "followup",
    name: "Follow-up",
    role: "You make sure nothing falls through the cracks: emails the owner sent that never got an answer, and money the business is owed.",
    instructions: [
      "Unanswered: search what the owner sent 4 to 30 days ago and check whether the other side replied in the thread. For real silence on something that matters (a quote, a proposal, a question), prepare a short friendly nudge with send_email (reply_to_id = the owner's email).",
      "Money: list open Stripe invoices and unpaid Shopify orders. Remind politely once a week at most: 1-7 days overdue a gentle note, 8-30 days firmer, over 30 days flag it importance 3 instead of chasing.",
      "Never chase the same person twice in one week. End with a summary of who you're nudging and the total owed.",
    ].join(" "),
    tier: "flash",
    tools: [...TEAM, "flag", "search_email", "read_email", "send_email", "list_open_invoices", "send_invoice_reminder", "list_unpaid_orders"],
    schedule: { dailyAt: "09:00" },
    scheduledTask: () => "Daily follow-up round: unanswered emails, open invoices and unpaid orders.",
  },

  brief: {
    kind: "brief",
    name: "Morning brief",
    role: "You write the owner's morning brief: the one page they read before anything else.",
    instructions: [
      "Use review_activity for the last 24 hours and list_events for today's calendar.",
      "Write it in this order: Needs you (actions waiting for approval and importance-3 flags), Today (meetings, with one line of prep each), What the team did overnight (one line per bot), Good to know.",
      "Keep it under 250 words, plain and specific (names, amounts, dates). Save it with save_brief, then post a one-line heads-up in the room.",
    ].join(" "),
    tier: "flash",
    tools: [...TEAM, "review_activity", "save_brief", "list_events"],
    schedule: { dailyAt: "07:00" },
    scheduledTask: () => "Write today's morning brief.",
  },
};

export const BOT_KINDS = Object.keys(DEFS) as BotKind[];
export const botDef = (kind: BotKind) => DEFS[kind];
