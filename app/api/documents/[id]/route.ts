import { HttpError, route } from "@/lib/auth";
import { supabaseStore } from "@/lib/store-supabase";

// One document. ?format=md downloads it as a Markdown file.
export const GET = route<{ params: Promise<{ id: string }> }>(async (req, me, { params }) => {
  const doc = await supabaseStore().document(me.ws.id, (await params).id);
  if (!doc) throw new HttpError(404, "No such document.");
  if (new URL(req.url).searchParams.get("format") === "md") {
    const name = doc.title.replace(/[^\w -]+/g, "").trim().slice(0, 60) || "document";
    return new Response(`# ${doc.title}\n\n${doc.body}`, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.md"` } });
  }
  return Response.json(doc);
});
