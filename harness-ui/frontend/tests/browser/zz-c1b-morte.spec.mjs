import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';

/*
 * C1b — sonda manuale (TALOS_C1B_MISURA=1, TALOS_C1B_PROFILO=<parte del percorso del profilo del server di prova>). Il Chromium
 * pilotato dal server muore mentre la persona usa il Browser: la pagina dopo deve aprirsi lo stesso, su un Chromium nuovo.
 * Si uccide SOLO il processo radice il cui `--user-data-dir` contiene il profilo del server di prova e il cui genitore è un
 * `node server.mjs`: mai un altro Chrome.
 */
test.skip(!process.env.TALOS_C1B_MISURA || !process.env.TALOS_C1B_PROFILO, 'manual probe');

function chromiumDelServer(profilo) {
  const copione = `
$tutti = Get-CimInstance Win32_Process
$porta = @{}; foreach ($p in $tutti) { $porta[[int]$p.ProcessId] = $p }
$tutti | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('${profilo.replace(/'/g, "''")}') -and $_.CommandLine -notmatch '--type=' } | ForEach-Object {
  $g = $porta[[int]$_.ParentProcessId]
  [pscustomobject]@{ pid = $_.ProcessId; genitore = $_.ParentProcessId; genitoreCmd = if ($g) { $g.CommandLine } else { '' } }
} | ConvertTo-Json -Compress`;
  // su questa macchina PowerShell a volte non parte («Avvio di CLR non riuscito», 80004005): è la sonda, non il prodotto, e si ritenta
  let uscita = null;
  for (let tentativo = 1; uscita === null; tentativo++) {
    try { uscita = execFileSync('powershell', ['-NoProfile', '-Command', copione], { encoding: 'utf8' }).trim(); } catch (e) { if (tentativo >= 3) throw e; }
  }
  if (!uscita) return [];
  const righe = JSON.parse(uscita);
  return (Array.isArray(righe) ? righe : [righe]).filter((r) => /node(\.exe)?"?\s+server\.mjs/u.test(r.genitoreCmd || ''));
}

async function apriEaspetta(page, url) {
  await page.locator('#urlBrowser').fill(url);
  await page.locator('#urlBrowser').press('Enter');
  const t0 = Date.now();
  await expect.poll(async () => page.evaluate(() => {
    const viva = document.querySelector('#browserVistaViva .talos-vistaviva');
    if (viva && !document.querySelector('#browserVistaViva').hidden && viva.dataset.stato === 'pronto') return 'vivo';
    const p = document.querySelector('#browserStatoScheda');
    return p && !p.hidden ? `pannello: ${p.textContent.replace(/\s+/g, ' ').trim().slice(0, 160)}` : null;
  }), { timeout: 25_000, intervals: [250] }).toBe('vivo');
  return Date.now() - t0;
}

test('C1B-MORTE — the piloted Chromium dies: the next page opens on a new one', async ({ page }) => {
  test.setTimeout(120_000);
  const tema = process.env.TALOS_C1B_TEMA || 'light'; // il tema si sceglie dalla preferenza salvata, come una persona: mai forzando l'attributo
  await page.emulateMedia({ colorScheme: tema });
  await page.addInitScript((colorMode) => { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } })); }, tema);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await page.locator('#schermoChat [data-vaia="browser"]').first().click();
  await page.locator('#schermoBrowser').waitFor({ state: 'visible' });

  const msPrima = await apriEaspetta(page, 'https://github.com/');
  /* un'altra chat ha il Browser aperto: la sua scheda tiene in vita la finestra, e chiudere la nostra non basta più a portare via
     il Chromium morto (con una scheda sola il difetto si nascondeva: misurato, la sonda passava anche senza la cura) */
  const altra = await page.evaluate(async () => {
    const r = await fetch('/api/v1/browser/vivo/apri?sessione=c1b-altra-chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://example.com/' }) });
    return { stato: r.status, corpo: await r.json().catch(() => null) };
  });
  expect(altra.stato, JSON.stringify(altra)).toBe(200);
  const prima = chromiumDelServer(process.env.TALOS_C1B_PROFILO);
  expect(prima.length, 'exactly one piloted Chromium, child of the test server').toBe(1);
  const senzaMorte = Boolean(process.env.TALOS_C1B_SENZA_MORTE); // giro di controllo: tutto uguale, il browser resta vivo
  if (!senzaMorte) {
    execFileSync('taskkill', ['/PID', String(prima[0].pid), '/T', '/F']);
    await expect.poll(() => chromiumDelServer(process.env.TALOS_C1B_PROFILO).length, { timeout: 10_000 }).toBe(0);
  }

  const msDopo = await apriEaspetta(page, 'https://www.python.org/');
  const dopo = chromiumDelServer(process.env.TALOS_C1B_PROFILO);
  expect(dopo.length).toBe(1);
  if (!senzaMorte) expect(dopo[0].pid).not.toBe(prima[0].pid);
  console.log('C1B-MORTE', JSON.stringify({ msPrima, ucciso: prima[0].pid, msDopo, nuovo: dopo[0].pid }));
  const cartella = process.env.TALOS_FOTO_DIR || test.info().outputPath('');
  await page.screenshot({ path: `${cartella}/c1b-dopo-la-morte-${tema}.png` });

  /* la scheda aperta PRIMA della morte resta nella barra: il server l'ha dimenticata col suo browser. Tornarci deve mostrare la
     pagina (riaperta), non un errore */
  await page.locator('#browserSchede [role="tab"]').filter({ hasText: 'github' }).first().click();
  const t0 = Date.now();
  const esitoRitorno = await expect.poll(async () => page.evaluate(() => {
    const viva = document.querySelector('#browserVistaViva .talos-vistaviva');
    const url = document.querySelector('#urlBrowser')?.value || '';
    if (viva && !document.querySelector('#browserVistaViva').hidden && viva.dataset.stato === 'pronto' && url.includes('github')) return 'vivo';
    const p = document.querySelector('#browserStatoScheda');
    return p && !p.hidden ? `pannello: ${p.textContent.replace(/\s+/g, ' ').trim().slice(0, 160)}` : `attesa: ${viva?.dataset.stato ?? '-'} ${url}`;
  }), { timeout: 25_000, intervals: [250] }).toBe('vivo').then(() => 'ok', (e) => String(e.message).split('\n').find((r) => r.includes('Received')) || 'ko');
  console.log('C1B-RITORNO', JSON.stringify({ esito: esitoRitorno, ms: Date.now() - t0 }));
  await page.screenshot({ path: `${cartella}/c1b-ritorno-alla-scheda-${tema}.png` });
  // la scheda in pausa: «Riprova» deve riaprirla dov'era
  let esitoRiprova = 'non serviva';
  if (esitoRitorno !== 'ok') {
    await page.locator('#browserStatoScheda [data-stato-riprova]').click();
    const t1 = Date.now();
    esitoRiprova = await expect.poll(async () => page.evaluate(() => {
      const viva = document.querySelector('#browserVistaViva .talos-vistaviva');
      const p = document.querySelector('#browserStatoScheda');
      if (viva && !document.querySelector('#browserVistaViva').hidden && viva.dataset.stato === 'pronto' && (!p || p.hidden)) return 'vivo';
      return p && !p.hidden ? 'pannello: ' + p.textContent.replace(/\s+/g, ' ').trim().slice(0, 120) : 'attesa';
    }), { timeout: 25_000, intervals: [250] }).toBe('vivo').then(() => 'ok in ' + (Date.now() - t1) + ' ms', (e) => String(e.message).split('\n').find((r) => r.includes('Received')) || 'ko');
    console.log('C1B-RIPROVA', JSON.stringify({ esitoRiprova }));
    await page.screenshot({ path: `${cartella}/c1b-dopo-riprova-${tema}.png` });
  }
  expect(esitoRitorno).toBe('ok');
});
