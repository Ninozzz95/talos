/*
 * Il nome di una sessione col suo numero di doppione sempre in vista — owner, 15/10/2026 sera («Sì, il numero sempre visibile»):
 * nella barra e nella testata il «-2» resta a schermo anche quando il titolo non ci sta; si tronca la parte PRIMA del numero.
 *
 * Tecnica (dev.to, Leonardo Faria, «Using flexbox and text ellipsis together»; CSS-Tricks, «truncate a single line», letti il
 * 15/10/2026): il nodo diventa una riga flex, la base porta l'ellipsis con `min-width: 0` (senza, un figlio flex non scende sotto
 * la larghezza del suo testo e l'ellipsis non compare mai), il numero ha `flex: none`. È la forma con cui i file manager tengono
 * l'estensione in vista.
 *
 * ⛔ Il testo del nodo resta IDENTICO al nome (`textContent` = base + numero + coda): chi lo legge — prove, ricerca, lettori di
 *   schermo — vede lo stesso nome di prima. Un nome senza numero in coda resta testo semplice, senza figli.
 * ⛔ I puntini del taglio del server stanno DOPO il numero («…se ha-2…», REV-TITOLO-02): a schermo la prima foto diceva «se la…-2…»,
 *   due volte i puntini. La coda resta nel testo ma in un pezzo largo zero, e la base mostra i SUOI puntini (`::after`, che il taglio
 *   CSS assorbe quando la base non ci sta): a schermo «…se ha…-2» intera, «…se la…-2» troncata.
 * Resta, ed è di `text-overflow`: dopo i puntini del taglio un vuoto largo al più una lettera (la lettera che non ci stava).
 */

const BASE = 'talos-nome-numerato__base';
const NUMERO = 'talos-nome-numerato__numero';
const CODA = 'talos-nome-numerato__coda';

/** «…della cartella-2» o «…della cartella-2…» (il taglio del server tiene i puntini dopo il numero): base, numero e coda, o null. */
export function separaNumeroDelDoppione(testo) {
  const m = /^(.*\S)(-\d{1,4})(…?)$/su.exec(String(testo ?? ''));
  return m ? { base: m[1], numero: m[2], coda: m[3] } : null;
}

/*
 * NOME-NUMERO-REV-01 (bugfixer, 15/10): «-\d» in coda non basta — «Riepilogo delle spese 2026-10-15» e «BC-65» diventavano
 * «… -15» e «… -65». Il numero si stacca solo se nell'elenco c'è DAVVERO l'altra sessione: un doppione intero ha l'originale
 * uguale alla base; uno troncato (`nomeConSuffisso` accorcia la base di una parola per fare posto al numero) ha l'originale che
 * COMINCIA con la base e prosegue con uno spazio (il taglio cade sempre fra due parole). Elenco ancora sconosciuto: niente pezzi.
 */
let nomiNoti = null;

/** I nomi dell'elenco delle sessioni, aggiornati da chi lo legge (app.js, a ogni lettura dell'elenco). */
export function impostaNomiNoti(nomi) {
  nomiNoti = nomi ? [...nomi].filter((n) => typeof n === 'string' && n) : null;
}

export function eUnDoppione(nome, parti = separaNumeroDelDoppione(nome), nomi = nomiNoti) {
  if (!parti || !nomi) return false;
  for (const altro of nomi) {
    if (altro === nome) continue;
    const pulito = altro.replace(/…$/u, '');
    if (pulito === parti.base) return true;
    if (parti.coda && pulito.startsWith(parti.base) && /\s/u.test(pulito.charAt(parti.base.length))) return true;
  }
  return false;
}

function pezzo(documentObj, classe, testo) {
  const nodo = documentObj.createElement('span');
  nodo.className = classe;
  nodo.textContent = testo;
  return nodo;
}

/** Scrive `testo` in `nodo`: col numero del doppione in un pezzo suo che non si tronca mai. Non riscrive se il testo è lo stesso. */
export function scriviNomeConNumero(nodo, testo, documentObj = nodo?.ownerDocument ?? globalThis.document, nomi = nomiNoti) {
  if (!nodo) return;
  const nome = String(testo ?? '');
  const separate = separaNumeroDelDoppione(nome);
  const parti = eUnDoppione(nome, separate, nomi) ? separate : null;
  /* ⛔ Si guardano i PEZZI, non un segno: un altro scrittore che rimette lo stesso testo a mano (`textContent`) toglie i pezzi e
     lascia il segno — la prova NOME-NUMERO-03 l'ha preso così */
  const pezzi = nodo.children?.length >= 2 && nodo.children[1]?.className === NUMERO;
  const giaScritto = nodo.textContent === nome && (parti ? pezzi : !pezzi && nodo.dataset?.nomeNumerato !== 'si');
  if (giaScritto) return;
  if (!parti || !documentObj?.createElement) {
    nodo.textContent = nome;
    nodo.classList?.remove('talos-nome-numerato');
    if (nodo.dataset) delete nodo.dataset.nomeNumerato;
    return;
  }
  const base = pezzo(documentObj, parti.coda ? `${BASE} ${BASE}--tagliata` : BASE, parti.base);
  const figli = [base, pezzo(documentObj, NUMERO, parti.numero)];
  if (parti.coda) figli.push(pezzo(documentObj, CODA, parti.coda));
  nodo.replaceChildren(...figli);
  nodo.classList?.add('talos-nome-numerato');
  if (nodo.dataset) nodo.dataset.nomeNumerato = 'si';
}
