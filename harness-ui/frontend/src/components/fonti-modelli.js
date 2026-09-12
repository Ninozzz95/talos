/*
 * BC-12 — LE SCHEDE DEL SELETTORE MODELLI: «Diretti» si spezza per fornitore.
 *
 * ## Che cosa ha chiesto l'owner, e che cosa c'era prima
 *
 * Owner 11/09/2026: «diretti deve diventare per provider, quindi una tab dedicata per gemini
 * openai e anthropic». Prima c'erano tre schede — OpenRouter · Locali · Diretti — e dentro
 * «Diretti» i tre fornitori erano gruppi richiudibili: per arrivare a un modello Anthropic
 * servivano due gesti (apri la scheda, apri il gruppo) e un conteggio solo, 113, che non diceva
 * quanti ne avesse ciascuno.
 *
 * ## Ricerca prima di scrivere (11/09/2026) — letta nel CODICE dei concorrenti, non nei blog
 *
 * ⭐ Hermes Agent v0.21 (`apps/desktop/src/components/model-picker.tsx`, clone a commit fissato in
 *   `%LOCALAPPDATA%\Temp\talos-competitor`): un solo elenco cercabile in cui OGNI fornitore è un
 *   `CommandGroup` di primo livello, con intestazione `nome` + `slug · numero di modelli`. Non
 *   esiste nessun contenitore «diretti»: il fornitore È l'asse. E i fornitori senza chiave non
 *   compaiono fra i selezionabili — si passa da un'azione esplicita «Add provider».
 * ⭐ opencode (`packages/app/src/components/dialog-select-model.tsx`): stessa scelta —
 *   `groupBy(provider.name)` dentro un elenco unico, più un parametro `provider` che restringe la
 *   vista a UN fornitore solo. Anche qui nessun ombrello «diretti».
 * ⇒ Nessuno dei due mette i fornitori sotto un contenitore: la richiesta dell'owner è lo stato
 *   dell'arte, non un gusto. Qui diventano SCHEDE perché la striscia delle fonti esiste già ed è
 *   il posto dove questa app fa scegliere «da dove»; il gruppo richiudibile resta per l'AUTORE del
 *   modello dentro OpenRouter, che è un asse diverso (51 famiglie: quelle non sono schede).
 * BC-50, 12/09/2026: nessun tetto artificiale ai fornitori collegati. Apple HIG «Tab views»
 *   raccomanda un'altra presentazione oltre sei; Material «Tabs» ammette una riga scorrevole.
 *   Misurati 8/12 fornitori: a 1024 nella nuova sessione quattro righe occupavano 141 px,
 *   lasciando 54,5 px ai modelli. Ora la striscia scorre senza comprimere le schede, con ombre ai capi
 *   e barra visibile (`mockup-td.css`). Frecce/Home/End e tabindex mobile restano quelli del
 *   picker condiviso; il focus porta in vista anche l'ultima fonte. Nessun gruppo «Altri».
 *   Fonti, misure e limiti: `.claude/RAPPORTO-BC50-BC51-2026-09-12.md` nell'harness.
 *
 * ## I tre stati di un fornitore diretto, che prima erano uno solo
 *
 * ⛔ `caricaDiretti` appiattiva tutto in una lista sola e in un array di errori: «nessun modello»
 *   e «nessuna chiave» finivano indistinguibili, e il pannello diceva a tutti la stessa frase.
 *   Sono TRE stati diversi e vogliono tre risposte diverse (è la lezione «gli stati sono TRE»):
 *     · chiave non collegata → niente conteggio, e si dice DOVE si collega;
 *     · catalogo letto, zero modelli → conteggio 0, ed è un fatto, non un errore;
 *     · catalogo non raggiungibile → il messaggio del fornitore, per esteso.
 *
 * ⛔ Perché la scheda resta anche senza chiave: è la stessa scelta già motivata in `app.js` per la
 *   scheda «Locali» — la scheda esiste, risponde alla domanda vera («dove sono i miei modelli
 *   Anthropic?») e dichiara il limite invece di nasconderlo. Nasconderla farebbe sparire la
 *   domanda insieme alla risposta.
 */

