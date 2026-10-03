/*
 * La lingua dei menu e delle superfici (B8 + P-i18n, 06/09) — la meccanica del mockup (H21): la
 * PREFERENZA («Segui il sistema», Italiano, English) e la LINGUA RISOLTA sono due cose; i dati
 * restano neutri.
 *
 * Due strade, una sola lingua:
 *   · i menu del template, marcati `data-t` (testo) e `data-ph` (placeholder), con chiavi astratte;
 *   · tutto ciò che il codice scrive a schermo, con `t('frase italiana')`: la chiave È la frase
 *     italiana (stile gettext/Lingui, lingui.dev «Explicit vs generated IDs», letto il
 *     06/09/2026); senza traduzione resta l'italiano, mai un vuoto. `tn(uno, molti, n)` sceglie la
 *     forma col plurale della lingua risolta (`Intl.PluralRules`, locize «i18n pluralization 2026»).
 * Il dizionario inglese sta in `src/i18n/en.js`, organizzato per categorie.
 *
 * Ricerca 06/09/2026: la scelta esplicita della persona vince sempre sul rilevamento automatico;
 * senza scelta si negozia da `navigator.languages`; `lang` sull'elemento radice dichiara la lingua
 * risolta (phrase.com, MDN Navigator.language, W3C i18n). Un difetto noto in strumenti simili:
 * «Segui il sistema» che non viene ricordato al riavvio — qui la preferenza vive nello store dell'aspetto.
 */
import EN from '../i18n/en.js';
import { TESTI } from '../i18n/testi/index.js';

export const LINGUE = Object.freeze(['sistema', 'it', 'en']);
/* La lingua delle chiavi VECCHIE (la frase italiana come chiave, stile gettext): resta finché il cricchetto del cancello non
   porta a zero le chiamate `t('frase italiana')` (owner 03/10/2026, «chiavi stabili, inglese di riserva»). */
export const LINGUA_PREDEFINITA = 'it';
/* La riserva delle chiavi stabili: una voce che mancasse nella lingua scelta si dice in inglese, mai in italiano. */
export const LINGUA_DI_RISERVA = 'en';
/*
 * ⛔ La PSEUDO-LINGUA del cancello (strato 3, owner 03/10/2026). Non si offre alla persona: si accende con `#lingua=qps` (il
 *   codice della pseudo-lingua di Windows, «qps-ploc»). Ogni testo che passa dal dizionario esce come «⟦Šéttíñgš⟧»; ciò che
 *   sulla pagina resta in chiaro è un testo sfuggito al dizionario (pseudo-localizzazione: simplelocalize, l10n.dev, 03/10).
 */
export const LINGUA_PSEUDO = 'qps';

