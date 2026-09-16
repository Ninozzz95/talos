# LEDGER — Fase 0: baseline desktop e protocollo competitivo

Data: 2026-08-30  
Lane: `C:\Users\Antonino\Desktop\projects\AVM-harness-desktop`  
Branch: `lane/harness-desktop`  
HEAD: `6527ffa6b935c5f7f14af8916ae2d15613ac8714`  
Stato worktree all'apertura: pulito  

## Scopo della fase

Questa fase fotografa lo stato reale prima dei prossimi fix desktop. Non
modifica codice prodotto, non modifica TALOS-BANCO e non chiude alcun debito
solo perché la suite è verde. Il confronto competitivo è ora obbligatorio per
ogni fase e per ogni fix: Hermes sempre, poi il competitor pertinente; gli
altri vengono marcati `N/A` con motivazione, mai omessi in silenzio.

## Regole vincolanti caricate

Fonte Claude letta per intero: `C:\Users\Antonino\.claude\projects\C--Users-Antonino-Desktop-projects-AVM\memory\`.
Le regole operative attive sono:

- ricerca web primaria e aggiornata prima di ogni modifica non banale;
- sorgente reale prima di README o ipotesi;
- RED prima del codice, GREEN dopo, prova anche al contrario;
- riproduzione del difetto prima di dichiararlo corretto;
- percorso completo gesto → componente → servizio → persistenza → risultato;
- ogni superficie toccata va usata tutta e guardata tutta;
- screenshot realmente ispezionati, non solo DOM o test Node;
- quattro viewport UI quando la superficie è responsive; tablet portrait è il
  riferimento principale e il dispositivo va ripristinato;
- ogni debito owner/finding viene registrato subito e il ledger segue il codice;
- nessuna funzionalità finta, nessun successo dichiarato senza evidenza;
- confini TALOS rispettati, nessuna dipendenza nuova non motivata;
- commit per fase quando autorizzati, push soltanto dopo autorizzazione fresca;
- testo pubblico in inglese; documenti interni e comunicazione con l'owner in
  italiano;
- ogni modifica desktop rilevante per UI/UX deve avere valutazione di mirror
  mobile.

## Inventario verificato

| Area | Evidenza reale |
|---|---|
| Sorgente backend | 43 file sotto `harness-ui/src/` |
| Test backend | 43 file sotto `harness-ui/tests/` |
| Frontend statico | 21 file sotto `mobile/public/harness-ui/` |
| Server | `http://127.0.0.1:4174/api/v1/health` → HTTP 200, `{"ok":true}` |
| Ultimo commit | `6527ffa6`: Files senza mockup + cartelle frequenti da cronologia reale |
| Worktree | pulito; branch locale allineato a `origin/lane/harness-desktop` |
| TALOS-BANCO | fuori dal prodotto desktop; Board usa sessioni proprie |
| QA precedente | 15/16 task live completati; appendice Voice deliberatamente esclusa |

File di stato letti:

- `.claude/QA-VISIVA-HARNESS-2026-08-30.md`
- `.claude/LEDGER-BOARD-SESSIONI-2026-08-30.md`
- `.claude/LEDGER-MOCKUP-FILES-TAB-CARTELLE-FREQUENTI-2026-08-30.md`
- `.claude/LEDGER-TABELLA-DI-MARCIA-DESKTOP-2026-08-30.md`
- `.claude/MEMORIA-REGOLE.md`
- `.claude/MEMORIA-LEZIONI.md`
- `CLAUDE.md`
- `harness-ui/README.md`
- `harness-ui/src/agent-service.mjs`
- `harness-ui/src/session-registry.mjs`
- `harness-ui/src/session-store.mjs`
- `harness-ui/src/http-app.mjs`
- `mobile/public/harness-ui/index.html`
- `mobile/public/harness-ui/app.js`
- `mobile/public/harness-ui/styles.css`

## Gate di test baseline

