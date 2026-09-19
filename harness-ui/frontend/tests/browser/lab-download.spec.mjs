/**
 * lab-download.spec.mjs — la scheda «Download» del Laboratorio (FASE 4, corsia 3), 19/09/2026.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * COSA PROVA, E PERCHE' COSI'
 *
 * Il mockup `TALOS-Calm-Lab-04.html` disegna questa scheda VUOTA: 1 stato vuoto `1122×330` con
 * «Nessun download in coda.» e «Esplora il catalogo», 0 righe. Quando la coda ha elementi il
 * mockup non ha un disegno da copiare: il vocabolario è il suo e il contenuto è il nostro vero
 * (owner 18/09). Qui si provano le due facce e le cure di ONESTÀ della fase:
 *
 *   1. lo STATO VUOTO del mockup quando la coda è davvero vuota, e il bottone che porta DOVE DICE;
 *   2. la coda VERA nello stile del mockup, senza perdere i comandi che esistono già;
 *   3. i CONTATORI coerenti con le righe (con N righe i contatori dicono N; col filtro acceso la
 *      riga lo dice);
 *   4. le PERCENTUALI solo quando si sanno calcolare (indeterminato, mai `0%` inventato);
 *   5. l'ETICHETTA che dice cosa succede davvero («Riprendi» dove il trasporto riprende).
 *
 * ⛔ COME ARRIVA IL MODULO NELLA PAGINA — e perché così. Il pacchetto servito (`public/`) lo
 * costruisce l'orchestratore, e questa corsia non lo tocca: importare il modulo da `app.js` non si
 * può. Il modulo si serve dalla sua SORGENTE su disco — `page.route('**\/__c3/*.js')` — e si carica
 * con un `import()` dalla pagina; il percorso è same-origin, quindi la CSP `script-src 'self'` lo
 * ammette (nessun `<script>` inline, che il server scarterebbe in silenzio). Stesso metodo di
 * `lab-montaggio-neutro.spec.mjs` (corsia 3, 18/09) e di `lab-guscio.spec.mjs` (corsia 2).
 * ⇒ La prova misura la SORGENTE su disco, non il pacchetto costruito.
 *
 * ⛔ PERCHÉ LA CODA DELL'APP È SOSPESA DURANTE LA MISURA. Il pacchetto di OGGI porta ancora la
 * versione VECCHIA della stessa funzione: `renderizzaDownloadConMockup` ridisegnerebbe il pannello
 * con quelle righe, e due scritture sulla stessa lista si pesterebbero (la seconda cancella la
 * prima e la prova diventa intermittente — «una prova che balla non protegge»). La rotta
 * `/api/v1/huggingface/downloads` resta quindi APPESA per la durata della misura: l'app non
 * ridisegna, e il pannello VERO resta quello che questa corsia disegna. Dopo il build
 * dell'orchestratore la sospensione non serve più, e si toglie.
 *
 * ⛔ E IL PUNTO DI INNESTO È VERO: `renderizzaDownloadConMockup` (`app.js:22579`) chiama
 * `aggiornaCodaDownload(panel, state.modelLab.downloads, {soloAttivi, stime, azioni})` su
 * `#modelLabDownloadsPanel` — la stessa funzione, lo stesso pannello, gli stessi argomenti che
 * questa prova usa. La riga è verificata QUI sotto, in Node, contro `app.js` (DL-MOCKUP).
 *
 * ⛔ COSA DIVENTA ROSSO (la prova deve poter essere rotta, non solo verde):
 *   · si togliesse lo stato vuoto da `aggiornaCodaDownload` ⇒ DL-VUOTO rossa;
 *   · si togliesse il ramo del catalogo in `creaStatoVuotoDownload` (o l'ancoraggio a
 *     `#modelLabCard`) ⇒ DL-CATALOGO rossa (il bottone non porta più dove dice);
 *   · si togliesse la categoria `annullati` da `riepilogoCoda` ⇒ DL-CONTATORI rossa (la somma dei
 *     badge non fa più il numero delle righe — era il difetto del 19/09);
 *   · si rimettesse il ripiego su `0` in `datiDownload` ⇒ DL-PERCENTO rossa (`0%` su un totale che
 *     il server non ha dichiarato);
 *   · si rimettesse «Riprova» sulla scheda d'errore ⇒ DL-ETICHETTA rossa;
 *   · si scrivesse la scheda d'errore da uno stato che non è più `failed` ⇒ DL-ERRORE rossa.
 */
import { expect, test } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { apri as apriRiferimento, MOCKUP, struttura, testi } from '../parity/aiuto.mjs';
import { DOWNLOAD, STIME_DOWNLOAD } from '../../lab/fixtures/download-coda.js';

const COMPONENTI = resolve(process.cwd(), 'src', 'components');
const SORGENTE_APP = resolve(process.cwd(), 'src', 'legacy', 'app.js');
const FOTO = resolve(process.cwd(), 'artifacts', 'lab-download-2026-09-19');
const PANEL = '#modelLabCard [data-model-lab-panel="downloads"]';

/** La coda VERA misurata sul 4174 il 19/09/2026 (`GET /api/v1/huggingface/downloads`): 1 riga, `ready`. */
const CODA_VIVA = [{
  id: 'unsloth-GLM-4-7-Flash-GGUF-0d32489ecb9d-GLM-4-7-Flash-Q4-K-M-gguf',
  state: 'ready', progress: 100, bytes: 18312339808, totalBytes: 18312339808, reason: null,
  startedAt: '2026-09-17T14:16:10.083Z', repo: 'unsloth/GLM-4.7-Flash-GGUF',
  file: 'GLM-4.7-Flash-Q4_K_M.gguf', name: null, finishedAt: '2026-09-17T14:16:10.083Z',
}];

