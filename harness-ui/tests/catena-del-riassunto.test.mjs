/*
 * C6-bis (owner 28/10/2026; contratto CONTRATTO-RIASSUNTO-MAI-ASPETTARE-2026-10-27.md, sezioni C6-bis, OK di CLI e Mobile 30/10):
 * il classificatore degli errori del riassunto e la catena scelto → riserva → senza modello. Le prove chieste dalle due sessioni:
 *   Mobile: rete assente, posto locale occupato, PC che ospita spento ⇒ «bloccato», MAI «inutilizzabile»;
 *   CLI: un errore di undici (TypeError con `cause.code`) attraverso l'involucro dei fornitori ⇒ 'rete'; lo Stop non è mai 'rete'.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { classificaErroreDelRiassunto, catenaDelRiassunto, anelloDaUsare, dimenticaModello, formaDiModelloRiconosciuta, statoPerTuttoIlPc, MEMORIA_INUTILIZZABILE_MS, MOTIVI_BLOCCATO, MOTIVI_INUTILIZZABILE, ricordaGiudizio, statoDallaMemoria } from '../src/kernel/catena-del-riassunto.mjs';
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { chiamaConRitenta } from '../src/kernel/talosHarness.mjs';
import { riassumiPerCompattazione } from '../src/agent-service.mjs';

const ORA = Date.parse('2026-10-30T12:00:00Z');
const fetchFallito = (cause) => Object.assign(new TypeError('fetch failed'), { cause });

test('C6BIS-CLASSE-01 — 401/403/404 sono inutilizzabili; 429 e 5xx bloccati per limite, con l’ora solo se dichiarata', () => {
  const conStato = (stato, extra = {}) => Object.assign(new Error(`HTTP ${stato}`), { stato, ...extra });
  assert.deepEqual(classificaErroreDelRiassunto(conStato(401)), { stato: 'inutilizzabile', motivo: 'accesso-negato' });
  assert.deepEqual(classificaErroreDelRiassunto(conStato(403)), { stato: 'inutilizzabile', motivo: 'accesso-negato' });
  assert.deepEqual(classificaErroreDelRiassunto(conStato(404)), { stato: 'inutilizzabile', motivo: 'non-trovato' });
  assert.deepEqual(classificaErroreDelRiassunto({ httpStatus: 404 }), { stato: 'inutilizzabile', motivo: 'non-trovato' }, 'anche col nome del contratto');
  assert.deepEqual(classificaErroreDelRiassunto(conStato(429, { retryAt: ORA + 60_000 }), { ora: ORA }), { stato: 'bloccato', motivo: 'limite', finoAlle: ORA + 60_000 });
  assert.deepEqual(classificaErroreDelRiassunto(conStato(429, { retryAt: ORA - 1 }), { ora: ORA }), { stato: 'bloccato', motivo: 'limite', finoAlle: null }, 'un’ora già passata non è un’ora');
  assert.deepEqual(classificaErroreDelRiassunto(conStato(503)), { stato: 'bloccato', motivo: 'limite', finoAlle: null });
  assert.deepEqual(classificaErroreDelRiassunto({ senzaChiave: true }), { stato: 'inutilizzabile', motivo: 'senza-chiave' });
  assert.deepEqual(classificaErroreDelRiassunto({ nonConfigurato: true }), { stato: 'inutilizzabile', motivo: 'non-configurato' });
});

test('C6BIS-RETE-01 (Mobile a, c; CLI) — la rete non è MAI inutilizzabile: undici a più livelli, AggregateError, tempo scaduto', () => {
  const rete = { stato: 'bloccato', motivo: 'rete', finoAlle: null };
  assert.deepEqual(classificaErroreDelRiassunto(fetchFallito({ code: 'ENOTFOUND' })), rete, 'telefono offline: ENOTFOUND in cause.code');
  assert.deepEqual(classificaErroreDelRiassunto(fetchFallito({ cause: { code: 'ECONNRESET' } })), rete, 'due livelli sotto');
  assert.deepEqual(classificaErroreDelRiassunto(fetchFallito(Object.assign(new AggregateError([{ code: 'ECONNREFUSED' }, { code: 'ECONNREFUSED' }]), {}))), rete, 'happy eyeballs');
  assert.deepEqual(classificaErroreDelRiassunto(fetchFallito({ code: 'UND_ERR_CONNECT_TIMEOUT' })), rete, 'il PC che ospita il modello è spento');
  assert.deepEqual(classificaErroreDelRiassunto(Object.assign(new Error('timed out'), { name: 'TimeoutError' })), rete);
  assert.deepEqual(classificaErroreDelRiassunto(new TypeError('fetch failed')), rete, 'senza causa: il messaggio di undici basta');
  /* senza la frase di undici: solo la causa, due livelli sotto, o dentro un AggregateError, dice che è la rete */
  assert.deepEqual(classificaErroreDelRiassunto(new Error('request failed', { cause: new Error('socket', { cause: Object.assign(new Error('reset'), { code: 'ECONNRESET' }) }) })), rete, 'la causa due livelli sotto');
  assert.deepEqual(classificaErroreDelRiassunto(new Error('connect failed', { cause: new AggregateError([new Error('v6'), Object.assign(new Error('v4'), { code: 'ECONNREFUSED' })]) })), rete, 'dentro un AggregateError');
  assert.equal(classificaErroreDelRiassunto(new Error('request failed', { cause: new Error('socket', { cause: new Error('nessun codice') }) })), null, 'verso contrario: senza codice di rete non è la rete');
  for (const e of [fetchFallito({ code: 'ENOTFOUND' }), new TypeError('fetch failed')]) assert.ok(MOTIVI_BLOCCATO.includes(classificaErroreDelRiassunto(e).motivo));
});

