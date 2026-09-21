import test from 'node:test';
import assert from 'node:assert/strict';
import { caricaOppureSalta } from './_dipendenza-in-corso.mjs';

/*
 * TRADOTTO da AVM/mobile/tests/unit/research/researchCard.test.ts (vitest → node:test).
 * Stessi casi, stesso ordine, stesse attese.
 *
 * ⛔ `card.mjs` importa `run.mjs`, che porta l'altra sessione di L3: finché non
 * è sul disco questi test si dichiarano saltati col motivo.
 *
 * La stazione mostrava `3/3 · done`: la vista della macchina. La ricerca sui
 * concorrenti (2026-08-03) ha trovato che tutti e cinque i prodotti guidano col
 * volume — «56 siti» — e nessuno dice se le affermazioni hanno retto. Quindi
 * una scheda qui guida col bilancio.
 */

const { modulo, motivo: salta } = await caricaOppureSalta('../../src/research/card.mjs');
const {
  talosResearchActionsFor,
  talosResearchBucketOf,
  talosResearchCardOf,
  talosResearchFilterCards,
  talosResearchNeedsAttention,
  talosResearchSolidity,
} = modulo ?? {};

function run(patch = {}) {
  return {
    id: 'run-1',
    sessionId: 'session-1',
    question: 'Quando è uscito il primo iPhone',
    depth: 'quick',
    engine: 'device',
    status: 'done',
    title: null,
    plan: [{ id: 'b1', question: 'b1' }],
    steps: [
      { id: 'b1:search', branchId: 'b1', kind: 'search', state: 'done' },
      { id: 'synthesis', branchId: 'b1', kind: 'synthesise', state: 'done' },
    ],
    startedAt: '2026-08-03T08:00:00.000Z',
    updatedAt: '2026-08-03T08:05:00.000Z',
    ...patch,
  };
}

test('SCHEDA-01 porta il bilancio quando c’è, e non lo aspetta', { skip: salta }, () => {
  const senzaRapporto = talosResearchCardOf(run(), { isRunning: false });
  assert.equal(senzaRapporto.standing, null);
  assert.equal(senzaRapporto.question, 'Quando è uscito il primo iPhone');

  const conRapporto = talosResearchCardOf(run(), {
    isRunning: false,
    standing: { total: 4, supported: 3, partial: 1, unsupported: 0, unchecked: 0 },
  });
  assert.equal(conRapporto.standing.supported, 3);
});

test('SCHEDA-02 chiede al registro VIVO se una corsa sta girando, mai al giornale', { skip: salta }, () => {
  // Una corsa che il giornale chiama incompiuta può essere in volo adesso, e
  // chiamarla interrotta mentre lavora è la bugia che il rifacimento è nato per
  // togliere.
  const allavoro = run({ status: 'collecting' });
  assert.equal(talosResearchBucketOf(allavoro, true), 'running');
  assert.equal(talosResearchBucketOf(allavoro, false), 'unfinished');
});

test('SCHEDA-03 mette ogni stato fermo-ma-in-debito in un secchio solo, e il fallimento nel suo', { skip: salta }, () => {
  for (const status of ['planning', 'collecting', 'synthesising', 'verifying']) {
    assert.equal(talosResearchBucketOf(run({ status }), false), 'unfinished');
  }
  assert.equal(talosResearchBucketOf(run({ status: 'cancelled' }), false), 'cancelled');
  assert.equal(talosResearchBucketOf(run({ status: 'failed' }), false), 'failed');
  assert.equal(talosResearchBucketOf(run({ status: 'done' }), false), 'done');
});

test('SCHEDA-04 conta un’affermazione parziale per metà, perché è quello che è', { skip: salta }, () => {
  // Arrotondare la parziale a sostenuta è il modo in cui un rapporto finisce
  // per sembrare più solido di quanto sia — il guasto che la verifica esiste
  // per impedire.
  assert.ok(Math.abs(talosResearchSolidity({ total: 4, supported: 3, partial: 1, unsupported: 0, unchecked: 0 }) - 0.875) < 1e-5);
  // «Non siamo riusciti a controllare» non è una promozione.
  assert.equal(talosResearchSolidity({ total: 2, supported: 1, partial: 0, unsupported: 0, unchecked: 1 }), 0.5);
  // Un rapporto che non ha prodotto affermazioni non ha solidità — e sul
  // dispositivo si vedeva un «%» nudo senza numero davanti, che è il motivo per
  // cui la scheda pretende total > 0 prima di mostrare una percentuale.
  assert.equal(talosResearchSolidity({ total: 0, supported: 0, partial: 0, unsupported: 0, unchecked: 0 }), null);
  assert.equal(talosResearchSolidity(null), null);
});

