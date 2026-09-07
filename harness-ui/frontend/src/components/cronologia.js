/*
 * cronologia.js — la barra di navigazione della conversazione, all'estrema sinistra.
 *
 * Owner 06/09, tre volte: «la barra deve essere estremamente simile a quella delle app di chat più
 * curate… alla estrema sinistra, compatta in altezza; quando ci passi si espande la riga, mostra la
 * relativa conversazione in un fumetto, e se ci clicchi ti manda lì».
 *
 * Misurata DAL VIVO su un'app di riferimento del settore (avviata con
 * `--remote-debugging-port`, lettura del solo `nav`), 06/09/2026:
 *   · `<nav>` assoluta, `left: 16px`, centrata in verticale, `z-index 20`, larghezza 36 px;
 *   · dentro, uno scorrevole `max-height: min(70vh, 40rem)` con la barra nascosta e una maschera
 *     sfumata ai bordi (`--edge-fade-distance: 2.5rem`);
 *   · **un bottone per messaggio dell'utente** (non per giro), 36×10 px, `aria-label="Vai al messaggio
 *     dell'utente N"`;
 *   · dentro il bottone un segno 26×2 con `transition: all`, e la LINEA vera larga secondo la distanza
 *     dalla voce attiva: **26 · 20 · 14 · 10 · 6 px**, l'attiva piena, le altre al 50% di opacità;
 *   · al passaggio del mouse la lente **si sposta** sulla voce sotto il cursore (misurato:
 *     14·20·**26**·20·14·10·6 → 10·14·20·**26**·20·14·6).
 *
 * Il nostro +1 su quella misura: il **fumetto** con le prime parole di quel messaggio (non lo
 * mostrano nella versione misurata) e il rispetto di `prefers-reduced-motion` nello scorrimento.
 * Fonti 06/09/2026: ispezione diretta dell'app di riferimento; assistant-ui «Conversation map»; LibreChat #13853
 * «Message minimap navigation»; Vivid Layer «Chat minimap» (lente, sfumatura ai bordi, anteprima).
 */

/** Le larghezze della lente, dalla voce attiva verso l'esterno. Oltre, resta la misura di riposo. */
export const LENTE = Object.freeze([26, 20, 14, 10, 6]);
/** Quante voci al massimo: oltre, la barra scorre da sola (come la loro, con la maschera). */
export const VOCI_MASSIME = 200;

/** La larghezza della linea di una voce, data la sua distanza dalla voce a fuoco. */
export function larghezzaLente(indice, fuoco) {
  if (!Number.isFinite(indice) || !Number.isFinite(fuoco)) return LENTE[LENTE.length - 1];
  const d = Math.abs(Math.trunc(indice) - Math.trunc(fuoco));
  return LENTE[Math.min(d, LENTE.length - 1)];
}

/** Le prime parole di un messaggio, per il fumetto. Niente a capo, niente code infinite. */
export function anteprima(testo, massimo = 140) {
  const s = String(testo || '').replace(/\s+/g, ' ').trim();
  if (!s) return 'Messaggio senza testo';
  return s.length > massimo ? `${s.slice(0, massimo - 1)}…` : s;
}

/*
 * Owner 06/09: «fondi il componente dei giri nella navigation history: il meglio dei due mondi», e «i
 * numeri dei giri devono SPARIRE» dalla conversazione. Quindi: la spina di ogni turno resta nel DOM come
 * DATO (numero del giro, tono dell'esito, quanti attrezzi — la cosa che l'app di riferimento non ha) ma non si vede
 * piu'; qui la si legge e diventa una voce della barra. Una voce = un GIRO, non un messaggio: e' la
 * nostra informazione in piu', e sull'uso quotidiano coincide (un messaggio, un giro).
 */
const TONI = ['current', 'info', 'warning', 'danger'];

