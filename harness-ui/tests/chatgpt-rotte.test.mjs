import assert from 'node:assert/strict';
import test from 'node:test';

import { ROTTE_CHATGPT, creaCatalogoChatgpt, creaRotteChatgpt, modelloDelPiano } from '../src/chatgpt-rotte.mjs';

/* «Continue with ChatGPT» (11/10/2026) — elenco dei modelli del piano e rotte dell'accesso, senza server e senza rete. */
// Due modelli nella forma VERA di `GET /v1/models` (prova dal vivo dell'11/10/2026, PIANO §10), più due che non si mostrano.
const ELENCO = { models: [
  { slug: 'gpt-6.1-sol', display_name: 'GPT-6.1-Sol', description: 'Frontier.', visibility: 'list', context_window: 272000, input_modalities: ['text', 'image'],
    supported_reasoning_levels: [{ effort: 'low' }, { effort: 'medium' }, { effort: 'high' }], default_reasoning_level: 'medium' },
  { slug: 'gpt-6-luna', display_name: 'GPT-6-Luna', visibility: 'list', context_window: 272000, input_modalities: ['text'], supported_reasoning_levels: [] },
  { slug: 'gpt-interno', display_name: 'Interno', visibility: 'hide', context_window: 1 },
  { display_name: 'Senza slug', visibility: 'list' },
] };
function accessoFinto({ collegato = true, email = 'nino@example.com', token = async () => 'TOKEN' } = {}) {
  const chiamate = [];
  let sblocca;
  return { chiamate, stato: () => ({ collegato, email, pianoAbilitato: collegato, accessoInCorso: false, consumi: 'https://chatgpt.com/settings/usage' }),
    tokenDiAccesso: token, concludi: (e) => sblocca(e),
    inizia: async (o) => { chiamate.push(['inizia', o]); return { indirizzo: 'https://auth.openai.com/api/accounts/authorize?x=1', scadeTraMs: 600000, esito: new Promise((r) => { sblocca = r; }) }; },
    annulla: () => chiamate.push(['annulla']), esci: async () => { chiamate.push(['esci']); return { revocaConfermata: true }; } };
}

test('ROTTE-01 — the plan’s models: only the listed ones, in the server’s order, in the shape the selector knows', async () => {
  assert.deepEqual(modelloDelPiano(ELENCO.models[0]), { id: 'chatgpt:gpt-6.1-sol', nome: 'GPT-6.1-Sol', provider: 'chatgpt', descrizione: 'Frontier.', contextLength: 272000, contestoVerificato: true,
    capacita: { visione: 'osservato-si', toolUse: 'ignoto', reasoning: 'osservato-si' }, inputModalities: ['text', 'image'], livelliRagionamento: ['low', 'medium', 'high'], livelloRagionamentoPredefinito: 'medium' });
  assert.deepEqual(modelloDelPiano(ELENCO.models[1]).capacita, { visione: 'osservato-no', toolUse: 'ignoto', reasoning: 'osservato-no' });
  assert.deepEqual(modelloDelPiano({ slug: 'x' }).capacita, { visione: 'ignoto', toolUse: 'ignoto', reasoning: 'ignoto' }, 'what the service does not say stays unknown, never false');
  const viste = [];
  const rete = async (url, o) => { viste.push({ url, aut: o.headers.authorization }); return Response.json(ELENCO); };
  const catalogo = creaCatalogoChatgpt({ accesso: accessoFinto(), fetchDiRete: rete });
  const modelli = await catalogo.elenca();
  assert.deepEqual(modelli.map((m) => m.id), ['chatgpt:gpt-6.1-sol', 'chatgpt:gpt-6-luna']);
  assert.deepEqual(viste, [{ url: 'https://api.openai.com/v1/models', aut: 'Bearer TOKEN' }]);
});

