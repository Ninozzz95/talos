/*
 * COSTI E CONSUMO — la sezione D21/D22 delle Impostazioni.
 *
 * Owner, decisione D21: «Sezione Costi, sì». D22: «Consumo per giorno e per
 * modello, dai dati che già registriamo». L'audit del 06/09 le dava entrambe
 * ❌ assenti: il costo si vedeva solo nel composer, per una sessione sola.
 *
 * ⛔ QUI NON SI CALCOLA UNA CIFRA IN DENARO, ed è una scelta, non una mancanza.
 * La memoria del progetto lo ha già pagato due volte:
 *  · «LA COLONNA DEL COSTO HA UNA RISOLUZIONE» — il banco attribuiva $0,0276 a
 *    una riga che per costruzione non chiama nessuna API; la risoluzione vera
 *    era $0,0021, e i due contendenti stavano SOTTO. Un numero in valuta più
 *    fine della propria risoluzione non è economico: è rumore con il simbolo
 *    del dollaro davanti.
 *  · «MAI MODELLI DI PUNTA» — «il costo lo dice il CREDITO del provider, non
 *    il CLI».
 * ⇒ Si contano i TOKEN, che sono un dato nostro, registrato e verificabile, e
 * si dice in chiaro che la cifra in denaro la dà il fornitore.
 *
 * Ricerca 06/09/2026 sulla forma da dare ai numeri:
 *  · lo stato dell'arte mostra il consumo
 *    accanto al modello che lo ha prodotto, non un totale unico;
 *  · la regola H24-H26 delle decisioni: ogni numero ha la sua unità, le stime
 *    dicono di essere stime, i tempi sono relativi fino a 24 ore.
 *
 * ⛔ I dati arrivano dalla SOLA lista `/api/v1/sessions`, che porta già
 * `modello`, `usage.{prompt_tokens,completion_tokens,cached_tokens}`, `giri` e
 * le date. NON si chiama `/sessions/<id>/metrics` per ognuna: il difetto BH-18
 * della caccia del 06/09 misurò **75 richieste** per disegnare la Board con 74
 * sessioni, e questa pagina non deve rifare lo stesso errore.
 */
// H22: il nome umano del modello vive in UN posto solo, quello che usa già la Board.
import { nomeModello } from './session-item.js';
/*
 * ⛔⛔⛔ 06/9, CB-04 — questa pagina sommava `usage`, che è il consumo del SOLO
 * ULTIMO INVIO di ogni sessione (il kernel azzera il contatore a ogni invio):
 * su tre invii veri erano 7.716 token contro i 23.060 spesi. E i giri li
 * leggeva da `s.giri`, un campo che la rotta `/api/v1/sessions` non ha mai
 * avuto — quindi «0 giri» su ogni riga. Il totale di sessione ora ha un nome
 * suo, `usageSessione`, e un posto solo che lo sa leggere.
 */
import { usageDellaSessione } from './consumo-sessione.js';

const NUM = new Intl.NumberFormat('it-IT');

/** Compatto: 12.345 → «12,3 k». Le cifre lunghe non si leggono in una tabella. */
export function compatto(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return '—';
  if (v >= 1_000_000) return `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(v / 1_000_000)} M`;
  if (v >= 1_000) return `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(v / 1_000)} k`;
  return NUM.format(v);
}

const numeroValido = (v) => Number.isFinite(Number(v)) && Number(v) >= 0;
const tokenDi = (s) => {
  const u = usageDellaSessione(s) || {};
  const dentro = Number(u.prompt_tokens); const fuori = Number(u.completion_tokens);
  if (!numeroValido(dentro) && !numeroValido(fuori)) return null;
  return (numeroValido(dentro) ? dentro : 0) + (numeroValido(fuori) ? fuori : 0);
};

/**
 * Il giorno di una sessione, in forma ordinabile `AAAA-MM-GG`.
 * ⛔ Si ricava dalla data di avvio con il fuso LOCALE: una sessione delle 23:30
 * appartiene alla sera di chi l'ha lanciata, non al giorno dopo in UTC.
 */
