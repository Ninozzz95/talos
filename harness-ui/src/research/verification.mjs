/*
 * PORTO FEDELE di AVM/mobile/src/lib/research/researchVerification.ts (544 righe, 11/09/2026).
 *
 * I tre livelli, e il rifiuto che li regge.
 *
 * R-4. Quello che il campo misura davvero, sugli agenti di ricerca approfondita
 * in particolare (arXiv 2605.06635): il link risolve più del 94% delle volte, la
 * fonte è in tema più dell'80% delle volte, e la fonte SOSTIENE davvero
 * l'affermazione fra il 39% e il 77% delle volte. Quindi il link morto — la cosa
 * che ogni prodotto controlla — non è il problema. Il problema è il link vivo che
 * non dice quello che il rapporto dichiara dica. Peggio: quell'accuratezza cala
 * di circa il 42% quando un agente passa da 2 recuperi a 150, cioè la modalità
 * più profonda è quella le cui citazioni sono meno affidabili, che è esattamente
 * il contrario di quello che un lettore dà per scontato.
 *
 * Da qui la forma:
 *
 *  L1  Come la fonte è stata ottenuta. Registrato dalla lettura, non richiesto di
 *      nuovo: un secondo scaricamento pochi istanti dopo il primo conferma solo
 *      quello che abbiamo appena visto, e uno stato HTTP mente comunque (i soft
 *      404 rispondono 200 con una pagina d'errore). La domanda onesta più tardi
 *      — «dice ancora questo?» — è quella di R12, ed è rispondibile solo perché
 *      abbiamo tenuto il testo.
 *  L2  Il passaggio è davvero nel testo che abbiamo tenuto, e DOVE. Meccanico,
 *      gratis, nessun modello, nessuna opinione. Prende da solo la categoria
 *      peggiore: la citazione che non è mai stata sulla pagina. Gli offset sono
 *      ciò che permette al rapporto di mostrare al lettore il pezzo esatto.
 *  L3  Quel passaggio sostiene quell'affermazione. Questo costa un modello, ed è
 *      giudicato una affermazione contro un passaggio — mai il rapporto intero,
 *      perché un valutatore di implicazione pronto all'uso che arriva a AUROC
 *      0,90 su affermazioni corte crolla a 0,53 (il caso) sulle risposte lunghe
 *      (arXiv 2606.23915). La granularità non è un dettaglio; è la differenza
 *      fra un controllo e una decorazione.
 *
 * E il rifiuto: il modello che ha scritto l'affermazione non la giudica mai. Un
 * modello che valuta la propria uscita ha fino al 50% di probabilità in più di
 * marcare come soddisfatto un criterio che in realtà ha fallito (arXiv
 * 2604.06996). Una promozione auto-rilasciata vale meno di nessuna promozione,
 * perché ne ha l'aspetto.
 */

import {
  talosResearchOpposingCandidate,
  talosResearchParseOpposingVerdict,
} from './opposing.mjs';

/**
 * @typedef {import('./collector.mjs').TalosResearchSource} TalosResearchSource
 * @typedef {import('./synthesis.mjs').TalosResearchClaim} TalosResearchClaim
 */

/**
 * ⛔⛔ CONTESA-01 — «contesa» non è «parziale», e confonderle mente.
 *
 * - **parziale**: la fonte dice una parte di quello che si afferma. Una
 *   fonte, un verdetto a metà.
 * - **contesa**: una fonte dice di sì e un'altra dice di no. Due fonti, due
 *   verdetti opposti, e nessuna metà da nessuna parte.
 *
 * Registrarle come la stessa cosa lusinga il rapporto proprio dove è più
 * fragile: una contesa segnata «parziale» si legge come «quasi sostenuta»,
 * mentre vuol dire che il mondo non è d'accordo.
 *
 * ⛔ Ricerca del 2026-08-20: i conflitti sono di tre tipi distinti — nelle
 * prove, fra le fonti sulle prove, dentro la stessa fonte — e la pratica
 * concorde è mostrare **entrambe** le versioni col perché differiscono
 * (metodo, portata, data, disciplina). Non si media, e non si sceglie in
 * silenzio la più comoda.
 *
 * @typedef {'yes' | 'partial' | 'no' | 'unchecked' | 'contested'} TalosResearchSupport
 */

