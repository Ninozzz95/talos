import test from 'node:test';
import assert from 'node:assert/strict';

import { avanzaScansione, chiudiInArrivo, confineDiRivelazione, confineGrafema, creaScansione, separatoreTabella } from '../../src/components/markdown-in-arrivo.js';

/*
 * 22/10/2026 — IL MARKDOWN CHE STA ARRIVANDO (streaming fluido, owner: «fluido e dinamico in base al testo dell'output»).
 * Tre funzioni pure: dove si può tagliare (`avanzaScansione`), fin dove si può mostrare (`confineDiRivelazione`), come si
 * disegna la coda a metà (`chiudiInArrivo`). L'equivalenza col renderer vero, prefisso per prefisso, sta nel browser
 * (`tests/browser/streaming-fluido.spec.mjs`, FLUIDO-01): qui i casi, ognuno anche al contrario.
 */

const scansiona = (testo, limite = testo.length) => {
  const s = creaScansione();
  const confine = avanzaScansione(s, testo, limite);
  return { confine, coda: testo.slice(confine, limite), dentroFence: s.dentroFence };
};

test('MD-ARRIVO-01 — i confini stabili: riga vuota, prima e dopo un recinto, attorno a titoli e separatori, prima di una tabella', () => {
  assert.deepEqual(scansiona('Uno.\n\nDue'), { confine: 6, coda: 'Due', dentroFence: false });
  /* prima di un recinto: la coda è il recinto aperto e basta */
  assert.equal(scansiona('Testo\n```js\nconst a = 1;\n').coda, '```js\nconst a = 1;\n');
  assert.equal(scansiona('Testo\n```js\nconst a = 1;\n').dentroFence, true);
  /* dopo la sua chiusura il recinto è stabile */
  assert.equal(scansiona('```\nx\n```\nDopo').coda, 'Dopo');
  /* titoli e separatori sono blocchi di una riga */
  assert.equal(scansiona('Para\n## Titolo\nSotto').coda, 'Sotto');
  assert.equal(scansiona('Para\n---\nSotto').coda, 'Sotto');
  /* prima di un'intestazione di tabella (la separazione è già arrivata intera) */
  assert.equal(scansiona('Para\n| a | b |\n|---|---|\n| 1 | 2 |').coda, '| a | b |\n|---|---|\n| 1 | 2 |');
});

test('MD-ARRIVO-02 — al contrario: niente tagli dove il renderer NON chiude il blocco', () => {
  /* dentro un recinto righe vuote, titoli e separatori sono codice */
  assert.equal(scansiona('```\n\n## non titolo\n---\n').confine, 0);
  /* «  ---» e «  ## x» rientrati sono il seguito di una voce d'elenco, non blocchi */
  assert.equal(scansiona('- voce\n  ---\n  ## seguito\nancora').confine, 0);
  /* una riga con UNA sola cella non è una tabella: niente taglio davanti */
  assert.equal(scansiona('Para\n|a|\n|-|\n').confine, 0);
  /* un recinto dentro una citazione non spezza la citazione */
  assert.equal(scansiona('> citazione\n```\nx\n').confine, 0);
});

test('MD-ARRIVO-03 — la scansione è incrementale e riparte da zero se il testo non continua quello visto', () => {
  const s = creaScansione();
  avanzaScansione(s, 'Uno.\n\nDue\n', 11);
  assert.equal(s.confine, 6);
  assert.equal(s.pos, 10);
  avanzaScansione(s, 'Uno.\n\nDue\n\nTre', 15);
  assert.equal(s.confine, 11);
  /* un testo riscritto: la riga già vista non c'è più al suo posto ⇒ si ricomincia */
  avanzaScansione(s, 'Altro testo\nsenza righe vuote\n', 30);
  assert.equal(s.confine, 0);
});

test('MD-ARRIVO-04 — fin dove si mostra: segni di blocco interi, righe che non si sanno ancora classificare tenute', () => {
  assert.equal(confineDiRivelazione('ciao\n## Ti', 7), 8, 'il segno del titolo passa intero');
  assert.equal(confineDiRivelazione('ciao\n- vo', 6), 7, 'il segno della voce passa intero');
  assert.equal(confineDiRivelazione('ciao\n#', 5), 5, 'un «#» da solo in fondo: si aspetta di sapere che cosa diventa');
  assert.equal(confineDiRivelazione('ciao\n#', 6), 5, 'anche quando è l\'ultima cosa arrivata (chi chiama non torna mai indietro: tiene il massimo)');
  assert.equal(confineDiRivelazione('ciao\n#', 6, { finito: true }), 6, 'a messaggio finito tutto è intero');
  assert.equal(confineDiRivelazione('a\n```j', 4), 2, 'la riga del recinto aspetta il suo a capo');
  assert.equal(confineDiRivelazione('a\n```js\ncode', 4), 8, 'e poi passa intera');
  assert.equal(confineDiRivelazione('```\ncodice ## non segno', 10, { dentroFence: true }), 10, 'dentro un recinto nessuna regola: è codice');
});

