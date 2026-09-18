/**
 * lab-montaggio-neutro.spec.mjs — CORSIA 3 (18/09/2026): il travaso regge ENTRAMBE le direzioni.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * COSA PROVA, E PERCHE' COSI'
 *
 * Il travaso e' `montaX(originale, canonico)`: i figli di `canonico` passano in `originale`
 * (`replaceChildren`, che SPOSTA i nodi e non li clona — algoritmo DOM «replace all»), poi gli id
 * che il monolite ascolta tornano sui nodi nella loro nuova casa. Le due direzioni:
 *
 *   A — destinazione LEGACY (come oggi): `#modelLabXPanel` ← `#panel-x`. Il mockup scende in
 *       Impostazioni; sulla schermata i pannelli canonici restano VUOTI.
 *   B — destinazione CANONICA (come sara'): `#panel-x` ← `#modelLabXPanel`. Il laboratorio sale
 *       sulla schermata, e cio' che arriva sono i figli NUDI del pannello legacy.
 *
 * ⛔ Senza il ramo «o nell'una o nell'altra forma» e senza il timbro su ENTRAMBE le radici, la
 * direzione B produce: (1) il crollo n. 3 del 18/09 — `ensureModelLabControls` (app.js:3624)
 * `installedPanel.insertBefore(controls, $('#modelLabInstalledList'))` con il nodo di riferimento
 * ormai in un ALTRO albero ⇒ `NotFoundError`; (2) il doppio giro di controlli con gli STESSI id
 * (`querySelector('#x')` torna il primo in ordine d'albero ⇒ il monolite lega il nodo sbagliato in
 * silenzio: HTML, id «must be unique amongst all the IDs in the element's tree», WHATWG DOM #1361).
 *
 * COME ARRIVANO I MODULI VERI (CSP `script-src 'self'`, http-app.mjs:572 ⇒ niente `blob:`/inline):
 * si serve la SORGENTE su disco da `src/components/` sotto `**\/__c3/*.js` e si fa `import()` dalla
 * pagina (stesso protocollo/origine, gli import relativi `./modelli-installati.js` si risolvono da
 * soli sul percorso finto). E' lo stesso metodo di `lab-guscio.spec.mjs` (corsia 2). Le sorgenti
 * servite sono quelle su disco: la prova misura la SORGENTE, non il pacchetto costruito.
 *
 * ⛔ COSA DIVENTA ROSSO — la prova deve poter essere ROMPIBILE, non solo verde:
 *  - si togliesse in `montaMisuraMemoria` il ramo `#memoriaLibera` cercato in ENTRAMBE le radici
 *    ⇒ MONTAGGIO-03 direzione B1/B2 rossa (la card non trova la colonna);
 *  - si togliesse il secondo ramo di `montaHf` (`|| originale.querySelector('#modelLabHfDetail')`)
 *    ⇒ MONTAGGIO-01 caso hf/B rossa (il dettaglio resta con il testo VECCHIO e scoperto);
 *  - si togliesse `|| originale.querySelector('#modelLabDownloadsList')` in `montaCodaDownload`
 *    ⇒ MONTAGGIO-01 caso download/A rossa (la coda non viene ne' svuotata ne' marcata);
 *  - si togliesse il timbro da UNA delle due radici ⇒ MONTAGGIO-02 rossa (il crollo n. 3);
 *  - si togliesse un `if (!n) continue` / un `?.` ⇒ MONTAGGIO-06 rossa (le radici vuote e la card
 *    mutilata non devono esplodere);
 *  - restasse un ripiego `document.getElementById(...)` dentro i montaggi ⇒ MONTAGGIO-06 rossa:
 *    con due radici vuote il ripiego RUBA i nodi al documento VIVO (misurato sul contenuto vivo).
 *
 * LIMITI DICHIARATI: la pagina servita e' il pacchetto in `$TALOS_HARNESS_UI_PUBLIC_DIR`
 * (l'orchestratore costruisce); i moduli sotto prova sono le sorgenti su disco. La prova di
 * MONTAGGIO-02 TRASCRIVE la guardia di app.js: il testo della guardia e il nome del timbro sono
 * verificati a parte, in Node, contro `src/legacy/app.js` (se il monolite li rinomina, e' rossa).
 *
 * Fonti consultate il 18/09/2026: MDN `Element.replaceChildren` (algoritmo «replace all»: sposta i
 * nodi, non li clona); MDN `Node.insertBefore` (`NotFoundError` quando il nodo di riferimento non e'
 * figlio di quel genitore); WHATWG DOM issue #1361 (feb 2025, `getElementById` e gli id doppi).
 */
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const COMPONENTI = resolve(process.cwd(), 'src', 'components');
const SORGENTE_APP = resolve(process.cwd(), 'src', 'legacy', 'app.js');

/** I cinque moduli della corsia: si servono su disco, si importano nella pagina. */
const MODULI = ['misura-memoria.js', 'modelli-installati.js', 'hf-catalogo.js', 'download-coda.js', 'provider-card.js'];
/** I timbri che i montaggi scrivono (idempotenza + contratto con il monolite). */
const TIMBRI = ['installatiMontato', 'hfMontato', 'downloadMontato', 'memoryMontato', 'providerMontato'];
/** I timbri che il MONOLITE legge su questi pannelli — verificati in Node contro app.js. */
const TIMBRI_LETTI = ['installatiMontato', 'hfMontato', 'downloadMontato'];

async function serviLeSorgenti(page) {
  await page.route('**/__c3/*.js', async (route) => {
    const nome = new URL(route.request().url()).pathname.split('/').pop();
    try {
      const corpo = await readFile(resolve(COMPONENTI, nome), 'utf8');
      await route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: corpo });
    } catch {
      await route.fulfill({ status: 404, contentType: 'text/plain; charset=utf-8', body: `manca ${nome}` });
    }
  });
}

