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
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * ⛔⛔ BC-08, owner 11/09 («importante» il 12/09): «la barretta di conversation navigation mostra
 * sempre il messaggio che ho inviato io ad ogni segment anziché quello inviato da lui (ed entrambi).
 * Deve includere anche le sue risposte e direzionare a quella se cliccato».
 *
 * CAUSA misurata sul banco (porta 4186, store sintetico, 12/09/2026 — mai il 4174): una voce non era
 * un messaggio, era un **numero della spine**. Un turno di TALOS con 12 giri produceva 12 voci, tutte
 * con lo STESSO elemento (quindi 12 clic che portano nello stesso punto) e tutte con lo stesso testo,
 * che era `ultimoDetto` — cioè la domanda della PERSONA. Su una sessione da 60 scambi: **179 voci per
 * 120 turni**, e nessuna che nominasse una risposta.
 *
 * ⇒ Ora una voce = un TURNO: il tuo messaggio, poi la risposta, poi il tuo messaggio… I giri restano,
 * ma come DATO dentro la voce del turno (il fumetto dice «TALOS · giri 3-6 · 4 attrezzi»), non come
 * voci separate che portano tutte allo stesso posto.
 *
 * Ricerca 12/09/2026, fatta PRIMA di scrivere (la regola che violo di più):
 *   · **LibreChat**, `client/src/components/Chat/Messages/MessageNav.tsx` (ramo `dev`, letto il
 *     12/09/2026) e la PR #13853 «MessageNav Terminus» (chiusa il 19/06/2026): la barra indicizza
 *     **utente E assistente**, distingue il lato dal ruolo del messaggio, tiene la riga ad altezza
 *     FISSA (`RIB_ROW_HEIGHT: 6`), e quando le voci non ci stanno **non raggruppa e non schiaccia**:
 *     la colonna ha un tetto (`max-h-[min(24rem,calc(100%-2rem))]`) e scorre da sola
 *     (`overflow-y-auto`), con uno scroll-spy che la ricentra sulla voce corrente — **congelato
 *     mentre il dito o la tastiera stanno interagendo** (`interactingRef`), altrimenti la barra
 *     scappa sotto il cursore. Tastiera: frecce su/giù con roving tab-stop, Home/Fine, `aria-current`.
 *   · **WAI-ARIA APG, «Landmarks/Navigation»** (letto il 12/09/2026): `<nav>` con etichetta — che
 *     questa barra ha già.
 *   · **MDN, `aria-current`** (letto il 12/09/2026): per un indice che segue lo scorrimento il valore
 *     giusto è `location` («la posizione corrente in un ambiente»), non `true`.
 *   · **Nel nostro stesso codice**, prima di cercare fuori: `inspector.js` → `righeGiri()` elenca già
 *     da D-10A (10/09) **anche i turni della persona**, citando opencode #25910 «Chat Navigation
 *     Index/Sidebar». L'indice dei dettagli sapeva quello che la barra non sapeva.
 *   · Hermes Agent (Nous Research), pagina del prodotto letta il 12/09/2026: nessuna barra di
 *     navigazione della conversazione documentata — su questo punto non c'è niente da pareggiare.
 * ⛔ `WebSearch` era esaurita per la sessione (200/200): la ricerca è stata fatta sulle fonti dirette
 *    qui sopra, non su un motore di ricerca. Dichiarato, non nascosto.
 */

import { SELETTORE_RISPOSTA_TURNO, SELETTORE_TESTO_UTENTE } from './inspector.js';

/** Le larghezze della lente, dalla voce attiva verso l'esterno. Oltre, resta la misura di riposo. */
export const LENTE = Object.freeze([26, 20, 14, 10, 6]);
/*
 * Quante voci al massimo. ⛔ 12/09 — erano 200 con `slice(0, 200)`, cioè **le più VECCHIE**: una
 * conversazione oltre il tetto perdeva dalla barra proprio la parte dove stai leggendo. Ora si tengono
 * le ULTIME, e il tetto sale a 400 perché da oggi ogni scambio vale due voci invece di una.
 */
