/*
 * SessionItem — la riga di sessione della sidebar, come nel mockup.
 *
 * Primo componente della Fase 2 del piano «il mockup diventa la app». Il
 * markup è quello del blocco `data-c="SessionItem"` del mockup, byte per
 * byte; i dati sono quelli VERI di `GET /api/v1/sessions`. Il monolite
 * (`legacy/app.js`, `aggiornaElencoSessioniReali`) chiama `creaSessionItem`
 * al posto del suo vecchio `div.session-item`, e conserva tutto il resto:
 * l'apertura, la selezione multipla, il menu con il tasto destro.
 *
 * ⛔ Convenzioni di onestà del mockup, ereditate dal monolite (02/9):
 *   · l'ORDINE degli stati conta — «aspetta te» viene prima di «in corso»,
 *     perché è lo stato che chiede qualcosa alla persona; «interrotta» prima
 *     di «conclusa», perché una sessione fermata a metà è chiusa ma non finita;
 *   · nessun esito registrato ≠ successo: le sessioni vecchie non lo hanno, e
 *     chiamarle riuscite sarebbe inventare un fatto — niente pallino colorato;
 *   · giri e modello SOLO se il server li ha contati/dichiarati; ciò che
 *     manca non si scrive, mai uno zero finto;
 *   · il modello senza il prefisso del fornitore: misurato dal vivo, con il
 *     prefisso il nome si troncava.
 *
 * Elemento a Light DOM: markup normale, CSS globale del mockup, gli id
 * restano globali per il monolite (blog.master.dev/light-dom-only, letto il
 * 05/09/2026). Nessuno shadow DOM.
 */
import { usageDellaSessione } from './consumo-sessione.js'; // 06/9 CB-04: i giri della sessione, non dell'ultimo invio

/** Tono del pallino per ogni stato: le classi `talos-dot--*` del mockup. */
const TONI = Object.freeze({
  attesa: 'warning',
  vivo: 'live',
  errore: 'danger',
  successo: 'success',
  // interrotta / ignoto / pendente: pallino senza tono, come «interrotta» nel mockup.
});

/** Le parole del mockup per ogni stato. */
const ETICHETTE = Object.freeze({
  attesa: 'aspetta te',
  vivo: 'in corso',
  interrotto: 'interrotta',
  errore: 'errore',
  /*
   * ⛔⛔ 07/9, misurato: premi «ferma», il giro si chiude come chiedevi, e la riga diceva
   * **«errore»** — perche il giro finisce con un `RunError` di codice `fermato` e l'elenco
   * conosceva solo l'esito, non il motivo. Fermare non e sbagliare, e nemmeno concludere.
   * Ricerca 07/09/2026: un annullamento chiesto dalla persona non e ne
   * `end_turn` (fa sembrare completamento uno stop) ne `agent_error` (fa sembrare guasto un gesto
   * voluto): e un terzo esito. Qui si chiama «fermata».
   */
  fermata: 'fermata',
  successo: 'conclusa',
  ignoto: 'conclusa · esito non registrato',
  pendente: 'in attesa del primo messaggio',
});

/**
 * Lo stato di una sessione dai campi che il server manda già.
 * @param {object} sessione una riga di `GET /api/v1/sessions`
 * @returns {{classe:string, testo:string, tono:string|null}}
 */
