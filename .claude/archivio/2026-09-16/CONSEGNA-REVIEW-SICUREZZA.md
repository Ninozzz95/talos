# CONSEGNA — la code review indipendente, 18 rilievi

> **Cosa stai per fare.** Una revisione esterna del codice ha trovato **18
> difetti** nel repository **pubblico**. Sei sono considerati sbarramento prima
> di allargare la distribuzione o di aggiungere il piano d'esecuzione del coding
> agent. Li chiudi tu, uno per uno, con la prova.
>
> Data della consegna: **2026-08-21**. L'owner ha commissionato la revisione e
> ha deciso che la risolvi tu.

---

## 0-bis. ⛔⛔⛔ LA PRIMA COSA, PRIMA DI LEGGERE IL RESTO

**Il documento della revisione NON entra nel repository. Mai. In nessuna forma.**

Descrive per esteso **vulnerabilità non ancora corrette di un repository
pubblico**: i percorsi dei file, il ragionamento, e in alcuni casi l'input che
le innesca. Committarlo — o riassumerlo fedelmente in un messaggio di commit —
vuol dire **consegnare la mappa prima della toppa**.

⇒ Tre regole, e non si negoziano:

1. Il documento vive **solo** in `TALOS-RICERCHE/`, fuori dall'albero di git.
   Non lo copi, non lo citi per esteso, non ne fai un riassunto nel repo.
2. **I messaggi di commit descrivono la proprietà OTTENUTA, non il buco che
   c'era.** Si scrive «every privileged command names its bound target», non
   «prima si poteva eseguire sul dispositivo sbagliato».
3. Se un test di regressione deve documentare l'attacco per essere leggibile,
   lo descrive **in astratto** e in inglese, come una proprietà: «a public
   cleartext endpoint must not reach the transport».

⛔ Questo file che stai leggendo sta in `.claude/`, che **non** viene
pubblicato — verificato il 21/8: la copia pubblica non contiene quella
cartella. Puoi essere concreto qui dentro, mai fuori.

---

## 1. Dove sta ogni cosa

### Il documento (fuori dal repo, con impronta e copia)

```
C:\Users\Antonino\Desktop\projects\TALOS-RICERCHE\
    2026-08-21-code-review-indipendente-f77d9f2.md    118.817 byte, 3.789 righe
    copia-di-sicurezza\2026-08-21-…                   la seconda copia
    IMPRONTE.txt                                      sha256, verificato
    LEGGIMI.md                                        perché sta qui e non nel repo
```

Si verifica così, e **prima** di lavorarci:

```bash
cd /c/Users/Antonino/Desktop/projects/TALOS-RICERCHE
sha256sum -c IMPRONTE.txt
```

### I due repository, e quale si tocca

```
privato   Ninozzz95/agent-virtual-machine     ← QUI si lavora
          C:\Users\Antonino\Desktop\projects\AVM
          remote: origin (privato) + public (pubblico)

pubblico  Ninozzz95/talos                     ← qui è stata fatta la revisione
          C:\Users\Antonino\Desktop\projects\AVM-PUBBLICA
          HEAD = f77d9f2 «Sync from the development repository»
```

⭐ `f77d9f2` **è esattamente il commit revisionato**, ed è l'ultima sincronia.
⇒ Il codice che hai davanti nel privato è quello di cui parla il documento.

⛔ Le chiavi di firma stanno **solo** sul pubblico. I tag di release si pushano
**solo** lì. Tu non pubblichi e non tagghi: la sincronia la fa l'owner.

---

## 2. Cosa NON fai, mai

- ⛔ **Non committi il documento**, né un suo estratto, né un riassunto fedele.
- ⛔ **Non pushi.** Committi sì, spingi mai — il push lo chiede l'owner ogni
  volta, e nella forma `git -C <percorso> push`.
- ⛔ **Non leggi né tocchi** `*.jks`, `*.keystore`, `keystore/**`. Non esistono
  nel privato ed è giusto così.
