import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/*
 * Reperti «evidenti» 1, 3, 4 e 5 della revisione d'uso della candidata (Frontend, 04/11/2026): le prove dal prodotto, nei due temi,
 * a 1920×1080 e col movimento ridotto. Scritte rosse sulla 16ef38f44. Ogni richiesta non GET si ferma. Le foto vanno nella cartella
 * di TALOS_FOTO_DIR (scratchpad), mai nel repo; senza, le prove girano senza foto.
 * Eventi copiati dalla forma vera (`rev-riga-in-consenso.spec.mjs`: `azione.toolCallId`, come lo manda il kernel da ogni cancello).
 */
const CARTELLA = process.env.TALOS_FOTO_DIR || '';
if (CARTELLA) mkdirSync(CARTELLA, { recursive: true });
const foto = async (page, nome) => { if (CARTELLA) await page.screenshot({ path: `${CARTELLA}/${nome}.png` }); };

async function apri(page, tema) {
  await page.route('**/api/**', (r) => (r.request().method() === 'GET' ? r.fallback() : r.abort()));
  await page.route('**/api/v1/sessions/uxe-*/events*', (r) => r.fulfill({ contentType: 'text/event-stream', body: 'retry: 600000\n\n' }));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
  await page.addInitScript(({ colorMode }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } })); } catch { /* */ }
  }, { colorMode: tema });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
  await page.waitForFunction(() => Boolean(window.__talosHarnessUiRuntime));
}

async function inChat(page, eventi) {
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await page.evaluate((eventi) => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione('uxe-sessione', 'workspace', 'Prova', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
    const g = runtime.realSessionState.generation;
    runtime.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, g);
    let seq = 1;
    for (const e of eventi) runtime.handleRealEvent({ ...e, _sequenza: seq++ }, g);
  }, eventi);
  return page.locator('#conversation');
}

const avvio = { type: 'RunStarted', input: { consegna: 'esegui node --version e poi aggiungi una riga a note-ux.txt' }, contesto: { cartella: 'C:\\progetti\\prova' } };
const chiamata = (id, nome, argomenti) => [
  { type: 'ToolCallStart', toolCallId: id, toolCallName: nome },
  { type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify(argomenti) },
];
/* Decisione 175 (N2): un ridisegno del segmento dopo la fine — RunFinished chiude il giro e rilegge i segmenti aperti. */
const ridisegna = async (page) => {
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.handleRealEvent({ type: 'RunFinished', _sequenza: 900 + Math.floor(Math.random() * 90) }, runtime.realSessionState.generation);
  });
  await page.waitForTimeout(200);
};
const domanda = (requestId, toolCallId, azione) => ({ type: 'ApprovalRequested', requestId, azione: { ...azione, toolCallId } });

