/**
 * raccolta-viva.test.mjs — L9 (12/09/2026): il ponte fra gli attrezzi della figlia e il motore.
 *
 * ⛔ Che cosa prova, in una riga: che `web_search` e `naviga`, passando da qui, diventano PASSI
 *   del giornale con una spesa CONTATA, fonti TENUTE e una cache che prende — senza che nessuno
 *   tocchi la rete, un modello o un filesystem. Ogni dipendenza è finta e conta le chiamate.
 *
 * ⛔⛔ E si prova anche nel verso in cui deve dire di no: una lettura che fallisce scrive
 *   `step_failed` **e rilancia** (un errore inghiottito qui diventerebbe una pagina vuota, cioè
 *   un silenzio), e una fonte che non si riesce a scrivere non porta via la corsa.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { talosResearchFetchCache } from '../../src/research/fetch-cache.mjs';
import { TALOS_RESEARCH_CONSERVA_DESKTOP, TALOS_RESEARCH_FINESTRA_SOTTO_IL_KERNEL, creaRaccoltaViva } from '../../src/research/raccolta-viva.mjs';

/* ─────────────────────────── impalcatura ─────────────────────────── */

const PIANO = [
  { id: 'b1', question: 'X — fatti e numeri', estimate: { searches: 1, pages: 3, tokens: 6500 } },
  { id: 'b2', question: 'X — fonti contrarie', estimate: { searches: 1, pages: 3, tokens: 6500 } },
];

function banco({ piano = PIANO, tettoFinestra = 15_000 } = {}) {
  const eventi = [];
  const scritte = [];
  const indice = [];
  const raccolta = creaRaccoltaViva({
    cache: talosResearchFetchCache(),
    registra: (evento) => { eventi.push(evento); },
    tieniFonte: async (testo) => {
      scritte.push(testo);
      return { ref: `fonti/${createHash('sha256').update(testo, 'utf8').digest('hex')}.txt`, giaPresente: false };
    },
    annotaFonte: async (voce) => { indice.push(voce); },
    piano: () => piano,
    tettoFinestra,
  });
  return { raccolta, eventi, scritte, indice };
}

const risultato = (url, snippet = 'un estratto') => ({ url, title: `Titolo di ${url}`, snippet, pubblicato: '2026-01-02' });
const cerca = (...righe) => ({ kind: 'search', query: righe[0], limit: 5, provider: 'tavily' });

/* ══════════════════ 1. LA RICERCA — un passo, un ramo, una spesa ══════════════════ */

test('⭐⭐⭐ L9 — una ricerca diventa DUE righe di giornale (`step_started` + `step_finished`) sul ramo 1 del piano', async () => {
  const { raccolta, eventi } = banco();
  let chiamate = 0;
  const esito = await raccolta.around(
    { kind: 'search', query: 'harness agentici 2026', limit: 5, provider: 'tavily' },
    async () => { chiamate += 1; return [risultato('https://a.invalid/1'), risultato('https://a.invalid/2')]; },
  );

  assert.equal(chiamate, 1);
  assert.equal(esito.fromCache, false);
  assert.deepEqual(eventi.map((e) => e.kind), ['step_started', 'step_finished']);
  assert.equal(eventi[0].branchId, 'b1', '⛔ la prima ricerca è la prima linea d\'indagine: è la convenzione dichiarata, ed è quella che la consegna chiede di seguire');
  assert.equal(eventi[0].stepKind, 'search');
  assert.equal(eventi[0].stepId, 'b1:search', '⛔ il nome del passo è DERIVATO dal ramo, mai contato: due tentativi dello stesso passo devono essere riconoscibili come lo stesso');
  assert.equal(eventi[1].spend.searches, 1);
  assert.equal(eventi[1].spend.pages, 0);
  assert.ok(eventi[1].spend.tokens > 0, 'i caratteri dei risultati si contano: una ricerca non è gratis');
});

test('⭐⭐ L9 — la SECONDA ricerca distinta è il ramo 2, la terza esce dal piano e si chiama `oltre-1` (mai un id che sembri approvato)', async () => {
  const { raccolta, eventi } = banco();
  for (const q of ['uno', 'due', 'tre']) {
    await raccolta.around({ kind: 'search', query: q, limit: 5, provider: 'tavily' }, async () => []);
  }
  const rami = eventi.filter((e) => e.kind === 'step_started').map((e) => e.branchId);
  assert.deepEqual(rami, ['b1', 'b2', 'oltre-1'],
    '⛔ un passo fuori dal piano NON prende un id `b3`: chi rilegge il giornale deve poter distinguere una linea approvata da una che il modello ha aggiunto');
});

