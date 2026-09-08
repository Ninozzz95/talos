# Qualificazione Autocompact — fase esecutiva in corso

08/09/2026. Banco isolato implementato in `harness-ui/benchmarks/autocompact`. Nessuna API pubblica, modale o funzione prodotto modificata.

## Verificato

- Pi 0.85.1: pacchetto reale e API pubblica esercitati.
- Hermes v2026.9.7: commit `2237be355906fbe6065ce1815711eee52b2d646e`, 12.173 blob verificati. Blocco HTTP 429 risolto con GitHub Git/GraphQL. Installazione owner invariata.
- LCM `8d1b1e6d3d63f5fc7b209e8d7ec1dc9b814f2e54`: plugin reale acquisito. Entrambi i worker Hermes/LCM si avviano con home isolate e moduli dal pin.
- Copia checkpoint 6, 406 messaggi, SHA-256 `b469c103933f7c71f30090309fc6aeb4d335d2c8639a156e8226a68e5bc22311`.
- Consenso owner per liberare temporaneamente il modello inattivo della 4174 e ripristinarlo a fine prove. Liberato tramite UI, nessun giro attivo nelle sei sessioni osservate.
- 18 test controllati verdi, nessuno saltato. Limiti e confini nel README.

## Prima tranche reale

Artefatti: `scratchpad/prove/autocompact-qualification-20260908/runs/2026-09-08T15-21-39.086Z`. Nemotron Q4_0, hash GGUF verificato, finestra 16384, temperatura 0, seed 193, output 4096. Endpoint di conteggio installato funzionante.

| Componente / scenario | Esito osservato |
|---|---|
| TALOS / ripresa | 3/3 rifiuti: richiesta di sintesi 21.964 token contro finestra 16.384 |
| Pi API / ripresa | 3/3 rifiuti: richiesta di sintesi 18.208 token contro finestra 16.384 |
| TALOS / memoria sintetica | 3/3 con cinque riferimenti esatti dopo cinque compattazioni; 120, 118, 92 secondi |
| TALOS / file | 3/3 letture reali; prima tranche con domanda libera, da rivalutare rispetto al nuovo criterio a valore esatto |
| TALOS / continuità del banco | 3/3; nuovo processo lettore del checkpoint, non riavvio completo dell'app |

La prima tranche si è terminata senza summary finale durante i successivi scenari Pi. I 15 casi conclusi sono salvati; non si attribuisce successo al caso interrotto. Le correzioni del banco successive all'avvio non vengono attribuite retroattivamente a questa tranche.

## Costi di integrazione osservabili

| Candidato | Confine provato | Lavoro residuo nel prodotto |
|---|---|---|
| TALOS | Funzione Node e callback locale | Budget prima della sintesi, storico oltre finestra, checkpoint transazionale e stop |
| Pi | Pacchetto Node MIT; 165 dipendenze installate nel banco | Adapter messaggi, segmentazione/riserve, verifica vuoto/annullamento, archivio TALOS; dipendenze CLI/TUI da valutare |
| Hermes | Compattatore Python MIT | Sidecar/host, dipendenze, ciclo di vita, routing ausiliario, archivio/store |
| Hermes + LCM | Plugin MIT, motore e SQLite caricati | Costo host più DB/migrazioni, indicizzazione, tool di recupero, policy e sessioni |

Nessuna stima in giorni inventata. Raccomandazione provvisoria: non promuovere un engine. La API Pi da sola non risolve la ripresa oltre limite; servono le prove degli altri candidati e una scelta di architettura con l'owner.

**Cosa deve fare l'owner:** nessuna scelta ora. **Cosa faccio io dopo:** casi mancanti e ripristino modello 4174. **Cosa rimane:** confronto completo, guasti nativi, decisione engine, backend, modale e verifica dalla chat.