/**
 * I fornitori con un catalogo proprio, nell'ordine in cui si presentano. Gli id sono quelli del
 * server, cioe quelli del registro.
 *
 * ⛔⛔ 12/09 — QUESTO ELENCO E UNA COPIA, E LO SI DICE. Il frontend si impacchetta a parte e non
 *   puo importare `src/provider-registry.mjs`, che e codice di server: quei nomi vivono quindi in
 *   due posti. ⇒ `tests/provider-registry-parita.test.mjs` importa **questo file** e il registro e
 *   fallisce se divergono, in tutti e due i versi. E' lo stesso contratto che Hermes presidia in
 *   `hermes_cli/provider_catalog.py:35` — «l'unione delle schede della GUI e uguale all'universo
 *   del picker» — nato li perche prima «ogni provider aggiunto dopo che quelle liste sono state
 *   scritte spariva in silenzio dalla GUI». Senza il test, questa riga e' la prossima bugia.
 *
 * ⭐ 12/09, P-C — LM Studio entra qui: e' scoperto, sondato, caricabile e scaricabile dal 90% del
 *   lavoro gia' fatto, e finalmente ha una scheda dove i suoi modelli si scelgono. ⛔ Non chiede
 *   una chiave: `caricaDiretti` non deve pretenderla, o la scheda resterebbe vuota per sempre.
 */
import { prezzoPerMilione } from './catalogo-modelli.js';

/** BC-50: il picker ricrea i pulsanti a ogni scelta. Il roving tabindex resta nel chiamante;
 * qui il nuovo pulsante focalizzato viene anche portato in vista, senza animazione.
 * In Chromium 151 il solo focus() lasciava Home fuori dalla striscia (BC50-03 del banco).
 * Un listener delegato del modulo serve entrambi i picker, anche dopo rimozione/rimontaggio. */
function portaInVistaFonteSelettore(evento) {
  const scheda = evento.target;
  if (!scheda?.matches?.('.model-picker-source[role="tab"]')
    || !scheda.parentElement?.matches('.model-picker-sources[role="tablist"]')) return;
  scheda.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant', container: 'nearest' });
}
if (typeof document !== 'undefined') document.addEventListener('focusin', portaInVistaFonteSelettore);

/** I dati arrivano dal registro pubblico: nessuna capacità inventata dal selettore. */
export function opzioniFallback(fornitori=[], {usaAttrezzi=true}={}) {
  return fornitori.filter(p=>p.keyConfigured===true).flatMap(p=>(p.modelliDiRiserva||[])
    .filter(m=>!usaAttrezzi||m.toolCalling===true)
    .map(m=>({provider:p.id,model:m.id,etichetta:`${p.label||p.id} · ${m.nome||m.id}`})));
}

