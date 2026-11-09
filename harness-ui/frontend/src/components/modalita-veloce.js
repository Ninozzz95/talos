/*
 * ⭐ FE-047, owner 31/10/2026 — LA MODALITÀ VELOCE sui modelli del piano ChatGPT: spenta di serie, per una conversazione alla volta,
 *   mai salvata fra sessioni; acceso, un fulmine colorato sul chip (strada A dell'owner, 01/11: il logo resta). A schermo «chiesta», mai
 *   «attiva»: la risposta del servizio dice comunque `default`, quindi non si può provare che sia attiva. Qui le regole pure, lo stato
 *   e il filo stanno in `legacy/app.js`, il fulmine in `chat-foot.js`.
 * ⛔ DUE FORME CON LO STESSO NOME. Su un modello del catalogo (`GET /api/v1/providers/chatgpt/models`, `modelloDelPiano` sul server)
 *   `fasciaVeloce` è `{ id, descrizione }`; su una sessione (`GET /api/v1/sessions`, la fotografia delle impostazioni, i corpi di avvio e
 *   di `/settings`) è vero o falso. Questo file legge solo la prima.
 * ⛔ Quali modelli: solo il catalogo, mai un elenco scritto a mano. `chatgpt:` non è un elenco di modelli: è la strada, la stessa
 *   domanda che fa il server (`creaFasciaVeloceDelModello`, `chatgpt-rotte.mjs`).
 * Letto il 01/11/2026: Hermes `apps/desktop/src/app/shell/model-edit-submenu.tsx:186-189` (la voce «Fast» con l'interruttore, il menu
 *   resta aperto: `onSelect={event => event.preventDefault()}`; senza supporto non c'è); t3code `TraitsSpeed.tsx:8-40` (il fulmine solo se
 *   accesa). W3C APG «Menu and Menubar»: Spazio su un `menuitemcheckbox` cambia lo stato senza chiudere (w3.org/WAI/ARIA/apg/patterns/menubar,
 *   letto il 01/11/2026). OpenAI: «Fast mode uses included subscription limits at 2.5x the Standard rate» (learn.chatgpt.com/docs/agent-configuration/speed).
 */

const PREFISSO_DEL_PIANO = 'chatgpt:';

/**
 * La frase del servizio per quel modello, tradotta. ⛔ Tabella legata al testo RICEVUTO, i tre letti dal vivo da Performance il 31/10:
 * un testo che non sta qui non si mostra (regola del Mobile), perché una traduzione indovinata sarebbe una promessa nostra.
 */
const VELOCITA_DEL_SERVIZIO = new Map([
  ['1.5x speed', 'app.fastMode.service15x'],
  ['1.5x speed, increased usage', 'app.fastMode.service15xUsage'],
  ['2x speed, increased usage', 'app.fastMode.service2xUsage'],
]);

/** La fascia di un modello nella forma del catalogo, o `null`. `modelli` è `null` finché il catalogo non è stato letto. */
export function fasciaDelModello(modelli, id) {
  if (!Array.isArray(modelli) || typeof id !== 'string' || !id) return null;
  const fascia = modelli.find((m) => m?.id === id)?.fasciaVeloce;
  return fascia && typeof fascia === 'object' && typeof fascia.id === 'string' && fascia.id ? fascia : null;
}

/** La nota sotto la riga: la frase del costo, sempre, e dopo la frase del servizio se la sappiamo tradurre. */
export function notaModalitaVeloce(tr, descrizione) {
  const costo = tr('app.fastMode.cost');
  const chiave = VELOCITA_DEL_SERVIZIO.get(descrizione);
  return chiave ? `${costo} ${tr(chiave)}` : costo;
}

/** Il modello è cambiato con la modalità accesa: `tieni`, `spegni`, o `aspetta` se il catalogo non è ancora letto (non dice niente sul modello). */
export function esitoDelCambioDiModello({ modello, modelli }) {
  if (typeof modello !== 'string' || !modello) return 'aspetta';
  if (!modello.startsWith(PREFISSO_DEL_PIANO)) return 'spegni';
  if (!Array.isArray(modelli)) return 'aspetta';
  return fasciaDelModello(modelli, modello) ? 'tieni' : 'spegni';
}

/** Vero per i soli modelli del piano: gli unici di cui serve leggere il catalogo. */
export function eModelloDelPiano(id) {
  return typeof id === 'string' && id.startsWith(PREFISSO_DEL_PIANO);
}
