/*
 * Coda dei download — la scheda «Download» del Model Lab nel linguaggio del mockup
 * (`#panel-download`): conteggi per stato, «Mostra solo attivi», una `DownloadRow` per
 * trasferimento con barra, misure (percento · ricevuti di totali · velocità · rimanente),
 * Pausa/Riprendi/Annulla, scheda d'errore con Riprendi e Dettagli, riga «Completato» con
 * «Vedi modello», e — quando la coda è DAVVERO vuota — lo stato vuoto del mockup.
 *
 * 06/09, B6.10. I dati sono gli stati di
 * `/api/v1/huggingface/downloads` (`hf-direct-transfer.mjs status()`: id, state
 * queued · running · verifying · paused · failed · ready · cancelled, progress, bytes,
 * totalBytes, reason, startedAt) più il manifest del download (repo, files). Velocità e
 * tempo rimanente li stima il chiamante fra due letture successive: il server non li dà,
 * e un numero inventato non si scrive.
 *
 * Ricerca 06/09/2026: gli stati utili di una coda sono queued · running · paused ·
 * failed · verifying · finished, con motivo del fallimento e «riprova» per singola voce;
 * dopo il download il file si verifica (sha256) prima di dichiararlo pronto
 * (AB Download Manager 2026, Vortex download management, Continuata docs).
 *
 * ⛔ 19/09/2026 — FASE 4, corsia 3. Il mockup `TALOS-Calm-Lab-04.html` disegna la scheda
 * «Download» VUOTA (1 stato vuoto 1122×330, 0 righe): quando la coda ha elementi il
 * vocabolario è il suo e il contenuto è il NOSTRO vero (owner 18/09: «il corrispondente
 * reale così com'è ma applicando solo lo stile»). Da qui tre cure di ONESTÀ, ognuna col
 * suo metro nella ricerca della fase (letta il 19/09/2026):
 *
 *  1. LE PERCENTUALI SOLO SE SI SANNO CALCOLARE — «se manca il totale, niente barra piena e
 *     niente 0: stato indeterminato o a passi. Uno `0%` quando il dato non c'è è una bugia».
 *     `datiDownload` cadeva su `0` e la riga scriveva «0% · 0 di — GB» su un trasferimento
 *     di cui il server non aveva dichiarato né il progresso né il totale.
 *     ⛔ Ricerca 19/09/2026 (MDN, `<progress>`): «If there is no `value` attribute, the
 *     progress bar is indeterminate» — e `value="0"` è invece una barra DETERMINATA a zero.
 *     ⇒ L'indeterminato si ottiene SOLO togliendo l'attributo, non scrivendo zero; e
 *     l'etichetta accessibile sta su `aria-label`, perché il testo fra i tag «is not an
 *     accessible label» (stessa pagina).
 *  2. I CONTATORI DEVONO COMBACIARE CON LE RIGHE — «la contraddizione fra contatore e lista
 *     è il difetto da non lasciare». `contaStati` non conosceva `cancelled`: tre download
 *     annullati disegnavano tre righe e ZERO badge. Ora ogni riga è contata (il totale si
 *     somma) e, quando il filtro nasconde qualcosa, la riga dei conteggi LO DICE.
 *     ⛔ Ricerca 19/09/2026 (WCAG 2.1 SC 4.1.3 «Status Messages», Proper Access; la
 *     convenzione dei risultati filtrati in contributor.info #1526): un conteggio del genere
 *     è un messaggio di stato — va in una regione viva PROPRIA (`role="status"` +
 *     `aria-atomic="true"`, non `aria-live` sulla lista, che farebbe annunciare tutti i
 *     risultati) e quella regione deve esistere VUOTA dall'inizio, mai nascosta con
 *     `display:none`.
 *  3. L'ETICHETTA DICE COSA SUCCEDE — la scheda d'errore diceva «Riprova» mentre il trasporto
 *     RIPRENDE lo stesso trasferimento dal punto salvato (`hf-direct-transfer.mjs:91`:
 *     `resume` vale su `paused|failed`), ed era la STESSA azione che la riga in pausa chiama
 *     «Riprendi». Il mockup interattivo la chiama «Riprendi» anche sull'errore
 *     (`TALOS-Calm-Lab-04.html`: `['paused','error'].includes(j.status)?button('Riprendi',…)`).
 *     ⛔ DIVERGENZA DICHIARATA: il riferimento statico dei componenti
 *     (`mockup/talos-mockup.html`) porta ancora «Riprova» su quella riga.
 *
 * ⛔ E LA VOCE RESTA MONTATA anche quando non sta lavorando: un download finito o fallito che
 * sparisce lascia l'utente senza via di recupero (ricerca della fase). Lo stato vuoto, quando
 * la coda è vuota davvero, SPIEGA cosa fare invece di essere un vuoto muto.
 *
 * ⛔ CSS: lo stato vuoto veste le classi del mockup (`.empty-state` e i suoi figli). Le regole
 * NON stanno in questo file — le foglie stanno in `src/styles/` — e sono state CHIESTE
 * all'orchestratore insieme alla consegna di questa corsia (misure del mockup: min-height
 * 330px, bordo tratteggiato, angoli 12px, icona 34px, h3 1.25rem, p 13px su 420px).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * ⭐⭐⭐⭐ 19/09/2026 — FASE 4-bis, corsia D: «ELIMINA» E «RINOMINA» ANCHE SULLA RIGA COMPLETATA.
 *
 * Owner: «Download non ha tutte le opzioni: non posso eliminare i modelli installati, non posso
 * rinominarli. È tutto previsto dal backend su 4174». Fino a stamattina la riga `ready` offriva
 * «Vedi modello» e basta (`app.js:22579` passa `pausa/riprendi/annulla/vediModello`: né `elimina`
 * né `rinomina` esistevano in quel vocabolario).
 *
 * ⛔ PERCHÉ I DUE COMANDI COMPAIONO SOLO SE QUALCUNO LI SA FARE. Si disegnano se e solo se il
 *   chiamante passa `azioni.elimina` / `azioni.rinomina`. Il laboratorio dei componenti
 *   (`lab/main.js:442`) non passa NESSUNA azione e il cancello `COMP CodaDownload`
 *   (`tests/parity/componenti.spec.mjs`) confronta proprio quel disegno col mockup: un comando
 *   disegnato «perché prima o poi servirà» cambierebbe quella misura e romperebbe il cancello.
 *   ⇒ Il vocabolario della riga cresce solo dove c'è una porta vera dietro.
 *
 * ⛔ COSA SUCCEDE DOPO UN'ELIMINAZIONE RIUSCITA — MISURATO il 19/09/2026 su un server ISOLATO
 *   (porta 4218, sonda `sonda-coda.mjs`): il modello sparisce da `GET /api/v1/local-models`, ma
 *   `GET /api/v1/huggingface/downloads` **porta ancora la sua riga `ready`** (il registro dei
 *   trasferimenti tiene la voce in memoria e non la pota). ⇒ Se non si dicesse niente, la riga
 *   continuerebbe a scrivere «Disponibile nei modelli installati» sopra un modello che non c'è
 *   più: la bugia che questa corsia esiste per impedire. Perciò, dopo un'eliminazione riuscita,
 *   la riga cambia frase, spegne «Vedi modello» (prometterebbe una pagina che non esiste più) e
 *   non rioffre i due comandi.
 *
 * ⛔ E L'ESITO NON SI DEDUCE DAL CODICE HTTP. `POST …/delete` su un id inesistente risponde
 *   **200 `{"deleted":true}`** senza toccare il disco (misurato). La riga quindi non legge la
 *   busta: chiede un VERDETTO a chi ha eseguito l'azione (`verdettoAzioneModello`, in
 *   `modelli-installati.js`) e, se il verdetto non arriva, scrive che l'esito non è confermato
 *   invece di scrivere una vittoria che nessuno ha misurato.
 *
 * ⛔ LO STATO DEL PANNELLO VIVE SUL PANNELLO, non in una variabile di modulo. La coda si ridisegna
 *   ogni 800 ms finché qualcosa scarica (`app.js:3661`), e `aggiornaCodaDownload` ricostruisce le
 *   righe: un pannello aperto, un nome appena scritto o un esito appena letto sparirebbero sotto
 *   le mani di chi li sta guardando. Lo stato sta su `panel.dataset.statoAzioniModello` — lo stesso
 *   posto e la stessa idea del contatore del filtro — e si riapplica a ogni disegno.
 *
 * Ricerca fatta PRIMA di scrivere, 19/09/2026 (le fonti della fase coprono la modale, non il
 * pannello dentro la riga): il comando si trasforma SUL POSTO in conferma/annulla, perché così si
 * resta nel contesto e non si sposta il fuoco lontano — «stay in context, keep focus… lighter
 * weight than a full dialog» (ember-safe-button); «Idle shows the trigger, Confirming shows
 * confirm/cancel» (dioxus-nox-inline-confirm 0.13.2). ⛔ E la conferma NON è un esito: risponde a
 * «sei sicuro?», non a «è andata?» — servono comunque uno stato di riuscita e uno d'errore propri
 * (docs.wappler.io, «Delete with Confirmation»). L'annullamento resta sempre raggiungibile e
 * nessun default è distruttivo (Deibler, «forgiveness-confirmation-and-prevention»).
 */
