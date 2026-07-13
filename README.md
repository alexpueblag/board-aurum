# Board Aurum · YoDesarrollo

Dashboard operativo sincronizado desde Google Sheets.

## URL en vivo
https://alexpueblag.github.io/board-aurum/

## Editar tareas
Edita el Sheet de control. Los cambios aparecen en el board en maximo 10-15 minutos.

## Sync manual
```bash
cd ~/board-aurum
python3 scripts/sync_sheet.py
```

## Ver logs
```bash
tail -f ~/board-aurum/.sync-logs/sync-*.log
```

## Acceso (Portero YOD)
El acceso lo gobierna el **Portero YOD** (liga mágica de 90 días, clave de equipo o Google).
Cada petición al Apps Script viaja con la credencial (`k`) y el servidor la valida; el código
público ya no contiene secretos y el `data.json` con tareas reales se retiró del repo.

**Reconexión pendiente (una vez):** parchar el Apps Script para exigir `credencialValida_(k)`
(ver `apps-script/portero-auth.gs` de board-flujo-yod como referencia, board=TA), crear una
implementación NUEVA (la anterior está comprometida: su secreto estaba publicado), pegar la
URL `/exec` en `APPS_SCRIPT_URL` de `src/App.jsx`, y marcar SYS-TAREAS como Activo en Control Maestro.
