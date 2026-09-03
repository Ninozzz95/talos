import { Capacitor } from '@capacitor/core'

/**
 * ⭐⭐⭐ 2/9 — estratta da `HarnessSessionScreen.vue` (dove viveva come
 * costante locale, mai importabile) quando il picker dello stato vivo in
 * lista (piano §16.1) ha avuto bisogno della STESSA base per parlare col
 * server on-device senza mai aver montato una sessione — due chiamanti,
 * una sola verità, non una seconda copia del `4174` a mano.
 *
 * Su desktop `app.js` gira DENTRO la pagina servita da `server.mjs` su
 * `http://localhost:4174/` — un URL relativo (`/api/v1/...`) risolve lì
 * per costruzione. Su mobile `app.js` è compilato nell'APK e montato in
 * uno shadow root DENTRO il documento TALOS (origine Capacitor,
 * `http://localhost` su Android, verificato via ricerca web) — un URL
 * relativo colpirebbe quell'origine, mai la porta 4174 del telefono. Questa
 * base è l'unica differenza fra i due ambienti.
 *
 * ⛔ FUNZIONE, non una costante congelata — trovato da un test rosso, non
 * dedotto: `HARNESS-API-BASE-01/02` piantano `Capacitor.isNativePlatform`
 * con `vi.spyOn(...).mockReturnValue(...)` DENTRO ogni singolo test, prima
 * di montare. Con `Capacitor.isNativePlatform()` letto una volta sola a
 * livello di modulo, il valore si CONGELA al primo `import` del file
 * intero e ogni test successivo eredita lo stesso risultato stantio — il
 * comportamento originale (una costante `<script setup>`, rivalutata a
 * ogni `setup()`, quindi a ogni mount) si perdeva silenziosamente
 * nell'estrazione. Una funzione richiamata a ogni uso resta fedele
 * all'originale.
 */
export function talosHarnessUiApiBase(): string {
    return Capacitor.isNativePlatform() ? 'http://localhost:4174' : ''
}