test('SCHEDA-05 segnala un rapporto che merita un secondo sguardo, e lascia stare uno solido', { skip: salta }, () => {
  const scheda = (standing, failedSteps = 0) =>
    ({ ...talosResearchCardOf(run(), { isRunning: false, standing }), failedSteps });

  assert.equal(talosResearchNeedsAttention(scheda({ total: 4, supported: 4, partial: 0, unsupported: 0, unchecked: 0 })), false);
  // Una sola affermazione non sostenuta basta: la fonte non lo dice.
  assert.equal(talosResearchNeedsAttention(scheda({ total: 4, supported: 3, partial: 0, unsupported: 1, unchecked: 0 })), true);
  // Niente di non sostenuto, ma sta in piedi a stento.
  assert.equal(talosResearchNeedsAttention(scheda({ total: 3, supported: 1, partial: 0, unsupported: 0, unchecked: 2 })), true);
  // Un ramo fallito va detto anche quando le affermazioni stanno bene.
  assert.equal(talosResearchNeedsAttention(scheda({ total: 2, supported: 2, partial: 0, unsupported: 0, unchecked: 0 }, 1)), true);
  // E un rapporto che nessuno ha ancora letto non si sbilancia in nessun verso.
  assert.equal(talosResearchNeedsAttention(scheda(null)), false);
});

test('SCHEDA-06 dà a una ricerca in pausa un secchio suo, lontano da quelle che il telefono ha ucciso', { skip: salta }, () => {
  // Fermarsi apposta è una decisione. Archiviarla con le corse morte direbbe
  // alla persona che la sua decisione è stata un incidente.
  assert.equal(talosResearchBucketOf(run({ status: 'paused' }), false), 'paused');
  // Una pausa che non ha finito di atterrare è la stessa situazione da leggere.
  assert.equal(talosResearchBucketOf(run({ status: 'pause_requested' }), false), 'paused');
  // E annullata non è né l'una né l'altra: non deve niente e non riparte mai.
  assert.equal(talosResearchBucketOf(run({ status: 'cancelled' }), false), 'cancelled');
  // Il registro vivo vince comunque: una corsa che si sta riprendendo adesso gira.
  assert.equal(talosResearchBucketOf(run({ status: 'paused' }), true), 'running');
});

test('SCHEDA-07 mostra l’etichetta scelta ma tiene la domanda che è stata pagata', { skip: salta }, () => {
  const semplice = talosResearchCardOf(run(), { isRunning: false });
  assert.equal(semplice.question, 'Quando è uscito il primo iPhone');
  assert.equal(semplice.renamed, false);

  const battezzata = talosResearchCardOf(run({ title: 'iPhone, le date' }), { isRunning: false });
  assert.equal(battezzata.question, 'iPhone, le date');
  // La provenienza sopravvive alla rinomina — l'esportazione le porta entrambe, etichettate.
  assert.equal(battezzata.originalQuestion, 'Quando è uscito il primo iPhone');
  assert.equal(battezzata.renamed, true);
});

test('SCHEDA-08 filtra per secchio e per parole, insieme', { skip: salta }, () => {
  const schede = [
    talosResearchCardOf(run({ id: 'a', question: 'iPhone' }), { isRunning: true }),
    talosResearchCardOf(run({ id: 'b', question: 'Monte Bianco' }), { isRunning: false }),
    talosResearchCardOf(run({ id: 'c', question: 'iPhone 2', status: 'failed' }), { isRunning: false }),
  ];

  assert.deepEqual(talosResearchFilterCards(schede, 'all', '').map((c) => c.id), ['a', 'b', 'c']);
  assert.deepEqual(talosResearchFilterCards(schede, 'running', '').map((c) => c.id), ['a']);
  assert.deepEqual(talosResearchFilterCards(schede, 'all', 'iphone').map((c) => c.id), ['a', 'c']);
  assert.deepEqual(talosResearchFilterCards(schede, 'failed', 'iphone').map((c) => c.id), ['c']);
  // Degli spazi non sono una ricerca.
  assert.equal(talosResearchFilterCards(schede, 'all', '   ').length, 3);
});

function azioni(status, isRunning = false) {
  return talosResearchActionsFor(talosResearchCardOf(run({ status }), { isRunning }));
}

test('SCHEDA-09 offre Pausa e Annulla mentre lavora, e mai Elimina', { skip: salta }, () => {
  // Togliere il giornale da sotto all'unico scrittore distruggerebbe l'unica
  // prova che un passo già mandato a un fornitore era stato pagato.
  assert.deepEqual(azioni('collecting', true), ['open', 'rename', 'pause', 'cancel']);
});

test('SCHEDA-10 offre Riprendi a tutto ciò che deve ancora lavoro, comunque si sia fermato', { skip: salta }, () => {
  // Apposta o per un'uccisione — dal lato del lettore sono entrambe «continua».
  assert.ok(azioni('paused').includes('resume'));
  assert.ok(azioni('collecting').includes('resume'));
  assert.ok(azioni('pause_requested').includes('resume'));
});

test('SCHEDA-11 non offre mai Riprendi a una ricerca finita', { skip: salta }, () => {
  // Il motore si rifiuta di guidare una corsa terminale, quindi un'offerta qui
  // sarebbe un pulsante che mente — e per `cancelled` si leggerebbe anche come
  // un annulla-annullamento, che non è.
  for (const status of ['done', 'cancelled', 'failed']) {
    assert.ok(!azioni(status).includes('resume'));
    assert.ok(!azioni(status).includes('cancel'));
    assert.ok(azioni(status).includes('delete'));
  }
});

test('SCHEDA-12 lascia sempre aprirla e darle un nome', { skip: salta }, () => {
  for (const status of ['collecting', 'paused', 'done', 'cancelled', 'failed']) {
    assert.deepEqual(azioni(status).slice(0, 2), ['open', 'rename']);
  }
});