export function giornoDi(sessione) {
  /*
   * ⛔⛔ 06/9 — il campo che la rotta manda DAVVERO si chiama `avviataAlle`, e
   *    non era fra quelli letti: ogni sessione finiva in «senza data» e la
   *    pagina restava vuota per costruzione, mai un errore da nessuna parte.
   *    Trovato riparando CB-04, verificato sul corpo vero di `/api/v1/sessions`.
   *    Gli altri tre nomi restano: li usano i fixture e le esportazioni.
   */
  const grezza = sessione?.avviataAlle || sessione?.avviata || sessione?.creata || sessione?.chiusa;
  if (!grezza) return null;
  const d = new Date(grezza);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Raggruppa per una chiave qualsiasi e somma ciò che sappiamo sommare. */
function raggruppa(sessioni, chiaveDi) {
  const per = new Map();
  for (const s of sessioni) {
    const k = chiaveDi(s);
    if (k == null) continue;
    const v = per.get(k) || { chiave: k, sessioni: 0, giri: 0, token: 0, cache: 0, tokenNoti: 0 };
    v.sessioni += 1;
    if (numeroValido(usageDellaSessione(s)?.giri)) v.giri += Number(usageDellaSessione(s).giri);
    const t = tokenDi(s);
    if (t != null) { v.token += t; v.tokenNoti += 1; }
    if (numeroValido(usageDellaSessione(s)?.cached_tokens)) v.cache += Number(usageDellaSessione(s).cached_tokens);
    per.set(k, v);
  }
  return [...per.values()];
}

/**
 * Il consumo per giorno, dal più recente. `giorni` limita quanti se ne tengono.
 * ⛔ Le sessioni senza data NON si buttano in un giorno finto: finiscono nel
 * conteggio «senza data» del riepilogo, che è la riga che dice CHI MANCA.
 */
export function consumoPerGiorno(sessioni = [], { giorni = 14 } = {}) {
  return raggruppa(sessioni, giornoDi).sort((a, b) => b.chiave.localeCompare(a.chiave)).slice(0, giorni);
}

/** Il consumo per modello, dal più usato. */
export function consumoPerModello(sessioni = []) {
  return raggruppa(sessioni, (s) => (typeof s?.modello === 'string' && s.modello.trim() !== '' ? s.modello : null))
    .sort((a, b) => b.token - a.token || b.sessioni - a.sessioni);
}

/**
 * Il riepilogo in cima, e soprattutto la riga che dichiara CHI NON C'È.
 * ⛔ Lezione «Il banco non vede CHI MANCA»: un totale prova che qualcosa è
 * stato contato, niente prova che sia stato contato tutto. Se dieci sessioni su
 * settanta non hanno i token registrati, la somma è di sessanta e va detto.
 */
export function riepilogoConsumo(sessioni = []) {
  const totali = { sessioni: sessioni.length, giri: 0, token: 0, cache: 0, senzaToken: 0, senzaData: 0, senzaModello: 0 };
  for (const s of sessioni) {
    if (numeroValido(usageDellaSessione(s)?.giri)) totali.giri += Number(usageDellaSessione(s).giri);
    const t = tokenDi(s);
    if (t == null) totali.senzaToken += 1; else totali.token += t;
    if (numeroValido(usageDellaSessione(s)?.cached_tokens)) totali.cache += Number(usageDellaSessione(s).cached_tokens);
    if (giornoDi(s) == null) totali.senzaData += 1;
    if (!(typeof s?.modello === 'string' && s.modello.trim() !== '')) totali.senzaModello += 1;
  }
  return totali;
}

function el(d, tag, classe, testo) { const n = d.createElement(tag); if (classe) n.className = classe; if (testo != null) n.textContent = testo; return n; }

function badge(d, testo, tono) { const b = el(d, 'span', `talos-badge talos-badge--sm${tono ? ` talos-badge--${tono}` : ''}`, testo); b.dataset.c = 'Badge'; return b; }

/** Una data `AAAA-MM-GG` in parole italiane brevi: «6 set». */
export function giornoUmano(chiave, oggi = new Date()) {
  const [a, m, g] = String(chiave).split('-').map(Number);
  if (!a || !m || !g) return String(chiave);
  const d = new Date(a, m - 1, g);
  const stesso = (x, y) => x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
  const ieri = new Date(oggi); ieri.setDate(ieri.getDate() - 1);
  if (stesso(d, oggi)) return 'oggi';
  if (stesso(d, ieri)) return 'ieri';
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}

function riempiTabella(tabella, righe, etichettaDi, { document: d = globalThis.document } = {}) {
  const corpo = tabella?.querySelector('tbody');
  if (!corpo) return;
  if (!righe.length) {
    const tr = d.createElement('tr'); const td = el(d, 'td', 'talos-muted', 'Nessuna sessione registrata su questo computer.');
    td.colSpan = 5; tr.appendChild(td); corpo.replaceChildren(tr); return;
  }
  corpo.replaceChildren(...righe.map((r) => {
    const tr = d.createElement('tr');
    tr.appendChild(el(d, 'th', '', etichettaDi(r)));
    tr.firstChild.setAttribute('scope', 'row');
    for (const v of [NUM.format(r.sessioni), NUM.format(r.giri), r.tokenNoti ? compatto(r.token) : '—', r.cache ? compatto(r.cache) : '—']) {
      tr.appendChild(el(d, 'td', 'talos-mono', v));
    }
    return tr;
  }));
}

/** Disegna la sezione intera. `sessioni` è la lista grezza di `/api/v1/sessions`. */
export function aggiornaCosti(pannello, sessioni = [], { document: d = globalThis.document, oggi = new Date() } = {}) {
  if (!pannello) return null;
  const tot = riepilogoConsumo(sessioni);
  const riepilogo = pannello.querySelector('#costiRiepilogo');
  if (riepilogo) {
    const voci = [
      badge(d, `${NUM.format(tot.sessioni)} ${tot.sessioni === 1 ? 'sessione' : 'sessioni'}`, 'accent'),
      badge(d, `${NUM.format(tot.giri)} ${tot.giri === 1 ? 'giro' : 'giri'}`),
      badge(d, `${compatto(tot.token)} token`),
      badge(d, `${compatto(tot.cache)} in cache`),
    ];
    /*
     * ⛔ La riga che dice CHI MANCA. Senza, un totale che ignora venti sessioni
     * mute si legge come il totale di tutte.
     */
    if (tot.senzaToken) voci.push(badge(d, `${NUM.format(tot.senzaToken)} senza token registrati`, 'warning'));
    if (tot.senzaModello) voci.push(badge(d, `${NUM.format(tot.senzaModello)} senza modello`, 'warning'));
    if (tot.senzaData) voci.push(badge(d, `${NUM.format(tot.senzaData)} senza data`, 'warning'));
    riepilogo.replaceChildren(...voci);
  }
  riempiTabella(pannello.querySelector('#costiPerGiorno'), consumoPerGiorno(sessioni), (r) => giornoUmano(r.chiave, oggi), { document: d });
  riempiTabella(pannello.querySelector('#costiPerModello'), consumoPerModello(sessioni), (r) => nomeModello(r.chiave) || r.chiave, { document: d });
  return tot;
}
