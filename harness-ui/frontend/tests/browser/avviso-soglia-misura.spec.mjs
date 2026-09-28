import { test, expect } from '@playwright/test';

/*
 * ⛔ Owner, 26/09/2026, con la foto: «avviso spunta anche dopo compattazione». Sotto «Conversazione riassunta» restava
 *   «Il contesto ha superato la soglia (378.705 su 200.000 token)».
 * Misurato sul journal vero (sessione `c15ba17c…`, gemini-3.8-flash): 378.705 è la SOMMA dei prompt delle 18 chiamate
 *   dell'ultimo giro (`/usage` è cumulativo dentro il giro, `app.js` CB-04); l'ultima chiamata ne aveva 52.947 — il 26%
 *   della soglia. L'avviso non doveva nemmeno comparire, e la colonna diceva «Conversazione 399,3k» (somma + risposte).
 * Claude Code (`apiUsage` dell'ultima risposta, claude.exe 2.1.283), Pi (`agent-session.ts:3858-3890`) e Hermes
 *   (`context_compressor.py:2740-2745`) misurano l'occupazione dall'ULTIMA risposta, e dopo una compattazione la
 *   dichiarano sconosciuta finché non ne arriva una nuova (Pi `:3865-3890`, Hermes `conversation_compression.py:3468`).
 * Scene rigiocate dal server finto (porta 4176): ogni richiesta non-GET si ferma e si conta.
 */
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const MODELLO = 'prova/modello-senza-catalogo'; // senza finestra nel catalogo la soglia è il tetto: 200.000
const consumo = (prompt, completion) => ({ type: 'CUSTOM', name: 'consumo-fornitore', value: { tipo: 'consumo-fornitore', provider: 'openrouter', model: MODELLO, usage: { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion }, esito: 'completato' } });
const usageGiro = (prompt, completion, giri) => ({ type: 'StateDelta', delta: [{ op: 'replace', path: '/usage', value: { prompt_tokens: prompt, completion_tokens: completion, cached_tokens: 0, giri } }] });
const risposta = (id, testo) => [
  { type: 'TextMessageStart', messageId: id, role: 'assistant' },
  { type: 'TextMessageContent', messageId: id, delta: testo },
  { type: 'TextMessageEnd', messageId: id },
];
const giro = (consegna, chiamate, testo, id) => [
  { type: 'RunStarted', threadId: 't', runId: `r-${id}`, input: { consegna } },
  ...chiamate.map(([p, c]) => consumo(p, c)),
  usageGiro(chiamate.reduce((a, [p]) => a + p, 0), chiamate.reduce((a, [, c]) => a + c, 0), chiamate.length),
  ...risposta(`m-${id}`, testo),
  { type: 'RunFinished', threadId: 't', runId: `r-${id}` },
];
const compattazione = (valore) => ({ type: 'CUSTOM', name: 'talos.compattazione', value: valore });
const FINE_MANUALE = { fase: 'fine', compattato: true, motivo: 'manuale', annullabile: false, at: '2026-09-26T12:00:00.000Z', tokenPrima: 186_000, tokenDopo: 12_000 };

const numera = (eventi) => eventi.map((e, i) => ({ ...e, _sequenza: i + 1 }));
const SCENE = {
  /* Il caso dell'owner: 18 chiamate che sommano 378.705, l'ultima da 52.947. */
  somma: numera(giro('ciao', [...Array.from({ length: 17 }, (_, i) => [10_000 + i * 1_280, 1_100]), [52_947, 647]], 'Fatto il giro lungo.', 1)),
  /* Sopra l'80%: l'ultima chiamata è 185.000 + 1.000. Poi la compattazione manuale riuscita. */
  compattata: numera([...giro('ciao', [[120_000, 500], [185_000, 1_000]], 'Fatto il giro pieno.', 1), compattazione(FINE_MANUALE)]),
  /* Come sopra, poi un giro nuovo la cui chiamata RIMISURA: 170.000 + 1.000 ⇒ l'avviso torna, col numero nuovo. */
  rimisurata: numera([...giro('ciao', [[185_000, 1_000]], 'Fatto il giro pieno.', 1), compattazione(FINE_MANUALE), ...giro('continua', [[170_000, 1_000]], 'Fatto il giro dopo.', 2)]),
  /* Una compattazione riuscita che non dice il «dopo»: la misura è sconosciuta, niente avviso. */
  senzaDopo: numera([...giro('ciao', [[185_000, 1_000]], 'Fatto il giro pieno.', 1), compattazione({ fase: 'fine', compattato: true, motivo: 'manuale', annullabile: false, at: '2026-09-26T12:00:00.000Z' })]),
};