test('C6BIS-ACCESSO-01 (D7, 01/11/2026) — senza chiave o senza collegamento ⇒ inutilizzabile; motore locale non pronto ⇒ bloccato senza ora, e la catena lo salta', () => {
  assert.deepEqual(classificaErroreDelRiassunto({ code: 'PROVIDER_KEY_MISSING' }), { stato: 'inutilizzabile', motivo: 'senza-chiave' });
  assert.deepEqual(classificaErroreDelRiassunto({ code: 'CHATGPT_NON_COLLEGATO' }), { stato: 'inutilizzabile', motivo: 'senza-chiave' });
  const giudizio = classificaErroreDelRiassunto({ code: 'LOCAL_RUNTIME_NOT_READY' });
  assert.deepEqual(giudizio, { stato: 'bloccato', motivo: 'motore-non-pronto', finoAlle: null });
  /* un motivo fuori da MOTIVI_BLOCCATO vale «pronto»: lo stesso modello si richiamerebbe subito */
  const catena = catenaDelRiassunto({ scelto: 'local:qwen', riserva: { provider: 'zai', model: 'glm-4.7' }, statoDi: (id) => (id === 'local:qwen' ? giudizio : null), ora: ORA });
  assert.deepEqual([catena[0].stato, catena[0].motivo], ['bloccato', 'motore-non-pronto']);
  assert.equal(anelloDaUsare(catena).modello, 'zai:glm-4.7');
});

test('C6BIS-STOP-01 (verso contrario) — lo Stop e gli errori che non sono «il modello non va» non si classificano', () => {
  assert.equal(classificaErroreDelRiassunto(Object.assign(new Error('⛔ stopped on request'), { fermatoSuRichiesta: true })), null);
  assert.equal(classificaErroreDelRiassunto(Object.assign(new Error('This operation was aborted'), { name: 'AbortError', cause: { code: 'ECONNRESET' } })), null, 'un AbortError non è mai la rete');
  assert.equal(classificaErroreDelRiassunto(Object.assign(new Error('x'), { classe: 'contesto' })), null, 'il contesto pieno non è il modello');
  assert.equal(classificaErroreDelRiassunto(Object.assign(new Error('x'), { classe: 'ignoto' })), null);
  assert.equal(classificaErroreDelRiassunto(new Error('qualcosa di mai visto')), null);
  assert.equal(classificaErroreDelRiassunto(null), null);
  assert.equal(classificaErroreDelRiassunto(Object.assign(new Error('x'), { stato: 400 })), null, 'una richiesta non valida non toglie il modello');
});

