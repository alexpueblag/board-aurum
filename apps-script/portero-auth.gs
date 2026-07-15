/**
 * Operación semanal (board-aurum) · Autorización con el Portero YOD
 *
 * SÍNTOMA QUE ARREGLA: colaboradores con acceso a Operación (código TA)
 * veían "lectura: liga" y el tablero con 0 tareas, y en YOD OS la sección
 * "Operación semanal" no cargaba el resumen. La sesión ES válida; lo que
 * fallaba era la validación de este backend.
 *
 * CAUSA REAL (confirmada 2026-07-15): el backend desplegado pedía el canje
 * con `&board=BA`, pero el código de Operación en la matriz de Accesos es
 * `TA` (no existe `BA`). Como nadie tiene `BA` en su lista `boards`, el
 * Portero respondía "board no permitido" y el backend lo traducía a 'liga'.
 * Los admin entraban (a ellos el Portero les abre todo); los colaboradores
 * con TA no. Arreglo directo: `board=BA` → `board=TA`.
 *
 * Este archivo va más allá y valida SIN `&board=` (canje simple) revisando
 * el código TA aquí, contra la lista `boards` que devuelve el Portero — la
 * misma decisión que toma YOD OS para mostrar el módulo. Así, aunque alguien
 * vuelva a teclear mal un código, la fuente de verdad es una sola.
 *
 * SOLUCIÓN: validar la sesión con un canje SIN board (el mismo que usa
 * YOD OS, que sí devuelve la lista `boards`) y revisar el código TA aquí,
 * del lado del backend, contra esa misma lista. Así la decisión es idéntica
 * a la que ya toma YOD OS para mostrar el módulo: si el OS te lo muestra,
 * el backend te deja leer. Sin credencial válida responde
 * { ok:false, error:'liga' } y no entrega ni un dato.
 *
 * Cómo conectar (una vez, en el Apps Script de Operación semanal):
 *   1. Pega este archivo completo como un archivo .gs más del proyecto
 *      (el que tiene doPost con las acciones getAll/create/update/…).
 *   2. En el doPost, ANTES de atender cualquier acción, exige la credencial:
 *
 *        // arriba del switch/if de acciones, con el payload ya parseado:
 *        if (!credencialValida_(payload.k || '')) {
 *          return jsonOut_({ ok: false, error: 'liga' });
 *        }
 *
 *      (Si tu proyecto ya tiene una función para responder JSON, usa esa en
 *       vez de jsonOut_ y borra la de aquí abajo para no duplicarla.)
 *
 *   3. Implementar → Administrar implementaciones → (tu implementación) →
 *      lápiz ✎ → Versión: Nueva versión → Implementar.
 *      Ejecutar como: yo · Acceso: cualquier persona.
 *      (Reusa la MISMA implementación para conservar la URL /exec; así no
 *       tienes que tocar APPS_SCRIPT_URL en src/App.jsx.)
 *   4. Listo. Recarga el tablero y YOD OS.
 */

// Endpoint del Portero YOD (potenciales-yod) — valida ligas, claves y sesiones.
const PORTERO_EXEC = 'https://script.google.com/macros/s/AKfycbwlDDCWWzOWYZsUpBU9uqsQ7aenQ469PF6s6FkNlBFS1_cJSU5njG9oQmuyELy5zlqzFg/exec';
const AUTH_TTL_OK  = 600;  // 10 min de caché para credenciales válidas
const AUTH_TTL_BAD = 60;   // 1 min para rechazadas (reintentos rápidos tras dar de alta)
const BOARD_CODE   = 'TA'; // código de Operación semanal en la matriz de Accesos

/**
 * Valida la credencial contra el Portero (server-to-server), con caché
 * por hash para no golpear al Portero en cada request. Fail-closed.
 *
 * Usa canje SIN `board=` (igual que YOD OS) y verifica el código TA contra
 * la lista `boards` que devuelve el Portero. Es la misma decisión que toma
 * YOD OS para mostrar el módulo, así que nunca queda desincronizado.
 */
function credencialValida_(k) {
  k = String(k || '').trim();
  if (k.length < 4) return false;

  const cache = CacheService.getScriptCache();
  const ck = 'auth_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, k)).slice(0, 24);
  const hit = cache.get(ck);
  if (hit) return hit === '1';

  let ok = false;
  try {
    const r = UrlFetchApp.fetch(PORTERO_EXEC + '?recurso=canje&t=' + encodeURIComponent(k),
      { muteHttpExceptions: true, followRedirects: true });
    const j = JSON.parse(r.getContentText());
    const role = String(j && j.rol || '').toLowerCase();
    const boards = String(j && j.boards || '');
    const list = boards.split(/[,;| ]+/).map(function (v) { return v.trim().toUpperCase(); });
    ok = !!(j && j.ok && (role === 'admin' || boards.trim() === '*' || list.indexOf(BOARD_CODE) >= 0));
  } catch (err) {
    ok = false;  // Portero inaccesible → fail-closed
  }
  cache.put(ck, ok ? '1' : '0', ok ? AUTH_TTL_OK : AUTH_TTL_BAD);
  return ok;
}

/**
 * Respuesta JSON estándar. Si tu proyecto ya tiene una equivalente,
 * usa la tuya en el doPost y borra esta para no duplicar.
 */
function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
