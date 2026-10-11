/*
 * ⭐ 02/10/2026 — PASSO 4 DELL'AGGIORNAMENTO AUTOMATICO: LA PROVA VERA, nel job `desktop-installer` del CI (mai sulla macchina di
 *   una persona: installa e disinstalla TALOS, e un TALOS già installato con lo stesso appId verrebbe aggiornato).
 *
 * Owner, 02/10/2026, «File solo nella build di prova». La prova:
 *   1. una chiave Ed25519 DI PROVA (e una seconda, «sbagliata»), generate qui e buttate alla fine;
 *   2. due build di prova, 0.0.1 e 0.0.2, che portano nelle risorse `aggiornamenti-prova.json` (server locale + chiave di prova);
 *   3. un server su 127.0.0.1 che risponde come GitHub: l'elenco delle release e la cartella di download di `desktop-v0.0.2`;
 *   4. si installa 0.0.1 e si avvia: col manifesto firmato dalla chiave SBAGLIATA l'app dice «firma non valida» e NON scarica
 *      l'installer; alla chiusura resta 0.0.1;
 *   5. col manifesto giusto l'app scarica, dice «pronto», e alla chiusura si installa da sola: al riavvio è 0.0.2;
 *   6. si disinstalla e si scrive il rapporto (`.prove/R05-aggiornamento-vero.json`).
 */
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cartellaScratch } from '../../src/scratch.mjs';
import { NOME_FIRMA, NOME_MANIFESTO, firmaManifesto, leggiManifesto } from '../firma-aggiornamenti.mjs';
import { validaFonteDiProva } from '../fonte-aggiornamenti.mjs';

const desktop = dirname(dirname(fileURLToPath(import.meta.url)));
export const VERSIONE_X = '0.0.1';
export const VERSIONE_X1 = '0.0.2';
/** 11/10/2026: la terza build, per «Riavvia ora» (installer visibile che riapre TALOS da solo). */
export const VERSIONE_X2 = '0.0.3';
export const REPO_DI_PROVA = 'prova/talos';
export const PORTA_DI_PROVA = 47311;
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

export function chiaviDiProva() {
  const crea = () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    return { pubblica: publicKey.export({ type: 'spki', format: 'pem' }).toString(), privata: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() };
  };
  return { giusta: crea(), sbagliata: crea() };
}

/** Il server che fa la parte di GitHub. `modo()` dice quale firma servire: 'manomessa' (chiave sbagliata) o 'buona'.
 *  `servita()` (11/10/2026, la prova di «Riavvia ora») dice quale release pubblicare: `{ versione, cartellaFeed, firme }`; senza,
 *  è la 0.0.2 di sempre. */
export function serverDiProva({ cartellaFeed, firme, modo, porta = PORTA_DI_PROVA, servita = null }) {
  const richieste = [];
  const release = () => servita?.() ?? { versione: VERSIONE_X1, cartellaFeed, firme };
  const server = createServer((req, res) => {
    const { versione, cartellaFeed, firme } = release();
    const tag = `desktop-v${versione}`;
    const url = new URL(req.url, `http://127.0.0.1:${porta}`);
    richieste.push(url.pathname);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    if (url.pathname === `/repos/${REPO_DI_PROVA}/releases`) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify([{ tag_name: tag, draft: false, prerelease: false, html_url: `http://127.0.0.1:${porta}/note` }]));
      return;
    }
    const prefisso = `/${REPO_DI_PROVA}/releases/download/${tag}/`;
    if (!url.pathname.startsWith(prefisso)) { res.writeHead(404).end(); return; }
    const nome = decodeURIComponent(url.pathname.slice(prefisso.length));
    if (nome === NOME_FIRMA) { res.writeHead(200, { 'content-type': 'text/plain' }).end(`${firme[modo()]}\n`); return; }
    if (nome !== basename(nome)) { res.writeHead(400).end(); return; }
    const file = join(cartellaFeed, nome);
    if (!existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': statSync(file).size });
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(file).pipe(res);
  });
  return {
    richieste,
    avvia: () => new Promise((ok, ko) => { server.once('error', ko); server.listen(porta, '127.0.0.1', () => ok(server.address().port)); }),
    ferma: () => new Promise((ok) => server.close(() => ok())),
  };
}

