/*
 * 0.2.2 (SignPath, brief «rete spegnibile», giudice v1313) — IL CATALOGO PUBBLICO DI OPENROUTER SI SPEGNE (`src/catalogo-pubblico.mjs`,
 * `src/model-catalog.mjs`). Prima della cura `GET https://openrouter.ai/api/v1/models` partiva all'apertura della finestra, senza chiavi e
 * senza scelte, e non si spegneva (misurato col proxy che rifiuta: `C:/T/rete-021/misura/rossa-variabile-off`, 09/11/2026 23:13:15).
 * Ogni prova conta le chiamate della rete finta: «spento» vuol dire ZERO chiamate, non «una chiamata che fallisce».
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CATALOGO_PUBBLICO_DI_SERIE, SCHEMA_CATALOGO_PUBBLICO, creaImpostazioneCatalogoPubblico, eModelloDiOpenRouter } from '../src/catalogo-pubblico.mjs';
import { createModelCatalog } from '../src/model-catalog.mjs';
import { loadConfig } from '../src/config.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { creaServizioImpostazioni } from '../src/impostazioni/servizio-impostazioni.mjs';
import { creaCopiaFinestra } from '../src/impostazioni/copia-finestra.mjs';
import { creaFonteSessione, creaFontiDelServer } from '../src/impostazioni/fonti-impostazioni.mjs';
import { voceDelCatalogo } from '../src/impostazioni/catalogo-impostazioni.mjs';
import { cartaAncheInAccessoPieno } from '../src/kernel/impostazioni-app.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const URL_IMP = '/api/v1/public-catalog/settings';
function cartella(t) {
  const c = mkdtempSync(join(tmpdir(), 'talos-catalogo-pubblico-'));
  t.after(() => rimuoviCartellaDiProva(c));
  return c;
}
/** The choice is written in a queue, not awaited by the caller: poll until it is on disk (at most 5 s) instead of a fixed 50 ms, too short on a slow CI runner. */
async function sceltaSulDisco(file) {
  const letta = () => { try { return JSON.parse(readFileSync(file, 'utf8')).openrouterScelto === true; } catch { return false; } };
  for (const fine = Date.now() + 5_000; !letta() && Date.now() < fine;) await new Promise((r) => setTimeout(r, 20));
}
/** Una rete finta che conta: ogni chiamata è una richiesta che sarebbe uscita verso openrouter.ai. */
function reteFinta() {
  const chiamate = [];
  const fetchFn = async (url) => { chiamate.push(String(url)); return new Response(JSON.stringify({ data: [{ id: 'z-ai/glm-5.3-flash', name: 'GLM' }, { id: 'openai/gpt-6', name: 'GPT' }] }), { status: 200 }); };
  return { chiamate, fetchFn };
}
/** Il filo vero di `server.mjs`: il catalogo chiede a `consentito` a ogni richiesta, con la chiave di OpenRouter letta in quel momento. */
function catalogoCon(imp, { chiave = () => false, rete = reteFinta(), ttlMs } = {}) {
  const catalogo = createModelCatalog({ fetchFn: rete.fetchFn, ...(ttlMs !== undefined ? { ttlMs } : {}), consentitoFn: () => imp.consentito({ chiaveOpenRouter: chiave() }) });
  return { catalogo, rete };
}
const codice = async (p) => { try { await p; return 'ok'; } catch (e) { return e?.code ?? String(e); } };

test('CP-01: con la variabile spenta ZERO richieste, per quante volte si chieda (anche «aggiorna»); il selettore ha il catalogo incorporato e lo dice', async (t) => {
  const imp = creaImpostazioneCatalogoPubblico({ file: join(cartella(t), 'c.json'), spentoDallAmbiente: true });
  const { catalogo, rete } = catalogoCon(imp);
  for (let i = 0; i < 5; i += 1) {
    const r = await catalogo.ottieni({ forzaAggiornamento: i % 2 === 1 });
    assert.equal(r.catalogoPubblicoSpento, true);
    assert.equal(r.fonte, 'riserva');
    assert.ok(r.modelli.length > 0, 'il selettore resta in piedi');
    assert.ok(r.modelli.every((m) => m.catalogo.catalogoPubblicoSpento === true && m.catalogo.fonte === 'riserva'), 'ogni voce lo dice: il selettore scrive «spento», non «non raggiungibile»');
  }
  assert.deepEqual(rete.chiamate, [], 'nessuna richiesta a openrouter.ai');
});

