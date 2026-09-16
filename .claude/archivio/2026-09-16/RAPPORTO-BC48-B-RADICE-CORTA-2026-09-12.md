# BC-48 B · radice corta e istruzioni per cartella · 12/09/2026

## Registro di esecuzione prima delle modifiche

Sottosistema: istruzioni del repository e prove del contesto desktop. Astra opera da sola nel worktree assegnato `C:/Users/Antonino/AppData/Local/Temp/claude/wt-astra-bc48b`, HEAD distaccato `ae844651eb5751699f6f079fd982e7c23ea17239`; il checkout Desktop e il ramo `lane/harness-desktop` non vengono modificati direttamente. La `.claude/` di radice è scrivibile. I quattro documenti di approvazione/rapporto C e A erano già non tracciati e restano intatti. Nessun comando di staging, commit o push; nessun accesso alla porta 4174.

Autorizzazione: tabella owner 19:20 e testi owner 19:30, senza riapertura delle decisioni. Nessun `AGENTS.md` o `CLAUDE.md` esiste nelle quattro cartelle destinatarie. Il file iniziale ha 11.480 byte, 172 righe, 17 sezioni `##` più il titolo principale; SHA-256 `d7b56001cc35767f889d4aa4f40decb2a3cebab78fcc97c11eb929ba9493b9ac`.

File esatti da modificare:

- `AGENTS.md`: sezioni sempre 1, 2 sintetica in tre righe, 4, 9 senza Laravel, 10 primo capoverso, 14, 16 e 17 sola frase finale; sezioni a indice 3 riscritta, 5, 6, 7, 8 senza viewport e 12.
- `harness-ui/tests/istruzioni-di-progetto-indice.test.mjs`: fissare la caratterizzazione storica di A alla fixture originale; la nuova prova B verifica il disco corrente.

File esatti da creare:

- `core/AGENTS.md`: dettaglio core e Kadmos, benchmark, parsing completo, verifica core e trasversale.
- `validator/AGENTS.md`: dettaglio validator, tre regole generiche di parsing/Zod, verifica validator e trasversale.
- `control-plane/AGENTS.md`: dettaglio Laravel/TALOS, routing Laravel, quattro esempi reali, regole UI Laravel, verifica backend/UI e trasversale.
- `harness-ui/AGENTS.md`: testo approvato verbatim, seguito dalla regola regressioni UI con viewport desktop 1024×800 e 1440×900.
- `harness-ui/tests/istruzioni-di-progetto-cartelle.test.mjs`: scenari permanenti BC48-B per entrambe le catene, radice/core/validator, sezioni sempre e indice con coordinate fisiche, conservazione delle righe, testi approvati, attivazione della sezione 12 e isolamento dei percorsi.
- `harness-ui/tests/fixtures/bc48-b-prima.json`: istantanea immutabile dell'originale, dei due testi approvati e delle misure prima, inclusa mappa/scheda desktop congelata.
- `harness-ui/tests/fixtures/bc48-b-misure.mjs`: funzioni di prova `leggiPrima`, `misuraTesto`, `misuraCatene`; costanti `RADICE`, `FILE_ISTRUZIONI`; CLI di cattura e confronto, con cancello esplicito del bersaglio.
- `harness-ui/tests/fixtures/bc48-b-dopo.json`: misure riproducibili dopo e valutazione del bersaglio.
- `.claude/RAPPORTO-BC48-B-RADICE-CORTA-2026-09-12.md`: questo registro, riconciliazione, risultati, limiti e consegna.

Nessuna eliminazione, dipendenza, migrazione o modifica di simboli pubblici del prodotto. Restano identici `trovaIstruzioniDiProgetto`, `testoIstruzioniDiProgetto`, `istruzioniDiProgetto`, `analizzaSezioniIstruzioni`, `rendiFileIstruzioni`, `creaIniettoreSezioni`, `collegaSezioniAiContextHooks`, `contestoDelProgetto` e i relativi contratti.

Metadati: `<!-- talos: sempre -->` per tutte le sezioni sempre, eccetto la prima già riconosciuta da A. Soltanto la sezione 12 ha cartelle esplicitamente associate nella tabella: `<!-- talos: paths: core/**, control-plane/**, harness-ui/** -->`. Sezioni 3, 5, 6, 7 e 8 restano a richiesta senza glob: la menzione delle lane nella 3 è un vincolo di ownership, non un'assegnazione di attivazione. Nessuna assegnazione nuova per la 8. I dettagli spostati sono selezionati dalla catena, senza duplicare glob.

