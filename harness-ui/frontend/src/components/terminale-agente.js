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
import { leggiEsitoComando, rigaDiStatoComando } from './esito-comando.js';

/** Le righe dell'uscita viva che si tengono: la stessa misura della chat (`RIGHE_USCITA_VIVA` in `legacy/app.js`). */
export const RIGHE_VIVE_AGENTE = 40;

/** L'id stabile della scheda di un giro. `null` (giro non dichiarato) ha la sua scheda senza numero. */
export function idSchedaAgente(giro) {
  return giro == null ? 'agente' : `agente-giro-${giro}`;
}

/* `in-attesa` è un comando ancora aperto che tace da un po' (`inspector.js`, SOGLIA_ATTESA_MS): è vivo anche lui.
   `in-consenso` (02/10/2026) aspetta la persona: il giro non è finito, la scheda resta viva. */
const STATI_VIVI = new Set(['in-avvio', 'in-corso', 'in-attesa', 'in-consenso']);

function coda(testo, righe) {
  const parti = testo.split('\n');
  const finale = testo.endsWith('\n');
  const piene = finale ? parti.slice(0, -1) : parti;
  if (piene.length <= righe) return testo;
  return `${piene.slice(-righe).join('\n')}${finale ? '\n' : ''}`;
}

/**
 * @param {object[]} eventi gli eventi della sessione, in ordine
 * @param {{chiuse?: Map<string, number>, righeVive?: number, adesso?: number, uscite?: Map<string, {vivo?:string, testo?:string|null}>|null}} [opzioni]
 *   `chiuse`: id della scheda → quanti comandi aveva quando la persona l'ha chiusa. Resta chiusa finché il suo giro non ne
 *   lancia uno nuovo (nasconderlo sarebbe tacere un comando).
 *   `uscite` (passo 2, 02/10/2026): il testo dell'uscita tenuto FUORI dagli eventi. `legacy/app.js` non conserva il
 *   `content` nella sua lista degli eventi (può essere enorme): lo tiene, con un tetto, in una mappa sua, e la passa qui.
 *   Dove c'è, vince sul testo letto dagli eventi.
 * @returns {{terminalId:string, origine:'agente', giro:number|null, stato:'live'|'terminato', esito:'in-corso'|'concluso'|'con-errori', comandi:object[]}[]}
 */
export function schedeAgenteDagliEventi(eventi = [], { chiuse = new Map(), righeVive = RIGHE_VIVE_AGENTE, adesso = Date.now(), uscite = null } = {}) {
  /* ⛔ 02/10/2026, owner: i comandi «!» della PERSONA non vanno nelle schede agente — restano nella card in chat e nei
     Processi («tu»). `chi` è lo stesso criterio della card (`giroComandoDiretto` + `shell`, PO-06). */
  const processi = processiDagliEventi(eventi, { adesso }).filter((p) => p.chi !== 'tu');
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
    if (!perGiro.has(id)) perGiro.set(id, { terminalId: id, origine: 'agente', giro: p.giro ?? null, stato: 'terminato', esito: 'concluso', comandi: [] });
    const scheda = perGiro.get(id);
    const fuori = uscite?.get?.(p.id);
    const testo = typeof fuori?.testo === 'string' ? fuori.testo : (testi.has(p.id) ? testi.get(p.id) : null);
    scheda.comandi.push({
      id: p.id, comando: p.comando, descrizione: p.descrizione, cwd: p.cwd, stato: p.stato, uscita: p.uscita,
      durataMs: p.durataMs, avviatoA: p.avviatoA,
      testo,
      sfrattato: fuori?.sfrattato === true,
      vivo: testo === null ? (typeof fuori?.vivo === 'string' ? coda(fuori.vivo, righeVive) : (vivi.get(p.id) ?? '')) : '',
    });
    if (STATI_VIVI.has(p.stato)) scheda.stato = 'live';
  }
  /* ⛔ 02/10/2026, owner: finito il giro, il pallino è verde se tutti i comandi sono riusciti e rosso se almeno uno è
     «Non riuscito»; un annullato o un fermato NON conta come errore, come nei Processi. */
  for (const s of perGiro.values()) {
    s.esito = s.stato === 'live' ? 'in-corso' : s.comandi.some((c) => c.stato === 'fallito') ? 'con-errori' : 'concluso';
  }
  const schede = [...perGiro.values()].filter((s) => !(chiuse.has(s.terminalId) && s.comandi.length <= chiuse.get(s.terminalId)));
  return schede.sort((a, b) => (a.giro ?? -1) - (b.giro ?? -1));
}

