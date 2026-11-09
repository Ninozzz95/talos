/*
 * Tester sul 4174, 04/11/2026 20:15, voce 15 ROSSA — LA SORVEGLIANZA DELL'ACCESSO PRIMA DI TUTTO IL RESTO.
 *
 * La fascia «Questa finestra non è più collegata» (`components/accesso-perso.js`) avvolge `window.fetch`. Montata a metà del
 * monolite (`legacy/app.js:3201` della candidata), arrivava DOPO la prima lettura d'avvio (`rileggiStatoDelPiano()`, riga 3179),
 * che crea il client centrale (`services/api-client.ts`, `fetchFn = globalThis.fetch`): da lì Note, Bacheca e ogni `apiGet`
 * usavano la fetch nuda e i loro 401 `AUTH_REQUIRED` non accendevano niente (misurato con una sonda sui moduli veri).
 * ⇒ Un punto solo, e prima di tutti: questo modulo è il PRIMO import di `main.js`, quindi la sua valutazione precede quella di
 *   ogni altro modulo del bundle (MDN, «import»: le dichiarazioni sono issate e i loro effetti avvengono prima del resto del
 *   modulo, nell'ordine). Ogni riferimento a `fetch` preso dopo, al caricamento o alla chiamata, è già quello sorvegliato.
 *   Hermes fa passare tutto da un solo trasporto (`apps/desktop/src/lib/browser-transport.ts:142-180`, `browserFetch`, che
 *   chiama `reauthError` a ogni 401, righe 86-122): qui il trasporto unico è `window.fetch` sorvegliata fin dall'inizio.
 */
import { sorvegliaAccesso } from './components/accesso-perso.js';

sorvegliaAccesso();
