/*
 * LA COLONNA DELL'ANTEPRIMA VIVA — il cancello della porta di `aside.appearance-preview`.
 *
 * Questo file prova UNA cosa sola, e la prova misurando il DOM vero dentro la app vera:
 * che `montaAnteprimaTema()` disegni la colonna destra di «Aspetto e movimento» con le misure
 * del mockup `TALOS-Calm-Lab-04.html` (md5 952fd467eff2cdd331f968c419fa1cc0), che il canvas sia
 * QUELLO dell'engine riusato (`creaAnteprimaScena` di `theme-studio.js`, non una copia), e che la
 * copia segua la lingua della radice e il movimento ridotto si fermi E RIPARTI.
 *
 * ⛔ COME SI CARICA IL MODULO NELLA PAGINA (e perche' cosi').
 *   Il modulo e' ESM sotto `src/`, e la pagina servita ha `script-src 'self'`: uno script inline
 *   non parte. Si serve quindi il modulo da un percorso finto (`/__at/**`) con `page.route`, come
 *   fa la corsia sorella in `lab-scheda-modello.spec.mjs` (`/__c4/**`), e si importa con `import()`.
 *   ⛔ MA NON si possono servire i SORGENTI uno per uno: la chiusura di questo modulo e' di **11
 *     file** (misurata il 18/09/2026, `file:` in `src/`) e due di quelli sono **TypeScript**
 *     (`design-system/overlays/manager.ts`, `app/lifecycle.ts`, importati con l'estensione
 *     esplicita da `components/modale-td.js`): il browser li rifiuta con un SyntaxError, e un
 *     `manager` finto non basta perche' `modale-td.js` ne importa un VALORE
 *     (`registeredOverlayManager`). ⇒ Si impacchetta con **esbuild 0.28.2**, che e' lo stesso
 *     strumento e le stesse opzioni di `scripts/build.mjs` (`bundle:true, format:'esm',
 *     platform:'browser', target:['chrome120'], charset:'utf8'`): il codice che gira nella pagina
 *     e' il prodotto, passato dalla sua stessa catena di costruzione.
 *
 * ⛔ LA PROVA CHE MORDE (5 mutazioni, una per test, in fondo al file). Non basta che la spec sia
 *   verde: se togliendo una riga del modulo o una dichiarazione del foglio la spec restasse verde,
 *   non starebbe guardando niente. Ogni mutazione si serve da `/__at-muta/<nome>/**`, con lo stesso
 *   esbuild e la stessa catena, e il test pretende che la MISURA CAMBI e che il predicato che era
 *   verde diventi falso:
 *     · `senza-didascalia` — via `didascalia` dall'append: la didascalia non esiste piu' (AT-01 rossa)
 *     · `canvas-nudo`      — via `canvas.className = 'appearance-canvas'`: il canvas perde
 *                            posizione e opacita' (AT-04 rossa)
 *     · `lingua-fissa`     — `linguaDellaRadice()` torna sempre 'it': la copia non segue piu' la
 *                            lingua della radice (AT-03 rossa)
 *     · `senza-giro`       — il verso di RITORNO del movimento ridotto diventa un no-op: dopo
 *                            `no-preference` la tela non riparte piu' (MUT-04 rossa)
 *     · `senza-tetto`      — via `max-width:300px` dal foglio: in una traccia da 420 la colonna
 *                            misura 420 (AT-02 rossa)
 *
 * ⛔ COSA NON PROVA, dichiarato. (1) Non prova che il montaggio in pagina lo faccia qualcun altro:
 *   `settings-view.ts` e' di un'altra corsia e non e' toccato da qui. (2) Non conta i fotogrammi al
 *   secondo: prova che i PIXEL cambiano mentre l'anteprima anima e che NON cambiano quando e'
 *   ferma — una prova di movimento, non di fluidita'. (3) Non prova `ferma()` come "nessun
 *   `requestAnimationFrame` vivo": prova che il canvas e' staccato, che la colonna esce dal DOM e
 *   che la radice non la resuscita; il `cancelAnimationFrame` e' dentro `creaAnteprimaScena`
 *   (`theme-studio.js:608`) e qui si verifica l'effetto visibile, non il contatore.
 *   (4) Nella pagina di questa spec `t()` non ha dizionario: `applicaLingua` vive nel bundle della
 *   app, non in quello servito qui. Non e' una scorciatoia che indebolisce la prova — le tre frasi
 *   che passano da `t()` (occhiello, etichetta, nota) NON hanno traduzione in `src/i18n/`
 *   (verificato il 18/09/2026: zero occorrenze), quindi in italiano restano in tutte e due le
 *   lingue, esattamente come nel mockup.
 *
 * RICERCA — fatta il 18/09/2026, PRIMA di scrivere questo file, su QUESTA implementazione:
 *  · Canvas: come si prova che una tela ha davvero disegnato e che si muove. Le fonti convergono
 *    su tre gradini — `toDataURL()` con lunghezza > ~1 kB (una tela VUOTA sta sotto), scansione dei
 *    pixel di fondo, e confronto con tolleranza, mai uguaglianza esatta: le tabelle degli
 *    anti-pattern citano «pixel-perfect assertions» e «not waiting for render» come i due errori
 *    che rendono rossa una suite sana (currents-dev, `playwright-best-practices-skill`,
 *    `testing-patterns/canvas-webgl.md`; `sceneview/sceneview` issue #1674, «canvas render
 *    assertions»; letti il 18/09/2026). ⇒ Qui: lunghezza > 1 kB per «ha disegnato», e
 *    l'uguaglianza/disuguaglianza delle IMPRONTE solo come booleano, mai un diff di pixel.
 *  · `prefers-reduced-motion` nei due versi e il suo ordine: `page.emulateMedia` persiste dentro il
 *    test e va riportato indietro esplicitamente; la fonte riporta che `test.use({reducedMotion})`
 *    non ha effetto (su Playwright 1.61.1 — la versione NON e' la nostra, 1.62.1, quindi la cosa non
 *    e' misurata qui) e che percio' la verifica che conta e' quella scritta DENTRO la pagina,
 *    `matchMedia(...).matches`, che la fonte chiama «load-bearing» (scrolltest.com, «Emulating Dark
 *    Mode, Reduced Motion, and Print in Playwright»; QASkills.sh, «Accessibility Testing Reduced
 *    Motion for Real Product Flows»; letti il 18/09/2026). ⇒ Qui si usa `page.emulateMedia` e la
 *    preferenza si RILEGGE dalla pagina dopo averla chiesta: se l'emulazione non arrivasse, il test
 *    lo dice invece di dare la colpa all'anteprima. La stessa fonte avverte che una preferenza letta
 *    UNA VOLTA all'avvio non reagisce al cambio: qui l'engine la rilegge a ogni fotogramma
 *    (`theme-studio.js:540`) e il modulo ascolta `change` — ed e' proprio il verso di ritorno che la
 *    mutazione `senza-giro` spegne.
 *
 * ⛔ IL 4174 NON SI TOCCA: ogni richiesta che lo nomina viene ABORTITA e contata; se una sola
 *   passasse, il test fallisce in `afterEach`. Le prove girano sul server isolato della suite
 *   (`playwright.config.mjs`: porta 4176, store vuoto a ogni giro).
 */
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { expect, test } from '@playwright/test';
import esbuild from 'esbuild';

import { TESTI_ANTEPRIMA } from '../../src/components/anteprima-tema.js';
import { DESCRIZIONI_TEMI, TESTO_STATO } from '../../src/components/theme-studio.js';

/* ------------------------------------------------------------------ le misure del mockup */

/* Lette dal vivo il 18/09/2026 sul mockup aperto con Playwright (1440x900, sezione «Aspetto e
   movimento»), `getBoundingClientRect` + `getComputedStyle`. Sono le stesse che il foglio
   `src/styles/anteprima-tema.css` dichiara una per una col numero accanto. */
const MOCKUP = Object.freeze({
  larghezzaColonna: 300,
  paddingTopColonna: '4px',
  occhiello: { fontSize: '10px', lineHeight: '15px', letterSpacing: '1.7px', marginBottom: '20px' },
  chrome: { altezza: 33, padding: '0px 12px', gap: '4px' },
  corpo: { padding: '25px 19px 17px' },
  data: { fontSize: '10px', letterSpacing: '1px', lineHeight: '15px' },
  titolo: { fontSize: '23px', marginTop: '12px', marginBottom: '8px', letterSpacing: '-1.38px', fontWeight: '500' },
  sottotitolo: { fontSize: '12px', lineHeight: '20.4px' },
  /* ⛔ Il raggio e' dichiarato `9px 9px 3px 9px` (il mockup), ma `getComputedStyle` lo restituisce
     nella forma CORTA `9px 9px 3px`, perche' il quarto angolo coincide col secondo: `9px 9px 3px` vale
     TL 9, TR 9, BR 3, BL = TR = 9, cioe' esattamente la stessa figura. Il numero e' quello vero che
     il browser da' ALLA STESSA DICHIARAZIONE, non una mia riscrittura. */
  messaggio: { marginLeft: '45px', marginTop: '23px', marginBottom: '15px', padding: '10px 12px', radius: '9px 9px 3px' },
  risposta: { borderLeftWidth: '2px', paddingLeft: '10px', lineHeight: '26.6px' },
  composer: { altezza: 48, padding: '8px 9px', gap: '8px', marginTop: '38px', radius: '9px' },
  plus: { fontSize: '20px', lineHeight: '30px', padding: '0px 5px' },
  didascalia: { altezza: 36, padding: '10px 16px', fontSize: '10px', lineHeight: '15px' },
  nota: { marginTop: '14px', marginLeft: '2px', gap: '7px', fontSize: '11px' },
  marchio: { fontSize: '7px', letterSpacing: '1.26px' },
  canvas: { opacity: '0.7', zIndex: '0' },
  /* L'unica eccezione dichiarata al sistema di design: il mockup porta questa ombra, il prodotto ha
     `--talos-shadow-card` con geometria diversa. «Identico al mockup» vince, e il colore del tema
     non si perde perche' il riquadro ha comunque bordo e fondo dai token. */
  ombra: 'rgba(0, 0, 0, 0.09) 0px 14px 36px 0px',
});

