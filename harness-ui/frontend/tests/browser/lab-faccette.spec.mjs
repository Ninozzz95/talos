import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { erroreDiUnaPaginaTerza } from '../../src/components/browser.js';
import { emptyCatalogFilters, facetCount } from '../../src/domain/catalog-engine.ts';
import { VOCI_VISIBILI, capacitaDelCatalogo } from '../../src/components/catalogo-faccette.js';
import { modelloCatalogo } from '../../src/components/catalogo-modelli.js';

/*
 * ============================================================================
 * LA BARRA A FACCETTE DEL CATALOGO — la prova della corsia 1, 18/09/2026
 * ============================================================================
 * Prova `src/components/catalogo-faccette.js` e l'anello che la lega al catalogo
 * (`src/components/catalogo-modelli.js` + `src/domain/catalog-engine.ts`) DENTRO
 * l'app VERA, per le PORTE VERE: il pulsante `Impostazioni` della barra, la
 * linguetta `Laboratorio modelli`, la linguetta `Modelli` del guscio, la casella
 * di ricerca `#modelLabSearch`, il select `#modelLabProviderFilter` e i clic sulle
 * faccette. Il pannello è quello che `montaCatalogoModelli` travasa da
 * `#panel-catalogo`: non un finto DOM, non una fixture di markup.
 *
 * ⛔ LA PORTA, MISURATA E NON DEDOTTA (18/09/2026, dopo il commit `513b8bed`).
 *    Il guscio a quattro schede della corsia 2 è entrato nell'app e ha cambiato la
 *    strada: la striscia legacy (`[data-model-lab-tab=catalog]`, «Catalogo API») sta
 *    in un contenitore NASCOSTO — misurato, `offsetParent === null` — e a premerla è
 *    la scheda «Modelli» del guscio (`tablist "Sezioni laboratorio modelli"`, accanto
 *    a Provider · Download · Sistema). Prima si arriva su «Sistema»; dopo il clic su
 *    «Modelli» il pannello legacy resta `offsetParent === null` ma `aria-selected`
 *    diventa `true`, `#modelLabCatalogPanel` diventa visibile e la barra è dentro.
 *    ⇒ La catena di questo file è la porta di OGGI. Chi la rompe la rimisura, non la
 *    aggiusta a occhio: le prove che cliccano `[data-model-lab-tab=catalog]` non
 *    funzionano più perché quel nodo non è più cliccabile.
 *
 * ⛔ IL SELECT DEL FORNITORE È VESTITO DA «CALM»: il nodo vero ha `data-calm-source`,
 *    `aria-hidden="true"`, `tabindex="-1"` e NON è visibile — sopra c'è un
 *    `span.calm-control--select` con un pulsante. `page.selectOption` pretende un
 *    elemento visibile, quindi si passa `{ force: true }`: è esattamente il select
 *    che `app.js` legge, e `calm-controls.js` osserva le sue proprietà
 *    (`watchProperty` su `value`/`selectedIndex`) e rispecchia l'etichetta.
 *    Il percorso che un dito fa davvero — aprire il dropdown vestito — è di un'altra
 *    superficie e non è compito di questa corsia: si DICHIARA, non si finge.
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
 * ⛔ COSA FA DIVENTARE ROSSA QUESTA PROVA, riga per riga — così si può rompere e
 *    vedere il rosso, invece di crederci.
 *    ⛔ I NUMERI QUI SOTTO SONO MISURATI, NON PREVISTI: ogni ricetta è stata scritta
 *    sul sorgente, la prova rilanciata INTERA (7 test, porta 4207), il sorgente
 *    ripristinato e il pacchetto ricostruito. La PRIMA stesura di questo elenco era
 *    di previsioni e due ricette su sette NON mordevano: stanno in fondo, dichiarate.
 *    Fonte del metodo: CircleCI, «What is mutation testing?» (letto il 18/09/2026) e
 *    LMAX, «Finding Your Missing Tests With Mutation Testing» (letto il 18/09/2026) —
 *    un mutante che SOPRAVVIVE non è di per sé un test mancante (può essere
 *    equivalente), e un «N rossi» aggregato non attribuisce il morso al singolo test.
 *    ⇒ Si misura QUALI test diventano rossi, e si dichiara quando una ricetta non morde.
 *   · R1 — `catalogo-modelli.js`, `barraDelPannello`: si toglie l'inserimento
 *     (`if(dove)dove.after(barra);else panel.prepend(barra);` → niente)
 *     → **7 failed | 0 passed**: FACCETTE-01 e TUTTI gli altri a cascata — la barra
 *     non c'è (`#modelLabFacets` assente dal documento);
 *   · R1b — `catalogo-modelli.js`, `barraDelPannello`: si toglie la guardia
 *     `if(esistente&&esistente.aggiorna)return esistente;`
 *     → **5 failed | 2 passed**: FACCETTE-01…05 (due barre nello stesso pannello,
 *     id duplicato; 06 e 07 restano verdi: il catalogo vero e il tema non contano
 *     quante barre ci sono);
 *   · R2 — `catalogo-faccette.js`, `rigaValore`: si toglie `casella.disabled = true`
 *     → **2 failed | 5 passed**: FACCETTE-02 (un valore a zero torna scegliibile — la
 *     divergenza dal prototipo che il brief ha deciso di NON seguire) e FACCETTE-05;
 *   · R3 — `catalogo-faccette.js`, `gParametri`: si riporta l'ascolto da `change` a
 *     `click` → **3 failed | 4 passed**: FACCETTE-01, 02, 03. Il clic sul TESTO di una
 *     riga accende la casella per via nativa senza produrre un clic sull'input, quindi
 *     la lista NON si filtra — il filtro si accende a schermo e non nei fatti;
 *   · R4a — `catalogo-modelli.js:142`: si toglie il ridisegno dopo il cambio
 *     → **3 failed | 4 passed**: FACCETTE-01, 02, 03. La riga è portante sul cammino
 *     della CASELLA e del CHIP, dove il select non cambia;
 *   · R4b — `catalogo-modelli.js:133`: il chip non riscrive il select e non emette
 *     `change` → **1 failed | 6 passed**: FACCETTE-04 da solo. È QUESTA la riga che
 *     tiene allineati chip e select;
 *   · R5 — `catalogo-faccette.js`: si toglie `evento.stopPropagation()`
 *     → **5 failed | 2 passed**: FACCETTE-01, 02, 03, 06, 07 — NON «tutti». La regia
 *     del mockup (`src/legacy/app.js:22339`) riporta indietro `aria-expanded` 3 ms
 *     dopo di noi: misurato il 18/09/2026, `false → true` a 22 ms e `true → false` a
 *     25 ms. In `apriIFiltri` — l'elenco NON filtrato — la barra resta viva: è per
 *     questo che il rosso non è generale;
 *   · R6c — `catalogo-faccette.js`: `aria-expanded` tolto da ENTRAMBI i posti
 *     (creazione `:158` e aggiornamento `:373`) → **1 failed | 6 passed**:
 *     FACCETTE-06 — il disclosure non annuncia il proprio stato;
 *   · R7 — `catalogo-faccette.js`: `VOCI_VISIBILI = 2`, così il ramo `nascoste > 0`
 *     viene DAVVERO eseguito (col catalogo vero non succede: 5 valori < 8)
 *     → **3 failed | 4 passed**: FACCETTE-02, 03, 05, con **FACCETTE-06 VERDE** — il
 *     ramo dormiente si disegna sano;
 *   · R7b — R7 **e** via `aggiorna()` dal clic di «Vedi altri» (`catalogo-faccette.js:297`)
 *     → **4 failed | 3 passed**: FACCETTE-02, 03, 05 **e 06**. ⇒ la copertura del ramo
 *     dormiente è reale, e il suo morso passa dal clic di «Vedi altri».
 *
 * ⛔ LE DUE RICETTE CHE NON MORDONO — misurate, e dichiarate qui perché nessuno le
 *    creda per buone (erano nell'elenco delle previsioni, al posto di R4b e R6c):
 *   · R4 — `catalogo-modelli.js`, `onCambia`: si rilegge il fornitore da
 *     `ultimo.opzioni` invece che dal SELECT → **7 passed**: sul cammino di
 *     FACCETTE-04 le due sorgenti COINCIDONO (è il chip a scrivere il select),
 *     quindi il mutante è equivalente e non prova niente;
 *   · R6 — `catalogo-faccette.js:158`: si toglie `aria-expanded` SOLO dalla creazione
 *     → **7 passed**: `aggiorna()` lo riscrive a `:373` a ogni passata, quindi la
 *     scrittura in creazione è ridondante. Mordere richiede di toglierli entrambi (R6c).
 *   ⇒ Chi vuole rompere questa prova passi da R1b, R4b, R6c e R7b: sono le quattro che
 *     mordono UNA prova sola per volta, e dicono quale.
 *
 * ⛔ I LIMITI DICHIARATI, che questa prova NON copre:
 *   · il catalogo VERO (FACCETTE-06) dipende da `/api/v1/models`: se il server non
 *     risponde, quel test è rosso per la rete e non per il codice — il perché sta
 *     nel messaggio dell'asserzione;
 *   · il percorso del controllo «Calm» è provato sulla CASELLA (FACCETTE-03 clicca
 *     `button.calm-check`, il controllo che sta a schermo) e sul SELECT solo per via
 *     diretta con `{ force: true }`: aprire il dropdown VESTITO — il gesto che un dito
 *     fa davvero sul fornitore — è di un'altra superficie e non è compito di questa
 *     corsia. Si dichiara, non si finge;
 *   · il pacchetto servito è costruito dall'ALBERO DI LAVORO: se un'altra corsia ha
 *     codice a metà in `src/`, la prova può essere rossa per quello.
 */

