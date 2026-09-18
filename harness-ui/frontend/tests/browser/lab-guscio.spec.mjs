import { expect, test } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/*
 * ============================================================================
 * IL GUSCIO A QUATTRO SCHEDE — la prova della corsia 2, 18/09/2026
 * ============================================================================
 * Prova `src/components/lab-cornice-v3.js` SULLA CARTA VERA dell'app viva:
 * `#modelLabCard`, già vestita da `montaCorniceModelLab`, coi sei pannelli
 * legacy veri e i loro id. Non un finto DOM, non una fixture.
 *
 * ⛔ COME ARRIVA IL MODULO NELLA PAGINA, e perché così. Il bundle servito
 * (`dist/`) è stato costruito alle 14:17, PRIMA di questo file: importarlo da
 * `app.js` non si può (non è mio, e cinque corsie non buildano insieme). Il
 * modulo si serve dalla sua SORGENTE su disco — `page.route('**\/__lab\/*.js')`
 * — e si carica con un `import()` dalla pagina. Il percorso è same-origin,
 * quindi la CSP `script-src 'self'` lo ammette: nessun `<script>` inline, che
 * la CSP di questo server scarterebbe in silenzio (`http-app.mjs:572`).
 * ⛔ E il grafo degli import si risolve da solo: `lab-cornice-v3.js` importa
 * `./download-coda.js`, `./plurale.js`, `./cornice-model-lab.js`, che sotto
 * `/__lab/` diventano `/__lab/download-coda.js`… tutte servite dalla stessa
 * rotta, dal file vero. Nessuna copia, nessun bundle.
 *
 * ⛔ COSA FA DIVENTARE ROSSA QUESTA PROVA, riga per riga (regola 8 del foglio
 * di coordinamento) — così si può rompere:
 *   · si toglie `montaGuscioLaboratorio` da `lab-cornice-v3.js` → GUSCIO-01..06
 *     rossi (nessuna scheda `labScheda*` esiste);
 *   · si toglie il blocco della guardia (`orfani`/`labGuscioNegato`) → GUSCIO-05
 *     rosso (la carta con la sezione sconosciuta monta invece di negare);
 *   · si toglie `aggiornaConteggiScheda` → GUSCIO-03 rosso;
 *   · si toglie `aggiornaBandaLaboratorio` → GUSCIO-04 rosso;
 *   · si toglie il ramo `passi`/`Home`/`End` dalla tastiera → GUSCIO-02 rosso;
 *   · si tolgono i quattro `data-lab-pannello` → GUSCIO-01 rosso.
 */

const COMPONENTI = resolve(process.cwd(), 'src', 'components');
const CARTELLA_FOTO = resolve(process.cwd(), 'artifacts', 'lab-guscio-2026-09-18');

/** Il modulo vero, letto dal disco e servito al posto giusto. */
async function serviIlModulo(page) {
  await page.route('**/__lab/*.js', async (route) => {
    const nome = new URL(route.request().url()).pathname.split('/').pop();
    try {
      const sorgente = await readFile(resolve(COMPONENTI, nome), 'utf8');
      await route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: sorgente });
    } catch {
      // ⛔ Un import che non risolve deve FARSI VEDERE: 404, non un vuoto.
      await route.fulfill({ status: 404, contentType: 'text/plain; charset=utf-8', body: `manca ${nome}` });
    }
  });
}

/** Apre l'app, va in Impostazioni → Modelli e monta il guscio sulla carta vera. */
async function apriEEmonta(page, { colorMode = 'dark' } = {}) {
  await page.addInitScript((modo) => {
    window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({
      version: 1,
      appearance: { colorMode: modo, themePreset: 'calm', themePresetVersione: 2, uiLanguage: 'it' },
      chat: {},
      workspaces: {},
    }));
  }, colorMode);
  await serviIlModulo(page);
  await page.goto('/');
  return page.evaluate(async () => {
    // Si naviga come si naviga davvero: la voce «Impostazioni» della barra
    // laterale, aprendo il gruppo se è chiuso (pattern di `settings-fatti-reali`).
    const voce = document.querySelector('.talos-sidebar [data-vaia="impostazioni"]');
    if (voce && !voce.offsetParent) {
      const gruppo = voce.closest('.td-nav-group');
      const testata = gruppo?.id ? document.querySelector(`.talos-sidebar [aria-controls="${gruppo.id}"]`) : null;
      if (testata?.getAttribute('aria-expanded') === 'false') testata.click();
    }
    voce?.click();
    window.__talosHarnessUiRuntime?.setSettingsSection?.('models');
    const modulo = await import('/__lab/lab-cornice-v3.js');
    window.__lab = modulo;
    const card = document.querySelector('#modelLabCard');
    // ⛔ Le classi di base della carta si FOTOGRAFANO prima di montare: il
    // guscio non deve toglierne nessuna, e qual è il loro nome è affare della
    // shell (è cambiato due volte oggi). Asserire una classe scritta a mano
    // vorrebbe dire provare il file sbagliato.
    const classiPrima = card ? [...card.classList] : [];
    const montato = modulo.montaGuscioLaboratorio(card, {
      onCambio: (scheda) => { window.__labCampagne = [...(window.__labCampagne ?? []), scheda]; },
    });
    return {
      montato, carta: Boolean(card), visibile: Boolean(card && !card.hidden),
      classiPrima, classiDopo: card ? [...card.classList] : [],
      // La carta non è nel documento servito: la inietta `app.js` dallo
      // spezzone che il bundle si porta dentro (`data-settings-reuse`).
      dentroLaShell: Boolean(document.querySelector('#setting-panel-models #modelLabCard')),
    };
  });
}

