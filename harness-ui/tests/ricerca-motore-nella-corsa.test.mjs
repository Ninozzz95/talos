/**
 * ricerca-motore-nella-corsa.test.mjs — L9 (12/09/2026): il motore portato LAVORA dentro la corsa.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Il guasto che questi test chiudono — misurato, non dedotto
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * Stato di fatto del 12/09 (`CODA-UNICA-DEBITI-2026-09-06.md`, voce «L8 #2 ✅ CHIUDE»): una
 * ricerca `done`, 38 affermazioni tutte «non verificate», 28 fonti, **`passi 0`** e **`spesa 0`**.
 * Il giornale aveva tre eventi; `Piano` e `Speso` restavano vuoti a schermo. Il motore del mobile
 * (piano a rami, collettore con cache e budget, verifica a tre livelli col giudice ≠ autore,
 * contraria, indipendenza, sintesi) era **portato e provato, e non girava**: venti file,
 * centinaia di test verdi, quattro chiamanti in tutto.
 *
 * ⛔ Nessuno di quei test poteva vederlo, ed è la lezione che questo file esiste per non
 *   ripetere: provavano i moduli, mai il fatto che qualcuno li chiamasse. Qui si prova il
 *   contrario — che la CORSA li attraversa.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Ricerca web PRIMA di scrivere (obbligo owner) — fonti primarie, lette il 12/09/2026
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * (`WebSearch` esaurito, 200/200 — come per L1-L8: fonti primarie via `WebFetch`.)
 *
 *  - **Panickssery, Bowman, Feng — «LLM Evaluators Recognize and Favor Their Own Generations»**
 *    (arXiv:2404.13076, 15/04/2024): «LLMs such as GPT-4 and Llama 2 have non-trivial accuracy
 *    at distinguishing themselves from other LLMs and humans», e «a linear correlation between
 *    self-recognition capability and the strength of self-preference bias». ⇒ il giudice non può
 *    essere l'autore, e quando non c'è nessun altro il rapporto lo DICE.
 *  - **Gao et al. — «Enabling Large Language Models to Generate Text with Citations»**
 *    (arXiv:2305.14627, 24/05/2023, rev. 31/10/2023, benchmark ALCE): «on the ELI5 dataset, even
 *    the best models lack complete citation support 50% of the time». ⇒ il passaggio dichiarato
 *    non è una prova finché non lo si ritrova nel testo TENUTO della pagina.
 *  - **Anthropic — «How we built our multi-agent research system»**: «multi-agent systems use
 *    about 15× more tokens than chats»; «saving its plan to Memory to persist the context»;
 *    «systems that can resume from where the agent was». ⇒ il costo si dice PRIMA, il piano si
 *    scrive su disco, la ripresa riparte dal giornale.
 *
 * ⛔ Nessun 4174, nessuna rete, nessun modello vero: cartelle temporanee, dipendenze finte che
 *   contano le chiamate. Il giro vero lo lancia l'owner.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora, ATTREZZI_ESTESI_OPENAI } from '../src/kernel/talosHarness.mjs';
import { creaResearchOrchestrator } from '../src/research-orchestrator.mjs';
import {
  aggiornaRicerca, cartellaDellaRicerca, creaRicerca, elencaFonti, elencaRicerche, eliminaRicerca,
  leggiIndiceFonti, leggiPiano, leggiRicerca, percorsoPiano, percorsoRapporto, scriviRapporto,
} from '../src/research-store.mjs';
import { talosResearchParseReport } from '../src/research/report.mjs';

/* ─────────────────────────── impalcatura ─────────────────────────── */

function cartellaVera(t) {
  const dir = mkdtempSync(join(tmpdir(), 'talos-l9-'));
  t.after(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* già sparita */ } });
  return dir;
}

/**
 * L'orchestratore VERO sul disco VERO, con la sola sessione finta.
 *
 * ⛔ Disco vero e non finto, apposta: metà di ciò che L9 aggiunge è forma su disco (`piano.json`,
 *   `fonti/<sha256>.txt`, `indice-fonti.json`), e una fixture in memoria proverebbe che il mio
 *   finto si comporta come il mio finto.
 */
function orchestratore(cartella, sessioni = new Map(), extra = {}) {
  const avviati = [];
  const orch = creaResearchOrchestrator({
    sessioni,
    avviaESeguiFn: (spec) => { avviati.push(spec); return { sessionId: spec.sessionId }; },
    randomUUIDFn: () => 'ric-l9',
    creaRicercaFn: (a) => creaRicerca({ ...a, cartella }),
    leggiRicercaFn: (a) => leggiRicerca({ ...a, cartella }),
    aggiornaRicercaFn: (a) => aggiornaRicerca({ ...a, cartella }),
    eliminaRicercaFn: (a) => eliminaRicerca({ ...a, cartella }),
    elencaRicercheFn: () => elencaRicerche({ cartella }),
    salvaVoceLibreriaFn: async () => 'lib-1',
    leggiVoceLibreriaFn: async () => null,
    eliminaVoceLibreriaFn: async () => {},
    ...extra,
  });
  return { orch, avviati };
}

const PAGINA = 'Gli harness desktop nel 2026 convergono su tre capacità. '
  + 'I permessi per attrezzo sono lo standard di fatto nel 2026. '
  + 'Il privilegio minimo va imposto al confine dell\'azione, fuori dal modello.';

