/*
 * modulo-voce.js — IL MODULO che crea e modifica una voce, uno solo per Note, Attività e Memoria.
 *
 * Ordine dell'owner, 11/09/2026 («non negotiable»): «le note, se sono markdown, devono essere
 * renderizzate in markdown; tutte le Note, Attività, Memoria, Libreria devono avere CRUD completi».
 * Il backend è stato scritto sul contratto di `.claude/RAPPORTO-CRUD-BACKEND-2026-09-11.md` §3-§4;
 * qui c'è la metà della persona: il modulo, la validazione, le parole e la porta di rete.
 *
 * ⛔ UN MODULO SOLO, TRE RISORSE. Le tre sezioni chiedono le stesse quattro cose (un titolo, un
 *   testo, una scelta ristretta, dei tetti) con nomi e limiti diversi. Tre moduli scritti a mano
 *   sarebbero tre posti in cui ricordarsi di cambiare un tetto — ed è esattamente il difetto che
 *   `magazziniDellaPersona` (http-app.mjs:1902) ha già tolto dal lato server: una tabella, tre
 *   righe. Qui la tabella è `SCHEMI`.
 *
 * ⛔ SI VALIDA PRIMA DI MANDARE, e non per gentilezza: `public-problem.mjs` sostituisce il testo
 *   vero di ogni 400 con «Query non valida» per ogni codice fuori da una allowlist che oggi
 *   contiene solo `SESSION_NOT_READY` (rapporto backend §4, «Errori»). Il server SA perché ha
 *   rifiutato e non può dirlo: se il modulo non controlla, chi scrive resta senza motivo.
 *   I tetti qui sotto sono gli stessi dei magazzini — `notes-store.mjs:38-39` (120 / 8.000),
 *   `tasks-store.mjs:36-37` (200 / 2.000), `memory-store.mjs:52-53` (80 / 600).
 *
 * ⛔ RICERCA FATTA PRIMA DI SCRIVERE (12/09/2026; ⛔ WebSearch esaurita per la sessione, 200/200 —
 *   fonti primarie lette con WebFetch, come prevede il brief):
 *   · MDN, «aria-invalid» (letto 12/09/2026): «Do not set aria-invalid="true" on empty required
 *     elements until after the user attempts to submit the form. They may still be working on
 *     filling it out» ⇒ qui la validazione gira sul SALVA, non a ogni tasto, e `aria-invalid`
 *     nasce solo dopo un tentativo (`tentato`). Stessa pagina: l'errore si lega con
 *     `aria-errormessage`, e il messaggio va annunciato (`role="alert"`).
 *   · W3C WAI, «Forms · User Notifications» (letto 12/09/2026): «Form fields can be associated
 *     with the corresponding error message using aria-describedby», il messaggio sta ACCANTO al
 *     campo ⇒ qui `aria-describedby` (supporto più largo) **e** `aria-errormessage`, testo sotto
 *     il campo, mai in cima in un elenco che costringe a cercare.
 *   · NN/g, «Error-Message Guidelines» (letto 12/09/2026): «Keep error messages next to the fields
 *     in error minimizes working-memory load» e «avoid showing an error until the user has finished
 *     with the field» ⇒ un campo già segnalato si ripulisce mentre lo si corregge, ma nessun campo
 *     viene accusato per la prima volta mentre si scrive.
 *   · NN/g, «Confirmation Dialogs Can Prevent User Errors» (letto 12/09/2026): «provide response
 *     options that summarize what will happen» e «explain what *this* is» ⇒ la conferma
 *     d'eliminazione dice il nome della voce e cosa succede, e il bottone si chiama «Elimina la
 *     nota», non «OK». Per ciò che si disfa (uno stato, una modifica) vale il rovescio già scritto
 *     in `modale-td.js`: un toast con «Annulla», non una domanda davanti.
 */

import { prosaInNodi } from './ricerca-dettaglio.js';
import { confermaModale } from './modale-td.js';

/* ------------------------------------------------------------------ i tre schemi, in una tabella */

