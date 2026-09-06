/*
 * Cancello unico, classe 2 — CONTROLLI MORTI: un bottone che non fa niente.
 *
 * ⛔ 06/9, prova T14 — la voce di menu «Note» aveva un `data-vaia="note"`, un gestore delegato
 * esisteva davvero sulla radice, e il clic finiva comunque nella chat: `VISTA_PER_VAIA` non
 * conosceva la chiave `note`. Un cancello che si ferma a «c'è un ascoltatore» avrebbe detto che
 * era tutto a posto. È per questo che qui il giudizio ha DUE metà, e la seconda è il cuore:
 *   1. risalire la catena degli antenati fino a trovare chi ascolta;
 *   2. verificare che il VALORE su cui quella delega discrimina sia fra quelli che conosce.
 *
 * ── Come si raccoglie l'inventario (NON lo fa questo file) ────────────────────────────────────
 * Con `DOMDebugger.getEventListeners` da una **sessione CDP** di Playwright
 * (`browserContext.newCDPSession(page)`): si prende l'`objectId` con `Runtime.evaluate`, poi si
 * chiede la lista con `depth: -1` (tutto il sottoalbero: il valore predefinito è 1) e
 * `pierce: true` (attraversa iframe e shadow root, predefinito false).
 * ⛔ `page.evaluate` NON ha i permessi per `getEventListeners`: quella funzione esiste solo nella
 * console di DevTools e nel protocollo, e da dentro la pagina non è raggiungibile.
 * Letto il 06/09/2026: Chrome DevTools Protocol, dominio DOMDebugger · puppeteer#5319 ·
 * chromedp/cdproto/domdebugger — che segnala anche il limite vero della tecnica: con la delega
 * l'ascoltatore sta su un contenitore, e «sapere se un clic su QUEL figlio farà qualcosa» non si
 * legge dalla lista degli ascoltatori. Quel pezzo mancante è esattamente questo modulo.
 *
 * ── Cosa fa questo file ───────────────────────────────────────────────────────────────────────
 * Solo il GIUDIZIO, su dati già raccolti: funzioni pure, nessun browser, nessuna rete, nessun
 * disco. Si provano senza avviare niente, ed è il punto.
 *
 * ⛔ Zero falsi positivi è un requisito, non un desiderio: un rapporto che grida al lupo non
 * viene più letto. Dove non abbiamo la prova, la risposta è «ignoto» col motivo scritto — mai
 * «morto». Ogni eccezione qui sotto ha il suo perché accanto.
 *
 * ── La forma dei dati ─────────────────────────────────────────────────────────────────────────
 * voce:   {selettore, tag, testo, attributi:{...}, antenati:[{tag, attributi, ascoltatori?}], ascoltatori:[...]}
 *         `antenati` non ha bisogno di un ordine: nessuna regola qui dipende dalla distanza.
 * delega: {nome, su:'#root', evento:'click', attributo:'data-vaia', valoriRiconosciuti:[...],
 *          attributiRichiesti?:[], interrompeAncheSeIgnoto?:false, esaustiva?:false}
 *         L'ordine dell'elenco è quello dei controlli dentro il gestore vero.
 */

/** Gli eventi che, se ascoltati, rendono vivo un controllo: sono i modi in cui si «preme». */
export const EVENTI_DI_ATTIVAZIONE = new Set([
  'click', 'auxclick', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup',
  'touchstart', 'touchend', 'keydown', 'keyup', 'keypress', 'change', 'input', 'submit', 'toggle',
]);

/** I tag che sono controlli per natura. Un `div` lo diventa solo con un ruolo o un tabindex. */
const TAG_INTERATTIVI = new Set(['button', 'a', 'input', 'select', 'textarea', 'summary', 'label', 'option']);

/** I ruoli ARIA che promettono un'azione a chi usa un lettore di schermo: la promessa va mantenuta. */
const RUOLI_INTERATTIVI = new Set([
  'button', 'link', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
  'option', 'switch', 'checkbox', 'radio', 'treeitem', 'combobox', 'slider', 'spinbutton',
]);

/*
 * ⛔ Eccezione dichiarata: un campo dove si SCRIVE non è morto se nessuno lo ascolta — tiene un
 * valore che qualcun altro legge al momento dell'invio. Accusarlo sarebbe il falso positivo più
 * numeroso di tutti, perché nella app i campi sono decine.
 */
const INPUT_CHE_TENGONO_UN_VALORE = new Set([
  'text', 'search', 'email', 'url', 'tel', 'password', 'number', 'date', 'time',
  'datetime-local', 'month', 'week', 'color', 'range', 'file', 'hidden', 'checkbox', 'radio',
]);