/** Le voci della barra: un giro = una voce, col suo numero, il suo tono e il suo testo. */
export function vociDaConversazione(conversazione) {
  if (!conversazione) return [];
  const voci = [];
  let ultimoDetto = ''; // l'ultima cosa che hai chiesto TU: e' quella che identifica il punto della conversazione
  for (const turno of conversazione.querySelectorAll('.talos-turn')) {
    const numeri = [...turno.querySelectorAll('.talos-turn-spine__n')];
    const segni = [...turno.querySelectorAll('.talos-turn-spine__tick')];
    const diUtente = turno.dataset.turno === 'utente' || Boolean(turno.querySelector('.talos-message--user'));
    /*
     * ⛔ Mai `turno.textContent`: dentro ci sono la spina (numeri dei giri, oggi nascosta) e il blocco del
     * ragionamento, e il fumetto diventava «234TALOSautoRagionamento…». Si prende il corpo del messaggio,
     * e per un turno di TALOS si mostra la richiesta che l'ha aperto — stessa scelta: elencare
     * solo i messaggi TUOI.
     */
    if (diUtente) {
      const suo = turno.querySelector('.talos-message--user .talos-message__body')?.textContent;
      if (suo && suo.trim()) ultimoDetto = suo;
    }
    const rispostaVisibile = [...turno.querySelectorAll('.talos-message__body p, .talos-message__copy p')]
      .find((p) => !p.closest('.real-reasoning-note') && p.textContent.trim())?.textContent;
    const testoTurno = anteprima(ultimoDetto || rispostaVisibile || 'Risposta di TALOS');
    if (!numeri.length) { // un turno senza spina (per esempio la cronologia rigiocata) vale comunque una voce
      voci.push({ indice: voci.length, elemento: turno, numero: null, tono: null, attrezzi: 0, testo: testoTurno, diUtente });
      continue;
    }
    numeri.forEach((n, i) => {
      const segno = segni[i];
      const tono = TONI.find((t) => segno?.classList.contains(`talos-turn-spine__tick--${t}`)) || null;
      voci.push({
        indice: voci.length,
        elemento: turno,
        numero: Number(n.textContent) || null,
        tono,
        attrezzi: Number(segno?.dataset.tick || 1),
        testo: testoTurno,
        diUtente,
      });
    });
  }
  return voci.slice(0, VOCI_MASSIME);
}

/** Il fumetto: «Giro 3 · 2 attrezzi» e poi il testo del turno. */
export function testoFumetto(voce) {
  if (!voce) return '';
  const capo = [];
  if (Number.isFinite(voce.numero)) capo.push(`Giro ${voce.numero}`);
  if (voce.tono === 'danger') capo.push('errore');
  else if (voce.tono === 'warning') capo.push('avviso');
  else if (voce.tono === 'current') capo.push('in corso');
  if (voce.attrezzi > 1) capo.push(`${voce.attrezzi} attrezzi`);
  return capo.length ? `${capo.join(' · ')}
${voce.testo}` : voce.testo;
}

/**
 * Riempie il fumetto: una riga di capo («Giro 5 · 3 attrezzi») e sotto il testo, tagliato a tre righe.
 * ⛔ 06/9, owner: «formatta bene il fumetto all'hover». Prima era un blocco di testo unico con un a capo
 * dentro, largo quanto la barra (36 px): una colonna di parole. Ora è strutturato e largo quanto serve.
 */
export function riempiFumetto(fumetto, voce) {
  if (!fumetto) return;
  fumetto.replaceChildren();
  if (!voce) return;
  const d = fumetto.ownerDocument;
  const capo = [];
  if (Number.isFinite(voce.numero)) capo.push(`Giro ${voce.numero}`);
  if (voce.tono === 'danger') capo.push('errore');
  else if (voce.tono === 'warning') capo.push('avviso');
  else if (voce.tono === 'current') capo.push('in corso');
  if (voce.attrezzi > 1) capo.push(`${voce.attrezzi} attrezzi`);
  if (capo.length) {
    const testa = d.createElement('b');
    testa.className = 'talos-cronologia__fumetto-capo';
    testa.textContent = capo.join(' · ');
    fumetto.append(testa);
  }
  const corpo = d.createElement('span');
  corpo.className = 'talos-cronologia__fumetto-testo';
  corpo.textContent = voce.testo;
  fumetto.append(corpo);
}

