import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { mondoPonteGit } from './aiuto/mondo-ponte-git.mjs';

import { iscriviConRigiocata } from '../src/iscrizione-sessione.mjs';
import { OPERAZIONI_HTTP, creaOperazioni } from '../src/remoto/operazioni.mjs';

/*
 * Revisione delle cure 4 del Mobile (D1, D2, D4, scelta 5): le rinomine si leggono dalla radice, sempre con il riconoscimento acceso, e un nome tocca l'altro in tutti e due i versi. Il contenuto
 *   che esce da un blocco per una rinomina resta bloccato: anche dalla sottocartella, dove `-- .` e `--relative` non mostrano il nome vecchio, e anche verso il modello.
 */
const BLOCCATO = { code: 'FOLDER_BLOCKED', stato: 409, reason: 'folder-blocked' };
const RISERVATO = 'RIGA-SEGRETA\n'.repeat(6);
const conSegreta = ({ dir, g, stato }) => {
  mkdirSync(join(dir, 'segreta'));
  writeFileSync(join(dir, 'segreta', 'k.txt'), RISERVATO); g(dir, 'add', '.'); g(dir, 'commit', '-q', '-m', 'segreta');
  stato.bloccate = [join(dir, 'segreta')];
};
const usciteInSottocartella = (t, registro = {}) => {
  const m = mondoPonteGit(t, { sotto: 'sub', registro });
  conSegreta(m);
  m.g(m.dir, 'mv', 'segreta/k.txt', 'sub/fuori.txt');
  return m;
};
const fotoDelRepository = ({ dir, g }) => `${g(dir, 'rev-parse', 'HEAD')}${g(dir, 'status', '--porcelain')}`;

test('RINOMINE-PONTE-01 D1: una rinomina che tocca un blocco vieta i due nomi, nei due versi del confronto', async (t) => {
  const m = mondoPonteGit(t);
  conSegreta(m);
  const { dir, g, op } = m;
  const prima = g(dir, 'rev-parse', 'HEAD').trim();
  g(dir, 'mv', 'segreta/k.txt', 'fuori.txt'); g(dir, 'commit', '-q', '-m', 'via');
  const dopo = g(dir, 'rev-parse', 'HEAD').trim();
  for (const [da, a] of [[prima, dopo], [dopo, prima]]) {
    for (const percorso of ['fuori.txt', 'segreta/k.txt']) await assert.rejects(op('changes-diff', { da, a, percorso }), BLOCCATO, `${da === prima ? 'diritto' : 'rovescio'} ${percorso}`);
  }
  await assert.rejects(op('changes-diff', { da: dopo, a: prima, percorso: 'fuori.txt', prima: 'segreta/k.txt' }), BLOCCATO);
  mkdirSync(join(dir, 'segreta'), { recursive: true });
  g(dir, 'mv', 'fuori.txt', 'segreta/torna.txt');
  await assert.rejects(op('diff', { percorso: 'fuori.txt', area: 'preparato' }), BLOCCATO, 'anche una rinomina che entra nel blocco');
  await assert.rejects(op('unstage', { corpo: { percorsi: ['fuori.txt'] } }), BLOCCATO);
});

for (const [nome, args] of [['diff', { percorso: 'fuori.txt', area: 'preparato' }], ['stage', { corpo: { percorsi: ['fuori.txt'] } }], ['unstage', { corpo: { percorsi: ['fuori.txt'] } }],
  ['commit', { corpo: { percorsi: ['fuori.txt'], messaggio: 'dal telefono' } }], ['discard', { corpo: { percorsi: ['fuori.txt'] }, confermata: true }],
  ['hunk', { corpo: { percorso: 'fuori.txt', area: 'preparato', indice: 0, impronta: 'x', azione: 'togli' } }]]) {
  test(`RINOMINE-PONTE-02 D2: dalla sottocartella il nome nuovo vale come quello vecchio, .${nome}`, async (t) => {
    const m = usciteInSottocartella(t);
    const foto = fotoDelRepository(m);
    await assert.rejects(m.op(nome, args), BLOCCATO);
    assert.equal(fotoDelRepository(m), foto, 'niente è cambiato');
  });
}

