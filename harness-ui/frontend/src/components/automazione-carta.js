/**
 * automazione-carta.js — la carta in chat quando il MODELLO crea, cambia, accende o fa partire un'automazione (automazioni a
 * due porte, owner 08/10/2026 notte, punti 3 e 6). È la stessa carta d'approvazione di casa (`creaApprovazione`): qui stanno
 * solo le parole e il blocco con la bozza, perché la persona veda CHE COSA approva prima di dire sì.
 *
 * ⛔ Le tre risposte sono Approva · Modifica · Annulla (Claude Code e Codex fanno lo stesso: la bozza si mostra, si corregge,
 *   si conferma). «Modifica» c'è solo dove c'è una bozza da correggere: crea e modifica. Riprendi ed esegui ora sono un sì o
 *   un no.
 * ⛔ Mai il valore grezzo a schermo: l'orario in parole, il modello col suo nome umano, il permesso con la sua etichetta.
 */
import { t as traduci, tn } from './lingua.js';
import { etichettaPermesso, nomeModelloUmano } from './chat-foot.js';
import { parolePianificazione, dataBreve, minacciaInParole, segmentoDelCodice as segmento } from './automazioni-v2.js';

export const ATTREZZI_CON_CARTA = Object.freeze(['automation_create', 'automation_update', 'automation_resume', 'automation_run']);
export const eCartaAutomazione = (azione) => ATTREZZI_CON_CARTA.includes(azione?.tipo);
/** «Modifica» ha senso solo dove la carta porta una bozza da correggere. */
export const cartaModificabile = (azione) => azione?.tipo === 'automation_create' || azione?.tipo === 'automation_update';

function el(doc, tag, classe, testo) { const n = doc.createElement(tag); if (classe) n.className = classe; if (testo !== undefined) n.textContent = testo; return n; }
function kv(doc, k, v) { const n = el(doc, 'div', 'talos-kv'); n.append(el(doc, 'span', 'talos-kv__k', k), el(doc, 'span', 'talos-kv__v', v)); return n; }

const ETICHETTE = Object.freeze({
  nome: 'sezioni.automations.v2.sheet.name',
  istruzioni: 'sezioni.automations.v2.row.instructions',
  pianificazione: 'sezioni.automations.v2.sheet.when',
  cartella: 'sezioni.automations.v2.row.folder',
  modello: 'sezioni.automations.row.model',
  permessi: 'sezioni.automations.v2.row.permissions',
  coordinazione: 'app.automations.coordination',
  ripeti: 'sezioni.automations.v2.row.repeat',
  prossimaEsecuzione: 'sezioni.automations.v2.card.firstRun',
});

/** Un campo della bozza in parole. */
export function valoreInParole(campo, valore) {
  if (campo === 'pianificazione') return parolePianificazione(valore);
  if (campo === 'modello') return typeof valore === 'string' && valore.trim() ? (nomeModelloUmano(valore) || valore) : traduci('sezioni.automations.modelServerDefault');
  if (campo === 'permessi') return etichettaPermesso(valore);
  if (campo === 'coordinazione') return traduci(valore === true ? 'sezioni.automations.v2.card.on' : 'sezioni.automations.v2.card.off');
  // le parole della riga («Finché non la spegni»): la carta parla alla persona come la pagina, non come il foglio
  if (campo === 'ripeti') return valore === null || valore === undefined ? traduci('sezioni.automations.v2.row.repeatForever')
    : valore === 1 ? traduci('sezioni.automations.v2.sheet.repeatOnce') : tn('sezioni.automations.v2.sheet.repeatTimesOne', 'sezioni.automations.v2.sheet.repeatTimesMany', valore);
  if (campo === 'prossimaEsecuzione') return valore ? dataBreve(valore) : traduci('sezioni.automations.v2.row.nextNone');
  return typeof valore === 'string' ? valore : String(valore ?? '');
}

