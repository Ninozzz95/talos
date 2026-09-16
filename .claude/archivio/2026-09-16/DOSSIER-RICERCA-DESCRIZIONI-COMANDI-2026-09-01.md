# Dossier di ricerca — descrizioni umane dei comandi

Data: 2026-09-01  
Perimetro: Harness UI desktop; mobile in sola lettura.  
Finding owner: nello screenshot `C:\Users\Antonino\Downloads\awdadw.png`, il gruppo espanso mostra righe generiche come “1 comando eseguito” e “1 comando fallito”; l’intento leggibile è assente e il comando grezzo diventa l’unico contenuto informativo.

## Fonti primarie verificate

1. Anthropic, **Create a Message / tool use**  
   https://platform.claude.com/docs/en/api/messages/create  
   Il modello produce l’oggetto JSON di input del tool secondo `input_schema`; l’applicazione esegue il tool e conserva il `tool_use` come evidenza.
2. Anthropic, **Define tools / tool reference**  
   https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool  
   Nomi, descrizioni del tool, nomi degli argomenti e descrizioni degli argomenti entrano nel contesto del modello. Il contratto va quindi dichiarato nello schema, non ricostruito dopo l’esecuzione.
3. OpenAI, **Function calling / API reference**  
   https://platform.openai.com/docs/api-reference  
   Gli argomenti sono JSON generato dal modello; `parameters` è JSON Schema e `required` definisce i campi necessari. Gli argomenti devono comunque essere validati dal chiamante.
4. Hermes Agent, **display.py**  
   https://github.com/NousResearch/hermes-agent/blob/main/agent/display.py  
   Hermes mantiene verbi amichevoli deterministici per tool noti e usa anteprime degli argomenti; non pretende di inferire localmente l’intento di un comando shell arbitrario.
5. Hermes Agent, **CLI interface**  
   https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/cli.md  
   Il feed operativo separa una riga compatta leggibile dall’output dettagliato e permette di regolare la verbosità.

## Evidenza locale

- `harness-ui/public/app.js` sa già preferire `argomenti.descrizione` durante l’esecuzione di `shell`, ma a conclusione sostituisce il testo con “1 comando eseguito/fallito”.
- Il runtime owner mobile, letto senza modificarlo in `C:\Users\Antonino\Desktop\projects\AVM\mobile\scripts\harness-talos\talosHarness.mjs`, dichiara per `shell` soltanto `comando`; il modello non ha quindi un campo contrattuale nel quale fornire la descrizione.
- `harness-ui/src/runtime-owner-adapter.mjs` è il confine desktop già esistente verso il runtime owner ed è il punto corretto per adattare la richiesta senza copiare o modificare il runtime mobile.

## Decisione upstream

**Adattare dietro un adapter AVM-owned.**

- Solo lo schema del tool AVM `shell` viene arricchito sul confine desktop con `descrizione`, stringa breve e obbligatoria, prodotta dal modello in italiano.
- Non si mutano gli schemi di MCP, plugin, Forge o tool terzi: potrebbero vietare proprietà aggiuntive e una modifica trasversale sarebbe una regressione di contratto.
- La UI conserva la descrizione nella stessa riga da start a end. Il comando grezzo e l’esito restano nel dettaglio espandibile per audit.
- Le sessioni storiche e i provider che non restituiscono `descrizione` mantengono il fallback attuale: nessuna riga vuota e nessuna perdita di evidenza.

## Confronto one-up

| Prodotto | Punto di forza | Limite | Scelta TALOS |
|---|---|---|---|
| Claude Code | Intento leggibile per Bash, dettaglio tecnico disponibile | Contratto interno non riusabile direttamente | Campo modello esplicito nel solo schema `shell` desktop |
| Hermes | Etichette deterministiche stabili per tool noti | Un comando arbitrario resta sintetizzato dal parser locale | Fallback deterministico per file/query; intento del modello per shell |
| OpenAI/Codex | Tool arguments strutturati e validabili | La UI deve decidere come presentarli | Contratto canonico + renderer persistente start/end |

## Pin e rollback

- Pin documentale: fonti consultate il 2026-09-01; nessun nuovo pacchetto o runtime.
- Rollback: rimuovere l’adattamento `shell.descrizione` dall’owner adapter e ripristinare il fallback generico nella UI. Nessun dato persistito richiede migrazione.
