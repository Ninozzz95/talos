/*
 * Classe 3 del cancello unico — STATI CHE MENTONO: lo schermo dice una cosa, i dati un’altra.
 *
 * ⛔ Perché esiste, coi difetti veri e non con un’ipotesi (06/09, e ognuno era lì da giorni senza
 *    che un test lo vedesse):
 *      · quattro sessioni delle 16:02-16:08 dicevano ancora «in corso» alle 18:32, col pallino vivo,
 *        mentre il server le dava `interrotta:true` (prova T05-D3);
 *      · il ritratto sotto «Cartella scelta» descriveva `C:\` mentre la carta prometteva il progetto:
 *        l’avviso diceva il falso proprio dove si decide;
 *      · «Note 1» era un contatore vivo su una pagina che non esisteva, e il clic finiva nella chat.
 *
 * Il metodo è quello scritto nel contratto (`.claude/CANCELLO-UNICO-METODI-2026-09-06.md`, classe 3):
 * contract testing applicato all’interfaccia — la risposta dell’API è la SORGENTE DI VERITÀ, lo
 * schermo è il consumatore che può andare alla deriva, e il confronto è automatico, non a occhio.
 *
 * Ricerca 06/09/2026, e ha aggiunto due vincoli che dal nostro codice non si vedevano:
 * · Total Shift Left, «What Is API Contract Testing? Pact & Schema-First (2026)» e PactFlow,
 *   «Schemas Can Be Contracts / Drift»: un motore che guarda solo la FORMA (il campo c’è, il codice
 *   di stato è 200) perde circa l’80% della deriva — quella vera sta nei VALORI. ⇒ qui non si
 *   confronta mai la presenza di un campo, si confronta sempre il valore contro il valore.
 * · Chanl, «Agent Behavioral Contracts» (02/2026): un contratto ha PRECONDIZIONI e INVARIANTI, e sono
 *   due cose diverse. ⇒ ogni regola qui ha `quando` (la precondizione: quando parla) separato da
 *   `allora` (l’invariante: cosa deve valere). Senza la separazione, una regola che non si applica
 *   torna «rispettata» e RASSICURA: è il modo in cui i cancelli muoiono.
 * · Wikipedia, «Three-valued logic»: l’esito non è booleano. Qui ne servono sei, e uno è il difetto
 *   più insidioso dichiarato dal contratto — un test su una FORMA CHE IL SERVER NON PRODUCE MAI
 *   (`{conclusa:true, interrotta:true}`) passava verde mentre il difetto era vivo a schermo.
 *
 * ⛔ Le regole sono DATI (`REGOLE`), non codice: chi trova un difetto nuovo aggiunge una riga alla
 *    lista e non tocca il motore. La forma di una riga è dichiarata sotto ed è provata dai test.
 *
 * ⛔ Funzioni PURE: nessun browser, nessuna rete, nessun disco. Chi raccoglie i dati (l’API vera) e
 *    ciò che è scritto a schermo (il DOM vero) li passa qui dentro già raccolti — è il solo modo per
 *    provare queste invarianti senza aprire una pagina.
 */

// ─── Il vocabolario dello schermo ────────────────────────────────────────────────────────────────

/**
 * Il primo segmento di «stato · modello». `creaSessionItem` scrive l’etichetta così
 * (`${stato.testo} · ${modello}`), e «conclusa · esito non registrato» è a sua volta due segmenti:
 * lo STATO è sempre il primo, e cercare la parola dentro tutta la stringa produrrebbe falsi positivi
 * appena il nome di un modello contiene una di queste parole.
 */
export function statoLetto(etichetta) {
  if (typeof etichetta !== 'string') return '';
  return etichetta.split('·')[0].trim().toLowerCase();
}

/** Le parole con cui lo schermo dichiara una sessione VIVA. Si aggiunge una riga, non si tocca il codice. */
export const PAROLE_VIVE = Object.freeze(['in corso', 'in esecuzione', 'sta lavorando']);

/** Le parole con cui lo schermo dichiara una sessione CHIUSA, in un modo o nell’altro. */
export const PAROLE_MORTE = Object.freeze(['conclusa', 'interrotta', 'errore', 'giri finiti', 'fermata']);