RED previsto: mancano i quattro file locali, le sezioni sempre e la sezione 3 nuova; il testo radice contiene ancora i dettagli locali. GREEN: `rtk proxy node --test tests/istruzioni-di-progetto*.test.mjs tests/contesto-del-progetto*.test.mjs` da `harness-ui/`. Regressioni adiacenti: `tests/sezioni-per-percorso.test.mjs` e `tests/preambolo-quattro-blocchi.test.mjs`. Controllo trasversale: `rtk proxy git diff --check` più controllo dei nuovi file. Il cancello ≤900 token resta separato dalle prove funzionali e deve riportare lo sforamento se presente.

Gate upstream reale: caricatore, parser e `node:path.posix.matchesGlob` di A eseguiti con Node v24.18.0 e i file veri, senza trasporto di modello. Prova leggibile: indice e blocchi prima/dopo salvati nelle fixture, righe riconciliate in questo rapporto. Non serve avviare server o build per uno spostamento di istruzioni. Rollback proposto: ripristinare soltanto il contenuto originale dalla fixture e rimuovere le sole aggiunte B dopo revisione dell'owner; nessun ripristino eseguito.

## Ricerca primaria e decisione upstream

Letti i rapporti C e A e il dossier `.claude/RICERCA-BC48-ISTRUZIONI-DI-PROGETTO-2026-09-12.md`. Verifica web rinnovata il 12/09/2026 prima delle modifiche:

