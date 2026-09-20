/*
 * Modelli installati — la scheda «Installati» del Model Lab nel linguaggio del
 * mockup (`#panel-installati`): riga per modello (`ListRow`), dettaglio
 * (`DetailPanel`), ricerca e filtro di stato, riga della memoria, verdetto «Entra».
 *
 * 06/09, B6.8: i dati sono quelli
 * del monolite — manifest di `/api/v1/local-models` (+ `name`), il motore locale
 * (cosa è caricato, RAM) e `state.modelLab.fit` (Map id → { esito } con
 * `memory.requiredBytes/availableBytes` come li scrive `local-runtime-probe.mjs`).
 * Le parole sono quelle del mockup, i numeri in it-IT con la virgola.
 *
 * Ricerca 06/09/2026: LM Studio «My Models» distingue modelli sul disco da modelli
 * caricati in memoria e li carica/scarica dalla stessa lista (lmstudio.ai/docs/cli,
 * datacamp LM Studio tutorial); qui lo stato è un badge per riga e un filtro.
 */

const GB = 1024 ** 3;
const numero = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });
/** «5,2 GB» come nel mockup (GB decimali di 1024³, una cifra). */
export function gb(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '—';
  return `${numero.format(n / GB)} GB`;
}
export function contestoK(token) {
  const n = Number(token);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n >= 1_000_000 ? `${numero.format(n / 1_000_000)}M token` : `${Math.round(n / 1024)}k token`;
}

export const STATI_INSTALLATO = Object.freeze({
  caricato: { etichetta: 'Caricato', tono: 'accent' },
  disco: { etichetta: 'Sul disco', tono: '' },
  incompleto: { etichetta: 'Incompleto', tono: 'warning' },
  guasto: { etichetta: 'Non riuscito', tono: 'danger' },
});

/** Il verdetto «Entra», dall'esito del server. `null` se non ancora verificato. */
export function verdettoEntra(fit, runtime = {}) {
  const esito = fit?.esito;
  if (fit?.inCorso) return { chiave: 'attesa', etichetta: 'Verifica in corso…', tono: '', dettaglio: '' };
  if (fit?.errore) return { chiave: 'errore', etichetta: 'Verifica non riuscita', tono: 'danger', dettaglio: String(fit.errore) };
  if (!esito) return null;
  const richiesti = esito.memory?.requiredBytes;
  const disponibili = Number.isFinite(esito.memory?.availableBytes) ? esito.memory.availableBytes : runtime.allocabiliBytes;
  const ok = esito.state === 'compatible';
  if (ok && Number.isFinite(richiesti) && Number.isFinite(disponibili) && richiesti / disponibili >= 0.9) {
    return { chiave: 'stretto', etichetta: 'Entra stretto', tono: 'warning', dettaglio: `~${gb(richiesti)} richiesti su ${gb(disponibili)} allocabili` };
  }
  if (ok) return { chiave: 'entra', etichetta: 'Entra', tono: 'success', dettaglio: Number.isFinite(richiesti) ? `~${gb(richiesti)} di memoria con contesto ${contestoK(runtime.contestoStimaToken || 8192)}` : '' };
  if (esito.state === 'unknown') return { chiave: 'ignoto', etichetta: 'Non verificato', tono: '', dettaglio: 'Il server non ha potuto stimare la memoria.' };
  const mancano = Number.isFinite(richiesti) && Number.isFinite(disponibili) && richiesti > disponibili ? `: mancano ~${gb(richiesti - disponibili)}` : '';
  return { chiave: 'non-entra', etichetta: 'Non entra', tono: 'danger', dettaglio: Number.isFinite(richiesti) ? `~${gb(richiesti)} richiesti${mancano}` : '' };
}

function quantizzazione(percorso = '') {
  const m = String(percorso).match(/[._-](I?Q\d[A-Z0-9_]*|F16|BF16|F32)(?=[._-]|\.gguf$)/i);
  return m ? m[1].toUpperCase() : null;
}

/** Tutto ciò che la riga e il dettaglio devono dire di un modello. */
export function datiModelloInstallato(modello = {}, { runtime = {}, fit = null } = {}) {
  const caricato = runtime.caricato && runtime.caricato === modello.id;
  const stato = caricato ? 'caricato' : modello.state === 'incomplete' ? 'incompleto' : modello.state === 'failed' ? 'guasto' : 'disco';
  const contesto = contestoK(modello.contextLength);
  const verdetto = verdettoEntra(fit, runtime);
  const q = quantizzazione(modello.files?.[0]?.path) || quantizzazione(modello.path); // il nome del FILE porta la quantizzazione; `path` può essere la cartella
  return {
    id: modello.id,
    nome: modello.name || modello.id || 'Modello',
    match: `${modello.name || ''} ${modello.id || ''} ${modello.repo || ''}`.toLowerCase().trim(),
    stato, etichettaStato: STATI_INSTALLATO[stato].etichetta, tonoStato: STATI_INSTALLATO[stato].tono,
    sotto: `${gb(modello.bytes)} sul disco${contesto ? ` · contesto massimo ${contesto}` : ''}`,
    sottoDue: verdetto?.dettaglio || '',
    verdetto,
    formato: q ? `GGUF · ${q}` : 'GGUF',
    dimensione: gb(modello.bytes),
    origine: modello.repo === 'local-upload' ? 'Importato dal computer' : 'Hugging Face',
    licenza: modello.license || 'Licenza non dichiarata',
    percorso: modello.path || '',
    caricato: Boolean(caricato),
  };
}