/** Le parole con cui lo schermo dichiara che la sessione aspetta una persona. */
export const PAROLE_ATTESA = Object.freeze(['aspetta te', 'in attesa', 'approvazione']);

export function diceInCorso(etichetta) { return PAROLE_VIVE.includes(statoLetto(etichetta)); }
export function diceMorta(etichetta) { return PAROLE_MORTE.includes(statoLetto(etichetta)); }
export function diceAttesa(etichetta) { const s = statoLetto(etichetta); return PAROLE_ATTESA.some((p) => s.includes(p)); }

/** Le classi del pallino, sia che arrivino come lista sia come `class=` grezzo del DOM. */
export function classiPallino(vista) {
  const c = vista?.classiPallino ?? vista?.pallino ?? [];
  if (Array.isArray(c)) return c.map((x) => String(x).trim()).filter(Boolean);
  return String(c).split(/\s+/).map((x) => x.trim()).filter(Boolean);
}

export function pallinoVivo(vista) { return classiPallino(vista).includes('talos-dot--live'); }
export function pallinoSuccesso(vista) { return classiPallino(vista).includes('talos-dot--success'); }

/**
 * Due percorsi Windows sono lo stesso posto anche se scritti diversi: le due barre si mescolano nei
 * nostri log, la barra finale c’è o non c’è, e il disco si scrive `C:` o `c:`.
 * ⛔ Un percorso vuoto non è «uguale a un altro vuoto»: è «non lo so», e torna `false` — dichiarare
 *    identiche due cose ignote è esattamente la bugia che questa classe deve trovare.
 */
export function stessoPercorso(a, b) {
  const n = (p) => String(p ?? '').trim().replace(/[\\/]+/g, '\\').replace(/\\+$/, '').toLowerCase();
  const na = n(a);
  const nb = n(b);
  if (!na || !nb) return false;
  return na === nb;
}

/**
 * Gli avvisi che la modale «Nuova sessione» sa scrivere, e il fatto del ritratto che ciascuno
 * pretende. ⛔ È una lista perché un avviso NUOVO non deve rendere rosso il cancello: si aggiunge la
 * sua riga quando nasce, e fino ad allora la regola S08 lo dichiara fuori dal proprio giudizio.
 */
export const AVVISI_NOTI = Object.freeze([
  Object.freeze({ id: 'radice', segno: /cartella radice/i, fatto: (r) => r?.radice === true }),
  Object.freeze({ id: 'oltre-il-tetto', segno: /pi[ùu] di [\d.]+ file/i, fatto: (r) => r?.oltreIlTetto === true }),
]);

/** Quale avviso noto è questo, o `null` se è uno che questa lista ancora non conosce. */
export function tipoAvviso(avviso) {
  const testo = String(avviso ?? '');
  return AVVISI_NOTI.find((a) => a.segno.test(testo)) ?? null;
}

/** I numeri della barra di stato che si confrontano. */
export const CAMPI_BARRA = Object.freeze(['giri', 'token', 'contesto', 'costo']);

/**
 * ⛔ Il costo è un decimale che lo schermo ARROTONDA a quattro cifre ($0,0014): confrontarlo con
 *    l’uguaglianza stretta accuserebbe ogni riga del banco. Mezza cifra dell’ultimo decimale mostrato
 *    è la sola distanza legittima; i conteggi interi non hanno tolleranza perché non hanno
 *    arrotondamento — un giro in più è un giro in più.
 */
export const TOLLERANZE = Object.freeze({ costo: 0.00005 });

// ─── La forma di una regola, e le forme che il server non produce ────────────────────────────────

/**
 * Una regola è un oggetto con questi campi. Chi ne aggiunge una copia la forma e basta.
 *
 * @typedef {object} Regola
 * @property {string} id            nome stabile, citato nel rapporto e nei test
 * @property {'alta'|'media'|'bassa'} gravita
 * @property {'sessione'|'cartella'|'barra'|'contatore'} ambito  quale coppia dati↔schermo guarda
 * @property {string} perche        il difetto VERO da cui nasce — mai una descrizione generica
 * @property {(dato:any, vista:any) => boolean} quando  la PRECONDIZIONE: se falsa la regola tace
 * @property {(dato:any, vista:any) => boolean} allora  l’INVARIANTE: se falsa lo schermo mente
 * @property {(dato:any, vista:any) => string} racconto cosa scrivere nel rapporto, coi due valori
 * @property {Array<{quando:(dato:any,vista:any)=>boolean, perche:string}>} [eccezioni]
 *           ogni eccezione porta il suo PERCHÉ: nessuna eccezione muta (contratto del cancello)
 */

