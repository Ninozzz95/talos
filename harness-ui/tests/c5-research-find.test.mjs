/*
 * C5 (owner 10/10/2026, «parametrizzare E accorpare»; contratto §2 e §10) — `research_find`: `research_list` + `research_search`
 *   in un attrezzo, coi filtri status / since / until / query. Il freno sulle pagine è del kernel e si prova in talosHarness.test.mjs
 *   («FASE3-RESEARCH-PAGINATION-GUARD», «C5 FRENO»). Ogni prova ha il suo verso contrario.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { trovaRicerche } from '../src/letture-delle-sezioni.mjs';
import { ATTREZZI_ESTESI_OPENAI, PARAMETRI_ELENCO, codaDelFreno, fraseAttrezzoRinominato } from '../src/kernel/talosHarness.mjs';

const ricerca = (i, titolo, stato, giorno, extra = {}) => ({ id: `r${i}`, titolo, domanda: `${titolo}?`, stato,
  avviataAlle: `2026-${giorno}T10:00:00.000Z`, ...extra });
const RICERCHE = [
  ricerca(1, 'Motori locali per LLM', 'done', '09-20', { conclusaAlle: '2026-09-20T11:30:00.000Z' }),
  ricerca(2, 'Prezzi dei modelli flash', 'running', '10-09'),
  ricerca(3, 'Harness concorrenti', 'senza-rapporto', '10-01', { motivo: 'The report could not be read.' }),
  ricerca(4, 'Paginazione degli agenti', 'failed', '10-05'),
];
const ids = (testo) => testo.split('\n').filter((r) => r.startsWith('- ')).map((r) => r.split(' — id ')[1]);

test('C5-RIC-01: one tool with the brake field: query, status (with no_report), since/until, the common parameters', () => {
  const nomi = ATTREZZI_ESTESI_OPENAI.map((a) => a.function.name);
  assert.ok(nomi.includes('research_find'));
  assert.ok(!nomi.includes('research_list') && !nomi.includes('research_search'));
  const p = ATTREZZI_ESTESI_OPENAI.find((a) => a.function.name === 'research_find').function.parameters;
  assert.deepEqual(p.required ?? [], []);
  assert.deepEqual(p.properties.status.enum, ['all', 'running', 'paused', 'done', 'no_report', 'cancelled', 'failed']);
  assert.equal(p.properties.browse_every_page.type, 'boolean', 'the brake stays (owner 10/10 evening)');
  for (const k of Object.keys(PARAMETRI_ELENCO)) assert.deepEqual(p.properties[k], PARAMETRI_ELENCO[k]);
  // al contrario: nessuna scrittura delle ricerche nomina più i nomi vecchi
  for (const nome of ['research_start', 'research_read', 'research_control', 'research_delete']) {
    assert.doesNotMatch(JSON.stringify(ATTREZZI_ESTESI_OPENAI.find((a) => a.function.name === nome)), /research_(list|search)/u, nome);
  }
});

test('C5-RIC-02: without query it lists, most recently STARTED first; no_report is how «senza-rapporto» reaches the model', () => {
  const tutte = trovaRicerche(RICERCHE, {});
  assert.equal(tutte.split('\n')[0], 'Deep research: showing 4 of 4, most recently started first.');
  assert.deepEqual(ids(tutte), ['r2', 'r4', 'r3', 'r1']);
  assert.match(tutte, /\n- Harness concorrenti — no_report — 2026-10-01 — id r3\n/u);
  assert.deepEqual(ids(trovaRicerche(RICERCHE, { status: 'no_report' })), ['r3']);
  // al contrario: lo stato interno non arriva mai al modello
  assert.doesNotMatch(tutte, /senza-rapporto/u);
});

test('C5-RIC-03: status, since and until filter; an unknown status or a bad day is said, not obeyed', () => {
  assert.deepEqual(ids(trovaRicerche(RICERCHE, { status: 'running' })), ['r2']);
  assert.deepEqual(ids(trovaRicerche(RICERCHE, { since: '2026-10-01' })), ['r2', 'r4', 'r3']);
  assert.deepEqual(ids(trovaRicerche(RICERCHE, { since: '2026-10-01', until: '2026-10-05' })), ['r4', 'r3']);
  assert.equal(trovaRicerche(RICERCHE, { status: 'paused' }), 'No deep research run matches status=paused.');
  const male = trovaRicerche(RICERCHE, { since: 'ieri', status: 'finita' });
  assert.deepEqual(ids(male), ['r2', 'r4', 'r3', 'r1'], 'nothing filtered by values it does not understand');
  assert.match(male, /status "finita" is unknown and was ignored/);
  assert.match(male, /since "ieri" is not a day like 2026-10-10 and was ignored\./);
  assert.deepEqual(ids(trovaRicerche(RICERCHE, { status: 'completed' })), ['r1'], '«completed» means done');
  // review C5 passo 7 (bugfixer): un intervallo capovolto non svuota l'elenco in silenzio
  assert.match(trovaRicerche(RICERCHE, { since: '2026-10-05', until: '2026-10-01' }), /since 2026-10-05 is after until 2026-10-01: no day can match\. Days are UTC\./u);
});

test('C5-RIC-04: with query it searches title and question; the header names the filters', () => {
  const r = trovaRicerche(RICERCHE, { query: 'llm', status: 'done' });
  assert.equal(r.split('\n')[0], 'Deep research: 1 of 1 (status=done) match «llm», showing 1, best first.');
  assert.equal(trovaRicerche(RICERCHE, { query: 'llm', status: 'failed' }),
    'No deep research run contains «llm». There is 1 deep research run (status=failed) in all: research_find without query lists it, or search with other words.');
});

test('C5-RIC-05: detailed adds the question, the end and the reason; concise does not', () => {
  const corto = trovaRicerche(RICERCHE, { status: 'no_report' }).split('\n')[1];
  assert.equal(corto, '- Harness concorrenti — no_report — 2026-10-01 — id r3');
  assert.equal(trovaRicerche(RICERCHE, { status: 'no_report', response_format: 'detailed' }).split('\n')[1],
    '- Harness concorrenti — no_report — 2026-10-01 · question: Harness concorrenti? · The report could not be read. — id r3');
  assert.match(trovaRicerche(RICERCHE, { status: 'done', response_format: 'detailed' }), / · ended 2026-09-20 11:30 — id r1$/mu);
});

test('C5-RIC-06: the brake line is visible only when there is more, and says the pages left; old names say the new one', () => {
  assert.equal(codaDelFreno({ sfoglia: { pagina: 1, coda: 'X' }, haAltro: true }),
    '(On your own you can read 1 more page of this listing; beyond that only if the person asked for every entry.)');
  assert.equal(codaDelFreno({ sfoglia: { pagina: 2, coda: 'ULTIMA' }, haAltro: true }), 'ULTIMA', 'the last page on its own keeps the brake text');
  assert.equal(codaDelFreno({ sfoglia: { pagina: 1, coda: 'X' }, haAltro: false }), '', 'a finished listing gets no budget line');
  assert.match(fraseAttrezzoRinominato('research_list'), /^research_list was replaced by research_find\. Call research_find with arguments like \{"status": "running"\}/);
  assert.match(fraseAttrezzoRinominato('research_search'), /^research_search was replaced by research_find\./);
});
