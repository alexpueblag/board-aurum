import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Megaphone, Home, Compass, Building2, Users, Folder, Briefcase,
  ChevronDown, ChevronRight, Plus, Trash2, Link2, X, RefreshCw,
  AlertCircle, CheckCircle2, Clock, Zap
} from "lucide-react";

// ===================================================================
// CONFIGURACION — si cambia la URL del Apps Script, actualiza esta linea:
// ===================================================================
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxrc0lFolxwJQUF7wtPHNymf7AwNtsjVs08ivOl18veuqo-jkv4AkpwjZsGDX60ETph/exec";
const SHARED_SECRET = "aurum-2026-x9k7m4q2-secreto";

// ASSETS — pega aqui las URLs de Drive en formato:
// https://drive.google.com/uc?export=view&id=FILE_ID
// Si quedan vacias, se usan iniciales/placeholders.
const ASSETS = {
  logos: {
    "Aurum Arquitectos": "",
    "YoDesarrollo": "",
  },
  fotos: {
    "Alejandro": "",
    "Alma": "",
    "Sayri": "",
    "Mariana": "",
  }
};

const DEBOUNCE_MS = 1500;
const PROTECTION_MS = 60 * 1000;
const REFRESH_MS = 5 * 60 * 1000;
const SAVED_FLASH_MS = 1800;
const CACHE_KEY = "aurum-cache-v3";

const SHEET_FIELDS = ["mes", "empresa", "proyecto", "responsable", "semana", "actividad", "entregable", "fecha", "estado", "observaciones", "prioridad"];
const FIELD_TO_SHEET = { mesCompromiso: "mes" };

const ESTADOS = ["Pendiente", "En proceso", "Subido", "Terminado"];
const PRIORIDADES = ["Alta", "Media", "Baja"];
const EMPRESAS = ["Aurum Arquitectos", "YoDesarrollo"];
const ORDER_PERSONAS = ["Alejandro", "Alma", "Sayri", "Mariana"];
const ORDER_EMPRESAS = ["Aurum Arquitectos", "YoDesarrollo"];
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MONTH_INDEX = MESES.reduce((acc, m, i) => ({ ...acc, [m]: i }), {});

