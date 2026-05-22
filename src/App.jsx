import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Megaphone, Home, Compass, Building2, Users, Folder,
  ChevronDown, ChevronRight, ChevronLeft, Plus, Link2, X, RefreshCw,
  AlertCircle, CheckCircle2, Clock, Zap, Settings, Eye, EyeOff,
  Play, Archive, Calendar, LayoutGrid, BarChart3, Printer,
  Sun, Moon, AlertTriangle, History, Trash2
} from "lucide-react";

// ===================================================================
// CONFIGURACION
// ===================================================================
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxrc0lFolxwJQUF7wtPHNymf7AwNtsjVs08ivOl18veuqo-jkv4AkpwjZsGDX60ETph/exec";
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

const SHEET_FIELDS = ["mes", "empresa", "proyecto", "responsable", "semana", "actividad", "entregable", "fecha", "estado", "observaciones", "prioridad", "archivada", "fechaTerminado", "color", "historial", "subtareas"];
const FIELD_TO_SHEET = { mesCompromiso: "mes" };

// Estados — "Subido" ahora es "En revisión"
const ESTADOS = ["Pendiente", "En proceso", "En revisión", "Terminado"];
const ESTADO_SLUG = {
  "Pendiente": "pendiente",
  "En proceso": "en-proceso",
  "En revisión": "revision",
  "Terminado": "terminado",
};
function estadoSlug(estado) { return ESTADO_SLUG[estado] || "pendiente"; }

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
  const sw = { Pendiente: 0, "En proceso": 0.15, "En revisión": 0.3 }[t.estado] ?? 0.5;
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
    if (t.estado !== "En revisión") return false;
    return t.actualizado && new Date(t.actualizado) >= weekAgo;
  }).length;
  const vencenSemana = tasks.filter(t => { const d = daysUntil(t); return t.estado !== "Terminado" && d != null && d >= 0 && d <= 7; }).length;
  return { terminadasSemana, revisionSemana, vencenSemana };
}
function calcMetricsFor(list) {
  const total = list.length;
  const term = list.filter(t => t.estado === "Terminado").length;
  const rev = list.filter(t => t.estado === "En revisión").length;
  const pen = list.filter(t => t.estado === "Pendiente").length;
  const proc = list.filter(t => t.estado === "En proceso").length;
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
export default function Board() {
  const [tasks, setTasks] = useState(() => {
    try { const c = localStorage.getItem(CACHE_KEY); return c ? JSON.parse(c) : []; } catch { return []; }
  });
  const [filters, setFilters] = useState({ empresa: "Todas", proyecto: "Todos", responsable: "Todos", estado: "Todos", search: "" });
  const [showForm, setShowForm] = useState(false);
  const [newTask, setNewTask] = useState(emptyTask());
  const [linkDraft, setLinkDraft] = useState({ label: "", url: "" });
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

  async function addLink(taskId) {
    const url = normalizeUrl(linkDraft.url);
    if (!url) return;
    const label = linkDraft.label?.trim() || "Evidencia";
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const link = { id: makeId(), label, url, fechaSubida: todayStamp() };
      const next = (t.estado === "Pendiente" || t.estado === "En proceso") ? "En revisión" : t.estado;
      return { ...t, links: [...(t.links || []), link], estado: next };
    }));
    setLinkDraft({ label: "", url: "" });
    setSaveStatus(p => ({ ...p, [taskId]: "saving" }));
    try {
      await apiCall("addLink", { id: taskId, url, label });
      const t = tasksRef.current.find(t => t.id === taskId);
      if (t && t.estado === "En revisión") await apiCall("update", { id: taskId, patch: { estado: "En revisión" } });
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

  async function deleteTask(taskId) {
    const t = tasksRef.current.find(t => t.id === taskId);
    const ok = await askConfirm({ title: "Eliminar tarea", message: `Vas a eliminar "${t?.actividad || taskId}" del Sheet. Esta acción es definitiva.`, confirmLabel: "Sí, eliminar definitivamente" });
    if (!ok) return;
    const backup = t;
    setTasks(prev => prev.filter(t => t.id !== taskId));
    setSelectedTaskId(null);
    try { await apiCall("delete", { id: taskId }); delete recentlyModified.current[taskId]; }
    catch (err) { if (backup) setTasks(prev => [backup, ...prev]); alert("Error al eliminar: " + err.message); }
  }

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

  const filteredTasks = useMemo(() => {
    const term = filters.search.trim().toLowerCase();
    return tasks.filter(t => {
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
    <div className={shellClass}>
      <div className="mx-auto max-w-[1760px] px-3 py-4">
        {/* HEADER */}
        <header className="yo-header mb-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <CompanyLogos />
              <div>
                <p className="yo-eyebrow">Aurum Arquitectos · YoDesarrollo</p>
                <h1 className="yo-display text-xl mt-0.5">Board operativo</h1>
                <p className="text-xs subtle mt-0.5">
                  <GlobalSyncBadge status={globalSync} />
                  {overdueCount > 0 && <span className="overdue-counter"><AlertTriangle size={11}/>{overdueCount} vencida{overdueCount !== 1 ? "s" : ""}</span>}
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
              <button onClick={() => setShowSettings(true)} className="yo-btn-secondary" title="Ajustes de colores"><Settings size={12}/></button>
              <button onClick={() => setPresenting(true)} className="yo-btn-secondary" title="Modo presentación"><Play size={12}/></button>
              <button onClick={() => setTheme(t => t === "dark" ? "light" : "dark")} className="yo-btn-secondary" title="Tema claro/oscuro">{theme === "dark" ? <Sun size={12}/> : <Moon size={12}/>}</button>
              <button onClick={loadFromRemote} className="yo-btn-secondary" disabled={syncing} title="Forzar lectura"><RefreshCw size={12}/>{syncing ? "…" : ""}</button>
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
          onProjectClick={(p) => { setCurrentView("proyectos"); setExpandedProjectRows({ [p.key]: true }); }} />

        {/* MÉTRICAS con toggle global/empresa */}
        <section className="mb-3">
          <div className="metrics-toolbar">
            <button className={`mt-tab ${metricsMode === "global" ? "on" : ""}`} onClick={() => setMetricsMode("global")}>Global</button>
            <button className={`mt-tab ${metricsMode === "empresa" ? "on" : ""}`} onClick={() => setMetricsMode("empresa")}>Por empresa</button>
          </div>
          {metricsMode === "global" ? (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              <Metric label="Total" value={metricsGlobal.total} />
              <Metric label="Pend." value={metricsGlobal.pen} tone="pendiente" />
              <Metric label="Proceso" value={metricsGlobal.proc} tone="en-proceso" />
              <Metric label="Revisión" value={metricsGlobal.rev} tone="revision" />
              <Metric label="Term." value={metricsGlobal.term} tone="terminado" />
              <Metric label="Avance" value={`${metricsGlobal.avance}%`} />
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
                    <Metric label="Rev." value={m.rev} tone="revision" />
                    <Metric label="Term." value={m.term} tone="terminado" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* FILTROS */}
        <section className="mb-3 yo-card p-2">
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
        </main>
      </div>

      {showSettings && <SettingsPanel personas={allPersonas} colorOverrides={colorOverrides} onChangeColor={changePersonaColor} onClose={() => setShowSettings(false)} />}
      {personaPanel && <PersonaDashboard persona={personaPanel} tasks={tasks} colorOverrides={colorOverrides} onClose={() => setPersonaPanel(null)} onOpenTask={(id) => { setPersonaPanel(null); setSelectedTaskId(id); }} />}
      {showExport && <ExportView tasks={filteredTasks} metricsByEmpresa={metricsByEmpresa} riskyProjects={projectsList.filter(p => p.metrics.risk === "critico" || p.metrics.risk === "riesgo")} weekStats={weekStats} onClose={() => setShowExport(false)} />}
      {presenting && <PresentationMode tasks={tasks} weekStats={weekStats} riskyProjects={projectsList.filter(p => p.metrics.risk === "critico" || p.metrics.risk === "riesgo")} colorOverrides={colorOverrides} onClose={() => setPresenting(false)} />}

      <ConfirmModal dialog={confirmDialog} />
      <GlobalStyles />
    </div>
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
function WeekBriefing({ stats, risky, onProjectClick }) {
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
              <button key={p.key} className={`risk-card risk-${p.metrics.risk}`} onClick={() => onProjectClick(p)}>
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
  const rev = tasks.filter(t => t.estado === "En revisión").length;
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
          <span className="stat-sub" title="En revisión">{rev}</span>
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
          {done && <button className="quick-archive-btn" title={arch ? "Desarchivar" : "Archivar"} onClick={(e) => { e.stopPropagation(); quickArchive(task.id, !arch); }}><Archive size={10}/></button>}
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
      <div className="task-row-due">{done ? (<button className="quick-archive-btn" title={task.archivada ? "Desarchivar" : "Archivar"} onClick={(e) => { e.stopPropagation(); quickArchive(task.id, !task.archivada); }}><Archive size={11}/></button>) : <DeadlineBadge task={task} compact />}</div>
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
          {done && <button className="quick-archive-btn" title={task.archivada ? "Desarchivar" : "Archivar"} onClick={(e) => { e.stopPropagation(); quickArchive(task.id, !task.archivada); }}><Archive size={9}/></button>}
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
function ExportView({ tasks, metricsByEmpresa, riskyProjects, weekStats, onClose }) {
  const fecha = new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
  const porPersona = useMemo(() => {
    const map = {};
    tasks.forEach(t => { const p = t.responsable || "Sin responsable"; (map[p] = map[p] || []).push(t); });
    return Object.entries(map).map(([persona, list]) => ({ persona, m: calcMetricsFor(list) })).sort((a, b) => b.m.total - a.m.total);
  }, [tasks]);
  return (
    <div className="export-overlay">
      <div className="export-toolbar no-print">
        <span className="export-toolbar-title">Vista previa del reporte</span>
        <div className="export-toolbar-actions">
          <button onClick={() => window.print()} className="yo-btn-primary"><Printer size={14}/>Imprimir / Guardar PDF</button>
          <button onClick={onClose} className="yo-btn-secondary"><X size={14}/>Cerrar</button>
        </div>
      </div>
      <div className="export-sheet" id="export-sheet">
        <div className="export-head"><div><div className="export-eyebrow">Aurum Arquitectos · YoDesarrollo</div><h1 className="export-title">Reporte operativo</h1></div><div className="export-date">{fecha}</div></div>
        <div className="export-section"><h2 className="export-h2">Resumen de la semana</h2><div className="export-week"><div className="export-week-stat"><strong>{weekStats.terminadasSemana}</strong> terminadas</div><div className="export-week-stat"><strong>{weekStats.revisionSemana}</strong> a revisión</div><div className="export-week-stat"><strong>{weekStats.vencenSemana}</strong> vencen en 7 días</div></div></div>
        <div className="export-section"><h2 className="export-h2">Por empresa</h2><table className="export-table"><thead><tr><th>Empresa</th><th>Total</th><th>Pend.</th><th>Proc.</th><th>Rev.</th><th>Term.</th><th>Avance</th></tr></thead><tbody>{metricsByEmpresa.map(({ empresa, m }) => (<tr key={empresa}><td>{empresa}</td><td>{m.total}</td><td>{m.pen}</td><td>{m.proc}</td><td>{m.rev}</td><td>{m.term}</td><td><strong>{m.avance}%</strong></td></tr>))}</tbody></table></div>
        <div className="export-section"><h2 className="export-h2">Por persona</h2><table className="export-table"><thead><tr><th>Responsable</th><th>Total</th><th>Pend.</th><th>Proc.</th><th>Rev.</th><th>Term.</th><th>Vencidas</th><th>Avance</th></tr></thead><tbody>{porPersona.map(({ persona, m }) => (<tr key={persona}><td>{persona}</td><td>{m.total}</td><td>{m.pen}</td><td>{m.proc}</td><td>{m.rev}</td><td>{m.term}</td><td className={m.overdue > 0 ? "export-danger" : ""}>{m.overdue}</td><td><strong>{m.avance}%</strong></td></tr>))}</tbody></table></div>
        {riskyProjects.length > 0 && (
          <div className="export-section"><h2 className="export-h2">Proyectos en riesgo</h2><table className="export-table"><thead><tr><th>Proyecto</th><th>Empresa</th><th>Atrasadas</th><th>Abiertas</th><th>Avance</th></tr></thead><tbody>{riskyProjects.map(p => (<tr key={p.key}><td>{p.proyecto}</td><td>{p.empresa}</td><td className="export-danger">{p.metrics.overdue}</td><td>{p.metrics.openTotal}</td><td><strong>{p.metrics.pct}%</strong></td></tr>))}</tbody></table></div>
        )}
        <div className="export-foot">Generado desde el Board operativo · {fecha}</div>
      </div>
    </div>
  );
}

// ===================================================================
// MODO PRESENTACIÓN
// ===================================================================
function PresentationMode({ tasks, weekStats, riskyProjects, colorOverrides, onClose }) {
  const [slide, setSlide] = useState(0);
  const slides = [
    { title: "Board operativo", subtitle: "Aurum Arquitectos · YoDesarrollo", kind: "cover" },
    { title: "Esta semana", subtitle: "Movimientos relevantes", kind: "stats" },
    { title: "Proyectos en riesgo", subtitle: "Atención inmediata", kind: "risks" },
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
          {cur.kind === "cover" && <PresentCover stats={weekStats} risky={riskyProjects.length} />}
          {cur.kind === "stats" && <PresentStats stats={weekStats} />}
          {cur.kind === "risks" && <PresentRisks risky={riskyProjects} />}
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
function PresentCover({ stats, risky }) {
  return (<div className="present-cover"><div className="cover-big-stat"><div className="cbs-n">{stats.terminadasSemana}</div><div className="cbs-l">tareas terminadas esta semana</div></div><div className="cover-mini-stats"><div className="cms"><span className="cms-n">{stats.vencenSemana}</span><span className="cms-l">vencen 7d</span></div><div className="cms"><span className="cms-n">{risky}</span><span className="cms-l">proyectos en riesgo</span></div></div></div>);
}
function PresentStats({ stats }) {
  return (<div className="present-stats"><div className="ps-card"><div className="ps-n">{stats.terminadasSemana}</div><div className="ps-l">Terminadas</div></div><div className="ps-card"><div className="ps-n">{stats.revisionSemana}</div><div className="ps-l">A revisión</div></div><div className="ps-card"><div className="ps-n">{stats.vencenSemana}</div><div className="ps-l">Vencen en 7 días</div></div></div>);
}
function PresentRisks({ risky }) {
  if (risky.length === 0) return <div className="present-empty">✓ Sin proyectos en riesgo.</div>;
  return (<div className="present-risks">{risky.slice(0, 6).map(p => (<div key={p.key} className={`pr-card risk-${p.metrics.risk}`}><div className="pr-head"><span className="pr-name">{p.proyecto}</span><span className="pr-pct">{p.metrics.pct}%</span></div><div className="pr-meta">{p.empresa} · {p.metrics.overdue} atrasadas · {p.metrics.openTotal} abiertas</div><ProgressBar pct={p.metrics.pct} risk={p.metrics.risk} /></div>))}</div>);
}
function PresentUpcoming({ tasks, colorOverrides }) {
  const upcoming = tasks.filter(t => { if (t.estado === "Terminado" || t.archivada) return false; const d = daysUntil(t); return d != null && d >= 0 && d <= 7; }).sort((a, b) => daysUntil(a) - daysUntil(b)).slice(0, 8);
  if (upcoming.length === 0) return <div className="present-empty">Sin entregas próximas.</div>;
  return (<div className="present-list">{upcoming.map(t => { const palette = personPalette(t.responsable, colorOverrides); return (<div key={t.id} className="pl-row"><div className="pl-due"><DeadlineBadge task={t} compact /></div><div className="pl-title">{t.actividad}</div><div className="pl-proj">{t.proyecto}</div><div className="pl-asg" style={{ color: palette.text }}><PersonaAvatar name={t.responsable} size={20} colorOverrides={colorOverrides} />{(t.responsable || "").split(" ")[0]}</div></div>); })}</div>);
}
function PresentActivity({ tasks, colorOverrides }) {
  const today = new Date();
  const weekAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
  const recent = tasks.filter(t => { const ref = t.fechaTerminado || t.actualizado; return ref && new Date(ref) >= weekAgo && (t.estado === "Terminado" || t.estado === "En revisión"); }).sort((a, b) => new Date(b.fechaTerminado || b.actualizado) - new Date(a.fechaTerminado || a.actualizado)).slice(0, 8);
  if (recent.length === 0) return <div className="present-empty">Sin actividad reciente.</div>;
  return (<div className="present-list">{recent.map(t => { const palette = personPalette(t.responsable, colorOverrides); const verb = t.estado === "Terminado" ? "completó" : "subió a revisión"; return (<div key={t.id} className="pl-row"><div className="pl-asg" style={{ color: palette.text }}><PersonaAvatar name={t.responsable} size={20} colorOverrides={colorOverrides} />{(t.responsable || "").split(" ")[0]}</div><div className="pl-verb">{verb}</div><div className="pl-title">{t.actividad}</div><div className="pl-proj">{t.proyecto}</div></div>); })}</div>);
}

// ===================================================================
// SUBCOMPONENTES COMUNES
// ===================================================================
function CompanyLogos() { return <div className="flex items-center gap-2"><CompanyLogo name="Aurum Arquitectos" size={32} /><CompanyLogo name="YoDesarrollo" size={32} /></div>; }
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
function Metric({ label, value, tone }) { return <div className={`metric-card${tone ? ` metric-${tone}` : ""}`}><div className="metric-value">{value}</div><div className="metric-label">{label}</div></div>; }
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