test('CP-02: con l\'impostazione spenta (salvata) ZERO richieste, anche dopo un riavvio; riaccesa la richiesta parte', async (t) => {
  const file = join(cartella(t), 'c.json');
  const imp = creaImpostazioneCatalogoPubblico({ file, diSerie: true });
  await imp.scrivi({ acceso: false });
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { schema: SCHEMA_CATALOGO_PUBBLICO, acceso: false });
  const dopoIlRiavvio = creaImpostazioneCatalogoPubblico({ file, diSerie: true });
  const { catalogo, rete } = catalogoCon(dopoIlRiavvio);
  await catalogo.ottieni(); await catalogo.ottieni({ forzaAggiornamento: true });
  assert.deepEqual(rete.chiamate, []);
  await dopoIlRiavvio.scrivi({ acceso: true });
  const r = await catalogo.ottieni();
  assert.equal(rete.chiamate.length, 1, 'riaccesa: la richiesta parte di nuovo');
  assert.equal(r.catalogoPubblicoSpento, undefined);
  assert.deepEqual(r.modelli.map((m) => m.id), ['openai/gpt-6', 'z-ai/glm-5.3-flash']);
});

/*
 * ⛔ GIRO DI CURA DEL REVISORE UNICO (11/11/2026 21:15, ROSSO R1; via del giudice v1550, strada A). Prima di questo giro CP-03, CP-04,
 *   CP-11, CP-12 e CP-13 inchiodavano il contrario: la chiave o un modello OpenRouter scelto aprivano la rete ANCHE con la variabile
 *   dell'amministratore spenta, mentre la riga diceva «spento per questo computer». Ora le due cose si separano:
 *   · `TALOS_HARNESS_UI_CATALOGO_PUBBLICO=off` = ZERO richieste sempre, con la chiave, con il modello scelto, con «aggiorna»;
 *   · lo spento della PERSONA: la chiave o un modello OpenRouter scelti da lei sono una sua scelta, e la lettura parte (1 richiesta),
 *     come dicono lo schermo, PRIVACY.md e le novità.
 *   Come `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` di Claude Code, che spegne il traffico non essenziale anche con le credenziali.
 */
test('CP-03: la variabile dell\'amministratore tiene ZERO anche con la chiave; lo spento della persona no: la chiave riapre, tolta torna zero', async (t) => {
  const c = cartella(t);
  const bloccato = creaImpostazioneCatalogoPubblico({ file: join(c, 'a.json'), spentoDallAmbiente: true });
  const conVariabile = catalogoCon(bloccato, { chiave: () => true, ttlMs: 0 });
  for (let i = 0; i < 4; i += 1) {
    const r = await conVariabile.catalogo.ottieni({ forzaAggiornamento: i % 2 === 1 });
    assert.equal(r.catalogoPubblicoSpento, true);
    assert.equal(r.fonte, 'riserva', 'il selettore usa l elenco incorporato e lo dice');
  }
  assert.deepEqual(conVariabile.rete.chiamate, [], 'variabile off con la chiave: nessuna richiesta a openrouter.ai');
  assert.equal(bloccato.consentito({ chiaveOpenRouter: true }), false);
  /* lo spento della persona (di serie o salvato): la chiave è una sua scelta */
  const imp = creaImpostazioneCatalogoPubblico({ file: join(c, 'b.json'), diSerie: false });
  let chiave = true;
  const { catalogo, rete } = catalogoCon(imp, { chiave: () => chiave, ttlMs: 0 });
  await catalogo.ottieni();
  assert.equal(rete.chiamate.length, 1, 'spento dalla persona, con la sua chiave: 1 richiesta');
  chiave = false;
  const r = await catalogo.ottieni();
  assert.equal(rete.chiamate.length, 1, 'tolta la chiave: niente rete');
  assert.equal(r.catalogoPubblicoSpento, true);
  assert.equal(r.daCache, true, 'spento con una copia vera già letta: si serve quella, senza rete');
  assert.equal(r.modelli.length, 2);
});

test('CP-04: «OpenRouter scelto» riapre lo spento della persona e resta dopo un riavvio; con la variabile spenta si ricorda ma non apre; un modello che non è di OpenRouter no', async (t) => {
  const file = join(cartella(t), 'c.json');
  const imp = creaImpostazioneCatalogoPubblico({ file });
  const { catalogo, rete } = catalogoCon(imp, { ttlMs: 0 });
  for (const altro of ['local:qwen3-8b', 'zai:glm-5.3-flash', 'chatgpt:gpt-6', 'ollama:llama3', 'lmstudio:x', 'senza-barra', '', null, 42]) {
    assert.equal(imp.segnaSceltaDelModello(altro), false, String(altro));
  }
  await catalogo.ottieni();
  assert.deepEqual(rete.chiamate, [], 'nessuna scelta di OpenRouter: zero richieste');
  assert.equal(imp.segnaSceltaDelModello('z-ai/glm-5.3-flash'), true);
  await catalogo.ottieni();
  assert.equal(rete.chiamate.length, 1, 'scelto un modello di OpenRouter: 1 richiesta');
  assert.equal(imp.segnaSceltaDelModello('openai/gpt-6'), false, 'già scelto: niente da scrivere');
  await sceltaSulDisco(file);
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).openrouterScelto, true, 'sul disco');
  const dopo = creaImpostazioneCatalogoPubblico({ file });
  assert.equal(dopo.consentito(), true, 'dopo un riavvio la scelta resta');
  assert.deepEqual(await dopo.leggi(), { acceso: false, spentoDallAmbiente: false }, 'la riga dice comunque spento: è la scelta del modello che apre, non l\'interruttore');
  /* la variabile dell'amministratore: la scelta si ricorda (per quando la variabile se ne va) ma non apre niente */
  const conVariabile = creaImpostazioneCatalogoPubblico({ file, spentoDallAmbiente: true });
  assert.equal(conVariabile.consentito(), false, 'variabile off: il modello scelto non apre');
  assert.equal(conVariabile.consentito({ chiaveOpenRouter: true }), false, 'variabile off: nemmeno chiave e modello insieme');
  const file2 = join(cartella(t), 'd.json');
  const bloccato = creaImpostazioneCatalogoPubblico({ file: file2, spentoDallAmbiente: true });
  const due = catalogoCon(bloccato, { chiave: () => true, ttlMs: 0 });
  assert.equal(bloccato.segnaSceltaDelModello('z-ai/glm-5.3-flash'), true, 'la scelta si segna');
  await due.catalogo.ottieni(); await due.catalogo.ottieni({ forzaAggiornamento: true });
  assert.deepEqual(due.rete.chiamate, [], 'variabile off, chiave e modello scelto: zero richieste');
  await sceltaSulDisco(file2);
  assert.equal(creaImpostazioneCatalogoPubblico({ file: file2 }).consentito(), true, 'tolta la variabile, la scelta della persona torna a valere');
  assert.equal(eModelloDiOpenRouter('~deepseek/deepseek-v4-flash-latest'), true, 'anche gli alias con la tilde');
});