const PERSON_COLORS = {
  Alejandro: { main: "#0F172A", soft: "#F4F8FB", text: "#0F172A" },
  Alma:      { main: "#1976A3", soft: "#EFFAFF", text: "#0B4F6C" },
  Sayri:     { main: "#C84949", soft: "#FFF4F4", text: "#7F1D1D" },
  Mariana:   { main: "#6B7280", soft: "#F7F7F7", text: "#374151" },
  default:   { main: "#475569", soft: "#F8FAFC", text: "#334155" }
};

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
  return { mes: "Abril", mesCompromiso: "Abril", empresa: "YoDesarrollo", proyecto: "", responsable: "", semana: "", actividad: "", entregable: "", fecha: "", estado: "Pendiente", prioridad: "Media", observaciones: "", links: [] };
}
function personPalette(name) { return PERSON_COLORS[name] || PERSON_COLORS.default; }
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
  const sh = { Enero: "Ene", Febrero: "Feb", Marzo: "Mar", Abril: "Abr", Mayo: "May", Junio: "Jun", Julio: "Jul", Agosto: "Ago", Septiembre: "Sep", Octubre: "Oct", Noviembre: "Nov", Diciembre: "Dic" }[m] || m.slice(0, 3);
  return d ? `${sh} ${d}` : t.fecha || "—";
}
function urgencyScore(t) {
  if (t.estado === "Terminado") return 999999;
  const d = daysUntil(t);
  const sw = { Pendiente: 0, "En proceso": 0.15, Subido: 0.3 }[t.estado] ?? 0.5;
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

// ===================================================================
// API
// ===================================================================
async function apiCall(action, payload = {}) {
  const body = JSON.stringify({ secret: SHARED_SECRET, action, ...payload });
  console.log(`[apiCall] -> ${action}`, payload);
  let res;
  try {
    res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      body,
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      redirect: "follow",
    });
  } catch (netErr) {
    throw new Error(`Red/CORS: ${netErr.message}`);
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${txt.slice(0, 120)}`);
  }
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error(`Respuesta no es JSON: ${text.slice(0, 200)}`); }
  if (!data.ok) throw new Error(data.error || "Error desconocido");
  console.log(`[apiCall] <- ${action}`, data);
  return data;
}

function patchToSheet(patch) {
  const out = {};
  for (const k in patch) {
    const sk = FIELD_TO_SHEET[k] || k;
    if (SHEET_FIELDS.includes(sk)) out[sk] = patch[k];
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
  const [expandedPersonas, setExpandedPersonas] = useState({});
  const [expandedProyectos, setExpandedProyectos] = useState({});
  const [draggingId, setDraggingId] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [diagnostic, setDiagnostic] = useState(null);
  const [saveStatus, setSaveStatus] = useState({});
  const [confirmDialog, setConfirmDialog] = useState({ open: false });

  const pendingPatches = useRef({});
  const debounceTimers = useRef({});
  const recentlyModified = useRef({});
  const tasksRef = useRef(tasks);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);

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

  // Diagnóstico inicial: ping al Apps Script
  useEffect(() => {
    apiCall("ping")
      .then(() => setDiagnostic(null))
      .catch(err => setDiagnostic({ message: err.message }));
  }, []);

  const loadFromRemote = useCallback(async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      let remote = null;
      // 1. Lectura en vivo del Apps Script (no espera al cron)
      try {
        const result = await apiCall("getAll");
        if (Array.isArray(result.tasks)) remote = result.tasks;
      } catch (apiErr) {
        console.warn("[loadFromRemote] Apps Script no respondió, fallback a data.json:", apiErr.message);
      }
      // 2. Fallback a data.json si Apps Script falló
      if (!remote) {
        const base = import.meta.env.BASE_URL || "/";
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
          if (lm && now - lm < PROTECTION_MS) {
            const local = tasksRef.current.find(t => t.id === rt.id);
            return local || rt;
          }
          return rt;
        });
        setTasks(merged);
        setLastSync(new Date());
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(merged)); } catch {}
      }
    } catch (err) {
      setSyncError(err.message);
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    loadFromRemote();
    const id = setInterval(() => {
      if (Object.keys(pendingPatches.current).length === 0) loadFromRemote();
    }, REFRESH_MS);
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
      setTimeout(() => {
        setSaveStatus(p => p[taskId] === "saved" ? { ...p, [taskId]: "idle" } : p);
      }, SAVED_FLASH_MS);
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

  const flushAll = useCallback(() => {
    Object.keys(pendingPatches.current).forEach(id => flushTask(id));
  }, [flushTask]);

  // Reintento automático
  useEffect(() => {
    const id = setInterval(() => {
      Object.entries(saveStatus).forEach(([taskId, st]) => {
        if (st === "error" && pendingPatches.current[taskId]) flushTask(taskId);
      });
    }, 30000);
    return () => clearInterval(id);
  }, [saveStatus, flushTask]);

  useEffect(() => {
    const h = () => flushAll();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [flushAll]);

  function updateTaskField(id, patch, immediate = false) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch, actualizado: todayStamp() } : t));
    queueChange(id, patch, immediate);
  }

  async function addTask() {
    if (!newTask.proyecto.trim() || !newTask.responsable.trim() || !newTask.actividad.trim()) {
      alert("Completa proyecto, responsable y actividad."); return;
    }
    const tempId = makeId();
    const tempTask = { ...newTask, id: tempId, mes: newTask.mesCompromiso || newTask.mes, creado: todayStamp(), actualizado: todayStamp(), links: [] };
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
    } catch (err) {
      setSaveStatus(p => ({ ...p, [tempId]: "error", [`${tempId}_err`]: err.message }));
    }
  }

  async function addLink(taskId) {
    const url = normalizeUrl(linkDraft.url);
    if (!url) return;
    const label = linkDraft.label?.trim() || "Evidencia";
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const link = { id: makeId(), label, url, fechaSubida: todayStamp() };
      const next = (t.estado === "Pendiente" || t.estado === "En proceso") ? "Subido" : t.estado;
      return { ...t, links: [...(t.links || []), link], estado: next };
    }));
    setLinkDraft({ label: "", url: "" });
    setSaveStatus(p => ({ ...p, [taskId]: "saving" }));
    try {
      await apiCall("addLink", { id: taskId, url, label });
      const t = tasksRef.current.find(t => t.id === taskId);
      if (t && t.estado === "Subido") await apiCall("update", { id: taskId, patch: { estado: "Subido" } });
      recentlyModified.current[taskId] = Date.now();
      setSaveStatus(p => ({ ...p, [taskId]: "saved" }));
      setTimeout(() => setSaveStatus(p => p[taskId] === "saved" ? { ...p, [taskId]: "idle" } : p), SAVED_FLASH_MS);
    } catch (err) {
      setSaveStatus(p => ({ ...p, [taskId]: "error", [`${taskId}_err`]: err.message }));
    }
  }

  async function removeLinkConfirmed(taskId, linkId) {
    const t = tasksRef.current.find(t => t.id === taskId);
    const link = t?.links?.find(l => l.id === linkId);
    if (!link) return;
    const ok = await askConfirm({
      title: "Eliminar evidencia",
      message: `Vas a quitar "${link.label}". Acción definitiva.`,
      confirmLabel: "Sí, eliminar"
    });
    if (!ok) return;
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, links: t.links.filter(l => l.id !== linkId) } : t));
    setSaveStatus(p => ({ ...p, [taskId]: "saving" }));
    try {
      await apiCall("removeLink", { id: taskId, url: link.url });
      recentlyModified.current[taskId] = Date.now();
      setSaveStatus(p => ({ ...p, [taskId]: "saved" }));
      setTimeout(() => setSaveStatus(p => p[taskId] === "saved" ? { ...p, [taskId]: "idle" } : p), SAVED_FLASH_MS);
    } catch (err) {
      setSaveStatus(p => ({ ...p, [taskId]: "error", [`${taskId}_err`]: err.message }));
    }
  }

  async function deleteTask(taskId) {
    const t = tasksRef.current.find(t => t.id === taskId);
    const ok = await askConfirm({
      title: "Eliminar tarea",
      message: `Vas a eliminar "${t?.actividad || taskId}" del Sheet. Esta acción es definitiva.`,
      confirmLabel: "Sí, eliminar definitivamente"
    });
    if (!ok) return;
    const backup = t;
    setTasks(prev => prev.filter(t => t.id !== taskId));
    setSelectedTaskId(null);
    try {
      await apiCall("delete", { id: taskId });
      delete recentlyModified.current[taskId];
    } catch (err) {
      if (backup) setTasks(prev => [backup, ...prev]);
      alert("Error al eliminar: " + err.message);
    }
  }

  function changeStatusByDrag(taskId, newStatus) {
    updateTaskField(taskId, { estado: newStatus }, true);
  }

  function closeSubboard() {
    if (selectedTaskId) flushTask(selectedTaskId);
    setSelectedTaskId(null);
  }

  function togglePersona(p) { setExpandedPersonas(prev => ({ ...prev, [p]: !prev[p] })); }
  function toggleProyecto(key) { setExpandedProyectos(prev => ({ ...prev, [key]: !prev[key] })); }

  // ----- DERIVADOS -----
  const projects = useMemo(() => ["Todos", ...Array.from(new Set(tasks.map(t => t.proyecto).filter(Boolean))).sort()], [tasks]);
  const responsables = useMemo(() => ["Todos", ...Array.from(new Set(tasks.map(t => t.responsable).filter(Boolean))).sort()], [tasks]);

  const filteredTasks = useMemo(() => {
    const term = filters.search.trim().toLowerCase();
    return tasks.filter(t => {
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
  }, [tasks, filters]);

  // Jerarquía: { Persona: { Empresa: { Proyecto: [tareas] } } }
  const hierarchy = useMemo(() => {
    const h = {};
    filteredTasks.forEach(t => {
      const p = t.responsable || "Sin responsable";
      const e = t.empresa || "Sin empresa";
      const pr = t.proyecto || "Sin proyecto";
      if (!h[p]) h[p] = {};
      if (!h[p][e]) h[p][e] = {};
      if (!h[p][e][pr]) h[p][e][pr] = [];
      h[p][e][pr].push(t);
    });
    Object.values(h).forEach(empresas => {
      Object.values(empresas).forEach(proys => {
        Object.values(proys).forEach(arr => arr.sort((a, b) => urgencyScore(a) - urgencyScore(b)));
      });
    });
    return h;
  }, [filteredTasks]);

  const personasOrdenadas = useMemo(() => {
    const allKeys = Object.keys(hierarchy);
    return allKeys.sort((a, b) => {
      const ai = ORDER_PERSONAS.indexOf(a), bi = ORDER_PERSONAS.indexOf(b);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return a.localeCompare(b);
    });
  }, [hierarchy]);

  const metrics = useMemo(() => {
    const total = filteredTasks.length;
    const term = filteredTasks.filter(t => t.estado === "Terminado").length;
    const sub = filteredTasks.filter(t => t.estado === "Subido").length;
    const pen = filteredTasks.filter(t => t.estado === "Pendiente").length;
    const proc = filteredTasks.filter(t => t.estado === "En proceso").length;
    const links = filteredTasks.reduce((s, t) => s + (t.links?.length || 0), 0);
    return { total, term, sub, pen, proc, links, avance: total ? Math.round(term / total * 100) : 0 };
  }, [filteredTasks]);

  const selectedTask = useMemo(() => tasks.find(t => t.id === selectedTaskId) || null, [tasks, selectedTaskId]);

  const globalSync = useMemo(() => {
    const errs = Object.entries(saveStatus).filter(([k, v]) => v === "error" && !k.endsWith("_err")).length;
    const sav = Object.entries(saveStatus).filter(([k, v]) => v === "saving" && !k.endsWith("_err")).length;
    if (errs > 0) return { type: "error", text: `${errs} con error · reintentando` };
    if (sav > 0) return { type: "saving", text: `Guardando ${sav}…` };
    return { type: "idle", text: `Última lectura ${timeAgo(lastSync)}` };
  }, [saveStatus, lastSync]);

  // ===========================================================
  // RENDER: SUBBOARD
  // ===========================================================
  if (selectedTask) {
    const status = saveStatus[selectedTask.id];
    const errMsg = saveStatus[`${selectedTask.id}_err`];
    return (
      <div className="brand-shell yo-theme min-h-screen">
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
                <p className="mt-1 text-sm text-stone-500">{selectedTask.proyecto} · {selectedTask.responsable}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <EstadoChip estado={selectedTask.estado} />
                  <PrioridadChip prioridad={selectedTask.prioridad} />
                  <DeadlineBadge task={selectedTask} />
                </div>
                <p className="mt-2 text-xs yo-success">✓ Cada cambio se guarda automáticamente.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => updateTaskField(selectedTask.id, { estado: "Terminado" }, true)} className="yo-btn-primary">Marcar terminado</button>
                <button onClick={() => deleteTask(selectedTask.id)} className="yo-btn-danger">Eliminar</button>
              </div>
            </div>
          </header>

          <main className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
            <section className="yo-card p-5">
              <h2 className="yo-eyebrow mb-4">Datos</h2>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Empresa">
                  <select className="input" value={selectedTask.empresa} onChange={e => updateTaskField(selectedTask.id, { empresa: e.target.value }, true)}>
                    {EMPRESAS.map(e => <option key={e}>{e}</option>)}
                  </select>
                </Field>
                <Field label="Proyecto">
                  <input className="input" value={selectedTask.proyecto || ""} onChange={e => updateTaskField(selectedTask.id, { proyecto: e.target.value })} />
                </Field>
                <Field label="Responsable">
                  <input className="input" value={selectedTask.responsable || ""} onChange={e => updateTaskField(selectedTask.id, { responsable: e.target.value })} />
                </Field>
                <Field label="Mes">
                  <select className="input" value={selectedTask.mesCompromiso || selectedTask.mes || "Abril"} onChange={e => updateTaskField(selectedTask.id, { mesCompromiso: e.target.value, mes: e.target.value }, true)}>
                    {MESES.map(m => <option key={m}>{m}</option>)}
                  </select>
                </Field>
                <Field label="Fecha">
                  <input className="input" value={selectedTask.fecha || ""} onChange={e => updateTaskField(selectedTask.id, { fecha: e.target.value })} />
                </Field>
                <Field label="Semana">
                  <input className="input" value={selectedTask.semana || ""} onChange={e => updateTaskField(selectedTask.id, { semana: e.target.value })} />
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
                <Field label="Actividad">
                  <textarea className="input min-h-[80px]" value={selectedTask.actividad || ""} onChange={e => updateTaskField(selectedTask.id, { actividad: e.target.value })} />
                </Field>
                <Field label="Entregable">
                  <textarea className="input min-h-[80px]" value={selectedTask.entregable || ""} onChange={e => updateTaskField(selectedTask.id, { entregable: e.target.value })} />
                </Field>
                <Field label="Observaciones">
                  <textarea className="input min-h-[120px]" value={selectedTask.observaciones || ""} onChange={e => updateTaskField(selectedTask.id, { observaciones: e.target.value })} placeholder="Notas, bloqueos, contexto…" />
                </Field>
              </div>
            </section>

            <aside className="space-y-5">
              <section className="yo-card p-5">
                <h2 className="yo-eyebrow mb-4">Evidencias</h2>
                <div className="space-y-2">
                  {(selectedTask.links || []).length === 0 && <p className="text-sm text-stone-400 p-3 bg-stone-50">Sin archivos.</p>}
                  {(selectedTask.links || []).map(link => (
                    <div key={link.id} className="border border-stone-200 p-3">
                      <a href={link.url} target="_blank" rel="noreferrer" className="block text-sm font-bold text-stone-900 hover:underline break-all">{link.label}</a>
                      <div className="mt-1 text-xs text-stone-400 break-all">{link.url}</div>
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
    <div className="brand-shell yo-theme min-h-screen">
      <div className="mx-auto max-w-[1760px] px-3 py-4">
        {/* HEADER */}
        <header className="yo-header mb-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <CompanyLogos />
              <div>
                <p className="yo-eyebrow">Aurum Arquitectos · YoDesarrollo</p>
                <h1 className="yo-display text-xl mt-0.5">Board operativo</h1>
                <p className="text-xs text-stone-500 mt-0.5">
                  <GlobalSyncBadge status={globalSync} />
                  {syncError && <span className="ml-2 text-red-600">· lectura: {syncError}</span>}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={loadFromRemote} className="yo-btn-secondary" disabled={syncing} title="Forzar lectura"><RefreshCw size={12}/>{syncing ? "…" : ""}</button>
              <button onClick={() => setShowForm(v => !v)} className="yo-btn-primary"><Plus size={14}/>Tarea</button>
            </div>
          </div>
        </header>

        {/* DIAGNOSTIC */}
        {diagnostic && (
          <div className="diagnostic-banner mb-3">
            <AlertCircle size={18} className="shrink-0" />
            <div>
              <strong>No conecta al Sheet.</strong> {diagnostic.message}
              <div className="text-xs mt-1 opacity-80">Las lecturas siguen funcionando, pero los cambios no se están guardando al Sheet. Verifica que la URL en App.jsx (línea 13) coincida con la del Apps Script publicado, o re-publica el Apps Script.</div>
            </div>
          </div>
        )}

        {/* MÉTRICAS */}
        <section className="mb-3 grid grid-cols-3 sm:grid-cols-6 gap-1.5">
          <Metric label="Total" value={metrics.total} />
          <Metric label="Pend." value={metrics.pen} />
          <Metric label="Proceso" value={metrics.proc} />
          <Metric label="Subidas" value={metrics.sub} />
          <Metric label="Term." value={metrics.term} />
          <Metric label="Avance" value={`${metrics.avance}%`} />
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
            <div className="mb-3 flex items-center justify-between">
              <h2 className="yo-eyebrow">Nueva tarea</h2>
              <button onClick={() => setShowForm(false)} className="btn-ghost"><X size={14}/></button>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <Field label="Empresa"><select value={newTask.empresa} onChange={e => setNewTask({ ...newTask, empresa: e.target.value })} className="input">{EMPRESAS.map(e => <option key={e}>{e}</option>)}</select></Field>
              <Field label="Proyecto"><input className="input" value={newTask.proyecto} onChange={e => setNewTask({ ...newTask, proyecto: e.target.value })} placeholder="Nombre del proyecto" /></Field>
              <Field label="Responsable"><input className="input" value={newTask.responsable} onChange={e => setNewTask({ ...newTask, responsable: e.target.value })} /></Field>
              <Field label="Mes"><select className="input" value={newTask.mesCompromiso} onChange={e => setNewTask({ ...newTask, mesCompromiso: e.target.value })}>{MESES.map(m => <option key={m}>{m}</option>)}</select></Field>
              <Field label="Fecha"><input className="input" value={newTask.fecha} onChange={e => setNewTask({ ...newTask, fecha: e.target.value })} placeholder="Viernes 1" /></Field>
              <Field label="Semana"><input className="input" value={newTask.semana} onChange={e => setNewTask({ ...newTask, semana: e.target.value })} /></Field>
              <Field label="Prioridad"><select className="input" value={newTask.prioridad} onChange={e => setNewTask({ ...newTask, prioridad: e.target.value })}>{PRIORIDADES.map(p => <option key={p}>{p}</option>)}</select></Field>
              <Field label="Estado"><select className="input" value={newTask.estado} onChange={e => setNewTask({ ...newTask, estado: e.target.value })}>{ESTADOS.map(s => <option key={s}>{s}</option>)}</select></Field>
            </div>
            <div className="grid gap-2 mt-2">
              <Field label="Actividad"><input className="input" value={newTask.actividad} onChange={e => setNewTask({ ...newTask, actividad: e.target.value })} /></Field>
              <Field label="Entregable"><input className="input" value={newTask.entregable} onChange={e => setNewTask({ ...newTask, entregable: e.target.value })} /></Field>
            </div>
            <div className="mt-3 flex justify-end">
              <button onClick={addTask} className="yo-btn-primary"><Plus size={14}/>Crear en Sheet</button>
            </div>
          </section>
        )}

        {/* JERARQUÍA */}
        <main>
          {personasOrdenadas.length === 0 && (
            <div className="yo-card p-8 text-center text-sm text-stone-400">
              {tasks.length === 0 ? "Cargando tareas desde el Sheet…" : "Sin tareas con los filtros actuales."}
            </div>
          )}
          {personasOrdenadas.length > 0 && (
            <>
              <div className="personas-tabs">
                {personasOrdenadas.map(persona => (
                  <PersonaTab
                    key={persona}
                    persona={persona}
                    dataByEmpresa={hierarchy[persona]}
                    active={!!expandedPersonas[persona]}
                    onClick={() => togglePersona(persona)}
                  />
                ))}
              </div>
              <div className="personas-panels">
                {personasOrdenadas.map(persona => (
                  expandedPersonas[persona] && (
                    <PersonaPanel
                      key={persona}
                      persona={persona}
                      dataByEmpresa={hierarchy[persona]}
                      expandedProyectos={expandedProyectos}
                      onToggleProyecto={toggleProyecto}
                      onOpenTask={setSelectedTaskId}
                      onStatusChange={changeStatusByDrag}
                      draggingId={draggingId}
                      setDraggingId={setDraggingId}
                      saveStatus={saveStatus}
                      onClose={() => togglePersona(persona)}
                    />
                  )
                ))}
              </div>
            </>
          )}
        </main>
      </div>
      <ConfirmModal dialog={confirmDialog} />
      <GlobalStyles />
    </div>
  );
}

// ===================================================================
// SUBCOMPONENTES
// ===================================================================
function CompanyLogos() {
  return (
    <div className="flex items-center gap-2">
      <CompanyLogo name="Aurum Arquitectos" size={32} />
      <CompanyLogo name="YoDesarrollo" size={32} />
    </div>
  );
}

function CompanyLogo({ name, size = 24 }) {
  const url = ASSETS.logos[name];
  if (url) return <img src={url} alt={name} style={{ height: size, width: "auto", objectFit: "contain" }} />;
  return (
    <div className="logo-placeholder" style={{ width: size, height: size, fontSize: size * 0.4 }} title={name}>
      {getInitials(name)}
    </div>
  );
}

function PersonaAvatar({ name, size = 40 }) {
  const url = ASSETS.fotos[name];
  const palette = personPalette(name);
  if (url) return <img src={url} alt={name} className="persona-avatar" style={{ width: size, height: size }} />;
  return (
    <div className="persona-avatar-placeholder" style={{ width: size, height: size, background: palette.main, fontSize: size * 0.35 }}>
      {getInitials(name)}
    </div>
  );
}

function PersonaCard({ persona, dataByEmpresa, expanded, onTogglePersona, expandedProyectos, onToggleProyecto, onOpenTask, onStatusChange, draggingId, setDraggingId, saveStatus }) {
  const palette = personPalette(persona);
  const allTasks = Object.values(dataByEmpresa).flatMap(emp => Object.values(emp).flat());
  const total = allTasks.length;
  const cerradas = allTasks.filter(t => t.estado === "Terminado").length;
  const urgentes = allTasks.filter(t => t.estado !== "Terminado").length;
  const altas = allTasks.filter(t => t.prioridad === "Alta" && t.estado !== "Terminado").length;
  const empresasOrdenadas = Object.keys(dataByEmpresa).sort((a, b) => {
    const ai = ORDER_EMPRESAS.indexOf(a), bi = ORDER_EMPRESAS.indexOf(b);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return a.localeCompare(b);
  });

  return (
    <section className="persona-card" style={{ borderLeft: `4px solid ${palette.main}` }}>
      <button onClick={onTogglePersona} className="persona-header">
        <PersonaAvatar name={persona} size={48} />
        <div className="text-left flex-1 min-w-0">
          <h2 className="persona-name">{persona}</h2>
          <p className="persona-meta">{urgentes} pendientes · {cerradas}/{total} cerradas {altas > 0 && <span className="urgent-pill"><Zap size={10}/>{altas} alta</span>}</p>
        </div>
        {expanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
      </button>

      {expanded && (
        <div className="persona-body">
          {empresasOrdenadas.map(empresa => (
            <EmpresaSection
              key={empresa}
              empresa={empresa}
              persona={persona}
              proyectos={dataByEmpresa[empresa]}
              expandedProyectos={expandedProyectos}
              onToggleProyecto={onToggleProyecto}
              onOpenTask={onOpenTask}
              onStatusChange={onStatusChange}
              draggingId={draggingId}
              setDraggingId={setDraggingId}
              saveStatus={saveStatus}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function EmpresaSection({ empresa, persona, proyectos, expandedProyectos, onToggleProyecto, onOpenTask, onStatusChange, draggingId, setDraggingId, saveStatus }) {
  const proyectosNombres = Object.keys(proyectos).sort();
  return (
    <div className="empresa-section">
      <div className="empresa-header">
        <CompanyLogo name={empresa} size={20} />
        <span className="empresa-name">{empresa}</span>
      </div>
      <div className="proyectos-grid">
        {proyectosNombres.map(proyecto => (
          <ProyectoMiniCard
            key={proyecto}
            proyecto={proyecto}
            tasks={proyectos[proyecto]}
            expanded={!!expandedProyectos[`${persona}::${empresa}::${proyecto}`]}
            onToggle={() => onToggleProyecto(`${persona}::${empresa}::${proyecto}`)}
            onOpenTask={onOpenTask}
            onStatusChange={onStatusChange}
            draggingId={draggingId}
            setDraggingId={setDraggingId}
            saveStatus={saveStatus}
          />
        ))}
      </div>
    </div>
  );
}

function ProyectoMiniCard({ proyecto, tasks, expanded, onToggle, onOpenTask, onStatusChange, draggingId, setDraggingId, saveStatus }) {
  const Icon = iconForProject(proyecto);
  const total = tasks.length;
  const pen = tasks.filter(t => t.estado === "Pendiente").length;
  const proc = tasks.filter(t => t.estado === "En proceso").length;
  const sub = tasks.filter(t => t.estado === "Subido").length;
  const term = tasks.filter(t => t.estado === "Terminado").length;
  const altas = tasks.filter(t => t.prioridad === "Alta" && t.estado !== "Terminado").length;

  return (
    <div className={`proyecto-card ${expanded ? "expanded" : ""}`}>
      <button onClick={onToggle} className="proyecto-header">
        <div className="proyecto-icon"><Icon size={18} /></div>
        <div className="proyecto-info">
          <div className="proyecto-name">{proyecto}</div>
          <div className="proyecto-stats">
            <span className="stat-pen">{pen}</span>
            <span className="stat-proc">{proc}</span>
            <span className="stat-sub">{sub}</span>
            <span className="stat-term">{term}</span>
            {altas > 0 && <span className="stat-alta"><Zap size={9}/>{altas}</span>}
          </div>
        </div>
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      {expanded && (
        <div className="proyecto-kanban">
          <ProjectKanban
            tasks={tasks}
            onOpen={onOpenTask}
            onStatusChange={onStatusChange}
            draggingId={draggingId}
            setDraggingId={setDraggingId}
            saveStatus={saveStatus}
          />
        </div>
      )}
    </div>
  );
}

function ProjectKanban({ tasks, onOpen, onStatusChange, draggingId, setDraggingId, saveStatus }) {
  return (
    <div className="kanban-grid">
      {ESTADOS.map(estado => (
        <KanbanColumn
          key={estado}
          status={estado}
          tasks={tasks.filter(t => t.estado === estado)}
          onDrop={(taskId) => onStatusChange(taskId, estado)}
          onOpen={onOpen}
          draggingId={draggingId}
          setDraggingId={setDraggingId}
          saveStatus={saveStatus}
        />
      ))}
    </div>
  );
}

function KanbanColumn({ status, tasks, onDrop, onOpen, draggingId, setDraggingId, saveStatus }) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`kanban-col kanban-col-${status.replace(/\s+/g, "-").toLowerCase()} ${over ? "over" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("text/plain");
        setOver(false);
        if (id) onDrop(id);
      }}
    >
      <div className="kanban-col-header">
        <span>{status}</span>
        <span className="kanban-count">{tasks.length}</span>
      </div>
      <div className="kanban-col-body">
        {tasks.length === 0 && <div className="kanban-empty">—</div>}
        {tasks.map(task => (
          <KanbanCard
            key={task.id}
            task={task}
            onOpen={onOpen}
            isDragging={draggingId === task.id}
            setDraggingId={setDraggingId}
            saveStatus={saveStatus[task.id]}
          />
        ))}
      </div>
    </div>
  );
}

