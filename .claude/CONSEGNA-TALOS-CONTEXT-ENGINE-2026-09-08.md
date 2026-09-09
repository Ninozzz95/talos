# Consegna TCEC — F3 parziale verificata, 2026-09-09

Archivio SQLite, adapter provider, ricerca/allegati/RTK integrati nel ramo codex/talos-context-engine. Controller iniziale con sintesi segmentata, validazione, checkpoint atomico, annullamento e ripresa. Non ancora integrato nella chat, nessuna qualifica modelli.
Verifica root: 58/58 test package; 556/556 kernel; 5/5 servizio desktop/rotte; 35/35 regressioni HTTP e rotte context. Adapter harness precedentemente verificati 58/58, invariati. SQLite e RTK reali; inferenza sintetica nei test del controller. Ricevute idempotenti conservate anche dopo riavvio/export; hook kernel conservano output integrali e chiusura delle chiamate annullate. Rotte e servizio iniettabili, non ancora cablati nel server. Root continua inline senza deleghe. Servizio 4174 invariato.

Owner: nessuna scelta.
Ulteriore fetta F3: registro e agente inoltrano hook context per le sole conversazioni abilitate; compattazione manuale delegabile alla pipeline comune. Risposte provider originali archiviate prima della normalizzazione. Trasporto sintesi tramite routing/SDK esistenti, nessun retry o tool. Riserva inviata davvero al provider. 472/472 regressioni registro/agente e 46/46 routing/provider/integration; kernel completo verde con la nuova prova (557 test). Wiring server e UI ancora da completare.

Io dopo: completare composizione runtime, contatori, scheduler e UI.
Rimane: integrazione completa, qualifica reale, revisione ingegneristica finale e prova owner.