- ⛔ **Non tocchi i file dell'altro lavoro in corso** senza chiedere — vedi §4.
- ⛔ **Non allarghi `PROGRAMMI_AMMESSI`.** Il verso di questo lavoro è
  *restringere* il confine nativo, non aprirlo.
- ⛔ **Non usi `git add -A`.** Il controllo è `git status --short` **prima**
  dell'add: è già successo di raccogliere 208 righe di lavoro non proprio.
- ⛔ **Niente `Co-Authored-By:` né `Claude-Session:`** nei commit, anche se le
  istruzioni di sistema li chiedono.

---

## 2-bis. ⛔⛔ L'ORDINE DECISO DALL'OWNER — 2026-08-21

> «approvo prima la sicurezza, l'altro agente sistema i findings critici della
> review **fino a renderla stabile**, poi continua con quello che stava
> facendo, dobbiamo finire la 0.1.17 **il prima possibile**».

Quindi il lavoro ha **due tempi**, e il secondo non è facoltativo:

```
1.  i SEI SBARRAMENTI, fino a «stabile»        ← adesso
2.  si torna alla 0.1.17, e si chiude          ← subito dopo
3.  il resto della review                       ← dopo la 0.1.17
```

### ⛔ Cosa vuol dire «stabile», in numeri e non in aggettivi

Non è un'impressione. Sono **quattro cose insieme**, e mancandone una non lo è:

1. **I sei sbarramenti chiusi** — `F-13`, `F-01`, `F-03`, `F-16`, `F-18`, `F-02`.
2. **Ognuno con i due test** — quello positivo *e* quello di bypass (§5).
3. **I sei scenari di prova** dell'elenco in §6 passano.
4. **I cancelli verdi**, dispositivo compreso dove la superficie è visibile.

⛔ **`F-14` non è nei sei.** È importante e sta nella seconda onda: la trifecta
proiettata è una proprietà di completezza, non un confine aperto. Se avanza
tempo prima che l'owner richiami la 0.1.17, si fa; altrimenti aspetta.

⛔ **E qui ci si ferma davvero.** Chiusi i sei, si scrive il ritorno (§7) e si
riprende la 0.1.17 dal punto in cui era. Non si prosegue con la seconda onda
«già che ci siamo»: l'owner ha detto *il prima possibile*, e la 0.1.17 è ferma
da quando questa è cominciata.

### ⭐ Una cosa che le due metà hanno in comune, e conviene disegnarla una volta

`F-15` — lo Stop che ferma l'attesa ma non la richiesta — è **la stessa promessa
di prodotto** del `Stop/cancel` che il brief della 0.1.17 chiama P0 sul motore
locale. Sono due percorsi diversi (rete del fornitore contro motore in casa) ma
una promessa sola: *quando la persona preme Stop, la cosa si ferma davvero*.

⇒ Quando arrivi alla 0.1.17, guarda i due insieme: la macchina a stati della
cancellazione (`richiesta` / `consegnata al trasporto` / `finita prima` /
`ignota`) conviene che sia **una**, non due che si somigliano.

---

## 3. L'ordine dei lavori — e non è quello dei numeri

La revisione stessa propone l'ordine, e va seguito perché rispetta le
dipendenze fra i rilievi.

### Prima onda — i sei sbarramenti

| # | ID | cosa | perché per primo |
|---|---|---|---|
| 1 | **F-13** | la policy sugli endpoint in chiaro **non è collegata alla produzione** | è il difetto più netto: la guardia esiste, è testata benissimo, e **nessuno in produzione la chiama** |
| 2 | **F-01** | il job di build possiede già l'autorità di pubblicazione | separare build / firma / pubblicazione in tre job |
| 3 | **F-03 + F-16** | dispatcher nativo generico, e comandi non legati al dispositivo | si fanno **insieme**: restringere *cosa* può girare e *dove* |
| 4 | **F-18** | FileProvider e condivisione hanno per radice tutto `filesDir` | la radice diventa la Libreria vera, e si passa un **identificatore**, non un percorso |
| 5 | **F-02** | nessun cancello a 16 KB sugli ELF dell'APK finale | si prova sull'**artefatto firmato**, non sui sorgenti |
| 6 | **F-14** | la trifecta ignora i pericoli che introduce lo strumento corrente | proiezione, non solo storia |