/**
 * Costruisce (o aggiorna) la barra dentro `nav`, dai messaggi di `conversazione`.
 * Idempotente: si richiama a ogni messaggio nuovo senza perdere il fuoco.
 * @returns {number} quante voci ha disegnato
 */
export function aggiornaCronologia(nav, conversazione, { fuoco = null } = {}) {
  if (!nav || !conversazione) return 0;
  const d = nav.ownerDocument;
  const voci = vociDaConversazione(conversazione);
  const lista = nav.querySelector('.talos-cronologia__lista') || nav;
  nav.hidden = voci.length < 2; // con un solo messaggio non c'e' niente da navigare
  const esistenti = [...lista.querySelectorAll('.talos-cronologia__voce')];
  // si aggiungono/tolgono solo le differenze: il DOM stabile tiene il fuoco e le transizioni
  for (let i = esistenti.length; i < voci.length; i += 1) {
    const b = d.createElement('button');
    b.type = 'button';
    b.className = 'talos-cronologia__voce';
    const segno = d.createElement('span');
    segno.className = 'talos-cronologia__segno';
    const linea = d.createElement('span');
    linea.className = 'talos-cronologia__linea';
    segno.append(linea);
    b.append(segno);
    lista.append(b);
  }
  for (let i = voci.length; i < esistenti.length; i += 1) esistenti[i].remove();
  const attivo = Number.isFinite(fuoco) ? fuoco : Number(nav.dataset.attiva || 0);
  [...lista.querySelectorAll('.talos-cronologia__voce')].forEach((b, i) => {
    const v = voci[i];
    b.dataset.indice = String(i);
    b.dataset.tono = v.tono || (v.diUtente ? 'utente' : '');
    b.setAttribute('aria-label', Number.isFinite(v.numero) ? `Vai al giro ${v.numero}` : `Vai al messaggio ${i + 1}`);
    /*
     * ⛔ 07/9, owner (screenshot): al passaggio del mouse comparivano DUE riquadri sovrapposti con
     *   lo stesso testo — il nostro fumetto e il tooltip NATIVO che Chrome disegna da `title`, che
     *   appare dopo ~1 s e non conosce né il tema né la posizione del nostro. Riprodotto sul 4174
     *   (foto `cronologia-hover.png`). Il `title` non serviva a nessuno: chi legge con la tastiera o
     *   con lo screen reader ha `aria-label` qui sotto, e chi passa il mouse ha il fumetto.
     */
    b.removeAttribute('title');
    b.classList.toggle('talos-cronologia__voce--attiva', i === attivo);
    b.querySelector('.talos-cronologia__linea').style.setProperty('--lente', `${larghezzaLente(i, attivo)}px`);
  });
  nav.dataset.attiva = String(attivo);
  return voci.length;
}

/**
 * Collega la barra: lente che segue il mouse, fumetto con l'anteprima, clic che porta al messaggio,
 * voce attiva che segue lo scorrimento. Idempotente.
 * @returns {() => void} per staccare
 */
