// ============================================================
// Litterbox — shared client, notifications bell, favorites, badges.
// Loaded via <script src="assets/app.js"> BEFORE each page's own
// inline script, so `supabaseClient` etc. below are already global
// by the time page scripts run. Page scripts should NOT redeclare
// SUPABASE_URL / SUPABASE_KEY / supabaseClient / TRUSTED_STORAGE_PREFIX.
// ============================================================

const SUPABASE_URL = "https://psmwriziynkxzerdazqm.supabase.co";
const SUPABASE_KEY = "sb_publishable_nNsroxCkvj2QPBgy50MVFQ_HBElE4_b";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const TRUSTED_STORAGE_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/mod-uploads/`;
const STORAGE_PREFIX = TRUSTED_STORAGE_PREFIX;

// ---------- Discord OAuth (used by login.html + register.html) ----------
// One call handles both sign-in and sign-up: Supabase creates the account
// on first login automatically. `button` gets disabled while the redirect
// kicks in, `msgEl` (the page's #formMsg) shows the error if the OAuth
// call itself fails before the redirect happens.
async function LB_signInWithDiscord(button, msgEl, redirectPath = "upload.html") {
  if (button) button.disabled = true;
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "discord",
    options: { redirectTo: `${window.location.origin}/${redirectPath}` }
  });
  if (error) {
    if (msgEl) {
      msgEl.textContent = error.message;
      msgEl.className = "form-msg error";
    }
    if (button) button.disabled = false;
  }
}

const BADGES = {
  downloads_5:   { icon: "⭳", label: "5 Downloads" },
  downloads_50:  { icon: "⭳", label: "50 Downloads" },
  downloads_100: { icon: "⭳", label: "100 Downloads" },
  favorites_10:  { icon: "★", label: "10 Favorites" },
};

const BELL_ICON = `<svg width="17" height="17" viewBox="0 0 20 20" fill="none"><path d="M5 8a5 5 0 0 1 10 0c0 3 1 4.2 1.5 5H3.5C4 12.2 5 11 5 8Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 15.5a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
const HEART_ICON = `<svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M10 17s-6.5-4-6.5-8.7A3.8 3.8 0 0 1 10 5.7 3.8 3.8 0 0 1 16.5 8.3C16.5 13 10 17 10 17Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
const HEART_ICON_FILLED = `<svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path d="M10 17s-6.5-4-6.5-8.7A3.8 3.8 0 0 1 10 5.7 3.8 3.8 0 0 1 16.5 8.3C16.5 13 10 17 10 17Z"/></svg>`;
const BELL_ICON_FILLED = `<svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path d="M5 8a5 5 0 0 1 10 0c0 3 1 4.2 1.5 5H3.5C4 12.2 5 11 5 8Z"/><path d="M8 15.5a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : str;
  return div.innerHTML;
}

function isTrustedStorageUrl(url) {
  return typeof url === "string" && url.startsWith(TRUSTED_STORAGE_PREFIX);
}

function iconInitials(name) {
  if (!name) return "?";
  const words = name.trim().split(/\s+/);
  return words.slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("") || "?";
}

