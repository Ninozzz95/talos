# RAPPORTO — la regola del banco riscritta (lotto 3 di 3)

**Data:** 11/09/2026 · **Lane:** `lane/harness-desktop` · **Autorizzazione owner:** «Se è necessario
riscriviamo la regola del banco, per me non è un problema».

**⛔ Nessuna corsa a pagamento è stata lanciata. `esiti/talos.jsonl` non è stato toccato.** Tutte le
misure in questo rapporto vengono da **105 giri già pagati** il 10/09
(`TALOS-BANCO/esiti-p13-prima-20260910/talos.jsonl`), riletti con codice nuovo — mai riscritti.

**Prodotti:** `.claude/REGOLA-DEL-BANCO-2026-09-11.md` (la regola) ·
`.claude/PIANO-MISURA-PREAMBOLO-2026-09-11.md` (il piano A/B) · 1.599 righe di codice e test in
`TALOS-BANCO/`. **Suite: 637/637 verdi** (erano 576 prima, +61 nuovi).

---

## 1. LE FONTI — data e numeri, cercate PRIMA di scrivere una riga di codice

| # | fonte | data | i numeri che porta |
|---|---|---|---|
| A | *Beyond Pass@k: Measuring Reliability and Security of Agentic Code Generation*, [arXiv:2608.14711](https://arxiv.org/abs/2608.14711) | **11 ago 2026** | la metrica mal applicata **gonfia di 0,85-0,97 in punti assoluti** (0,96-0,98 riportato contro **0,00-0,12** corretto); un surrogato a corsa singola non sostituisce le ripetizioni (**Spearman ρ = 0,417**); pilota SWE-bench Verified: pass-rate morbido **0,80** contro risoluzione stretta **0,20** |
| B | *Beyond pass@1: A Reliability Science Framework for Long-Horizon LLM Agents*, [arXiv:2603.29231](https://arxiv.org/pdf/2603.29231) | 2026 | **k = 3 ripetizioni**, 396 task, 10 modelli, **23.392 episodi**, due scaffold. ⭐ *«lo scarto fra il `pass^k` stimato e la potenza k-esima dell'affidabilità marginale è una DIAGNOSI di correlazione nascosta fra le prove; uno scarto grande va ispezionato prima di trattarle come indipendenti»* |
| C | *Terminal-Bench 2.0 / 2.1*, [paper arXiv:2601.11868](https://arxiv.org/abs/2601.11868) · [repo Harbor](https://github.com/harbor-framework/terminal-bench-2-1) | **17 gen 2026** | **89 task**; la classifica gira **almeno CINQUE prove indipendenti per task** (`-k 5` nelle istruzioni di sottomissione), oltre **32.000 prove** su 16 modelli e 6 agenti |
| D | *The Tool Decathlon (Toolathlon)*, ICLR 2026, [arXiv:2510.25726](https://arxiv.org/abs/2510.25726) | ICLR 2026 | 108 task, 32 applicazioni, 600+ attrezzi; il migliore (Claude-4.5-Sonnet) **38,6%** con **20,2 giri di chiamata attrezzi in media**; «Avg # Turns» è **pubblicata** come proxy della complessità |
| E | *SWE-bench Pro* ([Scale](https://labs.scale.com/leaderboard/swe_bench_pro_public) · [leaderboard costi](https://www.morphllm.com/swe-bench-pro)) | 2026 | 1.865 task, 41 repository, `Resolve Rate` a **Pass@1**; le classifiche di costo pubblicano il **costo per task RISOLTO**: **$0,25-$0,55** fra i modelli ospitati, ~$0,06 per Qwen 3.6 autogestito |
| F | Indeed Engineering, *Bootstrap Confidence Intervals for LLM Evaluation* | **8 lug 2026** | con k corse su N input il ricampionamento giusto è il **cluster bootstrap**; **k = 3 o 5** è la finestra oltre cui il guadagno cade contro il pavimento della correlazione intraclasse (già citata alla fonte in `elencoProfondoServe.mjs`) |

**Cosa hanno aggiunto che dal codice non si vedeva:**
[A] mette un **numero** sull'inflazione della metrica sbagliata: non è un'opinione metodologica, è un
fattore 8-10×. [C] dice che la disciplina del 2026 gira **cinque** prove, non tre: le nostre tre sono
il minimo, e va scritto. [D] dice che i **giri sono una colonna pubblicata**, non un dettaglio
interno — cioè che `giriUsati` non è una nostra stranezza. [B] regala una **diagnosi gratis** che non
avevamo: se `pass^k ≫ p^k`, le ripetizioni non sono indipendenti e l'intervallo è più stretto del
vero.

---

## 2. LA REGOLA NUOVA — le sei decisioni

Testo completo in `.claude/REGOLA-DEL-BANCO-2026-09-11.md`. In breve:

1. **Metrica primaria `pass^3`.** `pass@k`, maggioranza e ultimo giro restano accanto, mai al posto.
2. **Tre colonne nuove obbligatorie:** `tokenPrimoGiro`, `giriUsati`, `tempoPrimoTokenMs` — più
   `tempoPrimaRispostaMs` e `comeFinita`. Dove mancano si dichiara **«non misurato»**, mai zero.
3. **Il corpus `storia` si legge per popolazione:** 9 ciechi · 21 instabili · 5 stabili. La premessa
   «0 su 35» è smentita e corretta nel file.
4. **Costo per task risolto a `pass^3`**, con la **risoluzione dichiarata** accanto al numero.
5. **Tre ripetizioni finché una misura non dice altro** — la soglia è `< 6 discordanti` + intervallo
   che contiene lo zero. E si controlla che le tre siano davvero indipendenti.
6. **Un rilancio che non combacia si RIFIUTA**, e la copia di sicurezza si fa sempre.

### ⛔ Il fatto che ha imposto il punto 1

Sui **105 giri già pagati**, quattro letture dello stesso disco:

| lettura | risolti | % |
|---|---|---|
| **`pass^3`** | **5/35** | **14,3%** |
| maggioranza | 14/35 | 40,0% |
| ultimo giro (campo `esito`) | 11/35 | 31,4% |
| `pass@3` | 26/35 | 74,3% |

**Rapporto fra la più generosa e la più severa: 5,2×.** È la stessa campagna che è comparsa come «0
su 35», «11 su 35» e «26 su 35» in tre documenti diversi. IC bootstrap su `pass^3`: **[2,9% ÷ 25,7%]**.

### ⛔ Il fatto che ha imposto il punto 2

`token.dentro` già sulla riga è la **somma su tutti i giri**: mediana **182.364** (min 13.681, max
286.245). La grandezza che la cura del preambolo muove è il **primo giro**, ~29.148. Un fattore 6×
fra le due. E `giri` era **`null` su 33 righe su 33** per `talos`, perché il lettore cercava
`num_turns` (formato claude-code) mentre il nostro kernel scrive `{"usage":{…,"giri":N}}`.

### ⛔ Il fatto che ha imposto il punto 4

| denominatore | risolti | costo per risolto |
|---|---|---|
| **`pass^3`** | 5 | **$0,4490** |
| maggioranza | 14 | $0,1604 |
| `pass@3` | 26 | $0,0863 |

Stesso denaro, stesso disco: **da $0,086 a $0,449.**

---

## 3. COSA CAMBIA NEL CODICE — file:riga

### File nuovi

| file | righe | cosa fa |
|---|---|---|
| `TALOS-BANCO/regolaDelBanco.mjs` | 624 | **il LETTORE**: `pass^3`, popolazioni, colonne con «non misurato», costo per risolto con risoluzione, diagnosi di correlazione, `servonoPiuRipetizioni()`, CLI `npm run regola <cartella>` |
| `TALOS-BANCO/guardieDelRilancio.mjs` | 196 | **le GUARDIE**: classifica le righe col motivo, copia di sicurezza, cancello che rifiuta |
| `TALOS-BANCO/regolaDelBanco.test.mjs` | 355 | 30 test, ognuno col verso contrario |
| `TALOS-BANCO/guardieDelRilancio.test.mjs` | 268 | 21 test, incluso uno **dalla porta vera** (`corri()`) |
| `TALOS-BANCO/sondaDeiGiri.test.mjs` | 156 | 10 test con **kernel finto** via `TALOS_HARNESS` |

### File modificati

| file:riga | modifica | perché |
|---|---|---|
| `corsaCoding.mjs:34` | `import { controllaPrimaDiCorrere }` | la guardia entra nella porta vera |
| `corsaCoding.mjs:134` | `export function sondaDelGiro(ultima)` | copia sulla riga **solo** i numeri finiti; assente ≠ zero; `comeFinita` è l'unica stringa che passa |
| `corsaCoding.mjs:636-639` | cancello dentro `corri()`, **prima** della `writeFileSync` | un rilancio di un'altra campagna **lancia** invece di riscrivere |
| `corsaCoding.mjs:746` | `...sondaDelGiro(memoria.ultima)` dentro `giri.push({…})` | le tre colonne nuove finiscono su ogni giro |
| `harness.mjs:1703-1716` | sonda + `onGiro` nell'adattatore `talos` | `onGiro` **esisteva già** nel kernel e il banco non lo passava |
| `harness.mjs:1734-1737` | `usage.giri` vince su `onGiro` **solo se maggiore** | `onGiro` dichiara di non coprire il giro di compattazione |
| `harness.mjs:1747` | `return { ...esito, sondaDeiGiri }` | additivo: `corriUnTask` legge `detto`/`fuori`/`codice` per nome |
| `elencoProfondoServe.mjs:13-42` | **la tesi «0 dei 35» corretta**, con le tre popolazioni | era falsa e giustificava la cura sbagliata |
| `elencoProfondoServe.mjs:157-162` | import da `regolaDelBanco.mjs` | |
| `elencoProfondoServe.mjs:182` | guardia: le due costanti `RIPETIZIONI` devono combaciare | due costanti uguali in due file sono due occasioni di divergere in silenzio |
| `elencoProfondoServe.mjs:325` | `statoDelTask(riga, eUnaMisura, { metrica })` | ⛔ default **invariato** (`maggioranza`): cambiarlo riscriverebbe in silenzio ogni confronto già stampato |
| `elencoProfondoServe.mjs:355,805-810` | il confronto si calcola **due volte** (pass^3 primaria + maggioranza) | se le due non concordano, **quello è il risultato** — e lo strumento lo stampa |
| `elencoProfondoServe.mjs:854-880` | stampa colonne del contesto + diagnosi di correlazione | senza `tokenPrimoGiro` una cura sul preambolo non ha una misura, e va detto |
| `package.json` | `"regola": "node regolaDelBanco.mjs"` | |

### ⛔ Il pezzo più importante: `onGiro` c'era già

`talosLavora` accetta `onGiro` **da sempre** e consegna `{giro, tipo:'risposta', usage, totali}` a
ogni risposta del modello. Il banco non lo passava. ⇒ **Non è servita una riga di kernel** — il
kernel non è stato toccato, come da brief. È la **terza volta** che un dato pagato sta sul disco e il
lettore guarda altrove ([[tre-ripetizioni-pagate-una-usata]],
[[la-cache-vale-sei-volte-e-non-la-contavamo]]).

---

## 4. I TEST — provati nei due versi

**637/637 verdi** sull'intera suite del banco (`npm test`), 61 nuovi.

I casi che **mordono**, cioè quelli che diventerebbero rossi su un lettore inerte:

- **Un lettore che risponde sempre «non misurato»** fallisce: *«una riga di OGGI le porta, e il
  valore è la MEDIANA dei giri»*, *«il ripiego `num_turns` vale per giriUsati»*.
- **Un lettore che risponde sempre `0`** fallisce: *«una riga di IERI non porta le colonne nuove, e
  il lettore dice NON MISURATO»* (`valore === null`, non 0), *«nessun giro prezzato ⇒ COSTO IGNOTO,
  mai $0,0000»*, *«NaN, null e stringhe NON diventano campi»*.
- **Un `pass^3` che dipendesse dall'ordine dei giri** fallisce: si confronta `[V,F,F]` con `[F,F,V]`
  e si verifica che **solo** l'ultimo giro cambi — con un assert che fallisce anche se *quello* non
  cambia (cioè se il test non sta guardando il campo giusto).
- **Un cancello inerte** fallisce: *«IL VERSO CONTRARIO: righe compatibili ⇒ ok:true, e nessun
  allarme»* — un cancello che grida sempre è rumore, non una guardia.
- **Un ordine di controlli sbagliato** fallisce: *«un 429 di un ALTRO MODELLO conta come ALTRA
  CAMPAGNA»*. Invertendo i due controlli, quella riga finirebbe nel ramo che la regola autorizza a
  cancellare — il danno del 28/08 travestito da igiene.
- **La porta vera**: `corri()` chiamata davvero con harness finti e una riga «di un'altra campagna»
  sul disco **deve lanciare**, e la riga pagata deve essere ancora lì dopo. Una guardia provata solo
  a se stessa è [[funzione-con-i-test-e-nessun-chiamante]].
- **La catena della sonda**, col kernel finto: `onGiro` → `sondaDeiGiri` → `sondaDelGiro()` → riga.
  Con `tokenPrimoGiro = 29.148` e `tokenTotaliDentro = 146.592` sullo stesso task, cioè esattamente
  la confusione che la colonna esiste per impedire.

**Prova a secco del percorso di stampa** (nessun costo): due cartelle sintetiche, `confronta`
eseguito per intero — 7 guadagnati, McNemar p = 0,0156, cluster bootstrap [8,6 ÷ 34,3], colonne
stampate con `tokenPrimoGiro` 29.158 → 11.010 e l'allarme di correlazione che scatta. Cartelle
cancellate subito dopo (verificato: non esistono più).

---

## 5. IL PIANO DI MISURA — costo e tempo, dalla campagna vera

Dettaglio in `.claude/PIANO-MISURA-PREAMBOLO-2026-09-11.md`. Numeri:

| voce | misurato sul braccio del 10/09 | preventivo due bracci |
|---|---|---|
| giri | 105 | **210** |
| tempo macchina | **9,89 ore** (mediana 308 s/giro) | **~19,8 ore** |
| costo **dal credito** | **$2,514** | **~$5,03** |
| costo sommando i giri | $2,245 su **97** (8 senza prezzo) | — |
| costo mediano per riga | $0,0587 (max $0,2284) | **28× la risoluzione** |
| margine di strumento | $0,0021/riga × 70 = **~$0,15** | il **3%** del totale |

**Criterio scritto prima di guardare i numeri:** la cura passa se **(a)** `pass^3` di B non è
inferiore a quello di A oltre l'intervallo appaiato, **(b)** `tokenPrimoGiro` mediano scende **≥
40%**, **(c)** il costo per risolto a `pass^3` non sale. Barra del rumore: **≥ 7 task su 35** nella
stessa direzione (pavimento misurato 18,6% ⇒ 6,5 task; McNemar esatto ⇒ b ≥ 6). **Sotto, il verdetto
è IGNOTO, non «uguali».**

⛔ **Il braccio A va rifatto**: le 35 righe del 10/09 **non portano `tokenPrimoGiro`**, quindi
riusarle lascerebbe vuota da una parte la colonna che decide il verdetto.

⛔ **Prerequisito non negoziabile:** `cerca` va riparato **prima**, e identico nei due bracci
(denylist invece di allowlist — oggi **1.004 file `.php`** del kernel e **505 file** di questo repo
sono invisibili). Togliere l'elenco senza riparare `cerca` ripete alla lettera
[[ho-azzoppato-aider-ragionando-sul-costo]].

---

## 6. COSA NON HO VERIFICATO

1. ⛔ **Nessun giro col modello vero.** Le colonne nuove sono provate con un **kernel finto**: so che
   la catena porta i numeri fino alla riga, **non** so quanto valga `tokenPrimoGiro` in una corsa
   reale di TALOS. Il 29.148 viene da BC-07 (sessione del 4174), non dal banco.
2. ⛔ **`usage.giri` del kernel non l'ho visto su una corsa vera del banco**, perché nelle 35 righe
   del 10/09 `giri` è `null`. So dal sorgente che `conto.giri` viene incrementato solo quando il
   provider riporta `usage`; se un provider non lo riportasse mai, `giriUsati` resterebbe quello
   contato da `onGiro` (che non include la compattazione). La regola di precedenza è provata solo
   contro il kernel finto.
3. ⛔ **La risoluzione del costo di QUESTA campagna non è misurata:** `esiti-p13-prima-20260910` non
   contiene `(nessuno)`. I **$0,0021** sono il valore del 23/8 su `progetti`, dichiarato come
   ripiego. Il piano lo include come cancello C0-8.
4. ⛔ **Il TTFT resta non misurato** nel banco, per costruzione (`onDelta` romperebbe la parità). La
   stima di risparmio del lotto 2 è sui **token**, non sui **secondi**.
5. ⛔ **Le colonne nuove non esistono per gli altri sei harness** (sottoprocessi): un confronto
   competitivo su `tokenPrimoGiro` oggi non si può fare. Dichiarato, non aggregato.
6. ⛔ **Non ho lanciato `npm run leve`**: le tre riparazioni note del banco (ritentativo sul 429,
   giri che finiscono in silenzio, taglio a 4.000 caratteri) **restano aperte** e sono cancelli del
   piano, non cose fatte.
7. ⛔ **Non ho toccato `esiti/talos.jsonl`** né lanciato nessun `corri()` su dati veri. L'unico
   `corri()` eseguito è quello dentro i test, con harness finti, su cartelle temporanee.
8. ⛔ **`elencoProfondoServe.mjs confronta` sui dati veri non gira**: la campagna del 10/09 sta in
   `esiti-p13-prima-20260910/`, lo strumento cerca `esiti-p13-elenco-profondo-prima/`. Difetto noto e
   **non riparato** — rinominare una cartella di misure pagate è una decisione dell'owner, non mia.
9. ⛔ **La stima «−15.500/−19.300 token»** del lotto 2 è quella del rapporto sui concorrenti, ricavata
   dai caratteri con rapporti dichiarati (3,4 e 4,0 char/token). Non l'ho rimisurata.

---

## Riepilogo veloce

**Cosa devi fare tu** — tre scelte secche:
**(1)** approvo la regola nuova (`pass^3` primaria, tre colonne obbligatorie, corpus per popolazione,
costo con risoluzione)? **sì / no / solo le colonne**
**(2)** approvo che `cerca` venga riparato **prima** dell'A/B (prerequisito, non rifinitura)?
**sì / no / dopo**
**(3)** l'A/B costa **~$5,03 e ~19,8 ore** di macchina: si lancia, o resta custodito? **sì / no / poi**

**Cosa faccio io** — niente che spenda, finché non rispondi. Se dici sì alla (1), l'unica cosa che
resta da fare senza soldi è chiudere i cancelli C0-4/C0-5/C0-6 del piano.

**Cosa rimane** — il TTFT non è misurabile dal banco e resta dichiarato tale; le colonne nuove non
esistono per gli altri sei harness; la risoluzione del costo va rimisurata con `(nessuno)` in
campagna; `elencoProfondoServe confronta` non trova la campagna del 10/09 per un nome di cartella, e
rinominarla è una decisione tua; le tre leve disarmate del banco sono ancora disarmate.
