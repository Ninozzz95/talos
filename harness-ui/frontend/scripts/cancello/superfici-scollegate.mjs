/*
 * Cancello unico, classe 5 — SUPERFICI SCOLLEGATE: una vista che non riceve i dati veri.
 *
 * ⛔ I due difetti veri da cui nasce, non un esercizio:
 *  · la scheda «Agenti» mostrava SEMPRE lo stato vuoto mentre `GET /api/v1/sessions/:id/children`
 *    esisteva già sul server — lavoro pagato due volte, una per scrivere la rotta e una per non
 *    accorgersi che c'era;
 *  · la voce «Note» aveva un contatore VIVO («Note 1», e la nota c'era davvero sul disco, in
 *    `.notes-store/`) e nessuna pagina dietro: il clic finiva nella chat. Un contatore che promette
 *    un luogo che non esiste è peggio di una voce assente, perché ti manda a cercare qualcosa che
 *    non c'è.
 * Nessuno dei due produce un errore. Producono uno schermo che sembra funzionare, ed è per questo
 * che sono rimasti lì per giorni senza che un test li vedesse.
 *
 * Queste funzioni sono PURE per scelta, non per pigrizia: prendono tre liste già raccolte — le
 * rotte che il server espone, le chiamate che il frontend fa davvero, le superfici dichiarate — e
 * tornano una lista di reperti. Chi le usa raccoglie i dati come vuole; così il cancello si prova
 * senza aprire un browser e senza toccare il 4174.
 *
 * ── Ricerca 06/09/2026, e ha cambiato due scelte del disegno ──────────────────────────────────
 * · nhimg.org «Orphan API» e wiz.io «API Discovery»: la sola analisi statica «può includere codice
 *   morto, host inutilizzati o endpoint usati solo in certe varianti di build», e le rotte
 *   registrate in modo dinamico le sfuggono; il giudizio definitivo su una rotta orfana vuole anche
 *   la prova a runtime (log del gateway, tracce). ⇒ qui «rotta mai chiamata» è dichiarato un
 *   SOSPETTO di gravità media, non un verdetto, e ogni esclusione è dichiarata con il suo perché.
 * · expressjs.com/5x/guide/routing (path-to-regexp v8) e MDN «URL Pattern API»: i percorsi si
 *   confrontano per SEGMENTI — `:id` è un segmento intero, non un pezzo di stringa — e il confronto
 *   per prefisso di stringa «porta a combaciamenti parziali non voluti». ⇒ `/api/v1/sessions` non
 *   deve mai risultare chiamata solo perché qualcuno chiede `/api/v1/sessions-archiviate`, o la
 *   rotta morta resterebbe invisibile proprio nel caso in cui serve vederla.
 *
 * ⛔ La direzione degli errori è scelta, non subita: dove il dato è ambiguo (un buco in coda a un
 * percorso costruito, un metodo che l'estrattore non ha saputo leggere) si è PERMISSIVI — si
 * preferisce tacere che accusare a vuoto. Un rapporto che grida al lupo non viene più letto, ed è
 * il modo in cui muore un cancello: ne abbiamo già seppellito uno (il cancello semantico, inerte
 * da sempre, e nessun test se n'era accorto perché provava solo che una scrittura LEGITTIMA
 * passasse).
 */

/** Il segno che prende il posto di un `${…}` in un percorso costruito: in un URL vero non può stare. */
const BUCO = '\u0000';

/** Gravità dei reperti: alta = lo schermo mente adesso; media = sospetto; bassa = debito da guardare. */
export const GRAVITA = Object.freeze({ ALTA: 'alta', MEDIA: 'media', BASSA: 'bassa' });

/**
 * Cosa questo analizzatore NON vede. Sta nel codice e non in un documento a parte perché il rapporto
 * deve poterlo stampare in fondo: un cancello che non dichiara i propri limiti si legge come se non
 * ne avesse, ed è così che una lista verde diventa una bugia.
 */