export function statoSessione(sessione) {
  let classe;
  if (sessione.inAttesaApprovazione) classe = 'attesa';
  /*
   * ⛔ 06/9, prova T05-D3 — l'ordine era invertito rispetto alla convenzione dichiarata in cima a
   * questo file, e il difetto si vedeva a schermo: quattro sessioni delle 16:02-16:08 dicevano
   * ancora «in corso» alle 18:32. Il server manda `conclusa:false` E `interrotta:true` per una
   * sessione uccisa dalla morte del processo (session-registry, ripristino: `interrotta: !conclusa`),
   * e `!conclusa` intercettava il caso prima che `interrotta` potesse parlare. Risultato: una
   * sessione che NESSUNO sta eseguendo restava «in corso» per sempre, col pallino vivo.
   * ⛔ `interrotta` si azzera quando un giro riparte (session-registry, `voce.interrotta = false`):
   *    metterla per prima non può quindi spegnere una sessione davvero viva.
   * Stesso difetto trovato altrove (letto 06/09/2026): l'interfaccia web mostra uno spinner di
   * pensiero permanente dopo un'interruzione dello stream o un riavvio del server — e la
   * conclusione è la stessa, l'interfaccia
   * deve dichiarare il giro interrotto perché il worker non riprende dopo la morte del processo.
   */
  else if (sessione.interrotta) classe = 'interrotto';
  else if (!sessione.conclusa) classe = 'vivo';
  // ⛔ il motivo VINCE sull'esito: «fermata» e «giri finiti» sono chiusure previste, non guasti.
  else if (sessione.ultimoEsito === 'errore' && sessione.motivoChiusura === 'fermata') classe = 'fermata';
  else if (sessione.ultimoEsito === 'errore') classe = 'errore';
  else if (sessione.ultimoEsito === 'successo') classe = 'successo';
  else classe = 'ignoto';
  /*
   * Il MOTIVO di chiusura, quando è noto (dalla rotta /metrics: «giri-finiti»,
   * «errore», «fermata»), è più utile della sola parola «errore»: è quello che
   * il mockup mostra («giri finiti»). Se non c'è, non si inventa.
   */
  const testo = classe === 'errore' && sessione.motivoChiusura === 'giri-finiti' ? 'giri finiti' : ETICHETTE[classe];
  /*
   * ⛔ 06/9, misurato sullo screenshot: «interrotta · scrivi per riprenderla» TRONCAVA la riga e si
   * mangiava il nome del modello — il consiglio rubava l'informazione. In 180 px l'etichetta resta
   * corta come le sorelle («conclusa», «in corso»); il come-si-riparte vive nel titolo della riga,
   * dove non costa niente a nessuno (ricerca del 06/09/2026: offrire la ripresa,
   * non gridarla).
   */
  let aiuto = null;
  if (classe === 'interrotto') aiuto = 'Interrotta dalla morte del processo: nessuno la sta eseguendo. Scrivi un messaggio per riprenderla.';
  else if (classe === 'fermata') aiuto = 'L’hai fermata tu: il giro si e chiuso al primo punto sicuro. Scrivi un messaggio per continuare da qui.';
  return { classe, testo, tono: TONI[classe] ?? null, aiuto };
}

/**
 * L'ora come nel mockup: «18:09» se oggi, «ieri», poi «2 g»…, e la data
 * corta oltre la settimana. Il momento di riferimento si passa da fuori, così
 * la prova non dipende dall'orologio della macchina.
 */
export function oraCompatta(iso, adesso = new Date()) {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  const giorno = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const differenza = Math.round((giorno(adesso) - giorno(data)) / 86_400_000);
  if (differenza <= 0) return data.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  if (differenza === 1) return 'ieri';
  if (differenza < 7) return `${differenza} g`;
  return data.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
}

/** Solo il nome del modello, senza il fornitore davanti. */
export function nomeModello(modello) {
  if (typeof modello !== 'string' || modello.trim() === '') return null;
  return modello.split('/').pop();
}

function el(documentObj, tag, className, testo) {
  const nodo = documentObj.createElement(tag);
  if (className) nodo.className = className;
  if (testo !== undefined && testo !== null) nodo.textContent = String(testo);
  return nodo;
}

/**
 * Crea la riga. Il markup è ESATTAMENTE quello del mockup:
 *
 *   <button class="talos-session-item" data-c="SessionItem" [aria-current="true"]>
 *     <span><span class="talos-session-item__title">…</span>
 *           <span class="talos-session-item__sub"><span class="talos-dot talos-dot--sm [talos-dot--tono]"></span><span class="talos-session-item__state">stato · modello</span></span></span>
 *     <span class="talos-session-item__aside"><span>ora</span><span>N giri</span></span>
 *   </button>
 *
 * @param {object} sessione riga dell'API (+ `motivoChiusura` se noto)
 * @param {object} opzioni
 * @param {Document} [opzioni.document]
 * @param {boolean} [opzioni.corrente] è la sessione aperta
 * @param {Date} [opzioni.adesso]
 * @param {boolean} [opzioni.pendente] riga «Nuova · cartella» in attesa del primo messaggio
 * @param {{attiva:boolean, selezionata:boolean, onToggle:(checked:boolean)=>void}} [opzioni.selezione]
 * @param {(event:Event)=>void} [opzioni.onApri]
 * @param {(event:MouseEvent)=>void} [opzioni.onMenu]
 */
