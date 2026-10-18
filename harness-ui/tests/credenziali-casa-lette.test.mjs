/*
 * Owner 16/10/2026 notte (CLI «Chiedere sempre», desktop «Sì, anche sul desktop») — LEGGERE una credenziale della casa chiede sempre,
 * anche in Full access: l'eccezione dichiarata al «Full access non chiede mai» del 12/10. I segreti del progetto restano liberi in
 * Full access. Qui solo il CANCELLO (`verificaPermessoScrittura`): nessun file della casa vera viene aperto, il riconoscimento è a parole.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { verificaPermessoScrittura } from '../src/kernel/talosHarness.mjs';

const pieno = (azione, extra = {}) => verificaPermessoScrittura(azione, { livelloAccesso: 'accesso-pieno', ...extra });

test('CASA-LETTA-01 — in Full access every way of naming a home credential in a command asks', async () => {
  for (const comando of ['type %USERPROFILE%\\.ssh\\id_ed25519', 'cat ~/.aws/credentials', 'Get-Content $HOME/.netrc', 'cat ~/.ssh/*', 'type %USERPROFILE%\\.npmrc',
    /* credenziali che NON sono segreti per nome: le vede solo questa regola (gh, Azure, il config di docker) */
    'cat ~/.config/gh/hosts.yml', 'type %USERPROFILE%\\.azure\\msal_token_cache.json', 'cat ~/.docker/daemon.json']) {
    const chieste = [];
    const esito = await pieno({ tipo: 'shell', comando }, { chiediApprovazioneFn: async (a) => { chieste.push(a); return true; } });
    assert.equal(chieste.length, 1, comando);
    assert.equal(chieste[0].segreto?.credenzialeDellaCasa, true, comando);
    assert.equal(esito.via, 'segreto-forza-conferma', comando);
  }
});

test('CASA-LETTA-02 — AL CONTRARIO: in Full access a project secret, a plain command and ~/.ssh/config go through with no card', async () => {
  for (const azione of [{ tipo: 'shell', comando: 'cat .env' }, { tipo: 'shell', comando: 'npm test' }, { tipo: 'leggi', percorso: '~/.ssh/config' }, { tipo: 'leggi', percorso: 'src/app.js' }]) {
    const chieste = [];
    const esito = await pieno(azione, { chiediApprovazioneFn: async (a) => { chieste.push(a); return true; } });
    assert.equal(chieste.length, 0, JSON.stringify(azione));
    assert.equal(esito.consentito, true, JSON.stringify(azione));
  }
});

test('CASA-LETTA-03 — the «for this session» yes on that path is honoured: no second card', async () => {
  const chieste = [];
  const chiedi = async (a) => { chieste.push(a); return true; };
  await pieno({ tipo: 'leggi', percorso: '~/.npmrc' }, { chiediApprovazioneFn: chiedi });
  assert.equal(chieste.length, 1, 'premessa: chiede');
  const chiave = chieste[0].segreto.chiaveDelConsenso ?? chieste[0].segreto.percorso;
  const dopo = await pieno({ tipo: 'leggi', percorso: '~/.npmrc' }, { chiediApprovazioneFn: chiedi, consensiSessione: { segretiConsentiti: [chiave] } });
  assert.equal(dopo.consentito, true);
  assert.equal(chieste.length, 1, 'no second card');
});
