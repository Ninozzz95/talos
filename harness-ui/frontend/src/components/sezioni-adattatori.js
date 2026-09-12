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
 * ⛔⛔ 12/09/2026 — QUI C'ERA SCRITTO «COSA NON C'E', E PERCHE' NON PUO' ESSERCI», e la ragione
 *   NON VALE PIU'. Diceva: «sul server vero `notes`, `memory`, `tasks` espongono SOLO GET
 *   (http-app.mjs, righe 762 e 840): un pulsante Modifica o una casella da spuntare sarebbe una
 *   promessa che nessuna rotta può mantenere — la lezione ‹APERTA› non è ‹FATTA›». Era vero
 *   quel giorno; la notte stessa il lotto di backend ha aperto le sette rotte che mancavano
 *   (`.claude/RAPPORTO-CRUD-BACKEND-2026-09-11.md` §3, commit `c6ddfbdc`): `POST`, `GET`, `PATCH`,
 *   `DELETE` per voce e `POST …/tasks/:id/stato`.
 *   ⇒ La premessa era vera quando è stata scritta e oggi è falsa: si riapre, e si scrive perché.
 *   Note, Attività e Memoria hanno il CRUD completo (ordine dell'owner dell'11/09, «non
 *   negotiable»).
 *
 * ⛔⛔ 12/09/2026, SECONDA VOLTA NELLO STESSO GIORNO: qui sotto c'era scritto «Ricerca e Progetti
 *   no, perché per loro quelle rotte non esistono ancora», e per la **Ricerca** non vale più —
 *   il lotto L5 ha aperto `GET`/`DELETE` sulla voce e `POST` su pausa, ripresa e ri-verifica
 *   (`.claude/RAPPORTO-RICERCA-L5-2026-09-12.md` §3), approvate dall'owner. Una premessa vera
 *   quando è stata scritta e falsa oggi si riapre e si scrive perché — è successo due volte in
 *   dodici ore, ed è il segno che una frase «non può esistere» va datata, mai lasciata sospesa.
 *   **Progetti** resta di sola lettura: per quello le rotte non ci sono davvero.
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
  /* 12/09 lotto L5 — le azioni di scrittura: quando esistono, come si chiamano le rotte, come si
     dice a una persona che il server ha detto di no, e l'orologio delle ricerche vive. */
  paroleErroreRicerca, governoRicercheVive, frasiRiverifica,
  /* 12/09 L5-bis — la suite di esportazioni: le nove uscite, la loro disponibilità, il pannello. */
  esportazioniRicerca, montaPannelloEsportazioni, indirizzoEsportazione,
} from './ricerca-dettaglio.js';
import { frasiProgetto, sommarioProgetti, ultimeSessioni } from './progetti.js';
import { plurale } from './plurale.js';
import { montaSezione, statoSezione, icona } from './sezione-elenco-dettaglio.js';
/* 12/09 L5 — l'eliminazione di una ricerca è irreversibile: la stessa modale di conferma che usano
   la Libreria e le tre sezioni scrivibili, mai un `confirm()` del browser né una seconda modale. */
import { apriModale, chiudiModale, confermaModale } from './modale-td.js';
import { azioneAnnulla } from './toast.js';
/* 12/09 lotto CRUD — il modulo crea/modifica, la validazione, le parole e la porta di rete stanno
   in un file loro: uno solo per Note, Attività e Memoria, come `magazziniDellaPersona` lato server. */
import {
  SCHEMI, servizioVoci, valoriIniziali, validaValori, corpoCreazione, corpoModifica,
  paroleErroreRete, parolaOrigine, parolaStato, STATI_ATTIVITA,
  costruisciModulo, montaTestoVoce, costruisciStatoAttivita, confermaEliminazione, accordo,
} from './modulo-voce.js';

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

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * LA SCRITTURA — l'impianto comune di Note, Attività e Memoria (12/09/2026)
 *
 * ⛔ LA TESTATA DI QUESTO FILE DICEVA «COSA NON C'È, E PERCHÉ NON PUÒ ESSERCI», e la sua ragione
 *   NON VALE PIÙ. Diceva: «sul server vero `notes`, `memory`, `tasks` espongono solo GET
 *   (http-app.mjs righe 762 e 840): un pulsante Modifica o una casella da spuntare qui sarebbe una
 *   promessa che nessuna rotta può mantenere». Era vero l'11/09; la notte stessa il lotto di
 *   backend (`.claude/RAPPORTO-CRUD-BACKEND-2026-09-11.md`, commit `c6ddfbdc`) ha aperto le sette
 *   rotte che mancavano — `POST`, `GET`, `PATCH`, `DELETE` per voce e `POST …/tasks/:id/stato`.
 *   ⇒ La premessa era vera quando è stata scritta e oggi è falsa: si riapre, e si scrive perché.
 *   ⛔ La casella dell'attività, che quel commento aveva ridotto a un SEGNO `aria-hidden`, torna a
 *     essere un comando vero — con il suo toast e il suo «Annulla», perché uno stato si disfa.
 *
 * ⛔ DOVE STA IL MODULO, e perché non è una modale come nel mockup. Il mockup crea dentro una
 *   modale (`newItem`, riga 6128) e modifica dentro il dettaglio (`renderDetail`, `v.editing`).
 *   Qui tutti e due stanno nel DETTAGLIO: una modale per creare e un pannello per modificare
 *   sarebbero due posti in cui scrivere la stessa cosa, con due larghezze diverse per lo stesso
 *   testo. Il brief dell'owner lo chiede esplicitamente («→ modulo nel dettaglio»).
 *
 * ⛔ COME CI STA, SENZA TOCCARE L'IMPIANTO. `sezione-elenco-dettaglio.js` apre il dettaglio solo su
 *   una voce SELEZIONATA, e non è un file di questa lane. Quindi la voce in scrittura esiste: è una
 *   BOZZA (`__bozza`) infilata nell'elenco che l'impianto riceve, e la selezione la si aggancia da
 *   fuori con `statoSezione()`, che l'impianto esporta. Nessuna riga sua cambia.
 *   ⛔ La bozza NON entra in nessun conto: ogni filtro la respinge (`quando` la esclude, compreso
 *     «Tutte») e i due sommari contano l'elenco vero. Un «4 note» con tre note sul disco sarebbe la
 *     stessa bugia dei contatori che puntavano a una pagina inesistente.
 *   ⛔ E se la persona apre un'altra scheda o chiude il dettaglio, la selezione cambia sotto il
 *     modulo: quello è il segnale che il modulo va chiuso, e la bozza si tiene da parte invece di
 *     essere buttata.
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

const BOZZA = '__nuova__';
const SCRITTURE = new WeakMap();

/** Lo stato della scrittura di UNA sezione: il modulo aperto, le voci lette per intero, i modi. */
export function magazzinoScrittura(schermo) {
  let m = SCRITTURE.get(schermo);
  if (!m) {
    m = { modulo: null, bozza: null, voci: new Map(), modi: new Map(), selezionaDopo: null, contesto: null };
    SCRITTURE.set(schermo, m);
  }
  return m;
}

/** Il testo di una voce, qualunque sia il nome del campo nella sua risorsa. */
function testoDi(schema, voce) {
  const campo = schema.campi.find((c) => c.tipo === 'testo');
  return String(voce?.[campo.nome] ?? '');
}

