/*
 * Tools for the local models whose template does not know them (owner 26/10/2026 notte, 01/11/2026: «Tre compiti su tre, su 5 famiglie»; form in
 * `FORMA-ATTREZZI-EMULATI-2026-11-01.md`, research in `RICERCA-ATTREZZI-EMULATI-2026-10-26.md`). Only pure functions: no network, no state outside what is passed in.
 *
 * What nobody else puts together: decided before the request (goose, `llamacpp/mod.rs:64-111`), the format of the family when the vocabulary has it, and a grammar that
 * starts only after the signal (llama.cpp does it only for the templates it knows, and on the chat route it is not ours: `server-common.cpp:1556` erases the fields).
 * «Constraint Tax» (arXiv 2606.25605) and «Repair, Not Improvement» (2608.13959): a constraint from the first word stops models from calling, and worsens not calling.
 * So free text stays the default, and answering without a tool is always open.
 *
 * How the grammar starts: a PATTERN trigger with a capture group. The engine replays into the grammar from the first group (`llama-grammar.cpp:385-398`), so the JSON
 * schema constrains what follows the signal and the signal itself stays out of it. `json_schema` becomes the grammar in the engine (`server-schema.cpp:276-286`): we write
 * no GBNF. When the schema is finished the grammar leaves only the end of generation (`llama-grammar.cpp`, `allow_eog`): one call per answer, and the closing label may
 * never arrive. The parser does not need it.
 *
 * Performance, 01/11: the text must stay the same byte by byte from one step to the next, or `/completion` reads the whole history again. So the rewriting is deterministic,
 * and an assistant turn goes back exactly as the model wrote it (`testiEsatti`), with its own spacing and its thinking. The bench reads `timings.prompt_n`.
 */

import { randomUUID } from 'node:crypto';

const TIPO_PATTERN = 2; // COMMON_GRAMMAR_TRIGGER_TYPE_PATTERN, `common/common.h:149-152`: the engine reads the number

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

export const FORMATI = Object.freeze({
  etichette: Object.freeze({ id: 'etichette', apre: '<tool_call>', chiude: '</tool_call>', corpoApre: '{', esitoApre: '<tool_response>\n', esitoChiude: '\n</tool_response>', elenco: false }),
  mistral: Object.freeze({ id: 'mistral', apre: '[TOOL_CALLS]', chiude: '', corpoApre: '[', esitoApre: '[TOOL_RESULTS]', esitoChiude: '[/TOOL_RESULTS]', elenco: true }),
});
export const SEGNALI_DA_CERCARE = Object.freeze([FORMATI.etichette.apre, FORMATI.mistral.apre]);

/** `props` of `/props`: only a template that says no. A missing answer is not a no: the request goes as today and the behaviour decides (`BC79`). */
export function haBisognoDiEmulazione(props) {
  return props?.chat_template_caps?.supports_tools === false;
}

/**
 * Owner: «quello della sua famiglia, se c'è». `parolaSola(testo)`: whether the vocabulary holds that text as one token (`/tokenize`, once per model). The generic one uses
 * the same labels as a family of ChatML: they are the best known to a model that was never told.
 */
export function scegliFormato(parolaSola = () => false) {
  const famiglia = parolaSola(FORMATI.mistral.apre) ? FORMATI.mistral : FORMATI.etichette;
  return { ...famiglia, nelVocabolario: parolaSola(famiglia.apre) };
}

const soloFunzioni = (tools) => (Array.isArray(tools) ? tools.filter((t) => t?.type === 'function' && typeof t.function?.name === 'string' && t.function.name) : []);

export function schemaDegliAttrezzi(tools, formato) {
  const una = { anyOf: soloFunzioni(tools).map(({ function: f }) => ({ type: 'object', properties: { name: { const: f.name }, arguments: f.parameters && Object.keys(f.parameters).length ? f.parameters : { type: 'object' } }, required: ['name', 'arguments'], additionalProperties: false })) };
  return formato.elenco ? { type: 'array', items: una, minItems: 1, maxItems: 1 } : una;
}

const chiamataScritta = (nome, argomenti, formato) => {
  const corpo = `{"name":${JSON.stringify(nome)},"arguments":${argomenti}}`;
  return `${formato.apre}${formato.elenco ? `[${corpo}]` : corpo}${formato.chiude}`;
};

