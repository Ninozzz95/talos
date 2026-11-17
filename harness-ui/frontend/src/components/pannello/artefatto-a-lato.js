/*
 * 0.2.1-ART D2 (owner 09/11/2026 19:55, bozzetto approvato, variante A): l'artefatto nella scheda «A lato» della colonna destra.
 * Un posto solo, sopra la domanda a parte: la testa col titolo e la ✕, tre pulsanti sempre in vista («Apri a parte», «Copia»,
 * «Scarica»), la pagina. Sotto resta la domanda a parte di sempre. La larghezza è quella della colonna: la sceglie la persona con
 * la maniglia che c'è già (`.talos-resizer--inspector`), qui non c'è niente per allargare.
 *
 * ⛔ La pagina gira nella STESSA cornice blindata dell'anteprima che stava in chat: `sandbox="allow-scripts"` (mai
 *   `allow-same-origin`), `referrerpolicy="no-referrer"`, e l'indirizzo è la rotta col lasciapassare che dà il server (con la sua
 *   CSP). Nessun potere in più. La cornice nasce a ogni apertura e si toglie alla chiusura: una pagina chiusa non gira più.
 * ⛔ «Copia» e «Scarica» non parlano con la cornice: le fa la carta (`artifact-card.js`), che legge il testo dal server.
 * Un artefatto alla volta, come il «right-hand preview rail» di Hermes (`preview-artifact.tsx:221-246`: il titolo, i comandi in
 * testa, la pagina sotto) e il pannello di LibreChat (`Artifacts.tsx:611-627`).
 */
import { t } from '../lingua.js';
import { guardaAnteprima } from '../anteprime-cadute.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ID = 'latoArtefatto';
const CONFERMA_MS = 2000;

/**
 * @param {{ document: Document, posto: HTMLElement, chat?: { perArtefatto?: (aperto: boolean) => void }|null, scheda?: HTMLElement|null,
 *   mostra?: () => void, timer?: { setTimeout: Function, clearTimeout: Function } }} o `posto` è il corpo della scheda «A lato»,
 *   `scheda` la sua linguetta (porta il pallino), `mostra` apre la colonna su quella scheda.
 */
