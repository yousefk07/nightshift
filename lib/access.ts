import { ownerAlert } from "./alerts";
import { layout, sendMail } from "./email";
import { exactly } from "./like";
import { admin } from "./store-supabase";

// Who may start a new workspace. While OPEN_SIGNUPS isn't "on", free trials are invite-only: an email the owner
// approved on the admin page's Trial interest tab. Anyone else can still sign in (teammates join by invite and
// existing customers keep their accounts), but a new person lands on the waitlist instead of getting a workspace.

export const signupsOpen = () => process.env.OPEN_SIGNUPS === "on";

export class WaitlistError extends Error {
  status = 403;
  code = "waitlist";
  constructor() {
    super("Nightshift is invite-only for now. You're on the waitlist and we'll email you when your trial is ready.");
  }
}

const row = (email: string) => admin().from("trial_interest").select("id, status").ilike("email", exactly(email)).maybeSingle();

export async function mayStart(email: string) {
  if (signupsOpen()) return true;
  const { data } = await row(email);
  return data?.status === "approved" || data?.status === "started";
}

// A signed-in stranger: on the list (once), the owner hears about it, and they're told to wait.
export async function joinWaitlist(email: string): Promise<never> {
  const { data } = await row(email);
  if (!data) {
    const saved = await admin().from("trial_interest").insert({ email: email.toLowerCase(), source: "signin" });
    // the app's first screens load together, so two requests can get here at once: only the one that added them alerts
    if (saved.error?.code === "23505") throw new WaitlistError();
    await ownerAlert({
      kind: "interest", heading: `${email} signed in and is waiting for a trial`,
      lead: "They signed in on nightshiftai.ca. Approve them on the admin page and they'll get an email to start.",
      rows: [["Email", email], ...(saved.error ? [["Note", "Not saved: run migration 0005"] as [string, string]] : [])],
      button: { label: "Review on the admin page", url: `${process.env.APP_URL || "https://www.nightshiftai.ca"}/admin` },
    }).catch(() => {});
  }
  throw new WaitlistError();
}

export const markStarted = (email: string) => admin().from("trial_interest").update({ status: "started" }).ilike("email", exactly(email)).then(() => {});

// Approved: the invitation email with the sign-up link.
export async function sendApproval(p: { email: string; business: string | null; contact_name: string | null }) {
  const app = process.env.APP_URL || "https://www.nightshiftai.ca";
  const { html, text } = layout({
    eyebrow: "Your free trial", heading: `You're in${p.contact_name ? `, ${p.contact_name}` : ""}!`,
    lead: `Your 14-day Nightshift trial${p.business ? ` for **${p.business}**` : ""} is ready. Sign in with this email address to meet your team.`,
    paragraphs: ["It takes about five minutes: pick your kind of business, connect your inbox, and your bots start that night. Nothing goes out without your OK.", "Questions? Just reply to this email."],
    button: { label: "Start my trial", url: `${app}/signin?new=1` },
    footer: "You asked for a Nightshift trial. If that wasn't you, ignore this email.",
  });
  // from the same address as the outreach email, so it lands in the same conversation and replies reach admin@
  await sendMail({ to: p.email, subject: "Your Nightshift trial is ready", html, text, from: "Yousef at Nightshift <admin@nightshiftai.ca>", replyTo: "admin@nightshiftai.ca" });
}
