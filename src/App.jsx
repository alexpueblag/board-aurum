// ===================================================================
// board-aurum-api · v6
// Cambios v5 → v6:
//   · getAll() ahora devuelve también historial y subtareas
//   · (Sin cambios en lógica; todo lo demás igual que v5)
// ===================================================================
const SHARED_SECRET = "aurum-2026-x9k7m4q2-secreto";
 
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    if (payload.secret !== SHARED_SECRET) return jsonResponse({ ok: false, error: "Unauthorized" });
    const action = payload.action;
    if (action === "ping")                return jsonResponse({ ok: true, message: "pong", version: "v6" });
    if (action === "update")              return updateTask(payload.id, payload.patch || {});
    if (action === "addLink")             return addLink(payload.id, payload.url, payload.label);
    if (action === "removeLink")          return removeLink(payload.id, payload.url);
    if (action === "create")              return createTask(payload.task || {});
    if (action === "delete")              return deleteTask(payload.id);
    if (action === "getAll")              return getAll();
    if (action === "setResponsableColor") return setResponsableColor(payload.responsable, payload.color);
    return jsonResponse({ ok: false, error: "Unknown action: " + action });
  } catch (err) {
    return jsonResponse({ ok: false, error: "doPost: " + String(err) });
  }
}
 
function doGet() {
  return jsonResponse({ ok: true, message: "board-aurum-api v6 OK. Usa POST." });
}
 
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
 
function getSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
}
 
function getHeaderMap(sheet) {
  const lastCol = sheet.getLastColumn();
  const headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const map = {};
  headerRow.forEach(function(h, i) {
    var key = String(h || "").trim().toLowerCase();
    if (key) map[key] = i + 1;
  });
  return { headerRow: headerRow, map: map };
}
 
function findRowById(id) {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === String(id).trim()) {
      return { row: i + 2, sheet: sheet };
    }
  }
  return null;
}
 
function parseLinkEntry(entry) {
  const text = String(entry || "").trim();
  if (!text) return null;
  const sepIdx = text.indexOf(" ~ ");
  if (sepIdx === -1) return { label: "Evidencia", url: text };
  return { label: text.substring(0, sepIdx).trim() || "Evidencia", url: text.substring(sepIdx + 3).trim() };
}
 
function serializeLinkEntry(label, url) {
  const cleanLabel = String(label || "Evidencia").replace(/\s*~\s*/g, "-").trim();
  return cleanLabel + " ~ " + url;
}
 
function readLinks(sheet, row, col) {
  const current = String(sheet.getRange(row, col).getValue() || "");
  return current.split("|").map(parseLinkEntry).filter(function(x) { return x; });
}
 
function writeLinks(sheet, row, col, links) {
  const out = links.map(function(l) { return serializeLinkEntry(l.label, l.url); }).join("|");
  sheet.getRange(row, col).setValue(out);
}
 
function updateTask(id, patch) {
  const found = findRowById(id);
  if (!found) return jsonResponse({ ok: false, error: "Tarea con id '" + id + "' no encontrada" });
  const row = found.row, sheet = found.sheet;
  const map = getHeaderMap(sheet).map;
  const updated = [], ignored = [];
  for (var key in patch) {
    var col = map[key.toLowerCase()];
    if (col) {
      sheet.getRange(row, col).setValue(patch[key]);
      updated.push(key);
    } else {
      ignored.push(key);
    }
  }
  return jsonResponse({ ok: true, action: "update", id: id, updated: updated, ignored: ignored });
}
 
function addLink(id, url, label) {
  if (!url) return jsonResponse({ ok: false, error: "Falta url" });
  const found = findRowById(id);
  if (!found) return jsonResponse({ ok: false, error: "Tarea con id '" + id + "' no encontrada" });
  const row = found.row, sheet = found.sheet;
  const col = getHeaderMap(sheet).map["links"];
  if (!col) return jsonResponse({ ok: false, error: "Columna 'links' no existe" });
  const links = readLinks(sheet, row, col);
  var exists = false;
  for (var i = 0; i < links.length; i++) if (links[i].url === url) { exists = true; break; }
  if (!exists) links.push({ label: label || "Evidencia", url: url });
  writeLinks(sheet, row, col, links);
  return jsonResponse({ ok: true, action: "addLink", id: id, url: url, label: label, total: links.length });
}
 
