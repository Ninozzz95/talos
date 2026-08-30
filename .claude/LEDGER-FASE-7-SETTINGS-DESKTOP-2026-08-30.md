# Ledger Fase 7 — porting impostazioni mobile applicabili al desktop

Data: 2026-08-30  
Ownership: Harness Desktop soltanto. `mobile/` e i repository sibling sono
stati letti soltanto come riferimento; nessun file mobile è stato modificato.

## Correzione rispetto al piano precedente

Il confronto competitivo non è chiuso con il baseline della Fase 0. Questa
fase aggiunge un confronto per ogni gruppo di impostazioni e rende il porting
mobile → desktop una slice esplicita. La schermata desktop attuale in
`mobile/public/harness-ui/index.html` espone soltanto una card Aspetto, il
toggle `#reducedMotionToggle`, una card Agentico e una card Control plane;
non esiste un archivio di preferenze desktop né un pannello equivalente alle
impostazioni mobile.

## Inventario mobile verificato (sola lettura)

Fonte primaria locale: `mobile/src/components/talos/settings/settingsTabs.ts`,
`mobile/src/stores/settings.ts` e i pannelli Vue elencati sotto.

| Gruppo/tab mobile | Contratto e controlli osservati | Decisione desktop |
|---|---|---|
| Models | provider keys/profili/default chat model; `composer_model`; `composer_defaults`; `prompt_enhancer`; Model Lab (`manual_models`, override, timeout, probe, sort, alias) | **PORTA** selezione modello, default, enhancer, ordinamento/alias; **ADATTA** probe/runtime locale e segreti al processo desktop; mai inventare modelli o chiavi |
| AI Defaults | utility/research model mode, vision; tone; Library context policy/enabled; autosave generated | **PORTA** come preferenze effettive del composer/agent; stato non configurato deve restare esplicito |
| Agent Tools | `tools`, `tools_chosen`, `agent_tools`, `tool_authorizations`; read/write/outbound; autorizzazioni per tool; `plan_scope` | **PORTA** integralmente, collegato ai contratti e agli eventi reali desktop; mai solo decorativo |
| Search | source (`tavily`, `brave`, `searxng`, `custom`), endpoint, chiavi sicure | **ADATTA** alla configurazione server desktop; chiavi fuori da `localStorage`, messaggi onesti se manca il servizio |
| Browser | `hmi_mode`, presentation, suggest URLs, untrusted evidence | **ADATTA** alla superficie Browser desktop e al confine trust; nessun browser finto dichiarato operativo |
| Appearance | tema/mode, renderer/quality/scene, background/interface motion, speed/intensity/glow/density/depth/trails/contrast/parallax, fps/dpr, pause/data-saver; interface profile/easing/duration/stagger/categories; UI font scale; chat bubble scale/message style; composer shape/plus; immersive header; streaming animation | **PORTA** tutti i controlli applicabili; separare sempre scala interfaccia da scala testo chat; adattare data-saver al desktop; token e motion engine esistenti restano unica fonte |
| Voice | voce system/personal, profilo, rate/pitch, lingua dettatura, installazione modello/preview | **ADATTA** soltanto se il servizio TTS desktop reale è disponibile; altrimenti voce visibile come gated, mai promessa |
| Language | modalità lingua/localizzazione | **PORTA** se il bundle desktop ha catalogo i18n; in caso contrario mostrare stato non disponibile, non un selettore morto |
| Privacy | accesso Library (`allow/ask/deny`), memory write, image consent, policy; consenso probe engine | **PORTA** i tre stati e i gate; **ADATTA** probe al runtime desktop; non indebolire fail-closed |
| Backup | export/import cifrato, passphrase, include keys opt-in, merge/replace plan | **ADATTA** al filesystem desktop e ai secret store; include keys resta opt-in e il piano deve essere reale |
| Account/onboarding | display name, intro version/outcome, setup dismissed, replay; app lock + biometric | **PORTA** profilo/intro; **ADATTA** lock a credenziali/OS desktop; biometria Android non è portabile 1:1 |
| Mobile-only | `launcher_icon_follows_theme`, `ponte_sempre_acceso`, Android `screen_secure`/bridge lifecycle | **ESCLUDI** dal desktop o sostituisci con un contratto desktop esplicito separato; non portare etichette che promettono un effetto Android |
| Unavailable mobile tabs | Integrations, Email, Reminders, System sono gated nel mobile | **PORTA SOLO IL GATE** con motivazione reale; nessun controllo o finto connettore desktop |

