/*
 * ChatFooter — il piede della chat, come nel mockup: la striscia di stato del
 * giro in corso, la coda, il composer con i suoi chip, la barra di stato.
 *
 * Sesto componente della Fase 2. Il markup resta quello del template (il
 * monolite lo trova per id e data-*: #composerForm, #composerInput,
 * #composerResizeHandle, #capabilityBtn, #redirectRunButton, [data-open-sheet],
 * [data-runtime-*], .stop-run): questo modulo lo AGGIORNA dai dati.
 *
 * ⛔ Regola dell'owner (05/09): niente sotto l'originale. Il composer originale
 * ha: maniglia di ridimensionamento con misura ricordata
 * (`talos-harness-composer-size-v1`), microfono, «aggiungi contesto», chip del
 * modello, chip del permesso, chip dell'ambiente (qui vive nella colonna dei
 * dettagli), «Reindirizza» mentre un giro corre, invio/stop, barra con token ·
 * giri · cache · velocità. Tutto è nel mockup esteso; qui i testi sono DATI:
 * il giro corrente, l'uso, il permesso con il suo nome umano, il tema.
 *
 * Ricerca 05/09/2026: la maniglia di ridimensionamento con misura ricordata in
 * localStorage e tastiera (frecce) è il pattern del componente «resize handle»
 * fra fratelli flex (glama.ai backlog-mcp viewer/components/resize-handle.ts);
 * il `<textarea>` nativo conserva `resize` (MDN textarea) ma qui la maniglia è
 * unica e a doppio verso, come nell'originale (`setupComposerResize`).
 */

/*
 * Il nome umano dei permessi (H22: mai il nome tecnico a schermo).
 * ⛔ 07/9 — era la QUARTA mappa della stessa cosa, e diceva «Sola lettura»/«Su richiesta»/
 * «Scrittura nel workspace»/«Accesso completo» dove il foglio Permessi, la modale «Nuova sessione»
 * e l'intro dicevano tre serie ancora diverse: quattro nomi per quattro politiche, cioe' sedici
 * modi di chiamare quattro cose. Ora è una VISTA dell'unica mappa (`politiche.js`).
 */
import { POLITICHE } from './politiche.js';
export const NOME_PERMESSO = Object.freeze(Object.fromEntries(POLITICHE.map((p) => [p.valore, p.nome])));

export function etichettaPermesso(permesso) {
  return NOME_PERMESSO[permesso] || (typeof permesso === 'string' && permesso.trim() ? permesso : 'Permesso non scelto');
}

/*
 * ⛔ 06/9, misurato dal vivo (prova T04, sessione 84866d85): una sessione creata scegliendo
 * «Accesso completo» è partita con `scrivi:'chiedi'` e `shell:'chiedi'` addosso — due cancelli
 * chiusi in una prova PRECEDENTE, che il server ricorda e riapplica a ogni sessione nuova. La
 * pillola diceva solo «Accesso completo»: chi guardava non aveva nessun modo di saperlo, e ha
 * visto arrivare richieste di approvazione che il permesso scelto non prometteva.
 * Decisione B11 («pillola del permesso col colore del rischio»): la pillola dice lo stato VERO,
 * eccezioni comprese. Funzione pura, così la si prova senza DOM.
 */
export function etichettaPermessoConEccezioni(permesso, permessiPerAttrezzo) {
  const base = etichettaPermesso(permesso);
  const regole = permessiPerAttrezzo && typeof permessiPerAttrezzo === 'object' ? Object.values(permessiPerAttrezzo).filter(Boolean) : [];
  if (regole.length === 0) return base;
  return `${base} · ${regole.length} eccezion${regole.length === 1 ? 'e' : 'i'}`;
}

/*
 * ⛔ 06/9, owner con lo screenshot: a schermo compariva
 * `local:bartowski-nvidia_Nemotron-Cascade-2-30B-A3B-GGUF-931b595fc71b-nvidia-Nemotron-Cascade-2-30B-A3B-Q4-0-gguf`,
 * su due righe, sia nell'intestazione del messaggio sia nella pillola del composer. La decisione H22
 * vieta gli identificatori grezzi a schermo, ma per i modelli locali non esisteva nessuna traduzione:
 * si stampava la chiave del runtime.
 * Il nome di un GGUF non è un nome: è una targa. La convenzione di llama.cpp (letta 06/09/2026 —
 * blog.starmorph.com «LLM model names decoded», kuware.com «Demystifying GGUF file names») mette in
 * fila autore, famiglia, parametri totali, parametri ATTIVI per i MoE (`A3B` = 3B attivi) e la
 * quantizzazione (`Q4_0`, `Q4_K_M`: 4 bit, K = super-blocchi, M = variante media). Qui se ne ricava
 * una riga leggibile; l'identificatore intero resta nel suggerimento del puntatore, mai perso.
 */
