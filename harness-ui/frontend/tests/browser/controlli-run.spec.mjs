/*
 * F3-52 (25/09/2026) — i controlli del run nella testata del diagramma, sulle rotte v2 (fixture dei mockup R4 in
 * `aiuto-workflow-v2.mjs`, con i comandi che rispondono come il server F3-51c e cambiano la scena come i loro fatti).
 * Decisioni owner: 21 (pulsante secondo lo stato + «…» con Annulla in fondo, anche col tasto destro), 22 (Annulla con
 * conferma che dice le conseguenze), 23 (Riprova con conferma col conto). Ogni scrittura che NON è un comando del run si
 * ferma e si conta. Ledger: `.claude/LEDGER-F3-WORKFLOW-UI-2026-09-25.md`, sezione F3-52.
 */
import { expect, test } from '@playwright/test';
import { apriDiagrammaDellaScena, cambiaStati, costruisciScena, instradaScena } from './aiuto-workflow-v2.mjs';

test.use({ viewport: { width: 1440, height: 900 } });

test('WF-RUN-CONTROLS-UI: Pause at once, Retry after its count, Cancel after its consequences; nothing else writes', async ({ page }) => {
  const scena = cambiaStati(costruisciScena(14, { sessionId: 'wf-run-ctl' }), [['implementazione-0003', 'failed']]);
  const { scritture, comandi } = await instradaScena(page, scena, { comandi: true });
  const grafo = await apriDiagrammaDellaScena(page, scena);
  const run = grafo.locator('.talos-wfg__run');
  const principale = run.locator('.talos-wfg__run-principale');
  const altro = run.getByRole('button', { name: 'Altri comandi del run' });
  const menu = run.getByRole('menu', { name: 'Comandi del run' });
  const conferma = page.locator('dialog.talos-wfg-conferma');
  await expect(principale).toHaveText('Pausa');
  // «…»: Riprova, e Annulla in fondo dopo un separatore (decisione 21)
  await altro.click();
  await expect(menu.getByRole('menuitem')).toHaveText(['Riprova 1 passo', 'Annulla il run']);
  await expect(menu.locator('[role="separator"]')).toHaveCount(1);
  // Riprova: il conto viene dal server PRIMA, poi la conferma (decisione 23); il fuoco parte da «Non ora»
  await menu.getByRole('menuitem', { name: 'Riprova 1 passo' }).click();
  await expect(conferma).toBeVisible();
  await expect(conferma.getByRole('heading')).toHaveText('Riprovo 1 passo?');
  await expect(conferma).toContainText('Il passo non riuscito riparte coi tentativi da capo. Il tetto del run sale di:');
  await expect(conferma.locator('.talos-wfg-conferma__riga')).toHaveText([/Tempo massimo\s*\+ 20 min/u, /Richieste al modello\s*\+ 8/u, /Token letti\s*\+ 12\.000/u, /Attrezzi usati\s*\+ 30/u]);
  await expect(conferma.getByRole('button', { name: 'Non ora' })).toBeFocused();
  await conferma.getByRole('button', { name: 'Riprova', exact: true }).click();
  await expect(conferma).toHaveCount(0);
  await expect(grafo.locator('.talos-wfg__esito-run')).toHaveText(/Riprova partito/u);
  expect(comandi.map((c) => c.azione)).toEqual(['retry']);
  expect(comandi[0].corpo).toEqual({ commandId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u) });
  // Pausa: un clic, niente conferma; poi la testata dice «Pausa in corso» e non la offre di nuovo
  await principale.click();
  await expect(grafo.locator('.talos-wfg__stato-run')).toHaveText(/^Pausa in corso · \d+ di \d+ terminati$/u); // refactor dei grafi: la riga di stato del prototipo dice anche i terminati
  await expect(principale).toBeHidden();
  expect(comandi.map((c) => c.azione)).toEqual(['retry', 'pause']);
  expect(new Set(comandi.map((c) => c.corpo.commandId)).size).toBe(2); // un commandId per gesto
  // Annulla: la conferma dice le conseguenze (decisione 22); «Non ora» ed Esc non mandano niente
  await altro.click();
  await expect(menu.getByRole('menuitem')).toHaveText(['Annulla il run']);
  await menu.getByRole('menuitem', { name: 'Annulla il run' }).click();
  await expect(conferma.getByRole('heading')).toHaveText('Annullo il run?');
  await expect(conferma).toContainText('Il passo in corso si ferma subito.');
  await expect(conferma).toContainText('I risultati già registrati restano.');
  await conferma.getByRole('button', { name: 'Non ora' }).click();
  await expect(conferma).toHaveCount(0);
  await expect(altro).toBeFocused();
  await altro.click();
  await menu.getByRole('menuitem', { name: 'Annulla il run' }).click();
  await expect(conferma).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(conferma).toHaveCount(0);
  expect(comandi.map((c) => c.azione)).toEqual(['retry', 'pause']);
  // … e poi davvero
  await altro.click();
  await menu.getByRole('menuitem', { name: 'Annulla il run' }).click();
  await conferma.getByRole('button', { name: 'Annulla il run' }).click();
  await expect(grafo.locator('.talos-wfg__stato-run')).toHaveText(/^Annullamento in corso · \d+ di \d+ terminati$/u); // refactor dei grafi: la riga di stato del prototipo dice anche i terminati
  await expect(run).toBeHidden();
  expect(comandi.map((c) => c.azione)).toEqual(['retry', 'pause', 'cancel']);
  // il caso VERO del 4174 (run 81d33e4f, 25/09): a run chiuso il registro tiene ancora `cancelRequested`, e la testata deve
  // dire «Annullato», non restare su «Annullamento in corso»
  scena.panoramica.status = 'cancelled';
  await grafo.getByRole('button', { name: 'Torna alla chat' }).click();
  await page.locator('#railAgenti [data-c="WorkflowRail"]').getByRole('button', { name: 'Apri diagramma', exact: true }).click();
  await expect(grafo.locator('.talos-wfg__stato-run')).toHaveText(/^Annullato · \d+ di \d+ terminati$/u); // refactor dei grafi: la riga di stato del prototipo dice anche i terminati
  await expect(grafo.locator('[data-coordinatore] .talos-wfg__pill')).toContainText('Annullato');
  await expect(grafo.locator('.talos-wfg__run')).toBeHidden();
  expect(scritture).toEqual([]);
});

