import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';

async function avvia(t) {
  const server = createServer(createHttpApp({ staticHandler: async () => null }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

const chiedi = (base, domanda) => fetch(`${base}/api/v1/assistenza`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ domanda }),
});

test('FASE3-HELP-FONTE-REALE — una domanda vera riceve testo e citazione dal corpus tracciato', async (t) => {
  const base = await avvia(t);
  const risposta = await chiedi(base, 'Cosa fa Accesso pieno?');
  assert.equal(risposta.status, 200);
  const data = (await risposta.json()).data;
  assert.match(data.risposta, /Accesso pieno/i);
  assert.ok(data.risposta.length <= 1200, 'la risposta resta bounded');
  assert.ok(data.fonti.some((fonte) => fonte.percorso === 'docs/assistenza/permessi-di-sessione.md#accesso-pieno-per-esteso'));
});

test('FASE3-HELP-TALOS — identita, repository, licenza e versione arrivano dalla pagina di prodotto', async (t) => {
  const base = await avvia(t);
  const casi = [
    ['Che cos è TALOS?', /agente che deve dimostrare/i, '#cosa-fa'],
    ['Qual è la licenza di TALOS e qual è il repository pubblico?', /(?=[\s\S]*AGPL-3\.0-only)(?=[\s\S]*Ninozzz95\/talos)/i, '#i-dati-del-progetto-e-da-dove-si-leggono'],
    ['Qual è la versione di TALOS?', /tre dichiarazioni di versione[\s\S]*non concordano/i, '#la-versione-non-verificata'],
  ];
  for (const [domanda, contenuto, ancora] of casi) {
    const risposta = await chiedi(base, domanda);
    assert.equal(risposta.status, 200);
    const data = (await risposta.json()).data;
    assert.match(data.risposta, contenuto);
    assert.ok(data.fonti.some((fonte) => fonte.percorso === `docs/assistenza/che-cos-e-talos.md${ancora}`));
  }
});

test('FASE3-HELP-NON-LO-SO — una domanda fuori corpus non produce una risposta inventata', async (t) => {
  const base = await avvia(t);
  const risposta = await chiedi(base, 'zxqv astronautica melanzana quantistica 998877');
  assert.equal(risposta.status, 200);
  assert.deepEqual((await risposta.json()).data, { risposta: 'non lo so', fonti: [] });
});

test('FASE3-HELP-LIMITE — corpo estraneo, domanda vuota o oltre 500 caratteri sono 400', async (t) => {
  const base = await avvia(t);
  for (const corpo of [{ domanda: '' }, { domanda: 'x'.repeat(501) }, { domanda: 'note', modello: 'inventato' }]) {
    const risposta = await fetch(`${base}/api/v1/assistenza`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
    });
    assert.equal(risposta.status, 400);
  }
});
