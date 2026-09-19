# RIPRESA-LIBERA-MEMORIA — ledger prima delle modifiche prodotto
Sottosistema TALOS UI. Richiesta owner: comando nel laboratorio e nella pagina del modello locale.
## File esatti
- harness-ui/frontend/src/components/cornice-model-lab.js: montaCorniceModelLab, nuovo #modelLabLiberaMemoria fuori dal role=tablist.
- harness-ui/frontend/src/legacy/app.js: runtimeInstallati (identità osservata), aggiornaPannelloMemoria, caricaRuntimeModelLab, apriPaginaModello, liberaMemoriaModello, inizializzaModelLab.
- harness-ui/frontend/src/components/scheda-modello.js: montaSchedaModello, disegnaTestata, opzione onLiberaMemoria e metodo aggiornaRuntime.
- harness-ui/frontend/src/components/modelli-installati.js: azioneModello, stato busy e testo misura sconosciuta.
- harness-ui/frontend/src/styles/index.css: disposizione azione globale accanto alle schede, wrap su contenitore stretto.
- harness-ui/frontend/tests/browser/lab-libera-memoria.spec.mjs: scenari permanenti sotto.
- .claude/ROADMAP-GLOBALE-RIPRESA-2026-09-19.md: riscontri e limiti.
## Contratti
POST /api/v1/runtime/unload {runtimeId:'llama.cpp'} già nella release desktop-v0.1.13 a898162feff3ed8ad4cb0586344fe9d9e390d1a5.
GET /api/v1/runtime restituisce state, runtimeState, modelId: il selettore della prova NON identifica il modello caricato.
Nessuna eliminazione file, nessun arresto di processi esterni, nessuna inferenza sui GB liberati.
Rotte pagina, API e due azioni Hugging Face della toolbar restano stabili.
## RED / GREEN
RIPRESA-MEMORIA-GLOBALE: comando visibile, richiesta unica anche durante attesa, successivo stato idle.
RIPRESA-MEMORIA-LOCALE: ingresso pagina locale, azione legata a modelId osservato, file conservati.
RIPRESA-MEMORIA-ERRORE: errore leggibile e retry, nessun falso successo.
RIPRESA-MEMORIA-IDENTITA: nessuna liberazione dalla pagina di un altro modello; assenza RAM non equivale assenza modello.
RED atteso: comando globale e comando pagina assenti.
GREEN: node scripts/ripresa-run.mjs browser lab-libera-memoria.spec.mjs; suite pagina/installati/sistema/guscio e unit, diff --check.
Prova visiva banco 1024/1440; 4174 solo GET senza scaricare modello owner. Reale runtime unload già adapter esistente: riutilizzo, gate reale non eseguito in sessione owner.
## Ricerca primaria consultata 19/09/2026 e decisione upstream
https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md
https://lmstudio.ai/docs/developer/rest/unload
https://lmstudio.ai/docs/developer/core/ttl-and-auto-evict
Adattare tramite adapter TALOS esistente il ciclo esplicito load/unload, non introdurre SDK LM Studio né pulitori RAM generici.
Pin esistente llama.cpp b10517 dc72703fc; Playwright 1.62.1, esbuild 0.28.2. Nessuna dipendenza.
## Rollback
Backup pre-edit dei soli file esatti nel dossier; ripristino delle sole modifiche di questo lotto se autorizzato, mai reset della worktree.

Amendamento banco: scripts/ripresa-run.mjs copia solo file censiti: aggiungere esattamente harness-ui/frontend/tests/browser/lab-libera-memoria.spec.mjs alla lista additions. Prima esecuzione 296b89c9 non è RED prodotto: No tests found.

## Riscontri e amendment della fixture
RED 75fef55e: 5 fallimenti pertinenti, comandi assenti. GREEN 6f2a8ae1: 5/5.
Suite estesa 9b5c2834 scopre che apriInstallatiConAggiornamento in harness-ui/frontend/tests/browser/lab-installati-azioni.spec.mjs dichiara runtime ready senza modelId e pretende il primo modello caricato. La fixture codificava proprio l'inferenza errata dal selettore: aggiungere modelId:'qwen8' osservato, mantenendo tutti gli assert di filtro. Il nuovo RIPRESA-MEMORIA-IDENTITA prova che il primo selezionabile non viene assunto caricato.
La prima foto pagina locale prendeva lo splash ancora in dissolvenza: corretta attesa di #talosAvvio detached; foto da rigenerare, non accettata come prova visiva.

Unit 27079a67: 1430 pass, 1 errore nel caricamento di icone-ripiego. Causa riprodotta: Python Windows aveva convertito app.js da LF a CRLF; il test estrae le funzioni con delimitatore LF. Ripristinati i terminatori originali LF dai riscontri binari del backup senza cambiare il contenuto. Nessuna modifica o rilassamento del test.

## Gate finale e preparazione offline
dc6a50ff: 7/7 PASS, inclusi installati, retry, reload e filtro corretto. Foto locale e laboratorio 1024/1440 ispezionate individualmente.
52cd9c8a: unit frontend completo e build PASS dopo ripristino terminatori LF originali. diff --check PASS.
Review manuale separata dell'implementazione: non indipendente.
File generati da aggiornare, con backup preventivo e hash del bundle testato:
- harness-ui/public/app.js
- harness-ui/public/styles.css
- harness-ui/public/build-manifest.json
Copia offline del bundle coerente 52cd9c8a: nessun avvio/arresto processo. Solo se 4174 rifiuta connessione; verifica HTTP, immagini testa a testa sulla4174 e operazione reale sul runtime restano PENDENTI. Il rifiuto automatico del riavvio resta rispettato.
Rollback: copie precedenti dei tre file nel dossier delivery-offline; nessun reset git.

Esito unit finale: 1443/1443. Bundle copiato offline con backup in delivery-offline-2026-09-19T19-15-51Z-2a7d68e0: verificati hash di 207 sorgenti e tutti gli asset del manifest, tre file aggiornati. Nessun processo avviato/fermato. Verifica HTTP resta assente.
Confronto visivo: ispezionato anche screenshot canonico mockup-lab-1440x900-dark.png da bc0bd766 (hash documento094207523b3b76b01cd9aac27792ff2cc2f97ddd69cbd9757898fa558284460e). Doppia navigazione e densità filtri D-LAB03 rimangono; nessuna dichiarazione di parità R3. Comando Libera memoria è aggiunta esplicita owner.

Gate API Model Lab 1db7b950: http-routes-model-lab.test.mjs PASS, incluso contratto POST unload/runtimeId, validazione e runtime inesistente. Nessun unload sulla sessione owner.
