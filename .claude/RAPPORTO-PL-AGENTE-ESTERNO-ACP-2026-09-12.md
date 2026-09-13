# P-L · Agente esterno tramite ACP · 12 settembre 2026

## Registro di esecuzione, prima del codice

Responsabile: Astra; sottosistema integrazione fornitori e sicurezza del processo nel desktop Node. Nessun agente delegato. Base verificata `81e27a3b49f14a5019cefcc2e991e0243b071e3d`; il checkout risulta **HEAD staccato**, non un ramo locale agganciato a `lane/harness-desktop`. Stato iniziale senza modifiche. Nessun commit e nessuna porta 4174.

File esatti previsti: creare `src/acp-agent.mjs`, `tests/acp-agent.test.mjs`, `tests/provider-pl.test.mjs`, `tests/fixtures/acp-agent-finto.mjs`, `tests/fixtures/acp-v1-conformita.json`; modificare `src/provider-registry.mjs`, `src/model-destination.mjs`, `src/runtime-owner-adapter.mjs` (solo instradamento), `src/config.mjs` (solo costante del nome variabile), `tests/provider-registry-parita.test.mjs`, `tests/provider-pg.test.mjs`; creare questo rapporto. Nessuna eliminazione. Registro e router avranno delimitatori `// P-L`.

Simboli nuovi: `VERSIONE_PROTOCOLLO_ACP`, `AcpAgentError`, `validaRuntimeAgenteEsterno`, `leggiRuntimeAgenteEsterno`, `connettiAgenteAcp` (oggetto con `pid`, `sessionId`, `nome`, `prompt`, `cancel`, `chiudi`), `rispostaAgenteAcp`, `ENV_AGENTE_ESTERNO`. Record `esterno`, wire `acp`. Simboli preservati: `WIRE`, `REGISTRO_FORNITORI`, `verificaRegistro`, tutte le proiezioni, `risolviDestinazioneModello`, `creaFetchMultiProvider` e firma privata `creaFetchInstradata`. Nessuna migrazione.

Scenari RED permanenti: PL-ACP-01 handshake/cwd; 02 ordine testo, ragionamento e attività; 03 rifiuto permessi; 04 cancel e assenza PID dopo stop; 05 morte a metà classificata con BC-44; 06 versione sconosciuta; 07 ambiente dichiarato e segreti; 08 errori e timeout; 09 forma dei messaggi e sessioni estranee; PL-REG-01 record e wire; PL-ROUTE-01 Fetch/SSE con processo reale finto; PL-ROUTE-02 richieste incompatibili respinte e nessun ripiego di rete; PL-ROUTE-03 contesto su più turni senza stato nascosto. Fallimento atteso iniziale: modulo assente e record assente.

GREEN mirato: `node --test tests/acp-agent.test.mjs tests/provider-pl.test.mjs`. Regressione: `tests/provider-registry-parita.test.mjs`, `tests/provider-pg.test.mjs`, `tests/mcp-client.test.mjs`, `tests/mcp-registry.test.mjs`, `tests/mcp-session.test.mjs`, `tests/model-destination.test.mjs`, `tests/runtime-owner-adapter.test.mjs`, `tests/runtime-owner-adapter-fallback.test.mjs`, `tests/config.test.mjs`. Esecuzione tramite `rtk proxy`, runner unico. Gate finale `git diff --check` e controllo nominativo dei file vietati.

Gate upstream: processo Node finto parlante ACP, trasporto upstream MCP vero già installato; fixture indipendente conforme ai campi ACP fissati. Nessun agente commerciale avviato e nessuna qualifica end-to-end con produttori reali: il vincolo espresso dall'owner sostituisce quel gate con il processo finto. Prova visibile: testo/attività/rifiuto nel flusso consumabile dal kernel; nessuna nuova scheda senza API di catalogo. Rollback: rimuovere esclusivamente file nuovi e blocchi P-L dopo revisione; nessun revert automatico di cambi utente.

## Ricerca e decisione upstream (GET del 12/09/2026)

