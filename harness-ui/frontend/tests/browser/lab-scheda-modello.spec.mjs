/**
 * lab-scheda-modello.spec.mjs — CORSIA 4 (18/09/2026): LA PAGINA DEL MODELLO.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * COSA PROVA, E PERCHE' COSI'
 *
 * Il soggetto e' `src/components/scheda-modello.js`: una pagina a schermo intero con tre schede
 * (la scheda Hugging Face col README, i FILE del modello con la verifica dell'impronta, la
 * COMPATIBILITA' con la memoria di questa macchina). Il disegno viene dal prototipo
 * `prototypes/calm-lab/src/model-page.mjs`; il linguaggio visivo e' quello che il prodotto ha gia'
 * (`talos-*`), riusando i componenti esistenti invece di riscriverne di nuovi: `creaSchede` per le
 * linguette, `renderizzaMarkdown` + `creaBloccoCodice` per la scheda, `gb`/`contestoK`/
 * `STATI_INSTALLATO`/`datiModelloInstallato` per i numeri e le parole, `datiMemoria` per la misura
 * della macchina.
 *
 * ⛔ PERCHE' NON SI CARICA IL PACCHETTO COSTRUITO: la pagina servita ha `script-src 'self'`
 *   (http-app.mjs) e quindi `addScriptTag` inline o `blob:` non passano. Si servono le SORGENTI su
 *   disco sotto un percorso finto (`/__c4/...`) e si fa `import()` dalla pagina — stesso metodo di
 *   `lab-montaggio-neutro.spec.mjs` (corsia 3) e `lab-guscio.spec.mjs` (corsia 2). La mappa e'
 *   generale: `/__c4/<resto>` serve `frontend/src/<resto>`, cosi' anche gli import relativi
 *   annidati si risolvono da soli. La chiusura misurata il 18/09/2026 e' di **18 moduli**, tutti
 *   dentro `frontend/src/` (nessuno la lascia — misurato con `closure-c4.mjs`, non dedotto).
 *
 * ⛔ LA LETTURA E' FINTA, E NON TOCCA NESSUN SERVER: `apiGet` e' un finto che risponde da fixture
 *   preparate dal test e REGISTRA ogni percorso chiesto. Cosi' si prova anche cio' che NON deve
 *   succedere (su un modello importato dal computer la rotta del repository non si chiama, e il
 *   test lo pretende con `toEqual([])`).
 *
 * ⛔ OGNI NUMERO DI QUESTO FILE E' STATO MISURATO, NON RICORDATO (18/09/2026, `node -e` sui
 *   formattatori veri): `gb` scrive **GB** (non GiB) e non mette i decimali quando non servono —
 *   `gb(34359738368)` e' `'32 GB'`, non `'32,0 GB'`; `contestoK(32768)` e' `'32k token'`. Le
 *   impronte sono di **64** caratteri e il troncamento mostra **8+8** — `'3f4b1c9d…9a2f5317'`.
 *
 * ⛔ COSA DIVENTA ROSSO (la prova deve poter essere rotta, non solo verde — e ogni riga qui sotto
 *   e' una riga che si puo' togliere dal componente per vederla diventare rossa):
 *  - si togliesse `senzaFrontMatter` ⇒ SCHEDA-01 rossa: `license:` e `base_model:` a schermo;
 *  - si togliesse `indiceDelReadme` ⇒ SCHEDA-01/03 rosse: le voci dell'indice senza bersaglio;
 *  - si passasse il `<pre>` nudo invece di `creaBloccoCodice` ⇒ SCHEDA-01 rossa (nessun
 *    `.code-block` e nessun pulsante «Copia» dentro il README);
 *  - si togliesse `confrontaFile` (o il confronto sull'`sha256`) ⇒ SCHEDA-04 rossa: due file con
 *    impronte diverse non si distinguono piu';
 *  - si copiasse l'impronta TRONCATA invece dell'intera ⇒ SCHEDA-04 rossa (19 caratteri invece di 64);
 *  - si togliesse la guardia `repo === REPO_IMPORTATO` ⇒ SCHEDA-05 rossa (la rotta del repository
 *    viene chiamata e la pagina promette una scheda che non esiste);
 *  - si togliesse il ramo `chat-only` ⇒ SCHEDA-06 rossa (un modello che regge la chat ma non
 *    l'agente finirebbe in «Non entra»);
 *  - si mettesse `<progress>` al posto di `<meter>` ⇒ SCHEDA-06 rossa;
 *  - si aggiungesse `aria-valuenow` al `<meter>` ⇒ SCHEDA-06 rossa (seconda fonte di verita');
 *  - si scambiassero RAM e disco (le due grandezze che il server chiama entrambe `availableBytes`)
 *    ⇒ SCHEDA-06 rossa: i due numeri sono diversi apposta — **32 GB** di RAM libera contro **50 GB**
 *    di spazio allocabile;
 *  - si togliesse il cancello `byte()` davanti a `gb` ⇒ SCHEDA-06 rossa: `gb(null)` e' `'0 GB'`,
 *    cioe' una cifra INVENTATA da un campo che il server non ha mandato (`Number(null) === 0`);
 *  - si disegnasse il `<meter>` anche quando il verdetto e' «Non verificato» ⇒ SCHEDA-06 rossa;
 *  - si togliesse il ramo d'errore dal modello inesistente ⇒ SCHEDA-07 rossa: al posto dell'errore
 *    comparirebbe «importato dal computer», cioe' una spiegazione inventata;
 *  - si togliesse `caricaRepo()` da `ricarica()` ⇒ SCHEDA-07 rossa: il README non torna;
 *  - si togliesse il «Riprova» dal ramo d'errore della scheda ⇒ SCHEDA-07 rossa;
 *  - si togliesse il `role=alert` dagli errori ⇒ SCHEDA-07 rossa;
 *  - si appendesse il badge della provenienza DOPO il valore invece che prima ⇒ SCHEDA-06 rossa: la
 *    colonna dei numeri si spezza (misurato: 0 px di scarto col valore per ultimo, ~630 px col badge
 *    appeso, 77 px raggruppandoli);
 *  - si appendesse il pulsante «Copia» come TERZO figlio della riga dell'impronta (invece di
 *    raggrupparlo con l'etichetta) ⇒ SCHEDA-04 rossa: il pulsante resta sospeso a meta' riga
 *    (misurato in foto: etichetta a x≈36, «Copia» a x≈730, valore a x≈1300);
 *  - si rimettesse la dimensione del file come etichetta (`Dimensione 4,4 GB` tutto dentro) ⇒
 *    SCHEDA-04 rossa: quel numero esce dalla cella di valore e nessun elenco lo vede piu';
 *  - si lasciasse il velo d'avvio a schermo durante le foto ⇒ SCHEDA-08 rossa (misurato: e' cosi' che
 *    e' uscita la prima foto, il logo TALOS su fondo vuoto — e il PESO del PNG non lo vedeva);
 *  - la cornice dipingesse `--talos-tema-fondo` invece di `--talos-background` ⇒ SCHEDA-08 rossa in
 *    chiaro (misurato: rgb(30,31,34) = 0,01 di luminanza, testo scuro su fondo scuro);
 *  - restasse un errore a runtime ⇒ SCHEDA-08 rossa (la console si legge).
 *
 * LIMITI DICHIARATI (misurati, non supposti):
 *  · il lettore Markdown condiviso NON rende immagini ne' collegamenti: la scheda di Hugging Face
 *    li mostra come testo. La prova lo REGISTRA (SCHEDA-03) invece di far finta: il giorno in cui
 *    il lettore li rendera', quel caso diventa rosso e chi lo cambia lo sapra'.
 *  · le foto (SCHEDA-08) sono la pagina montata dentro la cornice di una schermata vera
 *    (`div.talos-page`) sulla pagina servita, con i fogli veri: non e' la pagina dentro Impostazioni,
 *    che il montaggio lo fa l'orchestratore. La pagina NON porta padding ne' scorrimento propri: e'
 *    il contenitore a doverli dare.
 *
 * Fonti consultate il 18/09/2026: MDN + W3C APG «Meter Pattern» (`<meter>` per una grandezza dentro
 * un intervallo noto, `<progress>` per un compito; l'`aria-valuenow` ridichiarato su un `<meter>`
 * nativo e' la seconda fonte di verita' che le guide segnalano come errore piu' comune); guide di
 * accessibilita' sugli indici interni (`scroll-margin-top` sui bersagli e fuoco sul titolo di
 * destinazione); Dataverse #5210 / Firefox 1340265 / Spectrum `<sp-truncated>` per l'impronta
 * troncata a testa-e-coda col valore intero dietro il pulsante di copia.
 */
import { expect, test } from '@playwright/test';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const SRC = resolve(process.cwd(), 'src');
const FOTO = resolve(process.cwd(), 'artifacts', 'scheda-modello');
const COMPONENTE = resolve(SRC, 'components', 'scheda-modello.js');

/** Le 64 cifre di un'impronta vera, per provare che la copia non tronca niente. */
const IMPRONTA_A = '3f4b1c9d2a7e5086b1d4f0a39c8e7652140ab6cd93e5f2718b0c4d6e9a2f5317';
const IMPRONTA_B = 'aa11bb22cc33dd44ee55ff6600778899aabbccddeeff00112233445566778899';

/** Le risposte finte. `repo === 'local-upload'` e' un file importato dal computer. */
function manifest({ repo = 'bartowski/Qwen2.5-7B-Instruct-GGUF', revision = 'b1e2f3a4c5d6e7f80912', sha = true } = {}) {
  const file = { path: 'Qwen2.5-7B-Instruct-Q4_K_M.gguf', bytes: 4683073184, sha256: IMPRONTA_A };
  return {
    id: 'qwen2.5-7b-q4km',
    repo,
    revision,
    license: 'apache-2.0',
    path: 'C:\\modelli\\qwen2.5-7b-q4km',
    state: 'ready',
    bytes: 4683073184,
    files: [file],
    ...(sha ? { sha256: IMPRONTA_A } : {}),
  };
}

