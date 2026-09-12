import { generateText, streamText, jsonSchema, stepCountIs } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';

import { ID_NATIVI_SDK } from './provider-registry.mjs';
import { tokenDaCache, tokenScrittiInCache } from './usage-cache.mjs';

// Only this adapter knows the SDK message format. The kernel owns tool execution.
export function stripNativeMetadata(messages) {
  return messages.map(({ talos_provider_state, ...message }) => message);
}

export function toNativeMessages(messages, { provider, model }) {
  const toolNames = new Map(messages.flatMap(m => (m.tool_calls ?? []).map(t => [t.id, t.function.name])));
  return messages.map(message => {
    if (message.role === 'system' || message.role === 'developer') return { role: 'system', content: message.content };
    if (message.role === 'tool') {
      const toolName = toolNames.get(message.tool_call_id);
      if (!toolName) throw new Error('Risultato di strumento senza chiamata corrispondente.');
      return { role: 'tool', content: [{ type: 'tool-result', toolCallId: message.tool_call_id, toolName, output: { type: 'text', value: typeof message.content === 'string' ? message.content : JSON.stringify(message.content) } }] };
    }
    const state = message.talos_provider_state;
    if (message.role === 'assistant' && state?.version === 1 && state.provider === provider && state.model === model && Array.isArray(state.content)) {
      return { role: 'assistant', content: structuredClone(state.content) };
    }
    const content = [];
    if (typeof message.content === 'string' && message.content) content.push({ type: 'text', text: message.content });
    else if (Array.isArray(message.content)) for (const part of message.content) {
      if (part.type === 'text') content.push({ type: 'text', text: part.text });
      else if (part.type === 'image_url') {
        // The upload resolver already verified these bytes. Never let SDK download arbitrary URLs.
        if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/u.test(part.image_url?.url ?? '')) throw new Error('Riferimento immagine non risolto o non consentito.');
        content.push({ type: 'file', data: part.image_url.url, mediaType: part.image_url.url.slice(5, part.image_url.url.indexOf(';')) });
      } else throw new Error(`Contenuto non supportato dal provider: ${part.type}`);
    }
    for (const call of message.tool_calls ?? []) content.push({ type: 'tool-call', toolCallId: call.id, toolName: call.function.name, input: JSON.parse(call.function.arguments) });
    return { role: message.role, content };
  });
}

/*
 * ⛔⛔ 12/09 — P-B: QUESTO LETTORE CONOSCEVA UN NOME SOLO.
 *
 * `usage.inputTokenDetails?.cacheReadTokens` è il nome che l'AI SDK espone quando l'adattatore
 * fissato nel lock mappa il campo nativo. Quando NON lo mappa — ed è ❓ non verificato che lo
 * faccia per `cachedContentTokenCount` di Gemini (§7.8 dell'inventario) — qui usciva `undefined`,
 * che a valle diventa zero: «non dichiarato» scritto come «nessuno», che è la lezione del 22/8.
 *
 * ⇒ Prima si chiede all'SDK, poi si chiede al fornitore con TUTTI i nomi che quel wire può usare
 *   (`usage-cache.mjs`, alimentato dal record). Un nome in più non fa mai danno; uno in meno fa
 *   sparire il 93% del costo dal pannello.
 */
function canonicalUsage(usage = {}, provider) {
  const dallSdk = Number.isFinite(usage.inputTokenDetails?.cacheReadTokens) ? usage.inputTokenDetails.cacheReadTokens : null;
  const letti = dallSdk ?? tokenDaCache(usage, provider);
  const scritti = Number.isFinite(usage.inputTokenDetails?.cacheWriteTokens)
    ? usage.inputTokenDetails.cacheWriteTokens
    : tokenScrittiInCache(usage, provider);
  return {
    prompt_tokens: usage.inputTokens,
    completion_tokens: usage.outputTokens,
    total_tokens: usage.totalTokens,
    prompt_tokens_details: {
      /* ⛔ `undefined` e non `null` quando non si sa: è la forma che questo campo ha sempre avuto,
         e i lettori a valle distinguono già «assente» da «zero». */
      cached_tokens: letti ?? undefined,
      ...(scritti !== null && scritti !== undefined ? { cache_write_tokens: scritti } : {}),
    },
    completion_tokens_details: { reasoning_tokens: usage.outputTokenDetails?.reasoningTokens },
  };
}

function responseMessage(response, provider, model, finishReason) {
  if (!['stop', 'tool-calls'].includes(finishReason)) {
    const error = new Error(`Risposta ${provider} incompleta (${finishReason}). Riprova: la cronologia precedente è conservata.`);
    error.code = 'NATIVE_RESPONSE_INCOMPLETE';
    throw error;
  }
  const assistant = response.messages.findLast(m => m.role === 'assistant');
  const content = assistant?.content ?? [];
  const text = content.filter(p => p.type === 'text').map(p => p.text).join('');
  const calls = content.filter(p => p.type === 'tool-call').map(p => ({ id: p.toolCallId, type: 'function', function: { name: p.toolName, arguments: JSON.stringify(p.input) } }));
  const reasoning = content.filter(p => p.type === 'reasoning').map(p => p.text).join('');
  return {
    role: 'assistant', content: text || null,
    ...(calls.length ? { tool_calls: calls } : {}),
    ...(reasoning ? { reasoning_content: reasoning } : {}),
    // Incomplete signatures must never become a checkpoint for the next request.
    ...(['stop', 'tool-calls'].includes(finishReason) ? { talos_provider_state: { version: 1, provider, model, content } } : {}),
  };
}

