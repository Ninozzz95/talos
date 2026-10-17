/*
 * ⭐⭐⭐ /goal, fase G4 — LA DECISIONE DOPO OGNI GIRO (`src/obiettivo/ciclo.mjs`). Owner 14/10/2026 notte: 20 giri + token (il
 * numero dal banco G7), «fatto» se tutte verdi e nessun giudizio, «fatto con N da guardare» coi giudizi, 3 giri senza progresso ⇒
 * pausa. Ogni regola nei due versi.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { GIRI_MASSIMI_DI_SERIE, GIRI_SENZA_PROGRESSO_MASSIMI, TOKEN_MASSIMI_DI_SERIE, ceProgresso, codaSenzaTempi, contoDopoIlGiro, decidiDopoIlGiro } from '../src/obiettivo/ciclo.mjs';

const attivo = { stato: 'attivo' };
const verdetto = (id, esito, extra = {}) => ({ id, impronta: `i-${id}`, esito, ...extra });
const ciclo = (giri = 1, token = 0, senzaProgresso = 0) => ({ giri, token, senzaProgresso });

test('G4-CICLO-01 — «fatto» solo con TUTTE le prove verdi; coi giudizi è «fatto con N da guardare»; un non verificabile non è un sì', () => {
  assert.deepEqual(decidiDopoIlGiro({ obiettivo: attivo, verifica: { verdetti: [verdetto('c1', 'verde'), verdetto('c2', 'verde')] }, ciclo: ciclo() }), { azione: 'fatto', daGuardare: 0 });
  assert.deepEqual(decidiDopoIlGiro({ obiettivo: attivo, verifica: { verdetti: [verdetto('c1', 'verde'), verdetto('c2', 'da-giudicare'), verdetto('c3', 'da-giudicare')] }, ciclo: ciclo() }), { azione: 'fatto', daGuardare: 2 });
  // AL CONTRARIO
  for (const altro of ['rosso', 'non-verificabile']) {
    assert.deepEqual(decidiDopoIlGiro({ obiettivo: attivo, verifica: { verdetti: [verdetto('c1', 'verde'), verdetto('c2', altro)] }, ciclo: ciclo() }), { azione: 'continua' }, altro);
  }
  assert.deepEqual(decidiDopoIlGiro({ obiettivo: attivo, verifica: { verdetti: [] }, ciclo: ciclo() }), { azione: 'continua' }, 'una verifica vuota non è un «fatto»');
  /* un contratto di SOLI giudizi (G4-REV-02, owner 14/10 notte): niente è provato ⇒ mai «fatto» a vuoto, pausa «da giudicare»; e
     la regola vale anche quando sono al tetto */
  assert.deepEqual(decidiDopoIlGiro({ obiettivo: attivo, verifica: { verdetti: [verdetto('c1', 'da-giudicare')] }, ciclo: ciclo() }), { azione: 'pausa', tipo: 'da-giudicare' });
  assert.deepEqual(decidiDopoIlGiro({ obiettivo: attivo, verifica: { verdetti: [verdetto('c1', 'da-giudicare'), verdetto('c2', 'da-giudicare')] }, ciclo: ciclo(GIRI_MASSIMI_DI_SERIE) }), { azione: 'pausa', tipo: 'da-giudicare' });
  // ⛔ «fatto» vince sul tetto: l'ultimo giro che chiude il lavoro non diventa «tetto»
  assert.equal(decidiDopoIlGiro({ obiettivo: attivo, verifica: { verdetti: [verdetto('c1', 'verde')] }, ciclo: ciclo(GIRI_MASSIMI_DI_SERIE) }).azione, 'fatto');
});

