/**
 * Desktop-only black-box hotfix adapter (2026-09-15).
 *
 * The benchmarked kernel stays byte-identical. This module re-exports its
 * public contract and only adapts desktop invocation boundaries that the
 * black-box campaign proved ambiguous or lossy:
 * - tool results are not truncated to 8k merely because Context Engine is off;
 * - legacy compaction is preserved when Context Engine is off;
 * - incomplete searches never become a hard "does not exist" conclusion;
 * - shell output explicitly declares stdout/stderr are combined and flags
 *   suspicious PowerShell diagnostics even when the process reports exit 0;
 * - `elenca` distinguishes "file" from "missing folder" before the next turn;
 * - default `npm test` is replaced by an explicit no-suite diagnostic when
 *   package.json has no usable test script;
 * - a bounded inactivity diagnostic identifies whether a stall is in provider
 *   response, tool execution, or the gap between them.
 *
 * This file is selected only by desktop launchers. Mobile keeps its own
 * runtime wiring and the canonical kernel remains the benchmark source.
 */
import { lstatSync, realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { isPathInside } from '../path-policy.mjs';
import * as compattazione from './compattazione-desktop.mjs';
import * as kernel from './talosHarness.mjs';
// ⭐ 06/10/2026 — la ricarica della memoria post-compact (opzione A, ricerca 5×5×5×5 §6.4): il blocco di
// fatti freschi che `compattaOra` fonde nella proiezione, accanto all'indice meccanico.
import { costruisciBloccoFatti } from './ricarica-post-compact.mjs';

export * from './talosHarness.mjs';

export const DESKTOP_BLACKBOX_HOTFIX_VERSION = '2026-09-15';
export const NO_TEST_SUITE_CODE = 'NO_TEST_SUITE_CONFIGURED';
export const STALL_DIAGNOSTIC_EVENT = 'desktop-harness-stall';

const STALL_MS_DEFAULT = 45_000;
/* Owner 26/09/2026: la compattazione nel giro si ferma solo davanti al pavimento vero; questa è la rete se la stima del
 * pavimento sbaglia (Hermes ha la sua anti-thrash, `context_compressor.py:2569`). Sei compattazioni rimaste sopra la
 * soglia in un turno sono già un'anomalia da vedere, non un regime. */
const INEFFICACI_TOTALI_MASSIME = 6;
const MAX_TIMER_MS = 2_147_483_647;
const SHELL_COMBINED_NOTICE = '[shell output: stdout and stderr combined in arrival order; stream identity is not preserved]';
const SEARCH_INCOMPLETE_NOTICE = 'SEARCH INCOMPLETE: results are partial; missing paths are NOT proof that a file does not exist.';
const POWERSHELL_ZERO_WARNING = '⚠ SHELL_DIAGNOSTIC_WITH_ZERO_EXIT: PowerShell emitted a structured error diagnostic even though the process reported exit 0. Treat this command as NOT VERIFIED until the diagnostic is resolved.';
const POWERSHELL_DIAGNOSTIC = /(?:^|\n)\s*(?:CategoryInfo\s*:|FullyQualifiedErrorId\s*:|At line:\d+|ParserError\b|CommandNotFoundException\b|ObjectNotFound\b|NativeCommandError\b|TerminatingError\b)/im;
const SHELL_EXECUTION_HEADER = /^exit\s+-?\d+\s+\[sandbox:[^\]]+\](?:\r?\n|$)/i;
const SHELL_ZERO_HEADER = /^exit\s+0\s+\[sandbox:[^\]]+\](?:\r?\n|$)/i;
const DEFAULT_NPM_TEST = /^npm\s+test\s*$/i;
const PLACEHOLDER_NPM_TEST = /^\s*echo\s+(?:["']?error:\s*)?no test specified["']?\s*(?:&&|;)\s*exit\s+1\s*$/i;
/*
 * ⛔⛔ H-04 (owner 02/10/2026, «Voglio il +1»): qui c'era un comando FINTO, `1>&2 echo NO_TEST_SUITE_CONFIGURED…&& exit 127`, lanciato
 *   davvero perché la riga dei Processi dicesse «Non eseguito» (BLOCCO 5, 20/09: «lo stesso fatto deve avere lo stesso codice»;
 *   F017, 01/10: niente eseguibile, perché nel pacchetto TALOS.exe partiva come app). Ma 127 in POSIX è «comando non trovato», e il
 *   numero era fabbricato. ⇒ Nessun processo: il desktop dice al kernel PERCHÉ la suite non c'è, e il kernel risponde il suo
 *   NOT RUN, senza codice d'uscita, coi runner del progetto come mossa dopo. Lo stesso fatto ha ancora la stessa forma.
 */
const PATH_SPECIAL = /^(?:[\\/]|[A-Za-z]:)|(?:^|[\\/])[^\\/]*:[^\\/]*(?:[\\/]|$)/u;

function parseToolCall(call) {
  if (!call?.id) return null;
  let args = {};
  try { args = JSON.parse(call.function?.arguments || '{}'); } catch { /* malformed calls are handled by the kernel */ }
  return { id: call.id, name: call.function?.name ?? '', args };
}

function pathArg(args) {
  for (const key of ['percorso', 'path', 'file_path', 'filePath', 'file', 'filename']) {
    if (typeof args?.[key] === 'string' && args[key].length > 0) return args[key];
  }
  return '';
}

function classifyElencaTarget(cartella, args) {
  const requested = pathArg(args);
  if (!requested) return null;
  if (
    typeof cartella !== 'string' || !cartella
    || requested.includes('\0') || isAbsolute(requested) || PATH_SPECIAL.test(requested)
  ) return { type: 'outside', requested };

  try {
    const rootReal = realpathSync(resolve(cartella));
    const lexical = resolve(rootReal, requested);
    if (!isPathInside(rootReal, lexical)) return { type: 'outside', requested };

    const rel = relative(rootReal, lexical);
    const segments = rel === '' ? [] : rel.split(/[\\/]+/u).filter(Boolean);
    let current = rootReal;
    if (segments.length === 0) return { type: 'directory', requested };

    for (let index = 0; index < segments.length; index += 1) {
      current = join(current, segments[index]);
      let stat;
      try { stat = lstatSync(current); }
      catch (error) {
        if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return { type: 'missing', requested };
        return { type: 'unreadable', requested };
      }
      // Fail closed on every reparse point. A parent junction/symlink must not
      // turn this diagnostic adapter into an existence oracle outside workspace.
      if (stat.isSymbolicLink()) return { type: 'unreadable', requested };
      if (index < segments.length - 1 && !stat.isDirectory()) return { type: 'unreadable', requested };
      if (index === segments.length - 1) {
        if (stat.isFile()) return { type: 'file', requested };
        if (stat.isDirectory()) return { type: 'directory', requested };
        return { type: 'other', requested };
      }
    }
  } catch {
    return { type: 'unreadable', requested };
  }
  return { type: 'unreadable', requested };
}

function shellExecutionBase(text) {
  let base = text;
  if (base.startsWith(`${POWERSHELL_ZERO_WARNING}\n`)) base = base.slice(POWERSHELL_ZERO_WARNING.length + 1);
  if (base.startsWith(`${SHELL_COMBINED_NOTICE}\n`)) base = base.slice(SHELL_COMBINED_NOTICE.length + 1);
  return base;
}

export function correggiEsitoToolDesktop({ name, args, content, cartella }) {
  let text = String(content ?? '');

  /* 27/09/2026 (owner): the kernel itself now opens an incomplete zero-match search with «inconclusive search: …»
     (`RICERCA_NON_CONCLUSIVA`), for ripgrep and for the JS walk alike, so the «no file matches.» rewrite that lived here
     could no longer fire. The notice stays: it also covers a PARTIAL result list, not only an empty one. */
  if (name === 'cerca' && /⚠\s*incomplete scan:/i.test(text)) {
    if (!text.startsWith(SEARCH_INCOMPLETE_NOTICE)) text = `${SEARCH_INCOMPLETE_NOTICE}\n${text}`;
  }

  /* F-027, estensione (03/10/2026): solo la FRASE di TALOS, a inizio testo — l'elenco ora sta nel confine dei dati, e un file
     che si chiama come la frase non deve far sostituire l'elenco intero. */
  if (name === 'elenca' && /^"[^"\n]*" is not a readable folder of this workspace\./u.test(text)) {
    const target = classifyElencaTarget(cartella, args);
    if (target?.type === 'file') {
      text = `"${target.requested}" is a FILE, not a folder. Use \`leggi\` to read it; use \`elenca\` only on directories.`;
    } else if (target?.type === 'missing') {
      text = `"${target.requested}" does not exist in this workspace. Use \`cerca\` to locate the file or folder instead of treating it as an unreadable directory.`;
    } else if (target?.type === 'outside') {
      text = `REFUSED. "${target.requested}" resolves outside the workspace.`;
    }
  }

  if (name === 'shell') {
    const base = shellExecutionBase(text);
    const executed = SHELL_EXECUTION_HEADER.test(base);
    const suspiciousZero = executed && SHELL_ZERO_HEADER.test(base) && POWERSHELL_DIAGNOSTIC.test(base);
    // Only an actually executed shell result has stdout/stderr streams. Permission
    // refusals and malformed calls must not be labelled as if a process ran.
    if (executed && !text.includes(SHELL_COMBINED_NOTICE)) text = `${SHELL_COMBINED_NOTICE}\n${text}`;
    if (suspiciousZero && !text.startsWith(POWERSHELL_ZERO_WARNING)) text = `${POWERSHELL_ZERO_WARNING}\n${text}`;
  }

  return text;
}

export function correggiMessaggiDesktop(messages, { cartella } = {}) {
  if (!Array.isArray(messages)) return messages;
  const calls = new Map();
  const fixed = [];
  let changed = false;

  for (const message of messages) {
    for (const rawCall of message?.tool_calls ?? []) {
      const call = parseToolCall(rawCall);
      if (call) calls.set(call.id, call);
    }

    if (message?.role !== 'tool' || !message.tool_call_id) {
      fixed.push(message);
      continue;
    }

    const call = calls.get(message.tool_call_id);
    if (!call) {
      fixed.push(message);
      continue;
    }
    const content = correggiEsitoToolDesktop({ ...call, content: message.content, cartella });
    calls.delete(message.tool_call_id);
    if (content === String(message.content ?? '')) fixed.push(message);
    else {
      changed = true;
      fixed.push({ ...message, content });
    }
  }
  return changed ? fixed : messages;
}

/*
 * Perché la suite di serie (`npm test`) non c'è, detto al kernel — o `null` quando si lancia il comando com'è: un comando
 *   esplicito, un `package.json` illeggibile (la diagnosi vera è quella di npm), una cartella che non c'è.
 * ⛔ F017 (01/10/2026): nessun eseguibile lanciato per dirlo — oggi nessun processo affatto.
 */
export async function motivoProvaSenzaSuiteDesktop({ cartella, comandoProva, esplicito = false } = {}) {
  if (esplicito || (typeof comandoProva === 'string' && !DEFAULT_NPM_TEST.test(comandoProva.trim()))) return null;
  if (typeof cartella !== 'string' || !cartella) return null;
  try { if (!lstatSync(cartella).isDirectory()) return null; }
  catch { return null; }

  let raw;
  try { raw = await readFile(join(cartella, 'package.json'), 'utf8'); }
  catch (error) { return error?.code === 'ENOENT' ? 'there is no package.json in this folder' : null; }

  let packageJson;
  try { packageJson = JSON.parse(raw); }
  catch { return null; }

  const test = packageJson?.scripts?.test;
  if (typeof test !== 'string' || !test.trim()) return 'package.json has no scripts.test';
  if (PLACEHOLDER_NPM_TEST.test(test)) return 'package.json scripts.test is the npm init placeholder, which only prints "no test specified"';
  return null;
}

function usageAdd(target, usage) {
  if (!usage || typeof usage !== 'object') return;
  target.prompt_tokens += Number(usage.prompt_tokens ?? 0) || 0;
  target.completion_tokens += Number(usage.completion_tokens ?? 0) || 0;
  target.cached_tokens += Number(
    usage.prompt_tokens_details?.cached_tokens
      ?? usage.cache_read_input_tokens
      ?? usage.prompt_cache_hit_tokens
      ?? 0,
  ) || 0;
  target.giri += 1;
}

function mergeUsage(resultUsage, extra) {
  const merged = {
    prompt_tokens: Number(resultUsage?.prompt_tokens ?? 0) || 0,
    completion_tokens: Number(resultUsage?.completion_tokens ?? 0) || 0,
    prompt_tokens_details: {
      cached_tokens: Number(resultUsage?.prompt_tokens_details?.cached_tokens ?? 0) || 0,
    },
    giri: Number(resultUsage?.giri ?? 0) || 0,
  };
  merged.prompt_tokens += extra.prompt_tokens;
  merged.completion_tokens += extra.completion_tokens;
  merged.prompt_tokens_details.cached_tokens += extra.cached_tokens;
  merged.giri += extra.giri;
  return merged.giri > 0 ? merged : null;
}

function stallTimeoutFromEnv(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return STALL_MS_DEFAULT;
  const value = Number(raw);
  if (!Number.isFinite(value) || value > MAX_TIMER_MS) return STALL_MS_DEFAULT;
  return value > 0 ? value : 0;
}

export function creaTelemetriaStallo({
  timeoutMs = stallTimeoutFromEnv(process.env.TALOS_DESKTOP_HOTFIX_STALL_MS),
  log = (record) => console.warn(`[desktop-blackbox] ${JSON.stringify(record)}`),
  now = () => Date.now(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  const numericTimeout = Number(timeoutMs);
  const effectiveTimeout = Number.isFinite(numericTimeout) && numericTimeout <= MAX_TIMER_MS
    ? Math.max(0, numericTimeout)
    : STALL_MS_DEFAULT;
  let timer = null;
  let stage = 'starting';
  let since = now();
  let closed = false;

  const arm = () => {
    if (closed || !(effectiveTimeout > 0)) return;
    if (timer) clearTimer(timer);
    timer = setTimer(() => {
      timer = null;
      if (closed) return;
      // One record per uninterrupted inactivity window. New activity calls
      // mark(), which arms a fresh window; a hard hang cannot flood stderr.
      log({ event: STALL_DIAGNOSTIC_EVENT, stage, stalledMs: Math.max(0, now() - since) });
    }, effectiveTimeout);
    timer?.unref?.();
  };

  const mark = (nextStage) => {
    if (closed) return;
    stage = nextStage || stage;
    since = now();
    arm();
  };
  const close = () => {
    closed = true;
    if (timer) clearTimer(timer);
    timer = null;
  };
  arm();
  return { mark, close, snapshot: () => ({ stage, since }) };
}

function safeToolName(name) {
  return String(name ?? '').replace(/[^A-Za-z0-9_.:-]+/g, '?').slice(0, 48) || 'unknown';
}

function toolStage(rawCalls) {
  const names = rawCalls.map((call) => call?.function?.name).filter(Boolean).map(safeToolName);
  if (names.length === 0) return 'assistant-finished';
  const sample = [...new Set(names)].slice(0, 3);
  const extra = names.length > 3 ? `,+${names.length - 3}` : '';
  return `tool:${sample.join(',')}${extra}`;
}

function wrapOnDelta(original, telemetry) {
  if (typeof original !== 'function') return original;
  return (event) => {
    telemetry.mark('provider-stream');
    return original(event);
  };
}

function wrapOnGiro(original, { cartella, telemetry, calls }) {
  return (event) => {
    let next = event;
    if (event?.tipo === 'risposta') {
      for (const rawCall of event.risposta?.tool_calls ?? []) {
        const call = parseToolCall(rawCall);
        if (call) calls.set(call.id, call);
      }
      telemetry.mark(toolStage(event.risposta?.tool_calls ?? []));
    } else if (event?.tipo === 'tool-uscita') {
      const call = calls.get(event.toolCallId);
      telemetry.mark(call ? `tool:${safeToolName(call.name)}` : 'tool-output');
    } else if (event?.tipo === 'tool-esito') {
      const call = calls.get(event.toolCallId);
      const content = call
        ? correggiEsitoToolDesktop({ ...call, content: event.content, cartella })
        : event.content;
      if (content !== event.content) next = { ...event, content };
      calls.delete(event.toolCallId);
      telemetry.mark('between-tool-and-provider');
    } else if (event?.tipo === 'ricevuta') {
      telemetry.mark('tool-receipt');
    }
    return original?.(next);
  };
}

/*
 * ⛔⛔⛔ LA COMPATTAZIONE DEL 4174 — RIFATTA IL 24/09/2026 (fase F2, corsia F1).
 *
 * Com'era, e perché era rotta (ricognizione `RICOGNIZIONE-CONTEXT-ENGINE-2026-09-24.md`, riprodotta sulla base
 * `e2eb2a5ce` con la sonda `sonda-compattazione-hotfix.mjs`):
 *   K1 — scattava su `serveCompattare(requestIndex, …)`, cioè sull'indice delle richieste DEL TURNO (`providerRequests`
 *        riparte da 0 a ogni `talosLavora`): sei turni da tre attrezzi, 7.504 token, **zero** riassunti.
 *   K2 — la proiezione viveva nella closure (`compacted`) e moriva col turno: il turno dopo rimandava la storia intera.
 *   K3 — `compattaConversazione` teneva `messaggi[0]` e `[1]`, che sul desktop sono i DUE `system` (agente +
 *        preambolo del progetto): la consegna della persona era buttata (`consegnaPresenteDopo: [false,false,false]`).
 *   K4 — il riassuntore riceveva gli attrezzi (`attrezzi: tools`, 7 sul desktop, 4 in Piano).
 *   K5 — in Piano `rawPrefixLength` contava anche il `system` effimero accodato dal kernel (`talosHarness.mjs:8216-8220`)
 *        e la fetta dopo saltava l'`assistant` con la `tool_call`: **risultato di attrezzo orfano** (`…,0,1,1`).
 *   K8 — un 400 «maximum context length» del fornitore uccideva il giro senza un ritentativo.
 *   T1/T2 — il trial riceveva il CORRETTO in `prepare` e il GREZZO in `capture` ⇒ `CTX_HISTORY_DIVERGED`.
 *
 * Com'è, per decisione dell'owner del 24/09/2026 (brief comune F2):
 *   - la SOGLIA è sulla finestra misurata: `usage.prompt_tokens` dell'ultima risposta del fornitore (l'ancora) più la
 *     stima dei messaggi aggiunti dopo; senza ancora si stima tutto (caratteri/4) e lo si dichiara `stimato`. Scatta al
 *     minore fra `TALOS_COMPACTION_TOKEN_CAP` (default 200K) e 0,75 × finestra (`finestraToken`: null oggi, la cabla
 *     l'onda 2 dal catalogo). Valida dalla PRIMA richiesta del turno. Emergenza a 0,90 × finestra (tetto × 1,2 senza
 *     finestra): bloccante anche quando la via normale è già stata tentata. Sotto soglia NON si compatta mai.
 *   - la CODA LETTERALE: tutti i `system` iniziali, le ultime 3 richieste della persona, gli ultimi 2 scambi chiusi,
 *     più l'indice meccanico (`compattazione-desktop.mjs`, funzioni pure: là stanno la forma e le fonti).
 *   - il RIASSUNTORE non ha attrezzi, ha `max_tokens` dichiarato e ragionamento basso; un riassunto con attrezzo o
 *     vuoto si ritenta subito UNA volta, poi si va avanti senza (e per questo turno la via normale tace). ⛔ 02/10/2026:
 *     il `max_tokens` è il budget di Hermes sul mezzo (`budgetRiassunto`), e un riassunto TRONCATO non si ritenta —
 *     con lo stesso budget torna troncato uguale (sessione b1e7382a: 2 richieste, 2 × 2.048 token, zero riassunti).
 *   - il PIANO si stacca prima e si riattacca dopo: non entra né nel riassunto né nell'archivio.
 *   - il TRIAL riceve `messages` (corretto) E `originali` (grezzo), entrambi senza effimeri — contratto con F4.
 *   - ogni compattazione produce un RECORD `talos.compattazione.v1` (`coveredThrough` + proiezione + numeri): emesso su
 *     `onGiro({tipo:'compattazione-fine', record})` e sul risultato del giro in `recordDiCompattazione` (campo NUOVO,
 *     gli altri restano com'erano). L'onda 2 lo persiste e lo ripassa come `recordCompattazioneIniziale`: il turno
 *     dopo parte già proiettato senza ripagare il riassunto (`applicaRecord`).
 *   - l'OVERFLOW dichiarato dal fornitore (`classificaErroreFornitore`) vale UN ritentativo con compattazione forzata;
 *     poi l'errore passa com'è, con `classificazione:'contesto-pieno'` addosso.
 *
 * ⛔ Il PONTE dell'onda 1: la via normale scatta qui dentro, in `prepare`, bloccante. L'onda 2 la sposta in
 *   background nel registro e lascia a `prepare` la sola emergenza: le funzioni pure sono già disegnate perché sia
 *   solo un cambio di chiamante (stesso `dividi → richiesta → valuta → proiezione → record`, stesso `applicaRecord`).
 *
 * ⛔ Il ritentativo dell'overflow vive in `infer` e muta IN POSTO l'array che `prepare` ha restituito: il kernel
 *   costruisce `invoke` leggendo `preparedContext?.messages` a OGNI chiamata (`talosHarness.mjs:8224-8228`), e
 *   `chiamaConRitentaBase` serializza il corpo a ogni tentativo — quindi rimpiazzare il contenuto dell'array e
 *   richiamare `invoke()` manda la storia compattata senza toccare il kernel (che non è di questa corsia). La forma
 *   pulita sarebbe un `prepare` richiamato dal kernel dopo l'overflow: è scritta nel rapporto F1 come debito.
 */
function wrapContextHooks(original, {
  cartella, modello, chiave, fetchDiRete, segnaleStop, telemetry, extraUsage, emitOnGiro,
  reasoning, soglie, recordIniziale = null, records = [], progressoAcceso = false,
  /* ⭐ 06/10/2026 — le fonti dichiarate dall'ospite per il blocco di fatti post-compact (`input.fontiRicarica`):
   * LEDGER append-only, coda pendente, pericoli aperti. `cartella` (la cartella della sessione) resta la fonte
   * del `git log` locale; i file toccati vengono dall'indice meccanico di ogni compattazione. */
  fontiRicarica = null,
} = {}) {
  let compacted = compattazione.eRecordValido(recordIniziale) ? recordIniziale : null;
  let compactions = 0;
  let providerRequests = 0;
  /* L'ancora: il numero VERO del fornitore per la lista lunga `lunghezza`; null finché non arriva una risposta. */
  let ancora = null;
  let tentativiFallitiNelTurno = 0;
  let compattazioniInefficaci = 0;
  /* L'ultima compattazione ha trovato la coda letterale già al minimo (non rientrava nemmeno accorciata)? Solo allora
   * un verdetto «inefficace» vuol dire «pavimento incomprimibile» (owner 26/09: ci si ferma solo lì). */
  let ultimaCodaAlMinimo = false;
  /* Il pavimento dell'ultima compattazione (testa + richieste letterali + coda già accorciata, stimato) e la stima
   * della proiezione intera: al verdetto, lo scarto fra il numero VERO e la stima è ciò che i messaggi non contano
   * (gli schemi degli attrezzi, il tokenizzatore) e si aggiunge al pavimento. */
  let ultimoPavimentoStimato = 0;
  let ultimaProiezioneStimata = 0;
  /* Il `max_tokens` dato all'ultimo riassunto: è la dimensione massima che il riassunto aggiunge al pavimento. */
  let ultimoBudgetRiassunto = compattazione.MAX_TOKEN_RIASSUNTO;
  /* Rete di sicurezza: quante compattazioni del turno sono rimaste sopra la soglia, per QUALUNQUE ragione. */
  let inefficaciTotali = 0;
  let attendeVerdetto = false;
  let overflowRitentato = false;
  /* ⛔ BUG-5 (05/10/2026): i fallimenti CONSECUTIVI del riassuntore in questo turno (vedi compattaOra). */
  let fallimentiRiassuntoConsecutivi = 0;
  /* La richiesta che `prepare` ha appena preparato: l'array (mutabile in posto), il grezzo e gli effimeri. */
  let richiestaCorrente = null;
  const reasoningRiassunto = compattazione.reasoningPerRiassunto(reasoning);

  const legacyMode = original === undefined || original === null;
  if (!legacyMode && typeof original.prepare !== 'function') {
    throw new TypeError('contextHooks.prepare must be a function when contextHooks is configured');
  }

  /*
   * ⛔ BUG-5 (05/10/2026) — CAMBIO DI MODELLO: il record iniziale può essere stato scritto da un modello
   *   diverso (la sessione riprende con un altro). L'ancora del numero vero è per costruzione del NUOVO
   *   turno (null finché la prima risposta non arriva) e le soglie si ricalcolano su `finestraToken` del
   *   modello NUOVO: non c'è niente da azzerare, ma il cambio si DICE — l'evento resta nel giro (il
   *   traduttore AG-UI lo passerà al registro nella tranche 2), e chi legge il record sa che il riassunto
   *   che contiene fu scritto da un altro modello.
   */
  const modelloPrecedente = typeof recordIniziale?.modello === 'string' && recordIniziale.modello ? recordIniziale.modello : null;
  if (modelloPrecedente && modello && modelloPrecedente !== modello) {
    emitOnGiro?.({ giro: 0, tipo: 'compattazione-modello-cambiato', modello, modelloPrecedente });
  }

  const projectLegacy = (rawMessages) => (compacted ? compattazione.applicaRecord(rawMessages, compacted) : rawMessages);

  /*
   * Lane CLI, 03/10/2026 — `compaction.progress`: con `progressoAcceso` la compattazione dice i suoi passi VERI su
   *   `onGiro` (`tipo: 'compattazione-progresso'`): `lettura` della conversazione, `riassunto` che si conta mentre si
   *   scrive (streaming, `creaContatoreRiassunto`), `sostituzione` della storia. Spento (il default), niente cambia: né
   *   lo streaming della richiesta di riassunto né gli eventi.
   * ⛔ I pezzi del riassunto NON passano dall'`onDelta` del giro: il riassunto non è una risposta per la persona.
   * ⛔ `accettaVuota`: in streaming una risposta vuota lancerebbe, mentre senza streaming torna vuota e la giudica
   *   `valutaRispostaDiRiassunto` («vuoto»). Acceso, si tiene lo stesso esito di prima.
   */
  const progresso = (giro, valore) => { if (progressoAcceso) emitOnGiro?.({ giro, tipo: 'compattazione-progresso', ...valore }); };

  const chiediRiassunto = async (messaggiRichiesta, maxOutputTokens, contatore = null) => {
    const esito = await kernel.chiamaConRitenta({
      modello,
      chiave,
      messaggi: messaggiRichiesta,
      attrezzi: [],
      maxOutputTokens,
      ...(reasoningRiassunto ? { reasoning: reasoningRiassunto } : {}),
      ...(fetchDiRete ? { fetchDiRete } : {}),
      ...(segnaleStop ? { segnaleStop } : {}),
      ...(contatore ? { onDelta: contatore.onDelta, accettaVuota: true } : {}),
    });
    usageAdd(extraUsage, esito.usage);
    contatore?.chiudi(esito.usage);
    return compattazione.valutaRispostaDiRiassunto(esito);
  };

  /**
   * Una compattazione intera: divide, chiede il riassunto (un ritentativo immediato), costruisce proiezione e
   * record. Ritorna la proiezione nuova, o `null` se non c'è niente da riassumere o il riassuntore ha fallito.
   */
  const compattaOra = async (rawMessages, projected, { requestIndex, motivo, tokenMisurati, misura, soglia }) => {
    const divise = compattazione.dividiPerCompattazione(projected);
    /*
     * ⛔ Owner 26/09/2026, «Come Hermes»: la coda letterale sotto pressione si accorcia (inizio + fine degli esiti lunghi,
     *   doppioni tolti) PRIMA di giudicare la proiezione — altrimenti due letture grandi nella coda la tengono sopra il
     *   tetto per sempre (`compattazione-desktop.mjs`, «LA CODA LETTERALE NON È UN PAVIMENTO»).
     */
    const pressione = compattazione.riduciCodaSottoPressione(divise.coda, { budgetToken: compattazione.budgetCoda(soglie.soglia) });
    const parti = { ...divise, coda: pressione.coda };
    ultimaCodaAlMinimo = pressione.alMinimo;
    ultimoPavimentoStimato = kernel.stimaTokenConversazione([...parti.testa, ...parti.richiesteLetterali, ...parti.coda]);
    if (!parti.tagliabile) {
      /* Niente da riassumere e la coda già dentro il suo tetto: nessun tentativo, nessun evento, nessuna chiamata. */
      if (pressione.ridotti === 0) return null;
      /* Niente da riassumere ma la coda si è accorciata: la proiezione nuova è deterministica, senza il riassuntore
       * (Hermes `_FEASIBILITY_SKIP_MIDDLE_FRACTION`, `:1124-1127`: «dropping alone suffices»). */
      emitOnGiro?.({ giro: requestIndex, tipo: 'compattazione-inizio', tokenMisurati, soglia, motivo });
      progresso(requestIndex, { fase: 'lettura', messaggi: projected.length, tokenPrima: tokenMisurati, motivo });
      const proiezioneSolaCoda = [...parti.testa, ...parti.mezzo, ...parti.coda];
      const recordSolaCoda = compattazione.creaRecord({
        coveredThrough: rawMessages.length,
        riassunto: proiezioneSolaCoda,
        tokenPrima: tokenMisurati,
        tokenDopo: kernel.stimaTokenConversazione(proiezioneSolaCoda),
        misura,
        at: new Date().toISOString(),
        modello,
        indice: compacted?.indice ?? null,
      });
      /* Nessun riassunto da contare: dalla lettura si passa alla sostituzione (le fasi vere, mai finte). */
      progresso(requestIndex, { fase: 'sostituzione', tokenDopo: recordSolaCoda.tokenDopo ?? null, motivo });
      compacted = recordSolaCoda;
      ultimaProiezioneStimata = recordSolaCoda.tokenDopo ?? 0;
      records.push(recordSolaCoda);
      compactions += 1;
      ancora = null;
      attendeVerdetto = true;
      emitOnGiro?.({ giro: requestIndex, tipo: 'compattazione-fine', compattato: true, record: recordSolaCoda, soloCoda: true });
      return proiezioneSolaCoda;
    }
    emitOnGiro?.({ giro: requestIndex, tipo: 'compattazione-inizio', tokenMisurati, soglia, motivo });
    progresso(requestIndex, { fase: 'lettura', messaggi: projected.length, tokenPrima: tokenMisurati, motivo });
    const budget = compattazione.budgetRiassunto({
      tokenDaRiassumere: kernel.stimaTokenConversazione(parti.mezzo), finestraToken: soglie.finestraToken, soglia: soglie.soglia,
    });
    ultimoBudgetRiassunto = budget.maxOutputTokens;
    const richiesta = compattazione.costruisciRichiestaDiRiassunto({ ...parti, paroleMassime: budget.paroleMassime });
    /* ⛔ BUG-5 (05/10/2026): l'INGRESSO del riassuntore si LIMITA (testa+coda, marcatore in mezzo) — 213.785
     *   token di ingresso (sessione vera b1e7382a) erano la causa dei tre riassunti «troncato» su tre giri:
     *   la richiesta di riassunto da sola rientrava nell'overflow e la compattazione non sostituiva MAI la storia. */
    const richiestaLimitata = compattazione.limitaIngressoRiassunto(richiesta);
    /* ⛔ BUG-5, revisione R1 (05/10/2026): `esito` parte null. Se la GUARDIA del giro di fallimenti rompe al primo
     *   giro (contatore già al massimo: il ritentativo overflow K8 dell'infer chiama `compattaOra` senza passare da
     *   `decidiCompattazione`), nessun tentativo si paga e l'esito sintetico più sotto rende la chiusura CLASSIFICATA
     *   e osservabile (evento `compattazione-fine`), non un TypeError interno. */
    let esito = null;
    for (let tentativo = 0; tentativo < 2; tentativo += 1) {
      /* ⛔ BUG-5 (05/10/2026), il GIRO DI FALLIMENTI: si pagano al massimo `FALLIMENTI_RIASSUNTO_
       *   CONSECUTIVI_MASSIMI` tentativi consecutivi del riassuntore PER TURNO — il quarto identico non si
       *   chiede (credito, chiave o fornitore giù: un secondo giro identico non guarisce). Il contatore si
       *   conta a TENTATIVO, dentro il ciclo, così il tetto vale anche a cavallo di due compattazioni. */
      if (fallimentiRiassuntoConsecutivi >= compattazione.FALLIMENTI_RIASSUNTO_CONSECUTIVI_MASSIMI) break;
      const contatore = progressoAcceso
        ? compattazione.creaContatoreRiassunto({ emetti: (valore) => progresso(requestIndex, { ...valore, motivo }), tentativo: tentativo + 1 })
        : null;
      try { esito = await chiediRiassunto(richiestaLimitata, budget.maxOutputTokens, contatore); }
      catch (errore) {
        if (segnaleStop?.aborted) throw errore;
        /* ⛔ BUG-5 (05/10/2026): l'errore NON si butta più — la sua classe va all'evento (credito? rete?
         *   overflow?), così chi guarda il registro decide se riprovare, aspettare o smettere. */
        esito = { ok: false, riassunto: '', motivo: 'errore', classe: compattazione.classificaFallimentoRiassunto({ errore }) };
      }
      if (esito.ok) fallimentiRiassuntoConsecutivi = 0;
      else fallimentiRiassuntoConsecutivi += 1;
      /* Troncato: lo stesso budget lo troncherebbe uguale, un secondo tentativo identico paga e non serve. */
      if (esito.ok || esito.motivo === 'troncato') break;
    }
    if (esito === null) {
      /* ⛔ BUG-5, revisione R1: entrati a contatore pieno — zero tentativi pagati, zero NUOVI fallimenti contati
       *   (il contatore resta com'era: il giro di fallimenti era già aperto) — e la chiusura si DICE. */
      esito = { ok: false, riassunto: '', motivo: 'esaurito', classe: 'esaurito' };
    }
    if (!esito.ok) {
      tentativiFallitiNelTurno += 1;
      /* ⛔ BUG-5 (05/10/2026): classe e contatore CONSECUTIVO sull'evento; un riassunto riuscito ha già azzerato. */
      /* `interrottaIn`: il passo dove si è fermata (lane CLI, 03/10/2026). Non `fase`: nell'evento `talos.compattazione`
         `fase` dice già inizio/fine. */
      emitOnGiro?.({ giro: requestIndex, tipo: 'compattazione-fine', compattato: false, motivo: esito.motivo, classe: esito.classe ?? esito.motivo, fallimentiConsecutivi: fallimentiRiassuntoConsecutivi, interrottaIn: 'riassunto' });
      return null;
    }
    const indice = compattazione.indiceMeccanico(parti.mezzo, { precedente: compacted?.indice ?? null });
    /* ⭐ 06/10/2026 — RICARICA POST-COMPACT (opzione A, percorso desktop): il punto naturale è l'indice
     * meccanico già generato dal codice, esteso dalle letture disco (capitolato §6.4, vincolo 3). Il blocco
     * di fatti freschi si calcola ORA, al momento del compact: git locale dalla cartella della sessione,
     * LEDGER dichiarati dall'ospite (`input.fontiRicarica`), i file toccati dall'indice (puntatori), e il
     * record `talos.compattazione.v1` come fonte ContextVersionV1 (dossier §6.1 punto 5). Fail-soft: una
     * fonte che fallisce si DICHIARA nel blocco, la compattazione continua. FUSO nella STESSA proiezione:
     * un solo cache-break, mai un messaggio separato. */
    const dichiarateFonti = fontiRicarica && typeof fontiRicarica === 'object' ? fontiRicarica : {};
    let bloccoFatti = '';
    try {
      bloccoFatti = (await costruisciBloccoFatti({
        ...dichiarateFonti,
        cartellaProgetto: dichiarateFonti.cartellaProgetto ?? cartella ?? null,
        fileToccati: [...(Array.isArray(dichiarateFonti.fileToccati) ? dichiarateFonti.fileToccati : []), ...indice.fileRiletti],
        fatti: [
          ...(Array.isArray(dichiarateFonti.fatti) ? dichiarateFonti.fatti : []),
          `Compaction record ${compattazione.SCHEMA_RECORD_COMPATTAZIONE}: coveredThrough=${rawMessages.length} raw messages`,
        ],
      })).testo;
    } catch { /* costruisciBloccoFatti non lancia mai: qui non si arriva; per difesa il compact continua senza blocco. */ }
    const proiezione = compattazione.costruisciProiezione({
      testa: parti.testa, richiesteLetterali: parti.richiesteLetterali, riassunto: esito.riassunto, indice: indice.testo, coda: parti.coda,
      bloccoFatti, recintaSintesi: bloccoFatti !== '',
    });
    const record = compattazione.creaRecord({
      coveredThrough: rawMessages.length,
      riassunto: proiezione,
      tokenPrima: tokenMisurati,
      tokenDopo: kernel.stimaTokenConversazione(proiezione),
      misura,
      at: new Date().toISOString(),
      modello,
      indice,
    });
    progresso(requestIndex, { fase: 'sostituzione', tokenDopo: record.tokenDopo ?? null, motivo });
    compacted = record;
    ultimaProiezioneStimata = record.tokenDopo ?? 0;
    records.push(record);
    compactions += 1;
    ancora = null;
    attendeVerdetto = true;
    emitOnGiro?.({ giro: requestIndex, tipo: 'compattazione-fine', compattato: true, record });
    return proiezione;
  };

  const maybeCompactLegacy = async (rawMessages, requestIndex) => {
    const projected = projectLegacy(rawMessages);
    const { token, misura } = compattazione.misuraOccupazione({ ancora, messaggi: projected, finestraToken: soglie.finestraToken });
    const decisione = compattazione.decidiCompattazione({
      token,
      soglia: soglie.soglia,
      emergenza: soglie.emergenza,
      tentativiEsauriti: tentativiFallitiNelTurno >= 1 || compattazioniInefficaci >= 2 || inefficaciTotali >= INEFFICACI_TOTALI_MASSIME,
      /*
       * ⛔ L'emergenza non è infinita, e il primo giro di prove l'ha misurato: con un tetto sotto il «pavimento
       *   incomprimibile» (system + preambolo + coda letterale) la proiezione restava sopra l'emergenza e l'adapter
       *   pagava un riassunto a OGNI richiesta — 9 `emergenza` di fila nella prova, lo stesso ciclo di
       *   anomalyco/opencode#50474 (22/09/2026). È il caso che Hermes descrive alla riga `context_compressor.py:1139-1142`
       *   («the incompressible floor eats the reclaimed headroom and compaction re-fires every 1-2 turns»).
       * ⇒ Due tentativi falliti, O due compattazioni riuscite ma inefficaci sul numero VERO, e per questo turno si
       *   smette: la richiesta parte com'è e, se il fornitore dice «contesto pieno», resta il ritentativo K8.
       * ⛔ Owner 26/09/2026: «inefficace» conta solo davanti al pavimento vero (vedi `aggiornaAncora`). La rete
       *   `INEFFICACI_TOTALI_MASSIME` resta per il caso che la stima del pavimento sbagli: senza, un pavimento misurato
       *   male tornerebbe il ciclo «un riassunto a ogni richiesta».
       */
      emergenzaEsaurita: tentativiFallitiNelTurno >= 2 || compattazioniInefficaci >= 2 || inefficaciTotali >= INEFFICACI_TOTALI_MASSIME,
    });
    if (!decisione.scatta) return projected;
    const proiezione = await compattaOra(rawMessages, projected, {
      requestIndex, motivo: decisione.motivo, tokenMisurati: token, misura, soglia: decisione.motivo === 'emergenza' ? soglie.emergenza : soglie.soglia,
    });
    return proiezione ?? projected;
  };

  /** Il numero vero del fornitore diventa l'ancora della prossima misura; e giudica l'ultima compattazione. */
  const aggiornaAncora = (usage) => {
    const promptTokens = Number(usage?.prompt_tokens);
    if (!Number.isFinite(promptTokens) || promptTokens <= 0 || !richiestaCorrente) return;
    ancora = { promptTokens, lunghezza: richiestaCorrente.lunghezzaProiezione, stima: kernel.stimaTokenConversazione(richiestaCorrente.array) };
    if (attendeVerdetto) {
      /* Come Hermes `_apply_real_prompt_verdict` (`context_compressor.py:2749-2782`): l'efficacia si giudica sul
       * numero VERO della richiesta successiva, non sul numero di messaggi. */
      attendeVerdetto = false;
      /* Il contatore NON si azzera nel turno: un pavimento a cavallo della soglia alterna verdetti buoni e
       * cattivi, e con l'azzeramento la prova misurava 4 compattazioni invece di 2. Due inefficaci e basta.
       * ⛔ Owner 26/09/2026: ma «inefficace» conta SOLO se la coda era già al minimo — cioè se sopra la soglia resta
       *   solo ciò che non si comprime (istruzioni, preambolo, attrezzi, l'ultimo esito accorciato). Con una coda
       *   ancora riducibile il verdetto non spegne niente: la prossima compattazione la accorcerà (era il difetto del
       *   24/09, due «inefficaci» con la coda piena di letture e poi 1,16 milioni di token). */
      if (promptTokens >= soglie.soglia) {
        inefficaciTotali += 1;
        /* Il pavimento VERO: quello stimato più lo scarto misurato fra il numero del fornitore e la stima della
         * proiezione (schemi degli attrezzi, tokenizzatore). Se da solo, più il riassunto massimo, arriva alla soglia,
         * restano solo istruzioni e attrezzi: è il caso in cui Hermes smette (`context_compressor.py:2762-2782`). */
        const scarto = Math.max(0, promptTokens - ultimaProiezioneStimata);
        const pavimentoVero = ultimoPavimentoStimato + scarto + ultimoBudgetRiassunto;
        if (ultimaCodaAlMinimo || pavimentoVero >= soglie.soglia) compattazioniInefficaci += 1;
      }
    }
  };

  const hooks = {
    async capture(payload) {
      // Preserve the Context Engine's raw/original archive contract. Semantic
      // corrections happen at prepare(), before anything is projected for inference.
      if (typeof original?.capture === 'function') return original.capture(payload);
      return undefined;
    },
    async prepare(payload) {
      telemetry.mark('provider-prepare');
      const requestIndex = providerRequests;
      providerRequests += 1;
      /* Gli effimeri (il `system` del Piano) si staccano PRIMA di tutto: né riassunto, né archivio, né ancora. */
      const { messaggi: grezzi, effimeri } = compattazione.staccaEffimeri(payload.messages);
      // Correct BEFORE any context-engine projection or legacy compaction so an
      // ambiguous raw tool result cannot be summarized into a false statement.
      const inputMessages = correggiMessaggiDesktop(grezzi, { cartella });
      let prepared;
      if (legacyMode) prepared = { messages: await maybeCompactLegacy(inputMessages, requestIndex) };
      else prepared = await original.prepare({ ...payload, messages: inputMessages, originali: grezzi });
      const proiettati = correggiMessaggiDesktop(prepared?.messages ?? inputMessages, { cartella });
      const messages = compattazione.riattaccaEffimeri(proiettati, effimeri);
      if (legacyMode) richiestaCorrente = { array: messages, grezzi: inputMessages, effimeri, requestIndex, lunghezzaProiezione: proiettati.length };
      return { ...(prepared && typeof prepared === 'object' ? prepared : {}), messages };
    },
    async captureProviderResponse(payload) {
      telemetry.mark('provider-response');
      if (typeof original?.captureProviderResponse === 'function') return original.captureProviderResponse(payload);
      return undefined;
    },
    get compactions() { return compactions; },
  };
  if (legacyMode) {
    hooks.infer = async ({ signal } = {}, invoke) => {
      try {
        const esito = await invoke(signal);
        aggiornaAncora(esito?.usage);
        return esito;
      } catch (errore) {
        if (signal?.aborted || segnaleStop?.aborted) throw errore;
        const classe = compattazione.classificaErroreFornitore(errore);
        if (classe !== 'contesto-pieno') throw errore;
        if (errore && typeof errore === 'object') errore.classificazione = classe;
        if (overflowRitentato || !richiestaCorrente) throw errore;
        overflowRitentato = true;
        const { array, grezzi, effimeri, requestIndex } = richiestaCorrente;
        const projected = projectLegacy(grezzi);
        const { token, misura } = compattazione.misuraOccupazione({ ancora, messaggi: projected, finestraToken: soglie.finestraToken });
        const proiezione = await compattaOra(grezzi, projected, { requestIndex, motivo: 'overflow', tokenMisurati: token, misura, soglia: soglie.soglia });
        if (!proiezione) throw errore;
        const nuova = compattazione.riattaccaEffimeri(correggiMessaggiDesktop(proiezione, { cartella }), effimeri);
        array.splice(0, array.length, ...nuova);
        richiestaCorrente.lunghezzaProiezione = nuova.length - effimeri.length;
        try {
          const esito = await invoke(signal);
          aggiornaAncora(esito?.usage);
          return esito;
        } catch (secondo) {
          /* Anche il ritentativo può finire in overflow: passa com'è, ma classificato come il primo. */
          if (secondo && typeof secondo === 'object' && compattazione.classificaErroreFornitore(secondo) === 'contesto-pieno') secondo.classificazione = 'contesto-pieno';
          throw secondo;
        }
      }
    };
  } else if (typeof original?.infer === 'function') hooks.infer = (...args) => original.infer(...args);
  return hooks;
}

export async function talosLavora(input = {}) {
  const telemetry = creaTelemetriaStallo();
  const calls = new Map();
  const extraUsage = { prompt_tokens: 0, completion_tokens: 0, cached_tokens: 0, giri: 0 };
  const explicitTestCommand = typeof input.comandoProva === 'string'
    && input.comandoProva.trim().length > 0
    && !DEFAULT_NPM_TEST.test(input.comandoProva.trim());
  const comandoProva = input.comandoProva ?? 'npm test';
  const provaSenzaSuite = await motivoProvaSenzaSuiteDesktop({ cartella: input.cartella, comandoProva, esplicito: explicitTestCommand });
  const onGiro = wrapOnGiro(input.onGiro, { cartella: input.cartella, telemetry, calls });
  /*
   * Le soglie si calcolano UNA volta per turno, dall'ambiente e dalla finestra che il chiamante passa
   * (`finestraToken`: null oggi — la cabla l'onda 2 dal catalogo; con null vale il solo tetto assoluto).
   */
  const soglie = compattazione.calcolaSoglie({
    tettoToken: compattazione.leggiTettoEsplicito(process.env),
    finestraToken: input.finestraToken ?? null,
  });
  const records = [];
  const contextHooks = wrapContextHooks(input.contextHooks, {
    cartella: input.cartella,
    modello: input.modello,
    chiave: input.chiave,
    fetchDiRete: input.fetchDiRete,
    segnaleStop: input.segnaleStop,
    telemetry,
    extraUsage,
    emitOnGiro: onGiro,
    reasoning: input.reasoning,
    soglie,
    recordIniziale: input.recordCompattazioneIniziale ?? null,
    records,
    progressoAcceso: input.progressoCompattazione === true,
    fontiRicarica: input.fontiRicarica ?? null,
  });
  const onDelta = wrapOnDelta(input.onDelta, telemetry);

  try {
    telemetry.mark('kernel-running');
    const result = await kernel.talosLavora({
      ...input,
      comandoProva,
      provaSenzaSuite,
      contextHooks,
      onGiro,
      onDelta,
    });
    const usage = mergeUsage(result?.usage, extraUsage);
    const compattazioni = Number(result?.compattazioni ?? 0) + contextHooks.compactions;
    /* Campo NUOVO, additivo: i record di questo turno (vuoto se non si è compattato). Gli altri campi non cambiano. */
    const recordDiCompattazione = [...records];
    if (!usage) return { ...result, compattazioni, recordDiCompattazione };
    return {
      ...result,
      usage,
      compattazioni,
      recordDiCompattazione,
      fuori: `${String(result?.detto ?? '').trim()}\n${JSON.stringify({ usage })}`.trim(),
    };
  } finally {
    telemetry.close();
  }
}
