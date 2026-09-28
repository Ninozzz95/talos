import { test, expect } from '@playwright/test';

/*
 * F6-3 (27/09/2026) — il gruppo «Pull request» della scheda GitHub (`components/scheda-github.js`, decisioni owner 25-28).
 * Il servizio vero (`src/gh-service.mjs`) ha le sue prove con un `gh` finto; qui si prova la scheda: che chiami GitHub SOLO
 * quando il gruppo si apre, che disegni ciò che il server risponde (PR del ramo coi controlli, aperte, stato di GitHub CLI), e
 * che il modulo passi prima dalla conferma di Pubblica/Invia e poi mandi il corpo giusto.
 * ⛔ Le rotte GitHub e git della sessione finta rispondono con la FORMA delle buste vere; ogni altra non-GET si conta. «Apri»
 *   non apre niente davvero: `window.open` si registra. Server di prova (porta 4176).
 */
const SESSIONE = 'scheda-github-pr';
const CONFINE = `data: ${JSON.stringify({ type: 'CUSTOM', name: 'talos.fine-rigiocata' })}\n\n`;
const busta = (data) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data, meta: { schema: 'talos.api.v1' } }) });
const bustaErrore = (status, code, message) => ({ status, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code, message, title: message }, meta: { schema: 'talos.api.v1' } }) });

const CONTROLLI = {
  voci: [
    { nome: 'cli-unit', flusso: 'cli', stato: 'fallito', indirizzo: 'https://github.com/esempio/progetto/actions/runs/1', inizio: null, fine: null },
    { nome: 'streaming', flusso: 'desktop', stato: 'in-corso', indirizzo: 'https://github.com/esempio/progetto/actions/runs/2', inizio: null, fine: null },
    { nome: 'lento', flusso: 'nightly', stato: 'annullato', indirizzo: null, inizio: null, fine: null },
    { nome: 'build', flusso: 'ci', stato: 'passato', indirizzo: 'https://github.com/esempio/progetto/actions/runs/3', inizio: null, fine: null },
    { nome: 'pubblica', flusso: 'release', stato: 'saltato', indirizzo: null, inizio: null, fine: null },
  ],
  conteggi: { passati: 1, falliti: 1, inCorso: 1, saltati: 1, annullati: 1 }, totale: 5,
};
const pr = (numero, altro = {}) => ({ numero, titolo: `PR numero ${numero}`, url: `https://github.com/esempio/progetto/pull/${numero}`, stato: 'open', bozza: false, daFork: false, ramo: `ramo-${numero}`, base: 'main', autore: 'altro', aggiornata: new Date(Date.now() - 2 * 3600_000).toISOString(), creata: null, revisione: null, unione: 'CLEAN', ...altro });

function mondo() {
  const g = {
    stato: { versioneTalos: '2.101.0', installabile: true, installazione: { inCorso: false, errore: null }, collegamento: { stato: 'fermo', codice: null, indirizzo: null, errore: null }, gh: { trovato: true, origine: 'sistema', versione: '2.97.0', sistemaTroppoVecchio: null }, accesso: { collegato: true, account: 'io', ambiti: ['repo'] } },
    prDelRamo: pr(21, { titolo: 'Aggiunge la scheda PR', ramo: 'lavoro/f6', controlli: CONTROLLI }),
    /* nell'ordine del servizio vero: le proprie prima (gh-service `pullRequest`, provato in gh-service.test.mjs) */
    aperte: [pr(9, { autore: 'io', bozza: true }), pr(3, { updatedAt: null })],
    letture: [], corpi: [], risposte: {}, controlliDopo: null,
  };
  g.sinc = {
    ramo: 'lavoro/f6', staccata: false, remoti: [{ nome: 'origin', url: 'git@github.com:esempio/progetto.git', urlInvio: null }],
    riferimento: { corto: 'origin/lavoro/f6', remoto: 'origin', ramo: 'lavoro/f6' }, avanti: 0, indietro: 0, riferimentoSparito: false,
    remotoPerInvio: 'origin', ultimoRecupero: null, recuperoInCorso: false,
  };
  g.pulls = () => ({ repo: 'esempio/progetto', remoto: 'origin', ramo: g.sinc.ramo, ramoRemoto: g.sinc.ramo, pubblicato: Boolean(g.sinc.riferimento), avanti: g.sinc.avanti ?? 0, indietro: 0, ramoPredefinito: 'main', account: 'io', prDelRamo: g.prDelRamo, aperte: [...(g.prDelRamo?.stato === 'open' ? [g.prDelRamo] : []), ...g.aperte] });
  g.bozza = (base) => ({ repo: 'esempio/progetto', remoto: 'origin', ramo: g.sinc.ramo, ramoRemoto: g.sinc.ramo, pubblicato: Boolean(g.sinc.riferimento), avanti: g.sinc.avanti ?? 0, base: base ?? 'main', ramoPredefinito: 'main', basi: ['main', 'rilascio'], baseTrovata: true, commit: 2, commitOltre: false, titolo: 'lavoro/f6', testo: '- **primo**\n- **secondo**\n' });
  return g;
}