/**
 * `auto` non è un valore del server: è il modo di NON dichiarare il formato.
 * ⛔ In creazione `formato:null` è un 400 (il contratto lo dice a chiare lettere), sul `PATCH`
 *   invece `null` significa «smetti di dichiararlo, torna a rilevarlo» — è l'unico modo di disfare
 *   una dichiarazione sbagliata. Quindi la stessa scelta a schermo produce DUE corpi diversi, e
 *   questa è l'unica riga del file che lo sa.
 */
export const SCELTA_AUTOMATICA = 'auto';

export const SCHEMI = Object.freeze({
  note: Object.freeze({
    chiave: 'note',
    risorsa: 'notes',
    campoRisposta: 'nota',
    sostantivo: 'nota',
    articolo: 'la',
    genere: 'f',
    titoloNuova: 'Nuova nota',
    titoloModifica: 'Modifica la nota',
    codiceAssente: 'NOTE_NOT_FOUND',
    codiceInvalido: 'NOTE_INVALID',
    campi: Object.freeze([
      { nome: 'titolo', etichetta: 'Titolo', tipo: 'riga', max: 120, obbligatorio: true, invito: 'Dai un nome a questa nota…' },
      { nome: 'contenuto', etichetta: 'Contenuto', tipo: 'testo', max: 8_000, obbligatorio: true, invito: 'Scrivi qui. I titoli con il cancelletto e gli elenchi col trattino diventano Markdown.' },
      {
        nome: 'formato',
        etichetta: 'Come si legge',
        tipo: 'scelta',
        preimpostato: SCELTA_AUTOMATICA,
        scelte: Object.freeze([
          [SCELTA_AUTOMATICA, 'Riconoscilo dal testo'],
          ['markdown', 'Markdown'],
          ['testo', 'Testo semplice'],
        ]),
        aiuto: 'Lasciando «Riconoscilo dal testo» la nota cambia da sola quando il contenuto cambia.',
      },
    ]),
  }),
  tasks: Object.freeze({
    chiave: 'attivita',
    risorsa: 'tasks',
    campoRisposta: 'attivita',
    sostantivo: 'attività',
    articolo: 'l’',
    genere: 'f',
    titoloNuova: 'Nuova attività',
    titoloModifica: 'Modifica l’attività',
    codiceAssente: 'TASK_NOT_FOUND',
    codiceInvalido: 'TASK_INVALID',
    campi: Object.freeze([
      { nome: 'titolo', etichetta: 'Titolo', tipo: 'riga', max: 200, obbligatorio: true, invito: 'Che cosa c’è da fare…' },
      { nome: 'descrizione', etichetta: 'Descrizione', tipo: 'testo', max: 2_000, obbligatorio: false, invito: 'Facoltativa: i dettagli che servono per farla.' },
      {
        nome: 'priorita',
        etichetta: 'Priorità',
        tipo: 'scelta',
        preimpostato: 'normal',
        scelte: Object.freeze([['low', 'Bassa'], ['normal', 'Normale'], ['high', 'Alta']]),
      },
    ]),
  }),
  memory: Object.freeze({
    chiave: 'memoria',
    risorsa: 'memory',
    campoRisposta: 'memoria',
    sostantivo: 'ricordo',
    articolo: 'il',
    genere: 'm',
    titoloNuova: 'Nuovo ricordo',
    titoloModifica: 'Modifica il ricordo',
    codiceAssente: 'MEMORY_NOT_FOUND',
    codiceInvalido: 'MEMORY_INVALID',
    campi: Object.freeze([
      { nome: 'titolo', etichetta: 'Titolo', tipo: 'riga', max: 80, obbligatorio: true, invito: 'Come si chiama questo ricordo…' },
      { nome: 'contenuto', etichetta: 'Contenuto', tipo: 'testo', max: 600, obbligatorio: true, invito: 'Quello che TALOS deve ricordare di te.' },
      {
        nome: 'genere',
        etichetta: 'Tipo',
        tipo: 'scelta',
        preimpostato: 'preference',
        scelte: Object.freeze([
          ['preference', 'Preferenza'],
          ['project_fact', 'Fatto'],
          ['procedure', 'Procedura'],
          ['policy_note', 'Regola'],
        ]),
      },
    ]),
  }),
});

