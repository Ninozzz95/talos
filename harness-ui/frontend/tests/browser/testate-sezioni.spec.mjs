/*
 * TESTATE-SEZIONI — owner 29/10/2026, regola «hard block» della grammatica unica delle sezioni, scelta «A · come Note» sul bozzetto
 * coi pezzi veri: Note, Attività, Libreria, Memoria, Ricerca approfondita, Progetti, Automazioni e Bacheca hanno LA STESSA testata
 * (quella dell'Atlas di Note, 24/09): titolo e frase senza il riquadro con l'icona, e «Nuova…» a destra del titolo dove la sezione
 * crea qualcosa (Note, Attività, Memoria, Automazioni). La Bacheca perde l'etichetta in maiuscolo e tiene i filtri sotto.
 *
 * Cancello: fallisce se una testata mostra il riquadro, se un titolo ha una misura diversa dalle altre, o se un «Nuova…» che esiste
 * sta ancora nella barra in alto invece che nella testata. Server isolato di `playwright.config.mjs`, dati FINTI dal browser
 * (`page.route`), nessuna scrittura: ogni richiesta non-GET si ferma e si conta.
 */
import { expect, test } from '@playwright/test';

test.use({ locale: 'it-IT', timezoneId: 'Europe/Rome', viewport: { width: 1920, height: 1080 } });

const SID = 'testate-sezioni';
const MODELLO = 'z-ai/glm-5.3-flash';
const NOTE = [{ id: 'n1', titolo: 'Principi del workspace', contenuto: 'Distingui i comandi dal contenuto.', aggiornataAlle: '2026-10-29T08:24:00.000Z' }];
const MEMORIE = [{ id: 'm1', titolo: 'I commit sono in inglese', contenuto: 'Titolo e corpo.', genere: 'policy_note', creataAlle: '2026-10-29T08:00:00.000Z', aggiornataAlle: '2026-10-29T08:00:00.000Z' }];
const sse = (ev) => `retry: 3600000\n${ev.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}`;
const EVENTI = [{ type: 'RunStarted', input: { consegna: 'Prova' }, _sequenza: 1 }, { type: 'RunFinished', _sequenza: 2 }, { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }];

async function apri(page, colore) {
  const nonGet = [];
  await page.addInitScript((c) => { try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode: c, themePreset: 'calm', themePresetVersione: 2, uiLanguage: 'it' } })); } catch { /* */ } }, colore);
  await page.route('**/*', (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname === `/api/v1/sessions/${SID}/events`) return route.fulfill({ contentType: 'text/event-stream', body: sse(EVENTI) });
    if (req.method() === 'GET' && url.pathname === `/api/v1/sessions/${SID}/notes`) return route.fulfill({ json: { ok: true, data: { note: NOTE, errore: null }, note: NOTE, meta: {} } });
    if (req.method() === 'GET' && url.pathname === `/api/v1/sessions/${SID}/memory`) return route.fulfill({ json: { ok: true, data: { memorie: MEMORIE, errore: null }, memorie: MEMORIE, meta: {} } });
    if (req.method() !== 'GET' && req.method() !== 'HEAD') { nonGet.push(`${req.method()} ${url.pathname}`); return route.abort(); }
    return route.continue();
  });
  await page.goto('/');
  await expect(page.locator('.talos-nav-item[data-vaia="chat"]').first()).toBeVisible();
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
  await page.evaluate(({ SID, M }) => window.__talosHarnessUiRuntime.passaASessione(SID, 'workspace', 'Testate', M, { conclusa: true, modello: M }), { SID, M: MODELLO });
  await page.waitForTimeout(600);
  return nonGet;
}

const vai = (page, d) => page.evaluate((d) => document.querySelector(`.talos-sidebar [data-vaia="${d}"]`).click(), d);

