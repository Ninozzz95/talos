import {CAMPI_IMPOSTAZIONI} from '../../src/components/impostazioni-campi.js';
import {test,expect} from '@playwright/test';import {mkdir} from 'node:fs/promises';import path from 'node:path';
const APP='http://127.0.0.1:4177',ORIG='http://127.0.0.1:4179',FOTO=path.resolve('artifacts/astra-fase2/Impostazioni');
async function foto(page,n,info){await mkdir(FOTO,{recursive:true});await page.screenshot({path:path.join(FOTO,n+'-'+info.project.use.viewport.width+'.png'),animations:'disabled'});}
async function pronta(page,url){page.on('pageerror',e=>{console.error('SET-BOOT:',e.stack);});await page.goto(url);const b=page.getByRole('button',{name:'Salta per ora',exact:true});if(await b.isVisible())await b.click();await expect(page.getByRole('textbox',{name:'Messaggio',exact:true})).toBeVisible();await page.getByRole('button',{name:/^Impostazioni(?: \(Ctrl ,\))?$/}).click();}
test('SET-ORIGINALE: esamino tutte le impostazioni che devo ritrovare',async({page},info)=>{
 await pronta(page,ORIG);const nomi={appearance:'Aspetto e movimento',chat:'Chat e composer',providers:'Provider e accessi',tools:'Strumenti agente e permessi',privacy:'Privacy e dati locali',workspace:'File e workspace',account:'Account, Doctor e backup'};
 for(const [id,nome] of Object.entries(nomi)){await page.getByRole('tab',{name:nome,exact:true}).click();if(id==='providers')await expect(page.locator('#settingsProvidersList')).toContainText('OpenAI');if(id==='tools')await expect(page.locator('#searchSourceMount')).toContainText('DuckDuckGo');await foto(page,'originale-'+id,info);if(id==='appearance'){await page.locator('#motionModeSelect').scrollIntoViewIfNeeded();await foto(page,'originale-movimento',info);await page.locator('#immersiveHeaderToggle').scrollIntoViewIfNeeded();await foto(page,'originale-animazioni',info);}}
});
test('SET-PERSISTENZA: ritrovo la mia preferenza dopo aver ricaricato',async({page},info)=>{await pronta(page,APP);const s=page.locator('#schermoImpostazioni');await s.getByRole('tab',{name:'Aspetto e movimento',exact:true}).click();const campo=s.getByRole('combobox',{name:'Modalità colore',exact:true});await campo.selectOption('dark');await expect(page.locator('html')).not.toHaveAttribute('data-theme','light');await page.reload();await page.getByRole('button',{name:/^Impostazioni(?: \(Ctrl ,\))?$/}).click();await expect(campo).toHaveValue('dark');await foto(page,'app-aspetto',info);});

