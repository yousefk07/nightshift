import { route } from "@/lib/auth";
import { officeView } from "@/lib/engine/flows";
import { supabaseStore } from "@/lib/store-supabase";

// The office: every desk with its bot's status ("Comparing clay suppliers", "Needs you", "Idle · next check 9:00 AM"),
// plus the header counts ("4 working", "Penny needs you") and any blocked bots for the reconnect banner.
export const GET = route(async (_req, me) => Response.json(await officeView(supabaseStore(), me.ws)));
