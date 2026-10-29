import { expect, test } from '@playwright/test';

/*
 * Anteprima nelle domande (owner 29/10/2026, bozzetto https://claude.ai/artifact/8Xchqr6NpKmAAainYtmeuK: «la prima opzione, ma fai
 * attenzione a formattare documenti tipo pdf md html»). L'evento è quello vero del kernel (`UserQuestionRequested` con
 * `options[].preview`); la rotta del file è finta ma risponde come quella vera (`PREVIEW_FILE_SECRET` per un segreto, solo con
 * `origine=modello`).
 */
const SESSIONE = 'anteprima-domande';
async function apri(page, opzioni, { colorMode = null } = {}) {
  if (colorMode) {
    await page.addInitScript((tema) => {
      localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: tema } }));
    }, colorMode);
  }
  const chieste = [];
  await page.route('**/api/v1/sessions/*/file?**', async (route) => {
    const url = new URL(route.request().url());
    chieste.push({ percorso: url.searchParams.get('percorso'), origine: url.searchParams.get('origine') });
    if (url.searchParams.get('percorso') === '.env') {
      await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'PREVIEW_FILE_SECRET', message: 'This file is kept out of previews because it may hold a secret. Open it yourself from the Files tab if you need it' } }) });
      return;
    }
    if (url.searchParams.get('percorso').endsWith('.html')) {
      await route.fulfill({ status: 200, contentType: 'application/octet-stream', body: '<h1>Rapporto</h1><p>Tre prove su tre.</p><script>document.body.append("ESEGUITO")</script>' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/octet-stream', body: '# Piano del rilascio\n\n- prima la candidata\n- poi la prova dell’owner\n' });
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await page.evaluate(({ sessione, opzioni }) => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione(sessione, 'workspace', 'Anteprima', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
    runtime.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, runtime.realSessionState.generation);
    const g = runtime.realSessionState.generation;
    runtime.handleRealEvent({ type: 'RunStarted', input: { consegna: 'Prepara il rilascio' }, contesto: { cartella: 'C:\\progetti\\AVM', modello: 'z-ai/glm-5.3-flash' }, _sequenza: 1 }, g);
    runtime.handleRealEvent({ type: 'UserQuestionRequested', _sequenza: 2, requestId: 'anteprima-1',
      questions: [{ id: 'scelta', question: 'Come procedo?', why: 'Cambia cosa resta da provare.', options: opzioni }] }, g);
  }, { sessione: SESSIONE, opzioni });
  const carta = page.locator('.talos-question-card').last();
  await expect(carta).toBeVisible();
  return { carta, chieste };
}

/* un'anteprima LUNGA (30 righe) accanto a una corta: è lì che un pannello che segue il contenuto farebbe crescere la carta */
const LISTA_LUNGA = Array.from({ length: 30 }, (_, i) => `${i + 1}. controllo ${i + 1}`).join('\n');

test('ANTEPRIMA-UI-01 —con le anteprime la carta si divide: Markdown formattato, documento del progetto col lettore, cambio al passaggio', async ({ page }) => {
  const { carta, chieste } = await apri(page, [
    { label: 'Elenco', description: 'Un elenco puntato.', recommended: true, preview: `## Passi\n\n- **prima** la candidata\n- poi la prova\n\n${'```'}js\nconst pronto = true;\n${'```'}\n\n${LISTA_LUNGA}` },
    { label: 'Documento', description: 'Il piano del progetto.', preview: 'docs/piano.md' },
    { label: 'Segreto', description: 'Un file riservato.', preview: '.env' },
    { label: 'Niente', description: 'Senza anteprima.' },
  ]);
  const pannello = carta.locator('.talos-question-card__anteprima');
  await expect(pannello).toBeVisible();
  /* di serie la consigliata, formattata: un titolo, un elenco col grassetto, un blocco di codice — mai i segni del Markdown */
  await expect(pannello.locator('.talos-question-card__anteprima-testa')).toHaveText('Anteprima · Elenco');
  await expect(pannello.locator('h2')).toHaveText('Passi');
  await expect(pannello.locator('li strong')).toHaveText('prima');
  await expect(pannello.locator('.code-block')).toHaveCount(1);
  await expect(pannello).not.toContainText('## Passi');
  await page.screenshot({ path: 'test-results/anteprima-domande-markdown.png' });
  /* ⛔ la carta sta sopra il compositore e cresce verso l'alto: se l'anteprima cambiasse altezza, le scelte scivolerebbero sotto il puntatore */
  const altezza = async () => Math.round((await carta.boundingBox()).height);
  const altezzaDiPartenza = await altezza();
  /* e la lunga SCORRE, non si taglia (Claude Code, issue 33062 e 78070: «N lines hidden» senza modo di vederle) */
  expect(await pannello.locator('.talos-question-card__anteprima-corpo').evaluate((el) => el.scrollHeight > el.clientHeight + 20)).toBe(true);

  /* il documento del progetto: chiesto «per il modello», mostrato dal lettore dei file */
  await carta.locator('.talos-question-card__option-row').nth(1).hover();
  await expect(pannello.locator('.talos-question-card__anteprima-testa')).toHaveText('Anteprima · Documento');
  await expect(pannello.locator('.talos-lettore')).toBeVisible();
  await expect(pannello).toContainText('Piano del rilascio');
  expect(chieste.find((c) => c.percorso === 'docs/piano.md')?.origine).toBe('modello');
  expect(await altezza(), 'altezza della carta col documento').toBe(altezzaDiPartenza);
  await page.screenshot({ path: 'test-results/anteprima-domande-documento.png' });

  /* un segreto: il server lo rifiuta, e a schermo non c'è niente del file */
  await carta.locator('.talos-question-card__option-row').nth(2).hover();
  await expect(pannello.locator('.talos-question-card__anteprima-testa')).toHaveText('Anteprima · Segreto');
  await expect(pannello).not.toContainText('Piano del rilascio');
  await expect(pannello).not.toContainText('OPENROUTER');

  /* una scelta senza anteprima lo dice */
  await carta.locator('.talos-question-card__option-row').nth(3).hover();
  await expect(pannello).toContainText('Nessuna anteprima per questa scelta.');
  expect(await altezza(), 'altezza della carta senza anteprima').toBe(altezzaDiPartenza);

  /* ⛔ con la TASTIERA come col puntatore (Claude Code, issue 70577: nel suo riquadro affiancato le frecce non sono affidabili): il fuoco
     su una scelta cambia l'anteprima; e la riga «Altro…» resta (issue 90605: lì sparisce) */
  await carta.locator('.talos-question-card__option-row').nth(0).locator('input').focus();
  await expect(pannello.locator('.talos-question-card__anteprima-testa')).toHaveText('Anteprima · Elenco');
  await expect(carta.getByPlaceholder('Altro…')).toBeVisible();
});

test('ANTEPRIMA-UI-02 — AL CONTRARIO: senza anteprime la carta è quella di sempre, una colonna sola', async ({ page }) => {
  const { carta } = await apri(page, [
    { label: 'A', description: 'Prima.', recommended: true },
    { label: 'B', description: 'Seconda.' },
  ]);
  await expect(carta.locator('.talos-question-card__anteprima')).toHaveCount(0);
  await expect(carta.locator('.talos-question-card__con-anteprima')).toHaveCount(0);
  await expect(carta.locator('.talos-question-card__option-row')).toHaveCount(2);
});

test('ANTEPRIMA-UI-03 — un documento HTML si mostra da solo, in una cornice senza script (tema scuro)', async ({ page }) => {
  const { carta } = await apri(page, [
    { label: 'Rapporto', description: 'Il rapporto delle prove.', recommended: true, preview: 'docs/rapporto.html' },
    { label: 'Elenco', description: 'Un elenco.', preview: '- uno\n- due' },
  ], { colorMode: 'dark' });
  const cornice = carta.locator('iframe.talos-question-card__anteprima-html');
  await expect(cornice).toHaveAttribute('sandbox', '');
  await expect(cornice).toHaveAttribute('srcdoc', /Content-Security-Policy[^>]*default-src 'none'/u);
  const dentro = page.frameLocator('iframe.talos-question-card__anteprima-html');
  await expect(dentro.locator('h1')).toHaveText('Rapporto');
  await expect(dentro.locator('body')).not.toContainText('ESEGUITO');
  await page.screenshot({ path: 'test-results/anteprima-domande-html-scuro.png' });
});
