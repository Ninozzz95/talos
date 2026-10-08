import assert from 'node:assert/strict';
import { existsSync, mkdirSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { after } from 'node:test';
import test from 'node:test';

import { diagnosi } from '../src/doctor.mjs';
import {
  avviaPuliziaScratch, cartellaScratch, cartellaScratchAttesa, ETA_MINIMA_SCRATCH_MS, FILE_TIMBRO, INTERVALLO_PULIZIA_MS,
  radiceScratch, ripulisciScratch, statoScratch,
} from '../src/scratch.mjs';
import { desktopProfile } from '../desktop/profile.mjs';
import { cartellaProfiloPredefinita } from '../src/browser-sessione-viva.mjs';
import { creaAvvioFiglio, risolviPercorsi } from '../desktop/runtime.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

/*
 * Corsia SCRATCH, 24/09/2026 — la radice unica dei temporanei di TALOS (`src/scratch.mjs`).
 * Decisione dell'owner (23/09 notte): `%LOCALAPPDATA%\TALOS\cache\scratch`, oppure `<dati>\cache\scratch` se
 * la cartella dati è spostata con TALOS_DESKTOP_DATA_DIR; pulizia all'avvio di ciò che è fermo da 24 ore (età
 * del SOTTOALBERO, Hermes `hermes_constants.py:1044-1049`), timbro orario fra processi, Doctor che mostra.
 * ⛔ Tutto gira in una radice privata: questo file punta TALOS_SCRATCH_DIR a una cartella di prova, così il
 *   Doctor e ogni `cartellaScratch()` senza radice esplicita non toccano mai la radice vera della persona.
 */
const ORA = 60 * 60 * 1000;
const radiceDelFile = cartellaDiProva('talos-scratch-prova-');
const scratchPrima = process.env.TALOS_SCRATCH_DIR;
process.env.TALOS_SCRATCH_DIR = join(radiceDelFile, 'radice-del-file');
after(() => { if (scratchPrima === undefined) delete process.env.TALOS_SCRATCH_DIR; else process.env.TALOS_SCRATCH_DIR = scratchPrima; });

/** Imposta l'mtime (e atime) a `quando` ms. */
function data(percorso, quando) { utimesSync(percorso, quando / 1000, quando / 1000); }

test('SCRATCH-01 — la radice: esplicita, poi cartella dati spostata, poi %LOCALAPPDATA%\\TALOS\\cache\\scratch', () => {
  const opzioni = { platform: 'win32', home: 'C:\\Users\\P' };
  assert.equal(radiceScratch({ TALOS_SCRATCH_DIR: 'E:\\Scratch', TALOS_DESKTOP_DATA_DIR: 'D:\\Dati', LOCALAPPDATA: 'C:\\L' }, opzioni), resolve('E:\\Scratch'));
  assert.equal(radiceScratch({ TALOS_DESKTOP_DATA_DIR: 'D:\\Dati', LOCALAPPDATA: 'C:\\L' }, opzioni), join(resolve('D:\\Dati'), 'cache', 'scratch'));
  assert.equal(radiceScratch({ LOCALAPPDATA: 'C:\\Users\\P\\AppData\\Local' }, opzioni), join('C:\\Users\\P\\AppData\\Local', 'TALOS', 'cache', 'scratch'));
  assert.equal(radiceScratch({}, opzioni), join('C:\\Users\\P', 'AppData', 'Local', 'TALOS', 'cache', 'scratch'), 'senza LOCALAPPDATA: la cartella locale standard sotto la casa');
  assert.equal(radiceScratch({ TALOS_SCRATCH_DIR: '   ', LOCALAPPDATA: 'C:\\L' }, opzioni), join('C:\\L', 'TALOS', 'cache', 'scratch'), 'una variabile vuota non conta');
  assert.throws(() => radiceScratch({ TALOS_SCRATCH_DIR: 'relativa\\x' }, opzioni), /absolute folder/);
  assert.throws(() => radiceScratch({ TALOS_DESKTOP_DATA_DIR: '.\\dati' }, opzioni), /absolute folder/);
});

test('SCRATCH-02 — le cartelle usa-e-getta nascono SOTTO la radice (creata se manca), e il prefisso è un nome, mai un percorso', async () => {
  const radice = join(cartellaDiProva('talos-scratch-crea-'), 'non-ancora', 'creata');
  const a = cartellaScratch('talos-prova-', { radice });
  const b = await cartellaScratchAttesa('talos-prova-', { radice });
  assert.equal(dirname(a), radice); assert.equal(dirname(b), radice); assert.notEqual(a, b);
  assert.ok(statSync(a).isDirectory() && statSync(b).isDirectory());
  // senza radice esplicita: quella del processo (qui TALOS_SCRATCH_DIR del file), mai la TEMP di sistema
  assert.equal(dirname(cartellaScratch('talos-prova-')), process.env.TALOS_SCRATCH_DIR);
  for (const cattivo of ['../fuori-', 'a/b-', 'a\\b-', '', '.nascosto-', 'C:x', null]) {
    assert.throws(() => cartellaScratch(cattivo, { radice }), /prefix/, `prefisso ${JSON.stringify(cattivo)}`);
    await assert.rejects(cartellaScratchAttesa(cattivo, { radice }), /prefix/);
  }
});

test('SCRATCH-03 — la pulizia guarda il SOTTOALBERO: una cartella vecchia con un file scritto un\'ora fa resta; una ferma da 25 ore va', async () => {
  const radice = cartellaDiProva('talos-scratch-pota-');
  const adesso = Date.now();
  const vecchio = adesso - 25 * ORA;
  // viva: la cartella e i livelli intermedi sono vecchi, ma un file in fondo è stato scritto un'ora fa
  const viva = join(radice, 'viva'); mkdirSync(join(viva, 'a', 'b'), { recursive: true });
  writeFileSync(join(viva, 'a', 'b', 'lavoro.txt'), 'x'); data(join(viva, 'a', 'b', 'lavoro.txt'), adesso - ORA);
  data(join(viva, 'a', 'b'), vecchio); data(join(viva, 'a'), vecchio); data(viva, vecchio);
  // ferma: tutto il sottoalbero fermo da 25 ore
  const ferma = join(radice, 'ferma'); mkdirSync(join(ferma, 'x'), { recursive: true });
  writeFileSync(join(ferma, 'x', 'f.txt'), 'x'); data(join(ferma, 'x', 'f.txt'), vecchio); data(join(ferma, 'x'), vecchio); data(ferma, vecchio);
  // un file sciolto fermo da 25 ore: anche lui va (non è il timbro)
  const sciolto = join(radice, 'sciolto.txt'); writeFileSync(sciolto, 'x'); data(sciolto, vecchio);
  // appena nata: resta
  const nuova = join(radice, 'nuova'); mkdirSync(nuova);
  // al confine: ferma da 23 ore, resta
  const quasi = join(radice, 'quasi'); mkdirSync(quasi); data(quasi, adesso - 23 * ORA);

  const esito = await ripulisciScratch({ radice, adesso, timbro: false });

  assert.equal(esito.eseguita, true);
  assert.deepEqual(esito.tolte.sort(), ['ferma', 'sciolto.txt']);
  assert.deepEqual(esito.rimaste, []);
  assert.equal(existsSync(join(viva, 'a', 'b', 'lavoro.txt')), true, 'una voce con una scrittura recente in fondo NON si toglie, anche se la cartella è vecchia');
  assert.equal(existsSync(ferma), false); assert.equal(existsSync(sciolto), false);
  assert.equal(existsSync(nuova), true); assert.equal(existsSync(quasi), true);
  assert.equal(ETA_MINIMA_SCRATCH_MS, 24 * ORA, 'la soglia decisa dall\'owner è 24 ore');
});

test('SCRATCH-04 — il timbro: al massimo una pulizia l\'ora, anche fra processi; poi si ripota', async () => {
  const radice = cartellaDiProva('talos-scratch-timbro-');
  const adesso = Date.now();
  const primo = await ripulisciScratch({ radice, adesso });
  assert.equal(primo.eseguita, true);
  assert.ok(Math.abs(statSync(join(radice, FILE_TIMBRO)).mtimeMs - adesso) < 1000, 'il timbro porta l\'istante della pulizia');
  const ferma = join(radice, 'ferma'); mkdirSync(ferma); data(ferma, adesso - 30 * ORA);
  const secondo = await ripulisciScratch({ radice, adesso: adesso + 30 * 60 * 1000 });
  assert.equal(secondo.eseguita, false, 'mezz\'ora dopo non si ripota');
  assert.match(secondo.motivo, /last hour/);
  assert.equal(existsSync(ferma), true);
  const terzo = await ripulisciScratch({ radice, adesso: adesso + INTERVALLO_PULIZIA_MS + 60_000 });
  assert.equal(terzo.eseguita, true);
  assert.deepEqual(terzo.tolte, ['ferma']);
  assert.equal(existsSync(join(radice, FILE_TIMBRO)), true, 'il timbro non è mai una voce da togliere');
  // anche un timbro vecchio, in un giro senza timbro (Doctor, residui storici), resta dov'è
  data(join(radice, FILE_TIMBRO), adesso - 30 * ORA);
  const senzaTimbro = await ripulisciScratch({ radice, adesso, timbro: false });
  assert.deepEqual(senzaTimbro.tolte, []);
  assert.equal(existsSync(join(radice, FILE_TIMBRO)), true, 'un timbro vecchio non è un residuo');
});

test('SCRATCH-05 — una voce che non si toglie si DICHIARA, non ferma le altre, non lancia, e va via al giro dopo', async () => {
  const radice = cartellaDiProva('talos-scratch-bloccata-');
  const adesso = Date.now();
  for (const nome of ['bloccata', 'libera']) { const p = join(radice, nome); mkdirSync(p); data(p, adesso - 30 * ORA); }
  const avvisi = [];
  const ascolta = (w) => { if (w.name === 'ResiduoScratch') avvisi.push(w.message); };
  process.on('warning', ascolta);
  const { rm } = await import('node:fs/promises');
  const rimuovi = async (percorso, opzioni) => {
    if (percorso.endsWith('bloccata')) { const e = new Error('occupata'); e.code = 'EPERM'; throw e; }
    return rm(percorso, opzioni);
  };
  const esito = await ripulisciScratch({ radice, adesso, timbro: false, rimuovi });
  await new Promise((r) => setImmediate(r));
  process.off('warning', ascolta);
  assert.deepEqual(esito.tolte, ['libera']);
  assert.deepEqual(esito.rimaste, [{ nome: 'bloccata', codice: 'EPERM' }]);
  assert.equal(existsSync(join(radice, 'bloccata')), true);
  assert.equal(avvisi.length, 1); assert.match(avvisi[0], /EPERM.*bloccata/);
  const dopo = await ripulisciScratch({ radice, adesso, timbro: false });
  assert.deepEqual(dopo.tolte, ['bloccata'], 'al giro dopo si ritenta e va via');
});

test('SCRATCH-06 — la radice segue TALOS_DESKTOP_DATA_DIR, e guscio desktop e server calcolano la STESSA radice', () => {
  const appData = 'C:\\Users\\P\\AppData\\Roaming';
  const localAppData = 'C:\\Users\\P\\AppData\\Local';
  const percorsi = risolviPercorsi({ appPath: resolve('app') });
  const casi = [
    { env: {}, attesa: join(localAppData, 'TALOS', 'cache', 'scratch') },
    { env: { TALOS_DESKTOP_DATA_DIR: 'D:\\Dati\\TALOS' }, attesa: join('D:\\Dati\\TALOS', 'cache', 'scratch') },
    { env: { TALOS_SCRATCH_DIR: 'E:\\Temporanei' }, attesa: resolve('E:\\Temporanei') },
  ];
  for (const { env, attesa } of casi) {
    const profilo = desktopProfile({ appData, localAppData, env, platform: 'win32' });
    assert.equal(profilo.scratchDir, attesa, `guscio, env ${JSON.stringify(env)}`);
    assert.equal(radiceScratch({ ...env, LOCALAPPDATA: localAppData }, { platform: 'win32' }), attesa, `server avviato a mano, env ${JSON.stringify(env)}`);
    // ⛔ il figlio riceve SEMPRE TALOS_DESKTOP_DATA_DIR (anche in Roaming): senza TALOS_SCRATCH_DIR finirebbe in Roaming
    const avvio = creaAvvioFiglio({ execPath: resolve('Electron.exe'), percorsi, port: 49152, token: 'a'.repeat(64), dataDir: profilo.dataDir, scratchDir: profilo.scratchDir, env: {} });
    assert.equal(avvio.options.env.TALOS_DESKTOP_DATA_DIR, profilo.dataDir);
    assert.equal(radiceScratch(avvio.options.env, { platform: 'win32' }), attesa, `figlio del guscio, env ${JSON.stringify(env)}`);
  }
  const produzione = desktopProfile({ appData, localAppData, platform: 'win32' });
  assert.ok(!produzione.scratchDir.startsWith(appData), 'mai in Roaming quando i dati non sono spostati');
  const preview = desktopProfile({ appData, localAppData, metadata: { talosProfile: 'preview' }, platform: 'win32' });
  assert.equal(preview.scratchDir, join(localAppData, 'TALOS Preview', 'cache', 'scratch'), 'la preview non condivide la radice stabile');
  assert.throws(() => desktopProfile({ appData, localAppData, env: { TALOS_SCRATCH_DIR: 'relativa' }, platform: 'win32' }), /assoluta/);
});

test('SCRATCH-07 — radice assente, illeggibile o mal configurata: nessuna eccezione, niente inventato', async () => {
  const assente = join(cartellaDiProva('talos-scratch-assente-'), 'non-esiste');
  const esito = await ripulisciScratch({ radice: assente });
  assert.equal(esito.eseguita, false); assert.deepEqual(esito.tolte, []);
  assert.equal(existsSync(assente), false, 'la pulizia non crea la radice');
  const stato = await statoScratch({ radice: assente });
  assert.deepEqual(stato, { percorso: assente, esiste: false, byte: 0, voci: 0, illeggibili: 0 });
  const giri = await avviaPuliziaScratch({ env: { TALOS_SCRATCH_DIR: 'relativa' }, log: { log() {}, warn() {} } });
  assert.ok(Array.isArray(giri));
  assert.match(giri[0].motivo, /invalid root/);
});

test('SCRATCH-08 — lo stato per il Doctor: percorso, byte e voci (il timbro non è una voce), anche dentro diagnosi()', async () => {
  const radice = cartellaDiProva('talos-scratch-stato-');
  mkdirSync(join(radice, 'uno', 'sotto'), { recursive: true });
  writeFileSync(join(radice, 'uno', 'sotto', 'a.bin'), Buffer.alloc(1000));
  writeFileSync(join(radice, 'due.txt'), Buffer.alloc(24));
  writeFileSync(join(radice, FILE_TIMBRO), '');
  const stato = await statoScratch({ radice });
  assert.deepEqual(stato, { percorso: radice, esiste: true, byte: 1024, voci: 2, illeggibili: 0 });
  let cartellaDelComando;
  const risultato = await diagnosi({
    chiaveConfigurata: true, scratch: stato,
    eseguiComandoSandboxatoFn: async (_c, cartella) => { cartellaDelComando = cartella; return { enforcement: 'desktop' }; },
    spawnSyncFn: () => ({ status: 0 }),
  });
  // K4a: la frase è inglese (riserva), con la chiave del dizionario e i valori; l'italiano sta nell'area `server` dell'interfaccia
  assert.deepEqual(risultato.scratch, {
    percorso: radice, esiste: true, byte: 1024, voci: 2,
    dettaglio: `2 entries, 1024 bytes in ${radice}. Anything left idle for 24 hours is removed at startup.`,
    dettaglioChiave: 'server.doctor.scratch.summary', dettaglioParams: { n: 2, bytes: 1024, path: radice },
  });
  assert.equal(dirname(cartellaDelComando), process.env.TALOS_SCRATCH_DIR, 'la cartella di prova del Doctor nasce sotto la radice, non in TEMP');
  assert.equal(existsSync(cartellaDelComando), false, 'e viene tolta');
  const senza = await diagnosi({ chiaveConfigurata: true, eseguiComandoSandboxatoFn: async () => ({ enforcement: 'none' }), spawnSyncFn: () => ({ status: 0 }) });
  assert.equal('scratch' in senza, false, 'senza stato, il Doctor non inventa la voce');
});

test('SCRATCH-09 — all\'avvio: la radice più i residui STORICI fuori radice (TEMP e avvio-* della cartella dati), solo i nostri e solo se fermi', async () => {
  const base = cartellaDiProva('talos-scratch-avvio-');
  const temp = join(base, 'temp'); const dati = join(base, 'dati'); const radice = join(base, 'radice');
  for (const c of [temp, dati, radice]) mkdirSync(c);
  const adesso = Date.now();
  const vecchia = (dove, nome) => { const p = join(dove, nome); mkdirSync(p); data(p, adesso - 30 * ORA); return p; };
  const tolteAttese = [vecchia(temp, 'talos-doctor-AAA'), vecchia(temp, 'talos-git-msg-BBB'), vecchia(temp, 'talos-avvio-CCC'), vecchia(temp, 'talos-browser-vivo'), vecchia(dati, 'avvio-DDD'), vecchia(radice, 'qualunque')];
  const restano = [vecchia(temp, 'talos-altro-EEE'), vecchia(temp, 'non-nostra'), vecchia(dati, 'sessions'), join(dati, 'avvio-recente')];
  mkdirSync(join(dati, 'avvio-recente'));
  const tempPrima = { TEMP: process.env.TEMP, TMP: process.env.TMP };
  process.env.TEMP = temp; process.env.TMP = temp;
  try {
    const giri = await avviaPuliziaScratch({ env: { TALOS_SCRATCH_DIR: radice, TALOS_DESKTOP_DATA_DIR: dati }, adesso, log: { log() {}, warn() {} } });
    assert.equal(giri.length, 3);
  } finally {
    for (const [k, v] of Object.entries(tempPrima)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  for (const p of tolteAttese) assert.equal(existsSync(p), false, `doveva sparire: ${p}`);
  for (const p of restano) assert.equal(existsSync(p), true, `doveva restare: ${p}`);
});

test('SCRATCH-10 — il profilo del browser pilotato vive sotto la radice (owner 24/09), non nella TEMP di sistema', () => {
  /* Decisione dell'owner del 24/09/2026: `%TEMP%\talos-browser-vivo` va sotto la radice dei temporanei, soggetto alla
     pulizia delle 24 ore; il profilo si ricrea alla navigazione dopo (browser-vivo.mjs lo crea con mkdir ricorsivo). */
  assert.equal(cartellaProfiloPredefinita(), join(radiceScratch(), 'talos-browser-vivo'));
  assert.equal(dirname(cartellaProfiloPredefinita()), process.env.TALOS_SCRATCH_DIR);
  assert.equal(cartellaProfiloPredefinita('/altrove'), join('/altrove', 'talos-browser-vivo'), 'una base esplicita resta rispettata');
});