async function preparaPagina(page, { larghezza = 1440, altezza = 900, tema = 'dark', g = mondo(), orologio = false } = {}) {
  const contatore = { nonGet: 0 };
  if (orologio) await page.clock.install();
  await page.setViewportSize({ width: larghezza, height: altezza });
  await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
  await page.addInitScript(({ colorMode }) => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } }));
    window.__aperti = [];
    window.open = (url) => { window.__aperti.push(String(url)); return null; };
  }, { colorMode: tema });
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    if (p.endsWith(`/sessions/${SESSIONE}/events`)) return route.fulfill({ contentType: 'text/event-stream', body: CONFINE });
    if (p.startsWith('/api/v1/github/')) {
      const azione = p.split('/').pop();
      g.letture.push(`${req.method()} ${azione}`);
      if (g.risposte[azione]?.length) return route.fulfill(g.risposte[azione].shift());
      if (azione === 'status') return route.fulfill(busta(g.stato));
      if (azione === 'install') { /* il gh portatile usa l'accesso già nel portachiavi (misurato il 27/09) */ g.stato = { ...g.stato, gh: { trovato: true, origine: 'talos', versione: '2.101.0', sistemaTroppoVecchio: null }, accesso: { collegato: true, account: 'io', ambiti: ['repo'] } }; return route.fulfill(busta({ ok: true, gh: g.stato.gh })); }
      if (azione === 'login') { g.stato = { ...g.stato, collegamento: { stato: 'in-attesa', codice: 'AB12-CD34', indirizzo: 'https://github.com/login/device', errore: null } }; return route.fulfill(busta({ ok: true, ...g.stato.collegamento })); }
      if (azione === 'login-cancel') { g.stato = { ...g.stato, collegamento: { stato: 'annullato', codice: null, indirizzo: null, errore: null } }; return route.fulfill(busta({ ok: true, fermato: true })); }
    }
    if (p.startsWith(`/api/v1/sessions/${SESSIONE}/github/`)) {
      const coda = p.slice(`/api/v1/sessions/${SESSIONE}/github/`.length);
      g.letture.push(`${req.method()} ${coda}${url.search}`);
      if (g.risposte[coda]?.length) return route.fulfill(g.risposte[coda].shift());
      if (req.method() === 'GET' && coda === 'pulls') return route.fulfill(busta(g.pulls()));
      if (req.method() === 'GET' && coda === 'pull-draft') return route.fulfill(busta(g.bozza(url.searchParams.get('base'))));
      if (req.method() === 'GET' && /^pulls\/\d+\/checks$/u.test(coda)) return route.fulfill(busta({ numero: g.prDelRamo.numero, stato: 'open', controlli: g.controlliDopo ?? g.prDelRamo.controlli }));
      if (req.method() === 'POST' && coda === 'pulls') {
        const corpo = JSON.parse(req.postData() || '{}');
        g.corpi.push({ azione: 'crea', corpo });
        g.prDelRamo = pr(42, { titolo: corpo.titolo, ramo: g.sinc.ramo, bozza: corpo.bozza === true, controlli: { voci: [], conteggi: { passati: 0, falliti: 0, inCorso: 0, saltati: 0, annullati: 0 }, totale: 0 } });
        return route.fulfill(busta({ ok: true, url: g.prDelRamo.url, numero: 42, repo: 'esempio/progetto', base: corpo.base, ramo: g.sinc.ramo, bozza: corpo.bozza === true }));
      }
    }
    if (p.startsWith(`/api/v1/sessions/${SESSIONE}/git/`)) {
      const azione = p.split('/').pop();
      if (req.method() === 'GET') {
        if (azione === 'status') return route.fulfill(busta({ radiceRepo: 'C:/progetto', prefisso: '', cartellaEradiceRepo: true, voci: [], riepilogo: { totale: 0, staged: 0, nonStaged: 0, nonTracciati: 0, conflitti: 0 }, base: { commit: 'abc1234def5678', breve: 'abc1234', soggetto: 'Primo commit' }, impronta: 'i1', preparatiFuori: 0 }));
        if (azione === 'branch') return route.fulfill(busta({ ramo: g.sinc.ramo, staccata: false }));
        if (azione === 'stashes') return route.fulfill(busta({ accantonati: [] }));
        if (azione === 'sync') return route.fulfill(busta(g.sinc));
      }
      if (req.method() === 'POST' && azione === 'push') {
        const corpo = JSON.parse(req.postData() || '{}');
        g.corpi.push({ azione: 'push', corpo });
        const remoto = corpo.remoto ?? g.sinc.riferimento?.remoto;
        const pubblicato = !g.sinc.riferimento;
        g.sinc = { ...g.sinc, avanti: 0, riferimento: { corto: `${remoto}/${g.sinc.ramo}`, remoto, ramo: g.sinc.ramo } };
        return route.fulfill(busta({ ok: true, remoto, ramo: g.sinc.ramo, pubblicato, esiti: [], sincronizzazione: g.sinc }));
      }
    }
    if (req.method() !== 'GET') { contatore.nonGet += 1; return route.abort(); }
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate((id) => window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'GitHub', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' }), SESSIONE);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  await page.evaluate(() => { if (document.querySelector('#app')?.classList.contains('inspector-collapsed')) document.querySelector('[data-azione="dettagli"]')?.click(); });
  const inVista = await page.locator('#railTabs').evaluate((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.left < window.innerWidth; }).catch(() => false);
  if (!inVista) await page.locator('.talos-screen:not([hidden]) [data-azione="dettagli"]').first().click();
  await page.locator('#railTabs [data-rail="github"]').click();
  await expect(page.locator('#railGithub .talos-github__testa')).toBeVisible();
  return { contatore, g };
}