test('⭐⭐⭐ L9 — la STESSA ricerca due volte: la cache prende, il passo è LO STESSO, e la seconda non è pagata', async () => {
  const { raccolta, eventi } = banco();
  let chiamate = 0;
  const produttore = async () => { chiamate += 1; return [risultato('https://a.invalid/1')]; };
  await raccolta.around(cerca('stessa domanda'), produttore);
  const seconda = await raccolta.around(cerca('stessa domanda'), produttore);

  assert.equal(chiamate, 1, '⛔ la seconda non è uscita in rete');
  assert.equal(seconda.fromCache, true);
  const avvii = eventi.filter((e) => e.kind === 'step_started');
  assert.deepEqual(avvii.map((e) => e.stepId), ['b1:search', 'b1:search'], 'stesso nome: è lo stesso passo, tentato due volte');
  const finiti = eventi.filter((e) => e.kind === 'step_finished');
  assert.equal(finiti[0].spend.searches, 1);
  assert.equal(finiti[1].spend.searches, 0,
    '⛔ ciò che la cache ha servito NON è stato pagato: contarlo renderebbe invisibile il risparmio proprio nel numero fatto per mostrare il costo');
  assert.equal(raccolta.passiNominati(), 1, 'un solo passo distinto, non due');
});

/* ══════════════════ 2. LA PAGINA — tenuta, indicizzata, ritagliata ══════════════════ */

test('⭐⭐⭐⭐ L9 — una pagina letta: il TESTO si tiene su disco, la FINESTRA va al modello, e il passo porta il `resultRef`', async () => {
  const { raccolta, eventi, scritte, indice } = banco({ tettoFinestra: 200 });
  await raccolta.around(cerca('domanda'), async () => [risultato('https://p.invalid/lunga')]);
  const corpo = `INIZIO ${'x'.repeat(5_000)} FINE`;
  await raccolta.around(
    { kind: 'extract', url: 'https://p.invalid/lunga', provider: 'naviga' },
    async () => ({ stato: 200, url: 'https://p.invalid/lunga', corpo }),
  );

  const letto = eventi.filter((e) => e.stepKind === 'read');
  assert.equal(letto.length, 1, 'lo `step_started` della lettura');
  assert.equal(letto[0].branchId, 'b1', '⛔ la pagina eredita il ramo della ricerca che l\'ha trovata — l\'unica attribuzione che sia un FATTO e non una convenzione');
  assert.match(letto[0].stepId, /^b1:read:[0-9a-f]{12}$/, '⛔ l\'impronta dell\'URL dentro il nome: la stessa pagina riaperta è LO STESSO passo, due pagine diverse sono due passi');
  const fine = eventi.filter((e) => e.kind === 'step_finished').at(-1);
  assert.match(fine.resultRef, /^fonti\/[0-9a-f]{64}\.txt$/, '⛔ il `resultRef` è un nome stabile e verificabile: chi rilegge può ricalcolare l\'impronta');
  assert.equal(fine.spend.pages, 1);

  // Il testo TENUTO è quello intero (normalizzato), non la finestra.
  const tenuto = scritte.find((s) => s.includes('INIZIO'));
  assert.ok(tenuto.length > 5_000, '⛔ si conserva tutto: il dossier è ciò che permette di ri-verificare un anno dopo');
  const finestra = await raccolta.paginaLetta('https://p.invalid/lunga', corpo);
  assert.ok(finestra.length < tenuto.length, '⛔ al modello va MENO: i token si pagano su ciò che arriva a lui, conservare di più non costa un token');
  assert.ok(finestra.startsWith('INIZIO'), 'la testa c\'è');
  assert.ok(finestra.includes('FINE'), '⛔ e la CODA pure: è la metà che un taglio in testa non fa mai arrivare');
  assert.ok(indice.some((v) => v.url === 'https://p.invalid/lunga' && v.ottenuta === 'page'),
    '⛔ l\'indice url → ref: senza, dopo un riavvio la verifica non saprebbe di CHI è quel testo');
});