test('RINOMINE-PONTE-03 D2: `.changes-diff` dalla sottocartella, sul commit che ha portato fuori il file', async (t) => {
  const m = usciteInSottocartella(t);
  const { dir, g, op } = m;
  const prima = g(dir, 'rev-parse', 'HEAD').trim();
  g(dir, 'commit', '-q', '-m', 'via');
  const dopo = g(dir, 'rev-parse', 'HEAD').trim();
  await assert.rejects(op('changes-diff', { da: prima, a: dopo, percorso: 'fuori.txt' }), BLOCCATO);
  await assert.rejects(op('changes-diff', { a: dopo, percorso: 'fuori.txt' }), BLOCCATO, 'contro il padre');
  await assert.rejects(op('changes-diff', { da: dopo, a: prima, percorso: 'fuori.txt' }), BLOCCATO, 'e al rovescio');
});

test('RINOMINE-PONTE-04 D2: `.commit-message` dalla sottocartella non manda al modello il preparato con la rinomina dentro', async (t) => {
  const chieste = [];
  const m = usciteInSottocartella(t, { async chiediAllaSessione(_s, prompt) { chieste.push(String(prompt)); return { testo: 'messaggio', modello: 'finto' }; } });
  await assert.rejects(m.op('commit-message', { corpo: {} }), BLOCCATO);
  assert.deepEqual(chieste, [], 'il contenuto non è arrivato al modello');
});

test('RINOMINE-PONTE-05 D2: `.commit-staged` dalla sottocartella non chiude il preparato con la rinomina dentro', async (t) => {
  const m = usciteInSottocartella(t);
  const foto = fotoDelRepository(m);
  await assert.rejects(m.op('commit-staged', { corpo: { messaggio: 'dal telefono', impronta: (await m.op('status')).impronta } }), BLOCCATO);
  assert.equal(fotoDelRepository(m), foto);
});

test('RINOMINE-PONTE-06 D2, al contrario: una rinomina che non tocca un blocco, o che non riguarda la cartella, non ferma niente', async (t) => {
  const chieste = [];
  const m = mondoPonteGit(t, { sotto: 'sub', registro: { async chiediAllaSessione(_s, prompt) { chieste.push(String(prompt)); return { testo: 'messaggio', modello: 'finto' }; } } });
  conSegreta(m);
  const { dir, g, op } = m;
  g(dir, 'mv', 'altra/fuori.txt', 'sub/libero.txt');
  assert.equal((await op('diff', { percorso: 'libero.txt', area: 'preparato' })).percorso, 'libero.txt', 'una rinomina libera si legge');
  assert.equal((await op('commit-message', { corpo: {} })).messaggio, 'messaggio');
  assert.equal(chieste.length, 1);
  g(dir, 'reset', '-q', '--hard');
  g(dir, 'mv', 'segreta/k.txt', 'altra/uscita.txt');
  writeFileSync(join(dir, 'sub', 's.txt'), 'cambiato\n'); g(dir, 'add', 'sub/s.txt');
  assert.equal((await op('diff', { percorso: 's.txt', area: 'preparato' })).percorso, 's.txt', 'un file libero accanto a una rinomina altrove');
  assert.equal((await op('commit-message', { corpo: {} })).messaggio, 'messaggio', 'la rinomina sta tutta fuori dalla cartella: il modello non la vede');
  assert.equal(chieste.length, 2);
  assert.doesNotMatch(chieste[1], /RIGA-SEGRETA/u);
  await assert.rejects(op('commit-staged', { corpo: { messaggio: 'x', impronta: (await op('status')).impronta } }), { code: 'GIT_STAGED_OUTSIDE' }, 'e il commit del preparato resta rifiutato col suo codice');
});

for (const [chiave, valore] of [['status.renames', 'false'], ['diff.renames', 'false'], ['status.renames', 'copies'], ['diff.renames', 'copies'], ['diff.relative', 'true']]) {
  for (const sotto of [null, 'sub']) {
    test(`RINOMINE-PONTE-07 D4: ${chiave}=${valore} nel repository non nasconde la rinomina, ${sotto ? 'dalla sottocartella' : 'dalla radice'}`, async (t) => {
      const m = mondoPonteGit(t, { sotto });
      conSegreta(m);
      const { dir, g, op } = m;
      const prima = g(dir, 'rev-parse', 'HEAD').trim();
      g(dir, 'mv', 'segreta/k.txt', 'sub/fuori.txt');
      g(dir, 'config', chiave, valore);
      const percorso = sotto ? 'fuori.txt' : 'sub/fuori.txt';
      await assert.rejects(op('diff', { percorso, area: 'preparato' }), BLOCCATO);
      await assert.rejects(op('stage', { corpo: { percorsi: [percorso] } }), BLOCCATO);
      g(dir, 'commit', '-q', '-m', 'via');
      await assert.rejects(op('changes-diff', { da: prima, a: g(dir, 'rev-parse', 'HEAD').trim(), percorso }), BLOCCATO);
    });
  }
}