/**
 * Una fonte che dice il CONTRARIO, col suo passaggio: la scheda le affianca.
 *
 * @typedef {object} TalosResearchOpposing
 * @property {string} url
 * @property {string} title
 * @property {string} passage Il passaggio come sta nella fonte, non come il modello lo ha riscritto.
 * @property {TalosResearchSpan | null} span
 */

/**
 * Dove sta il passaggio nel testo tenuto, così il lettore lo può vedere.
 *
 * @typedef {object} TalosResearchSpan
 * @property {number} from
 * @property {number} to
 */

/**
 * Quanto basta a distinguere due giudici, e a riconoscere l'autore fra loro.
 *
 * @typedef {object} TalosResearchJudgeIdentity
 * @property {string} id
 * @property {string} provider
 * @property {string} model
 */

/**
 * @typedef {object} TalosResearchChecks
 * @property {'page' | 'snippet' | 'missing'} resolved L1: letta dalla pagina, presa da un estratto di ricerca, o citata nel vuoto.
 * @property {boolean} quotePresent L2
 * @property {TalosResearchSpan | null} quoteSpan
 * @property {TalosResearchSupport} claimSupported L3
 * @property {string} supportReason
 * @property {string | null} judge Chi ha reso il verdetto, e quando. Null quando nessuno l'ha fatto — e il perché sta nel motivo.
 * @property {string | null} judgedAt
 * @property {readonly TalosResearchOpposing[]} [opposing]
 *   ⛔ CONTESA-01 — le fonti che dicono il contrario, col loro passaggio.
 *   Opzionale perché una verifica vecchia non le ha: assente vuol dire «non
 *   guardato», non «non ce ne sono». Le due cose si leggono uguali solo se non
 *   ti importa di sbagliare.
 */

/**
 * @typedef {object} TalosResearchVerifiedClaim
 * @property {TalosResearchClaim} claim
 * @property {string} passage Il passaggio com'è nella fonte, non come il modello l'ha ribattuto.
 * @property {TalosResearchChecks} checks
 */

/**
 * @typedef {object} TalosResearchVerifyDeps
 * @property {TalosResearchJudgeIdentity | null} judge Il giudice indipendente, o null quando non ce n'è. Scelto da `talosResearchPickJudge`.
 * @property {(claim: string, passage: string) => Promise<string>} ask
 *   Chiede al giudice di UNA affermazione e UN passaggio. La firma È
 *   l'isolamento: non c'è modo di passargli la domanda, il riassunto o le altre
 *   affermazioni, perché tutto ciò che aggiungi spinge la risposta verso «sì,
 *   quadra».
 * @property {(claim: string, passage: string) => Promise<string>} [askOpposing]
 *   ⛔ CONTESA-02 — chiede allo stesso giudice se un passaggio di un'ALTRA fonte
 *   contraddice l'affermazione. Opzionale, e assente vuol dire «non guardato»:
 *   senza, il verdetto resta quello di prima e `opposing` non c'è. È la stessa
 *   distinzione che il campo `opposing` porta nella scheda — «non guardato» non
 *   è «non ce ne sono», e le due cose si leggono uguali solo se non importa
 *   sbagliare.
 * @property {() => string} at
 */

/* -------------------------------------------------------------------------- */
/* L2                                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Normalizza un testo ricordandosi da dove viene ogni carattere.
 *
 * Una pagina e un modello non sono d'accordo su spazi e virgolette e sono
 * d'accordo sul significato, quindi il confronto deve essere lasco. Ma il
 * RAPPORTO deve poter puntare al testo originale, e un confronto lasco che
 * perde la posizione è inutile. Tenere la mappa è ciò che fa funzionare «tocca
 * la citazione, vedi le parole esatte».
 *
 * @param {string} text
 * @returns {{flat: string, at: {s:number, e:number}[]}}
 */
