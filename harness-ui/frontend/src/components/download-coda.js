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
 */
import { gb } from './modelli-installati.js';

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
    id: item.id, nomeFile, stato: item.state, etichettaStato: stato.etichetta, tono: stato.tono, attivo: stato.attivo,
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

/** La riga, esattamente come nel mockup (tre forme: in corso · fallito · completato). */
export function creaRigaDownload(dati, { azioni = {}, document: d = globalThis.document } = {}) {
  const art = el(d, 'article', 'talos-lab__download'); art.dataset.c = 'DownloadRow'; art.dataset.downloadId = dati.id; art.dataset.state = dati.stato;
  const testa = el(d, 'div', 'talos-toolbar');
  const titoli = el(d, 'div'); titoli.append(el(d, 'h3', 'talos-lab__heading', dati.nomeFile), el(d, 'p', 'talos-muted', dati.sotto));
  const statoWrap = el(d, 'span'); statoWrap.appendChild(badge(d, dati.etichettaStato, dati.tono));
  testa.append(titoli, dati.stato === 'ready' ? badge(d, dati.etichettaStato, dati.tono) : statoWrap);
  art.appendChild(testa);
  if (dati.stato === 'ready') {
    const piede = el(d, 'div', 'talos-toolbar');
    piede.append(el(d, 'span', 'talos-muted', 'Disponibile nei modelli installati.'), bottone(d, 'Vedi modello', 'talos-button talos-button--secondary talos-button--sm', 'vediModello', () => azioni.vediModello?.(dati.id)));
    art.appendChild(piede);
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
export function aggiornaCodaDownload(panel, items = [], { soloAttivi = false, stime = new Map(), azioni = {}, errore = null, document: d = globalThis.document } = {}) {
  if (!panel) return;
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
  coda.replaceChildren(...visibili.flatMap((i) => [d.createTextNode('\n'), creaRigaDownload(datiDownload(i, { stima: stime.get?.(i.id) || null }), { azioni, document: d })]), d.createTextNode('\n'));
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
