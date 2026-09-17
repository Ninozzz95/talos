/*
 * Inglese — il dizionario dei menu e delle superfici (P-i18n, 06/09; owner: «sì, approvo»).
 *
 * Forma: la CHIAVE è la frase italiana così com'è scritta nel codice (stile gettext/Lingui,
 * lingui.dev «Explicit vs generated IDs», letto il 06/09/2026): niente identificatori inventati,
 * il codice resta leggibile in italiano, e una frase senza traduzione resta in italiano invece di
 * sparire. Le categorie ricalcano un approccio noto (common, settings,
 * notifications, toolTitles…), per misurare la copertura una categoria alla volta.
 * I segnaposto `{n}`, `{i}`, `{url}` si sostituiscono con `t(frase, { n })`; il plurale lo decide
 * `Intl.PluralRules` sulla lingua risolta (`tn`).
 *
 * ⛔ Un valore uguale alla chiave (nomi propri: Calm, Forge, Terminal…) è voluto: la copertura lo
 * conta come tradotto, perché in inglese si scrive così.
 */
export default Object.freeze({
  /* i menu: chiavi astratte dal mockup (H21), applicate a [data-t]/[data-ph] */
  menu: {
    nuova: 'New', luoghi: 'Places', altro: 'More', fissate: 'Pinned', sessioni: 'Sessions', cerca: 'Search chats…',
    capability: 'Capability', board: 'Board', libreria: 'Library', memoria: 'Memory', attivita: 'Tasks',
    chat: 'Chat', terminale: 'Terminal', review: 'Review', browser: 'Browser', comandi: 'Commands',
  },

  impostazioni: {
    // sezioni
    'Aspetto e movimento': 'Appearance and motion', 'Chat e composer': 'Chat and composer', 'Laboratorio modelli': 'Model Lab',
    'Provider e accessi': 'Providers and access', 'Strumenti agente e permessi': 'Agent tools and permissions',
    'Privacy e dati locali': 'Privacy and local data', 'File e workspace': 'Files and workspace', 'Account, Doctor e backup': 'Account, Doctor and backup',
    // 06/09, D2/D13/D21/D22/D26 — le tre sezioni nuove delle Impostazioni
    'Memoria e contesto': 'Memory and context', 'Sicurezza e privacy': 'Security and privacy', 'Costi e consumo': 'Cost and usage',
    // titoli delle righe
    'Animazione risposta': 'Reply animation', 'Animazioni interfaccia': 'Interface animations', 'Apertura del pulsante +': 'The “+” button opens',
    'Bagliore': 'Glow', 'Chat a tutta larghezza': 'Full-width chat', 'Composer': 'Composer', 'Contrasto': 'Contrast', 'Curva': 'Easing',
    'Densità': 'Density', 'Densità delle liste': 'List density', 'Dimensione interfaccia': 'Interface size', 'Durata': 'Duration',
    'Feedback': 'Feedback', 'Finestre': 'Windows', 'Forma del composer': 'Composer shape', 'Intensità': 'Intensity', 'Intensità UI': 'UI intensity',
    'Intestazione immersiva': 'Immersive header', 'Lingua dei menu': 'Menu language', 'Messaggi': 'Messages', 'Modalità colore': 'Color mode',
    'Navigazione': 'Navigation', 'Pannelli strumenti': 'Tool panels', 'Parallasse': 'Parallax', 'Profilo': 'Profile', 'Profondità': 'Depth',
    'Qualità': 'Quality', 'Renderer': 'Renderer', 'Riduci movimento': 'Reduce motion', 'Rispetta risparmio dati': 'Respect data saver',
    'Ritardo progressivo': 'Stagger', 'Scie': 'Trails', 'Sfondo animato': 'Animated background', 'Sfondo attivo': 'Background on',
    'Sospendi finestra nascosta': 'Pause when hidden', 'Stile dei messaggi': 'Message style', 'Superfici': 'Surfaces', 'Tema TALOS': 'TALOS theme',
    'Testo chat': 'Chat text', 'Velocità': 'Speed',
    // opzioni
    'Adattiva': 'Adaptive', 'Adattivo': 'Adaptive', 'Alta': 'High', 'Atlas': 'Atlas', 'Aurora': 'Aurora', 'Basicus': 'Basicus', 'Bassa': 'Low',
    'Bilanciata': 'Balanced', 'Bolle': 'Bubbles', 'Calm': 'Calm', 'Cassetto': 'Drawer', 'Chiaro': 'Light', 'Cinematografica': 'Cinematic',
    'Classica': 'Classic', 'Claudius': 'Claudius', 'Comoda': 'Comfortable', 'Compatta': 'Compact', 'Complessità alta': 'High complexity',
    'Cursore testo': 'Text cursor', 'Dissolvenza': 'Fade', 'Elastica leggera': 'Light elastic', 'Ember': 'Ember', 'English': 'English',
    'Espressivo': 'Expressive', 'Extra grande': 'Extra large', 'Extra piccola': 'Extra small', 'Extra piccolo': 'Extra small', 'Finestra': 'Window',
    'Forge': 'Forge', 'Glacier': 'Glacier', 'Grande': 'Large', 'Italiano': 'Italian', 'Lineare': 'Linear', 'Menu': 'Menu', 'Minimale': 'Minimal',
    'Morbida': 'Soft', 'Noir': 'Noir', 'Pannello laterale': 'Side panel', 'Paper': 'Paper', 'Personalizzato': 'Custom', 'Piccola': 'Small',
    'Piccolo': 'Small', 'Precisa': 'Precise', 'Predefinita': 'Default', 'Predefinito': 'Default', 'Scuro': 'Dark', 'Segui il sistema': 'Follow the system',
    'Segui il tema': 'Follow the theme', 'Semplice': 'Simple', 'Sezioni': 'Sections', 'Signal': 'Signal', 'Spento': 'Off', 'Standard': 'Standard',
    'Statico': 'Static', 'Telemetry': 'Telemetry', 'Terminal': 'Terminal', 'Violet': 'Violet',
    // unità e voci del pannello
    '%': '%', 'ms': 'ms',
    'Segui il sistema ({lingua})': 'Follow the system ({lingua})', 'italiano': 'Italian',
  },

  /* i nomi umani degli attrezzi */
  attrezzi: {
    'annullamento di una ricerca': 'cancelling a research', 'apertura di una pagina web': 'opening a web page',
    'avvio di una ricerca approfondita': 'starting a deep research', 'chiusura di un’attività': 'closing a task',
    'comando nel terminale': 'terminal command', 'copia di un file di Libreria nel workspace': 'copying a Library file into the workspace',
    'correzione di una memoria': 'correcting a memory', 'creazione di un artefatto': 'creating an artifact',
    'creazione di un attrezzo nuovo': 'creating a new tool', 'creazione di un documento': 'creating a document',
    'creazione di un’attività': 'creating a task', 'data e ora': 'date and time', 'delega a un sotto-agente': 'delegating to a sub-agent',
    'elenco della Libreria': 'listing the Library', 'elenco della cartella': 'listing the folder', 'elenco delle attività': 'listing the tasks',
    'elenco delle note': 'listing the notes', 'elenco delle ricerche': 'listing the researches',
    'eliminazione di un file di Libreria': 'deleting a Library file', 'eliminazione di una memoria': 'deleting a memory',
    'eliminazione di una nota': 'deleting a note', 'eliminazione di una ricerca': 'deleting a research', 'consegna del rapporto di ricerca': 'delivering the research report', 'eliminazione di un’attività': 'deleting a task',
    'esecuzione dei test': 'running the tests', 'generazione di un’immagine': 'generating an image',
    'lettura del rapporto di ricerca': 'reading the research report', 'lettura di un file': 'reading a file',
    'lettura di un file di Libreria': 'reading a Library file', 'modifica di un file': 'editing a file', 'modifica di una nota': 'editing a note', 'modifica di un’attività': 'editing a task',
    'origine di un file di Libreria': 'origin of a Library file', 'pausa di una ricerca': 'pausing a research',
    'regole d’uso della Libreria': 'Library usage rules', 'ricerca in Libreria': 'searching the Library', 'ricerca nei file': 'searching in files',
    'ricerca nella memoria': 'searching the memory', 'ricerca sul web': 'web search', 'rinomina di un file di Libreria': 'renaming a Library file',
    'rinomina di una ricerca': 'renaming a research', 'ripresa di una ricerca': 'resuming a research', 'scrittura di un file': 'writing a file',
    'scrittura di una nota': 'writing a note', 'scrittura in memoria': 'writing to memory',
  },

  /* il Terminale a schede */
  terminale: {
    'tu': 'you', 'Nuovo': 'New', 'Apri una nuova scheda': 'Open a new tab', 'Apri una sessione per avere più schede': 'Open a session to have more tabs',
    'Hai già {n} schede aperte: chiudine una': 'You already have {n} tabs open: close one', 'Chiudi': 'Close', 'Chiudi le altre': 'Close others',
    'Chiudi tutte': 'Close all', 'Rinomina': 'Rename', 'Nessuna scheda aperta': 'No tab open',
    "Ogni scheda dichiara chi l'ha aperta e dove.": 'Every tab says who opened it and where.', 'Aperta da te': 'Opened by you',
    'Azioni sulla scheda': 'Tab actions', 'in corso': 'running', 'connessa': 'connected', 'connessione in corso': 'connecting', 'in attesa': 'waiting',
    'disconnessa': 'disconnected', 'shell chiusa': 'shell closed', 'shell ripresa': 'shell resumed',
    'Stessa macchina, senza isolamento': 'Same machine, no isolation',
    'La shell gira sul tuo computer, nella cartella della sessione: nessuna sandbox.': 'The shell runs on your computer, in the session folder: no sandbox.',
    'Premi Nuovo per aprire una shell in questa cartella.': 'Press New to open a shell in this folder.', 'cartella predefinita del server': 'server default folder',
    'Colori limitati ({motivo}).': 'Limited colors ({motivo}).', 'shell sul tuo computer, senza isolamento': 'shell on your computer, no isolation',
    'Serve una sessione': 'A session is needed', 'Troppe schede': 'Too many tabs', 'Scheda non aperta': 'Tab not opened', 'Shell non chiusa sul server': 'Shell not closed on the server',
  },

  /* le linguette dei file della Revisione (BC-63, 17/09: stesso componente del Terminale) */
  revisione: {
    'Azioni sul file': 'File actions', 'Apri il file': 'Open the file', 'Copia il percorso': 'Copy the path',
    'Copia il diff di questo file': 'Copy this file’s diff',
  },

  /* il Browser a schede */
  browser: {
    'Letture della sessione': 'Session readings', 'Nessuna pagina ancora': 'No pages yet',
    'Testo acquisito dall’agente · {n} pagina': 'Text acquired by the agent · {n} page', 'Testo acquisito dall’agente · {n} pagine': 'Text acquired by the agent · {n} pages',
    '{n} lettura dell’agente': '{n} reading by the agent', '{n} letture dell’agente': '{n} readings by the agent',
    '{n} pagina aperta da te': '{n} page opened by you', '{n} pagine aperte da te': '{n} pages opened by you',
    'Lettura {i} di {n}': 'Reading {i} of {n}', 'Pagina aperta da te · viva dentro TALOS': 'Opened by you · live inside TALOS',
    'Pagina aperta da te · non mostrabile qui': 'Opened by you · cannot be shown here', 'Apertura in corso…': 'Opening…',
    'Le letture dell’agente sono copie testuali; una pagina che apri tu è viva e ci puoi navigare dentro. Le note restano in questo browser.':
    'Agent readings are text copies; a page you open is live and you can navigate inside it. Notes stay in this browser.',
    'Le letture sono copie testuali; una pagina che apri tu è viva dentro TALOS — se il sito vieta la cornice, la mostra un browser pilotato sul tuo computer. Le note restano qui.':
    'Readings are text copies; a page you open is live inside TALOS — if the site refuses to be framed, a browser TALOS drives on your computer shows it. Notes stay here.',
    'Agente': 'Agent', 'Tu': 'You', 'Pagina viva': 'Live page', 'Chiedi all’agente di leggerla': 'Ask the agent to read it', 'Nessuna pagina letta': 'No page read yet',
    /* ⭐ 16/09/2026, P0 corsia B — le frasi dei sei stati della scheda (apertura, ritentativo,
       guasto, annullata, a riposo). Il cancello `tests/unit/i18n-copertura.test.mjs` legge le
       TESTI di `components/browser.js` e pretende l'inglese per ciascuna: senza queste righe la
       suite delle unità è rossa. */
    'Se ci mette troppo puoi annullare: la scheda resta dov’è.': 'If it takes too long you can cancel: the tab stays where it is.',
    'Ogni tentativo aspetta un po’ di più del precedente.': 'Each attempt waits a little longer than the one before.',
    'Non sono riuscito ad aprire questa pagina': 'I could not open this page',
    'Apertura annullata': 'Opening cancelled',
    'Hai chiuso la scheda mentre apriva: non è stato scritto niente.': 'You cancelled while it was opening: nothing was written.',
    'Questa pagina era a riposo: la sto ricaricando': 'This page was asleep: I am reloading it',
    'Restano vive le ultime pagine che hai guardato; le altre si ricaricano quando ci torni.': 'The pages you looked at most recently stay alive; the others reload when you come back.',
    'Questa pagina è in pausa': 'This page is paused',
    'Riprova': 'Try again', 'Annulla': 'Cancel',
    '{invito}: usa «Rileggi».': '{invito}: use “Reload”.',
    /* ⛔ 16/09 — questa frase è composta da una FUNZIONE (`TESTI.statoRiprovo`), quindi il cancello
       i18n, che scansiona solo le stringhe di TESTI, non la vede: mancava, e nella foto del tema
       scuro il titolo usciva in italiano sopra un sottotitolo inglese. Trovata guardando la foto. */
    'Non ha risposto: riprovo ({tentativo} di {totale})…': 'No answer: trying again ({tentativo} of {totale})…',
    /* ⛔ 16/09 — i quattro RIMEDI di `rimedioPerIlMotivo` (nati il 07/9) non erano mai stati
       tradotti: finivano in una riga di avviso e nessuno ci aveva guardato. Adesso stanno nel
       pannello dello stato, in grande, sotto un titolo inglese: mezza frase per lingua. */
    'Controlla l’indirizzo.': 'Check the address.',
    'Il sito ha un certificato non valido: aprilo fuori da TALOS se ti fidi.': 'The site has an invalid certificate: open it outside TALOS if you trust it.',
    'Riprova fra un momento.': 'Try again in a moment.',
    'Controlla che il servizio sia acceso.': 'Check that the service is running.',
    'La pagina pilotata è una alla volta: aprendone un’altra questa resta nella sua scheda e si riapre quando ci torni.': 'Only one driven page at a time: opening another leaves this one in its tab, and it reopens when you come back.',
    'Non è un indirizzo: scrivi un sito (es. localhost:5173 o example.org).': 'That is not an address: type a site (e.g. localhost:5173 or example.org).',
    'L’agente chiede di leggere {url}. La scelta vale per questa richiesta.': 'The agent asks to read {url}. The choice applies to this request only.',
    'Nota: {nota}': 'Note: {nota}', '{motivo}. {invito}: usa «Rileggi».': '{motivo}. {invito}: use “Reload”.',
    'Il sito non consente di essere mostrato dentro TALOS': 'The site does not allow being shown inside TALOS',
    'Ricarica la pagina nella cornice': 'Reload the page in the frame', 'Prepara nel composer la richiesta di rileggere questa pagina': 'Prepare in the composer the request to re-read this page',
    'Azioni sulla scheda': 'Tab actions', '{titolo} — {url}': '{titolo} — {url}', 'Pagina': 'Page',
    /* ⛔⛔⛔ 16/09/2026, GIRO DI RIPARAZIONE — LE FRASI DEI GUASTI, che prima le scriveva il SERVER.
       Le foto della consegna precedente mostravano il pannello mezzo inglese e mezzo italiano: il
       motivo lo componeva `src/browser-frame.mjs` con un numero dentro, e una chiave con un numero
       dentro non può stare in nessun dizionario. Adesso le frasi nascono in `components/browser.js`
       con `{secondi}` come SEGNAPOSTO, quindi la chiave è una sola per tutti i numeri e il cancello
       `tests/unit/i18n-copertura.test.mjs` le vede e ne pretende l'inglese. */
    'Il sito non ha risposto in tempo ({secondi} secondi)': 'The site did not answer in time ({secondi} seconds)',
    'Questo indirizzo non esiste': 'That address does not exist',
    'Nessuno risponde a questo indirizzo': 'Nothing is answering at that address',
    'Il sito ha un certificato non valido': 'The site has an invalid certificate',
    'Non sono riuscito a raggiungere il sito': 'I could not reach the site',
    'Questo non è un indirizzo che posso aprire': 'That is not an address I can open',
    'Il sito vieta di essere mostrato dentro un altro sito': 'The site refuses to be shown inside another site',
    'Il sito si mostra solo dentro le sue stesse pagine': 'The site only shows itself inside its own pages',
    'Il sito consente la cornice solo ad altri siti, non a TALOS': 'The site allows framing only for other sites, not for TALOS',
    /* le parole dello stato sulla striscia delle linguette: si ascoltano (sr-only) — WCAG 1.4.1,
       un lettore di schermo non annuncia i colori */
    'in apertura': 'opening', 'sto riprovando': 'trying again', 'non raggiunta': 'not reached', 'annullata': 'cancelled',
    /* ⛔ 16/09 — il pulsante del pannello: il testo di partenza sta nel modello HTML, che nessuno
       traduce, e nella foto inglese usciva «Annulla navigazione» sotto un titolo inglese. */
    'Annulla navigazione': 'Cancel navigation',
    /* ⛔ 16/09 — le etichette della barra del Browser: stesso motivo, stesso posto (il modello HTML
       le scriveva a mano e nessuno le traduceva). Le scrive il componente, quindi il cancello di
       copertura le vede e ne pretende l inglese: infatti e stato lui a trovarle mancanti. */
    'Rileggi': 'Reload', 'Annota': 'Annotate', 'Nota locale': 'Local note', 'Copia testo': 'Copy text',
    'Testo dell’agente': 'Agent text',
    /* ⛔⛔ 16/09/2026, SECONDO GIRO DI RIPARAZIONE — le frasi del Browser che a schermo uscivano in
       ITALIANO dentro una app inglese. Le prime due erano un pezzo di stringa attaccato a un numero
       (`${n} caratteri`) e nessun dizionario poteva contenerle: adesso sono frasi con segnaposto.
       Le altre erano `t(...)` regolari, semplicemente senza la riga inglese — misurate una per una
       (9 prima della cura, 0 dopo; il comando è nel rapporto della corsia B). */
    '{n} carattere': '{n} character', '{n} caratteri': '{n} characters',
    'Sorgente ricevuto dall’agente ({n} caratteri)': 'Source received by the agent ({n} characters)',
    'Sorgente ricevuto dall’agente': 'Source received by the agent',
    'Chiudi {titolo}': 'Close {titolo}',
    'Questo sito non si lascia mostrare dentro TALOS. Qui sotto c’è il testo che ha letto l’agente.':
    'This site refuses to be shown inside TALOS. Below is the text the agent read.',
    'Qui sotto c’è il testo che ha letto l’agente.': 'Below is the text the agent read.',
    'di': 'of',
    'La pagina è stata tagliata: l’agente ne ha ricevuta solo una parte. Aprila per vedere quale.':
    'The page was cut: the agent received only part of it. Open it to see which part.',
    'Segna gli elementi della pagina da cambiare: i commenti finiscono nel composer':
    'Mark the parts of the page to change: the comments end up in the composer',
    'Prepara una bozza nella chat senza inviarla': 'Prepare a draft in the chat without sending it',
  },

  /* la connessione col server (barra di stato) */
  connessione: {
    'Il server non risponde': 'The server is not responding', 'Collegato di nuovo': 'Connected again',
  },
});