/**
 * Le combinazioni che il server NON emette mai. Servono a un difetto solo, ed è il più insidioso
 * dichiarato dal contratto: il 06/09 un test provava `{conclusa:true, interrotta:true}` — una forma
 * che `session-registry` non produce (nel ripristino scrive `interrotta: !conclusa`) — e quindi
 * passava verde mentre il difetto vero era vivo a schermo. Una regola verificata su una forma
 * impossibile non è «rispettata»: non è stata provata, e il motore lo dice a voce alta.
 */
export const FORME_IMPOSSIBILI = Object.freeze([
  Object.freeze({
    id: 'IMP-CONCLUSA-E-INTERROTTA',
    ambito: 'sessione',
    quando: (d) => d?.conclusa === true && d?.interrotta === true,
    perche: 'session-registry scrive `interrotta: !conclusa`: le due non sono mai vere insieme. '
      + 'Un esito verde su questa forma non prova niente — è il difetto del 06/09.',
  }),
]);

// ─── Le regole, dichiarate come dati ─────────────────────────────────────────────────────────────

/** @type {ReadonlyArray<Regola>} */
export const REGOLE = Object.freeze([
  Object.freeze({
    id: 'S01-INTERROTTA-MAI-IN-CORSO',
    gravita: 'alta',
    ambito: 'sessione',
    perche: '06/09, prova T05-D3: quattro sessioni delle 16:02-16:08 dicevano ancora «in corso» alle '
      + '18:32. Il server le dava `interrotta:true`, nessuno le stava eseguendo, e lo schermo prometteva '
      + 'un lavoro in cammino. Stesso difetto in opencode #17680 e #19023.',
    quando: (d, v) => d?.interrotta === true && String(v?.etichetta ?? '').trim() !== '',
    allora: (d, v) => !diceInCorso(v.etichetta),
    racconto: (d, v) => `il dato dice interrotta, lo schermo scrive «${statoLetto(v.etichetta)}»`,
  }),
  Object.freeze({
    id: 'S02-INTERROTTA-MAI-PALLINO-VIVO',
    gravita: 'alta',
    ambito: 'sessione',
    perche: 'Lo stesso difetto del 06/09 visto dall’altra parte: le parole si correggono prima del '
      + 'pallino, e `talos-dot--live` continua a pulsare su una sessione morta. Il colore si legge '
      + 'prima del testo — mentire col pallino è mentire di più.',
    quando: (d, v) => d?.interrotta === true && classiPallino(v).length > 0,
    allora: (d, v) => !pallinoVivo(v),
    racconto: () => 'il dato dice interrotta, il pallino a schermo è `talos-dot--live`',
  }),
  Object.freeze({
    id: 'S03-CONCLUSA-MAI-IN-CORSO',
    gravita: 'alta',
    ambito: 'sessione',
    perche: 'Una sessione conclusa che dice «in corso» fa aspettare una risposta che non arriverà mai.',
    quando: (d, v) => d?.conclusa === true && String(v?.etichetta ?? '').trim() !== '',
    allora: (d, v) => !diceInCorso(v.etichetta),
    racconto: (d, v) => `il dato dice conclusa, lo schermo scrive «${statoLetto(v.etichetta)}»`,
  }),
  Object.freeze({
    id: 'S04-CONCLUSA-MAI-PALLINO-VIVO',
    gravita: 'alta',
    ambito: 'sessione',
    perche: 'Come S02: il pallino vivo su una sessione chiusa promette un lavoro che non c’è.',
    quando: (d, v) => d?.conclusa === true && classiPallino(v).length > 0,
    allora: (d, v) => !pallinoVivo(v),
    racconto: () => 'il dato dice conclusa, il pallino a schermo è `talos-dot--live`',
  }),
  Object.freeze({
    id: 'S05-VIVA-MAI-DICHIARATA-MORTA',
    gravita: 'media',
    ambito: 'sessione',
    perche: '⛔ Il verso contrario, e serve: la cura sbrigativa di S01-S04 è dichiarare morto tutto. '
      + 'Una lista che vieta solo di dire «vivo» lascia passare uno schermo che spegne le sessioni '
      + 'davvero in corso, e nessuno se ne accorgerebbe — è la lezione dello STRINGERE una guardia '
      + 'fino a creare un falso negativo.',
    quando: (d, v) => d?.conclusa === false && d?.interrotta !== true && String(v?.etichetta ?? '').trim() !== '',
    allora: (d, v) => !diceMorta(v.etichetta),
    racconto: (d, v) => `il dato dice viva (conclusa:false, interrotta:false), lo schermo scrive «${statoLetto(v.etichetta)}»`,
  }),
  Object.freeze({
    id: 'S06-ATTESA-SI-DICE',
    gravita: 'alta',
    ambito: 'sessione',
    perche: 'Convenzione di onestà del mockup: «aspetta te» viene prima di tutto, perché è il solo '
      + 'stato che chiede qualcosa a una persona. Nasconderlo blocca la sessione senza dire perché.',
    quando: (d, v) => d?.inAttesaApprovazione === true && String(v?.etichetta ?? '').trim() !== '',
    allora: (d, v) => diceAttesa(v.etichetta),
    racconto: (d, v) => `il dato aspetta un’approvazione, lo schermo scrive «${statoLetto(v.etichetta)}»`,
    eccezioni: [
      {
        quando: (d) => d?.interrotta === true,
        perche: 'Se il processo è morto non c’è più nessuna approvazione da dare: «interrotta» è la '
          + 'verità, e chiedere «aspetta te» manderebbe la persona a premere un pulsante inutile.',
      },
    ],
  }),
  Object.freeze({
    id: 'S07-RITRATTO-DELLA-CARTELLA-SCELTA',
    gravita: 'alta',
    ambito: 'cartella',
    perche: '06/09, prova a mano: sotto «Cartella scelta» il ritratto descriveva il disco intero mentre '
      + 'la carta prometteva il progetto. Il posto dove si decide cosa dare a un agente diceva il falso.',
    quando: (d, v) => String(d?.percorso ?? '').trim() !== '' && String(v?.percorsoDescritto ?? '').trim() !== '',
    allora: (d, v) => stessoPercorso(d.percorso, v.percorsoDescritto),
    racconto: (d, v) => `la cartella scelta è «${d.percorso}», il ritratto a schermo descrive «${v.percorsoDescritto}»`,
  }),
  Object.freeze({
    id: 'S08-AVVISO-VUOLE-IL-SUO-FATTO',
    gravita: 'alta',
    ambito: 'cartella',
    perche: 'Un avviso che compare quando il suo fatto non è vero è la stessa bugia del ritratto '
      + 'sbagliato: «questa è una cartella radice» su un progetto normale, o «più di 20.000 file» su una '
      + 'cartella piccola. E un avviso che grida a vuoto smette di essere letto proprio dove serve.',
    quando: (d, v) => String(v?.avviso ?? '').trim() !== '' && d?.ritratto?.leggibile === true,
    allora: (d, v) => tipoAvviso(v.avviso).fatto(d.ritratto) === true,
    racconto: (d, v) => `lo schermo avvisa «${String(v.avviso).slice(0, 60)}…» ma il ritratto della cartella non lo sostiene`,
    eccezioni: [
      {
        quando: (d, v) => tipoAvviso(v?.avviso) === null,
        perche: 'Un avviso che questa regola non conosce non è per ciò stesso una bugia: chi ne aggiunge '
          + 'uno aggiunge la sua riga in AVVISI_NOTI. Accusare il non-conosciuto riempirebbe il rapporto '
          + 'di falsi positivi al primo testo nuovo, e un rapporto che grida al lupo non si legge più.',
      },
    ],
  }),
  Object.freeze({
    id: 'S09-BARRA-DELLA-SESSIONE-APERTA',
    gravita: 'alta',
    ambito: 'barra',
    perche: 'I numeri della barra di stato appartengono alla sessione aperta. Se la barra sta ancora '
      + 'raccontando quella di prima, ogni decisione presa su quei numeri è presa sulla sessione sbagliata.',
    quando: (d, v) => String(d?.sessioneAperta ?? '').trim() !== '' && String(v?.sessionId ?? '').trim() !== '',
    allora: (d, v) => d.sessioneAperta === v.sessionId,
    racconto: (d, v) => `la sessione aperta è ${d.sessioneAperta}, la barra mostra i numeri di ${v.sessionId}`,
  }),
  Object.freeze({
    id: 'S10-NUMERI-DELLA-BARRA-SONO-QUELLI-VERI',
    gravita: 'alta',
    ambito: 'barra',
    perche: 'Anche puntando alla sessione giusta i numeri restano indietro di un giro: la barra si '
      + 'aggiorna da un evento, e un evento perso non lascia traccia. Qui il valore si confronta col '
      + 'valore — la sola forma che trova la deriva (contract testing, letto il 06/09/2026).',
    quando: (d, v) => campiConfrontabili(d?.barra, v).length > 0,
    allora: (d, v) => campiDiversi(d?.barra, v).length === 0,
    racconto: (d, v) => campiDiversi(d?.barra, v)
      .map((c) => `${c}: il dato dice ${d.barra[c]}, lo schermo ${v[c]}`).join(' · '),
  }),
  Object.freeze({
    id: 'S11-CONTATORE-PORTA-A-N',
    gravita: 'media',
    ambito: 'contatore',
    perche: 'Un contatore che dichiara N elementi deve portare a un luogo che ne mostra N: un «3» che '
      + 'apre una lista di 1 manda a cercare due cose che non esistono.',
    quando: (d, v) => Number.isFinite(Number(v?.quanti)) && Number.isFinite(Number(d?.quanti)),
    allora: (d, v) => Number(d.quanti) === Number(v.quanti),
    racconto: (d, v) => `il contatore dichiara ${v.quanti}, il luogo ne contiene ${d.quanti}`,
  }),
  Object.freeze({
    id: 'S12-CONTATORE-PORTA-A-UN-LUOGO',
    gravita: 'alta',
    ambito: 'contatore',
    perche: '06/09, prova T14: «Note 1» era un contatore vivo — e la nota c’era davvero sul disco — con '
      + 'NESSUNA pagina dietro: il clic finiva nella chat. ⛔ Senza questa regola S11 tacerebbe proprio '
      + 'qui, perché un luogo che non esiste non ha un numero da confrontare: la precondizione di S11 '
      + 'sarebbe falsa e il difetto peggiore passerebbe per costruzione.',
    quando: (d, v) => Number(v?.quanti) > 0,
    allora: (d) => d?.esiste === true,
    racconto: (d, v) => `il contatore dichiara ${v.quanti} elementi e non porta a nessun luogo`,
  }),
  Object.freeze({
    id: 'S13-ESITO-NON-REGISTRATO-NON-E-SUCCESSO',
    gravita: 'media',
    ambito: 'sessione',
    perche: 'Convenzione di onestà del mockup: nessun esito registrato non è un successo. Le sessioni '
      + 'vecchie non hanno l’esito, e dipingerle di verde inventa un fatto che nessuno ha misurato.',
    quando: (d, v) => d?.conclusa === true && !d?.ultimoEsito && classiPallino(v).length > 0,
    allora: (d, v) => !pallinoSuccesso(v),
    racconto: () => 'nessun esito registrato nei dati, e il pallino a schermo è `talos-dot--success`',
  }),
]);