/** Una corsa che cerca una volta e apre una pagina, passando dalla porta vera del kernel. */
async function unGiroDiRaccolta(orch, id, { url = 'https://uno.invalid/a', corpo = PAGINA, query = 'harness 2026' } = {}) {
  const raccolta = orch.raccoltaDellaRicerca(id);
  await raccolta.around(
    { kind: 'search', query, limit: 5, provider: 'tavily' },
    async () => [{ url, title: 'Fonte uno', snippet: 'un estratto', pubblicato: '2026-02-01' }],
  );
  await raccolta.around(
    { kind: 'extract', url, provider: 'naviga' },
    async () => ({ stato: 200, url, corpo }),
  );
  return raccolta;
}

/* ══════════════════ 1. IL PIANO — 2/4/6 rami, e il costo detto PRIMA ══════════════════ */

test('⭐⭐⭐⭐ L9 — il PIANO esiste davvero: 2 rami per «rapida», 4 per «approfondita», 6 per «esaustiva»', async (t) => {
  for (const [profondita, quanti] of [['quick', 2], ['deep', 4], ['exhaustive', 6]]) {
    const cartella = cartellaVera(t);
    const { orch } = orchestratore(cartella);
    const esito = await orch.avvia({ cartella, question: 'Come evolvono gli harness?', depth: profondita });
    assert.equal(esito.piano.length, quanti, `profondità ${profondita} ⇒ ${quanti} linee d'indagine`);
    assert.deepEqual(
      esito.piano.map((r) => r.id),
      Array.from({ length: quanti }, (_v, i) => `b${i + 1}`),
    );
    // Ogni ramo è la domanda vista da una faccia diversa, mai una parafrasi della stessa.
    assert.equal(new Set(esito.piano.map((r) => r.question)).size, quanti,
      '⛔ un piano i cui rami sono parafrasi l\'uno dell\'altro spende quattro volte per imparare una cosa sola');
  }
});

test('⭐⭐⭐⭐ L9 — il piano va nel GIORNALE (`plan_proposed` → `plan_approved`) e su DISCO (`piano.json`)', async (t) => {
  const cartella = cartellaVera(t);
  const { orch } = orchestratore(cartella);
  const { id } = await orch.avvia({ cartella, question: 'Quanto costa il caching?', depth: 'deep' });

  const letta = await orch.leggi({ cartella, id });
  assert.equal(letta.piano.length, 4, '⛔ ieri qui c\'era `[]`, ed era onesto: il piano non esisteva. Oggi esiste');
  assert.ok(letta.giornale.eventi >= 3, 'run_started + plan_proposed + plan_approved');
  assert.equal(existsSync(percorsoPiano(cartella, id)), true);
  assert.deepEqual((await leggiPiano({ cartella, id })).map((r) => r.id), ['b1', 'b2', 'b3', 'b4']);

  /*
   * ⛔ DUE eventi e non uno, ed è la riga che tiene aperta la porta: `plan_approved` porta
   *   `auto: true` perché OGGI nessuno ha premuto niente — il pulsante con cui una persona
   *   toglie, aggiunge o riformula un ramo prima che parta è un lotto di UI a parte. Scrivere
   *   un solo evento «approvato» racconterebbe un consenso che nessuno ha dato.
   */
  const eventi = readFileSync(join(cartellaDellaRicerca(cartella, id), 'giornale.jsonl'), 'utf8')
    .trim().split('\n').map((r) => JSON.parse(r));
  assert.deepEqual(eventi.map((e) => e.kind), ['run_started', 'plan_proposed', 'plan_approved']);
  assert.equal(eventi[2].auto, true, '⛔ l\'approvazione automatica si DICHIARA: è un debito, non un consenso');
});

test('⭐⭐⭐⭐ L9 §6.8 (+1.5) — il COSTO si dice PRIMA, in lavoro; e in denaro SOLO con un prezzo pubblicato', async (t) => {
  const cartella = cartellaVera(t);
  const { orch } = orchestratore(cartella);
  const esito = await orch.avvia({ cartella, question: 'Quanto costa?', depth: 'deep' });
  assert.match(esito.esito, /Planned: 4 lines of inquiry, an estimated \d+ search\(es\), \d+ page\(s\) and ~\d+ tokens\./);
  assert.doesNotMatch(esito.esito, /\$|EUR|USD/, '⛔ nessun prezzo: senza una tariffa pubblicata una cifra in denaro sarebbe finzione');
  assert.ok(esito.costoAtteso.searches > 0 && esito.costoAtteso.tokens > 0);

  const cartella2 = cartellaVera(t);
  const { orch: conPrezzo } = orchestratore(cartella2, new Map(), {
    prezzoFn: () => ({ currency: 'USD', promptPerMillion: 0.4, completionPerMillion: 1.6 }),
  });
  const esito2 = await conPrezzo.avvia({ cartella: cartella2, question: 'Quanto costa?', depth: 'deep' });
  assert.match(esito2.esito, /≈ \d+\.\d{4} USD at the published price/,
    '⛔ il denaro compare SOLO quando una tariffa è stata ottenuta — mai assemblata qui dentro');
});

test('⭐⭐⭐ L9 — la CONSEGNA porta le linee del piano, numerate e in ordine (è ciò che rende onesta l\'attribuzione dei passi)', async (t) => {
  const cartella = cartellaVera(t);
  const { orch, avviati } = orchestratore(cartella);
  await orch.avvia({ cartella, question: 'Come evolvono gli harness?', depth: 'quick' });
  const consegna = avviati[0].task.consegna;
  assert.match(consegna, /Your plan has 2 lines of inquiry/);
  assert.match(consegna, /1\. Come evolvono gli harness\? — fatti e numeri/);
  assert.match(consegna, /2\. Come evolvono gli harness\? — fonti contrarie/);
  assert.match(consegna, /do not reorder it: the journal tracks your progress by that order/);
  assert.match(consegna, /this is a default, not a cage/, '⛔ un piano a cui il modello non può disobbedire farebbe di una ricerca uno scraper');
});