/* -------------------------------------------------------------------------------- le PAROLE */

const PAROLE_STATO = new Map([['todo', 'Da fare'], ['doing', 'In corso'], ['done', 'Fatta']]);
/** Le tre caselle dello stato di un'attività, nell'ordine in cui una persona le percorre. */
export const STATI_ATTIVITA = Object.freeze(['todo', 'doing', 'done']);
export function parolaStato(stato) { return PAROLE_STATO.get(stato) || 'Stato non registrato'; }

/**
 * L'ACCORDO GRAMMATICALE, in un posto solo.
 * ⛔ TROVATO NELLA FOTO (`memoria-elimina-scuro-1440.png`, 12/09): «il ricordo … viene
 *   CANCELLATA dal disco» e «SCRITTA da te» su un sostantivo maschile. Un modulo solo per tre
 *   risorse mette in comune anche le frasi, e una frase comune non può avere un genere fisso.
 *   Qui la desinenza la decide lo schema, e nessuna delle tre sezioni scrive più participi a mano.
 */
export function accordo(schema, radice) { return `${radice}${schema?.genere === 'm' ? 'o' : 'a'}`; }

/**
 * Chi ha scritto la voce.
 * ⛔ Una voce senza `origine` sul disco è del MODELLO (rapporto backend §4): fino a oggi quella era
 *   l'unica porta che scriveva. Ma «assente» e «non l'abbiamo ancora letta» sono due cose diverse:
 *   l'elenco non porta il campo, quindi `undefined` qui vuol dire «non lo so ancora» e non si
 *   scrive niente. Il fatto si dichiara solo quando arriva dalla GET della voce.
 */
export function parolaOrigine(origine, schema = null) {
  if (origine === 'persona') return `${accordo(schema, 'Scritt')} da te`;
  if (origine === 'modello') return `${accordo(schema, 'Scritt')} da TALOS`;
  return '';
}

const numero = (n) => Number(n).toLocaleString('it-IT');

/* ---------------------------------------------------------------------------- la VALIDAZIONE */

/** I valori con cui il modulo si apre: quelli della voce se c'è, altrimenti i preimpostati. */
export function valoriIniziali(schema, voce = null) {
  const valori = {};
  for (const campo of schema.campi) {
    if (campo.tipo === 'scelta') {
      const attuale = voce?.[campo.nome];
      const ammesso = campo.scelte.some(([valore]) => valore === attuale);
      /*
       * ⛔ SU UNA NOTA IL FORMATO ARRIVA SEMPRE VALORIZZATO, anche quando nessuno l'ha dichiarato:
       *   il magazzino lo RILEVA a ogni lettura (`rilevaFormatoNota`, notes-store.mjs:107) e la
       *   forma pubblica non distingue «dichiarato» da «rilevato». Quindi il modulo mostra ciò che
       *   la nota È — che è la cosa vera da far vedere — e il fatto che la scelta non sia stata
       *   toccata lo garantisce `corpoModifica`, che manda solo ciò che CAMBIA: riaprire una nota,
       *   correggere il titolo e salvare non congela per sempre un formato che si aggiornava da
       *   solo, perché quella chiave non parte proprio.
       */
      valori[campo.nome] = ammesso ? attuale : campo.preimpostato;
    } else {
      const attuale = voce?.[campo.nome];
      valori[campo.nome] = typeof attuale === 'string' ? attuale : '';
    }
  }
  return valori;
}

/**
 * Il controllo, campo per campo, con le parole che servono a chi sta scrivendo.
 * @returns {{ok:boolean, errori:Record<string,string>}}
 */