const FOTO = path.resolve(process.cwd(), 'artifacts', 'lab-faccette-2026-09-18');

/*
 * Il catalogo di prova: SEI record nella forma vera di `GET /api/v1/models`, con le
 * differenze che servono a far parlare le faccette — tre fornitori da due modelli,
 * un prezzo non dichiarato (`-1`), una stringa vuota e un `null`, un contesto pari a
 * zero, un modello senza parametri e uno con l'audio in uscita, e due modelli con
 * `response_format` (che nel vocabolario del motore è «Output JSON»).
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

/**
 * Apre il catalogo per le PORTE VERE. `/api/v1/models` si intercetta con la fixture: gli
 * altri indirizzi restano quelli veri del server (sono tutti locali — capacità della
 * macchina, provider configurati, runtime — quindi la prova non esce in rete).
 */
async function apriCatalogo(page, { colorMode = 'dark', catalogo = CATALOGO } = {}) {
  await page.route('**/api/v1/models*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: catalogo, meta: { schema: 'talos.harness-ui.api.v1' } }),
  }));
  await page.addInitScript((modo) => {
    /* `addInitScript` gira in OGNI cornice, comprese quelle `sandbox` che ospitiamo: lì
       `localStorage` lancia. La preferenza serve solo alla nostra origine. */
    try {
      window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({
        version: 1,
        appearance: { colorMode: modo, themePreset: 'calm', themePresetVersione: 2, uiLanguage: 'it' },
        chat: {}, workspaces: {},
      }));
    } catch { /* cornice ospitata: non è la nostra pagina e non ha preferenze da leggere */ }
  }, colorMode);
  await page.goto('/');
  const salta = page.getByRole('button', { name: 'Salta per ora', exact: true });
  if (await salta.isVisible()) await salta.click();
  await page.getByRole('button', { name: /^Impostazioni(?: \(Ctrl ,\))?$/ }).click();
  await page.getByRole('tab', { name: 'Laboratorio modelli', exact: true }).click();
  /* La scheda del GUSCIO: è quella che preme la linguetta legacy (vedi l'intestazione). */
  await page.getByRole('tab', { name: 'Modelli', exact: true }).click();
  await expect(page.locator('#modelLabCatalogPanel')).toBeVisible();
  await expect(righe(page)).toHaveCount(catalogo.modelli.length);
}

