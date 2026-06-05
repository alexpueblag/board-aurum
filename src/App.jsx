import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Megaphone, Home, Compass, Building2, Users, Folder,
  ChevronDown, ChevronRight, ChevronLeft, Plus, Link2, X, RefreshCw,
  AlertCircle, CheckCircle2, Clock, Zap, Settings, Eye, EyeOff,
  Play, Archive, Calendar, LayoutGrid, BarChart3, Printer,
  Sun, Moon, AlertTriangle, History, Trash2,
  GanttChartSquare, CalendarClock, MessageSquare, RotateCcw, Send, LogOut, Lock, Sparkles, Copy
} from "lucide-react";

// ===================================================================
// CONFIGURACION
// ===================================================================
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby4EhOo4UkQcdFjaw5evVuLF6MeKXlDf1lJFKQPA6lyrmAWhwk6Gc_VxjqMU3IFZWyM/exec";
const SHARED_SECRET = "aurum-2026-x9k7m4q2-secreto";

const ASSETS = {
  logos: {
    "Aurum Arquitectos": "https://lh3.googleusercontent.com/d/1Yqwx2HNO1xveThRfGGTgQqLwQ7Rhurc5=w400",
    "YoDesarrollo": "https://lh3.googleusercontent.com/d/1MusXx_SQyLmTAt5fg6oMg0GaRSkDFrck=w400",
  },
};

const DEBOUNCE_MS = 1500;
const PROTECTION_MS = 60 * 1000;
const REFRESH_MS = 5 * 60 * 1000;
const SAVED_FLASH_MS = 1800;
const CACHE_KEY = "aurum-cache-v5";
const THEME_KEY = "aurum-theme";


class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("[ErrorBoundary]", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: "2rem", maxWidth: 640, margin: "3rem auto", background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: 8, fontFamily: "system-ui" }}>
          <h2 style={{ color: "#991B1B", marginTop: 0 }}>Algo salió mal</h2>
          <p style={{ color: "#555" }}>Hubo un error al renderizar esta parte del board. Recarga con Ctrl+Shift+R. Si persiste, abre la consola (F12) y manda el error.</p>
          <details style={{ marginTop: "1rem" }}>
            <summary style={{ cursor: "pointer", color: "#777", fontSize: "0.85rem" }}>Detalles técnicos</summary>
            <pre style={{ fontSize: "0.75rem", overflow: "auto", color: "#444", background: "#fff", padding: "0.5rem" }}>{String(this.state.error && this.state.error.stack || this.state.error)}</pre>
          </details>
          <button onClick={() => this.setState({ error: null })} style={{ marginTop: "1rem", padding: "0.5rem 1rem", background: "#1a1a1a", color: "#fff", border: 0, borderRadius: 4, cursor: "pointer" }}>Intentar de nuevo</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const SHEET_FIELDS = ["mes", "empresa", "proyecto", "responsable", "semana", "actividad", "entregable", "fecha", "estado", "observaciones", "prioridad", "archivada", "fechaTerminado", "color", "historial", "subtareas", "comentarios", "borrada"];
const FIELD_TO_SHEET = { mesCompromiso: "mes" };

// Estados — "Subido"/"En standby" ahora se normalizan a "En standby"
const ESTADOS = ["Pendiente", "En proceso", "En standby", "Terminado"];
const ESTADO_SLUG = {
  "Pendiente": "pendiente",
  "En proceso": "en-proceso",
  "En standby": "en-standby",
  "Terminado": "terminado",
  // Aliases para compatibilidad con datos viejos
  "En standby": "en-standby",
  "Subido": "en-standby",
  "Detenido": "en-standby",
};
function estadoSlug(estado) { return ESTADO_SLUG[estado] || "pendiente"; }
function normalizeEstado(estado) {
  if (!estado) return "Pendiente";
  const e = String(estado).trim().toLowerCase();
  if (e === "pendiente") return "Pendiente";
  if (e === "en proceso" || e === "en-proceso") return "En proceso";
  if (e === "en standby" || e === "en standby." || e === "en revisión" || e === "en revision" || e === "subido" || e === "detenido") return "En standby";
  if (e === "terminado" || e === "completado") return "Terminado";
  return "Pendiente";
}

const PRIORIDADES = ["Alta", "Media", "Baja"];
const EMPRESAS = ["Aurum Arquitectos", "YoDesarrollo"];
const ORDER_EMPRESAS = ["Aurum Arquitectos", "YoDesarrollo"];
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MESES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MONTH_INDEX = MESES.reduce((acc, m, i) => ({ ...acc, [m]: i }), {});
const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DIAS_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const PROJECT_ORDER_KEY = "aurum-project-order-v1";

const PALETTE_DEFAULTS = [
  "#0F172A", "#1976A3", "#C84949", "#6B7280",
  "#15803D", "#A16207", "#7C3AED", "#0F766E",
  "#BE185D", "#1D4ED8", "#9F1239", "#365314"
];
const COLOR_PICKER_SWATCHES = [
  "#0F172A", "#1976A3", "#C84949", "#6B7280", "#15803D", "#A16207",
  "#7C3AED", "#0F766E", "#BE185D", "#1D4ED8", "#9F1239", "#365314"
];

// ===================================================================
// UTILIDADES
// ===================================================================
function todayStamp() { return new Date().toISOString().slice(0, 10); }
function makeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `T-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function normalizeUrl(url) {
  const t = String(url || "").trim();
  if (!t) return "";
  if (t.startsWith("http://") || t.startsWith("https://")) return t;
  return "https://" + t;
}
function emptyTask() {
  return { mes: "Mayo", mesCompromiso: "Mayo", empresa: "YoDesarrollo", proyecto: "", responsable: "", semana: "", actividad: "", entregable: "", fecha: "", estado: "Pendiente", prioridad: "Media", observaciones: "", links: [], archivada: false, fechaTerminado: "", historial: "", subtareas: "" };
}

// Plantillas de proyecto: crean de un jalón las tareas típicas. Solo frontend (acción "create" normal).
const PROJECT_TEMPLATES = [
  {
    id: "arq",
    nombre: "Proyecto arquitectónico (Aurum)",
    empresa: "Aurum Arquitectos",
    tasks: [
      { actividad: "Levantamiento y medición del terreno", entregable: "Plano de levantamiento", prioridad: "Alta" },
      { actividad: "Anteproyecto / propuesta de diseño", entregable: "Anteproyecto", prioridad: "Alta" },
      { actividad: "Proyecto ejecutivo (planos)", entregable: "Planos ejecutivos", prioridad: "Alta" },
      { actividad: "Trámites y permisos", entregable: "Permisos aprobados", prioridad: "Media" },
      { actividad: "Presupuesto de obra", entregable: "Presupuesto", prioridad: "Media" },
      { actividad: "Entrega a cliente", entregable: "Paquete final entregado", prioridad: "Media" },
    ],
  },
  {
    id: "dev",
    nombre: "Desarrollo de software (YoDesarrollo)",
    empresa: "YoDesarrollo",
    tasks: [
      { actividad: "Definición de requerimientos", entregable: "Documento de requerimientos", prioridad: "Alta" },
      { actividad: "Diseño UI/UX", entregable: "Prototipo / mockups", prioridad: "Alta" },
      { actividad: "Desarrollo", entregable: "Funcionalidad construida", prioridad: "Alta" },
      { actividad: "Pruebas", entregable: "Reporte de pruebas", prioridad: "Media" },
      { actividad: "Despliegue / entrega", entregable: "Producto en producción", prioridad: "Media" },
    ],
  },
  {
    id: "generico",
    nombre: "Proyecto genérico (básico)",
    empresa: "YoDesarrollo",
    tasks: [
      { actividad: "Arranque / kickoff", entregable: "", prioridad: "Media" },
      { actividad: "Planeación", entregable: "Plan de trabajo", prioridad: "Media" },
      { actividad: "Ejecución", entregable: "", prioridad: "Media" },
      { actividad: "Revisión", entregable: "", prioridad: "Media" },
      { actividad: "Cierre", entregable: "Entrega final", prioridad: "Media" },
    ],
  },
];

// Color helpers
function hexToRgb(hex) {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return { r: 100, g: 100, b: 100 };
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
function rgbToHex(r, g, b) {
  const clamp = (x) => Math.max(0, Math.min(255, Math.round(x)));
  return "#" + [clamp(r), clamp(g), clamp(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}
function softVariant(hex) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * 0.92, g + (255 - g) * 0.92, b + (255 - b) * 0.92);
}
function darkVariant(hex) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * 0.55, g * 0.55, b * 0.55);
}
function hashName(name) {
  let h = 0;
  const s = String(name || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function personPalette(name, colorOverrides) {
  const override = colorOverrides && colorOverrides[name];
  const main = override || PALETTE_DEFAULTS[hashName(name) % PALETTE_DEFAULTS.length];
  return { main, soft: softVariant(main), text: darkVariant(main) };
}

function getDayNumber(f) { const m = String(f || "").match(/(\d{1,2})/); return m ? +m[1] : null; }
function commitmentDate(t) {
  const d = getDayNumber(t.fecha);
  const m = MONTH_INDEX[t.mesCompromiso || t.mes];
  if (d == null || m == null) return null;
  return new Date(new Date().getFullYear(), m, d);
}
function daysUntil(t) {
  const tg = commitmentDate(t);
  if (!tg) return null;
  const today = new Date();
  return Math.round((tg - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
}
function fechaCorta(t) {
  const m = t.mesCompromiso || t.mes || "";
  const d = getDayNumber(t.fecha);
  const sh = MESES_CORTO[MONTH_INDEX[m]] || m.slice(0, 3);
  return d ? `${sh} ${d}` : t.fecha || "—";
}
function fechaTerminadoCorta(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return null;
  return `${MESES_CORTO[m - 1] || ""} ${d}`;
}
function isOverdue(t) {
  if (t.estado === "Terminado") return false;
  const d = daysUntil(t);
  return d != null && d < 0;
}
function isDueToday(t) {
  if (t.estado === "Terminado") return false;
  return daysUntil(t) === 0;
}
function urgencyScore(t) {
  if (t.estado === "Terminado") return 999999;
  const d = daysUntil(t);
  const sw = { Pendiente: 0, "En proceso": 0.15, "En standby": 0.3 }[normalizeEstado(t.estado)] ?? 0.5;
  const pw = { Alta: -100, Media: 0, Baja: 50 }[t.prioridad] || 0;
  return (d == null ? 9999 : d) + sw + pw;
}
function timeAgo(date) {
  if (!date) return "—";
  const d = Math.floor((Date.now() - date.getTime()) / 1000);
  if (d < 60) return `hace ${d}s`;
  if (d < 3600) return `hace ${Math.floor(d / 60)} min`;
  if (d < 86400) return `hace ${Math.floor(d / 3600)} h`;
  return date.toLocaleString();
}
function iconForProject(name) {
  const n = String(name || "").toLowerCase();
  if (n.includes("promotora")) return Megaphone;
  if (n.includes("alysa")) return Home;
  if (n.includes("miramar")) return Compass;
  if (n.includes("rnm")) return Building2;
  if (n.includes("clientes") || n.includes("nuevos")) return Users;
  return Folder;
}
function getInitials(name) {
  return String(name || "?").split(/\s+/).map(p => p[0]).join("").slice(0, 2).toUpperCase();
}
function isoWeekNumber(y, m, d) {
  const target = new Date(Date.UTC(y, m - 1, d));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
}
function deriveDateFields(dateStr) {
  if (!dateStr) return { mes: "", fecha: "", semana: "" };
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return { mes: "", fecha: "", semana: "" };
  const date = new Date(y, m - 1, d);
  return { mes: MESES[m - 1], fecha: `${DIAS_SEMANA[date.getDay()]} ${d}`, semana: `Semana ${isoWeekNumber(y, m, d)}` };
}
function reconstructDateStr(task) {
  const m = MONTH_INDEX[task.mesCompromiso || task.mes];
  const d = getDayNumber(task.fecha);
  if (m == null || d == null) return "";
  const year = new Date().getFullYear();
  return `${year}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Bitácora / historial
function parseHistorial(str) {
  if (!str) return [];
  return String(str).split("|").map(e => {
    const parts = e.trim().split(" ");
    const fecha = parts.shift();
    const estado = parts.join(" ");
    if (!fecha || !estado) return null;
    return { fecha, estado };
  }).filter(Boolean);
}
function appendHistorial(historialActual, nuevoEstado) {
  const entries = parseHistorial(historialActual);
  const last = entries[entries.length - 1];
  if (last && last.estado === nuevoEstado) return historialActual; // no duplicar
  const nueva = `${todayStamp()} ${nuevoEstado}`;
  return historialActual ? `${historialActual}|${nueva}` : nueva;
}

// Subtareas (checklist) — formato: "texto:done|texto:done"
function parseSubtareas(str) {
  if (!str) return [];
  return String(str).split("|").map((e, i) => {
    const idx = e.lastIndexOf(":");
    if (idx === -1) return { id: i, texto: e.trim(), done: false };
    return { id: i, texto: e.slice(0, idx).trim(), done: e.slice(idx + 1).trim() === "1" };
  }).filter(s => s.texto);
}
function serializeSubtareas(items) {
  return items.map(s => `${s.texto}:${s.done ? "1" : "0"}`).join("|");
}

// Comentarios — formato: "autor~fecha~texto|||autor~fecha~texto"
function parseComentarios(str) {
  if (!str) return [];
  return String(str).split("|||").map((e, i) => {
    const parts = e.split("~");
    if (parts.length < 3) return null;
    return { id: i, autor: parts[0].trim(), fecha: parts[1].trim(), texto: parts.slice(2).join("~").trim() };
  }).filter(c => c && c.texto);
}
function serializeComentarios(items) {
  return items.map(c => `${c.autor}~${c.fecha}~${c.texto.replace(/[~|]/g, " ")}`).join("|||");
}

// Métricas
function calcProjectMetrics(tasksInProject) {
  const total = tasksInProject.length;
  const term = tasksInProject.filter(t => t.estado === "Terminado").length;
  const overdue = tasksInProject.filter(isOverdue).length;
  const soon = tasksInProject.filter(t => { const d = daysUntil(t); return t.estado !== "Terminado" && d != null && d >= 0 && d <= 7; }).length;
  const pct = total ? Math.round((term / total) * 100) : 0;
  const openTotal = total - term;
  const overdueRatio = openTotal > 0 ? overdue / openTotal : 0;
  let risk = "ok";
  if (overdue >= 3 || overdueRatio >= 0.5) risk = "critico";
  else if (overdue >= 1) risk = "riesgo";
  else if (soon >= 2) risk = "atencion";
  return { total, term, overdue, soon, pct, risk, openTotal };
}
function calcWeekStats(tasks) {
  const today = new Date();
  const weekAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
  const terminadasSemana = tasks.filter(t => {
    if (t.estado !== "Terminado") return false;
    const ref = t.fechaTerminado || t.actualizado;
    return ref && new Date(ref) >= weekAgo;
  }).length;
  const revisionSemana = tasks.filter(t => {
    if (t.estado !== "En standby") return false;
    return t.actualizado && new Date(t.actualizado) >= weekAgo;
  }).length;
  const vencenSemana = tasks.filter(t => { const d = daysUntil(t); return t.estado !== "Terminado" && d != null && d >= 0 && d <= 7; }).length;
  return { terminadasSemana, revisionSemana, vencenSemana };
}
function calcMetricsFor(list) {
  const total = list.length;
  const term = list.filter(t => normalizeEstado(t.estado) === "Terminado").length;
  const rev = list.filter(t => normalizeEstado(t.estado) === "En standby").length;
  const pen = list.filter(t => normalizeEstado(t.estado) === "Pendiente").length;
  const proc = list.filter(t => normalizeEstado(t.estado) === "En proceso").length;
  const overdue = list.filter(isOverdue).length;
  return { total, term, rev, pen, proc, overdue, avance: total ? Math.round(term / total * 100) : 0 };
}

// Calendario
function buildMonthMatrix(year, month) {
  const first = new Date(year, month, 1);
  const startDay = first.getDay(); // 0 dom
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// ===================================================================
// API
// ===================================================================
async function apiCall(action, payload = {}) {
  const body = JSON.stringify({ secret: SHARED_SECRET, action, ...payload });
  let res;
  try {
    res = await fetch(APPS_SCRIPT_URL, { method: "POST", body, headers: { "Content-Type": "text/plain;charset=utf-8" }, redirect: "follow" });
  } catch (netErr) { throw new Error(`Red/CORS: ${netErr.message}`); }
  if (!res.ok) { const txt = await res.text().catch(() => ""); throw new Error(`HTTP ${res.status}: ${txt.slice(0, 120)}`); }
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`Respuesta no es JSON: ${text.slice(0, 200)}`); }
  if (!data.ok) throw new Error(data.error || "Error desconocido");
  return data;
}
function patchToSheet(patch) {
  const out = {};
  for (const k in patch) {
    const sk = FIELD_TO_SHEET[k] || k;
    if (SHEET_FIELDS.includes(sk)) out[sk] = typeof patch[k] === "boolean" ? String(patch[k]) : patch[k];
  }
  return out;
}

// ===================================================================
// MAIN
// ===================================================================

// ===================================================================
// MOTOR DE DIAGNÓSTICOS (deploy 4) — defensivo, nunca lanza excepciones
// ===================================================================
const DIAG_RULES = {
  PERSONA_SOBRECARGADA: 8,
  PERSONA_EN_RIESGO: 2,
  PROYECTO_CRITICO_ATRASOS: 3,
  PROYECTO_CRITICO_PCT: 50,
  PROYECTO_RIESGO_ATRASOS: 1,
  ATENCION_VENCEN_7D: 2,
  VIEJA_DIAS: 7,
};

function _safeDaysUntil(t) {
  try { if (!t) return null; return daysUntil(t); } catch { return null; }
}
function _safeNormEstado(t) {
  try { if (!t || !t.estado) return "Pendiente"; return normalizeEstado(t.estado); } catch { return "Pendiente"; }
}
function _isOverdueTask(t) {
  if (!t) return false;
  const d = _safeDaysUntil(t);
  return d !== null && d < 0 && _safeNormEstado(t) !== "Terminado";
}
function _sortByUrgency(tasks) {
  if (!Array.isArray(tasks)) return [];
  return [...tasks].sort((a, b) => {
    const da = _safeDaysUntil(a);
    const db = _safeDaysUntil(b);
    if (da === null && db === null) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  });
}
function _topN(obj, n = 3) {
  try { return Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).slice(0, n); } catch { return []; }
}
function _groupCount(tasks, key) {
  const r = {};
  if (!Array.isArray(tasks)) return r;
  tasks.forEach(t => { try { const k = t && t[key]; if (k) r[k] = (r[k] || 0) + 1; } catch {} });
  return r;
}

function _emptyResult(title = "Sin información") {
  return { title, tasks: [], insights: [], actions: [] };
}

function runDiagnostics(allTasks, mode, params = {}) {
  try {
    if (!Array.isArray(allTasks)) return _emptyResult();
    const active = allTasks.filter(t => t && !t.archivada && !t.borrada);

    if (mode === "estado") {
      const estado = params && params.estado;
      if (!estado) return _emptyResult();
      const tasks = active.filter(t => _safeNormEstado(t) === estado);
      return _diagEstado(tasks, estado);
    }
    if (mode === "atrasadas") {
      const tasks = active.filter(_isOverdueTask);
      return _diagAtrasadas(tasks);
    }
    if (mode === "avance") return _diagAvance(active);
    if (mode === "total") return _diagTotal(active);
    if (mode === "proyecto") {
      const key = params && params.projectKey;
      if (!key) return _emptyResult();
      const tasks = active.filter(t => `${t.empresa}::${t.proyecto}` === key);
      return _diagProyecto(tasks, params.empresa, params.proyecto);
    }
    if (mode === "persona") {
      const persona = params && params.persona;
      if (!persona) return _emptyResult();
      const tasks = active.filter(t => t.responsable === persona);
      return _diagPersona(tasks, persona);
    }
    return _emptyResult();
  } catch (err) {
    console.error("[runDiagnostics]", err);
    return _emptyResult("Error al calcular diagnóstico");
  }
}

function _diagEstado(tasks, estado) {
  try {
    const insights = [], actions = [];
    const overdue = tasks.filter(_isOverdueTask).length;
    const alta = tasks.filter(t => t && t.prioridad === "Alta").length;
    const dueSoon = tasks.filter(t => { const d = _safeDaysUntil(t); return d !== null && d >= 0 && d <= 7; }).length;
    const topProj = _topN(_groupCount(tasks, "proyecto"), 3);
    const topPers = _topN(_groupCount(tasks, "responsable"), 3);

    if (overdue > 0) insights.push({ icon: "alert", text: `${overdue} ya están vencidas` });
    if (alta > 0) insights.push({ icon: "zap", text: `${alta} de prioridad alta` });
    if (dueSoon > 0) insights.push({ icon: "clock", text: `${dueSoon} vencen esta semana` });
    if (topProj.length > 0) insights.push({ icon: "folder", text: `Por proyecto: ${topProj.map(([n, c]) => `${n} (${c})`).join(" · ")}` });
    if (topPers.length > 0) insights.push({ icon: "users", text: `Por persona: ${topPers.map(([n, c]) => `${n} (${c})`).join(" · ")}` });

    if (estado === "En standby" && overdue > 0) actions.push(`Bloquea 30 min hoy para revisar — destrabarías ${overdue} atrasos directos`);
    else if (estado === "En proceso" && overdue > 0) actions.push(`${overdue} en proceso ya están vencidas — acelera o pide ayuda`);
    else if (estado === "Pendiente" && alta > 0) actions.push(`Empieza por las ${alta} de prioridad alta esta semana`);
    else if (estado === "Pendiente" && dueSoon > 0) actions.push(`${dueSoon} vencen esta semana — agéndalas hoy`);
    else if (estado === "Terminado" && tasks.length > 0) actions.push(`Excelente — ${tasks.length} cerradas en el periodo. ¡Sigue así!`);

    return { title: `${tasks.length} tareas en ${estado.toLowerCase()}`, tasks: _sortByUrgency(tasks), insights, actions };
  } catch (err) { console.error("[_diagEstado]", err); return _emptyResult(estado); }
}

function _diagAtrasadas(tasks) {
  try {
    const insights = [], actions = [];
    if (tasks.length === 0) return { title: "Sin atrasos", tasks: [], insights: [{ icon: "check", text: "Todo al día. Bien jugado." }], actions: [] };
    const sorted = _sortByUrgency(tasks);
    const masVieja = sorted[0];
    const diasVieja = masVieja ? Math.abs(_safeDaysUntil(masVieja) || 0) : 0;
    const viejas = tasks.filter(t => { const d = _safeDaysUntil(t); return d !== null && Math.abs(d) > DIAG_RULES.VIEJA_DIAS; }).length;
    const topProj = _topN(_groupCount(tasks, "proyecto"), 3);
    const topPers = _topN(_groupCount(tasks, "responsable"), 3);

    if (masVieja) insights.push({ icon: "alert", text: `La más vieja: "${masVieja.actividad || "(sin título)"}" (${masVieja.proyecto || ""}) — ${diasVieja} días vencida` });
    if (viejas > 0) insights.push({ icon: "clock", text: `${viejas} llevan más de 7 días vencidas` });
    if (topProj.length > 0) insights.push({ icon: "folder", text: `Concentración: ${topProj.map(([n, c]) => `${n} (${c})`).join(" · ")}` });
    if (topPers.length > 0) insights.push({ icon: "users", text: `Por persona: ${topPers.map(([n, c]) => `${n} (${c})`).join(" · ")}` });

    if (topProj.length > 0) {
      const [topName, topCount] = topProj[0];
      const pct = Math.round((topCount / tasks.length) * 100);
      if (pct >= 50) actions.push(`${pct}% de los atrasos están en ${topName} — atácalo primero`);
    }
    if (viejas > 0) actions.push(`Empieza por las ${viejas} más viejas — cada día sin atender genera ruido`);

    return { title: `${tasks.length} tareas atrasadas`, tasks: sorted, insights, actions };
  } catch (err) { console.error("[_diagAtrasadas]", err); return _emptyResult("Atrasadas"); }
}

function _diagAvance(tasks) {
  try {
    const insights = [], actions = [];
    const total = tasks.length;
    const term = tasks.filter(t => _safeNormEstado(t) === "Terminado").length;
    const pct = total > 0 ? Math.round((term / total) * 100) : 0;
    insights.push({ icon: "check", text: `${term} de ${total} tareas completadas` });

    const byEmp = {};
    tasks.forEach(t => {
      if (!t || !t.empresa) return;
      if (!byEmp[t.empresa]) byEmp[t.empresa] = { total: 0, term: 0 };
      byEmp[t.empresa].total++;
      if (_safeNormEstado(t) === "Terminado") byEmp[t.empresa].term++;
    });
    Object.entries(byEmp).forEach(([emp, m]) => {
      const p = m.total > 0 ? Math.round((m.term / m.total) * 100) : 0;
      insights.push({ icon: "building", text: `${emp}: ${p}% (${m.term}/${m.total})` });
    });

    if (pct < 30) actions.push("Avance bajo — revisa qué está bloqueando el cierre");
    else if (pct >= 70) actions.push("Buen ritmo — mantén la inercia");

    return { title: `Avance general: ${pct}%`, tasks: [], insights, actions };
  } catch (err) { console.error("[_diagAvance]", err); return _emptyResult("Avance"); }
}

function _diagTotal(tasks) {
  try {
    const insights = [], actions = [];
    const overdue = tasks.filter(_isOverdueTask).length;
    const open = tasks.filter(t => _safeNormEstado(t) !== "Terminado").length;
    const dueSoon = tasks.filter(t => { const d = _safeDaysUntil(t); return d !== null && d >= 0 && d <= 7; }).length;

    insights.push({ icon: "folder", text: `${tasks.length} tareas activas en el board` });
    insights.push({ icon: "clock", text: `${open} abiertas, ${tasks.length - open} terminadas` });
    if (overdue > 0) insights.push({ icon: "alert", text: `${overdue} vencidas requieren atención inmediata` });
    if (dueSoon > 0) insights.push({ icon: "zap", text: `${dueSoon} vencen en los próximos 7 días` });

    if (overdue > 0) actions.push(`Hay ${overdue} atrasos — entra al panel "Atrasadas" para verlos`);
    return { title: "Salud general del board", tasks: _sortByUrgency(tasks.filter(_isOverdueTask)), insights, actions };
  } catch (err) { console.error("[_diagTotal]", err); return _emptyResult("Total"); }
}

function _diagProyecto(tasks, empresa, proyecto) {
  try {
    const insights = [], actions = [];
    if (tasks.length === 0) return { title: proyecto || "Proyecto", tasks: [], insights: [{ icon: "check", text: "Sin tareas activas" }], actions: [] };

    const open = tasks.filter(t => _safeNormEstado(t) !== "Terminado");
    const overdue = tasks.filter(_isOverdueTask);
    const term = tasks.filter(t => _safeNormEstado(t) === "Terminado").length;
    const pct = tasks.length > 0 ? Math.round((term / tasks.length) * 100) : 0;
    const overduePct = open.length > 0 ? Math.round((overdue.length / open.length) * 100) : 0;

    let risk = "ok";
    if (overdue.length >= DIAG_RULES.PROYECTO_CRITICO_ATRASOS || overduePct >= DIAG_RULES.PROYECTO_CRITICO_PCT) risk = "crítico";
    else if (overdue.length >= DIAG_RULES.PROYECTO_RIESGO_ATRASOS) risk = "riesgo";
    else if (tasks.filter(t => { const d = _safeDaysUntil(t); return d !== null && d >= 0 && d <= 7; }).length >= DIAG_RULES.ATENCION_VENCEN_7D) risk = "atención";

    insights.push({ icon: "check", text: `${pct}% completado (${term}/${tasks.length})` });
    if (overdue.length > 0) {
      const masVieja = _sortByUrgency(overdue)[0];
      const dias = masVieja ? Math.abs(_safeDaysUntil(masVieja) || 0) : 0;
      insights.push({ icon: "alert", text: `${overdue.length} atrasadas · la más vieja ${dias} días ("${(masVieja && masVieja.actividad) || ""}")` });
    }
    const byPers = _topN(_groupCount(open, "responsable"), 3);
    if (byPers.length > 0) insights.push({ icon: "users", text: `Equipo activo: ${byPers.map(([n, c]) => `${n} (${c})`).join(" · ")}` });

    if (risk === "crítico") actions.push(`Estado crítico — agenda revisión inmediata con el equipo`);
    else if (risk === "riesgo") actions.push(`Hay riesgo — destraba los ${overdue.length} atrasos antes de que crezcan`);
    else if (risk === "atención") actions.push(`Atención: varias vencen pronto — confirma capacidad esta semana`);
    else actions.push(`Proyecto sano — mantén el ritmo`);

    return { title: `${proyecto || "Proyecto"} · ${risk.toUpperCase()}`, risk, tasks: _sortByUrgency(open), insights, actions };
  } catch (err) { console.error("[_diagProyecto]", err); return _emptyResult(proyecto); }
}