const VERIFIED_BADGE = `
<svg class="verified-badge" viewBox="0 0 20 20" width="14" height="14" aria-label="Verified creator">
<circle cx="10" cy="10" r="10" fill="var(--color-accent)"/>
<path d="M6 10.2L8.7 13L14 7.3" fill="none" stroke="var(--color-bg-soft)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;
const STAR_ICON = `<svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path d="M10 1.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L1.3 7.8l6.1-.7z"/></svg>`;
const CLOCK_ICON = `<svg width="13" height="13" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7.3" stroke="currentColor" stroke-width="1.5"/><path d="M10 6v4.3l3 1.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const DOWNLOAD_ICON = `<svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M10 3v9.5M6 9l4 4 4-4M4 16.5h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function LB_renderRatingChip(rating, count) {
  const value = Number(rating) || 0;
  const countLabel = typeof count === "number" && count > 0 ? ` (${count})` : "";
  return `<span class="stat-chip stat-rating">${STAR_ICON}<strong>${value.toFixed(1)}</strong>${countLabel}</span>`;
}

// Renders one mod-row card — the single source of truth used by the browse
// list, the live upload/edit preview, and anywhere else a mod card appears.
function LB_renderModCard(mod, opts = {}) {
  const { currentUserId = null, clickable = true, localIconUrl = null } = opts;
  const safeIconUrl = localIconUrl || (isTrustedStorageUrl(mod.icon_url) ? escapeHtml(mod.icon_url) : null);
  const tag = clickable ? "a" : "div";
  const hrefAttr = clickable ? ` href="mod.html?id=${encodeURIComponent(mod.id)}"` : "";
  return `
  <${tag} class="mod-row"${hrefAttr}>
  <div class="mod-icon">
  ${safeIconUrl ? `<img src="${safeIconUrl}" alt="" loading="lazy">` : iconInitials(mod.name)}
  </div>
  <div class="mod-main">
  <div class="mod-title-row">
  <h3 class="mod-name">${escapeHtml(mod.name || "Untitled mod")}</h3>
  <span class="mod-author">by ${escapeHtml(mod.author || "unknown")}${mod.profiles?.is_verified ? VERIFIED_BADGE : ""}</span>
  </div>
  <p class="mod-desc">${escapeHtml(LB_stripMarkdown(mod.description) || "")}</p>
  <div class="mod-tags">
  ${mod.is_preview ? `<span class="tag-pill preview-pill">Preview</span>` : ""}
  ${mod.review_status === "pending" ? `<span class="tag-pill pending-pill">Awaiting review</span>` : ""}
  ${mod.review_status === "rejected" ? `<span class="tag-pill rejected-pill">Rejected</span>` : ""}
  ${clickable && currentUserId && mod.user_id === currentUserId ? `<span class="manage-link">Manage this mod →</span>` : ""}
  </div>
  </div>
  <div class="mod-side">
  ${LB_renderRatingChip(mod.rating, mod.rating_count)}
  <span class="stat-chip stat-dl">${DOWNLOAD_ICON}<strong>${LB_formatCount(mod.download_count ?? 0)}</strong></span>
  </div>
  </${tag}>
  `;
}

function LB_formatCount(n) {
  const num = Number(n) || 0;
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, "") + "m";
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(num);
}

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const then = new Date(dateStr).getTime();
  const diffSec = Math.max(1, Math.floor((Date.now() - then) / 1000));
  const units = [[31536000, "year"], [2592000, "month"], [86400, "day"], [3600, "hour"], [60, "minute"], [1, "second"]];
  for (const [secs, label] of units) {
    const val = Math.floor(diffSec / secs);
    if (val >= 1) return `${val} ${label}${val > 1 ? "s" : ""} ago`;
  }
  return "just now";
}

// ---------- Notification bell (mount into any header) ----------
async function LB_mountNotifications(anchorEl, userId) {
  if (!anchorEl || !userId) return;

  anchorEl.innerHTML = `
  <button class="nav-link icon-btn" id="lbNotifBtn" title="Notifications" aria-label="Notifications">
  ${BELL_ICON}<span class="notif-dot" id="lbNotifDot" hidden></span>
  </button>
  <div class="notif-panel" id="lbNotifPanel" hidden></div>
  `;

  const btn = document.getElementById("lbNotifBtn");
  const dot = document.getElementById("lbNotifDot");
  const panel = document.getElementById("lbNotifPanel");

  async function refresh() {
    const { data } = await supabaseClient
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

    const items = data || [];
    const unread = items.filter(n => !n.is_read).length;
    dot.hidden = unread === 0;

    panel.innerHTML = items.length
    ? items.map(n => {
      const tag = n.mod_id ? "a" : "div";
      const href = n.mod_id ? ` href="mod.html?id=${encodeURIComponent(n.mod_id)}"` : "";
      return `
      <${tag} class="notif-item${n.is_read ? "" : " unread"}"${href}>
      <p>${escapeHtml(n.message)}</p>
      <span>${timeAgo(n.created_at)}</span>
      </${tag}>
      `;
    }).join("")
    : `<div class="notif-empty">No notifications yet.</div>`;
  }

  btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const opening = panel.hidden;
    panel.hidden = !panel.hidden;
    if (opening) {
      await refresh();
      dot.hidden = true;
      await supabaseClient.from("notifications").update({ is_read: true }).eq("user_id", userId).eq("is_read", false);
    }
  });
  document.addEventListener("click", (e) => {
    if (!panel.hidden && !panel.contains(e.target) && e.target !== btn) panel.hidden = true;
  });

    await refresh();

    supabaseClient
    .channel(`notif-${userId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => {
      dot.hidden = false;
      if (!panel.hidden) refresh();
    })
    .subscribe();
}

// ---------- Favorite button (mounts + wires a heart toggle) ----------
async function LB_isFavorited(modId, userId) {
  if (!userId) return false;
  const { data } = await supabaseClient
  .from("mod_favorites")
  .select("mod_id")
  .eq("mod_id", modId)
  .eq("user_id", userId)
  .maybeSingle();
  return !!data;
}

