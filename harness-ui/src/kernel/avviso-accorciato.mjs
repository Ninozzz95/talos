/*
 * 05/11/2026 — cura della compattazione per Luna 6, voci M1 e M2 (forma `FORMA-CURA-COMPATTAZIONE-LUNA-2026-11-05.md` §2b e §3; OK di
 * CLI, Performance e Mobile, §8; M2 nella forma corretta da Performance).
 * Reperto del banco del 04/11 (C9, sessione 8edf6c33): le letture arrivavano al modello accorciate a 1.924 caratteri e il solo segno
 * del taglio stava DENTRO la busta dei dati, a metà testo. Luna rispondeva coi codici che vedeva, come se il file fosse intero.
 * ⇒ M1: una riga del sistema PRIMA della busta, dove parla TALOS, dice quali righe mancano e quanti caratteri. Deterministica: righe e
 *   caratteri vengono SOLO dal testo, così due proiezioni di fila danno gli stessi byte (cache del prompt). Il segno dentro i dati
 *   resta (`giaAccorciata` lo legge).
 * ⇒ M2: una nota IN CODA alla richiesta elenca i risultati accorciati della richiesta in corso. Mai attaccata all'ultimo risultato
 *   (Performance, §8): quel messaggio è già stato spedito, e cambiarlo romperebbe la cache da lì.
 *   Revisione avversaria del 05/11 (REV-M2-PIEGA): la nota nasceva `user` col segno `<talos-note>` già scritto, e la piega del template
 *   severo (`piegaMessaggiDiSistema`) la trattava come una nota contraffatta (`‹talos-note>`). Ora nasce `system`, come ogni altra
 *   nota di TALOS, e la piega la fa la decisione 194 (`sistema-piegato.mjs`): locale severo e cloud la avvolgono loro, col segno intatto.
 *   Dove non si piega (Responses, motori locali che reggono i system, agente esterno) `notaDegliAccorciatiComeUtente` rimette la
 *   forma di prima, stessi byte: posizione e testo non cambiano.
 * ⛔ Solo in ciò che parte verso il modello. Storia, evento `tool-esito`, export e /resume restano identici (condizione 1 della CLI:
 *   la sua riga di lettura vuole la busta e «[TALOS read lines …]» in testa al risultato salvato).
 * Fonti: Codex `utils/output-truncation/src/lib.rs:38-41` (l'avviso del taglio PRIMA del contenuto, coi conti); Hermes
 *   `context_compressor.py:258-297` (il segnaposto dice nome, percorso e caratteri tolti), `:836` e `:1947` (la nota di compattazione
 *   sta fuori dai dati, come messaggio suo); Claude, context editing (il risultato tolto si dice al modello, non si nasconde).
 * Modulo senza dipendenze dal kernel: lo importano sia `compattazione-desktop.mjs` sia `talosHarness.mjs`, che si importano già a vicenda.
 */
import { SEGNO_NOTA } from './sistema-piegato.mjs';

export const INIZIO_AVVISO_ACCORCIATO = '[TALOS: this result was shortened to fit the context. Lines ';
const RE_AVVISO = /^\[TALOS: this result was shortened to fit the context\. Lines (\d+)–(\d+) of this output \(about ([\d,]+) characters\) are NOT shown below\. The full output is kept: read those lines again with leggi offset\/limit, or search them with cerca\. Do not treat the visible part as the whole file\.\]\n/u;
const APERTURA = '<<<TALOS_DATA id=';
const CHIUSURA = '<<<END_TALOS_DATA id=';
export const VOCI_MASSIME_NELLA_NOTA = 6;
const LUNGHEZZA_MASSIMA_ETICHETTA = 80;
const INIZIO_NOTA_DEGLI_ACCORCIATI = '[TALOS context note: to fit the context window, ';

/**
 * La riga dell'avviso per un testo di cui si tengono i primi `inizio` e gli ultimi `fine` caratteri.
 * Le righe sono quelle del FILE quando il risultato è una lettura nella busta (prima riga della lettura dall'intestazione
 * «[TALOS read lines X-…]», altrimenti 1), quelle dell'uscita negli altri casi. Righe vuote ai bordi del taglio non contano.
 */