test('CP-05: spegnere dalle Impostazioni dimentica la scelta di OpenRouter: si torna a zero richieste finché non si sceglie ancora', async (t) => {
  const file = join(cartella(t), 'c.json');
  const imp = creaImpostazioneCatalogoPubblico({ file, diSerie: false });
  imp.segnaSceltaDelModello('openai/gpt-6');
  assert.equal(imp.consentito(), true);
  await imp.scrivi({ acceso: false });
  assert.equal(imp.consentito(), false);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { schema: SCHEMA_CATALOGO_PUBBLICO, acceso: false });
  /* in fila: una scelta di modello che arriva DOPO uno spegnimento non perde lo spegnimento */
  const file2 = join(cartella(t), 'd.json');
  const imp2 = creaImpostazioneCatalogoPubblico({ file: file2, diSerie: true });
  const p = imp2.scrivi({ acceso: false });
  imp2.segnaSceltaDelModello('openai/gpt-6');
  await p; await sceltaSulDisco(file2);
  assert.deepEqual(JSON.parse(readFileSync(file2, 'utf8')), { schema: SCHEMA_CATALOGO_PUBBLICO, acceso: false, openrouterScelto: true });
  assert.equal(creaImpostazioneCatalogoPubblico({ file: file2 }).consentito(), true, 'la scelta arrivata dopo vale');
});

test('CP-06: la variabile tiene spento: la riga non lo accende (PUBLIC_CATALOG_LOCKED), il file non cambia; la scelta della persona resta per quando la variabile se ne va', async (t) => {
  const file = join(cartella(t), 'c.json');
  await creaImpostazioneCatalogoPubblico({ file, diSerie: false }).scrivi({ acceso: true });
  const imp = creaImpostazioneCatalogoPubblico({ file, spentoDallAmbiente: true });
  assert.deepEqual(await imp.leggi(), { acceso: false, spentoDallAmbiente: true });
  assert.equal(imp.consentito(), false, 'il file dice acceso, la variabile vince');
  assert.equal(await codice(imp.scrivi({ acceso: true })), 'PUBLIC_CATALOG_LOCKED');
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).acceso, true, 'la scelta della persona non si tocca');
  assert.equal(creaImpostazioneCatalogoPubblico({ file }).consentito(), true, 'tolta la variabile, torna la sua');
  for (const male of [{ acceso: 'true' }, { acceso: 1 }, {}, { acceso: true, x: 1 }, null, [], 'true']) {
    assert.equal(await codice(creaImpostazioneCatalogoPubblico({ file: join(cartella(t), 'x.json') }).scrivi(male)), 'QUERY_INVALID', JSON.stringify(male));
  }
});