const gruppo = (page) => page.locator('#railGithub .talos-github-gruppo[data-gruppo="pr"]');
const apriGruppo = (page) => gruppo(page).locator('.talos-github-gruppo__titolo').click();
const aperti = (page) => page.evaluate(() => window.__aperti.slice());

for (const [larghezza, altezza] of [[1440, 900], [1024, 800]]) {
  for (const tema of ['dark', 'light']) {
    test(`GITHUB-PR-01 — chiuso non chiama GitHub; aperto: la PR del ramo coi controlli in cifre, le aperte con le mie in testa (${larghezza} ${tema})`, async ({ page }) => {
      const { g, contatore } = await preparaPagina(page, { larghezza, altezza, tema });
      await expect(gruppo(page)).toBeVisible();
      await expect(gruppo(page).locator('.talos-github-gruppo__titolo')).toHaveAttribute('aria-expanded', 'false');
      expect(g.letture, 'chiuso: nessuna chiamata a GitHub').toEqual([]);
      await apriGruppo(page);
      const ramo = gruppo(page).locator('.talos-github-riga--pr');
      await expect(ramo).toContainText('#21 Aggiunge la scheda PR');
      await expect(ramo).toContainText('Aperta');
      const esiti = ramo.locator('.talos-github-pr__esito');
      expect(await esiti.evaluateAll((n) => n.map((e) => `${e.dataset.esito}:${e.textContent}`))).toEqual(['fallito:1', 'in-corso:1', 'annullato:1', 'passato:1', 'saltato:1']);
      await expect(ramo.locator('.talos-github-pr__esiti')).toHaveAttribute('aria-label', '1 fallito, 1 in corso, 1 annullato, 1 passato, 1 saltato');
      // ⛔ foto del 27/09: l'ultimo esito era tagliato dal pulsante «Apri» invisibile. Ogni esito si VEDE: al suo centro c'è lui, ed è dentro la riga
      for (const stato of ['a riposo', 'col puntatore sopra']) {
        if (stato === 'col puntatore sopra') await ramo.hover();
        /* ⛔ il taglio lo fa un ANTENATO che ritaglia (`overflow` non visibile), non la riga: l'esito deve stare per intero dentro
           ognuno di loro fino alla riga, e il suo centro deve essere lui (mutazione F1b, 27/09: col solo bordo della riga la prova
           non vedeva l'esito mezzo tagliato) */
        const nascosti = await ramo.evaluate((r) => [...r.querySelectorAll('.talos-github-pr__esito')].filter((e) => {
          const b = e.getBoundingClientRect();
          if (b.width === 0) return true;
          for (let a = e.parentElement; a && a !== r.parentElement; a = a.parentElement) {
            const s = getComputedStyle(a);
            if (s.overflowX === 'visible' && a !== r) continue;
            const c = a.getBoundingClientRect();
            if (b.left < c.left - 0.5 || b.right > c.right + 0.5) return true;
          }
          const sopra = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
          return !(sopra && e.contains(sopra));
        }).map((e) => e.dataset.esito));
        expect(nascosti, stato).toEqual([]);
      }
      await page.mouse.move(0, 0);
      // le aperte del progetto, senza ripetere quella del ramo: la mia (#9) prima
      expect(await gruppo(page).locator('.talos-github-pr__aperte .talos-github-riga').evaluateAll((n) => n.map((r) => r.dataset.numero))).toEqual(['9', '3']);
      await expect(gruppo(page).locator('.talos-github-pr__aperte [data-numero="9"]')).toContainText('ramo-9 → main · tua · bozza');
      await expect(gruppo(page).locator('.talos-github-gruppo__conto')).toHaveText('3');
      // i controlli si aprono sotto, ognuno con la sua icona e la sua parola
      await ramo.locator('.talos-github-riga__apri').click();
      const controlli = gruppo(page).locator('.talos-github-riga--controllo');
      await expect(controlli).toHaveCount(5);
      expect(await controlli.evaluateAll((n) => n.map((r) => `${r.dataset.esito}|${r.querySelector('use')?.getAttribute('href')}|${r.querySelector('.talos-github-riga__cartella')?.textContent}`))).toEqual([
        'fallito|#i-x|fallito · cli', 'in-corso|#i-clock|in corso · desktop', 'annullato|#i-stop|annullato · nightly', 'passato|#i-check|passato · ci', 'saltato|#i-minus|saltato · release',
      ]);
      const scorre = await page.locator('#railGithub').evaluate((n) => n.scrollWidth > n.clientWidth + 1);
      expect(scorre, 'nessuno scorrimento laterale nella colonna').toBe(false);
      await gruppo(page).screenshot({ path: `artifacts/scheda-github-pr-${larghezza}-${tema}.png` });
      expect(g.letture).toEqual(['GET status', 'GET pulls']);
      expect(contatore.nonGet).toBe(0);
    });
  }
}

