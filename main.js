// ============================================================
// Catnip — a small, standalone mod switcher for Cat Goes Fishing.
// Owns the mods folder, the vanilla data.win backup, and swapping
// files in the CGF install folder. The renderer only talks to this
// through preload.js/IPC — no direct filesystem access from the UI.
// ============================================================

const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs/promises");
const fsSync = require("fs");

// ---------- Paths ----------

function getAppDataDir() {
  return path.join(app.getPath("appData"), "Catnip");
}
function getModsDir() {
  return path.join(getAppDataDir(), "mods");
}
function getVanillaDir() {
  return path.join(getAppDataDir(), "_vanilla");
}
function getVanillaBackupPath() {
  return path.join(getVanillaDir(), "data.win");
}
function getConfigPath() {
  return path.join(getAppDataDir(), "config.json");
}

async function ensureDirs() {
  await fs.mkdir(getModsDir(), { recursive: true });
  await fs.mkdir(getVanillaDir(), { recursive: true });
}

async function readConfig() {
  try {
    const raw = await fs.readFile(getConfigPath(), "utf-8");
    const config = JSON.parse(raw);
    // Back-compat: configs written before onboarding existed have no
    // onboardingComplete field. Anyone who already has a game folder set
    // has effectively already done the equivalent of onboarding, so don't
    // interrupt an existing user with it after an update.
    if (config.onboardingComplete === undefined) {
      config.onboardingComplete = !!config.cgfPath;
    }
    return config;
  } catch {
    return { cgfPath: null, activeMod: null, onboardingComplete: false };
  }
}

async function writeConfig(config) {
  await fs.writeFile(getConfigPath(), JSON.stringify(config, null, 2), "utf-8");
}

// ---------- Theme (accent color + font) ----------
// Stored in config.json under "theme". Kept separate from cgfPath/activeMod
// since it's pure UI preference, not something the mod-swapping logic
// depends on. Validated on both read and write so a hand-edited or
// corrupted config.json can't push a broken value into the renderer.

const DEFAULT_THEME = { accent: "#4f9a5e", font: "system" };
const ACCENT_HEX_RE = /^#[0-9a-fA-F]{6}$/;
const ALLOWED_FONTS = ["system", "inter", "space-grotesk", "jetbrains-mono", "fredoka"];

function sanitizeTheme(theme) {
  const merged = { ...DEFAULT_THEME, ...(theme || {}) };
  if (!ACCENT_HEX_RE.test(merged.accent)) merged.accent = DEFAULT_THEME.accent;
  if (!ALLOWED_FONTS.includes(merged.font)) merged.font = DEFAULT_THEME.font;
  return merged;
}

async function getTheme() {
  const config = await readConfig();
  return sanitizeTheme(config.theme);
}

async function setTheme(partialTheme) {
  const config = await readConfig();
  const next = sanitizeTheme({ ...sanitizeTheme(config.theme), ...partialTheme });
  config.theme = next;
  await writeConfig(config);
  return next;
}

async function resetTheme() {
  const config = await readConfig();
  config.theme = { ...DEFAULT_THEME };
  await writeConfig(config);
  return config.theme;
}

// ---------- Path safety ----------
// Used to keep IPC handlers that take a filesystem path from the renderer
// (like read-image) from being tricked into reading files outside the
// directory they're meant to operate on — e.g. "../../.ssh/id_rsa" or an
// absolute path pointing somewhere sensitive.

function isPathInside(parentDir, targetPath) {
  const relative = path.relative(parentDir, targetPath);
  return !!relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

// ---------- CGF folder validation ----------

async function isValidCgfFolder(folderPath) {
  try {
    const stat = await fs.stat(path.join(folderPath, "data.win"));
    return stat.isFile();
  } catch {
    return false;
  }
}

// ---------- Vanilla backup ----------
// We only ever back up ONCE, the first time a CGF folder is set and
// before any mod has been activated. If a backup already exists we
// never overwrite it automatically — otherwise a second run after a
// mod is already active would "back up" an already-modded data.win.

async function backupVanillaIfNeeded(cgfPath) {
  const backupPath = getVanillaBackupPath();
  if (fsSync.existsSync(backupPath)) return false; // already have one
  await fs.copyFile(path.join(cgfPath, "data.win"), backupPath);
  return true;
}

// ---------- Mods ----------

function slugify(name) {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "mod"
  );
}

function getModJsonPath(modDir) {
  return path.join(modDir, "mod.json");
}

async function readModManifest(modDir) {
  return JSON.parse(await fs.readFile(getModJsonPath(modDir), "utf-8"));
}

