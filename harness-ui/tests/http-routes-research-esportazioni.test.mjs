import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { createSessionRegistry as createSessionRegistryReale } from '../src/session-registry.mjs';
import { scriviRapporto } from '../src/research-store.mjs';
import { talosResearchReportDocument } from '../src/research/report.mjs';
import { FORMATI_ESPORTAZIONE, nomeSicuroDiEsportazione } from '../src/research/esportazioni.mjs';

/*
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⭐⭐⭐⭐ 12/09/2026 — LA SUITE DI ESPORTAZIONI DELLA RICERCA, DALLA PORTA VERA
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * Owner 12/09: «la ricerca approfondita deve avere una suite di esportazioni COMPLETA».
 *
 * ⛔ Server VERO su una porta libera, registro VERO, magazzino VERO su un disco TEMPORANEO.
 *   Mai la 4174, mai i dati dell'owner, mai un giro col modello: la sessione la fa partire un
 *   `avviaSessioneFn` finto che non chiama nessuna rete. Stesso banco di `http-routes-research`
 *   — copiato di proposito invece che reinventato, così le due famiglie di prove misurano lo
 *   stesso prodotto.
 * ⛔ E il corpo di OGNI formato si RILEGGE, non si guarda la lunghezza: un `.pdf` di 3 KB e un
 *   `.docx` di 8 KB possono essere entrambi spazzatura, e `Content-Length` non se ne accorge.
 *   Il pdf si riapre con `pdf-lib` e si contano le pagine; il docx si riapre con `jszip` e si
 *   cerca `word/document.xml`; il json si fa passare da `JSON.parse`. È la stessa regola di
 *   `verifyTalosDocument`: la domanda non è «abbiamo scritto quello che volevamo», è «il file
 *   che una persona apre è integro».
 */

const DOMANDA = 'Come stanno evolvendo gli harness agentici desktop nel 2026';

/** Un rapporto col record recintato, scritto dallo scrittore VERO del motore. */
function rapportoRecintato({ fonti = 2, judge = 'giudice-di-prova' } = {}) {
  return talosResearchReportDocument({
    question: DOMANDA,
    summary: 'Convergono su controllo del computer, permessi per attrezzo e memoria persistente.',
    judge,
    claims: Array.from({ length: fonti }, (_v, i) => ({
      claim: { text: `Affermazione ${i + 1}.`, sourceIndex: i + 1, quote: 'q' },
      passage: `il passaggio numero ${i + 1}`,
      checks: { claimSupported: i === 0 ? 'yes' : 'no', supportReason: 'motivo di prova' },
    })),
    sources: Array.from({ length: fonti }, (_v, i) => ({
      url: `https://esempio${i + 1}.invalid/fonte`,
      title: `Fonte ${i + 1}`,
      publishedAt: '2026-03-04T00:00:00.000Z',
      obtained: i === 0 ? 'page' : 'snippet',
    })),
  });
}

async function banco(t) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-exp-'));
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-exp-store-'));
  t.after(() => {
    rmSync(radice, { recursive: true, force: true });
    rmSync(cartellaStore, { recursive: true, force: true });
  });
  const stato = { radice, cartellaStore, avvii: [], chiusure: new Map() };
  const registro = createSessionRegistryReale({
    cartellaStore,
    guardaWorkspaceFn: () => () => {},
    cartelleProgetto: [{ id: '0', percorso: radice, nome: 'progetto' }],
    preparaEsecuzioneLiberaFn: () => ({ cartella: radice, comandoProva: null, task: { id: 'libero', consegna: 'lavora' } }),
    cartellaEsisteFn: () => true,
    modello: 'm',
    chiave: 'k',
    /* ⛔ Iniettato anche qui, benché nessuna di queste prove ri-verifichi: senza, una regressione
       che facesse uscire in rete la costruzione di un export misurerebbe l'ambiente, non l'oggetto. */
    leggiPaginaFn: async () => ({ url: '', stato: 200, corpo: '' }),
    avviaSessioneFn: (input) => {
      stato.avvii.push(input);
      if (!input?.task?.ricercaId) return new Promise(() => {});
      return new Promise((risolvi) => {
        stato.chiusure.set(input.task.ricercaId, (risultato) => {
          input.onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
          risolvi(risultato);
        });
        input.segnaleStop.addEventListener('abort', () => {
          stato.chiusure.get(input.task.ricercaId)({ ok: true, esito: { comeFinita: 'interrotto', messaggiFinali: null } });
        }, { once: true });
      });
    },
  });
  const app = createHttpApp({
    staticHandler: async () => null,
    listaTaskDisponibili: () => [],
    elencaCartelleProgetto: () => [],
    sessionRegistry: registro,
  });
  const server = createServer(app);
  await new Promise((risolvi) => server.listen(0, '127.0.0.1', risolvi));
  t.after(() => new Promise((risolvi) => server.close(risolvi)));
  return { ...stato, registro, base: `http://127.0.0.1:${server.address().port}` };
}

