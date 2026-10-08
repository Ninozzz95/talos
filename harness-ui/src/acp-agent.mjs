// P-L · ACP v1, schema SDK v1.4.0, ricerca 12/09/2026 nel rapporto P-L.
// Il trasporto MIT @modelcontextprotocol/client 2.0.0 possiede spawn/framing/kill.
import { StdioClientTransport, getDefaultEnvironment, DEFAULT_INHERITED_ENV_VARS } from '@modelcontextprotocol/client/stdio';
import { isAbsolute } from 'node:path';
import { statSync } from 'node:fs';
import { z } from 'zod';
import { ENV_AGENTE_ESTERNO } from './config.mjs';
import { classificaErroreDiCorsa } from './research-orchestrator.mjs';
import { eUnaCredenziale } from './kernel/talosHarness.mjs';

export const VERSIONE_PROTOCOLLO_ACP = 1;
const LIMITE = 1_048_576;
const messaggiErrore = {
  ACP_RUNTIME_INVALID: "Check the external agent’s command, arguments, folder and declared variables.",
  ACP_NOT_CONFIGURED: "Set up the external agent on this computer before choosing it.",
  ACP_VERSION_UNSUPPORTED: "The external agent uses an unsupported communication version.",
  ACP_PROTOCOL_INVALID: "The external agent sent an invalid response.",
  ACP_PROCESS_EXITED: "The external agent’s response was interrupted: the process closed.",
  ACP_START_FAILED: "Could not start the external agent. Check the installed program.",
  ACP_TIMEOUT: "The external agent exceeded the configured time limit.",
  ACP_REQUEST_FAILED: "The external agent rejected the request. Check its access and configuration.",
  ACP_REQUEST_UNSUPPORTED: "The external agent accepts the default model and text conversations here. Disable tools, attachments and additional generation options.",
  ACP_CANCELLED: "External agent stopped on request.",
  ACP_BUSY: "The external agent is already responding.",
  ACP_CLOSE_FAILED: "The external agent’s shutdown was not confirmed.",
};
const CHIAVI_ERRORI_ACP = Object.freeze({
  ACP_RUNTIME_INVALID: 'server.acp.runtimeInvalid',
  ACP_NOT_CONFIGURED: 'server.acp.notConfigured',
  ACP_VERSION_UNSUPPORTED: 'server.acp.versionUnsupported',
  ACP_PROTOCOL_INVALID: 'server.acp.protocolInvalid',
  ACP_PROCESS_EXITED: 'server.acp.processExited',
  ACP_START_FAILED: 'server.acp.startFailed',
  ACP_TIMEOUT: 'server.acp.timeout',
  ACP_REQUEST_FAILED: 'server.acp.requestFailed',
  ACP_REQUEST_UNSUPPORTED: 'server.acp.requestUnsupported',
  ACP_CANCELLED: 'server.acp.cancelled',
  ACP_BUSY: 'server.acp.busy',
  ACP_CLOSE_FAILED: 'server.acp.closeFailed',
});
const ATTIVITA_ACP = Object.freeze({
  pending: Object.freeze({ testo: "External agent activity waiting.", testoChiave: 'server.acp.activity.pending' }),
  in_progress: Object.freeze({ testo: "External agent activity in progress.", testoChiave: 'server.acp.activity.inProgress' }),
  completed: Object.freeze({ testo: "External agent activity completed.", testoChiave: 'server.acp.activity.completed' }),
  failed: Object.freeze({ testo: "External agent activity failed.", testoChiave: 'server.acp.activity.failed' }),
  updated: Object.freeze({ testo: "External agent activity updated.", testoChiave: 'server.acp.activity.updated' }),
});
const segniBc44 = { ACP_PROCESS_EXITED: 'unexpected eof', ACP_START_FAILED: 'connection refused',
  ACP_TIMEOUT: 'timeout', ACP_CANCELLED: 'stopped on request', ACP_PROTOCOL_INVALID: 'invalid request',
  ACP_REQUEST_UNSUPPORTED: 'invalid request', ACP_REQUEST_FAILED: 'invalid request' };

