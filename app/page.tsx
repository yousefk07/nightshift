"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Desk, Head } from "@/components/pixel";
import { SiteFooter, SiteNav } from "@/components/site";

// H1 Home. Signed-in visitors go straight to the office.

const TEAM = [
  { kind: "inbox", name: "Penny", role: "Inbox", hue: 65, prop: "papers", text: "Reads every email, flags the few that matter and drafts replies in your voice." },
  { kind: "research", name: "Sage", role: "Research", hue: 185, prop: "books", text: "Compares suppliers, checks out new clients and answers the questions you never get to." },
  { kind: "invoices", name: "Ledger", role: "Invoices", hue: 140, prop: "coins", text: "Chases unpaid invoices politely, and steps back the moment there's a dispute." },
  { kind: "leads", name: "Nudge", role: "Leads", hue: 15, prop: "mug", text: "Follows up with leads that went quiet, at a pace that never feels pushy." },
  { kind: "brief", name: "Dawn", role: "Morning brief", hue: 95, prop: "plant", text: "Writes one short note covering everything the team did overnight." },
];
const FAQ = [
  ["Can a bot ever send something on its own?", "Not unless you say so. Every bot starts on \"ask me first\", so emails wait as drafts for you. You can let a bot send email on its own later. Anything that moves money, like a credit note or an invoice, always waits for your approval."],
  ["Who can see my email?", "Only you, the people you invite, and the bots you connect it to. Your data is never used to train AI models, and every action a bot takes is in your activity log."],
  ["Which tools does it connect to?", "Gmail and Google Calendar, Outlook and Microsoft 365, QuickBooks, Xero, FreshBooks, Stripe, Shopify, HubSpot, and a Google Sheet or CSV of your leads."],
  ["Can I use it from the terminal?", "Yes. The nightshift CLI shows the same office, queue and bot room: nightshift queue, nightshift approve 1 2, nightshift room."],
  ["What happens if I cancel?", "Your bots stop at the end of the billing period. You can export everything (drafts, briefs, the bot room, settings) for 30 days afterwards."],
];

