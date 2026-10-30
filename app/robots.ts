import type { MetadataRoute } from "next";

// Search engines see the public site; the app, admin and API stay out of results.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/office", "/desk", "/approvals", "/room", "/chats", "/settings", "/onboarding", "/device", "/invite"] },
    sitemap: "https://www.nightshiftai.ca/sitemap.xml",
  };
}