function costruisci(versione, fileFonte) {
  const esito = spawnSync(process.execPath, [join(desktop, 'scripts', 'distribuisci.mjs')], {
    cwd: desktop, stdio: 'inherit', windowsHide: true,
    env: { ...process.env, TALOS_BUILD_AGGIORNAMENTI_PROVA: fileFonte, TALOS_BUILD_VERSIONE: versione },
  });
  if (esito.status !== 0) throw Error(`Build di prova ${versione} fallita.`);
  const uscita = join(desktop, 'dist-prova-aggiornamenti', versione);
  const installer = join(uscita, `TALOS-Setup-${versione}.exe`);
  assert.ok(existsSync(installer), `installer di prova assente: ${installer}`);
  assert.ok(existsSync(join(uscita, 'win-unpacked', 'resources', 'aggiornamenti-prova.json')), 'la build di prova porta la fonte di prova');
  return { uscita, installer };
}

function eseguiInstaller(file, argomenti) {
  const esito = spawnSync(file, argomenti, { windowsHide: true, timeout: 300_000 });
  if (esito.error) throw esito.error;
  if (esito.status !== 0) throw Error(`${basename(file)} uscito con ${esito.status}.`);
}

const versioneInstallata = (cartella) => {
  try { return JSON.parse(readFileSync(join(cartella, 'resources', 'app', 'package.json'), 'utf8')).version; } catch { return null; }
};

/** I TALOS.exe vivi lanciati da `exe` (solo quella cartella), con l'ora di nascita in ms. */
function processiTalos(exe) {
  const comando = `Get-CimInstance Win32_Process -Filter "Name='TALOS.exe'" | Where-Object { $_.ExecutablePath -eq '${exe.replace(/'/g, "''")}' } | `
    + 'ForEach-Object { "$($_.ProcessId) $([DateTimeOffset]::new($_.CreationDate).ToUnixTimeMilliseconds())" }';
  const esito = spawnSync('powershell', ['-NoProfile', '-Command', comando], { encoding: 'utf8', windowsHide: true });
  return String(esito.stdout ?? '').split(/\r?\n/).map((r) => r.trim().split(' ')).filter((p) => p.length === 2)
    .map(([pid, creato]) => ({ pid: Number(pid), creato: Number(creato) })).filter((p) => Number.isSafeInteger(p.pid) && Number.isFinite(p.creato));
}

async function aspetta(condizione, ms, errore) {
  const fine = Date.now() + ms;
  for (;;) {
    const valore = await condizione();
    if (valore) return valore;
    if (Date.now() > fine) throw Error(errore);
    await attendi(500);
  }
}

async function avviaApp(exe, dati) {
  const { _electron } = createRequire(import.meta.url)('../../frontend/node_modules/playwright');
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/KEY|TOKEN|SECRET|PASSWORD|TALOS_|NODE_OPTIONS|ELECTRON_RUN_AS_NODE/i.test(k)));
  Object.assign(env, { TALOS_DESKTOP_DATA_DIR: dati, TALOS_INTRO: '0' });
  const app = await _electron.launch({ executablePath: exe, args: [], env, timeout: 60_000 });
  const pagina = await app.firstWindow({ timeout: 60_000 });
  await pagina.waitForURL((u) => u.hostname === '127.0.0.1' && u.pathname === '/', { timeout: 60_000 });
  return { app, pagina, stato: () => pagina.evaluate(() => window.__talosAggiornamenti ?? null).catch(() => null) };
}