/* I colori ANSI prendono la scala del tema (`temaTerminaleReale` in legacy/app.js): niente colori scritti qui. */
const ANSI = Object.freeze({ grassetto: '\x1b[1m', attenuato: '\x1b[2m', rosso: '\x1b[31m', verde: '\x1b[32m', giallo: '\x1b[33m', fine: '\x1b[0m' });
const TONO_DELLO_STATO = Object.freeze({ riuscito: ANSI.verde, fallito: ANSI.rosso, annullato: ANSI.giallo, ucciso: ANSI.giallo, 'in-consenso': ANSI.giallo, 'non-eseguito': '' });
const aCapoXterm = (testo) => String(testo).replace(/\r?\n/g, '\r\n');
const NASCONDI_CURSORE = '\x1b[?25l';

/**
 * La riga d'esito di un comando, nelle parole della card in chat (`leggiEsitoComando`, `rigaDiStatoComando`): verdetto,
 * dove è girato, quanto ci ha messo. `null` mentre il comando gira: lo dice il pallino della scheda.
 */
export function rigaEsitoComandoAgente(c = {}) {
  if (c.stato === 'in-consenso') return 'Aspetta il tuo consenso';
  if (typeof c.testo !== 'string') return null;
  const esito = leggiEsitoComando(c.testo);
  if (!esito.verdetto) return c.stato === 'non-eseguito' ? 'Non eseguito: il comando non è partito' : null;
  return rigaDiStatoComando(esito, Number.isFinite(c.durataMs) ? c.durataMs : null);
}

/**
 * Il testo della scheda per la xterm in sola lettura: per ogni comando `$ comando`, l'uscita (senza le righe che parlano
 * al modello: testata, riferimento all'output conservato) e la riga d'esito; una riga vuota fra un comando e l'altro.
 * Modulo PURO: chi scrive confronta questo testo con quello già scritto e manda solo la differenza (come Hermes,
 * `agent-terminal-stream.ts`, `syncAgentTerminalSnapshot`: se il nuovo prolunga il vecchio si scrive il resto, se no da capo).
 */
export function testoSchedaAgente(scheda = {}) {
  const blocchi = [];
  for (const c of scheda.comandi || []) {
    const righe = [`${ANSI.grassetto}$ ${c.comando || c.descrizione || 'comando'}${ANSI.fine}`];
    const letto = typeof c.testo === 'string' ? leggiEsitoComando(c.testo) : null;
    /* senza testata (un rifiuto: «REFUSED. …», in inglese e per il modello) l'uscita non si mostra: lo dice la riga d'esito */
    const uscita = letto ? (letto.verdetto ? letto.output : '') : c.vivo || '';
    /* le righe vuote in CODA non dicono niente e staccano l'esito dal suo comando (visto in foto, 02/10) */
    if (uscita.trim()) righe.push(uscita.replace(/(?:\r?\n[ \t]*)+$/u, ''));
    /* oltre i tetti di app.js (`registraUscitaAgente`) l'uscita se ne va e resta la testata: si dice, mai in silenzio */
    if (c.sfrattato) righe.push(`${ANSI.attenuato}(uscita non più tenuta in questa pagina: troppo testo in questa sessione)${ANSI.fine}`);
    const esito = rigaEsitoComandoAgente(c);
    if (esito) righe.push(`${ANSI.attenuato}${TONO_DELLO_STATO[c.stato] ?? ''}— ${esito}${ANSI.fine}`);
    blocchi.push(righe.join('\n'));
  }
  /* ⛔ 02/10/2026, visto in foto: in sola lettura il cursore a blocco restava acceso in fondo, come se aspettasse un
     comando. DECTCEM («CSI ? 25 l», nascondi il cursore) in testa: dopo un `reset()` la xterm lo riaccende, e il testo
     si riscrive sempre da qui. */
  return blocchi.length ? `${NASCONDI_CURSORE}${aCapoXterm(`${blocchi.join('\n\n')}\n`)}` : '';
}