export function nomeModelloUmano(id) {
  if (typeof id !== 'string' || !id.trim()) return '';
  const grezzo = id.trim();
  if (!/^local:/i.test(grezzo)) return grezzo.replace(/^~/u, '').split('/').pop();
  let resto = grezzo.replace(/^local:/i, '').replace(/[-_.]gguf$/i, '');
  const quant = /[-_](IQ\d\w*|Q\d(?:[-_]\d)?(?:[-_][A-Z]+)*)(?=[-_]|$)/i.exec(resto);
  const parametri = /(?:^|[-_])(\d+(?:[.,]\d+)?B)(?:[-_]A(\d+(?:[.,]\d+)?B))?(?=[-_]|$)/i.exec(resto);
  let nome = resto;
  if (parametri) nome = resto.slice(0, parametri.index);
  nome = nome.replace(/[-_](GGUF|MLX|AWQ|GPTQ)$/i, '');
  const pezzi = nome.split(/[-_]/).filter(Boolean);
  if (pezzi.length > 1) pezzi.shift(); // il primo segmento è chi ha pubblicato il file, non il modello
  // un secondo prefisso di fabbrica (nvidia_Nemotron…) sparisce solo se si ripete dentro al nome
  const pulito = pezzi.join(' ').replace(/\s+/g, ' ').trim();
  const parti = [pulito || resto];
  if (parametri) parti.push(parametri[2] ? `${parametri[1]} (${parametri[2].replace(/^A/i, '')} attivi)` : parametri[1]);
  if (quant) parti.push(quant[1].toUpperCase().replace(/-/g, '_'));
  return parti.filter(Boolean).join(' · ');
}

/*
 * ⛔ 06/9, owner: «il ragionamento in corso non scompare quando il fondo della chat è inquadrato, e
 * scompare quando sali su» — cioè al contrario. Due cure dello stesso giorno si pestavano i piedi:
 * sotto l'ultimo messaggio c'è mezzo schermo di spazio (la cura «la chat si ferma a metà pagina»),
 * quindi il fondo dello SCROLL sta mezzo schermo sotto il fondo del TESTO. Chiedere «quanto manca al
 * fondo dello scroll» rispondeva ~340px anche mentre stavi guardando la fine.
 * ⇒ «Sono in fondo» vuol dire che si vede la fine del CONTENUTO: lo spazio in coda si sottrae,
 * perché è vuoto per costruzione. Funzione pura, così la si prova senza un browser.
 */
/*
 * ⛔⛔ 06/9, MISURATO durante un giro vero (O-34, terzo tentativo): salito di **320 px** con una coda
 * di **314**, la striscia restava NASCOSTA — `320 <= 314 + 24` è vero. L'ultimo messaggio era già
 * uscito dallo schermo dal basso e la chat continuava a credersi «in fondo»: una **zona morta di 24
 * px** creata dal sommare la tolleranza alla coda.
 * ⇒ La soglia serve SOLO al rumore sub-pixel, non a perdonare uno scorrimento vero.
 * Ricerca 06/09/2026 (MDN `Element.scrollHeight`; sqlpey «Detecting Scroll to Bottom»): `scrollHeight`
 * INCLUDE il padding — quindi sottrarre la coda è giusto — ma `scrollTop` è frazionario mentre gli
 * altri due sono arrotondati, e la tolleranza raccomandata è **1-5 px**, non 24.
 * ⛔ Da non confondere con `CONVERSAZIONE_FONDO_SOGLIA_PX` (app.js), che è un'altra domanda: «devo
 *   animare o saltare?». Quella resta 24: sbagliarla costa un'animazione di troppo, non una bugia.
 */