test('⭐⭐⭐ L9 — la STESSA pagina due volte: servita dalla cache, e `pages` non la conta di nuovo', async () => {
  const { raccolta, eventi } = banco();
  let aperture = 0;
  const leggi = async () => { aperture += 1; return { stato: 200, url: 'https://p.invalid/uno', corpo: 'un corpo qualunque' }; };
  await raccolta.around({ kind: 'extract', url: 'https://p.invalid/uno', provider: 'naviga' }, leggi);
  const seconda = await raccolta.around({ kind: 'extract', url: 'https://p.invalid/uno', provider: 'naviga' }, leggi);

  assert.equal(aperture, 1);
  assert.equal(seconda.fromCache, true);
  const finiti = eventi.filter((e) => e.kind === 'step_finished');
  assert.equal(finiti[0].spend.pages, 1);
  assert.equal(finiti[1].spend.pages, 0, '⛔ una pagina non riaperta non è stata pagata');
});

test('⭐⭐ L9 — gli ESTRATTI dei risultati si tengono come fonti `snippet`, e una pagina APERTA non viene sostituita dal suo estratto', async () => {
  const { raccolta } = banco();
  await raccolta.around(cerca('domanda'), async () => [risultato('https://s.invalid/a', 'quello che il motore ha mostrato')]);
  assert.deepEqual(raccolta.fonti().map((f) => [f.url, f.obtained]), [['https://s.invalid/a', 'snippet']],
    '⛔ senza questo, un\'affermazione su una pagina mai aperta darebbe «la fonte citata non esiste fra quelle raccolte» — un motivo FALSO per un fatto vero');

  await raccolta.around(
    { kind: 'extract', url: 'https://s.invalid/a', provider: 'naviga' },
    async () => ({ stato: 200, url: 'https://s.invalid/a', corpo: 'il testo vero della pagina' }),
  );
  assert.deepEqual(raccolta.fonti().map((f) => [f.url, f.obtained]), [['https://s.invalid/a', 'page']], 'la prova più forte vince');

  // E il giro contrario: un secondo estratto non riporta indietro a `snippet`.
  await raccolta.around(cerca('altra domanda'), async () => [risultato('https://s.invalid/a', 'un altro estratto')]);
  assert.deepEqual(raccolta.fonti().map((f) => [f.url, f.obtained]), [['https://s.invalid/a', 'page']],
    '⛔ VERSO CONTRARIO: una prova più debole non deve poter cancellare una più forte');
});

/* ══════════════════ 3. I VERSI IN CUI DEVE DIRE DI NO ══════════════════ */

test('⛔⛔⛔ L9, VERSO CONTRARIO — una lettura che FALLISCE scrive `step_failed` e RILANCIA (mai una pagina vuota spacciata per letta)', async () => {
  const { raccolta, eventi } = banco();
  await assert.rejects(
    () => raccolta.around({ kind: 'extract', url: 'https://x.invalid/no', provider: 'naviga' }, async () => { throw new Error('blocked: indirizzo privato'); }),
    /blocked: indirizzo privato/,
  );
  assert.deepEqual(eventi.map((e) => e.kind), ['step_started', 'step_failed']);
  assert.match(eventi[1].error, /blocked/);
  assert.equal(raccolta.fonti().length, 0, 'niente di inventato per riempire il dossier');
});

test('⛔⛔ L9, VERSO CONTRARIO — se la fonte non si riesce a SCRIVERE la corsa continua, e la verifica di questa corsa la vede lo stesso', async () => {
  const eventi = [];
  const raccolta = creaRaccoltaViva({
    cache: talosResearchFetchCache(),
    registra: (e) => { eventi.push(e); },
    tieniFonte: async () => { throw new Error('disco pieno'); },
    piano: () => PIANO,
  });
  await raccolta.around(
    { kind: 'extract', url: 'https://p.invalid/uno', provider: 'naviga' },
    async () => ({ stato: 200, url: 'https://p.invalid/uno', corpo: 'testo vero' }),
  );
  const fine = eventi.at(-1);
  assert.equal(fine.kind, 'step_finished', '⛔ il lavoro pagato non si perde per un guasto del deposito');
  assert.equal(fine.resultRef, null, '⛔ e non si finge che il testo sia su disco: `null` dice la verità');
  assert.deepEqual(raccolta.testiPerUrl().get('https://p.invalid/uno'), 'testo vero',
    '⛔ in memoria c\'è: la ri-verifica fra un anno l\'ha persa, la verifica di ADESSO no');
});

