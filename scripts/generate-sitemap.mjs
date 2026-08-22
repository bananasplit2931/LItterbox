// Regenerates sitemap.xml from live data. Uses the same public anon key
// that's already embedded in assets/app.js (client-side) — safe to reuse
// here since it can only read what RLS already allows anyone to read
// (approved mods, public profiles).
//
// Run manually:   node scripts/generate-sitemap.mjs
// Run in CI:       see .github/workflows/update-sitemap.yml

const SUPABASE_URL = "https://psmwriziynkxzerdazqm.supabase.co";
const SUPABASE_KEY = "sb_publishable_nNsroxCkvj2QPBgy50MVFQ_HBElE4_b";
const SITE_URL = "https://litterbox.fyi";

async function fetchAll(table, select, extraQuery = "") {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}${extraQuery}`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${table}: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function xmlEscape(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function main() {
  const mods = await fetchAll("mods", "id,created_at", "&review_status=eq.approved&order=created_at.desc");
  const profiles = await fetchAll("profiles", "username,created_at", "&username=not.is.null");

  const staticPages = [
    { loc: `${SITE_URL}/`, changefreq: "daily", priority: "1.0" },
    { loc: `${SITE_URL}/register.html`, changefreq: "monthly", priority: "0.3" },
    { loc: `${SITE_URL}/login.html`, changefreq: "monthly", priority: "0.3" },
  ];

  const modUrls = mods.map((m) => ({
    loc: `${SITE_URL}/mod.html?id=${m.id}`,
    lastmod: (m.created_at || "").slice(0, 10),
    changefreq: "weekly",
    priority: "0.8",
  }));

  const profileUrls = profiles.map((p) => ({
    loc: `${SITE_URL}/profile.html?u=${encodeURIComponent(p.username)}`,
    changefreq: "weekly",
    priority: "0.5",
  }));

  const all = [...staticPages, ...modUrls, ...profileUrls];

  const body = all
    .map((u) => {
      const lastmod = u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : "";
      return `  <url><loc>${xmlEscape(u.loc)}</loc>${lastmod}<changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;

  const fs = await import("node:fs/promises");
  await fs.writeFile(new URL("../sitemap.xml", import.meta.url), xml);
  console.log(`sitemap.xml written: ${mods.length} mods, ${profiles.length} profiles`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
