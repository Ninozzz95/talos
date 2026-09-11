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
 *   · `ricerca.js` → `riepilogoRicerche` (dall'11/09 le parole degli stati e il dettaglio a cinque
 *     viste stanno in `ricerca-dettaglio.js`: la riga del foglio laterale resta dov'era);
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
import { magazzinoFileLibreria, montaAnteprimaFile, lettoreFileLibreria } from './libreria-anteprima.js';
import { riepilogoRicerche } from './ricerca.js';
/* 11/09 lotto L7 — la Ricerca approfondita ha un dentro: parole degli stati, bilancio, cinque
   viste, menu e esportazioni vivono in un file loro, come `libreria.js` per la Libreria. */
import {
  frasiVoce, frasiBilancio, bilancioDaRecord, magazzinoRicerche, articoloData,
  montaDettaglioRicerca, vociMenuRicerca, collegaTastoDestro, scaricaTesto, haRapportoLeggibile,
} from './ricerca-dettaglio.js';
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
  /*
   * ⛔⛔ 11/09/2026 — IL DETTAGLIO NON MOSTRAVA IL FILE. Foto dell'owner sul 4174: nome, tre
   *   metadati, «Azioni sul file» e un riquadro. Del file, niente. Owner: «il file non viene
   *   visualizzato come nel mockup, sia renderizzato che in versione testuale».
   *   Il mockup lo fa in due punti (riga 6078, il `<pre>` del dettaglio; riga 6309 `fileCover`, la
   *   resa per tipo): qui i due modi stanno su un interruttore, e il come sta in
   *   `libreria-anteprima.js`. Qui resta la sola COLLA fra i dati e l'impianto, come per le altre.
   */
  const magazzinoFile = magazzinoFileLibreria(schermo);
  const ridisegna = () => aggiornaPaginaLibreria(schermo, voci, opzioni);
  const leggiFile = typeof opzioni.leggiFile === 'function' ? opzioni.leggiFile : lettoreFileLibreria(sessionId);
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
  /*
   * ⛔ «Apri» è la rotta POST `/library/:voceId/apri` del 10/09, la stessa del menu «⋯»: il
   *   pannello del contenuto non ne inventa una seconda. E se il server dice di no, l'esito si
   *   VEDE — un bottone che sembra aver funzionato è peggio di uno che dice perché non ha.
   */
  async function apriConSistema(v) {
    const esito = await servizioVero.apri(v?.id);
    if (!esito?.ok) avvisa('Non aperto', esito?.motivo || 'Il server non ha risposto.', { tono: 'errore' });
  }
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
      ];
      /*
       * ⛔ IL CONTENUTO STA SOPRA LE AZIONI. Una persona apre un file per LEGGERLO: le cinque cose
       *   che gli si possono fare vengono dopo aver visto che cos'è. (Nel mockup le azioni stanno
       *   addirittura nel piede del pannello, sotto tutto — riga 6083.)
       */
      pezzi.push(...montaAnteprimaFile(v, {
        doc,
        magazzino: magazzinoFile,
        ridisegna,
        opzioni: {
          leggiFile,
          rendiMarkdown: opzioni.rendiMarkdown,
          onApri: servizioVero?.apri ? apriConSistema : undefined,
        },
      }));
      pezzi.push(nodo(doc, 'h3', '', 'Azioni sul file'));
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

