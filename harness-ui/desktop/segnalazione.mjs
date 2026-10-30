/*
 * «Segnala un problema» dal menu della finestra (owner 29/10/2026: «due porte», la prima è la voce del menu «⋯»/«≡»). Il menu è quello
 *   NATIVO (`main.mjs`, `creaMenu`); la voce porta la finestra davanti e dice alla pagina di aprire la finestra della segnalazione, con
 *   lo stesso canale degli aggiornamenti (`canale-aggiornamenti.mjs`): `webContents.executeJavaScript` di un copione fisso che lancia
 *   l'evento `talos:segnala-problema`. Nessun dato passa: la pagina legge la diagnostica dal server.
 * ⛔ Le etichette del menu nativo sono scritte qui in due lingue (il menu nasce prima della pagina e non ha il dizionario): inglese di
 *   serie, italiano se la lingua del sistema è l'italiano — la stessa regola dell'app (owner 12/10, «l'app segue la lingua del sistema»).
 */
export const EVENTO_SEGNALA = 'talos:segnala-problema';

/** L'etichetta della voce nella lingua del sistema (`app.getLocale()`, es. «it-IT»). */
export function etichettaSegnala(lingua) {
  return /^it(?:[-_]|$)/iu.test(String(lingua ?? '')) ? 'Segnala un problema…' : 'Report a problem…';
}

/** Il copione per `executeJavaScript`: fisso, senza niente di interpolato tranne il nome dell'evento (JSON). */
export function copioneSegnala() {
  return `window.dispatchEvent(new CustomEvent(${JSON.stringify(EVENTO_SEGNALA)}));`;
}
