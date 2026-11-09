import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer, request as richiestaHttp } from 'node:http';
import { createServer as creaServerTcp } from 'node:net';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { createHttpApp } from '../src/http-app.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { leggiFileOccupato } from './aiuto/leggi-file-occupato.mjs';
import { rimuoviCartellaDiProva, rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * ⛔⛔ «GETTONE SEMPRE» (decisione dell'owner, 02/11/2026; forma `FORMA-SEGRETO-DELLA-PAGINA-2026-11-02.md` con gli OK di Mobile, CLI e
 *   Performance). Ogni server ha il gettone: in memoria, mai nell'ambiente, mai su disco. La finestra entra con un biglietto monouso da
 *   60 secondi e poi porta il cookie finché il server vive.
 *
 * Il buco che queste prove chiudono: su un server avviato da sorgente (il 4174) un programma locale, compreso un comando del modello,
 * poteva dire «sì» alle carte, alzare i permessi, lanciare comandi, fidarsi di ganci, MCP e plugin. Hermes fa lo stesso ragionamento:
 * `hermes_cli/web_server.py:454-474` (ogni `/api/` vuole il gettone), `gateway/run_api.py:83-86` (il gettone non si pubblica in `GET /`),
 * `hermes_cli/web_routers/webapp.py:26-28` (biglietto monouso da 60 s).
 *
 * I nomi GS-xx sono quelli della tabella in §4 della forma.
 */

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const CAMPO_BIGLIETTO = 'ingresso';

const portaLibera = () => new Promise((ok, ko) => {
  const s = creaServerTcp();
  s.once('error', ko);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); });
});

const FIXTURE = 'sessione-gettone';

function preparaCartella(prefisso) {
  const radice = cartellaDiProva(prefisso);
  const sessioni = join(radice, 'sessions');
  const workspace = join(radice, 'workspace');
  mkdirSync(sessioni, { recursive: true });
  mkdirSync(workspace, { recursive: true });
  writeFileSync(join(sessioni, `${FIXTURE}.jsonl`), [
    { tipo: 'intestazione', sessionId: FIXTURE, taskId: 'fixture', cartella: workspace, task: { consegna: 'ciao' }, modello: 'fixture/no-inference', avviataAlle: '2026-11-03T00:00:00.000Z' },
    { type: 'RunStarted', _sequenza: 1 },
    { tipo: 'messaggi-finali', versioneGiro: 1, messaggiFinali: [{ role: 'user', content: 'ciao' }, { role: 'assistant', content: 'ciao a te' }] },
    { type: 'RunFinished', _sequenza: 2 },
  ].map((r) => JSON.stringify(r)).join('\n') + '\n');
  return { radice, sessioni, workspace };
}

/*
 * ⛔⛔ Regola del 03/11/2026, dopo che la prima stesura di GS-12 ha fatto partire un server sulla cartella dell'owner: NESSUNA prova sui dati veri. Ogni server di
 *   questo file nasce con APPDATA, LOCALAPPDATA e casa finti, e un percorso con la forma della cartella vera non parte nemmeno: la guardia sta qui, nella prova, e
 *   vale anche sul codice senza cura.
 */
function ambienteFinto(radice) {
  const casa = join(radice, 'casa-finta');
  mkdirSync(casa, { recursive: true });
  return { APPDATA: join(casa, 'AppData', 'Roaming'), LOCALAPPDATA: join(casa, 'AppData', 'Local'), USERPROFILE: casa, HOME: casa, XDG_CONFIG_HOME: join(casa, '.config') };
}
function maiLaCartellaVera(cartella, radice) {
  const tocca = /[\\/]AppData[\\/](?:Roaming|Local)[\\/]TALOS/iu.test(cartella) && !cartella.startsWith(radice);
  assert.equal(tocca, false, `questa prova punta a una cartella vera: ${cartella}`);
}

/**
 * Ferma un server di prova e toglie la sua cartella.
 * ⛔ 04/11/2026, settima suite della candidata: GS-12 rosso con «EPERM, Permission denied» sulla cartella `talos-gs-*`. Misurato:
 *   l'unico figlio che il server avvia DENTRO la cartella è il `echo ok` del Doctor d'avvio (cwd `<radice>/scratch/talos-doctor-*`).
 *   Col server ucciso, libuv chiude il suo job «kill on close» e il figlio muore, ma DOPO l'evento `exit` del server; in quella
 *   finestra il cwd del figlio tiene la cartella. `rmSync` non ritenta questo errore (Node 24.18: 0 ms con `maxRetries: 10`, benché
 *   la documentazione di `fs.rmSync` dica che EPERM si ritenta); la `rm` asincrona lo vede come EBUSY e ritenta (51 ms misurati).
 *   ⇒ La cartella si toglie con l'attesa asincrona: aspetta la condizione vera (la cartella sparita), con tetto, e lo dice con un avviso.
 *   Hermes ferma l'albero allo stesso modo e non dà per morto chi non ha aspettato (`agent/deadline.py:416-440`, `kill_process_tree`).
 */
async function fermaERimuovi(figlio, uscita, radice) {
  if (figlio.exitCode === null && figlio.signalCode === null) { figlio.kill(); await Promise.race([uscita, delay(15_000)]); }
  await rimuoviCartellaDiProvaAttesa(radice);
}

/**
 * Il server VERO, come lo avvia chi lo avvia: `argv` per il modo prove, `stdinTesto` per il gettone del lanciatore.
 * `ambiente` si aggiunge a una copia pulita: niente variabili del gettone ereditate da chi lancia le prove.
 */
async function avvia(t, { argv = [], stdinTesto = null, ambiente = {}, sessioni = null, attendiUscita = false } = {}) {
  const dir = preparaCartella('talos-gs-');
  maiLaCartellaVera(sessioni ?? dir.sessioni, sessioni && sessioni.startsWith(String(ambiente.APPDATA)) ? String(ambiente.APPDATA) : dir.radice);
  const porta = await portaLibera();
  const env = { ...process.env, ...ambienteFinto(dir.radice), TALOS_HARNESS_UI_HOST: '127.0.0.1', TALOS_HARNESS_UI_PORT: String(porta), TALOS_HARNESS_UI_SESSIONS_DIR: sessioni ?? dir.sessioni,
    TALOS_HARNESS_UI_PROJECT_DIRS: dir.workspace, TALOS_DESKTOP_DATA_DIR: join(dir.radice, 'desktop'), TALOS_HARNESS_UI_WORKFLOW_DIR: join(dir.radice, 'workflows'),
    TALOS_HARNESS_UI_KEYRING: 'memoria', TALOS_SCRATCH_DIR: join(dir.radice, 'scratch') };
  delete env.TALOS_HARNESS_UI_TOKEN;
  Object.assign(env, ambiente);
  if (stdinTesto !== null) env.TALOS_HARNESS_UI_SEGRETI_DA = 'stdin';
  const figlio = spawn(process.execPath, ['server.mjs', ...argv], { cwd: RADICE, windowsHide: true, stdio: [stdinTesto === null ? 'ignore' : 'pipe', 'pipe', 'pipe'], env });
  const uscita = new Promise((ok) => figlio.once('exit', (code) => ok(code)));
  const scritto = { out: '', err: '' };
  figlio.stdout.on('data', (c) => { scritto.out += c; });
  figlio.stderr.on('data', (c) => { scritto.err += c; });
  if (stdinTesto !== null) { figlio.stdin.write(stdinTesto); figlio.stdin.end(); }
  const ferma = async () => {
    await fermaERimuovi(figlio, uscita, dir.radice);
  };
  t.after(ferma, { timeout: 30_000 });
  if (attendiUscita) return { scritto, codice: await Promise.race([uscita, delay(30_000).then(() => 'appeso')]), dir };
  for (let i = 0; i < 400 && figlio.exitCode === null; i += 1) {
    if (/Harness UI disponibile/u.test(scritto.out)) break;
    await delay(50);
  }
  assert.match(scritto.out, /Harness UI disponibile/u, `il server non è partito:\n${(scritto.out + scritto.err).slice(-1500)}`);
  return { base: `http://127.0.0.1:${porta}`, porta, scritto, ferma, dir };
}

const posta = (base, percorso, corpo, intestazioni = {}) => fetch(`${base}${percorso}`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...intestazioni }, body: JSON.stringify(corpo),
});

/** Il biglietto che il server stampa quando il gettone l'ha fatto lui (avvio a mano, come nel README). */
function bigliettoDaiLog(scritto) {
  const trovato = new RegExp(`\\?${CAMPO_BIGLIETTO}=([^\\s]+)`, 'u').exec(scritto.out);
  assert.ok(trovato, `nessun biglietto nei log:\n${scritto.out.slice(-800)}`);
  return trovato[1];
}

/** Entra col biglietto e torna il cookie, come fa il browser. */
async function entra(base, biglietto) {
  const risposta = await fetch(`${base}/?${CAMPO_BIGLIETTO}=${encodeURIComponent(biglietto)}`, { redirect: 'manual' });
  assert.equal(risposta.status, 302, 'il biglietto buono rimanda alla pagina');
  const cookie = risposta.headers.get('set-cookie');
  assert.match(cookie ?? '', /^talos_token=[0-9a-zA-Z]{32,}/u);
  return { risposta, cookie, intestazione: cookie.split(';')[0], valore: /^talos_token=([0-9a-zA-Z]+)/u.exec(cookie)[1] };
}

/** Un biglietto fatto come lo fa il lanciatore: conosce il gettone, nessun'altra via. */
function bigliettoDi(gettone, { scadenza = Date.now() + 30_000, casuale = randomBytes(16).toString('hex'), alterato = false } = {}) {
  const chiave = createHmac('sha256', gettone).update('talos-biglietti-v1').digest();
  const firma = createHmac('sha256', chiave).update(`${scadenza}.${casuale}`).digest('hex');
  return `${scadenza}.${casuale}.${alterato ? firma.replace(/.$/u, (c) => (c === '0' ? '1' : '0')) : firma}`;
}