function bottoneMenu(doc, titolo, apri) {
  const b = nodo(doc, 'button', 'td-card-azioni');
  b.type = 'button';
  b.setAttribute('aria-haspopup', 'menu');
  b.setAttribute('aria-label', `Azioni su ${titolo}`);
  b.append(icona(doc, 'more'));
  b.addEventListener('click', (e) => { e.stopPropagation(); apri({ ancoraEl: b }); });
  return b;
}

/**
 * Tutto ciò che serve a una sezione per SCRIVERE. Le tre la chiamano allo stesso modo e ne usano
 * i pezzi dentro la loro `config`: qui non si sa niente di note, attività o ricordi — solo dello
 * schema che arriva.
 */
function scrittura(schermo, { schema, lista, opzioni, ridisegna }) {
  const doc = schermo.ownerDocument || globalThis.document;
  const m = magazzinoScrittura(schermo);
  const avvisa = notificatore(opzioni);
  const servizio = opzioni.servizio || servizioVoci({ schema, sessionId: opzioni.sessionId, rete: opzioni.rete });
  const ricarica = () => { (opzioni.onCambiata || opzioni.onAggiorna)?.(); };
  const titoloDi = (v) => String(v?.titolo ?? '').trim() || `${schema.sostantivo.charAt(0).toUpperCase()}${schema.sostantivo.slice(1)} senza titolo`;

  /* ---- la voce INTERA: l'elenco non porta formato, origine e data di nascita (backend §6) ---- */
  function letturaDi(id) { return m.voci.get(String(id ?? '')) || null; }
  function voceIntera(v) {
    const letta = letturaDi(v?.id)?.voce;
    return letta ? { ...v, ...letta } : v;
  }
  /** Una sola richiesta per voce aperta, e il pannello si ridisegna da solo quando arriva. */
  function chiediVoceIntera(v) {
    const id = String(v?.id ?? '');
    if (!id || !servizio?.leggi || m.voci.has(id)) return;
    m.voci.set(id, { stato: 'caricando' });
    Promise.resolve()
      .then(() => servizio.leggi(id))
      .then((dati) => { m.voci.set(id, { stato: 'pronto', voce: dati?.[schema.campoRisposta] || null }); })
      .catch((errore) => { m.voci.set(id, { stato: 'errore', errore: errore?.message || 'motivo non registrato' }); })
      .then(() => ridisegna());
  }

  /* ------------------------------------- il modulo ------------------------------------- */

  function apriModulo(modo, voce = null) {
    const valori = modo === 'crea'
      ? (m.bozza || valoriIniziali(schema))
      : valoriIniziali(schema, voceIntera(voce));
    m.modulo = { modo, id: modo === 'crea' ? BOZZA : String(voce?.id ?? ''), originale: modo === 'crea' ? null : voceIntera(voce), valori, errori: {}, inCorso: false, erroreRete: null, appesa: false };
    ridisegna();
  }
  function chiudiModulo({ tieniBozza = false } = {}) {
    if (m.modulo?.modo === 'crea') m.bozza = tieniBozza ? m.modulo.valori : null;
    m.modulo = null;
  }

  async function salva() {
    const mod = m.modulo;
    if (!mod || mod.inCorso) return;
    const esito = validaValori(schema, mod.valori);
    mod.errori = esito.errori;
    mod.erroreRete = null;
    /* ⛔ MDN «aria-invalid»: un campo obbligatorio vuoto non si accusa prima che qualcuno abbia
       provato a salvare. Questo è quel momento, e da qui in poi gli errori si vedono. */
    if (!esito.ok) { ridisegna(); return; }
    if (!servizio) { mod.erroreRete = 'Manca la sessione: riapri una conversazione e riprova.'; ridisegna(); return; }
    mod.inCorso = true;
    ridisegna();
    try {
      if (mod.modo === 'crea') {
        const dati = await servizio.crea(corpoCreazione(schema, mod.valori));
        const nata = dati?.[schema.campoRisposta] || null;
        m.bozza = null;
        chiudiModulo();
        m.selezionaDopo = nata?.id ? String(nata.id) : null;
        if (nata?.id) m.voci.set(String(nata.id), { stato: 'pronto', voce: nata });
        /*
         * ⛔ LA CREAZIONE DI UN RICORDO PUÒ NON CREARE NIENTE: se il titolo esiste già la risposta è
         *   200 con `duplicato:true` e la voce VECCHIA, e il testo nuovo non sovrascrive quello
         *   vecchio (contratto §4). Dirgli «Salvato» sarebbe una bugia con la ricevuta.
         */
        if (dati?.duplicato) {
          avvisa('Esiste già', `«${titoloDi(nata)}» era già fra i ricordi: ho aperto quello, e il testo che avevi scritto non l’ha sostituito.`);
        } else {
          avvisa(accordo(schema, 'Salvat'), `«${titoloDi(nata)}» è fra le voci di ${schema.chiave === 'note' ? 'Note' : schema.chiave === 'attivita' ? 'Attività' : 'Memoria'}.`, azioneAnnulla(async () => {
            try { await servizio.elimina(nata?.id); avvisa(accordo(schema, 'Annullat'), `«${titoloDi(nata)}» non è mai ${accordo(schema, 'stat')} ${accordo(schema, 'salvat')}.`); }
            catch (errore) { avvisa(`Non ${accordo(schema, 'annullat')}`, paroleErroreRete(errore?.code, schema, { azione: 'annullare' }), { tono: 'errore' }); }
            ricarica();
          }));
        }
        ricarica();
        ridisegna();
        return;
      }
      const { corpo, cambiato } = corpoModifica(schema, mod.valori, mod.originale);
      if (!cambiato) { chiudiModulo(); ridisegna(); return; } // un PATCH vuoto è un 400: qui si sa prima
      const prima = mod.originale;
      const dati = await servizio.modifica(mod.id, corpo);
      const dopo = dati?.[schema.campoRisposta] || null;
      if (dopo?.id) m.voci.set(String(dopo.id), { stato: 'pronto', voce: dopo });
      const indietro = corpoModifica(schema, valoriIniziali(schema, prima), dopo).corpo;
      chiudiModulo();
      avvisa(accordo(schema, 'Modificat'), `«${titoloDi(dopo)}» è ${accordo(schema, 'aggiornat')}.`, azioneAnnulla(async () => {
        try {
          const tornata = await servizio.modifica(mod.id, indietro);
          if (tornata?.[schema.campoRisposta]?.id) m.voci.set(String(mod.id), { stato: 'pronto', voce: tornata[schema.campoRisposta] });
          avvisa(`${accordo(schema, 'Rimess')} com’era`, `«${titoloDi(prima)}» è ${accordo(schema, 'tornat')} al testo di prima.`);
        } catch (errore) { avvisa(`Non ${accordo(schema, 'annullat')}`, paroleErroreRete(errore?.code, schema, { azione: 'annullare' }), { tono: 'errore' }); }
        ricarica();
      }));
      ricarica();
      ridisegna();
    } catch (errore) {
      mod.inCorso = false;
      mod.erroreRete = paroleErroreRete(errore?.code, schema);
      /* Una voce sparita sotto le mani non si tiene aperta: l'elenco si rilegge e il dettaglio cade. */
      if (errore?.code === schema.codiceAssente) { chiudiModulo(); ricarica(); }
      ridisegna();
    }
  }

  function nodiModulo(doc2) {
    const mod = m.modulo;
    const titolo = nodo(doc2, 'h2', '', mod.modo === 'crea' ? schema.titoloNuova : schema.titoloModifica);
    return [titolo, ...costruisciModulo(doc2, { schema, stato: mod, onSalva: salva })];
  }

  function azioniModulo(doc2) {
    const mod = m.modulo;
    const salvaBtn = bottone(doc2, mod.inCorso ? 'Salvo…' : 'Salva', { variante: 'primary', esegui: () => salva() });
    salvaBtn.disabled = Boolean(mod.inCorso);
    const annullaBtn = bottone(doc2, 'Annulla', { variante: 'ghost', esegui: () => { chiudiModulo(); ridisegna(); } });
    annullaBtn.disabled = Boolean(mod.inCorso);
    return [salvaBtn, annullaBtn];
  }

  /* ------------------------------------- le azioni ------------------------------------- */

  async function copia(v) {
    const intera = voceIntera(v);
    const testo = `${titoloDi(intera)}\n\n${testoDi(schema, intera)}`.trim();
    /* ⛔ Chi inietta `copia` ha già il SUO messaggio d'esito (`copyText` della app lo mostra da
       solo): aggiungerne un secondo darebbe due toast per un gesto solo — lo stesso difetto delle
       due verità a 170 px di distanza. Il messaggio lo scrive chi fa il lavoro. */
    if (typeof opzioni.copia === 'function') { await opzioni.copia(testo); return; }
    try {
      await globalThis.navigator?.clipboard?.writeText?.(testo);
      avvisa(accordo(schema, 'Copiat'), `«${titoloDi(intera)}» è negli appunti.`);
    } catch { avvisa(`Non ${accordo(schema, 'copiat')}`, 'Gli appunti non sono disponibili in questa finestra.', { tono: 'errore' }); }
  }

  function esporta(v) {
    const intera = voceIntera(v);
    const nome = `${titoloDi(intera).replace(/[\\/:*?"<>|]/g, '-').slice(0, 80)}.md`;
    esportaTesto(doc, nome, `# ${titoloDi(intera)}\n\n${testoDi(schema, intera)}`);
    avvisa(accordo(schema, 'Esportat'), `${nome} è nella cartella dei download.`);
  }

  function elimina(v) {
    const intera = voceIntera(v);
    confermaEliminazione({
      schema,
      voce: intera,
      titolo: titoloDi(intera),
      servizio,
      document: doc,
      avvisa,
      ricarica,
      dopo: () => m.voci.delete(String(intera.id)),
    });
  }

  /** Lo stato di un'attività: una porta sua, e un annullamento perché uno stato si disfa. */
  async function cambiaStato(v, nuovo, { conAnnulla = true } = {}) {
    const intera = voceIntera(v);
    const prima = intera?.stato;
    if (!servizio?.cambiaStato || prima === nuovo) return;
    try {
      const dati = await servizio.cambiaStato(intera.id, nuovo);
      const dopo = dati?.[schema.campoRisposta] || null;
      if (dopo?.id) m.voci.set(String(dopo.id), { stato: 'pronto', voce: dopo });
      if (conAnnulla && prima) {
        avvisa(accordo(schema, 'Aggiornat'), `«${titoloDi(intera)}»: ${parolaStato(nuovo).toLocaleLowerCase('it')}.`, azioneAnnulla(async () => {
          await cambiaStato(intera, prima, { conAnnulla: false });
          avvisa(`${accordo(schema, 'Rimess')} com’era`, `«${titoloDi(intera)}»: ${parolaStato(prima).toLocaleLowerCase('it')}.`);
        }));
      }
    } catch (errore) {
      avvisa(`Non ${accordo(schema, 'aggiornat')}`, paroleErroreRete(errore?.code, schema, { azione: 'cambiare stato' }), { tono: 'errore' });
    }
    ricarica();
    ridisegna();
  }

  /**
   * Le azioni di una voce, in UN posto solo: il menu «⋯» della scheda, il tasto destro e il
   * pulsante del dettaglio aprono questo stesso elenco.
   * ⛔ Regola dell'owner del 10/09: più di due azioni su un oggetto ⇒ menu overflow + tasto destro,
   *   mai cinque bottoni affiancati.
   */
  function vociMenu(v) {
    if (!servizio) return [];
    const intera = voceIntera(v);
    const voci = [
      { chiave: 'modifica', etichetta: 'Modifica', icona: 'i-edit', aziona: () => apriModulo('modifica', intera) },
    ];
    if (schema.risorsa === 'tasks') {
      for (const stato of STATI_ATTIVITA) {
        if (stato === intera?.stato) continue;
        voci.push({ chiave: `stato-${stato}`, etichetta: `Segna «${parolaStato(stato)}»`, icona: stato === 'done' ? 'i-check' : stato === 'doing' ? 'i-clock' : 'i-list', aziona: () => void cambiaStato(intera, stato) });
      }
    }
    voci.push({ chiave: 'copia', etichetta: 'Copia il testo', icona: 'i-copy', aziona: () => void copia(intera) });
    if (schema.risorsa === 'notes') voci.push({ chiave: 'esporta', etichetta: 'Esporta come Markdown', icona: 'i-download', aziona: () => esporta(intera) });
    voci.push({ chiave: 'elimina', etichetta: 'Elimina', icona: 'i-trash', pericolo: true, separaPrima: true, aziona: () => elimina(intera) });
    return voci;
  }

  function apriMenu(v, dove) {
    const voci = vociMenu(v);
    /* Il menu lo disegna `legacy/app.js` (`apriMenuAzioniLibreria`), lo stesso dell'albero dei file,
       della Libreria e della Ricerca: qui si sa QUALI azioni ha una voce, non come si apre un menu. */
    if (typeof opzioni.onMenu === 'function' && voci.length) opzioni.onMenu(voci, dove);
  }
  /*
   * ⛔ IL TASTO DESTRO SI LEGA UNA VOLTA SOLA, e le sue funzioni invecchiano.
   *   `collegaTastoDestro` si aggancia al PRIMO disegno e non più (ha la sua guardia `collegato`):
   *   passargli direttamente `trovaVoce` e `apriMenu` vorrebbe dire congelare l'elenco e le
   *   iniezioni di quel momento — dopo un ricarico, il tasto destro su una nota NUOVA non
   *   troverebbe niente e il menu non si aprirebbe, in silenzio. Quindi l'aggancio legge dal
   *   magazzino, che ogni disegno aggiorna. È lo stesso difetto della `const` letta in anticipo:
   *   funziona finché nessuno ricarica.
   */
  m.contesto = { trovaVoce: (id) => lista.find((v) => String(v?.id) === String(id)) || null, apriMenu };
  collegaTastoDestro(schermo, {
    trovaVoce: (id) => m.contesto.trovaVoce(id),
    apriMenu: (voce, dove) => m.contesto.apriMenu(voce, dove),
  });

  /* ------------------------------ i pezzi che la config usa ------------------------------ */

  const inModulo = (v) => Boolean(m.modulo) && (v?.__bozza === true || String(m.modulo.id) === String(v?.id));

  return {
    servizio,
    modulo: m.modulo,
    inModulo,
    voceIntera,
    chiediVoceIntera,
    letturaDi,
    modi: m.modi,
    nodiModulo,
    azioniModulo,
    apriModulo,
    apriMenu,
    cambiaStato,
    titoloDi,
    /** L'elenco che l'impianto riceve: quello vero, più la bozza quando si sta creando. */
    vociConBozza: () => (m.modulo?.modo === 'crea' ? [{ id: BOZZA, __bozza: true, titolo: '', aggiornataAlle: null }, ...lista] : lista),
    /** ⛔ Ogni filtro respinge la bozza, «Tutte» compreso: non è una voce, è un modulo aperto. */
    filtriSenzaBozza: (filtri) => filtri.map((f) => ({ ...f, quando: f.quando ? (v) => !v?.__bozza && f.quando(v) : (v) => !v?.__bozza })),
    adorno: (v, doc2) => (servizio && !v?.__bozza ? bottoneMenu(doc2, titoloDi(voceIntera(v)), (dove) => apriMenu(v, dove)) : null),
    /** La riga «scritta da te / da TALOS», solo quando la GET della voce l'ha davvero portata. */
    origine: (v, doc2) => {
      const parola = parolaOrigine(voceIntera(v)?.origine, schema);
      return parola ? nodo(doc2, 'span', 'td-origine', parola) : null;
    },
    azioniVoce: (v, doc2) => (servizio ? [
      bottone(doc2, 'Modifica', { esegui: () => apriModulo('modifica', v) }),
      bottone(doc2, 'Tutte le azioni', { esegui: (e) => apriMenu(v, { ancoraEl: e?.currentTarget || null }) }),
    ] : []),
    /**
     * Dopo il montaggio: aggancia la selezione al modulo, o chiude il modulo se la selezione è
     * cambiata sotto (la persona ha aperto un'altra scheda o chiuso il dettaglio).
     * @returns {boolean} vero se serve un secondo giro di disegno
     */
    sincronizza: () => {
      const st = statoSezione(schermo);
      if (!st) return false;
      if (m.selezionaDopo) {
        const esiste = lista.some((v) => String(v?.id) === m.selezionaDopo);
        if (esiste) { st.selezione = m.selezionaDopo; m.selezionaDopo = null; return true; }
      }
      if (!m.modulo) return false;
      const voluta = String(m.modulo.id);
      const corrente = st.selezione === null || st.selezione === undefined ? null : String(st.selezione);
      if (corrente === voluta) return false;
      if (m.modulo.appesa) { chiudiModulo({ tieniBozza: true }); return true; }
      m.modulo.appesa = true;
      st.selezione = voluta;
      return true;
    },
    /**
     * Il pulsante primario «Nuova …» nella testata della sezione, dove lo mette il mockup
     * (`initSection`, riga 6063: `<div class="td-tools">${button(icon('plus')+' '+meta[k].create,
     * 'new','primary')}…`). La testata è del prodotto e `montaSezione` non la tocca — sostituisce
     * `.talos-page` — quindi il pulsante ci sta senza toccare l'impianto.
     * ⛔ Senza sessione o senza rete NON compare: un comando che non può funzionare non si mostra.
     */
    montaPulsanteNuova: () => {
      const topbar = schermo.querySelector('.talos-topbar');
      if (!topbar) return null;
      let strumenti = topbar.querySelector('.td-tools');
      let b = strumenti?.querySelector('[data-nuova]') || null;
      if (!servizio) { b?.remove(); return null; }
      if (!strumenti) { strumenti = nodo(doc, 'div', 'td-tools'); topbar.append(strumenti); }
      if (!b) {
        b = nodo(doc, 'button', 'talos-button talos-button--primary');
        b.type = 'button';
        b.dataset.nuova = '';
        b.append(icona(doc, 'plus'), nodo(doc, 'span', '', schema.titoloNuova));
        b.addEventListener('click', () => apriModulo('crea'));
        strumenti.append(b);
      }
      b.disabled = Boolean(m.modulo);
      return b;
    },
    /** «Note / Dettaglio» diventa «Note / Modifica» mentre si scrive, come nel mockup. */
    parolaTesta: (nome) => {
      const testa = schermo.querySelector('.td-detail-head > span:first-child');
      if (!testa) return;
      /* ⛔ «Nuova voce» era una parola di sistema: chi guarda sta scrivendo una NOTA, non «una
         voce». Il nome lo porta lo schema, che è lo stesso del pulsante da cui si è arrivati. */
      if (m.modulo) testa.textContent = `${nome} / ${m.modulo.modo === 'crea' ? schema.titoloNuova : 'Modifica'}`;
    },
    notaPiede: () => {
      if (!m.modulo) return null;
      if (m.modulo.inCorso) return 'Sto salvando…';
      return m.modulo.modo === 'crea' ? `Non ancora ${accordo(schema, 'salvat')}` : 'Modifiche non ancora salvate';
    },
  };
}