export async function nativeProviderResponse({ provider, model, apiKey, baseURL, body, fetchFn = fetch, signal }) {
  signal?.throwIfAborted();
  /* ⛔ 12/09 — P-A: la mappa resta (un pacchetto npm non si deriva da un dato), ma il registro
     dichiara CHI passa di qui: se le due divergono, si ferma subito invece di costruire un client
     per un fornitore che il resto del sistema instrada altrove. Il test di parità le confronta. */
  const factory = {anthropic: createAnthropic, gemini: createGoogleGenerativeAI, openai: createOpenAI}[provider];
  if (!factory || !ID_NATIVI_SDK.includes(provider)) throw new Error('Provider nativo non riconosciuto.');
  const client = factory({ apiKey, ...(baseURL ? { baseURL } : {}), fetch: fetchFn });
  const languageModel = provider === 'openai' ? client.responses(model) : client.chat(model);
  const tools = Object.fromEntries((body.tools ?? []).map(t => [t.function.name, { description: t.function.description, inputSchema: jsonSchema(t.function.parameters) }]));
  const effort = body.reasoning_effort ?? body.reasoning?.effort;
  const providerOptions = provider === 'openai' ? { openai: { store: false, include: ['reasoning.encrypted_content'] } } : {};
  const nativeMessages = toNativeMessages(body.messages, { provider, model });
  // SDK common reasoning maps support/model differences in the pinned adapters.
  const common = {
    model: languageModel, messages: nativeMessages.filter(m => m.role !== 'system'),
    instructions: nativeMessages.filter(m => m.role === 'system'),
    ...(Object.keys(tools).length ? { tools } : {}),
    ...(body.tool_choice ? { toolChoice: typeof body.tool_choice === 'string' ? body.tool_choice : { type: 'tool', toolName: body.tool_choice.function.name } } : {}),
    ...(body.temperature != null ? { temperature: body.temperature } : {}),
    ...(body.top_p != null ? { topP: body.top_p } : {}),
    ...(body.stop ? { stopSequences: Array.isArray(body.stop) ? body.stop : [body.stop] } : {}),
    ...(effort ? { reasoning: effort } : {}),
    maxOutputTokens: body.max_completion_tokens ?? body.max_tokens ?? 8192,
    providerOptions, maxRetries: 0, stopWhen: stepCountIs(1), abortSignal: signal,
    // The caller owns retries, stop, tools and traces. No telemetry or automatic downloads.
    experimental_download: async urls => { if (urls.length) throw new Error('Download implicito di immagini non consentito.'); return []; },
  };
  if (!body.stream) {
    const result = await generateText(common);
    return Response.json({ choices: [{ index: 0, message: responseMessage(result.response, provider, model, result.finishReason), finish_reason: result.finishReason === 'tool-calls' ? 'tool_calls' : result.finishReason }], usage: canonicalUsage(result.usage, provider) });
  }
  const abort = new AbortController();
  const combinedSignal = signal ? AbortSignal.any([signal, abort.signal]) : abort.signal;
  const result = streamText({ ...common, abortSignal: combinedSignal, onError: () => {} });
  const encoder = new TextEncoder();
  const iterator = result.fullStream[Symbol.asyncIterator]();
  const callIndices = new Map();
  let completed = false;
  const stream = new ReadableStream({
    async pull(controller) {
      const emit = (delta, extra = {}, finishReason) => controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ index: 0, delta, ...(finishReason ? { finish_reason: finishReason === 'tool-calls' ? 'tool_calls' : finishReason } : {}) }], ...extra })}\n\n`));
      try {
        while (!completed) {
          const { value: part, done } = await iterator.next();
          if (done) throw new Error('Flusso del provider interrotto prima della conclusione.');
          if (part.type === 'error') throw part.error;
          if (part.type === 'abort') throw new Error('Risposta annullata.');
          if (part.type === 'text-delta') { emit({ content: part.text }); return; }
          if (part.type === 'reasoning-delta') { emit({ reasoning_content: part.text }); return; }
          if (part.type === 'tool-input-start') {
            callIndices.set(part.id, callIndices.size);
            emit({ tool_calls: [{ index: callIndices.get(part.id), id: part.id, type: 'function', function: { name: part.toolName, arguments: '' } }] }); return;
          }
          if (part.type === 'tool-input-delta') { emit({ tool_calls: [{ index: callIndices.get(part.id), function: { arguments: part.delta } }] }); return; }
          if (part.type === 'tool-call' && part.invalid) throw part.error ?? new Error('Argomenti dello strumento non validi.');
          if (part.type === 'finish') {
            const message = responseMessage(await result.response, provider, model, part.finishReason);
            emit(message.talos_provider_state ? { talos_provider_state: message.talos_provider_state } : {}, { usage: canonicalUsage(part.totalUsage, provider) }, part.finishReason);
            controller.enqueue(encoder.encode('data: [DONE]\n\n')); completed = true; controller.close(); return;
          }
        }
      } catch (error) { completed = true; abort.abort(); controller.error(error); }
    },
    async cancel() { completed = true; abort.abort(); await iterator.return?.(); },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
}
