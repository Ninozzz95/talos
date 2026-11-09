/*
 * «Uso del computer» acceso o spento dalle Impostazioni e dal modello, SENZA riavviare (giro 2 delle cure, 06/11/2026; revisione avversaria di
 * sicurezza, difetto 5: prima lo spegnimento era solo `TALOS_HARNESS_UI_COMPUTER_USE`, letta all'avvio, senza schermata né attrezzo).
 * Due porte: `GET/POST /api/v1/computer-use/settings` (la riga in Impostazioni → Strumenti) e `app_settings`, voce `tools.computerUse`
 * (gruppo sicurezza: la carta c'è sempre). L'ospite del computer use rilegge l'interruttore a OGNI chiamata.
 * Decisione 310 dell'owner (06/11/2026): «Anteprima» SPENTA di serie, accesa solo a mano; spenta, anche le rotte dei luoghi rispondono 404.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { creaImpostazioneComputerUse, SCHEMA_IMPOSTAZIONE_COMPUTER_USE } from '../src/computer-use/impostazione.mjs';
import { porteDelComputerUse, TESTO_COMPUTER_USE_SPENTO } from '../src/computer-use/interruttore.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { creaOperazioni } from '../src/remoto/operazioni.mjs';
import { cartaAncheInAccessoPieno } from '../src/kernel/impostazioni-app.mjs';
import { creaServizioImpostazioni } from '../src/impostazioni/servizio-impostazioni.mjs';
import { creaCopiaFinestra } from '../src/impostazioni/copia-finestra.mjs';
import { creaFontiDelServer } from '../src/impostazioni/fonti-impostazioni.mjs';
import { voceDelCatalogo } from '../src/impostazioni/catalogo-impostazioni.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const URL_IMP = '/api/v1/computer-use/settings';

function cartella(t) {
  const c = mkdtempSync(join(tmpdir(), 'talos-cu-impostazione-'));
  t.after(() => rimuoviCartellaDiProva(c));
  return c;
}
async function server(t, opzioni) {
  const s = createServer(createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, ...opzioni }));
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => { s.closeAllConnections(); s.close(r); }));
  const indirizzo = `http://127.0.0.1:${s.address().port}`;
  const finestra = { origin: indirizzo, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' };
  return async (percorso, metodo = 'GET', corpo) => {
    const r = await fetch(indirizzo + percorso, { method: metodo, headers: finestra, body: corpo === undefined ? undefined : (typeof corpo === 'string' ? corpo : JSON.stringify(corpo)) });
    return { stato: r.status, json: await r.json().catch(() => null) };
  };
}
const codice = async (p) => { try { await p; return 'ok'; } catch (e) { return e?.code ?? String(e); } };

test('CU-SET-01: di serie SPENTO (decisione 310); la scelta salvata vince anche dopo un riavvio; acceso() è sincrono e solo il vero true accende', async (t) => {
  const c = cartella(t);
  const file = join(c, '.computer-use-impostazione.json');
  assert.equal(creaImpostazioneComputerUse({ file }).acceso(), false, 'di serie spento (decisione 310): nessuna scelta salvata, nessun computer use');
  assert.deepEqual(await creaImpostazioneComputerUse({ file }).leggi(), { acceso: false }, 'e la schermata legge spento');
  assert.equal(creaImpostazioneComputerUse({ file, diSerie: false }).acceso(), false);
  assert.equal(creaImpostazioneComputerUse({ file, diSerie: 'true' }).acceso(), false, 'un valore di serie strano non accende');
  const imp = creaImpostazioneComputerUse({ file, diSerie: true });
  assert.deepEqual(await imp.leggi(), { acceso: true });
  assert.equal(existsSync(file), false, 'leggere non scrive');
  assert.deepEqual(await imp.scrivi({ acceso: false }), { acceso: false });
  assert.equal(imp.acceso(), false, 'vale dalla chiamata dopo');
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { schema: SCHEMA_IMPOSTAZIONE_COMPUTER_USE, acceso: false });
  const dopoIlRiavvio = creaImpostazioneComputerUse({ file, diSerie: true });
  assert.equal(dopoIlRiavvio.acceso(), false, 'la scelta salvata vince sul valore di serie');
  assert.deepEqual(await dopoIlRiavvio.leggi(), { acceso: false });
  await dopoIlRiavvio.scrivi({ acceso: true });
  assert.equal(dopoIlRiavvio.acceso(), true);
  assert.equal(creaImpostazioneComputerUse({ file, diSerie: false }).acceso(), true, 'riacceso dalla persona: il valore di serie spento non conta');
  /* in fila: l'ultima scrittura chiesta è quella che resta */
  await Promise.all([imp.scrivi({ acceso: true }), imp.scrivi({ acceso: false }), imp.scrivi({ acceso: true })]);
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).acceso, true);
  const letto = await imp.leggi();
  letto.acceso = false;
  assert.equal(imp.acceso(), true, 'leggi() dà una copia');
});