## Mapping di persistenza proposto

Il bundle desktop è una pagina statica servita dal server locale e non ha un
settings API. La via minima è un documento versionato in `localStorage`, con
namespace `talos.harness.desktop.settings.v1`, parser fail-closed e migrazione
esplicita; le chiavi/API secret non entrano mai nel documento. Se il main agent
decide che le preferenze debbano seguire più workstation, va aggiunto un
contratto server separato prima di implementare la persistenza: non si deve
confondere una preferenza locale con sincronizzazione account.

### File tree

Il file tree non va persistito come contenuto: voci, dimensioni, stato Git e
contenuti dei file restano sempre letti dal server tramite gli endpoint
`/api/v1/sessions/:id/tree*`. Nel documento locale si possono ricordare solo
preferenze di presentazione, con chiave separata e scope per sessione:

```json
{
  "version": 1,
  "sessions": {
    "<session-id>": {
      "expandedPaths": ["src", "src/components"],
      "filter": "composer"
    }
  }
}
```

`treeCache` resta una cache di runtime e viene svuotata quando la sessione o
il livello cambiano; `expandedPaths` e `filter` sono solo ausili di UX. Mai
salvare contenuto dei file, stato Git o percorsi di una sessione eliminata;
si fa pruning dell’entry quando arriva la cancellazione della sessione. Se il
filtro o le cartelle aperte non sono richiesti, è più corretto non salvarli
(YAGNI).

## Ricerca primaria e confronto competitivo (30/08/2026)

| Gruppo | Hermes | Competitor diretto | Decisione TALOS |
|---|---|---|---|
| Configurazione e profili | Config centralizzata in `~/.hermes/config.yaml`, segreti in `.env`, precedenza CLI → config → env → default; profili e terminal font sono modificabili da Settings | VS Code distingue User e Workspace settings e documenta precedenza e `settings.json` | adottare scope dichiarato **Desktop locale** + eventuale **Workspace** solo quando esiste un contratto; separare segreti e preferenze; mostrare origine/precedenza |
| Modello, effort, routing | Hermes espone modello/provider e override per delegation; il modello può ereditare il parent | OpenAI documenta `reasoning.effort`, `reasoning.mode` e la necessità di confrontare configurazioni su task rappresentativi | adottare selettore coerente con composer e un’unica sorgente per default; non duplicare effort in card scollegate |
| Permessi e sicurezza | Hermes ha smart approvals, deny rules e sandbox/container; configurazione resta esplicita | Claude Code documenta allow/deny per tool, `defaultMode`, `plan`, `acceptEdits`, `bypassPermissions`; VS Code Workspace Trust disabilita agenti in Restricted Mode | portare grammatica `allow/ask/deny`, piano e autorizzazioni per-tool; mostrare sempre stato effettivo e motivo del gate |
| Regole/memoria | Hermes mantiene SOUL/memories e impostazioni di contesto | Cursor separa Project Rules, User Rules e Memories con approvazione per salvataggi automatici e blocco in Privacy Mode | portare solo preferenze Library/Memory già contrattualizzate; non creare “memorie” desktop finte |
| Appearance/motion | Hermes espone Appearance, terminal font, display e streaming settings | VS Code offre Appearance, UI visibility, Zen mode e impostazioni persistenti globali/workspace | portare tema, font UI/chat, motion e streaming in un pannello reale; mantenere target desktop leggibili e tokenizzati |
| Browser/search | Hermes documenta backend web search, browser e blocklist | Claude Code/VS Code documentano trust per domini/MCP/network; Cursor documenta Privacy Mode e controllo dati | portare source/endpoint/policy solo dietro servizi reali e fail-closed; niente endpoint o chiavi inventate |
| Backup/account/onboarding | Hermes separa auth.json, `.env`, sessions e onboarding con latch versionati | Cursor espone Privacy Mode e dashboard/account controls; VS Code supporta User/Workspace scope e reset | portare export/restore e intro versionata; segreti sempre fuori dal backup predefinito; reset dichiarato |