export function fondoInVista({ scrollHeight = 0, scrollTop = 0, clientHeight = 0, coda = 0, soglia = 4 } = {}) {
  /*
   * ⛔ 06/9, owner: «nella chat appena iniziata non ha senso farla vedere finché non appare uno
   *    scroll». Aveva ragione a chiedere se era previsto: NON lo era. Misurato, oggi il caso non si
   *    verifica (63 campioni senza nulla da scorrere, striscia visibile 0 volte) — ma succede per
   *    CONSEGUENZA del conto sulla coda, non perché qualcuno l'abbia deciso. Un comportamento
   *    giusto per caso si rompe alla prima modifica del padding o di un arrotondamento.
   * ⇒ Se non c'è niente da scorrere sei in fondo per DEFINIZIONE, e non c'è aritmetica di mezzo.
   */
  if (Number(scrollHeight) <= Number(clientHeight)) return true;
  const distanza = Number(scrollHeight) - Number(scrollTop) - Number(clientHeight);
  if (!Number.isFinite(distanza)) return true;
  return distanza <= Math.max(0, Number(coda) || 0) + soglia;
}

/*
 * ⛔ 06/9, visto nello screenshot della striscia mentre girava: diceva
 *   «Legge la parte finale di config.mjs… · Legge la parte finale di co…»
 * cioè la stessa frase due volte, la seconda troncata. Il dettaglio della riga attrezzo ripeteva il
 * suo nome, e la striscia li incollava senza guardarli. Un dettaglio che ripete il titolo non
 * aggiunge niente: ruba spazio e fa sembrare rotta una cosa che funziona.
 * ⇒ Il dettaglio si mostra solo se dice qualcosa di NUOVO. I puntini di sospensione non contano:
 *   «Legge la parte finale di co…» è la stessa frase di «Legge la parte finale di config.mjs».
 */
export function dettaglioUtile(cosa, dettaglio) {
  const pulisci = (t) => String(t ?? '').replace(/[…\.]+$/u, '').trim().toLowerCase();
  const a = pulisci(cosa);
  const b = pulisci(dettaglio);
  if (!b || !a) return String(dettaglio ?? '').trim();
  if (a === b || a.startsWith(b) || b.startsWith(a)) return '';
  return String(dettaglio).trim();
}

/** Il tono del chip del permesso: attenzione quando scrive o ha tutto. */
export function tonoPermesso(permesso) {
  if (permesso === 'Full access') return 'danger';
  if (permesso === 'Workspace write') return 'warning';
  return null;
}

/** Migliaia con la virgola italiana e una cifra decimale, come nel mockup («41,2k»). */
export function kilo(n) {
  const v = Number(n) || 0;
  if (v < 1000) return String(Math.round(v));
  return `${(v / 1000).toFixed(1).replace('.', ',')}k`;
}

/**
 * I testi dell'uso dai campi veri di `usage` (StateDelta /usage):
 * prompt_tokens, completion_tokens, cached_tokens, giri, tokens_per_second.
 * Ciò che manca non si scrive.
 */
/*
 * ⛔ 06/9, owner con lo screenshot e la freccia sulla barra in fondo: «al posto di Tema Calm metti
 * l'output medio di token al secondo se uso un modello locale; se NON sto usando un modello locale
 * togli completamente la scritta». Giusto due volte: il tema lo vedi, non serve che te lo dica una
 * barra; e su un modello locale la velocità è l'unica cosa che cambia davvero da giro a giro,
 * perché lì la stai pagando in tempo e non in denaro.
 * ⛔ Se il numero non c'è (giro appena partito, runtime che non lo dichiara) non si scrive niente:
 * mai uno zero al posto di un dato che non abbiamo.
 */
export function testoVelocitaLocale(modelloId, velocita) {
  const id = String(modelloId || '');
  if (!/^local:/i.test(id)) return '';
  return String(velocita || '').trim();
}

/*
 * ⛔⛔⛔ 06/9, CB-04 — DUE numeri, non uno. `usage` è il consumo dell'INVIO IN
 * CORSO (il kernel azzera il suo contatore a ogni invio: `talosHarness.mjs:4560`)
 * e serve al solo confronto col tetto dei giri, «9 su 24». `usageSessione` è il
 * totale della CONVERSAZIONE, ed è ciò che la barra promette quando scrive
 * «22,3k token · cache 66%». Misurato su tre invii veri: 23.060 token spesi,
 * 7.716 dichiarati. Ricerca 06/09/2026: OpenAI «Counting tokens» (usage è per
 * richiesta, la somma la fa chi chiama) e OpenRouter «Prompt Caching» (il tasso
 * di sessione è somma dei cached su somma dei prompt, pesato sui token).
 */