/**
 * Il giro completo di una sezione scrivibile: monta, aggancia il modulo, e se qualcosa è cambiato
 * rimonta una volta sola. ⛔ La ricorsione finisce sempre: al secondo giro la selezione combacia.
 */
function montaScrivibile(schermo, scrivi, config, ridisegna) {
  const quante = montaSezione(schermo, config);
  scrivi.montaPulsanteNuova();
  scrivi.parolaTesta(config.nome);
  if (scrivi.sincronizza()) return ridisegna();
  return quante;
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
  const lista = Array.isArray(note) ? note : [];
  const ridisegna = () => montaNote(schermo, note, opzioni);
  const scrivi = scrittura(schermo, { schema: SCHEMI.note, lista, opzioni, ridisegna });
  const magazzino = magazzinoScrittura(schermo);
  return montaScrivibile(schermo, scrivi, {
    chiave: 'note',
    nome: 'Note',
    icona: 'doc',
    famiglia: 'td-note',
    sostantivo: 'nota',
    voci: scrivi.vociConBozza(),
    stato: { errore: opzioni.errore || null, caricamento: Boolean(opzioni.caricamento) },
    caricando: 'Leggo le note…',
    onAggiorna: opzioni.onAggiorna,
    // Una sola famiglia di note sul disco: nessun filtro finto per riempire la riga.
    filtri: scrivi.filtriSenzaBozza([{ id: 'tutte', etichetta: 'Tutte' }]),
    queryIniziale: cerca,
    idDi: (n) => n?.id ?? titoloNota(n),
    titoloDi: (n) => (n?.__bozza ? 'Nuova nota' : titoloNota(n)),
    quandoDi: (n) => n?.aggiornataAlle ?? n?.quando ?? n?.creataAlle ?? n?.createdAt ?? null,
    cercaIn: (n) => `${n?.titolo ?? ''} ${n?.contenuto ?? ''}`,
    sommarioBarra: (_n, { errore, caricamento }) => (errore ? 'Note non disponibili' : caricamento ? 'Leggo le note…' : sommarioNote(lista.length)),
    /* ⛔ I due sommari contano l'elenco VERO: la bozza è un modulo aperto, non una nota. */
    sommarioStato: (visibili) => (visibili === lista.length ? sommarioNote(lista.length) : `${sommarioNote(visibili)} su ${sommarioNote(lista.length)}`),
    scheda: (n, { doc, icona: ic }) => ({
      alto: [ic('doc'), nodo(doc, 'span', '', 'Appunto')],
      corpo: [nodo(doc, 'p', 'td-excerpt', anteprima(n?.contenuto))],
      basso: [
        nodo(doc, 'span', '', quandoNota(n?.aggiornataAlle ?? n?.creataAlle, adesso) || 'senza data'),
        nodo(doc, 'span', '', plurale(conteggioParole(n?.contenuto), 'parola', 'parole')),
      ],
      adorno: scrivi.adorno(n, doc),
    }),
    dettaglio: (n, { doc, etichetta }) => {
      if (scrivi.inModulo(n)) return scrivi.nodiModulo(doc);
      scrivi.chiediVoceIntera(n);
      const intera = scrivi.voceIntera(n);
      const pezzi = [
        meta(doc, [etichetta('Nota'), nodo(doc, 'span', '', quandoNota(intera?.aggiornataAlle ?? intera?.creataAlle, adesso) || 'data non registrata'), scrivi.origine(n, doc)]),
        nodo(doc, 'h2', '', titoloNota(intera)),
      ];
      /*
       * ⛔ ORDINE DELL'OWNER: «le note, se sono markdown, devono essere renderizzate in markdown».
       *   Il formato NON sta nell'elenco (rapporto backend §6): arriva con la GET della voce, e
       *   finché non è arrivato il testo si mostra com'è scritto invece di indovinare. È la stessa
       *   regola della Libreria — un interruttore con una scelta sola non è un interruttore.
       */
      pezzi.push(...montaTestoVoce(doc, {
        testo: intera?.contenuto,
        formato: intera?.formato,
        titoloGiaDetto: titoloNota(intera),
        rendiMarkdown: opzioni.rendiMarkdown,
        modo: magazzino.modi.get(String(n?.id ?? '')) || null,
        onModo: (modo) => magazzino.modi.set(String(n?.id ?? ''), modo),
      }));
      return pezzi;
    },
    azioniDettaglio: (n, { doc }) => {
      if (scrivi.inModulo(n)) return scrivi.azioniModulo(doc);
      const azioni = scrivi.azioniVoce(n, doc);
      /* Senza rete restano le due azioni che vivono nel browser e non promettono niente al server. */
      if (azioni.length) return azioni;
      return [
        bottone(doc, 'Copia', { esegui: () => onCopia?.(n) }),
        bottone(doc, 'Esporta', {
          esegui: () => {
            esportaTesto(doc, `${titoloNota(n).replace(/[\\/:*?"<>|]/g, '-').slice(0, 80)}.md`, `# ${titoloNota(n)}\n\n${n?.contenuto ?? ''}`);
            avvisa('Esportata', `${titoloNota(n)} è stata scaricata come file Markdown.`);
          },
        }),
      ];
    },
    notaPiede: () => scrivi.notaPiede() || 'Le note vivono in .notes-store/',
    vuoto: { titolo: 'Nessuna nota', testo: 'TALOS scrive una nota quando trova qualcosa che vale la pena ricordare, e da qui le scrivi anche tu. Le note vivono in .notes-store/ e valgono per tutti i progetti.' },
  }, ridisegna);
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
  const lista = Array.isArray(memorie) ? memorie : [];
  const ridisegna = () => aggiornaPaginaMemoria(schermo, memorie, opzioni);
  const scrivi = scrittura(schermo, { schema: SCHEMI.memory, lista, opzioni, ridisegna });
  return montaScrivibile(schermo, scrivi, {
    chiave: 'memoria',
    nome: 'Memoria',
    icona: 'brain',
    famiglia: 'td-memory',
    sostantivo: 'ricordo',
    voci: scrivi.vociConBozza(),
    stato: { errore: opzioni.errore || null, caricamento: Boolean(opzioni.caricamento) },
    caricando: 'Caricamento ricordi…',
    onAggiorna: opzioni.onAggiorna,
    filtri: scrivi.filtriSenzaBozza(GENERI_FILTRO.map(([id, etichetta, genere]) => ({ id, etichetta, quando: genere ? (m) => m?.genere === genere : null }))),
    idDi: (m) => m?.id,
    titoloDi: (m) => (m?.__bozza ? 'Nuovo ricordo' : testiMemoria(m).titolo),
    quandoDi: (m) => m?.aggiornataAlle ?? null,
    cercaIn: (m) => `${testiMemoria(m).titolo} ${testiMemoria(m).contenuto} ${genereMemoria(m?.genere).testo}`,
    sommarioBarra: (_n, { errore, caricamento }) => (errore ? 'Ricordi non disponibili' : caricamento ? 'Caricamento ricordi…' : `${plurale(lista.length, 'ricordo')} · globali`),
    sommarioStato: (visibili) => (visibili === lista.length ? plurale(lista.length, 'ricordo') : `${visibili} di ${plurale(lista.length, 'ricordo')}`),
    scheda: (m, { doc, icona: ic, etichetta }) => {
      const g = genereMemoria(m?.genere);
      const segno = nodo(doc, 'span', 'td-memory-mark');
      segno.append(ic(g.icona));
      return {
        /* ⛔ Il genere si dice UNA volta: il segno col simbolo, e l'etichetta col tono. Scriverlo
           anche come testo in mezzo ai due («Regola  [Regola]») era un doppione visto nella foto. */
        alto: [segno, etichetta(g.testo, g.tono || 'accent')],
        corpo: [nodo(doc, 'p', 'td-excerpt', anteprima(testiMemoria(m).contenuto))],
        /* Nella scheda la data e basta: l'ora intera sta nel dettaglio e qui si troncava. */
        basso: [nodo(doc, 'span', '', dataBreve(m?.aggiornataAlle) || 'Data non registrata')],
        adorno: scrivi.adorno(m, doc),
      };
    },
    dettaglio: (m, { doc, etichetta }) => {
      if (scrivi.inModulo(m)) return scrivi.nodiModulo(doc);
      scrivi.chiediVoceIntera(m);
      const intera = scrivi.voceIntera(m);
      const t = testiMemoria(intera);
      const g = genereMemoria(intera?.genere);
      return [
        /* ⛔ L'origine era un `h3 Origine` col valore grezzo (`persona`/`modello`) scritto sotto:
           un nome di campo a schermo. Adesso è una parola, accanto alla data, dove la si legge. */
        meta(doc, [etichetta(g.testo, g.tono || 'accent'), nodo(doc, 'span', '', t.aggiornata || 'data non registrata'), scrivi.origine(m, doc)]),
        nodo(doc, 'h2', '', t.titolo),
        nodo(doc, 'div', 'td-prose', t.contenuto),
      ];
    },
    azioniDettaglio: (m, { doc }) => {
      if (scrivi.inModulo(m)) return scrivi.azioniModulo(doc);
      const azioni = scrivi.azioniVoce(m, doc);
      if (azioni.length) return azioni;
      return [bottone(doc, 'Copia', {
        esegui: async () => {
          const t = testiMemoria(m);
          try { await navigator.clipboard.writeText(`${t.titolo}\n\n${t.contenuto}`); avvisa('Copiato', `«${t.titolo}» è negli appunti.`); }
          catch { avvisa('Copia non riuscita', 'Il browser non ha dato accesso agli appunti.'); }
        },
      })];
    },
    notaPiede: () => scrivi.notaPiede() || 'I ricordi valgono per tutte le conversazioni',
    vuoto: { titolo: 'Nessun ricordo', testo: 'I ricordi sono globali, disponibili alle tue conversazioni. Li salva TALOS quando impara qualcosa di te, e da qui li scrivi anche tu.' },
  }, ridisegna);
}

