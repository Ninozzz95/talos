/*
 * ⛔⛔⛔⛔ FUORI DAL `testMatch` DALL'11/09/2026, E LA RAGIONE È SCRITTA QUI.
 *
 * Owner, 11/09: «SFONDO ANIMATO ABOLITO, NASCONDI DALLE IMPOSTAZIONI E SPEGNI COMPLETAMENTE GLI
 * SFONDI ANIMATI DALLA UI, CI ANDREMO SUCCESSIVAMENTE». La scena non si disegna più.
 *
 * ⛔ Questo file misura una garanzia SULLA SCENA — «0 pixel di scena sotto il testo» — e una
 *   garanzia su una cosa che non viene disegnata non è una garanzia: è un cancello che dice verde
 *   sul nulla, che in questo progetto è la forma di difetto più costosa. Misurato, non temuto: al
 *   suo ultimo giro utile ha dato **38 passed e 1 failed**, e il rosso era proprio la metà «AL
 *   CONTRARIO» («se la superficie di lettura torna trasparente, la prova B vede la scena passarci
 *   sotto») — non può più vedere niente passare, perché sotto non c'è più niente.
 *
 * ⇒ NON si cancella: il lavoro di misura che contiene (la curva del mobile, le alfe vere, il
 *   contrasto campionato in pixel, le due prove al contrario) è esattamente ciò che servirà quando
 *   la funzione tornerà. Le condizioni per riprenderla stanno in BC-09.
 * ⇒ Al suo posto, nella suite, `sfondo-animato-abolito.spec.mjs`: presidia ciò che vale OGGI — che
 *   la scena non si disegni e che la sezione delle Impostazioni non si veda.
 */

