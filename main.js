const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const { execFile } = require("child_process");
const fs = require("fs");

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 725,
    //minWidth: 900,
    //maxWidth: 900,
    //minHeight: 700,
    //maxHeight: 700,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      //devTools: false
    }
  });

  win.loadFile("index.html");
}

// Open native file dialog
ipcMain.handle("open-csv-dialog", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "CSV", extensions: ["csv"] }]
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// Preview CSV (first 5 lines)
ipcMain.handle("preview-csv", async (_, filePath) => {
  const data = fs.readFileSync(filePath, "utf8");
  return data.split(/\r?\n/).slice(0,5).join("\n");
});


ipcMain.handle("save-sql-dialog", async (_, tempPath) => {
  const { filePath, canceled } = await dialog.showSaveDialog({
    title: "Enregistrer le fichier SQL",
    defaultPath: "output.sql",
    filters: [{ name: "SQL Files", extensions: ["sql"] }]
  });

  if (canceled || !filePath) return null;

  // Copie le fichier généré vers le chemin choisi
  fs.copyFileSync(tempPath, filePath);
  return filePath;
});

// Run csv2insert
ipcMain.handle("run-csv2sql", async (_, filePath, options) => {
  const out = path.join(app.getPath("downloads"), "output.sql");
  await new Promise((resolve,reject)=>{
    const args = [path.join(__dirname,"csv2insert.js"), filePath, options.table||"data", out];
    if(options.batch) args.push(`--batch=${options.batch}`);
    if(options.withId) args.push(`--with-id`);

    execFile("node", args, err=>err?reject(err):resolve());
  });
  return out;
});

app.whenReady().then(createWindow);
