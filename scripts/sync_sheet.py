#!/usr/bin/env python3
"""sync_sheet.py v3 — lee el Sheet, parsea evidencias con etiqueta, escribe data.json"""

import os, sys, csv, json, io, subprocess, urllib.request, urllib.error
from pathlib import Path
from datetime import datetime

DEFAULT_SHEET_ID = "11SU8pE4tpaIuOfiDs8dS9Fqtc2Ul0mhBqBaD2WtR_WM"
DEFAULT_SHEET_GID = "0"

SHEET_ID = os.environ.get("SHEET_ID", DEFAULT_SHEET_ID)
SHEET_GID = os.environ.get("SHEET_GID", DEFAULT_SHEET_GID)
CSV_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={SHEET_GID}"

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = REPO_ROOT / "public" / "data.json"


def log(msg):
    print(f"[{datetime.now().isoformat(timespec='seconds')}] {msg}", flush=True)


def fetch_csv():
    log(f"Descargando: {CSV_URL[:80]}...")
    req = urllib.request.Request(CSV_URL, headers={"User-Agent": "board-sync/3.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        if resp.status != 200:
            raise RuntimeError(f"HTTP {resp.status}")
        return resp.read().decode("utf-8")


def parse_links(value):
    if not value:
        return []
    raw = value.replace(";", "|")
    parts = [p.strip() for p in raw.split("|") if p.strip()]
    out = []
    for i, entry in enumerate(parts, 1):
        sep = entry.find(" ~ ")
        if sep != -1:
            label = entry[:sep].strip() or f"Evidencia {i}"
            url = entry[sep + 3:].strip()
        else:
            label = f"Evidencia {i}"
            url = entry.strip()
        if not url.startswith(("http://", "https://")):
            url = "https://" + url
        out.append({
            "id": f"link-{i}",
            "label": label,
            "url": url,
            "fechaSubida": datetime.now().strftime("%Y-%m-%d"),
            "responsable": "",
        })
    return out


def csv_to_tasks(csv_text):
    reader = csv.DictReader(io.StringIO(csv_text))
    headers = [h.strip() for h in (reader.fieldnames or [])]
    log(f"Columnas: {headers}")
    tasks = []
    for i, row in enumerate(reader, 1):
        clean = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items() if k}
        if not clean.get("actividad") and not clean.get("proyecto"):
            continue
        task = {
            "id": clean.get("id") or f"S-{i:03d}",
            "mes": clean.get("mes") or "",
            "mesCompromiso": clean.get("mes") or "",
            "empresa": clean.get("empresa") or "",
            "proyecto": clean.get("proyecto") or "",
            "responsable": clean.get("responsable") or "",
            "semana": clean.get("semana") or "",
            "actividad": clean.get("actividad") or "",
            "entregable": clean.get("entregable") or "",
            "fecha": clean.get("fecha") or "",
            "estado": clean.get("estado") or "Pendiente",
            "prioridad": clean.get("prioridad") or "Media",
            "observaciones": clean.get("observaciones") or "",
            "links": parse_links(clean.get("links", "")),
        }
        tasks.append(task)
    log(f"Tareas: {len(tasks)}")
    return tasks


def write_data_json(tasks):
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    if DATA_PATH.exists():
        try:
            old = json.loads(DATA_PATH.read_text(encoding="utf-8"))
            if old.get("tasks") == tasks:
                log("Sin cambios.")
                return False
        except Exception:
            pass
    payload = {
        "version": 5,
        "exportedAt": datetime.now().isoformat(),
        "source": "google-sheets",
        "tasks": tasks,
    }
    DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"Escrito: {DATA_PATH} ({len(tasks)} tareas)")
    return True


def git_commit_and_push():
    def run(cmd):
        return subprocess.run(cmd, cwd=REPO_ROOT, capture_output=True, text=True)
    status = run(["git", "status", "--porcelain", "public/data.json"])
    if not status.stdout.strip():
        return
    log("Commit + push...")
    run(["git", "add", "public/data.json"])
    msg = f"sync: auto {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    commit = run(["git", "commit", "-m", msg])
    if commit.returncode != 0:
        log(f"Error commit: {commit.stderr.strip()}")
        return
    push = run(["git", "push", "origin", "main"])
    if push.returncode != 0:
        log(f"Error push: {push.stderr.strip()}")
        return
    log("Push OK")


def main():
    no_git = "--no-git" in sys.argv
    try:
        csv_text = fetch_csv()
        tasks = csv_to_tasks(csv_text)
        if not tasks:
            log("0 tareas. Aborto.")
            sys.exit(2)
        if write_data_json(tasks) and not no_git:
            git_commit_and_push()
        log("Sync OK")
    except urllib.error.HTTPError as e:
        log(f"HTTP {e.code}: el Sheet debe estar publico.")
        sys.exit(3)
    except Exception as e:
        log(f"ERROR: {type(e).__name__}: {e}")
        sys.exit(4)


if __name__ == "__main__":
    main()
