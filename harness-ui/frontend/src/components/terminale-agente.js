/*
 * ⭐ PO-10 (owner 28/09/2026) → BUG-23 (owner 05/10/2026) — LA SCHEDA AGENTE DEL TERMINALE, in sola lettura.
 *
 * Decisioni dell'owner: i comandi dell'agente compaiono nel Terminale in una scheda SUA, in sola lettura, coi comandi
 * in fila ($ comando, uscita, esito); niente tastiera — il 28/8 lo specchio nella PTY dell'utente fu tolto perché
 * creava una gara con la tastiera umana (`legacy/app.js`, commento «il tool shell dell'AGENTE non viene più specchiato»).
 * La scheda compare senza rubare il fuoco, resta finché c'è la sessione e si chiude a mano.
 *
 * ⭐ BUG-23 (owner 05/10/2026, dal vivo sulla 0.1.23: «la scheda terminale lagga un botto e apre una nuova scheda ad
 * ogni processo») sostituisce la scheda per giro di PO-10 con UNA scheda «agente» per sessione (forma Cline/Hermes):
 * i comandi di TUTTI i giri in fila, un separatore attenuato «── giro N ──» prima del primo comando di ogni giro, il
 * giro CORRENTE sul record (lo mostra il piede, non la linguetta). Il pallino dice l'esito dell'ULTIMO giro.
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
import { t } from './lingua.js';
import { processiDagliEventi } from './inspector.js';
import { leggiEsitoComando, rigaDiStatoComando } from './esito-comando.js';

/** Le righe dell'uscita viva che si tengono: la stessa misura della chat (`RIGHE_USCITA_VIVA` in `legacy/app.js`). */
export const RIGHE_VIVE_AGENTE = 40;

/** ⭐ BUG-23: l'id dell'UNICA scheda agente della sessione — non cambia più col giro. */
export function idSchedaAgente() {
  return 'agente';
}

/* `in-attesa` è un comando ancora aperto che tace da un po' (`inspector.js`, SOGLIA_ATTESA_MS): è vivo anche lui.
   `in-consenso` (02/10/2026) aspetta la persona: il giro non è finito, la scheda resta viva. */
const STATI_VIVI = new Set(['in-avvio', 'in-corso', 'in-attesa', 'in-consenso']);

/**
 * ⭐ BUG-23 (cura F1): l'id dell'unico comando VIVO, o `null` se i vivi non sono esattamente uno. `app.js` appende i
 * delta direttamente sulla xterm SOLO per lui: con due comandi vivi insieme (un processo in sfondo + un comando nuovo)
 * gli snapshot tornano l'ordine vero e l'append diretto tace, per non intrecciare due uscite.
 */
export function idComandoVivoUnico(comandi = []) {
  const vivi = comandi.filter((c) => STATI_VIVI.has(c.stato));
  return vivi.length === 1 ? vivi[0].id : null;
}

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
 *   `chiuse`: id della scheda → quanti comandi aveva quando la persona l'ha chiusa. Resta chiusa finché l'agente non
 *   lancia un comando nuovo (nasconderlo sarebbe tacere un comando).
 *   `uscite` (passo 2, 02/10/2026): il testo dell'uscita tenuto FUORI dagli eventi. `legacy/app.js` non conserva il
 *   `content` nella sua lista degli eventi (può essere enorme): lo tiene, con un tetto, in una mappa sua, e la passa qui.
 *   Dove c'è, vince sul testo letto dagli eventi.
 * @returns {{terminalId:string, origine:'agente', giro:number|null, stato:'live'|'terminato', esito:'in-corso'|'concluso'|'con-errori', comandi:object[]}[]}
 *   Una scheda sola: tutti i comandi della sessione in ordine di partenza; `giro` è il giro CORRENTE (dell'ultimo comando).
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
  if (!inFila.length) return [];
  const scheda = { terminalId: idSchedaAgente(), origine: 'agente', giro: null, stato: 'terminato', esito: 'concluso', comandi: [] };
  for (const p of inFila) {
    const fuori = uscite?.get?.(p.id);
    const testo = typeof fuori?.testo === 'string' ? fuori.testo : (testi.has(p.id) ? testi.get(p.id) : null);
    scheda.comandi.push({
      id: p.id, comando: p.comando, descrizione: p.descrizione, cwd: p.cwd, stato: p.stato, uscita: p.uscita,
      durataMs: p.durataMs, avviatoA: p.avviatoA, giro: p.giro ?? null,
      testo,
      sfrattato: fuori?.sfrattato === true,
      vivo: testo === null ? (typeof fuori?.vivo === 'string' ? coda(fuori.vivo, righeVive) : (vivi.get(p.id) ?? '')) : '',
    });
    scheda.giro = p.giro ?? null; // il giro CORRENTE: quello dell'ultimo comando arrivato
    if (STATI_VIVI.has(p.stato)) scheda.stato = 'live';
  }
  /* ⛔ 02/10/2026, owner: finito il giro, il pallino è verde se i comandi sono riusciti e rosso se almeno uno è
     «Non riuscito»; un annullato o un fermato NON conta come errore, come nei Processi.
     ⭐ BUG-23: con una scheda per TUTTA la sessione il pallino dice l'esito dell'ULTIMO giro — un fallimento vecchio
     non deve tenere la scheda rossa per sempre. */
  if (scheda.stato === 'live') scheda.esito = 'in-corso';
  else {
    const ultimo = scheda.comandi.at(-1)?.giro;
    scheda.esito = scheda.comandi.filter((c) => c.giro === ultimo).some((c) => c.stato === 'fallito') ? 'con-errori' : 'concluso';
  }
  if (chiuse.has(scheda.terminalId) && scheda.comandi.length <= chiuse.get(scheda.terminalId)) return [];
  return [scheda];
}