test('CU-SET-02: AL CONTRARIO — si rifiuta tutto ciò che non è un sì o un no, e il file non cambia', async (t) => {
  const c = cartella(t);
  const file = join(c, 'imp.json');
  const imp = creaImpostazioneComputerUse({ file });
  for (const male of [{ acceso: 'true' }, { acceso: 1 }, { acceso: null }, { acceso: true, altro: 1 }, { spento: true }, {}, [], null, 'true', true]) {
    assert.equal(await codice(imp.scrivi(male)), 'QUERY_INVALID', JSON.stringify(male));
  }
  assert.equal(existsSync(file), false);
  assert.equal(imp.acceso(), false, 'di serie spento, e nessun corpo strano lo accende');
  assert.equal(await codice(Promise.resolve().then(() => creaImpostazioneComputerUse({}))), 'QUERY_INVALID', 'il file serve');
});

test('CU-SET-03: un file illeggibile non decide per la persona: vale il valore di serie e lo si dice; un file assente non avvisa', async (t) => {
  const c = cartella(t);
  for (const [testo, diSerie] of [['{rotto', true], ['{"acceso":"no"}', true], ['{"acceso":true,"x":1}', false], ['[]', false], ['null', true]]) {
    const file = join(c, `f-${Math.random()}.json`);
    writeFileSync(file, testo);
    const avvisi = [];
    const imp = creaImpostazioneComputerUse({ file, diSerie, avvisa: (m) => avvisi.push(m) });
    assert.equal(imp.acceso(), diSerie, testo);
    assert.deepEqual(await creaImpostazioneComputerUse({ file, diSerie, avvisa: () => {} }).leggi(), { acceso: diSerie }, `${testo} (leggi)`);
    assert.equal(avvisi.length, 1, testo);
    assert.match(avvisi[0], /unreadable/u);
  }
  const avvisi = [];
  creaImpostazioneComputerUse({ file: join(c, 'manca.json'), avvisa: (m) => avvisi.push(m) }).acceso();
  assert.deepEqual(avvisi, []);
  /* `schema` in più è ammesso (lo scrive il magazzino stesso) */
  const file = join(c, 'con-schema.json');
  writeFileSync(file, JSON.stringify({ schema: SCHEMA_IMPOSTAZIONE_COMPUTER_USE, acceso: false }));
  assert.equal(creaImpostazioneComputerUse({ file, diSerie: true, avvisa: () => assert.fail('nessun avviso') }).acceso(), false);
});

test('CU-SET-04: la rotta GET/POST — un campo solo, sì o no; 503 senza magazzino; la query si rifiuta', async (t) => {
  const c = cartella(t);
  const imp = creaImpostazioneComputerUse({ file: join(c, 'imp.json'), diSerie: true });
  const chiedi = await server(t, { impostazioneComputerUse: imp });
  const prima = await chiedi(URL_IMP);
  assert.deepEqual([prima.stato, prima.json?.data], [200, { acceso: true }]);
  const spegni = await chiedi(URL_IMP, 'POST', { acceso: false });
  assert.equal(spegni.stato, 200);
  assert.deepEqual(spegni.json.data, { acceso: false });
  assert.equal(imp.acceso(), false);
  assert.equal((await chiedi(URL_IMP)).json.data.acceso, false);
  for (const male of [{ acceso: 'true' }, { acceso: true, schema: 'x' }, {}, { acceso: 0 }, [true]]) {
    const r = await chiedi(URL_IMP, 'POST', male);
    assert.deepEqual([r.stato, r.json?.error?.code], [400, 'QUERY_INVALID'], JSON.stringify(male));
  }
  assert.equal(imp.acceso(), false, 'nessun corpo strano ha cambiato niente');
  assert.equal((await chiedi(`${URL_IMP}?acceso=true`, 'POST', { acceso: true })).stato >= 400, true);
  assert.equal((await chiedi(`${URL_IMP}?x=1`)).stato >= 400, true);
  assert.equal(imp.acceso(), false);
  const senza = await server(t, {});
  for (const [metodo, corpo] of [['GET'], ['POST', { acceso: true }]]) {
    const r = await senza(URL_IMP, metodo, corpo);
    assert.deepEqual([r.stato, r.json?.error?.code], [503, 'COMPUTER_USE_SETTINGS_UNAVAILABLE'], metodo);
  }
});

