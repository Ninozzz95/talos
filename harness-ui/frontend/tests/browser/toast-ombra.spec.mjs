import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

/*
 * Trovato guardando la foto del 4174 a 1024 in tema chiaro (26/09): dietro il toast «Collegato di nuovo» un rettangolo
 * grigio coi bordi a scheda ± 12 px — l'ombra fluttuante tagliata dalla regione dei toast, che scorre.
 * ⛔ La prima versione di questa prova confrontava il margine con l'ombra contata fino a METÀ sfocatura, ed era verde su
 *   una cura insufficiente: i pixel mostravano ancora un gradino di 3-5 livelli. La specifica dice che la transizione
 *   visibile arriva al raggio INTERO (CSS Backgrounds 3, ED 16/12/2025, §6.1.2). ⇒ Adesso la prova guarda l'effetto:
 *   due foto della stessa zona, col ritaglio della regione acceso e spento. Se il margine basta, sono identiche.
 * E nella stessa foto c'erano TRE «Collegato di nuovo» identici: la prova fa ripetere la ripresa (lo stream finto si
 * chiude e l'EventSource ritenta) e pretende che in pila ne resti UNO (`components/toast.js`, `chiave`).
 * Il toast nasce come dal vivo: il browser va offline e torna. Server di prova (porta 4176): ogni non-GET si ferma e si conta.
 */
function estensioni(boxShadow) {
  // «rgba(47, 42, 34, 0.2) 0px 18px 56px 0px» (Chromium mette il colore davanti); si conta il raggio INTERO
  const numeri = String(boxShadow).replace(/rgba?\([^)]*\)/gu, '').trim().split(/\s+/u).map((v) => parseFloat(v)).filter(Number.isFinite);
  const [x = 0, y = 0, blur = 0, spread = 0] = numeri;
  const r = blur + spread;
  return { lati: Math.abs(x) + r, sopra: Math.max(0, r - y), sotto: y + r };
}

function differenzaMassima(a, b) {
  const pa = PNG.sync.read(a);
  const pb = PNG.sync.read(b);
  if (pa.width !== pb.width || pa.height !== pb.height) return Infinity;
  let massimo = 0;
  for (let i = 0; i < pa.data.length; i += 4) {
    for (let c = 0; c < 3; c += 1) massimo = Math.max(massimo, Math.abs(pa.data[i + c] - pb.data[i + c]));
  }
  return massimo;
}

const SESSIONE = 'toast-ombra';
const CONFINE = `data: ${JSON.stringify({ type: 'CUSTOM', name: 'talos.fine-rigiocata' })}\n\n`;

