# T07-review — La Review: file toccati, differenza e i controlli che promette

> Prova d'uso sull'istanza 4188 (worktree AVM-harness-prove, base c1984d79), guidata come farebbe una persona. 2026-09-06 13:56

## Passi

- **le linguette della sessione** ✅
  - atteso: Chat · Terminale · Review · Browser, col numero quando serve
  - visto: [{"testo":"Chat","ruolo":"tab","vista":null,"scelta":"true"},{"testo":"Terminale","ruolo":"tab","vista":null,"scelta":"false"},{"testo":"Review 1","ruolo":"tab","vista":null,"scelta":"false"},{"testo":"Browser","ruolo":"tab","vista":null,"scelta":"false"},{"testo":"Chat","ruolo":"tab","vista":null,"scelta":"true"},{"testo":"Terminale","ruolo":"tab","vista":null,"scelta":"false"},{"testo":"Review","ruolo":"tab","vista":null,"scelta":"false"},{"testo":"Chat","ruolo":"tab","vista":null,"scelta":"true"},{"testo":"Terminale","ruolo":"tab","vista":null,"scelta":"false"},{"testo":"Review 1","ruolo":"tab","vista":null,"scelta":"false"},{"testo":"Browser","ruolo":"tab","vista":null,"scelta":"false"},{"testo":"Nuovo","ruolo":"tab","vista":null,"scelta":"false"}]
- **apro la Review** ✅
  - atteso: la vista si apre davvero
  - visto: cliccata=Review 1 · visibile=true
- **i file toccati nella Review** ❌
  - atteso: una riga per file scritto, con +/−
  - visto: 0 righe · []

