import test from 'node:test';
import assert from 'node:assert/strict';
import { caricaOppureSalta } from './_dipendenza-in-corso.mjs';

/*
 * TRADOTTO da AVM/mobile/tests/unit/research/researchReport.test.ts (vitest → node:test).
 * Stessi casi, stesso ordine, stesse attese — comprese le due sull'ordine dei
 * giudici, che nel mobile stanno in QUESTO file e in nessun altro (verificato:
 * `researchVerification.test.ts` non nomina mai `talosResearchJudgeOrder`).
 *
 * ⛔ `report.mjs` importa `talosResearchVerifiedStanding` da `verification.mjs`,
 * che porta l'altra sessione di L3: se non fosse ancora sul disco questi test
 * si dichiarano saltati col motivo, invece di esplodere.
 *
 * ⛔⛔ Questo è il record che il cancello di consegna leggerà (disegno §6.5):
 * ` ```talos-research-report ` deve scriversi e rileggersi IDENTICO al mobile.
 *
 * Il rapporto porta il proprio verbale di verifica. È la scommessa strutturale
 * della fase: verificare mentre si scrive lo sanno fare tutti, poi la verifica
 * evapora e un mese dopo il lettore ha un rapporto e nessun modo di chiedere
 * come sia stato controllato. Qui restano il passaggio, il verdetto e il nome
 * del giudice — quindi il controllo è un artefatto, rileggibile e ripetibile.
 */

const { modulo: rapporto, motivo } = await caricaOppureSalta('../../src/research/report.mjs');
const { modulo: verifica } = await caricaOppureSalta('../../src/research/verification.mjs');
const salta = motivo;

const { talosResearchParseReport, talosResearchReportDocument } = rapporto ?? {};
const { talosResearchJudgeOrder } = verifica ?? {};

const SOURCES = [
  {
    url: 'https://rainews.it/x',
    title: 'Il resoconto',
    publishedAt: '2026-07-26',
    text: 'Lando Norris ha vinto il Gran Premio d’Ungheria 2026.',
    obtained: 'page',
  },
  {
    url: 'https://oasport.it/y',
    title: 'Ordine d’arrivo',
    publishedAt: null,
    text: 'Antonelli terzo.',
    obtained: 'snippet',
  },
];

function verified(over = {}, text = 'Norris ha vinto.') {
  return {
    claim: { text, sourceIndex: 1, quote: 'Lando Norris ha vinto', quotePresent: 'yes' },
    passage: 'Lando Norris ha vinto',
    checks: {
      resolved: 'page',
      quotePresent: true,
      quoteSpan: { from: 0, to: 21 },
      claimSupported: 'yes',
      supportReason: 'lo dice testualmente',
      judge: 'local:qwen3-3b',
      judgedAt: '2026-08-02T10:00:00.000Z',
      ...over,
    },
  };
}

test('RAPPORTO-01 torna con ogni verdetto attaccato all’affermazione a cui appartiene', { skip: salta }, () => {
  const documento = talosResearchReportDocument({
    question: 'chi ha vinto?',
    summary: 'Ha vinto Norris.',
    judge: 'local:qwen3-3b',
    claims: [verified(), verified({ claimSupported: 'no', supportReason: 'parla di un’altra gara' }, 'Verstappen ha vinto.')],
    sources: SOURCES,
  });

  const back = talosResearchParseReport(documento);

  // È la scommessa strutturale della fase: il controllo sopravvive come
  // artefatto. Fra un mese chi legge può vedere cosa è stato verificato, da chi
  // e contro quali parole — e R12 può rifarlo e confrontare.
  assert.equal(back.claims[0].checks.claimSupported, 'yes');
  assert.equal(back.claims[0].checks.judge, 'local:qwen3-3b');
  assert.equal(back.claims[1].checks.claimSupported, 'no');
  assert.equal(back.claims[1].text, 'Verstappen ha vinto.');
  assert.equal(back.sources[1].obtained, 'snippet');
});

test('RAPPORTO-02 si legge come un documento stratificato, risposta prima e fonti in fondo', { skip: salta }, () => {
  const documento = talosResearchReportDocument({
    question: 'chi ha vinto?',
    summary: 'Ha vinto Norris.',
    judge: 'local:qwen3-3b',
    claims: [verified()],
    sources: SOURCES,
  });

  assert.ok(documento.indexOf('Ha vinto Norris.') < documento.indexOf('## Le affermazioni'));
  assert.ok(documento.indexOf('## Le affermazioni') < documento.indexOf('## Fonti (2)'));
  // Il record per la macchina va per ultimo, così un'anteprima mostra prosa e non JSON.
  assert.ok(documento.indexOf('```talos-research-report') > documento.indexOf('## Fonti (2)'));
});

