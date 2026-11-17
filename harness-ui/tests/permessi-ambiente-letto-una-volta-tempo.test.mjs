/*
 * Nono giro della riparazione dei permessi (14/11/2026, giudice v1880-v1881) — I TEMPI del cancello intero coi comandi del revisore
 * dell'ottavo giro. Prove di TEMPO: valgono solo con la macchina scarica. All'inizio la CPU della macchina si legge con `os.cpus()`
 * (tre campioni da un secondo, nodejs.org/api/os.html#oscpus: tempi cumulativi, si fanno le differenze); dal 50% in su il file si salta
 * e lo dice («sotto carico»), come le altre prove di tempo del progetto (PROT-11 di `computer-use-protezioni.test.mjs`: il migliore di tre).
 * Il cancello gira nel processo principale, col `process.env` vero: nei worker l'ambiente è una copia semplice (nodejs.org/api/process.html
 * #processenv), che si scorre più in fretta di quello di Windows e nasconderebbe la causa.
 *  - TEMPO-16K-*: `rm -rf "$a$a…$a"/x`, 16.011 caratteri, una variabile ignota ripetuta (lavoro 178-256, nessuna carta): prima della cura
 *    1,22-1,91 s su Linux, 1,23-1,39 s su Windows (revisore). Ora sotto i 100 ms di cancello intero.
 *  - TEMPO-12K-BASH-W: lo stesso dentro `bash -c` su Windows, 12.021 caratteri (prima 1,06-1,16 s): sotto i 100 ms.
 *  - TEMPO-18K-*: `rm -rf p0 … p3236`, 18.318 caratteri, lavoro 10.000 (prima 0,62-1,27 s): sotto i 500 ms.
 * Niente viene eseguito: la carta risponde «no». Nessuna cancellazione; il bash vero non si prova.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import os from 'node:os';

import { verificaPermessoScrittura } from '../src/kernel/talosHarness.mjs';
/* Time ceilings ×4 only under CI (shared runners); locally they stay as they were. Same rule as carta-argomenti-connettore-022-giro6. */
const MOLTIPLICATORE_CI = process.env.CI && process.env.CI !== 'false' ? 4 : 1;

const BS = String.fromCharCode(92);
const WINDOWS = process.platform === 'win32';
const liberi = WINDOWS ? [...'QZYXWVUTSPONMLK'].filter((l) => !existsSync(`${l}:${BS}`)) : [];
const D = liberi[0] ?? 'Q';
const SIS = {
  W: { piattaforma: 'win32', cartella: `${D}:${BS}w${BS}progetto`, home: `${D}:${BS}Users${BS}tizio` },
  L: { piattaforma: 'linux', cartella: '/home/tizio/w/progetto', home: '/home/tizio' },
  A: { piattaforma: 'android', cartella: '/storage/emulated/0/Documents/w/progetto', home: '/data/user/0/ai.talos.dev/files' },
  M: { piattaforma: 'darwin', cartella: '/Users/tizio/w/progetto', home: '/Users/tizio' },
};

/* la CPU della macchina, tre campioni da un secondo */
const totali = () => os.cpus().reduce((a, c) => { const t = Object.values(c.times).reduce((x, y) => x + y, 0); return { t: a.t + t, i: a.i + c.times.idle }; }, { t: 0, i: 0 });
const campioni = [];
for (let k = 0; k < 3; k += 1) {
  const a = totali();
  await new Promise((ok) => setTimeout(ok, 1000));
  const b = totali();
  campioni.push(Math.round(100 * (1 - (b.i - a.i) / Math.max(1, b.t - a.t))));
}
const CPU = Math.max(...campioni);
const SOTTO_CARICO = os.cpus().length === 0 ? 'os.cpus() vuoto: la CPU non si legge' : CPU >= 50 ? `sotto carico: CPU ${campioni.join('/')}% (serve sotto il 50%)` : false;
const SALTA_W = SOTTO_CARICO || (!WINDOWS || liberi.length < 1 ? 'serve Windows con una lettera di disco libera' : false);