export default function Home() {
  const router = useRouter();
  const [open, setOpen] = useState<number | null>(0);
  const [yearly, setYearly] = useState(false);
  useEffect(() => {
    fetch("/api/me").then((r) => { if (r.ok) router.replace("/office"); }).catch(() => {});
  }, [router]);
  const price = (m: number) => (yearly ? Math.round((m * 10) / 12) : m);

  return (
    <main style={{ background: "#f6f0e7", color: "#2b2320" }}>
      <div style={{ background: "#221a24", color: "#f1e6d6" }}>
        <SiteNav />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 22, padding: "72px clamp(16px,4vw,56px) 40px" }}>
          <div className="pixel" style={{ fontSize: 15, color: "#f0c27a", letterSpacing: ".08em" }}>YOUR TEAM WORKS NIGHTS. YOU DON&apos;T HAVE TO.</div>
          <h1 style={{ margin: 0, fontSize: "clamp(40px,7vw,68px)", lineHeight: 1.02, letterSpacing: "-.02em", maxWidth: 900, textWrap: "balance" }}>A night shift for your small business</h1>
          <p style={{ margin: 0, fontSize: 20, lineHeight: 1.5, color: "#d6c8bb", maxWidth: 660, textWrap: "pretty" }}>
            AI teammates read your inbox, chase invoices, follow up on leads and do your research, then leave a brief on your desk by morning. There are specialists for over 80 kinds of business, from roofers to restaurants.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap", justifyContent: "center" }}>
            <Link href="/trial" style={{ fontSize: 16, fontWeight: 600, padding: "14px 22px", borderRadius: 12, background: "#f0c27a", color: "#221a24", textDecoration: "none" }}>Request a free trial</Link>
            <a href="#team" style={{ fontSize: 16, fontWeight: 600, padding: "14px 22px", borderRadius: 12, border: "1px solid #57475c", color: "#f1e6d6", textDecoration: "none" }}>Meet the team</a>
          </div>
          <div style={{ fontSize: 13.5, color: "#a99ba1" }}>No card needed. Set up in about 10 minutes.</div>
        </div>
        <div style={{ position: "relative", height: 300, overflow: "hidden", background: "#5a4238", backgroundImage: "repeating-linear-gradient(0deg,transparent 0 40px,#4f3a31 40px 44px)", borderTop: "14px solid #2c2236" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(700px 260px at 50% 0%,rgba(255,190,120,.16),transparent)" }} />
          <div style={{ position: "absolute", left: "50%", top: 0, width: 1160, height: 300, marginLeft: -580 }}>
            {TEAM.map((t, i) => (
              <div key={t.kind} style={{ position: "absolute", left: i * 240, top: 60, width: 200, height: 150 }}>
                <Desk bot={t} state={i === 0 ? "hand" : i === 3 ? "idle" : "typing"} />
              </div>
            ))}
            <div className="pixel" style={{ position: "absolute", left: 112, top: 20, padding: "5px 9px", background: "#fff6e4", border: "3px solid #2a1f2b", fontSize: 13, color: "#2a1f2b", boxShadow: "4px 4px 0 0 rgba(0,0,0,.25)" }}>draft ready</div>
          </div>
        </div>
      </div>

      <section id="team" style={{ padding: "96px clamp(16px,4vw,56px) 40px", display: "flex", flexDirection: "column", gap: 40 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 640 }}>
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: "#8a4f14" }}>The team</div>
          <h2 style={{ margin: 0, fontSize: "clamp(32px,4vw,44px)", lineHeight: 1.1, letterSpacing: "-.01em" }}>Each bot has one job and is good at it.</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16 }}>
          {TEAM.map((t) => (
            <div key={t.kind} style={{ background: "#fffbf4", border: "1px solid #e4d9ca", borderRadius: 16, padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ width: 56, height: 56, borderRadius: 12, background: `oklch(0.92 0.045 ${t.hue})`, display: "flex", alignItems: "center", justifyContent: "center" }}><Head bot={t} size={4} /></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 19, fontWeight: 700 }}>{t.name}</span><span style={{ fontSize: 14, color: "#716459" }}>{t.role}</span></div>
              <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55 }}>{t.text}</p>
            </div>
          ))}
        </div>
        <p style={{ margin: 0, fontSize: 16, color: "#5d5148" }}>Plus specialists for your line of work: rebooking for salons, permit renewals for immigration lawyers, tune-up season for HVAC, cake orders for bakeries, and hundreds more.</p>
      </section>

      <section id="how" style={{ padding: "64px clamp(16px,4vw,56px)", display: "flex", flexDirection: "column", gap: 32 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 640 }}>
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: "#8a4f14" }}>How it works</div>
          <h2 style={{ margin: 0, fontSize: "clamp(32px,4vw,44px)", lineHeight: 1.1 }}>Connect it tonight. Read the brief tomorrow.</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }}>
          {[["01", "Connect your tools", "Email, accounting and your CRM. Every bot gets read and draft access, and you decide which bots can touch what."], ["02", "They work while you're off", "Penny sorts the inbox, Ledger checks who owes you, Nudge follows up, and they hand work to each other in the bot room."], ["03", "You approve over coffee", "Drafts wait on your desk with the morning brief. Five minutes, most mornings."]].map(([n, t, d]) => (
            <div key={n} style={{ borderTop: "3px solid #2b2320", paddingTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              <span className="pixel" style={{ fontSize: 18, color: "#8a4f14" }}>{n}</span>
              <span style={{ fontSize: 20, fontWeight: 700 }}>{t}</span>
              <span style={{ fontSize: 15, lineHeight: 1.55, color: "#5d5148" }}>{d}</span>
            </div>
          ))}
        </div>
      </section>

      <section style={{ margin: "32px clamp(16px,4vw,56px)", borderRadius: 20, background: "#221a24", color: "#f1e6d6", padding: "56px clamp(20px,4vw,56px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 40, alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: "#f0c27a" }}>You&apos;re in charge</div>
          <h2 style={{ margin: 0, fontSize: "clamp(30px,4vw,40px)", lineHeight: 1.1 }}>Nothing goes out without your OK.</h2>
          {["Drafts wait for your approval, and money never moves without you.", "You decide what each bot can read, and you can pause any of them with one click.", "A full activity log shows who did what, and why."].map((s) => (
            <div key={s} style={{ display: "flex", gap: 10, fontSize: 16, color: "#d6c8bb" }}><span style={{ color: "#f0c27a" }}>■</span>{s}</div>
          ))}
        </div>
        <div style={{ background: "#fffbf4", color: "#2b2320", borderRadius: 14, padding: 18, display: "flex", flexDirection: "column", gap: 10, boxShadow: "var(--shadow)" }}>
          <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "#8a4f14" }}>Needs your approval · 2 items</span>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14.5 }}><span>Credit note → a client who was billed twice</span><span className="mono">$1,240.00</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14.5 }}><span>Reply: &quot;You&apos;re right, and we&apos;re sorry&quot;</span><span style={{ color: "#716459" }}>email</span></div>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, padding: "7px 14px", borderRadius: 8, background: "#2b2320", color: "#fbf3e6" }}>Approve both</span>
            <span style={{ fontSize: 13.5, fontWeight: 600, padding: "7px 14px", borderRadius: 8, border: "1px solid #cdbfac" }}>Review</span>
          </div>
        </div>
      </section>

      <section id="pricing" style={{ padding: "80px clamp(16px,4vw,56px) 40px", display: "flex", flexDirection: "column", gap: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
          <h2 style={{ margin: 0, fontSize: "clamp(32px,4vw,44px)" }}>Simple pricing</h2>
          <div style={{ display: "flex", gap: 4, background: "#ebe0d0", padding: 4, borderRadius: 10 }}>
            {[[false, "Monthly"], [true, "Yearly · 2 months free"]].map(([v, l]) => <button key={String(v)} onClick={() => setYearly(v as boolean)} style={{ padding: "8px 14px", borderRadius: 8, border: "none", fontSize: 14, background: yearly === v ? "#fffbf4" : "transparent", fontWeight: yearly === v ? 600 : 400 }}>{l as string}</button>)}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }}>
          {[
            { n: "Solo", p: 39, lines: ["Penny, Ledger and Dawn", "1 inbox", "1 accounting connection", "Morning brief by email"] },
            { n: "Studio", p: 89, top: true, lines: ["Up to 10 bots, specialists included", "The bot room", "3 inboxes, unlimited connections", "2 seats with approval rights", "100 research hours a month"] },
            { n: "Team", p: 189, lines: ["Everything in Studio", "Up to 40 bots", "10 seats, roles", "Audit log, SSO and API access", "Priority support"] },
          ].map((t) => (
            <div key={t.n} style={{ background: "#fffbf4", border: t.top ? "2px solid #2b2320" : "1px solid #e4d9ca", borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 20, fontWeight: 700 }}>{t.n}</span>{t.top && <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 9px", borderRadius: 20, background: "#f8e2c4", color: "#8a4f14" }}>MOST PICKED</span>}</div>
              <div style={{ fontSize: 40, fontWeight: 700 }}>${price(t.p)}<span style={{ fontSize: 15, fontWeight: 400, color: "#776a5e" }}>/month{yearly ? ", billed yearly" : ""}</span></div>
              {t.lines.map((l) => <div key={l} style={{ fontSize: 15, color: "#4a3f38" }}>✓ {l}</div>)}
              <Link href="/trial" style={{ marginTop: "auto", textAlign: "center", fontSize: 15, fontWeight: 600, padding: "12px 18px", borderRadius: 10, background: t.top ? "#2b2320" : "transparent", color: t.top ? "#fbf3e6" : "#2b2320", border: "1px solid #2b2320", textDecoration: "none" }}>Request a free trial</Link>
            </div>
          ))}
        </div>
        <Link href="/pricing" style={{ fontSize: 15 }}>Compare plans →</Link>
      </section>

      <section style={{ padding: "48px clamp(16px,4vw,56px) 96px", maxWidth: 860 }}>
        <h2 style={{ margin: "0 0 18px", fontSize: 32 }}>Questions</h2>
        {FAQ.map(([q, a], i) => (
          <div key={q} style={{ borderTop: "1px solid #e4d9ca" }}>
            <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "18px 0", fontSize: 17, fontWeight: 600, display: "flex", justifyContent: "space-between", color: "#2b2320" }}>{q}<span>{open === i ? "−" : "+"}</span></button>
            {open === i && <p style={{ margin: "0 0 18px", fontSize: 15.5, lineHeight: 1.6, color: "#4a3f38" }}>{a}</p>}
          </div>
        ))}
      </section>
      <SiteFooter />
    </main>
  );
}