/** La coda mista delle foto: una riga per categoria, per guardare tutti gli stati disegnati. */
const CODA_MISTA = [
  { id: 'm1', state: 'running', progress: 42, bytes: 3_400_000_000, totalBytes: 8_100_000_000, startedAt: '2026-09-19T08:40:00.000Z', repo: 'Qwen/Qwen3-8B-GGUF', file: 'Qwen3-8B-Q8_0.gguf' },
  { id: 'm2', state: 'verifying', progress: 99, bytes: 5_200_000_000, totalBytes: 5_200_000_000, repo: 'Qwen/Qwen3-8B-GGUF', file: 'Qwen3-8B-Q4_K_M.gguf' },
  { id: 'm3', state: 'paused', progress: 20, bytes: 2_000_000_000, totalBytes: 10_000_000_000, reason: 'PAUSED_BY_OWNER', repo: 'Community/Gemma-3-12B-GGUF', file: 'Gemma-3-12B-Q4_K_M.gguf' },
  { id: 'm4', state: 'failed', progress: 15, bytes: 1_200_000_000, totalBytes: 8_100_000_000, reason: 'NETWORK', startedAt: '2026-09-19T08:10:00.000Z', repo: 'Community/Gemma-3-12B-GGUF', file: 'Gemma-3-12B-Q4_K_M.gguf' },
  { id: 'm5', state: 'ready', progress: 100, bytes: 18_312_339_808, totalBytes: 18_312_339_808, finishedAt: '2026-09-17T14:16:10.083Z', repo: 'unsloth/GLM-4.7-Flash-GGUF', file: 'GLM-4.7-Flash-Q4_K_M.gguf' },
  { id: 'm6', state: 'cancelled', progress: 3, bytes: 200_000_000, totalBytes: 6_000_000_000, reason: 'CANCELLED', repo: 'Qwen/Qwen3-8B-GGUF', file: 'Qwen3-8B-F16.gguf' },
];

/**
 * Prepara una pagina: sola lettura se il server è quello vivo dell'owner, il modulo dalla sorgente,
 * e la coda dell'app sospesa (vedi la testata).
 */
async function prepara(page, dove = '') {
  const fermati = [];
  if (/127\.0\.0\.1:4174|localhost:4174/.test(dove)) {
    await page.route('**/*', (route) => {
      const metodo = route.request().method();
      if (['GET', 'HEAD', 'OPTIONS'].includes(metodo)) return route.continue();
      fermati.push(`${metodo} ${route.request().url()}`);
      return route.abort();
    });
  }
  await page.route('**/api/v1/huggingface/downloads', () => { /* appesa: vedi la testata */ });
  await page.route('**/__c3/*.js', async (route) => {
    const nome = new URL(route.request().url()).pathname.split('/').pop();
    try {
      const sorgente = await readFile(resolve(COMPONENTI, nome), 'utf8');
      await route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: sorgente });
    } catch {
      // ⛔ Un import che non risolve deve FARSI VEDERE: 404, non un vuoto.
      await route.fulfill({ status: 404, contentType: 'text/plain; charset=utf-8', body: `manca ${nome}` });
    }
  });
  return fermati;
}

/** Apre l'app e va in Impostazioni → Laboratorio modelli → scheda «Download», come un utente. */
async function apriIlLaboratorio(page, { colorMode = 'dark', dove = '' } = {}) {
  const fermati = await prepara(page, dove);
  await page.addInitScript((modo) => {
    try {
      window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({
        version: 1,
        appearance: { colorMode: modo, themePreset: 'calm', themePresetVersione: 2, uiLanguage: 'it' },
        chat: {}, workspaces: {},
      }));
    } catch { /* un frame in sandbox non ha storage */ }
  }, colorMode);
  await page.goto('/');
  await page.waitForFunction(() => !!window.__talosHarnessUiRuntime, null, { timeout: 20000 });
  const esito = await page.evaluate(async () => {
    const voce = document.querySelector('.talos-sidebar [data-vaia="impostazioni"]');
    if (voce && !voce.offsetParent) {
      const gruppo = voce.closest('.td-nav-group');
      const testata = gruppo?.id ? document.querySelector(`.talos-sidebar [aria-controls="${gruppo.id}"]`) : null;
      if (testata?.getAttribute('aria-expanded') === 'false') testata.click();
    }
    voce?.click();
    window.__talosHarnessUiRuntime?.setSettingsSection?.('models');
    await new Promise((r) => setTimeout(r, 250));
    // La scheda «Download» del guscio a quattro schede: si preme come la premerebbe un utente.
    document.querySelector('#labSchedaDownloads')?.click();
    await new Promise((r) => setTimeout(r, 250));
    window.__dl = await import('/__c3/download-coda.js');
    const carta = document.querySelector('#modelLabCard');
    const panel = carta?.querySelector('[data-model-lab-panel="downloads"]');
    return {
      carta: Boolean(carta),
      guscio: carta?.dataset.labGuscio ?? null,
      panel: Boolean(panel),
      timbro: panel?.dataset.downloadMontato ?? null,
      pannelli: document.querySelectorAll('#modelLabCard [data-model-lab-panel="downloads"]').length,
      coda: Boolean(panel?.querySelector('[data-c="DownloadQueue"]')),
      righeAlMontaggio: panel?.querySelectorAll('[data-c="DownloadRow"]').length ?? null,
    };
  });
  expect(esito.carta, 'la carta del laboratorio deve esistere').toBe(true);
  expect(esito.guscio, 'la carta è timbrata dal guscio a quattro schede').toBe('v3');
  expect(esito.pannelli, '⛔ UN solo pannello `downloads`: i duplicati legacy renderebbero ambigua ogni misura').toBe(1);
  expect(esito.panel).toBe(true);
  expect(esito.coda, 'la coda del mockup è montata nel pannello vero').toBe(true);
  expect(esito.timbro, 'il pannello è quello che il monolite ha travasato').toBe('true');
  expect(esito.righeAlMontaggio, 'il travaso svuota la coda: si parte da zero righe').toBe(0);
  return { fermati, esito };
}

