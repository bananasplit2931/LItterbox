# Catnip

A small, standalone mod switcher for Cat Goes Fishing. It manages `data.win`
swaps in your CGF install folder — no embedded browser, no download
automation, just a simple local mod manager.

## Features

- Backs up your original (vanilla) `data.win` the first time you point the
  app at your CGF folder, before any mod is ever activated. The folder can
  be typed/pasted directly (supports `~`, and forgives pointing at the
  game's `.exe` instead of its folder) or picked with the native folder
  browser — useful on Linux/Steam Deck, where hidden folders like
  `~/.local` aren't shown by default in the native picker.
- Add a mod by picking its `data.win` (and optionally an icon and banner)
  from disk. It gets copied into
  `%appdata%/Catnip/mods/<mod-slug>/<mod-slug>-data.win` (on Windows;
  `~/Library/Application Support/Catnip on macOS,
  `~/.config/Catnip on Linux).
- "Activate" copies that mod's `data.win` into your CGF folder.
- "Restore vanilla" copies your backed-up original back.
- "Remove" deletes a mod's folder for good, after a confirmation prompt.
  Blocked while that mod is the active one — restore vanilla or activate
  something else first.
- "Open mods folder" opens the mods directory in your file manager.

## Running it

```
npm install
npm start
```

## Building installers

Packaging is done with [electron-builder](https://www.electron.build/):

```
npm run package
```

Builds for the *current* OS only (electron-builder can't cross-compile a
Windows installer from Linux or vice versa without extra setup) — output
lands in `dist/`.

### GitHub Actions

`.github/workflows/build.yml` builds all three platforms on every push to
`main` (and on pull requests / manual runs), using a matrix of
`windows-latest` / `macos-latest` / `ubuntu-latest` runners — each just runs
`npm ci && npm run package` and uploads its own installer as a workflow
artifact. Push a tag like `v0.1.0` and it also collects all three builds
into a GitHub Release.

Nothing needs configuring for this to work as-is — no secrets required,
since the builds aren't code-signed. That means:
- Windows will show a SmartScreen "unknown publisher" warning on first run.
- macOS will refuse to open the app until you right-click → Open (Gatekeeper).

Both are expected for an unsigned indie build and not something to "fix"
without buying a code-signing certificate later on.

## Known limitations (MVP, not bugs to "fix" yet)

- Two mods with names that produce the same slug (e.g. "Grotto Expansion"
  and "grotto expansion") will collide in the same folder. Fine for now,
  worth revisiting once mods can be added automatically.
- No re-check on startup that the live `data.win` still matches what the
  app thinks is active — relevant once Steam's file-integrity checks or
  a game update silently reset it back to vanilla.