import { gb, creaConfermaEliminazione, creaCampoRinomina, creaRigaEsitoModello, verdettoAzioneModello } from './modelli-installati.js';

export const STATI_DOWNLOAD = Object.freeze({
  queued: { etichetta: 'In coda', tono: '', attivo: true },
  running: { etichetta: 'In corso', tono: 'accent', attivo: true },
  verifying: { etichetta: 'Verifica del file', tono: 'accent', attivo: true },
  paused: { etichetta: 'In pausa', tono: 'warning', attivo: true },
  failed: { etichetta: 'Fallito', tono: 'danger', attivo: true },
  ready: { etichetta: 'Completato', tono: 'success', attivo: false },
  cancelled: { etichetta: 'Annullato', tono: '', attivo: false },
});

const MOTIVI = Object.freeze({
  PAUSED_BY_OWNER: 'Messo in pausa da te',
  NETWORK: 'La connessione si è interrotta',
  HASH_MISMATCH: "L'impronta del file non corrisponde",
  DISK_FULL: 'Spazio sul disco esaurito',
  HTTP_ERROR: 'Il server di Hugging Face ha risposto con un errore',
  CANCELLED: 'Annullato',
});
export function motivoUmano(reason) {
  if (!reason) return 'La connessione si è interrotta';
  const chiave = String(reason).toUpperCase().replace(/[^A-Z_]/g, '_');
  for (const [k, v] of Object.entries(MOTIVI)) if (chiave.includes(k)) return v;
  return String(reason);
}