test('MD-ARRIVO-05 — la tabella: intestazione insieme alla separazione, poi le righe di dati crescono cella per cella', () => {
  const t = 'p\n| a | b |\n|---|---|\n| 1 | 2 |\n| 3';
  assert.equal(confineDiRivelazione(t, 5), 22, 'intestazione + separazione in un colpo');
  assert.equal(confineDiRivelazione('p\n| a | b |\n', 5), 2, 'un\'intestazione senza la sua separazione si tiene');
  assert.equal(confineDiRivelazione(t, 23), 24, 'la barra d\'apertura di una riga di dati passa in un colpo');
  assert.equal(confineDiRivelazione(t, 26), 26, 'dentro la riga di dati: carattere per carattere');
  assert.ok(separatoreTabella('|:---|---:|') && !separatoreTabella('---'), 'la separazione vuole le barre');
});

test('MD-ARRIVO-06 — l\'indirizzo di un collegamento e i segni in linea', () => {
  assert.equal(confineDiRivelazione('x [link](https://a.b/c) dopo', 12), 23, 'dentro l\'indirizzo: fino alla parentesi che lo chiude');
  /* 23/10/2026 (FLUIDO-03-LINK): la parentesi non è arrivata — l'indirizzo arrivato non si vede, quindi passa tutto invece di fermare il
     testo davanti a «](»; la coda lo toglie e lascia il testo del collegamento */
  assert.equal(confineDiRivelazione('x [link](https://a.b', 12), 'x [link](https://a.b'.length, 'la parentesi non è arrivata: l\'indirizzo arrivato passa tutto');
  assert.equal(chiudiInArrivo('x [link](https://a.b'), 'x link', 'e a schermo resta solo il testo del collegamento');
  assert.equal(confineDiRivelazione('x [link](https://a.b\nseguito', 12), 12, 'AL CONTRARIO su una riga già chiusa senza parentesi non è un collegamento: niente salto, il confine resta dov\'è');
  /* revisione avversaria di 0d2f5a5d4: un «](» che NON è un collegamento in arrivo (dentro un codice in linea, o con uno spazio dopo)
     non fa saltare la riga — quella riga va al ritmo e la regola dei segni vale ancora (prima: `**` isolati a schermo) */
  const codice = 'Usa `a](b` per unire, poi **gra';
  assert.equal(confineDiRivelazione(codice, 12), 12, 'un «](» dentro un codice in linea: niente salto');
  assert.equal(confineDiRivelazione(codice, codice.length - 4), codice.length - 2, 'e il segno che apre esce con la sua prima lettera, come ovunque');
  /* 23/10/2026 sera (revisione di fbc96a282, F2): un indirizzo con uno spazio non è un collegamento — ma finché lo spazio non è a
     schermo la coda lo prende per un indirizzo e lo nasconde: la parte fino allo spazio passa in un colpo, spazio compreso, poi si
     va al ritmo (prima si rivelava un carattere alla volta mentre il testo visibile stava fermo: 67 ms nella scena FLUIDO-03-SPAZIO) */
  assert.equal(confineDiRivelazione('x [link](https://a.b c', 12), 21, 'un indirizzo con uno spazio: fino allo spazio compreso, in un colpo');
  assert.equal(chiudiInArrivo('x [link](https://a.b '), 'x [link](https://a.b ', 'AL CONTRARIO: con lo spazio a schermo la coda non lo nasconde più, si vede');
  assert.equal(confineDiRivelazione('x [link](https://a.b c d', 22), 22, 'e dopo lo spazio la riga va al ritmo');
  /* F2: la domanda si fa su QUEL «](». Un «](» in un codice in linea non chiude il testo di un collegamento: né la prima «)» della
     riga né un collegamento che arriva più avanti lo fanno saltare (fbc96a282: salti visibili da 62-67 caratteri) */
  const parentesi = 'Usa `a](b` per unire (vedi sotto) poi';
  assert.equal(confineDiRivelazione(parentesi, 8), 8, '«(vedi sotto)» dopo un «](» nel codice: niente salto fino alla sua «)»');
  const arrivo = 'Usa `a](b` poi leggi [la guida](https://x.it/g';
  assert.equal(confineDiRivelazione(arrivo, 8), 8, 'un collegamento che arriva più avanti non fa saltare il «](» del codice');
  assert.equal(confineDiRivelazione(arrivo, arrivo.indexOf('](https') + 1), arrivo.length, 'AL CONTRARIO: al «](» del collegamento sì, in fondo');
  assert.equal(chiudiInArrivo(arrivo), 'Usa `a](b` poi leggi la guida', 'e la coda toglie quell\'indirizzo, non il «](» del codice');
  assert.equal(confineDiRivelazione('nota: f](**', 9), 9, 'un «](» che non chiude il testo di un collegamento non salta: un `**` dopo di lui resta alla regola dei segni');
  assert.equal(confineDiRivelazione('x **bo', 3), 5, 'il segno che apre esce con la sua prima lettera');
  assert.equal(confineDiRivelazione('x **', 4), 2, 'un segno in coda che non si sa se apre: si aspetta');
  assert.equal(confineDiRivelazione('2 * 3 = 6', 3), 3, 'seguito da uno spazio non apre niente');
});