/*
 * ⛔⛔⛔ NESSUNA COMBINAZIONE DI ASPETTO PUÒ RENDERE LA CHAT ILLEGGIBILE.
 *
 * Nato l'11/09/2026 da un difetto arrivato all'owner TRE VOLTE nello stesso giorno: la colonna
 * della chat prima giallognola, poi verde piena, col testo quasi invisibile. La seconda volta la
 * causa non era nel codice — erano le SUE preferenze salvate, una scena verde più i cursori di
 * intensità su valori alti. Cioè l'interfaccia gli ha permesso di mettersi da solo in uno stato in
 * cui non si legge più niente, e nessun controllo glielo ha impedito né segnalato. La terza volta
 * si è spento il DISEGNO dello sfondo per non rischiare la quarta.
 *
 * ⛔ Non è un difetto estetico: la chat è la superficie dove si LEGGE. Un aspetto che la copre non
 *   è una preferenza, è un guasto — e va trattato come tale, cioè impedito da un cancello.
 *
 * ⭐ PERCHÉ ORA MORDE, e stamattina no.
 *
 * La stesura dell'11/09 mattina stava FUORI dal `testMatch` e lo dichiarava in testa: il suo test
 * «al contrario» — velo verde sopra la conversazione, la misura deve riconoscerlo — FALLIVA. Il
 * sospetto scritto allora («la CSP con nonce scarta lo style iniettato da addInitScript») era
 * GIUSTO, ed è stato verificato alla fonte:
 *   · `src/http-app.mjs:441` manda `style-src 'self'` e, sul documento, `'nonce-…'`;
 *   · `iniettaNonceNelDocumento()` timbra il nonce sui tag style patchando `Document.prototype.
 *     createElement` da uno script inline in fondo alla testa del documento — cioè DOPO gli
 *     `addInitScript` di Playwright;
 *   ⇒ un foglio creato da `addInitScript` non ha nonce e il browser lo SCARTA, in silenzio.
 * ⇒ La cura non è indebolire la CSP: è smettere di usare un foglio. Il velo della prova al
 *   contrario si mette col CSSOM — `el.style.setProperty(...)` — che la CSP non tocca: MDN
 *   «CSP: style-src» (letto l'11/09/2026): «styles properties that are set directly on the
 *   element's style property will not be blocked», mentre l'attributo `style` e `cssText` sì.
 *
 * COSA MISURA, in tre prove che si controllano a vicenda.
 *
 * A. CONTRASTO (assoluta). Il testo dei messaggi sul fondo VERO, misurato in PIXEL e in PIÙ PUNTI
 *    (cinque colonne per tre righe dentro il rettangolo dei glifi, per ogni riga, a quattro
 *    posizioni di scorrimento). WCAG 2.2 AA: 4,5:1 per il testo normale, 3:1 per quello grande.
 *    ⛔ Si misurano i PIXEL e non il DOM perché il fondo che ha fatto il danno lo dipinge uno
 *      PSEUDO-ELEMENTO, che nel DOM non esiste: la prima stesura leggeva `backgroundColor` dai
 *      genitori ed era cieca proprio al caso per cui il cancello nasce.
 *    ⛔ E si campiona in PIÙ PUNTI perché su un gradiente il contrasto cambia lungo la superficie
 *      (achecks.org «Gradients: Accessible Colour Contrasts with Gradient Backgrounds»;
 *      webability.io «Color Contrast for Accessibility: WCAG Guide (2026)», letti l'11/09/2026):
 *      un colore solo, dedotto dal CSS, non dice niente.
 *
 * B. LA SCENA NON PASSA SOTTO IL TESTO (strutturale). Il fondo sotto OGNI riga di testo visibile
 *    con lo sfondo ACCESO dev'essere lo STESSO PIXEL che con lo sfondo SPENTO: delta 0 su ogni
 *    canale. È la condizione che l'owner ha scritto — «non passa MAI sotto il testo» — e una
 *    soglia non la esprime: o il pixel è identico, o la scena è passata.
 *    ⭐ Questa prova è immune agli artefatti della misura: confronta due fotografie dello stesso
 *      stato, quindi un glifo rimasto nella foto compare identico in tutte e due.
 *
 * C. AL CONTRARIO, due volte — una per ciascuna delle due prove sopra. Un cancello inerte supera
 *    le stesse prove di uno vero: è già successo in questo progetto (il cancello semantico non ha
 *    respinto una scrittura per mesi, e nessun test se n'era accorto perché ognuno provava solo
 *    che una scrittura LEGITTIMA passasse).
 *
 * ⛔ IL TESTO ESCLUSO DALLA PROVA A, e perché — dichiarato invece che nascosto:
 *   · `.talos-waiting__label` dipinge le lettere con `background-clip: text`, quindi il colore che
 *     si vede NON è `color` e i glifi non spariscono rendendo il testo trasparente: la misura a
 *     pixel campiona i glifi stessi e risponde 1,0:1 su un testo perfettamente leggibile. Resta
 *     dentro la prova B, che non ha questo problema.
 *   · `.talos-diff__line--add/--del`, `.talos-badge`, `.talos-receipt__text` sono SOTTO AA oggi
 *     (1,9-4,4:1 secondo il tema) e non per colpa dell'aspetto: `--talos-success`, `--talos-danger`
 *     e i loro `-soft` NON sono derivati per tema — restano i valori di `calm` mentre il fondo
 *     cambia. Su di loro la prova B misura 0 pixel di differenza, cioè la scena non c'entra.
 *     ⇒ Registrato nel rapporto come filo separato: è una decisione di tavolozza di prodotto, non
 *       di questa fase. Metterli qui dentro adesso darebbe un cancello rosso per un motivo che
 *       questo cancello non governa.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

/*
 * ⛔ MAI il 4174 di serie. La stesura di stamattina aveva 4174 come ripiego, e lanciare il
 *   cancello apriva una sessione VERA dell'owner e ci cliccava dentro (dichiarato nel rapporto
 *   dell'11/09, §7 punto 0). Qui il ripiego è la porta del banco che accende
 *   `playwright.componenti.config.mjs`; senza quel server la prova fallisce con un errore chiaro
 *   invece di andare a bussare al server di chi sta lavorando.
 */
const BASE = process.env.TALOS_URL_ASPETTO || 'http://127.0.0.1:4177/';