test('G4-CICLO-02 — i tetti: 20 giri di serie, i token solo quando c\'è il numero (oggi nessuno, ed è detto), vale il primo', () => {
  const rosso = { verdetti: [verdetto('c1', 'rosso')] };
  assert.equal(GIRI_MASSIMI_DI_SERIE, 20);
  assert.equal(TOKEN_MASSIMI_DI_SERIE, null, 'il numero dei token arriva dal banco G7 (owner 14/10)');
  assert.deepEqual(decidiDopoIlGiro({ obiettivo: attivo, verifica: rosso, ciclo: ciclo(20) }), { azione: 'tetto', tipo: 'giri' });
  assert.deepEqual(decidiDopoIlGiro({ obiettivo: attivo, verifica: rosso, ciclo: ciclo(19, 10 ** 9) }), { azione: 'continua' }, 'senza tetto di token, un miliardo di token non ferma');
  assert.deepEqual(decidiDopoIlGiro({ obiettivo: attivo, verifica: rosso, ciclo: ciclo(3, 5000), tetti: { token: 5000 } }), { azione: 'tetto', tipo: 'token' });
  assert.deepEqual(decidiDopoIlGiro({ obiettivo: attivo, verifica: rosso, ciclo: ciclo(3, 4999), tetti: { token: 5000 } }), { azione: 'continua' });
  assert.deepEqual(decidiDopoIlGiro({ obiettivo: attivo, verifica: rosso, ciclo: ciclo(25), tetti: { giri: null } }), { azione: 'continua' }, 'un tetto tolto non ferma');
  assert.deepEqual(decidiDopoIlGiro({ obiettivo: attivo, verifica: rosso, ciclo: ciclo(5, 9000), tetti: { giri: 5, token: 5000 } }), { azione: 'tetto', tipo: 'giri' }, 'i giri si guardano per primi');
});

test('G4-CICLO-03 — il progresso si misura sul mondo: file scritti, un esito o un\'uscita che cambia; 3 giri di fila senza ⇒ pausa', () => {
  const prima = { verdetti: [verdetto('c1', 'rosso', { uscita: { coda: '1 failing' } }), verdetto('c2', 'verde')] };
  assert.equal(ceProgresso(null, prima), true, 'il primo giro è sempre progresso');
  assert.equal(ceProgresso(prima, prima), false);
  assert.equal(ceProgresso(prima, prima, { scritture: 1 }), true, 'un file scritto è progresso');
  assert.equal(ceProgresso(prima, { verdetti: [verdetto('c1', 'rosso', { uscita: { coda: '2 failing' } }), verdetto('c2', 'verde')] }), true, 'un\'uscita rossa diversa');
  assert.equal(ceProgresso(prima, { verdetti: [verdetto('c1', 'verde'), verdetto('c2', 'verde')] }), true, 'un rosso diventato verde');
  assert.equal(ceProgresso(prima, { verdetti: [...prima.verdetti, verdetto('c3', 'rosso')] }), true, 'un criterio nuovo');
  assert.equal(ceProgresso(prima, { verdetti: [prima.verdetti[0], verdetto('c2', 'verde', { durataMs: 999 })] }), false, 'la durata non è progresso');
  // il conto
  let c = contoDopoIlGiro(null, { token: 100, progresso: true });
  assert.deepEqual(c, { giri: 1, token: 100, senzaProgresso: 0 });
  for (let i = 0; i < GIRI_SENZA_PROGRESSO_MASSIMI; i += 1) c = contoDopoIlGiro(c, { token: 10, progresso: false });
  assert.deepEqual(c, { giri: 4, token: 130, senzaProgresso: 3 });
  assert.deepEqual(decidiDopoIlGiro({ obiettivo: attivo, verifica: prima, ciclo: c }), { azione: 'pausa', tipo: 'nessun-progresso' });
  // AL CONTRARIO: un progresso azzera il conto
  assert.equal(contoDopoIlGiro(c, { progresso: true }).senzaProgresso, 0);
  assert.deepEqual(decidiDopoIlGiro({ obiettivo: attivo, verifica: prima, ciclo: { ...c, senzaProgresso: 2 } }), { azione: 'continua' });
  // valori storti nel conto di prima non diventano numeri
  assert.deepEqual(contoDopoIlGiro({ giri: -3, token: 'x', senzaProgresso: 1.5 }, { token: -9, progresso: false }), { giri: 1, token: 0, senzaProgresso: 1 });
});

test('G4-CICLO-04 — un obiettivo che non è attivo (la verifica l\'ha messo in pausa, o la persona) non fa niente', () => {
  for (const stato of ['in-pausa', 'bloccato', 'tetto', 'fatto']) {
    assert.deepEqual(decidiDopoIlGiro({ obiettivo: { stato }, verifica: { verdetti: [verdetto('c1', 'verde')] }, ciclo: ciclo() }), { azione: 'fermo' }, stato);
  }
  assert.deepEqual(decidiDopoIlGiro({ obiettivo: null, verifica: null, ciclo: ciclo() }), { azione: 'fermo' });
});

