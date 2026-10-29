import { HttpError, requireWrite, route } from "@/lib/auth";
import { importContacts, parseCsv } from "@/lib/connectors/crm";
import { supabaseStore } from "@/lib/store-supabase";

// "A spreadsheet works too": upload a CSV (text/csv body, or a multipart file). Columns are matched by header.
export const POST = route(async (req, me) => {
  requireWrite(me);
  let text: string;
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const file = (await req.formData()).get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Attach the CSV as 'file'.");
    text = await file.text();
  } else text = await req.text();
  if (text.length > 5_000_000) throw new HttpError(413, "That file is too big (5 MB max).");
  const rows = parseCsv(text);
  if (rows.length < 2) throw new HttpError(400, "The file needs a header row and at least one contact.");
  const n = await importContacts(supabaseStore(), me.ws.id, rows, "csv");
  return Response.json({ imported: n, skipped: rows.length - 1 - n });
});
