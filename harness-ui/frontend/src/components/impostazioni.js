import {CAMPI_IMPOSTAZIONI, SEZIONI_IMPOSTAZIONI} from './impostazioni-campi.js';
import { t } from './lingua.js';
const testo = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it');
export function filtraImpostazioni(campi, query) {
  const termini = testo(query).trim().split(/\s+/).filter(Boolean);
  return campi.filter(campo => { const contenuto = testo([campo.titolo, campo.gruppo, ...(campo.opzioni || []).flat()].join(' ')); return termini.every(t => contenuto.includes(t)); });
}
function nodo(tag, classe, testo) { const el = document.createElement(tag); if (classe) el.className = classe; if (testo != null) el.textContent = testo; return el; }
export function creaSettingRow(campo, valore, {controllo, output, prefisso='setting-'} = {}) {
  const riga = nodo('div','talos-setting'); riga.dataset.c = 'SettingRow'; riga.dataset.settingRow = campo.id;
  const info = nodo('div'); const label = nodo('label','talos-setting__label',t(campo.titolo));
  const input = controllo || document.createElement(campo.tipo === 'select' ? 'select' : 'input');
  if (!controllo) {
    input.id = prefisso + campo.id;
    if (campo.tipo === 'select') for (const [value, nome] of campo.opzioni) {const op = nodo('option','',t(nome));op.value=value;op.dataset.testoIt=nome;input.append(op);}
    else {input.type=campo.tipo;if(campo.tipo==='range'){input.min=campo.min;input.max=campo.max;}}
  }
  if (controllo) { for (const vecchiaLabel of [...input.labels]) vecchiaLabel.removeAttribute('for'); if (campo.tipo === 'select') for (const op of input.options) { const originale = op.dataset.testoIt || op.textContent; op.dataset.testoIt = originale; op.textContent = t(originale); } }
  label.dataset.testoIt = campo.titolo;
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
  // Some preferences have a dedicated owner rather than CAMPI_IMPOSTAZIONI.
  // They participate in the same search without duplicating their value or write path.
  const termini = testo(query).trim().split(/\s+/).filter(Boolean);
  for (const row of schermo.querySelectorAll('[data-setting-search]')) {
    const content = testo(`${row.dataset.settingSearch} ${row.textContent}`);
    if (termini.every(term => content.includes(term))) trovati.add(row.dataset.settingRow);
  }
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
  /*
   * D2 (06/09) — le voci si distribuiscono nei DUE gruppi dichiarati da
   * `SEZIONI_IMPOSTAZIONI`, una tablist per gruppo.
   * ⛔ Prima riempiva `.talos-settings__nav [role=tablist]`, cioè la PRIMA
   * tablist e basta: col markup a due gruppi ci finivano tutte e dieci, e le
   * cinque del secondo gruppo restavano quelle scritte nel mockup — duplicate e
   * mai aggiornate. Trovato dal vivo: la navigazione mostrava 8+5 voci invece
   * di 5+5, e le sezioni nuove non si aprivano.
   */
  const liste=[...schermo.querySelectorAll('.talos-settings__nav [role=tablist]')];
  const voce=sezione=>{const tab=nodo('button','talos-nav-item');tab.type='button';tab.id='setting-tab-'+sezione.id;tab.dataset.settingsTab=sezione.id;tab.setAttribute('role','tab');tab.setAttribute('aria-controls','setting-panel-'+sezione.id);tab.append(nodo('span','talos-nav-item__label',t(sezione.titolo)));return tab;};
  if(liste.length<=1)liste[0]?.replaceChildren(...SEZIONI_IMPOSTAZIONI.map(voce));
  else{
    const gruppi=[...new Set(SEZIONI_IMPOSTAZIONI.map(s=>s.gruppo||'comportamento'))];
    liste.forEach((lista,i)=>{const g=lista.dataset.settingsGruppo||gruppi[i];lista.replaceChildren(...SEZIONI_IMPOSTAZIONI.filter(s=>(s.gruppo||'comportamento')===g).map(voce));});
  }
  const tabs=[...schermo.querySelectorAll('[data-settings-tab]')];
  const scegli=id=>{if(ricerca)ricerca.value='';if(cambiaSezione)cambiaSezione(id);else mostraSezioneImpostazioni(schermo,id);};
  tabs.forEach((tab,i)=>{tab.addEventListener('click',()=>scegli(tab.dataset.settingsTab));tab.addEventListener('keydown',e=>{if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowDown'?1:-1)+tabs.length)%tabs.length;tabs[next].focus();scegli(tabs[next].dataset.settingsTab);});});
  mostraSezioneImpostazioni(schermo,'appearance');
}

/**
 * P-i18n (06/09) — ritraduce la schermata già montata quando cambia la lingua: etichette delle
 * righe, opzioni dei select (il testo italiano resta in `data-testo-it`), voci di navigazione delle
 * sezioni. Niente rimontaggio: i controlli e i loro ascoltatori restano quelli.
 */
export function ritraduciImpostazioni(schermo) {
  if (!schermo) return 0;
  let n = 0;
  for (const label of schermo.querySelectorAll('.talos-setting__label[data-testo-it]')) { label.textContent = t(label.dataset.testoIt); n += 1; }
  for (const op of schermo.querySelectorAll('.talos-setting select option[data-testo-it]')) { op.textContent = t(op.dataset.testoIt); n += 1; }
  for (const sezione of SEZIONI_IMPOSTAZIONI) {
    const voce = schermo.querySelector(`[data-settings-tab="${sezione.id}"] .talos-nav-item__label`);
    if (voce) { voce.textContent = t(sezione.titolo); n += 1; }
  }
  return n;
}
