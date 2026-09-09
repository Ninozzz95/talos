# Consegna Astra a Claude — versione 002

Snapshot: **2026-09-09T08:17:06Z / 2026-09-09T10:17:06+02:00 (Europe/Rome)**.
Codice: **d0c3bbee**, branch `codex/talos-context-engine`, worktree `C:/Users/Antonino/Desktop/projects/AVM-context-engine`.

**I crediti di Astra potrebbero terminare improvvisamente.** Rischio segnalato dall'owner; non e una misura della quota residua. Questa consegna permette la ripresa dal disco.

## Resoconto cumulativo

Questa versione comprende il resoconto storico immutabile [v001, 07:48:05Z](./CONSEGNA-ASTRA-A-CLAUDE-2026-09-09-v001-074805Z.md): tutto il lavoro dal ticket originario dell'8 settembre, fix Review/chat/ripresa, banco Autocompact con insuccessi, immagini/provider, Accesso pieno, backlog e TCEC. Leggere v001 insieme a questo aggiornamento. Nessun risultato storico riscritto o promosso.

## Aggiornamento

- `8c164325`: consegna v001 salvata e copiata identica nella worktree desktop.
- `d0c3bbee`: eventi di versione TCEC collegati al registro. AG-UI CUSTOM, nome talos.context, payload ContextEventV1. Outbox SQLite confermata dopo append JSONL con flush. Retry serializzato per sessione, consegne concorrenti e replay duplicato coperti da test. Server isolato collegato a pubblicaEventoContesto.
- ID uguale con payload diverso rifiutato. Retry in memoria senza seconda trasmissione; replay dopo riavvio elimina copie identiche. Non e una garanzia exactly-once della rete. La UI puo ricevere l'evento prima del flush JSONL, dopo il commit SQLite autorevole.
- Corretto soltanto il generatore di URL del test inventario: un gruppo regex catturante facoltativo diventava un URL inesistente. Nuovo CTX-ROUTE-SAMPLE. Nessuna apertura aggiuntiva nelle rotte di produzione.

## Evidenza fresca

`node --test tests/*.test.mjs` da harness-ui: **1899 totali, 1897 pass, zero fail, due skipped**, 20391.5342 ms. Skip: GGUF/sottomodulo assenti nella worktree, verificati nella suite dedicata (14 pass, 2 skip). Nessuna qualifica dei modelli implicata.

Eventi/servizio/server: **12/12**. SQLite, JSONL e processo server reali, incluso secondo avvio. Versione controllata, nessuna inferenza. Mutation test rimuovendo onEvent: RED zero eventi; ripristino GREEN. ENOSPC iniettato, conflitto durante consegna e doppio replay RED/GREEN. Diff e staged check verdi prima del commit. Ricerca primaria del 9 settembre: AG-UI events, Node appendFile/flush, ECMA262 Pattern. Dettagli in LEDGER, RISULTATI, RICERCA TCEC.

## Ripresa

1. Verificare git status preservando modifiche posteriori allo snapshot.
2. Continuare inline la modale Context Compactor. Bozze non integrate in `C:/Users/Antonino/Desktop/projects/AVM-context-ui`; nessun nuovo agente. Canonico frontend/mockup/talos-mockup.html; generatore mockup-to-template.mjs. Bozze da revisionare, non consegna utilizzabile.
3. Collegare Compatta, polling, fatti, versioni, fonti e separatore CUSTOM. Riutilizzare dialoghi.js e talos-harness-modal-sizes-v1. Verificare focus, Escape, riapertura, cambio sessione, risposte tardive e guasti.
4. Completare punti aperti di v001: contatori visibili/usage comune, recupero automatico e asset, catalogo/RTK, invalidazioni modello/impostazioni, obiettivo e coda corrotta, scheduler reale. Ricontrollare nel codice prima di chiudere ogni punto.
5. Qualifica reale con entrambi i GGUF, tre repliche e casi 406/memoria/tool/riavvio; provider separati. Custodire originali, manifest e insuccessi.
6. Doppia revisione ingegneristica, prove naturali dal composer, screenshot 1920x1080, 2560x1440 e 3840x2160, poi approvazione owner.

## Confini

TCEC isolato, **4174 invariato**, nessun merge in lane/harness-desktop, nessun push. La copia del documento nella worktree desktop cambia solo documentazione. Benchmark precedenti immutabili. Nessuna pubblicazione o credenziale nei documenti. Non modificare AGENTS.

**Owner:** nessuna azione ora.
**Io dopo:** modale e percorso visibile, quindi nuova versione della consegna.
**Rimane:** integrazione completa, qualificazione reale, revisione finale e approvazione dell'attivazione.
