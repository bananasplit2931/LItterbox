// ---------- Elements ----------

const navLibrary = document.getElementById("navLibrary");
const navSettings = document.getElementById("navSettings");
const libraryView = document.getElementById("libraryView");
const settingsView = document.getElementById("settingsView");

const heroCard = document.getElementById("heroCard");
const modsGrid = document.getElementById("modsGrid");
const modCountLabel = document.getElementById("modCountLabel");
const errorBanner = document.getElementById("errorBanner");

const cgfPathValue = document.getElementById("cgfPathValue");
const changeCgfBtn = document.getElementById("changeCgfBtn");
const openModsFolderBtn = document.getElementById("openModsFolderBtn");

const accentSwatchRow = document.getElementById("accentSwatchRow");
const customAccentInput = document.getElementById("customAccentInput");
const resetAccentBtn = document.getElementById("resetAccentBtn");
const fontSelect = document.getElementById("fontSelect");

const setCgfPathModal = document.getElementById("setCgfPathModal");
const cgfPathInput = document.getElementById("cgfPathInput");
const cgfPathBrowseBtn = document.getElementById("cgfPathBrowseBtn");
const cgfPathCancelBtn = document.getElementById("cgfPathCancelBtn");
const cgfPathSaveBtn = document.getElementById("cgfPathSaveBtn");

const addModModal = document.getElementById("addModModal");
const modNameInput = document.getElementById("modNameInput");
const addModCancelBtn = document.getElementById("addModCancelBtn");
const addModConfirmBtn = document.getElementById("addModConfirmBtn");

const onboardingModal = document.getElementById("onboardingModal");
const onboardingStep1 = document.getElementById("onboardingStep1");
const onboardingStep2 = document.getElementById("onboardingStep2");
const onboardingStep1NextBtn = document.getElementById("onboardingStep1NextBtn");
const onboardingCgfPathInput = document.getElementById("onboardingCgfPathInput");
const onboardingBrowseBtn = document.getElementById("onboardingBrowseBtn");
const onboardingSkipBtn = document.getElementById("onboardingSkipBtn");
const onboardingFinishBtn = document.getElementById("onboardingFinishBtn");

// Tracks the mod slug that was just switched on, so the next render
// can give its hero card / tile a one-off "just activated" flourish
// instead of animating that way on every refresh.
let justActivatedSlug = null;

// Only decide whether to show onboarding on the very first refresh() —
// every later refresh (after activating a mod, etc.) shouldn't re-check.
let onboardingChecked = false;

// ---------- View switching (sidebar nav) ----------

const views = { library: libraryView, settings: settingsView };
const navButtons = { library: navLibrary, settings: navSettings };

function switchView(name) {
  for (const key of Object.keys(views)) {
    views[key].hidden = key !== name;
    navButtons[key].classList.toggle("nav-item--active", key === name);
  }
}

navLibrary.addEventListener("click", () => switchView("library"));
navSettings.addEventListener("click", () => switchView("settings"));

// ---------- Banner ----------

function showBanner(message, kind = "error") {
  errorBanner.textContent = message;
  errorBanner.classList.toggle("error-banner--info", kind === "info");
  errorBanner.hidden = false;
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => {
    errorBanner.hidden = true;
  }, 6000);
}

function showError(message) {
  showBanner(message, "error");
}

// ---------- Date formatting ----------
// Kept short and relative where it helps ("today", "yesterday"), full
// date otherwise. No time-of-day clutter — this is metadata, not a log.

