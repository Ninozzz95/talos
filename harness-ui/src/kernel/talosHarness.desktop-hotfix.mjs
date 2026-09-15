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
import { readFile } from 'node:fs/promises';
import { lstatSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

import * as kernel from './talosHarness.mjs';

export * from './talosHarness.mjs';

export const DESKTOP_BLACKBOX_HOTFIX_VERSION = '2026-09-15';
export const NO_TEST_SUITE_CODE = 'NO_TEST_SUITE_CONFIGURED';
export const STALL_DIAGNOSTIC_EVENT = 'desktop-harness-stall';

const STALL_MS_DEFAULT = 45_000;
const SHELL_COMBINED_NOTICE = '[shell output: stdout and stderr combined in arrival order; stream identity is not preserved]';
const SEARCH_INCOMPLETE_NOTICE = 'SEARCH INCOMPLETE: results are partial; missing paths are NOT proof that a file does not exist.';
const POWERSHELL_DIAGNOSTIC = /(?:^|\n)\s*(?:CategoryInfo\s*:|FullyQualifiedErrorId\s*:|At line:\d+|ParserError\b|CommandNotFoundException\b|ObjectNotFound\b|NativeCommandError\b|TerminatingError\b)/im;
const DEFAULT_NPM_TEST = /^npm\s+test(?:\s|$)/i;
const PLACEHOLDER_NPM_TEST = /(?:no test specified|echo\s+["']?error:\s*no test)/i;
const TEST_SENTINEL_MESSAGE = `${NO_TEST_SUITE_CODE}: workspace has no usable npm scripts.test; verification was not run.`;

function toolCallsById(messages) {
  const calls = new Map();
  for (const message of Array.isArray(messages) ? messages : []) {
    for (const call of message?.tool_calls ?? []) {
      if (!call?.id) continue;
      let args = {};
      try { args = JSON.parse(call.function?.arguments || '{}'); } catch { /* malformed calls are handled by the kernel */ }
      calls.set(call.id, { name: call.function?.name ?? '', args });
    }
  }
  return calls;
}

function pathArg(args) {
  for (const key of ['percorso', 'path', 'file_path', 'filePath', 'file', 'filename']) {
    if (typeof args?.[key] === 'string' && args[key].length > 0) return args[key];
  }
  return '';
}

function safeWorkspacePath(root, relativePath) {
  if (typeof root !== 'string' || !root || typeof relativePath !== 'string' || !relativePath) return null;
  const base = resolve(root);
  const candidate = resolve(base, relativePath);
  if (candidate !== base && !candidate.startsWith(base + sep)) return null;
  return candidate;
}

function classifyElencaTarget(cartella, args) {
  const requested = pathArg(args);
  if (!requested) return null;
  const absolute = safeWorkspacePath(cartella, requested);
  if (!absolute) return { type: 'outside', requested };
  try {
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) return { type: 'unreadable', requested };
    if (stat.isFile()) return { type: 'file', requested };
    if (stat.isDirectory()) return { type: 'directory', requested };
    return { type: 'other', requested };
  } catch (error) {
    if (error?.code === 'ENOENT') return { type: 'missing', requested };
    return { type: 'unreadable', requested };
  }
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
    if (!text.includes(SHELL_COMBINED_NOTICE)) text = `${SHELL_COMBINED_NOTICE}\n${text}`;
    if (/^\[shell output:[^\n]+\]\nexit\s+0\b/im.test(text) && POWERSHELL_DIAGNOSTIC.test(text)) {
      text = `⚠ SHELL_DIAGNOSTIC_WITH_ZERO_EXIT: PowerShell emitted a structured error diagnostic even though the process reported exit 0. Treat this command as NOT VERIFIED until the diagnostic is resolved.\n${text}`;
    }
  }

  return text;
}

export function correggiMessaggiDesktop(messages, { cartella } = {}) {
  if (!Array.isArray(messages)) return messages;
  const calls = toolCallsById(messages);
  let changed = false;
  const fixed = messages.map((message) => {
    if (message?.role !== 'tool' || !message.tool_call_id) return message;
    const call = calls.get(message.tool_call_id);
    if (!call) return message;
    const content = correggiEsitoToolDesktop({ ...call, content: message.content, cartella });
    if (content === String(message.content ?? '')) return message;
    changed = true;
    return { ...message, content };
  });
  return changed ? fixed : messages;
}

function nodeCommandForNoTests() {
  const exe = `"${String(process.execPath).replace(/"/g, '""')}"`;
  const script = `console.error('${TEST_SENTINEL_MESSAGE}'); process.exit(2)`;
  return `${exe} -e "${script}"`;
}

export async function comandoProvaDesktop({ cartella, comandoProva, esplicito = false } = {}) {
  if (esplicito || (typeof comandoProva === 'string' && !DEFAULT_NPM_TEST.test(comandoProva.trim()))) return comandoProva;
  if (typeof cartella !== 'string' || !cartella) return nodeCommandForNoTests();
  try {
    const raw = await readFile(join(cartella, 'package.json'), 'utf8');
    const packageJson = JSON.parse(raw);
    const test = packageJson?.scripts?.test;
    if (typeof test === 'string' && test.trim() && !PLACEHOLDER_NPM_TEST.test(test)) return comandoProva;
  } catch {
    // Missing or invalid package.json means the default npm-test contract is not configured.
  }
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

export function creaTelemetriaStallo({
  timeoutMs = Number(process.env.TALOS_DESKTOP_HOTFIX_STALL_MS) || STALL_MS_DEFAULT,
  log = (record) => console.warn(`[desktop-blackbox] ${JSON.stringify(record)}`),
  now = () => Date.now(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  let timer = null;
  let stage = 'starting';
  let since = now();
  let closed = false;

  const arm = () => {
    if (closed || !(timeoutMs > 0)) return;
    if (timer) clearTimer(timer);
    timer = setTimer(() => {
      log({ event: STALL_DIAGNOSTIC_EVENT, stage, stalledMs: Math.max(0, now() - since) });
      timer = null;
      arm();
    }, timeoutMs);
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

function wrapOnGiro(original, { cartella, telemetry, calls }) {
  return (event) => {
    let next = event;
    if (event?.tipo === 'risposta') {
      for (const call of event.risposta?.tool_calls ?? []) {
        if (!call?.id) continue;
        let args = {};
        try { args = JSON.parse(call.function?.arguments || '{}'); } catch { /* kernel handles malformed args */ }
        calls.set(call.id, { name: call.function?.name ?? '', args });
      }
      const names = (event.risposta?.tool_calls ?? []).map((call) => call?.function?.name).filter(Boolean);
      telemetry.mark(names.length ? `tool:${names.join(',')}` : 'assistant-finished');
    } else if (event?.tipo === 'tool-uscita') {
      telemetry.mark('tool-output');
    } else if (event?.tipo === 'tool-esito') {
      const call = calls.get(event.toolCallId);
      const content = call
        ? correggiEsitoToolDesktop({ ...call, content: event.content, cartella })
        : event.content;
      if (content !== event.content) next = { ...event, content };
      telemetry.mark('between-tool-and-provider');
    } else if (event?.tipo === 'ricevuta') {
      telemetry.mark('tool-receipt');
    }
    return original?.(next);
  };
}

function wrapContextHooks(original, {
  cartella, modello, chiave, fetchDiRete, segnaleStop, telemetry, extraUsage,
} = {}) {
  let compacted = null;
  let lastCompactionAttempt = -1;
  let compactions = 0;

  const legacyMode = !original || typeof original.prepare !== 'function';

  const projectLegacy = (rawMessages) => {
    if (!compacted) return rawMessages;
    return [...compacted.messages, ...rawMessages.slice(compacted.rawPrefixLength)];
  };

  const maybeCompactLegacy = async (rawMessages, tools) => {
    if (!legacyMode) return rawMessages;
    let projected = projectLegacy(rawMessages);
    const assistantTurns = rawMessages.filter((message) => message?.role === 'assistant').length;
    if (assistantTurns === lastCompactionAttempt || !kernel.serveCompattare(assistantTurns, projected)) return projected;
    lastCompactionAttempt = assistantTurns;
    const result = await kernel.compattaConversazione(projected, (messages) => kernel.chiamaConRitenta({
      modello,
      chiave,
      messaggi: messages,
      attrezzi: tools,
      ...(fetchDiRete ? { fetchDiRete } : {}),
      ...(segnaleStop ? { segnaleStop } : {}),
    }));
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
      if (typeof original?.capture === 'function') return original.capture(payload);
      return undefined;
    },
    async prepare(payload) {
      telemetry.mark('provider-prepare');
      let prepared;
      if (typeof original?.prepare === 'function') prepared = await original.prepare(payload);
      else prepared = { messages: await maybeCompactLegacy(payload.messages, payload.tools) };
      const messages = correggiMessaggiDesktop(prepared?.messages ?? payload.messages, { cartella });
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
  const contextHooks = wrapContextHooks(input.contextHooks, {
    cartella: input.cartella,
    modello: input.modello,
    chiave: input.chiave,
    fetchDiRete: input.fetchDiRete,
    segnaleStop: input.segnaleStop,
    telemetry,
    extraUsage,
  });
  const onGiro = wrapOnGiro(input.onGiro, { cartella: input.cartella, telemetry, calls });

  try {
    telemetry.mark('kernel-running');
    const result = await kernel.talosLavora({
      ...input,
      comandoProva: command,
      contextHooks,
      onGiro,
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
