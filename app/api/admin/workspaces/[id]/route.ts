import { adminRoute, adminWorkspace } from "@/lib/admin";

// Admin: one workspace in full, read-only.
export const GET = adminRoute<{ params: Promise<{ id: string }> }>(async (_req, { params }) => Response.json(await adminWorkspace((await params).id)));