const SCHEDE = ['models', 'providers', 'downloads', 'system'];

test('GUSCIO-01 — le sei linguette diventano quattro schede, e nessun pannello si perde', async ({ page }) => {
  const esito = await apriEEmonta(page);
  expect(esito.montato).toBe(true);
  expect(esito.carta).toBe(true);
  // ⛔ La carta NON sta nel documento servito: il guscio delle Impostazioni le
  // lascia uno slot vuoto (`data-settings-reuse="modelLabCard"`,
  // `dist/index.html`) e `app.js` ci travasa lo spezzone legacy. Montarsi su
  // `#modelLabCard` funziona solo perché quel travaso è già avvenuto.
  expect(esito.dentroLaShell).toBe(true);
  // ⛔ E il guscio non spoglia la carta: tutte le classi di prima ci sono ancora.
  expect(esito.classiPrima.length).toBeGreaterThan(0);
  expect(esito.classiPrima.filter(classe => !esito.classiDopo.includes(classe))).toEqual([]);

  const stato = await page.evaluate(() => {
    const card = document.querySelector('#modelLabCard');
    const schede = [...card.querySelectorAll('[data-lab-scheda]')];
    const gruppi = [...card.querySelectorAll('[data-lab-pannello]')];
    const pannelli = [...card.querySelectorAll('[data-model-lab-panel]')];
    return {
      linguetteNellaStriscia: card.querySelectorAll('[role="tablist"] [data-model-lab-tab]').length,
      // ⛔ Le sei linguette NON sono sparite: sono la superficie di comando
      // (`[data-lab-comandi]`, `hidden` dentro la carta). È su di loro che il
      // clic viaggia per passare da `app.js` (`setModelLabSection`), quindi se
      // qualcuno le toglie il guscio resta senza la strada vera.
      comandi: card.querySelectorAll('[data-lab-comandi] [data-model-lab-tab]').length,
      comandiVisibili: [...card.querySelectorAll('[data-lab-comandi] [data-model-lab-tab]')].filter(bottone => bottone.offsetParent).length,
      schede: schede.map(tab => tab.dataset.labScheda),
      // ⛔ E le quattro schede NON portano `data-model-lab-tab`: quel vocabolario
      // resta ai sei bottoni. Se qualcuno glielo rimette, il clic smette di
      // passare da `setModelLabSection` e la scheda si accende senza caricare
      // niente: questa riga è la sua guardia.
      schedeSenzaVocabolarioLegacy: schede.filter(tab => !tab.dataset.modelLabTab).length,
      idSchede: schede.map(tab => tab.id),
      ruoli: schede.map(tab => tab.getAttribute('role')),
      selezionate: schede.filter(tab => tab.getAttribute('aria-selected') === 'true').map(tab => tab.dataset.labScheda),
      nelTabOrder: schede.filter(tab => tab.tabIndex === 0).map(tab => tab.dataset.labScheda),
      // APG: `aria-controls` deve puntare a un pannello CHE ESISTE.
      controlliRotti: schede.filter(tab => !document.getElementById(tab.getAttribute('aria-controls'))).map(tab => tab.dataset.labScheda),
      gruppi: gruppi.map(g => g.dataset.labPannello),
      ruoloGruppi: gruppi.map(g => g.getAttribute('role')),
      etichettati: gruppi.every(g => document.getElementById(g.getAttribute('aria-labelledby'))?.dataset.labScheda === g.dataset.labPannello),
      gruppiNelTabOrder: gruppi.filter(g => g.tabIndex === 0).length,
      visibili: gruppi.filter(g => !g.hidden).map(g => g.dataset.labPannello),
      // Le sei sezioni legacy: ci sono ancora TUTTE, e ognuna sta in UNA scheda.
      sezioni: pannelli.map(p => p.dataset.modelLabPanel).sort(),
      sezioniSenzaGruppo: pannelli.filter(p => !p.closest('[data-lab-pannello]')).length,
      gruppoDiOgnuna: Object.fromEntries(pannelli.map(p => [p.dataset.modelLabPanel, p.closest('[data-lab-pannello]')?.dataset.labPannello ?? null])),
      // ⛔ Lo stato INTERNO è di app.js e il guscio non l'ha toccato: la
      // Panoramica accesa, e tutte e tre le sezioni della scheda Modelli
      // ancora spente. (Erano rimaste ACCESE tutte e tre prima della cura:
      // tre pannelli impilati dentro una scheda sola.)
      pannelliVisibili: pannelli.filter(p => !p.hidden).map(p => p.dataset.modelLabPanel),
      tabpanelAnnidati: card.querySelectorAll('[data-lab-pannello] [role="tabpanel"]').length,
      ledger: card.querySelectorAll('.model-lab-ledger .talos-kv').length,
      // Il guscio veste la carta con la sua classe. ⛔ E NON si asserisce qui
      // nessuna classe della shell (`settings-card`, `talos-card`…): quelle le
      // decide il coordinatore e sono cambiate sotto questa corsia — la prova
      // della conservazione è la fotografia presa PRIMA del montaggio, in
      // `apriEEmonta`, non un nome scritto a mano.
      classi: [...card.classList],
      schedaAttiva: card.dataset.labSchedaAttiva,
    };
  });

  expect(stato.linguetteNellaStriscia).toBe(0);
  expect(stato.comandi).toBe(6);
  expect(stato.comandiVisibili).toBe(0);
  expect(stato.schede).toEqual(SCHEDE);
  expect(stato.schedeSenzaVocabolarioLegacy).toBe(4);
  expect(stato.idSchede).toEqual(['labSchedaModels', 'labSchedaProviders', 'labSchedaDownloads', 'labSchedaSystem']);
  expect(stato.ruoli).toEqual(['tab', 'tab', 'tab', 'tab']);
  expect(stato.selezionate).toHaveLength(1);
  expect(stato.nelTabOrder).toEqual(stato.selezionate); // roving: UNA sola scheda nel tab order
  expect(stato.controlliRotti).toEqual([]);
  expect(stato.gruppi).toEqual(SCHEDE);
  expect(stato.ruoloGruppi).toEqual(['tabpanel', 'tabpanel', 'tabpanel', 'tabpanel']);
  expect(stato.etichettati).toBe(true);
  expect(stato.gruppiNelTabOrder).toBe(4);
  expect(stato.visibili).toHaveLength(1);
  expect(stato.sezioni).toEqual(['catalog', 'downloads', 'huggingface', 'installed', 'overview', 'providers']);
  expect(stato.sezioniSenzaGruppo).toBe(0);
  expect(stato.gruppoDiOgnuna).toEqual({
    overview: 'system', catalog: 'models', installed: 'models', huggingface: 'models',
    providers: 'providers', downloads: 'downloads',
  });
  expect(stato.pannelliVisibili).toEqual(['overview']);
  expect(stato.tabpanelAnnidati).toBe(0);
  expect(stato.ledger).toBe(4);
  expect(stato.classi).toContain('talos-model-lab');
  expect(SCHEDE).toContain(stato.schedaAttiva);
  // ⛔ `hidden` da solo non basta a dire «non si vede»: la lezione del 18/09 è
  // che un autore può rimettere `display:block` sopra un `[hidden]`. Qui si
  // guarda il DISEGNO, non l'attributo.
  for (const id of SCHEDE) {
    const gruppo = page.locator(`#modelLabCard [data-lab-pannello="${id}"]`);
    if (id === stato.schedaAttiva) await expect(gruppo).toBeVisible();
    else await expect(gruppo).toBeHidden();
  }
});

