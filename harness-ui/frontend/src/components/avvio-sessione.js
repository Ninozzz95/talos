/*
 * BC-14 — IL CANCELLO DI «AVVIA» DELLA MODALE «NUOVA SESSIONE», in un posto solo e provabile.
 *
 * ## Il difetto, riprodotto sul banco l'11/09/2026 (server mio sulla 4188, mai il 4174)
 *
 * Owner: «i tasti read only, workspace write e on request rendono il pulsante avvia disabilitato
 * perché mi dice "scegli una cartella" anche se l'ho appena scelta». Riprodotto alla lettera, con
 * una cartella FUORI dai progetti autorizzati:
 *
 *   [Read only]        disabilitato=true   bottone: "Scegli una cartella"
 *   [Workspace write]  disabilitato=true   bottone: "Scegli una cartella"
 *   [On request]       disabilitato=true   bottone: "Scegli una cartella"
 *   [Full access]      disabilitato=false  bottone: "Continua nella chat — fuori-allowlist"
 *
 * e la carta «Cartella scelta», due dita più in alto, mostrava il percorso INTERO. Due testi sulla
 * stessa schermata che si contraddicono: uno dei due mente, ed è quello che si legge per primo.
 *
 * ⛔ La misura che spiega perché nessuno se n'era accorto: la frase VERA («Questa cartella è
 *   esterna ai progetti già autorizzati…») esiste già, ma sta in fondo alla colonna destra, che
 *   SCORRE. Misurato a 1440×900 e a 1024×800: `dentroLaColonna: false` — cioè fuori dallo schermo.
 *   L'unica spiegazione che l'owner poteva leggere era quella sul bottone, ed era falsa.
 *   ⇒ La cura non è solo cambiare la frase: è metterla dove l'occhio sta già, nel piede, accanto
 *     al bottone. Una ragione che si vede solo scorrendo non è una ragione.
 *
 * ## Che cosa il SERVER chiede davvero — misurato nel codice, non supposto
 *
 * ⛔⛔⛔ 12/09/2026 — SECONDO GIRO, owner: «il pulsante dice serve accesso pieno». La cura dell'11
 * diceva il vero su un cancello che NON DOVEVA ESISTERE. Il cancello (`session-registry.mjs`,
 * `avviaLibero`: `cartellaLibera && permessi !== 'Full access'` → QUERY_INVALID) è stato tolto
 * nello stesso lotto di questo file, e il perché sta per esteso nella doc di `avviaLibero`:
 * l'ambito di una cartella scelta a mano lo tiene `cartellaGiaScelta:true`, non il permesso, e il
 * cancello quindi non restringeva niente — obbligava al livello di accesso PIÙ ALTO chi voleva
 * lavorare in una cartella scelta a mano.
 *
 * ⇒ Da oggi, tutte e tre le forme si comportano allo stesso modo:
 *
 *  · cartella dell'allowlist (`cartellaId`)  → qualsiasi permesso.
 *  · percorso scelto a mano (`cartellaLibera`) → qualsiasi permesso. Il permesso vale DENTRO
 *      quella cartella: «Solo lettura» non scrive, «Chiede prima» chiede, «Scrive nel progetto»
 *      scrive solo lì.
 *  · cartella dal tasto destro di Windows (`workspaceLaunchId`) → qualsiasi permesso, come è
 *      sempre stato (`tests/session-registry.test.mjs:928`, `tests/http-routes-workspace-launch.test.mjs:106`).
 *
 * ⇒ La situazione `permesso-insufficiente` non esiste più: non c'è più nessun permesso che questa
 *   modale debba pretendere. Resta il fatto — vero e utile — che una cartella possa essere fuori
 *   dai progetti già autorizzati: si DICE, perché chi avvia sappia dove finirà il lavoro, ma non
 *   blocca niente. È la separazione che lo stato dell'arte tiene sempre distinta (ricerca 12/09,
 *   fonti nel rapporto): «di questa cartella mi fido» e «quanto può fare l'agente» sono due assi.
 *
 * ## Perché un modulo a parte, e non tre righe dentro `app.js`
 *
 * Perché la decisione («si può avviare? come si chiama il bottone? che cosa manca?») è la cosa che
 * mentiva, e finché vive dentro una funzione di 200 righe che tocca il DOM non la si può provare né
 * nel verso giusto né in quello contrario. Qui è una funzione pura: entra uno stato, esce una
 * decisione. `tests/unit/avvio-sessione.test.mjs` la mette alla prova nei due versi.
 *
 * ## Ricerca prima di scrivere (11/09/2026)
 *
 * ⭐ Smashing Magazine, «Usability Pitfalls of Disabled Buttons, and How To Avoid Them», e Adam
 *   Silver, «The problem with disabled buttons and what to do instead» (letti l'11/09/2026): un
 *   bottone disabilitato non prende il fuoco, quindi uno screen reader può non nominarlo mai; è
 *   grigio, quindi ha contrasto insufficiente; e soprattutto non dice MAI perché. Il consiglio
 *   concorde è: lascialo premibile e, se manca qualcosa, dillo — con un testo visibile, non con
 *   uno stato da indovinare. La discussione w3c/wcag #3845 aggiunge il lato normativo: se
 *   l'istruzione esiste solo nello stato del bottone, non è mai stata dichiarata (3.3.1).
 * ⇒ Qui `disabilitato` resta vero in UN caso solo — mentre una cartella si sta aprendo — che è
 *   l'uso legittimo riconosciuto da entrambe le fonti (operazione in volo). Negli altri casi il
 *   bottone si preme e PORTA alla cosa che manca (`rimedioSu`).
 *
 * ⛔ E non promuove niente da solo: premerlo porta alla scelta del permesso, non la cambia. La
 *   consegna del 01/09 lo dice esplicitamente — «la selezione non promuove silenziosamente i
 *   permessi a Full access» — e un clic che alzasse l'autonomia da solo sarebbe esattamente quello.
 */