const README = `---
license: apache-2.0
base_model: Qwen/Qwen2.5-7B-Instruct
language:
  - en
---

# Qwen2.5 7B Instruct — GGUF

Questo repository contiene le quantizzazioni **GGUF** del modello, pronte per \`llama.cpp\`.

## Come si usa

Serve un runtime compatibile con lo scaffolding degli attrezzi.

\`\`\`bash
llama-server -m Qwen2.5-7B-Instruct-Q4_K_M.gguf -c 32768
\`\`\`

### Requisiti di memoria

| Contesto | RAM richiesta | Note |
| --- | --- | --- |
| 8k | 5,2 GiB | chat |
| 32k | 8,1 GiB | agente |

> Il contesto addestrato è 32768 token: oltre, la qualità cala.

## Licenza

Apache 2.0. Vedi ![licenza](https://example.invalid/licenza.png) e la [pagina del modello](https://huggingface.co/Qwen/Qwen2.5-7B-Instruct).
`;

const REPO = {
  repo: 'bartowski/Qwen2.5-7B-Instruct-GGUF',
  revision: 'b1e2f3a4c5d6e7f80912',
  license: 'apache-2.0',
  gated: false,
  pipelineTag: 'text-generation',
  downloads: 15234,
  likes: 87,
  readme: README,
  files: [
    { path: 'Qwen2.5-7B-Instruct-Q4_K_M.gguf', sizeBytes: 4683073184, sha256: IMPRONTA_A },
    { path: 'Qwen2.5-7B-Instruct-Q8_0.gguf', sizeBytes: 8096774912, sha256: IMPRONTA_B },
    { path: 'README.md', sizeBytes: 1024, sha256: IMPRONTA_B },
  ],
};

/**
 * Il verdetto di memoria. `availableBytes` della memoria e' la **RAM libera**
 * (`machine.memory.freeBytes`), quello dello spazio e' il **disco allocabile**
 * (`machine.storage.allocatableBytes`) — `local-runtime-probe.mjs:251-252`: due grandezze diverse
 * che il server chiama uguale, ed e' la ragione per cui qui i due numeri sono diversi apposta.
 *
 * `senza` TOGLIE le chiavi invece di metterle a `undefined`: una fixture non deve portare chiavi
 * che il server non manderebbe, altrimenti la prova non prova piu' niente.
 */
function fit({
  state = 'compatible', reason = 'fits', richiesti = 4831838208, liberi = 34359738368,
  spazioRichiesto = 5368709120, spazioLibero = 53687091200, efficace = 32768, servito = true,
  senza = [],
} = {}) {
  const payload = {
    modelId: 'qwen2.5-7b-q4km',
    profile: 'agent',
    state,
    reason,
    context: { requestedTokens: 65536, availableTokens: 65536 },
    storage: { requiredBytes: spazioRichiesto, availableBytes: spazioLibero },
    memory: { requiredBytes: richiesti, availableBytes: liberi },
    inspection: {
      format: 'gguf',
      storageBytes: { state: 'observed', value: 4683073184 },
      workingMemoryBytes: { state: 'observed', value: richiesti },
      context: {
        trainedTokens: { state: 'declared', value: 32768 },
        runtimeTokens: { state: 'observed', value: 32768 },
        effectiveTokens: { state: 'observed', value: efficace },
      },
      runtime: { reachable: true, servingThisModel: servito, servingModelId: servito ? 'qwen2.5-7b-q4km' : 'altro-modello' },
      template: { state: 'observed', value: 'chatml' },
      capabilities: {
        tools: { state: 'observed', value: state !== 'chat-only' },
        toolCalls: { state: 'observed', value: state !== 'chat-only' },
        systemRole: { state: 'observed', value: true },
      },
      backend: 'llama.cpp',
      build: 'b4567',
      observedAt: '2026-09-18T14:03:11.000Z',
    },
  };
  for (const chiave of senza) delete payload[chiave];
  return payload;
}

const CAPACITA = {
  schema: 'talos.model-lab.capacity/1',
  memory: { totalBytes: 68719476736, freeBytes: 34359738368 },
  storage: { availableBytes: 53687091200, reserveBytes: 10737418240, allocatableBytes: 42949672960 },
  platform: 'win32',
  arch: 'x64',
  measuredAt: '2026-09-18T14:00:00.000Z',
};

const RISPOSTE_BASE = {
  modelli: { dati: { items: [manifest()] } },
  fit: { dati: fit() },
  repo: { dati: REPO },
  capacita: { dati: CAPACITA },
};

/** Serve le sorgenti su disco sotto `/__c4/...`: `/__c4/components/x.js` → `frontend/src/components/x.js`. */
async function serviLeSorgenti(page) {
  await page.route('**/__c4/**', async (route) => {
    const resto = new URL(route.request().url()).pathname.replace(/^\/__c4\//, '');
    try {
      const corpo = await readFile(resolve(SRC, resto), 'utf8');
      await route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: corpo });
    } catch {
      await route.fulfill({ status: 404, contentType: 'text/plain; charset=utf-8', body: `manca src/${resto}` });
    }
  });
}

/** In pagina: la cornice, il banco, la lettura finta che registra i percorsi, e i lettori di misure. */
const AIUTI = () => {
  const esito = (fn) => {
    try { const v = fn(); return { esito: 'ok', valore: v === undefined ? null : v }; }
    catch (e) { return { esito: `${e && e.name ? e.name : 'Errore'}: ${e && e.message ? e.message : String(e)}`, valore: null }; }
  };
  const tela = () => {
    let t = document.getElementById('c4-tela');
    if (!t) {
      t = document.createElement('div');
      t.id = 'c4-tela';
      /*
       * ⛔ IL FONDO DELLA CORNICE E' `--talos-background`, NON `--talos-tema-fondo`. Misurato il
       *   18/09/2026: con `calm` in modo CHIARO le due variabili DIVERGONO — `--talos-tema-fondo`
       *   resta `#1e1f22` (e' il seme scritto a mano in `styles/temi.css:83`, e la formula chiara di
       *   `temi.css:121` esclude `calm` di proposito: «`calm` e' ESCLUSO: il suo chiaro sta in
       *   `index.css`» — `temi.css:205`), mentre `--talos-background` diventa `#ece9e2`
       *   (`index.css:129`) con il testo `#232427` (`index.css:130`).
       *   ⇒ Col fondo sbagliato la foto CHIARA usciva nero-su-nero: `chiaro-1440x900-card.png`
       *   mostrava testo scuro su fondo scuro, illeggibile. `--talos-background` e' la superficie
       *   che usa la app, quindi e' anche quella giusta per la cornice, e nei due modi da'
       *   `#1e1f22` (scuro) e `#ece9e2` (chiaro).
       */
      t.style.cssText = 'position:fixed; inset:0; z-index:99990; overflow:auto; background:var(--talos-background, #10141c)';
      const pagina = document.createElement('div');
      pagina.className = 'talos-page';
      pagina.dataset.c4Pagina = '';
      t.append(pagina);
      document.body.append(t);
    }
    return t.querySelector('[data-c4-pagina]');
  };
  const banco = () => {
    let b = document.getElementById('c4-banco');
    if (!b) { b = document.createElement('div'); b.id = 'c4-banco'; b.hidden = true; document.body.append(b); }
    return b;
  };
  const copiati = [];
  try {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { copiati.push(String(t)); } } });
  } catch { /* se non si puo' ridefinire, il caso della copia lo dira' */ }
  const tipo = (p) => (p === '/api/v1/local-models' ? 'modelli'
    : p.includes('/fit?') ? 'fit'
      : p.includes('/huggingface/repo') ? 'repo'
        : p.includes('/model-lab/capacity') ? 'capacita' : 'ignoto');
  const stato = { risposte: {}, chiamate: [] };
  const apiFinta = async (percorso) => {
    stato.chiamate.push({ percorso, tipo: tipo(percorso) });
    const r = stato.risposte[tipo(percorso)];
    if (!r) throw new Error(`nessuna risposta preparata per «${tipo(percorso)}»`);
    if (r.errore) throw new Error(r.errore);
    return r.dati;
  };
  window.__c4 = {
    esito, tela, banco, copiati, stato, apiFinta, moduli: {}, montaggi: [],
    prepara(risposte) { Object.assign(stato.risposte, risposte); },
    azzera() { stato.chiamate.length = 0; copiati.length = 0; },
    chiamateDi(t) { return stato.chiamate.filter((c) => c.tipo === t).map((c) => c.percorso); },
    /** Monta la pagina nella cornice VISIBILE (e' quella che finisce in foto). */
    monta(opzioni = {}) {
      const m = esito(() => window.__c4.moduli['scheda-modello'].montaSchedaModello(
        (() => { const c = document.createElement('div'); tela().append(c); return c; })(),
        { apiGet: apiFinta, ...opzioni },
      ));
      if (m.valore) window.__c4.montaggi.push(m.valore);
      return m;
    },
    /** Monta nel banco nascosto: per i casi che non vanno fotografati. */
    montaNelBanco(opzioni = {}) {
      const m = esito(() => window.__c4.moduli['scheda-modello'].montaSchedaModello(
        (() => { const c = document.createElement('div'); banco().append(c); return c; })(),
        { apiGet: apiFinta, ...opzioni },
      ));
      if (m.valore) window.__c4.montaggi.push(m.valore);
      return m;
    },
  };
};