function upgrade(porta, { cookie = null, id = FIXTURE } = {}) {
  return new Promise((ok, ko) => {
    const r = richiestaHttp({ host: '127.0.0.1', port: porta, path: `/api/v1/terminal/ws?id=${encodeURIComponent(id)}`, headers: {
      Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': randomBytes(16).toString('base64'), ...(cookie ? { Cookie: cookie } : {}) } });
    r.once('upgrade', (res, socket) => { socket.destroy(); ok(res.statusCode); });
    r.once('response', (res) => { res.resume(); ok(res.statusCode); });
    r.once('error', ko);
    r.end();
  });
}

/* ───────── In processo: si contano i tocchi sul registro, la prova che conta è che niente parta ───────── */

function registroContato() {
  const chiamate = [];
  const registra = (nome, esito = { ok: true }) => (...a) => { chiamate.push({ nome, a }); return esito; };
  return { chiamate, registro: {
    esiste: () => true, allineaSessione: () => ({ ok: true }), rispondiApprovazione: registra('approve'), rispondiDomanda: registra('question'), shell: registra('shell'),
    aggiornaImpostazioni: async (...a) => { chiamate.push({ nome: 'settings', a }); return { aggiornate: true }; },
  } };
}

async function ascolta(t, opzioni) {
  const server = createServer(createHttpApp({ staticHandler: async () => null, senzaGettone: 'prove', ...opzioni }));
  await new Promise((ok, ko) => { server.once('error', ko); server.listen(0, '127.0.0.1', ok); });
  t.after(() => new Promise((ok) => { server.closeAllConnections?.(); server.close(() => ok()); }));
  return `http://127.0.0.1:${server.address().port}`;
}

const SETTE_ROTTE = Object.freeze([
  ['approve', `/api/v1/sessions/${FIXTURE}/approve`, { requestId: 'r1', approvato: true }],
  ['question', `/api/v1/sessions/${FIXTURE}/question`, { requestId: 'r1', status: 'skipped' }],
  ['settings', `/api/v1/sessions/${FIXTURE}/settings`, { permessi: 'Full access' }],
  ['shell', `/api/v1/sessions/${FIXTURE}/shell`, { comando: 'echo fatto' }],
  ['hooks-trust', `/api/v1/sessions/${FIXTURE}/hooks/h1/trust`, {}],
  ['mcp-trust', `/api/v1/sessions/${FIXTURE}/mcp/m1/trust`, {}],
  ['plugins-trust', `/api/v1/sessions/${FIXTURE}/plugins/p1/trust`, {}],
]);

/* ───────── GS-01…05: il server avviato come il 4174, senza gettone da fuori ───────── */

test('GS-01…05 server avviato come il 4174: senza cookie le sette rotte, apply e il terminale rispondono 401, con o senza Origin; niente cambia', { timeout: 120_000 }, async (t) => {
  const s = await avvia(t);
  const visti = {};
  for (const [nome, percorso, corpo] of SETTE_ROTTE) {
    for (const intestazioni of [{}, { origin: s.base }]) {
      const r = await posta(s.base, percorso, corpo, intestazioni);
      visti[`${nome}${intestazioni.origin ? '+origin' : ''}`] = r.status;
    }
  }
  /* GS-03: la prova della CLI (`Origin` finto su `apply`, tools.wslNormalUser), oggi 403 dalla carta, voluta 401 prima di toccare il servizio */
  for (const change of [{ key: 'tools.wslNormalUser', value: false }, { key: 'conversation.permissions', value: 'fullAccess' }]) {
    visti[change.key] = (await posta(s.base, '/api/v1/app-settings/apply', { sessionId: FIXTURE, changes: [change] }, { origin: s.base })).status;
  }
  visti.lettura = (await fetch(`${s.base}/api/v1/sessions`)).status;
  visti.terminale = await upgrade(s.porta);
  const attesi = Object.fromEntries(Object.keys(visti).map((k) => [k, 401]));
  assert.deepEqual(visti, attesi);
  assert.equal(readdirSync(s.dir.workspace).length, 0, 'GS-04: nessun comando partito ha lasciato traccia');
});

test('GS-02/GS-04 in processo, col gettone: senza cookie il registro non viene mai toccato, col cookie sì (la conta è la prova)', async (t) => {
  const gettone = randomBytes(32).toString('hex');
  const { registro, chiamate } = registroContato();
  const base = await ascolta(t, { token: gettone, sessionRegistry: registro });
  for (const [nome, percorso, corpo] of SETTE_ROTTE.slice(0, 4)) {
    assert.equal((await posta(base, percorso, corpo)).status, 401, nome);
    assert.equal((await posta(base, percorso, corpo, { origin: base })).status, 401, nome);
  }
  assert.deepEqual(chiamate, []);
  /* AL CONTRARIO */
  const conCookie = { cookie: `talos_token=${gettone}` };
  assert.equal((await posta(base, SETTE_ROTTE[0][1], SETTE_ROTTE[0][2], conCookie)).status, 200);
  assert.equal((await posta(base, SETTE_ROTTE[3][1], SETTE_ROTTE[3][2], conCookie)).status, 200);
  assert.deepEqual(chiamate.map((c) => c.nome), ['approve', 'shell']);
  assert.deepEqual(chiamate[0].a[3].confermatoDa, { tipo: 'finestra-pc' }, 'il «sì» del PC si timbra solo con il cookie');
});

/* ───────── GS-06…GS-09: col biglietto si entra, il gettone non si vede da nessuna parte ───────── */

test('GS-06/GS-08/GS-09 si entra col biglietto stampato, poi il cookie apre tutto; il gettone non è in nessun file, log o pagina, e un comando non lo eredita', { timeout: 120_000 }, async (t) => {
  const s = await avvia(t);
  /* GS-09: la pagina non lo porta mai. Hermes `gateway/run_api.py:83-85`: «any loopback peer could read from GET /» */
  const prima = await Promise.all(['/', '/index.html'].map((p) => fetch(`${s.base}${p}`).then((r) => r.text())));
  const { intestazione, valore } = await entra(s.base, bigliettoDaiLog(s.scritto));
  for (const testo of prima) assert.ok(!testo.includes(valore), 'GS-09: il gettone non sta nella pagina');
  const dopo = await fetch(`${s.base}/`).then((r) => r.text());
  assert.ok(!dopo.includes(valore));

  /* GS-06, al contrario di GS-01…05 */
  const cookie = { cookie: intestazione };
  assert.equal((await fetch(`${s.base}/api/v1/sessions`, { headers: cookie })).status, 200);
  const applicata = await posta(s.base, '/api/v1/app-settings/apply', { changes: [{ key: 'appearance.theme', value: 'paper' }] }, cookie);
  assert.equal(applicata.status, 200, await applicata.clone().text());
  const permessi = await posta(s.base, `/api/v1/sessions/${FIXTURE}/settings`, { permessi: 'Full access' }, cookie);
  assert.notEqual(permessi.status, 401, await permessi.clone().text());
  assert.equal(await upgrade(s.porta, { cookie: intestazione, id: 'nessuna-scheda' }), 403, 'col cookie si passa il cancello del gettone; una scheda inesistente evita di far nascere una PTY vera in prova');

  /* GS-08: un comando vero, dalla rotta del `!`: stampa il suo ambiente in un file che poi si scansiona */
  const uscita = join(s.dir.workspace, 'ambiente.txt');
  const comando = process.platform === 'win32' ? `set > "${uscita}"` : `env > '${uscita}'`;
  await posta(s.base, `/api/v1/sessions/${FIXTURE}/shell`, { comando }, cookie);
  for (let i = 0; i < 60; i += 1) { try { statSync(uscita); break; } catch { await delay(100); } }
  /* CI #91 (09/11/2026): su Windows il figlio della shell può tenere ancora `ambiente.txt` ⇒ EBUSY. Si aspetta che lo lasci, con un
     tetto, e alla fine si FALLISCE: nessun file si salta (`aiuto/leggi-file-occupato.mjs`). */
  const visti = [];
  const giro = async (cartella) => {
    for (const voce of readdirSync(cartella, { withFileTypes: true })) {
      const percorso = join(cartella, voce.name);
      if (voce.isDirectory()) await giro(percorso);
      else if (voce.isFile()) { visti.push(percorso); assert.ok(!(await leggiFileOccupato(percorso)).includes(Buffer.from(valore)), `il gettone è scritto in ${percorso}`); }
    }
  };
  await giro(s.dir.radice);
  assert.ok(visti.length > 0, 'la scansione ha guardato davvero dei file');
  assert.ok(!(s.scritto.out + s.scritto.err).includes(valore), 'il gettone non compare nei log');
});

test('GS-07 cookie sbagliato o di lunghezza diversa ⇒ 401, senza eccezioni; il `?token=` sbagliato anche', async (t) => {
  const gettone = randomBytes(32).toString('hex');
  const { registro } = registroContato();
  const base = await ascolta(t, { token: gettone, sessionRegistry: registro });
  for (const cattivo of ['x', `${gettone}0`, gettone.slice(0, -1), gettone.replace(/.$/u, (c) => (c === '0' ? '1' : '0')), 'è'.repeat(64)]) {
    const r = await fetch(`${base}/api/v1/sessions`, { headers: { cookie: `talos_token=${encodeURIComponent(cattivo)}` } });
    assert.equal(r.status, 401, cattivo);
  }
  assert.equal((await fetch(`${base}/?token=${gettone}0`, { redirect: 'manual' })).status, 401);
  const buono = await fetch(`${base}/?token=${gettone}`, { redirect: 'manual' });
  assert.equal(buono.status, 302, 'l\'app installata entra come prima');
  assert.doesNotMatch(buono.headers.get('set-cookie'), /Max-Age/iu, 'nell\'app installata il cookie resta di sessione');
});

/* ───────── GS-10: il biglietto ───────── */

test('GS-10 biglietto: il buono entra una volta sola; usato, scaduto, troppo lungo, firma sbagliata: stesso 401, stesso corpo; 60 secondi esatti', async (t) => {
  const gettone = randomBytes(32).toString('hex');
  let ora = Date.parse('2026-11-03T01:00:00.000Z');
  const { registro } = registroContato();
  const base = await ascolta(t, { token: gettone, sessionRegistry: registro, adessoBiglietti: () => ora });
  const chiedi = (b, intestazioni = {}) => fetch(`${base}/?${CAMPO_BIGLIETTO}=${encodeURIComponent(b)}`, { redirect: 'manual', headers: intestazioni });

  const buono = bigliettoDi(gettone, { scadenza: ora + 60_000 });
  const prima = await chiedi(buono);
  assert.equal(prima.status, 302);
  assert.equal(prima.headers.get('location'), '/');
  assert.equal(prima.headers.get('cache-control'), 'no-store');
  const cookie = prima.headers.get('set-cookie');
  assert.match(cookie, new RegExp(`^talos_token=${createHmac('sha256', gettone).update('talos-cookie-v1').digest('hex')}; `, 'u'), 'un valore derivato, il gettone non va nel profilo del browser');
  assert.match(cookie, /HttpOnly/u);
  assert.match(cookie, /SameSite=Strict/u);
  assert.match(cookie, /Path=\//u);
  assert.match(cookie, /Max-Age=\d{7,}/u, 'il cookie vale finché il server vive, anche a browser chiuso (owner)');

  const respinti = [];
  respinti.push(await chiedi(buono)); // secondo uso
  ora += 61_000;
  respinti.push(await chiedi(bigliettoDi(gettone, { scadenza: ora - 1_000 }))); // scaduto
  respinti.push(await chiedi(bigliettoDi(gettone, { scadenza: ora + 60_001 }))); // scadenza più lunga di 60 s: firmata, ma non è un biglietto di 60 s
  respinti.push(await chiedi(bigliettoDi(gettone, { scadenza: ora + 30_000, alterato: true }))); // firma sbagliata
  respinti.push(await chiedi(bigliettoDi('altro-gettone-della-stessa-lunghezza-ma-non-nostro', { scadenza: ora + 30_000 })));
  respinti.push(await chiedi('non-un-biglietto'));
  const corpi = await Promise.all(respinti.map((r) => r.text()));
  for (const r of respinti) { assert.equal(r.status, 401); assert.equal(r.headers.get('set-cookie'), null); }
  /* `meta.generatedAt` è l'ora della risposta: tutto il resto dev'essere identico */
  assert.equal(new Set(corpi.map((c) => { const b = JSON.parse(c); delete b.meta.generatedAt; return JSON.stringify(b); })).size, 1, 'i rifiuti non dicono quale dei motivi');
  assert.equal(JSON.parse(corpi[0]).error.code, 'AUTH_REQUIRED');

  /* il limite esatto: scade a t, a t vale ancora, a t+1 no */
  const limite = bigliettoDi(gettone, { scadenza: ora + 60_000 });
  ora += 60_000;
  assert.equal((await chiedi(limite)).status, 302);
  const oltre = bigliettoDi(gettone, { scadenza: ora + 1 });
  ora += 2;
  assert.equal((await chiedi(oltre)).status, 401);

  /* condizione del Tester: dal browser, una frase che dice cosa fare, nelle due lingue, stessa per ogni motivo */
  const pagina = await chiedi('non-un-biglietto', { accept: 'text/html,*/*;q=0.8', 'accept-language': 'it-IT,it;q=0.9' });
  assert.equal(pagina.status, 401);
  assert.match(pagina.headers.get('content-type'), /text\/html/u);
  assert.match(await pagina.text(), /nuovo link/u);
  const inglese = await chiedi(bigliettoDi(gettone, { scadenza: ora - 1 }), { accept: 'text/html', 'accept-language': 'en-US' });
  assert.match(await inglese.text(), /new link/u);
});

test('GS-10b una HEAD non brucia il biglietto, e il rifiuto non contiene il gettone', async (t) => {
  const gettone = randomBytes(32).toString('hex');
  const { registro } = registroContato();
  const base = await ascolta(t, { token: gettone, sessionRegistry: registro });
  const buono = bigliettoDi(gettone);
  assert.notEqual((await fetch(`${base}/?${CAMPO_BIGLIETTO}=${buono}`, { method: 'HEAD', redirect: 'manual' })).status, 302);
  assert.equal((await fetch(`${base}/?${CAMPO_BIGLIETTO}=${buono}`, { redirect: 'manual' })).status, 302, 'la HEAD non l\'aveva bruciato');
  const rifiuto = await fetch(`${base}/?${CAMPO_BIGLIETTO}=${buono}`, { redirect: 'manual' });
  assert.ok(!(await rifiuto.text()).includes(gettone));
});

/* ───────── GS-11: chi non deve accorgersi di niente ───────── */

test('GS-11 come il telefono: gettone dallo stdin, solo cookie, nessun Origin ⇒ apply e terminale passano; approve arriva al registro', { timeout: 120_000 }, async (t) => {
  const gettone = randomBytes(24).toString('hex');
  const s = await avvia(t, { stdinTesto: `TALOS_HARNESS_UI_TOKEN=${gettone}\n` });
  const cookie = { cookie: `talos_token=${gettone}` };
  assert.equal((await posta(s.base, '/api/v1/app-settings/apply', { changes: [{ key: 'appearance.theme', value: 'paper' }] }, cookie)).status, 200);
  const approva = await posta(s.base, `/api/v1/sessions/${FIXTURE}/approve`, { requestId: 'nessuna', approvato: false }, cookie);
  assert.ok(![401, 403].includes(approva.status), `arriva al registro, avuto ${approva.status}`);
  assert.equal(await upgrade(s.porta, { cookie: `talos_token=${gettone}`, id: 'nessuna-scheda' }), 403, 'il terminale: cancello passato, nessuna PTY in prova');
  assert.ok(!/ingresso=/u.test(s.scritto.out), 'il gettone l\'ha portato il lanciatore: il server non stampa biglietti');
  /* e un biglietto del lanciatore entra: è la via del 4174 */
  assert.notEqual((await entra(s.base, bigliettoDi(gettone))).valore, gettone);
  assert.equal((await fetch(`${s.base}/api/v1/sessions`, { headers: { cookie: (await entra(s.base, bigliettoDi(gettone))).intestazione } })).status, 200);
});

test('GS-11b chi passa il gettone dall\'ambiente non parte più (condizione del Mobile): codice nel messaggio, valore mai', { timeout: 60_000 }, async (t) => {
  const gettone = 'g'.repeat(48);
  const { scritto, codice } = await avvia(t, { ambiente: { TALOS_HARNESS_UI_TOKEN: gettone }, attendiUscita: true });
  assert.notEqual(codice, 0);
  assert.notEqual(codice, 'appeso');
  assert.match(scritto.out + scritto.err, /TOKEN_FROM_ENV_REFUSED/u);
  assert.ok(!(scritto.out + scritto.err).includes(gettone));
});

/* ───────── GS-12/GS-13: il modo «solo prove» ───────── */

test('GS-12 modo prove: nella cartella vera il server non parte, in una temporanea parte e lo dice; dall\'ambiente non si accende (condizione del Mobile)', { timeout: 120_000 }, async (t) => {
  /* ⛔⛔ 03/11/2026: MAI la cartella vera dell'owner, nemmeno per provare che viene rifiutata. La prima stesura puntava a `%APPDATA%/TALOS/sessions`
     e, sul codice ancora senza cura, il server è partito davvero lì per 30 secondi. Qui `APPDATA` è finta: la regola si prova su una cartella di prova
     che ha la FORMA di quella vera, e il figlio non può arrivare a quella dell'owner. */
  const finta = cartellaDiProva('talos-gs-appdata-');
  const appdataFinta = { APPDATA: finta, LOCALAPPDATA: finta, HOME: finta, XDG_CONFIG_HOME: finta };
  const vera = await avvia(t, { argv: ['--senza-gettone=prove'], ambiente: appdataFinta, sessioni: join(finta, 'TALOS', 'sessions'), attendiUscita: true });
  assert.notEqual(vera.codice, 0);
  assert.notEqual(vera.codice, 'appeso');
  assert.match(vera.scritto.out + vera.scritto.err, /NO_TOKEN_MODE_REFUSED/u);

  const s = await avvia(t, { argv: ['--senza-gettone=prove'] });
  assert.match(s.scritto.out + s.scritto.err, /no token/iu, 'scrive l\'avviso');
  assert.equal((await fetch(`${s.base}/api/v1/sessions`)).status, 200, 'senza gettone, solo in questo modo');

  /* AL CONTRARIO: un valore diverso non è il modo prove; l'ambiente di chi lancia non lo accende */
  const sbagliato = await avvia(t, { argv: ['--senza-gettone=si'], attendiUscita: true });
  assert.notEqual(sbagliato.codice, 0);
  const dallAmbiente = await avvia(t, { ambiente: { TALOS_HARNESS_UI_SENZA_GETTONE: 'prove' } });
  assert.equal((await fetch(`${dallAmbiente.base}/api/v1/sessions`)).status, 401, 'l\'ambiente non accende il modo prove');
});

test('GS-12c la fermata di un server di prova toglie la sua cartella anche quando un suo figlio la lascia DOPO l\'uscita del server (il `echo ok` del Doctor d\'avvio, settima suite del 04/11)', { timeout: 60_000 }, async (t) => {
  /* Il server finto fa ciò che fa il Doctor all'avvio (`src/doctor.mjs`, `eseguiComandoSandboxatoLocale`): un figlio col cwd in
     `<radice>/scratch/talos-doctor-*`. Nel server vero quel figlio muore col server (libuv lo mette nel job «kill on close»), ma la sua
     fine arriva DOPO l'evento `exit` del server: misurato a macchina ferma 3 volte su 36, `rmSync` subito dopo dà «EPERM, Permission
     denied» in 0 ms. Qui il figlio è staccato dal job e lascia la cartella 1 s dopo: la stessa corsa, resa certa invece che rara. */
  const radice = cartellaDiProva('talos-gs-albero-');
  const cwdDelFiglio = join(radice, 'scratch', 'talos-doctor-finto');
  mkdirSync(cwdDelFiglio, { recursive: true });
  const codice = `const { spawn } = require('node:child_process');
const n = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 1000)'], { cwd: process.argv[1], stdio: 'ignore', windowsHide: true, detached: true });
n.unref(); console.log('figlio ' + n.pid); setInterval(() => {}, 1000);`;
  const server = spawn(process.execPath, ['-e', codice, cwdDelFiglio], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const uscita = new Promise((ok) => server.once('exit', ok));
  let out = '';
  server.stdout.on('data', (c) => { out += c; });
  for (let i = 0; i < 400 && !/figlio \d+/u.test(out); i += 1) await delay(25);
  const figlio = Number(/figlio (\d+)/u.exec(out)?.[1]);
  assert.ok(figlio > 0, `il server finto non ha avviato il figlio: ${out}`);
  t.after(() => { try { process.kill(figlio); } catch { /* già uscito */ } try { server.kill(); } catch { /* già uscito */ } });
  await fermaERimuovi(server, uscita, radice);
  assert.equal(existsSync(radice), false, 'la cartella del server di prova se ne va');
});

test('GS-13 modo prove sul server vero: le sette rotte senza intestazioni ⇒ 403; dalla finestra (Origin della porta) passano la guardia', { timeout: 120_000 }, async (t) => {
  const s = await avvia(t, { argv: ['--senza-gettone=prove'] });
  for (const [nome, percorso, corpo] of SETTE_ROTTE) {
    const r = await posta(s.base, percorso, corpo);
    assert.equal(r.status, 403, `${nome}: un programma senza intestazioni`);
    const dallaFinestra = await posta(s.base, percorso, corpo, { origin: s.base });
    assert.notEqual(dallaFinestra.status, 403, `${nome}: la finestra passa la guardia`);
  }
});

/* ───────── GS-14: il guardiano statico ───────── */

test('GS-14 nessun confronto del gettone con === o !==, nemmeno nel terminale', () => {
  for (const file of ['src/http-app.mjs', 'src/terminal-ws.mjs']) {
    const testo = readFileSync(join(RADICE, file), 'utf8').split('\n').filter((r) => !/^\s*(\*|\/\/)/u.test(r)).join('\n');
    assert.doesNotMatch(testo, /(?:leggiCookie(?:Grezzo)?\([^)]*\)|searchParams\.get\('token'\))\s*[!=]==/u, file);
    assert.doesNotMatch(testo, /[!=]==\s*token\b/u, file);
  }
  /* GS-08: il gettone non entra mai in `process.env`, così nessun figlio lo eredita (su Windows dall'esterno non si legge: lo guarda la sorgente) */
  const server = readFileSync(join(RADICE, 'server.mjs'), 'utf8');
  assert.doesNotMatch(server, /process\.env(?:\.TALOS_HARNESS_UI_TOKEN|\[[^\]]*\])\s*=[^=]/u);
  assert.doesNotMatch(server, /Object\.assign\(process\.env/u);
});

test('GS-14b createHttpApp senza gettone e senza il segno del modo prove lancia (condizione della CLI)', () => {
  assert.throws(() => createHttpApp({ staticHandler: async () => null }), (e) => e.code === 'TOKEN_REQUIRED');
  assert.throws(() => createHttpApp({ staticHandler: async () => null, senzaGettone: 'si' }), (e) => e.code === 'TOKEN_REQUIRED');
  assert.throws(() => createHttpApp({ staticHandler: async () => null, token: '' }), (e) => e.code === 'TOKEN_REQUIRED');
  assert.equal(typeof createHttpApp({ staticHandler: async () => null, token: 'g'.repeat(32) }), 'function');
  assert.equal(typeof createHttpApp({ staticHandler: async () => null, senzaGettone: 'prove' }), 'function');
});

/* ───────── GS-15: i lanciatori. Il gettone va dallo stdin, nella riga di comando del browser c'è un biglietto ───────── */

test('GS-15 avvio col doppio clic: il gettone non è nell\'ambiente del figlio né nel link, il link è un biglietto che entra una volta sola', { timeout: 120_000 }, async (t) => {
  const dir = preparaCartella('talos-gs-avvio-');
  const porta = await portaLibera();
  const env = { ...process.env, ...ambienteFinto(dir.radice), TALOS_PROVA_A_SECCO: '1', TALOS_HARNESS_UI_HOST: '127.0.0.1', TALOS_HARNESS_UI_PORT: String(porta), TALOS_HARNESS_UI_SESSIONS_DIR: dir.sessioni,
    TALOS_HARNESS_UI_PROJECT_DIRS: dir.workspace, TALOS_DESKTOP_DATA_DIR: join(dir.radice, 'desktop'), TALOS_HARNESS_UI_WORKFLOW_DIR: join(dir.radice, 'workflows'),
    TALOS_HARNESS_UI_KEYRING: 'memoria', TALOS_SCRATCH_DIR: join(dir.radice, 'scratch'), TALOS_INTRO: '0' };
  delete env.TALOS_HARNESS_UI_TOKEN;
  const figlio = spawn(process.execPath, ['scripts/avvia-talos.mjs'], { cwd: RADICE, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env });
  let scritto = '';
  figlio.stdout.on('data', (c) => { scritto += c; });
  figlio.stderr.on('data', (c) => { scritto += c; });
  t.after(async () => {
    /* il lanciatore resta padre del server: su Windows `kill` non scende, si ferma la catena che è nostra */
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(figlio.pid), '/T', '/F'], { windowsHide: true }); else figlio.kill();
    await delay(300);
    await rimuoviCartellaDiProva(dir.radice);
  }, { timeout: 30_000 });
  for (let i = 0; i < 400 && !/apertura browser/u.test(scritto); i += 1) await delay(50);
  const link = /apertura browser: cmd \/c start "" (\S+)/u.exec(scritto)?.[1];
  assert.ok(link, `il lanciatore non ha aperto niente:\n${scritto.slice(-1500)}`);
  const u = new URL(link);
  assert.equal(u.pathname, '/');
  assert.deepEqual([...u.searchParams.keys()], [CAMPO_BIGLIETTO], 'nel link c\'è solo il biglietto');
  const { valore } = await entra(u.origin, u.searchParams.get(CAMPO_BIGLIETTO));
  assert.ok(!link.includes(valore), 'il gettone non passa dalla riga di comando del browser');
  assert.ok(!scritto.includes(valore), 'il gettone non compare nei log');
  assert.equal((await fetch(link, { redirect: 'manual' })).status, 401, 'il link usato non vale più');
  assert.equal((await fetch(`${u.origin}/api/v1/sessions`)).status, 401);
});

test('GS-15b la chiave dei biglietti: solo la chiave derivata su disco, mai il gettone; solo dell\'utente; il comando stampa un biglietto che entra', { timeout: 30_000 }, async (t) => {
  const casa = cartellaDiProva('talos-gs-casa-');
  const { salvaChiaveDeiBiglietti, leggiChiaveDeiBiglietti, percorsoChiave, preparaAvvioColGettone, linkDiIngresso, cookieDalBiglietto } = await import('../scripts/biglietto-talos.mjs');
  const avvio = preparaAvvioColGettone({ PATH: 'x', TALOS_HARNESS_UI_TOKEN: 'ereditato', talos_harness_ui_token: 'ereditato' });
  assert.equal(Object.keys(avvio.ambiente).some((k) => /token/iu.test(k)), false, 'nessun gettone nell\'ambiente del figlio');
  assert.ok(!JSON.stringify(avvio.ambiente).includes(avvio.gettone));
  assert.equal(avvio.stdin, `TALOS_HARNESS_UI_TOKEN=${avvio.gettone}\n`);

  const file = salvaChiaveDeiBiglietti(4999, avvio.gettone, casa);
  assert.equal(file, percorsoChiave(4999, casa));
  const sulDisco = readFileSync(file, 'utf8');
  assert.ok(!sulDisco.includes(avvio.gettone), 'il gettone non tocca il disco');
  assert.equal(readdirSync(dirname(file)).length, 1, 'nessun temporaneo lasciato');
  if (process.platform === 'win32') {
    const acl = spawnSync('icacls', [file], { encoding: 'utf8', windowsHide: true }).stdout;
    const righe = acl.split(/\r?\n/u).map((r) => r.replace(file, '').trim()).filter((r) => r.includes(':') && !/\d+ /u.test(r));
    /* ROSSO 4 della PR 91 (09/11/2026): se la cartella madre non passa permessi ai figli (runner di GitHub), il file nuovo prende quelli di serie
     * del processo, scritti sul file e non ereditati, e `/inheritance:r` toglie solo gli ereditati: restano SYSTEM e Administrators, che
     * leggono comunque tutto (OpenSSH per Windows accetta le stesse due voci sulle chiavi private). Solo quelle due in più, per nome o SID;
     * la voce dell'utente, col controllo completo, sempre. */
    const chi = (r) => r.slice(0, r.lastIndexOf(':')).toLowerCase();
    const utente = process.env.USERNAME.toLowerCase();
    const dellUtente = righe.filter((r) => chi(r) === utente || chi(r).endsWith(`\\${utente}`));
    assert.equal(dellUtente.length, 1, `la voce dell'utente, una sola: ${acl}`);
    assert.match(dellUtente[0], /:\(F\)$/u, acl);
    const diSistema = new Set(['nt authority\\system', 'builtin\\administrators', '*s-1-5-18', '*s-1-5-32-544']);
    assert.deepEqual(righe.filter((r) => !dellUtente.includes(r) && !diSistema.has(chi(r))), [], `nessun'altra voce oltre a SYSTEM e Administrators: ${acl}`);
  }
  /* il comando vero fa un biglietto che il server di quel gettone accetta */
  const { registro } = registroContato();
  const base = await ascolta(t, { token: avvio.gettone, sessionRegistry: registro });
  const chiave = leggiChiaveDeiBiglietti(4999, casa);
  assert.equal((await fetch(linkDiIngresso(base, chiave), { redirect: 'manual' })).status, 302);
  const perLoStop = await cookieDalBiglietto(base, chiave);
  assert.equal((await fetch(`${base}/api/v1/sessions`, { headers: { cookie: perLoStop } })).status !== 401, true, 'il cookie per lo stop gentile');
  assert.ok(!perLoStop.includes(avvio.gettone));
  assert.equal(await cookieDalBiglietto(base, Buffer.alloc(32, 1)), null, 'con la chiave sbagliata niente');
  assert.equal(leggiChiaveDeiBiglietti(5000, casa), null, 'una porta senza chiave');
});

test('GS-15c «Apri con TALOS» da Explorer: lo script entra col biglietto e poi chiede l\'apertura della cartella, come il 4174 vero', { timeout: 120_000, skip: process.platform !== 'win32' }, async (t) => {
  const { preparaAvvioColGettone, salvaChiaveDeiBiglietti } = await import('../scripts/biglietto-talos.mjs');
  const avvio = preparaAvvioColGettone({});
  const s = await avvia(t, { stdinTesto: avvio.stdin });
  const casa = cartellaDiProva('talos-gs-casa-');
  salvaChiaveDeiBiglietti(s.porta, avvio.gettone, casa);
  const segretoVero = join(s.dir.radice, 'desktop', '.workspace-launch-token');
  const lancia = (ambiente, fileDelSegreto = segretoVero) => spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(RADICE, 'scripts', 'windows', 'open-with-talos.ps1'),
    '-WorkspacePath', s.dir.workspace, '-BaseUrl', s.base, '-TokenFile', fileDelSegreto, '-NoBrowser'],
  { encoding: 'utf8', windowsHide: true, timeout: 60_000, env: { ...process.env, ...ambiente } });
  const riuscita = lancia({ USERPROFILE: casa, HOME: casa });
  assert.match(riuscita.stdout, /open-workspace=/u, `${riuscita.stdout}\n${riuscita.stderr}`);
  /* S4 della revisione cloud della PR 20: senza la chiave dei biglietti (l'app installata non la scrive mai) entra col solo segreto del lanciatore */
  const senzaChiave = lancia({ USERPROFILE: s.dir.radice, HOME: s.dir.radice });
  assert.match(senzaChiave.stdout, /open-workspace=/u, `${senzaChiave.stdout}\n${senzaChiave.stderr}`);
  /* AL CONTRARIO: col segreto del lanciatore sbagliato non entra, nemmeno col biglietto, e lo dice */
  const sbagliato = join(casa, '.workspace-launch-token-sbagliato');
  writeFileSync(sbagliato, 'b'.repeat(64));
  for (const ambiente of [{ USERPROFILE: casa, HOME: casa }, { USERPROFILE: s.dir.radice, HOME: s.dir.radice }]) {
    const rifiutata = lancia(ambiente, sbagliato);
    assert.doesNotMatch(rifiutata.stdout, /open-workspace=/u);
    assert.notEqual(rifiutata.status, 0);
  }
});

