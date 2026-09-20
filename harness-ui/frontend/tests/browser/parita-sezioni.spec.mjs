import { expect, test } from '@playwright/test';

import { CAMPI_IMPOSTAZIONI, SEZIONI_IMPOSTAZIONI } from '../../src/components/impostazioni-campi.js';
import { CONTROLLI_MIGRATI } from '../../src/components/theme-studio.js';

/*
 * ============================================================================
 * LA PARITÀ DELLA SEZIONE ASPETTO COL MOCKUP — corsia A, 18/09/2026
 * ============================================================================
 * Prova, SULLA PAGINA VIVA, la struttura che il mockup `TALOS-Calm-Lab-04.html` ha e l'app non
 * aveva: i CINQUE GRUPPI con titolo e conteggio, la BANDA del tema, la PASTIGLIA contata, la
 * colonna riservata, e «Aggiungi modello» con le sue due strade vere.
 *
 * ⛔ LE PROVE SI MISURANO, NON SI LEGGONO DAL CSS. Il 18/09 il CSS dichiarava `.settings-group__title
 *   { font-size: 1.125rem }` (18px) e il DOM vivo rendeva **16px**: a vincere era
 *   `src/styles/index.css:1748 .talos-settings__section h3 { font-size:16px }`, peso (0,1,1) contro
 *   (0,1,0), in un ALTRO foglio. La differenza si è vista solo misurando il computed style — quindi
 *   qui si misura il computed style, non si leggono le regole.
 *
 * ⛔ I NUMERI DEL CONTRATTO SI RICONTANO, NON SI COPIANO. `9 · 4 · 11 · 1 · 1` e `40 · 14` non sono
 *   scritti a mano nella prova: si ricalcolano da `CAMPI_IMPOSTAZIONI` (campo `gruppo`, meno i
 *   `CONTROLLI_MIGRATI`, che vivono nello studio temi) e dalle opzioni di `themePresetSelect`.
 *   Se il contratto cambia, questa prova cambia da sola e l'app deve seguirla.
 *
 * ⛔ COME SI LANCIA (dalla cartella `harness-ui/frontend`), sul pacchetto temporaneo — `dist` e
 *   `harness-ui/public` NON si toccano:
 *
 *     node -e "import('./scripts/build.mjs').then(m=>m.buildProduction({outputDir:process.env.TEMP+'/talos-phase1-corsiaA'}))"
 *     TALOS_HARNESS_UI_TEST_PORT=4240 TALOS_HARNESS_UI_PUBLIC_DIR="$TEMP/talos-phase1-corsiaA" \
 *     npx playwright test -c playwright.config.mjs tests/browser/parita-sezioni.spec.mjs --reporter=line
 *
 * ⛔ COSA FA DIVENTARE ROSSA QUESTA PROVA — MISURATO riga per riga, non previsto: ogni riga è stata
 *   tolta dal sorgente, la suite rilanciata INTERA su un pacchetto ricostruito, e il sorgente
 *   ripristinato. L'elenco sta in fondo al file, sezione «LE MUTAZIONI PROVATE».
 */

/** I cinque gruppi del mockup (`prototypes/calm-lab/src/settings.mjs`, letto il 18/09/2026):
 *  la chiave è il `gruppo` del contratto, il titolo è la parola del mockup. */
const GRUPPI_MOCKUP = [
  ['design', 'Interfaccia e conversazione'],
  ['sfondo', 'Accessibilità e risorse'],
  ['animazioni', 'Movimento dell’interfaccia'],
  ['desktop', 'Desktop'],
  ['chat', 'Spazio di lettura'],
];

/** I temi che il contratto dichiara: la metà «14» della pastiglia, e l'elenco dello studio. */
const TEMI = CAMPI_IMPOSTAZIONI.find((campo) => campo.id === 'themePresetSelect')?.opzioni ?? [];

/** Quanti controlli il gruppo mostra DAVVERO: i suoi campi, meno quelli che vivono nello studio. */
function contati(gruppo) {
  return CAMPI_IMPOSTAZIONI.filter((campo) => campo.gruppo === gruppo && !CONTROLLI_MIGRATI.includes(campo.id)).length;
}

