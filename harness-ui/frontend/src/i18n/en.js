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
    'eliminazione di una nota': 'deleting a note', 'eliminazione di una ricerca': 'deleting a research', 'eliminazione di un’attività': 'deleting a task',
    'esecuzione dei test': 'running the tests', 'generazione di un’immagine': 'generating an image',
    'lettura del rapporto di ricerca': 'reading the research report', 'lettura di un file': 'reading a file',
    'lettura di un file di Libreria': 'reading a Library file', 'modifica di una nota': 'editing a note', 'modifica di un’attività': 'editing a task',
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

  /* il Browser a schede */
  browser: {
    'Letture della sessione': 'Session readings', 'Nessuna pagina ancora': 'No pages yet',
    'Testo acquisito dall’agente · {n} pagina': 'Text acquired by the agent · {n} page', 'Testo acquisito dall’agente · {n} pagine': 'Text acquired by the agent · {n} pages',
    '{n} lettura dell’agente': '{n} reading by the agent', '{n} letture dell’agente': '{n} readings by the agent',
    '{n} pagina aperta da te': '{n} page opened by you', '{n} pagine aperte da te': '{n} pages opened by you',
    'Lettura {i} di {n}': 'Reading {i} of {n}', 'Pagina aperta da te · viva dentro TALOS': 'Opened by you · live inside TALOS',
    'Pagina aperta da te · non mostrabile qui': 'Opened by you · cannot be shown here', 'Apertura in corso…': 'Opening…',
    'Copia testuale, senza navigazione interattiva. Le note locali si azzerano al ricaricamento.': 'Text copy, no interactive browsing. Local notes reset on reload.',
    'Le letture sono copie testuali; una pagina aperta da te è viva dentro TALOS quando il sito lo consente. Le note restano in questo browser.': 'Readings are text copies; a page you open is live inside TALOS when the site allows it. Notes stay in this browser.',
    'Agente': 'Agent', 'Tu': 'You', 'Pagina viva': 'Live page', 'Chiedi all’agente di leggerla': 'Ask the agent to read it', 'Nessuna pagina letta': 'No page read yet',
    'Non è un indirizzo: scrivi un sito (es. localhost:5173 o example.org).': 'That is not an address: type a site (e.g. localhost:5173 or example.org).',
    'L’agente chiede di leggere {url}. La scelta vale per questa richiesta.': 'The agent asks to read {url}. The choice applies to this request only.',
    'Nota: {nota}': 'Note: {nota}', '{motivo}. {invito}: usa «Rileggi».': '{motivo}. {invito}: use “Reload”.',
    'Il sito non consente di essere mostrato dentro TALOS': 'The site does not allow being shown inside TALOS',
    'Ricarica la pagina nella cornice': 'Reload the page in the frame', 'Prepara nel composer la richiesta di rileggere questa pagina': 'Prepare in the composer the request to re-read this page',
    'Azioni sulla scheda': 'Tab actions', '{titolo} — {url}': '{titolo} — {url}', 'Pagina': 'Page',
  },

  /* la connessione col server (barra di stato) */
  connessione: {
    'Il server non risponde': 'The server is not responding', 'Collegato di nuovo': 'Connected again',
  },
});