export function mbs(bytesAlSecondo) {
  const v = Number(bytesAlSecondo);
  if (!Number.isFinite(v) || v <= 0) return null;
  const mb = v / (1024 * 1024);
  return `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: mb < 10 ? 1 : 0 }).format(mb)} MB/s`;
}
export function rimanente(secondi) {
  const s = Number(secondi);
  if (!Number.isFinite(s) || s < 0) return null;
  if (s < 60) return 'meno di 1 min';
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`;
}
export function oraBreve(iso) {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '';
}

/**
 * Cosa dice una riga: nome del file, sottotitolo, stato, misure. `stima` = { bytesAlSecondo, secondiRimanenti }.
 * ⛔ `percento` è `null` quando NON si può calcolare (`progress` assente E totale non dichiarato):
 * un `0` scritto al posto di un dato che manca è una bugia, e la riga lo disegna indeterminato.
 */
export function datiDownload(item = {}, { stima = null } = {}) {
  const stato = STATI_DOWNLOAD[item.state] || { etichetta: String(item.state || 'sconosciuto'), tono: '', attivo: true };
  const file = item.request?.files?.[0]?.path || item.file || item.id;
  const nomeFile = String(file).split('/').pop();
  const repo = item.request?.repo || item.repo || '';
  /* ⛔ Il TOTALE non è mai «quanto si è ricevuto»: `totalBytes` lo dichiara il server, `request.bytes`
     lo dichiara il manifest. Il ripiego su `item.bytes` che stava qui faceva `ricevuti / ricevuti`,
     cioè un `100%` su un totale che nessuno aveva dichiarato — la stessa bugia dello `0%`, dall'altro
     lato. Senza totale il percento si ricava da `progress`, e se manca anche quello è `null`. */
  const totale = Number.isFinite(item.totalBytes) ? item.totalBytes : item.request?.bytes;
  const ricevuti = Number.isFinite(item.bytes) ? item.bytes : 0;
  const totaleNoto = Number.isFinite(totale) && totale > 0;
  const percento = Number.isFinite(item.progress)
    ? Math.max(0, Math.min(100, Math.round(item.progress)))
    : (totaleNoto ? Math.round((ricevuti / totale) * 100) : null);
  const velocita = mbs(stima?.bytesAlSecondo);
  const resto = rimanente(stima?.secondiRimanenti);
  return {
    id: item.id, nomeFile, nome: item.name || item.request?.name || nomeFile, stato: item.state, etichettaStato: stato.etichetta, tono: stato.tono, attivo: stato.attivo,
    sotto: item.state === 'ready'
      ? `${gb(totale)} · completato${item.finishedAt ? ` alle ${oraBreve(item.finishedAt)}` : ''} · verifica del file riuscita`
      : `${repo ? `${repo.replace('/', ' / ')} · ` : ''}${item.state === 'failed' ? gb(totale) : 'Hugging Face'}`,
    percento, misurabile: percento !== null, ricevuti: gb(ricevuti), totale: gb(totale), velocita, resto,
    errore: item.state === 'failed' ? { titolo: motivoUmano(item.reason), testo: `Ricevuti ${gb(ricevuti)}. Il modello non è ancora disponibile. Puoi riprovare dal punto salvato.`, dettagli: [item.reason, item.startedAt ? `avviato alle ${oraBreve(item.startedAt)}` : '', `ultimo blocco salvato: ${gb(ricevuti)}`].filter(Boolean).join(' · ') } : null,
  };
}

/**
 * Il riepilogo della coda, UNA categoria per riga disegnata.
 * ⛔ `tot` è il numero delle righe che la coda ha davvero: è quello che rende i contatori
 * verificabili contro la lista (la somma delle categorie deve dare `tot`).
 * ⛔ Uno stato che questo modulo non conosce è ATTIVO per costruzione (`STATI_DOWNLOAD[i.state]
 * ?.attivo ?? true`, il filtro qui sotto): conta in `inCorso`, non in una categoria inventata.
 */
export function riepilogoCoda(items = []) {
  const c = { tot: items.length, inCorso: 0, inPausa: 0, falliti: 0, completati: 0, annullati: 0 };
  for (const i of items) {
    if (i.state === 'ready') c.completati += 1;
    else if (i.state === 'cancelled') c.annullati += 1;
    else if (i.state === 'paused') c.inPausa += 1;
    else if (i.state === 'failed') c.falliti += 1;
    else c.inCorso += 1;
  }
  return c;
}

/** Le quattro categorie storiche di `contaStati` — la forma pubblica non cambia. */
export function contaStati(items = []) {
  const { inCorso, falliti, completati, inPausa } = riepilogoCoda(items);
  return { inCorso, falliti, completati, inPausa };
}

function el(d, tag, classe, testo) { const n = d.createElement(tag); if (classe) n.className = classe; if (testo != null) n.textContent = testo; return n; }
function icona(d, nome, classe = 'i') {
  const svg = d.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', classe); svg.setAttribute('aria-hidden', 'true');
  const use = d.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${nome}`); svg.appendChild(use);
  return svg;
}
function badge(d, testo, tono) { const b = el(d, 'span', `talos-badge talos-badge--sm${tono ? ` talos-badge--${tono}` : ''}`, testo); b.dataset.c = 'Badge'; return b; }
function bottone(d, testo, classe, azione, fn) { const b = el(d, 'button', classe, testo); b.type = 'button'; b.dataset.c = 'Button'; b.dataset.action = azione; if (fn) b.addEventListener('click', fn); return b; }

/**
 * Il comando che porta al catalogo: il bottone LEGACY della sezione `huggingface`.
 * ⛔ Ancorato a `#modelLabCard` e non al documento: nel DOM vivono DUPLICATI legacy nascosti,
 * e un `querySelector` sul documento intero legherebbe il nodo sbagliato in silenzio
 * (scomposizione della FASE 4, trappola 3).
 * ⛔ Ed è la strada VERA, non una scrittura di stato: `app.js:4627` lega il clic dei sei
 * bottoni a `setModelLabSection`, e da lì passano i caricatori. È lo stesso inoltro che fa il
 * guscio a quattro schede quando l'utente preme una linguetta.
 */
export function comandoCatalogo(radice) {
  const carta = radice?.closest?.('#modelLabCard') ?? null;
  return carta?.querySelector('[data-model-lab-tab="huggingface"]') ?? null;
}

/**
 * Lo stato vuoto del mockup (`emptyState('Nessun download in coda.', …, 'Esplora il catalogo')`):
 * icona, titolo, la frase, e il bottone che porta DAVVERO al catalogo.
 * @param {Element} radice il pannello in cui lo stato vuoto vive (serve a trovare il catalogo).
 * @param {{azioni?: object, document?: Document}} [opzioni] `azioni.esploraCatalogo` vince sul
 *   comando legacy: è la porta che l'orchestratore può chiudere in una riga quando vorrà.
 */
export function creaStatoVuotoDownload(radice, { azioni = {}, document: d = globalThis.document } = {}) {
  const riquadro = el(d, 'div', 'empty-state');
  riquadro.dataset.c = 'EmptyState';
  riquadro.dataset.codaVuota = '';
  riquadro.append(
    icona(d, 'i-download'),
    el(d, 'h3', '', 'Nessun download in coda.'),
    /* ⛔ Il mockup dice «il catalogo di esempio»: qui il catalogo degli esempi non esiste, e
       chiamare «di esempio» quello vero di Hugging Face sarebbe una bugia sul prodotto. */
    el(d, 'p', '', 'Il prossimo modello può aspettare. Oppure puoi esplorare il catalogo.'),
  );
  const bottone = el(d, 'button', 'talos-button talos-button--secondary');
  bottone.type = 'button'; bottone.dataset.c = 'Button'; bottone.dataset.action = 'esploraCatalogo';
  bottone.append(icona(d, 'i-plus'), el(d, 'span', '', 'Esplora il catalogo'));
  if (typeof azioni.esploraCatalogo === 'function') bottone.addEventListener('click', azioni.esploraCatalogo);
  else {
    const comando = comandoCatalogo(radice);
    // ⛔ Il comando si cerca al CLIC, non alla nascita: il guscio sposta le sei linguette legacy
    // dentro `[data-lab-comandi]` quando monta, e un nodo cercato troppo presto potrebbe essere
    // già staccato quando l'utente preme.
    if (comando) bottone.addEventListener('click', () => comandoCatalogo(radice)?.click());
    /* ⛔ Un bottone che non porta da nessuna parte è peggio di un bottone assente: se il
       catalogo non è raggiungibile da qui, il controllo lo DICE invece di inghiottire il clic
       (la lezione del guscio: «un bottone senza listener inghiotte il clic in silenzio»). */
    else { bottone.disabled = true; bottone.title = 'Da questa schermata non c’è un catalogo da aprire.'; }
  }
  riquadro.append(bottone);
  return riquadro;
}