- [AGENTS.md](https://agents.md/): Markdown ordinario e istruzioni per pacchetto; il file più vicino prevale, le richieste esplicite della persona hanno precedenza.
- [Claude Code nei monorepo](https://code.claude.com/docs/en/large-codebases): istruzioni generali alla radice e istruzioni locali presso i pacchetti.
- [Claude Code, memoria](https://code.claude.com/docs/en/memory): regole per percorso e commenti HTML esterni al codice esclusi dall'iniezione.
- [Documentazione ufficiale OpenAI, AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md): catena dalla radice al cwd, al massimo un file per directory, precedenza del più specifico. Verificato con la skill `openai-docs`.

Decisione: adottare la disposizione Markdown approvata e adattarla tramite l'adapter AVM già consegnato da A. Nessun nuovo interprete, formato o pacchetto. Codex e Claude sono riferimenti della disposizione, non dipendenze eseguite da questi test. Il commento `talos: paths` appartiene ad A e non è presentato come sintassi nativa di altri agenti.

Pin esatto: Node v24.18.0; HEAD sopra; SHA-256 di `harness-ui/src/istruzioni-di-progetto.mjs` = `a0c2c9dec9d119799e3bc02b1aee99ffa996d2c141ba679345f7309495a29cff`, `harness-ui/src/sezioni-istruzioni.mjs` = `323b1bb67bc8e9151eb6bcc6ff91064569e628656ac4ade01e00e2be6554732e`, `harness-ui/src/contesto-del-progetto.mjs` = `5aec0670f0d81fc545112ae4f2a0a36a5359e76e76f39bf63d403a6cb615d030`. Pagine ufficiali consultate alla data indicata, senza versionamento immutabile pubblicato. Nessun codice upstream copiato, nuova licenza o installazione.

## Risultato

**Spostamento B applicato e verificato; bersaglio del preambolo ≤900 token NON raggiunto.** Le prove funzionali finali sono 87/87, senza saltati o TODO. Il cancello quantitativo separato termina con codice 1: non è un GREEN né una misura di risparmio.

La radice scende da 172 a 140 righe e da 11.480 a 9.058 byte su disco. Le otto sezioni sempre costano 2.170 byte dopo la rimozione dei commenti; con la premessa originale di 290 byte sono 2.460 byte. Le sei sezioni a richiesta rimangono conservate per intero nel sorgente. I quattro file locali hanno meno di 60 righe e vengono quindi caricati interi dal comportamento già esistente di A.

Il testo approvato desktop è copiato senza modifiche alle righe 1–35. La sola aggiunta è la regola UI alle righe 37–39. I riferimenti alla 4174 nel testo approvato restano verbatim; il divieto specifico di questo lotto prevale per Astra e nessuna chiamata è stata eseguita. La frase sui tre fallimenti kernel preesistenti è conservata come istruzione approvata, non certificata da una nuova esecuzione del kernel completo.

## Riconciliazione completa: sezione → righe originali → destinazione

Coordinate inclusive del disco. Per le sezioni si indicano titolo e contenuto fino all'ultima riga non vuota; l'indice nella sezione successiva comprende anche la riga vuota finale, come richiede A. `radice` significa `AGENTS.md`. Le righe vuote sono separatori, non eccezioni di contenuto.

| Sezione | Righe originali | Destinazione e righe dopo B | Trattamento |
|---|---|---|---|
| Titolo e premessa | 1–3 | radice 1–3 | Identici |
| 1 · Non-Negotiable User Rule | 5–9 | radice 5–9 | Sempre, identica |
| 2 · Architecture Boundaries | 11–17 | radice 11–16 | Sintesi autorizzata in tre punti, con tutti i cinque confini |
| 2 · Core PHP e Kadmos | 13, 17 | `core/AGENTS.md` 5–6, titolo 3 | Frasi originali integrali |
| 2 · Validator | 14 | `validator/AGENTS.md` 5, titolo 3 | Frase originale integrale |
| 2 · Laravel e TALOS UI | 15–16 | `control-plane/AGENTS.md` 5–6, titolo 3 | Frasi originali integrali |
| 3 · Persistent Three-Lane Collaboration | 19–32 | radice 18–31, Persistent Lanes And Delegation | Riscrittura approvata verbatim; su richiesta |
| 4 · Before Coding | 34–40 | radice 33–40 | Sempre, cinque punti identici |
| 5 · Code-Level Planning Ledger | 42–59 | radice 42–59 | Identica; su richiesta, senza path |
| 6 · Standards-First Engineering | 61–83 | radice 61–83 | Identica; su richiesta, senza path |
| 7 · Direct Open-Source Integration | 85–90 | radice 85–90 | Identica; su richiesta, senza path |
| 8 · Regression Prevention, prima parte | 92–96 | radice 92–96 | Identica; su richiesta, senza path |
| 8 · Regola UI | 97 | `harness-ui/AGENTS.md` 39, titolo nuovo 37 | Sostituisce soltanto «representative desktop and mobile viewports» con «desktop viewports of 1024×800 and 1440×900» |
| 8 · Regression Prevention, seconda parte | 98–100 | radice 97–99 | Identica; su richiesta, senza path |
| 8 · Applicazione mobile | parte mobile della 97 | Proposta per la lane mobile, in questo rapporto | Nessuna scrittura in `mobile/` |
| 9 · Tool Routing, regole universali | 102–108 | radice 101–108 | Sempre; cinque punti identici |
| 9 · Routing Laravel | 109 | `control-plane/AGENTS.md` 10, titolo 8 | Identica |
| 10 · No fake feature rule | 111–113 | radice 110–113 | Sempre; capoverso identico |
| 10 · For TALOS specifically | 115–120 | `control-plane/AGENTS.md` 14–19, titolo 12 | Introduzione e quattro punti identici |
| 10 · Esempi desktop aggiuntivi | testo nuovo approvato | `harness-ui/AGENTS.md` 16–20 | CRUD completo e comportamento reale, verbatim |
| 11 · AVM ON/OFF Benchmark Rule | 122–124 | `core/AGENTS.md` 8–10 | Identica; copia nella lane banco da consegnare al suo owner |
| 12 · State And Context Discipline | 126–130 | radice 115–120 | Identica; indice e path `core/**`, `control-plane/**`, `harness-ui/**` alla 116 |
| 13 · Typed Tool Response Parsing | 132–138 | `core/AGENTS.md` 12–18 | Tutte e cinque le regole identiche, inclusi `fromJson()` e `fromArray()` |
| 13 · Parsing generico/Zod | 132–136 | `validator/AGENTS.md` 7–11 | Titolo e primi tre punti identici; nessuna regola PHP specifica trasferita al validator |
| 14 · Error Handling | 140–144 | radice 122–127 | Sempre; tre punti identici |
| 15 · UI Product Rules Laravel | 146–153 | `control-plane/AGENTS.md` 21–28 | Tutti e sei i punti identici |
| 15 · Regole desktop aggiuntive | testo nuovo approvato | `harness-ui/AGENTS.md` 7–22 | Sistema Calm, temi, menu, etichette, confronto mockup: verbatim |
| 16 · Security And Policy | 155–160 | radice 129–135 | Sempre; quattro punti identici |
| 17 · Verification, titolo e introduzione | 162–164 | titolo in radice 137 e nei file locali; introduzione in core 22, validator 15, control-plane 32 | Nessuna frase eliminata |
| 17 · Comando core | 166 | `core/AGENTS.md` 24 | Identico |
| 17 · Comando validator | 167 | `validator/AGENTS.md` 17 | Identico |
| 17 · Comandi control-plane e UI Laravel | 168–169 | `control-plane/AGENTS.md` 34–35 | Identici |
| 17 · Controllo trasversale | 170 | core 25, validator 18, control-plane 36 | Identico; duplicazione esplicita presso i comandi locali |
| 17 · Report failures honestly… | 172 | radice 140 | Sempre; unica frase della verifica rimasta in radice |
| 17 · Verifica desktop aggiuntiva | testo nuovo approvato | `harness-ui/AGENTS.md` 24–35 | Verbatim |

Prova automatica: l'originale contiene **133 righe non vuote**. Le sole eccezioni del confronto sono le **13 righe non vuote della sezione 3** riscritta e la **riga UI 97**: 14 in totale. Le restanti **119 righe distinte sono tutte presenti** nell'unione dei cinque file, dopo rimozione dei soli spazi esterni. La sintesi della sezione 2 non è un'esenzione: tutte le sue frasi originali sono verificate nelle destinazioni locali. Un secondo test fissa la destinazione di ogni gruppo, così la sola presenza in una cartella sbagliata non basta.

SHA-256 dei testi approvati estratti prima di B: sezione 3 `124bf98baa4050dd4cbb32928e14ac3407d7835cab84d53aeb2214b5a6c25269`; desktop `ebc6b16fa714b984dd24a3626482000c6d1668aa6f870bb084a0cd60d534ab9e`. Copie conservate nella fixture prima e confronto verbatim sui file finali.

## Indice dopo lo spostamento

| Sezione su richiesta | Righe inclusive dopo B | Byte sorgente | Attivazione |
|---|---:|---:|---|
| Persistent Lanes And Delegation | 18–32 | 936 | Lettura su richiesta |
| Code-Level Planning Ledger | 42–60 | 1.028 | Lettura su richiesta |
| Standards-First Engineering | 61–84 | 2.044 | Lettura su richiesta |
| Direct Open-Source Integration | 85–91 | 823 | Lettura su richiesta |
| Regression Prevention | 92–100 | 1.190 | Lettura su richiesta; nessun path |
| State And Context Discipline | 115–121 | 423 | Lettura su richiesta o match delle tre cartelle approvate |

Le coordinate e i byte sono ricavati anche indipendentemente dal parser, enumerando le righe fisiche e i titoli `##`; il test confronta il risultato con il testo reso da A. Su `harness-ui/` il percorso da leggere rimane `../AGENTS.md`. Le prove eseguono anche la lettura reale dell'antenato tramite `discoNode().leggi()`.

La catena desktop è esattamente `AGENTS.md → harness-ui/AGENTS.md`; quella Laravel è `AGENTS.md → control-plane/AGENTS.md`. Radice senza figli, core e validator con il proprio file: verificati anch'essi. Nessun file omesso dal tetto. La sezione 12 si accoda su core, control-plane e harness, non sul validator; il seguito con cronologia ricostruita non la duplica. Sono prove dell'adapter reale con scambi di attrezzi simulati, non conversazioni con un fornitore.

## Byte e token prima/dopo

**Metodo:** byte UTF-8 misurati sul testo completo del blocco istruzioni, inclusi involucro e indice. Token **stimati**, non tokenizzati o fatturati: `ceil(byte/4)` come il rapporto A e `costoElenco(..., {metodo:'stimato'})`, rapporto 3,5 del prodotto. Si riportano entrambi senza confonderli.

| Cwd | Byte prima | Byte dopo | Token stimati /4 prima → dopo | Token stimati prodotto /3,5 prima → dopo |
|---|---:|---:|---:|---:|
| radice | 3.549 | 4.243 | 888 → 1.061 | 1.014 → 1.213 |
| `harness-ui/` | 3.552 | 6.472 | 888 → 1.618 | 1.015 → 1.850 |
| `core/` | 3.552 | 5.707 | 888 → 1.427 | 1.015 → 1.631 |
| `control-plane/` | 3.552 | 5.772 | 888 → 1.443 | 1.015 → 1.650 |

Il prima è stato catturato **prima di modificare gli AGENTS**, con C e A già presenti. La differenza di tre byte fra radice e sottocartelle dipende da `AGENTS.md` rispetto a `../AGENTS.md` nella guida di lettura. La fixture contiene i testi completi prima e dopo e i loro hash, non soltanto i conteggi.

| Preambolo desktop comparabile | Prima | Dopo |
|---|---:|---:|
| Istruzioni | 3.552 byte | 6.472 byte |
| Mappa congelata | 1.126 byte | 1.126 byte |
| Scheda congelata | 351 byte | 351 byte |
| Separatori | 4 byte | 4 byte |
| Totale | **5.033 byte** | **7.953 byte** |
| Token stimati /4 | **1.259** | **1.989** |
| Token stimati prodotto /3,5 | **1.438** | **2.273** |

Per il confronto completo si riusa `separaBlocchi` della fixture C e il criterio di A: mappa con il filtro `.gitignore` reale e scheda con `statoVolatile:false`, senza permesso/modello espliciti e senza esecuzione di Git. Mappa e scheda sono catturate dal vero compositore e poi congelate nei due versi, perché B deve essere l'unica variabile. Il dopo completo è quindi una **ricomposizione comparabile**, non un messaggio inviato da una sessione reale. Il test della catena esegue separatamente anche `contestoDelProgetto` corrente e ne verifica prefisso e diagnostica. Il totale non include istruzioni di sistema/kernel, attrezzi o messaggi della persona.

**Bersaglio NON raggiunto:** 1.989 è sopra 900 di 1.089 token stimati /4; con il criterio del prodotto lo scarto è 1.373. Il blocco istruzioni aumenta di 2.920 byte rispetto ad A, perché prima erano sempre intere soltanto le regole non negoziabili; adesso entrano tutte le sezioni sempre approvate e il file desktop. Anche contando soltanto le sezioni sempre della radice (2.170 byte) e il file desktop (2.199 byte), si hanno già 4.369 byte, cioè 1.093 token stimati /4, prima di premessa, involucro, indice, mappa e scheda. Raggiungere 900 mantenendo questi testi interi e lo stesso meccanismo è incompatibile con questa misura. Non ho abbreviato i testi approvati, eliminato regole o alterato il prodotto per nascondere lo scarto.

Comandi riproducibili da `harness-ui/`:

```powershell
rtk proxy node tests/fixtures/bc48-b-misure.mjs
rtk proxy node tests/fixtures/bc48-b-misure.mjs --verifica-bersaglio
```

Il primo legge il disco e stampa le misure; il secondo esegue lo stesso confronto e restituisce **codice 1** sopra 900. `--salva-prima` è stato usato una volta sola: richiede l'hash originale e apre la fixture con `wx`, quindi non può sovrascriverla. `--salva-dopo` aggiorna esclusivamente la fixture dei risultati. Nessun nuovo stimatore del prodotto.

## Test e controlli

| Esecuzione | Esito |
|---|---|
| Suite richiesta prima delle modifiche | 25/25 superati |
| RED del nuovo `istruzioni-di-progetto-cartelle.test.mjs` | 15 casi: 1 superato, 14 falliti per file, marcatori, testi e snapshot dopo ancora assenti |
| `rtk proxy node --test tests/istruzioni-di-progetto*.test.mjs tests/contesto-del-progetto*.test.mjs` da `harness-ui/`, dopo B | **40/40**, zero fallimenti, saltati o TODO |
| `rtk proxy node --test tests/sezioni-per-percorso.test.mjs tests/preambolo-quattro-blocchi.test.mjs` da `harness-ui/` | **47/47**, zero fallimenti, saltati o TODO |
| `rtk proxy node tests/fixtures/bc48-b-misure.mjs --verifica-bersaglio` | **Fallito, codice 1**: 1.989 / 2.273 token stimati, soglia 900 |
| `rtk proxy git diff --check` | Superato |
| Controllo spazi finali e fine-riga dei file della consegna, inclusi i nuovi non tracciati | Superato |
| Ambito Git, indice Git e hash dei tre moduli del prodotto indicati nel pin | Solo file autorizzati; indice senza modifiche in staging; hash invariati |

**87 test funzionali distinti superati** nelle due batterie finali: 40 + 47, senza sommare i 25 iniziali né ripetere il RED. I 15 nuovi casi B comprendono controllo di provenienza, entrambe le catene complete, altre catene, sempre, indice, conservazione, destinazioni, testi approvati, viewport, quattro casi di path e misure. Il test storico `BC48-A-VERO` diventa `BC48-A-ORIGINALE` sulla fixture certificata: non impone più che il file corrente rimanga a 172 righe dopo uno spostamento autorizzato. Lettura vera, compositore e diagnostica sono ora verificati nei due casi `BC48-B-CATENA-*`.

Nessuna regressione funzionale scoperta dopo lo spostamento. Lo scenario quantitativo permanente **BC48-B-BERSAGLIO** rimane rosso ed è esercitabile con il comando sopra, senza mescolare la soglia alle prove della correttezza della tabella.

Problemi dell'ambiente: `rg` non è disponibile nel PATH; dopo il tentativo iniziale ho usato letture Node e numeri di riga. `rtk git` non trova la configurazione Claude, quindi i comandi sono passati attraverso `rtk proxy git`. Gli avvisi sul file globale Git ignore non accessibile non hanno impedito stato, diff o controlli. Nessuna configurazione personale modificata.

## File toccati con righe

**11 file di questa consegna: 2 modificati e 9 nuovi.** I quattro documenti già non tracciati di C, A e approvazione B non fanno parte delle modifiche del lotto.

| File | Righe | Contenuto |
|---|---|---|
| `AGENTS.md` | 1–140; modifiche da 11, 18, 34, 97, 102, 111, 115, 123, 130, 138 | Radice ridistribuita, otto sezioni sempre e sei a indice |
| `core/AGENTS.md` | 1–25 | Dettagli core/Kadmos, benchmark, parsing e comandi |
| `validator/AGENTS.md` | 1–18 | Dettagli validator, parsing/Zod e comandi |
| `control-plane/AGENTS.md` | 1–36 | Dettagli Laravel/TALOS, quattro esempi reali, UI e comandi |
| `harness-ui/AGENTS.md` | 1–39 | Testo approvato 1–35; viewport/regressioni 37–39 |
| `harness-ui/tests/istruzioni-di-progetto-indice.test.mjs` | 3–5, 76–95 | Test storico A ancorato all'originale |
| `harness-ui/tests/istruzioni-di-progetto-cartelle.test.mjs` | 1–178; casi da 19, 32, 53, 64, 79, 97, 107, 126, 132, 141, 166 | Quindici test B, con quattro istanze del caso path |
| `harness-ui/tests/fixtures/bc48-b-prima.json` | 1–83; originale 2, approvati 4, catene 9, mappa/scheda 67, preambolo 71 | Snapshot prima, testi integrali e hash |
| `harness-ui/tests/fixtures/bc48-b-misure.mjs` | 1–77; lettura 18, misura 22, catene 27, CLI 51 | Misura riproducibile e cancello dei 900 token |
| `harness-ui/tests/fixtures/bc48-b-dopo.json` | 1–80; catene 3, mappa/scheda 64, preambolo 68, bersaglio 75 | Snapshot dopo, testi integrali e hash |
| `.claude/RAPPORTO-BC48-B-RADICE-CORTA-2026-09-12.md` | 1–225 | Registro, dossier, riconciliazione, misure, esiti e consegna |

I nuovi file non compaiono nel normale `git diff --stat` fino allo staging, che è vietato: sono comunque su disco e presenti in `git status --short`. Nessun file di prodotto, `CLAUDE.md`, memoria, `docs/` o `mobile/` modificato. Nessun file locale esistente è stato sovrascritto; i quattro AGENTS di cartella erano assenti.

## Cosa NON ho verificato

- Nessun tokenizer di un modello specifico né `usage` fatturato: tutti i token della tabella sono stime dichiarate.
- Nessuna conversazione reale dal composer, nessun modello o fornitore chiamato, nessun miglioramento della cache attribuito a B. I limiti e C-bis già documentati dai rapporti precedenti restano separati.
- Nessun riavvio, GET, POST, browser o screenshot sulla 4174; nessun server avviato da Astra per questo lotto.
- Nessuna suite completa core PHP, validator, Laravel, frontend, kernel o Playwright: i relativi comandi sono stati trasferiti come testo, senza cambiare quei sottosistemi. Nessuna nuova verifica dei tre fallimenti kernel menzionati nel testo approvato.
- Nessuna prova visiva a 1024×800 o 1440×900: questo lotto scrive la regola, non cambia una superficie UI.
- Nessuna scrittura o verifica nella lane mobile, nessuna integrazione nel checkout Desktop, nessun commit. Il caricamento da CLI esterne Codex/Claude non è stato eseguito; è stata verificata la catena TALOS reale.
- Nessuna copia della sezione benchmark in TALOS-BANCO: la ricognizione delle directory di radice e `git ls-files '*TALOS-BANCO*' '*talos-banco*'` non individuano una cartella con quel nome in questo checkout. Il perimetro autorizzato non include un file della lane banco; la regola originale è integralmente preservata in core.

## Testo da consegnare alla lane mobile e al banco

**Proposta per la lane mobile, non applicata:** «Nella sezione sulle regressioni UI del vostro AGENTS, verificare l'intero percorso visibile prima sul viewport tablet in orientamento verticale adottato dalla lane, poi sugli altri viewport effettivamente supportati. Conservare i controlli di ricaricamento, persistenza, movimento ridotto, tastiera e stati di errore dove pertinenti. Registrare le dimensioni reali larghezza×altezza della lane; 1024×800 e 1440×900 sono le dimensioni desktop e non sostituiscono quelle mobile. La regola proviene dalla riga 97 dell'AGENTS originale, ora conservata per desktop in `harness-ui/AGENTS.md:39`. Nessun file mobile è stato scritto da Astra.»

**Consegna alla lane banco:** «La sezione originale AVM ON/OFF Benchmark Rule è ora in `core/AGENTS.md:8–10`. Copiarla senza variazioni nelle istruzioni di TALOS-BANCO presso il checkout posseduto dalla lane: stesso prompt, modello, contesto, valutatore e log grezzi per ogni confronto ON/OFF. Astra non ha individuato né modificato un AGENTS della lane banco in questo checkout.»

## Testo di commit proposto, non eseguito

```text
BC-48 B: distribuisce le istruzioni approvate fra radice e cartelle

Conserva le regole universali e sei sezioni a indice nella radice;
aggiunge AGENTS per core, validator, control-plane e harness desktop.
Copia i testi approvati per deleghe e desktop, preserva le istruzioni
originali e verifica entrambe le catene con fixture prima/dopo.

87 test funzionali superati. Bersaglio preambolo 900 token ancora aperto:
1.989 token stimati con il criterio di A, senza modifiche al prodotto.
```

## Cosa deve fare l'owner · Cosa faccio io · Cosa rimane

- **Cosa deve fare l'owner:** revisionare gli 11 file e integrare il lotto dal worktree nel ramo `lane/harness-desktop`; eseguire personalmente le eventuali operazioni Git e verifiche sul server. Prendere in carico lo scostamento misurato dal bersaglio e consegnare le proposte ai responsabili mobile e banco.
- **Cosa faccio io:** consegno su disco la tabella applicata, i testi approvati verbatim, 87 test funzionali verdi, il cancello quantitativo rosso e le fixture riproducibili; non eseguo staging, commit, push o accessi alla 4174.
- **Cosa rimane:** raggiungere ≤900 token richiede un lotto separato con perimetro autorizzato compatibile con i testi da mantenere interi; restano inoltre integrazione dell'owner, istruzioni delle lane mobile/banco e verifica con modello/sessione reali. La correttezza dello spostamento è verificata; la chiusura quantitativa di BC-48 resta aperta.
