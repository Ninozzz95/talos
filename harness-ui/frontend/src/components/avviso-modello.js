/*
 * FE-040, bozzetto 4 («La finestra», «Prova un caso»): l'avviso sotto il modello nella finestra Nuova sessione.
 *
 * Regola della tabella del Desktop (31/10): «si fanno quelli con un dato vero». Qui ogni avviso nasce da un dato letto, e un dato non letto non diventa mai
 * un'accusa: `null` significa «non lo so» e si tace. Il server resta l'ultima parola: un modello senza avviso che poi non parte dà l'errore di sempre.
 *
 * Che cosa NON c'è, e perché:
 *  · «{fornitore} ha raggiunto il limite» per un fornitore qualsiasi: prima di partire un dato c'è solo per il piano ChatGPT (`limiti`, intestazioni del servizio).
 *    Consegna: «L'ora di riapertura solo col piano ChatGPT».
 *  · «Libera memoria» come pulsante: non esiste un comando che la liberi da qui, e un pulsante senza comando è una funzione finta.
 *  · «L'accesso con ChatGPT è scaduto» secco: quando l'accesso scade il server toglie la sessione (`chatgpt-accesso.mjs`), e `collegato:false` è uguale a chi è
 *    uscito apposta. La frase dice le due cose.
 *
 * La fonte si legge come sul server (`separaFonteModello`, `src/model-destination.mjs`): `fonte:modello` solo se la fonte è conosciuta, altrimenti OpenRouter.
 */
import { t } from './lingua.js';
import { PROVIDER_DIRETTI, nomeFornitore } from './fonti-modelli.js';

const ID_DIRETTI = new Set(PROVIDER_DIRETTI.map((p) => p.id));
const SENZA_CHIAVE = new Set(PROVIDER_DIRETTI.filter((p) => p.senzaChiave).map((p) => p.id));

/** Da dove arriva un modello: `openrouter`, `diretto`, `local`, o `altro` per ciò che qui non si conosce (e che quindi non si accusa mai). */
export function fonteDelValore(valore) {
  if (typeof valore !== 'string' || valore.trim() === '') return null;
  const taglio = valore.indexOf(':');
  const prima = taglio > 0 ? valore.slice(0, taglio) : '';
  if (!prima || prima.includes('/')) return { tipo: 'openrouter', id: 'openrouter' }; // `meta/llama:free`: i due punti stanno dopo la barra, è un id di OpenRouter
  if (prima === 'local') return { tipo: 'local', id: valore.slice(taglio + 1) };
  return ID_DIRETTI.has(prima) ? { tipo: 'diretto', id: prima } : { tipo: 'altro', id: prima };
}

/** Il modello che partirebbe: la scelta nel selettore, o quello della chat. */
export function usaModelloPrimaDiPartire(scelto, dellaChat) { return scelto || dellaChat || ''; }

const elencoVero = (catalogo) => {
  const modelli = catalogo?.modelli ?? catalogo;
  if (!Array.isArray(modelli) || modelli.length === 0) return null; // vuoto o non letto: non è un verdetto
  if (catalogo?.fallbackRete === true || modelli.some((m) => m?.catalogo?.fonte === 'riserva')) return null; // copia vecchia o lista corta di riserva: non prova che un modello manchi
  return modelli;
};

function dellaFonte(fonte, { catalogoOpenrouter, cataloghiDiretti }) {
  if (fonte.tipo === 'openrouter') return catalogoOpenrouter;
  return fonte.tipo === 'diretto' ? cataloghiDiretti?.[fonte.id] : null;
}

function senzaChiave(fonte, fornitori) {
  if (fonte.tipo === 'local' || fonte.tipo === 'altro' || fonte.id === 'chatgpt' || SENZA_CHIAVE.has(fonte.id)) return false;
  const voce = Array.isArray(fornitori) ? fornitori.find((p) => p?.id === fonte.id) : null;
  return voce?.keyConfigured === false;
}

function sparito(fonte, valore, dati) {
  if (fonte.tipo === 'local') return Array.isArray(dati.locali) && !dati.locali.some((m) => m?.id === fonte.id);
  const elenco = elencoVero(dellaFonte(fonte, dati));
  return elenco !== null && !elenco.some((m) => m?.id === valore);
}

