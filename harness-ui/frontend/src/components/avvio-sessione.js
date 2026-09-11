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
 * `harness-ui/src/session-registry.mjs:3291` (`avviaLibero`):
 *     if (cartellaLibera && permessiScelto !== 'Full access') → QUERY_INVALID
 * Il cancello nomina UNA sola forma: `cartellaLibera`, il percorso libero. Quindi:
 *
 *  · cartella dell'allowlist (`cartellaId`)  → QUALSIASI permesso. Il frontend faceva bene.
 *  · percorso libero (`cartellaLibera`)      → SOLO «Accesso pieno». Il blocco è VERO: si tiene,
 *      e si dice perché — non lo si aggira inventando un permesso al posto della persona.
 *  · cartella dal tasto destro di Windows (`workspaceLaunchId`) → il server NON chiede niente, e
 *      lo prova due volte con i suoi test verdi: `tests/session-registry.test.mjs:928` e
 *      `tests/http-routes-workspace-launch.test.mjs:106` avviano con `permessi: 'Workspace write'`
 *      e si aspettano successo (200, permesso registrato).
 *      ⛔ Il frontend la bloccava lo stesso: un blocco FALSO, su una combinazione che il server ha
 *        un test verde per accettare. È il secondo difetto, e non era nella segnalazione.
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

/** Il permesso che il server esige per un percorso scelto a mano. Valore del kernel, mai a schermo. */
export const PERMESSO_PER_CARTELLA_LIBERA = 'Full access';

/**
 * @typedef {object} CartellaScelta
 * @property {string} [path] il percorso, quando la cartella arriva dall'albero
 * @property {string} [name] il nome, quando arriva dal tasto destro (il percorso non c'è per patto)
 * @property {string|null} [projectId] l'id del progetto, se la cartella è già autorizzata
 * @property {string|null} [launchId] l'identificatore monouso del tasto destro di Windows
 */

/**
 * @typedef {object} StatoAvvio
 * @property {'pronto'|'occupato'|'senza-cartella'|'permesso-insufficiente'} situazione
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
  // ⛔ Il tasto destro di Windows NON è un percorso libero: il server lo tratta a parte e non gli
  //   chiede nessun permesso particolare (vedi la testata). Metterlo qui insieme all'allowlist non
  //   allarga niente — toglie un blocco che il server non ha mai chiesto.
  const giaVerificataDalServer = Boolean(cartella.launchId);

  if (!autorizzata && !giaVerificataDalServer && permesso !== PERMESSO_PER_CARTELLA_LIBERA) {
    const nomePieno = nomeUmanoPolitica(PERMESSO_PER_CARTELLA_LIBERA);
    return {
      situazione: 'permesso-insufficiente',
      puoAvviare: false,
      disabilitato: false,
      /* Il bottone dice la cosa che manca, non una cosa falsa — ed è corto perché deve stare
         dentro il bottone: la frase intera sta nel `motivo`, accanto. */
      etichetta: `Serve «${nomePieno}»`,
      motivo: `${nome} è fuori dai progetti già autorizzati: TALOS la accetta solo con «${nomePieno}». Ora è scelto «${nomeUmanoPolitica(permesso)}».`,
      rimedioSu: 'permesso',
    };
  }

  return {
    situazione: 'pronto',
    puoAvviare: true,
    disabilitato: false,
    etichetta: `Continua nella chat — ${nome}`,
    motivo: motivoQuandoSiPuoPartire({ nome, autorizzata, giaVerificataDalServer, permesso }),
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
 * La frase che si legge quando si PUÒ partire. Dice sempre due cose: che cosa può fare TALOS, e
 * fin dove. ⛔ Mai il valore tecnico del kernel a schermo: solo il nome umano di `politiche.js`.
 */
function motivoQuandoSiPuoPartire({ nome, autorizzata, giaVerificataDalServer, permesso }) {
  const umano = nomeUmanoPolitica(permesso);
  if (giaVerificataDalServer) {
    return `${nome} arriva da Esplora file. Con «${umano}» TALOS resterà esattamente in questa cartella.`;
  }
  if (autorizzata) return `Con «${umano}» TALOS resterà nella cartella scelta.`;
  return `«${umano}» consente di usare questa cartella esterna. La scelta sarà verificata di nuovo all’avvio.`;
}