export function collegaCronologia(nav, conversazione, { finestra = globalThis } = {}) {
  if (!nav || !conversazione || nav.dataset.collegata === 'si') return () => {};
  nav.dataset.collegata = 'si';
  const d = nav.ownerDocument;
  const fumetto = d.createElement('div');
  fumetto.className = 'talos-cronologia__fumetto';
  fumetto.setAttribute('role', 'tooltip');
  fumetto.hidden = true;
  nav.append(fumetto);

  const voceDa = (evento) => evento.target?.closest?.('.talos-cronologia__voce') || null;
  const indiceDi = (b) => Number(b?.dataset.indice ?? -1);

  nav.addEventListener('pointerover', (e) => {
    const b = voceDa(e); if (!b) return;
    const i = indiceDi(b);
    aggiornaCronologia(nav, conversazione, { fuoco: i }); // la lente si sposta sotto il cursore
    riempiFumetto(fumetto, vociDaConversazione(conversazione)[i]);
    fumetto.hidden = !fumetto.textContent;
    const r = b.getBoundingClientRect(); const rn = nav.getBoundingClientRect();
    fumetto.style.top = `${Math.round(r.top - rn.top + r.height / 2)}px`;
  });
  nav.addEventListener('pointerleave', () => {
    fumetto.hidden = true;
    aggiornaCronologia(nav, conversazione, { fuoco: Number(nav.dataset.attivaVera || nav.dataset.attiva || 0) });
  });
  nav.addEventListener('focusin', (e) => { const b = voceDa(e); if (b) { riempiFumetto(fumetto, vociDaConversazione(conversazione)[indiceDi(b)]); fumetto.hidden = false; const r = b.getBoundingClientRect(); const rn = nav.getBoundingClientRect(); fumetto.style.top = `${Math.round(r.top - rn.top + r.height / 2)}px`; } });
  nav.addEventListener('focusout', () => { fumetto.hidden = true; });
  nav.addEventListener('click', (e) => {
    const b = voceDa(e); if (!b) return;
    const voci = vociDaConversazione(conversazione);
    const v = voci[indiceDi(b)];
    if (!v) return;
    const ridotto = finestra.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    v.elemento.scrollIntoView({ behavior: ridotto ? 'auto' : 'smooth', block: 'center' });
    /*
     * ⭐ 06/9, owner: «quando clicco su una voce la conversazione deve lampeggiare in modo soft col tema
     * attuale, leggero e non disturbante». Un solo battito: si toglie la classe prima di rimetterla, così
     * due clic di fila lampeggiano due volte invece di restare accesi.
     */
    for (const t of conversazione.querySelectorAll('.talos-turn--raggiunto')) t.classList.remove('talos-turn--raggiunto');
    void v.elemento.offsetWidth; // il ridisegno serve perché l'animazione riparta
    v.elemento.classList.add('talos-turn--raggiunto');
    finestra.setTimeout(() => v.elemento.classList.remove('talos-turn--raggiunto'), 1600);
    nav.dataset.attivaVera = String(indiceDi(b));
    aggiornaCronologia(nav, conversazione, { fuoco: indiceDi(b) });
  });

  // la voce attiva segue lo scorrimento: l'ultimo messaggio dell'utente passato sopra la meta' dello schermo
  let inCoda = false;
  const seguiScorrimento = () => {
    if (inCoda) return;
    inCoda = true;
    (finestra.requestAnimationFrame || setTimeout)(() => {
      inCoda = false;
      const voci = vociDaConversazione(conversazione);
      if (!voci.length) return;
      const meta = conversazione.getBoundingClientRect().top + conversazione.clientHeight / 2;
      let attiva = 0;
      voci.forEach((v, i) => { if (v.elemento.getBoundingClientRect().top <= meta) attiva = i; });
      nav.dataset.attivaVera = String(attiva);
      if (fumetto.hidden) aggiornaCronologia(nav, conversazione, { fuoco: attiva });
    });
  };
  conversazione.addEventListener('scroll', seguiScorrimento, { passive: true });
  const osservatore = new finestra.MutationObserver(() => { aggiornaCronologia(nav, conversazione); });
  osservatore.observe(conversazione, { childList: true, subtree: true });
  aggiornaCronologia(nav, conversazione);
  return () => { conversazione.removeEventListener('scroll', seguiScorrimento); osservatore.disconnect(); delete nav.dataset.collegata; };
}