/**
 * Il nome da mettere a schermo quando la sessione non ne ha uno scelto dall'owner.
 * ⛔ 07/9, visto nel velo Albero e nella sidebar: le sessioni senza nome si chiamavano
 *   «libero:full-access · fork» — l'identificatore interno, che la regola sui nomi tecnici vieta a
 *   schermo e che non dice niente a chi rilegge domani. `libero:<cartella>` è la forma che il
 *   client genera per un compito libero: la parte dopo i due punti è la cartella, e quella si legge.
 * ⛔ Non inventa: se il taskId non è di una forma conosciuta lo mostra com'è, così un nome nuovo
 *   si vede subito invece di sparire dentro una parola generica.
 */
export function nomeLeggibileSessione(taskId) {
  const grezzo = String(taskId || '').trim();
  if (!grezzo) return 'Sessione senza nome';
  if (grezzo.startsWith('libero:')) {
    const dove = grezzo.slice('libero:'.length).trim();
    if (!dove || dove === 'default') return 'Compito libero';
    if (dove === 'full-access' || dove === 'workspace-launch') return 'Compito libero · cartella scelta a mano';
    return `Compito libero · ${dove}`;
  }
  /*
   * ⛔ 08/09 — questa riga metteva a schermo `Delega · e02f5d85-b610-4e3b-…`: l'id della MADRE,
   *   identico per tutte le sue figlie (due righe indistinguibili) e un identificatore grezzo, che
   *   la regola sui nomi tecnici vieta. Visto nella foto della barra appena le figlie sono state
   *   annidate — prima non si notava perché nessuno guardava quelle righe.
   * ⇒ Il nome di una figlia è il suo COMPITO (`taskDelega`, che ora esce dall'elenco); qui resta
   *   solo il ripiego per quando il compito non c'è, e senza id.
   */
  if (grezzo.startsWith('delega:')) return 'Sotto-agente';
  return grezzo;
}

/**
 * Riordina l'elenco piatto di `GET /api/v1/sessions` in un ALBERO DI DELEGA: ogni figlia subito
 * sotto la sua madre, e una profondità con cui indentarla.
 *
 * ⛔ 08/09/2026 — l'owner l'ha visto dal vivo: dopo una delega la barra mostrava le figlie sciolte
 *   accanto alla madre, come tre lavori indipendenti. Il frontend non poteva fare di meglio: il
 *   legame (`padreId`) non usciva dal server. Ora esce, e questa funzione lo usa.
 *
 * ⭐ Ricerca 08/09/2026 — le figlie NON si nascondono: `nesquena/hermes-webui` #1004 dice che vanno
 *   mostrate «as a delegation tree rather than collapsed… should remain visible as a tree», e la
 *   Control UI di OpenClaw annida le righe sotto una madre espandibile, dove aprire una figlia
 *   «preserva la gerarchia». ⛔ Il modo di sbagliare è documentato tre volte — OpenClaw #89249 (il
 *   selettore diventa inusabile, «1 / 177», tutto il resto sono figlie), opencode #14053 (la Web UI
 *   mostra le figlie che la TUI filtra) e la stessa lamentela su Codex: una barra allagata di
 *   sessioni che nessuno ha aperto. Annidare risolve entrambi: si vedono, ma sotto la loro madre.
 *
 * ⛔ Non inventa e non perde niente: una figlia la cui madre non è nell'elenco (madre cancellata,
 *   elenco filtrato) resta al primo livello invece di sparire — perdere una sessione dalla barra è
 *   peggio che mostrarla senza il suo posto. La profondità è limitata a 1 livello di rientro perché
 *   `LIMITE_PROFONDITA_DELEGA` è 2: è la stessa domanda che Zed #57481 lascia aperta («how deeply
 *   nested before flattening»), e da noi ha già una risposta.
 *
 * ⛔ 08/09, owner: «facciano capire con una linea tree che sono correlate a quella sessione padre».
 *   La linea la disegna il CSS, ma sapere QUALE riga è l'ultima del suo gruppo è una domanda
 *   sull'albero, non sullo stile: senza `ultima`, il tronco verticale proseguirebbe nel vuoto sotto
 *   l'ultima figlia. L'elenco è già in ordine di visita (una madre, poi tutta la sua discendenza),
 *   quindi «ultima del gruppo» si legge guardando la prima riga successiva che NON è una sua
 *   discendente: se non esiste, o è meno profonda, questa era l'ultima.
 *
 * @param {Array<object>} elenco righe dell'API, nell'ordine in cui arrivano (più recenti prima)
 * @returns {Array<{sessione:object, profondita:number, ultima:boolean}>}
 */
