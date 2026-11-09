/*
 * Decisione 116, variante C (owner 04/11/2026; forma `FORMA-116-RINNOVO-C-2026-11-04.md`) — l'accesso col piano ChatGPT che scade o
 * viene rifiutato A METÀ GIRO non chiude più il giro:
 *   - stato 1: il token cambia fra due richieste dello stesso giro ⇒ una riga quieta (`talos.accesso-chatgpt`, esito «rinnovato»);
 *   - stato 2: un 401 ⇒ rinnovo forzato e UNA ripetizione della stessa richiesta, riga viva (`talos.provider-retry`, canale
 *     «rinnovo-accesso») e riga quieta «ripreso»; sul telefono r4 chiede il token all'app e lo aspetta ≤10 s;
 *   - stato 3: il rinnovo fallisce ⇒ il codice di sempre, e la ripresa porta `ripresaDopo` (riga dopo il RunStarted).
 * Più la seconda porta: `chatgpt_account` `sign_in`, dietro la carta dei permessi; e l'anteprima `{ ok, carta:false, testo }` della CLI.
 * Fonti: OpenAI, «Codex CI/CD auth» (developers.openai.com/codex/auth/ci-cd-auth, letta il 04/11/2026: su un 401 Codex rinnova e
 * ripete); spacedriveapp/spacebot PR 254 (rinnovo forzato su 401 e UNA ripetizione, poi errore di riaccesso).
 * Tutto con rete finta, portachiavi in memoria, nessuna chiave vera.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { chiamaConRitenta, talosLavora } from '../src/kernel/talosHarness.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { creaAccessoChatgptOspite, CODICE_DA_RINNOVARE } from '../src/chatgpt-accesso-ospite.mjs';
import { creaOspiteFornitori } from '../src/fornitori-per-il-modello.mjs';
import * as httpApp from '../src/http-app.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { corpoSenzaMarcatori } from './aiuto/corpo-senza-marcatori.mjs';

const sse = (...eventi) => eventi.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
const risposta = (testo) => ({ id: 'resp_1', object: 'response', created_at: 1791700000, status: 'completed', model: 'gpt-6-sol',
  output: [{ id: 'msg_1', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: testo, annotations: [] }] }],
  usage: { input_tokens: 3, input_tokens_details: { cached_tokens: 0 }, output_tokens: 2, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 5 } });
const flusso = (testo = 'Fatto.') => new Response(sse({ type: 'response.created', response: { id: 'resp_1', created_at: 1791700000, model: 'gpt-6-sol' } },
  { type: 'response.output_item.added', output_index: 0, item: { id: 'msg_1', type: 'message', role: 'assistant', content: [] } },
  { type: 'response.output_text.delta', item_id: 'msg_1', output_index: 0, content_index: 0, delta: testo },
  { type: 'response.output_item.done', output_index: 0, item: risposta(testo).output[0] },
  { type: 'response.completed', response: risposta(testo) }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
const rifiuto401 = () => new Response(JSON.stringify({ error: { message: 'Unauthorized.' } }), { status: 401, headers: { 'content-type': 'application/json' } });
const impronta = (token) => createHash('sha256').update(token).digest('hex').slice(0, 16);
const codiceDi = (e) => e?.code ?? e?.cause?.code;

/*
 * Il banco dell'adattatore: il motore VERO delle richieste (multi-fornitore, kernel, SDK) con una rete finta al posto di OpenAI.
 * `stato.token` è la custodia finta; `rinnova` decide che cosa fa la dipendenza nuova (di serie: un token nuovo, come il PC).
 */
function banco({ rispondi = () => flusso(), rinnova = null, conDipendenza = true, dallApp = false, env = {}, extra = {} } = {}) {
  const richieste = [];
  const rinnovi = [];
  const avvisi = [];
  const stato = { token: 'TOKEN-1' };
  const rete = async (url, opzioni = {}) => {
    richieste.push({ url: String(url), aut: new Headers(opzioni.headers).get('authorization'), corpo: typeof opzioni.body === 'string' ? opzioni.body : null });
    return rispondi(richieste.length, stato);
  };
  const custodia = new Map();
  const store = createProviderCredentialStore({ env, keyring: { get: (s, k) => custodia.get(`${s}:${k}`) ?? null, set: (s, k, v) => { custodia.set(`${s}:${k}`, v); return true; }, remove: (s, k) => { custodia.delete(`${s}:${k}`); return true; } } });
  const dipendenze = { leggiChiave: (p) => { try { return store.getKey(p); } catch { return null; } }, leggiRuntime: (p) => { try { return store.getRuntime(p); } catch { return {}; } },
    leggiTokenDelPiano: async () => stato.token, registraUsoDelPiano: async () => {}, registraLimitiDelPiano: () => {},
    ...(conDipendenza ? { rinnovaTokenDelPiano: async ({ rifiutato, signal }) => {
      rinnovi.push(rifiutato);
      if (typeof rinnova === 'function') return rinnova({ rifiutato, signal, stato });
      stato.token = `TOKEN-${rinnovi.length + 1}`;
      return stato.token;
    } } : {}),
    ...(dallApp ? { rinnovoDelPianoDallApp: true } : {}), ...extra };
  const nuovoGiro = () => creaFetchMultiProvider(rete, { providerStore: store, dipendenze, onAvviso: async (frase, opzioni = {}) => { avvisi.push({ frase, ...opzioni }); } });
  let trasporto = nuovoGiro();
  const run = (extra = {}) => chiamaConRitenta({ modello: 'chatgpt:gpt-6-sol', chiave: 'unused', messaggi: [{ role: 'user', content: 'ciao' }], attrezzi: [],
    maxOutputTokens: 50, fetchDiRete: trasporto, dormi: async () => {}, caso: () => 0, ...extra });
  return { richieste, rinnovi, avvisi, stato, run, dipendenze, store, rete, giroNuovo: () => { trasporto = nuovoGiro(); } };
}
const righe = (avvisi) => avvisi.filter((a) => a.riga).map((a) => (a.riga === 'rinnovo-accesso' ? `viva:${a.dati.fase}` : a.riga === 'accesso-chatgpt' ? `quieta:${a.dati.esito}` : a.riga));

