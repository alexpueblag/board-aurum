#!/usr/bin/env bash
# Wrapper para cron. Usa rutas absolutas porque cron tiene PATH minimo.
set -e

REPO_DIR="$HOME/board-aurum"
LOG_DIR="$REPO_DIR/.sync-logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/sync-$(date +%Y-%m).log"

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

cd "$REPO_DIR"

{
  echo ""
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') ==="
  git pull --rebase origin main 2>&1 || echo "git pull fallo (continuo)"
  /usr/bin/python3 scripts/sync_sheet.py
} >> "$LOG_FILE" 2>&1
