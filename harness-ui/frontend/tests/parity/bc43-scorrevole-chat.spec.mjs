import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const fase = process.env.BC43_FASE || 'dopo';
const foto = fileURLToPath(new URL('../../../.claude/foto-bc43-2026-09-12/', import.meta.url));
async function registra(nome, valore) {
  const file = `${foto}/misure-${fase}.json`;
  let misure = {};
  try { misure = JSON.parse(await readFile(file, 'utf8')); } catch { /* prima misura */ }
  misure[nome] = valore;
  await writeFile(file, JSON.stringify(misure, null, 2));
}
async function apri(page, tema = 'light') {
  await page.addInitScript(tema => {
    if (window !== window.top) return; // Le anteprime isolate non ricevono le preferenze del banco.
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: tema, reducedMotion: false } }));
  }, tema);
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => window.__talosHarnessUiRuntime.passaASessione('bc43-prova-1', 'prova', 'Lettura della conversazione', 'Modello di prova', { conclusa: true }));
  await expect(page.locator('#conversation')).toContainText('Passaggio 28');
  await expect(page.locator('#conversation')).not.toHaveClass(/is-restoring/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
}

for (const [tema, nome] of [['light', 'chiaro'], ['dark', 'scuro']]) {
  test(`BC43-FOTO — ritorno in fondo con movimento ridotto, ${nome}`, async ({ page }) => {
    await apri(page, tema);
    const scorrevole = page.locator('.talos-conversation.conversation');
    await scorrevole.hover();
    await page.mouse.wheel(0, -20000);
    await expect.poll(() => scorrevole.evaluate(n => n.scrollTop)).toBe(0);
    const bottone = page.getByRole('button', { name: 'Torna in fondo alla conversazione', exact: true });
    await expect(bottone).toBeVisible();
    await bottone.focus();
    const misura = await page.evaluate(() => {
      const colonna = document.getElementById('conversation');
      const scorrevole = document.querySelector('.talos-conversation.conversation');
      const chiamate = [];
      const originale = scorrevole.scrollTo;
      scorrevole.scrollTo = function(opzioni) { chiamate.push({ ...opzioni }); return originale.call(this, opzioni); };
      const prima = scorrevole.scrollTop;
      document.activeElement.click();
      scorrevole.scrollTo = originale;
      return {
        prima, subito: scorrevole.scrollTop, massimo: scorrevole.scrollHeight - scorrevole.clientHeight,
        altezzaColonna: colonna.clientHeight, altezzaScorrevole: scorrevole.clientHeight,
        colonnaScrollTop: colonna.scrollTop, idColonna: colonna.id, classeScorrevole: scorrevole.classList.contains('conversation'),
        movimentoRidottoSistema: matchMedia('(prefers-reduced-motion: reduce)').matches,
        movimentoRidottoApp: document.body.classList.contains('reduce-motion'), chiamate,
      };
    });
    await page.screenshot({ path: `${foto}/${fase}-${nome}-1440x900.png` });
    misura.allaFoto = await scorrevole.evaluate(n => n.scrollTop);
    await registra(`fondo-${nome}`, misura);
    expect(misura.colonnaScrollTop).toBe(0);
    expect(misura.subito).toBe(misura.massimo);
    expect(misura.chiamate[0].behavior).toBe('instant');
  });
}