export async function provaAggiornamentoVero({ rapporto = join(desktop, '.prove', 'R05-aggiornamento-vero.json') } = {}) {
  if (process.platform !== 'win32') throw Error('La prova di aggiornamento vera richiede Windows.');
  // in CI la TEMP del runner; fuori, mai la TEMP di sistema: la radice di `src/scratch.mjs` (cancello SCRATCH-CANCELLO-01)
  const lavoro = process.env.RUNNER_TEMP ? mkdtempSync(join(process.env.RUNNER_TEMP, 'talos-aggiornamento-')) : cartellaScratch('talos-aggiornamento-');
  const cartellaInstallazione = join(process.env.LOCALAPPDATA, 'Programs', 'TALOS');
  /* Lo smoke che gira prima disinstalla e aspetta che sparisca TALOS.exe (`ci-smoke.ps1`): la cartella può restare. */
  if (existsSync(join(cartellaInstallazione, 'TALOS.exe'))) throw Error(`R05-PREFLIGHT: TALOS è già installato in ${cartellaInstallazione}; non lo tocco.`);
  const misure = { schema: 'talos.desktop.aggiornamento-vero.v1', completato: false, data: new Date().toISOString() };
  let server = null;
  let installato = false;
  try {
    const chiavi = chiaviDiProva();
    const fonte = { api: `http://127.0.0.1:${PORTA_DI_PROVA}`, download: `http://127.0.0.1:${PORTA_DI_PROVA}`, repo: REPO_DI_PROVA, chiavePubblica: chiavi.giusta.pubblica };
    validaFonteDiProva(fonte);
    const fileFonte = join(lavoro, 'aggiornamenti-prova.json');
    writeFileSync(fileFonte, JSON.stringify(fonte, null, 2));
    const x = costruisci(VERSIONE_X, fileFonte);
    const x1 = costruisci(VERSIONE_X1, fileFonte);
    const manifesto = readFileSync(join(x1.uscita, NOME_MANIFESTO));
    assert.equal(leggiManifesto(manifesto.toString('utf8')).version, VERSIONE_X1, 'latest.yml della build di prova dice 0.0.2');
    const firme = { buona: firmaManifesto(manifesto, chiavi.giusta.privata), manomessa: firmaManifesto(manifesto, chiavi.sbagliata.privata) };
    const x2 = costruisci(VERSIONE_X2, fileFonte);
    const manifesto2 = readFileSync(join(x2.uscita, NOME_MANIFESTO));
    assert.equal(leggiManifesto(manifesto2.toString('utf8')).version, VERSIONE_X2, 'latest.yml della terza build dice 0.0.3');
    const firme2 = { buona: firmaManifesto(manifesto2, chiavi.giusta.privata), manomessa: firmaManifesto(manifesto2, chiavi.sbagliata.privata) };
    let modo = 'manomessa';
    let servita = null; // finché è null il server pubblica la 0.0.2
    server = serverDiProva({ cartellaFeed: x1.uscita, firme, modo: () => modo, servita: () => servita });
    await server.avvia();

    eseguiInstaller(x.installer, ['/S']);
    installato = true;
    const exe = join(cartellaInstallazione, 'TALOS.exe');
    assert.equal(versioneInstallata(cartellaInstallazione), VERSIONE_X);
    const dati = join(lavoro, 'dati');
    mkdirSync(dati, { recursive: true });

    // ⛔ Verso contrario: manifesto firmato da un'altra chiave ⇒ niente scaricato, niente installato.
    {
      const { app, stato } = await avviaApp(exe, dati);
      const errore = await aspetta(async () => { const s = await stato(); return s?.ultimoControllo?.esito === 'errore' ? s.ultimoControllo.errore : null; }, 180_000, 'Nessun controllo concluso col manifesto manomesso.');
      misure.manomesso = { errore, richieste: [...server.richieste] };
      assert.match(errore, /firma/i);
      assert.ok(!server.richieste.some((r) => r.endsWith('.exe')), 'col manifesto manomesso l’installer non si scarica');
      await app.close();
      await attendi(5_000);
      assert.equal(versioneInstallata(cartellaInstallazione), VERSIONE_X, 'col manifesto manomesso resta la versione installata');
    }

    // Il verso giusto: scarica, «pronto», e alla chiusura si installa da solo.
    modo = 'buona';
    server.richieste.length = 0;
    {
      const { app, stato } = await avviaApp(exe, dati);
      const pronto = await aspetta(async () => (await stato())?.pronto ?? null, 300_000, 'L’aggiornamento non è arrivato a «pronto».');
      misure.buono = { pronto, richieste: [...server.richieste] };
      assert.equal(pronto.versione, VERSIONE_X1);
      assert.ok(server.richieste.some((r) => r.endsWith(`TALOS-Setup-${VERSIONE_X1}.exe`)), 'l’installer è stato scaricato');
      const inizio = Date.now();
      await app.close();
      await aspetta(() => versioneInstallata(cartellaInstallazione) === VERSIONE_X1, 300_000, 'Dopo la chiusura la versione installata non è passata a 0.0.2.');
      misure.installazioneAllaChiusuraMs = Date.now() - inizio;
      await attendi(10_000); // l'installer silenzioso finisce di scrivere registro e collegamenti
    }

    // Riaperta: è la versione nuova.
    {
      const { app } = await avviaApp(exe, dati);
      misure.versioneDopo = await app.evaluate(({ app: a }) => a.getVersion());
      await app.close();
      assert.equal(misure.versioneDopo, VERSIONE_X1);
    }

    /*
     * ⭐ Owner 11/10/2026 («appena ho premuto riavvia si è disinstallata la app»): «Riavvia ora» lancia l'installer VISIBILE, che da
     *   aggiornamento salta benvenuto e pagina finale e riapre TALOS da solo. La prova clicca il pulsante vero della banda e non
     *   tocca l'installer: se una pagina restasse ad aspettare un clic, TALOS non si riaprirebbe e la prova scadrebbe.
     */
    servita = { versione: VERSIONE_X2, cartellaFeed: x2.uscita, firme: firme2 };
    server.richieste.length = 0;
    {
      const { app, pagina, stato } = await avviaApp(exe, dati);
      const pronto = await aspetta(async () => { const s = await stato(); return s?.pronto?.versione === VERSIONE_X2 ? s.pronto : null; }, 300_000, 'La 0.0.3 non è arrivata a «pronto».');
      misure.riavviaOra = { pronto };
      const inizio = Date.now();
      const chiusa = new Promise((ok) => app.process().once('exit', ok));
      await pagina.locator('.talos-banda-aggiornamento button').filter({ hasText: /^(Riavvia ora|Restart now)$/ }).click();
      await aspetta(async () => /si riapre da solo|reopens by itself/.test(await pagina.locator('.talos-banda-aggiornamento').innerText().catch(() => '')) || null,
        10_000, 'La banda non ha detto che TALOS si chiude e si riapre da solo.').catch((e) => { misure.riavviaOra.avviso = e.message; });
      await Promise.race([chiusa, attendi(60_000).then(() => { throw Error('Dopo «Riavvia ora» TALOS non si è chiuso.'); })]);
      misure.riavviaOra.chiusaMs = Date.now() - inizio;
      await aspetta(() => versioneInstallata(cartellaInstallazione) === VERSIONE_X2, 300_000, 'Dopo «Riavvia ora» la versione installata non è passata a 0.0.3.');
      const riaperto = await aspetta(() => processiTalos(exe).find((p) => p.creato >= inizio) ?? null, 180_000,
        'Dopo «Riavvia ora» TALOS non si è riaperto da solo: una pagina dell’installer aspetta un clic?');
      misure.riavviaOra.riapertoMs = riaperto.creato - inizio;
      for (const p of processiTalos(exe)) spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { windowsHide: true });
      await aspetta(() => processiTalos(exe).length === 0 || null, 60_000, 'L’istanza riaperta non si è chiusa.');
    }
    misure.completato = true;
  } catch (errore) {
    misure.errore = String(errore?.stack || errore);
    throw errore;
  } finally {
    if (server) await server.ferma().catch(() => {});
    if (installato) {
      const disinstallatore = join(cartellaInstallazione, 'Uninstall TALOS.exe');
      if (existsSync(disinstallatore)) {
        try { eseguiInstaller(disinstallatore, ['/S']); } catch (e) { misure.disinstallazione = String(e.message); }
        await aspetta(() => !existsSync(join(cartellaInstallazione, 'TALOS.exe')), 120_000, 'Disinstallazione non conclusa.').catch((e) => { misure.disinstallazione = e.message; });
      }
    }
    mkdirSync(dirname(rapporto), { recursive: true });
    writeFileSync(rapporto, JSON.stringify(misure, null, 2));
    rmSync(lavoro, { recursive: true, force: true });
  }
  return misure;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  provaAggiornamentoVero().then(
    (m) => console.log(`Aggiornamento vero: ${m.completato ? 'riuscito' : 'non completato'}.`),
    (e) => { console.error(`Aggiornamento vero fallito: ${e.message}`); process.exit(1); },
  );
}