export function avvisoAccorciato(testo, { inizio, fine }) {
  const t = String(testo);
  const tolti = t.length - inizio - fine;
  const ultimoTolto = t.length - fine - 1;
  let primo = inizio;
  while (primo < ultimoTolto && t[primo] === '\n') primo += 1;
  let ultimo = ultimoTolto;
  while (ultimo > primo && t[ultimo] === '\n') ultimo -= 1;
  const rigaDi = (k) => { let n = 0; for (let j = t.indexOf('\n'); j !== -1 && j < k; j = t.indexOf('\n', j + 1)) n += 1; return n; };
  let da = rigaDi(primo);
  let a = rigaDi(ultimo);
  // la busta: la sua riga d'apertura sta nella parte visibile, preceduta solo da righe di TALOS («[TALOS read lines …]», un avviso)
  const righe = t.slice(0, inizio).split('\n');
  const apertura = righe.findIndex((r) => r.startsWith(APERTURA));
  const busta = apertura >= 0 && apertura < righe.length - 1 && righe.slice(0, apertura).every((r) => r.startsWith('[TALOS '));
  if (busta) {
    const tutte = t.split('\n');
    if (tutte[a]?.startsWith(CHIUSURA) && a > da) a -= 1;
    const prima = Number(/^\[TALOS read lines (\d+)-/u.exec(t)?.[1] ?? 1);
    da = Math.max(prima, prima + da - apertura - 1);
    a = prima + a - apertura - 1;
  } else {
    da += 1;
    a += 1;
  }
  return `${INIZIO_AVVISO_ACCORCIATO}${da}–${a} of this output (about ${tolti.toLocaleString('en-US')} characters) are NOT shown below. The full output is kept: read those lines again with leggi offset/limit, or search them with cerca. Do not treat the visible part as the whole file.]`;
}

/** L'avviso in testa a un contenuto, se c'è: `{ da, a, caratteri }`; altrimenti null. */
export function leggiAvvisoAccorciato(contenuto) {
  if (typeof contenuto !== 'string' || !contenuto.startsWith(INIZIO_AVVISO_ACCORCIATO)) return null;
  const m = RE_AVVISO.exec(contenuto);
  return m ? { da: Number(m[1]), a: Number(m[2]), caratteri: m[3] } : null;
}

/** Il nome di un risultato nella nota: il percorso di una lettura, altrimenti la fonte della busta, altrimenti «a tool result». */
export function etichettaDelRisultato(contenuto) {
  const fonte = /^<<<TALOS_DATA id=[0-9a-f]{12} from=("(?:[^"\\\n]|\\.)*")/mu.exec(String(contenuto ?? ''))?.[1];
  let nome = 'a tool result';
  if (fonte) {
    try { const v = JSON.parse(fonte); if (typeof v === 'string' && v.trim()) nome = v.startsWith('leggi ') ? v.slice(6) : v; } catch { /* resta il nome generico */ }
  }
  return nome.length > LUNGHEZZA_MASSIMA_ETICHETTA ? `${nome.slice(0, LUNGHEZZA_MASSIMA_ETICHETTA - 1)}…` : nome;
}

/** Il testo della nota per gli esiti accorciati della richiesta in corso in `messaggi`; null se non ce ne sono. */
export function notaDegliAccorciati(messaggi) {
  const lista = Array.isArray(messaggi) ? messaggi : [];
  // la richiesta in corso comincia all'ultimo `user` che non segue un esito (la regola di `usciteAccorciateDellaRichiesta`)
  let inizio = -1;
  for (let i = lista.length - 1; i >= 0; i -= 1) if (lista[i]?.role === 'user' && lista[i - 1]?.role !== 'tool') { inizio = i; break; }
  const voci = [];
  for (let i = inizio + 1; i < lista.length; i += 1) {
    const m = lista[i];
    if (m?.role !== 'tool') continue;
    const avviso = leggiAvvisoAccorciato(m.content);
    if (avviso) voci.push(`${etichettaDelRisultato(m.content)} (lines ${avviso.da}–${avviso.a} not shown)`);
  }
  const k = voci.length;
  if (k === 0) return null;
  const elenco = voci.slice(0, VOCI_MASSIME_NELLA_NOTA).join(', ') + (k > VOCI_MASSIME_NELLA_NOTA ? `, +${k - VOCI_MASSIME_NELLA_NOTA} others` : '');
  return `${INIZIO_NOTA_DEGLI_ACCORCIATI}${k} ${k === 1 ? 'result of the current request is' : 'results of the current request are'} shortened: ${elenco}. Before answering, read again or search what you need. If something cannot be recovered, say clearly which part is missing.]`;
}

/** La nota M2 come la scrive TALOS: un `system` il cui testo comincia col prefisso della nota (come `eNotaDiFermata` per la nota dello Stop). */
export const eNotaDegliAccorciati = (m) => m?.role === 'system' && typeof m.content === 'string' && m.content.startsWith(INIZIO_NOTA_DEGLI_ACCORCIATI);

/** La lista che parte verso il modello, con la nota `system` in coda (la piega della decisione 194 la avvolge in <talos-note>); la STESSA
    lista se non serve. */
export function conNotaDegliAccorciati(messaggi) {
  const nota = notaDegliAccorciati(messaggi);
  if (nota === null) return messaggi;
  return [...messaggi, { role: 'system', content: nota }];
}

/** Per chi NON piega (Responses, motore locale che regge i system, agente esterno, la stima della linea certa): la nota M2 torna la
    `user` <talos-note> di prima, stesso posto e stessi byte. La STESSA lista se non c'è nessuna nota. */
export function notaDegliAccorciatiComeUtente(messaggi) {
  if (!Array.isArray(messaggi) || !messaggi.some(eNotaDegliAccorciati)) return messaggi;
  return messaggi.map((m) => (eNotaDegliAccorciati(m) ? { role: 'user', content: `<${SEGNO_NOTA}>\n${m.content}\n</${SEGNO_NOTA}>` } : m));
}
