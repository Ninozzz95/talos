/**
 * ricerca-deposito-strutturato.test.mjs — L8 (12/09/2026): il deposito di una ricerca
 * approfondita diventa STRUTTURATO, e il record recintato lo scrive il server.
 *
 * ⛔ Il guasto che questi test chiudono è REALE e misurato, non dedotto dal codice. Giro vero
 *   del 12/09, 08:02-08:09: la chat `c8e9b07b` (glm-5.3-flash) ha chiamato `research_start`; la
 *   figlia `3029dea2` ha girato 18 volte, speso 265.670 token di ingresso con `cached_tokens:0`,
 *   e ha depositato 8.953 byte di prosa buona — SENZA il blocco ```talos-research-report che la
 *   consegna le chiedeva. Il cancello ha risposto `senza-rapporto`
 *   (`.harness-ui-research/3029dea2…/meta.json`, campo `motivoDettaglio`): motivo onesto, e il
 *   lavoro pagato perso lo stesso. **2439 test verdi non lo vedevano**, perché nessuno di loro
 *   chiedeva a un modello vero di produrre una forma.
 *
 * ⭐ Ricerca web PRIMA di scrivere (obbligo owner), fonte + data — `WebSearch` esaurito
 *   (200/200 per questa sessione), tutto preso con `WebFetch` sull'API di arXiv e sulla
 *   documentazione viva:
 *   - «The Constraint Tax: Measuring Validity-Correctness Tradeoffs in Structured Outputs for
 *     Small Language Models» (arXiv:2605.26128v1, 20/05/2026): «hard answer-only schema decoding
 *     raises schema validity from 61.5% to 100.0%, but lowers answer accuracy from 19.7% to
 *     11.0%». ⇒ ⛔ la struttura si mette sullo SCHELETRO, mai sulla prosa: `testo` resta libero e
 *     nessuno lo riscrive. È il vincolo che non conoscevo, ed è il motivo per cui questi test
 *     provano anche che il testo del modello arriva sul disco VERBATIM.
 *   - «Constraint Tax in Open-Weight LLMs» (arXiv:2606.25605v1, 24/06/2026): «when Tool Calling
 *     and JSON Schema constraints are simultaneously enabled, multiple open-weight models cease
 *     invoking tools». ⇒ niente vincolo sopra la generazione: la forma vive negli ARGOMENTI.
 *   - «PHREEQC-MCQ-200» (arXiv:2607.00436v1, 01/07/2026): «the gains are not monotonic:
 *     tool-augmented agents also lose items they answered correctly without tools». ⇒ ogni
 *     tolleranza (elenco come stringa JSON, fonte per numero, passaggio mancante) è provata qui
 *     perché la strada nuova non deve poter perdere un deposito che la vecchia accettava.
 *   - «When Lower Privileges Suffice» (arXiv:2606.20023, 18/06/2026): «prompt-level controls
 *     provide only limited mitigation». ⇒ la forma non si ottiene insistendo nella consegna.
 *
 * ⛔⛔⛔ OGNI CANCELLO SI PROVA ANCHE NEL VERSO IN CUI DEVE DIRE DI NO — e qui il verso contrario
 *   ha due facce distinte: un argomento mal formato NON deve scrivere niente, e un deposito
 *   senza record NON deve essere perso.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora, ATTREZZI_ESTESI_OPENAI, ATTREZZI_OPENAI } from '../src/kernel/talosHarness.mjs';
import { componiRapportoRicerca, creaResearchOrchestrator, rileggiRapportoRecintato } from '../src/research-orchestrator.mjs';
import { talosResearchParseReport, talosResearchReportDocument } from '../src/research/report.mjs';
import { percorsoRapporto } from '../src/research-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/* ─────────────────────────── impalcatura ─────────────────────────── */

function cartellaVuota(t) {
  const dir = mkdtempSync(join(tmpdir(), 'talos-deposito-'));
  t.after(() => { try { rimuoviCartellaDiProva(dir); } catch { /* già sparita */ } });
  return dir;
}