function removeLink(id, url) {
  if (!url) return jsonResponse({ ok: false, error: "Falta url" });
  const found = findRowById(id);
  if (!found) return jsonResponse({ ok: false, error: "Tarea con id '" + id + "' no encontrada" });
  const row = found.row, sheet = found.sheet;
  const col = getHeaderMap(sheet).map["links"];
  if (!col) return jsonResponse({ ok: false, error: "Columna 'links' no existe" });
  const links = readLinks(sheet, row, col).filter(function(l) { return l.url !== url; });
  writeLinks(sheet, row, col, links);
  return jsonResponse({ ok: true, action: "removeLink", id: id, url: url, total: links.length });
}
 
function createTask(task) {
  const sheet = getSheet();
  const headerRow = getHeaderMap(sheet).headerRow;
  var id = task.id;
  if (!id) {
    const lastRow = sheet.getLastRow();
    var max = 0;
    if (lastRow >= 2) {
      const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      ids.forEach(function(r) {
        var m = String(r[0]).match(/A-(\d+)/);
        if (m) max = Math.max(max, parseInt(m[1], 10));
      });
    }
    id = "A-" + String(max + 1).padStart(3, "0");
  }
  const row = headerRow.map(function(h) {
    var key = String(h || "").trim().toLowerCase();
    if (key === "id") return id;
    return task[key] !== undefined ? task[key] : "";
  });
  sheet.appendRow(row);
  return jsonResponse({ ok: true, action: "create", id: id });
}
 
function deleteTask(id) {
  const found = findRowById(id);
  if (!found) return jsonResponse({ ok: false, error: "Tarea con id '" + id + "' no encontrada" });
  found.sheet.deleteRow(found.row);
  return jsonResponse({ ok: true, action: "delete", id: id });
}
 
function parseLinksToObjects(value) {
  if (!value) return [];
  return String(value).split("|").map(function(entry, i) {
    const parsed = parseLinkEntry(entry);
    if (!parsed) return null;
    return { id: "link-" + (i + 1), label: parsed.label, url: parsed.url, fechaSubida: "", responsable: "" };
  }).filter(function(x) { return x; });
}
 
function getAll() {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2) return jsonResponse({ ok: true, tasks: [] });
  const headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const headers = headerRow.map(function(h) { return String(h || "").trim().toLowerCase(); });
  const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const tasks = [];
  for (var r = 0; r < data.length; r++) {
    const row = data[r];
    const obj = {};
    for (var c = 0; c < headers.length; c++) obj[headers[c]] = row[c];
    if (!obj.actividad && !obj.proyecto) continue;
    tasks.push({
      id: String(obj.id || "").trim(),
      mes: String(obj.mes || ""),
      mesCompromiso: String(obj.mes || ""),
      empresa: String(obj.empresa || ""),
      proyecto: String(obj.proyecto || ""),
      responsable: String(obj.responsable || ""),
      semana: String(obj.semana || ""),
      actividad: String(obj.actividad || ""),
      entregable: String(obj.entregable || ""),
      fecha: String(obj.fecha || ""),
      estado: String(obj.estado || "Pendiente"),
      prioridad: String(obj.prioridad || "Media"),
      observaciones: String(obj.observaciones || ""),
      links: parseLinksToObjects(String(obj.links || "")),
      color: String(obj.color || ""),
      archivada: String(obj.archivada || "").toLowerCase() === "true",
      fechaTerminado: String(obj.fechaterminado || ""),
      historial: String(obj.historial || ""),
      subtareas: String(obj.subtareas || ""),
    });
  }
  return jsonResponse({ ok: true, tasks: tasks });
}
 
function setResponsableColor(responsable, color) {
  if (!responsable) return jsonResponse({ ok: false, error: "Falta responsable" });
  const sheet = getSheet();
  const map = getHeaderMap(sheet).map;
  const colResp = map["responsable"];
  const colColor = map["color"];
  if (!colResp) return jsonResponse({ ok: false, error: "Falta columna 'responsable'" });
  if (!colColor) return jsonResponse({ ok: false, error: "Falta columna 'color' — agrégala al Sheet" });
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return jsonResponse({ ok: true, updated: 0 });
  const data = sheet.getRange(2, colResp, lastRow - 1, 1).getValues();
  var updated = 0;
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(responsable).trim()) {
      sheet.getRange(i + 2, colColor).setValue(color);
      updated++;
    }
  }
  return jsonResponse({ ok: true, action: "setResponsableColor", responsable: responsable, color: color, updated: updated });
}
 
function testPing() {
  const result = doPost({ postData: { contents: JSON.stringify({ secret: SHARED_SECRET, action: "ping" }) } });
  Logger.log(result.getContent());
}
 