export const LIMITI_DICHIARATI = Object.freeze([
  'Un percorso costruito (`${…}`) è riconosciuto per SEGMENTI, non per valore: `/a/${x}/b` combacia con qualunque rotta `/a/:qualcosa/b`, ma quale id arrivi davvero non si sa.',
  'Un buco che si espande in più segmenti (`${repo}` = `org/nome`) è letto come UN segmento solo: quella chiamata può risultare senza rotta pur essendo giusta.',
  'Una rotta chiamata da un cliente che non è questo frontend (ponte mobile, supervisore, sonda) risulta mai chiamata finché non è dichiarata come eccezione, con il perché.',
  'Una superficie alimentata da eventi (SSE) non è scollegata: deve dichiarare `eventi`, perché nessuna lista di rotte può assolverla.',
  '«Rotta mai chiamata» è un sospetto statico: la prova definitiva è il traffico vero (wiz.io, API Discovery, letto il 06/09/2026).',
  'Il collegamento è misurato sull’esistenza della chiamata, non sul suo esito: una rotta chiamata che risponde sempre 500, o una risposta che il codice butta via, qui risulta collegata.',
]);

/** I verbi che il router serve per tutti senza che nessuno li scriva mai in un `fetch`. */
const METODI_MAI_SCRITTI = new Set(['HEAD', 'OPTIONS']);

/** Un metodo assente o `*` vale «qualunque»: un estrattore che non sa il verbo non deve far accusare. */
const METODO_QUALSIASI = new Set(['', '*', 'ANY', 'QUALSIASI']);

const VERBI = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'ANY', '*']);

/**
 * Toglie i `${…}` bilanciando le graffe. ⛔ Una regex ingenua (`/\$\{[^}]*\}/`) si ferma alla prima
 * graffa chiusa e sbaglia su `${forza ? '?forza=1' : ''}` e su ogni template annidato: sono le forme
 * che il nostro `app.js` usa davvero, non casi di scuola.
 */
function togliBuchi(testo) {
  let fuori = '';
  for (let i = 0; i < testo.length; i += 1) {
    if (testo[i] === '$' && testo[i + 1] === '{') {
      let profondita = 1;
      i += 2;
      while (i < testo.length && profondita > 0) {
        if (testo[i] === '{') profondita += 1;
        else if (testo[i] === '}') profondita -= 1;
        i += 1;
      }
      i -= 1;
      fuori += BUCO;
      continue;
    }
    fuori += testo[i];
  }
  return fuori;
}

function primoIndice(testo, caratteri) {
  let trovato = testo.length;
  for (const c of caratteri) {
    const i = testo.indexOf(c);
    if (i >= 0 && i < trovato) trovato = i;
  }
  return trovato;
}

function disegnaSegmento(s) {
  if (s.tipo === 'letterale') return s.valore;
  if (s.tipo === 'param') return `:${s.valore || 'x'}`;
  if (s.tipo === 'coda') return '*';
  return `${s.valore}…`;
}

/**
 * Da una voce qualunque ai pezzi con cui si confronta. Accetta `'GET /api/v1/x'`, `'/api/v1/x'`,
 * un template come `` `${BASE}/api/v1/sessions/${encodeURIComponent(id)}/notes` ``, o un oggetto
 * `{metodo, percorso, file, riga}`: chi estrae dai sorgenti non deve anche normalizzare, o
 * normalizzerebbe ognuno a modo suo e i due elenchi non si incontrerebbero più.
 * @returns {{metodo:string, percorso:string, segmenti:Array, incerto:boolean, grezzo:string, file?:string, riga?:number}}
 */