test('GITHUB-PR-02 — «Apri» va nel browser del sistema: la PR, un controllo col suo link; un controllo senza link non si apre', async ({ page }) => {
  await preparaPagina(page);
  await apriGruppo(page);
  const ramo = gruppo(page).locator('.talos-github-riga--pr');
  await ramo.hover();
  await ramo.getByRole('button', { name: 'Apri su GitHub' }).click();
  await ramo.locator('.talos-github-riga__apri').click();
  await gruppo(page).locator('.talos-github-riga--controllo[data-esito="fallito"] .talos-github-riga__apri').click();
  await expect(gruppo(page).locator('.talos-github-riga--controllo[data-esito="saltato"] .talos-github-riga__apri')).toBeDisabled();
  await gruppo(page).locator('.talos-github-pr__aperte [data-numero="3"] .talos-github-riga__apri').click();
  expect(await aperti(page)).toEqual(['https://github.com/esempio/progetto/pull/21', 'https://github.com/esempio/progetto/actions/runs/1', 'https://github.com/esempio/progetto/pull/3']);
});

test('GITHUB-PR-03 — GitHub CLI assente: la carta lo dice e «Scarica GitHub CLI» la installa, poi arrivano le PR', async ({ page }) => {
  const g = mondo();
  g.stato = { ...g.stato, gh: { trovato: false, sistemaTroppoVecchio: null }, accesso: { collegato: false, account: null, ambiti: [] } };
  const { contatore } = await preparaPagina(page, { g });
  await apriGruppo(page);
  const carta = gruppo(page).locator('.talos-github-pr__stato');
  await expect(carta).toContainText('GitHub CLI non c’è');
  await expect(carta).toContainText('versione ufficiale 2.101.0');
  expect(g.letture).toEqual(['GET status'], 'senza gh nessuna PR si chiede');
  await carta.getByRole('button', { name: 'Scarica GitHub CLI' }).click();
  await expect(gruppo(page).locator('.talos-github-riga--pr')).toContainText('#21');
  expect(g.letture).toEqual(['GET status', 'POST install', 'GET status', 'GET pulls']);
  await expect(page.locator('#regioneToast')).toContainText('GitHub CLI pronta');
  expect(contatore.nonGet).toBe(0);
});

