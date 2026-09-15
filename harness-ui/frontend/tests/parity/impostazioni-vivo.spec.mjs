import {CAMPI_IMPOSTAZIONI} from '../../src/components/impostazioni-campi.js';
import {CONTROLLI_MIGRATI} from '../../src/components/theme-studio.js';
/*
 * ⛔ 12/09/2026 — QUATTORDICI PREFERENZE HANNO CAMBIATO POSTO, e questo file le cercava dove non
 *   stanno piu'. Ordine dell'owner: «vorrei anche i diversi slider TUTTI nella modale anziche' nelle
 *   impostazioni», poi ristretto a «gli slider relativi dell'animazione e del tema». Tema, modo
 *   colore, sfondo animato, scena, modo di disegno, qualita' e gli otto cursori della scena si
 *   scelgono nello studio «Temi e atmosfere»; nelle Impostazioni resta UN rimando.
 *   ⇒ i controlli VERI non sono spariti (sono loro a portare la preferenza fino a `localStorage`):
 *     sono nascosti, e lo studio li muove. Quindi la persistenza si prova esattamente come prima,
 *     mentre il GESTO che cambia il valore ora si fa nella modale.
 *   ⛔ `aprireStudio` qui sotto e' la sola aggiunta: chi vuole toccare una di quelle quattordici
 *     passa di li', come una persona.
 */
