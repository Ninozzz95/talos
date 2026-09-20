import { test } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * ============================================================================
 * LE FOTO DEL CONFRONTO — FASE 1, 18/09/2026
 * ============================================================================
 * Coppie `<nome>_<tema>_mockup.png` / `<nome>_<tema>_real.png`, stessa vista, stessa larghezza,
 * stesso tema. Owner: «non ce bisogno affiancarle basta che fai foto singole e poi le nomini a
 * coppia».
 *
 * ⛔ MA LA RICERCA DICE IL CONTRARIO, e va scritto invece che nascosto: le linee guida sul
 *   design QA (fonte: `github.com/ColourCloudSky/design-qa-review-skill` e
 *   `lobehub.com/skills/denish12-code-ai-design-parity-review`, letti il 18/09/2026) dicono
 *   che «mettere il riferimento e l'implementazione nello STESSO input di confronto» è
 *   obbligatorio, e che «due immagini separate non contano come confronto affiancato».
 *   ⇒ Le coppie si producono come le vuole l'owner, e il GIUDIZIO si dà guardandole insieme.
 *   Sono due cose diverse: la comodità di chi guarda e il metodo di chi giudica.
 *
 * ⛔ COS'È QUESTO CONFRONTO: una verifica di CONFORMITÀ, non una critica di design. Risponde a
 *   «combacia con quello che abbiamo deciso di costruire?».
 * ⛔ E NON SI GIUDICA IL CONTENUTO: le differenze fra i dati dimostrativi del mockup e i dati
 *   veri dell'app (RAM viva, date di misura, modelli veri contro i 15 finti) NON sono difetti.
 *   Le linee guida sono esplicite: «only judge style, not content». Quelle differenze si
 *   DICHIARANO come attese.
 *
 * ⛔ SOLO DOVE IL MOCKUP HA CONTENUTO. Delle 10 voci della sua sidebar, 7 sono ATTENUATE
 *   (`disabled`, `opacity .58`, nessuna rotta le mostra) e il mockup stesso scrive «Le voci
 *   attenuate sono fuori da questo primo lotto». Fotografare `chat`, `tools`, `memoria`,
 *   `privacy`, `costi`, `workspace`, `account` sarebbe confrontare l'app col NULLA.
 *   Qui: `aspetto` + i 4 tab del laboratorio + i 3 lati della pagina modello.
 *
 * ⛔ PERCHÉ QUESTO FILE SOSTITUISCE `_confronto-exa.spec.mjs`, che resta come storia:
 *   1. puntava a `http://127.0.0.1:4210/TALOS-Calm-Lab.html`, e su quella porta c'è un altro
 *      server che risponde 404 su quel file — il mockup è AUTONOMO e si apre con `file://`;
 *   2. non aveva i PIN. La ricerca del 18/09/2026 dice che oltre alle animazioni spente servono
 *      `locale`, `timezoneId`, `colorScheme` e `deviceScaleFactor` fissati: date e numeri
 *      formattati cambiano fra locale diversi e producono DIFFERENZE FINTE;
 *   3. faceva le 10 sezioni, di cui 7 non esistono nel mockup.
 *
 * ⛔ LA TRAPPOLA CHE HA GIÀ BRUCIATO UN GIRO: nel mockup le voci della sidebar nascono da un
 *   template e NON hanno testo affidabile — cliccarle per testo lasciava la pagina ferma e
 *   OTTO FOTO SU OTTO erano la stessa sezione. Il selettore vero è
 *   `[data-action="navigate"][data-value="…"]`.
 */
const USCITA = 'C:/Users/Antonino/Downloads/confronto-fase1';
const MOCKUP = 'file:///C:/Users/Antonino/Downloads/TALOS-Calm-Lab-04.html';
const APP = 'http://127.0.0.1:4174/';
const ID_MODELLO = 'unsloth-GLM-4-7-Flash-GGUF-0d32489ecb9d-GLM-4-7-Flash-Q4-K-M-gguf';