/** In the system message. The order of the tools is the one of the request: the text does not move between steps. */
export function istruzioni(tools, formato) {
  const elenco = soloFunzioni(tools).map(({ function: f }) => JSON.stringify({ name: f.name, description: f.description ?? '', parameters: f.parameters ?? { type: 'object' } })).join('\n');
  return `You can use tools. They are listed here, one per line, as JSON:\n${elenco}\n\nTo use one, write exactly this, and nothing after it:\n${chiamataScritta('tool_name', '{"argument":"value"}', formato)}\nOne tool at a time. Its result comes back in the next message. If no tool is needed, just answer.`;
}

const testoDi = (contenuto) => (typeof contenuto === 'string' ? contenuto : Array.isArray(contenuto) ? contenuto.filter((p) => p?.type === 'text').map((p) => p.text ?? '').join('') : '');

const argomentiDi = (c) => {
  const a = c?.function?.arguments;
  return typeof a === 'string' && a.trim() ? a : a && typeof a === 'object' ? JSON.stringify(a) : '{}';
};

/**
 * Messages the template can render: calls written as the model's text, results as a `user` message (as LM Studio does), results in a row joined into one, because many of
 * these templates throw on two messages of the same role. `testiEsatti`: tool call id → the text the model really wrote.
 */
export function riscriviMessaggi(messaggi, tools, formato, testiEsatti = new Map()) {
  const uscita = [];
  const testo = istruzioni(tools, formato);
  let sistemaVisto = false;
  for (const m of messaggi) {
    if (!sistemaVisto && (m.role === 'system' || m.role === 'developer')) {
      sistemaVisto = true;
      uscita.push({ role: m.role, content: `${testoDi(m.content)}\n\n${testo}` });
    } else if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
      const esatto = m.tool_calls.length === 1 ? testiEsatti.get(m.tool_calls[0].id) : undefined;
      uscita.push({ role: 'assistant', content: esatto ?? `${testoDi(m.content)}${m.tool_calls.map((c) => chiamataScritta(c.function?.name, argomentiDi(c), formato)).join('')}` });
    } else if (m.role === 'tool') {
      const esito = `${formato.esitoApre}${testoDi(m.content)}${formato.esitoChiude}`;
      const ultimo = uscita.at(-1);
      if (ultimo?.role === 'user' && ultimo.daEsiti) ultimo.content += `\n${esito}`;
      else uscita.push({ role: 'user', content: esito, daEsiti: true });
    } else if (m.role === 'user' && uscita.at(-1)?.daEsiti && typeof m.content === 'string') {
      uscita.at(-1).content += `\n\n${m.content}`; // the adapter joined the `user` before this rewriting: results became one here, and many of these templates throw on two in a row
    } else uscita.push(m);
  }
  if (!sistemaVisto) uscita.unshift({ role: 'system', content: testo });
  return uscita.map(({ daEsiti: _d, ...resto }) => resto);
}

/** The fields of a chat request that mean the same on `/completion`. Anything else stays out: an unknown field is the way a body stops being comparable between steps. */
const PASSANO = ['temperature', 'top_p', 'top_k', 'min_p', 'seed', 'presence_penalty', 'frequency_penalty', 'repeat_penalty', 'stop', 'id_slot'];

export function corpoDellaCompletion({ prompt, corpo, tools, formato }) {
  const uscita = { prompt, stream: true, cache_prompt: true, json_schema: schemaDegliAttrezzi(tools, formato), grammar_lazy: true,
    grammar_triggers: [{ type: TIPO_PATTERN, value: `${escapeRegex(formato.apre)}\\s*(${escapeRegex(formato.corpoApre)})` }],
    ...(formato.nelVocabolario ? { preserved_tokens: [formato.apre] } : {}) };
  for (const k of PASSANO) if (corpo?.[k] !== undefined) uscita[k] = corpo[k];
  const massimo = corpo?.max_tokens ?? corpo?.max_completion_tokens;
  if (massimo !== undefined) uscita.n_predict = massimo;
  return uscita;
}