/** Apre l'app in italiano, entra nelle Impostazioni e sceglie la sezione. La lingua va DICHIARATA:
 *  senza, l'app parte in inglese e i confronti con le parole del mockup (italiane) mentirebbero.
 *  `persist:false` è obbligatorio — col default `true` la prova SCRIVEREBBE in localStorage. */
async function apriAspetto(page, sezione = 'appearance') {
  await page.addInitScript(() => {
    window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: 'it', colorMode: 'dark' }, chat: {}, workspaces: {} }));
  });
  await page.goto('/');
  await expect(page.locator('.talos-sidebar [data-vaia="impostazioni"]')).toBeVisible({ timeout: 15_000 });
  await page.evaluate((s) => {
    const voce = document.querySelector('.talos-sidebar [data-vaia="impostazioni"]');
    const gruppo = voce?.closest('.td-nav-group');
    const testata = gruppo?.id ? document.querySelector(`.talos-sidebar [aria-controls="${gruppo.id}"]`) : null;
    if (testata?.getAttribute('aria-expanded') === 'false') testata.click();
    voce?.click();
    window.__talosHarnessUiRuntime?.setSettingsSection?.(s, { persist: false });
  }, sezione);
  await expect(page.locator('#schermoImpostazioni')).toBeVisible({ timeout: 10_000 });
}

test.beforeEach(async ({ page }) => {
  /* ⛔ NESSUNA RETE FUORI CASA. La strada «Hugging Face» porta a una scheda che parla con
   *  huggingface.co: si ferma qui, come si ferma ogni richiesta non-GET sul server vivo. */
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || url.hostname === 'localhost' ? route.continue() : route.abort();
  });
});

test('PARITA-01 · i cinque gruppi del mockup, nell’ordine del mockup, con i suoi titoli', async ({ page }) => {
  await apriAspetto(page);
  const gruppi = page.locator('#setting-panel-appearance > [data-settings-group]');
  await expect(gruppi).toHaveCount(GRUPPI_MOCKUP.length);
  const letti = await page.evaluate(() => [...document.querySelectorAll('#setting-panel-appearance > [data-settings-group]')]
    .map((card) => ({
      chiave: card.dataset.settingsGroup,
      titolo: card.querySelector(':scope > [data-settings-group-head] [data-settings-group-title]')?.textContent,
      ruolo: card.getAttribute('role'),
      etichettato: card.getAttribute('aria-labelledby'),
      idTitolo: card.querySelector(':scope > [data-settings-group-head] [data-settings-group-title]')?.id,
    })));
  expect(letti.map((g) => g.chiave)).toEqual(GRUPPI_MOCKUP.map(([chiave]) => chiave));
  expect(letti.map((g) => g.titolo)).toEqual(GRUPPI_MOCKUP.map(([, titolo]) => titolo));
  // Il gruppo è una cosa con un nome: `role="group"` + `aria-labelledby` che punta al SUO titolo.
  for (const g of letti) {
    expect(g.ruolo, `il gruppo ${g.chiave} non è annunciato come gruppo`).toBe('group');
    expect(g.etichettato).toBe(g.idTitolo);
  }
  /*
   * ⛔ IL NUMERO CHE IL CSS DICHIARAVA E IL DOM NON RENDEVA — 18px, non 16px.
   *   Il 18/09 il mio `.settings-group__title { font-size: 1.125rem }` (peso 0,1,0) perdeva contro
   *   `src/styles/index.css:1748 .talos-settings__section h3 { font-size:16px; margin:4px 0 4px }`
   *   (peso 0,1,1), in un ALTRO foglio: il titolo usciva a 16px e con 4px di margine, e dal sorgente
   *   non si vedeva. La cura è stata alzare la specificità. Qui si misura il computed style, perché
   *   è l'unica cosa che distingue «la regola c'è» da «la regola vince».
   */
  const misure = await page.evaluate(() => {
    const titolo = document.querySelector('#setting-panel-appearance [data-settings-group-title]');
    const conteggio = document.querySelector('#setting-panel-appearance [data-settings-group-count]');
    const stile = getComputedStyle(titolo);
    return { titolo: [stile.fontSize, stile.fontWeight, `${stile.marginTop} ${stile.marginBottom}`], conteggio: getComputedStyle(conteggio).fontSize };
  });
  expect(misure.titolo, 'il titolo del gruppo non è più quello del mockup: 18px/600/senza margine').toEqual(['18px', '600', '0px 0px']);
  expect(misure.conteggio).toBe('11px');
  // Le parole VECCHIE restano nel DOM e sono nascoste: `static-copy.ts` localizza su quei nodi
  // (`[data-settings-group="sfondo"] > .talos-eyebrow`, `> h3`), toglierli spegnerebbe la traduzione.
  const vecchie = await page.evaluate(() => [...document.querySelectorAll('#setting-panel-appearance > [data-settings-group] > .talos-eyebrow, #setting-panel-appearance > [data-settings-group] > h3')]
    .map((el) => ({ nascosto: el.hidden, visibile: el.getBoundingClientRect().width > 0 })));
  expect(vecchie.length, 'le testate vecchie sono sparite dal DOM').toBeGreaterThan(0);
  for (const v of vecchie) { expect(v.nascosto).toBe(true); expect(v.visibile).toBe(false); }
});

