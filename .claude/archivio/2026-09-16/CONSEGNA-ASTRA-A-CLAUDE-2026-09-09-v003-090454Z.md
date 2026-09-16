# Consegna Astra a Claude — versione 003

Snapshot: **2026-09-09T09:04:54Z / 2026-09-09T11:04:54+02:00, Europe/Rome**.
Codice consegnato: **7cf21930**, branch `codex/talos-context-engine`, worktree `C:/Users/Antonino/Desktop/projects/AVM-context-engine`.

**I crediti di Astra potrebbero terminare improvvisamente.** È il rischio segnalato dall'owner, non una misura della quota residua. Riprendere dal codice e da questa consegna senza presumere che il lavoro sia terminato.

## Resoconto cumulativo da leggere

Questa versione include per riferimento il resoconto storico immutabile [v001](CONSEGNA-ASTRA-A-CLAUDE-2026-09-09-v001-074805Z.md) e l'aggiornamento [v002](CONSEGNA-ASTRA-A-CLAUDE-2026-09-09-v002-081706Z.md). V001 copre il lavoro dall'8 settembre: Review, attesa/scroll/ripresa chat, checkpoint recuperato, banco con fallimenti, immagini e provider diretti, Accesso pieno, backlog e prima implementazione TCEC. V002 aggiunge gli eventi durevoli. Nessun risultato storico è stato riscritto o promosso.

## Novità verificate in 7cf21930

La modale **Context Compactor** è nel mockup canonico e nella build desktop, collegata al pulsante Compatta per le sessioni di prova abilitate. Riusa dialoghi e persistenza delle misure `talos-harness-modal-sizes-v1`, chiave `sheet:context`. Gestisce automazione, avvio/annullamento/ripresa, fatti protetti, conflitti, versioni con conferma di ripristino, consultazione fonti e impostazioni avanzate. Il client usa revisioni e chiavi di idempotenza, senza retry implicito delle mutazioni.

Polling, chiusura, cambio sessione e risposte tardive hanno controlli di generazione. Focus, Escape e ripristino del focus corretti anche quando un controllo viene disabilitato durante una richiesta. Un caricamento di stato fallito disabilita le mutazioni; una risposta tardiva non riscrive la nuova chat. L'avanzamento usa segmenti misurati o stato indeterminato, mai una percentuale inventata. I contatori non disponibili sono dichiarati tali: **il collegamento delle misure correnti resta da completare**.

Gli eventi AG-UI CUSTOM `talos.context` producono un separatore della versione, distinto per sessione e versione, con apertura della modale. La prova desktop verifica persistenza SQLite, replay SSE, un solo separatore dopo reload e fonte originale consultabile. La versione usata per questa parte della prova è una fixture dichiarata; non è una sintesi generata da un LLM.

Le sessioni escluse dalla sperimentazione mantengono la compattazione legacy soltanto su `CTX_NOT_ENABLED`; altri errori non attivano una compattazione alternativa. Il vecchio toast fittizio con numeri di token è stato rimosso per assenza di sessione.

## Nuova richiesta owner: contesto troppo piccolo

Corretto `selectClosedPrefix(force:true)`: il fallback poteva tagliare fra l'ultima domanda e la risposta. Ora mantiene intero l'ultimo scambio. Se manca materiale precedente, `startCompaction` risponde `CTX_NOTHING_TO_COMPACT` prima di risolvere/caricare il modello; originali, job e versione restano invariati. La UI mostra una spiegazione informativa, non un errore generico o un progresso finto.

La compattazione manuale continua a funzionare sotto la soglia automatica e con automazione spenta. Se la sintesi ingrandisce il contesto, resta respinta da `CTX_NO_REDUCTION`; nessun ciclo della stessa richiesta. Istruzioni lunghe con cronologia breve non bloccano l'anticipo automatico se la richiesta entra ancora nella finestra; un overflow effettivo resta un errore esplicito.

Ricerca richiesta dall'owner: [dossier del mese](RICERCA-CONTEXT-ENGINEERING-ULTIMO-MESE-2026-09-09.md), pubblicazioni 9 agosto–9 settembre 2026, quattro paper con limiti espliciti, documentazione ufficiale e codice Hermes/Pi/Codex fissato. Nessuna nuova dipendenza né promessa di superiorità. Criteri aggiuntivi per la qualificazione: stato corrente contro decisioni revocate, risposte senza fonti, conservazione e comportamento misurati separatamente.

## Prove e limiti dei numeri

