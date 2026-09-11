/*
 * sezioni-adattatori.js — le SEI sezioni del lotto C, coi dati veri.
 *
 * Decisione dell'owner, 11/09/2026: «elenco a sinistra e dettaglio a destra, per tutte e sei le
 * pagine, coi dati veri». Qui non c'è nessun dato di esempio: Note, Memoria, Attività, Libreria,
 * Ricerca e Progetti leggono le stesse rotte di prima
 * (`/api/v1/sessions/:id/{notes,memory,tasks,library,research}` e `/api/v1/projects`), e le
 * chiama `legacy/app.js` come le chiamava ieri.
 *
 * ⛔ PERCHE' LE FUNZIONI HANNO GLI STESSI NOMI DI PRIMA.
 *   `montaNote`, `aggiornaPaginaMemoria`, `aggiornaPaginaAttivita`, `aggiornaPaginaLibreria`,
 *   `aggiornaPaginaRicerca`, `montaProgetti` hanno qui la STESSA firma che avevano nei sei
 *   componenti originali. Così l'aggancio in `legacy/app.js` è di SEI RIGHE DI `import`, non di
 *   sei chiamate riscritte: meno superficie toccata nel file che non è mio, e un rollback che è
 *   rimettere sei righe.
 *
 * ⛔ COSA SI RIUSA (niente di questo è stato riscritto):
 *   · `note.js` → `titoloNota`, `quandoNota`, `sommarioNote`;
 *   · `memoria.js` → `genereMemoria`, `testiMemoria`;
 *   · `attivita.js` → `statoAttivita`, `prioritaAttivita`, `testiAttivita`, `riepilogoAttivita`;
 *   · `libreria.js` → `tipoVoceLibreria`, `origineVoceLibreria`, `testiVoceLibreria`,
 *     `azioniLibreria`, `indirizzoFileLibreria` e **la riga vera** `creaLibraryRow`, che vive
 *     dentro il dettaglio con tutte e cinque le sue azioni;
 *   · `ricerca.js` → `statoRicerca`, `testiRicerca`, `riepilogoRicerche`;
 *   · `progetti.js` → `frasiProgetto`, `sommarioProgetti`, `ultimeSessioni`;
 *   · `plurale.js` → il plurale italiano, che vive in un posto solo.
 *
 * ⛔ COSA NON C'E', E PERCHE' NON PUO' ESSERCI. Il mockup fa modificare, creare, spuntare ed
 *   eliminare ogni voce di ogni sezione, perché i suoi dati stanno in memoria. Sul server vero
 *   `notes`, `memory`, `tasks`, `research` e `projects` espongono **solo GET**
 *   (`harness-ui/src/http-app.mjs`, righe 762 e 840): un pulsante «Modifica» o una casella da
 *   spuntare qui sarebbe una promessa che nessuna rotta può mantenere — è la lezione
 *   «‹APERTA› non è ‹FATTA›». Quindi la spunta di un'attività è un SEGNO di stato, non un
 *   comando, e l'unica sezione che scrive è la Libreria, che le rotte ce le ha (PATCH/DELETE/POST).
 */
import { titoloNota, quandoNota, sommarioNote } from './note.js';
import { genereMemoria, testiMemoria } from './memoria.js';
import { statoAttivita, prioritaAttivita, testiAttivita, riepilogoAttivita } from './attivita.js';
import { tipoVoceLibreria, origineVoceLibreria, testiVoceLibreria, azioniLibreria, indirizzoFileLibreria, creaLibraryRow } from './libreria.js';
import { statoRicerca, testiRicerca, riepilogoRicerche } from './ricerca.js';
import { frasiProgetto, sommarioProgetti, ultimeSessioni } from './progetti.js';
import { plurale } from './plurale.js';
import { montaSezione } from './sezione-elenco-dettaglio.js';
import { azioneAnnulla } from './toast.js';

/* ------------------------------------------------------------------ utensili comuni, pure */

