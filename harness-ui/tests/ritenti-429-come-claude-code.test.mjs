/*
 * 429 a raffica (stress test della 0.5.2, 09/10/2026, sessione 2c26d189, `zai:glm-5.3-flash` sul piano GLM): dopo 68 minuti un vero
 * 429 di Z.AI senza Retry-After ha consumato i 4 tentativi in ~7 s (attese 0,6 / 1,4 / 2,6 s) e il giro è finito con «limiting
 * requests… retried and then stopped». Owner 09/10: «fai esattamente come fa Claude Code». Claude Code: 10 ritentativi oltre
 * alla prima richiesta (`CLAUDE_CODE_MAX_RETRIES`, predefinito 10), attesa `min(500·2^(n-1), 32000)` + jitter — la formula è già
 * quella di `attesaDelTentativo` (BUG-25); mancava il numero. Desktop r4 (cc6783a6f) aveva lo stesso 4.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { chiamaConRitenta, attesaDelTentativo } from '../src/kernel/talosHarness.mjs';

const ok = () => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'arrivata' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
const troppe = () => new Response(JSON.stringify({ error: { message: 'Too many requests' } }), { status: 429, headers: { 'Content-Type': 'application/json' } });

function rete(quanti429) {
  let n = 0;
  return { get n() { return n; }, fetch: async () => { n += 1; return n <= quanti429 ? troppe() : ok(); } };
}

test('RITENTI-429-01: dieci 429 di fila e poi la risposta — il giro chiude, come Claude Code (1 + 10 tentativi)', async () => {
  const r = rete(10); const attese = [];
  const esito = await chiamaConRitenta({ modello: 'x', chiave: 'y', messaggi: [{ role: 'user', content: 'ciao' }], attrezzi: [],
    fetchDiRete: r.fetch, dormi: async (ms) => { attese.push(ms); }, caso: () => 0 });
  assert.equal(r.n, 11, 'la prima richiesta più dieci ritentativi');
  assert.equal(esito.scelta?.content ?? esito.content ?? esito?.choices?.[0]?.message?.content, 'arrivata');
  assert.deepEqual(attese, [500, 1000, 2000, 4000, 8000, 16000, 32000, 32000, 32000, 32000], 'la scala di Claude Code, tetto 32 s');
});

test('RITENTI-429-02: oltre gli undici tentativi si ferma e lo dice', async () => {
  const r = rete(99);
  await assert.rejects(chiamaConRitenta({ modello: 'x', chiave: 'y', messaggi: [{ role: 'user', content: 'ciao' }], attrezzi: [],
    fetchDiRete: r.fetch, dormi: async () => {}, caso: () => 0 }), (e) => { assert.equal(e.stato ?? e.status, 429); return true; });
  assert.equal(r.n, 11);
});

test('RITENTI-429-03: la formula d\'attesa resta quella di Claude Code (500·2^n, tetto 32 s, jitter fino al 50% sotto il tetto)', () => {
  assert.equal(attesaDelTentativo(0, () => 0), 500);
  assert.equal(attesaDelTentativo(6, () => 0), 32_000);
  assert.equal(attesaDelTentativo(9, () => 1), 32_000);
});

test('RITENTI-429-04: TALOS_MAX_RETRIES cambia i ritentativi come CLAUDE_CODE_MAX_RETRIES; un valore illeggibile torna a 10, oltre 15 si riduce a 15', async () => {
  const { ritentativiDiSerie } = await import('../src/kernel/talosHarness.mjs');
  assert.equal(ritentativiDiSerie({}), 10);
  assert.equal(ritentativiDiSerie({ TALOS_MAX_RETRIES: '3' }), 3);
  assert.equal(ritentativiDiSerie({ TALOS_MAX_RETRIES: '0' }), 0);
  assert.equal(ritentativiDiSerie({ TALOS_MAX_RETRIES: 'tanti' }), 10);
  /* review del bugfixer, binario di Claude Code: oltre 15 si RIDUCE a 15 (`rYe=15`, max_retries_clamp_warning), non si torna a 10 */
  assert.equal(ritentativiDiSerie({ TALOS_MAX_RETRIES: '20' }), 15);
  assert.equal(ritentativiDiSerie({ TALOS_MAX_RETRIES: '500' }), 15);
  assert.equal(ritentativiDiSerie(undefined), 10, 'senza ambiente (telefono): 10');
});