function KanbanCard({ task, onOpen, isDragging, setDraggingId, saveStatus }) {
  const hasLinks = (task.links?.length || 0) > 0;
  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
        setDraggingId(task.id);
      }}
      onDragEnd={() => setDraggingId(null)}
      onClick={() => onOpen(task.id)}
      className={`kanban-card ${isDragging ? "dragging" : ""}`}
    >
      <div className="kanban-card-top">
        <PrioridadDot prioridad={task.prioridad} />
        <SaveDot status={saveStatus} />
      </div>
      <h4 className="kanban-card-title">{task.actividad}</h4>
      <div className="kanban-card-bottom">
        <span>{fechaCorta(task)}</span>
        <DeadlineBadge task={task} compact />
        {hasLinks && <span className="link-icon"><Link2 size={10}/>{task.links.length}</span>}
      </div>
    </article>
  );
}

function PrioridadDot({ prioridad }) {
  if (!prioridad) return null;
  const cls = `pri-dot pri-${prioridad.toLowerCase()}`;
  return <span className={cls} title={`Prioridad ${prioridad}`}></span>;
}

function PrioridadChip({ prioridad }) {
  if (!prioridad) return null;
  const cls = `pri-chip pri-chip-${prioridad.toLowerCase()}`;
  return <span className={cls}>{prioridad}</span>;
}

