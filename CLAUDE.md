# board-aurum — *Operación semanal (MOAC) y el Centro de Decisión*

Contexto para Claude Code. Lee este archivo completo antes de tocar nada.
Escrito el 2026-09-04. Todo verificado contra el código, el `git log`, un `curl` a lo vivo o las
memorias de `~/.claude/projects/-Users-a-/memory/`. Lo no verificable está en **Por confirmar**.

## Qué es
Tablero de tareas de **Aurum Arquitectos + YoDesarrollo**: quién debe qué, para cuándo, en qué va.
Lo usa Alejandro (rol admin = "Dirección") todos los días y el equipo (Alma, Mariana, Sayri, Genaro,
Fernando, Miguel, PG Arquitectos — los responsables humanos de la hoja, CSV 2026-09-04). En la columna
`responsable` también aparece **`Claude`**: hay tareas asignadas a la máquina, no solo a personas.
En el portal aparece como **"Proyectos y tareas"**; en YOD OS, como **"Operación semanal" / "MOAC"**
(memoria `board-tareas-aurum-yod`). Código de tablero en el Portero: **`TA`**.

**Dirección en vivo:** `https://yodesarrollomx.github.io/board-aurum/` → **HTTP 200** (curl 2026-09-04).
- La casa vieja `https://alexpueblag.github.io/board-aurum/` responde **200** pero ya es cascarón:
  sirve una página "Se mudó" con `meta refresh` + `location.replace` al dominio nuevo (curl 2026-09-04).
- `https://tableros.yodesarrollo.mx/board-aurum/` **no resuelve** (curl → código `000`, 2026-09-04).
  El DNS todavía no existe; varias memorias ya escriben esa liga, no las "corrijas".

**LA TRAMPA DEL NOMBRE (léela dos veces):**
- **`board-aurum`** = ESTE. Tareas y decisiones. Clon local en **`~/Desktop/board-aurum`**, NO en `~/`.
- **`aurum-board`** = OTRO repo (`~/aurum-board`, existe): métricas de redes, código de Portero `MK`.
- `~/board-aurum` **no existe** — y el viejo `scripts/sync_sheet.sh` apunta ahí como `REPO_DIR`
  (solo se puede leer en el repo de la org o con `git show c1a5005:scripts/sync_sheet.sh`; ver Archivos).

## Reglas INVIOLABLES
1. **El Sheet manda.** `11SU8pE4tpaIuOfiDs8dS9Fqtc2Ul0mhBqBaD2WtR_WM` es la bandeja única de pendientes
   (decisión de Alejandro 2026-08-27, memoria `pendientes-metodo-unificado`). Nada se guarda aparte.
2. **Nunca `clasp deploy` / `clasp redeploy` sobre un webapp de GAS**: le quita el entryPoint, el `/exec`
   queda en 404 y el tablero muere. Redespliegue SOLO desde el editor (Implementar → Administrar → ✎ →
   Nueva versión). `clasp push` sí es seguro (memoria `moac-metodo-genealogia`, reglas del 2026-08-25).
3. **El repo es ESPEJO del backend.** El `Code.gs` vivo NO está en ningún repo: en el de la org solo
   vive `apps-script/portero-auth.gs`, que es una *referencia* para pegar (en este clon ni eso,
   ver Archivos). Antes de tocar el backend, pide el código del editor
   (memoria `backend-vivo-no-es-el-repo`).
4. **Cero secretos en el código.** Se retiraron el 2026-07-12; hoy cada petición viaja con la credencial
   `k` del Portero y el servidor la valida (`src/App.jsx:14-24`, README). No vuelvas a quemar una clave.
5. **El Centro de Decisión es solo para Dirección.** `DecisionCenter` corta si el rol ≠ `admin`
   (`src/App.jsx:1744`). Si lo abres a todos, el equipo ve decisiones de dinero y personal.