async function bancoFornitore(t, rispondi) {
  const valori = new Map();
  const server = createServer(async (req, res) => { for await (const _ of req) { /* consuma */ } rispondi(req, res); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise((r) => { server.closeAllConnections(); server.close(r); }));
  assert.notEqual(server.address().port, 4174);
  const store = createProviderCredentialStore({ env: { DEEPSEEK_API_KEY: 'finta-deepseek' }, keyring: { get: (s, p) => valori.get(s + p) ?? null, set: (s, p, v) => valori.set(s + p, v), remove: (s, p) => valori.delete(s + p) } });
  store.setRuntime('deepseek', { endpoint: `http://127.0.0.1:${server.address().port}/deepseek` });
  return { providerStore: store, dipendenze: { leggiChiave: (p) => store.getKey(p), leggiRuntime: (p) => store.getRuntime(p) }, fallbackProviders: [] };
}
const chiamata = { modello: 'deepseek:deepseek-chat', chiave: 'finta', messaggi: [{ role: 'system', content: 'Riassumi.' }, { role: 'user', content: 'Storia.' }], attrezzi: [], dormi: async () => {}, caso: () => 0, tentativiMassimi: 1 };
const erroreDallaStradaVera = async (f) => {
  try { await f.eseguiConFallback((aggiunte) => chiamaConRitenta({ ...chiamata, ...aggiunte }), chiamata); } catch (e) { return e; }
  assert.fail('la chiamata doveva fallire');
};

test('C6BIS-INVOLUCRO-01 (CLI) — un TypeError di undici con cause ENOTFOUND, attraverso l’involucro dei fornitori e il nucleo ⇒ rete', async (t) => {
  const opzioni = await bancoFornitore(t, (_q, res) => { res.writeHead(200); res.end('{}'); });
  const f = creaFetchMultiProvider(async () => { throw fetchFallito({ code: 'ENOTFOUND', hostname: 'api.deepseek.com' }); }, opzioni);
  const errore = await erroreDallaStradaVera(f);
  assert.deepEqual(classificaErroreDelRiassunto(errore), { stato: 'bloccato', motivo: 'rete', finoAlle: null }, `errore: ${errore?.code} ${errore?.classe} ${errore?.message}`);
});

test('C6BIS-INVOLUCRO-02 — 403 e 404 del fornitore, attraverso l’involucro: inutilizzabili, col motivo giusto', async (t) => {
  for (const [stato, motivo] of [[403, 'accesso-negato'], [404, 'non-trovato'], [401, 'accesso-negato']]) {
    const opzioni = await bancoFornitore(t, (_q, res) => { res.writeHead(stato, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: `refused ${stato}` } })); });
    const errore = await erroreDallaStradaVera(creaFetchMultiProvider(fetch, opzioni));
    assert.deepEqual(classificaErroreDelRiassunto(errore), { stato: 'inutilizzabile', motivo }, `HTTP ${stato}: ${errore?.stato} ${errore?.classe} ${errore?.message}`);
  }
});

test('C6BIS-CATENA-01 — scelto pronto; bloccato fino a un’ora ⇒ la riserva; ora passata ⇒ di nuovo lo scelto; mai una riserva doppia', () => {
  const statoDi = (mappa) => (id) => mappa[id] ?? null;
  const base = { scelto: 'z-ai/glm-5.3-flash', riserva: { provider: 'openrouter', model: 'qwen/qwen3.7-flash' }, modelloConversazione: 'anthropic/claude-x', ora: ORA };
  const pronta = catenaDelRiassunto(base);
  assert.deepEqual(pronta.map((a) => [a.ruolo, a.modello, a.stato]), [['scelto', 'z-ai/glm-5.3-flash', 'pronto'], ['riserva', 'qwen/qwen3.7-flash', 'pronto'], ['senza-modello', null, 'pronto']]);
  assert.equal(anelloDaUsare(pronta).ruolo, 'scelto');
  const bloccata = catenaDelRiassunto({ ...base, statoDi: statoDi({ 'z-ai/glm-5.3-flash': { stato: 'bloccato', motivo: 'limite', finoAlle: ORA + 3_600_000 } }) });
  assert.deepEqual(bloccata[0], { ruolo: 'scelto', modello: 'z-ai/glm-5.3-flash', stato: 'bloccato', motivo: 'limite', finoAlle: ORA + 3_600_000 });
  assert.equal(anelloDaUsare(bloccata).ruolo, 'riserva');
  const riaperta = catenaDelRiassunto({ ...base, statoDi: statoDi({ 'z-ai/glm-5.3-flash': { stato: 'bloccato', motivo: 'limite', finoAlle: ORA - 1 } }) });
  assert.equal(anelloDaUsare(riaperta).ruolo, 'scelto', 'il limite si è riaperto: si torna al modello scelto');
  const tutte = catenaDelRiassunto({ ...base, statoDi: () => ({ stato: 'inutilizzabile', motivo: 'accesso-negato' }) });
  assert.equal(anelloDaUsare(tutte).ruolo, 'senza-modello', 'la chat non aspetta mai');
  assert.equal(catenaDelRiassunto({ ...base, riserva: { model: 'z-ai/glm-5.3-flash' } }).length, 2, 'una riserva uguale allo scelto non si ripete');
  assert.equal(catenaDelRiassunto({ ...base, riserva: { provider: 'openrouter', model: 'openrouter:z-ai/glm-5.3-flash'.replace('openrouter:', '') } }).length, 2);
});