const chiama = (base, percorso, metodo = 'GET') => fetch(`${base}${percorso}`, { method: metodo });

/** Avvia una sessione madre e, da dentro, una ricerca vera con la porta del modello. */
async function conRicercaViva(b, domanda = DOMANDA) {
  const avvio = b.registro.avviaLibero({ cartellaId: '0', consegna: 'lavora' });
  const madre = b.avvii.find((i) => !i?.task?.ricercaId);
  const esito = await madre.onRicercaAvvia({ question: domanda, depth: 'deep' });
  assert.equal(esito.ok, true, esito.esito);
  return { sessionId: avvio.sessionId, ricercaId: esito.id };
}

/** ⛔ Si aspetta una CONDIZIONE, mai un numero di millisecondi. Il PASSO fra una domanda e
 *  l'altra invece è una scelta di banco, e qui vale 60 ms: vedi `concludi`. */
async function finoA(condizione, cosa, passo = 60, limite = 8_000) {
  const scadenza = Date.now() + limite;
  for (;;) {
    const ultimo = await condizione();
    if (ultimo) return ultimo;
    if (Date.now() > scadenza) throw new assert.AssertionError({ message: `mai arrivato: ${cosa}` });
    await new Promise((risolvi) => setTimeout(risolvi, passo));
  }
}

/*
 * ⛔⛔⛔ TROVATO PER STRADA, E NON È UN DIFETTO DEL BANCO: SU WINDOWS UN LETTORE FA FALLIRE LA
 * SCRITTURA ATOMICA DEL MAGAZZINO.
 *
 * La prima stesura interrogava `GET …/research/:id` ogni **10 ms** (copiato da
 * `http-routes-research.test.mjs`). Sotto il carico della suite intera, una corsa su alcune è
 * morta così:
 *
 *   EPERM: operation not permitted, rename '…/meta.json.tmp-…' -> '…/meta.json'
 *     at scriviAtomico (src/research-store.mjs:232)  ← dentro onConclusioneRicerca
 *
 * ⛔ Non è il LETTORE a fallire: è lo SCRITTORE. Su Windows `MoveFileEx` su una destinazione che
 *   qualcuno ha aperta non riesce, e `scriviAtomico` **non ritenta** — il `catch` pulisce il
 *   temporaneo e rilancia (per scelta dichiarata: «un errore inghiottito qui vorrebbe dire
 *   "salvato" su una voce mai salvata»). ⇒ La conclusione della ricerca esplode e la voce resta
 *   `running` sul disco per sempre.
 * ⛔⛔ E il lettore concorrente NON è un'invenzione del test: la sezione Ricerca del frontend
 *   interroga l'elenco e la scheda **mentre** una ricerca gira. È un APERTO del prodotto,
 *   registrato nel rapporto di questo lotto e NON curato qui: la cura sta in `research-store.mjs`
 *   (un ritento limitato sul `rename` per `EPERM`/`EBUSY`), che non è nel mio lotto.
 * ⇒ Qui il banco smette di essere la causa più probabile: si cede il giro al loop finché la
 *   scrittura non ha avuto il suo turno, e poi si chiede ogni 60 ms invece che ogni 10.
 */
async function concludi(b, sessionId, ricercaId, ultimo = 'Ho depositato il rapporto.') {
  b.chiusure.get(ricercaId)({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'assistant', content: ultimo }] } });
  // ⛔ Nessuna attesa a tempo: si restituisce il controllo al loop, che è dove la scrittura vive.
  for (let giro = 0; giro < 20; giro += 1) await new Promise((risolvi) => setImmediate(risolvi));
  return finoA(async () => {
    const r = (await (await chiama(b.base, `/api/v1/sessions/${sessionId}/research/${ricercaId}`)).json()).data.ricerca;
    return r.conclusaAlle ? r : null;
  }, 'la conclusione scritta sul disco');
}

