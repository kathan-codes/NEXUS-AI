const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("jarvisDesktop", {
  isElectron: true,
  getConfig: () => ipcRenderer.invoke("jarvis:get-config"),
  pickFolder: () => ipcRenderer.invoke("jarvis:pick-folder"),
  windowControl: (action) => ipcRenderer.invoke("jarvis:window-control", action),
});
