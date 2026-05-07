import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ===================================================================
// CONFIGURACION DE INTEGRACION CON GOOGLE SHEETS (via Apps Script)
// ===================================================================
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxrc0lFolxwJQUF7wtPHNymf7AwNtsjVs08ivOl18veuqo-jkv4AkpwjZsGDX60ETph/exec";
const SHARED_SECRET = "aurum-2026-x9k7m4q2-secreto";
const DEBOUNCE_MS = 1500;            // espera tras dejar de escribir antes de guardar texto
const PROTECTION_MS = 60 * 1000;     // ventana donde el board ignora refresh remoto despues de un save local
const REFRESH_MS = 5 * 60 * 1000;    // re-fetch periodico de data.json
const SAVED_FLASH_MS = 1800;         // cuanto dura el badge "guardado" antes de desvanecerse

// Campos que SI escriben al Sheet (las demas se ignoran al sincronizar)
const SHEET_FIELDS = ["mes", "empresa", "proyecto", "responsable", "semana", "actividad", "entregable", "fecha", "estado", "observaciones"];

// Mapeo de campos del frontend → columnas del Sheet
const FIELD_TO_SHEET = {
  mesCompromiso: "mes",
};

const ESTADOS = ["Pendiente", "En proceso", "Subido", "Terminado"];
const EMPRESAS = ["Aurum Arquitectos", "YoDesarrollo"];
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MONTH_INDEX = MESES.reduce((acc, mes, index) => ({ ...acc, [mes]: index }), {});

const BRAND = { blue: "#2CB3FE", coral: "#FF5C5C", gray: "#D9D9D9", ink: "#0F172A" };

const PERSON_COLORS = {
  Alejandro: { main: BRAND.ink, soft: "#F4F8FB", mid: "#DDE7EF", text: BRAND.ink, accent: BRAND.blue },
  Alma: { main: "#1976A3", soft: "#EFFAFF", mid: "#BDEBFF", text: "#0B4F6C", accent: BRAND.blue },
  Sayri: { main: "#C84949", soft: "#FFF4F4", mid: "#FFD1D1", text: "#7F1D1D", accent: BRAND.coral },
  Mariana: { main: "#6B7280", soft: "#F7F7F7", mid: "#E5E7EB", text: "#374151", accent: BRAND.gray },
  "Sin responsable": { main: "#475569", soft: "#F8FAFC", mid: "#CBD5E1", text: "#334155", accent: "#64748B" }
};

const PROJECT_TONES = [
  { bg: "rgba(44, 179, 254, 0.075)", border: "rgba(44, 179, 254, 0.25)", chip: "rgba(44, 179, 254, 0.16)" },
  { bg: "rgba(255, 92, 92, 0.070)", border: "rgba(255, 92, 92, 0.24)", chip: "rgba(255, 92, 92, 0.15)" },
  { bg: "rgba(217, 217, 217, 0.25)", border: "rgba(148, 163, 184, 0.22)", chip: "rgba(217, 217, 217, 0.55)" },
  { bg: "rgba(15, 23, 42, 0.045)", border: "rgba(15, 23, 42, 0.13)", chip: "rgba(15, 23, 42, 0.08)" },
  { bg: "rgba(125, 211, 252, 0.12)", border: "rgba(56, 189, 248, 0.22)", chip: "rgba(186, 230, 253, 0.5)" }
];

const CACHE_KEY = "aurum-yodesarrollo-cache-v2";