/* the envelope as the grammar writes it: the fields in the order of the schema, the arguments an object. The tail held back is longer than any closing the grammar allows */
const INIZIO_CHIAMATA = /^\s*\[?\s*\{\s*"name"\s*:\s*"([^"\\]+)"\s*,\s*"arguments"\s*:\s*(?=\{)/u;
const FINE_BUSTA = /\s*\}\s*\]?\s*(?:<\/tool_call>\s*)?$/u;
const CODA_TENUTA = 64;
const RESPIRO_OGNI_S = 15; // I3: at most one breath every 15 s while a call is held

const finisceConPezzoDi = (testo, parola) => {
  for (let n = Math.min(parola.length - 1, testo.length); n > 0; n -= 1) if (parola.startsWith(testo.slice(-n))) return n;
  return 0;
};

/** The call in the text after the signal. Null if it is not one: cut by the limit of words, or a model that wrote something else after a signal with no grammar. */
export function leggiChiamata(testo, formato) {
  /* the whole text first: the grammar never writes the closing label, and the same label can be inside the arguments of a file about tools (fourth review, D9) */
  let valore;
  try { valore = JSON.parse(testo); } catch {
    const fine = formato.chiude ? testo.lastIndexOf(formato.chiude) : -1;
    /* only the closing and spaces after it: a call followed by an answer is an example that was quoted (fifth review, R-04) */
    if (fine === -1 || testo.slice(fine + formato.chiude.length).trim()) return null;
    try { valore = JSON.parse(testo.slice(0, fine)); } catch { return null; }
  }
  /* the list of a Mistral family, or its one call written bare by a model without the grammar (fifth review, R-03) */
  const chiamata = formato.elenco ? (Array.isArray(valore) ? valore[0] : valore) : valore;
  if (typeof chiamata?.name !== 'string' || !chiamata.name || chiamata.arguments === undefined) return null;
  return { nome: chiamata.name, argomenti: typeof chiamata.arguments === 'string' ? chiamata.arguments : JSON.stringify(chiamata.arguments) };
}

/**
 * Turns the text of `/completion` into the pieces of the chat route, so the kernel knows nothing (`talosHarness.mjs:1242`, `:1252`). Text is held back only while it could be
 * the beginning of a label. `prompt` is the rendered text: a template can open the thinking in the prompt, and then the first words are thinking.
 * `nuovoId`: the id of the call, from outside so that a test can read it. `testoEsatto()`: what the model wrote, to give it back byte by byte at the next step.
 */
