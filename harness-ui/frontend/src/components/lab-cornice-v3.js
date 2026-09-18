/*
 * ============================================================================
 * IL GUSCIO DEL LABORATORIO MODELLI — QUATTRO SCHEDE
 * ============================================================================
 * Corsia 2 del port del Laboratorio modelli, 18/09/2026.
 *
 * L'owner ha deciso la tassonomia: **Modelli · Provider · Download · Sistema**,
 * col catalogo unificato. Il guscio del mockup sta in
 * `prototypes/calm-lab/src/model-lab.mjs:10-13` (intestazione, banda di
 * configurazione, quattro schede, pannello) e nel suo `src/styles.css`.
 *
 * ⛔ COSA CAMBIA E COSA NO. Si porta la STRUTTURA del mockup (intestazione,
 * banda, quattro schede, un pannello per scheda) e si tiene il LINGUAGGIO
 * VISIVO del prodotto: solo classi `talos-*` già spedite — `talos-tabs`,
 * `talos-tabs__tab`, `talos-tabs__count`, `talos-tabs__panels`,
 * `talos-tabs__panel`, `talos-card--pad`, `talos-cluster`, `talos-stack`,
 * `talos-muted`, `talos-lab__meter`, `workspace-sr`. (Regola owner 04/09:
 * si cambia la struttura, non il linguaggio visivo.)
 *
 * ⛔ PERCHÉ QUESTO MODULO NON PORTA NESSUN FOGLIO DI STILE PROPRIO, e non è
 * una rinuncia: è una misura. La CSP di questo server è
 * `style-src 'self' 'nonce-…'` (`harness-ui/src/http-app.mjs:572`), quindi un
 * `<style>` creato da JavaScript **viene scartato dal browser in silenzio** —
 * è già costato una volta in questo repo e la lezione sta scritta a
 * `http-app.mjs:638` («il browser li scartava senza un errore in pagina»).
 * Un guscio che si veste da solo sarebbe sembrato giusto in prova e nudo nel
 * prodotto. ⇒ O si usa il design system esistente, o si chiede al
 * coordinatore di scrivere le regole in `src/styles/` (che non è mio).
 *
 * ⛔ NESSUNA SEZIONE SI PERDE IN SILENZIO. Il guscio si monta solo se OGNI
 * `[data-model-lab-panel]` del DOM ha una scheda che lo contiene; se ne trova
 * uno che non sa dove mettere, **nega il montaggio** (`false`), scrive il
 * motivo in `data-lab-guscio-negato` e avvisa in console — non lancia, e non
 * monta a metà. (Lezioni: `una-guardia-che-esplode-e-assente.md` e
 * `un-elenco-vuoto-non-limita-allarga.md`.)
 *
 * ⛔⛔ DUE LIVELLI, DUE PROPRIETARI — e il guscio non scrive nello stato altrui.
 * Fuori (le quattro schede, i quattro gruppi) è del guscio. Dentro (quale delle
 * sei sezioni è accesa) è di `app.js`: il guscio la LEGGE e ne deduce la scheda
 * (`sezioneMostrata` → `sincronizzaGuscioLaboratorio`). Il motivo è misurato:
 * in questa carta `hidden` è l'unico meccanismo che nasconde (il CSS dei
 * pannelli non attivi è scoped ai dialoghi, `foglio-monolite.css:289`), quindi
 * due scrittori sullo stesso attributo sono una lite, non una ridondanza.
 *
 * ⛔ COSA SERVE AL COORDINATORE: **UNA RIGA SOLA**, e non è in questo file.
 * Subito dopo `montaCorniceModelLab(...)` (`app.js:4617`), e con la STESSA
 * espressione che quella riga usa:
 *   `montaGuscioLaboratorio($('#modelLabCardSettings') || $('#modelLabCard'));`
 * e l'import accanto agli altri (`app.js:22`):
 *   `import {montaGuscioLaboratorio} from '../components/lab-cornice-v3.js';`
 * **Nessun'altra modifica ad `app.js`**, e l'ORDINE non conta più. Misurato il
 * 18/09/2026: `#modelLabCardSettings` **non esiste** in nessun frammento né
 * nell'HTML servito (`harness-ui/public/index.html:1076` porta solo
 * `<article data-settings-reuse="modelLabCard">`), quindi oggi il bersaglio vero
 * è `#modelLabCard` — ma si scrive come la riga sopra, così se quel contenitore
 * nascerà il guscio lo seguirà da solo.
 *
 * ⛔⛔ PERCHÉ NON CONTA — il clic viaggia sui bottoni VERI dell'app, non su una
 * imitazione. Il guscio non toglie le sei linguette legacy: le sposta in un
 * contenitore `hidden` dentro la carta (la «superficie di comando») e, quando
 * una scheda deve accendersi, preme il bottone legacy della sezione giusta
 * (`comando.click()`). Così il percorso che si esegue è quello di sempre —
 * listener del `<button>` (`app.js:4627`) → `setModelLabSection`
 * (`app.js:4192`) → `hidden` sui pannelli, `state.modelLab.section`, e il
 * caricatore della sezione (`app.js:4196-4198`, più i richiami interni che
 * passano nomi che come scheda non esistono: `'installed'` da
 * `app.js:22259`, `'huggingface'` dal catalogo).
 *
 * ⛔ E QUESTA È LA SECONDA VERSIONE, dopo che la prima è stata MISURATA
 * SBAGLIATA: il guscio toglieva le sei linguette e metteva alle sue quattro
 * schede `data-model-lab-tab`, contando sul fatto che `$$('[data-model-lab-tab]')`
 * (`app.js:4627`) le trovasse — vero SOLO se il montaggio avviene prima di
 * quella riga. Montato dopo (o rimontato), il clic cambiava i pannelli per
 * scrittura diretta senza che `state.modelLab` e i caricatori lo sapessero:
 * **una scheda che si accende e non carica niente è peggio di una che non si
 * accende**, perché sembra funzionare. Le mie quattro schede quindi NON
 * portano `data-model-lab-tab`: quel vocabolario resta ai sei bottoni legacy,
 * che è di chi li ha scritti.
 *
 * ⛔ IL RIPIEGO RESTA, PER UNA CARTA SENZA COMANDI: se una scheda non ha né un
 * pannello acceso né un bottone legacy corrispondente (una prova, una carta
 * costruita a mano) la sezione si accende per scrittura diretta
 * (`attivaSezione`). È l'unico caso in cui questo modulo tocca lo stato
 * interno, ed è mutuamente esclusivo col percorso vero.
 *
 * ---------------------------------------------------------------------------
 * RICERCHE — fonte + data (regola owner: ricerca a ogni passo)
 * ---------------------------------------------------------------------------
 * 1. **Tablist accessibile** — W3C WAI-ARIA Authoring Practices, «Tabs
 *    Pattern» <https://www.w3.org/WAI/ARIA/apg/patterns/tabs/>, consultato il
 *    **18/09/2026**. Da lì: `role=tablist` con nome accessibile, `role=tab`
 *    con `aria-selected`, `aria-controls` che punta al SUO pannello,
 *    `role=tabpanel` con `aria-labelledby`; una sola scheda nel tab order
 *    (roving tabindex) e le frecce che spostano il fuoco («Keyboard
 *    Interaction»: Left/Right con avvolgimento, Home/End opzionali); il
 *    pannello prende `tabindex="0"` quando non contiene elementi attivabili.
 *    ⇒ È anche il motivo per cui il mockup NON si copia alla lettera:
 *    `model-lab.mjs:13` dà a TUTTE e quattro le schede `aria-controls="lab-panel"`
 *    — un pannello solo per quattro schede — e l'APG vuole un pannello per
 *    scheda. Qui ogni scheda ha il suo.
 * 2. **Il conteggio su una scheda** — «Accessible Tabs» (accessibility.build,
 *    <https://accessibility.build/guides/accessible-tabs>) e la discussione
 *    wagtail/wagtail#9521 («Add accessible count to tabs»), consultati il
 *    **18/09/2026**: il numero visibile è decorazione (`aria-hidden="true"`) e
 *    il significato viaggia in un testo per i lettori di schermo, così che il
 *    nome accessibile della scheda lo contenga davvero; e un conteggio a zero
 *    **non si disegna** invece di mostrare «0». Il progetto ha già la classe
 *    per il testo riservato ai lettori di schermo: `.workspace-sr`
 *    (`src/design-system/foundations.css:27`).
 * 3. **Il plurale in un posto solo** — `src/components/plurale.js` (difetto
 *    BH-12, 06/09/2026): nove componenti scrivevano «1 ricordi». Qui il
 *    conteggio passa da `plurale()`, e la parola «attivi» non essendo in
 *    `FORME` si dichiara col terzo argomento.
 *
 * ⛔ NON MIEI, E NON LI TOCCO: `src/legacy/app.js` e `index.template.html`
 * (linguette legacy e punti di montaggio: sono del coordinatore).
 * ============================================================================
 */

