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

/*
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *  LO STATO DEL LABORATORIO — 12/09/2026, BC-31
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ⭐ IL RIFERIMENTO NON SI CORREGGE PIÙ QUI. Fino a stamattina in questo punto stavano ~220 righe
 *   («IL RIFERIMENTO SI AGGIORNA», BC-22) che riscrivevano il DOM del mockup PRIMA di ogni
 *   confronto, per portarlo agli ordini dell'owner dell'08-11/09 che la app aveva già eseguito.
 *   Funzionava, ed era il posto sbagliato: un riferimento che si corregge da solo a ogni corsa non
 *   è un riferimento — è un posto dove un difetto può nascondersi senza che nessuno lo veda, e
 *   nessuno che apra `mockup/talos-mockup.html` scoprirebbe che la app non gli somiglia più.
 *
 * ⇒ Quelle correzioni vivono ora DENTRO `mockup/talos-mockup.html`, una per una, ognuna col suo
 *   commento HTML che dice l'ordine e la data: la barra a gruppi col cassetto (lotto A/D, markup e
 *   CSS dal mockup interattivo dell'owner dell'11/09), le scritte tolte sotto il composer,
 *   «Migliora il prompt» (BC-15), la pill del Terminale (PO-09), le azioni raccolte dietro il «⋯»
 *   in ProviderCard e nella riga di Libreria (owner 10/09), il respiro della conversazione sotto i
 *   1040 px, lo stato vuoto dei sotto-agenti e le due frasi della Ricerca (L7).
 *
 * ⛔ CIÒ CHE RESTA QUI NON CORREGGE IL RIFERIMENTO: mette la copia del mockup nello STATO in cui il
 *   laboratorio mette la app. Una pagina statica non può stare in due stati insieme, e il
 *   laboratorio ne sceglie uno per componente — quindi questi tre casi non possono stare nel file.
 *   Ognuno dice quale componente tocca e perché; se un giorno non serve più, si toglie.
 */

/*
 * I conteggi che il laboratorio `NavItem` passa a `creaNavItem` — sono quelli di
 * `lab/fixtures/luoghi.js`, cioè i numeri d'esempio del mockup.
 * ⛔ Il file del riferimento nasce SENZA: è un ordine dell'owner dell'11/09 («nessun conteggio
 *   scritto a mano», `index.template.html` r. 296-300) — un numero finto resta a schermo finché
 *   una rotta non risponde, cioè è una bugia per i primi secondi di ogni avvio. Il badge lo scrive
 *   `impostaConteggioNav` quando il numero VERO arriva. Il laboratorio `NavItem` esiste per far
 *   VEDERE il badge, quindi lì — e solo lì — il riferimento lo riceve.
 */
const CONTEGGI_NAV = { note: '11', attivita: '4', libreria: '18', memoria: '7', ricerca: '6', board: '69', capability: '43', officina: '2', automazioni: '3' };

/**
 * Porta la COPIA del mockup nello stesso stato in cui il laboratorio mette la app.
 * Gira SOLO sulla pagina del mockup, mai su quella del laboratorio.
 */