export function validaValori(schema, valori) {
  const errori = {};
  for (const campo of schema.campi) {
    if (campo.tipo === 'scelta') {
      const scelto = valori?.[campo.nome];
      if (!campo.scelte.some(([valore]) => valore === scelto)) errori[campo.nome] = 'Scegli una delle voci in elenco.';
      continue;
    }
    const testo = typeof valori?.[campo.nome] === 'string' ? valori[campo.nome] : '';
    if (campo.obbligatorio && testo.trim().length === 0) {
      errori[campo.nome] = campo.nome === 'titolo'
        ? `Serve un titolo: è così che ritrovi ${schema.articolo}${schema.articolo.endsWith('’') ? '' : ' '}${schema.sostantivo}.`
        : 'Serve un testo: qui non si salva una voce vuota.';
      continue;
    }
    /*
     * ⛔ Il tetto si misura sui caratteri GREZZI, non su quelli tagliati ai bordi: i magazzini
     *   scrivono `title.trim().length === 0 || title.length > MASSIMO` — cioè il vuoto si giudica
     *   sul ritagliato e la lunghezza sull'intero. Misurare qui in un altro modo darebbe un modulo
     *   che dice «va bene» su un corpo che il server rifiuta.
     */
    if (testo.length > campo.max) {
      errori[campo.nome] = `${campo.etichetta} può arrivare a ${numero(campo.max)} caratteri: qui ce ne sono ${numero(testo.length)}.`;
    }
  }
  return { ok: Object.keys(errori).length === 0, errori };
}

/** Il corpo del `POST`: ogni campo dichiarato, tranne la scelta lasciata su «riconoscilo da solo». */
export function corpoCreazione(schema, valori) {
  const corpo = {};
  for (const campo of schema.campi) {
    const valore = valori?.[campo.nome];
    if (campo.tipo === 'scelta') {
      /* `auto` in creazione NON si manda: `formato:null` sarebbe un 400 (contratto §4). */
      if (valore !== SCELTA_AUTOMATICA) corpo[campo.nome] = valore;
      continue;
    }
    const testo = typeof valore === 'string' ? valore : '';
    if (!campo.obbligatorio && testo.trim().length === 0) continue; // una descrizione vuota non si manda
    corpo[campo.nome] = testo;
  }
  return corpo;
}

/**
 * Il corpo del `PATCH`: SOLO ciò che è cambiato davvero.
 * ⛔ Non è un'ottimizzazione: il contratto dice «un campo assente non è un campo svuotato», e
 *   rimandare tutto vorrebbe dire riscrivere `aggiornataAlle` e il formato anche quando si è
 *   toccata una virgola sola. Un `PATCH` senza nemmeno un campo è un 400, e qui si sa prima.
 * @returns {{corpo:object, cambiato:boolean}}
 */
export function corpoModifica(schema, valori, voce) {
  const iniziali = valoriIniziali(schema, voce);
  const corpo = {};
  for (const campo of schema.campi) {
    const adesso = valori?.[campo.nome];
    if (adesso === iniziali[campo.nome]) continue;
    if (campo.tipo === 'scelta') {
      /* Sul PATCH `null` è la forma di «torna a rilevarlo»: l'unico modo di disfare una
         dichiarazione sbagliata (contratto §4, Nota). Vale solo dove il server lo accetta. */
      corpo[campo.nome] = adesso === SCELTA_AUTOMATICA ? (campo.nome === 'formato' ? null : campo.preimpostato) : adesso;
      continue;
    }
    corpo[campo.nome] = typeof adesso === 'string' ? adesso : '';
  }
  return { corpo, cambiato: Object.keys(corpo).length > 0 };
}

/**
 * Che cosa dire quando il server rifiuta.
 * ⛔ Il `message` di un 400 è generico per policy: ripeterlo a schermo sarebbe «Query non valida»
 *   davanti a una persona. Qui si traduce il CODICE, che è l'unica parte vera che esce dalla busta.
 */
export function paroleErroreRete(codice, schema, { azione = 'salvare' } = {}) {
  if (codice === schema.codiceAssente) return `Questa voce non c’è più: qualcuno l’ha eliminata mentre era aperta. Ho ricaricato l’elenco.`;
  if (codice === 'NOT_FOUND') return 'La sessione non è più aperta: riapri una conversazione e riprova.';
  if (codice === 'PAYLOAD_LIMIT') return 'Il testo è troppo lungo per essere spedito: accorcialo e riprova.';
  if (codice === 'QUERY_INVALID' || codice === schema.codiceInvalido) return 'Il server ha rifiutato questi valori: controlla i campi qui sopra. (Il motivo preciso resta nel registro diagnostico: la busta pubblica non lo porta.)';
  return `Non sono riuscito a ${azione}: riprova fra un momento.`;
}

