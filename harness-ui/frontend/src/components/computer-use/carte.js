/*
 * FE-016, 063, 064: le carte del computer use sul PC, copiate dal bozzetto (`bozzetto-computer-use-posso`, `consensoCompito`, `cartaInsieme`, scena «sopra», `riprendi`, scena «chi»).
 * Domande e risposte sono quelle delle porte di `ciclo.mjs`:
 *  - `consensoDelCompito`: 'si' | 'sempre' | 'no' (owner 03/11, Computer use b2ca0180f). «Consenti sempre» ricorda i luoghi; pagamenti, password, invio, cancellazione e termini
 *    chiedono comunque la loro carta. Vale anche sul luogo nuovo.
 *  - `chiediPersona({ motivo: 'conferme' })`: 'si' | 'annulla' | { [id]: 'si' | 'no' }. `motivo: 'conferma'` (cassa): 'si' | 'no'. La mano alla persona: 'fatto'.
 * ⛔ Il testo delle pagine (`prova`, nomi dei siti) entra solo come testo. La parola «Consenti per questo compito» non è ancora scelta dall'owner: la carta dice «Consenti».
 */
import { t } from '../lingua.js';
import { creaRigaPosso } from './riga-posso.js';
import { nomeProtezione, paroleDellaFonte } from './parole.js';

const nodo = (doc, tag, classe, testo) => {
  const n = doc.createElement(tag);
  if (classe) n.className = classe;
  if (testo !== undefined && testo !== null) n.textContent = String(testo);
  return n;
};
const bottone = (doc, classe, testo, fare) => {
  const b = nodo(doc, 'button', classe, testo);
  b.type = 'button';
  if (fare) b.addEventListener('click', fare);
  return b;
};
function nome(doc, titolo, sotto) {
  const n = nodo(doc, 'span', 'talos-nome', titolo);
  if (sotto) n.append(nodo(doc, 'small', '', sotto));
  return n;
}
/** Una riga che si preme: titolo, sotto la frase, la freccia. */
function rigaAzione(doc, titolo, sotto, fare) {
  const b = bottone(doc, 'talos-controllo', null, fare);
  const freccia = nodo(doc, 'span', 'talos-freccia', '→');
  freccia.setAttribute('aria-hidden', 'true');
  b.append(nome(doc, titolo, sotto), freccia);
  return b;
}
function rigaDato(doc, titolo, sotto, segno = '✓') {
  const r = nodo(doc, 'div', 'talos-controllo');
  const s = nodo(doc, 'span', 'talos-freccia', segno);
  s.setAttribute('aria-hidden', 'true');
  r.append(nome(doc, titolo, sotto), s);
  return r;
}
function scheda(doc, ...figli) {
  const fuori = nodo(doc, 'div', 'talos-scheda');
  const corpo = nodo(doc, 'div', 'talos-scheda-corpo');
  corpo.append(...figli.filter(Boolean));
  fuori.append(corpo);
  return fuori;
}

/** «84,20 €»: l'euro col suo segno, le altre valute col codice. */
export function testoTotale(t0) {
  const importo = Number(t0.importo).toFixed(2).replace('.', ',');
  return `${importo} ${t0.valuta === 'EUR' ? '€' : t0.valuta}`;
}

function notaDelCompito(posso) {
  if (posso?.pagare !== true) return t('computer.consent.note');
  return t(posso.tetto ? 'computer.consent.noteCap' : 'computer.consent.notePay');
}

/**
 * La carta unica all'inizio del compito, o quella del luogo nuovo (`nuovo`).
 * `tolto`: il luogo era ricordato e la persona l'ha tolto a compito in corso (`ciclo.mjs`, `chiediConsenso({ nuovo, tolto: true })`): può essere
 * del piano, quindi niente «altro sito» né «Non era nel piano» (revisione M del 04/11, D1).
 * @param {{ obiettivo?: string, domini?: {nome: string}[], app?: {nome: string}[], accessi?: {dominio: string}[], posso?: object, nuovo?: {dominio?: string, app?: string}, tolto?: boolean }} d
 * @param {{ document: Document, alRisposta?: (risposta: 'si'|'sempre'|'no') => void, alCambiaPosso?: Function, conSempre?: boolean }} o
 */
