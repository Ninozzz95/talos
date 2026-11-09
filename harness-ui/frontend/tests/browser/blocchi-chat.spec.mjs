/*
 * FE-003, blocco 4: i blocchi nella chat vera. Gli eventi sono quelli del server, dati al gestore della pagina come fa la riga dei risultati
 * accorciati: testo a pezzi, recinto `talos-blocco`, fine del giro.
 */
import { expect, test } from '@playwright/test';

const ID = 'chat-blocchi';
const RECINTO = (corpo) => `Ecco:\n\n\`\`\`talos-blocco\n${corpo}\n\`\`\`\n\nDimmi tu.`;
const SCELTE = 'root = Scelte("prossimo", null, "Come vuoi procedere?", [{testo: "Continua"}, {testo: "Fermati qui"}])';
const TABELLA = 'root = Tabella("costi", "Costi", null, ["Voce", "Euro"], [["Uno", 2], ["Due", 1]])';

async function apri(page, { confine = true } = {}) {
  await page.route(`**/api/v1/sessions/${ID}/events*`, () => { /* resta pending */ });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.evaluate(([id, conFine]) => {
    const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione(id, 'workspace', 'Blocchi', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
    /* Il confine della rigiocata, come a13-carta-giri-in-tondo: senza, la colonna resta `is-restoring` (nascosta) perché gli eventi restano
       in sospeso, e ogni clic trova un pulsante «non visibile». */
    if (conFine) r.handleRealEvent(CONFINE, r.realSessionState.generation);
  }, [ID, confine]);
  if (confine) await page.waitForFunction(() => !document.querySelector('#conversation')?.classList.contains('is-restoring'), null, { timeout: 5_000 });
}
const manda = (page, eventi) => page.evaluate((lista) => {
  const r = window.__talosHarnessUiRuntime;
  for (const e of lista) r.handleRealEvent(e, r.realSessionState.generation);
}, eventi);
const pezzi = (testo, n) => { const fuori = []; for (let i = 0; i < testo.length; i += n) fuori.push(testo.slice(i, i + n)); return fuori; };
const giro = (testo, n = 12) => [
  { type: 'RunStarted', threadId: ID, runId: 'r1' },
  { type: 'TextMessageStart', messageId: 'm1', role: 'assistant' },
  ...pezzi(testo, n).map((delta) => ({ type: 'TextMessageContent', messageId: 'm1', delta })),
  { type: 'TextMessageEnd', messageId: 'm1' },
  { type: 'RunFinished', threadId: ID, runId: 'r1', outcome: { type: 'success' } },
];

test.use({ viewport: { width: 1280, height: 860 } });

test('BLOCCHI-CHAT-01 il recinto diventa un blocco, il testo intorno resta testo, nessun blocco di codice', async ({ page }) => {
  await apri(page);
  await manda(page, giro(RECINTO(SCELTE)));
  await expect(page.locator('#conversation .gu')).toHaveCount(1);
  await expect(page.locator('#conversation .gu button', { hasText: 'Continua' })).toBeEnabled();
  await expect(page.locator('#conversation .code-block')).toHaveCount(0);
  await expect(page.locator('#conversation')).toContainText('Dimmi tu.');
});

test('BLOCCHI-CHAT-02 mentre arriva il blocco è uno solo, e le scelte non si premono', async ({ page }) => {
  await apri(page);
  const testo = RECINTO(SCELTE);
  const meta = testo.indexOf('Continua');
  await manda(page, [{ type: 'RunStarted', threadId: ID, runId: 'r1' }, { type: 'TextMessageStart', messageId: 'm1', role: 'assistant' }, ...pezzi(testo.slice(0, meta), 9).map((delta) => ({ type: 'TextMessageContent', messageId: 'm1', delta }))]);
  await expect(page.locator('#conversation .gu')).toHaveCount(1);
  await page.locator('#conversation .gu').evaluate((n) => { n.dataset.stessoNodo = 'si'; });
  await expect(page.locator('#conversation .gu button', { hasText: 'Continua' })).toHaveCount(0);
  await manda(page, [...pezzi(testo.slice(meta), 9).map((delta) => ({ type: 'TextMessageContent', messageId: 'm1', delta })), { type: 'TextMessageEnd', messageId: 'm1' }, { type: 'RunFinished', threadId: ID, runId: 'r1', outcome: { type: 'success' } }]);
  await expect(page.locator('#conversation .gu')).toHaveCount(1);
  await expect(page.locator('#conversation .gu')).toHaveAttribute('data-stesso-nodo', 'si');
  await expect(page.locator('#conversation .gu button', { hasText: 'Continua' })).toBeEnabled();
});

test('BLOCCHI-CHAT-03 un clic è un messaggio della persona, con «dal blocco»; il secondo clic non fa niente', async ({ page }) => {
  await apri(page);
  const inviati = [];
  await page.route('**/api/v1/sessions/**', (r) => { if (r.request().method() === 'POST') { inviati.push(r.request().postData()); return r.fulfill({ json: { ok: true, data: {} } }); } return r.fallback(); });
  await manda(page, giro(RECINTO(SCELTE)));
  const scelta = page.locator('#conversation .gu button', { hasText: 'Continua' });
  await scelta.click();
  await scelta.click({ force: true }).catch(() => {});
  await expect(page.locator('#conversation .talos-message--user .message-bubble').last()).toHaveText('Continua');
  await expect(page.locator('#conversation .talos-message--user')).toHaveCount(1);
  expect(inviati.filter((c) => /Continua/u.test(c ?? '')).length).toBe(1);
});

test('BLOCCHI-CHAT-05 dopo una ricarica il blocco usato è spento, la scelta resta segnata e la nota c’è', async ({ page }) => {
  const SCELTE_COL_TITOLO = 'root = Scelte("prossimo", "Prossimo passo", "Come vuoi procedere?", [{testo: "Continua"}, {testo: "Fermati qui"}])';
  await apri(page);
  const corpi = [];
  await page.route('**/api/v1/sessions/**', (r) => { if (r.request().method() === 'POST') { corpi.push(r.request().postDataJSON()); return r.fulfill({ json: { ok: true, data: {} } }); } return r.fallback(); });
  await manda(page, giro(RECINTO(SCELTE_COL_TITOLO)));
  await page.locator('#conversation .gu button', { hasText: 'Continua' }).click();
  await expect.poll(() => corpi.find((c) => c?.bolla?.blocco)?.bolla ?? null).not.toBeNull();
  const bolla = corpi.find((c) => c?.bolla?.blocco).bolla;
  expect(bolla.testo).toBe('Continua');
  expect(bolla.blocco).toMatchObject({ idBlocco: 'prossimo', tipo: 'scelte', titolo: 'Prossimo passo' });
  expect(JSON.stringify(bolla.blocco)).not.toContain('Continua');

  /* la ricarica: la cronologia arriva come rigiocata, e il confine viene DOPO, come dal server */
  await apri(page, { confine: false });
  /* come dal server: il primo giro porta il messaggio della persona; senza, il seguito diventava il «primo messaggio» della rigiocata
     (appendRealTaskStart, /goal G6) e la scelta del blocco non arrivava mai al segno */
  const [primo, ...resto] = giro(RECINTO(SCELTE_COL_TITOLO));
  await manda(page, [
    { ...primo, input: { consegna: 'Proponi il prossimo passo' } },
    ...resto,
    { type: 'RunStarted', threadId: ID, runId: 'r2', input: { consegna: 'Continua', seguito: true, bolla } },
    { type: 'CUSTOM', name: 'talos.blocco.azione.v1', value: { idBlocco: 'prossimo', tipo: 'scelte', chiave: bolla.blocco.chiave } },
    { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null },
  ]);
  await page.waitForFunction(() => !document.querySelector('#conversation')?.classList.contains('is-restoring'), null, { timeout: 5_000 });
  await expect(page.locator('#conversation .gu button', { hasText: 'Continua' })).toBeDisabled();
  await expect(page.locator('#conversation .gu button', { hasText: 'Continua' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#conversation .talos-message--user').last()).toContainText('Prossimo passo');
});

test('BLOCCHI-CHAT-06 l’evento di un altro dispositivo spegne il blocco già a schermo', async ({ page }) => {
  await apri(page);
  let chiave = null;
  await page.route('**/api/v1/sessions/**', (r) => { if (r.request().method() === 'POST') { chiave = r.request().postDataJSON()?.bolla?.blocco?.chiave ?? chiave; return r.fulfill({ json: { ok: true, data: {} } }); } return r.fallback(); });
  await manda(page, giro(RECINTO(SCELTE)));
  await page.locator('#conversation .gu button', { hasText: 'Continua' }).click();
  await expect.poll(() => chiave).not.toBeNull();
  await apri(page);
  await manda(page, giro(RECINTO(SCELTE)));
  await expect(page.locator('#conversation .gu button', { hasText: 'Continua' })).toBeEnabled();
  await manda(page, [{ type: 'CUSTOM', name: 'talos.blocco.azione.v1', value: { idBlocco: 'prossimo', tipo: 'scelte', chiave } }]);
  await expect(page.locator('#conversation .gu button', { hasText: 'Continua' })).toBeDisabled();
});

test('BLOCCHI-CHAT-04 lo stile dei blocchi è caricato: la tabella ha il suo filtro e il guscio non è grezzo', async ({ page }) => {
  await apri(page);
  await manda(page, giro(RECINTO(TABELLA)));
  await expect(page.locator('#conversation .gu')).toHaveCount(1);
  const rete = await page.locator('#conversation .gu').evaluate((n) => getComputedStyle(n).display);
  expect(rete).not.toBe('inline');
  const larga = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  expect(larga).toBe(true);
});
