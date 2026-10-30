import { expect, test } from '@playwright/test';

/*
 * ⭐⭐⭐ BLOCCO 4 — LA RIGA DEI PROCESSI, MISURATA SULLA PAGINA VERA.
 *
 * ⛔ PERCHÉ QUESTA PROVA ESISTE, e la ragione è una bocciatura. Le tre asserzioni unitarie di
 *   `tests/unit/inspector-processi.test.mjs` girano su un DOM finto che **non ha foglio di stile**:
 *   il revisore avversario le ha superate con mutazioni **solo CSS** (`posto-nascosto`, testo del
 *   colore del fondo) — **zero rossi su 14**, e a schermo otto righe **VUOTE** alte 109 px.
 *   ⇒ Una prova che non carica il foglio non può vedere una regressione del foglio. Questa sì: qui
 *     si misura il RETTANGOLO DISEGNATO, non una proprietà di JavaScript.
 *
 * ⛔ E si misura la cosa che l'owner ha contestato dalla foto: le righe del comando occupavano
 *   quattro-sei righe ciascuna. Si pretende che una riga con la descrizione stia in UNA riga di
 *   testo, e che il comando NON sia disegnato finché non si apre il dettaglio.
 */

test.use({ locale: 'it-IT' });

async function apriProcessi(page) {
  /* ⛔ A4 (08/10/2026): il flusso degli eventi della sessione finta resta zitto e non si riconnette (come attesa-da-capo e
     a12-dialogo-agenti). Senza, ogni riconnessione rimetteva la pagina «in rigiocata» (`source.onopen`) e da lì la colonna si
     disegna una volta sola: un processo nuovo della scena non poteva comparire mai. */
  await page.route('**/api/v1/sessions/processi-descrizione/events*', (route) => route.fulfill({ contentType: 'text/event-stream', body: 'retry: 3600000\n\n' }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15000 });
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await expect(page.locator('#schermoChat')).toBeVisible();
  /* tre comandi: due con la descrizione del modello, uno senza. Il primo è LUNGO (un `for` su più
     righe), che è il caso della foto dell'owner. */
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione('processi-descrizione', 'workspace', 'Prove', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    const generation = runtime.realSessionState.generation;
    let seq = 90000;
    const evento = (e) => runtime.handleRealEvent({ ...e, _sequenza: seq += 1 }, generation);
    const comandoLungo = 'cd tasktest2 && for f in dati/test_dati_*.js dati/test_dati_extra.js calcoli/test_calcoli.js; do echo "== $f =="; node "$f"; done; echo "DEMO: node main.js"';
    const casi = [
      ['d1', comandoLungo, 'Esegue tutti i test e la demo del registro spese'],
      ['d2', 'git status --short', 'Controllo cosa ho modificato'],
      ['d3', 'ls -la', null],
      /* ⛔ Il caso dell'ESPANSA: un comando con SEI interruzioni di riga VERE. È quello su cui il
         revisore ha misurato il falso del commit `08a046c1` — 72 px (4 righe) invece di 126 (7) —
         perché `white-space:pre-wrap` non si applicava mai. Senza questa riga l'espansa non si
         potrebbe provare: un comando su una riga sola non distingue `pre-wrap` da `normal`. */
      ['d4', 'cd spese\nnode --test\nfor f in a b c; do\n  echo "$f"\ndone\necho fine\necho "== fatto =="', 'Rifà tutta la verifica del registro spese'],
    ];
    for (const [id, comando, descrizione] of casi) {
      evento({ type: 'ToolCallStart', toolCallId: id, toolCallName: 'shell', ricevutoA: 1000, giro: 1 });
      evento({ type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify(descrizione ? { comando, descrizione } : { comando }) });
      evento({ type: 'ToolCallResult', toolCallId: id, ricevutoA: 2000, errore: false, uscita: 0 });
    }
  });
  await page.locator('[data-rail="processi"]').click();
  /* pannello v2 (29/10/2026): questi comandi sono FINITI, e la scheda nasce sull'ambito «Accesi»: si guardano tutti */
  await page.locator('#railProcessi [data-controllo="ambito-tutti"]').click();
  await page.waitForTimeout(300);
}

/*
 * ⭐ PANNELLO v2 (owner 29/10/2026, kit approvato P-01): le prove di oggi sulla riga di un comando, portate alla riga v2. Gli stessi
 *   confini: la riga chiusa è UNA riga (la descrizione è il nome; il comando, quando c'è la descrizione, sta in un'etichetta di UNA
 *   riga che si tronca e non fa crescere la riga); senza descrizione il comando È il nome; l'inchiostro c'è davvero (catena di
 *   opacità, visibilità e colore, come la prova di oggi: «una misura che non può fallire non sta misurando»).
 */
