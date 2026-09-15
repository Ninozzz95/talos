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
import * as kernel from './talosHarness.mjs';

export * from './talosHarness.mjs';

export const DESKTOP_BLACKBOX_HOTFIX_VERSION = '2026-09-15';
export const NO_TEST_SUITE_CODE = 'NO_TEST_SUITE_CONFIGURED';
export const STALL_DIAGNOSTIC_EVENT = 'desktop-harness-stall';

const STALL_MS_DEFAULT = 45_000;
const MAX_TIMER_MS = 2_147_483_647;
const SHELL_COMBINED_NOTICE = '[shell output: stdout and stderr combined in arrival order; stream identity is not preserved]';
const SEARCH_INCOMPLETE_NOTICE = 'SEARCH INCOMPLETE: results are partial; missing paths are NOT proof that a file does not exist.';
const POWERSHELL_ZERO_WARNING = '⚠ SHELL_DIAGNOSTIC_WITH_ZERO_EXIT: PowerShell emitted a structured error diagnostic even though the process reported exit 0. Treat this command as NOT VERIFIED until the diagnostic is resolved.';
const POWERSHELL_DIAGNOSTIC = /(?:^|\n)\s*(?:CategoryInfo\s*:|FullyQualifiedErrorId\s*:|At line:\d+|ParserError\b|CommandNotFoundException\b|ObjectNotFound\b|NativeCommandError\b|TerminatingError\b)/im;
const SHELL_EXECUTION_HEADER = /^exit\s+-?\d+\s+\[sandbox:[^\]]+\](?:\r?\n|$)/i;
const SHELL_ZERO_HEADER = /^exit\s+0\s+\[sandbox:[^\]]+\](?:\r?\n|$)/i;
const DEFAULT_NPM_TEST = /^npm\s+test\s*$/i;
const PLACEHOLDER_NPM_TEST = /^\s*echo\s+(?:["']?error:\s*)?no test specified["']?\s*(?:&&|;)\s*exit\s+1\s*$/i;
const TEST_SENTINEL_MESSAGE = `${NO_TEST_SUITE_CODE}: workspace has no usable npm scripts.test; verification was not run.`;
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

  if (name === 'cerca' && /⚠\s*incomplete scan:/i.test(text)) {
    if (/^no file matches\./i.test(text)) {
      text = text.replace(/^no file matches\./i, 'no match was found in the scanned subset. Absence is NOT established.');
    }
    if (!text.startsWith(SEARCH_INCOMPLETE_NOTICE)) text = `${SEARCH_INCOMPLETE_NOTICE}\n${text}`;
  }

  if (name === 'elenca' && /is not a readable folder of this workspace/i.test(text)) {
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

function nodeCommandForNoTests() {
  const exe = `"${String(process.execPath).replace(/"/g, '""')}"`;
  const script = `console.error('${TEST_SENTINEL_MESSAGE}'); process.exit(2)`;
  return `${exe} -e "${script}"`;
}

export async function comandoProvaDesktop({ cartella, comandoProva, esplicito = false } = {}) {
  if (esplicito || (typeof comandoProva === 'string' && !DEFAULT_NPM_TEST.test(comandoProva.trim()))) return comandoProva;
  // If the workspace itself is not usable, preserve npm's own diagnostic. The
  // sentinel is reserved for the fact we can actually establish: no test suite.
  if (typeof cartella !== 'string' || !cartella) return comandoProva;
  try { if (!lstatSync(cartella).isDirectory()) return comandoProva; }
  catch { return comandoProva; }

  let raw;
  try { raw = await readFile(join(cartella, 'package.json'), 'utf8'); }
  catch (error) {
    if (error?.code === 'ENOENT') return nodeCommandForNoTests();
    return comandoProva;
  }

  let packageJson;
  try { packageJson = JSON.parse(raw); }
  catch { return comandoProva; }

  const test = packageJson?.scripts?.test;
  if (typeof test === 'string' && test.trim() && !PLACEHOLDER_NPM_TEST.test(test)) return comandoProva;
  return nodeCommandForNoTests();
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

function wrapContextHooks(original, {
  cartella, modello, chiave, fetchDiRete, segnaleStop, telemetry, extraUsage, emitOnGiro,
} = {}) {
  let compacted = null;
  let lastCompactionAttempt = -1;
  let compactions = 0;
  let providerRequests = 0;

  const legacyMode = original === undefined || original === null;
  if (!legacyMode && typeof original.prepare !== 'function') {
    throw new TypeError('contextHooks.prepare must be a function when contextHooks is configured');
  }

  const projectLegacy = (rawMessages) => {
    if (!compacted) return rawMessages;
    return [...compacted.messages, ...rawMessages.slice(compacted.rawPrefixLength)];
  };

  const maybeCompactLegacy = async (rawMessages, tools, requestIndex) => {
    if (!legacyMode) return rawMessages;
    let projected = projectLegacy(rawMessages);
    if (requestIndex === lastCompactionAttempt || !kernel.serveCompattare(requestIndex, projected)) return projected;
    lastCompactionAttempt = requestIndex;
    emitOnGiro?.({ giro: requestIndex, tipo: 'compattazione-inizio' });
    const result = await kernel.compattaConversazione(projected, (messages) => kernel.chiamaConRitenta({
      modello,
      chiave,
      messaggi: messages,
      attrezzi: tools,
      ...(fetchDiRete ? { fetchDiRete } : {}),
      ...(segnaleStop ? { segnaleStop } : {}),
    }));
    emitOnGiro?.({ giro: requestIndex, tipo: 'compattazione-fine', compattato: result.compattato });
    usageAdd(extraUsage, result.usage);
    if (result.compattato) {
      compacted = { rawPrefixLength: rawMessages.length, messages: result.messaggi };
      projected = result.messaggi;
      compactions += 1;
    }
    return projected;
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
      // Correct BEFORE any context-engine projection or legacy compaction so an
      // ambiguous raw tool result cannot be summarized into a false statement.
      const inputMessages = correggiMessaggiDesktop(payload.messages, { cartella });
      let prepared;
      if (legacyMode) prepared = { messages: await maybeCompactLegacy(inputMessages, payload.tools, requestIndex) };
      else prepared = await original.prepare({ ...payload, messages: inputMessages });
      const messages = correggiMessaggiDesktop(prepared?.messages ?? inputMessages, { cartella });
      return { ...(prepared && typeof prepared === 'object' ? prepared : {}), messages };
    },
    async captureProviderResponse(payload) {
      telemetry.mark('provider-response');
      if (typeof original?.captureProviderResponse === 'function') return original.captureProviderResponse(payload);
      return undefined;
    },
    get compactions() { return compactions; },
  };
  if (typeof original?.infer === 'function') hooks.infer = (...args) => original.infer(...args);
  return hooks;
}

export async function talosLavora(input = {}) {
  const telemetry = creaTelemetriaStallo();
  const calls = new Map();
  const extraUsage = { prompt_tokens: 0, completion_tokens: 0, cached_tokens: 0, giri: 0 };
  const explicitTestCommand = typeof input.comandoProva === 'string'
    && input.comandoProva.trim().length > 0
    && !DEFAULT_NPM_TEST.test(input.comandoProva.trim());
  const command = await comandoProvaDesktop({
    cartella: input.cartella,
    comandoProva: input.comandoProva ?? 'npm test',
    esplicito: explicitTestCommand,
  });
  const onGiro = wrapOnGiro(input.onGiro, { cartella: input.cartella, telemetry, calls });
  const contextHooks = wrapContextHooks(input.contextHooks, {
    cartella: input.cartella,
    modello: input.modello,
    chiave: input.chiave,
    fetchDiRete: input.fetchDiRete,
    segnaleStop: input.segnaleStop,
    telemetry,
    extraUsage,
    emitOnGiro: onGiro,
  });
  const onDelta = wrapOnDelta(input.onDelta, telemetry);

  try {
    telemetry.mark('kernel-running');
    const result = await kernel.talosLavora({
      ...input,
      comandoProva: command,
      contextHooks,
      onGiro,
      onDelta,
    });
    const usage = mergeUsage(result?.usage, extraUsage);
    const compattazioni = Number(result?.compattazioni ?? 0) + contextHooks.compactions;
    if (!usage) return { ...result, compattazioni };
    return {
      ...result,
      usage,
      compattazioni,
      fuori: `${String(result?.detto ?? '').trim()}\n${JSON.stringify({ usage })}`.trim(),
    };
  } finally {
    telemetry.close();
  }
}