Fonti primarie consultate:

- Hermes Configuration: https://hermes-agent.nousresearch.com/docs/user-guide/configuration
- Hermes Delegation: https://hermes-agent.nousresearch.com/docs/user-guide/features/delegation
- OpenAI Model guidance: https://developers.openai.com/api/docs/guides/latest-model
- VS Code settings: https://code.visualstudio.com/docs/configure/settings
- VS Code Workspace Trust: https://code.visualstudio.com/docs/editing/workspaces/workspace-trust
- Claude Code CLI/permissions: https://docs.anthropic.com/en/docs/claude-code/cli-usage e https://docs.anthropic.com/ko/docs/claude-code/iam
- Cursor Rules: https://docs.cursor.com/context/rules
- Cursor Privacy: https://docs.cursor.com/account/privacy

## File ledger per implementazione (da eseguire dopo approvazione del contratto)

File da modificare:

1. `mobile/public/harness-ui/index.html` — sostituire la sola card Settings
   con sezioni e controlli per i gruppi portati; mantenere `#reducedMotionToggle`
   come alias compatibile o rimuoverlo solo insieme al test aggiornato.
2. `mobile/public/harness-ui/app.js` — store desktop versionato, parser
   fail-closed, applicazione token/motion/font/chat/composer, wiring dei
   controlli e stati gated; nessuna chiave segreta persistita.
3. `mobile/public/harness-ui/styles.css` — layout Settings responsive, stati
   active/disabled/gated, transizioni tramite token già esistenti e regole
   reduced-motion.
4. `harness-ui/tests/*` — test unitari del parser/store e dei comportamenti
   osservabili; file esatto da scegliere dopo aver individuato il runner e la
   convenzione esistenti.
5. `harness-ui/scripts/qa-visual-pipeline.mjs` — scenario Settings desktop e
   laptop, inclusi apertura di ogni gruppo, modifica, reload, reset e stato
   gated.
6. `.claude/QA-VISIVA-HARNESS-2026-08-30.md` — screenshot completi e
   taccuino competitor per ogni gruppo.

File da creare soltanto se il parser non può restare nel bundle senza
duplicazione:

- `mobile/public/harness-ui/settings-store.js` — modulo minimo per schema,
  migrazione e persistenza; preferire però `app.js` se l'estrazione non riduce
  complessità (ponytail).

File da NON modificare: tutto sotto `mobile/src/`, `mobile/android/`,
`harness-ui/src/`, `control-plane/`, `core/`, sibling `AVM-harness` e
TALOS-BANCO, salvo nuova autorizzazione esplicita e nuovo ledger.

## RED/GREEN e gate visivi richiesti

- RED parser: valore sconosciuto/malformato ricade sui default sicuri e non
  attiva tool, invio o rete.
- RED persistence: un cambio in ogni gruppo sopravvive a reload; reset torna
  al default; secret-like fields non sono presenti in `localStorage`.
- RED applicability: impostazioni Android-only non compaiono come controlli
  desktop attivi; tab gated dichiara il motivo.
- GREEN behavior: tema/motion/font/chat scale/composer, model/effort,
  permessi, policy Library/Memory e browser/search cambiano il comportamento
  reale già esistente oppure mostrano gate onesto.
- GREEN regressioni: compattazione, follow-up, delega/evidenza, inspector,
  sidebar e tutte le superfici già verificate restano invariati.
- Comandi: `npm test` da `harness-ui`; `git diff --check`; QA pipeline su
  1440×900 e 1024×800. Per ogni screenshot: apertura Settings, ogni gruppo,
  modifica e reload, controllo dell’intero schermo e console/network.
- Mobile/Pad: N/A per ownership desktop; `mobile/` resta lettura di confronto.

## Stato analisi iniziale (storico)

L’analisi iniziale aveva lasciato il codice invariato e aveva fissato i confini
di portabilità. Le slice 7b e 7a successive hanno poi implementato,
rispettivamente, il file tree e Appearance/Typography secondo questo ledger.

## Fase 7b — file tree all’avvio, comportamento VS Code (approvata 30/08/2026)