/** Stessa rete finta dei test del kernel: risposte scritte, nessuna chiamata vera. */
function reteDiRisposte(...risposte) {
  const chiamate = [];
  return {
    chiamate,
    fetch: async (url, opzioni) => {
      const indice = chiamate.length;
      chiamate.push({ url, opzioni, corpo: JSON.parse(opzioni.body) });
      const scelta = risposte[Math.min(indice, risposte.length - 1)];
      return {
        ok: true, status: 200,
        json: async () => ({ choices: [{ message: scelta }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
        text: async () => '',
      };
    },
  };
}

const CONCLUSO = { role: 'assistant', content: 'fatto', tool_calls: [] };
const chiamata = (nome, argomenti) => ({ role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: nome, arguments: JSON.stringify(argomenti) } }] });
const rispostaTool = (rete) => rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool').content;

const TASK_RICERCA = {
  consegna: 'una ricerca qualunque, per la prova',
  ricercaId: 'ric-1',
  ricercaDomanda: 'Come stanno evolvendo gli harness agentici desktop nel 2026?',
};

/*
 * ⛔ LA PROSA VERA DEL 12/09, in miniatura: un rapporto buono, con un titolo, dei numeri e una
 *   sezione di fonti — e senza il recinto. È esattamente ciò che `glm-4.7-flash` ha depositato.
 */
const PROSA_SENZA_RECINTO = [
  '# Agentic Desktop Harness Evolution',
  '',
  'Il mercato passa da 7,8 a 52 miliardi entro il 2030.',
  '',
  '## Sources',
  '1. https://arxiv.org/abs/2605.26128',
].join('\n');

const AFFERMAZIONI_BUONE = [
  {
    testo: 'Una forma rigida imposta a un modello piccolo abbassa l\'accuratezza dal 19,7% all\'11,0%.',
    fonte: 'https://arxiv.org/abs/2605.26128',
    passaggio: 'raises schema validity from 61.5% to 100.0%, but lowers answer accuracy from 19.7% to 11.0%',
  },
  {
    testo: 'Con schema e tool-calling insieme alcuni modelli aperti smettono di chiamare gli attrezzi.',
    fonte: 'https://arxiv.org/abs/2606.25605',
    passaggio: 'multiple open-weight models cease invoking tools despite maintaining high schema compliance',
  },
];

const FONTI_BUONE = [
  { url: 'https://arxiv.org/abs/2605.26128', titolo: 'The Constraint Tax', dataDichiarata: '2026-05-20', letta: true },
  { url: 'https://arxiv.org/abs/2606.25605', titolo: 'Constraint Tax in Open-Weight LLMs', dataDichiarata: '2026-06-24', letta: true },
];

/* ══════════════════ 1. IL COMPOSITORE — il verso che dice di sì ══════════════════ */

test('⭐⭐⭐⭐ L8 — due affermazioni e due fonti diventano un documento che il CANCELLO rilegge, col bilancio giusto', () => {
  const esito = componiRapportoRicerca({
    domanda: 'Quanto costa imporre una forma a un modello piccolo?',
    testo: PROSA_SENZA_RECINTO,
    affermazioni: AFFERMAZIONI_BUONE,
    fonti: FONTI_BUONE,
  });
  assert.equal(esito.ok, true);
  assert.equal(esito.affermazioni, 2);
  assert.equal(esito.fonti, 2);
  assert.equal(esito.senzaPassaggio, 0);

  /*
   * ⛔ Non si guarda la stringa: si passa al CANCELLO VERO, quello che l'orchestratore usa per
   *   decidere `done` / `senza-rapporto`. Una fixture che prova che il mio parser legge la mia
   *   stringa non prova niente; questa prova che il cancello legge ciò che il server SCRIVE.
   */
  const letto = rileggiRapportoRecintato(esito.documento);
  assert.equal(letto.ok, true, 'il cancello che il 12/09 ha detto «senza-rapporto» adesso dice di sì');
  assert.equal(letto.motivo, null);
  assert.deepEqual(letto.bilancio, { totali: 2, sostenute: 0, inParte: 0, nonSostenute: 0, contese: 0, nonVerificate: 2 },
    'due non verificate è la verità di oggi: nessun giudice indipendente ha ancora guardato niente');
  assert.equal(letto.proveDistinte, 2, 'due fonti diverse portano un passaggio verbatim');
  assert.deepEqual(letto.fonti, ['https://arxiv.org/abs/2605.26128', 'https://arxiv.org/abs/2606.25605']);
  assert.equal(letto.ripiego, false, 'passa dal record, non dal ripiego sulla prosa');
});