/** Scelta opzionale riusabile nella modale e nella pillola; onChange collega la sessione. */
export function creaSceltaFallback({fornitori=[],valore=[],usaAttrezzi=true,onChange=null}={}) {
  // 12/09, review P-H: stesso linguaggio dei gruppi «Planner opzionale» / «Accesso al workspace»
  // (etichetta `sheet-label` + controllo + aiuto), niente fieldset con la legenda sul bordo.
  const wrap=document.createElement('div');wrap.className='talos-stack talos-scelta-riserve';wrap.setAttribute('role','group');wrap.setAttribute('aria-label','Se non risponde, continua con…');Object.assign(wrap.style,{minWidth:'0',margin:'16px 0 0',gap:'8px'});
  const etichetta=document.createElement('span');etichetta.className='sheet-label';etichetta.textContent='Se non risponde, continua con…';wrap.append(etichetta);
  const selezione=valore.map(({provider,model})=>({provider,model}));
  const scelte=opzioniFallback(fornitori,{usaAttrezzi});
  const lista=document.createElement('ol');lista.className='talos-stack';
  const select=document.createElement('select');select.className='talos-field__input';select.setAttribute('aria-label','Fornitore e modello con cui continuare');
  Object.assign(select.style,{flex:'1',minWidth:'0'});select.disabled=typeof onChange!=='function';
  const vuota=document.createElement('option');vuota.value='';vuota.textContent='Nessuno';select.append(vuota);
  for(const [i,o]of scelte.entries()){const option=document.createElement('option');option.value=String(i);option.textContent=o.etichetta;select.append(option);}
  const aggiungi=document.createElement('button');aggiungi.type='button';aggiungi.className='talos-button talos-button--secondary talos-button--sm';aggiungi.textContent='Aggiungi';
  const notifica=()=>onChange?.(selezione.map(v=>({...v})));
  function disegna(){
    lista.hidden=selezione.length===0;
    lista.replaceChildren(...selezione.map((v,i)=>{
      const li=document.createElement('li');li.className='talos-cluster';
      const label=document.createElement('span');label.textContent=scelte.find(o=>o.provider===v.provider&&o.model===v.model)?.etichetta||'Scelta non disponibile: rimuovila e scegline un’altra';
      const rimuovi=document.createElement('button');rimuovi.type='button';rimuovi.className='talos-button talos-button--ghost talos-button--sm';rimuovi.textContent='Rimuovi';rimuovi.setAttribute('aria-label','Rimuovi '+label.textContent);rimuovi.disabled=typeof onChange!=='function';
      rimuovi.addEventListener('click',()=>{selezione.splice(i,1);notifica();disegna();select.focus();});li.append(label,rimuovi);return li;
    }));
    for(const [i,option]of [...select.options].slice(1).entries())option.disabled=selezione.some(v=>v.provider===scelte[i].provider&&v.model===scelte[i].model);
    aggiungi.disabled=typeof onChange!=='function'||!scelte.length||select.value===''||selezione.length>=8;
  }
  select.addEventListener('change',disegna);
  aggiungi.addEventListener('click',()=>{const scelta=scelte[Number(select.value)];if(!scelta||select.value===''||selezione.length>=8||selezione.some(v=>v.provider===scelta.provider&&v.model===scelta.model))return;selezione.push({provider:scelta.provider,model:scelta.model});select.value='';notifica();disegna();select.focus();});
  const nota=document.createElement('small');nota.className='workspace-chooser-help talos-muted';nota.textContent=typeof onChange!=='function'?'La scelta non è ancora collegata a questa sessione.':'Il cambio viene annunciato in chat. La conversazione continua con i fornitori scelti, nell’ordine indicato.';
  const azioni=document.createElement('div');azioni.className='talos-cluster';azioni.append(select,aggiungi);
  wrap.append(lista,azioni,nota);disegna();return wrap;
}

export const PROVIDER_DIRETTI = Object.freeze([
  Object.freeze({ id: 'anthropic', etichetta: 'Anthropic' }),
  Object.freeze({ id: 'gemini', etichetta: 'Gemini' }),
  Object.freeze({ id: 'openai', etichetta: 'OpenAI' }),
  Object.freeze({ id: 'lmstudio', etichetta: 'LM Studio', senzaChiave: true }),
  Object.freeze({ id: 'zai', etichetta: 'Z.AI', soloSeCollegato: true }),
  Object.freeze({ id: 'deepseek', etichetta: 'DeepSeek', soloSeCollegato: true }),
  Object.freeze({ id: 'groq', etichetta: 'Groq', soloSeCollegato: true }),
  Object.freeze({ id: 'cerebras', etichetta: 'Cerebras', soloSeCollegato: true }),
  Object.freeze({ id: 'mistral', etichetta: 'Mistral', soloSeCollegato: true }),
  Object.freeze({ id: 'together', etichetta: 'Together', soloSeCollegato: true }),
  Object.freeze({ id: 'fireworks', etichetta: 'Fireworks', soloSeCollegato: true }),
  Object.freeze({ id: 'deepinfra', etichetta: 'DeepInfra', soloSeCollegato: true }),
  Object.freeze({ id: 'novita', etichetta: 'Novita', soloSeCollegato: true }),
  Object.freeze({ id: 'nebius', etichetta: 'Nebius', soloSeCollegato: true }),
  Object.freeze({ id: 'xai', etichetta: 'xAI', soloSeCollegato: true }),
  Object.freeze({ id: 'ollama-cloud', etichetta: 'Ollama Cloud', soloSeCollegato: true }),
  Object.freeze({ id: 'huggingface', etichetta: 'Hugging Face', soloSeCollegato: true }),
  Object.freeze({ id: 'kimi', etichetta: 'Kimi', soloSeCollegato: true }),
  Object.freeze({ id: 'minimax', etichetta: 'MiniMax', soloSeCollegato: true }),
  Object.freeze({ id: 'qwen', etichetta: 'Qwen', soloSeCollegato: true }),
]);