/* ------------------------------------------------------------------ il ponte e il foglio */

const RADICE = resolve(import.meta.dirname, '..', '..');
const SENTIERO_FOGLIO = '/__at/styles/anteprima-tema.css';
const SENTIERO_MODULO = '/__at/anteprima-tema.js';

/** La preferenza della app: senza, la pagina parte in INGLESE. Con, parte in italiano. */
const IMPOSTAZIONI = (lingua, modoColore = 'dark') => JSON.stringify({
  version: 1,
  appearance: { uiLanguage: lingua, colorMode: modoColore },
  chat: {},
  workspaces: {},
});
const CHIAVE_IMPOSTAZIONI = 'talos.harness.desktop.settings.v1';

/*
 * Il ponte: un ingresso VIRTUALE (mai scritto nel repo) che ri-esporta il modulo della colonna e,
 * accanto, i due attrezzi veri del prodotto che servono a comandarla — `impostaAspetto` (che scrive
 * sul CONTROLLO vero e ne emette l'evento, `theme-studio.js:263`) e `applicaLingua` (che e' la
 * funzione con cui la app applica la lingua, `lingua.js:117`). Non e' una fixture: sono le stesse
 * funzioni che usa lo studio dei temi, raggiungibili nella pagina solo perche' il bundle le porta.
 */
const PONTE = `
export * from '../../src/components/anteprima-tema.js';
export { impostaAspetto, valoreAspetto, aspettoCorrente, TESTO_STATO, DESCRIZIONI_TEMI } from '../../src/components/theme-studio.js';
export { applicaLingua } from '../../src/components/lingua.js';
`;

/**
 * Impacchetta le sorgenti vere con lo STESSO esbuild e le STESSE opzioni di `scripts/build.mjs`.
 * @param {{file:string, da:string, a:string}|null} muta la riga da togliere, per la prova che morde
 * @returns {Promise<string>} il bundle ESM, in memoria (niente file scritti)
 */
async function impacchetta(muta = null) {
  if (muta && !muta.file.endsWith('.js')) throw new Error(`mutazione su un file non .js: ${muta.file}`);
  const plugins = muta ? [{
    name: 'muta-una-riga',
    setup(build) {
      /* ⛔ Il confronto si fa sul NOME NORMALIZZATO, non con un filtro regex sul percorso: su Windows
         `args.path` arriva col separatore di sistema (`\`) e un filtro scritto con `/` non
         corrisponderebbe mai — la mutazione non arriverebbe nel bundle e il test resterebbe verde
         senza che nessuno se ne accorga. Qui il filtro e' per estensione e la scelta la fa il codice. */
      build.onLoad({ filter: /\.[cm]?js$/ }, async (args) => {
        if (!args.path.replace(/\\/g, '/').endsWith(muta.file)) return null;
        const testo = await readFile(args.path, 'utf8');
        if (!testo.includes(muta.da)) throw new Error(`la riga da mutare non esiste piu' in ${muta.file}: ${muta.da}`);
        return { contents: testo.replace(muta.da, muta.a), loader: 'js' };
      });
    },
  }] : [];
  const esito = await esbuild.build({
    absWorkingDir: RADICE,
    stdin: { contents: PONTE, resolveDir: join(RADICE, 'tests', 'browser'), sourcefile: 'ponte-prova.js', loader: 'js' },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['chrome120'],
    charset: 'utf8',
    legalComments: 'none',
    minify: false,
    write: false,
    logLevel: 'silent',
    plugins,
  });
  /* ⛔ Con un ingresso da `stdin` esbuild chiama l'uscita `<stdout>` (misurato: non finisce per `.js`),
     quindi si prende l'unico file prodotto invece di cercarlo per estensione — e si controlla che
     dentro ci sia DAVVERO il modulo: senza questa guardia un bundle vuoto verrebbe servito e ogni
     misura cadrebbe per un guasto mio invece che per una riga tolta. */
  const js = esito.outputFiles[0]?.text;
  if (!js || !js.includes('montaAnteprimaTema')) throw new Error('il bundle non contiene il modulo della colonna');
  return js;
}

/* ------------------------------------------------------------------ la pagina */

/** Accende la app, registra i percorsi finti e monta la colonna. */
async function apri(page, {
  lingua = 'it',
  modoColore = 'dark',
  traccia = 300,
  modulo = SENTIERO_MODULO,
  foglio = SENTIERO_FOGLIO,
  css: cssScelto = null,
  muta = null,
} = {}) {
  page.versoIl4174 = [];
  const js = await impacchetta(muta);
  /* Il foglio servito e' quello vero letto dal disco. Una mutazione del foglio passa da `css`:
     servire il foglio VERO a un percorso finto, come farebbe il resto della spec, non muterebbe
     niente — e il test che pretende la misura cambiata resterebbe verde senza accorgersene. */
  const css = cssScelto ?? await readFile(join(RADICE, 'src', 'styles', 'anteprima-tema.css'), 'utf8');

  await page.route('**/*', async (route) => {
    const richiesta = route.request();
    if (richiesta.url().includes('4174')) { page.versoIl4174.push(richiesta.url()); return route.abort(); }
    const percorso = new URL(richiesta.url()).pathname;
    if (percorso === foglio) return route.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body: css });
    if (percorso === modulo) return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: js });
    return route.continue();
  });

  /* ⛔ Si scrive SOLO SE NON C'E' GIA'. Un `addInitScript` gira a OGNI navigazione: riscrivendo il
     valore a ogni ricaricamento cancellerebbe il cambio di lingua o di tema fatto dal test, e la app
     tornerebbe sempre allo stato di partenza — misurato il 18/09/2026: la preferenza tornava `it` a
     ogni reload e l'inglese non arrivava mai. Il primo caricamento la scrive (senza, la app parte in
     inglese); i cambi successivi sono scelte vere e sopravvivono come quelle di una persona. */
  await page.addInitScript(([chiave, valore]) => {
    try {
      if (!localStorage.getItem(chiave)) localStorage.setItem(chiave, valore);
    } catch { /* niente storage: si va avanti, la lingua la dira' la radice */ }
  }, [CHIAVE_IMPOSTAZIONI, IMPOSTAZIONI(lingua, modoColore)]);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#talosAvvio', { state: 'detached', timeout: 15000 }).catch(() => {});
  /* La precondizione vera non e' «la app e' partita» ma «i token ci sono»: senza `--talos-panel` la
     colonna misurerebbe un colore vuoto e ogni confronto coi token sarebbe una coincidenza. */
  await page.waitForFunction(() => Boolean(
    getComputedStyle(document.documentElement).getPropertyValue('--talos-panel').trim()
    && document.querySelector('.appearance-preview, #talosApp, main, body'),
  ), null, { timeout: 15000 });

  await monta(page, { traccia, modulo, foglio });
  return page;
}