/** Badge, bersaglio (il nome) e la frase del perché. */
export function testiCartaAutomazione(azione) {
  const nome = azione?.bozza?.nome ?? azione?.automazione?.nome ?? '';
  const frase = {
    automation_create: 'sezioni.automations.v2.card.create',
    automation_update: 'sezioni.automations.v2.card.update',
    automation_resume: 'sezioni.automations.v2.card.resume',
    automation_run: 'sezioni.automations.v2.card.run',
  }[azione?.tipo];
  return {
    badge: traduci('sezioni.automations.v2.card.badge'),
    bersaglio: nome,
    perche: frase ? traduci(frase, { name: nome }) : '',
    motivo: traduci('sezioni.automations.v2.card.why'),
  };
}

/* Il nome della cartella, non il percorso: il percorso intero è già nella riga «Cartella» della bozza (foto dal vivo dell'08/10
   sera: lo stesso percorso lungo tre volte in una carta) */
const nomeCartella = (percorso) => String(percorso ?? '').replace(/[\\/]+$/u, '').split(/[\\/]/u).pop() || String(percorso ?? '');

/** Una riga «oltre la chat» in parole (decisione 12 dell'owner, 08/10/2026 sera). */
export function avvisoInParole(avviso) {
  const chiave = `sezioni.automations.v2.card.beyond.${segmento(avviso?.codice)}`;
  if (avviso?.codice === 'permessi-piu-ampi') return traduci(chiave, { before: etichettaPermesso(avviso.chat), after: etichettaPermesso(avviso.bozza) });
  if (avviso?.codice === 'altra-cartella' || avviso?.codice === 'cartella-mai-aperta' || avviso?.codice === 'altra-cartella-mai-aperta') {
    return traduci(chiave, { folder: nomeCartella(avviso.bozza) });
  }
  return traduci(chiave);
}

/* Un'altra cartella che è anche mai aperta è UNA notizia sola sulla stessa cartella: una riga, non due */
function unisciCartella(oltre) {
  const altra = oltre.find((a) => a.codice === 'altra-cartella');
  const mai = oltre.find((a) => a.codice === 'cartella-mai-aperta');
  if (!altra || !mai) return oltre;
  return oltre.filter((a) => a !== mai).map((a) => (a === altra ? { ...altra, codice: 'altra-cartella-mai-aperta' } : a));
}

/**
 * Gli avvisi in testa al blocco, PRIMA della bozza: ciò che va oltre la chat in un riquadro d'avviso, le istruzioni che
 * sembrano un'iniezione in un riquadro di pericolo (decisioni 12-13). Riusa `talos-callout`, l'avviso che il progetto ha già.
 * Niente avvisi ⇒ niente riquadri (una carta normale resta com'era).
 */
function creaAvvisi(doc, avvisi) {
  const fuori = [];
  const oltre = unisciCartella(Array.isArray(avvisi?.oltre) ? avvisi.oltre : []);
  const minacce = Array.isArray(avvisi?.minacce) ? avvisi.minacce : [];
  if (minacce.length) {
    const r = el(doc, 'div', 'talos-callout talos-callout--pericolo talos-approval__avvisi');
    r.dataset.avvisiAutomazione = 'minacce';
    r.setAttribute('role', 'alert');
    const corpo = el(doc, 'div', 'talos-approval__avvisi-corpo');
    corpo.append(el(doc, 'b', '', traduci('sezioni.automations.v2.card.threatsTitle')));
    const lista = el(doc, 'ul', 'talos-approval__avvisi-lista');
    for (const codice of minacce) lista.append(el(doc, 'li', '', minacciaInParole(codice)));
    corpo.append(lista);
    r.append(corpo);
    fuori.push(r);
  }
  if (oltre.length) {
    const r = el(doc, 'div', 'talos-callout talos-approval__avvisi');
    r.dataset.avvisiAutomazione = 'oltre';
    const corpo = el(doc, 'div', 'talos-approval__avvisi-corpo');
    corpo.append(el(doc, 'b', '', traduci('sezioni.automations.v2.card.beyondTitle')));
    const lista = el(doc, 'ul', 'talos-approval__avvisi-lista');
    for (const avviso of oltre) {
      const li = el(doc, 'li', '', avvisoInParole(avviso));
      li.dataset.avviso = avviso.codice;
      lista.append(li);
    }
    corpo.append(lista);
    r.append(corpo);
    fuori.push(r);
  }
  return fuori;
}

