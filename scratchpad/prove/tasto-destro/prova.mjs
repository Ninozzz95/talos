/*
 * Owner 10/09: «il tasto destro su una cartella non fa partire TALOS con la modale nuova sessione
 * in quella directory». Lo script PowerShell funziona (produce un URL valido, verificato): la
 * domanda e' se la PAGINA, ricevendo `#open-workspace=<id>`, apre la modale con quella cartella.
 * ⛔ Sola lettura: nessun giro avviato. La prenotazione e' monouso e la consuma la pagina.
 */
import { chromium } from '../../../harness-ui/frontend/node_modules/@playwright/test/index.mjs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const output = resolve('scratchpad/prove/tasto-destro');

/* Si chiede l'URL allo STESSO script che Windows lancia dal menu: se cambia lui, cambia la prova. */
const grezzo = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
  'harness-ui/scripts/windows/open-with-talos.ps1', '-BaseUrl', 'http://127.0.0.1:4174',
  '-WorkspacePath', process.argv[2] ?? process.cwd(), '-NoBrowser'], { encoding: 'utf8' });
const { url, workspaceName } = JSON.parse(grezzo.trim());
console.log('lo script dice:', url, '·', workspaceName);

const b = await chromium.launch({ headless: true });
try {
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await c.addInitScript(() => localStorage.setItem('talos.harness.desktop.intro.v1', JSON.stringify({ esito: 'saltata' })));
  const p = await c.newPage();
  const errori = [];
  p.on('console', (m) => { if (m.type() === 'error') errori.push(m.text().slice(0, 200)); });
  p.on('pageerror', (e) => errori.push('pageerror: ' + e.message.slice(0, 200)));
  await p.goto(url);
  await p.waitForTimeout(6000);
  const stato = await p.evaluate(() => {
    const velo = [...document.querySelectorAll('dialog, .talos-velo, [data-c="Modal"], #veloNuovaSessione')]
      .find((n) => n.open || getComputedStyle(n).display !== 'none');
    return {
      hashRimasto: location.hash,
      modaleAperta: Boolean(velo),
      titoloModale: velo?.querySelector('h1,h2,h3')?.textContent?.trim() ?? null,
      cartellaMostrata: velo?.textContent?.match(/[A-Za-z]:\[^\s"']+/)?.[0] ?? null,
      testoModale: velo ? velo.textContent.replace(/\s+/g, ' ').trim().slice(0, 160) : null,
    };
  });
  console.log(JSON.stringify(stato, null, 2));
  if (errori.length) console.log('⛔ errori in pagina:\n  ' + errori.slice(0, 4).join('\n  '));
  await p.screenshot({ path: resolve(output, 'dopo-il-tasto-destro.png') });
} finally { await b.close(); }