export const MOTIVI = {
  NESSUN_ASCOLTATORE: 'nessun-ascoltatore',
  VALORE_NON_RICONOSCIUTO: 'valore-non-riconosciuto',
  DELEGA_NON_MONTATA: 'delega-non-montata',
};

/*
 * ── Il mini-selettore ────────────────────────────────────────────────────────────────────────
 * Una delega dichiara su QUALE antenato sta appesa (`su: '#root'`). Qui non c'è un DOM, quindi
 * non c'è `matches()`: si confronta a mano un selettore COMPOSTO (tag, #id, .classe, [attr],
 * [attr="v"]). ⛔ Nessun combinatore (spazio, `>`, `,`): se ne servisse uno, il posto giusto è
 * dichiarare l'antenato con un attributo, non far crescere un motore CSS finto qui dentro — e
 * un selettore che non si sa leggere DEVE gridare, non rispondere «no» facendo passare per sano
 * un controllo che nessuno ha davvero guardato.
 */
export function corrispondeSemplice(nodo, selettore) {
  const sel = String(selettore ?? '').trim();
  if (!sel) return false;
  if (/[\s>+~,]/.test(sel)) throw new Error(`selettore troppo complesso per il cancello: "${sel}" (niente combinatori)`);
  const attributi = nodo?.attributi || {};
  const pezzi = sel.match(/^[a-zA-Z][\w-]*|#[^.#[\]]+|\.[^.#[\]]+|\[[^\]]+\]/g) || [];
  if (!pezzi.length || pezzi.join('') !== sel) return false;
  const classi = String(attributi.class ?? '').split(/\s+/).filter(Boolean);
  return pezzi.every((pezzo) => {
    if (pezzo.startsWith('#')) return String(attributi.id ?? '') === pezzo.slice(1);
    if (pezzo.startsWith('.')) return classi.includes(pezzo.slice(1));
    if (pezzo.startsWith('[')) {
      const dentro = pezzo.slice(1, -1);
      const uguale = dentro.indexOf('=');
      if (uguale === -1) return attributi[dentro.trim()] !== undefined;
      const nome = dentro.slice(0, uguale).trim();
      const atteso = dentro.slice(uguale + 1).trim().replace(/^["']|["']$/g, '');
      return String(attributi[nome] ?? '') === atteso;
    }
    return String(nodo?.tag ?? '').toLowerCase() === pezzo.toLowerCase();
  });
}

/**
 * I tipi degli ascoltatori di una voce, normalizzati.
 * ⛔ `undefined` e `null` NON sono «nessun ascoltatore»: sono «non raccolti». La differenza è
 * tutta la distanza fra un rapporto onesto e un'accusa inventata, quindi torna `null` e chi
 * giudica si ferma.
 * @returns {Set<string>|null}
 */
export function tipiAscoltatori(ascoltatori) {
  if (ascoltatori === undefined || ascoltatori === null) return null;
  const lista = Array.isArray(ascoltatori) ? ascoltatori : [ascoltatori];
  return new Set(lista
    .map((a) => String(typeof a === 'string' ? a : (a?.tipo ?? a?.type ?? '')).toLowerCase())
    .filter(Boolean));
}

const haAttivazione = (tipi) => Boolean(tipi) && [...tipi].some((t) => EVENTI_DI_ATTIVAZIONE.has(t));

/** Il valore che la delega legge dall'elemento: l'attributo dichiarato, o niente. */
function valoreDiscriminante(voce, delega) {
  if (!delega?.attributo) return null;
  const v = (voce?.attributi || {})[delega.attributo];
  return v === undefined ? null : String(v);
}

/**
 * Il valore è fra quelli che quella delega conosce?
 * `valoriRiconosciuti` è la lista VERA presa da fuori (le chiavi di `VISTA_PER_VAIA`, gli id dei
 * veli che esistono davvero…). `'*'` significa «qualunque valore non vuoto» — si usa solo per le
 * deleghe che non consultano nessuna mappa.
 */
export function valoreRiconosciuto(delega, valore) {
  const ammessi = delega?.valoriRiconosciuti;
  if (ammessi === '*' || ammessi === undefined || ammessi === null) return String(valore ?? '').trim() !== '';
  const lista = Array.isArray(ammessi) ? ammessi : Object.keys(ammessi);
  return lista.map(String).includes(String(valore));
}

/** La delega guarda QUESTO elemento? (solo la forma: attributo presente, attributi richiesti) */
function delegaGuardaLaVoce(voce, delega) {
  const attributi = voce?.attributi || {};
  const richiesti = Array.isArray(delega?.attributiRichiesti) ? delega.attributiRichiesti : [];
  if (richiesti.length && !richiesti.every((a) => attributi[a] !== undefined)) return false;
  if (delega?.attributo) return attributi[delega.attributo] !== undefined;
  return richiesti.length > 0;
}

/** L'antenato che porta la delega esiste nella catena, e ascolta davvero quell'evento? */
function delegaMontata(voce, delega) {
  const antenati = Array.isArray(voce?.antenati) ? voce.antenati : [];
  const portanti = antenati.filter((a) => corrispondeSemplice(a, delega.su));
  if (!portanti.length) return { presente: false, ascolta: false };
  const evento = String(delega.evento || 'click').toLowerCase();
  const ascolta = portanti.some((a) => {
    const tipi = tipiAscoltatori(a.ascoltatori);
    // ⛔ Antenato senza lista raccolta: non si può dire che NON ascolti. Si dà per montata, e il
    //    dubbio non diventa un'accusa. È l'unico verso in cui accettiamo di sbagliare.
    return tipi === null ? true : tipi.has(evento);
  });
  return { presente: true, ascolta };
}

/**
 * Un comportamento che il browser dà da solo: senza queste eccezioni il cancello accuserebbe
 * ogni link vero e ogni pulsante d'invio di un modulo, cioè griderebbe al lupo dal primo giro.
 * @returns {string|null} il perché è vivo, o null
 */
export function comportamentoNativo(voce) {
  const tag = String(voce?.tag ?? '').toLowerCase();
  const attributi = voce?.attributi || {};
  const antenati = Array.isArray(voce?.antenati) ? voce.antenati : [];
  const haAntenato = (t) => antenati.some((a) => String(a?.tag ?? '').toLowerCase() === t);
  // un `onclick=` nell'HTML non compare fra gli ascoltatori del protocollo, ma il clic fa qualcosa
  if (Object.keys(attributi).some((a) => /^on[a-z]+$/i.test(a))) return 'gestore scritto nell’attributo (on…)';
  // il popover e i comandi nativi si aprono senza una riga di JavaScript
  if (attributi.popovertarget !== undefined || attributi.commandfor !== undefined) return 'apre un popover nativo';
  if (tag === 'a') {
    const href = String(attributi.href ?? '').trim();
    // ⛔ `href="#"` e `javascript:void(0)` NON sono navigazione: sono il travestimento classico di
    //    un bottone morto, e vanno giudicati come tali invece di essere assolti.
    if (href && href !== '#' && !/^javascript:/i.test(href)) return 'link con una destinazione vera';
    return null;
  }
  if (tag === 'label') return attributi.for !== undefined ? 'etichetta legata a un campo' : null;
  if (tag === 'summary') return haAntenato('details') ? 'apre il suo <details>' : null;
  if (tag === 'option') return 'voce di un <select>: la sceglie il campo, non un ascoltatore';
  if (tag === 'select' || tag === 'textarea') return 'campo che tiene un valore letto da qualcun altro';
  if (tag === 'input') {
    const tipo = String(attributi.type ?? 'text').toLowerCase();
    if (tipo === 'submit' || tipo === 'reset' || tipo === 'image') return haAntenato('form') ? 'invia o azzera il suo modulo' : null;
    if (INPUT_CHE_TENGONO_UN_VALORE.has(tipo)) return 'campo che tiene un valore letto da qualcun altro';
    return null;
  }
  if (tag === 'button') {
    // ⛔ `<button>` senza `type` vale `submit`: dentro un modulo è vivo anche senza ascoltatori.
    const tipo = String(attributi.type ?? 'submit').toLowerCase();
    if ((tipo === 'submit' || tipo === 'reset') && haAntenato('form')) return 'invia o azzera il suo modulo';
  }
  return null;
}

/** È un controllo, cioè qualcosa che promette un'azione a chi lo guarda? */
export function eUnControllo(voce) {
  const tag = String(voce?.tag ?? '').toLowerCase();
  const attributi = voce?.attributi || {};
  if (TAG_INTERATTIVI.has(tag)) return true;
  if (RUOLI_INTERATTIVI.has(String(attributi.role ?? '').toLowerCase())) return true;
  // un tabindex da 0 in su mette l'elemento nel giro del TAB: promette di essere premibile
  return attributi.tabindex !== undefined && Number(attributi.tabindex) >= 0;
}

/**
 * Chi serve questo controllo: il suo ascoltatore, una delega su un antenato, o il browser.
 * @param {object} voce
 * @param {{deleghe?: Array}} [contesto] le deleghe DICHIARATE, nell'ordine dei controlli nel gestore
 * @returns {{vivo:boolean|null, via:string|null, motivo:string|null, perche:string,
 *           delega?:object, attributo?:string, valore?:string}}
 *   `vivo:null` = non lo sappiamo, e non si accusa: il motivo dice perché.
 */
export function haGestore(voce, { deleghe = [] } = {}) {
  if (!eUnControllo(voce)) {
    return { vivo: null, via: null, motivo: 'non-un-controllo', perche: 'non promette nessuna azione: né tag interattivo, né ruolo, né tabindex' };
  }
  const attributi = voce?.attributi || {};
  // ⛔ Un controllo spento di proposito non è un controllo morto: è la app che dice «non ora».
  if (attributi.disabled !== undefined || String(attributi['aria-disabled'] ?? '') === 'true') {
    return { vivo: null, via: null, motivo: 'disabilitato', perche: 'dichiarato spento: l’inerzia è voluta' };
  }
  const nativo = comportamentoNativo(voce);
  const propri = tipiAscoltatori(voce?.ascoltatori);
  if (propri === null && !nativo) {
    return { vivo: null, via: null, motivo: 'ascoltatori-non-raccolti', perche: 'la lista degli ascoltatori non è stata raccolta per questo elemento: senza quella non si giudica' };
  }
  if (haAttivazione(propri)) return { vivo: true, via: 'proprio', motivo: null, perche: 'ha un ascoltatore suo per un evento di attivazione' };
  if (nativo) return { vivo: true, via: 'nativo', motivo: null, perche: nativo };

  let sospesa = null; // la prima accusa: si tiene solo se nessuna delega più avanti lo salva
  for (const delega of deleghe) {
    if (!delegaGuardaLaVoce(voce, delega)) continue;
    const montata = delegaMontata(voce, delega);
    if (!montata.presente) continue; // quella delega vive su un altro ramo: qui non c'entra
    const valore = valoreDiscriminante(voce, delega);
    const nome = delega.nome || delega.attributo || delega.su;
    if (!montata.ascolta) {
      sospesa = sospesa || {
        vivo: false, via: null, motivo: MOTIVI.DELEGA_NON_MONTATA, delega, attributo: delega.attributo ?? null, valore,
        perche: `l’antenato «${delega.su}» che porta la delega «${nome}» non ascolta ${delega.evento || 'click'}: non è mai stata agganciata`,
      };
      continue;
    }
    /*
     * ⛔ Una delega che non discrimina su nessun VALORE (la disclosure: le basta che ci siano
     * `aria-expanded` e `aria-controls`) è già riconosciuta dalla sola forma. Senza questa riga
     * cadeva nel ramo del «valore non riconosciuto» con un valore che non esiste — cioè accusava
     * ogni disclosure sana della app: il falso positivo trovato dalla prova, non previsto.
     */
    if (!delega.attributo || valoreRiconosciuto(delega, valore)) {
      return {
        vivo: true, via: 'delegato', motivo: null, delega, attributo: delega.attributo ?? null, valore,
        perche: `servito dalla delega «${nome}» su ${delega.su}${valore === null ? '' : `, e il valore «${valore}» è fra quelli che conosce`}`,
      };
    }
    /*
     * ⭐ IL CUORE. L'ascoltatore c'è, il valore no: è il caso «Note» del 06/9 — `data-vaia="note"`,
     * delega viva sulla radice, e `VISTA_PER_VAIA` senza la chiave `note`. Un cancello che si
     * ferma a «c'è un ascoltatore» qui dice che va tutto bene, ed è per questo che esiste questo
     * ramo invece di un `return vivo`.
     */
    const accusa = {
      vivo: false, via: null, motivo: MOTIVI.VALORE_NON_RICONOSCIUTO, delega, attributo: delega.attributo ?? null, valore,
      perche: `«${delega.attributo}="${valore}"» non è fra i valori che la delega «${nome}» riconosce: il clic arriva e non produce niente`,
    };
    /*
     * ⛔ Alcune deleghe rispondono alla sola PRESENZA dell'attributo e poi escono dal gestore
     * (`if (apre) { …; return; }`): lì un valore ignoto CONSUMA il clic e le regole successive non
     * girano nemmeno. Dove invece la mappa sta dentro la condizione (`if (v && MAPPA[v])`) il
     * gestore prosegue, e una regola più avanti può ancora servire l'elemento — per questo
     * l'accusa resta sospesa invece di chiudere subito.
     */
    if (delega.interrompeAncheSeIgnoto) return accusa;
    sospesa = sospesa || accusa;
  }
  if (sospesa) return sospesa;

  /*
   * ⛔ L'ultima guardia contro i falsi positivi: un antenato può avere un ascoltatore che nessuna
   * delega dichiarata descrive. Non sapendo cosa fa, non si accusa — a meno che le deleghe di quel
   * gestore non si dichiarino ESAUSTIVE («questo ascoltatore è tutto qui»): allora un elemento che
   * nessuna regola guarda è davvero servito da nessuno.
   */
  const antenati = Array.isArray(voce?.antenati) ? voce.antenati : [];
  const nonSpiegato = antenati.find((a) => {
    const tipi = tipiAscoltatori(a.ascoltatori);
    if (!haAttivazione(tipi)) return false;
    return !deleghe.some((d) => d.esaustiva && corrispondeSemplice(a, d.su) && tipi.has(String(d.evento || 'click').toLowerCase()));
  });
  if (nonSpiegato) {
    return {
      vivo: null, via: null, motivo: 'ascoltatore-antenato-non-dichiarato',
      perche: `un antenato (${nonSpiegato.selettore || nonSpiegato.tag}) ascolta, ma nessuna delega dichiarata lo descrive: da qui non si può dire se il clic faccia qualcosa`,
    };
  }
  return {
    vivo: false, via: null, motivo: MOTIVI.NESSUN_ASCOLTATORE,
    perche: 'nessun ascoltatore suo, nessuna delega su un antenato, nessun comportamento nativo',
  };
}

/*
 * La gravità non è un aggettivo: dice quanto è probabile che nessuno se ne accorga. Un valore non
 * riconosciuto è il peggiore perché la app SEMBRA collegata — l'ascoltatore c'è — e il clic muore
 * in silenzio; «nessun ascoltatore» lo trova prima o poi anche un occhio.
 */
const GRAVITA = {
  [MOTIVI.VALORE_NON_RICONOSCIUTO]: 'alta',
  [MOTIVI.DELEGA_NON_MONTATA]: 'alta',
  [MOTIVI.NESSUN_ASCOLTATORE]: 'media',
};
const ORDINE = [MOTIVI.VALORE_NON_RICONOSCIUTO, MOTIVI.DELEGA_NON_MONTATA, MOTIVI.NESSUN_ASCOLTATORE];

function riga(voce, esito) {
  return {
    selettore: voce?.selettore ?? '',
    tag: String(voce?.tag ?? '').toLowerCase(),
    testo: String(voce?.testo ?? '').trim(),
    motivo: esito.motivo,
    perche: esito.perche,
    gravita: GRAVITA[esito.motivo] || 'media',
    delega: esito.delega?.nome || esito.delega?.attributo || null,
    attributo: esito.attributo ?? null,
    valore: esito.valore ?? null,
  };
}

/**
 * Il quadro completo: i morti, quelli su cui non ci si può pronunciare, e quanti sono vivi.
 * ⛔ Gli `ignoti` non sono un dettaglio: un rapporto deve poter dire anche CHI NON HA GUARDATO,
 * altrimenti «zero morti» può voler dire «non ho esaminato niente».
 */
export function esaminaInventario(inventario, { deleghe = [] } = {}) {
  const voci = Array.isArray(inventario) ? inventario : [];
  const morti = [];
  const ignoti = [];
  let vivi = 0;
  for (const voce of voci) {
    const esito = haGestore(voce, { deleghe });
    if (esito.vivo === true) { vivi += 1; continue; }
    if (esito.vivo === false) { morti.push(riga(voce, esito)); continue; }
    if (esito.motivo === 'non-un-controllo') continue; // non è un controllo: non se ne parla
    ignoti.push(riga(voce, esito));
  }
  morti.sort((a, b) => (ORDINE.indexOf(a.motivo) - ORDINE.indexOf(b.motivo)) || String(a.selettore).localeCompare(String(b.selettore)));
  return { morti, ignoti, vivi, esaminati: morti.length + ignoti.length + vivi };
}

/**
 * I controlli davvero morti, i più insidiosi per primi: quelli con un ascoltatore che però non
 * riconosce il loro valore, cioè quelli che un cancello ingenuo dichiara sani.
 * @returns {Array<{selettore, tag, testo, motivo, perche, gravita, delega, attributo, valore}>}
 */
export function controlliMorti(inventario, opzioni = {}) {
  return esaminaInventario(inventario, opzioni).morti;
}