/*
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * FASE 4-bis, corsia D — LO STATO DELLE DUE AZIONI SUL MODELLO INSTALLATO.
 *
 * Vive su `panel.dataset`, non in una variabile di modulo: la coda si ridisegna da sola ogni
 * 800 ms finché qualcosa scarica, e uno stato di modulo verrebbe condiviso da due pannelli
 * (nel DOM vivono duplicati legacy). Forma:
 *
 *   { aperto: { id, tipo: 'elimina'|'rinomina', bozza }, inCorso: id|null,
 *     erroreCampo: stringa|null, fuocoDato: stringa, esiti: { [id]: {tono, etichetta, testo, azione} } }
 *
 * `fuocoDato` è la chiave dell'apertura a cui il fuoco è già stato dato: senza di lui ogni
 * ridisegno (ogni 800 ms) riporterebbe il fuoco e riselezionerebbe il testo, cioè strapperebbe
 * la tastiera di mano a chi sta scrivendo il nome.
 */
const STATO_VUOTO = Object.freeze({ aperto: null, inCorso: null, erroreCampo: null, fuocoDato: '', esiti: {} });
/** L'ultima resa di ogni pannello: serve a ridisegnare DA DENTRO, dopo un clic. */
const ultimaResa = new WeakMap();

function leggiStatoAzioni(panel) {
  try {
    const grezzo = panel.dataset.statoAzioniModello;
    if (!grezzo) return { ...STATO_VUOTO, esiti: {} };
    const letto = JSON.parse(grezzo);
    return { aperto: letto.aperto ?? null, inCorso: letto.inCorso ?? null, erroreCampo: letto.erroreCampo ?? null, fuocoDato: letto.fuocoDato || '', esiti: letto.esiti && typeof letto.esiti === 'object' ? letto.esiti : {} };
  } catch { return { ...STATO_VUOTO, esiti: {} }; } // uno stato illeggibile non deve spegnere la coda: si riparte puliti
}
function scriviStatoAzioni(panel, stato) { panel.dataset.statoAzioniModello = JSON.stringify(stato); }

/** Riscrive il pannello con gli argomenti dell'ultimo disegno: chi clicca vede il risultato subito. */
function ridisegna(panel) {
  const ultima = ultimaResa.get(panel);
  if (ultima) aggiornaCodaDownload(panel, ultima.items, ultima.opzioni);
}

/** Il verdetto di un'azione, con la stessa forma che la riga sa disegnare. */
function conAzione(verdetto, azione) { return { ...verdetto, azione }; }

/**
 * Esegue l'eliminazione e scrive COM'È FINITA. `azioni.elimina` deve rispondere con un verdetto
 * (`{ok:true}` / `{ok:false, motivo}`), non con la busta della rotta: vedi
 * `verdettoAzioneModello` in `modelli-installati.js` per la misura che rende necessaria quella
 * distinzione (`delete` su un id inesistente risponde 200 senza toccare il disco).
 */
async function eseguiEliminazione(panel, id, azioni, nome) {
  const prima = leggiStatoAzioni(panel);
  if (prima.inCorso) return; // un secondo invio mentre il primo è in volo non parte
  scriviStatoAzioni(panel, { ...prima, inCorso: id });
  ridisegna(panel);
  let esito;
  try { esito = await azioni.elimina(id); } catch (errore) { esito = { ok: false, motivo: errore?.message || 'la richiesta non è arrivata al server' }; }
  const verdetto = conAzione(verdettoAzioneModello(esito, { azione: 'elimina', nome }), 'elimina');
  const dopo = leggiStatoAzioni(panel);
  scriviStatoAzioni(panel, {
    ...dopo,
    inCorso: null,
    /* ⛔ Il pannello resta aperto SOLO se non è andata: lì c'è il comando per riprovare, e la
       persona resta dove ha sbagliato. Riuscita, il pannello si chiude e l'esito va sulla riga. */
    aperto: verdetto.tono === 'success' ? null : dopo.aperto,
    esiti: { ...dopo.esiti, [id]: verdetto },
    fuocoDato: '',
  });
  ridisegna(panel);
  if (verdetto.tono === 'success') tornaAlComando(panel, id, 'eliminaModello');
}

/**
 * Esegue la rinomina. Il nome vuoto o tutto spazi NON chiama la rete: si ferma nel campo e lo
 * dice. Non è una comodità: MISURATO, il deposito risponde a quel caso un 500 «Errore interno…
 * Apri Doctor», cioè manda la persona a cercare un guasto del server per un campo che è suo.
 */
async function eseguiRinomina(panel, id, nomeGrezzo, azioni) {
  const prima = leggiStatoAzioni(panel);
  if (prima.inCorso) return;
  const nome = String(nomeGrezzo ?? '').trim();
  if (!nome) {
    scriviStatoAzioni(panel, { ...prima, erroreCampo: 'Scrivi un nome: senza nome il modello resta quello di prima.' });
    ridisegna(panel);
    return;
  }
  scriviStatoAzioni(panel, { ...prima, inCorso: id, erroreCampo: null, aperto: { ...prima.aperto, bozza: nome } });
  ridisegna(panel);
  let esito;
  try { esito = await azioni.rinomina(id, nome); } catch (errore) { esito = { ok: false, motivo: errore?.message || 'la richiesta non è arrivata al server' }; }
  const verdetto = conAzione(verdettoAzioneModello(esito, { azione: 'rinomina', nome }), 'rinomina');
  const dopo = leggiStatoAzioni(panel);
  scriviStatoAzioni(panel, {
    ...dopo,
    inCorso: null,
    aperto: verdetto.tono === 'success' ? null : dopo.aperto,
    erroreCampo: verdetto.tono === 'success' ? null : dopo.erroreCampo,
    esiti: { ...dopo.esiti, [id]: verdetto },
    fuocoDato: '',
  });
  ridisegna(panel);
  if (verdetto.tono === 'success') tornaAlComando(panel, id, 'rinominaModello');
}

