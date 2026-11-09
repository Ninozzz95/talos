/*
 * Il guscio dei blocchi dell'interfaccia generativa sul PC (catalogo v1, blocco 2 della forma §7, 02/11/2026).
 *
 * Copiato dal bozzetto approvato (`frontend/in-corso/bozzetto-ui-generativa/pc.js:16-21`, `stile-pc.css:1-20`):
 *   - guscio A (consigliato): un solo guscio, fondo `--talos-panel-soft`, raggio 12, nessun bordo, le azioni FUORI, sotto
 *     (Hermes `apps/desktop/DESIGN.md:361-366`); a destra della stessa riga la provenienza «Dati: … · quando»;
 *   - guscio B: bordo tenue con la testata che porta titolo e azioni; sotto resta solo la provenienza (nel bozzetto spariva anche lei:
 *     la provenienza sul pulsante è una decisione dell'owner del 31/10, non si perde).
 * Scena 8 (FE-080, 05/11/2026, variante A dell'owner): le azioni non stanno più in fila sotto ma nel menu «⋯» della testata e nel
 * tasto destro (`menu-del-blocco.js`): «Apri a lato», «Tutto schermo», «Salva in Libreria» (ognuna solo se l'aggancio la sa fare),
 * «Copia», che copia il RIPIEGO TESTUALE del nucleo (`ripiegoTestuale`: lo stesso testo che il telefono usa per copia e lettura ad
 * alta voce, condizione 3 del Mobile), ed «Esporta» (`esporta.js`). Sotto restano i tasti del blocco stesso, la conferma in riga e la
 * provenienza.
 *
 * Il ritmo: `montaBloccoVivo` dà i pezzi al lettore (lineare, costo per pezzo) e DISEGNA al più ogni 33 ms, il ritmo che la chat ha già
 * (`legacy/app.js:1798`, `setTimeout(flushMessaggiStreaming, 33)`; pavimento di Hermes): mai un disegno per pezzo (condizione 1 di
 * Performance). L'istantanea del lettore costa quanto il blocco: si chiede solo al momento del disegno.
 * ⛔ Nessun clic prima di «completo» (condizione del Mobile, 02/11): mentre arriva, scelte e modulo sono spenti.
 */
import { crea } from '../../../../src/blocchi/lettore.mjs';
import { creaStorico, nomeDalRecinto, scriviSorgente, tornaAllaVersione, versioneCorrente } from '../../../../src/blocchi/versioni.mjs';
import { t } from '../lingua.js';
import { puoAgire, statoAzione } from './azione.js';
import { el } from './comune.js';
import { azioniDelBlocco, creaMenuDelBlocco } from './menu-del-blocco.js';
import { scaricaFile } from '../codice-esporta.js';
import { creaRigaInArrivo } from './in-arrivo.js';
import { disegnaRotto } from './rotto.js';
import { disegnaTabella, statoTabella } from './tabella.js';
import { disegnaGrafico } from './grafico.js';
import { disegnaScelte } from './scelte.js';
import { disegnaModulo } from './modulo.js';
import { disegnaChiaveValore } from './chiave-valore.js';
import { disegnaPassi } from './passi.js';
import { disegnaAvviso } from './avviso.js';
import { disegnaCursore } from './cursore.js';
import { disegnaMetriche } from './metriche.js';
import { disegnaConfronto } from './confronto.js';
import { disegnaDiagramma } from './diagramma.js';

/*
 * ⛔ LA SCELTA DEL DISEGNO, IN UN POSTO SOLO. Le decide l'owner DOPO la prova nel browser (forma §7, punto 2; brief del blocco 2):
 *   - `guscio`: 'a' (consigliato: senza bordo, azioni sotto) oppure 'b' (bordo tenue, azioni in testata);
 *   - `versione`: 'equilibrata' (quella di sempre) oppure 'spinta' (densità da strumento: cifre in colonna, meno aria; `blocchi.css`).
 *   Fino ad allora: A ed equilibrata. Cambiare qui cambia ogni blocco del PC; il CSS legge `gu--a`/`gu--b` e `data-versione`.
 */
export const SCELTA_DEL_DISEGNO = Object.freeze({ guscio: 'a', versione: 'equilibrata' });

/** Il ritmo del disegno mentre un blocco arriva, in ms: quello della chat. */
export const RITMO_DEL_DISEGNO_MS = 33;

