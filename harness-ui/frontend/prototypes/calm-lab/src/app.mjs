import {mountCalmControls} from '../shared/calm-controls.js';
import {APPEARANCE_FIELDS,STUDIO_IDS,APPEARANCE_DEFAULTS,loadAppearance,saveAppearance,patchAppearance,resetAppearanceMotion,searchAppearance} from './appearance-domain.mjs';
import {applyFullAppearance,createAppearancePreviewManager} from './appearance-runtime.mjs';
import {emptyCatalogFilters,validateCatalogFilters,toggleCatalogFacet,removeCatalogFilter,selectCatalog,validateSavedViews,activeCatalogFilters,parameterValue} from './catalog-engine.mjs';
import {STORAGE_KEY,DEFAULT_PREFS,DEMO_MODELS,SETTINGS_INDEX,normalize,searchSettings,filterModels,validatePrefs,loadSnapshot,saveSnapshot,createState,availability,updateDownload,escapeHTML,fmt} from './domain.mjs';
import {icon,modelGlyph,button,badge,emptyState} from './ui.mjs';
import {parseModelRoute,modelRoute} from './model-navigation.mjs';
import {renderSettings,renderThemeStudio} from './settings.mjs';
import {renderModelLab,renderCatalog,renderProviders,renderDownloads,renderSystem} from './model-lab.mjs';
const $=(selector,scope=document)=>scope.querySelector(selector);
let storage;try{storage=window.localStorage;}catch{storage={getItem(){throw new Error('Storage assente')},setItem(){throw new Error('Storage assente')}};}
const state=createState(loadSnapshot(storage));
state.appearance=loadAppearance(storage);
const customControls=mountCalmControls(document);
const appearancePreviews=createAppearancePreviewManager(document);
let appearanceSaveFailed=false;
let searchMatches=[];
let toastTimer=null,providerTimer=null,runtimeTimer=null,testTimer=null,queueTimer=null;
let nextJobId=0;
let catalogComposing=false;
let modalOpener=null,modalOpenerKey=null,modalKind='',testModelId=null,undoAction=null;
const modeMedia=window.matchMedia('(prefers-color-scheme: light)');
const reduceMedia=window.matchMedia('(prefers-reduced-motion: reduce)');
const routeHash=()=>modelRoute(state);
function routeMetadata(extra={}){return {talosPrototype3:true,catalog:state.catalogReturn,detailId:state.detailId,...extra};}
function writeRoute(mode='replace',extra={}){try{history[mode+'State'](routeMetadata(extra),'',routeHash());}catch{/* Some opaque hosts do not support history. In-page navigation still works. */}}
function readHash(){
 if(location.hash==='#page-title')return;
 Object.assign(state,parseModelRoute(location.hash,state.models));
 const saved=history.state?.talosPrototype3?history.state.catalog:null;
 if(saved){state.catalogReturn=saved;if(!state.detailId)state.filtersOpen=saved.filtersOpen===true;} // La rotta è autoritativa per query e filtri; la history conserva solo il contesto di ritorno.
 if(state.detailId)state.selectedId=state.detailId;
}
function captureCatalog(id){
 state.catalogReturn={query:state.query,filter:state.filter,task:state.task,catalogFilters:structuredClone(state.catalogFilters),filtersOpen:state.filtersOpen,scrollTop:$('#main').scrollTop,focusId:id?'select-'+id.replace(':','-'):document.activeElement?.id};
}
function openModelPage(id){
 if(!state.models.some(m=>m.id===id))return;
 const cameFromCatalog=state.section==='models'&&state.tab==='models'&&!state.detailId;
 if(cameFromCatalog){captureCatalog(id);writeRoute('replace');}
 state.section='models';state.tab='models';state.detailId=id;state.selectedId=id;state.detailTab='card';state.cardStatus='ready';state.detailScroll={};
 writeRoute('push',{cameFromCatalog});render({focusTitle:true,preserve:false});
}
function restoreCatalogView(){
 if(state.detailId||state.section!=='models'||state.tab!=='models')return;
 const saved=state.catalogReturn;
 if(saved){$('#main').scrollTop=saved.scrollTop;const el=document.getElementById(saved.focusId);if(el)el.focus({preventScroll:true});else $('#model-query')?.focus({preventScroll:true});}
}
function backToCatalog(){
 if(history.state?.talosPrototype3&&history.state.cameFromCatalog){history.back();return;}
 state.detailId=null;state.section='models';state.tab='models';
 if(state.catalogReturn){state.query=state.catalogReturn.query;state.filter=state.catalogReturn.filter;state.task=state.catalogReturn.task;state.catalogFilters=validateCatalogFilters(state.catalogReturn.catalogFilters);state.filtersOpen=state.catalogReturn.filtersOpen===true;}
 writeRoute();render({focusTitle:true,preserve:false});restoreCatalogView();
}
function changeModelTab(tab){
 if(!['card','files','compatibility'].includes(tab))return;
 state.detailScroll[state.detailTab]=$('#main').scrollTop;state.detailTab=tab;
 writeRoute('replace',{cameFromCatalog:!!history.state?.cameFromCatalog});render();
 $('#main').scrollTop=state.detailScroll[tab]||0;$('#model-tab-'+tab)?.focus({preventScroll:true});
}
readHash();
function applyAppearance(){applyFullAppearance(state.appearance);appearancePreviews.refresh(state.appearance);}
function updateAppearance(key,value){state.appearance=patchAppearance(state.appearance,key,value);appearanceSaveFailed=!saveAppearance(storage,state.appearance);state.saveStatus=appearanceSaveFailed?'error':'local';applyAppearance();syncAppearanceControls();appearancePreviews.refresh(state.appearance);}
function syncAppearanceControls(){
 for(const el of document.querySelectorAll('[data-appearance]')){const value=state.appearance[el.dataset.appearance];if(el.type==='checkbox')el.checked=!!value;else el.value=String(value);}
 for(const b of document.querySelectorAll('[data-theme-choice]')){const active=b.dataset.themeChoice===state.appearance.themePreset;b.setAttribute('aria-checked',String(active));b.tabIndex=active?0:-1;b.classList.toggle('selected',active);b.querySelector('.studio-theme-tick').textContent=active?'✓':'';}
 customControls.refresh();const name=APPEARANCE_FIELDS.find(f=>f.chiave==='themePreset').opzioni.find(([id])=>id===state.appearance.themePreset)?.[1];if($('#current-theme-name'))$('#current-theme-name').textContent=name;
 if($('#appearance-save-status'))$('#appearance-save-status').textContent=appearanceSaveFailed?'Non salvato: attivo solo per questa visita.':'Preferenze salvate in questa anteprima.';
}
function openThemeStudio(target=null){openModal('Temi e atmosfere',renderThemeStudio(state),{kind:'theme-studio',footer:'<span id="appearance-save-status" role="status">Modifiche applicate subito.</span>'+button('Chiudi studio','close-modal',{kind:'primary'})});$('#dialog').classList.add('theme-studio-dialog');customControls.refresh();appearancePreviews.refresh(state.appearance);if(target){const el=document.getElementById(target);el?.closest('.appearance-field')?.scrollIntoView({block:'center'});el?.focus({preventScroll:true});}else $('[data-theme-choice][aria-checked="true"]')?.focus({preventScroll:true});}

