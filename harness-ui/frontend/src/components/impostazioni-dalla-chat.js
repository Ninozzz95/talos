/**
 * impostazioni-dalla-chat.js — fase 8 «Impostazioni dalla chat» sul PC (owner 01/11/2026, disegno chiuso FE-055, otto consigliate;
 * OK del Mobile). Il bozzetto è `Downloads/TALOS/frontend/in-corso/bozzetto-impostazioni-dalla-chat/` (`pc.js`, `stile-pc.css`,
 * `TABELLA-PEZZI.md`): qui si porta IDENTICO, coi pezzi di casa che il bozzetto stesso cita.
 *
 * I pezzi, ognuno legato al suo dato vero (regola «filo per filo», owner 18/09):
 *   · la CARTA di `app_settings` — `azione = { tipo:'app_settings', azione, dove, cambi[{chiave, nome{en,it}, ambito, dove, gruppo,
 *     prima, dopo, prezzo?}], revisione|ricevuta, ragione?, avvisi? }` (server, `servizio-impostazioni.mjs` `cartaDi`/`cambioDaMostrare`);
 *   · la RIGA dell'attrezzo con «Annulla» a vista (decisione 1) — la ricevuta dell'esito («Receipt set-… (undo with receipt_id)»,
 *     `servizio-impostazioni.mjs:596`) e i suoi cambi da `GET /api/v1/app-settings/changes`; l'Annulla è `POST /api/v1/app-settings/undo`;
 *   · il SEGNO «Cambiata da TALOS · Annulla» sotto le scelte nelle Impostazioni (decisione 2) — le stesse ricevute;
 *   · la riga della NOTIFICA `impostazioni` (in `notifiche.js`) — i nomi da qui;
 *   · il suggerimento di `/settings` (decisione 7: il valore sbagliato si dice NELL'ELENCO) — il catalogo `GET …/catalog`.
 *
 * ⛔ Mai una chiave grezza a schermo: un nome che il catalogo (o la carta) non dà ⇒ la riga non si scrive. I valori si dicono con la
 *   parola che la finestra ha già (le opzioni delle Impostazioni, il selettore dei modelli, i permessi); un valore che non ha parola
 *   resta com'è (il modello l'ha scritto così: un id di modello, una cifra), mai un nome di chiave.
 * ⛔ Il DOM si costruisce a mano e il testo va sempre in `textContent`: nomi e valori arrivano dal server e, la ragione, dal modello.
 *
 * Ricerca del 02/11/2026: Hermes desktop spegne «Undo» mentre la richiesta è in volo (`apps/desktop/src/app/settings/billing/
 *   current-plan-card.tsx:46-49`, «Undoing…» disabilitato, clone 2026-11-01) ⇒ qui l'Annulla si spegne finché il server non risponde. I
 *   controlli «Annulla» in linea dei concorrenti (Figma, Cursor: forum del 2025-2026) spariscono dopo poco o al ricaricamento: qui il segno
 *   viene dalle ricevute del server, quindi resta anche dopo un riavvio. Per l'elenco dei comandi, APG (pattern combobox): un'opzione non
 *   sceglibile porta `aria-disabled="true"` e si salta con le frecce.
 */
import { t, tn, linguaCorrenteDiT } from './lingua.js';
import { etichettaPermesso, nomeModelloUmano } from './chat-foot.js';
import { formattaPrezzo } from './selettore-modelli.js';
import { nomeDellaLinguaDaMostrare } from './lingue-delle-risposte.js';
import { creaNotaSistema } from './conversazione.js';
import { suUnaRiga } from './testo-a-schermo.js';
import { CONTROLLI_MIGRATI } from './theme-studio.js'; // D24: i controlli che dal 12/09 stanno nello studio dei temi

export const NOME_ATTREZZO_IMPOSTAZIONI = 'app_settings';
export const eCartaImpostazioni = (azione) => azione?.tipo === NOME_ATTREZZO_IMPOSTAZIONI;

function el(doc, tag, classe, testo) { const n = doc.createElement(tag); if (classe) n.className = classe; if (testo !== undefined) n.textContent = testo; return n; }
function bottone(doc, classe, testo) { const b = el(doc, 'button', classe, testo); b.type = 'button'; return b; }
const lingua = () => (linguaCorrenteDiT() === 'en' ? 'en' : 'it');

/* ───────────────────────── il catalogo (GET /api/v1/app-settings/catalog), una copia per la finestra ───────────────────────── */

let catalogo = new Map();
/** Registra il catalogo pubblico del server (`{ schema, voci:[{key, section, scope, where, type, values?, group, text{en,it}, textKey}] }`). */
export function registraCatalogoImpostazioni(dati) {
  const voci = Array.isArray(dati?.voci) ? dati.voci : [];
  catalogo = new Map(voci.filter((v) => v && typeof v.key === 'string' && v.key).map((v) => [v.key, v]));
  return catalogo.size;
}
export const catalogoImpostazioniCaricato = () => catalogo.size > 0;
export const voceDelCatalogoImpostazioni = (chiave) => catalogo.get(chiave) ?? null;

/** Il nome di una voce nella lingua dell'interfaccia: quello della carta (`nome{en,it}`) o del catalogo; `null` se nessuno lo sa. */
export function nomeImpostazione(chiave, nome = null) {
  const dallaCarta = nome && typeof nome === 'object' ? (nome[lingua()] || nome.en) : null;
  if (typeof dallaCarta === 'string' && dallaCarta.trim()) return dallaCarta;
  const v = catalogo.get(chiave);
  const testo = v?.text?.[lingua()] || v?.text?.en;
  return typeof testo === 'string' && testo.trim() ? testo : null;
}

/* ───────────────────────── i valori in parole ───────────────────────── */

/*
 * Un campo della finestra si riconosce dalla chiave del dizionario del suo titolo, `impostazioni.field.<campo>.title`: la porta la carta
 * (`nome.chiave`, da `cambioDaMostrare` che copia `testo` del catalogo) e il catalogo pubblico (`textKey`). Le sue scelte hanno le parole
 * delle Impostazioni, `impostazioni.field.<campo>.option.<valore della finestra>`; dove la finestra usa un valore suo (gli `interni` del
 * catalogo del server, che il catalogo pubblico non porta) lo dice questa tabella, per CAMPO.
 */
