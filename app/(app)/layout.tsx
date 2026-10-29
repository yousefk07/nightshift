import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";

// Every signed-in screen: the top bar, the phone tab bar, the sign-in and onboarding gate, live updates.
// The Suspense boundary lets the shell read the URL on dynamic pages (chats/[kind]).
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#221a24" }} />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