1. Da `C:\Users\Antonino\Desktop\projects\AVM-harness-desktop\harness-ui`:
   `node --test tests/*.test.mjs` → **960 pass, 0 fail**, 9,236 ms.
2. Dal comando documentato nel README, eseguito dalla radice:
   `node --test harness-ui/tests/*.test.mjs` → **959 pass, 1 fail**.
3. Il fallimento non è un bug del prodotto: `harness-ui/tests/harness-receipt-keypair.test.mjs:101`
   costruisce `src/harness-receipt-keypair.mjs` relativo alla directory
   corrente; dalla radice cerca quindi `AVM-harness-desktop/src/...`, mentre il
   file reale è `AVM-harness-desktop/harness-ui/src/...`.

Finding F0-TEST-PATH: il comando pubblico del README e il test non condividono
la stessa root. Non corretto in fase 0; diventa debito di tooling, con RED
dedicato prima del fix. Non altera il verdetto della suite lanciata dalla root
del package.

## Debiti prodotto ancora aperti dopo la QA

- **A — anti-fabbricazione troppo severo**: blocca anche una richiesta di
  feature legittima dopo insistenza dell'owner. Area: prompt/kernel/contratto;
  richiede ricerca e decisione tecnica separata.
- **H — follow-up dopo giri esauriti**: UX non esplicita; non classificato
  ancora come bug del codice.
- **J — delega dichiarata conclusa senza artefatto su disco**: tre deleghe con
  cartella corretta, nessun file/test nuovo osservato. Causa radice ancora
  aperta.
- **K — Compatta senza stato di lavoro**: `compactSession()` non disabilita né
  segnala il bottone durante l'operazione reale lunga.
- **Punto 3 “nessuna cartella”**: lacuna di prodotto, non bug letterale;
  proposta scratch workspace separato, non accesso implicito alla root.
- **F0-TEST-PATH**: comando README/test path incoerente, tooling.

L, M, B, C, D, E, F, G e I risultano già corretti e verificati nei ledger
precedenti; non vengono riaperti senza una nuova riproduzione.

## Ricerca competitiva di fase 0

Ricerca eseguita il 2026-08-30 su fonti primarie:

