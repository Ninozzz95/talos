/*
 * PORTO FEDELE di AVM/mobile/src/lib/research/researchRecheckHistory.ts (176 righe, 11/09/2026).
 *
 * ⛔⛔ TENUTA-NEL-TEMPO-01 — quanto vale OGGI un rapporto di ieri.
 *
 * ## Cosa dice la letteratura, e perché cambia il calcolo
 *
 * Il decadimento delle citazioni web ha DUE assi, e confonderli è l'errore
 * standard: il *link rot* è l'indirizzo che muore, il *content drift* è la
 * pagina che risponde ancora e non dice più ciò che era stato citato. Lo studio
 * di riferimento (Zittrain et al., Harvard Law Review 127 — il lavoro da cui è
 * nato Perma.cc) misura il secondo a mano, controllando se il link «produce
 * ancora la fonte originale»: fra i link ancora VIVI, solo il **29,9%**
 * conteneva davvero il materiale citato. L'emivita dei riferimenti web è
 * stimata fra i ~5 e i ~14 anni a seconda del corpus, e la regola pratica è che
 * i primi cinque anni una bibliografia li attraversa quasi intatta.
 *
 * ⇒ Da qui la scelta che conta: **la tenuta si conta sui PASSAGGI, non sulle
 * pagine**. Una pagina «cambiata» che conserva tutte le frasi su cui il
 * rapporto si appoggia non gli ha tolto niente, e contarla come una perdita
 * farebbe scendere un numero che nella sostanza non è sceso. È la stessa
 * domanda che quegli studi pongono a mano — noi la possiamo porre da soli
 * perché il testo di allora ce l'abbiamo.
 *
 * ## ⛔ Il ricontrollo c'era già, e non si poteva rileggere
 *
 * Ogni ricontrollo scriveva il suo documento in Libreria — in prosa, per una
 * persona. Bello da leggere e impossibile da confrontare: ricavare i numeri
 * ripassando l'italiano stampato è esattamente il modo in cui una misura
 * diventa un'invenzione.
 *
 * ⇒ Il documento resta identico per chi lo legge, e in fondo porta un blocco
 * che si rilegge ESATTO. Blocco recintato in coda, non frontmatter: è il posto
 * in cui il Markdown conserva i dati strutturati (lo stesso trattamento che
 * riceve JSON-LD), mentre il frontmatter è per i metadati e passerebbe sopra
 * all'intestazione che la persona legge.
 */

import { talosResearchRecheckStanding } from './recheck.mjs';

/** @typedef {import('./recheck.mjs').TalosResearchRecheck} TalosResearchRecheck */

const FENCE_OPEN = '```talos-research-recheck';
const FENCE_CLOSE = '```';

/**
 * Una tappa della storia: un ricontrollo, con quanto reggeva quel giorno.
 *
 * @typedef {object} TalosResearchRecheckTappa
 * @property {string} at
 * @property {number} total
 * @property {number} intact
 * @property {number} changed
 * @property {number} unreachable
 * @property {number} passagesStanding
 * @property {number} passagesLost
 * @property {number | null} tenuta
 *   Quanti passaggi citati reggono ancora, da 0 a 1 — `null` quando non ce
 *   n'era nessuno da controllare.
 *   ⛔ `null` e 0 sono due cose diverse: «non c'era niente da controllare» e
 *   «non regge più niente». Un `null` letto come zero disegna un crollo che
 *   non è mai avvenuto.
 */

/**
 * La tappa col suo `runId`, come sta scritta nel documento.
 *
 * @typedef {TalosResearchRecheckTappa & {runId: string}} TalosResearchRecheckRecord
 */

/**
 * La tappa, e quanto è cambiata rispetto a quella prima di lei.
 *
 * @typedef {TalosResearchRecheckTappa & {primo: boolean, delta: number | null}} TalosResearchRecheckPasso
 */

/**
 * @param {string} runId
 * @param {TalosResearchRecheck} recheck
 * @returns {TalosResearchRecheckRecord}
 */
