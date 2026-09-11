# LA REGOLA DEL BANCO — riscritta l'11/09/2026

**Autorizzazione owner:** «Se è necessario riscriviamo la regola del banco, per me non è un problema».
**Sostituisce** la regola implicita in uso fino a oggi (verdetto = maggioranza dei tre giri, nessuna
colonna sul contesto, corpus `storia` letto come un blocco solo).
**Implementata in:** `TALOS-BANCO/regolaDelBanco.mjs` · `TALOS-BANCO/guardieDelRilancio.mjs` ·
`TALOS-BANCO/corsaCoding.mjs` · `TALOS-BANCO/harness.mjs` · `TALOS-BANCO/elencoProfondoServe.mjs`.
**Nessuna corsa a pagamento è stata lanciata**, e `esiti/talos.jsonl` non è stato toccato.

---

## 0. PERCHÉ si riscrive, in una riga

**La cura del preambolo (lotto 2) oggi sarebbe INVISIBILE al banco.**

Il lotto 2 sostituisce l'elenco dei file con la mappa delle cartelle + `AGENTS.md`: una stima di
**−15.500/−19.300 token a messaggio** sul primo giro. Il banco di ieri misura «riuscito almeno una
volta» e non registra **né i token del primo giro né i giri usati**. ⇒ Una cura che toglie
quindicimila token può lasciare il pass-rate identico e sembrare **inutile**, oppure spostare uno o
due task e sembrare **decisiva per caso**. Un banco che non può vedere una cura non è un banco.

---

## 1. LA METRICA PRIMARIA DIVENTA `pass^3`

> Riuscito in **tutte e tre** le ripetizioni. `pass@k`, maggioranza e ultimo giro restano
> **accanto**, mai al posto suo.

### Il fatto che la impone, misurato sui 105 giri GIÀ PAGATI

`TALOS-BANCO/esiti-p13-prima-20260910/talos.jsonl`, 35 righe × 3 giri, nessuna corsa nuova
(`node regolaDelBanco.mjs esiti-p13-prima-20260910`):

| lettura | risolti | % | |
|---|---|---|---|
| **`pass^3`** — riuscito tutte e tre le volte | **5/35** | **14,3%** | ⭐ la primaria da oggi |
| maggioranza (2 su 3) | 14/35 | 40,0% | la metrica di ieri |
| ultimo giro (il campo `esito` grezzo) | 11/35 | 31,4% | ⛔ un giro a caso |
| `pass@3` — almeno una volta | 26/35 | 74,3% | ⛔ la più generosa |

**Lo stesso identico disco, letto in quattro modi, dà 5, 11, 14 o 26.** Il rapporto fra la più
generosa e la più severa è **5,2×**. Finché non si dichiara *quale*, «TALOS risolve N task» non è
un'affermazione — ed è il motivo per cui la stessa campagna è comparsa come «0 su 35», «11 su 35» e
«26 su 35» in tre documenti diversi.

Intervallo bootstrap su `pass^3`: **[2,9% ÷ 25,7%]** su 35 task. ⛔ Largo: 35 task non bastano a
separare differenze piccole, e questo va detto *prima* di guardare i numeri di un confronto.

### Le regole operative

1. Il numero che si **pubblica** è `pass^3`. Gli altri tre si stampano accanto, sempre.
2. In **parità vince il fallimento** (regola già in vigore, `verdettoDeiGiri.mjs`): con k pari, metà
   e metà è «metà delle volte», cioè il caso in cui non si può dire di saperlo fare.
3. Se le righe non hanno tutte la stessa `k`, **`pass^3` non ha un nome**: il riassunto dichiara
   `k: null` e nomina le k trovate. Due semantiche sotto un'etichetta sola sono vietate.
4. Una riga senza `giriDelTask` (campagne a 1 ripetizione) **non produce un `pass^3`**: si ricade sul
   suo `esito` e si dichiara `fonte: 'riga'`.