export class AcpAgentError extends Error {
  constructor(code) {
    super(messaggiErrore[code] ?? messaggiErrore.ACP_PROTOCOL_INVALID);
    this.name = 'AcpAgentError';
    this.code = code;
    this.chiave = CHIAVI_ERRORI_ACP[code] ?? CHIAVI_ERRORI_ACP.ACP_PROTOCOL_INVALID;
    Object.assign(this, classificaErroreDiCorsa({ messaggio: segniBc44[code] ?? '' }));
  }
}
const errore = code => new AcpAgentError(code);
const testo = z.string().max(LIMITE);
const runtimeSchema = z.object({
  comando: z.string().min(1).max(4096), argomenti: z.array(z.string().max(4096)).max(64).default([]),
  cwd: z.string().min(1).max(4096), variabiliAmbiente: z.array(z.string().regex(/^[A-Z][A-Z0-9_]*$/u)).max(32).default([]),
  /*
   * ⛔ P0 · punto 7 (16/09/2026) — il default era 180_000, gli stessi tre minuti scritti a mano che
   * il kernel aveva sulla fetch del modello. Un agente esterno che ragiona (Claude Code, Codex,
   * Gemini CLI via ACP) supera i tre minuti su un compito serio senza essere guasto.
   * ⛔ Resta una deadline TOTALE, non un'inattività: il protocollo ACP qui è a messaggi, non a
   *   byte, e trasformarlo in inattività vuole toccare il ciclo delle notifiche — fuori dal
   *   perimetro di questa corsia, e dichiarato nel rapporto come limite noto. Il default sale
   *   all'unica soglia che il prodotto conosce (il failsafe di generazione, 30 min) invece di
   *   restare un secondo numero arbitrario; chi vuole meno lo scrive nella configurazione.
   */
  timeoutMs: z.number().int().min(50).max(3_600_000).default(1_800_000),
}).strict();
const variabiliEseguibili = /^(?:NODE_OPTIONS|NODE_PATH|LD_.*|DYLD_.*|PYTHONPATH|PYTHONHOME|BASH_ENV|ENV|COMSPEC|PATHEXT)$/u;

/** Solo configurazione dell'operatore: mai derivata dal prompt o da output remoti. */
export function validaRuntimeAgenteEsterno(runtime, { env = process.env } = {}) {
  const r = runtimeSchema.safeParse(runtime);
  if (!r.success) throw errore('ACP_RUNTIME_INVALID');
  const c = r.data;
  if (!isAbsolute(c.comando) || !isAbsolute(c.cwd) || /[\r\n\0]/u.test(c.comando + c.cwd)
    || c.argomenti.some(a => /[\r\n\0]/u.test(a) || (a.startsWith('-') && eUnaCredenziale(a.split('=')[0].replaceAll('-', '_'))))
    || c.variabiliAmbiente.some(n => variabiliEseguibili.test(n) || DEFAULT_INHERITED_ENV_VARS.some(k => k.toUpperCase() === n))
    || new Set(c.variabiliAmbiente).size !== c.variabiliAmbiente.length) throw errore('ACP_RUNTIME_INVALID');
  try { if (!statSync(c.cwd).isDirectory() || !statSync(c.comando).isFile()) throw errore('ACP_RUNTIME_INVALID'); }
  catch { throw errore('ACP_RUNTIME_INVALID'); }
  // .cmd/.bat richiedono una shell su Windows: si configura il vero binario o node + script.
  if (/\.(?:cmd|bat)$/iu.test(c.comando)) throw errore('ACP_RUNTIME_INVALID');
  for (const [nome, valore] of Object.entries(env)) {
    if (eUnaCredenziale(nome) && typeof valore === 'string' && valore
      && [c.comando, c.cwd, ...c.argomenti].some(a => a.includes(valore))) throw errore('ACP_RUNTIME_INVALID');
  }
  for (const nome of c.variabiliAmbiente) {
    const valore = env[nome];
    if (typeof valore !== 'string' || !valore || /[\r\n\0]/u.test(valore)
      || [c.comando, c.cwd, ...c.argomenti].some(a => a.includes(valore))) throw errore('ACP_RUNTIME_INVALID');
  }
  return Object.freeze({ ...c, argomenti: Object.freeze(c.argomenti), variabiliAmbiente: Object.freeze(c.variabiliAmbiente) });
}