test('R116-01 (R1) — a 401 of the plan: one renewal with the refused token, the SAME request once more with the new token, body byte-identical', async () => {
  const b = banco({ rispondi: (n) => (n === 1 ? rifiuto401() : flusso('Ripreso.')) });
  const esito = await b.run();
  assert.match(JSON.stringify(esito), /Ripreso\./u);
  assert.deepEqual(b.rinnovi, ['TOKEN-1'], 'renewed once, told which token was refused');
  assert.equal(b.richieste.length, 2);
  assert.deepEqual(b.richieste.map((r) => r.aut), ['Bearer TOKEN-1', 'Bearer TOKEN-2']);
  assert.ok(Buffer.from(b.richieste[0].corpo).equals(Buffer.from(b.richieste[1].corpo)), 'the repeated body is byte-identical');
  assert.deepEqual(righe(b.avvisi), ['viva:invio', 'viva:fine', 'quieta:ripreso']);
  const [invio, fine] = b.avvisi.filter((a) => a.riga === 'rinnovo-accesso');
  assert.equal(invio.dati.requestId, fine.dati.requestId);
  assert.match(invio.dati.requestId, /^[0-9a-f-]{36}$/u);
  assert.deepEqual({ t: invio.dati.tentativo, m: invio.dati.tentativiMassimi }, { t: 1, m: 1 });
  assert.ok(Number.isSafeInteger(invio.dati.at) && invio.dati.at > 0);
  assert.equal('chiedeTokenAllApp' in invio.dati, false, 'only the phone asks the app');
  const quieta = b.avvisi.find((a) => a.riga === 'accesso-chatgpt');
  assert.deepEqual(quieta.dati, { esito: 'ripreso', allInvio: false });
  assert.equal(typeof quieta.frase, 'string');
  // 09/11/2026 r39b: a random UUID (requestId) contained …-4012-…; 401 is searched only as a code on its own
  assert.doesNotMatch(JSON.stringify(b.avvisi), /TOKEN-\d|\b401\b|CHATGPT_/u, 'no token, status or code in the rows');
});

test('R116-02 (R2) — the repeat refused again: no second renewal, CHATGPT_ACCESSO_NON_VALIDO; the cap is 3 renewals per turn', async () => {
  const sempre = banco({ rispondi: () => rifiuto401() });
  await assert.rejects(sempre.run(), (e) => codiceDi(e) === 'CHATGPT_ACCESSO_NON_VALIDO');
  assert.equal(sempre.rinnovi.length, 1);
  assert.equal(sempre.richieste.length, 2);
  assert.deepEqual(righe(sempre.avvisi), ['viva:invio', 'viva:fine'], 'no «picking up» row when it did not pick up');
  // the cap: every request of the same turn is refused once and then served; the fourth refusal is not renewed
  const alterno = banco({ rispondi: (n) => (n % 2 === 1 ? rifiuto401() : flusso()) });
  for (let i = 0; i < 3; i += 1) await alterno.run();
  await assert.rejects(alterno.run(), (e) => codiceDi(e) === 'CHATGPT_ACCESSO_NON_VALIDO');
  assert.equal(alterno.rinnovi.length, 3, 'at most three renewals after a refusal in one turn');
  assert.equal(righe(alterno.avvisi).filter((r) => r === 'quieta:ripreso').length, 1, 'one quiet row per turn');
  // a new turn starts from zero (request 8 is served, request 9 is refused and renewed again)
  alterno.giroNuovo();
  await alterno.run();
  await alterno.run();
  assert.equal(alterno.rinnovi.length, 4);
  assert.equal(righe(alterno.avvisi).filter((r) => r === 'quieta:ripreso').length, 2, 'the new turn has its own quiet row');
});

test('R116-04 (R4) — the renewal fails: its code, one request only, no «picking up» row', async () => {
  const b = banco({ rispondi: () => rifiuto401(), rinnova: async () => { throw Object.assign(new Error('The ChatGPT sign-in could not be reached.'), { code: 'CHATGPT_RETE' }); } });
  await assert.rejects(b.run(), (e) => codiceDi(e) === 'CHATGPT_RETE');
  assert.equal(b.richieste.length, 1);
  assert.deepEqual(righe(b.avvisi), ['viva:invio', 'viva:fine']);
  const scaduto = banco({ rispondi: () => rifiuto401(), rinnova: async () => { throw Object.assign(new Error('expired'), { code: 'CHATGPT_ACCESSO_SCADUTO' }); } });
  await assert.rejects(scaduto.run(), (e) => codiceDi(e) === 'CHATGPT_ACCESSO_SCADUTO');
});

test('R116-06 (R6) AL CONTRARIO — without the dependency (the CLI form) and for a key provider: requests, bodies, headers and rows as today', async () => {
  const cli = banco({ conDipendenza: false, rispondi: () => rifiuto401() });
  await assert.rejects(cli.run(), (e) => codiceDi(e) === 'CHATGPT_ACCESSO_NON_VALIDO');
  assert.equal(cli.richieste.length, 1);
  assert.deepEqual(cli.avvisi, [], 'the CLI form: no row at all on a refusal');
  // a key provider refused (401): the dependency is never called, and what happens is the same with or without it
  const completions = () => new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401, headers: { 'content-type': 'application/json' } });
  const esiti = [];
  for (const conDipendenza of [true, false]) {
    const b = banco({ conDipendenza, rispondi: completions, env: { OPENROUTER_API_KEY: 'sk-or-v1-CHIAVE-DI-PROVA' } });
    let codice = null;
    try { await b.run({ modello: 'z-ai/glm-5.3-flash' }); } catch (e) { codice = codiceDi(e) ?? e?.message; }
    esiti.push({ codice, richieste: b.richieste.map((r) => [r.url, r.aut, r.corpo]), avvisi: b.avvisi.map((a) => a.riga ?? a.frase?.testo ?? a.frase), rinnovi: b.rinnovi.length });
  }
  assert.equal(esiti[0].rinnovi, 0);
  assert.deepEqual(esiti[0], esiti[1]);
});

test('R116-07 (R7) — state 1: the token changes between two requests of the same turn ⇒ one quiet row; between turns ⇒ none; two changes ⇒ one', async () => {
  for (const conDipendenza of [true, false]) { // the row is born in the CLI form too (accepted by the CLI, 14:22)
    const b = banco({ conDipendenza });
    await b.run();
    assert.deepEqual(b.avvisi, []);
    b.stato.token = 'TOKEN-B';
    await b.run();
    assert.deepEqual(righe(b.avvisi), ['quieta:rinnovato']);
    assert.deepEqual(b.avvisi[0].dati, { esito: 'rinnovato', allInvio: false });
    b.stato.token = 'TOKEN-C';
    await b.run();
    assert.equal(b.avvisi.length, 1, 'at most one per turn');
    b.giroNuovo();
    b.stato.token = 'TOKEN-D';
    await b.run();
    assert.equal(b.avvisi.length, 1, 'a new turn with a token other than the last turn: nothing to say');
  }
});

test('R116-08 (R8) — Stop during the renewal: stops at once, no repeat', async () => {
  const controllo = new AbortController();
  const b = banco({ rispondi: () => rifiuto401(), rinnova: () => { setTimeout(() => controllo.abort(), 5); return new Promise(() => {}); } });
  const inizio = Date.now();
  await assert.rejects(b.run({ segnaleStop: controllo.signal }), (e) => e?.name === 'AbortError' || codiceDi(e) === 'ABORT_ERR' || /abort/iu.test(String(e?.message)));
  assert.ok(Date.now() - inizio < 5000);
  assert.equal(b.richieste.length, 1);
});