6. **No escribir el board por el navegador.** Se escribe por `curl` en dos pasos (ver Arquitectura).
   Escribir por la interfaz era la enfermedad de YodBot (memoria `board-aurum-escritura-sin-navegador`).
7. **Antes de reintentar una escritura, siempre `getAll`**: cada escritura tarda ~15 s y duplica fácil
   (misma memoria).
8. **`estado` solo puede ser** Pendiente / En proceso / En standby / Terminado (`src/App.jsx:102`).
   Cualquier otra cosa `normalizeEstado` la degrada a "Pendiente" (`src/App.jsx:113-121`).

## Archivos

**LEE ESTO ANTES DE BUSCAR UN ARCHIVO: el código del tablero NO está en este clon.**
`~/Desktop/board-aurum` está en la rama `main` de `alexpueblag/board-aurum`, que hoy es el
**cascarón de redirección**. `git ls-files` devuelve **5 archivos** y ya: `.nojekyll`, `404.html`,
`CLAUDE.md`, `README.md`, `index.html`. Aquí **no hay** `src/`, ni `apps-script/`, ni `scripts/`,
ni `.github/workflows/` (verificado 2026-09-04).

Los cinco archivos que sí están aquí:
- `index.html` — la página **"Se mudó"**: `meta refresh` + `canonical` + `location.replace`, los tres a
  `https://yodesarrollomx.github.io/board-aurum/`. **No** carga `portero.js` ni `shell.js`.
- `404.html` — recibe cualquier ruta que no exista y la reenvía conservando ruta, query y fragmento.
- `README.md` — la ficha del cascarón: por qué existe y por qué no se borra (QRs impresos, captions ya
  publicados, ligas mandadas por WhatsApp).
- `.nojekyll` y este `CLAUDE.md`.

**Dónde está el código de verdad:** en **`yodesarrollomx/board-aurum`** (HEAD `8150536`, `git ls-remote`
2026-09-04). Es el repo que sirve Pages. Para leerlo hay que clonar la org.
El `index.html` que sirve ese repo **sí** carga los dos scripts, desde `yodesarrollomx.github.io`
(`.../potenciales-yod/portero.js` y `.../yod-portal/os/shell.js`, curl 2026-09-04).

**Cómo leer el código histórico sin salir de este clon:** el árbol viejo sigue en el commit **`c1a5005`**
(26-ago-2026). `git ls-tree -r --name-only c1a5005` lo lista y `git show c1a5005:src/App.jsx` lo abre.
**Todas las referencias `src/App.jsx:NNN` de este documento son contra `c1a5005`**, no contra el HEAD de
la org: si algo cambió después de la mudanza, el número de línea ya no cuadra. Contra ese commit:
- `src/App.jsx` — **el tablero entero**. Config arriba (líneas 14-29), API (`apiCall`, línea 426), Centro
  de Decisión (1596-1805), `MoacPanel` (1835), vistas (1994), chat IA (3972+), y todo el CSS en un
  `<style>` al final (~3028 en adelante).
- `apps-script/portero-auth.gs` — referencia de cómo el backend valida contra el Portero
  (`credencialValida_`, canje sin `board=`, código `TA`, caché 10 min, fail-closed).
- `.github/workflows/deploy.yml` — build Vite (`npm ci && npm run build`) → GitHub Pages, en cada push
  a `main`. `vite.config.js` fija `base: '/board-aurum/'`.
- `scripts/sync_sheet.py` / `.sh` — sincronizador viejo Sheet→`public/data.json`. **Legado**: el `.sh` usa
  `REPO_DIR="$HOME/board-aurum"`, ruta que no existe en esta Mac (`git show c1a5005:scripts/sync_sheet.sh`).
- `README.md` de `c1a5005` — ese sí es el desactualizado: pone la URL vieja como "URL en vivo" y dice que
  falta la reconexión del Apps Script, ya hecha (POST con clave mala → `{"ok":false,"error":"liga"}`,
  memorias `barrido-backends-1ago` y `board-aurum-escritura-sin-navegador`). El README que hay que
  arreglar vive en el repo de la org, **no aquí**.

