import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { activeCatalogFilters, facetCount, toggleCatalogFacet } from '../../src/domain/catalog-engine.ts';
import { capacitaDelCatalogo, SOGLIE_CONTESTO } from '../../src/components/catalogo-faccette.js';
import { filtraModelli, modelloCatalogo } from '../../src/components/catalogo-modelli.js';

/*
 * ============================================================================
 * LA BARRA A FACCETTE DEL CATALOGO — la prova della corsia 1, 18/09/2026
 * ============================================================================
 * Prova `src/components/catalogo-faccette.js` e l'anello che la lega al catalogo
 * (`src/components/catalogo-modelli.js` + `src/domain/catalog-engine.ts`) DENTRO
 * l'app VERA, per le PORTE VERE: il pulsante `Impostazioni` della barra, la
 * linguetta `Laboratorio modelli`, la linguetta `Catalogo API`, la casella di
 * ricerca `#modelLabSearch`, il select `#modelLabProviderFilter` e i clic sulle
 * faccette. Non un finto DOM, non una fixture di markup: il pannello è quello
 * che `montaCatalogoModelli` travasa da `#panel-catalogo`.
 *
 * ⛔ COME SI LANCIA (dalla cartella `harness-ui/frontend`), con un pacchetto
 *    costruito in una cartella temporanea — `assertSafeOutput` ammette
 *    `%TEMP%/talos-phase1-*` proprio per questo, e `frontend/dist` e
 *    `harness-ui/public` NON si toccano:
 *
 *      node -e "import('./scripts/build.mjs').then(m=>m.buildProduction({outputDir:process.env.TEMP+'/talos-phase1-corsia1'}))"
 *      TALOS_HARNESS_UI_TEST_PORT=4190 \
 *      TALOS_HARNESS_UI_PUBLIC_DIR="$TEMP/talos-phase1-corsia1" \
 *      npx playwright test -c playwright.config.mjs tests/browser/lab-faccette.spec.mjs
 *
 *    La porta è 4190 e non 4189 perché su 4189 c'era un server già acceso di
 *    questa stessa corsia: `webServer.reuseExistingServer` è `false`, quindi la
 *    configurazione ne avrebbe avviato un secondo in conflitto. 4190 era libera
 *    (`netstat`), e questo file non tocca né il 4174 dell'owner né il 4179/4180
 *    delle altre corsie.
 *
 * ⛔ COSA FA DIVENTARE ROSSA QUESTA PROVA, riga per riga — così si può rompere e
 *    vedere il rosso, invece di crederci:
 *   · `catalogo-modelli.js`, `barraDelPannello`: si toglie l'inserimento
 *     (`if(dove)dove.after(barra);else panel.prepend(barra);` → niente) →
 *     **FACCETTE-01** rosso (`#modelLabFacets` non è nel documento) e TUTTI gli
 *     altri rossi a cascata: la barra non c'è;
 *   · `catalogo-modelli.js`, `barraDelPannello`: si toglie la guardia
 *     `if(esistente&&esistente.aggiorna)return esistente;` → **FACCETTE-01**
 *     rosso (due barre nello stesso pannello, id duplicato);
 *   · `catalogo-faccette.js`, `gParametri`: si riporta l'ascolto da `change` a
 *     `click` → **FACCETTE-03** rosso: il clic sul TESTO di una riga accende la
 *     casella per via nativa senza produrre un clic sull'input, quindi la lista
 *     NON si filtra — cioè il filtro si accende a schermo e non nei fatti;
 *   · `catalogo-faccette.js`, `rigaValore`: si toglie `casella.disabled = true`
 *     → **FACCETTE-02** rosso: un valore a zero torna scegliibile, che è la
 *     divergenza dal prototipo che il brief ha deciso di NON seguire;
 *   · `catalogo-faccette.js`, `aggiorna`: si toglie `if (stato.filtri) filtri =
 *     stato.filtri;` → **FACCETTE-03** rosso (lo stato della barra e i filtri
 *     applicati si separano, e la barra mostra chip che non filtrano);
 *   · `catalogo-modelli.js`, `barraDelPannello`, `onCambia`: si rilegge il
 *     fornitore da `ultimo.opzioni` invece che dal SELECT → **FACCETTE-04**
 *     rosso: togliendo il chip del fornitore la lista resta filtrata mentre il
 *     select dice «Tutti i fornitori».
 *
 * ⛔ I LIMITI DICHIARATI, che questa prova NON copre:
 *   · il catalogo VERO (FACCETTE-06) dipende da `/api/v1/models`: se il server non
 *     risponde, quel test è rosso per la rete e non per il codice — il perché sta
 *     nel messaggio dell'asserzione;
 *   · qui NON si prova il comportamento del controllo «Calm» sulle caselle
 *     (`calm-controls.js` le veste a runtime): la prova clicca il testo della riga
 *     e la casella per via nativa. Il percorso del controllo vestito passa dallo
 *     stesso `change` — misurato e dichiarato, non provato;
 *   · il pacchetto che questa prova serve è costruito dall'ALBERO DI LAVORO: se
 *     un'altra corsia ha codice a metà in `src/`, la prova può essere rossa per
 *     quello. Nell'esecuzione del 18/09/2026 era verde.
 */