/**
 * Il blocco con la bozza. Crea: tutti i campi. Modifica: solo ciò che cambia, «prima → dopo». Riprendi: quando gira.
 * Esegui ora: dove e con che cosa gira, e il contesto in più se il modello ne ha passato uno. In testa, gli avvisi.
 */
export function creaBloccoCartaAutomazione(doc, azione) {
  const blocco = el(doc, 'div', 'talos-approval__automazione');
  blocco.dataset.bozzaAutomazione = azione?.tipo ?? ''; // non `cartaAutomazione`: quello è della carta, e un selettore troverebbe due elementi
  blocco.append(...creaAvvisi(doc, azione?.avvisi));
  if (azione?.tipo === 'automation_create') {
    const b = azione.bozza ?? {};
    blocco.append(kv(doc, traduci(ETICHETTE.pianificazione), valoreInParole('pianificazione', b.pianificazione)));
    const testo = el(doc, 'div', 'talos-approval__automazione-istruzioni');
    testo.append(el(doc, 'span', 'talos-kv__k', traduci(ETICHETTE.istruzioni)), el(doc, 'p', 'talos-automation__istruzioni-testo', b.istruzioni ?? ''));
    blocco.append(testo);
    for (const campo of ['cartella', 'modello', 'permessi', 'coordinazione', 'ripeti', 'prossimaEsecuzione']) {
      if (campo === 'prossimaEsecuzione' && b.pianificazione?.tipo === 'manuale') continue;
      blocco.append(kv(doc, traduci(ETICHETTE[campo]), valoreInParole(campo, b[campo])));
    }
  } else if (azione?.tipo === 'automation_update') {
    const prima = azione.prima ?? {}; const dopo = azione.dopo ?? {};
    for (const campo of Object.keys(ETICHETTE)) {
      if (!(campo in dopo)) continue;
      if (campo === 'istruzioni') {
        const testo = el(doc, 'div', 'talos-approval__automazione-istruzioni');
        testo.append(el(doc, 'span', 'talos-kv__k', traduci(ETICHETTE.istruzioni)), el(doc, 'p', 'talos-automation__istruzioni-testo', dopo.istruzioni ?? ''));
        blocco.append(testo);
        continue;
      }
      blocco.append(kv(doc, traduci(ETICHETTE[campo]), traduci('sezioni.automations.v2.card.change', { before: valoreInParole(campo, prima[campo]), after: valoreInParole(campo, dopo[campo]) })));
    }
  } else if (azione?.tipo === 'automation_resume') {
    blocco.append(kv(doc, traduci(ETICHETTE.pianificazione), valoreInParole('pianificazione', azione.automazione?.pianificazione)));
  } else if (azione?.tipo === 'automation_run') {
    const a = azione.automazione ?? {};
    for (const campo of ['cartella', 'modello', 'permessi', 'coordinazione']) blocco.append(kv(doc, traduci(ETICHETTE[campo]), valoreInParole(campo, a[campo])));
    if (typeof azione.contesto === 'string' && azione.contesto) {
      const testo = el(doc, 'div', 'talos-approval__automazione-istruzioni');
      testo.append(el(doc, 'span', 'talos-kv__k', traduci('sezioni.automations.v2.card.context')), el(doc, 'p', 'talos-automation__istruzioni-testo', azione.contesto));
      blocco.append(testo);
    }
  }
  return blocco;
}