export function filtraInstallati(modelli = [], { query = '', stato = 'tutti', runtime = {} } = {}) {
  const q = String(query).trim().toLowerCase();
  return modelli.filter((m) => {
    const caricato = runtime.caricato && runtime.caricato === m.id;
    if (stato === 'caricato' && !caricato) return false;
    if (stato === 'disco' && caricato) return false;
    if (!q) return true;
    return [m.name, m.id, m.repo].some((v) => String(v || '').toLowerCase().includes(q));
  });
}

function el(documentObj, tag, classe, testo) {
  const n = documentObj.createElement(tag);
  if (classe) n.className = classe;
  if (testo != null) n.textContent = testo;
  return n;
}
function icona(documentObj, nome, classe = 'i') {
  const svg = documentObj.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', classe); svg.setAttribute('aria-hidden', 'true');
  const use = documentObj.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${nome}`); svg.appendChild(use);
  return svg;
}
function badge(documentObj, testo, tono) {
  const b = el(documentObj, 'span', `talos-badge talos-badge--sm${tono ? ` talos-badge--${tono}` : ''}`, testo);
  b.dataset.c = 'Badge';
  return b;
}

/** La riga della lista, esattamente come nel mockup. */
export function creaRigaInstallata(dati, { selezionato = false, seleziona, document: documentObj = globalThis.document } = {}) {
  const b = el(documentObj, 'button', 'talos-list-row');
  b.type = 'button'; b.dataset.c = 'ListRow'; b.dataset.model = dati.id; b.dataset.match = dati.match; b.dataset.installedState = dati.stato;
  b.setAttribute('aria-pressed', String(Boolean(selezionato)));
  const ic = el(documentObj, 'span', 'talos-list-row__icon'); ic.appendChild(icona(documentObj, 'i-bolt'));
  const testo = el(documentObj, 'span', 'talos-list-row__text');
  const sub = el(documentObj, 'span', 'talos-list-row__sub', dati.sotto);
  if (dati.sottoDue) { sub.appendChild(documentObj.createElement('br')); sub.appendChild(documentObj.createTextNode(dati.sottoDue)); }
  testo.append(el(documentObj, 'span', 'talos-list-row__title', dati.nome), sub);
  const aside = el(documentObj, 'span', 'talos-list-row__aside');
  if (dati.stato === 'caricato' || dati.stato === 'incompleto' || dati.stato === 'guasto') aside.appendChild(badge(documentObj, dati.etichettaStato, dati.tonoStato));
  if (dati.verdetto) aside.appendChild(badge(documentObj, dati.verdetto.etichetta, dati.verdetto.tono));
  b.append(ic, testo, aside);
  if (typeof seleziona === 'function') b.addEventListener('click', () => seleziona(dati.id));
  return b;
}

/*
 * ⭐⭐⭐⭐ 19/09/2026 — FASE 4-bis, corsia D. LE DUE AZIONI DISTRUTTIVE SU UN MODELLO INSTALLATO.
 *
 * Owner, guardando il suo schermo: «Download non ha tutte le opzioni: non posso eliminare i modelli
 * installati, non posso rinominarli. È tutto previsto dal backend su 4174». Le rotte ci sono
 * (`http-app.mjs:1251`: `POST /api/v1/local-models/<id>/{rename,copy-path,delete}`); qui si porta a
 * schermo il PEZZO CHE MANCA — la riga della coda non offriva né l'una né l'altra.
 *
 * ⛔ COSA TOCCA DAVVERO OGNI ROTTA — MISURATO il 19/09/2026 su un server ISOLATO (porta 4218,
 *   store suo: `.tmp-corsia-d/`, sonda `sonda-rotte.mjs`), albero del disco fotografato prima e
 *   dopo ogni chiamata. Non dedotto leggendo il codice:
 *
 *   · `rename` scrive **SOLO** `manifests/<id>.name.json` (26 byte: il nome e un a-capo).
 *     Il manifest `<id>.json` resta **byte per byte lo stesso**, la cartella del modello non si
 *     sposta, il file dei pesi non si tocca, e l'`id` non cambia. ⇒ **Cambia il nome MOSTRATO**, e
 *     nient'altro. Per questo il campo si chiama «Nome mostrato» e la riga di aiuto lo DICE.
 *   · `delete` porta via **la cartella del modello** (i pesi), il manifest `<id>.json` e il
 *     `<id>.name.json`. La radice `.local-models/` sopravvive: non si tocca mai se stessa, e niente
 *     fuori da sé (`local-model-store.mjs:296-319`, il controllo `dentro()` prima di ogni `rm`).
 *   · ⛔ `delete` su un id che NON esiste risponde **200 `{"deleted":true}`** e sul disco non cambia
 *     niente. La rotta da sola non è una prova: chi la chiama deve RILEGGERE l'elenco. È la ragione
 *     per cui l'esito di queste azioni viaggia come **verdetto** (vedi `verdettoAzioneModello`) e non
 *     si deduce dal codice HTTP.
 *
 * Ricerca fatta PRIMA di scrivere, 19/09/2026 — le fonti della fase coprono la MODALE, non il
 * pannello dentro la riga:
 *  · il primo clic TRASFORMA il comando sul posto in conferma/annulla, invece di aprire un dialogo:
 *    si resta nel contesto e il fuoco non si sposta lontano (dioxus-nox-inline-confirm 0.13.2
 *    «Inline Confirm: Idle shows the trigger, Confirming shows confirm/cancel»; ember-safe-button,
 *    «stay in context, keep focus… lighter weight than a full dialog»; fredwu/jquery-inline-
 *    confirmation, nato proprio contro `confirm()`).
 *  · ⛔ E LA CONFERMA NON È UN ESITO: risponde a «sei sicuro?», non a «è andata?» — il flusso vuole
 *    comunque uno stato di riuscita e uno d'errore propri (docs.wappler.io «Delete with
 *    Confirmation»). Da qui `verdettoAzioneModello` e la riga `role="status"` in fondo al pannello.
 *  · l'annullamento resta sempre raggiungibile e mai nascosto, e nessun default è distruttivo
 *    (Deibler, universal-design-principles, «forgiveness-confirmation-and-prevention»).
 *  · per la RINOMINA in linea: il campo prende il fuoco con il testo selezionato (Chakra `Editable`,
 *    `selectAllOnFocus` default `true`; manaflow-ai/cmux#7395), invio conferma ed ESC annulla
 *    (Chakra `onSubmit`/`onCancel`; luketmoss/hive#182 «AC4: cancelling or pressing Escape reverts to
 *    the display state»), l'etichetta è visibile e l'errore sta su `aria-describedby` +
 *    `aria-invalid` (hive#182; WCAG 2.5.3 «Label in Name»), e il comando NON resta raggiungibile da
 *    tastiera mentre si modifica (jira.xwiki.org XWIKI-19145, 2.4.3).
 *  · ⛔ NIENTE SALVATAGGIO AL PERDERE IL FUOCO, di proposito: la pratica lo indica come la più grande
 *    incoerenza possibile («click-away saving in one place and discarding in another… pick one model
 *    and keep it consistent», saasui.design «SaaS Inline Editing & Edit-in-Place UX Patterns 2026»)
 *    — e qui salvare da soli mentre la persona guarda altrove sarebbe una scrittura senza consenso.
 *  · il fuoco TORNA al comando che ha aperto il pannello quando il pannello si chiude
 *    (vercel.com/geist Menu; Chakra `finalFocusRef`).
 *  · ⛔ DIVERGENZA DICHIARATA dalla riga della ricerca della fase («il pulsante finale è disabilitato
 *    finché non è armato»): qui il pulsante finale **non esiste** finché il pannello non è aperto — e
 *    il pannello È l'armamento — quindi non c'è nessun momento in cui è visibile e premibile senza
 *    essere armato. Resta `disabled` **durante la chiamata**, che è l'unico stato in cui premerlo di
 *    nuovo sarebbe un secondo invio.
 */

/** Quanti caratteri accetta un nome: la stessa misura che rifiuta il deposito (`local-model-store.mjs:322`, `> 160`). */
export const NOME_MODELLO_MAX = 160;

/**
 * L'esito di un'azione ridotto a ciò che si può MOSTRARE.
 *
 * ⛔ Il contratto con chi fornisce l'azione — è la sola cosa che rende onesto il verso che fallisce:
 *   · risolve `{ ok: true }`            → è andata: chi ha chiamato l'ha VERIFICATO (vedi sotto);
 *   · risolve `{ ok: false, motivo }`   → non è andata, e il perché;
 *   · lancia un errore                  → non è andata, col suo messaggio e il suo codice;
 *   · risolve qualunque altra cosa      → **non vale come «fatto»**. Un esito che non dichiara
 *     niente non è una riuscita: la riga dice che l'esito non è confermato, invece di scrivere una
 *     vittoria che nessuno ha misurato.
 * Perché serve: MISURATO il 19/09/2026, `POST …/delete` su un id inesistente risponde 200
 * `{"deleted":true}` senza toccare il disco. Una UI che legge il 200 scriverebbe «eliminato» sopra
 * un modello che è ancora là. ⇒ Chi fornisce `elimina` deve rileggere l'elenco e rispondere
 * `{ ok: false }` se l'id c'è ancora.
 *
 * @returns {{tono: 'success'|'danger'|'warning', etichetta: string, testo: string}}
 */
export function verdettoAzioneModello(esito, { azione = 'elimina', nome = '' } = {}) {
  const chi = nome ? `«${nome}»` : 'Il modello';
  const rinominato = azione === 'rinomina';
  if (esito && esito.ok === true) {
    return rinominato
      ? { tono: 'success', etichetta: 'Nome salvato', testo: `${chi} ora si chiama ${esito.nome ? `«${esito.nome}»` : 'come hai scritto'}.` }
      : { tono: 'success', etichetta: 'Eliminato dal disco', testo: `${chi} non è più su questo computer.` };
  }
  if (esito && esito.ok === false) {
    const motivo = esito.motivo || esito.messaggio || esito.message || 'il comando non è andato a buon fine';
    return {
      tono: 'danger',
      etichetta: rinominato ? 'Nome non salvato' : 'Non eliminato',
      testo: `${chi} è ancora come prima: ${motivo}.`,
    };
  }
  /* Un esito senza verdetto: si dice quel che si sa e quel che NON si sa. */
  return {
    tono: 'warning',
    etichetta: 'Esito non confermato',
    testo: `Il comando è partito, ma non ho potuto controllare se ${chi} è cambiato davvero: rileggi l'elenco per esserne sicuro.`,
  };
}