const FOTO = path.resolve(process.cwd(), 'artifacts', 'lab-faccette-2026-09-18');

/*
 * Il catalogo di prova: SEI record nella forma vera di `GET /api/v1/models`, con le
 * differenze che servono a far parlare le faccette — due fornitori con due modelli
 * ciascuno, un prezzo non dichiarato (`-1`), una stringa vuota e un `null`, un
 * contesto pari a zero, un modello senza parametri e uno con l'audio in uscita.
 * I valori sono di prova; i CAMPI sono quelli osservati il 05/09/2026.
 */
const record = (o) => ({
  id: o.id, provider: o.provider, alias: false, nome: o.nome || o.id, contextLength: o.contextLength,
  prezzoPrompt: o.prezzoPrompt, prezzoCompletion: o.prezzoCompletion,
  inputModalities: o.inputModalities || ['text'], outputModalities: o.outputModalities || ['text'],
  supportedParameters: o.supportedParameters || [], description: 'Descrizione di prova.', createdAt: 1,
});
const CATALOGO = {
  daCache: false,
  aggiornatoAlle: '2026-09-05T18:00:00.000Z',
  modelli: [
    record({ id: 'alfa/uno', provider: 'alfa', contextLength: 8192, prezzoPrompt: '0.0000008', prezzoCompletion: '0.0000016', supportedParameters: ['tools', 'reasoning', 'temperature'] }),
    record({ id: 'alfa/due', provider: 'alfa', contextLength: 200000, prezzoPrompt: '0.000003', prezzoCompletion: '0.000006', inputModalities: ['text', 'image'], supportedParameters: ['tools', 'tool_choice'] }),
    record({ id: 'beta/uno', provider: 'beta', contextLength: 131072, prezzoPrompt: '-1', prezzoCompletion: '-1', supportedParameters: ['reasoning'] }),
    record({ id: 'beta/due', provider: 'beta', contextLength: 0, prezzoPrompt: '', prezzoCompletion: null, supportedParameters: [] }),
    record({ id: 'gamma/uno', provider: 'gamma', contextLength: 65536, prezzoPrompt: '0.0000002', prezzoCompletion: '0.0000004', outputModalities: ['text', 'audio'], supportedParameters: ['response_format'] }),
    record({ id: 'gamma/due', provider: 'gamma', contextLength: 40000, prezzoPrompt: 3e-7, prezzoCompletion: 6e-7, supportedParameters: ['response_format', 'tools'] }),
  ],
};

/** Gli stessi record adattati dal NOSTRO adattatore: è la lista su cui il motore conta. */
const ADATTATI = CATALOGO.modelli.map(modelloCatalogo);
const righe = (page) => page.locator('#modelLabCatalogList [data-catalog]');

