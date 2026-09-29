/*
 * ⭐ PO-10 (owner 28/09/2026) — LE SCHEDE AGENTE DEL TERMINALE, in sola lettura.
 *
 * Decisioni dell'owner (memoria `decisione-owner-po-10-schede-agente-sola-lettura-28-09`): i comandi dell'agente compaiono
 * nel Terminale in schede SUE, una per giro («Agente · giro N»), coi comandi del giro in fila ($ comando, uscita, esito);
 * niente tastiera — il 28/8 lo specchio nella PTY dell'utente fu tolto perché creava una gara con la tastiera umana
 * (`legacy/app.js`, commento «il tool shell dell'AGENTE non viene più specchiato»). La scheda compare senza rubare il fuoco,
 * resta finché c'è la sessione e si chiude a mano.
 *
 * Forma presa da Cline (`apps/vscode/src/hosts/vscode/terminal/VscodeTerminalRegistry.ts:28`, terminali propri «Cline»,
 * mai quelli dell'utente), adattata: il nostro kernel esegue i comandi da sé, quindi qui non c'è una PTY ma una VISTA.
 *
 * Fonte: gli stessi eventi del pannello Processi — `processiDagliEventi` (`inspector.js`) per comando, stato, giro, durata,
 * cwd ed exit code — più il TESTO dell'uscita, che il pannello non tiene:
 *   · dal vivo, i pezzi di `ToolCallOutput` (effimeri per D-10B, `session-registry.mjs`: chi si collega dopo non li vede);
 *   · alla fine, `ToolCallResult.content`, che è salvato: riaprendo la sessione la scheda si ricostruisce da lì.
 * Modulo PURO: niente DOM, niente stato globale — lo disegna `legacy/app.js`.
 */
import { processiDagliEventi } from './inspector.js';

/** Le righe dell'uscita viva che si tengono: la stessa misura della chat (`RIGHE_USCITA_VIVA` in `legacy/app.js`). */
export const RIGHE_VIVE_AGENTE = 40;

/** L'id stabile della scheda di un giro. `null` (giro non dichiarato) ha la sua scheda senza numero. */
export function idSchedaAgente(giro) {
  return giro == null ? 'agente' : `agente-giro-${giro}`;
}

/* `in-attesa` è un comando ancora aperto che tace da un po' (`inspector.js`, SOGLIA_ATTESA_MS): è vivo anche lui. */
const STATI_VIVI = new Set(['in-avvio', 'in-corso', 'in-attesa']);

function coda(testo, righe) {
  const parti = testo.split('\n');
  const finale = testo.endsWith('\n');
  const piene = finale ? parti.slice(0, -1) : parti;
  if (piene.length <= righe) return testo;
  return `${piene.slice(-righe).join('\n')}${finale ? '\n' : ''}`;
}

/**
 * @param {object[]} eventi gli eventi della sessione, in ordine
 * @param {{chiuse?: Map<string, number>, righeVive?: number, adesso?: number}} [opzioni]
 *   `chiuse`: id della scheda → quanti comandi aveva quando la persona l'ha chiusa. Resta chiusa finché il suo giro non ne
 *   lancia uno nuovo (nasconderlo sarebbe tacere un comando).
 * @returns {{terminalId:string, origine:'agente', giro:number|null, stato:'live'|'terminato', comandi:object[]}[]}
 */
export function schedeAgenteDagliEventi(eventi = [], { chiuse = new Map(), righeVive = RIGHE_VIVE_AGENTE, adesso = Date.now() } = {}) {
  const processi = processiDagliEventi(eventi, { adesso });
  const testi = new Map();
  const vivi = new Map();
  for (const e of eventi) {
    if (e?.type === 'ToolCallOutput' && typeof e.delta === 'string' && e.delta) {
      vivi.set(e.toolCallId, coda(`${vivi.get(e.toolCallId) ?? ''}${e.delta}`, righeVive));
    } else if (e?.type === 'ToolCallResult') {
      testi.set(e.toolCallId, e.content == null ? '' : String(e.content));
      vivi.delete(e.toolCallId); // l'uscita viva lascia il posto a quella vera: due copie, una senza tetto, sono peggio di nessuna
    }
  }
  /* ⛔ `processiDagliEventi` dà il più RECENTE per primo (è l'ordine del pannello Processi); una scheda di terminale si legge
     dall'alto in basso, nell'ordine in cui i comandi sono partiti — si ordina sulla posizione del loro `ToolCallStart`. */
  const posizione = new Map();
  eventi.forEach((e, i) => { if (e?.type === 'ToolCallStart' && !posizione.has(e.toolCallId)) posizione.set(e.toolCallId, i); });
  const inFila = [...processi].sort((x, y) => (posizione.get(x.id) ?? 0) - (posizione.get(y.id) ?? 0));
  const perGiro = new Map();
  for (const p of inFila) {
    const id = idSchedaAgente(p.giro ?? null);
    if (!perGiro.has(id)) perGiro.set(id, { terminalId: id, origine: 'agente', giro: p.giro ?? null, stato: 'terminato', comandi: [] });
    const scheda = perGiro.get(id);
    scheda.comandi.push({
      id: p.id, comando: p.comando, descrizione: p.descrizione, cwd: p.cwd, stato: p.stato, uscita: p.uscita,
      durataMs: p.durataMs, avviatoA: p.avviatoA,
      testo: testi.has(p.id) ? testi.get(p.id) : null,
      vivo: vivi.get(p.id) ?? '',
    });
    if (STATI_VIVI.has(p.stato)) scheda.stato = 'live';
  }
  const schede = [...perGiro.values()].filter((s) => !(chiuse.has(s.terminalId) && s.comandi.length <= chiuse.get(s.terminalId)));
  return schede.sort((a, b) => (a.giro ?? -1) - (b.giro ?? -1));
}
