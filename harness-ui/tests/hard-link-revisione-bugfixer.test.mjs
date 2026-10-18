/*
 * Revisione del bugfixer (16/10/2026 notte) di 320a5728e — hard link ai segreti. Collegamenti VERI su disco, casa FINTA (mai la
 * casa vera). I casi «DOCUMENTA» fissano il comportamento di oggi per il rapporto: sono verdi su ciò che il codice fa, non su ciò
 * che dovrebbe fare.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { lstatSync, readlinkSync, linkSync, mkdirSync, mkdtempSync, writeFileSync, symlinkSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { motivoDaChiedere, eUnFileSegreto } from '../src/path-policy.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function radiceDiProva(t) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-hl-rev-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  const progetto = join(radice, 'progetto');
  const casa = join(radice, 'casa');
  mkdirSync(progetto, { recursive: true });
  mkdirSync(casa, { recursive: true });
  return { radice, progetto, casa };
}
const leggi = (percorso, { progetto, casa }, extra = {}) => motivoDaChiedere({ tipo: 'leggi', percorso, cartella: progetto, home: casa, puntiNascosti: false, ...extra });

test('HL-RI-01 — falso positivo escluso: due .env uguali PER CONTENUTO ma file diversi (ino diverso) non scattano', (t) => {
  const s = radiceDiProva(t);
  writeFileSync(join(s.progetto, '.env'), 'API_KEY=sk-uguale\n');
  writeFileSync(join(s.progetto, 'copia.md'), 'API_KEY=sk-uguale\n'); // stesso contenuto, altro file
  writeFileSync(join(s.radice, 'terzo.md'), 'x');
  linkSync(join(s.progetto, 'copia.md'), join(s.radice, 'altro-nome.md')); // nlink 2: il controllo GIRA davvero
  assert.equal(statSync(join(s.progetto, 'copia.md')).nlink, 2, 'premessa: copia.md ha due nomi');
  assert.equal(leggi('copia.md', s), null);
});

test('HL-RI-02 — [CURATO R1] la ricerca (`eUnFileSegreto`, il filtro di `cerca`) vede l hard link e lo toglie dai risultati', (t) => {
  const s = radiceDiProva(t);
  writeFileSync(join(s.progetto, '.env'), 'API_KEY=sk-vero\n');
  linkSync(join(s.progetto, '.env'), join(s.progetto, 'appunti.md'));
  assert.ok(leggi('appunti.md', s), 'premessa: leggi chiede');
  assert.equal(eUnFileSegreto('appunti.md', { cartella: s.progetto, home: s.casa }), true,
    'appunti.md è lo stesso file del .env: la ricerca non ne mostra righe né nome');
});

test('HL-RI-03 — [CURATO R4] i file deduplicati di pnpm vuoti (lo stesso file nel magazzino) non chiedono: un file vuoto non ha niente da rivelare', (t) => {
  const s = radiceDiProva(t);
  const magazzino = join(s.radice, 'store');
  const pacchetto = join(s.progetto, 'node_modules', '.pnpm', 'pkg@1.0.0', 'node_modules', 'pkg');
  mkdirSync(magazzino, { recursive: true });
  mkdirSync(pacchetto, { recursive: true });
  writeFileSync(join(magazzino, 'vuoto'), ''); // il magazzino tiene UNA copia di ogni contenuto: tutti i file vuoti sono questo
  linkSync(join(magazzino, 'vuoto'), join(pacchetto, '.npmrc'));
  linkSync(join(magazzino, 'vuoto'), join(pacchetto, 'index.d.ts'));
  const esito = leggi('node_modules/.pnpm/pkg@1.0.0/node_modules/pkg/index.d.ts', s);
  assert.equal(esito, null, 'leggere un index.d.ts vuoto non chiede, anche se è lo stesso file del .npmrc vuoto accanto');
});

test('HL-RI-04 — [CURATO R3] un `stat` con ino 0 e nlink 2 (certe unità di rete, FAT finto) non fa scattare niente', (t) => {
  const s = radiceDiProva(t);
  writeFileSync(join(s.progetto, '.env'), 'API_KEY=sk-vero\n');
  writeFileSync(join(s.progetto, 'innocuo.md'), 'ciao\n');
  const statZero = (p) => {
    const vero = statSync(p, { bigint: true });
    return { isFile: () => vero.isFile(), nlink: 2n, dev: 0n, ino: 0n };
  };
  const esito = leggi('innocuo.md', s, { fsSync: { statSync: statZero } });
  assert.equal(esito, null, 'con ino 0 per tutti nessuna identità si confronta');
});

test('HL-RI-05 — collegamento SIMBOLICO verso un hard link che sta in un ALTRA cartella', (t) => {
  const s = radiceDiProva(t);
  mkdirSync(join(s.progetto, 'sub'));
  writeFileSync(join(s.progetto, 'sub', '.env'), 'API_KEY=sk-vero\n');
  linkSync(join(s.progetto, 'sub', '.env'), join(s.progetto, 'sub', 'appunti.md'));
  try { symlinkSync(join(s.progetto, 'sub', 'appunti.md'), join(s.progetto, 'scorciatoia.md'), 'file'); } catch (e) { t.skip(`symlink non permesso qui: ${e.code}`); return; }
  const diretto = leggi('sub/appunti.md', s);
  const viaSimbolico = leggi('scorciatoia.md', s);
  t.diagnostic(`diretto: ${diretto?.percorso ?? 'null'} · via simbolico: ${viaSimbolico?.percorso ?? 'null'}`);
  assert.ok(diretto, 'premessa: l hard link nella sua cartella chiede');
  assert.ok(viaSimbolico, 'il simbolico verso lo stesso file deve chiedere anche lui');
});

test('HL-RI-05b — giunzione di CARTELLA verso la cartella del segreto: la cartella elencata è quella vista dalla giunzione, chiede', (t) => {
  const s = radiceDiProva(t);
  mkdirSync(join(s.progetto, 'sub'));
  writeFileSync(join(s.progetto, 'sub', '.env'), 'API_KEY=sk-vero\n');
  linkSync(join(s.progetto, 'sub', '.env'), join(s.progetto, 'sub', 'appunti.md'));
  symlinkSync(join(s.progetto, 'sub'), join(s.progetto, 'ponte'), 'junction');
  assert.ok(leggi('ponte/appunti.md', s), 'attraverso la giunzione il .env sta nella stessa cartella vista: chiede');
});

test('HL-RI-05c — [CURATO R2] il simbolico di FILE (simulato con lstat/readlink iniettati): si guarda anche la cartella del file VERO', (t) => {
  const s = radiceDiProva(t);
  mkdirSync(join(s.progetto, 'sub'));
  writeFileSync(join(s.progetto, 'sub', '.env'), 'API_KEY=sk-vero\n');
  linkSync(join(s.progetto, 'sub', '.env'), join(s.progetto, 'sub', 'appunti.md'));
  writeFileSync(join(s.progetto, 'scorciatoia.md'), ''); // il posto del collegamento simbolico
  const bersaglio = join(s.progetto, 'sub', 'appunti.md');
  const eLaScorciatoia = (p) => String(p).toLowerCase() === join(s.progetto, 'scorciatoia.md').toLowerCase();
  /* un collegamento simbolico come lo vedono `lstat` e `readlink` (qui non si può crearne uno vero: EPERM), e `stat` che lo segue */
  const fsSync = {
    lstatSync: (p) => (eLaScorciatoia(p) ? { isSymbolicLink: () => true } : lstatSync(p)),
    readlinkSync: (p) => (eLaScorciatoia(p) ? bersaglio : readlinkSync(p)),
    statSync: (p, o) => statSync(eLaScorciatoia(p) ? bersaglio : p, o),
  };
  const esito = leggi('scorciatoia.md', s, { fsSync });
  assert.equal(esito?.classe, 'segreto', 'il .env sta nella cartella del file VERO (sub), e ora si guarda');
  assert.match(esito.percorso, /sub[\\/]\.env$/u);
});