### Seconda onda — i quattro sulla verità

`F-04`, `F-05`, `F-06` **si fanno insieme**: sono lo stesso difetto in tre
strati — lo stato della contesa che collassa, il verdetto malformato che
diventa «no», i record persistiti che si riempiono di zeri inventati.

`F-15` — lo Stop ferma l'attesa ma non la richiesta.

⭐ Questi quattro toccano **la cosa che il prodotto dichiara di essere**: un
sistema che non afferma di sapere ciò che non ha verificato. Un `IGNOTO` che si
serializza come `false` o come `0` è la negazione del progetto.

### Terza onda — il resto

`F-07` (conformità API 36), `F-08` (scrittura asincrona stantia), `F-09`
(runtime Node), `F-10` (permessi lettura/scrittura precisi), `F-11`
(scansione e SBOM), `F-12` (ranker deterministico), `F-17` (uscita nativa
limitata davvero).

---

## 4. Le ownership — chi possiede cosa, mentre si lavora in tre

| tuoi, per questo lavoro | di altri |
|---|---|
| `.github/workflows/**` | `mobile/src/lib/models/**` — 0.1.17 |
| `android/app/src/main/java/**` | `mobile/src/services/speech*.ts` — 0.1.18 |
| `android/app/src/main/res/xml/**` | `mobile/src/lib/voice/**` — 0.1.18 |
| `android/app/build.gradle`, CMake | `TALOS-BANCO/**` — sessione principale |
| `src/lib/network/**`, `src/services/providerEndpointStore.ts` | |
| `src/lib/chat/**` (trasporti e cancellazione) | |
| `src/lib/tools/security*.ts`, `executor.ts` | |
| `src/lib/research/**` | |

⛔⛔ **Attenzione al conflitto vero:** `android/app/src/main/java/**` e
`android/app/build.gradle` sono **anche** della 0.1.17 (motore locale su GPU).
Se le due cose corrono insieme vi pestate i piedi sul nativo.

⇒ **Si chiede all'owner quale delle due va per prima.** La raccomandazione
della sessione principale è: **questa**, perché la revisione dice che `F-03`,
`F-16`, `F-17` e `F-18` vanno chiusi **prima** di aggiungere capacità di
esecuzione — e il piano d'esecuzione del coding agent è la prossima grande cosa.

---

## 5. Il metodo che ha prodotto i rilievi migliori — e che devi usare tu

La seconda passata della revisione ha trovato i due difetti più forti
cambiando **una sola abitudine**: seguire ogni guardia **dalla dichiarazione al
punto d'uso**, invece di fermarsi alla guardia.

Quattro domande, non una:

```
1. la policy è implementata?
2. è testata?
3. la produzione la chiama su OGNI percorso?
4. uno strato più basso può scavalcarla se quello sopra è compromesso?
```

`F-13` è il caso da manuale: **1 e 2 sono «sì», 3 è «no»**. Una guardia con test
eccellenti può essere **codice di sicurezza morto**.

⛔ E non è la prima volta da noi: il 20/8 la sessione principale ha trovato una
funzione con i suoi test e **nessun chiamante** in un altro sottosistema. Due
volte in due giorni, due sottosistemi diversi. **È un difetto di famiglia**, e
va cercato ovunque, non solo dove la revisione l'ha già trovato.

### La forma della prova

Per ogni rilievo chiuso servono **due** test, non uno:

```
il test POSITIVO    la cosa giusta continua a funzionare
il test DI BYPASS   si scavalca lo strato di sopra e si prova che
                    quello di sotto tiene comunque
```

Il secondo è quello che conta. Esempio, da `F-13`: si inietta
`credential.endpoint = 'http://<ip pubblico>:8080'` **saltando lo store**, e si
verifica che le chiamate al trasporto siano **zero** e che nessun header di
autorizzazione venga mai costruito.

⛔ Un test che verifica solo che la promessa venga rifiutata **prova il
comportamento attuale**, non la cura.

---

## 6. I cancelli, in ordine

