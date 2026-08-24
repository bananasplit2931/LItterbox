const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("catnip", {
  getStatus: () => ipcRenderer.invoke("catnip:get-status"),
  completeOnboarding: () => ipcRenderer.invoke("catnip:complete-onboarding"),
  getTheme: () => ipcRenderer.invoke("catnip:get-theme"),
  setTheme: (partialTheme) => ipcRenderer.invoke("catnip:set-theme", partialTheme),
  resetTheme: () => ipcRenderer.invoke("catnip:reset-theme"),
  browseCgfFolder: () => ipcRenderer.invoke("catnip:browse-cgf-folder"),
  setCgfPath: (rawPath) => ipcRenderer.invoke("catnip:set-cgf-path", rawPath),
  listMods: () => ipcRenderer.invoke("catnip:list-mods"),
  activateMod: (slug) => ipcRenderer.invoke("catnip:activate-mod", slug),
  restoreVanilla: () => ipcRenderer.invoke("catnip:restore-vanilla"),
  deleteMod: (slug) => ipcRenderer.invoke("catnip:delete-mod", slug),
  openModsFolder: () => ipcRenderer.invoke("catnip:open-mods-folder"),
  addMod: (name) => ipcRenderer.invoke("catnip:add-mod", { name }),
  readImage: (filePath) => ipcRenderer.invoke("catnip:read-image", filePath),
});