/** In pagina: il banco dei cloni + i lettori di misure. Niente scritture sul server, niente Impostazioni. */
const AIUTI = () => {
  const ids = (nodo) => { const l = [...nodo.querySelectorAll('[id]')].map((n) => n.id); if (nodo.id) l.unshift(nodo.id); return l.filter(Boolean); };
  /** Gli id che compaiono due volte dentro `radice`: la specifica HTML ne vuole UNO solo per albero. */
  const duplicatiIn = (radice) => {
    const nodi = [...radice.querySelectorAll('[id]')].map((n) => n.id);
    return [...new Set(nodi.filter((x, i) => nodi.indexOf(x) !== i))];
  };
  const banco = () => {
    let b = document.getElementById('c3-banco');
    if (!b) { b = document.createElement('div'); b.id = 'c3-banco'; b.hidden = true; document.body.append(b); }
    return b;
  };
  const svuota = () => { const b = banco(); while (b.firstChild) b.firstChild.remove(); return b; };
  const clona = (selettore) => {
    const n = document.querySelector(selettore);
    if (!n) throw new Error('il markup servito non ha ' + selettore);
    return n.cloneNode(true);
  };
  const esito = (fn) => {
    try { const v = fn(); return { esito: 'ok', valore: v === undefined ? null : v }; }
    catch (e) { return { esito: (e && e.name ? e.name : 'Errore') + ': ' + (e && e.message ? e.message : String(e)), valore: null }; }
  };
  /** Un caso di montaggio: cloni freschi nel banco, si chiama la funzione, si misurano i fatti. */
  const caso = (fn, destSel, sorgSel, opzioni = {}) => {
    const b = svuota();
    const dest = clona(destSel); const sorg = clona(sorgSel);
    b.append(dest, sorg);
    const r = { dest: destSel, sorg: sorgSel };
    r.esito = esito(() => fn(dest, sorg)).esito;
    // ⛔ `trim()`: `replaceChildren(...children)` sposta i FIGLI ELEMENTO, i nodi di testo
    //    (indentazione del markup) restano nella sorgente — e non sono contenuto.
    r.byteDest = dest.innerHTML.trim().length; r.byteSorg = sorg.innerHTML.trim().length;
    r.idDest = ids(dest); r.idSorg = ids(sorg);
    r.duplicati = duplicatiIn(b);
    r.timbri = {};
    for (const k of (opzioni.timbri || [])) r.timbri[k] = [dest.dataset[k] ?? null, sorg.dataset[k] ?? null];
    if (opzioni.extra) r.extra = esito(() => opzioni.extra(dest, sorg)).valore;
    return r;
  };
  const api = async (percorso, opzioni) => {
    const risposta = await fetch(percorso, { headers: { accept: 'application/json' }, ...opzioni });
    let corpo = null; try { corpo = await risposta.json(); } catch { corpo = null; }
    return { stato: risposta.status, ok: risposta.ok, corpo };
  };
  window.__c3 = { ids, duplicatiIn, banco, svuota, clona, esito, caso, api, moduli: {} };
};

async function apriIlBanco(page) {
  await serviLeSorgenti(page);
  await page.addInitScript(AIUTI);
  await page.goto('/');
  await page.waitForFunction(() => !!document.querySelector('#modelLabInstalledPanel'), null, { timeout: 20000 });
  const esportate = await page.evaluate(async (moduli) => {
    for (const nome of moduli) window.__c3.moduli[nome.replace(/\.js$/, '')] = await import('/__c3/' + nome);
    return Object.fromEntries(Object.entries(window.__c3.moduli).map(([k, v]) => [k, Object.keys(v).filter((x) => x.startsWith('monta') || x.startsWith('aggiorna') || x.startsWith('normalizza'))]));
  }, MODULI);
  return esportate;
}

/** Un «pannello legacy gia' potenziato»: gli id che `ensureModelLabControls` crea (app.js:3617-3631). */
const CONTROLLI_INSTALLATI = ['modelLabInstalledSearchControl', 'modelLabImportInput', 'modelLabImportButton', 'modelLabImportCancelButton', 'modelLabImportProgress', 'modelLabImportStatus'];
const CONTROLLI_HF = ['modelLabHfSortControl', 'modelLabHfAuthorControl', 'modelLabHfFiltersControl', 'modelLabHfNextButtonControl'];

/** Le due destinazioni possibili vivono in due schermate: i pannelli legacy in Impostazioni, i
 *  canonici in `#schermoModelLab`. Le due schermate sono entrambe nel documento all'avvio. */

test('MONTAGGIO-00 — presupposto: il markup servito ha le DUE forme, e i nomi dei timbri combaciano', async ({ page }) => {
  const esportate = await apriIlBanco(page);
  // le sorgenti si servono davvero e si importano
  expect(Object.keys(esportate)).toEqual(['misura-memoria', 'modelli-installati', 'hf-catalogo', 'download-coda', 'provider-card']);
  for (const [modulo, nomi] of Object.entries(esportate)) {
    expect(nomi, `${modulo} deve esportare i suoi montaggi`).toContainEqual(expect.stringMatching(/^monta/));
  }
  const fatti = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const ha = (s) => !!q(s);
    return {
      legacy: {
        pannelloInstallati: ha('#modelLabInstalledPanel'),
        listaInstallati: ha('#modelLabInstalledPanel #modelLabInstalledList'),
        controlliInstallati: ha('#modelLabInstalledSearchControl'),
        pannelloHf: ha('#modelLabHfPanel'),
        hfDettaglio: ha('#modelLabHfPanel #modelLabHfDetail'),
        pannelloDownload: ha('#modelLabDownloadsPanel'),
        listaDownload: ha('#modelLabDownloadsPanel #modelLabDownloadsList'),
        overview: ha('#modelLabOverviewPanel'),
        memoriaLibera: ha('#modelLabOverviewPanel #memoriaLibera'),
        rimisura: ha('#modelLabOverviewPanel #memoriaRimisura'),
        providerTestAll: ha('#modelLabProvidersPanel #providerTestAll'),
        providerRefresh: ha('#providerRefresh'),
        dentroImpostazioni: !!q('#modelLabInstalledPanel')?.closest('#schermoImpostazioni'),
        fuoriDalPonte: q('#talos-legacy .model-lab-panel') === null,
      },
      canonico: {
        schermo: ha('#schermoModelLab'),
        pannelloInstallati: ha('#panel-installati'),
        cercaInstallati: ha('#panel-installati #cercaInstallati'),
        listaInstallati: ha('#panel-installati #listaInstallati'),
        giaLegacy: ha('#panel-installati #modelLabInstalledList'),
        pannelloHf: ha('#panel-hf'),
        cercaHf: ha('#panel-hf #cercaHf'),
        pannelloDownload: ha('#panel-download'),
        coda: ha('#panel-download [data-c="DownloadQueue"]'),
        pannelloRuntime: ha('#panel-runtime'),
        cardMemoria: ha('#panel-runtime [data-c="MemoryMeter"][data-memory-meter]'),
        campoConId: ha('[data-memory-value="totale"][id]'),
        veloFornitori: ha('#veloFornitori .talos-dialog__body'),
      },
    };
  });
  // ogni voce del presupposto col suo verso: `true` = deve esserci, `false` = NON deve esserci
  const attesi = {
    legacy: {
      pannelloInstallati: true, listaInstallati: true, pannelloHf: true, hfDettaglio: true, pannelloDownload: true,
      listaDownload: true, overview: true, memoriaLibera: true, rimisura: true, providerTestAll: true,
      dentroImpostazioni: true, fuoriDalPonte: true,
      controlliInstallati: false, providerRefresh: false,
    },
    canonico: {
      schermo: true, pannelloInstallati: true, cercaInstallati: true, listaInstallati: true, pannelloHf: true,
      cercaHf: true, pannelloDownload: true, coda: true, pannelloRuntime: true, cardMemoria: true, veloFornitori: true,
      // ⛔ all'avvio i due alberi sono PULITI: la schermata non porta gli id del monolite e i campi
      //    della card non hanno ancora gli id che il travaso assegna (senza questo presupposto le
      //    due direzioni non si distinguerebbero, e la prova non proverebbe niente)
      giaLegacy: false, campoConId: false,
    },
  };
  for (const lato of ['legacy', 'canonico']) {
    for (const [k, v] of Object.entries(attesi[lato])) expect(fatti[lato][k], `${lato}.${k}`).toBe(v);
  }
  // il contratto sui timbri: il monolite LEGGE tre nomi, i miei montaggi li SCRIVONO
  const app = await readFile(SORGENTE_APP, 'utf8');
  for (const timbro of TIMBRI_LETTI) {
    expect(app, `app.js deve leggere dataset.${timbro} su questi pannelli`).toContain(`dataset.${timbro}`);
  }
  for (const modulo of MODULI) {
    const sorgente = await readFile(resolve(COMPONENTI, modulo), 'utf8');
    for (const timbro of TIMBRI) if (sorgente.includes(`dataset.${timbro}`)) expect(TIMBRI, `${modulo} timbra un nome ignoto`).toContain(timbro);
  }
  const timbriScritti = (await Promise.all(MODULI.map((m) => readFile(resolve(COMPONENTI, m), 'utf8')))).join('\n');
  for (const timbro of TIMBRI_LETTI) expect(timbriScritti, `nessun componente scrive dataset.${timbro}`).toContain(`dataset.${timbro}`);
});