async function foto(page, nome, info) {
  await mkdir(FOTO, { recursive: true });
  await page.screenshot({ path: path.join(FOTO, `${nome}-${info.project.use.viewport.width}.png`), animations: 'disabled', fullPage: false });
}

/*
 * Apre il catalogo per le PORTE VERE. `/api/v1/models` si intercetta con la fixture:
 * gli altri indirizzi restano quelli veri del server (sono tutti locali — capacità
 * della macchina, provider configurati, runtime — quindi la prova non esce in rete).
 */
async function apriIlCatalogo(page, { colorMode = 'dark', catalogo = CATALOGO } = {}) {
  await page.route('**/api/v1/models*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: catalogo, meta: { schema: 'talos.harness-ui.api.v1' } }),
  }));
  await page.addInitScript((modo) => {
    window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({
      version: 1,
      appearance: { colorMode: modo, themePreset: 'calm', themePresetVersione: 2, uiLanguage: 'it' },
      chat: {}, workspaces: {},
    }));
  }, colorMode);
  await page.goto('/');
  const salta = page.getByRole('button', { name: 'Salta per ora', exact: true });
  if (await salta.isVisible()) await salta.click();
  await page.getByRole('button', { name: /^Impostazioni(?: \(Ctrl ,\))?$/ }).click();
  await page.getByRole('tab', { name: 'Laboratorio modelli', exact: true }).click();
  await page.locator('[data-model-lab-tab=catalog]').click();
  await expect(page.locator('#modelLabCatalogPanel')).toBeVisible();
  await expect(righe(page)).toHaveCount(catalogo.modelli.length);
}

test('FACCETTE-01 — la barra è nella carta, subito dopo la riga degli strumenti, e non si duplica', async ({ page }, info) => {
  await apriIlCatalogo(page);
  const barra = page.locator('#modelLabFacets');
  await expect(barra).toHaveCount(1);
  await expect(barra).toHaveAttribute('aria-label', 'Ricerca e filtri del catalogo');
  const dove = await barra.evaluate((el) => ({
    dentroLaCarta: Boolean(el.closest('#modelLabCatalogPanel')),
    dentroLaLista: Boolean(el.closest('[data-catalog-list]')),
    dopoLaRigaStrumenti: el.previousElementSibling?.classList.contains('talos-toolbar') ?? false,
    ordina: el.querySelector('#modelLabSort')?.options.length ?? 0,
    ambiti: [...el.querySelectorAll('[data-facet-scope] [data-facet-chip]')].map((b) => b.textContent.trim()),
  }));
  expect(dove).toEqual({
    dentroLaCarta: true,
    dentroLaLista: false,          // ⛔ se stesse DENTRO la lista, il primo ridisegno se la porterebbe via
    dopoLaRigaStrumenti: true,
    ordina: 4,                     // catalogo · nome · contesto · costo: quattro, quelli che il catalogo sostiene
    ambiti: ['Tutti 6', 'Locali 0', 'Cloud 6'],
  });
  /* Il pannello si ridisegna a ogni clic e a ogni tasto: la barra deve restare UNA. */
  await page.locator('[data-facet-group="capabilities"] [data-facet-row="tools"] span.talos-grow').click();
  await expect(righe(page)).toHaveCount(3);
  await expect(barra).toHaveCount(1);
  await foto(page, 'faccette-filtrato', info);
});