- [Inizializzazione ACP v1](https://agentclientprotocol.com/protocol/v1/initialization): `initialize`, versione intera 1, capacità omesse non supportate. Una versione diversa impone chiusura. La versione dello schema/SDK è distinta.
- [Trasporto](https://agentclientprotocol.com/protocol/v1/transports): JSON-RPC 2.0 UTF-8, un messaggio per riga, stdout riservato; stderr separato. HTTP ACP è ancora una proposta, non il trasporto scelto.
- [Sessioni](https://agentclientprotocol.com/protocol/v1/session-setup): `session/new` con cwd assoluta e `mcpServers`; identità di sessione; ripresa opzionale richiede capacità negoziata.
- [Turni e cancellazione](https://agentclientprotocol.com/protocol/v1/prompt-turn): `session/prompt` produce `session/update`; `session/cancel` è una notifica e il prompt conclude con `cancelled`. Gli aggiornamenti precedono la risposta finale.
- [Strumenti e permessi](https://agentclientprotocol.com/protocol/v1/tool-calls): sono attività dell'agente, non richieste OpenAI da eseguire una seconda volta. Scelta `reject_once` se disponibile, altrimenti esito `cancelled`; nessuna approvazione automatica.
- [Schema upstream fissato](https://raw.githubusercontent.com/agentclientprotocol/typescript-sdk/v1.4.0/schema/schema.json): SHA-256 `7f77702b34e0a0558e77220e9007bf8ee161a976bb8ac5021aba1b7e7b2c5708`. Adattare ACP v1 dietro modulo TALOS, con fixture dei messaggi usati. Il percorso precedentemente ipotizzato `agent-client-protocol/v1.21.0/schema/schema.json` restituisce 404: non adottato come pin. SDK TypeScript `@agentclientprotocol/sdk` 1.4.0, Apache-2.0, ispezionato; non aggiunto perché package e lock sono vietati. Non si copia il suo codice.
- Trasporto adottato direttamente: `StdioClientTransport` da `@modelcontextprotocol/client/stdio` **2.0.0**, MIT, già fissato nel package/lock e usato da `src/mcp-client.mjs:17,41`. Avvio shell false, windowsHide, buffer limitabile, pid, send/onmessage/onerror/onclose, chiusura stdin/TERM/KILL. Non si usa `connettiServerMcp`: fa un handshake MCP incompatibile. Non si scrive un secondo spawn o parser stdio.

## W4-07 e scelta architetturale

L'inventario è in `../.claude/INVENTARIO-PROVIDER-2026-09-12.md:485` nel checkout: P-L rimanda a W4-07. Il ledger `../.claude/LEDGER-ROADMAP-DESKTOP-2026-09-03.md:152` dice: «Adapter ACP: TALOS come agente per Zed e JetBrains (sessioni, prompt, permessi, terminale, usage_update, notice)», stato `DESIGN_VALIDATED`, destinazione `LABS`, dipendenza W2-18, schema v1.21, prova da Zed, rollback flag spento, stessi permessi e ricevute UI, nessuna delega inversa. La guida `../.claude/GUIDA-WAVE-4-E-FINAL-2026-09-03.md:23` dettaglia quel verso. **P-L è il verso contrario**: TALOS client, processo esterno agente. Non chiude W4-07 né PO-15.

Scelta: compatibilità OpenAI direttamente nel confine Fetch esistente, come una `Response` locale SSE. Un server HTTP non serve: il kernel riceve già `fetchDiRete` iniettata e l'adattatore nativo ha lo stesso precedente. Nessun listener, URL raggiungibile o segreto HTTP; il processo è posseduto dalla singola risposta e chiuso su successo/errore/stop/abbandono del lettore. Ogni completamento crea una sessione ACP nuova e passa il contesto testuale completo, esplicitamente serializzato: nessuna associazione implicita fra conversazioni.

Costo della via scelta: si preservano testo e ragionamento e si rendono le attività con avvisi comprensibili; non si conservano le strutture IDE (diff interattivi, terminali, ripresa nativa, catalogo modelli dell'agente). Gli strumenti OpenAI non sono ACP: richieste con strumenti o contenuti non supportati sono respinte prima dell'avvio. Non si costruisce una grammatica di tool nel testo.

Costo della modalità di sessione separata: gestione durevole di sessionId/processo, adattatore eventi, permessi interattivi, caricamento cronologia, scelta modello/modalità, stop e reload in `session-registry`/`agent-service` e frontend. Darebbe più fedeltà ma richiede i file espressamente vietati. Nessuna durata stimata.

## Rischi verificati e Hermes

Clone Hermes letto a commit `365e2835d490a053d076daa3b429371d6f35210f`. `agent/acp_openai_bridge.py:1-34` converte gli strumenti in testo e rilegge blocchi tool con regex: approccio rifiutato perché non è un contratto ACP e può duplicare le azioni già eseguite dall'agente. `agent/copilot_acp_client.py:155-163` eredita credenziali con `inherit_credentials=True`; P-L usa nomi espliciti. Il client Hermes rifiuta permessi a riga 731 ma offre lettura/scrittura file a 733-780: P-L dichiara entrambe non supportate. `agent/subagent_lifecycle.py:489-543` impedisce di ampliare i tool del genitore; quel ciclo è separato dal fornitore ACP.

[Documentazione Hermes](https://hermes-agent.nousresearch.com/docs/user-guide/features/acp/), riscontro locale `website/docs/user-guide/features/acp.md:156-180,250-279`: un ponte headless può rispondere da sé ai permessi; l'esempio Buzz auto-approva anche quando Hermes chiede conferma. Non si confonde trasporto con sandbox. [Zed](https://zed.dev/docs/ai/external-agents) distingue permessi inoltrati dai permessi nativi dell'agente e configurazioni MCP proprie. cwd non limita i diritti OS: il comando deve essere fidato dall'operatore. HOME/USERPROFILE consentono ai CLI di leggere i propri accessi salvati; P-L non promette isolamento del filesystem o della rete.

`ambienteSenzaCredenziali` (`src/kernel/talosHarness.mjs:3168`) elimina nomi TOKEN/SECRET/PASSWORD/PASSWD/CREDENTIAL/PRIVATE_KEY/KEY/APIKEY/API_KEY/ACCESS_KEY/AUTH, eccetto SSH_AUTH_SOCK, GPG_AGENT_INFO, KEYBOARD_LAYOUT e AUTHORITY. Qui serve una base più stretta, già offerta dal trasporto MCP: variabili OS dichiarate upstream più una lista esplicita di nomi di credenziali. Nessuna chiave dal portachiavi TALOS, nessun intero process.env, nessun stderr o errore remoto grezzo nei log.

## Esito e consegna

### Emendamento dopo le prime prove

- PL-REG-WINDOWS-CLEANUP: Windows impedisce di rimuovere la cwd di un processo vivo. I primi hook dei test pulivano la directory prima di chiudere il figlio, causando EBUSY e lasciando fermi tre runner. Corretto l'ordine nel singolo hook (chiudi, poi rm); i sette PID delle fixture residue sono stati chiusi leggendo esclusivamente i loro diari di prova. Nessun processo estraneo è stato terminato.
- PL-REG-STDIO-NONJSON: `ReadBuffer` upstream 2.0.0 ignora le righe che producono SyntaxError; il modulo non riceve quell'errore. Si caratterizza questa limitazione con timeout esplicito, mantenendo separato il test di JSON valido con forma invalida. Nessun secondo parser aggiunto.
- PL-REG-WINDOWS-ENV: sul Windows di prova compaiono anche LOGONSERVER, USERDOMAIN e WINDIR nel figlio; non sono credenziali e vengono dichiarate nell'aspettativa di ambiente osservato, distinta dai nomi forniti al trasporto.
- Il selettore non è estendibile end-to-end con il solo elenco: `frontend/src/legacy/app.js:6193-6197` carica soltanto fornitori restituiti dal portachiavi; `esterno` non vi appartiene. Non si aggiunge una scheda vuota né si finge una chiave. `frontend/src/components/fonti-modelli.js` e `provider-probe.mjs` restano intatti; percorso API testuale provato, attivazione dal selettore rinviata con diff non applicato.
- Il primo gate P-G non arriva ai test: manca `zod` nel worktree fratello `context-engine`. Verifica tramite risolutore temporaneo dei test che punta al pacchetto già presente in harness-ui, senza installazione e senza modificare package/lock o file del fratello.
- PL-ROUTE-09 (RED misurato): i parametri di generazione non hanno un equivalente ACP universale. La prima versione accettava `max_tokens` senza applicarlo. Prima della correzione il test fallisce per mancato rifiuto; rendere stretta la forma della richiesta, ammettendo solo metadati del trasporto conosciuti e respingendo limiti/ragionamento/temperatura non traducibili. Fonte: [opzioni di sessione ACP](https://agentclientprotocol.com/protocol/v1/session-config-options), GET 12/09: i nomi e valori sono annunciati dall'agente, non sono quelli OpenAI.
- PL-ACP-07 rafforzato (RED misurato): `--auth-token=...` e una credenziale d'ambiente non dichiarata ma copiata negli argomenti devono essere respinti. Riusare `eUnaCredenziale` esportata dal kernel, senza modificarlo, anziché mantenere una seconda grammatica dei nomi segreti. La configurazione arbitraria rimane fidata: una stringa segreta non presente nell'ambiente e priva di indicatore non è riconoscibile come tale.
- PL-ROUTE-10 (due RED misurati): nel ramo senza streaming `max_tokens` e `refusal` diventavano erroneamente `stop`. Unificare il motivo finale con quello SSE (`length`/`content_filter`) e mantenerlo nel JSON completo.

### Agenti e comandi verificati nelle fonti

Tutte le fonti della tabella sono state consultate il **12/09/2026**. I comandi sono documentazione, **non comandi eseguiti**. I numeri dei manifest su `main` identificano quanto letto, non provano che ogni artefatto sia installabile o compatibile con questo Windows.

| Nome del produttore | Pacchetto/distribuzione | Avvio documentato | Fonte e riscontro |
|---|---|---|---|
| Gemini CLI | npm `@google/gemini-cli` | `gemini --acp` | [Configurazione](https://geminicli.com/docs/reference/configuration/), [installazione](https://geminicli.com/docs/get-started/installation/). La [cheatsheet precedente](https://geminicli.com/docs/cli/cli-reference/) riporta `gemini --experimental-acp`: non si assume che tutte le versioni accettino entrambi. Manifest main letto: `0.61.0-nightly.20260908.gc647533d6`. |
| Claude Agent | npm `@agentclientprotocol/claude-agent-acp` | `claude-agent-acp` | [Manifest](https://raw.githubusercontent.com/agentclientprotocol/claude-agent-acp/main/package.json): `0.76.0`, bin `dist/index.js`; Apache-2.0. Il vecchio URL `zed-industries/claude-code-acp` redirige al progetto attuale. [README](https://github.com/agentclientprotocol/claude-agent-acp): usa il Claude Agent SDK, presenta strumenti, permessi, revisioni e terminali. Non è `claude --acp` nativo. |
| Codex | npm `@agentclientprotocol/codex-acp` | `npx -y @agentclientprotocol/codex-acp`, oppure `codex-acp` dopo installazione | [README attuale](https://github.com/agentclientprotocol/codex-acp), [manifest](https://raw.githubusercontent.com/agentclientprotocol/codex-acp/main/package.json): `1.11.0`, Apache-2.0. Il [progetto precedente](https://github.com/zed-industries/codex-acp) rimanda esplicitamente a questo, basato sul Codex App Server; `@zed-industries/codex-acp` non è la scelta per nuove installazioni. Non è `codex --acp` nativo. |
| goose | binario goose CLI, distribuzione `aaif-goose/goose` | `goose acp` | [Guida ufficiale corrente](https://github.com/aaif-goose/goose/blob/main/documentation/docs/gdk/acp/index.md): subprocess stdio posseduto dal client. La pagina storica `guides/acp-clients` ora dà 404; il percorso GDK è quello verificato. |
| OpenCode | npm `opencode-ai`, oppure binario del produttore | `opencode acp` | [Installazione](https://opencode.ai/docs/), [supporto ACP](https://opencode.ai/docs/acp/): esempi Zed, JetBrains, Avante e CodeCompanion; il processo mantiene le proprie regole e i propri server MCP. |
| Hermes Agent | CLI Hermes del progetto NousResearch | `hermes acp` | [ACP Host Integration](https://hermes-agent.nousresearch.com/docs/user-guide/features/acp/) e clone fissato sopra. È il verso Hermes-agente; il codice `copilot_acp_client.py` documenta anche Hermes-client. |

L'[elenco ufficiale ACP](https://agentclientprotocol.com/get-started/agents) comprende anche Kimi CLI, Cursor, GitHub Copilot, Mistral Vibe e altri. Non sono qualificati da questo lavoro e non viene inventato il loro comando di avvio.

Per P-L, l'operatore risolve il comando documentato in un **percorso assoluto già installato**. Su Windows si usa l'eseguibile nativo oppure `node.exe` con il percorso assoluto del bin JavaScript del pacchetto; `.cmd` e `.bat` sono respinti. Il ponte non lancia npm/npx per scaricare dipendenze e non aggiorna agenti durante una richiesta.

### Client: come mostrano ciò che fa l'agente

- [Zed, External Agents](https://zed.dev/docs/ai/external-agents): thread dedicati nell'Agent Panel, identità dell'agente, messaggi e attività; configurazione e accessi dell'agente separati da quelli del modello Zed. [Tool Permissions](https://zed.dev/docs/ai/tool-permissions): controlli espliciti sulle operazioni inoltrate; i permessi nativi restano dell'agente. P-L adotta la separazione delle identità e il rifiuto esplicito; non replica l'intera interfaccia IDE.
- [JetBrains, ACP](https://www.jetbrains.com/help/ai-assistant/acp.html): registro o configurazione manuale degli agenti, scelta in AI Chat, opzioni separate per inoltrare MCP personalizzati o IntelliJ. [Copilot in AI Assistant](https://www.jetbrains.com/help/ai-assistant/copilot-agent.html) descrive richieste di consenso per comandi e modifiche quando Allow All è spento. Questo esempio non dimostra che ogni adapter mostri gli stessi controlli. P-L non inoltra nessun MCP e non offre Allow All.
- [Avante.nvim](https://github.com/avante-corp/avante.nvim): provider ACP configurabili, pannello di conversazione, stati di generazione/riflessione e confronto delle modifiche. [OpenCode ACP](https://opencode.ai/docs/acp/) fornisce anche una configurazione CodeCompanion.nvim. P-L rende testo, ragionamento e stati, dichiarando gli eventi che la conversazione attuale non rappresenta.

### Contratto definitivo del modulo

`connettiAgenteAcp(runtime, {signal?, env?, onEvento?})` avvia una sola connessione e torna `{pid, sessionId, nome, prompt, cancel, chiudi}`. `nome` viene da `agentInfo.title`, poi `agentInfo.name`, poi “Agente esterno”. `prompt([{type:'text',text}])` ammette un turno alla volta; una seconda richiesta concorrente fallisce. `cancel()` invia `session/cancel`, lascia una grazia configurata di 150 ms e chiude; `chiudi()` è idempotente. Il trasporto upstream chiude stdin, poi TERM/KILL se necessario; P-L attende la conferma di chiusura prima di completare. I tempi sono soglie di policy, non promesse di latenza.

`rispostaAgenteAcp({runtime, body, signal?, env?})` traduce `esterno:predefinito` in una nuova sessione per completamento. Il nome designa il **modello predefinito dell'agente**, non un modello remoto selezionato arbitrariamente. Passa la cronologia testuale intera con ruoli JSON espliciti; non fa `session/load` e non simula il ruolo system nativo dell'agente. È questa la perdita semantica della via OpenAI: le istruzioni proprie dell'agente mantengono la precedenza che il produttore ha scelto.

| Ingresso ACP | Uscita TALOS/OpenAI |
|---|---|
| `agent_message_chunk` testuale | `choices[0].delta.content` |
| `agent_thought_chunk` testuale | `choices[0].delta.reasoning_content` |
| `tool_call` / `tool_call_update` | Nota testuale con stato italiano; nessuna esecuzione duplicata e nessun `tool_calls` OpenAI |
| `session/request_permission` | `reject_once` selezionato, se offerto; altrimenti `cancelled`. Nota: “Operazione dell’agente esterno rifiutata: qui non è disponibile una conferma dei permessi.” |
| RPC filesystem/terminale o altro metodo non disponibile | JSON-RPC `-32601` e nota di rifiuto |
| Altro `session/update` | Nota esplicita di aggiornamento non rappresentabile; non si inventano usage, piani o ricevute |
| Fine `end_turn`, `max_tokens`/`max_turn_requests`, `refusal` | `stop`, `length`, `content_filter`; poi `[DONE]` solo su conclusione valida |
| Morte a metà / forma invalida / tempo scaduto | Errore tipizzato e flusso fallito, mai un completamento vuoto riuscito |

Nessun totale token/costo viene sintetizzato. Le attività in nota entrano nel testo della conversazione: non sono ricevute TALOS di operazioni verificate. JSON senza stream usa gli stessi motivi finali. Messaggi di altre sessioni, versione ignota, risposte fuori contratto e campi non supportati vengono respinti. Strumenti, immagini/audio, scelta modello differente, `max_tokens`, temperatura, ragionamento imposto e altri parametri senza equivalente vengono respinti **prima di avviare il figlio**.

Esempio di runtime **non segreto** (percorsi illustrativi da sostituire con quelli installati):

```json
{
  "comando": "C:\\Program Files\\nodejs\\node.exe",
  "argomenti": ["C:\\Agenti\\claude-agent-acp\\dist\\index.js"],
  "cwd": "C:\\Progetti\\lavoro",
  "variabiliAmbiente": ["ANTHROPIC_API_KEY"],
  "timeoutMs": 180000
}
```

Il runtime può arrivare da `leggiRuntime('esterno')`; con il portachiavi attuale, che non conosce questo record senza credenziale, si usa il JSON della variabile `TALOS_AGENTE_ESTERNO`. La variabile contiene **nomi** di credenziali, mai valori; ogni nome dichiarato deve esistere nell'ambiente del processo TALOS. Nessun valore è importato dal portachiavi. `env` è una dipendenza interna dei test, non un parametro accettato dalla richiesta della chat. I valori dichiarati sono oscurati nel flusso pubblico anche quando spezzati tra delta dello stesso canale. Errori remoti e stderr grezzi non vengono pubblicati né registrati.

Base ambiente Windows del trasporto: APPDATA, HOMEDRIVE, HOMEPATH, LOCALAPPDATA, PATH, PROCESSOR_ARCHITECTURE, SYSTEMDRIVE, SYSTEMROOT, TEMP, USERNAME, USERPROFILE, PROGRAMFILES. Su questa macchina il figlio vede inoltre LOGONSERVER, USERDOMAIN, WINDIR. Base Unix dichiarata upstream: HOME, LOGNAME, PATH, SHELL, TERM, USER. Il ramo Unix non è stato eseguito. Le altre variabili entrano solo nella lista esplicita; iniezioni di runtime come NODE_OPTIONS, NODE_PATH, LD_*, DYLD_*, PYTHONPATH, PYTHONHOME, BASH_ENV, ENV, COMSPEC, PATHEXT sono respinte. Non si permette di sovrascrivere i nomi OS ereditati. I CLI possono comunque leggere i propri accessi su disco attraverso HOME/USERPROFILE: questa non è una sandbox.

### Verifica finale e numeri

**234 test, 232 passati, 0 falliti, 2 saltati**, durata misurata dal runner **6997,0901 ms**. I **30 test nuovi P-L passano tutti**. Comando integrale, singoli esiti e durate in [PL-VERIFICA-2026-09-12.txt](PL-VERIFICA-2026-09-12.txt). Compresi espressamente i tre `mcp*.test.mjs`, parità, P-G e i test dei file toccati; aggiunti pool/portachiavi/sonde/Z.AI e regressioni routing/fallback/configurazione.

I due skip preesistenti sono `PG-PUB` e `PF-PAR-05`: richiedono il GET integrale di models.dev disponibile esternamente. Le fixture pubbliche già versionate vengono invece verificate. Il primo lancio P-G senza risolutore falliva all'import di zod del fratello; il comando finale usa `--import file:///C:/Users/Antonino/AppData/Local/Temp/talos-pl-risolutore.mjs`, che risolve esclusivamente quell'import sullo zod **4.5.4 già installato** in harness-ui. Nessuna installazione, package o lock modificato.

Fixture di conformità: 139 definizioni raggiungibili dai messaggi verificati, estratte dallo schema fissato; definizioni integre, provenienza e licenza upstream completa incluse nel JSON. Il test controlla richieste, risposte e notifiche effettivamente scambiate e respinge mutazioni di versione come stringa, sessione incompleta, stop inventato e consenso senza optionId.

Le prove di stop usano `process.kill(pid, 0)` e richiedono ESRCH, sia con segnale di sessione sia cancellando il lettore, anche con agente che ignora cancel. L'audit finale dei diari delle fixture trova **0 PID ancora vivi**. Il processo finto non genera discendenti: la prova non certifica l'assenza di nipoti creati da un adattatore commerciale. Il trasporto MCP non offre un Job Object Windows o un process group Unix; qualificarlo con alberi reali resta un gate distinto.

`git diff --check`: superato. Controllo nominativo dei file vietati: **diff vuoto**. Nessuna build UI, nessun server applicativo sulla 4174, nessuna sessione browser e nessun agente vero avviato.

### File su disco e righe

| File | Righe/ambito finale |
|---|---|
| `src/acp-agent.mjs` (nuovo, 334 righe) | versione 11; errore/BC-44 31; validazione runtime 49; lettura configurazione 74; connessione e ciclo 104; adattamento conversazione 241; redazione 256; Response 272 |
| `src/provider-registry.mjs` | wire 72–74; record 92–110; eccezione controllata alla base URL 1098–1102, tutti delimitati P-L |
| `src/model-destination.mjs` | instradamento processo 125–132 |
| `src/runtime-owner-adapter.mjs` | import 23–25; sola diramazione di routing 541–543 |
| `src/config.mjs` | sola variabile 14–16 |
| `tests/acp-agent.test.mjs` (nuovo) | processo vero finto, permessi, stop, ambiente e guasti; conformità a 123 |
| `tests/provider-pl.test.mjs` (nuovo) | registro 13; Fetch 36; kernel su due turni 116; cause finali 143; morte attraverso kernel 149 |
| `tests/fixtures/acp-agent-finto.mjs` (nuovo) | 64 righe; protocollo e diario dei due versi |
| `tests/fixtures/acp-v1-conformita.json` (nuovo) | schema estratto con provenienza/licenza; 198839 byte |
| `tests/provider-pg.test.mjs` | 46–52: parità additiva; conserva tutti i venti record originali e unicità, consente P-J/P-K/P-L |
| `.claude/PL-VERIFICA-2026-09-12.txt` (nuovo) | comando ed evidenza finale |
| `.claude/RAPPORTO-PL-AGENTE-ESTERNO-ACP-2026-09-12.md` (nuovo) | questo rapporto e ledger |

`tests/provider-registry-parita.test.mjs` non ha richiesto modifiche: tutte le proiezioni nuove vengono già derivate. Anche provider-probe e frontend restano intatti per il vincolo del catalogo descritto sopra. Non ci sono diff importati da P-J/P-K. Fuori dal repository sono stati creati soltanto artefatti temporanei di ricerca/prova e il risolutore dei test; nessun file del worktree fratello è stato modificato.

### Diff non applicati e limiti di prodotto

**Selettore e disponibilità dell'agente.** Il blocco preciso è `frontend/src/legacy/app.js:6193-6197`: `conChiave` nasce dall'elenco del portachiavi, quindi aggiungere una voce a `PROVIDER_DIRETTI` non basta. Serve un catalogo operativo per agenti configurati e una condizione di caricamento distinta, senza fingersi una credenziale. Inoltre `src/http-app.mjs:2397` oggi delega il catalogo a providerProbe: un futuro gate dovrebbe fare soltanto initialize/session-new e rendere il nome dichiarato, mai eseguire un prompt per sondare. Non si fornisce una patch parziale che accenda una scheda senza quel backend.

**Riclassificazione di una ricerca dopo salvataggio/reload.** Il nuovo errore porta `classe` e `transitorio` da BC-44 e il kernel li conserva (PL-ROUTE-11). `src/agent-service.mjs:1816,1828` persiste codice e messaggio, non questi due attributi. La tabella BC-44 non conosce ancora i codici `ACP_*`: ricostruire una ricerca dal solo errore salvato può quindi dare `ignoto`. Questo non rende silenziosa la caduta, ma non abilita automaticamente la ripresa della ricerca. Patch concettuale minima **NON APPLICATA**, da qualificare con test di reload nel perimetro futuro:

```diff
--- src/research-orchestrator.mjs
+++ src/research-orchestrator.mjs
@@ dopo la riga 818, dentro classificaErroreDiCorsa
+  if (c === 'ACP_PROCESS_EXITED') return esito('flusso-interrotto');
+  if (c === 'ACP_TIMEOUT') return esito('timeout-fornitore');
+  if (c === 'ACP_CANCELLED') return esito('fermato');
```

**Nessun prodotto completo da dichiarare dal composer.** Sono provati modulo, router e kernel reale con il processo finto; non sono provati composer finale, selezione/reload UI, persistenza nativa ACP, permessi interattivi, sandbox/alberi di processi commerciali, autenticazione reale o consumo. Le richieste della chat che includono strumenti o opzioni di generazione vengono rifiutate onestamente: P-L consegna una base testuale, non certifica l'esecuzione autonoma dei tool TALOS da parte di un agente esterno.

**Nessun agente vero avviato.** Gemini CLI, Claude Agent, Codex, goose, OpenCode e Hermes sono stati studiati nelle fonti, non eseguiti. Nessuna chiamata a pagamento. Nessuna misura di costo o latenza dei produttori. W4-07 rimane nel suo stato precedente; PO-15 non è implementata. Per una qualifica futura occorre fissare anche l'artefatto dell'agente effettivamente installato, verificarne licenza/provenienza, salute, permessi, cancellazione con discendenti e rollback alla versione precedente.

### Testo di commit proposto

```text
feat(provider): aggiunge il ponte testuale per agenti esterni ACP (P-L)

Riusa il trasporto stdio MCP per ACP v1 e instrada esterno:predefinito
nel confine Fetch, senza modificare kernel o sessioni. Rifiuta permessi
e richieste non traducibili; propaga stop e guasti classificati.

Include fixture upstream e processo finto: 232 test passati, 2 skip.
Selettore, ripresa delle ricerche e agenti commerciali ancora da qualificare.
```

Nessun `git add`, `git commit` o `git push` eseguito.

### Cosa deve fare l'owner · Cosa faccio io · Cosa rimane

**Cosa deve fare l'owner:** revisionare questi file nel checkout staccato; integrare i blocchi P-L coordinandoli con P-J/P-K; decidere separatamente la fetta di catalogo/selettore e la qualifica di un agente reale con versione fissata. Non serve configurare credenziali per ripetere i test.

**Cosa faccio io:** consegno i file su disco, ledger, fonti datate, fixture e risultati verificati; nessuna operazione Git di pubblicazione e nessuna modifica ai file vietati.

**Cosa rimane:** disponibilità dal selettore e prova dal composer con reload, mapping durevole dei codici ACP in BC-44, strumenti e permessi interattivi se richiesti, protezione/qualifica degli alberi di processi reali, autenticazione e interoperabilità live. W4-07 e PO-15 restano lavori distinti.