test('⛔ L9 — una pagina VUOTA non diventa una fonte, e `paginaLetta` risponde `null` invece di mostrare il vuoto', async () => {
  const { raccolta } = banco();
  await raccolta.around(
    { kind: 'extract', url: 'https://p.invalid/vuota', provider: 'naviga' },
    async () => ({ stato: 204, url: 'https://p.invalid/vuota', corpo: '   ' }),
  );
  assert.equal(raccolta.fonti().length, 0);
  assert.equal(await raccolta.paginaLetta('https://p.invalid/altra', ''), null,
    '⛔ `null` = «non lo so», e chi chiama ricade sul suo taglio di sempre invece di mostrare il vuoto');
});

test('⛔ L9 — il tetto di conservazione del desktop è SOPRA il budget della finestra (invertirli renderebbe il budget inutile)', () => {
  assert.equal(TALOS_RESEARCH_CONSERVA_DESKTOP, 200_000);
  assert.ok(TALOS_RESEARCH_CONSERVA_DESKTOP > TALOS_RESEARCH_FINESTRA_SOTTO_IL_KERNEL);
});

/*
 * ⛔⛔⛔⭐⭐⭐ IL DIFETTO TROVATO DAL VIVO IL 12/09, e questo test è la sua guardia.
 *
 * `TALOS_RESEARCH_PAGE_BUDGET` vale **15.000** — misurato da L6 su 430 pagine vere. Ma il
 * kernel taglia il risultato di un attrezzo a **8.000 caratteri** prima di metterlo nel
 * messaggio `role:'tool'` (`talosHarness.mjs`: `String(esito).slice(0, 8_000)`). Una finestra da
 * 15.191 caratteri arrivava quindi al modello **senza marcatore e senza coda**: le due cose per
 * cui il budget esiste, tolte in silenzio da un tetto scritto in un altro file.
 *
 * ⛔ Nessuno dei due file poteva accorgersene da solo, ed è il punto: due tetti in due lotti
 *   diversi, e il più stretto vince senza dirlo. La guardia deve stare QUI, dove il numero si
 *   sceglie — non nella memoria di chi lo ha scelto.
 */
test('⛔⛔⛔ L9, IL TETTO CHE VINCE È QUELLO DEL KERNEL — la finestra sta sotto gli 8.000 caratteri del `role:"tool"`, marcatore e coda compresi', async () => {
  const TETTO_DEL_KERNEL = 8_000; // `talosHarness.mjs`: `String(esito).slice(0, 8_000)`
  assert.ok(TALOS_RESEARCH_FINESTRA_SOTTO_IL_KERNEL < TETTO_DEL_KERNEL,
    '⛔ una finestra più larga del tetto del kernel è una finestra che nessuno vedrà mai per intero');

  const { raccolta } = banco({ tettoFinestra: TALOS_RESEARCH_FINESTRA_SOTTO_IL_KERNEL });
  const corpo = `APERTURA ${'z'.repeat(80_000)} CHIUSURA`;
  await raccolta.around(
    { kind: 'extract', url: 'https://p.invalid/enorme', provider: 'naviga' },
    async () => ({ stato: 200, url: 'https://p.invalid/enorme', corpo }),
  );
  const finestra = await raccolta.paginaLetta('https://p.invalid/enorme', corpo);
  const rigaDiTesta = 'HTTP 200 · https://p.invalid/enorme\n';

  /*
   * ⛔ Si misura la STRINGA INTERA, non `cap`: la finestra è testa + MARCATORE + coda, e il
   *   marcatore porta dentro il percorso della fonte (`fonti/<64 esadecimali>.txt`, ~75
   *   caratteri). La prima versione della costante valeva 7.800 e continuava a perdere la coda
   *   proprio perché confrontavo il tetto con `cap` invece che col totale — lo stesso errore
   *   una seconda volta, in miniatura.
   */
  assert.ok(rigaDiTesta.length + finestra.length < TETTO_DEL_KERNEL,
    '⛔ e ci sta DENTRO anche con la riga di testa che `naviga` mette davanti: il margine è parte del numero, non una speranza');
  assert.ok(finestra.includes('CHIUSURA'), '⛔ la coda arriva DAVVERO: è la metà che il taglio di sempre non porta mai');
  assert.match(finestra, /Il testo intero è in fonti\/[0-9a-f]{64}\.txt/,
    '⛔ e il marcatore dice DOVE sta il resto, col percorso vero: «chi non ha un deposito non passa niente e il marcatore tace invece di promettere un percorso»');
  assert.ok(finestra.length > 4_000, 'resta comunque più largo dei 4.000 caratteri di oggi: si stringe per passare, non si rinuncia');
});