/** Rende una coda nel pannello VERO, con la funzione della sorgente su disco. */
async function rendi(page, items, opzioni = {}) {
  return page.evaluate(({ items, opzioni }) => {
    const panel = document.querySelector('#modelLabCard [data-model-lab-panel="downloads"]');
    const stime = new Map(Object.entries(opzioni.stime || {}));
    window.__dlSpie = [];
    /* ⛔ Le azioni si passano come le passa l'app (`app.js:22579`). Con `senzaAzioni` si rende come
       rende il LABORATORIO (`lab/main.js:442`, che non passa `azioni`): è la condizione in cui il
       cancello dei componenti confronta le tre righe col mockup. */
    window.__dl.aggiornaCodaDownload(panel, items, {
      soloAttivi: Boolean(opzioni.soloAttivi), stime,
      azioni: opzioni.senzaAzioni ? {} : {
        pausa: (id) => window.__dlSpie.push(['pausa', id]),
        riprendi: (id) => window.__dlSpie.push(['riprendi', id]),
        annulla: (id) => window.__dlSpie.push(['annulla', id]),
        vediModello: (id) => window.__dlSpie.push(['vediModello', id]),
      },
    });
    const coda = panel.querySelector('[data-c="DownloadQueue"]');
    const righe = [...coda.querySelectorAll('[data-c="DownloadRow"]')];
    const conteggi = panel.querySelector('.talos-count');
    return {
      righe: righe.length,
      stati: righe.map((r) => r.dataset.state),
      codaNascosta: coda.hidden,
      conteggiNascosti: conteggi?.hidden ?? null,
      badge: [...conteggi.querySelectorAll('[data-c="Badge"]')].map((b) => b.textContent.trim()),
    };
  }, { items, opzioni });
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// La faccia VUOTA: lo stato vuoto del mockup, e il suo bottone che porta dove dice.
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('DL-VUOTO — coda vuota: lo stato vuoto del mockup, con la frase e il bottone; i comandi restano montati', async ({ page }) => {
  await apriIlLaboratorio(page);
  const prima = await rendi(page, []);

  // Il disegno del mockup: la coda e i conteggi NON si vedono, lo stato vuoto sì.
  expect(prima.righe, 'una coda vuota non disegna righe').toBe(0);
  expect(prima.codaNascosta, 'la coda vuota non si disegna: al suo posto c’è lo stato vuoto').toBe(true);
  expect(prima.conteggiNascosti, 'con la coda vuota la riga dei conteggi non si disegna').toBe(true);

  const vuoto = page.locator(`${PANEL} [data-coda-vuota]`);
  await expect(vuoto, 'lo stato vuoto del mockup').toHaveCount(1);
  await expect(vuoto).toBeVisible();
  // Le classi del MOCKUP: è il suo vocabolario, e le misure (330px) arrivano dalle sue regole.
  await expect(vuoto).toHaveClass(/\bempty-state\b/);
  await expect(vuoto.locator('h3')).toHaveText('Nessun download in coda.');
  await expect(vuoto.locator('p')).toHaveText('Il prossimo modello può aspettare. Oppure puoi esplorare il catalogo.');
  // L'icona del riquadro (il primo `svg`): il secondo è il «+» dentro il bottone.
  await expect(vuoto.locator('svg').first().locator('use')).toHaveAttribute('href', '#i-download');
  await expect(vuoto.locator('button')).toHaveText('Esplora il catalogo');

  /* ⛔ I COMANDI NON SI PERDONO: la riga dei conteggi è `hidden`, non rimossa — il suo bottone è
     ancora nel DOM e ancora legato (`app.js:4764` lega quel nodo all'INIZIO, quindi un nodo
     ricreato perderebbe il listener in silenzio). */
  const filtro = page.locator(`${PANEL} [data-action="soloAttivi"]`);
  await expect(filtro, 'il comando del filtro resta montato anche da vuoto').toHaveCount(1);
  await expect(filtro).toBeHidden();

  // E torna a disegnarsi appena la coda ha qualcosa.
  const dopo = await rendi(page, CODA_VIVA);
  expect(dopo.righe).toBe(1);
  expect(dopo.codaNascosta).toBe(false);
  expect(dopo.conteggiNascosti).toBe(false);
  // ⛔ Il riquadro del vuoto NON resta nel DOM mentre la coda ha le sue righe: sparisce.
  await expect(vuoto).toHaveCount(0);
  await expect(filtro).toBeVisible();
});

test('DL-CATALOGO — «Esplora il catalogo» porta al catalogo, passando dalla strada vera di app.js', async ({ page }) => {
  await apriIlLaboratorio(page);
  await rendi(page, []);

  // Si guarda la STRADA, non solo l'effetto: il clic deve finire sul comando vero del catalogo.
  const primaDelClic = await page.evaluate(() => {
    const comando = document.querySelector('#modelLabCard [data-model-lab-tab="huggingface"]');
    window.__dlComando = 0;
    comando?.addEventListener('click', () => { window.__dlComando += 1; });
    return {
      comando: Boolean(comando),
      sezioneAccesa: !document.querySelector('#modelLabCard [data-model-lab-panel="huggingface"]')?.hidden,
    };
  });
  expect(primaDelClic.comando, '⛔ il laboratorio deve avere il comando della sezione `huggingface`').toBe(true);
  expect(primaDelClic.sezioneAccesa, 'si parte dalla scheda Download: il catalogo non è ancora acceso').toBe(false);

  await page.locator(`${PANEL} [data-action="esploraCatalogo"]`).click();

  expect(await page.evaluate(() => window.__dlComando), 'il bottone preme il comando VERO, non scrive lo stato da solo').toBe(1);
  await expect(page.locator('#modelLabCard [data-lab-comandi] [data-model-lab-tab="huggingface"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#modelLabCard [data-model-lab-panel="huggingface"]')).toBeVisible();
  await expect(page.locator('#labSchedaModels'), 'il guscio segue la sezione che app.js ha acceso').toHaveAttribute('aria-selected', 'true');

  // ⛔ E IL VERSO IN CUI IL BOTTONE NON PUÒ PORTARE: senza il comando non si finge un clic.
  const fuori = await page.evaluate(() => {
    const orfano = document.createElement('div');
    orfano.innerHTML = '<div data-c="DownloadQueue"></div>';
    document.body.append(orfano);
    const bottone = window.__dl.creaStatoVuotoDownload(orfano).querySelector('button');
    const esito = { disabilitato: bottone.disabled, titolo: bottone.title, comando: window.__dl.comandoCatalogo(orfano) };
    orfano.remove();
    return esito;
  });
  expect(fuori.comando, 'senza la carta non c’è nessun comando da premere').toBeNull();
  expect(fuori.disabilitato, '⛔ un bottone che non porta da nessuna parte lo DICE, invece di inghiottire il clic').toBe(true);
  expect(fuori.titolo.length).toBeGreaterThan(0);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// La faccia PIENA: la coda vera nello stile del mockup, e i contatori che combaciano.
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('DL-CODA — la coda vera (l’elemento della 4174) nello stile del mockup, senza comandi persi', async ({ page }) => {
  await apriIlLaboratorio(page);
  const reso = await rendi(page, CODA_VIVA);
  expect(reso.righe).toBe(1);
  expect(reso.badge, 'i contatori dicono quello che c’è').toEqual(['1 completato']);

  const riga = page.locator(`${PANEL} [data-c="DownloadRow"]`);
  await expect(riga).toHaveClass(/\btalos-lab__download\b/);
  await expect(riga.locator('h3')).toHaveText('GLM-4.7-Flash-Q4_K_M.gguf');
  await expect(riga.locator('.talos-badge')).toHaveText('Completato');
  await expect(riga).toContainText('verifica del file riuscita');
  await expect(riga).toContainText('17,1 GB');
  // I comandi che esistono già: il filtro e «Vedi modello».
  await expect(page.locator(`${PANEL} [data-action="soloAttivi"]`)).toBeVisible();
  const vedi = riga.locator('[data-action="vediModello"]');
  await expect(vedi).toHaveText('Vedi modello');
  await vedi.click();
  expect(await page.evaluate(() => window.__dlSpie)).toEqual([['vediModello', CODA_VIVA[0].id]]);
});

test('DL-CONTATORI — con N righe i contatori dicono N, e col filtro acceso la riga LO DICE', async ({ page }) => {
  await apriIlLaboratorio(page);
  /* Cinque righe, una per categoria — compreso lo stato che l'app conosce e il contatore non
     nominava: `cancelled` (annullato). */
  const coda = [
    { id: 'a', state: 'running', progress: 30, bytes: 3_000_000, totalBytes: 10_000_000, request: { repo: 'Q/A', files: [{ path: 'a.gguf' }] } },
    { id: 'b', state: 'paused', progress: 10, bytes: 1_000_000, totalBytes: 10_000_000, request: { repo: 'Q/B', files: [{ path: 'b.gguf' }] } },
    { id: 'c', state: 'failed', progress: 5, bytes: 500_000, totalBytes: 10_000_000, reason: 'NETWORK', request: { repo: 'Q/C', files: [{ path: 'c.gguf' }] } },
    { id: 'd', state: 'ready', progress: 100, bytes: 10_000_000, totalBytes: 10_000_000, finishedAt: '2026-09-17T14:16:10.083Z', request: { repo: 'Q/D', files: [{ path: 'd.gguf' }] } },
    { id: 'e', state: 'cancelled', progress: 0, bytes: 0, totalBytes: 10_000_000, request: { repo: 'Q/E', files: [{ path: 'e.gguf' }] } },
  ];
  const pieno = await rendi(page, coda);

  // ⛔ LA COERENZA: la somma dei numeri dei badge è il numero delle righe disegnate.
  const somma = pieno.badge.reduce((t, b) => t + Number(String(b).split(' ')[0]), 0);
  expect(pieno.righe, 'una riga per ogni elemento della coda').toBe(5);
  expect(somma, `⛔ i contatori devono combaciare con le righe: ${pieno.badge.join(' · ')}`).toBe(pieno.righe);
  expect(pieno.badge).toEqual(['1 in corso', '1 in pausa', '1 fallito', '1 completato', '1 annullato']);
  expect(await page.evaluate((c) => window.__dl.riepilogoCoda(c).tot, coda), 'il totale del modulo è la coda, non la vista').toBe(5);

  /* ⛔ IL FILTRO ACCESO, disegnato da QUESTA corsia: si passa `soloAttivi` e si guarda cosa esce.
     (Prima qui si premeva il bottone e si leggeva l'etichetta: ma l'etichetta la scrive anche il
     pacchetto dell'app — la misura sarebbe passata anche col mio codice muto. Il clic dell'utente
     si prova più sotto, dove si guarda una cosa che solo l'app può fare.) */
  await page.evaluate((c) => {
    const panel = document.querySelector('#modelLabCard [data-model-lab-panel="downloads"]');
    window.__dl.aggiornaCodaDownload(panel, c, { soloAttivi: true, stime: new Map(), azioni: {} });
  }, coda);
  await expect(page.locator(`${PANEL} [data-action="soloAttivi"]`)).toHaveText('Mostra tutti');
  const filtrato = await page.evaluate(() => {
    const panel = document.querySelector('#modelLabCard [data-model-lab-panel="downloads"]');
    const nota = panel.querySelector('[data-coda-nota]');
    return {
      righe: panel.querySelectorAll('[data-c="DownloadRow"]').length,
      stati: [...panel.querySelectorAll('[data-c="DownloadRow"]')].map((r) => r.dataset.state),
      nota: nota?.textContent ?? null,
      ruolo: nota?.getAttribute('role') ?? null,
      atomica: nota?.getAttribute('aria-atomic') ?? null,
      nascosta: nota?.hidden ?? null,
      badge: [...panel.querySelectorAll('.talos-count [data-c="Badge"]')].map((b) => b.textContent.trim()),
    };
  });
  expect(filtrato.righe, 'il filtro «solo attivi» lascia le tre che lavorano').toBe(3);
  expect(filtrato.stati).toEqual(['running', 'paused', 'failed']);
  expect(filtrato.nota, '⛔ coi contatori che parlano di tutta la coda, la riga deve dire quanta ne mostra').toBe('Mostrati 3 di 5');
  expect(filtrato.ruolo, 'il conteggio è un messaggio di stato (WCAG 4.1.3)').toBe('status');
  expect(filtrato.atomica, 'e si annuncia intero, non solo il numero cambiato').toBe('true');
  expect(filtrato.nascosta, '⛔ la regione viva non si nasconde con `display:none`: sparirebbe anche dall’albero di accessibilità').toBe(false);
  // I contatori NON cambiano significato col filtro: descrivono la coda.
  expect(filtrato.badge).toEqual(pieno.badge);

  // E senza filtro la nota tace: non si annuncia un numero che non serve.
  await rendi(page, coda);
  expect(await page.evaluate(() => document.querySelector('[data-coda-nota]')?.textContent ?? null)).toBe('');
  await expect(page.locator(`${PANEL} [data-action="soloAttivi"]`)).toHaveText('Mostra solo attivi');

  /* ⛔ IL COMANDO VERO È ANCORA VIVO SUL SUO NODO. `app.js` lega il listener al bottone ALL'INIZIO:
     un bottone ricreato (per esempio ridisegnando la riga dei conteggi) perderebbe il legame in
     silenzio, e il clic dell'utente non farebbe più niente. Qui si mette un marcatore nella coda,
     si preme il bottone che l'app ha legato, e si guarda una cosa che SOLO l'app può fare:
     ridisegnare la coda. Se il legame fosse perso, il marcatore resterebbe lì. */
  await page.evaluate(() => {
    const coda = document.querySelector('#modelLabCard [data-model-lab-panel="downloads"] [data-c="DownloadQueue"]');
    const marcatore = document.createElement('p');
    marcatore.dataset.marcatore = '';
    marcatore.textContent = 'marcatore';
    coda.append(marcatore);
  });
  await expect(page.locator(`${PANEL} [data-marcatore]`)).toHaveCount(1);
  await page.locator(`${PANEL} [data-action="soloAttivi"]`).click();
  await expect(page.locator(`${PANEL} [data-marcatore]`), '⛔ il clic dell’utente è arrivato all’app: la coda è stata ridisegnata').toHaveCount(0);
});

test('DL-PERCENTO — la percentuale solo se si sa calcolare: senza totale la barra è indeterminata, mai 0%', async ({ page }) => {
  await apriIlLaboratorio(page);
  /* ⛔ Il caso che il server PUÒ dare: `status()` restituisce `request.bytes` come `totalBytes`, e
     un record recuperato dal manifest può non averlo. `progress` assente + totale assente = non si
     sa nulla dell'avanzamento: l'unica risposta onesta è «non misurabile». */
  await rendi(page, [{ id: 'x', state: 'running', bytes: 1_500_000_000, repo: 'Q/X', file: 'x.gguf' }]);
  const misure = await page.evaluate(() => {
    const barra = document.querySelector('#modelLabCard [data-model-lab-panel="downloads"] progress');
    const riga = document.querySelector('#modelLabCard [data-model-lab-panel="downloads"] [data-c="DownloadRow"]');
    return {
      haValue: barra.hasAttribute('value'),
      massimo: barra.getAttribute('max'),
      etichetta: barra.getAttribute('aria-label'),
      testo: riga.innerText.replace(/\s+/gu, ' ').trim(),
      indeterminata: barra.matches(':indeterminate'),
    };
  });
  expect(misure.haValue, '⛔ senza `value` la barra è indeterminata (MDN): è l’unico modo di dirlo').toBe(false);
  expect(misure.massimo, 'il massimo resta dichiarato').toBe('100');
  expect(misure.indeterminata).toBe(true);
  expect(misure.testo, '⛔ nessun `0%` su un dato che il server non ha dichiarato').not.toContain('0%');
  expect(misure.testo).toContain('1,4 GB ricevuti · totale non dichiarato dal server');
  expect(misure.etichetta).toContain('avanzamento non misurabile');

  // AL CONTRARIO: col totale dichiarato la barra torna determinata e il numero si vede.
  await rendi(page, [{ id: 'y', state: 'running', progress: 64, bytes: 5_400_000_000, totalBytes: 8_500_000_000, repo: 'Q/Y', file: 'y.gguf' }]);
  const determinata = await page.evaluate(() => {
    const barra = document.querySelector('#modelLabCard [data-model-lab-panel="downloads"] progress');
    const riga = document.querySelector('#modelLabCard [data-model-lab-panel="downloads"] [data-c="DownloadRow"]');
    return { value: barra.getAttribute('value'), indeterminata: barra.matches(':indeterminate'), testo: barra.textContent, misure: riga.innerText.replace(/\s+/gu, ' ').trim() };
  });
  expect(determinata.value).toBe('64');
  expect(determinata.indeterminata).toBe(false);
  expect(determinata.testo).toBe('64%');
  expect(determinata.misure).toContain('64% · 5 di 7,9 GB');
});

test('DL-ETICHETTA — «Riprendi» dove il trasporto riprende: stessa parola per la stessa azione, e lo stop sempre visibile', async ({ page }) => {
  await apriIlLaboratorio(page);
  await rendi(page, [{ id: 'f', state: 'failed', progress: 15, bytes: 1_200_000_000, totalBytes: 8_100_000_000, reason: 'NETWORK', startedAt: '2026-09-05T10:30:00.000Z', request: { repo: 'C/G', files: [{ path: 'g.gguf' }] } }]);
  const riga = page.locator(`${PANEL} [data-c="DownloadRow"]`);
  await expect(riga.locator('.talos-check-card b')).toHaveText('La connessione si è interrotta');

  const azione = riga.locator('[data-action="riprendiDownload"]');
  await expect(azione, '⛔ il trasporto RIPRENDE: l’etichetta dice «Riprendi», non «Riprova» (un lavoro nuovo sarebbe un’altra riga)').toHaveText('Riprendi');
  await azione.click();
  expect(await page.evaluate(() => window.__dlSpie), 'e riprende QUELL’id: la riga non si sostituisce').toEqual([['riprendi', 'f']]);
  await expect(riga, 'la riga resta una sola: il ritentativo non ne apre una seconda').toHaveCount(1);

  /* ⛔ «ANNULLA» SU UNA RIGA FALLITA È UN COMANDO CHE IL TRASPORTO RIFIUTA
     (`hf-direct-transfer.mjs:95`: `cancel` vale su `ready|failed|cancelled` NO). Trovato guardando
     la foto della coda lunga. */
  await expect(riga.locator('[data-action="annulla"]'), 'niente stop dove il trasporto lo rifiuta').toHaveCount(0);

  /* ⛔ E DOVE INVECE SI PUÒ FERMARE, IL COMANDO SI VEDE SEMPRE — non al passaggio del mouse: si
     guarda la geometria senza aver mai mosso il puntatore sulla riga. */
  await rendi(page, [{ id: 'v', state: 'running', progress: 30, bytes: 3_000_000_000, totalBytes: 10_000_000_000, request: { repo: 'Q/V', files: [{ path: 'v.gguf' }] } }]);
  const viva = page.locator(`${PANEL} [data-c="DownloadRow"]`);
  const stop = viva.locator('[data-action="annulla"]');
  await expect(stop).toHaveCount(1);
  await expect(stop).toBeVisible();
  expect(await stop.evaluate((n) => {
    const s = getComputedStyle(n);
    return { opacita: s.opacity, visibilita: s.visibility, riquadro: n.getBoundingClientRect().height > 0 };
  })).toEqual({ opacita: '1', visibilita: 'visible', riquadro: true });

  // Una riga ANNULLATA non offre più niente da annullare: la sua ora è passata.
  await rendi(page, [{ id: 'x', state: 'cancelled', progress: 3, bytes: 200_000_000, totalBytes: 6_000_000_000, reason: 'CANCELLED', request: { repo: 'Q/X', files: [{ path: 'x.gguf' }] } }]);
  await expect(page.locator(`${PANEL} [data-action="annulla"]`), 'su una riga annullata non c’è niente da annullare').toHaveCount(0);
  await expect(page.locator(`${PANEL} [data-c="DownloadRow"] .talos-badge`)).toHaveText('Annullato');

  // La stessa parola sulla riga in pausa: «Riprendi» è UN nome per UNA azione.
  await rendi(page, [{ id: 'p', state: 'paused', progress: 20, bytes: 2_000_000, totalBytes: 10_000_000, reason: 'PAUSED_BY_OWNER', request: { repo: 'Q/P', files: [{ path: 'p.gguf' }] } }]);
  const pausa = page.locator(`${PANEL} [data-c="DownloadRow"]`);
  await expect(pausa.locator('[data-action="riprendi"]')).toHaveText('Riprendi');
  await expect(pausa.locator('[data-action="pausa"]'), 'un interruttore solo per riga, non due bottoni').toHaveCount(0);
});

test('DL-ERRORE — l’errore non sopravvive a un ripristino riuscito, e un finito resta in coda', async ({ page }) => {
  await apriIlLaboratorio(page);
  const fallito = { id: 'r', state: 'failed', progress: 15, bytes: 1_200_000_000, totalBytes: 8_100_000_000, reason: 'NETWORK', request: { repo: 'C/R', files: [{ path: 'r.gguf' }] } };
  await rendi(page, [fallito]);
  await expect(page.locator(`${PANEL} .talos-check-card`)).toHaveCount(1);
  await expect(page.locator(PANEL)).toContainText('Ricevuti 1,1 GB');

  // Lo stesso trasferimento, riuscito: la scheda d'errore e il suo testo NON restano a schermo.
  await rendi(page, [{ ...fallito, state: 'ready', progress: 100, bytes: 8_100_000_000, finishedAt: '2026-09-19T09:10:00.000Z' }]);
  const dopo = await page.evaluate(() => {
    const panel = document.querySelector('#modelLabCard [data-model-lab-panel="downloads"]');
    return { errori: panel.querySelectorAll('.talos-check-card').length, testo: panel.innerText.replace(/\s+/gu, ' ').trim() };
  });
  expect(dopo.errori, '⛔ l’errore non sopravvive al ripristino').toBe(0);
  expect(dopo.testo).not.toContain('non è ancora disponibile');
  expect(dopo.testo).toContain('verifica del file riuscita');

  /* La voce FINITA resta montata: è la storia, ed è la via di recupero (ricerca della fase). E il
     filtro «solo attivi» la nasconde senza distruggerla — «Mostra tutti» la riporta. */
  const riuscito = { ...fallito, state: 'ready', progress: 100, bytes: 8_100_000_000, finishedAt: '2026-09-19T09:10:00.000Z' };
  await rendi(page, [riuscito], { soloAttivi: true });
  const filtrato = await page.evaluate(() => {
    const panel = document.querySelector('#modelLabCard [data-model-lab-panel="downloads"]');
    return { righe: panel.querySelectorAll('[data-c="DownloadRow"]').length, testo: panel.innerText.replace(/\s+/gu, ' ').trim() };
  });
  expect(filtrato.righe).toBe(0);
  expect(filtrato.testo).toContain('Nessun download attivo. I download finiti restano nella coda: «Mostra tutti» li riporta.');
  await rendi(page, [riuscito]);
  await expect(page.locator(`${PANEL} [data-c="DownloadRow"]`)).toHaveCount(1);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Le tre righe del mockup non si sono mosse: è il caso che il cancello dei componenti confronta.
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('DL-MOCKUP — le tre righe della fixture rendono ancora il markup del mockup, e il punto di innesco è quello vero', async ({ browser, page }) => {
  /* ⛔ QUESTA È LA GUARDIA DEL CANCELLO `COMP CodaDownload` (`tests/parity/componenti.spec.mjs`):
     confronta `struttura` e `testi` di `[data-c="DownloadQueue"]` fra il riferimento statico
     (`mockup/talos-mockup.html`) e le tre righe che il laboratorio rende dalle stesse fixture.
     Si fa QUI, e sull'elemento della CODA e non su tutto il pannello, perché il pannello ha perso la
     testata «Download» per una decisione dell'owner del 18/09 («ogni sezione ha due titoli»), e
     quella riga non è di questa corsia: è una misura STRETTA sull'oggetto che questa corsia tocca. */
  await apriIlLaboratorio(page);
  await rendi(page, DOWNLOAD, { stime: Object.fromEntries(STIME_DOWNLOAD), senzaAzioni: true });

  const riferimento = await apriRiferimento(browser, MOCKUP, { viewport: { width: 1440, height: 900 } });
  try {
    /* ⛔ Il pannello del riferimento si MOSTRA prima di misurarlo: su un elemento non disegnato
       `innerText` ripiega su `textContent`, che non mette uno spazio fra i nodi, e il confronto
       delle parole diventerebbe un confronto fra due normalizzazioni diverse. */
    await riferimento.pagina.evaluate(() => {
      for (const s of document.querySelectorAll('[id^="schermo"]')) s.hidden = s.id !== 'schermoModelLab';
      for (const n of document.querySelectorAll('#schermoModelLab [role="tabpanel"]')) n.hidden = n.id !== 'panel-download';
    });
    const atteso = {
      struttura: await struttura(riferimento.pagina, '#panel-download [data-c="DownloadQueue"]'),
      testi: await testi(riferimento.pagina, '#panel-download [data-c="DownloadQueue"]'),
    };
    const reso = {
      struttura: await struttura(page, `${PANEL} [data-c="DownloadQueue"]`),
      testi: await testi(page, `${PANEL} [data-c="DownloadQueue"]`),
    };
    await mkdir(FOTO, { recursive: true });
    await writeFile(resolve(FOTO, 'confronto-mockup.json'), JSON.stringify({
      atteso, reso,
      uguali: {
        struttura: JSON.stringify(atteso.struttura) === JSON.stringify(reso.struttura),
        testi: atteso.testi === reso.testi,
      },
    }, null, 2));
    expect(reso.struttura, `le tre righe devono restare quelle del mockup — vedi ${resolve(FOTO, 'confronto-mockup.json')}`).toEqual(atteso.struttura);
    /* ⛔ LE PAROLE, con UNA sola divergenza dichiarata: il riferimento statico chiama «Riprova»
       l'azione che il trasporto RIPRENDE (e che il mockup interattivo, la riga in pausa e questa
       corsia chiamano «Riprendi»). La sostituzione è scritta qui, una volta, e tutto il resto del
       testo resta sorvegliato: qualunque altra parola che cambia diventa rossa. */
    expect(reso.testi, '⛔ le parole delle tre righe — vedi il confronto scritto su disco').toBe(atteso.testi.replace('Riprova', 'Riprendi'));

    /* ⛔ DIAGNOSI, e NON è un'asserzione — di proposito. Il cancello `COMP CodaDownload` confronta
       l'INTERO `#panel-download`: qui si misura di quanto differisce oggi, e si scrive su disco,
       perché la differenza NON è di questa corsia: il pannello ha perso la testata «Download» +
       «Una coda per tutti i modelli…» per la decisione dell'owner del 18/09 («ogni sezione ha due
       titoli: levateli»), e il riferimento statico la porta ancora. Renderlo un'asserzione
       significherebbe una prova rossa per una riga che non è mia; non misurarlo significherebbe
       non sapere se il cancello morde per me o per l'altra mano. */
    const pannelloAtteso = { struttura: await struttura(riferimento.pagina, '#panel-download'), testi: await testi(riferimento.pagina, '#panel-download') };
    const pannelloReso = { struttura: await struttura(page, PANEL), testi: await testi(page, PANEL) };
    await writeFile(resolve(FOTO, 'diagnosi-pannello.json'), JSON.stringify({
      nota: 'confronto dell’INTERO #panel-download fra mockup/talos-mockup.html e il pannello vivo, reso dalle fixture. Non asserito: la testata «Download» manca per la decisione dell’owner del 18/09.',
      strutturaUguale: JSON.stringify(pannelloAtteso.struttura) === JSON.stringify(pannelloReso.struttura),
      testiUguali: pannelloAtteso.testi === pannelloReso.testi,
      soloNelMockup: pannelloAtteso.struttura.filter((v) => !pannelloReso.struttura.includes(v)),
      soloNellApp: pannelloReso.struttura.filter((v) => !pannelloAtteso.struttura.includes(v)),
      testi: { mockup: pannelloAtteso.testi, app: pannelloReso.testi },
    }, null, 2));
  } finally {
    await riferimento.contesto.close();
  }

  /* ⛔ IL PUNTO DI INNESCO NEL PRODOTTO: la funzione di questa corsia è quella che l'app chiama,
     con quel pannello e quegli argomenti. Se qualcuno la sostituisce, questa riga si rompe. */
  const app = await readFile(SORGENTE_APP, 'utf8');
  expect(app, 'app.js — chi disegna la coda chiama questa funzione sul pannello vero').toContain('aggiornaCodaDownload(panel, state.modelLab.downloads');
  expect(app, 'app.js — il filtro è legato al NODO, quindi il nodo non si ricrea').toContain('#modelLabDownloadsPanel [data-action="soloAttivi"]');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Le foto: i due temi a 1024 e a 1440, vuota e piena.
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('DL-FOTO — lo stato vuoto e la coda piena nei due temi a 1024 e 1440, e la misura dello stato vuoto', async ({ browser }, testInfo) => {
  const base = (testInfo.project.use.baseURL || 'http://127.0.0.1:4176/').replace(/\/+$/, '');
  const host = new URL(base).port;
  const cartella = resolve(FOTO, host === '4174' ? 'sul-4174' : `banco-${host}`);
  await mkdir(cartella, { recursive: true });
  const righe = [];
  for (const [larghezza, altezza] of [[1024, 800], [1440, 900]]) {
    for (const modo of ['dark', 'light']) {
      // Un contesto nuovo per ogni combinazione: tema, viewport e pagina non si ereditano a metà.
      const contesto = await browser.newContext({ viewport: { width: larghezza, height: altezza }, colorScheme: modo, locale: 'it-IT' });
      const page = await contesto.newPage();
      try {
        const { fermati } = await apriIlLaboratorio(page, { colorMode: modo, dove: base });
        await rendi(page, []);
        await page.locator('#modelLabCard').scrollIntoViewIfNeeded();
        await page.locator(PANEL).screenshot({ path: resolve(cartella, `vuota-${modo}-${larghezza}x${altezza}.png`) });
        await page.screenshot({ path: resolve(cartella, `vuota-${modo}-${larghezza}x${altezza}-schermo.png`) });
        /* ⛔ La misura dello stato vuoto si PRENDE e si SCRIVE, non si deduce dalla foto: il mockup
           lo disegna 1122×330 con le sue regole, che stanno in `src/styles/` (chieste
           all'orchestratore con la consegna di questa corsia). */
        const misura = await page.evaluate(() => {
          const n = document.querySelector('#modelLabCard [data-model-lab-panel="downloads"] [data-coda-vuota]');
          const r = n.getBoundingClientRect();
          const s = getComputedStyle(n);
          return { larghezza: Math.round(r.width), altezza: Math.round(r.height), minHeight: s.minHeight, bordo: s.borderTopStyle, raggio: s.borderRadius, visibile: r.height > 0 && r.width > 0 };
        });
        righe.push(`${modo} ${larghezza}x${altezza} · stato vuoto ${misura.larghezza}×${misura.altezza} · min-height=${misura.minHeight} · bordo=${misura.bordo} · raggio=${misura.raggio} · visibile=${misura.visibile} · nonGETfermati=${(fermati || []).length}`);
        await rendi(page, CODA_VIVA);
        await page.locator(PANEL).screenshot({ path: resolve(cartella, `piena-${modo}-${larghezza}x${altezza}.png`) });
        await page.screenshot({ path: resolve(cartella, `piena-${modo}-${larghezza}x${altezza}-schermo.png`) });
        await rendi(page, DOWNLOAD, { stime: Object.fromEntries(STIME_DOWNLOAD) });
        await page.locator(PANEL).screenshot({ path: resolve(cartella, `mockup-${modo}-${larghezza}x${altezza}.png`) });
        /* ⛔ GLI STATI CHE NON AVEVO ANCORA GUARDATO: la coda mista (una riga per categoria, con
           la scheda d'errore e il badge degli annullati) e la coda FILTRATA (dove compare la nota
           «Mostrati N di M»). Un difetto di disegno si vede solo dove vive. */
        await rendi(page, CODA_MISTA);
        // ⛔ La foto deve mostrare quello che dichiara: una riga per ogni elemento della coda mista.
        await expect(page.locator(`${PANEL} [data-c="DownloadRow"]`), 'la coda mista si disegna tutta').toHaveCount(CODA_MISTA.length);
        await page.locator(PANEL).screenshot({ path: resolve(cartella, `mista-${modo}-${larghezza}x${altezza}.png`) });
        /* ⛔ La coda lunga NON entra in una foto: il pannello è alto 1275 px a 1024, la schermata
           delle Impostazioni scorre in un contenitore interno, e una cattura d'elemento non lo fa
           scorrere — il di più esce BIANCO (misurato: `documentElement.scrollHeight` = il viewport).
           ⇒ Si porta l'ULTIMA riga in vista e si rifotografa: è l'unico modo di GUARDARE la riga
           annullata invece di dedurla dal DOM. */
        await page.locator(`${PANEL} [data-c="DownloadRow"]`).last().scrollIntoViewIfNeeded();
        await page.locator(PANEL).screenshot({ path: resolve(cartella, `mista-${modo}-${larghezza}x${altezza}-fondo.png`) });
        await rendi(page, CODA_MISTA, { soloAttivi: true });
        await page.locator(PANEL).screenshot({ path: resolve(cartella, `filtrata-${modo}-${larghezza}x${altezza}.png`) });
        /* ⛔ LA FOTO DELLA CODA LUNGA NON CONTENEVA L'ULTIMA RIGA: prima di chiamarlo difetto (o di
           non chiamarlo) si misura DOVE sta quella riga — dentro il riquadro del pannello, fuori, o
           solo fuori dall'area che la cattura copre. */
        await rendi(page, CODA_MISTA);
        const ultima = await page.evaluate(() => {
          const panel = document.querySelector('#modelLabCard [data-model-lab-panel="downloads"]');
          const righe = [...panel.querySelectorAll('[data-c="DownloadRow"]')];
          const p = panel.getBoundingClientRect();
          const u = righe.at(-1).getBoundingClientRect();
          return {
            righe: righe.length,
            pannello: { alto: Math.round(p.height), scorrimento: panel.scrollHeight, cliente: panel.clientHeight, trabocca: getComputedStyle(panel).overflow },
            ultima: { alto: Math.round(u.height), dentroIlPannello: u.bottom <= p.bottom + 1 },
            finestra: { alto: innerHeight, pagina: document.documentElement.scrollHeight },
          };
        });
        righe.push(`${modo} ${larghezza}x${altezza} · coda lunga: ${JSON.stringify(ultima)}`);
        expect(fermati, '⛔ su un server vivo non deve uscire NESSUN metodo che non sia di lettura').toEqual([]);
      } finally {
        await contesto.close();
      }
    }
  }
  await writeFile(resolve(cartella, 'misure.txt'), righe.join('\n') + '\n');
  expect(righe.filter((r) => r.includes('stato vuoto')), 'una misura dello stato vuoto per ogni combinazione').toHaveLength(4);
});
