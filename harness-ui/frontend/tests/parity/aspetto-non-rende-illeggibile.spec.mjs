/*
 * ⛔⛔⛔ QUESTO CANCELLO NON MORDE ANCORA — ed è fuori dal `testMatch` apposta.
 *
 * Le sue prove passano tutte, e il suo test AL CONTRARIO — quello che mette un velo verde sopra la
 * conversazione e pretende che la misura lo riconosca — **FALLISCE**. Cioè la misura non vede lo
 * stato che il cancello esiste per impedire.
 *
 * Un cancello inerte supera le stesse prove di uno vero: è già successo in questo progetto (il
 * cancello semantico non ha respinto una scrittura per mesi, e nessun test se n'era accorto perché
 * ognuno provava solo che una scrittura LEGITTIMA passasse). Lasciarlo nella suite darebbe una
 * sicurezza falsa, che è peggio di nessuna sicurezza.
 *
 * ⇒ Resta qui, fuori dalla suite, finché il suo test al contrario non diventa verde. Da finire:
 *   capire perché il velo iniettato non arriva alla misura — il sospetto è la CSP con nonce, che
 *   scarta lo `<style>` creato da `addInitScript` prima che il timbro del server patchi
 *   `createElement`.
 */

import { test, expect } from '@playwright/test';

/*
 * ⛔⛔⛔ NESSUNA COMBINAZIONE DI ASPETTO PUÒ RENDERE LA CHAT ILLEGGIBILE.
 *
 * Nato l'11/09/2026 da un difetto arrivato all'owner DUE VOLTE nello stesso giorno: la colonna
 * della chat prima giallognola, poi verde piena, col testo quasi invisibile. La seconda volta la
 * causa non era nel codice — erano le SUE preferenze salvate, una scena verde più i cursori di
 * intensità su valori alti. Cioè l'interfaccia gli ha permesso di mettersi da solo in uno stato in
 * cui non si legge più niente, e nessun controllo glielo ha impedito né segnalato.
 *
 * ⛔ Non è un difetto estetico: la chat è la superficie dove si LEGGE. Un aspetto che la copre non
 *   è una preferenza, è un guasto — e va trattato come tale, cioè impedito da un cancello.
 *
 * Ricerca 11/09/2026 (webability.io «Color Contrast for Accessibility: WCAG Guide 2026»;
 * colorcontrast.org; instantgradient «Making Gradient Backgrounds Accessible»):
 *  · WCAG AA vuole **4,5:1** per il testo normale e **3:1** per il testo grande;
 *  · su un gradiente il contrasto CAMBIA lungo la superficie — «mesh gradients can have spots that
 *    pass AAA and spots that fail AA in the same background» — quindi si campiona in più punti,
 *    non in uno;
 *  · gli strumenti automatici mancano proprio i casi «testo sopra gradiente», quindi questa prova
 *    misura i PIXEL veri sotto il testo, non i colori dichiarati nel CSS.
 *
 * ⛔ Questo cancello prova la combinazione PEGGIORE che l'interfaccia consente, non quella comoda:
 *   sfondo animato acceso, intensità e contrasto al massimo, e la scena più aggressiva. Se passa
 *   quella, passano tutte.
 */

const BASE = process.env.TALOS_UI_URL ?? 'http://127.0.0.1:4174/';

/* Le scene che dipingono più forte: il verde `terminal` è quella che è arrivata all'owner. */
const SCENE_DA_PROVARE = ['terminal', 'ember', 'aurora', 'calm'];

/** Luminanza relativa secondo WCAG 2.x, dai canali sRGB. */
function luminanza([r, g, b]) {
  const canale = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canale(r) + 0.7152 * canale(g) + 0.0722 * canale(b);
}