export function creaTraduttore({ formato, modello, prompt = '', nuovoId, adesso = () => Math.floor(Date.now() / 1000) }) {
  const APRE_RAGIONAMENTO = '<think>';
  const CHIUDE_RAGIONAMENTO = '</think>';
  const apertoNelPrompt = /<think>\s*$/u.exec(prompt)?.[0] ?? '';
  let stato = apertoNelPrompt ? 'ragionamento' : 'testo';
  let attesa = '';
  let chiamata = '';
  let scritto = '';
  let inizioDellaRisposta = true; // thinking opens only at the start: `<think>` in the middle of an answer is a word of the answer (fourth review, M3)
  let inCorso = null; // the call being sent in pieces: { da, mandati }
  let daRagionamento = false; // the signal came while thinking
  const id = `talos-${nuovoId()}`;
  const creato = adesso();
  let ultimaUscitaAlle = creato; // I3: when the last piece went out, in seconds
  const pezzo = (delta, altro = {}) => ({ id, object: 'chat.completion.chunk', created: creato, model: modello, choices: [{ index: 0, delta, finish_reason: null }], ...altro });
  const fuori = [];
  const manda = (testo) => {
    if (!testo) return;
    if (stato !== 'ragionamento' && testo.trim()) inizioDellaRisposta = false;
    fuori.push(pezzo(stato === 'ragionamento' ? { reasoning_content: testo } : { content: testo }));
  };
  const mandaArgomenti = (testo) => { if (testo) { inCorso.mandati += testo.length; fuori.push(pezzo({ tool_calls: [{ index: 0, function: { arguments: testo } }] })); } };

  /*
   * Fourth review, D3: a long call must not be silent. The kernel cuts a stream with no data after 300 s (`talosHarness.mjs:1294`), and a file written at 19 words a second is
   * about 5,700 words in that time. So the name goes as soon as it is known and the arguments in pieces, as the chat route does, with the model's own spacing. The tail stays
   * behind because the last brace is the envelope's. A model free of the grammar can write the fields in another order: then the call is read whole at the end, as before.
   */
  function avanzaChiamata() {
    if (daRagionamento) return; // inside the thinking it may still be an example: read whole at the end (fifth review, R-04)
    if (!inCorso) {
      const inizio = INIZIO_CHIAMATA.exec(chiamata);
      if (!inizio) return;
      inCorso = { da: inizio[0].length, mandati: 0 };
      fuori.push(pezzo({ tool_calls: [{ index: 0, id: `emulata-${id}`, type: 'function', function: { name: inizio[1], arguments: '' } }] }));
    }
    let fine = Math.max(inCorso.da + inCorso.mandati, chiamata.length - CODA_TENUTA);
    if (fine > inCorso.da + inCorso.mandati && /[\uD800-\uDBFF]/u.test(chiamata[fine - 1])) fine -= 1; // never half a character (fifth review, R-05)
    mandaArgomenti(chiamata.slice(inCorso.da + inCorso.mandati, fine));
  }

  function digerisci() {
    for (;;) {
      if (stato === 'chiamata') { chiamata += attesa; attesa = ''; avanzaChiamata(); return; }
      /* Fourth review D6, fifth R-01, R-02: the grammar starts at the signal also inside the thinking, and after the JSON allows only the end. So the signal is a signal there too: what
         follows is read as a call, and a `</think>` or a `<tool_call>` inside its arguments is part of them */
      const segnali = stato === 'ragionamento' ? [CHIUDE_RAGIONAMENTO, formato.apre] : inizioDellaRisposta ? [APRE_RAGIONAMENTO, formato.apre] : [formato.apre];
      const trovati = segnali.map((s) => ({ s, dove: attesa.indexOf(s) })).filter((t) => t.dove !== -1 && (t.s !== APRE_RAGIONAMENTO || !attesa.slice(0, t.dove).trim()));
      if (!trovati.length) {
        const tieni = Math.max(...segnali.map((s) => finisceConPezzoDi(attesa, s)));
        manda(attesa.slice(0, attesa.length - tieni));
        attesa = attesa.slice(attesa.length - tieni);
        return;
      }
      const { s, dove } = trovati.sort((a, b) => a.dove - b.dove)[0];
      manda(attesa.slice(0, dove));
      attesa = attesa.slice(dove + s.length);
      if (s === formato.apre) daRagionamento = stato === 'ragionamento';
      stato = s === CHIUDE_RAGIONAMENTO ? 'testo' : s === APRE_RAGIONAMENTO ? 'ragionamento' : 'chiamata';
    }
  }

  return {
    id,
    spingi(testo) {
      scritto += testo;
      attesa += testo;
      fuori.length = 0;
      digerisci();
      /*
       * I3 (cloud review of PR 21): a call held whole (written while thinking, or fields in another order) sends nothing while the model writes it, and the kernel
       * cuts a stream with no data after 300 s. So, only when a piece of the model arrives (never a timer: a quiet engine must still end in PROVIDER_SILENCE), and at
       * most every RESPIRO_OGNI_S, a piece with only `talos_respiro`: the kernel counts it as a datum and keeps nothing of it. Not a space: thinking and text are saved
       * and go back to the model (Performance, 04/11). Not an SSE comment: neither our kernel (`talosHarness.mjs:1001`) nor Hermes
       * (`agent/chat_completion_helpers.py:244-257`) counts one. 15 s is the keep-alive pace of WHATWG HTML §9.2.
       */
      const ora = adesso();
      if (fuori.length) ultimaUscitaAlle = ora;
      else if (stato === 'chiamata' && !inCorso && ora - ultimaUscitaAlle >= RESPIRO_OGNI_S) { fuori.push(pezzo({ talos_respiro: true })); ultimaUscitaAlle = ora; }
      return [...fuori];
    },
    /** `ultimo`: the last piece of `/completion`, with `stop_type`, `tokens_evaluated`, `tokens_predicted`, `timings`. */
    fine(ultimo = {}) {
      fuori.length = 0;
      manda(attesa);
      attesa = '';
      const perLimite = ultimo.stop_type === 'limit';
      let finale = perLimite ? 'length' : 'stop';
      const letta = stato === 'chiamata' ? leggiChiamata(chiamata, formato) : null;
      if (inCorso) {
        const resto = chiamata.slice(inCorso.da + inCorso.mandati);
        mandaArgomenti(letta ? resto.replace(FINE_BUSTA, '') : resto); // already on its way: what is left goes out as it is, as the chat route does
        /* fifth review, R-03: unreadable is `length` only if the engine said so; with `eos` the kernel gets the call and the tool answers what is wrong with it */
        finale = letta ? 'tool_calls' : perLimite ? 'length' : 'tool_calls';
      } else if (letta) {
        fuori.push(pezzo({ tool_calls: [{ index: 0, id: `emulata-${id}`, type: 'function', function: { name: letta.nome, arguments: letta.argomenti } }] }));
        finale = 'tool_calls';
      } else if (stato === 'chiamata' && daRagionamento) {
        /* not a call after all, written while thinking: the thinking back to the thinking, and what came after its closing back to the answer */
        const chiusa = chiamata.indexOf(CHIUDE_RAGIONAMENTO);
        stato = 'ragionamento';
        manda(`${formato.apre}${chiusa === -1 ? chiamata : chiamata.slice(0, chiusa)}`);
        stato = 'testo';
        if (chiusa !== -1) manda(chiamata.slice(chiusa + CHIUDE_RAGIONAMENTO.length));
      } else if (stato === 'chiamata') {
        manda(`${formato.apre}${chiamata}`); // never lost in silence: what the model wrote reaches the person
      }
      const pronta = pezzo({}, typeof ultimo.tokens_evaluated === 'number' ? { usage: { prompt_tokens: ultimo.tokens_evaluated, completion_tokens: ultimo.tokens_predicted ?? 0, total_tokens: ultimo.tokens_evaluated + (ultimo.tokens_predicted ?? 0) } } : {});
      pronta.choices[0].finish_reason = finale;
      fuori.push({ ...pronta, ...(ultimo.timings ? { timings: ultimo.timings } : {}) });
      return [...fuori];
    },
    testoEsatto: () => `${apertoNelPrompt}${scritto}`,
    idChiamata: () => `emulata-${id}`,
  };
}