for (const tema of ['light', 'dark']) {
  test(`TOAST-SHADOW-01 — l'ombra del toast sta intera dentro la sua regione, e una ripresa ripetuta resta un toast solo (${tema})`, async ({ page, context }) => {
    const contatore = { nonGet: 0 };
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
    await page.addInitScript((colorMode) => {
      localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } }));
    }, tema);
    await page.route('**/api/v1/**', (route) => {
      const req = route.request();
      if (new URL(req.url()).pathname.endsWith(`/sessions/${SESSIONE}/events`)) return route.fulfill({ contentType: 'text/event-stream', body: CONFINE });
      if (req.method() !== 'GET') { contatore.nonGet += 1; return route.abort(); }
      return route.continue();
    });
    await page.goto('/');
    await page.waitForFunction(() => window.__talosHarnessUiRuntime);
    await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
    // una sessione aperta: il piede della chat c'è, e la pila si colloca sopra di lui (`misuraPilaToast`, «sopra-piede»)
    await page.evaluate((id) => window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Toast', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' }), SESSIONE);
    await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
    // si contano i toast «Collegato di nuovo» CREATI, non solo quelli a schermo
    await page.evaluate(() => {
      window.__toastRipresa = 0;
      new MutationObserver((voci) => {
        for (const v of voci) for (const n of v.addedNodes) if (n.classList?.contains('talos-toast') && /Collegato di nuovo/u.test(n.textContent || '')) window.__toastRipresa += 1;
      }).observe(document.querySelector('#regioneToast'), { childList: true });
    });
    await context.setOffline(true);
    await page.waitForTimeout(3000);
    await context.setOffline(false);
    // almeno due riprese: lo stream finto si chiude, l'EventSource ritenta, la sorveglianza lo vede cadere e tornare
    await page.waitForFunction(() => window.__toastRipresa >= 2, null, { timeout: 30_000 });
    // poi lo stream si chiude davvero: niente più riprese mentre si misura
    await page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.eventSource?.close());
    await page.waitForTimeout(600); // uscita del toast sostituito, entrata del nuovo
    const vivi = await page.evaluate(() => [...document.querySelectorAll('#regioneToast .talos-toast:not([data-uscita])')].filter((n) => /Collegato di nuovo/u.test(n.textContent || '')).length);
    const creati = await page.evaluate(() => window.__toastRipresa);
    const scheda = page.locator('#regioneToast .talos-toast:not([data-uscita])', { hasText: 'Collegato di nuovo' }).first();
    await scheda.hover(); // il timer del toast si ferma sotto il mouse: la scheda resta ferma fra le due foto
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
      const r = document.querySelector('#regioneToast');
      const s = [...r.querySelectorAll('.talos-toast:not([data-uscita])')].find((n) => /Collegato di nuovo/u.test(n.textContent || ''));
      const st = getComputedStyle(r);
      const box = r.getBoundingClientRect();
      return { posizione: r.dataset.posizione ?? null, overflow: st.overflowY, ombra: getComputedStyle(s).boxShadow,
        box: { x: box.left, y: box.top, w: box.width, h: box.height },
        pad: { sopra: parseFloat(st.paddingTop), lati: Math.min(parseFloat(st.paddingLeft), parseFloat(st.paddingRight)), sotto: parseFloat(st.paddingBottom) } };
    });
    const e = estensioni(m.ombra);
    // la zona: la regione più un bordo, dentro la finestra
    const bordo = 24;
    const x = Math.max(0, Math.floor(m.box.x - bordo));
    const y = Math.max(0, Math.floor(m.box.y - bordo));
    const clip = { x, y, width: Math.min(1024, Math.ceil(m.box.x + m.box.w + bordo)) - x, height: Math.min(800, Math.ceil(m.box.y + m.box.h + bordo)) - y };
    const conRitaglio = await page.screenshot({ clip });
    await page.evaluate(() => { document.querySelector('#regioneToast').style.overflowY = 'visible'; });
    const senzaRitaglio = await page.screenshot({ clip });
    await page.evaluate(() => { document.querySelector('#regioneToast').style.removeProperty('overflow-y'); });
    const ancora = await page.screenshot({ clip });
    const stabile = differenzaMassima(conRitaglio, ancora);
    const taglio = differenzaMassima(conRitaglio, senzaRitaglio);
    console.log(`MISURA-TOAST-SHADOW ${tema} ${JSON.stringify({ ...m, estensioni: e, creati, vivi, stabile, taglio })}`);
    await page.screenshot({ path: `artifacts/toast-ombra-1024-${tema}.png` });
    // la prova vale solo se la regione è collocata e RITAGLIA, e se la zona non è cambiata fra le foto
    expect(m.posizione, 'la regione è collocata').not.toBeNull();
    expect(m.overflow, 'e scorre, quindi ritaglia').not.toBe('visible');
    expect(stabile, 'la zona è ferma fra le foto (altrimenti il confronto non dice niente)').toBeLessThanOrEqual(1);
    expect(taglio, `il ritaglio della regione non cambia nessun pixel (ombra ${JSON.stringify(e)}, margine ${JSON.stringify(m.pad)})`).toBeLessThanOrEqual(1);
    // una ripresa ripetuta prende il posto della precedente
    expect(creati, 'la prova ha fatto ripetere la ripresa').toBeGreaterThanOrEqual(2);
    expect(vivi, `${creati} riprese, un toast solo a schermo`).toBe(1);
    expect(contatore.nonGet).toBe(0);
  });
}