test('PARITA-02 · i conteggi sono CONTATI dal contratto, non scritti nel markup', async ({ page }) => {
  await apriAspetto(page);
  const attesi = GRUPPI_MOCKUP.map(([chiave]) => contati(chiave));
  // La prova si regge da sola: se il contratto cambia, qui cambia l'atteso.
  expect(attesi, 'le partizioni del contratto non sono più quelle del mockup').toEqual([9, 4, 11, 1, 1]);
  const letti = await page.locator('#setting-panel-appearance > [data-settings-group] [data-settings-group-count]').allTextContents();
  expect(letti).toEqual(attesi.map((n) => `${n} ${n === 1 ? 'CONTROLLO' : 'CONTROLLI'}`));
});

test('PARITA-03 · la pastiglia dice 40 e 14, e sono due conteggi diversi', async ({ page }) => {
  await apriAspetto(page);
  const pastiglia = page.locator('#schermoImpostazioni .settings-badge');
  await expect(pastiglia).toBeVisible();
  await expect(pastiglia).toHaveText(`${CAMPI_IMPOSTAZIONI.length} controlli · ${TEMI.length} temi`);
  /*
   * ⛔ I DUE NUMERI SI DIMOSTRANO DAL DOM, e non coincidono con le righe in pagina — ecco perché
   *   vanno spiegati invece che copiati. Le righe dello schermo sono 41: i 40 controlli del
   *   contratto, più una riga che il contratto NON elenca. Quale sia, lo dice il DOM.
   */
  const righe = await page.evaluate(() => [...document.querySelectorAll('#schermoImpostazioni [data-setting-row]')].map((r) => r.dataset.settingRow));
  expect(righe.length).toBe(CAMPI_IMPOSTAZIONI.length + 1);
  const contratto = new Set(CAMPI_IMPOSTAZIONI.map((campo) => campo.id));
  expect(righe.filter((id) => !contratto.has(id))).toEqual(['workspaceRestore']);
  // E la metà «temi» ha una sorgente sua: le opzioni del select del tema, che sono 14.
  await expect(page.locator('[data-setting-row="themePresetSelect"] select option')).toHaveCount(TEMI.length);
});

test('PARITA-04 · la banda mostra il tema VERO, letto dalla radice', async ({ page }) => {
  await apriAspetto(page);
  const nome = page.locator('#schermoImpostazioni [data-settings-band-name]');
  const radice = await page.evaluate(() => document.documentElement.dataset.talosTheme ?? null);
  const etichetta = TEMI.find(([id]) => id === radice)?.[1] ?? '';
  await expect(nome, 'la banda non dice il tema che la radice dichiara').toHaveText(etichetta);
  // Il verso che morde: il nome segue la radice invece di essere la parola scritta a mano «Calm».
  const conRadice = async (valore) => {
    await page.evaluate((t) => {
      if (t === null) document.documentElement.removeAttribute('data-talos-theme');
      else document.documentElement.setAttribute('data-talos-theme', t);
    }, valore);
    return nome.textContent();
  };
  expect(await conRadice('forge')).toBe('Forge');
  expect(await conRadice('noir')).toBe('Noir');
  // ⛔ Senza radice, e con un tema che il contratto non conosce, il nome RESTA VUOTO: un tema
  //   inventato a schermo è peggio di un nome mancante.
  expect(await conRadice(null)).toBe('');
  expect(await conRadice('tema-inventato')).toBe('');
});

