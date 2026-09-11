# PIANO DI MISURA — il preambolo del lotto 2, prima/dopo

**Data:** 11/09/2026 · **Regola applicata:** `.claude/REGOLA-DEL-BANCO-2026-09-11.md`
**Stato:** ⛔ **PRONTO DA LANCIARE, NON LANCIATO.** Nessuna corsa a pagamento è stata fatta.
L'owner ha detto l'11/09: *«non lo avviamo più finché siamo sicuri che giri alla perfezione»*.

---

## 0. La domanda, in una riga

Il lotto 2 sostituisce l'elenco dei file (17.500-20.600 token, dichiarato incompleto: mostra il 30%
dei file) con **mappa delle cartelle + `AGENTS.md`/`CLAUDE.md` + scheda di lavoro** (~1.250-2.050
token). **Risparmio stimato: 15.500-19.300 token al primo giro di ogni messaggio.**

⇒ La domanda **non è** «il pass-rate sale?». È: **a parità di `pass^3`, quanto costa in meno e quanti
giri libera?** E: **se il `pass^3` scende, scende sui CIECHI o sugli INSTABILI?**

⛔ Perché la formulazione conta: [[ho-azzoppato-aider-ragionando-sul-costo]] — tolta una fonte di
contesto «per risparmiare», i risolti crollarono 9/15 → 5/15 col costo totale quasi identico. Un
prima/dopo che guarda solo il pass-rate o solo il costo ripete quell'errore.

---

## 1. CANCELLO 0 — cosa deve essere vero PRIMA di spendere un centesimo

| # | cancello | stato oggi | come si verifica (gratis) |
|---|---|---|---|
| C0-1 | Le colonne nuove arrivano davvero sulla riga | ✅ **fatto e provato** | `node --test sondaDeiGiri.test.mjs` (10/10) |
| C0-2 | Il rilancio non può cancellare righe pagate | ✅ **fatto e provato** | `node --test guardieDelRilancio.test.mjs` (21/21) |
| C0-3 | Il lettore legge `pass^3`, popolazioni, costo, colonne | ✅ **fatto e provato** | `node --test regolaDelBanco.test.mjs` (30/30) |
| C0-4 | `cerca`/`elenca` all'altezza (denylist, glob, regex, paginazione) | ⛔ **NON fatto** — §7.5 di `RAPPORTO-PREAMBOLO-CONCORRENTI` | prerequisito: senza, si ripete Aider |
| C0-5 | Ritentativo sul 429 nel banco | ⛔ **NON fatto** — [[le-cinque-leve-di-talos-quattro-disarmate]] | `npm run leve` |
| C0-6 | Il taglio a 4.000 caratteri della diagnosi | ⛔ **NON fatto** — butta la diagnosi in 4 task su 6 | `npm run leve` |
| C0-7 | Modello con più di un fornitore | ✅ `z-ai/glm-5.3-flash`: 28 endpoint / 25 fornitori | già letto alla fonte il 10/09 |
| C0-8 | Il controllo negativo `(nessuno)` nella corsa, per misurare la risoluzione | ⛔ **da aggiungere** ai nomi della corsa | costa $0 di API |
| C0-9 | Il bundle del braccio B è **ricompilato** | ⛔ a cura di chi lancia | `elencoProfondoServe.mjs` rifiuta due bracci con la stessa impronta |

⛔ **C0-4 è il vero prerequisito, non una rifinitura.** Misurato: `cerca` oggi non vede **1.004 file
`.php`** del kernel (allowlist di estensioni) e **505 file** di questo repo (cartelle potate a mano +
`startsWith('.')`). Togliere l'elenco *prima* di riparare `cerca` significa misurare un agente a cui
si è tolta una fonte senza dargliene un'altra.

---

## 2. IL DISEGNO — A/B nello stesso momento, mai contro una campagna di ieri

| | **braccio A (controllo)** | **braccio B (cura)** |
|---|---|---|
| preambolo | elenco dei file di oggi (tetto 1.500) | scheda di lavoro + `AGENTS.md` + mappa delle cartelle |
| `cerca` | riparato (C0-4) — **identico nei due bracci** | identico |
| modello | `z-ai/glm-5.3-flash` | identico |
| effort | identico (`BANCO_EFFORT` uguale o assente in entrambi) | identico |
| corpus | `storia`, 35 task, **popolazioni marcate** | identico |
| ripetizioni | **3** | **3** |
| giri massimi | identici | identici |
| harness in gara | `talos` + `(nessuno)` | `talos` + `(nessuno)` |
| cartella | `esiti-p13-elenco-profondo-prima` | `esiti-p13-elenco-profondo-dopo` |

