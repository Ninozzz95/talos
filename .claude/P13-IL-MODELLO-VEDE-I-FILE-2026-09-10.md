# P-13 — far vedere i file al modello: la ricerca ha cambiato il disegno

Owner, 10/09: «p13 ma sempre con ricerca web competitor come da regole», e poi: «hermes claude codex
pi, NON DIMENTICARE NESSUNO».

Fatta. E ha cambiato la proposta: quella del dossier (03/09) diceva «grafo dei simboli con tree-sitter
e ranking PageRank». Dopo aver letto il codice di tutti e cinque e rifatto i conti, **non è la prima
cosa da fare**, e forse non serve affatto.

---

## 1 · Che cosa fanno gli altri, letto NEL CODICE (10/09/2026)

| Chi | Come il modello scopre i file | Fonte |
|---|---|---|
| **Aider** | Mappa precalcolata nel prompt: tag tree-sitter, grafo dei simboli, PageRank personalizzato, budget **1.024 token** (`map_tokens=1024`), moltiplicato ×8 quando in chat non c'è nessun file (`map_mul_no_files=8`) | `aider/repomap.py:49,56,70` nel clone |
| **Claude Code** | **Nessuna mappa.** Attrezzi `Glob`, `Grep`, `Read` più il sotto-agente `Task`; i simboli arrivano da un **LSP**, che però è un **plugin opzionale**, con tetto dichiarato (LRU 50 documenti) e una perdita di memoria già corretta | `CHANGELOG.md` righe 2034, 1326, 425 |
| **Codex** | **Nessuna mappa.** `AGENTS.md` come contesto di progetto e ricerca a richiesta. Usa tree-sitter, ma per la **sicurezza dei comandi** (`command_safety/powershell_tree_sitter.rs`), non per il codice del progetto | clone `codex-rs` |
| **Hermes** | **Nessuna mappa.** `ast-grep` come *skill opzionale*. Il repo map è una **issue aperta**: #535, aperta il 06/03/2026, **nessuna risposta dei manutentori** | `optional-skills/software-development/ast-grep/`, issue #535 |
| **Pi** | **Nessuna mappa e nessun attrezzo di ricerca.** Quattro attrezzi in tutto: `bash`, `edit`, `read`, `write`. Esplora col bash | clone `pi-mono/packages/agent/src` |
| **TALOS oggi** | `elenca` a profondità 2, `cerca` per nome, delega | `talosHarness.mjs` |

⭐ **Quattro su cinque non precalcolano niente**: danno al modello il modo di cercare. Aider è l'unico
con la mappa — ed è anche l'unico dei cinque fermo dal 22/05 (dato del dossier del 03/09). E il
concorrente che l'owner ha messo primo, Hermes, **la sta chiedendo in una issue senza risposta**.

---

## 2 · Il nostro difetto, ripreso alla lettera

Misurato il 22/08: `elenca` arriva a **profondità 2**; i 106 percorsi dei task `storia` stanno a
profondità **4-6**, **zero** a profondità ≤2; e **35 consegne su 35 non nominano nessun file** —
dicono solo quali test sono rossi. ⇒ TALOS non può risolverne nessuno, e non per bravura del modello:
non li **vede**.

E la ragione per cui allora la cura ovvia fu scartata:

> 1.324 file · ~13.489 token per un elenco piatto — contro i **505 token** di attrezzi su cui è
> costruita la scommessa dell'harness. «Un elenco da 13.489 token a ogni giro, per 24 giri,
> distruggerebbe esattamente il vantaggio».

Il ragionamento era giusto **con i numeri di allora**.

---

## 3 · Che cosa è cambiato, e sono due cose misurate

**(a) La cache costa un sesto, e prende.** Misurato il 22/08 sullo stesso banco, tre chiamate
ravvicinate sullo stesso prefisso da 16.811 token: la terza legge **16.768 token dalla cache** e costa
**5,9 volte meno** (`$0,000172` contro `$0,001011`). Listino: `prompt $0,06/M`, `input_cache_read
$0,01/M`. E Z.AI cacheggia **da sé, senza configurazione**.
⇒ Un elenco **che non cambia** è esattamente ciò che la cache ama. I 13.489 token si pagano pieni una
volta, poi valgono ~2.250. Su 24 giri: **~65.000 token equivalenti**, non 323.736.

**(b) La finestra non è più quella.** Il pannello di TALOS oggi dichiara **1.310.700 token** di
finestra: 13.489 sono l'**1%**. Nel 2023, quando Aider costruì la mappa, le finestre erano da 8-32k —
lì un budget di 1.024 token era una necessità, non una scelta di eleganza.

**(c) E sul nostro repo l'elenco costa molto meno.** Misurato oggi su `harness-ui`, con la potatura
(niente `node_modules`, `.git`, `dist`, `public`):

