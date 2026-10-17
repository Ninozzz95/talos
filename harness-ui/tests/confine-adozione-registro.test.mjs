/*
 * ⭐ L'interruttore `fileAdottatiDallaPersona` (owner 14/10/2026 notte, «Se lo chiedi tu, vale») arriva al kernel dal REGISTRO: acceso
 * quando l'host lo accende (il desktop, in server.mjs), spento di serie. Nei due versi, sul registro vero.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { conStore, registroAGiri } from './aiuto/banco-obiettivo.mjs';

test('ADOZIONE-REG-01 — il registro inoltra l\'interruttore al giro: acceso se l\'host lo accende, spento di serie', async (t) => conStore(t, async (cartellaStore) => {
  const acceso = registroAGiri(cartellaStore, { fileAdottatiDallaPersona: true });
  acceso.registro.avvia('task-vero');
  assert.equal(acceso.giri.at(-1).input.fileAdottatiDallaPersona, true);
  // AL CONTRARIO: senza l'opzione, e con un valore che non è `true`, resta spento
  const spento = registroAGiri(cartellaStore, {});
  spento.registro.avvia('task-vero');
  assert.equal(spento.giri.at(-1).input.fileAdottatiDallaPersona, false);
  const stringa = registroAGiri(cartellaStore, { fileAdottatiDallaPersona: 'true' });
  stringa.registro.avvia('task-vero');
  assert.equal(stringa.giri.at(-1).input.fileAdottatiDallaPersona, false, 'solo `true` lo accende');
}));

/* CLI 16/10/2026 sera (0.6.8 ferma): `talos -p "Leggi ISTRUZIONI.md ed eseguilo"` dice «nessuno davanti» PER GIRO, ma il messaggio l'ha
   appena scritto la persona: i file che nomina restano la sua richiesta. Un'automazione nasce col segno SALVATO: lì non c'è persona. */
test('ADOZIONE-REG-02 — «nessuno davanti» per giro (talos -p) tiene i file adottati; AL CONTRARIO il segno salvato (un automazione) li spegne', async (t) => conStore(t, async (cartellaStore) => {
  const p = registroAGiri(cartellaStore, { fileAdottatiDallaPersona: true });
  p.registro.avvia('task-vero', { senzaInterfacciaNelGiro: true });
  assert.equal(p.giri.at(-1).input.nessunoDavanti, true, 'premessa: nessuno davanti in questo giro');
  assert.equal(p.giri.at(-1).input.fileAdottatiDallaPersona, true, 'il messaggio di -p è della persona');
  const automazione = registroAGiri(cartellaStore, { fileAdottatiDallaPersona: true });
  automazione.registro.avvia('task-vero', { senzaInterfaccia: true });
  assert.equal(automazione.giri.at(-1).input.fileAdottatiDallaPersona, false, 'un automazione non ha la persona dietro il messaggio');
}));