test('⭐⭐⭐ L8 — la PROSA del modello finisce nel documento VERBATIM: la struttura tocca lo scheletro, mai il ragionamento (arXiv:2605.26128)', () => {
  const esito = componiRapportoRicerca({ domanda: 'D', testo: PROSA_SENZA_RECINTO, affermazioni: AFFERMAZIONI_BUONE, fonti: FONTI_BUONE });
  assert.ok(esito.documento.includes('Il mercato passa da 7,8 a 52 miliardi entro il 2030.'),
    'nessuna riga del modello viene riscritta: «The Constraint Tax» misura che costringere la risposta costa accuratezza');
  const record = talosResearchParseReport(esito.documento);
  assert.equal(record.summary, PROSA_SENZA_RECINTO, 'il summary del record È il testo del modello, carattere per carattere');
  assert.equal(record.question, 'D', 'la domanda viene dal SERVER (task.ricercaDomanda), mai dal modello che potrebbe riscriverla');
});

test('⛔⛔⛔ L8 — `judge` e `claimSupported` li mette il SERVER: un modello non timbra sé stesso, e adesso non ha nemmeno il campo', () => {
  const esito = componiRapportoRicerca({
    domanda: 'D', testo: 'prosa',
    // ⛔ Il modello ci prova: passa un verdetto e un giudice fra gli argomenti.
    affermazioni: [{ testo: 'a', fonte: 'https://esempio.test/x', passaggio: 'p', checks: { claimSupported: 'yes' }, judge: 'io-stesso' }],
    fonti: [{ url: 'https://esempio.test/x', titolo: 'X' }],
  });
  assert.equal(esito.ok, true);
  const record = talosResearchParseReport(esito.documento);
  assert.equal(record.judge, null, 'nessun giudice: «Verifica eseguita da: … — mai dal modello che ha scritto il rapporto»');
  assert.equal(record.claims[0].checks.claimSupported, 'unchecked', 'il verdetto che il modello si era dato NON arriva nel record');
  assert.equal(record.claims[0].checks.judge, null);
  assert.equal(record.claims[0].checks.quotePresent, false, 'nessuno ha confrontato il passaggio col testo della pagina: `false`, mai un `true` regalato');
});

test('⭐⭐ L8 — `letta` decide `obtained`, e ASSENTE vale «solo estratto»: `obtained` non si indovina', () => {
  const esito = componiRapportoRicerca({
    domanda: 'D', testo: 'prosa',
    affermazioni: [
      { testo: 'a', fonte: 'https://letta.test/x', passaggio: 'p' },
      { testo: 'b', fonte: 'https://ignota.test/y', passaggio: 'q' },
    ],
    fonti: [
      { url: 'https://letta.test/x', titolo: 'Letta', letta: true },
      { url: 'https://ignota.test/y', titolo: 'Mai dichiarata' },
    ],
  });
  const record = talosResearchParseReport(esito.documento);
  assert.equal(record.sources[0].obtained, 'page');
  assert.equal(record.sources[1].obtained, 'snippet',
    '`ledger.mjs` conta le pagine davvero aperte su questo campo: assente ⇒ l\'ipotesi che promette MENO');
  assert.equal(record.sources[1].publishedAt, null, 'mai la data di oggi, mai un\'ipotesi: solo quella che la fonte dichiara');
});

test('⭐⭐ L8 — un passaggio MANCANTE non fa cadere il deposito: si conta, e non diventa una prova', () => {
  const esito = componiRapportoRicerca({
    domanda: 'D', testo: 'prosa',
    affermazioni: [
      { testo: 'a', fonte: 'https://esempio.test/x', passaggio: '' },
      { testo: 'b', fonte: 'https://esempio.test/x', passaggio: 'un passaggio vero' },
    ],
    fonti: [{ url: 'https://esempio.test/x', titolo: 'X', letta: true }],
  });
  assert.equal(esito.ok, true);
  assert.equal(esito.senzaPassaggio, 1, 'il numero torna al modello nella risposta: è l\'unico modo in cui può accorgersene');
  const letto = rileggiRapportoRecintato(esito.documento);
  assert.equal(letto.bilancio.totali, 2);
  assert.equal(letto.proveDistinte, 1, 'una sola fonte porta un passaggio: una bibliografia non è una prova');
});

