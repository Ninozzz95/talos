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
import { createHash } from 'node:crypto'; // 15/10/2026: l'impronta del prefisso coperto da un riassunto preparato in anticipo
import { lstatSync, readdirSync, realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { isPathInside } from '../path-policy.mjs';
import * as compattazione from './compattazione-desktop.mjs';
import * as kernel from './talosHarness.mjs';
// ⭐ 06/10/2026 — la ricarica della memoria post-compact (opzione A, ricerca 5×5×5×5 §6.4): il blocco di
// fatti freschi che `compattaOra` fonde nella proiezione, accanto all'indice meccanico.
import { costruisciBloccoFatti } from './ricarica-post-compact.mjs';
import { chiamataPerChiGuarda } from './ponte-attrezzi.mjs';

export * from './talosHarness.mjs';

/* 21/10/2026: `motoreAPostoUnico` vive in `compattazione-desktop.mjs` (la usa anche il registro, per il riassunto di fine giro che cede
   il posto); qui si riesporta com'era. */
export { motoreAPostoUnico } from './compattazione-desktop.mjs';

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
  /* C5, revisione H: una chiamata passata dal ponte (`tool_call`) riceve le correzioni del desktop del suo attrezzo VERO. */
  const vera = chiamataPerChiGuarda(call.function?.name ?? '', call.function?.arguments || '{}');
  let args = {};
  try { args = JSON.parse(vera.argomenti || '{}'); } catch { /* malformed calls are handled by the kernel */ }
  return { id: call.id, name: vera.nome ?? '', args };
}

function pathArg(args) {
  for (const key of ['percorso', 'path', 'file_path', 'filePath', 'file', 'filename']) {
    if (typeof args?.[key] === 'string' && args[key].length > 0) return args[key];
  }
  return '';
}

/*
 * L1 motore locale (owner 20/10/2026 sera): un nome che non c'è torna coi nomi VERI più vicini, come Hermes `_suggest_similar_files`
 *   (`tools/file_operations.py:1204-1240`): uguale senza maiuscole 100, stesso nome senza estensione 90, prefisso 70, contiene 60,
 *   quasi uguale 50, contenuto 40. Hermes misura il «quasi uguale» con `difflib` ≥ 0,8; qui con Levenshtein normalizzato ≥ 0,8.
 *   Al massimo tre, le cartelle prima (`elenca` apre cartelle), e solo dentro la cartella di lavoro (il genitore è già passato
 *   dai controlli dei collegamenti qui sotto). Un modello piccolo si corregge al giro dopo invece di arrendersi.
 */
const VICINI_MASSIMI = 3;
const VOCI_LETTE_PER_I_VICINI = 500;