/**
 * Il pannello di conferma dell'eliminazione — DENTRO la riga a cui appartiene, non in fondo alla
 * sezione e non in un velo: il primo clic ARMA (non cancella niente), il secondo esegue.
 *
 * ⛔ La frase dice ciò che sparisce DAVVERO, ed è la misura qui sopra a dettarla: i file del modello,
 *   non «un manifest»; e il modello non è tolto dal sito d'origine — da lì resta scaricabile.
 * ⛔ Il fuoco va su «Annulla» (chi apre il pannello con la tastiera non deve trovarsi la punta delle
 *   dita sul pulsante che cancella), e il comando d'annullamento non si nasconde mai.
 *
 * @param {{id: string, nome: string, dimensione?: string}} dati
 * @param {{inCorso?: boolean, verdetto?: object|null, onAnnulla?: Function, onEsegui?: Function,
 *          document?: Document}} [opzioni] Il FUOCO non si mette qui: lo decide chi monta il
 *   pannello (una sola volta, non a ogni ridisegno) — vedi `applicaFuoco` in `download-coda.js`.
 */
export function creaConfermaEliminazione(dati, { inCorso = false, verdetto = null, onAnnulla, onEsegui, document: d = globalThis.document } = {}) {
  const card = el(d, 'div', 'talos-check-card talos-check-card--danger talos-lab__space');
  card.dataset.c = 'ConfermaEliminazione';
  card.dataset.modello = dati.id;
  card.appendChild(el(d, 'span', 'talos-check-card__stripe'));
  const corpo = el(d, 'div', 'talos-check-card__body');
  corpo.append(
    el(d, 'b', 'talos-check-card__title', `Eliminare «${dati.nome}»?`),
    el(d, 'p', '', `Spariscono i file del modello${dati.dimensione ? ` (${dati.dimensione})` : ''} e la sua scheda: fra i modelli installati non ci sarà più. Dal sito d'origine resta scaricabile, ma qui va scaricato o importato da capo.`),
  );
  const az = el(d, 'div', 'talos-check-card__actions');
  const annulla = el(d, 'button', 'talos-button talos-button--secondary talos-button--sm', 'Annulla');
  annulla.type = 'button'; annulla.dataset.c = 'Button'; annulla.dataset.action = 'annullaEliminaModello';
  annulla.disabled = inCorso;
  if (onAnnulla) annulla.addEventListener('click', () => onAnnulla(dati.id));
  /* ⛔ STESSA PAROLA PER LA STESSA AZIONE: il comando che apre il pannello dice «Elimina dal disco»
     e il comando che esegue dice «Elimina dal disco» — è la lezione di «Riprendi» della FASE 4, due
     nomi per un'azione sola mandano a cercare un pulsante che non esiste. La differenza fra i due
     passi la porta il TITOLO del pannello, che nomina l'oggetto e fa la domanda. */
  const esegui = el(d, 'button', 'talos-button talos-button--danger talos-button--sm', inCorso ? 'Elimino…' : 'Elimina dal disco');
  esegui.type = 'button'; esegui.dataset.c = 'Button'; esegui.dataset.action = 'eseguiEliminaModello';
  esegui.disabled = inCorso;
  if (onEsegui) esegui.addEventListener('click', () => onEsegui(dati.id));
  az.append(annulla, esegui);
  corpo.appendChild(az);
  if (verdetto) corpo.appendChild(creaRigaEsitoModello(verdetto, { document: d }));
  card.appendChild(corpo);
  return card;
}