test('MONTAGGIO-01 — i tre pannelli nei DUE versi: id giusti, sorgente vuota, zero id doppi', async ({ page }) => {
  await apriIlBanco(page);
  const rapporti = await page.evaluate((timbri) => {
    const { moduli, caso } = window.__c3;
    const inst = moduli['modelli-installati'].montaInstallati;
    const hf = moduli['hf-catalogo'].montaHf;
    const dl = moduli['download-coda'].montaCodaDownload;
    // ⛔ il timbro di ogni caso e' quello del SUO modulo: una lista fissa di tre marcatori
    //    pretenderebbe da `installati` anche i timbri di `hf` e della coda, che quel montaggio
    //    non scrive — e' la misura larga che accusa chi ha obbedito.
    const opz = (timbro, extra) => ({ timbri: [timbro], extra });
    return {
      'installati/A': caso(inst, '#modelLabInstalledPanel', '#panel-installati', opz('installatiMontato', (d) => ({ controlliIniettati: !!d.querySelector('#modelLabInstalledSearchControl'), listaVuota: d.querySelector('#modelLabInstalledList')?.children.length === 0 }))),
      'installati/B': caso(inst, '#panel-installati', '#modelLabInstalledPanel', opz('installatiMontato', (d) => ({ controlliIniettati: !!d.querySelector('#modelLabInstalledSearchControl'), listaVuota: d.querySelector('#modelLabInstalledList')?.children.length === 0 }))),
      'installati/B-potenziato': (() => {
        // la sorgente VERA della direzione B a runtime: il pannello legacy gia' potenziato dal monolite
        const b = window.__c3.svuota();
        const dest = window.__c3.clona('#panel-installati');
        const sorg = window.__c3.clona('#modelLabInstalledPanel');
        const controlli = document.createElement('div');
        controlli.dataset.modelLabEnhanced = 'installed';
        for (const id of ['modelLabInstalledSearchControl', 'modelLabImportInput', 'modelLabImportButton', 'modelLabImportCancelButton', 'modelLabImportProgress', 'modelLabImportStatus']) {
          const n = document.createElement(id.startsWith('modelLabImportProgress') ? 'progress' : id.endsWith('Input') ? 'input' : id.endsWith('Status') ? 'span' : 'button');
          n.id = id; controlli.append(n);
        }
        sorg.querySelector('#modelLabInstalledList').before(controlli);
        b.append(dest, sorg);
        const esito = window.__c3.esito(() => inst(dest, sorg)).esito;
        /* stesse misure degli altri casi: questo e' l'unico costruito a mano, e senza i campi
           il ciclo comune lo salterebbe invece di giudicarlo. */
        return {
          esito, idDest: window.__c3.ids(dest).filter((x) => x.startsWith('modelLab')),
          byteDest: dest.innerHTML.trim().length, byteSorg: sorg.innerHTML.trim().length,
          duplicati: window.__c3.duplicatiIn(b),
          timbri: { installatiMontato: [dest.dataset.installatiMontato ?? null, sorg.dataset.installatiMontato ?? null] },
          listaVuota: dest.querySelector('#modelLabInstalledList')?.children.length === 0,
        };
      })(),
      'hf/A': caso(hf, '#modelLabHfPanel', '#panel-hf', opz('hfMontato', (d) => ({ dettaglio: d.querySelector('#modelLabHfDetail') ? { nascosto: d.querySelector('#modelLabHfDetail').hidden, figli: d.querySelector('#modelLabHfDetail').children.length } : null, listaVuota: d.querySelector('#modelLabHfResults')?.children.length === 0, altriNascosto: d.querySelector('#modelLabHfNextButtonControl')?.hidden ?? null }))),
      'hf/B': caso(hf, '#panel-hf', '#modelLabHfPanel', opz('hfMontato', (d) => ({ dettaglio: d.querySelector('#modelLabHfDetail') ? { nascosto: d.querySelector('#modelLabHfDetail').hidden, figli: d.querySelector('#modelLabHfDetail').children.length } : null, listaVuota: d.querySelector('#modelLabHfResults')?.children.length === 0, altriNascosto: d.querySelector('#modelLabHfNextButtonControl')?.hidden ?? 'assente' }))),
      'download/A': caso(dl, '#modelLabDownloadsPanel', '#panel-download', opz('downloadMontato', (d) => ({ codaTrovata: !!d.querySelector('#modelLabDownloadsList'), codaVuota: d.querySelector('#modelLabDownloadsList')?.children.length === 0, codaDalMockup: !!d.querySelector('[data-c="DownloadQueue"]') }))),
      'download/B': caso(dl, '#panel-download', '#modelLabDownloadsPanel', opz('downloadMontato', (d) => ({ codaTrovata: !!d.querySelector('#modelLabDownloadsList'), codaVuota: d.querySelector('#modelLabDownloadsList')?.children.length === 0, codaDalMockup: !!d.querySelector('[data-c="DownloadQueue"]') }))),
      'download/B-potenziata': (() => {
        /* ⛔ La direzione B con la lista VERA del monolite dentro una riga vecchia. Senza la riga,
           «il montaggio svuota la coda» NON e' osservabile: la lista legacy all'avvio e' vuota, e
           il caso passerebbe anche togliendo il secondo ramo del riconoscimento (`|| #modelLabDownloadsList`,
           `download-coda.js`) — misurato: con il ramo tolto questo caso e' l'unico che diventa rosso.
           ⛔ E la riga la inietto io nel clone, non nel documento: il documento vivo non si tocca. */
        const b = window.__c3.svuota();
        const dest = window.__c3.clona('#panel-download');
        const sorg = window.__c3.clona('#modelLabDownloadsPanel');
        const lista = sorg.querySelector('#modelLabDownloadsList');
        const riga = document.createElement('article');
        riga.dataset.c = 'DownloadRow'; riga.dataset.downloadId = 'riga-vecchia'; riga.textContent = 'riga vecchia';
        lista.append(riga);
        b.append(dest, sorg);
        const esito = window.__c3.esito(() => dl(dest, sorg)).esito;
        return {
          esito, idDest: window.__c3.ids(dest),
          byteDest: dest.innerHTML.trim().length, byteSorg: sorg.innerHTML.trim().length,
          duplicati: window.__c3.duplicatiIn(b),
          timbri: { downloadMontato: [dest.dataset.downloadMontato ?? null, sorg.dataset.downloadMontato ?? null] },
          codaTrovata: !!dest.querySelector('#modelLabDownloadsList'),
          codaVuota: dest.querySelector('#modelLabDownloadsList')?.children.length === 0,
          rigaVecchia: !!dest.querySelector('[data-download-id="riga-vecchia"]'),
        };
      })(),
    };
  }, TIMBRI);

  // ── nessuno esplode, in nessuno dei due versi, e il timbro del modulo sta su ENTRAMBE le radici
  const TIMBRO_DEL_CASO = { 'installati/A': 'installatiMontato', 'installati/B': 'installatiMontato', 'installati/B-potenziato': 'installatiMontato', 'hf/A': 'hfMontato', 'hf/B': 'hfMontato', 'download/A': 'downloadMontato', 'download/B': 'downloadMontato', 'download/B-potenziata': 'downloadMontato' };
  for (const [nome, r] of Object.entries(rapporti)) {
    expect(r.esito, `${nome}: il montaggio non deve esplodere`).toBe('ok');
    expect(r.duplicati, `${nome}: nessun id puo' vivere in entrambi gli alberi`).toEqual([]);
    expect(r.byteSorg, `${nome}: la sorgente deve restare VUOTA (i figli si spostano, non si clonano)`).toBe(0);
    const timbro = TIMBRO_DEL_CASO[nome];
    expect(timbro, `${nome}: caso senza timbro dichiarato, la prova non lo copre`).toBeTruthy();
    expect(r.timbri[timbro], `${nome}: il timbro ${timbro} vuole 'true' su ENTRAMBE le radici (dest/sorg)`).toEqual(['true', 'true']);
    expect(r.byteDest, `${nome}: la destinazione non puo' restare vuota`).toBeGreaterThan(0);
  }

  // ── installati: nella direzione A gli id del monolite sono tutti li'; nella B arrivano quelli che c'erano
  for (const id of ['modelLabInstalledSearchControl', 'modelLabImportButton', 'modelLabImportInput', 'modelLabImportStatus', 'modelLabImportProgress', 'modelLabImportCancelButton', 'modelLabInstalledList', 'modelLabInstalledStateFilter']) {
    expect(rapporti['installati/A'].idDest, `installati/A deve avere #${id}`).toContain(id);
  }
  expect(rapporti['installati/A'].extra.listaVuota).toBe(true);
  expect(rapporti['installati/B'].idDest).toContain('modelLabInstalledList');
  expect(rapporti['installati/B'].idDest, 'B: niente id inventati che non avessero una sorgente').not.toContain('modelLabInstalledSearchControl');
  expect(rapporti['installati/B'].extra.listaVuota).toBe(true);
  /* ⛔ Qui c'era `listaDaMockup` (la lista dentro un `.talos-card`): misura SBAGLIATA, e l'ho
     tolta. Il pannello legacy vive dentro `#modelLabCard.talos-card` in Impostazioni, quindi in
     ENTRAMBI i versi `.closest('.talos-card')` trova quella card e la misura non distingue
     niente — un discriminante che risponde sempre allo stesso modo non e' una prova. A
     distinguere i due versi sono gli ID: in A il mockup arriva coi nomi canonici e vengono
     rinominati (`n.id !== prima → continue`, `modelli-installati.js`), in B porta gia' i suoi. */
  // il pannello legacy gia' potenziato: gli id del monolite SOPRAVVIVONO al travaso
  expect(rapporti['installati/B-potenziato'].esito).toBe('ok');
  for (const id of CONTROLLI_INSTALLATI) expect(rapporti['installati/B-potenziato'].idDest, `B-potenziato: il monolite perde #${id}`).toContain(id);
  expect(rapporti['installati/B-potenziato'].listaVuota).toBe(true);

  // ── hf: il dettaglio non deve restare con il contenuto VECCHIO ne' scoperto
  for (const lato of ['hf/A', 'hf/B']) {
    expect(rapporti[lato].idDest, `${lato}: #modelLabHfSearch`).toContain('modelLabHfSearch');
    expect(rapporti[lato].idDest, `${lato}: #modelLabHfResults`).toContain('modelLabHfResults');
    expect(rapporti[lato].idDest, `${lato}: #modelLabHfDetail`).toContain('modelLabHfDetail');
    expect(rapporti[lato].extra.listaVuota, `${lato}: la lista dei risultati va svuotata`).toBe(true);
    expect(rapporti[lato].extra.dettaglio, `${lato}: il dettaglio deve esserci`).not.toBeNull();
    expect(rapporti[lato].extra.dettaglio.nascosto, `${lato}: il dettaglio va nascosto`).toBe(true);
    expect(rapporti[lato].extra.dettaglio.figli, `${lato}: il dettaglio va svuotato del testo vecchio`).toBe(0);
  }
  for (const id of [...CONTROLLI_HF, 'modelLabHfSearch', 'modelLabHfResults', 'modelLabHfDetail']) {
    expect(rapporti['hf/A'].idDest, `hf/A deve avere #${id}`).toContain(id);
  }
  expect(rapporti['hf/A'].extra.altriNascosto).toBe(true);
  expect(rapporti['hf/B'].extra.altriNascosto, "hf/B: il pulsante non esiste, e non si inventa").toBe('assente');

  // ── download: la coda si riconosce in ENTRAMBE le forme, e si svuota sempre
  for (const lato of ['download/A', 'download/B']) {
    expect(rapporti[lato].idDest, `${lato}: #modelLabDownloadsList`).toContain('modelLabDownloadsList');
    expect(rapporti[lato].extra.codaTrovata, `${lato}: la coda deve esserci`).toBe(true);
    expect(rapporti[lato].extra.codaVuota, `${lato}: le righe vecchie devono sparire`).toBe(true);
  }
  expect(rapporti['download/A'].extra.codaDalMockup).toBe(true);
  expect(rapporti['download/B'].extra.codaDalMockup, "download/B: la coda e quella nuda del monolite").toBe(false);
  // ── e la coda VERA, con dentro una riga vecchia: il montaggio la svuota (prova che morde)
  expect(rapporti['download/B-potenziata'].esito).toBe('ok');
  expect(rapporti['download/B-potenziata'].codaTrovata, 'B-potenziata: la coda del monolite deve essere riconosciuta').toBe(true);
  expect(rapporti['download/B-potenziata'].rigaVecchia, 'B-potenziata: la riga vecchia non puo\' sopravvivere sotto le nuove').toBe(false);
  expect(rapporti['download/B-potenziata'].codaVuota).toBe(true);
  expect(rapporti['download/B-potenziata'].idDest).toContain('modelLabDownloadsList');
});