async function writeModManifest(modDir, manifest) {
  await fs.writeFile(getModJsonPath(modDir), JSON.stringify(manifest, null, 2), "utf-8");
}

async function listMods() {
  await ensureDirs();
  const entries = await fs.readdir(getModsDir(), { withFileTypes: true });
  const mods = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const modDir = path.join(getModsDir(), entry.name);
    let manifest;
    try {
      manifest = await readModManifest(modDir);
    } catch {
      continue; // folder without a valid mod.json — skip it
    }
    if (!manifest.slug || !manifest.name) continue;
    const dataWinPath = path.join(modDir, `${manifest.slug}-data.win`);
    if (!fsSync.existsSync(dataWinPath)) continue;
    const iconPath = path.join(modDir, "icon.png");
    const bannerPath = path.join(modDir, "banner.png");
    mods.push({
      slug: manifest.slug,
      name: manifest.name,
      dataWinPath,
      iconPath: fsSync.existsSync(iconPath) ? iconPath : null,
      bannerPath: fsSync.existsSync(bannerPath) ? bannerPath : null,
      // Usage metadata — we don't launch or watch the game process, so
      // this is limited to what the launcher itself can observe: when
      // the mod was added, when it was last switched on, and how many
      // times it's been activated in total.
      addedAt: manifest.addedAt || null,
      lastActivatedAt: manifest.lastActivatedAt || null,
      activationCount: manifest.activationCount || 0,
    });
  }
  mods.sort((a, b) => a.name.localeCompare(b.name));
  return mods;
}

async function addModFromFiles({ name, dataWinSourcePath, iconSourcePath, bannerSourcePath }) {
  await ensureDirs();
  const slug = slugify(name);
  const modDir = path.join(getModsDir(), slug);
  await fs.mkdir(modDir, { recursive: true });

  await fs.copyFile(dataWinSourcePath, path.join(modDir, `${slug}-data.win`));
  if (iconSourcePath) await fs.copyFile(iconSourcePath, path.join(modDir, "icon.png"));
  if (bannerSourcePath) await fs.copyFile(bannerSourcePath, path.join(modDir, "banner.png"));

  await fs.writeFile(
    path.join(modDir, "mod.json"),
    JSON.stringify({ slug, name, source: "manual", addedAt: new Date().toISOString() }, null, 2),
    "utf-8"
  );

  return { slug, name };
}

async function activateMod(slug) {
  const config = await readConfig();
  if (!config.cgfPath) throw new Error("Cat Goes Fishing folder is not set yet.");
  await backupVanillaIfNeeded(config.cgfPath);

  const mods = await listMods();
  const mod = mods.find((m) => m.slug === slug);
  if (!mod) throw new Error(`Mod "${slug}" was not found.`);

  await fs.copyFile(mod.dataWinPath, path.join(config.cgfPath, "data.win"));

  // Record usage: bump the activation counter and stamp "last activated"
  // so the UI can show something more useful than just "Active".
  const modDir = path.dirname(mod.dataWinPath);
  const manifest = await readModManifest(modDir);
  manifest.lastActivatedAt = new Date().toISOString();
  manifest.activationCount = (manifest.activationCount || 0) + 1;
  await writeModManifest(modDir, manifest);

  config.activeMod = slug;
  await writeConfig(config);
  return config;
}

async function restoreVanilla() {
  const config = await readConfig();
  if (!config.cgfPath) throw new Error("Cat Goes Fishing folder is not set yet.");
  const backupPath = getVanillaBackupPath();
  if (!fsSync.existsSync(backupPath)) {
    throw new Error("No vanilla backup yet — no mod has been activated so there's nothing to restore from.");
  }
  await fs.copyFile(backupPath, path.join(config.cgfPath, "data.win"));

  config.activeMod = null;
  await writeConfig(config);
  return config;
}

async function getStatus() {
  await ensureDirs();
  const config = await readConfig();
  return {
    cgfPath: config.cgfPath,
    activeMod: config.activeMod,
    vanillaBackedUp: fsSync.existsSync(getVanillaBackupPath()),
    onboardingComplete: config.onboardingComplete,
  };
}

async function completeOnboarding() {
  const config = await readConfig();
  config.onboardingComplete = true;
  await writeConfig(config);
  return config;
}