export const VOCI_MASSIME = 400;
/** I toni di un giro, dal più grave al più tenue: una voce di turno prende il peggiore dei suoi giri. */
const TONI = ['danger', 'warning', 'current', 'info'];

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

/**
 * Il testo che identifica un turno.
 * ⛔ Mai `turno.textContent`: dentro ci sono la spina (i numeri dei giri, oggi nascosti) e il blocco
 * del ragionamento, e il fumetto diventava «234TALOSautoRagionamento…».
 * ⛔ E per la risposta di TALOS mai `.assistant-copy` da sola: è una classe-gancio che portano ANCHE
 * il corpo del ragionamento, le note di sistema e il «perché» di un'approvazione — è il difetto CB-03
 * del 06/09, dove l'indice dei giri finì per mostrare il ragionamento in inglese al posto della
 * risposta. I due selettori giusti vivono in `inspector.js` e si importano da lì: uno solo, non due.
 */
export function testoDelTurno(turno, diUtente) {
  if (!turno || typeof turno.querySelector !== 'function') return '';
  const selettore = diUtente ? SELETTORE_TESTO_UTENTE : SELETTORE_RISPOSTA_TURNO;
  const testo = turno.querySelector(selettore)?.textContent;
  return typeof testo === 'string' ? testo : '';
}

/** Il tono di un turno: il peggiore fra i suoi giri. `null` quando nessun giro ne porta uno. */
export function tonoPeggiore(toni = []) {
  for (const t of TONI) if (toni.includes(t)) return t;
  return null;
}

/**
 * Da una sequenza di turni già letti a voci della barra: una voce = un TURNO, nell'ordine della
 * conversazione, e quando sono troppe si tengono le ULTIME (è lì che stai leggendo).
 * Puro: nessun DOM. `turni` = [{ elemento, diUtente, numeri:[], toni:[], attrezzi, testo }].
 */
export function vociDaTurni(turni = []) {
  const voci = [];
  for (const t of turni) {
    if (!t) continue;
    const numeri = (t.numeri || []).filter(Number.isFinite);
    const tono = tonoPeggiore(t.toni || []);
    const diUtente = Boolean(t.diUtente);
    voci.push({
      indice: 0,
      elemento: t.elemento,
      diUtente,
      lato: diUtente ? 'utente' : 'talos',
      numero: numeri.length ? numeri[0] : null,
      numeroUltimo: numeri.length ? numeri[numeri.length - 1] : null,
      tono,
      attrezzi: Number.isFinite(t.attrezzi) ? t.attrezzi : 0,
      testo: String(t.testo || '').trim() ? anteprima(t.testo) : '',
    });
  }
  const tenute = voci.length > VOCI_MASSIME ? voci.slice(voci.length - VOCI_MASSIME) : voci;
  /*
   * ⛔⛔ 12/09, trovato guardando la foto della barra da vicino — «IN CORSO» su 59 turni su 60.
   * MISURATO anche su una sessione VERA dell'owner (banco a parte, porta 4187, nessuna foto, copia
   * cancellata subito): **21 giri su 56 restano `--current`** dopo il replay. Cioè: una sessione
   * conclusa si ridisegna con decine di giri marchiati «in corso». Il difetto sta a monte
   * (`aggiornaTickGiro` a `RunFinished` tocca solo l'ULTIMO turno della chat, e nel replay gli altri
   * restano com'erano) e non si cura da qui — è in `app.js`, fuori da ciò che questa riga può toccare.
   * ⇒ Quello che si cura QUI è la bugia che arrivava a schermo: «in corso» può valere solo per
   *   l'ULTIMO turno della conversazione. Prima di questa riga il colore «in corso» copriva quasi
   *   tutte le voci di TALOS e cancellava la distinzione fra i due lati, cioè proprio BC-08.
   */
  tenute.forEach((v, i) => {
    v.indice = i; // l'indice si rinumera DOPO il taglio: è la posizione nella barra, e la lente ci conta sopra
    if (v.tono === 'current' && i !== tenute.length - 1) v.tono = null;
    /* ⛔ il testo del vuoto si decide DOPO il tono, non prima: altrimenti un turno a metà conversazione
       resterebbe «Sta rispondendo…» pur avendo appena perso il suo «in corso». */
    if (!v.testo) v.testo = v.diUtente ? 'Messaggio senza testo' : (v.tono === 'current' ? 'Sta rispondendo…' : 'Risposta senza testo');
  });
  return tenute;
}