async function apriIlBanco(page) {
  await serviLeSorgenti(page);
  await page.addInitScript(AIUTI);
  await page.goto('/');
  /*
   * ⛔ IL VELO D'AVVIO VA ASPETTATO CHE SIA VIA, o la prima foto e' il velo — e l'ho visto solo
   *   guardando la foto: `scuro-1440x900-card.png` era il logo TALOS su fondo vuoto, con la pagina
   *   sotto che non si vedeva. Il velo e' `#talosAvvio` (`src/avvio.js:98`) e vive:
   *     · `MINIMO = 650` ms dopo che la sua animazione e' partita (`avvio.js:95` e `118`),
   *     · l'animazione parte su `requestIdleCallback` con `timeout: 400` (`avvio.js:121`),
   *     · poi `USCITA = 320` ms di uscita prima di staccarlo dal DOM (`avvio.js:97` e `113`),
   *     · con un tetto di `MASSIMO = 4000` ms (`avvio.js:96` e `128`).
   *   Contro il mio `waitForTimeout(220)` — MISURATO 220 < 650 — il primo scatto cade sempre dentro.
   *   ⛔ Non basta «aspettare di piu'»: si aspetta che NON ci sia, cosi' la guardia e' vera per
   *   costruzione. Il tetto del test sta sopra il tetto vero del velo (4000 + 320).
   *   ⭐ E la seconda foto lo diceva in un altro modo: `scuro-1440x900-files.png` aveva la pagina
   *   giusta con un logo TALOS IN TRASPARENZA dietro — era lo stesso velo a meta' uscita.
   *   ⛔ Il peso del PNG NON prende questo difetto: quella foto vuota pesa 250,3K, la piu' pesante
   *   delle dodici (un fondo sfumato non comprime). Una guardia sul peso non vede un velo.
   */
  await page.waitForSelector('#talosAvvio', { state: 'detached', timeout: 9000 });
  const esportate = await page.evaluate(async () => {
    window.__c4.moduli['scheda-modello'] = await import('/__c4/components/scheda-modello.js');
    return Object.keys(window.__c4.moduli['scheda-modello']).sort();
  });
  return esportate;
}

/** Aspetta che la lettura finta sia stata chiamata `quante` volte, poi lascia finire i disegni. */
async function risposte(page, quante) {
  await page.waitForFunction((n) => window.__c4.stato.chiamate.length >= n, quante, { timeout: 10000 });
  await page.waitForTimeout(150);
}

/**
 * Aspetta che nel banco la pagina abbia finito di leggere: il verdetto (`/fit`) E le righe della
 * macchina (`/model-lab/capacity`). Aspettare i soli conteggi di chiamata lascerebbe la lettura
 * della capacita' a meta' e le misure sarebbero prese su una card ancora vuota.
 */
async function attesaDelBanco(page) {
  await page.waitForFunction(() => {
    const r = document.getElementById('c4-banco')?.querySelector('[data-scheda-modello]');
    if (!r || !r.querySelector('[data-modello-verdetto]')) return false;
    return [...r.querySelectorAll('.talos-kv__k')].some((k) => k.textContent === 'RAM totale');
  }, null, { timeout: 10000 });
  await page.waitForTimeout(80);
}

/**
 * La luminanza relativa di un `rgb(r,g,b)` letto da `getComputedStyle`: 0 = nero, 1 = bianco.
 * Serve a dire in modo MISURABILE se la cornice e' chiara o scura, invece di fidarsi del nome del
 * tema o dell'attributo che ho appena scritto io (che e' appunto cio' che va verificato).
 * Formula WCAG 2.2 sulla luminanza relativa, canali linearizzati (W3C WAI, letto il 18/09/2026).
 * Ritorna -1 se la stringa non e' un colore: cosi' un `transparent` fa fallire la guardia invece di
 * passare per «scuro» — un fondo trasparente era proprio uno dei modi in cui la foto usciva sbagliata.
 */
