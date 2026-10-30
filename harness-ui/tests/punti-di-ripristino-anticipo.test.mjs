import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { creaPuntiDiRipristino } from '../src/punti-di-ripristino.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * PERF (29/10/2026, owner «la foto in anticipo, in sottofondo all'inizio del giro», sessione Talos performance) — il punto di ripristino
 * si scatta MENTRE il modello pensa, non quando arriva la prima scrittura. Misura che l'ha chiesto: su un progetto grande la prima
 * scrittura del giro aspettava ~5,2 s di git (9 processi, `add -A`), in micro-scrittura con modello finto.
 * Fonti lette nel codice: OpenCode `packages/core/src/session/runner/step.ts:74-76` («The start snapshot only has to exist before local
 * tools run… so it is captured while the provider request is in flight instead of delaying it») e :112/:236 (gli attrezzi la
 * aspettano); Hermes `tools/checkpoint_manager.py:920-940` (`ensure_checkpoint`, una per turno, sincrona: il disegno di prima).
 *
 * Il git delle prove è quello VERO, attraverso un esecutore che conta le chiamate (stesso ambiente del modulo: archivio ombra,
 * indice suo, configurazione vuota), così si vede QUANTI processi aspetta la prima scrittura.
 */
function gitContato({ ritardoAddMs = 0 } = {}) {
  const chiamate = [];
  const esegui = ({ store, progetto, argomenti, indice, cwd }) => new Promise((esci) => {
    chiamate.push(argomenti[0]);
    const init = argomenti[0] === 'init';
    const env = {
      ...process.env,
      ...(init ? {} : { GIT_DIR: join(store, 'repo'), GIT_WORK_TREE: progetto }),
      ...(indice ? { GIT_INDEX_FILE: indice } : {}),
      GIT_CONFIG_GLOBAL: join(store, 'config-vuota'), GIT_CONFIG_SYSTEM: join(store, 'config-vuota'), GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@localhost.invalid', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@localhost.invalid',
    };
    const parti = () => execFile('git', ['-c', 'core.autocrlf=false', '-c', 'core.quotepath=false', ...argomenti], { cwd, env, encoding: 'buffer', windowsHide: true }, (e, stdout, stderr) => {
      esci({ codice: e ? (typeof e.code === 'number' ? e.code : -1) : 0, stdout: Buffer.from(stdout ?? ''), stderr: String(stderr ?? ''), assente: e?.code === 'ENOENT' });
    });
    if (argomenti[0] === 'add' && ritardoAddMs > 0) setTimeout(parti, ritardoAddMs); else parti();
  });
  return { esegui, chiamate };
}

async function banco(opzioni = {}) {
  const radice = await mkdtemp(join(tmpdir(), 'talos-anticipo-'));
  const progetto = join(radice, 'progetto');
  const dati = join(radice, 'dati');
  await mkdir(join(progetto, 'src'), { recursive: true });
  await writeFile(join(progetto, 'src', 'a.txt'), 'uno\n');
  const avvisi = [];
  const g = opzioni.git ?? gitContato(opzioni);
  const punti = creaPuntiDiRipristino({ cartellaDelloStore: async () => dati, eseguiGitFn: g.esegui, avvisa: (a) => avvisi.push(a) });
  return { radice, progetto, dati, punti, g, avvisi, via: () => rimuoviCartellaDiProvaAttesa(radice) };
}

test('ANT-01 la foto parte all\'inizio del giro: la prima scrittura, a foto finita, non aspetta nessun processo git', async () => {
  const b = await banco();
  try {
    assert.equal(typeof b.punti.anticipa, 'function', 'manca anticipa()');
    await b.punti.anticipa({ sessionId: 's1', turno: 1, progetto: b.progetto }).pronta;
    const prima = b.g.chiamate.length;
    const r = await b.punti.primaDiScrivere({ sessionId: 's1', turno: 1, progetto: b.progetto, percorso: 'src/a.txt' });
    assert.equal(r.fatto, true);
    assert.match(r.commit ?? '', /^[0-9a-f]{40}$/u);
    const durante = b.g.chiamate.slice(prima).filter((c) => c !== 'update-ref');
    assert.deepEqual(durante, [], `la prima scrittura ha aspettato git: ${durante.join(', ')}`);
    /* il punto c'è, ed è quello della foto in anticipo */
    const elenco = await b.punti.elenco({ sessionId: 's1', progetto: b.progetto });
    assert.equal(elenco.length, 1);
    assert.equal(elenco[0].turno, 1);
  } finally { await b.via(); }
});