⛔ **Una leva sola cambia.** Se si ripara `cerca` solo nel braccio B, il confronto misura due cose e
non si potrà mai dire quale.

⛔ **Mai contro `esiti-p13-prima-20260910`.** Quelle 35 righe **non portano `tokenPrimoGiro`**: il
braccio A va rifatto col banco dell'11/09, o la colonna che decide il verdetto è vuota da una parte.
È anche [[una-corsa-fallita-riporta-i-numeri-di-ieri]]: numeri troppo uguali sono un allarme.

⛔ **Impronta del bundle diversa nei due bracci**, e lo strumento la controlla: due bracci con la
stessa impronta significa che «dopo» è stato corso senza ricompilare, e ogni numero misurerebbe solo
il rumore del banco.

---

## 3. LE METRICHE, in quest'ordine, e TUTTE per popolazione

| # | metrica | dove si legge | soglia |
|---|---|---|---|
| 1 | **`pass^3`** + IC cluster bootstrap appaiato + McNemar esatto | `node elencoProfondoServe.mjs confronta` | vedi §4 |
| 2 | **`tokenPrimoGiro`** mediana e massimo | colonna nuova | **−40% minimo** |
| 3 | **`giriUsati`** mediana, e quanti task hanno `comeFinita: 'giri-esauriti'` | colonna nuova | non deve salire |
| 4 | **costo per task risolto a `pass^3`** | `node regolaDelBanco.mjs <cartella>` | non deve salire |
| 5 | `pass@3`, maggioranza, ultimo giro | accanto, sempre | dichiarative |
| 6 | `tempoPrimaRispostaMs` | colonna nuova | dichiarativa |
| 7 | `tempoPrimoTokenMs` | ⛔ **NON MISURATO** — dichiarato tale | — |

**Per popolazione, separate:** 9 ciechi · 21 instabili · 5 stabili. Un `pass^3` aggregato che non si
muove può nascondere «+4 ciechi, −4 instabili», che è un risultato enorme e in due direzioni.

---

## 4. IL CRITERIO DI ACCETTAZIONE — scritto PRIMA di guardare i numeri

La cura **passa** se tutte e tre:

- **(a)** `pass^3` del braccio B non è inferiore a quello di A oltre l'intervallo appaiato al 95%;
- **(b)** `tokenPrimoGiro` mediano scende **di almeno il 40%** (da ~29.000 a ≤ ~17.400);
- **(c)** il **costo per risolto a `pass^3`** non sale.

La cura **si ferma e si indaga** se:

- `pass^3` cala **sui 9 CIECHI** ⇒ la mappa delle cartelle non basta. Il passo successivo è la
  **profondità della mappa**, ⛔ **non** il ritorno all'inventario.
- `pass^3` cala **sui 21 INSTABILI** ⇒ non è un problema di contesto mancante: è il preambolo nuovo
  che confonde, o `cerca` che costa giri. Si guarda `giriUsati`.
- Le due metriche (`pass^3` e maggioranza) **hanno segno opposto** ⇒ lo strumento lo stampa da solo:
  la cura muove stabilità e capacità in direzioni diverse, e il numero aggregato è privo di senso.

**Barra del rumore, già misurata e non inventata:** servono **≥ 7 task su 35** che cambiano tutti
nella stessa direzione. Due strade indipendenti danno lo stesso ordine di grandezza — il pavimento
del rumore del banco (**18,6%**, misurato il 22/8 su due corse identiche: 22 verdetti cambiati su
118 ⇒ 6,5 task su 35) e il McNemar esatto (`p = 2·(1/2)^b < 0,05` solo da **b = 6**).

⛔ **Sotto 7 task il verdetto è IGNOTO, non «uguali».**

---

## 5. LA PROVA AL VERSO CONTRARIO — due task che devono separare i bracci

Senza questi due, il banco non sta misurando la cura ma il caso:

1. **Un task che nomina un file a profondità 5 che NON ESISTE.** Il modello deve dire «non c'è», non
   inventarlo. ⛔ È il difetto misurato il 10/09: `glm-5.3-flash` ha risposto «**0** — la cartella
   `harness-ui/src` non esiste» quando i file sono **104**, e il banco l'ha registrato `successo`
   ([[un-modello-che-non-vede-non-tace-spiega]]).
