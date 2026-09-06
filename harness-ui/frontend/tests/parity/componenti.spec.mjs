import { expect, test } from '@playwright/test';
import { MOCKUP, apri, confrontaPixel, mostra, struttura, testi } from './aiuto.mjs';

/*
 * IL CANCELLO DEI COMPONENTI — parità «a partire dai dati».
 *
 * Per ogni componente estratto dal monolite, il laboratorio (`lab/main.js`)
 * rende le fixture nel corpo della app e qui lo si confronta con il mockup su
 * tre piani: struttura (data-c e classi), PAROLE (il testo visibile) e pixel.
 * Un componente è finito quando, ricevendo i dati d'esempio del mockup,
 * produce esattamente ciò che il mockup disegna a mano.
 *
 * Il laboratorio gira su un server suo (porta 4176, `serve-lab.mjs`) — mai
 * sulla 4174 dell'owner né sulla 4175 della app di prova.
 */
const LAB = process.env.TALOS_LAB_URL || `http://127.0.0.1:${process.env.TALOS_LAB_PORT || 4176}`;

const COMPONENTI = [
 {nome:'ProviderCard',schermata:'schermoModelLab',selettore:'#veloFornitori [data-c=ProviderCard]'},
 {nome:'RuntimeCard',schermata:'schermoModelLab',selettore:'#panel-runtime [data-c=RuntimeCard]' },
 {nome:'MemoryMeter',schermata:'schermoModelLab',selettore:'#panel-runtime [data-c=MemoryMeter]'},
 {nome:'CatalogoModelli',schermata:'schermoModelLab',selettore:'#panel-catalogo'},
 {nome:'FonteRicerca',schermata:'schermoImpostazioni',selettore:'#setting-source-preview'},
 {nome:'SettingsNav',schermata:'schermoImpostazioni',selettore:'#schermoImpostazioni .talos-settings__nav'},
 {nome:'SettingRow',schermata:'schermoImpostazioni',selettore:'#schermoImpostazioni [data-settings-group=design]'},
 {nome:'CheckCard',schermata:'schermoDoctor',selettore:'#schermoDoctor'},
  {nome:'ExtensionList_skills',schermata:'schermoCapability',selettore:'#schermoCapability',sezione:'skills'},
  {nome:'ExtensionList_mcp',schermata:'schermoCapability',selettore:'#schermoCapability',sezione:'mcp'},
  {nome:'ExtensionList_plugins',schermata:'schermoCapability',selettore:'#schermoCapability',sezione:'plugins'},
  {nome:'ExtensionList_hooks',schermata:'schermoCapability',selettore:'#schermoCapability',sezione:'hooks'},
  { nome: 'ToolList', schermata: 'schermoCapability', selettore: '#schermoCapability' },
  { nome: 'AutomationRow', schermata: 'schermoAutomazioni', selettore: '#schermoAutomazioni' },
  { nome: 'ForgeList', schermata: 'schermoOfficina', selettore: '#schermoOfficina' },
  { nome: 'ReportRow', schermata: 'schermoRicerca', selettore: '#schermoRicerca' },
  { nome: 'LibraryRow', schermata: 'schermoLibreria', selettore: '#schermoLibreria' },
  { nome: 'TaskRow', schermata: 'schermoAttivita', selettore: '#schermoAttivita' },
  { nome: 'MemoryRow', schermata: 'schermoMemoria', selettore: '#schermoMemoria' },
  { nome: 'Board', schermata: 'schermoBoard', selettore: '#schermoBoard' },
  { nome: 'SessionItem', schermata: 'schermoChat', selettore: '.talos-sidebar' },
  { nome: 'NavItem', schermata: 'schermoChat', selettore: '.talos-sidebar' },
  { nome: 'WorkspaceFooter', schermata: 'schermoChat', selettore: '.talos-sidebar' },
  { nome: 'Topbar', schermata: 'schermoChat', selettore: '#schermoChat .talos-topbar' },
  { nome: 'Conversazione', schermata: 'schermoChat', selettore: '#schermoChat .talos-conversation' },
  { nome: 'ModelliInstallati', schermata: 'schermoModelLab', selettore: '#panel-installati' }, // 06/9 B6.8
  { nome: 'CatalogoHf', schermata: 'schermoModelLab', selettore: '#panel-hf' }, // 06/9 B6.9
  { nome: 'CodaDownload', schermata: 'schermoModelLab', selettore: '#panel-download' }, // 06/9 B6.10
  { nome: 'Inspector', schermata: 'schermoChat', selettore: '#inspectorSessione' }, // 06/9 B2
  { nome: 'Terminale', schermata: 'schermoTerminale', selettore: '#schermoTerminale .talos-terminal' }, // 06/9 B1: schede e piede
  { nome: 'Browser', schermata: 'schermoBrowser', selettore: '#schermoBrowser .talos-browser' }, // 06/9 K-I: letture, schede, cronologia
  { nome: 'Inspector_processi', schermata: 'schermoChat', selettore: '#inspectorSessione' }, // 06/9 B2: la scheda Processi
  { nome: 'Toast', schermata: 'schermoChat', selettore: '#regioneToast' }, // 05/9 T-16: la pila dei messaggi
  { nome: 'NotificationPanel', schermata: 'schermoChat', selettore: '#pannelloNotifiche' }, // 06/9 T-17: «Aspetta te»
  { nome: 'ChatFooter', schermata: 'schermoChat', selettore: '#schermoChat .talos-chat-foot' },
  { nome: 'Review', schermata: 'schermoReview', selettore: '#schermoReview' },
  { nome: 'EmptyState', schermata: 'schermoVuota', selettore: '#schermoVuota .talos-conversation' },
];