### Decisione dell’owner

Quando l’owner sceglie un progetto allowlistato e apre una nuova sessione,
Codice deve mostrare immediatamente il tree reale del workspace, senza
aspettare il primo messaggio. Il tree resta quello già esistente: un livello
alla volta, cartelle richiudibili, tastiera/ARIA, menu e drag/drop soltanto
dopo la creazione della sessione reale. La preview è sola lettura.

### Contratto minimo

- `GET /api/v1/projects/:projectId/tree?percorso=` risolve `projectId` soltanto
  contro `config.cartelleProgetto`; non accetta path assoluti dal browser.
- `session-registry.anteprimaAlbero(projectId, percorso)` riusa
  `leggiAlberoWorkspaceFn`, quindi conserva la validazione di path esistente.
- `mobile/public/harness-ui/app.js` usa la stessa funzione di caricamento per
  preview e sessione: cambia solo l’URL e blocca le azioni mutative finché non
  c’è `realSession.id`.
- La selezione “Full access” resta con placeholder onesto fino all’avvio della
  sessione; non si aggiunge un endpoint che registri un percorso arbitrario
  nell’URL.

### Ledger di esecuzione

File da modificare, senza wildcard:

1. `harness-ui/src/session-registry.mjs` — metodo pubblico
   `anteprimaAlbero(projectId, percorso)`.
2. `harness-ui/src/http-app.mjs` — rotta GET project-tree e decoding sicuro
   dell’id.
3. `mobile/public/harness-ui/app.js` — stato preview, URL tree condiviso,
   inizializzazione al termine di `avviaSessionePendente`, gating read-only.
4. `harness-ui/tests/session-registry.test.mjs` — RED/GREEN per allowlist,
   percorso e progetto inesistente.
5. `harness-ui/tests/http-routes-sessions.test.mjs` — RED/GREEN per envelope,
   query, id malformato e assenza registry.
6. `.claude/QA-VISIVA-HARNESS-2026-08-30.md` — prova browser completa dopo
   l’implementazione.

Test RED obbligatori:

- progetto allowlistato: root e sottocartella passano al reader e tornano le
  voci ordinate;
- progetto sconosciuto: 404 `NOT_FOUND`;
- `percorso=..`: 400 `QUERY_INVALID`;
- preview senza registry: 404;
- nuova sessione: root visibile prima del primo messaggio;
- preview: nessun menu mutativo, drag/drop o apertura file via session endpoint;
- prima sessione reale: il tree passa all’endpoint sessione e le azioni
  tornano disponibili.

GREEN e regressioni: `npm test`, `git diff --check`, test browser sulle
risoluzioni 1440×900 e 1024×800, reload con stato visuale persistito, errore
di lettura e progetto vuoto. Rollback: rimuovere la rotta preview e il solo
ramo preview client; l’endpoint sessione e il tree reale restano invariati.

### Estensione — persistenza per workspace e auto-reveal (30/08/2026)

File e simboli toccati:

1. `mobile/public/harness-ui/app.js` — `treeWorkspaceKey`, `treeUiRestored`,
   namespace `talos.harness.desktop.settings.v1`, funzioni
   `chiaveWorkspaceAlbero`, `leggiImpostazioniAlbero`,
   `salvaImpostazioniAlbero`, `ripristinaImpostazioniAlbero`; salvataggio su
   apertura/chiusura cartella e filtro; `rivelaERivelaRigaAlbero` per
   selezione, focus e scroll della riga prima del viewer; export di
   `apriFileAlbero` solo come test seam. Il documento locale contiene solo
   preferenze UI, con cap 200 percorsi/1024 caratteri e filtro 256.
2. `mobile/tests/unit/harness/harnessUiRealSession.test.ts` —
   `FILE-TREE-PREVIEW-02` (persistenza/ripristino per `project:p1`) e
   `FILE-TREE-REVEAL-01` (selezione/focus/scroll e contenuto viewer), oltre
   all’helper `mockFetchAlbero(..., projectId)`.