/*
 * ⛔ 09/09 — trovato nella FOTO del giro con delega: le due figlie si chiamavano
 * «crea un file chiamato parte1.md…» e «crea un file chiamato parte2.md…», e nella riga della barra
 * ne entrano ~28 caratteri: a schermo erano DUE RIGHE IDENTICHE, «crea un file chiamato par…». Il nome
 * era giusto (è il compito vero, curato poche ore prima); a mancare era ciò che DISTINGUE.
 *
 * ⇒ Fra sorelle, le parole che hanno tutte in comune non distinguono niente: si tolgono, e al loro
 *   posto va un'ellissi che dice che il compito comincia prima. «crea un file chiamato…» sparisce,
 *   «…parte1.md con tre righe sul registro dei processi» resta.
 *
 * ⛔ Tre guardie, perché una cura non deve mai peggiorare il caso normale:
 *   · serve più di una sorella (con una sola non c'è niente da distinguere);
 *   · il prefisso comune si taglia su un confine di PAROLA e deve valere la pena (≥ 12 caratteri):
 *     togliere «crea » non aiuta nessuno e fa perdere l'inizio della frase;
 *   · dopo il taglio deve restare abbastanza testo (≥ 6 caratteri), altrimenti si tiene il nome intero.
 *  Se una qualunque non è soddisfatta, i nomi tornano immutati: nel dubbio si mostra il compito vero.
 */
export function prefissoComuneDiParole(nomi) {
  const righe = (Array.isArray(nomi) ? nomi : []).map((n) => String(n ?? ''));
  if (righe.length < 2 || righe.some((n) => !n)) return '';
  let comune = righe[0];
  for (const n of righe.slice(1)) {
    let i = 0;
    while (i < comune.length && i < n.length && comune[i] === n[i]) i += 1;
    comune = comune.slice(0, i);
    if (!comune) return '';
  }
  // il taglio cade su un confine di parola: mezza parola in comune non è un prefisso, è un troncamento
  const ultimoSpazio = comune.lastIndexOf(' ');
  return ultimoSpazio > 0 ? comune.slice(0, ultimoSpazio + 1) : '';
}

/** I nomi delle sorelle senza le parole che hanno tutte in comune. Immutati se la cura non serve. */
export function nomiDistintiFraSorelle(nomi, { minimoPrefisso = 12, minimoResto = 6 } = {}) {
  const righe = (Array.isArray(nomi) ? nomi : []).map((n) => String(n ?? ''));
  const comune = prefissoComuneDiParole(righe);
  if (comune.trim().length < minimoPrefisso) return righe;
  const tagliati = righe.map((n) => n.slice(comune.length).trim());
  if (tagliati.some((n) => n.length < minimoResto)) return righe;
  return tagliati.map((n) => `\u2026${n}`);
}

