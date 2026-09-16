# Rapporto R-05A — AGPL-3.0-only e changelog desktop

**13/09/2026 · Astra · worktree `C:\Users\Antonino\AppData\Local\Temp\claude\wt-astra-r05a`.**

La fonte legale radice, i manifesti autorizzati e il README ora dichiarano **AGPL-3.0-only**. Creato il changelog `desktop-v0.1.0 — non rilasciata`. Suite pura desktop: **41/41**, nessun fallimento o test saltato. Audit: **448 occorrenze** nei quattro lock, nessuna dipendenza priva di un percorso di compatibilità individuato, con le condizioni e i limiti descritti sotto.

**L'allineamento materiale di ogni manifesto del monorepo non è ancora completo:** mobile, core, control-plane, frontend, worker, validator e benchmark hanno file esclusi dall'elenco finale autorizzato. Sono inventariati e accompagnati da diff non applicati. Nessun contributo o avviso di terzi viene convertito automaticamente in AGPL.

## 1. Base, perimetro e scostamenti dal brief

- HEAD effettivo e immutato: `ae7c26fa5138d6e803591ef477cab16c97d49ca7`, coerente con `.claude/R05A-BASE.txt`. Worktree in HEAD staccato assegnato alla lane desktop; nessun nuovo ramo creato.
- Preesistenti non tracciati preservati: `.claude/R05A-BASE.txt` e `.claude/RAPPORTO-R01-GUSCIO-ELECTRON-2026-09-13.md`.
- `package.json` radice **assente**, non semplicemente privo del campo: creato con il solo `license`, senza script, dipendenze o workspace.
- `NOTICE` era lungo 65 righe e conteneva attribuzioni APK, librerie e font: la parte terze parti è stata conservata integralmente in aggiunta a `THIRD_PARTY_NOTICES.md`.
- Nessuna citazione di licenza in `harness-ui/README.md`: verificato e lasciato intatto. Il README desktop già descriveva tag e versione: aggiunta una sola riga esplicita sul file `VERSION` separato.
- `harness-ui/desktop/.staging/LICENZA-REPOSITORY.txt` **assente in questo worktree**. Nessun artefatto rigenerato. Lo script esistente copia la radice a riga 165: la prossima build incorporerà la nuova licenza.
- `.gitattributes` contiene già nella base marcatori `<<<<<<< HEAD`, `=======`, `>>>>>>> main`. Non è stato modificato: occorre un passaggio separato del proprietario. Il LICENSE consegnato è verificato nei suoi byte effettivi.
- Ledger prima delle modifiche: [LEDGER-R05A-LICENZA-AGPL-2026-09-13.md](LEDGER-R05A-LICENZA-AGPL-2026-09-13.md). Nessuna API, schema, migrazione o logica applicativa modificata.

Il criterio seguito per la sovrapposizione di istruzioni è l'elenco finale **«File che puoi toccare»**: il più ampio «ogni altro manifesto» produce handoff per i percorsi non elencati. Nessuna richiesta di conferma aggiuntiva e nessuno sconfinamento.

## 2. Ricerca e decisione upstream

Tutte le fonti sono state consultate il **13/09/2026**. Le date di pubblicazione delle licenze sono distinte dalla data di consultazione. Le pagine GNU HTML hanno risposto con timeout al browser: la ricerca indicizzata delle stesse pagine ha restituito i passaggi citati; il documento integrale è stato letto dal download GNU ufficiale.