/**
 * I gruppi delle faccette (Contesto · Parametri · Costo · Dati non dichiarati) stanno dentro
 * `#modelLabFacetsAdvanced`, che nasce `hidden` — misurato il 18/09/2026: le righe esistono nel
 * documento ma non sono disegnate, e un `click` su di loro scade in timeout. È il disclosure del
 * mockup: la barra resta una riga, e il piano dei filtri si apre con «Tutti i filtri», che porta
 * addosso il numero dei filtri accesi. Questa è la porta, non una scorciatoia.
 */
async function apriIFiltri(page) {
  const apri = page.locator('[data-facet-toggle]');
  if ((await apri.getAttribute('aria-expanded')) !== 'true') await apri.click();
  await expect(apri).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#modelLabFacetsAdvanced')).toBeVisible();
  /* ⛔⛔ LA PROVA CHE MORDE, e nasce da un difetto vero — misurato il 18/09/2026.
     `aria-expanded` + `aria-controls` mettono il pulsante nel mirino della REGIA del mockup
     (`src/legacy/app.js:22339`): un ascoltatore sul DOCUMENTO che tratta ogni elemento con
     quella coppia come una disclosure e la inverte da sé. Con due proprietari il clic non apre
     niente: la sonda `%TEMP%/corsia1-probe/toggle3.mjs` — che registra chi scrive e con quale
     pila — ha misurato `aria-expanded: false → true` a 22 ms (noi) e `true → false` a 25 ms
     (la regia), con l'etichetta che diceva «Meno filtri» e il pannello chiuso. Un interruttore
     INERTE: non un errore, un comando che non fa niente.
     ⇒ Qui lo stato si guarda nel TEMPO, non nell'istante del clic: è l'unica forma che
     distingue «aperto» da «aperto e richiuso da qualcun altro». */
  await page.waitForTimeout(250);
  await expect(apri, 'il pannello si è richiuso da solo: un altro proprietario tocca questo disclosure?').toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#modelLabFacetsAdvanced')).toBeVisible();
}