test('⭐⭐ L8 — TOLLERANZE misurate: elenchi arrivati come stringa JSON, e una fonte indicata per NUMERO invece che per URL', () => {
  const esito = componiRapportoRicerca({
    domanda: 'D', testo: 'prosa',
    affermazioni: JSON.stringify([{ testo: 'a', fonte: 1, passaggio: 'p' }]),
    fonti: JSON.stringify([{ url: 'https://esempio.test/x', titolo: 'X' }]),
  });
  assert.equal(esito.ok, true, '«PHREEQC-MCQ-200»: la strada nuova non deve perdere un deposito che la vecchia avrebbe accettato');
  assert.equal(talosResearchParseReport(esito.documento).claims[0].sourceIndex, 1);
});

test('⭐ L8 — una barra finale in più sull\'URL non spezza il legame affermazione→fonte', () => {
  const esito = componiRapportoRicerca({
    domanda: 'D', testo: 'prosa',
    affermazioni: [{ testo: 'a', fonte: 'https://esempio.test/x/', passaggio: 'p' }],
    fonti: [{ url: 'https://esempio.test/x', titolo: 'X' }],
  });
  assert.equal(esito.ok, true);
});

/* ══════════════ 2. IL COMPOSITORE — il verso in cui DEVE dire di no ══════════════ */

test('⛔⛔⛔ L8 VERSO CONTRARIO — un\'affermazione SENZA fonte è respinta, e il motivo nomina l\'indice e il campo', () => {
  const esito = componiRapportoRicerca({
    domanda: 'D', testo: 'prosa',
    affermazioni: [{ testo: 'a', fonte: 'https://esempio.test/x', passaggio: 'p' }, { testo: 'b', passaggio: 'q' }],
    fonti: [{ url: 'https://esempio.test/x', titolo: 'X' }],
  });
  assert.equal(esito.ok, false);
  assert.match(esito.motivo, /affermazioni\[1\]\.fonte/, 'il modello deve sapere QUALE riga correggere, non «qualcosa non va»');
});

test('⛔⛔ L8 VERSO CONTRARIO — un\'affermazione che punta a un URL NON elencato è respinta: mai una fonte inventata per far quadrare il record', () => {
  const esito = componiRapportoRicerca({
    domanda: 'D', testo: 'prosa',
    affermazioni: [{ testo: 'a', fonte: 'https://mai-elencata.test/z', passaggio: 'p' }],
    fonti: [{ url: 'https://esempio.test/x', titolo: 'X' }],
  });
  assert.equal(esito.ok, false);
  assert.match(esito.motivo, /matches no URL/);
  assert.match(esito.motivo, /mai-elencata\.test/, 'dice anche COSA ha ricevuto: un motivo senza il valore costringe a indovinare');
});

test('⛔⛔ L8 VERSO CONTRARIO — una fonte che non è un http(s) completo è respinta (un titolo non è un indirizzo)', () => {
  for (const url of ['arxiv.org/abs/2605.26128', 'ftp://x.test/f', '', 'vedi sopra']) {
    const esito = componiRapportoRicerca({
      domanda: 'D', testo: 'prosa',
      affermazioni: [{ testo: 'a', fonte: 'x', passaggio: 'p' }],
      fonti: [{ url, titolo: 'X' }],
    });
    assert.equal(esito.ok, false, `«${url}» non è un indirizzo e non deve passare`);
    assert.match(esito.motivo, /fonti\[0\]\.url/);
  }
});

test('⛔⛔ L8 VERSO CONTRARIO — elenchi vuoti, non-elenchi e affermazioni senza testo: respinti, ognuno col suo motivo', () => {
  const base = { domanda: 'D', testo: 'prosa' };
  const casi = [
    [{ ...base, affermazioni: [], fonti: FONTI_BUONE }, /affermazioni. is empty/],
    [{ ...base, affermazioni: AFFERMAZIONI_BUONE, fonti: [] }, /fonti. is empty/],
    [{ ...base, affermazioni: { testo: 'a' }, fonti: FONTI_BUONE }, /must be an array/],
    [{ ...base, affermazioni: AFFERMAZIONI_BUONE, fonti: 'due fonti' }, /must be an array/],
    [{ ...base, affermazioni: [{ fonte: 'https://esempio.test/x', passaggio: 'p' }], fonti: [{ url: 'https://esempio.test/x', titolo: 'X' }] }, /affermazioni\[0\]\.testo/],
    [{ ...base, testo: '   ', affermazioni: AFFERMAZIONI_BUONE, fonti: FONTI_BUONE }, /testo. is missing/],
  ];
  for (const [ingresso, atteso] of casi) {
    const esito = componiRapportoRicerca(ingresso);
    assert.equal(esito.ok, false);
    assert.match(esito.motivo, atteso);
  }
});

