import assert from 'node:assert/strict';
import test from 'node:test';

import { talosSafeFileStem, tagliaSuConfineDiParola } from '../src/document-filename.mjs';

/*
 * ⛔ 10/09/2026 — visto nella FOTO di un giro vero sul 4174: il modello aveva generato un'immagine e
 * il file si chiamava «Un gatto rosso (arancione) che dorme, rannicchiato e tranquillo, in un comodo
 * an.jpg». Il taglio cadeva a metà di «angolo»: si aggiungeva un carattere alla volta finché il budget
 * di byte reggeva, e poi ci si fermava ovunque si fosse arrivati.
 *
 * Ricerca 10/09/2026: PatternFly «Truncation» (si sceglie dove tagliare in base a dove sta la parte
 * che distingue; ⛔ «distinct but lengthy names may become identical after truncation if
 * distinguishing features are located toward the end») e sadiqbd.com «Text Truncation Edge Cases»
 * (si arretra all'ultimo confine di parola, con un ripiego quando un confine non esiste).
 */
test('NOME-FILE: il taglio arretra all\u2019ultimo confine di PAROLA, mai a met\u00e0', () => {
  const prompt = 'Un gatto rosso (arancione) che dorme, rannicchiato e tranquillo, in un comodo angolo della casa';
  const nome = talosSafeFileStem(prompt, 80, 'immagine');

  assert.equal(nome, 'Un gatto rosso (arancione) che dorme, rannicchiato e tranquillo, in un comodo');
  assert.ok(!nome.endsWith('an'), '\u26d4 era il nome vero del 10/09: \u00ab\u2026in un comodo an\u00bb');
  assert.ok(prompt.startsWith(nome), 'ci\u00f2 che resta \u00e8 un prefisso VERO del titolo, non un rimescolamento');
  assert.ok(Buffer.byteLength(nome, 'utf8') <= 80, 'e sta dentro il budget di byte, che \u00e8 il vincolo del filesystem');
});

/*
 * ⛔ AL CONTRARIO — le tre situazioni in cui arretrare sarebbe PEGGIO del taglio duro. Una cura che
 * migliora il caso brutto e rovina quello normale non è una cura.
 */
test('NOME-FILE, AL CONTRARIO: nessun confine, o troppo nome da perdere \u2192 il taglio duro resta', () => {
  // una parola sola pi\u00f9 lunga del budget: non c'\u00e8 nessuno spazio a cui arretrare
  const unaParola = 'a'.repeat(120);
  assert.equal(talosSafeFileStem(unaParola, 80, 'x').length, 80, 'si taglia dove capita, perch\u00e9 non c\u2019\u00e8 alternativa');

  // uno spazio c'\u00e8, ma arretrare lascerebbe un moncone: meglio il taglio duro
  assert.equal(tagliaSuConfineDiParola('ab ' + 'c'.repeat(77), 80), 'ab ' + 'c'.repeat(77));

  // e un nome che ci sta tutto non si tocca MAI
  assert.equal(talosSafeFileStem('Relazione breve', 80, 'x'), 'Relazione breve');
  assert.equal(talosSafeFileStem('Titolo con spazi dentro', 200, 'x'), 'Titolo con spazi dentro');
});

test('NOME-FILE: dopo il taglio non resta punteggiatura appesa', () => {
  // \u26d4 PatternFly: si evita di tagliare a ridosso della punteggiatura \u2014 \u00abRelazione finale,\u00bb con la
  //   virgola in fondo \u00e8 un nome che sembra rotto.
  assert.equal(tagliaSuConfineDiParola('Relazione finale, con allegati vari', 34).endsWith(','), false);
  for (const segno of [',', '.', ';', ':', '!', '?', '-']) {
    const tagliato = tagliaSuConfineDiParola(`Titolo lungo${segno} coda che sparisce`, 30);
    assert.ok(!/[\s.,;:!?\-]$/.test(tagliato), `\u26d4 \u00ab${segno}\u00bb \u00e8 rimasto appeso in fondo`);
  }
});

test('NOME-FILE: la funzione pura non lancia sui casi vuoti', () => {
  assert.equal(tagliaSuConfineDiParola(''), '');
  assert.equal(tagliaSuConfineDiParola(null), '');
  assert.equal(tagliaSuConfineDiParola(undefined), '');
  assert.equal(tagliaSuConfineDiParola('senzaspazi'), 'senzaspazi');
  assert.equal(tagliaSuConfineDiParola(' iniziale'), ' iniziale', 'uno spazio in testa non \u00e8 un confine utile');
});
