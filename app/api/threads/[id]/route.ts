import { route } from "@/lib/auth";
import { admin, supabaseStore } from "@/lib/store-supabase";

export const GET = route<{ params: Promise<{ id: string }> }>(async (_req, me, { params }) => {
  const { id } = await params;
  const { data: thread } = await admin().from("threads").select("*").eq("id", id).eq("workspace_id", me.ws.id).maybeSingle();
  if (!thread) return Response.json({ error: "No such conversation." }, { status: 404 });
  return Response.json({ thread, messages: await supabaseStore().messages(id, 200) });
});
