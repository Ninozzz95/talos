/*
 * ⛔⛔ PO-30, fetta 1 (18/09/2026) — il campo «Cerca file…» della scheda File cerca in TUTTA la cartella della sessione.
 * La rotta è quella vera del prodotto (`GET …/tree/search?q=`); finta è solo la sua risposta, con la forma esatta che il
 * backend dà (provata in `tests/albero-cerca.test.mjs`). Si misura ciò che si VEDE, e ogni prova asserisce la sua premessa.
 */
import { expect, test } from '@playwright/test';

const ALBERO = { '': [{ nome: 'src', cartella: true }, { nome: 'README.md', cartella: false }], src: [{ nome: 'profondo', cartella: true }], 'src/profondo': [{ nome: 'bersaglio.mjs', cartella: false }] };

async function scena(page, { risposta, ritardoMs = 0 } = {}) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => { try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: 'dark', uiLanguage: 'it' } })); } catch { /* */ } });
  await page.route('**/api/v1/sessions/po30r-*/events*', (r) => r.fulfill({ contentType: 'text/event-stream', body: '' }));
  await page.route('**/api/v1/sessions/po30r-*/tree?*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { voci: ALBERO[new URL(r.request().url()).searchParams.get('percorso') || ''] ?? [] } }) }));
  const cercate = [];
  await page.route('**/api/v1/sessions/po30r-*/tree/search?*', async (r) => {
    const q = new URL(r.request().url()).searchParams.get('q');
    cercate.push(q);
    const dati = typeof risposta === 'function' ? risposta(q) : risposta;
    if (ritardoMs && q === 'be') await new Promise((x) => setTimeout(x, ritardoMs)); // la PRIMA ricerca risponde tardi apposta
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: dati }) });
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione('po30r-uno', 'workspace', 'PO30R', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    r.handleRealEvent({ type: 'RunStarted', _sequenza: 9101, input: { consegna: 'x' }, contesto: { cartella: 'C:\\progetti\\talos-prova', modello: 'glm-5.3-flash' } }, r.realSessionState.generation);
  });
  await page.locator('#railTabs [data-rail="file"]').click();
  await expect(page.locator('#alberoFile .ft-node').first(), 'la scena non si è formata: l’albero non è stato disegnato').toBeVisible({ timeout: 10_000 });
  return cercate;
}

const UNO = { risultati: [{ percorso: 'src/profondo/bersaglio.mjs', nome: 'bersaglio.mjs', cartella: false }, { percorso: 'src/profondo', nome: 'profondo', cartella: true }], troncato: false, motivo: null, saltate: ['node_modules'] };

test('PO30-CERCA-01 — trova un file in una cartella MAI aperta, dice che cosa non ha guardato, e un clic lo apre', async ({ page }) => {
  const cercate = await scena(page, { risposta: UNO });
  await expect(page.locator('#alberoFile .ft-row', { hasText: 'bersaglio.mjs' }), 'premessa: nell’albero quel file NON è a vista').toHaveCount(0);
  await page.locator('#fileTreeFilter').fill('bersaglio');
  const riga = page.locator('#fileRisultati [data-percorso="src/profondo/bersaglio.mjs"]');
  await expect(riga).toBeVisible();
  await expect(riga.locator('.talos-file-risultato__dove')).toHaveText('src/profondo');
  await expect(page.locator('#alberoFile')).toBeHidden();
  await expect(page.locator('#fileConteggio')).toHaveText('2 trovati');
  /* ⛔ `toContainText` legge anche un nodo NASCOSTO: con l'avviso spento questa prova restava verde (misurato rompendo la
     cura). Ciò che il server ha saltato o tagliato deve stare A SCHERMO, non solo nel DOM. */
  await expect(page.locator('#fileTreeFilterHint')).toBeVisible();
  await expect(page.locator('#fileTreeFilterHint')).toContainText('Non ho guardato dentro node_modules');
  expect(cercate.at(-1)).toBe('bersaglio');

  let aperto = null;
  await page.route('**/api/v1/sessions/po30r-*/tree/file?*', (r) => { aperto = new URL(r.request().url()).searchParams.get('percorso'); return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { contenuto: 'x', troncato: false } }) }); });
  await riga.click();
  await expect.poll(() => aperto).toBe('src/profondo/bersaglio.mjs');
});

test('PO30-CERCA-02 — svuotato il campo torna l’albero; una CARTELLA trovata si apre nell’albero e resta selezionata', async ({ page }) => {
  await scena(page, { risposta: UNO });
  await page.locator('#fileTreeFilter').fill('profondo');
  await page.locator('#fileRisultati [data-percorso="src/profondo"]').click();
  await expect(page.locator('#fileRisultati')).toBeHidden();
  await expect(page.locator('#alberoFile')).toBeVisible();
  await expect(page.locator('#fileTreeFilter')).toHaveValue('');
  await expect(page.locator('#alberoFile .ft-row', { hasText: 'bersaglio.mjs' }), 'la cartella trovata è stata APERTA: il suo file ora è a vista').toBeVisible();
  await expect(page.locator('#alberoFile .ft-row.ft-selected')).toContainText('profondo');
});

