# Pre-release — l'impegno preso il 07/09/2026, da eseguire PRIMA del primo rilascio

> Owner, 07/09/2026, verbatim: «alla fine della risoluzione dei bug e poco prima del primo rilascio
> dobbiamo fare una **tabella di marcia di pre-release**, allineata con lo **stato dell'arte
> dell'ultimo mese** sul **deploy engineering**, facendo **tutte le prove fresche come farebbe un
> utente che ha appena installato il programma**; dobbiamo rendere la **UX più pulita, rifinita e
> fluida possibile**. Segnalo bene e continua.»

⛔ **Quando scatta**: quando la coda dei difetti è chiusa (o le righe rimaste sono dichiarate come
debito accettato), e prima di creare il tag `desktop-v0.1.0`. Non prima — una rifinitura fatta su
una app che cambia ancora si rifà due volte.

⛔ **Perché sta scritto qui e non nella mia testa**: fra oggi e quel momento passano sessioni, e una
consegna che vive solo in una conversazione si perde. Questo file è il contratto.

---

## 1 · La tabella di marcia, allineata allo stato dell'arte dell'ULTIMO MESE

⛔ **La ricerca si fa ALLORA, non oggi**: «l'ultimo mese» è l'ultimo mese *rispetto al rilascio*.
Una ricerca fatta il 07/09 e riusata a ottobre non è stato dell'arte, è un ricordo.

Cosa cercare, e con che criterio:

- **Deploy engineering 2026**: cosa si considera oggi il minimo per distribuire un'applicazione
  desktop Node — firma e provenienza degli artefatti (SLSA, `attest-build-provenance`), riproducibilità
  della build, SBOM, verifica dell'integrità all'installazione, canale di aggiornamento.
- **Distribuzione senza installer**: uno zip + `npm ci` è accettabile per una `v0.1`? Cosa fanno oggi
  i progetti confrontabili, e qual è il primo scoglio per chi non ha Node.
- **Prima esecuzione**: quanto ci mette un utente nuovo dal download alla prima risposta, e quali
  passi si possono togliere.
- **Note di rilascio e versionamento**: cosa si aspetta chi legge una `v0.1` (limiti dichiarati,
  requisiti, cosa NON fa ancora).

Prodotto: una tabella con **riga → cosa manca → chi decide → costo misurato**, e le fonti con la
data. Senza citazione, la ricerca non è stata fatta.

---

## 2 · Le prove fresche, da UTENTE APPENA INSTALLATO

⛔ Non le prove che abbiamo già: quelle girano su una macchina dove tutto è configurato. Qui si parte
da zero, e ogni attrito conta come difetto.

Il giro, nell'ordine in cui lo vive una persona:

1. **Scarico** l'artefatto dalla pagina delle release. Quanto pesa? Il nome dice cosa contiene?
2. **Scompatto** e leggo il README: mi dice cosa serve (Node 24, Chrome) e cosa fare, senza saltare
   nulla?
3. **Installo** (`npm ci`) e **avvio**. Quanti secondi al primo schermo?
4. **Prima schermata**: capisco dove sono e cosa fare? L'intro chiede quello che serve e nient'altro?
5. **La chiave**: senza `OPENROUTER_API_KEY` cosa vedo? Il messaggio dice *cosa* fare, o è un errore
   tecnico?
6. **Prima sessione vera**: scelgo una cartella, scrivo un compito, guardo il giro fino alla fine.
7. **Le cinque superfici**: chat, terminale, review, browser, impostazioni. In ognuna: c'è qualcosa
   che promette e non fa?
8. **Chiudo e riapro**: ritrovo la sessione? Lo stato è quello vero?
9. **Fermo un giro** a metà, **riprendo** la sessione: funziona come promesso?
10. **Disinstallo**: cosa resta sul disco, e lo dico da qualche parte?

Ogni passo: **screenshot guardato**, tempo misurato, e ogni attrito annotato come riga di difetto —
anche quelli che a noi sembrano ovvi, perché a chi arriva non lo sono.
⛔ La prova vale solo su una macchina che **non ha mai visto TALOS**: qui il pacchetto è già stato
provato dopo `npm ci` (07/09, 5,2 MB, giro vero concluso), ma su questa macchina Node e la chiave
c'erano già.

---

## 3 · La UX: pulita, rifinita, fluida

Tre parole, tre criteri misurabili — non impressioni.

**Pulita** — niente che prometta e non faccia; niente nomi tecnici a schermo; niente doppioni di
etichette per la stessa cosa. Si misura contando: controlli senza gestore, stringhe tecniche visibili,
sinonimi della stessa azione (oggi il cancello statico e la coda dei debiti già lo fanno in parte).

**Rifinita** — allineamenti, spaziature e stati coerenti su tutte le schermate, a tre viewport e due
temi. Si misura con la spazzata già descritta in `A-bis` del piano: altezza delle testate, padding,
gap, presenza delle stesse azioni. Ogni scostamento è una riga.

**Fluida** — il tempo tra un gesto e la sua risposta visibile. Si misura, non si sente: apertura
delle schermate, apertura dei dialoghi, primo pezzo di risposta, scorrimento della chat lunga.
⛔ E si misura nel **browser vero dell'owner**, con la sua accelerazione: un p95 preso da un Chromium
headless non dice niente sul suo schermo (lezione del 02/09).

---

## Come si chiude

Un solo documento finale — `.claude/REPORT-PRE-RELEASE-<data>.md` — con:
la tabella di marcia coi suoi «fatto/non fatto», il taccuino delle dieci prove da utente nuovo con
le foto, la tabella delle tre misure UX prima/dopo, e la riga che dichiara **cosa resta aperto e
perché si rilascia lo stesso**. Quella riga è obbligatoria: una release senza debito dichiarato è
una release che mente.