test('ROTTE-02 — the list is remembered for a while, per account, and read again on request or after it is forgotten', async () => {
  let adesso = 1000; let letture = 0; let email = 'a@example.com';
  const accesso = { stato: () => ({ collegato: true, email }), tokenDiAccesso: async () => 'T' };
  const catalogo = creaCatalogoChatgpt({ accesso, clock: () => adesso, fetchDiRete: async () => { letture += 1; return Response.json(ELENCO); } });
  await catalogo.elenca(); await catalogo.elenca();
  assert.equal(letture, 1);
  await catalogo.elenca({ rileggi: true });
  assert.equal(letture, 2);
  adesso += 10 * 60 * 1000 + 1;
  await catalogo.elenca();
  assert.equal(letture, 3, 'after ten minutes the list is read again');
  email = 'b@example.com';
  await catalogo.elenca();
  assert.equal(letture, 4, 'another account never sees the list of the previous one');
  catalogo.dimentica(); await catalogo.elenca();
  assert.equal(letture, 5);
});

test('ROTTE-03 — the list fails honestly: not connected, network down, refused, unknown shape', async () => {
  const con = (opzioni, rete) => creaCatalogoChatgpt({ accesso: accessoFinto(opzioni), fetchDiRete: rete }).elenca();
  await assert.rejects(con({ collegato: false }, async () => assert.fail('no request without a sign-in')), (e) => e.code === 'CHATGPT_NON_COLLEGATO');
  await assert.rejects(con({}, async () => { throw new Error('giù'); }), (e) => e.code === 'CHATGPT_RETE');
  await assert.rejects(con({}, async () => new Response('{}', { status: 401 })), (e) => e.code === 'CHATGPT_ACCESSO_NON_VALIDO' && e.stato === 401);
  await assert.rejects(con({}, async () => new Response('{}', { status: 500 })), (e) => e.code === 'CHATGPT_ELENCO_NON_LETTO');
  await assert.rejects(con({}, async () => Response.json({ altro: 1 })), (e) => e.code === 'CHATGPT_ELENCO_NON_LETTO');
  await assert.rejects(con({ token: async () => { throw Object.assign(new Error('x'), { code: 'CHATGPT_ACCESSO_SCADUTO' }); } }, async () => assert.fail('no request')), (e) => e.code === 'CHATGPT_ACCESSO_SCADUTO');
});

test('ROTTE-04 — the routes: state, start, cancel, sign out; the outcome of the attempt is readable from the state', async () => {
  const accesso = accessoFinto();
  let dimenticato = 0;
  const rotta = creaRotteChatgpt({ accesso, catalogo: { dimentica: () => { dimenticato += 1; } } });
  assert.equal(await rotta({ method: 'GET', percorso: '/api/v1/providers' }), null, 'not its path');
  const stato = await rotta({ method: 'GET', percorso: '/api/v1/auth/chatgpt/stato' });
  assert.deepEqual(stato, { stato: 200, dati: { collegato: true, email: 'nino@example.com', pianoAbilitato: true, accessoInCorso: false, consumi: 'https://chatgpt.com/settings/usage', ultimoEsito: null } });
  const inizio = await rotta({ method: 'POST', percorso: '/api/v1/auth/chatgpt/inizia', corpo: { consenso: true } });
  assert.deepEqual(inizio, { stato: 200, dati: { indirizzo: 'https://auth.openai.com/api/accounts/authorize?x=1', scadeTraMs: 600000 } });
  assert.deepEqual(accesso.chiamate.at(-1), ['inizia', { consenso: true }]);
  accesso.concludi({ ok: true, email: 'nino@example.com', pianoAbilitato: true });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual((await rotta({ method: 'GET', percorso: '/api/v1/auth/chatgpt/stato' })).dati.ultimoEsito, { ok: true, email: 'nino@example.com', pianoAbilitato: true });
  assert.equal(dimenticato, 1, 'a new sign-in forgets the model list of the previous account');
  await rotta({ method: 'POST', percorso: '/api/v1/auth/chatgpt/inizia' });
  assert.equal((await rotta({ method: 'GET', percorso: '/api/v1/auth/chatgpt/stato' })).dati.ultimoEsito, null, 'a new attempt clears the old outcome');
  assert.deepEqual(await rotta({ method: 'POST', percorso: '/api/v1/auth/chatgpt/annulla' }), { stato: 200, dati: { annullato: true } });
  assert.deepEqual(await rotta({ method: 'POST', percorso: '/api/v1/auth/chatgpt/esci' }), { stato: 200, dati: { revocaConfermata: true } });
  assert.equal(dimenticato, 2);
  assert.equal(JSON.stringify([stato, inizio]).includes('TOKEN'), false, 'no answer carries a token');
});