function mapped(text) {
  /** @type {string[]} */
  const out = [];
  /** @type {{s:number, e:number}[]} */
  const at = [];

  for (let index = 0; index < text.length;) {
    const char = text[index];
    if (/\s/.test(char)) {
      let end = index;
      while (end < text.length && /\s/.test(text[end])) end += 1;
      out.push(' ');
      at.push({ s: index, e: end });
      index = end;
      continue;
    }

    const plain = char === '‘' || char === '’' ? "'"
      : char === '“' || char === '”' ? '"'
        : char.toLowerCase();
    // Un carattere della fonte può diventare più caratteri in minuscolo; tutti
    // puntano indietro allo stesso carattere, così gli offset restano onesti.
    for (const produced of plain) {
      out.push(produced);
      at.push({ s: index, e: index + 1 });
    }
    index += 1;
  }

  return { flat: out.join(''), at };
}

/**
 * Trova il passaggio nel testo tenuto e dice dov'è, oppure null.
 *
 * Null è una risposta vera: il modello ha citato qualcosa che non c'è. Qui
 * dentro niente cerca la frase simile più vicina — un verificatore che
 * gentilmente trova un'approssimazione è un verificatore che fabbrica
 * attribuzioni, che è esattamente il guasto per cui questo file esiste.
 *
 * @param {string} text
 * @param {string} quote
 * @returns {TalosResearchSpan | null}
 */
export function talosResearchLocate(text, quote) {
  const haystack = mapped(text);
  const needle = mapped(quote).flat.trim();
  if (needle.length === 0) return null;

  const found = haystack.flat.indexOf(needle);
  if (found < 0) return null;

  return {
    from: haystack.at[found].s,
    to: haystack.at[found + needle.length - 1].e,
  };
}

/* -------------------------------------------------------------------------- */
/* L3                                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Il giudice, scelto per eliminazione: chiunque tranne l'autore.
 *
 * I candidati arrivano nell'ordine che il chiamante preferisce — il motore sul
 * dispositivo per primo, perché non costa niente, non ha bisogno di rete e non
 * appartiene alla famiglia di nessun modello in cloud. Se ogni candidato è
 * l'autore, questa torna null e le affermazioni escono marcate `unchecked` col
 * motivo scritto. È tutto il punto: un'affermazione non giudicata è onesta, una
 * auto-giudicata no.
 *
 * Generico perché il chiamante tenga quello che aveva attaccato al candidato —
 * l'oggetto modello, le credenziali — invece di scegliere un giudice e poi
 * doverlo ricercare per nome, che è il modo in cui si finisce per chiamare
 * quello sbagliato.
 *
 * @template {TalosResearchJudgeIdentity} T
 * @param {TalosResearchJudgeIdentity} author
 * @param {readonly T[]} candidates
 * @returns {T | null}
 */
export function talosResearchPickJudge(author, candidates) {
  return candidates.find((candidate) => !(
    candidate.provider === author.provider && candidate.model === author.model
  )) ?? null;
}

/**
 * Quali case interpellare, e in che ordine.
 *
 * Sul dispositivo per primo: gratis, senza rete, e imparentato con nessun
 * modello in cloud. Poi qualunque fornitore che non sia quello dell'autore,
 * perché la preferenza per sé è misurata estendersi alla famiglia di un modello
 * e non solo a sé stesso. Il fornitore dell'autore viene per ultimo, e ci si
 * arriva solo con un modello diverso — un'indipendenza reale ma più debole, ed
 * è per questo che il nome del giudice finisce nel rapporto, perché il lettore
 * lo possa pesare.
 *
 * @template {string} P
 * @param {P} authorProvider
 * @param {readonly P[]} providers
 * @param {P} onDevice
 * @returns {readonly P[]}
 */
export function talosResearchJudgeOrder(authorProvider, providers, onDevice) {
  return [
    ...providers.filter((provider) => provider === onDevice),
    ...providers.filter((provider) => provider !== onDevice && provider !== authorProvider),
    ...providers.filter((provider) => provider !== onDevice && provider === authorProvider),
  ];
}

