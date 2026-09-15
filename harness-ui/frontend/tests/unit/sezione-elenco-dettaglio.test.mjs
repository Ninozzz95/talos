import test from 'node:test';
import assert from 'node:assert/strict';
import {
  larghezzaDettaglio, ordinaVoci, filtraVoci, contaPerFiltro, sommarioSezione,
  selezioneDopoBatch,
  leggiPreferenze, salvaPreferenze, CHIAVE_PREFERENZE, LARGHEZZA_MINIMA, LARGHEZZA_MASSIMA, LARGHEZZA_NORMALE,
} from '../../src/components/sezione-elenco-dettaglio.js';
import { anteprima, conteggioParole, estensioneFile, dataBreve } from '../../src/components/sezioni-adattatori.js';

/*
 * Lotto C, 11/09/2026 — la logica pura della sezione elenco+dettaglio.
 * ⛔ Ogni prova sta anche NEL VERSO CONTRARIO: non basta che un filtro lasci passare ciò che deve,
 *   deve anche respingere ciò che non deve — è la regola che ha scoperto il cancello semantico
 *   spento da sempre (27/8).
 */

const chiavi = { titoloDi: (v) => v.titolo, quandoDi: (v) => v.quando };

test('SED-LARGHEZZA: la misura del dettaglio non esce mai dagli estremi dichiarati all’ARIA', () => {
  assert.equal(larghezzaDettaglio(440), 440);
  assert.equal(larghezzaDettaglio(10), LARGHEZZA_MINIMA);
  assert.equal(larghezzaDettaglio(99_999), LARGHEZZA_MASSIMA);
  assert.equal(larghezzaDettaglio(437.6), 438); // intero: `aria-valuenow` non porta decimali
  // ⛔ verso contrario: un valore che non è un numero non diventa 0 (un pannello largo zero è sparito)
  for (const brutto of [null, undefined, NaN, 'quattrocento', {}, Infinity]) {
    assert.equal(larghezzaDettaglio(brutto), LARGHEZZA_NORMALE, `«${String(brutto)}» doveva tornare al valore normale`);
  }
});

test('SED-ORDINE: per data la più recente è prima, e chi non ha data finisce in fondo — non in cima', () => {
  const voci = [
    { id: 'b', titolo: 'Beta', quando: '2026-09-02T10:00:00Z' },
    { id: 'senza', titolo: 'Zulu', quando: null },
    { id: 'a', titolo: 'Alfa', quando: '2026-09-10T10:00:00Z' },
    { id: 'rotta', titolo: 'Èlite', quando: 'non-una-data' },
  ];
  assert.deepEqual(ordinaVoci(voci, 'nuovo', chiavi).map((v) => v.id), ['a', 'b', 'senza', 'rotta']);
  // ⛔ l'array di partenza non si tocca: due sezioni leggono gli stessi dati
  assert.deepEqual(voci.map((v) => v.id), ['b', 'senza', 'a', 'rotta']);
  // A-Z all'italiana: «Èlite» sta con la E, non dopo la Z
  assert.deepEqual(ordinaVoci(voci, 'titolo', chiavi).map((v) => v.titolo), ['Alfa', 'Beta', 'Èlite', 'Zulu']);
});

test('SED-FILTRI: il filtro e la ricerca si INTERSECANO, e un filtro che non conosce nessuno non filtra', () => {
  const voci = [
    { id: 1, stato: 'todo', testo: 'chiamare idraulico' },
    { id: 2, stato: 'done', testo: 'idraulico venuto' },
    { id: 3, stato: 'done', testo: 'altro' },
  ];
  const filtri = [
    { id: 'tutte', etichetta: 'Tutte' },
    { id: 'done', etichetta: 'Fatte', quando: (v) => v.stato === 'done' },
  ];
  const cercaIn = (v) => v.testo;
  assert.deepEqual(filtraVoci(voci, { filtro: 'done', query: ' IDRAULICO ', filtri, cercaIn }).map((v) => v.id), [2]);
  // ⛔ verso contrario: lo stesso filtro DEVE respingere chi non è `done`
  assert.deepEqual(filtraVoci(voci, { filtro: 'done', filtri, cercaIn }).map((v) => v.id), [2, 3]);
  assert.deepEqual(filtraVoci(voci, { filtro: 'tutte', filtri, cercaIn }).map((v) => v.id), [1, 2, 3]);
  // una query che non c'entra niente non lascia passare nessuno
  assert.equal(filtraVoci(voci, { filtro: 'tutte', query: 'zzz', filtri, cercaIn }).length, 0);
  assert.deepEqual(filtraVoci(voci, { filtro: 'inesistente', filtri, cercaIn }).map((v) => v.id), [1, 2, 3]);
});

test('SED-CONTEGGI: i numeri dei filtri si contano sull’elenco INTERO, non su quello già filtrato', () => {
  const voci = [{ stato: 'todo' }, { stato: 'done' }, { stato: 'done' }];
  const filtri = [
    { id: 'tutte', etichetta: 'Tutte' },
    { id: 'todo', etichetta: 'Da fare', quando: (v) => v.stato === 'todo' },
    { id: 'done', etichetta: 'Fatte', quando: (v) => v.stato === 'done' },
    { id: 'mai', etichetta: 'Mai', quando: () => false },
  ];
  assert.deepEqual(contaPerFiltro(voci, filtri), [3, 1, 2, 0]);
  assert.deepEqual(contaPerFiltro([], filtri), [0, 0, 0, 0]);
});