test('ROTTE-05 — what the routes refuse: wrong method, unknown route, a body that is not the expected one, a server without a keyring', async () => {
  const rotta = creaRotteChatgpt({ accesso: accessoFinto() });
  const sbagliato = await rotta({ method: 'GET', percorso: '/api/v1/auth/chatgpt/inizia' });
  assert.deepEqual({ stato: sbagliato.stato, allow: sbagliato.allow }, { stato: 405, allow: 'POST' });
  assert.equal((await rotta({ method: 'POST', percorso: '/api/v1/auth/chatgpt/stato' })).stato, 405);
  assert.equal((await rotta({ method: 'GET', percorso: '/api/v1/auth/chatgpt/token' })).stato, 404, 'there is no route that hands out a token');
  for (const corpo of [{ consenso: 'si' }, { altro: true }, [], 'x']) {
    const r = await rotta({ method: 'POST', percorso: '/api/v1/auth/chatgpt/inizia', corpo });
    assert.deepEqual({ stato: r.stato, code: r.errore.code }, { stato: 400, code: 'CHATGPT_RICHIESTA_NON_VALIDA' }, JSON.stringify(corpo));
  }
  const senza = creaRotteChatgpt({ accesso: null });
  for (const r of ROTTE_CHATGPT) {
    const esito = await senza({ method: r.metodi[0], percorso: r.schema });
    assert.deepEqual({ stato: esito.stato, code: esito.errore.code }, { stato: 503, code: 'CHATGPT_NON_DISPONIBILE' }, r.schema);
  }
  const rotto = creaRotteChatgpt({ accesso: { ...accessoFinto(), esci: async () => { throw new Error('SEGRETO-NEL-MESSAGGIO'); }, inizia: async () => { throw Object.assign(new Error('The credentials could not be stored safely.'), { code: 'CHATGPT_CUSTODIA_FALLITA' }); } } });
  const uscita = await rotto({ method: 'POST', percorso: '/api/v1/auth/chatgpt/esci' });
  assert.deepEqual(uscita, { stato: 500, errore: { code: 'CHATGPT_ERRORE', message: 'The ChatGPT sign-in could not be completed.' } }, 'an unknown failure never leaks its message');
  assert.deepEqual(await rotto({ method: 'POST', percorso: '/api/v1/auth/chatgpt/inizia' }), { stato: 500, errore: { code: 'CHATGPT_CUSTODIA_FALLITA', message: 'The credentials could not be stored safely.' } });
});

test('ROTTE-06 — the state carries TALOS’s own usage count only when connected; a sign-in with another account resets it, the same account keeps it', async () => {
  const uso = { azzerato: 0, riepilogo: () => ({ cinqueOre: { richieste: 2, token: 900, senzaMisura: 0 }, setteGiorni: { richieste: 5, token: 4000, senzaMisura: 1 } }), azzera: async () => { uso.azzerato += 1; } };
  const accesso = accessoFinto();
  const rotta = creaRotteChatgpt({ accesso, uso });
  assert.deepEqual((await rotta({ method: 'GET', percorso: '/api/v1/auth/chatgpt/stato' })).dati.usoTalos, uso.riepilogo());
  const scollegato = creaRotteChatgpt({ accesso: accessoFinto({ collegato: false }), uso });
  assert.equal('usoTalos' in (await scollegato({ method: 'GET', percorso: '/api/v1/auth/chatgpt/stato' })).dati, false);
  assert.equal('usoTalos' in (await creaRotteChatgpt({ accesso: accessoFinto() })({ method: 'GET', percorso: '/api/v1/auth/chatgpt/stato' })).dati, false, 'no counter, no field');
  await rotta({ method: 'POST', percorso: '/api/v1/auth/chatgpt/inizia' });
  accesso.concludi({ ok: true, email: 'nino@example.com', pianoAbilitato: true });
  await new Promise((r) => setImmediate(r));
  assert.equal(uso.azzerato, 0, 'same account: the count stays');
  await rotta({ method: 'POST', percorso: '/api/v1/auth/chatgpt/inizia' });
  accesso.concludi({ ok: true, email: 'altra@example.com', pianoAbilitato: true });
  await new Promise((r) => setImmediate(r));
  assert.equal(uso.azzerato, 1, 'another account: the count restarts');
});