/**
 * Quello che si chiede al giudice, e nient'altro.
 *
 * L'istruzione a usare solo il passaggio è la riga portante: senza, il modello
 * risponde da quello che già sa, e un'affermazione che si dà il caso sia vera
 * raccoglie una promozione da un passaggio che non l'ha mai detta — che è
 * precisamente il guasto che un controllo delle citazioni dovrebbe prendere.
 *
 * @param {string} claim
 * @param {string} passage
 * @returns {string}
 */
export function talosResearchJudgePrompt(claim, passage) {
  return [
    'Passaggio, copiato dalla fonte:',
    '"""',
    passage,
    '"""',
    '',
    'Affermazione da verificare:',
    claim,
    '',
    'Il passaggio, DA SOLO, sostiene l’affermazione?',
    'Non usare altro: né quello che sai, né quello che ti sembra probabile.',
    '',
    // ⛔⛔ IL MENU CON LE BARRE lo faceva RICOPIARE.
    //
    //   MISURATO sul Pad il 2026-08-20 con gemma-3-4b come giudice: la
    //   risposta arrivava come «Sì | PARZIALE | Il passaggio indica che…»,
    //   cioè due voci del menu invece di una. Il parser prendeva la prima
    //   e quei rapporti risultavano al 100%: erano verdetti che il giudice
    //   non aveva dato.
    //
    //   ⇒ Le tre parole si elencano una per riga, senza barre, e si mostra
    //   com’è fatta una risposta buona. Non c’è più niente da ricopiare.
    'Rispondi con UNA riga sola. Comincia con UNA di queste tre parole:',
    'SI',
    'PARZIALE',
    'NO',
    'Poi un trattino e il motivo, massimo quindici parole.',
    '',
    'Esempio di risposta: SI — il passaggio lo dice testualmente.',
    '',
    'PARZIALE significa: il passaggio riguarda l’argomento ma non sostiene',
    'tutta l’affermazione (per esempio ne sostiene il fatto ma non la misura).',
  ].join('\n');
}

/**
 * `\b` qui non serve a niente: i verdetti italiani finiscono con lettere
 * accentate, che JavaScript non conta come caratteri di parola, quindi «Sì»
 * fallirebbe un test di confine di parola.
 *
 * ⛔ Le barre in testa si saltano: un modello che risponde «| PARZIALE |
 * motivo» ha dato il verdetto, con addosso la punteggiatura del menu.
 */
const VERDICT = /^[\s|]*(s[iì]|parziale|no)(?![\p{L}\p{N}])/iu;

/** Un pezzo che è SOLO una parola di verdetto, senza niente attorno. */
const SOLO_VERDETTO = /^\s*(s[iì]|parziale|no)\s*$/iu;

/**
 * Legge il verdetto, o ammette che non ce n'era uno.
 *
 * Una risposta che non si analizza è `unchecked`, mai una promozione.
 * L'alternativa — trattare una risposta confusa come un assenso — metterebbe un
 * segno di verifica sulle affermazioni che il giudice ha trovato più difficili,
 * che è il posto peggiore possibile dove metterlo.
 *
 * @param {string} answer
 * @returns {{support: TalosResearchSupport, reason: string}}
 */
export function talosResearchParseVerdict(answer) {
  for (const line of answer.split('\n')) {
    const match = VERDICT.exec(line);
    if (!match) continue;

    /*
     * ⛔⛔ IL MENU RICOPIATO non è una scelta.
     *
     * MISURATO sul Pad il 2026-08-20: il giudice ha risposto «Sì |
     * PARZIALE | Il passaggio indica che…», cioè ha ricopiato due voci
     * del formato invece di sceglierne una. Il parser prendeva la prima
     * e attaccava il resto — barre comprese — come «motivo»: a schermo
     * si leggeva «contesa» sopra e «| PARZIALE |» sotto, due parole
     * diverse per lo stesso stato, e il verdetto era il più generoso
     * dei due.
     *
     * ⇒ Due voci del menu in una riga = nessun verdetto. Sceglierne una
     * al posto suo sarebbe inventare la parte che non ha detto.
     */
    const pezzi = line.split('|').map((pezzo) => pezzo.trim());
    if (pezzi.filter((pezzo) => SOLO_VERDETTO.test(pezzo)).length >= 2) {
      return { support: 'unchecked', reason: '' };
    }

    const word = match[1].toLowerCase();
    return {
      support: word === 'parziale' ? 'partial' : word === 'no' ? 'no' : 'yes',
      // La barra sta fra i separatori: «SI | motivo» è la stessa cosa
      // di «SI — motivo», e la barra non è parte del motivo.
      reason: line.slice(match[0].length).replace(/^[\s|—–\-:,.]+/, '').trim(),
    };
  }
  return { support: 'unchecked', reason: '' };
}