test('R116-09 (R9) — the phone: the live row asks the app for a token and carries the fingerprint of the refused one (Mobile C1)', async () => {
  const b = banco({ dallApp: true, rispondi: (n) => (n === 1 ? rifiuto401() : flusso()) });
  await b.run();
  const invio = b.avvisi.find((a) => a.riga === 'rinnovo-accesso' && a.dati.fase === 'invio');
  assert.equal(invio.dati.chiedeTokenAllApp, true);
  assert.equal(invio.dati.impronta, impronta('TOKEN-1'));
  assert.match(invio.dati.impronta, /^[0-9a-f]{16}$/u);
  assert.equal(JSON.stringify(b.avvisi).includes('TOKEN-1'), false);
});

test('R116-09b (R9) — the guest custody waits ≤10 s for a NEW token pushed by the app; the same token does not count; none ⇒ CHATGPT_TOKEN_DA_RINNOVARE', async () => {
  const ORA = 1_800_000_000_000;
  const ospite = creaAccessoChatgptOspite({ clock: () => ORA });
  ospite.ricevi({ accessToken: 'VECCHIO', scadeAlle: ORA + 3600_000 });
  const attesa = ospite.attendiTokenNuovo({ rifiutato: 'VECCHIO', entroMs: 1000 });
  ospite.ricevi({ accessToken: 'VECCHIO', scadeAlle: ORA + 3600_000 }); // the same token again: ignored
  let risolta = false;
  void attesa.then(() => { risolta = true; }, () => {});
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(risolta, false, 'the refused token does not end the wait');
  ospite.ricevi({ accessToken: 'NUOVO', scadeAlle: ORA + 3600_000 });
  assert.equal(await attesa, 'NUOVO');
  assert.equal(await ospite.tokenDiAccesso(), 'NUOVO');
  // nothing arrives: the code of today, and the old token is forgotten
  const muto = creaAccessoChatgptOspite({ clock: () => ORA });
  muto.ricevi({ accessToken: 'VECCHIO', scadeAlle: ORA + 3600_000 });
  await assert.rejects(muto.attendiTokenNuovo({ rifiutato: 'VECCHIO', entroMs: 30 }), (e) => e.code === CODICE_DA_RINNOVARE);
  await assert.rejects(muto.tokenDiAccesso(), (e) => e.code === CODICE_DA_RINNOVARE);
  // a token already different from the refused one is used at once (the «Reload» step)
  const gia = creaAccessoChatgptOspite({ clock: () => ORA });
  gia.ricevi({ accessToken: 'GIA-NUOVO', scadeAlle: ORA + 3600_000 });
  assert.equal(await gia.attendiTokenNuovo({ rifiutato: 'VECCHIO', entroMs: 30 }), 'GIA-NUOVO');
  // Stop during the wait
  const fermo = creaAccessoChatgptOspite({ clock: () => ORA });
  const c = new AbortController();
  const p = fermo.attendiTokenNuovo({ rifiutato: 'X', entroMs: 10_000, signal: c.signal });
  c.abort();
  await assert.rejects(p, (e) => e?.name === 'AbortError');
});