## Arquitectura de datos
El Sheet es la raíz. El tablero pinta; el Apps Script es el único puente.

```
Sheet "board" 11SU8pE4tpaIuOfiDs8dS9Fqtc2Ul0mhBqBaD2WtR_WM  (una fila por tarea; el conteo crece solo.
  Para el numero del dia: export?format=csv&gid=0 — HTTP 200 sin credencial. OJO al contar proyectos:
  hay "Admin" y "Admin " con espacio al final, el mismo proyecto se cuenta dos veces si no normalizas)
  columnas = SHEET_FIELDS (App.jsx:99) + id/links
  comentarios = "autor~fecha~texto|||autor~fecha~texto"  (App.jsx:357-367)
  subtareas   = "texto:1|texto:0"                        (App.jsx:344-354)
        │
        ├─ POST {k, action, …} ──→ board-aurum-api v9
        │     https://script.google.com/macros/s/AKfycbyZ1p7…IXyhKivqLHa4rLxcHNneJKsZHv7smnjLsfH1/exec
        │     acciones: ping · checkkey · getAll · create · update · addLink · removeLink ·
        │               setResponsableColor · ai
        │
Sheet "MOAC · Metas, Objetivos y Acciones" 1HaUMdocq78kZPilNST6P-GHJjLMMPjWe0Pe8iXqnBBQ
  pestañas METAS · OBJETIVOS · TAREAS_MOAC
        └─ POST {k, action:"moac*"} ──→ MOAC API v1 (GAS aparte, mismo Portero)
              https://script.google.com/macros/s/AKfycbzmbZu…Zr9AGFRu51biPxoKWUcaTCUe0BlzOOEa/exec
              acciones: moac · moacSet · moacObjetivo
                        (ruteo por prefijo "moac" en App.jsx:427)

Portero YOD  https://script.google.com/macros/s/AKfycbwlDDCWWzOWYZsUpBU9uqsQ7aenQ469PF6s6FkNlBFS1_cJSU5njG9oQmuyELy5zlqzFg/exec
  portero.js escribe la credencial en localStorage["pyod_clave_v1"] y el rol en sessionStorage["pyod_rol"]
  el backend revalida server-to-server con ?recurso=canje y exige el código TA
        │
        └──→ index.html + src/App.jsx  (React 18 + Vite) ──build──→ GitHub Pages
```

**ADVERTENCIA — este repo es ESPEJO, no es lo que corre.** Lo que atiende los `/exec` es el código pegado
a mano en el editor de Apps Script. Un cambio aquí no cambia el backend, y el backend puede haber
avanzado sin que este repo se entere. Pide siempre el `Code.gs` vivo antes de tocarlo.

**Escritura desde la Mac, sin navegador (verificado 29-ago-2026):** el POST devuelve **302** y `curl -L`
lo convierte en GET (falso "página no encontrada"). Dos pasos: capturar `%{redirect_url}` del POST y
hacerle `curl` con GET a esa liga; ahí viene el JSON.

**Convención del Centro de Decisión** (`src/App.jsx:1596-1630`): tarjetas del proyecto **"Decisiones"**;
`observaciones` = contexto + líneas `QUIEN:`/`PREGUNTA:`/`PORQUE:`/`RIESGO:`/`DESDE: AAAA-MM-DD` +
opciones `A) …` (la A es la recomendada); la decisión se guarda como comentario `✅ DECISIÓN: …` y la
marca de ejecución como `🤖 Ejecutado: …` (vale por texto, sin importar el autor). Hoy hay **18 tarjetas
"Decisiones"**, la última **D-19** (CSV 4-sep-2026).