function EstadoChip({ estado }) {
  const cls = `est-chip est-${estado.replace(/\s+/g, "-").toLowerCase()}`;
  return <span className={cls}>{estado}</span>;
}

function DeadlineBadge({ task, compact = false }) {
  const d = daysUntil(task);
  const tone = d == null ? "deadline-gray" : d < 0 ? "deadline-red" : d <= 2 ? "deadline-orange" : "deadline-green";
  const label = d == null ? "—" : d === 0 ? "Hoy" : d > 0 ? `+${d}` : `${d}`;
  return <span className={`deadline-badge ${compact ? "deadline-c" : ""} ${tone}`}>{label}</span>;
}

function SaveDot({ status }) {
  if (!status || status === "idle") return null;
  if (status === "saving") return <span className="save-dot save-saving" title="Guardando…"><Clock size={9}/></span>;
  if (status === "saved")  return <span className="save-dot save-saved" title="Guardado"><CheckCircle2 size={9}/></span>;
  if (status === "error")  return <span className="save-dot save-error" title="Error"><AlertCircle size={9}/></span>;
  return null;
}

function SaveBadge({ status, errorMsg, onRetry }) {
  if (status === "saving") return <span className="badge-saving"><Clock size={12}/>Guardando…</span>;
  if (status === "saved") return <span className="badge-saved"><CheckCircle2 size={12}/>Guardado</span>;
  if (status === "error") return <button onClick={onRetry} className="badge-error" title={errorMsg || ""}><AlertCircle size={12}/>Error · reintentar</button>;
  return <span className="badge-idle">Listo</span>;
}