test('RINOMINE-PONTE-08 D4: il tetto di git sui file da confrontare non nasconde una rinomina modificata', async (t) => {
  const m = mondoPonteGit(t);
  conSegreta(m);
  const { dir, g, op } = m;
  writeFileSync(join(dir, 'altra', 'b.txt'), 'altra riga\n'.repeat(6)); g(dir, 'add', '.'); g(dir, 'commit', '-q', '-m', 'due');
  g(dir, 'mv', 'segreta/k.txt', 'nuova.txt'); g(dir, 'mv', 'altra/b.txt', 'nuova2.txt');
  writeFileSync(join(dir, 'nuova.txt'), `${RISERVATO}in più\n`); writeFileSync(join(dir, 'nuova2.txt'), `${'altra riga\n'.repeat(6)}in più\n`); g(dir, 'add', '.');
  g(dir, 'config', 'diff.renameLimit', '1'); g(dir, 'config', 'status.renameLimit', '1');
  await assert.rejects(op('diff', { percorso: 'nuova.txt', area: 'preparato' }), BLOCCATO);
});

test('RINOMINE-PONTE-09 scelta 5 tolta: oltre i 500 file un file libero si legge, e una rinomina oltre il tetto resta bloccata', async (t) => {
  const m = mondoPonteGit(t);
  conSegreta(m);
  const { dir, g, op } = m;
  const prima = g(dir, 'rev-parse', 'HEAD').trim();
  const molti = join(dir, 'molti');
  mkdirSync(molti);
  for (let i = 0; i < 510; i += 1) writeFileSync(join(molti, `f${i}.txt`), `file ${i}\n`);
  g(dir, 'mv', 'segreta/k.txt', 'zz-ultimo.txt');
  g(dir, 'add', '.'); g(dir, 'commit', '-q', '-m', 'tanti');
  const dopo = g(dir, 'rev-parse', 'HEAD').trim();
  assert.equal((await op('changes', { da: prima, a: dopo })).altri, true, 'il confronto supera il tetto');
  assert.equal((await op('changes-diff', { da: prima, a: dopo, percorso: 'molti/f7.txt' })).percorso, 'molti/f7.txt', 'il telefono non dice «cartella bloccata» su un file libero');
  await assert.rejects(op('changes-diff', { da: prima, a: dopo, percorso: 'zz-ultimo.txt' }), BLOCCATO, 'la riga oltre il tetto c\'è per il cancello');
});

const operazioniConLettore = ({ chiama, sessionRegistry, stato }, rinomineDi, rotte = []) => creaOperazioni({ chiama: (c) => { rotte.push(c.percorso); return chiama(c); }, sessionRegistry, iscriviConRigiocata,
  cartelle: { consentita: async () => stato.consentite === null, descrivi: async () => ({ cartellaId: 'c1', nome: 'A' }), elenco: async () => [] }, bloccateDi: async () => stato.bloccate, rinomineDi });

test('RINOMINE-PONTE-10 D2: una lettura delle rinomine per richiesta, non una per file, e nessuno stato in più', async (t) => {
  const m = mondoPonteGit(t);
  const { contesto, dir, g, stato } = m;
  stato.bloccate = [join(dir, 'segreta')];
  writeFileSync(join(dir, 'b.txt'), 'b\n'); writeFileSync(join(dir, 'c.txt'), 'c\n');
  const letture = [];
  const rotte = [];
  const operazioni = operazioniConLettore(m, async (q) => { letture.push(q); return { radiceRepo: dir, coppie: [] }; }, rotte);
  await operazioni.esegui('session.git.stage', { sessionId: 's1', corpo: { percorsi: ['a.txt', 'b.txt', 'c.txt'] } }, contesto);
  assert.equal(letture.length, 1);
  assert.equal(letture[0].sessionId, 's1');
  assert.deepEqual(rotte.filter((p) => /\/git\/(status|changes)/u.test(p)), [], 'solo la voce: il cancello non chiede più lo stato alla rotta');
  assert.match(g(dir, 'status', '--porcelain'), /^A {2}b\.txt$/mu);
});