export function creaArtefattoALato({ document: doc, posto, chat = null, scheda = null, mostra = () => {}, timer = globalThis }) {
  const crea = (tag, classe, testo) => { const n = doc.createElement(tag); if (classe) n.className = classe; if (testo !== undefined) n.textContent = testo; return n; };
  const icona = (nome) => {
    const svg = doc.createElementNS(SVG_NS, 'svg'); svg.setAttribute('class', 'i i--sm'); svg.setAttribute('aria-hidden', 'true');
    const uso = doc.createElementNS(SVG_NS, 'use'); uso.setAttribute('href', `#${nome}`); svg.append(uso);
    return svg;
  };

  const nodo = crea('section', 'lato-art');
  nodo.id = ID;
  nodo.hidden = true;
  nodo.setAttribute('aria-label', t('chat.artifact.badge'));
  const testa = crea('div', 'lato-art__testa');
  const nomi = crea('div', 'lato-art__nomi');
  const titolo = crea('div', 'lato-art__titolo talos-truncate');
  const sotto = crea('small', 'lato-art__sotto talos-truncate');
  nomi.append(titolo, sotto);
  const chiudiTasto = crea('button', 'talos-icon-button lato-art__chiudi');
  chiudiTasto.type = 'button';
  chiudiTasto.setAttribute('aria-label', t('chat.artifact.closeAside'));
  chiudiTasto.title = t('chat.artifact.closeAside');
  chiudiTasto.append(icona('i-x'));
  const azioni = crea('div', 'lato-art__azioni');
  const tasto = (classe, chiave, simbolo, aiuto) => {
    const b = crea('button', `talos-button talos-button--sm ${classe}`);
    b.type = 'button';
    if (aiuto) b.title = t(aiuto);
    const etichetta = crea('span', '', t(chiave));
    b.append(icona(simbolo), etichetta);
    azioni.append(b);
    return { b, etichetta, chiave };
  };
  const aParte = tasto('talos-button--primary', 'chat.artifact.openSeparately', 'i-external-link');
  const copia = tasto('talos-button--secondary', 'chat.common.copy', 'i-copy', 'chat.artifact.copyHint');
  const scarica = tasto('talos-button--secondary', 'chat.artifact.download', 'i-download', 'chat.artifact.downloadHint');
  testa.append(nomi, chiudiTasto, azioni);
  nodo.append(testa);
  posto.prepend(nodo);

  /** L'artefatto aperto adesso: la carta che l'ha aperto (`origine`), le sue azioni, e come dirle che è stato chiuso. */
  let corrente = null;
  let cornice = null;
  /* 0.2.2, giro di sicurezza 3 (N1): la guardia della pagina aperta. Nel guscio del PC, se il suo processo cade, una ricarica da sola;
     alla seconda la pagina si toglie e la carta lo dice («Pagina non caricata.» con «Riprova», `anteprime-cadute.js`). */
  let guardia = null;
  const attese = new Map();

  function azzeraConferme() {
    for (const [pezzo, id] of attese) { timer.clearTimeout(id); pezzo.etichetta.textContent = t(pezzo.chiave); }
    attese.clear();
  }

  /** La carta che ha aperto il pannello non è più nella pagina (chat ridisegnata, sessione cambiata): il pannello si chiude da sé. */
  function vivo() {
    if (!corrente) return false;
    if (corrente.origine && corrente.origine.isConnected === false) { chiudi({ fuoco: false }); return false; }
    return true;
  }

  function metti(nome, indirizzo) {
    cornice?.remove();
    cornice = doc.createElement('iframe');
    cornice.className = 'lato-art__cornice';
    cornice.setAttribute('title', nome);
    /* prima `sandbox`, poi l'indirizzo: la pagina non parte mai fuori dalla sabbiera */
    cornice.setAttribute('sandbox', 'allow-scripts');
    cornice.setAttribute('referrerpolicy', 'no-referrer');
    cornice.src = indirizzo;
    nodo.append(cornice);
  }

  /**
   * `caduta()`: la pagina è caduta due volte (Electron); chi ha aperto il pannello lo dice, con «Riprova».
   * `rinnova()`: un indirizzo NUOVO per la stessa pagina (un lasciapassare nuovo). Giro di sicurezza 4 (C4): il lasciapassare scade 30 minuti
   * dopo l'ultimo uso (`src/pagine-lasciapassare.mjs`); la ricarica automatica di una pagina ferma da più tempo finiva in un 404. Come il
   * lettore, la ricarica ne chiede uno nuovo; se non arriva, la pagina si arrende subito (la riga con «Riprova»), mai un'attesa muta.
   */
  function apri({ origine = null, titolo: nome = '', sotto: riga = '', indirizzo, azioni: fai = {}, chiusa = null, caduta = null, rinnova = null }) {
    const stessa = Boolean(corrente) && corrente.origine === origine;
    if (corrente && !stessa) {
      const prima = corrente;
      corrente = null;
      azzeraConferme();
      prima.chiusa?.();
    }
    corrente = { origine, azioni: fai, chiusa, caduta };
    titolo.textContent = nome;
    sotto.textContent = riga;
    sotto.hidden = !riga;
    /* ogni apertura è un gesto: la guardia è nuova, col conto a zero */
    guardia?.ferma();
    metti(nome, indirizzo);
    const arresa = () => { cornice?.remove(); cornice = null; corrente?.caduta?.(); };
    const mia = guardaAnteprima({ finestra: doc.defaultView ?? globalThis, indirizzo: () => cornice?.src,
      ricarica: () => {
        if (typeof rinnova !== 'function') { metti(nome, indirizzo); return; }
        /* la pagina caduta si toglie subito: nell'attesa del lasciapassare nuovo non c'è niente da guardare */
        cornice?.remove(); cornice = null;
        Promise.resolve().then(() => rinnova()).then((nuovo) => {
          if (guardia !== mia) return; // nel frattempo il pannello si è chiuso o è passato a un'altra pagina
          if (typeof nuovo === 'string' && nuovo) metti(nome, nuovo); else arresa();
        }, () => { if (guardia === mia) arresa(); });
      },
      arresa });
    guardia = mia;
    nodo.hidden = false;
    posto.classList.add('talos-inspector__body--artefatto');
    scheda?.setAttribute('data-con-artefatto', '');
    chat?.perArtefatto?.(true);
    origine?.setAttribute?.('aria-controls', ID);
    /* la colonna si apre una volta per apertura: ricaricare la stessa carta (un'altra versione) non la riporta davanti */
    if (!stessa) mostra();
  }

  function chiudi({ fuoco = true } = {}) {
    if (!corrente) return;
    const prima = corrente;
    corrente = null;
    guardia?.ferma();
    guardia = null;
    cornice?.remove();
    cornice = null;
    azzeraConferme();
    nodo.hidden = true;
    posto.classList.remove('talos-inspector__body--artefatto');
    scheda?.removeAttribute('data-con-artefatto');
    chat?.perArtefatto?.(false);
    prima.chiusa?.();
    if (fuoco && prima.origine?.isConnected) prima.origine.focus({ preventScroll: true });
  }

  /** «Copia» e «Scarica»: la conferma sta sul pulsante per due secondi («Copiato»), come nel bozzetto; un errore lo dice la carta. */
  async function conFerma(pezzo, nome, fatto) {
    if (!vivo()) return;
    const di = corrente;
    let riuscito = false;
    try { riuscito = (await di.azioni[nome]?.()) === true; } catch { riuscito = false; }
    if (!riuscito || corrente !== di) return;
    timer.clearTimeout(attese.get(pezzo));
    pezzo.etichetta.textContent = t(fatto);
    attese.set(pezzo, timer.setTimeout(() => { attese.delete(pezzo); pezzo.etichetta.textContent = t(pezzo.chiave); }, CONFERMA_MS));
  }

  aParte.b.addEventListener('click', () => { if (vivo()) void corrente.azioni.apriAParte?.(); });
  copia.b.addEventListener('click', () => { void conFerma(copia, 'copia', 'chat.common.copied'); });
  scarica.b.addEventListener('click', () => { void conFerma(scarica, 'scarica', 'chat.artifact.downloaded'); });
  chiudiTasto.addEventListener('click', () => chiudi());

  return {
    nodo,
    id: ID,
    apri,
    chiudi,
    /** Porta davanti la colonna sulla scheda «A lato» (l'artefatto è già aperto). */
    mostra: () => mostra(),
    /** La riga sotto il titolo cambia (un'altra versione è nata) senza ricaricare la pagina. */
    sottotitolo(origine, riga) {
      if (!corrente || corrente.origine !== origine) return;
      sotto.textContent = riga;
      sotto.hidden = !riga;
    },
    get aperto() { return Boolean(corrente); },
  };
}