/** Le voci della barra lette dalla conversazione vera. Un turno della persona, un turno di TALOS, uno per uno. */
export function vociDaConversazione(conversazione) {
  if (!conversazione) return [];
  const turni = [...conversazione.querySelectorAll('.talos-turn')].map((turno) => {
    const diUtente = turno.dataset.turno === 'utente' || Boolean(turno.querySelector('.talos-message--user'));
    const segni = [...turno.querySelectorAll('.talos-turn-spine__tick')];
    return {
      elemento: turno,
      diUtente,
      numeri: [...turno.querySelectorAll('.talos-turn-spine__n')].map((n) => Number(n.textContent)).filter(Number.isFinite),
      toni: segni.map((s) => TONI.find((t) => s.classList.contains(`talos-turn-spine__tick--${t}`))).filter(Boolean),
      // gli attrezzi di un turno sono quelli di tutti i suoi giri messi insieme, non quelli dell'ultimo
      attrezzi: diUtente ? 0 : segni.reduce((somma, s) => somma + (Number(s.dataset.tick) || 1), 0),
      testo: testoDelTurno(turno, diUtente),
    };
  });
  return vociDaTurni(turni);
}

/** Il capo del fumetto: chi parla, e per TALOS anche i giri, l'esito e quanti attrezzi. */
export function capoFumetto(voce) {
  if (!voce) return '';
  if (voce.diUtente) return 'Tu';
  const parti = ['TALOS'];
  if (Number.isFinite(voce.numero)) {
    parti.push(Number.isFinite(voce.numeroUltimo) && voce.numeroUltimo !== voce.numero
      ? `giri ${voce.numero}-${voce.numeroUltimo}`
      : `giro ${voce.numero}`);
  }
  if (voce.tono === 'danger') parti.push('errore');
  else if (voce.tono === 'warning') parti.push('avviso');
  else if (voce.tono === 'current') parti.push('in corso');
  if (voce.attrezzi > 1) parti.push(`${voce.attrezzi} attrezzi`);
  return parti.join(' · ');
}

/** Il fumetto come testo semplice: il capo, a capo, e le prime parole di QUEL messaggio. */
export function testoFumetto(voce) {
  if (!voce) return '';
  const capo = capoFumetto(voce);
  return capo ? `${capo}
${voce.testo}` : voce.testo;
}

/** Come si chiama una voce per chi naviga da tastiera o con lo screen reader. */
export function etichettaVoce(voce, posizione) {
  if (!voce) return '';
  return voce.diUtente ? `Vai al tuo messaggio ${posizione}` : `Vai alla risposta di TALOS ${posizione}`;
}

/**
 * Riempie il fumetto: una riga di capo («TALOS · giri 5-7 · 3 attrezzi») e sotto il testo, tagliato a
 * tre righe.
 * ⛔ 06/9, owner: «formatta bene il fumetto all'hover». Prima era un blocco di testo unico con un a capo
 * dentro, largo quanto la barra (36 px): una colonna di parole. Ora è strutturato e largo quanto serve.
 */
export function riempiFumetto(fumetto, voce) {
  if (!fumetto) return;
  fumetto.replaceChildren();
  if (!voce) return;
  const d = fumetto.ownerDocument;
  const capo = capoFumetto(voce);
  if (capo) {
    const testa = d.createElement('b');
    testa.className = 'talos-cronologia__fumetto-capo';
    testa.textContent = capo;
    fumetto.append(testa);
  }
  const corpo = d.createElement('span');
  corpo.className = 'talos-cronologia__fumetto-testo';
  corpo.textContent = voce.testo;
  fumetto.append(corpo);
}