/*
 * ⛔ IL MOCKUP RICORDA IL TEMA (lo salva in `localStorage`), quindi CLICCARE ALLA CIECA LO PORTA
 *   NEL TEMA OPPOSTO. Misurato il 18/09: le foto del mockup uscivano CHIARE mentre quelle
 *   dell'app erano SCURE — due lati in temi diversi, cioè un confronto falso in ogni riga.
 *   Si LEGGE lo stato e si clicca solo se serve; e se dopo il clic non è scuro, si FALLISCE.
 */
async function apriMockup(page) {
  await page.goto(MOCKUP);
  await page.waitForTimeout(1200);
  const modo = () => page.evaluate(() => document.body.dataset.mode || document.documentElement.dataset.mode || '');
  if (await modo() !== 'dark') {
    await page.locator('#quick-theme').click({ timeout: 5000 });
    await page.waitForTimeout(600);
  }
  const dopo = await modo();
  if (dopo !== 'dark') throw new Error(`IL MOCKUP NON È SCURO: data-mode=${dopo}. Il confronto sarebbe fra due temi diversi.`);
}

async function apriApp(page, sezione, schedaLab = null) {
  await page.goto(APP);
  await page.waitForTimeout(2200);
  await page.evaluate(({ s }) => {
    const voce = document.querySelector('.talos-sidebar [data-vaia="impostazioni"]');
    const gruppo = voce?.closest('.td-nav-group');
    const testata = gruppo?.id ? document.querySelector(`.talos-sidebar [aria-controls="${gruppo.id}"]`) : null;
    if (testata?.getAttribute('aria-expanded') === 'false') testata.click();
    voce?.click();
    // `persist:false` è obbligatorio: col default `true` la sonda scriverebbe in localStorage.
    window.__talosHarnessUiRuntime?.setSettingsSection?.(s, { persist: false });
  }, { s: sezione });
  await page.waitForTimeout(1200);
  await page.waitForTimeout(600);
  if (schedaLab) {
    await page.locator(`[data-lab-scheda="${schedaLab}"]`).first().click({ timeout: 5000 });
    await page.waitForTimeout(900);
  }
}