/**
 * La bozza del nome, annotata a ogni tasto e SENZA ridisegnare: è quello che il prossimo giro di
 * ridisegno (l'app lo fa ogni 800 ms mentre qualcosa scarica) ritrova dentro il campo. Ridisegnare
 * qui sarebbe peggio del male: il campo si ricostruirebbe a ogni carattere e il cursore andrebbe a
 * fondo riga sotto le dita di chi scrive.
 */
function annotaBozza(panel, id, nome) {
  const stato = leggiStatoAzioni(panel);
  if (stato.aperto?.id !== id) return;
  scriviStatoAzioni(panel, { ...stato, aperto: { ...stato.aperto, bozza: nome } });
}

/**
 * Il fuoco entra nel pannello UNA VOLTA SOLA, quando si apre.
 *
 * ⛔ Perché una volta sola: la coda si ridisegna ogni 800 ms mentre qualcosa scarica. Un fuoco
 *   dato a ogni disegno riporterebbe la selezione all'inizio ogni 800 ms, cioè strapperebbe la
 *   tastiera di mano a chi sta scrivendo il nome. La chiave dell'apertura (`id:tipo`) si annota
 *   in `fuocoDato` appena il fuoco è stato dato, e da lì in poi il disegno non lo tocca più.
 * ⛔ L'eliminazione vuole il fuoco su «Annulla» — chi apre il pannello con la tastiera non deve
 *   trovarsi la punta delle dita sul comando che cancella (ricerca della fase, 19/09/2026).
 *   La rinomina invece lo vuole DENTRO il campo, col testo selezionato: si scrive sopra al nome
 *   vecchio invece di doverlo cancellare a mano (Chakra `Editable`, `selectAllOnFocus`).
 */
function applicaFuoco(panel, stato) {
  if (!stato.aperto) return;
  const chiave = `${stato.aperto.id}:${stato.aperto.tipo}`;
  if (stato.fuocoDato === chiave) return;
  const nodo = panel.querySelector(`[data-c="${stato.aperto.tipo === 'elimina' ? 'ConfermaEliminazione' : 'CampoRinomina'}"]`);
  if (!nodo) return;
  if (stato.aperto.tipo === 'elimina') nodo.querySelector('[data-action="annullaEliminaModello"]')?.focus();
  else { const campo = nodo.querySelector('[data-campo="nomeModello"]'); campo?.focus(); campo?.select?.(); }
  scriviStatoAzioni(panel, { ...stato, fuocoDato: chiave });
}

/**
 * Apre il pannello dell'eliminazione: il primo clic ARMA, non cancella niente.
 */
function apriElimina(panel, id) {
  const stato = leggiStatoAzioni(panel);
  scriviStatoAzioni(panel, { ...stato, aperto: { id, tipo: 'elimina', bozza: '' }, erroreCampo: null, fuocoDato: '' });
  ridisegna(panel);
}

/** Apre il campo della rinomina, con dentro il nome di adesso (che può essere nullo: vale il file). */
function apriRinomina(panel, id, nomeAttuale) {
  const stato = leggiStatoAzioni(panel);
  scriviStatoAzioni(panel, { ...stato, aperto: { id, tipo: 'rinomina', bozza: nomeAttuale || '' }, erroreCampo: null, fuocoDato: '' });
  ridisegna(panel);
}

/** Chiude il pannello e RIPORTA IL FUOCO al comando che l'aveva aperto. */
function chiudiPannello(panel, id) {
  const stato = leggiStatoAzioni(panel);
  if (stato.aperto?.id !== id) return;
  scriviStatoAzioni(panel, { ...stato, aperto: null, erroreCampo: null, fuocoDato: '' });
  ridisegna(panel);
  tornaAlComando(panel, id, stato.aperto.tipo === 'elimina' ? 'eliminaModello' : 'rinominaModello');
}

/**
 * Il fuoco torna da dove è partito. Se quel comando non c'è più — l'eliminazione riuscita lo
 * toglie, perché non c'è più niente da eliminare — il fuoco va sulla riga d'esito, che è la cosa
 * che c'è da leggere. Mai lasciato sul `body`: chi usa la tastiera perderebbe il posto.
 */
function tornaAlComando(panel, id, azione) {
  const riga = panel.querySelector(`[data-c="DownloadRow"][data-download-id="${CSS.escape(String(id))}"]`);
  const comando = riga?.querySelector(`[data-action="${azione}"]`) || riga?.querySelector('[data-c="EsitoModello"]');
  comando?.focus?.();
}

/**
 * La riga, esattamente come nel mockup (tre forme: in corso · fallito · completato).
 *
 * `azioniModello` (facoltativo) = i comandi dell'eliminazione e della rinomina, già legati al
 * pannello da `aggiornaCodaDownload`; quando manca, la riga è quella di sempre. `statoAzioni` è
 * lo stato del pannello per questa coda (vedi il blocco sopra).
 */