> ⛔ **T07-review-D1** (grave): la Review non elenca il file scritto dal giro — prova: Apri src/lista.mjs e aggiungi in fondo, scrivendo il file, una funzione esportat progetto-5 · 1 file modificato ChatTerminaleReview 1Browser Copia i diffAccetta tuttoScarta tutto src/lista.mjs+1 Nessu
- **la differenza del file** ✅
  - atteso: le righe aggiunte e tolte, leggibili
  - visto: {"add":["11 + export const massimo = (a) => Math.max(...a);"],"del":[],"ctx":10,"testo":" Apri src/lista.mjs e aggiungi in fondo, scrivendo il file, una funzione esportat progetto-5 · 1 file modificato ChatTerminaleReview 1Browser Copia i diffAccetta tuttoScarta tutto src/lista.mjs+1 Nessun file scr
- **i controlli promessi** ✅
  - atteso: o funzionano, o non devono esserci (mai un pulsante inerte)
  - visto: [{"testo":"Copia i diff","visibile":true,"richiede":null},{"testo":"Accetta tutto","visibile":false,"richiede":"fase3"},{"testo":"Scarta tutto","visibile":false,"richiede":"fase3"},{"testo":"Accetta questo file","visibile":false,"richiede":"fase3"},{"testo":"Apri nell'editor","visibile":false,"richiede":"fase3"},{"testo":"Scarta","visibile":false,"richiede":"fase3"}]
- **i controlli assenti** ✅
  - atteso: Accetta/Scarta/Apri nell'editor: la scelta dichiarata è tenerli NASCOSTI finché la rotta non c'è
  - visto: ["Accetta tutto","Scarta tutto","Accetta questo file","Apri nell'editor","Scarta"]
- **«Copia i diff»** ✅
  - atteso: copia davvero, e lo dice
  - visto: pulsante=Copia i diff · toast=["Diff di 1 file copiatoDiff di 1 file copiato"]

## Verdetto

**PASSA CON RISERVA** — difetti trovati: 1 (T07-review-D1).

## Il giro vero che sta dietro questa prova

Sessione `c3fe7572` sul progetto `banco/progetto-5` (repo git vero, `master`, albero pulito prima del
giro), consegna: «Apri `src/lista.mjs` e aggiungi in fondo, scrivendo il file, una funzione esportata
`massimo(a)`…». Esito `successo`, 3 giri, 24,2k token, cache 33%, primo token 18,8 s.
**Sul disco è successo davvero**: `git diff --stat` → `src/lista.mjs | 1 +`,
`+export const massimo = (a) => Math.max(...a);`.

## ⚠️ Rettifica: T07-review-D1 è un difetto della MIA sonda, non della app

Guardando `foto/T07-review/10-review-aperta.png` l'elenco **c'è**: una pastiglia `src/lista.mjs +1`
in cima, e sotto il diff con i numeri di riga e la riga 11 evidenziata in verde. Cercavo
`.talos-list-row`, ma la Review disegna il file come **pastiglia**, non come riga di elenco.
**T07-review-D1 è ritirato.**

⛔ Nota sulla prima corsa (`T07-review.mjs`, poi rifatta con `T07b-review.mjs`): cliccavo la linguetta
cercando il testo **esatto** `Review`, mentre la linguetta porta il numero (`Review 1`). Il clic non
avveniva, restavo in Chat e leggevo `#schermoReview` mentre era nascosto: due «difetti gravi» che non
esistevano. Il clic si fa per **prefisso**.

## Ispezione delle foto — difetti trovati GUARDANDO

Foto lette: `02-review-piena.png` (la chat a fine giro) e `10-review-aperta.png` (la Review).

> ⛔ **T07-review-D2** (grave): nella colonna di destra, scheda **Contesto → Ambiente**, la riga
> **«Non salvate»** dice **«–»** mentre nel repo c'è **una modifica non salvata** — quella appena
> scritta dall'agente (`git status --short` → ` M src/lista.mjs`, misurato nello stesso minuto).
> È esattamente l'informazione che F19-F21 e G14-G16 chiedono, ed è **falsa**, non assente
> — prova: `foto/T07-review/10-review-aperta.png`, pannello «Ambiente»

> ⛔ **T07-review-D3** (medio): la testata del diff dice **«+1 · giro 1»**, ma l'**Indice dei giri**
> nella stessa schermata attribuisce «1 file modificato» al **giro 3**. Due numeri diversi per lo
> stesso fatto, a dieci centimetri l'uno dall'altro — prova: `10-review-aperta.png`

> ⛔ **T07-review-D4** (medio): l'**Indice dei giri** (B23, «saltare al giro N») comincia da **2**:
> elenca «2 · 1 file letto» e «3 · 1 file modificato», il **giro 1 non c'è**. Chi vuole tornare
> all'inizio del lavoro non trova la voce — prova: `10-review-aperta.png`

> ⛔ **T07-review-D5** (minore): il toast di conferma ripete due volte la stessa frase — titolo e
> corpo sono identici: **«Diff di 1 file copiato / Diff di 1 file copiato»** — prova: lettura del
> `#regioneToast` in questo taccuino, passo «Copia i diff»

> ⛔ **T07-review-D6** (minore): il titolo della sessione nella colonna di destra è troncato a metà
> parola senza puntini — «…scrivendo il file, una funzione **esportat**» — prova: `10-review-aperta.png`

### Cosa invece funziona, e va detto

- I controlli **«Accetta tutto» · «Scarta tutto» · «Accetta questo file» · «Scarta» · «Apri
  nell'editor»** esistono nel markup ma sono **nascosti** (`data-richiede="fase3"`): la regola «mai un
  pulsante che non fa niente» è **rispettata**. Nessuno dei tre controlli chiesti dalla prova è a
  schermo, e questa è la scelta giusta finché la rotta non c'è.
- **«Copia i diff»** è l'unico attivo e **funziona**.
- Il diff ha numeri di riga, contesto e la riga aggiunta evidenziata; la pastiglia del file porta `+1`.
- La linguetta porta il **contatore** (`Review 1`), e la Chat mostra i blocchi raccolti «1 file letto»
  e «1 file modificato +1 −0» (B19).

## Verdetto (rivisto dopo l'ispezione delle foto)

**PASSA CON RISERVA** — difetti veri: 5 (D2, D3, D4, D5, D6). D1 ritirato: era la mia sonda.
La Review è una delle viste più solide; il guaio non è dentro il diff, è **intorno**: l'Ambiente
dichiara «nessuna modifica non salvata» proprio mentre ne mostra una, e il numero del giro non
combacia con l'indice dei giri.

> Base del codice: `c1984d79` (worktree `AVM-harness-prove`, istanza sulla porta **4188**).