// ─── Il motore: piccolo, e senza scorciatoie che tacciono ────────────────────────────────────────

/** I campi della barra che si possono davvero confrontare: presenti e numerici da ENTRAMBE le parti. */
export function campiConfrontabili(dato, vista) {
  const numero = (x) => x !== null && x !== undefined && x !== '' && Number.isFinite(Number(x));
  return CAMPI_BARRA.filter((c) => numero(dato?.[c]) && numero(vista?.[c]));
}

/**
 * Quali di quei campi mentono. ⛔ Un campo che il server non ha contato NON entra qui: «non contato»
 * non è «zero», e accusare uno zero mancante è la forma più comune di falso positivo su questi numeri
 * (convenzione del progetto: ciò che manca non si scrive, mai uno zero finto).
 */
export function campiDiversi(dato, vista) {
  return campiConfrontabili(dato, vista)
    .filter((c) => Math.abs(Number(dato[c]) - Number(vista[c])) > (TOLLERANZE[c] ?? 0));
}

/**
 * ⛔ Non si inghiotte l’errore di una regola. Il cancello semantico è stato inerte per mesi perché una
 *    funzione lanciava sempre e un `catch` rispondeva «ignoto» senza bloccare: una regola rotta qui
 *    torna un esito PROPRIO (`regola-rotta`), rumoroso e contato, mai un silenzioso «rispettata».
 */