/* ══════════════════ 2. I PASSI, LA SPESA, LE FONTI TENUTE ══════════════════ */

test('⭐⭐⭐⭐ L9 — ogni ricerca e ogni pagina diventano PASSI del giornale, e la spesa si CONTA (ieri: `passi 0`, `spesa 0`)', async (t) => {
  const cartella = cartellaVera(t);
  const { orch } = orchestratore(cartella);
  const { id } = await orch.avvia({ cartella, question: 'Come evolvono gli harness?', depth: 'deep' });
  await unGiroDiRaccolta(orch, id);

  const letta = await orch.leggi({ cartella, id });
  assert.equal(letta.passi.length, 2, 'una ricerca e una lettura');
  assert.deepEqual(letta.passi.map((p) => p.kind).sort(), ['read', 'search']);
  assert.ok(letta.passi.every((p) => p.state === 'done'));
  assert.equal(letta.spesa.searches, 1);
  assert.equal(letta.spesa.pages, 1);
  assert.ok(letta.spesa.tokens > 0, '⛔ i caratteri sono contati e i token sono quei caratteri diviso quattro: la stessa regola del collettore, non una seconda');

  // Il testo è su disco, indirizzato dal contenuto, e l'indice sa di chi è.
  /*
   * ⛔ DUE testi tenuti per UNA pagina, ed è corretto: l'estratto che il motore di ricerca ha
   *   mostrato e il testo della pagina aperta sono due prove diverse, e `fonti/` è indirizzata
   *   dal CONTENUTO. L'indice invece tiene una voce sola per indirizzo, e vince la più forte
   *   (`page` batte `snippet`): è quella che la verifica legge.
   */
  const refs = await elencaFonti({ cartella, id });
  assert.equal(refs.length, 2);
  assert.ok(refs.every((r) => /^fonti\/[0-9a-f]{64}\.txt$/.test(r)));
  const indice = await leggiIndiceFonti({ cartella, id });
  assert.equal(indice.length, 1, 'una voce per indirizzo');
  assert.equal(indice[0].ottenuta, 'page', '⛔ la prova più forte vince: un estratto non deve poter sostituire una pagina aperta');
  assert.ok(refs.includes(indice[0].ref),
    '⛔ senza l\'indice, dopo un riavvio il testo c\'è ma non si sa di CHI è — e la verifica direbbe «il passaggio non è nel testo della fonte» per un motivo falso');

  // E lo STIMATO resta accanto allo SPESO: il divario è esso stesso una misura.
  assert.ok(letta.costoAtteso.pages >= letta.spesa.pages);
});

test('⭐⭐⭐ L9 — la CACHE della corsa prende su una URL ripetuta: la pagina si apre una volta, e la seconda non è pagata', async (t) => {
  const cartella = cartellaVera(t);
  const { orch } = orchestratore(cartella);
  const { id } = await orch.avvia({ cartella, question: 'X?', depth: 'deep' });
  const raccolta = orch.raccoltaDellaRicerca(id);

  let aperture = 0;
  const apri = async () => { aperture += 1; return { stato: 200, url: 'https://due.invalid/b', corpo: PAGINA }; };
  const prima = await raccolta.around({ kind: 'extract', url: 'https://due.invalid/b', provider: 'naviga' }, apri);
  const dopo = await raccolta.around({ kind: 'extract', url: 'https://due.invalid/b', provider: 'naviga' }, apri);

  assert.equal(aperture, 1, '⛔ due rami della stessa corsa che aprono la stessa pagina la pagano UNA volta');
  assert.equal(prima.fromCache, false);
  assert.equal(dopo.fromCache, true);
  const letta = await orch.leggi({ cartella, id });
  assert.equal(letta.spesa.pages, 1, '⛔ la spesa è ciò che è stato PAGATO: una pagina non riaperta non c\'è dentro');
  assert.equal((await elencaFonti({ cartella, id })).length, 1, 'e il testo si tiene una volta sola: il nome è l\'impronta del contenuto');
});

/* ══════════════════ 3. LA VERIFICA — il giudice NON è l'autore ══════════════════ */

/** Un giudice finto: risponde con la parola che il test gli mette in bocca, e conta chi lo chiama. */
function giudiceFinto(risposte) {
  const chiamate = [];
  return {
    chiamate,
    fn: async ({ modello, prompt }) => {
      chiamate.push({ modello, prompt });
      for (const [ago, risposta] of risposte) if (prompt.toLowerCase().includes(ago.toLowerCase())) return risposta;
      return 'NON SO';
    },
  };
}

const FONTI_DEPOSITATE = [{ url: 'https://uno.invalid/a', titolo: 'Fonte uno', dataDichiarata: '2026-02-01', letta: true }];