2. **Un task che nomina un file `.php` a profondità 4** (oggi invisibile a `cerca` per l'allowlist di
   estensioni): deve essere trovato dal braccio B e **non** dal braccio A.

Se questi due non separano i bracci, si ferma tutto: la leva non tocca la cosa che dovrebbe toccare
— è la lezione del 11/09 ([[la-campagna-e-lo-strumento-non-si-parlavano]]), e questo controllo è
gratis.

---

## 6. IL COSTO E IL TEMPO — misurati, non stimati a occhio

Base: la campagna vera del 10/09, 35 task × 3 ripetizioni, stesso corpus e stesso modello.

| | misurato sul braccio del 10/09 |
|---|---|
| giri | **105** (35 × 3) |
| tempo macchina | **9,89 ore** (mediana 308 s per giro) |
| costo **dal credito** | **$2,514** |
| costo sommando i giri prezzati | $2,245 su **97 giri**: 8 senza prezzo |
| costo mediano per riga | $0,0587 (max $0,2284) |

**Preventivo dei due bracci:**

| voce | valore |
|---|---|
| giri totali | **210** |
| tempo macchina | **~19,8 ore** (sequenziale: due agenti in parallelo si rallentano e nessuno sa di quanto) |
| **costo atteso** | **~$5,03** (2 × $2,514) |
| margine di strumento | risoluzione **$0,0021/riga** × 70 righe = **~$0,15**, cioè il **3%** del totale |
| controllo negativo `(nessuno)` | **$0** di API — ma va incluso per **misurare** la risoluzione di questa campagna |

⇒ Il costo per risolto a `pass^3` sarà leggibile: la mediana per riga ($0,0587) è **28× la
risoluzione**. ⛔ Il numero che vale è il **credito** ($2,514), non la somma delle righe ($2,245): la
differenza del 10,7% sono gli 8 giri rimasti senza prezzo.

---

## 7. LA SEQUENZA, quando l'owner dice sì

```
1.  npm test                                  637/637, gratis
2.  npm run leve                              C0-5 e C0-6: le tre leve disarmate
3.  node elencoProfondoServe.mjs prepara      gratis: preventivo, guardie, righe riprendibili
4.  node elencoProfondoServe.mjs soglie       gratis: quanto deve cambiare per contare
5.  ⛔ FERMATA — l'owner legge i due precedenti e dice se si parte
6.  node elencoProfondoServe.mjs misura prima   ⛔ SPENDE ~$2,51 · ~10 ore
7.  cp della cartella prima di toccare altro    (la guardia lo fa da sé, ma si controlla)
8.  ricompilare il bundle con la cura           l'impronta DEVE cambiare
9.  node elencoProfondoServe.mjs misura dopo    ⛔ SPENDE ~$2,51 · ~10 ore
10. node elencoProfondoServe.mjs confronta      gratis: pass^3, colonne, tre prove
11. node regolaDelBanco.mjs <cartella>          gratis: costo per risolto, popolazioni
```

⛔ Dopo **ogni** corsa: contare le righe sul disco e confrontarle col numero atteso (35), prima di
considerarla conclusa. Non fidarsi dell'output a schermo — [[corri-riscrive-il-file-se-ripetizioni-non-combacia]].

---

## 8. COSA QUESTO PIANO NON PUÒ DIRE

1. ⛔ **Nulla sui secondi.** Il TTFT non è misurabile dal banco (§2 della regola). I 27 s visti
   dall'owner restano non attribuiti fra token e fornitore.
2. ⛔ **Nulla sulla cache.** Misurato il 10-11/09: `z-ai/glm-5.3-flash` dà **0 token da cache** anche
   coi marcatori `cache_control` per blocco, e OpenRouter documenta che il comportamento **si
   verifica per modello**, non si assume. Un preambolo stabile è una leva certa; la cache no.
3. ⛔ **Nulla su altri corpus.** `storia` sono 35 commit veri del repo. `progetti` misura un'altra
   cosa e non si mescola.
4. ⛔ **Nulla sugli altri harness.** Le colonne nuove esistono solo per `talos`: un confronto
   competitivo sul `tokenPrimoGiro` oggi non si può fare, e va detto invece di aggregare.
5. ⛔ **Non dice se togliere l'elenco sia giusto.** È la domanda a cui questo piano deve rispondere;
   finché non risponde, il lotto 2 resta una proposta.