/** Il runtime applicativo prevale; la variabile contiene JSON non segreto, mai valori di chiavi. */
export function leggiRuntimeAgenteEsterno(runtime, { env = process.env } = {}) {
  // P-L-bis: una preferenza presente ma invalida non ripiega su un altro agente.
  if (runtime?.agente != null) return validaRuntimeAgenteEsterno(runtime.agente, { env });
  if (runtime?.comando) return validaRuntimeAgenteEsterno(runtime, { env });
  if (!env[ENV_AGENTE_ESTERNO]) throw errore('ACP_NOT_CONFIGURED');
  try { return validaRuntimeAgenteEsterno(JSON.parse(env[ENV_AGENTE_ESTERNO]), { env }); }
  catch { throw errore('ACP_RUNTIME_INVALID'); }
}

const inizializzazioneSchema = z.object({ protocolVersion: z.number().int(),
  agentInfo: z.object({ name: z.string(), title: z.string().optional(), version: z.string() }).nullish(),
});
const fineSchema = z.object({ stopReason: z.enum(['end_turn', 'max_tokens', 'max_turn_requests', 'refusal', 'cancelled']) });
const testoSchema = z.object({ type: z.literal('text'), text: testo });
const notificaSchema = z.object({ sessionId: z.string(), update: z.object({ sessionUpdate: z.string() }).passthrough() });
const permessoSchema = z.object({ sessionId: z.string(), toolCall: z.object({ toolCallId: z.string() }),
  options: z.array(z.object({ optionId: z.string(), name: z.string(), kind: z.enum(['allow_once', 'allow_always', 'reject_once', 'reject_always']) })).max(64) });

function leggi(schema, dato) {
  const r = schema.safeParse(dato);
  if (!r.success) throw errore('ACP_PROTOCOL_INVALID');
  return r.data;
}

async function entro(promessa, ms, scaduta) {
  let timer;
  try { return await Promise.race([promessa, new Promise((resolve, reject) => {
    timer = setTimeout(() => scaduta ? reject(scaduta) : resolve(), ms);
  })]); } finally { clearTimeout(timer); }
}

