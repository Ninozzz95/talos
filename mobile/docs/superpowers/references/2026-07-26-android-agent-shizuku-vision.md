# Android Agent con Shizuku — Potenzialità Massime, Limiti e Architettura Sicura

**Ambito:** Android, Shizuku, agenti AI, tool calling, automazione di sistema, MCP, computer use, coding agent e artifact  
**Obiettivo:** descrivere le massime capacità realistiche ottenibili integrando un agente AI con Shizuku e con tool locali e remoti.

---

## 1. Sintesi

Integrando un modello AI locale o cloud, un runtime agentico, Shizuku, MCP, automazione UI, accesso alle notifiche, MediaProjection, strumenti shell, browser automation, generazione file e ricerca web, un telefono Android può diventare un vero **agente operativo di sistema**.

Il ciclo completo sarebbe:

```text
osservare → comprendere → pianificare → chiedere autorizzazione
→ agire → verificare → correggere o annullare
```

La potenza non deriva dal singolo comando, ma dall'orchestrazione sicura di più strumenti.

---

## 2. Che cosa abilita Shizuku

Shizuku consente a un'app Android di usare API di sistema tramite Binder con privilegi superiori a quelli di un'app normale.

| Modalità | Identità | Capacità |
|---|---:|---|
| Avvio via ADB / Wireless Debugging | UID `2000` — `shell` | Ampio accesso amministrativo, inferiore a root |
| Avvio tramite root | UID `0` — `root` | Accesso più esteso, comunque soggetto a SELinux e policy di sistema |

Può esporre:

- API Binder di sistema;
- comandi shell;
- `UserService`;
- chiamate Java o native privilegiate;
- operazioni più efficienti della creazione ripetuta di processi shell.

Riferimenti:

- <https://shizuku.rikka.app/>
- <https://shizuku.rikka.app/guide/setup/>

---

## 3. Architettura generale

```text
Utente / Voce
  ↓
Modello AI locale o cloud
  ↓
Planner agentico
  ↓
Policy Engine
  ↓
Tool Registry / MCP Gateway
  ├── Shizuku System Tools
  ├── Package Manager
  ├── Settings Manager
  ├── UI Automation
  ├── Notification Listener
  ├── MediaProjection / Vision
  ├── Terminal / Termux
  ├── Web Research
  ├── File Generators
  └── Remote Services
  ↓
Verifica dello stato
  ↓
Audit e rollback
```

---

## 4. Potenzialità massime

### 4.1 Gestione delle applicazioni

L'agente potrebbe:

- elencare i package installati;
- leggere versione, UID, firma e percorso APK;
- installare, aggiornare e disinstallare APK;
- abilitare o disabilitare package, activity, service e receiver;
- eseguire force-stop;
- cancellare cache;
- cancellare dati previa conferma;
- avviare activity e inviare intent;
- verificare dipendenze e componenti;
- produrre inventari software e report di rischio.

### 4.2 Permessi, AppOps e privacy

Potrebbe:

- leggere permessi richiesti e concessi;
- revocare permessi runtime supportati;
- modificare alcune AppOps;
- individuare app con accessi anomali;
- proporre profili privacy reversibili;
- rilevare servizi e receiver invasivi;
- confrontare la situazione prima e dopo un aggiornamento.

Non tutti i permessi sono gestibili da `shell`: alcuni richiedono firma di sistema, Device Owner, consenso diretto o privilegi OEM.

### 4.3 Configurazione Android

Dove consentito, potrebbe leggere o modificare:

- `Settings.System`;
- `Settings.Secure`;
- `Settings.Global`;
- animazioni;
- timeout schermo;
- rotazione;
- modalità risparmio;
- restrizioni background;
- impostazioni sviluppatore;
- densità UI;
- configurazioni di input e rete esposte a shell.

Ogni modifica dovrebbe mostrare valore attuale, valore proposto, motivo, rischio e reversibilità.

### 4.4 Automazione UI

Combinando Shizuku con UI Automator, Accessibility Service, MediaProjection e un modello vision, l'agente potrebbe usare app prive di API.

Workflow:

1. apre l'app;
2. acquisisce schermata e albero accessibilità;
3. interpreta lo stato;
4. individua il controllo;
5. clicca o inserisce testo;
6. verifica la schermata risultante;
7. corregge in caso di errore.

Capacità:

- Home, Back e Recent;
- pannello notifiche;
- scroll e click;
- compilazione moduli;
- selezione voci;
- attraversamento wizard;
- test visuali;
- macro intelligenti.

Riferimenti:

- <https://developer.android.com/training/testing/other-components/ui-automator>
- <https://developer.android.com/reference/android/accessibilityservice/AccessibilityService>
- <https://developer.android.com/media/grow/media-projection>

### 4.5 Comprensione dello schermo