/** La griglia del mockup + il montaggio. Gira NELLA pagina. */
async function monta(page, { traccia = 300, modulo = SENTIERO_MODULO, foglio = SENTIERO_FOGLIO } = {}) {
  await page.evaluate(async ([tracciaLarga, urlModulo, urlFoglio]) => {
    window.__at = window.__at || { vista: null, errori: [] };
    if (!window.__at.erroriAggiunti) {
      window.addEventListener('error', (e) => window.__at.errori.push(String(e.message)));
      window.__at.erroriAggiunti = true;
    }
    window.__at.vista?.ferma?.();
    document.getElementById('at-tela')?.remove();
    document.querySelectorAll('link[data-at-foglio]').forEach((l) => l.remove());

    /* Il foglio, atteso al caricamento: montare prima che sia arrivato farebbe misurare una colonna
       senza tetto e senza padding, e il primo numero sarebbe una coincidenza. */
    await new Promise((ok, ko) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.dataset.atFoglio = '1';
      link.href = urlFoglio;
      link.onload = () => ok(true);
      link.onerror = () => ko(new Error(`foglio non caricato: ${urlFoglio}`));
      document.head.append(link);
    });

    /* La GRIGLIA DEL MOCKUP: `minmax(0,1fr) 300px`, gap 36, `align-items: start`. La colonna sta
       nella seconda traccia, come nel mockup — non appesa al bordo della finestra. */
    const tela = document.createElement('div');
    tela.id = 'at-tela';
    tela.style.cssText = `position:fixed;inset:0;z-index:99990;background:var(--talos-background);`
      + `display:grid;grid-template-columns:minmax(0,1fr) ${tracciaLarga}px;gap:36px;align-items:start;`
      + `padding:24px;overflow:auto;`;
    /* ⛔ LA COLONNA STA NELLA SECONDA TRACCIA, e il posto vuoto davanti non e' decorazione: senza,
       la cella finisce nella PRIMA traccia (`minmax(0,1fr)`, che a 1440 px vale 1116) e ogni misura
       di larghezza diventa una misura del TETTO invece che della traccia — misurato il 18/09/2026:
       con la cella di qua il «240» non mordeva e la colonna restava 300. */
    const contenuto = document.createElement('div');
    contenuto.id = 'at-contenuto';
    const cella = document.createElement('div');
    cella.id = 'at-cella';
    /* ⛔ `min-width:0` sulla cella: un elemento di griglia ha `min-width:auto` e non scende sotto la
       larghezza minima del suo contenuto. La colonna ha gia' `min-width:0` per conto suo; e' la cella
       che deve lasciarla passare. Chi la monta in una griglia lo deve sapere. */
    cella.style.cssText = 'min-width:0;';
    tela.append(contenuto, cella);
    document.body.append(tela);

    const modulo3 = await import(urlModulo);
    window.__at.vista = modulo3.montaAnteprimaTema(cella, {});
    if (!window.__at.vista) throw new Error('montaAnteprimaTema ha risposto null');
  }, [traccia, modulo, foglio]);

  /* La scena arriva da un `import()` che finisce dopo: si aspetta che il canvas abbia DETTO la sua
     scena (`dataset.scene`, lo scrive l'engine in `disegna()`, `theme-studio.js:528`), non un tempo
     fisso. E' l'attesa-di-render che le fonti chiedono, presa dal prodotto stesso. */
  await page.waitForFunction((testoStato) => {
    const c = document.querySelector('.appearance-preview canvas');
    const d = document.querySelector('.appearance-preview .scene-caption');
    if (!c?.dataset?.scene || !c.dataset.sceneStatus || c.dataset.sceneStatus === 'assente') return false;
    /* ⛔ E NON BASTA LO STATO DELL'ENGINE. Prima si aspettava solo `dataset.sceneStatus`, e AT-05 e'
       passata due volte e la terza e' caduta leggendo «Anteprima animata» su uno stato gia'
       `reduced`. Il motivo, misurato: quello stato l'engine lo scrive anche DA SOLO, a ogni
       fotogramma del suo giro (`disegna()`, `theme-studio.js:527`), mentre la DIDASCALIA la scrive
       il modulo dentro `aggiorna()` — fra le due voci ci sta fino a un fotogramma. Aspettare il
       proxy e leggere la cosa e' esattamente cio' che fa cadere una prova una volta su tre. Qui si
       aspetta che le due voci siano D'ACCORDO, e da li' in poi le letture sono stabili. */
    if (!d) return true; /* ⛔ MUT-01 TOGLIE la didascalia: se la fascia non c'e', non e' questa
       attesa a doverlo dire — lo dice l'asserzione di quella mutazione (`didascalia: null` e la
       lista dei figli). Un'attesa che pretende la cosa che una mutazione sta togliendo
       trasformerebbe la prova in un rosso per il motivo sbagliato: e' successo, in tutti e due i
       giri di fila. L'assenza e' ammessa qui e NEGATA la' dove serve. */
    return Boolean(d.textContent?.startsWith(testoStato[c.dataset.sceneStatus]));
  }, TESTO_STATO, { timeout: 15000 });
}

/* ------------------------------------------------------------------ le letture */

/** Tutto quello che si vuole sapere, misurato nella pagina. NIENTE di dedotto. */
const LEGGI = () => {
  const preso = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const c = getComputedStyle(el);
    return {
      larghezza: +r.width.toFixed(2), altezza: +r.height.toFixed(2),
      fontSize: c.fontSize, lineHeight: c.lineHeight, letterSpacing: c.letterSpacing, fontWeight: c.fontWeight,
      marginTop: c.marginTop, marginBottom: c.marginBottom, marginLeft: c.marginLeft, marginRight: c.marginRight,
      padding: c.padding, paddingTop: c.paddingTop, paddingLeft: c.paddingLeft, gap: c.gap, radius: c.borderRadius,
      opacity: c.opacity, position: c.position, zIndex: c.zIndex, pointerEvents: c.pointerEvents,
      display: c.display, background: c.backgroundColor, color: c.color, borderColor: c.borderTopColor,
      borderLeftWidth: c.borderLeftWidth, borderLeftColor: c.borderLeftColor, boxShadow: c.boxShadow,
      overflow: c.overflow, placeItems: c.placeItems, flex: c.flex, boxSizing: c.boxSizing,
      maxWidth: c.maxWidth, minWidth: c.minWidth, width: c.width, inset: c.inset,
      fontFamily: c.fontFamily, ariaHidden: el.getAttribute('aria-hidden'), inert: el.hasAttribute('inert'),
      classe: (el.className?.baseVal ?? el.className) || null,
    };
  };
  const classe = (el) => (el.className?.baseVal ?? el.className) || el.tagName;
  const colonna = document.querySelector('.appearance-preview');
  const finestra = colonna?.querySelector('.preview-window') || null;
  const canvas = colonna?.querySelector('canvas') || null;
  const corpo = finestra?.querySelector('.preview-body') || null;
  const composer = finestra?.querySelector('.preview-composer') || null;

  /* Il colore di un TOKEN, risolto dal browser: si confronta col colore vero dell'elemento, cosi'
     un colore scritto a mano nel foglio non puo' passare per un token.
     ⛔ QUI HO SBAGLIATO UNA VOLTA, E LA MISURA L'HA PRESO — 18/09/2026, Playwright su una pagina
     vuota, fuori dal repo: dentro `cssText` un nome di proprieta' in camelCase viene **SCARTATO IN
     SILENZIO** dal parser (`sonda.style.cssText = 'position:absolute;visibility:hidden;'
     + 'backgroundColor:var(--talos-panel)'` lascia il cssText senza quella dichiarazione), e la
     lettura esce `rgba(0, 0, 0, 0)` — **lo stesso valore di un token che non esiste**, cioe' un
     numero che sembra un colore e non lo e'. Non era colpa della `var()`: lo fa anche con un colore
     letterale, quindi e' il NOME, non il valore. Con `color` (una parola sola) non si vedeva; con
     `backgroundColor`, `borderTopColor`, `borderLeftColor` si'. ⇒ Si dichiara con `setProperty` e
     si legge con `getPropertyValue`, nome kebab-case: e' l'API con cui si scrive una dichiarazione
     per nome, e la lettura e' la stessa cosa che `cs.backgroundColor` (misurato: `rgb(37, 38, 42)`
     in tutti e due i modi). ⭐ Il verso che deve fallire fallisce: `var(--talos-non-esiste)` da'
     trasparente — quindi questa sonda puo' smentire, non e' una misura che passa sempre. */
  const sonda = document.createElement('div');
  sonda.style.setProperty('position', 'absolute');
  sonda.style.setProperty('visibility', 'hidden');
  document.body.append(sonda);
  const tinta = (proprieta, dichiarazione) => {
    sonda.style.setProperty(proprieta, dichiarazione);
    return getComputedStyle(sonda).getPropertyValue(proprieta);
  };
  const tinte = {
    pannello: tinta('background-color', 'var(--talos-panel)'),
    tenue: tinta('background-color', 'var(--talos-panel-soft)'),
    sfondo: tinta('background-color', 'var(--talos-background)'),
    bordo: tinta('border-top-color', 'var(--talos-border)'),
    accento: tinta('border-left-color', 'var(--talos-accent)'),
    successo: tinta('color', 'var(--talos-success)'),
    testo: tinta('color', 'var(--talos-text)'),
    tenueTesto: tinta('color', 'var(--talos-muted)'),
  };
  sonda.remove();

  return {
    tagColonna: colonna?.tagName || null,
    colonna: preso(colonna),
    figliColonna: [...(colonna?.children || [])].map(classe),
    figliFinestra: [...(finestra?.children || [])].map(classe),
    figliCorpo: [...(corpo?.children || [])].map(classe),
    figliComposer: [...(composer?.children || [])].map(classe),
    occhiello: preso(colonna?.querySelector('.eyebrow')),
    chrome: preso(finestra?.querySelector('.preview-chrome')),
    tondi: [...(finestra?.querySelectorAll('.preview-chrome > span') || [])].map(preso),
    marchio: preso(finestra?.querySelector('.preview-chrome small')),
    corpo: preso(corpo),
    data: preso(finestra?.querySelector('.preview-date')),
    titolo: preso(finestra?.querySelector('.preview-body h3')),
    sottotitolo: preso(finestra?.querySelector('.preview-body > p')),
    messaggio: preso(finestra?.querySelector('.preview-message')),
    risposta: preso(finestra?.querySelector('.preview-answer')),
    composer: preso(composer),
    plus: preso(finestra?.querySelector('.preview-plus')),
    invito: preso(finestra?.querySelector('.preview-testo')),
    iconaComposer: preso(composer?.querySelector('svg')),
    didascalia: preso(finestra?.querySelector('.scene-caption')),
    nota: preso(colonna?.querySelector('.preview-note')),
    iconaNota: preso(colonna?.querySelector('.preview-note svg')),
    finestra: preso(finestra),
    testi: {
      occhiello: colonna?.querySelector('.eyebrow')?.textContent ?? null,
      marchio: finestra?.querySelector('.preview-chrome small')?.textContent ?? null,
      data: finestra?.querySelector('.preview-date')?.textContent ?? null,
      titolo: finestra?.querySelector('.preview-body h3')?.textContent ?? null,
      sottotitolo: finestra?.querySelector('.preview-body > p')?.textContent ?? null,
      messaggio: finestra?.querySelector('.preview-message')?.textContent ?? null,
      risposta: finestra?.querySelector('.preview-answer')?.innerText?.replace(/\s+/g, ' ').trim() ?? null,
      composer: finestra?.querySelector('.preview-testo')?.textContent ?? null,
      didascalia: finestra?.querySelector('.scene-caption')?.textContent ?? null,
      nota: colonna?.querySelector('.preview-note')?.textContent ?? null,
      etichetta: colonna?.getAttribute('aria-label') ?? null,
    },
    canvas: canvas ? {
      ...preso(canvas), widthAttr: canvas.width, heightAttr: canvas.height,
      scena: canvas.dataset.scene ?? null, stato: canvas.dataset.sceneStatus ?? null,
      pixelLarghezza: canvas.getBoundingClientRect().width,
      /* ⛔ E QUANTI PIXEL HA DAVVERO DIPINTO, contati nel bitmap e non dedotti dalla lunghezza del
         PNG: e' la stessa misura presa sul mockup (18/09/2026: `aside.appearance-preview` a 1440,
         tela 300x423, **0** pixel opachi e didascalia «Scena spenta»), quindi le due colonne si
         possono mettere a confronto nella STESSA unita'. Il contesto dell'engine e' 2d con
         `alpha:true` (`theme-studio.js:474`), quindi i pixel trasparenti si distinguono. */
      pixelOpachi: (() => {
        const ctx = canvas.getContext?.('2d');
        if (!ctx?.getImageData) return null;
        const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let n = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n += 1;
        return n;
      })(),
    } : null,
    finestraStato: finestra?.dataset.stato ?? null,
    tinte,
    radice: {
      tema: document.documentElement.getAttribute('data-talos-theme'),
      modo: document.documentElement.getAttribute('data-theme'),
      scena: document.documentElement.getAttribute('data-talos-scene'),
      lingua: document.documentElement.dataset.linguaApplicata ?? null,
      lang: document.documentElement.getAttribute('lang'),
    },
    movimentoRidotto: matchMedia('(prefers-reduced-motion: reduce)').matches,
    dpr: devicePixelRatio,
    nascosto: document.hidden,
    erroriPagina: window.__at?.errori ?? [],
  };
};

