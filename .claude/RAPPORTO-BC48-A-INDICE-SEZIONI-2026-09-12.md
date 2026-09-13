# BC-48 A · indice e sezioni su richiesta · 12/09/2026

## Registro operativo prima del codice

Sottosistema posseduto: orchestrazione desktop e integrazione del contesto. Lavoro nel worktree assegnato `C:/Users/Antonino/AppData/Local/Temp/claude/wt-astra-bc48a/harness-ui`, non nel checkout Desktop. HEAD distaccato su `617407e7`, nessun cambio di ramo. Ricerca originaria letta per intero. Rapporto nella `.claude/` della radice del worktree, scrivibile: nessun ripiego locale necessario. Nessun agente delegato, commit, installazione o modello a pagamento. I test preesistenti di fallback usano listener temporanei su porte effimere, chiusi dalla suite; nessun uso della 4174.

File esatti da modificare: `harness-ui/src/istruzioni-di-progetto.mjs`, `harness-ui/src/contesto-del-progetto.mjs` (solo diagnostica), `harness-ui/src/context-provider-adapter.mjs`, `harness-ui/src/runtime-owner-adapter.mjs` (solo blocchi BC-48 A), `harness-ui/tests/preambolo-quattro-blocchi.test.mjs`. File da creare: `harness-ui/src/sezioni-istruzioni.mjs`, `harness-ui/tests/istruzioni-di-progetto-indice.test.mjs`, `harness-ui/tests/sezioni-per-percorso.test.mjs`, questo rapporto. Nessuna cancellazione. Fixture generate dai test in directory temporanee.

Simboli nuovi previsti: `SOGLIA_RIGHE_INDICE`, `analizzaSezioniIstruzioni`, `rimuoviCommentiHtml`, `rendiFileIstruzioni`, `creaIniettoreSezioni`, `collegaSezioniAiContextHooks`. Compatibilità: conservare `NOMI_CANDIDATI`, `RISALITA_MASSIMA`, `TETTO_BYTE_PREDEFINITO`, `QUOTA_TESTA`, `QUOTA_CODA`, `trovaRadiceProgetto`, `trovaIstruzioniDiProgetto`, `tagliaIstruzioni`, `testoIstruzioniDiProgetto`, `istruzioniDiProgetto`, tutte le esportazioni degli adapter. Nessuna classe pubblica, schema esterno o migrazione nuovi. `tagliaIstruzioni` resta disponibile per compatibilità; il compositore nuovo omette unità intere.

RED: indice assente sui file sezionati; metadati e parser assenti; iniettore e wrapper assenti; scenario BC-07 da 200 KB deve diventare omissione dichiarata, non testa/coda. GREEN: i due test nuovi e `preambolo-quattro-blocchi.test.mjs`. Regressioni: famiglie istruzioni, contesto, BC-40, mappa, adapter del contesto e runtime. Scenario permanente: nessuna sezione spezzata per rispettare il tetto; batch di attrezzi chiuso prima di accodare; storico immutabile; nessuna duplicazione dopo ricostruzione degli hook; nessuna contaminazione fra sessioni.

Gate upstream: `node:path.posix.matchesGlob` reale, Node **v24.18.0** installato, con fixture di conformità; nessuna nuova dipendenza. Gate umano offline: indice dal vero `../AGENTS.md` e conversazione simulata attraverso l'adapter reale. Tre giri con modello e verifica dal composer restano al lettore per divieto di spesa. Rollback: rimuovere soltanto i blocchi BC-48 A e ripristinare manualmente i diff elencati; nessun comando di ripristino eseguito.

## Ricerca e decisione upstream

Fonti primarie consultate il **12/09/2026**, prima delle modifiche:

