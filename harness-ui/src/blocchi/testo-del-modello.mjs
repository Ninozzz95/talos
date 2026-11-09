// La funzione UNICA del testo del modello (interfaccia generativa, catalogo v1, 02/11/2026).
//
// Ogni stringa che il modello scrive dentro un blocco passa da qui prima di arrivare a un disegnatore (PC, telefono, CLI).
// Toglie TUTTI i controlli (\p{Cc}: C0, DEL e C1, quindi ESC, BEL, CSI e OSC: titolo, OSC 8, OSC 52 nel terminale), gli
// invisibili (\p{Cf}: larghezza zero, segni di direzione, tag U+E0000-E007F, BOM, trattino morbido) e i surrogati soli;
// una riga dove serve; tetto di lunghezza in punti di codice con «…». Pura, senza dipendenze, mai lancia.
//
// Fonti (02/11/2026): l'iniezione di sequenze ANSI/OSC dall'uscita dei modelli nei terminali (garak, sonda «ansiescape»;
// avviso su Codex CLI e oy-cli); i tag Unicode e i selettori di variante usati per nascondere istruzioni (arXiv 2510.05025).
// Scelta dichiarata: si tolgono VS1-VS14 (U+FE00-FE0D) e i selettori supplementari (U+E0100-E01EF), si tengono U+FE0E e
// U+FE0F (presentazione testo/emoji), senza i quali le emoji cambiano aspetto. Si tolgono anche ZWJ e ZWNJ (\p{Cf}): le
// emoji composte si vedono separate; è il prezzo della regola «via tutti gli invisibili» della forma approvata.
//
// ⛔ Sostituzioni SEMPRE a funzione (`$&` intatto) e solo espressioni senza ritorni indietro (classi di caratteri).

export const TETTO_DI_SERIE = 200;

// Oltre questa misura si guarda solo l'inizio: il tetto finale è comunque molto più corto, e così il costo resta limitato
// anche per un testo di molti megabyte.
const FATTORE_DI_LETTURA = 8;

const A_CAPO = /\r\n|[\r\u2028\u2029\u0085]/g;
// Controlli (tranne \n, gestito a parte), formato, surrogati soli, riempitivi Hangul, combinatore invisibile, selettori.
const INVISIBILI = /(?!\n)[\p{Cc}\p{Cf}\p{Cs}\u034F\u115F\u1160\u3164\uFFA0\uFE00-\uFE0D\u{E0100}-\u{E01EF}]/gu;
const SPAZI = /\s+/gu;
const SPAZI_IN_RIGA = /[^\S\n]+/gu;
const RIGHE_VUOTE = /\n{3,}/g;

const niente = () => '';
const spazio = () => ' ';
const aCapo = () => '\n';
const dueACapo = () => '\n\n';

function tetto(opzioni) {
  const m = opzioni && opzioni.massimo;
  return Number.isInteger(m) && m > 0 ? m : TETTO_DI_SERIE;
}

/**
 * @param {unknown} valore il testo scritto dal modello
 * @param {{ righe?: 'una'|'piu', massimo?: number }} [opzioni] `righe: 'piu'` tiene gli a capo (massimo una riga vuota)
 * @returns {string} il testo pulito; '' per ogni valore che non è una stringa
 */
export function testoDelModello(valore, opzioni) {
  if (typeof valore !== 'string') return '';
  const massimo = tetto(opzioni);
  const piuRighe = Boolean(opzioni && opzioni.righe === 'piu');
  let testo = valore;
  let tagliatoPrima = false;
  const lettura = massimo * FATTORE_DI_LETTURA + 64;
  if (testo.length > lettura) {
    testo = testo.slice(0, lettura);
    tagliatoPrima = true;
  }
  testo = testo.replace(A_CAPO, aCapo);
  testo = testo.replace(/\t/g, spazio);
  testo = testo.replace(INVISIBILI, niente);
  if (piuRighe) {
    testo = testo.split('\n').map((riga) => riga.replace(SPAZI_IN_RIGA, spazio).trim()).join('\n');
    testo = testo.replace(RIGHE_VUOTE, dueACapo).trim();
  } else {
    testo = testo.replace(SPAZI, spazio).trim();
  }
  return accorcia(testo, massimo, tagliatoPrima);
}

function accorcia(testo, massimo, tagliatoPrima) {
  // Conta in punti di codice senza creare un array: si ferma al primo oltre il tetto.
  let punti = 0;
  let taglio = -1;
  for (let i = 0; i < testo.length; i += 1) {
    const c = testo.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < testo.length) i += 1;
    punti += 1;
    if (punti === massimo - 1) taglio = i + 1;
    if (punti > massimo) break;
  }
  if (punti <= massimo && !tagliatoPrima) return testo;
  const inizio = massimo === 1 ? '' : testo.slice(0, taglio < 0 ? testo.length : taglio).trimEnd();
  return `${inizio}…`;
}
