/*
 * Il cancello — classe 1: RIFERIMENTI MORTI, un nome che punta al nulla.
 *
 * ⛔ Il difetto vero, 06/9: DODICI simboli erano chiamati dal codice e non disegnati da nessuno
 * (`i-folder-open` sta nella modale «Nuova sessione», sotto gli occhi a ogni avvio), e in tutto il
 * CSS `.sheet-option` aveva la sola regola `.sheet-option.active`: un foglio intero col testo tutto
 * attaccato, illeggibile. Nessuno dei due produce un errore — producono un BUCO MUTO, e per giorni
 * li ha trovati solo un paio d'occhi su uno screenshot.
 *
 * Metodo preso dal contratto (`.claude/CANCELLO-UNICO-METODI-2026-09-06.md`, ricerca 06/09/2026):
 * l'idea è di CILLA (saltlab/cilla) — incrociare CSS e markup per trovare i selettori che non
 * agganciano niente e i «valori di classe non definiti». Qui è fatto in statica e senza browser: le
 * funzioni sono pure, prendono tre testi e tornano righe. Un cancello che ha bisogno di un browser
 * gira quando qualcuno se lo ricorda; uno che legge tre stringhe gira a ogni commit.
 *
 * ⛔ Le due trappole dichiarate dal contratto, entrambe già costate:
 * 1. le pseudo-classi (`:hover`, `:focus`, `:popover-open`) e i `@keyframes` non compaiono mai nel
 *    markup PER COSTRUZIONE: segnalarli riempirebbe il rapporto di falsi allarmi, e un rapporto che
 *    grida al lupo non viene più letto. Sono tolti alla radice, non filtrati alla fine.
 * 2. cercare solo `icon('i-x')` PERDE `icona: 'i-x'` e `icon(c ? 'i-a' : 'i-b')`: quell'errore ha
 *    fatto contare 7 simboli mancanti su 12 veri. Si cerca QUALUNQUE literal che si chiami come un
 *    simbolo, comunque sia stato scritto.
 *
 * ⛔ Ricerca 06/09/2026 su ciò che in statica NON si può vedere: PurgeCSS e i suoi `safelist`
 * esistono proprio perché una classe concatenata a runtime non compare nel sorgente, e la loro cura
 * è una lista di eccezioni scritta a mano (purgecss.com/safelisting, letta il 06/09/2026). Qui la
 * scelta è opposta e dichiarata: davanti a ciò che non si vede questo analizzatore TACE (vedi
 * `LIMITI`) — meglio un buco noto che un falso positivo.
 * La conversione `data-auto-refresh` ⇄ `dataset.autoRefresh` segue la regola dello standard (MDN,
 * «HTMLElement: dataset property», letta il 06/09/2026): il trattino sparisce SOLO davanti a una
 * lettera minuscola ASCII — davanti a una cifra resta. Un camelCase scritto a occhio sbaglia lì.
 */

/** Quello che questo analizzatore NON vede, scritto qui perché nessuno lo scambi per «pulito». */
export const LIMITI = Object.freeze([
  'Il verdetto vale per l\'INSIEME di testi che gli passi, e per nessun altro: una superficie lasciata fuori fa sembrare morto ciò che solo lei usa. Misurato il 06/09 su questo repo — «data-rail» risultava senza gestore perché a leggerlo è src/bridge/legacy-dom.js, e «data-talos-entrypoint» perché lo legge scripts/mockup-to-template.mjs. Chi chiama passa TUTTO, o il rapporto accusa il proprio sguardo corto.',
  'Un foglio scritto come libreria di componenti ha per natura varianti non ancora usate (.talos-button--lg, .talos-skeleton): qui risultano senza bersaglio, ed è vero alla lettera. Se togliere la regola o usare la variante lo decide chi legge, non questo file.',
  'Le classi costruite a runtime (className con un ${} dentro, o "a " + b) non si vedono in statica: non vengono né segnalate né contate come vive. È il buco che PurgeCSS tampona con un safelist scritto a mano.',
  'Un dataset[chiave] con chiave calcolata non si vede: un data-* letto solo così risulta «non nominato da nessun sorgente» — che è esattamente ciò che il rapporto dice, alla lettera.',
  'La struttura di un selettore non viene valutata: «.a > .b» è considerato vivo se .a e .b esistono da qualche parte, anche se non sono mai padre e figlio. Quella relazione la vede solo un DOM vero (CILLA a runtime).',
  'Gli attributi dentro un selettore ([hidden], [data-x="y"]) non sono mai motivo di morte: un attributo lo mette il codice quando vuole.',
  'Le classi con caratteri di escape CSS (.md\\:flex) non sono riconosciute; in questo progetto non se ne usano.',
  'Il CSS annidato (nesting con &) non viene percorso: i selettori interni a una regola non sono analizzati.',
]);

