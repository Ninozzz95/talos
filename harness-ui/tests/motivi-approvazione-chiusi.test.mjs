/*
 * COD-205 (30/10/2026, richiesta della CLI): i valori di `motivo` di ApprovalResolved sono una lista CHIUSA, esportata
 * (`MOTIVI_APPROVAZIONE_RISOLTA`). La CLI e il telefono la mappano una volta sola: un valore nuovo scritto dal registro senza
 * passare dalla lista deve far diventare rossa QUESTA prova, non arrivare in italiano nel JSON di chi legge.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { approvalResolved, MOTIVI_APPROVAZIONE_RISOLTA } from '../src/agui-events.mjs';

const registro = readFileSync(new URL('../src/session-registry.mjs', import.meta.url), 'utf8');

/** Il testo della chiamata che si apre a `da` (dalla sua parentesi tonda), contando le parentesi. */
function chiamataDa(da) {
  const inizio = registro.indexOf('(', da);
  let profondita = 0;
  for (let i = inizio; i < registro.length; i += 1) {
    if (registro[i] === '(') profondita += 1;
    else if (registro[i] === ')' && --profondita === 0) return registro.slice(inizio, i + 1);
  }
  return '';
}

/** Ogni stringa scritta come `motivo` dentro una chiamata `approvalResolved(...)` o `negaApprovazionePendente(...)`. */
function motiviScrittiDalRegistro() {
  const trovati = new Set();
  for (const nome of ['approvalResolved(', 'negaApprovazionePendente(']) {
    for (let da = registro.indexOf(nome); da >= 0; da = registro.indexOf(nome, da + nome.length)) {
      for (const riga of chiamataDa(da).split('\n')) {
        const dopo = riga.split('motivo:').slice(1).join(' ');
        for (const [, valore] of dopo.matchAll(/'([a-z][a-z-]*)'/gu)) trovati.add(valore);
      }
    }
  }
  return trovati;
}

test('MOTIVI-APPROVAZIONE-01: ogni motivo scritto dal registro sta nella lista chiusa', () => {
  const scritti = motiviScrittiDalRegistro();
  for (const atteso of ['nessuna-interfaccia', 'modificata-dalla-persona', 'contratto-obiettivo', 'confutatore-sola-lettura', 'fermato']) {
    assert.ok(scritti.has(atteso), `premessa: la lettura del registro trova «${atteso}» (trovati: ${[...scritti].join(', ')})`);
  }
  for (const valore of scritti) assert.ok(MOTIVI_APPROVAZIONE_RISOLTA.includes(valore), `«${valore}» non è nella lista chiusa`);
});

test('MOTIVI-APPROVAZIONE-02: un valore della lista esce; uno fuori lista si perde, l\'evento resta', () => {
  for (const motivo of MOTIVI_APPROVAZIONE_RISOLTA) assert.equal(approvalResolved({ requestId: 'r', approvato: false, motivo }).motivo, motivo);
  const fuori = approvalResolved({ requestId: 'r', approvato: false, motivo: 'inventato' });
  assert.equal(fuori.type, 'ApprovalResolved');
  assert.equal('motivo' in fuori, false);
  assert.equal('motivo' in approvalResolved({ requestId: 'r', approvato: true }), false, 'senza motivo: l\'evento di sempre');
});
