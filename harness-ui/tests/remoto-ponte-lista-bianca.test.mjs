import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { contestoDelDispositivo, mondoPonteGit } from './aiuto/mondo-ponte-git.mjs';

import { iscriviConRigiocata } from '../src/iscrizione-sessione.mjs';
import { indirizzoPerIlDispositivo, indirizziPerIlDispositivo } from '../src/remoto/indirizzo-git.mjs';
import { FILTRI_GIT, R, codiciDellaVoce, pesoSulFilo, rifiutoPerIlDispositivo, testoDentroIByte, tieni } from '../src/remoto/lista-bianca.mjs';
import { LETTURE_DEL_CONTRATTO, OPERAZIONI_HTTP, VOCI_DEL_CONTRATTO, creaOperazioni } from '../src/remoto/operazioni.mjs';
import { codifica } from '../src/remoto/filo.mjs';
import { RISPOSTE_NON_RICORDATE, motivoPerIlTelefono } from '../src/remoto/servizio.mjs';

/*
 * Il ponte a lista bianca (contratto `CONTRATTO-LISTA-BIANCA-PONTE-2026-10-31.md`, revisione del Mobile al blocco 15): repository e rotte veri, tranne dove il finto serve a far uscire un
 *   campo che il PC oggi non ha.
 */
const contesto = contestoDelDispositivo();
const bancoFinto = (dati, { chiamaFinta = null, cartelle = null, bloccateDi = null, registro = {} } = {}) => creaOperazioni({
  chiama: chiamaFinta ?? (async () => ({ stato: 200, dati })), iscriviConRigiocata,
  sessionRegistry: { esiste: () => true, cartellaDi: () => 'C:\\progetto', async cartellaPerChatFile() { return { ok: true, cartella: 'C:\\progetto' }; }, ...registro },
  cartelle: cartelle ?? { consentita: async () => true, descrivi: async () => ({ cartellaId: 'c1', nome: 'progetto', segreto: 'no' }), elenco: async () => [] }, bloccateDi });
const visto = async (op, extra = {}) => {
  const sync = await op('sync');
  return { ramo: sync.ramo, remoto: sync.riferimento?.remoto ?? sync.remotoPerInvio, urlInvio: sync.urlInvio, destinazione: sync.destinazione, commit: (await op('log')).testa, ...extra };
};

test('LISTA-01 punto 1: la carta di «annulla un pezzo» non si salta con un altro tipo', async (t) => {
  const { dir, op } = mondoPonteGit(t);
  writeFileSync(join(dir, 'a.txt'), 'uno\ndue cambiato\ntre\n');
  const diff = await op('diff', { percorso: 'a.txt', area: 'lavoro' });
  const corpo = { percorso: 'a.txt', area: 'lavoro', indice: 0, impronta: diff.impronta };
  await assert.rejects(op('hunk', { corpo: { ...corpo, azione: 'annulla' } }), { code: 'CONFIRMATION_REQUIRED', stato: 409 });
  for (const azione of [['annulla'], ['prepara'], { toString: 'annulla' }, 7, null, undefined, 'ANNULLA']) {
    await assert.rejects(op('hunk', { corpo: { ...corpo, azione } }), { code: 'BAD_MESSAGE', stato: 400 }, JSON.stringify(azione));
  }
  assert.equal(readFileSync(join(dir, 'a.txt'), 'utf8'), 'uno\ndue cambiato\ntre\n', 'il lavoro resta');
  const preparato = await op('hunk', { corpo: { ...corpo, azione: 'prepara' } });
  assert.equal(preparato.ok, true, 'preparare non vuole la carta');
});