/* Una sessione intera: agent-service vero, kernel vero, la rete finta. Gli eventi come li vedono PC, telefono e CLI. */
async function sessioneIntera(t, { rispondi, dallApp = false, conDipendenza = true }) {
  const b = banco({ rispondi, dallApp, conDipendenza });
  const cartella = mkdtempSync(join(tmpdir(), 'talos-rinnovo-116-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const eventi = [];
  await avviaSessione({ cartella, task: { consegna: 'Rispondi senza strumenti.' }, modello: 'chatgpt:gpt-6-sol', chiave: 'unused-local-only',
    onEvento: (e, opzioni = {}) => eventi.push({ ...e, _durevole: opzioni?.durable === true }),
    talosLavoraFn: (opts) => talosLavora({ ...opts, giriMassimi: 1, fetchDiRete: creaFetchMultiProvider(b.rete, { providerStore: b.store, dipendenze: b.dipendenze, onAvviso: opts.onAvviso }) }) });
  return { b, eventi };
}

test('R116-10 (R1, R11) — through a whole session: the live row is ephemeral on the retry channel, the quiet row is durable, the turn ends normally', async (t) => {
  const { b, eventi } = await sessioneIntera(t, { rispondi: (n) => (n === 1 ? rifiuto401() : flusso('Ripreso.')) });
  const inizio = eventi.find((e) => e.type === 'RunStarted');
  const vive = eventi.filter((e) => e.name === 'talos.provider-retry' && e.value?.canale === 'rinnovo-accesso');
  assert.deepEqual(vive.map((e) => e.value.fase), ['invio', 'fine']);
  for (const e of vive) {
    assert.equal(e._durevole, false, 'the live row is not written to the journal');
    assert.equal(e.value.schema, 'talos.provider-retry.v1');
    assert.equal(e.value.runId, inizio.runId);
    assert.equal(e.value.threadId, inizio.threadId);
    assert.equal(e.value.tentativo, 1);
    assert.equal(e.value.tentativiMassimi, 1);
    assert.equal('httpStatus' in e.value, false, 'the 401 is not shown');
  }
  const quiete = eventi.filter((e) => e.name === 'talos.accesso-chatgpt');
  assert.equal(quiete.length, 1);
  assert.equal(quiete[0]._durevole, true);
  assert.equal(quiete[0].value.schema, 'talos.accesso-chatgpt.v1');
  assert.equal(quiete[0].value.esito, 'ripreso');
  assert.equal(quiete[0].value.allInvio, false);
  assert.equal(quiete[0].value.runId, inizio.runId);
  assert.equal(quiete[0].value.threadId, inizio.threadId);
  assert.match(quiete[0].value.testo, /ChatGPT sign-in/u);
  assert.ok(!Number.isNaN(Date.parse(quiete[0].value.at)));
  assert.ok(eventi.some((e) => e.type === 'RunFinished'), 'the turn is not closed by the refusal');
  const testi = eventi.filter((e) => e.type === 'TextMessageContent').map((e) => e.delta).join(' ');
  assert.doesNotMatch(testi, /sign-in|Renewing/iu, 'never a bubble in the chat');
  assert.equal(JSON.stringify(eventi).includes('TOKEN-'), false);
  assert.equal(b.richieste.length, 2);
});

test('R116-10b (R9) — through a whole session on the phone: the live row carries chiedeTokenAllApp and the fingerprint', async (t) => {
  const { eventi } = await sessioneIntera(t, { dallApp: true, rispondi: (n) => (n === 1 ? rifiuto401() : flusso()) });
  const invio = eventi.find((e) => e.name === 'talos.provider-retry' && e.value?.canale === 'rinnovo-accesso' && e.value.fase === 'invio');
  assert.equal(invio.value.chiedeTokenAllApp, true);
  assert.equal(invio.value.impronta, impronta('TOKEN-1'));
});

/* R10 — la ripresa con `ripresaDopo` sul registro vero. Il primo giro finisce col codice dell'accesso, il secondo risponde. */
function bancoRegistro(t, { primo = 'nulla' } = {}) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-116-store-'));
  const cartella = mkdtempSync(join(tmpdir(), 'talos-116-prog-'));
  let giri = 0;
  const registro = createSessionRegistry({
    cartellaStore, modello: 'vendor/modello', chiave: 'k', chiaveFn: () => 'k', cartellaEsisteFn: () => true,
    guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneFn: (taskId) => ({ taskId, cartella, task: { id: taskId, consegna: 'Dimmi ciao.' }, comandoProva: null }),
    avviaSessioneFn: (input) => avviaSessione({ ...input,
      talosLavoraFn: (ri) => {
        giri += 1;
        const numero = giri;
        return talosLavora({ ...ri, giriMassimi: 1, fetchDiRete: async (_url, opzioni) => {
          corpoSenzaMarcatori(opzioni.body);
          if (numero === 1) {
            if (primo === 'testo' && ri.onTesto) await ri.onTesto('Inizio…');
            throw Object.assign(new Error('The ChatGPT sign-in is no longer valid.'), { code: 'CHATGPT_ACCESSO_NON_VALIDO' });
          }
          return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'ciao' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
        } });
      } }),
  });
  t.after(async () => { try { await registro.chiudi?.(); } catch { /* già chiuso */ } try { await attendiScritture({ cartellaStore }); } catch { /* pulizia */ }
    rimuoviCartellaDiProva(cartellaStore); rimuoviCartellaDiProva(cartella); });
  return { registro };
}
async function attendi(condizione, cosa) {
  const fino = Date.now() + 15000;
  while (Date.now() < fino) { if (condizione()) return; await new Promise((r) => setTimeout(r, 10)); }
  assert.fail(`mai successo: ${cosa}`);
}
const terminali = (registro, id) => (registro.esporta(id)?.eventi ?? []).filter((e) => e.type === 'RunFinished' || e.type === 'RunError').length;

test('R116-11 (R10) — resume { ripresaDopo }: the durable row right after the RunStarted, with allInvio from the failed turn', async (t) => {
  for (const [ripresaDopo, esitoAtteso] of [['accesso-rifatto', 'rientrato'], ['rete-tornata', 'raggiunto'], ['rinnovo', 'ripreso']]) {
    const { registro } = bancoRegistro(t);
    const { sessionId } = registro.avvia('task-116');
    await attendi(() => terminali(registro, sessionId) >= 1, 'il primo giro');
    const esito = registro.resume(sessionId, null, [], { ripresaDopo });
    assert.equal('erroreAvvio' in esito, false, JSON.stringify(esito));
    await attendi(() => terminali(registro, sessionId) >= 2, 'il giro ripreso');
    const eventi = registro.esporta(sessionId).eventi;
    const inizi = eventi.map((e, i) => (e.type === 'RunStarted' ? i : -1)).filter((i) => i >= 0);
    const riga = eventi.findIndex((e) => e.type === 'CUSTOM' && e.name === 'talos.accesso-chatgpt');
    assert.ok(riga > inizi[1], `${ripresaDopo}: after the second RunStarted`);
    const valore = eventi[riga].value;
    assert.equal(valore.schema, 'talos.accesso-chatgpt.v1');
    assert.equal(valore.esito, esitoAtteso);
    assert.equal(valore.allInvio, true, 'the failed turn produced nothing: «sending your message»');
    assert.equal(valore.runId, eventi[inizi[1]].runId);
    assert.equal(valore.threadId, sessionId);
    assert.equal(typeof valore.testo, 'string');
  }
});

test('R116-12 (R10) AL CONTRARIO — resume without ripresaDopo writes no row; an unknown value is QUERY_INVALID', async (t) => {
  const { registro } = bancoRegistro(t);
  const { sessionId } = registro.avvia('task-116');
  await attendi(() => terminali(registro, sessionId) >= 1, 'il primo giro');
  registro.resume(sessionId, null, []);
  await attendi(() => terminali(registro, sessionId) >= 2, 'il giro ripreso');
  assert.equal(registro.esporta(sessionId).eventi.some((e) => e.name === 'talos.accesso-chatgpt'), false);
  // the body parser of the route
  assert.deepEqual(httpApp.separaRipresaDopo({}), { corpo: {}, ripresaDopo: null });
  assert.deepEqual(httpApp.separaRipresaDopo({ messaggio: 'ciao' }), { corpo: { messaggio: 'ciao' }, ripresaDopo: null });
  assert.deepEqual(httpApp.separaRipresaDopo({ ripresaDopo: 'accesso-rifatto' }), { corpo: {}, ripresaDopo: 'accesso-rifatto' });
  assert.deepEqual(httpApp.separaRipresaDopo({ ripresaDopo: 'rinnovo', messaggio: 'x' }), { corpo: { messaggio: 'x' }, ripresaDopo: 'rinnovo' });
  for (const sbagliato of ['login', '', null, 1, 'ACCESSO-RIFATTO']) assert.throws(() => httpApp.separaRipresaDopo({ ripresaDopo: sbagliato }), (e) => e.code === 'QUERY_INVALID');
});

/* La seconda porta (owner 14:22): `chatgpt_account` `sign_in` dietro la carta dei permessi; l'anteprima con testo della CLI. */
function modelloCheChiama(chiamate) {
  const richieste = [];
  let n = 0;
  const fetchDiRete = async (_url, init) => {
    richieste.push(corpoSenzaMarcatori(init.body));
    n += 1;
    const message = n === 1
      ? { role: 'assistant', content: null, tool_calls: chiamate.map(([id, name, args]) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } })) }
      : { role: 'assistant', content: 'fatto' };
    return new Response(JSON.stringify({ choices: [{ message, finish_reason: n === 1 ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } });
  };
  return { fetchDiRete, richieste };
}
const esitoDi = (richieste, id) => richieste.flatMap((r) => r.messages).find((m) => m.role === 'tool' && m.tool_call_id === id)?.content;
function accessoFinto(stato, { rifiutato = false } = {}) {
  const finto = { inizi: 0, stato: () => ({ ...stato }), async inizia() { finto.inizi += 1; return { indirizzo: 'x' }; }, async esci() { return { revocaConfermata: true }; },
    rifiutatoDopoRinnovo: () => rifiutato };
  return finto;
}
async function giroConAttrezzo(t, { ospite, approva = true, livelloAccesso = 'scrittura-progetto', chiamate = [['s1', 'chatgpt_account', { action: 'sign_in' }]] }) {
  const { fetchDiRete, richieste } = modelloCheChiama(chiamate);
  const carte = [];
  const esiti = [];
  const cartella = mkdtempSync(join(tmpdir(), 'talos-116-attrezzo-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  await talosLavora({ cartella, task: { consegna: 'prova' }, modello: 'f', chiave: 'k', giriMassimi: 3, fetchDiRete, livelloAccesso,
    strumentiEstesi: ['chatgpt_account'], chiediApprovazioneFn: async (azione) => { carte.push(azione); return approva; }, onFornitoriFn: ospite,
    onGiro: (e) => { if (e?.tipo === 'tool-esito') esiti.push(e); } });
  return { richieste, carte, esiti };
}

