/*
 * Il battito del ragionamento e l'argomento che porta (forma chiusa il 30/10/2026 sera, PROPOSTA-RAGIONAMENTO-E-RILETTURE
 * «AGGIORNAMENTO A»; revisione D di eee86ca23, OK di CLI e Mobile). L'argomento è `argomentoDelRagionamento` del 13/09, condiviso
 * con la pagina del PC (le sue prove restano in `frontend/tests/unit/ragionamento.test.mjs`); qui il titolo SUL FILO: oscurato, 60
 * caratteri. I casi stanno nella FIXTURE COMUNE, letta anche dalla Chat del telefono.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  creaBattitoDelRagionamento, INTERVALLO_DEL_BATTITO_MS, LUNGHEZZA_MASSIMA_DEL_TITOLO, NOME_DEL_BATTITO, titoloDelBattito,
} from '../src/kernel/riga-del-ragionamento.mjs';
import { SEGRETO_OSCURATO } from '../src/forme-di-segreto.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/titolo-del-ragionamento.json', import.meta.url), 'utf8'));

test('RR-00 la fixture comune dice le stesse costanti del codice', () => {
  assert.equal(fixture.lunghezzaMassima, LUNGHEZZA_MASSIMA_DEL_TITOLO);
  assert.equal(fixture.segretoOscurato, SEGRETO_OSCURATO);
  assert.ok(fixture.casi.length >= 22, `casi ${fixture.casi.length}`);
});

for (const caso of fixture.casi) {
  test(`${caso.id} ${caso.perche}`, () => {
    const titolo = titoloDelBattito(caso.testo);
    assert.equal(titolo, caso.argomento);
    /* una riga sola, entro il limite (condizione della CLI) */
    if (titolo !== null) { assert.ok(!/[\r\n]/u.test(titolo)); assert.ok([...titolo].length <= LUNGHEZZA_MASSIMA_DEL_TITOLO); }
  });
}

test('RR-NONTESTO un ingresso che non è testo ⇒ null (la riga mostra solo i secondi)', () => {
  for (const v of [undefined, null, 42, {}]) assert.equal(titoloDelBattito(v), null);
});

test('RR-LIMITE il limite si può stringere: il taglio resta dentro', () => {
  assert.equal(titoloDelBattito('**Breve**', { lunghezzaMassima: 3 }), 'Br…');
});

/* Il battito, con un orologio e dei timer finti */
function banco({ titoloFn } = {}) {
  const emessi = [];
  let adesso = Date.parse('2026-10-30T21:00:00.000Z');
  const timer = new Map();
  let prossimo = 1;
  const battito = creaBattitoDelRagionamento({
    emetti: e => emessi.push(e),
    ora: () => adesso,
    imposta: (fn, ms) => { const id = prossimo++; timer.set(id, { fn, alle: adesso + ms }); return id; },
    cancella: id => timer.delete(id),
    ...(titoloFn ? { titoloFn } : {}),
  });
  const avanza = ms => {
    adesso += ms;
    for (const [id, t] of [...timer]) if (t.alle <= adesso) { timer.delete(id); t.fn(); }
  };
  return { battito, emessi, avanza, timer };
}

test('RB-01 il primo pezzo batte subito con la forma concordata { giro, at, titolo }', () => {
  const { battito, emessi } = banco();
  battito.ragionamento(2, '**Reading the tests**\n\n');
  assert.deepEqual(emessi, [{ type: 'CUSTOM', name: NOME_DEL_BATTITO, value: { giro: 2, at: '2026-10-30T21:00:00.000Z', titolo: 'Reading the tests' } }]);
  assert.equal(NOME_DEL_BATTITO, 'talos.ragionamento-in-corso');
});

test('RB-02 al più uno ogni 5 s per giro; giri diversi hanno il loro ritmo', () => {
  const { battito, emessi, avanza } = banco();
  battito.ragionamento(0, 'pensiero ');
  for (let i = 0; i < 40; i += 1) { avanza(100); battito.ragionamento(0, 'ancora '); }
  assert.equal(emessi.length, 1);
  avanza(INTERVALLO_DEL_BATTITO_MS - 4_000);
  battito.ragionamento(0, 'ancora');
  assert.equal(emessi.length, 2);
  battito.ragionamento(1, '**Altro giro**');
  assert.equal(emessi.length, 3);
  assert.deepEqual(emessi.map(e => e.value.giro), [0, 0, 1]);
});