function tappaDi(runId, recheck) {
  const standing = talosResearchRecheckStanding(recheck);
  // ⛔ `standing` aggrega solo i passaggi PERSI: quelli che reggono stanno
  //   sulle singole fonti e vanno sommati qui. Senza il totale, «3 persi» non
  //   dice niente — tre su quattro e tre su trecento sono due rapporti diversi.
  const reggono = recheck.sources.reduce((totale, fonte) => totale + fonte.passagesStanding, 0);
  const passaggi = reggono + standing.passagesLost;

  return {
    runId,
    at: recheck.at,
    total: standing.total,
    intact: standing.intact,
    changed: standing.changed,
    unreachable: standing.unreachable,
    passagesStanding: reggono,
    passagesLost: standing.passagesLost,
    tenuta: passaggi > 0 ? reggono / passaggi : null,
  };
}

/**
 * Il blocco da appendere al documento del ricontrollo.
 *
 * ⛔ Porta il `runId`: il nome del file è la domanda, e due ricerche possono
 * farsi la stessa domanda. Legare la storia al nome vorrebbe dire mescolare i
 * ricontrolli di ricerche diverse e non accorgersene mai.
 *
 * @param {string} runId
 * @param {TalosResearchRecheck} recheck
 * @returns {string}
 */
export function talosResearchRecheckBlock(runId, recheck) {
  return [FENCE_OPEN, JSON.stringify(tappaDi(runId, recheck)), FENCE_CLOSE].join('\n');
}

/**
 * La tappa dentro un documento, o `null` se lì non c'è.
 *
 * ⛔ Un documento vecchio — scritto prima che il blocco esistesse — torna
 * `null`, non un oggetto a zero. Uno zero finirebbe nella storia come un
 * crollo, e sarebbe un crollo inventato dal nostro formato.
 *
 * @param {string | null | undefined} text
 * @returns {TalosResearchRecheckRecord | null}
 */
export function talosResearchParseRecheckBlock(text) {
  if (!text) return null;
  const apre = text.indexOf(FENCE_OPEN);
  if (apre < 0) return null;
  const daCapo = text.indexOf('\n', apre);
  if (daCapo < 0) return null;
  const chiude = text.indexOf(FENCE_CLOSE, daCapo);
  if (chiude < 0) return null;

  try {
    const letto = JSON.parse(text.slice(daCapo + 1, chiude).trim());
    if (typeof letto.runId !== 'string' || typeof letto.at !== 'string') return null;
    /** @param {string} chiave */
    const numero = (chiave) => (typeof letto[chiave] === 'number' ? letto[chiave] : 0);
    return {
      runId: letto.runId,
      at: letto.at,
      total: numero('total'),
      intact: numero('intact'),
      changed: numero('changed'),
      unreachable: numero('unreachable'),
      passagesStanding: numero('passagesStanding'),
      passagesLost: numero('passagesLost'),
      tenuta: typeof letto.tenuta === 'number' ? letto.tenuta : null,
    };
  } catch {
    // Un blocco rotto è un blocco che non c'è. Non si indovina.
    return null;
  }
}

/**
 * La storia in ordine di tempo, con il salto da una tappa all'altra.
 *
 * ⛔ Il delta si calcola solo fra due tappe che hanno ENTRAMBE una tenuta: da
 * `null` a 0,86 non è un guadagno dell'86%, è la prima misura.
 *
 * @param {readonly TalosResearchRecheckTappa[]} tappe
 * @returns {readonly TalosResearchRecheckPasso[]}
 */
export function talosResearchRecheckStoria(tappe) {
  const ordinate = [...tappe]
    .filter((tappa) => Number.isFinite(Date.parse(tappa.at)))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  // Lo stesso istante due volte è lo stesso ricontrollo salvato due volte:
  // due righe identiche nella storia sono rumore, non un secondo controllo.
  /** @type {Set<string>} */
  const viste = new Set();
  const distinte = ordinate.filter((tappa) => {
    if (viste.has(tappa.at)) return false;
    viste.add(tappa.at);
    return true;
  });

  return distinte.map((tappa, indice) => {
    const prima = indice > 0 ? distinte[indice - 1] : null;
    const confrontabile = prima !== null && prima.tenuta !== null && tappa.tenuta !== null;
    return {
      ...tappa,
      primo: indice === 0,
      delta: confrontabile ? tappa.tenuta - prima.tenuta : null,
    };
  });
}