function chiedi(fn, dato, vista) {
  try { return { valore: fn(dato, vista) === true }; }
  catch (errore) { return { rotta: String(errore?.message ?? errore) }; }
}

/**
 * Applica UNA regola a UNA coppia (il dato vero, ciò che è scritto a schermo per lo stesso oggetto).
 *
 * L’esito non è booleano — sono sei, e ognuno dice una cosa diversa:
 *   · `violata`           lo schermo mente: è una riga del rapporto;
 *   · `rispettata`        la regola ha guardato ed è tutto a posto;
 *   · `non-applicabile`   la precondizione è falsa: la regola NON ha guardato niente (non è «a posto»);
 *   · `esclusa`           un’eccezione dichiarata la scagiona, e il perché viaggia con l’esito;
 *   · `forma-impossibile` il dato è una combinazione che il server non produce: non prova niente;
 *   · `regola-rotta`      la regola stessa ha lanciato — va corretta, non ignorata.
 *
 * @param {Regola} regola
 * @param {any} dato    la verità (una riga dell’API)
 * @param {any} vista   ciò che è scritto a schermo per lo stesso oggetto
 * @param {string} [chiave] come si chiama questa coppia nel rapporto
 */
export function verificaRegola(regola, dato, vista, chiave = '') {
  if (!regola || typeof regola.quando !== 'function' || typeof regola.allora !== 'function') {
    throw new TypeError('verificaRegola vuole una regola con `quando` e `allora`');
  }
  const base = { regola: regola.id, chiave, gravita: regola.gravita, ambito: regola.ambito };

  const impossibile = FORME_IMPOSSIBILI
    .find((f) => f.ambito === regola.ambito && chiedi(f.quando, dato, vista).valore === true);
  if (impossibile) return { ...base, esito: 'forma-impossibile', forma: impossibile.id, perche: impossibile.perche };

  const applicabile = chiedi(regola.quando, dato, vista);
  if (applicabile.rotta) return { ...base, esito: 'regola-rotta', dove: 'quando', perche: applicabile.rotta };
  if (!applicabile.valore) return { ...base, esito: 'non-applicabile' };

  for (const eccezione of regola.eccezioni ?? []) {
    const scusa = chiedi(eccezione.quando, dato, vista);
    if (scusa.rotta) return { ...base, esito: 'regola-rotta', dove: 'eccezione', perche: scusa.rotta };
    if (scusa.valore) return { ...base, esito: 'esclusa', perche: eccezione.perche };
  }

  const invariante = chiedi(regola.allora, dato, vista);
  if (invariante.rotta) return { ...base, esito: 'regola-rotta', dove: 'allora', perche: invariante.rotta };
  if (invariante.valore) return { ...base, esito: 'rispettata' };

  let cosa = '';
  try { cosa = String(regola.racconto?.(dato, vista) ?? ''); }
  catch { cosa = '(la regola non è riuscita a raccontare la contraddizione)'; }
  return { ...base, esito: 'violata', cosa, perche: regola.perche };
}

