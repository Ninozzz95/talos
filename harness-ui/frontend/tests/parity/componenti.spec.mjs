import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';
import { MOCKUP, apri, confrontaPixel, mostra, radice, struttura, testi } from './aiuto.mjs';

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
 *  IL RIFERIMENTO SI AGGIORNA — 12/09/2026, BC-22
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `mockup/talos-mockup.html` è del 07/09. Fra l'08 e l'11/09 l'owner ha ordinato una serie di
 * cambiamenti che la app HA FATTO e il mockup NON ha: finché il riferimento resta indietro, il
 * cancello accusa la app di difetti che sono invece OBBEDIENZA a un ordine. Undici componenti su
 * trentasette erano rossi per questo.
 *
 * ⛔ La cura NON è spegnere un componente dal cancello né allargare la tolleranza dei pixel: è
 *   applicare alla COPIA del mockup, dentro la prova, la stessa correzione che l'ordine ha
 *   prodotto nel prodotto — è ciò che si è già fatto per `ReportRow` l'11/09 (qui sotto). Ogni
 *   correzione porta l'ordine che la giustifica e la data: senza quella riga non si capirebbe più
 *   perché il riferimento è stato toccato, e diventerebbe il posto dove nascondere i difetti.
 *
 * ⛔ Ciò che NON si tocca: tutto il resto continua a mordere. Dopo queste correzioni i componenti
 *   coincidono al PIXEL (0 px di differenza su dieci degli undici), quindi qualunque scivolamento
 *   futuro torna rosso.
 *
 * 📌 DEBITO DICHIARATO: la vera cura è ri-generare `mockup/talos-mockup.html` dal mockup
 *   interattivo dell'owner (`.claude/refactor-ui-owner-2026-09-11/Talos_Desktop_Final_Mockup_Interattivo.html`),
 *   che è il riferimento NUOVO. Finché quel lavoro non si fa, queste righe tengono il cancello
 *   vivo invece di lasciarlo rosso — e un cancello rosso «da sempre» è un cancello spento.
 */

/** Il `<nav class="talos-sidebar">…</nav>` di un documento, coi tag annidati contati. */
function estraiBarra(html) {
  const inizio = html.indexOf('<nav class="talos-sidebar"');
  if (inizio < 0) throw new Error('barra laterale non trovata nel documento');
  const re = /<nav\b|<\/nav>/g;
  re.lastIndex = inizio;
  let profondita = 0;
  let m;
  while ((m = re.exec(html))) {
    if (m[0] === '</nav>') { profondita -= 1; if (profondita === 0) return html.slice(inizio, m.index + 6); }
    else profondita += 1;
  }
  throw new Error('barra laterale non chiusa');
}
const BARRA_LOTTO_A = estraiBarra(readFileSync(path.join(radice, 'index.template.html'), 'utf8'));
const CSS_BARRA_LOTTO_A = readFileSync(path.join(radice, 'src/styles/mockup-sidebar.css'), 'utf8');
/* Il simbolo dello sprite che il mockup non ha: nasce con «Migliora il prompt» (BC-15, 11/09). */
const SIMBOLO_SPARKLES = '<symbol id="i-sparkles" viewBox="0 0 24 24"><path d="M10 3.5 11.7 8.3 16.5 10 11.7 11.7 10 16.5 8.3 11.7 3.5 10 8.3 8.3Z"/><path d="M17.5 14.5 18.3 16.7 20.5 17.5 18.3 18.3 17.5 20.5 16.7 18.3 14.5 17.5 16.7 16.7Z"/></symbol>';

/**
 * Porta la copia del mockup allo stato che gli ordini dell'owner hanno prodotto nella app.
 * Gira SOLO sulla pagina del mockup, mai su quella del laboratorio.
 */