Con screenshot o MediaProjection autorizzati, un modello vision potrebbe:

- leggere testo visibile;
- identificare componenti UI;
- riconoscere errori e dialog;
- confrontare schermate prima/dopo;
- rilevare elementi mancanti;
- creare bug report;
- supportare test automatici e accessibilità.

Limiti:

- consenso MediaProjection;
- `FLAG_SECURE`;
- contenuti DRM;
- errori di interpretazione;
- UI dinamiche.

### 4.6 Notifiche

Con un Notification Listener autorizzato:

- classificazione;
- riassunto;
- raggruppamento;
- risposta alle notifiche compatibili;
- trasformazione in task;
- digest giornalieri;
- rilevamento spam;
- correlazione con calendario e messaggi.

Le notifiche sensibili dovrebbero essere elaborate localmente quando possibile e oscurate nei log.

### 4.7 Diagnostica di sistema

Tool utilizzabili:

- `dumpsys`;
- `logcat`;
- `cmd`;
- `pm`;
- `am`;
- `settings`;
- `appops`;
- `dumpsys batterystats`;
- `dumpsys meminfo`;
- `dumpsys cpuinfo`;
- `dumpsys activity`;
- `dumpsys package`;
- `dumpsys netstats`;
- `dumpsys connectivity`;
- `dumpsys alarm`;
- `dumpsys jobscheduler`.

L'agente potrebbe diagnosticare batteria, memory leak, crash, ANR, processi bloccati, wakelock, job, alarm, servizi e problemi di rete.

Riferimenti:

- <https://developer.android.com/tools/dumpsys>
- <https://developer.android.com/tools/logcat>

### 4.8 Ottimizzazione del dispositivo

Possibili attività:

- identificare app energivore;
- rilevare wake lock e job eccessivi;
- trovare servizi inutili;
- ottimizzare animazioni;
- analizzare storage;
- ripulire cache selettive;
- trovare duplicati;
- monitorare temperatura e throttling;
- confrontare metriche prima/dopo.

Le ottimizzazioni aggressive non dovrebbero essere automatiche, perché possono interrompere notifiche, sincronizzazioni e allarmi.

### 4.9 Terminale locale

Con Termux o runtime equivalente:

- Bash;
- Python;
- Node.js;
- Git;
- SSH;
- rsync;
- curl;
- ripgrep;
- jq;
- ffmpeg;
- compiler;
- language server;
- database locali;
- server web.

Shizuku aggiunge il livello privilegiato per installazione APK, gestione package, diagnostica e test sul dispositivo.

### 4.10 Coding agent completo

Il telefono potrebbe diventare una workstation agentica:

```text
Issue
  ↓
Analisi repository
  ↓
Piano
  ↓
Worktree isolato
  ↓
Modifica
  ↓
Test
  ↓
Build APK
  ↓
Installazione via Shizuku
  ↓
Test UI
  ↓
Logcat / crash
  ↓
Correzione
  ↓
Commit / Pull Request
```

Tool possibili:

- Git;
- ripgrep;
- Tree-sitter;
- LSP;
- Gradle;
- Shizuku;
- UI Automator;
- Logcat;
- MCP GitHub.

### 4.11 Gestione file

L'agente potrebbe:

- classificare e rinominare file;
- spostare e comprimere;
- estrarre archivi;
- trovare duplicati;
- sincronizzare con NAS e cloud;
- trasformare formati;
- estrarre testo;
- creare backup;
- cifrare archivi;
- produrre report di storage.

Shizuku non annulla Scoped Storage, Storage Access Framework, URI grants, sandbox delle app e SELinux.

### 4.12 Generazione documenti

Formati possibili:

- PDF;
- DOCX;
- XLSX;
- PPTX;
- CSV;
- Markdown;
- HTML;
- SVG;
- PNG.

Pipeline raccomandata:

```text
Generazione → Parsing → Rendering preview → Controllo qualità
→ Correzione → Esportazione
```

Tool OSS:

- `python-docx`;
- `openpyxl`;
- `python-pptx`;
- `WeasyPrint`;
- `pypdf`;
- `Pandoc`;
- `LibreOffice headless`;
- `Matplotlib`;
- `Plotly`;
- `Graphviz`.

### 4.13 Ricerca web e news

Il telefono potrebbe:

- cercare sul web;
- leggere e confrontare fonti;
- creare report citati;
- raggruppare articoli sullo stesso evento;
- distinguere data articolo e data evento;
- monitorare aggiornamenti;
- verificare comunicati ufficiali;
- creare knowledge base.

Stack OSS:

- SearXNG;
- Playwright;
- Trafilatura;
- RSS/Atom;
- GDELT;
- OpenSearch;
- vector store;
- citation engine custom.

### 4.14 Artifact e mini-app