test('PO30-CERCA-03 — un elenco tagliato LO DICE; nessun risultato lo dice; una lettera sola non parte', async ({ page }) => {
  const cercate = await scena(page, { risposta: (q) => (q === 'zz' ? { risultati: [], troncato: false, motivo: null, saltate: [] } : { ...UNO, troncato: true, motivo: 'la cartella è molto grande' }) });
  await page.locator('#fileTreeFilter').fill('b');
  await page.waitForTimeout(400);
  expect(cercate, 'una lettera sola non interroga il server').toEqual([]);
  await page.locator('#fileTreeFilter').fill('be');
  await expect(page.locator('#fileTreeFilterHint')).toContainText('L\'elenco non è completo: la cartella è molto grande');
  await page.locator('#fileTreeFilter').fill('zz');
  await expect(page.locator('#fileTreeFilterHint')).toContainText('Nessun file con «zz»');
  await expect(page.locator('#fileRisultati [data-percorso]')).toHaveCount(0);
});

test('PO30-CERCA-04 — una risposta IN RITARDO non sovrascrive quella della ricerca più recente', async ({ page }) => {
  await scena(page, { ritardoMs: 1200, risposta: (q) => (q === 'be' ? { risultati: [{ percorso: 'VECCHIA.md', nome: 'VECCHIA.md', cartella: false }], troncato: false, motivo: null, saltate: [] } : UNO) });
  await page.locator('#fileTreeFilter').fill('be');
  await page.waitForTimeout(350); // la prima richiesta è partita, e risponderà fra 1,2 s
  await page.locator('#fileTreeFilter').fill('bersaglio');
  await expect(page.locator('#fileRisultati [data-percorso="src/profondo/bersaglio.mjs"]')).toBeVisible();
  await page.waitForTimeout(1500); // ora la vecchia risposta è arrivata
  await expect(page.locator('#fileRisultati [data-percorso="VECCHIA.md"]'), '⛔ la risposta vecchia ha sovrascritto la nuova').toHaveCount(0);
  await expect(page.locator('#fileRisultati [data-percorso="src/profondo/bersaglio.mjs"]')).toBeVisible();
});

/*
 * ⛔⛔ PO-30 (18/09/2026) — «CHI STA TOCCANDO QUESTO FILE». Il dato è quello vero di `GET …/children` (`attivita.file`,
 * provato nel backend in `tests/attivita-figlia.test.mjs`); qui si misura che la riga lo MOSTRI, che distingua chi è ancora al
 * lavoro da chi ha finito, e che il segno porti al dettaglio di QUELL'agente.
 */
test('PO30-AGENTI-01 — la riga dice chi sta toccando il file, e il segno apre il dettaglio di quell’agente', async ({ page }) => {
  await page.route('**/api/v1/sessions/po30r-uno/children', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { figli: [
    { sessionId: 'po30r-figlia-a', task: 'Compito: sistema il readme', taskCorto: 'sistema il readme', conclusa: false, interrotta: false, collisioni: [], attivita: { file: [{ percorso: 'README.md', letto: true, scritto: true, creato: false }], fileTagliati: 0, attrezzoCorrente: null, chiamate: 2 } },
    { sessionId: 'po30r-figlia-b', task: 'Compito: guarda src', taskCorto: 'guarda src', conclusa: true, interrotta: false, collisioni: [], attivita: { file: [{ percorso: 'src/profondo/bersaglio.mjs', letto: true, scritto: false, creato: false }], fileTagliati: 0, attrezzoCorrente: null, chiamate: 1 } },
  ] } }) }));
  await page.route('**/api/v1/sessions/po30r-figlia-*/events*', (r) => r.fulfill({ contentType: 'text/event-stream', body: '' }));
  await scena(page, { risposta: UNO });
  await page.evaluate(() => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent({ type: 'ToolCallStart', toolCallId: 'd1', toolCallName: 'delega_sottotask', _sequenza: 9200 }, r.realSessionState.generation); r.handleRealEvent({ type: 'ToolCallResult', toolCallId: 'd1', content: 'ok', _sequenza: 9201 }, r.realSessionState.generation); });

  const segno = page.locator('#alberoFile .ft-row', { hasText: 'README.md' }).locator('.talos-file-row__agente');
  await expect(segno, 'la scena non si è formata: le figlie non sono arrivate alla scheda File').toBeVisible({ timeout: 10_000 });
  await expect(segno).toHaveAttribute('aria-label', /Lo sta modificando: «sistema il readme»/);
  await expect(segno).toHaveClass(/is-al-lavoro/);
  await expect(page.locator('#alberoFile .ft-row', { hasText: 'src' }).first().locator('.talos-file-row__agente'), 'una CARTELLA non porta il segno').toHaveCount(0);

  await page.locator('#alberoFile .ft-row-folder', { hasText: 'src' }).click();
  await page.locator('#alberoFile .ft-row-folder', { hasText: 'profondo' }).click();
  const finito = page.locator('#alberoFile .ft-row', { hasText: 'bersaglio.mjs' }).locator('.talos-file-row__agente');
  await expect(finito).toHaveAttribute('aria-label', /Lo ha toccato: «guarda src»/);
  await expect(finito, 'chi ha FINITO non tiene acceso il segno').not.toHaveClass(/is-al-lavoro/);

  await segno.click();
  await expect(page.locator('#railTabs [data-rail="agenti"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-c="PannelloFiglia"] .talos-figlia'), 'il segno deve aprire il dettaglio dell’agente').toBeVisible();
});
