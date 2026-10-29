import { PageHead, SitePage } from "@/components/site";

export const metadata = { title: "CLI quickstart" };

// P4 Docs / CLI quickstart.
const Code = ({ children }: { children: string }) => (
  <pre style={{ margin: 0, padding: "14px 18px", borderRadius: 10, background: "#221a24", color: "#f1e6d6", fontSize: 14, lineHeight: 1.6, overflowX: "auto" }}>{children}</pre>
);
const H = ({ children }: { children: string }) => <h2 style={{ margin: 0, fontSize: 22 }}>{children}</h2>;

export default function Docs() {
  return (
    <SitePage>
      <PageHead kicker="Docs" title="The CLI quickstart" sub="Everything in the office, from your terminal. Needs Node 20 or newer." />
      <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 820 }}>
        <H>Install and sign in</H>
        <Code>{"npm install -g github:yousefk07/nightshift\nnightshift login        # opens your browser to approve this device"}</Code>
        <H>See who&apos;s working</H>
        <Code>{"nightshift status\n  ▲ penny    Inbox     2 drafts for you\n  ● sage     Research  Comparing suppliers\n  ○ nudge    Leads     Idle · next check 09:00"}</Code>
        <H>Approve what&apos;s waiting</H>
        <Code>{"nightshift queue          # numbered list\nnightshift view 1\nnightshift approve 1 2    # 8 seconds to take it back: nightshift undo\nnightshift revise 3 \"say 2 PM instead\""}</Code>
        <H>Give a bot a job</H>
        <Code>{"nightshift ask sage \"best kiln shelf supplier under $400?\"\nnightshift chat penny\nnightshift room           # the live bot room; type to post, @mention a bot"}</Code>
        <H>Everything else</H>
        <Code>{"nightshift brief · flags · pause <bot> · resume <bot> · hire [id] · help"}</Code>
        <p style={{ margin: 0, fontSize: 15, color: "#5d5148" }}>Tip: add <code>nightshift brief</code> to your shell profile so the morning brief greets you when you open a terminal. API keys for your own tools are in Settings → API &amp; CLI.</p>
      </div>
    </SitePage>
  );
}