function formatDate(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;

  const now = new Date();
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

function buildModMeta(mod, { forTile } = {}) {
  const parts = [];
  const added = formatDate(mod.addedAt);
  if (added) parts.push(forTile ? `added ${added}` : `Added ${added}`);

  if (mod.activationCount > 0) {
    const times = mod.activationCount === 1 ? "once" : `${mod.activationCount} times`;
    parts.push(`activated ${times}`);
  }

  return parts.join(" · ");
}

// ---------- Icon loading ----------

function applyIcon(container, mod) {
  if (mod.iconPath) {
    const img = document.createElement("img");
    img.alt = "";
    container.appendChild(img);
    window.catnip.readImage(mod.iconPath).then((dataUrl) => {
      if (dataUrl) img.src = dataUrl;
    });
  } else {
    container.textContent = mod.name.slice(0, 1).toUpperCase();
  }
}

// ---------- Hero (currently active version) ----------

function renderHero(status, mods) {
  heroCard.innerHTML = "";

  const activeMod = status.activeMod ? mods.find((m) => m.slug === status.activeMod) : null;

  heroCard.className = "hero" + (activeMod && activeMod.slug === justActivatedSlug ? " hero--just-activated" : "");

  const icon = document.createElement("div");
  icon.className = "hero-icon";

  const body = document.createElement("div");
  body.className = "hero-body";

  const eyebrow = document.createElement("div");
  eyebrow.className = "hero-eyebrow";
  eyebrow.textContent = "Now active";

  const title = document.createElement("div");
  title.className = "hero-title";

  const meta = document.createElement("div");
  meta.className = "hero-meta";

  body.appendChild(eyebrow);
  body.appendChild(title);
  body.appendChild(meta);

  if (activeMod) {
    applyIcon(icon, activeMod);
    title.textContent = activeMod.name;
    const lastActivated = formatDate(activeMod.lastActivatedAt);
    meta.textContent = lastActivated ? `Switched on ${lastActivated}` : "Currently active";
  } else {
    icon.textContent = "V";
    title.textContent = "Vanilla";
    meta.textContent = status.vanillaBackedUp ? "No mod active" : "Set your game folder to get started";
  }

  heroCard.appendChild(icon);
  heroCard.appendChild(body);

  if (activeMod) {
    const restoreBtn = document.createElement("button");
    restoreBtn.className = "hero-action";
    restoreBtn.textContent = "Restore vanilla";
    restoreBtn.addEventListener("click", async () => {
      restoreBtn.disabled = true;
      try {
        await window.catnip.restoreVanilla();
        await refresh();
      } catch (err) {
        showError(err.message || String(err));
        restoreBtn.disabled = false;
      }
    });
    heroCard.appendChild(restoreBtn);
  }
}

// ---------- Library grid ----------

function renderGrid(status, mods) {
  modsGrid.innerHTML = "";

  if (!status.cgfPath) {
    const hint = document.createElement("p");
    hint.className = "empty-hint";
    hint.textContent = "Set your game folder in Settings before adding mods.";
    modsGrid.appendChild(hint);
  }

  mods.forEach((mod, index) => {
    const isActive = status.activeMod === mod.slug;

    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "mod-tile" + (isActive ? " mod-tile--active" : "");
    tile.title = isActive ? "Currently active" : `Activate ${mod.name}`;
    tile.disabled = isActive;
    tile.style.setProperty("--tile-delay", `${Math.min(index, 8) * 35}ms`);
    if (mod.slug === justActivatedSlug) tile.classList.add("mod-tile--just-activated");
    tile.addEventListener("click", async () => {
      if (isActive) return;
      tile.disabled = true;
      try {
        await window.catnip.activateMod(mod.slug);
        justActivatedSlug = mod.slug;
        await refresh();
      } catch (err) {
        showError(err.message || String(err));
        tile.disabled = false;
      }
    });

    const icon = document.createElement("div");
    icon.className = "mod-tile-icon";
    applyIcon(icon, mod);

    const name = document.createElement("div");
    name.className = "mod-tile-name";
    const nameText = document.createElement("span");
    nameText.textContent = mod.name;
    nameText.style.overflow = "hidden";
    nameText.style.textOverflow = "ellipsis";
    name.appendChild(nameText);
    if (isActive) {
      const dot = document.createElement("span");
      dot.className = "mod-tile-active-dot";
      name.appendChild(dot);
    }

    const meta = document.createElement("div");
    meta.className = "mod-tile-meta";
    meta.textContent = buildModMeta(mod, { forTile: true });

    tile.appendChild(icon);
    tile.appendChild(name);
    tile.appendChild(meta);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "mod-tile-remove";
    removeBtn.textContent = "\u2715";
    removeBtn.title = isActive ? "Restore vanilla or activate a different mod first" : "Remove this mod";
    removeBtn.disabled = isActive;
    removeBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      removeBtn.disabled = true;
      try {
        const removed = await window.catnip.deleteMod(mod.slug);
        if (removed) await refresh();
      } catch (err) {
        showError(err.message || String(err));
      } finally {
        removeBtn.disabled = false;
      }
    });
    tile.appendChild(removeBtn);

    modsGrid.appendChild(tile);
  });

  const addTile = document.createElement("button");
  addTile.type = "button";
  addTile.className = "mod-tile-add";
  addTile.style.setProperty("--tile-delay", `${Math.min(mods.length, 8) * 35}ms`);
  addTile.innerHTML = '<span class="mod-tile-add-icon">+</span><span>Add mod</span>';
  addTile.addEventListener("click", () => {
    modNameInput.value = "";
    addModModal.hidden = false;
    modNameInput.focus();
  });
  modsGrid.appendChild(addTile);

  justActivatedSlug = null;
}