test('RAPPORTO-03 dice chi ha verificato, e lo dice chiaro quando non l’ha fatto nessuno', { skip: salta }, () => {
  const conGiudice = talosResearchReportDocument({
    question: 'q', summary: 's', judge: 'local:qwen3-3b', claims: [verified()], sources: SOURCES,
  });
  const senza = talosResearchReportDocument({
    question: 'q',
    summary: 's',
    judge: null,
    claims: [verified({ claimSupported: 'unchecked', supportReason: 'nessun giudice', judge: null, judgedAt: null })],
    sources: SOURCES,
  });

  assert.ok(conGiudice.includes('mai dal modello che ha scritto il rapporto'));
  // L'assenza si dichiara invece di lasciarla in bianco: chi non vede una riga
  // di verifica dà per scontato che ci fosse e che sia andata bene.
  assert.ok(senza.includes('Verifica non eseguita'));
  assert.ok(senza.includes('non verificata'));
});

test('RAPPORTO-04 mostra la citazione che nella fonte non c’era, invece di lasciarla cadere in silenzio', { skip: salta }, () => {
  const documento = talosResearchReportDocument({
    question: 'q',
    summary: 's',
    judge: 'local:qwen3-3b',
    claims: [{
      claim: { text: 'Inventata.', sourceIndex: 1, quote: 'mai scritto', quotePresent: 'no' },
      passage: '',
      checks: {
        resolved: 'page',
        quotePresent: false,
        quoteSpan: null,
        claimSupported: 'unchecked',
        supportReason: 'il passaggio non è nel testo della fonte',
        judge: null,
        judgedAt: null,
      },
    }],
    sources: SOURCES,
  });

  assert.ok(documento.includes('non è nel testo della fonte'));
  assert.ok(documento.includes('"mai scritto"'));
});

test('RAPPORTO-05 non dichiara «nessun giudice» quando erano solo le citazioni a non passare il controllo prima', { skip: salta }, () => {
  // Trovato sul tablet, ed è la ragione per cui il giudice si registra UNA
  // volta per la corsa invece di dedurlo dai verdetti.
  const documento = talosResearchReportDocument({
    question: 'q',
    summary: 's',
    judge: 'local:qwen3-3b',
    claims: [verified({
      quotePresent: false,
      quoteSpan: null,
      claimSupported: 'unchecked',
      supportReason: 'il passaggio non è nel testo della fonte',
      judge: null,
      judgedAt: null,
    })],
    sources: SOURCES,
  });

  assert.ok(documento.includes('local:qwen3-3b'));
  assert.ok(!documento.includes('Verifica non eseguita'));
  assert.equal(talosResearchParseReport(documento).judge, 'local:qwen3-3b');
});

test('RAPPORTO-06 ⛔ rifiuta un rapporto che non sa recuperare, invece di indovinare', { skip: salta }, () => {
  assert.equal(talosResearchParseReport('# solo prosa'), null);
  assert.equal(talosResearchParseReport('```talos-research-report\n{ rotto'), null);
  assert.equal(talosResearchParseReport('```talos-research-report\n{"version":9}\n```'), null);
});

test('RAPPORTO-07 chiede al dispositivo per primo, poi a un’altra casa, e per ultima a quella dell’autore', { skip: salta }, () => {
  const PROVIDERS = ['anthropic', 'deepseek', 'local', 'openrouter'];
  assert.deepEqual(talosResearchJudgeOrder('deepseek', PROVIDERS, 'local'), [
    'local', 'anthropic', 'openrouter', 'deepseek',
  ]);
});

test('RAPPORTO-08 mette il dispositivo per primo anche quando l’autore sta sul dispositivo', { skip: salta }, () => {
  // Non è una contraddizione: chi sceglie rifiuta comunque il modello esatto
  // dell'autore, quindi qui vuol dire «un altro modello locale, se c'è».
  const PROVIDERS = ['anthropic', 'deepseek', 'local', 'openrouter'];
  assert.equal(talosResearchJudgeOrder('local', PROVIDERS, 'local')[0], 'local');
});
