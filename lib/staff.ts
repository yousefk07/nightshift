// Nightshift's own people (ADMIN_EMAILS): their workspaces are staff workspaces, on the Team plan with no trial
// and no billing, and they're left out of the admin view's revenue and counts.

export const adminEmails = () => (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
export const isStaff = (email: string | null | undefined) => !!email && adminEmails().includes(email.toLowerCase());