function contrasto(a, b) {
  const la = luminanza(a);
  const lb = luminanza(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function preferenze(appearance) {
  return {
    version: 1,
    appearance: {
      /* ⛔ I TIMBRI ci sono apposta: senza, la chiave versionata ignorerebbe questi valori e la
         prova misurerebbe il default — cioè non proverebbe niente. È lo stato di chi ha scelto. */
      themePresetVersione: 2,
      sceneOverrideVersione: 2,
      backgroundMotionVersione: 2,
      ...appearance,
    },
  };
}

for (const scena of SCENE_DA_PROVARE) {
  for (const modo of ['dark', 'light']) {
    test(`la chat resta leggibile con la scena «${scena}» al massimo — tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, async ({ browser }) => {
      const contesto = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: modo });
      const pagina = await contesto.newPage();
      await pagina.addInitScript((salvate) => {
        try { window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify(salvate)); } catch { /* profilo senza storage: la prova vale lo stesso sul default */ }
      }, preferenze({
        sceneOverride: scena,
        colorMode: modo,
        backgroundMotion: true,
        /* ⛔ I cursori al MASSIMO: è lo stato in cui l'owner si è trovato, e il peggiore che la UI consente. */
        motionIntensity: 100,
        motionContrast: 100,
        motionGlow: 100,
        motionDensity: 150,
      }));
      await pagina.goto(BASE, { waitUntil: 'domcontentloaded' });
      await pagina.waitForTimeout(3500);
      const salta = pagina.getByText('Salta per ora').first();
      if (await salta.count()) { await salta.click({ force: true }); await pagina.waitForTimeout(600); }

      /*
       * ⛔⛔⛔ SI MISURANO I PIXEL, NON IL DOM — e la prima versione di questo file sbagliava.
       *   Leggeva `backgroundColor` risalendo i genitori: ma il fondo che ha fatto il danno è
       *   dipinto da uno PSEUDO-ELEMENTO (`body::before`), che nel DOM non esiste. La misura era
       *   cieca proprio al caso per cui il cancello nasce, e le sue 24 prove verdi non provavano
       *   niente. L'ha scoperto il test AL CONTRARIO qui sotto, che è esattamente il suo mestiere.
       * ⇒ Si fotografa l'area della conversazione e si guarda il colore che ha davvero addosso.
       */
      const zona = pagina.locator('#conversation, .talos-conversazione, main').first();
      const scatto = await zona.screenshot();
      const coloreTesto = await zona.evaluate((n) => getComputedStyle(n).color);

      /* Il fondo è il colore PIÙ FREQUENTE dell'area: il testo copre pochi pixel, lo sfondo tutti gli altri. */
      const fondo = await pagina.evaluate(async (dati) => {
        const blob = new Blob([new Uint8Array(dati)], { type: 'image/png' });
        const bitmap = await createImageBitmap(blob);
        const tela = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = tela.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        const px = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
        const conta = new Map();
        for (let i = 0; i < px.length; i += 4 * 37) { // un pixel ogni 37: basta e avanza per il dominante
          const chiave = `${px[i]},${px[i + 1]},${px[i + 2]}`;
          conta.set(chiave, (conta.get(chiave) ?? 0) + 1);
        }
        let vincitore = null; let quanti = -1;
        for (const [chiave, n] of conta) if (n > quanti) { quanti = n; vincitore = chiave; }
        return vincitore.split(',').map(Number);
      }, Array.from(scatto));

      const leggiColore = (colore) => {
        const m = /rgba?\(([^)]+)\)/.exec(colore);
        return m ? m[1].split(',').map((n) => Number.parseFloat(n)).slice(0, 3) : null;
      };
      const testo = leggiColore(coloreTesto);
      expect(testo, 'il colore del testo della chat deve essere leggibile dal DOM').not.toBeNull();

      const rapporto = contrasto(testo, fondo);
      expect(rapporto, `⛔ il testo della chat è a ${rapporto.toFixed(2)}:1 sul fondo MISURATO IN PIXEL rgb(${fondo.join(',')}) (scena «${scena}», tema ${modo}, cursori al massimo). WCAG AA vuole almeno 4,5:1: sotto quella soglia la conversazione non si legge, ed è il difetto arrivato all'owner l'11/09.`)
        .toBeGreaterThanOrEqual(4.5);

      await contesto.close();
    });
  }
}

/*
 * ⛔⛔⛔ AL CONTRARIO — LA PROVA CHE QUESTO CANCELLO MORDE.
 *
 * Le 24 prove qui sopra passano tutte, e da sole non dimostrano niente: un cancello inerte le
 * supera esattamente come uno vero. È già successo in questo progetto — il cancello semantico non
 * ha MAI respinto una scrittura per mesi, e nessun test se n'era accorto perché ognuno provava
 * solo che una scrittura LEGITTIMA passasse.
 *
 * ⇒ Qui si mette la app nello stato che è arrivato all'owner — un velo verde sopra la
 *   conversazione — e si pretende che la misura lo RICONOSCA. Se questo test diventa verde per il
 *   motivo sbagliato (cioè se la misura smette di vedere il fondo vero), i 24 sopra non valgono
 *   più niente.
 */
test('⛔ AL CONTRARIO: con un velo verde sopra la conversazione, la misura lo RICONOSCE come illeggibile', async ({ browser }) => {
  const contesto = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const pagina = await contesto.newPage();
  /* Il verde esatto della scena `terminal`, quello che l'owner ha visto. */
  await pagina.addInitScript(() => {
    const stile = document.createElement('style');
    stile.textContent = `#conversation, .talos-conversazione, main { background-color: #67d391 !important; color: #7ad8a0 !important; }`;
    const monta = () => document.head.appendChild(stile);
    if (document.head) monta(); else document.addEventListener('DOMContentLoaded', monta, { once: true });
  });
  await pagina.goto(BASE, { waitUntil: 'domcontentloaded' });
  await pagina.waitForTimeout(3000);
  const salta = pagina.getByText('Salta per ora').first();
  if (await salta.count()) { await salta.click({ force: true }); await pagina.waitForTimeout(500); }

  const zona = pagina.locator('#conversation, .talos-conversazione, main').first();
  const scatto = await zona.screenshot();
  const coloreTesto = await zona.evaluate((n) => getComputedStyle(n).color);
  const fondo = await pagina.evaluate(async (dati) => {
    const blob = new Blob([new Uint8Array(dati)], { type: 'image/png' });
    const bitmap = await createImageBitmap(blob);
    const tela = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = tela.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    const px = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
    const conta = new Map();
    for (let i = 0; i < px.length; i += 4 * 37) {
      const chiave = `${px[i]},${px[i + 1]},${px[i + 2]}`;
      conta.set(chiave, (conta.get(chiave) ?? 0) + 1);
    }
    let vincitore = null; let quanti = -1;
    for (const [chiave, n] of conta) if (n > quanti) { quanti = n; vincitore = chiave; }
    return vincitore.split(',').map(Number);
  }, Array.from(scatto));
  const m = /rgba?\(([^)]+)\)/.exec(coloreTesto);
  const testo = m ? m[1].split(',').map((n) => Number.parseFloat(n)).slice(0, 3) : [0, 0, 0];
  const rapporto = contrasto(testo, fondo);
  expect(rapporto, `la misura deve VEDERE un verde su verde come illeggibile; ha risposto ${rapporto.toFixed(2)}:1`)
    .toBeLessThan(4.5);
  await contesto.close();
});