/** Gli errori che la NOSTRA pagina ha davvero alzato, con lo scarto del progetto per i terzi. */
function erroriNostri(page, raccolti) {
  const cornici = page.frames().map((f) => f.url());
  return raccolti.filter((e) => !erroreDiUnaPaginaTerza(e, cornici, page.url()).terzo);
}

test('FACCETTE-01 — la barra è nella carta, subito dopo la riga degli strumenti, e non si duplica', async ({ page }, info) => {
  await apriCatalogo(page);
  const barra = page.locator('#modelLabFacets');
  await expect(barra).toHaveCount(1);
  await expect(barra).toHaveAttribute('aria-label', 'Ricerca e filtri del catalogo');
  const dove = await barra.evaluate((el) => ({
    dentroLaCarta: Boolean(el.closest('#modelLabCatalogPanel')),
    dentroLaLista: Boolean(el.closest('[data-catalog-list]')),
    dopoLaRigaStrumenti: el.previousElementSibling?.classList.contains('talos-toolbar') ?? false,
    ordina: el.querySelector('#modelLabSort')?.options.length ?? 0,
    // Il conto sta in un `talos-badge` dentro il chip: `textContent` è «Tutti6», senza spazio.
    ambiti: [...el.querySelectorAll('[data-facet-scope] [data-facet-chip]')].map((b) => b.textContent.replace(/\s+/g, '')),
  }));
  expect(dove).toEqual({
    dentroLaCarta: true,
    dentroLaLista: false,          // ⛔ se stesse DENTRO la lista, il primo ridisegno se la porterebbe via
    dopoLaRigaStrumenti: true,
    ordina: 4,                     // catalogo · nome · contesto · costo: quattro, quelli che il catalogo sostiene
    ambiti: ['Tutti6', 'Locali0', 'Cloud6'],
  });
  /* Il pannello si ridisegna a ogni clic e a ogni tasto: la barra deve restare UNA. */
  await apriIFiltri(page);
  await page.locator('[data-facet-group="capabilities"] [data-facet-row="tools"] span.talos-grow').click();
  await expect(righe(page)).toHaveCount(3);
  await expect(barra).toHaveCount(1);
  await foto(page, 'faccette-filtrato', info);
});