const VALORI_DELLA_FINESTRA = Object.freeze({
  uiDensitySelect: Object.freeze({ compact: 'compatta', comfortable: 'comoda' }),
  uiLanguageSelect: Object.freeze({ system: 'sistema' }),
  stopWithAgentsSelect: Object.freeze({ ask: 'chiedi', all: 'tutte', chatOnly: 'solo_chat' }),
});
function campoDellaFinestra(chiave, nome) {
  const chiaveTitolo = (nome && typeof nome === 'object' && typeof nome.chiave === 'string' ? nome.chiave : null) ?? catalogo.get(chiave)?.textKey;
  return /^impostazioni\.field\.([A-Za-z0-9]+)\.title$/u.exec(String(chiaveTitolo ?? ''))?.[1] ?? null;
}
const DOVE = (v) => ({ auto: 'modello.permissions.automatic', wsl2: 'app.sheets.permissions.where.wslName', windows: 'app.sheets.permissions.where.windowsName' }[v] ?? null);
const CHIAVE_DEL_VALORE = Object.freeze({
  'models.localWindowFull': (v) => `varie.localWindow.choice.${v}.title`,
  'conversation.reasoningEffort': (v) => (v === 'default' ? 'modello.permissions.automatic' : `app.modelPicker.effort.${v === 'none' ? 'off' : v}`),
  'conversation.commandShell': DOVE,
  'tools.defaultCommandShell': DOVE,
  'tools.webSearchSource': (v) => ({ custom: 'modello.settings.customEndpoint', off: 'sezioni.searchSource.noSearch' }[v] ?? null),
  /* la carta del motore è un interruttore («Usalo per le conversazioni nuove»): acceso = sì */
  'context.engine': (v) => ({ engine: 'app.settings.facts.yes', legacy: 'app.settings.facts.no' }[v] ?? null),
});
/* i nomi propri delle fonti della ricerca, come le scelte della carta (`fonte-ricerca.js`) */
const NOMI_PROPRI = Object.freeze({ 'tools.webSearchSource': Object.freeze({ duckduckgo: 'DuckDuckGo', tavily: 'Tavily', brave: 'Brave Search', searxng: 'SearXNG' }) });
const VOCI_MODELLO = new Set(['conversation.model', 'conversation.planModel', 'context.summaryModel', 'context.summaryFallback']);
const MODELLO_NULLO = Object.freeze({ 'context.summaryModel': 'varie.compaction.card.sameAsConversation', 'context.summaryFallback': 'varie.compaction.card.noBackup' });
const PERMESSO_INTERNO = Object.freeze({ readOnly: 'Read only', research: 'Research', onRequest: 'On request', workspaceWrite: 'Workspace write', fullAccess: 'Full access' });

/** Un valore pubblico del catalogo (`wsl2`, `medium`, `true`, un id di modello) con la parola che la finestra ha già.
 *  `nome` è il nome della carta (`{ chiave, en, it }`), che dice il campo della finestra anche senza catalogo. */
export function valoreInParole(chiave, valore, nome = null) {
  if (typeof valore === 'boolean') return t(valore ? 'app.settings.facts.yes' : 'app.settings.facts.no');
  if (chiave === 'conversation.permissions' && typeof valore === 'string') return etichettaPermesso(PERMESSO_INTERNO[valore] ?? valore);
  if (VOCI_MODELLO.has(chiave)) {
    if (valore === null || valore === undefined) return t(MODELLO_NULLO[chiave] ?? 'appSettings.value.none');
    if (valore === 'conversazione') return t('varie.compaction.card.conversationModelOption');
    return nomeModelloUmano(String(valore)) || String(valore);
  }
  if (chiave === 'language.replies' && typeof valore === 'string') {
    return valore === 'auto' ? t('impostazioni.field.replyLanguageSelect.option.auto') : nomeDellaLinguaDaMostrare(valore, lingua());
  }
  const proprio = NOMI_PROPRI[chiave]?.[valore];
  if (proprio) return proprio;
  const campo = typeof valore === 'string' ? campoDellaFinestra(chiave, nome) : null;
  const chiaveTesto = campo ? `impostazioni.field.${campo}.option.${VALORI_DELLA_FINESTRA[campo]?.[valore] ?? valore}`
    : typeof valore === 'string' && Object.hasOwn(CHIAVE_DEL_VALORE, chiave) ? CHIAVE_DEL_VALORE[chiave](valore) : null;
  if (chiaveTesto) { const parola = t(chiaveTesto); if (parola !== chiaveTesto) return parola; }
  if (valore === null || valore === undefined) return t('appSettings.value.none');
  return String(valore);
}

/** «$in» e «$out» al milione, nella forma del selettore dei modelli (`formattaPrezzo`); `null` senza i due numeri. */
export function prezzoInParole(p) {
  if (!p || typeof p !== 'object' || !Number.isFinite(p.in) || !Number.isFinite(p.out) || p.in < 0 || p.out < 0) return null;
  return { ingresso: `$${formattaPrezzo(p.in)}`, uscita: `$${formattaPrezzo(p.out)}` };
}

