/*
 * L'interruttore del computer use (decisioni dell'owner 79 e 80, 03/11/2026; decisione 129, 04/11: nella versione nuova è ACCESO).
 * Si prova nei due versi. Di serie è acceso: le rotte rispondono 200 e sono nell'inventario, il dispositivo vede le operazioni.
 * Spento (solo qui, `acceso: false` passato a mano): rotte 404 come una rotta inventata, le operazioni del dispositivo non ci sono,
 * nessun file dei luoghi. L'inventario delle rotte si decide al caricamento del modulo dalla costante, quindi «fuori dall'inventario»
 * a mano non si può provare: lo spento a mano prova la porta di `server.mjs` (niente `luoghiFn`), che è quella che conta.
 * Sempre: nessuno importa il ciclo, le protezioni o il rilevatore; di `native/` escono solo la licenza e le impronte dell aiutante (09/11).
 * Decisione 310 dell'owner (06/11/2026): la costante resta accesa (la funzione è nella versione, come «Anteprima»), ma la scelta della
 * persona è SPENTA di serie: senza `acceso` le porte sono vuote; il server passa solo la lettura dal vivo dell'impostazione. Spento,
 * ogni rotta dei luoghi (anche le POST) risponde 404 come una rotta inventata.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { COMPUTER_USE_ACCESO, COMPUTER_USE_DI_SERIE, porteDelComputerUse } from '../src/computer-use/interruttore.mjs';
import { createHttpApp, metodiAmmessiPerRotta } from '../src/http-app.mjs';
import { creaOperazioni } from '../src/remoto/operazioni.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const QUI = import.meta.dirname;
const BASE = '/api/v1/computer-use/remembered-places';
const PAD = { dispositivo: { id: 'dispositivo-A1', nome: 'Pad' }, iscrizioni: new Map() };

function cartella(t) {
  const c = mkdtempSync(join(tmpdir(), 'talos-interruttore-'));
  t.after(() => rimuoviCartellaDiProva(c));
  return c;
}

/** Il server come lo monta `server.mjs`: le opzioni del computer use vengono SOLO da `porteDelComputerUse`. */
async function server(t, porte) {
  const app = createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, ...porte.perHttp });
  const s = createServer(app);
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => { s.closeAllConnections(); s.close(r); }));
  const indirizzo = `http://127.0.0.1:${s.address().port}`;
  const finestra = { origin: indirizzo, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' };
  return async (percorso, metodo = 'GET', corpo) => {
    const r = await fetch(indirizzo + percorso, { method: metodo, headers: finestra, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    return { stato: r.status, json: await r.json().catch(() => null) };
  };
}

function ponte(porte) {
  const cartelle = { consentita: async () => false, descrivi: async () => null };
  return creaOperazioni({ chiama: async () => ({ dati: null }), sessionRegistry: null, iscriviConRigiocata: null, cartelle, notifiche: null, ...porte.perRemoto });
}

const CHIAMATE = [[BASE, 'GET'], [`${BASE}/remove`, 'POST', { tipo: 'dominio', nome: 'x.example' }], [`${BASE}/clear`, 'POST', { conferma: true }]];

test('INTERRUTTORE-01: la funzione è nella versione (decisione 129), la scelta della persona è spenta di serie (decisione 310)', () => {
  assert.equal(COMPUTER_USE_ACCESO, true);
  assert.equal(COMPUTER_USE_DI_SERIE, false, 'di serie spento');
  // solo il codice: il commento in testa nomina apposta ciò che NON si usa
  const testo = readFileSync(join(QUI, '..', 'src', 'computer-use', 'interruttore.mjs'), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\/\/.*$/gmu, '');
  assert.match(testo, /export const COMPUTER_USE_ACCESO = true;/u);
  assert.match(testo, /export const COMPUTER_USE_DI_SERIE = false;/u);
  assert.match(testo, /acceso = COMPUTER_USE_DI_SERIE\b/u, 'senza `acceso` vale il valore di serie, spento');
  assert.doesNotMatch(testo, /process\.env|feature-flags|impostazion\w*\(/u, 'nessuna porta per accenderlo da fuori');
  // il server passa dall'interruttore e da nient'altro
  const srv = readFileSync(join(QUI, '..', 'server.mjs'), 'utf8');
  // revisione unica 03/11, mutanti S1/S2 sopravvissuti: il server che passa `acceso: true` passava la prova. Ora la chiamata è UNA e
  // scritta per intero, e nel codice del server (commenti tolti: «server acceso» vi compare molte volte) non c'è nessuna chiave `acceso`
  const chiamate = srv.match(/porteDelComputerUse\(/gu) ?? [];
  assert.equal(chiamate.length, 1, 'una sola chiamata a porteDelComputerUse');
  assert.equal(srv.split("porteDelComputerUse({ fileLuoghi: percorsoDatiDesktop('.computer-use-luoghi.json'), acceso: impostazioneComputerUse.acceso })").length - 1, 1,
    'la chiamata ha il file dei luoghi e la lettura dal vivo della scelta della persona, nient\'altro');
  const codiceSrv = srv.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/(^|[^:'"`])\/\/.*$/gmu, '$1');
  /* decisione 310: l'unico `acceso:` del server è la lettura dal vivo; mai un `true` scritto a mano */
  assert.deepEqual(codiceSrv.match(/\bacceso\s*:[^,}]*/gu), ['acceso: impostazioneComputerUse.acceso '], 'il server non accende il computer use');
  assert.equal(codiceSrv.split("creaImpostazioneComputerUse({ file: percorsoDatiDesktop('.computer-use-impostazione.json') })").length - 1, 1,
    'la scelta si crea una volta, senza `diSerie`: vale lo spento di serie');
  assert.doesNotMatch(srv, /creaRegistroLuoghi|luoghiFn\s*:|\bluoghi\s*:|onLuoghiFn/u, 'nessuna porta del computer use fuori dall\'interruttore');
  // passo 5 (04/11): gli ospiti del nucleo arrivano al registro SOLO da `perNucleo`, una volta; nessun ospite scritto a mano nel server
  assert.equal(codiceSrv.split('...computerUse.perNucleo,').length - 1, 1, 'il registro riceve perNucleo una volta');
  assert.doesNotMatch(codiceSrv, /ospite(?:Luoghi|ComputerUse)Fn\s*:|creaOspite(?:Luoghi|ComputerUse)|onComputerUseFn|aiutantePerMacchina|creaAiutanteMcp/u,
    'il server non costruisce gli ospiti né l\'aiutante');
  // l'aiutante nativo si spegne con il server, fra le risorse dello spegnimento gentile
  assert.match(codiceSrv, /\{ close: \(\) => chiudiTuttiGliAiutanti\(\) \}/u);
});

/* Decisione 129: con la costante accesa l'inventario contiene le rotte dei luoghi (si decide al caricamento di http-app). Spento a mano
   (niente `luoghiFn` da server.mjs) la GET resta identica a una rotta inventata; le due POST cadono nella rete finale di http-app, che a
   una rotta dell'inventario senza GET risponde 405 (`Allow: POST`). Misurato il 04/11: [405, 'METHOD_NOT_ALLOWED']. Ciò che conta resta
   provato: nessuna risposta 200, nessun file dei luoghi, nessun registro. */
test('INTERRUTTORE-02: AL CONTRARIO — spento a mano, nessuna chiamata riesce: ogni metodo è 404 come una rotta inventata; nessun file dei luoghi', async (t) => {
  const c = cartella(t);
  const fileLuoghi = join(c, '.computer-use-luoghi.json');
  const porte = porteDelComputerUse({ fileLuoghi, acceso: false });
  assert.deepEqual(porte, { registroLuoghi: null, perHttp: {}, perRemoto: {}, perNucleo: {} }, 'spento: nemmeno gli ospiti del nucleo');
  const chiedi = await server(t, porte);
  const inventata = await chiedi('/api/v1/computer-use/inventata');
  const inventataPost = await chiedi('/api/v1/computer-use/inventata', 'POST', {});
  for (const [percorso, metodo, corpo] of CHIAMATE) {
    const r = await chiedi(percorso, metodo, corpo);
    const atteso = metodo === 'GET' ? inventata : inventataPost;
    assert.deepEqual([r.stato, r.json?.error?.code], [atteso.stato, atteso.json?.error?.code], `${metodo} ${percorso}`);
    assert.deepEqual([r.stato, r.json?.error?.code], [404, 'NOT_FOUND'], `${metodo} ${percorso}: decisione 310, la rotta non c'è`);
  }
  assert.equal(existsSync(fileLuoghi), false, 'nessun file dei luoghi dopo le chiamate');
  assert.deepEqual(readdirSync(c), []);
});

test('INTERRUTTORE-03: AL CONTRARIO — spento a mano, il dispositivo non vede le operazioni e chiamarle è come chiamarne una inventata', async () => {
  const op = ponte(porteDelComputerUse({ fileLuoghi: join(tmpdir(), 'mai-scritto.json'), acceso: false }));
  assert.equal(op.elenco().some((nome) => nome.startsWith('computer-use.')), false);
  const rifiuto = async (nome, args) => { try { await op.esegui(nome, args, PAD); return 'eseguita'; } catch (e) { return e?.code ?? String(e); } };
  const inventata = await rifiuto('computer-use.places.inventata', {});
  assert.notEqual(inventata, 'eseguita');
  for (const nome of ['computer-use.places.list', 'computer-use.places.remove', 'computer-use.places.clear']) {
    assert.equal(await rifiuto(nome, { tipo: 'dominio', nome: 'x.example', conferma: true }), inventata, nome);
  }
});

test('INTERRUTTORE-04: acceso a mano: le chiamate rispondono 200, sono nell\'inventario e il dispositivo le vede; di serie no (decisione 310)', async (t) => {
  const c = cartella(t);
  assert.deepEqual(porteDelComputerUse({ fileLuoghi: join(c, 'di-serie.json') }), { registroLuoghi: null, perHttp: {}, perRemoto: {}, perNucleo: {} }, 'di serie: porte vuote');
  const porte = porteDelComputerUse({ fileLuoghi: join(c, '.computer-use-luoghi.json'), acceso: true });
  assert.ok(porte.registroLuoghi);
  const chiedi = await server(t, porte);
  for (const [percorso, metodo, corpo] of CHIAMATE) {
    assert.equal((await chiedi(percorso, metodo, corpo)).stato, 200, `${metodo} ${percorso}`);
    assert.notEqual(metodiAmmessiPerRotta(percorso), null, `${percorso} nell'inventario`);
  }
  const op = ponte(porte);
  assert.ok(op.elenco().includes('computer-use.places.list'));
  assert.deepEqual((await op.esegui('computer-use.places.list', {}, PAD)).voci, []);
  // solo il vero `true` accende: un valore qualunque resta spento
  for (const acceso of [1, 'true', 'si', {}]) {
    const p = porteDelComputerUse({ fileLuoghi: join(c, 'x.json'), acceso });
    assert.equal(p.registroLuoghi, null, String(acceso));
    assert.deepEqual(p.perNucleo, {}, `${String(acceso)}: nessun ospite al nucleo`);
  }
});

/* Passo 5 (04/11): acceso, il nucleo riceve i due ospiti dall'interruttore e da nient'altro; i luoghi sono quelli dello stesso registro
   delle rotte. L'aiutante della macchina non parte finché l'attrezzo non è chiamato; senza l'impronta fissata l'attrezzo dice «non
   disponibile» e non avvia niente. */
test("INTERRUTTORE-06: acceso, perNucleo porta l'ospite dei luoghi e quello del computer use; l'aiutante senza impronta non parte", async (t) => {
  const c = cartella(t);
  const avvii = [];
  const aiutante = { apri: async () => { avvii.push('apri'); return { ok: false, motivo: 'impronta-non-fissata' }; }, chiama: async () => { throw new Error('mai'); }, compito: () => () => {} };
  const porte = porteDelComputerUse({ fileLuoghi: join(c, '.computer-use-luoghi.json'), acceso: true, aiutante });
  assert.deepEqual(Object.keys(porte.perNucleo).sort(), ['ospiteComputerUseFn', 'ospiteLuoghiFn']);
  assert.equal(typeof porte.perNucleo.ospiteLuoghiFn, 'function');
  assert.equal(typeof porte.perNucleo.ospiteComputerUseFn, 'function');
  await porte.registroLuoghi.ricorda({ domini: ['esempio.it'], app: [] });
  const elenco = await porte.perNucleo.ospiteLuoghiFn('computer_use_places_list', {}, { fase: 'esegui' });
  assert.match(elenco.testo, /esempio\.it/u, "l'ospite dei luoghi legge lo stesso registro delle rotte");
  assert.deepEqual(avvii, [], "creare le porte non avvia l'aiutante");
  const sessione = { testoDellaPersona: 'apri il blocco note', chiediModello: async () => { throw new Error('mai'); }, chiediDomanda: async () => null, emetti: () => {}, fermato: () => null };
  const r = await porte.perNucleo.ospiteComputerUseFn('computer_use', { task: 'open Notepad' }, { fase: 'esegui', toolCallId: 'x', livelloAccesso: 'accesso-pieno', sessione });
  assert.equal(r.ok, false);
  assert.match(r.testo, /not available on this computer/u);
  assert.deepEqual(avvii, ['apri']);
  assert.equal(existsSync(join(c, 'cua-driver.exe')), false);
});

test('INTERRUTTORE-05: il ciclo, le protezioni e il rilevatore non li importa nessuno fuori dalla loro cartella; di native/ solo licenza e impronte', () => {
  const src = join(QUI, '..', 'src');
  const trovati = [];
  const giu = (dir) => {
    for (const v of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, v.name);
      if (v.isDirectory()) { if (p !== join(src, 'computer-use')) giu(p); continue; }
      if (!v.name.endsWith('.mjs')) continue;
      if (/from\s+['"][^'"]*computer-use\/(?:ciclo|protezioni|rilevatore)\.mjs['"]|import\(\s*['"][^'"]*computer-use\/(?:ciclo|protezioni|rilevatore)\.mjs/u.test(readFileSync(p, 'utf8'))) trovati.push(p);
    }
  };
  giu(src);
  /* il sorgente di server.mjs si LEGGE soltanto; scritto senza il nome fra parentesi quadre, che la guardia KEYRING-PROVA-04 legge come un avvio */
  const principale = 'server.mjs';
  if (/computer-use\/(?:ciclo|protezioni|rilevatore)\.mjs/u.test(readFileSync(join(QUI, '..', principale), 'utf8'))) trovati.push(principale);
  assert.deepEqual(trovati, []);
  // il pacchetto pubblico si fa da un elenco di inclusioni esplicito: di `native/` alla radice (l'aiutante di cua) escono SOLO la
  // licenza e le impronte del sorgente, per nome (owner 09/11/2026, strada A: la CI le usa per il pacchetto); i sorgenti mai
  const SOLO_QUESTI = ['native/aiutante-nativo/IMPRONTE.sha256', 'native/aiutante-nativo/LICENSE.md'];
  /* 09/11/2026 r39b INTERRUTTORE-05: lo script dell'export non entra nel pacchetto pubblico; là si guarda direttamente la radice */
  if (!existsSync(join(QUI, '..', '..', 'scripts', 'prepara-monorepo-pubblico.ps1'))) {
    const nativa = join(QUI, '..', '..', 'native');
    if (existsSync(nativa)) {
      assert.deepEqual(readdirSync(nativa), ['aiutante-nativo'], 'nel pacchetto pubblico, sotto native/ solo aiutante-nativo/');
      assert.deepEqual(readdirSync(join(nativa, 'aiutante-nativo')).sort().map((n) => `native/aiutante-nativo/${n}`), SOLO_QUESTI);
    }
    return;
  }
  const ps = readFileSync(join(QUI, '..', '..', 'scripts', 'prepara-monorepo-pubblico.ps1'), 'utf8');
  const blocco = ps.match(/\$script:inclusioni = @\(([\s\S]*?)\n\)/u);
  assert.ok(blocco, 'elenco delle inclusioni trovato');
  const voci = [...blocco[1].matchAll(/'([^']+)'/gu)].map((m) => m[1]);
  assert.ok(voci.includes('harness-ui/src'), 'l\'elenco letto è quello vero');
  assert.deepEqual(voci.filter((v) => v === 'native' || v.startsWith('native/') || v === '.' || v === '*').sort(), SOLO_QUESTI);
});