test('CONFRONTO FASE 1 — le coppie, mockup e app, alle due risoluzioni', async ({ page }) => {
  test.setTimeout(1_800_000);
  mkdirSync(USCITA, { recursive: true });
  /*
   * ⛔ DUE RISOLUZIONI, owner 18/09/2026: «fai le foto dalla prossima volta il 1440p e 1080p».
   *   Prima si faceva solo 1440×900 — che non è né l'una né l'altra. Si guarda la stessa vista
   *   alle due dimensioni perché a larghezze diverse cambiano le colonne, i testi che vanno a
   *   capo e le griglie: un difetto può vederlo una e non l'altra.
   * ⛔ Ricerca 18/09/2026 (fonte: `github.com/currents-dev/playwright-best-practices-skill` e
   *   `github.com/testdino-hq/playwright-skill`, `core/visual-regression.md`): **1920×1080** è
   *   il preset desktop standard delle pipeline di confronto visivo; **2560×1440 non è un
   *   preset documentato**, quindi qui è una viewport DICHIARATA, non un default. E la viewport
   *   va fissata ESPLICITAMENTE: senza, la dimensione dipende dal monitor fisico e due
   *   esecuzioni danno fotografie diverse.
   */
  const VISTE = [{ nome: '1440p', width: 2560, height: 1440 }, { nome: '1080p', width: 1920, height: 1080 }];
  /*
   * ⛔ LA LINGUA SI DICHIARA: senza `uiLanguage` l'app parte in INGLESE ed è il predefinito.
   *   Un confronto col mockup italiano sarebbe falso in ogni riga.
   */
  /*
   * ⛔ IL TEMA STA QUI, NON IN UN `setAttribute` DOPO. `data-mode` è il meccanismo del MOCKUP:
   *   sull'app non cambia niente. E scrivere `colorMode` DOPO il caricamento non serve a nulla,
   *   perché questo init script riscrive `localStorage` a OGNI navigazione — compreso il
   *   `reload()` — e cancella la preferenza appena scritta. Misurato: due giri di fotografie
   *   sono usciti CHIARI con la parola «dark» nel nome del file.
   * ⛔ Owner, 18/09/2026: «usa solo tema scuro». Quindi il tema è qui, dichiarato una volta.
   */
  await page.addInitScript(() => {
    window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: 'it', colorMode: 'dark' }, chat: {}, workspaces: {} }));
  });
  /* ⛔ Il 4174 è il server dell'OWNER: si legge e si fotografa. Ogni non-GET viene FERMATA. */
  const bloccate = [];
  await page.route('**/*', route => {
    const m = route.request().method();
    if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return route.continue();
    bloccate.push(`${m} ${route.request().url()}`);
    return route.abort();
  });

  /** Il mestiere ripetuto: due foto, stessa vista, stessa risoluzione, stesso tema. */
  async function coppia(nome, vista, vaiAlMockup, vaiAllApp) {
    const base = `${nome}_${vista.nome}`;
    await vaiAlMockup();
    writeFileSync(join(USCITA, `${base}_mockup.png`), await page.screenshot({ animations: 'disabled', caret: 'hide' }));
    await vaiAllApp();
    writeFileSync(join(USCITA, `${base}_real.png`), await page.screenshot({ animations: 'disabled', caret: 'hide' }));
    console.log(`CONFRONTO fatto: ${base}`);
  }

  /*
   * ⛔ UN TEMA SOLO, QUELLO SCURO — owner, 18/09/2026: «non ce bisogno di fare due temi diversi,
   *   salta questa regola, non ha senso usa solo tema scuro». La regola dei due temi resta viva
   *   per la VERIFICA dell'app (un velo d'avvio usciva chiaro su app scura); per le fotografie
   *   del confronto col mockup vale il tema scuro e basta.
   *   Il tema NON si scrive qui: sta nell'`addInitScript`, perché quello riscrive `localStorage`
   *   a ogni navigazione e una scrittura fatta dopo verrebbe cancellata.
   */
  for (const vista of VISTE) {
    await page.setViewportSize({ width: vista.width, height: vista.height });

    // 1 · Aspetto — l'unica sezione PIENA nel mockup, con la banda tema e i 5 gruppi.
    await coppia('aspetto', vista,
      async () => { await apriMockup(page); await page.locator('[data-action="navigate"][data-value="appearance"]').first().click({ timeout: 5000 }); await page.waitForTimeout(900); },
      async () => apriApp(page, 'appearance'));

    // 2 · I QUATTRO tab del laboratorio, come li ha il mockup.
    for (const [nome, scheda] of [['lab-huggingface', 'models'], ['lab-provider', 'providers'], ['lab-download', 'downloads'], ['lab-sistema', 'system']]) {
      await coppia(nome, vista,
        async () => {
          await apriMockup(page);
          await page.locator('[data-action="navigate"][data-value="models"]').first().click({ timeout: 5000 });
          await page.waitForTimeout(700);
          await page.locator(`[data-action="tab"][data-value="${scheda}"]`).first().click({ timeout: 5000 });
          await page.waitForTimeout(900);
        },
        async () => apriApp(page, 'models', scheda));
    }

    // 3 · LA PAGINA DEL MODELLO, tre lati (il mockup ne ha tre, non cinque).
    for (const lato of ['card', 'files', 'compatibility']) {
      await coppia(`pagina-modello-${lato}`, vista,
        async () => { await apriMockup(page); await page.goto(`${MOCKUP}#/impostazioni/modelli/scheda/local%3Aqwen8/${lato}`); await page.waitForTimeout(2200); },
        async () => { await page.goto(`${APP}#/impostazioni/modelli/scheda/${ID_MODELLO}/${lato}`); await page.waitForTimeout(2600); });
    }
  }

  /*
   * ⛔ LA GUARDIA DEL TEMA — nasce da un difetto vero, che ha prodotto un giro di foto FALSE.
   *   `data-mode` è il meccanismo del MOCKUP: sull'app non cambiava niente, e le due fotografie
   *   dello stesso lato nei due temi pesavano entrambe 164.182 byte, cioè erano la stessa
   *   immagine. Si vede dal NUMERO prima ancora che dall'immagine.
   * ⛔ E non è una guardia che può solo dire «bene»: se il tema scuro non arriva, QUESTA
   *   FALLISCE e le foto non si consegnano.
   */
  const luminanza = (rgb) => { const n = (rgb.match(/\d+/g) || []).slice(0, 3).map(Number); return n.length === 3 ? (n[0] * 0.299 + n[1] * 0.587 + n[2] * 0.114) : 255; };
  const chiaro = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  if (luminanza(chiaro) > 128) throw new Error(`IL TEMA SCURO NON È ARRIVATO: il fondo dell'app è ${chiaro}. Le foto sarebbero chiare e false.`);

  /*
   * ⛔ LA GUARDIA DELLE RISOLUZIONI — si legge la dimensione VERA dentro il PNG (i due interi a
   *   16 e 20 byte dall'inizio), non quella che credevo di aver chiesto. Una viewport chiesta e
   *   una ottenuta possono non coincidere, e allora le foto sarebbero di un'altra misura senza
   *   che nessuno se ne accorga. Fonte: il caso documentato in `playwright-snapshots`
   *   (`references/responsive-breakpoints.md`) letto il 18/09/2026 — in browser mode la
   *   dimensione dipende dal MONITOR FISICO se la viewport non è fissata esplicitamente.
   */
  const misura = (file) => { const b = readFileSync(file); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };
  const sbagliate = [];
  for (const vista of VISTE) {
    for (const nome of ['aspetto_', 'lab-huggingface_', 'lab-provider_', 'lab-download_', 'lab-sistema_', 'pagina-modello-card_', 'pagina-modello-files_', 'pagina-modello-compatibility_']) {
      for (const lato of ['mockup', 'real']) {
        const f = join(USCITA, `${nome}${vista.nome}_${lato}.png`);
        const m = misura(f);
        if (m.w !== vista.width || m.h !== vista.height) sbagliate.push(`${nome}${vista.nome}_${lato}: ${m.w}×${m.h} invece di ${vista.width}×${vista.height}`);
      }
    }
  }
  if (sbagliate.length) throw new Error(`FOTO DI MISURA SBAGLIATA:\n${sbagliate.join('\n')}`);

  // ⛔ Se una scrittura è partita, va detto: sarebbe un danno al server dell'owner.
  writeFileSync(join(USCITA, 'LEGGIMI.txt'), [
    'Coppie: <nome>_<risoluzione>_mockup.png e <nome>_<risoluzione>_real.png.',
    'Due risoluzioni per ogni vista: 1440p (2560x1440) e 1080p (1920x1080), tema scuro (owner 18/09/2026).',
    '',
    'SOLO le viste che il mockup HA: aspetto, i quattro tab del laboratorio, i tre lati della pagina modello.',
    'Le sette sezioni attenuate del mockup (chat, strumenti, memoria, privacy, costi, file, account) NON sono',
    'fotografate: nel mockup non esistono, sono voci disabled senza rotta.',
    '',
    'Pin delle foto: 1440x900, locale it-IT, timezone Europe/Rome, animazioni spente, cursore nascosto, uiLanguage it.',
    '',
    'ATTESE, e non sono difetti (le linee guida: «only judge style, not content»):',
    '  - i dati dimostrativi del mockup contro i dati veri dell\'app: RAM viva, date di misura,',
    '    modelli veri al posto dei 15 finti, conteggi reali;',
    '  - le sette sezioni dell\'app che nel mockup non hanno contenuto.',
    '',
    `Richieste non-GET partite verso il 4174: ${bloccate.length === 0 ? 'NESSUNA' : bloccate.join(', ')}`,
    `Generato il ${new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}.`,
  ].join('\n'));
  console.log(`Scritture bloccate verso il 4174: ${bloccate.length === 0 ? 'NESSUNA' : bloccate.join(', ')}`);
});