/* ------------------------------------------------------------------------- la PORTA di rete */

/**
 * Le cinque porte della persona, costruite su una sessione.
 *
 * ⛔ Nessun indirizzo scritto a mano nei tre adattatori: la forma delle rotte sta qui, una volta.
 *   `rete` sono le funzioni della app (`apiPost`/`apiPatch`/`apiDelete`/`apiGet`), che aprono già
 *   la busta `{ok, data}` e lanciano un `Error` con `.code`. Chi non le passa (un test, il
 *   laboratorio) passa le sue e vince — stessa iniezione di `lettoreFileLibreria`.
 * ⛔ Senza sessione o senza rete torna `null`, e le sezioni non disegnano nemmeno il pulsante:
 *   un comando che non può funzionare non si mostra (la regola della riga di Libreria del 10/09).
 */
export function servizioVoci({ schema, sessionId, rete } = {}) {
  if (!schema || !sessionId || typeof rete?.post !== 'function' || typeof rete?.patch !== 'function' || typeof rete?.elimina !== 'function') return null;
  const base = `/api/v1/sessions/${encodeURIComponent(sessionId)}/${schema.risorsa}`;
  const voceUrl = (id) => `${base}/${encodeURIComponent(String(id ?? ''))}`;
  return {
    schema,
    crea: (corpo) => rete.post(base, corpo),
    leggi: typeof rete.leggi === 'function' ? (id) => rete.leggi(voceUrl(id)) : null,
    modifica: (id, corpo) => rete.patch(voceUrl(id), corpo),
    elimina: (id) => rete.elimina(voceUrl(id)),
    /* Lo stato ha la SUA porta: `PATCH {stato}` è un 400 apposta, perché marcare fatta non è
       modificare (contratto §3, e lo stesso confine che ha l'attrezzo del modello). */
    cambiaStato: (id, stato) => rete.post(`${voceUrl(id)}/stato`, { stato }),
  };
}

/* ------------------------------------------------------------------------------ il DOM del modulo */

function nodo(doc, tag, classe, testo) {
  const el = doc.createElement(tag);
  if (classe) el.className = classe;
  if (testo !== undefined && testo !== null) el.textContent = String(testo);
  return el;
}

let contatore = 0;

/**
 * Quando far vedere il contatore dei caratteri.
 * ⛔ Sempre acceso sarebbe rumore su ogni campo di ogni modulo; solo dopo lo sforamento sarebbe
 *   una sorpresa a cose fatte. Si accende sull'ultimo decimo, cioè quando la notizia serve.
 */
export function mostraConteggio(lunghezza, massimo) {
  return Number(lunghezza) >= Number(massimo) * 0.9;
}

/** «131 caratteri su 120» — e al singolare non diventa «1 caratteri». */
export function fraseConteggio(lunghezza, massimo) {
  const n = Number(lunghezza) || 0;
  return `${numero(n)} ${n === 1 ? 'carattere' : 'caratteri'} su ${numero(massimo)}`;
}

/**
 * Il modulo intero: etichette, campi, errori sotto il campo, e niente altro.
 *
 * ⛔ I VALORI NON PASSANO DA UN RIDISEGNO. Ogni tasto premuto aggiorna `stato.valori` e basta: se
 *   il modulo si ricostruisse a ogni carattere, il cursore tornerebbe in fondo e la selezione
 *   sparirebbe (è la stessa ragione per cui `disegnaCrudo` si tiene il fuoco per id). Il modulo si
 *   ricostruisce solo quando cambia davvero: al salvataggio, all'annullamento, su un errore.
 *
 * @returns {Node[]} i nodi da mettere nel corpo del dettaglio
 */