test('CP-07: il valore di serie sta in UN posto (`CATALOGO_PUBBLICO_DI_SERIE`) ed è SPENTO (owner 09/11 23:41); un file illeggibile non decide', async (t) => {
  const c = cartella(t);
  /* ⛔ la scelta dell'owner, inchiodata: spento finché la persona non sceglie OpenRouter o non gli dà una chiave */
  assert.equal(CATALOGO_PUBBLICO_DI_SERIE, false, 'il valore di serie è spento: cambiarlo vuole un sì dell owner');
  assert.equal(creaImpostazioneCatalogoPubblico({ file: join(c, 'manca.json') }).consentito(), false, 'senza file: spento');
  assert.deepEqual(await creaImpostazioneCatalogoPubblico({ file: join(c, 'manca.json') }).leggi(), { acceso: false, spentoDallAmbiente: false }, 'la riga lo mostra spento');
  /* il primo avvio vero: nessun file, nessuna chiave ⇒ zero richieste, per quante volte si chieda; la chiave o la scelta riaprono */
  const primoAvvio = creaImpostazioneCatalogoPubblico({ file: join(c, 'primo.json') });
  let chiave = false;
  const { catalogo, rete } = catalogoCon(primoAvvio, { chiave: () => chiave, ttlMs: 0 });
  for (let i = 0; i < 3; i += 1) assert.equal((await catalogo.ottieni({ forzaAggiornamento: i > 0 })).catalogoPubblicoSpento, true);
  assert.equal(rete.chiamate.length, 0, 'primo avvio senza scelte: openrouter.ai non sente niente');
  chiave = true;
  await catalogo.ottieni({ forzaAggiornamento: true });
  assert.equal(rete.chiamate.length, 1, 'con la chiave di OpenRouter la richiesta parte');
  assert.equal(creaImpostazioneCatalogoPubblico({ file: join(c, 'manca.json') }).consentito(), CATALOGO_PUBBLICO_DI_SERIE, 'senza file vale il valore di serie');
  assert.equal(existsSync(join(c, 'manca.json')), false, 'leggere non scrive');
  for (const testo of ['{rotto', '{"acceso":"no"}', '{"acceso":false,"x":1}', '[]']) {
    const file = join(c, `f-${Math.random()}.json`);
    writeFileSync(file, testo);
    const avvisi = [];
    assert.equal(creaImpostazioneCatalogoPubblico({ file, avvisa: (m) => avvisi.push(m) }).consentito(), CATALOGO_PUBBLICO_DI_SERIE, testo);
    assert.match(avvisi[0] ?? '', /unreadable/u, testo);
  }
  /* il server non passa un suo valore: il di serie è uno solo */
  const sorgente = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  assert.match(sorgente, /creaImpostazioneCatalogoPubblico\(\{ file: percorsoDatiDesktop\(FILE_CATALOGO_PUBBLICO\), spentoDallAmbiente: config\.catalogoPubblicoSpento \}\)/u);
});

test('CP-08: la variabile TALOS_HARNESS_UI_CATALOGO_PUBBLICO — off/0/false/no spengono, on/vuota no, un errore di battitura ferma l\'avvio', () => {
  for (const v of ['off', 'OFF', ' off ', '0', 'false', 'no']) assert.equal(loadConfig({ TALOS_HARNESS_UI_CATALOGO_PUBBLICO: v }).catalogoPubblicoSpento, true, v);
  for (const v of [undefined, '', 'on', '1', 'true', 'yes']) assert.equal(loadConfig({ ...(v === undefined ? {} : { TALOS_HARNESS_UI_CATALOGO_PUBBLICO: v }) }).catalogoPubblicoSpento, false, String(v));
  for (const v of ['spento', 'of', 'disable']) assert.throws(() => loadConfig({ TALOS_HARNESS_UI_CATALOGO_PUBBLICO: v }), /CATALOGO_PUBBLICO must be on or off/u, v);
});

test('CP-09: un consentito che si rompe non apre la rete', async () => {
  const rete = reteFinta();
  const catalogo = createModelCatalog({ fetchFn: rete.fetchFn, consentitoFn: () => { throw new Error('rotto'); } });
  assert.equal((await catalogo.ottieni()).catalogoPubblicoSpento, true);
  assert.deepEqual(rete.chiamate, []);
  const diSempre = createModelCatalog({ fetchFn: rete.fetchFn });
  await diSempre.ottieni();
  assert.equal(rete.chiamate.length, 1, 'senza consentitoFn il catalogo è quello di prima (CLI, prove esistenti)');
});