/** La testata visibile della schermata: il riquadro, il titolo, la frase, il «Nuova…» e dove sta. */
const testata = (page) => page.evaluate(() => {
  /* la schermata della sezione (`#schermo…`), non il contenitore esterno che le racchiude tutte: lì dentro il primo «Nuova…» può
     essere quello di un'altra sezione nascosta */
  const schermo = [...document.querySelectorAll('.talos-screen[id^="schermo"]')].find((s) => !s.hidden && s.getClientRects().length);
  const intro = schermo?.querySelector('.td-section .td-intro') || schermo?.querySelector('.talos-page__head');
  const h2 = intro?.querySelector('h2');
  const frase = intro?.querySelector('p');
  const cs = (e) => (e ? getComputedStyle(e) : null);
  const mark = intro?.querySelector('.td-intro-mark');
  const eyebrow = intro?.querySelector('.talos-eyebrow');
  const nuova = schermo?.querySelector('[data-nuova], [data-automation-action="new"]');
  return {
    schermo: schermo?.id ?? null,
    riquadro: Boolean(mark && mark.getClientRects().length && cs(mark).display !== 'none'),
    etichetta: Boolean(eyebrow && eyebrow.getClientRects().length),
    titolo: h2 ? { size: cs(h2).fontSize, weight: cs(h2).fontWeight, lh: cs(h2).lineHeight, ls: cs(h2).letterSpacing } : null,
    frase: frase ? cs(frase).fontSize : null,
    nuova: nuova ? (nuova.closest('.td-intro') ? 'testata' : nuova.closest('.talos-topbar') ? 'barra' : 'altrove') : null,
    /* owner 29/10 («Sì, larga come Note»): la ricerca cresce fino a riempire la riga, senza tetto (la Libreria ha un filtro in più accanto) */
    ricerca: (() => { const c = schermo?.querySelector('.td-section .td-search'); if (!c) return null; const st = getComputedStyle(c); return `${st.flexGrow}|${st.maxWidth}`; })(),
  };
});

const SEZIONI = [
  ['note', true], ['attivita', true], ['memoria', true], ['automazioni', true],
  ['libreria', false], ['ricerca', false], ['progetti', false], ['board', false],
];

for (const colore of ['light', 'dark']) {
  test(`TESTATE-SEZIONI-01 · una testata sola per tutte le sezioni (${colore})`, async ({ page }) => {
    const nonGet = await apri(page, colore);
    const viste = {};
    for (const [sezione, crea] of SEZIONI) {
      await vai(page, sezione);
      /* si aspetta la testata MONTATA (`.td-intro`), non quella del modello di pagina che c'è un attimo prima del montaggio */
      await expect.poll(async () => page.evaluate((b) => b || Boolean([...document.querySelectorAll('.talos-screen[id^="schermo"]')]
        .find((s) => !s.hidden && s.getClientRects().length)?.querySelector('.td-section .td-intro h2')), sezione === 'board'), { message: `${sezione}: testata montata` }).toBe(true);
      await expect.poll(async () => (await testata(page)).titolo, { message: `${sezione}: titolo` }).not.toBeNull();
      if (crea) await expect.poll(async () => (await testata(page)).nuova, { message: `${sezione}: «Nuova…» nella testata` }).toBe('testata');
      const t = await testata(page);
      viste[sezione] = t;
      expect(t.riquadro, `${sezione}: niente riquadro con l'icona`).toBe(false);
      expect(t.etichetta, `${sezione}: niente etichetta in maiuscolo`).toBe(false);
      expect(t.frase, `${sezione}: la frase è quella piccola`).toBe('11px');
      await page.screenshot({ path: `test-results/testate-sezioni/${colore}-${sezione}.png` });
    }
    const note = viste.note.titolo;
    for (const [sezione] of SEZIONI) expect(viste[sezione].titolo, `${sezione}: titolo come Note`).toEqual(note);
    expect(note.size).toBe('22px');
    for (const [sezione] of SEZIONI) if (sezione !== 'board') expect(viste[sezione].ricerca, `${sezione}: ricerca larga come in Note`).toBe(viste.note.ricerca);
    expect(nonGet).toEqual([]);
  });
}
