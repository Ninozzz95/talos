import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { creaPuntiDiRipristino } from '../src/punti-di-ripristino.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * PERF 29/10/2026 (sessione Talos performance, revisione del Desktop) — l'indice della foto resta fra una foto e l'altra e si riallinea
 * con `read-tree -m <base>`: la fusione a un albero tiene le date dei file che non sono cambiati, così `add -A` rilegge solo i file
 * cambiati invece di tutto il progetto. Prima ogni foto cancellava l'indice e rifaceva `read-tree` senza `-m` (date perse ⇒ ogni file
 * riletto); Hermes fa lo stesso (`tools/checkpoint_manager.py`, `_take`, righe 21-60 della funzione: «Reset index to current ref tip»).
 * ⛔ La trappola di tenere le date è il «racy git»: un file cambiato nello stesso istante in cui l'indice è stato scritto deve essere
 * riletto lo stesso. Le prove la cercano apposta.
 */
function gitSpia({ primaDiAdd = null } = {}) {
  const chiamate = [];
  const envDi = ({ store, progetto, indice, argomenti }) => ({
    ...process.env,
    ...(argomenti?.[0] === 'init' ? {} : { GIT_DIR: join(store, 'repo'), GIT_WORK_TREE: progetto }),
    ...(indice ? { GIT_INDEX_FILE: indice } : {}),
    GIT_CONFIG_GLOBAL: join(store, 'config-vuota'), GIT_CONFIG_SYSTEM: join(store, 'config-vuota'), GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@localhost.invalid', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@localhost.invalid',
  });
  const corri = (a, argomenti, cwd) => new Promise((esci) => execFile('git', ['-c', 'core.autocrlf=false', '-c', 'core.quotepath=false', ...argomenti],
    { cwd, env: envDi({ ...a, argomenti }), encoding: 'buffer', windowsHide: true },
    (e, stdout, stderr) => esci({ codice: e ? (typeof e.code === 'number' ? e.code : -1) : 0, stdout: Buffer.from(stdout ?? ''), stderr: String(stderr ?? ''), assente: e?.code === 'ENOENT' })));
  const esegui = async (a) => {
    chiamate.push(a.argomenti.join(' '));
    if (a.argomenti[0] === 'add' && primaDiAdd) await primaDiAdd((argomenti) => corri(a, argomenti, a.cwd));
    return corri(a, a.argomenti, a.cwd);
  };
  return { esegui, chiamate };
}

async function banco(spia) {
  const radice = await mkdtemp(join(tmpdir(), 'talos-indice-'));
  const progetto = join(radice, 'progetto');
  await mkdir(join(progetto, 'src'), { recursive: true });
  await writeFile(join(progetto, 'src', 'a.txt'), 'uno\n');
  await writeFile(join(progetto, 'src', 'b.txt'), 'bbbb\n');
  const punti = creaPuntiDiRipristino({ cartellaDelloStore: async () => join(radice, 'dati'), eseguiGitFn: spia.esegui });
  const foto = (turno) => punti.primaDiScrivere({ sessionId: 's1', turno, progetto, percorso: null });
  return { radice, progetto, punti, foto, via: () => rimuoviCartellaDiProvaAttesa(radice) };
}

test('IDX-01 un file che nessuno tocca tiene le sue date nell\'indice fra una foto e l\'altra (add -A non lo rilegge)', async () => {
  const viste = [];
  const spia = gitSpia({
    primaDiAdd: async (git) => {
      const r = await git(['ls-files', '--debug', '--', 'src/b.txt']);
      viste.push(/mtime: (\d+):/u.exec(r.stdout.toString('utf8'))?.[1] ?? null);
    },
  });
  const b = await banco(spia);
  try {
    assert.equal((await b.foto(1)).fatto, true);
    await writeFile(join(b.progetto, 'src', 'a.txt'), 'due\n');
    assert.equal((await b.foto(2)).fatto, true);
    /* alla prima foto l'indice è nuovo (niente); alla seconda b.txt deve arrivare ad `add` con la sua data, non con zero */
    assert.equal(viste.length, 2);
    assert.notEqual(viste[1], null, 'b.txt non è nell\'indice prima di add');
    assert.notEqual(viste[1], '0', 'le date di b.txt sono andate perse: add -A rilegge tutto il progetto');
    assert.ok(spia.chiamate.some((c) => c.startsWith('read-tree -m ')), `niente read-tree -m: ${spia.chiamate.join(' | ')}`);
  } finally { await b.via(); }
});

