/*
 * ⭐ «SEGNALA UN PROBLEMA» (owner 29/10/2026, quattro risposte sul bozzetto interattivo https://claude.ai/artifact/328gdp9tLvvczoP29Yb73P).
 *   Due porte, una finestra sola:
 *   · dal menu della finestra (il menu nativo del guscio, `desktop/segnalazione.mjs`): la finestra vuota, con la diagnostica pronta;
 *   · dalla chat: il modello chiama `report_problem`, in chat arriva la carta «Bozza di segnalazione · <tipo>» (evento
 *     `talos.segnalazione-bozza`, già ripulito dal server) con «Rivedi e apri» e «Scarta»; «Rivedi e apri» apre la STESSA finestra,
 *     compilata con la bozza.
 *   «Apri su GitHub» apre il browser del sistema su `issues/new` del repo pubblico, con il modello `desktop.yml` e i campi già scritti:
 *   la persona invia col suo account. TALOS non manda niente a nessuno.
 * Come Codex (`codex-rs/tui/src/bottom_pane/feedback_view.rs:17-18`, `BASE_CLI_BUG_ISSUE_URL = …/issues/new?template=3-cli.yml`, e
 *   `:113-133`, `issue_url_for_category`: un campo del modulo precompilato nell'indirizzo). Le differenze, volute: Codex carica i log sui
 *   suoi server prima di dare l'indirizzo (`:219`, `feedback_upload_consent_params`); qui niente parte, la diagnostica è solo quella che la
 *   persona legge per intero, e si toglie con una casella. E Codex sceglie fra cinque categorie (`:144-184`); qui tre (owner).
 * ⛔ GitHub («Creating an issue from a URL query», docs.github.com, letta il 29/10/2026): `labels=` vuole il permesso di mettere etichette
 *   — chi non ce l'ha riceve 404 — quindi il tipo va nel TITOLO (`[Bug]`…); un indirizzo oltre il limite riceve 414 «URI Too Long»: il
 *   tetto è sul corpo CODIFICATO (nota (b) della CLI, 29/10), e il taglio si dice nella finestra.
 * ⛔ Pezzi esistenti, nessuna veste nuova (come `annulla-file.js`): la modale è `apriModale`, i tipi sono le pillole `talos-filtro`, i
 *   campi `talos-field`/`talos-textarea`, la casella `talos-checkbox`, i pulsanti `talos-button`.
 */
import { t, linguaCorrenteDiT } from './lingua.js';
import { apriModale } from './modale-td.js';
import { sembraChiaveOPercorso } from './segnala-forme.js'; // revisione D (F3): l'avviso, mai la riscrittura

export const INDIRIZZO_NUOVA_SEGNALAZIONE = 'https://github.com/Ninozzz95/talos/issues/new';
export const MODELLO_GITHUB = 'desktop.yml';
/* Il limite di GitHub non è documentato (solo il 414): ~6.000 caratteri codificati stanno larghi sotto gli 8 KB delle righe di richiesta
   più comuni, e sono il tetto chiesto dal brief del 29/10. */
export const TETTO_INDIRIZZO = 6000;
export const TIPI = Object.freeze(['bug', 'wrong_answer', 'idea']);
/* Fisse e in inglese: sono per chi legge le segnalazioni sul repo, non per la persona (il tipo a schermo è nella sua lingua). */
export const ETICHETTE_DEL_TIPO = Object.freeze({ bug: '[Bug]', wrong_answer: '[Wrong answer]', idea: '[Idea]' });
/* Sotto questa lunghezza una descrizione non dice più niente: se per farci stare la diagnostica bisognerebbe accorciarla di più, esce la
   diagnostica (la persona la incolla), non la descrizione. */
const DESCRIZIONE_UTILE = 600;

const titoloCompleto = (tipo, titolo) => `${ETICHETTE_DEL_TIPO[tipo] ?? ETICHETTE_DEL_TIPO.bug} ${String(titolo ?? '').trim()}`;
/** I primi `n` caratteri VERI (punti di codice): una coppia di surrogati non si spezza. */
const primi = (caratteri, n) => (n >= caratteri.length ? caratteri.join('') : `${caratteri.slice(0, n).join('')}…`);