test('⭐⭐⭐⭐ L9 — VERIFICA VERA: il giudice è un ALTRO modello, e il verdetto finisce nel record (ieri: 38 su 38 «non verificate»)', async (t) => {
  const cartella = cartellaVera(t);
  const giudice = giudiceFinto([['permessi per attrezzo', 'SI — il passaggio lo dice testualmente']]);
  const { orch } = orchestratore(cartella, new Map(), {
    chiediAlModelloFn: giudice.fn,
    modelliGiudiceFn: () => [
      { id: 'z-ai/glm-5.3-flash', provider: 'openrouter', model: 'z-ai/glm-5.3-flash' },
      { id: 'altro/giudice', provider: 'openrouter', model: 'altro/giudice' },
    ],
  });
  const { id } = await orch.avvia({ cartella, question: 'Come evolvono gli harness?', depth: 'deep', modello: 'z-ai/glm-5.3-flash' });

  // ⛔ Il giudice si sceglie alla NASCITA, e non è l'autore: `talosResearchPickJudge` scarta il primo candidato perché è lui.
  assert.equal((await leggiRicerca({ cartella, id })).modelloGiudice, 'altro/giudice');

  await unGiroDiRaccolta(orch, id);
  const composto = await orch.componiRapporto({
    cartella, id,
    domanda: 'Come evolvono gli harness?',
    testo: '# Harness 2026\n\nUn rapporto in prosa.\n\n## Fonti\n- https://uno.invalid/a',
    affermazioni: [{
      testo: 'I permessi per attrezzo sono lo standard di fatto nel 2026.',
      fonte: 'https://uno.invalid/a',
      passaggio: 'I permessi per attrezzo sono lo standard di fatto nel 2026.',
    }],
    fonti: FONTI_DEPOSITATE,
  });

  assert.equal(composto.ok, true);
  assert.equal(composto.giudice, 'altro/giudice');
  assert.deepEqual(composto.bilancio, { total: 1, supported: 1, partial: 0, unsupported: 0, unchecked: 0, contested: 0 });
  assert.equal(giudice.chiamate[0].modello, 'altro/giudice', '⛔ interpellato il giudice, MAI l\'autore');
  assert.match(giudice.chiamate[0].prompt, /Non usare altro: né quello che sai/,
    '⛔ la riga portante del prompt del giudice: senza, risponde da quello che già sa e promuove una citazione che la fonte non ha mai fatto');

  const record = talosResearchParseReport(composto.documento);
  assert.equal(record.judge, 'altro/giudice', '⛔ il nome del giudice nel rapporto: il lettore deve poterlo pesare');
  assert.equal(record.claims[0].checks.claimSupported, 'yes');
  assert.equal(record.claims[0].checks.quotePresent, true, '⛔ L2: il passaggio è stato RITROVATO nel testo tenuto, non creduto sulla parola');
  assert.ok(record.claims[0].checks.judgedAt);
  assert.equal(composto.proveDistinte, 1);
  assert.equal(composto.fedelta.verified, true);
  assert.equal(composto.fedelta.citationFaithfulness, 1);

  // E il passo di verifica è nel giornale, con la sua spesa: ciò che ci distingue non è gratis.
  const letta = await orch.leggi({ cartella, id });
  const verifica = letta.passi.find((p) => p.kind === 'verify');
  assert.ok(verifica && verifica.state === 'done');
  assert.ok(verifica.spend.tokens > 0);
});

test('⛔⛔⛔ L9, VERSO CONTRARIO — nessun altro modello disponibile ⇒ `judge: null` DICHIARATO, e nessuna spunta regalata', async (t) => {
  const cartella = cartellaVera(t);
  const giudice = giudiceFinto([]);
  const { orch } = orchestratore(cartella, new Map(), {
    chiediAlModelloFn: giudice.fn,
    // L'unico candidato È l'autore: `talosResearchPickJudge` risponde `null`.
    modelliGiudiceFn: () => [{ id: 'solo/uno', provider: 'openrouter', model: 'solo/uno' }],
  });
  const { id } = await orch.avvia({ cartella, question: 'X?', depth: 'deep', modello: 'solo/uno' });
  assert.equal((await leggiRicerca({ cartella, id })).modelloGiudice, null);

  await unGiroDiRaccolta(orch, id);
  const composto = await orch.componiRapporto({
    cartella, id, domanda: 'X?',
    testo: '# X\n\nprosa\n\n## Fonti\n- https://uno.invalid/a',
    affermazioni: [{ testo: 'I permessi per attrezzo sono lo standard di fatto nel 2026.', fonte: 'https://uno.invalid/a', passaggio: 'I permessi per attrezzo sono lo standard di fatto nel 2026.' }],
    fonti: FONTI_DEPOSITATE,
  });

  assert.equal(giudice.chiamate.length, 0, '⛔ nessuno ha giudicato, e nessuno ha finto di farlo');
  assert.equal(composto.giudice, null);
  assert.equal(composto.bilancio.unchecked, 1);
  assert.equal(composto.bilancio.supported, 0);
  const record = talosResearchParseReport(composto.documento);
  assert.equal(record.claims[0].checks.judge, null);
  assert.match(record.claims[0].checks.supportReason, /nessun giudice indipendente disponibile/,
    '⛔ e il PERCHÉ è scritto: «non verificata» senza il motivo è indistinguibile da una svista');
  assert.equal(record.claims[0].checks.quotePresent, true,
    '⛔ L2 gira lo stesso: il passaggio si ritrova anche senza giudice — sono due livelli, non uno');
});