export function costruisciModulo(doc, {
  schema,
  stato,
  onCambia = () => {},
  onSalva = () => {},
}) {
  contatore += 1;
  const radice = `td-modulo-${contatore}`;
  const modulo = nodo(doc, 'form', `td-modulo td-modulo--${schema.chiave}`);
  modulo.noValidate = true;
  modulo.addEventListener('submit', (e) => { e.preventDefault?.(); onSalva(); });

  for (const campo of schema.campi) {
    const idCampo = `${radice}-${campo.nome}`;
    const errore = stato.errori?.[campo.nome] || '';
    const etichetta = nodo(doc, 'label', 'td-field-label', campo.etichetta);
    etichetta.setAttribute('for', idCampo);
    modulo.append(etichetta);

    let controllo;
    if (campo.tipo === 'scelta') {
      controllo = nodo(doc, 'select', 'td-edit-scelta');
      for (const [valore, parola] of campo.scelte) {
        const op = nodo(doc, 'option', '', parola);
        op.value = valore;
        controllo.append(op);
      }
      controllo.value = stato.valori[campo.nome];
    } else {
      controllo = nodo(doc, campo.tipo === 'riga' ? 'input' : 'textarea', campo.tipo === 'riga' ? 'td-edit-title' : 'td-edit-body');
      if (campo.tipo === 'riga') controllo.type = 'text';
      controllo.value = stato.valori[campo.nome];
      controllo.placeholder = campo.invito || '';
      /* ⛔ Niente `maxlength`: taglierebbe in silenzio un testo incollato, e chi incolla non se ne
         accorge finché non rilegge. Meglio accettarlo e dire quanto è lungo. */
      if (campo.obbligatorio) controllo.setAttribute('aria-required', 'true');
    }
    controllo.id = idCampo;
    controllo.name = campo.nome;

    const sotto = nodo(doc, 'p', 'td-field-sotto');
    const messaggio = nodo(doc, 'span', 'td-field-errore', errore);
    messaggio.id = `${idCampo}-errore`;
    messaggio.hidden = !errore;
    messaggio.setAttribute('role', 'alert');
    const conteggio = nodo(doc, 'span', 'td-field-conta', campo.max ? fraseConteggio(String(stato.valori[campo.nome] ?? '').length, campo.max) : '');
    conteggio.hidden = !campo.max || !mostraConteggio(String(stato.valori[campo.nome] ?? '').length, campo.max);
    const aiuto = campo.aiuto ? nodo(doc, 'span', 'td-field-aiuto', campo.aiuto) : null;
    if (aiuto) aiuto.id = `${idCampo}-aiuto`;
    sotto.append(messaggio, conteggio, ...(aiuto ? [aiuto] : []));

    const descritto = [errore ? messaggio.id : '', aiuto ? aiuto.id : ''].filter(Boolean).join(' ');
    if (descritto) controllo.setAttribute('aria-describedby', descritto);
    if (errore) {
      controllo.setAttribute('aria-invalid', 'true');
      controllo.setAttribute('aria-errormessage', messaggio.id);
    }

    controllo.addEventListener('input', () => {
      stato.valori[campo.nome] = controllo.value;
      if (campo.max) {
        conteggio.textContent = fraseConteggio(controllo.value.length, campo.max);
        conteggio.hidden = !mostraConteggio(controllo.value.length, campo.max);
      }
      /* ⛔ NN/g: un campo già accusato si ripulisce mentre lo si corregge, ma nessuno viene
         accusato per la prima volta mentre scrive. Qui si toglie, mai si aggiunge. */
      if (stato.errori?.[campo.nome]) {
        const ancora = validaValori(schema, stato.valori).errori[campo.nome];
        if (!ancora) {
          delete stato.errori[campo.nome];
          messaggio.hidden = true;
          messaggio.textContent = '';
          controllo.removeAttribute('aria-invalid');
          controllo.removeAttribute('aria-errormessage');
        }
      }
      onCambia();
    });
    controllo.addEventListener('change', () => { stato.valori[campo.nome] = controllo.value; onCambia(); });
    modulo.append(controllo, sotto);
  }

  if (stato.erroreRete) {
    const avviso = nodo(doc, 'p', 'td-modulo-errore', stato.erroreRete);
    avviso.setAttribute('role', 'alert');
    modulo.append(avviso);
  }
  return [modulo];
}