/**
 * Il campo della rinomina, dentro la riga. Il fuoco entra NEL CAMPO col testo selezionato (si
 * scrive sopra, non si cancella a mano), invio salva, ESC annulla.
 *
 * ⛔ Cosa cambia lo dice la riga di aiuto, ed è la misura del 19/09: **solo il nome mostrato**. Il
 *   campo si chiama «Nome mostrato» per la stessa ragione — «Nome» da solo lascerebbe credere che si
 *   rinomini il file o la cartella, che è esattamente ciò che la rotta NON fa.
 * ⛔ Il tetto dei caratteri è quello del deposito (160): scritto qui, la persona non arriva mai a
 *   ricevere l'«Errore interno» che il deposito risponde a un nome vuoto o troppo lungo
 *   (misurato: 500 `INTERNAL_ERROR`, la classe sbagliata per un campo che è dell'utente).
 */
export function creaCampoRinomina(dati, { bozza = '', inCorso = false, errore = null, verdetto = null, onAnnulla, onSalva, onBozza, document: d = globalThis.document } = {}) {
  const card = el(d, 'div', 'talos-check-card talos-check-card--info talos-lab__space');
  card.dataset.c = 'CampoRinomina';
  card.dataset.modello = dati.id;
  card.appendChild(el(d, 'span', 'talos-check-card__stripe'));
  const corpo = el(d, 'div', 'talos-check-card__body');
  const idCampo = `nomeModello-${String(dati.id).replace(/[^a-z0-9_-]/giu, '-')}`;
  const etichetta = el(d, 'label', 'talos-stack', 'Nome mostrato');
  etichetta.htmlFor = idCampo;
  const campo = el(d, 'input', 'talos-field__input');
  campo.type = 'text'; campo.id = idCampo; campo.value = bozza; campo.autocomplete = 'off';
  campo.maxLength = NOME_MODELLO_MAX;
  campo.dataset.campo = 'nomeModello';
  campo.disabled = inCorso;
  etichetta.appendChild(campo);
  const aiuto = el(d, 'p', 'talos-muted', `Cambia solo il nome con cui il modello compare qui e nella sua pagina: il file e la cartella sul disco non si toccano. Al massimo ${NOME_MODELLO_MAX} caratteri.`);
  aiuto.id = `${idCampo}-aiuto`;
  corpo.append(etichetta, aiuto);
  if (errore) {
    const allarme = el(d, 'p', 'talos-muted', errore);
    allarme.dataset.campoErrore = '';
    allarme.setAttribute('role', 'alert');
    allarme.id = `${idCampo}-errore`;
    campo.setAttribute('aria-invalid', 'true');
    campo.setAttribute('aria-describedby', `${aiuto.id} ${allarme.id}`);
    corpo.appendChild(allarme);
  } else campo.setAttribute('aria-describedby', aiuto.id);
  const az = el(d, 'div', 'talos-check-card__actions');
  const annulla = el(d, 'button', 'talos-button talos-button--secondary talos-button--sm', 'Annulla');
  annulla.type = 'button'; annulla.dataset.c = 'Button'; annulla.dataset.action = 'annullaRinominaModello';
  annulla.disabled = inCorso;
  if (onAnnulla) annulla.addEventListener('click', () => onAnnulla(dati.id));
  const salva = el(d, 'button', 'talos-button talos-button--primary talos-button--sm', inCorso ? 'Salvo…' : 'Salva nome');
  salva.type = 'button'; salva.dataset.c = 'Button'; salva.dataset.action = 'salvaNomeModello';
  /* ⛔ IL COMANDO NON SI SPEGNE SUL NOME VUOTO, e la ragione è una lezione di casa: «un bottone che
     non porta da nessuna parte lo DICE, invece di inghiottire il clic». Spento, il comando non
     spiega niente — chi preme Invio a campo vuoto non vede succedere NIENTE e non sa perché.
     Acceso, il clic arriva a chi esegue, che RISPONDE: il nome vuoto non chiama la rete (il
     deposito lo rifiuterebbe con un 500 «Errore interno», misurato) e scrive il perché nel campo.
     Resta spento solo mentre la chiamata è in volo, che è l'unico stato in cui premerlo di nuovo
     sarebbe un secondo invio. */
  salva.disabled = inCorso;
  if (onSalva) salva.addEventListener('click', () => onSalva(dati.id, campo.value));
  az.append(annulla, salva);
  /* ⛔ OGNI TASTA PORTA SU LA BOZZA, e NON ridisegna il campo: ridisegnarlo a ogni carattere
     toglierebbe il cursore a chi sta scrivendo. La bozza sale a chi ha montato il pannello perché
     la coda si ridisegna da sola ogni 800 ms mentre qualcosa scarica, e senza di lei il nome
     appena scritto andrebbe perso sotto le dita.
     ⛔ NIENTE SALVATAGGIO AL PERDERE IL FUOCO (scelta dichiarata nella testata del blocco): qui si
     salva solo con «Salva nome» o con Invio, mai da soli mentre la persona guarda altrove. */
  campo.addEventListener('input', () => onBozza?.(campo.value));
  /* Invio salva, ESC annulla. Invio passa dalla STESSA strada del clic, nome vuoto compreso: un
     tasto che non fa niente e non lo dice è la stessa bugia di un comando spento senza motivo. */
  campo.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter') { evento.preventDefault(); onSalva?.(dati.id, campo.value); }
    else if (evento.key === 'Escape') { evento.preventDefault(); onAnnulla?.(dati.id); }
  });
  corpo.appendChild(az);
  /* ⛔ L'ESITO STA DENTRO IL PANNELLO finché il pannello è aperto: se la rinomina fallisce il campo
     resta lì per correggere, e il perché deve stare accanto al comando che l'ha chiesta — non in
     fondo alla riga, dove chi ha appena premuto non sta guardando. */
  if (verdetto) corpo.appendChild(creaRigaEsitoModello(verdetto, { document: d }));
  card.appendChild(corpo);
  return card;
}

