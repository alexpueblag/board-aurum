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