/** Il cancello intero su un sistema, nel processo principale: millisecondi (il migliore di tre) e le carte critiche. */
async function cancello(s, comando) {
  const descrittore = Object.getOwnPropertyDescriptor(process, 'platform');
  const prima = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
  process.env.USERPROFILE = SIS[s].home; process.env.HOME = SIS[s].home;
  if (SIS[s].piattaforma !== process.platform) Object.defineProperty(process, 'platform', { ...descrittore, value: SIS[s].piattaforma });
  const tempi = [];
  let critiche = [];
  try {
    for (let k = 0; k < 4; k += 1) {
      const chieste = [];
      const t0 = performance.now();
      await verificaPermessoScrittura({ toolCallId: 't9t', tipo: 'shell', comando }, { livelloAccesso: 'accesso-pieno', cartella: SIS[s].cartella, consensiSessione: {}, permessiPerAttrezzo: { shell: 'sempre' }, chiediApprovazioneFn: async (x) => { chieste.push(x); return false; } });
      if (k > 0) tempi.push(performance.now() - t0); // il primo scalda i moduli e la memoria dei percorsi veri
      critiche = chieste.filter((c) => c.cancellazioneCritica).map((c) => c.cancellazioneCritica.perche);
    }
  } finally {
    Object.defineProperty(process, 'platform', descrittore);
    if (prima.USERPROFILE === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prima.USERPROFILE;
    if (prima.HOME === undefined) delete process.env.HOME; else process.env.HOME = prima.HOME;
  }
  return { ms: Math.min(...tempi), tempi, critiche };
}

const C16K = `rm -rf "${'$a'.repeat(8000)}"/x`;
const C12K_BASH = `bash -c 'rm -rf "${'$a'.repeat(6000)}"/x'`;
const C18K = `rm -rf ${Array.from({ length: 3237 }, (_, i) => `p${i}`).join(' ')}`;
/* 0.2.3 (cura della variabile vuota): `$a` non c'è, quindi `"$a…$a"/x` è `/x`, una figlia della radice (su Windows `/x` in Git Bash è la
   radice del disco X:) e la lettura nuova CHIEDE. Le stesse 8.000 e 6.000 variabili dopo una `p` non aprono la parola: la lettura nuova
   tace come prima e si consulta la copia ferma, che legge ogni variabile (la strada che il nono giro ha reso veloce). */
const CRITICHE_DI_X = (s) => [s === 'W' ? 'radice' : 'primo-livello'];
const C16K_DOPO_P = `rm -rf "p${'$a'.repeat(8000)}"/x`;
const C12K_BASH_DOPO_P = `bash -c 'rm -rf "p${'$a'.repeat(6000)}"/x'`;

test('TEMPO-COMANDI — i comandi del revisore hanno la lunghezza che ha misurato lui (16.011, 12.021, 18.318 caratteri)', () => {
  assert.equal(C16K.length, 16011);
  assert.equal(C12K_BASH.length, 12021);
  assert.equal(C18K.length, 18318);
});

for (const s of ['L', 'A', 'M', 'W']) {
  test(`TEMPO-16K-${s} — \`rm -rf "$a…$a"/x\` da 16.011 caratteri: il cancello intero risponde sotto i 100 ms, e chiede (0.2.3: \`$a\` non c è, è \`/x\`)`, { skip: s === 'W' ? SALTA_W : SOTTO_CARICO, timeout: 120000 }, async (t) => {
    const r = await cancello(s, C16K);
    t.diagnostic(`CPU ${campioni.join('/')}%; ${s} ${r.tempi.map((x) => x.toFixed(1)).join(' / ')} ms`);
    assert.deepEqual(r.critiche, CRITICHE_DI_X(s));
    assert.ok(r.ms < 100 * MOLTIPLICATORE_CI, `[ceiling ${100 * MOLTIPLICATORE_CI} ms] ${s}: ${r.ms.toFixed(1)} ms (il migliore di ${r.tempi.length})`);
  });
  test(`TEMPO-16K-DOPO-P-${s} — le stesse 8.000 variabili dopo una \`p\`: sotto i 100 ms, senza carta critica (la copia ferma consultata)`, { skip: s === 'W' ? SALTA_W : SOTTO_CARICO, timeout: 120000 }, async (t) => {
    const r = await cancello(s, C16K_DOPO_P);
    t.diagnostic(`CPU ${campioni.join('/')}%; ${s} ${r.tempi.map((x) => x.toFixed(1)).join(' / ')} ms`);
    assert.deepEqual(r.critiche, []);
    assert.ok(r.ms < 100 * MOLTIPLICATORE_CI, `[ceiling ${100 * MOLTIPLICATORE_CI} ms] ${s}: ${r.ms.toFixed(1)} ms (il migliore di ${r.tempi.length})`);
  });
}

test('TEMPO-12K-BASH-W — lo stesso dentro `bash -c` su Windows, 12.021 caratteri: sotto i 100 ms, e chiede (0.2.3)', { skip: SALTA_W, timeout: 120000 }, async (t) => {
  const r = await cancello('W', C12K_BASH);
  t.diagnostic(`CPU ${campioni.join('/')}%; W ${r.tempi.map((x) => x.toFixed(1)).join(' / ')} ms`);
  assert.deepEqual(r.critiche, CRITICHE_DI_X('W'));
  assert.ok(r.ms < 100 * MOLTIPLICATORE_CI, `[ceiling ${100 * MOLTIPLICATORE_CI} ms] W: ${r.ms.toFixed(1)} ms`);
});

test('TEMPO-12K-BASH-DOPO-P-W — le stesse 6.000 variabili dopo una `p` dentro `bash -c`: sotto i 100 ms, senza carta critica', { skip: SALTA_W, timeout: 120000 }, async (t) => {
  const r = await cancello('W', C12K_BASH_DOPO_P);
  t.diagnostic(`CPU ${campioni.join('/')}%; W ${r.tempi.map((x) => x.toFixed(1)).join(' / ')} ms`);
  assert.deepEqual(r.critiche, []);
  assert.ok(r.ms < 100 * MOLTIPLICATORE_CI, `[ceiling ${100 * MOLTIPLICATORE_CI} ms] W: ${r.ms.toFixed(1)} ms`);
});

for (const s of ['L', 'A', 'M', 'W']) {
  test(`TEMPO-18K-${s} — \`rm -rf\` di 3.237 cartelle, 18.318 caratteri: il cancello intero risponde sotto i 500 ms, senza carta critica`, { skip: s === 'W' ? SALTA_W : SOTTO_CARICO, timeout: 120000 }, async (t) => {
    const r = await cancello(s, C18K);
    t.diagnostic(`CPU ${campioni.join('/')}%; ${s} ${r.tempi.map((x) => x.toFixed(1)).join(' / ')} ms`);
    assert.deepEqual(r.critiche, []);
    assert.ok(r.ms < 500 * MOLTIPLICATORE_CI, `[ceiling ${500 * MOLTIPLICATORE_CI} ms] ${s}: ${r.ms.toFixed(1)} ms`);
  });
}
