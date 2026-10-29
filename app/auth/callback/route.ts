import { connection } from "next/server";
import { sessionClient } from "@/lib/auth";

// Supabase's sign-in link (and Google / Microsoft sign-in) lands here: swap the code for a session cookie, then
// go where the person was headed. A used or expired link goes back to sign-in with "That link has expired".
export async function GET(req: Request) {
  await connection();
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next")?.startsWith("/") ? url.searchParams.get("next")! : "/office";
  if (url.searchParams.get("error")) return Response.redirect(`${url.origin}/signin?expired=1`, 302);
  // token_hash links (the email template appends &token_hash={{ .TokenHash }}&type=email) work in any browser;
  // ?code= links only work in the browser that asked for them
  const tokenHash = url.searchParams.get("token_hash");
  if (tokenHash) {
    const type = (url.searchParams.get("type") ?? "email") as "email" | "magiclink" | "signup" | "invite" | "recovery" | "email_change";
    const { error } = await (await sessionClient()).auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return Response.redirect(`${url.origin}/signin?expired=1`, 302);
  } else if (code) {
    const { error } = await (await sessionClient()).auth.exchangeCodeForSession(code);
    if (error) return Response.redirect(`${url.origin}/signin?expired=1`, 302);
  }
  return Response.redirect(`${url.origin}${next}`, 302);
}