/*
 * ⛔ Eccezioni dichiarate. Ognuna avrà il suo perché scritto accanto: una eccezione muta, fra sei
 *    mesi, diventa un difetto che nessuno osa più togliere.
 */
export const ECCEZIONI_CLASSI = Object.freeze({
  // Vuoto oggi. Il posto esiste perché una eccezione futura nasca QUI, con la sua riga di motivo,
  // invece che come un `if` nascosto dentro l'analisi.
});

const PSEUDO_FUNZIONALI = /::?[a-zA-Z-]+\((?:[^()]|\([^()]*\))*\)/g;
const PSEUDO_SEMPLICI = /::?[a-zA-Z-]+/g;
const ATTRIBUTI_SELETTORE = /\[[^\]]*\]/g;
const TOKEN_VALIDO = /^-?[A-Za-z_][A-Za-z0-9_-]*$/;
const CLASSE_NEL_SELETTORE = /\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g;
const ID_NEL_SELETTORE = /#(-?[A-Za-z_][A-Za-z0-9_-]*)/g;

// ─────────────────────────── fondamenta: leggere senza farsi ingannare ───────────────────────────

/** Da un indice di carattere alla riga umana (1-based). Le righe si contano una volta sola. */
function contatoreRighe(testo) {
  const inizi = [0];
  for (let i = 0; i < testo.length; i += 1) if (testo[i] === '\n') inizi.push(i + 1);
  return (indice) => {
    let basso = 0;
    let alto = inizi.length - 1;
    while (basso < alto) {
      const mezzo = (basso + alto + 1) >> 1;
      if (inizi[mezzo] <= indice) basso = mezzo;
      else alto = mezzo - 1;
    }
    return basso + 1;
  };
}

/** Un testo solo o una mappa `{nomeFile: contenuto}`: chi chiama sceglie, l'analisi non se ne accorge. */
function fonti(valore, nomePredefinito) {
  if (valore === null || valore === undefined) return [];
  if (typeof valore === 'string') return [{ nome: nomePredefinito, testo: valore }];
  return Object.entries(valore).map(([nome, testo]) => ({ nome, testo: String(testo ?? '') }));
}

const sito = (nome, riga) => `${nome}:${riga}`;

/** Un elenco di posti leggibile: i primi quattro per nome, il resto contato. */
function dove(posti) {
  const unici = [...new Set(posti)];
  if (unici.length <= 4) return unici.join(', ');
  return `${unici.slice(0, 4).join(', ')} (+${unici.length - 4})`;
}

/**
 * Commenti e contenuti di stringa spenti, MA lunghezza e a capo intatti: così ogni indice continua
 * a valere sul testo originale e i numeri di riga restano veri.
 */
export function mascheraCss(css) {
  const testo = String(css ?? '');
  const fuori = [...testo];
  const spegni = (da, a) => {
    for (let k = da; k < a && k < fuori.length; k += 1) if (fuori[k] !== '\n') fuori[k] = ' ';
  };
  let i = 0;
  while (i < testo.length) {
    const c = testo[i];
    if (c === '/' && testo[i + 1] === '*') {
      const fine = testo.indexOf('*/', i + 2);
      const stop = fine === -1 ? testo.length : fine + 2;
      spegni(i, stop);
      i = stop;
      continue;
    }
    if (c === '"' || c === "'") {
      let k = i + 1;
      while (k < testo.length && testo[k] !== c) k += testo[k] === '\\' ? 2 : 1;
      // ⛔ Le virgolette restano al loro posto: sparisce solo il CONTENUTO. Un `content: ".attiva"`
      //    letto alla lettera inventerebbe una classe che nel markup non esiste, e il rapporto
      //    accuserebbe una regola viva.
      spegni(i + 1, k);
      i = Math.min(k + 1, testo.length);
      continue;
    }
    i += 1;
  }
  return fuori.join('');
}