RED/GREEN: entrambi i test fallavano prima dell’implementazione (nessun
namespace localStorage e nessun auto-reveal) e ora passano. La cache dei file
resta esclusivamente runtime; nessun contenuto, stato Git, segreto o percorso
arbitrario viene scritto nel browser. Rollback indipendente: rimuovere il
namespace e i due hook UI lascia intatto l’endpoint e il tree reale.

## Fase 7a — Appearance/Typography locale (slice autorizzata 30/08/2026)

### Decisione esecutiva

Implementare soltanto i controlli che hanno già un effetto reale nel bundle:
riduzione del movimento, scala del testo dell’interfaccia e scala del testo
della chat. Il tema resta ereditato dai token TALOS attivi; non viene creato
un selettore di temi finto. La riduzione del movimento è un opt-in locale:
quando non è salvata, la media query `prefers-reduced-motion` continua a
governare il comportamento; quando è attiva, il runtime aggiunge
`body.reduce-motion`.

### Ricerca upstream e decisione

- MDN `prefers-reduced-motion` e `localStorage`: usare le API native,
  applicando la preferenza solo come override aggiuntivo e catturando gli
  errori di storage. Nessuna dipendenza.
- MDN `calc()`: moltiplicare i token tipografici CSS con la custom property
  locale `--talos-ui-font-scale`; il supporto è sufficiente per il browser
  target Chrome 151.
- VS Code: mantenere uno scope dichiarato locale al desktop e separare in
  seguito user/workspace solo quando esisterà un contratto server reale.
- Hermes Desktop: font e streaming sono impostazioni persistenti condivise
  dal prodotto; TALOS adotta la persistenza locale solo per questa pagina
  statica, senza fingere sincronizzazione con il core.

### Ledger a livello di codice

File esatti da modificare:

1. `mobile/public/harness-ui/index.html` — markup della card Aspetto; select
   `#uiFontScaleSelect`, select `#chatFontScaleSelect`, mantenimento del
   checkbox compatibile `#reducedMotionToggle`.
2. `mobile/public/harness-ui/app.js` — costanti `DESKTOP_SETTINGS_KEY`,
   `DESKTOP_APPEARANCE_DEFAULTS`; funzioni `normalizzaAspettoDesktop`,
   `leggiImpostazioniDesktop`, `salvaImpostazioniDesktop`,
   `applicaAspettoDesktop`, `inizializzaAspettoDesktop`; wiring degli input.
   Il serializer ammette soltanto `version`, `appearance` e `workspaces`,
   quindi chiavi sconosciute o segreti non vengono copiati.
3. `mobile/public/harness-ui/styles.css` — token `--talos-ui-font-scale`,
   `--talos-chat-font-size`, regole di scala per i font dell’interfaccia e
   override della prosa chat indipendente; layout dei controlli.
4. `mobile/tests/unit/harness/harnessUiFrontend.test.ts` — test RED/GREEN
   `CODE-SETTINGS-APPEARANCE-HYDRATE-01`,
   `CODE-SETTINGS-APPEARANCE-PERSIST-01`,
   `CODE-SETTINGS-APPEARANCE-FAIL-CLOSED-01`.
5. `.claude/QA-VISIVA-HARNESS-2026-08-30.md` — screenshot completi Settings
   a 1440×900 e 1024×800, cambio valori, reload, reset e controllo di
   overflow/contrasto; annotazione del confronto VS Code/Hermes.

RED: con il markup e il runtime correnti i select non esistono, il valore
locale non viene idratato né persistito e le chiavi sconosciute restano nel
documento. GREEN: suite Harness, `git diff --check`, server locale e prova
browser sulle due risoluzioni; rollback rimuove solo il ramo appearance e
lascia intatta la persistenza del file tree.

### Esito della slice

RED riprodotto sui tre test dedicati; GREEN verificato con `174/174` test
Harness, `node --check` sugli script modificati e `git diff --check`. La
pipeline `qa-settings-appearance` ha prodotto quattro screenshot per
1440×900 e quattro per 1024×800, con modifica, scroll dei gruppi inferiori e
reload persistente; nessuna eccezione JS. La suite mobile completa ha invece
riportato 32 fallimenti già presenti e fuori perimetro (tooling Android
mancante, `node-pty` assente e fixture di ricerca mancanti); nessun fallimento
appartiene ai test Harness.