test('ROTTE-07 — the reasoning levels of the plan models, for the pill: what each model declares, and what is really SENT for each asked level', async () => {
  const { ragionamentoDelPiano, LIVELLI_INOLTRATI_DAL_PIANO } = await import('../src/chatgpt-rotte.mjs');
  assert.deepEqual([...LIVELLI_INOLTRATI_DAL_PIANO], ['low', 'medium', 'high', 'xhigh', 'max']);
  const modelli = [
    { id: 'chatgpt:gpt-6-sol', livelliRagionamento: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'] },
    { id: 'chatgpt:gpt-6-luna', livelliRagionamento: ['low', 'medium'] },
    { id: 'chatgpt:senza-livelli' }, { id: 'altro:modello', livelliRagionamento: ['low'] }, null,
  ];
  const r = ragionamentoDelPiano(modelli);
  assert.deepEqual(r.livelli, { 'gpt-6-sol': ['low', 'medium', 'high', 'xhigh', 'max'], 'gpt-6-luna': ['low', 'medium'] },
    '«ultra» is not forwarded by the adapter, so it is not offered; a model without levels offers none');
  assert.deepEqual(r.filo['gpt-6-luna'], { none: null, minimal: null, low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' },
    'the wire map says what is really sent (INSTRADA-09); what is OFFERED is decided by the levels above');
  assert.equal(r.filo['gpt-6-sol'].max, 'max');
  assert.equal(r.filo['gpt-6-sol'].none, null, '«off» is never sent on the plan: the pill must not promise it');
  assert.deepEqual(ragionamentoDelPiano(null), { livelli: {}, filo: {} });
});

/*
 * ROTTE-08 (11/10/2026 sera, review avversaria) — L'ESITO È QUELLO DELL'ULTIMO TENTATIVO, E CHI ANNULLA NON LEGGE UN ERRORE.
 *   Un tentativo sostituito da un altro, o annullato dalla persona, finisce comunque (oggi con CHATGPT_ACCESSO_ANNULLATO): il suo
 *   esito non deve coprire quello del tentativo in corso né comparire come «accesso fallito» dopo un annulla voluto.
 */
test('ROTTE-08 — only the latest attempt reports its outcome; a cancelled attempt reports nothing', async () => {
  const fine = [];
  const accesso = { stato: () => ({ collegato: false, email: null, pianoAbilitato: false, accessoInCorso: true }), annulla: () => {}, esci: async () => ({ revocaConfermata: true }),
    inizia: async () => ({ indirizzo: 'https://auth.openai.com/api/accounts/authorize?x=1', scadeTraMs: 1, esito: new Promise((r) => { fine.push(r); }) }) };
  const rotta = creaRotteChatgpt({ accesso });
  const stato = async () => (await rotta({ method: 'GET', percorso: '/api/v1/auth/chatgpt/stato' })).dati.ultimoEsito;
  const giro = () => new Promise((ok) => setImmediate(ok));
  await rotta({ method: 'POST', percorso: '/api/v1/auth/chatgpt/inizia' });
  await rotta({ method: 'POST', percorso: '/api/v1/auth/chatgpt/inizia' });
  fine[0]({ ok: false, codice: 'CHATGPT_ACCESSO_ANNULLATO', codiceOpenAi: null }); await giro();
  assert.equal(await stato(), null, 'the replaced attempt does not speak over the current one');
  fine[1]({ ok: true, email: 'nino@example.com', pianoAbilitato: true }); await giro();
  assert.deepEqual(await stato(), { ok: true, email: 'nino@example.com', pianoAbilitato: true });
  // cancelled by the person: its late outcome is not shown as a failure
  await rotta({ method: 'POST', percorso: '/api/v1/auth/chatgpt/inizia' });
  await rotta({ method: 'POST', percorso: '/api/v1/auth/chatgpt/annulla' });
  fine[2]({ ok: false, codice: 'CHATGPT_ACCESSO_ANNULLATO', codiceOpenAi: null }); await giro();
  assert.equal(await stato(), null);
});