- [Claude Code, memoria](https://code.claude.com/docs/en/memory): `paths` seleziona glob di file nel progetto; gli esempi distinguono `*.md` alla radice e `src/**/*`. La documentazione attuale specifica l'attivazione alla lettura di file corrispondenti, non a ogni uso di attrezzo: non vi è una promessa esplicita per ogni scrittura. Gerarchia dal generale al particolare. Commenti HTML di blocco rimossi dall'iniezione, preservati nel codice e nelle letture dirette. Nessuna garanzia pubblica “una volta per sessione”; dopo compattazione alcuni file vengono ricaricati. TALOS estende deliberatamente il trigger ai quattro attrezzi richiesti e rimuove anche i commenti inline fuori dal codice.
- [Amp, AGENTS.md](https://ampcode.com/docs/customize/agents-md): antenati sempre, sottoalberi alla lettura; file menzionati con `globs` solo dopo lettura corrispondente. Amp antepone implicitamente `**/` salvo percorsi espliciti `./` e `../`: semantica diversa dal contratto richiesto, quindi non copiata. La pagina non specifica identità di deduplicazione, ordine dei glob sovrapposti o garanzia di singola iniezione per sessione.
- [Cursor, regole](https://cursor.com/docs/rules): fonti Team → Project → User, fusione delle regole applicabili e precedenza delle fonti anteriori. Non documenta una deduplicazione di sezioni identiche né l'ordine di due regole dello stesso tipo. Non assunto come garanzia.
- [Windsurf/Devin, regole](https://docs.devin.ai/desktop/cascade/memories): glob su lettura/modifica; deduplicazione documentata nella scoperta fra workspace multipli, con percorso relativo più corto. `.devin` precede il ripiego `.windsurf`. Nessuna promessa esplicita di singola iniezione per sezione lungo tutta la sessione; non confondere deduplicazione della scoperta con quella del prompt.
- [Node v24.18.0, path](https://nodejs.org/download/release/v24.18.0/docs/api/path.html#pathmatchesglobpath-pattern): adottare direttamente `posix.matchesGlob`, normalizzando i separatori e confinando i percorsi alla radice. API stabile anche da Node 22.20.0. Licenza MIT del runtime già distribuito; nessuna copia di codice upstream o nuova dipendenza.
- [CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/): adattare delimitatori ATX e blocchi recintati/indentati al lettore di sezioni. Non introdurre un renderer Markdown completo: occorre conservare gli offset del sorgente. [AGENTS.md](https://agents.md/) resta Markdown standard; i metadati sono commenti, senza frontmatter proprietario.

Decisione AVM: adattatore posseduto per indicizzazione e stato; glob upstream diretto. Identità di deduplicazione per file e posizione della sezione, ordine catena poi ordine su disco, nessun riordino del passato. Soglia inclusiva del testo intero: **60 righe** per i file non di radice; oltre 60 indice. File di radice sezionato sempre indicizzato; senza `##` resta unità intera, per non occultare prosa priva di sezioni.

## Vincoli emersi dall'ispezione

`leggi` nel kernel legge l'intero file e non espone intervalli. Le righe dell'indice saranno coordinate del disco, senza fingere che esista un parametro di selezione. Le etichette della catena sono relative alla radice Git; il disco della sessione è relativo al cwd: riportare anche il percorso relativo al cwd per la lettura. Accesso agli antenati da verificare nel gate reale e nel diff proposto, senza allargare i permessi.

`contextHooks` è opzionale (gestione del contesto attiva per sessione). Il wrapper accoda agli originali prima di `capture`/`prepare`, soltanto quando tutte le chiamate di attrezzi hanno il risultato. Questo consente persistenza e misura del budget prima del modello. Non iniettare solo nel JSON di `fetchConImmagini`: la sezione andrebbe persa dallo storico. Non creare hook sostitutivi nelle sessioni legacy: disattiverebbero la compattazione esistente. Il rapporto finale deve indicare esplicitamente questa limitazione e il diff non applicato.

## Misura iniziale

File vero: **11.480 byte, 172 righe, 17 sezioni `##`**; SHA-256 `d7b56001cc35767f889d4aa4f40decb2a3cebab78fcc97c11eb929ba9493b9ac`, invariato anche alla verifica finale. Blocco istruzioni precedente con involucro: **11.845 byte**, **2.962 token stimati** a 4 byte/token (arrotondamento per eccesso). Non confrontare direttamente questa stima con i 3.400 token della ricerca, calcolati con un altro rapporto.

L'attesa iniziale di 18 sezioni proveniva dal brief ed è stata corretta sulla prova del disco, come registrato sotto.

### Emendamento dopo il primo GREEN

Il file vero ha **17 sezioni `##`**, non 18: 18 è il numero totale di titoli includendo `# AVM Agent Operating Model`. Byte, 172 righe e hash coincidono con il brief. Il test del disco deve fissare 17 sezioni, mantenendo 11.480 e 172. Primo ciclo: 39/49 verdi, un'attesa errata sul numero di sezioni e nove fallimenti del gruppo percorso dovuti al riconoscimento dell'unità Windows. Scenario permanente `BC48-A-SESSIONI`: separatori e radice Windows; normalizzare prima di scegliere l'API del percorso.

### Emendamento di revisione

Identità della sezione: file + titolo + occorrenza del titolo nel file, invece delle righe, affinché inserire una premessa non reinietti la stessa sezione. Scenari permanenti `BC48-A-RIGHE-SPOSTATE`, `BC48-A-ALIAS`, `BC48-A-PATH-MOLTE`: ricostruzione degli hook dopo spostamento di righe; sei alias del kernel; molti glob applicabili sotto un tetto condiviso. Se il tetto non contiene neppure gli avvisi si deve fallire esplicitamente prima di mutare lo storico. Aggiungere prova col kernel reale e trasporto sostituito, senza rete; file di test già posseduti.

Ulteriore scenario di conformità `BC48-A-CODICE-CITATO`: preservare anche commenti nei blocchi di codice dentro citazioni ed elenchi. `BC48-A-GLOB`: brace native, titoli duplicati distinti e assenza del prefisso implicito di Amp. Diagnostica verificata dal compositore completo.

## Risultato e formato consegnato

Indice della radice, soglia 60/61 per i file locali, sezioni sempre, rimozione dei commenti, diagnostica e iniezione via hook sono implementati. **Accettazione completa ancora aperta**: il preambolo supera 900 token, l'iniezione automatica richiede `contextHooks` attivo e la lettura di intervalli non esiste nel kernel attuale. Nessun cambiamento ai file di istruzioni del repo, né alla mossa C.

Il lettore conserva la prosa prima del primo `##`, perché non può eliminarla senza dichiararlo. Mostra per intero la prima sezione se il titolo inizia con `Non-Negotiable`, più ogni sezione con `<!-- talos: sempre -->`. Per le altre emette il titolo, le righe inclusive originali, i byte UTF-8 del segmento originale (titolo, commenti, terminatori e righe vuote inclusi) e la prima frase del primo paragrafo/punto. Nessun riassunto generato. I file senza `##` restano unità intere.

Esempio **ottenuto dal vero file**, non riscritto:

```text
## Standards-First Engineering · righe 61-84 · 2044 byte · Web research is a blocking prerequisite for every implementation, refactor, and bugfix.
```

Il modello riceve l'istruzione di leggere la sezione sul disco; su `harness-ui/` il percorso è **`../AGENTS.md`**. Verifica aggiuntiva conclusiva: `discoNode({radice: cwd}).leggi('../AGENTS.md')` legge davvero tutti gli 11.480 byte, identici al file. La guardia di `elenca` sui `..` non va attribuita a `leggi`. **Non serve ampliare i permessi per questo percorso**. La riga dell'indice è giusta; oggi `leggi` restituisce tutto il file, poi il modello individua la parte richiesta.

Esempio del commento **proposto, non applicato**, usando titolo e prima regola della sezione reale `UI Product Rules`:

```markdown
## UI Product Rules
<!-- talos: paths: harness-ui/**, mobile/** -->

- `/chat` is the dedicated low-noise chat surface.
```

Il file vero non contiene alcun `talos: paths` né `talos: sempre`: nessuna assegnazione arbitraria di sezioni alle cartelle è stata fatta. Quella resta una decisione dell'owner. I commenti dei metadati sono riconosciuti soltanto fuori dai blocchi di codice; quelli dentro i blocchi rimangono esempi letterali. Gli altri commenti HTML fuori dal codice vengono rimossi dalla resa; il disco e le coordinate restano intatti.

Glob con separatori `/`, relativi alla radice del progetto; elenco separato da virgole, preservando una brace come `*.{ts,mjs}`. Match nativo di Node, sensibile alle maiuscole, senza il prefisso implicito `**/` di Amp. Limiti dell'adattatore: pattern massimo 1.024 caratteri, al massimo un gruppo brace, nessun percorso assoluto o risalita nel pattern. I pattern esclusi non attivano sezioni; l'indice resta utilizzabile per leggerle. Non è un interprete di tutti i formati di regole dei concorrenti.

## Dove avviene l'iniezione

`runtime-owner-adapter.mjs` carica la catena e collega `collegaSezioniAiContextHooks` nello stesso confine desktop che possiede `fetchConImmagini`. L'accodamento avviene **prima** di `capture` e `prepare`, sul vettore degli originali. `prepare` vede quindi le sezioni prima della misurazione e della preparazione del contesto; l'archivio riceve gli stessi messaggi. Nessuna sezione viene infilata nel solo JSON HTTP, dove andrebbe persa dai turni successivi.

Per `leggi` e `scrivi` si collega il risultato al `tool_call_id` e si legge il percorso dagli argomenti JSON validati, con i sei alias reali del kernel. Il risultato completo attiva la regola anche se il testo libero descrive un errore: non si indovina il successo da una frase. Per `cerca`/`elenca` si usa il contratto corrente di percorsi uno per riga, fermandosi alle code di avviso. Il contenuto libero di un file o di una shell non viene interpretato come elenco di percorsi. Il contenuto delle istruzioni proviene soltanto dalla catena già individuata, mai dal risultato dell'attrezzo.

Due sezioni con lo stesso glob entrano entrambe, in ordine radice→cwd e poi ordine del file. Nessun messaggio entra fra chiamate di un batch e risultati ancora pendenti. La forma è un messaggio `user` distinto:

```text
Sezione di `AGENTS.md` che vale per questa cartella: UI Product Rules (1).
Righe 146-154 del file su disco.
## UI Product Rules
…contenuto intero della sezione…
```

La prima riga è il marcatore persistibile: file + titolo + occorrenza. Set locale agli hook e ricerca del marcatore nella cronologia impediscono duplicati; spostare le righe non cambia identità. Nessuna mappa globale condivisa fra sessioni. Nel turno successivo i messaggi già presenti conservano posizione e byte; una nuova sezione entra solo in fondo. Il test reale copre due invocazioni del kernel e la ricostruzione degli hook. Un cambio di titolo identifica una nuova sezione.

Tetto del preambolo: 24.000 byte inclusi involucro e avviso. Prima si indicizza, poi si omettono file interi partendo dai più generali, preservando un suffisso della catena. `tagliati` resta presente ed è vuoto nella nuova resa; `omessi` nomina gli esclusi. Tetto delle aggiunte: 24.000 byte per gruppo di nuove sezioni, inclusi marcatori e avvisi, separato dal budget complessivo gestito dal motore del contesto. Le sezioni più in fondo vengono sostituite con un avviso di omissione intera se necessario. Se nemmeno gli avvisi stanno nel tetto, errore esplicito prima di accodare. Nessun taglio di una sezione in due.

Diagnostica sul file vero:

```json
{
  "byte": 3552,
  "usati": ["AGENTS.md"],
  "omessi": [],
  "tagliati": [],
  "indicizzati": ["AGENTS.md"],
  "sezioniSempre": [{
    "etichetta": "AGENTS.md", "titolo": "Non-Negotiable User Rule",
    "da": 5, "a": 10, "byte": 233
  }]
}
```

## Misure prima/dopo

Stime dichiarate: **ceil(byte UTF-8 / 4)**, nessun tokenizer e nessuna fatturazione. Il modulo `mappa-cartelle.mjs` usa invece `costoDelTesto(..., {metodo:'stimato'})`, con rapporto 3,5; il compositore completo restituisce 1.438 token con quel criterio per lo stesso testo finale.

| Contenuto | Prima byte | Dopo byte | Prima token stimati /4 | Dopo token stimati /4 |
|---|---:|---:|---:|---:|
| File sorgente `AGENTS.md` | 11.480 | 11.480 | 2.870 | 2.870 |
| Blocco istruzioni completo di involucro | 11.845 | 3.552 | 2.962 | 888 |
| Preambolo completo comparabile | 13.326 | 5.033 | 3.332 | 1.259 |

Riduzione del blocco istruzioni: **8.293 byte, 70,01%**. **Bersaglio preambolo ≤900: non raggiunto**; sono 359 token stimati in più. Non si dichiara il successo usando soltanto gli 888 token del blocco istruzioni. Ridurre ulteriormente richiede una scelta editoriale sulle istruzioni/descrizioni o altri blocchi, oltre la mossa A qui autorizzata.

Metodo: il blocco precedente è stato salvato prima delle modifiche; quello nuovo è stato prodotto da `trovaIstruzioniDiProgetto(process.cwd())` e `testoIstruzioniDiProgetto`. Per il confronto del preambolo si usa la stessa mappa/scheda corrente e si sostituisce soltanto il blocco istruzioni con la versione iniziale: **prima comparabile ricostruito**, non una seconda sessione reale. `contestoDelProgetto` è stato chiamato con `statoVolatile:false` e il filtro `radice => creaFiltroGitignore({radice})`; mappa 1.126 byte, scheda 351, separatori 4. Nessuno stato Git variabile nell'A/B. Nessuna durata o cache hit inventata.

## Verifiche e numeri

RED registrati: due file non caricabili per modulo assente; BC-07 da 200 KB ancora tagliato; poi tre scenari di revisione su identità, alias e tetto; infine commenti dentro codice citato. Tutti corretti, nessun RED residuo del cambiamento.

| Comando / gate | Esito finale |
|---|---|
| `rtk proxy node --test tests/istruzioni-di-progetto-indice.test.mjs tests/sezioni-per-percorso.test.mjs tests/preambolo-quattro-blocchi.test.mjs` | 56/56 |
| `rtk proxy node --test tests/istruzioni-di-progetto*.test.mjs tests/contesto-del-progetto*.test.mjs tests/bc40-*.test.mjs tests/mappa-*.test.mjs` | 44/44 |
| Preambolo, sezioni, adapter del contesto, runtime, fallback e contratto runtime | 94/94 test eseguiti |
| `tests/context-engine-integration.test.mjs` aggiuntivo | 11/11 con risoluzione locale di `zod`, vedi sotto |
| `BC48-A-VERO` dopo aggiunta della prova di lettura dell'antenato | 1/1, già incluso nel gruppo da 44 |
| `rtk proxy git diff --check` | nessun errore |

**149 test distinti superati** nelle batterie finali (44 + 94 + 11; il gruppo da 56 sovrapposto non si somma). I 26 test dei due file nuovi comprendono i due versi per soglia, commenti, coordinate/CRLF, file vero, glob, assenza di match, ordine, de-duplicazione, sessioni, batch, tetto e integrazione. Il test `BC48-A-KERNEL-REALE` usa `talosLavora` e il disco reali, un trasporto finto deterministico, due turni e un refuso nel seguito. Nessun modello viene chiamato.

Problema d'ambiente incontrato: la suite aggiuntiva del contesto falliva **prima di eseguire test**, perché `context-engine/` non risolveva `zod` nel worktree isolato. Nessuna installazione o modifica a quel sottosistema. La verifica è riuscita usando `node:module.registerHooks` soltanto nel processo di test per risolvere `zod` nella copia già presente di `harness-ui/node_modules` (pin del manifest 4.5.4). Comando riproducibile da `harness-ui/`:

```powershell
rtk proxy node --input-type=module -e 'import {spawnSync} from "node:child_process"; const url=import.meta.resolve("zod"); const hook="import {registerHooks} from \"node:module\"; registerHooks({resolve(s,c,n){return n(s===\"zod\"?"+JSON.stringify(url)+":s,c);}});"; const r=spawnSync(process.execPath,["--import","data:text/javascript,"+encodeURIComponent(hook),"--test","tests/context-engine-integration.test.mjs"],{encoding:"utf8"});process.stdout.write(r.stdout);process.stderr.write(r.stderr);process.exitCode=r.status;'
```

Gli avvisi Git sul file globale `C:/Users/Antonino/.config/git/ignore` non accessibile non hanno impedito diff e stato. `rg` non è nel PATH; ricerca fatta con Node dopo il tentativo iniziale. `rtk git` richiede una configurazione Claude non disponibile; usato `rtk proxy git`. Nessuna modifica della configurazione personale.

## File consegnati e righe

Percorsi relativi a `harness-ui/`, salvo il rapporto:

| File | Righe di ingresso | Contenuto del cambiamento |
|---|---|---|
| `src/sezioni-istruzioni.mjs` (nuovo) | 5, 57, 73, 97, 165 | soglia, commenti, sezioni, indice, iniettore |
| `src/istruzioni-di-progetto.mjs` | 2, 125, 198 | nota di compatibilità, percorso di lettura relativo al cwd, composizione atomica e diagnostica |
| `src/contesto-del-progetto.mjs` | 240 | soltanto i due campi diagnostici |
| `src/context-provider-adapter.mjs` | 3, 6 | collegamento ai due hook degli originali |
| `src/runtime-owner-adapter.mjs` | 26, 1027 | soli blocchi BC-48 A, desktop con hook già attivi |
| `tests/istruzioni-di-progetto-indice.test.mjs` (nuovo) | 1, 79 | nove scenari; vero file, lettura dell'antenato e diagnostica |
| `tests/sezioni-per-percorso.test.mjs` (nuovo) | 1, 147, 167 | diciassette scenari; adapter e kernel reali |
| `tests/preambolo-quattro-blocchi.test.mjs` | 146 | caratterizzazione aggiornata: 200 KB omessi interi |
| `../.claude/RAPPORTO-BC48-A-INDICE-SEZIONI-2026-09-12.md` (nuovo) | 1 | registro, ricerca, misure, esiti, limiti e proposte |

Il rapporto C era già presente non tracciato e non è stato modificato. Nessuna modifica a `AGENTS.md`, `CLAUDE.md`, kernel, servizi/session registry/server, frontend, mobile o altri sottosistemi vietati. Nessun `git add`, `git commit`, `git push`.

## Diff non applicati

**1. Lettura per intervallo, nel kernel posseduto dall'owner.** Oggi lo schema di `leggi` espone solo `percorso` (circa 1416) e il ramo passa il percorso a `disco.leggi` (circa 6795). Proposta da completare con test per range invalidi e lettura intera senza parametri:

```diff
--- a/harness-ui/src/kernel/talosHarness.mjs
+++ b/harness-ui/src/kernel/talosHarness.mjs
@@ schema di leggi
- properties: { percorso: { type: 'string' } },
+ properties: {
+   percorso: { type: 'string' },
+   da: { type: 'integer', minimum: 1 },
+   a: { type: 'integer', minimum: 1 },
+ },
@@ ramo leggi: dopo la verifica del percorso
- : await disco.leggi(percorso)
+ : await leggiIntervalloIstruzioni(disco, percorso, argomenti.da, argomenti.a)
```

`leggiIntervalloIstruzioni` sarebbe un simbolo **nuovo, non implementato qui**: senza `da/a` deve preservare tutti i byte della lettura esistente; con entrambi deve validare interi, 1≤da≤a≤numero righe, selezionare righe inclusive preservando i terminatori e restituire errori leggibili. Nessuna apertura di permessi, nessun intervento sul bundle del disco necessario per la sola selezione. Questo diff non è dichiarato pronto da applicare senza implementazione/test nel lane del kernel.

**2. Sessioni legacy senza gestione del contesto.** Creare un finto `contextHooks` per attivare le sezioni spegnerebbe la compattazione legacy: non applicato. Proposta di un callback indipendente, opzionale, nel kernel:

```diff
--- a/harness-ui/src/kernel/talosHarness.mjs
+++ b/harness-ui/src/kernel/talosHarness.mjs
@@ parametri di talosLavora
- onDelta, reasoning, contextHooks,
+ onDelta, reasoning, contextHooks, onContestoPrimaDellaRichiesta,
@@ prima della cattura before-request, a batch concluso
+ await onContestoPrimaDellaRichiesta?.({ messages: messaggi })
  await contextHooks?.capture?.({ messages: messaggi, reason: 'before-request' })
```

L'owner dovrà versionare la capacità del runtime; l'adapter desktop potrà passare l'iniettore già consegnato al nuovo callback, lasciando `contextHooks` assente e la compattazione legacy operante. Servono gate senza hook, compattazione e stop/ripresa. Nessun diff in `agent-service.mjs` necessario per il collegamento attuale, e nessuno applicato. I suoi `onGiro`/`onScrittura` non sono stati usati.

## Cosa non è stato verificato

- I tre giri con un modello vero dal composer, la scelta della sezione per pertinenza, URL naturali e recupero dopo reload dell'app: restano al lettore. Il test offline su due turni non sostituisce quel gate.
- Token del tokenizer del modello e cache realmente fatturata: i numeri qui sono stime, nessun effetto economico misurato.
- Selezione di sole righe con `leggi`: non esiste ancora. Oggi leggere una sezione riporta nel contesto l'intero file.
- Attivazione automatica nelle sessioni legacy prive di `contextHooks`: non implementata, diff proposto sopra. Nel preambolo la condizione è dichiarata in parole comuni.
- Frontend, mobile, core, validator e prove visuali: nessuna modifica in quei lane, nessuna suite completa eseguita. Non è una certificazione CommonMark completa: il formato indicizzato è fatto di titoli ATX `##`; il lettore non interpreta frontmatter o titoli Setext.

## Testo di commit proposto, non eseguito

```text
BC-48 A: indicizza le istruzioni e accoda le sezioni per percorso

Mantiene intere le regole sempre presenti e pubblica coordinate del disco.
Accoda le sezioni applicabili una volta nella cronologia tramite contextHooks.
Preserva il prefisso C e dichiara le omissioni senza spezzare sezioni.
Verifica indice reale, 60/61 righe, commenti, glob, persistenza e due turni offline.

Limiti: sessioni legacy senza hook e lettura per intervallo restano al kernel;
preambolo completo 1.259 token stimati, sopra il bersaglio di 900.
```

## Cosa deve fare l'owner · Cosa faccio io · Cosa rimane

- **Cosa deve fare l'owner:** revisionare questi file nel worktree; decidere le sezioni e i commenti `paths` senza spostamenti automatici; concordare il diff del kernel per intervalli e sessioni legacy; svolgere tre giri veri e decidere la mossa B.
- **Cosa faccio io:** consegno implementazione, prove offline, misure e diff non applicati; tutti i file restano su disco, senza staging o commit. Nessun lavoro a pagamento avviato.
- **Cosa rimane:** raggiungere ≤900 token sul preambolo completo, verificare scelta delle sezioni e reload dal composer, colmare i due limiti del kernel prima di dichiarare l'accettazione completa.