/** Connessione singola, prompt seriali. Callback in ordine; niente filesystem/terminali/MCP. */
export async function connettiAgenteAcp(runtime, { signal, env = process.env, onEvento = () => {}, soloInizializzazione = false } = {}) {
  const config = validaRuntimeAgenteEsterno(runtime, { env });
  if (signal?.aborted) throw errore('ACP_CANCELLED');
  const ambiente = { ...getDefaultEnvironment() };
  for (const n of config.variabiliAmbiente) ambiente[n] = env[n];
  const transport = new StdioClientTransport({ command: config.comando, args: config.argomenti,
    cwd: config.cwd, env: ambiente, stderr: 'pipe', maxBufferSize: LIMITE });
  transport.stderr.resume(); // stderr consumato senza log, anche in caso di avvio fallito.
  let sessionId, pid, nome = 'Agente esterno', sequenza = 0, guasto, chiusura, fermata, occupato = false;
  let chiuso = false, avviato = false, coda = Promise.resolve();
  let risolviChiuso;
  const fineProcesso = new Promise(resolve => { risolviChiuso = resolve; });
  const pendenti = new Map();
  function respingi(e) {
    guasto ??= e;
    for (const p of pendenti.values()) { clearTimeout(p.timer); p.reject(guasto); }
    pendenti.clear();
  }
  function fallisci(e) { respingi(e); void chiudi().catch(() => {}); }
  async function chiudi() {
    if (chiusura) return chiusura;
    chiusura = (async () => {
      signal?.removeEventListener('abort', suStop);
      respingi(guasto ?? errore('ACP_CANCELLED'));
      await transport.close();
      if (pid && !chiuso) await entro(fineProcesso, 5000, errore('ACP_CLOSE_FAILED'));
    })();
    return chiusura;
  }
  async function invia(m) {
    try { await transport.send({ jsonrpc: '2.0', ...m }); }
    catch { throw guasto ?? errore('ACP_PROCESS_EXITED'); }
  }
  function richiesta(method, params) {
    if (guasto) return Promise.reject(guasto);
    const id = ++sequenza;
    const p = new Promise((resolve, reject) => {
      const timer = setTimeout(() => fallisci(errore('ACP_TIMEOUT')), config.timeoutMs);
      pendenti.set(id, { resolve, reject, timer });
    });
    void invia({ id, method, params }).catch(fallisci);
    return p;
  }
  async function cancel() {
    if (fermata) return fermata;
    fermata = (async () => {
      if (sessionId && !chiuso) {
        try { await invia({ method: 'session/cancel', params: { sessionId } }); }
        catch { /* la chiusura resta obbligatoria */ }
        // Finestra di grazia configurata, non una misura di latenza.
        await entro(fineProcesso, 150);
      }
      respingi(errore('ACP_CANCELLED'));
      await chiudi();
    })();
    return fermata;
  }
  function suStop() { void cancel().catch(() => {}); }
  async function emetti(tipo, valore) { await onEvento(Object.freeze({ tipo, ...valore })); }
  async function ricevi(m) {
    if (chiusura) return;
    if (m.method) {
      if (m.method === 'session/update' && m.id === undefined) {
        const p = leggi(notificaSchema, m.params);
        if (!sessionId || p.sessionId !== sessionId || !occupato) throw errore('ACP_PROTOCOL_INVALID');
        const u = p.update;
        if (u.sessionUpdate === 'agent_message_chunk' || u.sessionUpdate === 'agent_thought_chunk') {
          const c = leggi(testoSchema, u.content);
          await emetti(u.sessionUpdate === 'agent_message_chunk' ? 'testo' : 'ragionamento', { testo: c.text });
        } else if (['tool_call', 'tool_call_update'].includes(u.sessionUpdate)) {
          const t = leggi(z.object({ toolCallId: z.string(), status: z.enum(['pending', 'in_progress', 'completed', 'failed']).nullish() }), u);
          await emetti('attivita', ATTIVITA_ACP[t.status] ?? ATTIVITA_ACP.updated);
        } else {
          // Nessuna estrazione di rawInput/rawOutput, percorsi o istruzioni dai metadati.
          await emetti('avviso', { testo: "The external agent sent an additional update that cannot be represented in this conversation.", testoChiave: 'server.acp.notice.additionalUpdate' });
        }
      } else if (m.id !== undefined) {
        if (m.method === 'session/request_permission') {
          const p = leggi(permessoSchema, m.params);
          if (p.sessionId !== sessionId || !occupato) throw errore('ACP_PROTOCOL_INVALID');
          const rifiuto = p.options.find(o => o.kind === 'reject_once');
          const outcome = !fermata && rifiuto ? { outcome: 'selected', optionId: rifiuto.optionId } : { outcome: 'cancelled' };
          await invia({ id: m.id, result: { outcome } });
          await emetti('avviso', { testo: "External agent operation rejected: permission confirmation is not available here.", testoChiave: 'server.acp.notice.permissionDenied' });
        } else {
          await invia({ id: m.id, error: { code: -32601, message: 'Operation not available in this conversation.' } });
          await emetti('avviso', { testo: "The operation requested by the external agent was rejected because it is not available in this conversation.", testoChiave: 'server.acp.notice.operationUnavailable' });
        }
      }
      return;
    }
    const p = pendenti.get(m.id);
    if (!p) throw errore('ACP_PROTOCOL_INVALID');
    pendenti.delete(m.id); clearTimeout(p.timer);
    if (m.error) p.reject(errore('ACP_REQUEST_FAILED'));
    else p.resolve(m.result);
  }
  transport.onmessage = m => { coda = coda.then(() => ricevi(m)).catch(e => fallisci(e instanceof AcpAgentError ? e : errore('ACP_PROTOCOL_INVALID'))); };
  transport.onerror = () => fallisci(errore(avviato ? 'ACP_PROTOCOL_INVALID' : 'ACP_START_FAILED'));
  transport.onclose = () => {
    chiuso = true; risolviChiuso();
    // Lascia consumare i messaggi già consegnati dal parser prima dell'EOF.
    void coda.then(() => { if (!chiusura) fallisci(errore('ACP_PROCESS_EXITED')); });
  };
  try {
    await transport.start();
    avviato = true; pid = transport.pid;
    signal?.addEventListener('abort', suStop, { once: true });
    if (signal?.aborted) { await cancel(); throw errore('ACP_CANCELLED'); }
    const init = leggi(inizializzazioneSchema, await richiesta('initialize', {
      protocolVersion: VERSIONE_PROTOCOLLO_ACP, clientCapabilities: {},
      clientInfo: { name: 'talos', title: 'TALOS', version: '1.0.0' },
    }));
    if (init.protocolVersion !== VERSIONE_PROTOCOLLO_ACP) throw errore('ACP_VERSION_UNSUPPORTED');
    nome = (init.agentInfo?.title || init.agentInfo?.name || nome).slice(0,120);
    // P-L-bis: il nome remoto è testo pubblico, non un canale per valori d'ambiente.
    for (const [k, v] of Object.entries(env)) if ((eUnaCredenziale(k) || config.variabiliAmbiente.includes(k)) && v) nome = nome.replaceAll(v, '[omesso]');
    nome = nome.replace(/[\p{Cc}\p{Cf}]/gu, '').trim() || 'Agente esterno';
    if (soloInizializzazione) return Object.freeze({ pid, nome, chiudi });
    sessionId = leggi(z.object({ sessionId: z.string().min(1).max(4096) }), await richiesta('session/new', { cwd: config.cwd, mcpServers: [] })).sessionId;
    return Object.freeze({ pid, sessionId, nome, cancel, chiudi,
      async prompt(contenuti) {
        if (occupato) throw errore('ACP_BUSY');
        if (guasto) throw guasto;
        const p = leggi(z.array(testoSchema).min(1).max(256), contenuti);
        occupato = true;
        try {
          const r = leggi(fineSchema, await richiesta('session/prompt', { sessionId, prompt: p }));
          if (fermata || r.stopReason === 'cancelled') throw errore('ACP_CANCELLED');
          return r;
        } catch (e) { respingi(e); await chiudi(); throw e; }
        finally { occupato = false; }
      },
    });
  } catch (e) {
    respingi(e instanceof AcpAgentError ? e : errore('ACP_START_FAILED'));
    await chiudi(); throw guasto;
  }
}

