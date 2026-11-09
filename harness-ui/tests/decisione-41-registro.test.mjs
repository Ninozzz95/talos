/* Decisione 41 dell'owner: il registro davanti al «solo questa volta». File a sé: `session-registry.test.mjs` è troppo grande per la guardia. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionRegistry } from '../src/session-registry.mjs';

function sessioneConApprovazioneEIngresso() {
  let ingresso;
  return {
    avviaSessioneFn: async (input) => { ingresso = input; input.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' }); return new Promise(() => {}); },
    get ingresso() { return ingresso; },
  };
}
const preparaEsecuzioneFinta = (taskId) => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } });

/* Decisione 41 dell'owner (02/11/2026): «Solo questa volta» sulla carta di root. Il sì arriva al kernel col suo segno, l'evento lo dice. */
test('D41 REG-ROOT-01: «volta» sulla carta di root porta al kernel un sì che non si ricorda', async () => {
  const finta = sessioneConApprovazioneEIngresso();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true });
  const { sessionId } = registro.avvia('task-vero');
  const ricevuti = [];
  registro.iscriviti(sessionId, (e) => ricevuti.push(e));
  const promessa = finta.ingresso.chiediApprovazioneFn({ tipo: 'shell', comando: 'ls', wslRoot: { distro: 'Ubuntu', utente: 'root', frase: 'root' } });
  await Promise.resolve();
  const richiesta = ricevuti.find((e) => e.type === 'ApprovalRequested');
  assert.deepEqual(registro.rispondiApprovazione(sessionId, richiesta.requestId, true, { ambito: 'volta' }), { ok: true });
  assert.deepEqual(await promessa, { approvato: true, soloQuestaVolta: true });
  assert.equal(ricevuti.find((e) => e.type === 'ApprovalResolved').ambito, 'volta');
});

test('D41 REG-ROOT-02: al contrario, «volta» su una carta che non è di root si rifiuta, e il sì semplice resta `true`', async () => {
  const finta = sessioneConApprovazioneEIngresso();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true });
  const { sessionId } = registro.avvia('task-vero');
  const ricevuti = [];
  registro.iscriviti(sessionId, (e) => ricevuti.push(e));
  const promessa = finta.ingresso.chiediApprovazioneFn({ tipo: 'shell', comando: 'ls' });
  await Promise.resolve();
  const richiesta = ricevuti.filter((e) => e.type === 'ApprovalRequested').at(-1);
  assert.equal(registro.rispondiApprovazione(sessionId, richiesta.requestId, true, { ambito: 'volta' }).code, 'QUERY_INVALID');
  assert.deepEqual(registro.rispondiApprovazione(sessionId, richiesta.requestId, true), { ok: true });
  assert.equal(await promessa, true);
  const diRoot = finta.ingresso.chiediApprovazioneFn({ tipo: 'shell', comando: 'ls', wslRoot: { distro: 'Ubuntu', utente: 'root', frase: 'root' } });
  await Promise.resolve();
  const seconda = ricevuti.filter((e) => e.type === 'ApprovalRequested').at(-1);
  assert.equal(registro.rispondiApprovazione(sessionId, seconda.requestId, false, { ambito: 'volta' }).code, 'QUERY_INVALID');
  assert.deepEqual(registro.rispondiApprovazione(sessionId, seconda.requestId, true), { ok: true });
  assert.equal(await diRoot, true, 'il sì senza ambito resta il sì per la chat: il telefono e la CLI non cambiano');
});