/* -------------------------------------------------------------------------------- ATTIVITA' */

export function aggiornaPaginaAttivita(schermo, attivita, opzioni = {}) {
  const lista = Array.isArray(attivita) ? attivita : [];
  const ridisegna = () => aggiornaPaginaAttivita(schermo, attivita, opzioni);
  const scrivi = scrittura(schermo, { schema: SCHEMI.tasks, lista, opzioni, ridisegna });
  return montaScrivibile(schermo, scrivi, {
    chiave: 'attivita',
    nome: 'Attività',
    icona: 'check-sq',
    famiglia: 'td-task',
    sostantivo: 'attività',
    voci: scrivi.vociConBozza(),
    stato: { errore: opzioni.errore || null, caricamento: Boolean(opzioni.caricamento) },
    caricando: 'Caricamento attività…',
    onAggiorna: opzioni.onAggiorna,
    filtri: scrivi.filtriSenzaBozza([
      { id: 'tutte', etichetta: 'Tutte' },
      { id: 'todo', etichetta: 'Da fare', quando: (a) => a?.stato === 'todo' },
      { id: 'doing', etichetta: 'In corso', quando: (a) => a?.stato === 'doing' },
      { id: 'done', etichetta: 'Fatte', quando: (a) => a?.stato === 'done' },
    ]),
    idDi: (a) => a?.id,
    titoloDi: (a) => (a?.__bozza ? 'Nuova attività' : testiAttivita(a).titolo),
    quandoDi: (a) => a?.aggiornataAlle ?? null,
    cercaIn: (a) => `${testiAttivita(a).titolo} ${testiAttivita(a).descrizione} ${statoAttivita(a?.stato).testo}`,
    sommarioBarra: (_n, { errore, caricamento }) => (errore ? 'Attività non disponibili' : caricamento ? 'Caricamento attività…' : riepilogoAttivita(lista)),
    sommarioStato: (visibili) => (visibili === lista.length ? plurale(lista.length, 'attività', 'attività') : `${visibili} di ${plurale(lista.length, 'attività', 'attività')}`),
    scheda: (a, { doc, icona: ic, etichetta }) => {
      const s = statoAttivita(a?.stato);
      const t = testiAttivita(a);
      /*
       * ⛔⛔ LA CASELLA TORNA A ESSERE UN COMANDO. Fino all'11/09 qui c'era un SEGNO `aria-hidden`
       *   e il commento diceva «`/tasks` è solo GET: una casella premibile prometterebbe una
       *   scrittura che non esiste». Da stanotte quella scrittura esiste
       *   (`POST …/tasks/:id/stato`), quindi la casella si preme davvero — con il suo toast e il
       *   suo «Annulla», perché uno stato è la cosa più reversibile che ci sia.
       * ⛔ `role="checkbox"` e non un bottone qualunque: dice fatta/non fatta, e lo stato in mezzo
       *   («In corso») si sceglie nel dettaglio, dove ci sono tutte e tre le caselle.
       */
      const fatta = a?.stato === 'done';
      const segno = nodo(doc, 'button', 'td-task-toggle');
      segno.type = 'button';
      segno.dataset.fatta = String(fatta);
      if (scrivi.servizio && !a?.__bozza) {
        segno.setAttribute('role', 'checkbox');
        segno.setAttribute('aria-checked', String(fatta));
        segno.setAttribute('aria-label', fatta ? `Riapri ${t.titolo}` : `Segna fatta ${t.titolo}`);
        segno.addEventListener('click', (e) => { e.stopPropagation(); void scrivi.cambiaStato(a, fatta ? 'todo' : 'done'); });
      } else {
        segno.disabled = true;
        segno.setAttribute('aria-hidden', 'true');
        segno.tabIndex = -1;
      }
      if (fatta) segno.append(ic('check'));
      const menu = scrivi.adorno(a, doc);
      const adorni = nodo(doc, 'span', 'td-task-adorni');
      adorni.append(segno, ...(menu ? [menu] : []));
      return {
        dati: { done: String(fatta), comandabile: String(Boolean(scrivi.servizio)) },
        alto: [etichetta(s.testo, s.tono || ''), ...(a?.priorita === 'high' ? [nodo(doc, 'span', 'td-priority', 'Alta priorità')] : [])],
        corpo: [nodo(doc, 'p', 'td-excerpt', anteprima(t.descrizione, 130) || 'Nessuna descrizione.')],
        basso: [
          nodo(doc, 'span', '', prioritaAttivita(a?.priorita)),
          nodo(doc, 'span', '', dataBreve(a?.aggiornataAlle) || 'Data non registrata'),
        ],
        adorno: adorni,
      };
    },
    dettaglio: (a, { doc, etichetta }) => {
      if (scrivi.inModulo(a)) return scrivi.nodiModulo(doc);
      scrivi.chiediVoceIntera(a);
      const intera = scrivi.voceIntera(a);
      const s = statoAttivita(intera?.stato);
      const t = testiAttivita(intera);
      const pezzi = [
        meta(doc, [etichetta(s.testo, s.tono || ''), nodo(doc, 'span', '', prioritaAttivita(intera?.priorita)), nodo(doc, 'span', '', t.aggiornata || 'data non registrata'), scrivi.origine(a, doc)]),
        nodo(doc, 'h2', '', t.titolo),
      ];
      if (scrivi.servizio) {
        pezzi.push(nodo(doc, 'h3', '', 'Stato'));
        pezzi.push(costruisciStatoAttivita(doc, { stato: intera?.stato, onScegli: (nuovo) => void scrivi.cambiaStato(a, nuovo) }));
      }
      pezzi.push(nodo(doc, 'h3', '', 'Descrizione'));
      pezzi.push(nodo(doc, 'div', 'td-prose', t.descrizione || 'Nessuna descrizione.'));
      return pezzi;
    },
    azioniDettaglio: (a, { doc }) => {
      if (scrivi.inModulo(a)) return scrivi.azioniModulo(doc);
      const azioni = scrivi.azioniVoce(a, doc);
      return azioni.length ? azioni : null;
    },
    /* ⛔ VISTO NELLA FOTO: qui c'era «Le attività vivono in .tasks-store/», e l'introduzione due
       centimetri più in su dice già la stessa identica frase. Due volte la stessa cosa nella stessa
       schermata non è ridondanza innocua: è spazio tolto a ciò che non è ancora stato detto. */
    notaPiede: () => scrivi.notaPiede() || 'Lo stato si cambia da qui e dalla chat',
    vuoto: { titolo: 'Nessuna attività', testo: 'Le attività sono globali, disponibili alle tue conversazioni. Le apre TALOS mentre lavora, e da qui le apri anche tu. Vivono in .tasks-store/.' },
  }, ridisegna);
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

/**
 * ⭐⭐⭐ L5 (12/09/2026) — LA PORTA DI RETE DELLA RICERCA APPROFONDITA.
 *
 * ⛔ La forma delle rotte sta QUI, una volta sola, come `servizioVoci` per Note/Attività/Memoria:
 *   nessun indirizzo ricostruito dentro un gestore di click. `rete` sono le funzioni della app
 *   (`apiPost`/`apiDelete`/`apiGet`), che aprono già la busta `{ok,data}` e lanciano un `Error`
 *   con `.code` — e il `.code` è l'unica parte VERA che esce da un 400/404/409, perché il
 *   messaggio lo riscrive `public-problem.mjs`.
 * ⛔ Senza sessione o senza rete torna `null`, e le quattro voci di menu non si disegnano: un
 *   comando che non può funzionare non si mostra.
 * ⛔ Le tre azioni mandano il corpo `{}`: la rotta rifiuta con 400 QUALUNQUE chiave (allowlist
 *   vuota, `http-app.mjs:1416-1436`), e `{}` è la forma che il contratto dichiara lecita.
 */
export function servizioRicerche({ sessionId, rete } = {}) {
  if (!sessionId || typeof rete?.post !== 'function' || typeof rete?.elimina !== 'function') return null;
  const base = `/api/v1/sessions/${encodeURIComponent(sessionId)}/research`;
  const voceUrl = (id) => `${base}/${encodeURIComponent(String(id ?? ''))}`;
  return {
    leggi: typeof rete.leggi === 'function' ? (id) => rete.leggi(voceUrl(id)) : null,
    pausa: (id) => rete.post(`${voceUrl(id)}/pausa`, {}),
    ripresa: (id) => rete.post(`${voceUrl(id)}/ripresa`, {}),
    riverifica: (id) => rete.post(`${voceUrl(id)}/riverifica`, {}),
    elimina: (id) => rete.elimina(voceUrl(id)),
  };
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

  /* ------------------------------------ L5 (12/09): le quattro azioni di scrittura ------------ */

  const servizio = servizioRicerche({ sessionId: opzioni.sessionId, rete: opzioni.rete });
  /* ⛔ Il dettaglio si legge dalla rotta di L5 quando c'è, e si può scavalcare (test, laboratorio):
     stessa iniezione di `leggiRapporto`, così il banco non finge una rete. */
  const leggiDettaglio = typeof opzioni.leggiDettaglio === 'function' ? opzioni.leggiDettaglio
    : (servizio?.leggi ? async (voce) => (await servizio.leggi(voce?.id))?.ricerca ?? null : null);

  /**
   * Ricarica l'elenco. `onAggiorna` è la via vera (la app rifà la GET); `ridisegna` è il ripiego
   * per il laboratorio e per i test, dove nessuno ricarica niente.
   * ⛔ Si fa SEMPRE, anche dopo un errore: uno schermo che mostra lo stato di prima di un rifiuto
   *   è la stessa bugia che questo lotto sta togliendo.
   */
  function ricarica() {
    if (typeof opzioni.onAggiorna === 'function') opzioni.onAggiorna();
    else ridisegna();
  }

  /**
   * ⛔⛔ LA RISPOSTA DELL'AZIONE È LA VOCE AGGIORNATA (contratto L5 §4.3), e si scrive **subito**
   *   nella riga che la persona sta guardando invece di aspettare il giro di ricarica: senza,
   *   fra il «fatto» del messaggio e il ridisegno c'è una finestra in cui il timbro dice ancora
   *   lo stato vecchio. Il ricaricamento resta, ed è quello che comanda.
   * ⛔ Si scrive nello STESSO oggetto che l'elenco tiene (`Object.assign`): una copia nuova non
   *   sarebbe quella che `montaSezione` ridisegna.
   */
  function aggiornaVoceInElenco(aggiornata) {
    if (!aggiornata?.id) return;
    const vecchia = trovaVoce(aggiornata.id);
    if (vecchia) Object.assign(vecchia, aggiornata);
    /* La scheda intera appena letta vale anche come dettaglio: niente seconda GET. */
    magazzino.dettagli.set(String(aggiornata.id), { stato: 'pronto', ricerca: aggiornata });
  }

  function guasto(errore, azione) {
    avvisa('Non riuscito', paroleErroreRicerca(errore?.code, azione), { tono: 'errore' });
  }

  /*
   * ⛔⛔⛔ LA PAUSA È UNA RICHIESTA, NON UN FATTO — contratto L5 §4.3, verbatim: «Il frontend non
   *   deve promettere "in pausa" sulla risposta: deve mostrare ciò che la voce dice». Il passaggio
   *   a «in pausa» avviene al punto sicuro, perché in mezzo c'è del denaro. ⇒ il messaggio dice
   *   quello che lo `stato` della voce dice DAVVERO, e sono due frasi diverse.
   */
  async function pausa(voce) {
    try {
      const dati = await servizio.pausa(voce?.id);
      aggiornaVoceInElenco(dati?.ricerca);
      avvisa(dati?.ricerca?.stato === 'paused' ? 'In pausa' : 'Pausa chiesta',
        dati?.ricerca?.stato === 'paused'
          ? 'La ricerca è ferma: riprendila quando vuoi, dallo stesso menu.'
          : 'La ricerca si fermerà al primo punto sicuro: fin lì il lavoro già pagato non si butta.');
    } catch (errore) { guasto(errore, 'pausa'); }
    ricarica();
  }

  async function riprendi(voce) {
    try {
      const dati = await servizio.ripresa(voce?.id);
      aggiornaVoceInElenco(dati?.ricerca);
      avvisa('Ripresa', 'La ricerca riparte dal punto in cui si era fermata, non da capo.');
    } catch (errore) { guasto(errore, 'ripresa'); }
    ricarica();
  }

  /*
   * ⛔⛔ LA RI-VERIFICA ESCE IN RETE e può durare: apre fino a venti pagine, una alla volta. Quindi
   *   si dichiara PRIMA («sto rileggendo…»), si apre la vista Fonti dove l'esito comparirà, e si
   *   ridisegna subito — altrimenti la persona preme e non succede niente per mezzo minuto.
   * ⛔ L'esito NON è persistito dal server (rapporto L5 §6.2): vive qui, nel magazzino dello
   *   schermo, e sparisce alla prossima apertura. Detto qui perché nessuno lo scambi per un dato
   *   salvato — «l'esito dell'ultima ri-verifica con la data» è ancora da fare.
   */
  async function riverifica(voce) {
    const id = String(voce?.id);
    magazzino.viste.set(id, 'fonti');
    magazzino.riverifiche.set(id, { stato: 'in-corso' });
    ridisegna();
    /*
     * ⛔⛔ TROVATO GUARDANDO LE FOTO (12/09, `riverifica-dark-1440` e `riverifica_no-light-1440`):
     *   il toast ripeteva PAROLA PER PAROLA la frase che il pannello aveva appena scritto, e per
     *   giunta ci finiva sopra — il messaggio copriva l'esito che annunciava. Due volte la stessa
     *   cosa non è il doppio dell'informazione: è metà dello schermo in meno.
     * ⇒ Il messaggio si manda SOLO quando quella ricerca non è quella aperta nel dettaglio, cioè
     *   quando l'azione è partita dal tasto destro su una scheda e l'esito non si vedrebbe da
     *   nessuna parte. Quando il pannello c'è, l'annuncio lo fa lui: è un `role="status"`, che
     *   WCAG 2.2 SC 4.1.3 considera proprio l'annuncio dell'esito di un'azione.
     */
    const aperta = String(statoSezione(schermo)?.selezione ?? '') === id;
    try {
      const dati = await servizio.riverifica(id);
      magazzino.riverifiche.set(id, { stato: 'pronto', esito: dati?.riverifica || null });
      if (!aperta) avvisa('Fonti rilette', frasiRiverifica(dati?.riverifica));
    } catch (errore) {
      const parole = paroleErroreRicerca(errore?.code, 'riverifica');
      magazzino.riverifiche.set(id, { stato: 'errore', errore: parole });
      if (!aperta) avvisa('Non riuscito', parole, { tono: 'errore' });
    }
    ridisegna();
  }

  /*
   * ⛔⛔⛔ L'ELIMINAZIONE È IRREVERSIBILE, E LA CONSEGUENZA È DOPPIA. NN/g «Confirmation Dialogs
   *   Can Prevent User Errors» (letta il 12/09/2026): la conferma serve alle azioni con
   *   conseguenze gravi, deve dire con precisione che cosa sta per succedere, e i pulsanti devono
   *   nominare l'azione invece di rispondere «sì/no».
   * ⛔ «e il rapporto in Libreria» non è una frase di colore: `elimina()` dell'orchestratore
   *   cancella PRIMA la voce di Libreria e poi la cartella della ricerca
   *   (`research-orchestrator.mjs:1083-1094`). Verificato nel codice, non dedotto dal nome.
   * ⛔ Niente toast con «Annulla», e non per dimenticanza: l'annullamento sostituisce la conferma
   *   quando l'azione si può disfare, e questa no — non c'è un cestino, e il rapporto se n'è
   *   andato con la cartella.
   */
  function elimina(voce) {
    const titolo = frasiVoce(voce).domanda;
    /* ⛔ VISTO NELLA FOTO (`elimina-light-1024`): una domanda lunga occupava tre righe della modale
       e spingeva la conseguenza — la riga che conta — sotto il bordo dell'attenzione. Si cita
       quanto basta a riconoscere quale ricerca è, non tutto il testo. */
    const citato = titolo.length > 110 ? `${titolo.slice(0, 110).trimEnd()}…` : titolo;
    confermaModale({
      document: schermo.ownerDocument || globalThis.document,
      titolo: 'Elimino la ricerca?',
      domanda: `«${citato}» viene cancellata dal disco insieme al suo rapporto in Libreria.`,
      conseguenza: 'Non c’è un cestino: spariscono anche le fonti raccolte e il giornale di bordo, e nessuno potrà più rileggerli.',
      etichettaConferma: 'Elimina la ricerca',
      onConferma: async () => {
        try {
          await servizio.elimina(voce?.id);
          const dove = elenco.findIndex((r) => String(r?.id) === String(voce?.id));
          if (dove >= 0) elenco.splice(dove, 1);
          /* ⛔ Il dettaglio aperto era QUELLO: lasciarlo aperto mostrerebbe una scheda di una cosa
             che non esiste più. Si chiude, e l'elenco torna quello vero. */
          const st = statoSezione(schermo);
          if (st && String(st.selezione) === String(voce?.id)) st.selezione = null;
          magazzino.dettagli.delete(String(voce?.id));
          magazzino.riverifiche.delete(String(voce?.id));
          avvisa('Eliminata', `«${titolo}» non c’è più.`);
        } catch (errore) { guasto(errore, 'elimina'); }
        ricarica();
      },
    });
  }

  /*
   * ⭐⭐⭐ LA SUITE DI ESPORTAZIONI — ordine dell'owner del 12/09: «completa».
   *
   * ⛔ SI APRE UN LINK, NON SI FA UN `fetch`: la rotta risponde con `Content-Disposition:
   *   attachment`, cioè dice già al browser di salvare invece di navigare (MDN, letta il
   *   12/09/2026). Passare da `fetch` + `Blob` vorrebbe dire tenere in memoria un PDF intero per
   *   riottenere ciò che il browser fa da solo, e perdere la barra dei download.
   * ⛔ `download` SENZA valore, e non è una dimenticanza: quando l'intestazione porta un `filename`
   *   quello **vince** sull'attributo (MDN, stesso giorno) ⇒ un nome messo qui sarebbe ignorato dal
   *   server e creduto da noi. Il nome lo decide chi scrive il file.
   * ⛔ IL 409 NON SI RAGGIUNGE quasi mai, perché le uscite che il server rifiuterebbe sono già
   *   SPENTE nel pannello, con scritto il motivo (`esportazioniRicerca`). Resta un caso che non
   *   copro: se il record sparisse fra l'apertura del pannello e il clic, il browser aprirebbe la
   *   busta JSON invece di scaricare. Dichiarato nel rapporto, non nascosto.
   */
  function esportazioni(voce) {
    const doc = schermo.ownerDocument || globalThis.document;
    const elenco = esportazioniRicerca(voce, letturaDi(voce));
    apriModale('Esporta la ricerca', montaPannelloEsportazioni(doc, elenco, {
      onScegli: (uscita) => { chiudiModale(); esegui(voce, uscita); },
    }), { document: doc });
  }

  function esegui(voce, uscita) {
    if (uscita.chiave === 'copia') {
      Promise.resolve(copia(uscita.testo)).then(
        () => avvisa('Copiato', 'Il testo del rapporto è negli appunti.'),
        () => avvisa('Non copiato', 'Gli appunti non sono disponibili in questa finestra.', { tono: 'errore' }),
      );
      return;
    }
    const doc = schermo.ownerDocument || globalThis.document;
    const a = doc.createElement('a');
    a.href = indirizzoEsportazione(opzioni.sessionId, voce?.id, uscita.formato, uscita.tono);
    a.download = '';
    a.rel = 'noopener';
    doc.body?.append(a);
    a.click();
    a.remove();
    /*
     * ⛔ Il messaggio nomina il FORMATO, non un nome di file: quello lo sceglie il server (vedi
     *   sopra), e annunciarne uno diverso da quello salvato è una bugia gratuita. L'azione si
     *   chiama come la riga che è stata premuta, dall'inizio alla fine.
     */
    avvisa('Esportato', `${uscita.etichetta}: il file è nella cartella dei download.`);
  }

  function apriMenu(voce, dove) {
    const voci = vociMenuRicerca(voce, {
      lettura: letturaDi(voce),
      /* La suite vuole la rotta, cioè la sessione: senza, il menu resta quello di ieri. */
      onEsportazioni: opzioni.sessionId ? esportazioni : null,
      onApriSessione: opzioni.onApriSessione,
      onPausa: servizio ? pausa : null,
      onRiprendi: servizio ? riprendi : null,
      onRiverifica: servizio ? riverifica : null,
      onElimina: servizio ? elimina : null,
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

  const visibili = montaSezione(schermo, {
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
        leggiDettaglio,
        onApriSessione: opzioni.onApriSessione,
        rendiMarkdown: opzioni.rendiMarkdown,
      },
    }),
    vuoto: {
      titolo: 'Nessuna ricerca',
      testo: 'Chiedi in chat di avviare una ricerca approfondita: comparirà qui mentre lavora, e ci resterà col suo rapporto.',
    },
  });

  /*
   * ⭐⭐⭐ 12/09 — LA SCHEDA CHE RESTAVA «IN CORSO». Dopo aver disegnato, si guarda se qualcosa può
   *   ancora cambiare da solo: se sì, fra trenta secondi si richiede l'elenco; se no, l'orologio
   *   si spegne. ⛔ Dopo `montaSezione` e non prima: `governoRicercheVive` cancella il timer
   *   precedente a ogni giro, e un disegno che finisse in eccezione lascerebbe un orologio armato
   *   su dati che nessuno ha mostrato.
   * ⛔ `onAggiorna` e non `ridisegna`: ridisegnare gli STESSI dati non cambierebbe niente e
   *   ripartirebbe il timer all'infinito — il punto è richiedere l'elenco al server.
   */
  governoRicercheVive(schermo, { elenco, aggiorna: opzioni.onAggiorna });
  return visibili;
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