test('GITHUB-PR-04 — non collegato: «Collega GitHub» mostra il codice e apre la pagina di GitHub; finito il login arrivano le PR', async ({ page }) => {
  const g = mondo();
  g.stato = { ...g.stato, accesso: { collegato: false, account: null, ambiti: [] } };
  await preparaPagina(page, { g });
  await apriGruppo(page);
  await gruppo(page).getByRole('button', { name: 'Collega GitHub' }).click();
  const carta = gruppo(page).locator('.talos-github-pr__stato');
  await expect(carta.locator('.talos-github-pr__codice')).toHaveText('AB12-CD34');
  await expect(carta.getByRole('button', { name: 'Apri github.com' })).toBeFocused();
  await carta.getByRole('button', { name: 'Apri github.com' }).click();
  expect(await aperti(page)).toEqual(['https://github.com/login/device']);
  // la persona conferma su github.com: al giro dopo lo stato dice «collegato»
  g.stato = { ...g.stato, collegamento: { stato: 'collegato', codice: null, indirizzo: null, errore: null }, accesso: { collegato: true, account: 'io', ambiti: ['repo'] } };
  await expect(gruppo(page).locator('.talos-github-riga--pr')).toContainText('#21', { timeout: 10_000 });
  await expect(page.locator('#regioneToast')).toContainText('GitHub collegato');
});

test('GITHUB-PR-05 — al contrario: «Annulla» ferma il login e torna a «Collega GitHub»', async ({ page }) => {
  const g = mondo();
  g.stato = { ...g.stato, accesso: { collegato: false, account: null, ambiti: [] } };
  await preparaPagina(page, { g });
  await apriGruppo(page);
  await gruppo(page).getByRole('button', { name: 'Collega GitHub' }).click();
  await gruppo(page).locator('.talos-github-pr__stato').getByRole('button', { name: 'Annulla' }).click();
  await expect(gruppo(page).getByRole('button', { name: 'Collega GitHub' })).toBeVisible();
  expect(g.letture.filter((l) => l.startsWith('POST'))).toEqual(['POST login', 'POST login-cancel']);
});

test('GITHUB-PR-05b — il login lasciato a metà non si aspetta all\'infinito: dopo 17 minuti la scheda smette e torna a «Collega GitHub»', async ({ page }) => {
  const g = mondo();
  g.stato = { ...g.stato, accesso: { collegato: false, account: null, ambiti: [] } };
  await preparaPagina(page, { g, orologio: true });
  await apriGruppo(page);
  await gruppo(page).getByRole('button', { name: 'Collega GitHub' }).click();
  await expect(gruppo(page).locator('.talos-github-pr__codice')).toHaveText('AB12-CD34');
  await page.clock.runFor(5 * 60_000);
  const aMeta = g.letture.filter((l) => l === 'GET status').length;
  expect(aMeta, 'nei primi minuti chiede come va').toBeGreaterThan(5);
  await page.clock.runFor(13 * 60_000);
  await expect(page.locator('#regioneToast')).toContainText('Il codice è scaduto: ricomincia.');
  await expect(gruppo(page).getByRole('button', { name: 'Collega GitHub' })).toBeVisible();
  const dopo = g.letture.filter((l) => l === 'GET status').length;
  await page.clock.runFor(10 * 60_000);
  expect(g.letture.filter((l) => l === 'GET status').length, 'smesso: niente più domande').toBe(dopo);
});

