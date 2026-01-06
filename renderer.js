const dropZone = document.getElementById("drop-zone");
const preview = document.getElementById("preview");
let filePath = null;

// Click → open native dialog
dropZone.onclick = async () => {
  const file = await window.api.openCsvDialog();
  if(file) loadFile({ path: file, name: file.split(/[\\/]/).pop() });
};

// Drag events
["dragenter","dragover"].forEach(e=>{
  dropZone.addEventListener(e,ev=>{ ev.preventDefault(); dropZone.classList.add("drag"); });
});
["dragleave","drop"].forEach(e=>{
  dropZone.addEventListener(e,ev=>{ ev.preventDefault(); dropZone.classList.remove("drag"); });
});

dropZone.addEventListener("drop", e=>{
  const file = e.dataTransfer.files[0];
  if(file) loadFile(file);
});

// Load file
function loadFile(file){
  if(!file.path){ preview.textContent="⚠️ Impossible de récupérer le chemin"; filePath=null; return;}
  filePath = file.path;
  dropZone.innerHTML = `<strong>${file.name}</strong>`;
  window.api.previewCsv(filePath).then(text=> preview.textContent=text);
}

// Convert button
document.getElementById("convert").onclick = async () => {
  if(!filePath) return alert("Aucun fichier");

  document.getElementById("status").textContent = "⏳ Conversion...";

  // Génère le SQL et récupère le chemin temporaire
  const tempOut = await window.api.runCsv(filePath,{
    table: document.getElementById("table").value,
    batch: document.getElementById("batch").value,
    withId: document.getElementById("withId").checked
  });

  // Demande à l'utilisateur où enregistrer le fichier final
  const finalPath = await window.api.saveSqlDialog(tempOut);
  if(finalPath) {
    document.getElementById("status").textContent = `✅ SQL sauvegardé : ${finalPath}`;
  } else {
    document.getElementById("status").textContent = "⚠️ Sauvegarde annulée";
  }
};