/* -------------------------------------------------------- il testo di una voce, reso o grezzo */

const PAROLE_MODO = new Map([['anteprima', 'Anteprima'], ['testo', 'Testo']]);

/**
 * L'interruttore «Anteprima · Testo» del dettaglio, lo stesso della Libreria.
 *
 * ⛔ NESSUN SECONDO MOTORE MARKDOWN e nessuna seconda grammatica: il render è quello della chat,
 *   iniettato (`rendiMarkdown`), e passa da `prosaInNodi` come in `libreria-anteprima.js`. La
 *   striscia è un `role="tablist"` per la stessa ragione scritta là: sono due viste dello stesso
 *   pannello, e il dettaglio della Ricerca ne ha già una identica due sezioni più in là.
 * ⛔ UN MODO SOLO NON È UN INTERRUTTORE: su una nota di testo semplice «Anteprima» e «Testo»
 *   direbbero la stessa cosa, quindi la striscia non compare — la regola che nasconde la riga dei
 *   filtri quando il filtro è uno solo.
 * ⛔ E finché il formato non si sa (l'elenco non lo porta: rapporto backend §6) non si indovina:
 *   si mostra il testo come prosa, e l'interruttore arriva con la GET della voce.
 */
export function montaTestoVoce(doc, {
  testo,
  formato,
  titoloGiaDetto = '',
  rendiMarkdown = null,
  modo = null,
  onModo = () => {},
}) {
  const prosa = String(testo ?? '');
  if (formato !== 'markdown') {
    return [nodo(doc, 'div', 'td-prose', prosa)];
  }
  contatore += 1;
  const radice = `td-voce-${contatore}`;
  const pannello = nodo(doc, 'div', 'td-vista td-voce-vista');
  pannello.id = `${radice}-pannello`;
  pannello.setAttribute('role', 'tabpanel');
  pannello.tabIndex = 0;

  const modi = ['anteprima', 'testo'];
  let scelto = modi.includes(modo) ? modo : 'anteprima';
  const lista = nodo(doc, 'div', 'td-segment td-viste td-voce-modi');
  lista.setAttribute('role', 'tablist');
  lista.setAttribute('aria-label', 'Come guardare il testo');
  const schede = modi.map((m) => {
    const b = nodo(doc, 'button', '', PAROLE_MODO.get(m));
    b.type = 'button';
    b.id = `${radice}-${m}`;
    b.dataset.modo = m;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', pannello.id);
    lista.append(b);
    return b;
  });

  function mostra(m, muoviIlFuoco = false) {
    scelto = m;
    for (const b of schede) {
      const attiva = b.dataset.modo === m;
      b.setAttribute('aria-selected', String(attiva));
      b.tabIndex = attiva ? 0 : -1; // un solo stop del Tab su tutta la striscia
      if (attiva && muoviIlFuoco) b.focus?.({ preventScroll: true });
    }
    pannello.setAttribute('aria-labelledby', `${radice}-${m}`);
    if (m === 'anteprima') pannello.replaceChildren(prosaInNodi(doc, prosa, rendiMarkdown, titoloGiaDetto));
    else {
      const pre = nodo(doc, 'pre', 'td-code td-voce-testo', prosa);
      pre.tabIndex = 0;
      pre.setAttribute('role', 'region');
      pre.setAttribute('aria-label', 'Testo come è stato scritto');
      pannello.replaceChildren(pre);
    }
    onModo(m);
  }

  lista.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-modo]');
    if (b) mostra(b.dataset.modo);
  });
  lista.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const attuale = schede.findIndex((b) => b.getAttribute('aria-selected') === 'true');
    const prossima = e.key === 'Home' ? 0
      : e.key === 'End' ? schede.length - 1
        : (attuale + (e.key === 'ArrowRight' ? 1 : -1) + schede.length) % schede.length;
    mostra(schede[prossima].dataset.modo, true);
  });
  mostra(scelto);
  return [lista, pannello];
}

/* ------------------------------------------------------------ la fila di stato di un'attività */