test('WF-RUN-CONTROLS-RESUME: a paused run offers Resume; the right click on the principal session opens the same menu', async ({ page }) => {
  const scena = costruisciScena(14, { sessionId: 'wf-run-ripresa' });
  scena.panoramica.status = 'paused';
  const { scritture, comandi } = await instradaScena(page, scena, { comandi: true });
  const grafo = await apriDiagrammaDellaScena(page, scena);
  const principale = grafo.locator('.talos-wfg__run-principale');
  await expect(principale).toHaveText('Riprendi');
  await expect(grafo.locator('.talos-wfg__stato-run')).toHaveText(/^In pausa · \d+ di \d+ terminati$/u); // refactor dei grafi: la riga di stato del prototipo dice anche i terminati
  await grafo.locator('[data-coordinatore]').click({ button: 'right' });
  const menu = grafo.getByRole('menu', { name: 'Comandi del run' });
  await expect(menu.getByRole('menuitem')).toHaveText(['Annulla il run']);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await principale.click();
  await expect(principale).toHaveText('Pausa');
  await expect(grafo.locator('.talos-wfg__esito-run')).toBeHidden(); // l'esito riuscito cede alla testata quando lo stato cambia
  expect(comandi.map((c) => c.azione)).toEqual(['resume']);
  expect(scritture).toEqual([]);
});

/*
 * ⭐ C3 (09/10/2026) — le azioni della PERSONA su un passo fallito, nel menu ⋯ del dettaglio e col tasto destro sulla card
 *   (decisione owner 09/10): Segna come fatto (il riassunto è obbligatorio), Metti da parte (conferma), Rifai con un altro modello
 *   (lista corta dei modelli già in uso + «Altro modello…»). Su un passo non fallito le voci non ci sono.
 */
