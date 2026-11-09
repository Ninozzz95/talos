/*
 * R-42 (Performance, 31/10/2026; nata dalla revisione avversaria del Desktop, che ha scritto la prima sonda): sulla pagina VERA, mentre
 *   si scorre una chat lunga, la barra della cronologia (1) NON fa ridisegni lunghi di tutte le voci — prima ne partiva uno a ogni passo,
 *   perché i segni della spina che entrano/escono dalla vista contavano come «forma» — e (2) la strada corta lascia esattamente ciò che
 *   la strada lunga disegnerebbe.
 * ⛔ Il ridisegno lungo si riconosce senza contatori nel prodotto: una SENTINELLA (una lente finta su una voce lontana dal segnavia) la
 *   riscrive solo la strada lunga. Durante lo scorrimento deve restare; dopo il ridisegno forzato della prova deve sparire (controllo
 *   positivo: se non sparisce il confronto non vale niente).
 */
import { test, expect } from '@playwright/test';

const ID = 'r42-scorrimento';
const eventiTurni = (quanti) => {
  const lista = [];
  for (let t = 0; t < quanti; t += 1) {
    lista.push(
      { type: 'RunStarted', runId: `run-${t}`, input: { consegna: `Domanda numero ${t}.`, seguito: t > 0 } },
      { type: 'TextMessageStart', messageId: `m-${t}`, role: 'assistant' },
      { type: 'TextMessageContent', messageId: `m-${t}`, delta: `Risposta ${t}.\n\n${'parola '.repeat(80)}fine.` },
      { type: 'TextMessageEnd', messageId: `m-${t}` },
      { type: 'RunFinished', outcome: { type: 'success' } },
    );
  }
  return lista;
};
const fotografa = (page) => page.evaluate(() => [...document.querySelectorAll('.talos-cronologia__voce')].map((b) => [
  b.classList.contains('talos-cronologia__voce--attiva') ? 'A' : '-', b.getAttribute('aria-current') || '-', b.tabIndex,
  b.querySelector('.talos-cronologia__linea')?.style.getPropertyValue('--lente') || '?']).map((x) => x.join('')).join(' '));
/* TRE sentinelle (prima voce, metà, ultima): la strada corta tocca solo le voci attorno al segnavia di prima e a quello nuovo, quindi
   ne può cancellare al più due; la strada lunga le riscrive tutte. «Nessuna sentinella viva» = c'è stato un ridisegno lungo.
   ⛔ Con una sentinella sola la prova era falsa al primo passo: la pagina parte dal fondo e il primo passo va in cima, cioè proprio
   sulla voce «lontana» scelta come sentinella (misurato 31/10: rosso al passo 1 senza nessun cambio di forma). */
const mettiSentinella = (page) => page.evaluate(() => {
  const v = [...document.querySelectorAll('.talos-cronologia__voce')];
  window.__sentinelle = [];
  for (const i of [0, Math.floor(v.length / 2), v.length - 1]) {
    const linea = v[i]?.querySelector('.talos-cronologia__linea');
    if (!linea) continue;
    window.__sentinelle.push([linea, linea.style.getPropertyValue('--lente')]);
    linea.style.setProperty('--lente', '99px');
  }
});
const sentinellaViva = (page) => page.evaluate(() => [...document.querySelectorAll('.talos-cronologia__linea')].some((l) => l.style.getPropertyValue('--lente') === '99px'));
/* le sentinelle rimaste (la strada corta non le tocca: è giusto) tornano al loro valore prima della foto, o la foto confronterebbe la prova */
const togliSentinelle = (page) => page.evaluate(() => { for (const [linea, valore] of window.__sentinelle ?? []) if (linea.style.getPropertyValue('--lente') === '99px') linea.style.setProperty('--lente', valore); });

