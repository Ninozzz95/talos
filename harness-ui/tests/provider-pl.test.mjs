import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WIRE, REGISTRO_FORNITORI, verificaRegistro } from '../src/provider-registry.mjs';
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { rispostaAgenteAcp } from '../src/acp-agent.mjs';
import { chiamaConRitenta, consumaFlussoSSE } from '../src/kernel/talosHarness.mjs';

test('PL-REG-01 — agente esterno nel registro, wire valido e mutazione respinta', () => {
  const r = REGISTRO_FORNITORI.esterno;
  assert.ok(WIRE.includes('acp'));
  assert.equal(r.etichetta, 'Agente esterno');
  assert.equal(r.wire, 'acp');
  assert.equal(r.credenziale, false);
  assert.equal(r.catalogo.inUI, true, 'P-L-bis: destinazione selezionabile quando configurata');
  assert.equal(r.runtime.variabile, 'TALOS_AGENTE_ESTERNO');
  assert.equal(verificaRegistro({ esterno: r }), true);
  assert.throws(() => verificaRegistro({ esterno: { ...r, wire: 'acp-inventato' } }));
});

async function prepara(t, modo = 'normale') {
  const cwd = await mkdtemp(join(tmpdir(), 'talos-pl-fornitore-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const diario = join(cwd, 'diario.jsonl');
  return { runtime: { comando: process.execPath,
    argomenti: [fileURLToPath(new URL('./fixtures/acp-agent-finto.mjs', import.meta.url)), modo, diario], cwd, variabiliAmbiente: [] },
    leggi: async () => (await readFile(diario, 'utf8')).trim().split('\n').map(JSON.parse) };
}
const corpo = { model: 'esterno:predefinito', stream: true, messages: [{ role: 'user', content: 'Ciao, rispondi in italiano.' }] };
const richiesta = body => ({ method: 'POST', body: JSON.stringify(body) });

test('PL-ROUTE-01 — confine Fetch reale: SSE in ordine, chiusura e zero rete', async t => {
  const f = await prepara(t);
  const instrada = creaFetchMultiProvider(() => assert.fail('Non deve usare la rete'), { dipendenze: {
    leggiChiave: () => assert.fail('Non deve leggere chiavi'), leggiRuntime: () => f.runtime,
  } });
  const r = await instrada('https://openrouter.ai/api/v1/chat/completions', richiesta(corpo));
  assert.equal(r.headers.get('content-type'), 'text/event-stream');
  const s = await r.text();
  assert.ok(s.includes('[DONE]'));
  const eventi = s.split('\n').filter(l => l.startsWith('data: {')).map(l => JSON.parse(l.slice(6)));
  assert.equal(eventi.filter(e => e.choices[0].delta.content).map(e => e.choices[0].delta.content).join('').startsWith('Prima dopo.'), true);
  assert.ok(eventi.some(e => e.choices[0].delta.reasoning_content === 'Riflessione.'));
  assert.equal(eventi.some(e => e.choices[0].delta.tool_calls), false);
  const pid = (await f.leggi())[0].pid;
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});

test('PL-ROUTE-02 — strumenti e immagini respinti prima di avviare il processo', async t => {
  const f = await prepara(t);
  for (const body of [{ ...corpo, tools: [{ type: 'function', function: { name: 'esegui' } }] },
    { ...corpo, messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'https://esempio.test/img' } }] }] }]) {
    await assert.rejects(rispostaAgenteAcp({ runtime: f.runtime, body }), { code: 'ACP_REQUEST_UNSUPPORTED' });
  }
  await assert.rejects(f.leggi(), { code: 'ENOENT' });
});

test('PL-ROUTE-03 — più turni: contesto completo e processi indipendenti, anche senza stream', async t => {
  const f = await prepara(t);
  const r1 = await rispostaAgenteAcp({ runtime: f.runtime, body: { ...corpo, stream: false } });
  assert.match((await r1.json()).choices[0].message.content, /Prima dopo/u);
  const messaggi = [...corpo.messages, { role: 'assistant', content: 'Prima dopo.' }, { role: 'user', content: 'Ora continua da lì: https://esempio.test, correggi il refuso ciaoo.' }];
  await (await rispostaAgenteAcp({ runtime: f.runtime, body: { ...corpo, messages: messaggi } })).text();
  const righe = await f.leggi();
  assert.equal(righe.filter(m => m.pid).length, 2);
  const ultimo = righe.filter(m => m.method === 'session/prompt').at(-1);
  assert.ok(ultimo.params.prompt[0].text.includes(messaggi[2].content));
  assert.ok(ultimo.params.prompt[0].text.includes('Prima dopo.'));
});

test('PL-ROUTE-04 — morte nel flusso: rifiuto della lettura, nessun DONE falso', async t => {
  const f = await prepara(t, 'muore');
  const r = await rispostaAgenteAcp({ runtime: f.runtime, body: corpo });
  await assert.rejects(r.text(), e => e.classe === 'flusso-interrotto');
});

