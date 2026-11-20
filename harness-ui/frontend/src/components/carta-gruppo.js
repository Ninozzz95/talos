/*
 * Long tasks, A and B (owner 13/11/2026 04:35, «A e B insieme»; judge v1759) — the pieces of the permission card that do not depend on
 * the page:
 *   · `gruppoDellaCarta`: the group the kernel wrote on the card of an outside tool (`azione.gruppo`: the calls of the same tool in the
 *     same model answer), checked; `null` when there is none or it is malformed (the card is then the card of one call, as before);
 *   · `bloccoDelGruppo`: the list of the calls the person approves, ONE numbered entry for each call with its arguments in label/value
 *     rows — at most `CAMPI_VISIBILI`, then «+N fields»; a field name with no translation shown as data — (the
 *     piece of the automation cards, `.talos-approval__automazione` + `.talos-kv`, the same rows as the card of a call written as text),
 *     secrets hidden; past three calls the rest is folded under «Show all» (judge v1759 a: the person sees what they approve);
 *   · `testoDelleRisposte`: the words of the buttons and of the note of a group card.
 * The answers themselves (`ambito: 'risposta'`, and `ambito: 'strumento'` with a no for «No to this tool until your next message") are
 * sent by the page, like every other answer of the card.
 */
import { t, tn } from './lingua.js';
import { etichettaArgomento } from './etichette-argomenti.js';
import { valoreLeggibile } from './carta-dal-testo.js';

/** How many calls the card shows before «Show all». */
export const CHIAMATE_VISIBILI = 3;
/**
 * How many fields of one call the card shows (judge v1778, R2): the kernel never groups a call with more (its own limit, 12), so past it
 * the card says how many it leaves out, «+N fields» — it never hides one in silence.
 */
export const CAMPI_VISIBILI = 12;

/** The name of a field: its translation when there is one; otherwise the field itself, marked as data (an identifier, never a word of the card). */
function nomeDelCampo(doc, campo) {
  const k = doc.createElement('span');
  k.className = 'talos-kv__k';
  k.textContent = etichettaArgomento(campo);
  /* the same lookup as `etichettaArgomento` (`app.activity.arg.<field>`): no entry ⇒ the raw name of the server's schema */
  const chiave = `app.activity.arg.${String(campo)}`;
  if (!/^[A-Za-z0-9_]+$/u.test(String(campo)) || t(chiave) === chiave) {
    k.classList.add('talos-kv__k--dato');
    k.setAttribute('translate', 'no');
  }
  return k;
}

/** The checked group of a card, or `null`: at least two calls, each with its id; arguments that are not an object count as none. */
export function gruppoDellaCarta(azione) {
  const g = azione?.gruppo;
  if (!g || typeof g !== 'object' || !Array.isArray(g.chiamate) || !Number.isInteger(g.totale) || g.totale < 2) return null;
  const chiamate = g.chiamate
    .filter((c) => c && typeof c === 'object' && typeof c.toolCallId === 'string' && c.toolCallId !== '')
    .map((c) => ({ toolCallId: c.toolCallId, argomenti: c.argomenti && typeof c.argomenti === 'object' && !Array.isArray(c.argomenti) ? c.argomenti : {} }));
  /* 0.2.4 blocco 1, voce 7: il nucleo manda al più 20 chiamate (`TETTO_CHIAMATE_DEL_GRUPPO`) e dice quante altre copre (`nonMostrate`):
     quelle elencate più le altre devono fare il totale, mai meno (una carta che copre chiamate non dette non è una carta di gruppo) */
  const nonMostrate = g.nonMostrate === undefined ? 0 : g.nonMostrate;
  if (!Number.isInteger(nonMostrate) || nonMostrate < 0) return null;
  if (chiamate.length < 2 || chiamate.length + nonMostrate !== g.totale) return null;
  return { totale: g.totale, chiamate, ...(nonMostrate > 0 ? { nonMostrate } : {}) };
}

/** The words of a group card: the count in the head, the two answers, the note under them. */
export function testoDelleRisposte(gruppo, { conStrumento = false } = {}) {
  const count = gruppo.totale;
  return {
    conteggio: tn('chat.approval.group.countOne', 'chat.approval.group.countMany', count, { count }),
    consentiTutte: t('chat.approval.group.allowAll', { count }),
    negaTutte: t('chat.approval.group.denyAll', { count }),
    nota: conStrumento ? t('chat.approval.group.appliesAllOrTool', { count }) : tn('chat.approval.group.appliesAllOne', 'chat.approval.group.appliesAllMany', count, { count }),
  };
}

