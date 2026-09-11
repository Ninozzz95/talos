# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: context-compactor.spec.mjs >> CTX-UI-DESKTOP-ROUNDTRIP pulsante, SQLite e replay della chat vera
- Location: tests\browser\context-compactor.spec.mjs:46:1

# Error details

```
Error: CTX-UI-USAGE-CLOSED-RELOAD

expect(locator).toContainText(expected) failed

Locator: locator('[data-runtime-usage]')
Expected substring: "2,0k"
Timeout: 5000ms
Error: element(s) not found

Call log:
  - CTX-UI-USAGE-CLOSED-RELOAD with timeout 5000ms
  - waiting for locator('[data-runtime-usage]')

```

```yaml
- navigation "Navigazione principale":
  - strong: TALOS
  - text: Codice
  - 'button "Notifiche: nessuna"':
    - img
  - button "Comprimi o espandi la barra laterale" [expanded]:
    - img
  - img
  - textbox "Cerca fra i titoli delle chat":
    - /placeholder: Cerca chat…
  - button "Nuova sessione":
    - img
  - button "Seleziona sessioni"
  - text: Luoghi
  - button "Capability 43":
    - img
    - text: Capability 43
  - button "Board 2":
    - img
    - text: Board 2
  - button "Libreria 0":
    - img
    - text: Libreria 0
  - button "Memoria 1":
    - img
    - text: Memoria 1
  - button "Attività 2":
    - img
    - text: Attività 2
  - button "Altro":
    - img
    - text: Altro
  - text: Sessioni 2
  - button "fixture conclusa · no-inference 2 g 1 giro"
  - button "fixture conclusa · no-inference 2 g 1 giro"
  - img
  - text: Workspace locale Tema Calm · fixture
  - button "Impostazioni (Ctrl ,)":
    - img
  - button "Ridimensiona la barra laterale"
- main:
  - button "fixture":
    - heading "fixture" [level=1]
    - img
  - tablist "Viste della sessione":
    - tab "Chat" [selected]
    - tab "Terminale"
    - tab "Review"
    - tab "Browser"
  - button "Albero dei rami":
    - img
  - button "Comandi (Ctrl K)":
    - img
  - button "Context Manager":
    - img
  - button "Mostra o nascondi i dettagli" [expanded]:
    - img
  - button "Riprendi":
    - img
  - navigation "Naviga la conversazione":
    - button "Vai al giro 1"
    - button "Vai al giro 2"
  - text: Tu Compito libero
  - paragraph: Quale database avevamo scelto?
  - text: TALOS no-inference
  - paragraph: Avevamo scelto SQLite, solo locale.
  - group "Azioni sulla risposta":
    - button "Copia la risposta":
      - img
    - button "Ascolta la risposta":
      - img
    - button "Chiedi di nuovo":
      - img
  - group "Contesto compattato":
    - text: Contesto compattato
    - button "Vedi contesto"
  - button "Ridimensiona il composer (doppio clic per la misura normale)"
  - textbox "Messaggio":
    - /placeholder: Scrivi… Invio indirizza il giro in corso, Ctrl+Invio accoda
  - button "Aggiungi contesto":
    - img
  - button "no-inference":
    - img
    - text: no-inference
  - button "Scrive nel progetto":
    - img
    - text: Scrive nel progetto
  - text: Giri 1
  - button "Terminale":
    - img
    - text: Terminale
  - button "Voce":
    - img
  - button "Invia":
    - img
- complementary "Dettagli della sessione":
  - button "Ridimensiona la colonna dei dettagli"
  - text: Sessione
  - heading "fixture" [level=2]
  - tablist "Sezioni della colonna":
    - tab "Contesto" [selected]
    - tab "File"
    - tab "Agenti"
    - tab "Processi"
  - tabpanel:
    - text: Ambiente
    - img
    - text: Ramo — Worktree — Non salvate — Repo annidati — Finestra del contesto 16,4k Conversazione 3,2k · 19,5% Libera 13,2k · 80,5% Indice dei giri 1 · Quale database avevamo scelto? tuo messaggio 2 · Avevamo scelto SQLite, solo loc… 0 attrezzi
    - button "Apri l'albero dei rami":
      - img
      - text: Apri l'albero dei rami
```

# Test source

