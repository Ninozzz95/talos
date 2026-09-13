# L10 — La modalità piano della CHAT

Rapporto di ricerca e disegno · Astra (Codex) · 12 settembre 2026

**La scelta proposta:** trasformare il «Planner opzionale» in una modalità conversazionale con un piano persistente e modificabile, approvazione della versione esatta, esecuzione osservabile e prove associate ai risultati. **Hermes Agent è il riferimento competitivo primario.** Non abbiamo ancora misurato una superiorità di TALOS: questo rapporto definisce come dimostrarla.

## 1. Perimetro e metodo

Questo lotto riguarda la pianificazione nella chat, non «Ricerca approfondita». Ho letto codice e test, consultato documentazione primaria, annunci ufficiali e segnalazioni nei repository dei produttori. Quando la ricerca indicizzata risultava incompleta ho recuperato direttamente documenti Markdown, codice pubblico e metadati GitHub via HTTPS. Nessun clone e nessun comando git.

**Unico file scritto:** `harness-ui/.claude/RAPPORTO-L10-PLAN-MODE-CHAT-2026-09-12.md`. La `.claude/` alla radice è fuori dalle directory consentite in scrittura; uso quindi il percorso alternativo autorizzato. Nessun file di prodotto modificato, server avviato o richiesta inviata alla porta 4174. Nessuna lettura delle conversazioni private della ricerca in corso.

Tutte le fonti citate sono state consultate il **12/09/2026**. Riporto separatamente la data di pubblicazione/aggiornamento quando è esposta; **s.d.** significa data editoriale non dichiarata, non fonte non consultata. La data del crawler non è una data di rilascio. Una pagina corrente non prova che una funzione fosse disponibile in tutte le versioni precedenti o su tutti gli account.

Le issue testimoniano un problema segnalato; non sono riproduzioni effettuate da me. «Aperta» e «chiusa» sono stati verificati via API quando indicato. Una issue chiusa non dimostra da sola la correzione. Una capacità non documentata nelle fonti esaminate è **ND**, non «inesistente». Nessun prodotto concorrente è stato eseguito in questo lotto. Non viene assegnato un punteggio di qualità inventato.

Sottosistema posseduto in L10: **docs**. Il piano futuro interessa backend desktop, TALOS UI e kernel condiviso. Il checkout è quello indicato dall'owner; non ho verificato il ramo con git, come richiesto.

## 2. TALOS oggi: il percorso reale del planner

I percorsi di questa sezione sono relativi a `harness-ui/`. Le righe sono quelle lette durante questa sessione.

| Passaggio | Evidenza nel codice | Comportamento osservabile o conseguenza |
| --- | --- | --- |
| Scelta nella modale | `frontend/src/legacy/app.js:16865–16896` | Un selettore modello principale e uno distinto per il planner. Quest'ultimo parte da «Nessuno». Compare «Planner opzionale», con «Esplora in sola lettura e consegna il piano prima dell’esecuzione». |
| Trasporto della scelta | `frontend/src/legacy/app.js:17407–17419`, `17929–17931`, `18020–18054`, `18403–18424` | La selezione passa dalla sessione pendente alla richiesta di avvio. Il campo `modelloPlanner` viene omesso se non scelto. Non è una modalità della pillola del composer. |
| Validazione HTTP | `src/http-app.mjs:1202–1243`, `1313–1364`, `1539–1552` | Il planner usa il formato modello `vendor/nome-modello`; l'aggiornamento ammette anche `null`. Non sono previsti qui un documento piano, una revisione o un'approvazione del piano. |
| Registro della sessione | `src/session-registry.mjs:2440–2446`, `2483–2489`, `2532`, `2643`, `2908–2909` | Planner opzionale, senza ripiego automatico sul modello principale. La scelta è conservata nella voce e inoltrata al servizio. |
| Ripristino e modifica delle impostazioni | `src/session-registry.mjs:3286–3289`, `3346`, `3828–3883` | Il registro durevole ripristina la scelta. `aggiornaImpostazioni` sa modificare `modelloPlanner`, scrivendo prima sul registro e poi in memoria. Questo non equivale a modificare il contenuto di un piano. |
| Servizio agente | `src/agent-service.mjs:209`, `258–266`, `1743–1767` | `avviaSessione` inoltra il modello al kernel, attende l'intero lavoro e converte l'esito in evento finale. |
| Attivazione effettiva | `src/kernel/talosHarness.mjs:6387–6406` | Il pre-loop parte se c'è `modelloPlanner` e mancano messaggi iniziali non vuoti. Richiama `talosLavora` con il modello planner e `livelloAccesso: 'lettura'`. Su una ripresa con cronologia non riparte. |
| Attrezzi e contesto | `src/kernel/talosHarness.mjs:6389–6405`, `6254–6265`, `6318–6331`, `6354–6375` | Fra gli estesi passano solo `web_search` e `time_now`; restano gli attrezzi base ammessi dal livello, fra cui `elenca`, `cerca`, `leggi`. Non vengono inoltrati MCP, plugin, skill, deleghe, callback mutanti e override per attrezzo. `cacheWeb` è condivisa. |
| Limite del planner | `src/kernel/talosHarness.mjs:149–160` | Tetto separato di **8 giri**, dichiarato nel commento come valore iniziale **non misurato**. Non va presentato come stima del lavoro. Il default del loop principale è oggi `Infinity`, riga 147: il vecchio commento su 24 giri alle righe 6237–6243 è superato. |
| Risultato e passaggio all'esecuzione | `src/kernel/talosHarness.mjs:6407–6412` | Il testo `esitoPlanner.detto`, con modello e motivo di conclusione, viene inserito in un messaggio `system` intitolato «Piano dell'architetto». Subito dopo prosegue il loop del modello esecutore. Non c'è un'attesa della persona. |
| Visibilità durante la pianificazione | `src/kernel/talosHarness.mjs:6215–6228`, `6390–6406` | La chiamata interna non riceve `onDelta` e `onGiro`. Il planner non trasmette alla chat le proprie letture, domande o progressi attraverso quei callback. Il commento menziona un evento dedicato del chiamante, ma non ne ho trovato l'implementazione nel servizio letto. |
| Consumi | `src/kernel/talosHarness.mjs:6387`, `6407`, `8702–8715`; `src/agent-service.mjs:152–169`, `970–977` | Il kernel restituisce `usagePlanner` separato da `usage`. L'evento finale del servizio pubblica solo `usage`; anche gli aggiornamenti provengono dai giri inoltrati, che escludono il planner. Nel percorso ispezionato il suo consumo non entra nel totale mostrato alla chat. |
| Persistenza del testo | `src/session-registry.mjs:3010–3012`, `1822`, `3275`; `src/kernel/talosHarness.mjs:6408–6410` | Il piano può sopravvivere dentro `messaggiFinali`, conservati per ripresa e fork. Non è un artefatto piano con identità, revisioni, passi, approvazioni e prove autonome. |

### 2.1 Cosa produce davvero, e cosa non produce

Il pre-loop riceve lo stesso `task` e costruisce i messaggi con le normali `ISTRUZIONI` (`src/kernel/talosHarness.mjs:2747`, `6331`, `6375`). Nel ramo planner non viene aggiunta una consegna specifica che imponga passi, file, criteri di riuscita o un formato validato. Il nome «Piano dell'architetto» viene applicato al testo ottenuto: **il nome non certifica che il testo abbia la struttura di un piano eseguibile**.

La persona può scegliere il modello planner alla creazione; il backend consente di aggiornarne l'impostazione. Nel frontend letto non ho trovato un editor del piano, pulsanti «Approva piano»/«Esegui passo», una revisione nell'indice o una gestione dedicata dei chiarimenti. Una successiva correzione in chat è una normale continuazione della conversazione, non una revisione formale del piano precedente.

Un planner che esaurisce gli 8 giri **non blocca l'esecutore**: il motivo di conclusione viene inserito nel messaggio e l'esecuzione continua. È un comportamento intenzionale coperto dal test alle righe 4386–4399, non un'ipotesi. Una vera eccezione è diversa da un esito parziale; questo rapporto non assimila i due casi.

Altre omissioni nel passaggio ricorsivo da verificare nel futuro lotto: non viene inoltrato `contestoDelProgetto`; il planner potrebbe rifare esplorazioni che il modello principale può evitare. Non vengono inoltrati il contesto assemblato e tutti gli adattatori delle altre sezioni. La copertura completa dei fornitori locali/diretti non è dimostrata dal semplice inoltro di `modelloPlanner`: `session-registry.mjs:2988–3002` contiene anche un percorso runtime locale distinto.

Il testo planner entra attualmente con ruolo `system`. Per il nuovo disegno occorre conservarlo come proposta dell'agente, con provenienza ed evidenze, senza promuovere eventuali istruzioni lette nei file a politica fidata.

### 2.2 Test presenti: cosa provano e cosa no

`src/kernel/talosHarness.test.mjs:4256–4400` contiene la suite **«talosLavora - FASE K, R2 (planner costoso + editor economico)»**. Scenari letti: assenza del planner e parità; ordine planner→editor e testo iniettato; attrezzi esclusi; tentata scrittura rifiutata; consumo distinto; nessuna ripianificazione su ripresa; piano parziale seguito dall'editor.

Sono prove automatizzate già scritte, lette ma **non eseguite in L10**. Le risposte del modello sono simulate: non provano la qualità di un piano prodotto da un modello reale, la comprensione dei chiarimenti o il consenso della persona.

### 2.3 Superfici esistenti da riusare

| Superficie | Dove l'ho trovata | Implicazione per L10 |
| --- | --- | --- |
| Composer e pillole | `frontend/mockup/talos-mockup.html:2761–2786` | Ci sono modello, permessi, giri, terminale e costo. Non c'è qui una pillola Piano. Le ricerche `planner`, `modelloPlanner`, «modalità piano» nel mockup non individuano un flusso piano dedicato. |
| Quattro permessi | `frontend/mockup/talos-mockup.html:3555–3558`; `frontend/src/components/permessi.js`; `frontend/src/components/politiche.js` | Conservare «Solo lettura · Scrive nel progetto · Chiede prima · Accesso pieno». Pianificare è un modo di lavorare, non un quinto livello di accesso. |
| Approvazioni per attrezzo | `frontend/src/components/conversazione.js:673–725`; `src/agui-events.mjs:235`, `262` | Il componente concreto è `creaApprovazione` in `conversazione.js`; non ho trovato un file autonomo `components/approvazioni`. Riusarne la grammatica visiva, senza equiparare consenso sul piano e consenso sull'attrezzo. |
| Navigazione conversazione | `frontend/src/legacy/app.js:57–58`; `frontend/src/components/conversazione.js:63–133`; `frontend/src/components/cronologia.js` | Collegare il piano e le prove ai giri esistenti. Non creare una seconda cronologia. |
| Indice dei giri | `frontend/mockup/talos-mockup.html:3420–3425`; `frontend/src/components/inspector.js:134`, `451` | Il piano deve essere raggiungibile qui, distinguendo numero del passo e numero del giro. |
| Note | `src/notes-store.mjs:141–149`, `190`, `219`; `frontend/src/components/note.js` | Già esistono titolo, contenuto, formato, date e origine. Non esistono qui campi pubblici per revisione/approvazione di un piano. |
| Attività | `src/tasks-store.mjs:36–39`, `112`, `157`, `178`, `195`; `frontend/src/components/attivita.js` | Stati attuali `todo/doing/done`, descrizione massima 2.000 caratteri. Non infilarvi l'intero piano; servono collegamenti ai passi e una proiezione coerente. |

### 2.4 Il cancello semantico non va sopravvalutato

`premessaDellaScrittura` (`src/kernel/talosHarness.mjs:4196–4245`) costruisce il prima/dopo in memoria e richiama `cancelloSemantico`, importato dal kernel compilato (`75–76`). I commenti e il codice alle righe `4149–4159` e `4203–4206` ne circoscrivono il significato: confrontare diagnostiche TypeScript per **riferimenti mancanti introdotti**, con esiti `presente/assente/ignoto`.

Non è un verificatore generale di requisiti in linguaggio naturale. Non dimostra che login, accessibilità, prestazioni o intenzione dell'owner siano corretti. Il disegno deve **mantenere quel controllo prima delle scritture** e aggiungere un controllo distinto di copertura del piano contro prove finali. Allargare il vecchio cancello a un giudizio generico riaprirebbe il rischio di falsi positivi che i commenti spiegano.

## 3. Concorrenti, uno per uno

### 3.1 Hermes Agent — Nous Research, obiettivo primario