export function creaRigaDownload(dati, { azioni = {}, azioniModello = null, statoAzioni = null, document: d = globalThis.document } = {}) {
  const art = el(d, 'article', 'talos-lab__download'); art.dataset.c = 'DownloadRow'; art.dataset.downloadId = dati.id; art.dataset.state = dati.stato;
  const testa = el(d, 'div', 'talos-toolbar');
  const titoli = el(d, 'div'); titoli.append(el(d, 'h3', 'talos-lab__heading', dati.nomeFile), el(d, 'p', 'talos-muted', dati.sotto));
  const statoWrap = el(d, 'span'); statoWrap.appendChild(badge(d, dati.etichettaStato, dati.tono));
  testa.append(titoli, dati.stato === 'ready' ? badge(d, dati.etichettaStato, dati.tono) : statoWrap);
  art.appendChild(testa);
  if (dati.stato === 'ready') {
    const esito = statoAzioni?.esiti?.[dati.id] || null;
    /* ⛔ Un modello eliminato NON è più «disponibile nei modelli installati»: MISURATO il 19/09,
       la coda del server porta ancora la riga `ready` di un modello appena eliminato, quindi
       senza questa correzione la riga direbbe il falso per sempre. */
    const eliminato = esito?.azione === 'elimina' && esito.tono === 'success';
    const piede = el(d, 'div', 'talos-toolbar');
    const nota = el(d, 'span', 'talos-muted', eliminato
      ? 'Eliminato dal disco: per usarlo di nuovo va scaricato o importato.'
      : 'Disponibile nei modelli installati.');
    const vedi = bottone(d, 'Vedi modello', 'talos-button talos-button--secondary talos-button--sm', 'vediModello', () => azioni.vediModello?.(dati.id));
    /* «Vedi modello» porta agli installati, dove quel modello non c'è più: un comando che promette
       una cosa e ne apre un'altra si spegne, e DICE perché. */
    if (eliminato) { vedi.disabled = true; vedi.title = 'Questo modello non è più sul disco.'; }
    piede.append(nota, vedi);
    art.appendChild(piede);
    const apertoQui = statoAzioni?.aperto && statoAzioni.aperto.id === dati.id ? statoAzioni.aperto : null;
    /* ⛔ I DUE COMANDI NON SI DISEGNANO MENTRE IL PANNELLO È APERTO: il comando si TRASFORMA in
       conferma/annulla, non resta lì accanto (ed è anche il modo di non lasciare raggiungibile da
       tastiera il comando che ha già aperto il suo pannello — XWIKI-19145, WCAG 2.4.3). E non si
       ridisegnano su un modello già eliminato: non c'è più niente da rinominare o da togliere. */
    if (azioniModello && !eliminato && !apertoQui) {
      const cluster = el(d, 'div', 'talos-cluster');
      cluster.append(
        bottone(d, 'Rinomina', 'talos-button talos-button--secondary talos-button--sm', 'rinominaModello', () => azioniModello.apriRinomina(dati.id, dati.nome)),
        bottone(d, 'Elimina dal disco', 'talos-button talos-button--secondary talos-button--sm', 'eliminaModello', () => azioniModello.apriElimina(dati.id)),
      );
      piede.appendChild(cluster);
    }
    if (apertoQui) {
      art.appendChild(apertoQui.tipo === 'elimina'
        ? creaConfermaEliminazione(
          { id: dati.id, nome: dati.nome, dimensione: dati.totale },
          { inCorso: statoAzioni.inCorso === dati.id, verdetto: esito, document: d,
            onAnnulla: () => azioniModello.chiudi(dati.id), onEsegui: () => azioniModello.eseguiElimina(dati.id, dati.nome) })
        : creaCampoRinomina(
          { id: dati.id },
          { bozza: apertoQui.bozza ?? '', inCorso: statoAzioni.inCorso === dati.id, errore: statoAzioni.erroreCampo, verdetto: esito, document: d,
            onBozza: (nome) => azioniModello.annota(dati.id, nome),
            onAnnulla: () => azioniModello.chiudi(dati.id), onSalva: (id, nome) => azioniModello.eseguiRinomina(id, nome) }));
    } else if (esito) art.appendChild(creaRigaEsitoModello(esito, { document: d }));
    return art;
  }
  if (dati.stato === 'failed') {
    const card = el(d, 'div', 'talos-check-card talos-check-card--danger talos-lab__space');
    card.appendChild(el(d, 'span', 'talos-check-card__stripe'));
    const corpo = el(d, 'div', 'talos-check-card__body');
    corpo.append(el(d, 'b', '', dati.errore.titolo), el(d, 'p', '', dati.errore.testo));
    const az = el(d, 'div', 'talos-check-card__actions');
    const dettagli = bottone(d, 'Dettagli', 'talos-button talos-button--ghost talos-button--sm', 'dettagli', null); dettagli.title = dati.errore.dettagli; dettagli.setAttribute('aria-label', `Dettagli: ${dati.errore.dettagli}`);
    dettagli.addEventListener('click', () => { const p = corpo.querySelector('[data-dettagli]'); if (p) { p.hidden = !p.hidden; return; } const n = el(d, 'p', 'talos-muted', dati.errore.dettagli); n.dataset.dettagli = ''; corpo.insertBefore(n, az); });
    /* ⛔ «Riprendi» e non «Riprova»: il trasporto RIPRENDE questo trasferimento dal punto
       salvato (`hf-direct-transfer.mjs:91`), non ne apre uno nuovo — ed è la stessa azione
       che la riga in pausa chiama «Riprendi» e che il mockup interattivo chiama «Riprendi»
       anche sull'errore. Un'etichetta che dice un lavoro nuovo quando il lavoro è lo stesso
       è la forma di bugia che questa fase cura. */
    az.append(bottone(d, 'Riprendi', 'talos-button talos-button--secondary talos-button--sm', 'riprendiDownload', () => azioni.riprendi?.(dati.id)), dettagli);
    /* ⛔ «Annulla» NON si disegna qui: `hf-direct-transfer.mjs:95` rifiuta `cancel` su un
       trasferimento `failed` — il comando aprirebbe la conferma e poi non farebbe niente. Il
       riferimento del mockup, su questa scheda, ha le stesse due azioni. */
    corpo.appendChild(az); card.appendChild(corpo); art.appendChild(card);
    return art;
  }
  if (dati.misurabile) {
    const barra = el(d, 'progress', 'talos-lab__meter', `${dati.percento}%`); barra.max = 100; barra.value = dati.percento; barra.setAttribute('aria-label', `Download ${dati.nomeFile} · ${dati.percento} per cento`);
    art.appendChild(barra);
  } else {
    /* ⛔ Niente `value`: è l'unico modo di dire «indeterminato» (MDN, `<progress>`). Scrivere
       `value="0"` direbbe invece «fermo a zero», che il server non ha detto. */
    const barra = el(d, 'progress', 'talos-lab__meter', 'Avanzamento non misurabile'); barra.max = 100;
    barra.setAttribute('aria-label', `Download ${dati.nomeFile} · avanzamento non misurabile: il totale non è dichiarato`);
    art.appendChild(barra);
  }
  const piede = el(d, 'div', 'talos-toolbar');
  const misure = el(d, 'span', 'talos-muted');
  if (dati.misurabile) {
    misure.append(el(d, 'strong', '', `${dati.percento}%`), d.createTextNode(` · ${dati.ricevuti.replace(' GB', '')} di ${dati.totale}`));
  } else {
    /* Si dice quel che si SA — i byte ricevuti — e che il resto non è noto. */
    misure.append(d.createTextNode(`${dati.ricevuti} ricevuti · totale non dichiarato dal server`));
  }
  if (dati.velocita) misure.append(d.createTextNode(` · ${dati.velocita}`));
  if (dati.resto) { misure.append(d.createTextNode(' · ')); const m = el(d, 'span', 'talos-measure talos-measure--estimate', dati.resto); m.dataset.c = 'Measure'; misure.append(m, d.createTextNode(' rimasti')); }
  else if (dati.stato === 'verifying') misure.append(d.createTextNode(' · verifica dell\'impronta in corso'));
  else if (dati.stato === 'paused') misure.append(d.createTextNode(' · in pausa'));
  const cluster = el(d, 'div', 'talos-cluster');
  if (['queued', 'running'].includes(dati.stato)) cluster.appendChild(bottone(d, 'Pausa', 'talos-button talos-button--secondary talos-button--sm', 'pausa', () => azioni.pausa?.(dati.id)));
  if (dati.stato === 'paused') cluster.appendChild(bottone(d, 'Riprendi', 'talos-button talos-button--secondary talos-button--sm', 'riprendi', () => azioni.riprendi?.(dati.id)));
  /* ⛔ IL COMANDO DI STOP SI DISEGNA SOLO DOVE IL TRASPORTO LO ACCETTA, e si vede SEMPRE (non al
     passaggio del mouse): `hf-direct-transfer.mjs:95` rifiuta `cancel` su `ready | failed |
     cancelled`. Trovato GUARDANDO la foto della coda lunga: la riga «Annullato» offriva «Annulla»,
     che avrebbe aperto la conferma e poi non avrebbe fatto niente. */
  if (!['ready', 'failed', 'cancelled'].includes(dati.stato)) {
    const annulla = bottone(d, 'Annulla', 'talos-button talos-button--ghost talos-button--sm', 'annulla', () => azioni.annulla?.(dati.id)); annulla.dataset.apreVelo = 'veloAnnullaDownload';
    cluster.appendChild(annulla);
  }
  piede.append(misure, cluster); art.appendChild(piede);
  return art;
}