import { nomeUmanoPolitica } from './politiche.js';

/*
 * ⛔ 12/09 — qui viveva `PERMESSO_PER_CARTELLA_LIBERA = 'Full access'`, il permesso che il server
 * esigeva per un percorso scelto a mano. Il server non lo esige più (vedi la testata): la costante
 * è stata tolta invece di restare inerte, perché una costante che nomina un requisito morto è il
 * modo più veloce per farlo tornare.
 */

/**
 * @typedef {object} CartellaScelta
 * @property {string} [path] il percorso, quando la cartella arriva dall'albero
 * @property {string} [name] il nome, quando arriva dal tasto destro (il percorso non c'è per patto)
 * @property {string|null} [projectId] l'id del progetto, se la cartella è già autorizzata
 * @property {string|null} [launchId] l'identificatore monouso del tasto destro di Windows
 */

/**
 * @typedef {object} StatoAvvio
 * @property {'pronto'|'occupato'|'senza-cartella'} situazione
 * @property {boolean} puoAvviare vero solo se il form può essere spedito adesso
 * @property {boolean} disabilitato vero SOLO mentre una cartella si sta aprendo (vedi testata)
 * @property {string} etichetta il testo del bottone: dice sempre il vero
 * @property {string} motivo la frase da mettere sotto gli occhi, accanto al bottone
 * @property {'cartella'|'permesso'|null} rimedioSu dove portare chi preme e non può ancora partire
 */

/**
 * La decisione intera della modale, in una funzione sola.
 *
 * @param {{cartella: CartellaScelta|null, permesso: string, occupato?: boolean}} stato
 * @returns {StatoAvvio}
 */