async function deleteMod(win, slug) {
  const config = await readConfig();
  if (config.activeMod === slug) {
    throw new Error("This mod is currently active. Restore vanilla or activate a different mod before removing it.");
  }

  const mods = await listMods();
  const mod = mods.find((m) => m.slug === slug);
  if (!mod) throw new Error(`Mod "${slug}" was not found.`);

  const confirmation = await dialog.showMessageBox(win, {
    type: "warning",
    buttons: ["Cancel", "Remove"],
    defaultId: 0,
    cancelId: 0,
    message: `Remove "${mod.name}"?`,
    detail: "This permanently deletes its files from the mods folder.",
  });
  if (confirmation.response !== 1) return false; // cancelled

  await fs.rm(path.dirname(mod.dataWinPath), { recursive: true, force: true });
  return true;
}

async function openModsFolder() {
  await ensureDirs();
  const error = await shell.openPath(getModsDir());
  if (error) throw new Error(error);
}



async function browseCgfFolder(win) {
  const result = await dialog.showOpenDialog(win, {
    title: "Select your Cat Goes Fishing install folder (the one containing data.win)",
    properties: ["openDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
}

// Accepts either a folder path or a path to the game's .exe/binary
// itself (a common mix-up), plus "~" for the home dir — useful when
// pasting a path by hand instead of browsing, which matters on Linux/
// Steam Deck where hidden folders like ~/.local aren't shown by
// default in the native folder picker.
async function resolveCgfPathInput(rawPath) {
  let resolved = rawPath.trim();
  if (resolved.startsWith("~")) {
    resolved = path.join(os.homedir(), resolved.slice(1));
  }
  resolved = path.resolve(resolved);

  const stat = await fs.stat(resolved).catch(() => null);
  if (!stat) throw new Error("That path doesn't exist.");
  if (stat.isFile()) resolved = path.dirname(resolved); // pointed at the .exe itself

  return resolved;
}

async function setCgfPath(rawPath) {
  const folder = await resolveCgfPathInput(rawPath);
  if (!(await isValidCgfFolder(folder))) {
    throw new Error("No data.win found in that folder. Point it at the game's install folder (or its .exe).");
  }

  const config = await readConfig();
  config.cgfPath = folder;
  await writeConfig(config);
  return folder;
}

async function pickDataWinFile(win) {
  const result = await dialog.showOpenDialog(win, {
    title: "Select this mod's data.win file",
    filters: [{ name: "data.win", extensions: ["win"] }],
    properties: ["openFile"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
}

async function pickImageFile(win, title) {
  const result = await dialog.showOpenDialog(win, {
    title,
    filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg"] }],
    properties: ["openFile"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
}

// ---------- Window + IPC ----------

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 640,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(async () => {
  await ensureDirs();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("catnip:get-status", () => getStatus());
ipcMain.handle("catnip:complete-onboarding", () => completeOnboarding());
ipcMain.handle("catnip:get-theme", () => getTheme());
ipcMain.handle("catnip:set-theme", (_event, partialTheme) => setTheme(partialTheme));
ipcMain.handle("catnip:reset-theme", () => resetTheme());
ipcMain.handle("catnip:browse-cgf-folder", () => browseCgfFolder(mainWindow));
ipcMain.handle("catnip:set-cgf-path", (_event, rawPath) => setCgfPath(rawPath));
ipcMain.handle("catnip:list-mods", () => listMods());
ipcMain.handle("catnip:activate-mod", (_event, slug) => activateMod(slug));
ipcMain.handle("catnip:restore-vanilla", () => restoreVanilla());
ipcMain.handle("catnip:delete-mod", (_event, slug) => deleteMod(mainWindow, slug));
ipcMain.handle("catnip:open-mods-folder", () => openModsFolder());

ipcMain.handle("catnip:add-mod", async (_event, { name }) => {
  const dataWinSourcePath = await pickDataWinFile(mainWindow);
  if (!dataWinSourcePath) return null; // cancelled

  const iconSourcePath = await pickImageFile(mainWindow, "Select mod icon (optional — Cancel to skip)");
  const bannerSourcePath = await pickImageFile(mainWindow, "Select mod banner (optional — Cancel to skip)");

  return addModFromFiles({ name, dataWinSourcePath, iconSourcePath, bannerSourcePath });
});

ipcMain.handle("catnip:read-image", async (_event, filePath) => {
  if (!filePath) return null;
  try {
    const resolved = path.resolve(filePath);
    // Icons/banners only ever live inside the mods folder — anything else
    // is refused, so this handler can't be used to read arbitrary files
    // off the user's disk (e.g. if the renderer were ever compromised).
    if (!isPathInside(path.resolve(getModsDir()), resolved)) return null;

    const buf = await fs.readFile(resolved);
    const ext = path.extname(resolved).slice(1) || "png";
    return `data:image/${ext};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
});
