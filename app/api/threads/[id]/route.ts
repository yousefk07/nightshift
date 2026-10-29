import { route } from "@/lib/auth";
import { admin, supabaseStore } from "@/lib/store-supabase";

// One conversation, with the approval cards its messages refer to (so drafts render inline with Approve & send).
export const GET = route<{ params: Promise<{ id: string }> }>(async (req, me, { params }) => {
  const { id } = await params;
  const { data: thread } = await admin().from("threads").select("*").eq("id", id).eq("workspace_id", me.ws.id).maybeSingle();
  if (!thread) return Response.json({ error: "No such conversation." }, { status: 404 });
  const store = supabaseStore();
  const messages = await store.messages(id, { limit: 200, after: new URL(req.url).searchParams.get("after") ?? undefined });
  const ids = [...new Set(messages.flatMap((m) => (m.data.action_ids as string[] | undefined) ?? []))];
  const { data: actions } = ids.length ? await admin().from("actions").select("*").in("id", ids) : { data: [] };
  return Response.json({ thread, messages, actions });
});