test('IDX-02 data cambiata ma contenuto uguale: nessuna foto nuova (stesso albero, stesso punto)', async () => {
  const spia = gitSpia();
  const b = await banco(spia);
  try {
    const r1 = await b.foto(1);
    const dopo = new Date(Date.now() + 5_000);
    await utimes(join(b.progetto, 'src', 'b.txt'), dopo, dopo);
    const r2 = await b.foto(2);
    assert.equal(r2.commit, r1.commit);
    assert.equal(spia.chiamate.filter((c) => c.startsWith('commit-tree')).length, 1);
  } finally { await b.via(); }
});

test('IDX-03 racy git: un file cambiato con la STESSA data e la stessa misura subito dopo la foto si rilegge lo stesso', async () => {
  const spia = gitSpia();
  const b = await banco(spia);
  try {
    const file = join(b.progetto, 'src', 'b.txt');
    /* una data a secondo intero, uguale prima e dopo: niente decimali che la facciano sembrare cambiata. ⛔ 30/10 (Desktop: 1 caduta su
       3 nella suite a 8 in parallelo): con la data di ADESSO il caso è «racy» solo se l'indice si scrive nello stesso secondo, e sotto carico
       la foto lo scavalca. Il racy git vale per ogni voce con data >= quella dell'indice ⇒ una data 5 s nel futuro lo rende certo a ogni carico. */
    const t = Math.floor(Date.now() / 1000) + 5;
    await utimes(file, t, t);
    const r1 = await b.foto(1);
    assert.equal((await stat(file)).mtimeMs, t * 1000);
    /* stessa misura (5 byte), stessa data esatta che la foto ha visto: solo il contenuto dice che è cambiato */
    await writeFile(file, 'cccc\n');
    await utimes(file, t, t);
    const r2 = await b.foto(2);
    assert.notEqual(r2.commit, r1.commit, 'il cambio non è entrato nella foto: date tenute senza la difesa del racy git');
    await writeFile(file, 'di TALOS\n');
    await b.punti.dopoLaScrittura({ progetto: b.progetto, chiamante: 's1' });
    /* e la foto 2 ha davvero «cccc» */
    const ant = await b.punti.anteprima({ sessionId: 's1', progetto: b.progetto, turno: 2 });
    assert.match(ant.diff, /-di TALOS|\+di TALOS/u);
    assert.match(ant.diff, /cccc/u);
  } finally { await b.via(); }
});

test('IDX-04 un indice rovinato non ferma la foto: si rifà da capo', async () => {
  const spia = gitSpia();
  const b = await banco(spia);
  try {
    await b.foto(1);
    const { readdir } = await import('node:fs/promises');
    const cartellaIndici = join(b.radice, 'dati', 'indici');
    for (const f of await readdir(cartellaIndici)) if (f.endsWith('-foto.index')) await writeFile(join(cartellaIndici, f), 'rotto');
    await writeFile(join(b.progetto, 'src', 'a.txt'), 'tre\n');
    const r = await b.foto(2);
    assert.equal(r.fatto, true);
    await writeFile(join(b.progetto, 'src', 'a.txt'), 'di TALOS\n');
    await b.punti.dopoLaScrittura({ progetto: b.progetto, chiamante: 's1' });
    assert.equal(await readFile(join(b.progetto, 'src', 'a.txt'), 'utf8'), 'di TALOS\n');
  } finally { await b.via(); }
});
