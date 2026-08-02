# R-5 — Follow-up senza rete · Export · Ri-verifica (R12)

Fase 2 (Deep Research), ultima tappa. Dipende da R-4 (`b31e8ee`).
Riferimento: `specs/2026-07-26-deep-research-spec.md` §5.2, §5.3, §5.4.

---

## 1. Checkpoint di ricerca (REGOLA ZERO — prima del codice)

| Query | Fonti | Cosa ha cambiato nel disegno |
|---|---|---|
| `content drift web citations percentage changed 2026 reference rot` | studio longitudinale 20 anni (2005–2025, 2 886 citazioni); studi su content drift | **Oltre il 75% dei contenuti citati è cambiato entro tre anni.** E l'accessibilità crolla dall'**87%** (0–5 anni) al **38%** (oltre 10). Quindi il link morto è la metà visibile: quella pericolosa è il link vivo che adesso dice un'altra cosa, perché non ha niente che sembri sbagliato. |
| (stessa ricerca) | analisi su >1 M di riferimenti | 1 articolo su 5 ha riferimenti non più validi; fra quelli con riferimenti web, **7 su 10**. La ri-verifica non è una raffinatezza: è manutenzione. |
| `detect meaningful web page change ignore boilerplate simhash shingling` | Trafilatura (dedup), SimHash/Charikar, near-duplicate detection | La pratica è: togliere il contorno, estrarre il contenuto, fare shingle, confrontare con una soglia (0–3 bit ≈ identico; 9+ bit ≈ sostanzialmente diverso). **Ma per noi la domanda giusta non è «le due pagine sono uguali»**: è «quello su cui ci siamo appoggiati è ancora lì». Da qui la scelta del **contenimento** invece di una similarità simmetrica. |

---

## 2. Le tre decisioni non ovvie

1. **Contenimento, non similarità.** Una pagina che ha AGGIUNTO tre paragrafi non ci ha tolto niente, e chiamarla «cambiata» farebbe scattare l'allarme su ogni sito vivo. Si misura quanta parte del testo di allora è ancora presente oggi, in una direzione sola.
2. **Due misure di natura diversa, dette come tali.** «Quanto testo è sopravvissuto» è un'euristica con una soglia (95%) e viene presentata come tale. «I passaggi citati ci sono ancora?» è **esatto**, usa lo stesso confronto meccanico di R-4, e **è quello che decide se il rapporto regge ancora**: una pagina può essere riscritta da cima a fondo, e se le frasi che avevamo citato sono sopravvissute le citazioni valgono quanto il primo giorno.
3. **Irraggiungibile ≠ passaggi persi.** Se non riusciamo a leggere la pagina, non abbiamo guardato: dire «i passaggi non ci sono più» sarebbe una conclusione che non abbiamo tratto. E la riga che conta resta l'altra: *la fonte è sparita e il testo è ancora qui*, che è la frase che nessun concorrente può scrivere.

---

## 3. Cosa è stato costruito

- `src/lib/research/researchRecheck.ts` — il contenimento a shingle, la classificazione intatta/cambiata/irraggiungibile, e il ricontrollo dei passaggi citati con la stessa funzione esatta di R-4. Sequenziale: sono N richieste da un telefono verso i server di altri.
- `src/lib/research/researchRecheckDocument.ts` — il ricontrollo depositato in Libreria, perché un controllo che non lascia traccia va rifatto ogni volta che qualcuno se lo chiede.
- `talosResearchFollowUpPrompt` — la domanda di seguito risolta **sulle fonti già pagate**, con l'istruzione esplicita: nessuna ricerca nuova esiste, quindi se le fonti non rispondono si dice, non si riempie dalla memoria.
- `researchCheckedReport` — **una** funzione per due lavori. La sintesi a fine run e il follow-up di una settimana dopo differiscono solo nel prompt: leggono passaggi già su disco, tornano come affermazioni legate a quei passaggi, e vengono controllati da un modello che non li ha scritti. Scritti due volte sarebbero divergenti, e la metà divergente sarebbe quella che nessuno guarda.
- Stazione: **Ricontrolla le fonti**, **Esporta .md**, e la casella «Chiedi altro su questa ricerca» dentro il rapporto aperto.

---

## 4. Prova sul dispositivo (OnePlus Pad 3)

**Ri-verifica**, sulle 10 fonti vere della run FIAT:

```
Ricontrollate 10 fonti · 9 intatte · 0 cambiate · 1 non rispondono più
Le fonti che non rispondono più restano leggibili qui: il testo è stato
conservato il giorno della ricerca.
```

È il mockup della spec §5.4 con numeri veri — e una fonte è già sparita nel giro
di un'ora dalla ricerca originale.

**Follow-up** «chi era Giovanni Agnelli», risposto dalle sole 10 fonti già
raccolte, senza nessuna ricerca nuova:

> «Giovanni Agnelli, detto "il Senatore", fu un ex ufficiale di cavalleria, tra i
> fondatori e poi amministratore delegato e presidente della FIAT, che guidò fino
> alla morte nel 1945. **Le fonti disponibili non ne forniscono una biografia
> completa.**»

Quell'ultima frase è l'istruzione che funziona: dice cosa le fonti non coprono
invece di riempirlo da quello che il modello sa. Dieci affermazioni: 4
**sostenute**, 6 **in parte** — e il `partial` sta facendo lavoro vero, distingue
«il passaggio ne parla» da «il passaggio sostiene tutta la portata».

**Export**: il rapporto salvato sul telefono in Markdown, generato in locale.

---

## 5. Review critica avversariale — cosa NON è chiuso

| # | Rilievo | Stato |
|---|---|---|
| 1 | **Il follow-up costa e non lo dichiara**: 10 affermazioni × giudice = ~2 minuti e un mucchio di token, senza nessuna stima prima. È la stessa falla del costo di verifica di R-4, qui più visibile. | **APERTO.** |
| 2 | **Il ricontrollo non si riprende**: non è un passo del registro, quindi se l'app muore a metà si ricomincia da capo (e si ripagano le richieste già fatte). Il registro c'è ed è fatto apposta: è un innesto mancato, non un limite. | **APERTO.** |
| 3 | **PDF/DOCX non ci sono** — l'export è solo Markdown, come dichiarato: PDF e DOCX aspettano F2 e non vengono finti. | Voluto, F2. |
| 4 | La soglia del 95% è **una scelta**, non una misura: sotto, la pagina è «cambiata». Il numero esatto è mostrato accanto, così chi legge giudica da sé. | Accettato, dichiarato. |
| 5 | Il follow-up **non ha la porta della chat** (regola delle due porte): esiste la stazione, il tool chiamabile dal modello arriva col catalogo tool. | **APERTO — fase 5.** |
| 6 | Il ricontrollo confronta col testo conservato nei **dossier**; se un dossier è stato cancellato dalla Libreria, il confronto degrada a «tutto cambiato» invece di dire che manca il termine di paragone. | **APERTO**, piccolo. |