export function normalizzaPercorso(voce) {
  const oggetto = voce && typeof voce === 'object' ? voce : {};
  const sorgente = typeof voce === 'string'
    ? voce
    : String(oggetto.percorso ?? oggetto.path ?? oggetto.pattern ?? oggetto.rotta ?? '');
  let grezzo = sorgente;
  let metodo = String(oggetto.metodo ?? oggetto.method ?? oggetto.verbo ?? '').trim().toUpperCase();

  const pezzi = grezzo.trim().split(/\s+/);
  if (pezzi.length > 1 && VERBI.has(pezzi[0].toUpperCase())) {
    if (!metodo) metodo = pezzi[0].toUpperCase();
    grezzo = pezzi.slice(1).join(' ');
  }

  // ⛔ Chi pesca dai sorgenti si porta dietro i delimitatori del literal (`…`, '…', "…"): senza
  // toglierli l'ultimo segmento sarebbe «notes`» e non combacerebbe mai con «notes», cioè ogni
  // chiamata costruita risulterebbe orfana e la sua rotta morta. Trovato provando il modulo sulle
  // stringhe VERE di `legacy/app.js`, non previsto: le fixture inventate erano già pulite.
  let testo = togliBuchi(grezzo.trim().replace(/^[`'"]+/, '').replace(/[`'"]+$/, ''));
  // L'origine non fa parte dell'identità di una rotta: `http://127.0.0.1:4174/api/x` e
  // `${BASE}/api/x` sono la stessa cosa. Si taglia tutto ciò che precede la prima barra utile.
  const schema = testo.indexOf('://');
  if (schema >= 0) {
    const barra = testo.indexOf('/', schema + 3);
    testo = barra >= 0 ? testo.slice(barra) : '';
  } else if (testo && !testo.startsWith('/')) {
    const barra = testo.indexOf('/');
    testo = barra >= 0 ? testo.slice(barra) : '';
  }
  // Query e frammento non identificano la rotta (`/api/v1/models?forza=1` è `/api/v1/models`). Il
  // taglio avviene DOPO aver tolto i buchi, perché il `?` può stare dentro un buco
  // (`${forza ? '?forza=1' : ''}`) e lì non è l'inizio di una query.
  testo = testo.slice(0, primoIndice(testo, ['?', '#']));
  while (testo.length > 1 && testo.endsWith('/')) testo = testo.slice(0, -1);

  const crudi = testo.split('/').filter((s) => s !== '');
  const segmenti = [];
  let incerto = false;
  for (let i = 0; i < crudi.length; i += 1) {
    const s = crudi[i];
    if (s === '*' || s === '**' || /^:[A-Za-z0-9_]+\*$/.test(s)) { segmenti.push({ tipo: 'coda' }); break; }
    if (/^:[A-Za-z0-9_]+$/.test(s)) { segmenti.push({ tipo: 'param', valore: s.slice(1) }); continue; }
    if (s === BUCO) { segmenti.push({ tipo: 'param', valore: '' }); continue; }
    if (s.includes(BUCO)) {
      // `fit${profilo ? '?p=1' : ''}` — un buco in coda al segmento può portarsi dietro altro
      // percorso o una query: si tiene il pezzo certo e si dichiara che il resto non si sa.
      segmenti.push({ tipo: 'prefisso', valore: s.slice(0, s.indexOf(BUCO)) });
      if (i === crudi.length - 1) incerto = true;
      continue;
    }
    segmenti.push({ tipo: 'letterale', valore: s });
  }
  // Il nostro server non è Express: certe rotte le riconosce con `pathname.startsWith(...)`, e chi
  // le raccoglie lo dichiara qui. Senza questo, una rotta a prefisso risulterebbe mai chiamata.
  if (oggetto.prefisso === true) incerto = true;

  return {
    metodo,
    percorso: segmenti.length ? `/${segmenti.map(disegnaSegmento).join('/')}` : '/',
    segmenti,
    incerto,
    grezzo: sorgente,
    ...(oggetto.file ? { file: String(oggetto.file) } : {}),
    ...(oggetto.riga ? { riga: oggetto.riga } : {}),
  };
}

function metodiCombaciano(a, b) {
  if (METODO_QUALSIASI.has(a) || METODO_QUALSIASI.has(b)) return true;
  return a === b;
}

function segmentiCombaciano(sr, sc) {
  if (!sr || !sc) return false;
  if (sr.tipo === 'param' || sc.tipo === 'param') return true;
  if (sr.tipo === 'prefisso') return sc.tipo === 'prefisso' || String(sc.valore ?? '').startsWith(sr.valore);
  if (sc.tipo === 'prefisso') return String(sr.valore ?? '').startsWith(sc.valore);
  return sr.valore === sc.valore;
}

/**
 * Una rotta e una chiamata sono la stessa cosa? Confronto per SEGMENTI, mai per prefisso di stringa:
 * altrimenti `/api/v1/sessions` risulterebbe chiamata solo perché esiste una richiesta a
 * `/api/v1/sessions-archiviate`, e la rotta morta resterebbe invisibile.
 * ⛔ Il verso permissivo è voluto: dove il dato è ambiguo (buco in coda, metodo ignoto) si dice sì.
 */
export function combaciaPercorso(rotta, chiamata) {
  const r = rotta && rotta.segmenti ? rotta : normalizzaPercorso(rotta);
  const c = chiamata && chiamata.segmenti ? chiamata : normalizzaPercorso(chiamata);
  if (!r.segmenti.length || !c.segmenti.length) return false;
  if (!metodiCombaciano(r.metodo, c.metodo)) return false;
  const n = Math.min(r.segmenti.length, c.segmenti.length);
  for (let i = 0; i < n; i += 1) {
    if (r.segmenti[i].tipo === 'coda') return true;
    if (!segmentiCombaciano(r.segmenti[i], c.segmenti[i])) return false;
  }
  if (r.segmenti.length === c.segmenti.length) return true;
  // La rotta è più lunga della chiamata: solo un buco in coda può coprirla — `/local-models/${id}/fit${…}`
  // può davvero finire su `/fit/dettaglio`, e accusare qui sarebbe accusare un'ambiguità nostra.
  if (r.segmenti.length > c.segmenti.length) return c.incerto;
  // La chiamata è più lunga: combacia solo se la rotta è dichiarata a prefisso.
  return r.incerto;
}

/** Un'eccezione senza il suo perché non è un'eccezione: è un buco. Regola del contratto del cancello. */
function eccezioneMuta(oggetto) {
  return !String(oggetto?.perche ?? oggetto?.motivo ?? '').trim();
}

/**
 * Le rotte che il server espone e che nessuno chiama: lavoro pagato e mai usato.
 * @param {Array} rotte `{metodo, percorso, file?, riga?, prefisso?, consumatore?, perche?}`
 * @param {Array} chiamate le chiamate trovate nei sorgenti del frontend
 * @param {{eccezioni?:Array}} [opzioni] rotte da non accusare, ognuna con il suo perché
 */
export function rotteMaiChiamate(rotte, chiamate, { eccezioni = [] } = {}) {
  const viste = (Array.isArray(chiamate) ? chiamate : []).map(normalizzaPercorso);
  const scusate = (Array.isArray(eccezioni) ? eccezioni : []).map((e) => ({
    ...normalizzaPercorso(e),
    perche: typeof e === 'string' ? '' : String(e?.perche ?? e?.motivo ?? ''),
  }));
  const reperti = [];
  for (const grezza of Array.isArray(rotte) ? rotte : []) {
    const r = normalizzaPercorso(grezza);
    if (!r.segmenti.length) continue;
    // HEAD e OPTIONS il router li serve per tutti: nessun `fetch` li scrive mai, e accusarli
    // riempirebbe il rapporto di righe che nessuno può chiudere.
    if (METODI_MAI_SCRITTI.has(r.metodo)) continue;
    const dichiarata = grezza && typeof grezza === 'object'
      && (grezza.consumatore || grezza.esterna === true || grezza.pubblica === true);
    if (dichiarata) {
      if (eccezioneMuta(grezza)) {
        reperti.push({
          tipo: 'eccezione-muta',
          gravita: GRAVITA.BASSA,
          metodo: r.metodo || '*',
          percorso: r.percorso,
          ...(r.file ? { file: r.file } : {}),
          ...(r.riga ? { riga: r.riga } : {}),
          cosa: `la rotta è esclusa dal controllo (consumatore «${grezza.consumatore || 'esterno'}») ma non dice perché`,
        });
      }
      continue;
    }
    const scusa = scusate.find((e) => combaciaPercorso(r, e) || combaciaPercorso(e, r));
    if (scusa) {
      if (!scusa.perche.trim()) {
        reperti.push({
          tipo: 'eccezione-muta',
          gravita: GRAVITA.BASSA,
          metodo: r.metodo || '*',
          percorso: r.percorso,
          cosa: 'la rotta è in lista d’eccezione senza un perché scritto',
        });
      }
      continue;
    }
    if (viste.some((c) => combaciaPercorso(r, c))) continue;
    reperti.push({
      tipo: 'rotta-mai-chiamata',
      gravita: GRAVITA.MEDIA,
      metodo: r.metodo || '*',
      percorso: r.percorso,
      ...(r.file ? { file: r.file } : {}),
      ...(r.riga ? { riga: r.riga } : {}),
      cosa: 'il server la espone e nessuna schermata la chiede: o una superficie non la usa (come «Agenti» contro /children), o è codice da togliere',
    });
  }
  return reperti;
}

/**
 * Le chiamate del frontend verso una rotta che il server NON espone: la vista che le usa resta
 * vuota per sempre, e in più prende un 404 che quasi sempre finisce dentro un `catch` muto.
 * ⛔ Vive di fianco a `rotteMaiChiamate` perché è lo stesso incrocio letto al contrario, ed è il
 * verso in cui il difetto fa più male: là si spreca lavoro, qui si mente allo schermo.
 */
export function chiamateSenzaRotta(chiamate, rotte) {
  const esposte = (Array.isArray(rotte) ? rotte : []).map(normalizzaPercorso);
  if (!esposte.length) return []; // senza l'elenco delle rotte non c'è nessun giudizio da dare
  const reperti = [];
  for (const grezza of Array.isArray(chiamate) ? chiamate : []) {
    const c = normalizzaPercorso(grezza);
    if (!c.segmenti.length) continue;
    if (esposte.some((r) => combaciaPercorso(r, c))) continue;
    reperti.push({
      tipo: 'chiamata-senza-rotta',
      gravita: GRAVITA.ALTA,
      metodo: c.metodo || '*',
      percorso: c.percorso,
      ...(c.file ? { file: c.file } : {}),
      ...(c.riga ? { riga: c.riga } : {}),
      cosa: 'la chiamata punta a una rotta che il server non espone: la vista che la usa non riceverà mai dati',
    });
  }
  return reperti;
}

/**
 * Le chiamate attribuite a una superficie: quelle che dichiara, o quelle trovate nei suoi file.
 * ⛔ Un elenco `chiamate: []` NON è un elenco mancante: è una dichiarazione esplicita — «questa
 * vista non chiede niente a nessuno» — cioè esattamente il caso «Agenti». Trattarlo come una
 * dichiarazione incompleta declassava il reperto più grave a nota di servizio: trovato dalla prova,
 * non previsto.
 */
function chiamateDella(superficie, chiamate) {
  if (Array.isArray(superficie?.chiamate)) return superficie.chiamate.map(normalizzaPercorso);
  const file = (Array.isArray(superficie?.file) ? superficie.file : [superficie?.file])
    .filter(Boolean).map(String);
  if (!file.length) return null; // non giudicabile: la superficie non dice dove vive
  const suoi = (f) => file.some((atteso) => f === atteso || f.endsWith(atteso) || atteso.endsWith(f));
  return (Array.isArray(chiamate) ? chiamate : [])
    .filter((c) => c && typeof c === 'object' && c.file && suoi(String(c.file)))
    .map(normalizzaPercorso);
}

/**
 * Una rotta plausibile per una superficie orfana: SOLO un suggerimento per il rapporto, mai un
 * motivo per accusare o per assolvere.
 * ⛔ Sul caso vero non funziona da sola — «Agenti» e `/sessions/:id/children` non hanno una lettera
 * in comune — ed è esattamente perché una superficie può dichiarare `sinonimi: ['children']`. Che
 * il suggerimento manchi non toglie niente al reperto: il difetto resta segnalato lo stesso.
 */
function rottaCandidata(superficie, rotte) {
  const parole = [superficie?.id, superficie?.nome, ...(Array.isArray(superficie?.sinonimi) ? superficie.sinonimi : [])]
    .filter(Boolean).map((s) => String(s).toLowerCase()).filter((s) => s.length >= 4);
  if (!parole.length) return null;
  for (const grezza of Array.isArray(rotte) ? rotte : []) {
    const r = normalizzaPercorso(grezza);
    const testo = r.percorso.toLowerCase();
    if (parole.some((p) => testo.includes(p))) return `${r.metodo || '*'} ${r.percorso}`;
  }
  return null;
}

/**
 * Le superfici che promettono un contenuto e non vanno a prenderlo da nessuna parte — la scheda
 * «Agenti» sempre vuota mentre la rotta che la riempirebbe era già sul server.
 * @param {Array} superfici `{id, nome, promette, chiamate?|file?, eventi?, statica?, perche?, sinonimi?}`
 * @param {Array} chiamate le chiamate trovate nei sorgenti (con `file`, per poterle attribuire)
 * @param {{rotte?:Array}} [opzioni] servono a distinguere «non chiama niente» da «chiama il nulla»
 */
export function superficiScollegate(superfici, chiamate, { rotte = [] } = {}) {
  const esposte = Array.isArray(rotte) ? rotte : [];
  const reperti = [];
  for (const s of Array.isArray(superfici) ? superfici : []) {
    if (!s || typeof s !== 'object') continue;
    const promessa = typeof s.promette === 'string'
      ? s.promette.trim()
      : s.promette === true ? 'contenuto dinamico' : '';
    // Una superficie che non promette dati (una schermata di testo fisso, un pannello di aiuto) non
    // può essere scollegata: non c'è niente da collegare. Ma se si dichiara statica deve dire
    // perché, o «statica» diventa il tappeto sotto cui si nasconde una vista rotta.
    if (s.statica === true || !promessa) {
      if (s.statica === true && eccezioneMuta(s)) {
        reperti.push({
          tipo: 'eccezione-muta',
          gravita: GRAVITA.BASSA,
          superficie: s.id,
          nome: s.nome,
          cosa: 'la superficie è dichiarata statica senza dire perché',
        });
      }
      continue;
    }
    // Alimentata da eventi (SSE): i dati arrivano da fuori la lista delle rotte chiamate — non è
    // uno scollegamento, è un altro tubo. Trappola dichiarata nel contratto del cancello.
    if (Array.isArray(s.eventi) && s.eventi.length) continue;

    const proprie = chiamateDella(s, chiamate);
    if (proprie === null) {
      // Non si può giudicare, e TACERE sarebbe il difetto peggiore: un cancello inerte supera la
      // prova esattamente come uno vero (è così che il cancello semantico è rimasto spento per
      // intere campagne). Chi non è giudicabile lo dice, con gravità bassa.
      reperti.push({
        tipo: 'dichiarazione-incompleta',
        gravita: GRAVITA.BASSA,
        superficie: s.id,
        nome: s.nome,
        cosa: `promette «${promessa}» e non dice né quali rotte chiama né in quale file vive: su di lei il controllo non può dire niente`,
      });
      continue;
    }
    if (proprie.length) {
      // Chiama qualcosa, ma se TUTTO ciò che chiama non esiste sul server è vuota lo stesso — e in
      // silenzio. Se solo una parte manca, quella la prende `chiamateSenzaRotta`: qui si giudica la
      // superficie, non la singola chiamata, e due reperti sullo stesso fatto sono rumore.
      if (esposte.length) {
        const morte = proprie.filter((c) => !esposte.some((r) => combaciaPercorso(r, c)));
        if (morte.length === proprie.length) {
          reperti.push({
            tipo: 'superficie-su-rotta-inesistente',
            gravita: GRAVITA.ALTA,
            superficie: s.id,
            nome: s.nome,
            cosa: `promette «${promessa}» e chiama solo rotte che il server non espone (${morte.map((m) => m.percorso).join(', ')}): resta vuota comunque`,
          });
        }
      }
      continue;
    }
    const candidata = rottaCandidata(s, esposte);
    reperti.push({
      tipo: 'superficie-scollegata',
      gravita: GRAVITA.ALTA,
      superficie: s.id,
      nome: s.nome,
      cosa: `promette «${promessa}» e non chiama nessuna rotta: mostrerà sempre lo stato vuoto`,
      ...(candidata ? { rottaCandidata: candidata } : {}),
    });
  }
  return reperti;
}

/**
 * I contatori vivi che puntano a un luogo che non esiste — il difetto delle «Note»: il numero era
 * vero, la pagina no, e il clic finiva nella chat.
 * La forma dei dati è quella che la sidebar usa davvero (`nav-item.js`): un luogo ha `vaia`, e la
 * voce «Note» aveva solo `conteggio` — cioè il difetto si legge già nella dichiarazione.
 * @param {Array} contatori `{id|conteggio, etichetta, vaia?, fonte?, decorativo?, perche?}`
 * @param {Array} superfici le superfici dichiarate: dicono quali `vaia` esistono
 * @param {{scollegate?:Array, rotte?:Array}} [opzioni] gli id già trovati scollegati, e le rotte
 */
export function contatoriSenzaLuogo(contatori, superfici, { scollegate = [], rotte = [] } = {}) {
  const luoghi = new Set((Array.isArray(superfici) ? superfici : [])
    .map((s) => String(s?.id ?? '')).filter(Boolean));
  const vuote = new Set((Array.isArray(scollegate) ? scollegate : [])
    .map((x) => String(typeof x === 'string' ? x : x?.superficie ?? '')).filter(Boolean));
  const esposte = Array.isArray(rotte) ? rotte : [];
  const reperti = [];
  for (const c of Array.isArray(contatori) ? contatori : []) {
    if (!c || typeof c !== 'object') continue;
    const id = String(c.id ?? c.conteggio ?? '').trim();
    const etichetta = String(c.etichetta ?? id);
    // Un numero che nessuno ha mai promesso di poter aprire (un badge di stato accanto a un titolo)
    // non è un difetto — ma va dichiarato, o «decorativo» diventa la scusa buona per tutto.
    if (c.decorativo === true) {
      if (eccezioneMuta(c)) {
        reperti.push({
          tipo: 'eccezione-muta',
          gravita: GRAVITA.BASSA,
          contatore: id,
          etichetta,
          cosa: 'il contatore è dichiarato decorativo senza dire perché',
        });
      }
      continue;
    }
    const vaia = String(c.vaia ?? c.destinazione ?? '').trim();
    if (!vaia) {
      reperti.push({
        tipo: 'contatore-senza-destinazione',
        gravita: GRAVITA.ALTA,
        contatore: id,
        etichetta,
        cosa: `«${etichetta}» mostra un numero e non porta da nessuna parte: il clic cade dove capita (era il difetto di «Note», che finiva nella chat)`,
      });
      continue;
    }
    if (!luoghi.has(vaia)) {
      reperti.push({
        tipo: 'contatore-verso-luogo-inesistente',
        gravita: GRAVITA.ALTA,
        contatore: id,
        etichetta,
        vaia,
        cosa: `«${etichetta}» manda a «${vaia}», che non è fra le superfici dichiarate`,
      });
      continue;
    }
    if (vuote.has(vaia)) {
      reperti.push({
        tipo: 'contatore-verso-luogo-vuoto',
        gravita: GRAVITA.MEDIA,
        contatore: id,
        etichetta,
        vaia,
        cosa: `«${etichetta}» manda a «${vaia}», che è a sua volta scollegata: il numero c'è, il contenuto no`,
      });
      continue;
    }
    // Il numero stesso deve venire da qualche parte: un contatore la cui fonte non esiste sul server
    // è un numero inventato, e un numero inventato è peggio di un badge assente.
    const fonte = c.fonte ?? c.conta ?? null;
    if (fonte && esposte.length) {
      const f = normalizzaPercorso(fonte);
      if (f.segmenti.length && !esposte.some((r) => combaciaPercorso(r, f))) {
        reperti.push({
          tipo: 'contatore-da-fonte-inesistente',
          gravita: GRAVITA.ALTA,
          contatore: id,
          etichetta,
          vaia,
          cosa: `il numero di «${etichetta}» arriva da ${f.percorso}, che il server non espone`,
        });
      }
    }
  }
  return reperti;
}

/**
 * Un giro solo: le tre domande insieme, con i limiti in fondo perché il rapporto li stampi.
 * ⛔ L'ordine conta: le superfici scollegate si calcolano PRIMA, perché i contatori le usano per
 * distinguere «il luogo non c'è» da «il luogo c'è ma è vuoto» — due difetti diversi, due righe
 * diverse, e chi legge deve poter chiudere prima quello che mente di più.
 */
export function analizzaSuperfici({ rotte = [], chiamate = [], superfici = [], contatori = [], eccezioni = [] } = {}) {
  const scollegate = superficiScollegate(superfici, chiamate, { rotte });
  return {
    scollegate,
    rotteMorte: rotteMaiChiamate(rotte, chiamate, { eccezioni }),
    chiamateOrfane: chiamateSenzaRotta(chiamate, rotte),
    contatori: contatoriSenzaLuogo(contatori, superfici, {
      scollegate: scollegate.filter((r) => r.tipo === 'superficie-scollegata' || r.tipo === 'superficie-su-rotta-inesistente'),
      rotte,
    }),
    limiti: LIMITI_DICHIARATI,
  };
}