/* Nessuna riga di CSS nuova: `talos-check-card`, `talos-stack`, `talos-field__input`,
   `talos-cluster`, `talos-badge--*` sono le classi che il prodotto ha già. */

/**
 * La riga d'esito di un'azione su un modello. ⛔ Il tono NON è decorazione: senza di lui
 * «Eliminato dal disco» e «Non eliminato» sarebbero due frasi dello stesso colore, e un esito
 * rosso letto come verde è la forma di bugia che questa corsia esiste per impedire. Il tono
 * viaggia su un `Badge`, che le classi del prodotto colorano già (`talos-badge--danger` ·
 * `--success` · `--warning`): `src/styles/` non è di questa corsia, e il CSS nuovo si CHIEDE.
 *
 * `role="status"` + `aria-atomic`: è un messaggio di stato e si annuncia intero (WCAG 4.1.3,
 * come la riga dei conteggi della coda). `tabindex="-1"` perché è anche il posto in cui il fuoco
 * atterra quando il comando che ha aperto il pannello non esiste più.
 */
export function creaRigaEsitoModello(verdetto, { document: d = globalThis.document } = {}) {
  const riga = el(d, 'p', 'talos-lab__space');
  riga.dataset.c = 'EsitoModello';
  riga.dataset.tono = verdetto.tono;
  riga.setAttribute('role', 'status');
  riga.setAttribute('aria-atomic', 'true');
  riga.tabIndex = -1;
  riga.append(badge(d, verdetto.etichetta, verdetto.tono), d.createTextNode(` ${verdetto.testo}`));
  return riga;
}