5. Il campo `esito` sulla riga **resta quello che è sempre stato** (l'ultimo giro). Non si riscrive
   nulla: la cura vive nel LETTORE — [[tre-ripetizioni-pagate-una-usata]].

### Le fonti (data + numeri)

- **arXiv:2608.14711**, *Beyond Pass@k: Measuring Reliability and Security of Agentic Code
  Generation*, **11 agosto 2026**: la metrica mal applicata **gonfia i punteggi di 0,85-0,97 in
  punti assoluti** (0,96-0,98 riportato contro 0,00-0,12 corretto); un surrogato a corsa singola
  **non sostituisce** le ripetizioni (Spearman **ρ = 0,417**); nel loro pilota su SWE-bench Verified
  il pass-rate «morbido» è **0,80** contro una risoluzione stretta di **0,20**.
- **arXiv:2603.29231**, *Beyond pass@1: A Reliability Science Framework for Long-Horizon LLM
  Agents*: **k = 3 ripetizioni**, 396 task, 10 modelli, **23.392 episodi**.
- **Terminal-Bench 2.0/2.1** (Harbor, Laude Institute), paper **arXiv:2601.11868 del 17 gennaio
  2026**, 89 task: la classifica gira **almeno CINQUE prove indipendenti per task** (`-k 5`), oltre
  **32.000 prove** su 16 modelli e 6 agenti. ⇒ Le nostre tre sono il **minimo** della disciplina.
- **Indeed Engineering**, *Bootstrap Confidence Intervals for LLM Evaluation*, **8 luglio 2026**:
  con k corse su N input il ricampionamento giusto è il **cluster bootstrap**, e **k = 3 o 5** è la
  finestra oltre cui il guadagno cade. (Già citata in `elencoProfondoServe.mjs`.)

---

## 2. TRE COLONNE NUOVE E OBBLIGATORIE SU OGNI RIGA

| colonna | cos'è | perché |
|---|---|---|
| `tokenPrimoGiro` | token in ingresso della **prima** chiamata al modello: preambolo + consegna | è **la grandezza che una cura sul contesto muove**. Oggi la mediana sul 4174 è **29.148** (BC-07), di cui 17.500-20.600 sono l'elenco dei file |
| `giriUsati` | quante chiamate al modello ha consumato il task | separa **fallito** da **strozzato**: [[talos-esaurisce-i-giri-non-le-capacita]] ha misurato TALOS fallire in 80 s con i giri finiti mentre gli altri ne usavano 332-630 |
| `tempoPrimoTokenMs` | TTFT | ⛔ **oggi NON è misurabile dal banco** — vedi sotto |

Più due che viaggiano con loro: `tempoPrimaRispostaMs` (il surrogato onesto del TTFT) e
`comeFinita` (`concluso` · `giri-esauriti` · `fermato`).

### ⛔ `token.dentro` non è `tokenPrimoGiro`, e la differenza è un ordine di grandezza

Sulla riga esisteva già un campo `token`. ⛔ È la **somma su tutti i giri**: mediana misurata
**182.364** (min 13.681, max 286.245) contro i ~29.148 del primo giro. Confonderli farebbe sembrare
il preambolo il 10-15% di ciò che è.

### ⛔ Il TTFT: si dichiara «non misurato», non si riempie

`onGiro` consegna la risposta **già completa**: da lì si ricava il tempo alla **prima risposta**, non
al primo token. Il TTFT vero vorrebbe `onDelta`, che accende `stream:true` nel corpo della richiesta
— cioè **rompe la parità** fra i due bracci di un prima/dopo. ⇒ Nel banco la colonna resta *non
misurato*; il TTFT vero vive nel record `tipo:'tempi-giro'` di
`harness-ui/src/session-registry.mjs` (BC-07, 11/09: `primoTokenMs`, `giriDelGiro`, `tokenDentro`,
`tokenFuori`, `tokenDaCache`) — sul percorso del **prodotto**, che il banco non attraversa perché
chiama `talosLavora` direttamente.

### ⛔⛔ «Non misurato» non è MAI zero

Nessuna riga scritta prima dell'11/09/2026 porta queste colonne. Un lettore che rispondesse `0`
direbbe «il preambolo non costa niente» su ogni campagna passata — è alla lettera il difetto di
`prompt_tokens_details.cached_tokens`: *«un lettore che non conosce il nome del campo non dice "non
lo so": dice zero»*. ⇒ Ogni colonna torna `{valore, misurato, perche}` e `misurato:false` **non entra
in nessuna media**. Sul disco il campo è **assente**, mai `null`.

### ⛔ E si dichiara CHI non le porta

Solo `talos` ha la sonda (è in-processo, accetta `onGiro`). `claude`, `codex`, `aider`, `hermes`,
`pi`, `dsh` sono sottoprocessi: per loro `giriUsati` arriva solo da `num_turns` (claude-code) e il
resto resta *non misurato*. Il rapporto lo dice per nome — è [[il-banco-non-vede-chi-manca]]
applicato alle colonne invece che ai concorrenti.

---

## 3. IL CORPUS `storia` SI LEGGE PER POPOLAZIONE

### La premessa «0 su 35» è SMENTITA, e va corretta nel file

La tesi scritta in testa a `elencoProfondoServe.mjs` era: *«TALOS risolve 0 dei 35 task del corpus
`storia` perché non vede i file»*. **Falsa** — corretta nel file l'11/09. Misurato:

| popolazione | definizione | task | quota |
|---|---|---|---|
| **CIECHI** | 0 riusciti su 3 | **9** | 25,7% |
| **INSTABILI** | 1 o 2 su 3 | **21** | 60,0% |
| **STABILI** | 3 su 3 | **5** | 14,3% |

⛔ Anche il numero che girava nei documenti — «26 instabili» — va precisato: **26 è *riesce almeno
una volta*** (21 instabili + 5 stabili), non *instabile*. Chi legge «26 instabili» accanto a
`pass^3 = 5` non può far tornare i conti.

**Il difetto dominante non è la cecità: è l'instabilità** (21 task su 35).

### La regola

Ogni metrica si riporta **per popolazione**, mai solo aggregata. Motivo: una cura sulla *cecità*
(mappa delle cartelle, `cerca` migliore) muove i **9 ciechi**; una cura sulla *stabilità* (preambolo
più magro ⇒ meno context rot, più giri disponibili) muove i **21 instabili**. Aggregate in un numero
solo, le due si annullano a vicenda e il banco dice «non serve» a entrambe.

I nove ciechi, per nome — perché un numero senza nomi non è azionabile:
`storia-79ccedf` `storia-b489416` `storia-d254e20` `storia-8a188c4` `storia-d6019cf`
`storia-aa7d2db` `storia-1c843dc` `storia-a395354` `storia-5cad33c`.

---

## 4. IL COSTO: per task RISOLTO, con la risoluzione dichiarata

### ⛔ Il denominatore cambia il numero di cinque volte

Stessa campagna, stesso denaro ($2,2451 sommando i giri prezzati; **$2,5140 secondo il credito**, ed
è il credito che ha ragione — la differenza sono gli **8 giri su 105 rimasti senza prezzo**):

| denominatore | risolti | costo per risolto |
|---|---|---|
| **`pass^3`** | 5 | **$0,4490** |
| maggioranza | 14 | $0,1604 |
| `pass@3` | 26 | $0,0863 |

⇒ Da $0,086 a $0,449. **Il costo per risolto non è un numero finché non si dichiara quale
«risolto».** Da oggi si pubblica quello a `pass^3`.

### ⛔ Mai il costo totale da solo

[[ho-azzoppato-aider-ragionando-sul-costo]]: spenta la repo map «per far costare meno», il costo
totale restava quasi identico e i risolti crollavano 9/15 → 5/15 — il costo per risolto
**raddoppiava**. Dall'esterno lo conferma SWE-bench Pro, dove le classifiche pubblicano il costo per
task risolto ($0,25-$0,55 fra i modelli ospitati).

### La risoluzione si scrive accanto al numero

Misurata il 23/8 col controllo negativo `(nessuno)`, che non chiama nessuna API per costruzione:
**$0,0021 per riga**. Tre harness su sette stavano sotto. ⇒ Un numero che lo strumento non distingue
da zero si scrive `< $0,0021`, non `$0,0014`. **Ogni campagna che pubblica un costo deve far correre
`(nessuno)` e misurare la propria risoluzione** — il valore del 23/8 è un ripiego dichiarato, non una
costante di natura.

Su questa campagna: mediana **$0,0587 per riga**, cioè **28× la risoluzione**. Il costo è leggibile.

---

## 5. LE TRE RIPETIZIONI RESTANO TRE FINCHÉ UNA MISURA NON DICE ALTRO

Si sale a cinque **solo se**, sul confronto fra due bracci:
l'intervallo appaiato **contiene lo zero** *e* i discordanti sono **meno di 6**.

Motivo: con b discordanti tutti dalla stessa parte il McNemar esatto dà `p = 2·(1/2)^b`, che scende
sotto 0,05 solo da **b = 6** in su. Con 6 o più discordanti il test **poteva già decidere**: se non
decide, i due bracci non sono diversi — e spendere il doppio non cambia quella risposta.
⛔ Il verso contrario conta quanto il dritto: `servonoPiuRipetizioni()` risponde **no** anche quando
il segnale c'è già, perché salire a cinque costerebbe il 67% in più per sapere la stessa cosa.
È la disciplina di [[stadio-b-tre-condizioni-scartate]]: deciso da una misura, mai a priori.

### E si controlla che le tre ripetizioni siano davvero indipendenti

`correlazioneNascosta()` confronta il `pass^k` osservato con `p^k` (p = affidabilità marginale).
arXiv:2603.29231: *«lo scarto fra il pass^k stimato e la potenza k-esima dell'affidabilità marginale
è una diagnosi di correlazione nascosta fra le prove; uno scarto grande va ispezionato prima di
trattarle come campioni indipendenti»*. ⛔ Non è un errore da correggere: è l'avviso che
**l'intervallo calcolato come se fossero indipendenti è più stretto del vero**.

Misurato su questa campagna: marginale 0,4286, `pass^3` osservato 0,143 contro 0,079 atteso,
**scarto 0,064** — sotto la soglia di ispezione (0,10). Le tre ripetizioni si comportano da prove
indipendenti.

---

## 6. IL RILANCIO CHE NON COMBACIA SI RIFIUTA (mai riscrittura)

### Il danno, due volte in un giorno

[[corri-riscrive-il-file-se-ripetizioni-non-combacia]]: `corri()` **riscriveva il file prima di
girare**, tenendo solo le righe compatibili. Il 27/08, `ripetizioni: 2` chiesto contro `1` sul disco:
**24 righe su 27** cancellate, pagate, nessun backup, trovate giorni dopo. Il 28/08, **nella stessa
sessione che l'aveva scoperto**, stesso meccanismo sul campo `modello`: altre **25 righe** (DeepSeek,
$0,013, 25/25 riuscite). ⇒ **La cura non può essere disciplina**: una regola che va ricordata al
momento giusto è già fallita.