test('C3-STEP-ACTIONS-UI: a failed step offers its three actions in ⋯ and on right click; each one sends exactly its command', async ({ page }) => {
  const scena = cambiaStati(costruisciScena(14, { sessionId: 'wf-passo-fallito' }), [['implementazione-0003', 'failed'], ['implementazione-0004', 'failed']]);
  // un passo finito ha usato un altro modello: entra nella lista corta di «Rifai con un altro modello»
  const altro = scena.tutte.find((r) => r.state === 'succeeded');
  for (const elenco of [...scena.righe.values(), scena.tutte]) for (const [i, r] of elenco.entries()) if (r.nodeId === altro.nodeId) elenco[i] = { ...r, effectiveModel: { provider: 'openrouter', model: 'openai/gpt-5-nano' } };
  // un passo FALLITO ha girato: ha il suo modello effettivo (nella scena «implementazione-0004» nasceva in attesa, senza)
  for (const elenco of [...scena.righe.values(), scena.tutte]) for (const [i, r] of elenco.entries()) if (r.state === 'failed') elenco[i] = { ...r, effectiveModel: { provider: 'openrouter', model: 'z-ai/glm-5.3-flash' } };
  const { scritture, comandi } = await instradaScena(page, scena, { comandi: true });
  const grafo = await apriDiagrammaDellaScena(page, scena);
  const dettaglio = grafo.locator('.talos-wfg__dettaglio');
  const menuPasso = dettaglio.getByRole('menu');
  const conferma = page.locator('dialog.talos-wfg-conferma');
  const AZIONI = ['Segna come fatto…', 'Metti da parte…', 'Rifai con un altro modello…'];

  // un passo riuscito: nessuna azione della persona
  await grafo.locator(`[data-nodo-id="${altro.nodeId}"]`).first().click();
  await dettaglio.getByRole('button', { name: 'Altre azioni sull\'agente' }).click();
  for (const voce of AZIONI) await expect(menuPasso.getByRole('menuitem', { name: voce })).toBeHidden();
  await page.keyboard.press('Escape');

  // il passo fallito: la riga lo dice, il ⋯ ha le tre azioni
  await grafo.locator('[data-nodo-id="implementazione-0003"]').first().click();
  await expect(dettaglio.locator('.talos-wfg__passo-nota')).toHaveText('Questo passo è fallito. Scegli che cosa farne dal menu ⋯.');
  await dettaglio.getByRole('button', { name: 'Altre azioni sull\'agente' }).click();
  for (const voce of AZIONI) await expect(menuPasso.getByRole('menuitem', { name: voce })).toBeVisible();
  await expect(menuPasso.getByRole('menuitem', { name: 'Riprendi verificando…' })).toBeHidden(); // C3 2b: solo per un passo incerto

  // Segna come fatto: il riassunto è obbligatorio, il fuoco parte dal campo
  await menuPasso.getByRole('menuitem', { name: 'Segna come fatto…' }).click();
  await expect(conferma.getByRole('heading')).toHaveText(/^Segna «.+» come fatto$/u);
  const campo = conferma.getByRole('textbox', { name: 'Che cosa è stato fatto' });
  await expect(campo).toBeFocused();
  const si = conferma.getByRole('button', { name: 'Segna come fatto', exact: true });
  await expect(si).toBeDisabled();
  await campo.fill('   ');
  await expect(si).toBeDisabled();
  await campo.fill('Fatto a mano: il retry è in src/rete.js');
  await expect(si).toBeEnabled();
  await si.click();
  await expect(grafo.locator('.talos-wfg__esito-run')).toHaveText(/Segnato come fatto/u);
  expect(comandi.map((c) => [c.azione, c.nodeId, c.corpo.summary])).toEqual([['mark-done', 'implementazione-0003', 'Fatto a mano: il retry è in src/rete.js']]);

  // review Y3 (09/10): il menu del dettaglio è fisso; quando la finestra cambia misura si CHIUDE, non resta staccato dal pulsante
  await dettaglio.getByRole('button', { name: 'Altre azioni sull\'agente' }).click();
  await expect(menuPasso).toBeVisible();
  await page.setViewportSize({ width: 1600, height: 900 });
  await expect(menuPasso).toBeHidden();
  await page.setViewportSize({ width: 1440, height: 900 });
  // … e quando un antenato del pulsante scorre, il menu lo SEGUE (resta aperto, attaccato al pulsante)
  const pulsante = dettaglio.getByRole('button', { name: 'Altre azioni sull\'agente' });
  await pulsante.click();
  await expect(menuPasso).toBeVisible();
  await page.evaluate(() => {
    const pannello = document.querySelector('.talos-wfg__dettaglio');
    pannello.style.paddingTop = '40px'; // il pulsante si sposta di 40 px dentro il pannello
    pannello.dispatchEvent(new Event('scroll'));
  });
  await expect(menuPasso).toBeVisible();
  const [rP, rM] = await Promise.all([pulsante.boundingBox(), menuPasso.boundingBox()]);
  expect(Math.abs((rM.y + rM.height) - (rP.y - 6)) < 2 || Math.abs(rM.y - (rP.y + rP.height + 6)) < 2).toBe(true);
  await page.evaluate(() => { document.querySelector('.talos-wfg__dettaglio').style.paddingTop = ''; });
  await page.keyboard.press('Escape');

  // il tasto destro sulla card dell'altro passo fallito apre lo stesso menu; «Non ora» non manda niente
  await grafo.locator('[data-nodo-id="implementazione-0004"]').first().click({ button: 'right' });
  await expect(menuPasso.getByRole('menuitem', { name: 'Metti da parte…' })).toBeVisible();
  await menuPasso.getByRole('menuitem', { name: 'Metti da parte…' }).click();
  await expect(conferma).toContainText('I passi che lo aspettano non partiranno');
  await conferma.getByRole('button', { name: 'Non ora' }).click();
  expect(comandi).toHaveLength(1);

  // Rifai con un altro modello: la lista corta ha il modello usato da un altro passo, non quello del passo fallito
  await dettaglio.getByRole('button', { name: 'Altre azioni sull\'agente' }).click();
  await menuPasso.getByRole('menuitem', { name: 'Rifai con un altro modello…' }).click();
  const scelte = conferma.getByRole('radiogroup', { name: 'Modello' });
  await expect(scelte.getByRole('radio')).toHaveText([/openai\/gpt-5-nano/u, /Altro modello…/u]);
  const rifai = conferma.getByRole('button', { name: 'Rifai', exact: true });
  await expect(rifai).toBeDisabled();
  await scelte.getByRole('radio', { name: /openai\/gpt-5-nano/u }).click();
  await rifai.click();
  await expect(grafo.locator('.talos-wfg__esito-run')).toHaveText('Il passo riparte su openai/gpt-5-nano.');
  expect(comandi.map((c) => [c.azione, c.nodeId, c.corpo.model ?? null])).toEqual([
    ['mark-done', 'implementazione-0003', null], ['retry-other-model', 'implementazione-0004', 'openai/gpt-5-nano']]);
  expect(new Set(comandi.map((c) => c.corpo.commandId)).size).toBe(2);
  expect(scritture).toEqual([]);
});