## Decisiones
- **2026-07-12 · contención (Claude, aprobado por Alejandro):** fuera el secreto compartido del código
  público; el acceso pasa al **Portero YOD**. Porqué: el secreto estaba publicado en un repo público
  (`src/App.jsx:14-18`, README).
- **2026-07-15 · el código de este tablero es `TA`, no `BA`** (commit `b72fcc9`). Porqué: nadie tiene `BA`
  en su lista `boards`, así que el Portero respondía "board no permitido" y el backend lo traducía a
  `liga`: los admin entraban y los colaboradores no. ~~`board=BA`~~ **OBSOLETO desde 2026-07-15.**
- **2026-07-26 · Alejandro:** las tareas del propietario de La Cercada y su hijo NO se cargan al board; se
  concentran en una sola tarjeta suya (A-101). Porqué: él les da seguimiento personal
  (memoria `board-tareas-aurum-yod`).
- **2026-08-01 · Alejandro:** **Centro de Decisión v2** — post-its al entrar, solo Dirección, ✓ rápido =
  aceptar la opción A, y al decidir la última la cortina se quita sola (commits `9f3ff5d`, `ce2afa1`,
  `41754ea`). Porqué: la auditoría de julio de YodBot dio 48% de cobertura y decisiones zombis de 80
  días; su costumbre es abrir el board, despachar y seguir (memorias `centro-decision-board`, `-fix-4ago`).
- ~~**2026-08-03 · backend paralelo** en Gmail personal (`AKfycbz9SgSb…`, clave `yod-agosto-2026` quemada),
  commit `ebd2d7f`, porque la suspensión de Workspace dejó todo en solo-lectura.~~
  **OBSOLETO desde 2026-08-16** (commit `1f19dfc`): Alejandro pagó Workspace, se volvió al backend
  original `AKfycbyZ1p7…`. Los dos Sheets quedaron idénticos (124/124), no hubo nada que volcar
  (memorias `backend-paralelo-tareas`, `google-workspace-reactivado-16ago`).
- **2026-08-16 · Alejandro:** definió MOAC (meta / objetivo-hito / acción) y creó el libro vivo
  `1HaUMdocq…` (5 metas, 26 objetivos). Porqué: el board tenía toda la robustez y cero capa estratégica
  — "avanzamos por puro sentimiento". **2026-08-25 · Fase 2:** el board LEE el libro y liga tareas a
  objetivos contra un **GAS propio** (commits `25fa5ed` → `cc930c7` → `a373eae`), porque el token de
  clasp de la Mac es de otra cuenta que la dueña del Sheet (memoria `moac-metodo-genealogia`).
- **2026-08-25 · Alejandro:** convención **`X-0` = "fuera del MOAC a propósito"** — no cuenta en el chip
  "sin objetivo" ni cuelga de ninguna meta (memoria `moac-metodo-genealogia`).
- **2026-08-26 · tema claro/oscuro saneado** (commit `c1a5005`): el CSS tenía 3 capas peleando; se creó el
  bloque **GEMELOS OSCUROS** al final del `<style>`. Porqué: la pestaña activa salía café sobre café en
  ambos temas (memoria `yodos-barrido-tema-25ago`).
- **2026-08-27 · Alejandro:** el Sheet de este board es **la** bandeja de pendientes; la matriz "Quién
  debe qué" y el Despacho escriben aquí, no guardan aparte. Porqué: cinco bandejas le preguntaban dos
  veces lo mismo (memoria `pendientes-metodo-unificado`).
- **~2026-08-27 · mudanza a `yodesarrollomx`:** el sitio vivo carga `portero.js` y `shell.js` desde
  `yodesarrollomx.github.io` y la casa vieja quedó como redirección (curl 4-sep-2026).
  ~~`https://alexpueblag.github.io/board-aurum/` como casa~~ **OBSOLETO.**

