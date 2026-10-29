/*
 * ⭐ Mobile 27/10/2026 (censimento «Avvisi ed errori», owner: «tutti gli avvisi e gli errori anche nel mobile»): la frase PRECISA di un
 *   rifiuto (`explanation` della busta HTTP) arriva anche al dispositivo. Prima `remoto/chiamata-interna.mjs` passava code, message,
 *   stato, reason e params, non `explanation`: il telefono vedeva solo la frase generica del codice. Caso vero: cambiare il modo mentre
 *   il modello lavora (SESSION_NOT_READY, mode-change-while-running). Al contrario: un percorso nella frase non esce dal computer.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs';
import { spiegazionePerIlTelefono } from '../src/remoto/servizio.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';

test('REM-SPIEG-01 un rifiuto del registro arriva dalla chiamata interna con la sua explanation (il caso vero: il modo a giro vivo)', async () => {
  const registro = createSessionRegistry({
    guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: (taskId) => {
      if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
      return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } };
    },
    avviaSessioneFn: (input) => { input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r1' }); return new Promise(() => {}); }, // giro vivo
  });
  const { sessionId } = registro.avvia('task-vero', { permessiScelto: 'Workspace write' });
  const chiama = creaChiamataInterna({ httpApp: createHttpApp({ staticHandler: async () => null, sessionRegistry: registro }), porta: 4999 });
  const errore = await chiama({ metodo: 'POST', percorso: `/api/v1/sessions/${sessionId}/settings`, corpo: { modalitaOperativa: 'piano' },
    origineRemota: { tipo: 'telefono', nome: 'Pad', dispositivoId: 'd-1' } }).then(() => null, (e) => e);
  assert.ok(errore, 'premessa: il cambio di modo a giro vivo si rifiuta');
  assert.equal(errore.code, 'SESSION_NOT_READY');
  assert.equal(errore.reason, 'mode-change-while-running');
  assert.equal(typeof errore.explanation, 'string', 'la frase precisa non è arrivata alla chiamata interna');
  assert.match(errore.explanation, /between turns/u);
  assert.deepEqual(spiegazionePerIlTelefono(errore), { explanation: errore.explanation });
});

test('REM-SPIEG-02 AL CONTRARIO: niente explanation, niente campo; un percorso assoluto si oscura; oltre 240 caratteri si taglia', () => {
  assert.deepEqual(spiegazionePerIlTelefono({ code: 'X' }), {});
  assert.deepEqual(spiegazionePerIlTelefono({ explanation: '   ' }), {});
  const conPercorso = spiegazionePerIlTelefono({ explanation: 'Could not read C:\\Users\\Mario\\segreto.txt right now' }).explanation;
  assert.doesNotMatch(conPercorso, /Mario/u, 'un percorso del computer è uscito verso il dispositivo');
  assert.equal(spiegazionePerIlTelefono({ explanation: 'a'.repeat(400) }).explanation.length, 240);
});
