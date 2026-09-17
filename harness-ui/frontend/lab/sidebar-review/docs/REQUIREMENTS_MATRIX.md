# Matrice di scope e copertura

Riferimento: richieste originali File/Agenti e vincoli desktop/sidebar destra; ultimo mandato: conservare la versione approvata, alleggerire File e fare un ulteriore passaggio di review. Questa matrice evita che la demo venga interpretata come completamento del refactor ambizioso iniziale.

| Richiesta | Stato in questa consegna | Limite / passo restante |
| --- | --- | --- |
| Coerenza Calm e modifica conservativa | Palette e shell approvate conservate; File alleggerita | Font fallback; niente parità con app avviata |
| Dettaglio agente non blocca altre tab | Guardia CSS operativa e fixture ampliata; stato indipendente nella demo | Verifica routing e sessione viva ancora necessaria |
| Navigazione, ricerca, multi-select e operazioni file | Interazioni locali migliorate e testate | Nomi come ID; non filesystem reale |
| Ricerca nome/percorso, testo, estensione, fuzzy e regex | Ricerca sui dati demo; regex limitata dichiarata | Nessun indice repository reale |
| Semantica, simboli e linguaggio naturale | Non integrati; azioni preparano bozze dove previsto | Richiedono servizio/indice e provenienza risultati |
| Cartelle, drag-and-drop, metadati/history/Git | Alcuni flussi dimostrativi, badge da fixture | Non tutti i requisiti originari sono implementati; nessuna equivalenza Git reale |
| Attività degli agenti nei file e collegamenti bidirezionali | Link file → agente e agente → file della fixture | Attività, motivi e tempi non arrivano da stream reali |
| Refactor/test in area isolata e Review | Proposta immutabile demo; conflitto blocca integrazione demo | Nessun worktree, test AI o merge backend |
| Lista/dettaglio agenti e sessioni | Conservati, controlli di navigazione e contesti ampliati | Non misurata scala centinaia di agenti |
| Diagramma, scope, filtri, pan/zoom, collasso e split | Interazioni del laboratorio conservate | Otto fixture, layout predisposto, non renderer industriale di grandi DAG |
| Replay e realtime | Timeline/evento dimostrativi | Nessuna ricostruzione event-sourced completa né stream vivo |
| Virtualizzazione e performance | Dataset di 1.000 file aggiuntivi, geometria e focus robusti | Non benchmark repository enorme o SLA realtime |
| Tastiera, menu, resize e stati | Copertura browser mirata desktop | Screen reader/contrasto completo e ogni percorso non certificati |
| Code review, engineering review, checkpoint e handoff | Documentati e versionati nella stessa PR | Reviewer indipendente e verifiche finali runtime ancora richiesti |
| Backend, navigazione principale, mobile | Nessuna modifica | Fuori scope per scelta |

Le viste minime Context e Processi del laboratorio servono a verificare l'indipendenza della navigazione. Non costituiscono un refactor di quelle aree nel prodotto. Il benchmark documentato sostiene le scelte di questo passaggio, non una dichiarazione di superiorità rispetto ai prodotti citati.
