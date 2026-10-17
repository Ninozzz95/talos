/*
 * Le cure della revisione avversaria del /goal (bugfixer, 14/10/2026): le prove in più che i mutanti hanno chiesto, accanto a
 * quelle rosse del bugfixer (`goal-revisione-*.test.mjs`). Ognuna nasce da un mutante SOPRAVVISSUTO alla prima passata, o da
 * un vincolo trovato nella ricerca (`</think>` orfano: `llmutil` e `json-from-llm`, letti il 14/10/2026).
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { createSessionRegistry } from '../src/session-registry.mjs';
import { affittiDellArchivio, attendiScritture, disattivaAffittiArchivio } from '../src/session-store.mjs';
import { nuovoObiettivo, rigaObiettivo } from '../src/obiettivo/stato.mjs';
import { propostaDallaRisposta } from '../src/obiettivo/proposta.mjs';
import { SCHEMA_CONTRATTO, confrontaContratti, contrattoValido, nuovoContratto } from '../src/obiettivo/contratto.mjs';
import { canonicalHash } from '../src/workflow/canonical-json.mjs';
import { ascolta } from './aiuto/banco-obiettivo.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const FIGLIO = fileURLToPath(new URL('./fixtures/affitto-processo-figlio.mjs', import.meta.url));
const SESSIONE = '0f0f0f0f-0000-4000-8000-0000000c0de7';
const ADESSO = '2026-10-14T09:00:00.000Z';
let sequenza = 0;
const evento = (type, extra = {}) => ({ type, _sequenza: ++sequenza, ...extra });
const giro = (n) => [
  evento('RunStarted', { threadId: SESSIONE, runId: `r${n}` }),
  evento('TextMessageContent', { messageId: `m${n}`, delta: `risposta ${n}` }),
  evento('RunFinished', { threadId: SESSIONE, runId: `r${n}`, result: { detto: `risposta ${n}` } }),
];

function scriviDaUnAltroProcesso(store, righe) {
  const figlio = spawn(process.execPath, [FIGLIO, store, SESSIONE, 'scrivi-ed-esci', JSON.stringify(righe)], { stdio: ['ignore', 'pipe', 'pipe'] });
  let uscita = '';
  figlio.stdout.on('data', (d) => { uscita += d; }); figlio.stderr.on('data', (d) => { uscita += d; });
  return new Promise((ok) => figlio.on('exit', (code) => ok(code === 0 ? 0 : `${code}: ${uscita}`)));
}

test('GOAL-CURA-07b — after THIS process resumed the goal (its own row on the journal), another process writing a chat turn changes nothing and announces nothing', async (t) => {
  const store = mkdtempSync(join(tmpdir(), 'talos-goal-cura-'));
  t.after(() => { disattivaAffittiArchivio(store); rimuoviCartellaDiProva(store); });
  sequenza = 0;
  const intestazione = { tipo: 'intestazione', schema: 1, sessionId: SESSIONE, taskId: 'libero:goal', cartella: store, task: { consegna: 'ciao', consegnaCorta: 'ciao' },
    comandoProva: null, forkDa: null, avviataAlle: ADESSO, modello: 'z-ai/glm-5.3-flash', modelloPlanner: null, reasoning: 'medium',
    mobile: false, permessi: 'Read only', permessiPerAttrezzo: null, padreId: null, profonditaDelega: 0, provider: 'cloud', runtimeId: null,
    modelId: 'z-ai/glm-5.3-flash', fallbackConsent: false, cartellaGiaScelta: true };
  const { obiettivo } = nuovoObiettivo({ testo: 'make it green', id: 'ob-00000000-0000-4000-8000-0000000c0de7', adesso: ADESSO });
  writeFileSync(join(store, `${SESSIONE}.jsonl`), [intestazione, ...giro(1), rigaObiettivo(obiettivo)].map((r) => `${JSON.stringify(r)}\n`).join(''));
  const registro = createSessionRegistry({ cartellaStore: store, affittoFraProcessi: { etichetta: 'this test' }, obiettiviNellaChat: true, // OB-REV-01: come il server desktop
    avviaSessioneFn: async () => ({ ok: true }), guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k' });
  t.after(() => registro.chiudi({ attesaMassimaMs: 1_000 }));
  await registro.ripristina();
  assert.equal(registro.statoObiettivo(SESSIONE).obiettivo.stato, 'in-pausa', 'premise: paused by the restart');

  const annunci = ascolta(registro, SESSIONE);
  const ripreso = await registro.riprendiObiettivo(SESSIONE);
  assert.equal(ripreso.ok, true, JSON.stringify(ripreso));
  assert.equal(annunci.length, 1, 'premise: the resume is announced once');
  await attendiScritture({ cartellaStore: store });
  affittiDellArchivio(store).rilascia(SESSIONE); // il nostro affitto se ne va (come fa il battito dopo 30 s fermi): l'app può scrivere

  assert.equal(await scriviDaUnAltroProcesso(store, giro(2)), 0);
  assert.equal((await registro.allineaSessione(SESSIONE, { scrivere: false })).ricaricata, true, 'premise: reloaded');
  assert.equal(registro.statoObiettivo(SESSIONE).obiettivo.stato, 'attivo');
  assert.equal(annunci.length, 1, 'the goal row on the journal is the one THIS process wrote: nothing to announce');
});

const BOZZA = JSON.stringify({ criteria: [{ type: 'command', text: 'Draft', command: 'npm run draft' }] });
const FINALE = JSON.stringify({ criteria: [{ type: 'command', text: 'I test passano', command: 'npm test' }] });
const comandi = (risposta) => propostaDallaRisposta(risposta).criteri.map((criterio) => criterio.verifica.comando);

test('GOAL-CURA-09b — a DRAFT of the object inside the reasoning is not the answer: closed block, orphan closing tag', () => {
  assert.deepEqual(comandi(`<think>First idea: ${BOZZA}. No, better the tests.</think>\n${FINALE}`), ['npm test']);
  // l'apertura l'ha messa il modello di chat: nel testo arriva solo la chiusura
  assert.deepEqual(comandi(`First idea: ${BOZZA}. No, better the tests.</think>\n${FINALE}`), ['npm test']);
});

test('GOAL-CURA-09c — AL CONTRARIO: a reasoning block never closed gives nothing from there on (the floor), never the draft inside it', () => {
  const esito = propostaDallaRisposta(`<think>Maybe ${BOZZA} …`);
  assert.equal(esito.pavimento, true);
  assert.equal(esito.motivo, 'proposal-unreadable');
});

/* ───────────── REV-GOAL-03: i campi che questa versione non conosce ───────────── */
const UNO = [{ testo: 'The tests pass', verifica: { tipo: 'comando', comando: 'npm test' } }];
const conPeso = (contratto) => {
  const criteri = contratto.criteri.map((criterio) => ({ ...criterio, peso: 2 }));
  return { ...contratto, criteri, impronta: canonicalHash({ schema: SCHEMA_CONTRATTO, criteri, prossimoId: contratto.prossimoId }) };
};

