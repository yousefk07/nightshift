import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHead, SitePage } from "@/components/site";

// P5 Legal: plain-language summaries.
const DOCS: Record<string, { title: string; short: string[] }> = {
  privacy: { title: "Privacy", short: ["We use your connected data only to do the work you ask the bots to do.", "We never sell it and never use it to train AI models.", "You can export everything, or delete your workspace, at any time.", "Our model provider (DeepSeek) processes prompts to produce answers; we send only what a task needs."] },
  terms: { title: "Terms", short: ["You stay in charge: the bots draft, you approve.", "You're responsible for what you approve and send.", "Cancel anytime; your bots stop at the end of the billing period.", "Don't use Nightshift to send spam or to contact people who asked not to be contacted."] },
  dpa: { title: "Data processing", short: ["Nightshift processes personal data on your behalf, as a processor.", "Subprocessors are listed on the Subprocessors page.", "Data is encrypted in transit and at rest.", "For a signed DPA, write to hello@nightshiftai.ca."] },
  subprocessors: { title: "Subprocessors", short: ["Supabase: database and sign-in", "Vercel: hosting", "DeepSeek: AI models", "Tavily: web search", "Resend: email", "Stripe: billing"] },
  cookies: { title: "Cookies", short: ["One sign-in cookie keeps you signed in. Nothing for advertising or tracking."] },
};

export function generateStaticParams() {
  return Object.keys(DOCS).map((doc) => ({ doc }));
}

export default async function Legal({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const d = DOCS[doc];
  if (!d) notFound();
  return (
    <SitePage>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {Object.entries(DOCS).map(([k, v]) => (
          <Link key={k} href={`/legal/${k}`} style={{ padding: "7px 14px", borderRadius: 20, fontSize: 14, textDecoration: "none", background: k === doc ? "#2b2320" : "transparent", color: k === doc ? "#fbf3e6" : "#2b2320", border: "1px solid #cdbfac" }}>{v.title}</Link>
        ))}
      </div>
      <PageHead title={d.title} sub="Effective October 1, 2026" />
      <div style={{ background: "#fffbf4", border: "1px solid #e4d9ca", borderRadius: 16, padding: 24, maxWidth: 760 }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>The short version</div>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 15.5, lineHeight: 1.8 }}>{d.short.map((s) => <li key={s}>{s}</li>)}</ul>
      </div>
    </SitePage>
  );
}