/* Le scene che dipingono più forte; `terminal` è il verde che è arrivato all'owner. */
const SCENE_DA_PROVARE = ['terminal', 'ember', 'aurora', 'calm'];

/*
 * Il testo dei MESSAGGI, per nome. Un elenco esplicito e non «tutto ciò che è testo» perché la
 * prova A vuole testo dipinto da `color` sopra un fondo dipinto da qualcun altro: è l'unico caso
 * in cui «colore del testo contro pixel del fondo» ha senso.
 */
const SELETTORI_TESTO = [
  '.talos-message p',
  '.talos-message__meta',
  '.talos-system-note__title',
  '.talos-system-note p',
  '.talos-approval__why',
  '.talos-approval__motivo',
  '.talos-approval__foot-note',
  '.talos-eyebrow',
];

/* La conversazione di prova è il markup del MOCKUP, letto dal template: se il mockup cambia, la
   prova cambia con lui invece di misurare una copia che invecchia. */
const TEMPLATE = fileURLToPath(new URL('../../index.template.html', import.meta.url));
function fixtureConversazione() {
  const html = readFileSync(TEMPLATE, 'utf8');
  const apertura = '<div class="talos-conversation" data-c="Conversation"><div class="talos-conversation__column">';
  const inizio = html.indexOf(apertura);
  if (inizio < 0) throw new Error('Nel template non c\u2019\u00e8 pi\u00f9 la colonna della conversazione: la prova misurerebbe una chat vuota.');
  const dopo = inizio + apertura.length;
  const tag = /<\/?div\b[^>]*>/g;
  tag.lastIndex = dopo;
  let profondita = 1;
  let fine = -1;
  let m;
  while ((m = tag.exec(html))) {
    profondita += m[0].startsWith('</') ? -1 : 1;
    if (profondita === 0) { fine = m.index; break; }
  }
  if (fine < 0) throw new Error('Colonna della conversazione non chiusa nel template.');
  const dentro = html.slice(dopo, fine);
  if (dentro.length < 2000) throw new Error('Fixture troppo corta: la prova non avrebbe testo da misurare.');
  return dentro;
}

