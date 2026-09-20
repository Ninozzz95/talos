import { test, expect } from '@playwright/test';
const models = ['locale-a', 'locale-b'].map(id => ({ id, name:id, repo:'local-upload', state:'ready', bytes:1024,
  files:[{path:id+'.gguf',bytes:1024}], path:'C:/modelli/'+id, license:'unknown' }));
const envelope = data => ({json:{ok:true,data}});
async function prepare(page, { modelId='locale-b', fail=false }={}) {
  const state={modelId,fail,requests:[],pending:null,mutations:[]};
  await page.route('**/api/v1/**', route => {
    if(route.request().method()!=='GET') { state.mutations.push(route.request().url()); return route.abort(); }
    return route.fallback();
  });
  await page.route('**/api/v1/runtime', route=>route.fulfill(envelope({items:[{
    runtimeId:'llama.cpp',state:'observed',runtimeState:state.modelId?'ready':'idle',modelId:state.modelId,
    models:models.map(m=>({id:m.id,name:m.name}))
  }]})));
  await page.route('**/api/v1/local-models',route=>route.fulfill(envelope({items:models})));
  await page.route('**/api/v1/model-lab/capacity**',route=>route.fulfill(envelope({memory:{},storage:{}})));
  await page.route('**/api/v1/runtime/unload',async route=>{
    state.requests.push({method:route.request().method(),body:route.request().postDataJSON()});
    if(state.fail) return route.fulfill({status:409,json:{ok:false,error:{code:'MODEL_LOCKED',message:'Il modello è in uso. Riprova dopo il turno.'}}});
    state.pending=route;
  });
  await page.addInitScript(()=>{try{localStorage.setItem('talos.harness.desktop.settings.v1',JSON.stringify({
    version:1,appearance:{colorMode:'dark',themePreset:'calm',themePresetVersione:2,uiLanguage:'it'}}));}catch{}});
  return state;
}
async function lab(page) {
  await page.goto('/');
  await expect(page.locator('#talosAvvio')).toHaveCount(0);
  const voice=page.locator('.talos-sidebar [data-vaia="impostazioni"]');
  const group=await voice.evaluate(e=>e.closest('.td-nav-group')?.id);
  if(group){const toggle=page.locator(`.talos-sidebar [aria-controls="${group}"]`);if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();}
  await voice.click();
  await page.locator('#setting-tab-models').click();
  await page.locator('#labSchedaModels').click();
}
async function local(page,id='locale-b'){
  await page.goto('/#/impostazioni/modelli/scheda/'+id+'/card');
  await expect(page.locator('#talosAvvio')).toHaveCount(0);
  await expect(page.locator('#paginaModello [data-modello-nome]')).toBeVisible();
}
async function finish(state){
  await expect.poll(()=>!!state.pending).toBe(true);
  state.modelId=null;
  await state.pending.fulfill(envelope({runtimeId:'llama.cpp',state:'idle'}));
  state.pending=null;
}
for(const width of [1024,1440])test(`RIPRESA-MEMORIA-GLOBALE ${width}`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:900});
  const state=await prepare(page); await lab(page);
  const button=page.locator('#modelLabLiberaMemoria');
  await expect(button).toBeVisible(); await expect(button).toBeEnabled();
  await page.screenshot({path:testInfo.outputPath('lab-libera-memoria.png'),fullPage:true});
  const bounds=await button.boundingBox();expect(bounds.x+bounds.width).toBeLessThanOrEqual(width);
  await button.click();await expect(button).toBeDisabled();
  await button.evaluate(e=>e.click());
  await finish(state);
  await expect(button).toHaveText('Libera memoria');await expect(button).toBeDisabled();
  expect(state.requests).toEqual([{method:'POST',body:{runtimeId:'llama.cpp'}}]);
  expect(state.mutations).toEqual([]);
});
test('RIPRESA-MEMORIA-LOCALE — identità osservata, scaricamento e file conservati',async({page},testInfo)=>{
  const state=await prepare(page);await local(page);
  const button=page.locator('#paginaModello [data-modello-libera-memoria]');
  await expect(button).toBeEnabled();
  await expect(page.locator('#paginaModello')).toContainText('Il file resta sul disco');
  await page.screenshot({path:testInfo.outputPath('modello-libera-memoria.png'),fullPage:true});
  await button.click();await expect(button).toBeDisabled();await finish(state);
  await expect(button).toBeDisabled();await expect(page.locator('#paginaModello')).toContainText('Non caricato in memoria');
  await page.locator('#paginaModello [role="tab"]').nth(1).click();
  await expect(page.locator('#paginaModello')).toContainText('locale-b.gguf');
  await page.reload();await expect(page.locator('#talosAvvio')).toHaveCount(0);
  await expect(button).toBeDisabled();
  expect(state.requests).toHaveLength(1);expect(state.mutations).toEqual([]);
});
test('RIPRESA-MEMORIA-ERRORE — errore leggibile e riprova',async({page})=>{
  const state=await prepare(page,{fail:true});await local(page);
  const button=page.locator('#paginaModello [data-modello-libera-memoria]');
  await button.click();await expect(page.getByText('Memoria non liberata',{exact:true})).toBeVisible();
  await expect(button).toBeEnabled();
  state.fail=false;await button.click();await finish(state);await expect(button).toBeDisabled();
  expect(state.requests).toHaveLength(2);expect(state.mutations).toEqual([]);
});
test('RIPRESA-MEMORIA-IDENTITA — il primo modello del selettore non è quello caricato',async({page})=>{
  const state=await prepare(page);await local(page,'locale-a');
  const button=page.locator('#paginaModello [data-modello-libera-memoria]');
  await expect(button).toBeVisible();await expect(button).toBeDisabled();
  await expect(page.locator('#paginaModello')).toContainText('Non caricato in memoria');
  expect(state.requests).toEqual([]);
});

test('RIPRESA-MEMORIA-INSTALLATI — azione locale e RAM non misurata',async({page})=>{
  const state=await prepare(page);await lab(page);
  await page.locator('[data-settings-add-model]').click();
  await page.locator('#settingsAddModel [data-settings-road="file"]').click();
  const panel=page.locator('#modelLabInstalledPanel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Modello in memoria · uso RAM non misurato');
  await panel.locator('[data-model="locale-b"]').click();
  const button=panel.locator('#azioneModello');
  await expect(button).toHaveText('Libera memoria');await button.click();
  await expect(button).toBeDisabled();await finish(state);
  await expect(button).toHaveText('Verifica compatibilità');
  await expect(panel.locator('[data-model]')).toHaveCount(2);
  expect(state.requests).toEqual([{method:'POST',body:{runtimeId:'llama.cpp'}}]);
  expect(state.mutations).toEqual([]);
});
