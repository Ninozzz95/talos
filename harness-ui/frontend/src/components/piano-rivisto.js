import { t, tn } from './lingua.js';

/*
 * ⭐ Owner 27/10/2026 sera, «gravissima»: «quando un piano viene modificato, mi porta al piano originale in cima alla conversazione…
 *   è impensabile». Decisione: «In fondo, il vecchio si chiude» (bozzetto B approvato, handoff mockup-server-locali-e-piano-2026-10-27,
 *   B1 e B2). La revisione nuova nasce DOVE la persona sta leggendo, con «Cosa è cambiato»; ogni revisione superata diventa una riga
 *   sola riapribile. Mai due piani interi a schermo, nessun salto (supera l'avviso «Vai al piano» del 23/09).
 *   Qui i pezzi puri: le differenze fra due testi di piano, la riga della revisione superata, la fascia delle differenze.
 */

/** Una riga di piano senza numerazione, puntini e segni di markdown: quella che si confronta e quella che si legge nell'elenco. */
export function rigaDelPiano(riga) {
  return String(riga ?? '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/u, '')
    .replace(/^\s*#{1,6}\s+/u, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/[*_`]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * Le differenze riga per riga fra due testi di piano (sottosequenza comune più lunga, come `diff`): `[{ tipo: 'uguale'|'aggiunta'|
 * 'tolta', riga }]` nell'ordine del testo nuovo, con le tolte al posto in cui stavano. Le righe vuote non contano.
 */
export function differenzeDelPiano(vecchio, nuovo) {
  const a = String(vecchio ?? '').split(/\r?\n/u).map(rigaDelPiano).filter(Boolean);
  const b = String(nuovo ?? '').split(/\r?\n/u).map(rigaDelPiano).filter(Boolean);
  const n = a.length, m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) for (let j = m - 1; j >= 0; j -= 1) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ tipo: 'uguale', riga: b[j] }); i += 1; j += 1; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) { ops.push({ tipo: 'tolta', riga: a[i] }); i += 1; }
    else { ops.push({ tipo: 'aggiunta', riga: b[j] }); j += 1; }
  }
  for (; i < n; i += 1) ops.push({ tipo: 'tolta', riga: a[i] });
  for (; j < m; j += 1) ops.push({ tipo: 'aggiunta', riga: b[j] });
  return ops;
}

/**
 * La riga sola di una revisione superata (bozzetto B1): «Piano · revisione 1 · sostituito dalla revisione 2, più in basso · Rileggi».
 * La scheda vecchia resta DENTRO la riga, nascosta; «Rileggi» la apre e la richiude. Le sue scelte non si mostrano più: la decisione
 * si prende sulla revisione corrente.
 */
export function creaRigaPianoSostituito({ document = globalThis.document, card, revisione, revisioneNuova }) {
  const riga = document.createElement('div');
  riga.className = 'talos-piano-sostituito';
  riga.dataset.revisione = String(revisione);
  const testa = document.createElement('div');
  testa.className = 'talos-piano-sostituito__testa';
  const punto = document.createElement('span');
  punto.className = 'talos-dot';
  punto.setAttribute('aria-hidden', 'true');
  const titolo = document.createElement('strong');
  titolo.textContent = t('chat.plan.superseded.title', { n: revisione });
  const nota = document.createElement('span');
  nota.textContent = t('chat.plan.superseded.by', { n: revisioneNuova });
  const spazio = document.createElement('span');
  spazio.className = 'talos-grow';
  const apri = document.createElement('button');
  apri.type = 'button';
  apri.className = 'talos-button talos-button--ghost talos-button--sm';
  apri.textContent = t('chat.plan.superseded.reread');
  apri.setAttribute('aria-expanded', 'false');
  const contenitore = document.createElement('div');
  contenitore.className = 'talos-piano-sostituito__scheda';
  contenitore.hidden = true;
  /* schema «disclosure» del W3C (APG, letto il 27/10/2026): il pulsante dice cosa apre (aria-controls), il contenuto sta subito
     dopo di lui nel DOM, il fuoco non si sposta */
  contenitore.id = `piano-sostituito-${String(card.dataset.planId ?? '').replace(/[^\w-]/gu, '_')}-${revisione}`;
  apri.setAttribute('aria-controls', contenitore.id);
  apri.dataset.disclosurePropria = ''; // lo apre e lo chiude questo modulo: la regia globale di app.js lo lascia stare
  card.dataset.sostituito = '';
  /* la pillola non dice più «Aspetta la tua scelta»: lì non si sceglie. Una ricevuta già scritta (scelta fatta) resta com'è. */
  const stato = card.querySelector('.talos-plan-artifact__state');
  if (stato && card.hasAttribute('data-approvabile')) stato.textContent = t('chat.plan.superseded.state', { n: revisioneNuova });
  card.removeAttribute('data-approvabile');
  contenitore.append(card);
  apri.addEventListener('click', () => {
    const aperta = contenitore.hidden;
    contenitore.hidden = !aperta;
    apri.setAttribute('aria-expanded', aperta ? 'true' : 'false');
    apri.textContent = t(aperta ? 'chat.plan.superseded.close' : 'chat.plan.superseded.reread');
  });
  testa.append(punto, titolo, nota, spazio, apri);
  riga.append(testa, contenitore);
  return riga;
}

/**
 * La fascia «Cosa è cambiato» (bozzetto B2) sulla scheda della revisione nuova: il riassunto («2 passi aggiunti, 1 tolto»), le righe
 * aggiunte evidenziate e le tolte barrate al loro posto nell'elenco, e «Nascondi le differenze» per leggere il piano pulito.
 * Senza differenze (la stessa lista) non aggiunge niente.
 */
export function aggiungiCosaECambiato({ document = globalThis.document, card, ops, revisionePrima }) {
  const aggiunte = ops.filter((o) => o.tipo === 'aggiunta').length;
  const tolte = ops.filter((o) => o.tipo === 'tolta').length;
  if (aggiunte + tolte === 0) return false;
  const corpo = card.querySelector('.talos-plan-artifact__body');
  if (!corpo) return false;
  card.classList.add('talos-piano-con-differenze');
  /* le voci del piano nuovo nell'ordine: un punto d'elenco, un paragrafo, un titolo. Di una voce con un sotto-elenco conta il SUO
     testo, non quello delle figlie (le figlie sono voci a sé). */
  const voci = [...corpo.querySelectorAll('li, p, h1, h2, h3, h4, h5, h6')].filter((n) => n.tagName === 'LI' || !n.closest('li'));
  const testoProprio = (n) => [...n.childNodes].filter((c) => !/^(OL|UL)$/u.test(c.nodeName)).map((c) => c.textContent).join('');
  const inElenco = voci.some((v) => v.tagName === 'LI');
  let k = 0;
  let ultima = null;
  for (const op of ops) {
    if (op.tipo === 'tolta') {
      const del = document.createElement(inElenco && (!ultima || ultima.tagName === 'LI') ? 'li' : 'p');
      del.className = 'talos-piano-diff-del';
      del.textContent = op.riga;
      if (ultima?.parentNode) ultima.after(del);
      else {
        const primo = voci.find((v) => v.tagName === 'LI') ?? voci[0];
        if (primo?.parentNode) primo.before(del);
        else corpo.append(del);
      }
      ultima = del;
      continue;
    }
    /* si cerca IN AVANTI senza consumare: una riga che non ha un nodo suo (un pezzo di codice) non fa perdere le successive */
    let trovata = -1;
    for (let i = k; i < voci.length; i += 1) if (rigaDelPiano(testoProprio(voci[i])) === op.riga) { trovata = i; break; }
    if (trovata < 0) continue;
    const voce = voci[trovata];
    k = trovata + 1;
    if (op.tipo === 'aggiunta') {
      const segno = document.createElement('span');
      segno.className = 'talos-piano-diff-add';
      segno.append(...[...voce.childNodes].filter((c) => !/^(OL|UL)$/u.test(c.nodeName)));
      voce.prepend(segno);
    }
    ultima = voce;
  }
  const fascia = document.createElement('div');
  fascia.className = 'talos-piano-cambiato';
  const testo = document.createElement('span');
  const parti = [];
  if (aggiunte) parti.push(tn('chat.plan.changed.addedOne', 'chat.plan.changed.addedMany', aggiunte));
  /* «2 passi aggiunti, 1 tolto» come nel bozzetto; da sole le tolte dicono «passo» («1 passo tolto») */
  if (tolte && aggiunte) parti.push(tn('chat.plan.changed.removedOne', 'chat.plan.changed.removedMany', tolte));
  else if (tolte) parti.push(tn('chat.plan.changed.removedOnlyOne', 'chat.plan.changed.removedOnlyMany', tolte));
  testo.textContent = t('chat.plan.changed.summary', { n: revisionePrima, cambi: parti.join(', ') });
  const nascondi = document.createElement('button');
  nascondi.type = 'button';
  nascondi.className = 'talos-button talos-button--ghost talos-button--sm';
  nascondi.setAttribute('aria-pressed', 'true');
  nascondi.textContent = t('chat.plan.changed.hide');
  nascondi.addEventListener('click', () => {
    const mostra = card.classList.toggle('talos-piano-con-differenze');
    nascondi.setAttribute('aria-pressed', mostra ? 'true' : 'false');
    nascondi.textContent = t(mostra ? 'chat.plan.changed.hide' : 'chat.plan.changed.show');
  });
  fascia.append(testo, nascondi);
  corpo.prepend(fascia);
  return true;
}
