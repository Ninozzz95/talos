/*
 * Row 194 of the register, PC 0.2.5 (owner decision 19/11/2026 23:01; approved form FORMA-CLI-070-RIGA-91, section A point 3).
 * Defence in depth in the shared kernel: the card of «Read only» (`soloUnaVolta`) is answered by the person, once. A yes that
 * says it does not come from a person (a rule, the mode, the classifier: `MOTIVI_DEL_SI_SENZA_PERSONA`, the yes the CLI sends from
 * `cli/src/tui/approval.ts:20` and `cli/src/automations/kernel-runs.ts:98`) closes it with a No marked automatic, exactly like on a
 * card «always the person». The person's yes without a reason (the window, the phone, the CLI terminal) stays a yes.
 * No network, no key, fake profile.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { MOTIVI_DEL_SI_SENZA_PERSONA } from '../src/agui-events.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

async function scena(t) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'riga194-'));
  const giri = [];
  const registry = createSessionRegistry({ cartellaStore, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: null, task: { id: 'task', consegna: 'x' } }),
    avviaSessioneFn: (input) => { giri.push(input); input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); return new Promise(() => {}); } });
  t.after(async () => { await registry.chiudi?.().catch?.(() => {}); try { await attendiScritture({ cartellaStore }); } catch { /* cleanup anyway */ } try { rimuoviCartellaDiProva(cartellaStore); } catch { /* already gone */ } });
  const { sessionId } = registry.avvia('task', { permessiScelto: 'Read only', modalitaOperativaScelta: 'normale' });
  /** Asks one card and answers it; returns what the kernel receives. */
  const rispondi = async (carta, approvato, opzioni) => {
    const esito = giri[0].chiediApprovazioneFn(carta);
    await new Promise((ok) => setTimeout(ok, 10));
    const r = registry.rispondiApprovazione(sessionId, registry.domandaInAttesa(sessionId).requestId, approvato, opzioni);
    assert.deepEqual(r, { ok: true });
    return esito;
  };
  return { rispondi };
}
const CARTA_MCP = (id, extra = {}) => ({ tipo: 'mcp_tool', toolCallId: id, nome: 'mcp__github__create_issue', server: 'github', attrezzo: 'create_issue', ...extra });
const CARTA_PLUGIN = (id, extra = {}) => ({ tipo: 'plugin_tool', toolCallId: id, nome: 'plugin__lint__check', pluginId: 'lint', attrezzo: 'check', ...extra });

test('R194-1 (red before the cure): an automatic yes (rule, mode, classifier) on a «Read only» card becomes a No marked automatic', { timeout: 20_000 }, async (t) => {
  assert.deepEqual([...MOTIVI_DEL_SI_SENZA_PERSONA], ['regola', 'modalita', 'classificatore']);
  const { rispondi } = await scena(t);
  let n = 0;
  for (const carta of [CARTA_MCP, CARTA_PLUGIN]) {
    for (const motivo of MOTIVI_DEL_SI_SENZA_PERSONA) {
      const esito = await rispondi(carta(`c${++n}`, { soloUnaVolta: true }), true, { motivo });
      assert.equal(typeof esito, 'object', `${motivo}: ${JSON.stringify(esito)}`);
      assert.deepEqual([esito.approvato, esito.automatico], [false, true], `${motivo}: ${JSON.stringify(esito)}`);
      assert.match(esito.motivo, /only the person can approve/u);
    }
  }
});

test('R194-2 (the reverse): the person\'s yes on the same «Read only» card, without a reason, stays a yes', { timeout: 20_000 }, async (t) => {
  const { rispondi } = await scena(t);
  assert.equal(await rispondi(CARTA_MCP('c1', { soloUnaVolta: true }), true), true);
  assert.equal(await rispondi(CARTA_PLUGIN('c2', { soloUnaVolta: true }), true), true);
});

test('R194-3 (no wider than the form): without the exact sign `soloUnaVolta === true` the automatic yes stays a yes', { timeout: 20_000 }, async (t) => {
  const { rispondi } = await scena(t);
  assert.equal(await rispondi(CARTA_MCP('c1'), true, { motivo: 'regola' }), true, 'no sign');
  assert.equal(await rispondi(CARTA_MCP('c2', { soloUnaVolta: false }), true, { motivo: 'modalita' }), true, 'false');
  assert.equal(await rispondi(CARTA_MCP('c3', { soloUnaVolta: 'true' }), true, { motivo: 'regola' }), true, '"true" is not the sign');
});

test('R194-4: a reason that is not automatic, or a No, on a «Read only» card is not turned into an automatic No', { timeout: 20_000 }, async (t) => {
  const { rispondi } = await scena(t);
  assert.equal(await rispondi(CARTA_MCP('c1', { soloUnaVolta: true }), true, { motivo: 'persona' }), true);
  assert.equal(await rispondi(CARTA_MCP('c2', { soloUnaVolta: true }), false), false);
  assert.deepEqual(await rispondi(CARTA_MCP('c3', { soloUnaVolta: true }), false, { motivo: 'not now' }), { approvato: false, motivo: 'not now' });
  assert.deepEqual(await rispondi(CARTA_MCP('c4', { soloUnaVolta: true }), false, { motivo: 'regola' }), { approvato: false, motivo: 'regola' }, 'only a yes is turned');
});
