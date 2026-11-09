import { test, expect } from '@playwright/test';
import { apriPiegaContesto, righeIndice } from '../fixtures/pannello-contesto-prove.mjs'; // pannello v2: le righe di oggi stanno in pieghe

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
  /* Come sopra, poi un giro nuovo la cui chiamata RIMISURA: prompt 170.000 (la risposta da 1.000 non conta, owner 09/10) ⇒ l'avviso torna, col numero nuovo. */
  rimisurata: numera([...giro('ciao', [[185_000, 1_000]], 'Fatto il giro pieno.', 1), compattazione(FINE_MANUALE), ...giro('continua', [[170_000, 1_000]], 'Fatto il giro dopo.', 2)]),
  /* Una compattazione riuscita che non dice il «dopo»: la misura è sconosciuta, niente avviso. */
  /* Owner 06/11/2026 14:20: the last call of the turn measured 196.482 (over the engine threshold 165.999 of DeepSeek V4.1 Flash). */
  oltre: numera(giro('ciao', [[120_000, 500], [196_482, 1_000]], 'Fatto il giro oltre la soglia.', 1)),
  /* Adversarial review 06/11 (REV-0/1/2): 216.482, between the engine threshold and its input limit (221.333). */
  oltreAncora: numera(giro('ciao', [[120_000, 500], [216_482, 1_000]], 'Fatto il giro oltre la soglia.', 1)),
  senzaDopo: numera([...giro('ciao', [[185_000, 1_000]], 'Fatto il giro pieno.', 1), compattazione({ fase: 'fine', compattato: true, motivo: 'manuale', annullabile: false, at: '2026-09-26T12:00:00.000Z' })]),
};

/*
 * Revisore avversario 06/11/2026 (punto 2): l'avviso c'è SOLO quando il motore della sessione dice che la persona ha spento la
 *   compattazione automatica (`compattaDaSola`, components/contesto-automatica.js). Il kernel legacy compatta da solo alla soglia
 *   (session-registry.mjs, `decidiCompattazione`), il motore acceso pure: owner 06/11 14:20 «deve essere gestita automaticamente».
 *   Le prove del clic su «Compatta ora» dell'avviso servono quindi il motore con `auto: false`.
 */
const SPENTA = { auto: false };
/* `rotte(req)`: una prova può rispondere lei a una richiesta (torna ciò che `route.fulfill` vuole), prima della guardia dei non-GET */
async function apri(page, chiave, { tema = 'dark', rotte = null } = {}) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
  await page.addInitScript((colorMode) => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } }));
  }, tema);
  const contatore = { nonGet: 0 };
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const sua = rotte ? await rotte(req) : null; // a route may answer late (the reload case of CTX-AUTO-NO-FLASH-18)
    if (sua) return route.fulfill(sua);
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
const json = (corpo, stato = 200) => ({ status: stato, contentType: 'application/json', body: JSON.stringify(corpo) });
const percorso = (req) => new URL(req.url()).pathname;