function somiglianza(a, b) {
  if (a === b) return 1;
  const lunga = Math.max(a.length, b.length);
  if (lunga === 0 || lunga > 200) return 0;
  let prima = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const ora = [i];
    for (let j = 1; j <= b.length; j += 1) {
      ora[j] = Math.min(prima[j] + 1, ora[j - 1] + 1, prima[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prima = ora;
  }
  return 1 - prima[b.length] / lunga;
}

function punteggioDelNome(cercato, trovato) {
  const c = cercato.toLowerCase();
  const t = trovato.toLowerCase();
  const senzaEstensione = (n) => n.replace(/\.[^.]*$/u, '');
  if (t === c) return 100;
  if (senzaEstensione(t) === senzaEstensione(c) && senzaEstensione(c) !== '') return 90;
  if (t.startsWith(c) || c.startsWith(t)) return 70;
  if (t.includes(c)) return 60;
  if (somiglianza(c, t) >= 0.8) return 50;
  if (c.includes(t) && t.length > 2) return 40;
  return 0;
}

export function nomiViciniNellaCartella(genitore, nome, prefisso = '') {
  let voci;
  try { voci = readdirSync(genitore, { withFileTypes: true }).slice(0, VOCI_LETTE_PER_I_VICINI); } catch { return []; }
  return voci
    .map((voce) => ({ voce, punti: punteggioDelNome(nome, voce.name) }))
    .filter(({ punti }) => punti > 0)
    .sort((a, b) => (b.punti - a.punti) || (Number(b.voce.isDirectory()) - Number(a.voce.isDirectory())) || (a.voce.name < b.voce.name ? -1 : 1))
    .slice(0, VICINI_MASSIMI)
    .map(({ voce }) => `${prefisso}${voce.name}${voce.isDirectory() ? '/' : ''}`);
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
        if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') {
          const prefisso = segments.slice(0, index).map((pezzo) => `${pezzo}/`).join('');
          return { type: 'missing', requested, vicini: nomiViciniNellaCartella(join(rootReal, ...segments.slice(0, index)), segments[index], prefisso) };
        }
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

/* L1, revisione del 20/10 (D1): la nota con cui il kernel apre l'esito di un percorso riletto (`dove-sei.mjs`). Testo di TALOS, mai
   del modello o di un file: sta FUORI dal confine dei dati, in testa. */
const NOTA_ALIAS = /^Note: "[^"\n]*" was read as "([^"\n]*)"[^\n]*\n\n/u;

export function correggiEsitoToolDesktop({ name, args, content, cartella }) {
  let text = String(content ?? '');
  /* L1 (D1): con un alias la correzione guarda l'esito DOPO la nota e il percorso RISCRITTO, quello che il kernel ha davvero aperto
     (`args` sono gli argomenti grezzi del modello); la nota resta in testa, com'era. */
  const notaAlias = NOTA_ALIAS.exec(text);
  if (notaAlias) {
    text = text.slice(notaAlias[0].length);
    args = { percorso: notaAlias[1] };
  }
  const conNota = (risultato) => (notaAlias ? `${notaAlias[0]}${risultato}` : risultato);

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
      const vicini = target.vicini?.length ? ` Closest existing names: ${target.vicini.map((v) => `"${v}"`).join(', ')}.` : '';
      text = `"${target.requested}" does not exist in this workspace.${vicini} Use \`cerca\` to locate the file or folder instead of treating it as an unreadable directory.`;
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

  return conNota(text);
}

/*
 * L1 (20/10/2026 sera): `memoria` FISSA la correzione di un esito alla prima volta che la si calcola. Questa funzione gira a ogni
 *   richiesta al fornitore sulla storia INTERA, e un esito corretto guardando il disco (file o cartella, i nomi vicini) cambierebbe
 *   quando il disco cambia: il prefisso già in cache si romperebbe, e il modello vedrebbe riscritto un passato che aveva letto.
 *   La chiave è l'id della chiamata più l'impronta del testo grezzo.
 */
export function correggiMessaggiDesktop(messages, { cartella, memoria = null } = {}) {
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
    /* D4: solo `elenca` si corregge guardando il DISCO; gli altri sono funzioni del testo e non serve fissarli (né calcolarne
       l'impronta: 2.000 esiti da 20 KB costavano 20 ms a richiesta) */
    const chiave = memoria && call.name === 'elenca'
      ? `${message.tool_call_id}\u0000${createHash('sha256').update(String(message.content ?? '')).digest('hex')}` : null;
    let content = chiave ? memoria.get(chiave) : undefined;
    if (content === undefined) {
      content = correggiEsitoToolDesktop({ ...call, content: message.content, cartella });
      if (chiave) memoria.set(chiave, content);
    }
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
const TENTATIVI_RIASSUNTO = 2;
const ATTESA_RITENTA_RIASSUNTO_MS = 10_000;

/*
 * A1 (owner 21/10/2026 sera, dopo la ricerca su 12 concorrenti — `bugfixer/RICERCA-TETTO-E-VISIBILITA-RIASSUNTO-2026-10-21.md`): il
 *   riassunto che il giro ASPETTA ha due orologi. Dal vivo sul Pad un solo passaggio del modello del telefono è durato 16 minuti, il
 *   secondo 6, poi sono stati rifiutati: 22 minuti su «Elaborazione». Valori di serie di Hermes (`agent/conversation_compression.py:
 *   667-668`, 120 s alzati al budget del riassunto ≥ 300 s `:786-797`, e 600 s in tutto), da tarare sul banco; l'ospite li cambia.
 * ⛔ L'inattività conta DAL PRIMO TOKEN: mentre il motore legge il prompt non manda niente (llama.cpp senza `prompt_progress`), e un
 *   prefill sano non è un blocco (la ricerca: i timeout d'inattività di Crush 120 s, Codex 300 s, opencode 900 s lo ucciderebbero).
 *   Prima del primo token vale solo il tetto totale.
 */
/* I codici del motore del contesto per un riassunto del MODELLO che non è stato accettato (`engine.mjs`, `FALLIMENTI_DEL_RIASSUNTO`):
   ripetere la stessa richiesta allo stesso modello nella stessa richiesta del giro non lo guarisce */
const RIASSUNTI_RIFIUTATI_DAL_MOTORE = new Set(['CTX_INVALID_SUMMARY', 'CTX_EMPTY_SUMMARY', 'CTX_TRUNCATED_SUMMARY', 'CTX_INVALID_SOURCE', 'CTX_COMPACTION_FAILED']);
const LETTURA_MINIMA_PER_LA_STIMA = 256;
const RIASSUNTO_INATTIVITA_MS = 300_000;
const RIASSUNTO_TETTO_MS = 600_000;
const interoPositivo = (valore, predefinito) => (Number.isSafeInteger(valore) && valore > 0 ? valore : predefinito);

/**
 * L'orologio di UN riassunto atteso (tutti i suoi tentativi): il segnale da passare alla richiesta (Stop della persona, Skip, tetto
 * totale, inattività dal primo token), `vita()` a ogni pezzo che arriva, `ragione` = `'tempo'` | `'saltato'` | null, `chiudi()` alla fine.
 * Lo Stop resta lo Stop: non ha una ragione qui, e chi chiama lo riconosce dal SUO segnale.
 */
export function creaOrologioRiassunto({ segnaleStop = null, segnaleSalta = null, inattivitaMs = RIASSUNTO_INATTIVITA_MS, tettoMs = RIASSUNTO_TETTO_MS } = {}) {
  const controllo = new AbortController();
  let ragione = null;
  const ferma = (perche) => {
    if (ragione !== null || controllo.signal.aborted) return;
    ragione = perche;
    controllo.abort(Object.assign(new Error(perche === 'saltato' ? 'The summary was skipped.' : 'The summary took too long.'), { name: 'AbortError', code: perche === 'saltato' ? 'SUMMARY_SKIPPED' : 'SUMMARY_TIME_LIMIT' }));
  };
  const tetto = setTimeout(() => ferma('tempo'), tettoMs);
  let inattivita = null;
  const suSalta = () => ferma('saltato');
  if (segnaleSalta?.aborted) ferma('saltato'); else segnaleSalta?.addEventListener?.('abort', suSalta, { once: true });
  return {
    segnale: segnaleStop ? AbortSignal.any([segnaleStop, controllo.signal]) : controllo.signal,
    vita() { clearTimeout(inattivita); inattivita = setTimeout(() => ferma('tempo'), inattivitaMs); },
    get ragione() { return ragione; },
    chiudi() { clearTimeout(tetto); clearTimeout(inattivita); segnaleSalta?.removeEventListener?.('abort', suSalta); },
  };
}

function wrapContextHooks(original, {
  cartella, modello, chiave, fetchDiRete, segnaleStop, telemetry, extraUsage, emitOnGiro,
  reasoning, soglie, recordIniziale = null, records = [], progressoAcceso = false, limiteUscitaToken = null,
  riassuntoInattivitaMs = RIASSUNTO_INATTIVITA_MS, riassuntoTettoMs = RIASSUNTO_TETTO_MS, segnaleSaltaRiassunto = null,
  /* 21/10/2026 (CLI): il modello che scrive i riassunti (null ⇒ quello della conversazione) e la sua finestra (`sceltaDelRiassunto`) */
  modelloRiassunto = null, finestraRiassuntoToken = null,
  /* ⭐ 06/10/2026 — le fonti dichiarate dall'ospite per il blocco di fatti post-compact (`input.fontiRicarica`):
   * LEDGER append-only, coda pendente, pericoli aperti. `cartella` (la cartella della sessione) resta la fonte
   * del `git log` locale; i file toccati vengono dall'indice meccanico di ogni compattazione. */
  fontiRicarica = null,
  /* ⭐ 15/10/2026 — un riassunto preparato dal registro a fine del giro prima e non ancora usato (`{ record, impronta, base }`). */
  compattazionePronta = null,
  /* owner 15/10/2026 notte, «passa al giro dopo»: il riassunto che il giro prima stava ancora preparando (una promessa). Diventa il
     riassunto IN VOLO di questo giro — niente secondo riassunto pagato — e, quando arriva, quello PRONTO se l'impronta regge. */
  compattazioneInArrivo = null,
  /* ⭐ 15/10/2026 — la compattazione istantanea è una scelta dell'OSPITE (il desktop la accende dal registro): spenta, tutto resta
     com'era. La CLI oggi (0.6.12) carica il kernel di BASE, non questo adapter; dalla 0.6.13 passerà di qui con le sue decisioni
     sulla compattazione e il suo avanzamento in streaming (lane CLI, 21/10/2026: il commento di prima lo dava già per fatto). */
  istantanea = false,
} = {}) {
  let compacted = compattazione.eRecordValido(recordIniziale) ? recordIniziale : null;
  let compactions = 0;
  let providerRequests = 0;
  const correzioniFissate = new Map(); // L1: una correzione per esito, fissata alla prima richiesta (vedi `correggiMessaggiDesktop`)
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
  let richiestaSenzaAttesa = null; // col motore: la richiesta mandata senza aspettare il riassunto in volo (ritentativo qui sotto)
  /* Owner 12/10/2026: il ripiego dal motore del contesto si DICE una volta per turno, non a ogni richiesta. */
  let ripiegoDetto = false;
  const reasoningRiassunto = compattazione.reasoningPerRiassunto(reasoning, { modello });

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
  /* B1 (21/10/2026, revisione del Mobile): sulla strada del motore del contesto il giro aspetta un riassunto che scrive il MOTORE.
     Il motore dice quando (`onInTurnWait`: `waiting` e poi `done`, comunque sia andata); qui diventa lo stesso `compattazione-inizio`
     della compattazione semplice, così la riga viva con «Skip» compare e il registro sa che un riassunto è atteso. La chiusura è
     MUTA (`motivo:'motore'`): il riassunto pubblicato lo racconta già il separatore del motore, e se il motore fallisce (tetto, Skip)
     il ripiego qui sotto apre e chiude la sua riga. Un'attesa per volta per richiesta; un secondo riassunto riapre la riga. */
  const ascoltaAttesaDelMotore = (requestIndex) => {
    let aperta = false;
    return (evento) => {
      if (evento?.state === 'waiting' && !aperta) {
        aperta = true;
        emitOnGiro?.({ giro: requestIndex, tipo: 'compattazione-inizio', tokenMisurati: null, soglia: null, motivo: 'soglia', origine: 'motore' });
        progresso(requestIndex, { fase: 'riassunto', motivo: 'soglia', origine: 'motore', trascorsoMs: 0 });
      } else if (evento?.state === 'done' && aperta) {
        aperta = false;
        emitOnGiro?.({ giro: requestIndex, tipo: 'compattazione-fine', compattato: false, motivo: 'motore', origine: 'motore' });
      }
    };
  };

  /* `secondaria`: il riassunto preparato IN SOTTOFONDO mentre il giro va avanti è una seconda chiamata della sessione in contemporanea —
     l'involucro dei fornitori (runtime-owner-adapter.mjs, `eseguiConFallback`) la fa senza il suo guardiano «una per volta» */
  /* A1: la richiesta del giro per cui il motore del contesto ha già scaduto/saltato/rifiutato il riassunto del modello — lì la
     compattazione semplice va dritta al riassunto senza modello (`{ requestIndex, ragione }`) */
  let senzaModelloPerRichiesta = null;
  /* A1, la STIMA PRIMA: la velocità di lettura del prompt misurata dal motore locale (`timings` di llama-server o del motore
     dell'app: token letti davvero / ms, `leggiTempiDelMotore` nel kernel). Solo su letture di almeno `LETTURA_MINIMA_PER_LA_STIMA`
     token: una lettura piccola misura il rumore. Ignota (i fornitori cloud non la mandano) ⇒ nessuna stima: decidono gli orologi.
     Vale la lettura PIÙ GRANDE del giro, non l'ultima (Mobile 21/10, sul Pad: 6.203 token a 123,7 t/s, poi 182 a 49,9 — un passo
     piccolo paga il costo fisso del passo e sottostima la velocità di 2-4×, cioè un riassunto da migliaia di token). */
  let velocitaLetturaTokSec = null;
  let letturaPiuGrande = 0;
  const registraTempi = (timings) => {
    const n = timings?.prompt_n; const ms = timings?.prompt_ms;
    if (!Number.isFinite(n) || !Number.isFinite(ms) || n < LETTURA_MINIMA_PER_LA_STIMA || ms <= 0 || n < letturaPiuGrande) return;
    letturaPiuGrande = n;
    velocitaLetturaTokSec = (n * 1000) / ms;
  };
  const osservaTempi = (invoke) => async (segnale) => { const esito = await invoke(segnale); registraTempi(esito?.timings); return esito; };
  const chiediRiassunto = async (messaggiRichiesta, maxOutputTokens, contatore = null, { secondaria = false, orologio = null, modelloScelto = null } = {}) => {
    const segnale = orologio?.segnale ?? segnaleStop;
    /* 21/10/2026 (CLI): col modello del riassunto anche il ragionamento si sceglie per LUI */
    const reasoningScelto = modelloScelto && modelloScelto !== modello ? compattazione.reasoningPerRiassunto(reasoning, { modello: modelloScelto }) : reasoningRiassunto;
    const esito = await kernel.chiamaConRitenta({
      modello: modelloScelto ?? modello,
      chiave,
      messaggi: messaggiRichiesta,
      attrezzi: [],
      maxOutputTokens,
      ...(reasoningScelto ? { reasoning: reasoningScelto } : {}),
      ...(fetchDiRete ? { fetchDiRete } : {}),
      ...(segnale ? { segnaleStop: segnale } : {}),
      /* l'inattività si misura sui pezzi in arrivo: solo con lo streaming acceso (il contatore), come il progresso */
      ...(contatore ? { onDelta: (evento) => { orologio?.vita(); contatore.onDelta(evento); }, accettaVuota: true } : {}),
      ...(secondaria ? { secondaria: true } : {}),
      /* 21/10/2026 (banco di stress: un riassuntore che risponde 429 o 500 teneva fermo il giro 502 s, coi 10 ritentativi di serie). Il
         riassunto non è il giro: come Hermes (`context_compressor.py:830-840`, un sovraccarico ANNULLA la compattazione e la sessione
         resta intatta) al più un ritentativo con attese brevi; il ciclo della compattazione ha già il suo secondo tentativo, e sopra
         la regola di sempre (sotto la soglia si annulla, in overflow il ripiego). */
      tentativiMassimi: TENTATIVI_RIASSUNTO, attesaRitentaMassimaMs: ATTESA_RITENTA_RIASSUNTO_MS,
    });
    usageAdd(extraUsage, esito.usage);
    /* anche il riassunto è una lettura misurata. Con un modello dei riassunti diverso la sua velocità non conta: la scelta del modello
       dipende dalla sola finestra (`sceltaDelRiassunto`: ripiego ⟺ finestra < 4.048), quindi in un giro i riassunti vanno TUTTI
       all'ausiliario e la stima, che vale solo per il modello della conversazione (sotto), non la legge mai. */
    registraTempi(esito.timings);
    contatore?.chiudi(esito.usage);
    return compattazione.valutaRispostaDiRiassunto(esito);
  };

  /**
   * Una compattazione intera: divide, chiede il riassunto (un ritentativo immediato), costruisce proiezione e
   * record. Ritorna la proiezione nuova, o `null` se non c'è niente da riassumere o il riassuntore ha fallito.
   */
  const preparaCompattazione = async (rawMessages, projected, { requestIndex, motivo, tokenMisurati, misura, soglia, inSottofondo = false }) => {
    const divise = compattazione.dividiPerCompattazione(projected);
    /*
     * ⛔ Owner 26/09/2026, «Come Hermes»: la coda letterale sotto pressione si accorcia (inizio + fine degli esiti lunghi,
     *   doppioni tolti) PRIMA di giudicare la proiezione — altrimenti due letture grandi nella coda la tengono sopra il
     *   tetto per sempre (`compattazione-desktop.mjs`, «LA CODA LETTERALE NON È UN PAVIMENTO»).
     */
    const pressione = compattazione.riduciCodaSottoPressione(divise.coda, { budgetToken: compattazione.budgetCoda(soglie.soglia) });
    const parti = { ...divise, coda: pressione.coda };
    /* 15/10/2026: questi numeri giudicano la compattazione APPLICATA (verdetto sul numero vero): si portano nel risultato e li fissa
       `applicaCompattazione`, così un riassunto preparato in anticipo e mai usato non sposta il giudizio di quello in uso. */
    const pavimento = kernel.stimaTokenConversazione([...parti.testa, ...parti.richiesteLetterali, ...parti.coda]);
    const misureDelPavimento = { codaAlMinimo: pressione.alMinimo, pavimento };
    if (!parti.tagliabile) {
      /* Niente da riassumere e la coda già dentro il suo tetto: nessun tentativo, nessun evento, nessuna chiamata. */
      if (pressione.ridotti === 0) return null;
      /* Niente da riassumere ma la coda si è accorciata: la proiezione nuova è deterministica, senza il riassuntore
       * (Hermes `_FEASIBILITY_SKIP_MIDDLE_FRACTION`, `:1124-1127`: «dropping alone suffices»). */
      if (!inSottofondo) {
        emitOnGiro?.({ giro: requestIndex, tipo: 'compattazione-inizio', tokenMisurati, soglia, motivo });
        progresso(requestIndex, { fase: 'lettura', messaggi: projected.length, tokenPrima: tokenMisurati, motivo });
      }
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
      return { proiezione: proiezioneSolaCoda, record: recordSolaCoda, soloCoda: true, ...misureDelPavimento, budget: null };
    }
    if (!inSottofondo) {
      emitOnGiro?.({ giro: requestIndex, tipo: 'compattazione-inizio', tokenMisurati, soglia, motivo });
      progresso(requestIndex, { fase: 'lettura', messaggi: projected.length, tokenPrima: tokenMisurati, motivo });
    }
    /* 21/10/2026 (CLI): quale modello scrive il riassunto, e su quale finestra si misura (`sceltaDelRiassunto`); il record resta
       intestato al modello della CONVERSAZIONE (lo legge il controllo «modello cambiato» qui sopra) */
    const scelta = compattazione.sceltaDelRiassunto({
      modelloConversazione: modello, finestraConversazione: soglie.finestraToken, modelloRiassunto, finestraRiassunto: finestraRiassuntoToken,
      tokenDaRiassumere: kernel.stimaTokenConversazione(parti.mezzo), soglia: soglie.soglia,
    });
    const { budget } = scelta;
    const finestraDelRiassunto = scelta.finestraToken;
    /* il limite d'uscita che il registro passa è quello della conversazione: per un altro modello non vale (32.000 + la cintura) */
    const limiteDelRiassunto = scelta.ausiliario ? null : limiteUscitaToken;
    const richiesta = compattazione.costruisciRichiestaDiRiassunto({ ...parti, paroleMassime: budget.paroleMassime });
    /* Owner 21/10/2026: un riassunto TRONCATO si richiede UNA volta, più breve (metà delle parole) — Hermes `context_compressor.py:768`
       («one main-model retry»), opencode `compaction.ts:286-310` (un richiamo, NUDGE). Prima: «lo stesso budget lo troncherebbe uguale»,
       nessun ritentativo — vero col tetto uguale al budget, non più col tetto sulla finestra (`tettoUscitaRiassunto`). */
    let piuBreve = false;
    const richiestaBreve = () => compattazione.costruisciRichiestaDiRiassunto({ ...parti, paroleMassime: Math.max(200, Math.floor(budget.paroleMassime / 2)) });
    /* ⛔ BUG-5 (05/10/2026): l'INGRESSO del riassuntore si LIMITA (testa+coda, marcatore in mezzo) — 213.785
     *   token di ingresso (sessione vera b1e7382a) erano la causa dei tre riassunti «troncato» su tre giri:
     *   la richiesta di riassunto da sola rientrava nell'overflow e la compattazione non sostituiva MAI la storia. */
    /* L1 (20/10/2026): il limite si misura sulla FINESTRA del modello (`ingressoRiassuntoPerFinestra`), non solo in caratteri:
       sul codice un token vale ~2 caratteri e 160.000 caratteri non entravano in 65.536 token. Al secondo tentativo, la metà. */
    const richiestaPer = (tentativo) => compattazione.ingressoRiassuntoPerFinestra(piuBreve ? richiestaBreve() : richiesta, {
      finestraToken: finestraDelRiassunto, maxOutputTokens: budget.maxOutputTokens, frazione: tentativo === 0 ? 1 : 0.5,
    });
    /* ⛔ BUG-5, revisione R1 (05/10/2026): `esito` parte null. Se la GUARDIA del giro di fallimenti rompe al primo
     *   giro (contatore già al massimo: il ritentativo overflow K8 dell'infer chiama `compattaOra` senza passare da
     *   `decidiCompattazione`), nessun tentativo si paga e l'esito sintetico più sotto rende la chiusura CLASSIFICATA
     *   e osservabile (evento `compattazione-fine`), non un TypeError interno. */
    let esito = null;
    /* A1: il riassunto ATTESO ha i suoi orologi e lo Skip; quello in sottofondo no (non ferma nessuno, e si annulla da sé) */
    const inizioRiassunto = Date.now();
    /* A1, stima prima: con la velocità di lettura misurata, un riassunto che non starebbe nel tetto non si chiede nemmeno */
    /* la velocità misurata è quella del motore della CONVERSAZIONE: per un altro modello dei riassunti la stima non vale */
    const stimaLetturaMs = !inSottofondo && velocitaLetturaTokSec && scelta.modello === modello ? (kernel.stimaTokenConversazione(richiestaPer(0)) * 1000) / velocitaLetturaTokSec : null;
    const forzato = inSottofondo ? null : senzaModelloPerRichiesta?.requestIndex === requestIndex ? senzaModelloPerRichiesta.ragione
      : stimaLetturaMs !== null && stimaLetturaMs > riassuntoTettoMs ? 'stima' : null;
    const orologio = inSottofondo || forzato ? null : creaOrologioRiassunto({ segnaleStop, segnaleSalta: segnaleSaltaRiassunto, inattivitaMs: riassuntoInattivitaMs, tettoMs: riassuntoTettoMs });
    if (forzato) esito = { ok: false, riassunto: '', motivo: forzato, classe: forzato };
    for (let tentativo = 0; tentativo < 2 && !forzato; tentativo += 1) {
      /* ⛔ BUG-5 (05/10/2026), il GIRO DI FALLIMENTI: si pagano al massimo `FALLIMENTI_RIASSUNTO_
       *   CONSECUTIVI_MASSIMI` tentativi consecutivi del riassuntore PER TURNO — il quarto identico non si
       *   chiede (credito, chiave o fornitore giù: un secondo giro identico non guarisce). Il contatore si
       *   conta a TENTATIVO, dentro il ciclo, così il tetto vale anche a cavallo di due compattazioni. */
      if (fallimentiRiassuntoConsecutivi >= compattazione.FALLIMENTI_RIASSUNTO_CONSECUTIVI_MASSIMI) break;
      const contatore = progressoAcceso && !inSottofondo
        ? compattazione.creaContatoreRiassunto({ emetti: (valore) => progresso(requestIndex, { ...valore, motivo, tentativi: 2, trascorsoMs: Date.now() - inizioRiassunto, origine: 'adattatore' }), tentativo: tentativo + 1 })
        : null;
      const inviata = richiestaPer(tentativo);
      const tetto = compattazione.tettoUscitaRiassunto(inviata, { finestraToken: finestraDelRiassunto, limiteUscita: limiteDelRiassunto });
      try {
        try { esito = await chiediRiassunto(inviata, tetto, contatore, { secondaria: inSottofondo, orologio, modelloScelto: scelta.modello }); }
        catch (rifiuto) {
          /* revisione del 21/10 (S2): il fornitore ha un limite d'uscita più basso del tetto ⇒ una volta col budget, che lo rispetta */
          if (segnaleStop?.aborted || orologio?.ragione || tetto <= budget.maxOutputTokens || !compattazione.eRifiutoDelTettoUscita(rifiuto)) throw rifiuto;
          esito = await chiediRiassunto(inviata, budget.maxOutputTokens, contatore, { secondaria: inSottofondo, orologio, modelloScelto: scelta.modello });
        }
      }
      catch (errore) {
        if (segnaleStop?.aborted) { orologio?.chiudi(); throw errore; }
        /* A1: tetto scaduto o Skip della persona ⇒ niente secondo tentativo; sotto, il riassunto senza modello parte subito */
        if (orologio?.ragione) {
          /* il tempo scaduto è un fallimento del riassuntore (al prossimo giro di fila si va dritti al ripiego, come la pausa crescente
             di Hermes); lo Skip no, è una scelta della persona */
          if (orologio.ragione === 'tempo') fallimentiRiassuntoConsecutivi += 1;
          esito = { ok: false, riassunto: '', motivo: orologio.ragione, classe: orologio.ragione };
          break;
        }
        /* ⛔ BUG-5 (05/10/2026): l'errore NON si butta più — la sua classe va all'evento (credito? rete?
         *   overflow?), così chi guarda il registro decide se riprovare, aspettare o smettere. */
        esito = { ok: false, riassunto: '', motivo: 'errore', classe: compattazione.classificaFallimentoRiassunto({ errore }) };
      }
      if (esito.ok) fallimentiRiassuntoConsecutivi = 0;
      else fallimentiRiassuntoConsecutivi += 1;
      if (esito.ok) break;
      if (esito.motivo === 'troncato') piuBreve = true; // il secondo tentativo chiede metà delle parole
    }
    orologio?.chiudi();
    if (esito === null) {
      /* ⛔ BUG-5, revisione R1: entrati a contatore pieno — zero tentativi pagati, zero NUOVI fallimenti contati
       *   (il contatore resta com'era: il giro di fallimenti era già aperto) — e la chiusura si DICE. */
      esito = { ok: false, riassunto: '', motivo: 'esaurito', classe: 'esaurito' };
    }
    /* L1 (owner 20/10/2026): il riassuntore ha esaurito i suoi tentativi e la compattazione serve ADESSO (non in sottofondo) ⇒ il
       RIPIEGO senza modello (`riassuntoDiRipiego`, come Hermes), invece di lasciare la conversazione oltre la finestra. Il contatore
       resta pieno: la compattazione dopo, in questo turno, va dritta al ripiego senza pagare tentativi. */
    /* Owner 21/10/2026: quando la compattazione è per OVERFLOW (il fornitore ha già detto «non entra») lasciare la conversazione com'è
       vuol dire far morire il giro con «contesto pieno» — il ripiego scatta SUBITO. Sotto la soglia invece vale la regola di Hermes
       (`context_compressor.py:768`, `:830-840`): si annulla e la sessione resta intatta, il ripiego solo al contatore pieno. */
    /* A1 (21/10/2026): tetto scaduto e Skip portano al ripiego SEMPRE — il giro aspettava perché la richiesta non stava sotto la soglia */
    const perOrologio = esito.motivo === 'tempo' || esito.motivo === 'saltato' || (forzato !== null && esito.motivo === forzato);
    if (!esito.ok && !inSottofondo && (perOrologio || motivo === 'overflow' || esito.motivo === 'esaurito' || fallimentiRiassuntoConsecutivi >= compattazione.FALLIMENTI_RIASSUNTO_CONSECUTIVI_MASSIMI)) {
      /* la ragione in una parola per la riga d'esito (contratto riga viva §3): tempo · saltato · esaurito · rifiutato */
      const ragione = perOrologio ? esito.motivo : esito.motivo === 'esaurito' || fallimentiRiassuntoConsecutivi >= compattazione.FALLIMENTI_RIASSUNTO_CONSECUTIVI_MASSIMI ? 'esaurito' : 'rifiutato';
      esito = { ok: true, ripiego: true, classe: esito.classe ?? esito.motivo, ragione,
        riassunto: compattazione.riassuntoDiRipiego(parti.mezzo, { classe: esito.classe ?? esito.motivo }) };
    }
    if (!esito.ok) {
      tentativiFallitiNelTurno += 1;
      /* ⛔ BUG-5 (05/10/2026): classe e contatore CONSECUTIVO sull'evento; un riassunto riuscito ha già azzerato. */
      /* `interrottaIn`: il passo dove si è fermata (lane CLI, 03/10/2026). Non `fase`: nell'evento `talos.compattazione`
         `fase` dice già inizio/fine. */
      emitOnGiro?.({ giro: requestIndex, tipo: inSottofondo ? 'compattazione-preparata' : 'compattazione-fine', compattato: false, motivo: esito.motivo, classe: esito.classe ?? esito.motivo, fallimentiConsecutivi: fallimentiRiassuntoConsecutivi, interrottaIn: 'riassunto' });
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
    return { proiezione, record, soloCoda: false, ...misureDelPavimento, budget: budget.maxOutputTokens, ...(esito.ripiego ? { ripiego: true, classe: esito.classe, ragione: esito.ragione } : {}) };
  };

  /** Applica un riassunto (appena fatto o preparato prima): da qui il giro manda la proiezione nuova. */
  const applicaCompattazione = (preparata, { requestIndex, motivo, istantanea = false }) => {
    const { record } = preparata;
    ultimaCodaAlMinimo = preparata.codaAlMinimo;
    ultimoPavimentoStimato = preparata.pavimento;
    if (preparata.budget) ultimoBudgetRiassunto = preparata.budget;
    if (!istantanea) progresso(requestIndex, { fase: 'sostituzione', tokenDopo: record.tokenDopo ?? null, motivo });
    compacted = record;
    ultimaProiezioneStimata = record.tokenDopo ?? 0;
    records.push(record);
    compactions += 1;
    ancora = null;
    attendeVerdetto = true;
    emitOnGiro?.({ giro: requestIndex, tipo: 'compattazione-fine', compattato: true, record, ...(preparata.soloCoda ? { soloCoda: true } : {}), ...(istantanea ? { istantanea: true, motivo } : {}),
      ...(preparata.ripiego ? { ripiego: true, classe: preparata.classe, ...(preparata.ragione ? { ragione: preparata.ragione } : {}) } : {}) }); // L1: chi guarda sa che il riassunto è del codice
    return preparata.proiezione;
  };

  /** Una compattazione intera, adesso (emergenza, overflow): prepara e applica. `null` se non c'è niente o il riassuntore ha fallito. */
  const compattaOra = async (rawMessages, projected, opzioni) => {
    const preparata = await preparaCompattazione(rawMessages, projected, opzioni);
    return preparata ? applicaCompattazione(preparata, opzioni) : null;
  };

  /*
   * ⭐⭐ 15/10/2026 — LA COMPATTAZIONE ISTANTANEA (owner: «i minuti di compattazione non devono esistere»; quattro decisioni nella
   *   ricerca `.claude/RICERCA-COMPATTAZIONE-ISTANTANEA-2026-10-15.md` §7).
   *
   * Prima: alla soglia `prepare` ASPETTAVA il riassunto prima di mandare la richiesta, e dentro un giro lungo erano minuti fermi.
   * Ora, come Codex (`core/src/session/async_compaction.rs`, «Holds the current speculative request, polled at checkpoints or awaited
   *   when compaction is due»; soglia 65%, `config/mod.rs:225`) e Claude Code (`compact_precomputed`, all'80% della finestra):
   *   - dall'80% della soglia (`soglie.warningTokens`, decisione dell'owner) il riassunto si PREPARA in sottofondo: uno solo per volta,
   *     su una copia della storia, e la richiesta parte subito come prima;
   *   - alla soglia un riassunto pronto e VALIDO si applica all'istante: il record vale per il prefisso che ha coperto
   *     (`applicaRecord` = proiezione del record + ciò che è arrivato dopo, alla lettera), quindi basta che quel prefisso sia
   *     intatto (impronta) e che la storia non sia stata compattata nel frattempo (`base`);
   *   - sotto l'emergenza NON si aspetta mai: senza un riassunto pronto si va avanti col contesto com'è, e quello in preparazione
   *     arriverà alla richiesta dopo; all'emergenza si aspetta quello in corso e, solo se non c'è o non vale, si fa come prima.
   * ⛔ Un riassunto preparato e mai usato si paga (Codex lo dice nel suo codice: «Discarded requests still charge completed
   *   usage»): l'owner l'ha accettato, e il banco conta quelli fatti contro quelli usati.
   */
  const improntaDelPrefisso = (messaggi, fino) => {
    const h = createHash('sha256');
    for (let i = 0; i < fino; i += 1) h.update(JSON.stringify(messaggi[i] ?? null)).update('\u0000');
    return h.digest('hex');
  };
  const chiaveBase = () => (compacted ? `${compacted.at ?? ''}|${compacted.coveredThrough ?? ''}` : 'nessuna');
  let pronta = compattazionePronta && compattazione.eRecordValido(compattazionePronta.record) && typeof compattazionePronta.impronta === 'string'
    ? { ...compattazionePronta, proiezione: compattazionePronta.record.riassunto, soloCoda: compattazionePronta.soloCoda === true } : null;
  let inVolo = null;
  if (!pronta && compattazioneInArrivo && typeof compattazioneInArrivo.then === 'function') {
    const promessa = Promise.resolve(compattazioneInArrivo)
      .then((arrivata) => {
        if (pronta || !arrivata || !compattazione.eRecordValido(arrivata.record) || typeof arrivata.impronta !== 'string') return null;
        pronta = { ...arrivata, proiezione: arrivata.record.riassunto, soloCoda: arrivata.soloCoda === true };
        return pronta;
      })
      .catch(() => null)
      .finally(() => { if (inVolo?.promessa === promessa) inVolo = null; });
    inVolo = { promessa };
  }
  let preparate = 0;
  let usate = 0;
  /* 16/10/2026 — il PERCHÉ un riassunto pronto non vale, per il giornale: il giro vero col tetto a 60.000 ha pagato due riassunti e
     non ne ha usato nessuno, e niente diceva perché. `null` = vale. */
  const perchéNonVale = (rawMessages) => {
    if (!pronta) return 'none';
    if (pronta.base !== chiaveBase()) return 'base-changed';
    if (rawMessages.length < pronta.record.coveredThrough) return 'history-shorter';
    if (improntaDelPrefisso(rawMessages, pronta.record.coveredThrough) !== pronta.impronta) return 'prefix-changed';
    return null;
  };
  const prontaValida = (rawMessages) => perchéNonVale(rawMessages) === null;
  let scartoDetto = null; // una riga sola per riassunto pronto: il giornale non si riempie a ogni richiesta
  /*
   * Lo scambio che un riassunto pronto darebbe ADESSO: la sua proiezione più ciò che è arrivato dopo, con gli esiti lunghi accorciati
   *   come nella coda di una compattazione (`riduciCodaSottoPressione`) — misurato il 15/10 col banco della coda sotto pressione: senza,
   *   due letture da 15.000 token arrivate dopo il riassunto tenevano la richiesta sopra la soglia, due verdetti «inefficace»
   *   spegnevano la compattazione e la richiesta arrivava a 81.315 token con un tetto di 20.000. Il record nuovo copre la storia
   *   INTERA di adesso (`coveredThrough` = lunghezza grezza), come un record «solo coda».
   * ⇒ Uno scambio che non riporta sotto la soglia non si fa: il riassunto è troppo vecchio (`null`).
   */
  const scambioPossibile = (rawMessages, { token, misura }) => {
    if (!prontaValida(rawMessages)) return null;
    const coda = rawMessages.slice(pronta.record.coveredThrough);
    const ridotta = coda.length ? compattazione.riduciCodaSottoPressione(coda, { budgetToken: compattazione.budgetCoda(soglie.soglia) }).coda : [];
    const proiezione = [...pronta.record.riassunto, ...ridotta];
    const tokenDopo = kernel.stimaTokenConversazione(proiezione);
    if (tokenDopo >= soglie.soglia) { pronta.sopraSoglia = tokenDopo; return null; }
    const record = compattazione.creaRecord({
      coveredThrough: rawMessages.length, riassunto: proiezione, tokenPrima: token, tokenDopo, misura,
      at: new Date().toISOString(), modello, indice: pronta.record.indice ?? null,
    });
    return { ...pronta, record, proiezione };
  };
  const usaPronta = (scambio, { requestIndex, motivo }) => {
    pronta = null;
    usate += 1;
    return applicaCompattazione(scambio, { requestIndex, motivo, istantanea: true });
  };
  const avviaPreparazione = (rawMessages, projected, { requestIndex, tokenMisurati, misura }) => {
    if (inVolo || segnaleStop?.aborted) return;
    /* un riassunto pronto che riporterebbe sotto l'80% della soglia basta; uno più vecchio si rinnova */
    const scambio = scambioPossibile(rawMessages, { token: tokenMisurati, misura });
    if (scambio && scambio.record.tokenDopo < soglie.warningTokens) return;
    const copia = rawMessages.slice();
    const base = chiaveBase();
    const impronta = improntaDelPrefisso(copia, copia.length);
    preparate += 1;
    emitOnGiro?.({ giro: requestIndex, tipo: 'compattazione-preparata', fase: 'inizio', motivo: 'precalcolo', tokenMisurati });
    const promessa = preparaCompattazione(copia, projected.slice(), { requestIndex, motivo: 'precalcolo', tokenMisurati, misura, soglia: soglie.soglia, inSottofondo: true })
      .then((preparata) => {
        if (!preparata || base !== chiaveBase()) return null;
        pronta = { ...preparata, impronta, base };
        emitOnGiro?.({ giro: requestIndex, tipo: 'compattazione-preparata', fase: 'pronta', tokenPrima: preparata.record.tokenPrima ?? null, tokenDopo: preparata.record.tokenDopo ?? null });
        return pronta;
      })
      .catch(() => null)
      .finally(() => { if (inVolo?.promessa === promessa) inVolo = null; });
    inVolo = { promessa };
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
    if (!istantanea) {
      if (!decisione.scatta) return projected;
      const subito = await compattaOra(rawMessages, projected, {
        requestIndex, motivo: decisione.motivo, tokenMisurati: token, misura, soglia: decisione.motivo === 'emergenza' ? soglie.emergenza : soglie.soglia,
      });
      return subito ?? projected;
    }
    const tentativiEsauriti = tentativiFallitiNelTurno >= 1 || compattazioniInefficaci >= 2 || inefficaciTotali >= INEFFICACI_TOTALI_MASSIME;
    /* ⭐ 15/10/2026: alla soglia (o all'emergenza) un riassunto pronto che riporta sotto la soglia si applica all'istante */
    const scambio = decisione.scatta ? scambioPossibile(rawMessages, { token, misura }) : null;
    if (scambio) return usaPronta(scambio, { requestIndex, motivo: decisione.motivo });
    if (decisione.scatta && pronta && scartoDetto !== pronta) {
      scartoDetto = pronta;
      const perche = perchéNonVale(rawMessages) ?? (Number.isFinite(pronta.sopraSoglia) ? 'still-over-threshold' : 'unknown');
      emitOnGiro?.({ giro: requestIndex, tipo: 'compattazione-preparata', fase: 'scartata', motivo: perche, tokenMisurati: token,
        ...(Number.isFinite(pronta.sopraSoglia) ? { tokenDopo: pronta.sopraSoglia } : {}) });
    }
    if (!decisione.scatta || decisione.motivo === 'soglia') {
      /* dall'80% della soglia si prepara in sottofondo; sotto l'emergenza la richiesta non aspetta mai */
      if (token >= soglie.warningTokens && !tentativiEsauriti) avviaPreparazione(rawMessages, projected, { requestIndex, tokenMisurati: token, misura });
      return projected;
    }
    /* emergenza: si aspetta il riassunto già in preparazione; se c'è e vale si usa, altrimenti si fa come prima */
    if (inVolo) {
      await inVolo.promessa;
      /* IST-REV-03 (bugfixer): uno Stop arrivato mentre si aspettava non apre una compattazione nuova — restava un «inizio» senza «fine» */
      if (segnaleStop?.aborted) return projected;
      const arrivato = scambioPossibile(rawMessages, { token, misura });
      if (arrivato) return usaPronta(arrivato, { requestIndex, motivo: decisione.motivo });
    }
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

  /*
   * ⛔ 13/10/2026 (bugfixer, review avversaria di ac8f5a362) — UN `system` IN CODA NON È PER FORZA EFFIMERO.
   *   Il difetto, letto nel giornale della sessione 36289618 e riprodotto (`tests/archivio-coda-di-sistema.test.mjs`): quando
   *   il preambolo del progetto cambia (modello, permesso, mappa, AGENTS.md) `agent-service.mjs` appende l'aggiornamento come
   *   `system` IN CODA alla storia, dopo il messaggio della persona. È storia vera: il kernel la archivia con
   *   `capture('start')`. Ma qui `staccaEffimeri` staccava OGNI `system` in coda: al motore arrivava una storia più corta
   *   dell'archivio ⇒ `CTX_HISTORY_DIVERGED` alla richiesta 0 di quel giro (7 giri su 7 nel trascritto), e con la riparazione
   *   automatica l'archivio intero, versioni comprese, andava da parte ogni volta.
   * ⇒ Gli effimeri non si indovinano dalla forma: sono ciò che il kernel ha accodato DOPO l'ultima `capture` (la chiama subito
   *   prima di `prepare`, con la storia vera: `talosHarness.mjs`, `capture({ reason: 'before-request' })` e poi
   *   `prepare({ messages: [...messaggi, ...noteInCoda] })`). Se la coda oltre quel punto non è fatta di soli `system`, o
   *   nessuna `capture` è arrivata (un chiamante diverso dal kernel), vale la regola di prima.
   *   Come Hermes, che tiene fuori dalla storia salvata solo ciò che ha aggiunto lui per la singola chiamata
   *   (docs «Prompt assembly», hermes-agent.nousresearch.com/docs/developer-guide/prompt-assembly, letto 13/10/2026).
   */
  let storiaCatturata = null;
  const separaEffimeri = (messaggi) => {
    if (!Array.isArray(messaggi) || !Number.isInteger(storiaCatturata) || storiaCatturata < 1 || storiaCatturata > messaggi.length
      || messaggi.slice(storiaCatturata).some((m) => m?.role !== 'system')) return compattazione.staccaEffimeri(messaggi);
    if (storiaCatturata === messaggi.length) return { messaggi, effimeri: [] };
    return { messaggi: messaggi.slice(0, storiaCatturata), effimeri: messaggi.slice(storiaCatturata) };
  };

  const hooks = {
    async capture(payload) {
      /* 13/10/2026 (bugfixer, review di ac8f5a362): quanto è lunga la storia VERA in questo momento. `prepare` lo usa per
         distinguere gli effimeri (accodati dal kernel alla sola richiesta) da un `system` che è storia. Vedi `separaEffimeri`. */
      if (Array.isArray(payload?.messages)) storiaCatturata = payload.messages.length;
      // Preserve the Context Engine's raw/original archive contract. Semantic
      // corrections happen at prepare(), before anything is projected for inference.
      if (typeof original?.capture !== 'function') return undefined;
      /*
       * ⛔ 13/10/2026 (bugfixer, review di ac8f5a362) — `capture` FALLISCE APERTO, come `prepare` (owner 12/10/2026: «errori di
       *   compattazione non devono bloccare il flusso chat»). Il kernel la chiama fuori da ogni suo `try` (`start`, dopo ogni
       *   attrezzo, `finished`): una storia riscritta fra due giri lanciava `CTX_HISTORY_DIVERGED` già a `capture('start')` e il
       *   giro moriva PRIMA di `prepare`, dove vive la riparazione dell'archivio — che così non era raggiungibile proprio nel caso
       *   per cui è nata (riprodotto: `tests/archivio-capture-non-ferma.test.mjs`). Qui non si ripara e non si annuncia niente:
       *   la richiesta dopo passa da `prepare`, che sincronizza di nuovo gli originali (recupera ciò che qui non è stato
       *   scritto), ripara o ricade, e lo dice una volta. Uno Stop resta uno Stop.
       */
      try { return await original.capture(payload); }
      catch (errore) {
        if (segnaleStop?.aborted || payload?.signal?.aborted || errore?.name === 'AbortError') throw errore;
        return undefined;
      }
    },
    async prepare(payload) {
      telemetry.mark('provider-prepare');
      const requestIndex = providerRequests;
      providerRequests += 1;
      /* Gli effimeri (il `system` del Piano) si staccano PRIMA di tutto: né riassunto, né archivio, né ancora. */
      const { messaggi: grezzi, effimeri } = separaEffimeri(payload.messages);
      // Correct BEFORE any context-engine projection or legacy compaction so an
      // ambiguous raw tool result cannot be summarized into a false statement.
      const inputMessages = correggiMessaggiDesktop(grezzi, { cartella, memoria: correzioniFissate });
      let prepared;
      let ripiego = false;
      if (legacyMode) prepared = { messages: await maybeCompactLegacy(inputMessages, requestIndex) };
      else {
        try {
          /* A1 + B1 (21/10/2026): al motore il tetto del riassunto atteso, e lo Skip dentro il segnale della richiesta — così il motore
             annulla davvero il suo lavoro (su un motore a posto unico lo libera) invece di lasciarlo correre sotto il giro */
          const segnaleRichiesta = segnaleSaltaRiassunto && payload?.signal ? AbortSignal.any([payload.signal, segnaleSaltaRiassunto])
            : segnaleSaltaRiassunto ?? payload?.signal;
          prepared = await original.prepare({ ...payload, messages: inputMessages, originali: grezzi, summaryCeilingMs: riassuntoTettoMs,
            onInTurnWait: ascoltaAttesaDelMotore(requestIndex), ...(segnaleRichiesta ? { signal: segnaleRichiesta } : {}) });
          /* 12/10/2026, decisione dell'owner («Si ripara da solo»): l'archivio non combaciava, i vecchi originali sono stati messi
             da parte e il motore è ripartito dalla storia attiva. La chat lo dice con una riga, che non ferma niente. */
          if (prepared?.riallineato) {
            const { asideId: _daParte, ...dettaglio } = prepared.riallineato;
            emitOnGiro?.({ giro: requestIndex, tipo: 'compattazione-fine', compattato: false, motivo: 'archivio-riallineato', codice: 'CTX_HISTORY_DIVERGED', dettaglio });
          }
        }
        catch (errore) {
          /* ⛔⛔ Owner 12/10/2026, «errori di compattazione non devono bloccare il flusso chat… è una regressione grave»: dal vivo
             `CTX_HISTORY_DIVERGED` fermava OGNI giro dal settimo in poi, anche un «ciao». Il motore del contesto è un servizio di
             SUPPORTO del giro: se fallisce, la richiesta parte lo stesso dalla compattazione semplice (quella col motore spento,
             che regge anche il contesto troppo grande, sotto in `infer`), e la chat lo dice una volta con una riga che non ferma
             niente. Uno Stop della persona invece resta uno Stop. L'archivio del motore non si tocca qui: la causa della
             divergenza si cura a parte (R-05). */
          const saltato = segnaleSaltaRiassunto?.aborted === true && !segnaleStop?.aborted && !payload?.signal?.aborted;
          if (!saltato && (segnaleStop?.aborted || payload?.signal?.aborted || errore?.name === 'AbortError')) throw errore;
          /* A1: il riassunto del motore è scaduto, è stato saltato o rifiutato ⇒ la compattazione semplice di QUESTA richiesta non
             richiama il modello (era lui il lento, o il rifiutato): riassunto senza modello, con la ragione per la riga d'esito */
          const ragioneSenzaModello = saltato ? 'saltato' : errore?.code === 'CTX_COMPACTION_TIMEOUT' ? 'tempo'
            : RIASSUNTI_RIFIUTATI_DAL_MOTORE.has(errore?.code) ? 'rifiutato' : null;
          if (ragioneSenzaModello) senzaModelloPerRichiesta = { requestIndex, ragione: ragioneSenzaModello };
          ripiego = true;
          if (!ripiegoDetto) {
            ripiegoDetto = true;
            emitOnGiro?.({ giro: requestIndex, tipo: 'compattazione-fine', compattato: false, motivo: 'ripiego', codice: errore?.code ?? null,
              /* R-05: dove la storia non combaciava (posizioni e ruolo, mai contenuto), quando chi ha fallito lo sa dire. */
              ...(errore?.dettaglio && typeof errore.dettaglio === 'object' ? { dettaglio: errore.dettaglio } : {}) });
          }
          prepared = { messages: await maybeCompactLegacy(inputMessages, requestIndex) };
        }
      }
      const proiettati = correggiMessaggiDesktop(prepared?.messages ?? inputMessages, { cartella, memoria: correzioniFissate });
      const messages = compattazione.riattaccaEffimeri(proiettati, effimeri);
      richiestaCorrente = legacyMode || ripiego ? { array: messages, grezzi: inputMessages, effimeri, requestIndex, lunghezzaProiezione: proiettati.length } : null;
      richiestaSenzaAttesa = !legacyMode && !ripiego && prepared?.sentWithoutWaiting === true ? { array: messages, payload, grezzi, inputMessages, effimeri, requestIndex } : null;
      return { ...(prepared && typeof prepared === 'object' ? prepared : {}), messages };
    },
    async captureProviderResponse(payload) {
      telemetry.mark('provider-response');
      if (typeof original?.captureProviderResponse === 'function') return original.captureProviderResponse(payload);
      return undefined;
    },
    get compactions() { return compactions; },
    /* ⭐ 15/10/2026: a fine giro un riassunto pronto e non usato (o quello ancora in preparazione) passa al registro, che lo ridà al
       giro dopo: preparato e pagato una volta sola. `preparate`/`usate` per il banco (fatti contro usati). */
    get compattazionePronta() { return pronta ? { record: pronta.record, impronta: pronta.impronta, base: pronta.base, soloCoda: pronta.soloCoda === true } : null; },
    get compattazioneInPreparazione() { return inVolo ? inVolo.promessa.then((p) => (p ? { record: p.record, impronta: p.impronta, base: p.base, soloCoda: p.soloCoda === true } : null)) : null; },
    get conteggioPreparazioni() { return { preparate, usate }; },
  };
  const inferLegacy = async ({ signal } = {}, invoke) => {
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
        /* 15/10/2026: anche qui prima il riassunto in preparazione o pronto, poi (solo se non c'è) uno nuovo */
        if (inVolo) await inVolo.promessa;
        const scambio = scambioPossibile(grezzi, { token, misura });
        const proiezione = scambio
          ? usaPronta(scambio, { requestIndex, motivo: 'overflow' })
          : await compattaOra(grezzi, projected, { requestIndex, motivo: 'overflow', tokenMisurati: token, misura, soglia: soglie.soglia });
        if (!proiezione) throw errore;
        const nuova = compattazione.riattaccaEffimeri(correggiMessaggiDesktop(proiezione, { cartella, memoria: correzioniFissate }), effimeri);
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
  if (legacyMode) hooks.infer = (opzioni, invoke) => inferLegacy(opzioni, osservaTempi(invoke));
  else {
    /* Owner 12/10/2026 (ripiego qui sopra): una richiesta preparata dalla compattazione semplice perché il motore è caduto ha anche
       la sua rete per il contesto troppo grande. Col motore sano `richiestaCorrente` è null e tutto va come prima. */
    const inferMotore = typeof original?.infer === 'function' ? (...args) => original.infer(...args) : null;
    // il ritentativo dopo «contesto pieno» lo fa il guscio (sotto), che ricostruisce l'array suo: il servizio non ne fa un secondo
    const inferBase = (opzioni, invoke) => (inferMotore ? inferMotore({ ...opzioni, retryContextFull: false }, invoke) : invoke(opzioni.signal));
    /*
     * ⛔ Revisione del bugfixer di 0120d21e0 (16/10/2026, NON-ASPETTARE-REV-01): «Non aspettare se entra» (owner 16/10 sera) manda la
     *   richiesta senza il margine di sicurezza della stima, e col motore nessuno riprovava se il fornitore rispondeva «contesto
     *   pieno»: il giro moriva dopo un tentativo. Prima il margine copriva questa mancanza. ⇒ Come K8 (`inferLegacy`, sopra): una
     *   volta sola, si rifà la preparazione chiedendo al motore di ASPETTARE il riassunto in volo (`waitForInFlight`), si rimette
     *   la richiesta nello stesso array e si riprova. Un secondo «contesto pieno» passa com'è, classificato come il primo.
     */
    const inferSenzaAttesa = async (r, opzioni, invoke) => {
      try { return await inferBase(opzioni, invoke); }
      catch (errore) {
        if (opzioni.signal?.aborted || segnaleStop?.aborted) throw errore;
        if (compattazione.classificaErroreFornitore(errore) !== 'contesto-pieno') throw errore;
        if (errore && typeof errore === 'object') errore.classificazione = 'contesto-pieno';
        /* Riverifica del bugfixer (16/10, NON-ASPETTARE-REV-03): se la seconda preparazione fallisce (il riassunto aspettato muore,
           un 429 del riassuntore) non si muore con l'errore del motore: si ripiega (owner 12/10, «errori di compattazione non
           devono bloccare il flusso chat») e si riprova lo stesso. Uno Stop resta uno Stop.
           ⛔ Seconda riverifica (NON-ASPETTARE-REV-06): il ripiego di `prepare` (`maybeCompactLegacy`) riassume solo oltre la soglia
           del legacy — sul desktop il tetto di serie, 200K — e un «contesto pieno» del fornitore arriva molto prima: la richiesta
           ripartiva IDENTICA (44.056 caratteri contro 44.056). Qui il fornitore ha già detto che non entra: come K8 (`inferLegacy`)
           si ignora la soglia, si usa il riassunto pronto o in preparazione, o se ne forza uno per «overflow». */
        let preparata;
        try { preparata = await original.prepare({ ...r.payload, messages: r.inputMessages, originali: r.grezzi, waitForInFlight: true, onInTurnWait: ascoltaAttesaDelMotore(r.requestIndex) }); }
        catch (secondo) {
          if (segnaleStop?.aborted || opzioni.signal?.aborted || secondo?.name === 'AbortError') throw secondo;
          if (!ripiegoDetto) {
            ripiegoDetto = true;
            emitOnGiro?.({ giro: r.requestIndex, tipo: 'compattazione-fine', compattato: false, motivo: 'ripiego', codice: secondo?.code ?? null });
          }
          const proiettata = projectLegacy(r.inputMessages);
          const { token, misura } = compattazione.misuraOccupazione({ ancora, messaggi: proiettata, finestraToken: soglie.finestraToken });
          if (inVolo) await inVolo.promessa;
          const scambio = scambioPossibile(r.inputMessages, { token, misura });
          const riassunta = scambio
            ? usaPronta(scambio, { requestIndex: r.requestIndex, motivo: 'overflow' })
            : await compattaOra(r.inputMessages, proiettata, { requestIndex: r.requestIndex, motivo: 'overflow', tokenMisurati: token, misura, soglia: soglie.soglia });
          preparata = { messages: riassunta ?? proiettata };
        }
        const nuova = compattazione.riattaccaEffimeri(correggiMessaggiDesktop(preparata?.messages ?? r.inputMessages, { cartella, memoria: correzioniFissate }), r.effimeri);
        r.array.splice(0, r.array.length, ...nuova);
        try { return await inferBase(opzioni, invoke); }
        catch (secondo) {
          if (secondo && typeof secondo === 'object' && compattazione.classificaErroreFornitore(secondo) === 'contesto-pieno') secondo.classificazione = 'contesto-pieno';
          throw secondo;
        }
      }
    };
    hooks.infer = (opzioni = {}, invokeGrezzo) => {
      const invoke = osservaTempi(invokeGrezzo); // A1: ogni risposta del giro dice quanto veloce il motore legge
      if (richiestaCorrente) return inferLegacy(opzioni, invoke);
      const r = richiestaSenzaAttesa; richiestaSenzaAttesa = null;
      return r ? inferSenzaAttesa(r, opzioni, invoke) : inferBase(opzioni, invoke);
    };
  }
  return hooks;
}

export async function talosLavora(input = {}) {
  /* 21/10/2026, lane CLI (b): l'avviso di inattività va dove lo vuole l'OSPITE. Con `onStallo` il record arriva a lui (la CLI ne fa
     un evento, in `-p` stderr resta pulito); senza, resta il `console.warn` di sempre del desktop. Un errore della funzione
     dell'ospite non deve fermare il giro per una diagnostica: si scarta lì, e solo lì. */
  const telemetry = creaTelemetriaStallo(typeof input.onStallo === 'function'
    ? { log: (record) => {
      try {
        const esito = input.onStallo(record);
        /* revisione C-1: un ospite `async` che rifiuta lascerebbe un rifiuto senza gestore, e Node lo fa uscire */
        if (esito && typeof esito.then === 'function') esito.then(undefined, () => { /* diagnostica: mai fatale */ });
      } catch { /* diagnostica: mai fatale */ }
    } }
    : {});
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
  /* 21/10/2026, lane CLI (a): il tetto si passa anche come OPZIONE (la CLI ha `context.compactAtTokens`), come Hermes lo passa al
     costruttore da configurazione (`agent/context_compressor.py:2903` threshold_tokens_cap, letto in `agent_init.py:1463`). Vince
     sull'ambiente; solo un intero positivo è un tetto scritto apposta, il resto ricade sulla variabile. */
  const tettoOpzione = Number.isSafeInteger(input.tettoCompattazioneToken) && input.tettoCompattazioneToken > 0 ? input.tettoCompattazioneToken : null;
  const soglie = compattazione.calcolaSoglie({
    tettoToken: tettoOpzione ?? compattazione.leggiTettoEsplicito(process.env),
    finestraToken: input.finestraToken ?? null,
  });
  /* 21/10/2026 (revisione S2): il limite d'uscita del modello, dove il registro lo sa (endpoint OpenRouter); null ⇒ 32.000 + la cintura */
  const limiteUscitaToken = Number.isFinite(input.limiteUscitaToken) && input.limiteUscitaToken > 0 ? Math.floor(input.limiteUscitaToken) : null;
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
    limiteUscitaToken,
    recordIniziale: input.recordCompattazioneIniziale ?? null,
    records,
    progressoAcceso: input.progressoCompattazione === true,
    fontiRicarica: input.fontiRicarica ?? null,
    compattazionePronta: input.compattazionePronta ?? null,
    istantanea: input.compattazioneIstantanea === true && !compattazione.motoreAPostoUnico(input.modello),
    compattazioneInArrivo: input.compattazioneInArrivo ?? null,
    /* A1 (owner 21/10/2026 sera): i due orologi del riassunto ATTESO e il «Skip» della persona (contratto riga viva §4-§5) */
    riassuntoInattivitaMs: interoPositivo(input.riassuntoInattivitaMs, RIASSUNTO_INATTIVITA_MS),
    riassuntoTettoMs: interoPositivo(input.riassuntoTettoMs, RIASSUNTO_TETTO_MS),
    segnaleSaltaRiassunto: input.segnaleSaltaRiassunto instanceof AbortSignal ? input.segnaleSaltaRiassunto : null,
    /* 21/10/2026 (CLI): il modello dei riassunti dell'ospite e la sua finestra; assenti ⇒ quelli della conversazione */
    modelloRiassunto: typeof input.modelloRiassunto === 'string' && input.modelloRiassunto ? input.modelloRiassunto : null,
    finestraRiassuntoToken: Number.isFinite(input.finestraRiassuntoToken) && input.finestraRiassuntoToken > 0 ? input.finestraRiassuntoToken : null,
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
    /* 15/10/2026: campi NUOVI, additivi — il riassunto preparato e non usato, quello ancora in preparazione, e il conto */
    const preparazione = {
      compattazionePronta: contextHooks.compattazionePronta,
      compattazioneInPreparazione: contextHooks.compattazioneInPreparazione,
      preparazioniDiCompattazione: contextHooks.conteggioPreparazioni,
    };
    if (!usage) return { ...result, compattazioni, recordDiCompattazione, ...preparazione };
    return {
      ...result,
      usage,
      compattazioni,
      recordDiCompattazione,
      ...preparazione,
      fuori: `${String(result?.detto ?? '').trim()}\n${JSON.stringify({ usage })}`.trim(),
    };
  } finally {
    telemetry.close();
  }
}