test('SET-COPERTURA38 e SET-SLIDER-NOME: cambio le preferenze con controlli riconoscibili e le ritrovo',async({page})=>{
 await pronta(page,APP);const s=page.locator('#schermoImpostazioni');await expect(s.locator('[data-setting-row]')).toHaveCount(38);
 for(const c of CAMPI_IMPOSTAZIONI){await s.locator('[data-settings-tab='+c.sezione+']').click();const el=s.locator('#'+c.id);await expect(page.locator('#'+c.id)).toHaveCount(1);await expect(el).toHaveAccessibleName(c.titolo);if(c.tipo==='select'){await expect(el.locator('option')).toHaveCount(c.opzioni.length);const prima=await el.inputValue();await el.selectOption(c.opzioni.find(([v])=>v!==prima)[0]);}else if(c.tipo==='checkbox'){await el.setChecked(!(await el.isChecked()));}else {await el.focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');await expect(el).toHaveValue(String(c.min+1));}}
 const letti=await s.locator('[data-setting-row] input,[data-setting-row] select').evaluateAll(ns=>ns.map(n=>({id:n.id,value:n.type==='checkbox'?n.checked:n.value})));
 await page.reload();await page.getByRole('button',{name:/^Impostazioni(?: \(Ctrl ,\))?$/}).click();
 for(const n of letti){const el=s.locator('#'+n.id);if(typeof n.value==='boolean')await expect(el).toBeChecked({checked:n.value});else await expect(el).toHaveValue(n.value);}
});
test('SET-RICERCA e SET-TASTIERA: trovo una preferenza e cambio sezione senza mouse',async({page},info)=>{
 await pronta(page,APP);const s=page.locator('#schermoImpostazioni'),q=s.getByRole('textbox',{name:'Cerca un’impostazione'});
 await q.fill('bilanciata');await expect(s.locator('[data-setting-row]:visible')).toHaveCount(1);await expect(s.getByRole('combobox',{name:'Qualità',exact:true})).toBeVisible();await foto(page,'app-ricerca',info);
 await q.fill('zz-preferenza-assente');await expect(s.locator('[data-settings-results]')).toContainText('Nessuna preferenza');await expect(s.locator('[data-setting-row]:visible')).toHaveCount(0);await q.fill('');
 const prima=s.getByRole('tab',{name:'Aspetto e movimento',exact:true});await prima.focus();await page.keyboard.press('ArrowDown');await expect(s.getByRole('tab',{name:'Chat e composer',exact:true})).toBeFocused();await expect(s.getByRole('tabpanel',{name:'Chat e composer',exact:true})).toBeVisible();
 await page.keyboard.press('End');await expect(s.getByRole('tab',{name:'Account, Doctor e backup'})).toBeFocused();await page.keyboard.press('Home');await expect(prima).toBeFocused();await expect(prima).toHaveAttribute('aria-selected','true');
});
test('SET-RIEPILOGO-INTEGRO: leggo i dati e raggiungo Doctor',async({page},info)=>{
 await pronta(page,APP);const s=page.locator('#schermoImpostazioni');
 for(const id of ['chat','providers','tools','privacy','workspace','account']){await s.locator('[data-settings-tab='+id+']').click();if(id==='providers'){await expect(s.locator('#settingsProvidersList')).toContainText('OpenAI');await expect(s.locator('#settingsProvidersList li').filter({hasText:'Ollama Local'})).toContainText('runtime locale');}if(id==='tools'){await expect(s.locator('#settingsToolsFacts')).toContainText('Sessione');await expect(s.locator('#settingsToolsFacts .talos-kv__v').last()).toHaveCSS('white-space','normal');}await foto(page,'app-'+id,info);}
 await s.getByRole('button',{name:'Doctor',exact:true}).click();await expect(page.locator('#schermoDoctor [data-doctor-esito]')).toContainText('controll');
});
test('SET-MOVIMENTO: regolo un cursore e ripristino il movimento senza perdere il tema',async({page},info)=>{
 await pronta(page,APP);const s=page.locator('#schermoImpostazioni');const tema=s.getByRole('combobox',{name:'Tema TALOS',exact:true});await tema.selectOption('noir');const velocita=s.getByRole('slider',{name:'Velocità',exact:true});await velocita.focus();await page.keyboard.press('End');await expect(velocita).toHaveValue('200');await expect(s.locator('#motionSpeedOutput')).toHaveText('200');await foto(page,'app-movimento',info);
 await s.getByRole('button',{name:'Ripristina movimento',exact:true}).click();await expect(velocita).toHaveValue('100');await expect(s.locator('#motionSpeedOutput')).toHaveText('100');await expect(tema).toHaveValue('noir');await foto(page,'app-animazioni',info);
});

test('SET-RACCORDO-ATTRIBUTI: le mie preferenze raggiungono il disegno della chat',async({page})=>{
 await pronta(page,APP);const s=page.locator('#schermoImpostazioni'),root=page.locator('html');await s.getByRole('tab',{name:'Aspetto e movimento',exact:true}).click();
 for(const [id,value] of [['uiFontScaleSelect','large'],['chatFontScaleSelect','expanded'],['messageStyleSelect','bubbles'],['composerShapeSelect','compact']])await s.locator('#'+id).selectOption(value);
 await s.locator('#immersiveHeaderToggle').setChecked(true);await s.locator('#reducedMotionToggle').setChecked(true);await s.getByRole('tab',{name:'Chat e composer',exact:true}).click();await s.locator('#chatFullWidthToggle').setChecked(true);
 for(const dopo of [false,true]){if(dopo)await page.reload();await expect(root).toHaveAttribute('data-talos-message-style','bubbles');await expect(root).toHaveAttribute('data-talos-composer-shape','compact');await expect(root).toHaveClass(/chat-full-width/);await expect(root).toHaveClass(/immersive-header/);await expect(page.locator('body')).toHaveClass(/reduce-motion/);expect(await root.evaluate(n=>n.style.getPropertyValue('--talos-ui-font-scale'))).toBe('1.15');expect(await root.evaluate(n=>n.style.getPropertyValue('--talos-chat-font-size'))).toBe('1.1875rem');}
});