const ORDINE_DELLO_SFORZO = Object.freeze(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
/** Lo sforzo sale o scende (Desktop 01/11: una riga senza numeri); `null` se uno dei due è «di serie» o non si confronta. */
export function direzioneDelloSforzo(prima, dopo) {
  const a = ORDINE_DELLO_SFORZO.indexOf(prima);
  const b = ORDINE_DELLO_SFORZO.indexOf(dopo);
  if (a < 0 || b < 0 || a === b) return null;
  return b > a ? 'su' : 'giu';
}

const parolaAmbito = (ambito) => (ambito === 'app' ? t('appSettings.scope.app') : ambito === 'conversation' ? t('appSettings.scope.conversation') : null);
const cambiDi = (elenco) => (Array.isArray(elenco) ? elenco.filter((c) => c && typeof c.chiave === 'string' && c.chiave) : []);

/** Le frasi del riquadro «Tocca la sicurezza», una per cambio che apre di più (mai per uno che chiude). */
export function frasiDiSicurezza(cambi) {
  const frasi = [];
  for (const c of cambiDi(cambi)) {
    if (c.chiave === 'conversation.permissions' && c.dopo === 'fullAccess') frasi.push('appSettings.card.security.permissions');
    else if (c.chiave === 'conversation.coordination' && c.dopo === true) frasi.push('appSettings.card.security.coordination');
    else if (c.chiave === 'tools.wslNormalUser' && c.dopo === false) frasi.push('appSettings.card.security.wslRoot');
    else if (c.chiave === 'updates.automatic' && c.dopo === false) frasi.push('appSettings.card.security.updates');
  }
  return frasi.map((k) => t(k));
}
/** La carta esce anche in Accesso pieno per i gruppi sicurezza e aggiornamenti (`GRUPPI_CARTA_SEMPRE`, kernel/impostazioni-app.mjs). */
export const cartaAncheInAccessoPieno = (cambi) => cambiDi(cambi).some((c) => c.gruppo === 'sicurezza' || c.gruppo === 'aggiornamenti');

function nodoPrezzo(doc, p) {
  const s = el(doc, 'span', 'talos-impostazione__prezzo');
  s.append(el(doc, 'b', '', p.ingresso), doc.createTextNode(` → ${p.uscita}`));
  return s;
}

/**
 * Le righe dei cambi, `talos-kv` come la carta dei fornitori: il nome e, sotto, dove vale; «prima → dopo». Sotto un modello che cambia, la
 * riga del prezzo (variante A, decisione 4: riga sua; solo coi due prezzi: un modello locale non ne ha). Sotto lo sforzo, la riga senza
 * numeri (decisione 3). Un cambio senza nome non si scrive.
 */
export function righeDeiCambi(doc, cambi) {
  const fuori = [];
  for (const c of cambiDi(cambi)) {
    const nome = nomeImpostazione(c.chiave, c.nome);
    if (!nome) continue;
    const riga = el(doc, 'div', 'talos-kv');
    riga.dataset.cambio = c.chiave;
    const k = el(doc, 'span', 'talos-kv__k');
    k.append(el(doc, 'span', 'talos-impostazione__nome', nome));
    const ambito = parolaAmbito(c.ambito);
    if (ambito) k.append(el(doc, 'small', 'talos-impostazione__ambito', ambito));
    riga.append(k, el(doc, 'span', 'talos-kv__v', `${valoreInParole(c.chiave, c.prima, c.nome)} → ${valoreInParole(c.chiave, c.dopo, c.nome)}`));
    fuori.push(riga);
    const pp = prezzoInParole(c.prezzo?.prima);
    const pd = prezzoInParole(c.prezzo?.dopo);
    if (pp && pd) {
      const r = el(doc, 'div', 'talos-kv talos-impostazione__nota');
      r.dataset.prezzo = c.chiave;
      const pk = el(doc, 'span', 'talos-kv__k', t('appSettings.price.row'));
      pk.title = t('modello.modelPicker.priceTitle');
      const pv = el(doc, 'span', 'talos-kv__v');
      const [prima, mezzo, dopo] = t('appSettings.price.change', { before: '\u0001', after: '\u0002' }).split(/[\u0001\u0002]/u);
      pv.append(doc.createTextNode(prima ?? ''), nodoPrezzo(doc, pp), doc.createTextNode(mezzo ?? ''), nodoPrezzo(doc, pd), doc.createTextNode(dopo ?? ''));
      r.append(pk, pv);
      fuori.push(r);
    }
    if (c.chiave === 'conversation.reasoningEffort') {
      const verso = direzioneDelloSforzo(c.prima, c.dopo);
      if (verso) {
        const r = el(doc, 'div', 'talos-kv talos-impostazione__nota');
        r.dataset.sforzo = verso;
        r.append(el(doc, 'span', 'talos-kv__k', t(verso === 'su' ? 'appSettings.effort.up' : 'appSettings.effort.down')));
        fuori.push(r);
      }
    }
  }
  return fuori;
}

/* ───────────────────────── 1. la carta ───────────────────────── */

/*
 * Giro 4 (02/11/2026, forma del Frontend; condizione del Mobile): il testo del MODELLO dentro una frase della finestra (`{ragione}`,
 *   `{frase}`) non è fidato anche se il server l'ha già pulito. (1) Una riga sola, senza i caratteri che girano o nascondono il testo:
 *   `suUnaRiga` (controlli e bidi, la classe condivisa col server) più quelli a larghezza zero, che quella classe non ha; (2) al più 120
 *   lettere (code point) con «…»; (3) messo nella frase SEMPRE con una funzione (`$&`, `$'`, `$1` restano testo).
 *   Ricerca del 02/11/2026: Goose block/goose#4237 mette gli avvisi a schemi DENTRO la conferma (non in una finestra in più); Hermes
 *   (`tools/threat_patterns.py:139-142`, clone 2026-11-01) segnala gli invisibili sul testo grezzo e non piega gli omoglifi di altri
 *   alfabeti; Checkmarx «Lies-in-the-Loop»: il testo della conferma lo scrive l'agente ⇒ qui si cita, tra virgolette, mai come voce nostra.
 */
export const CITAZIONE_MASSIMA = 120;
const LARGHEZZA_ZERO = new RegExp(`[${[0x200b, 0x200c, 0x200d, 0x2060, 0x2061, 0x2062, 0x2063, 0x2064, 0xfeff].map((c) => String.fromCodePoint(c)).join('')}]`, 'gu');
export function citazioneDelModello(testo) {
  const una = suUnaRiga(typeof testo === 'string' ? testo.replace(LARGHEZZA_ZERO, '') : '');
  const lettere = [...una];
  return lettere.length <= CITAZIONE_MASSIMA ? una : `${lettere.slice(0, CITAZIONE_MASSIMA - 1).join('').trimEnd()}…`;
}
const conCitazione = (chiave, segnaposto, testo) => t(chiave).replace(segnaposto, () => testo);

/* I codici della scansione della ragione (`minacceDellaRagione`, servizio-impostazioni.mjs): una frase al singolare per codice, il
   soggetto è la ragione. Un codice che la finestra non conosce (o che non è un testo) ⇒ la frase neutra, mai la chiave grezza: il
   dizionario è un oggetto piatto letto per chiave intera, quindi `constructor` o `Costruttore!` non trovano niente e cadono lì. */
export function minacciaDellaRagioneInParole(codice) {
  if (typeof codice !== 'string') return t('appSettings.card.threatOther');
  const chiave = `appSettings.card.threat.${codice.replace(/-([a-z0-9])/gu, (_, c) => c.toUpperCase())}`;
  const frase = t(chiave);
  return frase === chiave ? t('appSettings.card.threatOther') : frase;
}
const minacceDi = (azione) => (Array.isArray(azione?.avvisi?.minacce) ? azione.avvisi.minacce : []);

/**
 * Badge, bersaglio, perché e nota del piede per `appendCartaAutomazione`. Il perché è la RAGIONE del modello, già pulita dal server
 * (`ragioneDellaCarta`: una riga, senza invisibili, ≤ 200): c'è solo se il server non l'ha segnalata. Una ragione segnalata
 * («pressione-sulla-carta» e gli altri codici di `azione.avvisi.minacce`) non va nel perché: si legge DENTRO il riquadro di pericolo
 * del blocco (`creaBloccoCartaImpostazioni`), citata, accanto all'avviso.
 */
export function testiCartaImpostazioni(azione) {
  const sospetta = minacceDi(azione).length > 0;
  const ragione = !sospetta && typeof azione?.ragione === 'string' ? azione.ragione.trim() : '';
  return {
    badge: t('appSettings.card.badge'),
    bersaglio: '',
    perche: ragione,
    motivo: '',
    nota: cartaAncheInAccessoPieno(azione?.cambi) ? t('appSettings.card.alsoInFullAccess') : '',
  };
}

/**
 * Il blocco della carta: in testa al più UN riquadro, poi una riga per cambio.
 *   · Ragione sospetta (`azione.avvisi.minacce` non vuoto) ⇒ il riquadro di PERICOLO, copia di `automazione-carta.js` `creaAvvisi`
 *     (`talos-callout talos-callout--pericolo talos-approval__avvisi`, `role="alert"`, titolo in grassetto + elenco): «La ragione del modello
 *     è sospetta», la ragione citata (vuota ⇒ niente voce), una voce per codice. Se tocca anche la sicurezza, nello STESSO riquadro il
 *     secondo gruppo «Tocca la sicurezza» con le sue frasi (regola 17 dell'owner, tetto di interruzioni: un blocco solo, vince il tono più
 *     grave, niente linea né secondo riquadro). In fondo, una volta sola, «Approva solo se i cambi qui sotto sono quelli che hai chiesto
 *     tu.»: ultima voce dell'elenco quando il gruppo è uno, riga sua dopo i due gruppi quando sono due.
 *   · Solo sicurezza ⇒ il riquadro giallo di prima, identico. Nessuna delle due ⇒ nessun riquadro.
 */
export function creaBloccoCartaImpostazioni(doc, azione) {
  const blocco = el(doc, 'div', 'talos-approval__automazione');
  blocco.dataset.dettaglioImpostazioni = typeof azione?.azione === 'string' ? azione.azione : '';
  const frasi = frasiDiSicurezza(azione?.cambi);
  const minacce = minacceDi(azione);
  if (minacce.length) {
    const r = el(doc, 'div', 'talos-callout talos-callout--pericolo talos-approval__avvisi');
    r.dataset.avvisiImpostazioni = 'minacce';
    r.setAttribute('role', 'alert');
    const corpo = el(doc, 'div', 'talos-approval__avvisi-corpo');
    corpo.append(el(doc, 'b', '', t('appSettings.card.threatsTitle')));
    const lista = el(doc, 'ul', 'talos-approval__avvisi-lista');
    lista.dataset.gruppoAvvisi = 'minacce';
    const ragione = citazioneDelModello(azione?.ragione);
    if (ragione) {
      const li = el(doc, 'li', '', conCitazione('appSettings.card.threatQuote', '{ragione}', ragione));
      li.dataset.ragioneCitata = '';
      lista.append(li);
    }
    for (const codice of [...new Set(minacce)]) lista.append(el(doc, 'li', '', minacciaDellaRagioneInParole(codice)));
    corpo.append(lista);
    const fine = t('appSettings.card.threatApproveOnly');
    if (frasi.length) {
      corpo.append(el(doc, 'b', '', t('appSettings.card.securityTitle')));
      const sicurezza = el(doc, 'ul', 'talos-approval__avvisi-lista');
      sicurezza.dataset.gruppoAvvisi = 'sicurezza';
      for (const f of frasi) sicurezza.append(el(doc, 'li', '', f));
      const ultima = el(doc, 'p', 'talos-approval__avvisi-fine', fine);
      ultima.dataset.approvaSolo = '';
      corpo.append(sicurezza, ultima);
    } else {
      const ultima = el(doc, 'li', '', fine);
      ultima.dataset.approvaSolo = '';
      lista.append(ultima);
    }
    r.append(corpo);
    blocco.append(r);
  } else if (frasi.length) {
    const r = el(doc, 'div', 'talos-callout talos-approval__avvisi');
    r.dataset.avvisiImpostazioni = 'sicurezza';
    const corpo = el(doc, 'div', 'talos-approval__avvisi-corpo');
    corpo.append(el(doc, 'b', '', t('appSettings.card.securityTitle')));
    const lista = el(doc, 'ul', 'talos-approval__avvisi-lista');
    for (const f of frasi) lista.append(el(doc, 'li', '', f));
    corpo.append(lista);
    r.append(corpo);
    blocco.append(r);
  }
  blocco.append(...righeDeiCambi(doc, azione?.cambi));
  return blocco;
}

/* ───────────────────────── dove sta una voce nelle Impostazioni ───────────────────────── */

/* Le voci che non sono un campo della finestra: la loro riga o la loro griglia di scelte nella pagina vera */
const ANCORE_FISSE = Object.freeze({
  'updates.automatic': { selettore: '[data-setting-row="aggiornamentiAutomatici"]', riga: true },
  'context.engine': { selettore: '[data-setting-row="motoreContesto"]', riga: true },
  'context.summaryModel': { selettore: '[data-setting-row="modelloDelRiassunto"]', riga: true },
  'context.summaryFallback': { selettore: '[data-setting-row="riservaDelRiassunto"]', riga: true },
  'models.localWindowFull': { selettore: '[data-settings-card="modelli-finestra-piena"] .talos-choice-grid', riga: false },
  'tools.defaultCommandShell': { selettore: '[data-dove-serie-scelte]', riga: false },
  'tools.webSearchSource': { selettore: '[data-settings-card="tools-search"] .talos-choice-grid', riga: false },
  /* decisione 310 (06/11/2026): la riga «Uso del computer (Anteprima)» non è nel catalogo dei campi (`computer-use-impostazione.js`, RIGA) */
  'tools.computerUse': { selettore: '[data-setting-row="computerUseToggle"]', riga: true },
});
/**
 * Dove si attacca il segno di una voce, o `null`: le voci della conversazione stanno nel foglio della sessione, non nelle Impostazioni.
 * Un campo della finestra si trova dalla chiave del suo titolo nel catalogo (`textKey` = `impostazioni.field.<id>.title` ⇒
 * `[data-setting-row="<id>"]`, la riga di `creaSettingRow`).
 */
export function ancoraNelleImpostazioni(chiave) {
  if (Object.hasOwn(ANCORE_FISSE, chiave)) return ANCORE_FISSE[chiave];
  const v = catalogo.get(chiave);
  if (!v || v.scope !== 'app') return null;
  const m = /^impostazioni\.field\.([A-Za-z0-9]+)\.title$/u.exec(String(v.textKey ?? ''));
  if (!m) return null;
  /* D24 (collaudo del treno, 02/11/2026): tema, modo colore e sfondo animato non hanno più una riga nella pagina (`CONTROLLI_MIGRATI`, studio dei temi), e il
     segno non trovava dove attaccarsi. Nella pagina li rappresenta la banda «Il tuo tema»: il segno sta sotto di lei. */
  if (CONTROLLI_MIGRATI.includes(m[1])) return { selettore: '[data-settings-band] .settings-band__help', riga: false, sezione: 'appearance' };
  return { selettore: `[data-setting-row="${m[1]}"]`, riga: true };
}

/* ───────────────────────── l'Annulla (POST /api/v1/app-settings/undo) ───────────────────────── */

/**
 * L'esito di un Annulla rifiutato (`SETTINGS_UNDO_REFUSED`, 409). Il server dice il perché in inglese per il modello
 * (`pianoDellUndo`): «<chiave> changed again since …» ⇒ la voce cambiata dopo; «… was already undone» ⇒ già annullato. Altro ⇒ errore.
 */
export function esitoDellAnnullaRifiutato(errore) {
  const messaggio = String(errore?.problem?.message ?? '');
  if (/ was already undone\./u.test(messaggio)) return { esito: 'gia' };
  const cambiata = /^([A-Za-z][A-Za-z0-9.]*) changed again since\b/u.exec(messaggio);
  if ((errore?.code === 'SETTINGS_UNDO_REFUSED' || errore?.problem?.code === 'SETTINGS_UNDO_REFUSED') && cambiata) return { esito: 'cambiata', chiave: cambiata[1] };
  return { esito: 'errore' };
}

/** «Non annullato: <voce> è stata cambiata dopo.» sotto ciò che porta l'Annulla, che si spegne; `null` se il nome non si sa. */
export function segnaNonAnnullato(contenitore, chiave, { document: doc = contenitore?.ownerDocument ?? globalThis.document, dove = null } = {}) {
  const nome = nomeImpostazione(chiave);
  if (!contenitore || !nome) return null;
  for (const b of contenitore.querySelectorAll('[data-annulla-impostazioni]')) { b.disabled = true; b.setAttribute('aria-disabled', 'true'); }
  let riga = contenitore.querySelector('[data-non-annullato]');
  if (!riga) {
    riga = el(doc, 'p', 'talos-tool-row__nota-sospetto talos-impostazione__non-annullato');
    riga.dataset.nonAnnullato = '';
    riga.setAttribute('role', 'status');
    if (dove) dove(riga); else contenitore.append(riga);
  }
  riga.textContent = t('appSettings.row.notUndone', { setting: nome });
  return riga;
}

/* ───────────────────────── 2. la riga dell'attrezzo ───────────────────────── */

/** L'id della ricevuta che un `set` riuscito scrive in fondo al suo esito (`servizio-impostazioni.mjs:596`); `null` altrimenti. */
export function ricevutaDallEsito(testo) {
  const m = / Receipt (set-[A-Za-z0-9]+) \(undo with receipt_id\)\./u.exec(String(testo ?? ''));
  return m ? m[1] : null;
}
/** Il cambio è stato fatto senza carta (Accesso pieno): il nucleo lo scrive in coda all'esito (`notaSenzaCarta`, talosHarness.mjs). */
export const fattoSenzaCarta = (testo) => / Full access: done without asking the person\./u.test(String(testo ?? ''));

const quantiCambiati = (n) => tn('appSettings.row.changedOne', 'appSettings.row.changedMany', n);
const quantiAnnullati = (n) => tn('appSettings.row.undoneOne', 'appSettings.row.undoneMany', n);
const rigaDiTesto = (c) => {
  const nome = nomeImpostazione(c.chiave);
  if (!nome) return null;
  const ambito = parolaAmbito(c.ambito);
  return `${nome}: ${valoreInParole(c.chiave, c.prima)} → ${valoreInParole(c.chiave, c.dopo)}${ambito ? ` (${ambito})` : ''}`;
};

/**
 * La riga dell'attrezzo dopo un `set` riuscito, dalla sua ricevuta: «Ha cambiato N impostazioni», una riga per cambio nel corpo e
 * «Annulla» a vista sulla riga (decisione 1, `talos-button--ghost --sm` come nel bozzetto). In Accesso pieno, senza carta, il segno
 * «Senza conferma» e nel corpo il blocco «Fatto senza chiedere…» con le righe e «Annulla» (`segnaAutomazioneSenzaCarta`, stessa forma).
 * Una ricevuta già annullata mostra subito «Annullato: …». Ritorna `{ annullata(), rifiutata(chiave) }`, o `null` senza cambi da dire.
 * @param {{ riga: HTMLElement, summaryText?: HTMLElement|null, corpo?: HTMLElement|null, ricevuta: object, senzaCarta?: boolean,
 *   onAnnulla?: (receiptId: string) => void }} parti
 */
/**
 * Giro 4 (02/11/2026, parole del Frontend): in Accesso pieno un cambio con una ragione sospetta è già avvenuto senza carta; l'evento della
 * conversazione (`talos.impostazioni-sessione`, motivo `avviso-impostazioni`: `avvisi`, `ricevuta`, `frase`) lo dice. La frase per la
 * persona: con `frase` (il pezzo che ha fatto scattare la scansione, `fraseDellaRagione`, ≤ 60) la cita; senza, dice solo che la ragione
 * spingeva. La ragione intera MAI. `null` senza codici.
 */
export function fraseDellaPressioneSenzaCarta(avviso) {
  const codici = Array.isArray(avviso?.avvisi) ? avviso.avvisi.filter((a) => typeof a === 'string' && a) : [];
  if (!codici.length) return null;
  const frase = citazioneDelModello(avviso?.frase);
  return frase ? conCitazione('appSettings.row.pressureQuoted', '{frase}', frase) : t('appSettings.row.pressure');
}

/** La riga della pressione nel blocco «Fatto senza chiedere…» (sotto il titolo, come il `p` di `segnaAutomazioneSenzaCarta`); una sola. */
function mettiLaPressione(doc, blocco, avviso) {
  const frase = fraseDellaPressioneSenzaCarta(avviso);
  if (!blocco || !frase) return null;
  let p = blocco.querySelector('[data-impostazioni-pressione]');
  if (!p) {
    p = el(doc, 'p', '');
    p.dataset.impostazioniPressione = ''; // niente `role="alert"`: l'evento è durevole e una rigiocata lo ridirebbe a voce
    const titolo = blocco.querySelector(':scope > b');
    if (titolo) titolo.after(p); else blocco.prepend(p);
  }
  p.textContent = frase;
  return p;
}

export function mettiImpostazioniSullaRiga({ riga, summaryText = null, corpo = null, ricevuta, senzaCarta = false, onAnnulla = null, avviso = null }, opzioni = {}) {
  const cambi = cambiDi(ricevuta?.cambi);
  if (!riga || !cambi.length || typeof ricevuta?.id !== 'string') return null;
  const doc = opzioni.document || riga.ownerDocument || globalThis.document;
  riga.dataset.impostazioniRicevuta = ricevuta.id;
  const titolo = summaryText ?? riga.querySelector('.talos-tool-row__name');
  if (titolo) titolo.textContent = quantiCambiati(cambi.length);
  const righeTesto = cambi.map(rigaDiTesto).filter(Boolean);
  const pallino = riga.querySelector('.talos-dot');
  const annullata = () => {
    for (const b of [...riga.querySelectorAll('[data-annulla-impostazioni]'), ...(corpo?.querySelectorAll('[data-annulla-impostazioni]') ?? [])]) b.remove();
    if (titolo) titolo.textContent = quantiAnnullati(cambi.length);
    if (pallino) pallino.className = 'talos-dot';
    delete riga.dataset.toolState;
    riga.dataset.impostazioniAnnullate = '';
    if (corpo) { corpo.hidden = true; riga.setAttribute('aria-expanded', 'false'); }
  };
  const premi = (b) => (evento) => {
    evento?.stopPropagation?.(); // la regia dei disclosure non deve aprire/chiudere la riga
    if (b.disabled) return;
    b.disabled = true; // Hermes: «Undo» spento mentre la richiesta è in volo
    onAnnulla?.(ricevuta.id);
  };
  if (senzaCarta) {
    if (!riga.querySelector('.talos-tool-row__senza-carta')) {
      const segno = el(doc, 'span', 'talos-badge talos-badge--warning talos-badge--sm talos-tool-row__senza-carta', t('sezioni.automations.v2.unasked.badge'));
      segno.title = t('sezioni.automations.v2.unasked.title');
      const prima = riga.querySelector(':scope > .talos-voce__meta') || pallino;
      if (prima) prima.before(segno); else riga.append(segno);
    }
    if (corpo) {
      const blocco = el(doc, 'div', 'talos-approval__automazione talos-tool-row__senza-carta-blocco');
      blocco.dataset.impostazioniSenzaCarta = '';
      blocco.append(el(doc, 'b', '', t('sezioni.automations.v2.unasked.title')), ...righeDeiCambi(doc, cambi));
      if (!ricevuta.annullata) {
        const b = bottone(doc, 'talos-button talos-button--secondary talos-button--sm', t('appSettings.row.undo'));
        b.dataset.annullaImpostazioni = 'blocco';
        b.addEventListener('click', premi(b));
        blocco.append(b);
      }
      corpo.replaceChildren(blocco);
      if (avviso) mettiLaPressione(doc, blocco, avviso);
    }
  } else {
    if (corpo) corpo.textContent = righeTesto.join('\n');
    if (!ricevuta.annullata) {
      const b = bottone(doc, 'talos-button talos-button--ghost talos-button--sm', t('appSettings.row.undo'));
      b.dataset.annullaImpostazioni = 'riga';
      b.addEventListener('click', premi(b));
      if (pallino) pallino.before(b); else riga.append(b);
    }
  }
  if (ricevuta.annullata) annullata();
  const pulsanti = () => [...riga.querySelectorAll('[data-annulla-impostazioni]'), ...(corpo?.querySelectorAll('[data-annulla-impostazioni]') ?? [])];
  return {
    annullata,
    /* la riga resta, OGNI suo «Annulla» si spegne (anche quello sulla riga, fuori dal corpo), e il perché va in testa al corpo, aperto */
    rifiutata: (chiave) => {
      const nota = segnaNonAnnullato(corpo ?? riga, chiave, { document: doc, dove: corpo ? (n) => { corpo.prepend(n); corpo.hidden = false; riga.setAttribute('aria-expanded', 'true'); } : null });
      if (nota) for (const b of pulsanti()) { b.disabled = true; b.setAttribute('aria-disabled', 'true'); }
      return nota;
    },
    /** Un errore che non è un rifiuto: l'Annulla si riaccende, si può riprovare. */
    riprova: () => { for (const b of pulsanti()) b.disabled = false; },
    /** L'avviso della pressione arrivato DOPO la riga (giro 4): solo nel blocco senza carta (con la carta il blocco non c'è: il segnale
     *  stava già nella carta), quindi `null` altrove. */
    avvisata: (a) => mettiLaPressione(doc, corpo?.querySelector('[data-impostazioni-senza-carta]'), a),
  };
}

/* ───────────────────────── 3. il segno nelle Impostazioni ───────────────────────── */

/**
 * Le voci che portano il segno, dalle ricevute (le più nuove prima, come `GET …/changes`): per ogni chiave decide la ricevuta PIÙ NUOVA
 * che la tocca. Il segno c'è se quella è un cambio del modello (non un Annulla), non annullato, e la voce vale per l'app (le voci della
 * conversazione non stanno nelle Impostazioni). ⇒ `Map<chiave, ricevuta>`.
 */
export function segniDalleRicevute(ricevute) {
  const visti = new Set();
  const segni = new Map();
  for (const r of Array.isArray(ricevute) ? ricevute : []) {
    for (const c of cambiDi(r?.cambi)) {
      if (visti.has(c.chiave)) continue;
      visti.add(c.chiave);
      if (r.origine?.tipo === 'modello' && !r.annulla && !r.annullata && c.ambito === 'app' && typeof r.id === 'string') segni.set(c.chiave, r);
    }
  }
  return segni;
}

/** «Cambiata da TALOS alle 18:12» (oggi) o «… il 31 ottobre alle 18:12»; «da un dispositivo» solo se il sì è venuto da lì. */
export function testoDelSegno(ricevuta, adesso = new Date()) {
  const quando = new Date(ricevuta?.quando);
  const dalDispositivo = ricevuta?.confermatoDa?.tipo === 'dispositivo';
  const locale = lingua() === 'en' ? 'en-GB' : 'it-IT';
  if (Number.isNaN(quando.getTime())) return null;
  const time = quando.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const stessoGiorno = quando.getFullYear() === adesso.getFullYear() && quando.getMonth() === adesso.getMonth() && quando.getDate() === adesso.getDate();
  if (stessoGiorno) return t(dalDispositivo ? 'appSettings.mark.atFromDevice' : 'appSettings.mark.at', { time });
  const date = quando.toLocaleDateString(locale, { day: 'numeric', month: 'long' });
  return t(dalDispositivo ? 'appSettings.mark.onFromDevice' : 'appSettings.mark.on', { date, time });
}

/**
 * Mette (o rimette) i segni nella pagina delle Impostazioni: una riga `talos-setting__help` col pallino, la frase e «Annulla»
 * (variante A, decisione 2: sotto le scelte). Per un campo, dentro la colonna del titolo della sua riga; per una griglia di scelte,
 * subito dopo la griglia. I segni vecchi si tolgono prima. Ritorna quanti segni ha messo.
 * @param {ParentNode} radice `#schermoImpostazioni`
 * @param {object[]} ricevute da `GET /api/v1/app-settings/changes`
 * @param {{ onAnnulla?: (receiptId: string, chiave: string, segno: HTMLElement) => void, adesso?: Date, document?: Document }} opzioni
 */
export function montaSegniImpostazioni(radice, ricevute, { onAnnulla = null, adesso = new Date(), document: doc = radice?.ownerDocument ?? globalThis.document } = {}) {
  if (!radice) return 0;
  for (const vecchio of radice.querySelectorAll('[data-segno-impostazione]')) vecchio.remove();
  let messi = 0;
  for (const [chiave, ricevuta] of segniDalleRicevute(ricevute)) {
    const ancora = ancoraNelleImpostazioni(chiave);
    const bersaglio = ancora ? radice.querySelector(ancora.selettore) : null;
    const testo = testoDelSegno(ricevuta, adesso);
    if (!bersaglio || !testo || !nomeImpostazione(chiave)) continue;
    const segno = el(doc, 'p', 'talos-setting__help talos-impostazione__segno');
    segno.dataset.segnoImpostazione = chiave;
    segno.dataset.ricevuta = ricevuta.id;
    segno.setAttribute('role', 'status');
    const b = bottone(doc, 'talos-button talos-button--ghost talos-button--sm talos-impostazione__annulla', t('appSettings.row.undo'));
    b.dataset.annullaImpostazioni = 'segno';
    b.addEventListener('click', () => { if (b.disabled) return; b.disabled = true; onAnnulla?.(ricevuta.id, chiave, segno); });
    segno.append(el(doc, 'span', 'talos-dot talos-dot--sm talos-impostazione__punto'), el(doc, 'span', '', `${testo} · `), b);
    if (ancora.riga) (bersaglio.firstElementChild ?? bersaglio).append(segno);
    else bersaglio.after(segno);
    messi += 1;
  }
  return messi;
}

/* ───────────────────────── 4. la notifica `impostazioni` ───────────────────────── */

/**
 * La frase e il dato della voce del registro (`fatto:'impostazioni'`, `impostazioni:{ricevuta, cambi[{chiave, prima, dopo}],
 * confermatoDa}`, `azione:'set'|'undo'`): «Ha cambiato N impostazioni:» e i nomi; «da un dispositivo» solo se il sì è venuto da lì.
 * Un nome che il catalogo non sa non si scrive; senza nessun nome la frase resta senza i due punti. `null` senza cambi.
 */
export function fraseDellaNotificaImpostazioni(voce) {
  const cambi = cambiDi(voce?.impostazioni?.cambi);
  const n = cambi.length;
  if (!n) return null;
  const daDispositivo = voce.impostazioni?.confermatoDa?.tipo === 'dispositivo';
  /* giro 2, voce 2 (02/11/2026): la PERSONA dal dispositivo (`impostazioni.origine`, lo scrive solo lei) — non «Ha cambiato…», che è il modello */
  const dallaPersonaDalDispositivo = voce.impostazioni?.origine?.tipo === 'dispositivo';
  const frase = voce.azione === 'undo' ? tn('appSettings.notification.undoneOne', 'appSettings.notification.undoneMany', n)
    : dallaPersonaDalDispositivo ? tn('appSettings.notification.fromYourDeviceOne', 'appSettings.notification.fromYourDeviceMany', n)
    : daDispositivo ? tn('appSettings.notification.changedFromDeviceOne', 'appSettings.notification.changedFromDeviceMany', n)
      : tn('appSettings.notification.changedOne', 'appSettings.notification.changedMany', n);
  const nomi = [...new Set(cambi.map((c) => nomeImpostazione(c.chiave)).filter(Boolean))].join(', ');
  return { frase, nomi };
}

/* ───────────────────────── 5. /settings nel compositore ───────────────────────── */

const valoriAmmessi = (v) => (v?.type === 'sino' ? ['true', 'false'] : Array.isArray(v?.values) ? v.values.map(String) : null);

/*
 * 02/11/2026 — `/settings` della persona APPLICA (`POST /api/v1/app-settings/apply`, forma FORMA-SETTINGS-DELLA-PERSONA). Un rifiuto del
 *   server si dice NELL'ELENCO come oggi (decisione 7), sotto lo stesso testo: vale finché il compositore porta quel testo, e non blocca un
 *   nuovo invio (un guasto passeggero si riprova; una voce o un valore sbagliati li ferma già il catalogo qui sotto).
 */
let rifiutoDelServer = null;

/**
 * Revisione della CLI, F1 (02/11/2026 notte): un server avviato SENZA gettone (da sorgente, come il 4174) non può distinguere la finestra da
 * un programma locale, e rifiuta le voci a carta sempre con `PC_CONFIRMATION_REQUIRED` e il motivo `card-required`. ⇒ Quel rifiuto non si
 * dice nell'elenco: il comando va al MODELLO come un messaggio, e il modello passa dalla carta (decisione del Desktop: la persona ottiene
 * comunque il cambio, con la carta). Il rifiuto del ponte (`pc-confirmation-required`) qui non arriva mai: è del dispositivo.
 */
export function rifiutoCheVaAlModello(errore) {
  const code = errore?.problem?.code ?? errore?.code;
  const motivo = errore?.problem?.reason ?? errore?.reason;
  return code === 'PC_CONFIRMATION_REQUIRED' && motivo === 'card-required';
}
/** Ricorda (o dimentica, senza argomenti) la frase del rifiuto del server per QUESTO testo del compositore. */
export function ricordaRifiutoImpostazioni(testo = null, frase = null) {
  rifiutoDelServer = typeof testo === 'string' && testo.trim() && typeof frase === 'string' && frase.trim() ? { testo: testo.trim(), frase: frase.trim() } : null;
}

/**
 * Il comando COMPLETO da applicare: `/settings <voce>=<valore>`, con la voce nel catalogo e il valore fra quelli ammessi (un id di modello
 * lo convalida il server). ⇒ `{ chiave, valore, changes:[{key, value}] }` col valore nel tipo del catalogo (sì/no ⇒ booleano; `null` solo
 * dove la voce lo ammette), o `null`: un comando a metà resta nel compositore con il suo elenco.
 */
export function comandoImpostazioniDaApplicare(testo) {
  const m = /^\/settings\s+([\s\S]*)$/u.exec(String(testo ?? '').trim());
  if (!m || !catalogoImpostazioniCaricato()) return null;
  const uguale = m[1].indexOf('=');
  if (uguale < 0) return null;
  const chiave = m[1].slice(0, uguale).trim();
  const scritto = m[1].slice(uguale + 1).trim();
  const v = catalogo.get(chiave);
  if (!v || !scritto) return null;
  const ammessi = valoriAmmessi(v);
  if (ammessi && !ammessi.includes(scritto)) return null;
  const valore = v.type === 'sino' ? scritto === 'true' : (scritto === 'null' && v.nullable === true ? null : scritto);
  return { chiave, valore, changes: [{ key: chiave, value: valore }] };
}

/**
 * La NOTA della persona dopo `/settings` applicato (decisione 8 dell'owner, «esito di /settings come nota della persona»; bozzetto
 *   `pc.js:441-446`, variante A): `creaNotaSistema` col badge «Nota», il titolo «Hai cambiato N impostazioni», una riga per cambio
 *   «nome: prima → dopo · dove vale», e la riga d'azioni con «Annulla» (`talos-button--secondary --sm`, come `compattazione-legacy.js`).
 *   Annullato ⇒ il titolo dice «Annullato…» e l'Annulla sparisce (bozzetto `pc.js:445`). `cambi` è quello della risposta della rotta.
 * ⇒ `{ nodo, annullata(), rifiutata(chiave), riprova() }`, o `null` senza un cambio con un nome.
 */
export function creaNotaImpostazioniDellaPersona(doc, { cambi } = {}, { onAnnulla = null } = {}) {
  const righe = cambiDi(cambi).map((c) => {
    const nome = nomeImpostazione(c.chiave);
    const ambito = parolaAmbito(c.ambito);
    return nome ? `${nome}: ${valoreInParole(c.chiave, c.prima)} → ${valoreInParole(c.chiave, c.dopo)}${ambito ? ` · ${ambito}` : ''}` : null;
  }).filter(Boolean);
  if (!righe.length) return null;
  const n = cambiDi(cambi).length;
  const nodo = creaNotaSistema({ tipo: 'info', badge: t('chat.note.badge'), titolo: tn('appSettings.note.youChangedOne', 'appSettings.note.youChangedMany', n), testo: righe.join('\n') }, { document: doc });
  nodo.dataset.impostazioniDellaPersona = '';
  const corpo = nodo.querySelector(':scope > div'); // il corpo di `creaNotaSistema` (titolo e testo), dopo il badge
  const azioni = el(doc, 'div', 'talos-cluster talos-system-note__azioni');
  const b = bottone(doc, 'talos-button talos-button--secondary talos-button--sm', t('appSettings.row.undo'));
  b.dataset.annullaImpostazioni = 'nota';
  b.addEventListener('click', () => { if (b.disabled) return; b.disabled = true; onAnnulla?.(); }); // Hermes: «Undo» spento in volo
  azioni.append(b);
  corpo.append(azioni);
  const titolo = corpo.querySelector('.talos-system-note__title');
  return {
    nodo,
    annullata: () => { if (titolo) titolo.textContent = tn('appSettings.row.undoneOne', 'appSettings.row.undoneMany', n); azioni.remove(); nodo.dataset.impostazioniAnnullate = ''; },
    rifiutata: (chiave) => segnaNonAnnullato(corpo, chiave, { document: doc, dove: (riga) => azioni.before(riga) }),
    riprova: () => { b.disabled = false; },
  };
}

/**
 * Giro 2 delle cure, voce 3 (02/11/2026 notte, scelta del Desktop per l'owner): `/settings` con il valore GIÀ uguale — il server non scrive
 *   (`ricevuta: null`, `gia: [chiave…]`) e prima il compositore si svuotava senza dire niente. Ora una nota come quella del cambio (stesso
 *   `creaNotaSistema`, badge «Nota»), col titolo «Già così» e la riga «nome: valore», senza Annulla (non c'è niente da annullare).
 *   `valori`: chiave → valore pubblico che la persona ha scritto (lo sa il compositore). ⇒ il nodo, o `null` senza un nome dal catalogo.
 */
export function creaNotaImpostazioniGiaCosi(doc, { gia, valori = {} } = {}) {
  const righe = (Array.isArray(gia) ? gia : []).filter((k) => typeof k === 'string').map((chiave) => {
    const nome = nomeImpostazione(chiave);
    return nome ? (Object.hasOwn(valori ?? {}, chiave) ? `${nome}: ${valoreInParole(chiave, valori[chiave])}` : nome) : null;
  }).filter(Boolean);
  if (!righe.length) return null;
  const nodo = creaNotaSistema({ tipo: 'info', badge: t('chat.note.badge'), titolo: t('appSettings.note.alreadySet'), testo: righe.join('\n') }, { document: doc });
  nodo.dataset.impostazioniGiaCosi = '';
  return nodo;
}

/**
 * Le voci dell'elenco sopra il compositore dopo `/settings ` (il suggerimento di `/goal`, allargato): prima le voci del catalogo
 * (chiave · nome · dove vale), filtrate mentre scrivi; dopo `=`, i valori ammessi con la parola delle Impostazioni. Un valore che
 * nessuna scelta può completare si dice NELL'ELENCO (decisione 7), con una riga non sceglibile. `null` fuori da `/settings `.
 * Un rifiuto del SERVER per questo stesso testo (`ricordaRifiutoImpostazioni`) si dice nella stessa riga, con `dalServer: true`.
 * ⇒ `{ fase:'voci'|'valori', chiave?, voci:[{id, nome, aiuto, metti, completo?}], errore?, dalServer? }`
 */
export function suggerimentiImpostazioni(testo) {
  const detto = suggerimentiDelCatalogo(testo);
  if (!detto || detto.errore || !rifiutoDelServer || rifiutoDelServer.testo !== String(testo ?? '').trim()) return detto;
  return { ...detto, errore: rifiutoDelServer.frase, dalServer: true };
}
function suggerimentiDelCatalogo(testo) {
  const m = /^\/settings\s+([\s\S]*)$/u.exec(String(testo ?? ''));
  if (!m || !catalogoImpostazioniCaricato()) return null;
  const resto = m[1].trimStart();
  const uguale = resto.indexOf('=');
  if (uguale < 0) {
    const cerca = resto.trim().toLowerCase();
    const voci = [...catalogo.values()]
      .filter((v) => !cerca || v.key.toLowerCase().startsWith(cerca) || String(nomeImpostazione(v.key) ?? '').toLowerCase().includes(cerca))
      .map((v) => ({ id: `impostazione-${v.key.replace(/[^A-Za-z0-9]/gu, '-')}`, nome: v.key,
        aiuto: [nomeImpostazione(v.key), parolaAmbito(v.scope)].filter(Boolean).join(' · '), metti: `/settings ${v.key}=` }))
      .filter((v) => v.aiuto);
    return { fase: 'voci', voci };
  }
  const chiave = resto.slice(0, uguale).trim();
  const valore = resto.slice(uguale + 1).trim();
  const v = catalogo.get(chiave);
  if (!v) return { fase: 'valori', chiave, voci: [], errore: t('appSettings.command.noSetting', { key: chiave }) };
  const ammessi = valoriAmmessi(v);
  if (!ammessi) return { fase: 'valori', chiave, voci: [] }; // un id di modello: niente elenco, lo convalida chi lo scrive
  const nome = nomeImpostazione(chiave) ?? chiave;
  const buoni = ammessi.filter((x) => x.startsWith(valore));
  if (!buoni.length) return { fase: 'valori', chiave, voci: [], errore: t('appSettings.command.badValue', { value: valore, setting: nome, allowed: ammessi.join(', ') }) };
  return {
    fase: 'valori', chiave,
    voci: buoni.map((x) => ({ id: `valore-${x.replace(/[^A-Za-z0-9]/gu, '-')}`, nome: x,
      aiuto: valoreInParole(chiave, v.type === 'sino' ? x === 'true' : x), metti: `/settings ${chiave}=${x}`, completo: x === valore })),
  };
}
