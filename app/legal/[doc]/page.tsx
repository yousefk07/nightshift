import Link from "next/link";
import { notFound } from "next/navigation";
import { Prose } from "@/components/Prose";
import { PageHead, SitePage } from "@/components/site";
import { DOCS } from "@/lib/legal";

// P5 Legal: the short version first, then the full text (lib/legal.ts).
export function generateStaticParams() {
  return Object.keys(DOCS).map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }) {
  const d = DOCS[(await params).doc];
  return d ? { title: d.title } : {};
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
      <PageHead title={d.title} sub={`Effective ${d.effective}`} />
      <div style={{ background: "#fffbf4", border: "1px solid #e4d9ca", borderRadius: 16, padding: 24, maxWidth: 760 }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>The short version</div>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 15.5, lineHeight: 1.8 }}>{d.short.map((s) => <li key={s}>{s}</li>)}</ul>
      </div>
      {d.sections && (
        <div style={{ maxWidth: 760, display: "flex", flexDirection: "column", gap: 26, fontSize: 15.5, lineHeight: 1.7, color: "#3a302b" }}>
          {d.sections.map((s, i) => (
            <section key={s.h}>
              <h2 style={{ fontSize: 19, margin: "0 0 8px", color: "#2b2320" }}>{i + 1}. {s.h}</h2>
              <Prose text={s.body} />
            </section>
          ))}
        </div>
      )}
    </SitePage>
  );
}