| profondità | file | ~token |
|---|---|---|
| 2 (oggi) | 333 | ~2.600 |
| 3 | 643 | ~6.099 |
| 4 e oltre | 676 | **~6.494** |

Cioè: vedere **tutto** il repo costa ~3.900 token in più di quanto già spendiamo per vederne metà.

---

## 4 · La proposta, e non è quella del dossier

**Prima la cosa piccola: `elenca` profondo, potato e STABILE.**
1. `elenca` guadagna una profondità dichiarata e una potatura (`node_modules`, `.git`, build, binari);
2. l'elenco entra **in testa al prompt, in un punto stabile**, così la cache lo prende;
3. si rigenera **solo** quando i file cambiano (`WorkspaceChanged`), non a ogni giro;
4. la ricevuta del giro dice quanti token è costato, come per ogni altra cosa.

**Poi, solo se non basta, la mappa dei simboli.** Perché la domanda vera è: al modello serve *sapere
che `httpTransport.ts` esiste* (l'elenco), oppure *sapere che cosa contiene* (la mappa)? Sui task
`storia` le consegne dicono quali test sono rossi: sapere che il file esiste sembra sufficiente per
aprirlo. **Sembra** — e finché non lo misuriamo è una supposizione, non un fatto.

⛔ **Il modo di misurarlo esiste già ed è il banco**: pass-rate su `storia` prima e dopo. Oggi è
**0 su 35**. Un elenco profondo che porti quel numero sopra zero prova la tesi; se resta zero, la
mappa serve davvero e si costruisce sapendo perché.

---

## 5 · Che cosa serve da te

**(1)** Comincio dall'elenco profondo (giorni), oppure vuoi direttamente la mappa (settimane)?
La mia raccomandazione è l'elenco: costa poco, si misura sullo stesso banco, e se basta ci risparmia
un grafo con tree-sitter da mantenere per sempre.

**(2)** ⛔ `elenca` vive nel **kernel**, che in questo repo è una copia: come per PO-12, io preparo il
pezzo e portarlo è un tuo gesto.

**(3)** La misura «prima e dopo» su `storia` fa girare il banco e **costa**. Con quale modello e
quante ripetizioni?

## Che cosa NON è stato verificato

Il costo dell'elenco sul corpus `storia` **non** è stato rimisurato oggi: il numero 13.489 viene dalla
misura del 22/08 su 1.324 file. La misura di oggi (~6.494 token per 676 file) è su **questo** repo, ed
è coerente con quella — ma sono due alberi diversi, e dirlo è meglio che sommarli.

---

## ⛔ CORREZIONE del 10/09, sera — «0 su 35» era falso

Ho ripetuto tutto il giorno, in questo documento e nei commit, che il pass-rate su `storia` è **0 su
35**. Misurato sul disco del banco, non è vero:

- **12 task su 35 sono stati misurati**, e **2 sono riusciti** (`storia-1c843dc`, `storia-3d9be1d`,
  fetta Stadio B a 3 ripetizioni);
- gli altri 5 (`esiti-22ago-storia`) fanno 0/5 — quella campagna girò a `quantiPerCorpus: 5`, non su 35;
- **23 task non hanno mai corso.**

⇒ «0 su 35» era «0 su 5, più un buco da 23». È il difetto [[il-banco-non-vede-chi-manca]], che avevo
citato io stesso nel brief dell'agente e poi ripetuto senza verificarlo. **Il PRIMA non si può
saltare** dicendo «tanto sappiamo che è zero»: 23 task non hanno nessun «prima» con cui confrontarsi.

E altre tre cose che la misura ha aggiunto:

1. **La barra non è 4 task, è 7.** Tre prove concordi (bootstrap del banco, McNemar esatto, e il
   pavimento del rumore rimisurato oggi: 22 verdetti su 118 = **18,6%**). «Da 0 a 4» passerebbe la
   soglia del banco e cadrebbe **sotto il rumore che il banco produce da solo** confrontando due
   corse identiche.
2. **Le consegne senza nomi di file sono una scelta, non un difetto**: il generatore dà solo i nomi
   dei test rossi perché «consegne troppo dettagliate gonfiano i tassi» (arXiv:2507.02825).
3. **`glm-5.3-flash` ha 28 endpoint su 25 fornitori** (letto dall'API di OpenRouter oggi). Il caso
   `qwen3.7-flash` — un fornitore solo, campagna contaminata dai 429 — qui è molto più improbabile.
   Non impossibile: nello strumento i 429 restano **non misurati**, mai fallimenti.

**Il preventivo vero**: $0,00794 a giro (dal credito del fornitore, non dal CLI), 105 giri per
condizione a 3 ripetizioni ⇒ **$1,67 per prima+dopo**, circa 10 ore.