async function allineaLoStato(pagina, comp) {
  await pagina.evaluate(({ conteggi, apriStrumenti, attrezzi }) => {
    /* ──────────────────────────────────────────────────────────────────────────────────────────
     * 1) I CONTEGGI E IL GRUPPO APERTO — solo `NavItem`.
     *   Il laboratorio rifà le voci dai dati e apre «Strumenti», che nel prodotto nasce CHIUSO per
     *   non schiacciare l'elenco delle sessioni: una vetrina dei componenti che mostra un gruppo
     *   chiuso non mostra cinque voci su tredici.
     * ⛔ Misurato, non previsto: mettendo i conteggi nel riferimento anche per `SessionItem` e
     *   `WorkspaceFooter` — che NON rifanno le voci e quindi mostrano quelle del markup, senza
     *   numero — il cancello torna rosso su nove nodi.
     * ────────────────────────────────────────────────────────────────────────────────────────── */
    if (conteggi) for (const [vaia, testo] of Object.entries(conteggi)) {
      const voce = document.querySelector(`nav.talos-sidebar .talos-nav-item[data-vaia="${vaia}"]`);
      if (voce && !voce.querySelector('.talos-nav-item__count')) voce.insertAdjacentHTML('beforeend', `<span class="talos-nav-item__count">${testo}</span>`);
    }
    if (apriStrumenti) {
      const gruppo = document.getElementById('gruppoStrumenti');
      if (gruppo) gruppo.hidden = false;
      document.getElementById('testataGruppoStrumenti')?.setAttribute('aria-expanded', 'true');
    }

    /* ──────────────────────────────────────────────────────────────────────────────────────────
     * 2) «Chi legge i comandi che lanci tu con !» — solo `ToolList`. D-10S, owner 11/09: «e anche
     *   su capability visto che sono collegati». La riga NON è nel markup né nel mockup né nel
     *   template: la scrive `capability.js` (r. 108) quando disegna il dettaglio dell'attrezzo.
     * ⛔ Ed è per questo che non può stare nel file del riferimento: `ToolList` passa da
     *   `aggiornaPaginaCapability` (e la riga c'è), i quattro `ExtensionList_*` guardano la STESSA
     *   schermata senza passare di lì (e la riga non c'è). Scrivendola nel mockup, quattro
     *   componenti su cinque diventerebbero rossi. Non è una divergenza fra mockup e prodotto: è
     *   una divergenza fra due stati del laboratorio.
     * ────────────────────────────────────────────────────────────────────────────────────────── */
    const dettaglioAttrezzo = attrezzi ? document.querySelector('#schermoCapability [data-cap-dettaglio]') : null;
    if (dettaglioAttrezzo && !dettaglioAttrezzo.querySelector('[data-cap-uscita-riga]')) {
      dettaglioAttrezzo.insertAdjacentHTML('beforeend', '<div data-cap-uscita-riga=""><label class="talos-stack">Chi legge i comandi che lanci tu con !<select class="talos-select" data-cap-uscita="" aria-label="Chi legge l’uscita dei comandi lanciati con il punto esclamativo"><option value="no">Solo tu — come prima</option><option value="si">Anche il modello</option></select></label><p class="talos-muted" data-cap-uscita-spiega="">I comandi che lanci con «!» restano solo sul tuo schermo. Il modello non li vede.</p></div>');
    }
  }, {
    conteggi: comp.nome === 'NavItem' ? CONTEGGI_NAV : null,
    apriStrumenti: comp.nome === 'NavItem',
    attrezzi: comp.nome === 'ToolList',
  });
}