function luminanza(rgb) {
  const c = String(rgb).match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [];
  if (c.length < 3) return -1;
  const lin = c.map((v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** Le misure che il test legge dalla pagina dopo un montaggio nella cornice visibile. */
const LEGGI = () => {
  // ⛔ Tutto si legge DENTRO la radice della pagina montata: la schermata servita ha gia' sue
  //   linguette (`role=tab`), e una lettura su `document` le conterebbe insieme alle mie.
  const radice = document.querySelector('[data-scheda-modello]');
  const pannello = radice?.querySelector('[data-modello-pannello]');
  const schede = [...(radice?.querySelectorAll('[role=tab]') || [])].map((t) => ({
    id: t.dataset.schedaId ?? null,
    testo: (t.textContent || '').trim(),
    selezionata: t.getAttribute('aria-selected'),
    tabindex: t.tabIndex,
    controlla: t.getAttribute('aria-controls'),
    etichettato: t.id || null,
  }));
  return {
    montata: !!radice,
    schede,
    pannello: pannello ? {
      quale: pannello.dataset.modelloPannello,
      ruolo: pannello.getAttribute('role'),
      etichettatoDa: pannello.getAttribute('aria-labelledby'),
      id: pannello.id,
      tabindex: pannello.tabIndex,
      testo: (pannello.textContent || '').trim(),
    } : null,
    verdetto: document.querySelector('[data-modello-verdetto]')?.dataset.modelloVerdetto ?? null,
    striscia: document.querySelector('[data-modello-striscia]')?.textContent ?? null,
    nome: document.querySelector('[data-modello-nome]')?.textContent ?? null,
    repo: document.querySelector('[data-modello-repo]')?.textContent ?? null,
    azioni: document.querySelector('[data-modello-azioni]')?.textContent ?? null,
    copie: document.querySelectorAll('[data-modello-copia]').length,
    // i collegamenti verso l'esterno della pagina, con come sono aperti
    fonti: [...(radice?.querySelectorAll('a[href^="http"]') || [])].map((a) => ({
      href: a.getAttribute('href'), testo: a.textContent.trim(), target: a.getAttribute('target'), rel: a.getAttribute('rel'),
    })),
  };
};

test.describe.configure({ mode: 'serial' });

test('SCHEDA-00 — presupposto: la sorgente si serve, si importa, e non inventa classi', async ({ page }) => {
  const esportate = await apriIlBanco(page);
  expect(esportate).toContain('montaSchedaModello');
  for (const nome of ['SCHEDE', 'ETICHETTE_SCHEDE', 'senzaFrontMatter', 'improntaBreve', 'confrontaFile', 'verdettoMemoria', 'indiceDelReadme', 'percorsoFit', 'percorsoRepo', 'testoFatto', 'REPO_IMPORTATO', 'CARATTERI_IMPRONTA']) {
    expect(esportate, `la pagina deve esportare ${nome}`).toContain(nome);
  }
  // ⛔ Il contratto che conta: la pagina si monta con una funzione sola, e non presume il contenitore.
  const sorgente = await readFile(COMPONENTE, 'utf8');
  expect(sorgente, 'la firma dichiarata dal brief').toContain('export function montaSchedaModello(contenitore');
  // ⛔ E non si porta dietro una quarta implementazione di linguette, un secondo Markdown o fogli propri.
  expect(sorgente, 'le linguette si prendono da schede.js').toContain("from './schede.js'");
  expect(sorgente, 'il Markdown si rende col lettore condiviso').toContain("from './markdown.js'");
  expect(sorgente, 'i recinti di codice sono quelli della chat').toContain("from './conversazione.js'");
  expect(sorgente, 'i numeri sono quelli della lista Installati').toContain("from './modelli-installati.js'");
  expect(sorgente, 'niente <style> iniettato').not.toMatch(/createElement\(['"]style['"]\)/);

  // ⛔ Le impronte delle prove devono avere la lunghezza vera, o la prova sul troncamento non prova.
  expect(IMPRONTA_A, 'un SHA-256 ha 64 cifre').toHaveLength(64);
  expect(IMPRONTA_B, 'un SHA-256 ha 64 cifre').toHaveLength(64);
  expect(IMPRONTA_A.slice(-8), 'la coda mostrata a schermo').toBe('9a2f5317');

  /*
   * ⛔ IL VOCABOLARIO: la pagina non porta un foglio suo, quindi ogni classe che nomina deve
   *   ESISTERE in uno dei fogli del prodotto. Si cercano i letterali del sorgente (stringhe e
   *   modelli, con le interpolazioni tolte) e si pretende il selettore nel CSS: una classe
   *   inventata, o tolta da un foglio, diventa rossa qui invece che invisibile in pagina.
   */
  const fogli = [];
  for (const cartella of ['styles', 'design-system']) {
    for (const nome of readdirSync(resolve(SRC, cartella))) {
      if (nome.endsWith('.css')) fogli.push(readFileSync(resolve(SRC, cartella, nome), 'utf8'));
    }
  }
  expect(fogli.length, 'i fogli del prodotto devono essere leggibili').toBeGreaterThan(10);
  const css = fogli.join('\n');
  // Solo i nomi di classe VERI: `talos-…`, `md-…`, `td-…`, `code-block…`, `is-…`, `i`/`i--sm`.
  const NOME = /^(?:(?:talos|md|td|code|is)-[a-z0-9]+(?:[-_]{1,2}[a-z0-9]+)*|i|i--sm)$/;
  const letterali = [...sorgente.matchAll(/'([^'\n]*)'/g)].map((m) => m[1])
    .concat([...sorgente.matchAll(/`([^`]*)`/g)].map((m) => String(m[1]).replace(/\$\{[^}]*\}/g, ' ')));
  const usate = new Set();
  for (const letterale of letterali) for (const t of letterale.split(/\s+/)) if (NOME.test(t)) usate.add(t);
  expect(usate.size, 'la pagina usa il vocabolario del prodotto').toBeGreaterThan(20);
  const inventate = [...usate].filter((c) => !new RegExp(`\\.${c}(?![a-zA-Z0-9_-])`).test(css));
  expect(inventate, '⛔ nessuna classe inventata: ogni nome esiste in un foglio del prodotto').toEqual([]);
});

test('SCHEDA-01 — le tre schede: ruoli, `aria-controls`, pannello unico, e la prima riga di README', async ({ page }) => {
  await apriIlBanco(page);
  await page.evaluate((risposte) => { window.__c4.prepara(risposte); window.__c4.monta({ id: 'qwen2.5-7b-q4km' }); }, RISPOSTE_BASE);
  await risposte(page, 4); // lista, fit, capacita', repository

  const letto = await page.evaluate(LEGGI);
  expect(letto.montata, 'la pagina deve essere nel documento').toBe(true);
  expect(letto.schede.map((s) => s.id)).toEqual(['card', 'files', 'compatibility']);
  expect(letto.schede.map((s) => s.testo)).toEqual(['Scheda Hugging Face', 'File del modello', 'Compatibilità']);
  expect(letto.schede.filter((s) => s.selezionata === 'true')).toHaveLength(1);
  expect(letto.schede.every((s) => s.tabindex === (s.selezionata === 'true' ? 0 : -1)), 'roving tabindex').toBe(true);
  expect(letto.pannello.ruolo, 'il pannello e\' un tabpanel').toBe('tabpanel');
  expect(letto.pannello.id).toBeTruthy();
  expect(letto.schede.every((s) => s.controlla === letto.pannello.id), 'ogni linguetta punta al pannello').toBe(true);
  const attiva = letto.schede.find((s) => s.selezionata === 'true');
  expect(letto.pannello.etichettatoDa, 'il pannello e\' descritto dalla linguetta attiva').toBe(attiva.etichettato);
  expect(letto.nome, 'il nome del modello in testata').toBe('qwen2.5-7b-q4km');
  expect(letto.repo, 'la riga del repository').toContain('bartowski/Qwen2.5-7B-Instruct-GGUF');
  expect(letto.repo, 'con la revisione accorciata').toContain('revisione b1e2f3a4c5d6');
  expect(letto.repo).toContain('apache-2.0');
  expect(letto.repo, 'e i due conti pubblici, scritti all\'italiana').toContain('15.234 download');
  expect(letto.repo).toContain('87 like');
  // la striscia: quattro caselle, tutte con un dato vero
  expect(letto.striscia).toContain('Hugging Face');
  expect(letto.striscia, '⛔ le parole delle caselle sono quelle del prodotto, non due volte la stessa').toContain('File sul disco');
  expect(letto.striscia).toContain('GGUF · Q4_K_M');
  expect(letto.striscia, '⛔ i byte con `gb`, non con un secondo formattatore').toContain('4,4 GB');
  // il solo collegamento esterno: il repository, aperto in una scheda nuova e senza ritorno
  expect(letto.fonti).toHaveLength(1);
  expect(letto.fonti[0].href).toBe('https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF');
  expect(letto.fonti[0].target).toBe('_blank');
  expect(letto.fonti[0].rel).toContain('noopener');

  // la prima riga di README e' resa: la testata YAML NON si vede, il titolo si'
  const card = await page.evaluate(() => {
    const p = document.querySelector('[data-modello-card]');
    return {
      testo: (p?.textContent || ''),
      titoli: [...p.querySelectorAll('h1,h2,h3,h4')].map((h) => ({ tag: h.tagName, id: h.id || null, testo: h.textContent.trim() })),
      tabelle: p.querySelectorAll('.md-table').length,
      citazioni: p.querySelectorAll('.md-quote').length,
      blocchi: p.querySelectorAll('.code-block').length,
      copiaNelBlocco: [...p.querySelectorAll('.code-block')].every((b) => [...b.querySelectorAll('button')].some((x) => /copia/i.test(x.textContent))),
      indice: [...p.querySelectorAll('[data-modello-indice-voce]')].map((b) => b.dataset.modelloIndiceVoce),
      paddingDellaTesta: getComputedStyle(p.querySelector('div') || p).paddingTop,
    };
  });
  expect(card.testo, '⛔ la testata YAML non deve finire a schermo').not.toContain('base_model');
  expect(card.testo).not.toContain('license: apache-2.0');
  expect(card.testo).toContain('Questo repository contiene le quantizzazioni');
  expect(card.blocchi, 'il recinto di codice e\' quello condiviso, non un <pre> nudo').toBe(1);
  expect(card.copiaNelBlocco, 'e porta il pulsante «Copia»').toBe(true);
  expect(card.tabelle).toBe(1);
  expect(card.citazioni).toBe(1);
  expect(card.titoli.length).toBeGreaterThanOrEqual(4);
  // ⛔ L'indice sono i titoli VERI, e solo quelli: `h1` e' il titolo del documento e non ha ancora
  //    (l'`h1` non entra in `indiceDelReadme`, che lavora su `h2, h3, h4`).
  const conAncora = card.titoli.filter((t) => ['H2', 'H3', 'H4'].includes(t.tag));
  expect(conAncora.length).toBe(3);
  expect(conAncora.every((t) => t.id), 'ogni titolo dell\'indice ha la sua ancora').toBe(true);
  expect(card.indice, 'l\'indice elenca quei titoli, nello stesso ordine').toEqual(conAncora.map((t) => t.id));
  expect(card.paddingDellaTesta, '⛔ lo stile inline non e\' bloccato dalla CSP (altrimenti la pagina si stringe)').not.toBe('0px');
});

test('SCHEDA-02 — si cambia scheda: dal clic, dalla tastiera, e la rotta lo sa', async ({ page }) => {
  await apriIlBanco(page);
  await page.evaluate((risposte) => {
    window.__c4.prepara(risposte);
    window.__c4.scelte = [];
    window.__c4.monta({ id: 'qwen2.5-7b-q4km', onScheda: (s) => window.__c4.scelte.push(s) });
  }, RISPOSTE_BASE);
  await risposte(page, 4);
  expect(await page.evaluate(() => window.__c4.scelte), 'il montaggio non annuncia nessun cambio: la rotta lo ha gia\' detto').toEqual([]);

  await page.locator('#c4-tela [role=tab][data-scheda-id="files"]').click();
  await page.waitForTimeout(80);
  let letto = await page.evaluate(LEGGI);
  expect(letto.pannello.quale).toBe('files');
  expect(letto.pannello.testo).toContain('File del modello');
  expect(letto.schede.find((s) => s.selezionata === 'true').id).toBe('files');

  // dalla tastiera: la freccia destra sposta E SELEZIONA (attivazione automatica, APG)
  await page.locator('#c4-tela [role=tab][data-scheda-id="files"]').press('ArrowRight');
  await page.waitForTimeout(80);
  letto = await page.evaluate(LEGGI);
  expect(letto.pannello.quale, 'Freccia destra = scheda successiva').toBe('compatibility');
  await page.locator('#c4-tela [role=tab][data-scheda-id="compatibility"]').press('ArrowRight');
  await page.waitForTimeout(80);
  expect((await page.evaluate(LEGGI)).pannello.quale, 'e dall\'ultima si CICLA alla prima').toBe('card');
  await page.locator('#c4-tela [role=tab][data-scheda-id="card"]').press('End');
  await page.waitForTimeout(80);
  expect((await page.evaluate(LEGGI)).pannello.quale).toBe('compatibility');

  const scelte = await page.evaluate(() => window.__c4.scelte);
  expect(scelte, 'ogni cambio lo dichiara a chi monta la pagina (la rotta)').toEqual(['files', 'compatibility', 'card', 'compatibility']);
  // e il fuoco resta sulla linguetta: il pannello si ridisegna, non si perde il posto
  const fuoco = await page.evaluate(() => document.activeElement?.dataset?.schedaId ?? null);
  expect(fuoco, 'il fuoco non si perde nel ridisegno').toBe('compatibility');
});

test('SCHEDA-03 — l\'indice del README: ogni voce porta al suo titolo, col fuoco', async ({ page }) => {
  await apriIlBanco(page);
  await page.evaluate((risposte) => { window.__c4.prepara(risposte); window.__c4.monta({ id: 'qwen2.5-7b-q4km' }); }, RISPOSTE_BASE);
  await risposte(page, 4);

  const prima = await page.evaluate(() => [...document.querySelectorAll('[data-modello-indice-voce]')].map((b) => ({ id: b.dataset.modelloIndiceVoce, testo: b.textContent.trim(), esiste: !!document.getElementById(b.dataset.modelloIndiceVoce) })));
  expect(prima.length).toBeGreaterThanOrEqual(3);
  expect(prima.every((v) => v.esiste), 'ogni voce dell\'indice ha il suo bersaglio nel documento').toBe(true);
  expect(prima.map((v) => v.testo)).toContain('Come si usa');
  // ⛔ Due montaggi nella stessa schermata non si rubano l'ancora: il prefisso e' del montaggio.
  expect(new Set(prima.map((v) => v.id)).size, 'gli id sono unici').toBe(prima.length);

  const ultima = prima[prima.length - 1].id;
  await page.locator(`[data-modello-indice-voce="${ultima}"]`).click();
  await page.waitForTimeout(600); // lo scorrimento e' morbido quando il movimento e' acceso
  const dopo = await page.evaluate((id) => ({
    fuoco: document.activeElement?.id ?? null,
    bersaglio: document.getElementById(id)?.tabIndex ?? null,
    margine: document.getElementById(id)?.style?.scrollMarginTop ?? null,
    inVista: (() => { const r = document.getElementById(id)?.getBoundingClientRect(); return !!r && r.top >= -2 && r.top < window.innerHeight; })(),
  }), ultima);
  expect(dopo.fuoco, '⛔ il fuoco segue il salto: chi naviga da tastiera riparte da li\'').toBe(ultima);
  expect(dopo.bersaglio, 'il titolo e\' raggiungibile col fuoco').toBe(-1);
  expect(dopo.margine, 'l\'ancora lascia il respiro dal bordo').toBeTruthy();
  expect(dopo.inVista, 'e il titolo e\' davvero finito in vista').toBe(true);

  // ⛔ LIMITE DICHIARATO: il lettore condiviso non rende immagini ne' collegamenti.
  const limite = await page.evaluate(() => {
    const p = document.querySelector('[data-modello-card]');
    return { immagini: p.querySelectorAll('img').length, collegamenti: p.querySelectorAll('a').length, testo: p.textContent };
  });
  expect(limite.immagini, 'il lettore condiviso non rende immagini: la prova lo registra').toBe(0);
  expect(limite.collegamenti, 'ne\' i collegamenti').toBe(0);
  expect(limite.testo, 'il Markdown resta visibile come testo, non sparisce').toContain('![licenza]');
  expect(limite.testo, 'compreso l\'indirizzo, che almeno resta leggibile').toContain('huggingface.co/Qwen/Qwen2.5-7B-Instruct');
});

test('SCHEDA-04 — i file: il confronto delle impronte, il troncamento onesto, la copia INTERA', async ({ page }) => {
  await apriIlBanco(page);
  await page.evaluate((risposte) => { window.__c4.prepara(risposte); window.__c4.monta({ id: 'qwen2.5-7b-q4km', scheda: 'files' }); }, RISPOSTE_BASE);
  await risposte(page, 4);

  const file = await page.evaluate(() => [...document.querySelectorAll('[data-modello-file]')].map((f) => ({
    percorso: f.dataset.modelloFile,
    esito: f.querySelector('[data-modello-esito]')?.dataset.modelloEsito ?? null,
    etichettaEsito: f.querySelector('[data-modello-esito]')?.textContent ?? null,
    impronta: f.querySelector('[data-modello-impronta]')?.textContent ?? null,
    improntaIntera: f.querySelector('[data-modello-impronta]')?.title ?? null,
    /*
     * ⛔ La dimensione si legge dalla CELLA del valore, non dall'etichetta: era `.talos-label` con
     *   «Dimensione 4,4 GB» tutto dentro, cioe' l'unico numero della card fuori dalle celle — e
     *   l'unico che nessun elenco di valori vedeva. Ora e' una riga come le sue compagne, ed e'
     *   anche la ragione per cui si legge `data-modello-valore`: se tornasse un'etichetta, questa
     *   lettura torna `null` e l'assert qui sotto diventa ROSSO.
     */
    dimensione: f.querySelector('[data-modello-valore="dimensione"]')?.textContent ?? null,
    avviso: f.querySelector('[role=alert]')?.textContent ?? null,
    copie: f.querySelectorAll('[data-modello-copia]').length,
  })));
  expect(file).toHaveLength(1);
  expect(file[0].percorso).toBe('Qwen2.5-7B-Instruct-Q4_K_M.gguf');
  expect(file[0].dimensione, 'la dimensione del file, in GB, come CELLA di valore e non dentro l\'etichetta').toBe('4,4 GB');
  expect(file[0].esito, 'l\'impronta combacia col repository').toBe('coincide');
  expect(file[0].etichettaEsito).toContain('Coincide');
  expect(file[0].impronta, 'a schermo l\'impronta e\' accorciata a testa e coda').toBe('3f4b1c9d…9a2f5317');
  expect(file[0].improntaIntera, '⛔ e il valore INTERO resta nel title').toBe(IMPRONTA_A);
  expect(file[0].avviso).toBeNull();

  // i file del repository non scaricati si dichiarano, non si nascondono
  const extra = await page.evaluate(() => {
    const d = document.querySelector('[data-modello-solo-repo]');
    return d ? { righe: d.querySelectorAll('.talos-kv').length, sommario: d.querySelector('summary')?.textContent ?? null, testo: d.textContent } : null;
  });
  expect(extra, 'un modello scarica UNA quantizzazione: le altre si dichiarano').not.toBeNull();
  expect(extra.righe).toBe(2);
  expect(extra.sommario).toContain('2');
  expect(extra.testo, 'e la loro dimensione si dice, non si tace').toContain('7,5 GB');

  // la copia scrive il valore INTERO, non quello troncato
  await page.evaluate(() => window.__c4.azzera());
  await page.locator('[data-modello-file] [data-modello-copia]').first().click();
  await page.waitForTimeout(120);
  const copiato = await page.evaluate(() => window.__c4.copiati);
  expect(copiato).toEqual([IMPRONTA_A]);
  expect(copiato[0], '⛔ 64 caratteri, non 17').toHaveLength(64);

  // il file DIVERSO: si vede, e lo dice
  await page.evaluate((base) => {
    const storto = JSON.parse(JSON.stringify(base));
    storto.repo.dati.files[0].sha256 = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    window.__c4.stato.risposte.repo = { dati: storto.repo.dati };
    window.__c4.montaNelBanco({ id: 'qwen2.5-7b-q4km', scheda: 'files', modello: storto.modelli.dati.items[0] });
  }, RISPOSTE_BASE);
  await page.waitForFunction(() => document.getElementById('c4-banco').querySelector('[data-modello-file]'));
  const diverso = await page.evaluate(() => {
    const f = document.getElementById('c4-banco').querySelector('[data-modello-file]');
    return { esito: f?.querySelector('[data-modello-esito]')?.dataset.modelloEsito ?? null, avviso: f?.querySelector('[role=alert]')?.textContent ?? null };
  });
  expect(diverso.esito, '⛔ due impronte diverse non devono piu\' sembrare uguali').toBe('diverso');
  expect(diverso.avviso, 'e l\'avviso lo dice a chi ascolta').toContain('non coincidono');

  /*
   * ⛔ LA COLONNA DEI VALORI NELLA CARD DEL FILE — stessa malattia e stessa misura della guardia in
   *   SCHEDA-06: `.talos-kv` e' `justify-content:space-between` (`index.css:1563`), e il pulsante
   *   «Copia» appeso DOPO il valore lo spingeva a meta' riga. Misurato in foto il 18/09/2026: la
   *   riga dell'impronta finiva a x≈620 mentre «Revisione del repository» e «Impronta nel repository»
   *   — che mostrano lo STESSO numero — finivano a x≈937.
   *   ⛔ Si misura nella cornice VISIBILE: nel banco (che e' `hidden`) qualunque bordo e' zero e la
   *   guardia sarebbe verde per costruzione.
   */
  const colonnaFile = await page.evaluate(() => {
    const card = document.querySelector('#c4-tela [data-modello-file]');
    return [...card.querySelectorAll('.talos-kv')].map((r) => {
      const chiave = r.querySelector('.talos-kv__k');
      const pulsante = r.querySelector('[data-modello-copia]');
      return {
        etichetta: chiave.textContent,
        destra: Math.round(r.querySelector('.talos-kv__v').getBoundingClientRect().right),
        conPulsante: !!pulsante,
        // ⛔ E IL PULSANTE STA ATTACCATO ALL'ETICHETTA, non sospeso al centro della riga: con TRE
        //    figli il `space-between` di `.talos-kv` (`index.css:1563`) divide lo spazio libero e il
        //    «Copia» finisce a meta' riga — misurato in foto il 18/09/2026 nell'immagine chiara a
        //    1440: etichetta a x≈36, «Copia» a x≈730, valore a x≈1300, cioe' ~500 px di vuoto da una
        //    parte e ~570 dall'altra. Etichetta e pulsante in un `.talos-cluster` (`index.css:252`)
        //    riportano i figli a due: misurato dopo la cura, il distacco e' la spaziatura del
        //    cluster. La soglia di 40 sta fra i due valori e non diventa rossa da sola.
        distaccoPulsante: pulsante
          ? Math.round(pulsante.getBoundingClientRect().left - chiave.getBoundingClientRect().right)
          : null,
      };
    });
  });
  expect(colonnaFile.length, 'le righe della card del file').toBeGreaterThanOrEqual(4);
  expect(colonnaFile.some((r) => r.conPulsante), 'l\'impronta porta il pulsante, o la guardia non prova niente').toBe(true);
  expect(colonnaFile.some((r) => !r.conPulsante), 'e le altre no: e\' il confronto fra le due che ha senso').toBe(true);
  const conPulsante = colonnaFile.filter((r) => r.conPulsante);
  for (const r of conPulsante) {
    expect(r.distaccoPulsante,
      `il pulsante «Copia» di «${r.etichetta}» non sta attaccato alla sua etichetta: ${r.distaccoPulsante} px`).toBeLessThan(40);
  }
  const destreFile = colonnaFile.map((r) => r.destra);
  expect(Math.max(...destreFile) - Math.min(...destreFile),
    `la colonna dei valori della card del file si spezza (${JSON.stringify(colonnaFile)})`).toBeLessThan(5);
});

test('SCHEDA-05 — importato dal computer: non si inventa una scheda, e la rotta del repository NON si chiama', async ({ page }) => {
  await apriIlBanco(page);
  const locale = manifest({ repo: 'local-upload', revision: 'a1b2c3d4e5f6a7b8c9d0' });
  await page.evaluate(({ risposte, uno }) => {
    window.__c4.prepara(risposte);
    window.__c4.stato.risposte.modelli = { dati: { items: [uno] } };
    window.__c4.monta({ id: 'qwen2.5-7b-q4km' });
  }, { risposte: RISPOSTE_BASE, uno: locale });
  await risposte(page, 3);

  const chiamate = await page.evaluate(() => window.__c4.chiamateDi('repo'));
  expect(chiamate, '⛔ su un modello importato non c\'e\' nessun repository da leggere').toEqual([]);
  const letto = await page.evaluate(LEGGI);
  const card = await page.evaluate(() => document.querySelector('[data-modello-card]')?.textContent ?? '');
  expect(card).toContain('non ha una scheda Hugging Face');
  expect(letto.repo).toContain('Importato dal computer');
  expect(letto.repo).not.toContain('revisione a1b2c3d4e5f6');
  expect(letto.azioni, 'niente pulsanti inventati verso un repository che non c\'e\'').not.toContain('Hugging Face');
  expect(letto.azioni).not.toContain('Copia link');
  expect(letto.striscia).toContain('Importato dal computer');
  expect(letto.fonti, 'e nessun collegamento verso l\'esterno').toEqual([]);

  // e i FILE restano quelli veri, con l'esito dichiarato: non confrontabile
  await page.evaluate(() => window.__c4.montaggi[0].vaiA('files'));
  await page.waitForTimeout(150);
  const files = await page.evaluate(() => ({
    esito: document.querySelector('[data-modello-file] [data-modello-esito]')?.dataset.modelloEsito ?? null,
    etichetta: document.querySelector('[data-modello-file] [data-modello-esito]')?.textContent ?? null,
    nota: document.querySelector('[data-modello-files]')?.textContent ?? '',
  }));
  expect(files.esito, 'senza repository il confronto NON e\' «coincide»').toBe('solo-locale');
  expect(files.etichetta).toContain('Il repository non lo elenca');
  expect(files.nota).toContain('importato dal computer');
});

test('SCHEDA-06 — il verdetto di memoria: i nove casi, i due numeri diversi, e `<meter>` fatto bene', async ({ page }) => {
  await apriIlBanco(page);
  /*
   * ⛔ Le fixture dei casi si costruiscono QUI, in Node, con lo stesso `fit()` di sopra: costruirle
   *   dentro la pagina con un `Object.assign` in superficie non entrerebbe nei campi annidati
   *   (`inspection.context.effectiveTokens`), e il caso «contesto» misurerebbe il numero sbagliato.
   */
  const casi = [
    ['entra', {}, 'Entra'],
    ['stretto', { richiesti: 32000000000 }, 'Entra stretto'],
    ['solo-chat', { state: 'chat-only', reason: 'template' }, 'Entra solo senza l’agente'],
    ['solo-chat-contesto', { state: 'chat-only', reason: 'context', efficace: 8192 }, 'Entra solo senza l’agente'],
    ['non-entra-memoria', { state: 'blocked', reason: 'memory', richiesti: 60000000000 }, 'Non entra'],
    ['non-entra-spazio', { state: 'blocked', reason: 'storage', spazioRichiesto: 90000000000 }, 'Non entra'],
    ['non-entra-contesto', { state: 'blocked', reason: 'context', efficace: 8192 }, 'Non entra'],
    // ⛔ «Non verificato» senza numeri: e' la forma che il server manda quando non ha misurato.
    ['ignoto', { state: 'unknown', reason: 'measurement', senza: ['memory', 'storage'] }, 'Non verificato'],
    // ⛔ E «Non verificato» COI numeri: la macchina e' stata misurata, il modello no.
    ['ignoto-coi-numeri', { state: 'unknown', reason: 'capabilities' }, 'Non verificato'],
  ];
  const rapporti = [];
  for (const [nome, opzioni, atteso] of casi) {
    await page.evaluate(({ risposte, uno, opzioni }) => {
      for (const vecchio of document.getElementById('c4-banco')?.querySelectorAll('[data-scheda-modello]') ?? []) vecchio.remove();
      window.__c4.stato.risposte = {
        modelli: { dati: { items: [uno] } },
        fit: { dati: risposte.fit.dati },
        repo: risposte.repo,
        capacita: risposte.capacita,
      };
      window.__c4.montaNelBanco({ id: 'qwen2.5-7b-q4km', modello: uno, scheda: 'compatibility' });
    }, { risposte: { ...RISPOSTE_BASE, fit: { dati: fit(opzioni) } }, uno: manifest(), opzioni });
    await attesaDelBanco(page);
    const letto = await page.evaluate(() => {
      const radice = document.getElementById('c4-banco').querySelector('[data-scheda-modello]');
      const meter = radice.querySelector('meter[data-modello-meter]');
      const kv = {};
      for (const r of radice.querySelectorAll('.talos-kv')) kv[r.querySelector('.talos-kv__k').textContent] = r.querySelector('.talos-kv__v').textContent;
      return {
        // ⛔ I valori per esteso, come lista: cercare «0 GB» DENTRO il testo della card sarebbe un
        //    falso positivo — «50 GB» contiene «0 GB». La cifra inventata si cerca per UGUAGLIANZA.
        valori: [...radice.querySelectorAll('.talos-kv__v')].map((v) => v.textContent),
        verdetto: radice.querySelector('[data-modello-verdetto]')?.dataset.modelloVerdetto ?? null,
        etichetta: radice.querySelector('[data-modello-verdetto]')?.textContent ?? null,
        dettaglio: radice.textContent,
        // ⛔ Si leggono le PROPRIETA' IDL, non gli attributi: sono la fonte di verita' del
        //    `<meter>`, e un attributo assente non distingue «non dichiarato» da «zero».
        meter: meter ? {
          tag: meter.tagName,
          min: meter.min, max: meter.max, low: meter.low, high: meter.high, optimum: meter.optimum,
          valore: meter.value,
          label: meter.getAttribute('aria-label'),
          valuenow: meter.hasAttribute('aria-valuenow'),
          attributi: { min: meter.getAttribute('min'), max: meter.getAttribute('max'), valore: meter.getAttribute('value') },
        } : null,
        kv,
      };
    });
    rapporti.push({ nome, atteso, ...letto });
  }
  for (const r of rapporti) expect(r.etichetta, `${r.nome}: la parola a schermo`).toBe(r.atteso);
  const per = Object.fromEntries(rapporti.map((r) => [r.nome, r]));
  expect(new Set(rapporti.map((r) => r.verdetto)).size, 'i casi coprono cinque verdetti diversi').toBe(5);

  /*
   * ⛔ LA COLONNA DEI NUMERI NON SI SPEZZA. Si misura l'OGGETTO (il bordo destro delle celle di
   *   valore), non l'intenzione: `.talos-kv` e' `justify-content:space-between` (`index.css:1563`),
   *   quindi con tre figli — etichetta, valore, badge della provenienza — il valore finisce a meta'
   *   riga. Misurato in foto il 18/09/2026 nella card «Contesto e capacita'»: «32k token» a x≈730
   *   contro «64k token» a x≈1360, nella stessa card.
   *   ⭐ E i tre numeri dello scarto, misurati uno per uno: **~630 px** col badge appeso dopo il
   *   valore, **77 px** raggruppando valore+badge (le righe con la provenienza si allineavano fra
   *   loro ma quella senza finiva 77 px piu' a destra), **0 px** col valore per ULTIMO figlio.
   *   La soglia di 5 sta fra 0 e 77: non diventa rossa da sola e prende la rottura.
   *   ⛔ Si monta nella cornice VISIBILE e non nel banco: il banco e' `hidden`, e un elemento dentro
   *   un `display:none` misura zero — la guardia sarebbe verde per costruzione.
   */
  await page.evaluate((risposte) => { window.__c4.prepara(risposte); window.__c4.monta({ id: 'qwen2.5-7b-q4km', scheda: 'compatibility' }); }, RISPOSTE_BASE);
  await page.waitForFunction(() => document.querySelector('#c4-tela [data-modello-compatibilita] .talos-kv__v'), null, { timeout: 10000 });
  const colonna = await page.evaluate(() => {
    const radice = document.querySelector('#c4-tela [data-scheda-modello]');
    return [...radice.querySelectorAll('.talos-kv')]
      .filter((r) => /Contesto|Template di chat|Attrezzi|Chiamate di attrezzo|Ruolo di sistema/.test(r.querySelector('.talos-kv__k')?.textContent ?? ''))
      .map((r) => ({
        etichetta: r.querySelector('.talos-kv__k').textContent,
        destra: Math.round(r.querySelector('.talos-kv__v').getBoundingClientRect().right),
        conBadge: !!r.querySelector('.talos-badge'),
      }));
  });
  expect(colonna.length, 'le righe della card «Contesto e capacita\'» si leggono').toBeGreaterThanOrEqual(6);
  expect(colonna.some((r) => r.conBadge), 'e almeno una porta la provenienza, o la guardia non prova niente').toBe(true);
  expect(colonna.some((r) => !r.conBadge), 'e almeno una no: e\' il confronto fra le due che ha senso').toBe(true);
  const destre = colonna.map((r) => r.destra);
  const scarto = Math.max(...destre) - Math.min(...destre);
  expect(scarto, `la colonna dei valori si spezza fra righe con e senza provenienza (${JSON.stringify(colonna)})`).toBeLessThan(5);

  // le ragioni, con le due cifre che le spiegano
  expect(per['solo-chat-contesto'].dettaglio, 'la ragione «contesto» dice le due cifre').toContain('8k token');
  expect(per['solo-chat-contesto'].dettaglio).toContain('64k token');
  expect(per['solo-chat'].dettaglio, 'e la ragione «modello» dice la sua').toContain('non dichiara il supporto agli attrezzi');
  expect(per['non-entra-memoria'].dettaglio).toContain('55,9 GB');
  expect(per['non-entra-memoria'].dettaglio).toContain('32 GB');
  expect(per['non-entra-spazio'].dettaglio).toContain('83,8 GB');
  expect(per['ignoto'].dettaglio, 'la ragione «misurazione» si dichiara').toContain('non ha potuto misurare');

  // la barra: c'e' dove i numeri la reggono, e NON c'e' altrove
  expect(per['stretto'].meter, 'la barra si disegna quando i numeri ci sono').not.toBeNull();
  expect(per['stretto'].meter.tag).toBe('METER');
  expect(per['stretto'].meter.min).toBe(0);
  expect(per['stretto'].meter.max).toBe(100);
  expect(per['stretto'].meter.low).toBe(75);
  expect(per['stretto'].meter.high).toBe(90);
  expect(per['stretto'].meter.optimum).toBe(0);
  expect(per['stretto'].meter.valore, '93 per cento richiesto sul libero').toBe(93);
  expect(per['entra'].meter.valore, '14 per cento').toBe(14);
  expect(per['stretto'].meter.label, 'l\'etichetta accessibile e\' obbligatoria').toContain('Memoria richiesta');
  expect(per['stretto'].meter.valuenow, '⛔ su un <meter> nativo non si ridichiara aria-valuenow').toBe(false);
  expect(per['ignoto'].meter, '⛔ niente barra accanto a «Non verificato», senza numeri').toBeNull();
  expect(per['ignoto-coi-numeri'].meter, '⛔ e nemmeno coi numeri: la barra non accompagna un verdetto che non la usa').toBeNull();

  // ⛔ Le due grandezze che il server chiama uguale: 32 GB di RAM libera contro 50 GB di disco.
  expect(per['entra'].kv['Memoria richiesta']).toBe('4,5 GB');
  expect(per['entra'].kv['RAM libera']).toBe('32 GB');
  expect(per['entra'].kv['Spazio richiesto sul disco']).toBe('5 GB');
  expect(per['entra'].kv['Spazio allocabile sul disco']).toBe('50 GB');
  expect(per['entra'].kv['RAM libera']).not.toBe(per['entra'].kv['Spazio allocabile sul disco']);
  expect(per['entra'].dettaglio, 'e la pagina lo dice: RAM e disco non sono la stessa grandezza').toContain('Non sono la stessa grandezza');
  // ⛔ Senza i due numeri si dice «—»: `gb(null)` direbbe «0 GB», cioe' una cifra inventata.
  expect(per['ignoto'].kv['Memoria richiesta'], '⛔ un numero che non c\'e\' non diventa uno zero').toBe('—');
  expect(per['ignoto'].kv['RAM libera']).toBe('—');
  expect(per['ignoto'].kv['Spazio allocabile sul disco']).toBe('—');
  expect(per['ignoto'].valori, '⛔ un numero che non c\'è non diventa uno zero: `gb(null)` direbbe «0 GB»').not.toContain('0 GB');

  // i fatti osservati dal runtime, con la loro provenienza
  expect(per['entra'].kv['Contesto efficace'], 'i token si scrivono come li scrive la lista Installati').toBe('32k token');
  expect(per['entra'].kv['Contesto richiesto dalla verifica']).toBe('64k token');
  expect(per['entra'].kv['Attrezzi']).toBe('Sì');
  expect(per['ignoto-coi-numeri'].kv['Modello servito dal runtime']).toBe('qwen2.5-7b-q4km');
  expect(per['entra'].dettaglio, 'la provenienza dei fatti si dichiara').toContain('osservato');
  expect(per['entra'].dettaglio, 'e quella dei dichiarati pure').toContain('dichiarato');
  // i fatti NON osservati restano «Sconosciuto», non diventano «No» (P-13)
  expect(per['entra'].kv['Template di chat']).toBe('chatml');
});

test('SCHEDA-07 — regge il vuoto, l\'errore e i dati storti — e li DICHIARA', async ({ page }) => {
  await apriIlBanco(page);
  const misure = await page.evaluate(async (base) => {
    // il banco nasce al PRIMO montaggio: si cerca ogni volta, non una volta sola
    const banco = () => document.getElementById('c4-banco');
    const pulisci = () => { for (const n of (banco()?.querySelectorAll('[data-scheda-modello]') ?? [])) n.remove(); };
    const leggi = () => {
      const r = banco()?.querySelector('[data-scheda-modello]');
      return r ? {
        avvisi: [...r.querySelectorAll('[role=alert]')].map((n) => n.textContent),
        testo: r.textContent,
        // ⛔ I valori per esteso come lista: «0 GB» dentro il testo sarebbe un falso positivo,
        //    perché «50 GB» lo contiene. La cifra inventata si cerca per UGUAGLIANZA.
        valori: [...r.querySelectorAll('.talos-kv__v')].map((n) => n.textContent),
        ricarica: !!r.querySelector('[data-modello-ricarica]'),
        copie: r.querySelectorAll('[data-modello-copia]').length,
      } : null;
    };
    const fuori = {};
    // (1) il modello non esiste fra gli installati: si dice QUELLO, non una spiegazione inventata
    pulisci();
    window.__c4.stato.risposte = { modelli: { dati: { items: [] } }, fit: base.fit, repo: base.repo, capacita: base.capacita };
    fuori.modelloIgnoto = window.__c4.esito(() => window.__c4.montaNelBanco({ id: 'non-esiste' })).esito;
    await new Promise((r) => setTimeout(r, 300));
    fuori.modelloIgnotoLetto = leggi();

    // (2) tutto rosso: le quattro letture falliscono
    pulisci();
    window.__c4.stato.risposte = { modelli: { errore: 'Il server non risponde' }, fit: { errore: 'Verifica non riuscita' }, repo: { errore: 'Repository non raggiungibile' }, capacita: { errore: 'Misura non disponibile' } };
    fuori.tuttoRotto = window.__c4.esito(() => window.__c4.montaNelBanco({ id: 'qwen2.5-7b-q4km', scheda: 'compatibility' })).esito;
    await new Promise((r) => setTimeout(r, 300));
    fuori.tuttoRottoLetto = leggi();
    // il «Riprova» richiede davvero: la lista (il modello non era stato letto), il verdetto, la macchina
    window.__c4.azzera();
    banco()?.querySelector('[data-modello-ricarica]')?.click();
    await new Promise((r) => setTimeout(r, 300));
    fuori.chiamateDelRiprova = window.__c4.chiamateDi('modelli').length + window.__c4.chiamateDi('fit').length + window.__c4.chiamateDi('capacita').length;
    fuori.chiamateRepoDelRiprova = window.__c4.chiamateDi('repo').length;

    // (3) dati storti: numeri che mancano, repository senza elenco file, impronta assente
    pulisci();
    const storto = JSON.parse(JSON.stringify(base.modelli.dati.items[0]));
    delete storto.sha256;
    storto.files = [{ path: 'x.gguf' }];
    window.__c4.stato.risposte = { modelli: { dati: { items: [storto] } }, fit: { dati: { state: 'compatible', reason: 'fits' } }, repo: { dati: { revision: 'abc' } }, capacita: base.capacita };
    window.__c4.esito(() => window.__c4.montaNelBanco({ id: 'qwen2.5-7b-q4km', scheda: 'files', modello: storto }));
    await new Promise((r) => setTimeout(r, 300));
    fuori.stortiLetto = leggi();
    fuori.stortiMeter = !!banco()?.querySelector('meter[data-modello-meter]');

    /*
     * (4) SOLO il repository rotto, col modello bello: il «Riprova» della scheda lo RILEGGE, e
     *     l'errore se ne va col README al suo posto. E' la guardia del `ricarica()`: senza la
     *     seconda lettura del repository, la scheda resterebbe nell'errore per sempre.
     */
    pulisci();
    window.__c4.stato.risposte = { modelli: base.modelli, fit: base.fit, capacita: base.capacita, repo: { errore: 'Repository non raggiungibile' } };
    window.__c4.esito(() => window.__c4.montaNelBanco({ id: 'qwen2.5-7b-q4km', modello: base.modelli.dati.items[0] }));
    await new Promise((r) => setTimeout(r, 300));
    fuori.repoRottoLetto = leggi();
    window.__c4.azzera();
    window.__c4.stato.risposte.repo = base.repo;
    banco()?.querySelector('[data-modello-ricarica]')?.click();
    await new Promise((r) => setTimeout(r, 400));
    fuori.chiamateRepoDopoIlRiprova = window.__c4.chiamateDi('repo');
    fuori.dopoIlRiprova = leggi();

    // (5) il contenitore mancante, la lettura mancante e l'id mancante: falliscono SUBITO, e lo dicono
    fuori.senzaContenitore = window.__c4.esito(() => window.__c4.moduli['scheda-modello'].montaSchedaModello(null, { apiGet: window.__c4.apiFinta, id: 'x' })).esito;
    fuori.senzaLettura = window.__c4.esito(() => window.__c4.moduli['scheda-modello'].montaSchedaModello(document.createElement('div'), { id: 'x' })).esito;
    fuori.senzaId = window.__c4.esito(() => window.__c4.moduli['scheda-modello'].montaSchedaModello(document.createElement('div'), { apiGet: window.__c4.apiFinta })).esito;
    return fuori;
  }, RISPOSTE_BASE);

  // (1) un modello che non c'e' non fa esplodere niente, e non racconta favole
  expect(misure.modelloIgnoto, 'un modello che non c\'e\' non fa esplodere niente').toBe('ok');
  expect(misure.modelloIgnotoLetto.testo).toContain('non è fra quelli installati');
  expect(misure.modelloIgnotoLetto.testo, '⛔ e NON la spiegazione dell\'importazione, che qui sarebbe inventata').not.toContain('Questo modello non ha una scheda Hugging Face');
  expect(misure.modelloIgnotoLetto.avvisi.length, 'l\'errore si annuncia').toBeGreaterThanOrEqual(1);

  // (2) quattro letture rosse, nessuna esplosione, e ognuna si dichiara
  expect(misure.tuttoRotto, 'quattro letture rosse, nessuna esplosione').toBe('ok');
  expect(misure.tuttoRottoLetto.avvisi.length, '⛔ ogni errore si annuncia con role=alert').toBeGreaterThanOrEqual(2);
  // ⛔ Le parole sono quelle scritte dal componente (`La verifica non è riuscita: …`), non una
  //    parafrasi: la prova le ha misurate a schermo.
  expect(misure.tuttoRottoLetto.avvisi.join(' ')).toContain('La verifica non è riuscita');
  expect(misure.tuttoRottoLetto.avvisi.join(' ')).toContain('Capacità non misurata');
  expect(misure.tuttoRottoLetto.avvisi.join(' ')).toContain('Il server non risponde');
  expect(misure.tuttoRottoLetto.ricarica, 'e offre di riprovare').toBe(true);
  expect(misure.chiamateDelRiprova, '«Riprova» richiede davvero: lista + verdetto + macchina').toBe(3);
  expect(misure.chiamateRepoDelRiprova, 'e senza modello non c\'e\' nessun repository da chiedere').toBe(0);

  // (3) coi numeri mancanti si dice «—», e la barra non si disegna
  expect(misure.stortiLetto.testo, 'coi numeri mancanti si dice «—», non si inventa').toContain('—');
  expect(misure.stortiLetto.valori, '⛔ e nessun numero mancante diventa uno zero').not.toContain('0 GB');
  expect(misure.stortiMeter, 'senza i due numeri la barra non si disegna').toBe(false);

  // (4) il «Riprova» rilegge il repository, e la scheda si riprende
  expect(misure.repoRottoLetto.avvisi.join(' ')).toContain('La scheda non è stata letta');
  expect(misure.repoRottoLetto.ricarica, 'la scheda che non si e\' letta offre di riprovare').toBe(true);
  expect(misure.chiamateRepoDopoIlRiprova, '⛔ il «Riprova» rilegge il repository').toHaveLength(1);
  expect(misure.dopoIlRiprova.avvisi, 'e l\'errore se ne va').toEqual([]);
  expect(misure.dopoIlRiprova.testo, 'col README al suo posto').toContain('Questo repository contiene le quantizzazioni');

  // (5) i contratti della firma
  expect(misure.senzaContenitore).toContain('contenitore');
  expect(misure.senzaLettura).toContain('apiGet');
  expect(misure.senzaId).toContain('id');
});

test('SCHEDA-08 — le foto: i due temi, le due larghezze, e zero errori in console', async ({ page }) => {
  mkdirSync(FOTO, { recursive: true });
  const errori = [];
  page.on('console', (m) => { if (m.type() === 'error') errori.push(m.text()); });
  page.on('pageerror', (e) => errori.push(String(e)));

  await apriIlBanco(page);
  await page.evaluate((risposte) => { window.__c4.prepara(risposte); window.__c4.monta({ id: 'qwen2.5-7b-q4km' }); }, RISPOSTE_BASE);
  await risposte(page, 4);

  const combinazioni = [
    ['scuro-1440x900', { tema: 'calm', larghezza: 1440, altezza: 900 }],
    ['chiaro-1440x900', { tema: 'calm', chiaro: true, larghezza: 1440, altezza: 900 }],
    ['scuro-1024x800', { tema: 'calm', larghezza: 1024, altezza: 800 }],
    ['chiaro-1024x800', { tema: 'calm', chiaro: true, larghezza: 1024, altezza: 800 }],
  ];
  const misure = [];
  const formaDiOgniScheda = [];
  for (const [nome, c] of combinazioni) {
    await page.setViewportSize({ width: c.larghezza, height: c.altezza });
    const temaApplicato = await page.evaluate((c) => {
      document.documentElement.setAttribute('data-talos-theme', c.tema);
      if (c.chiaro) document.documentElement.setAttribute('data-theme', 'light');
      else document.documentElement.removeAttribute('data-theme');
      return { tema: document.documentElement.getAttribute('data-talos-theme'), modo: document.documentElement.getAttribute('data-theme') };
    }, c);
    expect(temaApplicato.tema, 'il tema non deve essere riscritto sotto le mani').toBe(c.tema);
    expect(temaApplicato.modo).toBe(c.chiaro ? 'light' : null);
    for (const quale of ['card', 'files', 'compatibility']) {
      await page.evaluate((q) => window.__c4.montaggi[0].vaiA(q), quale);
      await page.waitForTimeout(220);
      /*
       * ⛔ LA GUARDIA STA DOVE VIVE IL DIFETTO: subito PRIMA dello scatto. Il velo d'avvio copre
       *   tutto e ha la precedenza su qualunque cosa ci sia sotto, quindi una foto scattata col velo
       *   a schermo e' una foto di NIENTE — ed e' esattamente quello che e' successo al primo giro
       *   (`scuro-1440x900-card.png` = il logo TALOS su fondo vuoto). Un controllo fatto in fondo al
       *   ciclo arriverebbe quando il velo se n'e' gia' andato da solo, e sarebbe verde per
       *   costruzione: la prova va fatta NELLE CONDIZIONI IN CUI IL DIFETTO VIVE.
       */
      expect(await page.locator('#talosAvvio').count(), `${nome}-${quale}: si sta fotografando il velo d'avvio, non la pagina`).toBe(0);
      await page.screenshot({ path: resolve(FOTO, `${nome}-${quale}.png`) });
      /*
       * ⛔ La larghezza della prosa si misura NELLA SUA passata: dopo l'ultimo `vaiA` nella cornice
       *   c'e' la scheda «compatibilita'», e il README non e' piu' nel documento (misurato: 0).
       */
      if (quale === 'card') {
        const larghezzaProsa = await page.evaluate(() => document.querySelector('#c4-tela .td-prosa-rapporto')?.getBoundingClientRect().width ?? 0);
        formaDiOgniScheda.push({ nome, quale, larghezzaProsa });
        expect(larghezzaProsa, `${nome}: la scheda ha la larghezza della pagina, non una colonna stretta`).toBeGreaterThan(600);
      }
    }
    // una misura automatica che vale per tutti e tre: niente scorrimento orizzontale, testo non tagliato
    const forma = await page.evaluate(() => {
      const t = document.getElementById('c4-tela');
      const radice = t.querySelector('[data-scheda-modello]');
      const sfora = [...t.querySelectorAll('*')].filter((n) => n.scrollWidth > n.clientWidth + 1 && getComputedStyle(n).overflowX === 'visible').map((n) => `${n.tagName}.${n.className}`.slice(0, 60));
      return {
        scorrimentoOrizzontale: t.scrollWidth > t.clientWidth + 1,
        larghezzaRadice: radice.getBoundingClientRect().width,
        larghezzaTela: t.clientWidth,
        sfora: sfora.slice(0, 5),
        sfondo: getComputedStyle(t).backgroundColor,
        schedeVisibili: radice.querySelectorAll('[role=tab]').length,
      };
    });
    misure.push({ nome, ...forma });
    expect(forma.scorrimentoOrizzontale, `${nome}: la pagina non deve scorrere in orizzontale`).toBe(false);
    expect(forma.larghezzaRadice).toBeLessThanOrEqual(forma.larghezzaTela + 1);
    expect(forma.schedeVisibili).toBe(3);
    /*
     * ⛔ LA CORNICE DIPINGE LA SUPERFICIE DELLA APP, e questo si MISURA — non si deduce dal nome del
     *   tema. Con la variabile sbagliata (`--talos-tema-fondo`) la riga chiara diventa ROSSA:
     *   misurato il 18/09/2026, in chiaro la cornice dava `rgb(30,31,34)` = **0,01** di luminanza
     *   mentre il fondo vero della app e' `#ece9e2` = **0,82**. Le due soglie stanno a meta' strada
     *   fra quei due numeri, lontane da entrambi, cosi' non diventano rosse da sole.
     *   ⛔ E si controlla ANCHE che il velo d'avvio non sia tornato: un velo che copre tutto ha la
     *   precedenza su qualunque misura presa sotto di lui.
     */
    const lum = luminanza(forma.sfondo);
    if (c.chiaro) expect(lum, `${nome}: la cornice chiara non e' chiara (${forma.sfondo})`).toBeGreaterThan(0.6);
    else expect(lum, `${nome}: la cornice scura non e' scura (${forma.sfondo})`).toBeLessThan(0.3);
    expect(await page.locator('#talosAvvio').count(), `${nome}: il velo d'avvio e' ancora sopra la pagina`).toBe(0);
  }
  expect(errori, '⛔ nessun errore a runtime: build verde e suite verde non guardano il runtime').toEqual([]);
  // le foto devono avere sostanza: una pagina vuota pesa pochissimo. La soglia NON e' inventata:
  // misurate il 18/09/2026 dopo la cura del velo, le dodici foto stanno fra **89,1K** e **124,0K**
  // byte, quindi 40K separa una pagina viva da una vuota senza rischiare di diventare rossa da sola.
  // ⛔ E il peso da solo NON vede un velo: prima della cura la foto del velo pesava **250,3K**, la
  //   piu' pesante delle dodici (un fondo sfumato non comprime). Lo vede `#talosAvvio` a zero.
  for (const m of misure) {
    for (const quale of ['card', 'files', 'compatibility']) {
      const peso = (await readFile(resolve(FOTO, `${m.nome}-${quale}.png`))).length;
      expect(peso, `${m.nome}-${quale}.png deve avere contenuto`).toBeGreaterThan(40000);
    }
  }
});