test('C6BIS-CATENA-02 — il modello della conversazione fa da riserva SOLO se scelto; senza riserva si passa al riassunto senza modello', () => {
  const base = { scelto: 'z-ai/glm-5.3-flash', modelloConversazione: 'anthropic/claude-x', statoDi: () => ({ stato: 'bloccato', motivo: 'rete', finoAlle: null }) };
  assert.deepEqual(catenaDelRiassunto({ ...base, riserva: null }).map((a) => a.ruolo), ['scelto', 'senza-modello'], 'mai il modello della chat in automatico');
  const conConversazione = catenaDelRiassunto({ ...base, riserva: 'conversazione', statoDi: (id) => (id === 'z-ai/glm-5.3-flash' ? { stato: 'bloccato', motivo: 'rete' } : null) });
  assert.deepEqual(conConversazione.map((a) => [a.ruolo, a.modello]), [['scelto', 'z-ai/glm-5.3-flash'], ['riserva', 'anthropic/claude-x'], ['senza-modello', null]]);
  assert.equal(anelloDaUsare(conConversazione).modello, 'anthropic/claude-x');
  assert.equal(catenaDelRiassunto({ ...base, riserva: { provider: 'zai', model: 'glm-4.7' } })[1].modello, 'zai:glm-4.7', 'la via diretta resta nell’id');
});

test('C6BIS-POSTO-01 (Mobile b) — un modello locale DIVERSO da quello caricato non si tenta durante un giro (mai scaricare la chat)', () => {
  const base = { scelto: 'local:gemma-4-e2b', riserva: { provider: 'local', model: 'qwen3.5-0.8b' }, modelloConversazione: 'local:lfm2.5-1.2b', localeCaricato: 'local:lfm2.5-1.2b' };
  const nelGiro = catenaDelRiassunto({ ...base, inUnGiro: true });
  assert.deepEqual(nelGiro.map((a) => [a.ruolo, a.stato, a.motivo]), [['scelto', 'bloccato', 'posto-occupato'], ['riserva', 'bloccato', 'posto-occupato'], ['senza-modello', 'pronto', undefined]]);
  assert.equal(anelloDaUsare(nelGiro).ruolo, 'senza-modello');
  assert.equal(anelloDaUsare(catenaDelRiassunto({ ...base, scelto: 'local:lfm2.5-1.2b', inUnGiro: true })).ruolo, 'scelto', 'lo stesso modello caricato si usa');
  assert.equal(anelloDaUsare(catenaDelRiassunto({ ...base, inUnGiro: false })).ruolo, 'scelto', 'fuori da un giro (a fine risposta) si può caricare');
  assert.equal(anelloDaUsare(catenaDelRiassunto({ ...base, scelto: 'z-ai/glm-5.3-flash', inUnGiro: true })).ruolo, 'scelto', 'un modello remoto non occupa il posto');
  /* `locale-ospite:` è il motore dell'app che ospita r4, cioè il telefono (`accesso-locale-ospite.mjs`): ha un posto solo anche lui (Mobile, FE-053, 01/11) */
  const sulTelefono = { ...base, scelto: 'locale-ospite:gemma-4', riserva: null, modelloConversazione: 'locale-ospite:lfm2.5', localeCaricato: 'locale-ospite:lfm2.5', inUnGiro: true };
  assert.deepEqual(catenaDelRiassunto(sulTelefono).map((a) => [a.ruolo, a.stato, a.motivo]), [['scelto', 'bloccato', 'posto-occupato'], ['senza-modello', 'pronto', undefined]]);
  assert.equal(anelloDaUsare(catenaDelRiassunto({ ...sulTelefono, scelto: 'locale-ospite:lfm2.5' })).ruolo, 'scelto', 'lo stesso modello aperto nel telefono si usa');
  assert.equal(anelloDaUsare(catenaDelRiassunto({ ...sulTelefono, inUnGiro: false, localeCaricato: null })).ruolo, 'scelto', 'senza un modello aperto il posto è libero');
  for (const a of nelGiro) if (a.motivo) assert.ok(MOTIVI_BLOCCATO.includes(a.motivo) || MOTIVI_INUTILIZZABILE.includes(a.motivo));
});