import { STATI_DOWNLOAD } from './download-coda.js';
import { plurale } from './plurale.js';
import { avvolgiStrisciaSchede } from './cornice-model-lab.js';

const NS_SVG = 'http://www.w3.org/2000/svg';

/**
 * LE QUATTRO SCHEDE, E COSA CONTENGONO.
 *
 * `sezioni` sono i `data-model-lab-panel` legacy che ogni scheda raggruppa:
 * è la mappa completa, e `schedaDiSezione` la usa in questo verso. Aggiungere
 * una sezione senza metterla qui NON la nasconde: fa negare il montaggio.
 */
/*
 * ⭐⭐ 18/09/2026 — LA FRASE DI OGNI SCHEDA, presa dal mockup e non inventata.
 * Il confronto testa a testa (`artifacts/parita-mockup-2026-09-18/`) mostra che ogni scheda del
 * mockup si apre con un TITOLO-FRASE e una riga che dice a cosa serve: «Il dispositivo, senza
 * supposizioni.», «Collegamenti, non scatole nere.», «Ogni download, al suo posto.». Da noi non
 * c'erano, e le schede cominciavano direttamente dai controlli.
 * ⛔ La scheda «Modelli» NON ha frase, e non è una dimenticanza: nel mockup non ce l'ha — lì la
 *   scheda va dritta al catalogo, che porta già la propria testata («Catalogo dei fornitori»).
 *   Inventarne una per simmetria sarebbe aggiungere una parola che il mockup non ha.
 */