/** Luminanza relativa secondo WCAG 2.x, dai canali sRGB. */
function luminanza(rgb) {
  const canale = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canale(rgb[0]) + 0.7152 * canale(rgb[1]) + 0.0722 * canale(rgb[2]);
}
function contrasto(a, b) {
  const la = luminanza(a);
  const lb = luminanza(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/* ⛔ Lo strumento si prova su casi di effetto NOTO prima di fidarsene: `pixelmatch@7.2.0` ha già
   risposto 0 px su due schermate visibilmente diverse, in questo stesso lavoro. */
test('lo strumento di misura dice il vero su casi noti', () => {
  expect(contrasto([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 2);
  expect(contrasto([255, 255, 255], [0x76, 0x76, 0x76])).toBeCloseTo(4.54, 2);
  expect(contrasto([0, 0, 0], [0, 0, 0])).toBeCloseTo(1, 5);
  expect(fixtureConversazione().length).toBeGreaterThan(2000);
});

function preferenze(appearance) {
  return {
    version: 1,
    appearance: {
      /* ⛔ I TIMBRI ci sono apposta: senza, la chiave versionata ignorerebbe questi valori e la
         prova misurerebbe il default — cioè non proverebbe niente. È lo stato di chi ha SCELTO,
         ed è esattamente lo stato in cui si è trovato l'owner. */
      themePresetVersione: 2,
      sceneOverrideVersione: 2,
      backgroundMotionVersione: 2,
      ...appearance,
    },
  };
}

/** Apre la app col suo stato salvato e ci mette dentro la conversazione del mockup. */
async function apriConversazione(browser, opzioni) {
  const { modo, appearance, viewport } = opzioni;
  const contesto = await browser.newContext({ viewport, colorScheme: modo });
  const pagina = await contesto.newPage();
  await pagina.addInitScript((salvate) => {
    try { window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify(salvate)); } catch { /* profilo senza storage */ }
  }, preferenze(appearance));
  await pagina.goto(BASE, { waitUntil: 'domcontentloaded' });
  await pagina.waitForTimeout(3200);
  /* ⛔ `isVisible` e non `count`: col banco avviato con `TALOS_INTRO=0` il bottone della
     schermata d'avvio ESISTE nel DOM ma non si vede, e `click({force:true})` fallisce lo stesso
     perche' il suo rettangolo e' vuoto. Contare gli elementi non dice se sono sullo schermo. */
  const salta = pagina.getByText('Salta per ora').first();
  if (await salta.isVisible().catch(() => false)) { await salta.click({ force: true }); await pagina.waitForTimeout(500); }
  await pagina.evaluate((html) => {
    const colonna = document.querySelector('#conversation');
    if (!colonna) throw new Error('#conversation non esiste: la chat non e la schermata attiva.');
    colonna.innerHTML = html;
  }, fixtureConversazione());
  await pagina.waitForTimeout(700);
  return { contesto, pagina };
}

async function scorriA(pagina, frazione) {
  await pagina.evaluate((f) => {
    const scroller = document.querySelector('#conversation').closest('.talos-conversation');
    scroller.scrollTop = (scroller.scrollHeight - scroller.clientHeight) * f;
  }, frazione);
  await pagina.waitForTimeout(350);
}

/**
 * Le righe di testo VISIBILI dentro la finestra di lettura.
 * ⛔ «Visibili» sul serio: lo scroller ritaglia la colonna e il composer copre il resto. Misurare
 *   una riga che sta dietro il composer significa campionare il composer — è successo, e dava
 *   1,56:1 su una riga di diff perfettamente leggibile.
 * ⛔ Il rettangolo è quello del NODO DI TESTO (Range), non quello dell'elemento: una riga di diff
 *   è larga 688 px e il testo ne occupa 288; campionando la scatola si finisce sul margine, fuori
 *   dai glifi, e si misura un colore che sotto quel testo non c'è.
 */
async function righeDiTesto(pagina, selettori) {
  return pagina.evaluate((sel) => {
    const colonna = document.querySelector('#conversation');
    const finestra = colonna.closest('.talos-conversation').getBoundingClientRect();
    const dentro = (r) => r.left >= finestra.left - 0.5 && r.right <= finestra.right + 0.5
      && r.top >= finestra.top - 0.5 && r.bottom <= finestra.bottom + 0.5;
    const ammessi = sel ? Array.from(colonna.querySelectorAll(sel.join(','))) : null;
    const righe = [];
    const visti = new Set();
    const camminatore = document.createTreeWalker(colonna, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = camminatore.nextNode())) {
      const testo = (n.nodeValue || '').trim();
      if (testo.length < 12) continue;
      const el = n.parentElement;
      if (!el || visti.has(el)) continue;
      if (ammessi && !ammessi.includes(el)) continue;
      const intervallo = document.createRange();
      intervallo.selectNodeContents(el);
      const r = intervallo.getBoundingClientRect();
      if (r.width < 40 || r.height < 8) continue;
      if (!dentro(r)) continue;
      visti.add(el);
      const stile = getComputedStyle(el);
      righe.push({
        nome: String(el.className || el.tagName).slice(0, 48),
        testo: testo.slice(0, 40),
        colore: stile.color,
        px: Number.parseFloat(stile.fontSize),
        peso: stile.fontWeight,
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      });
    }
    return righe;
  }, selettori || null);
}

/**
 * Fotografa lo schermo col TESTO reso trasparente: restano tutti i fondi (colonna, bolle, scena,
 * ombre), spariscono i glifi. Quella foto È il fondo vero sotto le lettere, non un colore dedotto.
 */
async function fotoDelFondo(pagina) {
  await pagina.evaluate(() => {
    const colonna = document.querySelector('#conversation');
    window.__talosColoriSalvati = [colonna, ...colonna.querySelectorAll('*')].map((el) => {
      const prima = [el, el.style.color, el.style.getPropertyPriority('color')];
      el.style.setProperty('color', 'transparent', 'important');
      el.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
      el.style.setProperty('text-shadow', 'none', 'important');
      return prima;
    });
  });
  await pagina.waitForTimeout(200);
  const scatto = await pagina.screenshot({ animations: 'allow' });
  await pagina.evaluate(() => {
    for (const salvato of window.__talosColoriSalvati || []) {
      const el = salvato[0];
      if (salvato[1]) el.style.setProperty('color', salvato[1], salvato[2]); else el.style.removeProperty('color');
      el.style.removeProperty('-webkit-text-fill-color');
      el.style.removeProperty('text-shadow');
    }
  });
  return scatto;
}

/** Porta la foto dentro la pagina e ne legge i pixel richiesti. */
async function pixelDellaFoto(pagina, scatto, punti) {
  return pagina.evaluate(async (dati) => {
    const blob = new Blob([new Uint8Array(dati.byte)], { type: 'image/png' });
    const bitmap = await createImageBitmap(blob);
    const tela = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = tela.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    const px = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
    return dati.punti.map((p) => {
      const xi = Math.max(0, Math.min(bitmap.width - 1, Math.round(p[0])));
      const yi = Math.max(0, Math.min(bitmap.height - 1, Math.round(p[1])));
      const i = (bitmap.width * yi + xi) << 2;
      return [px[i], px[i + 1], px[i + 2]];
    });
  }, { byte: Array.from(scatto), punti });
}

/* Cinque colonne per tre righe dentro il rettangolo dei glifi: su un gradiente il contrasto cambia
   lungo la superficie, e quello che conta è il punto PEGGIORE sotto quel testo. */
const FRAZIONI_X = [0.06, 0.3, 0.5, 0.7, 0.94];
const FRAZIONI_Y = [0.28, 0.5, 0.72];
const PER_RIGA = FRAZIONI_X.length * FRAZIONI_Y.length;
function puntiDi(riga) {
  const punti = [];
  for (const fx of FRAZIONI_X) for (const fy of FRAZIONI_Y) punti.push([riga.rect.x + riga.rect.w * fx, riga.rect.y + riga.rect.h * fy]);
  return punti;
}

function rgbDaCss(colore) {
  const m = /rgba?\(([^)]+)\)/.exec(String(colore));
  return m ? m[1].split(/[,\s/]+/).filter(Boolean).map(Number).slice(0, 3) : null;
}

/** Soglia WCAG: 3:1 per il testo grande (>=24px, o >=18,66px in grassetto), 4,5:1 altrimenti. */
function sogliaDi(riga) {
  const grande = riga.px >= 24 || (riga.px >= 18.66 && Number(riga.peso) >= 700);
  return grande ? 3 : 4.5;
}

/** Il peggior contrasto di ogni riga di testo, su tutte le posizioni di scorrimento. */
async function misuraContrasti(pagina, selettori) {
  const peggiori = new Map();
  for (const frazione of [0, 0.34, 0.67, 1]) {
    await scorriA(pagina, frazione);
    const righe = await righeDiTesto(pagina, selettori);
    if (!righe.length) continue;
    const scatto = await fotoDelFondo(pagina);
    const colori = await pixelDellaFoto(pagina, scatto, righe.flatMap((r) => puntiDi(r)));
    let k = 0;
    for (const riga of righe) {
      const testo = rgbDaCss(riga.colore);
      if (!testo) { k += PER_RIGA; continue; }
      let peggio = Infinity;
      let fondo = null;
      for (let i = 0; i < PER_RIGA; i++) {
        const f = colori[k++];
        const r = contrasto(testo, f);
        if (r < peggio) { peggio = r; fondo = f; }
      }
      const chiave = riga.nome + '|' + riga.testo;
      if (!peggiori.has(chiave) || peggiori.get(chiave).rapporto > peggio) {
        peggiori.set(chiave, { ...riga, rapporto: peggio, fondo, soglia: sogliaDi(riga) });
      }
    }
  }
  return [...peggiori.values()];
}

/** I pixel del fondo sotto tutto il testo visibile, alle stesse coordinate in due pagine diverse. */
async function fondoSottoIlTesto(pagina) {
  await scorriA(pagina, 0);
  const righe = await righeDiTesto(pagina, null);
  const punti = righe.flatMap((r) => puntiDi(r));
  const colori = await pixelDellaFoto(pagina, await fotoDelFondo(pagina), punti);
  return { righe, punti, colori };
}

/* ── A. IL CONTRASTO DEL TESTO DEI MESSAGGI — quattro scene, due temi, cursori al MASSIMO. ── */
for (const scena of SCENE_DA_PROVARE) {
  for (const modo of ['dark', 'light']) {
    test(`A · la chat resta leggibile con la scena «${scena}» al massimo — tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, async ({ browser }, info) => {
      const viewport = info.project.use.viewport;
      const aperta = await apriConversazione(browser, {
        modo,
        viewport,
        appearance: {
          themePreset: 'calm', colorMode: modo, sceneOverride: scena, backgroundMotion: true,
          /* ⛔ I cursori al MASSIMO: lo stato peggiore che l'interfaccia consente di scegliere. */
          motionIntensity: 100, motionContrast: 100, motionGlow: 100, motionDensity: 150,
        },
      });
      const righe = await misuraContrasti(aperta.pagina, SELETTORI_TESTO);
      expect(righe.length, 'il cancello deve aver trovato righe di testo da misurare, altrimenti non prova niente')
        .toBeGreaterThanOrEqual(6);
      const sotto = righe.filter((r) => r.rapporto < r.soglia);
      expect(
        sotto.map((r) => `${r.nome} «${r.testo}» ${r.rapporto.toFixed(2)}:1 su rgb(${r.fondo.join(',')}) — serve ${r.soglia}:1`),
        `⛔ scena «${scena}», tema ${modo}, cursori al massimo: il testo della conversazione non arriva a WCAG AA sul fondo MISURATO IN PIXEL. È il difetto arrivato all'owner l'11/09.`,
      ).toEqual([]);
      await aperta.contesto.close();
    });
  }
}

/* ── B. LA SCENA NON PASSA SOTTO IL TESTO — stesso pixel, acceso e spento. ── */
for (const modo of ['dark', 'light']) {
  test(`B · lo sfondo animato non cambia UN SOLO pixel sotto il testo — tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, async ({ browser }, info) => {
    const viewport = info.project.use.viewport;
    const comuni = {
      themePreset: 'calm', colorMode: modo, sceneOverride: 'terminal',
      motionIntensity: 100, motionContrast: 100, motionGlow: 100, motionDensity: 150,
    };
    const acceso = await apriConversazione(browser, { modo, viewport, appearance: { ...comuni, backgroundMotion: true } });
    const a = await fondoSottoIlTesto(acceso.pagina);
    const spento = await apriConversazione(browser, { modo, viewport, appearance: { ...comuni, backgroundMotion: false } });
    const s = await fondoSottoIlTesto(spento.pagina);

    expect(a.righe.length, 'nessuna riga di testo misurata: la prova non proverebbe niente').toBeGreaterThanOrEqual(6);
    expect(s.punti.length, 'acceso e spento devono avere lo stesso impaginato, altrimenti i pixel non sono confrontabili').toBe(a.punti.length);

    let deltaMax = 0;
    let dove = '';
    for (let i = 0; i < a.colori.length; i++) {
      const d = Math.max(
        Math.abs(a.colori[i][0] - s.colori[i][0]),
        Math.abs(a.colori[i][1] - s.colori[i][1]),
        Math.abs(a.colori[i][2] - s.colori[i][2]),
      );
      if (d > deltaMax) {
        deltaMax = d;
        dove = `(${Math.round(a.punti[i][0])},${Math.round(a.punti[i][1])}) acceso rgb(${a.colori[i].join(',')}) contro spento rgb(${s.colori[i].join(',')})`;
      }
    }
    expect(deltaMax, `⛔ la scena PASSA SOTTO IL TESTO: ${a.punti.length} campioni sotto ${a.righe.length} righe, il peggiore cambia di ${deltaMax}/255 in ${dove}. La condizione dell'owner è «mai», non «poco».`).toBe(0);
    await acceso.contesto.close();
    await spento.contesto.close();
  });
}

/* ── C. AL CONTRARIO — una prova per ciascuna delle due sopra. ── */

test('C1 · AL CONTRARIO: con un velo verde sopra la conversazione, la prova A lo RICONOSCE', async ({ browser }, info) => {
  const viewport = info.project.use.viewport;
  const aperta = await apriConversazione(browser, {
    modo: 'dark',
    viewport,
    appearance: { themePreset: 'calm', colorMode: 'dark', sceneOverride: 'terminal', backgroundMotion: true },
  });
  /* Il verde esatto della scena terminal, quello che l'owner ha visto — messo col CSSOM, che la
     CSP non blocca (un foglio senza nonce verrebbe scartato in silenzio: vedi la testata). */
  await aperta.pagina.evaluate(() => {
    const colonna = document.querySelector('#conversation');
    for (const n of colonna.querySelectorAll('*')) {
      n.style.setProperty('color', '#7ad8a0', 'important');
      n.style.setProperty('background-color', 'transparent', 'important');
      n.style.setProperty('background-image', 'none', 'important');
    }
    colonna.style.setProperty('background-color', '#67d391', 'important');
    colonna.style.setProperty('color', '#7ad8a0', 'important');
  });
  await aperta.pagina.waitForTimeout(250);
  const righe = await misuraContrasti(aperta.pagina, SELETTORI_TESTO);
  expect(righe.length, 'senza righe misurate la prova al contrario non direbbe niente').toBeGreaterThanOrEqual(6);
  const peggiore = Math.min(...righe.map((r) => r.rapporto));
  expect(
    righe.filter((r) => r.rapporto < r.soglia).length,
    `la misura deve VEDERE un verde su verde come illeggibile; il peggiore ha risposto ${peggiore.toFixed(2)}:1`,
  ).toBeGreaterThan(0);
  await aperta.contesto.close();
});

test('C2 · AL CONTRARIO: se la superficie di lettura torna trasparente, la prova B vede la scena passarci sotto', async ({ browser }, info) => {
  const viewport = info.project.use.viewport;
  const comuni = {
    themePreset: 'calm', colorMode: 'dark', sceneOverride: 'terminal',
    motionIntensity: 100, motionContrast: 100, motionGlow: 100, motionDensity: 150,
  };
  /* Riproduce il difetto dell'11/09 esattamente: si toglie l'opacità alla superficie di lettura. */
  const scoperchia = async (pagina) => {
    await pagina.evaluate(() => {
      const colonna = document.querySelector('#conversation');
      colonna.style.setProperty('background-color', 'transparent', 'important');
      const scroller = colonna.closest('.talos-conversation');
      scroller.style.setProperty('background-image', 'none', 'important');
      scroller.style.setProperty('background-color', 'transparent', 'important');
    });
    await pagina.waitForTimeout(250);
  };
  const acceso = await apriConversazione(browser, { modo: 'dark', viewport, appearance: { ...comuni, backgroundMotion: true } });
  await scoperchia(acceso.pagina);
  const a = await fondoSottoIlTesto(acceso.pagina);
  const spento = await apriConversazione(browser, { modo: 'dark', viewport, appearance: { ...comuni, backgroundMotion: false } });
  await scoperchia(spento.pagina);
  const s = await fondoSottoIlTesto(spento.pagina);

  expect(s.punti.length).toBe(a.punti.length);
  let deltaMax = 0;
  for (let i = 0; i < a.colori.length; i++) {
    deltaMax = Math.max(
      deltaMax,
      Math.abs(a.colori[i][0] - s.colori[i][0]),
      Math.abs(a.colori[i][1] - s.colori[i][1]),
      Math.abs(a.colori[i][2] - s.colori[i][2]),
    );
  }
  expect(deltaMax, 'tolta l’opacità alla superficie di lettura, la prova B DEVE vedere la scena arrivare sotto il testo: se risponde 0 è cieca, e i suoi verdi non valgono niente')
    .toBeGreaterThan(2);
  await acceso.contesto.close();
  await spento.contesto.close();
});
