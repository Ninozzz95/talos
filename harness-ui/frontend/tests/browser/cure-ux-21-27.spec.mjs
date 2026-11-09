import { expect, test } from '@playwright/test';

/*
 * Revisione UX della candidata del 04/11/2026, righe 21-23 e 26 (le 24, 25 e 27 sono parole e numeri: `tests/unit/cure-ux-21-27.test.mjs`).
 *   21 · cambiata la lingua senza ricaricare, ogni pagina già disegnata si ridice (barra delle sezioni, «Nuova nota», Bacheca, anteprima).
 *   22 · Libreria e Ricerca senza sessione: una frase sola che dice cosa fare, niente «non disponibile» in testa; «Nuova ricerca» parte.
 *   23 · il conteggio una volta sola, sotto il titolo, in Note, Memoria, Attività e Bacheca.
 *   26 · la barra conta le sessioni che apri tu, la Bacheca anche quelle dei sotto-agenti, e lo dice.
 * ⛔ Server isolato di `playwright.config.mjs` (4176, archivio vuoto). Le risposte di `/api/v1/me/…` e `GET /api/v1/sessions` sono finte
 *   (forma letta da `archivi-senza-sessione.spec.mjs` e `lingua-dal-vivo.spec.mjs`); ogni altra scrittura si ferma e si conta.
 */
test.use({ locale: 'it-IT' });

const FOTO = process.env.TALOS_FOTO_CURE_UX || '';
const TEMA = process.env.TALOS_TEMA_CURE_UX === 'dark' ? 'dark' : 'light'; // le foto nei due temi: la stessa prova, un tema per corsa
const nota = (id, titolo) => ({ id, titolo, contenuto: `contenuto di ${titolo}`, formato: 'testo', origine: 'persona', creataAlle: '2026-11-01T10:00:00.000Z', aggiornataAlle: '2026-11-01T10:00:00.000Z' });
const sessione = (sessionId, extra = {}) => ({ sessionId, taskId: sessionId, progetto: null, nome: `Sessione ${sessionId}`, avviataAlle: '2026-11-01T10:00:00.000Z',
  conclusa: true, interrotta: false, modello: 'z-ai/glm-5.3-flash', padreId: null, profonditaDelega: 0, ...extra });