/**
 * Le coppie dati↔schermo di un ambito. Stanno qui, e non dentro le regole, perché una regola nuova
 * non deve mai reimparare come si accoppiano gli oggetti: dichiara il suo ambito e riceve le coppie.
 */
export function coppieDi(ambito, datiApi, schermo) {
  if (ambito === 'sessione') {
    const perId = new Map((datiApi?.sessioni ?? []).map((s) => [String(s?.sessionId ?? ''), s]));
    return (schermo?.sessioni ?? [])
      .filter((v) => String(v?.sessionId ?? '') !== '' && perId.has(String(v.sessionId)))
      .map((v) => ({ chiave: String(v.sessionId), dato: perId.get(String(v.sessionId)), vista: v }));
  }
  if (ambito === 'cartella') {
    if (!datiApi?.cartella && !schermo?.cartella) return [];
    return [{ chiave: 'cartella-scelta', dato: datiApi?.cartella, vista: schermo?.cartella }];
  }
  if (ambito === 'barra') {
    if (!datiApi?.barra && !schermo?.barra) return [];
    return [{
      chiave: 'barra-di-stato',
      dato: { sessioneAperta: datiApi?.sessioneAperta, barra: datiApi?.barra },
      vista: schermo?.barra,
    }];
  }
  if (ambito === 'contatore') {
    return (schermo?.contatori ?? []).map((v) => {
      const nome = String(v?.luogo ?? v?.nome ?? '');
      return { chiave: `contatore:${nome || '(senza nome)'}`, dato: datiApi?.luoghi?.[nome], vista: v };
    });
  }
  return [];
}