test('FACCETTE-02 — i conteggi sono quelli del MOTORE, e un valore a zero si vede ma non si sceglie', async ({ page }) => {
  await apriIlCatalogo(page);
  const aSchermo = await page.locator('[data-facet-group="capabilities"] [data-facet-row]').evaluateAll((nodi) => nodi.map((n) => ({
    valore: n.dataset.facetRow,
    conto: Number(n.querySelector('small').textContent.replace(/\./g, '')),
    zero: n.hasAttribute('data-facet-zero'),
    disabilitato: n.querySelector('input').disabled,
    etichetta: n.querySelector('span.talos-grow').textContent,
  })));
  /* ⛔ Due strade verso lo stesso numero: il motore QUI (Node) e la barra LÀ (browser).
     L'ordine è quello delle frequenze: chi usa `tools` per primo. */
  const atteso = capacitaDelCatalogo(ADATTATI).parametri.map((v) => ({
    valore: v,
    conto: facetCount(ADATTATI, {}, 'capabilities', v),
    zero: facetCount(ADATTATI, {}, 'capabilities', v) === 0,
  }));
  expect(aSchermo.map(({ valore, conto, zero, disabilitato }) => ({ valore, conto, zero, disabilitato })))
    .toEqual(atteso.map(({ valore, conto, zero }) => ({ valore, conto, zero, disabilitato: zero })));
  expect(aSchermo.map((r) => r.conto)).toEqual([3, 2, 2, 1, 1]);
  expect(aSchermo.find((r) => r.valore === 'json').etichetta).toBe('Output JSON');

  /* Il valore a zero che il catalogo di prova ha davvero: la destinazione «Locali». */
  const locali = page.locator('[data-facet-scope] [data-facet-chip="local"]');
  await expect(locali).toContainText('Locali 0');
  await expect(locali).toBeDisabled();
  await expect(locali).toHaveAttribute('title', 'Nessun modello in questo catalogo');
  await expect(locali).toBeVisible();   // visibile E non scegliibile: dice che il valore esiste

  /* E il valore a zero di una faccetta a lista, che nasce dall'AND: con «Audio» acceso
     gli altri parametri valgono zero perché nessun modello audio li dichiara. */
  await page.locator('[data-facet-group="capabilities"] [data-facet-row="audio"] span.talos-grow').click();
  await expect(righe(page)).toHaveCount(1);
  const strumenti = page.locator('[data-facet-group="capabilities"] [data-facet-row="tools"]');
  await expect(strumenti).toHaveAttribute('data-facet-zero', '');
  await expect(strumenti.locator('input')).toBeDisabled();
  await expect(strumenti.locator('small')).toHaveText('0');
  /* Il chip «Tutti» della destinazione non è invece mai a zero: è la lista senza la faccetta. */
  await expect(page.locator('[data-facet-scope] [data-facet-chip="all"]')).toContainText('1');
});

test('FACCETTE-03 — una faccetta filtra DAVVERO la lista, e toglierla la ripristina', async ({ page }) => {
  await apriIlCatalogo(page);
  /* ⛔ Il clic cade sul TESTO della riga, non sulla casella: è il percorso del `<label>`,
     che accende la casella per via nativa e NON produce un clic sull'input. */
  await page.locator('[data-facet-group="capabilities"] [data-facet-row="tools"] span.talos-grow').click();
  await expect(righe(page)).toHaveCount(3);
  await expect(page.locator('#modelLabCatalogCount')).toHaveText(/^3 di 6 modelli/);
  const fornitori = await righe(page).evaluateAll((nodi) => [...new Set(nodi.map((n) => n.dataset.provider))].sort());
  expect(fornitori).toEqual(['alfa', 'gamma']);

  /* Il filtro acceso è un CHIP vero, col nome della faccetta e del valore. */
  const chip = page.locator('[data-facet-active] [data-facet-remove][data-facet-key="capabilities"][data-facet-value="tools"]');
  await expect(chip).toHaveCount(1);
  await expect(chip).toHaveAttribute('aria-label', 'Rimuovi Capacità: Strumenti / function calling');
  await expect(page.locator('[data-facet-toggle] [data-facet-total]')).toHaveText('1');

  /* Toglierlo riporta la lista intera E il fuoco al suo posto. */
  await chip.click();
  await expect(righe(page)).toHaveCount(6);
  await expect(page.locator('[data-facet-active] [data-facet-remove]')).toHaveCount(0);
  await expect(page.locator('#modelLabSearch')).toBeFocused();

  /* E il percorso della CASELLA (non del testo) porta allo stesso risultato: stesso stato. */
  await page.locator('[data-facet-group="capabilities"] [data-facet-row="vision"] input').click();
  await expect(righe(page)).toHaveCount(1);
  await expect(page.locator('[data-facet-active] [data-facet-remove][data-facet-value="vision"]')).toHaveCount(1);
  await page.locator('[data-facet-active] [data-facet-remove="__azzera"]').click();
  await expect(righe(page)).toHaveCount(6);
});

