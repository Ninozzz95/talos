# Contratto delle tracce

Questo formato è del kit indipendente, non un protocollo dichiarato da TALOS.

Un documento JSON schema_version=1 descrive un task e un unico clock monotono. metadata include scope (desktop, backend, fixture), event_origin (instrumented, manual, fixture), run_id, clock_id, product, build_identity, task_identity e model_identity. I campi identificativi sono stringhe non vuote, al massimo 256 caratteri. Una fixture deve avere contemporaneamente scope=fixture ed event_origin=fixture. Questa regola impedisce errori accidentali, non falsificazioni intenzionali.

Ogni evento ha event, run_id, clock_id, mono_ms finito e non negativo. La sequenza deve essere ordinata temporalmente. Eventi ammessi: task_submitted, provider_request_started, provider_first_token, renderer_first_token, tool_started, tool_finished, task_verified, task_failed, cancel_requested, task_quiescent.

Per gli eventi provider/renderer è obbligatorio request_id: il primo token deve seguire la richiesta e il render deve seguire l'ingest della stessa richiesta. Sono ammesse molte richieste per task. Per i tool è obbligatorio tool_call_id e la fine deve seguire l'inizio; outcome della fine è ok, failed o cancelled. I tool incompleti vengono conteggiati, non eliminati.

Gli eventi di task sono singleton. Non sono ammessi insieme task_verified e task_failed. Il verificatore positivo richiede verifier_exit_code=0, ma l'analizzatore non esegue quel verificatore: archiviare il log separatamente. Le coppie utilizzate per le differenze temporali devono rispettare la causalità; non viene certificata una macchina a stati completa dell'agente.

Le metriche provider_ttft_ms descrivono tempo richiesta-primo token osservato, non sola inferenza; first_token_ingest_to_render_ms descrive ritardo ingest-render della stessa richiesta. user_to_first_rendered_token_ms richiede anche task_submitted. Le metriche non osservabili rimangono null. I percentili sono descrittivi, senza intervalli di confidenza o ranking.

I marker della sonda renderer sono manuali; le sonde Node e renderer hanno clock separati. Non rinominare i clock per far superare il controllo: occorrono un osservatore comune oppure una calibrazione verificata esterna al kit. I log degli strumenti non devono contenere prompt, contenuti del progetto o segreti; utilizzare ID opachi.

La campagna in campaign.json non è eseguibile finché non vengono definiti build, modello, fixture, driver desktop e verificatore. Non contiene misure o risultati simulati.