async function server(t, opzioni) {
  const s = createServer(createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, ...opzioni }));
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => { s.closeAllConnections(); s.close(r); }));
  const indirizzo = `http://127.0.0.1:${s.address().port}`;
  const finestra = { origin: indirizzo, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' };
  return async (percorso, metodo = 'GET', corpo, extra = {}) => {
    const r = await fetch(indirizzo + percorso, { method: metodo, headers: { ...finestra, ...extra }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    return { stato: r.status, json: await r.json().catch(() => null) };
  };
}

test('CP-10: la rotta GET/POST — sì o no; spegnere libero, accendere senza gettone passa dalla carta (403); bloccato dalla variabile 409; 503 senza magazzino', async (t) => {
  const c = cartella(t);
  const imp = creaImpostazioneCatalogoPubblico({ file: join(c, 'c.json'), diSerie: true });
  const chiedi = await server(t, { catalogoPubblico: imp });
  assert.deepEqual((await chiedi(URL_IMP)).json.data, { acceso: true, spentoDallAmbiente: false });
  assert.deepEqual((await chiedi(URL_IMP, 'POST', { acceso: false })).json.data, { acceso: false, spentoDallAmbiente: false });
  assert.equal(imp.consentito(), false);
  const accendi = await chiedi(URL_IMP, 'POST', { acceso: true });
  assert.deepEqual([accendi.stato, accendi.json?.error?.code], [403, 'PC_CONFIRMATION_REQUIRED']);
  for (const male of [{ acceso: 'true' }, {}, { acceso: false, x: 1 }]) assert.equal((await chiedi(URL_IMP, 'POST', male)).stato, 400, JSON.stringify(male));
  const bloccato = creaImpostazioneCatalogoPubblico({ file: join(c, 'b.json'), spentoDallAmbiente: true });
  const s = createServer(createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, token: 'gettone-cp-10', catalogoPubblico: bloccato }));
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => { s.closeAllConnections(); s.close(r); }));
  const base = `http://127.0.0.1:${s.address().port}`;
  const r = await fetch(base + URL_IMP, { method: 'POST', headers: { origin: base, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', Cookie: 'talos_token=gettone-cp-10' }, body: JSON.stringify({ acceso: true }) });
  assert.deepEqual([r.status, (await r.json()).error?.code], [409, 'PUBLIC_CATALOG_LOCKED']);
  assert.equal(existsSync(join(c, 'b.json')), false);
  const senza = await server(t, {});
  assert.deepEqual([(await senza(URL_IMP)).stato, (await senza(URL_IMP, 'POST', { acceso: false })).stato], [503, 503]);
});

test('CP-11: «OpenRouter scelto» dalla rotta delle impostazioni della conversazione riapre lo spento della persona, mai la variabile; un modello locale no', async (t) => {
  for (const spentoDallAmbiente of [false, true]) {
    const imp = creaImpostazioneCatalogoPubblico({ file: join(cartella(t), 'c.json'), spentoDallAmbiente });
    const patch = [];
    const sessionRegistry = { aggiornaImpostazioni: async (id, p) => { patch.push(p); return { aggiornate: true }; }, impostazioniCorrenti: () => null };
    const chiedi = await server(t, { catalogoPubblico: imp, sessionRegistry });
    const locale = await chiedi('/api/v1/sessions/s1/settings', 'POST', { modello: 'local:qwen3-8b' });
    assert.equal(locale.stato, 200, JSON.stringify(locale.json));
    assert.equal(imp.consentito(), false, 'un modello locale non apre la lista');
    assert.equal((await chiedi('/api/v1/sessions/s1/settings', 'POST', { permessi: 'Read only' })).stato, 200);
    assert.equal(imp.consentito(), false, 'un cambio senza modello nemmeno');
    assert.equal((await chiedi('/api/v1/sessions/s1/settings', 'POST', { modello: 'z-ai/glm-5.3-flash' })).stato, 200);
    assert.equal(imp.consentito(), !spentoDallAmbiente, spentoDallAmbiente ? 'variabile off: il modello scelto non apre' : 'scelto un modello di OpenRouter: la lista si può leggere');
    assert.equal(patch.length, 3);
    await new Promise((r) => setTimeout(r, 50)); // la scrittura in fila finisce prima che la cartella si tolga
  }
});

test('CP-13: «OpenRouter scelto» anche da una conversazione nuova (POST /sessions e /sessions/custom), prima che parta il primo giro; mai con la variabile; un modello locale no', async (t) => {
  for (const spentoDallAmbiente of [false, true]) {
    for (const [percorso, corpo] of [
      ['/api/v1/sessions', { taskId: 'sconto-a-scaglioni' }],
      ['/api/v1/sessions/custom', { cartellaLibera: 'C:/workspace', consegna: 'prova', permessi: 'Full access' }],
    ]) {
      const imp = creaImpostazioneCatalogoPubblico({ file: join(cartella(t), 'c.json'), spentoDallAmbiente });
      const avvii = [];
      /* il registro guarda la lista nel momento in cui avvia: dev'essere già aperta (o chiusa, con la variabile) */
      const avvia = (opzioni) => { avvii.push(imp.consentito()); return { sessionId: `s${avvii.length}` }; };
      const chiedi = await server(t, { catalogoPubblico: imp, sessionRegistry: { avvia: (_id, o) => avvia(o), avviaLibero: (o) => avvia(o) } });
      const locale = await chiedi(percorso, 'POST', { ...corpo, modello: 'local:qwen3-8b' });
      assert.equal(locale.stato, 200, `${percorso} ${JSON.stringify(locale.json)}`);
      assert.equal(imp.consentito(), false, `${percorso}: un modello locale non apre la lista`);
      const remoto = await chiedi(percorso, 'POST', { ...corpo, modello: 'z-ai/glm-5.3-flash' });
      assert.equal(remoto.stato, 200, `${percorso} ${JSON.stringify(remoto.json)}`);
      assert.deepEqual(avvii, [false, !spentoDallAmbiente], `${percorso} (variabile ${spentoDallAmbiente ? 'off' : 'assente'})`);
      await new Promise((r) => setTimeout(r, 50)); // la scrittura in fila finisce prima che la cartella si tolga
    }
  }
});

test('CP-12: app_settings — voce models.publicCatalog del gruppo sicurezza (carta sempre, anche in accesso pieno), stessa fonte; un modello scelto dopo la carta conta come scelta', async (t) => {
  const imp = creaImpostazioneCatalogoPubblico({ file: join(cartella(t), 'c.json'), diSerie: true });
  const voce = voceDelCatalogo('models.publicCatalog');
  assert.deepEqual([voce.gruppo, voce.sezione, voce.testo.en, voce.testo.it], ['sicurezza', 'models', 'Public model list', 'Catalogo pubblico dei modelli']);
  let n = 0;
  const s = creaServizioImpostazioni({ fonti: creaFontiDelServer({ catalogoPubblico: imp }), copiaFinestra: creaCopiaFinestra(), idFn: () => `id-${++n}`, attesaFinestraMs: 200 });
  const fn = s.perLaSessione({ sessionId: 'sess-1' });
  const rev = () => fn('app_settings', { action: 'list', section: 'models' }, { fase: 'esegui' }).then((r) => Number(/Revision (\d+)/u.exec(r.testo)?.[1]));
  for (const [valore, id] of [[false, 'c1'], [true, 'c2']]) {
    const arg = { action: 'set', expected_revision: await rev(), changes: [{ key: 'models.publicCatalog', value: valore }] };
    const carta = await fn('app_settings', arg, { fase: 'anteprima', toolCallId: id });
    assert.equal(carta.carta, true);
    assert.equal(cartaAncheInAccessoPieno(carta.azione), true, `anche in accesso pieno (${valore})`);
    assert.equal(imp.consentito(), !valore, 'la carta da sola non cambia niente');
    const fatto = await fn('app_settings', arg, { fase: 'esegui', toolCallId: id });
    assert.equal(fatto.ok, true, fatto.testo ?? fatto.messaggio);
    assert.equal(imp.consentito(), valore);
  }
  /* la fonte della conversazione: un modello di OpenRouter scelto (dopo la carta) segna la scelta */
  const scelti = [];
  const fonte = creaFonteSessione(() => ({ impostazioniCorrenti: () => ({ reasoning: null }), aggiornaImpostazioni: async () => ({ aggiornate: true }) }), { modelloSceltoFn: (m) => scelti.push(m) });
  await fonte.scrivi({ modello: 'openai/gpt-6' }, { sessionId: 's' });
  await fonte.scrivi({ sforzo: 'high' }, { sessionId: 's' });
  assert.deepEqual(scelti, ['openai/gpt-6']);
  /* e il filo vero di `creaFontiDelServer`: la fonte della conversazione arriva al magazzino del catalogo */
  for (const spentoDallAmbiente of [false, true]) {
    const spento = creaImpostazioneCatalogoPubblico({ file: join(cartella(t), 'f.json'), spentoDallAmbiente });
    const fonti = creaFontiDelServer({ catalogoPubblico: spento, registroFn: () => ({ impostazioniCorrenti: () => ({ reasoning: null }), aggiornaImpostazioni: async () => ({ aggiornate: true }) }) });
    await fonti.sessione.scrivi({ modello: 'local:qwen3-8b' }, { sessionId: 's' });
    assert.equal(spento.consentito(), false, 'un modello locale non apre la lista');
    await fonti.sessione.scrivi({ modello: 'openai/gpt-6' }, { sessionId: 's' });
    assert.equal(spento.consentito(), !spentoDallAmbiente, spentoDallAmbiente ? 'variabile off: app_settings non la apre' : 'app_settings ha scelto un modello di OpenRouter: la lista si può leggere');
    await new Promise((r) => setTimeout(r, 50)); // la scrittura in fila finisce prima che la cartella si tolga
  }
  const bloccato = creaFontiDelServer({ catalogoPubblico: creaImpostazioneCatalogoPubblico({ file: join(cartella(t), 'b.json'), spentoDallAmbiente: true }) }).catalogoPubblico;
  assert.equal(await codice(bloccato.scrivi({ acceso: true })), 'PUBLIC_CATALOG_LOCKED', 'il modello non lo accende con la variabile spenta');
});

/*
 * CP-14 — IL FILO DI `server.mjs`, sul server VERO (mutante M10 del revisore unico, 11/11/2026: `createModelCatalog` senza `consentitoFn`
 *   restava vivo, perché ogni altra prova costruisce il catalogo da sé). Il server parte come lo avvia il guscio, con un proxy che conta e
 *   rifiuta (`NODE_USE_ENV_PROXY`, come la misura dal vivo): ogni CONNECT verso openrouter.ai è una richiesta che sarebbe uscita.
 *   Una chiave FINTA nel portachiavi in memoria (mai una vera). Prima la prova di controllo: senza la variabile, con la chiave, la
 *   richiesta passa dal proxy (altrimenti uno zero non proverebbe niente); poi la variabile off: zero, anche forzando.
 */
async function serverVeroConProxy(t, { variabileOff }) {
  const { spawn } = await import('node:child_process');
  const { mkdirSync } = await import('node:fs');
  const { rimuoviCartellaDiProvaAttesa } = await import('./aiuto/rimuovi-cartella-di-prova.mjs');
  const radice = mkdtempSync(join(tmpdir(), 'talos-cp14-'));
  const casa = join(radice, 'casa');
  for (const d of [casa, join(radice, 'sessions'), join(radice, 'workspace')]) mkdirSync(d, { recursive: true });
  const connessioni = [];
  const proxy = createServer((req, res) => { connessioni.push(`${req.method} ${req.url}`); res.writeHead(403); res.end(); });
  proxy.on('connect', (req, sock) => { connessioni.push(`CONNECT ${req.url}`); sock.end('HTTP/1.1 403 Forbidden\r\n\r\n'); });
  await new Promise((r) => proxy.listen(0, '127.0.0.1', r));
  const libera = await new Promise((r) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
  const gettone = 'cp14' + 'x'.repeat(40);
  const env = { ...process.env, APPDATA: join(casa, 'AppData', 'Roaming'), LOCALAPPDATA: join(casa, 'AppData', 'Local'), USERPROFILE: casa, HOME: casa,
    TALOS_HARNESS_UI_HOST: '127.0.0.1', TALOS_HARNESS_UI_PORT: String(libera), TALOS_HARNESS_UI_SESSIONS_DIR: join(radice, 'sessions'),
    TALOS_HARNESS_UI_PROJECT_DIRS: join(radice, 'workspace'), TALOS_DESKTOP_DATA_DIR: join(radice, 'desktop'), TALOS_HARNESS_UI_WORKFLOW_DIR: join(radice, 'workflows'),
    TALOS_HARNESS_UI_KEYRING: 'memoria', TALOS_SCRATCH_DIR: join(radice, 'scratch'), TALOS_HARNESS_UI_SEGRETI_DA: 'stdin',
    NODE_USE_ENV_PROXY: '1', HTTPS_PROXY: `http://127.0.0.1:${proxy.address().port}`, HTTP_PROXY: `http://127.0.0.1:${proxy.address().port}`, NO_PROXY: '127.0.0.1,localhost,::1' };
  for (const k of ['TALOS_HARNESS_UI_TOKEN', 'OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'HF_TOKEN', 'TALOS_HARNESS_UI_CATALOGO_PUBBLICO', 'https_proxy', 'http_proxy', 'no_proxy']) delete env[k];
  if (variabileOff) env.TALOS_HARNESS_UI_CATALOGO_PUBBLICO = 'off';
  const figlio = spawn(process.execPath, ['server.mjs'], { cwd: new URL('..', import.meta.url), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env });
  const uscita = new Promise((r) => figlio.once('exit', r));
  let scritto = '';
  figlio.stdout.on('data', (c) => { scritto += c; });
  figlio.stderr.on('data', (c) => { scritto += c; });
  figlio.stdin.end(`TALOS_HARNESS_UI_TOKEN=${gettone}\n`);
  t.after(async () => {
    if (figlio.exitCode === null && figlio.signalCode === null) { figlio.kill(); await Promise.race([uscita, new Promise((r) => setTimeout(r, 15_000))]); }
    await new Promise((r) => proxy.close(r));
    await rimuoviCartellaDiProvaAttesa(radice);
  });
  for (let i = 0; i < 600 && figlio.exitCode === null && !/Harness UI disponibile/u.test(scritto); i += 1) await new Promise((r) => setTimeout(r, 50));
  assert.match(scritto, /Harness UI disponibile/u, `il server non è partito:\n${scritto.slice(-1500)}`);
  const base = `http://127.0.0.1:${libera}`;
  const chiedi = (percorso, metodo = 'GET', corpo) => fetch(base + percorso, { method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo),
    headers: { origin: base, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', Cookie: `talos_token=${gettone}` } });
  const versoOpenRouter = () => connessioni.filter((c) => /openrouter\.ai/iu.test(c));
  return { chiedi, versoOpenRouter };
}

test('CP-14: il server vero — con TALOS_HARNESS_UI_CATALOGO_PUBBLICO=off e una chiave OpenRouter (finta) ZERO richieste a openrouter.ai; senza la variabile la richiesta passa (controllo)', { timeout: 180_000 }, async (t) => {
  for (const variabileOff of [false, true]) {
    const { chiedi, versoOpenRouter } = await serverVeroConProxy(t, { variabileOff });
    const chiave = await chiedi('/api/v1/providers/openrouter/key', 'POST', { key: 'sk-or-v1-' + '0'.repeat(64) });
    assert.equal(chiave.status, 200, `chiave finta: ${await chiave.text()}`);
    for (const forza of ['', '?forza=1', '?forza=1']) {
      const r = await chiedi(`/api/v1/models${forza}`);
      await r.arrayBuffer();
    }
    const impostazione = await (await chiedi(URL_IMP)).json();
    await new Promise((r) => setTimeout(r, 300));
    if (variabileOff) {
      assert.deepEqual(versoOpenRouter(), [], 'variabile off con la chiave: nessuna richiesta a openrouter.ai');
      assert.deepEqual(impostazione.data, { acceso: false, spentoDallAmbiente: true });
    } else {
      assert.ok(versoOpenRouter().length >= 1, 'controllo: senza la variabile, con la chiave, la richiesta passa dal proxy');
    }
  }
});

/*
 * CP-15 — IL TETTO AI TENTATIVI, sul server VERO (ripasso del revisore unico, 11/11/2026 22:01, punto 3 ROSSO; giudice v1559). Prima:
 *   con OpenRouter che non risponde, ogni schermata che chiedeva l'elenco faceva partire un tentativo nuovo (misurato dal revisore:
 *   20 CONNECT in 10 minuti, uno ogni 30 s). Ora un fallimento conta come una lettura: UNA ripetizione dopo 30 s, poi niente prima di
 *   10 minuti; e le richieste che arrivano insieme condividono la stessa lettura in volo. Qui: la rete rifiuta sempre, cinque
 *   schermate insieme all'apertura e poi una ogni 3 s per 36 s (17 richieste) ⇒ al più 2 CONNECT a openrouter.ai.
 *   I 10 minuti interi stanno in MC-TETTO-01 (orologio finto) e nella misura dal vivo del rapporto (orologio vero, in sottofondo).
 */
test('CP-15: il server vero, la rete che rifiuta sempre — 5 richieste insieme e poi una ogni 3 s per 36 s: al più 2 tentativi verso openrouter.ai', { timeout: 180_000 }, async (t) => {
  const { chiedi, versoOpenRouter } = await serverVeroConProxy(t, { variabileOff: false });
  const chiave = await chiedi('/api/v1/providers/openrouter/key', 'POST', { key: 'sk-or-v1-' + '0'.repeat(64) });
  assert.equal(chiave.status, 200, `chiave finta: ${await chiave.text()}`);
  const leggi = async () => { const r = await chiedi('/api/v1/models'); assert.equal(r.status, 200); return (await r.json()).data; };
  const insieme = await Promise.all(Array.from({ length: 5 }, leggi));
  assert.ok(insieme.every((d) => d.modelli.length > 0), 'il selettore resta in piedi con l elenco incorporato');
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(versoOpenRouter().length <= 1, `cinque schermate insieme, una sola lettura in volo: ${versoOpenRouter().length}`);
  const inizio = Date.now();
  let richieste = 5;
  while (Date.now() - inizio < 36_000) { await new Promise((r) => setTimeout(r, 3_000)); await leggi(); richieste += 1; }
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(richieste >= 15, `richieste fatte: ${richieste}`);
  assert.ok(versoOpenRouter().length <= 2, `${richieste} richieste in ${Math.round((Date.now() - inizio) / 1000)} s con la rete che rifiuta: ${versoOpenRouter().length} tentativi (tetto 2)`);
});

/*
 * CP-16 — PROFILO NUOVO, PRIMA CHAT (giudice v1573, punto 2, 11/11/2026). Il dubbio: il primo POST /sessions (`http-app.mjs:6656`)
 *   segna «OpenRouter scelto» anche col modello che il server ha di serie (`config.mjs:44`, `z-ai/glm-4.7-flash`, di OpenRouter), senza
 *   una scelta vera. Misurato dal vivo (guscio vero, profilo nuovo, proxy che conta, `misura2.mjs 4`): la finestra NON ha un modello
 *   di serie («Nessun modello selezionato»), «Nuova sessione» non parte senza sceglierlo («Scegli un modello») e l'Invio del composer
 *   apre il selettore: 0 POST /sessions, 0 richieste, nessun file del catalogo. Qui la metà del server: una sessione nuova SENZA
 *   `modello` (vale quello di serie del server) non segna niente; solo un `modello` mandato da chi chiede lo segna.
 */
test('CP-16: una conversazione nuova senza modello scelto (vale quello di serie del server, di OpenRouter) non apre la lista', async (t) => {
  for (const [percorso, corpo] of [
    ['/api/v1/sessions', { taskId: 'sconto-a-scaglioni' }],
    ['/api/v1/sessions/custom', { cartellaLibera: 'C:/workspace', consegna: 'prova', permessi: 'Full access' }],
  ]) {
    const file = join(cartella(t), 'c.json');
    const imp = creaImpostazioneCatalogoPubblico({ file });
    const avvii = [];
    const avvia = (o) => { avvii.push(o?.modelloScelto ?? o?.modello ?? null); return { sessionId: `s${avvii.length}` }; };
    const chiedi = await server(t, { catalogoPubblico: imp, sessionRegistry: { avvia: (_id, o) => avvia(o), avviaLibero: (o) => avvia(o) } });
    const r = await chiedi(percorso, 'POST', corpo);
    assert.equal(r.stato, 200, `${percorso} ${JSON.stringify(r.json)}`);
    assert.equal(avvii.length, 1);
    assert.equal(imp.consentito(), false, `${percorso}: nessuna scelta, nessuna lettura`);
    await new Promise((r2) => setTimeout(r2, 50));
    assert.equal(existsSync(file), false, `${percorso}: niente scritto`);
  }
});