test('HL-RI-06 — la chiave del «per la sessione»: stabile per la stessa scrittura, distinta lettura/scrittura, la shell = la lettura', (t) => {
  const s = radiceDiProva(t);
  writeFileSync(join(s.progetto, '.env'), 'API_KEY=sk-vero\n');
  linkSync(join(s.progetto, '.env'), join(s.progetto, 'appunti.md'));
  const l1 = leggi('appunti.md', s);
  const l2 = leggi('appunti.md', s);
  const w = motivoDaChiedere({ tipo: 'scrivi', percorso: 'appunti.md', cartella: s.progetto, home: s.casa, puntiNascosti: false });
  const sh = motivoDaChiedere({ tipo: 'shell', comando: 'type appunti.md', cartella: s.progetto, home: s.casa, puntiNascosti: false });
  const altraForma = leggi('./appunti.md', s);
  const chiave = (x) => x?.chiaveDelConsenso ?? x?.percorso;
  t.diagnostic(`lettura: ${chiave(l1)} · scrittura: ${chiave(w)} · shell: ${chiave(sh)} · ./: ${chiave(altraForma)}`);
  assert.equal(chiave(l1), chiave(l2), 'la stessa lettura due volte: la stessa chiave');
  assert.equal(chiave(l1), `appunti.md = ${join(s.progetto, '.env')}`);
  assert.equal(chiave(w), `scrittura:appunti.md = ${join(s.progetto, '.env')}`, 'la scrittura ha la sua');
  assert.equal(chiave(sh), chiave(l1), 'la shell condivide la chiave della lettura (come per un .env nominato)');
  assert.notEqual(chiave(altraForma), chiave(l1), 'un altra forma scritta chiede di nuovo (più prudente, non un buco)');
});

