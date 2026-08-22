/**
 * Serves real, per-mod / per-profile Open Graph previews to link-unfurling
 * bots (Discord, Twitter/X, Slack, Telegram, etc.), while every normal
 * browser request passes straight through to GitHub Pages untouched.
 *
 * WHY THIS EXISTS
 * mod.html / profile.html are static files served by GitHub Pages. They
 * fill in the real title/description/image with JavaScript after the page
 * loads. Bots that unfurl links never run that JavaScript — they just read
 * whatever is in the raw HTML <head>. So without this Worker, every shared
 * mod/profile link shows the same generic card (see the static fallback
 * tags already added directly in mod.html / profile.html).
 *
 * HOW IT WORKS
 * 1. Cloudflare sits in front of litterbox.fyi as a reverse proxy (DNS
 *    "proxied" / orange-cloud) - GitHub Pages stays the actual host, this
 *    doesn't move the site anywhere.
 * 2. This Worker intercepts every request to the zone.
 * 3. If the request is for /mod.html or /profile.html AND the User-Agent
 *    matches a known bot -> fetch the mod/profile from Supabase's public
 *    REST API and return a small hand-built HTML page with the correct
 *    meta tags. No JS needed - bots don't run it anyway.
 * 4. Everything else (real visitors, all other paths) -> fetched from the
 *    real origin (GitHub Pages) and returned unchanged.
 *
 * SETUP
 * 1. Point your domain's DNS through Cloudflare (free plan is enough) if
 *    it isn't already, with the A/CNAME record for litterbox.fyi proxied
 *    (orange cloud) rather than DNS-only.
 * 2. Cloudflare Dashboard -> Workers & Pages -> Create Worker -> paste this
 *    file as the Worker's code.
 * 3. Workers & Pages -> your worker -> Settings -> Triggers -> Add Route:
 *      litterbox.fyi/*   (zone: litterbox.fyi)
 * 4. Deploy. Test with:
 *      curl -A "Discordbot/2.0" "https://litterbox.fyi/mod.html?id=27"
 *    You should see mod-specific <meta property="og:..."> tags in the
 *    response, while opening the same URL in a normal browser still shows
 *    the full site as before.
 */

const SUPABASE_URL = "https://psmwriziynkxzerdazqm.supabase.co";
const SUPABASE_KEY = "sb_publishable_nNsroxCkvj2QPBgy50MVFQ_HBElE4_b"; // public anon key, same one used client-side
const SITE_URL = "https://litterbox.fyi";
const DEFAULT_IMAGE = `${SITE_URL}/assets/og-image.png`;

// Add/remove user agents here as needed.
const BOT_UA_PATTERNS = [
  /discordbot/i,
  /twitterbot/i,
  /facebookexternalhit/i,
  /slackbot/i,
  /telegrambot/i,
  /whatsapp/i,
  /linkedinbot/i,
  /skypeuripreview/i,
  /redditbot/i,
  /vkshare/i,
  /googlebot/i,
  /bingbot/i,
  /embedly/i,
  /quora link preview/i,
  /outbrain/i,
  /pinterest/i,
  /applebot/i,
];

function isBot(userAgent) {
  if (!userAgent) return false;
  return BOT_UA_PATTERNS.some((re) => re.test(userAgent));
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function supabaseSelect(table, params) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params}`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

function metaPage({ title, description, image, url, extraHead = "" }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Litterbox">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">
${extraHead}
</head>
<body>
<p>Redirecting to <a href="${escapeHtml(url)}">${escapeHtml(url)}</a>...</p>
</body>
</html>`;
}

async function buildModMeta(modId) {
  const mod = await supabaseSelect(
    "mods",
    `select=id,name,description,icon_url,review_status&id=eq.${encodeURIComponent(modId)}&review_status=eq.approved`
  );
  const url = `${SITE_URL}/mod.html?id=${encodeURIComponent(modId)}`;
  if (!mod) {
    // Not found or not approved (pending/rejected mods stay invisible to bots too).
    return metaPage({
      title: "Litterbox - Cat Goes Fishing mods",
      description: "Browse mods for Cat Goes Fishing on Litterbox.",
      image: DEFAULT_IMAGE,
      url,
    });
  }
  return metaPage({
    title: `${mod.name} - Litterbox`,
    description: (mod.description || "Browse mods for Cat Goes Fishing on Litterbox.").slice(0, 200),
    image: mod.icon_url || DEFAULT_IMAGE,
    url,
  });
}

async function buildProfileMeta(username) {
  const profile = await supabaseSelect(
    "profiles",
    `select=username,bio,avatar_url&username=eq.${encodeURIComponent(username)}`
  );
  const url = `${SITE_URL}/profile.html?u=${encodeURIComponent(username)}`;
  if (!profile) {
    return metaPage({
      title: "Litterbox - Cat Goes Fishing mods",
      description: "Mod creator profiles on Litterbox.",
      image: DEFAULT_IMAGE,
      url,
    });
  }
  return metaPage({
    title: `${profile.username} - Litterbox`,
    description: (profile.bio || `${profile.username}'s mods on Litterbox.`).slice(0, 200),
    image: profile.avatar_url || DEFAULT_IMAGE,
    url,
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const userAgent = request.headers.get("User-Agent") || "";

    if (isBot(userAgent)) {
      if (url.pathname === "/mod.html") {
        const modId = url.searchParams.get("id");
        if (modId) {
          const html = await buildModMeta(modId);
          return new Response(html, { headers: { "content-type": "text/html; charset=UTF-8" } });
        }
      }
      if (url.pathname === "/profile.html") {
        const username = url.searchParams.get("u");
        if (username) {
          const html = await buildProfileMeta(username);
          return new Response(html, { headers: { "content-type": "text/html; charset=UTF-8" } });
        }
      }
    }

    // Everything else: pass straight through to the real origin (GitHub Pages), unchanged.
    return fetch(request);
  },
};