test('GITHUB-PR-06 — nessuna PR: il modulo precompilato; ramo non pubblicato ⇒ PRIMA la conferma di Pubblica, POI la PR col corpo giusto', async ({ page }) => {
  const g = mondo();
  g.prDelRamo = null;
  g.sinc = { ...g.sinc, riferimento: null, avanti: null };
  const { contatore } = await preparaPagina(page, { g });
  await apriGruppo(page);
  await expect(gruppo(page)).toContainText('Nessuna pull request per questo ramo.');
  await gruppo(page).getByRole('button', { name: 'Crea pull request' }).click();
  const modulo = gruppo(page).locator('.talos-github-pr__modulo');
  await expect(modulo.locator('.talos-github-pr__base')).toContainText('main');
  await expect(modulo.locator('[data-fuoco="pr-titolo"]')).toHaveValue('lavoro/f6');
  await expect(modulo.locator('[data-fuoco="pr-testo"]')).toHaveValue('- **primo**\n- **secondo**\n');
  await expect(modulo).toContainText('2 commit rispetto a main');
  await expect(modulo).toContainText('Il ramo non è ancora su GitHub: prima lo pubblichi, con conferma.');
  // foto sul 4174 (27/09): le frasi d'aiuto rientravano di 3 px — il testo parte dove partono il titolo e i campi
  const allineamento = await modulo.evaluate((m) => {
    const inizioTesto = (n) => { const r = document.createRange(); r.selectNodeContents(n); return Math.round(r.getBoundingClientRect().left); };
    return {
      titolo: inizioTesto(m.querySelector('.talos-github-richiesta__titolo')),
      campo: Math.round(m.querySelector('[data-fuoco="pr-titolo"]').getBoundingClientRect().left),
      aiuti: [...m.querySelectorAll('.talos-inspector__hint')].map(inizioTesto),
    };
  });
  for (const x of allineamento.aiuti) expect(Math.abs(x - allineamento.titolo), JSON.stringify(allineamento)).toBeLessThanOrEqual(1);
  expect(Math.abs(allineamento.campo - allineamento.titolo)).toBeLessThanOrEqual(1);
  await modulo.locator('[data-fuoco="pr-titolo"]').fill('Aggiunge le pull request');
  await modulo.locator('.talos-github-pr__bozza').click();
  await modulo.screenshot({ path: 'artifacts/scheda-github-pr-modulo-1440-dark.png' });
  await modulo.getByRole('button', { name: 'Crea pull request' }).click();
  const dialogo = page.getByRole('alertdialog');
  await expect(dialogo).toContainText('Pubblicare il ramo «lavoro/f6»?');
  await dialogo.getByRole('button', { name: 'Pubblica' }).click();
  await expect(page.locator('#regioneToast')).toContainText('Pull request creata');
  expect(g.corpi).toEqual([
    { azione: 'push', corpo: { remoto: 'origin' } },
    { azione: 'crea', corpo: { titolo: 'Aggiunge le pull request', testo: '- **primo**\n- **secondo**\n', base: 'main', bozza: true } },
  ]);
  await expect(gruppo(page).locator('.talos-github-riga--pr')).toContainText('#42 Aggiunge le pull request');
  expect(contatore.nonGet).toBe(0);
});