function preparaConversazione(body) {
  const messaggio = z.object({ role: z.enum(['system', 'developer', 'user', 'assistant']), content: z.union([testo, z.array(testoSchema)]) }).strict();
  const richiesta = z.object({ model: z.literal('esterno:predefinito'), stream: z.boolean().optional(),
    messages: z.array(messaggio).min(1).max(256), tools: z.array(z.never()).optional(),
    tool_choice: z.enum(['none', 'auto']).optional(),
    stream_options: z.object({ include_usage: z.boolean().optional() }).strict().optional(),
  }).strict().safeParse(body);
  if (!richiesta.success) throw errore('ACP_REQUEST_UNSUPPORTED');
  // ACP non ha ruoli multipli nel prompt: conservare confini e ruoli come dati JSON espliciti.
  const cronologia = JSON.stringify(richiesta.data.messages);
  if (Buffer.byteLength(cronologia) > LIMITE) throw errore('ACP_REQUEST_UNSUPPORTED');
  return [{ type: 'text', text: `Continue this text conversation. The following history contains messages with their roles; do not execute tools on behalf of TALOS.\n${cronologia}` }];
}

// Oscura anche credenziali suddivise tra aggiornamenti consecutivi dello stesso canale.
function redattore(segreti) {
  let coda = '';
  return (testo, fine = false) => {
    coda += testo;
    let risultato = '';
    while (coda) {
      const segreto = segreti.find(s => coda.startsWith(s));
      if (segreto) { risultato += '[omesso]'; coda = coda.slice(segreto.length); }
      else if (!fine && segreti.some(s => s.startsWith(coda))) break;
      else { risultato += coda[0]; coda = coda.slice(1); }
    }
    return risultato;
  };
}