/**
 * Il confronto intero: prende la verità e lo schermo, torna le contraddizioni.
 *
 * Forma degli ingressi (li raccoglie chi ha il browser, non questo modulo):
 *   datiApi = {
 *     sessioni: [ { sessionId, conclusa, interrotta, inAttesaApprovazione, ultimoEsito } ],
 *     sessioneAperta: 'id',  barra: { giri, token, contesto, costo },
 *     cartella: { percorso, ritratto: { leggibile, radice, oltreIlTetto, tetto } },
 *     luoghi: { note: { esiste: true, quanti: 3 } },
 *   }
 *   schermo = {
 *     sessioni: [ { sessionId, etichetta: 'in corso · gpt', classiPallino: ['talos-dot','talos-dot--live'] } ],
 *     barra: { sessionId, giri, token, contesto, costo },
 *     cartella: { percorsoDescritto, avviso },
 *     contatori: [ { nome: 'Note', luogo: 'note', quanti: 1 } ],
 *   }
 *
 * ⛔ `mute` è la parte che nessuno pensa a scrivere, ed è quella che tiene in vita il cancello: sono
 *    le regole che non hanno esaminato NEMMENO UNA coppia. Un rapporto senza bugie e con dieci regole
 *    mute non è una buona notizia — è un cancello che non ha guardato niente e passa per costruzione,
 *    esattamente come il verificatore di copertura del 02/09.
 * ⛔ E `rotte` non è decorativo: se non è vuoto il giro non vale, perché una regola che lancia non ha
 *    giudicato niente e la sua assenza dal rapporto somiglia in tutto a un «va bene».
 */
export function statiBugiardi(datiApi, schermo) {
  const bugie = [];
  const rotte = [];
  const impossibili = [];
  const esaminate = {};
  const coppie = {};

  for (const regola of REGOLE) {
    const lista = coppieDi(regola.ambito, datiApi, schermo);
    coppie[regola.ambito] = lista.length;
    esaminate[regola.id] = 0;
    for (const { chiave, dato, vista } of lista) {
      const esito = verificaRegola(regola, dato, vista, chiave);
      if (esito.esito === 'violata') { bugie.push(esito); esaminate[regola.id] += 1; }
      else if (esito.esito === 'rispettata') { esaminate[regola.id] += 1; }
      else if (esito.esito === 'regola-rotta') { rotte.push(esito); }
      else if (esito.esito === 'forma-impossibile') { impossibili.push(esito); }
    }
  }

  const idDati = new Set((datiApi?.sessioni ?? []).map((s) => String(s?.sessionId ?? '')));
  const idSchermo = new Set((schermo?.sessioni ?? []).map((s) => String(s?.sessionId ?? '')));

  const ordine = { alta: 0, media: 1, bassa: 2 };
  bugie.sort((a, b) => (ordine[a.gravita] ?? 3) - (ordine[b.gravita] ?? 3) || a.regola.localeCompare(b.regola));

  return {
    bugie,
    rotte,
    formeImpossibili: impossibili,
    esaminate,
    /* le regole che non hanno guardato niente: da leggere PRIMA di rallegrarsi per `bugie: []` */
    mute: REGOLE.map((r) => r.id).filter((id) => esaminate[id] === 0),
    coppie,
    /* non sono bugie: un elenco può filtrare legittimamente. Sono il contesto per leggere `mute`. */
    soloNeiDati: [...idDati].filter((id) => id && !idSchermo.has(id)),
    soloSulloSchermo: [...idSchermo].filter((id) => id && !idDati.has(id)),
  };
}