function remember(){state.saveStatus=saveSnapshot(storage,state)&&!appearanceSaveFailed?'local':'error';}
function elementKey(el){if(!el)return null;if(el.id)return {id:el.id};const b=el.closest?.('[data-action]');return b?{action:b.dataset.action,model:b.dataset.model,value:b.dataset.value}:null;}
function locateKey(key){if(!key)return null;if(key.id)return document.getElementById(key.id);return [...document.querySelectorAll('[data-action]')].find(b=>b.dataset.action===key.action&&b.dataset.model===key.model&&b.dataset.value===key.value)||null;}
function restoreFocus(key){const el=locateKey(key);if(el&&!el.disabled){el.focus({preventScroll:true});return;}$('#page-title')?.focus({preventScroll:true});}
function render({focusTitle=false,preserve=true}={}){
 const active=document.activeElement;const key=preserve?elementKey(active):null;
 const selection=active instanceof HTMLInputElement&&['search','text'].includes(active.type)?[active.selectionStart,active.selectionEnd]:null;
 const scroll=$('#main').scrollTop;
 applyAppearance();
 $('#settings-nav').innerHTML=renderNav();
 $('#main-content').innerHTML=`${state.saveStatus==='error'?'<div class="storage-warning" role="status">Le preferenze restano attive per questa visita, ma non sono state salvate: lo spazio locale del browser non è disponibile.</div>':''}${state.section==='appearance'?renderSettings(state):renderModelLab(state)}`;
 $('#breadcrumb-current').textContent=state.section==='appearance'?'Aspetto e movimento':state.detailId?'Laboratorio / '+state.models.find(m=>m.id===state.detailId)?.name:'Laboratorio modelli';
 document.title=(state.detailId?state.models.find(m=>m.id===state.detailId)?.name:state.section==='appearance'?'Aspetto e movimento':'Laboratorio modelli')+' · TALOS Calm 04';
 $('#scenario-select').value=state.scenario;
 customControls.refresh();appearancePreviews.refresh(state.appearance);
 if(focusTitle){$('#main').scrollTop=0;$('#page-title')?.focus({preventScroll:true});}else{$('#main').scrollTop=scroll;if(key){const target=locateKey(key);if(target&&!target.disabled){target.focus({preventScroll:true});if(selection&&target instanceof HTMLInputElement)try{target.setSelectionRange(...selection);}catch{}}}}
 const resultText=$('#result-count')?.textContent;if(resultText&&$('#catalog-live').textContent!==resultText)$('#catalog-live').textContent=resultText+' nel catalogo dimostrativo.';
 const hash=routeHash();if(location.hash!==hash)writeRoute('replace');
}
function renderNav(){return `<div class="nav-group"><div class="nav-label">COMPORTAMENTO</div><button class="nav-item ${state.section==='appearance'?'active':''}" data-action="navigate" data-value="appearance" ${state.section==='appearance'?'aria-current="page"':''}>${icon('sun')}Aspetto e movimento</button>${[['chat','Chat e composer'],['shield','Strumenti agente e permessi'],['memory','Memoria e contesto'],['key','Sicurezza e privacy']].map(([ic,label])=>`<button class="nav-item" disabled title="Fuori dal lotto dimostrativo">${icon(ic)}${label}</button>`).join('')}</div><div class="nav-group"><div class="nav-label">INFRASTRUTTURA</div><button class="nav-item ${state.section==='models'?'active':''}" data-action="navigate" data-value="models" ${state.section==='models'?'aria-current="page"':''}>${icon('models')}Laboratorio modelli</button><button class="nav-item" data-action="providers-tab">${icon('key')}Provider e accessi</button>${[['cost','Costi e consumo'],['folder','File e workspace'],['activity','Account, Doctor e backup']].map(([ic,label])=>`<button class="nav-item" disabled title="Fuori dal lotto dimostrativo">${icon(ic)}${label}</button>`).join('')}</div><p class="nav-scope">Le voci attenuate sono fuori da questo primo lotto.</p>`;}
function navigate(section,tab='models',target=null){state.detailId=null;state.section=section;state.tab=tab;writeRoute('push');if(target==='resume')state.advanced=true;render({focusTitle:true,preserve:false});if(target){const el=document.getElementById(target);el?.scrollIntoView({block:'center'});el?.focus({preventScroll:true});const row=document.getElementById('row-'+target)||el;row?.classList.add('highlight-field');} }
function toast(message,{undo=null}={}){clearTimeout(toastTimer);undoAction=undo;$('#toast').innerHTML=`<div class="toast">${icon('check')}<span>${escapeHTML(message)}</span>${undo?'<button data-action="undo">Annulla</button>':''}<button class="icon-button" data-action="dismiss-toast" aria-label="Chiudi notifica">${icon('close')}</button></div>`;toastTimer=setTimeout(()=>{$('#toast').innerHTML='';undoAction=null;},undo?18000:7000);}
function closeModal(restore=true){const d=$('#dialog');if(!d.open)return;clearTimeout(testTimer);testTimer=null;state.demoRun='idle';d.close();d.className='dialog';d.innerHTML='';modalKind='';customControls.refresh();appearancePreviews.refresh(state.appearance);if(restore){if(modalOpener?.isConnected&&!modalOpener.disabled)modalOpener.focus({preventScroll:true});else restoreFocus(modalOpenerKey);}}
function openModal(title,body,{footer='',kind='',eyebrow='TALOS · ANTEPRIMA INTERATTIVA',initial=null}={}){
 const opener=document.activeElement;const existing=modalOpenerKey;const wasInModal=Boolean(opener?.closest('#dialog'));
 if($('#dialog').open)closeModal(false);
 modalOpener=opener;modalOpenerKey=wasInModal?existing:elementKey(opener);modalKind=kind;
 const d=$('#dialog');d.className='dialog '+(kind==='search'?'search-dialog':'');d.innerHTML=`<header class="dialog-header"><div><div class="eyebrow">${escapeHTML(eyebrow)}</div><h2 id="dialog-title" tabindex="-1">${escapeHTML(title)}</h2></div><button class="icon-button" data-action="close-modal" aria-label="Chiudi finestra">${icon('close')}</button></header><div class="dialog-body">${body}</div>${footer?`<footer class="dialog-footer">${footer}</footer>`:''}`;d.showModal();customControls.refresh();appearancePreviews.refresh(state.appearance);(initial?$(initial,d):$('#dialog-title'))?.focus({preventScroll:true});
}
function openSearch(){openModal('Trova un’impostazione',`<label class="sr-only" for="settings-query">Cerca preferenze, sinonimi e nomi precedenti</label><div class="search-field">${icon('search')}<input id="settings-query" type="search" placeholder="Tema, API key, memoria, animazioni…" autocomplete="off"></div><p class="form-hint">Cerca anche con i nomi di prima. <span class="kbd">Esc</span> per tornare.</p><div id="settings-results" class="search-results"></div><p id="search-count" class="form-hint" role="status"></p>`,{kind:'search',initial:'#settings-query'});updateSearch('');}
function updateSearch(query){const existing=searchSettings(query).filter(x=>x.section!=='appearance');searchMatches=[...searchAppearance(query),...existing];$('#settings-results').innerHTML=searchMatches.length?searchMatches.map((x,i)=>`<button class="search-result" data-action="search-result" data-value="${i}">${icon(x.section==='appearance'?'sun':'models')}<div><strong>${escapeHTML(x.label)}</strong><p>${escapeHTML(x.hint)}</p></div>${icon('arrow')}</button>`).join(''):'<p class="form-hint">Nessuna preferenza trovata.</p>';$('#search-count').textContent=`${searchMatches.length} risultati.`;}

