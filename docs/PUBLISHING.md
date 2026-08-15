# Il piano di pubblicazione

> Owner 2026-08-15: «la repo non è ancora pubblica, consigli di farlo adesso?
> Dobbiamo anche rifinire e spingere la repo al pubblico, voglio un piano di
> publishing perfetto e per questo analisi super approfondita sul web».

---

## La risposta breve: NO, non adesso. Fra tre giorni sì.

Non per prudenza generica. Ci sono **cinque cose misurabili** che oggi mancano, e
ognuna ha un costo preciso se si pubblica senza.

| cosa manca | cosa succede se pubblichi lo stesso |
| --- | --- |
| **CI** | il badge «build» o è assente (sembra abbandonato) o è **falso** |
| **Issue e PR template** | la prima segnalazione arriva senza versione, senza telefono, senza log: irrisolvibile |
| **Una demo visiva** | la ricerca dice che si decide in **30 secondi**; un blocco di testo non li supera |
| **Il banco di prova** | un contributore non ha modo di sapere se ha rotto qualcosa |
| **Il modello italiano** | sta finendo di addestrare adesso: pubblicare ora significa pubblicare una versione che invecchia in un'ora |

⛔ E la sesta, che non è una lista di controllo: **una repo pubblica riceve
issue**. Se nessuno risponde per una settimana, la prima impressione diventa
«progetto morto», e quella non si recupera con un commit.

---

## Cosa dice la ricerca (2026-08-15)

### Sui README

Fonti: guide 2026 su struttura README, template e adozione.

- **Piramide rovesciata.** «The most critical information comes first… a casual
  visitor reads sections 1-4, a potential user reads through section 6, a
  contributor reads the entire document.»
- **Trenta secondi.** «Most developers decide whether to keep going within about
  30 seconds… if the README doesn't make its value obvious and fast, the visitor
  leaves.»
- **La forma che converte**: immagine sopra la piega, quick-start **entro le
  prime 200 parole**, una GIF di dimostrazione, **quattro badge funzionali**,
  una FAQ.
- **Lunghezza**: 800–1.500 parole.
- «Badges are not decoration — they signal professionalism and trustworthiness.»

⇒ ⛔ E il rovescio della medaglia: un badge che mente è peggio di un badge
assente. Il badge «build passing» va messo **dopo** che la CI esiste, non prima.

### Sul lancio

- **Issue template** per bug e richieste, e **PR template**: senza, la prima
  segnalazione arriva senza le informazioni che servono a riprodurla.
- **CI** con badge di stato su `main`.
- **Release taggata**, con le note generate da GitHub.
- **Show HN**: martedì–giovedì, **9:00–12:00 ET** (15:00–18:00 ora italiana).
  Per progetti di nicchia, domenica 19:00 ET.
- ⭐ **Il commento del maker subito dopo il post**: perché l'hai costruito, lo
  stack, e **una limitazione onesta**. «Showing you're serious and transparent.»
- Ordine di grandezza: **~1,4 stelle per upvote** entro 48 ore.

---

## Il piano, in tre giorni

### Giorno 1 — le cose che un contributore trova per prime

1. **CI (GitHub Actions).** Un workflow che gira su ogni PR:
   `npm ci`, `npm run typecheck`, `npx vitest run`, il gate del grafo d'avvio.
   ⛔ Non la build Android: richiede l'SDK e allunga il giro a ogni PR. La build
   nativa gira su tag.
2. **Issue template** (bug / richiesta) e **PR template**. Il template del bug
   chiede: telefono, versione Android, ROM, se il ponte era accoppiato, se
   l'accessibilità era legata. Sono le cinque cose che ogni difetto di questo
   progetto ha richiesto per essere riprodotto.
3. **Il badge della CI** nel README, appena la CI è verde davvero.

### Giorno 2 — la prima impressione

4. **La demo.** Una registrazione dello schermo di 15–20 secondi: «manda a
   Shadina che sto arrivando» → WhatsApp si apre, il messaggio parte, la barra
   torna. È l'unica cosa che spiega TALOS in un colpo.
   ⛔ Con un contatto finto e un testo neutro: nessun nome vero, nessun numero.
5. **README rifiniti** sulla forma che la ricerca indica — demo sopra la piega,
   quick-start subito, FAQ in fondo.
6. **Rileggerli da estraneo.** Ogni riferimento a «lane», «charter», «M0» o a un
   documento che non esiste più nella repo va tolto: chi arriva non sa cosa
   sono, e un link morto dice «qui dentro non è tutto».

### Giorno 3 — il banco di prova, e poi si pubblica

7. **Il banco delle persone vere** (vedi il piano dedicato). ⛔ Serve *prima*
   della pubblicazione per una ragione precisa: senza, un contributore che
   propone una modifica non ha modo di sapere se ha rotto WhatsApp, il rientro o
   la posizione — e nemmeno noi.
8. **La cartella pubblicabile**: `scripts/prepara-la-pubblicazione.ps1 -Esegui`.
   Costruisce una copia senza cronologia, senza documenti interni, con i
   controlli di sicurezza. La repo di lavoro non si tocca.
9. **La repo NUOVA**, mai stata un fork privato di questa (CFOR: ciò che c'era
   in un fork privato prima della pubblicazione diventa pubblico).
10. **Tag `v0.1.0`** e release con le note generate.

### Poi — e solo poi — l'annuncio

11. **Show HN**, martedì–giovedì fra le 15:00 e le 18:00 italiane.
12. **Il commento del maker**, scritto prima e incollato subito dopo. Deve
    contenere:
    - perché esiste: «volevo un assistente che non mentisse su cosa ha fatto»
    - lo stack, in una riga
    - ⭐ **una limitazione onesta**. Qui ce n'è una vera e forte: *TALOS non può
      premere «invia» senza il servizio di accessibilità, e su alcune ROM cinesi
      quel servizio va riacceso a mano dopo che il sistema lo spegne.* Dirlo è
      più credibile di qualunque elenco di funzioni.

---

## ⛔ Le tre cose da non fare

1. **Non pubblicare senza CI** e poi metterci il badge. Un badge che mente è
   peggio di nessun badge.
2. **Non annunciare lo stesso giorno in cui pubblichi.** La repo deve stare in
   piedi da sola per qualche giorno: se il primo visitatore trova un README con
   un link morto, quel visitatore non torna.
3. **Non usare un fork privato come repo pubblica.** È il rischio CFOR: tutto
   ciò che il fork conteneva prima diventa pubblico insieme.

---

## Lo stato di oggi

Già fatto:

- ✅ 202 documenti interni fuori dall'indice, tutti ancora su disco
- ✅ nessun segreto vero fra i file tracciati (le sole chiavi trovate sono finte,
  dentro i test che verificano la censura dei segreti)
- ✅ dati personali via dal codice: la rete di casa, il seriale del telefono, il
  percorso dell'SDK — e **il nome utente dentro `talos.onnx`**, che finiva
  nell'APK
- ✅ `LICENSE` (Apache-2.0), `NOTICE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md`
- ✅ `scripts/prepara-la-pubblicazione.ps1`, con i controlli e senza toccare
  l'originale

Manca tutto ciò che sta nei tre giorni qui sopra.