/*
 * ⛔ Decisione 155 dell'owner (04/11/2026, aggiornamento 17:02): in Accesso pieno LEGGERE la chiave dei biglietti (`~/.talos-biglietti`, una
 *   credenziale di casa: 161) chiede ancora; LANCIARE il comando dei biglietti no, come ogni altro comando. Nelle altre modalità tutti e due chiedono.
 */
test('GS-17 per il modello la chiave dei biglietti chiede la carta anche in Accesso pieno, il comando dei biglietti solo fuori (155); un comando normale no', async () => {
  const { verificaPermessoScrittura } = await import('../src/kernel/talosHarness.mjs');
  const chiedi = async (azione, livelloAccesso) => {
    const chieste = [];
    await verificaPermessoScrittura(azione, { livelloAccesso, chiediApprovazioneFn: async (a) => { chieste.push(a); return true; } });
    return chieste;
  };
  const chiave = '~/.talos-biglietti/4174.chiave';
  for (const [azione, cartaInPieno] of [[{ tipo: 'leggi', percorso: chiave }, true], [{ tipo: 'shell', comando: `cat ${chiave}` }, true],
    [{ tipo: 'shell', comando: 'type %USERPROFILE%\\.talos-biglietti\\4174.chiave' }, true],
    [{ tipo: 'shell', comando: 'node harness-ui/scripts/biglietto-talos.mjs' }, false], [{ tipo: 'shell', comando: 'cd harness-ui && node scripts\\biglietto-talos.mjs --apri' }, false]]) {
    const pieno = await chiedi(azione, 'accesso-pieno');
    assert.equal(pieno.length, cartaInPieno ? 1 : 0, `Accesso pieno: ${JSON.stringify(azione)}`);
    if (cartaInPieno) assert.equal(pieno[0].segreto?.credenzialeDellaCasa, true, JSON.stringify(azione));
    assert.equal((await chiedi(azione, 'su-richiesta')).length, 1, `modo ristretto: ${JSON.stringify(azione)}`);
  }
  /* AL CONTRARIO */
  assert.equal((await chiedi({ tipo: 'shell', comando: 'npm test' }, 'accesso-pieno')).length, 0);
  assert.equal((await chiedi({ tipo: 'shell', comando: 'node scripts/non-biglietto-talos2.mjs' }, 'accesso-pieno')).length, 0);
});