/* Le vocali accentate della pseudo-lingua: il testo resta leggibile, e si vede a colpo d'occhio che è passato di qui. */
const ACCENTI = Object.freeze({ a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú', n: 'ñ', s: 'š', c: 'ç' });
/** La forma pseudo di un testo: lettere accentate, segnaposto `{nome}` intatti, fra «⟦» e «⟧». */
export function pseudo(testo) {
  const corpo = String(testo ?? '').split(/(\{[a-zA-Z0-9_]+\})/u)
    .map((pezzo) => (/^\{[a-zA-Z0-9_]+\}$/u.test(pezzo) ? pezzo : pezzo.replace(/[aeiouAEIOUnsc]/gu, (c) => ACCENTI[c] ?? c)))
    .join('');
  return `⟦${corpo}⟧`;
}
export const EVENTO_LINGUA = 'talos:lingua';

const DIZIONARI = Object.freeze({ en: EN, [LINGUA_PSEUDO]: EN });

/** I menu del template (chiavi astratte): l'italiano è la lingua di partenza, l'inglese sta nel dizionario. */
export const DIZIONARIO = Object.freeze({
  it: Object.freeze({
    nuova: 'Nuova', luoghi: 'Luoghi', altro: 'Altro', fissate: 'Fissate', sessioni: 'Sessioni', cerca: 'Cerca chat…',
    capability: 'Capability', board: 'Board', libreria: 'Libreria', memoria: 'Memoria', attivita: 'Attività',
    chat: 'Chat', terminale: 'Terminale', review: 'Review', browser: 'Browser', comandi: 'Comandi',
  }),
  en: EN.menu,
  [LINGUA_PSEUDO]: Object.freeze(Object.fromEntries(Object.entries(EN.menu).map(([k, v]) => [k, pseudo(v)]))),
});

export const NOMI_LINGUA = Object.freeze({ it: 'italiano', en: 'English' });

/**
 * La pseudo-lingua dall'àncora dell'indirizzo (strato 3 del cancello, 03/10/2026): `#lingua=qps` e nient'altro. Torna
 *   `LINGUA_PSEUDO` o `null`; ogni altro valore non cambia la lingua, perché la pseudo-lingua non è una scelta della persona.
 *   L'àncora e non la query: il server rifiuta ogni parametro su `/` (QUERY_INVALID), e l'àncora non gli arriva mai — è lo
 *   stesso canale dei parametri del lanciatore (`#open-workspace=…`, `#avvia-doctor=1`).
 */
export function linguaDaIndirizzo(ancora) {
  try { return new URLSearchParams(String(ancora ?? '').replace(/^#/u, '')).get('lingua') === LINGUA_PSEUDO ? LINGUA_PSEUDO : null; } catch { return null; }
}

/** La lingua risolta: la preferenza esplicita, altrimenti la prima lingua del browser che conosciamo, altrimenti l'inglese. */
export function risolviLingua(preferenza, lingueBrowser = []) {
  if (preferenza && preferenza !== 'sistema' && DIZIONARIO[preferenza]) return preferenza;
  const elenco = Array.isArray(lingueBrowser) ? lingueBrowser : [lingueBrowser];
  for (const voce of elenco) {
    const codice = String(voce || '').slice(0, 2).toLowerCase();
    if (DIZIONARIO[codice]) return codice;
  }
  return 'en';
}

/** «Segui il sistema (italiano)» — la preferenza e la lingua che ne risulta, insieme. */
export function etichettaLinguaRisolta(preferenza, risolta) {
  const nome = NOMI_LINGUA[risolta] || risolta;
  /* 03/10/2026: chiavi stabili; il nome della lingua dentro la frase è nella lingua corrente («italiano» / «Italian»), la voce
     del menu fuori dalla frase resta il nome nativo (`NOMI_LINGUA`). */
  return preferenza === 'sistema' || !preferenza
    ? t('impostazioni.language.followSystem', { lingua: NOMI_LINGUA[risolta] ? t(`impostazioni.language.inline.${risolta}`) : nome })
    : nome;
}

/* ---------- t() e tn(): la lingua corrente ---------- */

let linguaCorrente = LINGUA_PREDEFINITA;
let indice = new Map();
let regolePlurale = new Intl.PluralRules(LINGUA_PREDEFINITA);

function costruisciIndice(dizionario) {
  const mappa = new Map();
  for (const [categoria, voci] of Object.entries(dizionario || {})) {
    if (categoria === 'menu') continue; // chiavi astratte, non frasi
    for (const [chiave, valore] of Object.entries(voci)) mappa.set(chiave, valore);
  }
  return mappa;
}

/** Imposta la lingua corrente di `t()`/`tn()`. Torna la lingua davvero impostata. */
export function impostaLingua(lingua) {
  linguaCorrente = DIZIONARI[lingua] || lingua === LINGUA_PREDEFINITA ? lingua : LINGUA_PREDEFINITA;
  indice = linguaCorrente === LINGUA_PREDEFINITA ? new Map() : costruisciIndice(DIZIONARI[linguaCorrente]);
  try { regolePlurale = new Intl.PluralRules(linguaCorrente === LINGUA_PSEUDO ? LINGUA_DI_RISERVA : linguaCorrente); } catch { regolePlurale = new Intl.PluralRules(LINGUA_PREDEFINITA); }
  return linguaCorrente;
}

export function linguaCorrenteDiT() { return linguaCorrente; }

export function interpola(frase, parametri) {
  if (!parametri) return frase;
  return String(frase).replace(/\{([a-zA-Z0-9_]+)\}/g, (tutto, nome) => (nome in parametri ? String(parametri[nome]) : tutto));
}

/* Una chiave stabile: `area.nome` (minuscole, punti, niente spazi). Ciò che non lo è, è una frase italiana vecchia. */
export const FORMA_DELLA_CHIAVE = /^[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9_]+)+$/u;

/**
 * Il testo nella lingua corrente.
 * - Con una CHIAVE STABILE (`t('kernel.contenutoSospetto.segno')`): la voce della lingua, altrimenti quella inglese.
 * - Con una frase italiana (chiave vecchia): la traduzione di `en.js`, altrimenti la frase — è il difetto che il cricchetto
 *   del cancello porta a zero.
 */
export function t(frase, parametri) {
  if (FORMA_DELLA_CHIAVE.test(frase) && TESTI[LINGUA_DI_RISERVA][frase] !== undefined) {
    const lingua = linguaCorrente === LINGUA_PSEUDO ? LINGUA_DI_RISERVA : linguaCorrente;
    const voce = TESTI[lingua]?.[frase] ?? TESTI[LINGUA_DI_RISERVA][frase];
    return interpola(linguaCorrente === LINGUA_PSEUDO ? pseudo(voce) : voce, parametri);
  }
  const tradotta = linguaCorrente === LINGUA_PREDEFINITA ? frase : (indice.get(frase) ?? frase);
  /* 03/10/2026: in pseudo-lingua si marca solo ciò che ha davvero l'inglese. Una frase vecchia SENZA traduzione ricade
     sull'italiano anche in inglese: marcarla la nasconderebbe allo strato 3, che esiste proprio per vederla. */
  return interpola(linguaCorrente === LINGUA_PSEUDO && indice.has(frase) ? pseudo(tradotta) : tradotta, parametri);
}

/** Un elenco detto nella lingua corrente: «a, b e c» / «a, b and c» (`Intl.ListFormat`, congiunzione). */
export function elenco(voci) {
  const lista = (voci ?? []).map(String);
  try { return new Intl.ListFormat(linguaCorrente === LINGUA_PSEUDO ? LINGUA_DI_RISERVA : linguaCorrente, { style: 'long', type: 'conjunction' }).format(lista); }
  catch { return lista.join(', '); }
}

/** La forma singolare o plurale secondo la lingua corrente, con `{n}` già sostituito. */
export function tn(uno, molti, n, parametri) {
  const forma = regolePlurale.select(Number(n)) === 'one' ? uno : molti;
  return t(forma, { n, ...(parametri || {}) });
}

/**
 * Le frasi di `frasi` senza traduzione nella lingua data — per il test di copertura.
 * 03/10/2026 (corsia E): le tabelle dei componenti (nomi degli attrezzi, gruppo «Pull request»…) ora portano CHIAVI stabili.
 *   Una chiave è presente quando la voce c'è nella lingua data E nell'italiano, la lingua sorgente: è il controllo «chiave
 *   della sorgente assente nella lingua di destinazione» di i18n-check (github.com/lingualdev/i18n-check, letto il 03/10/2026).
 *   Una chiave inventata resta mancante, come una frase inventata.
 */
export function traduzioniMancanti(lingua, frasi) {
  const mappa = costruisciIndice(DIZIONARI[lingua]);
  const chiavePresente = (frase) => FORMA_DELLA_CHIAVE.test(frase)
    && TESTI[lingua]?.[frase] !== undefined && TESTI[LINGUA_PREDEFINITA]?.[frase] !== undefined;
  return frasi.filter((frase) => !mappa.has(frase) && !chiavePresente(frase));
}

/* ---------- il template ---------- */

/** `[title]a.b;[aria-label]c.d` → [['title', 'a.b'], ['aria-label', 'c.d']]. Un pezzo senza la forma giusta si scarta. */
export function attributiDaTradurre(valore) {
  return String(valore ?? '').split(';').map((pezzo) => /^\s*\[([a-zA-Z-]+)\]\s*(\S+)\s*$/u.exec(pezzo)).filter(Boolean).map((m) => [m[1], m[2]]);
}

function primoTesto(el) {
  for (const nodo of el.childNodes) if (nodo.nodeType === 3 && nodo.data.trim()) return nodo;
  return null;
}

/**
 * Applica la lingua alla radice: `lang`, i testi `[data-t]` (solo il PRIMO nodo di testo, così un
 * badge di conteggio dentro la scheda «Terminale 2» resta), i placeholder `[data-ph]`, e la lingua
 * di `t()`. Avvisa chi disegna (`talos:lingua` sulla radice) così le superfici si ridisegnano.
 * @returns {number} quanti elementi ha toccato
 */
/*
 * ⛔ Corsia S1 (03/10/2026): `applicaLingua` non gira solo all'avvio ma a OGNI applicazione delle preferenze (anche cambiando il
 *   tema), e i `data-t` del modello stanno anche su testi che il codice aggiorna da solo («Verifica in corso…», il numero delle
 *   notifiche, lo stato di un runtime). Una chiave STABILE si scrive quindi solo se il testo dice ancora la frase del modello (in
 *   una delle due lingue) o l'ultima cosa scritta da qui: un testo cambiato dal codice è uno stato vero, e non si riporta indietro.
 */
const scrittoDaQui = new WeakMap(); // elemento → { '#testo'?: string, [attributo]: string }
const normale = (x) => String(x ?? '').replace(/\s+/gu, ' ').trim();
function ancoraDelModello(el, dove, chiave, attuale) {
  const ora = normale(attuale);
  return ora === '' || ora === normale(scrittoDaQui.get(el)?.[dove]) || ora === TESTI.it?.[chiave] || ora === TESTI[LINGUA_DI_RISERVA][chiave];
}
function ricorda(el, dove, valore) {
  const voce = scrittoDaQui.get(el) ?? {};
  voce[dove] = valore;
  scrittoDaQui.set(el, voce);
}

export function applicaLingua(root, lingua) {
  const d = DIZIONARIO[lingua] || DIZIONARIO[LINGUA_PREDEFINITA];
  const radice = root.documentElement || root;
  radice.setAttribute('lang', lingua);
  const cambiata = impostaLingua(lingua) !== undefined && lingua !== radice.dataset?.linguaApplicata;
  if (radice.dataset) radice.dataset.linguaApplicata = lingua;
  let toccati = 0;
  /* 03/10/2026, corsia S1: un `data-t` con una CHIAVE STABILE (`modello.home.titolo`) si legge con `t()`, nella lingua corrente
     e in pseudo-lingua; un `data-t` con una frase italiana (quelli di prima) continua col dizionario vecchio. */
  const stabile = (k) => FORMA_DELLA_CHIAVE.test(k || '') && TESTI[LINGUA_DI_RISERVA][k] !== undefined;
  for (const el of root.querySelectorAll('[data-t]')) {
    const chiave = el.getAttribute('data-t');
    const valore = stabile(chiave) ? t(chiave) : d[chiave];
    if (!valore) continue;
    const testo = primoTesto(el);
    if (stabile(chiave)) {
      if (!ancoraDelModello(el, '#testo', chiave, testo ? testo.data : el.textContent)) continue;
      ricorda(el, '#testo', valore);
    }
    /* 03/10/2026, corsia S1: si conserva anche lo spazio in TESTA (`<button><svg/> Nuova</button>`): senza, fra l'icona e la
       parola lo spazio sparirebbe anche in italiano. Uno spazio solo: è come il browser rende qualunque spazio iniziale. */
    if (testo) { const testaSpazio = /^\s/.test(testo.data) ? ' ' : ''; const codaSpazio = /\s$/.test(testo.data) ? ' ' : ''; testo.data = testaSpazio + valore + codaSpazio; } else el.textContent = valore;
    toccati += 1;
  }
  for (const el of root.querySelectorAll('[data-ph]')) {
    const valore = d[el.getAttribute('data-ph')];
    if (!valore) continue;
    el.placeholder = valore;
    toccati += 1;
  }
  /* Gli attributi: `data-t-attr="[title]area.chiave;[aria-label]area.chiave2"` — la forma di jquery-i18next (README, letto il
     03/10/2026), un attributo solo con il nome fra parentesi quadre e il punto e virgola come separatore. Solo chiavi stabili. */
  for (const el of root.querySelectorAll('[data-t-attr]')) {
    for (const [nome, chiave] of attributiDaTradurre(el.getAttribute('data-t-attr'))) {
      if (!stabile(chiave)) continue;
      if (!ancoraDelModello(el, nome, chiave, el.getAttribute(nome))) continue;
      const valore = t(chiave);
      ricorda(el, nome, valore);
      el.setAttribute(nome, valore);
      toccati += 1;
    }
  }
  if (cambiata && typeof radice.dispatchEvent === 'function' && typeof CustomEvent === 'function') radice.dispatchEvent(new CustomEvent(EVENTO_LINGUA, { detail: { lingua } }));
  return toccati;
}