test('LISTA-02 punti 5 e 7: gli indirizzi, forma per forma', () => {
  for (const [dentro, fuori] of [
    ['https://x:tok@host.invalid/a.git?t=1#z', 'https://host.invalid/a.git'],
    ['ssh://git@host.invalid/a/b.git', 'ssh://host.invalid/a/b.git'],
    ['git+https://u:p@host.invalid/a.git', 'git+https://host.invalid/a.git'],
    ['git@github.com:a/b.git', 'git@github.com:a/b.git'],
    ['s3cr3t@example.invalid:o/r.git', 'example.invalid:o/r.git'],
    ['utente:tok@example.invalid:o/r.git', 'example.invalid:o/r.git'],
    ['github.com:a/b.git', 'github.com:a/b.git'],
  ]) assert.equal(indirizzoPerIlDispositivo(dentro), fuori, dentro);
  for (const locale of ['C:/Users/Anna Maria/r.git', 'C:\\Users\\Mario D\'Angelo\\r.git', '//server/share/r.git', '\\\\server\\share\\r.git', '/home/mario/r.git', './r.git', '../r.git',
    'cartella/r:x.git', 'file:///C:/Users/x/r.git', 'FILE:///home/x/r.git']) {
    const fuori = indirizzoPerIlDispositivo(locale);
    assert.match(fuori, /^…\/[^/\\]+#[0-9a-f]{8}$/u, locale);
    assert.doesNotMatch(fuori, /Users|home|Anna|Angelo|server/u, locale);
  }
  assert.notEqual(indirizzoPerIlDispositivo('C:/a/r.git'), indirizzoPerIlDispositivo('C:/b/r.git'), 'due cartelle col nome uguale non sono la stessa destinazione');
  assert.match(indirizzoPerIlDispositivo('ext::sh -c "curl -H s3cr3t example.invalid"'), /^ext::#[0-9a-f]{8}$/u);
  assert.match(indirizzoPerIlDispositivo('ftp://u:p@host.invalid/a.git'), /^…#[0-9a-f]{8}$/u, 'uno schema non elencato non esce');
  assert.equal(indirizzoPerIlDispositivo(null), null);
  assert.equal(indirizziPerIlDispositivo(['https://a.invalid/x', 'git@b.invalid:y']), 'https://a.invalid/x, git@b.invalid:y');
  assert.equal(indirizziPerIlDispositivo([]), null);
});

test('LISTA-03 punto 5: un campo che il PC aggiunge non esce, un percorso assoluto non è mai relativo', async () => {
  const operazioni = bancoFinto({ ramo: 'main', staccata: false, cartellaEradiceRepo: false, radiceRepo: 'C:\\Users\\Anna Maria\\p', prefisso: 'Anna/', nuovo: 'C:\\Users\\Anna\\x' });
  assert.deepEqual(await operazioni.esegui('session.git.branch', { sessionId: 's1' }, contesto), { ramo: 'main', staccata: false, cartellaEradiceRepo: false });
  assert.equal(tieni({ a: { b: 1 } }, { a: () => undefined }).a, undefined);
  for (const assoluto of ['C:\\x', 'C:/x', '/home/x', '\\\\s\\x']) assert.equal(R(assoluto), undefined, assoluto);
  assert.equal(R('.claude/tmp/b.md'), '.claude/tmp/b.md');
  assert.equal(R(null), null);
  const stato = await bancoFinto({ voci: [{ percorso: 'a.txt', percorsoRepo: 'sub/a.txt', tipo: 'modificato', extra: 'x' }, { percorso: 'C:\\Users\\x\\a.txt', tipo: 'modificato' }], riepilogo: { totale: 2, altro: 1 }, base: null, radiceRepo: 'C:\\x' })
    .esegui('session.git.status', { sessionId: 's1' }, contesto);
  assert.deepEqual(stato.voci, [{ percorso: 'a.txt', tipo: 'modificato' }, { tipo: 'modificato' }]);
  assert.deepEqual(stato.riepilogo, { totale: 2 });
  assert.equal(Object.hasOwn(stato, 'radiceRepo'), false);
});

test('LISTA-04 punto 5: da una sottocartella nessuna risposta porta il repository o la cartella del PC', async (t) => {
  const { base, cartella, op } = mondoPonteGit(t, { sotto: 'sub' });
  writeFileSync(join(cartella, 's.txt'), 'cambiato\n');
  const riposte = [await op('status'), await op('branch'), await op('sync'), await op('remotes'), await op('log'), await op('branches'), await op('stashes'), await op('diff', { percorso: 's.txt', area: 'lavoro' })];
  for (const r of riposte) for (const forma of [base.replaceAll('\\', '/'), JSON.stringify(base).slice(1, -1)]) assert.equal(JSON.stringify(r).includes(forma), false, JSON.stringify(r).slice(0, 200));
  const [stato] = riposte;
  assert.deepEqual(Object.keys(stato).sort(), ['base', 'cartellaEradiceRepo', 'impronta', 'preparatiFuori', 'riepilogo', 'troncato', 'voci']);
  assert.deepEqual(Object.keys(stato.voci[0]).sort(), ['aggiunte', 'cartella', 'conflitto', 'da', 'nonStaged', 'percorso', 'repoAnnidato', 'rimozioni', 'staged', 'tipo', 'x', 'y']);
});

test('LISTA-05 D-48: i percorsi del repository escono com\'è, e stage e diff li ritrovano', async (t) => {
  const { dir, op } = mondoPonteGit(t);
  const percorsi = ['.claude/tmp/b.md', '.github/a.txt', 'app/(marketing)/home/page.tsx', 'app/[locale]/page.tsx', 'routes/+layout/d.ts', 'src/@types/x.ts'];
  for (const p of percorsi) { mkdirSync(join(dir, p, '..'), { recursive: true }); writeFileSync(join(dir, p), 'x\n'); }
  await op('stage', { corpo: { percorsi } }).then((r) => assert.deepEqual([...r.percorsi].sort(), [...percorsi].sort()));
  await op('commit-staged', { corpo: { messaggio: 'tutti', impronta: (await op('status')).impronta } });
  for (const p of percorsi) writeFileSync(join(dir, p), 'y\n');
  const stato = await op('status');
  assert.deepEqual(stato.voci.map((v) => v.percorso).sort(), [...percorsi].sort());
  for (const v of stato.voci) assert.equal((await op('diff', { percorso: v.percorso, area: 'lavoro' })).percorso, v.percorso);
});

test('LISTA-06 punto 4: l\'invio parte solo verso ciò che la carta ha mostrato', async (t) => {
  const { base, dir, g, op, remoto } = mondoPonteGit(t);
  const altro = join(base, 'altro.git');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', altro]);
  writeFileSync(join(dir, 'n.txt'), 'x\n'); g(dir, 'add', 'n.txt'); g(dir, 'commit', '-q', '-m', 'nuovo');
  const carta = await visto(op);
  assert.match(carta.urlInvio, /^…\/remoto\.git#[0-9a-f]{8}$/u);
  assert.equal(carta.destinazione, 'main');

  g(dir, 'remote', 'set-url', '--push', 'origin', altro);
  await assert.rejects(op('push', { corpo: {}, confermata: true, visto: carta }), (e) => e.code === 'GIT_PUSH_CHANGED' && e.stato === 409 && e.reason === 'push-changed' && /altro\.git/u.test(e.params.urlInvio));
  assert.equal(g(dir, 'ls-remote', altro).trim(), '', 'sul remoto mai mostrato non è partito niente');
  g(dir, 'remote', 'set-url', '--delete', '--push', 'origin', altro.replaceAll('\\', '\\\\'));

  g(dir, 'switch', '-q', '-c', 'feat'); g(dir, 'push', '-q', '-u', 'origin', 'feat');
  writeFileSync(join(dir, 'f.txt'), 'x\n'); g(dir, 'add', 'f.txt'); g(dir, 'commit', '-q', '-m', 'su feat');
  const suFeat = await visto(op);
  assert.equal(suFeat.destinazione, 'feat');
  g(dir, 'config', 'branch.feat.merge', 'refs/heads/main');
  await assert.rejects(op('push', { corpo: {}, confermata: true, visto: suFeat }), (e) => e.code === 'GIT_PUSH_CHANGED' && e.params.destinazione === 'main');
  assert.notEqual(g(dir, 'rev-parse', 'HEAD').trim(), execFileSync('git', ['--git-dir', remoto, 'rev-parse', 'main'], { encoding: 'utf8' }).trim(), 'su main non è arrivato feat');
});

test('LISTA-07 punto 4: un remoto con due indirizzi d\'invio li mostra e li confronta tutti', async (t) => {
  const { base, dir, g, op, remoto } = mondoPonteGit(t);
  const secondo = join(base, 'secondo.git'); const terzo = join(base, 'terzo.git');
  for (const b of [secondo, terzo]) execFileSync('git', ['init', '-q', '--bare', '-b', 'main', b]);
  g(dir, 'remote', 'set-url', '--add', '--push', 'origin', remoto); g(dir, 'remote', 'set-url', '--add', '--push', 'origin', secondo);
  writeFileSync(join(dir, 'n.txt'), 'x\n'); g(dir, 'add', 'n.txt'); g(dir, 'commit', '-q', '-m', 'nuovo');
  const carta = await visto(op);
  assert.match(carta.urlInvio, /remoto\.git#[0-9a-f]{8}, …\/secondo\.git#[0-9a-f]{8}$/u);
  assert.equal((await op('remotes')).remoti[0].urlInvio, carta.urlInvio, 'la riga del remoto dice lo stesso');
  g(dir, 'remote', 'set-url', '--add', '--push', 'origin', terzo);
  await assert.rejects(op('push', { corpo: {}, confermata: true, visto: carta }), { code: 'GIT_PUSH_CHANGED' });
});

test('LISTA-08 punto 4: parte il commit mostrato, e pubblicare imposta il tracciamento', async (t) => {
  const { dir, g, op, remoto } = mondoPonteGit(t);
  g(dir, 'switch', '-q', '-c', 'nuovo');
  writeFileSync(join(dir, 'n.txt'), 'x\n'); g(dir, 'add', 'n.txt'); g(dir, 'commit', '-q', '-m', 'mostrato');
  const carta = await visto(op);
  const esito = await op('push', { corpo: {}, confermata: true, visto: carta });
  assert.deepEqual([esito.ok, esito.pubblicato, esito.remoto], [true, true, 'origin']);
  assert.equal(execFileSync('git', ['--git-dir', remoto, 'rev-parse', 'nuovo'], { encoding: 'utf8' }).trim(), carta.commit);
  assert.equal(g(dir, 'rev-parse', '--abbrev-ref', '@{u}').trim(), 'origin/nuovo');
  assert.equal(Object.hasOwn(esito, 'esiti'), false);
  const niente = await op('push', { corpo: {}, confermata: true, visto: await visto(op) });
  assert.equal(niente.nienteDaInviare, true);
});

test('LISTA-12 punto 4: un commit nato fra il confronto e l\'invio non parte', async (t) => {
  let dir = null; let nato = false;
  const eseguiGitFn = async (cartella, argomenti) => {
    if (argomenti.includes('push') && !nato && dir) {
      nato = true;
      writeFileSync(join(dir, 'dopo.txt'), 'nato dopo\n');
      for (const a of [['add', 'dopo.txt'], ['commit', '-q', '-m', 'nato dopo la carta']]) execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
    }
    const r = spawnSync('git', argomenti, { cwd: cartella, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    return { codice: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  };
  const m = mondoPonteGit(t, { eseguiGitFn });
  writeFileSync(join(m.dir, 'n.txt'), 'x\n'); m.g(m.dir, 'add', 'n.txt'); m.g(m.dir, 'commit', '-q', '-m', 'mostrato');
  const carta = await visto(m.op);
  dir = m.dir;
  const esito = await m.op('push', { corpo: {}, confermata: true, visto: carta });
  assert.equal(esito.ok, true);
  assert.equal(execFileSync('git', ['--git-dir', m.remoto, 'rev-parse', 'main'], { encoding: 'utf8' }).trim(), carta.commit, 'sul remoto c\'è il commit mostrato, non quello nato dopo');
});

test('LISTA-09 errori: al dispositivo codice, stato e parametri controllati, mai il testo del PC', async () => {
  const fallisce = (e) => bancoFinto(null, { chiamaFinta: async () => { throw Object.assign(new Error('Cannot read C:\\Users\\Mario Rossi\\x'), e); } });
  await assert.rejects(fallisce({ code: 'GIT_CONFLICTS', stato: 409, explanation: 'C:\\Users\\Mario Rossi\\y', reason: 'r-1', params: { nome: 'C:\\Users\\x' } }).esegui('session.git.discard', { sessionId: 's1', corpo: {}, confermata: true }, contesto),
    (e) => e.code === 'GIT_CONFLICTS' && e.stato === 409 && e.message === 'The computer refused this action.' && e.explanation === undefined && e.params === undefined && e.reason === 'r-1');
  await assert.rejects(fallisce({ code: 'INTERNAL_ERROR', stato: 500 }).esegui('session.git.status', { sessionId: 's1' }, contesto),
    (e) => e.code === 'OPERATION_FAILED' && e.stato === 500 && e.message === 'The computer could not complete this action.');
  await assert.rejects(fallisce({ code: 'PAYLOAD_TOO_BIG', stato: 413 }).esegui('session.git.stage', { sessionId: 's1', corpo: {} }, contesto),
    (e) => e.code === 'OPERATION_FAILED' && e.stato === 413, 'un rifiuto fuori elenco resta un rifiuto');
  await assert.rejects(fallisce({ code: 'GIT_CONFLICTS', stato: 409 }).esegui('session.git.status', { sessionId: 's1' }, contesto), { code: 'OPERATION_FAILED' }, 'un codice che quella voce non ha non esce');
  const e = rifiutoPerIlDispositivo('session.git.push', { code: 'GIT_PUSH_CHANGED', stato: 409, params: { ramo: 'a', commit: 'b', urlInvio: 'u', altro: 'x', remoto: 7 } }, (x) => x.stato);
  assert.deepEqual(e.params, { ramo: 'a', urlInvio: 'u', commit: 'b' });
  for (const voce of VOCI_DEL_CONTRATTO) assert.ok(codiciDellaVoce(voce).has('OPERATION_FAILED'), voce);
  assert.ok(codiciDellaVoce('session.git.push').has('GIT_BEHIND'));
  assert.equal(codiciDellaVoce('session.git.stage').has('GIT_BEHIND'), false);
});

test('LISTA-10 D-45: una scrittura eseguita non risponde mai 413', async () => {
  const rami = Array.from({ length: 12_000 }, (_, i) => ({ nome: `ramo-molto-lungo-numero-${i}-${'x'.repeat(60)}`, commit: 'abc1234', riferimento: null, corrente: false }));
  const r = await bancoFinto({ ok: true, rami }).esegui('session.git.branch-delete', { sessionId: 's1', confermata: true, corpo: {} }, contesto);
  assert.equal(r.ok, true);
  assert.equal(r.troncato, true);
  assert.ok(r.rami.length > 0 && r.rami.length < rami.length);
  const voci = Array.from({ length: 30_000 }, (_, i) => ({ percorso: `cartella/lunga/${i}/${'y'.repeat(40)}.txt` }));
  const accantonati = Array.from({ length: 30_000 }, (_, i) => ({ indice: i, commit: 'c'.repeat(40), data: 'd', messaggio: 'z'.repeat(60) }));
  const grande = await bancoFinto({ ok: true, accantonati, stato: { voci, riepilogo: { totale: 30_000 } } }).esegui('session.git.stash', { sessionId: 's1', corpo: {} }, contesto).catch((e) => e);
  assert.ok(Buffer.byteLength(JSON.stringify(grande)) <= 1024 * 1024);
  assert.equal(grande.ok, true);
  const enorme = await bancoFinto({ ok: true, percorsi: Array.from({ length: 40_000 }, (_, i) => `a/${i}/${'b'.repeat(40)}`) }).esegui('session.git.stage', { sessionId: 's1', corpo: {} }, contesto);
  assert.deepEqual(enorme, { ok: true, ridotta: true }, 'si dice che è andata, e il dispositivo rilegge');
  const letto = await bancoFinto({ ok: true, percorsi: ['a'] }).esegui('session.git.stage', { sessionId: 's1', corpo: {} }, contesto);
  assert.equal(Object.hasOwn(letto, 'ridotta'), false);
});

test('LISTA-11 ogni lettura del contratto ha il suo filtro, e non resta nella memoria delle risposte', () => {
  for (const voce of VOCI_DEL_CONTRATTO) {
    if (Object.hasOwn(OPERAZIONI_HTTP, voce) && !['session.research.export', 'session.library.fetch'].includes(voce)) assert.equal(typeof OPERAZIONI_HTTP[voce].filtra, 'function', voce);
  }
  for (const voce of LETTURE_DEL_CONTRATTO) assert.ok(RISPOSTE_NON_RICORDATE.has(voce), voce);
  assert.ok(LETTURE_DEL_CONTRATTO.has('session.git.log'));
  assert.equal(RISPOSTE_NON_RICORDATE.has('session.git.push'), false, 'un\'azione si ricorda');
});

test('LISTA-13 M4: parola e gettone non escono in nessuna forma, e il confronto resta sulla forma pulita', () => {
  for (const [grezzo, atteso] of [
    ['u:s3cr3t@example.invalid:r.git', 'example.invalid:r.git'],
    ['ab:s3cr3t@example.invalid:o/r.git', 'example.invalid:o/r.git'],
    ['s3cr3t@example.invalid:o/r.git', 'example.invalid:o/r.git'],
    ['git:s3cr3t@example.invalid:r.git', 'example.invalid:r.git'],
    ['u:par/ola@example.invalid:r.git', 'example.invalid:r.git'],
    ['git@example.invalid:o/r.git?token=s3cr3t', 'git@example.invalid:o/r.git'],
    ['git@example.invalid:o/r.git#s3cr3t', 'git@example.invalid:o/r.git'],
    ['example.invalid:o/r.git?token=s3cr3t', 'example.invalid:o/r.git'],
    ['u:s3cr3t@example.invalid:o/r.git?token=s3cr3t', 'example.invalid:o/r.git'],
  ]) assert.equal(indirizzoPerIlDispositivo(grezzo), atteso, grezzo);
  const pulito = indirizzoPerIlDispositivo('file:///x/r.git');
  assert.match(pulito, /^…\/r\.git#[0-9a-f]{8}$/u);
  assert.equal(indirizzoPerIlDispositivo('file:///x/r.git?token=s3cr3t'), pulito, 'la query non conta nel confronto');
  assert.equal(indirizzoPerIlDispositivo('file:///x/r.git#s3cr3t'), pulito);
  assert.equal(indirizzoPerIlDispositivo('git@h.invalid:r.git?token=uno'), indirizzoPerIlDispositivo('git@h.invalid:r.git?token=due'));
  for (const grezzo of ['https:u:s3cr3t@example.invalid/x', 'u:s3cr3t@example.invalid', 'C:\\x\\r.git?token=s3cr3t', '//u:s3cr3t@server', '../u:s3cr3t@server', '/x/r.git#s3cr3t']) {
    assert.doesNotMatch(indirizzoPerIlDispositivo(grezzo), /s3cr3t/u, grezzo);
  }
  for (const locale of ['C:/Users/Anna Maria/r.git', 'C:\\x\\r.git', 'C:r.git', 'C:/x:y/r.git']) assert.match(indirizzoPerIlDispositivo(locale), /^…\/.*r\.git#[0-9a-f]{8}$/u, locale);
  assert.notEqual(indirizzoPerIlDispositivo('C:\\proj#1\\r.git'), indirizzoPerIlDispositivo('C:\\proj#2\\r.git'), 'due cartelle restano due');
});

test('LISTA-14 B1: un commit enorme non toglie il commit di testa al dispositivo, e TOO_LARGE è nell\'elenco chiuso', async (t) => {
  const { dir, g, op } = mondoPonteGit(t);
  const messaggio = join(dir, '..', 'messaggio.txt');
  writeFileSync(messaggio, `${'soggetto lungo '.repeat(120_000)}\n\ncorpo\n`);
  writeFileSync(join(dir, 'a.txt'), 'nuovo\n'); g(dir, 'add', '.'); g(dir, 'commit', '-q', '-F', messaggio);
  const testa = g(dir, 'rev-parse', 'HEAD').trim();
  const log = await op('log');
  assert.equal(log.testa, testa, 'senza testa la carta dell\'invio non si riempie');
  assert.equal(log.commit[0].commit, testa);
  assert.ok(log.commit[0].soggetto.length <= 64 * 1024);
  assert.equal(log.ultimoMessaggio, '', 'un messaggio che non si potrebbe rimandare non si mostra a metà: tornerebbe nel commit riscritto');
  const stato = await op('status');
  assert.equal(stato.base.commit, testa);
  for (const risposta of [log, stato]) assert.doesNotThrow(() => codifica({ t: 'res', n: 'n-000001', ok: true, data: risposta }));
  assert.ok(codiciDellaVoce('session.git.log').has('TOO_LARGE'));
  assert.ok(codiciDellaVoce('session.research.get').has('TOO_LARGE'));
  const rifiuto = rifiutoPerIlDispositivo('session.research.get', Object.assign(new Error('x'), { code: 'TOO_LARGE' }), () => 413);
  assert.deepEqual([rifiuto.code, rifiuto.stato], ['TOO_LARGE', 413]);
});

test('LISTA-15 B2: annulla e rifai eseguiti non rispondono mai 413, e una negativa resta negativa', async () => {
  const tanti = Array.from({ length: 30_000 }, (_, i) => `cartella/lunga/percorso-${i}.txt`);
  for (const [op, args] of [['session.undo', { turn: 3, corpo: {} }], ['session.undo.redo', {}]]) {
    const riuscito = await bancoFinto({ ok: true, turno: 3, ripristinati: tanti, rifatti: tanti }).esegui(op, { sessionId: 's1', ...args }, contesto);
    assert.deepEqual(riuscito, { ok: true, ridotta: true, turno: 3 }, op);
    const a_meta = await bancoFinto({ ok: false, motivo: 'git', turno: 3, ripristinati: tanti, rifatti: tanti }).esegui(op, { sessionId: 's1', ...args }, contesto);
    assert.deepEqual(a_meta, { ok: false, ridotta: true, motivo: 'git', turno: 3 }, `${op}: non si dice riuscita`);
  }
  await assert.rejects(bancoFinto(null, { chiamaFinta: async () => { throw Object.assign(new Error('C:\\Users\\Anna'), { code: 'SESSION_NOT_READY', stato: 409, reason: 'undo-while-working', explanation: 'C:\\Users\\Anna' }); } }).esegui('session.undo', { sessionId: 's1', turn: 3, corpo: {} }, contesto),
    (e) => e.code === 'SESSION_NOT_READY' && e.stato === 409 && e.reason === 'undo-while-working' && !/Anna/u.test(e.message) && e.explanation === undefined);
});

test('LISTA-16 B8: i parametri del contratto arrivano interi: la carta rimostra il valore vero', () => {
  const urlInvio = ['ssh://h.invalid/home/mario/', 'ssh://h2.invalid/srv/'].map((u) => `${u}${'x'.repeat(170)}.git`).join(', ');
  const rifiuto = rifiutoPerIlDispositivo('session.git.push', Object.assign(new Error('x'), { code: 'GIT_PUSH_CHANGED', stato: 409, reason: 'push-changed', params: { ramo: 'main', remoto: 'origin', urlInvio, destinazione: 'main', commit: 'c', altro: 'no' } }), (e) => e.stato);
  const { params, reason } = motivoPerIlTelefono(rifiuto);
  assert.equal(reason, 'push-changed');
  assert.deepEqual(params, { ramo: 'main', remoto: 'origin', urlInvio, destinazione: 'main', commit: 'c' });
  assert.deepEqual(motivoPerIlTelefono(Object.assign(new Error('x'), { reason: 'altro', params: { dove: 'C:\\Users\\Anna\\a.txt' } })).params, { dove: '…/a.txt' }, 'fuori dal contratto il filtro resta');
});

test('LISTA-17 N2: una parola con `#` o `?`, e la famiglia `utente:parola@host/percorso`, non escono mai', () => {
  for (const grezzo of ['u:s3cr3t#x@example.invalid:r.git', 'u:s3cr3t?x@example.invalid:r.git', 'ab:s3cr3t#x@example.invalid:o/r.git', 'ab:s3cr3t?x@example.invalid:o/r.git', 'utente:s3cr3t#1@example.invalid:o/r.git',
    's3cr3t#x@example.invalid:o/r.git', 's3cr3t?x@example.invalid:o/r.git', 'git@example.invalid:s3cr3t#x@y', 'host:u:s3cr3t#z@x/y.git', 'host:u:s3cr3t@x/y.git',
    'uu:s3cr3t@example.invalid/r.git', 'uu:s3cr3t@example.invalid', 'uu:s3cr3t#x@example.invalid/r.git', 'uu:s3cr3t/x@example.invalid/r.git', 'a@b:s3cr3t@example.invalid/r.git',
    'git@example.invalid:r.git?t=a@b:s3cr3t', 'example.invalid:r.git?t=a@b:s3cr3t', 's3cr3t@host', 's3cr3t#x@host', 'file:///x/s3cr3t@y']) {
    const pulito = indirizzoPerIlDispositivo(grezzo);
    assert.doesNotMatch(pulito, /s3cr3t/u, grezzo);
    assert.match(pulito, /^…#[0-9a-f]{8}$/u, `${grezzo}: ciò che non si sa leggere non si pubblica`);
  }
  assert.notEqual(indirizzoPerIlDispositivo('u:s3cr3t#x@example.invalid:r.git'), indirizzoPerIlDispositivo('u:s3cr3t#y@example.invalid:r.git'), 'il confronto vede il cambiamento');
  for (const [grezzo, atteso] of [['git@github.com:a/b.git', 'git@github.com:a/b.git'], ['github.com:a/b.git', 'github.com:a/b.git'], ['u:s3cr3t@example.invalid:r.git', 'example.invalid:r.git'],
    ['a:b:s3cr3t@h.invalid:r.git', 'h.invalid:r.git'], ['u:s3cr3t@u2@h.invalid:r.git', 'h.invalid:r.git'], ['git@h.invalid:o/r.git?token=s3cr3t#z', 'git@h.invalid:o/r.git']]) {
    assert.equal(indirizzoPerIlDispositivo(grezzo), atteso, grezzo);
  }
});

test('LISTA-18 N2: su un repository vero la parola non esce né dagli elenchi né dal rifiuto dell\'invio', async (t) => {
  const { dir, g, op } = mondoPonteGit(t);
  g(dir, 'remote', 'set-url', 'origin', 'u:s3cr3t#x@example.invalid:o/r.git');
  const atteso = indirizzoPerIlDispositivo('u:s3cr3t#x@example.invalid:o/r.git');
  assert.doesNotMatch(JSON.stringify(await op('remotes')), /s3cr3t/u);
  const sync = await op('sync');
  assert.equal(sync.urlInvio, atteso);
  await assert.rejects(op('push', { corpo: {}, confermata: true, visto: await visto(op, { urlInvio: 'altro' }) }),
    (e) => e.code === 'GIT_PUSH_CHANGED' && e.params.urlInvio === atteso);
});

test('LISTA-19 N8: `ultimoMessaggio` si misura in byte, col tetto del PC, e dice quando è stato tolto', async (t) => {
  const { dir, g, op } = mondoPonteGit(t);
  const file = join(dir, '..', 'messaggio.txt');
  writeFileSync(file, `${'界'.repeat(30_000)}\n`, 'utf8');
  writeFileSync(join(dir, 'a.txt'), 'nuovo\n'); g(dir, 'add', '.'); g(dir, 'commit', '-q', '-F', file);
  const log = await op('log');
  assert.equal(log.ultimoMessaggio, '', '90 KB: il PC li rifiuterebbe');
  assert.equal(log.ultimoMessaggioTroncato, true);
  writeFileSync(join(dir, 'a.txt'), 'ancora\n'); g(dir, 'add', '.'); g(dir, 'commit', '-q', '-m', 'corto');
  const corto = await op('log');
  assert.equal(corto.ultimoMessaggio, 'corto');
  assert.equal(Object.hasOwn(corto, 'ultimoMessaggioTroncato'), false, 'assente, non `false`');
  assert.equal(FILTRI_GIT.log({ commit: [], ultimoMessaggio: 'a'.repeat(64 * 1024) }).ultimoMessaggioTroncato, undefined, 'il tetto del PC si può ancora rimandare');
  assert.equal(FILTRI_GIT.log({ commit: [], ultimoMessaggio: 'a'.repeat(64 * 1024 + 1) }).ultimoMessaggioTroncato, true);
});

test('LISTA-20 N12: `.undo-commit` oltre il tetto tiene `messaggio`, tagliato, e il filo lo regge', async () => {
  const args = { sessionId: 's1', corpo: { commit: 'c' }, confermata: true };
  for (const [messaggio, descrizione] of [['界'.repeat(500_000), 'tre byte'], ['😀'.repeat(400_000), 'coppie di surrogati'], ['"'.repeat(1_500_000), 'pesa doppio sul filo']]) {
    const r = await bancoFinto({ ok: true, messaggio, stato: { voci: [] } }).esegui('session.git.undo-commit', args, contesto);
    assert.equal(r.ok, true);
    assert.equal(r.ridotta, true);
    assert.ok(r.messaggio?.length > 1000, descrizione);
    assert.ok(messaggio.startsWith(r.messaggio), descrizione);
    assert.ok(pesoSulFilo(r.messaggio) <= 512 * 1024 + 2, descrizione);
    assert.doesNotMatch(r.messaggio.slice(-1), /[\ud800-\udbff]/u, descrizione);
    assert.doesNotThrow(() => codifica({ t: 'res', n: 'n-000001', ok: true, data: r }));
  }
  const piccola = await bancoFinto({ ok: true, messaggio: 'corto', stato: { voci: Array.from({ length: 30_000 }, (_, i) => ({ percorso: `cartella/lunga/percorso-${i}.txt` })) } }).esegui('session.git.undo-commit', args, contesto);
  assert.equal(piccola.messaggio, 'corto', 'un messaggio corto resta intero');
  assert.equal(testoDentroIByte('corto'), 'corto');
});

/* D3: la coda si taglia dopo aver guardato la `@`. Le forme sono quelle della sonda `p01` del Mobile */
const CON_LA_PAROLA_NELLA_CODA = ['file://u:s3cr3t#x@host/x/r.git', 'file://s3cr3t#x@host', 'file:///x/s3cr3t#y@z', 'file:///x/u:s3cr3t?y@z', 'FILE:///x/s3cr3t?@z', 'file://u:s3cr3t?x@h', 'file:///u:s3cr3t#@h', 'file:///C:/x/u:s3cr3t#x@h',
  'https://s3cr3t#x@host/r.git', 'https://s3cr3t?x@host/r.git', 'http://s3cr3t#@host/r', 'HTTPS://s3cr3t?x@host/r.git', 'https://u:s3cr3t#x@host/r', 'https://u:s3cr3t?x@host/r',
  'ssh://s3cr3t#x@host/r.git', 'ssh://s3cr3t?x@host/r.git', 'ssh://u:s3cr3t#x@host/r', 'git://s3cr3t?x@host/r', 'git+ssh://s3cr3t#x@host/r', 'git+https://s3cr3t?x@host/r'];

test('LISTA-21 D3: una `@` dopo `#` o `?` non fa uscire la parola nemmeno da `file://` e dagli URL', () => {
  for (const grezzo of CON_LA_PAROLA_NELLA_CODA) {
    const pulito = indirizzoPerIlDispositivo(grezzo);
    assert.doesNotMatch(pulito, /s3cr3t/u, grezzo);
    assert.match(pulito, /^…#[0-9a-f]{8}$/u, `${grezzo}: ciò che non si sa leggere non si pubblica`);
  }
  assert.notEqual(indirizzoPerIlDispositivo('file://u:s3cr3t#x@host/r.git'), indirizzoPerIlDispositivo('file://u:s3cr3t#y@host/r.git'), 'il confronto vede il cambiamento');
  for (const [grezzo, atteso] of [['https://x:tok@host/a.git?t=1#z', 'https://host/a.git'], ['ssh://git@host/a/r.git', 'ssh://host/a/r.git'], ['https://host/a.git', 'https://host/a.git']]) {
    assert.equal(indirizzoPerIlDispositivo(grezzo), atteso, 'la `@` delle credenziali, prima della coda, resta il caso normale');
  }
  assert.match(indirizzoPerIlDispositivo('file:///x/r.git?t=1#z'), /^…\/r\.git#[0-9a-f]{8}$/u, 'la coda senza `@` si toglie e basta');
  assert.match(indirizzoPerIlDispositivo('ext::sh -c "a#b@c"'), /^ext::#[0-9a-f]{8}$/u, 'un aiutante si guarda prima');
});

test('LISTA-22 D3: su un repository vero la parola di un `file://` non esce né dagli elenchi né dal rifiuto dell\'invio', async (t) => {
  const { dir, g, op } = mondoPonteGit(t);
  const grezzo = 'file://u:s3cr3t#x@host/x/r.git';
  g(dir, 'remote', 'set-url', 'origin', grezzo);
  const atteso = indirizzoPerIlDispositivo(grezzo);
  assert.doesNotMatch(JSON.stringify(await op('remotes')), /s3cr3t/u);
  assert.equal((await op('sync')).urlInvio, atteso);
  await assert.rejects(op('push', { corpo: {}, confermata: true, visto: await visto(op, { urlInvio: 'altro' }) }),
    (e) => e.code === 'GIT_PUSH_CHANGED' && e.params.urlInvio === atteso && !JSON.stringify(e.params).includes('s3cr3t'));
});


test('LISTA-23 D8: `.amend` senza `messaggio` tiene quello esistente, anche oltre il tetto; vuoto o storto resta rifiutato', async (t) => {
  const { dir, g, op } = mondoPonteGit(t);
  const file = join(dir, '..', 'messaggio.txt');
  const lungo = `  Titolo   \n\n${'界'.repeat(30_000)}\n# una riga col cancelletto\n`;
  writeFileSync(file, lungo, 'utf8');
  writeFileSync(join(dir, 'a.txt'), 'nuovo\n'); g(dir, 'add', '.'); g(dir, 'commit', '-q', '--cleanup=verbatim', '-F', file);
  const corpoDa = async (extra = {}) => { const log = await op('log'); return { commit: log.testa, impronta: (await op('status')).impronta, ...extra }; };
  writeFileSync(join(dir, 'b.txt'), 'in più\n'); g(dir, 'add', 'b.txt');
  const prima = await op('log');
  assert.equal(prima.ultimoMessaggioTroncato, true, 'il telefono non ha il testo da rimandare');
  for (const messaggio of ['', '   ', null, 7]) {
    await assert.rejects(op('amend', { corpo: await corpoDa({ messaggio }), confermata: true }), { code: 'GIT_MESSAGE_REQUIRED', stato: 422 }, JSON.stringify(messaggio));
  }
  const fatto = await op('amend', { corpo: await corpoDa(), confermata: true });
  assert.equal(fatto.ok, true);
  assert.notEqual(fatto.commit, prima.testa);
  assert.equal(g(dir, 'log', '-1', '--format=%B').replace(/\n+$/u, ''), lungo.replace(/\n+$/u, ''), 'il messaggio resta quello, byte per byte');
  assert.match(g(dir, 'show', '--name-only', '--format=', 'HEAD'), /b\.txt/u, 'ciò che è preparato entra nel commit');
});

test('LISTA-24 D8: la rotta del PC con un messaggio vuoto risponde come prima', async (t) => {
  const { chiama, dir, g } = mondoPonteGit(t);
  writeFileSync(join(dir, 'a.txt'), 'nuovo\n'); g(dir, 'add', '.'); g(dir, 'commit', '-q', '-m', 'locale');
  const stato = (await chiama({ metodo: 'GET', percorso: '/api/v1/sessions/s1/git/status' })).dati;
  await assert.rejects(chiama({ metodo: 'POST', percorso: '/api/v1/sessions/s1/git/amend', corpo: { messaggio: '', impronta: stato.impronta, commit: stato.base.commit } }), { code: 'GIT_MESSAGE_REQUIRED', stato: 422 });
});

test('LISTA-22 N4: una barra rovescia prima dell\'host non fa uscire la parola', () => {
  for (const grezzo of ['https://s3cr3t\\@example.invalid/r.git', 'https://u:s3cr3t\\x@example.invalid/r.git', 'ssh://s3cr3t\\@example.invalid/r.git']) {
    assert.match(indirizzoPerIlDispositivo(grezzo), /^…#[0-9a-f]{8}$/u, grezzo);
  }
  assert.equal(indirizzoPerIlDispositivo('https://example.invalid/a\\b.git?x=1').includes('example.invalid'), true, 'al contrario: dopo il primo `/` non è un host');
});

test('LISTA-23 D2: anche con l\'host vuoto', () => {
  for (const grezzo of ['https:///s3cr3t\\@h.invalid/r.git', 'https:////s3cr3t\\@h.invalid/r.git']) assert.match(indirizzoPerIlDispositivo(grezzo), /^…#[0-9a-f]{8}$/u, grezzo);
});