test('⛔⛔⛔ L9, VERSO CONTRARIO — un passaggio che nella pagina NON C\'È non diventa mai «sostenuta»: L3 non viene nemmeno chiesto', async (t) => {
  const cartella = cartellaVera(t);
  const giudice = giudiceFinto([['', 'SI — certo che sì']]);
  const { orch } = orchestratore(cartella, new Map(), {
    chiediAlModelloFn: giudice.fn,
    modelliGiudiceFn: () => [{ id: 'altro/giudice', provider: 'openrouter', model: 'altro/giudice' }],
  });
  const { id } = await orch.avvia({ cartella, question: 'X?', depth: 'deep', modello: 'autore/uno' });
  await unGiroDiRaccolta(orch, id);

  const composto = await orch.componiRapporto({
    cartella, id, domanda: 'X?',
    testo: '# X\n\nprosa\n\n## Fonti\n- https://uno.invalid/a',
    affermazioni: [{
      testo: 'Il mercato passa da 7,8 a 52 miliardi entro il 2030.',
      fonte: 'https://uno.invalid/a',
      // ⛔ Questa frase non è nella pagina: è inventata, ed è il caso che ALCE misura al 50%.
      passaggio: 'the market grows from 7.8 to 52 billion by 2030',
    }],
    fonti: FONTI_DEPOSITATE,
  });

  const record = talosResearchParseReport(composto.documento);
  assert.equal(record.claims[0].checks.quotePresent, false);
  assert.notEqual(record.claims[0].checks.claimSupported, 'yes');
  assert.notEqual(record.claims[0].checks.claimSupported, 'partial');
  assert.match(record.claims[0].checks.supportReason, /il passaggio non è nel testo della fonte/);
  assert.equal(composto.bilancio.supported, 0, '⛔ una citazione che non si ritrova NON porta a casa una spunta');
  assert.equal(giudice.chiamate.length, 0,
    '⛔ e il giudice non è stato nemmeno pagato: chiedergli se un passaggio INVENTATO sostiene un\'affermazione è chiedergli un secondo parere su una fabbricazione');
  assert.equal(composto.fedelta.citationFaithfulness, null, 'nessun giudizio ⇒ nessuna quota: `null`, mai uno zero che sembra una misura');
});

test('⭐⭐⭐⭐ L9 §6.8 (+1.3) — la CONTRARIA si cerca apposta, e quando la trova il verdetto diventa CONTESA', async (t) => {
  const cartella = cartellaVera(t);
  /*
   * Due fonti che dicono l'opposto sulla stessa cosa: è il materiale su cui
   * `talosResearchOpposingCandidate` lavora (parole di contenuto in comune, negazione).
   */
  const dice = 'I permessi per attrezzo sono lo standard di fatto nel 2026.';
  /*
   * ⛔ La contraria è scritta con ALTRE PAROLE apposta: `opposing.mjs` scarta l'ECO — una
   *   frase che ripete il passaggio a favore (fosse pure con un «non» davanti) non si manda al
   *   giudice, perché chiedergli se una frase contraddice sé stessa è comprare una risposta a
   *   una domanda senza senso. Il candidato deve PARLARE della stessa cosa e dirne un'altra.
   */
  const nega = 'Nel 2026 quasi nessun prodotto adotta davvero permessi per attrezzo: restano una rarita accademica.';
  const giudice = giudiceFinto([
    ['Il passaggio, DA SOLO, sostiene', 'SI — lo dice testualmente'],
    ['contraddice', 'SI'],
  ]);
  const { orch } = orchestratore(cartella, new Map(), {
    chiediAlModelloFn: giudice.fn,
    modelliGiudiceFn: () => [{ id: 'altro/giudice', provider: 'openrouter', model: 'altro/giudice' }],
  });
  const { id } = await orch.avvia({ cartella, question: 'X?', depth: 'deep', modello: 'autore/uno' });
  const raccolta = orch.raccoltaDellaRicerca(id);
  await raccolta.around({ kind: 'extract', url: 'https://uno.invalid/a', provider: 'naviga' }, async () => ({ stato: 200, url: 'https://uno.invalid/a', corpo: dice }));
  await raccolta.around({ kind: 'extract', url: 'https://due.invalid/b', provider: 'naviga' }, async () => ({ stato: 200, url: 'https://due.invalid/b', corpo: nega }));

  const composto = await orch.componiRapporto({
    cartella, id, domanda: 'X?',
    testo: '# X\n\nprosa\n\n## Fonti\n- https://uno.invalid/a\n- https://due.invalid/b',
    affermazioni: [{ testo: dice, fonte: 'https://uno.invalid/a', passaggio: dice }],
    fonti: [
      { url: 'https://uno.invalid/a', titolo: 'Uno', letta: true },
      { url: 'https://due.invalid/b', titolo: 'Due', letta: true },
    ],
  });

  const record = talosResearchParseReport(composto.documento);
  assert.equal(record.claims[0].checks.claimSupported, 'contested',
    '⛔ «contesa» è DISACCORDO: il giudice aveva detto sì, e un\'altra fonte dice di no. Le due versioni si affiancano, mai si mediano');
  assert.equal(record.claims[0].checks.opposing.length, 1);
  assert.equal(record.claims[0].checks.opposing[0].url, 'https://due.invalid/b');
  assert.equal(composto.bilancio.contested, 1);
  assert.ok(giudice.chiamate.length >= 2, 'due domande: il verdetto e la contraria — la seconda solo perché la prima era un sì');
});

/* ══════════════════ 4. LA RIPRESA — il lavoro, non la conversazione ══════════════════ */

