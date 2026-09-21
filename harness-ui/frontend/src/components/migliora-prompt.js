/*
 * MiglioraPrompt — «Migliora il prompt» nel composer del desktop.
 *
 * Owner 11/09/2026: «il prompt enhancer, il mobile ce l'ha già bello e pronto quindi basta
 * guardare lì». Questo è quel pannello, portato qui.
 *
 * ## Cosa fa il mobile (letto, non ricordato)
 *
 *   `AVM/mobile/src/components/chat/TalosMobileEnhancerDrawer.vue:54`      setup → attesa → errore → esito, in un pannello solo
 *   `AVM/mobile/src/components/chat/TalosMobileEnhancerSetup.vue:9-23`     prima «quanto riscrivere», poi «chi lo riscrive»
 *   `AVM/mobile/src/components/chat/TalosMobilePromptEnhancerPopover.vue`  esito + provenienza + sintesi + principi + tre azioni
 *   `AVM/mobile/src/lib/chat/promptEnhancerDepth.ts:6-17`                  tre livelli, non un cursore da 1 a 10
 *
 * ## Le tre differenze volute
 *
 * 1. **Niente selettore del modello.** Sul mobile si sceglie (owner 04/08: un modello caro per
 *    un semplice enhancing è uno spreco). Qui no: owner 11/09, «il modello è quello della
 *    sessione, mai uno a pagamento scelto da te». Il modello si DICHIARA, non si sceglie.
 * 2. **Prima e dopo insieme.** Il mobile mostra solo il riscritto. Ma la domanda vera di chi
 *    guarda è «è ancora quello che intendevo?», e con l'originale sparito quel confronto tocca
 *    farlo a memoria. Qui il testo di partenza resta sopra, smorzato e corto; il riscritto sotto,
 *    intero. È l'unica cosa su cui questo pannello si sbilancia: tutto il resto è quieto.
 * 3. **Nessuna grammatica nuova.** Linguette (`talos-tabs--pills`), pillole (`talos-chip`),
 *    bottoni (`talos-button--*`) e colori sono quelli che TALOS ha già — regola dell'owner
 *    04/09, «rispettare il sistema di design esistente». Tutto passa dai token `--talos-*`,
 *    quindi il pannello segue il tema CHIARO e SCURO senza una riga di CSS in più.
 *
 * ## Cosa questo file NON fa
 *
 * Non chiama la rete e non conosce le rotte: riceve `chiedi()` dal chiamante. Così si prova
 * senza un server, e il pannello non può partire da solo per sbaglio.
 */

import { nomeModelloUmano } from './chat-foot.js';

/**
 * I tre livelli. `valore` è ciò che viaggia verso la rotta; `nome` e `spiega` sono per le
 * persone — e la spiegazione è UNA riga che cambia con la scelta, l'unica cosa in movimento
 * del pannello (stessa scelta del mobile, EnhancerSetup.vue:18-23).
 */
export const PROFONDITA = Object.freeze([
  Object.freeze({ valore: 'concisa', nome: 'Asciutta', spiega: 'Stessa lunghezza. Chiarisce obiettivo e risultato atteso, senza aggiungere sezioni.' }),
  Object.freeze({ valore: 'equilibrata', nome: 'Equilibrata', spiega: 'Un briefing chiaro: obiettivo, risultato atteso, i vincoli che hai già scritto e due o tre verifiche.' }),
  Object.freeze({ valore: 'estesa', nome: 'Estesa', spiega: 'Un briefing completo: ambito, formato della risposta, vincoli, casi limite e criteri di accettazione.' }),
]);

export const PROFONDITA_PREDEFINITA = 'equilibrata';

export function descriviProfondita(valore) {
  return PROFONDITA.find((voce) => voce.valore === valore) ?? PROFONDITA.find((voce) => voce.valore === PROFONDITA_PREDEFINITA);
}

/**
 * L'originale nell'anteprima: corto, perché serve a riconoscerlo, non a rileggerlo.
 * ⛔ Il taglio cade su uno spazio quando ce n'è uno vicino: spezzare una parola a metà fa
 * sembrare il testo corrotto invece che abbreviato.
 */
export function anteprimaOriginale(testo, massimo = 180) {
  if (typeof testo !== 'string') return '';
  const pulito = testo.trim().replace(/\s+/gu, ' ');
  if (pulito.length <= massimo) return pulito;
  const tagliato = pulito.slice(0, massimo);
  const spazio = tagliato.lastIndexOf(' ');
  return `${(spazio > massimo - 24 ? tagliato.slice(0, spazio) : tagliato).trimEnd()}…`;
}