test('GOAL-CURA-03a — AL CONTRARIO: the known fields must still be in the normal form, even with a fingerprint recomputed over them', () => {
  const base = nuovoContratto({ criteri: UNO }).contratto;
  const criteri = [{ ...base.criteri[0], testo: '  The tests pass  ' }]; // un ritocco che `nuovoContratto` non scriverebbe mai
  assert.equal(contrattoValido({ ...base, criteri, impronta: canonicalHash({ schema: SCHEMA_CONTRATTO, criteri, prossimoId: base.prossimoId }) }), false);
});

test('GOAL-CURA-03b — a field of a newer version is not a change the person must confirm, and it is carried forward when the criterion is kept', () => {
  const prima = conPeso(nuovoContratto({ criteri: UNO }).contratto);
  assert.equal(contrattoValido(prima), true, 'premise: readable');
  const [c1] = prima.criteri;
  const dopo = nuovoContratto({ criteri: [{ id: c1.id, testo: c1.testo, verifica: c1.verifica }] }, { prima });
  assert.equal(dopo.ok, true);
  assert.equal(dopo.contratto.criteri[0].peso, 2, 'the unknown field survives when the person keeps the criterion as it was');
  assert.deepEqual(confrontaContratti(prima, { criteri: [{ id: c1.id, testo: c1.testo, verifica: c1.verifica }] }), { aggiunti: [], tolti: [], cambiati: [], serveConferma: false, uguale: false });
});