const MISURA_V2 = () => [...document.querySelectorAll('#railProcessi .pn-riga')].map((r) => {
  const alto = (n) => (n && n.getClientRects().length ? Math.round(n.getBoundingClientRect().height) : 0);
  const inchiostro = (n) => {
    if (!n) return null;
    let opacita = 1; let visibile = true;
    for (let x = n; x; x = x.parentElement) { const c = getComputedStyle(x); const o = Number.parseFloat(c.opacity); opacita *= Number.isFinite(o) ? o : 1; if (c.visibility === 'hidden') visibile = false; }
    const s = getComputedStyle(n);
    const riempi = String(s.webkitTextFillColor || '').replace(/\s+/g, '');
    const colore = (riempi && riempi !== 'currentcolor' ? riempi : s.color).replace(/\s+/g, '');
    const m = colore.match(/rgba?\(([^)]+)\)/);
    const p = m ? m[1].split(',').map(Number) : [];
    return { opacita, visibile, alfa: p.length > 3 ? p[3] : 1 };
  };
  const nome = r.querySelector('.pn-nome > .pn-tronca');
  const codice = r.querySelector(':scope > .pn-mezzo .pn-sotto .pn-code');
  return { nome: nome?.textContent ?? '', mono: r.querySelector('.pn-nome')?.classList.contains('pn-nome--file'), altezzaRiga: alto(r), altezzaNome: alto(nome), altezzaCodice: alto(codice), codice: codice?.textContent ?? null, inchiostroNome: inchiostro(nome) };
});
const pretendiInchiostro = (i, chi) => {
  expect(i, `«${chi}»: il nodo non c’è`).not.toBeNull();
  expect(i.visibile, `«${chi}»: nascosto`).toBe(true);
  expect(i.opacita, `«${chi}»: spento`).toBeGreaterThan(0.5);
  expect(i.alfa, `«${chi}»: colore trasparente`).toBeGreaterThan(0.5);
};

for (const tema of ['dark', 'light']) {
  test(`PROCESSI-DESCRIZIONE (${tema}) — la riga chiusa è una riga: la descrizione è il nome, il comando su UNA riga che non la fa crescere`, async ({ page }) => {
    await page.addInitScript(({ colorMode }) => {
      if (window.top !== window) return;
      try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } })); }
      catch { /* finestra privata */ }
    }, { colorMode: tema });
    await apriProcessi(page);
    const m = await page.evaluate(MISURA_V2);
    console.log(`MISURA-PROCESSI-DESCRIZIONE ${tema} = ${JSON.stringify(m)}`);
    expect(m.length, 'la scena non si è formata: la scheda Processi non ha righe').toBeGreaterThanOrEqual(3);
    const conDescrizione = m.filter((r) => !r.mono);
    const senzaDescrizione = m.filter((r) => r.mono);
    expect(conDescrizione.length).toBeGreaterThanOrEqual(2);
    for (const r of conDescrizione) {
      expect(r.altezzaNome, `«${r.nome}»: il nome non si disegna`).toBeGreaterThan(0);
      expect(r.altezzaCodice, `«${r.nome}»: il comando non sta su UNA riga (${r.altezzaCodice} px)`).toBeLessThanOrEqual(24);
      pretendiInchiostro(r.inchiostroNome, r.nome);
    }
    const altezze = conDescrizione.map((r) => r.altezzaRiga);
    expect(Math.max(...altezze) - Math.min(...altezze), `il comando fa crescere la riga: ${JSON.stringify(altezze)}`).toBeLessThanOrEqual(12);
    expect(senzaDescrizione.length, 'nessuna riga senza descrizione: non si prova il secondo verso').toBeGreaterThanOrEqual(1);
    for (const r of senzaDescrizione) {
      expect(r.nome, 'senza descrizione il comando È il nome').toBe('ls -la');
      expect(r.codice, 'e non si ripete sotto').toBeNull();
      pretendiInchiostro(r.inchiostroNome, r.nome);
    }
  });
}