/* FE-053 (01/11/2026): le Impostazioni non guardano una conversazione. Un limite del piano o un accesso negato valgono per tutto il PC */
test('CATENA-IMP-01 — lo stato di un modello per tutto il PC: vince l\'inutilizzabile, poi l\'attesa più lunga, e un ricordo scaduto non conta', () => {
  const ora = 1_000_000;
  const bloccato = (finoAlle) => new Map([['m', { stato: 'bloccato', motivo: 'limite', finoAlle, scadeAlle: finoAlle }]]);
  assert.equal(statoPerTuttoIlPc([new Map(), null], 'm', { ora }), null, 'nessuno sa niente');
  assert.equal(statoPerTuttoIlPc([bloccato(ora + 10), bloccato(ora + 99), bloccato(ora + 50)], 'm', { ora }).finoAlle, ora + 99);
  assert.equal(statoPerTuttoIlPc([bloccato(ora - 1)], 'm', { ora }), null, 'il limite si è riaperto');
  const negato = new Map([['m', { stato: 'inutilizzabile', motivo: 'accesso-negato', scadeAlle: ora + 5 }]]);
  assert.equal(statoPerTuttoIlPc([bloccato(ora + 99), negato], 'm', { ora }).stato, 'inutilizzabile');
  assert.equal(statoPerTuttoIlPc([negato, bloccato(ora + 99)], 'm', { ora }).stato, 'inutilizzabile', 'l\'ordine delle conversazioni non cambia l\'esito');
  /* Performance: un modello riuscito in A non resta bloccato per tutto il PC perché lo ricorda B */
  const inB = new Map(); ricordaGiudizio(inB, 'm', { stato: 'bloccato', motivo: 'limite', finoAlle: ora + 500 }, { ora });
  const inA = new Map(); dimenticaModello(inA, 'm', { ora: ora + 10 });
  assert.equal(statoPerTuttoIlPc([inB, inA], 'm', { ora: ora + 20 }), null, 'il successo è più recente');
  const dopo = new Map(); ricordaGiudizio(dopo, 'm', { stato: 'bloccato', motivo: 'limite', finoAlle: ora + 500 }, { ora: ora + 15 });
  assert.equal(statoPerTuttoIlPc([dopo, inA], 'm', { ora: ora + 20 }).motivo, 'limite', 'il guasto è più recente del successo');
  /* Mobile: l'avviso resta oltre i 15 minuti della memoria, finché il modello non risponde */
  const avvisato = new Map(); ricordaGiudizio(avvisato, 'm', { stato: 'inutilizzabile', motivo: 'accesso-negato' }, { ora });
  assert.equal(statoPerTuttoIlPc([avvisato], 'm', { ora: ora + MEMORIA_INUTILIZZABILE_MS + 1 }).motivo, 'accesso-negato');
  dimenticaModello(avvisato, 'm', { ora: ora + MEMORIA_INUTILIZZABILE_MS + 2 });
  assert.equal(statoPerTuttoIlPc([avvisato], 'm', { ora: ora + MEMORIA_INUTILIZZABILE_MS + 3 }), null);
});

test('C6BIS-FIX-PERF-Q1 (catena) — con un locale caricato per la chat, un ALTRO locale non si carica nemmeno in sottofondo; con la chat remota sì', () => {
  const caricato = { scelto: 'local:gemma-4-e2b', riserva: null, modelloConversazione: 'local:lfm2.5-1.2b', localeCaricato: 'local:lfm2.5-1.2b', inUnGiro: true };
  assert.deepEqual([anelloDaUsare(catenaDelRiassunto(caricato)).ruolo, catenaDelRiassunto(caricato)[0].motivo], ['senza-modello', 'posto-occupato']);
  assert.equal(anelloDaUsare(catenaDelRiassunto({ ...caricato, localeCaricato: null })).ruolo, 'scelto', 'chat remota: il locale non toglie il posto a nessuno');
});

