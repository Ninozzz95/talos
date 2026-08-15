# Il banco di prova delle persone vere

> Owner 2026-08-15: «dovrai preparare dei test con workflow, che farai tu senza
> sub agenti, di **diverse personalità e obiettivi umani e di utenti reali**, con
> **diverse richieste diverse tra di loro e imprevedibili**».

---

## 0. Perché ADESSO e non dopo la piattaforma di coding

Il 15 agosto, in una giornata sola, sono usciti cinque difetti seri: WhatsApp
che riempie e non invia, la posizione inventata a 600 km, l'occhio elencato e mai
legato, l'accessibilità persa alla chiusura, la scia nel posto sbagliato.

⛔ **Nessuno dei cinque è stato trovato da un test.** Tutti e cinque li ha
trovati l'owner usando l'app.

E nello stesso giorno, due volte, ho misurato la cosa sbagliata con convinzione:
la scala dell'audio (tarando soglia e guadagno a valle del guasto) e i
`resource-id` (4%, interrogando il contenitore invece del sottoalbero).

⇒ Da qui la ragione, che non è «più test è meglio»: **la navigazione dinamica ha
bisogno di un metro PRIMA di essere costruita**. Senza, si misura il progresso
contro ciò che ha immaginato chi la costruisce — ed è come nascono i due errori
qui sopra.

⛔ Il rischio accettato: la piattaforma di coding cambierà l'harness e qualche
prova andrà rifatta. Ma una prova che descrive **cosa vuole una persona**
sopravvive al cambio; muore quella che descrive **come lo fa**. Quindi si
scrivono le prime, e le seconde solo dove servono davvero.

---

## 1. ⛔ Che cosa NON è questo banco

- **Non sono unit test.** Ce ne sono 5.143 e sono verdi, e nessuno dei cinque
  difetti li ha fatti diventare rossi.
- **Non è un elenco di frasi.** «Una frase sola prova una frase sola»: un banco
  fatto di dieci frasi fisse diventa un vocabolario da imparare a memoria.
- **Non è un sub-agente.** L'owner è esplicito: «che farai tu **senza sub
  agenti**». Le prove le esegue chi le sa leggere, sul dispositivo.

---

## 2. Le personalità — e perché queste

Non «utente 1, utente 2». Ogni persona qui rompe TALOS **in un modo diverso**, e
ognuna è tarata su un difetto già visto.

| persona | come parla | cosa rompe |
| --- | --- | --- |
| **Chi ha fretta** | frasi mozze, niente contesto: «shadina, arrivo» | manca il destinatario, manca l'app, manca il verbo |
| **Chi è prolisso** | tre richieste in una frase, con incisi | l'agente ne esegue una e dice «fatto» |
| **Chi si corregge** | «no aspetta, non quello — l'altro» | lo stato a metà, e il rifare due volte |
| **Chi dà per scontato** | «mandaglielo» senza dire a chi | il modello INVENTA, come i ristoranti a Guidonia |
| **Chi non sa i nomi** | «quel coso per gli adesivi», «la roba verde» | il grounding senza etichetta — il pulsante sticker |
| **Chi cambia idea a metà** | interrompe mentre TALOS agisce | l'azione a metà, il rientro, il doppio invio |
| **Chi parla misto** | «apri lo store e cerca *Telegram*» IT+EN | i sinonimi d'interfaccia fra le due lingue |
| **Chi chiede l'impossibile** | «mandalo su un'app che non ha» | deve DIRLO, non premere qualcosa di simile |

⛔ L'ultima riga è la più importante: **metà delle prove devono essere richieste
che TALOS non può soddisfare.** Un banco fatto solo di cose che funzionano
misura la fortuna, non la robustezza. È la regola «si prova anche al contrario».

---

## 3. Gli obiettivi — misurati sull'esito, non sulla chiamata

Ogni prova dichiara **cosa deve essere vero alla fine**, sul telefono:

```
OBIETTIVO      il messaggio è nella conversazione di Shadina
NON            il tool è stato chiamato
NON            TALOS ha detto «inviato»
```

⇒ È già come funziona `TalosObiettivoFinito`: tre prove indipendenti sullo
schermo. Il banco usa lo stesso metro, che è l'unico che non si può ingannare.

E gli **anti-obiettivi**, che valgono quanto gli altri:

```
NON DEVE       aprire un'app che non era stata nominata
NON DEVE       dire «fatto» quando le prove sono meno di due
NON DEVE       riprovare da solo un invio non confermato
NON DEVE       accendere il GPS per una domanda che non riguarda un posto
```

---

## 4. La forma di una prova

```yaml
persona:   chi-ha-fretta
richiesta: "shadina arrivo fra 10"
contesto:  WhatsApp aperto sulla chat di un altro
obiettivo:
  - la conversazione APERTA è quella di Shadina
  - il messaggio è nella conversazione, non nel campo
  - TALOS ha detto una frase sola
mai:
  - non deve mandarlo alla chat che era aperta
```

⛔ `contesto` non è decorazione: metà dei difetti di oggi dipendevano da **dove
si trovava il telefono** quando è arrivata la richiesta.

---

## 5. Come si esegue

1. Il telefono si porta nel `contesto` dichiarato — è un passo, non un'assunzione.
2. La richiesta entra **come la darebbe la persona**: scritta o a voce.
3. Si misura l'obiettivo **sullo schermo**, con le tre prove.
4. ⛔ Ogni prova che fallisce si ferma e si guarda: uno screenshot ispezionato
   vale più di dieci righe rosse.

---

## 6. L'ordine

1. **Otto prove, una per personalità**, sui difetti già chiusi oggi — servono da
   rete: se una torna rossa, abbiamo perso qualcosa che avevamo.
2. La navigazione dinamica si costruisce **contro questo metro**.
3. Poi si allarga: tre richieste per personalità, e le imprevedibili.

⛔ La (1) prima della navigazione, non dopo: è tutto il senso di farlo adesso.