test('⛔ L8 VERSO CONTRARIO — una fonte indicata per numero FUORI dall\'elenco è respinta, non ridotta al primo elemento', () => {
  const esito = componiRapportoRicerca({
    domanda: 'D', testo: 'prosa',
    affermazioni: [{ testo: 'a', fonte: 7, passaggio: 'p' }],
    fonti: [{ url: 'https://esempio.test/x', titolo: 'X' }],
  });
  assert.equal(esito.ok, false);
  assert.match(esito.motivo, /points to source 7, but .fonti. lists 1/);
});

/* ═══════════ 3. IL KERNEL — il deposito vero, sul disco, nei due versi ═══════════ */

test('⭐⭐⭐⭐ L8 FILO INTERO — `research_deposit` strutturato scrive un `rapporto.md` che il cancello rilegge', async (t) => {
  const cartella = cartellaVuota(t);
  const rete = reteDiRisposte(
    chiamata('research_deposit', { testo: PROSA_SENZA_RECINTO, affermazioni: AFFERMAZIONI_BUONE, fonti: FONTI_BUONE }),
    CONCLUSO,
  );
  await talosLavora({
    cartella, task: TASK_RICERCA, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
    livelloAccesso: 'ricerca', strumentiEstesi: ['research_deposit'],
    componiRapportoRicercaFn: componiRapportoRicerca,
  });

  const risposta = rispostaTool(rete);
  assert.match(risposta, /^deposited:/);
  assert.match(risposta, /It carries the verifiable record: 2 claim\(s\) over 2 source\(s\), each with a verbatim passage\./);

  const percorso = percorsoRapporto(cartella, 'ric-1');
  const scritto = readFileSync(percorso, 'utf8');
  const letto = rileggiRapportoRecintato(scritto);
  assert.equal(letto.ok, true, 'il giro del 12/09 finiva QUI in `senza-rapporto`: adesso il record c\'è');
  assert.equal(letto.bilancio.totali, 2);
  assert.equal(letto.proveDistinte, 2);
  assert.ok(scritto.includes('Il mercato passa da 7,8 a 52 miliardi entro il 2030.'), 'la prosa del modello è sul disco, intatta');
  assert.equal(letto.intestazione, TASK_RICERCA.ricercaDomanda, 'il titolo del record è la domanda del SERVER');
});

test('⛔⛔⛔ L8 VERSO CONTRARIO — un\'affermazione senza fonte: risposta A PAROLE e NESSUN FILE (mai un deposito a metà)', async (t) => {
  const cartella = cartellaVuota(t);
  const rete = reteDiRisposte(
    chiamata('research_deposit', {
      testo: PROSA_SENZA_RECINTO,
      affermazioni: [{ testo: 'un\'affermazione senza appoggio', passaggio: 'p' }],
      fonti: FONTI_BUONE,
    }),
    CONCLUSO,
  );
  await talosLavora({
    cartella, task: TASK_RICERCA, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
    livelloAccesso: 'ricerca', strumentiEstesi: ['research_deposit'],
    componiRapportoRicercaFn: componiRapportoRicerca,
  });
  const risposta = rispostaTool(rete);
  assert.match(risposta, /^REFUSED\./);
  assert.match(risposta, /affermazioni\[0\]\.fonte/);
  assert.match(risposta, /everything you already found is still valid/, 'un rifiuto che non dice come rimediare fa ricominciare da capo');
  assert.equal(existsSync(percorsoRapporto(cartella, 'ric-1')), false, 'niente sul disco: un rapporto le cui affermazioni non hanno fonte è il «Cited but Not Verified» che questo disegno toglie');
});

