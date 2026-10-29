import { route } from "@/lib/auth";
import { deskView } from "@/lib/engine/flows";
import { supabaseStore } from "@/lib/store-supabase";

// Your desk / Approvals: today's brief, the numbered queue (`nightshift queue`), cards grouped for "Approve both".
export const GET = route(async (_req, me) => Response.json(await deskView(supabaseStore(), me.ws)));