test('GITHUB-PR-07 — al contrario: rifiutata la conferma di Pubblica, NESSUNA PR parte e il modulo lo dice', async ({ page }) => {
  const g = mondo();
  g.prDelRamo = null;
  g.sinc = { ...g.sinc, riferimento: null, avanti: null };
  await preparaPagina(page, { g });
  await apriGruppo(page);
  await gruppo(page).getByRole('button', { name: 'Crea pull request' }).click();
  const modulo = gruppo(page).locator('.talos-github-pr__modulo');
  await expect(modulo.locator('[data-fuoco="pr-titolo"]')).toHaveValue('lavoro/f6');
  await modulo.getByRole('button', { name: 'Crea pull request' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Non ora' }).click();
  await expect(modulo.locator('.talos-github-richiesta__errore')).toHaveText('Il ramo non è ancora su GitHub: la pull request aspetta l’invio.');
  expect(g.corpi).toEqual([]);
});

test('GITHUB-PR-08 — la base si sceglie dal menu dei rami del remoto (la bozza si rilegge, il titolo scritto resta); Esc chiude; un titolo vuoto non parte', async ({ page }) => {
  const g = mondo();
  g.prDelRamo = null;
  await preparaPagina(page, { g });
  await apriGruppo(page);
  await gruppo(page).getByRole('button', { name: 'Crea pull request' }).click();
  const modulo = gruppo(page).locator('.talos-github-pr__modulo');
  const titolo = modulo.locator('[data-fuoco="pr-titolo"]');
  await expect(titolo).toHaveValue('lavoro/f6');
  await titolo.fill('Il mio titolo');
  await modulo.locator('.talos-github-pr__base').click();
  await page.getByRole('menuitem', { name: 'rilascio' }).click();
  await expect(modulo.locator('.talos-github-pr__base')).toContainText('rilascio');
  // ⛔ si aspetta la bozza NUOVA (mutazione F7, 27/09: guardato subito, il titolo era ancora quello del ridisegno di attesa)
  await expect(modulo).toContainText('2 commit rispetto a rilascio');
  await expect(titolo).toHaveValue('Il mio titolo');
  await expect(modulo.locator('[data-fuoco="pr-testo"]')).toHaveValue('- **primo**\n- **secondo**\n');
  expect(g.letture).toContain('GET pull-draft?base=rilascio');
  await titolo.fill('   ');
  await expect(modulo.getByRole('button', { name: 'Crea pull request' })).toBeDisabled();
  await titolo.press('Escape');
  await expect(modulo).toHaveCount(0);
  await expect(gruppo(page).getByRole('button', { name: 'Crea pull request' })).toBeFocused();
  expect(g.corpi).toEqual([]);
});

test('GITHUB-PR-09 — il rifiuto del server resta scritto nel modulo, coi suoi dati', async ({ page }) => {
  const g = mondo();
  g.prDelRamo = null;
  await preparaPagina(page, { g });
  await apriGruppo(page);
  await gruppo(page).getByRole('button', { name: 'Crea pull request' }).click();
  const modulo = gruppo(page).locator('.talos-github-pr__modulo');
  await expect(modulo.locator('[data-fuoco="pr-titolo"]')).toHaveValue('lavoro/f6');
  g.risposte.pulls = [bustaErrore(422, 'GH_BASE_UNKNOWN', 'Il ramo di base non c’è sul remoto')];
  await modulo.getByRole('button', { name: 'Crea pull request' }).click();
  await expect(modulo.locator('.talos-github-richiesta__errore')).toHaveText('Il ramo di base non c’è sul remoto');
  await expect(modulo.locator('[data-fuoco="pr-titolo"]')).toHaveValue('lavoro/f6');
});

test('GITHUB-PR-10 — i controlli in corso si rileggono da soli ogni 15 s, e a fine corsa un avviso; poi smettono', async ({ page }) => {
  const g = mondo();
  const { contatore } = await preparaPagina(page, { g, orologio: true });
  await apriGruppo(page);
  await expect(gruppo(page).locator('.talos-github-riga--pr')).toContainText('#21');
  g.controlliDopo = { ...CONTROLLI, voci: CONTROLLI.voci.map((v) => (v.stato === 'in-corso' ? { ...v, stato: 'passato' } : v)), conteggi: { passati: 2, falliti: 1, inCorso: 0, saltati: 1, annullati: 1 } };
  await page.clock.runFor(16_000);
  await expect(page.locator('#regioneToast')).toContainText('Controlli finiti');
  await expect(page.locator('#regioneToast')).toContainText('#21 · 1 fallito, 1 annullato, 2 passati, 1 saltato');
  await expect(gruppo(page).locator('.talos-github-pr__esito[data-esito="passato"]')).toHaveText('2');
  const letture = g.letture.filter((l) => l.includes('checks')).length;
  expect(letture).toBe(1);
  await page.clock.runFor(60_000);
  expect(g.letture.filter((l) => l.includes('checks')).length, 'finiti i controlli, niente più letture').toBe(letture);
  expect(contatore.nonGet).toBe(0);
});