test('MONTAGGIO-02 — il crollo n. 3: la guardia di app.js e il NotFoundError, misurati', async ({ page }) => {
  await apriIlBanco(page);
  const misure = await page.evaluate((timbri) => {
    const { svuota, clona, esito, ids } = window.__c3;
    const inst = window.__c3.moduli['modelli-installati'].montaInstallati;
    const b = svuota();
    const dest = clona('#panel-installati'); const sorg = clona('#modelLabInstalledPanel');
    b.append(dest, sorg);
    inst(dest, sorg);
    /* La guardia di app.js:3624 e' `installedPanel && !installedPanel.dataset.installatiMontato &&
       !installedPanel.querySelector('[data-model-lab-enhanced="installed"]')`. Il pannello VUOTATO
       e' `sorg` (in direzione B la destinazione e' la schermata): e' il timbro su di LUI che la
       spegne. Il testo della guardia e' verificato in Node, non solo qui. */
    const pannello = sorg;
    const guardia = !!pannello && !pannello.dataset.installatiMontato && !pannello.querySelector('[data-model-lab-enhanced="installed"]');
    // il riferimento che app.js prende dal DOCUMENTO, non dal pannello:
    const riferimento = b.querySelector('#modelLabInstalledList');
    const controlli = document.createElement('div');
    controlli.dataset.modelLabEnhanced = 'installed';
    const crollo = esito(() => pannello.insertBefore(controlli, riferimento)).esito;
    return {
      timbroSulPannelloVuotato: pannello.dataset.installatiMontato ?? null,
      guardiaPuoIniettare: guardia,
      riferimentoEsiste: !!riferimento,
      riferimentoFiglioDelPannello: !!riferimento && riferimento.parentElement === pannello,
      crollo,
      pannelloAncoraVuoto: pannello.children.length === 0,
      idSullaSchermata: ids(dest).includes('modelLabInstalledList'),
    };
  }, TIMBRI);
  expect(misure.timbroSulPannelloVuotato, '⛔ il timbro deve stare ANCHE sulla radice svuotata').toBe('true');
  expect(misure.guardiaPuoIniettare, '⛔ con il timbro la guardia di app.js NON deve poter iniettare').toBe(false);
  expect(misure.riferimentoEsiste).toBe(true);
  expect(misure.riferimentoFiglioDelPannello, "ecco perche la insertBefore esplode: il nodo e in un altro albero").toBe(false);
  expect(misure.crollo, '⛔ la prova deve mostrare il CROLLO: senza il timbro, insertBefore esplode').toContain('NotFoundError');
  expect(misure.pannelloAncoraVuoto).toBe(true);
  // e la guardia, trascritta da app.js:3619 e 3624, e' davvero quella nel file su disco
  const app = await readFile(SORGENTE_APP, 'utf8');
  expect(app, "app.js:3627 — la guardia dell'iniezione").toContain("installedPanel.insertBefore(controls, $('#modelLabInstalledList'))");
  expect(app, 'app.js:3624 — la condizione').toContain('!installedPanel.dataset.installatiMontato');
  expect(app, 'app.js:3624 — la seconda condizione').toContain('!installedPanel.querySelector(\'[data-model-lab-enhanced="installed"]\')');
  expect(app, 'app.js:3619 — la guardia hf').toContain('!hfPanel.dataset.hfMontato');
  expect(app, 'app.js:3457 — chi disegna i modelli installati pretende il timbro').toContain('!panel.dataset.installatiMontato');
  expect(app, 'app.js:22465 — chi disegna la coda pretende il timbro').toContain('panel?.dataset.downloadMontato');
  expect(app, 'app.js:3777 — chi disegna Hugging Face pretende il timbro').toContain('panel?.dataset.hfMontato');
});