test('R116-14 — chatgpt_account sign_in: the enum and the description say it; the card first, then the text that the sign-in card is in the conversation', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'talos-116-ospite-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  const providerStore = createProviderCredentialStore({ env: {}, runtimeFile: join(dir, 'providers.json') });
  const accesso = accessoFinto({ collegato: false, email: null, pianoAbilitato: false });
  const ospite = creaOspiteFornitori({ providerStore, accessoChatgpt: accesso })({});
  const fasi = [];
  const conFasi = async (nome, argomenti, opzioni) => { fasi.push(opzioni.fase); return ospite(nome, argomenti, opzioni); };
  const { richieste, carte } = await giroConAttrezzo(t, { ospite: conFasi });
  const attrezzo = richieste[0].tools.find((x) => x.function?.name === 'chatgpt_account');
  assert.deepEqual(attrezzo.function.parameters.properties.action.enum, ['status', 'disconnect', 'sign_in']);
  assert.match(attrezzo.function.description, /"sign_in" puts the ChatGPT sign-in card in the conversation/u);
  assert.equal(carte.length, 1, 'the person approves a card first');
  assert.equal(carte[0].tipo, 'chatgpt_account');
  assert.equal(carte[0].azione, 'sign_in');
  assert.equal(carte[0].fornitore, 'chatgpt');
  assert.deepEqual(fasi, ['anteprima', 'esegui']);
  assert.match(esitoDi(richieste, 's1'), /^The ChatGPT sign-in card is now in the conversation\. .*Do not ask again\.$/u);
  assert.equal(accesso.inizi, 0, 'the tool never opens the browser: the click is the person\'s');
});

test('R116-15 AL CONTRARIO — sign_in: card denied ⇒ nothing done; Full access still asks; an automation or nobody in front is refused; no keyring is refused', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'talos-116-ospite-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  const providerStore = createProviderCredentialStore({ env: {}, runtimeFile: join(dir, 'providers.json') });
  // D1 di R116: collegato ma rifiutato dopo il rinnovo ⇒ la carta c'è (il caso «valido» è R116-18)
  const fabbrica = creaOspiteFornitori({ providerStore, accessoChatgpt: accessoFinto({ collegato: true, email: 'nino@example.com', pianoAbilitato: true }, { rifiutato: true }) });
  const fasi = [];
  const conFasi = async (nome, argomenti, opzioni) => { fasi.push(opzioni.fase); return fabbrica({})(nome, argomenti, opzioni); };
  const negata = await giroConAttrezzo(t, { ospite: conFasi, approva: false });
  assert.deepEqual(fasi, ['anteprima']);
  assert.match(esitoDi(negata.richieste, 's1'), /^DECLINED\./u);
  const pieno = await giroConAttrezzo(t, { ospite: fabbrica({}), livelloAccesso: 'accesso-pieno' });
  assert.equal(pieno.carte.length, 1, 'the sign-in card asks in Full access too');
  assert.equal(pieno.carte[0].email, 'nino@example.com');
  for (const delGiro of [fabbrica({ automazioneDelGiro: 'auto-1' }), fabbrica({ soloLettura: true })]) {
    const r = await delGiro('chatgpt_account', { action: 'sign_in' }, { fase: 'anteprima' });
    assert.equal(r.ok, false);
    assert.match(r.messaggio, /nobody could sign in/u);
  }
  const senza = creaOspiteFornitori({ providerStore, accessoChatgpt: null })({});
  const r = await senza('chatgpt_account', { action: 'sign_in' }, { fase: 'anteprima' });
  assert.equal(r.ok, false);
  assert.match(r.messaggio, /system keyring is not available/u);
  const sbagliata = await fabbrica({})('chatgpt_account', { action: 'login' }, { fase: 'anteprima' });
  assert.match(sbagliata.messaggio, /needs action "status", "disconnect" or "sign_in"/u);
});

test('R116-16 (CLI, 14:30) — an anteprima { ok, carta:false, testo } is the outcome: no card, no esegui, that text to the model', async (t) => {
  const fasi = [];
  const FRASE = 'Only the person can sign in: with `talos provider login chatgpt` in a terminal, or from /provider in TALOS.';
  const ospiteCli = async (_nome, _argomenti, { fase }) => { fasi.push(fase); return fase === 'anteprima' ? { ok: true, carta: false, testo: FRASE } : { ok: true, testo: 'MAI' }; };
  const { richieste, carte } = await giroConAttrezzo(t, { ospite: ospiteCli });
  assert.deepEqual(carte, []);
  assert.deepEqual(fasi, ['anteprima']);
  assert.equal(esitoDi(richieste, 's1'), FRASE);
  // AL CONTRARIO: the anteprima of today ({ ok, carta:false } without text) still runs esegui
  const fasiDiOggi = [];
  const ospiteDiOggi = async (_nome, _argomenti, { fase }) => { fasiDiOggi.push(fase); return fase === 'anteprima' ? { ok: true, carta: false } : { ok: true, testo: 'stato letto' }; };
  const oggi = await giroConAttrezzo(t, { ospite: ospiteDiOggi });
  assert.deepEqual(fasiDiOggi, ['anteprima', 'esegui']);
  assert.equal(esitoDi(oggi.richieste, 's1'), 'stato letto');
});

/*
 * R12 — il tetto d'interruzioni (regola 17) sui 10 compiti tipici del §5, misurato sull'adattatore vero: carte = giri che finiscono
 *   con un codice d'accesso; avvisi = bolle `onAvviso` senza riga; righe quiete per giro. Atteso: 0/0 negli stati 1 e 2, ≤1 riga per
 *   giro, 1 carta per lo stato 3.
 */
test('R116-17 (R12) — the interruption cap on ten typical tasks: 0 cards and 0 notices in states 1 and 2, ≤1 quiet row per turn, 1 card in state 3', async () => {
  const misura = [];
  const compito = async (nome, { rispondi, rinnova = null, passi }) => {
    const b = banco({ rispondi, rinnova });
    let carte = 0;
    for (const passo of passi) {
      if (passo.token) b.stato.token = passo.token;
      try { await b.run(); } catch (e) { if (String(codiceDi(e)).startsWith('CHATGPT_')) carte += 1; else throw e; }
    }
    misura.push({ nome, carte, avvisi: b.avvisi.filter((a) => !a.riga).length, quiete: b.avvisi.filter((a) => a.riga === 'accesso-chatgpt').length });
  };
  for (let i = 0; i < 4; i += 1) await compito(`scadenza-${i}`, { passi: [{}, {}, { token: `RUOTATO-${i}` }, {}] });
  for (let i = 0; i < 2; i += 1) await compito(`401-${i}`, { rispondi: (n) => (n === 2 ? rifiuto401() : flusso()), passi: [{}, {}, {}] });
  await compito('cinque-figlie', { rispondi: (n) => (n === 1 ? rifiuto401() : flusso()), passi: [{}, {}, {}, {}, {}] });
  const giu = async () => { throw Object.assign(new Error('down'), { code: 'CHATGPT_RETE' }); };
  await compito('rete-giu', { rispondi: () => rifiuto401(), rinnova: giu, passi: [{}] });
  const revocato = async () => { throw Object.assign(new Error('expired'), { code: 'CHATGPT_ACCESSO_SCADUTO' }); };
  await compito('revocato', { rispondi: () => rifiuto401(), rinnova: revocato, passi: [{}] });
  await compito('all-invio', { rispondi: () => rifiuto401(), rinnova: revocato, passi: [{}] });
  assert.equal(misura.length, 10);
  for (const m of misura.slice(0, 7)) assert.deepEqual(m, { nome: m.nome, carte: 0, avvisi: 0, quiete: 1 });
  for (const m of misura.slice(7)) assert.deepEqual(m, { nome: m.nome, carte: 1, avvisi: 0, quiete: 0 });
});

