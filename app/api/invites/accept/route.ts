import { z } from "zod";
import { body, route } from "@/lib/auth";
import { acceptInvite } from "@/lib/team";

// The invite link, opened while signed in. Returns the workspace to switch to (send it as x-workspace).
export const POST = route(async (req, me) => {
  const { token } = await body(req, (v) => z.object({ token: z.string().min(10) }).parse(v));
  return Response.json(await acceptInvite(token, me.userId, me.email));
});