test('C6BIS-FIX-PIANO (catena) — un limite dell’ACCOUNT ferma anche la riserva sullo stesso fornitore; su un altro fornitore no', () => {
  const statoDi = (id) => (id === 'chatgpt:gpt-6-mini' ? { stato: 'bloccato', motivo: 'limite', finoAlle: ORA + 60_000, diAccount: true } : null);
  const stesso = catenaDelRiassunto({ scelto: 'chatgpt:gpt-6-mini', riserva: { provider: 'chatgpt', model: 'gpt-6-nano' }, statoDi, ora: ORA });
  assert.deepEqual(stesso.map((a) => [a.ruolo, a.stato]), [['scelto', 'bloccato'], ['riserva', 'bloccato'], ['senza-modello', 'pronto']]);
  const altro = catenaDelRiassunto({ scelto: 'chatgpt:gpt-6-mini', riserva: { provider: 'openrouter', model: 'qwen/qwen3.7-flash' }, statoDi, ora: ORA });
  assert.equal(anelloDaUsare(altro).ruolo, 'riserva');
  const perModello = catenaDelRiassunto({ scelto: 'chatgpt:gpt-6-mini', riserva: { provider: 'chatgpt', model: 'gpt-6-nano' }, statoDi: (id) => (id === 'chatgpt:gpt-6-mini' ? { stato: 'bloccato', motivo: 'limite', finoAlle: ORA + 60_000 } : null), ora: ORA });
  assert.equal(anelloDaUsare(perModello).ruolo, 'riserva', 'verso contrario: un limite del MODELLO lascia la riserva dello stesso fornitore');
  assert.equal(classificaErroreDelRiassunto(Object.assign(new Error('x'), { code: 'CHATGPT_LIMITE_DEL_PIANO', stato: 429 })).diAccount, true);
  assert.equal(classificaErroreDelRiassunto(Object.assign(new Error('x'), { classe: 'limite-chiave' })).diAccount, true);
  assert.equal(classificaErroreDelRiassunto(Object.assign(new Error('x'), { stato: 429 })).diAccount, undefined, 'un 429 qualunque è del modello');
});

test('C6BIS-FILO-CHIAVE (CLI, 30/10) — sul desktop la riserva di un ALTRO fornitore parte con la chiave del SUO fornitore, non con quella della sessione', async (t) => {
  /* la porta come in server.mjs:933: creaFetchMultiProvider senza providerStore ⇒ la fetch instradata; la chiave la legge
     risolviDestinazioneModello dal prefisso del modello (model-destination.mjs, leggiChiave(fonte)) e gli header della destinazione
     sostituiscono quelli della richiesta */
  const viste = [];
  const server = createServer(async (req, res) => {
    let corpo = ''; for await (const pezzo of req) corpo += pezzo;
    viste.push({ url: req.url, autorizzazione: req.headers.authorization ?? null });
    const json = JSON.parse(corpo || '{}');
    if (json.stream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: ' + JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: 'R' }, finish_reason: null }] }) + '\n\n');
      res.write('data: ' + JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 1 } }) + '\n\n');
      res.end('data: [DONE]\n\n');
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ index: 0, message: { role: 'assistant', content: 'R' }, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 1 } }));
    }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise((r) => { server.closeAllConnections(); server.close(r); }));
  const porta = server.address().port;
  assert.notEqual(porta, 4174);
  const chiavi = { deepseek: 'chiave-di-deepseek', openrouter: 'chiave-di-openrouter' };
  const f = creaFetchMultiProvider(fetch, { dipendenze: { leggiChiave: (fonte) => chiavi[fonte] ?? null,
    leggiRuntime: (fonte) => ({ endpoint: `http://127.0.0.1:${porta}/${fonte}` }) }, senzaPersona: true });
  await riassumiPerCompattazione({ modello: 'deepseek:deepseek-chat', chiave: 'chiave-della-sessione', riserva: true, fornitore: 'deepseek',
    messaggi: [{ role: 'system', content: 'Riassumi.' }, { role: 'user', content: 'Storia.' }], maxOutputTokens: 64, fetchDiRete: f, tentativiMassimi: 1 }).catch(() => null);
  assert.equal(viste.length, 1, JSON.stringify(viste));
  assert.ok(viste[0].url.startsWith('/deepseek'), 'all\'indirizzo del fornitore della riserva: ' + viste[0].url);
  assert.equal(viste[0].autorizzazione, 'Bearer chiave-di-deepseek', 'la chiave del fornitore della riserva, mai quella della sessione');
});