function memoriaCorta(fit) {
  const richiesti = fit?.memory?.requiredBytes;
  const liberi = fit?.memory?.availableBytes;
  return fit?.state === 'blocked' && Number.isFinite(richiesti) && Number.isFinite(liberi) && richiesti > liberi ? { richiesti, liberi } : null;
}

/** L'ora in cui il limite scattato riapre, solo se è ancora futura: senza, la fotografia dei limiti non dice più niente. */
function riaperturaDelPiano(limiti, adesso) {
  if (!limiti?.scattato) return null;
  const ore = [limiti.primario?.tornaAlle, limiti.secondario?.tornaAlle].filter((x) => Number.isFinite(x) && x > adesso);
  return ore.length ? Math.max(...ore) : null;
}

function senzaStrumenti(voce) {
  if (!voce || voce.capacita?.toolCall === true) return false;
  if (voce.capacita?.toolCall === false) return true;
  return Array.isArray(voce.supportedParameters) && !voce.supportedParameters.includes('tools');
}

/* «Prima volta» del bozzetto: nessun modello scelto e niente con cui partire. Serve sapere davvero tutte e due le cose: elenco dei fornitori letto e non vuoto, locali letti. */
function nessunoCollegato({ fornitori, pianoChatgpt, locali }) {
  if (!Array.isArray(fornitori) || fornitori.length === 0 || !Array.isArray(locali) || locali.length > 0) return null;
  if (pianoChatgpt?.collegato === true || fornitori.some((p) => p?.keyConfigured === true)) return null;
  return { chiave: 'nessuno', grave: false, blocca: true, azioni: ['collega', 'altro'], titolo: t('app.workspace.alert.nobody'), sotto: t('app.workspace.alert.nobodyBody') };
}

const ora = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const byte = (b) => `${Math.round((b / 1024 ** 3) * 10) / 10} GB`;

/**
 * L'avviso da mostrare sotto il modello: uno solo, prima ciò che blocca.
 *
 * @param {object} d
 * @param {string} d.valore l'id del modello
 * @param {string} d.nome il nome da mostrare
 * @param {Array|null} [d.fornitori] `/api/v1/providers`
 * @param {object|null} [d.pianoChatgpt] `/api/v1/auth/chatgpt/stato`
 * @param {{modelli:Array, fallbackRete?:boolean}|null} [d.catalogoOpenrouter] `/api/v1/models`
 * @param {Record<string,Array|null>|null} [d.cataloghiDiretti] per fornitore
 * @param {Array|null} [d.locali] `/api/v1/local-models`
 * @param {object|null} [d.fit] `/api/v1/local-models/:id/fit`
 * @param {boolean} [d.online] `navigator.onLine`: quando dice «no» è vero, quando dice «sì» può sbagliare, quindi si usa solo il «no»
 * @returns {null|{chiave:string, grave:boolean, blocca:boolean, titolo:string, sotto:string, azioni:string[], fornitore?:string}}
 */
