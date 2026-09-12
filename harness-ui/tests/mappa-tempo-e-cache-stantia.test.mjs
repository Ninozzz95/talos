import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costruisciMappaCartelle, testoMappaCartelle, TEMPO_MASSIMO_MAPPA_MS } from '../src/mappa-cartelle.mjs';
import { contestoDelProgetto, dimenticaTuttiGliElenchi, VALIDITA_MS } from '../src/contesto-del-progetto.mjs';

/*
 * 12/09/2026 — owner: «i modelli OpenRouter sono estremamente lenti al primo messaggio, quasi un
 * minuto». Misurato: `contestoDelProgetto` sulla cartella Desktop costa 34.356 ms (harness-ui
 * 258 ms), e la cache di cinque minuti lo faceva ripagare a ogni invio distanziato (tempi-giro
 * 41,8 · 34,3 · 39,9 s al primo token). Due cure, provate qui nei due versi.
 */

/** Un disco finto: `n` cartelle sorelle sotto la radice, ognuna con un file; `lentezzaMs` per readdir. */
function discoFinto({ cartelle = 50, lentezzaMs = 0, orologio }) {
  const chiamate = { readdir: 0, realpath: 0 };
  const voce = (name, dir) => ({ name, isDirectory: () => dir, isFile: () => !dir, isSymbolicLink: () => false });
  return {
    chiamate,
    fs: {
      async readdir(p) {
        chiamate.readdir += 1;
        if (lentezzaMs) orologio.avanza(lentezzaMs);
        if (p === 'R') return Array.from({ length: cartelle }, (_, i) => voce(`c${String(i).padStart(3, '0')}`, true));
        return [voce('f.txt', false)];
      },
      async realpath(p) { chiamate.realpath += 1; return p; },
      async stat() { throw new Error('non chiamato'); },
    },
  };
}
function orologioFinto() { let t = 0; return { now: () => t, avanza: (ms) => { t += ms; } }; }

test('MAPPA-TEMPO · il tetto in tempo ferma la camminata e LO DICHIARA, con le cartelle gia lette intatte', async () => {
  const orologio = orologioFinto();
  const disco = discoFinto({ cartelle: 50, lentezzaMs: 100, orologio });
  const mappa = await costruisciMappaCartelle({ radice: 'R', fs: disco.fs, tempoMassimoMs: 1000, orologio: orologio.now });
  assert.equal(mappa.troncato, true);
  assert.equal(mappa.motivoTroncamento, 'tempo');
  assert.ok(mappa.cartelle.length >= 5 && mappa.cartelle.length < 50, `lette ${mappa.cartelle.length}`);
  assert.ok(mappa.msImpiegati >= 1000);
  const testo = testoMappaCartelle(mappa, { radice: 'R' });
  assert.match(testo, /MAPPA INCOMPLETA/);
  assert.match(testo, /avrebbe fatto aspettare/);
  assert.match(testo, /`cerca` o `elenca`/);
});

test('MAPPA-TEMPO · al contrario: entro il budget l albero e completo, e realpath NON si chiama per cartelle vere', async () => {
  const orologio = orologioFinto();
  const disco = discoFinto({ cartelle: 50, lentezzaMs: 1, orologio });
  const mappa = await costruisciMappaCartelle({ radice: 'R', fs: disco.fs, orologio: orologio.now });
  assert.equal(mappa.troncato, false);
  assert.equal(mappa.motivoTroncamento, null);
  assert.equal(mappa.cartelle.length, 50);
  assert.equal(disco.chiamate.realpath, 1, 'solo la radice'); // 12/09: prima erano 51
  assert.ok(TEMPO_MASSIMO_MAPPA_MS >= 1000 && TEMPO_MASSIMO_MAPPA_MS <= 5000, 'il tetto di serie sta fra il costo di harness-ui (258 ms) e il primo token del modello');
});

test('MAPPA-TEMPO · il tetto sulle cartelle resta e si chiama col suo nome', async () => {
  const orologio = orologioFinto();
  const disco = discoFinto({ cartelle: 50, orologio });
  const mappa = await costruisciMappaCartelle({ radice: 'R', fs: disco.fs, tettoCartelle: 10, orologio: orologio.now });
  assert.equal(mappa.troncato, true);
  assert.equal(mappa.motivoTroncamento, 'cartelle');
});

/** Un `fs` minimo per contestoDelProgetto: una radice con una cartella e un file, senza git. */
function fsPreambolo(nomeCartella) {
  const voce = (name, dir) => ({ name, isDirectory: () => dir, isFile: () => !dir, isSymbolicLink: () => false });
  const enoent = () => Object.assign(new Error('no'), { code: 'ENOENT' });
  return {
    async readdir(p) { return p.endsWith('R') ? [voce(nomeCartella, true), voce('a.txt', false)] : [voce('b.txt', false)]; },
    async realpath(p) { return p; },
    async stat() { throw enoent(); },
    async readFile() { throw enoent(); },
    async access() { throw enoent(); },
  };
}
const senzaGit = async () => { throw new Error('niente git'); };

test('CACHE-STANTIA · scaduta per eta, la cache risponde SUBITO con il testo di prima e si rinnova in sottofondo', async () => {
  dimenticaTuttiGliElenchi();
  let t = 1_000_000; const adesso = () => t;
  const cartella = 'C:/prova/R';
  let nome = 'prima';
  const fsVivo = { ...fsPreambolo('prima'), readdir: (p) => fsPreambolo(nome).readdir(p) };
  const uno = await contestoDelProgetto({ cartella, deps: { fs: fsVivo, adesso, eseguiGit: senzaGit } });
  assert.ok(uno && !uno.riusato && uno.testo.includes('prima/'), 'la prima costruzione vede la cartella «prima»');
  // la cartella cambia nome sul disco, e passano piu di cinque minuti
  nome = 'dopo'; t += VALIDITA_MS + 1;
  const partenza = Date.now();
  const due = await contestoDelProgetto({ cartella, deps: { fs: fsVivo, adesso, eseguiGit: senzaGit } });
  assert.equal(due.riusato, true);
  assert.equal(due.stantio, true);
  assert.equal(due.testo, uno.testo, 'byte-identico: e il prefisso su cui prende la cache del fornitore');
  assert.ok(Date.now() - partenza < 200, 'risposta immediata, senza ricamminare');
  await new Promise((r) => setTimeout(r, 50)); // il rinnovo in sottofondo finisce
  const tre = await contestoDelProgetto({ cartella, deps: { fs: fsVivo, adesso, eseguiGit: senzaGit } });
  assert.equal(tre.riusato, true);
  assert.equal(tre.stantio, undefined, 'la voce rinnovata e fresca');
  assert.ok(tre.testo.includes('dopo/') && !tre.testo.includes('prima/'), 'il messaggio DOPO vede la mappa nuova');
  dimenticaTuttiGliElenchi();
});

test('CACHE-STANTIA · al contrario: entro i cinque minuti e riuso normale (non stantio), e senza voce si costruisce e si aspetta', async () => {
  dimenticaTuttiGliElenchi();
  let t = 5_000_000; const adesso = () => t;
  const cartella = 'C:/prova2/R';
  const deps = { fs: fsPreambolo('x'), adesso, eseguiGit: senzaGit };
  const uno = await contestoDelProgetto({ cartella, deps });
  assert.equal(uno.riusato, false);
  t += VALIDITA_MS - 1;
  const due = await contestoDelProgetto({ cartella, deps });
  assert.equal(due.riusato, true);
  assert.equal(due.stantio, undefined);
  dimenticaTuttiGliElenchi();
});