function showAdd(source='local'){
 const local=state.models.filter(m=>m.destination==='local');
 const body=`<p>Un catalogo, due destinazioni. In questa anteprima ogni operazione è simulata.</p><div class="dialog-tabs" role="group" aria-label="Sorgente da esplorare"><button class="chip ${source==='local'?'active':''}" data-action="add-source" data-value="local" aria-pressed="${source==='local'}">${icon('screen')}Hugging Face · GGUF</button><button class="chip ${source==='cloud'?'active':''}" data-action="add-source" data-value="cloud" aria-pressed="${source==='cloud'}">${icon('cloud')}Catalogo API</button></div>${source==='local'?local.map(m=>`<article class="catalog-add-row">${modelGlyph(m.glyph)}<div><h3>${escapeHTML(m.name)}</h3><p>${m.size===null?'Peso non noto':fmt(m.size)+' GiB'} · ${escapeHTML(m.quantization||'Quantizzazione non nota')} · ${escapeHTML(m.license)}</p>${m.fit==='incompatible'?'<p class="warning">Stima RAM oltre il budget. Il download non avvia il modello.</p>':''}</div>${button(m.installed?'Già installato':'Simula download','queue-model',{ic:m.installed?'check':'download',data:`data-model="${m.id}"`,disabled:!m.file||!m.format||m.installed||state.downloads.some(j=>j.modelId===m.id&&['running','paused','error'].includes(j.status))})}</article>`).join(''):`<div class="inline-notice">${icon('cloud')}<span>I modelli cloud usano il provider selezionato. Qui non vengono inviate richieste né addebitati costi.</span></div>${state.models.filter(m=>m.destination==='cloud').map(m=>`<article class="catalog-add-row">${modelGlyph(m.glyph)}<div><h3>${escapeHTML(m.name)}</h3><p>${m.provider} · prezzo corrente non verificato</p></div>${button('Vedi dettagli','catalog-select',{ic:'arrow',data:`data-model="${m.id}"`})}</article>`).join('')}`}<p class="form-hint">Metadati adattati dalle fixture del progetto, non da una ricerca live. Nessun download parte all’apertura.</p>`;
 openModal('Aggiungi al tuo laboratorio',body,{kind:'add'});
}
function showDefault(id){const m=state.models.find(m=>m.id===id);if(!m||!availability(m,state).usable||m.id===state.defaultId)return;const cloud=m.destination==='cloud';openModal('Una scelta esplicita.',`<div class="demo-target">${modelGlyph(m.glyph)}<div><strong>${escapeHTML(m.name)}</strong><p>${cloud?'Cloud · '+escapeHTML(m.provider):'Locale · '+escapeHTML(m.provider)}</p></div></div><p>Questa scelta vale solo per le <strong>nuove chat dell’anteprima</strong>. Non cambia chat già aperte, modello di “Migliora prompt” o runtime caricato.</p><div class="inline-notice ${cloud?'warning':''}">${icon(cloud?'cloud':'shield')}<span>${cloud?'Nell’app reale, il contenuto inviato raggiungerà OpenRouter e il fornitore del modello. Il prezzo corrente non è verificato. Nessun fallback viene autorizzato.':'Il modello resta locale. Gli strumenti possono comunque accedere alla rete secondo i loro permessi.'}</span></div>${cloud?'<label class="confirm-scope"><input type="checkbox" id="cloud-consent">Ho compreso la destinazione cloud di questa scelta dimostrativa.</label>':''}`,{kind:'default',footer:`${button('Non cambiare','close-modal')}${button('Conferma per le nuove chat','confirm-default',{kind:'primary',data:`data-model="${id}"`,disabled:cloud,id:'confirm-default'})}`});}
function showConfigure(){openModal('Configura OpenRouter',`<p>Il flusso distingue configurazione e verifica. I campi qui sono esempi non modificabili: <strong>non inserire credenziali reali</strong>.</p><div class="form-label">Endpoint dimostrativo</div><div class="readonly-field">https://api.example.invalid/v1</div><div class="form-label">Credenziale dimostrativa</div><div class="readonly-field">DEMO · nessun segreto presente</div><div class="inline-notice">${icon('shield')}<span>Confermando si modifica solo lo stato temporaneo del prototipo. Il pulsante “Verifica accesso” simula un controllo separato.</span></div>`,{kind:'provider',footer:button('Annulla','close-modal')+button('Salva configurazione demo','save-provider',{kind:'primary'})});}
function showTest(id){const m=state.models.find(m=>m.id===id);if(!m||!availability(m,state).usable)return;testModelId=id;openModal('Banco prova',`<div class="demo-target">${modelGlyph(m.glyph)}<div><strong>${escapeHTML(m.name)}</strong><p>${m.destination==='local'?'Locale':'Cloud · '+m.provider} · simulazione senza inferenza</p></div>${badge('Nessun costo')}</div><label class="form-label" for="test-prompt">Il tuo prompt di prova</label><textarea id="test-prompt" maxlength="4000">${escapeHTML(state.prompt)}</textarea><div class="test-controls"><label for="temperature">Temperatura <output id="temperature-value">${state.temperature}</output><input id="temperature" type="range" min="0" max="2" step="0.1" value="${state.temperature}"></label><label for="context-size">Contesto di prova<select id="context-size">${[2048,4096,8192,16384].map(n=>`<option value="${n}" ${state.contextSize===n?'selected':''}>${fmt(n)} token</option>`).join('')}</select></label></div><p class="form-hint">I parametri restano nel banco prova; non modificano la configurazione del modello. La risposta è un testo dimostrativo, non generato da un’AI.</p><div id="test-output" class="test-output" role="status" aria-live="polite"></div>`,{kind:'test',footer:button('Chiudi','close-modal')+button('Avvia simulazione','run-test',{kind:'primary',ic:'play',id:'run-test'})});}
function runTest(){if(state.demoRun==='running')return;const prompt=$('#test-prompt').value.trim();if(!prompt){$('#test-output').textContent='Scrivi un prompt prima di avviare la prova.';$('#test-prompt').focus();return;}state.prompt=prompt;const runTemperature=state.temperature;const runContext=state.contextSize;state.demoRun='running';for(const el of $('#dialog').querySelectorAll('textarea,input,select'))el.disabled=true;$('#run-test').outerHTML=button('Interrompi simulazione','stop-test',{kind:'secondary',ic:'stop',id:'run-test'});$('#test-output').textContent='Simulazione in corso. Nessuna richiesta viene inviata a un modello…';testTimer=setTimeout(()=>{if(modalKind!=='test')return;state.demoRun='completed';for(const el of $('#dialog').querySelectorAll('textarea,input,select'))el.disabled=false;const name=state.models.find(m=>m.id===testModelId)?.name;$('#test-output').innerHTML=`${badge('Risposta dimostrativa','accent')}<br><strong>Nessun modello eseguito.</strong><br>Hai preparato una prova con ${escapeHTML(name)}, temperatura ${runTemperature} e contesto ${fmt(runContext)} token.<br><br>Prompt conservato nel banco prova:<br>“${escapeHTML(prompt)}”<br><br>In integrazione questo spazio accoglierà lo streaming reale, gli errori e le misure effettivamente disponibili.`;$('#run-test').outerHTML=button('Ripeti simulazione','run-test',{kind:'primary',ic:'play',id:'run-test'});},1100);}
function queueModel(id){const m=state.models.find(m=>m.id===id);if(!m||!m.file||!m.format||m.destination!=='local'||m.installed||state.downloads.some(j=>j.modelId===id&&['running','paused','error'].includes(j.status)))return;state.downloads.push({id:'job-'+(++nextJobId),modelId:id,name:m.name,status:state.scenario==='offline'?'error':'running',progress:0});if(state.scenario==='empty')state.scenario='ready';closeModal(false);navigate('models','downloads');toast('Download dimostrativo aggiunto. Nessun file viene scaricato.');}
function tickQueue(){let changed=false,completed=false;state.downloads=state.downloads.map(j=>{if(j.status!=='running')return j;changed=true;const next=updateDownload(j,'tick');if(next.status==='completed'){completed=true;const m=state.models.find(m=>m.id===j.modelId);if(m)m.installed=true;toast(`${j.name}: download simulato completato. Il modello non è stato avviato.`);}return next;});if(changed&&state.section==='models'&&(state.tab==='downloads'||(completed&&state.tab==='models')))render();}
function showComparison(){const models=state.compare.map(id=>state.models.find(m=>m.id===id)).filter(Boolean);if(models.length!==2)return;openModal('Confronta senza cambiare modello.',`<p>Stessi campi, nessun punteggio inventato. Tutti i valori appartengono allo scenario dimostrativo.</p><table class="comparison-table"><caption class="sr-only">Confronto fra due modelli dimostrativi</caption><thead><tr><th scope="col">Caratteristica</th>${models.map(m=>`<th scope="col">${modelGlyph(m.glyph)}${escapeHTML(m.name)}</th>`).join('')}</tr></thead><tbody>${[['Parametri totali',m=>m.parametersB===null?'Non noti':fmt(m.parametersB)+'B'],['Parametri attivi (MoE)',m=>m.architecture==='moe'?(m.activeParametersB===null?'Non noti':fmt(m.activeParametersB)+'B'):'Modello denso / non noto'],['Destinazione',m=>m.destination==='local'?'Dispositivo':'Cloud · '+m.provider],['Stato',m=>availability(m,state).label],['File',m=>m.size?fmt(m.size)+' GiB':'Nessun file locale'],['Contesto',m=>fmt(m.context)+' token'],['Stima RAM',m=>m.required?fmt(m.required)+' GiB':'Non disponibile'],['Strumenti',m=>m.tools?'Da catalogo demo':'Da verificare'],['Costo corrente',()=> 'Non verificato']].map(([label,get])=>`<tr><th scope="row">${label}</th>${models.map(m=>`<td>${escapeHTML(get(m))}</td>`).join('')}</tr>`).join('')}</tbody></table><p class="form-hint">La comparazione non cambia il modello di nessuna chat.</p>`,{kind:'compare',footer:button('Torna ai modelli','close-modal')});}
function setScenario(scenario){if(scenario==='empty')state.detailId=null;clearTimeout(providerTimer);clearTimeout(runtimeTimer);clearTimeout(testTimer);state.scenario=scenario;state.probe='idle';state.providerStatus=scenario==='empty'?'missing':scenario==='denied'?'denied':'connected';if(scenario==='empty'){state.models=DEMO_MODELS.map(m=>({...m,installed:false}));state.defaultId=null;state.downloads=[];}else if(state.models.every(m=>!m.installed)){state.models=DEMO_MODELS.map(m=>({...m}));state.defaultId='local:qwen8';}if(scenario==='offline')state.downloads=state.downloads.map(j=>j.status==='running'?{...j,status:'error'}:j);render();}
function showSaveCatalogView(){
 if(state.savedViews.length>=12){toast('Puoi conservare fino a 12 viste. Rimuovine una prima di salvarne un’altra.');return;}
 openModal('Salva questa ricerca',`<p>La vista conserva ricerca, filtri e ordinamento. Non sceglie un modello e non salva credenziali.</p><label class="form-label" for="view-name">Nome della vista</label><input class="view-name-input" type="text" id="view-name" maxlength="60" placeholder="Per esempio: locali piccoli per sviluppo" autocomplete="off"><p class="form-hint" id="view-name-error" role="status"></p><p class="form-hint">Salvataggio locale nel browser quando disponibile, mai sul repository.</p>`,{kind:'save-view',footer:button('Annulla','close-modal')+button('Salva vista','catalog-confirm-view',{kind:'primary',id:'confirm-save-view',disabled:true}),initial:'#view-name'});
}
function showManageCatalogViews(){openModal('Viste salvate',state.savedViews.length?state.savedViews.map(v=>`<div class="saved-view-row"><strong>${escapeHTML(v.name)}</strong>${button('Rimuovi','catalog-delete-view',{kind:'danger-ghost',data:`data-view="${v.id}"`})}</div>`).join(''):'<p>Nessuna vista salvata.</p>',{kind:'views',footer:button('Chiudi','close-modal')});}
function showHelp(){openModal('Un componente alla volta.',`<p><strong>Impostazioni + Laboratorio modelli · controlli custom 04.</strong> Questo mockup è autonomo, funziona senza rete e non modifica TALOS. Il collegamento alla fonte apre Hugging Face soltanto su richiesta.</p><div class="help-grid"><div><strong>Aspetto e movimento</strong><p>Tutti i 14 temi e i 40 controlli attuali, scena dal vivo, accessibilità e ripristino selettivo.</p></div><div><strong>Laboratorio modelli</strong><p>Filtri combinabili per dimensioni, risorse, capacità e provenienza, ordinamento e viste salvate. Pagina modello dedicata e ritorno con ricerca, filtri, posizione e focus conservati.</p></div><div><strong>Transazioni esplicite</strong><p>Il cloud richiede conferma. Nessun provider cambia in modo nascosto.</p></div><div><strong>Scenari controllati</strong><p>Usa il selettore in basso per provare vuoto, rete assente e errore runtime.</p></div></div><p>Download, provider, hardware e banco prova sono <strong>simulati</strong>. L’anteprima non contiene AI, non contatta servizi e non raccoglie chiavi.</p><p class="form-hint"><span class="kbd">Ctrl / ⌘ K</span> cerca impostazioni · <span class="kbd">Esc</span> chiude le finestre · frecce nelle schede, Invio per aprire.</p><p class="form-hint">Le preferenze visuali, i preferiti e la scelta demo si salvano nel browser quando disponibile. Download, installazioni simulate e bozze sono temporanei. Nessun font o script esterno.</p>`,{kind:'help',footer:button('Continua a esplorare','close-modal',{kind:'primary'})});}

