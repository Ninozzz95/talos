import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { CustomTaskError, elencaCartelleProgetto, preparaEsecuzioneLibera } from '../src/custom-task.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

// ⛔ Stesso principio di task-catalog.test.mjs: nessun mock del filesystem,
// una cartella temporanea VERA. Diverso da task-catalog: qui NON c'è
// pulisci() da provare, perché preparaEsecuzioneLibera lavora sulla
// cartella stessa — è la sua stessa doc a dichiararlo, non un'omissione.

function cartellaProgettoFinta(t, indice = 0, nome = 'progetto-libero') {
  const percorso = mkdtempSync(join(tmpdir(), `talos-${nome}-`));
  t.after(() => rimuoviCartellaDiProva(percorso));
  return { id: String(indice), percorso, nome: percorso.split(/[\\/]/).pop() };
}

test('elencaCartelleProgetto non espone mai il percorso assoluto, solo id e nome', (t) => {
  const cartelle = [cartellaProgettoFinta(t, 0), cartellaProgettoFinta(t, 1)];
  const menu = elencaCartelleProgetto(cartelle);
  assert.deepEqual(menu, [{ id: '0', nome: cartelle[0].nome }, { id: '1', nome: cartelle[1].nome }]);
  for (const voce of menu) assert.ok(!('percorso' in voce), 'il percorso assoluto non deve uscire verso il browser');
});

test('⭐ preparaEsecuzioneLibera su un cartellaId ammesso torna il percorso VERO, il comandoProva di default, e una consegnaCorta troncata', (t) => {
  const cartelle = [cartellaProgettoFinta(t)];
  const consegnaLunga = 'x'.repeat(200);
  const { cartella, comandoProva, task } = preparaEsecuzioneLibera(cartelle, { cartellaId: '0', consegna: consegnaLunga });

  assert.equal(cartella, cartelle[0].percorso);
  assert.equal(comandoProva, 'npm test');
  assert.equal(task.consegna, consegnaLunga, 'la consegna intera arriva integra a talosLavora');
  assert.equal(task.consegnaCorta.length, 80, '77 caratteri + "..."');
  assert.ok(task.consegnaCorta.endsWith('...'));
});

test('⭐⭐ un comandoProva esplicito sostituisce il default', (t) => {
  const cartelle = [cartellaProgettoFinta(t)];
  const { comandoProva } = preparaEsecuzioneLibera(cartelle, { cartellaId: '0', consegna: 'fai qualcosa', comandoProva: 'npm run test:unit' });
  assert.equal(comandoProva, 'npm run test:unit');
});

test('⛔⛔ ALLOWLIST: un cartellaId inventato è rifiutato, mai un percorso a caso', (t) => {
  const cartelle = [cartellaProgettoFinta(t)];
  assert.throws(
    () => preparaEsecuzioneLibera(cartelle, { cartellaId: 'non-esiste', consegna: 'fai qualcosa' }),
    (errore) => errore instanceof CustomTaskError && errore.code === 'PROJECT_NOT_ALLOWED',
  );
});

test('⛔ e il VERSO CONTRARIO: con la allowlist VUOTA, nessun cartellaId è mai ammesso — nemmeno "0"', () => {
  assert.throws(
    () => preparaEsecuzioneLibera([], { cartellaId: '0', consegna: 'fai qualcosa' }),
    (errore) => errore instanceof CustomTaskError && errore.code === 'PROJECT_NOT_ALLOWED',
  );
});

test('⛔ cartellaId o consegna mancanti/vuoti sono QUERY_INVALID, non un crash', (t) => {
  const cartelle = [cartellaProgettoFinta(t)];
  for (const input of [
    { cartellaId: '', consegna: 'fai qualcosa' },
    { cartellaId: '0', consegna: '' },
    { cartellaId: '0', consegna: '   ' },
    { cartellaId: undefined, consegna: 'fai qualcosa' },
  ]) {
    assert.throws(
      () => preparaEsecuzioneLibera(cartelle, input),
      (errore) => errore instanceof CustomTaskError && errore.code === 'QUERY_INVALID',
      `input ${JSON.stringify(input)} deve essere rifiutato esplicitamente`,
    );
  }
});