test('SED-SOMMARIO: «3 di 12» solo quando qualcosa è nascosto, e lo zero prende il plurale', () => {
  assert.equal(sommarioSezione(12, 12, 'ricordo'), '12 ricordi');
  assert.equal(sommarioSezione(3, 12, 'ricordo'), '3 di 12 ricordi');
  assert.equal(sommarioSezione(0, 0, 'ricordo'), '0 ricordi');
  assert.equal(sommarioSezione(1, 1, 'ricordo'), '1 ricordo');
  assert.equal(sommarioSezione(1, 1, 'progetto', 'progetti'), '1 progetto');
  assert.equal(sommarioSezione(2, 2, 'progetto', 'progetti'), '2 progetti');
});

test('FASE3-MULTISELECT-PARZIALE: escono solo i successi; falliti e non rendicontati restano selezionati', () => {
  const dopo = selezioneDopoBatch(new Set(['a', 'b', 'c']), {
    esiti: [{ id: 'a', ok: true }, { id: 'b', ok: false, code: 'NOTE_NOT_FOUND' }],
  });
  assert.deepEqual([...dopo], ['b', 'c']);
  assert.deepEqual([...selezioneDopoBatch(['a'], null)], ['a'], 'una risposta malformata non finge alcuna cancellazione');
});

function magazzinoFinto(iniziale = {}) {
  let dati = { ...iniziale };
  return {
    getItem: (k) => (k in dati ? dati[k] : null),
    setItem: (k, v) => { dati[k] = String(v); },
    leggi: () => dati,
  };
}

test('SED-PREFERENZE: vista, ordine e larghezza sopravvivono al giro, e un file guasto non blocca la pagina', () => {
  const magazzino = magazzinoFinto();
  assert.deepEqual(leggiPreferenze('note', magazzino), { vista: 'schede', ordine: 'nuovo', larghezza: LARGHEZZA_NORMALE });
  assert.equal(salvaPreferenze('note', { vista: 'elenco', ordine: 'titolo', larghezza: 9000 }, magazzino), true);
  assert.deepEqual(leggiPreferenze('note', magazzino), { vista: 'elenco', ordine: 'titolo', larghezza: LARGHEZZA_MASSIMA });
  // ⛔ una sezione non calpesta l'altra
  salvaPreferenze('memoria', { vista: 'schede', ordine: 'nuovo', larghezza: 500 }, magazzino);
  assert.equal(leggiPreferenze('note', magazzino).vista, 'elenco');
  assert.equal(leggiPreferenze('memoria', magazzino).larghezza, 500);
  // ⛔ verso contrario: JSON rotto, valori inventati, e un magazzino che LANCIA
  const rotto = magazzinoFinto({ [CHIAVE_PREFERENZE]: '{non json' });
  assert.deepEqual(leggiPreferenze('note', rotto), { vista: 'schede', ordine: 'nuovo', larghezza: LARGHEZZA_NORMALE });
  const bugiardo = magazzinoFinto({ [CHIAVE_PREFERENZE]: JSON.stringify({ note: { vista: 'griglia3d', ordine: 'a caso', larghezza: 'tanto' } }) });
  assert.deepEqual(leggiPreferenze('note', bugiardo), { vista: 'schede', ordine: 'nuovo', larghezza: LARGHEZZA_NORMALE });
  const ostile = { getItem: () => { throw new Error('niente storage'); }, setItem: () => { throw new Error('niente storage'); } };
  assert.deepEqual(leggiPreferenze('note', ostile), { vista: 'schede', ordine: 'nuovo', larghezza: LARGHEZZA_NORMALE });
  assert.equal(salvaPreferenze('note', { vista: 'elenco', ordine: 'titolo', larghezza: 400 }, ostile), false);
});

test('SED-ANTEPRIMA: i cancelletti del Markdown non si vedono, e il taglio non lascia i puntini soli', () => {
  assert.equal(anteprima('# Titolo\n\ntesto'), 'Titolo\n\ntesto');
  assert.equal(anteprima('a\n\n\n\n\nb'), 'a\n\nb');
  assert.equal(anteprima('parola ' + 'x'.repeat(400), 10), 'parola xxx…'); // taglio netto a 10 caratteri
  assert.equal(anteprima('parola' + ' '.repeat(20) + 'x'.repeat(400), 10), 'parola…'); // ⛔ niente puntini dopo uno spazio
  assert.equal(anteprima(null), '');
  assert.equal(conteggioParole('  due   parole '), 2);
  assert.equal(conteggioParole(''), 0);
});

test('SED-ESTENSIONE: un nome senza punto non diventa un’estensione inventata', () => {
  assert.equal(estensioneFile('contratto-eventi.json'), 'JSON');
  assert.equal(estensioneFile('LEDGER.md'), 'MD');
  assert.equal(estensioneFile('senzapunto'), 'FILE');
  assert.equal(estensioneFile(''), 'FILE');
  assert.equal(estensioneFile('archivio.tar.gz'), 'GZ');
});

test('SED-DATA: una data non registrata resta vuota invece di diventare il 1970', () => {
  assert.equal(dataBreve('2026-09-04T18:00:00.000Z'), new Date('2026-09-04T18:00:00.000Z').toLocaleDateString('it-IT'));
  assert.equal(dataBreve(null), '');
  assert.equal(dataBreve('non-una-data'), '');
  assert.equal(dataBreve(undefined), '');
});