| Cancello | Risultato |
|---|---|
| Package context-engine completo dopo caso breve | 64/64 |
| Unit frontend dopo patch | 477/477 |
| Componenti completi prima dell'aggiunta del caso breve | 141/141 |
| Browser compattatore dopo caso breve, tre viewport | 18/18 |
| Desktop UI compilata → HTTP → SQLite → SSE, reload | 1/1 |
| Backend desktop-service/routes/server/integration/events/runtime | 30/30 |
| Regressioni attesa/scroll/immagini/cambio sessione sulla build nuova | 22/22 |
| Build frontend | 31 asset, nessun cutover |

RED osservati prima delle correzioni: taglio scambio, caricamento modello su cronologia vuota, alert generico del caso breve, anticipo che bloccava un contesto ancora valido; anche focus/Escape, stato indisponibile e percorso vecchio del pulsante durante l'integrazione UI. Dossier e ledger conservano i dettagli. Nessuna inferenza reale TCEC in questi cancelli; **i modelli non sono ancora qualificati**. Il backend completo 1897 pass/2 skip appartiene allo snapshot precedente, non è stato falsamente dichiarato rieseguito dopo questa patch.

Screenshot guardati personalmente e versionati in `.claude/immagini/tcec/`: contesto standard e caso breve a 1920×1080, 2560×1440, 3840×2160, più regressione 1024×800. Le immagini `desktop-small-*` provengono dal processo desktop isolato reale con chat fixture. Copie identiche in `scratchpad/prove/foto/tcec-desktop-small-*` e annotazioni in `.claude/ISPEZIONI-FOTO.md`. Il primo commit era stato rifiutato perché il cancello cercava le foto solo nello scratchpad: ricevuta regolarizzata dopo vere catture e ispezioni, hook invariato. Ordine owner rispettato: nessuna prova sul 4174.

## Nuovo debito non urgente

Owner, screenshot `C:/Users/Antonino/Downloads/ScreenShot Tool -20260909110154.png`: migliorare la UI dei blocchi di codice. Il multilinea appare a strisce simili a codice inline, separato dalla barra lingua/Copia. Registrato nella `CODA-PROPOSTE-OWNER-2026-09-08.md` di questa worktree. Richiesta: contenitore unico coerente, evidenziazione/tipografia/contrasto/spaziatura, copia fedele, righe lunghe, streaming e verifica nei due temi e tre risoluzioni. **Non urgente, non implementato; non interrompere TCEC.** Prima dell'edit richiede ricerca, ispezione della causa e ledger.

## Lavoro ancora aperto — non dichiarare completo

1. Collegare misure correnti della richiesta e consumi al servizio comune di sessione, senza doppio conteggio; verificare corpo effettivo del provider.
2. Chiudere la revisione di impostazioni, cambi modello/ragionamento, job tardivi, annullamento/ripresa idempotenti, gate native e obiettivo del contesto ricostruito. Verificare riuso segmenti e pulizia dei job in memoria.
3. Collegare recupero automatico, embedding locale qualificato, allegati end-to-end, catalogo tool e RTK al dispatch reale con identiche politiche. Gli adapter presenti non provano da soli la capacità completa.
4. Rivedere ripresa legacy, coda JSONL corrotta con nuovo append e secondo restart, sincronizzazione originali e costo delle sintesi interrotte; scheduling locale anche con processi concorrenti. Nessuna garanzia GPU multiprocesso dedotta dal mutex in-process.
5. Rivedere la posizione cronologica dei separatori con messaggi arrivati durante il lavoro, linguaggi/errore UI e risposte tardive nelle fonti. Prove complete stop, modello diverso, reload, ripristino con suffisso.
6. Qualificare entrambi i GGUF, tre repliche, 406 messaggi, cinque e venti compattazioni, tool, riavvio, allegati e cambi provider; prove API separate. Un modello locale alla volta. Custodire manifest e insuccessi senza riscrivere il vecchio banco.
7. Percorso naturale dal composer al provider effettivo, double check ingegneristico, poi prova dell'owner prima dell'attivazione generale.

Riprendere inline, **senza nuovi agenti**, come ultima istruzione dell'owner. Non ricominciare il piano né dichiarare mancanti file che sono ora committati. Eseguire `git status` prima di ogni ripresa e preservare modifiche posteriori. Residui locali previsti: `harness-ui/frontend/test-results-context/`, `scratchpad/` e artifact ignorati; contengono prove, non modifiche produttive da eliminare indiscriminatamente.

## Confini della consegna

Nessun push, nessun merge in `lane/harness-desktop`, nessun cambio a 4174, AGENTS o credenziali. Tutto TCEC resta nella worktree isolata. Le copie della consegna nella worktree desktop sono documentazione soltanto. V001 e V002 restano immutabili. L'owner ha già autorizzato commit delle consegne; non serve richiederglieli di nuovo.

**Owner:** nessuna azione adesso. **Io dopo:** completare misure/consumi e integrazioni aperte. **Rimane:** qualificazione reale, revisione finale e approvazione dell'attivazione.
