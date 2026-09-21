import test from 'node:test';
import assert from 'node:assert/strict';
import { chipAllegato, chipDegliAllegati, generePerLoSchermo } from '../../src/components/allegati.js';

test('⛔ O-41: una pagina aperta diventa un chip col DOMINIO, non con l’URL intero', () => {
  /*
   * Il difetto che stiamo curando è testo lungo dove non serve: un chip che porta novanta caratteri
   * di URL lo rifà in piccolo. Della pagina interessa da dove viene.
   */
  const chip = chipAllegato({ daBrowser: true, nome: 'Pagina aperta', percorso: 'https://raw.githubusercontent.com/Ninozzz95/talos/main/README.md', caratteri: 4116 });
  assert.equal(chip.genere, 'pagina aperta');
  assert.equal(chip.nome, 'raw.githubusercontent.com');
  assert.match(chip.costo, /token/u, 'il peso si dichiara: è quello che paghi mandandolo');
  assert.match(chip.titolo, /README\.md/u, 'l’URL intero resta nel titolo, per chi lo vuole');
});

test('un file porta il nome del file, accorciato se lunghissimo', () => {
  const chip = chipAllegato({ percorso: 'C:/progetti/AVM/harness-ui/src/legacy/app.js', caratteri: 900 });
  assert.equal(chip.genere, 'file');
  assert.equal(chip.nome, 'app.js');
  const lungo = chipAllegato({ percorso: 'C:/x/' + 'nome-lunghissimo-che-non-ci-sta-mai'.repeat(3) + '.txt', caratteri: 10 });
  assert.ok(lungo.nome.length <= 32, `accorciato: ${lungo.nome.length}`);
});

test('i generi si distinguono, e un allegato senza niente non rompe', () => {
  assert.equal(generePerLoSchermo({ tipo: 'immagine' }), 'immagine');
  assert.equal(generePerLoSchermo({ tipo: 'schermata' }), 'schermata');
  assert.equal(generePerLoSchermo({ daBrowser: true, tipo: 'immagine' }), 'pagina aperta', 'la pagina vince sul tipo');
  assert.equal(generePerLoSchermo(null), 'allegato');
  assert.equal(chipAllegato(null), null);
});

test('⛔ AL CONTRARIO — nessun allegato, nessun chip (la riga non deve comparire vuota)', () => {
  assert.deepEqual(chipDegliAllegati([]), []);
  assert.deepEqual(chipDegliAllegati(null), []);
  assert.deepEqual(chipDegliAllegati([null, undefined]), []);
});

test('l’ordine è quello in cui sono stati allegati', () => {
  const chip = chipDegliAllegati([
    { percorso: 'primo.txt', caratteri: 10 },
    { daBrowser: true, percorso: 'https://example.org/x', caratteri: 20 },
    { percorso: 'terzo.md', caratteri: 30 },
  ]);
  assert.deepEqual(chip.map((c) => c.nome), ['primo.txt', 'example.org', 'terzo.md']);
});
