# P-K-bis e P-L-bis — registro di esecuzione e rapporto

Data: 12/09/2026. Sottosistema: TALOS UI e integrazione del backend locale harness. Astra, singolo esecutore; nessun agente delegato. Stato iniziale del worktree pulito. Nessun commit, installazione, account cloud o porta 4174.

**Stato della consegna: implementazione autorizzata su disco; integrazione finale non chiusa.** Sono necessarie cinque righe oltre i blocchi consentiti, consegnate come diff separato e verificate solo in memoria. Sul disco restano quattro test rossi; non viene dichiarato completo P-L-bis. La richiesta di autorizzazione alle prime due righe non ha ricevuto risposta durante il lavoro; il diff è stato poi completato con le tre registrazioni dell'errore HTTP.

Il checkout effettivamente verificato è **HEAD staccato `122ce7a15e6ac71f204a94b63258c16710279845`**, radice `C:/Users/Antonino/AppData/Local/Temp/claude/wt-astra-pklbis`. Non è stato cambiato ramo né spostato HEAD.

## Ricerca prima delle modifiche

Fonti ufficiali consultate il 12/09/2026 (la data è di consultazione, non di pubblicazione):

- [Azure OpenAI v1](https://learn.microsoft.com/en-us/azure/foundry/openai/api-version-lifecycle): `model` contiene il nome della distribuzione; un elenco dei modelli base non identifica le distribuzioni della risorsa.
- [Vertex, Chat Completions](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/samples/generativeaionvertexai-gemini-chat-completions-non-streaming): richiesta all'endpoint del progetto e della regione, con `model: "google/gemini-2.0-flash-001"`. Si conserva l'identificatore esplicito del publisher/modello senza dedurre disponibilità.
- [Claude Code, configurazione dei modelli](https://code.claude.com/docs/en/model-config): nomi del fornitore e alias configurabili, `availableModels` per limitare la scelta; non equivale sempre a una lista arbitraria di modelli personalizzati.
- [aider, alias](https://aider.chat/docs/config/model-aliases.html) e [impostazioni avanzate](https://aider.chat/docs/config/adv-model-settings.html): alias espliciti e lista YAML di impostazioni per nome del modello.
- [LiteLLM, configurazione](https://docs.litellm.ai/docs/proxy/configs): `model_list`, nome pubblico `model_name` e destinazione `litellm_params.model` distinti.
- [Zed, agenti esterni](https://zed.dev/docs/ai/external-agents): `agent_servers` con comando, argomenti e ambiente; selezione nel menu dei nuovi thread.
- [JetBrains, ACP](https://www.jetbrains.com/help/ai-assistant/acp.html): `acp.json`, nome visualizzato come chiave di `agent_servers`, percorso eseguibile, `args` ed `env`.
- [ACP v1, inizializzazione](https://agentclientprotocol.com/protocol/v1/initialization): negoziazione e `agentInfo` prima della creazione della sessione; la sonda può chiudere dopo `initialize`.

Decisione upstream: adattare le liste esplicite dietro le preferenze AVM v1; mantenere Azure OpenAI v1 e Vertex v1 già integrati. Riutilizzare direttamente il trasporto già fissato `@modelcontextprotocol/client` **2.0.0** (MIT), ACP protocollo **1**, schema di riferimento SDK ACP **1.4.0**, Zod **4.5.4**. Nessuna dipendenza nuova. Non integrare i runtime Claude Code/aider/LiteLLM/Zed/JetBrains: sono riferimenti di configurazione, non componenti necessari a questa estensione. Il loro dizionario `env` viene adattato a soli nomi, secondo il requisito dell'owner. Gate upstream: trasporto installato vero con processo finto; cloud solo risposte controllate, nessuna generazione remota.

## Piano puntuale, scritto prima del codice prodotto

File da modificare:

1. `src/provider-credential-store.mjs`: `createProviderCredentialStore`, `getRuntime`, `setRuntime`, `listPublic`, `resetEndpoint`, lettura/scrittura v1; validazione privata dei modelli. Conservare `PROVIDER_IDS`, `PROVIDER_DEFINITIONS`, `ProviderCredentialError` e API delle chiavi. L'agente entra nell'elenco pubblico e nelle preferenze, non nel portachiavi.
2. `src/acp-agent.mjs`: `leggiRuntimeAgenteEsterno` legge `runtime.agente` prima del formato applicativo precedente e dell'ambiente; riutilizzare `validaRuntimeAgenteEsterno`; `connettiAgenteAcp` aggiunge opzione `soloInizializzazione`, default compatibile. Nessun nuovo protocollo.
3. `src/provider-probe.mjs`: `createProviderProbe`, `prova`, `elencaModelli`; lista locale Azure/Vertex e aggiunta deduplicata Bedrock; sonda agente solo initialize, elenco senza spawn. Capacità configurate ignote.
4. `src/http-app.mjs`: solo blocco `// P-K-bis` della rotta runtime: whitelist, oggetti rigorosi, campi coerenti col fornitore. Correzione GET `/models` separata in diff, in attesa di autorizzazione per il blocco aggiuntivo.
5. `src/provider-registry.mjs`: cambio `esterno.catalogo.inUI` separato in diff, in attesa di autorizzazione perché il vincolo permette solo campi additivi.
6. `frontend/src/components/provider-card.js`: `creaProviderCard`, `aggiornaProviderList`, `etichettaOrigineChiave`; campi multiriga, salvataggio locale tramite client HTTP esistente, conservazione bozze e focus. Agente senza campo chiave; due azioni visibili. Cloud conserva menu ⋯ e azioni esistenti.
7. `frontend/src/components/fonti-modelli.js`: `PROVIDER_DIRETTI`, `fontiDelSelettore`, `fraseVuotoDiretto`; esterno senza chiave e visibile soltanto con la destinazione predefinita restituita. Un errore in app.js viene rappresentato da `[]`: non deve far comparire l'agente.
8. `tests/provider-pkl-bis.test.mjs` (nuovo): PKLB-PREF, PKLB-INVALID, PKLB-HTTP, PKLB-CATALOG, PKLB-ACP e regressioni nominate.
9. `frontend/tests/unit/provider-pkl-bis.test.mjs` (nuovo): corpo di salvataggio e scheda; prove DOM tramite browser già installato se non esiste DOM per Node.
10. `frontend/tests/unit/fonti-modelli.test.mjs`: visibilità in entrambi i versi.
11. `tests/provider-pl.test.mjs`: aggiornare caratterizzazione `inUI` solo dopo autorizzazione.
12. `tests/provider-registry-parita.test.mjs`: aggiungere parità delle preferenze pubbliche senza alterare universo delle credenziali.

File di consegna: questo rapporto e `.claude/DIFF-PKL-BIS-DA-AUTORIZZARE.patch`. Fixture esistente `tests/fixtures/acp-agent-finto.mjs` riutilizzata senza avviare agenti veri. Nessun file da eliminare. Eventuali nuovi file di prova saranno enumerati qui prima della creazione.

RED atteso: campi ignorati/rifiutati, `esterno` non riconosciuto dalle preferenze e dal catalogo, sonda non disponibile; selettore privo di agente. GREEN: `node --test tests/provider-pkl-bis.test.mjs`; unit frontend nuovi e quelli richiesti. Regressioni: otto file backend richiesti e tre frontend richiesti, quindi suite pertinenti provider/modelli e build frontend verso cartella temporanea se supportata. `git diff --check`. Nessuna installazione; risolutore `--import` solo se necessario (prima prova P-L: 14/14 senza risolutore).

Prova visibile: schede cloud/agente e selettore, larghezze desktop/mobile, tastiera, errore, ricaricamento delle preferenze; solo fixture. Nessun percorso reale composer-cloud autorizzato. Rollback: rimuovere esclusivamente gli hunk P-K-bis/P-L-bis e i nuovi file; nessun reset del worktree. Le preferenze restano `version: 1` e le righe vecchie senza campi nuovi restano valide.

Direzione visiva (skill frontend-design letta): conservare palette, caratteri, spaziatura e classi TALOS già presenti; campi allineati a sinistra, multiriga a larghezza della scheda, nessuna nuova decorazione o animazione. Le modifiche chiariscono cosa si salva e non introducono nuovi gruppi di bottoni cloud.

## Registro degli emendamenti e delle prove RED

Emendamento prima del relativo file: il nuovo test HTTP importa `context-engine`, che non risolve Zod. Aggiungo `tests/fixtures/risolutore-pkl-bis.mjs`, solo prova tramite `--import`, che risolve esclusivamente Zod dal pacchetto già installato nell'harness quando il chiamante appartiene a context-engine. Nessuna installazione. Il client HTTP della regia legacy non è esportato: la scheda avrà un salvataggio Fetch locale, iniettabile nei test, con lo stesso envelope e la stessa base `__talosHarnessApiBase`; non si altera app.js.

RED backend: 18/18 falliti per i comportamenti mancanti, dopo risoluzione Zod. RED unit frontend: quattro nuovi scenari falliti, 16 precedenti verdi. Regressione permanente PKLB-ORDINE: inserire l'agente in testa altera l'ordine dei fornitori esistenti (due test esistenti rossi, inclusa BC50-01); l'agente viene aggiunto in coda. Il nuovo banco browser sarà `frontend/tests/unit/provider-pkl-bis-dom.test.mjs`: Playwright già installato, server locale effimero, nessuna porta condivisa; genera screenshot nella cartella temporanea di prova. Esporta soltanto due nuove funzioni prodotto: `leggiCollegamentoProvider`, `salvaCollegamentoProvider`.

Revisione visiva: PKLB-REG-RIGHE aggiunto prima della correzione: la classe input impone 40 px anche alle textarea e taglia gli argomenti. Si imposta altezza minima di 88 px e carattere ereditato sul solo campo multiriga. PKLB-UI-STATO distingue «Agente raggiunto» dal conteggio modelli. Screenshot di consegna aggiunti: `.claude/PKL-BIS-desktop.png`, `.claude/PKL-BIS-mobile.png`. Documentazione Playwright Browser/Page consultata il 12/09/2026; libreria installata fissata **1.62.1**.

Revisione prima delle correzioni finali: PKLB-REG-TIMEOUT protegge il default legacy dei fornitori non cloud; PKLB-REG-CUSTODIA vieta negli argomenti anche i valori delle chiavi già nel portachiavi, non solo nell'ambiente; PKLB-REG-SCRITTURA verifica il rollback in memoria se il file non è scrivibile. PKLB-HTTP-VUOTO riproduce una lacuna precedente: `CATALOG_CONFIGURATION_REQUIRED` non è registrato nelle tabelle HTTP e diventa 500. La correzione appartiene a un altro blocco vietato di http-app e sarà consegnata nel diff non applicato, finché non autorizzata.

Emendamento di verifica: aggiungo `tests/fixtures/verifica-diff-pkl-bis.mjs`, loader **solo di prova** che applica in memoria le cinque righe del diff non autorizzato (due sostituzioni e tre registrazioni dell'errore HTTP). Il file prodotto resta invariato. Consente di rendere verificabile la proposta completa, senza oltrepassare i limiti sui file. `tests/provider-pl.test.mjs` viene aggiornato al nuovo contratto richiesto `inUI: true`; sul disco, finché il diff non viene applicato, il test resta rosso e viene dichiarato tale. Nessuna attenuazione dei controlli di parità.

File di evidenza da creare prima della consegna: `.claude/PKL-BIS-test-disco.log`, `.claude/PKL-BIS-test-proposta.log`, `.claude/PKL-BIS-test-frontend.log`, `.claude/PKL-BIS-test-regressioni.log`. Conservano soltanto test con dati finti. Il diff viene rigenerato in formato unificato valido da Git, usando copie temporanee e senza `git apply` sul worktree.

PKLB-REG-CINQUANTA: il corpo runtime precedentemente limitato a 16 KiB può respingere cinquanta modelli tutti validi per lo store. Prima della correzione aggiunta prova HTTP con 50 id da 200 caratteri e nomi da 120. Adeguare soltanto il limite della rotta runtime: 64 KiB per collegamenti e 1 MiB per agente (argomenti limitati dallo schema); la rotta chiavi conserva 16 KiB. Modifica circoscritta alla lettura del corpo runtime, marcata P-K-bis.

Esito RED di PKLB-REG-CINQUANTA: connessione chiusa durante la lettura del corpo (`UND_ERR_SOCKET`); GREEN dopo correzione. I fornitori non cloud conservano 16 KiB. `tests/provider-registry-parita.test.mjs`, previsto nel piano, non è stato modificato: la nuova prova delle preferenze pubbliche è già in `tests/provider-pkl-bis.test.mjs`, mentre la parità esistente deve continuare a segnalare il registro non aggiornato.

## Comportamento consegnato

- I tre cloud conservano `modelli` nelle preferenze v1. Lista massima 50, id massimo 200 caratteri, nome facoltativo massimo 120. Duplicati, campi extra, id vuoti, URL, caratteri di controllo e valori delle chiavi note vengono respinti. Azure ammette nomi di distribuzione; Vertex/Bedrock anche `/`, `:`, `@` secondo il contratto esistente degli id. Una lista omessa conserva la preferenza precedente; `[]` la svuota. Il ripristino dell'indirizzo conserva i modelli.
- Azure/Vertex restituiscono solo la lista configurata con fonte `configurazione`, credenziale non verificata e capacità ignote, senza rete. Bedrock conserva il catalogo letto e aggiunge gli id configurati mancanti; i duplicati restano rappresentati dal catalogo e gli errori remoti non vengono nascosti.
- `esterno` compare in `listPublic` e nelle preferenze, senza entrare in `PROVIDER_IDS` o nel portachiavi. `getRuntime` restituisce una copia indipendente. Le credenziali presenti nell'ambiente e quelle note alla custodia non possono essere copiate negli argomenti salvati.
- L'agente viene scelto dalle preferenze prima della configurazione ambientale. La prova avvia solo la fixture, invia `initialize`, attende e chiude; nessun `session/new` o prompt durante la sonda. Il catalogo legge la configurazione senza avviare processi. Dopo una prova positiva può mostrare il nome restituito dall'agente; dopo riavvio usa «Agente esterno» fino a una nuova prova.
- La scheda cloud aggiunge un campo multiriga e salva con l'azione esistente nel menu ⋯. La scheda agente mostra i cinque gruppi richiesti, senza campo chiave. «Salva collegamento» invia un unico POST e aggiorna il pannello attraverso il comando «Aggiorna» già collegato dalla regia. Bozze e focus sopravvivono al ridisegno, compresi i campi multiriga.
- La fonte `esterno` è senza chiave e viene aggiunta in coda. Diventa visibile soltanto con `esterno:predefinito` restituito nel catalogo: `null`, `[]` e risposte con id estranei non la rendono selezionabile. Il router P-L non è stato modificato.

## Formato delle preferenze

Esempio senza segreti; i percorsi sono illustrativi e devono corrispondere a un eseguibile e a una cartella esistenti. Il valore di `ACCESSO_AGENTE` appartiene all'ambiente del processo server, mai a questo file.

```json
{
  "version": 1,
  "providers": {
    "azure": {
      "endpoint": "https://risorsa-esempio.openai.azure.com/openai/v1",
      "endpointConfigured": true,
      "timeoutSeconds": 60,
      "modelli": [{ "id": "distribuzione-lavoro", "nome": "Lavoro" }]
    },
    "vertex": {
      "endpoint": "https://aiplatform.googleapis.com/v1/projects/progetto-esempio/locations/global/endpoints/openapi",
      "endpointConfigured": true,
      "timeoutSeconds": 60,
      "modelli": [{ "id": "google/gemini-2.5-flash" }]
    },
    "esterno": {
      "agente": {
        "comando": "C:\\Program Files\\nodejs\\node.exe",
        "argomenti": ["C:\\Agenti\\ponte.mjs"],
        "cwd": "C:\\Progetti\\lavoro",
        "variabiliAmbiente": ["ACCESSO_AGENTE"],
        "timeoutMs": 180000
      }
    }
  }
}
```

Il campo UI dei modelli contiene gli id, uno per riga; conserva il `nome` già salvato per gli id rimasti nella lista. Il tempo dell'agente è mostrato in secondi e trasmesso in millisecondi, fra 50 ms e 3.600.000 ms. Non vengono salvate capacità dichiarate dall'utente. Nessuna migrazione: i file v1 precedenti restano leggibili.

## File effettivamente toccati

Percorsi relativi a `harness-ui/`, righe della versione consegnata:

| File | Righe / contenuto |
| --- | --- |
| `src/provider-credential-store.mjs` | 14 import; 177 validazione modelli; 193 agente; 202/241 lettura e scrittura; 424/435 runtime; 468 ripristino; 477 elenco pubblico |
| `src/acp-agent.mjs` | 74 precedenza preferenze; 106 opzione initialize; 221 nome pubblico; 225 uscita senza sessione |
| `src/provider-probe.mjs` | 133 dipendenze; 139 configurazione agente; 146 metadati ignoti; 152 prova; 294 cataloghi; 388 unione Bedrock |
| `src/http-app.mjs` | 3314 limite del solo corpo runtime; 3346 whitelist/runtime; nessun altro blocco modificato |
| `frontend/src/components/provider-card.js` | 3 stato; 19 badge agente; 35 multiriga; 41 corpo; 53 POST; 62 campi agente; 125 scheda; 251 conservazione bozze |
| `frontend/src/components/fonti-modelli.js` | 148 fonte esterno; 191 visibilità; 228 stato vuoto |
| `tests/provider-pl.test.mjs` | 20 caratterizzazione del selettore richiesta da P-L-bis |
| `tests/provider-pkl-bis.test.mjs` | nuovo, riga 1: 23 scenari backend, compresi i versi negativi |
| `tests/fixtures/risolutore-pkl-bis.mjs` | nuovo, riga 1: risoluzione Zod esclusivamente per context-engine |
| `tests/fixtures/verifica-diff-pkl-bis.mjs` | nuovo, riga 1: proposta applicata solo in memoria per verificarla |
| `frontend/tests/unit/provider-pkl-bis.test.mjs` | nuovo, riga 1: quattro prove di stato/corpo/trasporto |
| `frontend/tests/unit/provider-pkl-bis-dom.test.mjs` | nuovo, riga 1: due prove Chromium con schede vere e backend HTTP locale |
| `frontend/tests/unit/fonti-modelli.test.mjs` | 16: selettore esterno nei due versi |
| `.claude/RAPPORTO-PKL-BIS-2026-09-12.md` | questo rapporto e piano esecutivo |
| `.claude/DIFF-PKL-BIS-DA-AUTORIZZARE.patch` | diff unificato non applicato, cinque righe |
| `.claude/PKL-BIS-test-disco.log` | comando completo e risultati del codice su disco |
| `.claude/PKL-BIS-test-proposta.log` | comando completo e risultati della proposta in memoria |
| `.claude/PKL-BIS-test-frontend.log` | unit e prove browser sui file effettivi |
| `.claude/PKL-BIS-test-regressioni.log` | pool, destinazione, fallback, P-I e P-J con proposta in memoria |
| `.claude/PKL-BIS-desktop.png` | screenshot verificato, viewport 1440×1000, errore di salvataggio visibile |
| `.claude/PKL-BIS-mobile.png` | screenshot verificato, viewport 390×844, nessuna eccedenza orizzontale |

La fixture `tests/fixtures/acp-agent-finto.mjs` è riutilizzata senza modifiche. Nessun file cancellato.

## Diff non applicato e motivo del blocco

Il [diff completo](DIFF-PKL-BIS-DA-AUTORIZZARE.patch) aggiunge tre registrazioni di `CATALOG_CONFIGURATION_REQUIRED` (codice, HTTP 422, messaggio umano), esclude ACP da `catalogoFornitoriFn` nella rotta GET e imposta `esterno.catalogo.inUI: true`. `git apply --check` passa; il diff non è stato applicato.

La conferma serve esclusivamente per i limiti espliciti della consegna: **«src/http-app.mjs (SOLO la rotta runtime e la sua validazione)»** e **«src/provider-registry.mjs (solo campi additivi)»**. Non deriva dalla skill. Servono tre eccezioni di blocco: GET `/models`, tabelle degli errori HTTP, valore `esterno.catalogo.inUI`. Nessuna modifica a `server.mjs` o ad `app.js` è necessaria.

Senza il diff, GET `/providers/esterno/models` restituisce 404 perché la rotta deriva dal registro `inUI: false`; i cataloghi cloud vuoti diventano 500 perché il codice d'errore manca dalla tabella HTTP. L'elenco dell'agente quindi **non è ancora utilizzabile dal selettore in produzione**. I quattro test rossi vengono mantenuti per dimostrare questa dipendenza.

Diff verificato dei file vietati: **vuoto** per `server.mjs`, `src/session-registry.mjs`, `src/agent-service.mjs`, `src/kernel/`, `src/research*`, `src/contesto-del-progetto.mjs`, `src/usage-cache.mjs`, `frontend/src/legacy/app.js`, `frontend/index.template.html`, `package.json`, `package-lock.json`, `mobile/`, `control-plane/`, `core/`, `docs/`. Anche `src/provider-registry.mjs` è invariato su disco. I file della sessione parallela BC-48 C non sono stati toccati.

## Verifica finale

Tutti i comandi completi sono nella prima riga dei log. Sono eseguiti con `rtk proxy`; `rg` non è disponibile, quindi l'ispezione usa filesystem Node. `rtk git` non accede alla configurazione Claude: usato `rtk proxy git`, senza modificare variabili HOME.

| Gate | Test | Passati | Falliti | Saltati |
| --- | ---: | ---: | ---: | ---: |
| Otto file backend richiesti e nuovo, **codice su disco** | 123 | 118 | 4 | 1 |
| Gli stessi file, **diff caricato soltanto in memoria** | 123 | 122 | 0 | 1 |
| Frontend: tre file richiesti + nuovi unit e DOM | 28 | 28 | 0 | 0 |
| Regressioni adiacenti sulla proposta: pool, destinazione, fallback, P-I, P-J | 80 | 79 | 0 | 1 |

Le quattro prove rosse su disco sono `PKLB-HTTP-VUOTO` (500 anziché 422), `PKLB-HTTP-02` (404 dell'agente), `PL-REG-01` e `PAR-05` (`inUI: false`). Il caricatore della proposta modifica esattamente i due moduli descritti nel diff; non modifica i test e fallisce se il testo atteso non corrisponde più. I log esistono su disco ma sono ignorati dalle regole Git del repository.

I controlli `PF-PAR-05` e `PI-PUB` confrontano JSON pubblici acquisiti separatamente, senza credenziali. Sono saltati dai test esistenti perché i relativi file di confronto non sono configurati. Nessun contatto cloud per colmare questi salti.

`git diff --check`: superato. Build standard `buildProduction` verso una cartella consentita `%TEMP%/talos-phase1-pklbis-*`: **fallita in due tentativi**, anche lanciando dalla cartella frontend. esbuild restituisce `Cannot read directory "../../../../../../..": Access is denied` e non risolve i tre entry point. Non è stato modificato il builder e non sono stati installati pacchetti. La prova Chromium carica i moduli e i CSS originali via server locale proprio; non sostituisce la build completa.

Le prove visibili coprono campi condizionali, menu cloud, due azioni agente, singolo POST senza doppio invio legacy, salvataggio/rilettura dopo ricreazione dello store, input malformato respinto con bozza conservata, focus dopo ridisegno, tastiera, movimento ridotto, sonda con PID chiuso e nessun prompt. Il router e il kernel P-L vengono inoltre provati con conversazioni della fixture su più turni, refusi e URL naturali.

## Cosa non ho verificato

Non ho verificato accessi cloud, disponibilità o generazione dei modelli configurati, credenziali reali, account Azure/AWS/Google, agenti installati dell'owner, portachiavi del sistema operativo, costo o risparmio. Non ho avviato il server dell'owner né usato la porta 4174. Il banco visivo riguarda le schede reali con un collegamento di prova alle API; non certifica il percorso completo del composer della pagina finale e la sua persistenza con un agente reale. Non è stata completata la build standard. Il nome dell'agente osservato dalla sonda resta in memoria e non viene scritto nelle preferenze.

## Testo di commit proposto

Da usare solo dopo autorizzazione/applicazione del diff e verifica finale su disco; nessun comando Git di scrittura è stato eseguito:

```text
feat(fornitori): modelli cloud configurati e agente esterno nel selettore

Conserva modelli e comando agente nelle preferenze pubbliche v1, valida i
campi e mantiene ignote le capacità non verificate. Collega le schede al
salvataggio runtime e prova l'agente con initialize e chiusura senza prompt.
Rende selezionabile la destinazione esterna e distingue configurazione
mancante da errore interno del catalogo.
```

## Cosa deve fare l'owner · Cosa faccio io · Cosa rimane

**Cosa deve fare l'owner:** approvare o rifiutare il diff completo di cinque righe, che richiede le tre eccezioni ai blocchi sopra indicati. Non servono account, chiamate a pagamento o agenti veri per questa approvazione.

**Cosa faccio io:** ho consegnato file, test, diff verificabile, ricerca ed evidenze. Dopo l'autorizzazione applico esclusivamente quel diff e ripeto i gate sui file reali, senza commit.

**Cosa rimane:** applicazione autorizzata del diff, azzeramento dei quattro test rossi sul disco, build standard in un ambiente dove esbuild possa leggere i percorsi necessari e verifica del percorso completo del composer nel banco finale. Fino ad allora P-K-bis/P-L-bis non vengono dichiarati chiusi.