test('⛔⛔ L8 COMPATIBILITÀ — il solo `testo` SENZA recinto viene comunque depositato, e la risposta DICE che non conterà come consegnato', async (t) => {
  const cartella = cartellaVuota(t);
  const rete = reteDiRisposte(chiamata('research_deposit', { testo: PROSA_SENZA_RECINTO }), CONCLUSO);
  await talosLavora({
    cartella, task: TASK_RICERCA, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
    livelloAccesso: 'ricerca', strumentiEstesi: ['research_deposit'],
    componiRapportoRicercaFn: componiRapportoRicerca,
  });
  const risposta = rispostaTool(rete);
  assert.match(risposta, /^deposited:/, 'il lavoro pagato non si butta per una forma mancante');
  assert.match(risposta, /It carries NO verifiable record, so it will not count as delivered/);
  assert.match(risposta, /call research_deposit once more with `affermazioni` and `fonti`/,
    'questo è l\'ULTIMO momento in cui il modello può ancora rimediare: il 12/09 nessuno glielo ha detto');

  const scritto = readFileSync(percorsoRapporto(cartella, 'ric-1'), 'utf8');
  assert.equal(scritto, PROSA_SENZA_RECINTO, 'scritto com\'è: nessuna riga inventata per far passare il cancello');
  const letto = rileggiRapportoRecintato(scritto);
  assert.equal(letto.ok, false);
  assert.match(letto.motivo, /non porta il record verificabile/, 'è il motivo VERBATIM letto in `meta.json` della ricerca `3029dea2` il 12/09');
});

test('⭐⭐ L8 COMPATIBILITÀ — il MODO VECCHIO (il recinto già dentro `testo`) continua a passare, byte per byte', async (t) => {
  const cartella = cartellaVuota(t);
  const vecchio = talosResearchReportDocument({
    question: 'Una domanda di ieri',
    summary: 'Una sintesi di ieri.',
    judge: null,
    claims: [{ claim: { text: 'a', sourceIndex: 1, quote: 'q' }, passage: 'q', checks: { claimSupported: 'unchecked' } }],
    sources: [{ url: 'https://esempio.test/x', title: 'X', publishedAt: null, obtained: 'page' }],
  });
  const rete = reteDiRisposte(chiamata('research_deposit', { testo: vecchio }), CONCLUSO);
  await talosLavora({
    cartella, task: TASK_RICERCA, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
    livelloAccesso: 'ricerca', strumentiEstesi: ['research_deposit'],
    componiRapportoRicercaFn: componiRapportoRicerca,
  });
  const risposta = rispostaTool(rete);
  assert.match(risposta, /^deposited:/);
  assert.doesNotMatch(risposta, /NO verifiable record/, 'un rapporto che il recinto ce l\'ha già non va avvisato di niente');
  assert.equal(readFileSync(percorsoRapporto(cartella, 'ric-1'), 'utf8'), vecchio, 'non ricomposto: chi ha già consegnato bene resta com\'è');
  assert.equal(rileggiRapportoRecintato(vecchio).ok, true);
});

test('⛔⛔ L8 — SENZA il compositore iniettato (banco, test del kernel) il deposito si comporta bit-per-bit come ieri', async (t) => {
  const cartella = cartellaVuota(t);
  const rete = reteDiRisposte(
    chiamata('research_deposit', { testo: PROSA_SENZA_RECINTO, affermazioni: AFFERMAZIONI_BUONE, fonti: FONTI_BUONE }),
    CONCLUSO,
  );
  await talosLavora({
    cartella, task: TASK_RICERCA, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
    livelloAccesso: 'ricerca', strumentiEstesi: ['research_deposit'],
    /* ⛔ NIENTE componiRapportoRicercaFn: è il caso del banco e dei test del kernel. */
  });
  assert.match(rispostaTool(rete), /^deposited:/);
  assert.equal(readFileSync(percorsoRapporto(cartella, 'ric-1'), 'utf8'), PROSA_SENZA_RECINTO,
    'nessun kernel che scrive il recinto per conto suo: un recinto scritto in due posti diverge in silenzio');
});

test('⛔ L8 — il testo VUOTO resta respinto anche col deposito strutturato, e non lascia un file vuoto', async (t) => {
  const cartella = cartellaVuota(t);
  const rete = reteDiRisposte(chiamata('research_deposit', { testo: '  ', affermazioni: AFFERMAZIONI_BUONE, fonti: FONTI_BUONE }), CONCLUSO);
  await talosLavora({
    cartella, task: TASK_RICERCA, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
    livelloAccesso: 'ricerca', strumentiEstesi: ['research_deposit'],
    componiRapportoRicercaFn: componiRapportoRicerca,
  });
  assert.match(rispostaTool(rete), /^REFUSED\. Empty report/);
  assert.equal(existsSync(percorsoRapporto(cartella, 'ric-1')), false);
});

/* ═════════════════ 4. LO SCHEMA, E LA REGRESSIONE CHE TEMEVO ═════════════════ */