/* C3 tappa 2a/2b (09/10/2026): un passo INCERTO, col run che chiede attenzione: la riga lo dice, il ⋯ ha QUATTRO azioni, e
   «Riprendi verificando» manda il suo comando (solo il commandId) dopo la conferma. */
test('C3-STEP-UNCERTAIN-UI: an uncertain step offers «Resume, checking first» too, and it sends exactly its command', async ({ page }) => {
  const scena = cambiaStati(costruisciScena(14, { sessionId: 'wf-passo-incerto' }), [['implementazione-0003', 'uncertain']]);
  scena.panoramica.status = 'needs_attention';
  const { scritture, comandi } = await instradaScena(page, scena, { comandi: true });
  const grafo = await apriDiagrammaDellaScena(page, scena);
  const dettaglio = grafo.locator('.talos-wfg__dettaglio');
  const menuPasso = dettaglio.getByRole('menu');
  const conferma = page.locator('dialog.talos-wfg-conferma');
  await grafo.locator('[data-nodo-id="implementazione-0003"]').first().click();
  await expect(dettaglio.locator('.talos-wfg__passo-nota')).toHaveText(/^TALOS non sa se questo passo ha fatto il suo lavoro\./u);
  await dettaglio.getByRole('button', { name: 'Altre azioni sull\'agente' }).click();
  for (const voce of ['Segna come fatto…', 'Metti da parte…', 'Rifai con un altro modello…', 'Riprendi verificando…']) {
    await expect(menuPasso.getByRole('menuitem', { name: voce })).toBeVisible();
  }
  await menuPasso.getByRole('menuitem', { name: 'Riprendi verificando…' }).click();
  await expect(conferma.getByRole('heading')).toHaveText(/^Riprendi «.+» verificando$/u);
  await expect(conferma).toContainText('Prima controlla se il tentativo di prima ha già fatto il lavoro');
  await conferma.getByRole('button', { name: 'Riprendi', exact: true }).click();
  await expect(grafo.locator('.talos-wfg__esito-run')).toHaveText('Il passo riprende nella sua sessione, verificando prima.');
  expect(comandi.map((c) => [c.azione, c.nodeId, Object.keys(c.corpo)])).toEqual([['resume-verify', 'implementazione-0003', ['commandId']]]);
  expect(scritture).toEqual([]);
});

