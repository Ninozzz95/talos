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
      expect(await struttura(a.pagina, comp.selettore), 'struttura').toEqual(await struttura(m.pagina, comp.selettore));
      expect(await testi(a.pagina, comp.selettore), 'parole').toEqual(await testi(m.pagina, comp.selettore));
      if (comp.nome === 'TaskRow') {
        // ATTIVITA-CAMPO-COERENTE: la parità da sola può replicare un campo privo dello stile canonico.
        await expect(a.pagina.locator('[data-task-query]')).toHaveCSS('height', '36px');
      }
      const nome = `comp-${comp.nome}-${info.project.name}`;
      const esito = await confrontaPixel(nome, await m.pagina.locator(comp.selettore).screenshot(), await a.pagina.locator(comp.selettore).screenshot());
      expect(esito.ok, `${nome}: ${esito.motivo} — vedi artifacts/parita/${nome}-diff.png`).toBe(true);
      await m.contesto.close();
      await a.contesto.close();
    });
  }
});