/**
 * L'indirizzo di GitHub per la segnalazione. `diagnostica` null ⇒ il campo non c'è (casella tolta). Il tetto vale sull'indirizzo intero
 *   CODIFICATO: prima si accorcia la descrizione (il meno possibile), e se per tenere la diagnostica bisognerebbe ridurla sotto una
 *   lunghezza utile, esce la diagnostica.
 * @returns {{url:string, tagliata:boolean, diagnosticaFuori:boolean}}
 */
export function indirizzoSegnalazione({ tipo, titolo, descrizione = '', diagnostica = null, tetto = TETTO_INDIRIZZO } = {}) {
  const costruisci = (desc, diag) => {
    const q = new URLSearchParams({ template: MODELLO_GITHUB, title: titoloCompleto(tipo, titolo), cosa: desc });
    if (typeof diag === 'string' && diag) q.set('diagnostica', diag);
    return `${INDIRIZZO_NUOVA_SEGNALAZIONE}?${q}`;
  };
  const caratteri = Array.from(String(descrizione ?? ''));
  const intero = costruisci(caratteri.join(''), diagnostica);
  if (intero.length <= tetto) return { url: intero, tagliata: false, diagnosticaFuori: false };
  /* il più lungo che entra, con la ricerca binaria sul numero di caratteri */
  const piuLungo = (diag) => {
    let basso = 0;
    let alto = caratteri.length;
    if (costruisci(primi(caratteri, 0), diag).length > tetto) return -1;
    while (basso < alto) {
      const mezzo = Math.ceil((basso + alto) / 2);
      if (costruisci(primi(caratteri, mezzo), diag).length <= tetto) basso = mezzo; else alto = mezzo - 1;
    }
    return basso;
  };
  const conDiagnostica = typeof diagnostica === 'string' && diagnostica ? piuLungo(diagnostica) : -1;
  if (conDiagnostica >= Math.min(DESCRIZIONE_UTILE, caratteri.length) && conDiagnostica >= 0) {
    return { url: costruisci(primi(caratteri, conDiagnostica), diagnostica), tagliata: conDiagnostica < caratteri.length, diagnosticaFuori: false };
  }
  const senza = piuLungo(null);
  const diagnosticaFuori = typeof diagnostica === 'string' && diagnostica !== '';
  return { url: costruisci(primi(caratteri, Math.max(0, senza)), null), tagliata: senza < caratteri.length, diagnosticaFuori };
}

/** Il testo che «Copia il testo» mette negli appunti: INTERO, senza tagli. */
export function testoDaCopiare({ tipo, titolo, descrizione = '', diagnostica = null }) {
  const parti = [titoloCompleto(tipo, titolo), String(descrizione ?? '').trim()].filter(Boolean);
  if (typeof diagnostica === 'string' && diagnostica) parti.push(`${t('segnala.diag.heading')}\n${diagnostica}`);
  return parti.join('\n\n');
}