- [Hermes Web Dashboard](https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard)
- [Hermes Sessions](https://hermes-agent.nousresearch.com/docs/user-guide/sessions)
- [Hermes SECURITY.md](https://github.com/NousResearch/hermes-agent/blob/main/SECURITY.md)
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
- [pi usage](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/usage.md)
- [OpenAI Codex repository](https://github.com/openai/codex)

### Findings comparativi misurabili

| Competitor | Punto di forza osservato | Punto debole/rischio | Conseguenza per TALOS |
|---|---|---|---|
| Hermes | dashboard unica per sessioni, config, chiavi, skill, MCP, log, analytics e cron; sessioni con metadati, token e durata; resume, rename, export e delete | trust envelope locale ampio nel backend host; la ricchezza di configurazione può aumentare ambiguità | adottare visibilità e ciclo di vita completi, mantenendo allowlist e consenso TALOS; L3 = evidenza verificabile per ogni esito |
| DeepSeek Harness | composizione “everything is a plugin”, package boundaries espliciti, UI/host/client separati | developer preview e breaking changes dichiarati; plugin tree può spostare complessità fuori dal contratto | adottare modularità dietro registry tipizzato, non proliferazione di tool; L3 = plugin soggetto a policy, receipt e replay TALOS |
| pi-agent | sessioni JSONL con fork/tree/compact, editor e footer con token/cache/costo; streaming e controllo abort | interfaccia primaria CLI/TUI; non è una gestione desktop completa | adottare resume/tree/compact osservabili; L3 = ogni mutazione porta prova persistita e stato di recovery |
| Codex | direzione verso dashboard/session browser e app-server condiviso | il repository non basta a provare il comportamento dell'app chiusa | usare solo ciò che è verificabile; nessuna feature attribuita senza prova |
| Claude Code | riferimento di usabilità coding e session history | molte superfici sono proprietarie/non ispezionabili alla fonte | confronto su device/traffico quando serve, mai inferenze da marketing |
| Gemini/ChatGPT/Perplexity/Copilot | benchmark di esperienza finale e streaming | prodotti chiusi, impossibile citare assenze senza prova | usare come confronto empirico della stessa azione, quando la fase lo richiede |
| Jan/Chatbox/Msty/LibreChat/PocketPal/MLC/Ollama/llama.cpp | riferimenti BYOK/local-first e runtime locali | copertura agentica, memoria o UX non uniforme | confrontare solo la capability toccata; portare su TALOS il vantaggio senza perdere sicurezza |

## Scheda obbligatoria per ogni fase/fix successivo

Prima del codice:

1. problema riprodotto, percorso e punto di morte;
2. query web, fonti primarie, data e versione/commit upstream;
3. Hermes: comportamento, forza, debolezza, decisione adopt/adapt/reject;
4. competitor pertinenti: stesso confronto; non pertinente = `N/A` motivato;
5. proposta TALOS e livello L1/L2/L3; la fase deve puntare almeno a una riga
   L3 oppure dichiarare perché è solo manutenzione necessaria;
6. file esatti, simboli pubblici, RED, GREEN, regressioni, gate upstream,
   prova UI/E2E, percorso contrario, rollback;
7. mirror mobile sì/no e conseguenza.

Dopo il codice:

1. ripetere la riproduzione originale;
2. percorso completo avanti/indietro, reload, errore, annullamento e retry;
3. screenshot della superficie e ispezione completa dell'immagine;
4. aggiornare ledger e QA con esito osservato, commit e ciò che resta aperto;
5. solo dopo valutare commit; push separato e mai automatico.

## Ordine confermato delle prossime fasi

| Fase | Obiettivo | One-up TALOS richiesto |
|---|---|---|
| 1 | K: stato Compatta | stato reale, blocco doppio comando, errore/retry/annullamento; non solo spinner |
| 2 | label Settings stale | capability registry come fonte unica, non testi duplicati |
| 3 | H: limite giri | distinguere continua/nuova sessione/limite, senza riuso nascosto |
| 4 | J: delega | conclusa solo con artefatto/evidenza verificata e lineage padre-figlio |
| 5 | A: anti-fabbricazione | separare non supportato, chiarimento, rischio e richiesta confermata |
| 6 | sessione senza cartella | scratch confinato, tracciabile e ripulibile; mai root implicita |
| 7 | settings/tutorial/README | parità desktop-mobile con adattamenti dichiarati e benchmark reali |
| 8 | modelli locali desktop | porting completo delle ottimizzazioni mobile + scheduling desktop misurato |
| 9 | installer | installazione firmata, componenti opzionali, upgrade, rollback e verifica |

### Riconciliazione dopo la fase 2

La voce “label Settings stale” dell'ordine iniziale è stata riesaminata sul
server locale il 2026-08-30 con lo scenario read-only
`qa-batchfix-d-e-label-badge`: tutte le label false risultano già corrette.
La frase “Diff espansi di default e Tool activity compatta: non ancora
implementati” è stata confermata come capability realmente aperta, non come
testo stale. La fase 2 è quindi un audit/no-op documentato in
`LEDGER-FASE-2-SETTINGS-LABEL-AUDIT-2026-08-30.md`; non si apre lavoro di
codice senza una decisione owner sulle preferenze da implementare.

## Verdetto fase 0

**Baseline completata.** Il prodotto desktop è su una lane pulita, il server è
raggiungibile e la suite package-level è 960/960. Esiste un finding di tooling
nel comando README dalla root e restano aperti A/H/J/K più la lacuna “nessuna
cartella”. Nessun fix prodotto viene dichiarato chiuso in questa fase.

La fase 1 può iniziare solo con la scheda competitiva K compilata, RED prima
del codice e gate visuale desktop dopo il percorso reale di compattazione.