async function LB_toggleFavorite(modId, userId, currentlyFavorited) {
  if (!userId) return currentlyFavorited;
  if (currentlyFavorited) {
    await supabaseClient.from("mod_favorites").delete().eq("mod_id", modId).eq("user_id", userId);
    return false;
  } else {
    await supabaseClient.from("mod_favorites").insert({ mod_id: modId, user_id: userId });
    return true;
  }
}

function LB_renderFavoriteBtn(favorited, count) {
  return `
  <button type="button" class="fav-btn${favorited ? " active" : ""}" id="lbFavBtn">
  ${favorited ? HEART_ICON_FILLED : HEART_ICON}
  <span id="lbFavCount">${LB_formatCount(count ?? 0)}</span>
  </button>
  `;
}

function LB_stripMarkdown(md) {
  if (!md) return "";
  return md
  .replace(/\[youtube\]\([^)]*\)/gi, "")
  .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
  .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
  .replace(/[#>*_`~-]/g, "")
  .replace(/\s+/g, " ")
  .trim();
}

let _lbPurifyReady = false;
function _lbEnsurePurifyHook() {
  if (_lbPurifyReady || typeof DOMPurify === "undefined") return;
  DOMPurify.addHook("uponSanitizeElement", (node, data) => {
    if (data.tagName === "iframe") {
      const src = node.getAttribute("src") || "";
      if (!src.startsWith("https://www.youtube.com/embed/")) node.remove();
    }
  });
  _lbPurifyReady = true;
}

function LB_renderMarkdown(md) {
  if (!md) return "";
  if (typeof marked === "undefined" || typeof DOMPurify === "undefined") {
    return `<p>${escapeHtml(md).replace(/\n/g, "<br>")}</p>`;
  }
  _lbEnsurePurifyHook();
  const withEmbeds = md.replace(/\[youtube\]\(([^)]+)\)/gi, (_, ref) => {
    const m = ref.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/) || ref.match(/^([a-zA-Z0-9_-]{11})$/);
    if (!m) return "";
    return `<div class="embed-yt"><iframe src="https://www.youtube.com/embed/${m[1]}" allowfullscreen loading="lazy" frameborder="0"></iframe></div>`;
  });
  const rawHtml = marked.parse(withEmbeds, { breaks: true });
  return DOMPurify.sanitize(rawHtml, { ADD_TAGS: ["iframe"], ADD_ATTR: ["allow", "allowfullscreen", "loading", "frameborder"] });
}

// ---------- Markdown editor (toolbar + write/preview tabs) ----------
function LB_mountMarkdownEditor(container, initialValue) {
  container.innerHTML = `
  <div class="md-editor">
  <div class="md-toolbar">
  <button type="button" class="md-btn" data-cmd="bold" title="Bold"><b>B</b></button>
  <button type="button" class="md-btn" data-cmd="italic" title="Italic"><i>I</i></button>
  <button type="button" class="md-btn" data-cmd="heading" title="Heading">H</button>
  <button type="button" class="md-btn" data-cmd="list" title="Bulleted list">&bull;</button>
  <button type="button" class="md-btn" data-cmd="quote" title="Quote">&rdquo;</button>
  <button type="button" class="md-btn" data-cmd="code" title="Code">&lt;/&gt;</button>
  <button type="button" class="md-btn" data-cmd="link" title="Link">🔗</button>
  <button type="button" class="md-btn" data-cmd="image" title="Image">🖼</button>
  <button type="button" class="md-btn" data-cmd="youtube" title="Embed YouTube video">▶</button>
  <div class="md-tabs">
  <button type="button" class="md-tab active" data-tab="write">Write</button>
  <button type="button" class="md-tab" data-tab="preview">Preview</button>
  </div>
  </div>
  <textarea class="md-textarea" maxlength="4000" placeholder="What does this mod change or add? Paste a YouTube link with the ▶ button to embed it."></textarea>
  <div class="md-preview" hidden></div>
  </div>
  `;

  const textarea = container.querySelector(".md-textarea");
  const previewEl = container.querySelector(".md-preview");
  textarea.value = initialValue || "";

  function insertAtCursor(text) {
    const start = textarea.selectionStart;
    const val = textarea.value;
    textarea.value = val.slice(0, start) + text + val.slice(start);
    const pos = start + text.length;
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = pos;
  }
  function wrapSelection(before, after = before) {
    const start = textarea.selectionStart, end = textarea.selectionEnd;
    const val = textarea.value;
    const selected = val.slice(start, end) || "text";
    textarea.value = val.slice(0, start) + before + selected + after + val.slice(end);
    textarea.focus();
    textarea.selectionStart = start + before.length;
    textarea.selectionEnd = start + before.length + selected.length;
  }
  function prefixLine(prefix) {
    const start = textarea.selectionStart;
    const val = textarea.value;
    const lineStart = val.lastIndexOf("\n", start - 1) + 1;
    textarea.value = val.slice(0, lineStart) + prefix + val.slice(lineStart);
    textarea.focus();
  }

  container.querySelectorAll("[data-cmd]").forEach(btn => {
    btn.addEventListener("click", () => {
      const cmd = btn.dataset.cmd;
      if (cmd === "bold") wrapSelection("**");
      else if (cmd === "italic") wrapSelection("_");
      else if (cmd === "heading") prefixLine("## ");
      else if (cmd === "list") prefixLine("- ");
      else if (cmd === "quote") prefixLine("> ");
      else if (cmd === "code") wrapSelection("`");
      else if (cmd === "link") { const url = prompt("Link URL:"); if (url) wrapSelection("[", `](${url})`); }
      else if (cmd === "image") { const url = prompt("Image URL:"); if (url) insertAtCursor(`![](${url})`); }
      else if (cmd === "youtube") { const url = prompt("YouTube video URL:"); if (url) insertAtCursor(`\n[youtube](${url})\n`); }
    });
  });

  container.querySelectorAll(".md-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      container.querySelectorAll(".md-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const showPreview = tab.dataset.tab === "preview";
      if (showPreview) previewEl.innerHTML = LB_renderMarkdown(textarea.value) || `<p class="empty-inline">Nothing to preview yet.</p>`;
      previewEl.hidden = !showPreview;
      textarea.hidden = showPreview;
    });
  });

  return {
    getValue: () => textarea.value,
    setValue: (v) => { textarea.value = v || ""; },
  };
}