test('PARITA-05 · le misure della banda, come il mockup le dichiara', async ({ page }) => {
  await apriAspetto(page);
  const m = await page.locator('#schermoImpostazioni .settings-band').evaluate((banda) => {
    const cs = getComputedStyle(banda);
    const swatch = banda.querySelector('.settings-band__swatch');
    const barre = [...banda.querySelectorAll('.settings-band__swatch i')];
    const r = (el) => { const b = el.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; };
    return {
      stile: { display: cs.display, allineamento: cs.alignItems, gap: cs.gap, padding: cs.padding, raggio: cs.borderRadius, margine: cs.margin },
      swatch: { box: r(swatch), raggio: getComputedStyle(swatch).borderRadius, nascosta: swatch.getAttribute('aria-hidden') },
      barre: barre.map((b) => r(b)[0]),
      bottone: r(banda.querySelector('.settings-band__button'))[1],
      etichetta: banda.querySelector('.settings-band__button')?.textContent?.trim(),
      /* ⭐ L'icona del bottone: il mockup disegna `ic:'sun'` (`TALOS-Calm-Lab-04.html:2046`) e il
         path di quel sole sta nel suo dizionario a `:2013`. Si controlla il RIFERIMENTO e le
         COORDINATE: un port fatto «a somiglianza» passerebbe il nome e non queste due. */
      icona: (() => {
        const use = banda.querySelector('.settings-band__button use');
        const sim = document.querySelector('#i-sun');
        return {
          riferimento: use?.getAttribute('href') ?? null,
          sole: sim?.querySelector('circle')?.getAttribute('r') ?? null,
          razzi: sim?.querySelector('path')?.getAttribute('d') ?? null,
          /* ⛔ Il simbolo NON deve avere un `fill` proprio: un `fill` cablato nel sorgente batte il
             CSS che lo dipinge (svgicons.com, «Build an SVG Sprite…», letto 18/09/2026). */
          dipinto: sim?.getAttribute('fill') ?? null,
        };
      })(),
    };
  });
  expect(m.stile.display).toBe('flex');
  expect(m.stile.allineamento).toBe('center');
  expect(m.stile.gap).toBe('22px');
  expect(m.stile.padding).toBe('23px');
  expect(m.stile.raggio).toBe('14px');
  expect(m.stile.margine).toBe('28px 0px');
  expect(m.swatch.box).toEqual([86, 64]);
  expect(m.swatch.raggio).toBe('9px');
  // La miniatura è un disegno: uno screen reader non deve annunciarla.
  expect(m.swatch.nascosta).toBe('true');
  // Le due barre: la prima piena, la seconda accorciata a metà (44 e 22 nel mockup).
  expect(m.barre).toEqual([44, 22]);
  expect(m.icona.riferimento, 'la banda non usa più il sole del mockup').toBe('#i-sun');
  expect(m.icona.razzi, 'il path del sole non è più quello del mockup, carattere per carattere').toBe('M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5');
  expect(m.icona.sole).toBe('4');
  expect(m.icona.dipinto, 'il simbolo si è preso un fill proprio: il CSS non lo dipinge più').toBe(null);
  await expect(page.locator('#schermoImpostazioni .settings-band__button')).toHaveText('Temi e atmosfere');
});

test('PARITA-06 · «Temi e atmosfere» apre lo studio, dove i 14 temi sono raggiungibili', async ({ page }) => {
  await apriAspetto(page);
  await page.locator('#schermoImpostazioni .settings-band__button').click();
  const elenco = page.locator('dialog.td-modal[open] .td-theme-list[role="radiogroup"]');
  await expect(elenco).toBeVisible();
  const voci = elenco.locator('[role="radio"]');
  await expect(voci).toHaveCount(TEMI.length);
  // Le voci sono i temi del CONTRATTO, non un altro elenco: i nomi combaciano.
  const etichette = (await voci.allTextContents()).map((t) => t.replace(/[✓✓\s]+$/, '').trim());
  expect([...etichette].sort()).toEqual(TEMI.map(([, nome]) => nome).sort());
});