## Pendientes
| Tema | Dueño | Qué evidencia lo cierra |
|---|---|---|
| Rehacer la **liga mágica** de Alejandro: al 25-ago `pyod_clave_v1` estaba VACÍA en su Chrome, el board corría de caché y no guardaba (memoria `moac-metodo-genealogia`) | Alejandro | Un `update` desde el board que reaparezca en el CSV del Sheet |
| El **Sheet del board se lee sin credencial** ("cualquiera con el enlace: lector"): verificado hoy, HTTP 200 y 147 filas por `export?format=csv` | Alejandro decide; Claude ejecuta | Que el mismo `curl` devuelva 401/403 — y que `sync_sheet.py` deje de depender de eso |
| El revisador no puede dejar la marca `🤖 Ejecutado` (se topa con el Portero y yo no tecleo credenciales) | Alejandro (credencial de servicio, 90 días) | Un comentario `🤖 Ejecutado` puesto por la tarea programada, no a mano (memoria `centro-decision-marca-bloqueada`) |
| Este clon del Escritorio solo tiene el cascarón: está al día con su `origin` (la casa vieja), pero no contiene el código que sirve Pages | Alejandro decide si se clona la org aquí o se deja así | Un clon de `yodesarrollomx/board-aurum` en la Mac, o la decisión escrita de trabajar solo contra la org |
| Actualizar el `README.md` **del repo de la org** (URL vieja como "URL en vivo" + "reconexión pendiente" ya hecha). El README de este clon NO es ese: es la ficha del cascarón y está bien como está | Claude, con OK de Alejandro | El README de `yodesarrollomx/board-aurum` apuntando a `yodesarrollomx.github.io` y sin ese párrafo |
| Objetivo **C-3** del MOAC: su alcance se amplió de facto a cobranza Y pasivos; falta actualizar el texto en OBJETIVOS | Alejandro | La celda del objetivo con el texto nuevo (memoria `moac-metodo-genealogia`, 25-ago) |
| Tareas programadas: desactivar `board-aurum-whatsapp-sync-ligero` y mover `aurum-qaa-diario` a las 7:30 | Alejandro | La UI de Scheduled mostrando el cambio (memoria `centro-decision-board`, 1-ago) |

## Por confirmar (NO afirmar sin preguntar)
- **¿A qué repo se publica hoy?** `origin` de este clon es `alexpueblag/board-aurum`, y hoy su HEAD y el
  local son el mismo commit — `a94cb77`, el cascarón más este documento (`git ls-remote origin` +
  `git log -1`, 4-sep-2026). Lo vivo lo sirve `yodesarrollomx/board-aurum`, HEAD `8150536`.
  Pregunta: *¿un push a `origin` todavía publica algo, o el único repo que despliega es el de la org?*
- **La columna `anio`:** `SHEET_FIELDS` la incluye (`src/App.jsx:99`) y hay un commit "guardar el AÑO"
  (`6ec4a72`), pero la hoja `gid=0` **no tiene** columna `anio` (CSV 4-sep). Pregunta: *¿el backend v9 la
  agrega en otra pestaña, o el arreglo del 1 de enero no está persistiendo?*
- **Chat IA (`action:"ai"`, `src/App.jsx:4088`)**: no se probó (no se hacen POST desde aquí). Pregunta:
  *¿sigue vivo el proxy de OpenAI en el backend y quién paga esa clave?*
- **Fila de prueba A-127** (13-ago, `borrada=TRUE`, estado "Hecho") sigue en la hoja. *¿Se borra o se deja?*

## Qué NO hacer
- No hacer POST a los `/exec` "para probar": se crean o modifican tareas reales del equipo.
- No renombrar ni "arreglar" `board-aurum` → `aurum-board`. Son dos tableros distintos.
- No meter frameworks nuevos: el board es React + Vite y todo el CSS vive dentro de `App.jsx`.
- No persistir un relevo de emergencia como destino fijo (lo de `pyod_portero` en localStorage costó el
  "pagué y no entra" del 16-ago). El original primero, siempre, en cada llamada.
