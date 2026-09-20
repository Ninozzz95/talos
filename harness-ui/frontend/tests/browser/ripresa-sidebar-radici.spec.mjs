import { expect, test } from '@playwright/test';

test('RIPRESA-SIDEBAR-SOLO-PADRI — ricerca, refresh, selezione e catalogo completo', async ({ page }) => {
  const row=(id,padreId=null)=>({sessionId:id,padreId,nome:id,taskId:'workspace',modello:'local:prova',conclusa:true,avviataAlle:'2026-09-19T10:00:00Z'});
  let items=[row('radice-Beta'),row('radice-Alfa'),row('figlio','radice-Alfa'),row('nipote','figlio'),row('orfano','assente')];
  items.find(s=>s.sessionId==='radice-Beta').avviataAlle='2026-09-19T11:00:00Z';
  items.find(s=>s.sessionId==='figlio').conclusa=false;
  await page.route(u=>u.pathname==='/api/v1/sessions',r=>r.fulfill({json:{ok:true,data:{items}}}));
  await page.route('**/api/v1/sessions/*/events*',r=>r.fulfill({contentType:'text/event-stream',body:''}));
  await page.route('**/api/v1/sessions/*/children',r=>r.fulfill({json:{ok:true,data:{figli:[]}}}));
  await page.goto('/');
  const rows=page.locator('.real-session-item');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toHaveAttribute('data-real-session-id','radice-Alfa');
  await expect(page.locator('[data-real-session-id="figlio"]')).toHaveCount(0);
  await expect(page.locator('.talos-session-item--figlia')).toHaveCount(0);
  await expect(page.locator('#sessionList .talos-sidebar__block-head .talos-nav-item__count')).toHaveText('2');
  await page.locator('#sessionSearch').fill('Alfa');
  await expect(rows.filter({visible:true})).toHaveCount(1);
  items.push(row('figlio-nuovo','radice-Alfa'));
  await page.evaluate(()=>window.__talosHarnessUiRuntime.aggiornaElencoSessioniReali());
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({visible:true})).toHaveCount(1);
  await page.locator('#sessionSearch').fill('Beta');
  await expect(page.locator('.real-session-item[tabindex="0"]')).toHaveAttribute('data-real-session-id','radice-Beta');
  await page.locator('.real-session-item[tabindex="0"]').focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('[data-real-session-id="radice-Beta"]')).toBeFocused();
  await page.locator('#sessionSearch').fill('');
  await page.locator('#sessionSelectionToggle').click();
  await expect(page.locator('[data-session-select]')).toHaveCount(2);
  await page.locator('#sessionSelectionSelectAll').click();
  await expect(page.locator('[data-session-select]:checked')).toHaveCount(2);
  await expect(page.locator('#sessionSelectionCount')).toHaveText('2 selezionate');
  await page.locator('#sessionSelectionToggle').click();
  // Apertura agente da una superficie dedicata: il contratto resta nel catalogo completo.
  await page.evaluate(()=>window.__talosHarnessUiRuntime.passaASessione('figlio','workspace',null,null));
  await expect.poll(()=>page.evaluate(()=>window.__talosHarnessUiRuntime.realSessionState.id)).toBe('figlio');
  await expect(page.locator('#sessionTitle')).toHaveText('figlio');
  await page.evaluate(()=>window.__talosHarnessUiRuntime.aggiornaElencoSessioniReali());
  await expect(rows).toHaveCount(2);
  await page.reload(); await expect(rows).toHaveCount(2);
});


test('RIPRESA-SIDEBAR-PENDENTE — ricerca conservata con zero sessioni salvate', async ({ page }) => {
  const launchId='B'.repeat(32);
  await page.route(u=>u.pathname==='/api/v1/sessions',r=>r.fulfill({json:{ok:true,data:{items:[]}}}));
  await page.route(`**/api/v1/workspace-launches/${launchId}`,r=>r.fulfill({json:{ok:true,data:{id:launchId,nome:'Progetto filtro',scadeAlle:'2026-09-19T23:59:59Z'}}}));
  await page.goto(`/#open-workspace=${launchId}`);
  await page.getByRole('button',{name:'Continua nella chat — Progetto filtro',exact:true}).click();
  await expect(page.getByRole('button',{name:'Continua nella chat — Progetto filtro',exact:true})).toBeHidden();
  await page.locator('#talosAvvio').waitFor({state:'detached'});
  const pending=page.locator('.real-session-item.is-pending');
  await expect(pending).toBeVisible();
  await page.locator('#sessionSearch').fill('nessuna-corrispondenza');
  await expect(page.locator('#sessionSearch')).toHaveValue('nessuna-corrispondenza');
  await expect(pending).toBeHidden();
  await page.evaluate(()=>window.__talosHarnessUiRuntime.aggiornaElencoSessioniReali());
  await expect(pending).toBeHidden();
  await page.locator('#sessionSearch').fill('Progetto');
  await expect(pending).toBeVisible();
});