export function statoAvvioSessione({ cartella = null, permesso = '', occupato = false } = {}) {
  if (occupato) {
    return {
      situazione: 'occupato',
      puoAvviare: false,
      // ⛔ L'unico `disabled` legittimo: c'è una lettura in volo, e premere due volte non aiuta.
      disabilitato: true,
      etichetta: 'Apro la cartella…',
      motivo: 'Aspetta: sto leggendo la cartella.',
      rimedioSu: null,
    };
  }

  if (!cartella || (!cartella.path && !cartella.launchId)) {
    return {
      situazione: 'senza-cartella',
      puoAvviare: false,
      disabilitato: false,
      // Qui «Scegli una cartella» è VERO, ed è un'istruzione: premendolo si va all'albero.
      etichetta: 'Scegli una cartella',
      motivo: 'Scegli la cartella su cui vuoi lavorare.',
      rimedioSu: 'cartella',
    };
  }

  const nome = nomeCartellaScelta(cartella);
  const autorizzata = Boolean(cartella.projectId);
  // Il tasto destro di Windows non è un percorso digitato: la cartella l'ha scelta la persona da
  // Esplora file, e il server la risolve da un identificatore monouso suo.
  const daEsploraFile = Boolean(cartella.launchId);

  /*
   * ⛔ 12/09 — QUI c'era l'unico ramo che poteva rispondere «non si può partire» con una cartella
   *   scelta: `permesso !== 'Full access'` → `situazione: 'permesso-insufficiente'`, etichetta
   *   «Serve «Accesso pieno»». È la frase che l'owner ha segnalato. Il cancello che la rendeva
   *   VERA non c'è più nel server, quindi il ramo è sparito: con una cartella scelta si parte
   *   sempre, con tutti e quattro i permessi.
   */
  return {
    situazione: 'pronto',
    puoAvviare: true,
    disabilitato: false,
    etichetta: `Continua nella chat — ${nome}`,
    motivo: motivoQuandoSiPuoPartire({ nome, autorizzata, daEsploraFile, permesso }),
    rimedioSu: null,
  };
}

/** Il nome da mostrare: il percorso quando c'è, il nome quando il percorso non può esistere. */
export function nomeCartellaScelta(cartella) {
  if (!cartella) return '';
  if (cartella.path) return String(cartella.path).replace(/[\\/]+$/u, '').split(/[\\/]/u).pop() || cartella.path;
  return cartella.name || '';
}

/**
 * La frase che si legge accanto al bottone. Dice sempre due cose: che cosa farà TALOS, e fin dove.
 * ⛔ Mai il valore tecnico del kernel a schermo: solo il nome umano di `politiche.js`.
 *
 * ⭐ 12/09 — prima c'era una frase per PROVENIENZA della cartella (albero / Esplora file /
 * allowlist) e il permesso ci compariva solo come nome. Adesso che il permesso decide davvero per
 * tutte e tre le provenienze, la frase la comanda LUI — «Scrive nel progetto» e «Solo lettura»
 * sulla stessa cartella promettono due cose opposte, e chi legge deve poterle distinguere senza
 * tornare su per rileggere quale tasto è acceso. La provenienza resta, in coda, dove è ancora
 * un'informazione e non più un verdetto.
 */
function motivoQuandoSiPuoPartire({ nome, autorizzata, daEsploraFile, permesso }) {
  const umano = nomeUmanoPolitica(permesso);
  /* ⛔ La coda NON ripete il nome della cartella: la prima frase l'ha già detto, e nella foto del
     12/09 la riga del piede lo diceva due volte in undici parole («…scrive solo dentro X. X non è
     fra i progetti…»). Il soggetto è già stabilito: qui basta il pronome. */
  const coda = autorizzata
    ? ''
    : daEsploraFile
      ? ' Arriva da Esplora file.'
      : ' Non è fra i progetti già autorizzati: viene verificata all’avvio.';
  return `${cosaFaraDentro(permesso, nome, umano)}${coda}`;
}

/** Una riga per permesso: il verbo che conta, e il confine. Nessuna promette più di quel che fa. */
function cosaFaraDentro(permesso, nome, umano) {
  switch (permesso) {
    case 'Read only':
      return `Con «${umano}» TALOS legge ${nome} e non ci scrive niente.`;
    case 'On request':
      return `Con «${umano}» TALOS resterà nella cartella scelta e chiederà conferma prima di ogni scrittura.`;
    case 'Full access':
      return `Con «${umano}» TALOS lavora in ${nome} senza i cancelli ordinari su file e rete.`;
    case 'Workspace write':
      return `Con «${umano}» TALOS resterà nella cartella scelta: scrive solo dentro ${nome}.`;
    default:
      // ⛔ Un permesso che non conosciamo non si racconta: si nomina e basta (stessa disciplina di
      //   `nomeUmanoPolitica`, che in quel caso torna il valore grezzo invece di inventare).
      return `Permesso scelto: «${umano}». TALOS resterà nella cartella scelta.`;
  }
}