test('⭐⭐⭐⭐ L9 + L4 — DOPO UN RIAVVIO: la ripresa riparte dal PASSO giusto e sa quali linee restano aperte', async (t) => {
  const cartella = cartellaVera(t);

  /* ── Vita 1: la ricerca parte, apre il ramo 1, e il processo muore. ── */
  const primo = orchestratore(cartella);
  const { id } = await primo.orch.avvia({ cartella, question: 'Come evolvono gli harness?', depth: 'deep' });
  await unGiroDiRaccolta(primo.orch, id);
  await aggiornaRicerca({ cartella, id, terminata: null });

  /* ── Vita 2: un registro NUOVO sullo stesso disco. Nessuna sessione viva, nessun messaggio. ── */
  /*
   * ⛔ `interrotta: true` è ciò che `ripristina()` scrive per una sessione che il processo ha
   *   ucciso a metà giro (`interrotta: !conclusa`), e `messaggiFinali: null` è il caso
   *   disperato: la conversazione non è stata persistita. È esattamente lo stato in cui la
   *   ripresa DEVE funzionare, ed è quello in cui ieri falliva.
   */
  const sessioniDopo = new Map([[id, { cartella, conclusa: false, interrotta: true, controller: { abort() {} }, messaggiFinali: null }]]);
  const secondo = orchestratore(cartella, sessioniDopo);
  const esito = await secondo.orch.riprendi({ id });
  assert.equal(esito.ok, true, '⛔ la ripresa NON dipende da `voce.messaggiFinali`: quello un riavvio lo cancella, il giornale no');

  const consegna = secondo.avviati[0].messaggiIniziali?.[0]?.content ?? secondo.avviati[0].task?.consegna ?? '';
  const testo = JSON.stringify(secondo.avviati[0]);
  assert.match(testo, /Steps already completed: b1:search/, '⛔ i passi già pagati si NOMINANO: «do not redo work that is listed as done»');
  assert.match(testo, /Lines of inquiry still open/, '⛔ e le linee ancora aperte escono dal PIANO, non dal giornale: un ramo mai partito non ha eventi, e chiedere al solo giornale chiamerebbe il giro finito');
  assert.match(testo, /fonti contrarie/, 'il ramo 2, quello che non è stato toccato');
  assert.doesNotMatch(testo, /The journal records the run itself but not individual collection steps/,
    '⛔ la frase di ripiego di L4 NON deve più comparire: era vera quando il collettore non era agganciato, e oggi direbbe il falso');
  assert.ok(consegna === '' || typeof consegna === 'string');

  // E la raccolta è RIMONTATA: senza, una ricerca ripresa tornerebbe allo stato di ieri.
  assert.ok(secondo.orch.raccoltaDellaRicerca(id), '⛔ la cura non può valere solo finché il server non si riavvia: una ricerca lunga è proprio quella che il riavvio interrompe');
  const letta = await secondo.orch.leggi({ cartella, id });
  assert.equal(letta.piano.length, 4, 'il piano si RILEGGE dal disco, non si ricalcola');
  assert.equal(letta.spesa.pages, 1, 'e la spesa già fatta resta contata');
});

/* ══════════════════ 5. IL KERNEL — e la garanzia per TALOS-BANCO ══════════════════ */

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
const chiamataAttrezzo = (nome, argomenti) => ({ role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: nome, arguments: JSON.stringify(argomenti) } }] });
const esitoDelloStrumento = (rete) => rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool').content;

test('⭐⭐⭐ L9 §7-C — `web_search` passa dalla cache della corsa quando c\'è, e la SECONDA identica non esce in rete', async (t) => {
  const cartella = cartellaVera(t);
  const { orch } = orchestratore(cartella);
  const { id } = await orch.avvia({ cartella, question: 'X?', depth: 'deep' });
  const raccolta = orch.raccoltaDellaRicerca(id);

  let ricerche = 0;
  const richiediRicercaFn = async () => {
    ricerche += 1;
    return { stato: 200, corpo: JSON.stringify({ results: [{ url: 'https://tre.invalid/c', title: 'C', content: 'un estratto' }] }) };
  };
  const opzioni = {
    cartella, task: { consegna: 'cerca' }, modello: 'm', chiave: 'k',
    strumentiEstesi: ['web_search'], ricercaWeb: { provider: 'tavily', apiKey: 'x' }, richiediRicercaFn,
    cacheWeb: raccolta, livelloAccesso: 'lettura',
  };
  const prima = reteDiRisposte(chiamataAttrezzo('web_search', { query: 'stessa domanda' }), CONCLUSO);
  await talosLavora({ ...opzioni, fetchDiRete: prima.fetch });
  const dopo = reteDiRisposte(chiamataAttrezzo('web_search', { query: 'stessa domanda' }), CONCLUSO);
  await talosLavora({ ...opzioni, fetchDiRete: dopo.fetch });

  assert.equal(ricerche, 1, '⛔ due rami della stessa corsa, una ricerca sola pagata');
  assert.equal(esitoDelloStrumento(prima), esitoDelloStrumento(dopo),
    '⛔⛔ BYTE IDENTICI fra la volta pagata e quella servita dalla cache: se l\'uscita cambiasse, il prefisso esatto su cui si regge la cache del prompt del fornitore si azzererebbe a ogni giro');
  const letta = await orch.leggi({ cartella, id });
  assert.equal(letta.spesa.searches, 1, 'e il giornale lo sa: una ricerca pagata, una servita');
});

