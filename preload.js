const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  openCsvDialog: () => ipcRenderer.invoke("open-csv-dialog"),
  previewCsv: (file) => ipcRenderer.invoke("preview-csv", file),
  runCsv: (file, options) => ipcRenderer.invoke("run-csv2sql", file, options),
  saveSqlDialog: (tempPath) => ipcRenderer.invoke("save-sql-dialog", tempPath)
});