// ---------- Theme (accent color + font) ----------

const ACCENT_PRESETS = [
  { name: "Green (default)", value: "#4f9a5e" },
  { name: "Blue", value: "#4f7fd1" },
  { name: "Purple", value: "#8a63d2" },
  { name: "Amber", value: "#d98a3d" },
  { name: "Rose", value: "#d1618f" },
  { name: "Teal", value: "#3f9c96" },
];

// Font-stacks the accent picker's <select> can choose between. "system"
// matches Catnip's original look; the rest are bundled locally under
// renderer/fonts/ (see the @font-face rules in style.css) so switching
// fonts never needs a network request.
const FONT_STACKS = {
  system: '-apple-system, "SF Pro Text", "Segoe UI", Roboto, sans-serif',
  inter: '"Inter", -apple-system, "Segoe UI", Roboto, sans-serif',
  "space-grotesk": '"Space Grotesk", -apple-system, "Segoe UI", Roboto, sans-serif',
  "jetbrains-mono": '"JetBrains Mono", "SF Mono", Consolas, monospace',
  fredoka: '"Fredoka", -apple-system, "Segoe UI", Roboto, sans-serif',
};

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const value = parseInt(clean, 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

// Simple relative-luminance check (WCAG formula) to decide whether text
// drawn on top of the accent color should be white or near-black — matters
// once the accent is user-chosen instead of a single known-dark green.
function relativeLuminance({ r, g, b }) {
  const [rl, gl, bl] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

function shadeColor(hex, percent) {
  const { r, g, b } = hexToRgb(hex);
  const amount = Math.round(2.55 * percent);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  return rgbToHex({ r: clamp(r + amount), g: clamp(g + amount), b: clamp(b + amount) });
}

// Applies a theme object ({ accent, font }) to the document by setting CSS
// custom properties on :root — no page reload needed. accent-hover and
// accent-wash are derived from the single accent color instead of being
// stored, so any custom color the user picks gets consistent hover/wash
// shades for free.
function applyTheme(theme) {
  const root = document.documentElement.style;
  const rgb = hexToRgb(theme.accent);

  root.setProperty("--accent", theme.accent);
  root.setProperty("--accent-hover", shadeColor(theme.accent, -12));
  root.setProperty("--accent-wash", `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`);
  root.setProperty("--accent-text", relativeLuminance(rgb) > 0.5 ? "#1c1c1e" : "#ffffff");
  root.setProperty("--font-ui", FONT_STACKS[theme.font] || FONT_STACKS.system);
}

function renderAccentSwatches(activeAccent) {
  accentSwatchRow.querySelectorAll(".swatch").forEach((el) => el.remove());

  ACCENT_PRESETS.forEach((preset) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "swatch" + (preset.value.toLowerCase() === activeAccent.toLowerCase() ? " swatch--active" : "");
    swatch.style.background = preset.value;
    swatch.title = preset.name;
    swatch.addEventListener("click", () => chooseAccent(preset.value));
    accentSwatchRow.insertBefore(swatch, customAccentInput);
  });

  customAccentInput.value = activeAccent;
}

async function chooseAccent(value) {
  const theme = await window.catnip.setTheme({ accent: value });
  applyTheme(theme);
  renderAccentSwatches(theme.accent);
}

customAccentInput.addEventListener("input", () => chooseAccent(customAccentInput.value));

resetAccentBtn.addEventListener("click", async () => {
  const theme = await window.catnip.resetTheme();
  applyTheme(theme);
  renderAccentSwatches(theme.accent);
  fontSelect.value = theme.font;
});

fontSelect.addEventListener("change", async () => {
  const theme = await window.catnip.setTheme({ font: fontSelect.value });
  applyTheme(theme);
});

async function initTheme() {
  const theme = await window.catnip.getTheme();
  applyTheme(theme);
  renderAccentSwatches(theme.accent);
  fontSelect.value = theme.font;
}

// ---------- Refresh ----------

async function refresh() {
  const status = await window.catnip.getStatus();
  const mods = await window.catnip.listMods();

  renderHero(status, mods);
  renderGrid(status, mods);

  modCountLabel.textContent = mods.length === 1 ? "1 mod" : `${mods.length} mods`;
  cgfPathValue.textContent = status.cgfPath || "Not set";

  if (!onboardingChecked) {
    onboardingChecked = true;
    if (!status.onboardingComplete) showOnboarding(status);
  }
}

// ---------- Settings: game folder ----------

changeCgfBtn.addEventListener("click", async () => {
  const status = await window.catnip.getStatus();
  cgfPathInput.value = status.cgfPath || "";
  setCgfPathModal.hidden = false;
  cgfPathInput.focus();
});

cgfPathCancelBtn.addEventListener("click", () => {
  setCgfPathModal.hidden = true;
});

cgfPathBrowseBtn.addEventListener("click", async () => {
  const folder = await window.catnip.browseCgfFolder();
  if (folder) cgfPathInput.value = folder;
});

cgfPathSaveBtn.addEventListener("click", async () => {
  const rawPath = cgfPathInput.value.trim();
  if (!rawPath) return;
  try {
    await window.catnip.setCgfPath(rawPath);
    setCgfPathModal.hidden = true;
    await refresh();
  } catch (err) {
    showError(err.message || String(err));
  }
});

openModsFolderBtn.addEventListener("click", async () => {
  try {
    await window.catnip.openModsFolder();
  } catch (err) {
    showError(err.message || String(err));
  }
});

// ---------- Onboarding (first run: Gamma disclaimer + game folder) ----------

function showOnboardingStep(step) {
  onboardingStep1.hidden = step !== 1;
  onboardingStep2.hidden = step !== 2;
}

function showOnboarding(status) {
  onboardingCgfPathInput.value = status.cgfPath || "";
  showOnboardingStep(1);
  onboardingModal.hidden = false;
}

async function finishOnboarding() {
  await window.catnip.completeOnboarding();
  onboardingModal.hidden = true;
  await refresh();
}

onboardingStep1NextBtn.addEventListener("click", () => showOnboardingStep(2));

onboardingBrowseBtn.addEventListener("click", async () => {
  const folder = await window.catnip.browseCgfFolder();
  if (folder) onboardingCgfPathInput.value = folder;
});

onboardingSkipBtn.addEventListener("click", () => {
  finishOnboarding();
});

onboardingFinishBtn.addEventListener("click", async () => {
  const rawPath = onboardingCgfPathInput.value.trim();
  if (!rawPath) {
    // Nothing typed in — same outcome as Skip, not an error to report.
    finishOnboarding();
    return;
  }
  onboardingFinishBtn.disabled = true;
  try {
    await window.catnip.setCgfPath(rawPath);
    await finishOnboarding();
  } catch (err) {
    showError(err.message || String(err));
  } finally {
    onboardingFinishBtn.disabled = false;
  }
});

// ---------- Add mod ----------

addModCancelBtn.addEventListener("click", () => {
  addModModal.hidden = true;
});

addModConfirmBtn.addEventListener("click", async () => {
  const name = modNameInput.value.trim();
  if (!name) return;
  addModModal.hidden = true;
  try {
    const result = await window.catnip.addMod(name);
    if (result) {
      await refresh();
    } else {
      // User cancelled the native "pick data.win" dialog — this is a
      // normal, expected outcome, not an error.
      showBanner("Cancelled — no data.win was selected, so no mod was added. Click the \u201c+ Add mod\u201d tile to try again.", "info");
    }
  } catch (err) {
    showError(err.message || String(err));
  }
});

initTheme();
refresh();