async function apri(page, { tema = TEMA, vuote = false, trattieniMetriche = false } = {}) {
  let rilascia = () => {};
  const metriche = new Promise((fatto) => { rilascia = fatto; });
  if (!trattieniMetriche) rilascia();
  const conti = { scrittureAltrove: [], rilascia: () => rilascia() };
  await page.addInitScript((modo) => {
    try {
      localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: 'it', colorMode: modo } }));
      localStorage.setItem('talos.desktop.workspace.v2', JSON.stringify({ version: 2, density: 'compact', restoreWorkspace: false, lastSession: null }));
    } catch {}
  }, tema);
  /* riga 26: 3 sessioni che apri tu (2 in un progetto, 1 senza) + 2 di sotto-agenti (una col padre, una col padre cancellato).
     Decisione 175 (N3a): + 1 passo di un workflow, che non si conta in nessun posto (né barra, né Bacheca, nemmeno al primo disegno);
     (N3c) r3 e f1 interrotte, per il filtro «Interrotte»: 2 mostrate, 1 di un sotto-agente. */
  const sessioni = [
    sessione('r1', { progetto: 'C:/p/uno' }), sessione('r2', { progetto: 'C:/p/uno' }), sessione('r3', { conclusa: false, interrotta: true }),
    sessione('f1', { padreId: 'r1', profonditaDelega: 1, progetto: 'C:/p/uno', conclusa: false, interrotta: true }), sessione('o1', { profonditaDelega: 1 }),
    sessione('w1', { passoWorkflow: true, padreId: 'r1', profonditaDelega: 1 }),
  ];
  const stato = {
    note: vuote ? [] : [nota('n1', 'Prima nota'), nota('n2', 'Seconda nota')],
    attivita: vuote ? [] : [{ id: 't1', titolo: 'Da fare', descrizione: '', priorita: 'normal', stato: 'todo', aggiornataAlle: '2026-11-01T10:00:00.000Z' }],
    memorie: vuote ? [] : [{ id: 'm1', titolo: 'Tema', contenuto: 'scuro', genere: 'preference', aggiornataAlle: '2026-11-01T10:00:00.000Z' }],
  };
  await page.route('**/api/v1/**', async (route) => {
    const r = route.request();
    const percorso = new URL(r.url()).pathname;
    if (r.method() === 'POST' && percorso === '/api/v1/app-settings/window') return route.fulfill({ json: { ok: true, data: { revisione: Number.MAX_SAFE_INTEGER } } });
    if (r.method() !== 'GET') { conti.scrittureAltrove.push(`${r.method()} ${percorso}`); return route.abort(); }
    const me = /^\/api\/v1\/me\/(notes|tasks|memory)$/u.exec(percorso);
    if (me) {
      const campo = { notes: 'note', tasks: 'attivita', memory: 'memorie' }[me[1]];
      return route.fulfill({ json: { ok: true, data: { [campo]: stato[campo], errore: null } } });
    }
    if (percorso === '/api/v1/sessions') return route.fulfill({ json: { ok: true, data: { items: sessioni } } });
    if (/^\/api\/v1\/sessions\/(r|f|o|w)\d\/metrics$/u.test(percorso)) await metriche;
    if (/^\/api\/v1\/sessions\/(r|f|o|w)\d\//u.test(percorso)) return route.fulfill({ status: 404, json: { ok: false, error: { code: 'NOT_FOUND', message: 'non c’è' } } });
    return route.fallback();
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => { window.__nessunaRicarica = true; });
  return conti;
}
const vai = (page, dove) => page.locator(`.talos-nav-item[data-vaia="${dove}"]`).first().click();
const lingua = (page, quale) => page.evaluate((l) => {
  const sel = document.querySelector('#setting-uiLanguageSelect');
  sel.value = l;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}, quale);
async function foto(page, nome) {
  if (!FOTO) return;
  await page.screenshot({ path: `${FOTO}/${nome}-${TEMA === 'dark' ? 'scuro' : 'chiaro'}.png` });
}

test('UX21-LINGUA — le pagine già disegnate si ridicono nella lingua nuova, nei due versi, senza ricaricare', async ({ page }) => {
  const conti = await apri(page);
  /* si disegnano in italiano Note, Memoria, Attività e Bacheca; poi si cambia lingua stando sulle Note */
  await vai(page, 'memoria'); await expect(page.locator('#schermoMemoria')).toContainText('Tema');
  await vai(page, 'attivita'); await expect(page.locator('#schermoAttivita')).toContainText('Da fare');
  await vai(page, 'board'); await expect(page.locator('#schermoBoard thead')).toContainText('Giri');
  await vai(page, 'note'); await expect(page.locator('#schermoNote')).toContainText('Prima nota');
  const cerca = (id) => page.locator(`#${id} input[type="search"]`).first();
  await expect(cerca('schermoNote')).toHaveAttribute('placeholder', 'Cerca nel titolo e nel contenuto…');
  await expect(page.locator('#schermoNote [data-nuova]').first()).toContainText('Nuova nota');
  await lingua(page, 'en');
  await expect(cerca('schermoNote')).toHaveAttribute('placeholder', 'Search title and content…');
  await expect(page.locator('#schermoNote [data-nuova]').first()).toContainText('New note');
  /* le pagine nascoste, ridette prima ancora di tornarci: la barra della sezione e le testate della Bacheca */
  await expect(cerca('schermoMemoria')).toHaveAttribute('placeholder', 'Search title and content…');
  await expect(cerca('schermoAttivita')).toHaveAttribute('placeholder', 'Search title and content…');
  await expect(page.locator('#schermoBoard thead')).toContainText('Turns');
  await expect(page.locator('#schermoBoard thead')).not.toContainText('Giri');
  await expect(page.locator('#boardEsito')).toContainText('sessions');
  await vai(page, 'memoria'); await expect(page.locator('#schermoMemoria [data-aggiorna], #schermoMemoria [data-memory-refresh]').first()).toContainText('Refresh');
  await foto(page, 'ux21-memoria-en');
  /* e al contrario: si torna all'italiano */
  await lingua(page, 'it');
  await expect(cerca('schermoMemoria')).toHaveAttribute('placeholder', 'Cerca nel titolo e nel contenuto…');
  await expect(page.locator('#schermoNote [data-nuova]').first()).toContainText('Nuova nota');
  await expect(page.locator('#schermoBoard thead')).toContainText('Giri');
  expect(await page.evaluate(() => window.__nessunaRicarica), 'la pagina non si è ricaricata').toBe(true);
  expect(conti.scrittureAltrove).toEqual([]);
});

test('UX21-ANTEPRIMA — «Ferma anteprima» segue la lingua come il resto della colonna', async ({ page }) => {
  await apri(page);
  await page.locator('[data-vaia="impostazioni"]').first().click();
  const comando = page.locator('#schermoImpostazioni .preview-stop').first();
  await comando.waitFor({ state: 'attached', timeout: 10_000 });
  await expect(comando).toContainText(/Ferma anteprima|Riprendi anteprima/u);
  await lingua(page, 'en');
  await expect(comando).toContainText(/Stop preview|Resume preview/u);
  await expect(comando).toHaveAttribute('aria-label', /Stop preview|Resume preview/u);
  await comando.scrollIntoViewIfNeeded();
  await foto(page, 'ux21-anteprima-en');
  await lingua(page, 'it');
  await expect(comando).toContainText(/Ferma anteprima|Riprendi anteprima/u);
});

for (const [dove, schermo, frase] of [
  ['libreria', 'schermoLibreria', 'Apri una sessione per leggere la Libreria del progetto.'],
  ['ricerca', 'schermoRicerca', 'Apri una sessione per leggere le ricerche del progetto.'],
]) {
  test(`UX22-SENZA-SESSIONE — ${dove}: una frase sola che dice cosa fare, nessun guasto in testa`, async ({ page }, info) => {
    const conti = await apri(page);
    await vai(page, dove);
    const s = page.locator(`#${schermo}`);
    await expect(s.getByText(frase, { exact: true })).toHaveCount(1);
    await expect(s.getByText(frase, { exact: true })).toBeVisible();
    await expect(s.locator('.talos-topbar__path')).toHaveText('');
    await expect(s.locator('[role="alert"]')).toHaveCount(0);
    await expect(s).not.toContainText('non disponibil');
    if (dove === 'ricerca') await expect(s.locator('[data-nuova]').first(), '«Nuova ricerca» senza sessione PARTE: apre la sessione nuova').toBeEnabled();
    /* decisione 177 (N9c): ricerca, ordine, viste e «Aggiorna» su un elenco che non c'è non si mostrano. Prova gemella: UX177-C */
    await expect(s.locator('.td-toolbar')).toBeHidden();
    await foto(page, `ux22-${dove}`);
    expect(conti.scrittureAltrove).toEqual([]);
  });
}

test('UX177-SORELLE — la riga della selezione ha la stessa cornice in Note, Memoria e Attività; nell’Attività una casella sola', async ({ page }) => {
  await apri(page);
  const cornici = {};
  for (const [dove, schermo] of [['note', 'schermoNote'], ['memoria', 'schermoMemoria'], ['attivita', 'schermoAttivita']]) {
    await vai(page, dove);
    const riga = page.locator(`#${schermo} .td-bulk`);
    await expect(riga).toBeVisible();
    cornici[dove] = await riga.evaluate((n) => { const c = getComputedStyle(n); return [c.borderTopWidth, c.borderTopStyle, c.paddingTop, c.backgroundColor].join(' '); });
    if (dove === 'note') await foto(page, 'ux177-note-selezione');
  }
  expect(cornici.note, 'Note come Memoria (N9a)').toBe(cornici.memoria);
  expect(cornici.note, 'Note come Attività (N9a)').toBe(cornici.attivita);
  expect(cornici.note).toMatch(/^1px solid /u);
  /* N9b: il segno «fatta» è tondo; l'unica casella quadrata della card è la selezione, in alto a destra come in Memoria */
  const card = page.locator('#schermoAttivita .td-card').first();
  const raggio = await card.locator('.td-task-toggle').evaluate((n) => parseFloat(getComputedStyle(n).borderTopLeftRadius));
  expect(raggio, 'tondo: raggio almeno metà del lato (21 px)').toBeGreaterThanOrEqual(10.5);
  await expect(card.locator('input[type="checkbox"]')).toHaveCount(1);
  await foto(page, 'ux177-attivita-card');
});

test('UX23-UNA-VOLTA — Note, Memoria, Attività e Bacheca: il conteggio sotto il titolo, mai anche in testa', async ({ page }) => {
  await apri(page);
  for (const [dove, schermo, numero] of [['note', 'schermoNote', /2 note/u], ['memoria', 'schermoMemoria', /1 ricordo/u], ['attivita', 'schermoAttivita', /1 attività/u]]) {
    await vai(page, dove);
    const s = page.locator(`#${schermo}`);
    await expect(s.locator('[role="status"]').first()).toHaveText(numero);
    await expect(s.locator('.talos-topbar__path')).toHaveText('');
    await foto(page, `ux23-${dove}`);
  }
  await vai(page, 'board');
  await expect(page.locator('#boardEsito')).toContainText('5 sessioni');
  await expect(page.locator('#schermoBoard .talos-topbar__path')).toHaveText('');
});

test('UX23-VUOTE — con l’elenco vuoto lo dice lo stato vuoto, una volta: niente «0 note» né filtri a zero', async ({ page }) => {
  await apri(page, { vuote: true });
  await vai(page, 'note');
  const s = page.locator('#schermoNote');
  await expect(s.locator('.td-empty').first()).toBeVisible();
  await expect(s.locator('[data-note-stato], [role="status"]').first()).toHaveText('');
  await expect(s).not.toContainText(/\b0 note\b/u);
  await expect(s.locator('.talos-topbar__path')).toHaveText('');
  /* decisione 175 (N4, mutanti E2/BR9): nessuna riga di filtri che direbbe «Tutte (0)» sopra lo stato vuoto */
  await expect(s.locator('.td-filters')).toBeHidden();
  await expect(s).not.toContainText(/\(0\)/u);
});

test('UX26-CONTO — la barra conta le sessioni che apri tu, la Bacheca tutte e dice quante sono dei sotto-agenti', async ({ page }) => {
  const { rilascia } = await apri(page, { trattieniMetriche: true });
  await expect(page.locator('#sessionList .talos-sidebar__block-head .talos-nav-item__count')).toHaveText('3');
  await vai(page, 'board');
  const esito = page.locator('#boardEsito');
  /* decisione 175 (N3a, mutante BR10): già al PRIMO disegno, mentre le metriche arrivano, il passo del workflow non si conta */
  await expect(esito).toContainText('Caricamento metriche');
  await expect(esito).toContainText('5 sessioni, di cui 2 di sotto-agenti');
  await expect(page.locator('#schermoBoard [data-board-session-id="w1"]')).toHaveCount(0);
  rilascia();
  await expect(esito).not.toContainText('Caricamento metriche');
  await expect(page.locator('#schermoBoard tbody tr[data-board-session-id], #schermoBoard [data-board-session-id]').first()).toBeVisible();
  await expect(esito).toContainText('5 sessioni, di cui 2 di sotto-agenti');
  await expect(page.locator('#schermoBoard [data-board-session-id="w1"]')).toHaveCount(0);
  await foto(page, 'ux26-bacheca');
  /* decisione 175 (N3c): con un filtro acceso i sotto-agenti si contano fra le mostrate, e la frase dice di quale insieme parla */
  await page.locator('#schermoBoard [data-board-stato="interrotto"]').click();
  await expect(esito).toContainText('2 sessioni mostrate (di cui 1 di un sotto-agente) su 5');
  await foto(page, 'ux175-bacheca-filtro');
  await page.locator('#schermoBoard [data-board-stato="tutte"]').click();
  await expect(esito).toContainText('5 sessioni, di cui 2 di sotto-agenti');
  await lingua(page, 'en');
  await expect(page.locator('#boardEsito')).toContainText('5 sessions, 2 of them from sub-agents');
  await foto(page, 'ux21-ux26-bacheca-en');
});

test('UX187-BARRA — sotto «Bacheca» la riga «di cui 2 di sotto-agenti», la voce alta due righe, nelle due lingue', async ({ page }) => {
  await apri(page);
  const voce = page.locator('#sessionsPanel .talos-nav-item[data-vaia="board"]');
  const riga = voce.locator('.talos-nav-item__sub');
  await expect(riga).toHaveText('di cui 2 di sotto-agenti');
  await expect(riga).toBeVisible();
  await expect(voce.locator('.talos-nav-item__count')).toHaveText('5');
  const [nome, sotto, conto, alta, bassa] = await page.evaluate(() => {
    const v = document.querySelector('#sessionsPanel .talos-nav-item[data-vaia="board"]');
    const r = (n) => n.getBoundingClientRect();
    const altra = document.querySelector('#sessionsPanel .talos-nav-item[data-vaia="capability"], #sessionsPanel .talos-nav-item[data-vaia="note"]');
    return [r(v.querySelector('.talos-nav-item__label')), r(v.querySelector('.talos-nav-item__sub')), r(v.querySelector('.talos-nav-item__count')), r(v).height, altra ? r(altra).height : 0]
      .map((x) => (typeof x === 'number' ? x : { x: x.x, y: x.y, b: x.bottom, h: x.height }));
  });
  expect(sotto.y, 'la riga sta SOTTO il nome').toBeGreaterThanOrEqual(nome.b - 1);
  expect(Math.abs(sotto.x - nome.x), 'e parte dove parte il nome, non sotto l’icona').toBeLessThanOrEqual(2);
  expect(conto.y, 'il numero resta sulla prima riga').toBeLessThan(sotto.y);
  expect(alta, 'la voce è alta due righe').toBeGreaterThan(bassa + 8);
  expect(await riga.evaluate((n) => getComputedStyle(n).fontSize)).toBe('12px');
  await foto(page, 'ux187-barra-bacheca');
  await lingua(page, 'en');
  await expect(riga).toHaveText('2 of them from sub-agents');
  await foto(page, 'ux187-barra-bacheca-en');
  await lingua(page, 'it');
});

test('UX186-DIAGNOSI — «Diagnosi e configurazione» con lo stetoscopio di «Doctor»; le grandezze dei dati locali a 12 px', async ({ page }) => {
  await apri(page);
  await page.evaluate(() => {
    const voce = document.querySelector('.talos-sidebar [data-vaia="impostazioni"]');
    const gruppo = voce?.closest('.td-nav-group');
    const testata = gruppo?.id ? document.querySelector(`.talos-sidebar [aria-controls="${gruppo.id}"]`) : null;
    if (testata?.getAttribute('aria-expanded') === 'false') testata.click();
    voce?.click();
    window.__talosHarnessUiRuntime?.setSettingsSection?.('privacy');
  });
  await expect(page.locator('[data-settings-panel="privacy"]:visible').first()).toBeVisible();
  const scheda = page.locator('[data-settings-tab="account"]:visible').first();
  await expect(scheda.locator('use')).toHaveAttribute('href', '#i-stethoscope');
  const doctor = page.locator('.talos-sidebar .talos-nav-item[data-vaia="doctor"] use').first();
  await expect(doctor).toHaveAttribute('href', '#i-stethoscope');
  await page.evaluate(() => { try { localStorage.setItem('talos.prova.ux186', 'x'); } catch {} });
  await page.evaluate(() => window.__talosHarnessUiRuntime?.setSettingsSection?.('privacy'));
  const grandezza = page.locator('#settingsPrivacyList [data-dato-locale] .muted-copy').first();
  await expect(grandezza).toBeVisible();
  expect(await grandezza.evaluate((n) => getComputedStyle(n).fontSize)).toBe('12px');
  await foto(page, 'ux186-impostazioni-privacy');
});