/** The `data:` lines of a `/completion` stream, in pieces of any size. */
export function creaLettoreSse() {
  let resto = '';
  return (testo) => {
    resto += testo;
    const righe = resto.split('\n');
    resto = righe.pop();
    const voci = [];
    for (const riga of righe) {
      if (!riga.startsWith('data: ')) continue;
      try { voci.push(JSON.parse(riga.slice(6))); } catch { /* `[DONE]`, or half a line of an engine that fell: the missing last piece says it */ }
    }
    return voci;
  };
}

const MEMORIA_TESTI = 512; // calls whose exact text is kept: far more than a window holds; after it a call is written out again, and the cost is one read

/**
 * The door the adapter opens (`runtime-owner-adapter.mjs`), only for the engine of this PC: never for the engine of the app, which has no `/completion` (Mobile, 01/11,
 * `TalosMotoreOspiteServizio.java:120-143`). `chiama(percorso, opzioni)`: the supervisor, with its key.
 * `genera` answers a Response in the form of the chat route, or null when this request must go the way of today: a model with tools of its own, or an engine that said no.
 * Performance, 01/11: `/tokenize` once per model, held here. The model travels in every request: the router chooses by it (`server-models.cpp:2052`, `proxy_post`).
 */
export function creaEmulatore({ chiama, identitaDelMotore = () => null, nuovoId = () => randomUUID(), registro = (testo) => { try { process.stderr.write(testo); } catch { /* no log, the request goes on */ } } }) {
  const formati = new Map();
  const testiEsatti = new Map();
  /* fourth review, M7: what a model says holds as long as the engine that said it: the same name can come back with another template */
  const chiaveDi = (modello) => `${modello}\0${identitaDelMotore() ?? ''}`;

  const posta = (percorso, corpo, signal, altro = {}) => chiama(percorso, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal, ...altro, body: JSON.stringify(corpo) });

  async function formatoDi(modello, signal) {
    const chiave = chiaveDi(modello);
    if (formati.has(chiave)) return formati.get(chiave);
    /* `autoload=false`: the router would load a model behind TALOS' back on a read (fourth review, M9; the supervisor adds it only to a path with no `model=`) */
    const risposta = await chiama(`/props?model=${encodeURIComponent(modello)}&autoload=false`, { method: 'GET', signal });
    if (!risposta.ok) return null; // not known: not remembered, and today's way decides from the behaviour
    if (!haBisognoDiEmulazione(await risposta.json())) { formati.set(chiave, null); return null; }
    const sole = new Set();
    for (const segnale of SEGNALI_DA_CERCARE) {
      const t = await posta('/tokenize', { model: modello, content: segnale, add_special: false, parse_special: true }, signal);
      if (t.ok && (await t.json())?.tokens?.length === 1) sole.add(segnale);
    }
    const formato = scegliFormato((s) => sole.has(s));
    formati.set(chiave, formato);
    return formato;
  }

  function ricorda(id, testo) {
    testiEsatti.delete(id);
    testiEsatti.set(id, testo);
    if (testiEsatti.size > MEMORIA_TESTI) testiEsatti.delete(testiEsatti.keys().next().value);
  }

  function flussoChat(corpoRisposta, traduttore) {
    const decodifica = new TextDecoder();
    const codifica = new TextEncoder();
    const leggi = creaLettoreSse();
    const lettore = corpoRisposta.getReader();
    let finito = false;
    const riga = (pezzo) => codifica.encode(`data: ${JSON.stringify(pezzo)}\n\n`);
    return new ReadableStream({
      async pull(controllo) {
        for (;;) {
          const { value, done } = await lettore.read();
          /* no last piece from the engine: the stream just ends, and the kernel reads it as cut. A `finish_reason` written here would be a lie */
          if (done) { if (finito) controllo.enqueue(codifica.encode('data: [DONE]\n\n')); controllo.close(); return; }
          let scritto = false;
          for (const voce of leggi(decodifica.decode(value, { stream: true }))) {
            /* fourth review, M4: an error of the engine in the middle: the kernel reads it on the chat route, and here it was lost */
            if (voce.error) { controllo.enqueue(riga({ error: voce.error })); scritto = true; continue; }
            for (const pezzo of traduttore.spingi(String(voce.content ?? ''))) { controllo.enqueue(riga(pezzo)); scritto = true; }
            if (voce.stop === true) {
              finito = true;
              const fine = traduttore.fine(voce);
              if (fine.some((p) => p.choices[0].finish_reason === 'tool_calls')) ricorda(traduttore.idChiamata(), traduttore.testoEsatto());
              for (const pezzo of fine) controllo.enqueue(riga(pezzo));
              scritto = true;
            }
          }
          if (scritto) return;
        }
      },
      cancel(motivo) { return lettore.cancel(motivo); },
    });
  }

  async function genera(corpo, { signal, dispatcher } = {}) {
    if (corpo?.stream !== true || !soloFunzioni(corpo.tools).length || corpo.tool_choice === 'none') return null;
    try {
      const formato = await formatoDi(corpo.model, signal);
      if (!formato) return null;
      const messaggi = riscriviMessaggi(corpo.messages ?? [], corpo.tools, formato, testiEsatti);
      /* fourth review, D8: thinking switched off by the person is read by the template (`server-common.cpp:1498-1505`, `:1519`), and only there */
      const pensiero = Object.fromEntries(['chat_template_kwargs', 'reasoning_effort', 'thinking_budget_tokens'].filter((k) => corpo[k] !== undefined).map((k) => [k, corpo[k]]));
      const reso = await posta('/apply-template', { model: corpo.model, messages: messaggi, ...pensiero }, signal);
      if (!reso.ok) { registro(`[talos] emulated tools: the template said ${reso.status}\n`); return null; }
      const { prompt } = await reso.json();
      /* fourth review, D10: `/completion` sends the headers at the first result: a long read of the prompt needs the same patience as the chat route */
      const risposta = await posta('/completion', { ...corpoDellaCompletion({ prompt, corpo, tools: corpo.tools, formato }), model: corpo.model }, signal, dispatcher ? { dispatcher } : {});
      if (!risposta.ok) { registro(`[talos] emulated tools: the engine said ${risposta.status}\n`); return null; }
      const traduttore = creaTraduttore({ formato, modello: corpo.model, prompt, nuovoId });
      return new Response(flussoChat(risposta.body, traduttore), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    } catch (errore) {
      if (signal?.aborted) throw errore;
      registro(`[talos] emulated tools: ${String(errore?.message ?? errore).slice(0, 160)}\n`);
      return null;
    }
  }

  return Object.freeze({ genera, formatoDi });
}
