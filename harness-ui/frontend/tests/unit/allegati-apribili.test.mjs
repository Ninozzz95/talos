import test from 'node:test';
import assert from 'node:assert/strict';
import { chipAllegato, chipDegliAllegati, destinazioneAllegato, percorsoApribile, relativoNellaRadice } from '../../src/components/allegati.js';

/*
 * Owner 26/10/2026: «dalla chat il file ordini dal pad si deve poter aprire se ci clicco sopra, come qualunque altro file». Il chip di
 * un allegato DENTRO la cartella della sessione porta la DESTINAZIONE del file; il relativo con cui il lettore lo apre si calcola al
 * clic, contro la radice di quel momento (revisione del blocco, A-F1/A-F2). Tutto il resto resta etichetta.
 */

test('ALL-APRI-01 il file mandato dal Pad (forma vera della sessione 357ae97e) si apre col suo percorso nella cartella', () => {
  const dalPad = { tipo: 'file', nome: 'ordini-dal-pad.csv', percorso: 'allegati/ordini-dal-pad.csv', caratteri: 77 };
  assert.equal(percorsoApribile(dalPad), 'allegati/ordini-dal-pad.csv');
  assert.equal(chipAllegato(dalPad).apribile, 'allegati/ordini-dal-pad.csv', 'base ignota: resta relativo');
  const chip = chipDegliAllegati([dalPad], '', { radice: 'C:/Progetti/x' })[0];
  assert.equal(chip.apribile, 'C:/Progetti/x/allegati/ordini-dal-pad.csv', 'base = radice quando il server non la dice');
  assert.equal(relativoNellaRadice(chip.apribile, 'C:/Progetti/x'), 'allegati/ordini-dal-pad.csv');
});

test('ALL-APRI-02 un assoluto DENTRO la radice torna relativo, anche con barre e maiuscole di Windows', () => {
  assert.equal(percorsoApribile({ assoluto: 'C:\\Users\\Nino\\Progetto\\dati\\ordini.csv' }, 'c:/users/nino/progetto'), 'dati/ordini.csv');
  assert.equal(percorsoApribile({ percorso: 'C:/Users/Nino/Progetto/a.txt' }, 'C:/Users/Nino/Progetto/'), 'a.txt');
  assert.equal(percorsoApribile({ percorso: './src/app.js' }), 'src/app.js');
  assert.equal(percorsoApribile({ percorso: 'note.txt' }), 'note.txt', 'un file alla radice della cartella si apre');
});

test('ALL-APRI-03 al contrario: fuori dalla cartella, pagine e percorsi strani NON si aprono (restano etichette)', () => {
  assert.equal(percorsoApribile({ percorso: 'C:/Altrove/segreto.txt' }, 'C:/Users/Nino/Progetto'), '', 'assoluto fuori dalla radice');
  assert.equal(percorsoApribile({ percorso: 'C:/Users/Nino/ProgettoBis/a.txt' }, 'C:/Users/Nino/Progetto'), '', 'cartella sorella col prefisso uguale');
  assert.equal(percorsoApribile({ percorso: 'C:/Users/Nino/Progetto/a.txt' }), '', 'assoluto senza radice nota');
  assert.equal(percorsoApribile({ percorso: '../fuori.txt' }), '');
  assert.equal(percorsoApribile({ percorso: 'dati/../../fuori.txt' }), '');
  assert.equal(percorsoApribile({ percorso: '~/note.md' }), '');
  assert.equal(percorsoApribile({ percorso: '/etc/passwd' }, ''), '');
  assert.equal(percorsoApribile({ percorso: 'C:foo.txt' }), '', 'unità senza barra (relativo all\'unità) — mutante sopravvissuto alla revisione');
  assert.equal(percorsoApribile({ percorso: 'dati//a.csv' }), '', 'segmento vuoto — mutante sopravvissuto alla revisione');
  assert.equal(percorsoApribile({ percorso: '\\\\server\\condivisa\\a.csv' }, 'C:/x'), '', 'UNC');
  assert.equal(percorsoApribile({ daBrowser: true, percorso: 'allegati/a.csv' }), '', 'una pagina NON si apre col lettore anche se il «percorso» sembra relativo');
  assert.equal(percorsoApribile({ nome: 'solo-nome-senza-percorso' }), '', 'senza percorso non si sa dove sia: si indovinerebbe');
  assert.equal(percorsoApribile({}), '');
  assert.equal(percorsoApribile(null), '');
  assert.equal(chipAllegato({ daBrowser: true, percorso: 'https://example.com/a' }).apribile, '');
});

test('ALL-APRI-04 (revisione A-F1) Accesso pieno da un progetto: radice = il disco, il file della chat sta nella cartella di PARTENZA', () => {
  const dalPad = { tipo: 'file', nome: 'a.csv', percorso: 'allegati/a.csv' };
  const destinazione = destinazioneAllegato(dalPad, { base: 'C:\\progetti\\AVM' });
  assert.equal(destinazione, 'C:/progetti/AVM/allegati/a.csv');
  assert.equal(relativoNellaRadice(destinazione, 'C:\\'), 'progetti/AVM/allegati/a.csv', 'il lettore lo chiede dalla radice vera');
  assert.equal(chipAllegato(dalPad, '', { radice: 'C:\\', base: 'C:\\progetti\\AVM' }).apribile, 'C:/progetti/AVM/allegati/a.csv');
});

test('ALL-APRI-05 (revisione A-F2) la radice cambia a sessione aperta: il relativo segue la radice di ADESSO', () => {
  const chip = chipAllegato({ tipo: 'file', percorso: 'allegati/a.csv' }, '', { radice: 'C:/progetti/AVM' });
  assert.equal(relativoNellaRadice(chip.apribile, 'C:/progetti/AVM'), 'allegati/a.csv');
  assert.equal(relativoNellaRadice(chip.apribile, 'C:/'), 'progetti/AVM/allegati/a.csv', 'radice allargata');
  assert.equal(relativoNellaRadice(chip.apribile, 'C:/progetti/AVM/src'), '', 'radice ristretta: il file ne sta fuori, nessuna lettura');
});

test('ALL-APRI-06 maiuscole indifferenti SOLO su Windows: su una radice Linux contano', () => {
  assert.equal(relativoNellaRadice('/home/nino/Progetto/a.txt', '/home/nino/progetto'), '');
  assert.equal(relativoNellaRadice('/home/nino/progetto/a.txt', '/home/nino/progetto'), 'a.txt');
  assert.equal(relativoNellaRadice('C:/Users/Nino/a.txt', 'c:/users/nino'), 'a.txt');
});