test('ANT-02 la foto è lo stato di INIZIO giro: annullare il turno rimette il file com\'era quando il giro è partito', async () => {
  const b = await banco();
  try {
    await b.punti.anticipa({ sessionId: 's1', turno: 1, progetto: b.progetto }).pronta;
    await b.punti.primaDiScrivere({ sessionId: 's1', turno: 1, progetto: b.progetto, percorso: 'src/a.txt' });
    await writeFile(join(b.progetto, 'src', 'a.txt'), 'scritto da TALOS\n');
    await b.punti.dopoLaScrittura({ progetto: b.progetto, chiamante: 's1' });
    const r = await b.punti.ripristina({ sessionId: 's1', progetto: b.progetto, turno: 1 });
    assert.equal(r.ok ?? true, true, JSON.stringify(r).slice(0, 300));
    assert.equal(await readFile(join(b.progetto, 'src', 'a.txt'), 'utf8'), 'uno\n');
  } finally { await b.via(); }
});

test('ANT-03 una scrittura che arriva mentre la foto è ancora in corso la ASPETTA: una foto sola, e prima della scrittura', async () => {
  const b = await banco({ ritardoAddMs: 400 });
  try {
    const anticipo = b.punti.anticipa({ sessionId: 's1', turno: 1, progetto: b.progetto });
    const r = await b.punti.primaDiScrivere({ sessionId: 's1', turno: 1, progetto: b.progetto, percorso: 'src/a.txt' });
    assert.equal(r.fatto, true);
    await anticipo.pronta;
    assert.equal(b.g.chiamate.filter((c) => c === 'commit-tree').length, 1, `foto doppie: ${b.g.chiamate.join(',')}`);
    await writeFile(join(b.progetto, 'src', 'a.txt'), 'dopo\n');
    await b.punti.dopoLaScrittura({ progetto: b.progetto, chiamante: 's1' });
    await b.punti.ripristina({ sessionId: 's1', progetto: b.progetto, turno: 1 });
    assert.equal(await readFile(join(b.progetto, 'src', 'a.txt'), 'utf8'), 'uno\n', 'la foto deve essere di PRIMA della scrittura');
  } finally { await b.via(); }
});

test('ANT-04 al contrario: un giro che non scrive niente non lascia un punto («Annulla» non si offre su un turno senza modifiche)', async () => {
  const b = await banco();
  try {
    await b.punti.anticipa({ sessionId: 's1', turno: 1, progetto: b.progetto }).pronta;
    await b.punti.anticipa({ sessionId: 's1', turno: 2, progetto: b.progetto }).pronta;
    assert.deepEqual(await b.punti.elenco({ sessionId: 's1', progetto: b.progetto }), []);
    /* e la prima scrittura di un turno senza anticipo fa ancora la sua foto, come prima */
    const r = await b.punti.primaDiScrivere({ sessionId: 's1', turno: 3, progetto: b.progetto, percorso: 'src/a.txt' });
    assert.equal(r.fatto, true);
  } finally { await b.via(); }
});

test('ANT-05 git assente (Mobile, (g)): niente `init --bare` a ogni giro, un avviso solo per avvio; il punto dice perché', async () => {
  const chiamate = [];
  const assente = { chiamate, esegui: async ({ argomenti }) => { chiamate.push(argomenti[0]); return { codice: -1, stdout: Buffer.alloc(0), stderr: '', assente: true }; } };
  const b = await banco({ git: assente });
  try {
    for (const turno of [1, 2, 3]) {
      await b.punti.anticipa({ sessionId: 's1', turno, progetto: b.progetto }).pronta;
      const r = await b.punti.primaDiScrivere({ sessionId: 's1', turno, progetto: b.progetto, percorso: 'src/a.txt' });
      assert.equal(r.fatto, false);
      assert.equal(r.motivo, 'git-assente');
    }
    assert.equal(chiamate.filter((c) => c === 'init').length, 0, `init ritentato: ${chiamate.join(',')}`);
    assert.equal(chiamate.filter((c) => c === '--version').length, 1, 'la misura di git si fa una volta per avvio');
    assert.ok(b.avvisi.length <= 1, `avvisi ripetuti: ${JSON.stringify(b.avvisi)}`);
    const elenco = await b.punti.elenco({ sessionId: 's1', progetto: b.progetto });
    assert.equal(elenco.length, 3);
    assert.ok(elenco.every((p) => p.motivo === 'git-assente'));
  } finally { await b.via(); }
});

test('ANT-06 il file da scrivere cambiato DOPO la foto in anticipo (la persona, mentre il modello pensa): la foto si rifà, e annullare rimette la sua versione', async () => {
  const b = await banco();
  try {
    await b.punti.anticipa({ sessionId: 's1', turno: 1, progetto: b.progetto }).pronta;
    await new Promise((r) => setTimeout(r, 40));
    await writeFile(join(b.progetto, 'src', 'a.txt'), 'della persona\n');
    const r = await b.punti.primaDiScrivere({ sessionId: 's1', turno: 1, progetto: b.progetto, percorso: 'src/a.txt' });
    assert.equal(r.fatto, true);
    assert.equal(b.g.chiamate.filter((c) => c === 'commit-tree').length, 2, 'la foto vecchia non ha il file della persona');
    await writeFile(join(b.progetto, 'src', 'a.txt'), 'scritto da TALOS\n');
    await b.punti.dopoLaScrittura({ progetto: b.progetto, chiamante: 's1' });
    await b.punti.ripristina({ sessionId: 's1', progetto: b.progetto, turno: 1 });
    assert.equal(await readFile(join(b.progetto, 'src', 'a.txt'), 'utf8'), 'della persona\n');
  } finally { await b.via(); }
});

