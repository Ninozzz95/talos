# Custodia delle prove Autocompact

Richiesta esplicita owner, 08/09/2026: conservare gli esiti per la futura documentazione tecnica della pagina ufficiale TALOS. Questa fase non pubblica risultati e non autorizza la diffusione di conversazioni private.

## Custodia definitiva v2

Archivio definitivo: `.claude/evidenze-private/autocompact-2026-09-08-v2.zip`, **54.819.130 byte**, SHA256 `a8672a47738203fe7a23813442121f888a1fa91ce0f76cdca4f4ce6b25fe446f`; sidecar `.zip.sha256`. Contiene **2.860 artefatti più custody-manifest-v2.json**, tutti riletti dal sigillatore con verifica di dimensioni e SHA256.

Indice definitivo `selected-cases-v2.json`: **96 casi selezionati, 36 esclusi, 132 raw**. Rispetto alla v1 tre prove TALOS/Nemotron/tools con domanda libera sono sostituite da tre nuove prove con la domanda vincolata comune, batch `2026-09-08T18-25-30.282Z`. I tre originali restano nella sezione esclusioni. Le nuove risposte leggono correttamente il file ma non rispettano il formato esatto: non sono successi promossi. Gli snapshot dei primi batch 15:21/16:09 non comprendono scripts/, limite esplicitato nel rapporto. La v2 include anche indice e manifest v1, oltre agli script di postprocessing v2.

La descrizione del manifest v2 precisa che le sei copie plugin LCM delle prove native sono incluse; restano escluse la directory upstreams alla radice, i pesi e le dipendenze installate. `restoration/load-final.json` conferma Nemotron pronto a 16384 sulla 4174 alle 18:28:53 UTC. Nessuna riscrittura o cancellazione di v1, raw o conversazioni.

Verifica delegata finale v2 superata: ZIP/sidecar/hash e tutte le dimensioni coincidono; per tutte le 132 righe coincidono file, riga, SHA del file, SHA della riga e risultato originale. Nessuna omissione o duplicazione. Le 15 domande strumenti effettivamente raggiunte sono identiche. Cambiano soltanto i tre casi TALOS/Nemotron/tools sostituiti per parità di protocollo. Il controllo è stato di sola lettura.

## Prima custodia v1, conservata come provenienza

Archivio locale: `.claude/evidenze-private/autocompact-2026-09-08.zip`, 54.465.992 byte. SHA256 `5cbdb66cc3a27fa82e953f3cc3829d52bbd2c5163ef9ad204556dfb8d8f22c36`; sidecar `.zip.sha256` corrispondente. Contiene 2.828 artefatti più `custody-manifest.json`. Il sigillatore ha riletto ogni voce e verificato dimensioni e SHA256. Il controllo delegato indipendente conferma hash ZIP/sidecar, nomi, dimensioni, 96 casi selezionati e 33 esclusi, assenza di path esterni, duplicati e symlink.

`selected-cases.json` conserva 129 risultati grezzi indicizzati, dei quali 96 nella matrice e 33 esclusi con motivazione. Tutti i 129 riferimenti, righe, hash e copie del risultato sono stati controllati indipendentemente. Le prove parziali restano nelle loro directory. Il rapporto conclusivo è `RISULTATI-QUALIFICAZIONE-AUTOCOMPACT-2026-09-08.md`.

**Rettifica descrittiva del manifest sigillato:** la frase `upstream working trees retained separately` è troppo ampia. È esclusa la directory upstreams alla radice; risultano incluse nello stato delle prove native **sei copie del plugin Hermes-LCM**, 261 file ciascuna, complessivamente 1.566 file e 81.425.178 byte non compressi. Il controllo indipendente le ha rilevate. Nessun peso GGUF, binario, node_modules o venv è incluso. Il ZIP originale e i suoi hash restano immutati; questa rettifica versionata documenta esattamente il contenuto e corregge la descrizione, non i risultati.

Le tre immagini di ripristino hanno suffisso operativo `.png` ma payload JPEG prodotto dal browser: 1920×1080, 2560×1440, 3840×2089. Il terzo viewport richiesto era 3840×2160: la cattura è parziale e non certifica un'immagine 4K completa. Le immagini non sono benchmark dell'engine. API load e screenshot sono in `restoration/`, senza domande aggiunte alla conversazione owner.

## Archivio di lavoro

Radice locale: `C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/scratchpad/prove/autocompact-qualification-20260908`.

- `runs/`: richieste complete, risposte, errori, token, misure, originali, checkpoint, script e configurazioni dei batch; conservare anche batch interrotti o invalidati.
- `faults/`: iniezioni controllate e stato degli archivi; non confonderle con inferenze reali.
- `native-host-gate-1788885443572/`: esiti di avvio dell'host Hermes al profilo pattuito.
- `sources.json`, `hermes-materialization.json`, `hermes-tree.json`: provenienza upstream e verifiche dei pin.
- `datasets.json`: copie di cronologia e fixture; materiale privato.
- `hardware-inventory.json`, `python-environment-inventory.json`: ambiente osservato.
- `custody-manifest.json`: indice sigillato con SHA256 e dimensioni, verificato sulle voci del ZIP; leggere la rettifica descrittiva sopra.

Indice di interpretazione: `CONSEGNA-QUALIFICAZIONE-AUTOCOMPACT-2026-09-08.md`, `LEDGER-QUALIFICAZIONE-AUTOCOMPACT-2026-09-08.md` e `RICERCA-AUTOCOMPACT-ENGINE-2026-09-08.md` nella stessa directory di questo documento.

## Regole per la futura documentazione pubblica

Riportare configurazione esatta, modello/GGUF, finestra, riserva, versioni, data, hardware, numero di repliche ed esclusioni. Distinguere componente, host completo e app TALOS. Distinguere correttezza dei fatti, formato, errori del modello, crash del runtime e difetti del banco. Conservare i risultati negativi; nessun confronto a condizioni differenti nascosto e nessuna superiorità dichiarata senza evidenze valide.

Gli esiti aggregati e le fixture artificiali potranno essere preparati per la pagina ufficiale dopo revisione. Cronologie reali, nomi di sessioni, percorsi personali, log completi e credenziali non diventano materiale pubblicabile per effetto di questa richiesta. L'archivio corrente è locale: non è dichiarato un backup esterno o una copia remota.

**Cosa deve fare l'owner:** nulla per la custodia. **Cosa faccio io dopo:** usare questo archivio come riferimento delle future decisioni tecniche. **Cosa rimane:** selezione, anonimizzazione e revisione del materiale per la futura documentazione ufficiale; pubblicazione separata.