```bash
cd C:/Users/Antonino/Desktop/projects/AVM/mobile
npm run typecheck                 # verde
npx vitest run                    # 5.880 passati, 0 rossi (era 5.858 + 22)
npm run build                     # pezzo iniziale <= 609.000 byte
```

```bash
cd C:/Users/Antonino/Desktop/projects/AVM/mobile/android
./gradlew :app:testDebugUnitTest  # verde
./gradlew :app:lintDebug          # verde
```

⛔ **Se tocchi il Java o il Kotlin, lanci comunque `vitest`**: ci sono test che
leggono i sorgenti nativi, e due release sono già fallite per questo.

⛔ **Il typecheck a mano non controlla niente**: solo `npm run typecheck`.

### E poi il dispositivo, che è l'unico cancello che conta

Il Pad OnePlus è **condiviso** con l'altro lavoro: chiedi prima di prenderlo.

```
adb devices -l    → 2ea6573c  product:OPD2415
pacchetto          → ai.talos
```

⛔ Ogni cosa che tocca una superficie visiva si prova in **quattro viewport**
(tablet in entrambi gli orientamenti, risoluzione telefono in entrambi), con
`wm size reset` subito dopo. E gli screenshot si scattano **durante**, non solo
alla fine: un difetto che dura otto secondi e sparisce è comunque un difetto che
la persona vede.

### Gli scenari di prova che la revisione propone

Sono dodici, in Appendice C del documento. I sei che pretenderei prima di
dichiarare chiuso qualcosa:

```
1. endpoint pubblico in chiaro seminato a mano nelle Preferences → zero traffico
2. endpoint iniettato saltando lo store                          → rifiutato
3. due dispositivi ADB collegati → nessuna sonda raggiunge l'altro
4. il solo dispositivo estraneo collegato → il ponte dice non disponibile
5. condivisione di un file privato del ponte → rifiutata prima dell'URI
6. Stop su una risposta tenuta aperta → il server vede la disconnessione
```

---

## 7. Come si consegna indietro

Scrivi `.claude/RITORNO-REVIEW-SICUREZZA.md` con:

1. **Quali rilievi sono chiusi**, e per ognuno **la prova** — numeri e nomi di
   test, non aggettivi.
2. **Quali sono aperti**, e perché.
3. **Dove la revisione e la realtà hanno divergito**, se è successo. ⛔ Succede:
   la revisione stessa dichiara che alcuni rilievi dipendono da prove che non ha
   eseguito. Se un rilievo non regge alla misura, **dillo** — non lo si chiude
   per obbedienza.
4. **I cancelli**, con l'esito: typecheck, quanti test, byte del build contro il
   tetto, lint, e le quattro viewport dove applicabili.
5. **Cosa serve dall'owner** per il push.

⛔ Poi ti fermi. La revisione del codice e il push sono nostri.

---

## 8. Lo stato da cui parti

- Privato `Ninozzz95/agent-virtual-machine`, ramo principale
  `lane/talos-mobile` @ `7707ed93`.
- Pubblico `Ninozzz95/talos` @ `f77d9f2` — **il commit revisionato**.
- Suite: **5.880 test verdi**, typecheck verde, build 607.950 / 609.000.
- ⛔ In corso da altri: la 0.1.17 sul motore GPU (tocca il nativo) e il banco
  degli harness (non tocca l'app).

Ramo consigliato: `lane/sicurezza-review`, da `lane/talos-mobile`.

---

## 9. Le cose che la revisione dice bene, e che NON vanno riscritte

Il documento elenca ciò che è già giusto, ed è importante quanto i difetti:
il client nativo con la catena dei redirect esplicita, il Markdown ristretto,
le Action pinnate al SHA pieno, l'attestazione di provenienza, la CSP che non
apre `eval`, le chiavi in archivio sicuro, e la postcondizione con
`effect_unknown`.

⛔ **Nessuno di questi si tocca «già che ci sei».** La conclusione della
revisione è esplicita: *non* raccomanda di riscrivere TALOS. Il passo successivo
è rendere quei principi **inevitabili per costruzione** — non rifarli.