/**
 * Le tre caselle dello stato, in linea nel dettaglio.
 * ⛔ Un `radiogroup`, non tre bottoni: si sceglie UN valore fra tre, e il pattern delle APG per una
 *   scelta esclusiva è quello — le frecce girano fra le opzioni, il Tab entra ed esce una volta.
 *   (L'interruttore «Anteprima · Testo» è invece un `tablist`, perché lì si cambia VISTA dello
 *   stesso contenuto: due gesti diversi, due grammatiche diverse, come già scritto nella Libreria.)
 */
export function costruisciStatoAttivita(doc, { stato, inCorso = false, onScegli = () => {} }) {
  const gruppo = nodo(doc, 'div', 'td-segment td-stati-attivita');
  gruppo.setAttribute('role', 'radiogroup');
  gruppo.setAttribute('aria-label', 'Stato dell’attività');
  const bottoni = STATI_ATTIVITA.map((valore) => {
    const b = nodo(doc, 'button', '', parolaStato(valore));
    b.type = 'button';
    b.dataset.stato = valore;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(valore === stato));
    b.setAttribute('aria-selected', String(valore === stato)); // il `.td-segment` colora su questo
    b.tabIndex = valore === stato ? 0 : -1;
    b.disabled = Boolean(inCorso);
    b.addEventListener('click', () => { if (valore !== stato) onScegli(valore); });
    gruppo.append(b);
    return b;
  });
  gruppo.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const attuale = bottoni.findIndex((b) => b.dataset.stato === stato);
    const prossima = e.key === 'Home' ? 0
      : e.key === 'End' ? bottoni.length - 1
        : (attuale + (e.key === 'ArrowRight' ? 1 : -1) + bottoni.length) % bottoni.length;
    bottoni[prossima].focus?.({ preventScroll: true });
    onScegli(bottoni[prossima].dataset.stato);
  });
  return gruppo;
}

/* ------------------------------------------------------------------ eliminare, con la conferma */

/**
 * La domanda prima di cancellare, con le parole che NN/g chiede: che cosa è «questo», che cosa
 * succede, e un bottone che dice quel che fa invece di «OK».
 *
 * ⛔ QUI RESTA LA CONFERMA e non il toast con «Annulla», al contrario della modifica e dello stato:
 *   il file sul disco viene cancellato davvero e non c'è nessun cestino da cui ripescarlo. È la
 *   stessa scala d'attrito già scritta nella riga della Libreria il 10/09 — si chiede SOLO per ciò
 *   che non si rifà.
 * ⛔ È una funzione e non tre righe dentro l'adattatore perché la prova che conta è quella AL
 *   CONTRARIO: chi preme «Annulla» non deve far partire nessuna `DELETE`. Dentro una closure di
 *   `sezioni-adattatori.js` quella prova non si potrebbe scrivere.
 *
 * @returns {{dialogo:any, contenuto:any, chiudi:Function}|null} la modale aperta
 */
export function confermaEliminazione({
  schema, voce, titolo, servizio, document: doc = globalThis.document,
  avvisa = () => {}, ricarica = () => {}, dopo = () => {},
}) {
  const articolo = `${schema.articolo}${schema.articolo.endsWith('’') ? '' : ' '}${schema.sostantivo}`;
  return confermaModale({
    document: doc,
    titolo: `Elimino ${articolo}?`,
    domanda: `«${titolo}» viene ${accordo(schema, 'cancellat')} dal disco.`,
    conseguenza: 'Non c’è un cestino: l’eliminazione è definitiva, e nemmeno TALOS potrà rileggere questo testo.',
    etichettaConferma: `Elimina ${articolo}`,
    onConferma: async () => {
      try {
        await servizio.elimina(voce?.id);
        avvisa(accordo(schema, 'Eliminat'), `«${titolo}» non c’è più.`);
        dopo();
      } catch (errore) {
        avvisa(`Non ${accordo(schema, 'eliminat')}`, paroleErroreRete(errore?.code, schema, { azione: 'eliminare' }), { tono: 'errore' });
      }
      ricarica();
    },
  });
}