/**
 * Quanto deve scorrere la lista perché la voce `indice` si veda.
 * Puro, e con la maschera dentro il conto: la lista sfuma i primi e gli ultimi 40 px, quindi una voce
 * «visibile» ma dentro la sfumatura è, per chi guarda, invisibile.
 * @returns {number} il nuovo `scrollTop`; uguale a quello di partenza quando non serve muoversi
 */
export function scorrimentoPerVedere({ indice, altezzaVoce, scrollTop, clientHeight, scrollHeight, sfumatura = 40 }) {
  if (![indice, altezzaVoce, scrollTop, clientHeight, scrollHeight].every(Number.isFinite)) return scrollTop;
  if (altezzaVoce <= 0 || scrollHeight <= clientHeight) return scrollTop;
  const massimo = scrollHeight - clientHeight;
  // con una lista più corta del doppio della sfumatura non c'è una «zona buona»: si centra e basta
  const margine = clientHeight > sfumatura * 2 + altezzaVoce ? sfumatura : 0;
  const alto = indice * altezzaVoce;
  const basso = alto + altezzaVoce;
  let nuovo = scrollTop;
  if (alto - margine < scrollTop) nuovo = alto - margine;
  else if (basso + margine > scrollTop + clientHeight) nuovo = basso + margine - clientHeight;
  return Math.min(massimo, Math.max(0, nuovo));
}

/**
 * Il contenitore che SCORRE davvero, a partire da quello che ci passano.
 *
 * ⛔⛔ 12/09, trovato misurando BC-08 sul banco: `app.js` chiama `collegaCronologia(nav,
 * $('#conversation'))`, e `#conversation` non è lo scorrevole — è la COLONNA. Lo dice il ponte:
 * `legacy-dom.js` righe 154-155 battezza `.talos-conversation` con la CLASSE `conversation` e
 * `.talos-conversation__column` con l'ID `conversation`. Due nomi quasi uguali per due elementi
 * diversi. Conseguenza misurata: l'ascolto dello scorrimento era attaccato a un elemento che non
 * scorre mai ⇒ `nav.dataset.attivaVera` è rimasto **undefined** per tutta la vita di questa barra,
 * cioè il segnavia del turno corrente non ha MAI seguito la lettura (si muoveva solo col clic e col
 * passaggio del mouse). E `clientHeight` della colonna è l'altezza di TUTTA la conversazione: anche
 * la metà schermo su cui il calcolo si basa era la metà della cosa sbagliata.
 * ⇒ Si risale allo scorrevole invece di fidarsi del nome. La cura sta qui e non in `app.js` perché
 * è il componente a sapere di che cosa ha bisogno.
 */
export function contenitoreCheScorre(elemento) {
  if (!elemento) return null;
  return elemento.closest?.('.talos-conversation') || elemento;
}

/**
 * Costruisce (o aggiorna) la barra dentro `nav`, dai messaggi di `conversazione`.
 * Idempotente: si richiama a ogni messaggio nuovo senza perdere il fuoco.
 * @returns {number} quante voci ha disegnato
 */
