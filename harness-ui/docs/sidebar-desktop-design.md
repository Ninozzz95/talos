# Sidebar sinistra desktop — decisioni e contratto

Base: `13f65c15cdeaf8986b882993a0773cdeafb867d2`. PR: #32. Questo documento integra l'audit iniziale: i checkpoint sono intermedi, non la definizione di completamento.

## Evidenza dal codice

- `legacy/app.js::aggiornaElencoSessioniReali` ricrea righe e listener e sostituisce tutti i figli; il percorso puntuale `aggiornaSessionItem` non impedisce questa ricostruzione.
- La ricerca nasconde il bottone, non il wrapper con il menu. Un refresh ignora il filtro già scritto.
- Il solo canale aggregato attuale è il GET ogni 15 secondi. Le iscrizioni agli eventi di ogni sessione attivano anche watcher del filesystem: un'iscrizione per riga non è una soluzione accettabile.
- La selezione multipla annida un checkbox in un button. Il menu overflow è già un fratello: la correzione riguarda il checkbox, non un nuovo menu.
- I dati del registro comprendono esiti, approvazioni, gerarchia, giri cumulativi e coda. Gli eventi distinguono ragionamento, risposta e richieste di strumenti. `ToolCallStart` precede gli argomenti: non prova che il comando stia già eseguendo. Non si inventano retry, costo, task completati o durata storica.
- Il bundle è condiviso con l'host embedded. Il nuovo montaggio è solo standalone desktop; Board, chat e host mantengono i propri contratti.

## Decisioni prima dell'implementazione

### A. Un solo flusso per la sidebar

**Problema →** le altre sessioni restano indietro. **Evidenza →** timer 15 s e stream per sessione. **Soluzione →** endpoint di sola lettura che espone una proiezione del registro, snapshot iniziale e delta per id, epoca del processo e revisione. Ogni riconnessione riparte da uno snapshot autorevole; non si rigioca la conversazione nella sidebar. Un heartbeat verificabile distingue connessione aperta da dati effettivamente sincronizzati. **Alternative →** polling veloce (ritardo e carico), un SSE per riga (limiti connessioni, watcher), un secondo backend di sessioni (duplica verità). **Trade-off →** minima estensione API/registro inevitabile, documentata e testata. Nessun transcript, output tool, argomento o credenziale nel flusso.

