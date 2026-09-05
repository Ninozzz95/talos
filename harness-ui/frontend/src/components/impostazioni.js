import {CAMPI_IMPOSTAZIONI, SEZIONI_IMPOSTAZIONI} from './impostazioni-campi.js';
const testo = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it');
export function filtraImpostazioni(campi, query) {
  const termini = testo(query).trim().split(/\s+/).filter(Boolean);
  return campi.filter(campo => { const contenuto = testo([campo.titolo, campo.gruppo, ...(campo.opzioni || []).flat()].join(' ')); return termini.every(t => contenuto.includes(t)); });
}
function nodo(tag, classe, testo) { const el = document.createElement(tag); if (classe) el.className = classe; if (testo != null) el.textContent = testo; return el; }
export function creaSettingRow(campo, valore, {controllo, output, prefisso='setting-'} = {}) {
  const riga = nodo('div','talos-setting'); riga.dataset.c = 'SettingRow'; riga.dataset.settingRow = campo.id;
  const info = nodo('div'); const label = nodo('label','talos-setting__label',campo.titolo);
  const input = controllo || document.createElement(campo.tipo === 'select' ? 'select' : 'input');
  if (!controllo) {
    input.id = prefisso + campo.id;
    if (campo.tipo === 'select') for (const [value, nome] of campo.opzioni) {const op = nodo('option','',nome);op.value=value;input.append(op);}
    else {input.type=campo.tipo;if(campo.tipo==='range'){input.min=campo.min;input.max=campo.max;}}
  }
  if (controllo) for (const vecchiaLabel of [...input.labels]) vecchiaLabel.removeAttribute('for');
  label.htmlFor=input.id; info.append(label); riga.append(info);
  if (campo.tipo === 'checkbox') { input.className='talos-switch';input.setAttribute('role','switch');input.dataset.c='Switch';input.checked=Boolean(valore);riga.append(input); }
  else {
    input.value=String(valore ?? '');
    if(campo.tipo==='select'){input.className='talos-select';riga.append(input);}
    else {const contenitore=nodo('div','talos-setting__control');input.className='';const uscita=output || nodo('output','',input.value);uscita.htmlFor=input.id;uscita.className='talos-mono';uscita.value=input.value;const misura=nodo('span','talos-measure');misura.append(uscita,campo.unita);contenitore.append(input,misura);riga.append(contenitore);input.addEventListener('input',()=>{uscita.value=input.value;});}
  }
  return riga;
}
function applicaFiltro(schermo, sezione) {
  const query=schermo.querySelector('[data-settings-query]')?.value || '';
  const trovati=new Set(filtraImpostazioni(CAMPI_IMPOSTAZIONI,query).map(c=>c.id));
  for(const panel of schermo.querySelectorAll('[data-settings-panel]')) {
    const righe=[...panel.querySelectorAll('[data-setting-row]')];
    for(const riga of righe) riga.hidden=Boolean(query.trim()) && !trovati.has(riga.dataset.settingRow);
    for(const gruppo of panel.querySelectorAll('[data-settings-group]')) gruppo.hidden=Boolean(query.trim()) && ![...gruppo.querySelectorAll('[data-setting-row]')].some(r=>!r.hidden);
    panel.hidden=query.trim() ? !righe.some(r=>!r.hidden) : panel.dataset.settingsPanel !== sezione;
  }
  const stato=schermo.querySelector('[data-settings-results]');if(stato){stato.hidden=!query.trim();stato.textContent=query.trim() ? (trovati.size ? 'Preferenze trovate: '+trovati.size : 'Nessuna preferenza trovata. Prova un altro nome.') : '';}
}
export function mostraSezioneImpostazioni(schermo, sezione) {
  if(!schermo) return;
  const scelta=SEZIONI_IMPOSTAZIONI.some(s=>s.id===sezione) ? sezione : 'appearance';schermo.dataset.settingsSection=scelta;
  for(const tab of schermo.querySelectorAll('[data-settings-tab]')){const attivo=tab.dataset.settingsTab===scelta;tab.setAttribute('aria-selected',String(attivo));tab.tabIndex=attivo?0:-1;if(attivo)tab.setAttribute('aria-current','page');else tab.removeAttribute('aria-current');}
  applicaFiltro(schermo,scelta);
}
export function montaImpostazioni(schermo, valori, {recupera, cambiaSezione} = {}) {
  if(!schermo) return;
  for(const campo of CAMPI_IMPOSTAZIONI){const vecchia=schermo.querySelector('[data-setting-row="'+campo.id+'"]');if(!vecchia)continue;const controllo=recupera?.(campo.id);const output=campo.tipo==='range'?recupera?.(campo.chiave+'Output'):null;vecchia.replaceWith(creaSettingRow(campo,valori[campo.chiave],{controllo,output}));}
  for(const slot of schermo.querySelectorAll('[data-settings-reuse]')){const originale=recupera?.(slot.dataset.settingsReuse);if(!originale)continue;originale.className=slot.className;slot.replaceWith(originale);}
  const ricerca=schermo.querySelector('[data-settings-query]');ricerca?.addEventListener('input',()=>applicaFiltro(schermo,schermo.dataset.settingsSection || 'appearance'));
  const lista=schermo.querySelector('.talos-settings__nav [role=tablist]');
  lista?.replaceChildren(...SEZIONI_IMPOSTAZIONI.map(sezione=>{const tab=nodo('button','talos-nav-item');tab.type='button';tab.id='setting-tab-'+sezione.id;tab.dataset.settingsTab=sezione.id;tab.setAttribute('role','tab');tab.setAttribute('aria-controls','setting-panel-'+sezione.id);tab.append(nodo('span','talos-nav-item__label',sezione.titolo));return tab;}));
  const tabs=[...schermo.querySelectorAll('[data-settings-tab]')];
  const scegli=id=>{if(ricerca)ricerca.value='';if(cambiaSezione)cambiaSezione(id);else mostraSezioneImpostazioni(schermo,id);};
  tabs.forEach((tab,i)=>{tab.addEventListener('click',()=>scegli(tab.dataset.settingsTab));tab.addEventListener('keydown',e=>{if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowDown'?1:-1)+tabs.length)%tabs.length;tabs[next].focus();scegli(tabs[next].dataset.settingsTab);});});
  mostraSezioneImpostazioni(schermo,'appearance');
}