/* I colori ANSI prendono la scala del tema (`temaTerminaleReale` in legacy/app.js): niente colori scritti qui. */
const ANSI = Object.freeze({ grassetto: '\x1b[1m', attenuato: '\x1b[2m', rosso: '\x1b[31m', verde: '\x1b[32m', giallo: '\x1b[33m', fine: '\x1b[0m' });
const TONO_DELLO_STATO = Object.freeze({ riuscito: ANSI.verde, fallito: ANSI.rosso, annullato: ANSI.giallo, ucciso: ANSI.giallo, 'in-consenso': ANSI.giallo, 'non-eseguito': '' });
export const aCapoXterm = (testo) => String(testo).replace(/\r?\n/g, '\r\n');
const NASCONDI_CURSORE = '\x1b[?25l';

/* ⭐ BUG-23 (cura F3) — IL TETTO DELLA VISTA. Al comando che finisce, l'uscita vera può essere ENORME (il tetto della
   memoria in app.js è 256.000 caratteri per comando): riscriverla intera sulla xterm in un colpo era lo scatto a fine
   comando. La vista mostra testa + coda + la nota con quanti caratteri ha lasciato; l'output INTERO resta dove sta già:
   conservato lato server/card («conserva output»). */
const USCITA_VISTA_MAX_CARATTERI = 16_000;
const VISTA_TESTA_CARATTERI = 2_000;
const VISTA_CODA_CARATTERI = 6_000;

function uscitaPerLaVista(uscita) {
  if (uscita.length <= USCITA_VISTA_MAX_CARATTERI) return uscita;
  const tagliati = uscita.length - (VISTA_TESTA_CARATTERI + VISTA_CODA_CARATTERI);
  return `${uscita.slice(0, VISTA_TESTA_CARATTERI)}\n${ANSI.attenuato}${t('processi.agentTerminal.outputCapped', { n: String(tagliati) })}${ANSI.fine}\n${uscita.slice(-VISTA_CODA_CARATTERI)}`;
}

/**
 * La riga d'esito di un comando, nelle parole della card in chat (`leggiEsitoComando`, `rigaDiStatoComando`): verdetto,
 * dove è girato, quanto ci ha messo. `null` mentre il comando gira: lo dice il pallino della scheda.
 */
export function rigaEsitoComandoAgente(c = {}) {
  if (c.stato === 'in-consenso') return t('processi.agentTerminal.awaitingConsent');
  if (typeof c.testo !== 'string') return null;
  const esito = leggiEsitoComando(c.testo);
  if (!esito.verdetto) return c.stato === 'non-eseguito' ? t('processi.agentTerminal.notRun') : null;
  return rigaDiStatoComando(esito, Number.isFinite(c.durataMs) ? c.durataMs : null);
}

/**
 * Il testo della scheda per la xterm in sola lettura: per ogni giro il separatore attenuato, per ogni comando
 * `$ comando`, l'uscita (senza le righe che parlano al modello: testata, riferimento all'output conservato) e la riga
 * d'esito; una riga vuota fra un comando e l'altro.
 * Modulo PURO: chi scrive confronta questo testo con quello già scritto e manda solo la differenza (come Hermes,
 * `agent-terminal-stream.ts`, `syncAgentTerminalSnapshot`: se il nuovo prolunga il vecchio si scrive il resto, se no da capo).
 */