export function aggiornaCronologia(nav, conversazione, { fuoco = null, voci = null, segui = false } = {}) {
  if (!nav || !conversazione) return 0;
  const d = nav.ownerDocument;
  const elenco = voci || vociDaConversazione(conversazione);
  const lista = nav.querySelector('.talos-cronologia__lista') || nav;
  nav.hidden = elenco.length < 2; // con un solo messaggio non c'e' niente da navigare
  const esistenti = [...lista.querySelectorAll('.talos-cronologia__voce')];
  // si aggiungono/tolgono solo le differenze: il DOM stabile tiene il fuoco e le transizioni
  for (let i = esistenti.length; i < elenco.length; i += 1) {
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
  for (let i = elenco.length; i < esistenti.length; i += 1) esistenti[i].remove();
  const attivo = Number.isFinite(fuoco) ? fuoco : Number(nav.dataset.attiva || 0);
  const attivaVera = Number(nav.dataset.attivaVera || nav.dataset.attiva || 0);
  let contaTuoi = 0;
  let contaSue = 0;
  const bottoni = [...lista.querySelectorAll('.talos-cronologia__voce')];
  bottoni.forEach((b, i) => {
    const v = elenco[i];
    const posizione = v.diUtente ? (contaTuoi += 1) : (contaSue += 1);
    b.dataset.indice = String(i);
    /*
     * ⛔ BC-08 — il LATO sta in un attributo suo, e il TONO in un altro. Prima `data-tono="utente"`
     * faceva le due cose insieme, e infatti la linea della persona era `--talos-success`: verde, cioè
     * «riuscito», per un messaggio che non ha nessun esito. Un attributo, un significato.
     */
    b.dataset.lato = v.lato;
    b.dataset.tono = v.tono || '';
    b.setAttribute('aria-label', etichettaVoce(v, posizione));
    /*
     * ⛔ 07/9, owner (screenshot): al passaggio del mouse comparivano DUE riquadri sovrapposti con
     *   lo stesso testo — il nostro fumetto e il tooltip NATIVO che Chrome disegna da `title`, che
     *   appare dopo ~1 s e non conosce né il tema né la posizione del nostro. Riprodotto sul 4174
     *   (foto `cronologia-hover.png`). Il `title` non serviva a nessuno: chi legge con la tastiera o
     *   con lo screen reader ha `aria-label` qui sopra, e chi passa il mouse ha il fumetto.
     */
    b.removeAttribute('title');
    const eAttiva = i === attivo;
    b.classList.toggle('talos-cronologia__voce--attiva', eAttiva);
    // MDN, `aria-current` (12/09/2026): per un indice che segue lo scorrimento il valore è `location`
    if (i === attivaVera) b.setAttribute('aria-current', 'location'); else b.removeAttribute('aria-current');
    // roving tab-stop: una sola fermata di Tab su tutta la barra, le frecce fanno il resto
    b.tabIndex = i === attivaVera ? 0 : -1;
    b.querySelector('.talos-cronologia__linea').style.setProperty('--lente', `${larghezzaLente(i, attivo)}px`);
  });
  nav.dataset.attiva = String(attivo);
  /*
   * ⛔ BC-08 — QUANDO LE VOCI NON CI STANNO. Con due lati le voci raddoppiano e il tetto della lista
   * (`min(70vh, 40rem)`) si riempie presto: a 900 px di altezza ci stanno 63 voci su 10 px, cioè ~31
   * scambi. Le forme viste nella ricerca sono tre — schiacciare le righe, raggruppare, o far scorrere
   * la lista tenendola agganciata alla voce corrente. Le prime due si scartano: schiacciare toglie il
   * bersaglio del clic (a 5 px la riga non si prende col mouse) e raggruppare NASCONDE proprio le
   * risposte che l'owner ha chiesto di vedere. Resta la terza, che è anche quella che LibreChat ha
   * scelto: riga ad altezza fissa, lista che scorre, e la barra che segue la lettura.
   */
  if (segui) {
    const b = bottoni[attivaVera];
    if (b && lista !== nav) {
      const nuovo = scorrimentoPerVedere({
        indice: attivaVera,
        altezzaVoce: b.offsetHeight,
        scrollTop: lista.scrollTop,
        clientHeight: lista.clientHeight,
        scrollHeight: lista.scrollHeight,
      });
      if (nuovo !== lista.scrollTop) lista.scrollTop = nuovo;
    }
  }
  return elenco.length;
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
  const bottoni = () => [...nav.querySelectorAll('.talos-cronologia__voce')];
  /*
   * ⛔ Mentre il dito o la tastiera stanno navigando la barra, la barra NON si muove da sola: è
   * `interactingRef` di LibreChat, e senza quel freno la voce sotto il cursore scivola via mentre la
   * si sta per cliccare.
   */
  const inMano = () => nav.dataset.inMano === 'si';

  const mostraFumetto = (b) => {
    const i = indiceDi(b);
    riempiFumetto(fumetto, vociDaConversazione(conversazione)[i]);
    fumetto.hidden = !fumetto.textContent;
    const r = b.getBoundingClientRect(); const rn = nav.getBoundingClientRect();
    fumetto.style.top = `${Math.round(r.top - rn.top + r.height / 2)}px`;
  };

  nav.addEventListener('pointerover', (e) => {
    const b = voceDa(e); if (!b) return;
    nav.dataset.inMano = 'si';
    aggiornaCronologia(nav, conversazione, { fuoco: indiceDi(b) }); // la lente si sposta sotto il cursore
    mostraFumetto(b);
  });
  nav.addEventListener('pointerleave', () => {
    delete nav.dataset.inMano;
    fumetto.hidden = true;
    aggiornaCronologia(nav, conversazione, { fuoco: Number(nav.dataset.attivaVera || nav.dataset.attiva || 0), segui: true });
  });
  nav.addEventListener('focusin', (e) => { const b = voceDa(e); if (b) { nav.dataset.inMano = 'si'; mostraFumetto(b); } });
  nav.addEventListener('focusout', () => { delete nav.dataset.inMano; fumetto.hidden = true; });
  /*
   * Tastiera: frecce su/giù fra le voci, Home e Fine ai due capi. È la stessa grammatica della barra
   * di LibreChat (roving tab-stop + Home/End) e quella che l'APG chiama per una navigazione a voci.
   */
  nav.addEventListener('keydown', (e) => {
    const elenco = bottoni();
    if (!elenco.length) return;
    const qui = elenco.indexOf(d.activeElement);
    let dove = null;
    if (e.key === 'ArrowDown') dove = Math.min(elenco.length - 1, (qui < 0 ? -1 : qui) + 1);
    else if (e.key === 'ArrowUp') dove = Math.max(0, (qui < 0 ? 1 : qui) - 1);
    else if (e.key === 'Home') dove = 0;
    else if (e.key === 'End') dove = elenco.length - 1;
    if (dove === null) return;
    e.preventDefault();
    aggiornaCronologia(nav, conversazione, { fuoco: dove });
    elenco[dove]?.focus();
  });
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
    aggiornaCronologia(nav, conversazione, { fuoco: indiceDi(b), voci });
  });

  // la voce attiva segue lo scorrimento: l'ultimo turno passato sopra la meta' dello schermo
  const scorrevole = contenitoreCheScorre(conversazione);
  let inCoda = false;
  const seguiScorrimento = () => {
    if (inCoda) return;
    inCoda = true;
    (finestra.requestAnimationFrame || setTimeout)(() => {
      inCoda = false;
      const voci = vociDaConversazione(conversazione);
      if (!voci.length) return;
      const meta = scorrevole.getBoundingClientRect().top + scorrevole.clientHeight / 2;
      let attiva = 0;
      voci.forEach((v, i) => { if (v.elemento.getBoundingClientRect().top <= meta) attiva = i; });
      nav.dataset.attivaVera = String(attiva);
      if (fumetto.hidden && !inMano()) aggiornaCronologia(nav, conversazione, { fuoco: attiva, voci, segui: true });
    });
  };
  scorrevole.addEventListener('scroll', seguiScorrimento, { passive: true });
  const osservatore = new finestra.MutationObserver(() => { aggiornaCronologia(nav, conversazione, { segui: !inMano() }); });
  osservatore.observe(conversazione, { childList: true, subtree: true });
  aggiornaCronologia(nav, conversazione);
  seguiScorrimento(); // il segnavia parte dalla posizione VERA, non dalla voce 0
  return () => { scorrevole.removeEventListener('scroll', seguiScorrimento); osservatore.disconnect(); delete nav.dataset.collegata; };
}
