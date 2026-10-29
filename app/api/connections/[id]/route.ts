import { route } from "@/lib/auth";
import { admin } from "@/lib/store-supabase";

// Disconnect a mailbox, Stripe or Shopify. The stored tokens are deleted.
export const DELETE = route<{ params: Promise<{ id: string }> }>(async (_req, me, { params }) => {
  const { id } = await params;
  const { error } = await admin().from("connections").delete().eq("id", id).eq("workspace_id", me.ws.id);
  if (error) throw new Error(error.message);
  return Response.json({ disconnected: true });
});
