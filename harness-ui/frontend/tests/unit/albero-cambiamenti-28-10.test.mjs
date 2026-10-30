import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RITARDO_CAMBIAMENTI_ALBERO_MS,
  genitoreNellAlbero,
  livelliSottoCartelleSparite,
  livelliToccatiDalCambiamento,
  livelloAVista,
  normalizzaPercorsoAlbero,
  stessoLivello,
} from '../../src/components/albero-cambiamenti.js';

/*
 * Owner 28/10/2026: «la tab file a destra flickera come se si aggiornasse ogni tot». Misurato sul 4174 con una sonda in sola
 * lettura: 1.896 mutazioni del DOM in 34 s, l'albero intero rifatto ogni secondo, per un file che cambiava DENTRO una cartella
 * chiusa. Qui la domanda pura: quali livelli già letti un cambiamento tocca, e quali di quelli la persona sta guardando.
 */

const aperti = (...l) => new Set(l);

test('ALBERO-CAMBI-01 — un file dentro una cartella mai aperta non tocca nessun livello letto', () => {
  const esito = livelliToccatiDalCambiamento(['logs/app.log', 'logs'], ['', 'src'], aperti('src'));
  assert.deepEqual(esito, { daRicontrollare: [''], daDimenticare: [] }, '«logs» è una riga della radice: la radice si ricontrolla, il suo contenuto no');
  const dentro = livelliToccatiDalCambiamento(['logs/app.log'], ['', 'src'], aperti('src'));
  assert.deepEqual(dentro, { daRicontrollare: [], daDimenticare: [] }, 'il file in una cartella mai letta non tocca niente');
});

test('ALBERO-CAMBI-02 — una cartella letta ma CHIUSA si dimentica, non si rilegge', () => {
  const esito = livelliToccatiDalCambiamento(['logs/app.log'], ['', 'logs'], aperti());
  assert.deepEqual(esito, { daRicontrollare: [], daDimenticare: ['logs'] });
  // al contrario: aperta, si ricontrolla
  assert.deepEqual(livelliToccatiDalCambiamento(['logs/app.log'], ['', 'logs'], aperti('logs')), { daRicontrollare: ['logs'], daDimenticare: [] });
});

test('ALBERO-CAMBI-03 — aperta dentro una cartella chiusa NON è a vista', () => {
  assert.equal(livelloAVista('', aperti()), true, 'la radice è sempre a vista');
  assert.equal(livelloAVista('a/b', aperti('a/b')), false, 'a/b aperta ma a chiusa: non si vede');
  assert.equal(livelloAVista('a/b', aperti('a', 'a/b')), true);
  const esito = livelliToccatiDalCambiamento(['a/b/x.txt'], ['', 'a', 'a/b'], aperti('a/b'));
  assert.deepEqual(esito, { daRicontrollare: [], daDimenticare: ['a/b'] });
});

test('ALBERO-CAMBI-04 — «.» o un elenco che manca vuol dire «non so dove»: ogni livello letto è toccato', () => {
  const letti = ['', 'src', 'logs'];
  assert.deepEqual(livelliToccatiDalCambiamento(['.'], letti, aperti('src')), { daRicontrollare: ['', 'src'], daDimenticare: ['logs'] });
  assert.deepEqual(livelliToccatiDalCambiamento(undefined, letti, aperti('src')), { daRicontrollare: ['', 'src'], daDimenticare: ['logs'] });
});

test('ALBERO-CAMBI-05 — la cartella stessa cambiata (Windows la segnala quando cambia un figlio) si ricontrolla se a vista', () => {
  assert.deepEqual(livelliToccatiDalCambiamento(['src'], ['', 'src'], aperti('src')), { daRicontrollare: ['', 'src'], daDimenticare: [] });
});

test('ALBERO-CAMBI-06 — i percorsi si normalizzano: barre rovesce, «./», barra finale; il resto non passa', () => {
  assert.equal(normalizzaPercorsoAlbero('src\\deep\\x.js'), 'src/deep/x.js');
  assert.equal(normalizzaPercorsoAlbero('./src/'), 'src');
  assert.equal(normalizzaPercorsoAlbero('.'), '');
  assert.equal(normalizzaPercorsoAlbero(''), '');
  assert.equal(normalizzaPercorsoAlbero(42), null);
  assert.equal(genitoreNellAlbero('a/b/c.txt'), 'a/b');
  assert.equal(genitoreNellAlbero('c.txt'), '');
  assert.deepEqual(livelliToccatiDalCambiamento([42, null], [''], aperti()), { daRicontrollare: [], daDimenticare: [] }, 'una voce che non è un percorso non tocca niente');
});

test('ALBERO-CAMBI-07 — «stesso livello» guarda solo ciò che la riga disegna: nome e cartella', () => {
  const a = [{ nome: 'src', cartella: true }, { nome: 'README.md', cartella: false }];
  assert.equal(stessoLivello(a, [{ nome: 'src', cartella: true, dimensione: 9 }, { nome: 'README.md' }]), true);
  assert.equal(stessoLivello(a, [{ nome: 'src', cartella: true }]), false, 'una riga in meno');
  assert.equal(stessoLivello(a, [{ nome: 'src', cartella: false }, { nome: 'README.md', cartella: false }]), false, 'da cartella a file');
  assert.equal(stessoLivello(a, [{ nome: 'README.md', cartella: false }, { nome: 'src', cartella: true }]), false, 'l\'ordine conta: è quello a schermo');
  assert.equal(stessoLivello(undefined, a), false, 'un livello che non c\'era non è «lo stesso»');
});

test('ALBERO-CAMBI-08 — una cartella sparita porta via i suoi livelli letti e quelli sotto, non i vicini dal nome simile', () => {
  const prima = [{ nome: 'deep', cartella: true }, { nome: 'deep2', cartella: true }, { nome: 'x.js', cartella: false }];
  const dopo = [{ nome: 'deep2', cartella: true }, { nome: 'x.js', cartella: false }];
  const letti = ['', 'src', 'src/deep', 'src/deep/a', 'src/deep2'];
  assert.deepEqual(livelliSottoCartelleSparite('src', prima, dopo, letti), ['src/deep', 'src/deep/a']);
  assert.deepEqual(livelliSottoCartelleSparite('', [{ nome: 'src', cartella: true }], [{ nome: 'src', cartella: false }], letti),
    ['src', 'src/deep', 'src/deep/a', 'src/deep2'], 'una cartella diventata file è sparita come cartella');
});

test('ALBERO-CAMBI-09 — il ritardo è quello di VS Code (EXPLORER_FILE_CHANGES_REACT_DELAY = 500)', () => {
  assert.equal(RITARDO_CAMBIAMENTI_ALBERO_MS, 500);
});
