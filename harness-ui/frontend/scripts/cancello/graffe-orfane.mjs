/*
 * Settimo controllo del cancello: una GRAFFA che chiude un blocco mai aperto.
 *
 * ⛔⛔ 07/9 — nato da un difetto vero, trovato misurando e non leggendo. La barra della selezione
 * delle sessioni aveva la sua regola nel foglio (`display:grid`, bordo, fondo d'accento) e sullo
 * schermo non c'era niente: il browser diceva `display: block`, `padding: 0px`, `border: none`.
 * Causa: sei righe più su era rimasta una `}` ORFANA, resto di una container query cancellata il
 * giorno prima. Per la specifica CSS un `}` inatteso a livello alto viene inghiottito nel PRELUDIO
 * della regola successiva — il selettore diventa `} .talos-sidebar__selezione`, che non è valido, e
 * quella regola viene BUTTATA. Nessun errore, nessun avviso: solo una regola che non c'è più.
 * ⇒ È la stessa forma del tampone rotto a metà foglio del 06/9. Un foglio di stile non protesta:
 *   protesta solo l'occhio, e a volte nemmeno quello, perché quel che manca semplicemente non si
 *   vede. Quindi lo conta una macchina, e lo conta a ogni giro.
 *
 * Ricerca 07/09/2026 — CSS Syntax Module Level 3 §5.4.1 «Consume a qualified rule» e §5.3.6
 * (w3.org/TR/css-syntax-3/): il tokenizer che incontra un `}` fuori posto NON lo salta e non alza
 * un errore; lo consuma dentro il preludio del blocco che segue, e la regola viene scartata se il
 * preludio non è un selettore valido. È esattamente perché il difetto è silenzioso.
 *
 * Puro: prende il testo, torna le righe sospette. Nessun file, nessuna rete.
 */

/** Toglie commenti e stringhe SENZA cambiare il numero di righe (le a-capo restano). */
function ripulisci(css) {
  const senzaCommenti = css.replace(/\/\*[\s\S]*?\*\//g, (pezzo) => pezzo.replace(/[^\n]/g, ' '));
  return senzaCommenti.replace(/"[^"\n]*"|'[^'\n]*'/g, (pezzo) => pezzo.replace(/[^\n]/g, ' '));
}

/**
 * Le graffe che chiudono un blocco mai aperto, con la riga dove stanno.
 * @param {string} css il foglio (o il contenuto di un `<style>`)
 * @returns {{riga:number, intorno:string}[]}
 */
export function graffeOrfane(css) {
  const testo = ripulisci(String(css || ''));
  const righe = String(css || '').split('\n');
  const trovate = [];
  let profondita = 0;
  let riga = 1;
  for (const ch of testo) {
    if (ch === '\n') { riga += 1; continue; }
    if (ch === '{') profondita += 1;
    else if (ch === '}') {
      profondita -= 1;
      if (profondita < 0) {
        trovate.push({ riga, intorno: (righe[riga - 1] || '').trim().slice(0, 90) });
        profondita = 0;   // si riparte da zero: una sola graffa persa non deve accusare tutto il resto
      }
    }
  }
  return trovate;
}

/**
 * Quanti blocchi restano APERTI alla fine: `0` è il foglio sano. Un numero positivo dice che tutto
 * ciò che sta dopo l'ultima apertura è annidato dentro qualcosa, e quasi mai è quello che si voleva.
 * @returns {number}
 */
export function blocchiNonChiusi(css) {
  const testo = ripulisci(String(css || ''));
  let profondita = 0;
  for (const ch of testo) {
    if (ch === '{') profondita += 1;
    else if (ch === '}') profondita = Math.max(0, profondita - 1);
  }
  return profondita;
}

/** I `<style>` dentro un HTML (il mockup ne ha uno solo, ma il controllo non lo dà per scontato). */
export function fogliInterni(html) {
  const fogli = [];
  const rx = /<style[^>]*>([\s\S]*?)<\/style>/g;
  let m;
  while ((m = rx.exec(String(html || ''))) !== null) {
    fogli.push({ css: m[1], rigaIniziale: String(html).slice(0, m.index).split('\n').length });
  }
  return fogli;
}