test('⭐⭐⭐⭐ L9 §7-B — `naviga` mostra la FINESTRA (testa + coda) invece del taglio in testa, e il testo INTERO resta su disco', async (t) => {
  const cartella = cartellaVera(t);
  const { orch } = orchestratore(cartella);
  const { id } = await orch.avvia({ cartella, question: 'X?', depth: 'deep' });
  const raccolta = orch.raccoltaDellaRicerca(id);

  /*
   * ⛔⛔ LA PAGINA SI PRE-CARICA NELLA CACHE DELLA CORSA, e non è un trucco da test: è l'unico
   *   modo di provare il ramo `naviga` del kernel SENZA uscire in rete. `leggiPaginaSicura` non
   *   è iniettabile (è il lettore vero, con la validazione contro gli indirizzi interni), quindi
   *   l'unica porta è quella che L9 ha aggiunto: la cache viene consultata PRIMA del produttore,
   *   quindi se la voce c'è già il produttore non viene chiamato affatto.
   * ⛔ E questo prova anche una cosa vera in produzione: una pagina già aperta da un altro ramo
   *   della stessa corsa non si riapre.
   */
  const corpo = `APERTURA ${'z'.repeat(40_000)} CHIUSURA`;
  await raccolta.around(
    { kind: 'extract', url: 'https://quattro.invalid/d', provider: 'naviga' },
    async () => ({ stato: 200, url: 'https://quattro.invalid/d', corpo }),
  );

  const rete = reteDiRisposte(chiamataAttrezzo('naviga', { url: 'https://quattro.invalid/d' }), CONCLUSO);
  await talosLavora({
    cartella, task: { consegna: 'naviga' }, modello: 'm', chiave: 'k', fetchDiRete: rete.fetch,
    strumentiEstesi: ['naviga'], livelloAccesso: 'lettura',
    cacheWeb: raccolta,
    onPaginaLetta: (url, testo) => raccolta.paginaLetta(url, testo),
  });

  const uscita = esitoDelloStrumento(rete);
  assert.ok(uscita.startsWith('HTTP 200 · https://quattro.invalid/d\n'), 'la riga di testa non cambia: è il contratto che il modello legge da mesi');
  assert.match(uscita, /APERTURA/);
  assert.match(uscita, /CHIUSURA/,
    '⛔ la CODA arriva: col taglio di sempre (4.000 caratteri, un quarto in testa) non ci sarebbe mai — ed è la metà di una pagina dove stanno conclusioni e riferimenti');
  assert.ok(uscita.length < corpo.length / 2, 'e resta MOLTO meno del corpo: i token si pagano su ciò che arriva al modello');

  const refs = await elencaFonti({ cartella, id });
  assert.equal(refs.length, 1, 'il testo INTERO è tenuto su disco, non solo ciò che il modello ha visto');
  const tenuto = readFileSync(join(cartellaDellaRicerca(cartella, id), refs[0]), 'utf8');
  assert.ok(tenuto.length > 40_000, '⛔ conservare di più non costa un token, e è ciò che permette di ri-verificare un anno dopo');
});

test('⛔⛔⛔ L9, LA GARANZIA PER TALOS-BANCO — senza `cacheWeb` la lista e l\'uscita degli attrezzi sono IDENTICHE a ieri, byte per byte', async (t) => {
  const cartella = cartellaVera(t);
  const risultati = { results: [{ url: 'https://cinque.invalid/e', title: 'E', content: 'un estratto qualunque' }] };
  let ricerche = 0;
  const richiediRicercaFn = async () => { ricerche += 1; return { stato: 200, corpo: JSON.stringify(risultati) }; };
  const base = {
    cartella, task: { consegna: 'cerca' }, modello: 'm', chiave: 'k', livelloAccesso: 'lettura',
    strumentiEstesi: ['web_search'], ricercaWeb: { provider: 'tavily', apiKey: 'x' }, richiediRicercaFn,
  };

  /* Due giri identici, esattamente come li fa il banco: nessun parametro nuovo, nessuna cache. */
  const primo = reteDiRisposte(chiamataAttrezzo('web_search', { query: 'una domanda' }), CONCLUSO);
  await talosLavora({ ...base, fetchDiRete: primo.fetch });
  const secondo = reteDiRisposte(chiamataAttrezzo('web_search', { query: 'una domanda' }), CONCLUSO);
  await talosLavora({ ...base, fetchDiRete: secondo.fetch });

  assert.equal(ricerche, 2, '⛔ senza cache si paga due volte: è il comportamento di ieri, e senza `cacheWeb` deve restare esattamente quello');
  assert.equal(esitoDelloStrumento(primo), esitoDelloStrumento(secondo));
  assert.equal(
    esitoDelloStrumento(primo),
    ['1 results for "una domanda".', '', '1. E', '   url: https://cinque.invalid/e', '   published: date unknown', '   un estratto qualunque'].join('\n'),
    '⛔⛔ BYTE PER BYTE la stringa che il banco misura da mesi: una uscita cambiata invaliderebbe la cache del prompt del fornitore e sposterebbe il profilo di token di ogni campagna',
  );
  assert.equal(existsSync(join(cartella, '.harness-ui-research')), false,
    '⛔ e nessuna cartella di ricerca è nata: una sessione qualunque non paga niente per una funzione che non usa');
  assert.ok(ATTREZZI_ESTESI_OPENAI.length > 0);
});

test('⛔⛔ L9, VERSO CONTRARIO — un guasto della VERIFICA non porta via il rapporto pagato: si deposita senza verdetti, e lo dice', async (t) => {
  const cartella = cartellaVera(t);
  const { orch } = orchestratore(cartella, new Map(), {
    chiediAlModelloFn: async () => { throw new Error('il giudice non risponde'); },
    modelliGiudiceFn: () => [{ id: 'altro/giudice', provider: 'openrouter', model: 'altro/giudice' }],
  });
  const { id } = await orch.avvia({ cartella, question: 'X?', depth: 'deep', modello: 'autore/uno' });
  await unGiroDiRaccolta(orch, id);

  const composto = await orch.componiRapporto({
    cartella, id, domanda: 'X?',
    testo: '# X\n\nprosa\n\n## Fonti\n- https://uno.invalid/a',
    affermazioni: [{ testo: 'I permessi per attrezzo sono lo standard di fatto nel 2026.', fonte: 'https://uno.invalid/a', passaggio: 'I permessi per attrezzo sono lo standard di fatto nel 2026.' }],
    fonti: FONTI_DEPOSITATE,
  });
  assert.equal(composto.ok, true, '⛔ il rapporto c\'è: perdere il lavoro pagato per far fallire il suo controllo sarebbe il guasto introdotto dalla cura');
  const record = talosResearchParseReport(composto.documento);
  assert.equal(record.claims[0].checks.claimSupported, 'unchecked');
  assert.match(record.claims[0].checks.supportReason, /il giudice non risponde/,
    '⛔ e il motivo è quello VERO: «il giudice non ha risposto» e «non ce n\'era uno» sono due diagnosi diverse');

  /*
   * E il deposito vero, sul disco vero, passa comunque il cancello di consegna: il rapporto
   * senza verdetti è un rapporto, e il bilancio dice la verità — una non verificata.
   * ⛔ `terminata: 'done'` va scritto prima di rileggere: il cancello rilegge solo le voci che
   *   si dichiarano concluse, perché sono le sole che possono mentire su un rapporto.
   */
  await scriviRapporto({ cartella, id, testo: composto.documento });
  await aggiornaRicerca({ cartella, id, terminata: 'done' });
  const letta = await orch.leggi({ cartella, id });
  assert.equal(letta.stato, 'done');
  assert.deepEqual(letta.bilancio, { totali: 1, sostenute: 0, inParte: 0, nonSostenute: 0, contese: 0, nonVerificate: 1 });
});