/* C3 tappa 3 (09/10/2026, owner «quanto serve per finire»): il run aspetta per il budget ⇒ la prima azione è «Alza il tetto e
   riprendi»; la conferma dice la cifra dell'anteprima del server voce per voce, e il comando porta ESATTAMENTE quella cifra. */
test('C3-CEILING-UI: a run waiting for its budget offers «Raise the ceiling and resume», says the amount first, and sends exactly that amount', async ({ page }) => {
  const scena = costruisciScena(14, { sessionId: 'wf-tetto' });
  scena.panoramica.status = 'needs_attention';
  scena.panoramica.attentionReasons = ['budget_overrun'];
  const { scritture, comandi } = await instradaScena(page, scena, { comandi: true });
  const grafo = await apriDiagrammaDellaScena(page, scena);
  const principale = grafo.locator('.talos-wfg__run .talos-wfg__run-principale');
  const conferma = page.locator('dialog.talos-wfg-conferma');
  await expect(principale).toHaveText('Alza il tetto e riprendi');
  await principale.click();
  await expect(conferma.getByRole('heading')).toHaveText('Alzo il tetto e riprendo?');
  await expect(conferma).toContainText('Il run ha raggiunto il tetto del budget.');
  await expect(conferma).toContainText(/Per far partire (il passo che resta|i \d+ passi che restano), il tetto sale di:/u);
  await expect(conferma.locator('.talos-wfg-conferma__riga')).toHaveText([/Richieste al modello\s*\+ 4/u, /Token letti\s*\+ 120\.000/u]);
  await expect(conferma.getByRole('button', { name: 'Non ora' })).toBeFocused();
  await conferma.getByRole('button', { name: 'Alza e riprendi' }).click();
  // l'esito «Tetto alzato» vale finché lo stato non cambia (F3-52): qui il run riparte subito, e lo dice la testata
  await expect(conferma).toHaveCount(0);
  await expect.poll(() => comandi.map((c) => c.azione)).toEqual(['raise-ceiling']);
  expect(comandi[0].corpo).toEqual({ commandId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    amount: { promptTokens: 120_000, completionTokens: 0, wallMs: 0, agentSeconds: 0, toolCalls: 0, modelRequests: 4, knownCostUsd: 0 } });
  await expect(principale).toHaveText('Pausa', { timeout: 10_000 }); // il run è ripartito: la testata lo ridice dal server
  expect(scritture).toEqual([]);
});

test('C3-CEILING-UI-ENOUGH: when the ceiling of now already fits, the confirmation says so and the run resumes without raising it', async ({ page }) => {
  const scena = costruisciScena(14, { sessionId: 'wf-tetto-basta' });
  scena.panoramica.status = 'needs_attention';
  scena.panoramica.attentionReasons = ['budget_overrun'];
  scena.aumentoDelTetto = { promptTokens: 0, completionTokens: 0, wallMs: 0, agentSeconds: 0, toolCalls: 0, modelRequests: 0, knownCostUsd: 0 };
  const { scritture, comandi } = await instradaScena(page, scena, { comandi: true });
  const grafo = await apriDiagrammaDellaScena(page, scena);
  const conferma = page.locator('dialog.talos-wfg-conferma');
  await grafo.locator('.talos-wfg__run .talos-wfg__run-principale').click();
  await expect(conferma.getByRole('heading')).toHaveText('Riprendo il run?');
  await expect(conferma).toContainText('Il tetto di adesso basta già per i passi che restano: il run riprende senza alzarlo.');
  await expect(conferma.locator('.talos-wfg-conferma__riga')).toHaveCount(0);
  await conferma.getByRole('button', { name: 'Riprendi', exact: true }).click();
  await expect.poll(() => comandi.map((c) => [c.azione, c.corpo.amount.promptTokens])).toEqual([['raise-ceiling', 0]]);
  expect(scritture).toEqual([]);
});

test('WF-RUN-CONTROLS-ENDED: a finished run has no commands', async ({ page }) => {
  const scena = costruisciScena(14, { sessionId: 'wf-run-finito' });
  scena.panoramica.status = 'succeeded';
  const { scritture, comandi } = await instradaScena(page, scena, { comandi: true });
  const grafo = await apriDiagrammaDellaScena(page, scena);
  await expect(grafo.locator('.talos-wfg__stato-run')).toHaveText(/^Riuscito · \d+ di \d+ terminati$/u); // refactor dei grafi: la riga di stato del prototipo dice anche i terminati
  await expect(grafo.locator('.talos-wfg__run')).toBeHidden();
  expect([comandi, scritture]).toEqual([[], []]);
});
