// 15/10/2026 sera, decisione dell'owner («sì, solo a schermo»): i nomi salvati nella forma di un taglio automatico di PRIMA si mostrano
// con la regola nuova; un nome scelto dalla persona non si tocca; sul disco non si scrive niente.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { nomeMostrato, titoloBreve } from '../src/titolo-breve.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const TESTO = 'ciao leggi i due documenti nella cartella , dimmi se la mia idea e concettualmente valida e se ha senso proseguire';
const NUOVO = titoloBreve(TESTO);

test('NOMI-DI-PRIMA-01 — ogni forma di prima del taglio automatico diventa il nome della regola nuova', () => {
  const pulito = TESTO.replace(/\s+/gu, ' ').trim();
  for (const vecchio of [pulito.slice(0, 80), `${pulito.slice(0, 77)}...`, `${pulito.slice(0, 79)}…`]) {
    assert.equal(nomeMostrato(vecchio, [TESTO]), NUOVO, vecchio);
  }
  assert.equal(nomeMostrato(pulito.slice(0, 80), [undefined, null, '', TESTO]), NUOVO, 'i testi mancanti non disturbano');
  // un testo con a capo e spazi doppi: la forma «pulita» e quella «grezza» del server sono DUE nomi diversi, tutti e due di prima
  const grezzo = TESTO.replace(' leggi', '\n\nleggi').replace(' documenti', '   documenti');
  const nuovoGrezzo = titoloBreve(grezzo);
  const pulitoGrezzo = grezzo.replace(/\s+/gu, ' ').trim();
  assert.notEqual(`${pulitoGrezzo.slice(0, 77)}...`, `${grezzo.slice(0, 77)}...`);
  assert.equal(nomeMostrato(`${pulitoGrezzo.slice(0, 77)}...`, [grezzo]), nuovoGrezzo, 'forma pulita');
  assert.equal(nomeMostrato(`${grezzo.slice(0, 77)}...`, [grezzo]), nuovoGrezzo, 'forma grezza');
});

test('NOMI-DI-PRIMA-02 — un doppione di prima («…-2») tiene il suo numero, che va prima dei puntini e dentro il tetto', () => {
  const vecchio = `${TESTO.slice(0, 80)}-2`;
  const nome = nomeMostrato(vecchio, [TESTO]);
  assert.ok(nome.endsWith('-2…'), nome.slice(-12));
  assert.ok([...nome].length <= 80);
});

test('NOMI-DI-PRIMA-03 — AL CONTRARIO: un nome scelto dalla persona, un testo corto o un nome di un\'altra sessione restano come sono', () => {
  assert.equal(nomeMostrato('Analisi dei documenti', [TESTO]), 'Analisi dei documenti');
  assert.equal(nomeMostrato('ciao!', ['ciao!']), 'ciao!', 'un testo corto era già intero');
  assert.equal(nomeMostrato(TESTO.slice(0, 80), ['un altro messaggio della persona']), TESTO.slice(0, 80), 'solo il SUO testo lo riconosce');
  assert.equal(nomeMostrato('Versione-2', ['Versione-2 del progetto']), 'Versione-2', 'un nome che finisce con un numero non è per forza un doppione');
  assert.equal(nomeMostrato(null, [TESTO]), null);
});

test('NOMI-DI-PRIMA-04 — alla rilettura dal disco la sessione si mostra col nome nuovo, e il disco resta com\'era', async (t) => {
  const cartellaStore = cartellaDiProva('talos-nomi-di-prima-');
  t.after(() => rimuoviCartellaDiProva(cartellaStore));
  const sessionId = '00000000-0000-4000-8000-0000000000aa';
  const righe = [
    { tipo: 'intestazione', schema: 1, sessionId, taskId: 'libero:prova', cartella: cartellaStore, task: { consegna: TESTO, consegnaCorta: `${TESTO.slice(0, 77)}...` },
      comandoProva: null, forkDa: null, avviataAlle: '2026-10-10T09:00:00.000Z', modello: 'z-ai/glm-5.3-flash', permessi: 'Full access', padreId: null, profonditaDelega: 0, provider: 'cloud', cartellaGiaScelta: true },
    { type: 'RunStarted', _sequenza: 1, threadId: sessionId, runId: 'r1' },
    { type: 'RunFinished', _sequenza: 2, threadId: sessionId, runId: 'r1', result: { detto: 'fatto' } },
    { tipo: 'nome-sessione', nome: TESTO.replace(/\s+/gu, ' ').trim().slice(0, 80) },
  ];
  const file = join(cartellaStore, `${sessionId}.jsonl`);
  writeFileSync(file, righe.map((r) => `${JSON.stringify(r)}\n`).join(''), 'utf8');
  const prima = readFileSync(file, 'utf8');
  const registro = createSessionRegistry({ cartellaStore, guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k', avviaSessioneFn: async () => ({ ok: true }) });
  await registro.ripristina({ soloSessioni: [sessionId] });
  const voce = registro.elenca().find((s) => s.sessionId === sessionId || s.id === sessionId);
  assert.equal(voce?.nome, NUOVO, JSON.stringify(voce?.nome));
  await attendiScritture({ cartellaStore });
  assert.equal(readFileSync(file, 'utf8'), prima, 'nessuna scrittura: è solo ciò che si mostra');
  await registro.chiudi({ attesaMassimaMs: 1_000 });
});