/** Una ricerca conclusa, col rapporto verificabile depositato. */
async function conRapporto(b, opzioni) {
  const { sessionId, ricercaId } = await conRicercaViva(b);
  await scriviRapporto({ cartella: b.radice, id: ricercaId, testo: rapportoRecintato(opzioni) });
  const scheda = await concludi(b, sessionId, ricercaId);
  assert.equal(scheda.stato, 'done', 'la fixture deve passare il cancello, altrimenti non prova niente');
  return { sessionId, ricercaId };
}

/** Una ricerca conclusa che ha depositato PROSA, respinta dal cancello: `senza-rapporto`. */
async function senzaRapporto(b) {
  const { sessionId, ricercaId } = await conRicercaViva(b);
  const scusa = 'La sessione è in sola lettura, quindi non posso creare documenti direttamente.';
  await scriviRapporto({ cartella: b.radice, id: ricercaId, testo: scusa });
  const scheda = await concludi(b, sessionId, ricercaId, scusa);
  assert.equal(scheda.stato, 'senza-rapporto');
  return { sessionId, ricercaId };
}

const esporta = (b, sessionId, ricercaId, query) => chiama(b.base, `/api/v1/sessions/${sessionId}/research/${ricercaId}/esporta?${query}`);

/* ─────────────────────────── 1. OGNI FORMATO ESCE, E SI RILEGGE ─────────────────────────── */