test('PL-ROUTE-05 — configurazione ambiente funziona con il portachiavi vero senza record segreto', async t => {
  const f = await prepara(t);
  const precedente = process.env.TALOS_AGENTE_ESTERNO;
  process.env.TALOS_AGENTE_ESTERNO = JSON.stringify(f.runtime);
  t.after(() => { if (precedente === undefined) delete process.env.TALOS_AGENTE_ESTERNO; else process.env.TALOS_AGENTE_ESTERNO = precedente; });
  const store = createProviderCredentialStore({ env: {} });
  const instrada = creaFetchMultiProvider(() => assert.fail('Rete'), { providerStore: store,
    dipendenze: { leggiRuntime: store.getRuntime, leggiChiave: store.getKey } });
  await (await instrada('https://openrouter.ai/api/v1/chat/completions', richiesta(corpo))).text();
});

for (const via of ['segnale', 'lettore']) test(`PL-ROUTE-06 — stop ${via}: cancel attraversa Fetch e chiude il PID`, async t => {
  const f = await prepara(t, 'stop'), stop = new AbortController();
  const r = await rispostaAgenteAcp({ runtime: f.runtime, body: corpo, signal: stop.signal });
  const lettore = r.body.getReader();
  await lettore.read();
  if (via === 'segnale') {
    stop.abort();
    await assert.rejects(lettore.read(), e => e.classe === 'fermato');
  } else await lettore.cancel();
  const righe = await f.leggi();
  assert.ok(righe.some(m => m.method === 'session/cancel'));
  assert.throws(() => process.kill(righe[0].pid, 0), { code: 'ESRCH' });
});

test('PL-ROUTE-07 — segreto spezzato nei delta oscurato, stderr non arriva alla risposta', async t => {
  const f = await prepara(t, 'segreti');
  const r = await rispostaAgenteAcp({ runtime: { ...f.runtime, variabiliAmbiente: ['PL_CHIAVE_DICHIARATA'] },
    body: corpo, env: { PL_CHIAVE_DICHIARATA: 'segreto-finto-pl' } });
  const risultato = await consumaFlussoSSE(r);
  assert.match(risultato.scelta.content, /\[omesso\]/u);
  assert.equal(risultato.scelta.content.includes('segreto-finto-pl'), false);
  assert.equal(risultato.scelta.content.includes('stderr-finto'), false);
});

test('PL-ROUTE-08 — kernel reale: due turni testuali conservano contesto e ragionamento', async t => {
  const f = await prepara(t);
  const fetchDiRete = creaFetchMultiProvider(() => assert.fail('Nessuna rete'), { dipendenze: {
    leggiChiave: () => assert.fail('Nessuna chiave TALOS'), leggiRuntime: () => f.runtime,
  } });
  const messaggi = [{ role: 'system', content: 'Rispondi in italiano.' }, ...corpo.messages];
  for (const domanda of ['Contnua dal messaggio precedente.', 'E ora controlla questa URL: https://esempio.test/pagina']) {
    messaggi.push({ role: 'user', content: domanda });
    const risultato = await chiamaConRitenta({ modello: corpo.model, chiave: 'chiave-finta-da-non-passare',
      messaggi, attrezzi: [], fetchDiRete, inStreaming: true, onDelta: () => {} });
    assert.match(risultato.scelta.content, /Prima dopo\./u);
    assert.equal(risultato.scelta.reasoning_content, 'Riflessione.');
    messaggi.push({ role: 'assistant', content: risultato.scelta.content });
  }
  const richieste = (await f.leggi()).filter(m => m.method === 'session/prompt');
  assert.equal(richieste.length, 2);
  assert.ok(richieste[1].params.prompt[0].text.includes('Contnua'));
});

test('PL-ROUTE-09 — parametri di generazione senza equivalente non vengono ignorati', async t => {
  const f = await prepara(t);
  for (const extra of [{ max_tokens: 12 }, { reasoning: { effort: 'high' } }, { temperature: 0.7 }, { sconosciuto: true }]) {
    await assert.rejects(rispostaAgenteAcp({ runtime: f.runtime, body: { ...corpo, ...extra } }), { code: 'ACP_REQUEST_UNSUPPORTED' });
  }
  await assert.rejects(f.leggi(), { code: 'ENOENT' });
});

for (const [modo, motivo] of [['max_tokens', 'length'], ['refusal', 'content_filter']]) test(`PL-ROUTE-10 — risposta completa: conserva il motivo ${modo}`, async t => {
  const f = await prepara(t, modo);
  const r = await rispostaAgenteAcp({ runtime: f.runtime, body: { ...corpo, stream: false } });
  assert.equal((await r.json()).choices[0].finish_reason, motivo);
});

test('PL-ROUTE-11 — kernel reale: la morte del processo conserva classe BC-44 e codice', async t => {
  const f = await prepara(t, 'muore');
  const fetchDiRete = creaFetchMultiProvider(() => assert.fail('Nessuna rete'), { dipendenze: {
    leggiChiave: () => null, leggiRuntime: () => f.runtime,
  } });
  await assert.rejects(chiamaConRitenta({ modello: corpo.model, messaggi: corpo.messages, attrezzi: [], fetchDiRete,
    inStreaming: true, onDelta: () => {} }), e => e.code === 'ACP_PROCESS_EXITED' && e.classe === 'flusso-interrotto');
});