Un artifact runtime locale potrebbe creare:

- dashboard;
- pagine HTML;
- form;
- diagrammi;
- report interattivi;
- mini-app;
- pannelli amministrativi;
- console MCP.

Requisiti:

- WebView isolata;
- CSP;
- iframe o sandbox equivalente;
- capability bridge limitato;
- versioning;
- export;
- audit;
- rollback;
- badge `prototype`.

### 4.15 MCP

MCP potrebbe collegare il telefono a:

- GitHub e GitLab;
- email e calendario;
- CRM;
- database;
- Home Assistant;
- NAS;
- cloud;
- CI/CD;
- issue tracker;
- sistemi aziendali.

Shizuku controlla il dispositivo locale; MCP estende l'agente verso sistemi remoti.

### 4.16 Routine agentiche

Routine possibili:

- backup su Wi-Fi domestico;
- digest notifiche serale;
- diagnostica batteria settimanale;
- installazione automatica build CI;
- monitoraggio crash;
- sincronizzazione file;
- modalità lavoro;
- controllo spazio;
- report privacy mensile.

### 4.17 Controllo multi-dispositivo

Il telefono potrebbe controllare:

- PC;
- server;
- NAS;
- router;
- Raspberry Pi;
- IoT;
- Home Assistant;
- cloud;
- Kubernetes;
- CI/CD.

Protocolli e tool:

- SSH;
- MCP;
- REST;
- WebSocket;
- MQTT;
- API cloud;
- API GitHub.

---

## 5. Esempio: diagnosi batteria autonoma

```text
Utente:
"Controlla perché il telefono si scarica velocemente
 e correggi solo i problemi sicuri."

Agente:
1. legge batterystats;
2. analizza wakelock, job e alarm;
3. confronta app installate recentemente;
4. individua le anomalie;
5. propone interventi;
6. chiede conferma;
7. applica solo modifiche reversibili;
8. pianifica una nuova misurazione;
9. produce report e rollback.
```

---

## 6. Differenza tra livelli di privilegio

| Livello | Potere | Limiti |
|---|---|---|
| App normale | Sandbox applicativa | Accesso ristretto |
| Shizuku via ADB | Identità `shell` | No root completo, limiti SELinux |
| Shizuku via root | Identità `root` | SELinux, Verified Boot e policy restano |
| Device Owner | Policy enterprise | Richiede provisioning |
| App di sistema firmata | Permessi signature | Richiede chiavi OEM |
| ROM/kernel modificati | Controllo massimo | Rischio e complessità elevati |

---

## 7. Cosa Shizuku non sblocca automaticamente

Shizuku non garantisce:

- accesso a `/data/data` di altre app;
- accesso alle chiavi hardware;
- bypass biometrico;
- bypass Play Integrity;
- bypass Verified Boot;
- accesso a contenuti DRM;
- modifica libera delle partizioni;
- microfono o camera senza consenso;
- permessi `signature`;
- bypass MDM;
- bypass SELinux;
- accesso alle credenziali delle app;
- intercettazione silenziosa di comunicazioni cifrate.

Riferimento SELinux:

- <https://source.android.com/docs/security/features/selinux>

---

## 8. Rischi principali

### Prompt injection

Siti, notifiche, documenti o app possono contenere istruzioni malevole. I contenuti letti non devono mai essere trattati come autorizzazioni operative.

### Azioni distruttive

Esempi:

- `pm clear`;
- disinstallazione;
- cancellazione file;
- modifica impostazioni critiche;
- disabilitazione package di sistema;
- reset;
- revoca permessi essenziali.

### Esfiltrazione

Possibili sorgenti:

- notifiche;
- clipboard;
- screenshot;
- documenti;
- log;
- email;
- token;
- file locali.

### Escalation

Un tool limitato non deve poter aggirare il policy engine tramite shell arbitraria.

---

## 9. Architettura di sicurezza

### 9.1 Livelli di rischio

| Livello | Descrizione | Esempi |
|---|---|---|
| `observe` | Solo lettura | batteria, package list |
| `draft` | Prepara senza applicare | script, modifica proposta |
| `safe-write` | Scrittura reversibile | rinomina file |
| `execute` | Esecuzione controllata | test, build |
| `external-write` | Azione verso terzi | email, API |
| `destructive` | Perdita o alterazione grave | clear data, uninstall |
| `root` | Privilegi massimi | modifica sistema |

### 9.2 Decisioni del policy engine

```text
allow
allow_once
allow_for_session
allow_with_preview
require_confirmation
require_biometric
deny
```

### 9.3 Tool tipizzati

Preferire:

```text
installPackage(apkUri)
setAnimationScale(value)
revokePermission(package, permission)
forceStopPackage(package)
```

Evitare:

```text
runShell("comando arbitrario")
```