const DISEGNATORI = Object.freeze({
  tabella: disegnaTabella,
  grafico: disegnaGrafico,
  scelte: disegnaScelte,
  modulo: disegnaModulo,
  'chiave-valore': disegnaChiaveValore,
  passi: disegnaPassi,
  avviso: disegnaAvviso,
  /* catalogo v2 (ledger G-C, scene 7 e 9) */
  cursore: disegnaCursore,
  metriche: disegnaMetriche,
  confronto: disegnaConfronto,
  diagramma: disegnaDiagramma,
});

/** Lo stato di un blocco che vive fuori dai dati e si passa a ogni sua vista (in linea, a lato, a tutto schermo). */
export function statoDelBlocco() {
  return { tabella: statoTabella(), azione: statoAzione() };
}

/**
 * Il disegno del corpo di un blocco, completo o parziale. `risultato` completo ⇒ filtro e ordine accesi; i clic che diventano
 * messaggi (scelte, modulo) solo se `puoAgire` (completo, senza `fonte`).
 */
function corpoDel(blocco, opzioni, risultato) {
  const disegna = DISEGNATORI[blocco?.tipo];
  if (!disegna) return null;
  const quando = opzioni.quandoAgisce;
  const completo = risultato?.stato === 'completo';
  return disegna(blocco, {
    document: opzioni.document,
    /* `soloLettura` (decisione 142): il blocco riaperto dalla Libreria è vivo (filtro, ordine) ma un clic non ha una conversazione a cui andare */
    interattivo: blocco.tipo === 'scelte' || blocco.tipo === 'modulo' ? !opzioni.soloLettura && completo && puoAgire(risultato) : completo,
    stato: blocco.tipo === 'tabella' ? opzioni.stato.tabella : opzioni.stato.azione,
    origine: opzioni.origine,
    quandoScelto: quando,
    quandoInviato: quando,
    scrivoIo: opzioni.scrivoIo,
    /* revisione J, D4 (04/11): in sola lettura niente frase che promette un clic («Un clic manda la tua scelta…») */
    soloLettura: Boolean(opzioni.soloLettura),
  });
}

function provenienza(doc, fonte, apriFonte) {
  const s = el(doc, 'span', 'gu__fonte');
  s.append(doc.createTextNode(`${t('blocchi.source.label')} `));
  if (typeof apriFonte === 'function') {
    const b = el(doc, 'button', '', fonte.nome);
    b.type = 'button';
    b.dataset.fonte = '';
    b.setAttribute('title', t('blocchi.source.open'));
    b.addEventListener('click', () => apriFonte(fonte));
    s.append(b);
  } else {
    s.append(el(doc, 'span', 'gu__fonte-nome', fonte.nome));
  }
  if (fonte.quando) s.append(doc.createTextNode(` · ${fonte.quando}`));
  return s;
}

/**
 * Le azioni del blocco completo nel menu «⋯» (scena 8): solo quelle che chi lo monta sa fare, più «Copia» del ripiego testuale ed
 * «Esporta». La conferma in riga (`gu-fatto`, ruolo status) sta sotto, prima della provenienza, e se ne va da sola.
 */
function menuDel(doc, blocco, opzioni, contesto) {
  const { lato, schermo, libreria } = opzioni.azioni || {};
  const timer = opzioni.timer || globalThis;
  const fatto = el(doc, 'span', 'gu-fatto');
  fatto.setAttribute('role', 'status');
  let via = null;
  const conferma = (testo) => {
    fatto.textContent = testo;
    timer.clearTimeout(via);
    via = timer.setTimeout(() => { fatto.textContent = ''; }, 4000);
  };
  const azioni = azioniDelBlocco(blocco, {
    lato, schermo, libreria, contesto, copia: opzioni.copia, ora: opzioni.ora,
    scarica: opzioni.scarica || ((file) => scaricaFile(doc, file)),
    ...versioniDel(contesto.nodo, blocco, opzioni),
  });
  const menu = creaMenuDelBlocco(doc, azioni, { valore: blocco.id, conferma });
  /* revisione J, D7 (04/11): a ogni disegno la voce ricorda «In Libreria · vN» (`in-libreria.js`, `ricorda`) */
  contesto.voci = menu.voci; // il salvataggio scrive «In Libreria · vN» nello stato della voce, che vive anche a menu chiuso
  if (menu.voci.libreria && typeof libreria.ricorda === 'function') libreria.ricorda(blocco, { ...contesto, tasto: menu.voci.libreria });
  return { menu, fatto };
}