test('CHIAVE-MESSA-01 (Mobile e CLI, 01/11) — la chiave messa vale subito: «senza chiave» non si ricorda, l avviso resta uno solo', () => {
  const memoria = new Map();
  const ora = 1_000_000;
  assert.equal(ricordaGiudizio(memoria, 'chatgpt:m', { stato: 'inutilizzabile', motivo: 'senza-chiave' }, { ora }).daAvvisare, true);
  assert.equal(statoDallaMemoria(memoria, 'chatgpt:m', { ora }), null, 'il modello si riprova subito');
  assert.equal(ricordaGiudizio(memoria, 'chatgpt:m', { stato: 'inutilizzabile', motivo: 'senza-chiave' }, { ora: ora + 120_000 }).daAvvisare, false, 'il guasto che torna non riavvisa');
});

test('CHIAVE-MESSA-02 — AL CONTRARIO: gli altri inutilizzabili restano ricordati 15 minuti', () => {
  const memoria = new Map();
  ricordaGiudizio(memoria, 'openrouter:x', { stato: 'inutilizzabile', motivo: 'non-trovato' }, { ora: 0 });
  assert.equal(statoDallaMemoria(memoria, 'openrouter:x', { ora: MEMORIA_INUTILIZZABILE_MS - 1 })?.motivo, 'non-trovato');
});

/* R9 (revisione del Blocco 21, 01/11/2026): lo stesso modello si scrive con o senza la via `openrouter:` (`stessoModello`). L'adattatore salva senza, la strada semplice col nome della catena */
test('CATENA-IMP-02 — la lettura per tutto il PC non dipende da come è scritta la via, in nessuno dei due sensi', () => {
  const ora = 1_000_000;
  const bloccato = { stato: 'bloccato', motivo: 'limite', finoAlle: ora + 60_000 };
  const senzaVia = new Map(); ricordaGiudizio(senzaVia, 'autore/m', bloccato, { ora });
  const conVia = new Map(); ricordaGiudizio(conVia, 'openrouter:autore/m', bloccato, { ora });
  assert.equal(statoPerTuttoIlPc([senzaVia], 'openrouter:autore/m', { ora })?.motivo, 'limite');
  assert.equal(statoPerTuttoIlPc([conVia], 'autore/m', { ora })?.motivo, 'limite');
  assert.equal(statoPerTuttoIlPc([senzaVia], 'autore/altro', { ora }), null, 'il controllo: un altro modello no');
  assert.equal(statoPerTuttoIlPc([senzaVia], 'zai:autore/m', { ora }), null, 'una via diversa è un altro modello');
  /* il successo cancella anche se è stato scritto con l'altro nome */
  const riuscito = new Map(); dimenticaModello(riuscito, 'openrouter:autore/m', { ora: ora + 10 });
  assert.equal(statoPerTuttoIlPc([senzaVia, riuscito], 'autore/m', { ora: ora + 20 }), null);
  /* e l'avviso che resta oltre la memoria */
  const avvisato = new Map(); ricordaGiudizio(avvisato, 'autore/m', { stato: 'inutilizzabile', motivo: 'accesso-negato' }, { ora });
  assert.equal(statoPerTuttoIlPc([avvisato], 'openrouter:autore/m', { ora: ora + MEMORIA_INUTILIZZABILE_MS + 1 })?.motivo, 'accesso-negato');
});

/* R8: la forma sta qui, e la leggono rotta, registro e catena */
test('CATENA-FORMA-01 — la forma di un id di modello: `fornitore:modello` o `autore/modello`, niente altro', () => {
  for (const si of ['a/b', 'z-ai/glm-5.3-flash', 'local:x', ' zai:glm-4.7 ', 'openrouter:a/b', 'locale-ospite:lfm2.5']) assert.equal(formaDiModelloRiconosciuta(si), true, si);
  for (const no of ['', '   ', 'nudo', 'due parole', 'a b/c', ':x', '/x', 'a/', 'a:', null, 12, undefined]) assert.equal(formaDiModelloRiconosciuta(no), false, String(no));
});