La shell libera dovrebbe essere disabilitata di default, confinata, filtrata e tracciata.

### 9.4 Preview obbligatoria

```text
Azione: disinstallazione
Package: com.example.app
Dati eliminati: sì
Reversibile: no
Conseguenze: perdita dei dati locali
Motivo: richiesta esplicita dell'utente
```

### 9.5 Rollback

Possibili meccanismi:

- snapshot impostazioni;
- backup file;
- export permessi e AppOps;
- Git;
- worktree;
- script inverso;
- transaction log.

### 9.6 Audit

Registrare:

- timestamp;
- utente;
- modello;
- tool;
- input e output;
- permesso;
- conferma;
- stato;
- errore;
- rollback;
- provenienza dei dati.

Oscurare token, password, notifiche sensibili, PII e segreti.

---

## 10. Stack tecnico possibile

```text
Frontend Android        Kotlin + Jetpack Compose
Shizuku integration     Shizuku API + UserService
Agent runtime           Kotlin service / backend remoto
Tool protocol           MCP + JSON Schema
Task orchestration      Temporal / LangGraph / custom
Local shell             Termux / PTY executor
Repository search       ripgrep
Code intelligence       LSP
Structured editing      Tree-sitter + diff
UI automation           UI Automator + Accessibility
Screen understanding    MediaProjection + vision model
Web search              SearXNG
Web fetch               Playwright + Trafilatura
RAG                     Haystack/LlamaIndex + vector DB
Documents               python-docx/openpyxl/python-pptx
PDF                     WeasyPrint + pypdf
Artifacts               WebView sandbox + local hosting
Observability           OpenTelemetry
Storage                 SQLite/PostgreSQL/object storage
Secrets                 Android Keystore + short-lived tokens
```

---

## 11. Capability registry suggerito

```yaml
capability:
  id: android.package.install
  version: 1.0.0
  risk: external-write
  requires:
    - shizuku
    - package_manager
  reversible: false
  confirmation: required
  timeout_ms: 120000
```

---

## 12. Tool contract

```kotlin
interface AgentTool<I, O> {
    val id: String
    val version: String
    val risk: RiskLevel

    suspend fun preview(
        input: I,
        context: ToolContext
    ): ToolPreview

    suspend fun execute(
        input: I,
        context: ToolContext
    ): ToolResult<O>

    suspend fun rollback(
        result: ToolResult<O>,
        context: ToolContext
    ): RollbackResult?
}
```

---

## 13. Event model

```text
run.created
run.started
run.completed
run.failed
run.cancelled

task.created
task.started
task.blocked
task.completed

tool.requested
tool.authorized
tool.denied
tool.started
tool.progress
tool.completed
tool.failed
tool.cancelled

permission.requested
permission.granted
permission.denied

rollback.started
rollback.completed
rollback.failed
```

---

## 14. Livelli operativi consigliati

### Modalità Assistente

- sola lettura;
- suggerimenti;
- nessuna scrittura.

### Modalità Operatore

- azioni reversibili;
- conferme sensibili.

### Modalità Sviluppatore

- shell;
- Git;
- build;
- installazione APK;
- logcat.

### Modalità Amministratore

- AppOps;
- package manager;
- impostazioni di sistema.

### Modalità Root

- disabilitata per default;
- conferma biometrica;
- allowlist;
- audit completo.

---

## 15. Valutazione finale

### Con Shizuku via ADB

Il massimo realistico è un:

> **amministratore personale Android di livello `shell`**

Capace di gestire app, diagnosticare, automatizzare UI, eseguire shell, testare software, produrre documenti e orchestrare servizi esterni.

### Con Shizuku via root

Il telefono può diventare un:

> **agente autonomo general-purpose con controllo locale esteso**

Capace di amministrazione avanzata, coding agent, computer use, automazione multi-app, ricerca, artifact e orchestrazione cloud.

### Limite fondamentale

Il limite principale è la sicurezza. Un agente con shell, root, screenshot, notifiche, file, email, MCP e UI automation possiede un raggio d'azione enorme.

La progettazione deve quindi privilegiare:

- least privilege;
- conferme;
- tool tipizzati;
- audit;
- isolamento;
- rollback;
- trasparenza;
- separazione tra dati letti e istruzioni operative.

---

## 16. Conclusione

La massima potenzialità consiste nel creare un sistema che sappia:

```text
vedere il dispositivo
capire il contesto
scegliere il tool corretto
chiedere il permesso appropriato
eseguire in sicurezza
verificare il risultato
spiegare cosa è cambiato
annullare quando possibile
```

Shizuku è il ponte tra l'agente e Android.

MCP è il ponte tra l'agente e il mondo esterno.

Il policy engine è la componente che impedisce al sistema di diventare pericoloso.