test('MONTAGGIO-03 — la memoria nei suoi tre versi, e la card che non esplode', async ({ page }) => {
  await apriIlBanco(page);
  const rapporti = await page.evaluate(() => {
    const { moduli, caso } = window.__c3;
    const mis = moduli['misura-memoria'].montaMisuraMemoria;
    const card = () => window.__c3.clona('#panel-runtime [data-c="MemoryMeter"]');
    // il montaggio della memoria ha un SOLO timbro (idempotenza): il monolite non ne legge nessuno
    const timbri = ['memoryMontato'];
    const opz = (extra) => ({ timbri, extra });
    /* ⛔ `dentro` e' il motivo per cui la B2 ha morso: nella B2 la destinazione E' la card, e
       `querySelector` cerca solo fra i DISCENDENTI — la card non e' discendente di se stessa, e
       la misura diceva «non c'e'» mentre c'era. Una misura che non puo' vedere il caso che sta
       misurando e' [[una-misura-ristretta-non-vede-cio-che-non-ti-aspetti]].
       ⛔ `gate` si legge dal BANCO e non dalla destinazione: nei tre versi il cancello dei
       runtime resta nel pannello legacy, che nella direzione B e' la SORGENTE. Cio' che va
       provato non e' «sta nella destinazione» ma «non e' finito nel vuoto» — e il banco li'
       dentro tiene entrambe le radici, con `duplicati` che garantisce che sia uno solo. */
    const dentro = (d, sel) => (d.matches?.(sel) ? d : d.querySelector(sel));
    const leggi = (d) => ({
      cardDentroDest: !!dentro(d, '[data-c="MemoryMeter"]'),
      /* ⛔ `replaceChildren` e `moveBefore` SPOSTANO i nodi, non li clonano: se comparisse una
         seconda card nel banco, il travaso avrebbe duplicato — e con essa gli ascoltatori. */
      cardNelBanco: window.__c3.banco().querySelectorAll('[data-c="MemoryMeter"]').length,
      rimisura: !!d.querySelector('#memoriaRimisura'),
      scarica: !!d.querySelector('#memoriaScarica'),
      barra: d.querySelector('#memoriaBarraUsata') ? 'legacy' : d.querySelector('#memoriaModello') ? 'mockup' : 'assente',
      campi: ['machineMemoryMetric', 'machineFreeMemoryMetric', 'machineStorageMetric', 'machineAllocatableMetric', 'machineCapacityDetail', 'memoriaBarraEtichetta', 'memoriaTenuta'].filter((id) => d.querySelector('#' + id)),
      gate: (() => { const b = window.__c3.banco(); return ['modelLabRuntimeGate', 'modelLabRuntimeSelect', 'modelLabRuntimeList', 'modelLabPrompt', 'modelLabActiveModel'].filter((id) => b.querySelector('#' + id)); })(),
      tenuta: d.querySelector('[data-memory-tenuta]')?.textContent ?? null,
    });
    // A — la forma di oggi: destinazione il pannello legacy, sorgente la CARD del mockup
    const A = caso(mis, '#modelLabOverviewPanel', '#panel-runtime [data-c="MemoryMeter"]', opz(leggi));
    // B1 — destinazione la SCHERMATA, sorgente il pannello legacy (che porta la card dentro di se')
    const B1 = caso((d, s) => { const c = s.querySelector('[data-c="MemoryMeter"]'); return mis(d, c || s); }, '#panel-runtime', '#modelLabOverviewPanel', opz(leggi));
    // B2 — destinazione la CARD stessa che sta sulla schermata
    const B2 = (() => {
      const b = window.__c3.svuota();
      const dest = window.__c3.clona('#panel-runtime [data-c="MemoryMeter"]');
      const sorg = window.__c3.clona('#modelLabOverviewPanel');
      b.append(dest, sorg);
      const esito = window.__c3.esito(() => mis(dest, sorg)).esito;
      return { esito, idDest: window.__c3.ids(dest), byteSorg: sorg.innerHTML.trim().length, duplicati: window.__c3.duplicatiIn(b), timbri: Object.fromEntries(timbri.map((k) => [k, [dest.dataset[k] ?? null, sorg.dataset[k] ?? null]])), extra: leggi(dest) };
    })();
    return { A, B1, B2 };
  });

  for (const [nome, r] of Object.entries(rapporti)) {
    expect(r.esito, `${nome}: il montaggio della memoria non deve esplodere`).toBe('ok');
    expect(r.duplicati, `${nome}: nessun id doppio fra i due alberi`).toEqual([]);
    expect(r.extra.cardDentroDest, `${nome}: la card deve finire nella destinazione`).toBe(true);
    expect(r.extra.cardNelBanco, `${nome}: una card sola in tutto il banco — si sposta, non si clona`).toBe(1);
    expect(r.extra.rimisura, `${nome}: il bottone che il monolite ascolta (app.js:4642) deve esserci`).toBe(true);
    expect(r.extra.scarica, `${nome}: il bottone che il monolite legge (app.js:4120) deve esserci`).toBe(true);
    expect(r.extra.campi, `${nome}: gli id del monolite devono stare tutti sulla card`).toEqual(['machineMemoryMetric', 'machineFreeMemoryMetric', 'machineStorageMetric', 'machineAllocatableMetric', 'machineCapacityDetail', 'memoriaBarraEtichetta', 'memoriaTenuta']);
    expect(r.extra.tenuta, `${nome}: il montaggio si chiude con la verifica in corso`).toContain('Verifica del modello in corso');
    for (const timbro of ['memoryMontato']) expect(r.timbri[timbro], `${nome}/${timbro}: il timbro va su ENTRAMBE le radici`).toEqual(['true', 'true']);
  }
  expect(rapporti.A.extra.barra, "A: la barra e quella del mockup").toBe('mockup');
  expect(rapporti.B1.extra.barra, "B1: la barra e quella del mockup").toBe('mockup');
  expect(rapporti.B2.extra.barra).toBe('mockup');
  // il gate del runtime NON deve finire nel vuoto: colonna = il genitore di #memoriaLibera
  for (const nome of ['A', 'B1', 'B2']) {
    expect(rapporti[nome].extra.gate, `${nome}: il gate del runtime non si tocca`).toEqual(['modelLabRuntimeGate', 'modelLabRuntimeSelect', 'modelLabRuntimeList', 'modelLabPrompt', 'modelLabActiveModel']);
  }
  expect(rapporti.A.extra.cardNelBanco, 'A: una card sola — il travaso SPOSTA, non clona').toBe(1);
  /* ⛔ Qui pretendevo `A.byteSorg === 0` ed era SBAGLIATO, non rotto il codice: in A la sorgente
     E' la card stessa, e spostare un nodo NON ne svuota l'interno (se lo portava con se'). Una
     sorgente che si svuota e' un CONTENITORE: `byteSorg === 0` vale dove la sorgente e' un
     pannello (MONTAGGIO-01, tre casi verdi), non dove la sorgente e' il nodo spostato. Cio' che
     va provato in A e' che la card sia UNA e stia nella destinazione — righe sopra. */
  expect(rapporti.A.byteDest, 'A: la destinazione porta la card, quindi non e vuota').toBeGreaterThan(0);
  expect(rapporti.B1.byteSorg, 'B1: la sorgente (pannello legacy) resta svuotata della colonna').toBeLessThan(rapporti.A.byteDest);

  // la card MUTILATA: senza barra, senza errore, senza bottoni, senza un campo — non deve esplodere
  const mutilata = await page.evaluate(() => {
    const { svuota, clona, esito } = window.__c3;
    const agg = window.__c3.moduli['misura-memoria'].aggiornaMisuraMemoria;
    const b = svuota();
    const card = clona('#panel-runtime [data-c="MemoryMeter"]');
    for (const sel of ['[data-memory-bar]', '[data-memory-error]', '[data-memory-action="refresh"]', '[data-memory-action="unload"]', '[data-memory-value="discoAllocabile"]', '[data-memory-detail]']) card.querySelector(sel)?.remove();
    b.append(card);
    const esitoAgg = esito(() => agg(card, { capacita: null, runtimeVerificato: false })).esito;
    return { esito: esitoAgg, totale: card.querySelector('[data-memory-value="totale"]')?.textContent ?? null, tenuta: card.querySelector('[data-memory-tenuta]')?.textContent ?? null, byte: card.innerHTML.length };
  });
  expect(mutilata.esito, "⛔ una card degradata non deve far cadere l'aggiornamento").toBe('ok');
  expect(mutilata.totale).toBe('Non misurata');
  expect(mutilata.tenuta).toContain('Verifica del modello in corso');
});