test('PARITA-07 · niente si perde: le righe sono ESATTAMENTE quelle di prima', async ({ page }) => {
  await apriAspetto(page);
  /*
   * ⛔ IL CONTRATTO HA DUE ASSI, E NON VANNO CONFUSI — misurato il 18/09/2026 sul pacchetto
   *   temporaneo, non dedotto: `sezione` dice in QUALE pannello la riga si disegna, `gruppo` dice a
   *   QUALE dei cinque gruppi appartiene. Il gruppo «design» ha 12 controlli nel contratto ma solo
   *   **7** si disegnano in questo pannello: gli altri 5 sono comandi della conversazione e vivono
   *   nel pannello della Chat (`sezione:'chat'`) — ed è esattamente per questo che il gruppo si
   *   chiama «Interfaccia e **conversazione**».
   *   ⇒ Le RIGHE IN PAGINA si contano su `sezione`; i NUMERI della pastiglia si contano su `gruppo`.
   *     Due domande diverse, due numeri diversi: 35 righe disegnate contro 26 controlli contati.
   */
  const attesi = CAMPI_IMPOSTAZIONI.filter((campo) => campo.sezione === 'appearance');
  const righe = await page.evaluate(() => [...document.querySelectorAll('#setting-panel-appearance [data-setting-row]')]
    .map((r) => ({ id: r.dataset.settingRow, migrata: r.dataset.tdMigrata ?? null, gruppo: r.closest('[data-settings-group]')?.dataset.settingsGroup ?? null, visibile: r.getBoundingClientRect().width > 0 })));
  // Nessuna riga del contratto è sparita: l'unica in più è quella fuori contratto, per nome.
  const ids = new Set(attesi.map((campo) => campo.id));
  expect(righe.filter((r) => !ids.has(r.id)).map((r) => r.id), 'la riga in più non è più quella di prima').toEqual(['workspaceRestore']);
  expect(attesi.filter((campo) => !righe.some((r) => r.id === campo.id)).map((campo) => campo.id), 'una riga del contratto è sparita').toEqual([]);
  expect(new Set(righe.map((r) => r.id)).size, 'una riga è duplicata nel DOM').toBe(righe.length);
  // Le 14 migrate sono ESATTAMENTE quelle del contratto, e sono nascoste ma presenti.
  expect(righe.filter((r) => r.migrata === 'si').map((r) => r.id).sort()).toEqual([...CONTROLLI_MIGRATI].sort());
  for (const r of righe.filter((x) => x.migrata === 'si')) expect(r.visibile, `${r.id} non è più nascosta`).toBe(false);
  // Ogni gruppo disegna le SUE righe: il conteggio in testata non è un numero appeso, ha sotto le righe.
  const perGruppo = {};
  for (const r of righe) { const g = (perGruppo[r.gruppo] ??= { righe: 0, migrate: 0 }); g.righe += 1; if (r.migrata === 'si') g.migrate += 1; }
  for (const [chiave] of GRUPPI_MOCKUP) {
    const suoi = CAMPI_IMPOSTAZIONI.filter((campo) => campo.gruppo === chiave && campo.sezione === 'appearance');
    const fuoriContratto = righe.filter((r) => r.gruppo === chiave && !ids.has(r.id)).length;
    expect(perGruppo[chiave]?.righe ?? 0, `le righe disegnate nel gruppo ${chiave}`).toBe(suoi.length + fuoriContratto);
    expect(perGruppo[chiave]?.migrate ?? 0, `le righe migrate del gruppo ${chiave}`).toBe(suoi.filter((campo) => CONTROLLI_MIGRATI.includes(campo.id)).length);
  }
  // Lo schermo INTERO: i 40 controlli del contratto più la riga fuori contratto, tutti vivi, senza doppioni.
  const schermo = await page.evaluate(() => [...document.querySelectorAll('#schermoImpostazioni [data-setting-row]')].map((r) => r.dataset.settingRow));
  expect(schermo.length).toBe(CAMPI_IMPOSTAZIONI.length + 1);
  expect(new Set(schermo).size).toBe(schermo.length);
  // Il gruppo «Spazio di lettura» non duplica il suo controllo (sarebbero due posti che scrivono
  // lo stesso dato): lo NOMINA, e apre la porta dove il controllo vive davvero.
  const chat = page.locator('#setting-panel-appearance > [data-settings-group="chat"]');
  await expect(chat.locator('[data-settings-group-field-name]')).toHaveText('Chat a tutta larghezza');
  await expect(chat.locator('[data-settings-row]')).toHaveCount(0);
  await chat.locator('[data-settings-group-go="chat"]').click();
  await expect(page.locator('#setting-panel-chat')).toBeVisible();
  await expect(page.locator('[data-setting-row="chatFullWidthToggle"]')).toBeVisible();
});

