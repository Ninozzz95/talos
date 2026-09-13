import test from 'node:test';
import assert from 'node:assert/strict';
import { porteLateraliAperte, SCRIVONO_LO_STESSO } from '../../src/components/permessi.js';

test('⛔ T03-D2: chiudere «scrivi» non chiude il terminale, e ora lo diciamo', () => {
  const r = porteLateraliAperte({ scrivi: 'nega', shell: 'sempre' }, 'Workspace write');
  // ⛔ non solo shell: con «Workspace write» anche documenti e immagini scrivono senza chiedere,
  //    quindi vanno nominati tutti e tre. La prima versione di questo test ne aspettava uno solo
  //    ed era l-ATTESO a essere sbagliato: un avviso che ne nomina uno su tre rassicura a torto.
  assert.deepEqual(r.aperte, ['shell', 'document_create', 'generate_image']);
  assert.match(r.avviso, /Hai chiuso «Scrivi un file»/u);
  assert.match(r.avviso, /un comando nel terminale/u);
});

test('«chiedi» su scrivi conta come chiuso: chi lo sceglie crede di essere protetto lo stesso', () => {
  const r = porteLateraliAperte({ scrivi: 'chiedi', shell: 'sempre' }, 'Read only');
  assert.deepEqual(r.aperte, ['shell']);
});

test('senza override, la porta è aperta o no secondo la politica di sessione', () => {
  // Full access: shell scrive senza chiedere niente
  assert.deepEqual(porteLateraliAperte({ scrivi: 'nega' }, 'Full access').aperte, Object.keys(SCRIVONO_LO_STESSO));
  // Read only: il kernel non scrive comunque, nessun avviso da dare
  assert.deepEqual(porteLateraliAperte({ scrivi: 'nega' }, 'Read only').aperte, []);
  // On request: la persona la richiesta la VEDE, quindi non viene ingannata
  assert.deepEqual(porteLateraliAperte({ scrivi: 'nega' }, 'On request').aperte, []);
});

test('⛔ AL CONTRARIO — niente avviso quando non c-è niente da avvisare', () => {
  // «scrivi» aperto: nessuno ha chiuso niente, l-avviso sarebbe rumore
  assert.equal(porteLateraliAperte({ shell: 'sempre' }, 'Full access').avviso, '');
  assert.equal(porteLateraliAperte({ scrivi: 'sempre', shell: 'sempre' }, 'Full access').avviso, '');
  // tutto chiuso davvero: nessuna porta laterale
  assert.equal(porteLateraliAperte({ scrivi: 'nega', shell: 'nega', document_create: 'nega', generate_image: 'nega' }, 'Full access').avviso, '');
  assert.equal(porteLateraliAperte({}, '').avviso, '');
});

test('il testo elenca tutte le vie, con la congiunzione giusta', () => {
  const r = porteLateraliAperte({ scrivi: 'nega' }, 'Full access');
  assert.match(r.avviso, /restano vie/u);
  assert.match(r.avviso, /, .* e /u, 'tre voci: virgola fra le prime e «e» prima dell-ultima');
  const uno = porteLateraliAperte({ scrivi: 'nega', document_create: 'nega', generate_image: 'nega' }, 'Full access');
  assert.match(uno.avviso, /resta una via/u);
});