test('MONTAGGIO-04 — la memoria coi DATI VERI del server (capacity) e i fornitori veri', async ({ page }) => {
  await apriIlBanco(page);
  const misure = await page.evaluate(async () => {
    const { api, esito, svuota, clona, ids } = window.__c3;
    const { normalizzaCapacita, aggiornaMisuraMemoria, montaMisuraMemoria } = window.__c3.moduli['misura-memoria'];
    const risposta = await api('/api/v1/model-lab/capacity');
    const dati = risposta.corpo?.data ?? risposta.corpo;
    const valido = esito(() => { normalizzaCapacita(dati); return true; });
    const gib = (n) => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(n / 1024 ** 3) + ' GiB';
    // montaggio nella direzione B1 (la schermata) e poi aggiornamento coi dati veri
    const b = svuota();
    const dest = clona('#panel-runtime'); const sorg = clona('#modelLabOverviewPanel');
    b.append(dest, sorg);
    const card = dest.querySelector('[data-c="MemoryMeter"]');
    const esitoMonta = esito(() => montaMisuraMemoria(dest, sorg)).esito;
    const esitoAgg = esito(() => aggiornaMisuraMemoria(card, { capacita: dati, runtimeVerificato: false, runtimes: [] })).esito;
    const leggi = (sel) => card.querySelector(sel)?.textContent ?? null;
    return {
      stato: risposta.stato, schema: dati?.schema ?? null, measuredAt: dati?.measuredAt ?? null,
      valido: valido.esito, esitoMonta, esitoAgg,
      atteso: valido.esito === 'ok' ? {
        totale: gib(dati.memory.totalBytes), libera: gib(dati.memory.freeBytes),
        discoDisponibile: gib(dati.storage.availableBytes), discoRiserva: gib(dati.storage.reserveBytes), discoAllocabile: gib(dati.storage.allocatableBytes),
      } : null,
      letto: { totale: leggi('[data-memory-value="totale"]'), libera: leggi('[data-memory-value="libera"]'), discoDisponibile: leggi('[data-memory-value="discoDisponibile"]'), discoRiserva: leggi('[data-memory-value="discoRiserva"]'), discoAllocabile: leggi('[data-memory-value="discoAllocabile"]') },
      data: leggi('[data-memory-date]'), label: leggi('[data-memory-label]'), barra: card.querySelector('[data-memory-bar]')?.value ?? null,
      dettaglio: leggi('[data-memory-detail]'), piattaforma: dati?.platform ?? null,
      idDopoAggiornamento: ['machineMemoryMetric', 'machineFreeMemoryMetric', 'machineStorageMetric', 'machineAllocatableMetric', 'machineCapacityDetail', 'memoriaBarraEtichetta', 'memoriaTenuta'].filter((id) => !!document.querySelector('#c3-banco #' + id)),
    };
  });
  expect(misure.stato, 'la rotta della capacità deve rispondere').toBe(200);
  expect(misure.schema, '⛔ il payload vero deve avere lo schema che `normalizzaCapacita` pretende').toBe('talos.model-lab.capacity/1');
  expect(misure.valido, '⛔ `normalizzaCapacita` sul payload VERO').toBe('ok');
  expect(misure.esitoMonta).toBe('ok');
  expect(misure.esitoAgg).toBe('ok');
  // le stringhe a schermo sono calcolate DAL payload vero, non scritte a mano qui
  expect(misure.letto).toEqual(misure.atteso);
  expect(misure.letto.totale).not.toBe('Non misurata');
  expect(misure.data).toContain('Misurato');
  expect(misure.label).toContain('in uso su');
  expect(Number(misure.barra)).toBeGreaterThan(0);
  if (misure.piattaforma) expect(misure.dettaglio).toContain(String(misure.piattaforma));
  expect(misure.idDopoAggiornamento).toHaveLength(7);

  // ── i fornitori: pannello legacy (dove vive oggi) + la rotta di prova
  const fornitori = await page.evaluate(async () => {
    const { api, esito, svuota, clona, banco } = window.__c3;
    const { montaProviderPanel, aggiornaProviderList } = window.__c3.moduli['provider-card'];
    const risposta = await api('/api/v1/providers');
    const dati = risposta.corpo?.data ?? risposta.corpo;
    const items = Array.isArray(dati?.items) ? dati.items : null;
    // velo vero del mockup: la funzione non deve esplodere nemmeno li'
    const velo = await (async () => { const v = clona('#veloFornitori .talos-dialog__body'); banco().append(v); const e = esito(() => montaProviderPanel(v)).esito; return { esito: e, timbro: v.dataset.providerMontato ?? null, refresh: !!v.querySelector('#providerRefresh') }; })();
    // pannello legacy: e' la casa del monolite (app.js:2895, 4633 leggono #providerRefresh)
    const b = svuota();
    const panel = clona('#modelLabProvidersPanel');
    b.append(panel);
    const esitoMonta = esito(() => montaProviderPanel(panel)).esito;
    const dopoPrimo = { refresh: panel.querySelectorAll('#providerRefresh').length, test: !!panel.querySelector('#providerTestAll'), titolo: panel.querySelector('h4')?.textContent ?? null, nota: panel.querySelector('p')?.textContent ?? null, classi: panel.className, ordine: [...panel.querySelectorAll('.model-lab-panel-heading > *')].map((n) => n.id || n.className) };
    esito(() => montaProviderPanel(panel));
    const dopoSecondo = { refresh: panel.querySelectorAll('#providerRefresh').length, byte: panel.innerHTML.length };
    const lista = panel.querySelector('#providerList');
    const esitoLista = items ? esito(() => aggiornaProviderList(lista, items, {})).esito : null;
    const ids = [...(lista?.querySelectorAll('[data-provider-id]') ?? [])].map((n) => n.dataset.providerId);
    // la rotta di prova: differenziale — percorso ignoto vs fornitore ignoto (nessun traffico vero)
    const ignoto = await api('/api/v1/providers/__c3_non_esiste/test', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: '{}' });
    const percorsoIgnoto = await api('/api/v1/providers/__c3_non_esiste/__rotta_ignota', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: '{}' });
    return {
      stato: risposta.stato, righe: items?.length ?? null, primoFornitore: items?.[0]?.id ?? null,
      velo, esitoMonta, dopoPrimo, dopoSecondo, esitoLista, ids,
      ignoto: { stato: ignoto.stato, codice: ignoto.corpo?.error?.code ?? null },
      percorsoIgnoto: { stato: percorsoIgnoto.stato, codice: percorsoIgnoto.corpo?.error?.code ?? null },
    };
  });
  expect(fornitori.stato, 'la rotta dei fornitori deve rispondere').toBe(200);
  expect(fornitori.righe, 'il server deve dichiarare almeno un fornitore').toBeGreaterThan(0);
  expect(fornitori.velo.esito, 'sul velo VERO del mockup non si esplode').toBe('ok');
  expect(fornitori.velo.timbro).toBe('true');
  expect(fornitori.velo.refresh, "sul velo non c'e' #providerTestAll: niente pulsanti inventati").toBe(false);
  expect(fornitori.esitoMonta).toBe('ok');
  expect(fornitori.dopoPrimo.test, 'il pulsante «Prova tutti» deve esistere').toBe(true);
  expect(fornitori.dopoPrimo.refresh, 'il montaggio crea UN #providerRefresh').toBe(1);
  expect(fornitori.dopoPrimo.titolo, 'il titolo si allinea alla schermata').toBe('Fornitori e accessi');
  expect(fornitori.dopoPrimo.classi, 'il pannello prende la classe della schermata').toContain('talos-provider-panel');
  expect(fornitori.dopoSecondo.refresh, '⛔ una seconda chiamata non deve creare un SECONDO #providerRefresh').toBe(1);
  expect(fornitori.esitoLista).toBe('ok');
  expect(fornitori.ids.length, 'una card per ogni fornitore VERO').toBe(fornitori.righe);
  expect(fornitori.ids[0]).toBe(fornitori.primoFornitore);
  expect(fornitori.ignoto.codice, 'POST /api/v1/providers/:id/test esiste: fornitore ignoto = PROVIDER_INVALID').toBe('PROVIDER_INVALID');
  expect(fornitori.percorsoIgnoto.codice, 'e la differenza si vede: percorso ignoto = NOT_FOUND').toBe('NOT_FOUND');
});

