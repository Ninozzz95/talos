/*
 * 15/10/2026 (bugfixer) — revisione avversaria di 14c0a7096 («il titolo automatico si ferma all'ultima parola intera e chiude
 * con «…»»). Le prove passano dalla porta VERA: la funzione del client (`session-item.js`), la regola del suffisso copiata dal
 * sorgente di `app.js` (non riscritta a mano) e la `rinomina` vera del registro, che è chi decide se il titolo arriva.
 *
 * Le ROSSE qui sotto sono difetti; le VERDI dicono ciò che regge (altre lingue, spazi strani).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionRegistry, nomeDerivatoDalCompito } from '../src/session-registry.mjs';
import { preparaEsecuzioneLibera } from '../src/custom-task.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/** La rinomina VERA del server, su una sessione viva (il registro di `session-registry.test.mjs`, ridotto all'osso). */
async function rinominaSulServer(nome) {
  let risolvi;
  const attesa = new Promise((r) => { risolvi = r; });
  let onEvento = null;
  const registro = createSessionRegistry({
    guardaWorkspaceFn: () => () => {},
    avviaSessioneFn: async (input) => { onEvento = input.onEvento; input.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' }); return attesa; },
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
  });
  const { sessionId } = registro.avvia('task-vero');
  const esito = await registro.rinomina(sessionId, nome);
  const salvato = registro.elenca()[0]?.nome ?? null;
  onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1' }); risolvi({ ok: true }); // pulizia
  return { esito, salvato };
}

/** `nomeUnicoSessione` letto dal sorgente di app.js (24892-24902 a 14c0a7096): se cambia lì, cambia qui. */
test('REV-TITOLO-01b — AL CONTRARIO: prima di 14c0a7096 (`slice(0, 80)` in unità UTF-16) lo stesso messaggio arrivava al server, quindi il difetto è NUOVO', async () => {
  const vecchio = (testo) => String(testo || '').replace(/\s+/g, ' ').trim().slice(0, 80); // 14c0a7096^:app.js:26632-26634
  const { esito } = await rinominaSulServer(vecchio(`ab ${'🚀'.repeat(50)}`));
  assert.deepEqual(esito, { ok: true }, 'il vecchio taglio stava sempre negli 80 del server (a costo di mezza emoji: era il suo difetto)');
});
