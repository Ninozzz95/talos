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
import { existsSync, lstatSync, readdirSync, realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { isPathInside } from '../path-policy.mjs';
import * as compattazione from './compattazione-desktop.mjs';
import * as kernel from './talosHarness.mjs';
// ⭐ 06/10/2026 — la ricarica della memoria post-compact (opzione A, ricerca 5×5×5×5 §6.4): il blocco di
// fatti freschi che `compattaOra` fonde nella proiezione, accanto all'indice meccanico.
import { costruisciBloccoFatti, CARATTERI_BLOCCO_MASSIMI, MARCATORE_BLOCCO_TAGLIATO } from './ricarica-post-compact.mjs';
import { FRAZIONE_RICHIESTE_VECCHIE_SULLA_FINESTRA, limitaRichiesteVecchie, nomeDellaRichiestaSalvata, richiestaAllegataPerIlModello, salvaRichiestaIntera, testoSemplice, tettoRichiesteVecchie } from './richieste-vecchie.mjs';
import { RichiestaTroppoGrande, indiceRichiestaNuova, pesoDellaRichiestaNuova, testoAllegabile } from './richiesta-troppo-grande.mjs';
import { chiamataPerChiGuarda } from './ponte-attrezzi.mjs';

export * from './talosHarness.mjs';

/* 21/10/2026: `motoreAPostoUnico` vive in `compattazione-desktop.mjs` (la usa anche il registro, per il riassunto di fine giro che cede
   il posto); qui si riesporta com'era. */
export { motoreAPostoUnico } from './compattazione-desktop.mjs';

export const DESKTOP_BLACKBOX_HOTFIX_VERSION = '2026-09-15';
export const NO_TEST_SUITE_CODE = 'NO_TEST_SUITE_CONFIGURED';
export const STALL_DIAGNOSTIC_EVENT = 'desktop-harness-stall';
/* §4.1 del rapporto della CLI: sul rifiuto del fornitore, al più tre ritentativi per giro (70%, 50%, 35%; opencode `SHRINK_STEPS`,
   Claude Code `JZ=3` sui ritentativi della compattazione), poi il giro fallisce dicendo perché. */
export const RITENTATIVI_CONTESTO_PIENO_MASSIMI = 3;

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
/* 22/10/2026: i due numeri vivono in compattazione-desktop.mjs, perché li usa anche il riassunto di fine giro del registro. */
const { TENTATIVI_RIASSUNTO, ATTESA_RITENTA_RIASSUNTO_MS } = compattazione;

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
  /* 22/10/2026 (revisione avversaria, C): lo Skip della compattazione IN CORSO — il registro ne arma uno nuovo a ogni compattazione che si
     apre, e qui si legge al momento. Assente ⇒ `segnaleSaltaRiassunto`, uno per giro come prima. */
  saltaRiassuntoFn = null,
  /* 21/10/2026 (CLI): il modello che scrive i riassunti (null ⇒ quello della conversazione) e la sua finestra (`sceltaDelRiassunto`) */
  modelloRiassunto = null, finestraRiassuntoToken = null,
  /* Revisione 6 della CLI (S2-2): lo scarto misurato nel giro prima (dal registro); null ⇒ la stima degli attrezzi */
  scartoMisurato = null,
  /* Revisione 8 della CLI (N1): la stima degli schemi degli attrezzi del giro che ha misurato `scartoMisurato` (dal registro); null ⇒ ignota */
  stimaAttrezziMisurati = null,
  /* Revisione 7 della CLI (F6): la finestra per cui questa sessione ha già detto «non entra» (dal registro): non lo si ripete */
  nonEntraDetto = null,
  /* R11-7: la finestra e la scala dell'ultimo rifiuto del fornitore per questo modello (dal registro) */
  rifiutoNoto = null,
  /* R12-2: il codice del ripiego dal motore già detto in questa sessione e non ancora guarito (dal registro): non lo si ripete */
  ripiegoDettoPrima = null,
  /* R13-2: le posizioni nella storia delle richieste non inviate che il registro tiene perché il motore le ha già archiviate */
  richiesteNonInviate = [],
  /* Pezzo D (§4.3): il freno della sessione (dal registro), il giro della sessione (`versioneGiro`, per le ricariche) e se il primo
     numero vero di questo giro è il verdetto di un record scritto a fine del giro prima */
  frenoIniziale = null,
  /* R10-3: la copia del freno del registro, viva (una funzione): un riassunto di fine giro arrivato mentre il giro lavora la cambia */
  frenoVivo = null,
  versioneGiro = null,
  verdettoInAttesa = false,
  /* Pezzo E (§4.1): i riassunti veri della sessione (la loro stima, per la mediana S) e k, il fattore di sottostima misurato (dal registro) */
  riassuntiVeri = null,
  fattoreK = null,
  /* §4.2, regola N (owner 22/10/2026): «Invia come allegato». `true` per ogni richiesta nuova che non entra (la CLI senza interfaccia),
     oppure una funzione che riceve il testo della richiesta e dice se la persona ha scelto l'allegato per QUEL testo (il registro) */
  allegaSeTroppoGrande = false,
  /* ⭐ 06/10/2026 — le fonti dichiarate dall'ospite per il blocco di fatti post-compact (`input.fontiRicarica`):
   * LEDGER append-only, coda pendente, pericoli aperti. `cartella` (la cartella della sessione) resta la fonte
   * del `git log` locale; i file toccati vengono dall'indice meccanico di ogni compattazione. */
  fontiRicarica = null,
  /* §4.2, regola K (owner 22/10/2026): dove vanno le copie intere delle richieste vecchie accorciate per il modello (null ⇒ l'accorciamento
     lo dice, e il mezzo non si legge) */
  cartellaIncollati = null,
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
  /*
   * ⛔ 22/10/2026 (revisione avversaria, C): con un segnale solo per giro, dopo il primo Skip ogni richiesta successiva dello stesso giro
   *   riceveva un segnale GIÀ interrotto: il riassunto dopo diventava «saltato» senza che nessuno l'avesse chiesto, un guasto vero del
   *   motore più avanti non si diceva più («ripiego» taciuto) e un secondo Skip non era possibile. Il segnale giusto è quello della
   *   compattazione che si sta aspettando ADESSO: si legge qui, al momento, da chi lo riarma (il registro).
   */
  const segnaleSalta = () => {
    const corrente = typeof saltaRiassuntoFn === 'function' ? saltaRiassuntoFn() : null;
    return corrente instanceof AbortSignal ? corrente : segnaleSaltaRiassunto;
  };
  let compactions = 0;
  let providerRequests = 0;
  const correzioniFissate = new Map(); // L1: una correzione per esito, fissata alla prima richiesta (vedi `correggiMessaggiDesktop`)
  /* L'ancora: il numero VERO del fornitore per la lista lunga `lunghezza`; null finché non arriva una risposta. */
  let ancora = null;
  /* Revisione 6 della CLI (S2-2): finché il giro non ha un'ancora, la stima porta lo scarto misurato nel giro prima (dal registro), o
     — senza misura — la stima degli schemi degli attrezzi della prima richiesta. `ultimoScarto` è quello di questo giro, per il dopo. */
  let scartoDellaStima = Number.isFinite(scartoMisurato) && scartoMisurato >= 0 ? scartoMisurato : null;
  let ultimoScarto = null;
  /* Revisione 7 della CLI (F4): la stima degli schemi degli attrezzi di QUESTO giro (prima richiesta). Un giro che non ha misurato niente
     (fornitore senza `usage`, o con numeri non plausibili) restituisce lei, non lo scarto ereditato: il registro la usa nel riassunto di
     fine giro e nel /compact, che gli schemi davanti non li hanno. */
  let stimaAttrezziDelGiro = null;
  const scartoCorrente = () => ultimoScarto ?? scartoDellaStima ?? 0;
  /* Seconda passata della revisione 7 (F6): per «può entrare?» lo scarto INTERO — il più grande fra quello plausibile misurato senza tetto,
     la stima degli attrezzi del giro e quello della misura (`scartoPlausibile`, compattazione-desktop) */
  let ultimoScartoIntero = null;
  let stimaAttrezziInPrepare = false;
  const scartoPerNonEntra = () => Math.max(ultimoScartoIntero ?? 0, stimaAttrezziDelGiro ?? 0, scartoCorrente());
  let nonEntraGiaDetto = Number.isFinite(nonEntraDetto) ? nonEntraDetto : null;
  let tentativiFallitiNelTurno = 0;
  /* R11-5 (revisione 11 della CLI): l'ultimo riassunto PAGATO giudicato inutile in questo giro (allungava), col conto e il record su cui
     è stato fatto. Va al registro: il suo riassunto di fine giro rimandava la stessa identica richiesta e la ripagava. */
  let riassuntoInefficaceDelGiro = null;
  /* R11-7: l'ultimo rifiuto coi numeri del fornitore in questo giro (la sua finestra e il rapporto fra il suo conto e la nostra stima) */
  let rifiutoDelFornitore = null;
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
  /* §4.1 e §4.3.1 del rapporto della CLI (pezzo C, owner 22/10 «Tutto nella 0.6.13»): sul rifiuto del fornitore, per GIRO, al più
     `RITENTATIVI_CONTESTO_PIENO_MASSIMI` ritentativi e al più UN riassunto pagato: si paga solo al primo scalino, e il primo scalino
     c'è una volta per giro (`ritentativi` non torna indietro). `primoRifiuto` è la stima della prima richiesta rifiutata, da cui si
     contano gli scalini del 50% e del 35%. Prima: un ritentativo per giro, e un riassunto pagato anche quando non poteva bastare
     (misurato dalla CLI: 15.636 → 16.045, pagato, applicato, e il ritentativo rifiutato di nuovo). */
  const contestoPieno = { ritentativi: 0, primoRifiuto: null };
  /* Pezzo D (§4.3): il freno della sessione, vivo nel giro (il registro lo rilegge a fine giro, `freno` qui sotto nei ganci). `verdettoDelFreno`:
     il prossimo numero vero è il verdetto di una compattazione applicata (o del record scritto a fine del giro prima). */
  let freno = compattazione.frenoValido(frenoIniziale);
  let verdettoDelFreno = verdettoInAttesa === true;
  /* ⛔ R10-3 (revisione 10 della CLI): la copia del registro cambiata mentre il giro lavora (ricarica, colpo, tirata già detta) si unisce a
     quella del giro (`unisciFreni`) prima di ogni decisione e di ogni aggiornamento — solo quando è cambiata da quella vista l'ultima volta,
     così i colpi azzerati qui da una lettura sotto la soglia non tornano. Senza: il giro pagava col freno già tirato dal registro, e lo
     diceva una seconda volta con un altro `at`. */
  let frenoVivoVisto = JSON.stringify(freno);
  /* R11-4: la base dell'unione è l'ultima copia del registro già unita (all'inizio, quella con cui il giro è partito). E una tirata che
     arriva DETTA dal registro mentre questo giro non l'aveva si misura da ADESSO (`mezzo`, il tratto da riassumere di questa richiesta):
     prima il riferimento era quello del registro, più vecchio di questo giro, e il giro si riarmava per crescita e pagava 28 ms dopo
     «in pausa» (traccia r6e della CLI: «paused» 47.220, SUMMARY#3 47.248). */
  const conFrenoVivo = (f, { mezzo = null } = {}) => {
    if (typeof frenoVivo !== 'function') return f;
    let vivo;
    try { vivo = compattazione.frenoValido(frenoVivo()); } catch { return f; }
    const visto = JSON.stringify(vivo);
    if (visto === frenoVivoVisto) return f;
    let base = null;
    try { base = JSON.parse(frenoVivoVisto); } catch { base = null; }
    frenoVivoVisto = visto;
    const unito = compattazione.unisciFreni(f, vivo, base);
    const arrivaDetta = unito?.detto === true && !(compattazione.frenoTirato(f) && f?.detto === true);
    return arrivaDetta && Number.isFinite(mezzo) && mezzo > (unito.mezzoAlVerdetto ?? -1) ? { ...unito, mezzoAlVerdetto: mezzo } : unito;
  };
  /* R11-9 (revisione 11 della CLI): dentro una compattazione dovuta (`compattaDovuta`) la frase del freno aspetta la riga della
     compattazione che l'ha fatto tirare — prima «I riassunti automatici sono in pausa» arrivava PRIMA di «Contesto compattato … 27,7k →
     17,7k» del riassunto che l'aveva causata. Fuori (verdetto, preparazione in sottofondo) si dice subito, come prima. */
  let frasiDelFrenoInAttesa = null;
  /** Il freno nuovo; se ha appena tirato, lo dice UNA volta (`talos.compattazione` di fine, `motivo:'freno'`, contratto (c) con la CLI). */
  const aggiornaFreno = (nuovo, requestIndex) => {
    const { freno: dopo, evento } = compattazione.frenoCheTira(conFrenoVivo(nuovo), { at: new Date().toISOString() });
    freno = dopo;
    if (!evento) return;
    const riga = { giro: Number.isInteger(requestIndex) ? requestIndex : 0, tipo: 'compattazione-fine', ...evento };
    if (frasiDelFrenoInAttesa) frasiDelFrenoInAttesa.push(riga);
    else emitOnGiro?.(riga);
  };
  const identitaDelFreno = () => ({ modello, finestra: soglie.finestraToken });
  /* Pezzo E (§4.1): i riassunti veri della sessione (la stima del testo arrivato; la loro mediana è S) e k, misurato a ogni numero vero
     del giro (ereditato dal registro fino al primo). Si restituiscono nei ganci, e il registro li passa al giro dopo. */
  let riassuntiVeriDellaSessione = compattazione.conRiassuntoVero(riassuntiVeri, null);
  let kDellaSessione = Number.isFinite(fattoreK) ? Math.min(compattazione.FATTORE_K_MASSIMO, Math.max(1, fattoreK)) : null;
  const misureDiE = () => ({ mediana: compattazione.medianaRiassunti(riassuntiVeriDellaSessione), k: kDellaSessione ?? 1 });
  /* ⛔ BUG-5 (05/10/2026): i fallimenti CONSECUTIVI del riassuntore in questo turno (vedi compattaOra). */
  let fallimentiRiassuntoConsecutivi = 0;
  /* La richiesta che `prepare` ha appena preparato: l'array (mutabile in posto), il grezzo e gli effimeri. */
  let richiestaCorrente = null;
  let richiestaSenzaAttesa = null; // col motore: la richiesta mandata senza aspettare il riassunto in volo (ritentativo qui sotto)
  /* R12-2 (revisione 12 della CLI): col motore sano, la richiesta di adesso — se il fornitore risponde «contesto pieno», passa alla scala
     della compattazione semplice (`scalaDelContestoPieno`), come quando il motore cade */
  let richiestaDelMotore = null;
  /* Owner 12/10/2026: il ripiego dal motore del contesto si DICE una volta per turno, non a ogni richiesta.
     ⛔ R12-2: e una volta per SESSIONE finché il motore non torna sano — la CLI l'ha misurato detto a ogni giro, sette volte di fila, col
     motore che falliva sempre con lo stesso codice (CTX_CONTEXT_OVERFLOW a 65.536 con risposte da 8k). `ripiegoInCorso`: il codice detto
     (in questo giro o prima) e non ancora guarito; una preparazione riuscita del motore lo azzera, e un guasto dopo si dice di nuovo. */
  let ripiegoDetto = false;
  let ripiegoInCorso = typeof ripiegoDettoPrima === 'string' && ripiegoDettoPrima ? ripiegoDettoPrima : null;
  const diciRipiego = (codice) => {
    const c = typeof codice === 'string' && codice ? codice : 'unknown';
    const gia = ripiegoDetto || ripiegoInCorso === c;
    ripiegoInCorso = c;
    if (gia) return false;
    ripiegoDetto = true;
    return true;
  };
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

  /* ⛔ R13-1 (revisione 13 della CLI, 23/10/2026): una richiesta che la regola N ha mandato come allegato DOPO un accorciamento (dal secondo
     scalino) stava ancora intera nella proiezione: il record del primo scalino fotografa le richieste tenute alla lettera, la nuova
     compresa, e `applicaRecord` riporta quella fotografia. L'allegato non cambiava niente e il giro finiva in «non entra». La proiezione
     porta le forme allegate del giro (`allegate`) ovunque la richiesta compaia. */
  /* ⛔ Revisione 14 della CLI (s4 `paste-12k`, 23/10/2026): R13-3 manda al modello e al motore la forma CORTA di una richiesta vecchia di
     cui la sessione ha la copia intera (`copieGiaSalvate`). Ma le impronte — il prefisso di un riassunto pronto o in volo, il tratto
     coperto di un record — le calcola anche il REGISTRO, sulla storia intera. Con la forma corta dentro non combaciavano più: il riassunto
     di fine giro, valido, non diventava la base all'emergenza, e il giro pagava un secondo riassunto che toglieva ~130 token (la regola
     del 10% ne chiede 921). ⇒ Ogni impronta si calcola sulla storia VERA: la forma corta ricorda il suo originale e `storiaVera` lo
     rimette al suo posto. Ciò che si manda (proiezione, modello, riassuntore) resta corto. */
  const originaleDellaCopia = new WeakMap();
  const storiaVera = (lista) => (Array.isArray(lista) && lista.some((m) => originaleDellaCopia.has(m))
    ? lista.map((m) => originaleDellaCopia.get(m) ?? m) : lista);
  const projectLegacy = (rawMessages) => {
    const proiettati = compacted && compattazione.recordValePerLaStoria(storiaVera(rawMessages), compacted)
      ? [...compacted.riassunto, ...rawMessages.slice(compacted.coveredThrough)] : rawMessages; // `applicaRecord`, col tratto coperto VERO
    if (allegate.size === 0 || !Array.isArray(proiettati)) return proiettati;
    let cambiata = false;
    const fuori = proiettati.map((m) => {
      const testo = compattazione.eRichiestaVera(m) ? testoSemplice(m) : null;
      if (testo === null || !allegate.has(testo)) return m;
      cambiata = true;
      return allegate.get(testo);
    });
    return cambiata ? fuori : proiettati;
  };

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
  /* R12-3 (revisione 12 della CLI): la richiesta più grande che il fornitore ha ACCETTATO in questo giro (il suo prompt_tokens): il registro
     non ricorda mai una finestra più piccola di così, perché un rifiuto che la contraddice è un rifiuto strano, non la finestra */
  let massimoAccettato = null;
  /* ⛔ R13-1 (revisione 13 della CLI, 23/10/2026, terza parte): «Nothing was summarized» era falso. Sul rifiuto la scala applicava il
     riassunto SENZA modello (30.426 → 26.155, annunciato e nel giornale), il fornitore rifiutava di nuovo, il giro falliva — e il
     registro teneva quel riassunto per il giro dopo (R10-7). Un riassunto gratuito che nessuna risposta del fornitore ha ancora
     accettato, in un giro che fallisce, non si tiene: esce dai record del giro e si annulla nel giornale con lo stesso segnale
     dell'«Annulla» (`fase:'annullata'`, che interfaccia e CLI sanno già disegnare). Un riassunto PAGATO resta (R10-7: ripagarlo al giro
     dopo è proprio il costo da evitare), e resta anche il gratuito che una risposta ha confermato prima che il giro fallisse per altro.
     `recordsConfermati`: quanti record c'erano all'ultima risposta riuscita. */
  let recordsConfermati = records.length;
  const recordGratuiti = new WeakSet();
  const annullaGratuitiNonConfermati = () => {
    let tolti = 0;
    for (let i = records.length - 1; i >= recordsConfermati; i -= 1) {
      if (!recordGratuiti.has(records[i])) continue;
      const [record] = records.splice(i, 1);
      tolti += 1;
      emitOnGiro?.({ tipo: 'compattazione-annullata', at: record.at, coveredThrough: record.coveredThrough, motivo: 'giro-fallito' });
    }
    return tolti;
  };
  const osservaTempi = (invoke) => async (segnale) => {
    const esito = await invoke(segnale);
    recordsConfermati = records.length; // R13-1: il fornitore ha accettato la richiesta fatta con questi record
    registraTempi(esito?.timings);
    const p = Number(esito?.usage?.prompt_tokens);
    if (Number.isSafeInteger(p) && p > 0 && !(massimoAccettato >= p)) massimoAccettato = p;
    return esito;
  };
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
      /* ⛔ 22/10/2026 (CLI, revisione 3 della 0.6.13, S2-1): un riassunto su un modello DIVERSO da quello della conversazione (il leggero)
         passava per la catena del giro: un suo 429/5xx metteva in PANCHINA la chiave della conversazione (`runtime-owner-adapter.mjs`,
         `mettiInPanchina`, 60 s o il Retry-After intero) e la richiesta PAGATA del giro aspettava dietro — misurato dalla CLI: 104 s
         fermi con Retry-After 90, il giro fallito dopo 167 s con Retry-After 3600, senza che il modello pagato fosse mai chiamato. Va
         come chiamata secondaria (niente panchina, niente catena dei fornitori, un ritentativo): se fallisce, il riassunto senza
         modello di sempre. */
      ...(modelloScelto && modelloScelto !== modello ? { secondaria: true, modelloProprio: true } : secondaria ? { secondaria: true } : {}),
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
  /* `conBase` (terza passata avversaria, R1): una base è già stata adottata per questa richiesta (`compattaDovuta`). Un fallimento del
     resto NON disegna una riga sua — la riga della richiesta la chiude `annunciaCompattazione` con la compattazione che c'è stata: prima
     la persona vedeva «inefficace» (o «errore») e subito dopo «compattato» per la stessa richiesta. */
  /* Revisione 6 della CLI (S4-1): il blocco dei fatti avviato (git) si aspetta su OGNI uscita della preparazione — anche lo Stop e il
     riassunto fallito, che prima lo lasciavano correre dopo il giro; con lo Stop git riceve il segnale e finisce subito. */
  const preparaCompattazione = async (rawMessages, projected, opzioni) => {
    const gitInVolo = { promessa: null };
    try { return await preparaCompattazioneCorpo(rawMessages, projected, opzioni, gitInVolo); }
    finally { if (gitInVolo.promessa) await gitInVolo.promessa.catch(() => {}); }
  };
  /* `bersaglio` (pezzo C, solo sul rifiuto del fornitore): quanto deve pesare al più la proiezione (stima coi pezzi, senza effimeri né
     scarto); i passi gratuiti si stringono su di lui, e un riassunto si paga solo se può arrivarci. `livelloContestoPieno`: lo scalino
     (0 = primo rifiuto del giro; dal secondo niente riassunti nuovi). */
  const preparaCompattazioneCorpo = async (rawMessages, projected, { requestIndex, motivo, tokenMisurati, misura, soglia, inSottofondo = false, inizioDetto = false, conBase = false, bersaglio = null, livelloContestoPieno = 0, certo = null }, gitInVolo) => {
    const sulBersaglio = motivo === 'overflow' && Number.isFinite(bersaglio);
    /* Z-K3: la linea certa del rifiuto coi numeri (`riscriviPerIlContestoPieno`); una proiezione senza riassunto pagato che la passa non si
       scrive, «non entra» si dice (una volta per finestra, col pavimento nella scala del fornitore) e la riga aperta si chiude */
    const lineaCerta = sulBersaglio && certo && Number.isFinite(certo.limite) ? certo : null;
    const oltreLaLineaCerta = (proiezione) => lineaCerta !== null && compattazione.stimaConPezzi(proiezione) > lineaCerta.limite;
    const fermaOltreLaLineaCerta = (proiezione, { rigaAperta }) => {
      const finestra = lineaCerta.finestra;
      if (conBase) restoNonRiuscito = { motivo: 'non-entra' };
      if (nonEntraGiaDetto !== finestra) {
        nonEntraGiaDetto = finestra;
        emitOnGiro?.({ giro: requestIndex, tipo: 'compattazione-fine', compattato: false, motivo: 'non-entra', finestra,
          pavimento: Math.ceil((compattazione.stimaConPezzi(proiezione) + lineaCerta.parteFissa) * lineaCerta.scala) });
      } else if (rigaAperta && !conBase) emitOnGiro?.({ giro: requestIndex, tipo: 'compattazione-fine', compattato: false, motivo: 'nulla-da-ridurre' });
      return null;
    };
    /* §4.2, regola K (owner 22/10/2026, decisione presa nella sessione della CLI): le richieste vecchie della persona oltre il loro
       budget — min(20.000 token, 15% della finestra) dalla più nuova, come Codex (`compact.rs:64`, `:715-799`) — si accorciano PRIMA
       di dividere: inizio e fine, e il testo intero in un file della sessione che `leggi` apre senza chiedere (Codex le butta). Così
       anche le richieste tenute alla lettera e la proiezione senza riassunto sono accorciate, e il pavimento non porta più un log
       incollato due richieste fa. L'ultima richiesta non si tocca (regola N). */
    /* Pezzo C: sul rifiuto del fornitore i tetti dei passi gratuiti sono quelli di sempre, stretti sul bersaglio quando è più piccolo
       (il bersaglio fa la parte della finestra: il 15% per le richieste vecchie, la quota di Hermes per la coda) — così il secondo e il
       terzo scalino, senza riassunti nuovi, accorciano davvero di più del primo. */
    const tettoK = tettoRichiesteVecchie({ finestraToken: soglie.finestraToken, soglia: soglie.soglia });
    const regolaK = await limitaRichiesteVecchie(projected, {
      budgetToken: sulBersaglio ? Math.max(1, Math.min(tettoK, Math.floor(bersaglio * FRAZIONE_RICHIESTE_VECCHIE_SULLA_FINESTRA))) : tettoK,
      cartella: cartellaIncollati, eRichiesta: compattazione.eRichiestaVera, stima: kernel.stimaTokenConversazione,
    });
    /* Pezzo C, terzo passo gratuito: le immagini vecchie (non quelle dell'ultima richiesta) diventano un segnaposto, solo sul rifiuto */
    const immagini = sulBersaglio ? compattazione.immaginiVecchieInSegnaposto(regolaK.messaggi) : { messaggi: regolaK.messaggi, sostituite: 0 };
    const divise = compattazione.dividiPerCompattazione(immagini.messaggi);
    /*
     * ⛔ Owner 26/09/2026, «Come Hermes»: la coda letterale sotto pressione si accorcia (inizio + fine degli esiti lunghi,
     *   doppioni tolti) PRIMA di giudicare la proiezione — altrimenti due letture grandi nella coda la tengono sopra il
     *   tetto per sempre (`compattazione-desktop.mjs`, «LA CODA LETTERALE NON È UN PAVIMENTO»).
     */
    const pressione = compattazione.riduciCodaSottoPressione(divise.coda, {
      budgetToken: compattazione.budgetCoda(sulBersaglio && !(Number.isFinite(soglie.soglia) && soglie.soglia > 0 && soglie.soglia <= bersaglio) ? bersaglio : soglie.soglia) });
    const parti = { ...divise, coda: pressione.coda };
    /* Pezzo D: il freno di adesso — si riarma (null) se il tratto da riassumere è cresciuto del 10% della soglia dal verdetto, o se
       modello o finestra sono cambiati */
    const mezzoDiAdesso = compattazione.mezzoDellaProiezione(projected);
    const frenoOra = compattazione.frenoDiAdesso(conFrenoVivo(freno, { mezzo: mezzoDiAdesso }), { mezzo: mezzoDiAdesso, soglia: soglie.soglia, ...identitaDelFreno() }); // R10-3, R11-4
    freno = frenoOra; // riarmato del tutto (null) o in parte (colpi azzerati, ricariche tenute: Z-K2)
    const frenato = compattazione.frenoTirato(frenoOra);
    /* 15/10/2026: questi numeri giudicano la compattazione APPLICATA (verdetto sul numero vero): si portano nel risultato e li fissa
       `applicaCompattazione`, così un riassunto preparato in anticipo e mai usato non sposta il giudizio di quello in uso. */
    const pavimento = kernel.stimaTokenConversazione([...parti.testa, ...parti.richiesteLetterali, ...parti.coda]);
    const misureDelPavimento = { codaAlMinimo: pressione.alMinimo, pavimento };
    /* 22/10/2026 (revisione 4 della CLI sulla 0.6.13, S2-1): il registro non paga un riassunto che non può ridurre
       (`compattazione.riassuntoNonPuoRidurre`), il giro sì — un log incollato negli ultimi scambi con poca storia vecchia pagava un
       riassunto a ogni giro e lo buttava come «inefficace». Si misura ciò che il riassunto può davvero togliere: la proiezione con la
       coda GIÀ accorciata contro il pavimento (il risparmio della coda c'è anche senza riassunto, e non deve farne pagare uno). Non
       vale per l'overflow: lì il fornitore ha già detto «non entra» e la stima non decide (decisione dell'owner del 21/10, ripiego). */
    /* ⛔ Revisione 5 della CLI (22/10/2026 notte, S2-1 di nuovo): contro il pavimento NUDO restava una fascia di spreco. La proiezione
       riassunta porta una CORNICE fissa qualunque sia il riassunto — marcatore, indice meccanico, blocco dei fatti, riga di recupero —
       misurata dalla CLI con le sole funzioni del kernel: 391 token stimati fuori da git, 555 dentro. Con una parte riducibile fra 257
       e la cornice il giro pagava un riassunto che non poteva ridurre (con risposte da 1.300 caratteri: quattro riassunti pagati fra
       T3 e T6, uno buttato). ⇒ Il pavimento è la proiezione col riassunto VUOTO, coi pezzi veri di questo progetto (indice e blocco dei
       fatti si calcolano ora e si riusano dopo il riassunto), e un riassunto deve poterla battere di almeno un riassunto minimo.
       Hermes salta in proporzione (`_FEASIBILITY_SKIP_MIDDLE_FRACTION`, il 10% della soglia, `agent/context_compressor.py:1163-1166`)
       e solo dopo un primo colpo a vuoto; qui la cornice vera, dal primo colpo. Con immagini o pezzi la stima è cieca: si fa come prima. */
    const bloccoFattiPer = async (indiceDelMezzo) => {
      const dichiarateFonti = fontiRicarica && typeof fontiRicarica === 'object' ? fontiRicarica : {};
      try {
        const lettura = costruisciBloccoFatti({
          ...dichiarateFonti,
          cartellaProgetto: dichiarateFonti.cartellaProgetto ?? cartella ?? null,
          fileToccati: [...(Array.isArray(dichiarateFonti.fileToccati) ? dichiarateFonti.fileToccati : []), ...indiceDelMezzo.fileRiletti],
          fatti: [
            ...(Array.isArray(dichiarateFonti.fatti) ? dichiarateFonti.fatti : []),
            `Compaction record ${compattazione.SCHEMA_RECORD_COMPATTAZIONE}: coveredThrough=${rawMessages.length} raw messages`,
          ],
        }, { segnale: segnaleStop ?? null });
        gitInVolo.promessa = lettura;
        return (await lettura).testo;
      } catch { return ''; } // costruisciBloccoFatti non lancia mai: per difesa il compact continua senza blocco
    };
    let indice = null;
    let bloccoFatti = null;
    let bloccoInArrivo = null;
    let nonPuoRidurre = false;
    let nonEntra = null;
    if (parti.tagliabile) indice = compattazione.indiceMeccanico(parti.mezzo, { precedente: compacted?.indice ?? null });
    /* ⛔ Revisione 7 della CLI (F6): se il pavimento più piccolo, col riassunto atteso e lo scarto, non entra nella finestra, nessun
       riassunto la farà entrare — nemmeno sul rifiuto del fornitore, dove la strada dell'overflow pagava un riassunto a ogni giro fallito
       su una finestra più piccola degli attrezzi (`pavimentoOltreLaFinestra`). Niente si paga, e lo si dice una volta per finestra. */
    /* …e anche SENZA un tratto vecchio: niente da riassumere, ma sistema, attrezzi e coda da soli non entrano — non si paga niente comunque,
       e la persona lo deve sapere (prima il giro falliva sul rifiuto del fornitore senza una parola) */
    nonEntra = compattazione.pavimentoOltreLaFinestra({
      pavimentoConCornice: parti.tagliabile
        ? compattazione.stimaConPezzi(compattazione.costruisciProiezione({ testa: parti.testa, richiesteLetterali: parti.richiesteLetterali,
          riassunto: '', indice: indice.testo, coda: parti.coda, bloccoFatti: '', recintaSintesi: false }))
        : compattazione.stimaConPezzi([...parti.testa, ...parti.mezzo, ...parti.coda]),
      mezzo: parti.tagliabile ? parti.mezzo : [], finestraToken: soglie.finestraToken, soglia: soglie.soglia, scarto: scartoPerNonEntra(),
      mediana: misureDiE().mediana, // pezzo E
    });
    if (nonEntra !== null) nonPuoRidurre = true;
    /* ⛔ Revisione 10 della CLI (23/10/2026), il pavimento di F6: conta un riassunto PAGATO (il riassunto atteso) e blocca il pagamento,
       in silenzio. «Non entra» si DICE solo se nemmeno il riassunto senza modello (gratuito) entra con lo scarto. Misurato: il giro diceva
       «scegli un modello con una finestra più grande», poi dopo il rifiuto il riassunto senza modello entrava e il giro riusciva — una
       frase falsa a schermo. Senza un tratto vecchio i due pavimenti sono lo stesso.
       ⛔ R12-1 (revisione 12 della CLI): e «non entra» si dice con la parte dello scarto che è cornice DI CERTO (`scartoFissoCerto`), non
       con lo scarto intero — quello porta anche la storia contata più della stima, che il pavimento ha già tolto (il base64 letto al
       giro prima: a 49.152 il giro riusciva a 35.984 e diceva «troppo piccola… circa 50.238»; detto una volta per finestra, avrebbe
       zittito quello vero dopo). Il blocco del pagamento qui sopra resta prudente, in silenzio. */
    const scartoCertoDiF6 = compattazione.scartoFissoCerto({ scarto: scartoPerNonEntra(), attrezzi: stimaAttrezziDelGiro ?? 0,
      spiegabileDallaStoria: compattazione.scartoSpiegabileDallaStoria(compattazione.senzaLaRichiestaNuova(projected)) }); // R13-1
    const nonEntraDaDire = nonEntra === null ? null : compattazione.pavimentoOltreLaFinestra({
      pavimentoConCornice: parti.tagliabile
        ? compattazione.stimaConPezzi(compattazione.costruisciProiezione({ testa: parti.testa, richiesteLetterali: parti.richiesteLetterali,
          riassunto: compattazione.riassuntoDiRipiego(parti.mezzo, { classe: 'bersaglio' }), indice: indice.testo, coda: parti.coda, bloccoFatti: '', recintaSintesi: false }))
        : compattazione.stimaConPezzi([...parti.testa, ...parti.mezzo, ...parti.coda]),
      mezzo: [], finestraToken: soglie.finestraToken, soglia: soglie.soglia, scarto: scartoCertoDiF6,
    });
    /*
     * ⭐ Pezzo C (§4.1 del rapporto della CLI, owner 22/10: «un riassunto si paga solo se toglie davvero», «sul rifiuto del fornitore la
     *   stima decide se un passo accorcia, non se la conversazione entra»). Sul rifiuto decide il BERSAGLIO, non la soglia:
     *   1. i passi gratuiti (coda, richieste vecchie, immagini vecchie) bastano ⇒ si riparte senza pagare niente (la strada «sola coda»);
     *   2. altrimenti un riassunto si paga solo se il pavimento vuoto più il riassunto atteso ci arriva, al primo scalino e una volta per
     *      giro (opencode paga a ogni rifiuto, `runner/llm.ts:265-270`; Claude Code ritenta senza misurare, rapporto §2.3-§2.4);
     *   3. se nemmeno il miglior riassunto ci arriva, o lo scalino non ne ammette, il riassunto SENZA modello (gratuito: l'indice);
     *   e quello che non arriva al bersaglio non parte (sotto, dopo la proiezione). F6 ha già detto «non entra» se doveva: qui non decide.
     */
    let forzatoDalBersaglio = null;
    let gratuitoSulBersaglio = false;
    if (sulBersaglio) {
      nonPuoRidurre = false;
      if (compattazione.stimaConPezzi([...parti.testa, ...parti.mezzo, ...parti.coda]) <= bersaglio) gratuitoSulBersaglio = true;
      else if (parti.tagliabile) {
        const pavimentoVuoto = compattazione.stimaConPezzi(compattazione.costruisciProiezione({ testa: parti.testa,
          richiesteLetterali: parti.richiesteLetterali, riassunto: '', indice: indice.testo, coda: parti.coda, bloccoFatti: '', recintaSintesi: false }));
        const puoPagare = livelloContestoPieno === 0
          && pavimentoVuoto + compattazione.riassuntoAtteso(parti.mezzo, { finestraToken: soglie.finestraToken, soglia: soglie.soglia, mediana: misureDiE().mediana }) <= bersaglio;
        if (!puoPagare) forzatoDalBersaglio = 'bersaglio';
        else if (frenato) forzatoDalBersaglio = 'freno'; // pezzo D: col freno tirato nemmeno il rifiuto paga; ragione concordata con la CLI
      }
    }
    /* Pezzo D: col freno tirato niente riassunti automatici pagati — alla soglia, all'emergenza, in sottofondo e sul rifiuto senza
       bersaglio (la strada del motore del contesto); restano i passi gratuiti (la «sola coda») */
    if (frenato && parti.tagliabile && !sulBersaglio) nonPuoRidurre = true;
    /* ⛔ R11-6 (revisione 11 della CLI, 23/10/2026): col freno tirato, all'EMERGENZA, una richiesta che dopo i passi gratuiti resta oltre
       la finestra DICHIARATA (stima più scarto: certo, la stessa lettura di N7 e di F2a) partiva lo stesso e aspettava il rifiuto — ogni
       giro (TuiApp a 32.768: 37.698 e 37.809 mandati e rifiutati; 14 rifiuti in 20 giri a 10.240). Dopo il rifiuto la strada del
       contesto pieno scriveva comunque il riassunto senza modello. Ora lo scrive PRIMA di mandare (ragione 'freno', la stessa del
       rifiuto): stesso esito, niente pagato, una richiesta rifiutata in meno. Fra l'emergenza e la finestra decide il fornitore. */
    if (frenato && parti.tagliabile && !sulBersaglio && !inSottofondo && motivo === 'emergenza' && Number.isFinite(soglie.finestraToken)
      && nonEntraDaDire === null // se nemmeno lui entra, F6 l'ha già detto: scriverlo non servirebbe
      && compattazione.stimaConPezzi([...parti.testa, ...parti.mezzo, ...parti.coda]) + Math.round(scartoCorrente()) > soglie.finestraToken) {
      nonPuoRidurre = false;
      forzatoDalBersaglio = 'freno';
    }
    if (parti.tagliabile && motivo !== 'overflow' && !nonPuoRidurre && !forzatoDalBersaglio) {
      /* Il blocco dei fatti legge git. La sua lunghezza ha un tetto noto (`CARATTERI_BLOCCO_MASSIMI` più il marcatore di taglio) e la
         stima conta i caratteri, quindi: inutile anche senza blocco ⇒ si salta, e git non parte; utile anche col blocco più grande
         possibile ⇒ si paga senza aspettare git, che parte subito e finisce durante il riassunto (serve alla proiezione); solo in
         mezzo si aspetta il blocco vero. Sotto carico l'attesa di git spostava la preparazione in sottofondo dietro l'emergenza
         (IST-02 nella suite intera); e un git avviato per un riassunto poi saltato restava aperto nella cartella del progetto dopo
         il giro (EPERM sulla cartella di prova nella suite intera). */
      const pavimentoCon = (blocco) => compattazione.stimaConPezzi(compattazione.costruisciProiezione({
        testa: parti.testa, richiesteLetterali: parti.richiesteLetterali, riassunto: '', indice: indice.testo, coda: parti.coda,
        bloccoFatti: blocco, recintaSintesi: blocco !== '',
      }));
      /* una regola sola per la soglia, l'emergenza e il riassunto preparato in anticipo: il guadagno atteso, al netto della cornice e
         del riassunto, è almeno il 10% della soglia (verdetto della CLI, C1 e C2) */
      const utileCon = (pavimentoConCornice) => compattazione.riassuntoUtile({
        prima: compattazione.stimaConPezzi([...parti.testa, ...parti.mezzo, ...parti.coda]), pavimentoConCornice, mezzo: parti.mezzo,
        soglia: soglie.soglia, finestraToken: soglie.finestraToken, motivo, scarto: scartoPerNonEntra(), ...misureDiE(), // pezzo E: S e k
      });
      if (!utileCon(pavimentoCon(''))) nonPuoRidurre = true;
      else {
        bloccoInArrivo = bloccoFattiPer(indice);
        if (!utileCon(pavimentoCon(`${'x'.repeat(CARATTERI_BLOCCO_MASSIMI)}\n${MARCATORE_BLOCCO_TAGLIATO}`))) {
          bloccoFatti = await bloccoInArrivo;
          nonPuoRidurre = !utileCon(pavimentoCon(bloccoFatti));
          /* ⛔ Revisione 8 della CLI (N1, seconda forma, trovata dalla prova che la CLI ha chiesto, 23/10/2026): il blocco dei fatti è un
             aiuto, non il pavimento. Se è LUI a far uscire la proiezione dalla finestra (senza blocco il riassunto entra ed è utile: l'ha
             detto il controllo qui sopra), il riassunto si fa senza blocco. Prima la richiesta partiva oltre la finestra (11.258 su 10.240
             con ~8.000 token di schemi), il fornitore la rifiutava e la strada dell'overflow pagava lo stesso riassunto, col blocco. */
          if (nonPuoRidurre && bloccoFatti !== '' && compattazione.pavimentoOltreLaFinestra({ pavimentoConCornice: pavimentoCon(bloccoFatti),
            mezzo: parti.mezzo, finestraToken: soglie.finestraToken, soglia: soglie.soglia, scarto: scartoPerNonEntra(), mediana: misureDiE().mediana }) !== null) {
            bloccoFatti = '';
            nonPuoRidurre = false;
          }
        }
      }
    }
    let nonEntraDettoOra = false;
    if (nonEntraDaDire !== null && !inSottofondo && nonEntraGiaDetto !== soglie.finestraToken) {
      nonEntraGiaDetto = soglie.finestraToken;
      nonEntraDettoOra = true;
      emitOnGiro?.({ giro: requestIndex, tipo: 'compattazione-fine', compattato: false, motivo: 'non-entra', finestra: soglie.finestraToken, pavimento: nonEntraDaDire });
    }
    if (!parti.tagliabile || nonPuoRidurre || gratuitoSulBersaglio) {
      /* Niente da riassumere (o niente che un riassunto possa ridurre) e la coda già dentro il suo tetto: nessun tentativo, nessun
         evento, nessuna chiamata. */
      if (pressione.ridotti === 0 && regolaK.accorciati === 0 && immagini.sostituite === 0) {
        /* 22/10/2026 (revisione avversaria, B): la riga viva aperta dall'attesa d'emergenza si chiude, muta — non c'era niente da ridurre
           (o l'ha già chiusa «non entra», qui sopra) */
        if (conBase) restoNonRiuscito = { motivo: 'nulla-da-ridurre' };
        if (inizioDetto && !inSottofondo && !conBase && !nonEntraDettoOra) emitOnGiro?.({ giro: requestIndex, tipo: 'compattazione-fine', compattato: false, motivo: 'nulla-da-ridurre' });
        return null;
      }
      /* Niente da riassumere ma la coda si è accorciata: la proiezione nuova è deterministica, senza il riassuntore
       * (Hermes `_FEASIBILITY_SKIP_MIDDLE_FRACTION`, `:1124-1127`: «dropping alone suffices»). */
      const proiezioneSolaCoda = [...parti.testa, ...parti.mezzo, ...parti.coda];
      if (oltreLaLineaCerta(proiezioneSolaCoda)) return fermaOltreLaLineaCerta(proiezioneSolaCoda, { rigaAperta: inizioDetto }); // Z-K3
      if (!inSottofondo) {
        if (!inizioDetto) emitOnGiro?.({ giro: requestIndex, tipo: 'compattazione-inizio', tokenMisurati, soglia, motivo });
        progresso(requestIndex, { fase: 'lettura', messaggi: projected.length, tokenPrima: tokenMisurati, motivo });
      } else iniziaPreparata(requestIndex, tokenMisurati);
      const recordSolaCoda = compattazione.creaRecord({
        coveredThrough: rawMessages.length,
        riassunto: proiezioneSolaCoda,
        tokenPrima: tokenMisurati,
        tokenDopo: kernel.stimaTokenConversazione(proiezioneSolaCoda) + Math.round(scartoCorrente()), // N3: la scala di tokenPrima
        misura,
        at: new Date().toISOString(),
        modello,
        indice: compacted?.indice ?? null,
        coperti: storiaVera(rawMessages), // revisione 14: il tratto coperto VERO
        freno, // pezzo D: la copia nel record (contratto (d) con la CLI)
      });
      /* Nessun riassunto da contare: dalla lettura si passa alla sostituzione (le fasi vere, mai finte). */
      return { proiezione: proiezioneSolaCoda, record: recordSolaCoda, soloCoda: true, ...misureDelPavimento, budget: null,
        ...(regolaK.accorciati > 0 ? { accorciati: regolaK.accorciati } : {}),
        ...(pressione.ridotti > 0 ? { ridotti: pressione.ridotti } : {}), ...(immagini.sostituite > 0 ? { immagini: immagini.sostituite } : {}) };
    }
    if (!inSottofondo) {
      if (!inizioDetto) emitOnGiro?.({ giro: requestIndex, tipo: 'compattazione-inizio', tokenMisurati, soglia, motivo });
      progresso(requestIndex, { fase: 'lettura', messaggi: projected.length, tokenPrima: tokenMisurati, motivo });
    } else iniziaPreparata(requestIndex, tokenMisurati);
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
    /* Pezzo C: sul rifiuto, quando il bersaglio non ammette un riassunto pagato, quello senza modello parte subito (ragione 'bersaglio') */
    const forzato = inSottofondo ? null : forzatoDalBersaglio ?? (senzaModelloPerRichiesta?.requestIndex === requestIndex ? senzaModelloPerRichiesta.ragione
      : stimaLetturaMs !== null && stimaLetturaMs > riassuntoTettoMs ? 'stima' : null);
    const orologio = inSottofondo || forzato ? null : creaOrologioRiassunto({ segnaleStop, segnaleSalta: segnaleSalta(), inattivitaMs: riassuntoInattivitaMs, tettoMs: riassuntoTettoMs });
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
        if (segnaleStop?.aborted) {
          orologio?.chiudi();
          /* 22/10/2026 (CLI, revisione 3, S4): uno Stop durante il riassunto atteso lasciava l'«inizio» senza la sua «fine» nel giornale,
             e la riga viva aperta. Si chiude, muta come lo Stop dell'attesa d'emergenza. */
          if (conBase) restoNonRiuscito = { motivo: 'interrotta', interrottaIn: 'riassunto' };
          if (!inSottofondo && !conBase) emitOnGiro?.({ giro: requestIndex, tipo: 'compattazione-fine', compattato: false, motivo: 'interrotta', interrottaIn: 'riassunto' });
          throw errore;
        }
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
      if (conBase && !inSottofondo) restoNonRiuscito = { motivo: esito.motivo, classe: esito.classe ?? esito.motivo, fallimentiConsecutivi: fallimentiRiassuntoConsecutivi, interrottaIn: 'riassunto' };
      if (inSottofondo || !conBase) emitOnGiro?.({ giro: requestIndex, tipo: inSottofondo ? 'compattazione-preparata' : 'compattazione-fine', compattato: false, motivo: esito.motivo, classe: esito.classe ?? esito.motivo, fallimentiConsecutivi: fallimentiRiassuntoConsecutivi, interrottaIn: 'riassunto' });
      return null;
    }
    /* Pezzo D: un riassunto PAGATO e arrivato è una ricarica, nel giro della sessione — anche se poi non si usa (si è pagato lo stesso).
       Tre in tre giri tirano il freno (Claude Code, «thrashing»). Quello senza modello non si paga. */
    /* R11-4: col tratto di adesso, come i colpi — una tirata per ricariche si misura dal riassunto che l'ha fatta tirare */
    if (!esito.ripiego) aggiornaFreno(compattazione.ricaricaAlFreno(freno, { giro: versioneGiro, mezzo: compattazione.mezzoDellaProiezione(projected), ...identitaDelFreno() }), requestIndex);
    /* Pezzo E: il riassunto pagato e arrivato entra nei riassunti veri della sessione, pesato col testo arrivato (le unità di G) */
    if (!esito.ripiego) riassuntiVeriDellaSessione = compattazione.conRiassuntoVero(riassuntiVeriDellaSessione, kernel.stimaToken(String(esito.riassunto ?? '').trim()));
    if (!indice) indice = compattazione.indiceMeccanico(parti.mezzo, { precedente: compacted?.indice ?? null });
    /* Z-K3: sul rifiuto coi numeri il riassunto senza modello che non può entrare — nemmeno senza il blocco dei fatti — non si scrive, e
       git non parte */
    if (esito.ripiego && lineaCerta !== null) {
      const minima = compattazione.costruisciProiezione({ testa: parti.testa, richiesteLetterali: parti.richiesteLetterali, riassunto: esito.riassunto,
        indice: indice.testo, coda: parti.coda, bloccoFatti: '', recintaSintesi: false });
      if (oltreLaLineaCerta(minima)) return fermaOltreLaLineaCerta(minima, { rigaAperta: true });
    }
    /* ⭐ 06/10/2026 — RICARICA POST-COMPACT (opzione A, percorso desktop): il punto naturale è l'indice
     * meccanico già generato dal codice, esteso dalle letture disco (capitolato §6.4, vincolo 3). Il blocco
     * di fatti freschi si calcola ORA, al momento del compact: git locale dalla cartella della sessione,
     * LEDGER dichiarati dall'ospite (`input.fontiRicarica`), i file toccati dall'indice (puntatori), e il
     * record `talos.compattazione.v1` come fonte ContextVersionV1 (dossier §6.1 punto 5). Fail-soft: una
     * fonte che fallisce si DICHIARA nel blocco, la compattazione continua. FUSO nella STESSA proiezione:
     * un solo cache-break, mai un messaggio separato. */
    if (bloccoFatti === null) bloccoFatti = await (bloccoInArrivo ?? bloccoFattiPer(indice)); // avviato sopra per il confronto, o adesso (overflow, pezzi)
    /* N1, seconda forma: anche dove la stima non ha deciso (il rifiuto del fornitore, i pezzi) e col riassunto VERO — se è il blocco a far
       uscire la richiesta dalla finestra, si toglie: la persona perde un promemoria di git, non il giro */
    if (bloccoFatti !== '' && Number.isFinite(soglie.finestraToken) && soglie.finestraToken > 0) {
      const richiestaCon = (blocco) => compattazione.stimaConPezzi(compattazione.costruisciProiezione({ testa: parti.testa,
        richiesteLetterali: parti.richiesteLetterali, riassunto: esito.riassunto, indice: indice.testo, coda: parti.coda, bloccoFatti: blocco,
        recintaSintesi: blocco !== '' })) + Math.round(scartoPerNonEntra());
      if (richiestaCon(bloccoFatti) >= soglie.finestraToken && richiestaCon('') < soglie.finestraToken) bloccoFatti = '';
    }
    /*
     * ⭐ Pezzo C, dopo il riassunto, sul rifiuto del fornitore:
     *   - il blocco dei fatti è un aiuto: se è lui a portare la proiezione oltre il BERSAGLIO, si toglie (come N1 con la finestra, sopra);
     *   - un riassunto pagato che non ci arriva, quando quello senza modello sì, lascia il posto a lui: entrare conta più di ricordare
     *     meglio, e il riassunto pagato si è già contato (non se ne paga un altro in questo giro);
     *   - altrimenti si applica ciò che accorcia, e decide il fornitore: il bersaglio è prudente (la riserva d'uscita) e un ritentativo
     *     rifiutato non costa; gli scalini dopo sono al più due, senza riassunti nuovi. Uno cresciuto non si applica mai (`compattaOra`).
     */
    if (sulBersaglio) {
      const pesoCon = (riassunto, blocco) => compattazione.stimaConPezzi(compattazione.costruisciProiezione({ testa: parti.testa,
        richiesteLetterali: parti.richiesteLetterali, riassunto, indice: indice.testo, coda: parti.coda, bloccoFatti: blocco, recintaSintesi: blocco !== '' }));
      if (bloccoFatti !== '' && pesoCon(esito.riassunto, bloccoFatti) > bersaglio) bloccoFatti = '';
      if (!esito.ripiego && pesoCon(esito.riassunto, bloccoFatti) > bersaglio) {
        const ripiego = compattazione.riassuntoDiRipiego(parti.mezzo, { classe: 'bersaglio' });
        if (pesoCon(ripiego, bloccoFatti) <= bersaglio) esito = { ok: true, ripiego: true, classe: 'bersaglio', ragione: 'bersaglio', riassunto: ripiego };
      }
    }
    const proiezione = compattazione.costruisciProiezione({
      testa: parti.testa, richiesteLetterali: parti.richiesteLetterali, riassunto: esito.riassunto, indice: indice.testo, coda: parti.coda,
      bloccoFatti, recintaSintesi: bloccoFatti !== '',
    });
    const record = compattazione.creaRecord({
      coveredThrough: rawMessages.length,
      riassunto: proiezione,
      tokenPrima: tokenMisurati,
      /* N3 (revisione 8 della CLI): la stessa scala di `tokenPrima` — la richiesta che parte, attrezzi e sistema compresi. Prima «10,281 →
         2,131» a schermo, e la richiesta vera dopo era 9.469. */
      tokenDopo: kernel.stimaTokenConversazione(proiezione) + Math.round(scartoCorrente()),
      misura,
      at: new Date().toISOString(),
      modello,
      indice,
      coperti: storiaVera(rawMessages), // revisione 14: il tratto coperto VERO
      freno, // pezzo D: la copia nel record (contratto (d) con la CLI)
    });
    return { proiezione, record, soloCoda: false, ...misureDelPavimento, budget: budget.maxOutputTokens, ...(esito.ripiego ? { ripiego: true, classe: esito.classe, ragione: esito.ragione } : {}),
      ...(regolaK.accorciati > 0 ? { accorciati: regolaK.accorciati } : {}) };
  };

  /* Quarta passata avversaria (22/10/2026): con una base adottata il fallimento del resto non disegna una riga sua (R1) — ma il suo
     PERCHÉ non deve sparire: un modello dei riassunti guasto o senza credito pagherebbe a ogni emergenza senza che nessuno lo sappia.
     Si tiene qui e viaggia sulla riga della base (`restoNonRiuscito`): resta nel giornale della sessione, l'interfaccia non lo disegna. */
  let restoNonRiuscito = null;
  /** La riga «X → Y» di una compattazione applicata (separata da `applicaCompattazione` per la base adottata: vedi `compattaDovuta`). */
  /* 22/10/2026 (revisione 4 della CLI, S3-2): quando la riga del giro nasce da un record preparato altrove porta `adottato`:
     `{ at, origine, tokenDopo, conResto }` — l'`at` del record preparato; `origine` 'fine-giro' se era il riassunto di fine giro del
     registro (già annunciato da lui, `motivo:'background'`) o 'giro' se l'aveva preparato un giro (mai annunciato); `tokenDopo` il
     conto dopo quel record su questa richiesta; `conResto` se la riga copre anche il riassunto del resto. Chi disegna anche la riga
     di sottofondo non conta due volte la stessa compattazione, senza indovinare dai numeri né tenere un elenco suo. */
  const annunciaCompattazione = (preparata, { requestIndex, motivo, istantanea = false, resto = null, adottato = null, baseGratuita = false }) => {
    /* 22/10/2026 (CLI, revisione 4): il conto `compactions` del risultato conta le RIGHE, una per annuncio — prima contava ogni
       applicazione, e base più resto (una riga sola) contava 2; chi riconcilia le righe viste col conto ne aggiungeva una senza numeri.
       Tranne lo scambio del riassunto di FINE GIRO senza resto: l'ha già fatto e annunciato il registro come suo
       (`motivo:'background'`), contarlo anche qui è lo stesso doppio conteggio di S3-2 spostato nel numero (regola concordata con la
       CLI). Il desktop conta le compattazioni dagli eventi `talos.compattazione`, non da questo numero.
       ⛔ F1 della revisione 9 della CLI (23/10/2026): la «sola coda» non è una compattazione — niente riassunto, solo i passi gratuiti
       (esiti d'attrezzo accorciati, richieste vecchie accorciate dalla regola K, immagini vecchie in segnaposto). Contata qui, la CLI la
       chiamava «earlier messages summarized · 29.8k → 19.1k» con zero chiamate di riassunto. La riga resta (`soloCoda:true`) e dice
       quanto ha accorciato: `accorciati` (regola K), `ridotti` (esiti d'attrezzo), `immagini` (segnaposto).
       Una riga che copre una base adottata più il resto (`adottato.conResto`) è gratuita solo se lo sono tutte e due: una base col suo
       riassunto e un resto di sola coda sono una compattazione, e `soloCoda` sulla riga vuol dire «niente riassunto in questa riga». */
    const gratuita = preparata.soloCoda === true && (adottato?.conResto !== true || baseGratuita === true);
    if (!gratuita && !(adottato?.origine === 'fine-giro' && adottato.conResto !== true)) compactions += 1;
    emitOnGiro?.({ giro: requestIndex, tipo: 'compattazione-fine', compattato: true, record: preparata.record, ...(gratuita ? { soloCoda: true } : {}), ...(istantanea ? { istantanea: true, motivo } : {}),
      ...(preparata.accorciati > 0 ? { accorciati: preparata.accorciati } : {}),
      ...(preparata.soloCoda && preparata.ridotti > 0 ? { ridotti: preparata.ridotti } : {}),
      ...(preparata.soloCoda && preparata.immagini > 0 ? { immagini: preparata.immagini } : {}),
      ...(resto ? { restoNonRiuscito: resto } : {}), ...(adottato && typeof adottato === 'object' ? { adottato } : {}),
      ...(preparata.ripiego ? { ripiego: true, classe: preparata.classe, ...(preparata.ragione ? { ragione: preparata.ragione } : {}) } : {}) }); // L1: chi guarda sa che il riassunto è del codice
  };
  /** Applica un riassunto (appena fatto o preparato prima): da qui il giro manda la proiezione nuova. */
  const applicaCompattazione = (preparata, { requestIndex, motivo, istantanea = false, muto = false, adottato = null, baseGratuita = false }) => {
    const { record } = preparata;
    ultimaCodaAlMinimo = preparata.codaAlMinimo;
    ultimoPavimentoStimato = preparata.pavimento;
    if (preparata.budget) ultimoBudgetRiassunto = preparata.budget;
    if (!istantanea) progresso(requestIndex, { fase: 'sostituzione', tokenDopo: record.tokenDopo ?? null, motivo });
    compacted = record;
    /* il verdetto (`aggiornaAncora`) confronta il numero del fornitore con la SOLA stima dei messaggi: `tokenDopo` ora porta anche lo scarto
       (N3), quindi qui si rifà la stima della proiezione */
    ultimaProiezioneStimata = Array.isArray(record.riassunto) ? kernel.stimaTokenConversazione(record.riassunto) : (record.tokenDopo ?? 0);
    records.push(record);
    if (preparata.soloCoda === true || preparata.ripiego === true) recordGratuiti.add(record); // R13-1: gratuito, da confermare
    ancora = null;
    attendeVerdetto = true;
    /* pezzo D: il prossimo numero vero giudica anche per il freno — solo dopo un riassunto PAGATO (F1 della revisione 9 della CLI: la
       sola coda e il riassunto senza modello non sono riassunti pagati, e un loro verdetto oltre la soglia frenava i riassunti a torto) */
    if (!preparata.soloCoda && !preparata.ripiego) verdettoDelFreno = true;
    if (!muto) annunciaCompattazione(preparata, { requestIndex, motivo, istantanea, adottato, baseGratuita });
    return preparata.proiezione;
  };

  /** Una compattazione intera, adesso (emergenza, overflow): prepara e applica. `null` se non c'è niente o il riassuntore ha fallito. */
  const compattaOra = async (rawMessages, projected, opzioni) => {
    const preparata = await preparaCompattazione(rawMessages, projected, opzioni);
    if (!preparata) return null;
    /* ⛔ Revisione 3 della CLI sulla 0.6.13 (22/10/2026, S2-2 nel giro) — un riassunto che NON accorcia non si applica. Misura della
       CLI: emergenza dentro il giro 15.631 → 16.040 token, pagato e applicato (testa + richieste letterali + indice + blocco dei fatti
       più grandi del pezzo riassunto). Il registro lo rifiutava già (`inefficace`); qui no. Come lì: si dice con `inefficace`, si
       conta come tentativo fallito (così all'emergenza non si ripaga a ogni richiesta del giro) e la richiesta parte com'era. */
    /* Stima contro stima, come il registro: `tokenPrima` può essere ancorato al numero del fornitore, quindi non si usa.
       ⛔ Revisione avversaria di 068b2c172 (F1): la stima di sempre non vede immagini e pezzi (valgono 0), e un riassunto che toglieva
       dodici immagini «cresceva». Seconda passata (N1): un'esenzione per la sessione intera spegneva la guardia con UNA immagine.
       ⇒ Prima e dopo si pesano coi pezzi (`stimaConPezzi`, come Hermes).
       ⛔ Pezzo C (§4.1 del rapporto della CLI, «mai un riassunto cresciuto, nemmeno sul rifiuto»): prima sul contesto pieno (`overflow`)
       non si giudicava — un riassunto cresciuto si pagava, si applicava e il ritentativo veniva rifiutato di nuovo (15.636 → 16.045,
       `review613-5/paste-overflow.out`). Ora vale su ogni strada; sul rifiuto col bersaglio la preparazione ripiega già da sé. */
    if (compattazione.stimaConPezzi(preparata.proiezione) >= compattazione.stimaConPezzi(projected)) {
      tentativiFallitiNelTurno += 1;
      if (opzioni.conBase) restoNonRiuscito = { motivo: 'inefficace', interrottaIn: 'sostituzione' };
      else emitOnGiro?.({ giro: opzioni.requestIndex, tipo: 'compattazione-fine', compattato: false, motivo: 'inefficace', interrottaIn: 'sostituzione' });
      /* Pezzo D: un riassunto rifiutato perché ALLUNGAVA è un colpo (Hermes `record_rejected_compaction`), detto dopo l'«inefficace».
         La sola coda e il riassunto senza modello non sono riassunti pagati. */
      if (!preparata.soloCoda && !preparata.ripiego) aggiornaFreno(compattazione.colpoAlFreno(freno, { mezzo: compattazione.mezzoDellaProiezione(projected), ...identitaDelFreno() }), opzioni.requestIndex);
      if (!preparata.soloCoda && !preparata.ripiego && Number.isFinite(opzioni.tokenMisurati)) {
        riassuntoInefficaceDelGiro = { token: opzioni.tokenMisurati, base: compattazione.chiaveBaseDelRecord(compacted ?? null) };
      }
      return null;
    }
    return applicaCompattazione(preparata, opzioni);
  };
  /** 22/10/2026 (revisione avversaria, B): il riassunto in volo si aspetta al massimo fino a Stop, «Salta» o `riassuntoTettoMs`.
      Torna 'arrivato' · 'stop' · 'saltato' · 'tempo'. La promessa in volo non si annulla: arrivata più tardi, vale per il giro dopo. */
  const attendiInVoloConTetto = (promessa) => new Promise((risolvi) => {
    const salta = segnaleSalta();
    let finita = false;
    let tetto = null;
    const chiudi = (come) => {
      if (finita) return;
      finita = true;
      clearTimeout(tetto);
      segnaleStop?.removeEventListener?.('abort', suStop);
      salta?.removeEventListener?.('abort', suSalta);
      risolvi(come);
    };
    const suStop = () => chiudi('stop');
    const suSalta = () => chiudi('saltato');
    if (segnaleStop?.aborted) return chiudi('stop');
    if (salta?.aborted) return chiudi('saltato');
    segnaleStop?.addEventListener?.('abort', suStop, { once: true });
    salta?.addEventListener?.('abort', suSalta, { once: true });
    tetto = setTimeout(() => chiudi('tempo'), riassuntoTettoMs);
    Promise.resolve(promessa).then(() => chiudi('arrivato'), () => chiudi('arrivato'));
  });

  /** Il riassunto in volo (preparato qui o EREDITATO dal giro prima, `compattazioneInArrivo`) si aspetta con la riga viva aperta.
      Torna `{ fermato }` (Stop: la riga si chiude) · `{ proiezione }` (arrivato e valido: applicato) · `{}` (arrivato ma non vale, o
      saltato, o scaduto: chi chiama compatta da sé, senza modello se saltato o scaduto). */
  const aspettaInVolo = async (rawMessages, { token, misura, requestIndex, motivo, soglia }) => {
    /*
     * ⛔ 22/10/2026 (revisione avversaria, B): l'attesa non aveva tetto, né «Salta», né riga viva — e il riassunto in volo può essere
     *   quello EREDITATO dal giro prima (`compattazioneInArrivo`), col segnale di Stop di QUEL giro: lo Stop di questo non lo fermava.
     *   Misurato: con Stop e con «Salta» il giro era ancora appeso dopo 4 s, senza un evento. Owner 12/10: la compattazione non ferma
     *   mai la chat. ⇒ La riga viva si apre PRIMA di aspettare (così «Salta» arriva al registro, `riassuntoAtteso`), e l'attesa finisce
     *   al primo fra: riassunto arrivato · Stop · «Salta» · `riassuntoTettoMs`. Saltato o scaduto ⇒ riassunto senza modello subito,
     *   come quando scade il riassunto del giro stesso (`senzaModelloPerRichiesta`): il modello lento non si richiama.
     */
    emitOnGiro?.({ giro: requestIndex, tipo: 'compattazione-inizio', tokenMisurati: token, soglia, motivo });
    const comeFinita = await attendiInVoloConTetto(inVolo.promessa);
    /* IST-REV-03 (bugfixer): uno Stop arrivato mentre si aspettava non apre una compattazione nuova; la riga aperta qui si chiude */
    if (segnaleStop?.aborted) {
      emitOnGiro?.({ giro: requestIndex, tipo: 'compattazione-fine', compattato: false, motivo: 'interrotta', interrottaIn: 'riassunto' });
      return { fermato: true };
    }
    if (comeFinita === 'arrivato') {
      const arrivato = scambioPossibile(rawMessages, { token, misura });
      if (arrivato) return { proiezione: usaPronta(arrivato, { requestIndex, motivo }) };
    } else senzaModelloPerRichiesta = { requestIndex, ragione: comeFinita };
    return {};
  };

  /**
   * La compattazione che il giro deve fare adesso (owner 22/10/2026 sera, «one-up su tutti»):
   * 1. il riassunto in volo si aspetta SOLO se vale ancora per questa storia (`inVoloVale`, come Codex), con Stop, «Salta» e tetto, e
   *    uno Stop lo lascia per dopo (come Claude Code: «turn aborted while awaiting — leaving entry»);
   * 2. arrivato valido ma non sufficiente ⇒ diventa la base (`scambioPossibile` con `comeBase`), e si riassume solo il resto;
   * 3. altrimenti come prima.
   */
  const compattaDovuta = async (...argomenti) => {
    const mie = frasiDelFrenoInAttesa === null;
    if (mie) frasiDelFrenoInAttesa = [];
    try { return await compattaDovutaAdesso(...argomenti); }
    finally {
      if (mie) {
        const frasi = frasiDelFrenoInAttesa;
        frasiDelFrenoInAttesa = null;
        for (const riga of frasi) emitOnGiro?.(riga);
      }
    }
  };
  const compattaDovutaAdesso = async (rawMessages, projected, { token, misura, requestIndex, motivo, soglia, bersaglio = null, livelloContestoPieno = 0, certo = null }) => {
    let inizioDetto = false;
    if (inVolo && inVoloVale(rawMessages)) {
      const atteso = await aspettaInVolo(rawMessages, { token, misura, requestIndex, motivo, soglia });
      if (atteso.fermato) return projected;
      if (atteso.proiezione) return atteso.proiezione;
      inizioDetto = true;
    }
    let daCompattare = projected;
    const base = pronta ? scambioPossibile(rawMessages, { token, misura, comeBase: true, attuale: projected }) : null;
    /* Seconda passata (N3): UNA riga per richiesta. La base si applica in silenzio e la riga della compattazione sul resto va dal
       numero di PARTENZA a quello finale («6.649 → 3.475», non due righe «6.649 → 4.012» e «4.012 → 3.475» con la prima non
       annullabile). Se la compattazione sul resto non arriva, si annuncia la base da sola. */
    if (base) daCompattare = usaPronta(base, { requestIndex, motivo, muto: true });
    /*
     * ⛔ N6 (revisione 9 della CLI, 23/10/2026): la base adottata BASTA già per la linea che ha fatto scattare questa compattazione
     *   (`soglia` qui è quella del motivo: la linea d'emergenza all'emergenza, la soglia sul rifiuto del fornitore) ⇒ un secondo riassunto
     *   sullo stesso punto non si paga. Con N3 lo scambio si misura scarto compreso: il riassunto di fine giro arrivato restava sopra la
     *   SOGLIA e diventava base, e il giro ne pagava subito un altro sul resto — misurato dalla CLI a 12.288 con ~7.300 token di schemi:
     *   17 riassunti in 20 giri contro 9, uno ogni due buttato (10.218 della base, 9.466 dopo il secondo, ancora sopra la soglia di 9.216).
     *   Sopra la soglia e sotto l'emergenza la richiesta parte, come sempre fra le due linee: la prossima preparazione in sottofondo, o
     *   il prossimo riassunto di fine giro, ne terrà conto.
     */
    /* Pezzo C: sul rifiuto del fornitore la base basta se arriva al BERSAGLIO (stima coi pezzi della sola proiezione) */
    const bastaLaBase = Number.isFinite(bersaglio)
      ? compattazione.stimaConPezzi(daCompattare) <= bersaglio
      : kernel.stimaTokenConversazione(daCompattare) + Math.round(scartoCorrente()) < soglia;
    if (base && bastaLaBase) {
      annunciaCompattazione(base, { requestIndex, motivo, istantanea: true, adottato: segnoAdottato(base, false) });
      return daCompattare;
    }
    restoNonRiuscito = null;
    let proiezione;
    try {
      proiezione = await compattaOra(rawMessages, daCompattare, {
        requestIndex, motivo, tokenMisurati: token, misura, soglia, inizioDetto, conBase: Boolean(base), adottato: segnoAdottato(base, true),
        baseGratuita: base?.soloCoda === true, // F1: la riga di base più resto è gratuita solo se lo è anche la base
        ...(Number.isFinite(bersaglio) ? { bersaglio, livelloContestoPieno, certo } : {}),
      });
    } catch (errore) {
      /* Quarta passata avversaria (F1): uno Stop durante il riassunto del resto risale come eccezione — la base è già applicata, e senza
         questo la riga aperta restava senza «fine» e il record della base senza riga (niente Annulla). */
      if (base) annunciaCompattazione(base, { requestIndex, motivo, istantanea: true, resto: restoNonRiuscito ?? { motivo: 'errore' }, adottato: segnoAdottato(base, false) });
      throw errore;
    }
    /* Il resto non è arrivato: la riga della richiesta è la base, col perché del resto (il conteggio dei tentativi falliti resta: il
       riassunto del resto è stato pagato e non ha servito, e senza il conteggio il giro lo ripagherebbe a ogni richiesta). */
    if (base && !proiezione) annunciaCompattazione(base, { requestIndex, motivo, istantanea: true, resto: restoNonRiuscito, adottato: segnoAdottato(base, false) });
    return proiezione ?? daCompattare;
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
  const { improntaDelPrefisso } = compattazione;
  const chiaveBase = () => compattazione.chiaveBaseDelRecord(compacted);
  let pronta = compattazionePronta && compattazione.eRecordValido(compattazionePronta.record) && typeof compattazionePronta.impronta === 'string'
    ? { ...compattazionePronta, proiezione: compattazionePronta.record.riassunto, soloCoda: compattazionePronta.soloCoda === true } : null;
  let inVolo = null;
  /*
   * ⭐⭐ Owner 22/10/2026 sera, «one-up su tutti», dopo la ricerca nel codice dei concorrenti
   *   (`Downloads/handoff-talos-2026-09-27/RICERCA-RIASSUNTO-IN-ARRIVO-NEL-GIRO-2026-10-22.md`):
   *   - Codex, prima di aspettare il riassunto in volo, controlla che valga ancora (`async_compaction.rs:157-179`: versione della
   *     storia, modello, impronta della compattazione, generazione dell'accesso) e se non vale non aspetta;
   *   - qui la FIRMA (tratto coperto, impronta del prefisso, base del record) è nota alla partenza: dal registro per quello ereditato
   *     (`perIlGiro.firma`), da `avviaPreparazione` per quello del giro. Senza firma (un chiamante di prima) vale come prima.
   */
  const firmaDelInVolo = (f) => (f && Number.isInteger(f.coveredThrough) && f.coveredThrough >= 0 && typeof f.impronta === 'string' && 'base' in f
    ? { coveredThrough: f.coveredThrough, impronta: f.impronta, base: f.base } : null);
  const inVoloVale = (rawMessages) => {
    const f = inVolo?.firma;
    if (!f) return true;
    return f.base === chiaveBase() && rawMessages.length >= f.coveredThrough && improntaDelPrefisso(storiaVera(rawMessages), f.coveredThrough) === f.impronta;
  };
  if (!pronta && compattazioneInArrivo && typeof compattazioneInArrivo.then === 'function') {
    const promessa = Promise.resolve(compattazioneInArrivo)
      .then((arrivata) => {
        if (pronta || !arrivata || !compattazione.eRecordValido(arrivata.record) || typeof arrivata.impronta !== 'string') return null;
        pronta = { ...arrivata, proiezione: arrivata.record.riassunto, soloCoda: arrivata.soloCoda === true };
        return pronta;
      })
      .catch(() => null)
      .finally(() => { if (inVolo?.promessa === promessa) inVolo = null; });
    inVolo = { promessa, firma: firmaDelInVolo(compattazioneInArrivo.firma) };
  }
  let preparate = 0;
  /* 22/10/2026 (sesta passata avversaria, R1): una preparazione in sottofondo si CONTA e il suo «inizio» va nel giornale solo
     quando produce davvero qualcosa — sola coda o riassunto. Prima si contava e si annunciava alla partenza: il controllo «non può
     ridurre» la chiude subito senza «pronta», e il giornale teneva un «inizio» per richiesta senza fine, e `preparate` contava
     riassunti mai pagati (misurato: 3 contro 1). Il banco legge `preparate` contro `usate`. Chiamata da `preparaCompattazione`. */
  const iniziaPreparata = (requestIndex, tokenMisurati) => {
    preparate += 1;
    emitOnGiro?.({ giro: requestIndex, tipo: 'compattazione-preparata', fase: 'inizio', motivo: 'precalcolo', tokenMisurati });
  };
  let usate = 0;
  /* 16/10/2026 — il PERCHÉ un riassunto pronto non vale, per il giornale: il giro vero col tetto a 60.000 ha pagato due riassunti e
     non ne ha usato nessuno, e niente diceva perché. `null` = vale. */
  const perchéNonVale = (rawMessages) => {
    if (!pronta) return 'none';
    if (pronta.base !== chiaveBase()) return 'base-changed';
    if (rawMessages.length < pronta.record.coveredThrough) return 'history-shorter';
    if (improntaDelPrefisso(storiaVera(rawMessages), pronta.record.coveredThrough) !== pronta.impronta) return 'prefix-changed';
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
  const scambioPossibile = (rawMessages, { token, misura, comeBase = false, attuale = null }) => {
    if (!prontaValida(rawMessages)) return null;
    const coda = rawMessages.slice(pronta.record.coveredThrough);
    const ridotta = coda.length ? compattazione.riduciCodaSottoPressione(coda, { budgetToken: compattazione.budgetCoda(soglie.soglia) }).coda : [];
    const proiezione = [...pronta.record.riassunto, ...ridotta];
    const tokenDopo = kernel.stimaTokenConversazione(proiezione) + Math.round(scartoCorrente()); // N3: confrontato con la soglia come ogni misura
    if (tokenDopo >= soglie.soglia) {
      pronta.sopraSoglia = tokenDopo;
      /* ⭐ One-up (owner 22/10/2026 sera): un riassunto PAGATO, valido per il suo tratto ma che da solo non riporta sotto la soglia,
         Codex e Claude Code lo buttano e ne pagano uno da capo. Qui, quando una compattazione si fa comunque (`comeBase`), diventa la
         BASE: si applica e si riassume solo ciò che è venuto dopo — ingresso più piccolo, quindi più veloce e meno caro. Solo se
         accorcia davvero ciò che il giro manderebbe adesso (stima coi pezzi, `stimaConPezzi`). */
      if (!comeBase || !Array.isArray(attuale)) return null;
      if (compattazione.stimaConPezzi(proiezione) >= compattazione.stimaConPezzi(attuale)) return null;
    }
    const record = compattazione.creaRecord({
      coveredThrough: rawMessages.length, riassunto: proiezione, tokenPrima: token, tokenDopo, misura,
      at: new Date().toISOString(), modello, indice: pronta.record.indice ?? null, coperti: storiaVera(rawMessages), freno,
    });
    /* S3-2: il record dello scambio è nuovo (copre la storia di adesso, con un `at` suo) — `adottatoDa` tiene l'`at` di quello
       preparato e da dove viene (il registro marca il suo `origine: 'fine-giro'`; senza marca l'ha preparato un giro) */
    return { ...pronta, record, proiezione, adottatoDa: { at: pronta.record.at ?? null, origine: pronta.origine === 'fine-giro' ? 'fine-giro' : 'giro' } };
  };
  /** Il segno `adottato` della riga (S3-2): da dove viene il record preparato, e il conto dopo di lui su questa richiesta. */
  const segnoAdottato = (scambio, conResto) => (scambio?.adottatoDa?.at
    ? { ...scambio.adottatoDa, tokenDopo: scambio.record?.tokenDopo ?? null, conResto } : null);
  const usaPronta = (scambio, { requestIndex, motivo, muto = false }) => {
    pronta = null;
    usate += 1;
    return applicaCompattazione(scambio, { requestIndex, motivo, istantanea: true, muto, adottato: segnoAdottato(scambio, false) });
  };
  const avviaPreparazione = (rawMessages, projected, { requestIndex, tokenMisurati, misura }) => {
    if (inVolo || segnaleStop?.aborted) return;
    /* un riassunto pronto che riporterebbe sotto l'80% della soglia basta; uno più vecchio si rinnova */
    const scambio = scambioPossibile(rawMessages, { token: tokenMisurati, misura });
    if (scambio && scambio.record.tokenDopo < soglie.warningTokens) return;
    const copia = rawMessages.slice();
    const base = chiaveBase();
    const impronta = improntaDelPrefisso(storiaVera(copia), copia.length); // revisione 14: sulla storia VERA, come il registro
    const promessa = preparaCompattazione(copia, projected.slice(), { requestIndex, motivo: 'precalcolo', tokenMisurati, misura, soglia: soglie.soglia, inSottofondo: true })
      .then((preparata) => {
        if (!preparata || base !== chiaveBase()) return null;
        pronta = { ...preparata, impronta, base };
        emitOnGiro?.({ giro: requestIndex, tipo: 'compattazione-preparata', fase: 'pronta', tokenPrima: preparata.record.tokenPrima ?? null, tokenDopo: preparata.record.tokenDopo ?? null,
          at: preparata.record.at ?? null }); // S3-2: l'`at` che la riga del giro porterà come `adottato` se lo usa
        return pronta;
      })
      .catch(() => null)
      .finally(() => { if (inVolo?.promessa === promessa) inVolo = null; });
    inVolo = { promessa, firma: { coveredThrough: copia.length, impronta, base } };
  };

  const maybeCompactLegacy = async (rawMessages, requestIndex) => {
    const projected = projectLegacy(rawMessages);
    const { token, misura } = compattazione.misuraOccupazione({ ancora, messaggi: projected, finestraToken: soglie.finestraToken, scarto: scartoDellaStima ?? 0 });
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
      /* 22/10/2026 (CLI, S3-B): il riassunto di fine giro del registro ancora in volo quando il giro parte (`compattazioneInArrivo`):
         arrivato e valido ⇒ si usa subito. */
      const arrivato = pronta ? scambioPossibile(rawMessages, { token, misura }) : null;
      if (arrivato) return usaPronta(arrivato, { requestIndex, motivo: decisione.motivo });
      const sogliaDelMotivo = decisione.motivo === 'emergenza' ? soglie.emergenza : soglie.soglia;
      /* ⛔ Revisione 3 della CLI sulla 0.6.13 (22/10/2026, b): con un riassunto ancora in volo il giro ne pagava un SECONDO (net-audit
         della CLI, due in volo insieme al giro 5, tutti e due pagati e applicati). Owner 22/10 sera, «one-up su tutti»:
         - sotto l'emergenza NON si aspetta e NON si paga: la richiesta parte com'è e il riassunto in volo vale per la prima richiesta
           dopo il suo arrivo (Codex `take_ready`, Hermes «sit out» `conversation_compression.py:2740-2771`) — e nella CLI 0.6.13, senza
           «Salta» né riga viva, un'attesa qui sarebbe uno schermo fermo;
         - all'emergenza `compattaDovuta`: si aspetta solo se vale ancora, poi base o compattazione come prima. */
      if (decisione.motivo !== 'emergenza' && inVolo && inVoloVale(rawMessages)) return projected;
      return compattaDovuta(rawMessages, projected, { token, misura, requestIndex, motivo: decisione.motivo, soglia: sogliaDelMotivo });
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
    /* emergenza: `compattaDovuta` — il riassunto in preparazione si aspetta solo se vale ancora; valido ma non sufficiente diventa la
       base; altrimenti si fa come prima */
    const sogliaDelMotivo = decisione.motivo === 'emergenza' ? soglie.emergenza : soglie.soglia;
    return compattaDovuta(rawMessages, projected, { token, misura, requestIndex, motivo: decisione.motivo, soglia: sogliaDelMotivo });
  };

  /** Il numero vero del fornitore diventa l'ancora della prossima misura; e giudica l'ultima compattazione. */
  const aggiornaAncora = (usage) => {
    const promptTokens = Number(usage?.prompt_tokens);
    if (!Number.isFinite(promptTokens) || promptTokens <= 0 || !richiestaCorrente) return;
    ancora = { promptTokens, lunghezza: richiestaCorrente.lunghezzaProiezione, stima: kernel.stimaTokenConversazione(richiestaCorrente.array) };
    /* Revisione 7 della CLI (F1): lo stesso controllo di plausibilità dell'ancora, e il tetto (`scartoDaMisura`); un numero impossibile
       non cambia lo scarto */
    const scarto = compattazione.scartoDaMisura(promptTokens, ancora.stima, { finestraToken: soglie.finestraToken, soglia: soglie.soglia,
      attrezzi: stimaAttrezziDelGiro ?? 0 }); // N1 (revisione 8): il tetto mai sotto gli attrezzi del giro
    if (scarto !== null) ultimoScarto = scarto;
    const intero = compattazione.scartoPlausibile(promptTokens, ancora.stima, { finestraToken: soglie.finestraToken, soglia: soglie.soglia });
    if (intero !== null) ultimoScartoIntero = intero;
    /* Pezzo E: k sulla stima della richiesta intera — messaggi coi pezzi (le immagini contano, come nel guadagno) più gli schemi degli
       attrezzi del giro, che il fornitore conta e la stima dei messaggi no. Un numero impossibile (la stessa plausibilità dello scarto)
       non è una misura. */
    if (intero !== null) {
      const k = compattazione.fattoreK(promptTokens, compattazione.stimaConPezzi(richiestaCorrente.array) + (stimaAttrezziDelGiro ?? 0));
      if (k !== null) kDellaSessione = k;
    }
    /* Pezzo D: ogni lettura vera sotto la soglia azzera i colpi; il primo numero vero dopo una compattazione applicata ancora oltre la
       soglia è un colpo (Hermes `_apply_real_prompt_verdict`). Il mezzo del verdetto è quello della proiezione mandata. */
    if (promptTokens < soglie.soglia) freno = compattazione.letturaSottoLaSoglia(freno);
    if (verdettoDelFreno) {
      verdettoDelFreno = false;
      /* il mezzo al verdetto è il riferimento del riarmo per crescita, anche quando il verdetto è buono */
      const mezzo = compattazione.mezzoDellaProiezione(projectLegacy(richiestaCorrente.grezzi));
      if (promptTokens >= soglie.soglia) aggiornaFreno(compattazione.colpoAlFreno(freno, { mezzo, ...identitaDelFreno() }), richiestaCorrente.requestIndex);
      else if (freno) freno = { ...freno, mezzoAlVerdetto: mezzo };
    }
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

  /*
   * §4.2, REGOLA N (owner 22/10/2026; modulo `richiesta-troppo-grande.mjs`): prima di QUALUNQUE lavoro pagato della richiesta — riassunto
   *   compreso — si guarda se sistema, attrezzi e richiesta nuova insieme superano la linea d'emergenza. Se sì il giro si ferma con
   *   `REQUEST_TOO_LARGE` e la storia del giro senza la richiesta; se la persona ha scelto «Invia come allegato», la richiesta parte come
   *   inizio + fine con il testo intero nel file della sessione (`cartellaIncollati`), e resta così per TUTTE le richieste del giro
   *   (`allegate`, per testo: l'array del kernel ha sempre il testo intero, la storia grezza non si tocca).
   */
  const allegate = new Map();
  const vuoleAllegato = (testo) => {
    if (allegaSeTroppoGrande === true) return true;
    if (typeof allegaSeTroppoGrande !== 'function') return false;
    try { return allegaSeTroppoGrande(testo) === true; } catch { return false; }
  };
  /* Pezzo C: sul rifiuto del fornitore la stessa regola con la linea del BERSAGLIO (`linea`), la finestra che il fornitore ha detto
     (`finestraDelRifiuto`, se l'ha detta) e `fonte: 'fornitore'` (contratto (a) con la CLI). Senza opzioni, la regola di sempre.
     ⛔ F2a della revisione 9 della CLI (23/10/2026): prima del rifiuto la linea è la FINESTRA dichiarata, non l'emergenza (0,90). Fra le
     due la richiesta può entrare: 8.982 caratteri a 10.240 partivano e avevano risposta (9.552 token), 9.012 venivano fermati come
     «oltre la finestra» con 9.555 < 10.240 — una frase falsa su una richiesta che entrava. Solo l'oltre-finestra è CERTO (la stessa
     lettura di N7); in mezzo decide il fornitore, e un suo rifiuto passa dalla strada del contesto pieno (pezzo C), che ha i numeri. */
  /* R13-1 (revisione 13 della CLI, 23/10/2026): tre opzioni nuove, solo per il rifiuto coi numeri del fornitore.
     - `corniceInPiu`: la parte della cornice che il fornitore conta oltre la stima ed è CERTA (`scartoFissoCerto` meno gli attrezzi): la
       linea la toglieva già, ma la frase diceva la cornice senza di lei — «11.005 + 7.421 non entra in 24.000», una somma che entra;
     - `riserva`: lo spazio per la risposta, che è ciò che porta oltre la finestra (R11-8); si dice;
     - `forza` + `spazio`: il fornitore ha rifiutato una richiesta che non si può accorciare più, e senza la richiesta nuova il resto
       entra — è LEI a non entrare, coi numeri suoi; `spazio` è quanto resta per lei (nella scala della stima). */
  const regolaN = async (grezzi, effimeri, attrezzi, requestIndex, { linea = null, fonte = 'stima', finestraDelRifiuto = null, scala = 1,
    corniceInPiu = 0, riserva = 0, forza = false, spazio = null } = {}) => {
    const lista = allegate.size === 0 ? grezzi : grezzi.map((m) => {
      const testo = compattazione.eRichiestaVera(m) ? testoSemplice(m) : null;
      return testo !== null && allegate.has(testo) ? allegate.get(testo) : m;
    });
    const finestra = finestraDelRifiuto ?? soglie.finestraToken;
    if (!(Number.isFinite(finestra) && finestra > 0)) return lista;
    linea ??= finestra;
    /* R11-2 (revisione 11 della CLI): sul rifiuto del fornitore (`fonte:'fornitore'`) i numeri si dicono nella SUA scala — la proporzione
       fra il suo conto e la nostra stima della richiesta rifiutata, come il pavimento di Z-K3. Prima la frase diceva «come ha contato il
       fornitore» con la nostra stima: 30.005 dove il fornitore ne contava circa 37.500. */
    const nellaSuaScala = (n) => (scala > 0 && scala !== 1 ? Math.ceil(n * scala) : n);
    const peso = pesoDellaRichiestaNuova(lista, { attrezzi, effimeri });
    if (!peso || (!forza && peso.tokensCornice + peso.tokensRichiesta < linea)) return lista;
    /*
     * ⛔ S4-1 (revisione 9 della CLI, 23/10/2026): «troppo grande» si dice solo di un messaggio che è LUI a non far entrare. Due casi che
     *   non lo sono, misurati dalla CLI: «hello» (2 token) su una finestra da 4.096 con ~7.255 token di attrezzi, e «Q» (3 token) su 8.192
     *   con ~8.044 — fermati come «troppo grandi» con «Invia come allegato», che non poteva servire.
     *   (1) La cornice da sola (sistema, attrezzi, effimeri) è già oltre la linea d'emergenza: è la FINESTRA. Lo dice «non entra», una
     *       volta per finestra come F6, e la richiesta va al fornitore, che decide (8.047 su 8.192 può passare).
     *   (2) Un testo corto (non allegabile): con lui o senza la cornice resta al limite, e l'allegato non aiuta — decide la strada di
     *       sempre (compattazione, F6, fornitore).
     *   Restano di questa regola i testi lunghi (l'allegato aiuta) e le immagini (`allegabile:false`, onesto).
     */
    if (!forza && peso.tokensCornice >= linea) {
      if (nonEntraGiaDetto !== finestra) {
        nonEntraGiaDetto = finestra;
        emitOnGiro?.({ giro: requestIndex, tipo: 'compattazione-fine', compattato: false, motivo: 'non-entra', finestra, pavimento: nellaSuaScala(peso.tokensCornice + peso.tokensRichiesta) });
      }
      return lista;
    }
    if (testoAllegabile(lista[peso.indice]) === null && testoSemplice(lista[peso.indice]) !== null) return lista;
    const testo = testoAllegabile(lista[peso.indice]);
    const corniceDetta = peso.tokensCornice + Math.max(0, Number.isFinite(corniceInPiu) ? corniceInPiu : 0);
    const rifiuta = (allegabile) => {
      throw new RichiestaTroppoGrande({ ...peso, tokensRichiesta: nellaSuaScala(peso.tokensRichiesta), tokensCornice: nellaSuaScala(corniceDetta),
        finestra, fonte, allegabile, messaggiDelGiro: grezzi.filter((_, i) => i !== peso.indice),
        ...(Number.isFinite(riserva) && riserva > 0 ? { riserva: Math.round(riserva) } : {}) });
    };
    if (testo === null) rifiuta(false);
    /* ⛔ F2b della revisione 9 della CLI (23/10/2026): «allegabile» si decide sulla forma allegata VERA, prima della prima risposta. Prima
       il primo rifiuto diceva `allegabile:true` e solo il secondo, col file già scritto, scopriva che inizio + fine + nota + cornice non
       entravano (8.192: cornice 7.302, pulsante offerto e poi fallito) — e ogni tentativo lasciava un file orfano in `incollati`. Il
       percorso del file è l'impronta del testo (`nomeDellaRichiestaSalvata`): la forma allegata si conosce senza scriverlo. Senza una
       cartella per il file l'allegato non può partire mai. Il file si scrive solo quando la forma allegata entra. */
    if (typeof cartellaIncollati !== 'string' || cartellaIncollati === '') rifiuta(false);
    const allegata = { ...lista[peso.indice], content: richiestaAllegataPerIlModello(testo, join(cartellaIncollati, nomeDellaRichiestaSalvata(testo))) };
    /* anche come allegato non entra (la cornice da sola è troppo grande): allegare non servirebbe. R13-1: forzata dal fornitore, si
       misura contro lo spazio che i suoi numeri lasciano alla richiesta */
    if (Number.isFinite(spazio) ? compattazione.stimaConPezzi([allegata]) > spazio : peso.tokensCornice + compattazione.stimaConPezzi([allegata]) >= linea) rifiuta(false);
    if (!vuoleAllegato(testo)) rifiuta(true);
    const percorso = await salvaRichiestaIntera(cartellaIncollati, testo);
    /* senza il file il mezzo non si potrebbe leggere: non si manda niente, e la persona ha ancora il testo nella casella */
    if (!percorso) rifiuta(true);
    allegate.set(testo, allegata);
    return lista.map((m, i) => (i === peso.indice ? allegata : m));
  };
  /*
   * ⛔ R13-3 (revisione 13 della CLI, 23/10/2026, S2): UNA RICHIESTA VECCHIA DI CUI LA SESSIONE HA GIÀ LA COPIA INTERA RESTA CORTA.
   *   La forma ad allegato valeva solo per il suo giro (`allegate` è del giro): al giro dopo la storia grezza riportava il testo intero
   *   — col motore del contesto un incollato da 600.000 caratteri mandato come allegato veniva poi riassunto INTERO a ogni giro (~152.700
   *   token al modello leggero, SUMMARY#2–#5 di `ceatt3`), o rimandato e rifiutato (`ceatt`). Senza motore lo salvava la regola K, solo
   *   oltre il suo budget.
   *   ⇒ Se nella cartella degli incollati della sessione c'è la copia intera di una richiesta vecchia della persona (l'ha scritta
   *   l'allegato, o la regola K quando l'ha accorciata: lo stesso nome, l'impronta del testo), il modello e il motore la vedono nella
   *   forma corta, inizio + fine + percorso, da quel momento in poi. La storia grezza resta com'è (l'archivio la tiene intera). Una
   *   richiesta grande una volta non torna intera dopo: tenerla ferma è anche ciò che lascia valida la cache del prompt del fornitore.
   *   Mai la richiesta del giro (`indiceRichiestaNuova`: la regola N è sua).
   */
  const copieGiaSalvate = (lista) => {
    if (typeof cartellaIncollati !== 'string' || cartellaIncollati === '' || !Array.isArray(lista)) return lista;
    const nuova = indiceRichiestaNuova(lista);
    let cambiata = false;
    const fuori = lista.map((m, i) => {
      if (i === nuova || !compattazione.eRichiestaVera(m)) return m;
      const testo = testoAllegabile(m);
      if (testo === null) return m;
      const percorso = join(cartellaIncollati, nomeDellaRichiestaSalvata(testo));
      if (!existsSync(percorso)) return m;
      cambiata = true;
      const corta = { ...m, content: richiestaAllegataPerIlModello(testo, percorso) };
      originaleDellaCopia.set(corta, m); // revisione 14: le impronte si calcolano sull'originale (`storiaVera`)
      return corta;
    });
    return cambiata ? fuori : lista;
  };
  /*
   * ⛔ R13-2, seconda parte (owner 23/10/2026 via la CLI, «sì, nella 0.6.13»): una richiesta mandata, rifiutata e solo DOPO giudicata
   *   troppo grande è già nell'archivio del motore (`prepare` l'ha presa prima dell'invio, e gli originali non si cancellano). Lì il
   *   registro la TIENE nella storia, così l'archivio combacia; qui, in ogni proiezione dopo, al suo posto va una nota di TALOS: il
   *   modello la legge e il motore riassume solo lei, mai il testo. Una richiesta rimandata come allegato è un messaggio nuovo, dopo.
   */
  const NOTA_RICHIESTA_NON_INVIATA = '[TALOS] A message the person wrote here was not sent: it was too large for this model\'s window. Its text is not part of this conversation.';
  const noteDelleNonInviate = (lista) => {
    if (!Array.isArray(lista) || richiesteNonInviate.length === 0) return lista;
    let cambiata = false;
    const fuori = lista.map((m, i) => {
      if (!richiesteNonInviate.includes(i) || !compattazione.eRichiestaVera(m)) return m;
      cambiata = true;
      return { role: 'user', content: NOTA_RICHIESTA_NON_INVIATA };
    });
    return cambiata ? fuori : lista;
  };
  /* R13-2: il motore ha preso nel suo archivio la richiesta di questo giro (una `prepare` riuscita la sincronizza), e la lista GREZZA
     che ha archiviato: se la richiesta poi non parte, è lei la storia del giro (allineata all'archivio, con ciò che il giro accoda dopo
     la richiesta), non quella d'inizio giro */
  let richiestaNelMotore = false;
  let originaliNelMotore = null;
  /* ⛔ R13-2 (revisione 13 della CLI, S2): la richiesta nuova non entra nell'archivio del motore prima che il fornitore abbia risposto
     una volta in questo giro. L'archivio è a sola aggiunta (gli originali sono immutabili per costruzione, `originals_no_delete`): una
     richiesta che la regola N ferma prima dell'invio, archiviata da `capture('start')`, al giro dopo non combaciava più con la storia
     (che non la porta), e il motore metteva da parte l'archivio e ripagava tre riassunti (39.550 + 13.231 + 2.383 token, `ce-div`). La
     archivia `prepare`, che la regola N ha già lasciato passare. Si archivia la storia di PRIMA del giro: fino alla richiesta esclusa —
     dopo di lei possono venire solo i `system` e le note che il giro accoda (`indiceRichiestaNuova` li salta), e il registro, quando
     la richiesta non parte, tiene proprio la storia di prima senza di lei. Togliere solo lei spostava le posizioni di chi la segue.
     «Prima che il fornitore abbia risposto» non ha bisogno di un segno: dopo la prima risposta dietro la richiesta c'è il messaggio
     dell'assistente, e `indiceRichiestaNuova` non la trova più (un mutante che toglieva quel segno sopravviveva: era ridondante). */
  const senzaRichiestaNonAccettata = (messaggi) => {
    if (!Array.isArray(messaggi)) return messaggi;
    const i = indiceRichiestaNuova(messaggi);
    return i >= 0 ? messaggi.slice(0, i) : messaggi;
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
      const daArchiviare = senzaRichiestaNonAccettata(payload?.messages); // R13-2
      try { return await original.capture(daArchiviare === payload?.messages ? payload : { ...payload, messages: daArchiviare }); }
      catch (errore) {
        if (segnaleStop?.aborted || payload?.signal?.aborted || errore?.name === 'AbortError') throw errore;
        return undefined;
      }
    },
    async prepare(payload) {
      telemetry.mark('provider-prepare');
      const requestIndex = providerRequests;
      providerRequests += 1;
      /* S2-2: senza uno scarto misurato, quello degli schemi degli attrezzi della prima richiesta */
      if (stimaAttrezziDelGiro === null) stimaAttrezziDelGiro = compattazione.stimaDegliAttrezzi(payload?.tools);
      /* N1 (revisione 8 della CLI): lo scarto ereditato è una MISURA, e vale per gli attrezzi del giro che l'ha presa. Se questo giro ne
         manda di più (un server MCP collegato a metà sessione: migliaia di token di schemi), la differenza si aggiunge — la prima
         richiesta non si misura con meno degli schemi che manda davvero. Uno scarto misurato più piccolo della stima degli schemi resta
         com'è: è il fornitore che conta meno della stima, non un errore. */
      if (stimaAttrezziInPrepare === false) {
        stimaAttrezziInPrepare = true;
        if (scartoDellaStima === null) scartoDellaStima = stimaAttrezziDelGiro;
        else if (Number.isFinite(stimaAttrezziMisurati) && stimaAttrezziDelGiro > stimaAttrezziMisurati) scartoDellaStima += stimaAttrezziDelGiro - stimaAttrezziMisurati;
      }
      /* Gli effimeri (il `system` del Piano) si staccano PRIMA di tutto: né riassunto, né archivio, né ancora. */
      const { messaggi: grezzi, effimeri } = separaEffimeri(payload.messages);
      /* §4.2, regola N: prima di ogni compattazione e di ogni chiamata — vedi `regolaN`.
         ⛔ R11-7 (revisione 11 della CLI, 23/10/2026): senza una finestra nota, quella che il fornitore ha detto rifiutando (nel giro prima,
         per lo stesso modello: `rifiutoNoto`), nella sua scala. Prima «Invia come allegato» e `--attach-if-too-large` rimandavano la
         richiesta appena rifiutata, identica, e solo al secondo rifiuto partiva l'allegato. */
      /* La scala del rifiuto vale per intero solo per la STESSA richiesta (stessa impronta): per un'altra può venire dalla storia di
         allora, e un fornitore che conta più della stima la farebbe sembrare più grande di quanto è — si usa al più 1, così la regola
         ferma prima di mandare solo ciò che non entrerebbe di certo, e il resto lo decide il fornitore. */
      let conRifiutoNoto;
      if (rifiutoNoto) {
        const i = indiceRichiestaNuova(grezzi);
        const testo = i >= 0 ? testoSemplice(grezzi[i]) : null;
        const stessa = testo !== null && typeof rifiutoNoto.impronta === 'string' && nomeDellaRichiestaSalvata(testo) === rifiutoNoto.impronta;
        const finestraNota = Number.isFinite(soglie.finestraToken) && soglie.finestraToken > 0;
        if (stessa || !finestraNota) {
          const scala = stessa ? rifiutoNoto.scala : Math.min(1, rifiutoNoto.scala);
          conRifiutoNoto = { linea: Math.floor(rifiutoNoto.finestra / scala), fonte: 'fornitore', finestraDelRifiuto: rifiutoNoto.finestra, scala };
        }
      }
      const perIlModello = copieGiaSalvate(noteDelleNonInviate(await regolaN(grezzi, effimeri, payload?.tools, requestIndex, conRifiutoNoto))); // R13-2, R13-3
      // Correct BEFORE any context-engine projection or legacy compaction so an
      // ambiguous raw tool result cannot be summarized into a false statement.
      const inputMessages = correggiMessaggiDesktop(perIlModello, { cartella, memoria: correzioniFissate });
      let prepared;
      let ripiego = false;
      /* lo Skip di QUESTA richiesta (C): lo stesso segnale entra nel motore e decide, se fallisce, se è stata la persona */
      const saltaDellaRichiesta = segnaleSalta();
      if (legacyMode) prepared = { messages: await maybeCompactLegacy(inputMessages, requestIndex) };
      /* ⛔ R13-4 (revisione 13 della CLI, 23/10/2026, S3): la finestra che il fornitore ha detto rifiutando (`rifiutoNoto`, R11-7) non
         arrivava al motore, che preparava con la finestra dichiarata: un rifiuto a OGNI giro (5 in 5 da T13 in `ce-ovf`, contro 1 senza
         motore). Quando è lei la finestra che vale (più piccola del catalogo, o il catalogo non ne ha), la richiesta passa dalla
         compattazione semplice, che la usa (`soglie`, dal registro); il motore riprende quando il rifiuto non vale più (R12-3). Niente
         riga: non è un guasto del motore, è il fornitore che ha detto la sua finestra. L'archivio continua a riceverla da `capture`. */
      else if (rifiutoNoto && Number.isFinite(rifiutoNoto.finestra) && rifiutoNoto.finestra > 0
        && !(Number.isFinite(soglie.finestraToken) && soglie.finestraToken < rifiutoNoto.finestra)) {
        ripiego = true;
        prepared = { messages: await maybeCompactLegacy(inputMessages, requestIndex) };
      }
      else {
        try {
          /* A1 + B1 (21/10/2026): al motore il tetto del riassunto atteso, e lo Skip dentro il segnale della richiesta — così il motore
             annulla davvero il suo lavoro (su un motore a posto unico lo libera) invece di lasciarlo correre sotto il giro */
          const segnaleRichiesta = saltaDellaRichiesta && payload?.signal ? AbortSignal.any([payload.signal, saltaDellaRichiesta])
            : saltaDellaRichiesta ?? payload?.signal;
          prepared = await original.prepare({ ...payload, messages: inputMessages, originali: grezzi, summaryCeilingMs: riassuntoTettoMs,
            onInTurnWait: ascoltaAttesaDelMotore(requestIndex), ...(segnaleRichiesta ? { signal: segnaleRichiesta } : {}) });
          /* 12/10/2026, decisione dell'owner («Si ripara da solo»): l'archivio non combaciava, i vecchi originali sono stati messi
             da parte e il motore è ripartito dalla storia attiva. La chat lo dice con una riga, che non ferma niente. */
          if (prepared?.riallineato) {
            const { asideId: _daParte, ...dettaglio } = prepared.riallineato;
            emitOnGiro?.({ giro: requestIndex, tipo: 'compattazione-fine', compattato: false, motivo: 'archivio-riallineato', codice: 'CTX_HISTORY_DIVERGED', dettaglio });
          }
          ripiegoInCorso = null; // R12-2: il motore è tornato sano; un guasto dopo si dice di nuovo
          richiestaNelMotore = true; // R13-2: da qui la richiesta del giro è nell'archivio del motore
          originaliNelMotore = grezzi;
        }
        catch (errore) {
          /* ⛔⛔ Owner 12/10/2026, «errori di compattazione non devono bloccare il flusso chat… è una regressione grave»: dal vivo
             `CTX_HISTORY_DIVERGED` fermava OGNI giro dal settimo in poi, anche un «ciao». Il motore del contesto è un servizio di
             SUPPORTO del giro: se fallisce, la richiesta parte lo stesso dalla compattazione semplice (quella col motore spento,
             che regge anche il contesto troppo grande, sotto in `infer`), e la chat lo dice una volta con una riga che non ferma
             niente. Uno Stop della persona invece resta uno Stop. L'archivio del motore non si tocca qui: la causa della
             divergenza si cura a parte (R-05). */
          const saltato = saltaDellaRichiesta?.aborted === true && !segnaleStop?.aborted && !payload?.signal?.aborted;
          if (!saltato && (segnaleStop?.aborted || payload?.signal?.aborted || errore?.name === 'AbortError')) throw errore;
          /* A1: il riassunto del motore è scaduto, è stato saltato o rifiutato ⇒ la compattazione semplice di QUESTA richiesta non
             richiama il modello (era lui il lento, o il rifiutato): riassunto senza modello, con la ragione per la riga d'esito */
          const ragioneSenzaModello = saltato ? 'saltato' : errore?.code === 'CTX_COMPACTION_TIMEOUT' ? 'tempo'
            : RIASSUNTI_RIFIUTATI_DAL_MOTORE.has(errore?.code) ? 'rifiutato' : null;
          if (ragioneSenzaModello) senzaModelloPerRichiesta = { requestIndex, ragione: ragioneSenzaModello };
          ripiego = true;
          /* 22/10/2026 (Mobile; owner «cura nella 0.1.36»): dopo «Salta il riassunto» il ripiego è una scelta della persona, non un guasto
             del motore — la riga di «ripiego» era di troppo e contraddiceva la riga d'esito. Un guasto vero la dice come prima. */
          if (ragioneSenzaModello !== 'saltato' && diciRipiego(errore?.code ?? null)) {
            emitOnGiro?.({ giro: requestIndex, tipo: 'compattazione-fine', compattato: false, motivo: 'ripiego', codice: errore?.code ?? null,
              /* R-05: dove la storia non combaciava (posizioni e ruolo, mai contenuto), quando chi ha fallito lo sa dire. */
              ...(errore?.dettaglio && typeof errore.dettaglio === 'object' ? { dettaglio: errore.dettaglio } : {}) });
          }
          prepared = { messages: await maybeCompactLegacy(inputMessages, requestIndex) };
        }
      }
      const proiettati = correggiMessaggiDesktop(prepared?.messages ?? inputMessages, { cartella, memoria: correzioniFissate });
      /* ⛔ R11-3 (revisione 11 della CLI, 23/10/2026): la lista della richiesta è SEMPRE una copia. Senza niente da correggere né da
         proiettare era l'array della storia del kernel (`messaggi`, passato com'è quando non ci sono note in coda), e la riscrittura sul
         rifiuto del fornitore (`array.splice`, qui sotto in `inferLegacy` e nel ritentativo del motore) sostituiva la STORIA VERA con la
         proiezione accorciata: un giro riuscito dopo il rifiuto finiva con `messaggiFinali` accorciati e un record che puntava oltre la
         loro fine; uno fallito portava `messaggiDelGiro` accorciati, che il registro buttava (non estendono la storia). C'era dal 24/09. */
      const messages = [...compattazione.riattaccaEffimeri(proiettati, effimeri)];
      richiestaCorrente = legacyMode || ripiego ? { array: messages, grezzi: inputMessages, effimeri, requestIndex, lunghezzaProiezione: proiettati.length, attrezzi: payload?.tools } : null;
      richiestaSenzaAttesa = !legacyMode && !ripiego && prepared?.sentWithoutWaiting === true ? { array: messages, payload, grezzi, inputMessages, effimeri, requestIndex } : null;
      richiestaDelMotore = !legacyMode && !ripiego
        ? { array: messages, grezzi: inputMessages, effimeri, requestIndex, lunghezzaProiezione: proiettati.length, attrezzi: payload?.tools } : null;
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
    /* 22/10/2026 notte (revisione 5 della CLI): una preparazione in sottofondo si annuncia e si conta solo quando produce qualcosa
       (R1), e ora DOPO aver letto la cornice (blocco dei fatti, git): può succedere dopo che il giro ha già restituito il suo
       risultato. Il conto è quindi VIVO — chi lo legge dopo aver atteso la preparazione (`compattazioneInPreparazione`) vede il numero
       vero, e JSON.stringify serializza il valore del momento. */
    get conteggioPreparazioni() { return { get preparate() { return preparate; }, get usate() { return usate; } }; },
    /* S2-2: lo scarto fra il fornitore e la stima sull'ultima richiesta misurata, per il registro (giro dopo, fine giro, /compact) */
    /* F4 (revisione 7): senza una misura plausibile, la stima degli attrezzi di questo giro — mai lo scarto ereditato, che resterebbe
       vecchio quando un fornitore smette di mandare `usage` */
    get scartoMisurato() { return ultimoScarto ?? stimaAttrezziDelGiro; },
    get nonEntraDetto() { return nonEntraGiaDetto; },
    /* F6, seconda passata: lo scarto intero per la domanda «può entrare?» (il registro lo usa nel fine giro e nel /compact) */
    get scartoNonEntra() { const v = Math.max(ultimoScartoIntero ?? 0, stimaAttrezziDelGiro ?? 0); return v > 0 ? v : null; },
    /* N2 (revisione 8): la stima degli schemi che il giro ha mandato davvero, per il registro (anche dopo un riavvio, dal giornale) */
    get stimaAttrezzi() { return stimaAttrezziDelGiro; },
    /* Pezzo D: il freno com'è a fine giro, per il registro (che lo scrive nel giornale quando cambia) */
    get freno() { return freno; },
    /* R11-4: l'ultima copia del registro che il giro ha unito alla sua — la base dell'unione di fine giro (le ricariche già unite non si
       contano due volte) */
    get frenoVisto() { try { return JSON.parse(frenoVivoVisto); } catch { return null; } },
    get riassuntoInefficace() { return riassuntoInefficaceDelGiro; }, // R11-5
    get rifiutoDelFornitore() { return rifiutoDelFornitore; }, // R11-7
    get ripiegoDetto() { return ripiegoInCorso; }, // R12-2: il ripiego detto e non ancora guarito, per il giro dopo
    get massimoAccettato() { return massimoAccettato; }, // R12-3
    /* Pezzo E: i riassunti veri della sessione e k com'erano a fine giro (null se nessun numero vero li ha misurati) */
    get riassuntiVeri() { return riassuntiVeriDellaSessione; },
    get fattoreK() { return kDellaSessione; },
    /* R13-1 (terza parte): per il giro che fallisce — vedi `recordsConfermati` */
    annullaGratuitiNonConfermati,
    get richiestaNelMotore() { return richiestaNelMotore; }, // R13-2
    get originaliNelMotore() { return originaliNelMotore; }, // R13-2
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
        if (!richiestaCorrente) throw errore;
        return scalaDelContestoPieno(errore, signal, invoke);
      }
  };
  /* Pezzo C (§4.1 del rapporto della CLI): fino a tre scalini per giro. Ognuno riscrive la richiesta verso il suo bersaglio o lascia il
     giro fallire col rifiuto del fornitore e la diagnosi (`contestoPieno`); un nuovo rifiuto passa allo scalino dopo. Sulla richiesta
     corrente; R12-2: anche quella del motore, che sul rifiuto ci passa (sotto, `hooks.infer`). */
  const scalaDelContestoPieno = async (errore, signal, invoke) => {
    let rifiuto = errore;
    for (;;) {
      const nuova = await riscriviPerIlContestoPieno(rifiuto, richiestaCorrente);
      if (!nuova) throw rifiuto;
      const { array, effimeri } = richiestaCorrente;
      array.splice(0, array.length, ...nuova);
      richiestaCorrente.lunghezzaProiezione = nuova.length - effimeri.length;
      try {
        const esito = await invoke(signal);
        aggiornaAncora(esito?.usage);
        return esito;
      } catch (secondo) {
        if (signal?.aborted || segnaleStop?.aborted) throw secondo;
        /* anche il ritentativo può finire in overflow: classificato come il primo, e tocca allo scalino dopo */
        if (compattazione.classificaErroreFornitore(secondo) !== 'contesto-pieno') throw secondo;
        if (secondo && typeof secondo === 'object') secondo.classificazione = 'contesto-pieno';
        rifiuto = secondo;
      }
    }
  };
  /*
   * ⭐ Pezzo C — UNO SCALINO SUL RIFIUTO DEL FORNITORE (§4.1 del rapporto della CLI, owner 22/10). Torna la richiesta riscritta (proiezione
   *   corretta + effimeri) o `null`: allora il giro fallisce col rifiuto, che porta `contestoPieno` { scalino, bersaglio, numeri?,
   *   esauriti? } — chi lo mostra dice quanto e perché (rapporto §4.4, «anche dopo gli accorciamenti»). Mai la stessa richiesta due volte.
   *   1. Il bersaglio: dai numeri del fornitore, o dagli scalini 70/50/35% (`bersaglioDelContestoPieno`). La parte che la compattazione
   *      non tocca (effimeri, attrezzi e scarto della stima) si toglie dal bersaglio: resta quello della proiezione.
   *   2. La regola N sul bersaglio: se è la richiesta NUOVA della persona a non entrare, niente si paga — `REQUEST_TOO_LARGE` con
   *      `fonte:'fornitore'` (o l'allegato, se la persona l'ha scelto). Se è la cornice da sola, «non entra» una volta e il giro fallisce.
   *   3. La compattazione col bersaglio (`compattaDovuta`): passi gratuiti, un riassunto pagato solo se ci arriva e solo al primo scalino,
   *      altrimenti il riassunto senza modello. Se non cambia niente, il giro fallisce.
   */
  const riscriviPerIlContestoPieno = async (rifiuto, r) => {
    const scalino = contestoPieno.ritentativi;
    const diagnosi = (dati) => { if (rifiuto && typeof rifiuto === 'object') rifiuto.contestoPieno = { scalino, ...dati }; };
    if (scalino >= RITENTATIVI_CONTESTO_PIENO_MASSIMI) { diagnosi({ esauriti: true }); return null; }
    contestoPieno.ritentativi += 1;
    const scarto = Math.round(scartoCorrente());
    const stimaInviata = compattazione.stimaConPezzi(r.array) + scarto;
    if (contestoPieno.primoRifiuto === null) contestoPieno.primoRifiuto = stimaInviata;
    const numeri = compattazione.numeriDelContestoPieno(rifiuto);
    const bersaglioRichiesta = compattazione.bersaglioDelContestoPieno({ livello: scalino, stimaInviata, stimaPrimoRifiuto: contestoPieno.primoRifiuto, numeri });
    diagnosi({ bersaglio: bersaglioRichiesta, ...(numeri ? { numeri } : {}) });
    /* Due parti fisse, per due domande diverse (R12-1, revisione 12 della CLI):
       - il BERSAGLIO della proiezione è un passo prudente: porta lo scarto intero, che può essere tutto cornice vera (uno scarto di 6.000
         token che il fornitore conta sempre, ZK3-06) — un bersaglio più alto scriverebbe una proiezione che il fornitore rifiuta, e
         sbagliare qui costa un passo più corto del necessario;
       - le affermazioni CERTE («non entra» sulla linea certa, «troppo grande» nella regola N) fanno FALLIRE il giro: portano solo la
         parte dello scarto che la storia non può spiegare (`scartoFissoCerto`). Sbagliare lì costa al più un rifiuto in più. */
    const attrezziStimati = compattazione.stimaDegliAttrezzi(r.attrezzi);
    /* ⛔ R13-1 (revisione 13 della CLI): la storia che spiega lo scarto è quella della richiesta RIFIUTATA, senza la richiesta nuova
       (`senzaLaRichiestaNuova`). Prima era `r.grezzi`: col messaggio nuovo dentro, e con la storia che lo scalino 0 aveva già tolto
       dalla richiesta mandata. Dopo un accorciamento la storia rimasta è poca e non spiega più la cornice: la regola N la vede. */
    const scartoDellaCornice = compattazione.scartoFissoCerto({ scarto, attrezzi: attrezziStimati,
      spiegabileDallaStoria: compattazione.scartoSpiegabileDallaStoria(compattazione.senzaLaRichiestaNuova(r.array)) });
    const parteFissa = compattazione.stimaConPezzi(r.effimeri) + scarto;
    const parteFissaCerta = compattazione.stimaConPezzi(r.effimeri) + scartoDellaCornice;
    const finestraDelRifiuto = numeri?.massimo ?? null;
    /* 2. la regola N sul bersaglio (la cornice qui è quella della regola: sistema, effimeri e schemi stimati). ⛔ Solo coi NUMERI del
       fornitore: senza, il 70% è una stima prudente di quanto togliere, non la finestra — dire «la cornice non entra» o «il tuo messaggio
       è troppo grande» su quella base fermerebbe giri che, accorciati, entrano (la prova S2-2-OVERFLOW-TESTO-01 l'ha mostrato). */
    const peso = numeri ? pesoDellaRichiestaNuova(r.grezzi, { attrezzi: r.attrezzi, effimeri: r.effimeri }) : null;
    /* La regola conta gli schemi con la loro stima; il bersaglio porta invece lo SCARTO (la misura del giro, che di solito è proprio
       quella stima, ma non sempre). Si porta il bersaglio nella scala della regola, così le due parti contano gli attrezzi allo stesso modo.
       ⛔ R11-1 (revisione 11 della CLI, 23/10/2026, S2): dello scarto si toglie solo la parte che può essere degli ATTREZZI (al più la loro
       stima). Lo scarto è misurato sull'ultima richiesta riuscita e comprende anche la STORIA che il fornitore conta più della stima
       (codice, JSON, base64 negli esiti d'attrezzo): toglierlo tutto giudicava la richiesta nuova contro una linea troppo bassa, come se
       quella storia fosse cornice fissa — e la storia è proprio ciò che la compattazione accorcia. Il caso della CLI: un file di codice
       letto al giro 1, 106.000 caratteri di prosa al giro 2, «26.510 + 7.421 non entra in 40.000». Entrava, accorciando l'esito vecchio.
       ⛔ R11-8: «non entra» e «troppo grande» sono affermazioni CERTE: si giudicano sulla linea certa (la finestra del fornitore meno la
       riserva d'uscita), non sul bersaglio dello scalino, che dal secondo scalino è un passo prudente (50%, 35%) e non un limite.
       ⛔ R12-1: «la parte degli attrezzi» è diventata `scartoFissoCerto` — la stessa per la regola e per la linea certa qui sotto. Con
       poca storia uno scarto grande è cornice anche se gli attrezzi stimati non lo spiegano (ZK3-06), e allora conta anche qui. */
    const nellaScalaDellaRegola = (linea) => linea - scartoDellaCornice + attrezziStimati;
    const riserva = compattazione.riservaDelContestoPieno(numeri);
    const lineaDellaRegola = numeri
      ? nellaScalaDellaRegola(Math.floor((stimaInviata * Math.max(0, numeri.massimo - riserva)) / numeri.richiesti)) : null;
    /* R11-2: i numeri che si dicono «del fornitore» stanno nella sua scala — la stessa proporzione della richiesta rifiutata (Z-K3) */
    const scala = numeri ? numeri.richiesti / stimaInviata : 1;
    if (numeri && Number.isSafeInteger(numeri.massimo) && numeri.massimo > 0 && scala > 0) {
      /* R11-7: con l'impronta della richiesta nuova rifiutata — se la persona la rimanda uguale, il giro dopo sa che non entra */
      const testoNuovo = peso ? testoSemplice(r.grezzi[peso.indice]) : null;
      rifiutoDelFornitore = { finestra: numeri.massimo, scala, impronta: testoNuovo ? nomeDellaRichiestaSalvata(testoNuovo) : null };
    }
    if (peso && peso.tokensCornice >= lineaDellaRegola) {
      const finestra = finestraDelRifiuto ?? soglie.finestraToken;
      if (Number.isFinite(finestra) && finestra > 0 && nonEntraGiaDetto !== finestra) {
        nonEntraGiaDetto = finestra;
        /* Z-K3: il pavimento nella scala del FORNITORE (i numeri ci sono sempre qui), come la finestra che lo accompagna — nella scala
           della stima un fornitore che conta il 25% in più leggeva «6.857 su 8.192: non entra». R11-8: con la riserva d'uscita, che è
           ciò che lo porta oltre la finestra (`riserva`, additivo: chi lo dice può aggiungere «e lo spazio per la risposta») */
        emitOnGiro?.({ giro: r.requestIndex, tipo: 'compattazione-fine', compattato: false, motivo: 'non-entra', finestra,
          pavimento: Math.ceil((peso.tokensCornice + peso.tokensRichiesta) * scala) + riserva, riserva });
      }
      return null;
    }
    let grezzi = r.grezzi;
    if (peso && peso.tokensCornice + peso.tokensRichiesta > lineaDellaRegola) {
      const lista = await regolaN(r.grezzi, r.effimeri, r.attrezzi, r.requestIndex, { linea: lineaDellaRegola, fonte: 'fornitore', finestraDelRifiuto, scala,
        corniceInPiu: Math.max(0, scartoDellaCornice - attrezziStimati), riserva }); // R13-1: la frase dice la cornice certa e la riserva
      if (lista !== r.grezzi) {
        grezzi = correggiMessaggiDesktop(lista, { cartella, memoria: correzioniFissate });
        r.grezzi = grezzi;
      }
    }
    /* 3. la compattazione col bersaglio. Coi numeri, un bersaglio che la parte fissa da sola supera vuol dire che niente entra; senza,
       si accorcia tutto quello che si può (bersaglio minimo: passi gratuiti al minimo, riassunto senza modello) e decide il fornitore. */
    const differenza = bersaglioRichiesta - parteFissa;
    /* R12-1: «niente entra» è un'affermazione certa — la parte fissa CERTA; fra le due, bersaglio minimo e decide la linea certa */
    if (numeri && !(bersaglioRichiesta - parteFissaCerta > 0)) return null;
    const bersaglio = Math.max(1, differenza);
    /* ⛔ Z-K3 (revisione 10 della CLI, 23/10/2026, finestra da 8.192): coi numeri del fornitore si sa anche la linea oltre la quale la
       richiesta è rifiutata DI CERTO — la finestra vera senza la riserva d'uscita, nella scala della stima della richiesta rifiutata (lo
       stesso rapporto del bersaglio); tolta la parte fissa, è la linea della proiezione. Una proiezione SENZA riassunto pagato (quello
       senza modello, la sola coda) che la passa non si scrive e non riparte: il giro finisce al primo rifiuto, come con la cornice da
       sola qui sopra. Prima si scriveva il riassunto senza modello (la storia diventava un indice) e si rimandava una richiesta che il
       fornitore rifiutava di nuovo. Fra il bersaglio e questa linea decide ancora il fornitore: il bersaglio tiene la riserva d'uscita.
       ⛔ R12-1 (revisione 12 della CLI): la linea è certa solo con la parte fissa CERTA. Con lo scarto intero, la storia contata più
       della stima (il base64 letto al giro prima, che i passi gratuiti tolgono) restava nella parte fissa anche dopo averla tolta, e il
       giro falliva con «non entra» a 46.738 su 40.000 — accorciato entrava a ~33.000. */
    const certo = numeri
      ? { limite: Math.floor((stimaInviata * numeri.massimo) / numeri.richiesti) - parteFissaCerta, finestra: numeri.massimo, parteFissa: parteFissaCerta, scala: numeri.richiesti / stimaInviata }
      : null;
    const projected = projectLegacy(grezzi);
    /* ⛔ R13-5 (revisione 13 della CLI, S4): la riga della scala diceva «66.6k → 15.7k» con la richiesta mandata a 35.197 — sulla strada
       del motore la richiesta rifiutata era la SUA proiezione, non la storia grezza che la compattazione semplice prende come base. Il
       «prima» della riga è la richiesta che il fornitore ha rifiutato (senza gli effimeri, come la proiezione semplice). */
    const misurata = r.dalMotore ? r.array.slice(0, r.lunghezzaProiezione) : projected;
    const { token, misura } = compattazione.misuraOccupazione({ ancora, messaggi: misurata, finestraToken: soglie.finestraToken, scarto: scartoDellaStima ?? 0 });
    /* 15/10/2026 e revisione 5 della CLI (S2-2): prima il riassunto in volo o pronto (con firma, Stop, «Salta» e tetto), poi la base, poi
       la compattazione — tutto dentro `compattaDovuta`, che ora porta il bersaglio */
    const proiezione = await compattaDovuta(grezzi, projected, { token, misura, requestIndex: r.requestIndex, motivo: 'overflow', soglia: soglie.soglia,
      bersaglio, livelloContestoPieno: scalino, certo });
    if (!proiezione) return null;
    const nuova = compattazione.riattaccaEffimeri(correggiMessaggiDesktop(proiezione, { cartella, memoria: correzioniFissate }), r.effimeri);
    /* una richiesta identica a quella rifiutata non riparte. ⛔ R12-1: e se il fornitore ha detto i numeri, ora «non entra» è CERTO —
       ha appena rifiutato questa stessa richiesta e non resta niente da accorciare: lo si dice coi SUOI numeri (una volta per finestra).
       Al margine (ZK3-07) la linea certa non poteva affermarlo prima di mandare; il giro finiva col solo errore. */
    if (nuova.length === r.array.length && nuova.every((m, i) => m === r.array[i] || JSON.stringify(m) === JSON.stringify(r.array[i]))) {
      /* ⛔ R13-1 (seconda parte): niente da accorciare e il fornitore ha rifiutato. Prima di dire «non entra», che dà la colpa alla
         finestra, si guarda coi SUOI numeri se il resto entra senza la richiesta nuova: allora è lei a non entrare, e vale la regola N
         (l'allegato se la persona l'ha scelto, altrimenti «troppo grande» col pulsante). Il caso che la prima parte non copre: il primo
         giro con un incollato grande, quando lo scarto è ancora la sola stima degli attrezzi e la cornice contata in più non si conosce.
         La richiesta nuova si conta con la proporzione della richiesta rifiutata (`scala`), come la regola N. */
      if (numeri && Number.isFinite(numeri.richiesti) && numeri.richiesti > 0 && scala > 0) {
        const pesoOra = pesoDellaRichiestaNuova(r.grezzi, { attrezzi: r.attrezzi, effimeri: r.effimeri });
        const resto = pesoOra ? numeri.richiesti - pesoOra.tokensRichiesta * scala : Number.POSITIVE_INFINITY;
        if (pesoOra && resto <= numeri.massimo - riserva) {
          const lista = await regolaN(r.grezzi, r.effimeri, r.attrezzi, r.requestIndex, { linea: lineaDellaRegola, fonte: 'fornitore', finestraDelRifiuto, scala,
            corniceInPiu: Math.max(0, resto / scala - pesoOra.tokensCornice), riserva, forza: true, spazio: (numeri.massimo - riserva - resto) / scala });
          if (lista !== r.grezzi) {
            const conAllegato = correggiMessaggiDesktop(lista, { cartella, memoria: correzioniFissate });
            r.grezzi = conAllegato;
            return compattazione.riattaccaEffimeri(correggiMessaggiDesktop(projectLegacy(conAllegato), { cartella, memoria: correzioniFissate }), r.effimeri);
          }
        }
      }
      if (numeri && Number.isSafeInteger(numeri.massimo) && numeri.massimo > 0 && Number.isFinite(numeri.richiesti) && nonEntraGiaDetto !== numeri.massimo) {
        nonEntraGiaDetto = numeri.massimo;
        emitOnGiro?.({ giro: r.requestIndex, tipo: 'compattazione-fine', compattato: false, motivo: 'non-entra', finestra: numeri.massimo,
          pavimento: Math.ceil(numeri.richiesti) });
      }
      return null;
    }
    return nuova;
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
        try {
          preparata = await original.prepare({ ...r.payload, messages: r.inputMessages, originali: r.grezzi, waitForInFlight: true, onInTurnWait: ascoltaAttesaDelMotore(r.requestIndex) });
          ripiegoInCorso = null; // R12-2: il motore ha risposto
        }
        catch (secondo) {
          if (segnaleStop?.aborted || opzioni.signal?.aborted || secondo?.name === 'AbortError') throw secondo;
          if (diciRipiego(secondo?.code ?? null)) {
            emitOnGiro?.({ giro: r.requestIndex, tipo: 'compattazione-fine', compattato: false, motivo: 'ripiego', codice: secondo?.code ?? null });
          }
          const proiettata = projectLegacy(r.inputMessages);
          const { token, misura } = compattazione.misuraOccupazione({ ancora, messaggi: proiettata, finestraToken: soglie.finestraToken, scarto: scartoDellaStima ?? 0 });
          /* Revisione 5 della CLI (S2-2): la stessa attesa con firma, Stop, «Salta» e tetto della strada legacy qui sopra */
          const scambio = pronta ? scambioPossibile(r.inputMessages, { token, misura }) : null;
          const riassunta = scambio
            ? usaPronta(scambio, { requestIndex: r.requestIndex, motivo: 'overflow' })
            : await compattaDovuta(r.inputMessages, proiettata, { token, misura, requestIndex: r.requestIndex, motivo: 'overflow', soglia: soglie.soglia });
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
      const delMotore = richiestaDelMotore; richiestaDelMotore = null;
      const prova = r ? inferSenzaAttesa(r, opzioni, invoke) : inferBase(opzioni, invoke);
      if (!delMotore) return prova;
      /*
       * ⛔ R12-2 (revisione 12 della CLI, 23/10/2026, S2, owner «correggere nella 0.6.13»): col motore del contesto (finestre da 64k in
       *   su) un «contesto pieno» del fornitore non accorciava né riprovava — `inferBase` spegne il ritentativo del servizio («lo fa il
       *   guscio») e il guscio lo faceva solo per la richiesta mandata senza aspettare. Niente scala, niente numeri nell'errore, nessuna
       *   finestra ricordata: misurato dalla CLI, dichiarati 131.072 e il fornitore che rifiuta oltre 30.000, ogni giro falliva da lì in
       *   poi. ⇒ Sul rifiuto la richiesta passa alla scala della compattazione semplice, la stessa di quando il motore cade (il ripiego):
       *   bersaglio dai numeri del fornitore, regola N, linea certa, finestra ricordata. La richiesta resta nello stesso array.
       */
      return prova.catch(async (errore) => {
        if (opzioni.signal?.aborted || segnaleStop?.aborted) throw errore;
        if (compattazione.classificaErroreFornitore(errore) !== 'contesto-pieno') throw errore;
        if (errore && typeof errore === 'object') errore.classificazione = 'contesto-pieno';
        richiestaCorrente = { ...delMotore, lunghezzaProiezione: delMotore.array.length - delMotore.effimeri.length, dalMotore: true }; // R13-5
        return scalaDelContestoPieno(errore, opzioni.signal, invoke);
      });
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
    cartellaIncollati: typeof input.cartellaIncollati === 'string' && input.cartellaIncollati ? input.cartellaIncollati : null,
    compattazionePronta: input.compattazionePronta ?? null,
    istantanea: input.compattazioneIstantanea === true && !compattazione.motoreAPostoUnico(input.modello),
    compattazioneInArrivo: input.compattazioneInArrivo ?? null,
    /* A1 (owner 21/10/2026 sera): i due orologi del riassunto ATTESO e il «Skip» della persona (contratto riga viva §4-§5) */
    riassuntoInattivitaMs: interoPositivo(input.riassuntoInattivitaMs, RIASSUNTO_INATTIVITA_MS),
    riassuntoTettoMs: interoPositivo(input.riassuntoTettoMs, RIASSUNTO_TETTO_MS),
    segnaleSaltaRiassunto: input.segnaleSaltaRiassunto instanceof AbortSignal ? input.segnaleSaltaRiassunto : null,
    saltaRiassuntoFn: typeof input.saltaRiassuntoFn === 'function' ? input.saltaRiassuntoFn : null,
    /* 21/10/2026 (CLI): il modello dei riassunti dell'ospite e la sua finestra; assenti ⇒ quelli della conversazione */
    modelloRiassunto: typeof input.modelloRiassunto === 'string' && input.modelloRiassunto ? input.modelloRiassunto : null,
    finestraRiassuntoToken: Number.isFinite(input.finestraRiassuntoToken) && input.finestraRiassuntoToken > 0 ? input.finestraRiassuntoToken : null,
    scartoMisurato: Number.isFinite(input.scartoMisurato) && input.scartoMisurato >= 0 ? input.scartoMisurato : null,
    stimaAttrezziMisurati: Number.isFinite(input.stimaAttrezziMisurati) && input.stimaAttrezziMisurati > 0 ? input.stimaAttrezziMisurati : null,
    nonEntraDetto: Number.isFinite(input.nonEntraDetto) ? input.nonEntraDetto : null,
    rifiutoNoto: input.rifiutoNoto && Number.isSafeInteger(input.rifiutoNoto.finestra) && input.rifiutoNoto.finestra > 0
      && Number.isFinite(input.rifiutoNoto.scala) && input.rifiutoNoto.scala > 0
      ? { finestra: input.rifiutoNoto.finestra, scala: input.rifiutoNoto.scala, impronta: typeof input.rifiutoNoto.impronta === 'string' ? input.rifiutoNoto.impronta : null } : null,
    ripiegoDettoPrima: typeof input.ripiegoDetto === 'string' && input.ripiegoDetto ? input.ripiegoDetto.slice(0, 80) : null, // R12-2
    /* Pezzo D: il freno della sessione, il suo giro e il verdetto in attesa (dal registro) */
    frenoIniziale: compattazione.frenoValido(input.freno),
    frenoVivo: typeof input.frenoVivo === 'function' ? input.frenoVivo : null, // R10-3
    versioneGiro: Number.isSafeInteger(input.versioneGiro) && input.versioneGiro >= 0 ? input.versioneGiro : null,
    verdettoInAttesa: input.verdettoInAttesa === true,
    /* Pezzo E: i riassunti veri della sessione e k (dal registro) */
    riassuntiVeri: Array.isArray(input.riassuntiVeri) ? input.riassuntiVeri : null,
    fattoreK: Number.isFinite(input.fattoreK) && input.fattoreK > 0 ? input.fattoreK : null,
    allegaSeTroppoGrande: input.allegaSeTroppoGrande === true || typeof input.allegaSeTroppoGrande === 'function' ? input.allegaSeTroppoGrande : false,
    richiesteNonInviate: Array.isArray(input.richiesteNonInviate) ? input.richiesteNonInviate.filter((i) => Number.isSafeInteger(i) && i >= 0) : [], // R13-2
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
      scartoMisurato: contextHooks.scartoMisurato,
      scartoNonEntra: contextHooks.scartoNonEntra,
      stimaAttrezzi: contextHooks.stimaAttrezzi,
      freno: contextHooks.freno, // pezzo D (§4.3)
      frenoVisto: contextHooks.frenoVisto, // R11-4
      riassuntoInefficace: contextHooks.riassuntoInefficace, // R11-5
      rifiutoDelFornitore: contextHooks.rifiutoDelFornitore, // R11-7
      ripiegoDetto: contextHooks.ripiegoDetto, // R12-2
      massimoAccettato: contextHooks.massimoAccettato, // R12-3
      riassuntiVeri: contextHooks.riassuntiVeri, // pezzo E (§4.1)
      fattoreK: contextHooks.fattoreK,
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
  } catch (errore) {
    /* ⛔ R10-7 (revisione 10 della CLI, 23/10/2026): un giro che fallisce DOPO aver applicato una compattazione (annunciata, durevole, a
       volte pagata) la buttava: il giro dopo rimandava la storia intera e ripagava lo stesso riassunto (misurato: 26.706 → 8.782 al turno
       4, poi al turno 5 tutto di nuovo e un secondo riassunto). Come `messaggiDelGiro`, il record e lo stato del giro viaggiano con
       l'errore; decide il registro se tenerli (solo se tiene anche il lavoro del giro). */
    if (errore && typeof errore === 'object') {
      contextHooks.annullaGratuitiNonConfermati?.(); // R13-1: prima di consegnare i record al registro
      /* R13-2: una richiesta troppo grande che il motore ha già archiviato — il registro la tiene nella storia (e il giro dopo la mostra
         come nota), invece di toglierla: l'archivio del motore è a sola aggiunta */
      if (errore.code === 'REQUEST_TOO_LARGE' && contextHooks.richiestaNelMotore === true) {
        errore.archiviataDalMotore = true;
        if (Array.isArray(contextHooks.originaliNelMotore)) errore.messaggiDelGiro = [...contextHooks.originaliNelMotore];
      }
      if (records.length > 0) errore.recordDiCompattazione = [...records];
      errore.statoDelGiro = { scartoMisurato: contextHooks.scartoMisurato, scartoNonEntra: contextHooks.scartoNonEntra, stimaAttrezzi: contextHooks.stimaAttrezzi,
        freno: contextHooks.freno, frenoVisto: contextHooks.frenoVisto, riassuntoInefficace: contextHooks.riassuntoInefficace,
        rifiutoDelFornitore: contextHooks.rifiutoDelFornitore, ripiegoDetto: contextHooks.ripiegoDetto, massimoAccettato: contextHooks.massimoAccettato, riassuntiVeri: contextHooks.riassuntiVeri, fattoreK: contextHooks.fattoreK };
    }
    throw errore;
  } finally {
    telemetry.close();
  }
}