/** Vero se quel fornitore si legge senza collegare nessuna chiave (i motori locali). */
export function senzaChiave(fonte) {
  return PROVIDER_DIRETTI.some((p) => p.id === fonte && p.senzaChiave === true);
}

const ID_DIRETTI = new Set(PROVIDER_DIRETTI.map((p) => p.id));

/** Vero se la scheda è uno dei tre fornitori diretti (e non OpenRouter o i locali). */
export function eFonteDiretta(fonte) {
  return ID_DIRETTI.has(String(fonte || ''));
}

/**
 * @typedef {object} Cataloghi
 * @property {Array|null} openrouter i modelli di OpenRouter (`null` = non ancora letti)
 * @property {Array|null} locali i modelli installati su questo computer (`null` = non ancora letti)
 * @property {Record<string, Array|null>|null} diretti per fornitore: array di modelli, `null` se la
 *   chiave non è collegata (che NON è «zero modelli»), l'intera mappa `null` se non si è ancora letto
 */

/**
 * La striscia delle schede: etichetta e conteggio VERI, mai un numero fisso.
 *
 * `conto` è `null` quando il numero non si sa ancora (catalogo in lettura) oppure quando non può
 * esistere (chiave non collegata): in tutti e due i casi la pillola del conteggio non si disegna,
 * perché uno zero inventato è peggio di nessun numero.
 *
 * @param {Cataloghi} cataloghi
 * @returns {Array<{id:string, etichetta:string, conto:number|null, collegato:boolean}>}
 */
export function fontiDelSelettore({ openrouter = null, locali = null, diretti = null } = {}) {
  const etichetta = (nome, modelli) => modelli?.some(m => m.catalogo?.fonte === 'riserva')
    ? `${nome} · elenco di riserva` : nome;
  const fonti = [
    { id: 'openrouter', etichetta: etichetta('OpenRouter', openrouter), conto: contaOppureNull(openrouter), collegato: true },
    { id: 'locali', etichetta: 'Locali', conto: contaOppureNull(locali), collegato: true },
  ];
  for (const provider of PROVIDER_DIRETTI) {
    const elenco = diretti ? diretti[provider.id] : null;
    // P-D: Z.AI diventa disponibile dopo il caricamento con una chiave presente.
    if (provider.soloSeCollegato && !Array.isArray(elenco)) continue;
    fonti.push({
      id: provider.id,
      etichetta: etichetta(provider.etichetta, elenco),
      conto: contaOppureNull(elenco),
      // `collegato` è falso solo quando SAPPIAMO che la chiave manca: prima di leggere non si accusa.
      collegato: !diretti || Array.isArray(elenco),
    });
  }
  return fonti;
}

/** I modelli della scheda scelta, o `null` se quel catalogo non è ancora stato letto. */
export function modelliDellaFonte(fonte, { openrouter = null, locali = null, diretti = null } = {}) {
  if (fonte === 'openrouter') return openrouter;
  if (fonte === 'locali') return locali;
  if (!eFonteDiretta(fonte)) return null;
  if (!diretti) return null;
  const elenco = diretti[fonte];
  return Array.isArray(elenco) ? elenco : null;
}

/**
 * Che cosa dire quando la scheda di un fornitore diretto non ha righe da mostrare.
 *
 * ⛔ Tre stati, tre frasi: una sola frase per tutti è il difetto che questo modulo esiste per
 *   togliere. E ogni frase dice il passo successivo, non solo il fatto.
 *
 * @param {string} fonte l'id del fornitore
 * @param {{diretti: Record<string, Array|null>|null, errori?: Record<string, string>}} stato
 * @returns {string}
 */