test('FACCETTE-04 — il select del fornitore e la barra non si contraddicono', async ({ page }) => {
  await apriIlCatalogo(page);
  await expect(page.locator('#modelLabProviderFilter option')).toHaveCount(4);   // tutti + tre fornitori
  /* Il conteggio del fornitore sta nella VOCE del select, ed è il numero giusto. */
  await expect(page.locator('#modelLabProviderFilter option[value="beta"]')).toHaveText('beta (2)');
  await expect(page.locator('#modelLabProviderFilter option[value="all"]')).toHaveText('Tutti i fornitori (6)');

  await page.selectOption('#modelLabProviderFilter', 'beta');
  await expect(righe(page)).toHaveCount(2);
  const chip = page.locator('[data-facet-active] [data-facet-remove][data-facet-key="providers"]');
  await expect(chip).toHaveCount(1);
  await expect(chip).toHaveAttribute('aria-label', 'Rimuovi Provider: beta');

  /* ⛔ Il chip del fornitore deve togliere il filtro DAL SUO POSTO VERO, che è il select:
     è lì che `app.js` legge `state.modelLab.provider`. Se la lista restasse filtrata mentre
     il select dice «Tutti i fornitori», il controllo mentirebbe. */
  await chip.click();
  await expect(page.locator('#modelLabProviderFilter')).toHaveValue('all');
  await expect(righe(page)).toHaveCount(6);
  await expect(page.locator('#modelLabCatalogCount')).toHaveText(/^6 di 6 modelli/);
  await expect(page.locator('[data-facet-active] [data-facet-remove][data-facet-key="providers"]')).toHaveCount(0);
});

test('FACCETTE-05 — la ricerca resta quella dell’app, e i conteggi la seguono', async ({ page }) => {
  await apriIlCatalogo(page);
  await page.fill('#modelLabSearch', 'beta');
  await expect(righe(page)).toHaveCount(2);
  /* La ricerca dell'app cerca in nome, id E fornitore: qui prende i due record di `beta`. */
  await expect(righe(page).first()).toHaveAttribute('data-provider', 'beta');
  /* Con la ricerca accesa, il conteggio dei parametri si restringe: uno solo sopravvive. */
  const accesi = await page.locator('[data-facet-group="capabilities"] [data-facet-row]').evaluateAll((nodi) => nodi
    .filter((n) => !n.querySelector('input').disabled)
    .map((n) => n.dataset.facetRow));
  expect(accesi).toEqual(['reasoning']);
  /* Il chip della ricerca è a parte dai filtri, e si toglie da solo svuotando la casella vera. */
  const cercaChip = page.locator('[data-facet-active] [data-facet-remove-search]');
  await expect(cercaChip).toHaveAttribute('aria-label', 'Rimuovi ricerca beta');
  await expect(page.locator('[data-facet-toggle] [data-facet-total]')).toBeHidden();  // la ricerca non è un filtro contato
  await cercaChip.click();
  await expect(page.locator('#modelLabSearch')).toHaveValue('');
  await expect(righe(page)).toHaveCount(6);
  await expect(page.locator('[data-facet-active] [data-facet-remove-search]')).toHaveCount(0);
});