function _diagPersona(tasks, persona) {
  try {
    const insights = [], actions = [];
    const open = tasks.filter(t => _safeNormEstado(t) !== "Terminado");
    const overdue = tasks.filter(_isOverdueTask);
    const term = tasks.filter(t => _safeNormEstado(t) === "Terminado").length;
    const dueSoon = tasks.filter(t => { const d = _safeDaysUntil(t); return d !== null && d >= 0 && d <= 7; }).length;

    let estadoP = "ok";
    if (open.length >= DIAG_RULES.PERSONA_SOBRECARGADA) estadoP = "sobrecargada";
    if (overdue.length >= DIAG_RULES.PERSONA_EN_RIESGO) estadoP = "en riesgo";
    if (open.length >= DIAG_RULES.PERSONA_SOBRECARGADA && overdue.length >= DIAG_RULES.PERSONA_EN_RIESGO) estadoP = "crítica";

    insights.push({ icon: "folder", text: `${open.length} abiertas · ${overdue.length} vencidas · ${term} terminadas` });
    if (dueSoon > 0) insights.push({ icon: "clock", text: `${dueSoon} vencen esta semana` });

    const byProj = _topN(_groupCount(open, "proyecto"), 3);
    if (byProj.length > 0) {
      const [top, c] = byProj[0];
      const pct = open.length > 0 ? Math.round((c / open.length) * 100) : 0;
      insights.push({ icon: "folder", text: `Concentración: ${pct}% en ${top}` });
    }

    if (estadoP === "crítica") actions.push(`Carga crítica — urge reasignar o aplazar tareas`);
    else if (estadoP === "sobrecargada") actions.push(`Sobrecargada — considera reasignar o aplazar 2-3 tareas`);
    else if (estadoP === "en riesgo") actions.push(`Atrasos acumulados — prioriza destrabar lo vencido`);
    else if (open.length === 0) actions.push(`Sin tareas activas — disponible para nuevas asignaciones`);
    else actions.push(`Carga sana — buen ritmo`);

    return { title: `${persona || "Persona"} · ${estadoP}`, estadoPersona: estadoP, tasks: _sortByUrgency(open), insights, actions };
  } catch (err) { console.error("[_diagPersona]", err); return { ..._emptyResult(persona || "Persona"), estadoPersona: "ok" }; }
}


