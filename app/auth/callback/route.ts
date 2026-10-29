import { sessionClient } from "@/lib/auth";

// Supabase's sign-in link lands here: swap the code for a session cookie, then go home.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (code) await (await sessionClient()).auth.exchangeCodeForSession(code);
  return Response.redirect(`${url.origin}/`, 302);
}