/* -------------------------------------------------------------------------- */
/* I tre livelli insieme                                                       */
/* -------------------------------------------------------------------------- */

const NO_SOURCE = 'la fonte citata non esiste fra quelle raccolte';
const NO_QUOTE = 'il passaggio non è nel testo della fonte';
const NO_JUDGE = 'nessun giudice indipendente disponibile: l’autore non può verificare sé stesso';

/**
 * Cerca chi dice il contrario, e chiede al giudice se lo dice davvero.
 *
 * ⛔ UNA sola candidata per affermazione: è una chiamata al giudice in più,
 * e sul motore del telefono le chiamate sono in fila. Cercarne tre
 * raddoppierebbe il tempo di un rapporto per trovare, quasi sempre, la
 * stessa cosa.
 *
 * ⛔ E un guasto qui NON porta via l'affermazione: torna vuoto, il verdetto
 * resta quello del primo giro. Una contesa che non si è potuta cercare non
 * è una contesa che non c'è, ma è comunque meglio di un rapporto perso.
 *
 * @param {TalosResearchVerifyDeps} deps
 * @param {TalosResearchClaim} claim
 * @param {readonly TalosResearchSource[]} sources
 * @param {TalosResearchSupport} support
 * @param {string} passage Quello che il giudice ha appena approvato: chi lo ripete non lo nega.
 * @returns {Promise<readonly TalosResearchOpposing[]>}
 */
async function contrarie(deps, claim, sources, support, passage) {
  // La contesa è disaccordo: senza un accordo prima non c'è niente con cui
  // essere in disaccordo, e chiedere costerebbe per nulla.
  if (!deps.askOpposing) return [];
  if (support !== 'yes' && support !== 'partial') return [];

  const candidata = talosResearchOpposingCandidate(claim.text, claim.sourceIndex - 1, sources, passage);
  if (!candidata) return [];

  try {
    const risposta = await deps.askOpposing(claim.text, candidata.passage);
    if (!talosResearchParseOpposingVerdict(risposta)) return [];
    return [{
      url: candidata.url,
      title: candidata.title,
      passage: candidata.passage,
      span: candidata.span,
    }];
  } catch {
    return [];
  }
}

/**
 * Fa girare i tre livelli su ogni affermazione.
 *
 * IN SEQUENZA, e non per caso: il motore sul dispositivo risponde a una
 * richiesta per volta e rifiuta la seconda, quindi una verifica che si
 * aprisse a ventaglio farebbe fallire ogni affermazione tranne la prima —
 * proprio sul giudice che non costa niente ed è quindi quello predefinito.
 *
 * L3 si salta quando L2 è fallito. Chiedere a un modello se un passaggio
 * inventato sostiene un'affermazione è chiedergli di qualcosa che non è una
 * prova; la citazione è già rotta, e pagare per farla discutere produrrebbe
 * solo un secondo parere su una fabbricazione.
 *
 * @param {TalosResearchVerifyDeps} deps
 * @param {readonly TalosResearchClaim[]} claims
 * @param {readonly TalosResearchSource[]} sources
 * @returns {Promise<readonly TalosResearchVerifiedClaim[]>}
 */
