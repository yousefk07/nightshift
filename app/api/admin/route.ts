import { adminOverview, adminRoute } from "@/lib/admin";

// Admin: every workspace, user, failed run and the money, in one read.
export const GET = adminRoute(async () => Response.json(await adminOverview()));
