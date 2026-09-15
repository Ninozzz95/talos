/**
 * artifact-store.mjs — l'HTML degli artefatti (attrezzo `artifact_create`
 * in talosHarness.mjs), tenuto in memoria per essere servito via GET con
 * la SUA propria Content-Security-Policy, permissiva SOLO per quella
 * risposta (vedi la rotta in http-app.mjs).
 *
 * ⛔⛔⛔ 28/8 — PERCHÉ NON `srcdoc`, misurato dal vivo e non ipotizzato: un
 * documento `about:srcdoc` EREDITA la Content-Security-Policy della
 * pagina che lo crea (regola dello standard, non un bug del browser). Con
 * lo `script-src 'self'` di tutto il resto di Harness UI
 * (`SECURITY_HEADERS`, http-app.mjs), un `<meta>` CSP permissivo scritto
 * DENTRO il srcdoc veniva ignorato: lo script del modello non partiva
 * mai, nessuno `<style>` si applicava — verificato con una sonda
 * cross-frame via `postMessage` (zero eseguiti, in tre varianti diverse,
 * anche senza alcun sandbox). Una risposta HTTP VERA, con la SUA propria
 * intestazione, non eredita niente dalla pagina che la incorpora — è la
 * stessa architettura di Claude Artifacts (bloom.security, 28/8):
 * un'origine/risposta separata, non un frammento incollato nella pagina
 * principale.
 *
 * ⛔ Solo in memoria, stesso principio di session-registry.mjs
 * (sessioni): non sopravvive a un riavvio del server — accettabile per
 * uno strumento locale owner-only, dichiarato qui perché non diventi
 * un'assunzione silenziosa.
 *
 * ⭐ 29/8 — copia PORTATA verbatim dal canonico (ledger §17, FASE G.2):
 * zero dipendenze cross-modulo, zero adattamento richiesto.
 */
const artefatti = new Map();

export function salvaArtefatto(id, html) {
  artefatti.set(id, html);
}

export function leggiArtefatto(id) {
  return artefatti.get(id) ?? null;
}

/** Solo per i test: azzera lo store fra un test e l'altro (Map globale al modulo). */
export function svuotaArtefattiPerTest() {
  artefatti.clear();
}
