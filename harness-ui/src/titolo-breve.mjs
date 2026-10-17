/*
 * ⭐ 15/10/2026 — UNA REGOLA SOLA PER I NOMI CORTI (titolo automatico di una sessione, nome di una delega, giro di un'automazione).
 *
 * Il difetto, visto nelle foto del 4174: in «Riprendi il lavoro» una sessione si chiamava «…dimmi se la mia idea e concettualmen».
 *   Le forme erano cinque: il client tagliava a 80 secchi, senza puntini; il server derivava il nome da `consegnaCorta` (77 + «...»);
 *   `nomeCortoDaConsegna` faceva 79 + «…» a metà parola; il nome del giro di un'automazione 80 secchi. E `rinomina` contava in
 *   unità UTF-16: un titolo con emoji che il client riteneva corto veniva rifiutato (`QUERY_INVALID`), in silenzio (revisione del
 *   bugfixer, REV-TITOLO-01..05).
 * ⇒ La regola:
 *   - si conta per GRAFEMA, cioè ciò che si vede come un carattere (`Intl.Segmenter`, granularità `grapheme`, Node ≥ 16). Una famiglia
 *     unita da ZWJ o una bandiera vale 1 e non si spezza mai (MDN «Intl.Segmenter»; emojifyi, «Emoji string length gotchas», letti il
 *     15/10/2026);
 *   - entro `massimo` grafemi il testo resta com'è, con gli spazi raccolti;
 *   - oltre, si ferma all'ultimo spazio (anche NBSP, ideografico, sottile: `\s`) che non sia più indietro di metà del tetto, toglie la
 *     punteggiatura rimasta in fondo e chiude con «…». Senza uno spazio utile (una parola sola, il cinese) il taglio è secco;
 *   - `riserva` lascia posto a un suffisso che va DOPO (il «-2» dei doppioni), così nome e suffisso stanno insieme nel tetto.
 * ⛔ Il client ha la stessa regola in `frontend/src/components/session-item.js` (`titoloDalPrimoMessaggio`): il pacchetto del
 *   browser non importa moduli del server. `tests/titolo-breve-parita.test.mjs` tiene uguali le due copie su un elenco di casi.
 */

export const TITOLO_MASSIMO = 80;

const segmentatore = typeof Intl?.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

/** I grafemi del testo (ripiego per carattere vero se `Intl.Segmenter` non c'è). */
export function grafemi(testo) {
  const s = String(testo ?? '');
  return segmentatore ? Array.from(segmentatore.segment(s), (x) => x.segment) : [...s];
}

/** I primi `massimo` grafemi, senza puntini: un tetto che non spezza mai una bandiera o una famiglia (REV2-07). */
export function primiGrafemi(testo, massimo) {
  return grafemi(testo).slice(0, Math.max(0, massimo)).join('');
}

/** Quanti grafemi: l'unità in cui si misura un nome, sul server e nel client. */
export function contaGrafemi(testo) {
  return grafemi(testo).length;
}

/**
 * @param {unknown} testo
 * @param {number} [massimo] il tetto in grafemi, puntini compresi
 * @param {{ riserva?: number }} [opzioni] grafemi da lasciare liberi per un suffisso che va dopo
 * @returns {string}
 */
export function titoloBreve(testo, massimo = TITOLO_MASSIMO, { riserva = 0 } = {}) {
  const pulito = String(testo ?? '').replace(/\s+/gu, ' ').trim();
  const tetto = Math.max(2, massimo - Math.max(0, riserva));
  const parti = grafemi(pulito);
  if (parti.length <= tetto) return pulito;
  const dentro = parti.slice(0, tetto - 1);
  let spazio = -1;
  for (let i = dentro.length - 1; i >= 0; i -= 1) if (/^\s+$/u.test(dentro[i])) { spazio = i; break; }
  const taglio = (spazio >= Math.floor(tetto / 2) ? dentro.slice(0, spazio) : dentro).join('');
  /* REV2-04 (bugfixer, 15/10): un testo di sola punteggiatura («-----», «!!!!») restava «…»: se togliere la coda lascia il
     vuoto, si tiene il taglio secco */
  const pulitoInFondo = taglio.replace(/[\s,.;:!?…–—-]+$/u, '');
  return `${pulitoInFondo || dentro.join('')}…`;
}

/**
 * Il nome con il numero del doppione («-2»): il suffisso sta dentro il tetto e va PRIMA dei puntini. È `nomeConSuffisso` di
 * `session-item.js` (client), la stessa regola: la usano `nomeMostrato` qui sotto e il registro, che dal 16/10/2026 dà il numero
 * anche a una sessione che nasce col nome di un'altra viva (owner, «-2 anche dal server»).
 */
export function nomeConSuffisso(base, suffisso, massimo = TITOLO_MASSIMO) {
  const corto = titoloBreve(base, massimo, { riserva: contaGrafemi(suffisso) });
  return corto.endsWith('…') ? `${corto.slice(0, -1)}${suffisso}…` : `${corto}${suffisso}`;
}

/*
 * ⭐ 15/10/2026 sera, decisione dell'owner («sì, solo a schermo»): i nomi già salvati nella forma di un taglio automatico di PRIMA si
 *   mostrano con la regola nuova. Le forme di prima, tutte quelle che il codice produceva: il client tagliava a 80 caratteri secchi
 *   (`titoloDalPrimoMessaggio`, spazi raccolti), il server a 77 + «...» (`consegnaCorta`, sul testo grezzo e sulla frase della bolla),
 *   le deleghe a 79 + «…» (`nomeCortoDaConsegna`); con un doppione, in coda un «-N».
 * ⛔ Riconosce SOLO una di quelle forme esatte del testo della sessione: un nome scelto dalla persona non coincide con un taglio a
 *   metà parola del suo primo messaggio, e resta com'è. Sul disco non si scrive niente: è la sola lettura che cambia.
 */
function formeDiPrima(testo) {
  const grezzo = String(testo ?? '');
  const pulito = grezzo.replace(/\s+/gu, ' ').trim();
  if (!pulito) return [];
  const forme = new Set([pulito.slice(0, 80), pulito.slice(0, 80).trim()]);
  if (pulito.length > 80) { forme.add(`${pulito.slice(0, 77)}...`); forme.add(`${pulito.slice(0, 79)}…`); }
  if (grezzo.length > 80) forme.add(`${grezzo.slice(0, 77)}...`);
  /* REV3-TITOLO-01 (bugfixer, 15/10): il nome DERIVATO di prima (sessione mai rinominata: CLI, API) tagliava il grezzo a 77 e
     POI raccoglieva gli spazi — un primo messaggio su più righe restava «…è conce...» */
  if (grezzo.length > 80) forme.add(`${grezzo.slice(0, 77)}...`.replace(/\s+/gu, ' ').trim());
  return [...forme];
}

/** Il nome da mostrare: quello salvato, oppure la regola nuova se è un taglio automatico di prima di uno dei `testi` della sessione. */
export function nomeMostrato(nome, testi = []) {
  if (typeof nome !== 'string' || nome === '') return nome;
  const doppione = /^(.*?)(-\d+)$/su.exec(nome);
  const letture = doppione ? [[nome, ''], [doppione[1], doppione[2]]] : [[nome, '']];
  for (const [base, suffisso] of letture) {
    for (const testo of testi) {
      if (typeof testo !== 'string' || testo.trim() === '' || !formeDiPrima(testo).includes(base)) continue;
      return suffisso ? nomeConSuffisso(testo, suffisso) : titoloBreve(testo);
    }
  }
  return nome;
}