export const SCHEDE_LAB = Object.freeze([
  /*
   * ⛔⛔ OWNER, 18/09/2026, testuale: «DEVI COLLEGARE NELLA SEZIONE MODELLI IL CATALOGO HUGGING
   *   FACE, NON QUELLO DEI PROVIDER». La scheda «Modelli» apriva sul pannello `catalog`, che è
   *   il catalogo dei FORNITORI («Catalogo dei fornitori — Modelli osservati su OpenRouter»):
   *   i modelli di un servizio, non i modelli che si possono avere.
   *   ⇒ «Modelli» porta Hugging Face (i modelli da scaricare) e gli Installati; il catalogo dei
   *     fornitori va dove i fornitori si configurano, cioè in «Provider».
   * ⛔ L'ORDINE conta: aprendo una scheda l'app accende la sua PRIMA sezione, quindi `huggingface`
   *   sta davanti a `installed`.
   * Ricerca 18/09/2026 (vucense.com «Ollama vs LM Studio 2026»; thepromptbench.com; dev.to
   * nishilbhave): il tab «Discover» di LM Studio — il prodotto a cui questo laboratorio si
   * ispira — si collega DIRETTAMENTE a Hugging Face ed è «la ragione principale per cui la
   * gente parte da lì»; Ollama, che ha un registro suo, è descritto come più povero da
   * esplorare. I due lati restano separati: il catalogo dei modelli da una parte, i fornitori
   * dall'altra, come i runtime locali trattati da «provider» intercambiabili.
   */
  Object.freeze({ id: 'models', etichetta: 'Modelli', icona: 'i-brain', sezioni: Object.freeze(['huggingface', 'installed']) }),
  Object.freeze({ id: 'providers', etichetta: 'Provider', icona: 'i-link', sezioni: Object.freeze(['providers', 'catalog']),
    frase: Object.freeze({ titolo: 'Collegamenti, non scatole nere.', nota: 'Credenziale, configurazione e raggiungibilità sono tre fatti diversi.' }) }),
  Object.freeze({ id: 'downloads', etichetta: 'Download', icona: 'i-download', sezioni: Object.freeze(['downloads']),
    frase: Object.freeze({ titolo: 'Ogni download, al suo posto.', nota: 'Avanzamento, pause e recupero senza perdere il contesto.' }) }),
  Object.freeze({ id: 'system', etichetta: 'Sistema', icona: 'i-command', sezioni: Object.freeze(['overview']),
    frase: Object.freeze({ titolo: 'Il dispositivo, senza supposizioni.', nota: 'Distinguì ciò che è misurato, stimato o ancora sconosciuto.' }) }),
]);

const SCHEDA_DI_SEZIONE = new Map();
for (const scheda of SCHEDE_LAB) {
  SCHEDA_DI_SEZIONE.set(scheda.id, scheda.id);
  for (const sezione of scheda.sezioni) SCHEDA_DI_SEZIONE.set(sezione, scheda.id);
}

/**
 * La scheda che contiene una sezione, dal nome di una o dell'altra.
 * `schedaDiSezione('catalog')` e `schedaDiSezione('models')` danno la stessa
 * scheda: è ciò che rende `sezioneCanonica` una funzione e non una tabella
 * scritta a mano in due posti.
 * @returns {object|null} la scheda, oppure `null` se il nome è sconosciuto.
 */
export function schedaDiSezione(sezione) {
  const id = SCHEDA_DI_SEZIONE.get(String(sezione ?? '').trim());
  return id ? SCHEDE_LAB.find(scheda => scheda.id === id) ?? null : null;
}

/**
 * L'id canonico della scheda.
 * ⭐ È la riga che serve al coordinatore in `app.js`: `setModelLabSection`
 * riceve ancora i nomi vecchi dai suoi richiami (`'overview'`, `'installed'`),
 * e con questa in testa li traduce da sola.
 * @returns {string|null} `'models' | 'providers' | 'downloads' | 'system'`, o `null`.
 */
export function sezioneCanonica(sezione) {
  return schedaDiSezione(sezione)?.id ?? null;
}

/**
 * Quanti download stanno lavorando adesso.
 * ⛔ La verità sugli stati è UNA e sta in `download-coda.js` (`STATI_DOWNLOAD`,
 * col suo `attivo`): qui non si riscrive l'elenco. Il mockup contava
 * `running|paused|error` (`model-lab.mjs:12`); la nostra coda ha sette stati e
 * `attivo` li copre tutti, quindi il conteggio è più onesto di quello del
 * mockup, non diverso per gusto.
 * @param {Element} radice dove stanno le righe dei download.
 */
export function downloadAttivi(radice) {
  if (!radice?.querySelectorAll) return 0;
  let quanti = 0;
  for (const riga of radice.querySelectorAll('[data-download-id]')) {
    if (STATI_DOWNLOAD[riga.dataset.state]?.attivo === true) quanti += 1;
  }
  return quanti;
}

/**
 * Il numero sulla scheda Download — visibile + `data-lab-conteggio-detto`.
 * @param {Element} card
 * @param {{downloads?: number}} conteggi
 * @returns {number} il conteggio applicato.
 */