test('PARITA-08 · la colonna da 300px è PRENOTATA, e finché è vuota non si vede', async ({ page }) => {
  await apriAspetto(page);
  const telaio = page.locator('#schermoImpostazioni .settings-layout');
  await expect(telaio).toHaveCount(1);
  const colonne = async () => telaio.evaluate((el) => {
    const aside = el.querySelector(':scope > .settings-aside');
    return { griglia: getComputedStyle(el).gridTemplateColumns, gap: getComputedStyle(el).gap, vuota: aside.childElementCount === 0, display: getComputedStyle(aside).display };
  });
  /*
   * ⛔ AGGIORNATA il 19/09/2026 — qui la prova difendeva la PRENOTAZIONE VUOTA: «una colonna sola,
   *   la colonna non deve rubare spazio a nessuno», e per provare il secondo tempo ci si infilava a
   *   mano un `div` dentro lo slot. Quello stato **non esiste più nel prodotto**: la colonna
   *   dell'anteprima è diventata una **funzione vera** (la corsia B l'ha montata in Aspetto,
   *   `sincronizzaAnteprima` → `montaAnteprimaTema`), quindi lo slot è **occupato** appena la
   *   sezione si apre, con dentro il canvas dell'anteprima.
   * ⇒ Si asserisce la verità nuova, e non serve più iniettare niente: la griglia è a **due** colonne,
   *   la seconda è **300px**, e la colonna ha **il suo contenuto** (non è più vuota).
   * ⛔ E il verso che conta resta: **a finestra stretta il mockup la NASCONDE**, non la impila.
   */
  const conAnteprima = await colonne();
  expect(conAnteprima.vuota, 'lo slot dell\'anteprima è occupato: l\'anteprima è una funzione vera').toBe(false);
  expect(conAnteprima.display).not.toBe('none');
  expect(conAnteprima.gap).toBe('36px');
  const due = await telaio.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').map((v) => Math.round(Number.parseFloat(v))));
  expect(due).toHaveLength(2);
  expect(due[1], 'la colonna riservata non è più da 300px').toBe(300);
  await expect(page.locator('#schermoImpostazioni .settings-aside .appearance-preview')).toBeVisible();
  /* ⛔ E LA METÀ CHE MANCAVA, dallo STESSO blocco del mockup: `@media (max-width:1080px)` non
     accorcia solo la griglia — `.appearance-preview{display:none}`. A finestra stretta l'anteprima
     SPARISCE, non si impila sotto il contenuto. Il contenitore è la schermata: a 1024 di viewport
     sono 748px, sotto la soglia degli 820. */
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.waitForTimeout(150);
  const stretta = await telaio.evaluate((el) => {
    const aside = el.querySelector(':scope > .settings-aside');
    return { griglia: getComputedStyle(el).gridTemplateColumns, slot: getComputedStyle(aside).display, figli: aside.childElementCount };
  });
  expect(stretta.figli, 'la prova misura un caso vuoto: l’anteprima non è più dentro lo slot').toBe(1);
  expect(stretta.griglia.split(' '), 'a finestra stretta la griglia non è più a una colonna sola').toHaveLength(1);
  expect(stretta.slot, 'il mockup a finestra stretta l’anteprima la NASCONDE, non la impila').toBe('none');
});