/**
 * G-B2 (FE-081, scenes 1+4): the versions of the block in this shell. The history comes from the host (`opzioni.storico`, rebuilt from
 * the `talos.blocco.versione` events) or starts here at v1; it lives on the shell, so a redraw keeps it. A local change (view, back to
 * v1) redraws the same shell and tells the host (`opzioni.quandoCambiaVersione`), with no network call.
 */
function nomeDelBlocco(opzioni) {
  if (typeof opzioni.nome === 'string' && opzioni.nome) return opzioni.nome;
  return nomeDalRecinto(String(opzioni.testo ?? '').split(String.fromCharCode(10), 1)[0]) ?? '';
}
function storicoDel(section, blocco, opzioni) {
  if (!section.__storico) section.__storico = opzioni.storico ?? creaStorico(blocco, nomeDelBlocco(opzioni) || String(blocco.id ?? ''), {});
  return section.__storico;
}
function versioniDel(section, blocco, opzioni) {
  if (!section || !blocco) return {};
  const doc = opzioni.document;
  const cambia = (nuovo) => {
    if (!nuovo || nuovo === section.__storico) return;
    section.__storico = nuovo;
    const corrente = versioneCorrente(nuovo);
    riempi(section, { stato: 'completo', blocco: corrente.blocco }, opzioni);
    opzioni.quandoCambiaVersione?.(nuovo, corrente);
  };
  const apriSotto = (classe, crea) => {
    const gia = section.querySelector(`.${classe}`);
    if (gia) { gia.remove(); return; }
    section.querySelector('.gu__corpo')?.append(crea());
  };
  return {
    versioni: { storico: () => storicoDel(section, blocco, opzioni), cambia },
    mostraTesto: (testo) => apriSotto('gu__sorgente', () => {
      const pre = el(doc, 'pre', 'gu__sorgente', testo);
      pre.setAttribute('aria-label', t('blocchi.versions.textLabel'));
      return pre;
    }),
    mostraVersioni: (storico) => apriSotto('gu__versioni', () => {
      const ol = el(doc, 'ol', 'gu__versioni');
      ol.setAttribute('aria-label', t('blocchi.versions.listLabel'));
      const qui = versioneCorrente(storico)?.versione;
      for (const v of storico.voci) {
        const li = el(doc, 'li', 'gu__versione-voce');
        const b = el(doc, 'button', 'gu__versione-tasto', t('blocchi.versions.item', { n: v.versione, what: v.cosaECambiato || '' }) + (v.versione === qui ? ` ${t('blocchi.versions.current')}` : ''));
        b.type = 'button';
        b.dataset.versione = String(v.versione);
        if (v.versione === qui) b.setAttribute('aria-current', 'true');
        b.addEventListener('click', () => { cambia(tornaAllaVersione(storico, v.versione)); });
        li.append(b);
        ol.append(li);
      }
      return ol;
    }),
  };
}

/**
 * Riempie (o riempie di nuovo) il guscio `section` con un risultato del lettore.
 * @param {HTMLElement} section il guscio
 * @param {object} risultato `{ stato: 'completo'|'rotto'|'in-arrivo', blocco?, motivo?, parziale?, tipo? }`
 * @param {object} opzioni vedi `disegnaBlocco`
 * @param {{ riga?: object }} [vivo] la riga in arrivo da tenere (stesso nodo: i secondi non ripartono)
 */
function titoloDalloStorico(storico, blocco) {
  const voci = Array.isArray(storico?.voci) ? storico.voci : [];
  const qui = voci.findIndex((v) => v?.blocco === blocco);
  for (let i = (qui >= 0 ? qui : voci.length) - 1; i >= 0; i--) if (voci[i]?.blocco?.titolo) return voci[i].blocco.titolo;
  return '';
}