test('MONTAGGIO-05 — la rotta della capacità e quella dei fornitori: envelope vero, nessun dato inventato', async ({ page }) => {
  await apriIlBanco(page);
  const misure = await page.evaluate(async () => {
    const { api } = window.__c3;
    const uno = await api('/api/v1/model-lab/capacity');
    const due = await api('/api/v1/providers');
    const tre = await api('/api/v1/__c3_non_esiste');
    return {
      capacita: { stato: uno.stato, ok: uno.corpo?.ok ?? null, meta: uno.corpo?.meta?.schema ?? null, haData: !!uno.corpo?.data },
      fornitori: { stato: due.stato, ok: due.corpo?.ok ?? null, haItems: Array.isArray(due.corpo?.data?.items) },
      ignota: { stato: tre.stato, codice: tre.corpo?.error?.code ?? null },
    };
  });
  expect(misure.capacita).toEqual({ stato: 200, ok: true, meta: expect.any(String), haData: true });
  expect(misure.fornitori.stato).toBe(200);
  expect(misure.fornitori.ok).toBe(true);
  expect(misure.fornitori.haItems).toBe(true);
  expect(misure.ignota.codice, 'la prova del differenziale ha bisogno che una rotta ignota dia NOT_FOUND').toBe('NOT_FOUND');
});

