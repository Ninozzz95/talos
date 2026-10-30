/*
 * QUANDO LA LETTURA DAL SERVER FALLISCE IL DIAGRAMMA DELLE DELEGHE LO DICE (14/10/2026).
 * La vista classica scriveva «Dati non aggiornati: …» e teneva l'ora dell'ultima lettura riuscita (era in RIPRESA-GRAFO-ERRORE,
 * RIPRESA-AGENTI-DISCENDENTI, RIPRESA-GRAFO-SESSIONE-VUOTA). Il diagramma nuovo teneva le schede (DELEGHE-DIAGRAMMA-25) ma non
 * diceva niente, e la testata segnava «Ultimo aggiornamento <adesso>» a ogni battito, anche col server giù.
 * Solo letture: ogni scrittura si ferma e si conta.
 */
import { expect, test } from '@playwright/test';
import { attendiFineStoria, flussoConConfine } from './aiuto-confine.mjs';
import { apri, at, eventoAgente, figlia, RADICE } from './aiuto-deleghe-diagramma.mjs';

const GUASTO = { status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { message: 'Banco temporaneamente offline' } }) };
const avvisoDi = (grafo) => grafo.locator('.talos-wfg__avviso');
const oraDi = (grafo) => grafo.locator('.talos-wfg__aggiornato-ora');

test('DELEGHE-FERMI-01 — il server non risponde: il diagramma lo dice, le schede restano, l’ora resta quella dell’ultima lettura riuscita (anche dopo un evento in diretta e un altro battito); quando torna, l’avviso sparisce e l’ora riparte', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const figli = [figlia('a', 10), figlia('b', 11)];
  const { grafo, scritture } = await apri(page, figli);
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  // AL CONTRARIO, la premessa: finché il server risponde nessun avviso, e l'ora c'è
  await expect(avvisoDi(grafo)).toBeHidden();
  await expect(oraDi(grafo)).toHaveAttribute('data-alle', /^\d{4}-\d\d-\d\dT/u);
  let rotto = true;
  await page.route(`**/api/v1/sessions/${RADICE}/children`, (r) => (rotto ? r.fulfill(GUASTO)
    : r.fulfill({ json: { ok: true, data: { figli: figli.map((a) => ({ ...a, conclusa: true, conclusaAlle: at(90), esitoDelega: 'concluso' })) } } })));
  await expect(avvisoDi(grafo)).toBeVisible({ timeout: 9000 }); // entro un battito
  await expect(avvisoDi(grafo)).toHaveText('Dati non aggiornati: Banco temporaneamente offline. Riprovo da solo.');
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  const ferma = await oraDi(grafo).getAttribute('data-alle');
  // un evento in diretta ridisegna, ma non è una lettura riuscita: l'avviso resta e l'ora non avanza
  await eventoAgente(page, { ...figli[0], attivita: { file: [], chiamate: 4, passi: [] } });
  await page.waitForTimeout(700);
  await expect(avvisoDi(grafo)).toBeVisible();
  expect(await oraDi(grafo).getAttribute('data-alle')).toBe(ferma);
  await page.waitForTimeout(5600); // un altro battito col server giù
  await expect(avvisoDi(grafo)).toBeVisible();
  expect(await oraDi(grafo).getAttribute('data-alle'), 'col server giù l’ora non segue l’orologio').toBe(ferma);
  // il server torna
  rotto = false;
  await expect(avvisoDi(grafo)).toBeHidden({ timeout: 9000 });
  await expect(grafo.locator('[data-sessione="a"]')).toHaveAttribute('data-stato', 'succeeded');
  expect(Date.parse(await oraDi(grafo).getAttribute('data-alle'))).toBeGreaterThan(Date.parse(ferma));
  expect(scritture).toEqual([]);
  expect(errori).toEqual([]);
});

test('DELEGHE-FERMI-02 — la stessa riga in inglese', async ({ page }) => {
  const { grafo } = await apri(page, [figlia('a', 10)], { lingua: 'en' });
  await expect(avvisoDi(grafo)).toBeHidden();
  await page.route(`**/api/v1/sessions/${RADICE}/children`, (r) => r.fulfill(GUASTO));
  await expect(avvisoDi(grafo)).toHaveText('Data not updated: Banco temporaneamente offline. Retrying on its own.', { timeout: 9000 });
});