const MIGRATI = new Set(CONTROLLI_MIGRATI);
async function aprireStudio(page){const s=page.locator('#schermoImpostazioni');await s.getByRole('tab',{name:'Aspetto e movimento',exact:true}).click();if(!(await page.locator('dialog.td-modal').count()))await s.getByRole('button',{name:'Apri Temi e atmosfere',exact:true}).click();await expect(page.locator('dialog.td-modal .td-theme-studio')).toBeVisible();return page.locator('dialog.td-modal');}
async function chiudereStudio(page){if(await page.locator('dialog.td-modal').count()){await page.keyboard.press('Escape');await expect(page.locator('dialog.td-modal')).toHaveCount(0);}}
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
 // ⛔ le 14 migrate esistono ancora nel documento (e' li' che vive la preferenza) ma non si disegnano
 await expect(s.locator('[data-setting-row][data-td-migrata="si"]')).toHaveCount(MIGRATI.size);
 for(const c of CAMPI_IMPOSTAZIONI.filter(c=>!MIGRATI.has(c.id))){await s.locator('[data-settings-tab='+c.sezione+']').click();const el=s.locator('#'+c.id);await expect(page.locator('#'+c.id)).toHaveCount(1);await expect(el).toHaveAccessibleName(c.titolo);if(c.tipo==='select'){await expect(el.locator('option')).toHaveCount(c.opzioni.length);const prima=await el.inputValue();await el.selectOption(c.opzioni.find(([v])=>v!==prima)[0]);}else if(c.tipo==='checkbox'){await el.setChecked(!(await el.isChecked()));}else {await el.focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');await expect(el).toHaveValue(String(c.min+1));}}
 // le 14 migrate si toccano DOVE STANNO ORA, e muovono il controllo vero che resta la fonte del salvataggio
 const studio=await aprireStudio(page);
 for(const c of CAMPI_IMPOSTAZIONI.filter(c=>MIGRATI.has(c.id))){
  if(c.id==='themePresetSelect'){await studio.locator('[data-tema="noir"]').click();await expect(page.locator('#'+c.id)).toHaveValue('noir');continue;}
  if(c.id==='colorModeSelect'){await studio.locator('.td-segment button[data-modo="dark"]').click();await expect(page.locator('#'+c.id)).toHaveValue('dark');continue;}
  const el=studio.locator('#td-studio-'+c.id);
  if(c.tipo==='select'){const prima=await el.inputValue();const dopo=c.opzioni.find(([v])=>v!==prima)[0];await el.selectOption(dopo);await expect(page.locator('#'+c.id)).toHaveValue(dopo);}
  else if(c.tipo==='checkbox'){const prima=await el.isChecked();await el.setChecked(!prima);await expect(page.locator('#'+c.id)).toBeChecked({checked:!prima});}
  else {await el.focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');await expect(el).toHaveValue(String(c.min+1));await expect(page.locator('#'+c.id)).toHaveValue(String(c.min+1));}}
 await chiudereStudio(page);
 const letti=await s.locator('[data-setting-row] input,[data-setting-row] select').evaluateAll(ns=>ns.map(n=>({id:n.id,value:n.type==='checkbox'?n.checked:n.value})));
 await page.reload();await page.getByRole('button',{name:/^Impostazioni(?: \(Ctrl ,\))?$/}).click();
 for(const n of letti){const el=s.locator('#'+n.id);if(typeof n.value==='boolean')await expect(el).toBeChecked({checked:n.value});else await expect(el).toHaveValue(n.value);}
});
test('SET-RICERCA e SET-TASTIERA: trovo una preferenza e cambio sezione senza mouse',async({page},info)=>{
 await pronta(page,APP);const s=page.locator('#schermoImpostazioni'),q=s.getByRole('textbox',{name:'Cerca un’impostazione'});
 /* ⛔ 12/09: prima si cercava «bilanciata» → «Qualità», che dal 12/09 sta nello studio e nelle
    Impostazioni non si disegna piu'. Si cerca una preferenza rimasta qui: «elastica» trova
    «Curva», e resta una sola riga come prima. */
 await q.fill('elastica');await expect(s.locator('[data-setting-row]:visible')).toHaveCount(1);await expect(s.getByRole('combobox',{name:'Curva',exact:true})).toBeVisible();await foto(page,'app-ricerca',info);
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
 /* ⛔ 12/09: tema e cursori si regolano nello studio. La verifica NON cambia soggetto — si
    controlla sempre il controllo vero (`#themePresetSelect`, `#motionSpeedRange`), che e' dove la
    preferenza vive e da dove riparte dopo un ricaricamento. */
 await pronta(page,APP);const studio=await aprireStudio(page);
 await studio.locator('[data-tema="noir"]').click();await expect(page.locator('#themePresetSelect')).toHaveValue('noir');
 const velocita=studio.locator('#td-studio-motionSpeedRange');await velocita.focus();await page.keyboard.press('End');await expect(velocita).toHaveValue('200');await expect(page.locator('#motionSpeedRange')).toHaveValue('200');await foto(page,'app-movimento',info);
 await studio.getByRole('button',{name:'Ripristina i valori del movimento',exact:true}).click();await expect(velocita).toHaveValue('100');await expect(page.locator('#motionSpeedRange')).toHaveValue('100');await expect(page.locator('#themePresetSelect')).toHaveValue('noir');await foto(page,'app-animazioni',info);
 await chiudereStudio(page);
});

test('SET-RACCORDO-ATTRIBUTI: le mie preferenze raggiungono il disegno della chat',async({page})=>{
 await pronta(page,APP);const s=page.locator('#schermoImpostazioni'),root=page.locator('html');await s.getByRole('tab',{name:'Aspetto e movimento',exact:true}).click();
 for(const [id,value] of [['uiFontScaleSelect','large'],['chatFontScaleSelect','expanded'],['messageStyleSelect','bubbles'],['composerShapeSelect','compact']])await s.locator('#'+id).selectOption(value);
 await s.locator('#immersiveHeaderToggle').setChecked(true);await s.locator('#reducedMotionToggle').setChecked(true);await s.getByRole('tab',{name:'Chat e composer',exact:true}).click();await s.locator('#chatFullWidthToggle').setChecked(true);
 for(const dopo of [false,true]){if(dopo)await page.reload();await expect(root).toHaveAttribute('data-talos-message-style','bubbles');await expect(root).toHaveAttribute('data-talos-composer-shape','compact');await expect(root).toHaveClass(/chat-full-width/);await expect(root).toHaveClass(/immersive-header/);await expect(page.locator('body')).toHaveClass(/reduce-motion/);expect(await root.evaluate(n=>n.style.getPropertyValue('--talos-ui-font-scale'))).toBe('1.15');expect(await root.evaluate(n=>n.style.getPropertyValue('--talos-chat-font-size'))).toBe('1.1875rem');}
});


test('SET-NOMI-PERMESSI: leggo lo stesso permesso della chat, in italiano',async({page},info)=>{
 await page.route('**/api/v1/sessions',r=>r.fulfill({json:{ok:true,data:{items:[]}}}));
 for(const [valore,nome] of [['Read only','Solo lettura'],['On request','Chiede prima'],['Workspace write','Scrive nel progetto'],['Full access','Accesso pieno']]){
  await page.addInitScript(p=>{if(window.top!==window)return;localStorage.setItem('talos.harness.desktop.settings.v1',JSON.stringify({chat:{permissions:p}}));},valore);await pronta(page,APP);await page.getByRole('tab',{name:'Strumenti agente e permessi',exact:true}).click();const riga=page.locator('#settingsToolsFacts .talos-kv').filter({hasText:'Policy attiva'});await expect(riga.locator('dd')).toHaveText(nome);await expect(riga.locator('dd')).not.toHaveText(valore);if(valore==='Full access')await foto(page,'r05-permessi',info);
 }
});
test('SET-NOMI-ASPETTO: il riepilogo usa le parole dei controlli',async({page},info)=>{
 await pronta(page,APP);const s=page.locator('#schermoImpostazioni');
 for(const campo of CAMPI_IMPOSTAZIONI.filter(c=>['chatFontScale','messageStyle','streamingAnimation','composerShape'].includes(c.chiave)))for(const [valore,nome] of campo.opzioni){
  await s.getByRole('tab',{name:'Aspetto e movimento',exact:true}).click();await s.locator('#'+campo.id).selectOption(valore);await s.getByRole('tab',{name:'Chat e composer',exact:true}).click();const riga=s.locator('#settingsChatFacts .talos-kv').filter({hasText:campo.titolo});await expect(riga.locator('dd')).toHaveText(nome);
 }
 await foto(page,'r05-aspetto',info);await page.reload();await page.getByRole('button',{name:/^Impostazioni(?: \(Ctrl ,\))?$/}).click();await s.getByRole('tab',{name:'Chat e composer',exact:true}).click();await expect(s.locator('#settingsChatFacts')).not.toContainText('expanded');await expect(s.locator('#settingsChatFacts')).toContainText('Grande');
});