export function testoSchedaAgente(scheda = {}) {
  const blocchi = [];
  let giroPrecedente;
  for (const c of scheda.comandi || []) {
    const righe = [];
    /* ⭐ BUG-23: il separatore apre il giro, UNA volta, prima del suo primo comando */
    if (c.giro !== giroPrecedente) {
      righe.push(`${ANSI.attenuato}${c.giro == null ? t('processi.agentTerminal.turnSeparatorAgente') : t('processi.agentTerminal.turnSeparator', { giro: c.giro })}${ANSI.fine}`);
      giroPrecedente = c.giro;
    }
    righe.push(`${ANSI.grassetto}$ ${c.comando || c.descrizione || 'comando'}${ANSI.fine}`);
    const letto = typeof c.testo === 'string' ? leggiEsitoComando(c.testo) : null;
    /* senza testata (un rifiuto: «REFUSED. …», in inglese e per il modello) l'uscita non si mostra: lo dice la riga d'esito */
    const uscita = letto ? (letto.verdetto ? letto.output : '') : c.vivo || '';
    /* le righe vuote in CODA non dicono niente e staccano l'esito dal suo comando (visto in foto, 02/10) */
    if (uscita.trim()) righe.push(uscitaPerLaVista(uscita).replace(/(?:\r?\n[ \t]*)+$/u, ''));
    /* oltre i tetti di app.js (`registraUscitaAgente`) l'uscita se ne va e resta la testata: si dice, mai in silenzio */
    if (c.sfrattato) righe.push(`${ANSI.attenuato}${t('processi.agentTerminal.evicted')}${ANSI.fine}`);
    const esito = rigaEsitoComandoAgente(c);
    if (esito) righe.push(`${ANSI.attenuato}${TONO_DELLO_STATO[c.stato] ?? ''}— ${esito}${ANSI.fine}`);
    blocchi.push(righe.join('\n'));
  }
  /* ⛔ 02/10/2026, visto in foto: in sola lettura il cursore a blocco restava acceso in fondo, come se aspettasse un
     comando. DECTCEM («CSI ? 25 l», nascondi il cursore) in testa: dopo un `reset()` la xterm lo riaccende, e il testo
     si riscrive sempre da qui. */
  return blocchi.length ? `${NASCONDI_CURSORE}${aCapoXterm(`${blocchi.join('\n\n')}\n`)}` : '';
}


/* ⛔ 04/10/2026, BUG-C — IL MEMO PURA. `schedeAgenteDagliEventi` ripercorre TUTTI gli eventi e
   `testoSchedaAgente` ricostruisce il testo: a ogni frame durante un output lungo era O(N) per
   chiamata, O(N^2) cumulativo. La chiave del memo copre ciò che può cambiare davvero.
   ⭐ BUG-23 (cura F2): la `revisione` delle uscite ESCE dalla chiave — i delta cambiano i VALORI
   senza cambiare la struttura, e ricalcolare a ogni delta era ancora O(N) per frame. Il testo vivo
   lo scrive DIRETTAMENTE la xterm (F1 in app.js); dove la scheda NON è montata si ricostruisce al
   montaggio, una volta. Il testo degli ESITI arriva con l'evento `ToolCallResult`, che è un push
   nuovo: la chiave lo vede. La funzione è pura e si prova senza DOM. */
export function creaMemoSchedeAgente() {
  return { chiave: null, schede: null };
}

export function schedeAgenteConMemo(eventi, opzioni = {}, memo = creaMemoSchedeAgente()) {
  const { sessione = '', uscite = null, chiuse = null, ...resto } = opzioni;
  const chiave = `${sessione}|${eventi.length}|${chiuse?.size ?? 0}`;
  if (memo.chiave === chiave && memo.schede) return memo.schede;
  /* ⛔ null esplicito NON attiva i default della funzione chiamata (chiuse => new Map()): chi non
     ha la mappa non la passa, com'era prima del memo. */
  const schede = schedeAgenteDagliEventi(eventi, { ...resto, ...(uscite ? { uscite } : {}), ...(chiuse ? { chiuse } : {}) });
  memo.chiave = chiave;
  memo.schede = schede;
  return schede;
}