test('G4-CICLO-05 — niente si può verificare per un motivo che il modello non cambia ⇒ pausa subito col motivo; uno che il modello può cambiare (un programma che manca) o un rosso accanto ⇒ si continua (G4-REV-04)', () => {
  const nv = (id, motivo) => ({ ...verdetto(id, 'non-verificabile'), motivo: { tipo: motivo } });
  for (const motivo of ['permission-denied', 'permission-needed', 'plan-mode', 'workspace-missing', 'workspace-not-here', 'stopped']) {
    assert.deepEqual(decidiDopoIlGiro({ obiettivo: attivo, verifica: { verdetti: [verdetto('c1', 'verde'), nv('c2', motivo)] }, ciclo: ciclo() }), { azione: 'pausa', tipo: 'non-verificabile', dettaglio: motivo }, motivo);
  }
  // AL CONTRARIO
  assert.deepEqual(decidiDopoIlGiro({ obiettivo: attivo, verifica: { verdetti: [nv('c1', 'command-not-found')] }, ciclo: ciclo() }), { azione: 'continua' }, 'uno script che manca il modello può scriverlo');
  assert.deepEqual(decidiDopoIlGiro({ obiettivo: attivo, verifica: { verdetti: [nv('c1', 'permission-denied'), verdetto('c2', 'rosso')] }, ciclo: ciclo() }), { azione: 'continua' }, 'un rosso da sistemare accanto');
});

test('G4-CICLO-06 — il progresso non guarda i TEMPI stampati dalle prove; guarda i conteggi (G4-REV-01)', () => {
  const rosso = (coda) => ({ verdetti: [{ id: 'c1', impronta: 'sha256:x', esito: 'rosso', motivo: { tipo: 'exit-code' }, uscita: { codice: 1, coda } }] });
  const uguali = [
    ['ℹ fail 1\nℹ duration_ms 212.4473', 'ℹ fail 1\nℹ duration_ms 208.9'], ['✖ login (3.1ms)', '✖ login (12ms)'], ['Time:        1.234 s', 'Time:        0.9 s'],
    ['1 failed in 0.12s', '1 failed in 1.50s'], ['[2026-10-14T21:00:00.123Z] boom', '[2026-10-14T21:05:09.001Z] boom'], ['at 21:03:04', 'at 21:07:55'],
    // G4-REV-06: cartella temporanea, porta, seme, pid
    ["open 'C:\\Users\\x\\AppData\\Local\\Temp\\talos-g4-AbC123\\out.json'", "open 'C:\\Users\\x\\AppData\\Local\\Temp\\talos-g4-ZyX987\\out.json'"],
    ['/tmp/vitest-9f2k/a.txt missing', '/tmp/vitest-q81z/a.txt missing'], ['http://127.0.0.1:53412/api', 'http://127.0.0.1:61022/api'],
    ['listening on localhost:3001', 'listening on localhost:3007'], ['Seed: 1844674', 'Seed: 9120033'], ['port 61022', 'port 53412'], ['pid 1234 died', 'pid 5678 died'],
    // G4-REV-08: l'indirizzo di un oggetto Python, un UUID di richiesta
    ['assert <User object at 0x7f3b2c1d9e50> == None', 'assert <User object at 0x7fd41a03b2c0> == None'],
    ["request_id = '3f2a9c1e-8b7d-4e6f-9a01-2c3d4e5f6a7b'", "request_id = 'a91e0b4c-1d2e-4f3a-8b5c-6d7e8f9a0b1c'"],
  ];
  for (const [a, b] of uguali) assert.equal(ceProgresso(rosso(a), rosso(b), { scritture: 0 }), false, `${a} → ${b}`);
  // AL CONTRARIO: un conteggio che cambia, un messaggio che cambia, sono progresso
  for (const [a, b] of [['ℹ fail 3', 'ℹ fail 2'], ['expected 3 got 4', 'expected 3 got 3'], ['✖ login', '✖ logout'], ['3 tests failed', '2 tests failed'],
    ['Tests:       2 failed, 10 passed, 12 total', 'Tests:       1 failed, 11 passed, 12 total'],
    ['at src/a.js:12:34', 'at src/a.js:13:40'], ["open 'src\\fixtures\\a.json'", "open 'src\\fixtures\\b.json'"], ['HTTP 404', 'HTTP 500'],
    ['expected 0xff got 0x0f', 'expected 0xff got 0xfe'], ['color #00ff00', 'color #00ff01']]) {
    assert.equal(ceProgresso(rosso(a), rosso(b), { scritture: 0 }), true, `${a} → ${b}`);
  }
  assert.equal(codaSenzaTempi('ℹ tests 12\nℹ pass 11'), 'ℹ tests 12\nℹ pass 11', 'i conteggi restano');
});