test('RB-03 finché arrivano pezzi un battito ogni 5 s anche a titolo invariato; un titolo nuovo parte allo scadere anche se il giro tace; giro muto ⇒ niente battiti', () => {
  const { battito, emessi, avanza, timer } = banco();
  battito.ragionamento(0, '**Primo**\n\ntesto ');
  avanza(1_000);
  battito.ragionamento(0, 'altro testo ');
  assert.equal(timer.size, 1, 'un pezzo dopo il battito arma il prossimo');
  battito.ragionamento(0, 'ancora testo ');
  assert.equal(timer.size, 1, 'un timer solo');
  avanza(3_999);
  assert.equal(emessi.length, 1);
  avanza(1);
  assert.equal(emessi.length, 2, 'stesso titolo: batte lo stesso (sto ancora ragionando)');
  assert.equal(emessi[1].value.titolo, 'Primo');
  assert.equal(emessi[1].value.at, '2026-10-30T21:00:05.000Z');
  battito.ragionamento(0, '\n\n**Secondo**\n\n');
  avanza(4_999);
  assert.equal(emessi.length, 2);
  avanza(1);
  assert.equal(emessi.length, 3, 'il titolo nuovo arriva allo scadere anche se il giro tace');
  assert.equal(emessi[2].value.titolo, 'Secondo');
  assert.equal(emessi[2].value.at, '2026-10-30T21:00:10.000Z');
  avanza(30_000);
  assert.equal(emessi.length, 3, 'nessun pezzo nuovo: nessun battito');
  assert.equal(timer.size, 0);
});

test('RB-09 PERCORSO CALDO (seconda revisione D): 30.000 pezzi ⇒ il titolo si calcola SOLO a ogni battito, mai a ogni pezzo', () => {
  let calcoli = 0;
  const { battito, emessi, avanza } = banco({ titoloFn: (testo) => { calcoli += 1; return titoloDelBattito(testo); } });
  battito.ragionamento(0, '**Inspecting the gate**\n\n');
  for (let i = 0; i < 30_000; i += 1) { avanza(1); battito.ragionamento(0, 'parola '); }
  assert.equal(emessi.length, 7, 'un battito subito e poi uno ogni 5 s per 30 s');
  assert.equal(calcoli, emessi.length, `calcoli dell'argomento ${calcoli}, battiti ${emessi.length}`);
  /* la coda resta quella giusta: il titolo è uscito dagli ultimi 16 KB, e senza frasi finite non c'è argomento */
  assert.equal(emessi[0].value.titolo, 'Inspecting the gate');
  assert.equal(emessi.at(-1).value.titolo, null);
});

test('RB-10 la coda compattata è la stessa del testo intero: il titolo guarda gli ultimi 16 KB, non meno', () => {
  const { battito, emessi, avanza } = banco();
  battito.ragionamento(0, 'x');
  for (let i = 0; i < 40_000; i += 1) battito.ragionamento(0, 'ab ');
  battito.ragionamento(0, '\n**Titolo finale**\n');
  for (let i = 0; i < 5_000; i += 1) battito.ragionamento(0, 'cd ');
  avanza(5_000);
  assert.equal(emessi.length, 2);
  assert.equal(emessi[1].value.titolo, 'Titolo finale', 'il titolo sta a 15.000 caratteri dalla fine: dentro la coda');
});

test('RB-04 finito il ragionamento il giro non batte più: niente timer in sospeso, niente pezzi tardivi', () => {
  const { battito, emessi, avanza, timer } = banco();
  battito.ragionamento(0, '**Primo**\n\n');
  avanza(1_000);
  battito.ragionamento(0, '**Secondo**\n\n');
  battito.chiudi(0);
  assert.equal(timer.size, 0);
  avanza(10_000);
  battito.ragionamento(0, 'tardivo');
  avanza(10_000);
  assert.equal(emessi.length, 1, 'un pezzo tardivo non riarma il battito (mutante sopravvissuto)');
  assert.equal(timer.size, 0);
  /* chiuso prima ancora di ragionare (il testo è arrivato per primo): niente battito */
  battito.chiudi(3);
  battito.ragionamento(3, '**Dopo il testo**');
  assert.equal(emessi.length, 1);
});