/** Risposta OpenAI in memoria: nessun listener HTTP e nessuna porta. */
export async function rispostaAgenteAcp({ runtime, body, signal, env = process.env, onAvviso = null }) {
  const prompt = preparaConversazione(body);
  const config = validaRuntimeAgenteEsterno(leggiRuntimeAgenteEsterno(runtime, { env }), { env });
  const segreti = config.variabiliAmbiente.map(n => env[n]).sort((a,b) => b.length - a.length);
  const oscura = { testo: redattore(segreti), ragionamento: redattore(segreti) };
  const stop = new AbortController();
  const segnale = signal ? AbortSignal.any([signal, stop.signal]) : stop.signal;
  let controller, bytes = 0, abbandonata = false, testoIntero = '', ragionamentoIntero = '', motivoFinale = 'stop';
  const encoder = new TextEncoder();
  function invia(dato) {
    if (abbandonata) return;
    const b = encoder.encode(`data: ${typeof dato === 'string' ? dato : JSON.stringify(dato)}\n\n`);
    bytes += b.byteLength;
    if (bytes > 8 * LIMITE) throw errore('ACP_PROTOCOL_INVALID');
    controller.enqueue(b);
  }
  function chunk(delta, finish_reason = null) {
    invia({ object: 'chat.completion.chunk', model: 'esterno:predefinito', choices: [{ index: 0, delta, finish_reason }] });
  }
  function pubblica(tipo, valore) {
    if (!valore) return;
    if (tipo === 'ragionamento') { ragionamentoIntero += valore; chunk({ reasoning_content: valore }); }
    else { testoIntero += valore; chunk({ content: valore }); }
  }
  const stream = new ReadableStream({
    start(c) { controller = c; },
    async cancel() { abbandonata = true; stop.abort(); await agente?.cancel(); await agente?.chiudi(); },
  });
  const agente = await connettiAgenteAcp(config, { signal: segnale, env, async onEvento(e) {
    if (e.tipo === 'testo' || e.tipo === 'ragionamento') pubblica(e.tipo, oscura[e.tipo](e.testo));
    else {
      pubblica('testo', oscura.testo('', true));
      pubblica('ragionamento', oscura.ragionamento('', true));
      // K4b: il callback desktop conserva la chiave nell'evento persistito; la CLI legacy mantiene la riserva inglese.
      if (typeof onAvviso === 'function') await onAvviso(e);
      else pubblica('testo', `\n[${e.testo}]\n`);
    }
  } });
  const conclusione = (async () => {
    try {
      const fine = await agente.prompt(prompt);
      await agente.chiudi();
      pubblica('testo', oscura.testo('', true));
      pubblica('ragionamento', oscura.ragionamento('', true));
      motivoFinale = ['max_tokens', 'max_turn_requests'].includes(fine.stopReason) ? 'length' : fine.stopReason === 'refusal' ? 'content_filter' : 'stop';
      chunk({}, motivoFinale);
      invia('[DONE]');
      if (!abbandonata) controller.close();
    } catch (e) {
      await agente.chiudi();
      if (!abbandonata) controller.error(e);
      throw e;
    }
  })();
  // Lo stream consegna l'errore al lettore; la promessa non può restare unhandled.
  void conclusione.catch(() => {});
  if (body.stream === false) {
    // Consuma il flusso interno, così errore e abbandono hanno un unico proprietario.
    await new Response(stream).text(); await conclusione;
    return Response.json({ object: 'chat.completion', model: body.model,
      choices: [{ index: 0, message: { role: 'assistant', content: testoIntero,
        ...(ragionamentoIntero ? { reasoning_content: ragionamentoIntero } : {}) }, finish_reason: motivoFinale }] });
  }
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' } });
}