test('⭐⭐⭐⭐ tutti e otto i formati escono 200, col loro tipo, col loro nome, e il corpo si RILEGGE', async (t) => {
  const b = await banco(t);
  const { sessionId, ricercaId } = await conRapporto(b);

  /** Le attese, formato per formato: il tipo dichiarato, l'estensione del nome, e come si rilegge. */
  const attese = {
    md: {
      tipo: 'text/markdown; charset=utf-8',
      estensione: '.md',
      async rileggi(risposta) {
        const testo = await risposta.text();
        assert.match(testo, /```talos-research-report/, '⛔ il `md` è il rapporto COM\'È: il recinto è ciò che lo rende ri-verificabile');
        assert.match(testo, /Affermazione 1\./);
      },
    },
    html: {
      tipo: 'text/html; charset=utf-8',
      estensione: '.html',
      async rileggi(risposta) {
        const testo = await risposta.text();
        assert.match(testo, /^<!doctype html>/i, 'una pagina autonoma, non un frammento');
        assert.doesNotMatch(testo, /<script/i, '⛔ nessuno script: questo file si apre con file:// da un browser qualunque');
        assert.match(testo, /<style>/, 'CSS incorporato: deve reggere senza rete');
        assert.match(testo, /prefers-color-scheme: dark/, '⛔ tema chiaro E scuro, sempre tutti e due');
        assert.match(testo, /sostenuta dalla fonte/, 'i verdetti ci sono');
        assert.match(testo, /il passaggio numero 1/, 'e il passaggio, che è la prova');
        assert.match(testo, /<b>2<\/b> affermazioni/, 'e il bilancio, quello della SCHEDA — mai ricontato qui');
      },
    },
    pdf: {
      tipo: 'application/pdf',
      estensione: '.pdf',
      async rileggi(risposta) {
        const bytes = new Uint8Array(await risposta.arrayBuffer());
        assert.deepEqual([...bytes.slice(0, 5)], [0x25, 0x50, 0x44, 0x46, 0x2d], '⛔ il magic %PDF-, non una stringa che comincia per caso');
        const { PDFDocument } = await import('pdf-lib');
        assert.ok((await PDFDocument.load(bytes)).getPageCount() > 0, 'e almeno una pagina dentro');
      },
    },
    docx: {
      tipo: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      estensione: '.docx',
      async rileggi(risposta) {
        const bytes = new Uint8Array(await risposta.arrayBuffer());
        assert.deepEqual([...bytes.slice(0, 2)], [0x50, 0x4b], 'un OOXML è uno zip: PK');
        const { default: JSZip } = await import('jszip');
        const archivio = await JSZip.loadAsync(bytes);
        const corpo = await archivio.file('word/document.xml').async('string');
        assert.match(corpo, /<w:p[ >]/, 'e dentro c\'è un documento con paragrafi veri');
        assert.doesNotMatch(corpo, /talos-research-report/, '⛔ il recinto per le macchine non finisce in un documento impaginato');
      },
    },
    json: {
      tipo: 'application/json; charset=utf-8',
      estensione: '.json',
      async rileggi(risposta) {
        const dati = JSON.parse(await risposta.text());
        assert.equal(dati.schema, 'talos.research.export.v1');
        assert.equal(dati.ricerca.domanda, DOMANDA);
        assert.equal(dati.ricerca.stato, 'done');
        assert.deepEqual(dati.ricerca.bilancio, { totali: 2, sostenute: 1, inParte: 0, nonSostenute: 1, contese: 0, nonVerificate: 0 });
        assert.deepEqual(dati.ricerca.spesa, { tokens: 0, searches: 0, pages: 0 });
        assert.equal(dati.record.version, 1);
        assert.equal(dati.record.claims.length, 2);
        assert.equal(dati.record.sources.length, 2);
      },
    },
    bib: {
      tipo: 'application/x-bibtex; charset=utf-8',
      estensione: '.bib',
      async rileggi(risposta) {
        const testo = await risposta.text();
        assert.match(testo, /^@misc\{/, '⛔ un `.bib` comincia per @: è la prima cosa che guarda un gestore');
        assert.equal((testo.match(/@misc\{/g) ?? []).length, 2, 'una voce per fonte');
        assert.match(testo, /year = \{2026\}/);
        assert.doesNotMatch(testo, /harness agentici/, '⛔ PRIVACY: la domanda NON esce in una bibliografia');
      },
    },
    ris: {
      tipo: 'application/x-research-info-systems; charset=utf-8',
      estensione: '.ris',
      async rileggi(risposta) {
        const testo = await risposta.text();
        assert.match(testo, /^TY {2}- ELEC/);
        assert.match(testo, /ER {2}- /, '⛔ senza `ER` i gestori non vedono la fine del record');
        assert.doesNotMatch(testo, /harness agentici/, '⛔ PRIVACY: stessa regola del BibTeX');
      },
    },
    fonti: {
      tipo: 'text/markdown; charset=utf-8',
      estensione: '-fonti.md',
      async rileggi(risposta) {
        const testo = await risposta.text();
        assert.match(testo, /https:\/\/esempio1\.invalid\/fonte/);
        assert.match(testo, /Data dichiarata: 2026-03-04T00:00:00\.000Z/, 'la data DICHIARATA dalla pagina, esattamente come sta nel record: non si accorcia e non si reinventa');
        assert.match(testo, /solo estratto dal motore di ricerca/);
        assert.match(testo, /«il passaggio numero 2» — Affermazione 2\./, '⛔ e i passaggi vanno sotto la fonte GIUSTA (sourceIndex è 1-based)');
      },
    },
  };

  assert.deepEqual(Object.keys(attese).sort(), [...FORMATI_ESPORTAZIONE].sort(),
    '⛔ un formato nuovo senza la sua riga qui sarebbe un formato mai provato');

  for (const [formato, attesa] of Object.entries(attese)) {
    const risposta = await esporta(b, sessionId, ricercaId, `formato=${formato}`);
    /* ⛔ Il corpo si legge UNA volta sola (`Response` non è riavvolgibile): il motivo di un
       fallimento si prende solo quando il fallimento c'è. */
    if (risposta.status !== 200) assert.fail(`${formato}: ${risposta.status} — ${await risposta.text()}`);
    assert.equal(risposta.headers.get('content-type'), attesa.tipo, `il tipo di ${formato}`);
    const disposizione = risposta.headers.get('content-disposition');
    assert.match(disposizione, /^attachment; filename="/, `${formato}: si scarica, non si apre dentro la nostra pagina`);
    assert.match(disposizione, new RegExp(`${attesa.estensione.replace('.', '\\.')}"`), `l'estensione di ${formato}`);
    assert.equal(risposta.headers.get('x-content-type-options'), 'nosniff', `${formato}: niente sniffing`);
    assert.equal(risposta.headers.get('cache-control'), 'private, no-store');
    await attesa.rileggi(risposta);
  }
});

test('⭐⭐⭐ i TRE TONI del pdf sono tre documenti diversi, e tutti e tre si riaprono', async (t) => {
  const b = await banco(t);
  const { sessionId, ricercaId } = await conRapporto(b, { fonti: 4 });
  const { PDFDocument } = await import('pdf-lib');

  const misure = [];
  for (const tono of ['report', 'brief', 'dossier']) {
    const risposta = await esporta(b, sessionId, ricercaId, `formato=pdf&tono=${tono}`);
    assert.equal(risposta.status, 200, tono);
    const bytes = new Uint8Array(await risposta.arrayBuffer());
    const pdf = await PDFDocument.load(bytes);
    assert.ok(pdf.getPageCount() > 0, `${tono}: almeno una pagina`);
    misure.push({ tono, pagine: pdf.getPageCount(), byte: bytes.byteLength });
  }
  /* ⛔ Tre documenti DIVERSI, e la prova è sulla forma: se differissero solo per il tema la
     scelta sarebbe una domanda posta a vuoto. Il `brief` sta su UNA pagina per costruzione
     (niente copertina), il `report` no. */
  assert.equal(misure.find((m) => m.tono === 'brief').pagine, 1, 'la sintesi promette una pagina e la mantiene');
  assert.ok(misure.find((m) => m.tono === 'report').pagine > 1, 'il rapporto completo no');
  assert.equal(new Set(misure.map((m) => m.byte)).size, 3, 'e nessuno dei tre è la copia di un altro');

  // Senza `tono` esce quello predefinito, che è `report`: identico per pagine a quello esplicito.
  const implicito = await esporta(b, sessionId, ricercaId, 'formato=pdf');
  assert.equal((await PDFDocument.load(new Uint8Array(await implicito.arrayBuffer()))).getPageCount(),
    misure.find((m) => m.tono === 'report').pagine);
});

/* ───────────────── 2. VERSO CONTRARIO — CIÒ CHE NON SI PUÒ ESPORTARE ───────────────── */

test('⛔⛔ un formato o un tono che NON esistono sono 400, e non toccano il disco', async (t) => {
  const b = await banco(t);
  const { sessionId, ricercaId } = await conRapporto(b);

  for (const query of ['formato=xlsx', 'formato=epub', 'formato=', 'formato=PDF', 'formato=../../etc/passwd']) {
    const risposta = await esporta(b, sessionId, ricercaId, query);
    assert.equal(risposta.status, 400, query);
    assert.equal((await risposta.json()).error.code, 'RESEARCH_INVALID', query);
  }
  // ⛔ Senza `formato` non c'è un default silenzioso: un file consegnato senza che nessuno abbia
  //   detto quale è un file che qualcuno aprirà credendolo un altro.
  const senza = await chiama(b.base, `/api/v1/sessions/${sessionId}/research/${ricercaId}/esporta`);
  assert.equal(senza.status, 400);
  assert.equal((await senza.json()).error.code, 'RESEARCH_INVALID');

  const tonoIgnoto = await esporta(b, sessionId, ricercaId, 'formato=pdf&tono=poetico');
  assert.equal(tonoIgnoto.status, 400);
  assert.equal((await tonoIgnoto.json()).error.code, 'RESEARCH_INVALID');

  /* ⛔ Il tono su un formato che non è il pdf: 400, non un'accettazione silenziosa. Accettarlo
     lascerebbe credere che esistano tre bibliografie diverse. */
  const tonoFuoriPosto = await esporta(b, sessionId, ricercaId, 'formato=bib&tono=dossier');
  assert.equal(tonoFuoriPosto.status, 400);
  assert.equal((await tonoFuoriPosto.json()).error.code, 'RESEARCH_INVALID');
});

test('⛔⛔ NESSUNA query oltre le due: una chiave inventata è 400 QUERY_INVALID', async (t) => {
  const b = await banco(t);
  const { sessionId, ricercaId } = await conRapporto(b);
  for (const query of ['formato=md&percorso=../segreto', 'formato=md&nome=mio', 'formato=md&formato=json']) {
    const risposta = await esporta(b, sessionId, ricercaId, query);
    assert.equal(risposta.status, 400, query);
    assert.equal((await risposta.json()).error.code, 'QUERY_INVALID', query);
  }
});

test('⛔⛔⛔ una ricerca SENZA RECORD: 409 per json/bib/ris/fonti, 200 con «senza verifiche» per md/html/pdf', async (t) => {
  const b = await banco(t);
  const { sessionId, ricercaId } = await senzaRapporto(b);

  /*
   * ⛔ Il 409 e non un file vuoto. Un `.bib` di zero voci, o un JSON con `record: null`,
   *   consegnato in silenzio è il segno di verifica falso che tutto questo disegno esiste per
   *   togliere: chi lo riceve crede di avere una bibliografia e ha un file vuoto.
   */
  for (const formato of ['json', 'bib', 'ris', 'fonti']) {
    const risposta = await esporta(b, sessionId, ricercaId, `formato=${formato}`);
    assert.equal(risposta.status, 409, formato);
    const problema = (await risposta.json()).error;
    assert.equal(problema.code, 'RESEARCH_CONFLICT', formato);
    assert.match(problema.message, /\S/, 'e il motivo c\'è');
    assert.doesNotMatch(problema.explanation ?? '', /imprevisto/, '⛔ non è imprevisto: è uno stato dichiarato');
  }

  // ⛔ Ma la prosa depositata NON si butta: è il prodotto di una corsa pagata.
  const md = await esporta(b, sessionId, ricercaId, 'formato=md');
  assert.equal(md.status, 200);
  const testoMd = await md.text();
  assert.match(testoMd, /SENZA VERIFICHE/, '⛔ e sopra c\'è scritto che non è un rapporto verificato');
  assert.match(testoMd, /sola lettura/);

  const html = await esporta(b, sessionId, ricercaId, 'formato=html');
  assert.equal(html.status, 200);
  assert.match(await html.text(), /SENZA VERIFICHE/);

  const pdf = await esporta(b, sessionId, ricercaId, 'formato=pdf');
  assert.equal(pdf.status, 200);
  const { PDFDocument } = await import('pdf-lib');
  assert.ok((await PDFDocument.load(new Uint8Array(await pdf.arrayBuffer()))).getPageCount() > 0);
});

test('⛔⛔ una ricerca che non ha ancora prodotto NIENTE non esporta un file vuoto: 409', async (t) => {
  const b = await banco(t);
  const { sessionId, ricercaId } = await conRicercaViva(b);
  // Ancora `running`: nessun rapporto, nessuna prosa depositata.
  for (const formato of FORMATI_ESPORTAZIONE) {
    const risposta = await esporta(b, sessionId, ricercaId, `formato=${formato}`);
    assert.equal(risposta.status, 409, formato);
    assert.equal((await risposta.json()).error.code, 'RESEARCH_CONFLICT', formato);
  }
});

/* ──────────────── 3. LA PORTA: METODI, ASSENZE, E IL NOME DEL FILE ──────────────── */

test('⛔⛔ il 405 porta l\'Allow esatto, e le due assenze restano due 404 DIVERSI', async (t) => {
  const b = await banco(t);
  const { sessionId, ricercaId } = await conRapporto(b);
  const rotta = `/api/v1/sessions/${sessionId}/research/${ricercaId}/esporta`;

  const post = await chiama(b.base, `${rotta}?formato=md`, 'POST');
  assert.equal(post.status, 405, '⛔ scaricare non cambia niente sul disco: non è una POST');
  assert.deepEqual(post.headers.get('allow').split(', ').sort(), ['GET', 'HEAD']);
  assert.equal((await post.json()).error.code, 'METHOD_NOT_ALLOWED');

  /*
   * ⛔ HEAD: MISURATO, non dedotto. L'inventario aggiunge `HEAD` a ogni rotta GET (è ciò che
   *   rende onesto l'`Allow` qui sopra), ma il guardiano della catena è `method === 'GET'` —
   *   esattamente come sulla rotta sorella `GET …/sessions/:id/file`, che serve i byte di un
   *   file del workspace. ⇒ una HEAD non viene servita e cade sul 404. Non è una svista di
   *   questo lotto: è il comportamento che questo server ha già su ogni risposta binaria, e
   *   cambiarlo qui da solo creerebbe due rotte gemelle che rispondono diverso. Scritto qui
   *   perché il frontend sappia che per sapere la dimensione deve fare una GET.
   */
  const head = await chiama(b.base, `${rotta}?formato=md`, 'HEAD');
  assert.equal(head.status, 404, 'HEAD non è servita — come sulla rotta sorella dei file');

  const sessioneIgnota = await esporta(b, 'mai-vista', ricercaId, 'formato=md');
  assert.equal(sessioneIgnota.status, 404);
  assert.equal((await sessioneIgnota.json()).error.code, 'NOT_FOUND');

  const ricercaIgnota = await esporta(b, sessionId, 'mai-fatta', 'formato=md');
  assert.equal(ricercaIgnota.status, 404);
  const problema = (await ricercaIgnota.json()).error;
  assert.equal(problema.code, 'RESEARCH_NOT_FOUND', '⛔ «la sessione non c\'è» e «la ricerca non c\'è» mandano a cercare in due posti diversi');
  assert.equal(problema.title, 'Ricerca non trovata');

  // ⛔ Un id che potrebbe attraversare una cartella cade PRIMA di toccare il magazzino.
  for (const ostile of ['a%2Fb', 'C%3A%5CWindows', 'ric.1']) {
    const risposta = await esporta(b, sessionId, ostile, 'formato=md');
    assert.equal(risposta.status, 400, ostile);
    assert.equal((await risposta.json()).error.code, 'RESEARCH_INVALID', ostile);
  }
});

test('⭐⭐⭐ il nome del file viene dalla DOMANDA, nelle due forme di RFC 6266', async (t) => {
  const b = await banco(t);
  const { sessionId, ricercaId } = await conRicercaViva(b, 'Perché è così difficile misurare l\'affidabilità/qualità?');
  await scriviRapporto({ cartella: b.radice, id: ricercaId, testo: rapportoRecintato() });
  await concludi(b, sessionId, ricercaId);

  const risposta = await esporta(b, sessionId, ricercaId, 'formato=md');
  assert.equal(risposta.status, 200);
  const disposizione = risposta.headers.get('content-disposition');

  /*
   * ⛔ ENTRAMBE le forme, e il perché sta in RFC 6266 (letta il 12/09/2026): «recipients SHOULD
   *   pick "filename*" and ignore "filename"» — quindi `filename` è il ripiego, non il nome.
   * ⛔ E il ripiego NON deve contenere sequenze percent: MDN avverte che i browser le trattano
   *   in modo incoerente (Firefox e Chrome le decodificano, Safari no). Qui i caratteri fuori
   *   ASCII diventano `_`, non `%C3%A8`.
   */
  const ascii = /filename="([^"]+)"/.exec(disposizione)[1];
  const utf8 = /filename\*=UTF-8''(\S+)$/.exec(disposizione)[1];
  assert.doesNotMatch(ascii, /%/, '⛔ niente percent nel ripiego ASCII');
  assert.doesNotMatch(ascii, /[^\x20-\x7E]/, 'il ripiego è ASCII per davvero');
  assert.match(ascii, /\.md$/);
  assert.match(decodeURIComponent(utf8), /Perché/, 'e la forma UTF-8 tiene gli accenti');
  assert.doesNotMatch(decodeURIComponent(utf8), /[/\\]/, '⛔ e nessuna delle due contiene un separatore di percorso');
});

test('⛔⛔ VERSO CONTRARIO — una domanda che È un percorso non produce un nome che sia un percorso', () => {
  /*
   * RFC 6266: il destinatario deve «ignore or substitute names» con significato nel filesystem —
   * «..», «~», i nomi di dispositivo. `talosSafeFileStem` toglie `/ \ : " * ? < > |` ma il punto
   * non è un carattere vietato su nessun filesystem: `..` gli sopravvive. ⇒ la seconda difesa.
   */
  for (const domanda of ['..', '.', '../../etc/passwd', '   ..   ', '....', '', null, '/', '\\\\server\\share']) {
    const nome = nomeSicuroDiEsportazione(domanda, 'md');
    assert.doesNotMatch(nome, /[/\\]/, `${JSON.stringify(domanda)} → ${nome}`);
    assert.doesNotMatch(nome, /^\./, `${JSON.stringify(domanda)} → ${nome}`);
    assert.notEqual(nome, '..md');
    assert.match(nome, /\.md$/);
  }
  assert.equal(nomeSicuroDiEsportazione('..', 'md'), 'ricerca.md');
  assert.equal(nomeSicuroDiEsportazione('una domanda normale', 'fonti'), 'una domanda normale-fonti.md');
  // E un formato che non esiste non produce un nome: non c'è un ripiego silenzioso.
  assert.throws(() => nomeSicuroDiEsportazione('x', 'exe'), /unknown export format/);
});