async function aggiornaIlRiferimento(pagina, comp) {
  /*
   * ⛔ OGNI CORREZIONE SI APPLICA SOLO DOVE IL COMPONENTE GUARDA. Non è prudenza: aggiungere la
   *   riga «Chi legge i comandi che lanci tu con !» al dettaglio del Capability romperebbe i
   *   quattro `ExtensionList_*`, che confrontano la STESSA schermata ma non passano da
   *   `aggiornaPaginaCapability` e quindi quella riga non ce l'hanno. Una correzione giusta
   *   applicata nel posto sbagliato è un difetto nuovo.
   */
  /*
   * ⛔ LA BARRA SI PORTA SEMPRE, non solo per i tre componenti che la guardano: è larga quanto è
   *   larga, e la sua larghezza decide quella della colonna centrale. Misurato a 1024x800: con e
   *   senza il porting la barra resta 276 px e la colonna 748, quindi oggi non cambia un pixel —
   *   ma tenere il riferimento «a metà aggiornato» è ciò che fa nascere i falsi rossi, ed è più
   *   economico portarla sempre che scoprire domani quale componente se ne accorge.
   */
  const nellaBarra = true;
  const nelPiede = ['ChatFooter', 'Conversazione', 'EmptyState'].includes(comp.nome);
  const opzioni = {
    barra: nellaBarra ? BARRA_LOTTO_A : null,
    cssBarra: CSS_BARRA_LOTTO_A,
    sparkles: SIMBOLO_SPARKLES,
    /*
     * ⛔ I CONTEGGI VALGONO SOLO PER `NavItem`. Il markup statico del template non li scrive: li
     *   mette la app a giro vivo, e nel laboratorio solo la pagina `NavItem` rifà le voci dai dati
     *   (`creaNavItem` con `CONTEGGI`). `SessionItem` e `WorkspaceFooter` lasciano le voci statiche
     *   del template, senza numero — e mettendo i numeri nel riferimento anche per loro il cancello
     *   è tornato rosso su nove nodi. Misurato, non previsto.
     */
    conteggiNav: comp.nome === 'NavItem',
    apriStrumenti: comp.nome === 'NavItem',
    piede: nelPiede,
    fornitori: comp.nome === 'ProviderCard',
    libreria: comp.nome === 'LibraryRow',
    attrezzi: comp.nome === 'ToolList',
  };
  await pagina.evaluate(({ barra, cssBarra, sparkles, conteggiNav, apriStrumenti, piede: curaPiede, fornitori, libreria, attrezzi }) => {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    /* ──────────────────────────────────────────────────────────────────────────────────────────
     * 1) LA BARRA LATERALE — lotto A, owner 11/09 (mockup interattivo).
     *   «Spazi di lavoro» e «Strumenti» al posto di «Luoghi» + il disclosure «Altro»; cassetto
     *   sotto gli 860 px; conteggi conservati. Il mockup vecchio disegna ancora la barra di prima,
     *   quindi `SessionItem`, `NavItem` e `WorkspaceFooter` confrontavano due DISEGNI diversi.
     * ⛔ I conteggi NON vengono dalla app: si raccolgono dal mockup PRIMA di sostituire la barra e
     *   si rimettono sulle voci nuove. Sono i numeri che il riferimento ha sempre mostrato — se li
     *   prendessi dalla fixture, il cancello starebbe confrontando la app con sé stessa.
     * ⛔ Il foglio `mockup-sidebar.css` AGGIUNGE soltanto (testate di gruppo, cassetto, bottone di
     *   riga): senza di lui il markup nuovo resterebbe senza le sue misure.
     * ────────────────────────────────────────────────────────────────────────────────────────── */
    const vecchia = barra ? document.querySelector('nav.talos-sidebar') : null;
    if (vecchia && !document.getElementById('gruppoLavoro')) {
      const conteggi = {};
      if (conteggiNav) for (const voce of vecchia.querySelectorAll('.talos-nav-item[data-vaia]')) {
        const n = voce.querySelector('.talos-nav-item__count');
        if (n) conteggi[voce.dataset.vaia] = n.textContent;
      }
      vecchia.outerHTML = barra;
      for (const [vaia, testo] of Object.entries(conteggi)) {
        const voce = document.querySelector(`nav.talos-sidebar .talos-nav-item[data-vaia="${vaia}"]`);
        if (voce && !voce.querySelector('.talos-nav-item__count')) voce.insertAdjacentHTML('beforeend', `<span class="talos-nav-item__count">${testo}</span>`);
      }
      const foglio = document.createElement('style');
      foglio.textContent = cssBarra;
      document.head.append(foglio);
    }
    /* Il gruppo «Strumenti» nasce chiuso nel prodotto; la vetrina dei componenti lo apre (vedi il
       laboratorio `NavItem` in `lab/main.js`), e il riferimento deve aprirlo allo stesso modo. */
    if (apriStrumenti) {
      const gruppo = document.getElementById('gruppoStrumenti');
      if (gruppo) gruppo.hidden = false;
      document.getElementById('testataGruppoStrumenti')?.setAttribute('aria-expanded', 'true');
    }

    /* ──────────────────────────────────────────────────────────────────────────────────────────
     * 2) SOTTO IL COMPOSER NON SI LEGGE PIÙ NIENTE — owner 11/09, con la sua schermata: «la
     *   scritta 87,7k token · 3 giri sotto il composer la puoi rimuovere, anzi TUTTE le scritte
     *   sotto il composer, sono ridondanti». `index.template.html` le ha tolte (il contenitore
     *   resta, vuoto, perché l'avvio lo cerca); il mockup le disegna ancora, ed è la riga alta 16
     *   px che rendeva il piede più alto e la conversazione più corta.
     * ────────────────────────────────────────────────────────────────────────────────────────── */
    if (curaPiede) {
    for (const s of document.querySelectorAll('#schermoChat .talos-statusbar [data-statusbar="tema"], #schermoChat .talos-statusbar [data-runtime-usage], #schermoChat .talos-statusbar [data-runtime-cache], #schermoChat .talos-statusbar [data-runtime-latenza]')) s.remove();
    for (const b of document.querySelectorAll('#schermoVuota .talos-statusbar')) b.remove();

    /* 3) BC-15, 11/09 — «Migliora il prompt» accanto al «+»: le due cose che si fanno al messaggio
     *    PRIMA di mandarlo stanno insieme, a sinistra. Il mockup ha solo il «+». */
    const sprite = document.querySelector('svg.talos-sprite');
    if (sprite && !document.getElementById('i-sparkles')) sprite.insertAdjacentHTML('beforeend', sparkles);
    for (const piu of document.querySelectorAll('.talos-composer__bar .talos-composer__attach')) {
      if (piu.parentElement.querySelector('#miglioraPromptBtn')) continue;
      piu.insertAdjacentHTML('afterend', '<button type="button" class="talos-composer__attach" id="miglioraPromptBtn" aria-label="Migliora il prompt" aria-expanded="false" aria-controls="miglioraPromptPannello" title="Riscrivi il tuo messaggio col modello di questa chat"><svg class="i"><use href="#i-sparkles"/></svg></button>');
    }
    /* 4) PO-09, owner 09/09 + 11/09 — il terminale in basso: la pill nel composer accanto a «Giri»
     *    e il pannello che lo ospita, che nasce NASCOSTO (zero pixel, tre nodi di struttura). */
    for (const giri of document.querySelectorAll('.talos-composer__bar [data-runtime-giri]')) {
      if (giri.parentElement.querySelector('#pillTerminale')) continue;
      giri.insertAdjacentHTML('afterend', '<button type="button" class="talos-badge talos-badge--lg" data-c="Chip" id="pillTerminale" aria-expanded="false" aria-controls="pannelloTerminale" title="Apri il terminale qui sotto"><svg class="i i--sm"><use href="#i-terminal"/></svg><span class="talos-chip__label">Terminale</span></button>');
    }
    const piede = document.querySelector('#schermoChat .talos-chat-foot');
    if (piede && !document.getElementById('pannelloTerminale')) piede.insertAdjacentHTML('beforeend', '<section class="talos-terminale-basso" id="pannelloTerminale" hidden aria-label="Terminale"><div class="talos-terminale-basso__maniglia" role="separator" tabindex="0" aria-orientation="horizontal" aria-label="Altezza del terminale: frecce su e giù per cambiarla" data-maniglia-terminale></div><div class="talos-terminale-basso__ospite" data-ospite-terminale></div></section>');
    }

    /* ──────────────────────────────────────────────────────────────────────────────────────────
     * 5) LE AZIONI NON SI AFFIANCANO — owner 10/09: «non mettere i pulsanti uno accanto all'altro,
     *   usa i tre puntini + dropdown… e anche azioni tasto destro mouse, ragiona sempre in questo
     *   modo». La card di un fornitore ne allineava QUATTRO: adesso resta a vista solo l'azione che
     *   chiude il lavoro («Salva chiave») e le altre vivono nel menu «⋯», nascoste ma presenti nel
     *   DOM perché la regia delegata su `[data-provider-action]` le clicca.
     * ⛔ Si NASCONDONO, non si cancellano: nel prodotto ci sono, ed è giusto che il confronto di
     *   struttura continui a vederle.
     * ────────────────────────────────────────────────────────────────────────────────────────── */
    if (fornitori) for (const b of document.querySelectorAll('#veloFornitori [data-c=ProviderCard] [data-provider-action]')) {
      if (b.dataset.providerAction !== 'salva') b.hidden = true;
    }

    /* 6) La stessa regola nella riga della Libreria (10/09): un bottone solo, «⋯», più il modulo di
     *    rinomina in linea, la riga del messaggio e la conferma d'eliminazione — tutti nascosti, e
     *    tutti assenti dal mockup, che invece ha ancora l'«Apri» morto con `data-richiede="fase3"`. */
    if (libreria) for (const riga of document.querySelectorAll('#schermoLibreria [data-c="LibraryRow"]')) {
      if (riga.querySelector('.talos-list-row__azioni')) continue;
      const nome = esc(riga.querySelector('.talos-list-row__title').textContent);
      riga.querySelector('[data-richiede="fase3"]')?.remove();
      riga.dataset.modo = 'normale';
      riga.querySelector('.talos-list-row__title').insertAdjacentHTML('afterend',
        `<form class="talos-list-row__rinomina" hidden><input class="talos-list-row__nome" type="text" maxlength="255" autocomplete="off" spellcheck="false" aria-label="Nuovo nome per ${nome}"><button class="talos-button talos-button--primary talos-button--sm" type="submit" data-azione="rinomina-salva" aria-label="Salva il nuovo nome di ${nome}">Salva</button><button class="talos-button talos-button--ghost talos-button--sm" type="button" data-azione="rinomina-annulla" aria-label="Annulla la rinomina di ${nome}">Annulla</button></form>`);
      riga.querySelector('.talos-list-row__sub').insertAdjacentHTML('afterend', '<span class="talos-list-row__messaggio" hidden></span>');
      const dettagli = riga.querySelector('[aria-expanded]');
      dettagli.setAttribute('data-azione', 'dettagli');
      dettagli.insertAdjacentHTML('beforebegin',
        `<span class="talos-list-row__azioni" role="group" aria-label="Azioni su ${nome}"><button class="talos-button talos-button--ghost talos-button--sm" type="button" data-azione="menu" aria-label="Azioni su ${nome}" aria-haspopup="menu"><svg class="i" aria-hidden="true"><use href="#i-more"></use></svg></button></span>`
        + `<span class="talos-list-row__conferma" hidden><span class="talos-list-row__conferma-testo">Eliminare definitivamente? Non si torna indietro.</span><button class="talos-button talos-button--ghost talos-button--sm" type="button" data-azione="elimina-annulla" aria-label="Annulla l’eliminazione di ${nome}">Annulla</button><button class="talos-button talos-button--danger talos-button--sm" type="button" data-azione="elimina-conferma" aria-label="Elimina definitivamente ${nome}: non si torna indietro">Elimina</button></span>`);
    }

    /* ──────────────────────────────────────────────────────────────────────────────────────────
     * 7) «Chi legge i comandi che lanci tu con !» — D-10S, owner 11/09: «e anche su capability
     *   visto che sono collegati». Il pannello di dettaglio dell'attrezzo `shell` ha una scelta in
     *   più, che il mockup non conosce. Stessa forma del «Permesso» tre righe più su —
     *   `label.talos-stack` + `select.talos-select`, spiegazione in un `p.talos-muted` sotto.
     * ────────────────────────────────────────────────────────────────────────────────────────── */
    /* ──────────────────────────────────────────────────────────────────────────────────────────
     * 8) IL RESPIRO DELLA CONVERSAZIONE SOTTO I 1040 px — 11/09, cura documentata in
     *   `index.css` r. 593. Il mockup ha ancora `@media (max-width:1040px){ .talos-conversation
     *   {padding-left:0} }`: lasciava 0 a sinistra contro 44 a destra, e il testo finiva incollato
     *   alla barra mentre il composer partiva 44 px più in là. La app l'ha tolta (la colonna passa
     *   da 704 a 660 px, i due lati valgono 44 e 44). Senza questa riga `Conversazione` è rossa a
     *   1024 con tutto il contenuto spostato di 44 px — misurato, non dedotto.
     * ────────────────────────────────────────────────────────────────────────────────────────── */
    if (!document.getElementById('bc22-respiro-chat')) {
      const respiro = document.createElement('style');
      respiro.id = 'bc22-respiro-chat';
      /* ⛔ `:not(.talos-conversation--empty)`: la schermata vuota ha un `padding:28px` suo, che nella
         app vince perché arriva DOPO la regola di base. Rimettendo il respiro anche lì l'ho spostata
         di 16 px e `EmptyState` è tornata rossa a 1024 con 16.392 px — misurato. */
      respiro.textContent = '@media (max-width:1040px){ .talos-conversation:not(.talos-conversation--empty){padding-left:44px} }';
      document.head.append(respiro);
    }

    /* ──────────────────────────────────────────────────────────────────────────────────────────
     * 9) LO STATO VUOTO DEI SOTTO-AGENTI — la frase è cambiata quando le deleghe sono diventate
     *   vere (`inspector.js` r. 255 e `index.template.html` r. 1173): non promette più «i suoi
     *   giri e il pulsante per fermarlo», dice che cosa si vedrà davvero. Si legge solo a 1024,
     *   dove il pannello dei dettagli è chiuso e `innerText` ricade sul testo di tutti i nodi.
     * ────────────────────────────────────────────────────────────────────────────────────────── */
    for (const nota of document.querySelectorAll('#inspectorSessione .talos-inspector__hint')) {
      if (nota.textContent.startsWith('Nessun sotto-agente')) nota.textContent = 'Nessun sotto-agente in questa sessione. Quando una delega parte, qui compare con il suo compito, lo stato e quello che ha fatto; da lì si apre la sua conversazione o si ferma.';
    }

    const dettaglioAttrezzo = attrezzi ? document.querySelector('#schermoCapability [data-cap-dettaglio]') : null;
    if (dettaglioAttrezzo && !dettaglioAttrezzo.querySelector('[data-cap-uscita-riga]')) {
      dettaglioAttrezzo.insertAdjacentHTML('beforeend', '<div data-cap-uscita-riga=""><label class="talos-stack">Chi legge i comandi che lanci tu con !<select class="talos-select" data-cap-uscita="" aria-label="Chi legge l’uscita dei comandi lanciati con il punto esclamativo"><option value="no">Solo tu — come prima</option><option value="si">Anche il modello</option></select></label><p class="talos-muted" data-cap-uscita-spiega="">I comandi che lanci con «!» restano solo sul tuo schermo. Il modello non li vede.</p></div>');
    }
  }, opzioni);
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
      /* ⛔ 12/09 BC-22 — il riferimento va portato agli ordini dell'owner dell'08-11/09 PRIMA di
         qualunque confronto: vedi il blocco «IL RIFERIMENTO SI AGGIORNA» qui sopra. */
      await aggiornaIlRiferimento(m.pagina, comp);
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
      /*
       * ⛔ 11/09 L7 — L'UNICA DIVERGENZA DICHIARATA DAL MOCKUP, e perché non si spegne il cancello.
       *   Il mockup scrive due frasi che sul prodotto sono FALSE: «I rapporti vivono in
       *   .harness-ui-research/» (lì c'è solo la scheda della ricerca: il rapporto è una voce di
       *   Libreria, `research-orchestrator.mjs:132`) e «La consultazione del rapporto e delle fonti
       *   non è ancora disponibile qui» (da stasera si consulta). `index.template.html` le ha
       *   corrette, e senza questa riga la parità cadrebbe su parole E pixel.
       *   ⇒ Si applica la STESSA correzione alla copia del mockup, invece di togliere ReportRow dal
       *   cancello: tutto il resto — struttura, ogni altra parola, i pixel — continua a mordere.
       *   Motivo e diff in `.claude/RAPPORTO-RICERCA-L7-2026-09-11.md` §4.2.
       */
      if (comp.nome === 'ReportRow') {
        await m.pagina.evaluate(() => {
          const intro = document.querySelector('#schermoRicerca .talos-page__head p:not([data-research-esito])');
          if (intro) intro.textContent = 'Ogni ricerca approfondita di questo progetto, col suo rapporto, le affermazioni verificate e le fonti da cui vengono.';
          const dove = document.querySelector('#schermoRicerca .talos-where');
          if (dove) dove.textContent = 'Fino a 20 ricerche recenti di questo progetto.';
        });
      }
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