```ts
  38  |   child.stdout.resume(); child.stderr.resume();
  39  |   await expect.poll(async () => { try { return (await fetch(`${base}/api/v1/health`, { headers: { Cookie: `talos_token=${token}` }, signal: AbortSignal.timeout(300) })).status; } catch { return 0; } }, { timeout: 20000 }).toBe(200);
  40  | });
  41  | test.afterAll(async () => {
  42  |   if (child && child.exitCode === null && child.signalCode === null) { const ended = new Promise(done => child.once('exit', done)); child.kill(); await ended; }
  43  |   if (directory && resolve(directory).startsWith(resolve(tmpdir()) + '\\') && directory.includes('tcec-ui-')) await rm(directory, { recursive: true, force: true });
  44  | });
  45  | 
  46  | test('CTX-UI-DESKTOP-ROUNDTRIP pulsante, SQLite e replay della chat vera', async ({ page, context }) => {
  47  |   await context.addCookies([{ name: 'talos_token', value: token, url: base, httpOnly: true, sameSite: 'Strict' }]);
  48  |   await page.addInitScript(() => localStorage.setItem('talos.harness.desktop.intro.v1', JSON.stringify({ esito: 'saltata' })));
  49  |   const inference = [];
  50  |   // Il percorso vietato e intercettato: la mutazione RED non deve fare inferenza.
  51  |   await page.route('**/api/v1/sessions/*/compact', route => route.fulfill({ json: { ok: true, compattato: false } }));
  52  |   page.on('request', request => { if (/\/compact$|\/context\/jobs$/.test(request.url()) && request.method() === 'POST') inference.push(request.url()); });
  53  |   await page.goto(base);
  54  |   await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  55  |   await page.evaluate(({ sessionId, model }) => window.__talosHarnessUiRuntime.passaASessione(sessionId, 'fixture', 'Decisione sul database', model, { conclusa: true, modello: model }), { sessionId, model });
  56  |   await page.locator('#compactSessionBtn').click();
  57  |   await expect(page.locator('#veloContesto')).toBeVisible();
  58  |   await expect(page.locator('#compactSessionBtn')).toHaveAccessibleName('Context Manager');
  59  |   await expect(page.locator('[data-context-title]')).toHaveText('Context Manager');
  60  |   await expect(page.locator('[data-context-auto]')).toBeChecked();
  61  |   await expect(page.locator('[data-context-start]')).toBeEnabled();
  62  |   expect(inference, 'aprire la modale non avvia inferenze').toEqual([]);
  63  |   const noOp = page.waitForResponse(response => response.url().endsWith('/context/jobs') && response.request().method() === 'POST');
  64  |   await page.locator('[data-context-start]').click();
  65  |   expect(await (await noOp).json()).toMatchObject({ error: { code: 'CTX_NOTHING_TO_COMPACT' } });
  66  |   await expect(page.locator('[data-context-status]')).toHaveAttribute('role', 'status');
  67  |   await expect(page.locator('[data-context-status]')).toContainText('ultimo scambio');
  68  |   const photos = resolve(harness, 'frontend/artifacts/context-compactor');
  69  |   await mkdir(photos, { recursive: true });
  70  |   for (const [width, height] of [[1920, 1080], [2560, 1440], [3840, 2160]]) {
  71  |     await page.setViewportSize({ width, height });
  72  |     await page.screenshot({ path: join(photos, `desktop-small-${width}x${height}.png`) });
  73  |   }
  74  |   await page.setViewportSize({ width: 1920, height: 1080 });
  75  |   await page.getByText('Da non dimenticare', { exact: true }).click();
  76  |   await page.locator('[data-context-fact-text]').fill('Il database deve restare locale.');
  77  |   await page.getByRole('button', { name: 'Salva fatto', exact: true }).click();
  78  |   await expect(page.locator('[data-context-facts]')).toContainText('Il database deve restare locale.');
  79  |   const store = createSqliteContextStore({ databasePath: join(directory, 'context/context.sqlite') });
  80  |   try {
  81  |     const snapshot = await store.readContextSnapshot({ sessionId });
  82  |     expect(snapshot.jobs).toEqual([]);
  83  |     expect(snapshot.activeVersion).toBeNull();
  84  |     expect(snapshot.facts[0].text).toBe('Il database deve restare locale.');
  85  |     const records = await store.readOriginals({ sessionId });
  86  |     /*
  87  |      * ⛔ 09/09 — la barra in chat ricava la stima del tempo residuo da `createdAt`: con una data
  88  |      * FISSA la fixture mostrerebbe un residuo assurdo («circa 90 minuti») o niente, a seconda
  89  |      * dell'ora in cui gira la prova. Un inizio relativo a ORA rende lo screenshot quello vero:
  90  |      * 1 segmento su 3 in 20 secondi ⇒ «circa 40 secondi rimanenti (stima)».
  91  |      * ⛔ Si cambia QUESTA costante e non i `createdAt` dei singoli oggetti: il worker tratta
  92  |      *   `createdAt` come immutabile fra i salvataggi dello stesso job, e rifiuta un `updatedAt`
  93  |      *   che va indietro — `job`, `activeJob` e il salvataggio finale devono condividerla.
  94  |      */
  95  |     const createdAt = new Date(Date.now() - 20_000).toISOString();
  96  |     const job = { schema: 'talos.context.job.v1', id: 'ui-fixture-job', sessionId, idempotencyKey: 'ui-fixture-job', requestFingerprint: 'fixture', kind: 'compact', state: 'ready', baseRevision: snapshot.revision, baseStateRevision: snapshot.stateRevision, coveredThrough: 2, model: { provider: 'openrouter', model }, createdAt, updatedAt: createdAt, completedSegments: [], progress: { completed: 1, total: 1, phase: 'ready' } };
  97  |     const activeJob = { ...job, state: 'summarizing', progress: { completed: 1, total: 3, phase: 'summarizing' } };
  98  |     // 09/09 — CTX-UI-MEASURE: la misura dell'ultima richiesta preparata (fixture dichiarata, non un
  99  |     //   conteggio reale) deve comparire nella modale con l'ORA della misura, al posto di «Non disponibile».
  100 |     await store.recordMeasurement({ sessionId, revision: snapshot.revision, measuredAt: '2026-09-09T08:05:00.000Z', measurement: { schema: 'talos.context.tokens.v1', inputTokens: 3200, windowTokens: 16384, responseReserve: 2048, method: 'runtime', exact: true, requestHash: 'ui-fixture-measure', provider: 'openrouter', model } });
  101 |     await store.claimContextJob({ sessionId, job: activeJob });
  102 |     await page.getByRole('button', { name: 'Aggiorna', exact: true }).click();
  103 |     await expect(page.locator('[data-context-progress]')).toContainText('1 di 3');
  104 |     await expect(page.locator('[data-context-measurement]'), 'CTX-UI-MEASURE').toContainText('misurata alle');
  105 |     await expect(page.locator('[data-context-measurement]')).not.toContainText('Non disponibile');
  106 |     await expect(page.locator('[data-context-input]')).not.toContainText('Non disponibile');
  107 |     for (const [width, height] of [[1920, 1080], [2560, 1440], [3840, 2160]]) {
  108 |       await page.setViewportSize({ width, height });
  109 |       await page.screenshot({ path: join(photos, `desktop-measure-${width}x${height}.png`) });
  110 |     }
  111 |     await page.setViewportSize({ width: 1920, height: 1080 });
  112 |     await page.keyboard.press('Escape');
  113 |     const chatProgress = page.locator('#conversation [data-context-chat-progress]');
  114 |     await expect(chatProgress).toBeVisible();
  115 |     await expect(chatProgress.locator('progress')).toHaveAttribute('max', '3');
  116 |     await store.saveJobProgress({ sessionId, job: { ...activeJob, progress: { ...activeJob.progress, completed: 2 } } });
  117 |     await expect(chatProgress.locator('progress')).toHaveAttribute('value', '2');
  118 |     await page.reload(); await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  119 |     await page.evaluate(({ sessionId, model }) => window.__talosHarnessUiRuntime.passaASessione(sessionId, 'fixture', 'Decisione sul database', model, { conclusa: true, modello: model }), { sessionId, model });
  120 |     await expect(page.locator('#veloContesto')).toBeHidden();
  121 |     await expect(chatProgress.locator('progress')).toHaveAttribute('value', '2');
  122 |     for (const [width, height] of [[1920, 1080], [2560, 1440], [3840, 2160]]) {
  123 |       await page.setViewportSize({ width, height });
  124 |       const bounds = await chatProgress.boundingBox();
  125 |       expect(bounds.width).toBeGreaterThan(200); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
  126 |       await page.screenshot({ path: join(photos, `desktop-progress-${width}x${height}.png`) });
  127 |     }
  128 |     await page.setViewportSize({ width: 1920, height: 1080 });
  129 |     await store.saveJobProgress({ sessionId, job: { ...job, progress: { completed: 3, total: 3, phase: 'ready' } } });
  130 |     const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  131 |     const version = { schema: 'talos.context.version.v1', id: 'ui-fixture-version', sessionId, coveredThrough: 2, sourceIds: records.map(r => r.id), sourceHash: hash(records.map(({ id, sha256 }) => ({ id, sha256 }))), summary: { schema: 'talos.context.summary.v1', text: 'SQLite locale.', goal: 'Riprendere', decisions: ['SQLite locale'], constraints: [], completed: [], pending: [], resources: [], sources: [{ recordId: records[1].id, quote: 'SQLite' }] }, activeMessages: [{ role: 'user', content: 'SQLite locale.' }], model: job.model, measurement: { schema: 'talos.context.tokens.v1', inputTokens: 10, windowTokens: 16384, responseReserve: 2048, method: 'heuristic', exact: false, requestHash: hash('fixture'), provider: 'openrouter', model }, createdAt };
  132 |     await store.recordUsage({ sessionId, jobId: job.id, operationId: 'ui-usage-fixture', usage: { prompt_tokens: 1800, completion_tokens: 80 } });
  133 |     await store.recordUsage({ sessionId, jobId: job.id, operationId: 'ui-usage-fixture', usage: { prompt_tokens: 1800, completion_tokens: 80 } });
  134 |     await store.commitContextVersion({ sessionId, expectedRevision: snapshot.revision, expectedStateRevision: snapshot.stateRevision, jobId: job.id, version });
  135 |   } finally { await store.close(); }
  136 |   await expect(page.locator('#conversation [data-context-chat-progress]')).toHaveCount(0);
  137 |   await expect(page.locator('#conversation [data-context-separator]')).toHaveCount(1);
> 138 |   await expect(page.locator('[data-runtime-usage]'), 'CTX-UI-USAGE-CLOSED-RELOAD').toContainText('2,0k');
      |                                                                                    ^ Error: CTX-UI-USAGE-CLOSED-RELOAD
  139 |   await expect(page.locator('[data-runtime-cache]')).toContainText('cache 40%');
  140 |   for (const [width, height] of [[1920, 1080], [2560, 1440], [3840, 2160]]) {
  141 |     await page.setViewportSize({ width, height });
  142 |     await page.screenshot({ path: join(photos, `desktop-usage-${width}x${height}.png`) });
  143 |   }
  144 |   await page.setViewportSize({ width: 1920, height: 1080 });
  145 |   await page.locator('#conversation').getByRole('button', { name: 'Vedi contesto' }).click();
  146 |   await page.getByText('Fonti', { exact: true }).click();
  147 |   await page.getByRole('button', { name: 'Apri fonte', exact: true }).click();
  148 |   await expect(page.locator('[data-context-source-text]')).toContainText('Avevamo scelto SQLite, solo locale.');
  149 |   await page.keyboard.press('Escape');
  150 |   await page.reload(); await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  151 |   await page.evaluate(({ sessionId, model }) => window.__talosHarnessUiRuntime.passaASessione(sessionId, 'fixture', 'Decisione sul database', model, { conclusa: true, modello: model }), { sessionId, model });
  152 |   await expect(page.locator('#conversation [data-context-separator]')).toHaveCount(1);
  153 |   await expect(page.locator('[data-runtime-usage]')).toContainText('2,0k');
  154 |   await expect(page.locator('[data-runtime-cache]')).toContainText('cache 40%');
  155 |   await page.locator('#compactSessionBtn').click();
  156 |   await page.getByText('Da non dimenticare', { exact: true }).click();
  157 |   await expect(page.locator('[data-context-facts]')).toContainText('Il database deve restare locale.');
  158 |   expect(inference).toEqual([`${base}/api/v1/sessions/${sessionId}/context/jobs`]);
  159 | });
  160 | 
  161 | test('CTX-UI-DISABLED-OPEN opens Context Manager without a legacy compaction or inference', async ({ page, context }) => {
  162 |   await context.addCookies([{ name: 'talos_token', value: token, url: base, httpOnly: true, sameSite: 'Strict' }]);
  163 |   await page.addInitScript(() => localStorage.setItem('talos.harness.desktop.intro.v1', JSON.stringify({ esito: 'saltata' })));
  164 |   const mutations = [];
  165 |   page.on('request', request => { if (/\/compact$|\/context\//.test(request.url()) && request.method() !== 'GET') mutations.push(request.url()); });
  166 |   await page.goto(base); await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  167 |   await page.evaluate(model => window.__talosHarnessUiRuntime.passaASessione('context-disabled-proof', 'fixture', 'Contesto non ancora attivo', model, { conclusa: true, modello: model }), model);
  168 |   await page.locator('#compactSessionBtn').click();
  169 |   await expect(page.locator('#veloContesto')).toBeVisible();
  170 |   await expect(page.locator('[data-context-status]')).toContainText('non è ancora attivo');
  171 |   await expect(page.locator('[data-context-start]')).toBeDisabled();
  172 |   await expect(page.locator('[data-context-auto]')).toBeDisabled();
  173 |   await page.keyboard.press('Escape');
  174 |   await expect(page.locator('#compactSessionBtn')).toBeFocused();
  175 |   expect(mutations).toEqual([]);
  176 | });
  177 | 
```