export function ordinaSessioniAdAlbero(elenco) {
  const righe = Array.isArray(elenco) ? elenco.filter(Boolean) : [];
  const presenti = new Set(righe.map((s) => s.sessionId));
  const figliePer = new Map();
  for (const s of righe) {
    const padre = s.padreId && presenti.has(s.padreId) ? s.padreId : null;
    if (!padre) continue;
    if (!figliePer.has(padre)) figliePer.set(padre, []);
    figliePer.get(padre).push(s);
  }
  // le figlie in ordine di AVVIO (la prima delegata prima), all'opposto dell'elenco delle madri:
  // dentro un albero l'ordine di lettura è quello in cui il lavoro è stato distribuito
  for (const gruppo of figliePer.values()) {
    gruppo.sort((a, b) => String(a.avviataAlle ?? '').localeCompare(String(b.avviataAlle ?? '')));
  }
  /*
   * ⛔ Il nome distintivo si può calcolare SOLO qui: dipende dalle sorelle, e una riga da sola non sa
   * di averne. Non si tocca la sessione (è il dato del server): il nome viaggia accanto alla riga.
   */
  const distintivoPer = new Map();
  for (const gruppo of figliePer.values()) {
    const nomi = nomiDistintiFraSorelle(gruppo.map((f) => f.taskDelega ?? ''));
    gruppo.forEach((f, i) => { if (nomi[i] && nomi[i] !== f.taskDelega) distintivoPer.set(f.sessionId, nomi[i]); });
  }
  const fatte = new Set();
  const fuori = [];
  const scendi = (sessione, profondita) => {
    if (fatte.has(sessione.sessionId)) return; // una catena circolare non deve appendere la barra
    fatte.add(sessione.sessionId);
    fuori.push({ sessione, profondita });
    for (const figlia of figliePer.get(sessione.sessionId) ?? []) scendi(figlia, profondita + 1);
  };
  for (const s of righe) {
    if (s.padreId && presenti.has(s.padreId)) continue; // esce sotto la sua madre, non qui
    scendi(s, 0);
  }
  // ⛔ AL CONTRARIO: nessuna riga si perde per strada, nemmeno dentro un ciclo di padri
  for (const s of righe) if (!fatte.has(s.sessionId)) fuori.push({ sessione: s, profondita: 0 });
  return fuori.map((v, i) => {
    // la prima riga successiva che non è una sua discendente: se manca, o è più in alto, è l'ultima
    const dopo = fuori.slice(i + 1).find((altra) => altra.profondita <= v.profondita);
    return { ...v, ultima: !dopo || dopo.profondita < v.profondita, nomeDistintivo: distintivoPer.get(v.sessione.sessionId) ?? null };
  });
}

/**
 * N1 \u2014 aggiorna una riga GI\u00c0 disegnata, senza ricostruirla.
 *
 * \u26d4 Sul posto, e non \u00e8 un vezzo: ricostruire la riga a ogni evento le farebbe perdere il fuoco
 *   sotto le dita di chi naviga da tastiera, e la farebbe lampeggiare a ogni token che arriva.
 * \u26d4 Tocca solo ci\u00f2 che \u00e8 CAMBIATO: scrivere lo stesso testo nel DOM cancella comunque la selezione
 *   di chi stava leggendo, ed \u00e8 il difetto che il blocco di codice della chat ha gi\u00e0 pagato.
 * \u26d4 Il conteggio dei giri parla della SESSIONE, non dell'ultimo invio (CB-04, 06/09): chi chiama
 *   passa il totale, non l'usage del turno.
 *
 * @param {Element} riga la `.talos-session-item` da aggiornare
 * @param {{stato?:{classe:string,testo:string,tono:string|null}, modello?:string|null, giri?:number|null}} dati
 * @returns {boolean} `true` se qualcosa \u00e8 davvero cambiato
 */
export function aggiornaSessionItem(riga, dati = {}) {
  if (!riga || typeof riga.querySelector !== 'function') return false;
  let cambiato = false;

  const stato = dati.stato;
  if (stato && typeof stato.classe === 'string') {
    if (riga.dataset.sessionState !== stato.classe) { riga.dataset.sessionState = stato.classe; cambiato = true; }
    const pallino = riga.querySelector('.talos-dot');
    if (pallino) {
      const classe = `talos-dot talos-dot--sm${stato.tono ? ` talos-dot--${stato.tono}` : ''}`;
      if (pallino.className !== classe) { pallino.className = classe; cambiato = true; }
    }
    const testo = riga.querySelector('.talos-session-item__state');
    if (testo) {
      /* Il modello sta nella stessa frase dello stato: se chi chiama non lo passa si tiene quello
         che c'\u00e8 gi\u00e0 a schermo, invece di cancellarlo. */
      const modello = dati.modello === undefined
        ? (testo.textContent.includes(' \u00b7 ') ? testo.textContent.split(' \u00b7 ').slice(1).join(' \u00b7 ') : null)
        : dati.modello;
      const frase = modello ? `${stato.testo} \u00b7 ${modello}` : stato.testo;
      if (testo.textContent !== frase) { testo.textContent = frase; cambiato = true; }
    }
  }

  if (Number.isFinite(dati.giri) && dati.giri > 0) {
    const aside = riga.querySelector('.talos-session-item__aside');
    if (aside) {
      const frase = `${dati.giri} gir${dati.giri === 1 ? 'o' : 'i'}`;
      /* L'ultimo figlio dell'aside \u00e8 il conteggio, quando c'\u00e8: si riconosce dalla parola, non dalla
         posizione \u2014 una riga senza giri ha l\u00ec solo l'ora, e sovrascriverla direbbe l'ora sbagliata. */
      const ultimo = aside.lastElementChild;
      const eIlConteggio = ultimo && /\bgir[oi]\b/.test(ultimo.textContent || '');
      if (eIlConteggio) {
        if (ultimo.textContent !== frase) { ultimo.textContent = frase; cambiato = true; }
      } else {
        const nuovo = riga.ownerDocument.createElement('span');
        nuovo.textContent = frase;
        aside.append(nuovo);
        cambiato = true;
      }
    }
  }

  return cambiato;
}