/* Revisione del Desktop 29/10: la finestra fra la foto di inizio giro e la scrittura copre il tempo in cui il modello pensa. */
async function scriveTalos(b, rel, testo) {
  const r = await b.punti.primaDiScrivere({ sessionId: 's1', turno: 1, progetto: b.progetto, percorso: rel });
  await writeFile(join(b.progetto, rel), testo);
  await b.punti.dopoLaScrittura({ progetto: b.progetto, chiamante: 's1' });
  return r;
}

test('ANT-07 la persona cambia un file mentre il modello pensa, poi TALOS lo modifica: annullare NON lo rimette e lo dice per nome; quello che nessuno ha toccato torna', async () => {
  const b = await banco();
  try {
    await writeFile(join(b.progetto, 'src', 'b.txt'), 'b di partenza\n');
    await b.punti.anticipa({ sessionId: 's1', turno: 1, progetto: b.progetto }).pronta;
    await new Promise((r) => setTimeout(r, 40));
    await writeFile(join(b.progetto, 'src', 'b.txt'), 'b della persona\n');
    assert.equal((await scriveTalos(b, 'src/a.txt', 'a di TALOS\n')).fatto, true);
    await scriveTalos(b, 'src/b.txt', 'b della persona\nriga di TALOS\n');
    const r = await b.punti.ripristina({ sessionId: 's1', progetto: b.progetto, turno: 1 });
    assert.equal(await readFile(join(b.progetto, 'src', 'a.txt'), 'utf8'), 'uno\n', 'il file che nessuno ha toccato torna');
    assert.equal(await readFile(join(b.progetto, 'src', 'b.txt'), 'utf8'), 'b della persona\nriga di TALOS\n', 'la modifica della persona non sparisce');
    assert.deepEqual(r.durante, ['src/b.txt']);
    assert.ok(r.saltati.includes('src/b.txt'));
  } finally { await b.via(); }
});

test('ANT-08 al contrario: TALOS scrive due volte lo stesso file senza che nessun altro lo tocchi, e annullare lo rimette', async () => {
  const b = await banco();
  try {
    await b.punti.anticipa({ sessionId: 's1', turno: 1, progetto: b.progetto }).pronta;
    await scriveTalos(b, 'src/a.txt', 'prima versione\n');
    await new Promise((r) => setTimeout(r, 40));
    await scriveTalos(b, 'src/a.txt', 'seconda versione\n');
    const r = await b.punti.ripristina({ sessionId: 's1', progetto: b.progetto, turno: 1 });
    assert.deepEqual(r.ripristinati, ['src/a.txt']);
    assert.deepEqual(r.durante, []);
    assert.equal(await readFile(join(b.progetto, 'src', 'a.txt'), 'utf8'), 'uno\n');
  } finally { await b.via(); }
});

test('ANT-09 la persona cambia fra due scritture di TALOS lo stesso file: annullare lo lascia com\'è', async () => {
  const b = await banco();
  try {
    await b.punti.anticipa({ sessionId: 's1', turno: 1, progetto: b.progetto }).pronta;
    await scriveTalos(b, 'src/a.txt', 'di TALOS\n');
    await writeFile(join(b.progetto, 'src', 'a.txt'), 'di TALOS\ndella persona\n');
    await scriveTalos(b, 'src/a.txt', 'di TALOS\ndella persona\nancora TALOS\n');
    const r = await b.punti.ripristina({ sessionId: 's1', progetto: b.progetto, turno: 1 });
    assert.deepEqual(r.durante, ['src/a.txt']);
    assert.equal(await readFile(join(b.progetto, 'src', 'a.txt'), 'utf8'), 'di TALOS\ndella persona\nancora TALOS\n');
  } finally { await b.via(); }
});

test('ANT-10 con la shell girata nel turno non si sa chi ha cambiato il file: si lascia com\'è, come «non di TALOS»', async () => {
  const b = await banco();
  try {
    await writeFile(join(b.progetto, 'src', 'b.txt'), 'b di partenza\n');
    await b.punti.anticipa({ sessionId: 's1', turno: 1, progetto: b.progetto }).pronta;
    await b.punti.primaDiScrivere({ sessionId: 's1', turno: 1, progetto: b.progetto, percorso: null });
    await new Promise((r) => setTimeout(r, 40));
    await writeFile(join(b.progetto, 'src', 'b.txt'), 'b scritto da un comando\n');
    await scriveTalos(b, 'src/b.txt', 'b scritto da un comando\npiù TALOS\n');
    const ant = await b.punti.anteprima({ sessionId: 's1', progetto: b.progetto, turno: 1 });
    assert.deepEqual(ant.salta.map((s) => [s.percorso, s.motivo, s.durante]), [['src/b.txt', 'non-di-talos', true]]);
  } finally { await b.via(); }
});