/** The list of the calls: one entry for each, its arguments in rows; past `visibili` the rest waits under «Show all». */
export function bloccoDelGruppo(doc, gruppo, { visibili = CHIAMATE_VISIBILI } = {}) {
  const blocco = doc.createElement('div');
  blocco.className = 'talos-approval__automazione talos-approval__gruppo';
  blocco.dataset.gruppoChiamate = String(gruppo.totale);
  blocco.setAttribute('role', 'list');
  blocco.setAttribute('aria-label', tn('chat.approval.group.listOne', 'chat.approval.group.listMany', gruppo.totale, { count: gruppo.totale }));
  const nascoste = [];
  for (const [indice, chiamata] of gruppo.chiamate.entries()) {
    const voce = doc.createElement('div');
    voce.className = 'talos-approval__chiamata';
    voce.setAttribute('role', 'listitem');
    voce.dataset.chiamata = chiamata.toolCallId;
    /* the reviewer's ROSSO (13/11/2026): each call has its number, not only a thin line between them */
    const numero = doc.createElement('span');
    numero.className = 'talos-muted talos-approval__chiamata-numero';
    numero.textContent = t('chat.approval.group.callNumber', { n: indice + 1, count: gruppo.totale });
    voce.append(numero);
    const righe = Object.entries(chiamata.argomenti);
    if (!righe.length) {
      const vuota = doc.createElement('span');
      vuota.className = 'talos-muted talos-approval__chiamata-vuota';
      vuota.textContent = t('chat.approval.group.noArguments');
      voce.append(vuota);
    }
    for (const [k, v] of righe.slice(0, CAMPI_VISIBILI)) {
      const riga = doc.createElement('div');
      riga.className = 'talos-kv';
      const vv = doc.createElement('span'); vv.className = 'talos-kv__v'; vv.textContent = valoreLeggibile(k, v);
      riga.append(nomeDelCampo(doc, k), vv);
      voce.append(riga);
    }
    const inPiu = righe.length - CAMPI_VISIBILI;
    if (inPiu > 0) {
      const piu = doc.createElement('span');
      piu.className = 'talos-muted talos-approval__campi-in-piu';
      piu.textContent = tn('chat.approval.group.moreFieldsOne', 'chat.approval.group.moreFieldsMany', inPiu, { count: inPiu });
      voce.append(piu);
    }
    if (indice >= visibili) { voce.hidden = true; nascoste.push(voce); }
    blocco.append(voce);
  }
  if (nascoste.length) {
    const tutto = doc.createElement('button');
    tutto.type = 'button';
    tutto.className = 'talos-button talos-button--ghost talos-button--sm talos-approval__mostra-tutto';
    tutto.setAttribute('aria-expanded', 'false');
    const elencate = gruppo.chiamate.length; // with calls left out, «Show all» opens the ones listed, and the line below says the rest
    tutto.textContent = t('chat.approval.group.showAll', { count: elencate });
    tutto.addEventListener('click', () => {
      const apri = tutto.getAttribute('aria-expanded') !== 'true';
      for (const v of nascoste) v.hidden = !apri;
      tutto.setAttribute('aria-expanded', apri ? 'true' : 'false');
      tutto.textContent = apri ? t('chat.approval.group.showLess') : t('chat.approval.group.showAll', { count: elencate });
    });
    blocco.append(tutto);
  }
  /* 0.2.4 block 1, item 7: the calls the kernel did not list are said, with the answer that covers them (never approved unseen in silence) */
  const altre = Number.isInteger(gruppo.nonMostrate) && gruppo.nonMostrate > 0 ? gruppo.nonMostrate : 0;
  if (altre > 0) {
    const resto = doc.createElement('p');
    resto.className = 'talos-muted talos-approval__chiamate-in-piu';
    resto.dataset.chiamateNonMostrate = String(altre);
    resto.textContent = tn('chat.approval.group.moreCallsOne', 'chat.approval.group.moreCallsMany', altre, { count: altre });
    blocco.append(resto);
  }
  return blocco;
}