test('GS-18 il server della suite del browser: gettone dallo stdin, la riga di pronto esce solo a salute verde col cookie', { timeout: 60_000 }, async (t) => {
  const dir = preparaCartella('talos-gs-pw-');
  const porta = await portaLibera();
  const gettone = randomBytes(32).toString('hex');
  const env = { ...process.env, ...ambienteFinto(dir.radice), TALOS_PW_GETTONE: gettone, TALOS_HARNESS_UI_HOST: '127.0.0.1', TALOS_HARNESS_UI_PORT: String(porta), TALOS_HARNESS_UI_SESSIONS_DIR: dir.sessioni,
    TALOS_HARNESS_UI_PROJECT_DIRS: dir.workspace, TALOS_DESKTOP_DATA_DIR: join(dir.radice, 'desktop'), TALOS_HARNESS_UI_WORKFLOW_DIR: join(dir.radice, 'workflows'),
    TALOS_SCRATCH_DIR: join(dir.radice, 'scratch') };
  delete env.TALOS_HARNESS_UI_TOKEN;
  const figlio = spawn(process.execPath, ['frontend/scripts/server-di-prova-col-gettone.mjs'], { cwd: RADICE, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env });
  let scritto = '';
  figlio.stdout.on('data', (c) => { scritto += c; });
  figlio.stderr.on('data', (c) => { scritto += c; });
  t.after(async () => {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(figlio.pid), '/T', '/F'], { windowsHide: true }); else figlio.kill();
    await delay(300);
    await rimuoviCartellaDiProva(dir.radice);
  }, { timeout: 30_000 });
  for (let i = 0; i < 600 && !/TALOS-SERVER-DI-PROVA-PRONTO/u.test(scritto); i += 1) await delay(50);
  assert.match(scritto, /TALOS-SERVER-DI-PROVA-PRONTO/u, scritto.slice(-1000));
  const base = `http://127.0.0.1:${porta}`;
  assert.equal((await fetch(`${base}/api/v1/health`, { headers: { cookie: `talos_token=${gettone}` } })).status, 200);
  assert.equal((await fetch(`${base}/api/v1/health`)).status, 401);
  assert.ok(!scritto.includes(gettone), 'il gettone non compare nei log');
  assert.ok(!/ingresso=/u.test(scritto), 'il gettone l\'ha portato il lanciatore: niente biglietti stampati');
});

/* ───────── La revisione avversaria del 03/11 (REVISIONE-GETTONE-2026-11-03.md): R1, R4, R5, R7, R8, R9 ───────── */

async function devServerFinto(t, html) {
  const server = createServer((_q, s) => { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); s.end(html); });
  await new Promise((ok) => { server.listen(0, '127.0.0.1', ok); });
  t.after(() => new Promise((ok) => { server.closeAllConnections?.(); server.close(() => ok()); }));
  return `http://127.0.0.1:${server.address().port}/`;
}

test('GR-01 (R1) la pagina di un server locale non gira sulla nostra origine col cookie: la rotta rimanda all altro nome di loopback, dove il cookie non arriva', { timeout: 120_000 }, async (t) => {
  const gettone = randomBytes(32).toString('hex');
  const s = await avvia(t, { stdinTesto: `TALOS_HARNESS_UI_TOKEN=${gettone}\n` });
  const cookie = { cookie: `talos_token=${gettone}` };
  const dev = await devServerFinto(t, '<!doctype html><html><head><title>dev</title></head><body><script>fetch(location.origin + "/api/v1/app-settings/apply")</script></body></html>');
  const rotta = `${s.base}/api/v1/browser/proxy?url=${encodeURIComponent(dev)}`;

  assert.equal((await fetch(rotta, { redirect: 'manual' })).status, 401, 'senza cookie niente');
  const rimando = await fetch(rotta, { redirect: 'manual', headers: cookie });
  assert.equal(rimando.status, 302, 'col cookie non si serve la pagina dalla nostra origine');
  const dove = new URL(rimando.headers.get('location'));
  assert.equal(dove.hostname, 'localhost', 'un altro sito per il browser: il cookie Strict di 127.0.0.1 non lo segue');
  assert.equal(dove.port, String(s.porta));
  assert.equal(rimando.headers.get('cache-control'), 'no-store');

  /* la pagina arriva sull'altro nome, senza cookie, con lo script e l'annotazione */
  const pagina = await fetch(dove, { redirect: 'manual' });
  assert.equal(pagina.status, 200, await pagina.clone().text());
  const testo = await pagina.text();
  assert.match(testo, /browser-annota\.js/u);
  assert.match(pagina.headers.get('content-security-policy'), new RegExp(`frame-ancestors http://127\\.0\\.0\\.1:${s.porta} http://localhost:${s.porta}`, 'u'), 'solo la finestra la incornicia');
  assert.ok(!testo.includes(gettone));

  /* da lì lo script non ha autorità: niente cookie, nessuna scrittura */
  assert.equal((await posta(`http://localhost:${s.porta}`, '/api/v1/app-settings/apply', { changes: [{ key: 'tools.wslNormalUser', value: false }] }, { origin: `http://localhost:${s.porta}` })).status, 401);

  /* la stessa pagina col cookie valido non si serve mai: vorrebbe dire scripts del dev server con l'autorità della finestra */
  assert.equal((await fetch(dove, { redirect: 'manual', headers: cookie })).status, 403);
  /* il lasciapassare vale per QUELL'indirizzo e nasce solo col cookie */
  const altra = new URL(dove); altra.searchParams.set('url', `${dev}altra`);
  assert.equal((await fetch(altra, { redirect: 'manual' })).status, 401);
  const senza = new URL(dove); senza.searchParams.delete('pass');
  assert.equal((await fetch(senza, { redirect: 'manual' })).status, 401);
  /* ricarica della cornice (un dev server che ricarica la pagina): lo stesso indirizzo vale ancora */
  assert.equal((await fetch(dove, { redirect: 'manual' })).status, 200);
});

/*
 * ⛔ S1 della CLI, 03/11/2026: la firma copriva l'indirizzo e non il nome del server. La pagina sta su `localhost:P` e legge il suo `pass` nell'indirizzo; aprendo lo stesso `pass`
 *   su `127.0.0.1:P` con una navigazione da un altro sito il cookie Strict non parte, quindi niente 403: la pagina tornava sull'origine della finestra, e di lì `/api/` col cookie.
 *   Le richieste qui passano da `richiestaHttp` perché si deve poter scrivere l'Host: il server ascolta su un indirizzo solo.
 */
const leggiConHost = (porta, percorso, host, intestazioni = {}) => new Promise((ok, ko) => {
  const r = richiestaHttp({ host: '127.0.0.1', port: porta, path: percorso, headers: { host, ...intestazioni } }, (risposta) => { risposta.resume(); risposta.once('end', () => ok({ stato: risposta.statusCode, dove: risposta.headers.location })); });
  r.once('error', ko);
  r.end();
});

test('GR-13 (S1 della CLI) la firma di una pagina locale dice anche il nome del server, a valori fissi', async () => {
  const { firmaPaginaLocale } = await import('../src/gettone.mjs');
  const gettone = 'g'.repeat(64);
  const indirizzo = 'http://127.0.0.1:5173/';
  assert.equal(firmaPaginaLocale(gettone, 'localhost:4174', indirizzo), createHmac('sha256', gettone).update(`talos-pagina-locale-v1\nlocalhost:4174\n${indirizzo}`).digest('hex'));
  assert.notEqual(firmaPaginaLocale(gettone, 'localhost:4174', indirizzo), firmaPaginaLocale(gettone, '127.0.0.1:4174', indirizzo));
  assert.notEqual(firmaPaginaLocale(gettone, 'localhost:4174', indirizzo), firmaPaginaLocale(gettone, 'localhost:4175', indirizzo), 'anche la porta');
  assert.notEqual(firmaPaginaLocale(gettone, 'localhost:4174', indirizzo), firmaPaginaLocale(gettone, 'localhost:4174', `${indirizzo}altra`), 'e sempre l indirizzo');
});

test('GR-14 (S1 della CLI) il lasciapassare preso dalla pagina locale non la riporta sul nome della finestra: 401, nei due versi', { timeout: 60_000 }, async (t) => {
  const gettone = randomBytes(32).toString('hex');
  const { registro } = registroContato();
  const base = await ascolta(t, { token: gettone, sessionRegistry: registro });
  const porta = Number(new URL(base).port);
  const dev = await devServerFinto(t, '<!doctype html><html><head><title>dev</title></head><body>dev</body></html>');
  const cookie = { cookie: `talos_token=${gettone}` };
  for (const [finestra, altro] of [[`127.0.0.1:${porta}`, `localhost:${porta}`], [`localhost:${porta}`, `127.0.0.1:${porta}`]]) {
    const rimando = await leggiConHost(porta, `/api/v1/browser/proxy?url=${encodeURIComponent(dev)}`, finestra, cookie);
    assert.equal(rimando.stato, 302, finestra);
    const dove = new URL(rimando.dove);
    assert.equal(dove.host, altro, 'il rimando va sull altro nome');
    const percorso = `${dove.pathname}${dove.search}`;
    assert.equal((await leggiConHost(porta, percorso, altro)).stato, 200, 'sul nome per cui è firmato la pagina arriva');
    assert.equal((await leggiConHost(porta, percorso, finestra)).stato, 401, 'sul nome della finestra, senza cookie come in una navigazione da un altro sito, no');
    assert.equal((await leggiConHost(porta, percorso, `[::1]:${porta}`)).stato, 401, 'nemmeno sul terzo nome di loopback');
    assert.equal((await leggiConHost(porta, percorso, finestra, cookie)).stato, 403, 'col cookie resta il 403 di prima');
  }
});

/*
 * ⛔ N1 della seconda revisione (S1, 03/11/2026): la CSP della pagina ammetteva `frame-src http://127.0.0.1:* http://localhost:*`. Una cornice diretta su un altro
 *   server di loopback (una lettura di `naviga`, o un rimando da una pagina pubblica) è lo STESSO sito della finestra: il cookie Strict partiva verso il server del
 *   comando. Ora il documento ammette solo l'altro nome alla stessa porta, dove sta il proxy; ogni altra cornice di loopback il browser la rifiuta.
 */
const intestazioniConHost = (porta, percorso, host, intestazioni = {}) => new Promise((ok, ko) => {
  const r = richiestaHttp({ host: '127.0.0.1', port: porta, path: percorso, headers: { host, ...intestazioni } }, (risposta) => { risposta.resume(); risposta.once('end', () => ok(risposta.headers)); });
  r.once('error', ko);
  r.end();
});
const frameSrc = (csp) => /(?:^|;)\s*frame-src ([^;]*)/u.exec(String(csp))?.[1].trim().split(/\s+/u) ?? null;

test('GR-16 (N1, S1) il documento ammette in cornice solo l altro nome alla stessa porta: nessun altro server di loopback, su nessun nome', async (t) => {
  const gettone = randomBytes(32).toString('hex');
  const { registro } = registroContato();
  const base = await ascolta(t, { token: gettone, sessionRegistry: registro, staticHandler: async () => ({ statusCode: 200, contentType: 'text/html; charset=utf-8', body: Buffer.from('<!doctype html><html><head></head><body>APP</body></html>') }) });
  const porta = Number(new URL(base).port);
  const cookie = { cookie: `talos_token=${gettone}`, accept: 'text/html' };
  for (const [finestra, altro] of [[`127.0.0.1:${porta}`, `localhost:${porta}`], [`localhost:${porta}`, `127.0.0.1:${porta}`]]) {
    const sorgenti = frameSrc((await intestazioniConHost(porta, '/', finestra, cookie))['content-security-policy']);
    assert.ok(sorgenti, finestra);
    assert.deepEqual(sorgenti.filter((s) => s.startsWith('http:')), [`http://${altro}`], `${finestra}: solo il proxy, ${sorgenti.join(' ')}`);
    assert.ok(sorgenti.includes("'self'") && sorgenti.includes('https:'), 'le pagine nostre e i siti https restano');
    assert.ok(!sorgenti.some((s) => /\*/u.test(s)), 'nessuna porta qualunque');
  }
  /* AL CONTRARIO: ogni altra risposta non ammette nessuna cornice http */
  const json = frameSrc((await intestazioniConHost(porta, '/api/v1/sessions', `127.0.0.1:${porta}`, cookie))['content-security-policy']);
  assert.ok(json && !json.some((s) => s.startsWith('http:')), String(json));
  /* senza Host una richiesta non arriva nemmeno all'app: Node risponde 400 da solo (`requireHostHeader`, di serie) */
  const senzaHost = await new Promise((ok, ko) => {
    const r = richiestaHttp({ host: '127.0.0.1', port: porta, path: '/', setHost: false, headers: cookie }, (risposta) => { risposta.resume(); risposta.once('end', () => ok(risposta.statusCode)); });
    r.once('error', ko);
    r.end();
  });
  assert.equal(senzaHost, 400);
});