// ---------- Follow button (get notified when a preview mod is released) ----------
async function LB_isFollowing(modId, userId) {
  if (!userId) return false;
  const { data } = await supabaseClient
  .from("mod_follows")
  .select("mod_id")
  .eq("mod_id", modId)
  .eq("user_id", userId)
  .maybeSingle();
  return !!data;
}

async function LB_toggleFollow(modId, userId, currentlyFollowing) {
  if (!userId) return currentlyFollowing;
  if (currentlyFollowing) {
    await supabaseClient.from("mod_follows").delete().eq("mod_id", modId).eq("user_id", userId);
    return false;
  } else {
    await supabaseClient.from("mod_follows").insert({ mod_id: modId, user_id: userId });
    return true;
  }
}

function LB_renderFollowBtn(following, count) {
  return `
  <button type="button" class="fav-btn follow-btn${following ? " active" : ""}" id="lbFollowBtn" title="${following ? "You'll be notified about this mod" : "Follow to get notified about this mod"}">
  ${following ? BELL_ICON_FILLED : BELL_ICON}
  <span id="lbFollowCount">${LB_formatCount(count ?? 0)}</span>
  </button>
  `;
}

// ---------- Changelogs / announcements (updates a mod owner posts) ----------
async function LB_loadChangelogs(modId) {
  const { data, error } = await supabaseClient
  .from("mod_changelogs")
  .select("*")
  .eq("mod_id", modId)
  .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading changelogs:", error);
    return [];
  }
  return data || [];
}

function LB_renderChangelogList(changelogs, opts = {}) {
  const { showDelete = false } = opts;

  if (!changelogs || changelogs.length === 0) {
    return `<p class="empty-inline">No updates posted yet.</p>`;
  }

  return `<div class="changelog-list">${changelogs.map(c => `
    <div class="changelog-item">
    <div class="changelog-item-head">
    <h3 class="changelog-title">${escapeHtml(c.title || (c.kind === "announcement" ? "Announcement" : "Update"))}</h3>
    <div class="changelog-item-meta">
    ${c.kind === "announcement"
      ? `<span class="tag-pill announcement-pill">Announcement</span>`
      : `<span class="tag-pill">Changelog</span>`}
      <span class="changelog-date">${timeAgo(c.created_at)}</span>
      </div>
      </div>
      <div class="changelog-body md-content">${LB_renderMarkdown(c.content)}</div>
      ${showDelete ? `<button type="button" class="changelog-delete-btn" data-delete-id="${c.id}">Delete this update</button>` : ""}
      </div>
      `).join("")}</div>`;
}

// ---------- Badge chips (for profile pages / mod owner strip) ----------
function LB_renderBadges(userBadges) {
  if (!userBadges || userBadges.length === 0) {
    return `<p class="empty-inline">No badges earned yet.</p>`;
  }
  return `<div class="badge-strip">${userBadges.map(b => {
    const meta = BADGES[b.badge_code] || { icon: "🏅", label: b.badge_code };
    return `<span class="badge badge-earned" title="${escapeHtml(meta.label)}">${meta.icon} ${escapeHtml(meta.label)}</span>`;
  }).join("")}</div>`;
}