function GlobalSyncBadge({ status }) {
  return <span className={`g-sync g-sync-${status.type}`}>{status.text}</span>;
}

function Metric({ label, value }) {
  return (
    <div className="metric-card">
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

function ConfirmModal({ dialog }) {
  if (!dialog?.open) return null;
  return (
    <div className="confirm-overlay" onClick={dialog.onCancel}>
      <div className="confirm-box" onClick={e => e.stopPropagation()}>
        <div className="confirm-icon"><AlertCircle size={36} /></div>
        <h3 className="confirm-title">{dialog.title}</h3>
        <p className="confirm-msg">{dialog.message}</p>
        <div className="confirm-actions">
          <button onClick={dialog.onCancel} className="confirm-cancel">Cancelar</button>
          <button onClick={dialog.onConfirm} className={dialog.danger ? "confirm-danger" : "confirm-primary"}>{dialog.confirmLabel}</button>
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
      .yo-eyebrow { font-family: 'Montserrat', sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #888; }

      .brand-shell { background: linear-gradient(180deg, #FFFFFF 0%, #F7F4EF 100%); }

      /* Buttons */
      .yo-btn-primary { display: inline-flex; align-items: center; gap: 0.4rem; background: #000; color: #fff; padding: 0.5rem 0.9rem; font-size: 0.78rem; font-weight: 600; letter-spacing: 0.02em; transition: background 0.15s; }
      .yo-btn-primary:hover { background: #333; }
      .yo-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
      .yo-btn-secondary { display: inline-flex; align-items: center; gap: 0.4rem; background: #fff; color: #1a1a1a; padding: 0.5rem 0.9rem; font-size: 0.78rem; font-weight: 600; border: 1px solid #ddd; transition: background 0.15s; }
      .yo-btn-secondary:hover { background: #F3F3F3; }
      .yo-btn-danger { display: inline-flex; align-items: center; gap: 0.4rem; background: #fff; color: #b91c1c; padding: 0.5rem 0.9rem; font-size: 0.78rem; font-weight: 600; border: 1px solid #fca5a5; }
      .yo-btn-danger:hover { background: #fef2f2; }
      .btn-ghost { padding: 0.4rem 0.7rem; font-size: 0.78rem; font-weight: 600; color: #555; }
      .btn-ghost:hover { color: #000; background: #F3F3F3; }
      .yo-success { color: #15803d; font-weight: 600; }

      /* Cards */
      .yo-card { background: #FFFFFF; border: 1px solid #ECECEC; }
      .yo-header { background: #FFFFFF; border: 1px solid #ECECEC; padding: 0.85rem 1rem; }

      /* Inputs */
      .input { width: 100%; border: 1px solid #DDD; background: #FFF; padding: 0.5rem 0.65rem; font-size: 0.82rem; font-family: 'Montserrat', sans-serif; outline: none; }
      .input:focus { border-color: #000; }
      textarea.input { resize: vertical; min-height: 60px; }
      .field { display: block; }
      .field-label { display: block; font-size: 9px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #888; margin-bottom: 0.3rem; }

      /* Diagnostic banner */
      .diagnostic-banner { display: flex; gap: 0.7rem; align-items: flex-start; background: #FEF3C7; border-left: 4px solid #F59E0B; color: #92400E; padding: 0.85rem 1rem; font-size: 0.8rem; }

      /* Logos */
      .logo-placeholder { display: grid; place-items: center; background: linear-gradient(135deg, #1a1a1a 0%, #555 100%); color: #fff; font-weight: 800; letter-spacing: -0.04em; }

      /* Avatar */
      .persona-avatar { border-radius: 50%; object-fit: cover; }
      .persona-avatar-placeholder { display: grid; place-items: center; border-radius: 50%; color: #fff; font-weight: 800; letter-spacing: -0.04em; }

      /* Persona Card */
      .persona-card { background: #FFFFFF; border: 1px solid #ECECEC; overflow: hidden; }
      .persona-header { width: 100%; display: flex; align-items: center; gap: 0.85rem; padding: 1rem 1.1rem; background: #FFF; cursor: pointer; transition: background 0.15s; text-align: left; }
      .persona-header:hover { background: #FAFAFA; }
      .persona-name { font-family: 'Playfair Display', serif; font-size: 1.4rem; font-weight: 700; margin: 0; line-height: 1; }
      .persona-meta { font-size: 0.72rem; color: #777; margin-top: 0.2rem; display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
      .urgent-pill { display: inline-flex; align-items: center; gap: 0.15rem; background: #FEE2E2; color: #991B1B; padding: 0.1rem 0.4rem; font-weight: 700; font-size: 0.65rem; }
      .persona-body { padding: 0 1.1rem 1.1rem; }

      /* Empresa */
      .empresa-section { margin-top: 1rem; }
      .empresa-header { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0; border-bottom: 1px solid #ECECEC; margin-bottom: 0.6rem; }
      .empresa-name { font-family: 'Playfair Display', serif; font-size: 0.95rem; font-weight: 600; color: #1a1a1a; }

      /* Proyectos */
      .proyectos-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.5rem; }
      .proyecto-card { background: #FFF; border: 1px solid #E5E5E5; transition: border 0.15s; }
      .proyecto-card.expanded { grid-column: 1 / -1; border-color: #1a1a1a; }
      .proyecto-header { width: 100%; display: flex; align-items: center; gap: 0.6rem; padding: 0.7rem 0.85rem; cursor: pointer; text-align: left; transition: background 0.15s; }
      .proyecto-header:hover { background: #FAFAFA; }
      .proyecto-icon { display: grid; place-items: center; width: 32px; height: 32px; background: #F3F3F3; color: #1a1a1a; }
      .proyecto-info { flex: 1; min-width: 0; }
      .proyecto-name { font-size: 0.82rem; font-weight: 700; color: #1a1a1a; line-height: 1.2; margin-bottom: 0.18rem; }
      .proyecto-stats { display: flex; gap: 0.25rem; font-size: 0.65rem; font-weight: 700; }
      .proyecto-stats span { padding: 0.05rem 0.35rem; min-width: 18px; text-align: center; }
      .stat-pen { background: #F3F3F3; color: #555; }
      .stat-proc { background: #FEF3C7; color: #92400E; }
      .stat-sub { background: #DBEAFE; color: #1E40AF; }
      .stat-term { background: #D1FAE5; color: #065F46; }
      .stat-alta { background: #FEE2E2; color: #991B1B; display: inline-flex; align-items: center; gap: 0.1rem; }

      /* Kanban */
      .proyecto-kanban { padding: 0.6rem 0.85rem 0.85rem; border-top: 1px solid #ECECEC; background: #FAFAFA; }
      .kanban-grid { display: grid; grid-template-columns: repeat(4, minmax(150px, 1fr)); gap: 0.5rem; }
      @media (max-width: 768px) { .kanban-grid { grid-template-columns: 1fr; } }
      .kanban-col { background: #FFF; border: 1px solid #E5E5E5; min-height: 80px; transition: all 0.15s; }
      .kanban-col.over { border-color: #000; background: #F3F3F3; }
      .kanban-col-header { display: flex; justify-content: space-between; align-items: center; padding: 0.45rem 0.6rem; border-bottom: 1px solid #ECECEC; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #555; }
      .kanban-count { background: #F3F3F3; padding: 0.05rem 0.4rem; min-width: 20px; text-align: center; }
      .kanban-col-body { padding: 0.4rem; min-height: 50px; }
      .kanban-empty { font-size: 0.7rem; color: #BBB; text-align: center; padding: 0.6rem 0; }
      .kanban-card { background: #FFF; border: 1px solid #E5E5E5; padding: 0.5rem; margin-bottom: 0.35rem; cursor: grab; transition: all 0.12s; }
      .kanban-card:hover { border-color: #1a1a1a; transform: translateY(-1px); box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
      .kanban-card:active { cursor: grabbing; }
      .kanban-card.dragging { opacity: 0.4; }
      .kanban-card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.3rem; }
      .kanban-card-title { font-size: 0.77rem; font-weight: 700; color: #1a1a1a; line-height: 1.25; margin: 0 0 0.4rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .kanban-card-bottom { display: flex; justify-content: space-between; align-items: center; gap: 0.3rem; font-size: 0.65rem; color: #888; font-weight: 600; }

      /* Prioridad */
      .pri-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
      .pri-alta { background: #DC2626; }
      .pri-media { background: #F59E0B; }
      .pri-baja { background: #94A3B8; }
      .pri-chip { display: inline-flex; align-items: center; padding: 0.15rem 0.5rem; font-size: 0.65rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
      .pri-chip-alta { background: #FEE2E2; color: #991B1B; }
      .pri-chip-media { background: #FEF3C7; color: #92400E; }
      .pri-chip-baja { background: #F3F3F3; color: #555; }

      /* Estado */
      .est-chip { display: inline-flex; align-items: center; padding: 0.15rem 0.5rem; font-size: 0.65rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
      .est-pendiente { background: #F3F3F3; color: #555; }
      .est-en-proceso { background: #FEF3C7; color: #92400E; }
      .est-subido { background: #DBEAFE; color: #1E40AF; }
      .est-terminado { background: #D1FAE5; color: #065F46; }

      /* Deadline */
      .deadline-badge { display: inline-flex; align-items: center; padding: 0.12rem 0.4rem; font-size: 0.65rem; font-weight: 700; }
      .deadline-c { padding: 0.08rem 0.32rem; font-size: 0.6rem; }
      .deadline-red { background: #FEE2E2; color: #991B1B; }
      .deadline-orange { background: #FED7AA; color: #9A3412; }
      .deadline-green { background: #D1FAE5; color: #065F46; }
      .deadline-gray { background: #F3F3F3; color: #777; }

      /* Save indicators */
      .save-dot { display: inline-grid; place-items: center; width: 14px; height: 14px; }
      .save-saving { color: #92400E; animation: pulse 1s ease-in-out infinite; }
      .save-saved { color: #065F46; }
      .save-error { color: #991B1B; }
      @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }
      .badge-saving, .badge-saved, .badge-error, .badge-idle { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.35rem 0.7rem; font-size: 0.72rem; font-weight: 700; }
      .badge-saving { background: #FEF3C7; color: #92400E; }
      .badge-saved { background: #D1FAE5; color: #065F46; }
      .badge-error { background: #FEE2E2; color: #991B1B; cursor: pointer; }
      .badge-idle { background: #F3F3F3; color: #555; }
      .g-sync { font-weight: 600; }
      .g-sync-saving { color: #92400E; }
      .g-sync-saved { color: #065F46; }
      .g-sync-error { color: #991B1B; }
      .g-sync-idle { color: #888; }

      /* Link icon */
      .link-icon { display: inline-flex; align-items: center; gap: 0.15rem; background: #DBEAFE; color: #1E40AF; padding: 0.08rem 0.35rem; font-weight: 700; }

      /* Metric */
      .metric-card { background: #FFF; border: 1px solid #ECECEC; padding: 0.55rem 0.75rem; }
      .metric-value { font-family: 'Playfair Display', serif; font-size: 1.25rem; font-weight: 700; color: #1a1a1a; line-height: 1; }
      .metric-label { font-size: 9px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #888; margin-top: 0.15rem; }

      /* Confirm modal */
      .confirm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 9999; display: grid; place-items: center; padding: 1rem; animation: fade 0.15s; }
      .confirm-box { background: #FFF; padding: 1.75rem; max-width: 420px; width: 100%; box-shadow: 0 25px 60px rgba(0,0,0,0.25); }
      .confirm-icon { display: grid; place-items: center; color: #DC2626; margin-bottom: 0.5rem; }
      .confirm-title { font-family: 'Playfair Display', serif; font-size: 1.3rem; font-weight: 700; text-align: center; color: #1a1a1a; margin: 0 0 0.5rem; }
      .confirm-msg { font-size: 0.85rem; color: #555; text-align: center; margin: 0 0 1.25rem; line-height: 1.5; }
      .confirm-actions { display: flex; gap: 0.5rem; justify-content: center; }
      .confirm-cancel, .confirm-danger, .confirm-primary { padding: 0.6rem 1.2rem; font-weight: 700; font-size: 0.8rem; letter-spacing: 0.02em; }
      .confirm-cancel { background: #F3F3F3; color: #1a1a1a; }
      .confirm-cancel:hover { background: #E5E5E5; }
      .confirm-danger { background: #DC2626; color: #FFF; }
      .confirm-danger:hover { background: #991B1B; }
      .confirm-primary { background: #000; color: #FFF; }
      @keyframes fade { from { opacity: 0 } to { opacity: 1 } }
    `}</style>
  );
}