/**
 * Il dettaglio (`DetailPanel` del mockup). `azioni` = { libera, verifica, rinomina, copia, elimina };
 * `nodoFit` (facoltativo) è il verdetto esteso del monolite, appeso sotto l'azione principale.
 */
export function aggiornaDettaglioInstallato(aside, dati, { runtime = {}, azioni = {}, nodoFit = null, document: documentObj = globalThis.document } = {}) {
  if (!aside) return;
  aside.replaceChildren();
  if (!dati) { aside.hidden = true; return; }
  aside.hidden = false;
  const stato = el(documentObj, 'span'); stato.id = 'modelloStato';
  stato.appendChild(badge(documentObj, dati.caricato ? 'In uso nella chat' : dati.etichettaStato, dati.caricato ? 'accent' : dati.tonoStato));
  const nome = el(documentObj, 'h3', '', dati.nome); nome.id = 'modelloNome';
  const desc = el(documentObj, 'p', 'talos-detail__desc', 'Modello locale per conversazione e codice.'); desc.id = 'modelloDescrizione';
  const kv = (k, v, id) => { const r = el(documentObj, 'div', 'talos-kv'); const val = el(documentObj, 'span', 'talos-kv__v'); if (id) { const s = el(documentObj, 'span', '', v); s.id = id; val.appendChild(s); } else val.textContent = v; r.append(el(documentObj, 'span', 'talos-kv__k', k), val); return r; };
  aside.append(stato, nome, desc, kv('Formato', dati.formato), kv('File sul disco', dati.dimensione, 'modelloDimensione'), kv('Origine', dati.origine), kv('Licenza', dati.licenza, 'modelloLicenza'), el(documentObj, 'hr', 'talos-lab__rule'));
  aside.append(kv('Contesto della stima', contestoK(runtime.contestoStimaToken || 8192) || '8k token'), el(documentObj, 'p', 'talos-muted talos-lab__space', 'Stima con le impostazioni del motore attuale.'));
  const stima = el(documentObj, 'div', 'talos-lab__space');
  if (dati.verdetto) {
    stima.appendChild(badge(documentObj, dati.verdetto.etichetta, dati.verdetto.tono));
    stima.appendChild(documentObj.createTextNode(' '));
    const s = el(documentObj, 'span'); s.id = 'modelloStima';
    const richiesti = dati.verdetto.dettaglio.match(/~([\d.,]+ GB)/)?.[1];
    if (richiesti) { const m = el(documentObj, 'span', 'talos-measure talos-measure--estimate', richiesti); m.dataset.c = 'Measure'; s.append(m, documentObj.createTextNode(' richiesti')); } else s.textContent = dati.verdetto.dettaglio;
    stima.appendChild(s);
  } else {
    stima.appendChild(el(documentObj, 'span', 'talos-muted', 'Non ancora verificato su questa macchina.'));
  }
  aside.appendChild(stima);
  const azione = el(documentObj, 'button', 'talos-button talos-button--secondary talos-button--block'); azione.id = 'azioneModello'; azione.type = 'button';
  if (dati.caricato) { azione.dataset.action = 'memoria'; azione.textContent = runtime.unloading ? 'Liberazione…' : 'Libera memoria'; azione.disabled = Boolean(runtime.unloading || runtime.loading || runtime.error); if (azioni.libera) azione.addEventListener('click', () => azioni.libera(dati.id)); }
  else { azione.dataset.action = 'verifica'; azione.dataset.verifyFit = dati.id; azione.textContent = 'Verifica compatibilità'; if (azioni.verifica) azione.addEventListener('click', () => azioni.verifica(dati.id)); }
  aside.appendChild(azione);
  const effetto = el(documentObj, 'p', 'talos-muted talos-lab__space'); effetto.id = 'modelloEffetto';
  effetto.textContent = dati.caricato && Number.isFinite(runtime.usatiDalModelloBytes)
    ? `Libera ${gb(runtime.usatiDalModelloBytes)}. Conserva il file da ${dati.dimensione} sul disco.`
    : `Il file da ${dati.dimensione} resta sul disco finché non lo elimini.`;
  aside.appendChild(effetto);
  if (nodoFit) aside.appendChild(nodoFit);
  const cluster = el(documentObj, 'div', 'talos-cluster talos-lab__space');
  const pulsante = (testo, classe, nome, fn) => { const b = el(documentObj, 'button', classe, testo); b.type = 'button'; b.dataset.c = 'Button'; b.dataset.azione = nome; if (fn) b.addEventListener('click', () => fn(dati.id)); return b; };
  cluster.append(
    /* ⭐ 18/09/2026 — «Apri la pagina» in TESTA: è l'azione principale su un modello (la pagina
       con la scheda Hugging Face, i file e la compatibilità), e la rotta è quella del mockup.
       Prima dell'elenco c'erano solo azioni di manutenzione: rinominare, copiare, cancellare. */
    pulsante('Apri la pagina', 'talos-button talos-button--ghost talos-button--sm', 'pagina', azioni.pagina),
    pulsante('Rinomina', 'talos-button talos-button--ghost talos-button--sm', 'rinomina', azioni.rinomina),
    pulsante('Copia percorso', 'talos-button talos-button--ghost talos-button--sm', 'copia', azioni.copia),
    pulsante('Elimina dal disco', 'talos-button talos-button--danger talos-button--sm', 'elimina', azioni.elimina),
  );
  aside.appendChild(cluster);
}