const PERMESSI = Object.freeze({ 'Read only': 'readOnly', Research: 'research', 'On request': 'onRequest', 'Workspace write': 'workspaceWrite', 'Full access': 'fullAccess' });
const SFORZI = new Set(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
const acceso = (v) => t(v === true ? 'segnala.diag.on' : v === false ? 'segnala.diag.off' : 'segnala.diag.unknown');
const ora = (iso) => {
  const d = new Date(iso ?? '');
  return Number.isNaN(d.getTime()) ? null : d.toLocaleTimeString(linguaCorrenteDiT() === 'en' ? 'en-GB' : 'it-IT', { hour: '2-digit', minute: '2-digit' });
};

/** Le righe della diagnostica (dati del server, già ripuliti), nella lingua dell'interfaccia: ciò che la finestra mostra e che va su GitHub. */
export function righeDiagnostica(d) {
  const sistema = [d?.sistema?.nome, d?.sistema?.arch].filter(Boolean).join(', ') || t('segnala.diag.systemUnknown');
  const chiaveApp = d?.versione ? (d?.installata ? 'segnala.diag.app' : 'segnala.diag.appSource') : (d?.installata ? 'segnala.diag.appUnknown' : 'segnala.diag.appUnknownSource');
  const righe = [t(chiaveApp, { versione: d?.versione ?? '', sistema })];
  const s = d?.sessione;
  if (s) {
    const ignoto = t('segnala.diag.unknown');
    righe.push(t('segnala.diag.model', {
      modello: s.modello || ignoto, fornitore: s.fornitore || ignoto,
      sforzo: SFORZI.has(s.sforzo) ? t(`app.modelPicker.effort.${s.sforzo}`) : (s.sforzo || ignoto),
    }));
    righe.push(t('segnala.diag.access', { permesso: PERMESSI[s.permesso] ? t(`chat.foot.permission.${PERMESSI[s.permesso]}`) : ignoto, terminale: acceso(s.terminale) }));
  }
  else righe.push(t('segnala.diag.noSession'));
  /* lo stesso codice si dice una volta, con quante volte e le ore: «SHELL_TIMEOUT ×2 (11:42, 11:47)» (il bozzetto) */
  const gruppi = new Map();
  for (const e of Array.isArray(d?.errori) ? d.errori : []) {
    if (typeof e?.codice !== 'string') continue;
    const g = gruppi.get(e.codice) ?? { n: 0, ore: [] };
    g.n += 1;
    const h = ora(e.alle);
    if (h) g.ore.push(h);
    gruppi.set(e.codice, g);
  }
  righe.push(gruppi.size
    ? t('segnala.diag.errors', { errori: [...gruppi].map(([codice, g]) => `${codice}${g.n > 1 ? ` ×${g.n}` : ''}${g.ore.length ? ` (${g.ore.join(', ')})` : ''}`).join(' · ') })
    : t('segnala.diag.errorsNone'));
  righe.push(t('segnala.diag.services', { motore: acceso(d?.motoreLocale), remoto: acceso(d?.remoto) }));
  return righe;
}

function nodo(doc, tag, classe, testo) {
  const n = doc.createElement(tag);
  if (classe) n.className = classe;
  if (testo !== undefined) n.textContent = testo;
  return n;
}
const tipoValido = (k) => (TIPI.includes(k) ? k : 'bug');

/**
 * La carta della bozza in chat (seconda porta). `scartata` ⇒ al posto dei pulsanti la riga che lo dice (anche rigiocando la storia).
 * @param {{toolCallId?:string, kind:string, title:string}} bozza
 */
export function creaCartaBozza(doc, bozza, { onRivedi, onScarta, scartata = false } = {}) {
  const carta = nodo(doc, 'div', 'talos-segnala-carta');
  carta.setAttribute('role', 'group');
  carta.setAttribute('aria-label', t('segnala.card.label'));
  carta.dataset.segnalazioneBozza = String(bozza?.toolCallId ?? '');
  const tipo = tipoValido(bozza?.kind);
  carta.append(nodo(doc, 'strong', 'talos-segnala-carta__titolo', t('segnala.card.title', { tipo: t(`segnala.kind.short.${tipo}`) })));
  carta.append(nodo(doc, 'span', 'td-subtle talos-segnala-carta__bozza', t('segnala.card.quoted', { titolo: String(bozza?.title ?? '') })));
  const azioni = nodo(doc, 'div', 'talos-segnala-carta__azioni');
  const scarta = () => {
    azioni.replaceChildren(nodo(doc, 'span', 'td-subtle', t('segnala.card.discarded')));
    azioni.setAttribute('role', 'status');
    carta.dataset.scartata = 'si';
  };
  if (scartata) scarta();
  else {
    const rivedi = nodo(doc, 'button', 'talos-button talos-button--primary talos-button--sm', t('segnala.card.review'));
    rivedi.type = 'button';
    rivedi.dataset.segnalaRivedi = '';
    rivedi.addEventListener('click', () => onRivedi?.());
    const via = nodo(doc, 'button', 'talos-button talos-button--secondary talos-button--sm', t('segnala.card.discard'));
    via.type = 'button';
    via.dataset.segnalaScarta = '';
    via.addEventListener('click', () => { scarta(); onScarta?.(); });
    azioni.append(rivedi, via);
  }
  carta.append(azioni);
  return carta;
}

/**
 * La finestra della segnalazione.
 * @param {{leggiDiagnostica:(sessionId:string|null)=>Promise<object>, apriIndirizzo:(url:string)=>void, copia:(testo:string)=>Promise<void>, document?:Document}} deps
 */
export function creaSegnalaProblema({ leggiDiagnostica, apriIndirizzo, copia, document: doc = globalThis.document } = {}) {
  return {
    /** `bozza` (dalla carta) ⇒ compilata; senza ⇒ vuota, dal menu. */
    async apri({ bozza = null, sessionId = null } = {}) {
      let tipo = tipoValido(bozza?.kind);
      let diagnostica = null; // il testo delle righe, quando è arrivato
      let allega = true;

      const origine = nodo(doc, 'p', 'td-subtle talos-segnala__origine', t(bozza ? 'segnala.origin.chat' : 'segnala.origin.menu'));

      const campoTipo = nodo(doc, 'div', 'talos-field--stack');
      const etichettaTipo = nodo(doc, 'span', 'talos-field__label', t('segnala.kind.label'));
      etichettaTipo.id = `segnala-tipo-${Math.random().toString(36).slice(2, 8)}`;
      const pillole = nodo(doc, 'div', 'talos-segnala__tipi');
      pillole.setAttribute('role', 'group');
      pillole.setAttribute('aria-labelledby', etichettaTipo.id);
      for (const k of TIPI) {
        const b = nodo(doc, 'button', 'talos-filtro', t(`segnala.kind.${k}`));
        b.type = 'button';
        b.dataset.segnalaTipo = k;
        b.setAttribute('aria-pressed', String(k === tipo));
        b.addEventListener('click', () => {
          tipo = k;
          for (const x of pillole.children) x.setAttribute('aria-pressed', String(x.dataset.segnalaTipo === k));
          aggiorna();
        });
        pillole.append(b);
      }
      campoTipo.append(etichettaTipo, pillole);

      const campoTitolo = nodo(doc, 'label', 'talos-field--stack');
      const titolo = nodo(doc, 'input', 'talos-field__input');
      titolo.type = 'text';
      titolo.maxLength = 120;
      titolo.value = String(bozza?.title ?? '');
      titolo.dataset.segnalaTitolo = '';
      campoTitolo.append(nodo(doc, 'span', 'talos-field__label', t('segnala.field.title')), titolo);

      const campoDescrizione = nodo(doc, 'label', 'talos-field--stack');
      const descrizione = nodo(doc, 'textarea', 'talos-textarea talos-segnala__descrizione');
      descrizione.maxLength = 4000;
      descrizione.value = String(bozza?.description ?? '');
      descrizione.dataset.segnalaDescrizione = '';
      campoDescrizione.append(nodo(doc, 'span', 'talos-field__label', t('segnala.field.description')), descrizione);

      /* la diagnostica: sempre visibile per intero (owner), togliibile con la casella */
      const blocco = nodo(doc, 'section', 'talos-segnala__diagnostica');
      const riga = nodo(doc, 'label', 'talos-segnala__allega');
      /* la casella con la spunta disegnata del sistema (`input.talos-checkbox`, design-system/controls.css), come la scheda Git */
      const casella = nodo(doc, 'input', 'talos-checkbox');
      casella.type = 'checkbox';
      casella.checked = true;
      casella.dataset.segnalaAllega = '';
      casella.disabled = true; // finché la diagnostica non è arrivata
      riga.append(casella, doc.createTextNode(t('segnala.diag.attach')));
      const righe = nodo(doc, 'pre', 'talos-segnala__righe', t('segnala.diag.loading'));
      righe.dataset.segnalaDiagnostica = '';
      blocco.append(riga, righe);
      casella.addEventListener('change', () => {
        allega = casella.checked;
        blocco.dataset.tolta = allega ? 'no' : 'si';
        aggiorna();
      });

      const privacy = nodo(doc, 'p', 'td-subtle talos-segnala__privacy', t('segnala.privacy'));
      const avviso = nodo(doc, 'p', 'talos-inspector__hint talos-segnala__taglio');
      avviso.setAttribute('aria-live', 'polite');
      avviso.hidden = true;
      /* Revisione D (F3): ciò che la persona scrive NON si riscrive — è suo. Se ha la forma di una chiave o di un percorso assoluto
         (le forme della pulizia del server, `segnala-forme.js`), una riga lo dice sopra i pulsanti; «Apri su GitHub» resta attivo. */
      const avvisoPrivato = nodo(doc, 'p', 'talos-inspector__hint talos-segnala__privato', t('segnala.privateWarning'));
      avvisoPrivato.setAttribute('aria-live', 'polite');
      avvisoPrivato.dataset.segnalaPrivato = '';
      avvisoPrivato.hidden = true;

      const piede = nodo(doc, 'div', 'td-detail-footer talos-segnala__piede');
      const esito = nodo(doc, 'p', 'td-subtle talos-segnala__esito');
      esito.setAttribute('role', 'status');
      const copiaBtn = nodo(doc, 'button', 'talos-button talos-button--secondary', t('segnala.copy'));
      copiaBtn.type = 'button';
      copiaBtn.dataset.segnalaCopia = '';
      const apriBtn = nodo(doc, 'button', 'talos-button talos-button--primary', t('segnala.open'));
      apriBtn.type = 'button';
      apriBtn.dataset.segnalaApri = '';
      piede.append(esito, copiaBtn, apriBtn);

      const dati = () => ({ tipo, titolo: titolo.value, descrizione: descrizione.value.trim(), diagnostica: allega ? diagnostica : null });
      /* il taglio si dice PRIMA di aprire (nota (b) della CLI): a ogni cambio si ricalcola l'indirizzo */
      function aggiorna() {
        const r = indirizzoSegnalazione(dati());
        const frasi = [r.tagliata ? t('segnala.cut') : null, r.diagnosticaFuori ? t('segnala.diagOut') : null].filter(Boolean);
        avviso.textContent = frasi.join(' ');
        avviso.hidden = frasi.length === 0;
        const d = dati();
        avvisoPrivato.hidden = ![d.titolo, d.descrizione, d.diagnostica].some(sembraChiaveOPercorso);
        return r;
      }
      titolo.addEventListener('input', aggiorna);
      descrizione.addEventListener('input', aggiorna);

      copiaBtn.addEventListener('click', async () => {
        try { await copia(testoDaCopiare(dati())); esito.textContent = t('segnala.copied'); }
        catch { esito.textContent = t('segnala.copyFailed'); }
      });
      apriBtn.addEventListener('click', () => {
        if (!titolo.value.trim()) { esito.textContent = t('segnala.needTitle'); titolo.focus(); return; }
        apriIndirizzo(aggiorna().url);
        esito.textContent = t('segnala.opened');
      });

      const aperta = apriModale(t('segnala.title'), [origine, campoTipo, campoTitolo, campoDescrizione, blocco, privacy, avviso, avvisoPrivato, piede], { document: doc });
      aperta?.dialogo?.setAttribute('data-segnala-problema', bozza ? 'chat' : 'menu');
      (bozza ? apriBtn : titolo).focus?.({ preventScroll: true });
      aggiorna();
      try {
        const d = await leggiDiagnostica(sessionId);
        diagnostica = righeDiagnostica(d).join('\n');
        righe.textContent = diagnostica;
        casella.disabled = false;
      } catch {
        allega = false;
        casella.checked = false;
        righe.textContent = t('segnala.diag.unavailable');
        blocco.dataset.tolta = 'si';
      }
      aggiorna();
      return aperta;
    },
  };
}