test('CU-SET-05: dal vivo l\'ospite rilegge l\'interruttore a OGNI chiamata; spento nessuna carta, nessun passo, rotte 404 e niente operazioni dal dispositivo', async (t) => {
  const c = cartella(t);
  const imp = creaImpostazioneComputerUse({ file: join(c, 'imp.json'), diSerie: true });
  await imp.scrivi({ acceso: false });
  const avvii = [];
  const aiutante = { apri: async () => { avvii.push('apri'); return { ok: false, motivo: 'impronta-non-fissata' }; }, chiama: async () => { throw new Error('mai'); }, compito: () => () => {} };
  const porte = porteDelComputerUse({ fileLuoghi: join(c, 'luoghi.json'), acceso: imp.acceso, aiutante });
  assert.equal(typeof porte.perHttp.computerUseAccesoFn, 'function', 'dal vivo le rotte dei luoghi rileggono la scelta a ogni richiesta');
  const fn = porte.perNucleo.ospiteComputerUseFn;
  const sessione = { testoDellaPersona: 'apri il blocco note', chiediModello: async () => { throw new Error('mai'); }, chiediDomanda: async () => null, emetti: () => {}, fermato: () => null };
  const chiama = (fase) => fn('computer_use', { task: 'open Notepad' }, { fase, toolCallId: 'x', livelloAccesso: 'accesso-pieno', sessione });
  assert.deepEqual(await chiama('anteprima'), { ok: true, carta: false }, 'spento: nessuna carta');
  assert.deepEqual(await chiama('esegui'), { ok: false, testo: TESTO_COMPUTER_USE_SPENTO, messaggio: TESTO_COMPUTER_USE_SPENTO });
  assert.deepEqual(await fn('computer_use', { task: 'x' }), { ok: false, testo: TESTO_COMPUTER_USE_SPENTO, messaggio: TESTO_COMPUTER_USE_SPENTO }, 'senza fase vale «esegui»');
  assert.deepEqual(await porte.perNucleo.ospiteLuoghiFn('computer_use_places_list', {}, { fase: 'esegui' }), { ok: false, testo: TESTO_COMPUTER_USE_SPENTO, messaggio: TESTO_COMPUTER_USE_SPENTO }, 'anche i luoghi, a metà giro');
  assert.deepEqual(avvii, [], "spento l'aiutante non parte");
  assert.match(TESTO_COMPUTER_USE_SPENTO, /tools\.computerUse/u, 'il modello sa quale voce riaccende');
  const chiedi = await server(t, porte.perHttp);
  const P = '/api/v1/computer-use/remembered-places';
  assert.deepEqual([(await chiedi(P)).stato, (await chiedi(`${P}/clear`, 'POST', { conferma: true })).stato], [404, 404], 'spento: le rotte dei luoghi non ci sono');
  const op = creaOperazioni({ chiama: async () => ({ dati: null }), sessionRegistry: null, iscriviConRigiocata: null, cartelle: null, notifiche: null, ...porte.perRemoto });
  const delDispositivo = () => op.elenco().filter((nome) => nome.startsWith('computer-use.'));
  assert.deepEqual(delDispositivo(), [], 'spento: il dispositivo non vede computer-use.places.*');
  await assert.rejects(op.esegui('computer-use.places.list', {}, { dispositivo: { id: 'd1' } }), (e) => e?.code === 'UNKNOWN_OPERATION');
  await imp.scrivi({ acceso: true });
  assert.equal((await chiedi(P)).stato, 200, 'acceso a mano, senza riavviare: le rotte rispondono');
  assert.equal(delDispositivo().includes('computer-use.places.list'), true, 'e le operazioni del dispositivo tornano');
  const acceso = await chiama('esegui');
  assert.match(acceso.testo, /not available on this computer/u, 'riacceso senza riavviare: la chiamata dopo arriva all\'ospite vero');
  assert.deepEqual(avvii, ['apri']);
  await imp.scrivi({ acceso: false });
  assert.deepEqual(await chiama('esegui'), { ok: false, testo: TESTO_COMPUTER_USE_SPENTO, messaggio: TESTO_COMPUTER_USE_SPENTO }, 'e rispento');
  assert.equal((await chiedi(P)).stato, 404, 'rispento: le rotte spariscono senza riavviare');
  assert.deepEqual(delDispositivo(), [], 'e le operazioni del dispositivo');
  for (const strano of [() => 'true', () => 1, () => { throw new Error('rotto'); }]) {
    const p = porteDelComputerUse({ fileLuoghi: join(c, 'l2.json'), acceso: strano, aiutante });
    assert.deepEqual(await p.perNucleo.ospiteComputerUseFn('computer_use', { task: 'x' }, { fase: 'esegui', sessione }), { ok: false, testo: TESTO_COMPUTER_USE_SPENTO, messaggio: TESTO_COMPUTER_USE_SPENTO }, String(strano));
  }
  assert.deepEqual(avvii, ['apri']);
  /* il valore fisso resta com'era: true monta l'ospite senza involucro, ogni altro spegne tutto */
  const fisso = porteDelComputerUse({ fileLuoghi: join(c, 'l3.json'), acceso: true, aiutante });
  assert.match((await fisso.perNucleo.ospiteComputerUseFn('computer_use', { task: 'x' }, { fase: 'esegui', sessione })).testo, /not available on this computer/u);
});