/*
 * ⛔⛔ 11/09/2026, lotto L7 — LA SEZIONE AVEVA UN ELENCO E NESSUN DENTRO.
 *
 *   Fino a stasera qui c'erano due frasi false e una promessa vuota:
 *     · «Il rapporto è stato scritto in .harness-ui-research/» — in quella cartella c'è SOLO la
 *       scheda della ricerca; il testo è una voce di Libreria (`research-orchestrator.mjs:132`);
 *     · «Da qui non si consultano ancora» — e infatti il dettaglio mostrava tre metadati;
 *     · «Conclusa» su una ricerca che non aveva prodotto nessun rapporto.
 *   Il guasto completo, con la catena dei cinque difetti che lo produce, sta in
 *   `.claude/DISEGNO-RICERCA-APPROFONDITA-2026-09-11.md` §1-§2.
 *
 * ⛔ Adesso la rotta manda ANCHE `reportLibraryId`, `motivo`, `conclusaAlle`, `padreId`, `nome` e
 *   `ultimoMessaggio`, e gli stati sono otto invece di cinque. Le parole, i verdetti, il bilancio
 *   e le esportazioni vivono in `ricerca-dettaglio.js`: qui resta la sola COLLA fra i dati e
 *   l'impianto elenco+dettaglio, come per le altre cinque sezioni.
 *
 * ⛔ Il ripiego su `titolo` resta: una sezione che legge un solo nome mostrerebbe «Ricerca senza
 *   domanda» su tutto l'archivio il giorno in cui la rotta cambia parola.
 */

/** Copia negli appunti: quella della app quando c'è, altrimenti quella del browser. */
function copiatore(opzioni) {
  if (typeof opzioni?.copia === 'function') return opzioni.copia;
  return (testo) => globalThis.navigator?.clipboard?.writeText?.(testo);
}