test('FACCETTE-02 — i conteggi sono quelli del MOTORE, e un valore a zero si vede ma non si sceglie', async ({ page }) => {
  await apriCatalogo(page);
  const aSchermo = await page.locator('[data-facet-group="capabilities"] [data-facet-row]').evaluateAll((nodi) => nodi.map((n) => ({
    valore: n.dataset.facetRow,
    conto: Number(n.querySelector('small').textContent.replace(/\./g, '')),
    zero: n.hasAttribute('data-facet-zero'),
    disabilitato: n.querySelector('input').disabled,
    etichetta: n.querySelector('span.talos-grow').textContent,
  })));
  /* ⛔ Due strade verso lo stesso numero: il motore QUI (Node) e la barra LÀ (browser). */
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
  await expect(locali).toBeVisible();   // visibile E non scegliibile: dice che il valore esiste
  await expect(locali).toHaveText(/^Locali\s*0$/);
  await expect(locali).toBeDisabled();
  await expect(locali).toHaveAttribute('title', 'Nessun modello in questo catalogo');

  /* E il valore a zero di una faccetta a lista, che nasce dall'AND: con «Audio» acceso
     gli altri parametri valgono zero perché nessun modello audio li dichiara. */
  await apriIFiltri(page);
  await page.locator('[data-facet-group="capabilities"] [data-facet-row="audio"] span.talos-grow').click();
  await expect(righe(page)).toHaveCount(1);
  const strumenti = page.locator('[data-facet-group="capabilities"] [data-facet-row="tools"]');
  await expect(strumenti).toHaveAttribute('data-facet-zero', '');
  await expect(strumenti.locator('input')).toBeDisabled();
  await expect(strumenti.locator('small')).toHaveText('0');
  /* Il chip «Tutti» non è invece mai a zero: è la lista senza la faccetta di destinazione. */
  await expect(page.locator('[data-facet-scope] [data-facet-chip="all"]')).toHaveText(/^Tutti\s*1$/);
});

test('FACCETTE-03 — una faccetta filtra DAVVERO la lista, e toglierla la ripristina', async ({ page }) => {
  await apriCatalogo(page);
  await apriIFiltri(page);
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

  /* E il percorso della CASELLA (non del testo) porta allo stesso risultato: stesso stato.
     ⛔ La casella che sta A SCHERMO non è l'`input`: `calm-controls.js:41` veste ogni
     `input[type=checkbox]` e alla riga 213 gli mette `data-calm-source`, `aria-hidden="true"`
     e `tabindex="-1"` — invisibile — sostituendolo con un `button.calm-check` (riga 206-207).
     Cliccare l'`input` nudo andava in timeout con «element is not visible»: sbagliava la
     prova, non il prodotto. Si clicca il controllo vero, e si verifica che sotto la
     casella VERA sia accesa e che il filtro sia passato dai fatti (la lista). */
  const casellaVision = page.locator('[data-facet-group="capabilities"] [data-facet-row="vision"] .calm-check');
  await expect(casellaVision).toBeVisible();
  await expect(casellaVision).toHaveAttribute('role', 'checkbox');
  await casellaVision.click();
  await expect(page.locator('[data-facet-group="capabilities"] [data-facet-row="vision"] input')).toBeChecked();
  await expect(righe(page)).toHaveCount(1);
  await expect(page.locator('#modelLabCatalogCount')).toHaveText(/^1 di 6 modelli/);
  await expect(page.locator('[data-facet-active] [data-facet-remove][data-facet-value="vision"]')).toHaveCount(1);
  await page.locator('[data-facet-active] [data-facet-remove="__azzera"]').click();
  await expect(righe(page)).toHaveCount(6);
});

