import os from 'node:os';
import { test, expect } from '@playwright/test';

/*
 * BOLLE-REV-03-ROTELLA — R-41 (31/10/2026, accordo con Performance): il banco dei tempi di BOLLE-REV-03 scorre scrivendo `scrollTop`
 *   a ogni fotogramma, e ogni scrittura fa partire uno `scrollend`: la domanda appiccicata ricalcola allora a OGNI fotogramma, saltando
 *   il suo freno da 100 ms (traccia: 1332 ricalcoli su 1333 fotogrammi). Una rotella vera manda `scrollend` solo alla fine.
 * ⇒ Questo braccio scorre con la ROTELLA (`mouse.wheel`, passi veri) e tiene lo STESSO cancello dell'owner (28/10, «sotto il +10%»),
 *   accanto a BOLLE-REV-03 che resta com'è: non si allenta niente, e un difetto che si vede solo con la rotella viene preso lo stesso.
 *   Stesso disegno ABBA a coppie, stesso carico scritto accanto ai numeri; in più i ricalcoli della domanda PER FOTOGRAMMA, scritti.
 * ⛔ MISURATO il 31/10 (40 giri, prova di funzionamento): anche così i ricalcoli sono ~0,75 per fotogramma, non pochi. Ogni
 *   `mouse.wheel` di Playwright è un gesto a sé e finisce col suo `scrollend`: questo braccio NON toglie l'artefatto come si sperava,
 *   lo dimezza appena. Resta utile come secondo modo di scorrere sotto lo stesso cancello; la frequenza vera di una rotella a scatti
 *   continui resta da misurare a mano (detto a Performance).
 * ⛔ NIENTE SCRITTURE: il server finto risponde ai GET, ogni non-GET si ferma.
 */

const ID = 'bolle-rotella';
const TURNI = Number(process.env.BOLLE_TURNI || 300);
const eventiTurni = (quanti) => {
  const lista = [];
  for (let t = 0; t < quanti; t += 1) {
    lista.push(
      { type: 'RunStarted', runId: `run-${t}`, input: { consegna: `Domanda numero ${t}: spiegami il passo ${t}.`, seguito: t > 0 } },
      { type: 'TextMessageStart', messageId: `m-${t}`, role: 'assistant' },
      { type: 'TextMessageContent', messageId: `m-${t}`, delta: `Risposta ${t}.\n\n${'parola '.repeat(60)}fine.` },
      { type: 'TextMessageEnd', messageId: `m-${t}` },
      { type: 'RunFinished', outcome: { type: 'success' } },
    );
  }
  return lista;
};
const cpuDiSistema = async () => {
  const somma = () => os.cpus().reduce((s, c) => { const t = c.times; return { lavoro: s.lavoro + t.user + t.nice + t.sys + t.irq, tutto: s.tutto + t.user + t.nice + t.sys + t.irq + t.idle }; }, { lavoro: 0, tutto: 0 });
  const a = somma(); await new Promise((ok) => setTimeout(ok, 1000)); const b = somma();
  return Math.round(((b.lavoro - a.lavoro) / Math.max(1, b.tutto - a.tutto)) * 100);
};
const mediana = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