test('RINOMINE-PONTE-11 D2: un guasto nel leggere le rinomine non fa uscire niente, dice il suo codice, e dopo la carta del consenso', async (t) => {
  const m = mondoPonteGit(t, { sotto: 'sub' });
  const { contesto, dir, stato } = m;
  stato.bloccate = [join(dir, 'segreta')];
  writeFileSync(join(dir, 'a.txt'), 'CAMBIATO\n');
  const operazioni = operazioniConLettore(m, async () => ({ erroreAvvio: 'guasto in C:\\Users\\Anna\\repo', code: 'GIT_TIMEOUT' }));
  const rifiuto = (e) => e.code === 'GIT_TIMEOUT' && e.stato === 504 && !/Anna/u.test(`${e.message}${e.explanation ?? ''}`);
  await assert.rejects(operazioni.esegui('session.git.diff', { sessionId: 's1', percorso: 's.txt', area: 'lavoro' }, contesto), rifiuto);
  await assert.rejects(operazioni.esegui('session.git.commit-message', { sessionId: 's1', corpo: {} }, contesto), rifiuto);
  stato.consentite = [];
  await assert.rejects(operazioni.esegui('session.git.stage', { sessionId: 's1', corpo: { percorsi: ['s.txt'] } }, contesto), { code: 'CONSENT_REQUIRED' });
});

test('RINOMINE-PONTE-12 D2: la lettura interna non ha una rotta: dal dispositivo non si chiede e non esce', () => {
  assert.equal(Object.values(OPERAZIONI_HTTP).some((v) => /rinomine/iu.test(String(v.percorso))), false);
  assert.doesNotMatch(readFileSync(new URL('../src/http-app.mjs', import.meta.url), 'utf8'), /rinomineDelRepository/u);
});

test('RINOMINE-PONTE-13 D2: il blocco e la cartella scritti attraverso una giunzione portano alla stessa rinomina', { skip: process.platform !== 'win32' }, async (t) => {
  const m = usciteInSottocartella(t);
  const { base, dir, op, sessionRegistry, stato } = m;
  const alias = join(base, 'alias');
  execFileSync('cmd', ['/c', 'mklink', '/J', alias, dir], { stdio: 'ignore' });
  const cartella = join(alias, 'sub');
  sessionRegistry.cartellaDi = () => cartella;
  sessionRegistry.cartellaPerChatFile = async () => ({ ok: true, cartella });
  stato.bloccate = [join(alias, 'segreta')];
  await assert.rejects(op('diff', { percorso: 'fuori.txt', area: 'preparato' }), BLOCCATO);
  await assert.rejects(op('commit-message', { corpo: {} }), BLOCCATO);
});

test('RINOMINE-PONTE-14 D2: una domanda storta dà lo stesso codice con e senza blocchi', async (t) => {
  const m = mondoPonteGit(t);
  const { base, dir, g, op, stato } = m;
  const a = g(dir, 'rev-parse', 'HEAD').trim();
  const codice = (args) => op('changes-diff', args).then(() => 'PASSA', (e) => `${e.code} ${e.stato}`);
  for (const args of [{ percorso: 'a.txt' }, { a }, { a: 'zz', percorso: 'a.txt' }, { a: 'f'.repeat(40), percorso: 'a.txt' }, { da: 'zz', a, percorso: 'a.txt' }, { a, percorso: '../x' }]) {
    stato.bloccate = [];
    const senza = await codice(args);
    stato.bloccate = [join(base, 'altrove')];
    assert.equal(await codice(args), senza, JSON.stringify(args));
    assert.notEqual(senza, 'PASSA', JSON.stringify(args));
  }
});

const mezzaPreparata = (t) => {
  const m = mondoPonteGit(t, { sotto: 'sub' });
  conSegreta(m);
  const { dir, g } = m;
  renameSync(join(dir, 'segreta', 'k.txt'), join(dir, 'sub', 'fuori.txt'));
  g(join(dir, 'sub'), 'add', '.');
  return m;
};

test('RINOMINE-PONTE-15 N1: `mv` normale e `git add` del nome nuovo: il contenuto non esce e il commit non si chiude', async (t) => {
  const m = mezzaPreparata(t);
  const foto = fotoDelRepository(m);
  await assert.rejects(m.op('diff', { percorso: 'fuori.txt', area: 'preparato' }), BLOCCATO);
  await assert.rejects(m.op('commit-message', { corpo: {} }), BLOCCATO);
  await assert.rejects(m.op('commit-staged', { corpo: { messaggio: 'dal telefono' } }), BLOCCATO);
  assert.equal(fotoDelRepository(m), foto, 'niente è cambiato');
});