test('R42-SCORRIMENTO — scorrendo una chat lunga la cronologia non ridisegna tutte le voci, e la strada corta disegna come la lunga', async ({ page }) => {
  test.setTimeout(240_000);
  await page.route('**/api/v1/**', (route) => (route.request().method() !== 'GET' ? route.abort() : route.fallback()));
  await page.route(`**/api/v1/sessions/${ID}/events*`, () => { /* muto */ });
  await page.addInitScript(() => { try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: 'dark', uiLanguage: 'it' } })); } catch { /* */ } });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate((id) => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione(id, 'workspace', 'Prova R-42', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
  }, ID);
  let seq = 0;
  await page.evaluate((lista) => { const r = window.__talosHarnessUiRuntime; for (const e of lista) r.handleRealEvent(e, r.realSessionState.generation); },
    eventiTurni(60).map((e) => ({ ...e, _sequenza: ++seq })));
  await page.waitForTimeout(1200);
  const voci = await page.locator('.talos-cronologia__voce').count();
  expect(voci, 'la premessa: la cronologia ha molte voci').toBeGreaterThan(20);
  /* la premessa del difetto: scorrendo, i segni della spina cambiano davvero classe (altrimenti la prova non guarderebbe niente) */
  await page.evaluate(() => {
    window.__segniCambiati = 0;
    new MutationObserver((l) => { for (const r of l) if (r.target.classList?.contains('talos-turn-spine__tick')) window.__segniCambiati += 1; })
      .observe(document.querySelector('#conversation'), { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  const sc = page.locator('.talos-conversation.conversation');
  const fotogrammi = () => page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(ok, 40)))));
  const altezza = await sc.evaluate((s) => s.scrollHeight - s.clientHeight);
  const lunghiNelloScorrimento = []; const differenze = []; const attive = new Set();
  let passo = 0;
  for (let y = 0; y < altezza; y += 700) {
    passo += 1;
    await mettiSentinella(page);
    await sc.evaluate((s, v) => { s.scrollTop = v; }, y);
    await fotogrammi();
    if (!(await sentinellaViva(page))) lunghiNelloScorrimento.push(passo);
    await togliSentinelle(page);
    const corta = await fotografa(page);
    attive.add(await page.evaluate(() => document.querySelector('.talos-cronologia')?.dataset.attivaVera ?? null));
    /* il ridisegno lungo forzato: un cambio di forma (un figlio di #conversation messo e tolto) */
    await mettiSentinella(page);
    await page.evaluate(() => { const c = document.querySelector('#conversation'); const x = document.createElement('div'); c.append(x); x.remove(); });
    await fotogrammi();
    expect(await sentinellaViva(page), `controllo positivo: il ridisegno lungo è avvenuto (passo ${passo})`).toBe(false);
    const lunga = await fotografa(page);
    if (corta !== lunga) differenze.push({ y, corta: corta.slice(0, 300), lunga: lunga.slice(0, 300) });
  }
  /* AL CONTRARIO (seconda revisione del Desktop): un TONO che cambia davvero su un segno È un cambio di forma, e deve ridisegnare.
     Senza questo passo la prova vedrebbe solo il verso «non ridisegnare», e un filtro che non riconosce più nessun tono passerebbe. */
  await mettiSentinella(page);
  const tonoMesso = await page.evaluate(() => {
    const segno = [...document.querySelectorAll('#conversation .talos-turn-spine__tick')].find((s) => !s.classList.contains('talos-turn-spine__tick--danger'));
    segno?.classList.add('talos-turn-spine__tick--danger');
    return Boolean(segno);
  });
  await fotogrammi();
  expect(tonoMesso, 'la premessa: c’è un segno a cui mettere un tono').toBe(true);
  expect(await sentinellaViva(page), 'un tono nuovo su un segno ridisegna la cronologia').toBe(false);
  const segni = await page.evaluate(() => window.__segniCambiati);
  console.log(`[R42-SCORRIMENTO] passi ${passo} · voci ${voci} · voci attive diverse ${attive.size} · cambi di classe dei segni ${segni} · ridisegni lunghi durante lo scorrimento ai passi: ${lunghiNelloScorrimento.join(', ') || 'nessuno'}`);
  expect(attive.size, 'la premessa: la voce attiva è cambiata più volte').toBeGreaterThanOrEqual(4);
  expect(segni, 'la premessa: i segni della spina cambiano classe scorrendo').toBeGreaterThan(0);
  expect(lunghiNelloScorrimento, 'scorrendo non parte nessun ridisegno lungo della cronologia').toEqual([]);
  expect(differenze, JSON.stringify(differenze[0] ?? {})).toEqual([]);
});