test('FACCETTE-04 — il select del fornitore e la barra non si contraddicono', async ({ page }) => {
  await apriCatalogo(page);
  await expect(page.locator('#modelLabProviderFilter option')).toHaveCount(4);   // tutti + tre fornitori
  /* Il conteggio del fornitore sta nella VOCE del select, ed è il numero giusto. */
  await expect(page.locator('#modelLabProviderFilter option[value="beta"]')).toHaveText('beta (2)');
  await expect(page.locator('#modelLabProviderFilter option[value="all"]')).toHaveText('Tutti i fornitori (6)');

  /* `{force: true}`: il select vero è quello che `app.js` legge, ma è coperto dal vestito Calm. */
  await page.selectOption('#modelLabProviderFilter', 'beta', { force: true });
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
  /* E il vestito Calm rispecchia il select: se dicesse un'altra cosa, a schermo ci sarebbe
     un controllo che annuncia un filtro tolto mentre la lista è ancora filtrata. */
  const specchio = await page.locator('#modelLabProviderFilter')
    .evaluate((sel) => sel.parentElement.querySelector('.calm-control--select .calm-select__value')?.textContent?.trim() || null);
  /* ⛔ Lo specchio legge l'ETICHETTA della voce (`calm-controls.js` rispecchia
     `s.options[s.selectedIndex].label`), e le etichette portano il CONTEGGIO: pretenderlo senza
     il numero era un'asserzione scritta a mano, mai misurata — il valore vero è questo. */
  expect(specchio).toBe('Tutti i fornitori (6)');
});