**Data e pin:** codice sul commit `be2f7e9c3616bf0f915c384d48bf9ec197da6863`, datato **12/09/2026 12:56:15 UTC**, recuperato direttamente dal repository. Il test del comando ha una modifica datata **04/09/2026**. Licenza del progetto letta: MIT. Questa è una fotografia di sviluppo, non una dichiarazione sulla versione installata dagli utenti.

**Punti forti.** `/plan` è oggi integrato, non soltanto una skill. `build_plan_prompt` richiede un Markdown in `.hermes/plans/YYYY-MM-DD_HHMMSS-<slug>.md`, con passi, file e verifiche; chiarisce soltanto le incertezze necessarie. Lo stesso turno deve terminare senza implementare. Il test documenta origine come skill e registrazione multipiattaforma. [Comando e prompt al pin](https://github.com/NousResearch/hermes-agent/blob/be2f7e9c3616bf0f915c384d48bf9ec197da6863/agent/plan_prompt.py), [test del comando](https://github.com/NousResearch/hermes-agent/blob/be2f7e9c3616bf0f915c384d48bf9ec197da6863/tests/agent/test_plan_prompt.py).

`todo` distingue attività da iniziare, in corso, completate e annullate; il codice preserva informazioni utili alla continuità e istruisce a completare soltanto lavoro verificato. `clarify` supporta domande singole o gruppi fino a cinque, fino a quattro opzioni e risposta libera. La TUI documenta finestre dedicate a chiarimenti e permessi. [Todo al pin](https://github.com/NousResearch/hermes-agent/blob/be2f7e9c3616bf0f915c384d48bf9ec197da6863/tools/todo_tool.py), [chiarimenti al pin](https://github.com/NousResearch/hermes-agent/blob/be2f7e9c3616bf0f915c384d48bf9ec197da6863/tools/clarify_tool.py), [TUI, s.d.](https://hermes-agent.nousresearch.com/docs/user-guide/tui).

**Limiti.** Il comando dichiara esplicitamente di essere un prompt normale, senza motore dedicato e senza cambiare sistema/cronologia. La sola lettura del piano è quindi un vincolo istruito; quel modulo non dimostra una barriera runtime che resti attiva nei turni successivi. Non ho verificato un'approvazione associata all'impronta del documento né una relazione obbligatoria piano→todo→prove. La issue [#36821](https://github.com/NousResearch/hermes-agent/issues/36821), aperta **01/06/2026**, chiusa **30/08/2026**, lamentava un elenco passi transitorio e difficile da ritrovare: è evidenza storica, non prova di un difetto ancora presente.

**Costo.** Letture, testo del piano e revisione consumano il modello scelto. Il comando evita di alterare il prefisso di sistema, a favore della cache; non rende gratuite le chiamate. La delega consente un modello distinto per i lavoratori, già documentato come strategia planner forte/esecutori economici. Nessun valore verificato di token o tempo per un piano comparabile. [Delega, s.d.](https://hermes-agent.nousresearch.com/docs/user-guide/features/delegation), [modelli, s.d.](https://hermes-agent.nousresearch.com/docs/user-guide/configuring-models).

**Da battere:** altrettanta rapidità nel produrre un piano riusabile, aggiungendo vincolo effettivo di non esecuzione, consenso versionato e prove consultabili senza chiedere un nuovo turno al modello.

### 3.2 Claude Code

**Fonti correnti, s.d.; consultazione 12/09/2026.** In terminale `Shift+Tab` e `/plan` portano alla pianificazione; `Ctrl+G` apre il piano nell'editor. Il flusso propone approvazione con modalità di esecuzione, approvazione manuale delle modifiche oppure prosecuzione del piano. **Attenzione:** la documentazione corrente dichiara eccezioni quando la sessione dispone di bypass dei permessi: il solo indicatore Piano non garantisce il blocco delle modifiche in quella configurazione. [Modalità e approvazione](https://code.claude.com/docs/en/permission-modes).

**Punti forti.** `AskUserQuestion` raccoglie chiarimenti; `ExitPlanMode` è il passaggio dedicato che presenta il piano. Le integrazioni possono intercettarli tramite hook. Piano su file ed editor permettono revisione concreta; la checklist si mostra con `Ctrl+T`. `opusplan` automatizza l'uso di Opus in pianificazione e Sonnet in esecuzione. [Hook](https://code.claude.com/docs/en/hooks), [interazione e checklist](https://code.claude.com/docs/en/interactive-mode), [configurazione dei modelli](https://code.claude.com/docs/en/model-config).

**Plan review: distinzione necessaria.** Esistono subagenti Plan/Explore in sola lettura e revisori configurabili. Non è però corretto affermare che ogni piano riceva una revisione indipendente obbligatoria. La documentazione corrente dei team dice che le richieste di approvazione dei piani dei compagni vengono accettate nella sessione del coordinatore **senza revisione del coordinatore**; i permessi dei singoli attrezzi restano distinti. [Subagenti](https://code.claude.com/docs/en/sub-agents), [team, sezione Plan approval](https://code.claude.com/docs/en/agent-teams).

**Debolezze documentate.** [#91901](https://github.com/anthropics/claude-code/issues/91901), **03/09/2026**, verificata aperta: l'autore descrive quattro iterazioni di piano per una correzione circoscritta, domande delegabili all'agente e approvazioni ripetute. È una segnalazione singola con plugin attivi, non una frequenza stimata. [#6495](https://github.com/anthropics/claude-code/issues/6495), **25/08/2025**, chiusa **05/01/2026**, è un precedente storico di incongruenza fra indicatore Piano e permessi, non una vulnerabilità attuale certificata.

**Costo.** Ogni esplorazione, revisione e contesto aggiuntivo pesa sul consumo; i team moltiplicano finestre di contesto e token. Le statistiche `/usage` hanno limiti di attribuzione e copertura dichiarati. Nessun costo o tempo fisso documentato per il singolo piano. [Consumi](https://code.claude.com/docs/en/costs).

**Da eguagliare/superare:** editor e passaggio chiaro già maturi; meno richieste ripetute, nessun aumento dei permessi implicito nell'approvazione del piano.

### 3.3 Codex CLI e app

**Correzione del presupposto storico:** oggi Codex ha `/plan`; scrivere soltanto «plan» nel prompt o usare lettura non è più l'unica possibilità. La documentazione mostra il comando in CLI/IDE e «Plan mode» nel menu di aggiunta dell'app. `/plan` è temporaneamente indisponibile mentre il lavoro è in corso. [Comandi ufficiali, s.d.](https://developers.openai.com/codex/cli/slash-commands), [superficie app, s.d.](https://developers.openai.com/codex/app/features).

**Contratto aperto verificato.** Il template pubblico `plan.md`, ultima modifica del file al commit `6bfc58a688a73c287da51797d99c3345caecbae8` del **21/06/2026**, distingue modalità piano e lista di avanzamento `update_plan`. Prevede esplorazione senza mutazioni, chiarimenti dopo le verifiche locali e blocco finale `<proposed_plan>`. L'uscita dipende dal cambio di modalità del sistema ospitante, non da una frase interpretata come invito a scrivere. È un contratto istruttivo verificato nel codice; non una prova di tutti i client. [Template ufficiale](https://github.com/openai/codex/blob/6bfc58a688a73c287da51797d99c3345caecbae8/codex-rs/collaboration-mode-templates/templates/plan.md).

**Permessi e limiti.** Sandbox e politica di approvazione sono due controlli distinti. «Chiede approvazione» può già permettere scritture nel progetto; per limitare tecnicamente le scritture serve il profilo appropriato. Ask/read-only è utile all'esplorazione ma non prova da solo un flusso piano con revisione. Non ho verificato salvataggio automatico del piano come artefatto riusabile fra client, editor diretto uniforme o verifica finale obbligatoria requisito per requisito. [Sicurezza e approvazioni](https://learn.chatgpt.com/docs/agent-approvals-security).

**Costo.** Consumo incluso o crediti secondo account; il listino distingue token in ingresso, cache e uscita. Non è un preventivo del piano. Il tempo della pianificazione non è dichiarato come durata fissa. [Listino e unità di consumo](https://learn.chatgpt.com/docs/pricing).

**Da eguagliare/superare:** chiarimenti fondati sul repository e piano consegnabile; rendere espliciti identità, salvataggio, consenso e prova finale nella UI di TALOS.

### 3.4 Cursor

**Data:** introduzione ufficiale **07/10/2025**; documentazione corrente consultata il 12/09/2026. Il piano contiene riferimenti al codice e attività modificabili; il modello esplora e pone domande, poi la persona costruisce dal piano. `Shift+Tab`, modifica diretta e modifica via chat sono già parte del flusso. [Annuncio](https://cursor.com/blog/plan-mode).

**Punti forti e persistenza.** La documentazione attuale dichiara piani salvati nella cartella personale, trasferibili nel progetto con «Save to workspace». Il piano può essere rivisto e rilanciato. I Cloud Agents eseguono lavoro in background: questo non dimostra che ogni variante del piano locale venga trasferita al cloud con identica revisione e identici consensi. [Plan Mode](https://cursor.com/docs/agent/plan-mode), [Cloud Agents](https://cursor.com/docs/cloud-agent).

**Debolezze.** Un membro del supporto documenta il **20/04/2026** che un `.plan.md` scritto direttamente può non essere registrato come piano e quindi perdere pulsante Build/checklist: file e registro interno sono due cose diverse. Una discussione della beta 2025 documenta problemi poi dichiarati scomparsi in 2.0: non li tratto come ancora aperti. [Limite del registro del piano](https://forum.cursor.com/t/markdown-build-plan-inconsistent-edit-preview-mode/158313/7), [precedente e risoluzione dichiarata](https://forum.cursor.com/t/what-happens-when-plan-file-is-saved/135261).

**Costo.** L'uso dipende da modello, ingresso/uscita/cache e bacino di consumo; non c'è una tariffa fissa «un piano». La modifica diretta evita una richiesta al modello per una correzione puramente editoriale. Durata e risparmio netto non misurati qui. [Modelli e prezzi](https://cursor.com/docs/models-and-pricing).

**Da eguagliare/superare:** piano davvero modificabile e rilanciabile; in TALOS un'unica identità deve tenere allineati contenuto, pulsanti e stato dopo il reload.

### 3.5 Windsurf / Cascade

**Fonte corrente, s.d.:** il vecchio indirizzo Windsurf reindirizza alla documentazione Devin Desktop/Cascade. Mantengo il nome richiesto, senza confondere questa superficie con Ask Devin cloud. [Modalità Cascade](https://docs.devin.ai/desktop/cascade/modes).

**Punti forti.** Plan esplora, chiede chiarimenti con opzioni e scrive un Markdown esterno al repository, conservato in `~/.windsurf/plans` o `~/.devin/plans`. «Implement» avvia Code; i piani sono richiamabili tramite menzioni anche in un contesto nuovo. La persistenza è una funzione reale, non soltanto una risposta lunga in chat.

**Limite dichiarato decisivo:** la tabella ufficiale dà a Plan **tutti gli attrezzi**, mentre Ask ha solo ricerca. La stessa pagina consente anche transizione automatica a Code quando l'agente interpreta che la persona sia pronta. Perciò non classifico Plan come barriera di sola lettura né come consenso sempre esplicito. Le parole speciali `megaplan/ultraplan/masterplan` impongono almeno un chiarimento: non è necessariamente utile quando i requisiti sono già completi.

**Costo.** Abbonamento/limiti dipendono dall'offerta; per Enterprise sono dichiarate ACU dipendenti da inferenza e modello. Nessuna quantità di token o durata garantita per un piano. [Uso e fatturazione](https://docs.devin.ai/desktop/accounts/usage).

**Da eguagliare/superare:** riuso fra sessioni; in TALOS l'uscita deve corrispondere a un gesto della persona registrato, senza dedurla dalla risposta a un chiarimento.

### 3.6 Cline

**Fonti correnti, s.d.** Plan/Act è una separazione molto leggibile: Plan legge e discute, Act modifica e conserva la conversazione. È configurabile un modello distinto per ciascuna fase. La documentazione consiglia di evitare il costo della pianificazione per cambi banali. [Plan & Act](https://docs.cline.bot/core-workflows/plan-and-act).

**Punti forti.** `/deep-planning` organizza indagine, discussione, `implementation_plan.md` e creazione di un compito con passi tracciabili. La continuità può passare attraverso una nuova attività con contesto condensato. Questo va distinto dal semplice interruttore Plan/Act. [Comandi e pianificazione approfondita](https://docs.cline.bot/core-workflows/using-commands).

**Debolezze documentate.** [#10605](https://github.com/cline/cline/issues/10605), **08/05/2026**, ancora aperta alla verifica: nella CLI 2.18.0 viene segnalato il passaggio indesiderato ad Act dopo interruzione/recupero del contesto. Non estendo automaticamente il problema all'estensione. [#2369](https://github.com/cline/cline/issues/2369), **21/03/2025**, chiusa **14/07/2025**, descrive interferenze Plan/Act fra finestre: precedente utile per il test di isolamento, non difetto corrente dimostrato.

**Costo.** Le chiamate consumano il fornitore selezionato; Cline offre anche crediti a consumo. Un cambio di modello conserva la discussione, che può dover essere riprocessata dal nuovo modello. Nessun overhead temporale o numero di token per piano comparabile verificato. [Fornitore Cline a consumo](https://docs.cline.bot/getting-started/cline-provider).

**Da eguagliare/superare:** semplicità Plan/Act e modelli distinti; stato vincolato alla singola sessione e preservato attraverso interruzioni e reload.

### 3.7 Roo Code — Architect e Boomerang

**Stato del prodotto da dichiarare:** il README ufficiale, commit `d82583c91b17ffbc0e0d70e4b3c7815374085d27` del **15/05/2026**, dichiara la chiusura dell'estensione il 15 maggio. Le guide sono aggiornate al **15/05/2026**. Il vecchio sito reindirizza oggi a Roomote: non attribuisco a Roo le caratteristiche del nuovo prodotto. [README e stato](https://github.com/RooCodeInc/Roo-Code/blob/d82583c91b17ffbc0e0d70e4b3c7815374085d27/README.md).

**Punti forti del disegno.** Architect consente lettura, MCP e scritture limitate ai Markdown; ogni modalità ricorda il proprio modello. Orchestrator/Boomerang scompone il lavoro in sottoattività, con contesti isolati, gerarchia visibile e ritorno di un riassunto al genitore. [Modalità](https://roocodeinc.github.io/Roo-Code/basic-usage/using-modes/), [Boomerang](https://roocodeinc.github.io/Roo-Code/features/boomerang-tasks/).

**Limiti dichiarati.** Il genitore non passa automaticamente tutto il contesto al figlio; torna solo il riassunto finale. Creazione e completamento delle sottoattività richiedono approvazione per impostazione predefinita, salvo automazione. Architect non è una sandbox di sola lettura universale: MCP resta disponibile e il vincolo Markdown non copre ogni possibile effetto esterno. Sono limiti del contratto, non una vulnerabilità riprodotta.

**Costo.** Il flusso comporta inferenze per i diversi compiti/modelli e costo di ricostruzione del contesto. Nessun costo unitario del piano o tempo pubblicato verificato; nessun listino di un servizio attivo Roo viene promesso qui.

**Da eguagliare/superare:** scomposizione leggibile; evitare perdita delle prove nei riassunti e rendere l'orchestrazione facoltativa. Non adottare una dipendenza non mantenuta per questa funzione.

### 3.8 Aider — architect/editor

**Origine documentata: 26/09/2024; guide correnti s.d.** L'architetto ragiona sulla soluzione; l'editor traduce l'esito in modifiche. La coppia di modelli è esplicita e configurabile: non è una novità che TALOS possa rivendicare. Il benchmark storico nell'annuncio riguarda l'editing nel suo specifico ambiente, non il vantaggio universale di una modalità piano. [Annuncio architect/editor](https://aider.chat/2024/09/26/architect.html).

**Punti forti.** `/ask` serve a discutere senza cambiare file; `/architect` consente una fase di ragionamento distinta dall'applicazione. È un disegno compatto per chi lavora nel terminale. **Limite decisivo:** Architect appartiene ai flussi che possono cambiare file. `--auto-accept-architect` è attivo per impostazione predefinita; disattivandolo si richiede conferma prima dell'editor. Non equiparare quindi Architect a «piano che attende sempre la persona». [Modalità](https://aider.chat/docs/usage/modes.html), [opzioni e valore predefinito](https://aider.chat/docs/config/options.html).

**Debolezze e costo.** Le fonti consultate non documentano un registro nativo di revisioni approvate, un piano salvato obbligatorio o una verifica per requisito. Il secondo passaggio comporta ulteriori token e latenza seriale; non significa automaticamente il doppio del costo, perché modelli e contesti possono differire. Nessun costo per piano comparabile misurato qui.

**Da eguagliare/superare:** separazione fra chi ragiona e chi esegue, quando conveniente; renderla un'opzione di consumo, senza confonderla con il consenso a eseguire.

### 3.9 Gemini CLI

**Documentazione aggiornata 18/06/2026:** esiste una Plan Mode nativa. `/plan` e Shift+Tab la attivano; `ask_user` raccoglie decisioni; un Markdown modificabile con Ctrl+X precede l'approvazione. Le regole limitano gli attrezzi e ammettono scritture nella cartella dei piani. Con selezione automatica, Pro pianifica e Flash implementa; è previsto un ripiego silenzioso quando il modello superiore non è disponibile. [Plan Mode, regole e instradamento](https://geminicli.com/docs/cli/plan-mode/).

**Limiti dichiarati:** la pulizia delle sessioni elimina normalmente anche i piani dopo 30 giorni, salvo configurazione/cartella personalizzata; gli hook sugli attrezzi non intercettano le transizioni manuali. In esecuzione non interattiva entrata/uscita sono approvate automaticamente e l'uscita passa a YOLO. La garanzia interattiva non vale quindi indistintamente per gli script. La richiesta di accordo sulla strategia prima del piano aggiunge un passaggio umano.

**Costo.** Quote e fatturazione dipendono da autenticazione e offerta; una richiesta umana può generare più richieste al modello. Nessun costo o tempo fisso per piano. [Quote e prezzi](https://geminicli.com/docs/resources/quota-and-pricing/).

**Da eguagliare/superare:** selezione del modello per fase; in TALOS ogni ripiego e ogni scadenza del piano devono essere visibili.

### 3.10 GitHub Copilot — IDE e CLI distinti

**Fonti:** guida VS Code aggiornata **09/09/2026**, documentazione GitHub corrente s.d. Nell'IDE il Plan agent esplora senza modificare il progetto, pone domande e offre un passaggio esplicito all'implementazione. «Open in Editor» rende il piano lavorabile come documento. [Chat e Plan nell'IDE](https://docs.github.com/en/copilot/how-tos/chat-with-copilot/chat-in-ide?tool=vscode).

**Punti forti.** VS Code collega piano, lista di cose da fare e avvio dell'agente esecutore. Consente modelli predefiniti distinti per pianificazione e implementazione. **Limite dichiarato:** il piano nella memoria di sessione, `/memories/session/plan.md`, non è disponibile nelle conversazioni successive quando la conversazione termina; per riuso duraturo occorre salvarlo. [Pianificazione in VS Code](https://code.visualstudio.com/docs/agents/run/planning).

Nella CLI Shift+Tab attiva la pianificazione e l'accettazione può avviare l'esecuzione autonoma, anche con `/fleet`. È una superficie diversa dall'agente cloud su GitHub: non trasferisco automaticamente tutte le capacità dall'una all'altra. [Piani ed esecuzione nella CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/speed-up-task-completion).

**Debolezze e costo.** La differenza fra memoria di sessione e file permanente rende facile attribuire al piano una durata che non ha. La documentazione corrente descrive consumo di AI credits, variabile con modello e uso: nessuna quantità di token o durata per piano verificata. Non riporto vecchie regole sulle premium request come listino attuale. [Uso nell'IDE e consumo](https://docs.github.com/en/copilot/how-tos/chat-with-copilot/chat-in-ide?tool=vscode).

**Da eguagliare/superare:** consegna all'esecutore con contesto; un piano TALOS salvato deve restare reperibile indipendentemente dalla vita della chat.

### 3.11 OpenHands

**Annuncio primario: 06/03/2026.** OpenHands presenta Planning Mode, indicata come beta nell'annuncio: interruttore Plan/Code, domande su richieste vaghe e documento `PLAN.md` nel progetto prima di costruire. È scorretto dire che OpenHands non abbia una modalità piano. [Aggiornamento di marzo](https://www.openhands.dev/blog/openhands-product-update---march-2026).

**Punti forti.** Il piano è un artefatto ordinario del progetto; il flusso raccoglie chiarimenti prima del lavoro. Inoltre lo SDK espone metriche aggregate di costo, token, cache e latenza, comprese chiamate ausiliarie: la misura completa del consumo non è una nostra invenzione. [Metriche dello SDK](https://docs.openhands.dev/sdk/guides/metrics).

**Limiti verificabili.** L'annuncio è una beta, non una prova delle garanzie correnti. La documentazione reperita non basta a stabilire un vincolo immutabile di sola lettura, un'approvazione legata alla versione o una verifica finale obbligatoria del piano. L'indice ufficiale è stato consultato dopo ricerche mirate e tentativi di apertura diretta: queste voci restano **non verificate**, non «assenti». [Indice ufficiale](https://docs.openhands.dev/llms.txt).

**Costo.** Le metriche consentono di attribuire token e latenza alle chiamate reali. Non ho misurato un piano sul servizio né verificato una tariffa unitaria completa che includa ogni eventuale costo di esecuzione.

**Da eguagliare/superare:** artefatto e rendicontazione; provare il comportamento al reload e il blocco prima del consenso con esecuzioni reali.

### 3.12 Devin

**Documentazione corrente, s.d.** Ask Devin è una superficie di esplorazione in sola lettura del codice indicizzato. Permette di delimitare il lavoro e consegnare a Devin un incarico arricchito dal contesto raccolto; lo stato della sessione avviata è consultabile dalla conversazione Ask. [Ask Devin](https://docs.devin.ai/work-with-devin/ask-devin).

**Punti forti.** La discussione prima dell'esecuzione evita di dover riscrivere da zero una richiesta dettagliata. Per compiti complessi la guida raccomanda proprio di usare Ask prima di affidare il lavoro. Questo supporta «piano prima dell'esecuzione», ma non dimostra che ogni sessione Devin imponga approvazione di un Markdown revisionato.

**Limiti dichiarati.** La riuscita dipende da chiarezza della richiesta e ambiente funzionante; compiti che raggiungono ripetutamente i limiti della sessione possono essere troppo complessi e richiedere scomposizione. Non ho verificato un gestore obbligatorio di domande strutturate, né approvazione per singolo passo. [Indicazioni sui compiti adatti](https://docs.devin.ai/essential-guidelines/when-to-use-devin).

**Costo.** La fatturazione distingue quote e consumo; Enterprise usa ACU. Pianificazione, contesto e azioni influenzano il consumo. Una sessione sveglia può consumare anche durante l'attesa; quando dorme non consuma. Non trasformo ACU in minuti universali o token senza misure. [Uso e fatturazione](https://docs.devin.ai/admin/billing/usage).

**Da eguagliare/superare:** continuità fra discussione ed esecuzione; per TALOS rendere esplicito se l'attesa umana ha costo e sospendere l'inferenza quando la decisione è pendente.

### 3.13 Amp

**Aggiornamento primario: 09/07/2026.** Il «Dial» corrente usa low/medium/high/ultra; smart/deep/rush/large sono modalità precedenti, ripristinabili tramite plugin. Ogni livello dispone di un oracle per un secondo parere, anche con un modello diverso. Non chiamare automaticamente «Plan Mode» un livello di ragionamento. [Il Dial](https://ampcode.com/news/the-dial), [guida corrente](https://ampcode.com/docs/the-dial).

**Punti forti.** Separare l'intensità del lavoro dal modello principale e consentire una revisione esterna è utile per problemi difficili. La precedente documentazione di Rush descrive l'oracle come risorsa per pianificazione e critica, più lenta e costosa; è una genealogia della funzione, non il selettore corrente. [Rush 2.0 e oracle](https://ampcode.com/news/rush-2.0).

**Limiti e costo.** Nelle fonti consultate non è verificato un flusso nativo completo con blocco di sola lettura, documento approvabile e registro di revisioni. Il Dial dichiara per high un'attesa circa doppia rispetto a medium nel suo confronto indicativo: non è un benchmark della sola pianificazione. Il prezzo dipende da modelli, attrezzi ed eventuale esecuzione; nessun costo fisso per piano. [Prezzi](https://ampcode.com/docs/pricing).

**Da eguagliare/superare:** secondo parere attivabile sui casi difficili; mostrarne il costo e non chiamarlo automaticamente per ogni correzione.

### 3.14 Kiro — sviluppo da specifica

**Documentazione Specs aggiornata 27/08/2026.** Requirements-First produce `requirements.md`, poi `design.md`, infine `tasks.md`: requisiti con criteri di accettazione, decisioni progettuali e passi con dipendenze. La persona rivede le fasi; i compiti possono essere eseguiti singolarmente o tutti. La modifica dei requisiti può propagarsi a disegno e attività tramite Refine. [Requirements-First](https://kiro.dev/docs/specs/feature-specs/requirements-first/).

**Punti forti.** È il riferimento più completo del gruppo per collegare intenzione, disegno e compiti persistenti. Non è solo «pensare di più». Esistono anche Design-First e Quick Spec; quest'ultima riduce i passaggi di approvazione. [Panoramica delle specifiche](https://kiro.dev/docs/specs/). Dal **11/06/2026** le specifiche nel browser sono modificabili via chat, eseguibili per selezione e scaricabili. [Changelog del browser](https://kiro.dev/changelog/web/gitlab-support-and-specs-in-the-browser/).

**Limiti dichiarati e implicazioni.** Il tipo di workflow non si cambia dopo la creazione: serve una nuova specifica. Richiamare `#spec` include i tre documenti; è ragionevole aspettarsi più contesto da processare, ma qui non è stato misurato il sovraccosto. [Buone pratiche e vincoli](https://kiro.dev/docs/specs/best-practices/). L'esistenza di criteri e strategia di test non dimostra che ogni stato «completato» sia bloccato da una prova automatica indipendente.

**Costo.** Richieste, raffinamento delle specifiche, esecuzione dei compiti e hook possono consumare crediti; la misura varia con il lavoro, con granularità dichiarata di 0,01 crediti. Nessun numero universale di crediti/token o ore per specifica. [Prezzi e consumo](https://kiro.dev/pricing/).

**Da eguagliare/superare:** tracciabilità dei requisiti; presentarla con il peso di una chat normale, espandendo i dettagli solo quando servono.

## 4. Matrice funzione × concorrente

Hermes è il primo termine di confronto in entrambe le metà. Le celle sintetizzano le fonti delle schede precedenti, non test eseguiti. **D** = documentato; **P** = parziale, opzionale o dipendente dalla superficie/configurazione; **I** = istruzione al modello, senza garanzia applicativa verificata; **ND** = non determinato dalle fonti consultate; **NO** = comportamento contrario dichiarato. «Verifica finale» significa collegare esiti ai requisiti, non semplicemente avere un comando di test. «Modificabile» comprende un editor esterno dichiarato; un testo copiabile non basta.

| Funzione | Hermes Agent | Claude Code | Codex CLI/app | Cursor | Windsurf/Cascade | Cline | Roo Code |
|---|---|---|---|---|---|---|---|
| Esplorazione in sola lettura | I: `/plan` | P: policy/configurazione | P: piano e sandbox distinti | D: Plan | NO: Plan ha tutti gli attrezzi | D: Plan | P: Architect scrive Markdown/MCP |
| Domande di chiarimento | D: clarify | D: AskUserQuestion | D: piano interattivo | D | D | D: dialogo | P: dialogo |
| Piano scritto e modificabile | D: file | D: file/editor | P: testo; file uniforme ND | D: Markdown/editor | D: Markdown | P: deep-planning | P: Markdown |
| Approvazione esplicita prima di eseguire | I: attende istruzione | P: ExitPlanMode/configurazione | D: uscita dal piano | D: Build | P: anche uscita inferita | D: Act | P: sottoattività/configurazione |
| Passi con stato | D: todo separato | D: task list | P: piano operativo distinto | D: todo | D: todo | P: percorso strutturato | D: sottoattività |
| Esecuzione per passo / intera | P: istruzioni successive | P: intera/task | P: intera | P: Build; singolo ND | P: Implement | P: Act | D: sottoattività |
| Ripresa / deviazione dal piano | P: file e contesto | P: sessione/piano | P: sessione | D: rivedi e rilancia | D: richiamo piano | P: dialogo/newtask | P: ritorno riassunto |
| Piano salvato / riusabile | D: file | D: file | P: sessione; artefatto uniforme ND | D: salva nel progetto | D: esterno/richiamabile | D: deep-planning | P: file/contesti |
| Costo dichiarato | Token/modello; piano ND | Token/modello; piano ND | Quote/crediti; piano ND | Token/crediti; piano ND | Quote/ACU; piano ND | Fornitore/crediti; piano ND | Fornitore; servizio cessato |
| Modello diverso per pianificare | D: delega/configurazione | D: opusplan | P: selezione; coppia automatica ND | P: selezione | P: selezione | D: Plan/Act | D: per modalità |
| Verifica finale contro piano | I: istruzioni di verifica | P: revisione/test | I: richiesta di verifica | P: checklist | P: todo | P: compiti/test | P: esiti figli |

| Funzione | Hermes Agent | Aider | Gemini CLI | GitHub Copilot | OpenHands | Devin | Amp | Kiro |
|---|---|---|---|---|---|---|---|---|
| Esplorazione in sola lettura | I | P: Ask, non Architect | P: regole configurabili | D: Plan IDE / Ask distinto | ND: garanzia | D: Ask | P: oracle; modalità ND | P: fase di specifica |
| Domande di chiarimento | D | P: dialogo | D | D | D | P: Ask | P: dialogo/oracle | D: revisione requisiti |
| Piano scritto e modificabile | D | ND: artefatto nativo | D | D | D: PLAN.md | P: discussione | ND | D: tre documenti |
| Approvazione esplicita prima di eseguire | I | P: automatica di default | P: interattiva | D: avvio implementazione | P: Plan/Code | P: avvio sessione | ND | P: workflow/Quick Spec |
| Passi con stato | D | ND | D: task tracker | D: todo | P: attività; legame ND | P: sessione | ND: legame al piano | D |
| Esecuzione per passo / intera | P | P: passaggio editor | P: intera | P: intera/fleet | P: Code | P: sessione | ND | D: singoli/tutti |
| Ripresa / deviazione dal piano | P | P: conversazione | D: revisione | P: contesto/sessione | P: file | P: follow-up | P: thread | D: Refine |
| Piano salvato / riusabile | D | P: manuale | P: conservazione configurabile | P: salvare oltre sessione | D: file | ND: artefatto autonomo | ND | D |
| Costo dichiarato | Token/modello; piano ND | Token/modelli; piano ND | Quote; piano ND | AI credits; piano ND | Metriche; piano ND | Quote/ACU; piano ND | Modelli/attrezzi; piano ND | Crediti; piano ND |
| Modello diverso per pianificare | D | D: architect/editor | D: instradamento automatico | D: IDE configurabile | ND: coppia automatica | ND | D: oracle distinto | ND: coppia automatica |
| Verifica finale contro piano | I | P: test | P: istruzioni/test | P: verifiche nel piano | ND: cancello obbligatorio | P: lavoro/test | P: oracle | P: criteri/test; cancello ND |

**Lettura corretta della matrice.** Non c'è evidenza sufficiente per proclamare un vincitore assoluto. Hermes è il bersaglio primario; per l'artefatto editabile Cursor offre un riferimento concreto, per la distinzione Plan/Act Cline, per la relazione requisiti–compiti Kiro. Nessuna riga autorizza a dire «gli altri non lo fanno» quando la cella è ND. Nessun fornitore esaminato fornisce una misura direttamente comparabile di token e tempo per lo stesso piano.

## 5. TALOS: il disegno per batterli, con condizioni misurabili

La proposta è **un piano vivo dentro la conversazione**. La persona deve poter rispondere in ogni momento a quattro domande: «Che cosa farai?», «Che cosa ho autorizzato?», «A che punto siamo?», «Quali prove mostrano che è riuscito?». La chat resta compatta; i dettagli si aprono sul piano, nei giri e nelle sezioni esistenti. Quello che segue è disegno da realizzare, non descrizione di una funzione già disponibile.

### 5.1 Entrare nel piano, senza cambiare i permessi

Nel composer compare una pillola **«Piano» / «Esegui»**. In «Nuova sessione» il controllo principale diventa **«Prepara un piano»**; la scelta **«Modello per il piano»** resta opzionale nei dettagli. Se non si sceglie un secondo modello, si pianifica con quello della chat: la modalità non deve dipendere dall'acquisto o dalla configurazione di un modello aggiuntivo.

La persona può entrare anche scrivendo «prima fammi un piano» o dal menu ⋯ della conversazione. Il sistema registra il cambio effettivo prima di mostrare «Piano · Solo esplorazione». Se sta terminando un'azione già avviata, mostra «Passaggio al piano in attesa» e sospende al prossimo confine sicuro; non promette retroattivamente che quell'azione non abbia avuto effetti.

La scorciatoia richiesta, **Shift+Tab**, è disponibile come preferenza nel composer, con indicazione nel foglio delle scorciatoie. Nel desktop web il comportamento predefinito deve conservare la navigazione inversa da tastiera: nessuna cattura globale. La pillola funziona sempre con tastiera e lettore di schermo. La decisione sul valore predefinito della scorciatoia va presa dopo il controllo dei conflitti, non copiando un terminale dentro una pagina.

I quattro permessi restano distinti. Durante «Piano» prevale il divieto di eseguire modifiche anche se la sessione ha «Accesso pieno»; quando la persona approva il piano, si torna ai permessi scelti in precedenza. **Approvare il piano non amplia da solo l'accesso agli attrezzi.** Se l'accesso impedisce il passo, TALOS lo spiega nel foglio Permessi senza falsificare lo stato del piano.

**Confronto e prova:** Hermes offre l'ingresso rapido; Claude Code, Codex, Cursor e Cline hanno già selettori analoghi (§3). Il vantaggio proposto è verificabile: zero modifiche prima del consenso, con ciascuno dei quattro permessi; nessuna scorciatoia intrappola il focus. Non attribuisco agli altri un difetto di accessibilità non testato.

### 5.2 Esplorare abbastanza, poi fare solo le domande utili

La chat mostra una riga discreta **«Sto preparando il piano»**, espandibile sulle letture realmente svolte. Gli attrezzi iniziali sono **cerca, elenca, leggi**: richiesta, contesto selezionato, istruzioni del progetto, file pertinenti e test esistenti. Le informazioni già disponibili alla sessione passano anche al planner, con gli stessi controlli di accesso; non si costringe il secondo modello a riscoprirle.

Nessuna shell generica per fingere una lettura sicura: un comando di test può scrivere cache, lanciare processi o usare la rete. Consultazione web e fonti esterne restano possibili quando pertinenti e autorizzate, con destinazione e provenienza visibili. Non si avvia «Ricerca approfondita» come effetto collaterale di «Piano». Per attrezzi aggiunti, un'etichetta dichiarata «sola lettura» non basta: serve una capacità verificata dall'adattatore e una politica applicata prima dell'invocazione.

Le domande arrivano **dopo l'esplorazione recuperabile**, salvo una decisione indispensabile per sapere che cosa leggere. Si chiede soltanto ciò che cambia perimetro, comportamento, rischio, compatibilità o spesa. Si raccolgono insieme poche domande correlate, normalmente da una a tre, senza imporne un numero minimo. Nessuna domanda su un nome di file che TALOS può cercare. La persona può rispondere con testo normale; quando una scelta è reversibile, può lasciare che TALOS usi un'ipotesi dichiarata. Una risposta a «quale formato?» non approva l'esecuzione.

**Confronto e prova:** Hermes ha già chiarimenti strutturati; Claude Code e Codex distinguono decisioni e informazioni recuperabili. Rispetto ai passaggi umani obbligatori documentati in altri flussi, TALOS punta a zero domande ridondanti e nessuna domanda minima artificiale. Il miglioramento si misura contando domande già risolte da prompt/contesto, copertura delle decisioni necessarie e turni umani fino al piano approvabile.

### 5.3 La forma del piano: leggibile subito, verificabile nei dettagli

Nella chat compare una scheda con **titolo, obiettivo, versione e stato**. La prima vista contiene i passi e gli eventuali punti da decidere. Aprendo un passo si vedono risultato atteso, file coinvolti con operazione prevista, dipendenze, rischi e prova richiesta. Per un compito semplice bastano pochi passi; non si impongono tre documenti o una specifica lunga a ogni richiesta.

Il piano conserva:

- obiettivo della persona, vincoli e criteri di accettazione, compresi i comportamenti da preservare;
- file effettivamente ispezionati e fonti, con data e impronta; file da creare, modificare o eliminare nominati uno per uno, senza «file correlati»;
- passi con identificatore stabile, esito verificabile, dipendenze e controlli associati;
- rischi, ipotesi, decisioni aperte, eventuali azioni esterne e recupero previsto;
- consumi reali della preparazione e previsione dell'esecuzione, solo quando esiste una base misurata;
- versione del piano, autore delle modifiche, ambito approvato e collegamenti a giri, prove e attività.

Un passo è «La ricerca restituisce anche i documenti rinominati; lo dimostra il test indicato», non «Migliorare il sistema». Il dettaglio deve aiutare a giudicare il cambiamento: evitare di scrivere in anticipo intere implementazioni speculative nel piano. Se l'esplorazione è incompleta, la scheda dice **«Bozza incompleta»**, elenca ciò che manca e non passa da sola all'esecuzione.

**Confronto e prova:** Hermes già nomina file e verifiche; Kiro già collega criteri e compiti; Cursor già rende il testo modificabile. La parità minima è questa concretezza. Il vantaggio cercato è che il 100% dei passi approvabili abbia un esito controllabile e che un criterio non sparisca quando si riscrive il piano. La percentuale è un cancello progettuale, non un risultato raggiunto oggi.

### 5.4 Modificare e approvare la versione esatta

Azioni principali: **«Modifica piano»**, **«Approva ed esegui»**; dal menu del pulsante, **«Approva ed esegui il prossimo passo»**. Nel menu ⋯: **«Confronta versioni»**, **«Apri in Note»**, **«Riusa piano»**, **«Esporta»**. Una correzione editoriale diretta non richiede una chiamata al modello. Le modifiche strutturali vengono validate e, se cambiano dipendenze o prove, la nuova versione mostra tali conseguenze prima dell'approvazione.

La persona può anche dire «approvo la versione 3, procedi con tutti i passi» nella chat: se messaggio, piano e ambito sono inequivocabili, questa è già l'approvazione, senza una seconda conferma rituale. Un «sì» riferito a una domanda, un testo citato o un'istruzione contenuta in un file non lo sono. La risoluzione usa lo stato della conversazione e l'identità del messaggio, non una regex su una parola positiva.

L'approvazione registra versione e impronta del piano, progetto, persona, ambito e momento. L'indice dei giri rimanda alla stessa versione mostrata in chat. Se due finestre sono aperte e una modifica il piano, il pulsante dell'altra non può autorizzare una versione invisibile. Mostra il confronto e conserva l'eventuale bozza locale.

**Confronto e prova:** Hermes è il primo riferimento per il documento riusabile, ma il consenso legato all'impronta non è verificato lì; Claude Code e Cursor hanno già un passaggio visibile all'azione. L'obiettivo TALOS è zero esecuzioni su versioni diverse da quella approvata e zero duplicazioni a doppio clic/reinvio. Questo supera una semplice promessa nel prompt se passa i test di concorrenza e ripresa.

### 5.5 Eseguire, fermarsi e dichiarare le deviazioni

Gli stati visibili del passo sono **«Da iniziare · In corso · In verifica · Verificato · Bloccato · Da rivedere · Annullato»**. «Verificato» richiede le prove previste; se una prova è solo umana o manca, resta distinguibile. Ogni passo rimanda ai giri che lo hanno eseguito: un passo può richiedere molti giri, e un giro può contribuire a più verifiche. Non si spaccia il conteggio dei giri per percentuale di completamento.

«Esegui il prossimo passo» esegue anche i controlli necessari a quel passo, poi si ferma. I prerequisiti non completati vengono mostrati: non si lascia lanciare una dipendenza isolata in modo incoerente. «Esegui tutto» procede nell'ambito approvato e chiede soltanto quando nasce una decisione nuova o interviene una politica degli attrezzi. «Pausa» interrompe l'avvio di nuove azioni; al ritorno si vede l'ultima prova registrata e ciò che potrebbe essere rimasto in corso.

Se occorre un file non previsto, un'azione esterna nuova o un costo oltre il limite autorizzato, compare **«Il piano deve cambiare»**, con differenza, motivo e impatto. L'esecuzione coinvolta si ferma finché esiste un'autorizzazione valida per il nuovo ambito. Una scelta interna che non cambia ambito né rischi può essere annotata e proseguita: il piano non deve obbligare a chiedere permesso per ogni dettaglio. I passi già verificati restano nella storia; una revisione non cancella retroattivamente problemi o prove.

**Confronto e prova:** Hermes ha già todo e continuità; Kiro esegue compiti singoli/tutti; Roo ha una gerarchia di sottoattività. La proposta aggiunge una corrispondenza obbligatoria fra stati e prove registrate. Si misurano completamenti senza prova, deviazioni non dichiarate, lavoro duplicato dopo ripresa e tempo umano necessario per capire il punto raggiunto.

### 5.6 La verifica finale: confrontare promessa e risultato

Alla fine la scheda mostra **«Verificato»**, **«Verificato in parte»** oppure **«Verifica non disponibile»**, con criteri riusciti, falliti e non controllati. Per ogni criterio la persona apre il comando, il risultato o il percorso umano che lo dimostra. Una compilazione riuscita non prova da sola la correttezza della richiesta. Un modello che scrive «tutto fatto» non può promuovere lo stato.

Il controllo semantico esistente rimane sul suo perimetro (§2.4). Un controllo distinto nel kernel aggrega le prove contro il piano approvato: esecuzione di test, esiti degli attrezzi, impronte degli artefatti, verifiche di compatibilità e accettazione umana dove necessaria. Controlla anche i vincoli negativi, per esempio «non cambiare il formato esportato». Un secondo modello può aiutare a rilevare omissioni, ma il suo parere non sostituisce una prova mancante.

**Confronto e prova:** Hermes già richiede verifica nelle istruzioni; Kiro formalizza criteri e test; OpenHands già misura l'esecuzione. Non è documentato in questa ricerca un contratto universale che blocchi ogni completamento privo di evidenza. TALOS deve dimostrare zero «Verificato» quando una prova obbligatoria è assente, fallita o riferita a una versione precedente. Non promette una verifica semantica perfetta del linguaggio naturale.

### 5.7 Salvare in Note, seguire in Attività, riusare senza ereditare consenso

Il piano diventa reperibile in **Note**, con etichetta «Piano», versione e collegamento alla conversazione. I passi compaiono in **Attività** come viste dello stesso lavoro, non copie indipendenti da aggiornare a mano. Gli stati aggiuntivi del piano vengono spiegati nella scheda; le vecchie attività restano compatibili con i tre stati attuali. Se una proiezione non è aggiornata, si mostra il problema e si ricostruisce dal registro; nessuna falsa sincronizzazione.

«Riusa piano» crea una nuova bozza e chiede a TALOS di ricontrollare progetto, file, ipotesi e prezzi. Non copia approvazioni, prove concluse o permessi. Un Markdown esportato è portabile; reimportarlo richiede validazione e crea un artefatto nuovo. Libreria può conservarne una copia tramite il flusso documenti esistente; non serve una nuova sezione. Memoria non diventa il deposito silenzioso di autorizzazioni.

**Confronto e prova:** Hermes salva già piani; Cursor e Windsurf li riutilizzano; Kiro li conserva come specifiche. TALOS deve eguagliare la reperibilità e dimostrare che chat, indice, Note e Attività aprono sempre lo stesso piano. Riuso sicuro significa zero consensi ereditati e zero prove vecchie presentate come appena eseguite.

### 5.8 Dire il costo prima, misurarlo durante, rendicontarlo dopo

Prima di inviare la richiesta in «Piano», la pillola del costo apre **«Preparazione del piano»** e **«Esecuzione»**. Mostra modelli, tariffa e data della tariffa quando note; eventuali revisioni aggiuntive sono separate. Se non esiste storico comparabile, il testo corretto è **«Stima non disponibile: mostrerò il consumo effettivo»**, non un numero inventato. Un tetto personale può essere scelto esplicitamente; non si reintroduce un limite generale di giri nel kernel.

Quando esiste uno storico, si presenta un intervallo empirico in giri e token, indicando numero di osservazioni, classe di lavoro, modello e data. Va ricalibrato quando cambiano modello, contesto o attrezzi. La copertura dell'intervallo deve essere verificata sui risultati successivi. Il limite attuale di otto giri del planner non costituisce tale storico.

Durante il lavoro si distinguono letture/inferenza, attesa degli attrezzi e attesa della persona; quest'ultima non deve tenere un modello in un loop a consumo. Al termine si sommano preparazione, revisioni, esecuzione e verifica, includendo richieste ausiliarie effettive. Token di ingresso, cache e uscita seguono le definizioni del fornitore per evitare doppio conteggio. Se il fornitore non restituisce una misura, compare «non disponibile», non zero. Prima dell'esecuzione la scheda mostra il costo reale già speso per il piano e l'eventuale previsione del lavoro residuo.

**Confronto e prova:** Hermes supporta già modelli diversi; Cline, Aider e Gemini CLI offrono configurazioni per fase; OpenHands espone metriche articolate. Il vantaggio TALOS deve essere contabile: totale della UI riconciliabile con tutte le chiamate, nessun consumo planner omesso, errore della stima pubblicato insieme alla stima. Non prometto che usare due modelli costi meno: va verificato sul compito.

### 5.9 Esempio del percorso umano, solo disegno

> Persona: «Prima fammi un paino per rendere modificabile il titolo delle note. Mantieni gli indirizzi esistenti.»  
> TALOS: «Piano · Solo esplorazione». Nella riga espandibile: file e test effettivamente letti.  
> Piano: obiettivo, compatibilità richiesta, passi verificabili. «Preparazione: consumo effettivo disponibile a fine chiamata. Esecuzione: stima non disponibile».  
> Persona: «La rinomina deve esserci anche dopo aver ricaricato.»  
> TALOS: nuova versione con criterio di persistenza e relativo test; differenza visibile.  
> Persona: «Approvo questa versione, esegui solo il primo passo.»  
> TALOS: esegue nell'ambito e nei permessi correnti, registra prove, poi si ferma.  
> Persona, dopo reload: «Continua con il resto.»  
> TALOS: riprende dalla versione e dalle prove registrate; se un presupposto è cambiato lo segnala.  
> Esito: criteri verificati e prove apribili; eventuali verifiche mancanti restano dichiarate.

Non sono risultati osservati o token misurati: è una traccia di accettazione futura. Nel primo rilascio non occorrono grafici, un'altra barra laterale o un pannello da cockpit.

### 5.10 Rischi e cose da non fare

| Rischio | Evidenza o origine | Scelta da evitare / difesa proposta |
|---|---|---|
| Etichetta Piano che non impedisce modifiche | Hermes: vincolo nel prompt; eccezioni/configurazioni di altri prodotti in §3 | Non affidare la barriera al testo di sistema. Applicare il limite prima di ogni invocazione e provarlo anche con accesso pieno. |
| Pianificazione interminabile | Segnalazione Claude Code #91901; raccomandazione Cline sui compiti banali | Non imporre domande o molte fasi per ogni richiesta. Mostrare consumi, consentire una bozza breve e proporre di procedere quando il piano è sufficiente. |
| Approvazione implicita o ereditata | Transizioni Cascade; configurazione Aider; modalità non interattiva Gemini | Non interpretare un chiarimento o la riapertura come via libera. Stessa politica per UI, API, ripresa e automazioni. |
| Stato sbagliato dopo interruzione o tra finestre | Segnalazioni Cline distinte per data e superficie | Non conservare il modo solo in una variabile del browser. Identità di sessione, revisioni e decisioni durevoli. |
| Piano scritto ma pulsanti non funzionanti | Limite del registro Cursor | Non avere due autorità per testo e stato. Importazione esplicita e identità unica. |
| Piano apparentemente permanente che scompare | Memoria di sessione Copilot; regole di conservazione Gemini | Mostrare conservazione e salvare il piano nel deposito di prodotto appropriato. |
| Costo nascosto del secondo modello | Omissione `usagePlanner` nel percorso TALOS ispezionato | Non mostrare il solo costo dell'editor. Rendicontare tutte le fasi e il contesto riprocessato. |
| Piano troppo prescrittivo o duplicazione del codice | Inferenza progettuale, non bug attribuito | Non scrivere tutta l'implementazione prima di validare il problema; consentire deviazioni interne motivate. |
| «Verificato» senza requisito soddisfatto | Rischio del nostro futuro disegno | Non equiparare checkbox, exit code o parere di un secondo modello a copertura completa. Conservare «ignoto» e verifica umana. |
| Istruzioni malevole in piano/file/web | Confine di sicurezza del progetto | Il piano è contenuto non fidato; non può cambiare politiche, ottenere capacità o autoapprovarsi. |
| Piano obsoleto e modifiche concorrenti dell'owner | Workspace condiviso | Ricontrollare solo i presupposti pertinenti; mai cancellare cambi altrui per ristabilire il piano. Fermare il passo in conflitto. |
| Troppi modelli e sottoagenti | Costo seriale e perdita di contesto osservabili nei disegni a delega | Nessuna «plan review» multipla predefinita. Secondo parere esplicito sui casi difficili, con costo e prove della sua utilità. |
| Confusione con Ricerca approfondita o regressione mobile | Confini esistenti di TALOS | Nessun cambio ai flussi della ricerca per implementare L10; contratto del kernel compatibile e prova della controparte mobile. |

## 6. Decisione upstream: riusare i contratti, mantenere la responsabilità TALOS

La ricerca degli standard precede questo disegno. Non occorre introdurre un altro runtime agente per ottenere una scheda piano.

| Fonte primaria / pin esatto | Decisione | Motivo e cancello futuro |
|---|---|---|
| [ACP, Agent Plan, protocollo v1](https://agentclientprotocol.com/protocol/v1/agent-plan); repository `agentclientprotocol/agent-client-protocol`, commit [`bcb9d7ea13adc0b47e906c82f3d692d495a6fa34`](https://github.com/agentclientprotocol/agent-client-protocol/tree/bcb9d7ea13adc0b47e906c82f3d692d495a6fa34), 12/09/2026 | **Adattare come riferimento**, senza installare ACP in L10 | `session/update` trasporta passi, priorità e stato; ogni aggiornamento sostituisce l'intero elenco. Il nostro registro deve invece preservare identità, versioni e prove. Un futuro adattatore potrà esportare una vista ACP, senza far perdere la storia. |
| [AG-UI, stato](https://docs.ag-ui.com/concepts/state); repository `ag-ui-protocol/ag-ui`, commit [`747933694b05676203da7d5bb8d8e50432e59b75`](https://github.com/ag-ui-protocol/ag-ui/tree/747933694b05676203da7d5bb8d8e50432e59b75), 12/09/2026 | **Adattare dietro l'adattatore AVM già presente** | Snapshot/delta sono adatti ad aggiornare la vista. Conservare `stateDelta` e il formato corrente di `src/agui-events.mjs`; verificare la corrispondenza, senza cambiare silenziosamente maiuscole o nomi del contratto già consumato. Non imporre una nuova connessione per il piano. |
| [JSON Schema draft 2020-12](https://json-schema.org/draft/2020-12); `zod` **4.5.4**, già fissato in `package.json` | **Adottare direttamente la validazione esistente** e pubblicare il contratto AVM `talos.chat-plan.v1` | Schema versionato, rifiuto dei valori malformati, fixture di conformità. Nessun parser a regex per interpretare una decisione o distinguere oggetti e liste. Nessuna nuova dipendenza necessaria nel primo lotto. |
| Hermes Agent, commit e MIT in §3.1 | **Adattare i principi osservati; non integrare un secondo esecutore** | Comando rapido, chiarimenti e piano portabile sono utili; il motore non sostituisce la proprietà di stato e politiche TALOS. Nessun codice copiato in questo lotto. Se si copiasse codice in seguito, conservarne licenza, provenienza e test sul pin. |
| Roo Code, commit in §3.7; progetto Apache-2.0 | **Rifiutare come nuova dipendenza runtime** | La chiusura dichiarata impedisce di sceglierlo come componente mantenuto per L10. La scomposizione resta un riferimento di disegno. |
| Altri runtime e workflow di §3 | **Rifiutare l'adozione integrale per questa fetta** | Risolvono l'interazione nel proprio prodotto, non il collegamento nativo fra chat, permessi, Note, Attività e kernel di TALOS. Non è un rifiuto di librerie mantenute quando serviranno davvero: qui duplicare l'esecutore allargherebbe il confine senza colmare il requisito. |

**Lacuna precisa:** ACP descrive l'avanzamento; AG-UI il trasporto dello stato; JSON Schema la forma dei dati. Nessuno dei tre, nelle parti ispezionate, definisce l'intero consenso versionato con prove per requisito e riuso senza autorizzazioni pregresse. È questa relazione di dominio, non un nuovo protocollo di rete o un nuovo ciclo agente, che rimane AVM-owned. I pin di repository identificano fotografie consultabili: non sono dipendenze installate né conformance già eseguita. Prima di eventuale redistribuzione vanno riesaminati licenza e avvisi di ciascun pacchetto effettivamente adottato.

## 7. Piano di lavoro per l'implementazione — ledger preventivo

**Nessuna riga seguente è stata implementata.** Il ledger nomina file e simboli della futura fetta desktop, con ordine RED→GREEN. Non autorizza lavori mobili o Laravel non ispezionati. Nessuna cancellazione di file, nuova dipendenza, migrazione SQL o modifica dei manifest è prevista. Se l'ispezione del lotto esecutivo invalida un percorso, il ledger va emendato con il motivo prima di toccare il prodotto.

### 7.1 Decisioni di confine prima della prima modifica

1. **Stato di prodotto:** il checkout ispezionato usa registro e servizi Node locali; AGENTS assegna invece lo stato di prodotto al control-plane Laravel. Serve una decisione esplicita sull'adattatore desktop: il registro locale può essere la persistenza della sessione desktop in questa fetta, oppure deve proiettare uno stato canonico Laravel? La seconda scelta richiede lettura e ledger dei file Laravel reali prima dell'implementazione; qui non invento percorsi o migrazioni. Il validator resta stateless in entrambi i casi.
2. **Kernel condiviso:** `scripts/kernel-controlla.mjs` dichiara una seconda copia nel worktree mobile dell'owner, usata come fonte. Occorre un handoff con percorso e impronta della fonte autorizzata. Lo script esce con successo anche se la fonte manca: quel risultato non basta a certificare parità. Nessuna copia automatica e nessuna modifica mobile compresa nel presente elenco.
3. **Compatibilità del vecchio planner:** proposta: nuova modalità esplicita per nuove sessioni; riprese storiche conservano il comportamento registrato. `modelloPlanner` rimane compatibile come selezione del modello; una sessione storica non viene convertita silenziosamente in un flusso bloccante. La migrazione volontaria mostra la differenza. L'owner deve scegliere se e quando ritirare il pre-loop automatico, con test dedicati.

Responsabilità future: **Codex** implementa backend, contratto, kernel e revisione architetturale/sicurezza; **Fable** possiede frontend e prove UI nell'elenco seguente, dopo handoff al confine API; **Kimi** non riceve file in questo lotto. Non sono stati avviati subagenti. Nessuno implementa contemporaneamente un file posseduto da un'altra corsia. Build complete, installazioni, suite complete e porte restano operazioni a singolo esecutore coordinate da Codex.

### 7.2 Contratto proposto e simboli da mantenere stabili

Schema pubblico proposto **`talos.chat-plan.v1`**: `id`, `sessionId`, `workspaceId`, `revision`, `contentHash`, `status`, `objective`, `constraints`, `requirements`, `steps`, `sources`, `assumptions`, `questions`, `approval`, `usageByPhase`, `verification`, `createdAt`, `updatedAt`. Ogni passo conserva `id`, `requirementIds`, `dependsOn`, `files`, `expectedOutcome`, `checks`, `status`, `runIds`, `evidenceIds`. Le operazioni file sono `create/modify/delete`; i percorsi sono relativi al workspace e validati contro traversal e collegamenti che escono dal perimetro.

Stati del piano: `draft`, `awaiting_decision`, `approved`, `executing`, `paused`, `needs_revision`, `verifying`, `verified`, `partial`, `cancelled`. Stati passo: `pending`, `in_progress`, `verifying`, `verified`, `blocked`, `needs_revision`, `cancelled`. Nessun «verified» deciso dal solo testo del modello. Le prove sono tipizzate, identificano esecutore, comando/azione, risultato, versione e artefatti osservati; una prova umana indica chi l'ha fornita. Il rifiuto e l'ignoto sono valori previsti, non errori da nascondere.

Schema delle decisioni **`talos.chat-plan-decision.v1`**: azione discriminata, revisione attesa, chiave di idempotenza, ambito richiesto e messaggio umano di origine se presente. L'identità della persona proviene dalla sessione autenticata, mai da un campo fidato inviato dal modello. Modifica, approvazione, pausa e ripresa sono transizioni validate. Un'approvazione obsoleta restituisce conflitto leggibile; un input malformato restituisce errore di validazione, non TypeError/500.

API desktop candidata: `GET /api/v1/sessions/:id/plan`, `POST /api/v1/sessions/:id/plan` per creare la bozza, `PATCH /api/v1/sessions/:id/plan` per una revisione, `POST /api/v1/sessions/:id/plan/decisions` per decisioni validate. Nessuna modifica agli endpoint di ricerca. Gli aggiornamenti della vista transitano nel flusso di eventi esistente. Se la decisione Laravel cambia l'autorità dello stato, queste rotte diventano adattatori e il ledger viene esteso prima di implementare la persistenza.

Compatibilità da preservare: `talosLavora`, `avviaSessione`, `createSessionRegistry`, `createHttpApp`, `API_SCHEMA`, `stateDelta`, `runFinished`, `approvalRequested`, `approvalResolved`, `eventoPerUsage`; campi esistenti `modelloPlanner`, `usage`, `usagePlanner`, `messaggiFinali`, `permessiPerAttrezzo`. Il nuovo parametro opzionale `modalitaLavoro` non altera le chiamate storiche che lo omettono. L'esecuzione di un piano già approvato non deve rilanciare il vecchio pre-loop. Lo zero del consumo non sostituisce una misura assente.

### 7.3 File e ordine esatto della fetta proposta

**C** = creare; **M** = modificare. I test sono parte dell'ownership della stessa riga. Le funzioni non pubbliche preesistenti possono restare private; ogni nuovo simbolo pubblico proposto è nominato qui. Nessuna classe pubblica nuova.

| Ordine / responsabile | File esatti | Simboli e modifica prevista | RED e uscita GREEN |
|---|---|---|---|
| 1 · Codex · forma e transizioni | C `contracts/chat-plan-v1.schema.json`; C `src/chat-plan-contract.mjs`; C `src/chat-plan-state.mjs`; C `tests/chat-plan-contract.test.mjs`; C `tests/chat-plan-state.test.mjs`; C `tests/fixtures/chat-plan-v1.json` | Schemi `ChatPlanV1Schema`, `PlanDecisionV1Schema`; funzioni `normalizzaPiano`, `validaDecisionePiano`, `riduciStatoPiano`, `verificaApprovazionePiano`, `proiettaAttivitaPiano`. Fixture ACP→stato AVM e delta della vista incluse nel JSON di prova; schema JSON e Zod devono concordare. | R01, R03, R04: modulo/contratto mancante, revisione accettata indebitamente o transizione invalida. GREEN: G1. Nessuna API di esecuzione prima di questo cancello. |
| 2 · Codex · persistenza e API | C `src/chat-plan-service.mjs`; M `src/session-registry.mjs`; M `src/http-app.mjs`; M `src/agui-events.mjs`; C `tests/chat-plan-service.test.mjs`; C `tests/http-routes-chat-plan.test.mjs`; M `tests/session-registry.test.mjs`; M `tests/agui-events.test.mjs` | `creaServizioPiani` restituisce `crea`, `leggi`, `aggiorna`, `approva`, `eseguiPasso`, `pausa`, `riprendi`, `riusa`; integra `createSessionRegistry` e i metodi stabili `avvia`, `aggiornaImpostazioni`; aggiunge `leggiPiano` e `decidiPiano` al registro. `createHttpApp` e `metodiAmmessiPerRotta` espongono le rotte. Nuova `eventoPerPiano` usa `stateDelta`, senza rompere il trasporto attuale. | R03–R05, R09: reload perde decisioni, duplicazione del comando o consenso da altra sessione. GREEN: G2. Append durevole e proiezioni ripetibili prima del renderer. |
| 3 · Codex · planner reale e costi | M `src/kernel/talosHarness.mjs`; M `src/kernel/talosHarness.test.mjs`; M `src/agent-service.mjs`; M `tests/agent-service.test.mjs` | `talosLavora` riceve `modalitaLavoro`, `pianoApprovato` e callback opzionale `onPiano`; applica il limite di capacità prima degli attrezzi, inoltra contesto e consumo per fase. `avviaSessione` ed `esitoInEventoFinale` preservano il consumo del planner. `premessaDellaScrittura` resta nel suo perimetro. Nessun cambio implicito ai permessi. | R02, R06–R08, R14: scrittura pre-consenso, esito parziale che avvia l'editor nel nuovo modo, consumo perso, regressione senza planner. GREEN: G3 e handoff del kernel completato. |
| 4 · Codex · verifica del piano | C `src/kernel/verificaPiano.mjs`; C `src/kernel/verificaPiano.test.mjs` | `validaProvaPasso`, `verificaPiano`: collegano requisiti/prove/versioni e producono esito completo, parziale o ignoto. La riga 3 integra questi simboli in `talosLavora`; nessun altro file implicito. | R10–R11: prove mancanti o vecchie promosse a riuscita; vincolo negativo ignorato. GREEN: G4 più nuovo passaggio G3 per l'integrazione. |
| 5 · Codex · Note e Attività | M `src/notes-store.mjs`; M `src/tasks-store.mjs`; M `tests/notes-store.test.mjs`; M `tests/tasks-store.test.mjs`; M `tests/http-routes-note-attivita-memoria.test.mjs` | Metadati opzionali `pianoId`, `pianoRevisione`, `passoId` dove applicabili; aggiornare `formaPubblicaNota`, `formaPubblicaAttivita`; preservare `elencaNote`, `leggiNota`, `creaNota`, `aggiornaNota`, `eliminaNota`, `elencaAttivita`, `leggiAttivita`, `creaAttivita`, `aggiornaAttivita`, `completaAttivita`, `eliminaAttivita`. Il servizio della riga 2 mantiene le proiezioni, senza creare una seconda autorità. | R12: copia divergente o riuso con vecchio consenso; regressioni su note/attività ordinarie. GREEN: G5. |
| 6 · Fable · chat e navigazione | C `frontend/src/components/piano.js`; M `frontend/src/legacy/app.js`; M `frontend/src/components/inspector.js`; M `frontend/src/components/scorciatoie.js`; M `frontend/mockup/talos-mockup.html`; C `frontend/tests/unit/piano.test.mjs`; M `frontend/tests/unit/avvio-sessione.test.mjs`; M `frontend/tests/unit/inspector.test.mjs`; M `frontend/tests/unit/scorciatoie.test.mjs` | Nuove `creaPiano`, `aggiornaPiano`, `creaDomandePiano`, `montaModalitaPiano`. Integrare `avviaSessionePendente`, `startCustomSession`, `righeGiri`, `aggiornaInspector`, `SCORCIATOIE`, `riconosci`, `montaScorciatoie`. Usare la grammatica di `creaApprovazione` senza modificarne il consenso per attrezzo. Nuovo modo nella modale/composer e ancore nel medesimo indice. | R03, R05, R13–R14: pulsante obsoleto, decisione ambigua, focus catturato, modalità persa. GREEN: G6. Nessuna azione finta se l'API non è pronta. |
| 7 · Fable · proiezioni e rendiconto | M `frontend/src/components/note.js`; M `frontend/src/components/attivita.js`; M `frontend/src/components/consumo-sessione.js`; M `frontend/src/components/costi-consumo.js`; M `frontend/tests/unit/note.test.mjs`; M `frontend/tests/unit/attivita.test.mjs`; M `frontend/tests/unit/consumo-sessione.test.mjs` | Integrare `montaNote`, `creaTaskRow`, `aggiornaPaginaAttivita`; estendere `sommaUsage`, `usageDellaSessione`, `esecuzioniDellaSessione`, `consumoPerGiorno`, `consumoPerModello`, `riepilogoConsumo`, `aggiornaCosti` per fasi senza doppio conteggio. Collegamenti al piano e costi misurati. Nessun nuovo simbolo pubblico necessario. | R07, R12: totale editor soltanto, cache duplicata, Note/Attività scollegate. GREEN: G6 e riconciliazione con il servizio. |
| 8 · Codex + handoff UI Fable · prova umana reale | C `frontend/tests/browser/chat-plan-reale.spec.mjs`; C `frontend/tests/fixtures/chat-plan-conversazioni.json` | Nessun simbolo pubblico. Scenari realistici dal composer, con modello/attrezzi reali, stato persistente, prove e log. Fable possiede i due file; Codex coordina l'ambiente e la singola esecuzione. | R01–R15, G7 e benchmark §8. Non basta un test con risposte preconfezionate. |

La persistenza proposta riusa `src/session-store.mjs` con `registraRiga({ cartellaStore, sessionId, record, durable: true })` e lettura del registro: il file non è previsto in modifica, salvo nuova evidenza che richieda un emendamento. `frontend/src/components/conversazione.js` è riferimento di composizione, non una modifica implicita. Le viste devono essere derivate dal registro, con recupero idempotente se l'aggiornamento di Note/Attività si interrompe.

### 7.4 Scenari permanenti del ledger

| Scenario | Falla da riprodurre in RED / comportamento da caratterizzare | Evidenza richiesta |
|---|---|---|
| **L10-R01 · Piano senza struttura** | Un testo libero o JSON di forma errata viene accettato come piano eseguibile. | Validazione rifiuta l'input; la bozza resta leggibile e non eseguibile. Oggetti/liste non vengono confusi. |
| **L10-R02 · Scrittura prima dell'approvazione** | Attrezzo mutante, shell, plugin o azione esterna passa in Piano, anche con accesso pieno/override. | Nessuna invocazione mutante; file invariati e richiesta negata nella traccia. Prova con il modello che tenta realmente l'azione. |
| **L10-R03 · Approvazione della versione sbagliata** | Due finestre, modifica simultanea, doppio clic o retry autorizzano un contenuto diverso. | Conflitto sulle revisioni; un solo avvio; piano e consenso corrispondono all'impronta visibile. |
| **L10-R04 · Ripresa senza autorità** | Crash/reload/fork eredita approvazione o duplica un passo. | Decisione durevole, attività ripristinate; fork/riuso tornano in bozza. Azioni incerte non vengono ripetute ciecamente. |
| **L10-R05 · Chiarimento scambiato per consenso** | «Sì» risponde a una domanda, testo citato o file contiene «approvo». | Nessun avvio. Una successiva istruzione umana esplicita nell'ambito corretto avvia senza chiedere due volte. |
| **L10-R06 · Piano incompleto autoeseguito** | Nel nuovo modo l'esaurimento del planner avvia l'editor come nel vecchio pre-loop. | «Bozza incompleta», ragione e consumo; nessuna esecuzione. Il test storico resta valido per il percorso storico. |
| **L10-R07 · Consumo planner invisibile** | Evento finale perde `usagePlanner`, callback e finale duplicano token, cache contata due volte. | Somma delle fasi uguale alle misure del fornitore/adattatore; assenza di misura rappresentata come ignota. |
| **L10-R08 · Contesto perso al passaggio** | Planner ignora contesto selezionato o modello editor riparte senza piano approvato. | Stessa selezione autorizzata e versione consegnata; niente nuova esplorazione obbligatoria senza motivo. |
| **L10-R09 · Deviazione nascosta** | File fuori elenco, nuova destinazione esterna o costo oltre il limite proseguono senza decisione. | Differenza e impatto visibili; fermo prima dell'azione fuori ambito. Cambi interni innocui non richiedono conferme inutili. |
| **L10-R10 · Verificato senza prova** | Test fallito, assente, riferito a file vecchi o solo dichiarato dal modello dà verde. | Esito parziale/ignoto con prova mancante nominata; nessuna promozione al completamento. |
| **L10-R11 · Requisito scomparso** | Revisione rimuove un criterio o viola un vincolo negativo già approvato. | Differenza di requisiti esplicita; nuova decisione per la rinuncia, regressione nominata e test permanente. |
| **L10-R12 · Riuso e viste divergenti** | Note, Attività e chat mostrano versioni diverse; modifica manuale di un'attività produce falsa verifica. | Un'unica origine, recupero dopo errore di proiezione, esportazione/reimportazione validata e senza consenso ereditato. |
| **L10-R13 · Tastiera e schermo piccolo** | Shift+Tab sottrae navigazione, modale perde focus, piano illeggibile su viewport stretto. | Percorso completo da tastiera, lettore di schermo, desktop e mobile; nessuna animazione necessaria con reduced-motion. |
| **L10-R14 · Compatibilità delle sessioni** | Senza planner cambia il numero di chiamate; una ripresa rilancia il planner; Piano modifica i quattro permessi. | Caratterizzazione prima/dopo dei percorsi storici, nessun cambiamento non autorizzato delle preferenze. |
| **L10-R15 · Dall'italiano alla prova reale** | La UI sembra funzionare con fixture ma si rompe su refuso, URL naturale, follow-up o reload. | Conversazione reale in italiano dal composer, attrezzi e backend reali, verifica finale e consumo attribuito. Nessun dato della ricerca dell'owner coinvolto. |

R06 e R07 derivano da limiti concreti del codice attuale; non sono correzioni già realizzate. Gli altri sono scenari preventivi o caratterizzazioni informate dalla ricerca. Ogni ulteriore regressione scoperta nel lotto esecutivo va aggiunta con nome proprio prima di proseguire.

### 7.5 Comandi GREEN e cancelli di chiusura — futuri, non eseguiti

I comandi seguenti sono il piano di verifica di un futuro lotto autorizzato. In L10 non sono stati eseguiti test o build. Per ogni riga: prima scrivere il RED specifico, osservare il fallimento previsto, poi implementare e lanciare il GREEN. Un errore di ambiente non vale come RED del comportamento.

| Cancello | Comando e directory | Cosa deve provare |
|---|---|---|
| **G1** | In `harness-ui`: `rtk proxy node --test tests/chat-plan-contract.test.mjs tests/chat-plan-state.test.mjs` | Forma, transizioni, fixture e consenso. Un aggiornamento ACP con `completed` non può creare da solo una prova né promuovere un passo AVM a `verified`. |
| **G2** | In `harness-ui`: `rtk proxy node --test tests/chat-plan-service.test.mjs tests/http-routes-chat-plan.test.mjs tests/session-registry.test.mjs tests/agui-events.test.mjs` | API reali su stato temporaneo, idempotenza, autorizzazione, ripristino, eventi compatibili. |
| **G3** | In `harness-ui`: `rtk proxy node --test src/kernel/talosHarness.test.mjs tests/agent-service.test.mjs` | Pre-loop storico, nuovo modo, tool policy, contesto, modelli e tutti i consumi. |
| **G4** | In `harness-ui`: `rtk proxy node --test src/kernel/verificaPiano.test.mjs` | Prove tipizzate, versioni, esiti falliti/ignoti e copertura dei vincoli. |
| **G5** | In `harness-ui`: `rtk proxy node --test tests/notes-store.test.mjs tests/tasks-store.test.mjs tests/http-routes-note-attivita-memoria.test.mjs` | Proiezioni e compatibilità delle sezioni già esistenti. |
| **G6** | In `harness-ui`: `rtk proxy npm --prefix frontend run test:unit`, poi `rtk proxy npm --prefix frontend run test:componenti` | Componenti, navigazione, costi, stati negativi. Suite componenti solo dopo conferma dell'isolamento del suo ambiente. |
| **G7** | In `harness-ui/frontend`: `rtk proxy node scripts/run-browser-tests.mjs --config=playwright.config.mjs chat-plan-reale.spec.mjs` | Composer→backend→modello→attrezzi→prove, reload e riuso. Configurare nel test viewport desktop e mobile e reduced-motion. Necessita credenziali e budget per le chiamate reali. |
| **Regressioni complete della fetta** | In `harness-ui`: `rtk proxy npm run verify:all`; aggiungere G4 perché il nuovo file kernel non rientra automaticamente nello script corrente | Suite backend, shell desktop, kernel e frontend. Eseguire una volta per chiusura dopo i GREEN, con l'ambiente di test verificato e un solo esecutore. |
| **Build e consegna UI** | In `harness-ui`: `rtk proxy npm run build:ui`, poi `rtk proxy npm run verify:ui` | Artefatto frontend e manifest coerenti con il mockup aggiornato. Nessuna build in questo lotto. |
| **Parità kernel** | In `harness-ui`: `rtk proxy node scripts/kernel-controlla.mjs --fonte <percorso-esatto-concordato>` | Fonte realmente presente e impronta corrispondente, oppure differenza documentata e risolta prima della consegna. Il segnaposto non è un percorso autorizzato o un comando da lanciare così. |

**Isolamento obbligatorio delle prove future.** Il `frontend/playwright.config.mjs` letto usa normalmente porta **4176**, store temporaneo e `reuseExistingServer: false`, ma permette override con `TALOS_HARNESS_UI_BASE_URL` e `TALOS_HARNESS_UI_TEST_PORT` (righe 35–83). Prima di G7 o suite complete occorre verificare che nessun override punti alla 4174 e che la porta di test sia assegnata al singolo esecutore. Non riusare uno store dell'owner. Una porta occupata blocca quella prova, non autorizza a fermare il relativo processo. Non eseguire `npm run aggiorna`: il suo script riguarda proprio la 4174. Questo rapporto non ha avviato neppure la 4176.

Regressioni da includere, anche se non modificate: `tests/http-routes-sessions.test.mjs`, `tests/session-store.test.mjs`, `tests/session-store-append-concorrenti.test.mjs`, `tests/giri-senza-tetto.test.mjs`, `tests/kernel-loop-locale-e-stop.test.mjs`, `tests/full-access-policy.test.mjs`; prova reale già esistente `frontend/tests/browser/real-qwen-conversation.spec.mjs`. Non ne dichiaro gli esiti senza esecuzione fresca. I controlli PHP/Laravel/validator diventano necessari solo se un ledger successivo ne include file reali; non sostituiscono i controlli di questa fetta Node/desktop.

Il controllo trasversale normalmente previsto da AGENTS con git non è stato eseguito: il divieto esplicito dell'owner prevale in L10. Per questo documento si verifica direttamente struttura e contenuto, senza comandi git. Il futuro lotto adotterà i controlli consentiti dalle istruzioni allora attive.

### 7.6 Cancello upstream reale, prova visibile e rollback

**Upstream reale:** validare le fixture con la versione Zod fissata, esercitare provider/SDK già integrati con un modello reale e confrontare il consumo con gli eventi ricevuti. Usare il trasporto di eventi reale nell'E2E, non una risposta assemblata nel browser. Non essendoci un runtime concorrente adottato, non si spaccia una fixture di Hermes per integrazione con Hermes. Se una fetta successiva adotta ACP o altro SDK, dovrà aggiungere il suo componente reale al cancello sul pin scelto.

**Prova umana richiesta:** registrazione della conversazione italiana, versione approvata, richiesta di modifica, una deviazione controllata, pausa, reload, ripresa, scheda finale, Note/Attività e consumo. Nel pacchetto di prova distinguere attesa della persona, latenza del modello e tempo degli attrezzi. Una schermata da sola non prova persistenza o mancata esecuzione anticipata.

**Rollback futuro:** disabilitare l'ingresso nel nuovo modo per nuove sessioni con una configurazione di rilascio; conservare i piani e le decisioni già registrate in lettura. Fermare nuovi passi e indicare quelli rimasti incerti. Il rollback non deve trasformare una bozza in avvio automatico del vecchio planner. Ripristinare l'artefatto di rilascio precedente tramite la procedura concordata, senza revert del lavoro dell'owner o cancellazioni di registri. Nessun rollback di prodotto è necessario in L10, perché è stato scritto soltanto questo rapporto.

La configurazione di rilascio citata non è un campo già implementato: se si sceglie un interruttore persistente o distribuito, il file che lo possiede deve essere aggiunto al ledger prima della modifica. Per una prima attivazione locale può bastare l'assenza del nuovo `modalitaLavoro` nelle richieste, senza nuovi file di configurazione.

## 8. Come dimostrare «batterli tutti» senza una classifica inventata

**Hermes Agent va provato per primo**, sul pin dichiarato o su una release stabilizzata esplicitamente. Seguono i riferimenti per artefatto, semplicità e specifica già individuati, poi gli altri concorrenti attivi dove account e versioni lo consentono. Roo resta un confronto storico; non ha senso promettere un confronto con un servizio chiuso.

Servono due confronti distinti. Il primo misura **usabilità di prodotto**: stessi incarichi, persone, criteri di riuscita e condizioni documentate, mantenendo i modelli effettivamente offerti e dichiarando le differenze. Il secondo cerca un effetto **dell'orchestrazione**: stesso prompt, modello, contesto, attrezzi, evaluator e condizioni di cache quando controllabili. Dove il modello è nascosto o obbligatoriamente diverso, non si attribuisce la differenza al solo plan mode.

La batteria deve includere modifica banale, bug con causa da cercare, cambiamento in più file, vincolo di compatibilità, decisione ambigua, fonte esterna con URL naturale, refuso, richiesta di sola pianificazione, interruzione, reload, piano obsoleto, seconda finestra, test fallito e criterio non verificabile automaticamente. Le ripetizioni e la numerosità vengono fissate prima della raccolta in base al budget autorizzato; non si scelgono a posteriori soltanto i casi riusciti.

| Misura | Definizione operativa | Quando autorizza una rivendicazione |
|---|---|---|
| Violazioni del piano | Azioni mutanti prima del consenso / sessioni in Piano | Nessuna violazione osservata nella batteria e test avversariali superati; pubblicare numero e limiti del campione, non «impossibile in assoluto». |
| Costo per risultato accettato | Somma reale di piano, revisioni, esecuzione e verifica divisa per incarichi accettati | Inferiore a Hermes a qualità non inferiore, con raw log e prezzi datati; il solo prezzo del planner non basta. |
| Tempo fino al piano utile | Dal primo invio al piano che la persona può approvare; attesa umana separata | Mediana e p90 migliori a parità di copertura dei requisiti. Nessuna stima in ore prima dei dati. |
| Carico umano | Domande evitabili, modifiche manuali, conferme duplicate, tempo per trovare il prossimo passo | Meno interventi senza perdere decisioni necessarie. |
| Fedeltà all'ambito | Cambi fuori elenco/criteri, deviazioni non dichiarate, consensi obsoleti | Assenza di errori di autorizzazione nella batteria; ogni scostamento ha causa e prova. |
| Riuscita verificata | Requisiti accettati con prove valide / requisiti concordati | Copertura maggiore senza aumentare falsi «Verificato»; review indipendente dei casi contestati. |
| Recupero | Passi ripetuti, prove perse e azioni incerte dopo interruzione/reload | Recupero corretto senza modificare lo stato dell'owner. |
| Qualità della stima | Copertura reale dell'intervallo previsto ed errore su token/giri | Stime calibrate e campione esposto; se i dati non bastano resta «non disponibile». |

Per qualunque affermazione «AVM migliora il modello» serve anche **AVM ON contro AVM OFF**, con identici prompt, modello, contesto, evaluator e log grezzi, come richiede AGENTS. Una differenza fra due modelli o due interfacce non prova tale effetto.

Il pacchetto di evidenza conserva versioni/pin, impostazioni, prompt, contesto selezionato, log delle chiamate, decisioni, tentativi falliti, costi e artefatti. Chi valuta il risultato deve poter ignorare il nome del prodotto quando possibile. L10 definisce questo protocollo; non ha acquistato crediti, eseguito benchmark o prodotto risultati numerici.

## 9. Cosa non ho verificato e limiti del rapporto

- Non ho eseguito TALOS né i concorrenti, aperto account a pagamento, consumato modelli o misurato token/tempi reali. Non ho verificato visivamente la chat in un browser: il mockup e i collegamenti del frontend sono stati letti nel codice.
- Non ho avviato test, build, server, installazioni, git, commit o operazioni sulla ricerca dell'owner. Le suite citate nella fotografia TALOS sono state lette; quelle nel ledger sono future.
- Non ho dimostrato che tutti i fornitori locali/diretti usino identicamente il planner. L'inoltro dei parametri non basta, soprattutto per il percorso runtime locale distinto.
- Non ho auditato ogni politica, attrezzo e integrazione MCP dei concorrenti. Dove la documentazione dichiara una modalità protetta ne riporto il contratto e le eccezioni note, non una certificazione di sicurezza. Per Hermes ho ispezionato il comando e i relativi componenti, non provato una fuga dalla modalità in esecuzione.
- Non ho accertato tutte le possibilità di approvazione versionata, editor o verifica finale quando segnate ND. Per OpenHands l'annuncio beta non basta a stabilire lo stato esatto su ogni offerta corrente; per Amp un selettore di intensità non dimostra né esclude un workflow aggiuntivo tramite plugin.
- Non ho riprodotto le issue. Le chiusure sono distinte dai difetti aperti; non vengono usate come prova di un guasto ancora presente. Non ho misurato la popolarità: «Cline è il più citato» non viene assunto come dato.
- Non ho verificato la disponibilità di tutte le funzioni per ogni piano commerciale, regione o rollout; le superfici IDE, CLI, desktop e cloud restano distinte. Le pagine correnti possono cambiare dopo il 12 settembre: i link con commit fissano il codice, le pagine web senza pin no.
- Non ho derivato tariffe per piano dalle quote commerciali: token, crediti, ACU e minuti di esecuzione non sono unità intercambiabili. Nessuna promessa di costo minimo o durata. I prezzi letti sono riferimenti da riconfermare prima di un acquisto o benchmark.
- Non ho ampliato il significato del cancello semantico attuale. La verifica dei requisiti è lavoro futuro; un giudizio LLM non diventa una prova deterministica.
- Non ho ispezionato i file Laravel o la fonte mobile per redigere un ledger di modifiche in quelle corsie. Quella decisione è preliminare all'implementazione. Non ho verificato il ramo con git.

Un'ulteriore cautela sui commenti locali: affermazioni storiche sul fatto che Hermes non abbia pianificazione o Aider usi un solo modello non devono diventare fatti del rapporto. Il codice e le fonti primarie correnti di §3 dimostrano capacità più articolate. Anche il limite storico di 24 giri nei commenti TALOS non descrive il valore attuale.

### 9.1 Fotografia dei file chiave letti

Le impronte seguenti identificano i contenuti su cui è stata fatta l'analisi locale, senza usare git. Se il lavoro concorrente dell'owner cambia questi file, le righe del rapporto vanno riallineate prima di implementare.

| File relativo a `harness-ui` | SHA-256 della lettura |
|---|---|
| `src/session-registry.mjs` | `fe553182c1ad2fe6c459f898fef87c917f82cc470ba2ddf6fefe2586f77d8e39` |
| `src/agent-service.mjs` | `23abd626566f0e6cc43e0efc44de9f4fff3dd53d7b232491d5ae048bcd22502c` |
| `src/http-app.mjs` | `c5498d0fb14ef91ad244ad9d66d1192824758e48723284747d80fb9f37dfef6d` |
| `src/kernel/talosHarness.mjs` | `349cdfc6af933bc18a60c7d42bcf9ccd7e85f7de407a53f1658fc4fb4b8413e8` |
| `src/kernel/talosHarness.test.mjs` | `799deea35ba0fb8cd802af3ddfb5f494b3bf9ed7ed9f5c7b415d30a0757254dc` |
| `frontend/src/legacy/app.js` | `f1b3c315cc45be472e8738c093ef2a5f7e92c952a8f13254384c6815bd7d3645` |
| `frontend/mockup/talos-mockup.html` | `71d2480b88499efbecabeb895e80423229436398ea065d6dbde34909195bab3e` |

### 9.2 Verifica del documento

Controllo completato sul rapporto: 14 schede numerate, Hermes per primo, due matrici con tutte le funzioni richieste e 66 indirizzi esterni distinti. Le tabelle hanno colonne coerenti; i percorsi segnati M nel ledger esistono e quelli segnati C non risultano già presenti. Le sette impronte della fotografia locale corrispondono ancora ai file riletti al controllo finale. Questa verifica riguarda la completezza e la coerenza del documento, non dimostra il comportamento futuro del prodotto o dei concorrenti.

## 10. Cosa deve fare l'owner · Cosa faccio io · Cosa rimane

**Cosa deve fare l'owner.** Scegliere se adottare le tre priorità proposte: (1) modalità Piano con blocco effettivo e consenso sulla versione; (2) passi collegati a prove, fino alla verifica finale; (3) costo distinto per fase e riuso nelle sezioni esistenti. Per avviare un lotto esecutivo, decidere autorità dello stato desktop/Laravel, handoff del kernel e migrazione del planner storico. Poi assegnare modello/account/budget alle prove reali; nessuna ora o spesa viene presunta da questo rapporto.

**Cosa faccio io.** In L10 ho prodotto questa ricerca con Hermes per primo, letto l'implementazione esistente, distinto limiti dimostrati e ignoti e scritto il ledger. Nel successivo lotto autorizzato implementerò la corsia Codex partendo dai RED e coordinerò l'handoff UI a Fable e i cancelli a singolo esecutore. L10 si chiude con il rapporto, senza avviare quel lavoro.

**Cosa rimane.** Approvare il disegno, sciogliere i confini, implementare, verificare il percorso umano reale e misurare il confronto con Hermes e gli altri riferimenti, compreso AVM ON/OFF. Solo quelle prove potranno sostenere la frase «TALOS li batte». Oggi abbiamo una proposta verificabile e una lista precisa di ciò che manca, non una superiorità già dimostrata.