test('GUSCIO-02 — la tastiera: frecce con avvolgimento, Home, End, e Invio che apre (APG)', async ({ page }) => {
  await apriEEmonta(page);
  const card = page.locator('#modelLabCard');
  // ⛔ Quale scheda sia aperta all'avvio NON lo decide il guscio: è quella che
  // l'app sta già mostrando (`setModelLabSection('overview')` all'avvio,
  // `app.js:4706`), e il guscio si allinea invece di spostare la schermata
  // sotto il dito. Il mockup aprirebbe Modelli: se l'owner vuole quello, è un
  // letterale in `app.js`, non una riga qui.
  await expect(card.locator('[data-lab-scheda][aria-selected="true"]')).toHaveAttribute('data-lab-scheda', 'system');

  await card.locator('#labSchedaSystem').focus();
  // Freccia destra: il FUOCO si sposta (con avvolgimento), la scheda NON si apre.
  await page.keyboard.press('ArrowRight');
  await expect(card.locator('#labSchedaModels')).toBeFocused();
  await expect(card.locator('#labSchedaSystem')).toHaveAttribute('aria-selected', 'true');
  await expect(card.locator('[data-lab-pannello="system"]')).toBeVisible();
  await expect(card.locator('[data-lab-pannello="models"]')).toBeHidden();

  // Invio: ora la scheda si apre davvero, e la sezione interna l'accende l'app.
  await page.keyboard.press('Enter');
  await expect(card.locator('#labSchedaModels')).toHaveAttribute('aria-selected', 'true');
  await expect(card.locator('[data-lab-pannello="models"]')).toBeVisible();
  await expect(card.locator('[data-lab-pannello="system"]')).toBeHidden();
  await expect(card).toHaveAttribute('data-lab-scheda-attiva', 'models');
  // ⭐ Ad accendere il catalogo è `setModelLabSection` (`app.js:4192`), chiamata
  // dal clic sul BOTTONE LEGACY che il guscio preme al posto dell'utente: la sua
  // firma sono `aria-selected` e `.active` scritti sui bottoni veri, che il
  // guscio non tocca mai. Se il clic non passasse di lì, resterebbero spenti.
  await expect(card.locator('[data-lab-comandi] [data-model-lab-tab="catalog"]')).toHaveAttribute('aria-selected', 'true');
  await expect(card.locator('[data-model-lab-panel="catalog"]')).toBeVisible();

  // End e Home.
  await page.keyboard.press('End');
  await expect(card.locator('#labSchedaSystem')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(card.locator('#labSchedaModels')).toBeFocused();

  // Avvolgimento all'indietro dalla prima.
  await page.keyboard.press('ArrowLeft');
  await expect(card.locator('#labSchedaSystem')).toBeFocused();
  const nelTabOrder = await card.locator('[data-lab-scheda][tabindex="0"]').count();
  expect(nelTabOrder).toBe(1);
});

test('GUSCIO-03 — il conteggio dei download sta sulla scheda, e a zero non si disegna', async ({ page }) => {
  await apriEEmonta(page);
  const card = page.locator('#modelLabCard');

  // La coda vera non ha righe: nessun numero.
  await expect(card.locator('#labSchedaDownloads .talos-tabs__count')).toHaveCount(0);

  // Tre che lavorano, due finiti: si contano i primi.
  await page.evaluate(() => {
    const lista = document.querySelector('#modelLabDownloadsList');
    lista.replaceChildren();
    for (const [id, stato] of [['a', 'running'], ['b', 'paused'], ['c', 'queued'], ['d', 'ready'], ['e', 'cancelled']]) {
      const riga = document.createElement('article');
      riga.className = 'talos-lab__download';
      riga.dataset.downloadId = id;
      riga.dataset.state = stato;
      riga.textContent = id;
      lista.append(riga);
    }
  });
  const numero = card.locator('#labSchedaDownloads .talos-tabs__count');
  await expect(numero).toHaveText('3');
  await expect(numero).toHaveAttribute('aria-hidden', 'true');
  const detto = await page.evaluate(() => document.querySelector('#labSchedaDownloads [data-lab-conteggio-detto]')?.textContent ?? null);
  expect(detto).toBe('3 attivi');
  // Il nome accessibile della scheda porta il conteggio (ricerca 18/09).
  await expect(card.locator('#labSchedaDownloads')).toHaveAccessibleName(/3 attivi/);
  // E il numero NON compare su nessun'altra scheda.
  expect(await card.locator('[data-lab-scheda]:not(#labSchedaDownloads) .talos-tabs__count').count()).toBe(0);

  // Uno solo: singolare, non «1 attivi» (difetto BH-12).
  await page.evaluate(() => {
    const lista = document.querySelector('#modelLabDownloadsList');
    [...lista.children].slice(1).forEach(riga => riga.remove());
  });
  await expect(numero).toHaveText('1');
  const singolare = await page.evaluate(() => document.querySelector('#labSchedaDownloads [data-lab-conteggio-detto]')?.textContent ?? null);
  expect(singolare).toBe('1 attivo');

  // Zero: sparisce, non mostra «0».
  await page.evaluate(() => { document.querySelector('#modelLabDownloadsList').replaceChildren(); });
  await expect(numero).toHaveCount(0);
  const testo = await card.locator('#labSchedaDownloads').innerText();
  expect(testo).not.toContain('0');
});

test('GUSCIO-04 — la banda rispecchia i valori veri, e non inventa un rapporto', async ({ page }) => {
  await apriEEmonta(page);
  const banda = page.locator('#modelLabCard [data-lab-banda]');
  await expect(banda).toHaveCount(1);

  // Il nodo vero del modello attivo è DENTRO la banda, ed è ancora lui (id unico).
  const modello = await page.evaluate(() => {
    const nodo = document.querySelector('[data-lab-banda] #modelLabActiveModel');
    return { dentro: Boolean(nodo), copie: document.querySelectorAll('#modelLabActiveModel').length, testo: nodo?.textContent ?? null };
  });
  expect(modello.dentro).toBe(true);
  expect(modello.copie).toBe(1);

  // I due valori veri arrivano dai nodi del pannello Sistema, rispecchiati.
  await page.evaluate(() => {
    document.querySelector('#machineFreeMemoryMetric').textContent = '18,6 GiB';
    document.querySelector('#machineMemoryMetric').textContent = '32 GiB';
  });
  await expect(banda.locator('[data-lab-banda-valore]')).toHaveText('18,6 GiB');
  await expect(banda.locator('[data-lab-banda-frazione]')).toHaveText('su 32 GiB');
  const barra = banda.locator('[data-lab-banda-track]');
  await expect(barra).toBeVisible();
  expect(await barra.evaluate(nodo => ({ max: nodo.max, value: nodo.value }))).toEqual({ max: 32, value: 18.6 });

  // Un'unità che non è GiB: il rapporto NON si inventa, la barra sparisce.
  await page.evaluate(() => { document.querySelector('#machineFreeMemoryMetric').textContent = '512 MiB'; });
  await expect(banda.locator('[data-lab-banda-valore]')).toHaveText('512 MiB');
  await expect(barra).toBeHidden();

  // La fonte non è ancora misurata: si mostra il suo «—», mai uno zero.
  await page.evaluate(() => { document.querySelector('#machineFreeMemoryMetric').textContent = '—'; });
  await expect(banda.locator('[data-lab-banda-valore]')).toHaveText('—');
});

test('GUSCIO-05 — su una sezione che non sa dove mettere, il guscio NEGA il montaggio', async ({ page }) => {
  await apriEEmonta(page);
  const esito = await page.evaluate(async () => {
    const modulo = window.__lab;
    const costruisci = (sezioni) => {
      // ⛔ Nessun id: è una carta usa e getta e non deve collidere con quelle vere.
      const carta = document.createElement('article');
      carta.className = 'settings-card model-lab-card';
      carta.innerHTML = '<div class="settings-card-heading"><div><h3>Prova</h3><p>nota</p></div></div>'
        + '<div class="model-lab-tabs" role="tablist" aria-label="Prova">'
        + sezioni.map((sezione, i) => `<button role="tab" aria-selected="${i === 0}" data-model-lab-tab="${sezione}" data-prova-linguetta>voce</button>`).join('')
        + '</div>'
        + sezioni.map(sezione => `<section class="model-lab-panel" role="tabpanel" data-model-lab-panel="${sezione}" hidden>contenuto</section>`).join('');
      document.body.append(carta);
      return carta;
    };

    const cattiva = costruisci(['sezione-mai-vista']);
    const negato = modulo.montaGuscioLaboratorio(cattiva);
    const dopoNegato = {
      negato,
      motivo: cattiva.dataset.labGuscioNegato ?? null,
      guscio: cattiva.dataset.labGuscio ?? null,
      schede: cattiva.querySelectorAll('[data-lab-scheda]').length,
      // ⛔ Il rifiuto non tocca la carta: le sue linguette restano dove sono.
      linguetteNonToccate: cattiva.querySelectorAll('[data-model-lab-tab]').length,
      comandi: cattiva.querySelectorAll('[data-lab-comandi]').length,
      // Niente si perde: il pannello che non sa dove mettere è ancora lì.
      sezioneAncoraPresente: Boolean(cattiva.querySelector('[data-model-lab-panel="sezione-mai-vista"]')),
    };
    cattiva.remove();

    const buona = costruisci(['downloads']);
    const montato = modulo.montaGuscioLaboratorio(buona);
    const pannello = buona.querySelector('[data-model-lab-panel="downloads"]');
    const dopoMontato = {
      montato,
      guscio: buona.dataset.labGuscio ?? null,
      negato: buona.dataset.labGuscioNegato ?? null,
      schede: [...buona.querySelectorAll('[data-lab-scheda]')].map(tab => tab.dataset.labScheda),
      // ⛔ Il vocabolario legacy non si SOSTITUISCE: si conserva, `hidden`, come
      // superficie di comando. Le quattro schede della shell non lo portano.
      comandiLegacy: buona.querySelectorAll('[data-lab-comandi] [data-model-lab-tab]').length,
      comandiVisibili: [...buona.querySelectorAll('[data-lab-comandi] [data-model-lab-tab]')]
        .filter(bottone => bottone.offsetParent !== null).length,
      schedeSenzaVocabolarioLegacy: [...buona.querySelectorAll('[data-lab-scheda]')]
        .filter(tab => !tab.dataset.modelLabTab).length,
      // ⛔ Lo stato interno non si tocca: stesso nome, stesso `hidden`.
      nomeIntatto: pannello.dataset.modelLabPanel,
      hiddenDopoIlMontaggio: pannello.hidden,
      dentroAlGruppo: pannello.closest('[data-lab-pannello]')?.dataset.labPannello ?? null,
      // Il ripiego: senza il listener di `app.js` (questa carta non ce l'ha) la
      // prima sezione della scheda la accende il guscio.
      accesoDaSolo: modulo.selezionaScheda(buona, 'downloads') && pannello.hidden === false,
      // E una sezione che in QUESTA carta non esiste non spegne niente.
      sconosciutaNonSpegne: modulo.selezionaScheda(buona, 'system'),
      ancoraAcceso: pannello.hidden === false,
      schedaDopoIlRipiego: buona.dataset.labSchedaAttiva,
    };
    modulo.smontaGuscioLaboratorio(buona);
    buona.remove();
    return { dopoNegato, dopoMontato };
  });

  // Il verso che DEVE fallire: sezione sconosciuta → niente guscio, motivo scritto, niente perso.
  expect(esito.dopoNegato.negato).toBe(false);
  expect(esito.dopoNegato.motivo).toBe('sezione-mai-vista');
  expect(esito.dopoNegato.guscio).toBeNull();
  expect(esito.dopoNegato.schede).toBe(0);
  expect(esito.dopoNegato.linguetteNonToccate).toBe(1);
  expect(esito.dopoNegato.comandi).toBe(0);
  expect(esito.dopoNegato.sezioneAncoraPresente).toBe(true);

  // Il verso buono, sulla stessa carta: monta, e la linguetta legacy resta come
  // comando nascosto invece di sparire.
  expect(esito.dopoMontato.montato).toBe(true);
  expect(esito.dopoMontato.guscio).toBe('v3');
  expect(esito.dopoMontato.negato).toBeNull();
  expect(esito.dopoMontato.schede).toEqual(SCHEDE);
  expect(esito.dopoMontato.comandiLegacy).toBe(1);
  expect(esito.dopoMontato.comandiVisibili).toBe(0);
  expect(esito.dopoMontato.schedeSenzaVocabolarioLegacy).toBe(4);
  expect(esito.dopoMontato.nomeIntatto).toBe('downloads');
  expect(esito.dopoMontato.hiddenDopoIlMontaggio).toBe(true); // montare non accende niente
  expect(esito.dopoMontato.dentroAlGruppo).toBe('downloads');
  expect(esito.dopoMontato.accesoDaSolo).toBe(true);
  expect(esito.dopoMontato.sconosciutaNonSpegne).toBe(true);
  expect(esito.dopoMontato.ancoraAcceso).toBe(true);
  expect(esito.dopoMontato.schedaDopoIlRipiego).toBe('system');
});

test('GUSCIO-05-bis — quando è l\'app a cambiare sezione, il guscio la segue', async ({ page }) => {
  await apriEEmonta(page);
  const card = page.locator('#modelLabCard');

  /*
   * (a) LA STRADA VERA, battuta a mano: il pulsante «Gestisci chiavi e
   * indirizzi» della scheda Provider delle Impostazioni
   * (`src/legacy/frammenti.html:66`) porta `data-model-lab-go="providers"`, e
   * `app.js:4582` lo traduce in `setSettingsSection('models')` +
   * `setModelLabSection('providers')`. Nessuno di quei due passaggi è stato
   * scritto da questa corsia.
   */
  await page.evaluate(() => document.querySelector('[data-model-lab-go="providers"]')?.click());
  await expect(card.locator('#labSchedaProviders')).toHaveAttribute('aria-selected', 'true');
  await expect(card.locator('[data-lab-pannello="providers"]')).toBeVisible();
  await expect(card.locator('[data-model-lab-panel="providers"]')).toBeVisible();
  await expect(card).toHaveAttribute('data-lab-scheda-attiva', 'providers');

  /*
   * (b) IL CASO CHE PRIMA NON REGGEVA: `setModelLabSection('installed')`
   * (`app.js:22244`, «vedi modello» dalla coda download) — una sezione che
   * come scheda NON esiste. Il listener dell'app spegne TUTTE e quattro le
   * schede (`aria-selected='false'`, `tabIndex=-1`, `app.js:4193-4194`).
   *
   * ⛔ Questa è una RIPRODUZIONE del contratto dell'app, non una chiamata alla
   * sua funzione: `setModelLabSection` è una chiusura dentro
   * `inizializzaModelLab` e dalla pagina non si raggiunge. Le tre righe qui
   * sotto sono le sue, copiate da `app.js:4193-4194` riga per riga.
   */
  await page.evaluate(() => {
    document.querySelectorAll('[data-model-lab-tab]').forEach((tab) => {
      const active = tab.dataset.modelLabTab === 'installed';
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll('[data-model-lab-panel]').forEach((panel) => {
      const active = panel.dataset.modelLabPanel === 'installed';
      panel.classList.toggle('active', active);
      panel.hidden = !active;
    });
  });
  // Il guscio si riaccende da solo entro un tick: la scheda Modelli, e UNA sola
  // nel tab order (l'app le aveva messe a -1 tutte e quattro).
  await expect(card.locator('#labSchedaModels')).toHaveAttribute('aria-selected', 'true');
  await expect(card.locator('[data-lab-pannello="models"]')).toBeVisible();
  await expect(card.locator('[data-model-lab-panel="installed"]')).toBeVisible();
  expect(await card.locator('[data-lab-scheda][tabindex="0"]').count()).toBe(1);
  await expect(card).toHaveAttribute('data-lab-scheda-attiva', 'models');
});

test('GUSCIO-07 — il clic di una scheda passa dalla strada vera di app.js, non da una scrittura diretta', async ({ page }) => {
  await apriEEmonta(page);
  const card = page.locator('#modelLabCard');
  const comando = sezione => card.locator(`[data-lab-comandi] [data-model-lab-tab="${sezione}"]`);
  // L'app apre la Panoramica: la scheda Sistema è accesa, Provider no.
  await expect(card.locator('[data-lab-pannello="system"]')).toBeVisible();
  await expect(comando('providers')).toHaveAttribute('aria-selected', 'false');

  // ⛔ Dentro la scheda Provider non c'è nessuna sezione accesa: il guscio deve
  // CHIEDERE all'app. La prova che l'ha fatto sono `aria-selected` e `.active`
  // sui bottoni veri — due attributi che questo modulo non scrive mai (li scrive
  // `app.js:4194`). Se il guscio accendesse la sezione per conto suo, la
  // schermata sarebbe identica e questi due resterebbero spenti.
  await card.locator('#labSchedaProviders').click();
  await expect(comando('providers')).toHaveAttribute('aria-selected', 'true');
  await expect(comando('providers')).toHaveClass(/active/);
  await expect(card.locator('#modelLabProvidersPanel')).toBeVisible();
  await expect(card.locator('[data-lab-pannello="providers"]')).toBeVisible();
  await expect(card.locator('[data-lab-pannello="system"]')).toBeHidden();

  // Dentro Modelli la sezione la sceglie l'app: qui `'installed'`, ed è la
  // stessa `setModelLabSection('installed')` che `app.js:22259` chiama dal menu
  // di un download. Si arriva dal listener del bottone (`app.js:4627`), cioè
  // dalla stessa funzione — ed è anche il modo in cui la scheda IMPARA quale
  // sezione stava mostrando.
  await comando('installed').dispatchEvent('click');
  await expect(card.locator('[data-model-lab-panel="installed"]')).toBeVisible();
  await expect(card).toHaveAttribute('data-lab-scheda-attiva', 'models');

  // Si esce e si rientra: la scheda riapre la sezione LASCIATA, non la prima.
  await card.locator('#labSchedaProviders').click();
  await expect(card.locator('[data-lab-pannello="providers"]')).toBeVisible();
  await card.locator('#labSchedaModels').click();
  await expect(comando('installed')).toHaveAttribute('aria-selected', 'true');
  await expect(card.locator('[data-model-lab-panel="installed"]')).toBeVisible();
  await expect(card.locator('[data-model-lab-panel="catalog"]')).toBeHidden();
});

test('GUSCIO-06 — le foto: due temi per due larghezze, e il guscio in ogni scheda', async ({ page }) => {
  await mkdir(CARTELLA_FOTO, { recursive: true });
  const misure = [[1024, 800], [1440, 900]];
  for (const [larghezza, altezza] of misure) {
    for (const modo of ['dark', 'light']) {
      await page.setViewportSize({ width: larghezza, height: altezza });
      const esito = await apriEEmonta(page, { colorMode: modo });
      // Le classi VERE della carta viva, e chi la contiene: serviranno al
      // referto, e un fatto misurato non va ri-dedotto.
      await writeFile(
        resolve(CARTELLA_FOTO, 'fatti-misurati.txt'),
        `${modo} ${larghezza}x${altezza} · classi=${esito.classiDopo.join(' ')} · nellaShell=${esito.dentroLaShell}\n`,
        larghezza === 1024 && modo === 'dark' ? undefined : { flag: 'a' },
      );
      const card = page.locator('#modelLabCard');
      await expect(card).toBeVisible();
      await card.locator('#labSchedaModels').click();
      await expect(card.locator('[data-lab-pannello="models"]')).toBeVisible();
      const nome = `${modo}-${larghezza}x${altezza}`;
      await card.screenshot({ path: resolve(CARTELLA_FOTO, `guscio-${nome}-modelli.png`) });
      await page.screenshot({ path: resolve(CARTELLA_FOTO, `guscio-${nome}-vista.png`) });
      await card.locator('#labSchedaSystem').click();
      await card.screenshot({ path: resolve(CARTELLA_FOTO, `guscio-${nome}-sistema.png`) });
      // ⛔ Nella foto della carta il tratto sotto la piega non dipinge: si porta
      // il gate dei runtime DENTRO la finestra e si rifotografa, per distinguere
      // «non dipinge» da «non è stato fotografato».
      await card.locator('#modelLabRuntimeGate').scrollIntoViewIfNeeded();
      await page.screenshot({ path: resolve(CARTELLA_FOTO, `guscio-${nome}-runtime.png`) });
      // ⛔ La foto della scheda Sistema, ritagliata sulla carta, mostra molto
      // vuoto sotto il contenuto: prima di chiamarlo difetto si MISURA da dove
      // viene l'altezza (carta, contenitore dei pannelli, pannello attivo,
      // pannello della shell) e i loro `min-height` calcolati.
      const geometria = await card.evaluate((nodo) => {
        const alto = (el) => (el ? Math.round(el.getBoundingClientRect().height) : null);
        const minimo = (el) => (el ? getComputedStyle(el).minHeight : null);
        const pannelli = nodo.querySelector('.talos-tabs__panels');
        const attivo = pannelli?.querySelector('[data-lab-pannello]:not([hidden])');
        const shell = nodo.closest('[data-settings-panel]');
        return {
          carta: alto(nodo), pannelli: alto(pannelli), attivo: alto(attivo), attivoId: attivo?.dataset.labPannello ?? null,
          shell: alto(shell), shellId: shell?.dataset.settingsPanel ?? null,
          minCarta: minimo(nodo), minPannelli: minimo(pannelli), minAttivo: minimo(attivo), minShell: minimo(shell),
        };
      });
      await writeFile(resolve(CARTELLA_FOTO, 'fatti-misurati.txt'), `${modo} ${larghezza}x${altezza} · geometria=${JSON.stringify(geometria)}\n`, { flag: 'a' });
      // Le quattro schede restano raggiungibili alla larghezza più stretta.
      const tagliate = await card.evaluate((nodo) => {
        const striscia = nodo.querySelector('.talos-tabs__list');
        return [...nodo.querySelectorAll('[data-lab-scheda]')].filter(tab => {
          const r = tab.getBoundingClientRect();
          const s = striscia.getBoundingClientRect();
          return r.left < s.left - 1 || r.right > s.right + 1;
        }).map(tab => tab.dataset.labScheda);
      });
      expect(tagliate).toEqual([]);
      // Le due foto servono anche al controllo visivo: si dichiara che esistono.
      await writeFile(resolve(CARTELLA_FOTO, 'note.txt'), 'foto del guscio a quattro schede, 18/09/2026, corsia 2\n', { flag: 'a' });
    }
  }
});

/*
 * ⭐⭐ 18/09/2026 — LA PROVA CHE MANCAVA, aggiunta dalla REVIEW dell'orchestratore.
 * La corsia 2 lo aveva DICHIARATO nelle sue stesse parole: «il guscio NON è vivo nell'app:
 * dipende dalla riga del punto 5». Le sue otto prove montano il modulo A MANO su una pagina
 * banco (`/__lab/`), quindi restano verdi anche se nessuno lo monta mai nel prodotto — ed è
 * esattamente quello che succedeva: `grep -c montaGuscioLaboratorio dist/app.js` = 0.
 * La riga ora c'è, in `inizializzaModelLab` (`app.js`), e questa prova la tiene onesta:
 * se qualcuno la toglie, qui si diventa rossi. È la differenza fra provare il pezzo e
 * provare che il pezzo è ACCESO.
 */
test('GUSCIO-09 — il guscio è VIVO nell’app: si monta entrando nel Laboratorio, non da un banco', async ({ page }) => {
  await page.addInitScript(() => { window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: 'it' }, chat: {}, workspaces: {} })); });
  await page.goto('/');
  const esito = await page.evaluate(async () => {
    const voce = document.querySelector('.talos-sidebar [data-vaia="impostazioni"]');
    const gruppo = voce?.closest('.td-nav-group');
    const testata = gruppo?.id ? document.querySelector(`.talos-sidebar [aria-controls="${gruppo.id}"]`) : null;
    if (testata?.getAttribute('aria-expanded') === 'false') testata.click();
    voce?.click();
    window.__talosHarnessUiRuntime?.setSettingsSection?.('models');
    await new Promise((s) => setTimeout(s, 400));
    const carta = document.querySelector('#modelLabCardSettings') || document.querySelector('#modelLabCard');
    return {
      schede: [...document.querySelectorAll('[data-lab-scheda]')].map((n) => n.textContent.trim()),
      guscio: carta?.dataset?.labGuscio ?? null,
      pannelli: document.querySelectorAll('[data-lab-pannello]').length,
      vecchieNascoste: [...document.querySelectorAll('[data-model-lab-tab]')].filter((n) => n.closest('[hidden]')).length,
      negato: document.querySelectorAll('[data-lab-guscio-negato]').length,
    };
  });
  expect(esito.schede, 'le quattro schede del guscio esistono nell’app vera').toEqual(['Modelli', 'Provider', 'Download', 'Sistema']);
  expect(esito.guscio, 'la carta è timbrata dal guscio').toBe('v3');
  expect(esito.pannelli, 'quattro pannelli, uno per scheda').toBe(4);
  expect(esito.vecchieNascoste, 'le sei linguette legacy sono spostate, non perse').toBe(6);
  expect(esito.negato, 'nessun montaggio negato: la mappa copre tutte le sezioni').toBe(0);
});
