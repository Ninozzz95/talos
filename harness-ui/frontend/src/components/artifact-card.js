import { t } from './lingua.js';
/** The existing artifact card, backed by its exact Library copy after replay.
 * HTML remains behind the server's sandbox/CSP and session page capability.
 * No HTML, absolute filesystem path or expiring capability is persisted here.
 */
import {creaArtefatto} from './conversazione.js';
import {fonteDaLibreria} from './lettore/fonti.js';

const ID_LIBRERIA = /^lib-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function paginaValida(indirizzo) {
  if (typeof indirizzo !== 'string' || !/^\/api\/v1\/pagine\/[A-Za-z0-9_-]{43}\/[^/?#]+$/.test(indirizzo)) return false;
  try {
    const nome = decodeURIComponent(indirizzo.split('/').at(-1));
    return nome !== '.' && nome !== '..' && !/[\\/:\x00-\x1f\x7f]/.test(nome);
  } catch { return false; }
}

export function creaCardArtefatto({evento, sessionId, API = p => p,
  fetchFn = (...a) => globalThis.fetch(...a), apriFn = (...a) => globalThis.open(...a),
  ancoraValida = () => true}, opzioni = {}) {
  let indirizzo = null;
  let fonte = null;
  let apertura = Promise.resolve();
  const viva = () => card.isConnected && ancoraValida();
  const {card, frame, apri} = creaArtefatto({titolo: evento.titolo || t('chat.artifact.badge'),
    onApri: apriPagina}, opzioni);
  apri.title = t('chat.artifact.openInTab');
  const stato = card.ownerDocument.createElement('p');
  stato.className = 'talos-artifact__status talos-muted';
  stato.setAttribute('role', 'status');
  stato.textContent = t('chat.artifact.loading');
  card.insertBefore(stato, frame);
  apri.disabled = true;
  frame.hidden = true;
  function erroreVisibile(messaggio) {
    stato.hidden = false;
    stato.textContent = t('chat.artifact.unavailable', { messaggio });
  }
  function apriPagina() {
    if (!indirizzo || !viva() || apri.disabled) return;
    if (!fonte) { apriFn(indirizzo, '_blank', 'noopener'); return; }
    // Open during the gesture. A capability from the original preview may have
    // expired; renew it before navigation without losing popup permission.
    apertura = (async () => {
      let tab;
      const avevaFocus = card.ownerDocument.activeElement === apri;
      const chiudi = () => { try { tab?.close(); } catch { /* the user may have closed it already */ } };
      try {
        tab = apriFn('about:blank', '_blank');
        if (!tab) { erroreVisibile(t('chat.artifact.tabBlocked')); return; }
        tab.opener = null; // Before any await or untrusted document navigation.
        apri.disabled = true;
        const pagina = await fonte.creaPagina();
        if (!paginaValida(pagina)) throw new Error(t('chat.artifact.pageReferenceInvalid'));
        if (!viva() || tab.closed) { chiudi(); return; }
        tab.location.replace(API(pagina));
        stato.hidden = true;
      } catch (errore) {
        chiudi();
        if (viva()) erroreVisibile(errore instanceof Error ? errore.message : t('chat.artifact.loadFailed'));
      } finally {
        if (viva()) {
          apri.disabled = false;
          if (avevaFocus && card.ownerDocument.activeElement === card.ownerDocument.body) apri.focus({preventScroll: true});
        }
      }
    })();
  }
  /*
   * ⭐ 24/10/2026 — ARTEFATTI CON VERSIONI (owner: «la carta di ogni giro resta sulla sua versione», bozzetto approvato).
   *   `evento.versione` è la versione che QUESTO giro ha fatto: la carta la mostra sempre, con «vN of M» accanto al titolo. Se
   *   poi ne è nata una più nuova, una striscia lo dice («Updated later in …») e «Show latest» mostra l'ultima nella stessa
   *   carta (e riporta indietro). Quante versioni ci sono lo dice la Libreria; quando un'altra carta della stessa voce nasce
   *   in questa pagina, le sorelle rileggono il conto (`talos:artefatto-versione`).
   */
  const versioneDelGiro = Number.isSafeInteger(evento.versione) && evento.versione >= 1 && typeof evento.voceLibreriaId === 'string'
    ? evento.versione : null;
  const doc = card.ownerDocument;
  let etichettaVersione = null;
  let avviso = null;
  let mostraUltima = false;
  let fonteUltima = null;
  let fonteDelGiro = null;
  let totaleInCornice = null; // D-A2: quante versioni c'erano quando la cornice ha caricato «l'ultima»
  /* ⛔ Revisione a blocco 4 (24/10/2026, REV4-ART-1, S3): il gestore di «Show latest» nasce UNA volta, alla prima `disegnaVersioni`,
     e chiudeva sull'elenco di allora: con una versione nata prima del clic ridisegnava «v5 of 5 · latest» mentre la cornice
     ricaricava la v6. Il clic legge l'elenco dell'ULTIMO disegno, come il selettore di LibreChat (`Artifacts.tsx:598-606`) legge
     `orderedArtifactIds` del disegno corrente. */
  let ultimeVersioni = null;
  async function caricaInCornice(f) {
    const pagina = await f.creaPagina();
    if (!paginaValida(pagina)) throw new Error(t('chat.artifact.pageReferenceInvalid'));
    if (!viva()) return;
    fonte = f;
    indirizzo = API(pagina);
    frame.src = indirizzo;
  }
  function disegnaVersioni(versioni) {
    if (!versioneDelGiro || !Array.isArray(versioni) || !versioni.length) return;
    ultimeVersioni = versioni;
    const totale = versioni.length;
    const ultima = versioni[totale - 1];
    const vista = mostraUltima ? totale : versioneDelGiro;
    /* ⛔ Revisione a blocco 3 (24/10/2026, D-A2, S3): su «Show latest», quando una sorella annunciava una versione più nuova, l'etichetta
       diceva «v4» e la cornice mostrava ancora la v3. Se l'ultima è cambiata da quando la cornice l'ha caricata, si ricarica. */
    if (mostraUltima && fonteUltima && totaleInCornice !== totale) {
      totaleInCornice = totale;
      void caricaInCornice(fonteUltima).catch((errore) => erroreVisibile(errore instanceof Error ? errore.message : t('chat.artifact.loadFailed')));
    }
    if (!mostraUltima) totaleInCornice = null;
    if (!etichettaVersione) {
      etichettaVersione = doc.createElement('span');
      etichettaVersione.className = 'talos-artifact__versione';
      card.querySelector('.talos-artifact__title')?.after(etichettaVersione);
    }
    etichettaVersione.textContent = vista === totale ? t('chat.artifact.versionLatest', { n: vista, total: totale }) : t('chat.artifact.version', { n: vista, total: totale });
    etichettaVersione.toggleAttribute('data-ultima', vista === totale);
    if (versioneDelGiro >= totale) { avviso?.remove(); avviso = null; return; }
    if (!avviso) {
      avviso = doc.createElement('div');
      avviso.className = 'talos-artifact__avviso';
      avviso.setAttribute('role', 'status');
      const testo = doc.createElement('span');
      testo.className = 'talos-grow';
      const azione = doc.createElement('button');
      azione.type = 'button';
      azione.className = 'talos-button talos-button--ghost talos-button--sm';
      azione.dataset.artefattoUltima = '';
      azione.addEventListener('click', () => {
        mostraUltima = !mostraUltima;
        fonteUltima ??= fonteDaLibreria({sessionId, voce: {id: evento.voceLibreriaId}, fetchFn: (percorso, init) => fetchFn(API(percorso), init)});
        /* l'ultima la carica `disegnaVersioni` (un posto solo, così ricarica anche quando ne nasce una nuova); la sua la si carica qui */
        if (!mostraUltima) void caricaInCornice(fonteDelGiro).catch((errore) => erroreVisibile(errore instanceof Error ? errore.message : t('chat.artifact.loadFailed')));
        disegnaVersioni(ultimeVersioni); // REV4-ART-1: l'elenco dell'ultimo disegno, non quello della prima chiamata
      });
      avviso.append(testo, azione);
      card.querySelector('.talos-artifact__head')?.after(avviso);
    }
    const [testo, azione] = avviso.children;
    testo.textContent = mostraUltima
      ? t('chat.artifact.showingLatest', { total: totale, n: versioneDelGiro })
      : (ultima?.sessionNome ? t('chat.artifact.updatedLaterIn', { chat: ultima.sessionNome, total: totale }) : t('chat.artifact.updatedLater', { total: totale }));
    azione.textContent = mostraUltima ? t('chat.artifact.backToVersion', { n: versioneDelGiro }) : t('chat.artifact.showLatest');
  }
  async function rileggiVersioni() {
    if (!versioneDelGiro || typeof sessionId !== 'string' || !sessionId) return;
    try {
      const r = await fetchFn(API(`/api/v1/sessions/${encodeURIComponent(sessionId)}/library/${encodeURIComponent(evento.voceLibreriaId)}/versions`), { credentials: 'same-origin' });
      if (!r.ok || !viva()) return;
      const dati = await r.json();
      if (viva()) disegnaVersioni(dati?.data?.versioni);
    } catch { /* l'etichetta è un di più: senza, la carta mostra comunque la sua versione */ }
  }
  if (versioneDelGiro) {
    const sorella = (e) => {
      if (!card.isConnected) { doc.removeEventListener('talos:artefatto-versione', sorella); return; }
      if (e?.detail?.voceLibreriaId === evento.voceLibreriaId && e.detail.versione !== versioneDelGiro) void rileggiVersioni();
    };
    doc.addEventListener('talos:artefatto-versione', sorella);
  }
  const pronta = (async () => {
    // The caller inserts the card synchronously after creation. Check attachment
    // after that insertion, including legacy events that need no network await.
    await Promise.resolve();
    try {
      let pagina;
      if (Object.hasOwn(evento, 'voceLibreriaId')) {
        if (typeof evento.voceLibreriaId !== 'string' || !ID_LIBRERIA.test(evento.voceLibreriaId)
          || typeof sessionId !== 'string' || !sessionId) throw new Error(t('chat.artifact.savedReferenceInvalid'));
        fonte = fonteDaLibreria({sessionId, voce: {id: evento.voceLibreriaId}, ...(versioneDelGiro ? {versione: versioneDelGiro} : {}),
          fetchFn: (percorso, init) => fetchFn(API(percorso), init)});
        fonteDelGiro = fonte;
        pagina = await fonte.creaPagina();
        if (!paginaValida(pagina)) throw new Error(t('chat.artifact.pageReferenceInvalid'));
        if (!viva()) return;
        stato.hidden = true;
      } else {
        if (typeof evento.id !== 'string' || !evento.id) throw new Error(t('chat.artifact.previewReferenceInvalid'));
        pagina = `/api/v1/artifacts/${encodeURIComponent(evento.id)}`;
        // Old journals have no exact durable association. Do not guess by title.
        stato.textContent = t('chat.artifact.temporary');
      }
      if (!viva()) return;
      indirizzo = API(pagina);
      frame.src = indirizzo;
      frame.hidden = false;
      apri.disabled = false;
      if (versioneDelGiro) {
        void rileggiVersioni();
        doc.dispatchEvent(new (doc.defaultView?.CustomEvent ?? CustomEvent)('talos:artefatto-versione', { detail: { voceLibreriaId: evento.voceLibreriaId, versione: versioneDelGiro } }));
      }
    } catch (errore) {
      if (!viva()) return;
      erroreVisibile(errore instanceof Error ? errore.message : t('chat.artifact.loadFailed'));
      // No volatile fallback: it could display an unrelated or no longer saved copy.
    }
  })();
  return {card, frame, apri, stato, pronta, get apertura() { return apertura; }};
}