/*
 * ⭐ Cure della revisione R116 (agente W2 del Desktop, 04/11/2026): D1 (sign_in con l'accesso valido non fa nascere la carta), D3 (≤1 riga
 *   quieta per giro), il mutante sopravvissuto B12 (un'anteprima con la carta E un testo chiede la carta), la lista degli eventi nella
 *   forma della CLI (R6, richiesta della CLI delle 14:22) e il segnale `schedaChatgpt` (Desktop 15:31, OK di Mobile, CLI e Performance).
 */
const VALIDO = { collegato: true, email: 'nino@example.com', pianoAbilitato: true };

test('R116-18 (D1 di R116, forma §8) — sign_in with a valid sign-in: no card, «Nothing to do» to the model, no esegui; refused after the renewal, not connected or plan off ⇒ the card', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'talos-116-ospite-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  const providerStore = createProviderCredentialStore({ env: {}, runtimeFile: join(dir, 'providers.json') });
  const valido = creaOspiteFornitori({ providerStore, accessoChatgpt: accessoFinto(VALIDO) })({});
  const anteprima = await valido('chatgpt_account', { action: 'sign_in' }, { fase: 'anteprima' });
  assert.equal(anteprima.ok, true);
  assert.equal(anteprima.carta, false, `anteprima: ${JSON.stringify(anteprima)}`);
  assert.match(anteprima.testo, /^Nothing to do: the ChatGPT sign-in is valid/u);
  assert.equal('schedaChatgpt' in anteprima, false);
  const fasi = [];
  const conFasi = async (nome, argomenti, opzioni) => { fasi.push(opzioni.fase); return valido(nome, argomenti, opzioni); };
  const giro = await giroConAttrezzo(t, { ospite: conFasi, livelloAccesso: 'accesso-pieno' });
  assert.deepEqual(giro.carte, [], 'no card, Full access or not');
  assert.deepEqual(fasi, ['anteprima'], 'the anteprima is the outcome: no esegui');
  assert.match(esitoDi(giro.richieste, 's1'), /^Nothing to do/u);
  // AL CONTRARIO: the card is born when the sign-in is not valid
  for (const [stato, opzioni] of [[VALIDO, { rifiutato: true }], [{ collegato: false, email: null, pianoAbilitato: false }, {}], [{ ...VALIDO, pianoAbilitato: false }, {}]]) {
    const ospite = creaOspiteFornitori({ providerStore, accessoChatgpt: accessoFinto(stato, opzioni) })({});
    const a = await ospite('chatgpt_account', { action: 'sign_in' }, { fase: 'anteprima' });
    assert.equal(a.carta, true, `${JSON.stringify(stato)} ${JSON.stringify(opzioni)}: ${JSON.stringify(a)}`);
  }
});

test('R116-19 (D1 di R116) — the adapter marks the custody only when the repeat after the renewal is refused again', async () => {
  const conSegno = (opzioni) => { const segni = []; const b = banco({ ...opzioni, extra: { segnaAccessoRifiutato: () => { segni.push(1); } } }); return { b, segni }; };
  const sempre = conSegno({ rispondi: () => rifiuto401() });
  await assert.rejects(sempre.b.run(), (e) => codiceDi(e) === 'CHATGPT_ACCESSO_NON_VALIDO');
  assert.equal(sempre.segni.length, 1, 'refused after the renewal: marked once');
  // AL CONTRARIO
  const ripresa = conSegno({ rispondi: (n) => (n === 1 ? rifiuto401() : flusso()) });
  await ripresa.b.run();
  assert.equal(ripresa.segni.length, 0, 'renewed and served: not marked');
  const giu = conSegno({ rispondi: () => rifiuto401(), rinnova: async () => { throw Object.assign(new Error('down'), { code: 'CHATGPT_RETE' }); } });
  await assert.rejects(giu.b.run(), (e) => codiceDi(e) === 'CHATGPT_RETE');
  assert.equal(giu.segni.length, 0, 'the renewal did not happen: nothing to say about the sign-in');
  const cli = conSegno({ conDipendenza: false, rispondi: () => rifiuto401() });
  await assert.rejects(cli.b.run(), (e) => codiceDi(e) === 'CHATGPT_ACCESSO_NON_VALIDO');
  assert.equal(cli.segni.length, 0, 'the CLI form: no renewal, no mark');
  // the PC wires the mark to its custody; the phone (custody in the app) does not
  const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  assert.ok(server.includes(": { rinnovaTokenDelPiano: ({ rifiutato }) => accessoChatgpt.rinnovaDopoRifiuto(rifiutato),\n        segnaAccessoRifiutato: () => accessoChatgpt.segnaRifiutatoDopoRinnovo() })"),
    'server.mjs gives the mark to the PC custody only');
});

test('R116-20 (D3 di R116, forma §5) — at most ONE quiet row per turn: the token changes by itself (state 1), then a 401 is renewed (state 2) ⇒ only «rinnovato»', async () => {
  const b = banco({ rispondi: (n) => (n === 3 ? rifiuto401() : flusso()) });
  await b.run();
  b.stato.token = 'TOKEN-2';
  await b.run();
  await b.run();
  assert.equal(b.richieste.length, 4, 'three requests and one repeat');
  assert.deepEqual(righe(b.avvisi), ['quieta:rinnovato', 'viva:invio', 'viva:fine']);
  // AL CONTRARIO: «ripreso» first, then the token changes ⇒ still one row, «ripreso»
  const c = banco({ rispondi: (n) => (n === 1 ? rifiuto401() : flusso()) });
  await c.run();
  c.stato.token = 'TOKEN-ALTRO';
  await c.run();
  assert.deepEqual(righe(c.avvisi).filter((r) => r.startsWith('quieta:')), ['quieta:ripreso']);
});

test('R116-21 (mutant B12 of R116) — an anteprima with the card AND a text still asks for the card, and runs esegui', async (t) => {
  const fasi = [];
  const ospite = async (_nome, _argomenti, { fase }) => { fasi.push(fase); return fase === 'anteprima' ? { ok: true, carta: true, testo: 'MAI AL MODELLO', azione: { fornitore: 'chatgpt', azione: 'sign_in', email: null } } : { ok: true, testo: 'fatto dopo la carta' }; };
  const { richieste, carte } = await giroConAttrezzo(t, { ospite });
  assert.equal(carte.length, 1, 'a guest that asks for the card gets it, even with a text');
  assert.deepEqual(fasi, ['anteprima', 'esegui']);
  assert.equal(esitoDi(richieste, 's1'), 'fatto dopo la carta');
  const negata = await giroConAttrezzo(t, { ospite, approva: false });
  assert.match(esitoDi(negata.richieste, 's1'), /^DECLINED\./u);
});

