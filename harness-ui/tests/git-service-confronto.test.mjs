/**
 * git-service-confronto.test.mjs — F6-2 passo 4 (27/09/2026): le modifiche di un commit del grafo. Decisione 24 dell'owner
 * (memoria `decisioni-owner-f6-github-26-09`): «il clic nel grafo apre le modifiche, come VS Code» — un commit contro il suo
 * primo genitore (la radice contro l'albero vuoto), «In arrivo»/«In uscita» dalla base comune alla punta.
 *
 * ⛔ Repository VERI, come gli altri file del servizio: aggiunto/modificato/eliminato/rinominato, il primo genitore di
 *   un'unione e l'albero vuoto sono fatti di git.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { creaServizioGit } from '../src/git-service.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function repoVero(t) {
  const base = mkdtempSync(join(tmpdir(), 'talos-git-confronto-'));
  t.after(() => rimuoviCartellaDiProva(base)); // BC-09, classe A
  const g = (...args) => execFileSync('git', args, { cwd: base, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 'prova@example.invalid');
  g('config', 'user.name', 'Prova');
  g('config', 'core.autocrlf', 'false');
  return { base, g };
}
const servizio = (cartelle) => creaServizioGit({ cartellaDiSessione: (id) => cartelle[id] ?? null });
const ok = (esito) => { assert.ok(!('erroreAvvio' in esito), `${esito.code}: ${esito.erroreAvvio}`); return esito; };
const scrivi = (base, file, testo) => { writeFileSync(join(base, file), testo); };
const tutto = (g, messaggio) => { g('add', '-A'); g('commit', '-q', '-m', messaggio); return g('rev-parse', 'HEAD').trim(); };
const riassunto = (esito) => esito.file.map((f) => `${f.stato} ${f.prima ? `${f.prima} → ` : ''}${f.percorso}`).sort();

test('F6-2 p4 — i file di un commit contro il suo PRIMO genitore; la radice contro l albero vuoto; aggiunti, modificati, eliminati, rinominati', async (t) => {
  const { base, g } = repoVero(t);
  const git = servizio({ s: base });
  scrivi(base, 'a.txt', 'uno\n');
  scrivi(base, 'b.txt', 'due\n');
  scrivi(base, 'lungo.txt', 'riga uguale\n'.repeat(20));
  const radice = tutto(g, 'radice');
  let esito = ok(await git.modificheFra({ sessionId: 's', a: radice }));
  assert.deepEqual(riassunto(esito), ['A a.txt', 'A b.txt', 'A lungo.txt'], 'la radice contro l albero vuoto: tutto aggiunto');
  assert.equal(esito.da, '4b825dc642cb6eb9a060e54bf8d69288fbee4904', 'l albero vuoto misurato (SHA-1)');
  assert.equal(esito.daVuoto, true, 'e lo dice, così la scheda scrive «il primo commit» e non un hash');
  scrivi(base, 'a.txt', 'uno, cambiato\n');
  rmSync(join(base, 'b.txt'));
  scrivi(base, 'c.txt', 'tre\n');
  renameSync(join(base, 'lungo.txt'), join(base, 'rinominato.txt'));
  const secondo = tutto(g, 'secondo');
  esito = ok(await git.modificheFra({ sessionId: 's', a: secondo }));
  assert.equal(esito.da, radice, 'contro il primo genitore');
  assert.equal(esito.daVuoto, false);
  assert.deepEqual(riassunto(esito), ['A c.txt', 'D b.txt', 'M a.txt', 'R lungo.txt → rinominato.txt']);
  assert.deepEqual([esito.fuori, esito.altri], [0, false]);
  // un'unione: il primo genitore è il ramo su cui si unisce, come VS Code
  g('switch', '-q', '-c', 'lato', radice);
  scrivi(base, 'lato.txt', 'dal lato\n');
  tutto(g, 'lato');
  g('switch', '-q', 'main');
  g('merge', '-q', '--no-edit', '--no-ff', 'lato');
  const unione = g('rev-parse', 'HEAD').trim();
  esito = ok(await git.modificheFra({ sessionId: 's', a: unione }));
  assert.equal(esito.da, secondo);
  assert.deepEqual(riassunto(esito), ['A lato.txt'], 'contro il primo genitore si vede solo ciò che l unione ha portato');
});

test('F6-2 p4 — «In arrivo» / «In uscita»: dalla base comune alla punta data', async (t) => {
  const { base, g } = repoVero(t);
  const git = servizio({ s: base });
  scrivi(base, 'a.txt', 'uno\n');
  const comune = tutto(g, 'comune');
  scrivi(base, 'qui.txt', 'solo qui\n');
  const testa = tutto(g, 'qui');
  g('switch', '-q', '-c', 'remoto', comune);
  scrivi(base, 'la1.txt', 'la\n');
  tutto(g, 'là 1');
  scrivi(base, 'la2.txt', 'là\n');
  const punta = tutto(g, 'là 2');
  g('switch', '-q', 'main');
  assert.deepEqual(riassunto(ok(await git.modificheFra({ sessionId: 's', da: comune, a: punta }))), ['A la1.txt', 'A la2.txt'], 'in arrivo');
  assert.deepEqual(riassunto(ok(await git.modificheFra({ sessionId: 's', da: comune, a: testa }))), ['A qui.txt'], 'in uscita');
});

test('F6-2 p4 — da una SOTTOCARTELLA: i percorsi sono quelli della sessione, e ciò che cambia fuori si CONTA', async (t) => {
  const { base, g } = repoVero(t);
  mkdirSync(join(base, 'dentro'));
  scrivi(base, join('dentro', 'x.txt'), 'x\n');
  scrivi(base, 'fuori.txt', 'f\n');
  tutto(g, 'radice');
  scrivi(base, join('dentro', 'x.txt'), 'x cambiato\n');
  scrivi(base, 'fuori.txt', 'f cambiato\n');
  scrivi(base, 'altro-fuori.txt', 'nuovo\n');
  const commit = tutto(g, 'dentro e fuori');
  const git = servizio({ s: join(base, 'dentro') });
  const esito = ok(await git.modificheFra({ sessionId: 's', a: commit }));
  assert.deepEqual(riassunto(esito), ['M x.txt'], 'relativo alla cartella della sessione');
  assert.equal(esito.fuori, 2, 'i due file fuori non si tacciono');
  const diff = ok(await git.diffFra({ sessionId: 's', a: commit, percorso: 'x.txt' }));
  assert.match(diff.testo, /^-x$/mu);
  assert.match(diff.testo, /^\+x cambiato$/mu);
  // ⛔ un repository con `diff.relative` non cambia il totale: `--no-relative` lo scavalca
  g('config', 'diff.relative', 'true');
  assert.equal(ok(await git.modificheFra({ sessionId: 's', a: commit })).fuori, 2);
});

test('F6-2 p4 — il diff di un file fra due commit, e di un rinominato col nome di prima; sola lettura, stessi divieti', async (t) => {
  const { base, g } = repoVero(t);
  const git = servizio({ s: base });
  scrivi(base, 'a.txt', 'uno\ndue\ntre\n');
  scrivi(base, 'lungo.txt', 'riga uguale\n'.repeat(20));
  const radice = tutto(g, 'radice');
  scrivi(base, 'a.txt', 'uno\nDUE\ntre\n');
  renameSync(join(base, 'lungo.txt'), join(base, 'nuovo-nome.txt'));
  const commit = tutto(g, 'cambio e rinomina');
  const diff = ok(await git.diffFra({ sessionId: 's', a: commit, percorso: 'a.txt' }));
  assert.deepEqual([diff.da, diff.a, diff.percorso, diff.binario, diff.troncato], [radice, commit, 'a.txt', false, false]);
  assert.match(diff.testo, /^-due$/mu);
  assert.match(diff.testo, /^\+DUE$/mu);
  const rinominato = ok(await git.diffFra({ sessionId: 's', a: commit, percorso: 'nuovo-nome.txt', prima: 'lungo.txt' }));
  assert.match(rinominato.testo, /^rename from lungo\.txt$/mu, 'col nome di prima git riconosce la rinomina');
  // AL CONTRARIO: senza il nome di prima lo stesso file è un'aggiunta — per questo la scheda lo passa
  const senza = ok(await git.diffFra({ sessionId: 's', a: commit, percorso: 'nuovo-nome.txt' }));
  assert.match(senza.testo, /^new file mode/mu);
  // la radice: il diff contro l'albero vuoto
  assert.match(ok(await git.diffFra({ sessionId: 's', a: radice, percorso: 'a.txt' })).testo, /^\+uno$/mu);
});

test('F6-2 p4 — AL CONTRARIO: nomi, hash corti, opzioni, commit inesistenti e percorsi fuori sono rifiutati per nome', async (t) => {
  const { base, g } = repoVero(t);
  const git = servizio({ s: base });
  scrivi(base, 'a.txt', 'uno\n');
  const commit = tutto(g, 'radice');
  const rifiuto = async (promessa) => { const e = await promessa; assert.ok('erroreAvvio' in e, 'doveva essere rifiutato'); return e.code; };
  for (const a of ['HEAD', 'HEAD~1', 'main', commit.slice(0, 7), `--output=${join(base, 'x')}`, `${commit}^1`, '', null]) {
    assert.equal(await rifiuto(git.modificheFra({ sessionId: 's', a })), 'GIT_COMMIT_INVALID', `a=${a}`);
  }
  assert.equal(await rifiuto(git.modificheFra({ sessionId: 's', da: 'HEAD', a: commit })), 'GIT_COMMIT_INVALID');
  assert.equal(await rifiuto(git.modificheFra({ sessionId: 's', a: 'f'.repeat(40) })), 'GIT_COMMIT_UNKNOWN');
  assert.equal(await rifiuto(git.modificheFra({ sessionId: 's', da: 'e'.repeat(40), a: commit })), 'GIT_COMMIT_UNKNOWN');
  // un blob o un albero con un hash intero non sono commit
  const albero = g('rev-parse', `${commit}^{tree}`).trim();
  assert.equal(await rifiuto(git.modificheFra({ sessionId: 's', a: albero })), 'GIT_COMMIT_UNKNOWN');
  for (const percorso of ['../fuori.txt', 'C:/x.txt', ':(top)a.txt', '-p']) {
    assert.equal(await rifiuto(git.diffFra({ sessionId: 's', a: commit, percorso })), 'GIT_PATH_INVALID', percorso);
  }
  assert.equal(await rifiuto(git.diffFra({ sessionId: 's', a: commit, percorso: 'a.txt', prima: '../via.txt' })), 'GIT_PATH_INVALID');
});