test.describe('Avviso di soglia e colonna del contesto — la misura è l\'ultima chiamata', () => {
  test('CTX-NOTICE-LAST-CALL-01 — la somma del giro (378.705) non accende l\'avviso: l\'ultima chiamata è 52.947', async ({ page }) => {
    const c = await apri(page, 'somma');
    await expect(avviso(page)).toBeHidden();
    await page.locator('#railTabs [data-rail="contesto"]').click();
    await apriPiegaContesto(page, 'dettagli-finestra');
    const conversazione = page.locator('#railContesto .talos-kv__k').filter({ hasText: 'Conversazione' }).locator('..').locator('.talos-kv__v');
    /* 09/10/2026, owner («B come hermes»): la colonna misura il SOLO prompt dell'ultima chiamata (52.947), la risposta (647) non si
       somma più — prima diceva «53,6k» mentre l'avviso leggeva il prompt: due numeri per lo stesso contesto. */
    await expect(conversazione).toContainText('52,9k');
    await expect(conversazione).not.toContainText('53,6k');
    await expect(conversazione).not.toContainText('399');
    expect(c.nonGet).toBe(0);
  });

  test('CTX-NOTICE-AFTER-COMPACT-02 — dopo la compattazione l\'avviso non resta, e la riga dice «prima → dopo» senza un Annulla che non esiste', async ({ page }) => {
    const c = await apri(page, 'compattata');
    await expect(avviso(page)).toBeHidden();
    const riga = page.locator('#conversation [data-compattazione-riga]');
    await expect(riga).toHaveCount(1);
    await expect(riga).toContainText('174.000 token risparmiati'); // 15/10/2026: la riga dice quanto si è risparmiato (186.000 − 12.000)
    await expect(riga.locator('[data-compattazione-menu]')).toHaveCount(0);
    expect(c.nonGet).toBe(0);
  });

  /* Revisore 06/11 (punto 2): prima senza motore (legacy); il legacy compatta da solo e non ha più l'avviso, quindi la rimisura si prova
     dove l'avviso esiste: motore con la compattazione automatica spenta. */
  test('CTX-NOTICE-REMEASURE-03 — la chiamata dopo la compattazione RIMISURA: l\'avviso torna col numero nuovo (automatica spenta)', async ({ page }) => {
    const c = await apri(page, 'rimisurata', { rotte: (req) => (percorso(req).endsWith('/context') && req.method() === 'GET' ? json({ sessionId: 'as-rimisurata-a1', revision: 7, settings: SPENTA, facts: [], jobs: [] }) : null) });
    await expect(avviso(page)).toBeVisible();
    await expect(avviso(page)).toContainText('170.000');
    expect(c.nonGet).toBe(0);
  });

  test('CTX-NOTICE-UNKNOWN-04 — AL CONTRARIO: una compattazione senza «dopo» lascia la misura sconosciuta, non quella vecchia', async ({ page }) => {
    const c = await apri(page, 'senzaDopo');
    await expect(avviso(page)).toBeHidden();
    expect(c.nonGet).toBe(0);
  });

  /*
   * ⛔ Owner 12/10/2026 sera: «se clicco su compatta ora non parte immediatamente, invece appare la modale e devo dare un'ulteriore
   *   conferma, comportamento sbagliato, la compattazione deve partire immediatamente». La modale usciva col motore del contesto
   *   attivo: `compactSession()` apriva la finestra, che ha la sua conferma in linea.
   */
  const finestraAperta = (page) => page.locator('#veloContesto:not([hidden])');

  test('CTX-NOTICE-COMPACT-NOW-05 — motore del contesto attivo: «Compatta ora» dell\'avviso manda SUBITO la richiesta, senza finestra né conferma', async ({ page }) => {
    const mandate = [];
    await apri(page, 'rimisurata', { rotte: (req) => {
      const p = percorso(req);
      if (p.endsWith('/context') && req.method() === 'GET') return json({ sessionId: 'as-rimisurata-a1', revision: 7, settings: SPENTA, facts: [], jobs: [] });
      if (p.endsWith('/context/jobs') && req.method() === 'POST') { mandate.push(JSON.parse(req.postData())); return json({ job: { id: 'j1', kind: 'compact', status: 'running' } }); }
      return null;
    } });
    await expect(avviso(page)).toBeVisible();
    await avviso(page).locator('[data-avviso-contesto="compatta"]').click();
    await expect.poll(() => mandate.length).toBe(1);
    expect(mandate[0].kind).toBe('compact');
    expect(mandate[0].expectedRevision).toBe(7);
    await expect(finestraAperta(page)).toHaveCount(0); // nessuna modale, nessuna seconda conferma
    await expect(page.locator('[data-context-conferma-legacy]')).toHaveCount(0);
  });

  /* Revisore 06/11 (punto 2): prima qui l'avviso del legacy mandava `/compact`. Il kernel legacy compatta da solo alla soglia: niente
     avviso e niente richiesta. «/compact» scritto resta la porta a mano del legacy (CTX-SLASH-COMPACT-09). */
  test('CTX-NOTICE-COMPACT-NOW-06 — motore spento (legacy): il kernel compatta da solo, nessun avviso e nessuna richiesta', async ({ page }) => {
    const c = await apri(page, 'rimisurata', { rotte: (req) => (percorso(req).endsWith('/context') && req.method() === 'GET' ? json({ error: { code: 'CTX_NOT_ENABLED', message: 'Context engine is not enabled.' } }, 404) : null) });
    await page.waitForTimeout(800);
    await expect(avviso(page)).toBeHidden();
    expect(c.nonGet).toBe(0);
  });

  /* ⛔ Owner 04/11/2026 16:28: «"Compact now" non deve aprire la modale Context Manager, anche se premuto manualmente». Prima un
     rifiuto apriva la finestra (vecchia CTX-NOTICE-COMPACT-NOW-07); ora il perché arriva come nota nella conversazione. */
  test('CTX-NOTICE-COMPACT-NOW-07 — AL CONTRARIO: se la richiesta non può partire, NIENTE finestra: una nota dice perché (mai un clic muto)', async ({ page }) => {
    await apri(page, 'rimisurata', { rotte: (req) => {
      const p = percorso(req);
      if (p.endsWith('/context') && req.method() === 'GET') return json({ sessionId: 'as-rimisurata-a1', revision: 7, settings: SPENTA, facts: [], jobs: [] });
      if (p.endsWith('/context/jobs') && req.method() === 'POST') return json({ error: { code: 'CTX_NOTHING_TO_COMPACT', message: 'Nothing to compact.' } }, 409);
      return null;
    } });
    await avviso(page).locator('[data-avviso-contesto="compatta"]').click();
    await expect(page.locator('#conversation')).toContainText('Ancora niente da compattare');
    await expect(finestraAperta(page)).toHaveCount(0);
  });

  /* Revisione V (R8, testi): un guasto vero dice che la conversazione resta intera e come riprovare, con le parole della finestra. */
  test('CTX-NOTICE-COMPACT-NOW-13 — guasto vero: la nota dice che la conversazione resta intera e di riprovare, senza finestra', async ({ page }) => {
    await apri(page, 'rimisurata', { rotte: (req) => {
      const p = percorso(req);
      if (p.endsWith('/context') && req.method() === 'GET') return json({ sessionId: 'as-rimisurata-a1', revision: 7, settings: SPENTA, facts: [], jobs: [] });
      if (p.endsWith('/context/jobs') && req.method() === 'POST') return json({ error: { code: 'CTX_COMPACTION_TIMEOUT', message: 'Summary timed out.' } }, 500);
      return null;
    } });
    await avviso(page).locator('[data-avviso-contesto="compatta"]').click();
    await expect(page.locator('#conversation')).toContainText('La conversazione resta intera.');
    await expect(page.locator('#conversation')).toContainText('Riprova con Compatta ora.');
    await expect(page.locator('#conversation')).not.toContainText('controllalo prima di riprovare');
    await expect(finestraAperta(page)).toHaveCount(0);
  });

  test('CTX-NOTICE-COMPACT-NOW-10 — revisione cambiata nel frattempo: si rilegge e si riprova UNA volta, sempre senza finestra', async ({ page }) => {
    const mandate = [];
    let revisione = 7;
    await apri(page, 'rimisurata', { rotte: (req) => {
      const p = percorso(req);
      if (p.endsWith('/context') && req.method() === 'GET') return json({ sessionId: 'as-rimisurata-a1', revision: revisione, settings: SPENTA, facts: [], jobs: [] });
      if (p.endsWith('/context/jobs') && req.method() === 'POST') {
        const corpo = JSON.parse(req.postData()); mandate.push(corpo);
        if (corpo.expectedRevision !== 8) { revisione = 8; return json({ error: { code: 'CTX_STALE_REVISION', message: 'Stale.' } }, 409); }
        return json({ job: { id: 'j1', kind: 'compact', status: 'running' } });
      }
      return null;
    } });
    await avviso(page).locator('[data-avviso-contesto="compatta"]').click();
    await expect.poll(() => mandate.length).toBe(2);
    expect(mandate.map((m) => m.expectedRevision)).toEqual([7, 8]);
    await expect(finestraAperta(page)).toHaveCount(0);
    await expect(page.locator('#conversation')).not.toContainText('Operazione non riuscita');
  });

  /* Revisione del blocco permessi (agente V, R8): un doppio clic mandava 2 richieste, e il rifiuto del motore al secondo (CTX_JOB_ACTIVE,
     sqlite-worker.mjs:169) scriveva «Operazione non riuscita» mentre il riassunto andava. Il secondo clic non manda niente. */
  test('CTX-NOTICE-COMPACT-NOW-11 — doppio clic su «Compatta ora»: una richiesta sola, nessuna nota d\'errore mentre il riassunto è in corso', async ({ page }) => {
    const mandate = [];
    await apri(page, 'rimisurata', { rotte: (req) => {
      const p = percorso(req);
      if (p.endsWith('/context') && req.method() === 'GET') return json({ sessionId: 'as-rimisurata-a1', revision: 7, settings: SPENTA, facts: [], jobs: [] });
      if (p.endsWith('/context/jobs') && req.method() === 'POST') {
        mandate.push(JSON.parse(req.postData()));
        if (mandate.length > 1) return json({ error: { code: 'CTX_JOB_ACTIVE', message: 'Another context job is active' } }, 409);
        return json({ job: { id: 'j1', kind: 'compact', status: 'running' } });
      }
      return null;
    } });
    const noteFinoA = await page.locator('#conversation .real-session-status').count();
    await avviso(page).locator('[data-avviso-contesto="compatta"]').dblclick();
    await page.waitForTimeout(1500);
    await expect(finestraAperta(page)).toHaveCount(0);
    expect(mandate.length, 'un doppio clic deve mandare UNA richiesta').toBe(1);
    await expect(page.locator('#conversation')).not.toContainText('Operazione non riuscita');
    await expect(page.locator('#conversation .real-session-status'), 'nessuna nota nuova, con qualunque frase').toHaveCount(noteFinoA);
  });

  /* Al contrario: un lavoro già attivo partito altrove (la finestra, un clic prima di una ricarica) torna come rifiuto CTX_JOB_ACTIVE:
     niente nota rossa, il riassunto c'è già. */
  test('CTX-NOTICE-COMPACT-NOW-12 — lavoro già attivo sul server (CTX_JOB_ACTIVE): nessuna nota d\'errore, nessuna finestra', async ({ page }) => {
    const mandate = [];
    await apri(page, 'rimisurata', { rotte: (req) => {
      const p = percorso(req);
      if (p.endsWith('/context') && req.method() === 'GET') return json({ sessionId: 'as-rimisurata-a1', revision: 7, settings: SPENTA, facts: [], jobs: [] });
      if (p.endsWith('/context/jobs') && req.method() === 'POST') { mandate.push(1); return json({ error: { code: 'CTX_JOB_ACTIVE', message: 'Another context job is active' } }, 409); }
      return null;
    } });
    const noteFinoA = await page.locator('#conversation .real-session-status').count();
    await avviso(page).locator('[data-avviso-contesto="compatta"]').click();
    await expect.poll(() => mandate.length).toBe(1);
    await page.waitForTimeout(500);
    await expect(finestraAperta(page)).toHaveCount(0);
    await expect(page.locator('#conversation')).not.toContainText('Operazione non riuscita');
    await expect(page.locator('#conversation .real-session-status'), 'nessuna nota nuova, con qualunque frase').toHaveCount(noteFinoA);
  });

  /* Al contrario del doppio clic: finito il primo tentativo il segno «in corso» si toglie, e un clic dopo manda di nuovo. */
  test('CTX-NOTICE-COMPACT-NOW-14 — finito un tentativo, il clic dopo manda di nuovo (il segno «in corso» non resta appeso)', async ({ page }) => {
    const mandate = [];
    await apri(page, 'rimisurata', { rotte: (req) => {
      const p = percorso(req);
      if (p.endsWith('/context') && req.method() === 'GET') return json({ sessionId: 'as-rimisurata-a1', revision: 7, settings: SPENTA, facts: [], jobs: [] });
      if (p.endsWith('/context/jobs') && req.method() === 'POST') { mandate.push(1); return json({ error: { code: 'CTX_NOTHING_TO_COMPACT', message: 'Nothing to compact.' } }, 409); }
      return null;
    } });
    await avviso(page).locator('[data-avviso-contesto="compatta"]').click();
    await expect.poll(() => mandate.length).toBe(1);
    await expect(page.locator('#conversation')).toContainText('Ancora niente da compattare');
    await expect(avviso(page).locator('[data-avviso-contesto="compatta"]')).toBeVisible();
    await avviso(page).locator('[data-avviso-contesto="compatta"]').click();
    await expect.poll(() => mandate.length, 'il secondo clic, a tentativo finito, deve mandare').toBe(2);
  });

  /*
   * ⛔ Owner 30/10/2026 notte («Fa subito il riassunto»): `/compact` scritto nel compositore partiva come TESTO al modello — misurato
   *   sulla 4177 (giro 32, gpt-6-luna: un «Contesto sintetico» in chat, nessun riassunto vero, niente spazio liberato). Ora parte dalla
   *   stessa porta di «Compatta ora» dell'avviso, come nella CLI e in Claude Code.
   */
  const scrivi = async (page, testo) => { await page.locator('#composerInput').fill(testo); await page.keyboard.press('Enter'); };

  test('CTX-SLASH-COMPACT-08 — «/compact» scritto, motore del contesto attivo: parte SUBITO il riassunto, e al modello non va niente', async ({ page }) => {
    const mandate = [];
    const c = await apri(page, 'rimisurata', { rotte: (req) => {
      const p = percorso(req);
      if (p.endsWith('/context') && req.method() === 'GET') return json({ sessionId: 'as-rimisurata-a1', revision: 7, settings: SPENTA, facts: [], jobs: [] });
      if (p.endsWith('/context/jobs') && req.method() === 'POST') { mandate.push(JSON.parse(req.postData())); return json({ job: { id: 'j1', kind: 'compact', status: 'running' } }); }
      return null;
    } });
    await scrivi(page, '/compact');
    await expect.poll(() => mandate.length).toBe(1);
    expect(mandate[0].kind).toBe('compact');
    await expect(finestraAperta(page)).toHaveCount(0); // niente seconda domanda
    expect(c.nonGet).toBe(0); // nessun messaggio partito verso il modello
    await expect(page.locator('#composerInput')).toHaveValue('');
  });

  test('CTX-SLASH-COMPACT-09 — «/compact» scritto, motore spento: la rotta di sempre, subito, e al modello non va niente', async ({ page }) => {
    const mandate = [];
    const c = await apri(page, 'rimisurata', { rotte: (req) => {
      const p = percorso(req);
      if (p.endsWith('/context') && req.method() === 'GET') return json({ error: { code: 'CTX_NOT_ENABLED', message: 'Context engine is not enabled.' } }, 404);
      if (p.endsWith('/compact') && req.method() === 'POST') { mandate.push(p); return json({ ok: true, data: { compattato: false } }); }
      return null;
    } });
    await scrivi(page, '/compact');
    await expect.poll(() => mandate.length).toBe(1);
    await expect(finestraAperta(page)).toHaveCount(0);
    expect(c.nonGet).toBe(0);
  });

  test('CTX-SLASH-COMPACT-10 — AL CONTRARIO: «/compact adesso» (con altre parole) resta un messaggio, e il riassunto non parte', async ({ page }) => {
    const mandate = [];
    const c = await apri(page, 'rimisurata', { rotte: (req) => {
      const p = percorso(req);
      if ((p.endsWith('/compact') || p.endsWith('/context/jobs')) && req.method() === 'POST') { mandate.push(p); return json({ ok: true, data: {} }); }
      return null;
    } });
    await scrivi(page, '/compact adesso');
    await expect.poll(() => c.nonGet).toBeGreaterThan(0); // il messaggio prova a partire (il server finto lo ferma)
    expect(mandate).toEqual([]);
  });

  /*
   * ⛔ Owner 06/11/2026 14:20, from the chat: «Il contesto ha superato la soglia (196.482 su 165.999 token).» — «this notice must not
   *   show any more: compaction is handled automatically unless the person wants to change something». With the engine and auto
   *   compaction on, past the threshold the summary has already started (`tests/auto-compatta-oltre-soglia.test.mjs`): no notice.
   *   The budget is the one `GET /context` returns for DeepSeek V4.1 Flash via OpenRouter (`budgetDellaMisura`).
   */
  const BUDGET_DEEPSEEK = { windowTokens: 266_667, responseReserve: 32_000, marginTokens: 13_334, inputLimit: 221_333, triggerTokens: 165_999, targetTokens: 121_733 };
  const statoMotore = (settings) => ({ sessionId: 'as-oltre-a1', revision: 9, settings, facts: [], jobs: [], budget: BUDGET_DEEPSEEK });

  test('CTX-AUTO-NO-NOTICE-15 — engine with auto compaction on (the default): 196.482 over 165.999 shows NO notice and no «Compact now»', async ({ page }) => {
    const letture = { contesto: 0 };
    const c = await apri(page, 'oltre', { rotte: (req) => {
      if (percorso(req).endsWith('/context') && req.method() === 'GET') { letture.contesto += 1; return json(statoMotore({})); }
      return null;
    } });
    await expect.poll(() => letture.contesto).toBeGreaterThan(0);
    await page.waitForTimeout(800); // the notice is re-evaluated when the engine state arrives
    await expect(avviso(page)).toBeHidden();
    await expect(page.locator('[data-avviso-contesto="compatta"]:visible')).toHaveCount(0);
    expect(c.nonGet).toBe(0);
  });

  test('CTX-AUTO-NO-NOTICE-16 — AL CONTRARIO: auto compaction turned off by the person ⇒ the notice stays, with the engine\'s numbers', async ({ page }) => {
    const c = await apri(page, 'oltre', { rotte: (req) => {
      if (percorso(req).endsWith('/context') && req.method() === 'GET') return json(statoMotore({ auto: false }));
      return null;
    } });
    await expect(avviso(page)).toBeVisible();
    await expect(avviso(page)).toContainText('Il contesto ha superato la soglia (196.482 su 165.999 token).');
    await expect(avviso(page).locator('[data-avviso-contesto="compatta"]')).toBeVisible();
    expect(c.nonGet).toBe(0);
  });
  /*
   * Adversarial review of the calm panel (06/11/2026, REV-0/1/2): with auto ON the notice flashed for ~2.4 s on reload or session
   *   switch while the engine snapshot was missing, and stayed up when GET /context failed. With no engine answer the notice shows
   *   NOTHING: the engine compacts by itself, the legacy kernel too (session-registry.mjs, decidiCompattazione). A sampler every
   *   20 ms counts every frame the notice was visible.
   */
  const conCampionatore = async (page) => page.addInitScript(() => {
    window.__visto = [];
    setInterval(() => { const a = document.querySelector('#avvisoContesto'); if (a && !a.hidden && a.offsetParent !== null) window.__visto.push(a.textContent.trim().slice(0, 120)); }, 20);
  });
  const visto = (page) => page.evaluate(() => window.__visto);

  test('CTX-AUTO-NO-FLASH-17 — engine answers at once, auto on, 216.482 over 165.999: the notice is never seen, not even for a frame', async ({ page }) => {
    await conCampionatore(page);
    await apri(page, 'oltreAncora', { rotte: (req) => (percorso(req).endsWith('/context') && req.method() === 'GET' ? json({ ...statoMotore({}), sessionId: 'as-oltreAncora-a1' }) : null) });
    await page.waitForTimeout(1500);
    expect(await visto(page)).toEqual([]);
  });

  test('CTX-AUTO-NO-FLASH-18 — engine answers 2,5 s late (a reload): the notice is never seen while waiting', async ({ page }) => {
    await conCampionatore(page);
    await apri(page, 'oltreAncora', { rotte: async (req) => {
      if (!(percorso(req).endsWith('/context') && req.method() === 'GET')) return null;
      await new Promise((r) => setTimeout(r, 2500));
      return json({ ...statoMotore({}), sessionId: 'as-oltreAncora-a1' });
    } });
    await page.waitForTimeout(3500);
    await expect(avviso(page)).toBeHidden();
    expect(await visto(page), 'the notice must never appear').toEqual([]);
  });

  test('CTX-AUTO-NO-FLASH-19 — GET /context fails (500): no notice, ever', async ({ page }) => {
    await conCampionatore(page);
    await apri(page, 'oltreAncora', { rotte: (req) => (percorso(req).endsWith('/context') && req.method() === 'GET' ? json({ ok: false, error: { code: 'INTERNAL' } }, 500) : null) });
    await page.waitForTimeout(3000);
    expect(await visto(page)).toEqual([]);
  });

  test('CTX-AUTO-NO-FLASH-20 — AL CONTRARIO: auto off, engine answers late: the notice comes once the engine says so', async ({ page }) => {
    await apri(page, 'oltreAncora', { rotte: async (req) => {
      if (!(percorso(req).endsWith('/context') && req.method() === 'GET')) return null;
      await new Promise((r) => setTimeout(r, 1500));
      return json({ ...statoMotore({ auto: false }), sessionId: 'as-oltreAncora-a1' });
    } });
    await expect(avviso(page)).toBeVisible({ timeout: 6000 });
    await expect(avviso(page)).toContainText('216.482 su 165.999');
  });

  /*
   * Adversarial review, round 2 (06/11/2026, R2-6 and A6). A failed automatic summary puts the engine in a pause
   *   (`context.compaction.cooling`, context-engine/src/engine.mjs:328). The scene is built when the journal is read: the retry time is
   *   relative to NOW. `pausa` is the chat id `as-pausa-a1`.
   */
  const ID_PAUSA = 'as-pausa-a1';
  const rottePausa = ({ code = 'CTX_COMPACTION_FAILED', fraMs, quando }) => (req) => {
    const p = percorso(req);
    if (p.endsWith('/context') && req.method() === 'GET') return json({ ...statoMotore({}), sessionId: ID_PAUSA });
    if (!p.endsWith(`/sessions/${ID_PAUSA}/events`)) return null;
    quando.retryAfter = Date.now() + fraMs;
    const cooling = { type: 'CUSTOM', name: 'talos.context', value: { schema: 'talos.context.event.v1', id: `cooling-j1-${ID_PAUSA}`, sessionId: ID_PAUSA, jobId: 'j1', kind: 'context.compaction.cooling', state: 'failed', createdAt: new Date().toISOString(), payload: { code, attempts: 1, waitSeconds: Math.round(fraMs / 1000), retryAfter: new Date(quando.retryAfter).toISOString() } } };
    const eventi = numera([...giro('ciao', [[120_000, 500], [216_482, 1_000]], 'Fatto il giro oltre la soglia.', 1), cooling]);
    return { contentType: 'text/event-stream', body: `retry: 3600000\n${[...eventi, CONFINE].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` };
  };

  test('CTX-AUTO-PAUSE-EXPIRES-21 — at rest, «Waiting to retry» leaves the Context card BY ITSELF at the retry time, with nothing else redrawing', async ({ page }) => {
    const quando = {};
    const c = await apri(page, 'pausa', { rotte: rottePausa({ fraMs: 9_000, quando }) });
    await page.locator('#railTabs [data-rail="contesto"]').click();
    const inPausa = page.locator('#railContesto [data-chiave="compatta-in-pausa"]');
    const calma = page.locator('#railContesto [data-chiave="compatta-da-sola"]');
    await expect(inPausa).toBeVisible({ timeout: 6000 });
    await expect(calma).toHaveCount(0);
    expect(Date.now(), 'the pause was seen before its retry time').toBeLessThan(quando.retryAfter);
    /* no resize, no click, no event: only the timer of the pause may redraw (before the cure the row stayed, R2-6) */
    await expect(inPausa).toHaveCount(0, { timeout: 14_000 });
    expect(Date.now(), 'AL CONTRARIO: never before the retry time').toBeGreaterThanOrEqual(quando.retryAfter);
    await expect(calma).toBeVisible();
    await expect(page.locator('#railContesto')).not.toContainText('Compattazione automatica non riuscita');
    expect(c.nonGet).toBe(0);
  });

  test('CTX-AUTO-PAUSE-CHOOSE-22 — the chat pause row «Choose another model» opens the summary model choice in Settings', async ({ page }) => {
    const quando = {};
    await apri(page, 'pausa', { rotte: rottePausa({ code: 'CTX_SUMMARY_REFUSED', fraMs: 120_000, quando }) });
    const scegli = page.locator('#conversation [data-context-choose]');
    await expect(scegli).toHaveCount(1);
    await expect(scegli).toHaveText('Scegli un altro modello');
    await expect(page.locator('#setting-tab-memoria')).not.toHaveAttribute('aria-selected', 'true');
    await scegli.click();
    await expect(page.locator('#setting-tab-memoria')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-settings-card="memoria-compattazione"]')).toBeVisible();
    /* reviewer 06/11, round 3: Memoria alone is not the effect; the summary MODEL choice opens (not the fallback, not nothing) */
    const ctrl = page.locator('[data-settings-card="memoria-compattazione"] .settings-field-control:has(#setting-modelloDelRiassunto) .calm-select');
    await expect(ctrl).toHaveAttribute('aria-expanded', 'true');
    /* reviewer 06/11, round 4 (B6): aria-expanded alone can be set with nothing open; the listbox it controls is really on screen */
    const lista = page.locator(`[id="${await ctrl.getAttribute('aria-controls')}"]`);
    await expect(lista).toHaveAttribute('role', 'listbox');
    await expect(lista).toBeVisible();
  });
});