export function cartaDelCompito({ obiettivo = '', domini = [], app = [], accessi = [], posso = null, nuovo = null, tolto = false }, { document: doc, alRisposta, alCambiaPosso, conSempre = true }) {
  const risposta = (r) => () => alRisposta?.(r);
  const tornato = Boolean(nuovo) && tolto === true;
  const titolo = !nuovo ? t('computer.consent.title')
    : tornato ? t(nuovo.app ? 'computer.consent.removedApp' : 'computer.consent.removedSite')
      : t(nuovo.app ? 'computer.consent.otherApp' : 'computer.consent.otherSite');
  const carta = nodo(doc, 'section', 'cs');
  carta.setAttribute('role', 'dialog');
  carta.setAttribute('aria-label', titolo);
  const alto = nodo(doc, 'div', 'cs-alto');
  const testa = nodo(doc, 'div', 'cs-testa');
  if (!nuovo && obiettivo) testa.append(nodo(doc, 'p', 'cs-da', t('computer.consent.from', { chat: obiettivo })));
  testa.append(nodo(doc, 'h2', '', titolo));
  const x = bottone(doc, 'cs-x', '✕', risposta('no'));
  x.setAttribute('aria-label', t('chat.common.close'));
  alto.append(testa, x);
  const dl = nodo(doc, 'dl');
  const riga = (voce, valore) => {
    const d = nodo(doc, 'div');
    const dd = nodo(doc, 'dd');
    dd.append(valore);
    d.append(nodo(doc, 'dt', '', voce), dd);
    dl.append(d);
  };
  if (nuovo) {
    riga(t(tornato ? 'computer.consent.where' : nuovo.app ? 'computer.consent.newApp' : 'computer.consent.newSite'), nuovo.app || nuovo.dominio);
  } else {
    riga(t('computer.consent.goal'), obiettivo);
    /* un luogo già ricordato con «Consenti sempre» lo si riconosce: la carta compare perché almeno un altro non lo è */
    const dove = [...domini, ...app].filter((l) => l.nome).map((l) => (l.ricordato ? t('computer.consent.remembered', { nome: l.nome }) : l.nome)).join(', ');
    if (dove) riga(t('computer.consent.where'), dove);
    if (accessi.length) riga(t('computer.consent.access'), t('computer.consent.fromKeychain', { siti: accessi.map((a) => a.dominio).join(', ') }));
    const fila = posso ? creaRigaPosso({ document: doc, voci: posso, tetto: posso.tetto ?? null, alCambia: alCambiaPosso }) : null;
    if (fila) riga(t('computer.can.title'), fila.nodo);
  }
  const bott = nodo(doc, 'div', 'cs-bott');
  bott.append(bottone(doc, 'cs-no', t('computer.consent.deny'), risposta('no')), bottone(doc, 'cs-si', t('computer.consent.allow'), risposta('si')));
  if (conSempre) bott.append(bottone(doc, 'cs-sempre', t('computer.consent.allowAlways'), risposta('sempre')));
  carta.append(alto, nodo(doc, 'p', 'cs-nota', nuovo ? t(tornato ? 'computer.consent.noteRemoved' : 'computer.consent.noteNew') : notaDelCompito(posso)), dl, bott);
  return carta;
}

/**
 * T6: più sì nello stesso momento, una carta sola. La levetta è il «no» per voce.
 * @param {{ voci: {id: number|string, protezione: string, prova?: string, importo?: {importo: number, valuta: string}|null}[] }} d
 * @param {{ document: Document, alRisposta?: (r: 'si'|'annulla'|Record<string, 'si'|'no'>) => void }} o
 */