test('MONTAGGIO-06 — regge il vuoto, e NON tocca il documento vivo', async ({ page }) => {
  await apriIlBanco(page);
  const misure = await page.evaluate(() => {
    const { moduli, esito, clona, banco, svuota } = window.__c3;
    // (1) cinque montaggi con radici vuote e con null: nessuno esplode
    const vuoti = {};
    for (const [modulo, fn] of [['modelli-installati', 'montaInstallati'], ['hf-catalogo', 'montaHf'], ['download-coda', 'montaCodaDownload'], ['misura-memoria', 'montaMisuraMemoria'], ['provider-card', 'montaProviderPanel']]) {
      const f = moduli[modulo][fn];
      vuoti[fn] = {
        dueDiv: fn === 'montaProviderPanel' ? esito(() => f(document.createElement('div'))).esito : esito(() => f(document.createElement('div'), document.createElement('div'))).esito,
        nullo: fn === 'montaProviderPanel' ? esito(() => f(null)).esito : esito(() => f(null, null)).esito,
      };
    }
    // (2) il documento VIVO non si tocca: con due radici vuote nessun ripiego deve andare a
    //     prendere i nodi veri (era il rischio dei `|| document.getElementById(...)`)
    const vivi = () => ({
      memoriaLibera: (document.querySelector('#memoriaLibera')?.parentElement?.innerHTML ?? '').length,
      rimisura: !!document.querySelector('#modelLabOverviewPanel #memoriaRimisura'),
      scarica: !!document.querySelector('#modelLabOverviewPanel #memoriaScarica'),
      installati: !!document.querySelector('#modelLabInstalledPanel #modelLabInstalledList'),
      hf: !!document.querySelector('#modelLabHfPanel #modelLabHfResults'),
      coda: !!document.querySelector('#modelLabDownloadsPanel #modelLabDownloadsList'),
      fornitori: (document.querySelector('#providerList')?.innerHTML ?? '').length,
    });
    const prima = vivi();
    svuota();
    const esiti = {
      memoria: esito(() => moduli['misura-memoria'].montaMisuraMemoria(document.createElement('div'), document.createElement('div'))).esito,
      // card senza le sedi dei bottoni: e' il caso in cui un ripiego andrebbe a RUBARE i bottoni vivi
      memoriaCardSenzaSedie: esito(() => { const c = clona('#panel-runtime'); c.querySelectorAll('[data-memory-action]').forEach((n) => n.remove()); return moduli['misura-memoria'].montaMisuraMemoria(c, document.createElement('div')); }).esito,
      installati: esito(() => moduli['modelli-installati'].montaInstallati(document.createElement('div'), document.createElement('div'))).esito,
      hf: esito(() => moduli['hf-catalogo'].montaHf(document.createElement('div'), document.createElement('div'))).esito,
      download: esito(() => moduli['download-coda'].montaCodaDownload(document.createElement('div'), document.createElement('div'))).esito,
      fornitori: esito(() => moduli['provider-card'].montaProviderPanel(document.createElement('div'))).esito,
    };
    const dopo = vivi();
    return { vuoti, esiti, prima, dopo, bancoFigli: banco().children.length, dentroIlBanco: !!document.querySelector('#c3-banco #memoriaRimisura') };
  });
  for (const [fn, esiti] of Object.entries(misure.vuoti)) {
    expect(esiti.dueDiv, `${fn} con due div vuoti non deve esplodere`).toBe('ok');
    expect(esiti.nullo, `${fn} con null non deve esplodere`).toBe('ok');
  }
  for (const [chi, esito] of Object.entries(misure.esiti)) expect(esito, `${chi}: nessuna esplosione`).toBe('ok');
  expect(misure.dopo, '⛔ nessun montaggio a vuoto puo\' toccare il documento VIVO').toEqual(misure.prima);
  expect(misure.prima.memoriaLibera, 'e il documento vivo deve avere davvero qualcosa da perdere').toBeGreaterThan(0);
  expect(misure.prima.rimisura).toBe(true);
  expect(misure.dentroIlBanco, 'nessun nodo vivo deve finire nel banco di prova').toBe(false);
});