test('RB-05 cambio di fornitore o fine del lavoro: timer giù, e lo stesso giro ripartito da capo batte di nuovo', () => {
  const { battito, emessi, avanza, timer } = banco();
  battito.ragionamento(0, '**Primo**\n\n');
  avanza(1_000);
  battito.ragionamento(0, '**Secondo**\n\n');
  battito.chiudiTutti();
  assert.equal(timer.size, 0);
  battito.ragionamento(0, '**Di nuovo**');
  assert.equal(emessi.length, 2);
  assert.equal(emessi[1].value.titolo, 'Di nuovo');
});

test('RB-06 il battito porta il titolo OSCURATO, mai il testo del ragionamento', () => {
  const { battito, emessi } = banco();
  battito.ragionamento(0, 'Il file contiene sk-abc123def456ghi789jkl012mno e altro testo privato. ');
  assert.deepEqual(Object.keys(emessi[0].value).sort(), ['at', 'giro', 'titolo']);
  assert.equal(emessi[0].value.titolo.includes('sk-abc'), false);
  assert.ok(emessi[0].value.titolo.includes(SEGRETO_OSCURATO));
});

test('RB-07 senza niente di utile il battito c\'è lo stesso, con titolo null (solo i secondi)', () => {
  const { battito, emessi } = banco();
  battito.ragionamento(0, '**Insp');
  assert.equal(emessi.length, 1);
  assert.equal(emessi[0].value.titolo, null);
});

/* Il registro: il battito arriva a chi è connesso e NON va nel giornale (condizione 3 della CLI) */
test('RB-08 nel registro il battito è effimero: consegnato a chi ascolta, mai su disco né rigiocato a chi arriva dopo', async () => {
  const { createSessionRegistry } = await import('../src/session-registry.mjs');
  const { attendiScritture } = await import('../src/session-store.mjs');
  const { cartellaDiProva } = await import('./aiuto/cartelle-di-prova.mjs');
  const { rimuoviCartellaDiProva } = await import('./aiuto/rimuovi-cartella-di-prova.mjs');
  const { join } = await import('node:path');
  const cartellaStore = cartellaDiProva('talos-battito-ragionamento-');
  try {
    let onEvento; let fine;
    const registro = createSessionRegistry({
      cartellaStore, guardaWorkspaceFn: () => () => {}, modello: 'z-ai/glm-5.3-flash', chiave: 'k',
      preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
      avviaSessioneFn: async (input) => { onEvento = input.onEvento; onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' }); return new Promise((ok) => { fine = ok; }); },
    });
    const { sessionId } = registro.avvia('task-vero');
    await new Promise((r) => setImmediate(r));
    const vivi = [];
    registro.iscriviti(sessionId, (e) => vivi.push(e));
    onEvento({ type: 'CUSTOM', name: NOME_DEL_BATTITO, value: { giro: 0, at: '2026-10-30T21:00:00.000Z', titolo: 'Reading the tests' } });
    onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
    fine({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'ciao' }, { role: 'assistant', content: 'ok' }] } });
    await attendiScritture({ cartellaStore, sessionId });
    assert.ok(vivi.some((e) => e.name === NOME_DEL_BATTITO), 'chi ascolta adesso lo riceve');
    const giornale = readFileSync(join(cartellaStore, `${sessionId}.jsonl`), 'utf8');
    assert.ok(giornale.includes('RunFinished'), 'il giornale è stato scritto');
    assert.equal(giornale.includes(NOME_DEL_BATTITO), false, 'mai nel giornale');
    const dopo = [];
    registro.iscriviti(sessionId, (e) => dopo.push(e));
    assert.equal(dopo.some((e) => e.name === NOME_DEL_BATTITO), false, 'mai rigiocato');
  } finally {
    await (await import('../src/session-store.mjs')).attendiScritture({ cartellaStore });
    (await import('./aiuto/rimuovi-cartella-di-prova.mjs')).rimuoviCartellaDiProva(cartellaStore);
  }
});