/**
 * Riscrive il pannello: riga della memoria, placeholder della ricerca, lista, stato vuoto, dettaglio.
 * Torna l'id selezionato (o null).
 */
export function aggiornaInstallati(panel, modelli = [], opzioni = {}) {
  if (!panel) return null;
  const { query = '', stato = 'tutti', selezionato = null, runtime = {}, fit = new Map(), errore = null, caricamento = false, seleziona, azioni = {}, nodoFit, document: documentObj = globalThis.document } = opzioni;
  const lista = panel.querySelector('[data-installati-lista], #listaInstallati, #modelLabInstalledList');
  const vuoto = panel.querySelector('[data-c="EmptyState"]');
  const dettaglio = panel.querySelector('[data-c="DetailPanel"]');
  const cerca = panel.querySelector('input[type="search"]');
  const memoria = panel.querySelector('[data-installati-memoria]') || panel.querySelector('.talos-toolbar strong')?.parentElement;
  if (cerca) cerca.placeholder = `Cerca nei ${modelli.length} modelli installati…`;
  if (memoria) {
    const testi = memoria.querySelectorAll('strong, span:not(.talos-grow)');
    if (testi[0]) testi[0].textContent = Number.isFinite(runtime.ramTotaleBytes) ? `Questo computer · ${Math.round(runtime.ramTotaleBytes / GB)} GB di RAM` : 'Questo computer · RAM non misurata';
    if (testi[1]) testi[1].textContent = Number.isFinite(runtime.usatiDalModelloBytes) && runtime.caricato ? `${gb(runtime.usatiDalModelloBytes)} usati dal modello` : runtime.caricato ? 'Modello in memoria · uso RAM non misurato' : runtime.loading || runtime.error ? 'Stato memoria non disponibile' : 'Nessun modello in memoria';
    if (testi[2]) testi[2].textContent = Number.isFinite(runtime.liberiBytes) ? `${gb(runtime.liberiBytes)} liberi` : 'RAM libera non misurata';
  }
  panel.setAttribute('aria-busy', String(Boolean(caricamento)));
  if (!lista) return null;
  if (errore) {
    lista.replaceChildren(el(documentObj, 'p', 'talos-card--pad talos-muted', `Modelli locali non disponibili: ${errore.message || errore}`));
    if (vuoto) vuoto.hidden = true;
    aggiornaDettaglioInstallato(dettaglio, null, { document: documentObj });
    return null;
  }
  const visibili = filtraInstallati(modelli, { query, stato, runtime });
  const scelto = visibili.find((m) => m.id === selezionato) || visibili[0] || null;
  // gli a-capo fra le righe sono quelli del sorgente del mockup: le PAROLE del cancello li vedono come spazi
  lista.replaceChildren(...visibili.flatMap((m) => [documentObj.createTextNode('\n'), creaRigaInstallata(datiModelloInstallato(m, { runtime, fit: fit.get?.(m.id) || null }), { selezionato: scelto?.id === m.id, seleziona, document: documentObj })]), documentObj.createTextNode('\n'));
  if (visibili.length === 0) {
    if (caricamento) lista.replaceChildren(el(documentObj, 'p', 'talos-card--pad talos-muted', 'Lettura dei modelli sul disco…'));
    else if (modelli.length === 0) lista.replaceChildren(el(documentObj, 'p', 'talos-card--pad talos-muted', 'Nessun modello sul computer: importa un .gguf o scaricane uno da Hugging Face.'));
    if (vuoto) vuoto.hidden = !(modelli.length > 0 && !caricamento);
  } else if (vuoto) vuoto.hidden = true;
  aggiornaDettaglioInstallato(dettaglio, scelto ? datiModelloInstallato(scelto, { runtime, fit: fit.get?.(scelto.id) || null }) : null, { runtime, azioni, nodoFit: scelto && nodoFit ? nodoFit(scelto.id) : null, document: documentObj });
  return scelto?.id || null;
}