/**
 * Normalizza ciò che la rotta ha risposto.
 *
 * ⛔ Torna `null` invece di un oggetto mezzo vuoto quando manca il testo riscritto: un esito
 * senza il suo contenuto non è un esito parziale da mostrare, è un fallimento — e mostrarlo
 * come riuscito è la bugia che la memoria del progetto chiama «APERTA non è FATTA».
 */
export function riassumiEsito(dati) {
  const promptMigliorato = typeof dati?.promptMigliorato === 'string' ? dati.promptMigliorato.trim() : '';
  if (promptMigliorato === '') return null;
  const principi = (Array.isArray(dati?.principi) ? dati.principi : [])
    .filter((voce) => typeof voce === 'string' && voce.trim() !== '')
    .map((voce) => voce.trim())
    .slice(0, 8);
  return {
    promptMigliorato,
    promptOriginale: typeof dati?.promptOriginale === 'string' ? dati.promptOriginale : '',
    sintesi: typeof dati?.sintesi === 'string' ? dati.sintesi.trim() : '',
    principi,
    modello: typeof dati?.modello === 'string' ? dati.modello : '',
    profondita: descriviProfondita(dati?.profondita).valore,
  };
}

/** Il nome del modello come lo legge una persona (H22: mai la targa del runtime a schermo). */
export function etichettaModello(modello) {
  const nome = nomeModelloUmano(modello);
  return nome || 'il modello di questa chat';
}

/**
 * La riga che dichiara CHI riscriverà, in una frase sola.
 *
 * ⛔ 11/09/2026, trovato nella foto agganciando il pannello al composer: senza un modello scelto
 *   a schermo usciva «Lo riscrive **il modello di questa chat**, il modello di questa chat.» — la
 *   stessa cosa detta due volte. `etichettaModello('')` ripiega proprio su quella frase, e la
 *   frase la ripeteva. La cura sta qui e non in `etichettaModello`, che è giusta com'è e provata:
 *   quando il nome NON c'è, il complemento che lo spiegava non ha più niente da spiegare.
 */
export function fraseProvenienza(modello) {
  const nome = nomeModelloUmano(modello);
  return nome ? `Lo riscrive ${nome}, il modello di questa chat.` : 'Lo riscrive il modello di questa chat.';
}

/**
 * Cosa dire quando qualcosa non è andato.
 *
 * ⛔ Un errore non si scusa e non è vago: dice cosa è successo e cosa si può fare. I tre casi
 * che la rotta produce davvero hanno tre frasi diverse, perché richiedono tre gesti diversi.
 */
export function messaggioErrore(errore) {
  const codice = errore?.code ?? errore?.codice ?? null;
  if (codice === 'PROVIDER_KEY_REQUIRED') return 'Manca la chiave di OpenRouter. Collegala in Impostazioni → Provider, poi riprova.';
  if (codice === 'RUNTIME_NOT_AVAILABLE') return 'Il motore locale di questa chat non è acceso. Avvialo dal Laboratorio modelli, poi riprova.';
  if (codice === 'PROVIDER_RUNTIME_UNAVAILABLE') return 'Il modello non ha restituito una riscrittura utilizzabile. Riprova.';
  if (codice === 'QUERY_INVALID') return typeof errore?.message === 'string' && errore.message ? errore.message : 'Il testo non è utilizzabile così.';
  return 'La riscrittura non è riuscita. Riprova.';
}

const STATI = Object.freeze(['scelta', 'attesa', 'errore', 'esito']);

/**
 * Monta il pannello e restituisce la sua maniglia.
 *
 * @param {object} opzioni
 * @param {(richiesta: {prompt: string, profondita: string}) => Promise<object>} opzioni.chiedi
 *        Chiama la rotta. Iniettata: questo file non conosce indirizzi.
 * @param {() => string} opzioni.leggiPrompt Il testo che c'è nel composer ADESSO — si legge
 *        all'avvio della riscrittura, non all'apertura: fra le due cose la persona può scrivere.
 * @param {(scelta: {modo: 'sostituisci'|'aggiungi', testo: string}) => void} opzioni.applica
 * @param {(testo: string) => Promise<void>} [opzioni.copiaTesto] Scrive negli appunti. Iniettata
 *        perché permessi e disponibilità appartengono all'host, non al pannello.
 * @param {string} [opzioni.modello] Il modello della sessione, solo da dichiarare.
 * @param {() => void} [opzioni.onChiudi]
 */