test('GR-02 (R1) nell app installata il rimando del proxy passa: una cornice può andare sull altro nome dello stesso server, la finestra no', async () => {
  const { rimandoConsentito } = await import('../desktop/runtime.mjs');
  const base = 'http://127.0.0.1:50000';
  assert.equal(rimandoConsentito(base, `${base}/x`, true), true, 'la finestra resta sulla sua origine');
  assert.equal(rimandoConsentito(base, 'http://localhost:50000/api/v1/browser/pagina-locale?x=1', false), true);
  assert.equal(rimandoConsentito(base, 'http://localhost:50000/x', true), false, 'la finestra non esce');
  assert.equal(rimandoConsentito(base, 'http://localhost:50001/x', false), false, 'un altra porta no');
  assert.equal(rimandoConsentito(base, 'https://evil.test/', false), false);
  assert.equal(rimandoConsentito(base, 'non un indirizzo', false), false);
});

test('GR-03 (classe di R1) un SVG di un sito qualunque aperto da solo non gira sulla nostra origine: la favicon arriva chiusa', async (t) => {
  const gettone = randomBytes(32).toString('hex');
  const cache = cartellaDiProva('talos-gs-favicon-');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>fetch("/api/v1/app-settings/apply")</script></svg>';
  const dominio = 'sito-qualunque.example';
  writeFileSync(join(cache, `${createHash('sha256').update(dominio).digest('hex').slice(0, 24)}.json`), JSON.stringify({ quando: Date.now(), tipo: 'image/svg+xml', base64: Buffer.from(svg).toString('base64') }));
  const { registro } = registroContato();
  const base = await ascolta(t, { token: gettone, sessionRegistry: registro, cartellaFavicon: cache });
  const r = await fetch(`${base}/api/v1/favicon?dominio=${dominio}`, { headers: { cookie: `talos_token=${gettone}` } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/svg+xml');
  assert.match(r.headers.get('content-security-policy') ?? '', /default-src 'none'/u);
  assert.match(r.headers.get('content-security-policy') ?? '', /\bsandbox\b/u);
});

/*
 * ⛔ Decisione 155 dell'owner (04/11/2026, aggiornamento 17:02 del brief): in Accesso pieno la guardia dei biglietti si divide. Chiede solo chi
 *   legge la CARTELLA delle chiavi (`~/.talos-biglietti`, una credenziale di casa: 161), in ogni grafia della shell; il nome del comando, la
 *   parola `<porta>.chiave` da sola e i tetti («troppo complesso») non fanno più carte. Nelle altre modalità tutto chiede come prima.
 *   L'elenco qui sotto è scritto a mano, comando per comando: è la prova, non una copia della regola.
 */
const LEGGONO_LA_CARTELLA = new Set([
  'cat "$USERPROFILE/.talos-biglietti/4174.chiave"', 'cd ~ && cat .talos-biglietti/4174.chiave', 'tar cf x.tar -C ~ .talos-biglietti',
  'cat ~/.talos-b*/*', 'cat ~/.talos-bigl?etti/4174.*', 'cat ~/.t*/4174.c*', 'ls -a ~ && head -c 99 ~/.talos-b*/4174*', 'cat ~/.*/4174.chi*',
  'tar cf x.tar ~/.talos-b*', 'cp -r ~/.t* /tmp/x', 'cat ~/.talos-bigliett[i]/4174.chiav[e]', 'cat ~/.talos-{biglietti,x}/4174.chiave', 'cat ~/.talos-bigliett\\i/4174.chiave',
  'cat ~/.talos-bigliett[h-j]/4174.chiav[d-f]', 'cat ~/.talos-{biglietti,}/4174.chiav{e,}', 'Get-Content $HOME\\.talos-bigliett[h-j]\\4174.key', 'Get-Content ~\\?t?los*\\4174.key',
  'echo $(cat ~/.talos-bigliett[h-j]/4174.key)', 'x=`cat ~/.talos-bigliett[h-j]/4174.key`', 'cat "$(echo ~/.talos-bigliett?/4174.key)"',
  `sh -c 'cat ~/.talos-bigl""ietti/4174.chiave'`, 'type %USERPROFILE%\\.talos-bigl%y%etti\\4174.chiave',
  'cat ~/.talos-biglietti/4174.chiave', 'type %USERPROFILE%\\TALOS-~1\\4174~1.CHI', 'cat ~/TALOS-~1/4174~1.CHI', 'type C:\\Users\\finta\\TALOS-~1\\x.txt', 'node TA9C1E~1\\4174~1.txt',
]);
const inAccessoPieno = (credenzialeDellaCasaLetta, argomenti, comando) => {
  const r = credenzialeDellaCasaLetta(argomenti);
  assert.equal(r?.credenzialeDellaCasa ?? false, LEGGONO_LA_CARTELLA.has(comando), `Accesso pieno (155): ${comando}`);
};

test('GR-04 (R4) le forme normali di leggere la chiave o lanciare il comando chiedono; in Accesso pieno solo la lettura della cartella (155); un comando che non c entra no', async () => {
  const { motivoDaChiedere, credenzialeDellaCasaLetta } = await import('../src/path-policy.mjs');
  const casa = process.platform === 'win32' ? 'C:\\Users\\finta' : '/home/finta';
  for (const comando of ['cat "$USERPROFILE/.talos-biglietti/4174.chiave"', 'cd ~ && cat .talos-biglietti/4174.chiave', 'tar cf x.tar -C ~ .talos-biglietti', 'find ~ -name "*.chiave" -exec cat {} \\;',
    'node harness-ui/scripts/biglietto-*.mjs', 'node scripts/bigl*talos.mjs', 'node scripts/biglietto-tal?s.mjs', 'node scripts/bigliett"o-talos".mjs', "node scripts/biglietto-'talos'.mjs", 'node scripts/biglietto\\-talos.mjs']) {
    assert.ok(motivoDaChiedere({ tipo: 'shell', comando, cartella: join(casa, 'lavoro'), home: casa }), `modo ristretto: ${comando}`);
    inAccessoPieno(credenzialeDellaCasaLetta, { tipo: 'shell', comando, cartella: join(casa, 'lavoro'), home: casa }, comando);
  }
  /* mai un'eccezione da un cancello, qualunque nome scriva il modello */
  for (const comando of ['ls bigl[*', 'ls a(*b', 'ls {x*}', 'ls \\p{*', 'ls ***?***abc?']) assert.doesNotThrow(() => motivoDaChiedere({ tipo: 'shell', comando, cartella: join(casa, 'lavoro'), home: casa }), comando);
  /* AL CONTRARIO */
  for (const comando of ['npm run build', 'node scripts/biglietto.mjs', 'cat biglietti.txt', 'node scripts/avvia-talos.mjs', 'ls *.mjs']) {
    assert.equal(credenzialeDellaCasaLetta({ tipo: 'shell', comando, cartella: join(casa, 'lavoro'), home: casa }), null, comando);
  }
});

/*
 * N7 della seconda revisione (S4): gli asterischi corti passavano. `bi*` ha due lettere e la regola ne voleva tre; `~/.talos-b*` e `~/.t*` nominano la cartella delle
 *   chiavi senza scriverla. Ora conta ogni nome con un asterisco e almeno una lettera sua che può voler dire il comando, e ogni cartella nascosta con un asterisco che può
 *   voler dire `.talos-biglietti`. ⛔ Resta fuori, detto: un nome costruito pezzo per pezzo dentro un programma (`'/.talos-'+'biglietti'`). È attrito, non un confine.
 */
test('GR-19 (N7) le forme corte con gli asterischi chiedono (in Accesso pieno solo sulla cartella, 155); i nomi che non c entrano no', async () => {
  const { motivoDaChiedere, credenzialeDellaCasaLetta } = await import('../src/path-policy.mjs');
  const casa = process.platform === 'win32' ? 'C:\\Users\\finta' : '/home/finta';
  const argomenti = (comando) => ({ tipo: 'shell', comando, cartella: join(casa, 'lavoro'), home: casa });
  for (const comando of ['cat ~/.talos-b*/*', 'cat ~/.talos-bigl?etti/4174.*', 'cat ~/.t*/4174.c*', 'ls -a ~ && head -c 99 ~/.talos-b*/4174*', 'cat ~/.*/4174.chi*',
    'node harness-ui/scripts/b*.mjs --apri', 'node harness-ui/scripts/bi*.mjs', 'cp harness-ui/scripts/biglietto-tal*.mjs x.mjs && node x.mjs --apri', 'tar cf x.tar ~/.talos-b*', 'cp -r ~/.t* /tmp/x']) {
    assert.ok(motivoDaChiedere(argomenti(comando)), `modo ristretto: ${comando}`);
    inAccessoPieno(credenzialeDellaCasaLetta, argomenti(comando), comando);
  }
  /* AL CONTRARIO: asterischi che non possono voler dire né il comando né la cartella delle chiavi */
  for (const comando of ['ls *.mjs', 'node scripts/test*.mjs', 'ls src/*.c*', 'cat ~/.cache/*', 'ls tests/*', 'node scripts/a*.mjs', 'rm -rf dist/*', 'ls ~/.npm*/x', 'cat src/*/index.js']) {
    assert.equal(credenzialeDellaCasaLetta(argomenti(comando)), null, comando);
  }
  /* N11 della terza revisione (S4): le altre forme della shell, quadre, graffe e barra inversa davanti a una lettera, chiedono anche loro */
  for (const comando of ['node harness-ui/scripts/[b]iglietto-talos.mjs --apri', 'node harness-ui/scripts/biglietto-talo[s].mjs', 'node harness-ui/scripts/{b,}iglietto-talos.mjs',
    'node harness-ui/scripts/bigliett\\o-talos.mjs --apri', 'cat ~/.talos-bigliett[i]/4174.chiav[e]', 'cat ~/.talos-{biglietti,x}/4174.chiave', 'cat ~/.talos-bigliett\\i/4174.chiave']) {
    assert.ok(motivoDaChiedere(argomenti(comando)), `modo ristretto: ${comando}`);
    inAccessoPieno(credenzialeDellaCasaLetta, argomenti(comando), comando);
  }
  /* AL CONTRARIO: quadre, graffe e barre inverse che non c'entrano */
  for (const comando of ['ls src/[a-c]*.js', 'cp {a,b}.txt dist/', 'node C:\\Users\\nino\\lavoro\\scripts\\build.mjs', 'echo [ok]', 'ls test\\unit']) {
    assert.equal(credenzialeDellaCasaLetta(argomenti(comando)), null, comando);
  }
});

/*
 * N11 della quarta revisione (S4): la guardia era una lista di nomi e la shell li riscrive dopo. Ogni forma qui sotto stampa un biglietto o legge la chiave in bash; prima
 *   della cura nove su dodici della sonda passavano senza carta. Ora il comando si legge parola per parola come la shell (`paroleDellaShell`): apici e barre tolti, `$'..'`
 *   decodificato, ogni sostituzione che il testo non dice (`$X`, `${..}`, `$(..)`, `{a..b}`) diventa un jolly, le classi `[..]` restano classi; poi la parola si confronta
 *   coi nomi come un glob. Nel dubbio si chiede. ⛔ Resta fuori, detto nel codice: una parola fatta SOLO di sostituzioni (`node "$S"`, `$(cat nome)`), `eval`, e un nome
 *   costruito dentro un programma. È attrito, non un confine (`src/gettone.mjs`).
 */
test('GR-20 (N11) ogni forma della shell che arriva al comando dei biglietti o alla chiave chiede (in Accesso pieno solo sulla cartella, 155); i comandi normali no', async (t) => {
  const { motivoDaChiedere, credenzialeDellaCasaLetta } = await import('../src/path-policy.mjs');
  const casa = process.platform === 'win32' ? 'C:\\Users\\finta' : '/home/finta';
  const argomenti = (comando) => ({ tipo: 'shell', comando, cartella: join(casa, 'lavoro'), home: casa });
  const forme = [
    'node harness-ui/scripts/[a-c]iglietto-talos.mjs --apri',
    'node harness-ui/scripts/[!x]iglietto-talos.mjs --apri',
    'node harness-ui/scripts/[^x]iglietto-talos.mjs --apri',
    'node harness-ui/scripts/[[:alpha:]]iglietto-talos.mjs --apri',
    'node harness-ui/scripts/{b,c}{i,}glietto-talos.mjs',
    'node harness-ui/scripts/{b..b}iglietto-talos.mjs',
    "node harness-ui/scripts/b$'\\x69'glietto-talos.mjs",
    'node harness-ui/scripts/b${X:-i}glietto-talos.mjs',
    'node harness-ui/scripts/bigli""etto-talos.mjs',
    'cat ~/.talos-bigliett[h-j]/4174.chiav[d-f]',
    'cat ~/.talos-{biglietti,}/4174.chiav{e,}',
    'f=igliett; node harness-ui/scripts/b${f}o-talos.mjs',
    /* le stesse classi sulla chiave da sola e nella lettura di PowerShell, dove `\` separa le cartelle e `[a-z]` è un glob anche lì */
    'cat 4174.chiav[a-z]',
    'Get-Content $HOME\\.talos-bigliett[h-j]\\4174.key',
    'node harness-ui/scripts/bigli{e..e}tto-talos.mjs',
    'node harness-ui/scripts/biglie$(printf t)to-talos.mjs',
    /* senza `.mjs` (un lanciatore con lo stesso nome), e in PowerShell dove `?` prende anche il punto iniziale */
    'npx biglietto-tal[o]s --apri',
    'Get-Content ~\\?t?los*\\4174.key',
    /* solo classi, e graffe oltre il tetto delle 64 forme */
    'node scripts/[b][i]*.mjs',
    /* apici e barra insieme: solo la lettura di sh li toglie tutti e due */
    'node harness-ui/scripts/bigli""ett\\o-talos.mjs',
    'node harness-ui/scripts/{h,g,f,e,d,c,a,b}{h,g,f,e,d,c,a,b}{x,y,i}glietto-talos.mjs',
    /* il codice annidato che la shell esegue: sostituzioni, apici inversi, `bash -c` */
    'echo $(cat ~/.talos-bigliett[h-j]/4174.key)',
    'x=`cat ~/.talos-bigliett[h-j]/4174.key`',
    "bash -c 'node [b]iglietto-talos.mjs --apri'",
    'cat "$(echo ~/.talos-bigliett?/4174.key)"',
  ];
  for (const comando of forme) {
    await t.test(`chiede: ${comando}`, () => {
      assert.ok(motivoDaChiedere(argomenti(comando)), `modo ristretto: ${comando}`);
      inAccessoPieno(credenzialeDellaCasaLetta, argomenti(comando), comando);
    });
  }
  /* AL CONTRARIO: graffe, classi, variabili e sequenze di tutti i giorni non nominano né il comando né la chiave (il tetto delle interruzioni) */
  const normali = ['node scripts/${NAME}.mjs', 'echo $HOME && ls', 'ls src/[a-c]*.js', 'cp src/app.js{,.bak}', 'mkdir -p build/{a,b}/c', 'for i in {1..5}; do echo $i; done',
    "printf $'a\\tb\\n'", 'ls src/*.c*', 'cat ~/.config/*.json', 'node --test tests/*.test.mjs', 'git log --format=%H -n 3', 'node scripts/[a-c]*.mjs --x', 'ls ~/*',
    'ls src/*tti*', 'ls docs/chiav*', 'ls *.mjs', 'cat ~/[!.]*/x.txt', 'node scripts/[!a][!b]*.mjs --x', 'ls -d .*', 'echo "$(date +%s)"', "bash -c 'npm test'"];
  for (const comando of normali) {
    await t.test(`libero: ${comando}`, () => {
      assert.equal(credenzialeDellaCasaLetta(argomenti(comando)), null, comando);
    });
  }
  /* mai un'eccezione da un cancello */
  for (const comando of ['ls [', 'ls {a..', "ls $'\\x", 'ls ${', 'ls [[:nope:]]x', `ls ${'{a,b}'.repeat(40)}`, 'ls \\']) {
    assert.doesNotThrow(() => motivoDaChiedere(argomenti(comando)), comando);
    assert.doesNotThrow(() => credenzialeDellaCasaLetta(argomenti(comando)), comando);
  }
});

/*
 * I buchi della quinta revisione (`REVISIONE-CURE-N11-G1-2026-11-03.md`; fonti in `FONTI-BUCHI-GUARDIA-2026-11-04.md`).
 *   F1: dentro `bash -c "…"` la shell interna toglie gli apici vuoti (`bigl''ietto`): ogni testo annidato si rilegge con tutte le letture, anche quella senza apici
 *       (Hermes `tools/approval_detection.py:536-538` e `:993-1020`). F2: `%x%` e `!x!` di cmd sono sostituzioni come `${x}`: diventano un jolly.
 *   S3: la sequenza `{x..y}` si scrive per intero anche nel controllo dei segreti (`.en{v..v}` è `.env`), come fa mvdan/sh `expand/braces.go:134-200`.
 *   ⛔ Resta fuori, detto nel codice: la somma di stringhe di PowerShell (`("bigl"+"ietto…")`), come resta fuori a Codex (`powershell_parser.ps1:118-150`).
 */
test('GR-21 (F1, F2, S3) apici vuoti nel codice annidato, variabili di cmd e sequenze nelle graffe chiedono; i comandi normali no', async (t) => {
  const { motivoDaChiedere, credenzialeDellaCasaLetta, nominaUnSegreto } = await import('../src/path-policy.mjs');
  const casa = process.platform === 'win32' ? 'C:\\Users\\finta' : '/home/finta';
  const lavoro = join(casa, 'lavoro');
  const argomenti = (comando, altro = {}) => ({ tipo: 'shell', comando, cartella: lavoro, home: casa, ...altro });
  const biglietti = [
    /* F1, i casi esatti della revisione e i loro fratelli */
    `bash -c "node bigl''ietto-talos.mjs"`,
    `bash -c 'node bigl""ietto-talos.mjs'`,
    'bash -c "node bigl\\"\\"ietto-talos.mjs --apri"',
    `sh -c 'cat ~/.talos-bigl""ietti/4174.chiave'`,
    `echo $(node bigl''ietto-talos.mjs)`,
    `bash -c "bash -c 'node bigl\\"\\"ietto-talos.mjs'"`,
    /* chi rilegge il testo senza essere fra gli interpreti che si aprono (eval, ssh, watch): la lettura senza apici lo prende lo stesso */
    `eval "node bigl''ietto-talos.mjs"`,
    `ssh localhost "node bigl''ietto-talos.mjs"`,
    `watch "node bigl''ietto-talos.mjs"`,
    /* F2 */
    'cmd /c "set x=bigli&& node %x%etto-talos.mjs"',
    'cmd /v /c "set x=bigli&& node !x!etto-talos.mjs"',
    'node %X%iglietto-talos.mjs',
    'type %USERPROFILE%\\.talos-bigl%y%etti\\4174.chiave',
    'node harness-ui\\scripts\\bigl%x:~0,2%etto-talos.mjs',
    'node "bigl%x%etto-talos.mjs"',
    /* oltre i tetti della rilettura annidata si chiede per prudenza */
    'bash -c '.repeat(20) + 'ls',
    'echo ' + '$('.repeat(6) + 'ls' + ')'.repeat(6),
    'bash -c ls; '.repeat(20),
    'echo ' + '$(ls) '.repeat(40),
  ];
  for (const comando of biglietti) {
    await t.test(`chiede: ${comando.slice(0, 80)}`, () => {
      assert.ok(motivoDaChiedere(argomenti(comando)), `modo ristretto: ${comando}`);
      inAccessoPieno(credenzialeDellaCasaLetta, argomenti(comando), comando);
    });
  }
  /* S3: la sequenza nomina lo stesso segreto della forma scritta, e risponde come lei anche in Accesso pieno */
  for (const [comando, scritto] of [['cat .en{v..v}', '.env'], ['cat .e{m..o}v', '.env'], ['cat cert.p{e..e}m', 'cert.pem'], ['cat ~/.ss{h..h}/id_rs{a..a}', '~/.ssh/id_rsa'],
    ['cat .en{v..v}.local', '.env.local'], ['cat .e{n..n..2}v', '.env'], ['cat id_rs{a..c}', 'id_rsa'], ['cat .e{a..z..13}v', '.env']]) {
    await t.test(`segreto: ${comando}`, () => {
      const r = motivoDaChiedere(argomenti(comando));
      assert.ok(r, comando);
      assert.equal(r.classe, 'segreto', comando);
      assert.equal(r.percorso.replace(/\\/gu, '/'), scritto, `${comando}: si nomina il file che la shell leggerebbe`);
      const pieno = motivoDaChiedere(argomenti(comando, { accessoPieno: true }));
      const letterale = motivoDaChiedere(argomenti(`cat ${scritto}`, { accessoPieno: true }));
      assert.equal(Boolean(pieno), Boolean(letterale), `${comando}: in Accesso pieno come \`cat ${scritto}\``);
    });
  }
  /* F2 sul disco: `.e%e%v` è un glob con un jolly in mezzo, e nella cartella c'è `.env` */
  const elenca = (cartella) => (String(cartella).replace(/\\/gu, '/') === lavoro.replace(/\\/gu, '/') ? { nomi: ['.env', 'README.md', 'src'] } : { errore: 'ENOENT' });
  const r = motivoDaChiedere(argomenti('cmd /c "set e=n&& type .e%e%v"', { elenca }));
  assert.ok(r, 'cmd /c "set e=n&& type .e%e%v"');
  assert.equal(r.classe, 'segreto');
  assert.equal(motivoDaChiedere(argomenti('type .e%e%v', { elenca }))?.classe, 'segreto', 'anche senza `cmd /c` davanti');
  assert.equal(motivoDaChiedere(argomenti('type ".e%e%v"', { elenca }))?.classe, 'segreto', 'anche fra doppi apici, dove cmd sostituisce lo stesso');
  assert.ok(nominaUnSegreto('bash -c ls; '.repeat(20) + 'cat x', { home: casa, cartella: lavoro, espandi: true, elenca }), 'il controllo dei segreti chiede anche lui oltre il tetto degli interpreti');
  assert.equal(motivoDaChiedere(argomenti('cmd /c "type %NOME%.md"', { elenca: () => ({ nomi: ['README.md'] }) })), null, 'un jolly che prende solo nomi qualunque non chiede');
  /* AL CONTRARIO: il tetto delle interruzioni, zero carte sui comandi di tutti i giorni */
  const normali = ['npm test', 'git status', 'ls src/*.mjs', 'node --test tests/*.test.mjs', 'grep -rn TODO src | head -20', 'cp app.js{,.bak}', 'mkdir -p build/{css,js}',
    'for f in src/*.js; do wc -l "$f"; done', 'node scripts/${TASK:-build}.mjs', 'ls [A-Z]*.md && cat README.md',
    'cmd /c "set NODE_ENV=production&& npm run build"', 'echo %PATH%', 'dir %USERPROFILE%\\Documents', 'git log --format=%H%n%s -n 3', 'printf "%s%s\\n" a b',
    'for /l %i in (1,1,5) do echo %i', 'bash -c "npm test"', `python -c "print('%s-%s' % (1,2))"`, 'cat .env.example', 'echo {1..10}', 'cat file{1..3}.txt',
    'date +%Y%m%d', 'cmd /v /c "set x=1&& echo !x!"', 'ffmpeg -i frame%04d.png out.mp4', 'curl https://example.com/a%20b', 'ls {a..z}*.txt',
    `bash -c 'for i in {1..3}; do echo "$i"; done'`, 'node -e "console.log(1+2)"', 'git commit -m "fix: 50% faster"', 'powershell -c "Get-ChildItem *.mjs"',
    'mkdir {a..z}{a..z}', `bash -c "echo ''"`, 'echo "" && ls', `sh -c 'git log --format=""'`,
    /* blocco dopo (S3 della revisione di Performance su 62b70c142): cinque interpreti innocui in fila erano una carta, perché il testo annidato era tutto il resto della riga */
    ...[[(i) => `bash -c "echo ${i}"`, ' && '], [(i) => `pwsh -c "echo ${i}"`, ' && '], [(i) => `cmd /c "echo ${i}"`, ' && '], [(i) => `bash -c "echo ${i}"`, '; '],
      [(i) => `pwsh -c "echo ${i}"`, '; '], [(i) => `cmd /c "echo ${i}"`, ' & '], [(i) => `sh -c 'npm run t${i}'`, ' || '],
      [(i) => `powershell -NoProfile -Command "Write-Output ${i}"`, ' && ']].map(([f, sep]) => Array.from({ length: 5 }, (_, i) => f(i)).join(sep))];
  for (const comando of normali) {
    await t.test(`libero: ${comando}`, () => {
      assert.equal(motivoDaChiedere(argomenti(comando, { elenca: () => ({ nomi: [] }) })), null, `modo ristretto: ${comando}`);
      assert.equal(credenzialeDellaCasaLetta(argomenti(comando)), null, `Accesso pieno: ${comando}`);
    });
  }
  /* ⛔ il limite detto: la somma di stringhe di PowerShell non si ricompone (se un giorno chiede, questa riga va cambiata insieme al commento nel codice) */
  assert.equal(credenzialeDellaCasaLetta(argomenti('node ("bigl"+"ietto-talos.mjs")')), null, 'F3 dichiarato, non curato');
  /* mai un'eccezione da un cancello, nemmeno sui testi patologici */
  for (const comando of ['bash -c '.repeat(5000) + 'ls', '$('.repeat(2000) + ')'.repeat(2000), 'ls ' + '{a..z}'.repeat(500), 'echo ' + '%x%'.repeat(5000),
    'echo ' + '!x!'.repeat(5000), 'echo ' + "''".repeat(20000), 'ls {a..', 'ls {1..2..', 'ls {-9999999999..9999999999}', 'echo %', 'echo !', 'echo %%%']) {
    assert.doesNotThrow(() => motivoDaChiedere(argomenti(comando, { elenca: () => ({ nomi: [] }) })), comando.slice(0, 40));
    assert.doesNotThrow(() => credenzialeDellaCasaLetta(argomenti(comando)), comando.slice(0, 40));
  }
});

/*
 * Il blocco dopo (`BRIEF-GUARDIA-BLOCCO-DOPO-2026-11-04.md`, fonti `FONTI-GUARDIA-BLOCCO-DOPO-2026-11-04.md`), punti 2, 3 e 4.
 *   La carta del comando dei biglietti diceva «un file che può contenere chiavi o password (biglietto-talos)»: un nome tecnico a schermo, e non il perché. Ora dice
 *   che cosa il comando può fare. Un tetto della guardia diceva la stessa frase: ora dice che il comando è troppo complesso da controllare. Il nome corto 8.3 di
 *   Windows (`BIGLIE~1.MJS`) passava: ora chiede, dalla forma, senza leggere il disco; i nomi corti di tutti i giorni restano liberi.
 */
test('GR-22 la carta dei biglietti dice che cosa fa il comando, un tetto dice che è troppo complesso; i nomi corti 8.3 chiedono, quelli di tutti i giorni no', async (t) => {
  const { motivoDaChiedere, credenzialeDellaCasaLetta, chiaveDelConsensoDi } = await import('../src/path-policy.mjs');
  const { default: dizionario } = await import('../frontend/src/i18n/testi/server.js');
  const casa = process.platform === 'win32' ? 'C:\\Users\\finta' : '/home/finta';
  const argomenti = (comando, altro = {}) => ({ tipo: 'shell', comando, cartella: join(casa, 'lavoro'), home: casa, ...altro });
  const nessunNomeTecnico = (frase, dove) => assert.doesNotMatch(String(frase), /biglietto-talos|talos-biglietti|\.chiave|\.mjs/iu, `${dove}: un nome tecnico a schermo`);
  /* le due voci nuove ci sono nelle due lingue, senza nomi tecnici */
  for (const chiave of ['approval.command.signInLink', 'approval.command.tooComplex']) {
    for (const lingua of ['en', 'it']) {
      assert.equal(typeof dizionario[lingua][chiave], 'string', `${lingua}: ${chiave}`);
      nessunNomeTecnico(dizionario[lingua][chiave], `${lingua}: ${chiave}`);
    }
  }
  for (const comando of ['node harness-ui/scripts/biglietto-talos.mjs --apri', 'cat ~/.talos-biglietti/4174.chiave', 'node harness-ui/scripts/[b]iglietto-talos.mjs']) {
    await t.test(`biglietti: ${comando}`, () => {
      /* 155: in Accesso pieno la carta resta solo per chi legge la cartella delle chiavi */
      if (!LEGGONO_LA_CARTELLA.has(comando)) assert.equal(credenzialeDellaCasaLetta(argomenti(comando)), null, `Accesso pieno (155): ${comando}`);
      for (const [dove, r] of [['modo ristretto', motivoDaChiedere(argomenti(comando))], ...(LEGGONO_LA_CARTELLA.has(comando) ? [['Accesso pieno', credenzialeDellaCasaLetta(argomenti(comando))]] : [])]) {
        assert.equal(r?.fraseChiave, 'server.approval.command.signInLink', `${dove}: ${comando}`);
        nessunNomeTecnico(r.frase, `${dove}: ${comando}`);
        /* decisione 107 (03/11): la chiave del consenso «per la sessione» porta il motivo, e non è quella dei tetti; S2 della PR 20: e l'impronta del comando */
        assert.match(String(chiaveDelConsensoDi(r, 'shell', comando)), /^lettura:biglietti:sha256:[0-9a-f]{64}$/u, `${dove}: ${comando}`);
      }
    });
  }
  /* i tetti della rilettura annidata: la carta dice che il comando è troppo complesso, nei due modi */
  for (const comando of ['bash -c '.repeat(20) + 'ls', 'echo ' + '$('.repeat(6) + 'ls' + ')'.repeat(6), 'bash -c ls; '.repeat(20), 'echo ' + '$(ls) '.repeat(40)]) {
    await t.test(`troppo complesso: ${comando.slice(0, 60)}`, () => {
      /* 155: in Accesso pieno un tetto non è una carta */
      assert.equal(credenzialeDellaCasaLetta(argomenti(comando)), null, `Accesso pieno (155): ${comando.slice(0, 60)}`);
      for (const [dove, r] of [['modo ristretto', motivoDaChiedere(argomenti(comando))]]) {
        assert.equal(r?.fraseChiave, 'server.approval.command.tooComplex', `${dove}: ${comando.slice(0, 60)}`);
        nessunNomeTecnico(r.frase, dove);
        /* S2 (Performance): la chiave di un tetto porta l'impronta del comando intero */
        assert.match(String(chiaveDelConsensoDi(r, 'shell', comando)), /^lettura:troppo-complesso:sha256:[0-9a-f]{64}$/u, `${dove}: la chiave del consenso dice il motivo e l'impronta del comando`);
      }
    });
  }
  /* il tetto delle forme nel controllo dei segreti (128 forme di `.env` e `.emv`, oltre le 64): la stessa frase */
  for (const comando of ['cat {a,b}{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}.e{n,m}v', 'cat id_{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}sa']) {
    const forme = motivoDaChiedere(argomenti(comando, { elenca: () => ({ nomi: [] }) }));
    assert.equal(forme?.fraseChiave, 'server.approval.command.tooComplex', `oltre il tetto delle forme: ${comando}`);
    assert.equal(forme.perche, 'troppo-complesso', comando);
  }
  /* ogni uscita da un tetto del controllo dei segreti porta il perché, e il percorso di prima (la chiave del consenso) */
  const { nominaUnSegreto } = await import('../src/path-policy.mjs');
  const segreti = { home: casa, cartella: join(casa, 'lavoro'), espandi: true, elenca: () => ({ nomi: [] }) };
  for (const [nome, comando, altro] of [['troppi interpreti', 'bash -c ls; '.repeat(20) + 'cat x', {}], ['oltre quattro livelli', 'echo ' + '$('.repeat(6) + 'ls' + ')'.repeat(6), {}],
    ['il lettore delle cartelle lancia', 'cat *.e*v', { elenca: () => { throw new Error('guasto'); } }], ['una cartella illeggibile', 'cat x/.e*v', { elenca: () => ({ errore: 'EACCES' }) }],
    ['il tempo è finito', 'cat */.e*v', { orologio: (() => { let n = 0; return () => (n += 1000); })(), elenca: () => ({ nomi: ['a', 'b'], cartelle: new Set(['a', 'b']) }) }]]) {
    const r = nominaUnSegreto(comando, { ...segreti, ...altro });
    assert.equal(r?.perche, 'troppo-complesso', nome);
    assert.equal(r.classe, 'segreto', nome);
  }
  /* AL CONTRARIO: un segreto vero resta la frase di prima, col suo nome */
  const vero = motivoDaChiedere(argomenti('cat ~/.ssh/id_rsa'));
  assert.equal(vero?.fraseChiave, 'server.approval.command.secret');
  assert.match(vero.frase, /~\/\.ssh\/id_rsa/u);
  /* il nome corto 8.3 di Windows: chiede dalla forma; in Accesso pieno solo il nome corto della cartella delle chiavi (155) */
  for (const comando of ['node harness-ui\\scripts\\BIGLIE~1.MJS', 'node harness-ui/scripts/BIGLIE~1.MJS --apri', 'node scripts\\biglie~2.mjs', 'node scripts\\BI3F2A~1.MJS',
    'type %USERPROFILE%\\TALOS-~1\\4174~1.CHI', 'cat ~/TALOS-~1/4174~1.CHI', 'npx BIGLIE~1 --apri', 'type C:\\Users\\finta\\TALOS-~1\\x.txt', 'type 4174~1.CHI', 'node TA9C1E~1\\4174~1.txt']) {
    await t.test(`nome corto: ${comando}`, () => {
      assert.ok(motivoDaChiedere(argomenti(comando)), `modo ristretto: ${comando}`);
      inAccessoPieno(credenzialeDellaCasaLetta, argomenti(comando), comando);
    });
  }
  /* AL CONTRARIO: i nomi corti e le tilde di tutti i giorni (il tetto delle interruzioni) */
  for (const comando of ['git diff HEAD~1', 'git reset --soft HEAD~3', 'git log main~2..main', '"C:\\PROGRA~1\\nodejs\\node.exe" --version', 'dir C:\\PROGRA~2',
    'git show @~1:src/app.js', 'type C:\\Users\\finta\\DOCUME~1\\note.txt', 'node C:\\Users\\RUNNER~1\\AppData\\Local\\Temp\\x.mjs', 'git rebase HEAD~12', 'cd ~ && ls',
    /* un nome corto che comincia come il comando ma con un'altra estensione, e la forma col riassunto di un altro nome */
    'type BIGLIE~1.TXT', 'type C:\\Users\\finta\\AB12CD~1\\note.txt',
    /* forme che un nome corto vero non ha: una lettera sola prima della tilde, una tilde senza numero */
    'node B~1.MJS', 'cp BIGLIE~.MJS x']) {
    await t.test(`libero: ${comando}`, () => {
      assert.equal(credenzialeDellaCasaLetta(argomenti(comando)), null, comando);
    });
  }
});

test('GR-05 (R5) le cartelle vere si riconoscono senza fidarsi dell ambiente: casa di sistema, percorso vero, forme UNC, telefono', async (t) => {
  const { cartellaVera } = await import('../src/gettone.mjs');
  /* solo a parole o su una casa finta in TEMP: nessuna prova tocca la casa vera */
  const finta = cartellaDiProva('talos-gs-vera-');
  const casa = join(finta, 'Users', 'nino');
  const roaming = join(casa, 'AppData', 'Roaming');
  const opzioni = { case: [casa] };
  assert.equal(cartellaVera(join(roaming, 'TALOS', 'sessions'), {}, process.platform, opzioni), true, 'senza APPDATA nell ambiente');
  assert.equal(cartellaVera(join(casa, 'AppData', 'Local', 'TALOS-integrazione-r4', 'workflows'), { APPDATA: 'Z:\\finta' }, process.platform, opzioni), true, 'APPDATA finta non inganna');
  assert.equal(cartellaVera(join(casa, 'AppData', 'Local', 'Temp', 'prova'), {}, process.platform, opzioni), false, 'una cartella di prova resta di prova');
  if (process.platform === 'win32') {
    const lungo = join(roaming, 'TALOS', 'sessions');
    assert.equal(cartellaVera(`\\\\?\\${lungo}`, {}, 'win32', opzioni), true, 'la forma \\\\?\\');
    /* e a parole, quando il percorso vero non si può chiedere (un disco che non risponde): la forma va riconosciuta da sola */
    const senzaDisco = { ...opzioni, veroFn: () => { throw new Error('disco assente'); } };
    assert.equal(cartellaVera(`\\\\?\\${lungo}`, {}, 'win32', senzaDisco), true, 'la forma \\\\?\\ a parole');
    assert.equal(cartellaVera(`\\\\?\\UNC\\localhost\\${lungo[0].toLowerCase()}$\\${lungo.slice(3)}`, {}, 'win32', senzaDisco), true, 'la forma \\\\?\\UNC a parole');
    assert.equal(cartellaVera(`\\\\localhost\\${lungo[0].toLowerCase()}$\\${lungo.slice(3)}`, {}, 'win32', opzioni), true, 'la forma amministrativa');
    assert.equal(cartellaVera(`\\\\127.0.0.1\\${lungo[0].toLowerCase()}$\\${lungo.slice(3)}`, {}, 'win32', opzioni), true);
    /* una giunzione verso la cartella vera: la vede il percorso vero */
    mkdirSync(join(roaming, 'TALOS', 'sessions'), { recursive: true });
    const ponte = join(finta, 'ponte');
    symlinkSync(join(roaming, 'TALOS'), ponte, 'junction');
    assert.equal(cartellaVera(join(ponte, 'sessions'), {}, 'win32', opzioni), true, 'una giunzione');
    assert.equal(cartellaVera(join(ponte, 'sessions', 'non-esiste-ancora'), {}, 'win32', opzioni), true, 'anche sotto, se la coda non esiste ancora');
    /* il nome corto si risolve col percorso vero: qui il risolutore è iniettato, una casa finta non ha nomi corti */
    assert.equal(cartellaVera('C:\\Users\\NINO~1\\AppData\\Roaming\\TALOS\\sessions', {}, 'win32', { case: ['C:\\Users\\nino'], veroFn: (p) => p.replace('NINO~1', 'nino') }), true, 'nome corto');
  }
  for (const android of ['/storage/emulated/0/Android/data/ai.talos/files', '/sdcard/Android/data/ai.talos.dev/files', '/data/user/0/ai.talos/files', '/data/data/ai.talos.dev/x']) {
    assert.equal(cartellaVera(android, {}, 'linux', { case: ['/home/nessuno'] }), true, android);
  }
  assert.equal(cartellaVera('/storage/emulated/0/Android/data/altra.app/files', {}, 'linux', { case: ['/home/nessuno'] }), false);
  assert.equal(cartellaVera('/home/nino/.config/TALOS/sessions', {}, 'linux', { case: ['/home/nino'] }), true);
  t.diagnostic('nessun server avviato');
});

/* La cartella delle sole prove sul Pad: `CARTELLA_PAD` in `mobile/scripts/r4-mobile/prove-r4-pad.mjs:25`, passata a `prove-r4-pad.sh:7`. Senza questa eccezione il modo prove lì riceve NO_TOKEN_MODE_REFUSED. */
test('GR-15 le prove sul Pad non sono una cartella vera; tutto il resto dell app sì, anche se ci si arriva passando di lì', async (t) => {
  const { cartellaVera, scegliGettone } = await import('../src/gettone.mjs');
  const fuori = { case: ['/home/nessuno'] };
  for (const prova of ['/data/data/ai.talos.dev/files/kernel-r4-prova', '/data/data/ai.talos.dev/files/kernel-r4-prova/harness-ui/tests',
    '/data/user/0/ai.talos.dev/files/kernel-r4-prova/casa', '/data/user/10/ai.talos.dev/files/kernel-r4-prova/']) {
    assert.equal(cartellaVera(prova, {}, 'linux', fuori), false, prova);
  }
  /* N6 della seconda revisione: solo il pacchetto di prova `ai.talos.dev` (`prove-r4-pad.mjs:24`), e solo nella memoria interna dell'app. Mai sopra `ai.talos` */
  for (const vera of ['/data/data/ai.talos/files/kernel-r4-prova/sessions', '/data/user/10/ai.talos/files/kernel-r4-prova', '/data/data/ai.talos.dev.evil/files/kernel-r4-prova',
    '/storage/emulated/0/Android/data/ai.talos.dev/files/kernel-r4-prova/x', '/sdcard/Android/data/ai.talos.dev/files/kernel-r4-prova/']) {
    assert.equal(cartellaVera(vera, {}, 'linux', fuori), true, vera);
  }
  /* AL CONTRARIO: il resto dell'app, i nomi simili e le strade che passano dalla cartella delle prove */
  for (const vera of ['/data/data/ai.talos.dev/files/codice-r4', '/data/data/ai.talos.dev/files/codice-r4/bin', '/data/data/ai.talos/files', '/data/data/ai.talos.dev/databases', '/data/data/ai.talos.dev/files/sessions',
    '/data/data/ai.talos.dev/files/kernel-r4-prova-falsa', '/data/data/ai.talos.dev/files/kernel-r4-prova.bak/x', '/data/data/ai.talos.dev/files/altro/kernel-r4-prova', '/data/data/ai.talos.dev/kernel-r4-prova',
    '/data/data/ai.talos.dev/files/kernel-r4-prova/../codice-r4', '/data/data/ai.talos.dev/files//kernel-r4-prova', '/data/data/ai.talos.dev/files/KERNEL-R4-PROVA']) {
    assert.equal(cartellaVera(vera, {}, 'linux', fuori), true, vera);
  }
  /* un collegamento dentro la cartella delle prove che porta ai dati veri non la fa diventare di prova */
  const collegato = { case: ['/home/nessuno'], veroFn: (c) => c.replace('/files/kernel-r4-prova/ponte', '/files/codice-r4') };
  assert.equal(cartellaVera('/data/data/ai.talos.dev/files/kernel-r4-prova/ponte/x', {}, 'linux', collegato), true, 'un collegamento');
  assert.equal(cartellaVera('/data/data/ai.talos.dev/files/kernel-r4-prova/ponte/x', {}, 'linux', { case: ['/home/nessuno'], veroFn: (c) => c }), false, 'senza collegamento resta di prova');
  /* un'altra app che ha una cartella con quel nome non cambia niente, e sotto una casa vera la regola resta quella */
  assert.equal(cartellaVera('/data/data/altra.app/files/kernel-r4-prova', {}, 'linux', fuori), false);
  assert.equal(cartellaVera('/home/nino/.config/TALOS/files/kernel-r4-prova', {}, 'linux', { case: ['/home/nino'] }), true);
  /* il motivo del lavoro: il modo prove parte sul Pad, e sul resto dell'app no */
  const argv = ['--senza-gettone=prove'];
  assert.equal(scegliGettone({ argv, cartelle: ['/data/data/ai.talos.dev/files/kernel-r4-prova/casa'], piattaforma: 'linux' }).origine, 'prove');
  assert.throws(() => scegliGettone({ argv, cartelle: ['/data/data/ai.talos.dev/files/codice-r4'], piattaforma: 'linux' }), { code: 'NO_TOKEN_MODE_REFUSED' });
  t.diagnostic('nessun server avviato');
});

/*
 * N2 della seconda revisione (S3): `\\<nome del PC>\c$\…` e `\\?\GLOBALROOT\Device\HarddiskVolumeN\…` raggiungono il disco, ma `cartellaVera` li guardava solo a
 *   parole. Ora si guarda anche l'IDENTITÀ (dispositivo e inode) degli antenati che esistono: se il padre di una cartella «TALOS…» è una cartella dati, la cartella
 *   è vera, comunque sia scritto il percorso.
 */
test('GR-17 (N2) una cartella vera scritta col nome del PC o con GLOBALROOT resta vera: si guarda chi è, non come si scrive', async (t) => {
  const { cartellaVera } = await import('../src/gettone.mjs');
  /* a valori fissi: l'identità la danno le prove */
  const casa = 'C:\\Users\\nino';
  const identita = new Map([['c:\\users\\nino\\appdata\\roaming', 'v1:10'], ['\\\\pc-di-nino\\c$\\users\\nino\\appdata\\roaming', 'v1:10'], ['d:\\altrove', 'v2:20'], ['\\\\pc-di-nino\\c$\\users\\nino\\appdata\\roaming\\altro', 'v1:11']]);
  const statFn = (p) => { const id = identita.get(String(p).toLowerCase().replace(/\\+$/u, '')); if (!id) throw Object.assign(new Error('no'), { code: 'ENOENT' }); const [dev, ino] = id.split(':'); return { dev, ino }; };
  const opz = { case: [casa], veroFn: (c) => { throw Object.assign(new Error('no'), { code: 'ENOENT', c }); }, statFn };
  assert.equal(cartellaVera('\\\\PC-DI-NINO\\c$\\Users\\nino\\AppData\\Roaming\\TALOS\\sessions', {}, 'win32', opz), true, 'il nome del PC');
  assert.equal(cartellaVera('\\\\PC-DI-NINO\\c$\\Users\\nino\\AppData\\Roaming\\TALOS-integrazione-r4', {}, 'win32', opz), true);
  /* AL CONTRARIO */
  assert.equal(cartellaVera('\\\\PC-DI-NINO\\c$\\Users\\nino\\AppData\\Roaming\\altro\\TALOS\\x', {}, 'win32', opz), false, 'TALOS sotto un altra cartella');
  assert.equal(cartellaVera('\\\\PC-DI-NINO\\c$\\Users\\nino\\AppData\\Roaming\\Progetti\\x', {}, 'win32', opz), false, 'non comincia per TALOS');
  assert.equal(cartellaVera('D:\\altrove\\TALOS\\x', {}, 'win32', opz), false, 'una cartella che non è dei dati');
  /* un file system che non dà l'inode (0) non dice chi è: due cartelle con inode 0 sullo stesso disco non sono la stessa */
  const zero = { case: [casa], veroFn: opz.veroFn, statFn: () => ({ dev: 'v9', ino: 0n }) };
  assert.equal(cartellaVera('\\\\server\\condivisa\\TALOS\\x', {}, 'win32', zero), false, 'inode 0');
  /* il sistema risolve la forma SCRITTA (GLOBALROOT) anche quando l'identità non si legge */
  const globalroot = '\\\\?\\GLOBALROOT\\Device\\HarddiskVolume3\\Users\\nino\\AppData\\Roaming\\TALOS\\sessions';
  const soloScritta = { case: [casa], statFn: () => { throw new Error('no'); },
    veroFn: (c) => { if (c === globalroot) return 'C:\\Users\\nino\\AppData\\Roaming\\TALOS\\sessions'; throw Object.assign(new Error('no'), { code: 'ENOENT' }); } };
  assert.equal(cartellaVera(globalroot, {}, 'win32', soloScritta), true, 'GLOBALROOT risolto dal sistema');
  /* sul disco vero, in una casa finta: le due forme della revisione, se questo PC le raggiunge */
  if (process.platform !== 'win32') return t.skip('solo Windows');
  const radice = cartellaDiProva('talos-gs-n2-');
  t.after(() => rimuoviCartellaDiProva(radice));
  const casaFinta = join(radice, 'casa');
  mkdirSync(join(casaFinta, 'AppData', 'Roaming', 'TALOS', 'sessions'), { recursive: true });
  const senzaDisco = casaFinta.replace(/^[A-Za-z]:/u, '');
  const disco = casaFinta[0].toLowerCase();
  const { hostname } = await import('node:os');
  const { existsSync } = await import('node:fs');
  const forme = [`\\\\${hostname()}\\${disco}$${senzaDisco}\\AppData\\Roaming\\TALOS\\sessions`];
  for (let n = 1; n <= 16; n += 1) forme.push(`\\\\?\\GLOBALROOT\\Device\\HarddiskVolume${n}${senzaDisco}\\AppData\\Roaming\\TALOS\\sessions`);
  /* N10 della terza revisione (S3): il flusso NTFS sul nome TALOS raggiunge la cartella ma ne cambia il nome scritto; anche col disco locale */
  for (const base of [`\\\\${hostname()}\\${disco}$${senzaDisco}`, casaFinta]) {
    forme.push(`${base}\\AppData\\Roaming\\TALOS::$INDEX_ALLOCATION\\sessions`, `${base}\\AppData\\Roaming\\TALOS:$I30:$INDEX_ALLOCATION\\sessions`, `${base}\\AppData\\Roaming\\TALOS::$INDEX_ALLOCATION`);
  }
  const raggiunte = forme.filter((f) => existsSync(f));
  t.diagnostic(`forme raggiunte: ${raggiunte.length}`);
  assert.ok(raggiunte.some((f) => f.includes('::$INDEX_ALLOCATION') && f.startsWith('\\\\') && !f.startsWith('\\\\?')), 'la forma della revisione si raggiunge davvero su questo PC');
  for (const forma of raggiunte) assert.equal(cartellaVera(forma, {}, 'win32', { case: [casaFinta] }), true, forma);
  /* AL CONTRARIO: una cartella che ESISTE nei dati ma non si chiama TALOS, raggiunta nelle stesse forme (flusso NTFS compreso), non è vera */
  mkdirSync(join(casaFinta, 'AppData', 'Roaming', 'Lavoro', 'sessions'), { recursive: true });
  for (const forma of raggiunte) {
    const altra = forma.replace('\\Roaming\\TALOS', '\\Roaming\\Lavoro');
    assert.notEqual(altra, forma);
    assert.equal(cartellaVera(altra, {}, 'win32', { case: [casaFinta] }), false, altra);
  }
});

/* N3 della seconda revisione (S3): sul telefono le cartelle si riconoscevano solo scritte nella forma pulita. Ora anche normalizzate e col percorso vero, e coi nomi che puntano allo stesso posto. */
test('GR-18 (N3) le cartelle del telefono si riconoscono in ogni forma: barre doppie, punti, risalite, user_de, mnt/expand, storage/self, mnt/user', async () => {
  const { cartellaVera } = await import('../src/gettone.mjs');
  const telefono = { case: ['/data/data/com.termux/files/home'], veroFn: (c) => c };
  for (const vera of ['//data/data/ai.talos/files/codice-r4', '/data//data/ai.talos/files/codice-r4', '/data/data/./ai.talos/files/codice-r4', '/data/x/../data/ai.talos/files/codice-r4',
    '/data/user_de/0/ai.talos/files', '/mnt/expand/1234-abcd/user/0/ai.talos/files', '/mnt/expand/1234-abcd/user_de/0/ai.talos/files', '/storage/self/primary/Android/data/ai.talos/files',
    '/mnt/user/0/emulated/0/Android/data/ai.talos/files', '/mnt/sdcard/Android/data/ai.talos/files', '/data/data/ai.talos/files/codice-r4']) {
    assert.equal(cartellaVera(vera, {}, 'linux', telefono), true, vera);
  }
  /* una cartella che non esiste ancora (il sistema non la risolve): la forma normalizzata basta */
  const nessunDisco = { case: ['/home/nessuno'], veroFn: () => { throw Object.assign(new Error('no'), { code: 'ENOENT' }); } };
  for (const nuova of ['//data/data/ai.talos/files/nuova', '/data/data/./ai.talos/files/nuova', '/data/x/../data/ai.talos/files/nuova']) assert.equal(cartellaVera(nuova, {}, 'linux', nessunDisco), true, nuova);
  /* un collegamento fuori dall'app che porta nei suoi dati */
  assert.equal(cartellaVera('/data/data/com.termux/files/home/ponte/x', {}, 'linux', { case: ['/home/nessuno'], veroFn: (c) => c.replace('/data/data/com.termux/files/home/ponte', '/data/data/ai.talos/files') }), true, 'collegamento');
  /* AL CONTRARIO */
  for (const altra of ['/data/data/ai.talosx/files', '/data/user_de/0/altra.app/files', '/storage/self/primary/Android/data/altra.app/files', '/mnt/expand/x/user/0/com.termux/files', '/data/data/com.termux/files/home/talos']) {
    assert.equal(cartellaVera(altra, {}, 'linux', telefono), false, altra);
  }
});

test('GR-07 (R7) il cookie del biglietto non è il gettone: il gettone non finisce nel profilo del browser; muore comunque col gettone', async (t) => {
  const gettone = randomBytes(32).toString('hex');
  const { registro } = registroContato();
  const base = await ascolta(t, { token: gettone, sessionRegistry: registro });
  const { valore, intestazione } = await entra(base, bigliettoDi(gettone));
  assert.notEqual(valore, gettone);
  assert.ok(!valore.includes(gettone));
  assert.equal((await fetch(`${base}/api/v1/sessions`, { headers: { cookie: intestazione } })).status !== 401, true, 'il valore derivato apre');
  assert.notEqual((await fetch(`${base}/api/v1/sessions`, { headers: { cookie: `talos_token=${gettone}` } })).status, 401, 'il gettone resta valido: telefono, CLI e app installata lo mandano così');
  /* un altro server ha un altro gettone: il valore non vale lì */
  const altra = await ascolta(t, { token: randomBytes(32).toString('hex'), sessionRegistry: registro });
  assert.equal((await fetch(`${altra}/api/v1/sessions`, { headers: { cookie: intestazione } })).status, 401);
});

test('GR-08 (R8) un browser senza cookie che apre la pagina legge cosa fare, in due lingue; le prove e i programmi vedono la pagina di sempre', async (t) => {
  const gettone = randomBytes(32).toString('hex');
  const { registro } = registroContato();
  const base = await ascolta(t, { token: gettone, sessionRegistry: registro, staticHandler: async () => ({ statusCode: 200, contentType: 'text/html', body: Buffer.from('<!doctype html><html><head></head><body>APP</body></html>') }) });
  const it = await fetch(`${base}/`, { headers: { accept: 'text/html,*/*;q=0.8', 'accept-language': 'it-IT' } });
  assert.equal(it.status, 401);
  assert.match(await it.text(), /nuovo link/u);
  const en = await fetch(`${base}/index.html`, { headers: { accept: 'text/html', 'accept-language': 'en-US' } });
  assert.equal(en.status, 401);
  assert.match(await en.text(), /new link/u);
  const dentro = await fetch(`${base}/`, { headers: { accept: 'text/html', cookie: `talos_token=${gettone}` } });
  assert.match(await dentro.text(), /APP/u, 'col cookie la pagina vera');
  assert.match(await (await fetch(`${base}/`)).text(), /APP/u, 'senza Accept html la pagina resta servibile (forma §3.2)');
});

test('GR-09 (R9) biglietto già usato con un cookie buono: si entra, niente pagina d errore, niente speso', async (t) => {
  const gettone = randomBytes(32).toString('hex');
  const { registro } = registroContato();
  const base = await ascolta(t, { token: gettone, sessionRegistry: registro });
  const biglietto = bigliettoDi(gettone);
  const { intestazione } = await entra(base, biglietto);
  const ripristinata = await fetch(`${base}/?${CAMPO_BIGLIETTO}=${encodeURIComponent(biglietto)}`, { redirect: 'manual', headers: { accept: 'text/html', cookie: intestazione } });
  assert.equal(ripristinata.status, 302);
  assert.equal(ripristinata.headers.get('location'), '/');
  assert.equal(ripristinata.headers.get('set-cookie'), null, 'il cookie c è già');
  /* AL CONTRARIO: senza cookie resta 401 */
  assert.equal((await fetch(`${base}/?${CAMPO_BIGLIETTO}=${encodeURIComponent(biglietto)}`, { redirect: 'manual' })).status, 401);
});

test('GR-12 (R12) un orologio che torna indietro non ridà vita a un biglietto speso', async () => {
  const { creaCassaDeiBiglietti, chiaveDeiBiglietti, creaBiglietto } = await import('../src/gettone.mjs');
  const gettone = 'g'.repeat(64);
  let ora = 1_800_000_000_000;
  const cassa = creaCassaDeiBiglietti({ gettone, adesso: () => ora });
  const b = creaBiglietto(chiaveDeiBiglietti(gettone), { adesso: ora });
  assert.equal(cassa.consuma(b), true);
  ora += 120_000;
  cassa.consuma(creaBiglietto(chiaveDeiBiglietti(gettone), { adesso: ora })); // un altra spesa: prima qui si ripuliva l elenco
  ora -= 120_000;
  assert.equal(cassa.consuma(b), false);
});
