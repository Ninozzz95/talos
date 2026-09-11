/** BC-03 — il «…» della card apre davvero il menu, a schermo, nei due temi. */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const { chromium } = await import('file:///C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/harness-ui/frontend/node_modules/@playwright/test/index.mjs');
const FUORI = process.argv[2];
const b = await chromium.launch();
for (const tema of ['dark', 'light']) {
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: tema, deviceScaleFactor: 2 })).newPage();
  await p.goto('http://127.0.0.1:4198', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2600);
  await p.locator('.real-session-item[data-real-session-id="aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"]').first().click();
  await p.waitForTimeout(1300);
  await p.locator('[data-rail="agenti"]:visible').first().click();
  await p.waitForTimeout(700);
  const piu = p.locator('#railAgenti button[data-azione="menu"]:visible').first();
  console.log(tema, 'bottoni «…»:', await p.locator('#railAgenti button[data-azione="menu"]:visible').count());
  await piu.click();
  await p.waitForTimeout(800);
  const voci = await p.evaluate(() => [...document.querySelectorAll('[role="menu"], [role="menuitem"], .talos-menu, .talos-menu__voce')].filter(e => e.offsetParent).map(e => e.innerText.replace(/\s+/g,' ').trim()).filter(Boolean));
  writeFileSync(join(FUORI, `menu-${tema}.txt`), JSON.stringify(voci, null, 1), 'utf8');
  console.log(tema, 'voci:', JSON.stringify(voci));
  await p.screenshot({ path: join(FUORI, `menu-delega-${tema}.png`) });
  await p.context().close();
}
await b.close();
