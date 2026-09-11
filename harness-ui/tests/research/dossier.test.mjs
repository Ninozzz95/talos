import test from 'node:test';
import assert from 'node:assert/strict';
import { talosResearchDossierDocument, talosResearchParseDossier } from '../../src/research/dossier.mjs';

/*
 * TRADOTTO da AVM/mobile/tests/unit/research/researchDossier.test.ts (vitest → node:test).
 * Stessi casi, stesso ordine, stesse attese.
 *
 * Un dossier che leggono sia una persona sia un processo. Un documento solo:
 * prosa per chi legge, record recintato in fondo per chi riprende la corsa ore
 * dopo. Scritti dallo stesso oggetto, così non possono divergere.
 */

const COLLECTION = {
  branchId: 'b1',
  query: 'chi vinse il gran premio — fatti e numeri',
  sources: [
    {
      url: 'https://rainews.it/x',
      title: 'Norris vince davanti a Verstappen',
      publishedAt: '2026-07-26',
      text: 'Lando Norris ha vinto il Gran Premio d’Ungheria 2026.',
      obtained: 'page',
    },
    {
      url: 'https://oasport.it/y',
      title: 'Ordine d’arrivo',
      publishedAt: null,
      text: 'Antonelli terzo.',
      obtained: 'snippet',
    },
  ],
  unreachable: [{ url: 'https://dead.example', reason: '403' }],
  spend: { searches: 1, pages: 1, tokens: 20 },
};

test('DOSSIER-01 torna esattamente com’è entrato', () => {
  const back = talosResearchParseDossier(talosResearchDossierDocument(COLLECTION));

  // I passaggi devono sopravvivere byte per byte: il controllo delle citazioni
  // si fa contro di loro, quindi qualsiasi cosa persa qui diventa
  // un'affermazione segnata come non sostenuta per una ragione che non ha
  // niente a che fare con l'affermazione.
  assert.deepEqual(back.sources, COLLECTION.sources);
  assert.deepEqual(back.unreachable, COLLECTION.unreachable);
  assert.equal(back.query, COLLECTION.query);
});

test('DOSSIER-02 si legge ancora come un documento, con la parte per la macchina fuori dai piedi', () => {
  const documento = talosResearchDossierDocument(COLLECTION);

  assert.equal(documento.startsWith('# chi vinse'), true);
  assert.ok(documento.includes('Lando Norris ha vinto'));
  assert.ok(documento.includes('(solo estratto dal motore di ricerca)'));
  // Per ultimo, così un'anteprima o un estratto di ricerca mostra prosa e non JSON.
  assert.ok(documento.indexOf('```talos-research-json') > documento.indexOf('Antonelli terzo.'));
});

test('DOSSIER-03 ⛔ rifiuta un documento che non sa recuperare, invece di indovinare', () => {
  // IL rifiuto. Una sintesi sta per controllare le proprie citazioni contro
  // questi passaggi; un dossier recuperato a metà verificherebbe affermazioni
  // contro un testo che non è quello che è stato letto — peggio che non averlo.
  assert.equal(talosResearchParseDossier('# solo prosa, nessun blocco'), null);
  assert.equal(talosResearchParseDossier('```talos-research-json\n{ rotto'), null);
  assert.equal(talosResearchParseDossier('```talos-research-json\n{"version":9}\n```'), null);
});

test('DOSSIER-04 non porta la spesa, che il giornale conta già', () => {
  const back = talosResearchParseDossier(talosResearchDossierDocument(COLLECTION));

  // Una seconda copia di un numero che si somma è un numero che prima o poi
  // viene sommato due volte.
  assert.deepEqual(back.spend, { searches: 0, pages: 0, tokens: 0 });
});