test.describe('parità dei componenti ↔ mockup', () => {
  for (const comp of COMPONENTI) {
    test(`COMP ${comp.nome}: dai dati alla riga del mockup — struttura, parole, pixel`, async ({ browser }, info) => {
      const viewport = info.project.use.viewport;
      const m = await apri(browser, MOCKUP, { viewport });
      const a = await apri(browser, `${LAB}/?componente=${comp.nome}`, { viewport });
      await a.pagina.waitForSelector('html[data-visual-ready="true"]');
      await mostra(m.pagina, comp.schermata);
      await mostra(a.pagina, comp.schermata);
      /* ⛔ 12/09 BC-31 — il riferimento ADESSO è il file: qui resta solo lo stato in cui il
         laboratorio mette la app (blocco «LO STATO DEL LABORATORIO» qui sopra). */
      await allineaLoStato(m.pagina, comp);
      if(comp.nome==='ProviderCard'){for(const p of [m.pagina,a.pagina])await p.evaluate(()=>document.getElementById('veloFornitori').hidden=false);}
      if(['MemoryMeter','RuntimeCard'].includes(comp.nome)){for(const p of [m.pagina,a.pagina])await p.evaluate(()=>{for(const n of document.querySelectorAll('#schermoModelLab [role=tabpanel]'))n.hidden=n.id!=='panel-runtime';});}
      if(comp.nome==='CatalogoModelli'){for(const p of [m.pagina,a.pagina])await p.evaluate(()=>{for(const n of document.querySelectorAll('#schermoModelLab [role=tabpanel]'))n.hidden=n.id!=='panel-catalogo';});expect(await a.pagina.locator('[data-catalog-detail] .talos-kv__k').nth(3).evaluate(n=>n.getBoundingClientRect().width),'CAT-ETICHETTA-INTEGRA').toBeGreaterThanOrEqual(90);}
      if(comp.nome==='FonteRicerca'){for(const p of [m.pagina,a.pagina])await p.evaluate(()=>{for(const el of document.querySelectorAll('#schermoImpostazioni [data-settings-panel]'))el.hidden=el.dataset.settingsPanel!=='tools';});}
      if(comp.sezione){await expect(a.pagina.locator('#capPanel-'+comp.sezione+' [data-ext-detail] .talos-kv__k').first(),'EXT-ETICHETTE-INTEGRE').toHaveCSS('white-space','normal');expect(await a.pagina.locator(comp.selettore+' use').evaluateAll(ns=>ns.every(n=>document.querySelector(n.getAttribute('href')))), 'EXT-ICONA-ESISTENTE').toBe(true);await m.pagina.locator('[data-cap-tab='+comp.sezione+']').click();await a.pagina.locator('[data-cap-tab='+comp.sezione+']').click();}
      if (comp.nome === 'Inspector_processi') { for (const p of [m.pagina, a.pagina]) await p.evaluate(() => { for (const t of document.querySelectorAll('#railTabs [role=tab]')) t.setAttribute('aria-selected', String(t.dataset.rail === 'processi')); for (const b of document.querySelectorAll('.talos-inspector__body')) b.hidden = b.id !== 'railProcessi'; }); }
      if (comp.nome === 'CodaDownload') { for (const p of [m.pagina, a.pagina]) await p.evaluate(() => { for (const n of document.querySelectorAll('#schermoModelLab [role=tabpanel]')) n.hidden = n.id !== 'panel-download'; }); }
      if (comp.nome === 'CatalogoHf') { for (const p of [m.pagina, a.pagina]) await p.evaluate(() => { for (const n of document.querySelectorAll('#schermoModelLab [role=tabpanel]')) n.hidden = n.id !== 'panel-hf'; }); }
      if (comp.nome === 'ModelliInstallati') { for (const p of [m.pagina, a.pagina]) await p.evaluate(() => { for (const n of document.querySelectorAll('#schermoModelLab [role=tabpanel]')) n.hidden = n.id !== 'panel-installati'; }); }
      /*
       * ⛔⛔ 12/09 BC-22 — 581 PIXEL CHE NON ERANO UN DIFETTO DEL DISEGNO, MA DEL RASTER.
       *   Le due pagine disegnavano il pannello IDENTICO — stessa struttura, stesse parole, stessa
       *   geometria fino al centesimo di pixel (misurato: `getBoundingClientRect` uguale su tutti i
       *   figli, stesso font, stesso `color`) — e differivano su 581 px, lo 0,642%, cioè sopra la
       *   soglia. La causa: il testo del mockup esce in scala di grigi e quello della app in
       *   subpixel LCD (croma media 9,9 contro 54,4), perché i due documenti finiscono in due
       *   livelli di composizione diversi. È una differenza di RASTERIZZAZIONE, non di disegno.
       * ⇒ Si promuove il pannello a livello suo su ENTRAMBE le pagine: così il testo viene
       *   rasterizzato allo stesso modo di qua e di là, e restano visibili solo le differenze vere.
       *   Misurato dopo: 0 pixel. Allargare la tolleranza avrebbe nascosto anche quelle vere.
       * ⛔ APERTO: non ho trovato CHI mette il mockup in un livello composto (nessun `transform`,
       *   `opacity`, `filter`, `will-change` o `backdrop-filter` sul pannello né sui suoi antenati,
       *   e la Topbar della stessa pagina esce identica nei due documenti). Scritto nel rapporto.
       */
      if (comp.nome === 'NotificationPanel') { for (const p of [m.pagina, a.pagina]) await p.evaluate(() => { const n = document.querySelector('#pannelloNotifiche'); n.hidden = false; n.style.position = 'static'; n.style.willChange = 'transform'; }); }
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
