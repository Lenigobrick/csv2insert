#!/usr/bin/env node
// csv2insert.js
// Usage:
//   node csv2insert.js input.csv [table_name] [output.sql] [--batch=500]
// Example:
//   node csv2insert.js datagouv.csv datagouvemp out.sql --batch=1000

const fs = require("fs");
const path = require("path");


// ---------- CLI ----------
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log("Usage: node csv2insert.js input.csv [table_name] [output.sql] [--batch=500]");
  process.exit(1);
}
const inputPath = args[0];
const tableName = args[1] || path.basename(inputPath).replace(/\.[^.]+$/, "");
const outputPath = args[2] || "output/output.sql";

let batchSize = 0;
for (let i = 3; i < args.length; i++) {
  if (args[i].startsWith("--batch=")) batchSize = parseInt(args[i].slice(8), 10) || 0;
}

// ---------- Helper: detect separator by first line ----------
function detectSeparator(sample) {
  // prefer semicolon, else comma, else tab
  const firstLine = sample.split(/\r?\n/)[0] || "";
  const counts = {
    ";": (firstLine.match(/;/g) || []).length,
    ",": (firstLine.match(/,/g) || []).length,
    "\t": (firstLine.match(/\t/g) || []).length,
  };
  if (counts[";"] >= counts[","] && counts[";"] >= counts["\t"]) return ";";
  if (counts[","] >= counts[";"] && counts[","] >= counts["\t"]) return ",";
  return "\t";
}