/**
 * Via i commenti dal JavaScript, e SOLO i commenti: le stringhe restano intere perché è lì dentro
 * che vive il markup di questa app (i template literal con `class="…"`).
 * ⛔ Un `//` dentro una stringa non è un commento, e una `/` dopo un `=` è una regex: senza queste
 *    due distinzioni lo spegnimento mangerebbe codice vero e il rapporto direbbe bugie. I template
 *    literal si annidano (dentro un `${}` ce n'è un altro), quindi serve una pila, non un flag.
 */
export function senzaCommentiJs(js) {
  const testo = String(js ?? '');
  const fuori = [...testo];
  const spegni = (da, a) => {
    for (let k = da; k < a && k < fuori.length; k += 1) if (fuori[k] !== '\n') fuori[k] = ' ';
  };
  const pila = [{ tipo: 'codice', graffe: 0 }];
  let precedente = '';
  let i = 0;
  while (i < testo.length) {
    const stato = pila[pila.length - 1];
    const c = testo[i];
    const d = testo[i + 1];
    if (stato.tipo === 'template') {
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { pila.pop(); i += 1; continue; }
      if (c === '$' && d === '{') { pila.push({ tipo: 'codice', graffe: 0 }); i += 2; continue; }
      i += 1;
      continue;
    }
    if (c === '/' && d === '/') {
      const fine = testo.indexOf('\n', i);
      const stop = fine === -1 ? testo.length : fine;
      spegni(i, stop);
      i = stop;
      continue;
    }
    if (c === '/' && d === '*') {
      const fine = testo.indexOf('*/', i + 2);
      const stop = fine === -1 ? testo.length : fine + 2;
      spegni(i, stop);
      i = stop;
      continue;
    }
    if (c === '"' || c === "'") {
      let k = i + 1;
      while (k < testo.length && testo[k] !== c && testo[k] !== '\n') k += testo[k] === '\\' ? 2 : 1;
      i = Math.min(k + 1, testo.length);
      precedente = c;
      continue;
    }
    if (c === '`') { pila.push({ tipo: 'template' }); i += 1; precedente = c; continue; }
    // Una `/` apre una regex solo dopo un operatore o una parentesi aperta: dopo un nome è una
    // divisione, e prenderla per regex divorerebbe mezza riga di codice buono.
    if (c === '/' && '(,=:[!&|?{};+-*%~^<>'.includes(precedente || '(')) {
      let k = i + 1;
      let inClasse = false;
      while (k < testo.length) {
        const q = testo[k];
        if (q === '\\') { k += 2; continue; }
        if (q === '[') inClasse = true;
        else if (q === ']') inClasse = false;
        else if (q === '/' && !inClasse) break;
        else if (q === '\n') break;
        k += 1;
      }
      i = Math.min(k + 1, testo.length);
      precedente = '/';
      continue;
    }
    if (pila.length > 1) {
      if (c === '{') stato.graffe += 1;
      else if (c === '}') {
        if (stato.graffe === 0) { pila.pop(); i += 1; continue; }
        stato.graffe -= 1;
      }
    }
    if (!/\s/.test(c)) precedente = c;
    i += 1;
  }
  return fuori.join('');
}

// ─────────────────────────── 1 · i simboli chiamati e mai disegnati ──────────────────────────────

/** Gli `<symbol id="…">` che esistono davvero nello sprite. */
export function simboliDefiniti({ html } = {}) {
  const trovati = new Set();
  for (const { testo } of fonti(html, 'index.template.html')) {
    for (const m of testo.matchAll(/<symbol\b[^>]*\bid="([^"]+)"/g)) trovati.add(m[1]);
  }
  return trovati;
}