export function cartaConferme({ voci }, { document: doc, alRisposta }) {
  const spente = new Set();
  const fuori = nodo(doc, 'div', 'cu-conferme');
  const etichetta = () => {
    const accese = voci.length - spente.size;
    if (accese === 0) return t('computer.confirm.fine');
    if (voci.length === 1) return t('computer.confirm.yesOne');
    if (spente.size === 0) return t(voci.length === 2 ? 'computer.confirm.yesBoth' : 'computer.confirm.yesAll');
    return t(voci.length === 2 ? 'computer.confirm.yesOther' : 'computer.confirm.yesOn');
  };
  const rispondi = () => {
    if (spente.size === 0) { alRisposta?.('si'); return; }
    alRisposta?.(Object.fromEntries(voci.map((v) => [v.id, spente.has(v.id) ? 'no' : 'si'])));
  };
  function disegna() {
    const righe = voci.map((v) => {
      const via = spente.has(v.id);
      const r = nodo(doc, 'div', 'talos-controllo cu-voce');
      r.dataset.spenta = String(via);
      const dato = [v.importo ? testoTotale(v.importo) : null, v.prova].filter(Boolean).join(' · ');
      const levetta = bottone(doc, 'talos-levetta', null, () => { if (spente.has(v.id)) spente.delete(v.id); else spente.add(v.id); disegna(); });
      levetta.setAttribute('role', 'switch');
      levetta.setAttribute('aria-checked', String(!via));
      levetta.setAttribute('aria-label', nomeProtezione(v.protezione));
      r.append(nome(doc, nomeProtezione(v.protezione), via ? t('computer.confirm.notDoing') : dato), levetta);
      return r;
    });
    fuori.replaceChildren(scheda(doc, nodo(doc, 'p', 'talos-domanda', t('computer.confirm.ask')), ...righe,
      rigaAzione(doc, etichetta(), t('computer.confirm.continue'), rispondi),
      rigaAzione(doc, t('computer.confirm.stop'), t('computer.common.yours'), () => alRisposta?.('annulla'))));
  }
  disegna();
  return fuori;
}

/** La carta della cassa: totale, dominio e metodo, «vale solo per questo pagamento» (decisione dell'owner del 02/11; condizione 1 del Frontend). Il totale non letto si dice. */
export function cartaCassa({ totale = null, dominio = '', metodo = null, tetto = null }, { document: doc, alRisposta }) {
  const importo = totale ? testoTotale(totale) : null;
  const dove = [dominio, metodo].filter(Boolean).join(', ');
  const frase = !importo ? t('computer.checkout.noTotal')
    : tetto ? t('computer.checkout.overCap', { totale: importo, tetto: testoTotale(tetto) }) : t('computer.checkout.ask', { totale: importo });
  return scheda(doc, nodo(doc, 'p', 'talos-domanda', frase),
    rigaDato(doc, t('computer.checkout.total'), [importo, dove].filter(Boolean).join(' · '), '€'),
    rigaAzione(doc, importo ? t('computer.checkout.pay', { totale: importo }) : t('computer.checkout.payPlain'), t('computer.checkout.once'), () => alRisposta?.('si')),
    rigaAzione(doc, t('computer.checkout.dontPay'), t('computer.checkout.stopHere'), () => alRisposta?.('no')));
}

/** La mano alla persona: mentre è sua TALOS non guarda (`pausa`, motivo 'persona'); solo 'fatto' riprende. */
export function cartaMano({ motivo, ancheIlClic = false }, { document: doc, alRisposta }) {
  const FRASI = {
    'anti-robot': ['computer.hand.robot', 'computer.hand.doneResume', 'computer.hand.recheckPage'],
    'verifica-banca': ['computer.hand.bank', 'computer.hand.done', 'computer.hand.recheckCheckout'],
    'codice-sicurezza': [ancheIlClic ? 'computer.hand.codeAndClick' : 'computer.hand.code', 'computer.hand.done', 'computer.hand.recheckCheckout'],
  };
  const [frase, tasto, sotto] = FRASI[motivo] ?? FRASI['anti-robot'];
  return scheda(doc, nodo(doc, 'p', 'talos-domanda', t(frase)), rigaAzione(doc, t(tasto), t(sotto), () => alRisposta?.('fatto')));
}

/** La carta di fine: per ogni azione delicata, chi l'ha decisa. Niente di delicato, niente carta. */
export function cartaFine({ decisioni = [], spese = [] }, { document: doc, nomePermesso = '' }) {
  if (!decisioni.length) return null;
  const righe = decisioni.map((d) => {
    const spesa = d.protezione === 'pagamento' ? spese.find((s) => s.passo === d.passo) : null;
    const titolo = spesa ? t('computer.end.paid', { totale: testoTotale({ importo: spesa.totale, valuta: spesa.valuta }) })
      : d.azione === 'consenso' ? t('computer.end.consent') : nomeProtezione(d.protezione);
    const resta = spesa && Number.isFinite(spesa.resta) ? t('computer.end.capLeft', { resta: testoTotale({ importo: spesa.resta, valuta: spesa.valuta }) }) : null;
    return rigaDato(doc, d.metodo ? `${titolo} · ${d.metodo}` : titolo, [paroleDellaFonte(d, { nomePermesso }), resta].filter(Boolean).join(' · '));
  });
  return scheda(doc, nodo(doc, 'p', 'talos-domanda', t('computer.end.whoDecided')), ...righe);
}