export function aggiornaConteggiScheda(card, conteggi = {}) {
  if (!card?.querySelectorAll) return 0;
  const quanti = Math.max(0, Math.trunc(Number(conteggi.downloads) || 0));
  const doc = card.ownerDocument;
  for (const tab of card.querySelectorAll('[data-lab-scheda]')) {
    const dovuto = tab.dataset.labScheda === 'downloads' ? quanti : 0;
    let visibile = tab.querySelector('.talos-tabs__count');
    let detto = tab.querySelector('[data-lab-conteggio-detto]');
    // Ricerca 18/09: a zero il numero non si disegna — non «0».
    if (dovuto <= 0) { visibile?.remove(); detto?.remove(); continue; }
    if (!visibile) {
      visibile = doc.createElement('span');
      visibile.className = 'talos-tabs__count';
      visibile.setAttribute('aria-hidden', 'true');
      tab.append(visibile);
    }
    const testo = String(dovuto);
    if (visibile.textContent !== testo) visibile.textContent = testo;
    if (!detto) {
      detto = doc.createElement('span');
      detto.className = 'workspace-sr';
      detto.dataset.labConteggioDetto = '';
      tab.append(detto);
    }
    const frase = plurale(dovuto, 'attivo', 'attivi');
    if (detto.textContent !== frase) detto.textContent = frase;
  }
  return quanti;
}

/*
 * I tre nodi veri da cui la banda legge. `#modelLabActiveModel` lo
 * SCRIVIAMO (lo sposta dentro la banda, conservandolo); gli altri due li
 * LEGGIAMO soltanto — stanno nel pannello Sistema e `montaMisuraMemoria` li
 * ricrea, quindi vanno rispecchiati, non spostati.
 * ⛔ `#machineAllocatableMetric` NON si usa: è l'allocabile sul DISCO, non la
 * RAM (lezione del 18/09 «una conclusione tratta da un nome, non da una
 * misura»; `local-runtime-probe.mjs:251`).
 */
const NODO = Object.freeze({
  modello: '#modelLabActiveModel',
  libera: '#machineFreeMemoryMetric',
  totale: '#machineMemoryMetric',
});

function testoDi(radice, selettore) {
  const nodo = radice?.querySelector(selettore);
  const testo = nodo?.textContent?.trim() ?? '';
  return testo.length > 0 ? testo : null;
}