### Le tre regole, ora dentro `corri()`

1. ⛔ Righe di **un'altra campagna** (ripetizioni · modello · quota · corpus) ⇒ **RIFIUTO**, con gli
   **id** e il motivo per esteso. Non è un caso da risolvere in automatico: è una decisione su denaro
   già speso, e la prende una persona.
2. ⭐ Righe che **non sono misure** (429, credito, ignoto) ⇒ si rifanno, perché quella è la regola
   ([[il-429-non-e-un-fallimento]]) — ma si **dichiarano**, e la copia si fa lo stesso.
3. ⛔ La **copia di sicurezza si fa SEMPRE** prima di toccare il file, anche con `BANCO_RIPARTI=1` e
   anche quando si rifiuta. `TALOS-BANCO` non è un repository git: è l'unica rete reale.

L'uscita di sicurezza esiste ed è **nominata** (`BANCO_ACCETTA_ALTRA_CAMPAGNA=1`) — una guardia senza
scappatoia dichiarata viene aggirata commentandola, e allora non c'è più. Anche così, la copia si fa.

⛔ **L'ordine dei controlli è parte della regola**: prima l'identità della campagna, poi «è una
misura?». Al contrario, una riga di un altro modello che è *anche* un 429 finirebbe silenziosamente
nel ramo che la regola autorizza a cancellare — il danno del 28/08 travestito da igiene.

