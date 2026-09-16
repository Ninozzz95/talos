# Riallineamento della roadmap e proposta di esecuzione — 14/09/2026

## Perimetro e stato della decisione

L'owner autorizza l'aggiornamento accurato del piano e chiede un consiglio fra cinque
compiti per fase e agenti assegnati a fasi diverse. Questo documento aggiorna gli stati
documentali e presenta il metodo consigliato; non apre una fase implementativa.
Nessun test di prodotto è stato rilanciato per questa revisione documentale.

La tabella canonica è [TABELLA-FASI-COMPLETA-2026-09-13.md](TABELLA-FASI-COMPLETA-2026-09-13.md).
Le code conservano requisiti e storia; le loro vecchie intestazioni non sono uno stato corrente.
Il piano mobile citato dal prompt esiste in
C:/Users/Antonino/Desktop/projects/AVM/.claude/PIANO-DEBITI-E-IMPLEMENTAZIONI-2026-09-12.md,
non nella cartella desktop: la sua sezione D alimenta la Fase 11, il resto appartiene al mobile.

## Registro della modifica documentale, prima degli edit

File da creare: questo documento.
File da modificare, tutti sotto .claude/ del checkout AVM-harness-desktop:

1. TABELLA-FASI-COMPLETA-2026-09-13.md — stato corrente, correzioni puntuali e collocazione BC-52.
2. PROMPT-ASTRA-2026-09-14-DEBITI-FASI-E-CONSEGNA.md — avviso iniziale prevalente sui passaggi storici.
3. CODA-UNICA-DEBITI-2026-09-06.md — rinvio allo stato corrente e distinzione implementato/qualificato.
4. CODA-PROPOSTE-OWNER-2026-09-08.md — correzione delle proposte obsolete senza cancellare i requisiti.
5. TACCUINO.md — prove e rettifica della confusione fra i due repository.
6. MEMORIA-SETTEMBRE-2026.md — puntatore compatto al metodo e ai vincoli effettivi.

Nessun file eliminato; nessun simbolo pubblico, schema, migrazione o comportamento modificato.
Verifica pertinente: diff documentale, git diff --check, link locali nuovi esistenti,
UTF-8 e fini riga LF, indice MEMORIA-SETTEMBRE sotto 19.900 byte. Nessun RED/GREEN
di prodotto richiesto: non si cambia comportamento. Il ripristino, se richiesto, riguarda
solo questi blocchi documentali, mai un reset del worktree o il ripristino di interi file
che nel frattempo abbiano ricevuto modifiche altrui. Nessun commit o push in questa attività.

## Evidenze e rettifiche

| Voce | Riscontro del 14/09 | Conseguenza |
|---|---|---|
| Release pubblica | gh release view desktop-v0.1.5 --repo Ninozzz95/talos: pubblicata il 13/09 alle 12:27:49Z, non bozza, tre asset | Fase 0 chiusa per la 0.1.5; falsa l'affermazione «nessuna release desktop mai uscita» |
| Nuovo tentativo | gh run view 34834305252 --repo Ninozzz95/agent-virtual-machine: alle 10:48 UTC test server/kernel/frontend/Electron verdi, installer e ZIP in corso | La 0.1.7 non è ancora una release consegnata; osservazione puntuale, da aggiornare al prossimo controllo |
| Commit e tag | git ls-remote origin: ramo e tag desktop-v0.1.7 risolvono ad ad35a646599fdd7e7803442236d9b43e011e280b | Push già fatto, nessun nuovo push necessario per avviare quella corsa |
| F01–F07 | Commit 7879d81d, f19edd6a, 850bf0ec presenti nella storia | Correzioni implementate; i conteggi locali citati sono evidenze della sessione precedente |
| Fase 3-bis | Sette righe WF-1…WF-7 già nella tabella e nel piano binary-launching-ullman.md | Non reinserirla, non rinumerare tutte le fasi; implementazione non avviata |
| Modifica file | Commit 4e8bfd6d; config.mjs ammette scrivi, file_edit, prova, shell, document_create, generate_image | PO-12 non è «zero chiamanti»; sei override ammessi, non cinque. Copertura UI completa non verificata oggi |
| Provider | Coda aggiornata: P-D…P-L e P-K-bis/P-L-bis implementati; acp-agent.mjs presente | Restano qualifiche reali e PO-15/PO-16; ACP come provider non equivale alla delega esterna completa |
| D-10C | Coda proposte, sezione «CHIUSO il 10/09»: ordine FUORI-1 / ERRORE-1 / FUORI-2 provato | La roadmap contraddice una chiusura documentata; nuova esecuzione non fatta, non aprire una seconda cura senza riproduzione |
| BC-52 | Coda unica: approvato il 13/09, dopo release e PO-15/PO-16/A-B; assente dalla tabella | Inserito in Fase 9 come lavoro successivo con tali dipendenze, senza cambiare l'ordine approvato |
| Prove rosse | Tabella: parità componenti 12, baseline-shell 49; anche REDUCED-MOTION-02 dichiarato aperto | Debiti storici da riaccertare per nome e insieme, non test rieseguiti oggi |

