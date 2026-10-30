// The legal pages: a short version, then the full text (markdown, rendered by components/Prose.tsx).
// Have a lawyer review changes before publishing them.

export interface LegalDoc { title: string; effective: string; short: string[]; sections?: { h: string; body: string }[] }

const CONTACT = "admin@nightshiftai.ca"; // the public contact everywhere on the site

export const DOCS: Record<string, LegalDoc> = {
  privacy: {
    title: "Privacy Policy",
    effective: "October 30, 2026",
    short: [
      "We use your data, and the data in the accounts you connect, only to do the work you ask your bots to do.",
      "We never sell it, never use it for advertising, and never use it to train AI models.",
      "To do a task, the relevant text is sent to our AI model provider, DeepSeek, which processes it on servers in China.",
      "Nothing is sent to anyone on your behalf until you approve it, unless you've told a bot it may send on its own.",
      "You can export everything or delete your workspace at any time; deleted data is gone within 30 days.",
    ],
    sections: [
      { h: "Who we are", body: `Nightshift ("Nightshift", "we", "us") provides AI assistants ("bots") for small businesses at nightshiftai.ca and through the Nightshift command-line tool. We're based in Ontario, Canada. Questions about privacy go to **${CONTACT}**.

For the information in the accounts you connect (your mailbox, calendar, books, store or contact list), you are in charge of it and we process it on your behalf, only to provide Nightshift to you.` },
      { h: "What we collect", body: `- **Your account:** your email address, name, phone number and working hours if you add them, your workspace's name, industry, time zone and settings, and your team members' roles.
- **Accounts you connect:** when you connect a service, we receive the access it grants. Depending on the service, that can include email messages and their attachments' names, calendar events, invoices, payments, customers and contacts, store orders and products, and contact lists. We read only what a task needs.
- **What your team creates:** drafts, approval cards, messages to and between bots, morning briefs, the team's shared memory, documents bots write, and an activity log of what happened.
- **Billing:** payments are handled by Stripe. We keep your Stripe customer and subscription identifiers, your plan, and invoice summaries. We never see or store full card numbers.
- **Technical data:** server logs, the network address a request came from (used, for example, to limit sign-in attempts and to show where a CLI sign-in came from), the browser push endpoint if you turn on notifications, and errors, so we can fix them.` },
      { h: "How we use it", body: `- To run your bots: read new email, flag what matters, draft replies, check invoices, follow up on leads, research, and write your brief.
- To show you their work, and to send emails, invoices or other messages **only after you approve them** (or on their own, only where you've switched that on for a bot; money always waits for your approval).
- To send you notifications and the morning brief, by email, push or in the app, as you choose.
- To bill you, prevent fraud and abuse, keep Nightshift secure, provide support when you ask, and meet legal obligations.

We don't sell personal information, don't use it for advertising, and don't use your data or your connected accounts' data to train AI models, ours or anyone else's.` },
      { h: "AI processing", body: `To do a task, the text the task needs (for example, an email being answered and your instructions) is sent to our AI model provider, **DeepSeek**, which returns the answer. DeepSeek processes it on servers in the People's Republic of China, under its own terms and privacy policy. We send only what the task needs. Web searches that bots run are sent to **Tavily**, without your connected data.

Nightshift isn't currently offered to health practices, and you shouldn't connect accounts containing patients' health information.` },
      { h: "Google user data", body: `When you connect a Google account, Nightshift can read and organise your Gmail messages, create drafts, send email you approve, read your calendar and free times, and read Google Sheets you point it to.

Nightshift's use and transfer to any other app of information received from Google APIs will adhere to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements. In particular:
- We use Google data only to provide and improve the features you use in Nightshift, as described in this policy.
- We transfer it only as needed to provide those features (for example, to our AI model provider to draft a reply you asked for), to comply with law, or as part of a merger or sale with your notice.
- We don't use it for advertising, don't sell it, and don't use it to train generalised AI or machine-learning models.
- No person at Nightshift reads it, unless you ask us to (for support), it's needed for security or to investigate abuse, or the law requires it.

The same rules apply to data from Microsoft, Intuit (QuickBooks), Xero, FreshBooks, Stripe, Shopify and HubSpot accounts you connect. You can disconnect any account at any time in Settings → Connections, which deletes its stored tokens straight away; you can also revoke access from the provider's own security settings.` },
      { h: "Who we share it with", body: `Only the service providers that run Nightshift for us (our subprocessors), each only for its part:

- **Supabase:** database and sign-in
- **Vercel:** hosting the app
- **DeepSeek:** AI models (servers in China)
- **Tavily:** web search
- **Resend:** Nightshift's own email (sign-in codes, briefs, alerts)
- **Stripe:** billing
- **Google, Microsoft, Intuit, Xero, FreshBooks, Shopify, HubSpot:** only when you connect them, to do what you've asked

We may also disclose information if the law requires it, to protect people's safety or our rights, or to a buyer if Nightshift is sold (with notice to you). The current list is kept on the [Subprocessors](/legal/subprocessors) page.` },
      { h: "Security", body: `- Data is encrypted in transit (TLS). Access tokens and API keys for connected accounts are encrypted again with AES-GCM before they're stored.
- Each workspace's data is kept separate, and team roles (owner, approver, viewer) limit who can do what.
- Approving money can require your authenticator app, and nothing outward happens without an approval unless you've switched that on.

No system is perfectly secure. If a breach affects your personal information, we'll tell you and the authorities as the law requires.` },
      { h: "How long we keep it", body: `We keep your data while your workspace is active. If you delete your workspace, your bots stop and your connections are disconnected straight away, and everything else is deleted after 30 days (so you can change your mind). The activity log is kept for 30 days on Solo, one year on Studio and for the life of the workspace on Team. Backups held by our providers are overwritten on their normal schedule.` },
      { h: "Your rights", body: `You can see, correct and export your data (Settings → Activity log has an export), disconnect any account, and delete your workspace. You can also ask us for a copy of the personal information we hold about you, or to correct or delete it, by writing to **${CONTACT}**. We'll answer within 30 days.

Depending on where you live, laws such as Canada's PIPEDA, the GDPR or California's CCPA give you further rights; we'll honour them. If you're in Canada and unhappy with how we've handled a request, you can contact the Office of the Privacy Commissioner of Canada.` },
      { h: "Children", body: "Nightshift is for businesses. It isn't meant for anyone under 18, and we don't knowingly collect children's information." },
      { h: "Changes", body: "If we change this policy in a way that matters, we'll email workspace owners before it takes effect. The date at the top shows when it last changed." },
    ],
  },
  terms: {
    title: "Terms of Service",
    effective: "October 30, 2026",
    short: [
      "You stay in charge: the bots draft, you approve. You're responsible for what you approve and for any bot you let send on its own.",
      "AI can be wrong. Read before you approve, and don't treat it as legal, tax, medical or financial advice.",
      "Only contact people you're allowed to contact, and respect anyone who opts out.",
      "Plans renew automatically. Cancel anytime; your bots work until the end of the period you've paid for.",
      "You own your data. We use it only to run Nightshift for you.",
    ],
    sections: [
      { h: "These terms", body: `These terms are an agreement between you (and the business you sign up for) and Nightshift. By creating a workspace or using Nightshift you accept them. If you use Nightshift for a business, you confirm you can accept them for it. You must be at least 18.` },
      { h: "What Nightshift does", body: `Nightshift gives your business AI bots that work with the accounts you connect: they read, organise, research, draft and, with your approval, send email, create invoices and take other actions. Tools that contact people wait for your approval unless you switch a bot to send on its own; anything involving money always waits.

**You're responsible for everything you approve**, and for everything sent by a bot you've allowed to act on its own. AI output can be wrong, incomplete or out of date. Review drafts before approving them. Nightshift isn't a lawyer, accountant, doctor or financial adviser, and nothing it produces is professional advice.` },
      { h: "Your account and team", body: "Keep your sign-in secure and tell us if you think someone else has access. You choose who joins your workspace and what role they have, and you're responsible for what your team does in it." },
      { h: "Connected accounts", body: "When you connect an account, you let Nightshift use it to do what you ask, and you confirm you're entitled to. Those services' own terms still apply to you, and we're not responsible for them or for changes they make. You can disconnect an account at any time." },
      { h: "Acceptable use", body: `Don't use Nightshift to:
- send spam or messages people haven't agreed to receive. You're responsible for consent under Canada's Anti-Spam Legislation (CASL) and similar laws, and for honouring every unsubscribe and do-not-contact request;
- harass, deceive or impersonate anyone, or send anything illegal, defamatory or infringing;
- process patients' health information (Nightshift isn't offered to health practices yet);
- break the law, break other services' terms, or get around Nightshift's limits, security or billing;
- copy, resell or reverse engineer Nightshift, or use it to build a competing service.

We may pause a bot, a workspace or an account to stop misuse.` },
      { h: "Plans, trials and billing", body: `Prices are on the [pricing page](/pricing) and are in US dollars, plus any applicable tax. Subscriptions renew automatically each month or year until cancelled. Switching plans takes effect right away and is prorated on your next invoice. You can cancel at any time in Settings → Plan & billing; your bots keep working until the end of the period you've paid for, and you won't be charged again. Except where the law requires otherwise, payments aren't refundable for partly used periods.

If a payment fails, we'll retry and tell you; if it keeps failing, your bots stop until it's fixed. Free trials last as stated when you sign up and may be limited or paused. We'll give at least 30 days' notice of a price change, and it applies from your next renewal.` },
      { h: "Your content", body: "You and your business own your data, your connected accounts' data and what your bots produce for you. You give us permission to store, process and transmit it only as needed to provide Nightshift to you, as described in the [Privacy Policy](/legal/privacy). We don't use it to train AI models." },
      { h: "Changes and availability", body: "We work to keep Nightshift running and safe, but we don't promise it will be uninterrupted or error-free. We may add, change or remove features; if a change takes away something you rely on in a paid plan, we'll tell you first." },
      { h: "Ending", body: "You can stop using Nightshift and delete your workspace at any time. We may suspend or end your access if you break these terms or don't pay, after notice where reasonable. After your workspace is deleted, your data is deleted as described in the Privacy Policy." },
      { h: "Disclaimers", body: `Nightshift is provided "as is". To the extent the law allows, we disclaim all warranties, including that it's fit for a particular purpose or that bots' output is accurate.` },
      { h: "Limit of liability", body: "To the extent the law allows, Nightshift isn't liable for indirect, incidental, special or consequential losses, or for lost profits, revenue or data, and our total liability for any claim is limited to what you paid us in the 12 months before it. Nothing here limits liability that can't be limited by law." },
      { h: "Indemnity", body: "If someone makes a claim against us because of messages you approved or sent through Nightshift, your content, or your breach of these terms, you'll cover our reasonable costs of dealing with it." },
      { h: "Governing law", body: "These terms are governed by the laws of Ontario and the federal laws of Canada that apply there. The courts of Ontario have jurisdiction, unless your local consumer law gives you the right to go to your own courts." },
      { h: "Changes to these terms", body: `If we change these terms in a way that matters, we'll email workspace owners at least 30 days before. Continuing to use Nightshift after that means you accept the change. Questions: **${CONTACT}**.` },
    ],
  },
  dpa: {
    title: "Data processing",
    effective: "October 30, 2026",
    short: [
      "For the data in the accounts you connect, you're the controller and Nightshift processes it on your behalf.",
      "We process it only to provide Nightshift, on your instructions, and never to train AI models.",
      "Our subprocessors are listed on the Subprocessors page; we'll tell you before adding one.",
      "Data is encrypted in transit and at rest, and stored tokens are encrypted again with AES-GCM.",
      `For a signed data processing agreement, write to ${CONTACT}.`,
    ],
  },
  subprocessors: {
    title: "Subprocessors",
    effective: "October 30, 2026",
    short: [
      "Supabase: database and sign-in",
      "Vercel: app hosting",
      "DeepSeek: AI models (servers in China)",
      "Tavily: web search",
      "Resend: Nightshift's own email",
      "Stripe: billing",
      "Google, Microsoft, Intuit, Xero, FreshBooks, Shopify, HubSpot: only when you connect them",
    ],
  },
  cookies: {
    title: "Cookies",
    effective: "October 30, 2026",
    short: ["One sign-in cookie keeps you signed in. Nothing for advertising or tracking.", "If you turn on notifications, your browser stores a push subscription for Nightshift."],
  },
};
