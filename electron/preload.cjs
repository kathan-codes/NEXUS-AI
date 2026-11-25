const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nexusDesktop", {
  isElectron: true,
  getConfig: () => ipcRenderer.invoke("nexus:get-config"),
  pickFolder: () => ipcRenderer.invoke("nexus:pick-folder"),
  windowControl: (action) => ipcRenderer.invoke("nexus:window-control", action),
});