test('MD-ARRIVO-07 — mai a metà di un grafema', () => {
  assert.equal(confineGrafema('a👍🏽b', 2), 5, 'emoji con modificatore: intera');
  assert.equal(confineGrafema('a👍🏽b', 3), 5);
  assert.equal(confineGrafema(`${'é'}x`, 1), 2, 'accento combinato: con la sua lettera');
  assert.equal(confineGrafema('abc', 1), 1, 'testo semplice: la via veloce, nessuno spostamento');
});

test('MD-ARRIVO-08 — la coda in arrivo si disegna coi segni aperti chiusi per finta, e mai dentro un recinto', () => {
  assert.equal(chiudiInArrivo('ciao **gra'), 'ciao **gra**');
  assert.equal(chiudiInArrivo('ciao `cod'), 'ciao `cod`');
  assert.equal(chiudiInArrivo('un *corsi'), 'un *corsi*');
  assert.equal(chiudiInArrivo('x _sott'), 'x _sott_');
  assert.equal(chiudiInArrivo('vedi [link](http'), 'vedi link');
  assert.equal(chiudiInArrivo('vedi [lin'), 'vedi lin');
  /* al contrario: ciò che non apre niente resta com'è */
  assert.equal(chiudiInArrivo('2 * 3 = 6'), '2 * 3 = 6');
  assert.equal(chiudiInArrivo('file_nome'), 'file_nome');
  assert.equal(chiudiInArrivo('già **chiuso** qui'), 'già **chiuso** qui');
  assert.equal(chiudiInArrivo('const a = **b', { dentroFence: true }), 'const a = **b');
  /* solo l'ultima riga: le righe sopra sono già intere */
  assert.equal(chiudiInArrivo('riga **uno**\ndue **tr'), 'riga **uno**\ndue **tr**');
});

/*
 * 23/10/2026 sera (revisione avversaria di fbc96a282, F2) — IL SALTO E LA CODA DICONO LA STESSA COSA, NEI DUE VERSI.
 * `confineDiRivelazione` decide che cosa passa in un colpo perché «non si vede»; `chiudiInArrivo` decide che cosa a schermo non si
 * vede. Se le due si separano, o il testo salta su caratteri visibili (a scatti, e senza la regola dei segni) o il ritmo spende
 * tempo su caratteri nascosti (testo fermo). Righe costruite apposta — un prefisso qualunque (anche con un «](» nel codice, una «)»
 * o un collegamento già chiuso), poi un collegamento col suo indirizzo ancora in arrivo — e ogni `k` dopo il suo «](».
 */
test('MD-ARRIVO-09 — dove la rivelazione salta un indirizzo la coda lo nasconde; dove la coda lo mostra il salto si ferma allo spazio', () => {
  const prefissi = ['', 'Usa `a](b` poi ', 'vedi (sotto) e ', 'già [uno](https://a.it/1) e ', 'x **forte** e ', '- '];
  const testi = ['la guida', 'a [b'];
  const indirizzi = ['https://x.it/g', 'https://x.it/a_(b', 'C:/I miei file', ' C:/x'];
  let casi = 0;
  for (const prefisso of prefissi) for (const testo of testi) for (const indirizzo of indirizzi) {
    const riga = `${prefisso}[${testo}](${indirizzo}`;
    const apertura = riga.lastIndexOf('](');
    const spazio = indirizzo.search(/\s/u);
    for (let k = apertura + 1; k <= riga.length; k += 1) {
      const confine = confineDiRivelazione(riga, k);
      casi += 1;
      if (spazio === -1) {
        assert.equal(confine, riga.length, `«${riga}» k=${k}: l'indirizzo in arrivo passa in un colpo`);
        assert.ok(!chiudiInArrivo(riga).includes(`](${indirizzo}`), `«${riga}»: e a schermo non si vede`);
      } else {
        const dopoLoSpazio = apertura + 2 + spazio + 1;
        assert.equal(confine, Math.max(k, dopoLoSpazio), `«${riga}» k=${k}: con uno spazio il salto si ferma dopo lo spazio, poi il ritmo`);
        const mostrato = riga.slice(0, dopoLoSpazio);
        assert.ok(chiudiInArrivo(mostrato).endsWith(riga.slice(apertura, dopoLoSpazio)), `«${mostrato}»: ciò che è passato in un colpo si vede subito`);
      }
    }
  }
  assert.ok(casi > 400, `casi provati: ${casi}`);
});