/** L'anteprima nella scheda: niente cancelletti di Markdown, niente righe vuote in fila. */
export function anteprima(testo, quanti = 240) {
  const pulito = String(testo ?? '').replace(/^#+\s*/gm, '').replace(/\n{3,}/g, '\n\n').trim();
  // `trimEnd`: senza, il taglio dopo un a capo lasciava i puntini su una riga da soli (visto nella foto).
  return pulito.length > quanti ? `${pulito.slice(0, quanti).trimEnd()}…` : pulito;
}

/** Quante parole ha una nota: è il numero che dice se vale la pena aprirla. */
export function conteggioParole(testo) {
  return String(testo ?? '').split(/\s+/).filter(Boolean).length;
}

/**
 * La notifica: di default quella della app (`toast`), passata da `legacy/app.js`.
 * ⛔ Senza iniezione NON si inventa un secondo sistema di messaggi: si tace, e l'esito resta dove
 *   già stava (la riga della Libreria lo scrive comunque sotto il nome).
 */
function notificatore(opzioni) {
  return typeof opzioni?.notifica === 'function' ? opzioni.notifica : () => {};
}

function nodo(doc, tag, classe, testo) {
  const el = doc.createElement(tag);
  if (classe) el.className = classe;
  if (testo !== undefined && testo !== null) el.textContent = String(testo);
  return el;
}

/** Un pulsante del dettaglio, nel linguaggio dei bottoni della app. */
function bottone(doc, testo, { variante = 'secondary', esegui, pericolo = false } = {}) {
  const b = nodo(doc, 'button', `talos-button talos-button--${variante} talos-button--sm${pericolo ? ' talos-button--danger' : ''}`, testo);
  b.type = 'button';
  if (esegui) b.addEventListener('click', esegui);
  return b;
}

/**
 * «Esporta» del mockup (`exportText`, riga 6041): il contenuto che hai davanti diventa un file.
 * ⛔ È l'unica scrittura che una sezione in sola lettura può offrire davvero, perché avviene nel
 *   browser e non chiede niente al server.
 */
export function esportaTesto(doc, nome, testo, mime = 'text/markdown') {
  const url = URL.createObjectURL(new Blob([testo], { type: mime }));
  const a = doc.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * La «copertina» di un file (mockup `td-document-cover`, riga 4269) SENZA il contenuto: la rotta
 * della Libreria manda i metadati, non i byte. Quindi si mostra ciò che si sa davvero — l'estensione
 * e il nome — invece di inventare un'anteprima.
 */
export function estensioneFile(nome) {
  const pezzo = String(nome ?? '').split('.').pop();
  return pezzo && pezzo !== String(nome) ? pezzo.toUpperCase().slice(0, 6) : 'FILE';
}

/** Solo la data, per il piede della scheda: l'ora intera vive nel dettaglio. */
export function dataBreve(iso) {
  const d = iso ? new Date(iso) : null;
  return d && Number.isFinite(d.getTime()) ? d.toLocaleDateString('it-IT') : '';
}

function meta(doc, pezzi) {
  const riga = nodo(doc, 'div', 'td-detail-meta');
  riga.append(...pezzi.filter(Boolean));
  return riga;
}

/* ------------------------------------------------------------------------------------ NOTE */

export function montaNote(schermo, note, opzioni = {}) {
  /*
   * ⛔ `cerca` arrivava da `#cercaNota`, il campo che stava nella pagina vecchia: adesso il campo di
   *   ricerca è dentro la sezione e lo stato della ricerca vive lì, quindi un ridisegno NON lo
   *   azzera più. Il parametro resta accettato — la firma non cambia — e vale come ricerca iniziale.
   */
  const { cerca = '', onCopia = null, adesso = new Date() } = opzioni;
  const avvisa = notificatore(opzioni);
  return montaSezione(schermo, {
    chiave: 'note',
    nome: 'Note',
    icona: 'doc',
    famiglia: 'td-note',
    sostantivo: 'nota',
    voci: Array.isArray(note) ? note : [],
    stato: { errore: opzioni.errore || null, caricamento: Boolean(opzioni.caricamento) },
    caricando: 'Leggo le note…',
    onAggiorna: opzioni.onAggiorna,
    // Una sola famiglia di note sul disco: nessun filtro finto per riempire la riga.
    filtri: [{ id: 'tutte', etichetta: 'Tutte' }],
    queryIniziale: cerca,
    idDi: (n) => n?.id ?? titoloNota(n),
    titoloDi: (n) => titoloNota(n),
    quandoDi: (n) => n?.aggiornataAlle ?? n?.quando ?? n?.creataAlle ?? n?.createdAt ?? null,
    cercaIn: (n) => `${n?.titolo ?? ''} ${n?.contenuto ?? ''}`,
    sommarioBarra: (n, { errore, caricamento }) => (errore ? 'Note non disponibili' : caricamento ? 'Leggo le note…' : sommarioNote(n)),
    sommarioStato: (visibili, totale) => (visibili === totale ? sommarioNote(totale) : `${sommarioNote(visibili)} su ${sommarioNote(totale)}`),
    scheda: (n, { doc, icona }) => ({
      alto: [icona('doc'), nodo(doc, 'span', '', 'Appunto')],
      corpo: [nodo(doc, 'p', 'td-excerpt', anteprima(n?.contenuto))],
      basso: [
        nodo(doc, 'span', '', quandoNota(n?.aggiornataAlle ?? n?.creataAlle, adesso) || 'senza data'),
        nodo(doc, 'span', '', plurale(conteggioParole(n?.contenuto), 'parola', 'parole')),
      ],
    }),
    dettaglio: (n, { doc, etichetta }) => [
      meta(doc, [etichetta('Nota'), nodo(doc, 'span', '', quandoNota(n?.aggiornataAlle ?? n?.creataAlle, adesso) || 'data non registrata')]),
      nodo(doc, 'h2', '', titoloNota(n)),
      nodo(doc, 'div', 'td-prose', String(n?.contenuto ?? '')),
    ],
    azioniDettaglio: (n, { doc }) => [
      bottone(doc, 'Copia', { esegui: () => onCopia?.(n) }),
      bottone(doc, 'Esporta', {
        esegui: () => {
          esportaTesto(doc, `${titoloNota(n).replace(/[\\/:*?"<>|]/g, '-').slice(0, 80)}.md`, `# ${titoloNota(n)}\n\n${n?.contenuto ?? ''}`);
          avvisa('Esportata', `${titoloNota(n)} è stata scaricata come file Markdown.`);
        },
      }),
    ],
    notaPiede: () => 'Le note vivono in .notes-store/',
    vuoto: { titolo: 'Nessuna nota', testo: 'TALOS scrive una nota quando trova qualcosa che vale la pena ricordare. Le note vivono in .notes-store/ e valgono per tutti i progetti.' },
  });
}

/* --------------------------------------------------------------------------------- MEMORIA */

const GENERI_FILTRO = [
  ['tutti', 'Tutte', null],
  ['preference', 'Preferenze', 'preference'],
  ['project_fact', 'Fatti', 'project_fact'],
  ['procedure', 'Procedure', 'procedure'],
  ['policy_note', 'Regole', 'policy_note'],
];

export function aggiornaPaginaMemoria(schermo, memorie, opzioni = {}) {
  const avvisa = notificatore(opzioni);
  return montaSezione(schermo, {
    chiave: 'memoria',
    nome: 'Memoria',
    icona: 'brain',
    famiglia: 'td-memory',
    sostantivo: 'ricordo',
    voci: Array.isArray(memorie) ? memorie : [],
    stato: { errore: opzioni.errore || null, caricamento: Boolean(opzioni.caricamento) },
    caricando: 'Caricamento ricordi…',
    onAggiorna: opzioni.onAggiorna,
    filtri: GENERI_FILTRO.map(([id, etichetta, genere]) => ({ id, etichetta, quando: genere ? (m) => m?.genere === genere : null })),
    idDi: (m) => m?.id,
    titoloDi: (m) => testiMemoria(m).titolo,
    quandoDi: (m) => m?.aggiornataAlle ?? null,
    cercaIn: (m) => `${testiMemoria(m).titolo} ${testiMemoria(m).contenuto} ${genereMemoria(m?.genere).testo}`,
    sommarioBarra: (n, { errore, caricamento }) => (errore ? 'Ricordi non disponibili' : caricamento ? 'Caricamento ricordi…' : `${plurale(n, 'ricordo')} · globali`),
    scheda: (m, { doc, icona, etichetta }) => {
      const g = genereMemoria(m?.genere);
      const segno = nodo(doc, 'span', 'td-memory-mark');
      segno.append(icona(g.icona));
      return {
        /* ⛔ Il genere si dice UNA volta: il segno col simbolo, e l'etichetta col tono. Scriverlo
           anche come testo in mezzo ai due («Regola  [Regola]») era un doppione visto nella foto. */
        alto: [segno, etichetta(g.testo, g.tono || 'accent')],
        corpo: [nodo(doc, 'p', 'td-excerpt', anteprima(testiMemoria(m).contenuto))],
        /* Nella scheda la data e basta: l'ora intera sta nel dettaglio e qui si troncava. */
        basso: [nodo(doc, 'span', '', dataBreve(m?.aggiornataAlle) || 'Data non registrata')],
      };
    },
    dettaglio: (m, { doc, etichetta }) => {
      const t = testiMemoria(m);
      const g = genereMemoria(m?.genere);
      const pezzi = [
        meta(doc, [etichetta(g.testo, g.tono || 'accent'), nodo(doc, 'span', '', t.aggiornata || 'data non registrata')]),
        nodo(doc, 'h2', '', t.titolo),
        nodo(doc, 'div', 'td-prose', t.contenuto),
      ];
      if (m?.origine) pezzi.push(nodo(doc, 'h3', '', 'Origine'), nodo(doc, 'p', 'td-subtle', String(m.origine)));
      return pezzi;
    },
    azioniDettaglio: (m, { doc }) => [
      bottone(doc, 'Copia', {
        esegui: async () => {
          const t = testiMemoria(m);
          try { await navigator.clipboard.writeText(`${t.titolo}\n\n${t.contenuto}`); avvisa('Copiato', `«${t.titolo}» è negli appunti.`); }
          catch { avvisa('Copia non riuscita', 'Il browser non ha dato accesso agli appunti.'); }
        },
      }),
    ],
    notaPiede: () => 'La lettura non modifica il ricordo',
    vuoto: { titolo: 'Nessun ricordo', testo: 'I ricordi sono globali, disponibili alle tue conversazioni. Compariranno qui appena TALOS ne salva uno.' },
  });
}

/* -------------------------------------------------------------------------------- ATTIVITA' */

export function aggiornaPaginaAttivita(schermo, attivita, opzioni = {}) {
  return montaSezione(schermo, {
    chiave: 'attivita',
    nome: 'Attività',
    icona: 'check-sq',
    famiglia: 'td-task',
    sostantivo: 'attività',
    voci: Array.isArray(attivita) ? attivita : [],
    stato: { errore: opzioni.errore || null, caricamento: Boolean(opzioni.caricamento) },
    caricando: 'Caricamento attività…',
    onAggiorna: opzioni.onAggiorna,
    filtri: [
      { id: 'tutte', etichetta: 'Tutte' },
      { id: 'todo', etichetta: 'Da fare', quando: (a) => a?.stato === 'todo' },
      { id: 'doing', etichetta: 'In corso', quando: (a) => a?.stato === 'doing' },
      { id: 'done', etichetta: 'Fatte', quando: (a) => a?.stato === 'done' },
    ],
    idDi: (a) => a?.id,
    titoloDi: (a) => testiAttivita(a).titolo,
    quandoDi: (a) => a?.aggiornataAlle ?? null,
    cercaIn: (a) => `${testiAttivita(a).titolo} ${testiAttivita(a).descrizione} ${statoAttivita(a?.stato).testo}`,
    sommarioBarra: (n, { errore, caricamento }) => (errore ? 'Attività non disponibili' : caricamento ? 'Caricamento attività…' : riepilogoAttivita(Array.isArray(attivita) ? attivita : [])),
    scheda: (a, { doc, icona, etichetta }) => {
      const s = statoAttivita(a?.stato);
      const t = testiAttivita(a);
      /*
       * ⛔ Il mockup mette qui una CASELLA che spunta l'attività (`td-task-toggle`, `role=checkbox`).
       *   Sul server `/tasks` è solo GET: una casella premibile prometterebbe una scrittura che non
       *   esiste. Resta il SEGNO — stesso disegno, nessun ruolo interattivo, `aria-hidden` perché lo
       *   stato lo dice già l'etichetta accanto al titolo.
       */
      const segno = nodo(doc, 'span', 'td-task-toggle');
      segno.dataset.fatta = String(a?.stato === 'done');
      segno.setAttribute('aria-hidden', 'true');
      if (a?.stato === 'done') segno.append(icona('check'));
      return {
        dati: { done: String(a?.stato === 'done') },
        alto: [etichetta(s.testo, s.tono || ''), ...(a?.priorita === 'high' ? [nodo(doc, 'span', 'td-priority', 'Alta priorità')] : [])],
        corpo: [nodo(doc, 'p', 'td-excerpt', anteprima(t.descrizione, 130) || 'Nessuna descrizione.')],
        basso: [
          nodo(doc, 'span', '', prioritaAttivita(a?.priorita)),
          nodo(doc, 'span', '', dataBreve(a?.aggiornataAlle) || 'Data non registrata'),
        ],
        adorno: segno,
      };
    },
    dettaglio: (a, { doc, etichetta }) => {
      const s = statoAttivita(a?.stato);
      const t = testiAttivita(a);
      return [
        meta(doc, [etichetta(s.testo, s.tono || ''), nodo(doc, 'span', '', prioritaAttivita(a?.priorita)), nodo(doc, 'span', '', t.aggiornata || 'data non registrata')]),
        nodo(doc, 'h2', '', t.titolo),
        nodo(doc, 'div', 'td-prose', t.descrizione || 'Nessuna descrizione.'),
      ];
    },
    notaPiede: () => 'La lettura non modifica lo stato',
    vuoto: { titolo: 'Nessuna attività', testo: 'Le attività sono globali, disponibili alle tue conversazioni. Vivono in .tasks-store/.' },
  });
}

/* --------------------------------------------------------------------------------- LIBRERIA */

export function aggiornaPaginaLibreria(schermo, voci, opzioni = {}) {
  const avvisa = notificatore(opzioni);
  const sessionId = opzioni.sessionId || '';
  const servizioVero = opzioni.azioni || azioniLibreria({ sessionId });
  /*
   * ⛔ LOTTO E, l'annullamento del mockup su un'azione VERA.
   *   La rinomina è l'unica scrittura reversibile che il server offre: si rinomina di nuovo col
   *   nome di prima. Quindi, invece di una conferma davanti, un toast dietro con «Annulla» —
   *   NN/g e Joel Pascual, 11/09/2026. L'eliminazione resta con la sua conferma, perché il
   *   server cancella il file davvero e non c'è nessun cestino.
   *   Il punto d'innesto è l'iniezione `azioni` che `creaLibraryRow` già accetta: non una riga
   *   nuova dentro la riga della Libreria, che non è mia da riscrivere.
   */
  const servizio = servizioVero && {
    ...servizioVero,
    rinomina: async (id, nome) => {
      const prima = (Array.isArray(voci) ? voci : []).find((v) => v?.id === id);
      const nomeVecchio = testiVoceLibreria(prima).nome;
      const esito = await servizioVero.rinomina(id, nome);
      if (esito?.ok && nomeVecchio && nomeVecchio !== nome) {
        avvisa('Rinominato', `«${nomeVecchio}» adesso si chiama «${nome}».`, azioneAnnulla(async () => {
          const indietro = await servizioVero.rinomina(id, nomeVecchio);
          if (indietro?.ok) opzioni.onCambiata?.();
        }));
      }
      return esito;
    },
  };
  return montaSezione(schermo, {
    chiave: 'libreria',
    nome: 'Libreria',
    icona: 'files',
    famiglia: 'td-document',
    sostantivo: 'file',
    voci: Array.isArray(voci) ? voci : [],
    stato: { errore: opzioni.errore || null, caricamento: Boolean(opzioni.caricamento) },
    caricando: 'Caricamento Libreria…',
    onAggiorna: opzioni.onAggiorna,
    filtri: [
      { id: 'tutte', etichetta: 'Tutti' },
      { id: 'uploaded', etichetta: 'Caricati', quando: (v) => v?.origine === 'uploaded' },
      { id: 'generated', etichetta: 'Generati', quando: (v) => v?.origine === 'generated' },
    ],
    idDi: (v) => v?.id,
    titoloDi: (v) => testiVoceLibreria(v).nome,
    quandoDi: (v) => v?.aggiornatoIl ?? null,
    cercaIn: (v) => `${testiVoceLibreria(v).nome} ${tipoVoceLibreria(v?.fileType).testo} ${origineVoceLibreria(v?.origine)}`,
    sommarioBarra: (n, { errore, caricamento }) => (errore ? 'Libreria non disponibile' : caricamento ? 'Caricamento Libreria…' : `${plurale(n, 'file')} · Token non disponibili`),
    scheda: (v, { doc, icona, etichetta }) => {
      const tipo = tipoVoceLibreria(v?.fileType);
      const t = testiVoceLibreria(v);
      const copertina = nodo(doc, 'div', 'td-file-preview');
      copertina.dataset.kind = estensioneFile(t.nome).toLowerCase();
      copertina.append(nodo(doc, 'strong', '', estensioneFile(t.nome)), nodo(doc, 'span', '', t.nome));
      return {
        alto: [icona(tipo.icona), nodo(doc, 'span', '', tipo.testo), etichetta(origineVoceLibreria(v?.origine), v?.origine === 'generated' ? 'accent' : '')],
        corpo: [copertina],
        basso: [nodo(doc, 'span', '', t.dataBreve)],
      };
    },
    dettaglio: (v, { doc, etichetta }) => {
      const t = testiVoceLibreria(v);
      const tipo = tipoVoceLibreria(v?.fileType);
      const pezzi = [
        meta(doc, [etichetta(tipo.testo), etichetta(origineVoceLibreria(v?.origine), v?.origine === 'generated' ? 'accent' : ''), nodo(doc, 'span', '', t.aggiornata ? `Aggiornato il ${t.aggiornata}` : 'Data non registrata')]),
        nodo(doc, 'h2', '', t.nome),
        nodo(doc, 'h3', '', 'Azioni sul file'),
      ];
      /*
       * ⛔ QUI NON SI RIFA' NIENTE. La riga della Libreria del 10/09 ha cinque azioni dietro un
       *   menu «…» (più il tasto destro), la rinomina in linea, la conferma d'eliminazione con la
       *   conseguenza scritta e il messaggio d'esito che resta sotto il nome. Rifarla nel dettaglio
       *   vorrebbe dire tenere allineate due copie e, il primo giorno che si sbaglia, scendere
       *   sotto la UI di ieri. Quindi il dettaglio OSPITA la riga vera.
       */
      const ospite = nodo(doc, 'div', 'td-riuso-riga');
      const riga = creaLibraryRow(v, {
        document: doc,
        aperta: true,
        sessionId,
        azioni: servizio,
        onCambiata: opzioni.onCambiata,
        onMenu: opzioni.onMenu,
      });
      /*
       * ⛔ VISTO NELLA FOTO: nel riquadro «Azioni sul file» si vedeva solo un riquadro vuoto. Il
       *   bottone c'era — è il «…» della riga — ma in una lista è affiancato al nome che lo spiega,
       *   e qui il nome è nascosto perché il dettaglio lo ha già scritto in grande. Un'icona sola
       *   dentro un riquadro vuoto non dice niente: qui prende la sua parola. Il nome accessibile
       *   («Azioni su <file>») resta quello che la riga ha già messo nell'`aria-label`.
       */
      riga.querySelector('[data-azione="menu"]')?.prepend(doc.createTextNode('Tutte le azioni'));
      ospite.append(riga);
      pezzi.push(ospite);
      const dove = indirizzoFileLibreria(sessionId, v?.id);
      if (dove) pezzi.push(nodo(doc, 'p', 'td-subtle', 'Il file vive in .harness-ui-library/, dentro il progetto.'));
      return pezzi;
    },
    vuoto: { titolo: 'Nessun file', testo: 'I file caricati o generati dall’agente compaiono qui. Vivono in .harness-ui-library/, dentro il progetto.' },
  });
}

/* ---------------------------------------------------------------------------------- RICERCA */

/**
 * Cosa vuol dire quello stato, in una riga. ⛔ Non è un dato del server: è la SPIEGAZIONE dello
 * stato che il server manda, scritta una volta sola e qui — non un contenuto inventato come nel
 * mockup, che nella scheda mostra una sintesi e delle «fonti illustrate» che non esistono.
 */
const FRASI_RICERCA = new Map([
  ['running', 'Il rapporto si sta scrivendo.'],
  ['paused', 'Ferma: riparte da dove si era interrotta.'],
  /* 11/09 sera (disegno BC-21): il rapporto NON sta in `.harness-ui-research/` — lì c'è solo la scheda
     della ricerca; il testo è una voce di Libreria (`reportLibraryId`, `research-orchestrator.mjs:132`).
     E «done» oggi non prova che ci sia un rapporto vero: la ricerca di stasera è «done» con 290 byte
     di scusa del modello. La frase dice il posto giusto e non promette più di quanto il server sappia. */
  ['done', 'Conclusa: il rapporto, se è stato scritto, sta in Libreria.'],
  ['cancelled', 'Interrotta prima di arrivare a un rapporto.'],
  ['failed', 'Non è arrivata a un rapporto.'],
]);

export function aggiornaPaginaRicerca(schermo, ricerche, opzioni = {}) {
  return montaSezione(schermo, {
    chiave: 'ricerca',
    nome: 'Ricerca',
    icona: 'globe',
    famiglia: 'td-research',
    /* ⛔ La parola è UNA: la barra in alto dice «5 ricerche elencate» (`riepilogoRicerche`), quindi
       la riga di stato non può dire «5 rapporti». Il rapporto è ciò che una ricerca PRODUCE. */
    sostantivo: 'ricerca',
    pluraleEsplicito: 'ricerche',
    voci: Array.isArray(ricerche) ? ricerche : [],
    stato: { errore: opzioni.errore || null, caricamento: Boolean(opzioni.caricamento) },
    caricando: 'Caricamento ricerche…',
    onAggiorna: opzioni.onAggiorna,
    filtri: [
      { id: 'tutte', etichetta: 'Tutte' },
      { id: 'running', etichetta: 'In corso', quando: (r) => r?.stato === 'running' },
      { id: 'paused', etichetta: 'In pausa', quando: (r) => r?.stato === 'paused' },
      { id: 'done', etichetta: 'Concluse', quando: (r) => r?.stato === 'done' },
      { id: 'cancelled', etichetta: 'Annullate', quando: (r) => r?.stato === 'cancelled' },
      { id: 'failed', etichetta: 'Non riuscite', quando: (r) => r?.stato === 'failed' },
    ],
    idDi: (r) => r?.id,
    titoloDi: (r) => testiRicerca(r).titolo,
    quandoDi: (r) => r?.avviataAlle ?? null,
    cercaIn: (r) => `${testiRicerca(r).titolo} ${statoRicerca(r?.stato).testo}`,
    sommarioBarra: (n, { errore, caricamento }) => (errore ? 'Ricerche non disponibili' : caricamento ? 'Caricamento ricerche…' : riepilogoRicerche(Array.isArray(ricerche) ? ricerche : [])),
    scheda: (r, { doc, icona, etichetta }) => {
      const s = statoRicerca(r?.stato);
      return {
        alto: [icona('globe'), nodo(doc, 'span', '', 'Dossier'), etichetta(s.testo, s.tono)],
        corpo: [nodo(doc, 'p', 'td-excerpt', FRASI_RICERCA.get(r?.stato) || 'Stato non registrato: il server non dice a che punto è.')],
        basso: [nodo(doc, 'span', '', testiRicerca(r).avviata ? `Avviata il ${testiRicerca(r).avviata}` : 'Data non registrata')],
      };
    },
    dettaglio: (r, { doc, etichetta }) => {
      const s = statoRicerca(r?.stato);
      const t = testiRicerca(r);
      return [
        meta(doc, [etichetta(s.testo, s.tono), nodo(doc, 'span', '', t.avviata || 'data non registrata')]),
        nodo(doc, 'h2', '', t.titolo),
        /* ⛔ Il mockup mostra qui piano, rapporto e «fonti illustrate»: sono dati suoi, inventati.
           La rotta vera manda i soli metadati, e lo stato «Conclusa» non certifica le fonti. Si
           dice cosa manca invece di riempire lo spazio. */
        nodo(doc, 'p', 'td-prose', 'Di questa ricerca il server manda per ora soltanto titolo, stato e data di avvio. Il rapporto, quando c’è, è una voce della Libreria; le fonti restano nella conversazione della ricerca. Da qui non si consultano ancora.'),
        nodo(doc, 'p', 'td-subtle', 'Lo stato «Conclusa» non certifica le fonti del rapporto.'),
      ];
    },
    vuoto: { titolo: 'Nessuna ricerca', testo: 'Le ricerche approfondite di questo progetto compaiono qui, fino a venti fra le più recenti.' },
  });
}

/* --------------------------------------------------------------------------------- PROGETTI */

export function montaProgetti(schermo, progetti, opzioni = {}) {
  const { onApriSessione = null, quanteRecenti = 3 } = opzioni;
  return montaSezione(schermo, {
    chiave: 'progetti',
    nome: 'Progetti',
    icona: 'folder',
    famiglia: 'td-project',
    sostantivo: 'progetto',
    pluraleEsplicito: 'progetti',
    voci: Array.isArray(progetti) ? progetti : [],
    stato: { errore: opzioni.errore || null, caricamento: Boolean(opzioni.caricamento) },
    caricando: 'Leggo i progetti…',
    onAggiorna: opzioni.onAggiorna,
    filtri: [{ id: 'tutti', etichetta: 'Tutti' }],
    idDi: (p) => p?.id,
    titoloDi: (p) => p?.nome ?? '',
    // `ultimaAlle` è già un numero di millisecondi (progetti.js, `quandoUltima`): niente da convertire.
    quandoDi: (p) => (Number.isFinite(p?.ultimaAlle) && p.ultimaAlle > 0 ? new Date(p.ultimaAlle) : null),
    cercaIn: (p) => `${p?.nome ?? ''} ${(p?.sessioni || []).map((s) => s?.nome ?? '').join(' ')}`,
    sommarioBarra: (n, { errore, caricamento }) => (errore ? 'Progetti non disponibili' : caricamento ? 'Leggo i progetti…' : sommarioProgetti(n)),
    scheda: (p, { doc, icona }) => {
      const chips = nodo(doc, 'div', 'td-source-chips');
      for (const s of ultimeSessioni(p, quanteRecenti)) chips.append(nodo(doc, 'span', '', s?.nome || s?.sessionId || 'sessione senza nome'));
      return {
        alto: [icona('folder'), nodo(doc, 'span', '', 'Cartella di lavoro')],
        corpo: [nodo(doc, 'p', 'td-excerpt', frasiProgetto(p)), chips],
        /* Il conteggio sta già nel corpo (`frasiProgetto`): qui va il QUANDO, che è l'altra metà. */
        basso: [nodo(doc, 'span', '', p?.ultimaAlle ? `Ultima volta ${new Date(p.ultimaAlle).toLocaleDateString('it-IT')}` : 'mai aperta')],
      };
    },
    dettaglio: (p, { doc, etichetta }) => {
      const pezzi = [
        meta(doc, [etichetta('Progetto'), nodo(doc, 'span', '', frasiProgetto(p))]),
        nodo(doc, 'h2', '', p?.nome ?? ''),
        nodo(doc, 'h3', '', 'Sessioni recenti'),
      ];
      const recenti = ultimeSessioni(p, quanteRecenti);
      if (!recenti.length) pezzi.push(nodo(doc, 'p', 'td-subtle', 'Nessuna sessione ancora in questo progetto.'));
      for (const s of recenti) {
        const riga = nodo(doc, 'div', 'td-source');
        const apri = bottone(doc, s?.nome || s?.sessionId || 'Sessione senza nome', { variante: 'ghost', esegui: () => onApriSessione?.(s) });
        riga.append(apri);
        if (s?.avviataAlle) riga.append(nodo(doc, 'span', '', `Avviata il ${new Date(s.avviataAlle).toLocaleString('it-IT')}`));
        pezzi.push(riga);
      }
      return pezzi;
    },
    vuoto: { titolo: 'Nessun progetto', testo: 'Un progetto nasce quando apri una sessione su una cartella. Comparirà qui.' },
  });
}