async function apri(page, chiave, { tema = 'dark' } = {}) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
  await page.addInitScript((colorMode) => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } }));
  }, tema);
  const contatore = { nonGet: 0 };
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const m = new URL(req.url()).pathname.match(/\/api\/v1\/sessions\/as-(\w+)-[a-z0-9]+\/(events|metrics)$/);
    if (m) {
      if (m[2] === 'metrics') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { registrato: true, cacheSessione: null, ragionamentiMs: {} }, meta: { schema: 'talos.harness-ui.api.v1' } }) });
      return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${[...SCENE[m[1]], CONFINE].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
    }
    if (req.method() !== 'GET') { contatore.nonGet += 1; return route.abort(); }
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate(({ id, modello }) => {
    window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Misura del contesto', modello, { conclusa: true, modello });
  }, { id: `as-${chiave}-a1`, modello: MODELLO });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 15_000 });
  await expect(page.locator('#conversation')).toContainText('Fatto il giro', { timeout: 10_000 });
  await page.waitForTimeout(600); // l'avviso si valuta dopo la rigiocata (lettura del catalogo compresa)
  return contatore;
}

const avviso = (page) => page.locator('#avvisoContesto');

test.describe('Avviso di soglia e colonna del contesto — la misura è l\'ultima chiamata', () => {
  test('CTX-NOTICE-LAST-CALL-01 — la somma del giro (378.705) non accende l\'avviso: l\'ultima chiamata è 52.947', async ({ page }) => {
    const c = await apri(page, 'somma');
    await expect(avviso(page)).toBeHidden();
    await page.locator('#railTabs [data-rail="contesto"]').click();
    const conversazione = page.locator('#railContesto .talos-kv__k').filter({ hasText: 'Conversazione' }).locator('..').locator('.talos-kv__v');
    await expect(conversazione).toContainText('53,6k');
    await expect(conversazione).not.toContainText('399');
    expect(c.nonGet).toBe(0);
  });

  test('CTX-NOTICE-AFTER-COMPACT-02 — dopo la compattazione l\'avviso non resta, e la riga dice «prima → dopo» senza un Annulla che non esiste', async ({ page }) => {
    const c = await apri(page, 'compattata');
    await expect(avviso(page)).toBeHidden();
    const riga = page.locator('#conversation [data-compattazione-riga]');
    await expect(riga).toHaveCount(1);
    await expect(riga).toContainText('186.000 → 12.000');
    await expect(riga.locator('[data-compattazione-menu]')).toHaveCount(0);
    expect(c.nonGet).toBe(0);
  });

  test('CTX-NOTICE-REMEASURE-03 — la chiamata dopo la compattazione RIMISURA: l\'avviso torna col numero nuovo', async ({ page }) => {
    const c = await apri(page, 'rimisurata');
    await expect(avviso(page)).toBeVisible();
    await expect(avviso(page)).toContainText('171.000');
    expect(c.nonGet).toBe(0);
  });

  test('CTX-NOTICE-UNKNOWN-04 — AL CONTRARIO: una compattazione senza «dopo» lascia la misura sconosciuta, non quella vecchia', async ({ page }) => {
    const c = await apri(page, 'senzaDopo');
    await expect(avviso(page)).toBeHidden();
    expect(c.nonGet).toBe(0);
  });
});