const leggi = async (page) => await page.evaluate(LEGGI);

/** L'impronta dei pixel della tela: un numero piccolo, cosi' non attraversa la rete un PNG intero. */
const IMPRONTA = () => {
  const c = document.querySelector('.appearance-preview canvas');
  if (!c) return null;
  const dati = c.toDataURL('image/png');
  let impronta = 0;
  for (let i = 0; i < dati.length; i += 1) impronta = (impronta * 31 + dati.charCodeAt(i)) | 0;
  return { impronta, byte: dati.length };
};
const impronta = async (page) => await page.evaluate(IMPRONTA);

/** Vero appena due letture consecutive della tela DIFFERISCONO (l'anteprima sta animando). */
async function laTelaCambia(page, { campioni = 14, ogniMs = 140 } = {}) {
  let prima = await impronta(page);
  for (let i = 1; i < campioni; i += 1) {
    await page.waitForTimeout(ogniMs);
    const dopo = await impronta(page);
    if (dopo && prima && dopo.impronta !== prima.impronta) return true;
    prima = dopo;
  }
  return false;
}

/** Falso appena due letture consecutive DIFFERISCONO: serve a dire «ferma» e non «ferma per caso». */
async function laTelaRestaFerma(page, { campioni = 6, ogniMs = 250 } = {}) {
  let prima = await impronta(page);
  for (let i = 1; i < campioni; i += 1) {
    await page.waitForTimeout(ogniMs);
    const dopo = await impronta(page);
    if (!dopo || !prima || dopo.impronta !== prima.impronta) return false;
    prima = dopo;
  }
  return true;
}

/* ------------------------------------------------------------------ le prove */