for (const tema of ['light', 'dark']) {
  test(`UXE-B1 (${tema}) — Nuova sessione: la frase sotto «Mostra ragionamento» dice cosa succede da spento, non lo stato`, async ({ page }) => {
    await apri(page, tema);
    await page.locator('.talos-nav-item[data-vaia="chat"]').click();
    await page.getByRole('button', { name: 'Nuova sessione', exact: true }).first().click();
    const riga = page.locator('#workspaceChooser .workspace-chooser-inline-toggle');
    await expect(riga).toBeVisible();
    await page.waitForTimeout(300);
    await foto(page, `1-nuova-sessione-${tema}`);
    await expect(riga.locator('input[type="checkbox"]')).toBeChecked();
    await expect(riga.locator('small')).toHaveText(/^Quando è spento, vedi solo per quanto ha ragionato il modello\.$/u);
  });

  test(`UXE-B3 (${tema}) — foglio Permessi: le etichette di rischio (foto, il reperto resta aperto)`, async ({ page }) => {
    await apri(page, tema);
    await page.locator('.talos-sidebar [data-vaia="chat"]').first().click();
    await page.locator('[data-open-sheet="permissions"]:visible').first().click();
    await expect(page.locator('#veloPermessiScelte')).toBeVisible();
    await page.waitForTimeout(300);
    await foto(page, `3-permessi-${tema}`);
    // il reperto 2 si vede qui: «Solo se sai già cosa sta per fare»
    await expect(page.locator('#veloPermessiScelte [data-permission-choice="Full access"] p')).toContainText('Solo se sai già cosa sta per fare');
  });

  test(`UXE-B4 (${tema}) — due chiamate ferme alla carta: la testa dice «aspetta il tuo consenso» e i secondi scorrono`, async ({ page }) => {
    await apri(page, tema);
    const chat = await inChat(page, [
      avvio,
      ...chiamata('t1', 'shell', { comando: 'node --version' }),
      ...chiamata('t2', 'scrivi', { percorso: 'note-ux.txt', contenuto: 'una riga' }),
      domanda('a1', 't1', { tipo: 'shell', comando: 'node --version' }),
      domanda('a2', 't2', { tipo: 'scrivi', percorso: 'note-ux.txt' }),
    ]);
    const testa = chat.locator('.talos-activity--segment .talos-activity__head:visible').first();
    await expect(testa).toBeVisible();
    const conteggi = testa.locator('.talos-activity__conteggi');
    const tempo = testa.locator('.talos-activity__tempo');
    await page.waitForTimeout(1200);
    const prima = (await tempo.textContent()) || '';
    await page.waitForTimeout(2300);
    const dopo = (await tempo.textContent()) || '';
    await foto(page, `4-attesa-consenso-${tema}`);
    await expect(conteggi).toContainText(/aspetta il tuo consenso/iu);
    await expect(conteggi).not.toContainText('in corso');
    expect(dopo, `i secondi della testa scorrono: «${prima}» → «${dopo}»`).not.toBe(prima);
    expect(dopo).toMatch(/\d/u);
    // la carta non è la fine del giro: nessun «Attività conclusa» annunciato a chi usa un lettore di schermo
    const annunciato = await page.evaluate(() => document.getElementById('talosAnnunciAttivita')?.textContent ?? '');
    expect(annunciato).not.toContain('conclusa');
    // AL CONTRARIO: deciso il consenso per una, quella torna «in corso» e l'altra aspetta ancora
    await page.evaluate(() => {
      const runtime = window.__talosHarnessUiRuntime;
      runtime.handleRealEvent({ type: 'ApprovalResolved', requestId: 'a1', approvato: true, _sequenza: 100 }, runtime.realSessionState.generation);
    });
    await expect(conteggi).toContainText(/aspetta il tuo consenso/iu);
  });

  test(`UX175-DOPO-IL-SI (${tema}) — dato il sì la testa torna «in corso» coi secondi; finito il comando l'ora di fine resta ferma`, async ({ page }) => {
    /* Decisione 175 dell'owner (04/11/2026): reperto N1 (dopo il sì la card restava «concluso», non occupata, con l'orologio fermo) e
       reperto N2 (l'ora di fine dopo l'attesa: senza `eraInAttesa` la durata ricresceva fino ad «adesso» a ogni ridisegno, mutante R8/BR6). */
    await apri(page, tema);
    const chat = await inChat(page, [
      avvio,
      ...chiamata('t1', 'shell', { comando: 'npm test' }),
      domanda('a1', 't1', { tipo: 'shell', comando: 'npm test' }),
    ]);
    const card = chat.locator('.talos-activity--segment').first();
    const testa = card.locator('.talos-activity__head');
    const tempo = testa.locator('.talos-activity__tempo');
    await expect(testa.locator('.talos-activity__conteggi')).toContainText(/aspetta il tuo consenso/iu);
    await page.waitForTimeout(1100);
    await page.evaluate(() => {
      const runtime = window.__talosHarnessUiRuntime;
      runtime.handleRealEvent({ type: 'ApprovalResolved', requestId: 'a1', approvato: true, _sequenza: 100 }, runtime.realSessionState.generation);
    });
    // N1: il comando approvato gira — la card è viva e occupata, e i secondi della testa scorrono
    await expect(card).toHaveAttribute('data-stato', 'vivo');
    await expect(card).toHaveAttribute('aria-busy', 'true');
    await expect(testa.locator('.talos-dot--live')).toHaveCount(1);
    const durante1 = (await tempo.textContent()) || '';
    await page.waitForTimeout(2300);
    const durante2 = (await tempo.textContent()) || '';
    await foto(page, `175-dopo-il-si-${tema}`);
    expect(durante2, `i secondi scorrono dopo il sì: «${durante1}» → «${durante2}»`).not.toBe(durante1);
    // N2: il comando finisce, il giro finisce — l'ora di fine si fissa e la durata non cresce più
    await page.evaluate(() => {
      const runtime = window.__talosHarnessUiRuntime;
      const g = runtime.realSessionState.generation;
      runtime.handleRealEvent({ type: 'ToolCallResult', toolCallId: 't1', content: 'ok', _sequenza: 101 }, g);
      runtime.handleRealEvent({ type: 'RunFinished', _sequenza: 102 }, g);
    });
    await expect(card).toHaveAttribute('data-stato', 'concluso');
    await expect(card).toHaveAttribute('aria-busy', 'false');
    await expect(testa.locator('.talos-dot--live')).toHaveCount(0);
    const fine1 = (await tempo.textContent()) || '';
    expect(fine1).toMatch(/\d/u);
    await page.waitForTimeout(2300);
    await ridisegna(page);
    expect((await tempo.textContent()) || '', 'la durata è ferma all’ora di fine').toBe(fine1);
    const annunciato = await page.evaluate(() => document.getElementById('talosAnnunciAttivita')?.textContent ?? '');
    expect(annunciato, 'la fine vera si annuncia').toContain('conclusa');
  });

  test(`UX175-NO (${tema}) — negato il consenso, la chiamata finisce dall'attesa: l'ora di fine resta ferma (N2, mutante R8/BR6)`, async ({ page }) => {
    await apri(page, tema);
    const chat = await inChat(page, [
      avvio,
      ...chiamata('t1', 'shell', { comando: 'rm -rf build' }),
      domanda('a1', 't1', { tipo: 'shell', comando: 'rm -rf build' }),
    ]);
    const card = chat.locator('.talos-activity--segment').first();
    const tempo = card.locator('.talos-activity__head .talos-activity__tempo');
    await page.waitForTimeout(1100);
    await page.evaluate(() => {
      const runtime = window.__talosHarnessUiRuntime;
      const g = runtime.realSessionState.generation;
      runtime.handleRealEvent({ type: 'ApprovalResolved', requestId: 'a1', approvato: false, _sequenza: 100 }, g);
      runtime.handleRealEvent({ type: 'ToolCallResult', toolCallId: 't1', content: 'Denied.', _sequenza: 101 }, g);
    });
    await expect(card).not.toHaveAttribute('data-stato', 'vivo');
    await expect(card).toHaveAttribute('aria-busy', 'false');
    const fine1 = (await tempo.textContent()) || '';
    expect(fine1).toMatch(/\d/u);
    await page.waitForTimeout(2300);
    await ridisegna(page);
    expect((await tempo.textContent()) || '', 'la durata è ferma all’ora di fine, non cresce fino ad «adesso»').toBe(fine1);
    await foto(page, `175-negato-${tema}`);
  });

  test(`UXE-B5 (${tema}) — un grassetto attorno a un codice: codice in grassetto, senza apici inversi`, async ({ page }) => {
    await apri(page, tema);
    const chat = await inChat(page, [
      avvio,
      { type: 'TextMessageStart', messageId: 'uxe-m1', role: 'assistant' },
      { type: 'TextMessageContent', messageId: 'uxe-m1', delta: 'Per controllare la versione lancia **`node --version`** e poi **leggi _bene_ l\'uscita**.' },
      { type: 'TextMessageEnd', messageId: 'uxe-m1' },
      { type: 'RunFinished' },
    ]);
    const forte = chat.locator('strong', { hasText: 'node --version' }).first();
    await expect(forte).toBeVisible();
    await page.waitForTimeout(300);
    await foto(page, `5-grassetto-codice-${tema}`);
    await expect(forte.locator('code')).toHaveText('node --version');
    await expect(forte).not.toContainText('`');
    await expect(chat.locator('strong em', { hasText: 'bene' })).toHaveCount(1);
  });
}