function Board({ onLogout }) {
  const [tasks, setTasks] = useState(() => {
    try { const c = localStorage.getItem(CACHE_KEY); return c ? JSON.parse(c) : []; } catch { return []; }
  });
  const [filters, setFilters] = useState({ empresa: "Todas", proyecto: "Todos", responsable: "Todos", estado: "Todos", search: "" });
  const [quickFilter, setQuickFilter] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [tplDraft, setTplDraft] = useState({ templateId: "", empresa: "YoDesarrollo", proyecto: "", responsable: "" });
  const [newTask, setNewTask] = useState(emptyTask());
  const [linkDraft, setLinkDraft] = useState({ label: "", url: "" });
  const [comentDraft, setComentDraft] = useState("");
  const [comentAutor, setComentAutor] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [expandedProyectos, setExpandedProyectos] = useState({});
  const [expandedProjectRows, setExpandedProjectRows] = useState({});
  const [draggingId, setDraggingId] = useState(null);
  const [draggingTileKey, setDraggingTileKey] = useState(null);
  const [projectOrder, setProjectOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem(PROJECT_ORDER_KEY) || "{}"); } catch { return {}; }
  });
  const [lastSync, setLastSync] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [diagnostic, setDiagnostic] = useState(null);
  const [saveStatus, setSaveStatus] = useState({});
  const [confirmDialog, setConfirmDialog] = useState({ open: false });

  // Estados de UI
  const [currentView, setCurrentView] = useState("personas"); // personas | proyectos | estados | calendario
  const [showArchived, setShowArchived] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [diagPanel, setDiagPanel] = useState({ open: false, mode: null, params: {} });
  const [showAI, setShowAI] = useState(false);
  const openDiag = (mode, params = {}) => setDiagPanel({ open: true, mode, params });
  const closeDiag = () => setDiagPanel(p => ({ ...p, open: false }));
  const [metricsMode, setMetricsMode] = useState("global"); // global | empresa
  const [personaPanel, setPersonaPanel] = useState(null); // nombre de persona para dashboard
  const [showExport, setShowExport] = useState(false);
  const [calCursor, setCalCursor] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem(THEME_KEY) || "light"; } catch { return "light"; } });

  const pendingPatches = useRef({});
  const debounceTimers = useRef({});
  const recentlyModified = useRef({});
  const tasksRef = useRef(tasks);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);

  useEffect(() => {
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
  }, [theme]);

  const colorOverrides = useMemo(() => {
    const out = {};
    tasks.forEach(t => { if (t.responsable && t.color && String(t.color).trim()) out[t.responsable] = String(t.color).trim(); });
    return out;
  }, [tasks]);

  const askConfirm = useCallback((opts) => {
    return new Promise((resolve) => {
      setConfirmDialog({
        open: true,
        title: opts.title || "¿Estás seguro?",
        message: opts.message || "Esta acción no se puede deshacer.",
        confirmLabel: opts.confirmLabel || "Eliminar",
        danger: opts.danger !== false,
        onConfirm: () => { setConfirmDialog({ open: false }); resolve(true); },
        onCancel: () => { setConfirmDialog({ open: false }); resolve(false); },
      });
    });
  }, []);

  useEffect(() => {
    apiCall("ping").then(() => setDiagnostic(null)).catch(err => setDiagnostic({ message: err.message }));
  }, []);

  const loadFromRemote = useCallback(async () => {
    setSyncing(true); setSyncError(null);
    try {
      let remote = null;
      try { const result = await apiCall("getAll"); if (Array.isArray(result.tasks)) remote = result.tasks; }
      catch (apiErr) { console.warn("[loadFromRemote] fallback a data.json:", apiErr.message); }
      if (!remote) {
        const base = (typeof window !== "undefined" && window.location) ? window.location.pathname.replace(/[^/]*$/, "") : "/";
        const url = `${base}data.json?t=${Date.now()}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        remote = Array.isArray(data) ? data : data.tasks;
      }
      if (Array.isArray(remote)) {
        const now = Date.now();
        const merged = remote.map(rt => {
          const lm = recentlyModified.current[rt.id];
          if (lm && now - lm < PROTECTION_MS) { const local = tasksRef.current.find(t => t.id === rt.id); return local || rt; }
          return rt;
        });
        setTasks(merged); setLastSync(new Date());
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(merged)); } catch {}
      }
    } catch (err) { setSyncError(err.message); }
    finally { setSyncing(false); }
  }, []);

  useEffect(() => {
    loadFromRemote();
    const id = setInterval(() => { if (Object.keys(pendingPatches.current).length === 0) loadFromRemote(); }, REFRESH_MS);
    return () => clearInterval(id);
  }, [loadFromRemote]);

  const flushTask = useCallback(async (taskId) => {
    const patch = pendingPatches.current[taskId];
    if (!patch || Object.keys(patch).length === 0) return;
    const sheetPatch = patchToSheet(patch);
    if (Object.keys(sheetPatch).length === 0) { delete pendingPatches.current[taskId]; return; }
    pendingPatches.current[taskId] = {};
    if (debounceTimers.current[taskId]) { clearTimeout(debounceTimers.current[taskId]); delete debounceTimers.current[taskId]; }
    setSaveStatus(p => ({ ...p, [taskId]: "saving", [`${taskId}_err`]: null }));
    try {
      await apiCall("update", { id: taskId, patch: sheetPatch });
      recentlyModified.current[taskId] = Date.now();
      setSaveStatus(p => ({ ...p, [taskId]: "saved" }));
      setTimeout(() => { setSaveStatus(p => p[taskId] === "saved" ? { ...p, [taskId]: "idle" } : p); }, SAVED_FLASH_MS);
    } catch (err) {
      pendingPatches.current[taskId] = { ...sheetPatch, ...(pendingPatches.current[taskId] || {}) };
      setSaveStatus(p => ({ ...p, [taskId]: "error", [`${taskId}_err`]: err.message }));
    }
  }, []);

  const queueChange = useCallback((taskId, patch, immediate = false) => {
    pendingPatches.current[taskId] = { ...(pendingPatches.current[taskId] || {}), ...patch };
    if (immediate) { flushTask(taskId); return; }
    if (debounceTimers.current[taskId]) clearTimeout(debounceTimers.current[taskId]);
    debounceTimers.current[taskId] = setTimeout(() => flushTask(taskId), DEBOUNCE_MS);
  }, [flushTask]);

  const flushAll = useCallback(() => { Object.keys(pendingPatches.current).forEach(id => flushTask(id)); }, [flushTask]);

  useEffect(() => {
    const id = setInterval(() => {
      Object.entries(saveStatus).forEach(([taskId, st]) => { if (st === "error" && pendingPatches.current[taskId]) flushTask(taskId); });
    }, 30000);
    return () => clearInterval(id);
  }, [saveStatus, flushTask]);

  useEffect(() => {
    const h = () => flushAll();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [flushAll]);

  function updateTaskField(id, patch, immediate = false) {
    let finalPatch = { ...patch };
    if (patch.estado !== undefined) {
      const current = tasksRef.current.find(t => t.id === id);
      const prevEstado = current?.estado;
      if (patch.estado !== prevEstado) {
        // Bitácora: registrar el cambio de estado
        finalPatch.historial = appendHistorial(current?.historial || "", patch.estado);
      }
      if (patch.estado === "Terminado" && prevEstado !== "Terminado" && !current?.fechaTerminado) {
        finalPatch.fechaTerminado = todayStamp();
      }
      if (prevEstado === "Terminado" && patch.estado !== "Terminado") {
        finalPatch.fechaTerminado = ""; finalPatch.archivada = false;
      }
    }
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...finalPatch, actualizado: todayStamp() } : t));
    queueChange(id, finalPatch, immediate);
  }

  // Archivar rápido (1 click, sin abrir)
  function quickArchive(id, value) {
    updateTaskField(id, { archivada: value }, true);
  }
  // Archivar todas las terminadas visibles
  async function archiveAllDone() {
    const done = tasksRef.current.filter(t => t.estado === "Terminado" && !t.archivada);
    if (done.length === 0) { alert("No hay tareas terminadas sin archivar."); return; }
    const ok = await askConfirm({
      title: "Archivar terminadas",
      message: `Vas a archivar ${done.length} tarea(s) terminada(s). Se ocultan del board pero quedan en el Sheet. ¿Continuar?`,
      confirmLabel: `Sí, archivar ${done.length}`,
      danger: false,
    });
    if (!ok) return;
    setTasks(prev => prev.map(t => (t.estado === "Terminado" && !t.archivada) ? { ...t, archivada: true } : t));
    for (const t of done) { queueChange(t.id, { archivada: true }, true); }
  }

  async function changePersonaColor(responsable, color) {
    setTasks(prev => prev.map(t => t.responsable === responsable ? { ...t, color } : t));
    try { await apiCall("setResponsableColor", { responsable, color }); }
    catch (err) { alert(`Error cambiando color de ${responsable}: ${err.message}`); loadFromRemote(); }
  }

  // Subtareas
  function updateSubtareas(id, items) {
    const serialized = serializeSubtareas(items);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, subtareas: serialized } : t));
    queueChange(id, { subtareas: serialized }, false);
  }

  // Comentarios
  function addComentario(id, autor, texto) {
    const t = tasksRef.current.find(t => t.id === id);
    if (!t || !texto.trim()) return;
    const actuales = parseComentarios(t.comentarios);
    const nuevo = { autor: autor || "—", fecha: todayStamp(), texto: texto.trim() };
    const serialized = serializeComentarios([...actuales, nuevo]);
    setTasks(prev => prev.map(x => x.id === id ? { ...x, comentarios: serialized } : x));
    queueChange(id, { comentarios: serialized }, true);
  }

  async function addTask() {
    if (!newTask.proyecto.trim() || !newTask.responsable.trim() || !newTask.actividad.trim()) {
      alert("Completa proyecto, responsable y actividad."); return;
    }
    const tempId = makeId();
    const histInicial = `${todayStamp()} ${newTask.estado || "Pendiente"}`;
    const tempTask = { ...newTask, id: tempId, mes: newTask.mesCompromiso || newTask.mes, creado: todayStamp(), actualizado: todayStamp(), links: [], archivada: false, fechaTerminado: "", historial: histInicial, subtareas: "" };
    setTasks(prev => [tempTask, ...prev]);
    setNewTask(emptyTask());
    setShowForm(false);
    setSaveStatus(p => ({ ...p, [tempId]: "saving" }));
    try {
      const sheetTask = patchToSheet({ ...tempTask, mesCompromiso: tempTask.mesCompromiso });
      const result = await apiCall("create", { task: sheetTask });
      setTasks(prev => prev.map(t => t.id === tempId ? { ...t, id: result.id } : t));
      recentlyModified.current[result.id] = Date.now();
      setSaveStatus(p => { const n = { ...p }; delete n[tempId]; n[result.id] = "saved"; return n; });
      setTimeout(() => setSaveStatus(p => p[result.id] === "saved" ? { ...p, [result.id]: "idle" } : p), SAVED_FLASH_MS);
    } catch (err) { setSaveStatus(p => ({ ...p, [tempId]: "error", [`${tempId}_err`]: err.message })); }
  }

  async function duplicateTask(srcId) {
    const src = tasksRef.current.find(t => t.id === srcId);
    if (!src) return;
    const tempId = makeId();
    const histInicial = `${todayStamp()} Pendiente`;
    const tempTask = {
      ...src, id: tempId,
      actividad: `${src.actividad || "Tarea"} (copia)`,
      estado: "Pendiente",
      creado: todayStamp(), actualizado: todayStamp(),
      links: [], comentarios: "", historial: histInicial, subtareas: "",
      archivada: false, borrada: false, fechaTerminado: "",
    };
    setTasks(prev => [tempTask, ...prev]);
    setSelectedTaskId(tempId);
    setSaveStatus(p => ({ ...p, [tempId]: "saving" }));
    try {
      const sheetTask = patchToSheet({ ...tempTask, mesCompromiso: tempTask.mesCompromiso || tempTask.mes });
      const result = await apiCall("create", { task: sheetTask });
      setTasks(prev => prev.map(t => t.id === tempId ? { ...t, id: result.id } : t));
      setSelectedTaskId(cur => cur === tempId ? result.id : cur);
      recentlyModified.current[result.id] = Date.now();
      setSaveStatus(p => { const n = { ...p }; delete n[tempId]; n[result.id] = "saved"; return n; });
      setTimeout(() => setSaveStatus(p => p[result.id] === "saved" ? { ...p, [result.id]: "idle" } : p), SAVED_FLASH_MS);
    } catch (err) { setSaveStatus(p => ({ ...p, [tempId]: "error", [`${tempId}_err`]: err.message })); }
  }

  async function createFromTemplate() {
    const tpl = PROJECT_TEMPLATES.find(t => t.id === tplDraft.templateId);
    if (!tpl) { alert("Elige una plantilla."); return; }
    if (!tplDraft.proyecto.trim() || !tplDraft.responsable.trim()) { alert("Escribe el nombre del proyecto y el responsable."); return; }
    const base = { empresa: tplDraft.empresa, proyecto: tplDraft.proyecto.trim(), responsable: tplDraft.responsable.trim() };
    setShowTemplate(false);
    setTplDraft({ templateId: "", empresa: "YoDesarrollo", proyecto: "", responsable: "" });
    for (const item of tpl.tasks) {
      const tempId = makeId();
      const histInicial = `${todayStamp()} Pendiente`;
      const tempTask = {
        ...emptyTask(), ...base,
        actividad: item.actividad, entregable: item.entregable || "",
        prioridad: item.prioridad || "Media", estado: "Pendiente",
        id: tempId, creado: todayStamp(), actualizado: todayStamp(), historial: histInicial,
      };
      setTasks(prev => [tempTask, ...prev]);
      setSaveStatus(p => ({ ...p, [tempId]: "saving" }));
      try {
        const sheetTask = patchToSheet({ ...tempTask, mesCompromiso: tempTask.mes });
        const result = await apiCall("create", { task: sheetTask });
        setTasks(prev => prev.map(t => t.id === tempId ? { ...t, id: result.id } : t));
        recentlyModified.current[result.id] = Date.now();
        setSaveStatus(p => { const n = { ...p }; delete n[tempId]; n[result.id] = "saved"; return n; });
        setTimeout(() => setSaveStatus(p => p[result.id] === "saved" ? { ...p, [result.id]: "idle" } : p), SAVED_FLASH_MS);
      } catch (err) { setSaveStatus(p => ({ ...p, [tempId]: "error", [`${tempId}_err`]: err.message })); }
    }
  }

  async function addLink(taskId) {
    const url = normalizeUrl(linkDraft.url);
    if (!url) return;
    const label = linkDraft.label?.trim() || "Evidencia";
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const link = { id: makeId(), label, url, fechaSubida: todayStamp() };
      const next = (t.estado === "Pendiente" || t.estado === "En proceso") ? "En standby" : t.estado;
      return { ...t, links: [...(t.links || []), link], estado: next };
    }));
    setLinkDraft({ label: "", url: "" });
    setSaveStatus(p => ({ ...p, [taskId]: "saving" }));
    try {
      await apiCall("addLink", { id: taskId, url, label });
      const t = tasksRef.current.find(t => t.id === taskId);
      if (t && t.estado === "En standby") await apiCall("update", { id: taskId, patch: { estado: "En standby" } });
      recentlyModified.current[taskId] = Date.now();
      setSaveStatus(p => ({ ...p, [taskId]: "saved" }));
      setTimeout(() => setSaveStatus(p => p[taskId] === "saved" ? { ...p, [taskId]: "idle" } : p), SAVED_FLASH_MS);
    } catch (err) { setSaveStatus(p => ({ ...p, [taskId]: "error", [`${taskId}_err`]: err.message })); }
  }

  async function removeLinkConfirmed(taskId, linkId) {
    const t = tasksRef.current.find(t => t.id === taskId);
    const link = t?.links?.find(l => l.id === linkId);
    if (!link) return;
    const ok = await askConfirm({ title: "Eliminar evidencia", message: `Vas a quitar "${link.label}". Acción definitiva.`, confirmLabel: "Sí, eliminar" });
    if (!ok) return;
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, links: t.links.filter(l => l.id !== linkId) } : t));
    setSaveStatus(p => ({ ...p, [taskId]: "saving" }));
    try {
      await apiCall("removeLink", { id: taskId, url: link.url });
      recentlyModified.current[taskId] = Date.now();
      setSaveStatus(p => ({ ...p, [taskId]: "saved" }));
      setTimeout(() => setSaveStatus(p => p[taskId] === "saved" ? { ...p, [taskId]: "idle" } : p), SAVED_FLASH_MS);
    } catch (err) { setSaveStatus(p => ({ ...p, [taskId]: "error", [`${taskId}_err`]: err.message })); }
  }

  // Borrado SUAVE: marca borrada=true (va a la papelera, no se pierde)
  async function deleteTask(taskId) {
    const t = tasksRef.current.find(t => t.id === taskId);
    const ok = await askConfirm({ title: "Enviar a papelera", message: `"${t?.actividad || taskId}" se moverá a la papelera. Podrás recuperarla después.`, confirmLabel: "Mover a papelera", danger: false });
    if (!ok) return;
    setSelectedTaskId(null);
    updateTaskField(taskId, { borrada: true }, true);
  }

  // Restaurar desde la papelera
  function restoreTask(taskId) {
    updateTaskField(taskId, { borrada: false }, true);
  }

  // Eliminar DEFINITIVO (borra la fila del Sheet de verdad)
  // deleteForever() ELIMINADA en v8 por política de seguridad.
  // Las tareas nunca se borran del Sheet: la papelera solo usa soft-delete (borrada=TRUE) y restore (borrada=FALSE).

  function changeStatusByDrag(taskId, newStatus) { updateTaskField(taskId, { estado: newStatus }, true); }
  function closeSubboard() { if (selectedTaskId) flushTask(selectedTaskId); setSelectedTaskId(null); }
  function toggleProyecto(key) { setExpandedProyectos(prev => ({ ...prev, [key]: !prev[key] })); }
  function toggleProjectRow(key) { setExpandedProjectRows(prev => ({ ...prev, [key]: !prev[key] })); }

  const reorderProjects = useCallback((persona, empresa, fromIdx, toIdx, allProjects) => {
    setProjectOrder(prev => {
      const key = `${persona}::${empresa}`;
      const baseList = (prev[key] && prev[key].length > 0)
        ? [...prev[key].filter(p => allProjects.includes(p)), ...allProjects.filter(p => !prev[key].includes(p))]
        : [...allProjects];
      if (fromIdx < 0 || toIdx < 0 || fromIdx >= baseList.length || toIdx >= baseList.length) return prev;
      const [moved] = baseList.splice(fromIdx, 1);
      baseList.splice(toIdx, 0, moved);
      const next = { ...prev, [key]: baseList };
      try { localStorage.setItem(PROJECT_ORDER_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // ----- DERIVADOS -----
  const projects = useMemo(() => ["Todos", ...Array.from(new Set(tasks.map(t => t.proyecto).filter(Boolean))).sort()], [tasks]);
  const responsables = useMemo(() => ["Todos", ...Array.from(new Set(tasks.map(t => t.responsable).filter(Boolean))).sort()], [tasks]);
  const existingProjects = useMemo(() => projects.filter(p => p !== "Todos"), [projects]);
  const existingResponsables = useMemo(() => responsables.filter(r => r !== "Todos"), [responsables]);
  const existingActividades = useMemo(() => Array.from(new Set(tasks.map(t => t.actividad).filter(Boolean))).sort(), [tasks]);
  const archivedCount = useMemo(() => tasks.filter(t => t.archivada).length, [tasks]);
  const allPersonas = useMemo(() => Array.from(new Set(tasks.map(t => t.responsable).filter(Boolean))).sort(), [tasks]);

  // Lista base: aplica todos los filtros MENOS los chips rápidos (sirve para contar cada chip)
  const baseTasks = useMemo(() => {
    const term = filters.search.trim().toLowerCase();
    return tasks.filter(t => {
      if (t.borrada) return false;
      if (!showArchived && t.archivada) return false;
      if (filters.empresa !== "Todas" && t.empresa !== filters.empresa) return false;
      if (filters.proyecto !== "Todos" && t.proyecto !== filters.proyecto) return false;
      if (filters.responsable !== "Todos" && t.responsable !== filters.responsable) return false;
      if (filters.estado !== "Todos" && t.estado !== filters.estado) return false;
      if (term) {
        const hay = `${t.empresa} ${t.proyecto} ${t.responsable} ${t.actividad} ${t.entregable} ${t.observaciones}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [tasks, filters, showArchived]);

  const matchesQuick = (t, key) => {
    if (key === "atrasadas") return isOverdue(t);
    if (key === "semana") { const d = daysUntil(t); return t.estado !== "Terminado" && d != null && d >= 0 && d <= 7; }
    if (key === "alta") return t.prioridad === "Alta" && t.estado !== "Terminado";
    if (key === "sinfecha") return commitmentDate(t) == null;
    return true;
  };

  const quickCounts = useMemo(() => ({
    atrasadas: baseTasks.filter(t => matchesQuick(t, "atrasadas")).length,
    semana: baseTasks.filter(t => matchesQuick(t, "semana")).length,
    alta: baseTasks.filter(t => matchesQuick(t, "alta")).length,
    sinfecha: baseTasks.filter(t => matchesQuick(t, "sinfecha")).length,
  }), [baseTasks]);

  const filteredTasks = useMemo(() => {
    if (!quickFilter) return baseTasks;
    return baseTasks.filter(t => matchesQuick(t, quickFilter));
  }, [baseTasks, quickFilter]);

  const trashedTasks = useMemo(() => tasks.filter(t => t.borrada), [tasks]);

  const hierarchy = useMemo(() => {
    const h = {};
    filteredTasks.forEach(t => {
      const p = t.responsable || "Sin responsable", e = t.empresa || "Sin empresa", pr = t.proyecto || "Sin proyecto";
      if (!h[p]) h[p] = {};
      if (!h[p][e]) h[p][e] = {};
      if (!h[p][e][pr]) h[p][e][pr] = [];
      h[p][e][pr].push(t);
    });
    Object.values(h).forEach(empresas => Object.values(empresas).forEach(proys => Object.values(proys).forEach(arr => arr.sort((a, b) => urgencyScore(a) - urgencyScore(b)))));
    return h;
  }, [filteredTasks]);

  const personasOrdenadas = useMemo(() => Object.keys(hierarchy).sort((a, b) => a.localeCompare(b)), [hierarchy]);

  const projectsList = useMemo(() => {
    const byProject = {};
    filteredTasks.forEach(t => {
      const key = `${t.empresa}::${t.proyecto}`;
      if (!byProject[key]) byProject[key] = { empresa: t.empresa, proyecto: t.proyecto, tasks: [] };
      byProject[key].tasks.push(t);
    });
    return Object.values(byProject).map(p => ({
      ...p, key: `${p.empresa}::${p.proyecto}`,
      metrics: calcProjectMetrics(p.tasks),
      asignados: Array.from(new Set(p.tasks.map(t => t.responsable).filter(Boolean))),
    })).sort((a, b) => {
      const order = { critico: 0, riesgo: 1, atencion: 2, ok: 3 };
      const diff = order[a.metrics.risk] - order[b.metrics.risk];
      return diff !== 0 ? diff : a.proyecto.localeCompare(b.proyecto);
    });
  }, [filteredTasks]);

  const metricsGlobal = useMemo(() => {
    const m = calcMetricsFor(filteredTasks);
    return { ...m, sub: m.rev, links: filteredTasks.reduce((s, t) => s + (t.links?.length || 0), 0) };
  }, [filteredTasks]);
  const metricsByEmpresa = useMemo(() => EMPRESAS.map(e => ({ empresa: e, m: calcMetricsFor(filteredTasks.filter(t => t.empresa === e)) })), [filteredTasks]);
  const overdueCount = useMemo(() => filteredTasks.filter(isOverdue).length, [filteredTasks]);

  const weekStats = useMemo(() => calcWeekStats(tasks), [tasks]);
  const riskyProjects = useMemo(() => projectsList.filter(p => p.metrics.risk === "critico" || p.metrics.risk === "riesgo").slice(0, 4), [projectsList]);

  const selectedTask = useMemo(() => tasks.find(t => t.id === selectedTaskId) || null, [tasks, selectedTaskId]);

  const globalSync = useMemo(() => {
    const errs = Object.entries(saveStatus).filter(([k, v]) => v === "error" && !k.endsWith("_err")).length;
    const sav = Object.entries(saveStatus).filter(([k, v]) => v === "saving" && !k.endsWith("_err")).length;
    if (errs > 0) return { type: "error", text: `${errs} con error · reintentando` };
    if (sav > 0) return { type: "saving", text: `Guardando ${sav}…` };
    return { type: "idle", text: `Última lectura ${timeAgo(lastSync)}` };
  }, [saveStatus, lastSync]);

  const shellClass = `brand-shell yo-theme min-h-screen${theme === "dark" ? " dark" : ""}`;

  // ===========================================================
  // RENDER: SUBBOARD
  // ===========================================================
  if (selectedTask) {
    const status = saveStatus[selectedTask.id];
    const errMsg = saveStatus[`${selectedTask.id}_err`];
    const taskDateStr = reconstructDateStr(selectedTask);
    const isTerminada = selectedTask.estado === "Terminado";
    const historial = parseHistorial(selectedTask.historial);
    const subtareas = parseSubtareas(selectedTask.subtareas);
    const subDone = subtareas.filter(s => s.done).length;

    return (
      <div className={shellClass}>
        <div className="mx-auto max-w-5xl px-4 py-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <button onClick={closeSubboard} className="btn-ghost">← Regresar al board</button>
            <SaveBadge status={status} errorMsg={errMsg} onRetry={() => flushTask(selectedTask.id)} />
          </div>
          <header className="yo-card p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="yo-eyebrow">Subboard de tarea</p>
                <h1 className="yo-display mt-1">{selectedTask.actividad}</h1>
                <p className="mt-1 text-sm subtle">{selectedTask.proyecto} · {selectedTask.responsable}</p>
                <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                  <EstadoChip estado={selectedTask.estado} />
                  <PrioridadChip prioridad={selectedTask.prioridad} />
                  {!isTerminada && <DeadlineBadge task={selectedTask} />}
                  {isTerminada && selectedTask.fechaTerminado && <span className="terminada-pill">✓ Terminada {fechaTerminadoCorta(selectedTask.fechaTerminado)}</span>}
                  {selectedTask.archivada && <span className="archivada-pill">📁 Archivada</span>}
                  {isOverdue(selectedTask) && <span className="overdue-pill"><AlertTriangle size={11}/>Vencida</span>}
                </div>
                <p className="mt-2 text-xs yo-success">✓ Cada cambio se guarda automáticamente.</p>
              </div>
              <div className="flex gap-2">
                {!isTerminada && <button onClick={() => updateTaskField(selectedTask.id, { estado: "Terminado" }, true)} className="yo-btn-primary">Marcar terminada</button>}
                <button onClick={() => duplicateTask(selectedTask.id)} className="yo-btn-secondary" title="Crear una copia de esta tarea"><Copy size={14}/>Duplicar</button>
                <button onClick={() => deleteTask(selectedTask.id)} className="yo-btn-danger">Eliminar</button>
              </div>
            </div>
          </header>

          {isTerminada && (
            <div className="archive-control mt-3">
              <label className="archive-label">
                <input type="checkbox" checked={!!selectedTask.archivada} onChange={(e) => updateTaskField(selectedTask.id, { archivada: e.target.checked }, true)} />
                <Archive size={14} />
                <span>{selectedTask.archivada ? "Archivada — ocúltala del board principal" : "Archivar esta tarea — la oculta del board pero queda en el Sheet"}</span>
              </label>
              <p className="archive-hint">Para verla de nuevo, prende "Ver archivadas" en el header del board.</p>
            </div>
          )}

          <main className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
            <section className="yo-card p-5">
              <h2 className="yo-eyebrow mb-4">Datos</h2>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Empresa">
                  <select className="input" value={selectedTask.empresa} onChange={e => updateTaskField(selectedTask.id, { empresa: e.target.value }, true)}>
                    {EMPRESAS.map(e => <option key={e}>{e}</option>)}
                  </select>
                </Field>
                <Field label="Proyecto"><input className="input" value={selectedTask.proyecto || ""} onChange={e => updateTaskField(selectedTask.id, { proyecto: e.target.value })} /></Field>
                <Field label="Responsable"><input className="input" value={selectedTask.responsable || ""} onChange={e => updateTaskField(selectedTask.id, { responsable: e.target.value })} /></Field>
                <Field label="Fecha (calendario)">
                  <input type="date" className="input" value={taskDateStr} onChange={e => {
                    const ds = e.target.value; const derived = deriveDateFields(ds);
                    updateTaskField(selectedTask.id, { fecha: derived.fecha, semana: derived.semana, mes: derived.mes, mesCompromiso: derived.mes }, true);
                  }} />
                  {taskDateStr && <div className="form-derived" style={{marginTop:'0.4rem'}}>{selectedTask.mes} · {selectedTask.fecha} · {selectedTask.semana}</div>}
                </Field>
                <Field label="Estado">
                  <select className="input" value={selectedTask.estado} onChange={e => updateTaskField(selectedTask.id, { estado: e.target.value }, true)}>
                    {ESTADOS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Prioridad">
                  <select className="input" value={selectedTask.prioridad || "Media"} onChange={e => updateTaskField(selectedTask.id, { prioridad: e.target.value }, true)}>
                    {PRIORIDADES.map(p => <option key={p}>{p}</option>)}
                  </select>
                </Field>
              </div>
              <div className="mt-4 grid gap-3">
                <Field label="Actividad"><textarea className="input min-h-[80px]" value={selectedTask.actividad || ""} onChange={e => updateTaskField(selectedTask.id, { actividad: e.target.value })} /></Field>
                <Field label="Entregable"><textarea className="input min-h-[80px]" value={selectedTask.entregable || ""} onChange={e => updateTaskField(selectedTask.id, { entregable: e.target.value })} /></Field>
                <Field label="Observaciones"><textarea className="input min-h-[120px]" value={selectedTask.observaciones || ""} onChange={e => updateTaskField(selectedTask.id, { observaciones: e.target.value })} placeholder="Notas, bloqueos, contexto…" /></Field>
              </div>
            </section>

            <aside className="space-y-5">
              <section className="yo-card p-5">
                <h2 className="yo-eyebrow mb-4">Evidencias</h2>
                <div className="space-y-2">
                  {(selectedTask.links || []).length === 0 && <p className="text-sm subtle p-3 panel-soft">Sin archivos.</p>}
                  {(selectedTask.links || []).map(link => (
                    <div key={link.id} className="border border-stone-200 p-3 link-item">
                      <a href={link.url} target="_blank" rel="noreferrer" className="block text-sm font-bold hover:underline break-all">{link.label}</a>
                      <div className="mt-1 text-xs subtle break-all">{link.url}</div>
                      <button onClick={() => removeLinkConfirmed(selectedTask.id, link.id)} className="mt-2 text-xs font-bold text-red-600 hover:text-red-800">Eliminar</button>
                    </div>
                  ))}
                </div>
                <div className="mt-4 space-y-2 border-t border-stone-200 pt-4">
                  <input className="input" value={linkDraft.label} onChange={e => setLinkDraft({ ...linkDraft, label: e.target.value })} placeholder="Nombre del archivo" />
                  <input className="input" value={linkDraft.url} onChange={e => setLinkDraft({ ...linkDraft, url: e.target.value })} placeholder="URL de Drive" />
                  <button onClick={() => addLink(selectedTask.id)} className="yo-btn-primary w-full"><Link2 size={14}/>Guardar evidencia</button>
                </div>
              </section>

              {/* BITÁCORA */}
              <section className="yo-card p-5">
                <h2 className="yo-eyebrow mb-4"><History size={11} style={{display:'inline',marginRight:4}}/>Bitácora</h2>
                {historial.length === 0 ? (
                  <p className="text-sm subtle">Sin movimientos registrados aún. Los cambios de estado se irán registrando aquí.</p>
                ) : (
                  <ol className="bitacora">
                    {historial.map((h, i) => (
                      <li key={i} className="bitacora-item">
                        <span className={`bitacora-dot est-dot-${estadoSlug(h.estado)}`} />
                        <div className="bitacora-body">
                          <span className="bitacora-estado">{h.estado}</span>
                          <span className="bitacora-fecha">{fechaTerminadoCorta(h.fecha) || h.fecha}</span>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              {/* COMENTARIOS */}
              <section className="yo-card p-5">
                <h2 className="yo-eyebrow mb-4"><MessageSquare size={11} style={{display:'inline',marginRight:4}}/>Comentarios</h2>
                <div className="comentarios-list">
                  {parseComentarios(selectedTask.comentarios).length === 0 && <p className="text-sm subtle">Sin comentarios todavía.</p>}
                  {parseComentarios(selectedTask.comentarios).map(c => {
                    const pal = personPalette(c.autor, colorOverrides);
                    return (
                      <div key={c.id} className="comentario-item">
                        <div className="comentario-avatar" style={{ background: pal.main }}>{getInitials(c.autor)}</div>
                        <div className="comentario-body">
                          <div className="comentario-head"><span className="comentario-autor">{c.autor}</span><span className="comentario-fecha">{fechaTerminadoCorta(c.fecha) || c.fecha}</span></div>
                          <p className="comentario-texto">{c.texto}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 space-y-2 border-t border-stone-200 pt-4">
                  <select className="input" value={comentAutor} onChange={e => setComentAutor(e.target.value)}>
                    <option value="">¿Quién comenta?</option>
                    {allPersonas.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <textarea className="input" value={comentDraft} onChange={e => setComentDraft(e.target.value)} placeholder="Escribe un comentario…" style={{ minHeight: 60 }} />
                  <button onClick={() => { if (comentAutor && comentDraft.trim()) { addComentario(selectedTask.id, comentAutor, comentDraft); setComentDraft(""); } else { alert("Elige quién comenta y escribe algo."); } }} className="yo-btn-primary w-full"><Send size={14}/>Comentar</button>
                </div>
              </section>
            </aside>
          </main>
        </div>
        <ConfirmModal dialog={confirmDialog} />
        <GlobalStyles />
      </div>
    );
  }

  // ===========================================================
  // RENDER: BOARD PRINCIPAL
  // ===========================================================
  return (
    <ErrorBoundary>
    <div className={shellClass}>
      <div className="mx-auto max-w-[1760px] px-3 py-4">
        {/* HEADER */}
        <header className="yo-header mb-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <CompanyLogos />
              <div className="min-w-0">
                <p className="yo-eyebrow">Aurum Arquitectos · YoDesarrollo</p>
                <h1 className="yo-display text-xl mt-0.5">Board operativo</h1>
                <p className="text-xs subtle mt-0.5">
                  <GlobalSyncBadge status={globalSync} />
                  {overdueCount > 0 && <button className="overdue-counter overdue-counter-btn" onClick={() => openDiag("atrasadas")} title="Ver detalle de tareas atrasadas"><AlertTriangle size={11}/>{overdueCount} vencida{overdueCount !== 1 ? "s" : ""}</button>}
                  {syncError && <span className="ml-2 text-red-600">· lectura: {syncError}</span>}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 items-center">
              <ViewSelector value={currentView} onChange={setCurrentView} />
              <label className="archive-toggle" title="Mostrar tareas archivadas">
                <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
                {showArchived ? <Eye size={12}/> : <EyeOff size={12}/>}
                <span>{showArchived ? "Ocultar archivadas" : "Ver archivadas"}</span>
                {archivedCount > 0 && <span className="archive-toggle-cnt">{archivedCount}</span>}
              </label>
              <button onClick={archiveAllDone} className="yo-btn-secondary" title="Archivar todas las terminadas"><Archive size={12}/>Limpiar</button>
              <button onClick={() => setShowExport(true)} className="yo-btn-secondary" title="Exportar / imprimir"><Printer size={12}/></button>
              <button onClick={() => setShowTrash(true)} className="yo-btn-secondary" title="Papelera" style={{ position: "relative" }}><Trash2 size={12}/>{trashedTasks.length > 0 && <span className="trash-cnt">{trashedTasks.length}</span>}</button>
              <button onClick={() => setShowSettings(true)} className="yo-btn-secondary" title="Ajustes de colores"><Settings size={12}/></button>
              <button onClick={() => { if (window.confirm("¿Cerrar sesión y volver a pedir la palabra?")) { onLogout && onLogout(); } }} className="yo-btn-secondary" title="Cerrar sesión"><LogOut size={12}/></button>
              <button onClick={() => setShowAI(true)} className="yo-btn-secondary ai-trigger" title="Asistente IA"><Sparkles size={12}/></button>
              <button onClick={() => setPresenting(true)} className="yo-btn-secondary" title="Modo presentación"><Play size={12}/></button>
              <button onClick={() => setTheme(t => t === "dark" ? "light" : "dark")} className="yo-btn-secondary" title="Tema claro/oscuro">{theme === "dark" ? <Sun size={12}/> : <Moon size={12}/>}</button>
              <button onClick={loadFromRemote} className="yo-btn-secondary" disabled={syncing} title="Forzar lectura"><RefreshCw size={12}/>{syncing ? "…" : ""}</button>
              <button onClick={() => setShowTemplate(v => !v)} className="yo-btn-secondary" title="Crear proyecto desde plantilla"><LayoutGrid size={12}/>Plantilla</button>
              <button onClick={() => setShowForm(v => !v)} className="yo-btn-primary"><Plus size={14}/>Tarea</button>
            </div>
          </div>
        </header>

        {diagnostic && (
          <div className="diagnostic-banner mb-3">
            <AlertCircle size={18} className="shrink-0" />
            <div><strong>No conecta al Sheet.</strong> {diagnostic.message}
              <div className="text-xs mt-1 opacity-80">Las lecturas siguen funcionando pero los cambios no se guardan. Verifica la URL del Apps Script.</div>
            </div>
          </div>
        )}

        <WeekBriefing stats={weekStats} risky={riskyProjects} colorOverrides={colorOverrides}
          onProjectClick={(p) => { setCurrentView("proyectos"); setExpandedProjectRows({ [p.key]: true }); }}
          onProjectDiag={(p) => openDiag("proyecto", { projectKey: p.key, empresa: p.empresa, proyecto: p.proyecto })} />

        {/* MÉTRICAS con toggle global/empresa */}
        <section className="mb-3">
          <div className="metrics-toolbar">
            <button className={`mt-tab ${metricsMode === "global" ? "on" : ""}`} onClick={() => setMetricsMode("global")}>Global</button>
            <button className={`mt-tab ${metricsMode === "empresa" ? "on" : ""}`} onClick={() => setMetricsMode("empresa")}>Por empresa</button>
          </div>
          {metricsMode === "global" ? (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              <Metric label="Total" value={metricsGlobal.total} onClick={() => openDiag("total")} />
              <Metric label="Pend." value={metricsGlobal.pen} tone="pendiente" onClick={() => openDiag("estado", { estado: "Pendiente" })} />
              <Metric label="Proceso" value={metricsGlobal.proc} tone="en-proceso" onClick={() => openDiag("estado", { estado: "En proceso" })} />
              <Metric label="Standby" value={metricsGlobal.rev} tone="en-standby" onClick={() => openDiag("estado", { estado: "En standby" })} />
              <Metric label="Term." value={metricsGlobal.term} tone="terminado" onClick={() => openDiag("estado", { estado: "Terminado" })} />
              <Metric label="Avance" value={`${metricsGlobal.avance}%`} onClick={() => openDiag("avance")} />
            </div>
          ) : (
            <div className="empresa-metrics">
              {metricsByEmpresa.map(({ empresa, m }) => (
                <div key={empresa} className="empresa-metric-block">
                  <div className="empresa-metric-head"><CompanyLogo name={empresa} size={16} /><span>{empresa}</span><span className="empresa-metric-avance">{m.avance}%</span></div>
                  <div className="grid grid-cols-5 gap-1">
                    <Metric label="Total" value={m.total} />
                    <Metric label="Pend." value={m.pen} tone="pendiente" />
                    <Metric label="Proc." value={m.proc} tone="en-proceso" />
                    <Metric label="Rev." value={m.rev} tone="en-standby" />
                    <Metric label="Term." value={m.term} tone="terminado" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* FILTROS */}
        <section className="mb-3 yo-card p-2">
          <div className="flex flex-wrap gap-2 mb-2">
            {[
              { key: "atrasadas", label: "Atrasadas" },
              { key: "semana", label: "Vencen esta semana" },
              { key: "alta", label: "Alta prioridad" },
              { key: "sinfecha", label: "Sin fecha" },
            ].map(chip => {
              const count = quickCounts[chip.key];
              const on = quickFilter === chip.key;
              const empty = count === 0;
              return (
                <button
                  key={chip.key}
                  type="button"
                  disabled={empty && !on}
                  onClick={() => setQuickFilter(on ? null : chip.key)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition ${on ? "bg-sky-600 text-white border-sky-600" : empty ? "bg-transparent border-slate-200 text-slate-300 cursor-default dark:border-slate-700 dark:text-slate-600" : "bg-transparent border-slate-300 text-slate-600 hover:border-sky-400 hover:text-sky-600 dark:border-slate-600 dark:text-slate-300"}`}
                >
                  {chip.label}
                  <span className={`ml-1.5 inline-flex items-center justify-center min-w-[1.25rem] px-1 rounded-full text-[10px] font-semibold ${on ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300"}`}>{count}</span>
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Field label="Empresa"><select className="input" value={filters.empresa} onChange={e => setFilters({ ...filters, empresa: e.target.value })}><option>Todas</option>{EMPRESAS.map(e => <option key={e}>{e}</option>)}</select></Field>
            <Field label="Proyecto"><select className="input" value={filters.proyecto} onChange={e => setFilters({ ...filters, proyecto: e.target.value })}>{projects.map(p => <option key={p}>{p}</option>)}</select></Field>
            <Field label="Responsable"><select className="input" value={filters.responsable} onChange={e => setFilters({ ...filters, responsable: e.target.value })}>{responsables.map(r => <option key={r}>{r}</option>)}</select></Field>
            <Field label="Estado"><select className="input" value={filters.estado} onChange={e => setFilters({ ...filters, estado: e.target.value })}><option>Todos</option>{ESTADOS.map(s => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Buscar"><input className="input" value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} placeholder="Texto…" /></Field>
          </div>
        </section>

        {/* FORM NUEVA TAREA */}
        {showForm && (
          <section className="mb-3 yo-card p-3">
            <div className="mb-3 flex items-center justify-between"><h2 className="yo-eyebrow">Nueva tarea</h2><button onClick={() => setShowForm(false)} className="btn-ghost"><X size={14}/></button></div>
            <div className="grid gap-2 md:grid-cols-3">
              <Field label="Empresa"><select value={newTask.empresa} onChange={e => setNewTask({ ...newTask, empresa: e.target.value })} className="input">{EMPRESAS.map(e => <option key={e}>{e}</option>)}</select></Field>
              <Field label="Proyecto (existente o nuevo)"><input className="input" list="dl-proyectos" value={newTask.proyecto} onChange={e => setNewTask({ ...newTask, proyecto: e.target.value })} placeholder="Selecciona o escribe nuevo" /><datalist id="dl-proyectos">{existingProjects.map(p => <option key={p} value={p} />)}</datalist></Field>
              <Field label="Responsable (existente o nuevo)"><input className="input" list="dl-responsables" value={newTask.responsable} onChange={e => setNewTask({ ...newTask, responsable: e.target.value })} placeholder="Selecciona o escribe nuevo" /><datalist id="dl-responsables">{existingResponsables.map(r => <option key={r} value={r} />)}</datalist></Field>
              <Field label="Fecha (calendario)"><input type="date" className="input" value={newTask._dateStr || ""} onChange={e => { const ds = e.target.value; const d = deriveDateFields(ds); setNewTask({ ...newTask, _dateStr: ds, fecha: d.fecha, semana: d.semana, mes: d.mes, mesCompromiso: d.mes }); }} /></Field>
              <Field label="Prioridad"><select className="input" value={newTask.prioridad} onChange={e => setNewTask({ ...newTask, prioridad: e.target.value })}>{PRIORIDADES.map(p => <option key={p}>{p}</option>)}</select></Field>
              <Field label="Estado"><select className="input" value={newTask.estado} onChange={e => setNewTask({ ...newTask, estado: e.target.value })}>{ESTADOS.map(s => <option key={s}>{s}</option>)}</select></Field>
            </div>
            <div className="grid gap-2 mt-2">
              <Field label="Actividad (existente o nueva)"><input className="input" list="dl-actividades" value={newTask.actividad} onChange={e => setNewTask({ ...newTask, actividad: e.target.value })} placeholder="Selecciona o escribe nueva" /><datalist id="dl-actividades">{existingActividades.map(a => <option key={a} value={a} />)}</datalist></Field>
              <Field label="Entregable"><input className="input" value={newTask.entregable} onChange={e => setNewTask({ ...newTask, entregable: e.target.value })} /></Field>
            </div>
            {newTask._dateStr && <div className="mt-2 form-derived">Se guardará como: <strong>{newTask.mes}</strong> · <strong>{newTask.fecha}</strong> · <strong>{newTask.semana}</strong></div>}
            <div className="mt-3 flex justify-end"><button onClick={addTask} className="yo-btn-primary"><Plus size={14}/>Crear en Sheet</button></div>
          </section>
        )}

        {/* FORM PLANTILLA DE PROYECTO */}
        {showTemplate && (() => {
          const selTpl = PROJECT_TEMPLATES.find(t => t.id === tplDraft.templateId);
          return (
            <section className="mb-3 yo-card p-3">
              <div className="mb-3 flex items-center justify-between"><h2 className="yo-eyebrow">Nuevo proyecto desde plantilla</h2><button onClick={() => setShowTemplate(false)} className="btn-ghost"><X size={14}/></button></div>
              <p className="text-xs subtle mb-3">Elige una plantilla y crea de un jalón todas sus tareas típicas (en Pendiente, sin fecha). Las fechas se ponen después.</p>
              <div className="grid gap-2 md:grid-cols-3">
                <Field label="Plantilla"><select className="input" value={tplDraft.templateId} onChange={e => { const id = e.target.value; const t = PROJECT_TEMPLATES.find(x => x.id === id); setTplDraft({ ...tplDraft, templateId: id, empresa: t ? t.empresa : tplDraft.empresa }); }}><option value="">— Elige una —</option>{PROJECT_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select></Field>
                <Field label="Empresa"><select className="input" value={tplDraft.empresa} onChange={e => setTplDraft({ ...tplDraft, empresa: e.target.value })}>{EMPRESAS.map(e => <option key={e}>{e}</option>)}</select></Field>
                <Field label="Responsable (existente o nuevo)"><input className="input" list="dl-responsables" value={tplDraft.responsable} onChange={e => setTplDraft({ ...tplDraft, responsable: e.target.value })} placeholder="¿Quién lo lleva?" /></Field>
              </div>
              <div className="grid gap-2 mt-2">
                <Field label="Nombre del proyecto"><input className="input" value={tplDraft.proyecto} onChange={e => setTplDraft({ ...tplDraft, proyecto: e.target.value })} placeholder="Ej. Casa Pueblas, App CroKiss…" /></Field>
              </div>
              {selTpl && (
                <div className="mt-3 form-derived">Se crearán <strong>{selTpl.tasks.length} tareas</strong>: {selTpl.tasks.map(it => it.actividad).join(" · ")}</div>
              )}
              <div className="mt-3 flex justify-end"><button onClick={createFromTemplate} className="yo-btn-primary"><Plus size={14}/>Crear proyecto</button></div>
            </section>
          );
        })()}

        {/* VISTAS */}
        <main>
          {currentView === "personas" && (
            <PersonasView personas={personasOrdenadas} hierarchy={hierarchy} tasksLength={tasks.length}
              expandedProyectos={expandedProyectos} toggleProyecto={toggleProyecto} setSelectedTaskId={setSelectedTaskId}
              changeStatusByDrag={changeStatusByDrag} draggingId={draggingId} setDraggingId={setDraggingId} saveStatus={saveStatus}
              projectOrder={projectOrder} reorderProjects={reorderProjects} draggingTileKey={draggingTileKey} setDraggingTileKey={setDraggingTileKey}
              colorOverrides={colorOverrides} onPersonaClick={setPersonaPanel} quickArchive={quickArchive} />
          )}
          {currentView === "proyectos" && (
            <ProjectsView projectsList={projectsList} expandedProjectRows={expandedProjectRows} toggleProjectRow={toggleProjectRow}
              setSelectedTaskId={setSelectedTaskId} colorOverrides={colorOverrides} quickArchive={quickArchive} />
          )}
          {currentView === "estados" && (
            <EstadosView tasks={filteredTasks} setSelectedTaskId={setSelectedTaskId} changeStatusByDrag={changeStatusByDrag}
              draggingId={draggingId} setDraggingId={setDraggingId} saveStatus={saveStatus} colorOverrides={colorOverrides} quickArchive={quickArchive} />
          )}
          {currentView === "calendario" && (
            <CalendarView tasks={filteredTasks} cursor={calCursor} setCursor={setCalCursor} setSelectedTaskId={setSelectedTaskId} colorOverrides={colorOverrides} />
          )}
          {currentView === "timeline" && (
            <TimelineView projectsList={projectsList} setSelectedTaskId={setSelectedTaskId} colorOverrides={colorOverrides} />
          )}
          {currentView === "misemana" && (
            <MiSemanaView tasks={filteredTasks} setSelectedTaskId={setSelectedTaskId} colorOverrides={colorOverrides} filtroResp={filters.responsable} setFiltroResp={(r) => setFilters({ ...filters, responsable: r })} responsables={responsables} />
          )}
        </main>
      </div>

      {showSettings && <SettingsPanel personas={allPersonas} colorOverrides={colorOverrides} onChangeColor={changePersonaColor} onClose={() => setShowSettings(false)} />}
      {personaPanel && <PersonaDashboard persona={personaPanel} tasks={tasks} colorOverrides={colorOverrides} onClose={() => setPersonaPanel(null)} onOpenTask={(id) => { setPersonaPanel(null); setSelectedTaskId(id); }} />}
      {showExport && <ExportView tasks={filteredTasks} metricsByEmpresa={metricsByEmpresa} riskyProjects={projectsList.filter(p => p.metrics.risk === "critico" || p.metrics.risk === "riesgo")} weekStats={weekStats} projectsList={projectsList} colorOverrides={colorOverrides} onClose={() => setShowExport(false)} />}
      {presenting && <PresentationMode tasks={tasks} weekStats={weekStats} riskyProjects={projectsList.filter(p => p.metrics.risk === "critico" || p.metrics.risk === "riesgo")} projectsList={projectsList} metricsByEmpresa={metricsByEmpresa} colorOverrides={colorOverrides} onClose={() => setPresenting(false)} />}
      {showTrash && <TrashView tasks={trashedTasks} colorOverrides={colorOverrides} onRestore={restoreTask} onClose={() => setShowTrash(false)} />}
      <DiagnosticPanel open={diagPanel.open} mode={diagPanel.mode} params={diagPanel.params} tasks={tasks} colorOverrides={colorOverrides} onTaskClick={(id) => setSelectedTaskId(id)} onClose={closeDiag} />
      {showAI && <AIChat tasks={tasks} projectsList={projectsList} onClose={() => setShowAI(false)} />}

      <ConfirmModal dialog={confirmDialog} />
      <GlobalStyles />
    </div>
    </ErrorBoundary>
  );
}

// ===================================================================
// VIEW SELECTOR
// ===================================================================
function ViewSelector({ value, onChange }) {
  const opts = [
    { id: "personas", label: "Personas", Icon: Users },
    { id: "proyectos", label: "Proyectos", Icon: Folder },
    { id: "estados", label: "Estados", Icon: LayoutGrid },
    { id: "calendario", label: "Calendario", Icon: Calendar },
    { id: "timeline", label: "Timeline", Icon: GanttChartSquare },
    { id: "misemana", label: "Mi semana", Icon: CalendarClock },
  ];
  return (
    <div className="view-selector">
      {opts.map(({ id, label, Icon }) => (
        <button key={id} onClick={() => onChange(id)} className={`vs-btn ${value === id ? "on" : ""}`} title={label}>
          <Icon size={12} /><span>{label}</span>
        </button>
      ))}
    </div>
  );
}

// ===================================================================
// BRIEFING SEMANAL
// ===================================================================
function WeekBriefing({ stats, risky, onProjectClick, onProjectDiag }) {
  return (
    <section className="brief">
      <div className="brief-col brief-col-stats">
        <div className="brief-lbl">Esta semana</div>
        <div className="brief-stats">
          <BriefStat n={stats.terminadasSemana} label="terminadas" />
          <BriefStat n={stats.revisionSemana} label="a revisión" />
          <BriefStat n={stats.vencenSemana} label="vencen 7d" />
        </div>
      </div>
      <div className="brief-divider" />
      <div className="brief-col brief-col-risks">
        <div className="brief-lbl"><span style={{ color: "#DC2626" }}>●</span> Proyectos en riesgo<span className="brief-lbl-cnt">{risky.length}</span></div>
        {risky.length === 0 ? <div className="brief-empty">Todos los proyectos en plazo.</div> : (
          <div className="risk-row">
            {risky.map(p => (
              <button key={p.key} className={`risk-card risk-${p.metrics.risk}`} onClick={() => onProjectDiag ? onProjectDiag(p) : onProjectClick(p)} title="Click para ver diagnóstico del proyecto">
                <div className="risk-head"><span className="risk-name">{p.proyecto}</span><span className="risk-pct">{p.metrics.pct}%</span></div>
                <div className="risk-meta"><span>{p.metrics.overdue} atrasadas</span><span className="dot">·</span><span>{p.empresa}</span></div>
                <ProgressBar pct={p.metrics.pct} risk={p.metrics.risk} />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
function BriefStat({ n, label }) { return <div className="brief-stat"><div className="brief-stat-n">{n}</div><div className="brief-stat-l">{label}</div></div>; }
function ProgressBar({ pct, risk = "ok" }) { return <div className={`progress progress-${risk}`}><div className="progress-fill" style={{ width: `${pct}%` }} /></div>; }

// ===================================================================
// VISTA: PERSONAS
// ===================================================================
function PersonasView({ personas, hierarchy, tasksLength, expandedProyectos, toggleProyecto, setSelectedTaskId, changeStatusByDrag, draggingId, setDraggingId, saveStatus, projectOrder, reorderProjects, draggingTileKey, setDraggingTileKey, colorOverrides, onPersonaClick, quickArchive }) {
  if (personas.length === 0) {
    return <div className="yo-card p-8 text-center text-sm subtle">{tasksLength === 0 ? "Cargando tareas desde el Sheet…" : "Sin tareas con los filtros actuales."}</div>;
  }
  return (
    <div className="personas-columns">
      {personas.map(persona => (
        <PersonaColumn key={persona} persona={persona} dataByEmpresa={hierarchy[persona]} expandedProyectos={expandedProyectos}
          onToggleProyecto={toggleProyecto} onOpenTask={setSelectedTaskId} onStatusChange={changeStatusByDrag} draggingId={draggingId}
          setDraggingId={setDraggingId} saveStatus={saveStatus} projectOrder={projectOrder} onReorderProjects={reorderProjects}
          draggingTileKey={draggingTileKey} setDraggingTileKey={setDraggingTileKey} colorOverrides={colorOverrides} onPersonaClick={onPersonaClick} quickArchive={quickArchive} />
      ))}
    </div>
  );
}

function PersonaColumn({ persona, dataByEmpresa, expandedProyectos, onToggleProyecto, onOpenTask, onStatusChange, draggingId, setDraggingId, saveStatus, projectOrder, onReorderProjects, draggingTileKey, setDraggingTileKey, colorOverrides, onPersonaClick, quickArchive }) {
  const palette = personPalette(persona, colorOverrides);
  const empresasOrdenadas = Object.keys(dataByEmpresa).sort((a, b) => {
    const ai = ORDER_EMPRESAS.indexOf(a), bi = ORDER_EMPRESAS.indexOf(b);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return a.localeCompare(b);
  });
  const allTasks = Object.values(dataByEmpresa).flatMap(emp => Object.values(emp).flat());
  const total = allTasks.length;
  const cerradas = allTasks.filter(t => t.estado === "Terminado").length;
  const altas = allTasks.filter(t => t.prioridad === "Alta" && t.estado !== "Terminado").length;
  return (
    <section className="persona-column" style={{ borderTopColor: palette.main }}>
      <header className="persona-column-header" style={{ background: palette.soft }} onClick={() => onPersonaClick(persona)} title="Ver resumen de esta persona">
        <PersonaAvatar name={persona} size={36} colorOverrides={colorOverrides} />
        <div className="persona-column-info">
          <h2 className="persona-column-name" style={{ color: palette.text }}>{persona}</h2>
          <div className="persona-column-meta"><span>{cerradas}/{total}</span>{altas > 0 && <span className="urgent-pill"><Zap size={9}/>{altas}</span>}<BarChart3 size={11} className="persona-stats-hint" /></div>
        </div>
      </header>
      <div className="persona-column-body">
        {empresasOrdenadas.map(empresa => (
          <EmpresaBlock key={empresa} empresa={empresa} persona={persona} proyectos={dataByEmpresa[empresa]} expandedProyectos={expandedProyectos}
            onToggleProyecto={onToggleProyecto} onOpenTask={onOpenTask} onStatusChange={onStatusChange} draggingId={draggingId} setDraggingId={setDraggingId}
            saveStatus={saveStatus} projectOrder={projectOrder} onReorderProjects={onReorderProjects} draggingTileKey={draggingTileKey} setDraggingTileKey={setDraggingTileKey} quickArchive={quickArchive} />
        ))}
      </div>
    </section>
  );
}

function EmpresaBlock({ empresa, persona, proyectos, expandedProyectos, onToggleProyecto, onOpenTask, onStatusChange, draggingId, setDraggingId, saveStatus, projectOrder, onReorderProjects, draggingTileKey, setDraggingTileKey, quickArchive }) {
  const allNames = Object.keys(proyectos);
  const orderKey = `${persona}::${empresa}`;
  const stored = (projectOrder && projectOrder[orderKey]) || [];
  const ordered = stored.filter(p => allNames.includes(p));
  const remaining = allNames.filter(p => !ordered.includes(p)).sort();
  const proyectosNombres = [...ordered, ...remaining];
  return (
    <div className="empresa-block">
      <div className="empresa-header-mini"><CompanyLogo name={empresa} size={14} /><span className="empresa-name-mini">{empresa}</span></div>
      <div className="proyectos-row">
        {proyectosNombres.map((proyecto, idx) => {
          const key = `${persona}::${empresa}::${proyecto}`;
          return (
            <ProyectoTileCompact key={proyecto} proyecto={proyecto} persona={persona} empresa={empresa} index={idx} tileKey={key}
              tasks={proyectos[proyecto]} expanded={!!expandedProyectos[key]} onToggle={() => onToggleProyecto(key)} onOpenTask={onOpenTask}
              onStatusChange={onStatusChange} draggingId={draggingId} setDraggingId={setDraggingId} saveStatus={saveStatus}
              onReorder={(fromIdx, toIdx) => onReorderProjects(persona, empresa, fromIdx, toIdx, proyectosNombres)} draggingTileKey={draggingTileKey} setDraggingTileKey={setDraggingTileKey} quickArchive={quickArchive} />
          );
        })}
      </div>
    </div>
  );
}

function ProyectoTileCompact({ proyecto, persona, empresa, index, tileKey, tasks, expanded, onToggle, onOpenTask, onStatusChange, draggingId, setDraggingId, saveStatus, onReorder, draggingTileKey, setDraggingTileKey, quickArchive }) {
  const Icon = iconForProject(proyecto);
  const pen = tasks.filter(t => t.estado === "Pendiente").length;
  const proc = tasks.filter(t => t.estado === "En proceso").length;
  const rev = tasks.filter(t => t.estado === "En standby").length;
  const term = tasks.filter(t => t.estado === "Terminado").length;
  const altas = tasks.filter(t => t.prioridad === "Alta" && t.estado !== "Terminado").length;
  const [over, setOver] = useState(false);
  const isDragging = draggingTileKey === tileKey;
  function handleDragStart(e) { e.stopPropagation(); e.dataTransfer.setData("application/x-aurum-tile", JSON.stringify({ persona, empresa, index })); e.dataTransfer.effectAllowed = "move"; setDraggingTileKey(tileKey); }
  function handleDragEnd() { setDraggingTileKey(null); setOver(false); }
  function handleDragOver(e) { if (!e.dataTransfer.types.includes("application/x-aurum-tile")) return; e.preventDefault(); e.stopPropagation(); setOver(true); }
  function handleDragLeave() { setOver(false); }
  function handleDrop(e) {
    e.preventDefault(); e.stopPropagation(); setOver(false);
    const raw = e.dataTransfer.getData("application/x-aurum-tile"); if (!raw) return;
    try { const src = JSON.parse(raw); if (src.persona !== persona || src.empresa !== empresa) return; if (src.index === index) return; onReorder(src.index, index); } catch {}
  }
  return (
    <div className={`proyecto-tile ${expanded ? "expanded" : ""} ${isDragging ? "tile-dragging" : ""} ${over ? "tile-drop-over" : ""}`} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      <button onClick={onToggle} className="proyecto-tile-button" title={proyecto}>
        <div className="proyecto-tile-top">
          <span className="drag-handle" draggable onDragStart={handleDragStart} onDragEnd={handleDragEnd} onClick={e => e.stopPropagation()} title="Arrastra para reordenar">⋮⋮</span>
          <Icon size={11} /><span className="proyecto-tile-name">{proyecto}</span>
          {altas > 0 && !expanded && <span className="alta-mini"><Zap size={8}/>{altas}</span>}
          {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </div>
        <div className="proyecto-tile-stats">
          <span className="stat-pen" title="Pendientes">{pen}</span>
          <span className="stat-proc" title="En proceso">{proc}</span>
          <span className="stat-sub" title="En standby">{rev}</span>
          <span className="stat-term" title="Terminadas">{term}</span>
        </div>
      </button>
      {expanded && <div className="proyecto-tile-kanban"><ProjectKanbanVertical tasks={tasks} onOpen={onOpenTask} onStatusChange={onStatusChange} draggingId={draggingId} setDraggingId={setDraggingId} saveStatus={saveStatus} quickArchive={quickArchive} /></div>}
    </div>
  );
}

function ProjectKanbanVertical({ tasks, onOpen, onStatusChange, draggingId, setDraggingId, saveStatus, quickArchive }) {
  return (
    <div className="kanban-vertical">
      {ESTADOS.map(estado => (
        <KanbanColumn key={estado} status={estado} tasks={tasks.filter(t => t.estado === estado)} onDrop={(taskId) => onStatusChange(taskId, estado)}
          onOpen={onOpen} draggingId={draggingId} setDraggingId={setDraggingId} saveStatus={saveStatus} quickArchive={quickArchive} />
      ))}
    </div>
  );
}

function KanbanColumn({ status, tasks, onDrop, onOpen, draggingId, setDraggingId, saveStatus, quickArchive }) {
  const [over, setOver] = useState(false);
  return (
    <div className={`kanban-col kanban-col-${estadoSlug(status)} ${over ? "over" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain"); setOver(false); if (id) onDrop(id); }}>
      <div className="kanban-col-header"><span>{status}</span><span className="kanban-count">{tasks.length}</span></div>
      <div className="kanban-col-body">
        {tasks.length === 0 && <div className="kanban-empty">—</div>}
        {tasks.map(task => <KanbanCard key={task.id} task={task} onOpen={onOpen} isDragging={draggingId === task.id} setDraggingId={setDraggingId} saveStatus={saveStatus[task.id]} quickArchive={quickArchive} />)}
      </div>
    </div>
  );
}

function KanbanCard({ task, onOpen, isDragging, setDraggingId, saveStatus, quickArchive }) {
  const hasLinks = (task.links?.length || 0) > 0;
  const done = task.estado === "Terminado";
  const arch = !!task.archivada;
  const overdue = isOverdue(task);
  const today = isDueToday(task);
  return (
    <article draggable onDragStart={(e) => { e.dataTransfer.setData("text/plain", task.id); e.dataTransfer.effectAllowed = "move"; setDraggingId(task.id); }}
      onDragEnd={() => setDraggingId(null)} onClick={() => onOpen(task.id)}
      className={`kanban-card ${isDragging ? "dragging" : ""} ${arch ? "archived" : ""} ${overdue ? "card-overdue" : ""} ${today ? "card-today" : ""}`}>
      <div className="kanban-card-top">
        <PrioridadDot prioridad={task.prioridad} />
        <div className="kanban-card-top-right">
          {(done || task.estado === "En standby") && <button className="quick-archive-btn" title={arch ? "Desarchivar" : "Archivar"} onClick={(e) => { e.stopPropagation(); quickArchive(task.id, !arch); }}><Archive size={10}/></button>}
          <SaveDot status={saveStatus} />
        </div>
      </div>
      <h4 className="kanban-card-title">{task.actividad}</h4>
      <div className="kanban-card-bottom">
        <span>{done && task.fechaTerminado ? `✓ ${fechaTerminadoCorta(task.fechaTerminado)}` : fechaCorta(task)}</span>
        {!done && <DeadlineBadge task={task} compact />}
        {hasLinks && <span className="link-icon"><Link2 size={10}/>{task.links.length}</span>}
      </div>
    </article>
  );
}

// ===================================================================
// VISTA: PROYECTOS
// ===================================================================
function ProjectsView({ projectsList, expandedProjectRows, toggleProjectRow, setSelectedTaskId, colorOverrides, quickArchive }) {
  if (projectsList.length === 0) return <div className="yo-card p-8 text-center text-sm subtle">Sin proyectos con los filtros actuales.</div>;
  return (
    <div className="projects-view">
      {projectsList.map(p => <ProjectRow key={p.key} project={p} expanded={!!expandedProjectRows[p.key]} onToggle={() => toggleProjectRow(p.key)} setSelectedTaskId={setSelectedTaskId} colorOverrides={colorOverrides} quickArchive={quickArchive} />)}
    </div>
  );
}

function ProjectRow({ project, expanded, onToggle, setSelectedTaskId, colorOverrides, quickArchive }) {
  const Icon = iconForProject(project.proyecto);
  const { metrics } = project;
  return (
    <div className={`proj-row proj-risk-${metrics.risk} ${expanded ? "expanded" : ""}`}>
      <button className="proj-row-head" onClick={onToggle}>
        <div className="proj-row-mark"><span className={`risk-dot risk-dot-${metrics.risk}`} /><Icon size={14} /></div>
        <div className="proj-row-id"><div className="proj-row-name">{project.proyecto}</div><div className="proj-row-meta">{project.empresa}</div></div>
        <div className="proj-row-pipeline">
          {ESTADOS.map(s => { const cnt = project.tasks.filter(t => t.estado === s).length; return <div key={s} className={`pipe pipe-${estadoSlug(s)}`} title={`${s}: ${cnt}`}><span className="pipe-n">{cnt}</span><span className="pipe-l">{s.slice(0, 3)}</span></div>; })}
        </div>
        <div className="proj-row-team">
          {project.asignados.slice(0, 5).map(name => <PersonaAvatar key={name} name={name} size={22} colorOverrides={colorOverrides} />)}
          {project.asignados.length > 5 && <span className="team-more">+{project.asignados.length - 5}</span>}
        </div>
        <div className="proj-row-progress"><ProgressBar pct={metrics.pct} risk={metrics.risk} /><div className="proj-row-pct">{metrics.pct}%</div></div>
        <div className="proj-row-chev">{expanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}</div>
      </button>
      {expanded && <div className="proj-row-body">{project.tasks.sort((a, b) => urgencyScore(a) - urgencyScore(b)).map(t => <TaskListRow key={t.id} task={t} onOpen={() => setSelectedTaskId(t.id)} colorOverrides={colorOverrides} quickArchive={quickArchive} />)}</div>}
    </div>
  );
}

function TaskListRow({ task, onOpen, colorOverrides, quickArchive }) {
  const done = task.estado === "Terminado";
  const palette = personPalette(task.responsable, colorOverrides);
  return (
    <div className={`task-row ${task.archivada ? "archived" : ""} ${isOverdue(task) ? "row-overdue" : ""}`} onClick={onOpen}>
      <EstadoChip estado={task.estado} mini />
      <div className="task-row-title">{task.actividad}{task.archivada && <Archive size={10} className="task-row-arch"/>}</div>
      <div className="task-row-asg"><PersonaAvatar name={task.responsable} size={18} colorOverrides={colorOverrides} /><span style={{ color: palette.text }}>{(task.responsable || "").split(" ")[0]}</span></div>
      <div className="task-row-date">{done && task.fechaTerminado ? `✓ ${fechaTerminadoCorta(task.fechaTerminado)}` : fechaCorta(task)}</div>
      <div className="task-row-due">{(done || task.estado === "En standby") ? (<button className="quick-archive-btn" title={task.archivada ? "Desarchivar" : "Archivar"} onClick={(e) => { e.stopPropagation(); quickArchive(task.id, !task.archivada); }}><Archive size={11}/></button>) : <DeadlineBadge task={task} compact />}</div>
    </div>
  );
}

// ===================================================================
// VISTA: ESTADOS
// ===================================================================
function EstadosView({ tasks, setSelectedTaskId, changeStatusByDrag, draggingId, setDraggingId, saveStatus, colorOverrides, quickArchive }) {
  return (
    <div className="estados-view">
      {ESTADOS.map(s => {
        const colTasks = tasks.filter(t => t.estado === s).sort((a, b) => urgencyScore(a) - urgencyScore(b));
        return <EstadoColumn key={s} estado={s} tasks={colTasks} onDrop={(taskId) => changeStatusByDrag(taskId, s)} onOpen={setSelectedTaskId} draggingId={draggingId} setDraggingId={setDraggingId} saveStatus={saveStatus} colorOverrides={colorOverrides} quickArchive={quickArchive} />;
      })}
    </div>
  );
}

function EstadoColumn({ estado, tasks, onDrop, onOpen, draggingId, setDraggingId, saveStatus, colorOverrides, quickArchive }) {
  const [over, setOver] = useState(false);
  return (
    <div className={`estado-col estado-col-${estadoSlug(estado)} ${over ? "over" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain"); setOver(false); if (id) onDrop(id); }}>
      <div className="estado-col-header"><span>{estado}</span><span className="estado-col-count">{tasks.length}</span></div>
      <div className="estado-col-body">
        {tasks.length === 0 && <div className="kanban-empty">—</div>}
        {tasks.map(task => <EstadoCard key={task.id} task={task} onOpen={onOpen} isDragging={draggingId === task.id} setDraggingId={setDraggingId} saveStatus={saveStatus[task.id]} colorOverrides={colorOverrides} quickArchive={quickArchive} />)}
      </div>
    </div>
  );
}

function EstadoCard({ task, onOpen, isDragging, setDraggingId, saveStatus, colorOverrides, quickArchive }) {
  const palette = personPalette(task.responsable, colorOverrides);
  const done = task.estado === "Terminado";
  const overdue = isOverdue(task);
  const today = isDueToday(task);
  return (
    <article draggable onDragStart={(e) => { e.dataTransfer.setData("text/plain", task.id); e.dataTransfer.effectAllowed = "move"; setDraggingId(task.id); }}
      onDragEnd={() => setDraggingId(null)} onClick={() => onOpen(task.id)}
      className={`estado-card ${isDragging ? "dragging" : ""} ${task.archivada ? "archived" : ""} ${overdue ? "card-overdue" : ""} ${today ? "card-today" : ""}`} style={{ borderLeftColor: palette.main }}>
      <div className="estado-card-top"><span className="estado-card-proj">{task.proyecto}</span><PrioridadDot prioridad={task.prioridad} /></div>
      <h4 className="estado-card-title">{task.actividad}</h4>
      <div className="estado-card-bottom">
        <div className="estado-card-asg"><PersonaAvatar name={task.responsable} size={16} colorOverrides={colorOverrides} /><span style={{ color: palette.text }}>{(task.responsable || "").split(" ")[0]}</span></div>
        <div className="estado-card-right">
          {done && task.fechaTerminado ? <span className="estado-card-date">✓ {fechaTerminadoCorta(task.fechaTerminado)}</span> : (!done && <DeadlineBadge task={task} compact />)}
          {(done || task.estado === "En standby") && <button className="quick-archive-btn" title={task.archivada ? "Desarchivar" : "Archivar"} onClick={(e) => { e.stopPropagation(); quickArchive(task.id, !task.archivada); }}><Archive size={9}/></button>}
        </div>
      </div>
    </article>
  );
}

// ===================================================================
// VISTA: CALENDARIO
// ===================================================================
function CalendarView({ tasks, cursor, setCursor, setSelectedTaskId, colorOverrides }) {
  const cells = buildMonthMatrix(cursor.year, cursor.month);
  const tasksByDay = useMemo(() => {
    const map = {};
    tasks.forEach(t => {
      const cd = commitmentDate(t);
      if (!cd) return;
      if (cd.getFullYear() !== cursor.year || cd.getMonth() !== cursor.month) return;
      const d = cd.getDate();
      (map[d] = map[d] || []).push(t);
    });
    return map;
  }, [tasks, cursor]);
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === cursor.year && today.getMonth() === cursor.month;
  function prevMonth() { setCursor(c => { const m = c.month - 1; return m < 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: m }; }); }
  function nextMonth() { setCursor(c => { const m = c.month + 1; return m > 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: m }; }); }
  function goToday() { const d = new Date(); setCursor({ year: d.getFullYear(), month: d.getMonth() }); }
  return (
    <div className="calendar-view yo-card">
      <div className="cal-header">
        <div className="cal-title">{MESES[cursor.month]} {cursor.year}</div>
        <div className="cal-nav">
          <button onClick={prevMonth} className="cal-nav-btn"><ChevronLeft size={14}/></button>
          <button onClick={goToday} className="cal-today-btn">Hoy</button>
          <button onClick={nextMonth} className="cal-nav-btn"><ChevronRight size={14}/></button>
        </div>
      </div>
      <div className="cal-weekdays">{DIAS_CORTO.map(d => <div key={d} className="cal-weekday">{d}</div>)}</div>
      <div className="cal-grid">
        {cells.map((cell, i) => {
          if (!cell) return <div key={i} className="cal-cell cal-cell-empty" />;
          const d = cell.getDate();
          const dayTasks = tasksByDay[d] || [];
          const isToday = isCurrentMonth && today.getDate() === d;
          return (
            <div key={i} className={`cal-cell ${isToday ? "cal-cell-today" : ""}`}>
              <div className="cal-cell-num">{d}</div>
              <div className="cal-cell-tasks">
                {dayTasks.slice(0, 4).map(t => {
                  const palette = personPalette(t.responsable, colorOverrides);
                  const done = t.estado === "Terminado";
                  return (
                    <button key={t.id} className={`cal-task ${isOverdue(t) ? "cal-task-overdue" : ""} ${done ? "cal-task-done" : ""}`} style={{ borderLeftColor: palette.main }} onClick={() => setSelectedTaskId(t.id)} title={`${t.actividad} · ${t.responsable} · ${t.estado}`}>
                      <span className={`cal-task-dot est-dot-${estadoSlug(t.estado)}`} />
                      <span className="cal-task-txt">{t.actividad}</span>
                    </button>
                  );
                })}
                {dayTasks.length > 4 && <div className="cal-more">+{dayTasks.length - 4} más</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===================================================================
// PANEL DE AJUSTES (colores)
// ===================================================================
function SettingsPanel({ personas, colorOverrides, onChangeColor, onClose }) {
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-box" onClick={e => e.stopPropagation()}>
        <header className="settings-header">
          <div><p className="yo-eyebrow">Ajustes</p><h3 className="settings-title">Colores por responsable</h3><p className="settings-sub">Estos colores se guardan en el Sheet y los ve todo el equipo.</p></div>
          <button onClick={onClose} className="btn-ghost"><X size={14}/></button>
        </header>
        <div className="settings-body">
          {personas.length === 0 ? <p className="text-sm subtle p-4 text-center">Aún no hay personas con tareas asignadas.</p> :
            personas.map(name => <PersonaColorRow key={name} name={name} currentColor={colorOverrides[name] || PALETTE_DEFAULTS[hashName(name) % PALETTE_DEFAULTS.length]} isCustom={!!colorOverrides[name]} onChange={(color) => onChangeColor(name, color)} />)}
        </div>
      </div>
    </div>
  );
}
function PersonaColorRow({ name, currentColor, isCustom, onChange }) {
  return (
    <div className="persona-color-row">
      <div className="pcr-id"><div className="pcr-avatar" style={{ background: currentColor }}>{getInitials(name)}</div><div><div className="pcr-name">{name}</div><div className="pcr-sub">{isCustom ? "Personalizado" : "Automático"} · {currentColor}</div></div></div>
      <div className="pcr-swatches">
        {COLOR_PICKER_SWATCHES.map(c => <button key={c} className={`swatch ${c === currentColor ? "on" : ""}`} style={{ background: c }} onClick={() => onChange(c)} title={c} />)}
        <input type="color" value={currentColor} onChange={e => onChange(e.target.value)} className="swatch-custom" title="Color personalizado" />
      </div>
    </div>
  );
}

// ===================================================================
// DASHBOARD POR PERSONA
// ===================================================================
function PersonaDashboard({ persona, tasks, colorOverrides, onClose, onOpenTask }) {
  const palette = personPalette(persona, colorOverrides);
  const mine = tasks.filter(t => t.responsable === persona);
  const m = calcMetricsFor(mine);
  const byEmpresa = EMPRESAS.map(e => ({ empresa: e, m: calcMetricsFor(mine.filter(t => t.empresa === e)) })).filter(x => x.m.total > 0);
  const overdueList = mine.filter(isOverdue).sort((a, b) => daysUntil(a) - daysUntil(b));
  const upcoming = mine.filter(t => { const d = daysUntil(t); return t.estado !== "Terminado" && d != null && d >= 0 && d <= 7; }).sort((a, b) => daysUntil(a) - daysUntil(b));
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="dash-box" onClick={e => e.stopPropagation()}>
        <header className="dash-header" style={{ background: palette.soft }}>
          <div className="dash-id"><div className="dash-avatar" style={{ background: palette.main }}>{getInitials(persona)}</div><div><p className="yo-eyebrow">Resumen de persona</p><h3 className="dash-name" style={{ color: palette.text }}>{persona}</h3></div></div>
          <button onClick={onClose} className="btn-ghost"><X size={14}/></button>
        </header>
        <div className="dash-body">
          {(() => { try { const diag = runDiagnostics(tasks, "persona", { persona }); const estado = diag && diag.estadoPersona; if (!estado || estado === "ok") return null; const cls = estado === "crítica" ? "dash-diag-critica" : estado === "sobrecargada" ? "dash-diag-sobrecargada" : "dash-diag-riesgo"; const action = (diag.actions && diag.actions[0]) || null; return (<div className={`dash-diag ${cls}`}><div className="dash-diag-status">{String(estado).toUpperCase()}</div>{action && <div className="dash-diag-action"><Zap size={11} style={{display:'inline',marginRight:4}}/>{action}</div>}</div>); } catch (e) { console.error("[dash-diag]", e); return null; } })()}
          <div className="dash-metrics">
            <div className="dash-metric"><div className="dash-metric-n">{m.total}</div><div className="dash-metric-l">Total</div></div>
            <div className="dash-metric"><div className="dash-metric-n">{m.pen}</div><div className="dash-metric-l">Pendientes</div></div>
            <div className="dash-metric"><div className="dash-metric-n">{m.proc}</div><div className="dash-metric-l">En proceso</div></div>
            <div className="dash-metric"><div className="dash-metric-n">{m.rev}</div><div className="dash-metric-l">En revisión</div></div>
            <div className="dash-metric"><div className="dash-metric-n">{m.term}</div><div className="dash-metric-l">Terminadas</div></div>
            <div className="dash-metric dash-metric-danger"><div className="dash-metric-n">{m.overdue}</div><div className="dash-metric-l">Vencidas</div></div>
          </div>
          <div className="dash-avance-row"><span className="dash-avance-lbl">Avance general</span><div className="dash-avance-bar"><div className="dash-avance-fill" style={{ width: `${m.avance}%`, background: palette.main }} /></div><span className="dash-avance-pct">{m.avance}%</span></div>
          {byEmpresa.length > 1 && (
            <div className="dash-section"><div className="dash-section-lbl">Por empresa</div>{byEmpresa.map(({ empresa, m: em }) => (<div key={empresa} className="dash-empresa-row"><CompanyLogo name={empresa} size={14} /><span className="dash-empresa-name">{empresa}</span><span className="dash-empresa-stat">{em.term}/{em.total} · {em.avance}%</span></div>))}</div>
          )}
          {overdueList.length > 0 && (
            <div className="dash-section"><div className="dash-section-lbl dash-section-danger"><AlertTriangle size={12}/> Vencidas ({overdueList.length})</div>{overdueList.slice(0, 5).map(t => (<button key={t.id} className="dash-task-row" onClick={() => onOpenTask(t.id)}><span className="dash-task-title">{t.actividad}</span><DeadlineBadge task={t} compact /></button>))}</div>
          )}
          {upcoming.length > 0 && (
            <div className="dash-section"><div className="dash-section-lbl">Próximas (7 días)</div>{upcoming.slice(0, 5).map(t => (<button key={t.id} className="dash-task-row" onClick={() => onOpenTask(t.id)}><span className="dash-task-title">{t.actividad}</span><DeadlineBadge task={t} compact /></button>))}</div>
          )}
          {overdueList.length === 0 && upcoming.length === 0 && <div className="dash-empty">Sin pendientes urgentes. 👌</div>}
        </div>
      </div>
    </div>
  );
}

// ===================================================================
// EXPORTAR / IMPRIMIR
// ===================================================================
function ExportView({ tasks, metricsByEmpresa, riskyProjects, weekStats, projectsList, colorOverrides, onClose }) {
  const fecha = new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
  const dataPersona = useMemo(() => {
    const map = {};
    tasks.forEach(t => { if (t.archivada || t.borrada) return; const p = t.responsable || "Sin responsable"; (map[p] = map[p] || []).push(t); });
    return Object.entries(map).map(([persona, list]) => {
      const diag = runDiagnostics(tasks, "persona", { persona });
      return { persona, list, diag, m: calcMetricsFor(list) };
    }).sort((a, b) => b.m.total - a.m.total);
  }, [tasks]);

  const totalActivos = tasks.filter(t => !t.archivada && !t.borrada).length;
  const totalAbiertas = tasks.filter(t => !t.archivada && !t.borrada && normalizeEstado(t.estado) !== "Terminado").length;
  const totalAtrasadas = tasks.filter(t => !t.archivada && !t.borrada && _isOverdueTask(t)).length;
  const totalTerm = tasks.filter(t => !t.archivada && !t.borrada && normalizeEstado(t.estado) === "Terminado").length;
  const avanceGen = totalActivos > 0 ? Math.round((totalTerm / totalActivos) * 100) : 0;

  const topAlerts = [...(projectsList || [])].filter(p => p.metrics.risk === "critico" || p.metrics.risk === "riesgo").slice(0, 3);
  const logros = tasks.filter(t => normalizeEstado(t.estado) === "Terminado" && t.fechaTerminado && (Date.now() - new Date(t.fechaTerminado).getTime()) < 7 * 86400000).slice(0, 5);

  const recomendaciones = useMemo(() => {
    const r = [];
    if (totalAtrasadas >= 5) r.push(`Hay ${totalAtrasadas} tareas atrasadas. Bloquea tiempo esta semana para destrabarlas — empieza por las más viejas.`);
    if (totalAtrasadas > 0 && totalAtrasadas < 5) r.push(`${totalAtrasadas} tareas vencidas — manejable, pero atiéndelas antes de que crezcan.`);
    const sobrec = dataPersona.filter(d => d.diag.estadoPersona === "sobrecargada" || d.diag.estadoPersona === "crítica");
    if (sobrec.length > 0) r.push(`${sobrec.map(d => d.persona).join(", ")} ${sobrec.length === 1 ? "está" : "están"} con carga alta. Considera reasignar o aplazar.`);
    if (avanceGen < 30) r.push(`Avance general bajo (${avanceGen}%) — revisa qué está bloqueando los cierres.`);
    if (topAlerts.length >= 2) r.push(`${topAlerts.length} proyectos en riesgo. Agenda revisión específica con los responsables esta semana.`);
    if (r.length === 0) r.push("Operación estable. Mantén el ritmo.");
    return r;
  }, [totalAtrasadas, dataPersona, avanceGen, topAlerts.length]);

  return (
    <div className="export-overlay">
      <div className="export-toolbar no-print">
        <span className="export-toolbar-title">Reporte ejecutivo · vista previa</span>
        <div className="export-toolbar-actions">
          <button onClick={() => window.print()} className="yo-btn-primary"><Printer size={14}/>Imprimir / Guardar PDF</button>
          <button onClick={onClose} className="yo-btn-secondary"><X size={14}/>Cerrar</button>
        </div>
      </div>
      <div className="export-sheet export-exec" id="export-sheet">
        <div className="export-exec-cover">
          <div className="export-eyebrow">Aurum Arquitectos · YoDesarrollo</div>
          <h1 className="export-exec-title">Reporte ejecutivo</h1>
          <div className="export-exec-sub">{fecha}</div>
        </div>

        <div className="export-exec-summary">
          <div className="export-exec-stat"><div className="export-exec-stat-n">{totalActivos}</div><div className="export-exec-stat-l">Tareas activas</div></div>
          <div className="export-exec-stat"><div className="export-exec-stat-n">{totalAbiertas}</div><div className="export-exec-stat-l">Abiertas</div></div>
          <div className={`export-exec-stat ${totalAtrasadas > 0 ? "export-exec-stat-danger" : ""}`}><div className="export-exec-stat-n">{totalAtrasadas}</div><div className="export-exec-stat-l">Atrasadas</div></div>
          <div className="export-exec-stat"><div className="export-exec-stat-n">{avanceGen}%</div><div className="export-exec-stat-l">Avance general</div></div>
        </div>

        {topAlerts.length > 0 && (
          <div className="export-exec-section">
            <h2 className="export-exec-h2">⚠ Alertas principales</h2>
            {topAlerts.map(p => (
              <div key={p.key} className="export-exec-alert">
                <div className="export-exec-alert-title">{p.proyecto} <span style={{ fontWeight: 400, color: "#666" }}>· {p.empresa}</span></div>
                <div className="export-exec-alert-meta">{p.metrics.overdue} atrasadas · {p.metrics.pct}% avance · {p.metrics.openTotal} abiertas · estado: {p.metrics.risk.toUpperCase()}</div>
              </div>
            ))}
          </div>
        )}

        {logros.length > 0 && (
          <div className="export-exec-section">
            <h2 className="export-exec-h2">✓ Logros de la semana</h2>
            {logros.map(t => (
              <div key={t.id} className="export-exec-win">{t.actividad} <span style={{ color: "#666" }}>· {t.proyecto} · {t.responsable}</span></div>
            ))}
          </div>
        )}

        <div className="export-exec-section">
          <h2 className="export-exec-h2">Resumen por empresa</h2>
          <table className="export-table">
            <thead><tr><th>Empresa</th><th>Total</th><th>Pend.</th><th>Proc.</th><th>Rev.</th><th>Term.</th><th>Atras.</th><th>Avance</th></tr></thead>
            <tbody>{metricsByEmpresa.map(({ empresa, m }) => (<tr key={empresa}><td>{empresa}</td><td>{m.total}</td><td>{m.pen}</td><td>{m.proc}</td><td>{m.rev}</td><td>{m.term}</td><td className={m.overdue > 0 ? "export-danger" : ""}>{m.overdue}</td><td><strong>{m.avance}%</strong></td></tr>))}</tbody>
          </table>
        </div>

        <div className="export-exec-section">
          <h2 className="export-exec-h2">👥 Asignaciones por persona</h2>
          <p style={{ fontSize: "0.78rem", color: "#666", marginBottom: "1rem", marginTop: "-0.3rem" }}>Comparte esta sección con el equipo — cada quien ve lo suyo</p>
          {dataPersona.map(({ persona, list, diag, m }) => {
            const abiertas = list.filter(t => !t.archivada && !t.borrada && normalizeEstado(t.estado) !== "Terminado");
            const ordenadas = _sortByUrgency(abiertas);
            return (
              <div key={persona} className="export-exec-persona">
                <div className="export-exec-persona-head">
                  <div className="export-exec-persona-name">{persona}</div>
                  <div className="export-exec-persona-meta">{m.openTotal || abiertas.length} abiertas · {m.overdue || 0} vencidas · {m.avance}% avance · <strong>{diag.estadoPersona || "ok"}</strong></div>
                </div>
                {ordenadas.length === 0 ? (
                  <p className="export-exec-persona-empty">Sin tareas abiertas. ✓</p>
                ) : (
                  ordenadas.slice(0, 15).map(t => {
                    const d = daysUntil(t);
                    const isLate = d !== null && d < 0;
                    const isSoon = d !== null && d >= 0 && d <= 7;
                    return (
                      <div key={t.id} className="export-exec-persona-task">
                        <div>
                          <div>{t.actividad}</div>
                          <div className="export-exec-persona-task-meta">{t.proyecto} · {t.empresa} · {t.prioridad || "—"}</div>
                        </div>
                        <div className="export-exec-persona-task-meta">{t.estado}</div>
                        <div className={`export-exec-persona-task-due ${isLate ? "due-late" : isSoon ? "due-soon" : ""}`}>
                          {d === null ? "—" : isLate ? `${Math.abs(d)}d vencida` : `${d}d`}
                        </div>
                      </div>
                    );
                  })
                )}
                {diag.actions && diag.actions.length > 0 && <div style={{ fontSize: "0.78rem", color: "#92400E", marginTop: "0.5rem", fontStyle: "italic" }}>💡 {diag.actions[0]}</div>}
              </div>
            );
          })}
        </div>

        <div className="export-exec-section">
          <h2 className="export-exec-h2">💡 Recomendaciones</h2>
          {recomendaciones.map((r, i) => <div key={i} className="export-exec-rec">{r}</div>)}
        </div>

        <div className="export-foot">Generado desde el Board operativo · {fecha}</div>
      </div>
    </div>
  );
}


// ===================================================================
// MODO PRESENTACIÓN
// ===================================================================
function PresentationMode({ tasks, weekStats, riskyProjects, projectsList, metricsByEmpresa, colorOverrides, onClose }) {
  const [slide, setSlide] = useState(0);
  const slides = [
    { title: "Board operativo", subtitle: "Aurum Arquitectos · YoDesarrollo", kind: "cover" },
    { title: "Esta semana", subtitle: "Movimientos relevantes", kind: "stats" },
    { title: "Avance general", subtitle: "Estado de la operación", kind: "avance" },
    { title: "Salud por empresa", subtitle: "Avance y carga por organización", kind: "empresas" },
    { title: "Proyectos en riesgo", subtitle: "Atención inmediata", kind: "risks" },
    { title: "Carga del equipo", subtitle: "Cuánto trae cada quien", kind: "load" },
    { title: "Próximas entregas", subtitle: "Vencen en los próximos 7 días", kind: "upcoming" },
    { title: "Actividad reciente", subtitle: "Última semana", kind: "activity" },
  ];
  useEffect(() => {
    const onKey = (e) => { if (e.key === "ArrowRight") setSlide(s => Math.min(slides.length - 1, s + 1)); if (e.key === "ArrowLeft") setSlide(s => Math.max(0, s - 1)); if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length, onClose]);
  const cur = slides[slide];
  return (
    <div className="present-overlay">
      <button className="present-close" onClick={onClose}><X size={14}/> Salir</button>
      <div className="present-stage">
        <p className="present-eyebrow">Aurum · YoDesarrollo</p>
        <h2 className="present-title">{cur.title}</h2>
        <p className="present-sub">{cur.subtitle}</p>
        <div className="present-body">
          {cur.kind === "cover" && <PresentCover stats={weekStats} risky={riskyProjects.length} tasks={tasks} />}
          {cur.kind === "stats" && <PresentStats stats={weekStats} />}
          {cur.kind === "avance" && <PresentAvance tasks={tasks} />}
          {cur.kind === "empresas" && <PresentEmpresas metricsByEmpresa={metricsByEmpresa} tasks={tasks} />}
          {cur.kind === "risks" && <PresentRisks risky={riskyProjects} />}
          {cur.kind === "load" && <PresentLoad tasks={tasks} colorOverrides={colorOverrides} />}
          {cur.kind === "upcoming" && <PresentUpcoming tasks={tasks} colorOverrides={colorOverrides} />}
          {cur.kind === "activity" && <PresentActivity tasks={tasks} colorOverrides={colorOverrides} />}
        </div>
      </div>
      <div className="present-nav">
        <button onClick={() => setSlide(s => Math.max(0, s - 1))} disabled={slide === 0}><ChevronLeft size={14}/> Anterior</button>
        <span className="present-counter">{slide + 1} / {slides.length}</span>
        <button onClick={() => setSlide(s => Math.min(slides.length - 1, s + 1))} disabled={slide === slides.length - 1}>Siguiente <ChevronRight size={14}/></button>
      </div>
    </div>
  );
}
function PresentCover({ stats, risky, tasks }) {
  const overdue = tasks.filter(t => !t.archivada && !t.borrada && _isOverdueTask(t)).length;
  return (<div className="present-cover"><div className="cover-big-stat"><div className="cbs-n">{stats.terminadasSemana}</div><div className="cbs-l">tareas terminadas esta semana</div></div><div className="cover-mini-stats"><div className="cms"><span className="cms-n">{stats.vencenSemana}</span><span className="cms-l">vencen 7d</span></div><div className="cms"><span className="cms-n">{overdue}</span><span className="cms-l">atrasadas</span></div><div className="cms"><span className="cms-n">{risky}</span><span className="cms-l">proyectos en riesgo</span></div></div></div>);
}
function PresentStats({ stats }) {
  return (<div className="present-stats"><div className="ps-card"><div className="ps-n">{stats.terminadasSemana}</div><div className="ps-l">Terminadas</div></div><div className="ps-card"><div className="ps-n">{stats.revisionSemana}</div><div className="ps-l">A revisión</div></div><div className="ps-card"><div className="ps-n">{stats.vencenSemana}</div><div className="ps-l">Vencen en 7 días</div></div></div>);
}
function PresentAvance({ tasks }) {
  const active = tasks.filter(t => !t.archivada && !t.borrada);
  const total = active.length;
  const term = active.filter(t => normalizeEstado(t.estado) === "Terminado").length;
  const pend = active.filter(t => normalizeEstado(t.estado) === "Pendiente").length;
  const proc = active.filter(t => normalizeEstado(t.estado) === "En proceso").length;
  const rev = active.filter(t => normalizeEstado(t.estado) === "En standby").length;
  const pct = total > 0 ? Math.round((term / total) * 100) : 0;
  return (
    <div>
      <div className="cover-big-stat" style={{ marginBottom: "2rem" }}><div className="cbs-n">{pct}%</div><div className="cbs-l">avance general · {term} de {total} terminadas</div></div>
      <div className="present-grid-stats">
        <div className="present-grid-stat-card"><div className="ps-n">{pend}</div><div className="ps-l">Pendientes</div></div>
        <div className="present-grid-stat-card"><div className="ps-n">{proc}</div><div className="ps-l">En proceso</div></div>
        <div className="present-grid-stat-card"><div className="ps-n">{rev}</div><div className="ps-l">En revisión</div></div>
        <div className="present-grid-stat-card"><div className="ps-n">{term}</div><div className="ps-l">Terminadas</div></div>
      </div>
    </div>
  );
}
function PresentEmpresas({ metricsByEmpresa, tasks }) {
  if (!metricsByEmpresa || metricsByEmpresa.length === 0) return <div className="present-empty">Sin datos por empresa.</div>;
  return (
    <div>
      {metricsByEmpresa.map(({ empresa, m }) => {
        const overdue = tasks.filter(t => !t.archivada && !t.borrada && t.empresa === empresa && _isOverdueTask(t)).length;
        return (
          <div key={empresa} className="present-empresa-row">
            <div className="present-empresa-name">{empresa}</div>
            <div className="present-empresa-pct">{m.avance}%</div>
            <div className="present-empresa-meta">{m.total} totales · {m.openTotal || (m.pen + m.proc + m.rev)} abiertas{overdue > 0 ? ` · ${overdue} atrasadas` : ""}</div>
          </div>
        );
      })}
    </div>
  );
}
function PresentRisks({ risky }) {
  if (risky.length === 0) return <div className="present-empty">✓ Sin proyectos en riesgo.</div>;
  return (<div className="present-risks">{risky.slice(0, 6).map(p => (<div key={p.key} className={`pr-card risk-${p.metrics.risk}`}><div className="pr-head"><span className="pr-name">{p.proyecto}</span><span className="pr-pct">{p.metrics.pct}%</span></div><div className="pr-meta">{p.empresa} · {p.metrics.overdue} atrasadas · {p.metrics.openTotal} abiertas</div><ProgressBar pct={p.metrics.pct} risk={p.metrics.risk} /></div>))}</div>);
}
function PresentLoad({ tasks, colorOverrides }) {
  const active = tasks.filter(t => !t.archivada && !t.borrada);
  const byPers = {};
  active.forEach(t => {
    const p = t.responsable || "Sin responsable";
    if (!byPers[p]) byPers[p] = { total: 0, open: 0, overdue: 0 };
    byPers[p].total++;
    if (normalizeEstado(t.estado) !== "Terminado") byPers[p].open++;
    if (_isOverdueTask(t)) byPers[p].overdue++;
  });
  const data = Object.entries(byPers).sort((a, b) => b[1].open - a[1].open);
  if (data.length === 0) return <div className="present-empty">Sin tareas asignadas.</div>;
  const maxOpen = Math.max(...data.map(([, m]) => m.open), DIAG_RULES.PERSONA_SOBRECARGADA);
  return (
    <div>
      {data.map(([p, m]) => {
        const pal = personPalette(p, colorOverrides);
        const pct = maxOpen > 0 ? (m.open / maxOpen) * 100 : 0;
        const isOver = m.open >= DIAG_RULES.PERSONA_SOBRECARGADA;
        return (
          <div key={p} className="present-load-row">
            <div className="present-load-name" style={{ color: pal.text }}>{p}</div>
            <div className="present-load-bar"><div className={`present-load-fill ${isOver ? "over" : ""}`} style={{ width: `${pct}%` }} /></div>
            <div className={`present-load-stat ${m.overdue > 0 ? "over" : ""}`}>{m.open} abiertas{m.overdue > 0 ? ` · ${m.overdue} ⚠` : ""}</div>
          </div>
        );
      })}
    </div>
  );
}
function PresentUpcoming({ tasks, colorOverrides }) {
  const upcoming = tasks.filter(t => { if (t.estado === "Terminado" || t.archivada || t.borrada) return false; const d = daysUntil(t); return d != null && d >= 0 && d <= 7; }).sort((a, b) => daysUntil(a) - daysUntil(b)).slice(0, 8);
  if (upcoming.length === 0) return <div className="present-empty">Sin entregas próximas.</div>;
  return (<div className="present-list">{upcoming.map(t => { const palette = personPalette(t.responsable, colorOverrides); return (<div key={t.id} className="pl-row"><div className="pl-due"><DeadlineBadge task={t} compact /></div><div className="pl-title">{t.actividad}</div><div className="pl-proj">{t.proyecto}</div><div className="pl-asg" style={{ color: palette.text }}><PersonaAvatar name={t.responsable} size={20} colorOverrides={colorOverrides} />{(t.responsable || "").split(" ")[0]}</div></div>); })}</div>);
}
function PresentActivity({ tasks, colorOverrides }) {
  const today = new Date();
  const weekAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
  const recent = tasks.filter(t => { if (t.archivada || t.borrada) return false; const ref = t.fechaTerminado || t.actualizado; return ref && new Date(ref) >= weekAgo && (normalizeEstado(t.estado) === "Terminado" || normalizeEstado(t.estado) === "En standby"); }).sort((a, b) => new Date(b.fechaTerminado || b.actualizado) - new Date(a.fechaTerminado || a.actualizado)).slice(0, 8);
  if (recent.length === 0) return <div className="present-empty">Sin actividad reciente.</div>;
  return (<div className="present-list">{recent.map(t => { const palette = personPalette(t.responsable, colorOverrides); const verb = normalizeEstado(t.estado) === "Terminado" ? "completó" : "subió a revisión"; return (<div key={t.id} className="pl-row"><div className="pl-asg" style={{ color: palette.text }}><PersonaAvatar name={t.responsable} size={20} colorOverrides={colorOverrides} />{(t.responsable || "").split(" ")[0]}</div><div className="pl-verb">{verb}</div><div className="pl-title">{t.actividad}</div><div className="pl-proj">{t.proyecto}</div></div>); })}</div>);
}


// ===================================================================
// SUBCOMPONENTES COMUNES
// ===================================================================
function CompanyLogos() { return <div className="brand-logos flex items-center gap-2"><CompanyLogo name="Aurum Arquitectos" size={32} /><CompanyLogo name="YoDesarrollo" size={32} /></div>; }
function CompanyLogo({ name, size = 24 }) {
  const url = ASSETS.logos[name];
  if (url) return <img src={url} alt={name} style={{ height: size, width: "auto", objectFit: "contain" }} />;
  return <div className="logo-placeholder" style={{ width: size, height: size, fontSize: size * 0.4 }} title={name}>{getInitials(name)}</div>;
}
function PersonaAvatar({ name, size = 40, colorOverrides }) {
  const palette = personPalette(name, colorOverrides);
  return <div className="persona-avatar-placeholder" style={{ width: size, height: size, background: palette.main, fontSize: size * 0.35 }}>{getInitials(name)}</div>;
}
function PrioridadDot({ prioridad }) { if (!prioridad) return null; return <span className={`pri-dot pri-${prioridad.toLowerCase()}`} title={`Prioridad ${prioridad}`}></span>; }
function PrioridadChip({ prioridad }) { if (!prioridad) return null; return <span className={`pri-chip pri-chip-${prioridad.toLowerCase()}`}>{prioridad}</span>; }
function EstadoChip({ estado, mini }) { return <span className={`est-chip ${mini ? "mini" : ""} est-${estadoSlug(estado)}`}>{estado}</span>; }
function DeadlineBadge({ task, compact = false }) {
  const d = daysUntil(task);
  const tone = d == null ? "deadline-gray" : d < 0 ? "deadline-red" : d <= 2 ? "deadline-orange" : "deadline-green";
  const label = d == null ? "—" : d === 0 ? "Hoy" : d > 0 ? `+${d}` : `${d}`;
  return <span className={`deadline-badge ${compact ? "deadline-c" : ""} ${tone}`}>{label}</span>;
}
function SaveDot({ status }) {
  if (!status || status === "idle") return null;
  if (status === "saving") return <span className="save-dot save-saving"><Clock size={9}/></span>;
  if (status === "saved") return <span className="save-dot save-saved"><CheckCircle2 size={9}/></span>;
  if (status === "error") return <span className="save-dot save-error"><AlertCircle size={9}/></span>;
  return null;
}
function SaveBadge({ status, errorMsg, onRetry }) {
  if (status === "saving") return <span className="badge-saving"><Clock size={12}/>Guardando…</span>;
  if (status === "saved") return <span className="badge-saved"><CheckCircle2 size={12}/>Guardado</span>;
  if (status === "error") return <button onClick={onRetry} className="badge-error" title={errorMsg || ""}><AlertCircle size={12}/>Error · reintentar</button>;
  return <span className="badge-idle">Listo</span>;
}
function GlobalSyncBadge({ status }) { return <span className={`g-sync g-sync-${status.type}`}>{status.text}</span>; }
function Metric({ label, value, tone, onClick }) { const cls = `metric-card${tone ? ` metric-${tone}` : ""}${onClick ? " metric-btn" : ""}`; const inner = (<><div className="metric-value">{value}</div><div className="metric-label">{label}</div></>); return onClick ? <button className={cls} onClick={onClick} title={`Ver detalle de ${label}`}>{inner}</button> : <div className={cls}>{inner}</div>; }
function Field({ label, children }) { return <label className="field"><span className="field-label">{label}</span>{children}</label>; }
function ConfirmModal({ dialog }) {
  if (!dialog?.open) return null;
  return (
    <div className="confirm-overlay" onClick={dialog.onCancel}>
      <div className="confirm-box" onClick={e => e.stopPropagation()}>
        <div className="confirm-icon"><AlertCircle size={36} /></div>
        <h3 className="confirm-title">{dialog.title}</h3>
        <p className="confirm-msg">{dialog.message}</p>
        <div className="confirm-actions"><button onClick={dialog.onCancel} className="confirm-cancel">Cancelar</button><button onClick={dialog.onConfirm} className={dialog.danger ? "confirm-danger" : "confirm-primary"}>{dialog.confirmLabel}</button></div>
      </div>
    </div>
  );
}

// ===================================================================
// ESTILOS GLOBALES
// ===================================================================
// ===================================================================
// VISTA: TIMELINE / GANTT
// ===================================================================
function TimelineView({ projectsList, setSelectedTaskId, colorOverrides }) {
  const withDates = projectsList.map(p => {
    const ds = p.tasks.map(t => commitmentDate(t)).filter(Boolean);
    if (ds.length === 0) return { ...p, min: null, max: null };
    return { ...p, min: new Date(Math.min(...ds)), max: new Date(Math.max(...ds)) };
  }).filter(p => p.min);

  if (withDates.length === 0) {
    return <div className="yo-card p-8 text-center subtle">No hay tareas con fecha para mostrar en el timeline. Asígnale fechas a las tareas y aparecerán aquí.</div>;
  }

  const allMin = new Date(Math.min(...withDates.map(p => p.min.getTime())));
  const allMax = new Date(Math.max(...withDates.map(p => p.max.getTime())));
  const span = Math.max(1, allMax - allMin);

  // Marcas de mes
  const months = [];
  const cur = new Date(allMin.getFullYear(), allMin.getMonth(), 1);
  while (cur <= allMax) {
    const left = Math.max(0, (cur - allMin) / span * 100);
    months.push({ label: `${MESES[cur.getMonth()].slice(0,3)} ${String(cur.getFullYear()).slice(2)}`, left });
    cur.setMonth(cur.getMonth() + 1);
  }

  const ordered = [...withDates].sort((a, b) => a.min - b.min);

  return (
    <div className="timeline-view yo-card">
      <div className="tl-axis">
        <div className="tl-axis-label" />
        <div className="tl-axis-track">
          {months.map((m, i) => <span key={i} className="tl-month" style={{ left: `${m.left}%` }}>{m.label}</span>)}
        </div>
      </div>
      {ordered.map(p => {
        const left = (p.min - allMin) / span * 100;
        const width = Math.max(2, (p.max - p.min) / span * 100);
        return (
          <div key={p.key} className="tl-row">
            <div className="tl-row-label" title={p.proyecto}>
              <span className={`risk-dot risk-dot-${p.metrics.risk}`} />
              <span className="tl-row-name">{p.proyecto}</span>
              <span className="tl-row-pct">{p.metrics.pct}%</span>
            </div>
            <div className="tl-row-track">
              <div className={`tl-bar tl-bar-${p.metrics.risk}`} style={{ left: `${left}%`, width: `${width}%` }}>
                <div className="tl-bar-fill" style={{ width: `${p.metrics.pct}%` }} />
              </div>
              {p.tasks.map(t => {
                const d = commitmentDate(t);
                if (!d) return null;
                const dl = (d - allMin) / span * 100;
                return <button key={t.id} className={`tl-dot est-dot-${estadoSlug(t.estado)}`} style={{ left: `${dl}%` }} title={`${t.actividad} · ${fechaCorta(t)}`} onClick={() => setSelectedTaskId(t.id)} />;
              })}
            </div>
          </div>
        );
      })}
      <div className="tl-legend">
        <span><span className="est-dot-pendiente tl-dot-legend" /> Pendiente</span>
        <span><span className="est-dot-en-proceso tl-dot-legend" /> En proceso</span>
        <span><span className="est-dot-en-standby tl-dot-legend" /> En standby</span>
        <span><span className="est-dot-terminado tl-dot-legend" /> Terminado</span>
      </div>
    </div>
  );
}

// ===================================================================
// VISTA: MI SEMANA
// ===================================================================
function MiSemanaView({ tasks, setSelectedTaskId, colorOverrides, filtroResp, setFiltroResp, responsables }) {
  const semana = tasks.filter(t => {
    if (t.estado === "Terminado") return false;
    const d = daysUntil(t);
    return d != null && d >= 0 && d <= 7;
  }).sort((a, b) => daysUntil(a) - daysUntil(b));

  const atrasadas = tasks.filter(t => t.estado !== "Terminado" && isOverdue(t)).sort((a, b) => daysUntil(a) - daysUntil(b));

  return (
    <div className="misemana-view">
      <div className="ms-toolbar">
        <div className="ms-title">
          <CalendarClock size={18} />
          <div>
            <h2 className="ms-h2">Mi semana</h2>
            <p className="ms-sub">Lo que vence en los próximos 7 días</p>
          </div>
        </div>
        <select className="input ms-select" value={filtroResp} onChange={e => setFiltroResp(e.target.value)}>
          {responsables.map(r => <option key={r}>{r}</option>)}
        </select>
      </div>

      {atrasadas.length > 0 && (
        <div className="ms-section ms-section-danger">
          <h3 className="ms-section-lbl"><AlertTriangle size={12} style={{display:'inline',marginRight:4}}/>Atrasadas ({atrasadas.length})</h3>
          {atrasadas.map(t => <MiSemanaRow key={t.id} task={t} onOpen={() => setSelectedTaskId(t.id)} colorOverrides={colorOverrides} />)}
        </div>
      )}

      <div className="ms-section">
        <h3 className="ms-section-lbl">Esta semana ({semana.length})</h3>
        {semana.length === 0 ? <p className="subtle p-4 text-center">Nada vence esta semana. 🎉</p> :
          semana.map(t => <MiSemanaRow key={t.id} task={t} onOpen={() => setSelectedTaskId(t.id)} colorOverrides={colorOverrides} />)}
      </div>
    </div>
  );
}

function MiSemanaRow({ task, onOpen, colorOverrides }) {
  const pal = personPalette(task.responsable, colorOverrides);
  return (
    <button onClick={onOpen} className={`ms-row ${isOverdue(task) ? "overdue" : ""}`}>
      <div className="ms-row-due"><DeadlineBadge task={task} /></div>
      <div className="ms-row-main">
        <div className="ms-row-title">{task.actividad}</div>
        <div className="ms-row-meta">{task.proyecto} · {task.empresa}</div>
      </div>
      <div className="ms-row-asg">
        <PersonaAvatar name={task.responsable} size={22} colorOverrides={colorOverrides} />
        <span style={{ color: pal.text }}>{(task.responsable || "").split(" ")[0]}</span>
      </div>
      <EstadoChip estado={task.estado} mini />
    </button>
  );
}

// ===================================================================
// VISTA: PAPELERA
// ===================================================================
function TrashView({ tasks, colorOverrides, onRestore, onClose }) {
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-box trash-box" onClick={e => e.stopPropagation()}>
        <header className="settings-header">
          <div>
            <p className="yo-eyebrow"><Trash2 size={11} style={{display:'inline',marginRight:4}}/>Papelera</p>
            <h3 className="settings-title">Tareas borradas</h3>
            <p className="settings-sub">Restaura lo que borraste por error. Nada se elimina del Sheet.</p>
          </div>
          <button onClick={onClose} className="btn-ghost"><X size={14}/></button>
        </header>
        <div className="settings-body">
          {tasks.length === 0 ? (
            <p className="subtle p-6 text-center">La papelera está vacía.</p>
          ) : tasks.map(t => {
            const pal = personPalette(t.responsable, colorOverrides);
            return (
              <div key={t.id} className="trash-row">
                <div className="trash-info">
                  <div className="trash-title">{t.actividad}</div>
                  <div className="trash-meta">{t.proyecto} · {t.empresa} · <span style={{ color: pal.text }}>{t.responsable}</span></div>
                </div>
                <div className="trash-actions">
                  <button onClick={() => onRestore(t.id)} className="trash-restore"><RotateCcw size={12}/>Restaurar</button>
                </div>
              </div>
            );
          })}
          <p className="trash-note">Las tareas borradas se conservan en el Sheet. Para purgarlas definitivamente, edita la columna <code>borrada</code> directamente desde Google Sheets.</p>
        </div>
      </div>
    </div>
  );
}


// ===================================================================
// PANEL DE DIAGNÓSTICO (deploy 4) — modal con insights + tareas
// ===================================================================
function DiagnosticPanel({ open, mode, params, tasks, colorOverrides, onTaskClick, onClose }) {
  const result = useMemo(() => open ? runDiagnostics(tasks, mode, params) : { title: "", tasks: [], insights: [], actions: [] }, [open, tasks, mode, params]);
  if (!open) return null;
  const InsightIcon = ({ icon }) => {
    const map = { alert: AlertTriangle, zap: Zap, clock: Clock, folder: Folder, users: Users, check: CheckCircle2, building: Building2 };
    const Comp = map[icon] || CheckCircle2;
    return <Comp size={13} />;
  };
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="diag-box" onClick={e => e.stopPropagation()}>
        <header className="diag-header">
          <div>
            <p className="yo-eyebrow"><Compass size={11} style={{ display: 'inline', marginRight: 4 }} />Diagnóstico</p>
            <h3 className="diag-title">{result.title || "Diagnóstico"}</h3>
          </div>
          <button onClick={onClose} className="btn-ghost"><X size={14} /></button>
        </header>
        <div className="diag-body">
          {result.insights.length > 0 && (
            <ul className="diag-insights">
              {result.insights.map((ins, i) => (
                <li key={i} className="diag-insight"><span className="diag-insight-icon"><InsightIcon icon={ins.icon} /></span><span>{ins.text}</span></li>
              ))}
            </ul>
          )}
          {result.actions.length > 0 && (
            <div className="diag-actions">
              <p className="diag-actions-lbl">Acción sugerida</p>
              {result.actions.map((a, i) => <p key={i} className="diag-action"><Zap size={12} style={{ display: 'inline', marginRight: 4, color: 'var(--accent)' }} />{a}</p>)}
            </div>
          )}
          {result.tasks.length > 0 && (
            <div className="diag-tasks">
              <p className="diag-tasks-lbl">Tareas ({result.tasks.length})</p>
              {result.tasks.slice(0, 20).map(t => {
                const pal = personPalette(t.responsable, colorOverrides);
                const dDay = daysUntil(t);
                const isLate = dDay !== null && dDay < 0;
                return (
                  <button key={t.id} className="diag-task" onClick={() => { onTaskClick && onTaskClick(t.id); onClose(); }}>
                    <div className="diag-task-main">
                      <div className="diag-task-title">{t.actividad}</div>
                      <div className="diag-task-meta">{t.proyecto} · <span style={{ color: pal.text }}>{t.responsable}</span></div>
                      {t.entregable && <div className="diag-task-entregable">Entregable: {t.entregable}</div>}
                    </div>
                    <div className="diag-task-right">
                      <span className={`est-chip mini est-${estadoSlug(t.estado)}`}>{t.estado}</span>
                      {dDay !== null && <span className={`deadline-c ${isLate ? 'deadline-red' : dDay <= 7 ? 'deadline-orange' : 'deadline-green'}`}>{isLate ? `${Math.abs(dDay)}d vencida` : `${dDay}d`}</span>}
                    </div>
                  </button>
                );
              })}
              {result.tasks.length > 20 && <p className="diag-more">+ {result.tasks.length - 20} más</p>}
            </div>
          )}
          {result.tasks.length === 0 && result.insights.length > 0 && result.actions.length === 0 && (
            <p className="diag-empty">Sin tareas en este filtro.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;900&family=Montserrat:wght@300;400;500;600;700;800&display=swap');
      .yo-theme { font-family: 'Montserrat', system-ui, -apple-system, sans-serif; color: #1a1a1a; -webkit-font-smoothing: antialiased; }
      .yo-display { font-family: 'Playfair Display', Georgia, serif; font-weight: 700; letter-spacing: -0.01em; line-height: 1.15; }
      .yo-eyebrow { font-size: 10px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #888; }
      .brand-shell { background: linear-gradient(180deg, #FFFFFF 0%, #F7F4EF 100%); }
      .yo-btn-primary { display: inline-flex; align-items: center; gap: 0.4rem; background: #000; color: #fff; padding: 0.5rem 0.9rem; font-size: 0.78rem; font-weight: 600; transition: background 0.15s; border: none; cursor: pointer; }
      .yo-btn-primary:hover { background: #333; }
      .yo-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
      .yo-btn-secondary { display: inline-flex; align-items: center; gap: 0.4rem; background: #fff; color: #1a1a1a; padding: 0.5rem 0.7rem; font-size: 0.78rem; font-weight: 600; border: 1px solid #ddd; cursor: pointer; transition: background 0.15s; }
      .yo-btn-secondary:hover { background: #F3F3F3; }
      .yo-btn-danger { display: inline-flex; align-items: center; gap: 0.4rem; background: #fff; color: #b91c1c; padding: 0.5rem 0.9rem; font-size: 0.78rem; font-weight: 600; border: 1px solid #fca5a5; cursor: pointer; }
      .yo-btn-danger:hover { background: #fef2f2; }
      .btn-ghost { padding: 0.4rem 0.7rem; font-size: 0.78rem; font-weight: 600; color: #555; background: transparent; border: none; cursor: pointer; }
      .btn-ghost:hover { color: #000; background: #F3F3F3; }
      .yo-success { color: #15803d; font-weight: 600; }
      .yo-card { background: #FFFFFF; border: 1px solid #ECECEC; }
      .yo-header { background: #FFFFFF; border: 1px solid #ECECEC; padding: 0.85rem 1rem; }
      .input { width: 100%; border: 1px solid #DDD; background: #FFF; padding: 0.5rem 0.65rem; font-size: 0.82rem; font-family: 'Montserrat', sans-serif; outline: none; color: #1a1a1a; }
      .input:focus { border-color: #000; }
      textarea.input { resize: vertical; min-height: 60px; }
      .field { display: block; }
      .field-label { display: block; font-size: 9px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #888; margin-bottom: 0.3rem; }
      .diagnostic-banner { display: flex; gap: 0.7rem; align-items: flex-start; background: #FEF3C7; border-left: 4px solid #F59E0B; color: #92400E; padding: 0.85rem 1rem; font-size: 0.8rem; }
      .logo-placeholder { display: grid; place-items: center; background: linear-gradient(135deg, #1a1a1a, #555); color: #fff; font-weight: 800; }
      .brand-logos { flex-shrink: 0; flex-wrap: wrap; }
      .brand-logos img { height: 30px !important; width: auto; max-width: 130px; object-fit: contain; display: block; flex-shrink: 0; }
      @media (max-width: 640px){ .brand-logos img { height: 22px !important; max-width: 96px; } }
      .persona-avatar-placeholder { display: grid; place-items: center; border-radius: 50%; color: #fff; font-weight: 800; }
      .form-derived { font-size: 0.72rem; color: #555; background: #F8F8F8; padding: 0.5rem 0.65rem; border-left: 3px solid #1a1a1a; }
      .panel-soft { background: #FAFAFA; border: 1px solid #ECECEC; }

      /* View selector */
      .view-selector { display: inline-flex; border: 1px solid #ddd; background: #fff; }
      .vs-btn { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.5rem 0.7rem; font-size: 0.72rem; font-weight: 600; color: #555; background: transparent; border: none; border-right: 1px solid #ddd; cursor: pointer; }
      .vs-btn:last-child { border-right: 0; }
      .vs-btn:hover { background: #F3F3F3; }
      .vs-btn.on { background: #1a1a1a; color: #fff; }

      /* Archive toggle + overdue counter + metrics toolbar */
      .archive-toggle { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.45rem 0.7rem; font-size: 0.72rem; font-weight: 600; border: 1px solid #ddd; background: #fff; cursor: pointer; }
      .archive-toggle input { width: 12px; height: 12px; cursor: pointer; }
      .archive-toggle:hover { background: #F3F3F3; }
      .archive-toggle-cnt { background: #1a1a1a; color: #fff; padding: 0.05rem 0.3rem; font-size: 0.62rem; font-weight: 700; }
      .overdue-counter { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.45rem 0.7rem; font-size: 0.72rem; font-weight: 700; background: #FEE2E2; color: #991B1B; border: 1px solid #FCA5A5; }
      .overdue-pill { display: inline-flex; align-items: center; gap: 0.2rem; background: #FEE2E2; color: #991B1B; padding: 0.05rem 0.3rem; font-weight: 700; font-size: 0.6rem; }
      .metrics-toolbar { display: flex; gap: 0.3rem; margin-bottom: 0.5rem; }
      .metrics-toolbar button { padding: 0.35rem 0.7rem; font-size: 0.72rem; font-weight: 600; border: 1px solid #ddd; background: #fff; cursor: pointer; color: #555; }
      .metrics-toolbar button.on { background: #1a1a1a; color: #fff; }

      /* Briefing */
      .brief { display: flex; gap: 1rem; align-items: stretch; background: #FFF; border: 1px solid #ECECEC; padding: 0.85rem 1rem; margin-bottom: 0.75rem; }
      .brief-col { display: flex; flex-direction: column; gap: 0.5rem; min-width: 0; }
      .brief-col-stats { flex: 0 0 auto; }
      .brief-col-risks { flex: 1; min-width: 0; }
      .brief-divider { width: 1px; background: #ECECEC; }
      .brief-lbl { font-size: 9px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #888; display: flex; align-items: center; gap: 0.4rem; }
      .brief-lbl-cnt { background: #1a1a1a; color: #fff; padding: 0.05rem 0.35rem; font-size: 0.6rem; }
      .brief-stats { display: flex; gap: 0.85rem; }
      .brief-stat { min-width: 56px; }
      .brief-stat-n { font-family: 'Playfair Display', serif; font-size: 1.8rem; font-weight: 700; line-height: 1; }
      .brief-stat-l { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #888; margin-top: 0.1rem; }
      .brief-empty { font-size: 0.8rem; color: #15803d; font-weight: 600; }
      .risk-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 0.5rem; }
      .risk-card { background: #FAFAFA; border: 1px solid #E5E5E5; padding: 0.55rem 0.7rem; text-align: left; cursor: pointer; }
      .risk-card:hover { border-color: #1a1a1a; }
      .risk-card.risk-critico { border-left: 3px solid #DC2626; background: #FEF2F2; }
      .risk-card.risk-riesgo { border-left: 3px solid #F59E0B; background: #FEF8E7; }
      .risk-head { display: flex; justify-content: space-between; align-items: baseline; gap: 0.4rem; margin-bottom: 0.2rem; }
      .risk-name { font-size: 0.78rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .risk-pct { font-size: 0.7rem; font-weight: 700; color: #555; }
      .risk-meta { font-size: 0.66rem; color: #777; margin-bottom: 0.35rem; display: flex; gap: 0.3rem; align-items: center; }
      .risk-meta .dot { color: #BBB; }
      .progress { position: relative; height: 4px; background: #E5E5E5; overflow: hidden; }
      .progress-fill { height: 100%; background: #1a1a1a; transition: width 0.3s; }
      .progress-ok .progress-fill { background: #10B981; }
      .progress-atencion .progress-fill { background: #3B82F6; }
      .progress-riesgo .progress-fill { background: #F59E0B; }
      .progress-critico .progress-fill { background: #DC2626; }

      /* Personas view */
      .personas-columns { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 0.6rem; align-items: start; }
      @media (max-width:1280px){ .personas-columns{ grid-template-columns: repeat(2,minmax(0,1fr)); } }
      @media (max-width:640px){ .personas-columns{ grid-template-columns: 1fr; } }
      .persona-column { background: #FFF; border: 1px solid #ECECEC; border-top: 4px solid #1a1a1a; display: flex; flex-direction: column; min-width: 0; }
      .persona-column-header { display: flex; align-items: center; gap: 0.55rem; padding: 0.7rem 0.8rem; border-bottom: 1px solid #ECECEC; cursor: pointer; width: 100%; background: transparent; border-left: none; border-right: none; border-top: none; text-align: left; }
      .persona-column-header:hover { background: #FAFAFA; }
      .persona-column-info { flex: 1; min-width: 0; }
      .persona-column-name { font-family: 'Playfair Display', serif; font-size: 1.05rem; font-weight: 700; margin: 0; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .persona-column-meta { font-size: 0.68rem; color: #777; margin-top: 0.25rem; display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap; }
      .persona-column-body { padding: 0.55rem 0.65rem 0.75rem; display: flex; flex-direction: column; gap: 0.7rem; }
      .urgent-pill { display: inline-flex; align-items: center; gap: 0.15rem; background: #FEE2E2; color: #991B1B; padding: 0.05rem 0.35rem; font-weight: 700; font-size: 0.62rem; }
      .empresa-block { display: flex; flex-direction: column; }
      .empresa-header-mini { display: flex; align-items: center; gap: 0.3rem; padding-bottom: 0.3rem; margin-bottom: 0.35rem; border-bottom: 1px solid #ECECEC; }
      .empresa-name-mini { font-size: 0.62rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #555; }
      .proyectos-row { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 0.3rem; grid-auto-flow: row dense; }
      .proyecto-tile { background: #FFF; border: 1px solid #E5E5E5; min-width: 0; position: relative; }
      .proyecto-tile:hover { border-color: #999; }
      .proyecto-tile.expanded { grid-column: 1 / -1; border-color: #1a1a1a; }
      .proyecto-tile.tile-dragging { opacity: 0.35; }
      .proyecto-tile.tile-drop-over::before { content: ""; position: absolute; inset: -2px; border: 2px dashed #1a1a1a; pointer-events: none; }
      .drag-handle { cursor: grab; color: #BBB; padding: 0 0.2rem; display: inline-flex; align-items: center; flex-shrink: 0; }
      .drag-handle:hover { color: #555; }
      .proyecto-tile-button { width: 100%; padding: 0.4rem 0.45rem; cursor: pointer; text-align: left; background: transparent; border: none; display: flex; flex-direction: column; gap: 0.3rem; }
      .proyecto-tile-top { display: flex; align-items: center; gap: 0.25rem; min-width: 0; }
      .proyecto-tile-name { font-size: 0.68rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
      .alta-mini { display: inline-flex; align-items: center; gap: 0.1rem; background: #FEE2E2; color: #991B1B; padding: 0.05rem 0.25rem; font-size: 0.58rem; font-weight: 700; flex-shrink: 0; }
      .proyecto-tile-stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 1px; font-size: 0.6rem; font-weight: 700; }
      .proyecto-tile-stats span { text-align: center; padding: 0.08rem 0; }
      .stat-pen { background: #F1F5F9; color: #475569; }
      .stat-proc { background: #FEF3C7; color: #92400E; }
      .stat-sub { background: #DBEAFE; color: #1E40AF; }
      .stat-term { background: #D1FAE5; color: #065F46; }
      .proyecto-tile-kanban { border-top: 1px solid #ECECEC; background: #FAFAFA; padding: 0.45rem; }

      /* Kanban vertical */
      .kanban-vertical { display: flex; flex-direction: column; gap: 0.4rem; }
      .kanban-vertical .kanban-col { background: #FFF; border: 1px solid #E5E5E5; min-height: 50px; }
      .kanban-vertical .kanban-col.over { border-color: #000; background: #F3F3F3; }
      .kanban-col-header { display: flex; justify-content: space-between; align-items: center; padding: 0.35rem 0.55rem; border-bottom: 1px solid #ECECEC; font-size: 0.62rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
      .kanban-col-pendiente .kanban-col-header { background: #F1F5F9; color: #475569; }
      .kanban-col-en-proceso .kanban-col-header { background: #FEF3C7; color: #92400E; }
      .kanban-col-en-standby .kanban-col-header { background: #DBEAFE; color: #1E40AF; }
      .kanban-col-terminado .kanban-col-header { background: #D1FAE5; color: #065F46; }
      .kanban-count { background: rgba(0,0,0,0.08); padding: 0.05rem 0.35rem; min-width: 18px; text-align: center; font-size: 0.6rem; }
      .kanban-col-body { padding: 0.35rem; }
      .kanban-empty { font-size: 0.65rem; color: #BBB; text-align: center; padding: 0.4rem 0; }
      .kanban-card { background: #FFF; border: 1px solid #E5E5E5; padding: 0.4rem 0.45rem; margin-bottom: 0.3rem; cursor: grab; position: relative; }
      .kanban-card:last-child { margin-bottom: 0; }
      .kanban-card:hover { border-color: #1a1a1a; box-shadow: 0 2px 6px rgba(0,0,0,0.06); }
      .kanban-card.dragging { opacity: 0.4; }
      .kanban-card.archived { background: #FAFAFA; opacity: 0.55; border-style: dashed; }
      .kanban-card.overdue { border-left: 3px solid #DC2626; }
      .kanban-card.due-today { border-left: 3px solid #F59E0B; }
      .kanban-card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.25rem; }
      .kanban-card-top-right { display: flex; align-items: center; gap: 0.2rem; }
      .kanban-card-title { font-size: 0.72rem; font-weight: 700; line-height: 1.2; margin: 0 0 0.3rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .kanban-card-bottom { display: flex; justify-content: space-between; align-items: center; gap: 0.25rem; font-size: 0.6rem; color: #888; font-weight: 600; flex-wrap: wrap; }
      .archive-mini-icon { color: #777; }
      .quick-archive { background: transparent; border: none; cursor: pointer; color: #999; padding: 1px; display: inline-flex; }
      .quick-archive:hover { color: #1a1a1a; }
      .link-icon { display: inline-flex; align-items: center; gap: 0.15rem; background: #DBEAFE; color: #1E40AF; padding: 0.06rem 0.3rem; font-weight: 700; }

      /* Projects view */
      .projects-view { display: flex; flex-direction: column; gap: 0.4rem; }
      .proj-row { background: #FFF; border: 1px solid #ECECEC; }
      .proj-row.proj-risk-critico { border-left: 4px solid #DC2626; }
      .proj-row.proj-risk-riesgo { border-left: 4px solid #F59E0B; }
      .proj-row.proj-risk-atencion { border-left: 4px solid #3B82F6; }
      .proj-row.proj-risk-ok { border-left: 4px solid #10B981; }
      .proj-row.expanded { border-color: #1a1a1a; }
      .proj-row-head { display: grid; grid-template-columns: 40px 1fr 200px 140px 200px 24px; gap: 0.6rem; align-items: center; padding: 0.55rem 0.8rem; width: 100%; background: transparent; border: none; cursor: pointer; text-align: left; }
      .proj-row-head:hover { background: #FAFAFA; }
      .proj-row-mark { display: flex; align-items: center; gap: 0.4rem; }
      .risk-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
      .risk-dot-critico { background: #DC2626; } .risk-dot-riesgo { background: #F59E0B; } .risk-dot-atencion { background: #3B82F6; } .risk-dot-ok { background: #10B981; }
      .proj-row-id { min-width: 0; }
      .proj-row-name { font-size: 0.88rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .proj-row-meta { font-size: 0.7rem; color: #777; }
      .proj-row-pipeline { display: grid; grid-template-columns: repeat(4,1fr); gap: 2px; }
      .pipe { display: flex; flex-direction: column; align-items: center; padding: 0.2rem 0.1rem; font-size: 0.58rem; font-weight: 700; }
      .pipe-n { font-size: 0.85rem; font-weight: 800; }
      .pipe-l { letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.7; }
      .pipe-pendiente { background: #F1F5F9; color: #475569; } .pipe-en-proceso { background: #FEF3C7; color: #92400E; } .pipe-en-standby { background: #DBEAFE; color: #1E40AF; } .pipe-terminado { background: #D1FAE5; color: #065F46; }
      .proj-row-team { display: flex; align-items: center; }
      .proj-row-team > * { margin-left: -4px; border: 2px solid #FFF; }
      .proj-row-team > *:first-child { margin-left: 0; }
      .team-more { background: #E5E5E5; color: #555; border-radius: 50%; width: 22px; height: 22px; display: grid; place-items: center; font-size: 0.62rem; font-weight: 700; }
      .proj-row-progress { display: flex; flex-direction: column; gap: 0.2rem; }
      .proj-row-pct { font-size: 0.7rem; font-weight: 700; color: #555; text-align: right; }
      .proj-row-chev { color: #BBB; display: flex; justify-content: center; }
      .proj-row-body { border-top: 1px solid #ECECEC; padding: 0.4rem 0.8rem; background: #FAFAFA; display: flex; flex-direction: column; gap: 0.25rem; }
      .task-row { display: grid; grid-template-columns: 110px 1fr 140px 80px 40px; gap: 0.6rem; align-items: center; padding: 0.4rem 0.5rem; background: #FFF; border: 1px solid #ECECEC; cursor: pointer; text-align: left; }
      .task-row:hover { border-color: #1a1a1a; }
      .task-row.archived { background: #FAFAFA; opacity: 0.55; border-style: dashed; }
      .task-row.overdue { border-left: 3px solid #DC2626; }
      .task-row-title { font-size: 0.78rem; font-weight: 600; display: flex; align-items: center; gap: 0.3rem; }
      .task-row-arch { color: #777; }
      .task-row-asg { display: flex; align-items: center; gap: 0.3rem; font-size: 0.7rem; font-weight: 600; }
      .task-row-date { font-size: 0.7rem; color: #777; }
      .task-row-due { display: flex; justify-content: flex-end; }
      @media (max-width:1024px){ .proj-row-head{ grid-template-columns: 30px 1fr 80px; } .proj-row-pipeline,.proj-row-team,.proj-row-progress,.proj-row-chev{ display:none; } .task-row{ grid-template-columns: 90px 1fr 70px; } .task-row-date,.task-row-due{ display:none; } }

      /* Estados view */
      .estados-view { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 0.5rem; align-items: start; }
      @media (max-width:1024px){ .estados-view{ grid-template-columns: repeat(2,minmax(0,1fr)); } }
      @media (max-width:640px){ .estados-view{ grid-template-columns: 1fr; } }
      .estado-col { background: #FFF; border: 1px solid #ECECEC; min-height: 80px; }
      .estado-col.over { border-color: #000; background: #F3F3F3; }
      .estado-col-pendiente { border-top: 3px solid #94A3B8; } .estado-col-en-proceso { border-top: 3px solid #F59E0B; } .estado-col-en-standby { border-top: 3px solid #3B82F6; } .estado-col-terminado { border-top: 3px solid #10B981; }
      .estado-col-header { display: flex; justify-content: space-between; align-items: center; padding: 0.55rem 0.7rem; border-bottom: 1px solid #ECECEC; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
      .estado-col-count { background: rgba(0,0,0,0.08); padding: 0.1rem 0.4rem; font-size: 0.65rem; }
      .estado-col-body { padding: 0.45rem; display: flex; flex-direction: column; gap: 0.4rem; }
      .estado-card { background: #FFF; border: 1px solid #E5E5E5; border-left: 3px solid #1a1a1a; padding: 0.5rem 0.6rem; cursor: grab; }
      .estado-card:hover { box-shadow: 0 2px 6px rgba(0,0,0,0.06); }
      .estado-card.dragging { opacity: 0.4; }
      .estado-card.archived { background: #FAFAFA; opacity: 0.55; border-style: dashed; }
      .estado-card.overdue { box-shadow: inset 3px 0 0 #DC2626; }
      .estado-card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.3rem; }
      .estado-card-proj { font-size: 0.62rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #888; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 75%; }
      .estado-card-title { font-size: 0.78rem; font-weight: 700; line-height: 1.25; margin: 0 0 0.4rem; }
      .estado-card-bottom { display: flex; justify-content: space-between; align-items: center; gap: 0.25rem; }
      .estado-card-asg { display: flex; align-items: center; gap: 0.3rem; font-size: 0.68rem; font-weight: 600; }
      .estado-card-right { display: flex; align-items: center; gap: 0.2rem; }
      .estado-card-date { font-size: 0.62rem; font-weight: 600; color: #065F46; }

      /* Calendar */
      .calendar-view { background: #FFF; border: 1px solid #ECECEC; padding: 0.8rem; }
      .cal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.8rem; }
      .cal-nav { display: flex; align-items: center; gap: 0.5rem; }
      .cal-nav-btn { background: #fff; border: 1px solid #ddd; cursor: pointer; padding: 0.3rem 0.5rem; display: inline-flex; }
      .cal-nav-btn:hover { background: #F3F3F3; }
      .cal-title { font-family: 'Playfair Display', serif; font-size: 1.3rem; font-weight: 700; min-width: 180px; text-align: center; }
      .cal-today-btn { background: #1a1a1a; color: #fff; border: none; cursor: pointer; padding: 0.4rem 0.8rem; font-size: 0.72rem; font-weight: 600; }
      .cal-weekdays { display: grid; grid-template-columns: repeat(7,1fr); gap: 2px; margin-bottom: 2px; }
      .cal-weekday { text-align: center; font-size: 0.62rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #888; padding: 0.3rem 0; }
      .cal-grid { display: grid; grid-template-columns: repeat(7,1fr); gap: 2px; }
      .cal-cell { background: #FAFAFA; border: 1px solid #ECECEC; min-height: 92px; padding: 0.25rem; display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; overflow: hidden; }
      .cal-cell-empty { background: transparent; border: none; }
      .cal-cell-num { font-size: 0.7rem; font-weight: 700; color: #555; }
      .cal-cell-today { border-color: #B08D57; box-shadow: inset 0 0 0 1px #B08D57; } .cal-cell-today .cal-cell-num { background: #B08D57; color: #fff; border-radius: 50%; width: 20px; height: 20px; display: grid; place-items: center; }
      .cal-cell-tasks { display: flex; flex-direction: column; gap: 2px; overflow: hidden; min-width: 0; }
      .cal-task { font-size: 0.6rem; font-weight: 600; padding: 0.1rem 0.25rem; border-radius: 2px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-left: 3px solid #999; background: #fff; min-width: 0; max-width: 100%; display: flex; align-items: center; gap: 3px; }
      .cal-task.est-pendiente { border-left-color: #94A3B8; } .cal-task.est-en-proceso { border-left-color: #F59E0B; } .cal-task.est-en-standby { border-left-color: #3B82F6; } .cal-task.est-terminado { border-left-color: #10B981; opacity: 0.6; }
      .cal-task-txt { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
      .cal-more { font-size: 0.58rem; color: #888; font-weight: 600; padding-left: 0.25rem; }

      /* Dashboard persona */
      .dash-box { background: #FFF; max-width: 640px; width: 100%; max-height: 85vh; overflow-y: auto; box-shadow: 0 25px 60px rgba(0,0,0,0.25); }
      .dash-header { display: flex; align-items: center; gap: 0.8rem; padding: 1.25rem 1.5rem; border-bottom: 1px solid #ECECEC; }
      .dash-avatar { width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-weight: 800; font-size: 1rem; }
      .dash-id { flex: 1; }
      .dash-name { font-family: 'Playfair Display', serif; font-size: 1.5rem; font-weight: 700; }
      .dash-body { padding: 1.25rem 1.5rem; }
      .dash-metrics { display: grid; grid-template-columns: repeat(4,1fr); gap: 0.5rem; margin-bottom: 1.25rem; }
      .dash-metric { background: #FAFAFA; border: 1px solid #ECECEC; padding: 0.7rem; text-align: center; }
      .dash-metric-danger { background: #FEF2F2; border-color: #FCA5A5; }
      .dash-metric-n { font-family: 'Playfair Display', serif; font-size: 1.6rem; font-weight: 700; line-height: 1; }
      .dash-metric-l { font-size: 9px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #888; margin-top: 0.3rem; }
      .dash-avance-row { margin-bottom: 1.25rem; }
      .dash-avance-lbl { font-size: 9px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #888; display: flex; justify-content: space-between; }
      .dash-avance-pct { color: #1a1a1a; }
      .dash-avance-bar { height: 8px; background: #E5E5E5; margin-top: 0.3rem; overflow: hidden; }
      .dash-avance-fill { height: 100%; background: #10B981; transition: width 0.3s; }
      .dash-section { margin-top: 1rem; }
      .dash-section-lbl { font-size: 9px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #888; margin-bottom: 0.4rem; }
      .dash-section-danger .dash-section-lbl { color: #991B1B; }
      .dash-task-row { display: flex; justify-content: space-between; gap: 0.5rem; padding: 0.35rem 0.5rem; border: 1px solid #ECECEC; margin-bottom: 0.25rem; font-size: 0.75rem; }
      .dash-task-title { font-weight: 600; }
      .dash-empresa-row { display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0.5rem; border: 1px solid #ECECEC; margin-bottom: 0.25rem; }
      .dash-empresa-name { font-size: 0.78rem; font-weight: 700; }
      .dash-empresa-stat { font-size: 0.7rem; color: #777; }
      .dash-empty { font-size: 0.78rem; color: #999; padding: 0.5rem; text-align: center; }

      /* Empresa metrics */
      .empresa-metrics { display: grid; grid-template-columns: repeat(2,1fr); gap: 0.6rem; margin-bottom: 0.75rem; }
      @media (max-width:640px){ .empresa-metrics{ grid-template-columns: 1fr; } }
      .empresa-metric-block { background: #FFF; border: 1px solid #ECECEC; padding: 0.7rem 0.9rem; }
      .empresa-metric-head { display: flex; justify-content: space-between; align-items: center; font-weight: 700; font-size: 0.85rem; margin-bottom: 0.4rem; }
      .empresa-metric-avance { font-size: 0.72rem; color: #555; }

      /* Settings */
      .settings-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9999; display: grid; place-items: center; padding: 1rem; }
      .settings-box { background: #FFF; max-width: 560px; width: 100%; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 25px 60px rgba(0,0,0,0.25); }
      .settings-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 1.25rem 1.5rem; border-bottom: 1px solid #ECECEC; }
      .settings-title { font-family: 'Playfair Display', serif; font-size: 1.4rem; font-weight: 700; margin: 0.3rem 0 0.2rem; }
      .settings-sub { font-size: 0.78rem; color: #777; margin: 0; }
      .settings-body { padding: 0.5rem 0; overflow-y: auto; }
      .persona-color-row { display: flex; justify-content: space-between; align-items: center; gap: 0.8rem; padding: 0.7rem 1.5rem; border-bottom: 1px solid #F3F3F3; }
      .pcr-id { display: flex; align-items: center; gap: 0.6rem; min-width: 0; }
      .pcr-avatar { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-weight: 800; font-size: 0.78rem; }
      .pcr-name { font-size: 0.88rem; font-weight: 700; }
      .pcr-sub { font-size: 0.68rem; color: #888; }
      .pcr-swatches { display: flex; flex-wrap: wrap; gap: 0.25rem; max-width: 280px; }
      .swatch { width: 20px; height: 20px; border: 2px solid #FFF; cursor: pointer; outline: 1px solid #DDD; }
      .swatch:hover { transform: scale(1.15); }
      .swatch.on { outline: 2px solid #1a1a1a; outline-offset: 1px; }
      .swatch-custom { width: 28px; height: 24px; border: none; cursor: pointer; padding: 0; background: transparent; }

      /* Archive control + pills */
      .archive-control { background: #FAFAFA; border: 1px solid #ECECEC; padding: 0.7rem 0.9rem; }
      .archive-label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; font-weight: 600; cursor: pointer; }
      .archive-label input { width: 16px; height: 16px; cursor: pointer; }
      .archive-hint { font-size: 0.7rem; color: #777; margin: 0.3rem 0 0 1.7rem; }
      .terminada-pill { display: inline-flex; align-items: center; gap: 0.2rem; background: #D1FAE5; color: #065F46; padding: 0.15rem 0.5rem; font-size: 0.65rem; font-weight: 700; }
      .archivada-pill { display: inline-flex; align-items: center; gap: 0.2rem; background: #F3F3F3; color: #555; padding: 0.15rem 0.5rem; font-size: 0.65rem; font-weight: 700; }

      /* Bitacora */
      .bitacora { list-style: none; padding: 0; margin: 0; }
      .bitacora-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.25rem 0; font-size: 0.75rem; border-left: 2px solid #E5E5E5; padding-left: 0.7rem; margin-left: 0.3rem; }
      .bitacora-estado { font-weight: 700; }
      .bitacora-fecha { color: #888; font-size: 0.7rem; }
      .bitacora-body { margin-top: 0.3rem; }

      /* Subtareas */
      .subtarea-list { list-style: none; padding: 0; margin: 0 0 0.5rem; }
      .subtarea-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.3rem 0; font-size: 0.8rem; }
      .subtarea-item input { width: 15px; height: 15px; cursor: pointer; }
      .subtarea-item.done span { text-decoration: line-through; color: #999; }
      .subtarea-add { display: flex; gap: 0.4rem; }
      .subtarea-progress { font-size: 0.7rem; color: #777; margin-bottom: 0.3rem; }
      .subtarea-del { background: transparent; border: none; color: #C84949; cursor: pointer; font-size: 0.7rem; margin-left: auto; }

      /* Chips / dots / deadline */
      .pri-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; }
      .pri-alta { background: #DC2626; } .pri-media { background: #F59E0B; } .pri-baja { background: #94A3B8; }
      .pri-chip { display: inline-flex; align-items: center; padding: 0.15rem 0.5rem; font-size: 0.65rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
      .pri-chip-alta { background: #FEE2E2; color: #991B1B; } .pri-chip-media { background: #FEF3C7; color: #92400E; } .pri-chip-baja { background: #F3F3F3; color: #555; }
      .est-chip { display: inline-flex; align-items: center; padding: 0.15rem 0.5rem; font-size: 0.65rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
      .est-chip.mini { padding: 0.08rem 0.35rem; font-size: 0.58rem; }
      .est-pendiente { background: #F3F3F3; color: #555; } .est-en-proceso { background: #FEF3C7; color: #92400E; } .est-en-standby { background: #DBEAFE; color: #1E40AF; } .est-terminado { background: #D1FAE5; color: #065F46; }
      .deadline-badge { display: inline-flex; align-items: center; padding: 0.1rem 0.35rem; font-size: 0.6rem; font-weight: 700; }
      .deadline-c { padding: 0.06rem 0.3rem; font-size: 0.58rem; }
      .deadline-red { background: #FEE2E2; color: #991B1B; } .deadline-orange { background: #FED7AA; color: #9A3412; } .deadline-green { background: #D1FAE5; color: #065F46; } .deadline-gray { background: #F3F3F3; color: #777; }

      /* Save indicators */
      .save-dot { display: inline-grid; place-items: center; width: 12px; height: 12px; }
      .save-saving { color: #92400E; } .save-saved { color: #065F46; } .save-error { color: #991B1B; }
      .badge-saving,.badge-saved,.badge-error,.badge-idle { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.35rem 0.7rem; font-size: 0.72rem; font-weight: 700; border: none; cursor: pointer; }
      .badge-saving { background: #FEF3C7; color: #92400E; } .badge-saved { background: #D1FAE5; color: #065F46; } .badge-error { background: #FEE2E2; color: #991B1B; } .badge-idle { background: #F3F3F3; color: #555; }
      .g-sync { font-weight: 600; } .g-sync-saving { color: #92400E; } .g-sync-saved { color: #065F46; } .g-sync-error { color: #991B1B; } .g-sync-idle { color: #888; }

      /* Metric cards */
      .metric-card { background: #FFF; border: 1px solid #ECECEC; padding: 0.55rem 0.75rem; border-left-width: 4px; }
      .metric-card.metric-pendiente { border-left-color: #94A3B8; background: #F8FAFC; }
      .metric-card.metric-en-proceso { border-left-color: #F59E0B; background: #FEF8E7; }
      .metric-card.metric-subido,.metric-card.metric-en-standby { border-left-color: #3B82F6; background: #EFF4FF; }
      .metric-card.metric-terminado { border-left-color: #10B981; background: #ECFDF5; }
      .metric-value { font-family: 'Playfair Display', serif; font-size: 1.25rem; font-weight: 700; line-height: 1; }
      .metric-label { font-size: 9px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #888; margin-top: 0.15rem; }

      /* Confirm modal */
      .confirm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 9999; display: grid; place-items: center; padding: 1rem; }
      .confirm-box { background: #FFF; padding: 1.75rem; max-width: 420px; width: 100%; box-shadow: 0 25px 60px rgba(0,0,0,0.25); }
      .confirm-icon { display: grid; place-items: center; color: #DC2626; margin-bottom: 0.5rem; }
      .confirm-title { font-family: 'Playfair Display', serif; font-size: 1.3rem; font-weight: 700; text-align: center; margin: 0 0 0.5rem; }
      .confirm-msg { font-size: 0.85rem; color: #555; text-align: center; margin: 0 0 1.25rem; line-height: 1.5; }
      .confirm-actions { display: flex; gap: 0.5rem; justify-content: center; }
      .confirm-cancel,.confirm-danger,.confirm-primary { padding: 0.6rem 1.2rem; font-weight: 700; font-size: 0.8rem; border: none; cursor: pointer; }
      .confirm-cancel { background: #F3F3F3; color: #1a1a1a; }
      .confirm-danger { background: #DC2626; color: #FFF; }
      .confirm-primary { background: #000; color: #FFF; }

      /* Presentation */
      .present-overlay { position: fixed; inset: 0; background: #0a0a0a; z-index: 10000; color: #FFF; display: flex; flex-direction: column; }
      .present-close { position: absolute; top: 1.5rem; right: 1.5rem; display: inline-flex; align-items: center; gap: 0.3rem; background: rgba(255,255,255,0.1); color: #FFF; border: none; cursor: pointer; padding: 0.5rem 0.9rem; font-size: 0.78rem; font-weight: 600; }
      .present-stage { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 3rem 4rem; max-width: 1400px; margin: 0 auto; width: 100%; }
      .present-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.3em; text-transform: uppercase; color: #999; margin: 0 0 1rem; }
      .present-title { font-family: 'Playfair Display', serif; font-size: 4rem; font-weight: 700; line-height: 1.05; margin: 0 0 0.5rem; }
      .present-sub { font-size: 1.1rem; color: #BBB; margin: 0 0 3rem; }
      .present-nav { display: flex; justify-content: space-between; align-items: center; padding: 1.5rem 2rem; border-top: 1px solid rgba(255,255,255,0.1); }
      .present-nav button { display: inline-flex; align-items: center; gap: 0.4rem; background: transparent; color: #FFF; border: none; cursor: pointer; padding: 0.5rem 1rem; font-size: 0.85rem; font-weight: 600; }
      .present-nav button:disabled { opacity: 0.3; cursor: not-allowed; }
      .present-counter { font-size: 0.78rem; font-weight: 600; color: #888; }
      .present-empty { font-size: 1.2rem; color: #666; padding: 3rem 0; }
      .present-cover { display: flex; flex-direction: column; gap: 2rem; }
      .cover-big-stat .cbs-n { font-family: 'Playfair Display', serif; font-size: 8rem; font-weight: 700; line-height: 1; }
      .cover-big-stat .cbs-l { font-size: 1.1rem; color: #BBB; margin-top: 0.5rem; }
      .cover-mini-stats { display: flex; gap: 3rem; }
      .cms { display: flex; flex-direction: column; }
      .cms-n { font-family: 'Playfair Display', serif; font-size: 2.5rem; font-weight: 700; }
      .cms-l { font-size: 0.85rem; color: #888; letter-spacing: 0.1em; text-transform: uppercase; }
      .present-stats { display: grid; grid-template-columns: repeat(3,1fr); gap: 2rem; }
      .ps-card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 2rem; }
      .ps-n { font-family: 'Playfair Display', serif; font-size: 5rem; font-weight: 700; line-height: 1; }
      .ps-l { font-size: 0.9rem; color: #BBB; letter-spacing: 0.12em; text-transform: uppercase; margin-top: 0.5rem; }
      .present-risks { display: grid; grid-template-columns: repeat(2,1fr); gap: 1rem; }
      .pr-card { background: rgba(255,255,255,0.05); border-left: 3px solid #DC2626; padding: 1rem 1.5rem; }
      .pr-card.risk-riesgo { border-left-color: #F59E0B; }
      .pr-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.3rem; }
      .pr-name { font-family: 'Playfair Display', serif; font-size: 1.5rem; font-weight: 600; }
      .pr-pct { font-size: 1.5rem; font-weight: 700; color: #999; }
      .pr-meta { font-size: 0.85rem; color: #999; margin-bottom: 0.6rem; }
      .present-list { display: flex; flex-direction: column; gap: 0.6rem; }
      .pl-row { display: grid; grid-template-columns: auto 1fr 200px 140px; gap: 1rem; align-items: center; padding: 0.7rem 1rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); }
      .pl-title { font-size: 1rem; font-weight: 600; }
      .pl-proj { font-size: 0.85rem; color: #888; }
      .pl-asg { display: flex; align-items: center; gap: 0.4rem; font-size: 0.9rem; font-weight: 600; }
      .pl-verb { font-size: 0.85rem; color: #777; font-style: italic; }

      /* Export */
      .export-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 10000; overflow-y: auto; padding: 1rem; }
      .export-toolbar { position: sticky; top: 0; display: flex; justify-content: space-between; align-items: center; background: #1a1a1a; color: #fff; padding: 0.8rem 1.2rem; margin-bottom: 1rem; }
      .export-toolbar-title { font-weight: 700; }
      .export-toolbar-actions { display: flex; gap: 0.5rem; }
      .export-sheet { background: #FFF; max-width: 900px; margin: 0 auto; padding: 2.5rem; }
      .export-head { border-bottom: 2px solid #1a1a1a; padding-bottom: 1rem; margin-bottom: 1.5rem; }
      .export-eyebrow { font-size: 10px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: #888; }
      .export-title { font-family: 'Playfair Display', serif; font-size: 2rem; font-weight: 700; margin: 0.3rem 0; }
      .export-date { font-size: 0.85rem; color: #777; }
      .export-week { display: flex; gap: 2rem; margin-bottom: 1.5rem; }
      .export-week-stat { text-align: center; }
      .export-section { margin-bottom: 1.5rem; }
      .export-h2 { font-family: 'Playfair Display', serif; font-size: 1.2rem; font-weight: 700; margin-bottom: 0.5rem; border-bottom: 1px solid #ECECEC; padding-bottom: 0.3rem; }
      .export-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
      .export-table th { text-align: left; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.08em; color: #888; padding: 0.4rem; border-bottom: 1px solid #ECECEC; }
      .export-table td { padding: 0.4rem; border-bottom: 1px solid #F3F3F3; }
      .export-foot { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #ECECEC; font-size: 0.7rem; color: #999; text-align: center; }
      .export-danger { color: #991B1B; font-weight: 700; }
      @media print { .no-print { display: none !important; } .export-overlay { position: static; background: #fff; padding: 0; } .export-sheet { max-width: 100%; padding: 0; } }

      /* ============ MODO OSCURO ============ */
      .dark.brand-shell { background: #0f1115; }
      .dark .yo-theme, .dark.yo-theme { color: #e5e7eb; }
      .dark .yo-card, .dark .yo-header, .dark .persona-column, .dark .proyecto-tile, .dark .kanban-vertical .kanban-col, .dark .kanban-card, .dark .estado-col, .dark .estado-card, .dark .proj-row, .dark .task-row, .dark .brief, .dark .calendar-view, .dark .metric-card, .dark .empresa-metric-block, .dark .risk-card { background: #1a1d24; border-color: #2d3139; color: #e5e7eb; }
      .dark .yo-display, .dark .persona-column-name, .dark .proj-row-name, .dark .kanban-card-title, .dark .estado-card-title, .dark .cal-title, .dark .metric-value { color: #f3f4f6; }
      .dark .input { background: #0f1115; border-color: #2d3139; color: #e5e7eb; }
      .dark .yo-btn-secondary, .dark .archive-toggle, .dark .vs-btn, .dark .cal-nav-btn { background: #1a1d24; border-color: #2d3139; color: #e5e7eb; }
      .dark .vs-btn.on { background: #e5e7eb; color: #1a1d24; }
      .dark .proyecto-tile-kanban, .dark .proj-row-body, .dark .persona-column-header, .dark .cal-cell { background: #15171d; }
      .dark .cal-cell-empty { background: transparent; }
      .dark .yo-btn-primary { background: #e5e7eb; color: #1a1d24; }
      .dark .settings-box, .dark .dash-box, .dark .confirm-box { background: #1a1d24; color: #e5e7eb; }
      .dark .btn-ghost { color: #aaa; }
      .dark .form-derived { background: #15171d; color: #bbb; }

      /* ============ ESTADO DOTS (bitácora + timeline) ============ */
      .bitacora-dot, .est-dot-pendiente, .est-dot-en-proceso, .est-dot-en-revision, .est-dot-en-standby, .est-dot-terminado { display: inline-block; width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
      .est-dot-pendiente { background: #94A3B8; } .est-dot-en-proceso { background: #F59E0B; } .est-dot-en-revision, .est-dot-en-standby { background: #3B82F6; } .est-dot-terminado { background: #10B981; }

      /* ============ TIMELINE / GANTT ============ */
      .timeline-view { padding: 1rem 1.2rem; overflow-x: auto; }
      .tl-axis { display: flex; align-items: flex-end; margin-bottom: 0.6rem; height: 22px; }
      .tl-axis-label { flex: 0 0 200px; }
      .tl-axis-track { position: relative; flex: 1; height: 100%; border-bottom: 1px solid #E5E5E5; }
      .tl-month { position: absolute; bottom: 2px; font-size: 0.62rem; font-weight: 700; color: #999; text-transform: uppercase; letter-spacing: 0.06em; transform: translateX(2px); }
      .tl-row { display: flex; align-items: center; min-height: 38px; border-bottom: 1px solid #F3F3F3; }
      .tl-row-label { flex: 0 0 200px; display: flex; align-items: center; gap: 0.4rem; padding-right: 0.6rem; min-width: 0; }
      .tl-row-name { font-size: 0.78rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
      .tl-row-pct { font-size: 0.66rem; font-weight: 700; color: #999; }
      .tl-row-track { position: relative; flex: 1; height: 28px; }
      .tl-bar { position: absolute; top: 7px; height: 14px; border-radius: 7px; background: #E5E7EB; min-width: 8px; overflow: hidden; }
      .tl-bar-fill { height: 100%; background: rgba(0,0,0,0.18); }
      .tl-bar-critico { background: #FECACA; } .tl-bar-critico .tl-bar-fill { background: #DC2626; }
      .tl-bar-riesgo { background: #FED7AA; } .tl-bar-riesgo .tl-bar-fill { background: #F59E0B; }
      .tl-bar-atencion { background: #BFDBFE; } .tl-bar-atencion .tl-bar-fill { background: #3B82F6; }
      .tl-bar-ok { background: #BBF7D0; } .tl-bar-ok .tl-bar-fill { background: #10B981; }
      .tl-dot { position: absolute; top: 9px; width: 11px; height: 11px; border-radius: 50%; border: 2px solid #fff; cursor: pointer; transform: translateX(-50%); box-shadow: 0 1px 3px rgba(0,0,0,0.25); padding: 0; }
      .tl-dot:hover { transform: translateX(-50%) scale(1.35); z-index: 5; }
      .tl-legend { display: flex; gap: 1.2rem; margin-top: 1rem; padding-top: 0.7rem; border-top: 1px solid #ECECEC; font-size: 0.68rem; color: #777; font-weight: 600; }
      .tl-legend span { display: inline-flex; align-items: center; gap: 0.3rem; }
      .tl-dot-legend { display: inline-block; width: 9px; height: 9px; border-radius: 50%; }

      /* ============ MI SEMANA ============ */
      .misemana-view { display: flex; flex-direction: column; gap: 1rem; }
      .ms-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 1rem; background: #FFF; border: 1px solid #ECECEC; padding: 0.9rem 1.1rem; border-radius: var(--radius); box-shadow: var(--shadow-sm); }
      .ms-title { display: flex; align-items: center; gap: 0.7rem; }
      .ms-h2 { font-family: 'Playfair Display', serif; font-size: 1.3rem; font-weight: 700; margin: 0; }
      .ms-sub { font-size: 0.75rem; color: #888; margin: 0; }
      .ms-select { max-width: 220px; }
      .ms-section { background: #FFF; border: 1px solid #ECECEC; padding: 0.9rem 1.1rem; border-radius: var(--radius); box-shadow: var(--shadow-sm); }
      .ms-section-danger { border-color: #FCA5A5; background: #FFF8F8; }
      .ms-section-lbl { font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #888; margin: 0 0 0.6rem; }
      .ms-section-danger .ms-section-lbl { color: #991B1B; }
      .ms-row { display: grid; grid-template-columns: 56px 1fr 130px 90px; gap: 0.8rem; align-items: center; width: 100%; padding: 0.55rem 0.6rem; background: #FFF; border: 1px solid #ECECEC; border-radius: 5px; cursor: pointer; text-align: left; margin-bottom: 0.4rem; transition: border-color 0.12s, transform 0.12s; }
      .ms-row:last-child { margin-bottom: 0; }
      .ms-row:hover { border-color: #1a1a1a; transform: translateX(2px); }
      .ms-row.overdue { border-left: 3px solid #DC2626; }
      .ms-row-title { font-size: 0.85rem; font-weight: 600; }
      .ms-row-meta { font-size: 0.7rem; color: #888; }
      .ms-row-asg { display: flex; align-items: center; gap: 0.4rem; font-size: 0.75rem; font-weight: 600; }
      @media (max-width:640px){ .ms-row{ grid-template-columns: 50px 1fr; } .ms-row-asg,.ms-row .est-chip{ display:none; } }

      /* ============ COMENTARIOS ============ */
      .comentarios-list { display: flex; flex-direction: column; gap: 0.8rem; }
      .comentario-item { display: flex; gap: 0.6rem; }
      .comentario-avatar { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-weight: 800; font-size: 0.68rem; flex-shrink: 0; }
      .comentario-body { flex: 1; min-width: 0; }
      .comentario-head { display: flex; align-items: baseline; gap: 0.5rem; }
      .comentario-autor { font-size: 0.78rem; font-weight: 700; }
      .comentario-fecha { font-size: 0.66rem; color: #999; }
      .comentario-texto { font-size: 0.82rem; color: #444; margin: 0.2rem 0 0; line-height: 1.4; white-space: pre-wrap; }

      /* ============ PAPELERA ============ */
      .trash-cnt { position: absolute; top: -5px; right: -5px; background: #DC2626; color: #fff; font-size: 0.55rem; font-weight: 700; min-width: 15px; height: 15px; border-radius: 8px; display: grid; place-items: center; padding: 0 3px; }
      .trash-box { max-width: 620px; }
      .trash-row { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: 0.8rem 1.5rem; border-bottom: 1px solid #F3F3F3; }
      .trash-info { min-width: 0; }
      .trash-title { font-size: 0.88rem; font-weight: 700; }
      .trash-meta { font-size: 0.72rem; color: #888; }
      .trash-actions { display: flex; gap: 0.4rem; flex-shrink: 0; }
      .trash-restore { display: inline-flex; align-items: center; gap: 0.3rem; background: #1a1a1a; color: #fff; border: none; cursor: pointer; padding: 0.4rem 0.7rem; font-size: 0.72rem; font-weight: 600; border-radius: 4px; }
      .trash-forever { display: inline-flex; align-items: center; gap: 0.3rem; background: #fff; color: #b91c1c; border: 1px solid #fca5a5; cursor: pointer; padding: 0.4rem 0.7rem; font-size: 0.72rem; font-weight: 600; border-radius: 4px; }
      .trash-forever:hover { background: #fef2f2; }
      .trash-note { font-size: 0.72rem; color: #888; padding: 0.9rem 1.5rem 0.4rem; line-height: 1.5; }
      .trash-note code { background: #F1F1F1; padding: 0.05rem 0.3rem; border-radius: 3px; font-size: 0.7rem; }
      .dark .trash-note { color: #9aa0aa; }
      .dark .trash-note code { background: #2a2d34; }

      /* ============================================================ */
      /* ===========   MEJORA ESTÉTICA v2 (refinamiento)  =========== */
      /* ============================================================ */
      :root { --radius: 7px; --shadow-sm: 0 1px 2px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.06); --shadow-md: 0 4px 16px rgba(15,23,42,0.10); --accent: #B08D57; }

      .brand-shell { background: radial-gradient(1200px 600px at 100% -10%, #FBF8F3 0%, transparent 60%), linear-gradient(180deg, #FFFFFF 0%, #F6F2EC 100%); }

      /* Cards y superficies: bordes redondeados sutiles + sombra suave */
      .yo-card, .yo-header, .persona-column, .metric-card, .brief, .proj-row, .estado-col, .calendar-view,
      .empresa-metric-block, .ms-toolbar, .ms-section, .timeline-view { border-radius: var(--radius); box-shadow: var(--shadow-sm); }
      .proyecto-tile { border-radius: 5px; }
      .kanban-card, .estado-card, .task-row, .risk-card { border-radius: 5px; transition: border-color .14s, transform .14s, box-shadow .14s; }

      /* Header con un acento dorado sutil arriba */
      .yo-header { border-top: 3px solid var(--accent); }

      /* Botones más suaves */
      .yo-btn-primary, .yo-btn-secondary, .yo-btn-danger { border-radius: 5px; transition: all .14s ease; }
      .yo-btn-primary:hover { transform: translateY(-1px); box-shadow: var(--shadow-md); }
      .yo-btn-secondary:hover { border-color: #bbb; }
      .view-selector { border-radius: 6px; overflow: hidden; box-shadow: var(--shadow-sm); }
      .input { border-radius: 5px; transition: border-color .14s, box-shadow .14s; }
      .input:focus { box-shadow: 0 0 0 3px rgba(176,141,87,0.12); border-color: var(--accent); }

      /* Hover de tarjetas: elevación más marcada y elegante */
      .kanban-vertical .kanban-card:hover, .estado-card:hover, .risk-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }

      /* Columnas de persona: header con degradado suave + barra superior más fina y elegante */
      .persona-column { overflow: hidden; }
      .persona-column-header { border-top-left-radius: var(--radius); border-top-right-radius: var(--radius); }

      /* Métricas: número con un poco más de presencia */
      .metric-value, .brief-stat-n { letter-spacing: -0.02em; }

      /* Chips y pills: esquinas redondeadas */
      .est-chip, .pri-chip, .deadline-badge, .terminada-pill, .archivada-pill, .urgent-pill, .alta-mini, .overdue-counter, .archive-toggle, .link-icon { border-radius: 999px; }
      .est-chip, .pri-chip { padding-left: 0.6rem; padding-right: 0.6rem; }

      /* Scroll más discreto */
      .timeline-view::-webkit-scrollbar, .settings-body::-webkit-scrollbar, .dash-box::-webkit-scrollbar { height: 8px; width: 8px; }
      .timeline-view::-webkit-scrollbar-thumb, .settings-body::-webkit-scrollbar-thumb, .dash-box::-webkit-scrollbar-thumb { background: #d8d2c8; border-radius: 4px; }

      /* Modales: entrada suave */
      .settings-box, .dash-box, .confirm-box, .trash-box { border-radius: 10px; animation: pop .16s ease-out; }
      @keyframes pop { from { opacity: 0; transform: translateY(8px) scale(.99); } to { opacity: 1; transform: none; } }
      .settings-overlay, .confirm-overlay, .export-overlay { backdrop-filter: blur(2px); }

      /* Modo oscuro: ajustar el acento y fondos al refinamiento */
      .dark.brand-shell { background: radial-gradient(1000px 500px at 100% -10%, #1b1f27 0%, transparent 60%), #0f1115; }
      .dark .yo-card, .dark .yo-header, .dark .persona-column, .dark .kanban-card, .dark .estado-card, .dark .proj-row, .dark .task-row, .dark .brief, .dark .calendar-view, .dark .metric-card, .dark .ms-toolbar, .dark .ms-section, .dark .timeline-view, .dark .empresa-metric-block, .dark .risk-card { box-shadow: 0 1px 3px rgba(0,0,0,0.4); }
      .dark .ms-section-danger { background: #2a1416; }
      .dark .comentario-texto { color: #cbd0d8; }
      .dark .input:focus { box-shadow: 0 0 0 3px rgba(176,141,87,0.18); }

      /* ===================== DEPLOY 4 — DIAGNÓSTICOS + DARK FIX ===================== */

      /* Métricas clickeables (todo el card es botón) */
      .metric-btn { background: inherit; border: inherit; padding: inherit; text-align: left; cursor: pointer; width: 100%; transition: all .14s ease; font-family: inherit; color: inherit; }
      .metric-btn:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); border-color: var(--accent); }
      .metric-btn:focus { outline: 2px solid var(--accent); outline-offset: 2px; }

      /* Panel de diagnóstico */
      .diag-box { background: #FFF; max-width: 720px; width: 95%; max-height: 88vh; display: flex; flex-direction: column; box-shadow: 0 25px 60px rgba(0,0,0,0.25); border-radius: 10px; animation: pop .18s ease-out; overflow: hidden; }
      .diag-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 1.1rem 1.4rem; border-bottom: 1px solid #ECECEC; }
      .diag-title { font-family: 'Playfair Display', serif; font-size: 1.4rem; font-weight: 700; margin: 0.3rem 0 0; line-height: 1.15; }
      .diag-body { padding: 1rem 1.4rem 1.4rem; overflow-y: auto; }
      .diag-insights { list-style: none; padding: 0; margin: 0 0 1rem; display: flex; flex-direction: column; gap: 0.4rem; }
      .diag-insight { display: flex; align-items: center; gap: 0.5rem; font-size: 0.84rem; color: #333; line-height: 1.4; }
      .diag-insight-icon { display: inline-flex; color: var(--accent); flex-shrink: 0; }
      .diag-actions { background: #FFF8EC; border-left: 3px solid var(--accent); padding: 0.7rem 0.9rem; margin: 0.7rem 0 1.1rem; border-radius: 0 5px 5px 0; }
      .diag-actions-lbl { font-size: 9px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #92400E; margin: 0 0 0.35rem; }
      .diag-action { font-size: 0.85rem; font-weight: 600; color: #1a1a1a; margin: 0; line-height: 1.45; }
      .diag-tasks-lbl { font-size: 9px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #888; margin: 0.6rem 0 0.4rem; }
      .diag-task { display: flex; justify-content: space-between; align-items: center; gap: 0.6rem; width: 100%; padding: 0.55rem 0.7rem; background: #FAFAFA; border: 1px solid #ECECEC; border-radius: 5px; cursor: pointer; text-align: left; margin-bottom: 0.35rem; transition: all .12s ease; font-family: inherit; color: inherit; }
      .diag-task:hover { border-color: var(--accent); transform: translateX(2px); background: #FFFAF0; }
      .diag-task-title { font-size: 0.85rem; font-weight: 600; line-height: 1.3; }
      .diag-task-meta { font-size: 0.7rem; color: #777; margin-top: 0.15rem; }
      .diag-task-right { display: flex; align-items: center; gap: 0.35rem; flex-shrink: 0; }
      .diag-more { font-size: 0.72rem; color: #888; text-align: center; margin: 0.4rem 0 0; }
      .diag-empty { font-size: 0.85rem; color: #888; text-align: center; padding: 1.5rem 0; }

      /* ===== DARK FIX (deploy 4) ===== */
      /* Logos en blanco automáticamente en modo oscuro */
      .dark .logo-img,
      .dark img[alt*="ogo"],
      .dark .yo-header img,
      .dark .brand-logo img,
      .dark .empresa-logo { filter: brightness(0) invert(1); }

      /* Fondos dark más cohesivos */
      .dark.brand-shell { background: linear-gradient(180deg, #0d1015 0%, #14171d 100%); }
      .dark .yo-card, .dark .yo-header, .dark .persona-column, .dark .kanban-card, .dark .estado-card, .dark .proj-row, .dark .task-row, .dark .brief, .dark .calendar-view, .dark .metric-card, .dark .ms-section, .dark .timeline-view, .dark .empresa-metric-block, .dark .risk-card, .dark .diag-box, .dark .settings-box, .dark .dash-box, .dark .confirm-box, .dark .trash-box, .dark .proyecto-tile { background: #1a1d24; border-color: #2d3139; color: #e5e7eb; }
      .dark .empresa-header-mini { color: #aab0bc; }
      .dark .empresa-name-mini { color: #cdd1d8; }
      .dark .proyecto-tile-kanban { background: #14171d; }
      .dark .kanban-col-pendiente .kanban-col-header { background: #232730; color: #b6bcc8; }
      .dark .kanban-col-en-proceso .kanban-col-header { background: #2e2417; color: #e6c89a; }
      .dark .kanban-col-en-standby .kanban-col-header { background: #1a2435; color: #93b4e8; }
      .dark .kanban-col-terminado .kanban-col-header { background: #16291f; color: #86d4a5; }
      .dark .metric-card.metric-pendiente { background: #1c1f26; border-left-color: #6b7280; }
      .dark .metric-card.metric-en-proceso { background: #221e15; border-left-color: #d4a663; }
      .dark .metric-card.metric-en-standby { background: #161d2a; border-left-color: #5b8edd; }
      .dark .metric-card.metric-terminado { background: #15211a; border-left-color: #4eb27a; }
      .dark .risk-card.risk-critico { background: #2a1416; border-left-color: #d83a3a; }
      .dark .risk-card.risk-riesgo { background: #2a2014; border-left-color: #d4a663; }
      .dark .form-derived { background: #14171d; color: #aab0bc; }
      .dark .diag-actions { background: #2a2014; border-left-color: var(--accent); }
      .dark .diag-actions-lbl { color: #d4a663; }
      .dark .diag-task { background: #14171d; border-color: #2d3139; }
      .dark .diag-task:hover { background: #1f2330; border-color: var(--accent); }
      .dark .diag-task-meta, .dark .diag-tasks-lbl, .dark .diag-more { color: #9aa0aa; }
      .dark .stat-pen { background: #1c1f26; color: #aab0bc; }
      .dark .stat-proc { background: #221e15; color: #d4a663; }
      .dark .stat-sub { background: #161d2a; color: #93b4e8; }
      .dark .stat-term { background: #15211a; color: #86d4a5; }
      .dark .pipe-pendiente { background: #232730; color: #b6bcc8; }
      .dark .pipe-en-proceso { background: #2e2417; color: #e6c89a; }
      .dark .pipe-en-standby { background: #1a2435; color: #93b4e8; }
      .dark .pipe-terminado { background: #16291f; color: #86d4a5; }
      .dark .est-pendiente { background: #232730; color: #b6bcc8; }
      .dark .est-en-proceso { background: #2e2417; color: #e6c89a; }
      .dark .est-en-standby { background: #1a2435; color: #93b4e8; }
      .dark .est-terminado { background: #16291f; color: #86d4a5; }

      /* ===== EXPORT EJECUTIVO ENRIQUECIDO (deploy 4) ===== */
      .export-exec { padding: 0; }
      .export-exec-cover { padding: 2rem 2.5rem 1rem; border-bottom: 2px solid #1a1a1a; }
      .export-exec-title { font-family: 'Playfair Display', serif; font-size: 1.8rem; font-weight: 700; margin: 0.3rem 0 0.1rem; }
      .export-exec-sub { font-size: 0.85rem; color: #555; }
      .export-exec-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.8rem; padding: 1.2rem 2.5rem; background: #FAFAFA; }
      .export-exec-stat { text-align: center; }
      .export-exec-stat-n { font-family: 'Playfair Display', serif; font-size: 1.8rem; font-weight: 700; line-height: 1; }
      .export-exec-stat-l { font-size: 9px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #777; margin-top: 0.2rem; }
      .export-exec-stat-danger .export-exec-stat-n { color: #b91c1c; }
      .export-exec-section { padding: 1.2rem 2.5rem; border-bottom: 1px solid #ECECEC; }
      .export-exec-h2 { font-family: 'Playfair Display', serif; font-size: 1.2rem; font-weight: 700; margin: 0 0 0.7rem; }
      .export-exec-alert { background: #FEF2F2; border-left: 4px solid #DC2626; padding: 0.7rem 1rem; margin-bottom: 0.5rem; border-radius: 0 5px 5px 0; }
      .export-exec-alert-title { font-weight: 700; font-size: 0.92rem; }
      .export-exec-alert-meta { font-size: 0.78rem; color: #555; margin-top: 0.15rem; }
      .export-exec-win { background: #ECFDF5; border-left: 4px solid #10B981; padding: 0.55rem 0.9rem; margin-bottom: 0.35rem; font-size: 0.85rem; border-radius: 0 5px 5px 0; }
      .export-exec-persona { background: #FFF; border: 1px solid #ECECEC; padding: 1rem 1.2rem; margin-bottom: 0.8rem; border-radius: 6px; page-break-inside: avoid; }
      .export-exec-persona-head { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.5rem; padding-bottom: 0.4rem; border-bottom: 1px solid #ECECEC; }
      .export-exec-persona-name { font-family: 'Playfair Display', serif; font-size: 1.15rem; font-weight: 700; }
      .export-exec-persona-meta { font-size: 0.75rem; color: #666; margin-left: auto; }
      .export-exec-persona-task { display: grid; grid-template-columns: 1fr 130px 90px; gap: 0.8rem; padding: 0.35rem 0; font-size: 0.82rem; border-bottom: 1px dashed #F0F0F0; }
      .export-exec-persona-task:last-child { border-bottom: none; }
      .export-exec-persona-task-meta { font-size: 0.7rem; color: #888; }
      .export-exec-persona-task-due { font-size: 0.75rem; font-weight: 600; text-align: right; }
      .export-exec-persona-task-due.due-late { color: #b91c1c; }
      .export-exec-persona-task-due.due-soon { color: #92400E; }
      .export-exec-persona-empty { font-size: 0.78rem; color: #777; font-style: italic; }
      .export-exec-rec { padding: 0.5rem 0.9rem; background: #FFF8EC; border-left: 3px solid var(--accent); margin-bottom: 0.35rem; font-size: 0.85rem; line-height: 1.45; border-radius: 0 5px 5px 0; }

      @media print {
        .export-exec-summary { background: #fff; border-bottom: 1px solid #DDD; }
        .export-exec-persona { page-break-inside: avoid; box-shadow: none; }
        .export-exec-section { page-break-inside: avoid; }
      }

      /* Slides nuevos de modo presentación */
      .present-grid-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.5rem; }
      .present-grid-stat-card { background: rgba(255,255,255,0.05); padding: 1.5rem 1.2rem; text-align: center; border-radius: 6px; }
      .present-empresa-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1.5rem; align-items: center; padding: 1rem 1.5rem; background: rgba(255,255,255,0.05); border-radius: 6px; margin-bottom: 0.8rem; }
      .present-empresa-name { font-family: 'Playfair Display', serif; font-size: 1.5rem; font-weight: 700; }
      .present-empresa-pct { font-family: 'Playfair Display', serif; font-size: 2.2rem; font-weight: 700; text-align: center; color: var(--accent); }
      .present-empresa-meta { font-size: 0.85rem; color: #aaa; text-align: right; }
      .present-load-row { display: grid; grid-template-columns: 180px 1fr 90px; gap: 1rem; align-items: center; padding: 0.7rem 1.2rem; background: rgba(255,255,255,0.05); border-radius: 6px; margin-bottom: 0.5rem; }
      .present-load-name { font-size: 1.05rem; font-weight: 600; }
      .present-load-bar { height: 10px; background: rgba(255,255,255,0.1); border-radius: 5px; overflow: hidden; }
      .present-load-fill { height: 100%; background: var(--accent); transition: width .3s; }
      .present-load-fill.over { background: #DC2626; }
      .present-load-stat { font-size: 0.95rem; color: #ccc; text-align: right; }
      .present-load-stat.over { color: #f87171; font-weight: 600; }

      /* Diagnóstico en dashboard de persona */
      .dash-diag { padding: 0.7rem 0.9rem; margin-bottom: 1rem; border-radius: 5px; border-left: 3px solid; }
      .dash-diag-sobrecargada { background: #FFF8EC; border-left-color: var(--accent); }
      .dash-diag-riesgo { background: #FEF8E7; border-left-color: #F59E0B; }
      .dash-diag-critica { background: #FEF2F2; border-left-color: #DC2626; }
      .dash-diag-status { font-size: 9px; font-weight: 800; letter-spacing: 0.2em; color: #92400E; margin-bottom: 0.25rem; }
      .dash-diag-critica .dash-diag-status { color: #991B1B; }
      .dash-diag-riesgo .dash-diag-status { color: #92400E; }
      .dash-diag-action { font-size: 0.82rem; font-weight: 600; color: #1a1a1a; line-height: 1.4; }
      .dark .dash-diag-sobrecargada { background: #2a2014; }
      .dark .dash-diag-riesgo { background: #2a2014; }
      .dark .dash-diag-critica { background: #2a1416; }
      .dark .dash-diag-action { color: #e5e7eb; }



      /* ===================== LOGIN GATE (deploy 5) ===================== */
      .login-gate { position: fixed; inset: 0; background: linear-gradient(180deg, #FFFFFF 0%, #F7F4EF 100%); display: grid; place-items: center; padding: 1rem; font-family: 'Montserrat', system-ui, sans-serif; color: #1a1a1a; z-index: 100000; }
      .login-box { background: #FFF; border: 1px solid #ECECEC; border-top: 4px solid #B08D57; padding: 2.5rem 2.5rem 2rem; max-width: 420px; width: 100%; text-align: center; box-shadow: 0 25px 60px rgba(0,0,0,0.08); border-radius: 7px; animation: pop .25s ease-out; }
      .login-icon { display: grid; place-items: center; width: 44px; height: 44px; margin: 0 auto 0.8rem; background: #FFF8EC; color: #B08D57; border-radius: 50%; }
      .login-title { font-family: 'Playfair Display', serif; font-size: 1.9rem; font-weight: 700; margin: 0.4rem 0 0.3rem; line-height: 1.1; }
      .login-sub { font-size: 0.88rem; color: #666; margin: 0 0 1.5rem; }
      .login-input { padding: 0.85rem 1rem; font-size: 1rem; text-align: center; margin-bottom: 0.7rem; letter-spacing: 0.15em; }
      .login-input:focus { border-color: #B08D57; }
      .login-error { font-size: 0.8rem; color: #b91c1c; background: #FEF2F2; padding: 0.5rem 0.6rem; border-radius: 4px; margin-bottom: 0.7rem; border: 1px solid #FCA5A5; }
      .login-btn { width: 100%; padding: 0.75rem; justify-content: center; font-size: 0.88rem; letter-spacing: 0.04em; }
      .login-foot { font-size: 0.72rem; color: #999; margin: 1.2rem 0 0; letter-spacing: 0.04em; }
      @media (prefers-color-scheme: dark) {
        .login-gate { background: linear-gradient(180deg, #0d1015 0%, #14171d 100%); color: #e5e7eb; }
        .login-box { background: #1a1d24; border-color: #2d3139; }
        .login-sub { color: #aaa; }
        .login-input { background: #0f1115; border-color: #2d3139; color: #e5e7eb; }
        .login-icon { background: #2a2014; }
        .login-foot { color: #777; }
      }


      /* ===================== CHAT IA (v9) ===================== */
      .ai-box { background: #FFF; max-width: 600px; width: 95%; height: 80vh; max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 25px 60px rgba(0,0,0,0.25); border-radius: 10px; animation: pop .18s ease-out; overflow: hidden; }
      .ai-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 1.1rem 1.4rem; border-bottom: 1px solid #ECECEC; flex-shrink: 0; }
      .ai-title { font-family: 'Playfair Display', serif; font-size: 1.3rem; font-weight: 700; margin: 0.3rem 0 0; }
      .ai-body { flex: 1; overflow-y: auto; padding: 1.2rem 1.4rem; display: flex; flex-direction: column; gap: 0.9rem; }
      .ai-welcome-txt { font-size: 0.88rem; color: #666; margin: 0 0 0.9rem; }
      .ai-suggestions { display: flex; flex-direction: column; gap: 0.5rem; }
      .ai-suggestion { text-align: left; padding: 0.7rem 0.9rem; background: #FAFAFA; border: 1px solid #ECECEC; border-radius: 7px; cursor: pointer; font-size: 0.85rem; font-weight: 500; color: #1a1a1a; transition: all .12s ease; font-family: inherit; }
      .ai-suggestion:hover { border-color: var(--accent); background: #FFFAF0; transform: translateX(2px); }
      .ai-msg { display: flex; gap: 0.5rem; align-items: flex-start; max-width: 90%; }
      .ai-msg-user { align-self: flex-end; }
      .ai-msg-user .ai-msg-content { background: #1a1a1a; color: #FFF; padding: 0.7rem 0.95rem; border-radius: 12px 12px 2px 12px; font-size: 0.86rem; line-height: 1.45; }
      .ai-msg-assistant { align-self: flex-start; }
      .ai-msg-icon { display: grid; place-items: center; width: 26px; height: 26px; background: #FFF8EC; color: var(--accent); border-radius: 50%; flex-shrink: 0; margin-top: 2px; }
      .ai-msg-assistant .ai-msg-content { background: #F6F6F4; color: #1a1a1a; padding: 0.7rem 0.95rem; border-radius: 12px 12px 12px 2px; font-size: 0.86rem; line-height: 1.5; white-space: pre-wrap; }
      .ai-thinking { color: #999; font-style: italic; animation: pulse 1.2s ease-in-out infinite; }
      @keyframes pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
      .ai-error { background: #FEF2F2; color: #991B1B; border: 1px solid #FCA5A5; padding: 0.6rem 0.8rem; border-radius: 6px; font-size: 0.82rem; }
      .ai-input-row { display: flex; gap: 0.5rem; padding: 0.9rem 1.4rem; border-top: 1px solid #ECECEC; flex-shrink: 0; }
      .ai-input { flex: 1; }
      .ai-send { padding: 0 1rem; }
      .ai-foot { font-size: 0.68rem; color: #aaa; text-align: center; margin: 0; padding: 0 1rem 0.7rem; flex-shrink: 0; }
      .ai-trigger { color: var(--accent) !important; border-color: var(--accent) !important; }
      .dark .ai-box { background: #1a1d24; }
      .dark .ai-suggestion { background: #14171d; border-color: #2d3139; color: #e5e7eb; }
      .dark .ai-msg-assistant .ai-msg-content { background: #14171d; color: #e5e7eb; }
      .dark .ai-welcome-txt { color: #aaa; }


      /* Clave avanzada y badge de modelo (v9) */
      .ai-model-badge { display: inline-block; margin-left: 8px; padding: 1px 7px; font-size: 0.62rem; font-weight: 700; letter-spacing: 0.04em; border-radius: 10px; background: #EEE; color: #777; text-transform: none; vertical-align: middle; }
      .ai-model-premium { background: linear-gradient(135deg, #B08D57, #d4af75); color: #FFF; }
      .ai-unlock-row { display: flex; align-items: center; gap: 0.6rem; padding: 0 1.4rem 0.6rem; }
      .ai-unlock-input { flex: 1; padding: 0.5rem 0.8rem; font-size: 0.82rem; max-width: 260px; }
      .ai-unlock-hint { font-size: 0.7rem; color: var(--accent); font-style: italic; }
      .dark .ai-model-badge { background: #2d3139; color: #aaa; }


      .ai-unlock-btn { padding: 0.5rem 1rem; font-size: 0.78rem; white-space: nowrap; }
      .ai-unlock-btn:disabled { opacity: 0.4; cursor: not-allowed; }


      .ai-unlock-ok { font-size: 0.78rem; color: #B08D57; font-weight: 700; }
      .ai-unlock-bad { font-size: 0.78rem; color: #b91c1c; font-weight: 600; }
      .ai-msg-model { margin-top: 6px; font-size: 0.62rem; font-weight: 700; letter-spacing: 0.03em; color: #999; }
      .ai-msg-model-premium { color: #B08D57; }
      .dark .ai-msg-model { color: #777; }
      .dark .ai-msg-model-premium { color: #d4af75; }


      /* ===================== AJUSTES MÓVIL (v9) ===================== */
      @media (max-width: 640px) {
        /* Briefing: apilar "Esta semana" arriba y "Proyectos en riesgo" abajo */
        .brief { flex-direction: column; gap: 0.9rem; padding: 0.9rem; }
        .brief-divider { display: none; }
        .brief-col-stats { width: 100%; }
        .brief-stats { justify-content: space-between; gap: 0.5rem; }
        .brief-stat { min-width: 0; flex: 1; }
        /* Pestañas deslizables horizontalmente (swipe) */
        .view-selector { display: flex; width: 100%; max-width: 100%; overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
        .view-selector::-webkit-scrollbar { display: none; }
        .vs-btn { flex: 0 0 auto; white-space: nowrap; padding: 0.55rem 0.75rem; }
      }
      @media (max-width: 480px) {
        /* Tarjetas de proyecto en riesgo: una por fila para que respire el texto */
        .risk-row { grid-template-columns: 1fr; }
        .risk-name { white-space: normal; }
      }


      /* Badge de vencidas clickeable + entregable en diagnóstico (v9) */
      .overdue-counter-btn { border: none; cursor: pointer; font: inherit; transition: all .12s ease; }
      .overdue-counter-btn:hover { filter: brightness(0.92); transform: translateY(-1px); text-decoration: underline; }
      .diag-task-entregable { font-size: 0.7rem; color: #888; margin-top: 0.2rem; font-style: italic; }
      .dark .diag-task-entregable { color: #999; }

    `}</style>
  );
}


// ===================================================================
// CHAT IA (v9) — pregunta al board en lenguaje natural vía OpenAI
// ===================================================================
function buildAIContext(tasks, projectsList) {
  try {
    const active = (tasks || []).filter(t => t && !t.archivada && !t.borrada);
    const total = active.length;
    const byEstado = {};
    ESTADOS.forEach(e => { byEstado[e] = active.filter(t => normalizeEstado(t.estado) === e).length; });
    const overdue = active.filter(_isOverdueTask);

    const byPersona = {};
    active.forEach(t => {
      const p = t.responsable || "Sin asignar";
      if (!byPersona[p]) byPersona[p] = { abiertas: 0, vencidas: 0, terminadas: 0 };
      if (normalizeEstado(t.estado) === "Terminado") byPersona[p].terminadas++; else byPersona[p].abiertas++;
      if (_isOverdueTask(t)) byPersona[p].vencidas++;
    });

    let ctx = "RESUMEN GENERAL:\n";
    ctx += "Total tareas activas: " + total + "\n";
    ctx += "Por estado: " + ESTADOS.map(e => e + ": " + byEstado[e]).join(", ") + "\n";
    ctx += "Tareas vencidas: " + overdue.length + "\n\n";

    ctx += "CARGA POR PERSONA:\n";
    Object.entries(byPersona).sort((a,b) => (b[1].abiertas) - (a[1].abiertas)).forEach(([p, m]) => {
      ctx += "- " + p + ": " + m.abiertas + " abiertas, " + m.vencidas + " vencidas, " + m.terminadas + " terminadas\n";
    });

    if (projectsList && projectsList.length) {
      ctx += "\nPROYECTOS:\n";
      projectsList.forEach(p => {
        ctx += "- " + p.proyecto + " (" + p.empresa + "): " + p.metrics.pct + "% avance, " + p.metrics.overdue + " vencidas, riesgo: " + p.metrics.risk + "\n";
      });
    }

    // Describe una tarea COMPLETA con TODOS sus campos legibles del portal
    const describeTaskFull = (t) => {
      const d = _safeDaysUntil(t);
      let plazo;
      if (d == null || isNaN(d)) plazo = "sin fecha";
      else if (d < 0) plazo = Math.abs(d) + "d VENCIDA";
      else if (d === 0) plazo = "vence HOY";
      else plazo = "vence en " + d + "d";

      let s = "* " + (t.actividad || "(sin titulo)") + "\n";
      s += "  Empresa/Proyecto: " + (t.empresa || "?") + " / " + (t.proyecto || "?") + "\n";
      s += "  Responsable: " + (t.responsable || "sin asignar") + " | Estado: " + normalizeEstado(t.estado) + " | Prioridad: " + (t.prioridad || "?") + " | " + plazo + "\n";
      if (t.fecha) s += "  Fecha compromiso: " + t.fecha + "\n";
      if (t.entregable) s += "  Entregable: " + t.entregable + "\n";
      if (t.observaciones) s += "  Notas/Observaciones: " + t.observaciones + "\n";
      const links = t.links || [];
      if (links.length) s += "  Links/Entregables adjuntos: " + links.map(l => (l.label || l.url || "")).filter(Boolean).join(", ") + "\n";
      const subs = parseSubtareas(t.subtareas);
      if (subs.length) {
        const done = subs.filter(x => x.done).length;
        s += "  Subtareas (" + done + "/" + subs.length + "): " + subs.map(x => (x.done ? "[hecho] " : "[pendiente] ") + x.texto).join("; ") + "\n";
      }
      const coms = parseComentarios(t.comentarios);
      if (coms.length) s += "  Comentarios: " + coms.map(c => c.autor + " (" + c.fecha + "): " + c.texto).join(" || ") + "\n";
      const hist = parseHistorial(t.historial);
      if (hist.length) s += "  Bitacora de cambios: " + hist.map(h => h.fecha + " -> " + h.estado).join(", ") + "\n";
      return s;
    };

    // DETALLE COMPLETO de todas las tareas abiertas, agrupadas por estado
    const noTerminadas = active.filter(t => normalizeEstado(t.estado) !== "Terminado");
    ctx += "\n===== DETALLE COMPLETO DE TODAS LAS TAREAS ABIERTAS (" + noTerminadas.length + ") =====\n";
    ESTADOS.filter(e => e !== "Terminado").forEach(estado => {
      const grupo = noTerminadas.filter(t => normalizeEstado(t.estado) === estado);
      if (grupo.length) {
        ctx += "\n--- " + estado.toUpperCase() + " (" + grupo.length + ") ---\n";
        _sortByUrgency(grupo).forEach(t => { ctx += describeTaskFull(t) + "\n"; });
      }
    });

    // Terminadas: detalle reducido (para contexto historico sin inflar demasiado)
    const terminadas = active.filter(t => normalizeEstado(t.estado) === "Terminado");
    if (terminadas.length) {
      ctx += "\n--- TERMINADAS (" + terminadas.length + ") ---\n";
      terminadas.forEach(t => {
        ctx += "* " + (t.actividad || "(sin titulo)") + " | " + (t.proyecto || "?") + " | " + (t.responsable || "?") + (t.fechaTerminado ? " | terminada: " + t.fechaTerminado : "") + "\n";
      });
    }

    return ctx;
  } catch (err) {
    console.error("[buildAIContext]", err);
    return "No se pudo construir el contexto del board.";
  }
}

function AIChat({ tasks, projectsList, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unlockWord, setUnlockWord] = useState("");
  const [showUnlock, setShowUnlock] = useState(false);
  const [unlockArmed, setUnlockArmed] = useState(false);
  const [unlockStatus, setUnlockStatus] = useState(null); // null | "checking" | "ok" | "bad" | "error"
  const [lastModel, setLastModel] = useState(null);
  const bodyRef = useRef(null);

  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [messages, loading]);

  const ask = async (q) => {
    const question = (q != null ? q : input).trim();
    if (!question || loading) return;
    setInput("");
    setError("");
    // Historial de la conversación (últimos 10 mensajes) para que la IA mantenga el hilo
    const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));
    setMessages(prev => [...prev, { role: "user", content: question }]);
    setLoading(true);
    try {
      const context = buildAIContext(tasks, projectsList);
      const res = await apiCall("ai", { prompt: question, context, unlock: unlockWord, history });
      if (res && res.ok && res.answer) {
        setLastModel(res.model || null);
        setMessages(prev => [...prev, { role: "assistant", content: res.answer, model: res.model }]);
      } else {
        setError((res && res.error) || "No se pudo obtener respuesta de la IA.");
      }
    } catch (err) {
      setError(String((err && err.message) || err));
    }
    setLoading(false);
  };

  const checkUnlock = async () => {
    if (!unlockWord.trim()) return;
    setUnlockStatus("checking");
    try {
      const res = await apiCall("checkkey", { unlock: unlockWord });
      if (res && res.ok && res.premium) {
        setUnlockArmed(true);
        setUnlockStatus("ok");
        setShowUnlock(false);
      } else {
        setUnlockArmed(false);
        setUnlockStatus("bad");
      }
    } catch (err) {
      setUnlockStatus("error");
    }
  };

  const suggestions = [
    "¿Qué debería priorizar esta semana?",
    "¿Quién está más cargado y qué le reasigno?",
    "¿Por qué están en riesgo mis proyectos?",
    "Dame un resumen ejecutivo para junta",
  ];

  const isPremium = lastModel && lastModel.indexOf("mini") === -1 && lastModel.indexOf("nano") === -1;
  const modelLabel = lastModel
    ? (isPremium ? "GPT-5.5 avanzado" : "GPT-5 mini")
    : (unlockArmed && unlockWord.trim() ? "Avanzado · listo" : null);
  const labelIsPremium = isPremium || (!lastModel && unlockArmed && unlockWord.trim());

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="ai-box" onClick={e => e.stopPropagation()}>
        <header className="ai-header">
          <div>
            <p className="yo-eyebrow"><Sparkles size={11} style={{ display: "inline", marginRight: 4 }} />Asistente IA{modelLabel && <span className={labelIsPremium ? "ai-model-badge ai-model-premium" : "ai-model-badge"}>{modelLabel}</span>}</p>
            <h3 className="ai-title">Pregúntale a tu board</h3>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button onClick={() => setShowUnlock(v => !v)} className="btn-ghost" title="Clave avanzada"><Lock size={13} /></button>
            <button onClick={onClose} className="btn-ghost"><X size={14} /></button>
          </div>
        </header>
        {showUnlock && (
          <div className="ai-unlock-row">
            <input
              type="password"
              className="input ai-unlock-input"
              value={unlockWord}
              onChange={e => { setUnlockWord(e.target.value); setUnlockArmed(false); setUnlockStatus(null); }}
              onKeyDown={e => { if (e.key === "Enter" && unlockWord.trim()) checkUnlock(); }}
              placeholder="Clave para modelo avanzado…"
              autoComplete="off"
            />
            <button
              type="button"
              className="yo-btn-primary ai-unlock-btn"
              disabled={!unlockWord.trim() || unlockStatus === "checking"}
              onClick={checkUnlock}
            >{unlockStatus === "checking" ? "Validando…" : "Activar"}</button>
          </div>
        )}
        {!showUnlock && unlockStatus === "ok" && (
          <div className="ai-unlock-row"><span className="ai-unlock-ok">✓ Clave correcta — modo GPT-5.5 avanzado ACTIVO</span></div>
        )}
        {unlockStatus === "bad" && (
          <div className="ai-unlock-row"><span className="ai-unlock-bad">✗ Clave incorrecta — sigues en GPT-5 mini</span></div>
        )}
        {unlockStatus === "error" && (
          <div className="ai-unlock-row"><span className="ai-unlock-bad">No se pudo validar la clave. Reintenta.</span></div>
        )}
        <div className="ai-body" ref={bodyRef}>
          {messages.length === 0 && !loading && (
            <div className="ai-welcome">
              <p className="ai-welcome-txt">Analizo tus tareas en tiempo real. Pregúntame lo que quieras:</p>
              <div className="ai-suggestions">
                {suggestions.map((s, i) => <button key={i} className="ai-suggestion" onClick={() => ask(s)}>{s}</button>)}
              </div>
            </div>
          )}
          {messages.map((m, i) => {
            const msgPremium = m.model && m.model.indexOf("mini") === -1 && m.model.indexOf("nano") === -1;
            return (
            <div key={i} className={`ai-msg ai-msg-${m.role}`}>
              {m.role === "assistant" && <span className="ai-msg-icon"><Sparkles size={13} /></span>}
              <div className="ai-msg-content">
                {m.content}
                {m.role === "assistant" && m.model && (
                  <div className={msgPremium ? "ai-msg-model ai-msg-model-premium" : "ai-msg-model"}>{msgPremium ? "⚡ GPT-5.5 avanzado" : "GPT-5 mini"}</div>
                )}
              </div>
            </div>
          );})}
          {loading && <div className="ai-msg ai-msg-assistant"><span className="ai-msg-icon"><Sparkles size={13} /></span><div className="ai-msg-content ai-thinking">Analizando tu board…</div></div>}
          {error && <div className="ai-error"><AlertTriangle size={13} style={{ display: "inline", marginRight: 4 }} />{error}</div>}
        </div>
        <form className="ai-input-row" onSubmit={(e) => { e.preventDefault(); ask(); }}>
          <input className="input ai-input" value={input} onChange={e => setInput(e.target.value)} placeholder="Escribe tu pregunta…" disabled={loading} autoFocus />
          <button type="submit" className="yo-btn-primary ai-send" disabled={loading || !input.trim()}><Send size={14} /></button>
        </form>
        <p className="ai-foot">Usa OpenAI · las respuestas pueden tener errores, verifica lo importante</p>
      </div>
    </div>
  );
}


// ===================================================================
// LOGIN GATE — palabra secreta para entrar al board
// ===================================================================
const AUTH_KEY = "aurum-auth-v1";
const SECRET_WORD = "yodesarrollo"; // case-insensitive

function LoginGate({ onSuccess }) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const tryLogin = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const w = (input || "").trim().toLowerCase();
    if (w === SECRET_WORD) {
      try { localStorage.setItem(AUTH_KEY, "1"); } catch {}
      setError("");
      onSuccess();
    } else {
      setError("Palabra incorrecta. Intenta de nuevo.");
      setInput("");
    }
  };
  return (
    <>
      <GlobalStyles />
      <div className="login-gate">
        <div className="login-box">
          <div className="login-icon"><Lock size={20} /></div>
          <p className="yo-eyebrow" style={{ textAlign: "center" }}>AURUM ARQUITECTOS · YODESARROLLO</p>
          <h1 className="login-title">Board operativo</h1>
          <p className="login-sub">Ingresa la palabra de acceso</p>
          <form onSubmit={tryLogin}>
            <input
              type="password"
              className="input login-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Palabra de acceso"
              autoFocus
              autoComplete="off"
            />
            {error && <div className="login-error">{error}</div>}
            <button type="submit" className="yo-btn-primary login-btn">Entrar</button>
          </form>
          <p className="login-foot">Acceso compartido del equipo</p>
        </div>
      </div>
    </>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(() => {
    try { return localStorage.getItem(AUTH_KEY) === "1"; } catch { return false; }
  });
  if (!authed) return <LoginGate onSuccess={() => setAuthed(true)} />;
  return <Board onLogout={() => { try { localStorage.removeItem(AUTH_KEY); } catch {}; setAuthed(false); }} />;
}