test('RINOMINE-PONTE-16 N1: dal solo telefono, dopo un `mv` sul PC, il nome nuovo non si prepara', async (t) => {
  const m = mondoPonteGit(t, { sotto: 'sub' });
  conSegreta(m);
  renameSync(join(m.dir, 'segreta', 'k.txt'), join(m.dir, 'sub', 'fuori.txt'));
  m.g(m.dir, 'add', '-N', 'sub/fuori.txt');
  await assert.rejects(m.op('stage', { corpo: { percorsi: ['fuori.txt'] } }), BLOCCATO);
});

test('RINOMINE-PONTE-17 N2: mille nomi legati e cento percorsi non fermano il computer, e il nome legato resta fermo', async (t) => {
  const m = mondoPonteGit(t);
  const { contesto, dir, stato } = m;
  stato.bloccate = [join(dir, 'segreta')];
  const coppie = Array.from({ length: 1000 }, (_, i) => ({ prima: `segreta/n${i}.txt`, percorso: `legati/n${i}.txt` }));
  const operazioni = operazioniConLettore(m, async () => ({ radiceRepo: dir, coppie }));
  const percorsi = Array.from({ length: 100 }, (_, i) => `libero${i}.txt`);
  for (const p of percorsi) writeFileSync(join(dir, p), 'x\n');
  const inizio = performance.now();
  await operazioni.esegui('session.git.stage', { sessionId: 's1', corpo: { percorsi } }, contesto);
  assert.ok(performance.now() - inizio < 8000, 'prima della cura erano 80 s');
  await assert.rejects(operazioni.esegui('session.git.stage', { sessionId: 's1', corpo: { percorsi: ['libero1.txt', 'legati/n999.txt'] } }, contesto), BLOCCATO);
  await assert.rejects(operazioni.esegui('session.git.stage', { sessionId: 's1', corpo: { percorsi: ['legati'] } }, contesto), BLOCCATO, 'anche la cartella che lo contiene');
});

test('RINOMINE-PONTE-18 N2: venti blocchi e mille percorsi', async (t) => {
  const m = mondoPonteGit(t);
  const { dir, op, stato } = m;
  stato.bloccate = Array.from({ length: 20 }, (_, i) => join(dir, `fermo${i}`));
  const inizio = performance.now();
  await assert.rejects(op('stage', { corpo: { percorsi: [...Array.from({ length: 999 }, (_, i) => `assente${i}.txt`), 'fermo7/x.txt'] } }), BLOCCATO);
  assert.ok(performance.now() - inizio < 3000, 'prima della cura erano 7-8 s');
});

test('RINOMINE-PONTE-19 un blocco fuori dal repository non costa nessuna lettura delle rinomine', async (t) => {
  const m = mondoPonteGit(t);
  const { base, contesto, dir, stato } = m;
  writeFileSync(join(dir, 'a.txt'), 'cambiato\n');
  let riguarda = null;
  const operazioni = operazioniConLettore(m, async (q) => { riguarda = q.riguarda; return { radiceRepo: dir, coppie: [] }; });
  stato.bloccate = [join(base, 'altro-repository')];
  await operazioni.esegui('session.git.diff', { sessionId: 's1', percorso: 'a.txt', area: 'lavoro' }, contesto);
  assert.equal(riguarda(dir), false);
  stato.bloccate = [join(dir, 'segreta')];
  await operazioni.esegui('session.git.diff', { sessionId: 's1', percorso: 'a.txt', area: 'lavoro' }, contesto);
  assert.equal(riguarda(dir), true, 'al contrario: un blocco dentro il repository si legge');
});

test('RINOMINE-PONTE-20 D1: dodicimila rinomine libere e venti blocchi non costano un confronto per coppia', async (t) => {
  const m = mondoPonteGit(t);
  const { contesto, dir, stato } = m;
  stato.bloccate = Array.from({ length: 20 }, (_, i) => join(dir, `fermo${i}`));
  writeFileSync(join(dir, 'a.txt'), 'cambiato\n');
  const coppie = Array.from({ length: 12_000 }, (_, i) => ({ prima: `vecchi/n${i}.txt`, percorso: `nuovi/n${i}.txt` }));
  const operazioni = operazioniConLettore(m, async () => ({ radiceRepo: dir, coppie }));
  const inizio = performance.now();
  await operazioni.esegui('session.git.diff', { sessionId: 's1', percorso: 'a.txt', area: 'lavoro' }, contesto);
  assert.ok(performance.now() - inizio < 1500, 'prima della cura 6000 rinomine costavano 2 s');
});