test('FACCETTE-05 — la ricerca resta quella dell’app, e i conteggi la seguono', async ({ page }) => {
  await apriCatalogo(page);
  await page.fill('#modelLabSearch', 'beta');
  await expect(righe(page)).toHaveCount(2);
  /* La ricerca dell'app cerca in nome, id E fornitore: qui prende i due record di `beta`. */
  await expect(righe(page).first()).toHaveAttribute('data-provider', 'beta');
  /* Con la ricerca accesa, i conteggi dei parametri si restringono: uno solo sopravvive. */
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
    try {
      window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({
        version: 1, appearance: { colorMode: 'dark', themePreset: 'calm', themePresetVersione: 2, uiLanguage: 'it' }, chat: {}, workspaces: {},
      }));
    } catch { /* cornice ospitata */ }
  });
  await page.goto('/');
  const salta = page.getByRole('button', { name: 'Salta per ora', exact: true });
  if (await salta.isVisible()) await salta.click();
  await page.getByRole('button', { name: /^Impostazioni(?: \(Ctrl ,\))?$/ }).click();
  await page.getByRole('tab', { name: 'Laboratorio modelli', exact: true }).click();
  await page.getByRole('tab', { name: 'Modelli', exact: true }).click();
  await expect(page.locator('#modelLabCatalogPanel')).toBeVisible();
  await expect(page.locator('#modelLabFacets')).toHaveCount(1);

  const quanti = await page.locator('#modelLabCatalogCount').textContent();
  expect(quanti, `il catalogo vero non è arrivato: l'intestazione dice «${quanti}»`).toMatch(/\d+ di \d+ modelli/);
  const totale = Number(quanti.match(/(\d+) di (\d+) modelli/)[2]);
  expect(totale, 'il catalogo osservato è vuoto: la prova non sta misurando niente').toBeGreaterThan(100);

  await apriIFiltri(page);

  /*
   * ⛔ I NUMERI A SCHERMO SONO QUELLI DEL MOTORE, sullo STESSO dato — misurato il 18/09/2026.
   *   La faccetta dei parametri si legge dal catalogo vero (445 modelli, «copia salvata») e si
   *   confronta valore per valore con `facetCount` sulla stessa risposta: due strade verso lo
   *   stesso numero. Non è un'asserzione mia su una costante scritta a mano.
   */
  const dati = await page.evaluate(async () => (await (await fetch('/api/v1/models')).json()).data);
  const adattati = dati.modelli.map(modelloCatalogo);
  const capacita = capacitaDelCatalogo(adattati);
  const righeCapacita = page.locator('[data-facet-group="capabilities"] [data-facet-row]');

  /* ⛔ E QUI UNA VERITÀ SCOMODA, misurata e non dedotta: questo catalogo ha CINQUE capacità
     (tools · json · reasoning · vision · audio), quindi MENO della soglia `VOCI_VISIBILI = 8`
     e il contenitore non nasconde NIENTE. ⇒ «Vedi altri» esiste nel DOM ma resta nascosto, ed è
     il comportamento giusto: un disclosure senza niente da rivelare non si offre. Le due metà si
     provano tutte e due, così la prova regge anche il giorno che il catalogo cresce. */
  const nascoste = Math.max(0, capacita.parametri.length - VOCI_VISIBILI);
  await expect(righeCapacita).toHaveCount(nascoste ? VOCI_VISIBILI : capacita.parametri.length);
  const aSchermo = await righeCapacita.evaluateAll((nodi) => nodi.map((n) => ({
    valore: n.dataset.facetRow,
    conteggio: Number(n.querySelector('small').textContent),
  })));
  const attesi = capacita.parametri.slice(0, nascoste ? VOCI_VISIBILI : capacita.parametri.length).map((v) => ({
    valore: v,
    conteggio: facetCount(adattati, emptyCatalogFilters(), 'capabilities', v),
  }));
  expect(aSchermo, 'i conteggi a schermo non sono quelli del motore sullo stesso catalogo').toEqual(attesi);
  for (const r of aSchermo) expect(r.conteggio, `«${r.valore}» è a zero sul catalogo vero`).toBeGreaterThan(0);

  const altri = page.locator('[data-facet-group="capabilities"] [data-facet-more]');
  await expect(altri).toHaveCount(1);
  await expect(altri).toHaveAttribute('aria-controls', 'modelLabFacetsRows-capabilities');
  if (nascoste) {
    /* Il resto sta dietro un disclosure VERO: `aria-expanded` che cambia, l'etichetta che porta
       il numero delle voci rimaste, e il contenitore promesso che le mostra tutte. */
    await expect(altri).toBeVisible();
    await expect(altri).toHaveAttribute('aria-expanded', 'false');
    await expect(altri).toHaveText(`Vedi altri ${nascoste} parametri`);
    await altri.click();
    await expect(altri).toHaveAttribute('aria-expanded', 'true');
    await expect(altri).toHaveText('Vedi meno parametri');
    await expect(page.locator('#modelLabFacetsRows-capabilities [data-facet-row]')).toHaveCount(capacita.parametri.length);
    await altri.click();
    await expect(altri).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#modelLabFacetsRows-capabilities [data-facet-row]')).toHaveCount(VOCI_VISIBILI);
  } else {
    await expect(altri, 'niente da rivelare: il disclosure non si offre').toBeHidden();
    await expect(altri).toHaveAttribute('aria-expanded', 'false');
  }
  await foto(page, 'faccette-catalogo-vero', info);
});

test('FACCETTE-07 — con il tema CHIARO la barra si vede lo stesso, e non nasce nessun errore a runtime', async ({ page }, info) => {
  const raccolti = [];
  page.on('pageerror', (e) => raccolti.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') raccolti.push('console: ' + m.text()); });
  await apriCatalogo(page, { colorMode: 'light' });
  await expect(page.locator('#modelLabFacets')).toHaveCount(1);
  await apriIFiltri(page);
  /* Le faccette si leggono in tutti e due i temi: il testo sopra il fondo è una misura, non un'opinione. */
  const contrasto = await page.locator('#modelLabFacets').evaluate((barra) => {
    const titolo = barra.querySelector('[data-facet-group="capabilities"] legend');
    return { colore: getComputedStyle(titolo).color, altezza: titolo.getBoundingClientRect().height, fondo: getComputedStyle(document.body).backgroundColor };
  });
  expect(contrasto.altezza).toBeGreaterThan(0);
  expect(contrasto.colore).not.toBe(contrasto.fondo);
  await foto(page, 'faccette-tema-chiaro', info);
  const nostri = erroriNostri(page, raccolti);
  expect(nostri, 'errori alzati dalla NOSTRA pagina:\n' + nostri.join('\n')).toEqual([]);
});