test("PROCESSI-ESPANSA — aperta, le etichette non sono tagliate e il comando conserva le sue righe (e si legge tutto)", async ({ page }) => {
  await apriProcessi(page);
  const riga = page.locator('#railProcessi .pn-riga', { hasText: 'Rifà tutta la verifica del registro spese' });
  await expect(riga, 'la riga del comando su più righe non c\'è: la scena non si è formata').toHaveCount(1);
  await riga.click();
  await expect(riga).toHaveAttribute('aria-expanded', 'true');
  const m = await riga.evaluate((r) => {
    const pre = r.querySelector('.pn-comando');
    const s = getComputedStyle(pre);
    const lh = Number.parseFloat(s.lineHeight) || Number.parseFloat(s.fontSize) * 1.35;
    return {
      whiteSpace: s.whiteSpace, righe: Math.round(pre.scrollHeight / lh), testo: pre.textContent,
      etichette: [...r.querySelectorAll('.pn-fatti dt')].map((e) => ({ testo: e.textContent, mostrato: e.clientWidth, richiesto: e.scrollWidth })),
    };
  });
  console.log(`MISURA-PROCESSI-ESPANSA ${JSON.stringify(m)}`);
  expect(m.whiteSpace).toBe('pre-wrap');
  expect(m.testo.split('\n')).toHaveLength(7);
  expect(m.righe, 'le sette righe del comando ci sono tutte (si legge scorrendo)').toBeGreaterThanOrEqual(7);
  for (const e of m.etichette) expect(e.richiesto, `etichetta «${e.testo}» tagliata`).toBeLessThanOrEqual(e.mostrato + 1);
});

test('PROCESSI-MOSTRA-MENO — un comando lunghissimo: la riga si apre e si richiude col clic e con Invio (aria-expanded), e aperta il comando si legge tutto', async ({ page }) => {
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15000 });
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione('processi-mostra-meno', 'workspace', 'Prove', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    const generation = runtime.realSessionState.generation;
    const comando = `node -e "const parti=['${Array.from({ length: 30 }, (_, i) => `segmento-${i}-del-percorso-molto-lungo`).join("','")}'];console.log(parti.length)"`;
    runtime.handleRealEvent({ type: 'ToolCallStart', toolCallId: 'mm1', toolCallName: 'shell', ricevutoA: 1000, giro: 1, _sequenza: 91001 }, generation);
    runtime.handleRealEvent({ type: 'ToolCallArgs', toolCallId: 'mm1', delta: JSON.stringify({ comando }), _sequenza: 91002 }, generation);
    runtime.handleRealEvent({ type: 'ToolCallResult', toolCallId: 'mm1', ricevutoA: 2000, errore: false, uscita: 0, _sequenza: 91003 }, generation);
  });
  await page.locator('[data-rail="processi"]').click();
  await page.locator('#railProcessi [data-controllo="ambito-tutti"]').click();
  const riga = page.locator('#railProcessi .pn-riga').first();
  await expect(riga, 'premessa: la riga c\'è').toBeVisible();
  expect(await riga.locator('.pn-nome .pn-tronca').evaluate((n) => n.scrollWidth > n.clientWidth), 'premessa: chiusa, il comando è tagliato').toBe(true);
  await expect(riga).toHaveAttribute('aria-expanded', 'false');
  await riga.click();
  await expect(riga).toHaveAttribute('aria-expanded', 'true');
  expect(await riga.locator('.pn-comando').textContent()).toContain('segmento-29-del-percorso-molto-lungo');
  await riga.focus();
  await page.keyboard.press('Enter');
  await expect(riga).toHaveAttribute('aria-expanded', 'false');
});

test('PROCESSI-A-MODELLO-FERMO — in una sessione conclusa, il comando della persona compare appena parte, ed è «In corso»', async ({ page }) => {
  await page.route('**/api/v1/sessions/processi-fermo/events*', (route) => route.fulfill({ contentType: 'text/event-stream', body: 'retry: 3600000\n\n' }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15000 });
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione('processi-fermo', 'workspace', 'Fermo', 'qwen/qwen3.8-flash', { conclusa: true, modello: 'qwen/qwen3.8-flash' });
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null, _sequenza: 1 }, r.realSessionState.generation);
  });
  await page.locator('[data-rail="processi"]').click();
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    const g = r.realSessionState.generation;
    r.handleRealEvent({ type: 'ComandoUtenteIniziato', comandoId: 'cmd-p1', comando: 'npm run dev', _sequenza: 2 }, g);
    r.handleRealEvent({ type: 'ToolCallStart', toolCallId: 'p1', toolCallName: 'shell', _sequenza: 3 }, g);
    r.handleRealEvent({ type: 'ToolCallArgs', toolCallId: 'p1', delta: JSON.stringify({ comando: 'npm run dev' }), _sequenza: 4 }, g);
  });
  const riga = page.locator('#railProcessi .pn-riga', { hasText: 'npm run dev' });
  await expect(riga, 'il comando che gira non è nei Processi').toHaveCount(1, { timeout: 1500 });
  await expect(riga).toHaveAttribute('data-stato', /in-corso|in-avvio/);
});