test('FACCETTE-06 — sul catalogo VERO la barra regge, e «Vedi altri» è un disclosure vero', async ({ page }, info) => {
  /* Senza `page.route`: si guarda il catalogo che il server ha davvero. */
  await page.addInitScript(() => {
    window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({
      version: 1, appearance: { colorMode: 'dark', themePreset: 'calm', themePresetVersione: 2, uiLanguage: 'it' }, chat: {}, workspaces: {},
    }));
  });
  await page.goto('/');
  const salta = page.getByRole('button', { name: 'Salta per ora', exact: true });
  if (await salta.isVisible()) await salta.click();
  await page.getByRole('button', { name: /^Impostazioni(?: \(Ctrl ,\))?$/ }).click();
  await page.getByRole('tab', { name: 'Laboratorio modelli', exact: true }).click();
  await page.locator('[data-model-lab-tab=catalog]').click();
  await expect(page.locator('#modelLabCatalogPanel')).toBeVisible();
  await expect(page.locator('#modelLabFacets')).toHaveCount(1);

  const quanti = await page.locator('#modelLabCatalogCount').textContent();
  expect(quanti, `il catalogo vero non è arrivato: /api/v1/models ha risposto «${quanti}»`).toMatch(/\d+ di \d+ modelli/);
  const totale = Number(quanti.match(/(\d+) di (\d+) modelli/)[2]);
  expect(totale, 'il catalogo osservato è vuoto: la prova non sta misurando niente').toBeGreaterThan(100);

  /* I ventisei parametri del catalogo vero non stanno in otto righe: il resto sta dietro
     «Vedi altri», che è un disclosure VERO (aria-expanded che cambia, contenuto `hidden`,
     etichetta che porta il NUMERO delle voci nascoste). */
  const altri = page.locator('[data-facet-group="capabilities"] [data-facet-more]');
  await expect(altri).toBeVisible();
  await expect(altri).toHaveAttribute('aria-expanded', 'false');
  await expect(altri).toHaveAttribute('aria-controls', 'modelLabFacetsAdvanced');
  const testoChiuso = await altri.textContent();
  expect(testoChiuso).toMatch(/^Vedi altri \d+ parametri$/);
  const righeChiuse = await page.locator('[data-facet-group="capabilities"] [data-facet-row]').count();
  expect(righeChiuse).toBe(8);
  await altri.click();
  await expect(altri).toHaveAttribute('aria-expanded', 'true');
  await expect(altri).toHaveText('Vedi meno parametri');
  const righeAperte = await page.locator('[data-facet-group="capabilities"] [data-facet-row]').count();
  expect(righeAperte).toBeGreaterThan(8);
  expect(righeAperte).toBe(Number(testoChiuso.match(/(\d+)/)[1]) + 8);
  /* Il pannello dei filtri avanzati è davvero nascosto quando è chiuso: non basta l'opacità. */
  await altri.click();
  await expect(altri).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#modelLabFacetsAdvanced')).toBeHidden();
  await foto(page, 'faccette-catalogo-vero', info);
});

test('FACCETTE-07 — con il tema CHIARO la barra si vede lo stesso, e non nasce nessun errore a runtime', async ({ page }, info) => {
  const errori = [];
  page.on('pageerror', (e) => errori.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errori.push('console: ' + m.text()); });
  await apriIlCatalogo(page, { colorMode: 'light' });
  await expect(page.locator('#modelLabFacets')).toHaveCount(1);
  /* Le faccette si leggono in tutti e due i temi: il testo sopra il fondo è una misura, non un'opinione. */
  const contrasto = await page.locator('#modelLabFacets').evaluate((barra) => {
    const riga = barra.querySelector('[data-facet-group="capabilities"] legend');
    const stile = getComputedStyle(riga);
    return { colore: stile.color, fondo: getComputedStyle(document.body).backgroundColor, altezza: riga.getBoundingClientRect().height };
  });
  expect(contrasto.altezza).toBeGreaterThan(0);
  expect(contrasto.colore).not.toBe(contrasto.fondo);
  await foto(page, 'faccette-tema-chiaro', info);
  expect(errori, 'errori a runtime nella pagina:\n' + errori.join('\n')).toEqual([]);
});
