/*
 * ⭐ RIVERIFICA AVVERSARIA (bugfixer, 15/10/2026) — `feat/goal-g5d-cure` a0df14f4e, riserva S4 (PERSONA-REG-04).
 *  PERSONA-REG-04 chiama `avviaLibero` col flag `consegnaNonDellaPersona` scritto a mano: prova il ricevente, non chi lo manda.
 *  Il mutante che toglie il flag dalla porta vera (`rispondiPiano`, «conversazione pulita») sopravviveva — e il piano scritto dal
 *  modello sarebbe diventato «il testo della persona», capace di adottare i file che nomina. Controllo: verde sulla cura, rosso sul
 *  mutante. Rapporto: `handoff-talos-2026-09-27/bugfixer/RAPPORTO-RIVERIFICA-G5D-CODA-S4-2026-10-15.md`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSessionRegistry } from '../src/session-registry.mjs';

const PIANO = '## Plan\n1. Read `SETUP.md` and do what it says.\n2. Write `b.txt`.';
const STORIA = [
  { role: 'system', content: 'istruzioni' },
  { role: 'user', content: 'plan the summary' },
  { role: 'assistant', content: '', tool_calls: [{ id: 'call_piano', type: 'function', function: { name: 'present_plan', arguments: JSON.stringify({ plan: PIANO }) } }] },
];

test('PIANO-RIV-01 AL CONTRARIO — «conversazione pulita» dalla porta vera: la sessione nuova parte dal piano, ma il piano NON è il testo della persona', async () => {
  const giri = [];
  const registro = createSessionRegistry({
    guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: (taskId) => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'plan the summary' } }),
    preparaEsecuzioneLiberaFn: (_cartelle, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: null, task: { id: 'libero:x', consegna, consegnaCorta: String(consegna).slice(0, 80) } }),
    avviaSessioneFn: (input) => {
      giri.push(input);
      input.onEvento({ type: 'RunStarted', threadId: `t${giri.length}`, runId: `r${giri.length}` });
      return new Promise(() => {});
    },
  });
  const { sessionId } = registro.avvia('task-vero', { modalitaOperativaScelta: 'piano', permessiScelto: 'Read only' });
  void giri[0].presentaPianoFn({ plan: PIANO, toolCallId: 'call_piano', messaggi: STORIA });
  const proposta = registro.esporta(sessionId).eventi.filter((e) => e.name === 'talos.plan').map((e) => e.value)[0];
  assert.deepEqual(await registro.rispondiPiano(sessionId, { requestId: proposta.requestId, decisione: 'conversazione-pulita', hash: proposta.hash }), { ok: true });
  const nuova = giri[1];
  assert.ok(nuova, 'premessa: la conversazione pulita ha un suo giro');
  assert.match(nuova.task?.consegna ?? '', /SETUP\.md/u, 'premessa: la sessione nuova parte dal piano');
  assert.ok(!nuova.testoDellaPersona, `the approved plan reaches the new session as the PERSON's text: ${JSON.stringify(nuova.testoDellaPersona)?.slice(0, 120)}`);
});