export function creaSessionItem(sessione, opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const riga = el(documentObj, 'button', 'talos-session-item');
  riga.type = 'button';
  riga.setAttribute('data-c', 'SessionItem');
  if (opzioni.corrente) riga.setAttribute('aria-current', 'true');
  if (sessione.sessionId) riga.dataset.realSessionId = sessione.sessionId;

  const etichetta = opzioni.pendente
    ? `Nuova · ${sessione.nomeCartella || ''}`
    // ⭐ 08/09: una figlia si chiama col suo compito — un nome scelto a mano vince comunque
    // ⛔ `nomeDistintivo` prima di `taskDelega`: fra sorelle è lo stesso compito senza le parole che
    //    hanno tutte in comune — senza, a schermo due deleghe diverse sono la stessa riga troncata.
    : `${sessione.nome || opzioni.nomeDistintivo || sessione.taskDelega || nomeLeggibileSessione(sessione.taskId)}${sessione.forkDa ? ' · ramo' : ''}`;
  const stato = opzioni.pendente ? { classe: 'pendente', testo: ETICHETTE.pendente, tono: null } : statoSessione(sessione);
  riga.dataset.sessionState = stato.classe;
  if (stato.aiuto) riga.title = stato.aiuto; // il consiglio dove non ruba spazio alla riga

  const testo = el(documentObj, 'span');
  const titolo = el(documentObj, 'span', 'talos-session-item__title', etichetta);
  const sotto = el(documentObj, 'span', 'talos-session-item__sub');
  const pallino = el(documentObj, 'span', `talos-dot talos-dot--sm${stato.tono ? ` talos-dot--${stato.tono}` : ''}`);
  const modello = opzioni.pendente ? null : nomeModello(sessione.modello);
  sotto.append(pallino, el(documentObj, 'span', 'talos-session-item__state', modello ? `${stato.testo} · ${modello}` : stato.testo));
  testo.append(titolo, sotto);

  const aside = el(documentObj, 'span', 'talos-session-item__aside');
  if (!opzioni.pendente) {
    aside.append(el(documentObj, 'span', null, oraCompatta(sessione.avviataAlle, opzioni.adesso)));
    // ⛔ 06/9, CB-04: la riga dell'elenco parla della SESSIONE, quindi i giri sono quelli di
    //    tutta la conversazione: `usage` è il solo ultimo invio, e diceva «1 giro» su tre.
    const giri = usageDellaSessione(sessione)?.giri;
    if (Number.isFinite(giri) && giri > 0) aside.append(el(documentObj, 'span', null, `${giri} gir${giri === 1 ? 'o' : 'i'}`));
  }

  if (opzioni.selezione?.attiva) {
    /* La selezione multipla del monolite: una casella per riga, nel vocabolario del mockup (.talos-checkbox). */
    const casella = el(documentObj, 'input', 'talos-checkbox');
    casella.type = 'checkbox';
    casella.checked = Boolean(opzioni.selezione.selezionata);
    casella.dataset.sessionSelect = sessione.sessionId || '';
    casella.setAttribute('aria-label', `Seleziona ${etichetta}`);
    casella.addEventListener('click', (event) => event.stopPropagation());
    casella.addEventListener('change', () => opzioni.selezione.onToggle?.(casella.checked));
    riga.append(casella);
    riga.classList.add('is-selection-mode');
    if (casella.checked) riga.classList.add('is-selected');
  }

  riga.append(testo, aside);
  if (typeof opzioni.onApri === 'function') riga.addEventListener('click', opzioni.onApri);
  if (typeof opzioni.onMenu === 'function') {
    riga.addEventListener('contextmenu', (event) => { event.preventDefault(); event.stopPropagation(); opzioni.onMenu(event); });
  }
  return riga;
}