Link GitHub: [0.1.5 pubblica](https://github.com/Ninozzz95/talos/releases/tag/desktop-v0.1.5),
[CI 0.1.7 sviluppo](https://github.com/Ninozzz95/agent-virtual-machine/actions/runs/34834305252).
Una release sul repository di sviluppo non dimostra la distribuzione sul pubblico: prima
di dichiarare consegnata la nuova versione verificare repository destinatario, asset e download.
Il changelog desktop contiene a sua volta la premessa errata sulla 0.1.5: resta una rettifica
editoriale della prossima consegna, non si riscrive il tag pubblicato per correggerla.

## Metodo consigliato: una fase, fino a cinque compiti, integrazione controllata

Il coordinatore mantiene contesto generale, contratti, elenco dei file, dipendenze,
review del codice, valutazione architetturale e di sicurezza, integrazione e verifica finale.
Ogni compito ha un contesto breve proprio e una consegna verificabile su disco.
Un agente torna sullo stesso compito per le correzioni; alla fase successiva riceve un brief
aggiornato, senza affidarsi alla memoria implicita della fase precedente.

Cinque è un limite di scomposizione, non l'obbligo di inventare cinque incarichi.
I compiti dipendenti aspettano il contratto e l'esito dei precedenti anche con slot liberi.
Non assegnare cinque fasi parallele: app.js, http-app.mjs, kernel e registro sessioni
ricorrono in più fasi e cambierebbero sotto chi costruisce sopra di loro.
Un solo agente che attraversa cinque fasi conserva contesto ma elimina gran parte del
parallelismo e rimanda la revisione: preferire consegna e review a ogni compito e fase.

La modalità workflow qui indica il metodo di coordinamento della sessione. Il motore
«Piani di lavoro» di TALOS è invece il prodotto da implementare nella Fase 3-bis;
non è già disponibile per eseguire questa roadmap.

### Vincoli reali, da non trasformare in promesse

- Il runtime corrente espone quattro slot totali: coordinatore e al massimo tre subagenti
  contemporanei. Cinque compiti possono procedere a ondate, secondo dipendenze, senza
  creare task autonomi per aggirare il limite. Nessuna modifica alla configurazione ora.
- I modelli Opus 5 richiesti nei registri storici non sono esposti da questo runtime.
  Non sostituirli silenziosamente né dichiararli in esecuzione.
- AGENTS.md assegna al principale implementazione e review complessa; permette ai subagenti
  solo prove focalizzate semplici e controlli meccanici. La proposta dell'owner di delegare
  implementazione e lasciare al principale coordinamento/review va resa esplicita nelle
  regole operative prima di applicarla. Questo aggiornamento non modifica AGENTS.md.
- Per scritture parallele autorizzate: worktree separato e file esclusivi; il worktree
  isola le copie ma non elimina i conflitti logici. Un solo proprietario per ogni file,
  inclusi test condivisi, lockfile e documenti. Verificare cwd, ramo e SHA a ogni consegna.
- Build, installazioni, suite complete, prove di mutazione e porte condivise restano
  seriali. Le prove che rompono il codice non si lanciano sul lavoro vivo di un altro agente.
- Nessun autore può chiudere autonomamente il proprio compito: review principale, eventuale
  controllo indipendente focalizzato, poi verifiche sullo stato integrato esatto.

### Ciclo di ogni fase

1. Riaccertare ogni riga nel codice: chiusa, parziale, nuova o non riproducibile.
2. Aggiornare ricerca primaria e decisione upstream; scrivere ledger eseguibile con file,
   simboli, contratti, test RED, gate GREEN/regressione/upstream, prova visibile e rollback.
3. Fissare contratti e proprietà dei file prima dei brief. Le corsie della roadmap sono
   gruppi di requisiti: non sono ancora cinque assegnazioni pronte da avviare insieme.
4. Avviare solo i compiti indipendenti; integrare e rivedere ogni consegna, comprese
   prove negative e limiti dichiarati. L'agent principale gestisce le dipendenze condivise.
5. Eseguire suite interessate e percorso umano completo sullo stato integrato; conservare
   prove su reload, riavvio, annullamento, errori e due temi quando pertinenti.
6. Aggiornare tabella, coda e memoria nello stesso turno. Commit solo se autorizzato;
   push e release richiedono l'autorizzazione esplicita già prevista. Aprire la fase dopo.

### Applicazione alla Fase 3: cinque compiti logici, non cinque partenze simultanee

| Compito | Risultato | Dipendenza |
|---|---|---|
| F3-A | Contratto server per operazioni massive, limite esplicito, esito per voce e policy | Primo contratto condiviso da fissare prima dei consumatori |
| F3-B | Contratto degli strumenti di elenco e paginazione, compreso research_list | Parte dopo il contratto; coordinare ogni modifica kernel con F3-E |
| F3-C | Selezione multipla riusabile e feedback sugli esiti nelle sezioni | API F3-A disponibile; un solo proprietario di app.js |
| F3-D | Cancellli di pubblicazione: copertura non vuota, albero intero, regressioni nominate | Può procedere indipendentemente dopo aver delimitato gli script |
| F3-E | Assistenza con documentazione vera, citazioni e risposta fuori copertura | Dipende dalla documentazione Fase 1; eventuali rotte condivise si integrano col proprietario F3-A |

Rettificare segreti ereditati dai processi e copertura permessi richiede prima una verifica
prioritaria del coordinatore: sono segnalazioni storiche, non vulnerabilità rivalidate oggi.
Se confermate, la correzione precede nuove capacità di esecuzione; nessuna deroga di sicurezza
si deduce dalla posizione tardiva della riga nella vecchia tabella.

## Fonti del metodo e decisione upstream

Consultate e aperte il 14/09/2026 tramite OpenAI Docs:
[Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) e
[Git worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees).
Si adottano le capacità native di delega e isolamento quando compatibili con i vincoli
della sessione. Non si costruisce un orchestratore aggiuntivo per organizzare questo lavoro.
Nessuna dipendenza software o protocollo è introdotto, quindi nessun nuovo pin di pacchetto.
La ricerca sui contratti del prodotto TALOS resta obbligatoria prima della sua implementazione.

## Release pubblica avviata — 14/09/2026, 17:43 Europe/Rome

Autorizzazione owner: ripartire sul pubblico rapidamente, rispettando le note sui repository. Esportatore R-05b senza Riordina: cancelli superati, 135 file; mobile e workflow invariati. Sorgente privata ad35a646599fdd7e7803442236d9b43e011e280b. Commit pubblico 0c432153a288f64237e98403869d02d20d8fabc7, main e nuovo tag desktop-v0.1.7 pubblicati atomicamente su Ninozzz95/talos. CI pubblica 34863983597 verificata in_progress: https://github.com/Ninozzz95/talos/actions/runs/34863983597 . Questo conferma avvio, non completamento o disponibilita degli asset. La CI privata 34834305252 era fallita alla persistenza attestazione, non supportata sui repository privati personali. Nessun tag privato riscritto. Correzione editoriale dello storico changelog 0.1.5 ancora pendente: la 0.1.5 pubblica esiste.

## 0.1.8 — integrazione pubblica e CI avviata
Main iniziale 9b03c4e84f4a989a7b6528a688fe45f2be56974b. PR #4 merge d0649a96c06b6e2f25aa1eefb35387ce05d95f40; PR #7 aggiornata e merge 9f395e8153906f3240e637cd1dc79e0c4925c57a. Main/tag desktop-v0.1.8: aa517786d24820ab56711ed7f8fe0426b8bb6af9. CI pubblica 34901484160 in corso, non ancora release verificata. Nessun file mobile modificato rispetto al main iniziale. NON riesportare la lane privata prima di recuperarvi questi fix pubblici.
Verifica locale Windows: server 2967 pass/33 skip, kernel 597 pass, frontend 1053 pass/2 skip, desktop puri 54 pass/4 skip, Electron reale 3 pass, browser 3 pass; zero fail. Browser Prompt Enhance attraversa UI e rotta HTTP reale con risposta provider simulata e applicazione esplicita. Log in Temp/talos-018-review. I 42 rossi Linux (43 nomi includendo il riepilogo) corrispondono alla baseline main, anche sul ramo #7 aggiornato: differenze nomi zero. Kernel:controlla locale segnala divergenza con vecchia copia privata adiacente, file controllati invariati rispetto a main; non corretto fuori scope. Comando verify-ui-manifest non applicabile a questo layout senza harness-ui/dist/manifest.json; verificati invece tutti i byte/hash del build-manifest pubblico. Monitoraggio periodico attivo fino alla verifica asset e attestazione.

## 0.1.8 — pubblicazione e verifica concluse (15/09/2026)
CI 34901484160 SUCCESS; release non draft pubblicata 2026-09-14T22:08:33Z: https://github.com/Ninozzz95/talos/releases/tag/desktop-v0.1.8 . Commit aa517786d24820ab56711ed7f8fe0426b8bb6af9. Scaricati e verificati rispetto a SHA256SUMS.txt: EXE 152073523 byte, SHA256 4af531ebcd932c9ee5be47c48ba2a50b433b61dda054b9d1a304eead49bd74ea; ZIP 255892771 byte, SHA256 cb35878a744620456813e12bf0c6d7a0900851b4d23ecbf3b4387eaa05e828a5. SHA256SUMS.txt 174 byte. Entrambe le attestazioni verificate con gh attestation verify, repository Ninozzz95/talos, source-digest esatto, source-ref refs/tags/desktop-v0.1.8, signer-workflow .github/workflows/release.yml, deny-self-hosted-runners. Authenticode EXE: NotSigned (distinto dalla provenienza). File e JSON di verifica in C:/Users/Antonino/AppData/Local/Temp/talos-018-release-assets. Monitoraggio concluso.

## Fase 3 — consegna verificata (15/09/2026)

I cinque compiti logici sono stati integrati inline nel perimetro misurato: batch sulle cinque
collezioni scrivibili, selezione condivisa, guardia sui tre tool realmente paginati, banco
exporter riparato e assistenza con fonti reali. Stato, scostamenti dal censimento storico e
numeri delle suite sono nel [ledger della Fase 3](LEDGER-FASE-3-2026-09-15.md) e nella tabella
canonica. La Fase 3-bis resta separata e non avviata.
