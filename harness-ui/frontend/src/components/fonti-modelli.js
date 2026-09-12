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
 * ⭐ Il tetto delle schede (Apple HIG via eleken.co, già citato in `app.js` il 03/9): oltre sei
 *   l'utente si perde. Dal 12/09 (P-C) sono SEI — OpenRouter · Locali · Anthropic · Gemini ·
 *   OpenAI · LM Studio. P-D aggiunge Z.AI su richiesta esplicita, solo quando collegato;
 *   il layout con sette fonti resta da verificare nella UI completa.
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