export function testiUsage(usage, { tettoGiri = null, usageSessione = null } = {}) {
  const sessione = usageSessione && typeof usageSessione === 'object' ? usageSessione : usage;
  if ((!usage || typeof usage !== 'object') && (!sessione || typeof sessione !== 'object')) return { tokenGiri: '', cache: '', giri: null, velocita: '' };
  const prompt = Number(sessione?.prompt_tokens ?? 0) || 0;
  const completion = Number(sessione?.completion_tokens ?? 0) || 0;
  const cache = Number(sessione?.cached_tokens ?? 0) || 0;
  // ⛔ i giri della barra sono quelli della SESSIONE; quello del chip col tetto è dell'invio in corso
  const giriSessione = Number.isFinite(Number(sessione?.giri)) ? Number(sessione.giri) : null;
  const giri = Number.isFinite(Number(usage?.giri)) ? Number(usage.giri) : null;
  const totale = prompt + completion;
  const parti = [];
  if (totale > 0) parti.push(`${kilo(totale)} token`);
  if (giriSessione !== null) parti.push(`${giriSessione} gir${giriSessione === 1 ? 'o' : 'i'}${Number.isFinite(tettoGiri) && tettoGiri > 0 && sessione === usage ? ` su ${tettoGiri}` : ''}`);
  const throughput = Number(usage?.tokens_per_second ?? usage?.tokensPerSecond ?? sessione?.tokens_per_second ?? sessione?.tokensPerSecond);
  return {
    tokenGiri: parti.join(' · '),
    cache: cache > 0 && prompt > 0 ? `cache ${Math.round((cache / prompt) * 100)}%` : '',
    giri,
    velocita: Number.isFinite(throughput) && throughput > 0 ? `${Math.round(throughput)} token/s` : '',
  };
}

/** «1,4 s» o «850 ms» dal tempo al primo token. */
export function testoLatenza(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  return ms >= 1000 ? `primo token ${(ms / 1000).toFixed(1).replace('.', ',')} s` : `primo token ${Math.round(ms)} ms`;
}

function scrivi(el, testo) {
  if (!el) return;
  const t = testo || '';
  if (el.textContent !== t) el.textContent = t;
  el.hidden = t === '';
}

/**
 * Aggiorna il piede dai dati.
 * @param {Element} piede il `.talos-chat-foot`
 * @param {object} dati
 * @param {boolean} [dati.attivo] un giro corre
 * @param {string} [dati.cosa] cosa sta facendo TALOS («Comando nel terminale»)
 * @param {string} [dati.dettaglio] il dettaglio mono (il comando, il file)
 * @param {number|null} [dati.giro] il giro corrente
 * @param {number|null} [dati.secondi] secondi dall'inizio del giro
 * @param {'collegato'|'perso'} [dati.contatto] stato del contatto col server (CB-20-bis)
 * @param {object|null} [dati.usage] il consumo dell'INVIO in corso (tetto dei giri)
 * @param {object|null} [dati.usageSessione] il consumo di TUTTA la conversazione (token, giri, cache della barra)
 * @param {number|null} [dati.tettoGiri]
 * @param {number|null} [dati.latenzaMs] tempo al primo token
 * @param {string|null} [dati.costo] «$0,08» già formattato, o null (non si stima da soli)
 * @param {string} [dati.modello]
 * @param {string} [dati.permesso] il valore interno (Read only…)
 * @param {string} [dati.tema] «Tema Calm · locale»
 */
/**
 * Quando si mostra la pillola dei giri, e con che tono (decisione B12, 06/09).
 * @returns {'quieto'|'vicino'|null} null = non si mostra
 */
export function statoGiri(giri, tettoGiri) {
  if (!Number.isFinite(Number(giri))) return null;
  const n = Number(giri);
  const tetto = Number(tettoGiri);
  if (!Number.isFinite(tetto) || tetto <= 0) return n > 0 ? 'quieto' : null; // senza tetto dichiarato non c'è una percentuale: si mostra e basta
  const quota = n / tetto;
  if (quota < 0.5) return null;
  return quota >= 0.8 ? 'vicino' : 'quieto';
}