test('HL-RI-07 — MISURA il costo: lettura di un file a due nomi (il caso pnpm) contro uno a nome solo, casa realistica', (t) => {
  const s = radiceDiProva(t);
  const piena = (dir, n) => { mkdirSync(dir, { recursive: true }); for (let i = 0; i < n; i += 1) writeFileSync(join(dir, `f${i}`), 'x'); };
  piena(join(s.casa, '.ssh'), 6); piena(join(s.casa, '.aws'), 2); piena(join(s.casa, '.docker'), 3);
  piena(join(s.casa, '.kube'), 15); piena(join(s.casa, '.config', 'gcloud'), 30); piena(join(s.casa, '.gnupg'), 10);
  for (const f of ['.npmrc', '.gitconfig']) writeFileSync(join(s.casa, f), 'x');
  const pacchetto = join(s.progetto, 'node_modules', '.pnpm', 'p@1', 'node_modules', 'p');
  piena(pacchetto, 40);
  writeFileSync(join(s.progetto, 'package.json'), '{}');
  const magazzino = join(s.radice, 'store'); mkdirSync(magazzino);
  writeFileSync(join(magazzino, 'blob'), 'module.exports = 1');
  linkSync(join(magazzino, 'blob'), join(pacchetto, 'index.js'));
  const misura = (rel) => {
    for (let i = 0; i < 20; i += 1) leggi(rel, s);
    const N = 300; const t0 = performance.now();
    for (let i = 0; i < N; i += 1) leggi(rel, s);
    return (performance.now() - t0) / N;
  };
  const dueNomi = misura('node_modules/.pnpm/p@1/node_modules/p/index.js');
  const unNome = misura('node_modules/.pnpm/p@1/node_modules/p/f0');
  t.diagnostic(`ms per lettura — due nomi: ${dueNomi.toFixed(3)} · un nome: ${unNome.toFixed(3)} · rapporto ${(dueNomi / unNome).toFixed(1)}×`);
  assert.equal(leggi('node_modules/.pnpm/p@1/node_modules/p/index.js', s), null, 'premessa: nessun segreto, nessuna domanda');
});
