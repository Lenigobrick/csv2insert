document.getElementById("generateBtn").addEventListener("click", async () => {
  const fileInput = document.getElementById("csvFile");
  const tableName = document.getElementById("tableName").value || "table_csv";
  const addId = document.getElementById("addId").checked;
  const output = document.getElementById("output");

  if (!fileInput.files.length) {
    alert("Sélectionne un fichier CSV");
    return;
  }

  const file = fileInput.files[0];
  const text = await file.text();

  const sep = text.includes(";") ? ";" : ",";
  const lines = text.trim().split(/\r?\n/);

  const headers = lines[0].split(sep).map(h => h.trim());
  const rows = lines.slice(1).map(l => l.split(sep));

  // ---- Type detection ----
  function detectType(values) {
    const v = values.filter(x => x !== "");
    if (v.length === 0) return "VARCHAR(255)";
    if (v.every(x => /^-?\d+$/.test(x))) return "INT";
    if (v.every(x => /^-?\d+(\.\d+)?$/.test(x))) return "FLOAT";
    if (v.every(x => /^[A-Za-z0-9\-]{1,10}$/.test(x))) return "VARCHAR(10)";
    return "VARCHAR(255)";
  }

  const columnTypes = headers.map((_, i) =>
    detectType(rows.map(r => (r[i] || "").trim()))
  );

  // ---- CREATE TABLE ----
  let sql = `CREATE TABLE ${tableName} (\n`;
  if (addId) sql += `  id INT AUTO_INCREMENT PRIMARY KEY,\n`;

  headers.forEach((h, i) => {
    sql += `  ${h} ${columnTypes[i]}`;
    sql += i === headers.length - 1 ? "\n" : ",\n";
  });
  sql += `);\n\n`;

  // ---- INSERT ----
  rows.forEach(r => {
    const values = r.map((v, i) => {
      v = (v || "").trim();
      if (v === "") return "NULL";
      if (columnTypes[i].startsWith("INT") || columnTypes[i].startsWith("FLOAT")) return v;
      return `'${v.replace(/'/g, "''")}'`;
    });

    sql += `INSERT INTO ${tableName} (${headers.join(", ")}) VALUES (${values.join(", ")});\n`;
  });

  output.value = sql;
});

document.getElementById("downloadBtn").addEventListener("click", () => {
  const content = document.getElementById("output").value;
  if (!content) return;

  const blob = new Blob([content], { type: "text/sql" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "output.sql";
  a.click();
});