test('PARITA-09 · «Aggiungi modello» apre la modale, e le due strade portano a cose vere', async ({ page }) => {
  await apriAspetto(page, 'appearance');
  const bottone = page.locator('#schermoImpostazioni [data-settings-add-model]');
  // Fuori dal Laboratorio il bottone non c'è: appartiene alla testata di quella sezione.
  await expect(bottone).toBeHidden();
  await page.evaluate(() => window.__talosHarnessUiRuntime?.setSettingsSection?.('models', { persist: false }));
  await expect(bottone).toBeVisible();
  const modale = page.locator('#settingsAddModel');
  await expect(modale).toBeHidden();
  await bottone.click();
  await expect(modale).toBeVisible();
  await expect(modale.locator('[data-settings-add-title]')).toHaveText('Aggiungi al tuo laboratorio');
  // Esc la chiude e il fuoco torna a chi l'ha aperta: è il contratto di `showModal()`.
  await page.keyboard.press('Escape');
  await expect(modale).toBeHidden();
  await expect(bottone).toBeFocused();
  // STRADA 1 — il file dal disco: la modale si chiude e si arriva al vero bottone d'importazione,
  // che è quello di sempre (`#modelLabImportButton`): nessun import riscritto per l'occasione.
  await bottone.click();
  await expect(modale).toBeVisible();
  await modale.locator('[data-settings-road="file"]').click();
  await expect(modale).toBeHidden();
  await expect(page.locator('#setting-panel-models')).toBeVisible();
  await expect(page.locator('#modelLabImportButton')).toBeVisible();
  // STRADA 2 — il catalogo Hugging Face, dove la ricerca è vera.
  await bottone.click();
  await expect(modale).toBeVisible();
  await modale.locator('[data-settings-road="hf"]').click();
  await expect(modale).toBeHidden();
  await expect(page.locator('#modelLabHfSearch')).toBeVisible();
});

test('PARITA-10 · le altre nove sezioni non hanno una testata di gruppo e si aprono come prima', async ({ page }) => {
  await apriAspetto(page);
  /*
   * ⛔ AGGIORNATA il 19/09/2026 — e la ragione è un CAMBIO DI PROGETTO, non un test da piegare.
   *   Diceva: «le testate dei gruppi esistono SOLO nell'Aspetto: cinque, tutte lì dentro», e
   *   pretendeva 5 in tutto e **0** fuori. Era vero prima della FASE 2; la fase ha poi dato a ogni
   *   carta delle altre otto la **stessa testata**, dalla **stessa fabbrica** (`testataCarta`,
   *   `settings-view.ts:490`) — una sola forma per un solo mestiere, che è la scelta giusta.
   * ⇒ L'invariante che questa prova esiste per difendere resta VERO, e si dice meglio: fuori
   *   dall'Aspetto una testata appartiene a **una carta** (`.talos-settings__section`), cioè non è
   *   l'apparato dei gruppi del mockup rovesciato altrove — ed è esattamente ciò che il conteggio
   *   16-contro-5 segnalava senza dirlo.
   */
  const testate = await page.evaluate(() => {
    const tutte = [...document.querySelectorAll('#schermoImpostazioni [data-settings-group-head]')];
    const fuori = tutte.filter((t) => !t.closest('#setting-panel-appearance'));
    return {
      totali: tutte.length,
      fuoriAspetto: fuori.length,
      fuoriSenzaCarta: fuori.filter((t) => !t.closest('.talos-settings__section')).length,
      unaPerCarta: fuori.every((t) => t.closest('.talos-settings__section')?.querySelectorAll(':scope > [data-settings-group-head]').length === 1),
    };
  });
  expect(testate.totali).toBeGreaterThanOrEqual(GRUPPI_MOCKUP.length);
  expect(testate.fuoriAspetto).toBe(testate.totali - GRUPPI_MOCKUP.length);
  expect(testate.fuoriSenzaCarta, 'una testata fuori dall\'Aspetto che non appartiene a una carta è l\'apparato del mockup sparso altrove').toBe(0);
  expect(testate.unaPerCarta, 'ogni carta ha UNA testata, non due').toBe(true);
  // E ogni sezione si apre ancora, con la sua intestazione: la corsia non ha rubato la navigazione.
  for (const sezione of SEZIONI_IMPOSTAZIONI.map((s) => s.id)) {
    await page.evaluate((s) => window.__talosHarnessUiRuntime?.setSettingsSection?.(s, { persist: false }), sezione);
    const pannello = page.locator(`#setting-panel-${sezione}`);
    await expect(pannello, `la sezione ${sezione} non si apre più`).toBeVisible();
    await expect(page.locator('#schermoImpostazioni .settings-section-heading h2')).not.toBeEmpty();
    // Banda e pastiglia sono dell'Aspetto: fuori di lì non devono restare appese.
    if (sezione !== 'appearance') {
      await expect(page.locator('#schermoImpostazioni .settings-band'), `la banda resta accesa in ${sezione}`).toBeHidden();
      await expect(page.locator('#schermoImpostazioni .settings-badge')).toBeHidden();
    }
  }
});