test('DELEGHE-FERMI-03 — una conversazione di cui non si è MAI letto niente: il diagramma vuoto non dice soltanto «nessun agente», dice che i dati non sono aggiornati', async ({ page }) => {
  // era RIPRESA-GRAFO-SESSIONE-VUOTA della vista classica: il pannello dice «Dati non aggiornati», il diagramma pure
  const { grafo } = await apri(page, [figlia('a', 10)]);
  await expect(grafo.locator('[data-sessione]')).toHaveCount(1);
  await page.route('**/api/v1/sessions/dsd-mai-letta/children', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { message: 'Lettura non disponibile' } }) }));
  await page.route('**/api/v1/sessions/dsd-mai-letta/events*', flussoConConfine);
  await page.evaluate(() => { window.__talosHarnessUiRuntime.passaASessione('dsd-mai-letta', 'workspace', 'Conversazione mai letta'); });
  await attendiFineStoria(page);
  await expect(grafo).toHaveCount(0);
  await page.locator('#railTabs [data-rail="agenti"]').click();
  /* pannello v2 (29/10/2026): la riga di stato del pannello è quella del kit, «Non aggiornati: <motivo>» con «Riprova» accanto */
  await expect(page.locator('#railAgenti').getByRole('status')).toContainText('Non aggiornati: Lettura non disponibile');
  await page.locator('#railAgenti').getByRole('button', { name: /diagram/iu }).first().click();
  const vuoto = page.locator('#schermoChat > [data-c="GrafoAgenti"]');
  await expect(vuoto).toHaveAttribute('data-vuoto', 'true');
  await expect(vuoto.locator('[data-sessione]')).toHaveCount(0); // gli agenti dell'altra conversazione non si ereditano
  await expect(avvisoDi(vuoto)).toHaveText('Dati non aggiornati: Lettura non disponibile. Riprovo da solo.');
});

test('DELEGHE-FERMI-04 — col server giù l’ora non segue l’orologio NEMMENO per un istante: fra un evento in diretta e la rilettura che lo segue, la testata ridisegnata dice ancora l’ultima lettura riuscita', async ({ page }) => {
  const figli = [figlia('a', 10), figlia('b', 11)];
  const { grafo } = await apri(page, figli);
  await expect(oraDi(grafo)).toHaveAttribute('data-alle', /^\d{4}-\d\d-\d\dT/u); // la prima lettura è riuscita
  await page.route(`**/api/v1/sessions/${RADICE}/children`, (r) => r.fulfill(GUASTO));
  await expect(avvisoDi(grafo)).toHaveAttribute('data-motivo', 'dati-fermi', { timeout: 9000 }); // non il «Carico…» dell'apertura
  const ferma = await oraDi(grafo).getAttribute('data-alle');
  expect(ferma, 'la premessa: un’ora c’è').toMatch(/^\d{4}-/u);
  await page.waitForTimeout(1200); // l'ultima rilettura è lontana: la prossima parte appena arriva l'evento
  const vista = await page.evaluate(async ([radice, agente]) => {
    const rt = window.__talosHarnessUiRuntime;
    rt.handleRealEvent({ type: 'CUSTOM', name: 'talos.agenti', value: { version: 1, sessionId: radice, parentId: radice, childId: agente.sessionId, reason: 'updated', agent: agente } }, rt.realSessionState.generation);
    await new Promise((r) => requestAnimationFrame(r)); // il fotogramma dell'evento è arrivato al diagramma; la rilettura che lo segue non ancora
    const g = document.querySelector('#schermoChat > [data-c="GrafoAgenti"]');
    g.querySelector('button[aria-label="Cerca nel diagramma"]').click(); // un gesto della persona che ridisegna la testata
    return g.querySelector('.talos-wfg__aggiornato-ora').dataset.alle;
  }, [RADICE, { ...figli[0], padreId: RADICE, attivita: { file: [], chiamate: 9, passi: [] } }]);
  expect(vista, 'l’ora a schermo fra l’evento e la rilettura').toBe(ferma);
});

/* Cura T7 della terza passata: il motivo nasce nella app (`figliErrore`) e va anche nella riga di stato del PANNELLO Agenti. */
test('DELEGHE-FERMI-05 — il motivo di una lettura fallita arriva dal server: nella riga di stato del PANNELLO Agenti non porta caratteri che ingannano e resta corto, anche se è uno stack intero', async ({ page }) => {
  const { grafo } = await apri(page, [figlia('a', 10), figlia('b', 11)]);
  await expect(avvisoDi(grafo)).toBeHidden();
  const RLO = String.fromCodePoint(0x202E);
  const lungo = `Sessione ${RLO}gpj.exe non leggibile ${'at Oggetto.metodo (file:///C:/talos/harness-ui/src/session-registry.mjs:12030:17) '.repeat(60)}`;
  await page.route(`**/api/v1/sessions/${RADICE}/children`, (r) => r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { message: lungo } }) }));
  await expect(avvisoDi(grafo)).toHaveAttribute('data-motivo', 'dati-fermi', { timeout: 9000 });
  const riga = page.locator('#railAgenti [role="status"]').first();
  await expect(riga).toContainText('Sessione', { timeout: 9000 });
  const testo = await riga.evaluate((n) => n.textContent);
  expect([...testo].filter((c) => c.codePointAt(0) === 0x202E), 'nessuna inversione della scrittura nella riga del pannello').toEqual([]);
  expect(testo.length, `la riga del pannello resta corta: ${testo.length} caratteri`).toBeLessThanOrEqual(260);
  expect(testo, 'la premessa: è la riga del motivo, col suo inizio').toContain('gpj.exe non leggibile');
});