export async function talosResearchVerify(deps, claims, sources) {
  /** @type {TalosResearchVerifiedClaim[]} */
  const verified = [];

  for (const claim of claims) {
    const source = sources[claim.sourceIndex - 1];
    const span = source ? talosResearchLocate(source.text, claim.quote) : null;
    const passage = source && span ? source.text.slice(span.from, span.to) : '';

    const base = {
      resolved: source ? source.obtained : 'missing',
      quotePresent: span !== null,
      quoteSpan: span,
    };

    if (!source || !span) {
      verified.push({
        claim,
        passage,
        checks: {
          ...base,
          claimSupported: 'unchecked',
          supportReason: source ? NO_QUOTE : NO_SOURCE,
          judge: null,
          judgedAt: null,
        },
      });
      continue;
    }

    if (!deps.judge) {
      verified.push({
        claim,
        passage,
        checks: { ...base, claimSupported: 'unchecked', supportReason: NO_JUDGE, judge: null, judgedAt: null },
      });
      continue;
    }

    try {
      // Il passaggio mandato è quello ritagliato dalla fonte, quindi un modello
      // non può far passare una citazione ritoccata davanti al controllo che la
      // legge.
      const verdict = talosResearchParseVerdict(await deps.ask(claim.text, passage));
      const judged = verdict.support !== 'unchecked';
      const opposing = judged ? await contrarie(deps, claim, sources, verdict.support, passage) : [];
      verified.push({
        claim,
        passage,
        checks: {
          ...base,
          // ⛔ La contesa NON sostituisce il verdetto a mano: la regola
          //   («era un sì o un in parte, e qualcuno dice di no») sta in
          //   un posto solo, con i suoi test.
          claimSupported: talosResearchContestedVerdict(verdict.support, opposing),
          supportReason: judged ? verdict.reason : 'il giudice non ha dato un verdetto leggibile',
          judge: judged ? deps.judge.id : null,
          judgedAt: judged ? deps.at() : null,
          ...(opposing.length ? { opposing } : {}),
        },
      });
    } catch (failure) {
      // Un giudice che cade non deve portarsi via il rapporto: le altre
      // affermazioni restano controllabili, e questa dice perché non lo è.
      verified.push({
        claim,
        passage,
        checks: {
          ...base,
          claimSupported: 'unchecked',
          supportReason: failure instanceof Error ? failure.message : 'il giudice non ha risposto',
          judge: null,
          judgedAt: null,
        },
      });
    }
  }

  return verified;
}

/**
 * ⛔ CONTESA-01 — il verdetto FINALE, dopo aver guardato anche le contrarie.
 *
 * Contesa vuol dire **disaccordo**, e il disaccordo esiste solo se il
 * giudice aveva detto di sì (o in parte) e qualcuno dice di no. Se il
 * giudice ha già detto «no», una fonte contraria non è un conflitto: è la
 * stessa cosa detta due volte, e chiamarla contesa toglierebbe forza a un
 * «no» che invece è solido.
 *
 * ⛔ E una NON verificata non diventa contesa: se nessuno ha giudicato non
 * c'è niente con cui l'altra fonte possa essere in disaccordo.
 *
 * @param {TalosResearchSupport} support
 * @param {readonly TalosResearchOpposing[] | undefined} opposing
 * @returns {TalosResearchSupport}
 */
export function talosResearchContestedVerdict(support, opposing) {
  if (!opposing?.length) return support;
  return support === 'yes' || support === 'partial' ? 'contested' : support;
}

/**
 * La riga in cima al rapporto: quanto di questo ha davvero retto.
 *
 * @param {readonly TalosResearchVerifiedClaim[]} claims
 * @returns {{total:number, supported:number, partial:number, unsupported:number, unchecked:number, contested:number}}
 */
export function talosResearchVerifiedStanding(claims) {
  /** @param {TalosResearchSupport} support */
  const count = (support) =>
    claims.filter((entry) => entry.checks.claimSupported === support).length;

  return {
    total: claims.length,
    supported: count('yes'),
    partial: count('partial'),
    unsupported: count('no'),
    // Tenuto a parte da `unsupported` di proposito: «non abbiamo potuto
    // controllarlo» e «abbiamo controllato, e la fonte non lo dice» sono due
    // ammissioni diverse, e fonderle lusingherebbe la seconda.
    unchecked: count('unchecked'),
    // ⛔ E la contesa sta fuori da tutte e tre: non è una sostenuta con
    // una riserva, non è una parziale, e non è un'ammissione di non
    // sapere. È il mondo che non concorda, ed è un esito suo.
    contested: count('contested'),
  };
}