// ---------- CSV parser (state machine) ----------
function parseCSV(content, separator) {
  const rows = [];
  let row = [];
  let field = "";
  let i = 0;
  let inQuotes = false;
  while (i < content.length) {
    const ch = content[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < content.length && content[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        field += ch;
        i++;
        continue;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (ch === separator) {
        row.push(field);
        field = "";
        i++;
        continue;
      }
      if (ch === "\r") {
        if (i + 1 < content.length && content[i + 1] === "\n") i++;
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
        i++;
        continue;
      }
      if (ch === "\n") {
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
        i++;
        continue;
      }
      field += ch;
      i++;
    }
  }
  // EOF
  row.push(field);
  // ignore final empty row caused by trailing newline
  if (!(row.length === 1 && row[0] === "" && rows.length > 0)) rows.push(row);
  return rows;
}

// ---------- Type detection ----------
function isIntegerString(s) {
  return /^-?\d+$/.test(s);
}
function isFloatString(s) {
  return /^-?\d+(\.\d+)?$/.test(s);
}
function isIsoDateOnly(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function isIsoDateTime(s) {
  return /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s);
}
function looksLikeShortCode(s) {
  // codes like C2, EV, HXSM04QG, VI-A, VII-A, etc.
  // allow letters, digits, dash, slash, underscore; length <= 10
  return /^[A-Za-z0-9\-\/_]{1,10}$/.test(s);
}

function detectColumnTypes(rows, headers) {
  const n = headers.length;
  const types = new Array(n).fill("VARCHAR(255)");
  for (let c = 0; c < n; c++) {
    const values = [];
    for (let r = 0; r < rows.length; r++) {
      const cell = rows[r][c] ?? "";
      const v = String(cell).trim();
      if (v !== "") values.push(v);
    }
    if (values.length === 0) {
      types[c] = "VARCHAR(255)";
      continue;
    }
    const allInt = values.every(isIntegerString);
    if (allInt) {
      types[c] = "INT";
      continue;
    }
    const allFloat = values.every(isFloatString);
    if (allFloat) {
      types[c] = "FLOAT";
      continue;
    }
    const allIsoDate = values.every(isIsoDateOnly);
    if (allIsoDate) {
      types[c] = "DATE";
      continue;
    }
    const allIsoDateTime = values.every(v => isIsoDateOnly(v) || isIsoDateTime(v));
    if (allIsoDateTime) {
      types[c] = "TIMESTAMP";
      continue;
    }
    // short code heuristic: short length and matches allowed chars -> VARCHAR(10)
    const maxLen = values.reduce((m, v) => Math.max(m, v.length), 0);
    const manyShortCodes = values.length > 0 && values.filter(looksLikeShortCode).length / values.length >= 0.6;
    if (maxLen <= 10 && manyShortCodes) {
      types[c] = "VARCHAR(10)";
      continue;
    }
    // otherwise, choose VARCHAR(255) or smaller if maxLen small
    if (maxLen <= 50) types[c] = `VARCHAR(${Math.max(10, Math.min(255, Math.ceil(maxLen / 1) + 5))})`;
    else types[c] = "VARCHAR(255)";
  }
  return types;
}

// ---------- SQL helpers ----------
function escapeSqlString(s) {
  return s.replace(/'/g, "''");
}
function normalizeHeader(h) {
  // trim and replace spaces by underscore
  let s = String(h).trim();
  // remove BOM if present
  s = s.replace(/^\uFEFF/, "");
  // replace spaces and dots by underscore, remove weird chars
  s = s.replace(/[ \.]+/g, "_").replace(/[^\w\-]/g, "");
  if (s === "") s = "col";
  return s;
}

function sqlValueFor(rawVal, type) {
  const v = rawVal === undefined ? "" : String(rawVal).trim();
  if (v === "") return "NULL";
  if (type === "INT" && isIntegerString(v)) return v;
  if (type === "FLOAT" && isFloatString(v)) return v;
  if ((type === "DATE" || type === "TIMESTAMP") && (isIsoDateOnly(v) || isIsoDateTime(v))) {
    return `'${escapeSqlString(v)}'`;
  }
  return `'${escapeSqlString(v)}'`;
}

// ---------- Main ----------
try {
  const raw = fs.readFileSync(inputPath, "utf8");
  const sep = detectSeparator(raw);
  const rows = parseCSV(raw, sep);

  if (!rows || rows.length < 1) {
    console.error("CSV vide ou non lisible.");
    process.exit(1);
  }

  // first row are headers
  const rawHeaders = rows[0].map(h => String(h).trim());
  const headers = rawHeaders.map(normalizeHeader);

  // data rows
  const dataRows = rows.slice(1);

  // Normalize every data row to headers length
  for (let r = 0; r < dataRows.length; r++) {
    const diff = headers.length - dataRows[r].length;
    if (diff > 0) {
      for (let k = 0; k < diff; k++) dataRows[r].push("");
    } else if (diff < 0) {
      dataRows[r] = dataRows[r].slice(0, headers.length);
    }
  }

  const types = detectColumnTypes(dataRows, headers);

  // Build CREATE TABLE
  let sql = `-- Generated by csv2insert.js\n`;
  sql += `CREATE TABLE ${tableName} (\n`;
  sql += `  id INT AUTO_INCREMENT PRIMARY KEY,\n`;
  sql += headers
    .map((h, i) => `  ${h} ${types[i]}`)
    .join(",\n");
  sql += `\n);\n\n`;

  // Build INSERTs
  function chunkArray(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  const quotedHeadersList = headers.join(", ");
  if (batchSize > 0) {
    const chunks = chunkArray(dataRows, batchSize);
    for (const chunk of chunks) {
      sql += `INSERT INTO ${tableName} (${quotedHeadersList}) VALUES\n`;
      sql += chunk
        .map(row => "(" + row.map((cell, idx) => sqlValueFor(cell, types[idx])).join(", ") + ")")
        .join(",\n");
      sql += ";\n";
    }
  } else {
    for (const row of dataRows) {
      const values = row.map((cell, idx) => sqlValueFor(cell, types[idx])).join(", ");
      sql += `INSERT INTO ${tableName} (${quotedHeadersList}) VALUES (${values});\n`;
    }
  }

  fs.writeFileSync(outputPath, sql, "utf8");
  console.log(`✅ Généré : ${outputPath} (table: ${tableName}, sep: '${sep}', batch: ${batchSize || "none"})`);
} catch (err) {
  console.error("Erreur :", err.message);
  process.exit(1);
}