/**
 * Ogni nome di simbolo NOMINATO, comunque sia scritto: `<use href="#x">` nel markup, e nel JS
 * qualunque literal che si chiami come un simbolo — `icon('i-x')`, `icona: 'i-x'`, il ramo di un
 * ternario. ⛔ Guardare una sola forma di scrittura protegge da una sillaba, non dal difetto.
 * @returns {Map<string, string[]>} nome del simbolo → i posti che lo chiamano
 */
export function simboliUsati({ html, sorgenti } = {}) {
  const usi = new Map();
  const aggiungi = (nome, posto) => {
    if (!usi.has(nome)) usi.set(nome, []);
    usi.get(nome).push(posto);
  };
  for (const { nome, testo } of fonti(html, 'index.template.html')) {
    const riga = contatoreRighe(testo);
    // Nel markup si guarda SOLO dentro `<use>`: un `<a href="#sezione">` è un'ancora, non un simbolo,
    // e accusarlo di essere un simbolo mancante sarebbe il primo falso positivo del rapporto.
    for (const m of testo.matchAll(/<use\b[^>]*?(?:xlink:)?href="#([^"]+)"/g)) aggiungi(m[1], sito(nome, riga(m.index)));
  }
  for (const { nome, testo } of fonti(sorgenti, 'sorgente.js')) {
    const codice = senzaCommentiJs(testo);
    const riga = contatoreRighe(codice);
    for (const m of codice.matchAll(/(['"`])(i-[a-z0-9-]+)\1/g)) aggiungi(m[2], sito(nome, riga(m.index)));
    for (const m of codice.matchAll(/<use\b[^>]*?(?:xlink:)?href="#([a-z0-9-]+)"/g)) aggiungi(m[1], sito(nome, riga(m.index)));
  }
  return usi;
}

/** I simboli chiamati che nessuno disegna: a schermo resta un buco, senza un errore da nessuna parte. */
export function simboliMancanti({ html, sorgenti } = {}) {
  const definiti = simboliDefiniti({ html });
  const fuori = [];
  for (const [nome, posti] of simboliUsati({ html, sorgenti })) {
    if (definiti.has(nome)) continue;
    const quante = posti.length === 1 ? 'una volta' : `${posti.length} volte`;
    fuori.push({
      cosa: `#${nome}`,
      dove: dove(posti),
      perche: `«${nome}» è chiamato ${quante} e nessun <symbol id="${nome}"> lo disegna: a schermo resta un buco muto, senza errore in console.`,
    });
  }
  return fuori.sort((a, b) => a.cosa.localeCompare(b.cosa));
}

// ─────────────────────────── 2 · le classi che nessuna regola dipinge ────────────────────────────

/**
 * Solo i nomi che sono davvero un nome. ⛔ Un token con `$`, `{` o `}` viene da una concatenazione a
 * runtime: non lo si segnala e non lo si conta come vivo — è il limite dichiarato in `LIMITI`.
 */
function tokenizza(valore) {
  return String(valore ?? '')
    .split(/\s+/)
    .filter((t) => t && TOKEN_VALIDO.test(t));
}

/** Una lista di classi come sta scritta su un elemento, col posto in cui è scritta. */
function listeDiClassi({ html, sorgenti }) {
  const liste = [];
  const daMarkup = (nome, testo, riga) => {
    for (const m of testo.matchAll(/\sclass\s*=\s*(["'])([^"']*)\1/g)) {
      liste.push({ classi: tokenizza(m[2]), posto: sito(nome, riga(m.index)) });
    }
  };
  for (const { nome, testo } of fonti(html, 'index.template.html')) daMarkup(nome, testo, contatoreRighe(testo));
  for (const { nome, testo } of fonti(sorgenti, 'sorgente.js')) {
    const codice = senzaCommentiJs(testo);
    const riga = contatoreRighe(codice);
    daMarkup(nome, codice, riga);
    for (const m of codice.matchAll(/\.className\s*=\s*(["'`])([^"'`]*)\1/g)) {
      liste.push({ classi: tokenizza(m[2]), posto: sito(nome, riga(m.index)) });
    }
    for (const m of codice.matchAll(/classList\s*\.\s*(?:add|remove|toggle|replace)\s*\(([^)]*)\)/g)) {
      for (const q of m[1].matchAll(/(["'`])([^"'`]*)\1/g)) {
        const classi = tokenizza(q[2]);
        // ⛔ Una classe aggiunta da `classList` NON dice quali altre classi ha l'elemento: la lista è
        //    parziale, e serve solo a sapere che quel nome esiste. Dedurne «elemento non dipinto»
        //    sarebbe un falso positivo — è il motivo per cui questa riga porta un contrassegno.
        if (classi.length) liste.push({ classi, posto: sito(nome, riga(m.index)), parziale: true });
      }
    }
  }
  return liste;
}

/** I `.classe` che il codice usa come selettore (`querySelector`, `closest`, `matches`). */
function classiInterrogateDalCodice(sorgenti) {
  const trovate = new Set();
  for (const { testo } of fonti(sorgenti, 'sorgente.js')) {
    const codice = senzaCommentiJs(testo);
    for (const m of codice.matchAll(/(?:querySelector|querySelectorAll|closest|matches)\s*\(\s*(["'`])([^"'`]*)\1/g)) {
      for (const c of m[2].matchAll(CLASSE_NEL_SELETTORE)) trovate.add(c[1]);
    }
    for (const m of codice.matchAll(/getElementsByClassName\s*\(\s*(["'`])([^"'`]*)\1/g)) {
      for (const c of tokenizza(m[2])) trovate.add(c);
    }
  }
  return trovate;
}

/*
 * ⛔ Pseudo-classi e attributi si tolgono PRIMA di ragionare, e per due motivi diversi:
 * · `:hover`, `:focus`, `:popover-open` e i `@keyframes` non stanno mai nel markup per costruzione —
 *   è la trappola dichiarata dalla fonte: senza questo filtro il rapporto sarebbe tutto falsi
 *   allarmi e smetterebbe di essere letto dopo il primo giro;
 * · un attributo (`[hidden]`) lo mette il codice quando vuole, quindi `.x[hidden]` conta come regola
 *   di base: è la lettura PRUDENTE, quella che semmai perde un difetto invece di inventarlo.
 * I pseudo funzionali (`:not(.a)`, `:is(.b)`) spariscono col loro contenuto: una classe dentro una
 * negazione NON deve esistere perché la regola morda, e pretenderlo produrrebbe accuse false.
 */
function senzaPseudoNeAttributi(pezzo) {
  return String(pezzo)
    .replace(PSEUDO_FUNZIONALI, ' ')
    .replace(PSEUDO_SEMPLICI, ' ')
    .replace(ATTRIBUTI_SELETTORE, ' ');
}

/** Le alternative di una lista di selettori, separando solo le virgole di primo livello. */
export function alternative(selettore) {
  const pezzi = [];
  let corrente = '';
  let tonde = 0;
  let quadre = 0;
  for (const c of String(selettore ?? '')) {
    if (c === '(') tonde += 1;
    else if (c === ')') tonde = Math.max(0, tonde - 1);
    else if (c === '[') quadre += 1;
    else if (c === ']') quadre = Math.max(0, quadre - 1);
    if (c === ',' && !tonde && !quadre) { pezzi.push(corrente); corrente = ''; continue; }
    corrente += c;
  }
  pezzi.push(corrente);
  return pezzi.map((p) => p.trim()).filter(Boolean);
}

/** Ogni compound del CSS (`.a.b`, `.x:hover`) ridotto all'insieme di classi che pretende insieme. */
function compoundDelCss(css) {
  const perClasse = new Map();
  for (const { selettore } of selettoriCss({ css })) {
    for (const alternativa of alternative(selettore)) {
      for (const pezzo of senzaPseudoNeAttributi(alternativa).split(/[\s>+~]+/)) {
        const classi = [...pezzo.matchAll(CLASSE_NEL_SELETTORE)].map((m) => m[1]);
        if (!classi.length) continue;
        const insieme = new Set(classi);
        for (const c of classi) {
          if (!perClasse.has(c)) perClasse.set(c, []);
          perClasse.get(c).push(insieme);
        }
      }
    }
  }
  return perClasse;
}

/**
 * Le classi che il markup usa e il CSS non dipinge. Sono due difetti diversi, e il rapporto li tiene
 * separati perché la cura è diversa:
 * · A — nessuna regola nomina mai quella classe: o è un refuso, o è markup morto;
 * · B — la classe esiste solo dentro una regola CONDIZIONATA (`.sheet-option.active`) e sull'elemento
 *   quella condizione non c'è: manca la regola di base. È il difetto del 06/9, un foglio intero
 *   illeggibile col testo tutto attaccato — e nessun controllo che guardi solo «la classe è nominata
 *   da qualche parte?» lo vedrebbe mai, perché `.sheet-option` nel CSS c'era.
 */
export function classiSenzaRegola({ html, css, sorgenti, eccezioni = ECCEZIONI_CLASSI } = {}) {
  const scusate = new Set(Object.keys(eccezioni ?? {}));
  const compound = compoundDelCss(css);
  const liste = listeDiClassi({ html, sorgenti });
  const fuori = [];

  const postiPerClasse = new Map();
  for (const lista of liste) {
    for (const c of lista.classi) {
      if (!postiPerClasse.has(c)) postiPerClasse.set(c, []);
      postiPerClasse.get(c).push(lista.posto);
    }
  }

  for (const [classe, posti] of postiPerClasse) {
    if (scusate.has(classe) || compound.has(classe)) continue;
    fuori.push({
      cosa: `.${classe}`,
      dove: dove(posti),
      perche: `la classe «${classe}» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente.`,
    });
  }

  for (const [classe, insiemi] of compound) {
    if (scusate.has(classe)) continue;
    if (insiemi.some((s) => s.size === 1)) continue; // esiste una regola di base: niente da dire
    const nudi = [];
    for (const lista of liste) {
      // ⛔ Le liste parziali (`classList.add`) non conoscono le altre classi dell'elemento: dedurne
      //    «non dipinto» sarebbe un falso positivo, e un rapporto che grida al lupo muore.
      if (lista.parziale || !lista.classi.includes(classe)) continue;
      const presenti = new Set(lista.classi);
      const soddisfatto = insiemi.some((s) => [...s].every((c) => presenti.has(c)));
      if (!soddisfatto) nudi.push(lista.posto);
    }
    if (!nudi.length) continue;
    const esempio = [...insiemi[0]].map((c) => `.${c}`).join('');
    fuori.push({
      cosa: `.${classe}`,
      dove: dove(nudi),
      perche: `«${classe}» nel CSS esiste solo in regole condizionate (la più semplice è «${esempio}») e su questi elementi la condizione non c'è: manca la regola di base, il contenuto resta nudo.`,
    });
  }
  return fuori.sort((a, b) => a.cosa.localeCompare(b.cosa));
}

// ─────────────────────────── 3 · i data-* che nessun gestore riconosce ───────────────────────────

/**
 * `data-auto-refresh` → `autoRefresh`. Regola dello standard (MDN, letta il 06/09/2026): il trattino
 * sparisce SOLO davanti a una lettera minuscola ASCII. ⛔ Davanti a una cifra RESTA — `data-col-2`
 * si legge `dataset['col-2']`, non `dataset.col2`, e un camelCase scritto a occhio sbaglia lì.
 */
export function nomeDatasetDaAttributo(attributo) {
  return String(attributo ?? '')
    .replace(/^data-/, '')
    .replace(/-([a-z])/g, (_, lettera) => lettera.toUpperCase());
}

/** La strada opposta: `autoRefresh` → `data-auto-refresh`. */
export function attributoDaNomeDataset(nome) {
  return `data-${String(nome ?? '').replace(/[A-Z]/g, (lettera) => `-${lettera.toLowerCase()}`)}`;
}

/**
 * Gli attributi `data-*` scritti nel markup che nessun sorgente nomina — né come `data-x` (selettore,
 * `getAttribute`, delega) né come `dataset.x` — e che nemmeno il CSS usa come aggancio di stile.
 * ⛔ Il CSS conta come gestore: `[data-theme]` fa il suo lavoro senza una riga di JavaScript, e
 *    accusarlo sarebbe falso.
 */
export function datiSenzaGestore({ html, css, sorgenti, eccezioni = [] } = {}) {
  const scusati = new Set(eccezioni);
  const usati = new Map();
  for (const { nome, testo } of fonti(html, 'index.template.html')) {
    const riga = contatoreRighe(testo);
    for (const m of testo.matchAll(/\s(data-[a-z0-9-]+)\s*(?==|>|\/|\s)/g)) {
      if (!usati.has(m[1])) usati.set(m[1], []);
      usati.get(m[1]).push(sito(nome, riga(m.index)));
    }
  }

  const nominati = new Set();
  for (const { testo } of fonti(sorgenti, 'sorgente.js')) {
    const codice = senzaCommentiJs(testo);
    for (const m of codice.matchAll(/data-[a-z0-9-]+/g)) nominati.add(m[0]);
    for (const m of codice.matchAll(/dataset\s*\.\s*([A-Za-z][A-Za-z0-9_]*)/g)) nominati.add(attributoDaNomeDataset(m[1]));
    for (const m of codice.matchAll(/dataset\s*\[\s*(["'`])([^"'`]+)\1\s*\]/g)) nominati.add(attributoDaNomeDataset(m[2]));
  }
  for (const { testo } of fonti(css, 'styles.css')) {
    for (const m of mascheraCss(testo).matchAll(/\[\s*(data-[a-z0-9-]+)/g)) nominati.add(m[1]);
  }

  const fuori = [];
  for (const [attributo, posti] of usati) {
    if (scusati.has(attributo) || nominati.has(attributo)) continue;
    fuori.push({
      cosa: attributo,
      dove: dove(posti),
      perche: `nessun sorgente nomina «${attributo}», né come stringa né come «dataset.${nomeDatasetDaAttributo(attributo)}», e nessuna regola CSS lo usa come aggancio: l'attributo è scritto e nessuno lo legge.`,
    });
  }
  return fuori.sort((a, b) => a.cosa.localeCompare(b.cosa));
}

// ────────────────────────── 4 · le regole CSS che non agganciano niente ──────────────────────────

/**
 * I selettori del foglio, col loro numero di riga.
 * ⛔ I `@keyframes` non entrano: i loro «selettori» sono `from`, `to`, `50%` — non esistono nel
 *    markup PER COSTRUZIONE, e segnalarli è il falso positivo che la fonte avverte di evitare.
 *    Le at-rule condizionate (`@media`, `@supports`, `@container`, `@layer`, `@scope`) invece sì:
 *    dentro ci sono selettori veri, e una regola morta dentro un `@media` è morta uguale.
 */
export function selettoriCss({ css } = {}) {
  const trovati = [];
  for (const { nome, testo } of fonti(css, 'styles.css')) {
    const mascherato = mascheraCss(testo);
    const riga = contatoreRighe(mascherato);
    const pila = [];
    let inizio = 0;
    for (let i = 0; i < mascherato.length; i += 1) {
      const c = mascherato[i];
      if (c === '{') {
        const grezzo = mascherato.slice(inizio, i);
        const prelude = grezzo.trim();
        const dentro = pila[pila.length - 1];
        if (prelude.startsWith('@')) {
          const parola = (prelude.match(/^@([a-zA-Z-]+)/) || [, ''])[1].toLowerCase();
          pila.push({ tipo: parola.endsWith('keyframes') ? 'fotogrammi' : 'condizione' });
        } else {
          if (prelude && (!dentro || dentro.tipo === 'condizione')) {
            const scarto = grezzo.length - grezzo.trimStart().length;
            trovati.push({ selettore: testo.slice(inizio + scarto, i).trim(), nome, riga: riga(inizio + scarto) });
          }
          pila.push({ tipo: 'regola' });
        }
        inizio = i + 1;
        continue;
      }
      if (c === '}') { pila.pop(); inizio = i + 1; continue; }
      // Un `;` fuori da un blocco di dichiarazioni chiude un `@import`/`@layer a, b;`: il selettore
      // successivo comincia da lì, non dal `}` precedente.
      if (c === ';' && (!pila.length || pila[pila.length - 1].tipo !== 'regola')) inizio = i + 1;
    }
  }
  return trovati;
}

/**
 * Le regole il cui selettore non può agganciare niente perché pretende un nome che nell'app non
 * esiste da nessuna parte. ⛔ È una lettura volutamente PRUDENTE: non si giudica la struttura
 * (`.a > .b` passa se `.a` e `.b` esistono, anche se non sono mai padre e figlio), non si giudicano
 * gli attributi, e un selettore di soli tag non viene toccato. Meglio perdere una regola morta che
 * accusarne una viva: la prima costa un po' di CSS, la seconda costa la fiducia nel rapporto —
 * e un rapporto in cui non si crede non viene più aperto.
 */
export function regoleSenzaBersaglio({ html, css, sorgenti } = {}) {
  const classiVive = new Set();
  for (const lista of listeDiClassi({ html, sorgenti })) for (const c of lista.classi) classiVive.add(c);
  for (const c of classiInterrogateDalCodice(sorgenti)) classiVive.add(c);

  const idVivi = new Set();
  for (const { testo } of fonti(html, 'index.template.html')) {
    for (const m of testo.matchAll(/\sid\s*=\s*["']([^"']+)["']/g)) idVivi.add(m[1]);
  }
  for (const { testo } of fonti(sorgenti, 'sorgente.js')) {
    const codice = senzaCommentiJs(testo);
    for (const m of codice.matchAll(/\sid\s*=\s*["']([^"']+)["']/g)) idVivi.add(m[1]);
    for (const m of codice.matchAll(/getElementById\s*\(\s*(["'`])([^"'`]+)\1/g)) idVivi.add(m[2]);
    for (const m of codice.matchAll(/\.id\s*=\s*(["'`])([^"'`]*)\1/g)) idVivi.add(m[2]);
    for (const m of codice.matchAll(/(?:querySelector|querySelectorAll|closest|matches)\s*\(\s*(["'`])([^"'`]*)\1/g)) {
      for (const q of m[2].matchAll(ID_NEL_SELETTORE)) idVivi.add(q[1]);
    }
  }

  const fuori = [];
  for (const { selettore, nome, riga } of selettoriCss({ css })) {
    const pezzi = alternative(selettore);
    if (!pezzi.length) continue;
    const mancanti = new Set();
    const tutteMorte = pezzi.every((alternativa) => {
      const nudo = senzaPseudoNeAttributi(alternativa);
      const classi = [...nudo.matchAll(CLASSE_NEL_SELETTORE)].map((m) => m[1]);
      const ids = [...nudo.matchAll(ID_NEL_SELETTORE)].map((m) => m[1]);
      if (!classi.length && !ids.length) return false; // solo tag o attributi: qui non si giudica
      const morti = [
        ...classi.filter((c) => !classiVive.has(c)).map((c) => `.${c}`),
        ...ids.filter((i) => !idVivi.has(i)).map((i) => `#${i}`),
      ];
      for (const m of morti) mancanti.add(m);
      return morti.length > 0;
    });
    if (!tutteMorte || !mancanti.size) continue;
    fuori.push({
      cosa: selettore.replace(/\s+/g, ' '),
      dove: sito(nome, riga),
      perche: `il selettore pretende ${[...mancanti].map((m) => `«${m}»`).join(', ')}, che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente.`,
    });
  }
  return fuori;
}

/** Le quattro domande in un colpo solo: è così che il cancello userà questo file. */
export function analizzaRiferimentiMorti(ingresso = {}) {
  return {
    simboliMancanti: simboliMancanti(ingresso),
    classiSenzaRegola: classiSenzaRegola(ingresso),
    datiSenzaGestore: datiSenzaGestore(ingresso),
    regoleSenzaBersaglio: regoleSenzaBersaglio(ingresso),
  };
}