Riferimenti pertinenti: [MDN SSE](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events), [Pi extension events](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md), [Hermes sessions](https://hermes-agent.nousresearch.com/docs/user-guide/sessions), [Claude Code sessions](https://code.claude.com/docs/en/sessions), [VS Code Views](https://code.visualstudio.com/api/ux-guidelines/views). I primi due supportano la separazione trasporto/eventi/rendering; i successivi motivano identità e metadati separati dalla conversazione, non sono prove di un loro identico protocollo.

### B. Identità stabile, ricerca e azioni

**Problema →** focus perso e risultati incoerenti al refresh. **Soluzione →** una mappa DOM per sessionId; aggiornamento dei soli campi cambiati; filtro sui wrapper, con antenati necessari alla gerarchia; ricalcolo dell'ordine separato dall'aggiornamento dei dati e rinviato durante l'interazione. Checkbox, apertura e menu sono controlli fratelli. Restano le azioni esistenti, non una seconda implementazione CRUD. **Alternative →** ricreare e rifocalizzare tutto (churn e stato perso), listbox con bottoni annidati (semantica scorretta), riordinare a ogni token (bersagli mobili). **Trade-off →** il riordino può aspettare l'uscita del puntatore/focus; i dati no.

Riferimenti: [APG keyboard interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/), [APG menu button](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/), [VS Code Views](https://code.visualstudio.com/api/ux-guidelines/views), [Claude Code picker](https://code.claude.com/docs/en/sessions), [Aider commands](https://aider.chat/docs/usage/commands.html). Picker CLI e comandi Aider mostrano ricerca/azioni contestuali, ma non giustificano l'importazione di scorciatoie CLI nel desktop.

### C. Stato operativo leggibile

**Problema →** il pallino e «in corso» non dicono cosa sta succedendo. **Soluzione →** simbolo, micro-label e attività osservata; dettaglio strutturato nel tooltip esistente, accessibile anche da tastiera; tempi solo con timestamp noto, contatori solo quando osservati. Un solo orologio per le righe visibili; nessuna animazione continua di errore/attesa e nessun colore come unico significato. **Alternative →** card grandi/badge duplicati, log grezzo, metriche presunte. **Trade-off →** gli stati non supportati non compaiono; durante disconnessione il dato precedente resta consultabile ma è esplicitamente non aggiornato.

Riferimenti: [WCAG uso del colore](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html), [MDN reduced motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion), [APG tooltip](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/), [Pi eventi](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md), [Hermes metadati](https://hermes-agent.nousresearch.com/docs/user-guide/sessions), [VS Code Views](https://code.visualstudio.com/api/ux-guidelines/views). Il pattern tooltip APG è ancora dichiarato in lavorazione; non viene presentato come certificazione.

### D. Gerarchia generale e finestre desktop

Le destinazioni esistenti rimangono nei gruppi Spazi di lavoro/Strumenti, con intestazioni disclosure e footer del contesto. Si correggono solo raggiungibilità, semantica, ricerca e spazio effettivamente problematici. Collapse/resize e preferenze già persistite vengono riusati. Nessuna nuova tassonomia globale, né preferenze duplicate. La preferenza locale «Fissa in questa sidebar» mantiene raggiungibili gli alberi scelti senza separarne le figlie. Non è un pin condiviso sul server: il testo lo dichiara e il menu riusa le azioni esistenti. Si conserva nel solo browser, assieme a filtro e letture; se lo storage è negato funziona in memoria. L'archivio non viene inventato senza un contratto dedicato. La virtualizzazione richiede una misura, non una scelta preventiva.

Riferimenti: [VS Code Views](https://code.visualstudio.com/api/ux-guidelines/views), [APG disclosure](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/), [APG tastiera](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/), [APG menu](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/), [WCAG colore](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html). Gruppi compatti e controlli nativi mantengono navigazione e stato comprensibili anche senza mouse e colore.

## Confronto: beneficio, limite, applicabilità

| Fonte | Pattern e contesto | Beneficio | Limite / cosa non trasferire | Applicazione |
| --- | --- | --- | --- | --- |
| Claude Code | Sessioni nominabili, picker ricercabile e navigabile da tastiera | Identità riconoscibile, ripresa rapida | Documentazione CLI, non un feed desktop | Nomi, ricerca e continuità; non le combinazioni di tasti |
| Hermes | Metadati di sessione strutturati separati dai messaggi | Un'identità anche senza conversazione aperta | Backend e persistenza differenti | Proiezione di metadati dal registro Talos, non un nuovo database |
| Aider | Comandi contestuali espliciti | Azioni raggiungibili senza affollare ogni riga | Non una UI multi-sessione realtime | Conservare menu contestuali e nomi chiari, non una command line nella barra |
| Pi | Lifecycle di sessione/agente/modello/strumento | Rendering separato dai segnali operativi | Nomi e semantiche diversi | Mappare solo eventi effettivi di Talos |
| VS Code | Views focalizzate, gerarchie e azioni contestuali | Orientamento e densità controllata | Non serve copiare tutta la workbench | Gruppi esistenti, azioni secondarie, sidebar circoscritta |
| MDN SSE | Flusso unidirezionale, riconnessione e chiusura | Un trasporto adatto agli aggiornamenti server→UI | Limiti connessioni, replay da progettare | Un flusso aggregato, snapshot al ritorno, cleanup |
| WAI-ARIA/WCAG | Tastiera, controlli nativi, tooltip/disclosure, significato oltre il colore | Azioni e stato accessibili | ARIA non corregge HTML interattivo annidato | Checkbox fratello, focus stabile, label e simboli |

## Verifica e criteri d'accettazione

Il rapporto finale deve distinguere test locali, CI, baseline ed eventuali verifiche non eseguibili. Non è sufficiente il solo build. Sono necessari test del feed/proiezione, concorrenza e riconnessione client, identità DOM, ricerca, selezione, menu/focus, layout/collapse/resize, temi e reduced motion; dataset 5/50/200/1000; misure delle mutazioni durante update singolo; screenshot comparabili. La prova visuale richiede immagini dell'app reale, non mockup generati.

### E. Fissate locali e letture

**Problema →** ritrovare un albero in una lista lunga senza cambiare l'ordine a ogni token. **Evidenza →** struttura di delega e preferenze browser già presenti in Talos; nessun campo pin affidabile nell'API corrente. **Soluzione →** preferenza esplicitamente locale e filtro Fissate; lo spostamento segue le stesse guardie di focus/puntatore. Il contatore di risposte nuove confronta risposte completate osservate, non token né messaggi utente. **Alternative →** persistenza server nuova e una seconda lista duplicata, entrambe scartate. **Trade-off →** la preferenza è di questa installazione/browser; non sincronizzata fra dispositivi.

Cinque riferimenti pertinenti: [VS Code Views](https://code.visualstudio.com/api/ux-guidelines/views) (azioni contestuali e gerarchia); [Claude sessions](https://code.claude.com/docs/en/sessions) (identità e reperibilità, non un pin server trasferibile); [Hermes sessions](https://hermes-agent.nousresearch.com/docs/user-guide/sessions) (metadati separati dalla conversazione); [APG menu button](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/) (accesso all'azione); [APG tastiera](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/) (selezione e focus distinti). L'applicazione è un'inferenza progettuale da questi pattern, non l'affermazione che tutti implementino lo stesso sistema di pin.