export function avvisoDelModello({ valore, nome, fornitori = null, pianoChatgpt = null, catalogoOpenrouter = null, cataloghiDiretti = null, locali = null, fit = null, online = true,
  adesso = Date.now(), formattaByte = byte, formattaOra = ora } = {}) {
  const fonte = fonteDelValore(valore);
  if (!fonte) return nessunoCollegato({ fornitori, pianoChatgpt, locali });
  if (fonte.tipo === 'altro') return null;
  const dati = { catalogoOpenrouter, cataloghiDiretti, locali };

  if (senzaChiave(fonte, fornitori)) {
    return { chiave: 'chiave', grave: true, blocca: true, fornitore: fonte.id, azioni: ['collega', 'altro'],
      titolo: t('app.workspace.alert.keyMissing', { provider: nomeFornitore(fonte.id) || fonte.id }), sotto: t('app.workspace.alert.keyMissingBody') };
  }
  if (fonte.id === 'chatgpt' && pianoChatgpt?.collegato === false) {
    return { chiave: 'accesso', grave: true, blocca: true, azioni: ['accedi', 'altro'], titolo: t('app.workspace.alert.signIn'), sotto: t('app.workspace.alert.signInBody') };
  }
  if (sparito(fonte, valore, dati)) {
    return { chiave: 'tolto', grave: true, blocca: true, azioni: ['altro'], titolo: t('app.workspace.alert.gone', { nome }), sotto: t('app.workspace.alert.goneBody') };
  }
  const corta = fonte.tipo === 'local' ? memoriaCorta(fit) : null;
  if (corta) {
    return { chiave: 'memoria', grave: true, blocca: false, azioni: ['altro'], sotto: t('app.workspace.alert.memoryBody'),
      titolo: t('app.workspace.alert.memory', { nome, required: formattaByte(corta.richiesti), free: formattaByte(corta.liberi) }) };
  }
  const riapre = fonte.id === 'chatgpt' ? riaperturaDelPiano(pianoChatgpt?.limiti, adesso) : null;
  if (riapre !== null) {
    return { chiave: 'limite', grave: false, blocca: false, azioni: ['altro'], titolo: t('app.workspace.alert.limit'), sotto: t('app.workspace.alert.limitBody', { ora: formattaOra(riapre) }) };
  }
  if (online === false && fonte.tipo !== 'local') {
    return { chiave: 'offline', grave: false, blocca: false, azioni: [], titolo: t('app.workspace.alert.offline'), sotto: t('app.workspace.alert.offlineBody') };
  }
  if (fonte.tipo === 'openrouter' && catalogoOpenrouter?.fallbackRete === true) {
    return { chiave: 'catalogo', grave: false, blocca: false, azioni: [], titolo: t('app.workspace.alert.catalog'), sotto: t('app.workspace.alert.catalogBody') };
  }
  const catalogo = dellaFonte(fonte, dati);
  const voce = (catalogo?.modelli ?? catalogo)?.find?.((m) => m?.id === valore);
  if (senzaStrumenti(voce)) return { chiave: 'strumenti', grave: false, blocca: false, azioni: ['altro'], titolo: t('server.runtime.notice.noTools'), sotto: '' };
  return null;
}

const TESTO_AZIONE = { collega: 'app.workspace.alert.connectKey', accedi: 'app.workspace.alert.signInAgain', altro: 'app.workspace.alert.chooseOther' };

/**
 * Disegna l'avviso nel suo riquadro, il `talos-callout` di casa. Il grave si annuncia subito, il resto si legge senza interrompere.
 * @param {HTMLElement} contenitore
 * @param {ReturnType<typeof avvisoDelModello>} avviso
 * @param {{alCollega?:Function, alAccedi?:Function, alCambia?:Function}} porte
 */
export function disegnaAvvisoModello(contenitore, avviso, { alCollega, alAccedi, alCambia } = {}) {
  if (!avviso) { contenitore.hidden = true; contenitore.replaceChildren(); return; }
  const doc = contenitore.ownerDocument;
  contenitore.hidden = false;
  contenitore.className = `talos-callout workspace-chooser-model-alert${avviso.grave ? ' talos-callout--pericolo' : ''}`;
  contenitore.setAttribute('role', avviso.grave ? 'alert' : 'status');
  const testo = doc.createElement('b');
  testo.textContent = avviso.titolo;
  const corpo = doc.createElement('span');
  corpo.append(testo);
  if (avviso.sotto) {
    const sotto = doc.createElement('small');
    sotto.textContent = avviso.sotto;
    corpo.append(sotto);
  }
  const pezzi = [corpo];
  if (avviso.azioni?.length) {
    const riga = doc.createElement('span');
    riga.className = 'workspace-chooser-model-alert__az';
    const porte = { collega: () => alCollega?.(avviso.fornitore), accedi: () => alAccedi?.(), altro: () => alCambia?.() };
    for (const azione of avviso.azioni) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'secondary-btn compact';
      b.textContent = t(TESTO_AZIONE[azione]);
      b.addEventListener('click', porte[azione]);
      riga.append(b);
    }
    pezzi.push(riga);
  }
  contenitore.replaceChildren(...pezzi);
}
