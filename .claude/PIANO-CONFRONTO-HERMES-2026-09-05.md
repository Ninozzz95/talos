# PIANO — TALOS contro Hermes, componente per componente (mandato dell'owner, 05/09/2026)

> Owner: «appena tutto il mockup viene tradotto nell'applicazione… ogni singolo componente
> funzionante, e bene o meglio rispetto a Hermes. Almeno Hermes, poi Claude e Codex. Script veloci,
> automatizzati, estremamente precisi. Ogni singola funzione pareggiata e migliorata. Ispezioni
> visive, ricognizione mirata e tecnica dei punti deboli e di forza di Hermes per ogni componente,
> annotati nel taccuino, per un miglioramento totale.»
>
> Quando parte: dopo il cutover della Fase 3 (mockup interamente vivo). Chi: Claude, con Astra
> in parallelo sulle schermate sue. Prima ricognizione: Hermes v0.21.0 «Pantheon» (31/08/2026):
> desktop con browser in-app guidato dall'agente, registro delle connessioni multi-gateway, MCP
> con controlli di salute, picker dei modelli, billing; Review pane con ambiti Uncommitted · Branch
> · Last turn (fonti: hermes-agent.nousresearch.com/docs/user-guide/desktop, github releases
> v2026.8.31, changelog gradually.ai — letti il 05/09/2026).

## 1. Cosa si confronta: i 106 blocchi del mockup (`data-c`), uno per uno

Ogni riga del taccuino ha sette colonne: **blocco** · **cosa fa TALOS** (dal vivo) · **cosa fa
Hermes** (nel codice del clone `%LOCALAPPDATA%\Temp\talos-competitor\hermes-agent` E nella sua UI) ·
**forza di Hermes** · **debolezza di Hermes** · **il nostro +1** · **esito** (PASS = pari o
meglio, misurato; FAIL = sotto, con il numero).

Gruppi (nell'ordine di lavoro, dalla chat verso le pagine):
1. Chat: Turn, TurnSpine, Message, ActivityBundle, ToolRow, ToolFailure, ApprovalCard, DiffView,
   SignedReceipt, SystemNote, TouchedFiles, ArtifactCard, attesa, StatusStrip, MessageQueue,
   Composer (+ AttachButton, Chip, SendButton), StatusBar, EmptyState/SuggestionList.
2. Navigazione: Sidebar, Brand, NavGroup/NavItem, SessionList/SessionItem, WorkspaceFooter,
   Topbar/Tabs, CommandPalette, NotificationPanel/Toast, Resizer (colonne e dialoghi).
3. Sessione: ReviewScreen (ReviewFileTabs, DiffView), TerminalScreen/TerminalPane,
   BrowserScreen (BrowserViewport, BrowserHistory), Inspector (InspectorCard, TurnIndex,
   ProcessRow, FileTree/FileTreeRow, ContextMenu), BranchTree.
4. Pagine: BoardScreen/DataTable/FilterChips, CapabilityScreen (ToolList, DetailPanel,
   PendingList, ScopeNote, ToolPermissionList), MemoryScreen/MemoryList/MemoryMeter,
   TasksScreen/TaskList, LibraryScreen, ResearchScreen/ReportList, ForgeScreen/ForgeList/CodeBlock,
   AutomationsScreen/AutomationRow, SettingsScreen (SettingsNav, SettingRow, Switch, Select,
   Range, Field), DoctorScreen (SeverityCount, CheckCard), ModelLabScreen (ModelPicker,
   DownloadQueue/DownloadRow, ModelTrial), IntroDialog/Steps/FolderPicker/ChoiceCards, Dialog.

## 2. Gli script: veloci, automatici, precisi, riproducibili

Cartella `harness-ui/frontend/scripts/confronto/` (da creare al via):
- `hermes.mjs` — apre TALOS (4175, store copiato, MAI il 4174) e Hermes (desktop via CDP
  `--remote-debugging-port`, o la dashboard web su 127.0.0.1:9119: il comando esatto di avvio va
  accertato — Astra l'ha già aperto per i suoi screenshot; si chiede a lui nel prossimo prompt) e
  per ogni riga del taccuino esegue la STESSA azione con gli STESSI dati.
- Misure per riga: tempo alla prima risposta, gesti (clic/tasti) per arrivare al risultato,
  errori di pagina, tastiera (Tab/frecce/Esc/Invio, anello di fuoco), contrasto e nomi
  accessibili (axe), larghezze 1440/1280/1024, tema chiaro e scuro.
- Screenshot AFFIANCATI (TALOS | Hermes) per riga, salvati in `artifacts/confronto/<blocco>/`;
  ogni coppia si GUARDA (regola del taccuino: anche fuori tema).
- Esito PASS/FAIL per funzione in `artifacts/confronto/esiti.json` + una tabella nel ledger;
  nessun giudizio senza numero o screenshot.
- Costo: modelli flash a chiave da entrambe le parti, letto dal credito del fornitore; stima
  dichiarata prima di ogni campagna.

## 3. Ricognizione tecnica di Hermes (prima degli script)

Per ogni gruppo: lettura nel codice del clone (componenti, stati, scorciatoie, persistenza,
errori), poi la UI dal vivo. Si annotano: cosa Hermes fa e noi no (parità da fare), cosa fa peggio
(il nostro +1), cosa fa in modo che non vogliamo (decisione dell'owner, non copia). Le 18 PROPOSTE
del dossier del 03/09 si rileggono alla luce di v0.21.

## 4. Dopo Hermes

Stesso metodo su Claude Code desktop e Codex desktop (browser in-app condiviso, computer use):
righe aggiunte alle stesse tabelle, stesse misure.

## 5. Uscita

Ogni FAIL diventa una riga di lavoro (parità + miglioramento) con cancello, screenshot e prova
dal vivo, come nella Fase 2. Il confronto si ripete a ogni consegna finché ogni riga è PASS.