| Fonte | Risultato e decisione |
| --- | --- |
| [GNU AGPLv3, testo ufficiale](https://www.gnu.org/licenses/agpl-3.0.txt); [copia nell'archivio ufficiale GNU](https://ftp.gnu.org/gnu/Licenses/agpl-3.0.txt) | **Adottata direttamente** la versione 3 del 19 novembre 2007, senza traduzioni o personalizzazioni nel LICENSE. L'endpoint www ha dato timeout/403; il download riuscito è quello HTTPS di ftp.gnu.org, non un mirror esterno. |
| [SPDX AGPL-3.0-only](https://spdx.org/licenses/AGPL-3.0-only.html) | Identificatore esatto `AGPL-3.0-only`. Il modello «or later» nell'appendice ufficiale non va cancellato: la scelta del titolare per TALOS è esplicitata in NOTICE, README e manifesti. |
| [GitHub: licensing a repository](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository) | Licensee confronta il file LICENSE con testi noti. Il file integrale standard alla radice rende il repository riconoscibile; un badge non sostituisce la licenza. Nessuna prova del riconoscimento remoto, perché questo lotto non pubblica il worktree. |
| [Choose a License: AGPLv3](https://choosealicense.com/licenses/agpl-3.0/) | Conferma il file LICENSE e l'uso di `AGPL-3.0-only` nei metadati del pacchetto, compreso npm. Il campo license descrive il pacchetto; non è un requisito del confronto del solo testo da parte di Licensee. |
| GNU AGPLv3, §13 e appendice «How to Apply These Terms to Your New Programs», nello stesso [testo ufficiale](https://ftp.gnu.org/gnu/Licenses/agpl-3.0.txt) | Il servizio modificato deve offrire chiaramente e gratuitamente agli utenti remoti il sorgente corrispondente della versione usata. Non basta pubblicare un diff isolato. Le istruzioni finali raccomandano avvisi nei sorgenti e un modo per ottenere il sorgente dall'interfaccia di rete. |
| [FSF: titolare e licenze multiple](https://www.gnu.org/licenses/gpl-faq.html.en#ReleaseUnderGPLAndNF); [testo Apache-2.0, §§2 e 4](https://choosealicense.com/licenses/apache-2.0/) | Il titolare può offrire il proprio lavoro con termini diversi. Per questo lotto si assume la titolarità unica e l'assenza di contributori esterni **dichiarate dall'owner**; non sono state interrogate le API del repository pubblico. Le concessioni Apache già ricevute restano valide: il cambio non revoca le vecchie copie. |
| [FSF: elenco licenze](https://www.gnu.org/licenses/license-list.html.en); [compatibilità e rilicenza](https://www.gnu.org/licenses/license-compatibility.en.html) | Apache-2.0, MIT/Expat, ISC e BSD a 2/3 clausole ammettono l'integrazione nel quadro GPLv3/AGPLv3 conservando gli obblighi originari. Non generalizzare a ogni licenza chiamata BSD: la variante a 4 clausole è diversa. GPLv3 e AGPLv3 si possono combinare tramite §13, ma non sono intercambiabili. |
| [MPL-2.0](https://spdx.org/licenses/MPL-2.0.html), §3.3; [FSF, MPL](https://www.gnu.org/licenses/license-list.en.html#MPL-2.0) | Compatibilità condizionata: occorre conservare i diritti sui file MPL e verificare che il titolare non abbia applicato l'avviso «Incompatible With Secondary Licenses». La sola presenza del modello nell'Exhibit B del testo standard non è un opt-out. |
| [SSPL-1.0](https://spdx.org/licenses/SSPL-1.0.html), [BUSL-1.1](https://spdx.org/licenses/BUSL-1.1.html), [CC-BY-NC-4.0](https://spdx.org/licenses/CC-BY-NC-4.0.html), [Elastic-2.0](https://spdx.org/licenses/Elastic-2.0.html) | Non accettate come licenze di un'opera combinata AGPL: SSPL estende l'obbligo al software del servizio; BUSL limita la produzione salvo concessioni/data di cambio; NC limita l'uso commerciale; Elastic limita servizi gestiti e funzionalità protette. Verificare la versione e l'eventuale alternativa compatibile, senza dedurre la licenza dal marchio «Elastic». |
| [MIT](https://spdx.org/licenses/MIT.html), [ISC](https://spdx.org/licenses/ISC.html), [BSD-3-Clause](https://spdx.org/licenses/BSD-3-Clause.html), [0BSD](https://spdx.org/licenses/0BSD.html), [Zlib](https://spdx.org/licenses/Zlib.html), [Python-2.0](https://spdx.org/licenses/Python-2.0.html), [WTFPL](https://spdx.org/licenses/WTFPL.html), [BlueOak-1.0.0](https://spdx.org/licenses/BlueOak-1.0.0.html) | Letti i testi delle famiglie osservate. La valutazione di BlueOak è un'inferenza dal testo permissivo e dall'obbligo di fornire testo/link; non è presentata come un pronunciamento FSF specifico. |

**NOTICE conservato come avviso informativo.** AGPL richiede copyright, licenza e avvisi applicabili, non un file con questo particolare nome. Apache §4(d) attribuisce invece a NOTICE un ruolo esplicito nella conservazione delle attribuzioni. Tenerlo è utile per titolare, scelta only e rimandi; non aggiunge condizioni. Gli avvisi originari delle dipendenze Apache restano dovuti e non sono cancellati.

Le vecchie attribuzioni APK sono riportate letteralmente, in inglese, come documento storico conservato. Una premessa italiana chiarisce che `talos.onnx`, dichiarato opera del progetto, segue ora la decisione AGPL dell'owner, mentre la precedente dichiarazione Apache riguarda le copie già concesse. Il lotto non modifica i file mobile, i pesi o le licenze dei modelli altrui.

### Pin ed evidenza dei byte

| Oggetto | Pin / impronta |
| --- | --- |
| LICENSE GNU | Versione 3, 19/11/2007; **34.523 byte**, 661 righe, LF; SHA-256 `0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0` |
| Copia di ricerca | [R05A-agpl-3.0-ufficiale.txt](R05A-agpl-3.0-ufficiale.txt), identica byte per byte a LICENSE; zero righe del titolare aggiunte al testo GNU |
| llama.cpp | b10517, commit `dc72703fc69698b1ea68ece8d2dd8a96e6a4e1fe`; [LICENSE del tag](https://raw.githubusercontent.com/ggml-org/llama.cpp/b10517/LICENSE) scaricato con Node: **1.078 byte**, SHA-256 `94f29bbed6a22c35b992c5c6ebf0e7c92f13b836b90f36f461c9cf2f0f1d010d`, identico a `desktop/assets/llama-LICENSE.txt` |
| Electron | 44.3.0; [LICENSE upstream](https://raw.githubusercontent.com/electron/electron/v44.3.0/LICENSE) MIT e copia installata letti |
| node-pty | 1.1.0; [LICENSE upstream](https://raw.githubusercontent.com/microsoft/node-pty/v1.1.0/LICENSE) letto con tutte le attribuzioni, non soltanto la prima |
| sqlite-vec | 0.1.9; [LICENSE-MIT del tag](https://raw.githubusercontent.com/asg017/sqlite-vec/v0.1.9/LICENSE-MIT), alternativa scelta per il metadato `MIT OR Apache` |
| png-js | 1.1.0 nel lock e nel pacchetto locale; MIT in `harness-ui/node_modules/png-js/LICENSE`. Il percorso remoto `v1.1.0/LICENSE` restituisce 404: il rimando documentale è al [LICENSE corrente](https://raw.githubusercontent.com/foliojs/png.js/master/LICENSE), concordante; l'evidenza della versione esatta è il file incluso nel pacchetto e la sua impronta nell'audit |

Non è stata installata alcuna libreria di controllo licenze: audit mediante lettura JSON, scelta permessa dal brief. Nessun parser SPDX artigianale: le espressioni osservate restano integre e le decisioni sono elencate esplicitamente. Un'espressione nuova o un pacchetto sconosciuto senza licenza produce `DA VERIFICARE` ed exit 1 nello script.

## 3. File cambiati, con righe

Le righe si riferiscono ai file consegnati; nessuna intestazione aggiunta ai sorgenti applicativi.

| File | Righe | Modifica |
| --- | --- | --- |
| `LICENSE` | 1–661 | Sostituito Apache con il documento integrale GNU, senza alterazioni |
| `NOTICE` | 1–15 | Titolarità 2026 Antonino Rizzo; riga only richiesta a 4; tre rimandi alle terze parti e natura informativa |
| `README.md` | 18, 82–88 | Badge AGPL verso LICENSE, spiegazione dell'obbligo di rete, avvisi terzi, telemetria assente |
| `package.json` | 1–3 | Nuovo: solo `license` |
| `harness-ui/package.json` | 3 | Solo aggiunta di `license` |
| `context-engine/package.json` | 3 | Solo aggiunta di `license` |
| `harness-ui/THIRD_PARTY_NOTICES.md` | 28–61 | Electron, node-pty, llama.cpp, png-js, sqlite-vec, testi da conservare e condizioni dell'audit |
| `THIRD_PARTY_NOTICES.md` | 597–662 | Solo append: premessa e parte terze parti del vecchio NOTICE; prime 596 righe preservate |
| `harness-ui/desktop/README.md` | 141 | Una riga sulla versione nel manifesto/tag, senza VERSION separato |
| `harness-ui/desktop/CHANGELOG.md` | 1–35 | Nuovo changelog desktop, senza modificare il CHANGELOG mobile radice |
| `harness-ui/desktop/tests/licenza.test.mjs` | 1–62 | Nuovo test puro: titolo e hash GNU, quattro manifesti, README, changelog e suoi rimandi; otto casi eseguiti |

File verificati senza modifiche: `harness-ui/README.md`, `harness-ui/desktop/package.json`, `harness-ui/desktop/assets/llama-LICENSE.txt`, tutti i lock e tutti i manifesti esclusi. Versione desktop invariata `0.1.0`.

### Evidenze create in .claude

| File | Contenuto |
| --- | --- |
| `LEDGER-R05A-LICENZA-AGPL-2026-09-13.md` | Piano, ricerca iniziale, emendamenti, scenari RED/GREEN, rollback |
| `RAPPORTO-R05A-LICENZA-AGPL-2026-09-13.md` | Questo rapporto |
| `R05A-agpl-3.0-ufficiale.txt` | Download GNU originale |
| `R05A-audit-licenze.mjs` | Audit locale ripetibile, senza rete né installazioni |
| `R05A-audit-licenze.json` | Tutte le 448 occorrenze, versioni, integrità, decisioni, hash dei lock e campioni legali |
| `R05A-verifica.mjs` | Controlli di integrità/perimetro, interrogazioni npm offline e generazione dei soli diff di handoff |
| `R05A-verifica.json` | Risultati e output dei quattro `npm pkg get license` |
| `R05A-base-file.json` | Snapshot precedente alle modifiche dei file pertinenti e dei manifesti/lock inventariati |
| `R05A-red.log` | Prova iniziale: sei fallimenti attesi su sette casi |
| `R05A-test-puri.log` | Log completo della suite finale, comando, data e codice uscita |
| `R05A-red-riferimenti.log` | RED della regressione sui due rimandi del changelog: sette verdi, uno rosso |
| `R05A-handoff.diff` | Diff non applicati dei file fuori perimetro |

## 4. Audit delle dipendenze

Lettura dei campi `packages[*].license` dei quattro lock. Escluse le voci radice `packages[""]` e i link; incluse dipendenze di sviluppo, transitive e varianti per piattaforme non Windows. Il conteggio è per **occorrenza nel lock**, non per nome/versione unici né per file realmente contenuti nell'installer. Una licenza OR conta una volta, non due.

| Licenza / espressione originale | Backend | Frontend | Desktop | Contesto | Totale | Valutazione |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| MIT | 80 | 33 | 213 | 1 | 327 | Compatibile, conservare avvisi |
| ISC | 5 | 1 | 36 | 0 | 42 | Compatibile |
| Apache-2.0 | 14 | 3 | 6 | 0 | 23 | Compatibile con obblighi di attribuzione/NOTICE |
| MPL-2.0 | 0 | 1 | 13 | 0 | 14 | Condizionata, vedi sotto |
| BSD-3-Clause | 0 | 0 | 9 | 0 | 9 | Compatibile |
| BlueOak-1.0.0 | 1 | 0 | 8 | 0 | 9 | Permissiva, conservare testo/link |
| BSD-2-Clause | 0 | 0 | 6 | 0 | 6 | Compatibile |
| MIT OR Apache | 0 | 0 | 0 | 6 | 6 | sqlite-vec: scegliere MIT; metadato non SPDX |
| 0BSD | 2 | 0 | 1 | 0 | 3 | Compatibile |
| (AFL-2.1 OR BSD-3-Clause) | 1 | 0 | 0 | 0 | 1 | json-schema 0.4.0: scegliere BSD-3-Clause |
| (MIT OR GPL-3.0-or-later) | 1 | 0 | 0 | 0 | 1 | jszip 3.10.1: scegliere MIT |
| (MIT AND Zlib) | 1 | 0 | 0 | 0 | 1 | pako: conservare entrambi i testi/obblighi |
| Campo assente | 1 | 0 | 0 | 0 | 1 | png-js 1.1.0: MIT dal LICENSE incluso |
| Python-2.0 | 0 | 0 | 1 | 0 | 1 | argparse 2.0.1: compatibile |
| WTFPL OR ISC | 0 | 0 | 1 | 0 | 1 | Scegliere ISC |
| WTFPL | 0 | 0 | 1 | 0 | 1 | Compatibile |
| (MIT OR CC0-1.0) | 0 | 0 | 1 | 0 | 1 | Scegliere MIT |
| (WTFPL OR MIT) | 0 | 0 | 1 | 0 | 1 | Scegliere MIT |
| **Totale** | **106** | **38** | **297** | **7** | **448** | |

**Elenco delle incompatibilità senza alternativa nei quattro lock: nessuna rilevata.** SSPL: 0; BUSL: 0; CC-BY-NC: 0; Elastic: 0. La presenza di AFL in una scelta OR non rende incompatibile `json-schema`: la scelta BSD è disponibile. Non è stata rimossa o aggiornata alcuna dipendenza.

**MPL:** `axe-core@4.13.0` e `@resvg/resvg-js@2.6.2` con 12 varianti native, tutti di sviluppo in questi lock. Nei testi applicativi/README locali ispezionati non è stato trovato un avviso applicato di incompatibilità; la MPL integrale include il modello Exhibit B. Sono letti i testi installati; le varianti per altre piattaforme non sono tutte installate. L'esito resta condizionato alla conservazione della MPL e dei relativi sorgenti ove dovuti, non una certificazione di ogni binario opzionale upstream.

**Metadati incompleti:** una voce senza license risolta tramite testo incluso (`png-js`), sei voci `MIT OR Apache` risolte scegliendo la MIT upstream di `sqlite-vec@0.1.9`. Nel worktree `context-engine/node_modules` è assente; non è stato installato. Il lock e il testo upstream del pin sono l'evidenza, non un caricamento dei sei addon.

### Avvisi del monorepo oltre ai quattro lock

Sono state lette tutte le sezioni dei due THIRD_PARTY_NOTICES richiesti e, per il contesto, anche `context-engine/THIRD_PARTY_NOTICES.md`. Questi avvisi includono altri prodotti, container e strumenti; non vanno sommati ai 448 pacchetti npm.

| Famiglia / componenti presenti negli avvisi | Esito pertinente |
| --- | --- |
| Apache-2.0 e MIT: artifact-worker, Podman, Compose, Tika, SDK MCP, OCR, vLLM, parser PHP, strumenti UI e adapter | Nessuna restrizione incompatibile identificata nella licenza dichiarata; le dipendenze dei binari/container mantengono testi propri |
| MPL-2.0: Public Suffix List | Preservare il testo e gli obblighi sui file; il lotto non modifica la copia del control-plane |
| AGPL-3.0-or-later: SearXNG | È disponibile la scelta v3; sidecar separato con i propri obblighi di sorgente e rete, non rilicenziato dal NOTICE di TALOS |
| GPLv2: ClamAV 1.5.3 | L'[upstream COPYING](https://github.com/Cisco-Talos/clamav/blob/clamav-1.5.3/COPYING.txt) è GPLv2. Non presumere la combinabilità di GPL-2.0-only con AGPLv3, né dedurre or-later dall'appendice del testo. L'architettura documentata è un sidecar via clamd INSTREAM, non codice incorporato; la GPL propria resta applicabile alla sua distribuzione |
| Docker Subscription Service Agreement: Docker Desktop | Non è una licenza per incorporare il prodotto in un'opera AGPL. Gli avvisi dichiarano download opzionale dal fornitore dopo accettazione e nessuna redistribuzione dell'installer da TALOS. Conservare quel confine; la clausola non diventa AGPL |
| OFL-1.1: Noto Sans CJK e font APK | I font mantengono OFL e nomi riservati. [OFL §2/§5](https://spdx.org/licenses/OFL-1.1.html) consente il bundling, ma non la loro conversione in AGPL; non presentarli come codice AGPL |
| Python/PSF, HPND, BSD, MIT OR Apache: pacchetti OCR e PDFium | Conservare le licenze e gli avvisi dei wheel, di PDFium e delle dipendenze; inventario pip/container non ricostruito in questo lotto |
| Apache-2.0 con LLVM Exception, MIT, BSD a 2/3 clausole: librerie APK | Attribuzioni precedenti preservate; il cambio TALOS non modifica questi permessi |

Di conseguenza **«zero licenze incompatibili in tutto ciò che è nominato nel monorepo» sarebbe una conclusione scorretta**. Sono presenti condizioni non assorbibili in AGPL (accordo Docker, copyleft dei font e rischio GPLv2-only per un'eventuale incorporazione di ClamAV), gestite come componenti separati. Nessuna evidenza di un'incorporazione vietata emerge dal perimetro richiesto; non è stata svolta una verifica legale di ogni sorgente o un inventario completo dei container.

Se un futuro audit trova SSPL/BUSL/NC/Elastic senza alternativa compatibile: registrare pacchetto, versione, percorso e testo, fermare la distribuzione dell'opera combinata interessata e sottoporre all'owner sostituzione, permesso distinto o architettura effettivamente separata. Non rimuovere il componente né cambiare il suo campo license per nascondere il problema. Per BUSL verificare anche Change Date e Change License.

### Impronte dei lock analizzati e lasciati intatti

| Lock | SHA-256 |
| --- | --- |
| `harness-ui/package-lock.json` | `9916a46d4f712a52296b1a5da202d951e4746f0bc67db838e16abe02980bbc4c` |
| `harness-ui/frontend/package-lock.json` | `1f06b3ee719fda69249cd9cb0a1be79104c9d0cf7c1ef152dfed2c4aeffc6366` |
| `harness-ui/desktop/package-lock.json` | `3d10d02f7c3364a11363b80da9452b08ef6289c8fc94cd94ee297651b9b3f38d` |
| `context-engine/package-lock.json` | `9070e21a3af9a6c91d5b6c5ace1fe8df27ebf4f140cb3a475ba9406d7bf60ab6` |

## 5. Manifesti e handoff

| Manifesto | Licenza trovata | Esito R-05A |
| --- | --- | --- |
| `package.json` | File assente | Creato: AGPL-3.0-only |
| `harness-ui/package.json` | Campo assente | Aggiunto AGPL-3.0-only |
| `context-engine/package.json` | Campo assente | Aggiunto AGPL-3.0-only |
| `harness-ui/desktop/package.json` | AGPL-3.0-only | Intatto, verificato |
| `artifact-worker/package.json` | UNLICENSED | Diff soltanto; non nell'elenco autorizzato |
| `browser-worker/package.json` | Campo assente | Diff soltanto |
| `validator/package.json` | ISC | Diff soltanto |
| `harness-ui/benchmarks/autocompact/package.json` | Campo assente | Diff soltanto, lane benchmark |
| `harness-ui/frontend/package.json` | Campo assente | Diff soltanto, cartella vietata |
| `core/composer.json` | proprietary | Diff soltanto, lane core |
| `control-plane/composer.json` | MIT | Diff soltanto; avvisi Laravel/terzi da preservare |
| `control-plane/package.json` | Campo assente | Diff soltanto |
| `control-plane/vendor-clean/kadmos/core/composer.json` | proprietary | Diff soltanto; preferire la rigenerazione della copia dalla fonte core nella sua lane |
| `human-journey/pyproject.toml` | Campo assente | Diff soltanto; fonte Python TALOS, non dipendenze |
| `ocr-worker/pyproject.toml` | Campo assente | Diff soltanto |
| `mobile/package.json` | Apache-2.0 | Diff soltanto |
| `mobile/packages/contracts/package.json` | Campo assente | Diff soltanto |
| `mobile/packages/design-tokens/package.json` | Campo assente | Diff soltanto |
| `mobile/tools/android-assets/package.json` | UNLICENSED | Diff soltanto |
| `mobile/tools/git-bash-launcher/package.json` | UNLICENSED | Diff soltanto |

Nessun `package.json` di core: il manifesto è Composer. Nessun manifesto di proprietà TALOS sotto docs trovato nell'inventario Git. I `node_modules`, i vendor e gli asset di terze parti non devono ricevere il license del progetto. I lock non erano autorizzati per la scrittura: le lane dovranno allineare i soli metadati del pacchetto radice e le copie locali pertinenti senza risolvere nuove versioni. Anche i lock di harness-ui e context-engine continuano a non avere license nella voce radice; le dipendenze e gli hash restano invariati.

### Diff non applicati

Il file completo [R05A-handoff.diff](R05A-handoff.diff) contiene i diff di `mobile/README.md` e di tutti i 16 manifesti esclusi elencati sopra. Verificato con `rtk proxy git apply --check --unidiff-zero .claude/R05A-handoff.diff`: **exit 0**, senza applicazione. Per Python/Composer la validazione con i rispettivi strumenti appartiene alle lane destinatarie; il controllo eseguito qui riguarda il contesto del diff.

Nel monorepo i riferimenti `mobile/README.md → LICENSE/NOTICE` puntavano a file inesistenti sotto mobile: il diff usa `../LICENSE` e `../NOTICE`. L'eventuale esportazione mobile autonoma di R-05b dovrà adattare i percorsi alla forma pubblica scelta dall'owner.

Diff completo, riportato qui senza applicarlo:

~~~diff
--- a/mobile/README.md
+++ b/mobile/README.md
@@ -17,1 +17,1 @@
-  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="Apache 2.0"></a>
+  <a href="../LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue.svg" alt="AGPL-3.0-only"></a>

--- a/mobile/README.md
+++ b/mobile/README.md
@@ -259,1 +259,5 @@
-[Apache License 2.0](LICENSE). Third-party components and shipped-binary provenance are documented in [NOTICE](NOTICE).
+**AGPL-3.0-only**, come tutto il monorepo TALOS: chi offre una versione modificata in rete deve rendere disponibile gratuitamente agli utenti il codice sorgente corrispondente, comprese le modifiche.
+
+Testo integrale: [LICENSE](../LICENSE). Copyright e terze parti: [NOTICE](../NOTICE) e [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
+
+Telemetria: nessuna.

--- a/artifact-worker/package.json
+++ b/artifact-worker/package.json
@@ -6,1 +6,1 @@
-  "license": "UNLICENSED",
+  "license": "AGPL-3.0-only",

--- a/browser-worker/package.json
+++ b/browser-worker/package.json
@@ -2,1 +2,2 @@
-  "name": "talos-browser-worker",
+  "name": "talos-browser-worker",
+  "license": "AGPL-3.0-only",

--- a/validator/package.json
+++ b/validator/package.json
@@ -14,1 +14,1 @@
-  "license": "ISC",
+  "license": "AGPL-3.0-only",

--- a/harness-ui/benchmarks/autocompact/package.json
+++ b/harness-ui/benchmarks/autocompact/package.json
@@ -2,1 +2,2 @@
-  "name": "talos-autocompact-qualification",
+  "name": "talos-autocompact-qualification",
+  "license": "AGPL-3.0-only",

--- a/harness-ui/frontend/package.json
+++ b/harness-ui/frontend/package.json
@@ -2,1 +2,2 @@
-  "name": "talos-harness-ui-frontend",
+  "name": "talos-harness-ui-frontend",
+  "license": "AGPL-3.0-only",

--- a/control-plane/package.json
+++ b/control-plane/package.json
@@ -3,1 +3,2 @@
-    "private": true,
+    "private": true,
+    "license": "AGPL-3.0-only",

--- a/core/composer.json
+++ b/core/composer.json
@@ -5,1 +5,1 @@
-    "license": "proprietary",
+    "license": "AGPL-3.0-only",

--- a/control-plane/composer.json
+++ b/control-plane/composer.json
@@ -7,1 +7,1 @@
-    "license": "MIT",
+    "license": "AGPL-3.0-only",

--- a/control-plane/vendor-clean/kadmos/core/composer.json
+++ b/control-plane/vendor-clean/kadmos/core/composer.json
@@ -5,1 +5,1 @@
-    "license": "proprietary",
+    "license": "AGPL-3.0-only",

--- a/mobile/package.json
+++ b/mobile/package.json
@@ -115,1 +115,1 @@
-  "license": "Apache-2.0"
+  "license": "AGPL-3.0-only"

--- a/mobile/packages/contracts/package.json
+++ b/mobile/packages/contracts/package.json
@@ -2,1 +2,2 @@
-    "name": "@talos-mobile/contracts",
+    "name": "@talos-mobile/contracts",
+    "license": "AGPL-3.0-only",

--- a/mobile/packages/design-tokens/package.json
+++ b/mobile/packages/design-tokens/package.json
@@ -2,1 +2,2 @@
-    "name": "@talos-mobile/design-tokens",
+    "name": "@talos-mobile/design-tokens",
+    "license": "AGPL-3.0-only",

--- a/mobile/tools/android-assets/package.json
+++ b/mobile/tools/android-assets/package.json
@@ -6,1 +6,1 @@
-    "license": "UNLICENSED",
+    "license": "AGPL-3.0-only",

--- a/mobile/tools/git-bash-launcher/package.json
+++ b/mobile/tools/git-bash-launcher/package.json
@@ -6,1 +6,1 @@
-    "license": "UNLICENSED",
+    "license": "AGPL-3.0-only",

--- a/human-journey/pyproject.toml
+++ b/human-journey/pyproject.toml
@@ -5,1 +5,2 @@
-[project]
+[project]
+license = "AGPL-3.0-only"

--- a/ocr-worker/pyproject.toml
+++ b/ocr-worker/pyproject.toml
@@ -1,1 +1,2 @@
-[project]
+[project]
+license = "AGPL-3.0-only"
~~~

## 6. Test ed evidenze

| Comando / prova | Esito |
| --- | --- |
| `rtk proxy node --test harness-ui/desktop/tests/licenza.test.mjs`, prima delle modifiche ai file legali | **RED: 7 casi, 6 fallimenti attesi e 1 verde** (manifesto desktop già corretto), exit 1; [log](R05A-red.log) |
| `rtk proxy npm --prefix harness-ui/desktop run test:puri` | **41 pass, 0 fail, 0 skipped**, exit 0; circa 18,15 s; [log completo](R05A-test-puri.log) |
| `rtk proxy npm --prefix . pkg get license` | `"AGPL-3.0-only"`, exit 0 |
| `rtk proxy npm --prefix harness-ui pkg get license` | `"AGPL-3.0-only"`, exit 0 |
| `rtk proxy npm --prefix context-engine pkg get license` | `"AGPL-3.0-only"`, exit 0 |
| `rtk proxy npm --prefix harness-ui/desktop pkg get license` | `"AGPL-3.0-only"`, exit 0 |
| `rtk proxy node .claude/R05A-audit-licenze.mjs` | 448 occorrenze, nessuna espressione nuova non valutata; exit 0 |
| `rtk proxy node .claude/R05A-verifica.mjs` | **VERDE**: solo license cambia nei due manifesti esistenti; root minimale; 30 file campionati intatti, inclusi lock/manifesti esclusi e README harness; confronto binario GNU; avvisi precedenti conservati |
| `rtk proxy git diff --check` | Exit 0 |
| `git rev-parse HEAD` e `git diff --cached --name-only`, tramite RTK | Base immutata e indice vuoto; nessun commit |

Le quattro interrogazioni npm della verifica sono eseguite con modalità offline e notifica aggiornamenti disabilitata. Il runner è Node **24.18.0**. La prima suite ha stampato un avviso npm di aggiornamento: nessun aggiornamento o installazione è stato eseguito.

La verifica finale ha trovato due collegamenti del nuovo changelog con un livello padre di troppo. Aggiunto il caso permanente **R05A-RIFERIMENTI-CHANGELOG**, riprodotto il RED (8 casi: 7 verdi, 1 rosso) e corretti i due percorsi prima della suite finale da 41 test.

I test nuovi sono puri, risolvono i file da `import.meta.url` e non dipendono dalla directory corrente. Il controllo del LICENSE include il titolo **e l'hash dell'intero documento**, impedendo che un'intestazione corretta nasconda un testo troncato. Il README è controllato fuori da eventuali sezioni terze parti. Nessun test apre il prodotto, nessun avvio di server sulla porta 4174.

Non eseguiti build installer, installazione, suite backend/frontend, modelli o provider: il lotto cambia metadati e documentazione; la suite pura desktop copre i contratti toccati e quelli di packaging già esistenti. Nessuna spesa e nessuna pubblicazione. Gli installer già prodotti restano quelli vecchi e non sono qualificati come artefatti AGPL R-05A.

## 7. Changelog e limiti della release

Le voci sono tratte da `.claude/RAPPORTO-R01-GUSCIO-ELECTRON-2026-09-13.md`, `harness-ui/desktop/LEDGER-R02.md`, `.claude/RAPPORTO-R02-INSTALLER-2026-09-13.md`, `.claude/RAPPORTO-R04-CI-WINDOWS-2026-09-13.md` e `harness-ui/desktop/LEDGER-R06.md`.

La misura **145,0 MiB / 611 MiB / 3,82 s** è quella storica R-06 del pacchetto R-02, sulla macchina dell'owner Windows 11 Pro 26200, Ryzen 7 7800X3D, circa 32 GB RAM. Il tempo misura il lancio Playwright dell'EXE installato alla prima finestra; non un doppio clic comprensivo di SmartScreen. Non è stato rimisurato in questo lotto. R-04 documenta anche un altro installer locale leggermente diverso (152.074.299 byte): non viene confuso con quello da 152.067.178 byte di R-06.

I limiti restano espliciti: non firmato, possibile SmartScreen, Windows 10 1809+ dichiarato ma non ancora provato, Vulkan opzionale e prova su macchina priva di driver ancora aperta, nessun modello incluso, nessun auto-update o telemetria. Il job GitHub e i cancelli di regressione rimasti aperti nei rapporti precedenti non diventano verdi grazie al cambio di licenza.

## 8. Proposta di intestazioni per decisione dell'owner

**Nessuna intestazione è stata applicata.** Per i soli sorgenti di proprietà TALOS, proposta breve da adattare alla sintassi di commento del linguaggio, conservando shebang, dichiarazioni PHP e attribuzioni esistenti:

```text
Copyright (C) 2026 Antonino Rizzo
SPDX-License-Identifier: AGPL-3.0-only

Questo file fa parte di TALOS ed è distribuito esclusivamente secondo la
GNU Affero General Public License, versione 3. Si veda LICENSE alla radice.
Distribuito senza alcuna garanzia, incluse commerciabilità e idoneità a uno
scopo particolare, nei limiti previsti dalla licenza.
```

L'anno deve riflettere la storia effettiva del file; eventuali altri titolari conservano la loro riga. Si può adottare l'avviso esteso raccomandato dall'appendice GNU, specificando **versione 3 soltanto**, senza aggiungere «or later». Un contatto del titolare verificato e il collegamento al sorgente pubblico andranno definiti insieme a R-05b; non sono inventati qui.

Cartelle candidate, ciascuna con revisione della lane proprietaria: `harness-ui/desktop/`, `harness-ui/src/`, `harness-ui/frontend/src/`, `context-engine/src/`, `core/src/`, `control-plane/app/`, `control-plane/routes/`, `control-plane/database/`, `validator/src/`, `artifact-worker/src/`, `browser-worker/src/`, `ocr-worker/`, `human-journey/`, `mobile/src/`, `mobile/packages/`, `mobile/tools/`, `mobile/android/app/src/`, `scripts/`. Tutte queste cartelle esistono nel worktree; il lotto successivo dovrà enumerare i singoli file posseduti.

Escludere dal trattamento automatico dipendenze, copie vendor, codice generato, fixture upstream, file di licenze, font, modelli e librerie native. `docs/` richiede una decisione separata sul modo di esprimere gli avvisi nella documentazione, senza modificare i testi di terzi. I JSON non accettano commenti: usare i metadati previsti dal formato.

## 9. Testo di commit proposto e rollback

**Solo proposta, non eseguita:**

```text
chore(release): adotta AGPL-3.0-only e documenta desktop-v0.1.0

Sostituisce LICENSE con il testo GNU integrale e dichiara AGPL-3.0-only
in NOTICE, README e manifesti autorizzati, preservando gli avvisi terzi.
Aggiunge il changelog desktop non rilasciato e il test puro di coerenza.
Documenta 448 occorrenze nei lock, le condizioni di compatibilità e i
diff non applicati per i manifesti delle altre lane.

Verifica: suite pura desktop 41/41, quattro npm pkg get license,
confronto binario del testo GNU e git diff --check.
```

Rollback a cura dell'owner: confrontare gli 11 file del prodotto/documentazione con la base e rimuovere solo gli hunks R-05A o i tre file nuovi del prodotto. Lo snapshot locale documenta le versioni precedenti. Non usare reset globale né sovrascrivere i due file di consegna preesistenti. Nessun tag o artefatto pubblico è stato creato da annullare.

## Cosa deve fare l'owner · Cosa faccio io · Cosa rimane

**Cosa deve fare l'owner:** esaminare il diff, affidare i diff non applicati alle lane competenti, decidere le intestazioni e la forma pubblica R-05b. Prima del tag, chiudere i cancelli di release e rigenerare installer/staging con la nuova fonte legale, conservando licenze e avvisi upstream e rendendo disponibile il sorgente corrispondente alla distribuzione.

**Cosa faccio io:** consegno i file autorizzati, il test verificato, audit ripetibile e fonti, hash e diff di handoff su disco. Non eseguo operazioni di indice, commit, push o pubblicazione.

**Cosa rimane:** allineamento nelle lane escluse e nei metadati radice dei lock, decisione sui sorgenti, sistemazione separata dei marcatori preesistenti in `.gitattributes`, prova Licensee nel repository pubblico e nuova build qualificata. L'audit copre i quattro lock e gli avvisi richiesti; non certifica l'intera catena binaria Electron/Chromium, pip, Composer, container o mobile. R-05A è verificato nel suo perimetro autorizzato, senza dichiarare completato R-05b.
