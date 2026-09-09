# Risultati TCEC — 2026-09-08

2026-09-09T09:46:18+02:00: package 59/59 fresco. Gruppo server/config/runtime/counter/integration/owner 84/84 verde. Suite ampliata includendo kernel, native-provider, model-destination, context-provider, context-routes, desktop-service e scheduler: exit 0. Controllo server su processo Node reale e due avvii, SQLite reale; inferenza assente. Nuovi RED: plugin OpenRouter lasciato attivo, export helper contatore assente, reasoning sessione assente, directory trial bianca accettata; tutti GREEN dopo correzione. Primo RED plugin era invece fixture senza endpoint, corretta prima di riprodurre il difetto. Nessuna qualifica prestazionale o prova visuale nuova.

Ultima verifica 2026-09-09: package 59/59; scheduler 5/5; composizione runtime con SQLite e riavvio reale 5/5; kernel completo aggiornato 558 test e insieme interessato integration/provider/counter exit 0. Priorita/preemption sono provate con operazioni controllate, non con GGUF. Il primo cleanup della fixture Windows ha dato EBUSY per ordine dei teardown: corretto, esito successivo verde senza force-exit. Nessuna nuova inferenza reale.

Non qualificato. Nessuna nuova inferenza eseguita. Conservare separati i risultati del banco precedente.

2026-09-09: package npm test 56/56; adapter harness 58/58. SQLite WAL/backup/FTS5/sqlite-vec Windows e filtro RTK verificati con componenti reali. Le sintesi del controller sono fixture controllate: non rappresentano benchmark dei modelli. Correzioni RED/GREEN della concorrenza riportate nel ledger.

F3 parziale, 2026-09-09: package 58/58; kernel completo 556/556; servizio desktop/rotte 5/5; suite HTTP completa interessata e rotte context 35/35. Le suite condividono una prova HTTP: non sommare i conteggi come test distinti. La regressione OPTIONS legacy e il mancato salvataggio del risultato tool annullato sono stati osservati RED e corretti GREEN. Nessuna nuova inferenza o qualifica prestazionale.

F3 collegamento, 2026-09-09: 472/472 registro/agente; 46/46 integration e routing/provider; 6/6 servizio desktop; kernel completo verde con 557 prove. I gruppi possono condividere prove di integrazione. Controllati inoltro hook, errore archivio prima dell'inferenza, trasporto locale senza fallback, rifiuto tool nella sintesi, riserva risposta nel corpo. Inferenze controllate: non costituiscono qualifica modelli.