/** La regione viva del filtro: esiste VUOTA dal primo disegno, e non si nasconde mai. */
function notaDelFiltro(conteggi, d) {
  let nota = conteggi.querySelector('[data-coda-nota]');
  if (nota) return nota;
  nota = el(d, 'span', 'talos-count__nota talos-muted');
  nota.dataset.codaNota = '';
  nota.setAttribute('role', 'status');
  nota.setAttribute('aria-atomic', 'true');
  const grow = conteggi.querySelector('.talos-grow');
  if (grow) grow.before(nota); else conteggi.append(nota);
  return nota;
}

/**
 * Lo stato vuoto del pannello: c'è quando la coda è vuota, NON c'è quando ha righe.
 * ⛔ Non resta montato e nascosto: un riquadro da 330 px con dentro un bottone vivo, lasciato nel
 * DOM mentre la coda ha le sue righe, è peso morto che si porta dietro anche un bottone premibile
 * da tastiera. La voce che NON deve mai sparire è la RIGA (ricerca della fase); il riquadro del
 * vuoto no.
 */
function statoVuotoDelPannello(panel, d, azioni = {}, serve = true) {
  const presente = panel.querySelector('[data-coda-vuota]');
  if (!serve) { presente?.remove(); return null; }
  if (presente) return presente;
  const vuoto = creaStatoVuotoDownload(panel, { azioni, document: d });
  const coda = panel.querySelector('[data-c="DownloadQueue"]');
  if (coda) coda.after(vuoto); else panel.append(vuoto);
  return vuoto;
}