### Cosa resta invariato

- `talos.jsonl` **non si riscrive mai** — resta l'aperto [[corri-riscrive-il-file-se-ripetizioni-non-combacia]].
- **Il banco non si riavvia** finché non gira alla perfezione — ordine dell'owner dell'11/09.
- Le tre riparazioni note restano **cancelli da chiudere prima** di qualunque campagna nuova:
  modello con **più di un fornitore** (già vero per `z-ai/glm-5.3-flash`: 28 endpoint su 25
  fornitori), **ritentativo sul 429**, **taglio a 4.000 caratteri** che butta la diagnosi in 4 task
  su 6 — [[le-cinque-leve-di-talos-quattro-disarmate]].

---

## 7. COSA QUESTA REGOLA **NON** DICE

- Non dice che `pass@3` sia inutile: dice che non si pubblica da solo. Su una popolazione di
  **ciechi**, «è passato almeno una volta» è precisamente l'informazione che serve.
- Non dice che tre ripetizioni bastino. Terminal-Bench ne gira cinque. Tre è il minimo che ci
  permettiamo, e la regola dice **quando** salire.
- Non dice che il TTFT sia misurato. Dice che **non lo è**, e perché.
- Non autorizza nessuna corsa. Il banco riparte quando lo dice l'owner.
