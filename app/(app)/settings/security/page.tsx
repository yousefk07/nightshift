"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "@/components/AppShell";
import { Page, Row, Section } from "@/components/settings";
import { Button, ErrorLine, Input, Pill } from "@/components/ui";
import { supabase } from "@/lib/client";

// Security (S6's lower half): two-step sign-in, sessions, the activity log and data export.
export default function SecurityPage() {
  const { me, toast } = useApp();
  const router = useRouter();
  const [factor, setFactor] = useState<{ id: string; status: string } | null>(null);
  const [enrolling, setEnrolling] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    const { data } = await supabase().auth.mfa.listFactors();
    setFactor(data?.totp?.[0] ?? null);
  };
  useEffect(() => { queueMicrotask(load); }, []);

  const enroll = async () => {
    setError(null);
    const { data, error } = await supabase().auth.mfa.enroll({ factorType: "totp", friendlyName: "Authenticator app" });
    if (error) return setError(error.message);
    setEnrolling({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  };
  const verify = async () => {
    if (!enrolling) return;
    const s = supabase();
    const ch = await s.auth.mfa.challenge({ factorId: enrolling.id });
    if (ch.error) return setError(ch.error.message);
    const v = await s.auth.mfa.verify({ factorId: enrolling.id, challengeId: ch.data.id, code });
    if (v.error) return setError(v.error.message);
    setEnrolling(null);
    toast({ text: "Two-step sign-in is on." });
    load();
  };
  const remove = async () => {
    if (!factor) return;
    const { error } = await supabase().auth.mfa.unenroll({ factorId: factor.id });
    if (error) return setError(error.message);
    load();
  };

  return (
    <Page title="Security" sub="Your team can draft. Only you and your approvers can send.">
      <ErrorLine error={error} />
      <Section>
        <Row first title="Two-step sign-in" sub="Authenticator app. Required to approve money once it's on.">
          {factor?.status === "verified" ? (<><Pill tone="green">On</Pill><Button size="sm" kind="ghost" onClick={remove}>Turn off</Button></>) : <Button size="sm" kind="outline" onClick={enroll}>Turn on</Button>}
        </Row>
        {enrolling && (
          <div style={{ padding: "0 18px 18px", display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- Supabase returns the QR as an SVG data URL */}
            <img src={enrolling.qr} alt="QR code for your authenticator app" width={160} height={160} style={{ background: "#fff", padding: 6, borderRadius: 8 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 14 }}>Scan it with your authenticator app, then enter the 6-digit code.</span>
              <span className="mono" style={{ fontSize: 12, color: "#776a5e" }}>Or enter: {enrolling.secret}</span>
              <div style={{ display: "flex", gap: 8 }}><Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} style={{ width: 120 }} /><Button size="sm" onClick={verify}>Confirm</Button></div>
            </div>
          </div>
        )}
        <Row title="Active sessions" sub="This browser, plus any other devices you've signed in on.">
          <Button size="sm" kind="outline" onClick={async () => { await supabase().auth.signOut({ scope: "others" }); toast({ text: "Signed out everywhere else." }); }}>Sign out others</Button>
        </Row>
        <Row title="Activity log" sub={`Every bot action and approval, kept for ${me.plan.limits.logDays ? (me.plan.limits.logDays >= 365 ? "1 year" : `${me.plan.limits.logDays} days`) : "as long as you're with us"}.`}>
          <Link href="/settings/activity"><Button size="sm" kind="outline">View log</Button></Link>
        </Row>
        {me.user.role === "owner" && (
          <Row title="Export your data" sub="Drafts, briefs, bot room history, documents, memory, contacts and settings as JSON.">
            <a href="/api/export"><Button size="sm" kind="outline">Download export</Button></a>
          </Row>
        )}
        <Row title="Sign out" sub={me.user.email}>
          <Button size="sm" kind="ghost" onClick={async () => { await supabase().auth.signOut(); router.push("/signin"); }}>Sign out</Button>
        </Row>
      </Section>
    </Page>
  );
}