/*
 * ⛔⛔⛔ 25/09/2026 sera, decisione owner «stesso tetto e motivo vero»: la PRIMA consegna aveva un tetto di 8.192 byte (nato il
 *   27/08 con `25dd1f026`, senza una ragione scritta) mentre un messaggio successivo non ne ha nessuno oltre il corpo HTTP
 *   (`requireResumeBody`, 10 MB). Un testo incollato di 31 KB come primo messaggio moriva con «Avvio non riuscito: Query non
 *   valida». Hermes non mette tetti: un testo lungo diventa un segnaposto nel compositore e si espande all'invio
 *   (`cli.py:852` `_PASTE_REF_RE`, `hermes_cli/cli_stream_mixin.py:202` `_expand_paste_references`, clone 65ad529). Il limite
 *   vero resta la finestra del modello, che ha la sua carta. ⇒ La prima consegna si comporta come le successive.
 */
test('⭐⭐⭐ la prima consegna ha lo stesso tetto dei messaggi successivi: 31 KB passano', (t) => {
  const cartelle = [cartellaProgettoFinta(t)];
  const lunga = 'Nota di lavoro: il registro dei processi resta leggibile. '.repeat(540);
  assert.ok(Buffer.byteLength(lunga, 'utf8') > 30_000);
  const esito = preparaEsecuzioneLibera(cartelle, { cartellaId: '0', consegna: lunga });
  assert.equal(esito.task.consegna, lunga, 'la consegna arriva intera, non troncata');
});

/*
 * ⭐⭐⭐ 28/8 — LA PILLOLA PERMESSI, permesso "Full access":
 * `cartellaLibera` è un percorso a PIACERE (validato a runtime, mai
 * un'allowlist), owner: "read only/workspace write/on request/full
 * access". Vedi la doc in testa al file sul perché niente denylist —
 * ricerca fatta prima di scrivere (REGOLA ZERO).
 */
test('⭐⭐⭐ cartellaLibera VERA (esiste, è una cartella, leggibile/scrivibile) è accettata: nessuna allowlist coinvolta', (t) => {
  const percorso = mkdtempSync(join(tmpdir(), 'talos-full-access-'));
  t.after(() => rimuoviCartellaDiProva(percorso));
  const { cartella, task } = preparaEsecuzioneLibera([], { cartellaLibera: percorso, consegna: 'fai qualcosa' });
  assert.equal(cartella, percorso);
  assert.equal(task.progetto, percorso.split(/[\\/]/).pop());
});

test('⛔⛔⛔ AL CONTRARIO — cartellaId E cartellaLibera insieme sono rifiutati: mai un percorso scelto a caso fra i due', (t) => {
  const cartelle = [cartellaProgettoFinta(t)];
  const percorso = mkdtempSync(join(tmpdir(), 'talos-full-access-'));
  t.after(() => rimuoviCartellaDiProva(percorso));
  assert.throws(
    () => preparaEsecuzioneLibera(cartelle, { cartellaId: '0', cartellaLibera: percorso, consegna: 'fai qualcosa' }),
    (errore) => errore instanceof CustomTaskError && errore.code === 'QUERY_INVALID',
  );
});

test('⛔⛔ AL CONTRARIO — cartellaLibera che NON esiste è PROJECT_NOT_ALLOWED, mai una cartella creata al volo', () => {
  assert.throws(
    () => preparaEsecuzioneLibera([], { cartellaLibera: 'C:/questo/percorso/non/esiste/mai-8271', consegna: 'fai qualcosa' }),
    (errore) => errore instanceof CustomTaskError && errore.code === 'PROJECT_NOT_ALLOWED',
  );
});

test('⛔ AL CONTRARIO — cartellaLibera relativa è rifiutata, mai risolta contro un cwd a sorpresa', () => {
  assert.throws(
    () => preparaEsecuzioneLibera([], { cartellaLibera: 'una/cartella/relativa', consegna: 'fai qualcosa' }),
    (errore) => errore instanceof CustomTaskError && errore.code === 'QUERY_INVALID',
  );
});

test('⛔⛔ AL CONTRARIO — cartellaLibera che punta a un FILE, non una cartella, è rifiutata', (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-full-access-file-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const file = join(cartella, 'non-una-cartella.txt');
  writeFileSync(file, 'x');
  assert.throws(
    () => preparaEsecuzioneLibera([], { cartellaLibera: file, consegna: 'fai qualcosa' }),
    (errore) => errore instanceof CustomTaskError && errore.code === 'PROJECT_NOT_ALLOWED',
  );
});