test('⭐⭐⭐ L8 — lo SCHEMA nomina i tre campi: «uno strumento che non nomina un campo, per il modello, non ce l\'ha»', () => {
  const attrezzo = ATTREZZI_ESTESI_OPENAI.find((a) => a.function.name === 'research_deposit');
  assert.ok(attrezzo, 'research_deposit deve restare un attrezzo ESTESO');
  const schema = attrezzo.function.parameters;
  assert.deepEqual(Object.keys(schema.properties).sort(), ['affermazioni', 'fonti', 'parte', 'testo']);
  assert.deepEqual([...schema.required].sort(), ['affermazioni', 'fonti', 'testo']);
  assert.deepEqual(Object.keys(schema.properties.affermazioni.items.properties).sort(), ['fonte', 'passaggio', 'testo']);
  assert.deepEqual(Object.keys(schema.properties.fonti.items.properties).sort(), ['dataDichiarata', 'letta', 'titolo', 'url']);
  /*
   * ⛔ E NON esistono `judge`/`claimSupported`: prima erano una raccomandazione nella consegna,
   *   adesso sono una superficie che non c'è. Un modello non può timbrare sé stesso se non ha
   *   il campo con cui provarci.
   */
  const testoSchema = JSON.stringify(schema);
  assert.doesNotMatch(testoSchema, /judge/i);
  assert.doesNotMatch(testoSchema, /claimSupported/);
  assert.match(schema.properties.affermazioni.items.properties.passaggio.description, /VERBATIM/);
});

test('⛔⛔ L8 — TALOS-BANCO non cambia lista: `research_deposit` resta fuori dagli attrezzi base', () => {
  assert.deepEqual(
    ATTREZZI_OPENAI.map((a) => a.function.name),
    ['elenca', 'cerca', 'leggi', 'scrivi', 'prova', 'shell', 'naviga'],
    'la lista del banco è la stessa di sempre: un lotto sulla ricerca non deve poter spostare il metro di misura',
  );
});

/* ═════════════ 5. LA CONSEGNA — non chiede più una forma che nessuno rispetta ═════════════ */

test('⭐⭐⭐ L8 — la CONSEGNA della figlia chiede i tre argomenti e NON il recinto (la forma non si ottiene insistendo: arXiv:2606.20023)', async () => {
  let ricevuto = null;
  const orch = creaResearchOrchestrator({
    sessioni: new Map(),
    randomUUIDFn: () => 'ric-consegna',
    avviaESeguiFn: (spec) => { ricevuto = spec; return { sessionId: spec.sessionId }; },
    creaRicercaFn: async () => ({}),
    leggiRicercaFn: async () => null,
    aggiornaRicercaFn: async () => null,
    eliminaRicercaFn: async () => null,
    elencaRicercheFn: async () => [],
    leggiRapportoFn: async () => null,
    statRapportoFn: async () => null,
    accodaEventoFn: async () => {},
    leggiGiornaleFn: async () => ({ eventi: [], righeSaltate: 0, byte: 0 }),
    leggiPianoFn: async () => null,
    elencaFontiFn: async () => [],
    leggiIstantaneaCacheFn: async () => null,
    scriviIstantaneaCacheFn: async () => {},
    salvaVoceLibreriaFn: async () => 'lib-1',
    leggiVoceLibreriaFn: async () => null,
    eliminaVoceLibreriaFn: async () => {},
  });
  await orch.avvia({ cartella: '/p', question: 'Una domanda vera', depth: 'deep', modello: 'z-ai/glm-5.3-flash' });

  const consegna = ricevuto.task.consegna;
  assert.doesNotMatch(consegna, /talos-research-report/, 'il recinto non si chiede più alla prosa: il 12/09 un modello flash l\'ha semplicemente ignorato');
  assert.doesNotMatch(consegna, /"version":1/, 'né si detta un JSON da copiare');
  assert.match(consegna, /`affermazioni`/);
  assert.match(consegna, /`fonti`/);
  assert.match(consegna, /VERBATIM/, 'il PERCHÉ resta nella consegna: uno schema non può dire perché serve il passaggio alla lettera');
  assert.match(consegna, /The server builds the verifiable record/);
  assert.equal(ricevuto.modelloRichiesta, 'z-ai/glm-5.3-flash', 'e la figlia parte col modello della madre');
  assert.equal(ricevuto.task.ricercaDomanda, 'Una domanda vera');
});
