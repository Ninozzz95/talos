/*
 * Decisione 142 dell'owner (04/11/2026): «Salva in Libreria» sotto un blocco vivo della chat del PC.
 *
 * Copiato dal bozzetto approvato (`frontend/in-corso/bozzetto-ui-generativa/pc.js:17` le azioni sotto il blocco, `:97` dopo il
 * salvataggio il tasto dice «In Libreria · v1») e dalla grammatica degli avvisi che esiste già (`components/toast.js`: tono «riuscito»,
 * un'azione, 11 s come «Annulla» perché un avviso con un'azione deve restare abbastanza da poterla premere).
 *   - il clic manda il SORGENTE del blocco (`contesto.opzioni.testo`, lo stesso testo che la chat ha disegnato) a
 *     `POST /api/v1/sessions/:id/blocks/library`; il server crea la voce (v1) o aggiunge una versione alla voce dello stesso blocco;
 *   - il tasto diventa «In Libreria · v<n>» e resta premibile: un altro salvataggio dopo un cambio è una versione nuova;
 *   - l'avviso «Salvato in Libreria» porta «Apri», che apre la voce nella Libreria.
 * ⛔ Un testo già salvato in una versione qualunque non fa una versione nuova (il server risponde `nuova:false` con quella versione,
 *   revisione J, D5) e l'avviso lo dice, invece di mentire.
 *
 * ⭐ Revisione J, D7 (04/11/2026, la versione più ambiziosa scelta dal Desktop): «In Libreria · vN» non si perde a ogni nuovo disegno.
 *   - La pagina lo ricorda per `sessione:impronta#id` (la chiave di `creaMemoriaAzioni` dell'aggancio, sull'impronta del SORGENTE, quello
 *     che il server tiene): il blocco ridisegnato (cambio di sessione e ritorno, `spegni` dal giornale) lo dice subito.
 *   - Dopo una ricarica la memoria è vuota: il tasto lo chiede al server (`GET /api/v1/sessions/:id/blocks/:idBlocco/library`, sola
 *     lettura, l'impronta di ogni versione), UNA volta per blocco e per pagina; una risposta «non c'è» resta, un guasto si richiede al
 *     disegno dopo. ⛔ La risposta del server non copre mai un numero più nuovo (un salvataggio fatto nel frattempo vince).
 *   - Il tasto cambia solo se dice ancora «Salva in Libreria» e non è in volo: mai sotto un clic della persona.
 *   Una voce cancellata dalla Libreria in questa stessa pagina resta «In Libreria» fino alla ricarica: un altro clic la ricrea (v1).
 */
import { impronta } from '../../../../src/blocchi/impronta.mjs';
import { sorgenteDelBlocco } from '../../../../src/blocchi/recinto.mjs';
import { t as traduci } from '../lingua.js';
import { DURATA_CON_ANNULLA, messaggioUmano } from '../toast.js';

const senzaEstensione = (nome) => String(nome ?? '').replace(/\.txt$/iu, '');
const versioneValida = (n) => Number.isInteger(n) && n >= 1;

/**
 * @param {{ post: (percorso: string, corpo: object) => Promise<any>, leggi?: (percorso: string) => Promise<any>,
 *   sessione: () => string|null|undefined, avvisa: (titolo: string, messaggio: string, opzioni: object) => void,
 *   apri: (id: string) => void, t?: Function }} o `leggi`: il GET di sola lettura della versione dopo una ricarica (facoltativo)
 * @returns {((blocco: object, contesto: { opzioni?: { testo?: string }, nodo?: HTMLElement }) => Promise<object|null>)
 *   & { ricorda: (blocco: object, contesto: { opzioni?: { testo?: string }, tasto: HTMLElement }) => void }} l'azione `libreria`
 *   del guscio (`azioniDel`, guscio.js); `ricorda` la chiama il guscio a ogni disegno del tasto
 */