export function aggiornaPaginaRicerca(schermo, ricerche, opzioni = {}) {
  const elenco = Array.isArray(ricerche) ? ricerche : [];
  const magazzino = magazzinoRicerche(schermo);
  const avvisa = notificatore(opzioni);
  const copia = copiatore(opzioni);
  const ridisegna = () => aggiornaPaginaRicerca(schermo, ricerche, opzioni);
  const trovaVoce = (id) => elenco.find((r) => String(r?.id) === String(id)) || null;
  /*
   * ⛔ Il rapporto si legge dalla rotta che ESISTE GIÀ: `GET /library/:voceId/file` (la stessa che
   *   scarica un file della Libreria, `http-app.mjs:2023`). Quindi al chiamante basta passare
   *   `sessionId` — nessuna rotta nuova, nessun secondo modo di leggere lo stesso file.
   *   Chi vuole leggerlo in un altro modo (un test, il laboratorio) passa `leggiRapporto` e vince.
   * ⛔ Se non arriva né l'uno né l'altro NON si finge un'attesa: il dettaglio lo dice.
   */
  const leggiRapporto = typeof opzioni.leggiRapporto === 'function' ? opzioni.leggiRapporto
    : (opzioni.sessionId ? async (voce) => {
      const indirizzo = indirizzoFileLibreria(opzioni.sessionId, voce?.reportLibraryId);
      if (!indirizzo) throw new Error('questa ricerca non ha un rapporto in Libreria');
      const risposta = await fetch(indirizzo);
      if (!risposta.ok) throw new Error(`il file non si apre (${risposta.status})`);
      return risposta.text();
    } : null);

  function letturaDi(voce) {
    const chiave = String(voce?.reportLibraryId ?? '');
    return chiave ? magazzino.rapporti.get(chiave) || null : null;
  }

  function apriMenu(voce, dove) {
    const voci = vociMenuRicerca(voce, {
      lettura: letturaDi(voce),
      onApriSessione: opzioni.onApriSessione,
      onCopia: (prosa, quale) => {
        /* ⛔ Anche il messaggio d'esito diceva «rapporto» su un file che rapporto non è: la parola
           si decide in un posto solo, e questo è uno dei quattro posti dov'era sbagliata. */
        Promise.resolve(copia(prosa)).then(
          () => avvisa('Copiato', haRapportoLeggibile(quale ?? voce) ? 'Il testo del rapporto è negli appunti.' : 'Il testo del file depositato è negli appunti.'),
          () => avvisa('Non copiato', 'Gli appunti non sono disponibili in questa finestra.', { tono: 'errore' }),
        );
      },
      onEsporta: (nome, testo, mime) => {
        scaricaTesto(schermo.ownerDocument || globalThis.document, nome, testo, mime);
        avvisa('Esportato', `${nome} è nella cartella dei download.`);
      },
    });
    /* ⛔ Il menu lo disegna `legacy/app.js` (`apriMenuAzioniLibreria`), lo stesso dell'albero dei
       file e della Libreria: qui si sa QUALI azioni ha una ricerca, non come si apre un menu.
       Senza iniezione non compare un secondo menu: il pulsante resta, e non fa niente di sbagliato. */
    if (typeof opzioni.onMenu === 'function' && voci.length) opzioni.onMenu(voci, dove);
  }

  collegaTastoDestro(schermo, { trovaVoce, apriMenu });

  /*
   * ⛔ LA FRASE FALSA DELL'INTRO, tolta da qui perché il suo file non è di questa lane.
   *   `index.template.html:1058` (e la sua copia in `public/`) dice ancora «I rapporti vivono in
   *   .harness-ui-research/»: è falsa (lì c'è solo la scheda) e la sezione la MOSTRA, perché
   *   `montaSezione` sposta il paragrafo del prodotto dentro `.td-intro`. Il diff per il file vero
   *   sta nel rapporto del lotto; finché non è applicato, la frase si corregge qui — dove la si
   *   vede — invece di lasciarla a schermo un giorno in più.
   */
  const spiegazioneVera = 'Ogni ricerca approfondita di questo progetto, col suo rapporto, le affermazioni verificate e le fonti da cui vengono.';
  for (const p of schermo.querySelectorAll('.talos-page__head p, .td-intro p')) {
    if (p.getAttribute('role') === 'status' || p.hasAttribute('data-research-esito')) continue;
    if (p.textContent.includes('.harness-ui-research') || p.textContent.includes('non è ancora disponibile')) p.textContent = spiegazioneVera;
  }

  return montaSezione(schermo, {
    chiave: 'ricerca',
    nome: 'Ricerca',
    icona: 'globe',
    famiglia: 'td-research',
    /* ⛔ La parola è UNA: la barra in alto dice «5 ricerche elencate» (`riepilogoRicerche`), quindi
       la riga di stato non può dire «5 rapporti». Il rapporto è ciò che una ricerca PRODUCE. */
    sostantivo: 'ricerca',
    pluraleEsplicito: 'ricerche',
    voci: elenco,
    stato: { errore: opzioni.errore || null, caricamento: Boolean(opzioni.caricamento) },
    caricando: 'Caricamento ricerche…',
    onAggiorna: opzioni.onAggiorna,
    /*
     * ⛔ QUATTRO filtri e non otto. Gli stati sono otto, ma un filtro per ognuno darebbe una riga
     *   di bottoni che nessuno legge, e quattro di essi direbbero sempre zero. Le domande che una
     *   persona si fa davvero sono: cosa sta lavorando, cosa ha prodotto un rapporto, cosa no.
     *   ⛔⛔ CORRETTO L'11/09 SULLA FOTO DEL 4174. Qui c'era scritto «"Col rapporto" guarda il
     *   RAPPORTO, non lo stato», e guardava `reportLibraryId`: sulla ricerca `d2a453a8` i filtri
     *   dicevano «Col rapporto 1 · Senza rapporto 0» mentre il timbro della scheda diceva «Senza
     *   rapporto». La distinzione del cancello di consegna NON è «c'è un file in Libreria»: è
     *   proprio lo STATO — se il cancello avesse accettato quel file la ricerca sarebbe `done`.
     *   La regola sta in `haRapportoLeggibile`, una funzione sola per filtro, piede e pannello.
     */
    filtri: [
      { id: 'tutte', etichetta: 'Tutte' },
      { id: 'vive', etichetta: 'In corso', quando: (r) => r?.stato === 'running' || r?.stato === 'paused' },
      { id: 'con-rapporto', etichetta: 'Col rapporto', quando: (r) => haRapportoLeggibile(r) },
      { id: 'senza-rapporto', etichetta: 'Senza rapporto', quando: (r) => !haRapportoLeggibile(r) && r?.stato !== 'running' && r?.stato !== 'paused' },
    ],
    idDi: (r) => r?.id,
    titoloDi: (r) => frasiVoce(r).domanda,
    /* Una ricerca finita si ordina per quando è FINITA; una viva non è ancora finita e vale l'avvio. */
    quandoDi: (r) => r?.conclusaAlle ?? r?.avviataAlle ?? null,
    cercaIn: (r) => {
      const f = frasiVoce(r);
      return `${f.domanda} ${f.parola} ${f.nome || ''}`;
    },
    sommarioBarra: (n, { errore, caricamento }) => (errore ? 'Ricerche non disponibili' : caricamento ? 'Caricamento ricerche…' : riepilogoRicerche(elenco)),
    scheda: (r, { doc, icona, etichetta }) => {
      const f = frasiVoce(r);
      const lettura = letturaDi(r);
      /*
       * ⛔ La scheda guida col BILANCIO quando lo sappiamo, col PERCHÉ quando non c'è un rapporto —
       *   mai col numero delle fonti (§6.7: una risposta sembra buona anche quando le prove non ci
       *   sono). Il bilancio si sa solo dopo aver letto quel rapporto: la rotta manda l'elenco, non
       *   i bilanci, e leggere venti file all'apertura della sezione sarebbe venti richieste per
       *   una riga di testo. ⇒ finché non l'hai aperta, la scheda dice la frase dello stato.
       */
      const riga = lettura?.stato === 'pronto' && lettura.record
        ? frasiBilancio(bilancioDaRecord(lettura.record))
        : f.spiegazione;
      return {
        alto: [icona('globe'), etichetta(f.parola, f.tono)],
        corpo: [nodo(doc, 'p', 'td-excerpt', riga)],
        /*
         * ⛔ TROVATO NELLA FOTO: «Avviata il 11/09/20…» e «Rapporto disponibi…», tutti e due
         *   troncati. `.td-card-bottom span` taglia con i puntini, e in 250 px di scheda due frasi
         *   lunghe non ci stanno. ⇒ a destra si scrive solo quando AGGIUNGE qualcosa: su una
         *   conclusa col rapporto lo dice già il timbro, mentre «Conclusa senza rapporto» è
         *   un'anomalia che deve saltare all'occhio, e un rapporto su una ricerca non conclusa è
         *   una cosa che chi guarda vuole sapere.
         */
        basso: [
          nodo(doc, 'span', '', f.avviata ? `Avviata ${articoloData(r?.avviataAlle)}${dataBreve(r?.avviataAlle)}` : 'Data non registrata'),
          /* ⛔ CORRETTO L'11/09: qui «Col rapporto» compariva su ogni ricerca NON conclusa che
             avesse un file in Libreria — cioè contraddiceva il timbro «Senza rapporto» due
             centimetri più in alto. Adesso a destra si scrive solo l'anomalia che il timbro non
             dice già: una conclusa che il rapporto non ce l'ha. */
          nodo(doc, 'span', '', r?.stato === 'done' && !f.haRapporto ? 'Nessun rapporto' : ''),
        ],
        adorno: (() => {
          /* ⛔ Un solo bottone, non cinque affiancati (owner 10/09): le azioni stanno nel menu, e
             il tasto destro sulla scheda apre lo stesso elenco. */
          const b = nodo(doc, 'button', 'td-card-azioni');
          b.type = 'button';
          b.setAttribute('aria-haspopup', 'menu');
          b.setAttribute('aria-label', `Azioni su ${f.domanda}`);
          const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
          const use = doc.createElementNS('http://www.w3.org/2000/svg', 'use');
          svg.setAttribute('class', 'i');
          svg.setAttribute('aria-hidden', 'true');
          use.setAttribute('href', '#i-more');
          svg.append(use);
          b.append(svg);
          b.addEventListener('click', (e) => { e.stopPropagation(); apriMenu(r, { ancoraEl: b }); });
          return b;
        })(),
      };
    },
    dettaglio: (r, { doc }) => montaDettaglioRicerca(r, {
      doc,
      magazzino,
      ridisegna,
      apriMenu,
      opzioni: {
        leggiRapporto,
        onApriSessione: opzioni.onApriSessione,
        rendiMarkdown: opzioni.rendiMarkdown,
      },
    }),
    vuoto: {
      titolo: 'Nessuna ricerca',
      testo: 'Chiedi in chat di avviare una ricerca approfondita: comparirà qui mentre lavora, e ci resterà col suo rapporto.',
    },
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
