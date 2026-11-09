/*
 * Spesa dei riassunti, il totale «dove c'è già» (owner 30/10/2026 sera; contratto CONTRATTO-SPESA-RIASSUNTI-SCHEDA-CONTESTO, forma per
 * fonte del totale con l'OK di CLI, Mobile e Performance): il campo `servizio` accanto a `usageSessione`, ogni spesa una volta.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { servizioDaEventi } from '../src/servizio-della-sessione.mjs';
import { usageSessioneDaEventi } from '../src/session-registry.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/spesa-ogni-spesa-una-volta.json', import.meta.url), 'utf8'));

test('SERVIZIO-SESSIONE-01 (prova comune) — il giornale comune: il campo atteso, il motore fuori, lo scopo sconosciuto dentro', () => {
  assert.deepEqual(servizioDaEventi(fixture.eventi), fixture.atteso.servizioDelServer);
  /* ogni spesa una volta: usageSessione del server ha già il motore (context.usage.recorded), il campo no */
  const sessione = usageSessioneDaEventi(fixture.eventi);
  assert.equal(sessione.prompt_tokens + sessione.completion_tokens, 880, 'usageSessione porta il motore dal contesto');
  const s = servizioDaEventi(fixture.eventi);
  assert.equal(sessione.prompt_tokens + sessione.completion_tokens + s.prompt_tokens + s.completion_tokens, 880 + 1155);
});

test('SERVIZIO-SESSIONE-02 — senza righe di servizio: null; una riga ripetuta (stessa sequenza) conta una volta; uso ignoto mai 0', () => {
  assert.equal(servizioDaEventi([]), null);
  assert.equal(servizioDaEventi([{ type: 'CUSTOM', name: 'consumo-fornitore', value: { usage: { prompt_tokens: 5 } } }]), null, 'la chat non entra');
  assert.equal(servizioDaEventi([{ type: 'CUSTOM', name: 'consumo-di-servizio', value: { scopo: 'motore', usage: { prompt_tokens: 5 } } }]), null, 'solo motore: già in usageSessione');
  const riga = { type: 'CUSTOM', name: 'consumo-di-servizio', _sequenza: 7, value: { scopo: 'compact', usage: { prompt_tokens: 10, completion_tokens: 2 } } };
  assert.deepEqual(servizioDaEventi([riga, riga]), { prompt_tokens: 10, completion_tokens: 2, misurate: 1, nonMisurate: 0 });
  assert.deepEqual(servizioDaEventi([{ type: 'CUSTOM', name: 'consumo-di-servizio', value: { scopo: 'riassunto', usage: null } }]),
    { prompt_tokens: 0, completion_tokens: 0, misurate: 0, nonMisurate: 1 });
});