document.addEventListener('click',event=>{
 const theme=event.target.closest('[data-theme-choice]');if(theme){updateAppearance('themePreset',theme.dataset.themeChoice);return;}
 const b=event.target.closest('button[data-action]');if(!b||b.disabled)return;const action=b.dataset.action;const id=b.dataset.model;const value=b.dataset.value;
 switch(action){
 case 'navigate':closeModal(false);navigate(value);break;
 case 'providers-tab':closeModal(false);navigate('models','providers');break;
 case 'system-tab':navigate('models','system');break;
 case 'tab':state.detailId=null;state.tab=value;writeRoute('push');render();break;
 case 'back-catalog':backToCatalog();break;
 case 'open-downloads':navigate('models','downloads');break;
 case 'model-detail-tab':changeModelTab(value);break;
 case 'card-anchor':{const el=document.getElementById('readme-'+value);el?.scrollIntoView({block:'start',behavior:'instant'});el?.focus({preventScroll:true});break;}
 case 'card-retry':state.cardStatus='ready';render();$('#readme-overview')?.focus({preventScroll:true});toast('Anteprima locale ripristinata. Nessuna richiesta a Hugging Face.');break;
 case 'open-search':openSearch();break;
 case 'open-theme-studio':openThemeStudio();break;
 case 'reset-appearance-motion':{state.appearance=resetAppearanceMotion(state.appearance);appearanceSaveFailed=!saveAppearance(storage,state.appearance);state.saveStatus=appearanceSaveFailed?'error':'local';applyAppearance();syncAppearanceControls();appearancePreviews.refresh(state.appearance);toast('Solo movimento ripristinato. Tema, testo e chat restano invariati.');break;}
 case 'preview-composer-plus':{const tools=b.closest('.preview-body').querySelector('.preview-tools');tools.hidden=!tools.hidden;tools.textContent=state.appearance.composerPlus==='menu'?'Menu · Allega · Strumenti':'Cassetto · File e strumenti del composer';break;}
 case 'search-result':{const item=searchMatches[Number(value)];if(!item)break;closeModal(false);navigate(item.section,item.tab||'models',item.studio?null:item.target);if(item.studio)openThemeStudio(item.target);else {const el=document.getElementById(item.target);const details=el?.closest('details');if(details)details.open=true;el?.scrollIntoView({block:'center'});el?.focus({preventScroll:true});}break;}
 case 'mobile-nav':openModal('Impostazioni',renderNav()+button('Guida al mockup','help',{ic:'info'}),{kind:'nav'});break;
 case 'theme':updateAppearance('colorMode',value);render();break;
 case 'quick-theme':updateAppearance('colorMode',document.documentElement.dataset.mode==='dark'?'light':'dark');render();break;
 case 'select-model':openModelPage(id);break;
 case 'filter':state.filter=value;state.catalogFilters=emptyCatalogFilters();if(['local','cloud'].includes(value))state.catalogFilters.destination=[value];if(value==='installed')state.catalogFilters.status=['installed'];if(value==='favorites')state.catalogFilters.favorite=true;render();break;
 case 'catalog-toggle':state.catalogFilters=toggleCatalogFacet(state.catalogFilters,b.dataset.key,value);render();break;
 case 'catalog-all-destinations':state.catalogFilters.destination=[];render();break;
 case 'catalog-expand':state.filtersOpen=!state.filtersOpen;render();break;
 case 'catalog-collapse':state.filtersOpen=false;render();$('#catalog-expand')?.focus({preventScroll:true});$('.catalog-results-head')?.scrollIntoView({block:'center'});break;
 case 'catalog-remove':{state.catalogFilters=removeCatalogFilter(state.catalogFilters,b.dataset.key,value);render();$('#clear-all-filters')?.focus({preventScroll:true});if(!$('#clear-all-filters'))$('#model-query')?.focus({preventScroll:true});break;}
 case 'catalog-remove-query':state.query='';render();$('#model-query')?.focus({preventScroll:true});break;
 case 'catalog-save-view':showSaveCatalogView();break;
 case 'catalog-confirm-view':{const name=$('#view-name').value.trim();if(!name||state.savedViews.some(v=>normalize(v.name)===normalize(name))||state.savedViews.length>=12)break;state.savedViews=validateSavedViews([...state.savedViews,{name,query:state.query,filters:state.catalogFilters}]);remember();closeModal(false);render();$('#save-catalog-view')?.focus();toast(state.saveStatus==='error'?'Vista disponibile solo per questa visita: salvataggio locale non disponibile.':'Vista salvata nel browser.');break;}
 case 'catalog-manage-views':showManageCatalogViews();break;
 case 'catalog-delete-view':{const old=structuredClone(state.savedViews);state.savedViews=validateSavedViews(state.savedViews.filter(v=>v.id!==b.dataset.view));remember();closeModal(false);render();$('#save-catalog-view')?.focus();toast('Vista rimossa.',{undo:()=>{state.savedViews=old;remember();render();toast('Vista ripristinata.');}});break;}
 case 'reset-filter':state.query='';state.filter='all';state.task='all';state.catalogFilters=emptyCatalogFilters();render();$('#model-query')?.focus();break;
 case 'favorite':{state.favorites=state.favorites.includes(id)?state.favorites.filter(x=>x!==id):[...state.favorites,id];remember();render();break;}
 case 'compare':showComparison();break;
 case 'clear-compare':state.compare=[];render();break;
 case 'add-model':showAdd();break;
 case 'add-source':showAdd(value);break;
 case 'catalog-select':closeModal(false);state.scenario=state.scenario==='empty'?'ready':state.scenario;openModelPage(id);break;
 case 'download-model':case 'queue-model':queueModel(id);break;
 case 'download-pause':case 'download-resume':case 'download-cancel':{const jobId=b.dataset.job;const cmd=action.split('-')[1];if(cmd==='resume'&&state.scenario==='offline'){toast('Rete ancora assente nello scenario. Scegli “Configurato” per riprovare.');break;}state.downloads=state.downloads.map(j=>j.id===jobId?updateDownload(j,cmd):j);render();break;}
 case 'show-downloaded':openModelPage(id);break;
 case 'set-default':showDefault(id);break;
 case 'confirm-default':{const model=state.models.find(m=>m.id===id);if(!model||!availability(model,state).usable||(model.destination==='cloud'&&!$('#cloud-consent')?.checked))break;state.defaultId=id;remember();closeModal(false);render();restoreFocus(modalOpenerKey);toast('Modello scelto per le nuove chat dell’anteprima. Nessuna inferenza avviata.');break;}
 case 'configure-provider':showConfigure();break;
 case 'save-provider':state.providerStatus='unverified';closeModal(false);render();restoreFocus(modalOpenerKey);toast('Configurazione demo salvata in memoria. Verifica l’accesso separatamente.');break;
 case 'probe-provider':if(state.providerStatus==='testing')break;state.providerStatus='testing';render();providerTimer=setTimeout(()=>{state.providerStatus=state.scenario==='offline'?'unreachable':state.scenario==='denied'?'denied':'connected';render();toast(state.scenario==='offline'?'Verifica simulata non riuscita: rete assente.':state.scenario==='denied'?'Accesso rifiutato: errore 401 simulato.':'Verifica simulata completata. Nessuna richiesta esterna.');},800);break;
 case 'test-model':showTest(id);break;
 case 'run-test':runTest();break;
 case 'stop-test':clearTimeout(testTimer);state.demoRun='cancelled';for(const el of $('#dialog').querySelectorAll('textarea,input,select'))el.disabled=false;$('#test-output').textContent='Simulazione interrotta. Il prompt è conservato.';$('#run-test').outerHTML=button('Riprova simulazione','run-test',{kind:'primary',ic:'play',id:'run-test'});$('#run-test').focus();break;
 case 'probe-runtime':if(state.probe==='running')break;state.probe='running';render();runtimeTimer=setTimeout(()=>{state.probe='done';render();toast(state.scenario==='error'?'Runtime ancora non raggiunto nello scenario.':'Verifica demo completata. Nessun hardware rilevato.');},800);break;
 case 'recover-runtime':state.scenario='ready';state.probe='idle';render();toast('Scenario ripristinato. Non è stato avviato un runtime reale.');break;
 case 'remove-model':{const m=state.models.find(m=>m.id===id);if(!m||m.id===state.defaultId)break;openModal('Rimuovi dallo scenario?',`<p><strong>${escapeHTML(m.name)}</strong> non risulterà più installato nel prototipo. Nessun file sul tuo dispositivo viene toccato. Il modello resta nel catalogo.</p>`,{kind:'remove',footer:button('Mantieni modello','close-modal',{id:'keep-model'})+button('Rimuovi dalla demo','confirm-remove',{kind:'danger',data:`data-model="${id}"`}),initial:'#keep-model'});break;}
 case 'confirm-remove':{const m=state.models.find(m=>m.id===id);if(m&&id!==state.defaultId)m.installed=false;closeModal(false);render();restoreFocus(modalOpenerKey);toast('Rimosso solo dallo scenario. Nessun file eliminato.');break;}
 case 'reset-prefs':{openModal('Ripristina solo l’aspetto?',`<p>Tutte le 40 preferenze visuali torneranno ai valori iniziali del prodotto. Preferiti, modello scelto, bozza e preferenza di ripresa del workspace restano invariati.</p>`,{kind:'reset',footer:button('Mantieni preferenze','close-modal',{id:'keep-prefs'})+button('Ripristina aspetto','confirm-reset',{kind:'primary'}),initial:'#keep-prefs'});break;}
 case 'confirm-reset':{const old={...state.appearance};state.appearance={...APPEARANCE_DEFAULTS};appearanceSaveFailed=!saveAppearance(storage,state.appearance);state.saveStatus=appearanceSaveFailed?'error':'local';closeModal(false);render();restoreFocus(modalOpenerKey);toast('Aspetto ripristinato.',{undo:()=>{state.appearance=old;appearanceSaveFailed=!saveAppearance(storage,state.appearance);state.saveStatus=appearanceSaveFailed?'error':'local';render();toast('Preferenze precedenti ripristinate.');}});break;}
 case 'privacy-info':openModal('Locale non significa tutto offline.',`<p>La destinazione dell’inferenza resta visibile. Scegliere un modello locale non blocca automaticamente gli strumenti di rete dell’agente.</p><p>Il passaggio al cloud deve essere esplicito. Il prototipo non applica fallback, non avvia strumenti, non modifica permessi e non effettua richieste esterne.</p>`,{footer:button('Ho capito','close-modal',{kind:'primary'})});break;
 case 'help':showHelp();break;
 case 'close-modal':closeModal();break;
 case 'dismiss-toast':clearTimeout(toastTimer);$('#toast').innerHTML='';undoAction=null;break;
 case 'undo':{const fn=undoAction;undoAction=null;fn?.();break;}
 }
});
document.addEventListener('input',event=>{const el=event.target;if(el.dataset.appearance&&el.type==='range'){updateAppearance(el.dataset.appearance,Number(el.value));return;}if(el.id==='model-query'&&!catalogComposing){state.query=el.value;render();}if(el.id==='view-name'){const duplicate=state.savedViews.some(v=>normalize(v.name)===normalize(el.value));$('#confirm-save-view').disabled=!el.value.trim()||duplicate;$('#view-name-error').textContent=duplicate?'Questo nome è già usato. Scegline un altro.':'';}if(el.id==='settings-query')updateSearch(el.value);if(el.id==='test-prompt')state.prompt=el.value;if(el.id==='temperature'){state.temperature=Number(el.value);$('#temperature-value').value=el.value;}});
document.addEventListener('compositionstart',event=>{if(event.target.id==='model-query')catalogComposing=true;});
document.addEventListener('compositionend',event=>{if(event.target.id==='model-query'){catalogComposing=false;state.query=event.target.value;render();}});
document.addEventListener('change',event=>{
 const el=event.target;
 if(el.dataset.appearance){if(el.type!=='range')updateAppearance(el.dataset.appearance,el.type==='checkbox'?el.checked:el.value);return;}
 if(el.id==='saved-view-select'){const view=state.savedViews.find(v=>v.id===el.value);if(view){state.query=view.query;state.catalogFilters=validateCatalogFilters(view.filters);render();$('#model-query')?.focus({preventScroll:true});toast('Vista applicata. Nessuna scelta del modello modificata.');}return;}
 if(el.dataset.catalogSelect){const key=el.dataset.catalogSelect,v=el.value;if(['custom','multi'].includes(v))return;const f=state.catalogFilters;if(Array.isArray(f[key]))f[key]=v?[v]:[];else f[key]=v;if(key==='sizes'){f.minParams='';f.maxParams='';}state.catalogFilters=validateCatalogFilters(f);render();return;}
 if(el.dataset.catalogCheck){const key=el.dataset.catalogCheck;state.catalogFilters=toggleCatalogFacet(state.catalogFilters,key,el.value);if(key==='sizes'){state.catalogFilters.minParams='';state.catalogFilters.maxParams='';}render();return;}
 if(el.dataset.catalogBool){state.catalogFilters[el.dataset.catalogBool]=el.checked;render();return;}
 if(el.dataset.catalogNumber){if(!el.validity.valid){el.reportValidity();return;}const key=el.dataset.catalogNumber;state.catalogFilters[key]=el.value;if(['minParams','maxParams'].includes(key))state.catalogFilters.sizes=[];state.catalogFilters=validateCatalogFilters(state.catalogFilters);render();return;}
 if(el.id==='scenario-select')setScenario(el.value);
 if(el.id==='card-preview-state'){state.cardStatus=el.value;render();}
 if(el.id==='task-filter'){state.task=el.value;state.catalogFilters.tasks=el.value==='all'?[]:[el.value];render();}
 if(el.id==='cloud-consent')$('#confirm-default').disabled=!el.checked;
 if(el.id==='context-size')state.contextSize=Number(el.value);
 if(el.dataset.compare){const id=el.dataset.compare;if(el.checked&&state.compare.length>=2){el.checked=false;toast('Puoi confrontare due modelli alla volta.');return;}state.compare=el.checked?[...state.compare,id]:state.compare.filter(x=>x!==id);render();}
 if(el.matches('select[data-pref]')){const key=el.dataset.pref;state.prefs=validatePrefs({...state.prefs,[key]:key==='textSize'?Number(el.value):el.value});remember();render();}
});
document.addEventListener('click',event=>{const el=event.target.closest('button[role=switch][data-pref]');if(!el)return;const key=el.dataset.pref;if(!['motion','resume'].includes(key))return;state.prefs[key]=!state.prefs[key];remember();render();});
document.addEventListener('toggle',event=>{if(event.target.matches?.('.advanced-settings'))state.advanced=event.target.open;},true);
document.addEventListener('keydown',event=>{
 const theme=event.target.closest?.('[data-theme-choice]');if(theme&&['ArrowLeft','ArrowRight','ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const all=[...document.querySelectorAll('[data-theme-choice]')];const current=all.indexOf(theme);const next=event.key==='Home'?0:event.key==='End'?all.length-1:(current+(['ArrowRight','ArrowDown'].includes(event.key)?1:-1)+all.length)%all.length;updateAppearance('themePreset',all[next].dataset.themeChoice);all[next].focus();return;}
 const dialog=$('#dialog');
 // A search input may otherwise consume Escape to clear itself before dialog cancel.
 if(dialog.open&&event.key==='Escape'){event.preventDefault();event.stopPropagation();closeModal();return;}
 if(dialog.open&&event.key==='Tab'){
   const stops=[...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary,[tabindex]:not([tabindex="-1"])')].filter(el=>el.getClientRects().length&&el.tabIndex>=0);
   const first=stops[0],last=stops.at(-1),active=document.activeElement;
   if(!first){event.preventDefault();$('#dialog-title').focus();return;}
   if(event.shiftKey&&(active===first||!stops.includes(active))){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&(active===last||!stops.includes(active))){event.preventDefault();first.focus();}
 }
 if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();if(!$('#dialog').open)openSearch();return;}
 const tab=event.target.closest?.('[role=tab]');
 if(tab&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const tabs=[...tab.parentElement.querySelectorAll('[role=tab]')];const i=tabs.indexOf(tab);const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(i+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs.forEach((t,j)=>t.tabIndex=j===next?0:-1);tabs[next].focus();}
 if(modalKind==='search'&&['ArrowDown','ArrowUp'].includes(event.key)){const results=[...$('#dialog').querySelectorAll('.search-result')];if(!results.length)return;event.preventDefault();const i=results.indexOf(document.activeElement);results[event.key==='ArrowDown'?(i+1)%results.length:(i<0?results.length-1:(i-1+results.length)%results.length)].focus();}
});
$('#dialog').addEventListener('cancel',event=>{event.preventDefault();closeModal();});
$('#dialog').addEventListener('click',event=>{if(event.target!==$('#dialog'))return;const rect=$('#dialog').getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeModal();});
modeMedia.addEventListener('change',applyAppearance);reduceMedia.addEventListener('change',applyAppearance);
window.addEventListener('hashchange',()=>{readHash();render({focusTitle:true,preserve:false});restoreCatalogView();});
window.addEventListener('beforeunload',()=>{clearTimeout(toastTimer);clearTimeout(providerTimer);clearTimeout(runtimeTimer);clearTimeout(testTimer);clearInterval(queueTimer);customControls.dispose();appearancePreviews.dispose();});
queueTimer=setInterval(tickQueue,450);
render({preserve:false});