export function fraseVuotoDiretto(fonte, { diretti = null, errori = {} } = {}) {
  const etichetta = PROVIDER_DIRETTI.find((p) => p.id === fonte)?.etichetta || fonte;
  if (errori && errori[fonte]) return `Catalogo ${etichetta} non disponibile: ${errori[fonte]}`;
  if (!diretti) return `Leggo il catalogo ${etichetta}…`;
  if (!Array.isArray(diretti[fonte])) {
    /* ⛔ Un motore locale non ha una chiave da collegare: dirgli di collegarla manderebbe la
       persona a cercare una pagina che non esiste. Il passo successivo e' un altro: accenderlo. */
    return senzaChiave(fonte)
      ? `${etichetta} non risponde su questo computer: avvialo e ricarica.`
      : `Collega la chiave ${etichetta} dal pannello Provider per vedere i suoi modelli.`;
  }
  return `Nessun modello ${etichetta} disponibile con questa chiave.`;
}

function contaOppureNull(elenco) {
  return Array.isArray(elenco) ? elenco.length : null;
}

/** Dettagli per la scelta, non spesa del giro. Riusa il formato monetario italiano del catalogo. */
export function descrizioneModelloSelettore(modello = {}) {
  const numero = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0, useGrouping: true });
  const prezzo = valore => {
    const testo = prezzoPerMilione(valore);
    return testo === 'Non dichiarato' ? 'non disponibile' : `${testo}/M token`;
  };
  const capacita = valore => valore === true ? 'sì' : valore === false ? 'no' : 'non disponibile';
  const dettagli = [
    `Contesto: ${Number.isFinite(modello.contextLength) && modello.contextLength > 0 ? `${numero.format(modello.contextLength)} token` : 'non disponibile'}`,
    `Ingresso: ${prezzo(modello.prezzoPrompt)}`,
    `Uscita: ${prezzo(modello.prezzoCompletion)}`,
    `Rilettura: ${prezzo(modello.prezzoCacheRead)}`,
    `Memorizzazione: ${prezzo(modello.prezzoCacheWrite)}`,
    `Strumenti: ${capacita(modello.capacita?.toolCall)}`,
    `Ragionamento: ${capacita(modello.capacita?.reasoning)}`,
  ];
  if (modello.alias) dettagli.unshift('Ultima versione');
  if (modello.prezziPerMilione?.tiers?.length || modello.prezziPerMilione?.context_over_200k) dettagli.push('Prezzi variabili con il contesto');
  if (modello.catalogo?.fonte === 'riserva') {
    const data = modello.catalogo.dataRiserva;
    const parti = typeof data === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/u.exec(data);
    dettagli.unshift(`Catalogo non raggiungibile: elenco di riserva${parti ? ` del ${parti[3]}/${parti[2]}/${parti[1]}` : ''}`);
    if (modello.catalogo.avvisi?.some(a => a.codice === 'CATALOG_CACHE_CORRUPT')) dettagli.push('Copia danneggiata rifiutata');
    return dettagli.join(' · ');
  }
  const data = modello.catalogo?.aggiornatoAlle;
  dettagli.push(typeof data === 'string' && Number.isFinite(Date.parse(data))
    ? `Dati del ${new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome' }).format(new Date(data))}`
    : 'Data del catalogo non disponibile');
  if (modello.catalogo?.fallbackRete) {
    const etaMs = modello.catalogo.etaCacheMs;
    dettagli.push(`Copia salvata: ${Number.isFinite(etaMs) && etaMs >= 0 ? `${numero.format(Math.floor(etaMs / 1000))} secondi al caricamento` : 'età non disponibile'}`);
  }
  if (modello.catalogo?.avvisi?.some(a => a.codice === 'CATALOG_CACHE_CORRUPT')) dettagli.push('Copia danneggiata rifiutata');
  if (modello.catalogo?.avvisi?.some(a => a.codice === 'CATALOG_CACHE_WRITE_FAILED')) dettagli.push('Salvataggio del catalogo non disponibile');
  return dettagli.join(' · ');
}

/** Il chiamante conserva il pulsante e i gesti: questo frammento scrive soltanto testo sicuro. */
export function aggiornaTestoModelloSelettore(contenitore, modello) {
  const nome = contenitore.ownerDocument.createElement('strong');
  nome.textContent = modello.nome || 'Nome non disponibile';
  const dettagli = contenitore.ownerDocument.createElement('small');
  dettagli.textContent = descrizioneModelloSelettore(modello);
  contenitore.replaceChildren(nome, dettagli);
}