function riempi(section, risultato, opzioni, vivo = {}) {
  const doc = opzioni.document;
  const { guscio, versione } = opzioni.scelta || SCELTA_DEL_DISEGNO;
  const stato = risultato?.stato || 'rotto';
  const blocco = stato === 'completo' ? risultato.blocco : (stato === 'in-arrivo' ? risultato.parziale : null);
  section.className = `gu gu--${guscio === 'b' ? 'b' : 'a'}`;
  section.dataset.versione = versione === 'spinta' ? 'spinta' : 'equilibrata';
  section.dataset.stato = stato;
  const tipo = blocco?.tipo || risultato?.tipo || '';
  if (tipo) section.dataset.tipo = tipo; else delete section.dataset.tipo;
  if (blocco?.id) section.dataset.blocco = blocco.id;
  /* G-B2: the name TALOS gave the block (`nome=bN` in the fence, or from the host): G2 keys on it */
  const nome = nomeDelBlocco(opzioni) || section.__storico?.nome || '';
  if (nome) section.dataset.nome = nome; else delete section.dataset.nome;
  if (stato === 'in-arrivo') section.setAttribute('aria-busy', 'true'); else section.removeAttribute('aria-busy');
  /* decision 398 (owner 08/11): a version without a title of its own keeps the one of the last version that had one, instead of an
     empty header. The history is `{ voci: [{ versione, blocco, … }] }` (`src/blocchi/versioni.mjs:145-153`); the search starts at the
     version shown (the same object `__storicoDalServer` hands here) and goes back. Hermes falls back rather than going blank
     (`apps/desktop/src/app/chat/session-draft-title.tsx:20`). */
  const titolo = blocco?.titolo || (stato === 'completo' ? titoloDalloStorico(section.__storico || opzioni.storico, blocco) : '');
  if (titolo) section.setAttribute('aria-label', titolo); else section.removeAttribute('aria-label');

  const corpo = el(doc, 'div', 'gu__corpo');
  const testa = el(doc, 'div', 'gu__testa');
  if (titolo && !opzioni.senzaTitolo) testa.append(el(doc, 'h3', 'gu__titolo', titolo)); // a lato e a tutto schermo il titolo sta nella testata della vista
  /* G-B2: «vN · what changed» under the title, only past v1 */
  const corrente = stato === 'completo' && (section.__storico || opzioni.storico) ? versioneCorrente(section.__storico || opzioni.storico) : null;
  const etichetta = corrente && corrente.versione > 1 ? el(doc, 'p', 'gu__versione', corrente.cosaECambiato
    ? t('blocchi.versions.label', { n: corrente.versione, what: corrente.cosaECambiato }) : t('blocchi.versions.labelBare', { n: corrente.versione })) : null;
  const dentro = el(doc, 'div', 'gu__dentro');
  const sotto = el(doc, 'div', 'gu__sotto');
  if (stato === 'completo') {
    const c = corpoDel(blocco, opzioni, risultato);
    if (c) dentro.append(c);
    /* i tasti del blocco stesso (il «Cerca» del modulo, «Scrivo io», la sua frase) stanno sempre sotto e per primi, in tutti e due i gusci */
    const proprie = c?.azioniDelBlocco || [];
    sotto.append(...proprie.filter((x) => x.tagName?.toLowerCase() === 'button'));
    /* scena 8, variante A dell'owner: in tutti e due i gusci le azioni stanno nel «⋯» della testata; sotto la conferma e la fonte */
    const { menu, fatto } = menuDel(doc, blocco, opzioni, { risultato, opzioni, nodo: section });
    testa.append(menu.nodo);
    sotto.append(fatto);
    /* il tasto destro apre lo stesso menu dove sta il puntatore. `completo` arriva una volta sola per guscio (`disegnaBlocco`, e
       `montaBloccoVivo` lo chiude una volta), quindi l'ascoltatore è uno. ⛔ Si ferma SEMPRE, anche nei campi di testo: senza
       fermarlo il tasto destro saliva alla risposta e il suo menu («Riprova», «Elimina») si apriva insieme — la stessa cura del 25/10
       sulle righe dei passi (`app.js:15921-15925`, «due menu insieme»). */
    section.__menu = menu; // G-B2: a version change redraws the same shell; the listener stays one and opens the menu of now
    /* G-B3: a history that comes from the server (the name bound to its v1, a model v2, a reload) redraws the same shell in place; it is
       NOT a local change, so the host is not told again */
    section.__storicoDalServer = (nuovo) => {
      if (!nuovo?.voci?.length) return;
      section.__storico = nuovo;
      riempi(section, { stato: 'completo', blocco: versioneCorrente(nuovo).blocco }, opzioni);
    };
    if (!section.__conMenu) section.__conMenu = true, section.addEventListener('contextmenu', (ev) => {
      const menu = section.__menu;
      ev.stopPropagation();
      /* in un campo di testo (il modulo) resta il menu del sistema: incolla, controllo ortografico */
      if (ev.target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
      ev.preventDefault();
      menu.apri('prima', Number.isFinite(ev.clientX) ? { x: ev.clientX, y: ev.clientY } : undefined);
    });
    /* la frase del blocco va a destra, dove sta la provenienza (`gu__fonte`): un blocco con la frase non ha mai la fonte */
    sotto.append(...proprie.filter((x) => x.tagName?.toLowerCase() !== 'button'));
    if (blocco.fonte) sotto.append(provenienza(doc, blocco.fonte, opzioni.apriFonte));
  } else if (stato === 'in-arrivo') {
    const c = blocco ? corpoDel(blocco, opzioni, risultato) : null;
    if (c) dentro.append(c);
    if (vivo.riga) dentro.append(vivo.riga.nodo);
  } else {
    dentro.append(disegnaRotto(risultato?.motivo, { document: doc, testo: opzioni.testo || '', bloccoCodice: opzioni.bloccoCodice }));
  }
  if (testa.children.length || testa.childNodes?.length) corpo.append(testa);
  if (etichetta) corpo.append(etichetta);
  corpo.append(dentro);
  const figli = [corpo];
  if (sotto.children.length || sotto.childNodes?.length) figli.push(sotto);
  section.replaceChildren(...figli);
  return section;
}

/**
 * Un blocco già letto (completo o rotto), per i messaggi chiusi e le riaperture.
 * @param {object} risultato il risultato del lettore
 * @param {{ document: Document, stato?: ReturnType<typeof statoDelBlocco>, origine?: string, testo?: string,
 *   quandoAgisce?: (azione: object) => void, scrivoIo?: () => void, apriFonte?: (fonte: object) => void,
 *   azioni?: { lato?: Function, schermo?: Function, libreria?: Function }, senzaTitolo?: boolean, copia?: (testo: string) => unknown,
 *   bloccoCodice?: (testo: string) => Node, scelta?: { guscio: 'a'|'b', versione: 'equilibrata'|'spinta' }, timer?: object,
 *   soloLettura?: boolean }} opzioni
 */
export function disegnaBlocco(risultato, opzioni) {
  const o = { ...opzioni, stato: opzioni.stato || statoDelBlocco() };
  return riempi(el(o.document, 'section'), risultato, o);
}

/**
 * Un blocco che arriva a pezzi: il guscio c'è subito, quello che è arrivato si disegna al ritmo di 33 ms, la riga in arrivo dice cosa
 * e da quanti secondi; a `fine()` il blocco completo (o rotto) prende il posto, nello STESSO elemento.
 * @param {object} opzioni come `disegnaBlocco`, più `fonte` (la provenienza nota all'ospite: vince sul modello e vieta i clic)
 * @returns {{ nodo: HTMLElement, aggiungi: (pezzo: string) => void, fine: () => object, ferma: () => void, readonly disegni: number }}
 */
export function montaBloccoVivo(opzioni) {
  const o = { ...opzioni, stato: opzioni.stato || statoDelBlocco() };
  const timer = o.timer || globalThis;
  const lettore = crea(o.fonte ? { fonte: o.fonte } : undefined);
  const pezzi = [];
  const riga = creaRigaInArrivo(o.document, { timer });
  const nodo = el(o.document, 'section');
  let atteso = null, finito = null, disegni = 0;

  const chiudi = (risultato) => {
    if (finito) return finito;
    finito = risultato;
    if (atteso !== null) { timer.clearTimeout(atteso); atteso = null; }
    riga.ferma();
    riempi(nodo, risultato, { ...o, testo: pezzi.join('') });
    disegni += 1;
    return finito;
  };
  const disegna = () => {
    atteso = null;
    if (finito) return;
    const ist = lettore.istantanea();
    if (ist.stato !== 'in-arrivo') { chiudi(ist); return; }
    riga.tipo(ist.parziale?.tipo || ist.tipo || null);
    riempi(nodo, ist, o, { riga });
    disegni += 1;
  };
  riga.tipo(null);
  riempi(nodo, { stato: 'in-arrivo', parziale: null, tipo: null }, o, { riga });

  return {
    nodo,
    aggiungi(pezzo) {
      if (finito) return;
      pezzi.push(typeof pezzo === 'string' ? pezzo : '');
      const r = lettore.aggiungi(pezzo);
      if (r.stato === 'rotto') { chiudi(r); return; }
      if (atteso === null) atteso = timer.setTimeout(disegna, RITMO_DEL_DISEGNO_MS);
    },
    fine() { return chiudi(lettore.fine()); },
    /** Il blocco lasciato a metà (il giro fermato, la sessione cambiata): niente più disegni né secondi. */
    ferma() { if (atteso !== null) { timer.clearTimeout(atteso); atteso = null; } riga.ferma(); },
    get disegni() { return disegni; },
  };
}