test('BOLLE-REV-03-ROTELLA cost bench with a real wheel, arms in ABBA order, compared in pairs, ricalcoli per frame written', async ({ browser }) => {
  test.setTimeout(1_800_000);
  const misuraIn = async (stacca) => {
    const cpu = await cpuDiSistema();
    const contesto = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await contesto.newPage();
    await page.addInitScript(() => { try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: 'dark', uiLanguage: 'it' } })); } catch { /* */ } });
    await page.route('**/api/v1/**', (route) => (route.request().method() !== 'GET' ? route.abort() : route.fallback()));
    await page.route(`**/api/v1/sessions/${ID}/events*`, () => { /* muto */ });
    await page.goto('/');
    await page.waitForFunction(() => window.__talosHarnessUiRuntime);
    await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
    await page.evaluate((id) => {
      const r = window.__talosHarnessUiRuntime;
      r.passaASessione(id, 'workspace', 'Bolle rotella', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
      r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
    }, ID);
    await expect(page.locator('#conversation')).not.toHaveClass(/\bis-restoring\b/u);
    let seq = 0;
    const lista = eventiTurni(TURNI).map((e) => ({ ...e, _sequenza: ++seq }));
    for (let i = 0; i < lista.length; i += 250) {
      await page.evaluate((pezzo) => { const r = window.__talosHarnessUiRuntime; for (const e of pezzo) r.handleRealEvent(e, r.realSessionState.generation); }, lista.slice(i, i + 250));
    }
    await page.waitForTimeout(1500);
    if (stacca) await page.evaluate(() => window.__talosHarnessUiRuntime.domandaAppiccicata().scollega());
    const sc = await page.locator('.talos-conversation.conversation').boundingBox();
    await page.mouse.move(sc.x + sc.width / 2, sc.y + sc.height / 2);
    const corsa = async () => {
      await page.evaluate(() => { const s = document.querySelector('#conversation').parentElement; s.scrollTop = 0; });
      await page.waitForTimeout(300);
      const altezza = await page.evaluate(() => { const s = document.querySelector('#conversation').parentElement; return s.scrollHeight - s.clientHeight; });
      /* il registratore dei fotogrammi gira nella pagina mentre la rotella scorre dall'esterno */
      await page.evaluate(() => {
        const r = window.__talosHarnessUiRuntime.domandaAppiccicata?.();
        window.__rot = { fotogrammi: [], via: true, ricalcoliPrima: r?.conteggi?.().ricalcoli ?? 0 };
        let prima = performance.now();
        const giro = () => { if (!window.__rot.via) return; const ora = performance.now(); window.__rot.fotogrammi.push(ora - prima); prima = ora; requestAnimationFrame(giro); };
        requestAnimationFrame(giro);
      });
      const passo = Math.max(240, Math.ceil(altezza / 400));
      for (let fatto = 0; fatto < altezza; fatto += passo) await page.mouse.wheel(0, passo);
      await page.waitForTimeout(400);
      return page.evaluate(() => {
        window.__rot.via = false;
        const f = window.__rot.fotogrammi.slice(1).sort((a, b) => a - b);
        const r = window.__talosHarnessUiRuntime.domandaAppiccicata?.();
        const ricalcoli = (r?.conteggi?.().ricalcoli ?? 0) - window.__rot.ricalcoliPrima;
        return { fotogrammi: f.length, p50: +f[Math.floor(f.length * 0.5)].toFixed(1), p95: +f[Math.floor(f.length * 0.95)].toFixed(1),
          oltre20: +(f.filter((x) => x > 20).length / Math.max(1, f.length)).toFixed(3), ricalcoliPerFotogramma: +(ricalcoli / Math.max(1, f.length)).toFixed(3) };
      });
    };
    await corsa();
    const a = await corsa(); const b = await corsa();
    await contesto.close();
    return { cpu, p50: (a.p50 + b.p50) / 2, p95: (a.p95 + b.p95) / 2, oltre20: (a.oltre20 + b.oltre20) / 2, ricalcoliPerFotogramma: (a.ricalcoliPerFotogramma + b.ricalcoliPerFotogramma) / 2 };
  };
  const p1 = await misuraIn(true);
  const p2 = await misuraIn(false);
  const p3 = await misuraIn(false);
  const p4 = await misuraIn(true);
  /* ⛔ Treno 02/11/2026 (regola 6): con DUE coppie la «mediana» è la media delle due, e una coppia sola decideva tutto. Nella suite a 8 lavoratori: p95 [1,551 · 0,976] ⇒ 1,26, rosso;
     da sola, sullo stesso codice: [0,911 · 0,913]. Con una terza coppia la mediana è vera: una coppia disturbata non decide, un difetto che c'è in tutte resta rosso. Il cancello dell'owner non cambia. */
  const p5 = await misuraIn(true);
  const p6 = await misuraIn(false);
  const coppie = [[p1, p2], [p4, p3], [p5, p6]];
  const r50 = coppie.map(([s, c]) => (c.p50 - 1) / s.p50);
  const r95 = coppie.map(([s, c]) => (c.p95 - 2) / s.p95);
  const cpuMassima = Math.max(p1.cpu, p2.cpu, p3.cpu, p4.cpu, p5.cpu, p6.cpu);
  console.log('BOLLE-REV-03-ROTELLA', TURNI, JSON.stringify({ abba: [p1, p2, p3, p4, p5, p6], rapporti: { p50: r50.map((r) => +r.toFixed(3)), p95: r95.map((r) => +r.toFixed(3)) }, disturbato: cpuMassima > 60 }));
  const nota = cpuMassima > 60 ? ` (disturbato: CPU fino al ${cpuMassima}%, da rifare a macchina libera)` : '';
  expect(mediana(r50), `median frame with the stuck question, real wheel, paired ratio${nota}`).toBeLessThanOrEqual(1.10);
  expect(mediana(r95), `95th percentile frame with the stuck question, real wheel, paired ratio${nota}`).toBeLessThanOrEqual(1.10);
});