test.describe('parità dei componenti ↔ mockup', () => {
  for (const comp of COMPONENTI) {
    test(`COMP ${comp.nome}: dai dati alla riga del mockup — struttura, parole, pixel`, async ({ browser }, info) => {
      const viewport = info.project.use.viewport;
      const m = await apri(browser, MOCKUP, { viewport });
      const a = await apri(browser, `${LAB}/?componente=${comp.nome}`, { viewport });
      await a.pagina.waitForSelector('html[data-visual-ready="true"]');
      await mostra(m.pagina, comp.schermata);
      await mostra(a.pagina, comp.schermata);
      if(comp.nome==='ProviderCard'){for(const p of [m.pagina,a.pagina])await p.evaluate(()=>document.getElementById('veloFornitori').hidden=false);}
      if(['MemoryMeter','RuntimeCard'].includes(comp.nome)){for(const p of [m.pagina,a.pagina])await p.evaluate(()=>{for(const n of document.querySelectorAll('#schermoModelLab [role=tabpanel]'))n.hidden=n.id!=='panel-runtime';});}
      if(comp.nome==='CatalogoModelli'){for(const p of [m.pagina,a.pagina])await p.evaluate(()=>{for(const n of document.querySelectorAll('#schermoModelLab [role=tabpanel]'))n.hidden=n.id!=='panel-catalogo';});expect(await a.pagina.locator('[data-catalog-detail] .talos-kv__k').nth(3).evaluate(n=>n.getBoundingClientRect().width),'CAT-ETICHETTA-INTEGRA').toBeGreaterThanOrEqual(90);}
      if(comp.nome==='FonteRicerca'){for(const p of [m.pagina,a.pagina])await p.evaluate(()=>{for(const el of document.querySelectorAll('#schermoImpostazioni [data-settings-panel]'))el.hidden=el.dataset.settingsPanel!=='tools';});}
      if(comp.sezione){await expect(a.pagina.locator('#capPanel-'+comp.sezione+' [data-ext-detail] .talos-kv__k').first(),'EXT-ETICHETTE-INTEGRE').toHaveCSS('white-space','normal');expect(await a.pagina.locator(comp.selettore+' use').evaluateAll(ns=>ns.every(n=>document.querySelector(n.getAttribute('href')))), 'EXT-ICONA-ESISTENTE').toBe(true);await m.pagina.locator('[data-cap-tab='+comp.sezione+']').click();await a.pagina.locator('[data-cap-tab='+comp.sezione+']').click();}
      if (comp.nome === 'Inspector_processi') { for (const p of [m.pagina, a.pagina]) await p.evaluate(() => { for (const t of document.querySelectorAll('#railTabs [role=tab]')) t.setAttribute('aria-selected', String(t.dataset.rail === 'processi')); for (const b of document.querySelectorAll('.talos-inspector__body')) b.hidden = b.id !== 'railProcessi'; }); }
      if (comp.nome === 'CodaDownload') { for (const p of [m.pagina, a.pagina]) await p.evaluate(() => { for (const n of document.querySelectorAll('#schermoModelLab [role=tabpanel]')) n.hidden = n.id !== 'panel-download'; }); }
      if (comp.nome === 'CatalogoHf') { for (const p of [m.pagina, a.pagina]) await p.evaluate(() => { for (const n of document.querySelectorAll('#schermoModelLab [role=tabpanel]')) n.hidden = n.id !== 'panel-hf'; }); }
      if (comp.nome === 'ModelliInstallati') { for (const p of [m.pagina, a.pagina]) await p.evaluate(() => { for (const n of document.querySelectorAll('#schermoModelLab [role=tabpanel]')) n.hidden = n.id !== 'panel-installati'; }); }
      if (comp.nome === 'NotificationPanel') { for (const p of [m.pagina, a.pagina]) await p.evaluate(() => { const n = document.querySelector('#pannelloNotifiche'); n.hidden = false; n.style.position = 'static'; }); }
      if (comp.nome === 'Toast') { for (const p of [m.pagina, a.pagina]) await p.evaluate(() => { const r = document.querySelector('#regioneToast'); r.hidden = false; for (const t of r.querySelectorAll('.talos-toast')) t.hidden = false; }); }
      expect(await struttura(a.pagina, comp.selettore), 'struttura').toEqual(await struttura(m.pagina, comp.selettore));
      expect(await testi(a.pagina, comp.selettore), 'parole').toEqual(await testi(m.pagina, comp.selettore));
      if (comp.nome === 'AutomationRow') {
        await expect(a.pagina.locator('[data-auto-stato]').first(), 'AUT-FILTRO-STILE-CANONICO').toHaveClass(/\btalos-tabs__tab\b/);
        expect(await a.pagina.locator('#schermoAutomazioni [role="switch"]').last().evaluate(n => n.getBoundingClientRect().bottom <= innerHeight), 'AUT-DENSITA-COMANDI').toBe(true);
      }
      if (comp.nome === 'TaskRow') {
        // ATTIVITA-CAMPO-COERENTE: la parità da sola può replicare un campo privo dello stile canonico.
        await expect(a.pagina.locator('[data-task-query]')).toHaveCSS('height', '36px');
      }
      // 06/9 B2: sotto i 1040 px la colonna dei dettagli è un pannello a scomparsa (chiuso) in entrambe le pagine: struttura e parole si confrontano, i pixel no
      if (comp.nome.startsWith('Inspector') && viewport.width <= 1040) { await m.contesto.close(); await a.contesto.close(); return; }
      const nome = `comp-${comp.nome}-${info.project.name}`;
      const esito = await confrontaPixel(nome, await m.pagina.locator(comp.selettore).screenshot(), await a.pagina.locator(comp.selettore).screenshot());
      expect(esito.ok, `${nome}: ${esito.motivo} — vedi artifacts/parita/${nome}-diff.png`).toBe(true);
      if (comp.nome === 'ToolList') {
        expect(await a.pagina.locator('[data-cap-list] .talos-measure--estimate').allTextContents(), 'CAP-STIMA-PREFISSO').not.toEqual(expect.arrayContaining([expect.stringMatching(/^~/)]));
        await a.pagina.locator('[data-cap-list] [role=option]').first().focus();await a.pagina.keyboard.press('End');await expect(a.pagina.locator('[data-cap-list] [role=option]').last()).toBeFocused();
        expect(await a.pagina.locator('[data-cap-list]').evaluate(n=>n.getBoundingClientRect().height),'CAP-LISTA-LUNGA').toBeLessThanOrEqual(480);
        await a.pagina.keyboard.press('Home');
      }
      await m.contesto.close();
      await a.contesto.close();
    });
  }
});
