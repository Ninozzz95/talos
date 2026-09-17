# CP15 — riferimento approvato e regressioni

Il prototipo v03 approvato, esteso a 40 impostazioni, 14 temi e componenti custom, è ora sorgente ordinario sotto `harness-ui/frontend/prototypes/calm-lab`. Non è importato dal prodotto. Generatore e build ricostruiscono il singolo HTML usando contratti e token canonici del checkout. I dati del catalogo restano dimostrativi.

La review visiva del prodotto ha rilevato il numero duplicato negli slider dello Studio: il renderer non mostra il proprio valore se lo Studio possiede già output/unità. I driver delle suite precedenti ora usano i controlli visibili: conservati scenari e assert, nessun `force` su elementi nascosti.

La CI precedente 35271853056 sul commit 750dcb4 ha 45 verifiche backend/browser superate, 1173 test frontend superati e uno skip, zero errori/avvisi browser. La consegna sorgenti 35271852768 ha invece fallito due interazioni native nei driver: questo esito negativo è conservato e non viene coperto dal primo successo. Il nuovo candidato richiede una nuova esecuzione.

Il trasporto compresso è verificato con SHA-256 del pacchetto e JSON, conteggio/percorso/dimensioni, assenza dei destinatari e preimage dei file modificati; il workflow con diritto di scrittura e il payload vengono rimossi nello stesso commit. Nessun trasporto storico è rieseguito. Nessun merge, tag, release o modifica al profilo abituale.