// ===================================================================
// UTILIDADES
// ===================================================================
function todayStamp() { return new Date().toISOString().slice(0, 10); }
function makeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `T-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function normalizeUrl(url) {
  const trimmed = String(url || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
}
function statusTone(status) {
  if (status === "Terminado") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "Subido") return "bg-blue-50 text-blue-700 ring-blue-200";
  if (status === "En proceso") return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-slate-50 text-slate-600 ring-slate-200";
}
function emptyTask() {
  return { mes: "Abril", mesCompromiso: "Abril", fechaISO: "", empresa: "YoDesarrollo", proyecto: "", responsable: "", semana: "", actividad: "", entregable: "", fecha: "", estado: "Pendiente", observaciones: "", links: [] };
}
function personPalette(name) { return PERSON_COLORS[name] || PERSON_COLORS["Sin responsable"]; }
function hashText(text) { return String(text || "").split("").reduce((acc, c) => acc + c.charCodeAt(0), 0); }
function projectTone(project) { return PROJECT_TONES[hashText(project) % PROJECT_TONES.length]; }
function getDayNumber(fecha) { const m = String(fecha || "").match(/([0-9]{1,2})/); return m ? Number(m[1]) : null; }
function commitmentDate(task) {
  const day = getDayNumber(task.fecha);
  const mes = task.mesCompromiso || task.mes;
  const month = MONTH_INDEX[mes];
  if (day == null || month == null) return null;
  return new Date(new Date().getFullYear(), month, day);
}
function daysUntil(task) {
  const target = commitmentDate(task);
  if (!target) return null;
  const t = new Date();
  const startToday = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  return Math.round((target.getTime() - startToday.getTime()) / 86400000);
}
function deadlineText(task) {
  const d = daysUntil(task);
  if (d == null) return "Sin fecha";
  if (d === 0) return "Hoy";
  if (d > 0) return `+${d} dias`;
  return `${d} dias`;
}
function fechaCorta(task) {
  const mes = task.mesCompromiso || task.mes || "";
  const day = getDayNumber(task.fecha);
  const short = { Enero: "Ene", Febrero: "Feb", Marzo: "Mar", Abril: "Abr", Mayo: "May", Junio: "Jun", Julio: "Jul", Agosto: "Ago", Septiembre: "Sep", Octubre: "Oct", Noviembre: "Nov", Diciembre: "Dic" }[mes] || mes.slice(0, 3);
  return day ? `${short} ${day}` : task.fecha || "Sin fecha";
}
function urgencyScore(task) {
  if (task.estado === "Terminado") return 999999;
  const d = daysUntil(task);
  const sw = { Pendiente: 0, "En proceso": 0.15, Subido: 0.3 }[task.estado] ?? 0.5;
  return (d == null ? 9999 : d) + sw;
}
function timeAgo(date) {
  if (!date) return "—";
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return `hace ${diff}s`;
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return date.toLocaleString();
}

// ===================================================================
// API CLIENT (Apps Script)
// ===================================================================
async function apiCall(action, payload = {}) {
  const body = JSON.stringify({ secret: SHARED_SECRET, action, ...payload });
  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    body,
    // text/plain evita preflight CORS que Apps Script no maneja
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Error desconocido del Sheet");
  return data;
}

function patchToSheetFormat(patch) {
  const out = {};
  for (const k in patch) {
    const sheetKey = FIELD_TO_SHEET[k] || k;
    if (SHEET_FIELDS.includes(sheetKey)) {
      out[sheetKey] = patch[k];
    }
  }
  return out;
}

// ===================================================================
// COMPONENTE PRINCIPAL
// ===================================================================
export default function BoardControlAurumYoDesarrollo() {
  const [tasks, setTasks] = useState(() => {
    try { const c = localStorage.getItem(CACHE_KEY); return c ? JSON.parse(c) : []; } catch { return []; }
  });
  const [filters, setFilters] = useState({ empresa: "Todas", proyecto: "Todos", responsable: "Todos", estado: "Todos", search: "" });
  const [newTask, setNewTask] = useState(emptyTask());
  const [linkDraft, setLinkDraft] = useState({ label: "", url: "" });
  const [showForm, setShowForm] = useState(false);
  const [expandedPeople, setExpandedPeople] = useState({});
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);

  // Estado de save por tarea: { taskId: 'idle'|'saving'|'saved'|'error', taskId_err: string }
  const [saveStatus, setSaveStatus] = useState({});

  // Modal de confirmacion: { open, title, message, confirmLabel, onConfirm }
  const [confirmDialog, setConfirmDialog] = useState({ open: false });
  const askConfirm = useCallback((opts) => {
    return new Promise((resolve) => {
      setConfirmDialog({
        open: true,
        title: opts.title || "¿Estas seguro?",
        message: opts.message || "Esta accion no se puede deshacer.",
        confirmLabel: opts.confirmLabel || "Eliminar",
        danger: opts.danger !== false,
        onConfirm: () => { setConfirmDialog({ open: false }); resolve(true); },
        onCancel: () => { setConfirmDialog({ open: false }); resolve(false); },
      });
    });
  }, []);

  // Refs persistentes (no causan re-render)
  const pendingPatches = useRef({});      // { taskId: { campo: valor, ... } }
  const debounceTimers = useRef({});      // { taskId: timeoutId }
  const recentlyModified = useRef({});    // { taskId: timestamp_ms }
  const tasksRef = useRef(tasks);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);

  // -----------------------------------------------------------------
  // SINCRONIZACION CON DATA.JSON (lectura periodica del Sheet)
  // -----------------------------------------------------------------
  const loadFromRemote = useCallback(async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const base = import.meta.env.BASE_URL || "/";
      const url = `${base}data.json?t=${Date.now()}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const remote = Array.isArray(data) ? data : data.tasks;
      if (Array.isArray(remote)) {
        // Proteger tareas modificadas localmente en los ultimos PROTECTION_MS
        const now = Date.now();
        const merged = remote.map(remoteTask => {
          const lastMod = recentlyModified.current[remoteTask.id];
          if (lastMod && now - lastMod < PROTECTION_MS) {
            const local = tasksRef.current.find(t => t.id === remoteTask.id);
            return local || remoteTask;
          }
          return remoteTask;
        });
        setTasks(merged);
        setLastSync(new Date());
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(merged)); } catch {}
      }
    } catch (err) {
      setSyncError(err.message || "Error al sincronizar");
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    loadFromRemote();
    const id = setInterval(() => {
      // Si hay cambios pendientes, no refrescar para no pisar
      if (Object.keys(pendingPatches.current).length === 0) {
        loadFromRemote();
      }
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [loadFromRemote]);

  // -----------------------------------------------------------------
  // ESCRITURA AL SHEET (queue + debounce + flush)
  // -----------------------------------------------------------------
  const flushTask = useCallback(async (taskId) => {
    const patch = pendingPatches.current[taskId];
    if (!patch || Object.keys(patch).length === 0) return;

    const sheetPatch = patchToSheetFormat(patch);
    if (Object.keys(sheetPatch).length === 0) {
      delete pendingPatches.current[taskId];
      return;
    }

    // Limpiar antes de enviar (si llega otro cambio en vuelo, se vuelve a encolar)
    pendingPatches.current[taskId] = {};
    if (debounceTimers.current[taskId]) {
      clearTimeout(debounceTimers.current[taskId]);
      delete debounceTimers.current[taskId];
    }

    setSaveStatus(prev => ({ ...prev, [taskId]: "saving", [`${taskId}_err`]: null }));

    try {
      await apiCall("update", { id: taskId, patch: sheetPatch });
      recentlyModified.current[taskId] = Date.now();
      setSaveStatus(prev => ({ ...prev, [taskId]: "saved" }));
      setTimeout(() => {
        setSaveStatus(prev => {
          if (prev[taskId] !== "saved") return prev;
          return { ...prev, [taskId]: "idle" };
        });
      }, SAVED_FLASH_MS);
    } catch (err) {
      // Devolver al queue para reintento
      pendingPatches.current[taskId] = { ...sheetPatch, ...(pendingPatches.current[taskId] || {}) };
      setSaveStatus(prev => ({ ...prev, [taskId]: "error", [`${taskId}_err`]: err.message }));
    }
  }, []);

  const queueChange = useCallback((taskId, patch, immediate = false) => {
    pendingPatches.current[taskId] = { ...(pendingPatches.current[taskId] || {}), ...patch };

    if (immediate) {
      flushTask(taskId);
      return;
    }

    if (debounceTimers.current[taskId]) clearTimeout(debounceTimers.current[taskId]);
    debounceTimers.current[taskId] = setTimeout(() => flushTask(taskId), DEBOUNCE_MS);
  }, [flushTask]);

  const flushAll = useCallback(() => {
    Object.keys(pendingPatches.current).forEach(taskId => flushTask(taskId));
  }, [flushTask]);

  // Reintento automatico de tareas con error cada 30s
  useEffect(() => {
    const id = setInterval(() => {
      Object.entries(saveStatus).forEach(([taskId, status]) => {
        if (status === "error" && pendingPatches.current[taskId]) {
          flushTask(taskId);
        }
      });
    }, 30000);
    return () => clearInterval(id);
  }, [saveStatus, flushTask]);

  // Flush al cerrar la ventana / cambiar de tab
  useEffect(() => {
    const handler = () => flushAll();
    window.addEventListener("beforeunload", handler);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushAll();
    });
    return () => window.removeEventListener("beforeunload", handler);
  }, [flushAll]);

  // -----------------------------------------------------------------
  // OPERACIONES DE TAREAS (con auto-save al Sheet)
  // -----------------------------------------------------------------
  function updateTaskField(id, patch, immediate = false) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch, actualizado: todayStamp() } : t));
    queueChange(id, patch, immediate);
  }

  async function addTask() {
    if (!newTask.proyecto.trim() || !newTask.responsable.trim() || !newTask.actividad.trim()) return;
    const tempId = makeId();
    const tempTask = { ...newTask, id: tempId, creado: todayStamp(), actualizado: todayStamp(), links: [] };
    setTasks(prev => [tempTask, ...prev]);
    setNewTask(emptyTask());
    setShowForm(false);

    // Crear en el Sheet
    setSaveStatus(prev => ({ ...prev, [tempId]: "saving" }));
    try {
      const sheetTask = patchToSheetFormat({ ...tempTask, mesCompromiso: tempTask.mesCompromiso || tempTask.mes });
      const result = await apiCall("create", { task: sheetTask });
      // Reemplazar id temporal por el id real asignado por el Sheet
      setTasks(prev => prev.map(t => t.id === tempId ? { ...t, id: result.id } : t));
      recentlyModified.current[result.id] = Date.now();
      setSaveStatus(prev => {
        const next = { ...prev };
        delete next[tempId];
        next[result.id] = "saved";
        return next;
      });
      setTimeout(() => {
        setSaveStatus(prev => {
          if (prev[result.id] !== "saved") return prev;
          return { ...prev, [result.id]: "idle" };
        });
      }, SAVED_FLASH_MS);
      setSelectedTaskId(result.id);
    } catch (err) {
      setSaveStatus(prev => ({ ...prev, [tempId]: "error", [`${tempId}_err`]: err.message }));
      setSelectedTaskId(tempId);
    }
  }

  async function addLink(taskId) {
    const url = normalizeUrl(linkDraft.url);
    if (!url) return;
    const label = linkDraft.label?.trim() || "Evidencia";

    // Optimistic update local
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const link = { id: makeId(), label, url, fechaSubida: todayStamp(), responsable: t.responsable };
      const next = t.estado === "Pendiente" || t.estado === "En proceso" ? "Subido" : t.estado;
      return { ...t, links: [...(t.links || []), link], estado: next, actualizado: todayStamp() };
    }));
    setLinkDraft({ label: "", url: "" });

    setSaveStatus(prev => ({ ...prev, [taskId]: "saving" }));
    try {
      await apiCall("addLink", { id: taskId, url, label });
      // Si el estado cambio, tambien hay que actualizarlo en el Sheet
      const task = tasksRef.current.find(t => t.id === taskId);
      if (task && (task.estado === "Subido")) {
        await apiCall("update", { id: taskId, patch: { estado: "Subido" } });
      }
      recentlyModified.current[taskId] = Date.now();
      setSaveStatus(prev => ({ ...prev, [taskId]: "saved" }));
      setTimeout(() => {
        setSaveStatus(prev => prev[taskId] === "saved" ? { ...prev, [taskId]: "idle" } : prev);
      }, SAVED_FLASH_MS);
    } catch (err) {
      setSaveStatus(prev => ({ ...prev, [taskId]: "error", [`${taskId}_err`]: err.message }));
    }
  }

  async function removeLink(taskId, linkId) {
    const task = tasksRef.current.find(t => t.id === taskId);
    const link = task?.links?.find(l => l.id === linkId);
    if (!link) return;

    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, links: (t.links || []).filter(l => l.id !== linkId), actualizado: todayStamp() } : t));

    setSaveStatus(prev => ({ ...prev, [taskId]: "saving" }));
    try {
      await apiCall("removeLink", { id: taskId, url: link.url });
      recentlyModified.current[taskId] = Date.now();
      setSaveStatus(prev => ({ ...prev, [taskId]: "saved" }));
      setTimeout(() => {
        setSaveStatus(prev => prev[taskId] === "saved" ? { ...prev, [taskId]: "idle" } : prev);
      }, SAVED_FLASH_MS);
    } catch (err) {
      setSaveStatus(prev => ({ ...prev, [taskId]: "error", [`${taskId}_err`]: err.message }));
    }
  }

  async function deleteTask(taskId) {
    const task = tasksRef.current.find(t => t.id === taskId);
    const ok = await askConfirm({
      title: "Eliminar tarea",
      message: `Vas a eliminar la tarea "${task?.actividad || taskId}" del Sheet. Esta accion es definitiva y no se puede deshacer.`,
      confirmLabel: "Si, eliminar",
      danger: true,
    });
    if (!ok) return;

    const backup = task;
    setTasks(prev => prev.filter(t => t.id !== taskId));
    setSelectedTaskId(null);

    try {
      await apiCall("delete", { id: taskId });
      delete recentlyModified.current[taskId];
    } catch (err) {
      // Restaurar si falla
      if (backup) setTasks(prev => [backup, ...prev]);
      alert("No se pudo eliminar del Sheet: " + err.message);
    }
  }

  async function removeLinkConfirm(taskId, linkId) {
    const task = tasksRef.current.find(t => t.id === taskId);
    const link = task?.links?.find(l => l.id === linkId);
    const ok = await askConfirm({
      title: "Eliminar evidencia",
      message: `Vas a quitar el link "${link?.label || ""}" de esta tarea. Esta accion es definitiva.`,
      confirmLabel: "Si, eliminar",
      danger: true,
    });
    if (!ok) return;
    removeLink(taskId, linkId);
  }

  function closeSubboard() {
    if (selectedTaskId) flushTask(selectedTaskId);
    setSelectedTaskId(null);
  }

  // -----------------------------------------------------------------
  // DERIVADOS
  // -----------------------------------------------------------------
  const projects = useMemo(() => ["Todos", ...Array.from(new Set(tasks.map(t => t.proyecto).filter(Boolean))).sort()], [tasks]);
  const responsables = useMemo(() => ["Todos", ...Array.from(new Set(tasks.map(t => t.responsable).filter(Boolean))).sort()], [tasks]);

  const filteredTasks = useMemo(() => {
    const term = filters.search.trim().toLowerCase();
    return tasks.filter(t => {
      const e = filters.empresa === "Todas" || t.empresa === filters.empresa;
      const p = filters.proyecto === "Todos" || t.proyecto === filters.proyecto;
      const r = filters.responsable === "Todos" || t.responsable === filters.responsable;
      const s = filters.estado === "Todos" || t.estado === filters.estado;
      const hay = `${t.empresa} ${t.proyecto} ${t.responsable} ${t.actividad} ${t.entregable} ${t.fecha} ${t.observaciones}`.toLowerCase();
      return e && p && r && s && (!term || hay.includes(term));
    });
  }, [tasks, filters]);

  const groupedByPerson = useMemo(() => {
    const grouped = filteredTasks.reduce((acc, task) => {
      const k = task.responsable || "Sin responsable";
      if (!acc[k]) acc[k] = [];
      acc[k].push(task);
      return acc;
    }, {});
    return Object.entries(grouped)
      .map(([responsable, list]) => ({
        responsable,
        list: [...list].sort((a, b) => urgencyScore(a) - urgencyScore(b) || String(a.proyecto).localeCompare(String(b.proyecto)))
      }))
      .sort((a, b) => {
        const order = ["Alejandro", "Alma", "Sayri", "Mariana"];
        const ai = order.indexOf(a.responsable);
        const bi = order.indexOf(b.responsable);
        if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        return a.responsable.localeCompare(b.responsable);
      });
  }, [filteredTasks]);

  const metrics = useMemo(() => {
    const total = filteredTasks.length;
    const terminado = filteredTasks.filter(t => t.estado === "Terminado").length;
    const subido = filteredTasks.filter(t => t.estado === "Subido").length;
    const pendiente = filteredTasks.filter(t => t.estado === "Pendiente").length;
    const evidencias = filteredTasks.reduce((s, t) => s + (t.links?.length || 0), 0);
    const avance = total ? Math.round((terminado / total) * 100) : 0;
    return { total, terminado, subido, pendiente, evidencias, avance };
  }, [filteredTasks]);

  const selectedTask = useMemo(() => tasks.find(t => t.id === selectedTaskId) || null, [tasks, selectedTaskId]);

  const globalSyncStatus = useMemo(() => {
    const errors = Object.entries(saveStatus).filter(([k, v]) => v === "error" && !k.endsWith("_err")).length;
    const saving = Object.entries(saveStatus).filter(([k, v]) => v === "saving" && !k.endsWith("_err")).length;
    const saved = Object.entries(saveStatus).filter(([k, v]) => v === "saved" && !k.endsWith("_err")).length;
    if (errors > 0) return { type: "error", text: `${errors} con error · reintentando` };
    if (saving > 0) return { type: "saving", text: `Guardando ${saving} cambio${saving > 1 ? "s" : ""}...` };
    if (saved > 0) return { type: "saved", text: "Cambios guardados" };
    return { type: "idle", text: `Ultima lectura ${timeAgo(lastSync)}` };
  }, [saveStatus, lastSync]);

  // -----------------------------------------------------------------
  // RENDER: SUBBOARD DE UNA TAREA
  // -----------------------------------------------------------------
  if (selectedTask) {
    const palette = personPalette(selectedTask.responsable);
    const tone = projectTone(selectedTask.proyecto);
    const status = saveStatus[selectedTask.id];
    const errMsg = saveStatus[`${selectedTask.id}_err`];

    return (
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <div className="mx-auto max-w-5xl px-4 py-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <button onClick={closeSubboard} className="btn-ghost">← Regresar al board</button>
            <SaveBadge status={status} errorMsg={errMsg} onRetry={() => flushTask(selectedTask.id)} />
          </div>

          <header className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200" style={{ borderTop: `8px solid ${palette.main}` }}>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Subboard de tarea</span>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-black ring-1 ${statusTone(selectedTask.estado)}`}>{selectedTask.estado}</span>
                  <span className="rounded-full px-2 py-1 text-[11px] font-black" style={{ background: tone.chip, color: palette.text }}>{selectedTask.proyecto}</span>
                  <DeadlineBadge task={selectedTask} />
                </div>
                <h1 className="mt-2 text-2xl font-black tracking-tight">{selectedTask.actividad}</h1>
                <p className="mt-1 text-sm text-slate-500">{selectedTask.proyecto} · {selectedTask.responsable}</p>
                <p className="mt-1 text-xs text-emerald-700">Cada cambio se guarda automaticamente en el Sheet.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => updateTaskField(selectedTask.id, { estado: "Terminado" }, true)} className="btn-primary">Marcar terminado</button>
                <button onClick={() => deleteTask(selectedTask.id)} className="btn-danger">Eliminar</button>
              </div>
            </div>
          </header>

          <main className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
            <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Datos de la tarea</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
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
                <Field label="Mes compromiso">
                  <select className="input" value={selectedTask.mesCompromiso || selectedTask.mes || "Abril"} onChange={e => updateTaskField(selectedTask.id, { mesCompromiso: e.target.value, mes: e.target.value }, true)}>
                    {MESES.map(mes => <option key={mes}>{mes}</option>)}
                  </select>
                </Field>
                <Field label="Fecha compromiso">
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
              </div>

              <div className="mt-4 grid gap-3">
                <Field label="Actividad">
                  <textarea className="input min-h-[80px] resize-none" value={selectedTask.actividad || ""} onChange={e => updateTaskField(selectedTask.id, { actividad: e.target.value })} />
                </Field>
                <Field label="Entregable esperado">
                  <textarea className="input min-h-[80px] resize-none" value={selectedTask.entregable || ""} onChange={e => updateTaskField(selectedTask.id, { entregable: e.target.value })} />
                </Field>
                <Field label="Observaciones">
                  <textarea className="input min-h-[120px] resize-none" value={selectedTask.observaciones || ""} onChange={e => updateTaskField(selectedTask.id, { observaciones: e.target.value })} placeholder="Notas, pendientes, bloqueos o instrucciones..." />
                </Field>
              </div>
            </section>

            <aside className="space-y-5">
              <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Links de evidencia</h2>
                <div className="mt-4 space-y-2">
                  {(selectedTask.links || []).length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-400">Sin archivos registrados.</p>}
                  {(selectedTask.links || []).map(link => (
                    <div key={link.id} className="rounded-2xl border border-slate-200 p-3">
                      <a href={link.url} target="_blank" rel="noreferrer" className="block text-sm font-bold text-blue-700 hover:underline break-all">{link.label}</a>
                      <div className="mt-1 text-xs text-slate-400 break-all">{link.url}</div>
                      <button onClick={() => removeLinkConfirm(selectedTask.id, link.id)} className="mt-2 text-xs font-bold text-red-500 hover:text-red-700">Eliminar link</button>
                    </div>
                  ))}
                </div>
                <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                  <input className="input" value={linkDraft.label} onChange={e => setLinkDraft({ ...linkDraft, label: e.target.value })} placeholder="Nombre del archivo" />
                  <input className="input" value={linkDraft.url} onChange={e => setLinkDraft({ ...linkDraft, url: e.target.value })} placeholder="Pegar link de Drive" />
                  <button onClick={() => addLink(selectedTask.id)} className="btn-primary w-full">Guardar link</button>
                </div>
              </section>

              <section className="rounded-3xl p-5 text-white shadow-sm" style={{ background: palette.main }}>
                <h2 className="text-sm font-black uppercase tracking-wide text-white/70">Resumen</h2>
                <div className="mt-4 space-y-3 text-sm">
                  <SummaryLine label="ID" value={selectedTask.id} />
                  <SummaryLine label="Empresa" value={selectedTask.empresa} />
                  <SummaryLine label="Proyecto" value={selectedTask.proyecto} />
                  <SummaryLine label="Responsable" value={selectedTask.responsable} />
                  <SummaryLine label="Dias al cierre" value={deadlineText(selectedTask)} />
                  <SummaryLine label="Evidencias" value={(selectedTask.links || []).length} />
                </div>
              </section>
            </aside>
          </main>
        </div>
        <GlobalStyles />
        <ConfirmModal dialog={confirmDialog} />
      </div>
    );
  }

  // -----------------------------------------------------------------
  // RENDER: BOARD PRINCIPAL
  // -----------------------------------------------------------------
  return (
    <div className="brand-shell min-h-screen text-slate-900">
      <div className="mx-auto max-w-[1760px] px-2.5 py-3">
        <header className="brand-header mb-2 rounded-[1.1rem] bg-white/92 p-3 shadow-sm ring-1 ring-slate-200/70 backdrop-blur">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="brand-mark">YO</div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Aurum Arquitectos · YoDesarrollo</p>
                  <h1 className="mt-0.5 text-lg font-black tracking-tight">Board operativo de actividades</h1>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                    <GlobalSyncBadge status={globalSyncStatus} />
                    {syncError && <span className="ml-1 text-red-500">· error lectura: {syncError}</span>}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={loadFromRemote} className="btn-secondary" disabled={syncing} title="Forzar lectura desde data.json">{syncing ? "…" : "↻"}</button>
              <button onClick={() => setShowForm(v => !v)} className="btn-primary">+ Tarea</button>
            </div>
          </div>
        </header>

        <section className="mb-2 grid grid-cols-6 gap-1">
          <MiniMetric label="Total" value={metrics.total} />
          <MiniMetric label="Pend." value={metrics.pendiente} />
          <MiniMetric label="Subidas" value={metrics.subido} />
          <MiniMetric label="Term." value={metrics.terminado} />
          <MiniMetric label="Links" value={metrics.evidencias} />
          <MiniMetric label="Avance" value={`${metrics.avance}%`} />
        </section>

        {showForm && (
          <section className="mb-3 rounded-[1.35rem] bg-white/95 p-3 shadow-sm ring-1 ring-slate-200">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Nueva tarea (se crea en el Sheet)</h2>
              <button onClick={() => setShowForm(false)} className="btn-ghost">Cerrar</button>
            </div>
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
              <Field label="Empresa"><select value={newTask.empresa} onChange={e => setNewTask({ ...newTask, empresa: e.target.value })} className="input">{EMPRESAS.map(e => <option key={e}>{e}</option>)}</select></Field>
              <Field label="Proyecto"><input className="input" value={newTask.proyecto} onChange={e => setNewTask({ ...newTask, proyecto: e.target.value })} placeholder="Ej. Real Miramar" /></Field>
              <Field label="Responsable"><input className="input" value={newTask.responsable} onChange={e => setNewTask({ ...newTask, responsable: e.target.value })} placeholder="Ej. Mariana" /></Field>
              <Field label="Mes compromiso"><select className="input" value={newTask.mesCompromiso} onChange={e => setNewTask({ ...newTask, mesCompromiso: e.target.value, mes: e.target.value })}>{MESES.map(mes => <option key={mes}>{mes}</option>)}</select></Field>
              <Field label="Fecha"><input className="input" value={newTask.fecha} onChange={e => setNewTask({ ...newTask, fecha: e.target.value })} placeholder="Viernes 1" /></Field>
              <Field label="Semana"><input className="input" value={newTask.semana} onChange={e => setNewTask({ ...newTask, semana: e.target.value })} placeholder="3" /></Field>
              <Field label="Actividad"><input className="input" value={newTask.actividad} onChange={e => setNewTask({ ...newTask, actividad: e.target.value })} placeholder="Pendiente concreto" /></Field>
              <Field label="Entregable"><input className="input" value={newTask.entregable} onChange={e => setNewTask({ ...newTask, entregable: e.target.value })} placeholder="PDF, minuta, sheet..." /></Field>
              <Field label="Estado"><select className="input" value={newTask.estado} onChange={e => setNewTask({ ...newTask, estado: e.target.value })}>{ESTADOS.map(s => <option key={s}>{s}</option>)}</select></Field>
            </div>
            <div className="mt-3 flex justify-end">
              <button onClick={addTask} className="btn-primary">Crear y guardar en Sheet</button>
            </div>
          </section>
        )}

        <section className="mb-2 overflow-x-auto rounded-[1.1rem] bg-white/95 p-2 shadow-sm ring-1 ring-slate-200">
          <div className="filter-row">
            <Field label="Empresa"><select className="input" value={filters.empresa} onChange={e => setFilters({ ...filters, empresa: e.target.value })}><option>Todas</option>{EMPRESAS.map(e => <option key={e}>{e}</option>)}</select></Field>
            <Field label="Proyecto"><select className="input" value={filters.proyecto} onChange={e => setFilters({ ...filters, proyecto: e.target.value })}>{projects.map(p => <option key={p}>{p}</option>)}</select></Field>
            <Field label="Responsable"><select className="input" value={filters.responsable} onChange={e => setFilters({ ...filters, responsable: e.target.value })}>{responsables.map(r => <option key={r}>{r}</option>)}</select></Field>
            <Field label="Estado"><select className="input" value={filters.estado} onChange={e => setFilters({ ...filters, estado: e.target.value })}><option>Todos</option>{ESTADOS.map(s => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Buscar"><input className="input" value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} placeholder="Buscar tarea..." /></Field>
          </div>
        </section>

        <main className="responsables-grid">
          {groupedByPerson.map(group => (
            <PersonVisualCard
              key={group.responsable}
              responsable={group.responsable}
              tasks={group.list}
              expanded={!!expandedPeople[group.responsable]}
              onToggle={() => setExpandedPeople(prev => ({ ...prev, [group.responsable]: !prev[group.responsable] }))}
              onOpen={setSelectedTaskId}
              onStatus={(id, estado) => updateTaskField(id, { estado }, true)}
              saveStatus={saveStatus}
            />
          ))}

          {groupedByPerson.length === 0 && (
            <div className="col-span-full rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
              {tasks.length === 0
                ? (syncError ? `No pude leer data.json (${syncError})` : "Cargando tareas desde el Sheet...")
                : "No hay tareas con los filtros actuales."}
            </div>
          )}
        </main>
      </div>
      <GlobalStyles />
      <ConfirmModal dialog={confirmDialog} />
    </div>
  );
}

function ConfirmModal({ dialog }) {
  if (!dialog?.open) return null;
  return (
    <div className="confirm-overlay" onClick={dialog.onCancel}>
      <div className="confirm-box" onClick={e => e.stopPropagation()}>
        <div className="confirm-icon">⚠</div>
        <h3 className="confirm-title">{dialog.title}</h3>
        <p className="confirm-msg">{dialog.message}</p>
        <div className="confirm-actions">
          <button onClick={dialog.onCancel} className="confirm-btn-cancel">Cancelar</button>
          <button onClick={dialog.onConfirm} className={dialog.danger ? "confirm-btn-danger" : "confirm-btn-primary"}>
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===================================================================
// COMPONENTES AUXILIARES
// ===================================================================
function PersonVisualCard({ responsable, tasks, expanded, onToggle, onOpen, onStatus, saveStatus }) {
  const palette = personPalette(responsable);
  const total = tasks.length;
  const done = tasks.filter(t => t.estado === "Terminado").length;
  const urgent = tasks.filter(t => t.estado !== "Terminado");
  const visibleTasks = expanded ? tasks : urgent.slice(0, 3);
  const percent = total ? Math.round((done / total) * 100) : 0;
  const initials = responsable.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();

  return (
    <section className="person-card overflow-hidden rounded-[1rem] bg-white/96 shadow-sm ring-1 ring-slate-200/80" style={{ borderTop: `4px solid ${palette.accent}` }}>
      <div className="p-2.5" style={{ background: `linear-gradient(135deg, ${palette.soft}, #ffffff 62%)` }}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[10px] font-black text-white shadow-sm" style={{ background: palette.main }}>{initials}</div>
            <div className="min-w-0">
              <h2 className="truncate text-[13px] font-black" style={{ color: palette.text }}>{responsable}</h2>
              <p className="text-[9px] font-bold text-slate-500">{urgent.length} urg. · {done}/{total} cerr.</p>
            </div>
          </div>
          <span className="rounded-full px-1.5 py-0.5 text-[10px] font-black" style={{ background: palette.mid, color: palette.text }}>{percent}%</span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/80 ring-1 ring-slate-200/70">
          <div className="h-full rounded-full" style={{ width: `${percent}%`, background: palette.main }} />
        </div>
      </div>
      <div className="space-y-1 p-2">
        {visibleTasks.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">Sin pendientes urgentes.</div>}
        {visibleTasks.map(task => <VisualTaskRow key={task.id} task={task} palette={palette} onOpen={onOpen} onStatus={onStatus} saveStatus={saveStatus[task.id]} />)}
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 px-2 py-1.5">
        <button onClick={onToggle} className="btn-ghost">{expanded ? "Ver solo 3" : `Ver mas (${Math.max(total - visibleTasks.length, 0)})`}</button>
        <span className="text-[10px] font-bold text-slate-400">Click = detalle</span>
      </div>
    </section>
  );
}

function VisualTaskRow({ task, palette, onOpen, onStatus, saveStatus }) {
  const tone = projectTone(task.proyecto);
  const hasLinks = (task.links?.length || 0) > 0;
  return (
    <article
      onClick={() => onOpen(task.id)}
      className={`group cursor-pointer rounded-lg border p-1.5 transition hover:-translate-y-0.5 hover:shadow-md ${hasLinks ? "task-has-links" : ""}`}
      style={{
        background: hasLinks ? `linear-gradient(135deg, rgba(44,179,254,0.18), rgba(255,255,255,0.92) 48%, ${tone.bg})` : tone.bg,
        borderColor: hasLinks ? "rgba(44, 179, 254, 0.72)" : tone.border,
        boxShadow: hasLinks ? "0 8px 22px rgba(44,179,254,0.13), inset 0 0 0 1px rgba(44,179,254,0.18)" : undefined
      }}
    >
      <div className="mb-1 flex items-start justify-between gap-1">
        <span className="max-w-[92px] truncate rounded-full px-1.5 py-0.5 text-[8px] font-black" style={{ background: tone.chip, color: palette.text }}>{task.proyecto}</span>
        <div className="flex items-center gap-1">
          {saveStatus === "saving" && <span className="save-dot save-dot-saving" title="Guardando">●</span>}
          {saveStatus === "saved" && <span className="save-dot save-dot-saved" title="Guardado">✓</span>}
          {saveStatus === "error" && <span className="save-dot save-dot-error" title="Error al guardar">!</span>}
          {hasLinks && <span className="link-evidence-dot" title="Tiene link de evidencia">●</span>}
          <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-black ring-1 ${statusTone(task.estado)}`}>{task.estado}</span>
        </div>
      </div>
      <h3 className="line-clamp-2 text-[11px] font-black leading-tight text-slate-900">{task.actividad}</h3>
      <div className="mt-1 flex items-center justify-between gap-1 text-[9px] font-semibold text-slate-500">
        <span>{fechaCorta(task)}</span>
        <DeadlineBadge task={task} compact />
        <span className={hasLinks ? "links-counter-active" : ""}>{task.links?.length || 0} links</span>
      </div>
      <div className="mt-1 flex items-center gap-1" onClick={e => e.stopPropagation()}>
        <select value={task.estado} onChange={e => onStatus(task.id, e.target.value)} className="compact-status">{ESTADOS.map(s => <option key={s}>{s}</option>)}</select>
        <button onClick={() => onOpen(task.id)} className="mini-open" style={{ color: palette.main }}>Abrir</button>
      </div>
    </article>
  );
}

function SaveBadge({ status, errorMsg, onRetry }) {
  if (status === "saving") return <span className="badge-saving">⟳ Guardando...</span>;
  if (status === "saved") return <span className="badge-saved">✓ Guardado</span>;
  if (status === "error") return (
    <button onClick={onRetry} className="badge-error" title={errorMsg || ""}>! Error · click para reintentar</button>
  );
  return <span className="badge-idle">Listo</span>;
}

function GlobalSyncBadge({ status }) {
  return <span className={`global-sync global-sync-${status.type}`}>{status.text}</span>;
}

function DeadlineBadge({ task, compact = false }) {
  const d = daysUntil(task);
  const tone = d == null ? "deadline-gray" : d < 0 ? "deadline-red" : "deadline-green";
  const label = d == null ? "Sin fecha" : d === 0 ? "Hoy" : d > 0 ? `+${d}` : String(d);
  return <span className={`deadline-badge ${compact ? "deadline-compact" : ""} ${tone}`} title={`Dias al cierre: ${deadlineText(task)}`}>{label}</span>;
}
function MiniMetric({ label, value }) {
  return (
    <div className="rounded-lg bg-white/95 px-2 py-1 shadow-sm ring-1 ring-slate-200/80">
      <div className="text-sm font-black tracking-tight">{value}</div>
      <div className="text-[8px] font-black uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}
function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  );
}
function SummaryLine({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-2 last:border-0 last:pb-0">
      <span className="text-white/60">{label}</span>
      <span className="text-right font-bold">{value}</span>
    </div>
  );
}
function GlobalStyles() {
  return (
    <style>{`
      .filter-row { display: grid; grid-template-columns: minmax(115px, 0.75fr) minmax(140px, 1fr) minmax(120px, 0.8fr) minmax(105px, 0.65fr) minmax(190px, 1.2fr); gap: 0.35rem; align-items: end; min-width: 710px; }
      .input { width: 100%; border-radius: 0.7rem; border: 1px solid rgb(203 213 225); background: white; padding: 0.34rem 0.48rem; font-size: 0.72rem; outline: none; }
      .input:focus { border-color: rgb(15 23 42); box-shadow: 0 0 0 3px rgba(15,23,42,0.06); }
      .btn-primary { border-radius: 999px; background: rgb(15 23 42); padding: 0.35rem 0.58rem; font-size: 0.66rem; font-weight: 900; color: white; line-height: 1; }
      .btn-primary:hover { background: rgb(51 65 85); }
      .btn-secondary { border-radius: 999px; background: white; padding: 0.35rem 0.58rem; font-size: 0.66rem; font-weight: 900; color: rgb(51 65 85); line-height: 1; box-shadow: inset 0 0 0 1px rgb(203 213 225); }
      .btn-secondary:hover { background: rgb(248 250 252); }
      .btn-ghost { border-radius: 999px; padding: 0.3rem 0.48rem; font-size: 0.66rem; font-weight: 900; color: rgb(100 116 139); line-height: 1; }
      .btn-ghost:hover { background: rgb(241 245 249); color: rgb(15 23 42); }
      .btn-danger { border-radius: 999px; background: rgb(254 242 242); padding: 0.45rem 0.75rem; font-size: 0.75rem; font-weight: 900; color: rgb(185 28 28); line-height: 1; }
      .btn-danger:hover { background: rgb(254 226 226); }
      .task-has-links { position: relative; }
      .task-has-links::before { content: ""; position: absolute; inset: 0; border-radius: 0.5rem; border-left: 4px solid #2CB3FE; pointer-events: none; }
      .link-evidence-dot { color: #2CB3FE; font-size: 0.72rem; line-height: 1; filter: drop-shadow(0 0 4px rgba(44,179,254,0.45)); }
      .links-counter-active { border-radius: 999px; background: rgba(44,179,254,0.16); color: #0369A1; padding: 0.12rem 0.32rem; font-weight: 1000; }
      .deadline-badge { display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; padding: 0.25rem 0.48rem; font-size: 0.68rem; font-weight: 1000; line-height: 1; box-shadow: inset 0 0 0 1px currentColor; }
      .deadline-compact { padding: 0.18rem 0.36rem; font-size: 0.55rem; }
      .deadline-red { background: rgb(254 242 242); color: rgb(185 28 28); }
      .deadline-green { background: rgb(240 253 244); color: rgb(21 128 61); }
      .deadline-gray { background: rgb(248 250 252); color: rgb(100 116 139); }
      .compact-status { min-width: 82px; flex: 1; border-radius: 999px; border: 1px solid rgb(203 213 225); background: white; padding: 0.26rem 0.34rem; font-size: 0.58rem; font-weight: 900; color: rgb(51 65 85); outline: none; }
      .mini-open { border-radius: 999px; background: white; padding: 0.27rem 0.4rem; font-size: 0.58rem; font-weight: 900; box-shadow: inset 0 0 0 1px rgb(226 232 240); }
      .mini-open:hover { background: rgb(248 250 252); }
      .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .brand-shell { background: radial-gradient(circle at 10% 0%, rgba(44,179,254,0.14), transparent 26%), radial-gradient(circle at 94% 10%, rgba(255,92,92,0.10), transparent 25%), linear-gradient(180deg, #ffffff 0%, #f7fafc 38%, #eef2f7 100%); }
      .brand-header { border-top: 4px solid #2CB3FE; }
      .brand-mark { display: grid; place-items: center; width: 1.75rem; height: 1.75rem; border-radius: 0.65rem; background: linear-gradient(135deg, #2CB3FE, #FF5C5C); color: white; font-size: 0.68rem; font-weight: 1000; letter-spacing: -0.06em; box-shadow: 0 10px 20px rgba(44,179,254,0.16); }
      .responsables-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.5rem; }
      .person-card { min-height: 270px; }
      @media (max-width: 1120px) { .responsables-grid { overflow-x: auto; grid-template-columns: repeat(4, minmax(230px, 1fr)); padding-bottom: 0.25rem; } }
      @media (min-width: 1400px) { .person-card { min-height: 280px; } }
      .save-dot { display: inline-grid; place-items: center; width: 0.85rem; height: 0.85rem; border-radius: 999px; font-size: 0.55rem; font-weight: 900; line-height: 1; }
      .save-dot-saving { background: rgb(254 243 199); color: rgb(120 53 15); animation: pulse-saving 1s ease-in-out infinite; }
      .save-dot-saved { background: rgb(220 252 231); color: rgb(22 101 52); }
      .save-dot-error { background: rgb(254 226 226); color: rgb(153 27 27); }
      @keyframes pulse-saving { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
      .badge-saving { display: inline-flex; align-items: center; border-radius: 999px; background: rgb(254 243 199); color: rgb(120 53 15); padding: 0.3rem 0.7rem; font-size: 0.7rem; font-weight: 900; }
      .badge-saved { display: inline-flex; align-items: center; border-radius: 999px; background: rgb(220 252 231); color: rgb(22 101 52); padding: 0.3rem 0.7rem; font-size: 0.7rem; font-weight: 900; }
      .badge-error { display: inline-flex; align-items: center; border-radius: 999px; background: rgb(254 226 226); color: rgb(153 27 27); padding: 0.3rem 0.7rem; font-size: 0.7rem; font-weight: 900; cursor: pointer; }
      .badge-idle { display: inline-flex; align-items: center; border-radius: 999px; background: rgb(241 245 249); color: rgb(100 116 139); padding: 0.3rem 0.7rem; font-size: 0.7rem; font-weight: 900; }
      .global-sync { display: inline-flex; align-items: center; gap: 0.3rem; }
      .global-sync-saving { color: rgb(120 53 15); }
      .global-sync-saved { color: rgb(22 101 52); }
      .global-sync-error { color: rgb(153 27 27); }
      .global-sync-idle { color: rgb(100 116 139); }
      .confirm-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.55); backdrop-filter: blur(4px); z-index: 9999; display: grid; place-items: center; padding: 1rem; animation: confirm-fade 0.15s ease-out; }
      .confirm-box { background: white; border-radius: 1.25rem; padding: 1.75rem; max-width: 420px; width: 100%; box-shadow: 0 25px 60px rgba(0,0,0,0.25); animation: confirm-pop 0.18s ease-out; }
      .confirm-icon { font-size: 2.5rem; text-align: center; margin-bottom: 0.5rem; }
      .confirm-title { font-size: 1.15rem; font-weight: 900; text-align: center; color: rgb(15 23 42); margin: 0 0 0.5rem; }
      .confirm-msg { font-size: 0.85rem; color: rgb(71 85 105); text-align: center; margin: 0 0 1.25rem; line-height: 1.45; }
      .confirm-actions { display: flex; gap: 0.5rem; justify-content: center; }
      .confirm-btn-cancel { padding: 0.55rem 1.1rem; border-radius: 999px; background: rgb(241 245 249); color: rgb(51 65 85); font-weight: 800; font-size: 0.8rem; }
      .confirm-btn-cancel:hover { background: rgb(226 232 240); }
      .confirm-btn-danger { padding: 0.55rem 1.1rem; border-radius: 999px; background: rgb(220 38 38); color: white; font-weight: 800; font-size: 0.8rem; }
      .confirm-btn-danger:hover { background: rgb(185 28 28); }
      .confirm-btn-primary { padding: 0.55rem 1.1rem; border-radius: 999px; background: rgb(15 23 42); color: white; font-weight: 800; font-size: 0.8rem; }
      .confirm-btn-primary:hover { background: rgb(51 65 85); }
      @keyframes confirm-fade { from { opacity: 0; } to { opacity: 1; } }
      @keyframes confirm-pop { from { opacity: 0; transform: scale(0.95) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
    `}</style>
  );
}