test('R116-22 (R6, CLI 14:22) — the event list in the CLI form: a 401 adds no event; a token changed in the same turn adds only the «rinnovato» row', async (t) => {
  const forma = (eventi) => eventi.filter((e) => e.type === 'CUSTOM').map((e) => `${e.name}${e.value?.canale ? `:${e.value.canale}` : ''}${e.value?.esito ? `:${e.value.esito}` : ''}`);
  const tipi = (eventi) => eventi.map((e) => (e.type === 'CUSTOM' ? `CUSTOM:${e.name}` : e.type));
  // a refusal in the CLI form: no live row, no quiet row (the turn ends as today)
  const rifiuto = await sessioneIntera(t, { conDipendenza: false, rispondi: () => rifiuto401() });
  assert.equal(rifiuto.b.richieste.length, 1);
  assert.deepEqual(forma(rifiuto.eventi).filter((n) => n.startsWith('talos.provider-retry:rinnovo-accesso') || n.startsWith('talos.accesso-chatgpt')), []);
  // a whole turn with the same token, and a whole turn where the token changes between two requests of the turn (the stream drops before
  // anything arrived and the same request goes again, as today): the only difference is ONE durable «rinnovato» row
  const caduta = () => new Response(new ReadableStream({ start(c) { setTimeout(() => c.error(Object.assign(new Error('The connection closed before the response finished.'), { code: 'PROVIDER_STREAM_INCOMPLETE' })), 5); } }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } });
  const stesso = await sessioneIntera(t, { conDipendenza: false, rispondi: (n) => (n === 1 ? caduta() : flusso('Ok.')) });
  const cambiato = await sessioneIntera(t, { conDipendenza: false, rispondi: (n, stato) => { if (n === 1) { stato.token = 'TOKEN-RUOTATO'; return caduta(); } return flusso('Ok.'); } });
  assert.equal(stesso.b.richieste.length, 2, 'the same request went twice');
  assert.equal(cambiato.b.richieste.length, 2);
  assert.deepEqual(cambiato.b.richieste.map((r) => r.aut), ['Bearer TOKEN-1', 'Bearer TOKEN-RUOTATO']);
  assert.deepEqual(forma(stesso.eventi).filter((n) => n.startsWith('talos.accesso-chatgpt') || n.includes('rinnovo-accesso')), []);
  const prima = tipi(stesso.eventi);
  const dopo = tipi(cambiato.eventi);
  const tolta = [...dopo];
  tolta.splice(dopo.indexOf('CUSTOM:talos.accesso-chatgpt'), 1);
  assert.deepEqual(tolta, prima, 'everything else is the same list');
  const quiete = cambiato.eventi.filter((e) => e.name === 'talos.accesso-chatgpt');
  assert.equal(quiete.length, 1);
  assert.equal(quiete[0].value.esito, 'rinnovato');
  assert.equal(quiete[0]._durevole, true);
  assert.equal(JSON.stringify(cambiato.eventi).includes('TOKEN-'), false, 'the token never reaches an event');
});

/* Il segnale ai clienti: la scheda c'è davvero. Impronta dello schema di `chatgpt_account` presa sul ramo a accafdf3f (Performance 15:29). */
const IMPRONTA_SCHEMA_CHATGPT_ACCOUNT = 'b9dd47db805ecf08506fb4913f53d7c1c776b4e22f3158036879ed33d3a6ba54';

test('R116-23 (Desktop 15:31, Mobile + CLI + Performance) — schedaChatgpt: true only when esegui of the guest says it put the card; the tool schema is byte-identical', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'talos-116-ospite-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  const providerStore = createProviderCredentialStore({ env: {}, runtimeFile: join(dir, 'providers.json') });
  const scollegato = creaOspiteFornitori({ providerStore, accessoChatgpt: accessoFinto({ collegato: false, email: null, pianoAbilitato: false }) })({});
  const messa = await giroConAttrezzo(t, { ospite: scollegato });
  assert.deepEqual(messa.esiti.map((e) => [e.toolCallId, e.schedaChatgpt ?? null, e.isError ?? null]), [['s1', true, null]]);
  const attrezzo = messa.richieste[0].tools.find((x) => x.function?.name === 'chatgpt_account');
  assert.equal(createHash('sha256').update(JSON.stringify(attrezzo)).digest('hex'), IMPRONTA_SCHEMA_CHATGPT_ACCOUNT, 'the tool schema the model sees did not change');
  assert.equal(JSON.stringify(messa.richieste).includes('schedaChatgpt'), false, 'the field never reaches the model');
  // the mark belongs to ONE call: the status read right after it in the same turn has none
  const due = await giroConAttrezzo(t, { ospite: scollegato, chiamate: [['s1', 'chatgpt_account', { action: 'sign_in' }], ['s2', 'chatgpt_account', { action: 'status' }]] });
  assert.deepEqual(due.esiti.map((e) => [e.toolCallId, e.schedaChatgpt ?? null]), [['s1', true], ['s2', null]]);
  // AL CONTRARIO: «Nothing to do» (valid sign-in), a guest that gives only text (the CLI, an old guest), a denied card, a failed esegui
  const valido = creaOspiteFornitori({ providerStore, accessoChatgpt: accessoFinto(VALIDO) })({});
  const soloTesto = async (_n, _a, { fase }) => (fase === 'anteprima' ? { ok: true, carta: false, testo: 'Only the person can sign in.' } : { ok: true, testo: 'MAI' });
  const vecchio = async (_n, _a, { fase }) => (fase === 'anteprima' ? { ok: true, carta: true, azione: { fornitore: 'chatgpt', azione: 'sign_in', email: null } } : { ok: true, testo: 'The ChatGPT sign-in card is now in the conversation.' });
  const rotto = async (_n, _a, { fase }) => (fase === 'anteprima' ? { ok: true, carta: true, azione: { fornitore: 'chatgpt', azione: 'sign_in', email: null } } : { ok: false, messaggio: 'no', schedaChatgpt: true });
  const anteprimaConSegno = async (_n, _a, { fase }) => (fase === 'anteprima' ? { ok: true, carta: false, testo: 'Nothing to do.', schedaChatgpt: true } : { ok: true, testo: 'MAI' });
  for (const [nome, ospite, approva] of [['valid', valido, true], ['text only', soloTesto, true], ['old guest', vecchio, true], ['denied', scollegato, false], ['failed', rotto, true], ['flag in the anteprima', anteprimaConSegno, true]]) {
    const g = await giroConAttrezzo(t, { ospite, approva });
    assert.equal(g.esiti.length, 1, nome);
    assert.equal('schedaChatgpt' in g.esiti[0], false, `${nome}: no field`);
  }
});