/** Riscrive conteggi, filtro «solo attivi» e la coda. `stime` = Map id → { bytesAlSecondo, secondiRimanenti }. */
export function aggiornaCodaDownload(panel, items = [], opzioni = {}) {
  if (!panel) return;
  const { soloAttivi = false, stime = new Map(), azioni = {}, errore = null, document: d = globalThis.document } = opzioni;
  /* L'ultima resa resta scritta: chi clicca un comando della riga deve vedere il risultato subito,
     senza aspettare il prossimo giro di `caricaDownloadModelLab` (che arriva ogni 800 ms solo
     mentre qualcosa scarica, e MAI quando la coda è ferma). */
  ultimaResa.set(panel, { items, opzioni });
  const statoAzioni = leggiStatoAzioni(panel);
  const azioniModello = (typeof azioni.elimina === 'function' || typeof azioni.rinomina === 'function') ? {
    apriElimina: (id) => apriElimina(panel, id),
    apriRinomina: (id, nome) => apriRinomina(panel, id, nome),
    chiudi: (id) => chiudiPannello(panel, id),
    annota: (id, nome) => annotaBozza(panel, id, nome),
    eseguiElimina: (id, nome) => { if (typeof azioni.elimina === 'function') void eseguiEliminazione(panel, id, azioni, nome); },
    eseguiRinomina: (id, nome) => { if (typeof azioni.rinomina === 'function') void eseguiRinomina(panel, id, nome, azioni); },
  } : null;
  /* ⛔ Gli esiti delle righe che non ci sono più si buttano: un esito appeso a un id che la coda
     non porta più non ha niente a cui riferirsi, e se quell'id tornasse (una rilettura, un
     riavvio) resusciterebbe un messaggio vecchio su una riga nuova. E un pannello aperto quando i
     comandi che l'hanno aperto non ci sono più si chiude, invece di restare lì a promettere
     un'azione che nessuno sa fare. */
  const presenti = new Set(items.map((i) => i.id));
  const esitiVivi = Object.fromEntries(Object.entries(statoAzioni.esiti).filter(([id]) => presenti.has(id)));
  const apertoVivo = azioniModello && statoAzioni.aperto && presenti.has(statoAzioni.aperto.id) ? statoAzioni.aperto : null;
  const statoReso = { ...statoAzioni, esiti: esitiVivi, aperto: apertoVivo };
  if (JSON.stringify(statoReso) !== JSON.stringify(statoAzioni)) scriviStatoAzioni(panel, statoReso);
  const conteggi = panel.querySelector('.talos-count');
  const coda = panel.querySelector('[data-c="DownloadQueue"]');
  const c = riepilogoCoda(items);
  const senzaRighe = items.length === 0;
  const visibili = items.filter((i) => !soloAttivi || (STATI_DOWNLOAD[i.state]?.attivo ?? true));
  if (conteggi) {
    for (const b of conteggi.querySelectorAll('[data-c="Badge"]')) b.remove();
    const primo = conteggi.firstChild;
    const badges = [];
    if (c.inCorso) badges.push(badge(d, `${c.inCorso} in corso`, 'accent'));
    if (c.inPausa) badges.push(badge(d, `${c.inPausa} in pausa`, 'warning'));
    if (c.falliti) badges.push(badge(d, `${c.falliti} ${c.falliti === 1 ? 'fallito' : 'falliti'}`, 'danger'));
    if (c.completati) badges.push(badge(d, `${c.completati} ${c.completati === 1 ? 'completato' : 'completati'}`, 'success'));
    /* La categoria che mancava: senza di lei i download ANNULLATI erano righe che nessun
       contatore nominava (e la somma dei badge non tornava col numero delle righe). */
    if (c.annullati) badges.push(badge(d, `${c.annullati} ${c.annullati === 1 ? 'annullato' : 'annullati'}`, ''));
    for (const b of badges) conteggi.insertBefore(b, primo);
    const nascosti = items.length - visibili.length;
    const nota = notaDelFiltro(conteggi, d);
    const frase = nascosti > 0 ? `Mostrati ${visibili.length} di ${items.length}` : '';
    if (nota.textContent !== frase) nota.textContent = frase;
    /* ⛔ Con la coda VUOTA la riga dei conteggi non si disegna: il disegno del mockup, in quello
       stato, è il motto e lo stato vuoto. I nodi restano montati — è `hidden`, non rimozione, e
       il listener di `app.js:4764` vive sul bottone, che così non si perde. */
    if (conteggi.hidden !== senzaRighe) conteggi.hidden = senzaRighe;
    const filtro = conteggi.querySelector('[data-action="soloAttivi"]');
    if (filtro) { filtro.textContent = soloAttivi ? 'Mostra tutti' : 'Mostra solo attivi'; filtro.setAttribute('aria-pressed', String(soloAttivi)); }
  }
  if (!coda) return;
  if (errore) {
    if (coda.hidden) coda.hidden = false;
    coda.replaceChildren(el(d, 'p', 'talos-card--pad talos-muted', `Coda non disponibile: ${errore.message || errore}`));
    statoVuotoDelPannello(panel, d, azioni, false); // una coda che non si legge non è una coda vuota
    return;
  }
  // ⛔ Il verso conta: con la coda SENZA righe si vede lo stato vuoto e non si vede la coda.
  statoVuotoDelPannello(panel, d, azioni, senzaRighe);
  if (coda.hidden !== senzaRighe) coda.hidden = senzaRighe;
  if (senzaRighe) { if (coda.childElementCount) coda.replaceChildren(); return; }
  if (!visibili.length) {
    coda.replaceChildren(el(d, 'p', 'talos-card--pad talos-muted', 'Nessun download attivo. I download finiti restano nella coda: «Mostra tutti» li riporta.'));
    return;
  }
  coda.replaceChildren(...visibili.flatMap((i) => [d.createTextNode('\n'), creaRigaDownload(datiDownload(i, { stima: stime.get?.(i.id) || null }), {
    azioni, azioniModello, statoAzioni: azioniModello ? statoReso : null, document: d,
  })]), d.createTextNode('\n'));
  /* Il fuoco entra nel pannello appena disegnato, una volta sola (vedi `applicaFuoco`). */
  if (azioniModello) applicaFuoco(panel, leggiStatoAzioni(panel));
}

/**
 * Sposta il pannello del mockup in `#modelLabDownloadsPanel`; la lista del monolite diventa la coda.
 *
 * ⛔ 18/09/2026 — IL TRAVASO REGGE ENTRAMBE LE DIREZIONI (corsia 3, il travaso neutro). Chi arriva in
 * `originale` può essere il markup CANONICO (oggi: il mockup scende in Impostazioni, e la coda si
 * riconosce da `data-c="DownloadQueue"`) oppure quello LEGACY (destinazione invertita: il
 * laboratorio sale sulla schermata, e la coda è già `#modelLabDownloadsList`). ⇒ Si cerca l'una O
 * l'altra forma: senza il secondo ramo, nella direzione invertita la coda non verrebbe né svuotata
 * né marcata, e le righe vecchie resterebbero a schermo sotto quelle nuove.
 * ⛔ Il timbro va su ENTRAMBE le radici (vedi `montaInstallati` e `montaHf`: è il timbro sul
 * pannello SVUOTATO che protegge `ensureModelLabControls` in app.js).
 * Fonte consultata il 18/09/2026: prassi del timbro `data-*` controllato prima di scrivere (un
 * `data-*` esprime proprietà del nodo, una classe esprime stile).
 */
export function montaCodaDownload(originale, canonico) {
  if (!originale || !canonico || originale.dataset.downloadMontato) return;
  originale.replaceChildren(...canonico.children);
  originale.dataset.downloadMontato = 'true';
  canonico.dataset.downloadMontato = 'true';
  const coda = originale.querySelector('[data-c="DownloadQueue"]') || originale.querySelector('#modelLabDownloadsList'); if (coda) { coda.id = 'modelLabDownloadsList'; coda.replaceChildren(); }
}

/** Velocità e rimanente fra due letture: null se non c'è ancora una seconda lettura. */
export function stimaFraLetture(prima, dopo) {
  if (!prima || !dopo || dopo.state !== 'running') return null;
  const dt = (new Date(dopo.quando).getTime() - new Date(prima.quando).getTime()) / 1000;
  const db = Number(dopo.bytes) - Number(prima.bytes);
  if (!(dt > 0) || !(db > 0)) return null;
  const bytesAlSecondo = db / dt;
  const restanti = Math.max(0, Number(dopo.totalBytes) - Number(dopo.bytes));
  return { bytesAlSecondo, secondiRimanenti: restanti / bytesAlSecondo };
}