test('BC43-VIEWPORT — la spina distingue i turni fuori vista e la colonna conserva il separatore', async ({ page }) => {
  await apri(page);
  await page.evaluate(async () => {
    const { creaTurno, creaMessaggioUtente, aggiornaSeparatoreContesto } = await import('/bc43-componenti.js');
    const colonna = document.getElementById('conversation');
    colonna.replaceChildren();
    for (let i = 0; i < 12; i++) {
      const turno = creaTurno({ numeri: [{ n: i + 1, tick: 1 }] });
      turno.append(creaMessaggioUtente({ testo: `Messaggio ${i + 1}. ` + 'Rileggiamo insieme la conversazione. '.repeat(18) }));
      colonna.append(turno);
    }
    const evento = { sessionId: 'bc43-prova-1', versionId: 'v1', kind: 'context.committed' };
    aggiornaSeparatoreContesto(colonna, [evento, evento], { sessionId: evento.sessionId });
    document.querySelector('.talos-conversation.conversation').scrollTop = 0;
  });
  const numeroVisibili = () => page.locator('.talos-turn-spine__tick--visibile').count();
  await expect.poll(numeroVisibili).toBeGreaterThan(0);
  const misure = await page.evaluate(() => {
    const colonna = document.getElementById('conversation');
    const scorrevole = document.querySelector('.talos-conversation.conversation');
    return {
      turni: colonna.querySelectorAll('.talos-turn').length,
      marcatiVisibili: colonna.querySelectorAll('.talos-turn-spine__tick--visibile').length,
      separatori: colonna.querySelectorAll('[data-context-separator]').length,
      separatoreFiglioColonna: colonna.querySelector('[data-context-separator]').parentElement === colonna,
      altezzaColonna: colonna.clientHeight, altezzaScorrevole: scorrevole.clientHeight, scrollTop: scorrevole.scrollTop,
    };
  });
  await registra('viewport-spina', misure);
  expect(misure.separatori).toBe(1);
  expect(misure.separatoreFiglioColonna).toBe(true);
  expect(misure.marcatiVisibili).toBeLessThan(misure.turni);
  const clic = await page.evaluate(() => {
    const colonna = document.getElementById('conversation');
    const scorrevole = document.querySelector('.talos-conversation.conversation');
    colonna.querySelectorAll('.talos-turn-spine__tick')[7].click();
    return { scrollTop: scorrevole.scrollTop, colonna: colonna.scrollTop, pagina: scrollY, pannello: document.getElementById('schermoChat').scrollTop };
  });
  await registra('clic-spina', clic);
  expect(clic.scrollTop).toBeGreaterThan(0);
  expect([clic.colonna, clic.pagina, clic.pannello]).toEqual([0, 0, 0]);
});

test('BC43-RICARICA — lo storico e il ritorno in fondo sopravvivono al reload, anche stretto', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await apri(page);
  await page.reload();
  await expect(page.locator('#conversation')).toContainText('Passaggio 28');
  await expect(page.locator('#conversation')).not.toHaveClass(/is-restoring/);
  const scorrevole = page.locator('.talos-conversation.conversation');
  await expect.poll(() => scorrevole.evaluate(n => n.scrollTop)).toBeGreaterThan(0);
  await scorrevole.hover();
  await page.mouse.wheel(0, -20000);
  await expect.poll(() => scorrevole.evaluate(n => n.scrollTop)).toBe(0);
  const bottone = page.getByRole('button', { name: 'Torna in fondo alla conversazione', exact: true });
  await expect(bottone).toBeVisible();
  await bottone.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => scorrevole.evaluate(n => Math.abs(n.scrollHeight - n.clientHeight - n.scrollTop))).toBeLessThan(2);
  expect(await page.locator('#conversation').evaluate(n => n.scrollTop)).toBe(0);
});

test('BC43-RETE — registra gli errori del banco senza nasconderli', async ({ page }) => {
  const rete = [];
  const javascript = [];
  page.on('response', risposta => { if (risposta.status() >= 400) rete.push({ percorso: new URL(risposta.url()).pathname, stato: risposta.status() }); });
  page.on('pageerror', errore => javascript.push(errore.message));
  await apri(page);
  await page.locator('.talos-session-item').nth(1).click();
  await page.getByRole('button', { name: 'Scrive nel progetto', exact: true }).first().click();
  await page.keyboard.press('Escape');
  await registra('errori-banco', { rete, javascript });
  expect(javascript).toEqual([]);
});