/**
 * Sposta il pannello del mockup dentro quello del monolite (stesso schema di
 * `montaCatalogoModelli`), rinominando i controlli con gli id che il monolite ascolta
 * (ricerca, importazione, lista) e aggiungendo progresso e annulla dell'importazione.
 *
 * ⛔ 18/09/2026 — IL TRAVASO REGGE ENTRAMBE LE DIREZIONI (corsia 3, il travaso neutro). Chi arriva
 * in `originale` può essere il markup CANONICO (come oggi: il mockup scende in Impostazioni) oppure
 * quello LEGACY (destinazione invertita: il laboratorio sale sulla schermata), e il secondo porta
 * GIÀ gli id che il monolite ascolta. ⇒ Gli id si rinominano solo se sono ancora quelli canonici, e
 * ogni nodo che manca si salta invece di far esplodere il montaggio.
 * ⛔ E il timbro di montaggio va su ENTRAMBE le radici: `ensureModelLabControls` (app.js) guarda
 * `dataset.installatiMontato` sul pannello che è stato SVUOTATO, e senza il timbro la sua
 * `insertBefore(controls, $('#modelLabInstalledList'))` esplode con `NotFoundError` — il nodo di
 * riferimento ora vive nell'altro pannello. È il crollo n. 3 del 18/09, riprodotto nella prova
 * `tests/browser/lab-montaggio-neutro.spec.mjs`.
 * Fonti consultate il 18/09/2026: MDN `Node.insertBefore` (`NotFoundError`: «the node before which
 * the new node is to be inserted is not a child of this node»); prassi del timbro `data-*`
 * controllato prima di scrivere, con l'elemento come perimetro.
 */
export function montaInstallati(originale, canonico, { document: documentObj = globalThis.document } = {}) {
  if (!originale || !canonico || originale.dataset.installatiMontato) return;
  originale.replaceChildren(...canonico.children);
  originale.dataset.installatiMontato = 'true';
  canonico.dataset.installatiMontato = 'true';
  const ids = { cercaInstallati: 'modelLabInstalledSearchControl', importaGguf: 'modelLabImportButton', fileGguf: 'modelLabImportInput', esitoImportazione: 'modelLabImportStatus', listaInstallati: 'modelLabInstalledList', filtroInstallati: 'modelLabInstalledStateFilter' };
  for (const [prima, dopo] of Object.entries(ids)) {
    const n = originale.querySelector(`#${prima}`) || originale.querySelector(`#${dopo}`); if (!n) continue;
    if (n.id !== prima) continue; // id già quello che il monolite ascolta: non c'è niente da rinominare
    for (const label of originale.querySelectorAll(`label[for="${prima}"]`)) label.htmlFor = dopo;
    n.id = dopo;
  }
  const lista = originale.querySelector('#modelLabInstalledList') || originale.querySelector('#listaInstallati'); if (lista) { lista.dataset.installatiLista = ''; lista.replaceChildren(); }
  const memoria = originale.querySelector('.talos-toolbar strong')?.parentElement; if (memoria) memoria.dataset.installatiMemoria = '';
  const esito = originale.querySelector('#modelLabImportStatus') || originale.querySelector('#esitoImportazione');
  if (esito && !originale.querySelector('#modelLabImportProgress')) {
    const progress = documentObj.createElement('progress'); progress.id = 'modelLabImportProgress'; progress.max = 100; progress.value = 0; progress.hidden = true; progress.className = 'talos-lab__meter';
    const annulla = el(documentObj, 'button', 'talos-button talos-button--ghost talos-button--sm', 'Annulla'); annulla.type = 'button'; annulla.id = 'modelLabImportCancelButton'; annulla.hidden = true;
    esito.after(progress, annulla);
  }
  aggiornaDettaglioInstallato(originale.querySelector('[data-c="DetailPanel"]') || originale.querySelector('#dettaglioInstallato'), null, { document: documentObj });
}