/** Solo GiB: una misura in MiB non è un rapporto con una in GiB. */
function gib(testo) {
  const trovato = /^([\d.,]+)\s*GiB$/i.exec(String(testo ?? '').trim());
  if (!trovato) return null;
  const numero = Number(trovato[1].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

/**
 * La banda rispecchia i valori VERI che stanno nel pannello Sistema.
 * ⛔ Scrive solo se il valore è cambiato: è ciò che rende innocuo il
 * `MutationObserver` che la richiama (una scrittura identica non è una
 * mutazione, e il giro si ferma).
 * @returns {boolean} se ha scritto qualcosa.
 */
export function aggiornaBandaLaboratorio(card) {
  const banda = card?.querySelector('[data-lab-banda]');
  if (!banda) return false;
  const libera = testoDi(card, NODO.libera);
  const totale = testoDi(card, NODO.totale);
  const valore = banda.querySelector('[data-lab-banda-valore]');
  const frazione = banda.querySelector('[data-lab-banda-frazione]');
  const barra = banda.querySelector('[data-lab-banda-track]');
  let scritto = false;
  // Si rispecchia ciò che la fonte dice, compreso il suo «—»: se la fonte non
  // c'è, si mostra «—» e la barra SPARISCE. Non si inventa uno zero.
  const mostra = libera ?? '—';
  if (valore && valore.textContent !== mostra) { valore.textContent = mostra; scritto = true; }
  const su = totale ? `su ${totale}` : '';
  if (frazione && frazione.textContent !== su) { frazione.textContent = su; scritto = true; }
  if (barra) {
    const massimo = gib(totale);
    const attuale = gib(libera);
    const misurabile = massimo !== null && attuale !== null;
    if (barra.hidden === misurabile) { barra.hidden = !misurabile; scritto = true; }
    if (misurabile) {
      if (barra.max !== massimo) { barra.max = massimo; scritto = true; }
      if (barra.value !== attuale) { barra.value = attuale; scritto = true; }
    }
  }
  return scritto;
}

/** Quale scheda è aperta adesso (o `null`). */
export function schedaAttiva(card) {
  return card?.dataset?.labSchedaAttiva ?? null;
}

/*
 * ---------------------------------------------------------------------------
 * ⛔ UNA SOLA FONTE DI VERITÀ PER LO STATO INTERNO, E NON È QUESTO MODULO.
 * ---------------------------------------------------------------------------
 * `app.js` possiede le sei sezioni: `setModelLabSection` (`app.js:4192`) scrive
 * `hidden` e `.active` sui `[data-model-lab-panel]`. E in QUESTA carta `hidden`
 * è l'unico meccanismo che nasconde davvero — il CSS che spegne i pannelli non
 * attivi è scoped ai dialoghi (`src/styles/foglio-monolite.css:289`), nella
 * carta Impostazioni non esiste nessuna regola `.model-lab-panel`, e nessun
 * `[hidden]` viene riportato a `display:block` da un autore (`dist/styles.css`:
 * zero regole `[hidden]`; `.talos-tabs__panel` a `src/styles/primitives.css:148`
 * mette `min-height`, `color` e `line-height`, **non** `display`).
 * ⇒ Il guscio NON riscrive lo stato interno: lo LEGGE e ne deriva quale delle
 * sue quattro schede è aperta. Così segue l'app su QUALUNQUE strada, comprese
 * quelle che passano un nome che come scheda non esiste — `'installed'` dai
 * richiami interni (`app.js:22259`), `'huggingface'` dal catalogo — e nessuna
 * riga di `app.js` deve cambiare per questo.
 */

/** La sezione che l'app sta mostrando: chi non è nascosto, o chi è acceso. */
function sezioneMostrata(card) {
  const pannelli = [...card.querySelectorAll('[data-model-lab-panel]')];
  const visibile = pannelli.find(pannello => pannello.hidden === false);
  if (visibile) return visibile.dataset.modelLabPanel ?? null;
  return pannelli.find(pannello => pannello.classList.contains('active'))?.dataset.modelLabPanel ?? null;
}

/** Schede e gruppi, e nient'altro. ⛔ Scrive solo ciò che cambia: il giro si ferma. */
function applicaStato(card, id) {
  for (const tab of card.querySelectorAll('[data-lab-scheda]')) {
    const attiva = tab.dataset.labScheda === id;
    if (tab.getAttribute('aria-selected') !== String(attiva)) tab.setAttribute('aria-selected', String(attiva));
    tab.tabIndex = attiva ? 0 : -1;
    tab.classList.toggle('active', attiva);
  }
  for (const gruppo of card.querySelectorAll('[data-lab-pannello]')) {
    const attivo = gruppo.dataset.labPannello === id;
    if (gruppo.hidden !== !attivo) gruppo.hidden = !attivo;
    gruppo.classList.toggle('active', attivo);
  }
  if (card.dataset.labSchedaAttiva === id) return false;
  card.dataset.labSchedaAttiva = id;
  const CE = card.ownerDocument?.defaultView?.CustomEvent;
  if (CE) card.dispatchEvent(new CE('lab:scheda', { detail: { scheda: id }, bubbles: true }));
  return true;
}

/** Accende una sezione interna. ⛔ Usata SOLO dal ripiego di `selezionaScheda`. */
function attivaSezione(card, sezione) {
  for (const pannello of card.querySelectorAll('[data-model-lab-panel]')) {
    const attivo = pannello.dataset.modelLabPanel === sezione;
    if (pannello.hidden !== !attivo) pannello.hidden = !attivo;
    pannello.classList.toggle('active', attivo);
  }
}

/**
 * Il pannello di questa sezione è acceso? È la POST-CONDIZIONE del clic
 * inoltrato: `HTMLElement.click()` su un bottone senza listener non lancia e non
 * fa niente (MDN, `HTMLElement.click()`, letto il 18/09/2026: «simulates a mouse
 * click… the element's click event is fired… Return value: None»), quindi il
 * clic da solo non è una prova che la sezione si sia accesa.
 */
function accesaSezione(card, sezione) {
  const pannello = card.querySelector(`[data-model-lab-panel="${sezione}"]`);
  return Boolean(pannello) && (pannello.hidden === false || pannello.classList.contains('active'));
}

/**
 * Allinea le quattro schede alla sezione che l'app sta mostrando.
 * ⭐ È la riga che tiene il guscio onesto quando l'app si muove da sola: la
 * chiama l'osservatore a ogni cambiamento dei pannelli.
 * @returns {string|null} la scheda aperta.
 */
export function sincronizzaGuscioLaboratorio(card) {
  if (!card?.dataset || card.dataset.labGuscio !== 'v3') return null;
  const mostrata = sezioneMostrata(card);
  const sua = schedaDiSezione(mostrata);
  // ⛔ Si ricorda l'ultima sezione vista dentro ogni scheda: è quella che la
  // scheda riapre quando ci si torna. Senza questa memoria, uscire da «Modelli»
  // e rientrare riporterebbe sempre alla PRIMA sezione invece che a quella
  // lasciata — e l'unico modo di riaprirla è chiederla all'app, quindi la
  // memoria serve a lei, non al guscio.
  if (sua) {
    const memoria = ULTIMA_SEZIONE.get(card) ?? new Map();
    memoria.set(sua.id, mostrata);
    ULTIMA_SEZIONE.set(card, memoria);
  }
  const id = sezioneCanonica(mostrata) ?? schedaAttiva(card) ?? SCHEDE_LAB[0].id;
  applicaStato(card, id);
  return id;
}

/**
 * I bottoni legacy, tenuti in vita come SUPERFICIE DI COMANDO.
 * ⛔ Portano loro `data-model-lab-tab`, e un clic su di essi è l'unica strada
 * che passa da `app.js` (`setModelLabSection`, `app.js:4192`): è quello che
 * aggiorna `state.modelLab.section` e fa partire i caricatori.
 */
function comandiLegacy(card) {
  const contenitore = card.querySelector('[data-lab-comandi]') ?? card;
  const mappa = new Map();
  for (const bottone of contenitore.querySelectorAll('[data-model-lab-tab]')) {
    if (!mappa.has(bottone.dataset.modelLabTab)) mappa.set(bottone.dataset.modelLabTab, bottone);
  }
  return mappa;
}

/** La sezione da chiedere all'app: quella nominata, o l'ultima vista, o la prima. */
function sezioneDaChiedere(card, scheda, presenti, nome) {
  const memoria = ULTIMA_SEZIONE.get(card)?.get(scheda.id) ?? null;
  if (nome && presenti.includes(nome)) return nome;
  if (memoria && presenti.includes(memoria)) return memoria;
  return presenti[0] ?? null;
}

/**
 * Apre una scheda. Accetta sia il nome della scheda (`'models'`) sia quello di
 * una sezione che ci sta dentro (`'catalog'`).
 * @returns {boolean} `false` se il nome è sconosciuto o il guscio non c'è.
 */
export function selezionaScheda(card, sezione) {
  const scheda = schedaDiSezione(sezione);
  if (!card || !scheda) return false;
  if (![...card.querySelectorAll('[data-lab-scheda]')].some(tab => tab.dataset.labScheda === scheda.id)) return false;
  /*
   * ⛔ L'INTERNO RESTA DELL'APP, E SI CHIEDE ALL'APP. Si tocca lo stato interno
   * solo se NESSUNA sezione di questa scheda è accesa — e anche allora la
   * strada è il bottone legacy (`comando.click()`), così `state.modelLab`,
   * `hidden` sui pannelli e il caricatore della sezione li muove `app.js`. La
   * scrittura diretta (`attivaSezione`) resta per l'unico caso in cui non
   * esiste un bottone da premere: una carta costruita a mano, senza comandi.
   * ⛔ Prima versione, MISURATA SBAGLIATA: cambiava i pannelli per scrittura
   * diretta e lasciava `app.js` convinto che la sezione accesa fosse un'altra —
   * scheda accesa, dati mai chiesti.
   * ⛔ E il clic inoltrato non si dà per riuscito: si guarda l'ESITO. Un bottone
   * senza listener (una carta costruita a mano, o un `app.js` che non è ancora
   * passato) inghiotte il clic in silenzio e lascia la scheda accesa e vuota.
   */
  const nome = String(sezione ?? '').trim();
  const acceso = [...card.querySelectorAll('[data-model-lab-panel]')]
    .some(pannello => pannello.hidden === false && scheda.sezioni.includes(pannello.dataset.modelLabPanel));
  if (!acceso) {
    // ⛔ Solo sezioni che in QUESTA carta esistono: chiedere una sezione che
    // non c'è vorrebbe dire spegnere tutto il resto e lasciare la scheda vuota.
    const presenti = scheda.sezioni.filter(sezione => card.querySelector(`[data-model-lab-panel="${sezione}"]`));
    const bersaglio = sezioneDaChiedere(card, scheda, presenti, presenti.includes(nome) ? nome : null);
    const comando = bersaglio ? comandiLegacy(card).get(bersaglio) : null;
    if (comando) comando.click();
    // La strada vera ha parlato: se la sezione non si è accesa, si accende qui.
    if (bersaglio && !accesaSezione(card, bersaglio)) attivaSezione(card, bersaglio);
  }
  applicaStato(card, scheda.id);
  return true;
}

function icona(doc, nome) {
  const svg = doc.createElementNS(NS_SVG, 'svg');
  svg.setAttribute('class', 'i');
  svg.setAttribute('aria-hidden', 'true');
  const use = doc.createElementNS(NS_SVG, 'use');
  use.setAttribute('href', `#${nome}`);
  svg.append(use);
  return svg;
}

function maiuscola(testo) {
  return testo.charAt(0).toUpperCase() + testo.slice(1);
}

const OSSERVATORI = new WeakMap();
/** L'ultima sezione vista dentro ogni scheda, per carta. Vedi `sincronizzaGuscioLaboratorio`. */
const ULTIMA_SEZIONE = new WeakMap();

/**
 * MONTA IL GUSCIO a quattro schede sulla carta del laboratorio.
 *
 * Cosa fa, in ordine:
 *  1. controlla che OGNI pannello legacy abbia una scheda — se no, nega;
 *  2. toglie le sei linguette legacy e mette le quattro schede;
 *  3. raggruppa i pannelli veri dentro quattro `role=tabpanel`, uno per scheda;
 *  4. mette la banda (modello corrente + RAM libera) fra testata e schede;
 *  5. tiene allineati i valori veri (conteggio download, banda) **e la scheda
 *     aperta alla sezione che l'app sta mostrando**.
 *
 * ⛔ NON sposta, non ricrea e non riscrive il contenuto dei pannelli: le sei
 * sezioni legacy restano le stesse, con gli stessi id, gli stessi
 * `data-model-lab-panel`, lo stesso `hidden` e le stesse funzioni che le
 * riempiono. Cambia solo CHI le contiene.
 *
 * @param {Element} card la carta (`#modelLabCard`).
 * @param {{onCambio?: ((scheda: string) => void)|null}} [opzioni]
 * @returns {boolean} `true` se il guscio è montato (anche se lo era già).
 */
export function montaGuscioLaboratorio(card, { onCambio = null } = {}) {
  if (!card) return false;
  if (card.dataset.labGuscio === 'v3') return true;

  const doc = card.ownerDocument;
  const list = card.querySelector('.model-lab-tabs[role="tablist"]') ?? card.querySelector('[role="tablist"]');
  const pannelli = [...card.querySelectorAll('[data-model-lab-panel]')];
  if (!list || pannelli.length === 0) return false;

  // (1) LA GUARDIA — nessuna sezione si perde, e non si monta a metà.
  const orfani = pannelli.filter(pannello => schedaDiSezione(pannello.dataset.modelLabPanel) === null);
  if (orfani.length > 0) {
    const nomi = orfani.map(pannello => pannello.dataset.modelLabPanel || '(senza nome)').join(', ');
    card.dataset.labGuscioNegato = nomi;
    console.warn(`[lab-guscio-v3] guscio NON montato: nessuna scheda contiene ${nomi}`);
    return false;
  }

  // (2) LE QUATTRO SCHEDE al posto delle sei linguette — che però non si
  // buttano: diventano la superficie di comando (vedi `comandiLegacy`).
  const vecchie = [...list.querySelectorAll('[data-model-lab-tab]')];
  const selezionataPrima = vecchie.find(tab => tab.getAttribute('aria-selected') === 'true')?.dataset.modelLabTab ?? null;
  // La scheda aperta all'avvio è quella che l'app sta GIÀ mostrando (di norma
  // la Panoramica, che i richiami d'avvio aprono): il guscio non sposta la
  // schermata sotto il dito, si allinea.
  const iniziale = sezioneCanonica(sezioneMostrata(card)) ?? sezioneCanonica(selezionataPrima) ?? SCHEDE_LAB[0].id;
  const comandi = doc.createElement('div');
  comandi.hidden = true;
  comandi.dataset.labComandi = '';
  comandi.setAttribute('aria-hidden', 'true');
  comandi.append(...vecchie);

  const schede = new Map();
  for (const scheda of SCHEDE_LAB) {
    const tab = doc.createElement('button');
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.id = `labScheda${maiuscola(scheda.id)}`;
    tab.className = 'talos-tabs__tab';
    /*
     * ⛔⛔ QUI NON C'È `data-model-lab-tab`, ED È UNA SCELTA MISURATA.
     * La prima versione lo metteva (con la prima sezione della scheda) contando
     * sul fatto che `$$('[data-model-lab-tab]')` (`app.js:4627`) legasse il clic
     * alle schede nuove — vero solo se il montaggio avviene prima di quella
     * riga. Montato dopo, il clic non arrivava a `setModelLabSection`: scheda
     * accesa, `state.modelLab` fermo, nessun caricatore. Adesso il clic lo
     * porta `comandiLegacy` ai bottoni veri, e quell'attributo resta a loro.
     */
    tab.dataset.labScheda = scheda.id; // il vocabolario di questo guscio
    tab.setAttribute('aria-controls', `labPannello${maiuscola(scheda.id)}`);
    tab.setAttribute('aria-selected', String(scheda.id === iniziale));
    tab.tabIndex = scheda.id === iniziale ? 0 : -1;
    tab.classList.toggle('active', scheda.id === iniziale);
    tab.append(icona(doc, scheda.icona), doc.createTextNode(scheda.etichetta));
    list.append(tab);
    schede.set(scheda.id, tab);
  }

  // (3) I PANNELLI VERI, raggruppati. La striscia si avvolge nel wrapper del
  // design system se non lo è già (stessa funzione di `montaCorniceModelLab`).
  const striscia = avvolgiStrisciaSchede(card, list);
  const contenitore = doc.createElement('div');
  contenitore.className = 'talos-tabs__panels';
  // ⛔ La superficie di comando sta nel DOM accanto ai pannelli, `hidden`: non
  // si disegna e non entra nel tab order, ma i suoi bottoni si premono.
  striscia.after(comandi, contenitore);

  for (const scheda of SCHEDE_LAB) {
    const tab = schede.get(scheda.id);
    const gruppo = doc.createElement('section');
    gruppo.className = 'talos-tabs__panel';
    gruppo.id = `labPannello${maiuscola(scheda.id)}`;
    gruppo.dataset.labPannello = scheda.id;
    gruppo.setAttribute('role', 'tabpanel');
    gruppo.setAttribute('aria-labelledby', tab.id);
    // APG, «Tabs Pattern» (18/09/2026): il pannello entra nel tab order quando
    // dentro non c'è niente da attivare. Qui non si sa in anticipo — i pannelli
    // sono riempiti dopo — quindi si tiene sempre, che è la variante ammessa.
    gruppo.tabIndex = 0;
    gruppo.hidden = scheda.id !== iniziale;
    gruppo.classList.toggle('active', scheda.id === iniziale);
    contenitore.append(gruppo);

    for (const pannello of pannelli) {
      if (schedaDiSezione(pannello.dataset.modelLabPanel)?.id !== scheda.id) continue;
      // Niente `tabpanel` annidati: il ruolo e il nome li porta il GRUPPO.
      // Il `aria-labelledby` dei pannelli legacy puntava alle linguette che
      // abbiamo appena tolto: un riferimento appeso, quindi si toglie.
      pannello.removeAttribute('role');
      pannello.removeAttribute('aria-labelledby');
      // ⛔ `data-model-lab-panel`, `hidden` e `.active` NON si toccano: sono
      // di `app.js` (`app.js:4195`), e il guscio li legge invece di riscriverli.
      gruppo.append(pannello);
    }

    /* La frase della scheda, in TESTA al gruppo e PRIMA dei pannelli legacy:
       `prepend` la mette sopra anche se i pannelli sono già dentro. */
    if (scheda.frase) {
      const testa = doc.createElement('header');
      testa.className = 'talos-lab__frase';
      testa.dataset.labFrase = scheda.id;
      const titolo = doc.createElement('h3');
      titolo.textContent = scheda.frase.titolo;
      const nota = doc.createElement('p');
      nota.className = 'talos-muted';
      nota.textContent = scheda.frase.nota;
      testa.append(titolo, nota);
      gruppo.prepend(testa);
    }
  }

  // (4) LA BANDA — il modello corrente e la RAM libera.
  const banda = doc.createElement('section');
  banda.className = 'talos-card talos-card--pad talos-cluster';
  banda.dataset.labBanda = '';
  banda.setAttribute('aria-label', 'Stato corrente del laboratorio');
  const corrente = card.querySelector('.model-lab-active-model');
  if (corrente) {
    corrente.classList.add('talos-grow');
    banda.append(corrente); // il nodo vero, col suo id: `app.js:8298` continua a scriverci
  }
  const ram = doc.createElement('div');
  ram.className = 'talos-stack';
  const etichettaRam = doc.createElement('span');
  etichettaRam.className = 'talos-muted';
  etichettaRam.textContent = 'RAM libera'; // il nome vero della misura (`misura-memoria.js`)
  const riga = doc.createElement('div');
  riga.className = 'talos-cluster';
  const valore = doc.createElement('strong');
  valore.dataset.labBandaValore = '';
  valore.textContent = '—';
  const frazione = doc.createElement('span');
  frazione.className = 'talos-muted';
  frazione.dataset.labBandaFrazione = '';
  const barra = doc.createElement('progress');
  barra.className = 'talos-lab__meter';
  barra.dataset.labBandaTrack = '';
  // Il rapporto è già scritto per esteso nel testo accanto: la barra non porta
  // informazione che il testo non dica, quindi non si annuncia due volte.
  barra.setAttribute('aria-hidden', 'true');
  barra.hidden = true;
  riga.append(valore, frazione);
  ram.append(etichettaRam, riga, barra);
  banda.append(ram);
  const testata = card.querySelector('.settings-card-heading');
  if (testata) testata.after(banda); else card.prepend(banda);

  // (5) I VALORI VERI, tenuti allineati.
  const rinfresca = () => {
    sincronizzaGuscioLaboratorio(card);
    aggiornaBandaLaboratorio(card);
    aggiornaConteggiScheda(card, { downloads: downloadAttivi(card.querySelector('#modelLabDownloadsList')) });
  };
  rinfresca();
  /*
   * Un osservatore solo, sulla carta: `#modelLabDownloadsList` e i nodi della
   * memoria stanno tutti dentro di lei, quindi `subtree` li copre già. Un
   * secondo osservatore sulla lista sarebbe stato una copia che non copre
   * niente di nuovo — e due copie di una guardia sono due cose da tenere
   * allineate.
   * ⛔ Gli attributi osservati sono tre, e ognuno ha il suo motivo:
   *   `hidden` e `class` — è così che `app.js:4195` accende e spegne le sezioni
   *   (in questa carta `hidden` è l'unico meccanismo che nasconde davvero);
   *   `aria-selected` — quando l'app apre una sezione che come scheda non
   *   esiste (`'installed'`) spegne TUTTE e quattro le schede, e il guscio deve
   *   riaccendere la sua.
   * ⛔ Ogni scrittura di `rinfresca` è condizionata al cambiamento, quindi il
   * giro si ferma dopo un passaggio: una scrittura identica non è una mutazione.
   */
  const osservatore = new MutationObserver(rinfresca);
  osservatore.observe(card, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ['hidden', 'class', 'aria-selected'],
  });
  OSSERVATORI.set(card, osservatore);

  // (6) LA TASTIERA E IL CLIC. Il roving tabindex lo scrive anche
  // `montaCorniceModelLab` quando le sue vecchie linguette sono ancora in
  // memoria: le due scritture dicono la stessa cosa (il `next` si calcola
  // dallo stesso `event.target`), quindi non si pestano.
  list.addEventListener('click', evento => {
    const tab = evento.target?.closest?.('[data-lab-scheda]');
    if (!tab || !list.contains(tab)) return;
    if (selezionaScheda(card, tab.dataset.labScheda)) onCambio?.(tab.dataset.labScheda);
  });
  list.addEventListener('keydown', evento => {
    const tab = evento.target?.closest?.('[data-lab-scheda]');
    if (!tab) return;
    const ordine = [...list.querySelectorAll('[data-lab-scheda]')];
    const qui = ordine.indexOf(tab);
    if (qui < 0) return;
    const passi = { ArrowRight: 1, ArrowLeft: -1 };
    let prossimo = null;
    if (passi[evento.key] !== undefined) prossimo = ordine[(qui + passi[evento.key] + ordine.length) % ordine.length];
    else if (evento.key === 'Home') prossimo = ordine[0];
    else if (evento.key === 'End') prossimo = ordine[ordine.length - 1];
    if (!prossimo) return;
    evento.preventDefault();
    for (const voce of ordine) voce.tabIndex = voce === prossimo ? 0 : -1;
    prossimo.focus();
    // Attivazione manuale (l'APG la ammette): il fuoco si sposta, la scheda si
    // apre con Invio o Spazio — che su un `<button>` è il clic nativo.
  });

  card.dataset.labGuscio = 'v3';
  delete card.dataset.labGuscioNegato;
  card.classList.add('talos-model-lab');
  card.dataset.labSchedaAttiva = iniziale;
  return true;
}

/** Stacca l'osservatore del guscio (per le prove: una carta che si smonta). */
export function smontaGuscioLaboratorio(card) {
  const osservatore = OSSERVATORI.get(card);
  if (!osservatore) return false;
  osservatore.disconnect();
  OSSERVATORI.delete(card);
  return true;
}