test.use({ viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

test.describe('la colonna dell\'anteprima viva — il port di «Aspetto e movimento»', () => {
  test.afterEach(async ({ page }) => {
    expect(page.versoIl4174, 'nessuna richiesta deve raggiungere il server dell\'owner (4174)').toEqual([]);
  });

  test('ANTEPRIMA-01 — la colonna e\' 300 px, e i blocchi stanno nell\'ordine del mockup', async ({ page }) => {
    await apri(page);
    const m = await leggi(page);

    expect(m.tagColonna).toBe('ASIDE');
    expect(m.colonna.larghezza).toBeCloseTo(MOCKUP.larghezzaColonna, 1);
    expect(m.colonna.paddingTop).toBe(MOCKUP.paddingTopColonna);

    /* L'ordine: occhiello, riquadro, nota. E dentro il riquadro: barra, corpo, didascalia.
       ⛔ Il canvas e' il PRIMO figlio del riquadro e non un elemento a parte: lo inserisce
       `creaAnteprimaScena` con `prepend` (`theme-studio.js:479`), ed e' la stessa disposizione del
       mockup — assoluto dentro il riquadro, sotto le tre fasce — non due colonne affiancate. */
    /*
     * ⛔ IL QUARTO BLOCCO — `preview-stop` — NON È NEL MOCKUP, ed è la deviazione VOLUTA del
     *   18/09/2026: WCAG 2.2.2 chiede un comando di pausa per un movimento che dura oltre i 5
     *   secondi, e la colonna disegna una scena che si muove da sola. Owner: «si aggiunge il
     *   comando». La prova lo **pretende** invece di tollerarlo: chi lo togliesse trova qui il
     *   rosso, e la ragione scritta accanto.
     * ⛔ E quando si confronta la colonna col mockup, questa riga è ciò che va **dichiarato**
     *   come differenza: quattro blocchi contro tre.
     */
    expect(m.figliColonna).toEqual(['eyebrow', 'preview-window theme-live-preview', 'preview-note', 'preview-stop']);
    expect(m.figliFinestra).toEqual(['appearance-canvas', 'preview-chrome', 'preview-body', 'scene-caption']);
    expect(m.figliCorpo).toEqual(['preview-date', 'H3', 'P', 'preview-message', 'preview-answer', 'preview-composer']);
    expect(m.figliComposer).toEqual(['preview-plus', 'preview-testo', 'i i--sm']);

    /* Il riquadro e' la somma delle sue fasce (il mockup: 33 + 352,08 + 36 + 2 bordi = 423,08). */
    expect(m.finestra.altezza).toBeCloseTo(MOCKUP.chrome.altezza + m.corpo.altezza + MOCKUP.didascalia.altezza + 2, 1);
    expect(m.chrome.altezza).toBeCloseTo(MOCKUP.chrome.altezza, 1);
    expect(m.chrome.padding).toBe(MOCKUP.chrome.padding);
    expect(m.chrome.gap).toBe(MOCKUP.chrome.gap);
    expect(m.corpo.padding).toBe(MOCKUP.corpo.padding);
    expect(m.didascalia.altezza).toBeCloseTo(MOCKUP.didascalia.altezza, 1);
    expect(m.didascalia.padding).toBe(MOCKUP.didascalia.padding);
    expect(m.didascalia.fontSize).toBe(MOCKUP.didascalia.fontSize);
    expect(m.didascalia.lineHeight).toBe(MOCKUP.didascalia.lineHeight);

    /* L'occhiello. */
    expect(m.occhiello.larghezza).toBeCloseTo(MOCKUP.larghezzaColonna, 1);
    expect(m.occhiello.fontSize).toBe(MOCKUP.occhiello.fontSize);
    expect(m.occhiello.lineHeight).toBe(MOCKUP.occhiello.lineHeight);
    expect(m.occhiello.letterSpacing).toBe(MOCKUP.occhiello.letterSpacing);
    expect(m.occhiello.marginBottom).toBe(MOCKUP.occhiello.marginBottom);

    /* I tondi della barra e il marchio in coda. */
    expect(m.tondi).toHaveLength(3);
    for (const tondo of m.tondi) { expect(tondo.larghezza).toBeCloseTo(5, 1); expect(tondo.radius).toBe('50%'); }
    expect(m.marchio.fontSize).toBe(MOCKUP.marchio.fontSize);
    expect(m.marchio.letterSpacing).toBe(MOCKUP.marchio.letterSpacing);

    /* La conversazione d'esempio: e' una FIGURA, non un'interfaccia. */
    expect(m.corpo.inert).toBe(true);
    expect(m.corpo.ariaHidden).toBe('true');
    expect(m.data.fontSize).toBe(MOCKUP.data.fontSize);
    expect(m.data.letterSpacing).toBe(MOCKUP.data.letterSpacing);
    expect(m.titolo.fontSize).toBe(MOCKUP.titolo.fontSize);
    expect(m.titolo.fontWeight).toBe(MOCKUP.titolo.fontWeight);
    expect(m.titolo.letterSpacing).toBe(MOCKUP.titolo.letterSpacing);
    expect(m.titolo.marginTop).toBe(MOCKUP.titolo.marginTop);
    expect(m.titolo.marginBottom).toBe(MOCKUP.titolo.marginBottom);
    expect(m.sottotitolo.fontSize).toBe(MOCKUP.sottotitolo.fontSize);
    expect(m.messaggio.marginLeft).toBe(MOCKUP.messaggio.marginLeft);
    expect(m.messaggio.marginTop).toBe(MOCKUP.messaggio.marginTop);
    expect(m.messaggio.marginBottom).toBe(MOCKUP.messaggio.marginBottom);
    expect(m.messaggio.padding).toBe(MOCKUP.messaggio.padding);
    expect(m.messaggio.radius).toBe(MOCKUP.messaggio.radius);
    expect(m.risposta.borderLeftWidth).toBe(MOCKUP.risposta.borderLeftWidth);
    expect(m.risposta.paddingLeft).toBe(MOCKUP.risposta.paddingLeft);
    expect(m.risposta.lineHeight).toBe(MOCKUP.risposta.lineHeight);

    /* Il compositore finto: sono i 30 px del «+» a dargli i 48 px del mockup. */
    expect(m.composer.altezza).toBeCloseTo(MOCKUP.composer.altezza, 1);
    expect(m.composer.padding).toBe(MOCKUP.composer.padding);
    expect(m.composer.gap).toBe(MOCKUP.composer.gap);
    expect(m.composer.marginTop).toBe(MOCKUP.composer.marginTop);
    expect(m.plus.fontSize).toBe(MOCKUP.plus.fontSize);
    expect(m.plus.lineHeight).toBe(MOCKUP.plus.lineHeight);
    expect(m.plus.padding).toBe(MOCKUP.plus.padding);
    expect(m.iconaComposer.larghezza).toBeCloseTo(14, 1);
    expect(m.iconaComposer.altezza).toBeCloseTo(14, 1);

    /* La nota sulla tavolozza: misura e icona di riuscita. */
    expect(m.nota.marginTop).toBe(MOCKUP.nota.marginTop);
    expect(m.nota.marginLeft).toBe(MOCKUP.nota.marginLeft);
    expect(m.nota.gap).toBe(MOCKUP.nota.gap);
    expect(m.nota.fontSize).toBe(MOCKUP.nota.fontSize);
    expect(m.iconaNota.larghezza).toBeCloseTo(13, 1);
    expect(m.iconaNota.color).toBe(m.tinte.successo);

    /*
     * ⛔ L'OMBRA È IL TOKEN DEL PRODOTTO, NON QUELLA DEL MOCKUP — owner, 18/09/2026.
     *   La corsia aveva messo l'ombra del mockup (`0 14px 36px rgb(0 0 0/9%)`) e l'aveva
     *   dichiarata come eccezione, con una nota onesta: «identico» vince sulla somiglianza.
     *   Il proprietario ha deciso dall'altra parte, quindi questa asserzione si **ribalta**.
     * ⛔ E si verifica contro il TOKEN VERO letto dal DOM, non contro una stringa copiata qui:
     *   `--talos-shadow-card` è dichiarata due volte (`index.css:86` scuro, `:137` chiaro), e una
     *   stringa scritta a mano invecchierebbe in silenzio. Così la prova dice quello che il
     *   prodotto dice davvero.
     */
    /*
     * ⛔ IL TOKEN VA FATTO RISOLVERE DAL BROWSER, non letto come stringa. Il token è scritto
     *   `0 8px 24px rgba(0,0,0,.18)` e il `boxShadow` calcolato è
     *   `rgba(0, 0, 0, 0.18) 0px 8px 24px 0px`: **la stessa ombra in due forme diverse**, e
     *   confrontarle come stringhe dava rosso su una cura giusta (misurato il 18/09/2026).
     *   Applicandolo a un elemento di prova, il browser lo risolve NELLA STESSA FORMA del
     *   computed: si confrontano due cose scritte allo stesso modo.
     */
    const ombraDelToken = await page.evaluate(() => {
      const sonda = document.createElement('div');
      sonda.style.boxShadow = 'var(--talos-shadow-card)';
      document.body.append(sonda);
      const valore = getComputedStyle(sonda).boxShadow;
      sonda.remove();
      return valore;
    });
    expect(ombraDelToken, 'il token deve esistere, o questa prova non prova niente').not.toBe('');
    expect(m.finestra.boxShadow, 'l’ombra della finestra deve essere il token del prodotto').toBe(ombraDelToken);
    expect(m.finestra.boxShadow, 'non deve essere quella del mockup').not.toBe(MOCKUP.ombra);
  });

  test('ANTEPRIMA-02 — la larghezza e\' un TETTO, non una misura', async ({ page }) => {
    await apri(page, { traccia: 420 });
    const larga = await leggi(page);
    expect(larga.colonna.larghezza, 'in una traccia da 420 la colonna resta 300').toBeCloseTo(MOCKUP.larghezzaColonna, 1);

    /* E in una traccia piu' stretta si stringe: `max-width` da solo, senza larghezza fissa. */
    await monta(page, { traccia: 240 });
    const stretta = await leggi(page);
    expect(stretta.colonna.larghezza).toBeCloseTo(240, 1);
    expect(stretta.colonna.larghezza).toBeLessThan(larga.colonna.larghezza);

    /* ⛔ SEGUE LA TRACCIA FINO IN FONDO, e non e' una deduzione: si stringe la traccia a 20 px e la
       colonna misura 20 — nessun pavimento di contenuto, nessuno sconfinamento. E' il `min-width:0`
       dell'aside che fa questo, ed e' la proprieta' che serve a chi la ospita: qualunque traccia le
       si dia, la colonna la rispetta (fino a 300) invece di far sbordare la griglia.
       ⛔ E NON si scrive che `min-width:0` SULLA CELLA serva: misurato il 18/09/2026 togliendolo, a
       traccia 240 la colonna resta 240 — non morde a queste larghezze, e affermarlo sarebbe una
       regola non provata. */
    const allaTraccia = await page.evaluate(() => {
      document.getElementById('at-tela').style.gridTemplateColumns = 'minmax(0,1fr) 20px';
      return +document.querySelector('.appearance-preview').getBoundingClientRect().width.toFixed(2);
    });
    expect(allaTraccia, 'la colonna segue la traccia, senza pavimento e senza sbordare').toBeCloseTo(20, 1);
    await page.evaluate(() => { document.getElementById('at-tela').style.gridTemplateColumns = 'minmax(0,1fr) 240px'; });
    await expect.poll(async () => Math.round((await leggi(page)).colonna.larghezza)).toBe(240);
  });

  test('ANTEPRIMA-03 — i testi sono quelli del mockup, e seguono la LINGUA DELLA RADICE', async ({ page }) => {
    await apri(page, { lingua: 'it' });
    const m = await leggi(page);

    /* ⛔ Le frasi non sono inventate qui: sono la tavola del modulo, e sono quelle del mockup. */
    expect(m.testi.occhiello).toBe(TESTI_ANTEPRIMA.it.occhiello);
    expect(m.testi.data).toBe(TESTI_ANTEPRIMA.it.data);
    expect(m.testi.titolo).toBe(TESTI_ANTEPRIMA.it.titolo);
    expect(m.testi.sottotitolo).toBe(TESTI_ANTEPRIMA.it.sottotitolo);
    expect(m.testi.messaggio).toBe(TESTI_ANTEPRIMA.it.messaggio);
    expect(m.testi.risposta).toBe(TESTI_ANTEPRIMA.it.risposta.join(' '));
    expect(m.testi.composer).toBe(TESTI_ANTEPRIMA.it.composer);
    expect(m.testi.nota).toBe(TESTI_ANTEPRIMA.it.nota);
    expect(m.testi.marchio).toBe('TALOS');
    expect(m.testi.etichetta).toBe(TESTI_ANTEPRIMA.it.etichetta);
    expect(m.radice.lingua).toBe('it');

    /* ⛔ LA LINGUA E' UNA SORGENTE VIVA. Il cambio si fa con la porta della app (preferenza +
       ricaricamento, la strada di `avvio.js`/`app.js`), non scrivendo un attributo a mano. */
    const telaPng = await impronta(page);
    await page.evaluate(([chiave, valore]) => localStorage.setItem(chiave, valore), [CHIAVE_IMPOSTAZIONI, IMPOSTAZIONI('en')]);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#talosAvvio', { state: 'detached', timeout: 15000 }).catch(() => {});
    await page.waitForFunction(() => document.documentElement.dataset.linguaApplicata === 'en', null, { timeout: 15000 })
      .catch((e) => { throw new Error(`la app non ha applicato l'inglese (data-lingua-applicata resta quello di partenza) — ${e.message}`); });
    await monta(page);

    const inglese = await leggi(page);
    expect(inglese.radice.lingua).toBe('en');
    expect(inglese.testi.data).toBe(TESTI_ANTEPRIMA.en.data);
    expect(inglese.testi.titolo).toBe(TESTI_ANTEPRIMA.en.titolo);
    expect(inglese.testi.messaggio).toBe(TESTI_ANTEPRIMA.en.messaggio);
    expect(inglese.testi.risposta).toBe(TESTI_ANTEPRIMA.en.risposta.join(' '));
    expect(inglese.testi.composer).toBe(TESTI_ANTEPRIMA.en.composer);
    /*
     * ⛔ QUESTI DUE ERANO IN ITALIANO ANCHE IN INGLESE, e la prova lo REGISTRAVA come se fosse
     *   una scelta: «nel mockup esistono SOLO in italiano … senza voce nel dizionario restano
     *   com'e'». Non era una scelta, era una **stringa non tradotta**: chi usava l'app in inglese
     *   leggeva «ANTEPRIMA DEL TEME» e «Palette dal foglio temi del prodotto.» in mezzo
     *   all'inglese. Corrette il 18/09/2026 in `TESTI_ANTEPRIMA.en`.
     * ⛔ E l'asserzione si RIBALTA di proposito: ora pretende che siano **diverse** dall'italiano.
     *   Una prova che si limitasse a «non è vuoto» lascerebbe tornare il difetto in silenzio.
     */
    expect(inglese.testi.occhiello, 'l’occhiello deve essere tradotto').not.toBe(TESTI_ANTEPRIMA.it.occhiello);
    expect(inglese.testi.nota, 'la nota deve essere tradotta').not.toBe(TESTI_ANTEPRIMA.it.nota);
    expect(inglese.testi.data).not.toBe(m.testi.data);

    /* E il cambio a SESSIONE VIVA: l'attributo della radice cambia, la colonna lo segue, e il canvas
       NON viene ricreato (la mutazione `lingua-fissa` fa cadere proprio questa parte). */
    await monta(page);
    const canvasPrima = await page.evaluate(() => {
      const c = document.querySelector('.appearance-preview canvas');
      c.dataset.marcaDiProva = '42';
      return { scena: c.dataset.scene, stato: c.dataset.sceneStatus };
    });
    await page.evaluate(([lingua]) => {
      document.documentElement.setAttribute('data-lingua-applicata', lingua);
      document.documentElement.setAttribute('lang', lingua);
    }, ['it']);
    await expect.poll(async () => (await leggi(page)).testi.data, { timeout: 5000 }).toBe(TESTI_ANTEPRIMA.it.data);
    const dopoTorno = await leggi(page);
    expect(dopoTorno.testi.data).toBe(TESTI_ANTEPRIMA.it.data);
    const canvasDopo = await page.evaluate(() => {
      const c = document.querySelector('.appearance-preview canvas');
      return { marca: c.dataset.marcaDiProva ?? null, scena: c.dataset.scene, stato: c.dataset.sceneStatus };
    });
    expect(canvasDopo.marca, 'il canvas NON si ricrea al cambio di lingua: si riscrivono i testi').toBe('42');
    expect(canvasDopo.scena).toBe(canvasPrima.scena);
    expect(canvasDopo.stato).toBe(canvasPrima.stato);
    expect(telaPng.byte, 'la tela deve aver disegnato qualcosa (un PNG vuoto sta sotto il kB)').toBeGreaterThan(1000);
  });

  test('ANTEPRIMA-04 — il canvas e\' quello VERO dell\'engine, e la didascalia dice la scena vera', async ({ page }) => {
    await apri(page);
    const m = await leggi(page);

    expect(m.canvas, 'il canvas deve esistere').not.toBeNull();
    expect(m.canvas.altezza).toBeGreaterThan(100);
    expect(m.canvas.larghezza).toBeGreaterThan(100);

    /* E' il canvas dell'engine, vestito col foglio di questa colonna: assoluto, dentro il riquadro,
       trasparente ai clic, attenuato, e SOTTO le tre fasce. */
    expect(m.canvas.position).toBe('absolute');
    expect(m.canvas.opacity).toBe(MOCKUP.canvas.opacity);
    expect(m.canvas.zIndex).toBe(MOCKUP.canvas.zIndex);
    expect(m.canvas.pointerEvents).toBe('none');
    for (const fascia of [m.chrome, m.corpo, m.didascalia]) expect(fascia.zIndex).toBe('1');
    expect(m.canvas.inert ?? false).toBe(false);

    /* La dimensione non e' un numero scritto: e' il contenitore misurato per il DPR, con il tetto di
       1.5 dell'engine (`theme-studio.js:513`). Se il modulo disegnasse di suo, questo non tornerebbe.
       ⛔ E il contenitore che l'engine misura e' il RIQUADRO, non il canvas: misurato il 18/09/2026,
       l'attributo vale 300 mentre il canvas dentro il bordo misura 298 — 300 - 2 bordi, esattamente
       la coppia del mockup (riquadro 300, canvas 298). Le due cose si asseriscono tutte e due, o il
       numero resterebbe ambiguo. */
    expect(m.canvas.widthAttr).toBe(Math.round(m.finestra.larghezza * Math.min(m.dpr, 1.5)));
    expect(m.canvas.larghezza, 'il canvas sta DENTRO il bordo del riquadro').toBeCloseTo(m.finestra.larghezza - 2, 1);
    expect(m.canvas.heightAttr).toBeGreaterThan(100);

    /* La scena e lo stato li scrive l'ENGINE nel `dataset` (`theme-studio.js:527-528`): questo modulo
       non li tocca mai, quindi la loro presenza e' la prova che e' l'engine a disegnare. */
    expect(m.canvas.scena).toBeTruthy();
    expect(m.canvas.stato).toBeTruthy();
    expect(Object.keys(TESTO_STATO)).toContain(m.canvas.stato);
    expect(m.finestraStato).toBe(m.canvas.stato);

    /* La didascalia: «<stato> · <nome della scena>», coi testi delle tavole del prodotto. */
    const nome = DESCRIZIONI_TEMI[m.canvas.scena]?.scena;
    expect(nome, `la scena ${m.canvas.scena} deve avere un nome nella tavola`).toBeTruthy();
    expect(m.testi.didascalia).toBe(`${TESTO_STATO[m.canvas.stato]} · ${nome}`);

    /* E ha DAVVERO disegnato: una tela vuota produce un PNG sotto il kB. */
    const tela = await impronta(page);
    expect(tela.byte).toBeGreaterThan(1000);
    /* ⛔ E QUI IL CONFRONTO COL MOCKUP, nella STESSA unita': li' la tela misura 300x423 e ha **0**
       pixel opachi, perche' la scena del mockup nasce spenta («Scena spenta · scelta predefinita»,
       misurato il 18/09/2026). Qui la scena la disegna l'engine del prodotto, quindi i pixel ci
       sono: misurati **76.885** su 285.300 (il 27%) il 18/09/2026 a 1440x900. La soglia e' un
       PAVIMENTO e non un'uguaglianza — la scena anima, il numero cambia a ogni fotogramma, e
       un'uguaglianza qui sarebbe un rosso a caso. Un tetto invece non lo si mette: e' la stessa
       disciplina di [[una-misura-ristretta-non-vede-cio-che-non-ti-aspetti]]. */
    expect(m.canvas.pixelOpachi, 'la tela ha dipinto davvero (il mockup, con la scena spenta, ne ha zero)').toBeGreaterThan(10000);
    expect(m.erroriPagina).toEqual([]);
  });

  test('ANTEPRIMA-05 — il movimento ridotto: si FERMA e RIPARTE (i due versi)', async ({ page }) => {
    await apri(page);
    const prima = await leggi(page);
    expect(prima.movimentoRidotto, 'la preferenza di partenza e\' «nessuna»').toBe(false);

    /* ⛔ QUESTO ATTENDE CIO' CHE SI ASSERISCE, non un suo proxy. La prima versione aspettava il solo
       `canvas.stato` — il `dataset` che scrive l'engine — e poi leggeva la didascalia: fra le due
       voci ci sta fino a un fotogramma (l'engine scrive lo stato anche da solo, a ogni giro), e
       infatti questo test e' passato due volte e alla terza e' caduto con «Anteprima animata»
       addosso a uno stato gia' `reduced`. Non era il prodotto: era l'attesa che guardava un dito
       mentre ne leggeva un altro. Qui si aspetta che stato E didascalia siano d'accordo. */
    const attendi = (stato) => expect.poll(async () => {
      const m = await leggi(page);
      return m.canvas.stato === stato && m.testi.didascalia.startsWith(`${TESTO_STATO[stato]} · `);
    }, { timeout: 5000 }).toBe(true);

    /* ⛔ Verso 1: la preferenza si accende. La verifica che `matchMedia` la veda sta DENTRO la
       pagina: `emulateMedia` da solo non prova niente se poi nessuno la legge. */
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
    await attendi('reduced');

    const fermo = await leggi(page);
    expect(fermo.testi.didascalia).toBe(`${TESTO_STATO.reduced} · ${DESCRIZIONI_TEMI[fermo.canvas.scena].scena}`);
    expect(await laTelaRestaFerma(page), 'a movimento ridotto la tela NON deve cambiare').toBe(true);

    /* ⛔ E cio' che deve RESTARE ACCESO resta: la preferenza non tocca misure ne' colori — la tela
       si ferma, la colonna no. (Cio' che regola la preferenza non deve spegnere altro.) */
    expect(fermo.colonna.larghezza).toBeCloseTo(prima.colonna.larghezza, 1);
    expect(fermo.finestra.altezza).toBeCloseTo(prima.finestra.altezza, 1);
    expect(fermo.didascalia.altezza).toBeCloseTo(prima.didascalia.altezza, 1);
    expect(fermo.finestra.background).toBe(prima.finestra.background);
    expect(fermo.finestra.borderColor).toBe(prima.finestra.borderColor);
    expect(fermo.testi.titolo).toBe(prima.testi.titolo);
    expect(fermo.canvas.larghezza).toBeCloseTo(prima.canvas.larghezza, 1);

    /* ⛔ Verso 2 — IL RITORNO, che e' la cura scritta in questo modulo: l'engine, quando decide di
       non disegnare, non riprogramma il giro (`theme-studio.js:552`), quindi senza un `aggiorna()`
       l'anteprima resterebbe ferma per sempre. La mutazione `senza-giro` fa cadere questo pezzo. */
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(false);
    await attendi('animating');
    expect(await laTelaCambia(page), 'tornata la preferenza, la tela deve RIPARTIRE').toBe(true);

    /* E l'altra sorgente della preferenza, la classe che il monolite mette sul corpo: stessa storia,
       nei due versi. */
    await page.evaluate(() => document.body.classList.add('reduce-motion'));
    await attendi('reduced');
    expect(await laTelaRestaFerma(page)).toBe(true);
    await page.evaluate(() => document.body.classList.remove('reduce-motion'));
    await attendi('animating');
    expect(await laTelaCambia(page)).toBe(true);

    /* Il terzo modo di fermare il renderer non e' una preferenza ma una scelta: `data-talos-motion-mode`.
       Si prova che la colonna lo segue come il resto della app. */
    await page.evaluate(() => document.documentElement.setAttribute('data-talos-motion-mode', 'off'));
    await attendi('renderer-fermo');
    await page.evaluate(() => document.documentElement.removeAttribute('data-talos-motion-mode'));
    await attendi('animating');

    expect((await leggi(page)).erroriPagina).toEqual([]);
  });

  test('ANTEPRIMA-06 — tema chiaro e scuro: i COLORI sono i token, le misure sono del mockup', async ({ page }) => {
    const foto = join(RADICE, 'artifacts', 'anteprima-tema');
    await mkdir(foto, { recursive: true });

    await apri(page, { modoColore: 'dark' });
    const scuro = await leggi(page);
    await page.screenshot({ path: join(foto, 'anteprima-1440-scuro.png') });

    /* Nel tema scuro il riquadro e' il token scuro, non un colore scritto a mano. */
    expect(scuro.radice.modo, 'il tema non deve essere riscritto sotto le mani').not.toBe('light');
    expect(scuro.finestra.background).toBe(scuro.tinte.pannello);
    expect(scuro.finestra.borderColor).toBe(scuro.tinte.bordo);
    expect(scuro.corpo.color).toBe(scuro.tinte.testo);
    expect(scuro.didascalia.color).toBe(scuro.tinte.tenueTesto);
    expect(scuro.occhiello.color).toBe(scuro.tinte.tenueTesto);
    expect(scuro.messaggio.background).toBe(scuro.tinte.tenue);
    expect(scuro.risposta.borderLeftColor).toBe(scuro.tinte.accento);
    expect(scuro.iconaNota.color).toBe(scuro.tinte.successo);

    /* Il cambio si chiede alla porta della app: preferenza + ricaricamento (`avvio.js:73` stampa
       `data-theme="light"` prima del primo disegno). */
    await page.evaluate(([chiave, valore]) => localStorage.setItem(chiave, valore), [CHIAVE_IMPOSTAZIONI, IMPOSTAZIONI('it', 'light')]);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#talosAvvio', { state: 'detached', timeout: 15000 }).catch(() => {});
    await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'light', null, { timeout: 15000 })
      .catch((e) => { throw new Error(`la app non e' passata al tema chiaro: ${e.message}`); });
    await monta(page);

    const chiaro = await leggi(page);
    await page.screenshot({ path: join(foto, 'anteprima-1440-chiaro.png') });
    expect(chiaro.radice.modo).toBe('light');
    expect(chiaro.finestra.background).toBe(chiaro.tinte.pannello);
    expect(chiaro.finestra.borderColor).toBe(chiaro.tinte.bordo);
    expect(chiaro.risposta.borderLeftColor).toBe(chiaro.tinte.accento);

    /* ⛔ E il punto: i colori CAMBIANO. Un colore scritto a mano nel foglio darebbe lo stesso
       valore nei due temi, e questo confronto lo direbbe. */
    expect(chiaro.finestra.background, 'i token differiscono fra chiaro e scuro').not.toBe(scuro.finestra.background);
    expect(chiaro.finestra.borderColor).not.toBe(scuro.finestra.borderColor);
    expect(chiaro.corpo.color).not.toBe(scuro.corpo.color);

    /* Le misure, invece, NON cambiano col tema: sono del mockup, non del tema. */
    for (const chiave of ['larghezza', 'altezza']) {
      expect(chiaro.colonna[chiave]).toBeCloseTo(scuro.colonna[chiave], 1);
      expect(chiaro.finestra[chiave]).toBeCloseTo(scuro.finestra[chiave], 1);
      expect(chiaro.composer[chiave]).toBeCloseTo(scuro.composer[chiave], 1);
    }
    expect(chiaro.occhiello.letterSpacing).toBe(scuro.occhiello.letterSpacing);
    expect(chiaro.canvas.opacity).toBe(scuro.canvas.opacity);
    expect(chiaro.erroriPagina).toEqual([]);
  });

  test('ANTEPRIMA-07 — sotto i 1080 px la colonna esce, come nel mockup', async ({ page }) => {
    await apri(page);
    expect((await leggi(page)).colonna.display).toBe('block');

    await page.setViewportSize({ width: 1080, height: 900 });
    await expect.poll(async () => (await leggi(page)).colonna.display, { timeout: 5000 }).toBe('none');

    await page.setViewportSize({ width: 1081, height: 900 });
    await expect.poll(async () => (await leggi(page)).colonna.display, { timeout: 5000 }).toBe('block');
  });

  test('ANTEPRIMA-08 — ferma(): il canvas si stacca, la colonna esce, e la radice non la resuscita', async ({ page }) => {
    await apri(page);
    const prima = await leggi(page);
    expect(prima.canvas).not.toBeNull();

    await page.evaluate(() => window.__at.vista.ferma());
    const dopo = await leggi(page);
    expect(dopo.tagColonna, 'la colonna esce dal DOM').toBeNull();

    /* E se la radice cambia ancora — tema, lingua, scena, movimento — non torna su, e non nasce un
       secondo canvas da nessuna parte. */
    await page.evaluate(() => {
      const r = document.documentElement;
      r.setAttribute('data-talos-theme', 'terminal');
      r.setAttribute('data-talos-scene', 'terminal');
      r.setAttribute('data-lingua-applicata', 'en');
      r.setAttribute('data-talos-motion-mode', 'off');
    });
    await page.waitForTimeout(600);
    const finale = await leggi(page);
    expect(finale.tagColonna).toBeNull();
    expect(finale.erroriPagina).toEqual([]);
    expect(await page.evaluate(() => document.querySelectorAll('.appearance-preview, .appearance-canvas').length)).toBe(0);
  });

  test('ANTEPRIMA-09 — la traccia stretta del mockup (1200 px): la colonna scende a 250, e la foto', async ({ page }) => {
    const foto = join(RADICE, 'artifacts', 'anteprima-tema');
    await mkdir(foto, { recursive: true });

    await apri(page, { modoColore: 'dark', traccia: 250 });
    await page.setViewportSize({ width: 1200, height: 900 });
    await expect.poll(async () => Math.round((await leggi(page)).colonna.larghezza), { timeout: 5000 }).toBe(250);
    const m = await leggi(page);
    await page.screenshot({ path: join(foto, 'anteprima-1200-scuro.png') });

    /* Sotto i 1250 px il mockup da' all'aside 250 px (misurato: `.settings-layout` passa a
       `minmax(0,1fr) 250px`, gap 24). Li' il tetto di 300 non morde: la colonna prende quello che
       la traccia le da'. ⛔ La prima volta avevo scritto qui che «il riquadro perde i due bordi
       (250 -> 248)»: FALSO, e la misura l'ha detto subito (scarto 2). Il riquadro misura **250**,
       quanto la traccia — e' il CANVAS dentro di lui a misurare 2 in meno, perche' il suo blocco
       contenitore e' il padding box del riquadro, dentro i due bordi da 1 px. E' la stessa coppia
       del mockup (300/298) misurata a 250: si asserisce la RELAZIONE, non due numeri sciolti.
       ⛔ E la traccia qui la da' la tela della spec: il GAP del rigo resta 36 come a 1440, mentre
       il mockup a 1200 usa 24 — quel numero appartiene alla griglia che OSPITA la colonna
       (`settings-view.ts`, un'altra corsia), non a questo foglio, che di gap non ne dichiara. */
    expect(m.colonna.larghezza).toBeCloseTo(250, 0);
    expect(m.finestra.larghezza).toBe(m.colonna.larghezza);
    expect(m.canvas.pixelLarghezza).toBeCloseTo(m.colonna.larghezza - 2, 1);
    expect(m.canvas.pixelLarghezza).toBeCloseTo(248, 1);
    expect(m.erroriPagina).toEqual([]);
  });
});

/* ------------------------------------------------------------------ la prova che morde */

/*
 * Ogni mutazione toglie UNA riga del modulo (o del foglio) e il test pretende che la misura cambi:
 * il predicato che era verde deve diventare falso. Il bundle si rifa' con lo stesso esbuild, quindi
 * la mutazione attraversa la stessa catena del codice vero.
 */
const MUTAZIONI = Object.freeze({
  'senza-didascalia': { file: '/components/anteprima-tema.js', da: 'finestra.append(chrome, corpo, didascalia);', a: 'finestra.append(chrome, corpo);' },
  'canvas-nudo': { file: '/components/anteprima-tema.js', da: "vista.canvas.className = 'appearance-canvas';", a: '/* mutato: il canvas resta senza la classe del foglio */' },
  'lingua-fissa': { file: '/components/anteprima-tema.js', da: 'return LINGUE_ANTEPRIMA.includes(codice) ? codice : LINGUA_DI_RIPIEGO;', a: "return LINGUA_DI_RIPIEGO; /* mutato: la lingua della radice non si legge piu' */" },
  'senza-giro': { file: '/components/anteprima-tema.js', da: 'const suMovimentoRidotto = () => { if (vivo) aggiorna(); };', a: 'const suMovimentoRidotto = () => { /* mutato: il verso di ritorno non esiste piu\' */ };' },
});

test.describe('le mutazioni — la prova che ogni riga conta', () => {
  test('MUT-01 — senza la didascalia, la colonna non ha la sua terza fascia', async ({ page }) => {
    await apri(page, { muta: MUTAZIONI['senza-didascalia'] });
    const m = await leggi(page);
    expect(m.figliFinestra, 'mutata: la didascalia non c\'e\' piu\'').toEqual(['appearance-canvas', 'preview-chrome', 'preview-body']);
    expect(m.didascalia).toBeNull();
    /* Il predicato di AT-01 sul riquadro smette di tornare: 33 + corpo + 2, senza i 36 della fascia. */
    expect(m.finestra.altezza).not.toBeCloseTo(MOCKUP.chrome.altezza + m.corpo.altezza + MOCKUP.didascalia.altezza + 2, 1);
  });

  test('MUT-02 — senza la classe del canvas, il canvas resta nudo: classe dell\'engine e opacita\' piena', async ({ page }) => {
    await apri(page, { muta: MUTAZIONI['canvas-nudo'] });
    const m = await leggi(page);
    expect(m.canvas, 'il canvas deve esserci').not.toBeNull();
    /* La riga mutata e' quella che RINOMINA la classe del canvas: l'engine nasce con
       `td-preview-canvas` (`theme-studio.js:472`), il modulo lo porta a `appearance-canvas`. */
    expect(m.canvas.classe, 'mutato: il rinomino non e\' avvenuto').toBe('td-preview-canvas');
    expect(m.canvas.classe).not.toBe('appearance-canvas');
    expect(m.canvas.opacity, 'mutato: l\'opacita\' del mockup non e\' piu\' quella').not.toBe(MOCKUP.canvas.opacity);
    expect(m.canvas.opacity).toBe('1');
    /* ⛔ E QUI LA MIA PRIMA ASSERZIONE ERA FALSA, smontata dalla misura il 18/09/2026: avevo scritto
       che senza questa riga il canvas perderebbe posizione, dimensione e trasparenza ai clic, e che
       il test sarebbe diventato rosso. NON e' cosi': il canvas e' vestito DUE volte, e l'altro
       vestito e' il foglio del prodotto — `mockup-td.css:272`
       `.td-preview-canvas { position:absolute; inset:0; width:100%; height:100%; z-index:0;
       display:block; pointer-events:none }` — che resta attaccato al nome dell'engine. Quindi
       togliendo la mia riga il canvas resta al suo posto, pieno e trasparente ai clic, e l'UNICA
       cosa che la mia classe cambia e' l'opacita' .7 del mockup. Si asserisce il misurato, non
       l'aspettato: questi tre sono il vestito dell'ALTRO foglio, e restare uguali e' il fatto. */
    expect(m.canvas.position).toBe('absolute');
    expect(m.canvas.pointerEvents).toBe('none');
    expect(m.canvas.inset).toBe('0px');
    expect(m.canvas.zIndex).toBe('0');
  });

  test('MUT-03 — con la lingua fissa, la colonna non segue piu\' la radice', async ({ page }) => {
    await apri(page, { muta: MUTAZIONI['lingua-fissa'], lingua: 'en' });
    const m = await leggi(page);
    expect(m.radice.lingua, 'la radice e\' in inglese').toBe('en');
    expect(m.testi.data, 'mutato: la copia resta in italiano').toBe(TESTI_ANTEPRIMA.it.data);
    expect(m.testi.data).not.toBe(TESTI_ANTEPRIMA.en.data);
  });

  test('MUT-04 — senza il verso di ritorno, l\'anteprima resta ferma per sempre', async ({ page }) => {
    /* ⛔ QUESTA MUTAZIONE HA SBAGLIATO LA PRIMA STESURA, E LA MISURA L'HA PRESO — 18/09/2026.
       Com'era scritta pretendeva, nel build MUTATO, che lo stato diventasse «reduced» entro 5 s:
       `Received: "animating"`, sempre, in modo deterministico. Non era un guasto del prodotto e non
       era instabilita': era la prova che chiedeva alla riga tolta di fare il suo lavoro. La stessa
       trappola di MUT-01, e vale la pena scriverne il meccanismo, perche' e' una proprieta' VERA
       dell'engine letta nel codice (`theme-studio.js:549-556`): quando la preferenza si accende, il
       giro si ferma **da solo** (`if (!deveAnimare()) { ultimo = 0; return; }`) e fermandosi **non
       riscrive** `dataset.sceneStatus` — resta l'ultimo valore dipinto, «animating», che da quel
       momento e' STANTIO. A riscriverlo e' solo un `aggiorna()` esplicito, che passa da `disegna()`
       (`:527`): cioe' esattamente la riga che questa mutazione toglie. ⇒ Lo stato non e' la cosa da
       guardare qui (lo e' in AT-05, dove il modulo c'e'): la cosa che la riga toglie e' il RITORNO. */
    await apri(page, { muta: MUTAZIONI['senza-giro'] });

    /* Il controllo del controllo: se la tela fosse gia' ferma, «non riparte» non direbbe niente. */
    expect(await laTelaCambia(page), 'prima della preferenza la tela anima').toBe(true);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
    await page.waitForTimeout(700);
    expect(await laTelaRestaFerma(page), 'a fermarsi ci pensa l\'engine da solo, anche senza il modulo').toBe(true);

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(false);
    await page.waitForTimeout(900);
    expect(await laTelaCambia(page), 'mutato: la preferenza e\' tornata e l\'anteprima no, per sempre').toBe(false);
  });

  test('MUT-05 — senza il tetto nel foglio, la colonna si allarga quanto la traccia', async ({ page }) => {
    const css = await readFile(join(RADICE, 'src', 'styles', 'anteprima-tema.css'), 'utf8');
    expect(css).toContain('max-width: 300px;');
    const senzaTetto = css.replace('max-width: 300px;', '');
    expect(senzaTetto, 'la mutazione deve togliere DAVVERO la riga').not.toBe(css);

    /* ⛔ IL CONTROLLO DEL CONTROLLO: prima si misura la stessa pagina col foglio VERO, e la colonna
       deve stare nei 300. Senza questo passo, un foglio che non arrivasse affatto darebbe lo stesso
       risultato della mutazione, e il test proverebbe il proprio guasto invece della riga tolta. */
    await apri(page, { traccia: 420 });
    expect((await leggi(page)).colonna.larghezza, 'col foglio vero la colonna sta nei 300').toBeCloseTo(MOCKUP.larghezzaColonna, 1);

    await apri(page, { traccia: 420, foglio: '/__at-muta/senza-tetto.css', css: senzaTetto });
    const m = await leggi(page);
    expect(m.colonna.maxWidth, 'il foglio mutato e\' proprio quello servito').toBe('none');
    expect(m.colonna.larghezza, 'mutata: 300 era il tetto, senza il tetto e\' la traccia').toBeCloseTo(420, 1);
    expect(m.colonna.larghezza).not.toBeCloseTo(MOCKUP.larghezzaColonna, 1);
  });
});

/* ------------------------------------------------------------------ il foglio, senza browser */

test.describe('il foglio — nessun movimento proprio, e nessuna regola di pagina', () => {
  test('FOGLIO-01 — il foglio della colonna non dichiara transizioni o animazioni', async () => {
    const css = await readFile(join(RADICE, 'src', 'styles', 'anteprima-tema.css'), 'utf8');
    const senzaCommenti = css.replace(/\/\*[\s\S]*?\*\//g, '');
    /* L'unico movimento di questa colonna e' il canvas, e si ferma in JavaScript. Una transizione
       dichiarata qui sarebbe movimento che nessuno ferma — e il blocco universale
       `@media(prefers-reduced-motion){*{animation:none!important}}` NON esiste nel prodotto
       (verificato il 18/09/2026 sul CSSOM del 4174 e sui sorgenti di `frontend/src`). */
    expect(senzaCommenti).not.toMatch(/(^|[;{])\s*(animation|transition)\s*:/);
    expect(senzaCommenti).not.toMatch(/@media[^{]*prefers-reduced-motion/);
    /* E nessuna regola che parli di tutta la pagina: questo e' un foglio di componente. */
    expect(senzaCommenti).not.toMatch(/(^|[},])\s*\*\s*[,{]/);
    expect(senzaCommenti).not.toMatch(/!important/);
    /* Il tetto c'e', ed e' il numero del mockup. */
    expect(senzaCommenti).toContain('max-width: 300px;');
  });
});