test('R116-24 (Desktop 15:31) — the field reaches the ToolCallResult of the whole session (PC, phone and CLI read the same event); without it the event is as before', async (t) => {
  const { toolCallResult } = await import('../src/agui-events.mjs');
  const base = { messageId: 'm', toolCallId: 't', content: 'c', isError: false };
  assert.deepEqual(toolCallResult({ ...base, schedaChatgpt: true }), { type: 'ToolCallResult', messageId: 'm', toolCallId: 't', content: 'c', role: 'tool', isError: false, schedaChatgpt: true });
  for (const altro of [undefined, false, 'true', 1]) assert.deepEqual(toolCallResult({ ...base, schedaChatgpt: altro }), toolCallResult(base), `${String(altro)}: identical to before`);
  const dir = mkdtempSync(join(tmpdir(), 'talos-116-ospite-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  const providerStore = createProviderCredentialStore({ env: {}, runtimeFile: join(dir, 'providers.json') });
  const ospite = creaOspiteFornitori({ providerStore, accessoChatgpt: accessoFinto({ collegato: false, email: null, pianoAbilitato: false }) })({});
  const cartella = mkdtempSync(join(tmpdir(), 'talos-116-sessione-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const eventi = [];
  const { fetchDiRete } = modelloCheChiama([['s1', 'chatgpt_account', { action: 'sign_in' }]]);
  await avviaSessione({ cartella, task: { consegna: 'Accedi a ChatGPT.' }, modello: 'f', chiave: 'k', onEvento: (e) => eventi.push(e),
    talosLavoraFn: (opts) => talosLavora({ ...opts, giriMassimi: 3, fetchDiRete, strumentiEstesi: ['chatgpt_account'], chiediApprovazioneFn: async () => true, onFornitoriFn: ospite }) });
  const risultato = eventi.find((e) => e.type === 'ToolCallResult' && e.toolCallId === 's1');
  assert.equal(risultato?.schedaChatgpt, true, JSON.stringify(risultato));
  assert.notEqual(risultato.isError, true);
});

/*
 * C2 of the chat block review (04/11, BASSA): past the cap of RINNOVI_DOPO_RIFIUTO_PER_GIRO renewals in one turn, a 401 is not renewed and
 * the turn ends with CHATGPT_ACCESSO_NON_VALIDO (card «Sign in and resume»), but the custody was not marked: `chatgpt_account` `sign_in`
 * then answered «Nothing to do: the ChatGPT sign-in is valid» and put no card. RFC 6750 §3.1: a 401 `invalid_token` means the token is
 * «expired, revoked, malformed, or invalid»; the client MAY get a new one and retry. When it may not retry any more, the sign-in is not valid.
 */
test('R116-25 (C2, review probe SONDA-X-116-1) — three renewals in the turn, then a 401: «Sign in» AND the custody is marked; no token in the error or the rows', async () => {
  let segni = 0;
  const b = banco({ rispondi: (n) => (n % 2 === 1 ? rifiuto401() : flusso()), extra: { segnaAccessoRifiutato: () => { segni += 1; } } });
  for (let i = 0; i < 3; i += 1) await b.run();
  assert.equal(segni, 0, 'three renewals that were served: nothing to mark');
  let errore = null;
  await assert.rejects(b.run(), (e) => { errore = e; return codiceDi(e) === 'CHATGPT_ACCESSO_NON_VALIDO'; });
  assert.equal(b.rinnovi.length, 3, 'the cap holds: no fourth renewal');
  assert.equal(segni, 1, 'a 401 that ends in «Sign in» marks the custody, so sign_in puts the card back');
  assert.doesNotMatch(JSON.stringify({ m: errore?.message, c: errore?.cause?.message, e: errore }), /TOKEN-\d/u, 'no token in the error');
  assert.doesNotMatch(JSON.stringify(b.avvisi), /TOKEN-\d/u, 'no token in the rows');
  // AL CONTRARIO: the CLI form (no renewal dependency) never marks, cap or not
  const cli = banco({ conDipendenza: false, rispondi: () => rifiuto401(), extra: { segnaAccessoRifiutato: () => { segni += 1; } } });
  for (let i = 0; i < 4; i += 1) await assert.rejects(cli.run(), (e) => codiceDi(e) === 'CHATGPT_ACCESSO_NON_VALIDO');
  assert.equal(segni, 1, 'the CLI form: no renewal, no mark');
});

test('R116-26 (C2, review probe SONDA-X-116-1b) — the same scene seen by the tool: before the cap «Nothing to do», after the 401 past the cap the card', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'talos-116-ospite-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  const providerStore = createProviderCredentialStore({ env: {}, runtimeFile: join(dir, 'providers.json') });
  let rifiutato = false; // the PC custody: `segnaRifiutatoDopoRinnovo` / `rifiutatoDopoRinnovo` (chatgpt-accesso.mjs)
  const accesso = { ...accessoFinto(VALIDO), rifiutatoDopoRinnovo: () => rifiutato };
  const ospite = creaOspiteFornitori({ providerStore, accessoChatgpt: accesso })({});
  const b = banco({ rispondi: (n) => (n % 2 === 1 ? rifiuto401() : flusso()), extra: { segnaAccessoRifiutato: () => { rifiutato = true; } } });
  for (let i = 0; i < 3; i += 1) await b.run();
  const prima = await ospite('chatgpt_account', { action: 'sign_in' }, { fase: 'anteprima' });
  assert.equal(prima.carta, false, `renewed and served: ${JSON.stringify(prima)}`);
  assert.match(String(prima.testo), /^Nothing to do: the ChatGPT sign-in is valid/u);
  /* Mobile's question, brief 174-177 task 5 (04/11/2026): the execution too. Before the cap esegui says «Nothing to do» and carries no
     card signal; after the refusal past the cap esegui puts the card and says so with `schedaChatgpt: true`
     (fornitori-per-il-modello.mjs, the sign_in branch), the field the core passes on the ToolCallResult (R116-23). */
  const primaEsegui = await ospite('chatgpt_account', { action: 'sign_in' }, { fase: 'esegui' });
  assert.match(String(primaEsegui.testo), /^Nothing to do: the ChatGPT sign-in is valid/u);
  assert.equal('schedaChatgpt' in primaEsegui, false, `no card before the cap: ${JSON.stringify(primaEsegui)}`);
  await assert.rejects(b.run(), (e) => codiceDi(e) === 'CHATGPT_ACCESSO_NON_VALIDO');
  const dopo = await ospite('chatgpt_account', { action: 'sign_in' }, { fase: 'anteprima' });
  assert.equal(dopo.carta, true, `past the cap the sign-in is not valid: ${JSON.stringify(dopo)}`);
  assert.equal('schedaChatgpt' in dopo, false, 'never in the preview');
  const dopoEsegui = await ospite('chatgpt_account', { action: 'sign_in' }, { fase: 'esegui' });
  assert.equal(dopoEsegui.ok, true);
  assert.equal(dopoEsegui.schedaChatgpt, true, `past the cap esegui puts the card and says so: ${JSON.stringify(dopoEsegui)}`);
  assert.match(String(dopoEsegui.testo), /^The ChatGPT sign-in card is now in the conversation/u);
});