test('CU-SET-06: app_settings — la voce tools.computerUse è del gruppo sicurezza (la carta c\'è sempre, anche in accesso pieno) e scrive lo stesso magazzino; di serie spenta', async (t) => {
  const c = cartella(t);
  const imp = creaImpostazioneComputerUse({ file: join(c, 'imp.json') });
  assert.equal(imp.acceso(), false, 'di serie spento');
  const voce = voceDelCatalogo('tools.computerUse');
  assert.equal(voce.gruppo, 'sicurezza');
  assert.deepEqual([voce.sezione, voce.testo.en, voce.testo.it], ['tools', 'Computer use', 'Uso del computer']);
  let n = 0;
  const s = creaServizioImpostazioni({ fonti: creaFontiDelServer({ impostazioneComputerUse: imp }), copiaFinestra: creaCopiaFinestra(), idFn: () => `id-${++n}`, attesaFinestraMs: 200 });
  const fn = s.perLaSessione({ sessionId: 'sess-1' });
  const elenco = await fn('app_settings', { action: 'list', section: 'tools' }, { fase: 'esegui' });
  assert.match(elenco.testo, /tools\.computerUse/u);
  const rev = Number(/Revision (\d+)/u.exec(elenco.testo)?.[1]);
  for (const [valore, id] of [[true, 'c1'], [false, 'c2']]) {
    const arg = { action: 'set', expected_revision: !valore ? Number(/Revision (\d+)/u.exec((await fn('app_settings', { action: 'list', section: 'tools' }, { fase: 'esegui' })).testo)?.[1]) : rev,
      changes: [{ key: 'tools.computerUse', value: valore }] };
    const carta = await fn('app_settings', arg, { fase: 'anteprima', toolCallId: id });
    assert.equal(carta.carta, true, `la carta c'è sempre (${valore})`);
    assert.equal(cartaAncheInAccessoPieno(carta.azione), true, `anche in accesso pieno: il modello non lo accende da solo (${valore})`);
    assert.deepEqual(carta.azione.cambi.map((x) => [x.chiave, x.prima, x.dopo, x.gruppo]), [['tools.computerUse', !valore, valore, 'sicurezza']]);
    assert.equal(imp.acceso(), !valore, 'la carta da sola non cambia niente');
    const fatto = await fn('app_settings', arg, { fase: 'esegui', toolCallId: id });
    assert.equal(fatto.ok, true, fatto.testo ?? fatto.messaggio);
    assert.equal(imp.acceso(), valore);
  }
});

test('CU-SET-07: revisione dei permessi — SENZA gettone la rotta non accende (403 PC_CONFIRMATION_REQUIRED, file invariato), spegnere resta libero; CON gettone la finestra accende', async (t) => {
  const c = cartella(t);
  const file = join(c, 'imp.json');
  const imp = creaImpostazioneComputerUse({ file, diSerie: false });
  const chiedi = await server(t, { impostazioneComputerUse: imp });
  const accendi = await chiedi(URL_IMP, 'POST', { acceso: true });
  assert.deepEqual([accendi.stato, accendi.json?.error?.code], [403, 'PC_CONFIRMATION_REQUIRED']);
  assert.equal(imp.acceso(), false);
  assert.equal(existsSync(file), false, 'niente scritto');
  const spegni = await chiedi(URL_IMP, 'POST', { acceso: false });
  assert.equal(spegni.stato, 200);
  const imp2 = creaImpostazioneComputerUse({ file: join(c, 'imp2.json'), diSerie: false });
  const s = createServer(createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, token: 'gettone-cu-07', impostazioneComputerUse: imp2 }));
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => { s.closeAllConnections(); s.close(r); }));
  const base = `http://127.0.0.1:${s.address().port}`;
  const r = await fetch(base + URL_IMP, { method: 'POST', headers: { origin: base, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', Cookie: 'talos_token=gettone-cu-07' }, body: JSON.stringify({ acceso: true }) });
  assert.equal(r.status, 200);
  assert.equal(imp2.acceso(), true);
});