export function aggiornaPiedeChat(piede, dati = {}) {
  if (!piede) return;
  const documentObj = piede.ownerDocument;
  // striscia di stato
  const striscia = piede.querySelector('.talos-status-strip');
  if (striscia) {
    /*
     * ⛔ 06/9, owner: «la barra sopra il composer e' ridondante: deve apparire quando si scrolla in alto e
     * non si vede il fondo, come recap; quando si scrolla in basso non ha motivo di esserci». Giusto: in
     * fondo alla conversazione la stessa cosa e' gia' scritta due volte (la bolla che scrive e la striscia).
     * `inFondo` arriva da chi disegna: quando il fondo e' in vista la striscia tace.
     * Ricerca 06/09/2026: shadcn/ui «Message scroller» e TanStack Virtual «Chat» — un solo indicatore per
     * stato, legato a `isAtEnd()`, invece di un doppione sempre acceso.
     */
    /*
     * ⛔⛔⛔ 06/9, CB-20-bis — «il server cade e la chat dice il contrario per un minuto».
     * Misurato: la barra in fondo diceva «Il server non risponde · Riprova» mentre questa
     * striscia continuava a dire «TALOS sta lavorando · giro 3» col pulsante «Ferma», per
     * 45 s di fila su 30 campioni. Due parti della stessa schermata, due verità opposte.
     * ⇒ Quando il contatto è perso la striscia NON tace: è l'unico posto della chat che può
     *   dire che non sappiamo più cosa stia succedendo, e tacere lì significa lasciare in
     *   piedi l'ultima cosa detta, che era «sta lavorando».
     * Ricerca 06/09/2026 — timetobuildbob.com, «The Stale Event Problem: Fixing SSE
     * Reconnects in Streaming AI UIs»: a stream caduto la UI non deve continuare a mostrare
     * «running»; serve un indicatore PERSISTENTE («Reconnecting…», poi «Disconnected»), non
     * un toast che sparisce, e mai uno stato ambiguo «still running».
     */
    const contattoPerso = dati.attivo === true && dati.contatto === 'perso';
    striscia.hidden = !dati.attivo || (dati.inFondo === true && !contattoPerso);
    striscia.classList.toggle('talos-status-strip--senza-contatto', contattoPerso);
    /*
     * 06/9, owner: «se ci clicchi ti deve portare in fondo giù». La striscia compare proprio quando
     * stai leggendo più su: è il posto naturale dove chiedere «riportami dove sta scrivendo».
     * Il pulsante «Ferma» dentro la striscia resta suo: si esclude, non si copre.
     */
    if (!striscia.dataset.portaInFondo) {
      striscia.dataset.portaInFondo = '1';
      striscia.style.cursor = 'pointer';
      striscia.setAttribute('title', 'Torna dove sta scrivendo');
      striscia.addEventListener('click', (evento) => {
        if (evento.target.closest('button')) return;
        striscia.dispatchEvent(new CustomEvent('talos-vai-in-fondo', { bubbles: true }));
      });
    }
    const cosa = striscia.querySelector('[data-run-what]');
    if (cosa) {
      cosa.replaceChildren();
      cosa.append(documentObj.createTextNode(contattoPerso ? 'Contatto col server perso' : (dati.cosa || 'TALOS sta lavorando')));
      if (dati.dettaglio && !contattoPerso) {
        cosa.append(documentObj.createTextNode(' · '));
        const mono = documentObj.createElement('span');
        mono.className = 'talos-mono talos-measure';
        mono.textContent = dati.dettaglio;
        cosa.append(mono);
      }
    }
    const meta = striscia.querySelector('[data-run-meta]');
    const pezzi = [];
    if (Number.isFinite(dati.giro)) pezzi.push(`giro ${dati.giro}`);
    if (Number.isFinite(dati.secondi)) pezzi.push(`${Math.max(0, Math.round(dati.secondi))} s`);
    /*
     * ⛔ Senza contatto NON si dice «il giro è fallito» (sul server può benissimo star
     *    continuando, e al ritorno lo stream lo racconta): si dice che non lo sappiamo.
     *    E i secondi si smettono di contare: un contatore che avanza senza notizie è una
     *    misura inventata, uno fermo sembra un blocco. Si toglie.
     */
    scrivi(meta, contattoPerso ? 'non so se il giro sta ancora andando' : pezzi.join(' · '));
    const ferma = striscia.querySelector('.stop-run');
    if (ferma) {
      // ⛔ «Ferma» manda una POST al server: col server irraggiungibile non arriverebbe.
      //    Un pulsante che non può fare la sua cosa lo DICE, invece di fingere.
      ferma.disabled = contattoPerso;
      ferma.title = contattoPerso ? 'Il server non risponde: la richiesta di fermare non arriverebbe.' : '';
    }
  }
  // chip del modello e del permesso
  const modello = piede.querySelector('[data-open-sheet="model"] .talos-chip__label');
  if (modello) modello.textContent = dati.modello || 'Scegli il modello';
  // l'identificatore intero resta raggiungibile: a schermo il nome, nel suggerimento la targa
  const pillolaModello = piede.querySelector('[data-open-sheet="model"]');
  if (pillolaModello) pillolaModello.title = dati.modelloId ? `Cambia modello · ${dati.modelloId}` : 'Cambia modello';
  const permesso = piede.querySelector('[data-open-sheet="permissions"]');
  if (permesso) {
    const label = permesso.querySelector('.talos-chip__label');
    if (label) label.textContent = etichettaPermessoConEccezioni(dati.permesso, dati.permessiPerAttrezzo);
    const regole = dati.permessiPerAttrezzo && typeof dati.permessiPerAttrezzo === 'object' ? Object.entries(dati.permessiPerAttrezzo).filter(([, v]) => v) : [];
    permesso.title = regole.length
      ? `Cambia il permesso · eccezioni per attrezzo: ${regole.map(([k, v]) => `${k} → ${v}`).join(', ')}`
      : 'Cambia il permesso';
    permesso.classList.remove('talos-badge--warning', 'talos-badge--danger');
    const tono = tonoPermesso(dati.permesso);
    if (tono) permesso.classList.add(`talos-badge--${tono}`);
  }
  // giri e costo
  const u = testiUsage(dati.usage, { tettoGiri: dati.tettoGiri, usageSessione: dati.usageSessione });
  const giriChip = piede.querySelector('[data-runtime-giri]');
  if (giriChip) {
    /*
     * ⛔ 06/9 — decisione B12: il contatore dei giri «compare dal 50% del tetto, in grigio, e si
     * accende avvicinandosi». Prima compariva sempre: con 9 giri su 24 (il 37%) diceva un numero
     * che non chiedeva niente a nessuno. Sotto la soglia si tace; da lì in su è quieto fino
     * all'80%, poi diventa un avviso.
     */
    const stato = statoGiri(u.giri, dati.tettoGiri);
    giriChip.hidden = stato === null;
    giriChip.classList.toggle('talos-badge--warning', stato === 'vicino');
    const n = giriChip.querySelector('.talos-mono');
    if (n && u.giri !== null) n.textContent = Number.isFinite(Number(dati.tettoGiri)) && Number(dati.tettoGiri) > 0 ? `${u.giri}/${dati.tettoGiri}` : String(u.giri);
    /*
     * ⛔ 06/9, CB-13 — nella stessa barra ci sono due numeri che si chiamano entrambi «giri»:
     *    questo è dell'INVIO in corso (è quello che può finire contro il tetto), quello accanto
     *    ai token è di TUTTA la conversazione. Chi guarda deve poterlo sapere senza indovinare.
     */
    giriChip.title = Number.isFinite(Number(dati.tettoGiri)) && Number(dati.tettoGiri) > 0
      ? `Giri del modello in questo invio, sul tetto di ${dati.tettoGiri} dichiarato dal kernel. Il numero accanto ai token conta invece tutta la sessione.`
      : 'Giri del modello in questo invio. Il numero accanto ai token conta invece tutta la sessione.';
  }
  const costoChip = piede.querySelector('[data-runtime-costo]');
  if (costoChip) {
    costoChip.hidden = !dati.costo;
    const n = costoChip.querySelector('.talos-mono');
    if (n && dati.costo) n.textContent = dati.costo;
  }
  // barra di stato
  // 06/9: al posto del tema, la velocità — ma solo con un modello locale, e solo se il numero c'è
  scrivi(piede.querySelector('[data-statusbar="tema"]'), testoVelocitaLocale(dati.modelloId, u.velocita));
  scrivi(piede.querySelector('[data-runtime-usage]'), u.tokenGiri);
  scrivi(piede.querySelector('[data-runtime-cache]'), u.cache);
  scrivi(piede.querySelector('[data-runtime-latenza]'), testoLatenza(dati.latenzaMs) || u.velocita);
}