export function creaSalvaInLibreria({ post, leggi, sessione, avvisa, apri, t = traduci }) {
  /** `sessione:impronta#id` → la versione che tiene quel testo */
  const memoria = new Map();
  /** `sessione#id` → la domanda al server (una per blocco e per pagina) */
  const domande = new Map();
  const chiaveDi = (sessionId, testo, idBlocco) => `${sessionId}:${impronta(sorgenteDelBlocco(testo))}#${idBlocco}`;
  const ricordaVersione = (chiave, n) => {
    if (!versioneValida(n)) return;
    const prima = memoria.get(chiave);
    if (!versioneValida(prima) || n > prima) memoria.set(chiave, n);
  };
  const etichetta = (n) => t('blocchi.actions.inLibrary', { n });

  async function salvaInLibreria(blocco, contesto = {}) {
    const sessionId = sessione?.();
    const testo = contesto.opzioni?.testo;
    if (!sessionId || typeof testo !== 'string' || !testo.trim()) return null;
    const tasto = contesto.voci?.libreria ?? contesto.nodo?.querySelector?.('button[data-libreria]') ?? null;
    if (tasto) tasto.disabled = true; // un doppio clic non manda due richieste (il server tiene comunque UNA voce per blocco)
    try {
      const risposta = await post(`/api/v1/sessions/${encodeURIComponent(sessionId)}/blocks/library`, { testo });
      const dati = risposta?.data ?? risposta;
      if (!dati || typeof dati.id !== 'string' || !Number.isInteger(dati.versione)) throw new Error(t('blocchi.library.failedBody'));
      if (blocco?.id) memoria.set(chiaveDi(sessionId, testo, blocco.id), dati.versione);
      if (tasto) tasto.textContent = etichetta(dati.versione);
      const parole = { name: senzaEstensione(dati.nome), n: dati.versione };
      avvisa(t('blocchi.library.saved'), t(dati.nuova === false ? 'blocchi.library.savedSame' : 'blocchi.library.savedBody', parole), {
        tono: 'riuscito',
        durata: DURATA_CON_ANNULLA,
        azione: { etichetta: t('blocchi.library.open'), dati: 'apri', esegui: () => apri?.(dati.id) },
      });
      return dati;
    } catch (errore) {
      avvisa(t('blocchi.library.failed'), messaggioUmano(errore) || t('blocchi.library.failedBody'), { tono: 'guasto' });
      return null;
    } finally {
      if (tasto) tasto.disabled = false;
    }
  }

  /** La voce del blocco secondo il server (`{ id, versioni: [{ n, impronta }] }` o `null`); un guasto non resta in memoria. */
  function chiediAlServer(sessionId, idBlocco) {
    const chiave = `${sessionId}#${idBlocco}`;
    let domanda = domande.get(chiave);
    if (!domanda) {
      domanda = Promise.resolve()
        .then(() => leggi(`/api/v1/sessions/${encodeURIComponent(sessionId)}/blocks/${encodeURIComponent(idBlocco)}/library`))
        .then((r) => { const dati = r?.data ?? r; return dati && typeof dati === 'object' && 'voce' in dati ? dati.voce : Promise.reject(new Error('no voce')); })
        .catch(() => { domande.delete(chiave); return undefined; });
      domande.set(chiave, domanda);
    }
    return domanda;
  }

  salvaInLibreria.ricorda = function ricorda(blocco, { opzioni, tasto } = {}) {
    const sessionId = sessione?.();
    const testo = opzioni?.testo;
    if (!tasto || !sessionId || !blocco?.id || typeof testo !== 'string' || !testo.trim()) return;
    const chiave = chiaveDi(sessionId, testo, blocco.id);
    const nota = memoria.get(chiave);
    if (versioneValida(nota)) { tasto.textContent = etichetta(nota); return; }
    if (typeof leggi !== 'function') return;
    const mia = impronta(sorgenteDelBlocco(testo));
    void chiediAlServer(sessionId, blocco.id).then((voce) => {
      const versioni = Array.isArray(voce?.versioni) ? voce.versioni : [];
      const trovata = versioni.filter((v) => v?.impronta === mia && versioneValida(v?.n)).at(-1);
      if (!trovata) return;
      ricordaVersione(chiave, trovata.n);
      if (!tasto.disabled && tasto.textContent === t('blocchi.actions.library')) tasto.textContent = etichetta(memoria.get(chiave));
    });
  };

  return salvaInLibreria;
}

/**
 * «Apri» dell'avviso: la voce nella pagina della Libreria. Stesso innesto di `apriAutomazioneNelPannello` (automazioni-sezione.js):
 * la selezione si scrive nello stato della sezione. ⛔ Non subito: la pagina si ricarica e il primo disegno («caricamento», elenco vuoto)
 * chiude il dettaglio di una voce che non vede (`sezione-elenco-dettaglio.js`, «se la voce scelta non c'è più … si chiude»). La voce
 * resta in attesa e la prende `prendiVoceInAttesa` quando arriva l'elenco che la contiene; anche la prima volta, quando lo stato della
 * sezione non esiste ancora.
 * Revisione J, nota (04/11): con un filtro o una ricerca attivi la voce appena salvata sarebbe scelta ma nascosta dall'elenco. Si toglie
 * il filtro come fa «Togli i filtri» dello stato vuoto (`disegnaVuoto`): la persona ha chiesto di vedere QUELLA voce.
 * @param {{ schermo: () => HTMLElement|null, statoSezione: (schermo: HTMLElement) => object|null, mostraPagina: () => void }} o
 */
export function creaApriVoceDellaLibreria({ schermo, statoSezione, mostraPagina }) {
  let inAttesa = null;
  return {
    apri(id) {
      inAttesa = String(id);
      mostraPagina();
    },
    /** Chiamata dopo ogni disegno dell'elenco: se la voce attesa è arrivata la seleziona e dice di ridisegnare. */
    prendiVoceInAttesa(voci) {
      if (!inAttesa || !Array.isArray(voci) || !voci.some((v) => v?.id === inAttesa)) return false;
      const st = schermo?.() ? statoSezione(schermo()) : null;
      if (!st) return false;
      st.selezione = inAttesa;
      if (typeof st.query === 'string' && st.query) st.query = '';
      const tutte = st.config?.filtri?.[0]?.id || 'tutte';
      if (typeof st.filtro === 'string' && st.filtro !== tutte) st.filtro = tutte;
      if (st.nodi?.cerca && st.nodi.cerca.value) st.nodi.cerca.value = '';
      inAttesa = null;
      return true;
    },
  };
}