export function montaMiglioraPrompt({
  chiedi, leggiPrompt, applica,
  copiaTesto = async (testo) => {
    const appunti = globalThis.navigator?.clipboard;
    if (!appunti || typeof appunti.writeText !== 'function') throw new Error('CLIPBOARD_NOT_AVAILABLE');
    await appunti.writeText(testo);
  },
  modello = '', onChiudi = () => {},
  document: doc = globalThis.document,
} = {}) {
  if (typeof chiedi !== 'function' || typeof leggiPrompt !== 'function' || typeof applica !== 'function' || typeof copiaTesto !== 'function') {
    throw new TypeError('MiglioraPrompt richiede chiedi, leggiPrompt, applica e copiaTesto.');
  }

  let stato = 'scelta';
  let profondita = PROFONDITA_PREDEFINITA;
  let esito = null;
  let errore = '';
  let giro = 0;
  let distrutto = false;

  const elemento = (tag, classe, testo) => {
    const nodo = doc.createElement(tag);
    if (classe) nodo.className = classe;
    if (testo != null) nodo.textContent = testo;
    return nodo;
  };

  const radice = elemento('section', 'talos-migliora');
  radice.dataset.miglioraPrompt = '';
  radice.setAttribute('role', 'dialog');
  radice.setAttribute('aria-labelledby', 'migliora-prompt-titolo');
  radice.hidden = true;
  /*
   * ⛔ Lo stile sta QUI e non in un foglio: `frontend/src/styles/**` è di un'altra lane oggi.
   * Tutti i valori sono token `--talos-*`, quindi il pannello eredita il tema — chiaro e scuro —
   * senza sapere quale sia. Nessun colore letterale: un `#fff` qui sarebbe un lampo bianco su
   * un'app scura, cioè il difetto dell'11/09 rifatto in piccolo.
   */
  radice.style.cssText = [
    'display:flex', 'flex-direction:column', 'gap:var(--talos-space-control)',
    'width:min(34rem, calc(100vw - 2rem))', 'max-height:min(34rem, 80vh)', 'overflow:hidden',
    'padding:var(--talos-space-card)',
    'border:1px solid var(--talos-border-strong)', 'border-radius:var(--talos-radius-card)',
    'background:var(--talos-card)', 'color:var(--talos-text)',
    'font:inherit', 'box-sizing:border-box',
  ].join(';');

  // — testa: il titolo, e da chi verrà riscritto. Nient'altro.
  const testa = elemento('header');
  testa.style.cssText = 'display:flex;align-items:baseline;gap:var(--talos-space-sm)';
  const titolo = elemento('h2', null, 'Migliora il prompt');
  titolo.id = 'migliora-prompt-titolo';
  titolo.style.cssText = 'margin:0;font-size:var(--talos-font-size-md);font-weight:600';
  const chiudiBtn = elemento('button', 'talos-button talos-button--ghost talos-button--sm', 'Chiudi');
  chiudiBtn.type = 'button';
  /*
   * ⛔ Trovato nella foto dell'11/09 (tema chiaro): «Chiudi» usciva color accento e competeva col
   * titolo. In questo pannello l'accento ha un lavoro solo — il livello scelto e «Sostituisci» —
   * e un uscio non è una cosa da guardare.
   */
  chiudiBtn.style.cssText = 'margin-left:auto;color:var(--talos-muted)';
  chiudiBtn.dataset.miglioraChiudi = '';
  testa.append(titolo, chiudiBtn);

  const provenienza = elemento('p', null, '');
  provenienza.dataset.miglioraProvenienza = '';
  provenienza.style.cssText = 'margin:0;color:var(--talos-muted);font-size:var(--talos-font-size-xs);line-height:1.5';

  // — scelta: quanto riscrivere, e una riga che dice cosa cambia.
  const scelta = elemento('div');
  scelta.dataset.miglioraScelta = '';
  scelta.style.cssText = 'display:flex;flex-direction:column;gap:var(--talos-space-sm)';
  const etichetta = elemento('span', 'talos-label', 'Quanto riscrivere');
  etichetta.id = 'migliora-prompt-quanto';
  const linguette = elemento('div', 'talos-tabs talos-tabs--pills');
  const listaLinguette = elemento('div', 'talos-tabs__list');
  listaLinguette.setAttribute('role', 'tablist');
  listaLinguette.setAttribute('aria-labelledby', 'migliora-prompt-quanto');
  const bottoniProfondita = PROFONDITA.map((voce) => {
    const bottone = elemento('button', 'talos-tabs__tab', voce.nome);
    bottone.type = 'button';
    bottone.setAttribute('role', 'tab');
    bottone.dataset.miglioraProfondita = voce.valore;
    bottone.addEventListener('click', () => { profondita = voce.valore; disegna(); });
    return bottone;
  });
  listaLinguette.append(...bottoniProfondita);
  linguette.append(listaLinguette);
  const spiegazione = elemento('p', null, '');
  spiegazione.dataset.miglioraSpiegazione = '';
  spiegazione.style.cssText = 'margin:0;color:var(--talos-muted);font-size:var(--talos-font-size-sm);line-height:1.5;max-width:64ch';
  const avvia = elemento('button', 'talos-button talos-button--primary', 'Migliora');
  avvia.type = 'button';
  avvia.dataset.miglioraAvvia = '';
  avvia.style.alignSelf = 'flex-end';
  avvia.addEventListener('click', () => { void lavora(); });
  scelta.append(etichetta, linguette, spiegazione, avvia);

  // — attesa, errore, esito: tre pannelli che si alternano nello stesso posto.
  const attesa = elemento('p', null, '');
  attesa.dataset.miglioraAttesa = '';
  attesa.setAttribute('role', 'status');
  attesa.setAttribute('aria-live', 'polite');
  attesa.style.cssText = 'margin:0;padding:var(--talos-space-lg) 0;text-align:center;color:var(--talos-muted);font-size:var(--talos-font-size-sm)';

  const guasto = elemento('div');
  guasto.dataset.miglioraErrore = '';
  guasto.setAttribute('role', 'alert');
  guasto.style.cssText = 'display:flex;flex-direction:column;gap:var(--talos-space-sm);padding:var(--talos-space-control);border:1px solid var(--talos-danger);border-radius:var(--talos-radius-control);color:var(--talos-danger);font-size:var(--talos-font-size-sm)';
  const guastoTesto = elemento('p', null, '');
  guastoTesto.style.margin = '0';
  const riprova = elemento('button', 'talos-button talos-button--ghost talos-button--sm', 'Riprova');
  riprova.type = 'button';
  riprova.dataset.miglioraRiprova = '';
  riprova.style.alignSelf = 'flex-start';
  riprova.addEventListener('click', () => { void lavora(); });
  guasto.append(guastoTesto, riprova);

  const risultato = elemento('div');
  risultato.dataset.miglioraEsito = '';
  risultato.style.cssText = 'display:flex;flex-direction:column;gap:var(--talos-space-sm);flex:1 1 auto;min-height:0;overflow:hidden';
  // Le etichette del confronto restano piu' piccole del testo che nominano: nella foto
  // dell'11/09 avevano lo stesso peso dell'originale e si confondevano con esso.
  const stileEtichetta = 'font-size:var(--talos-font-size-xs)';
  const intestazionePrima = elemento('span', 'talos-label', 'Il tuo testo');
  intestazionePrima.style.cssText = stileEtichetta;
  const prima = elemento('p', null, '');
  prima.dataset.miglioraPrima = '';
  prima.style.cssText = 'margin:0;color:var(--talos-muted);font-size:var(--talos-font-size-sm);line-height:1.5;max-width:72ch';
  const intestazioneDopo = elemento('span', 'talos-label', '');
  intestazioneDopo.dataset.miglioraIntestazioneDopo = '';
  intestazioneDopo.style.cssText = stileEtichetta;
  const dopo = elemento('pre', null, '');
  dopo.dataset.miglioraDopo = '';
  dopo.style.cssText = [
    /*
     * ⛔ TERZA foto, 11/09: col corpo intero scorrevole «Cosa è cambiato» e le pillole
     *   finivano sotto la piega — informazione utile nascosta dietro un gesto. ⇒ L'UNICA
     *   cosa che scorre è il testo riscritto, che è anche l'unica di lunghezza ignota:
     *   prende lo spazio che avanza (`flex:1`) e scorre dentro di sé. Sintesi, pillole e
     *   azioni sono sempre a schermo perché hanno una taglia che si conosce.
     */
    'margin:0', 'flex:1 1 auto', 'min-height:5rem', 'overflow:auto',
    'padding:var(--talos-space-control)',
    'border:1px solid var(--talos-border)', 'border-radius:var(--talos-radius-control)',
    'background:var(--talos-panel-soft)', 'color:var(--talos-text)',
    'font:inherit', 'font-size:var(--talos-font-size-sm)', 'line-height:1.6',
    'white-space:pre-wrap', 'overflow-wrap:anywhere',
  ].join(';');
  const sintesi = elemento('p', null, '');
  sintesi.dataset.miglioraSintesi = '';
  sintesi.style.cssText = 'margin:0;color:var(--talos-muted);font-size:var(--talos-font-size-xs);line-height:1.5;max-width:72ch';
  const principi = elemento('div');
  principi.dataset.miglioraPrincipi = '';
  principi.style.cssText = 'display:flex;flex-wrap:wrap;gap:var(--talos-space-xs)';
  const azioni = elemento('div');
  /*
   * ⛔⛔ DUE FOTO, DUE DIFETTI, 11/09 (900×760, esito con quattro principi).
   *   1ª foto: il pannello scorreva tutto intero e i tre bottoni finivano SOTTO LA PIEGA — chi
   *      lo apriva vedeva una riscrittura e nessun modo di accettarla. «APERTA non è FATTA»,
   *      stavolta disegnato.
   *   2ª foto: reso `sticky` il blocco delle azioni, i bottoni si vedevano ma COPRIVANO le
   *      pillole dei principi, che stavano sotto di loro nella stessa area che scorre. Una cura
   *      che sposta il difetto di dieci pixel non è una cura.
   * ⇒ Terza forma, quella giusta: scorre SOLO il corpo del confronto (`corpo` qui sotto), e le
   *   azioni stanno FUORI da ciò che scorre. Non possono né sparire né coprire niente, perché
   *   non condividono più lo spazio con il testo.
   */
  azioni.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:flex-end;gap:var(--talos-space-sm);padding-top:var(--talos-space-sm);flex:0 0 auto';
  const annulla = elemento('button', 'talos-button talos-button--ghost talos-button--sm', 'Annulla');
  annulla.type = 'button';
  annulla.dataset.miglioraAnnulla = '';
  annulla.addEventListener('click', () => chiudi());
  const aggiungi = elemento('button', 'talos-button talos-button--secondary talos-button--sm', 'Aggiungi sotto');
  aggiungi.type = 'button';
  aggiungi.dataset.miglioraAggiungi = '';
  aggiungi.addEventListener('click', () => decidi('aggiungi'));
  const copiaBtn = elemento('button', 'talos-button talos-button--secondary talos-button--sm', 'Copia');
  copiaBtn.type = 'button';
  copiaBtn.dataset.miglioraCopia = '';
  const copiaStato = elemento('span', null, '');
  copiaStato.dataset.miglioraCopiaStato = '';
  copiaStato.setAttribute('role', 'status');
  copiaStato.setAttribute('aria-live', 'polite');
  copiaStato.style.cssText = 'align-self:center;color:var(--talos-muted);font-size:var(--talos-font-size-xs)';
  copiaBtn.addEventListener('click', async () => {
    if (!esito || copiaBtn.disabled) return;
    copiaBtn.disabled = true;
    copiaStato.textContent = '';
    try {
      await copiaTesto(esito.promptMigliorato);
      copiaStato.textContent = 'Copiato';
    } catch {
      copiaStato.textContent = 'Copia non riuscita';
    } finally {
      copiaBtn.disabled = false;
    }
  });
  const sostituisci = elemento('button', 'talos-button talos-button--primary talos-button--sm', 'Sostituisci');
  sostituisci.type = 'button';
  sostituisci.dataset.miglioraSostituisci = '';
  sostituisci.addEventListener('click', () => decidi('sostituisci'));
  azioni.append(copiaStato, annulla, copiaBtn, aggiungi, sostituisci);
  const corpo = elemento('div');
  corpo.dataset.miglioraCorpo = '';
  // `min-height:0` non e' cosmetica: senza, un figlio flex non si lascia rimpicciolire sotto
  // il proprio contenuto e `overflow:auto` non scatta mai (regola nota di flexbox).
  corpo.style.cssText = 'display:flex;flex-direction:column;gap:var(--talos-space-sm);flex:1 1 auto;min-height:0;overflow:hidden';
  corpo.append(intestazionePrima, prima, intestazioneDopo, dopo, sintesi, principi);
  risultato.append(corpo, azioni);

  radice.append(testa, provenienza, scelta, attesa, guasto, risultato);

  chiudiBtn.addEventListener('click', () => chiudi());
  radice.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Escape') return;
    evento.preventDefault();
    chiudi();
  });

  function disegna() {
    provenienza.textContent = fraseProvenienza(modello);
    const voce = descriviProfondita(profondita);
    spiegazione.textContent = voce.spiega;
    for (const bottone of bottoniProfondita) {
      const attiva = bottone.dataset.miglioraProfondita === profondita;
      bottone.setAttribute('aria-selected', String(attiva));
    }
    scelta.hidden = stato !== 'scelta';
    attesa.hidden = stato !== 'attesa';
    guasto.hidden = stato !== 'errore';
    risultato.hidden = stato !== 'esito';
    avvia.disabled = stato === 'attesa';
    if (stato === 'attesa') attesa.textContent = `Sto riscrivendo con ${etichettaModello(modello)}…`;
    if (stato === 'errore') guastoTesto.textContent = errore;
    if (stato === 'esito' && esito) {
      prima.textContent = anteprimaOriginale(esito.promptOriginale);
      intestazioneDopo.textContent = `Riscritto da ${etichettaModello(esito.modello || modello)}`;
      dopo.textContent = esito.promptMigliorato;
      sintesi.textContent = esito.sintesi ? `Cosa è cambiato: ${esito.sintesi}` : '';
      sintesi.hidden = esito.sintesi === '';
      /*
       * ⛔ QUARTA foto, 11/09: i principi erano `talos-chip`, e `.talos-chip` NON ESISTE come
       *   regola in `index.css` (c'è solo `.talos-chip__label`). A schermo uscivano quattro
       *   frasi di seguito, a taglia piena, che si leggevano come UNA: «obiettivo esplicito
       *   risultato atteso vincoli raccolti criteri di verifica». Una classe che non esiste
       *   non fallisce: disegna male, in silenzio. ⇒ `talos-badge talos-badge--sm`, che esiste
       *   davvero (index.css:269,276) ed è la pillola che il resto della app già usa.
       */
      principi.replaceChildren(...esito.principi.map((voce) => elemento('span', 'talos-badge talos-badge--sm', voce)));
      principi.hidden = esito.principi.length === 0;
    }
  }

  async function lavora() {
    const testo = String(leggiPrompt() ?? '').trim();
    if (testo === '') {
      stato = 'errore';
      errore = 'Scrivi il tuo messaggio nel composer, poi torna qui.';
      disegna();
      return;
    }
    const mio = ++giro;
    copiaStato.textContent = '';
    stato = 'attesa';
    disegna();
    try {
      const dati = await chiedi({ prompt: testo, profondita });
      /*
       * ⛔ `mio !== giro` vuol dire che nel frattempo è partita un'altra riscrittura (o il
       * pannello si è chiuso): la risposta vecchia NON deve arrivare a schermo. È lo stesso
       * difetto delle risposte fuori ordine che il resto dell'app risolve con un'epoca.
       */
      if (distrutto || mio !== giro) return;
      const letto = riassumiEsito(dati);
      if (!letto) {
        stato = 'errore';
        errore = messaggioErrore({ code: 'PROVIDER_RUNTIME_UNAVAILABLE' });
      } else {
        esito = { ...letto, promptOriginale: letto.promptOriginale || testo };
        stato = 'esito';
      }
    } catch (problema) {
      if (distrutto || mio !== giro) return;
      stato = 'errore';
      errore = messaggioErrore(problema);
    }
    disegna();
  }

  function decidi(modo) {
    if (!esito) return;
    applica({ modo, testo: esito.promptMigliorato });
    chiudi();
  }

  function apri() {
    giro += 1; // una riapertura non eredita l'esito di prima: si riparte dalla domanda
    stato = 'scelta';
    esito = null;
    errore = '';
    copiaStato.textContent = '';
    radice.hidden = false;
    disegna();
    const scelto = bottoniProfondita.find((bottone) => bottone.dataset.miglioraProfondita === profondita);
    if (scelto && typeof scelto.focus === 'function') scelto.focus();
  }

  function chiudi() {
    giro += 1;
    radice.hidden = true;
    stato = 'scelta';
    esito = null;
    errore = '';
    copiaStato.textContent = '';
    disegna();
    onChiudi();
  }

  function distruggi() {
    distrutto = true;
    radice.remove();
  }

  disegna();

  return Object.freeze({
    elemento: radice,
    apri,
    chiudi,
    distruggi,
    /** Solo per le prove e per chi orchestra: lo stato dichiarato, mai dedotto dal DOM. */
    stato: () => ({ fase: stato, profondita, esito, errore, stati: STATI }),
  });
}