/* ══════════════════ 6. LA CATENA INTERA — dal deposito del modello al record verificato ══════════════════ */

test('⭐⭐⭐⭐ L9, LA CATENA INTERA — il modello chiama `research_deposit`, e il SERVER verifica prima che il file esista', async (t) => {
  const cartella = cartellaVera(t);
  const giudice = giudiceFinto([['Il passaggio, DA SOLO, sostiene', 'SI — il passaggio lo dice testualmente']]);
  const { orch } = orchestratore(cartella, new Map(), {
    chiediAlModelloFn: giudice.fn,
    modelliGiudiceFn: () => [{ id: 'altro/giudice', provider: 'openrouter', model: 'altro/giudice' }],
  });
  const { id } = await orch.avvia({ cartella, question: 'Come evolvono gli harness?', depth: 'deep', modello: 'autore/uno' });
  await unGiroDiRaccolta(orch, id);

  /*
   * ⛔ La figlia NON passa `judge` né `claimSupported`: non sono argomenti dell'attrezzo, e da
   *   L8 non lo sono più nemmeno in teoria. Passa la prosa, le affermazioni e le fonti — il
   *   resto lo scrive il server, che è l'unico a poterlo fare senza che il modello timbri sé
   *   stesso (arXiv:2404.13076).
   */
  const rete = reteDiRisposte(chiamataAttrezzo('research_deposit', {
    testo: '# Harness 2026\n\nUn rapporto in prosa, scritto dal modello e mai riscritto da noi.\n\n## Fonti\n- https://uno.invalid/a',
    affermazioni: [{
      testo: 'I permessi per attrezzo sono lo standard di fatto nel 2026.',
      fonte: 'https://uno.invalid/a',
      passaggio: 'I permessi per attrezzo sono lo standard di fatto nel 2026.',
    }],
    fonti: [{ url: 'https://uno.invalid/a', titolo: 'Fonte uno', dataDichiarata: '2026-02-01', letta: true }],
  }), CONCLUSO);

  await talosLavora({
    cartella,
    task: { consegna: 'deposita', ricercaId: id, ricercaDomanda: 'Come evolvono gli harness?' },
    modello: 'autore/uno', chiave: 'y', fetchDiRete: rete.fetch,
    livelloAccesso: 'ricerca', strumentiEstesi: ['research_deposit'],
    // ⛔ Esattamente il cablaggio di `session-registry.mjs`: la `cartella` la mette il registro, l'`id` il kernel.
    componiRapportoRicercaFn: (arg) => orch.componiRapporto({ ...arg, cartella }),
  });

  const risposta = esitoDelloStrumento(rete);
  assert.match(risposta, /^deposited:/);
  assert.match(risposta, /An independent check ran before saving \(judge: altro\/giudice, never the model that wrote it\)/,
    '⛔ e il modello lo SA: è l\'unico momento in cui può accorgersi di aver citato qualcosa che nella pagina non c\'è');
  assert.match(risposta, /1 supported, 0 partly, 0 NOT supported, 0 contested, 0 unverified/);

  // Il file sul disco porta i verdetti VERI, non `unchecked` per tutte — lo stato di fatto del 12/09.
  const scritto = readFileSync(percorsoRapporto(cartella, id), 'utf8');
  const record = talosResearchParseReport(scritto);
  assert.equal(record.judge, 'altro/giudice');
  assert.equal(record.claims[0].checks.claimSupported, 'yes');
  assert.equal(record.claims[0].checks.judge, 'altro/giudice');
  assert.notEqual(record.claims[0].checks.judge, 'autore/uno', '⛔ MAI l\'autore: è la riga per cui esiste `modelloGiudice`');
  assert.equal(record.summary, '# Harness 2026\n\nUn rapporto in prosa, scritto dal modello e mai riscritto da noi.\n\n## Fonti\n- https://uno.invalid/a',
    '⛔ la PROSA del modello arriva verbatim: la forma rigida si applica allo scheletro, mai al ragionamento (arXiv:2605.26128)');

  // E il cancello di consegna, sullo stesso file, dice `done` con un bilancio vero.
  await aggiornaRicerca({ cartella, id, terminata: 'done' });
  const letta = await orch.leggi({ cartella, id });
  assert.equal(letta.stato, 'done');
  assert.deepEqual(letta.bilancio, { totali: 1, sostenute: 1, inParte: 0, nonSostenute: 0, contese: 0, nonVerificate: 0 },
    '⛔ IERI: 38 affermazioni su 38 «non verificate». Oggi il bilancio dice ciò che qualcuno ha davvero controllato');
  assert.equal(letta.giudice, 'altro/giudice');
  assert.equal(letta.modelloGiudice, 'altro/giudice');
});
