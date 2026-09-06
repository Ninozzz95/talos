# T13-memoria — Memoria: gli strati, la correzione a mano, e quando è stata usata

> Prova d'uso sull'istanza 4188 (worktree AVM-harness-prove, base c1984d79), guidata come farebbe una persona. 2026-09-06 14:24

## Passi

- **apro Memoria** ✅
  - atteso: una destinazione della barra laterale
  - visto: schermo=schermoMemoria
- **senza sessione aperta** ✅
  - atteso: la pagina dichiara «Sono globali»: quindi il ricordo si deve vedere lo stesso
  - visto: Memoria1 ricordi · globali MemoriaQuello che TALOS ricorda di tePreferenze, fatti, procedure e regole salvati. Sono globali, disponibili alle tue conversazioni.1 ricordi TuttiPreferenzeFattiProcedureRegoleAggiorna Prefer
- **con la sessione che ha salvato il ricordo** ✅
  - atteso: il ricordo appena scritto compare
  - visto: Memoria1 ricordi · globali MemoriaQuello che TALOS ricorda di tePreferenze, fatti, procedure e regole salvati. Sono globali, disponibili alle tue conversazioni.1 ricordi TuttiPreferenzeFattiProcedureRegoleAggiorna Preferenza risposte brevi e in italianoAntonin
- **gli strati della memoria** ❌
  - atteso: C22: di lavoro · episodica · semantica, come Hermes
  - visto: schede: ["Tutti","Preferenze","Fatti","Procedure","Regole"]

> ⛔ **T13-memoria-D1** (medio): la Memoria divide per GENERE (["Tutti","Preferenze","Fatti","Procedure","Regole"]) e non per STRATO: C22 chiede «di lavoro, episodica, semantica»
- **quando è stata usata l'ultima volta** ❌
  - atteso: C23
  - visto: false

> ⛔ **T13-memoria-D2** (medio): nessun ricordo dichiara quando è stato usato l ultima volta (C23)
- **correggere un ricordo a mano** ✅
  - atteso: C23
  - visto: ["Tutti","Preferenze","Fatti","Procedure","Regole","Aggiorna","Leggi","Correggi"]

## Verdetto

**PASSA CON RISERVA** — difetti trovati: 2 (T13-memoria-D1, T13-memoria-D2).

> ⚠️ **Il verdetto vale per il codice alla base `c1984d79`.** Un altro agente sta riscrivendo queste
> superfici in parallelo.

## Il dato vero che sta dietro la prova

Un giro solo (sessione `bf0ebce5`, `glm-5.3-flash`) ha scritto per davvero un ricordo, una nota e
un'attività con i suoi attrezzi. Sul disco, `harness-ui/.memory-store/3cbf09ba….json`:

```json
{ "titolo": "Preferenza risposte brevi e in italiano",
  "contenuto": "Antonino preferisce risposte brevi e in italiano",
  "genere": "preference", "creataAlle": "…", "aggiornataAlle": "…" }
```

## Ispezione della foto

`foto/T13-memoria/01-memoria.png`: il ricordo **compare**, con titolo, contenuto, la pastiglia del
genere («Preferenza») e il pulsante «Leggi»; in fondo, in piccolo, «I ricordi sono conservati in
`.memory-store/` · la lettura qui non modifica il contenuto» (C29). Funziona.

> ⛔ **T13-memoria-D3** (minore): la testata scrive **«1 ricordi»** — due volte, nella striscia in alto
> e sotto la descrizione. Con uno solo si dice «1 ricordo». La pagina Attività, nella stessa
> posizione, declina bene («1 aperta · 0 fatte»): quindi è una svista, non una scelta
> — prova: `01-memoria.png`

> ⛔ **T13-memoria-D4** (minore): il record salvato non ha nessun campo che dica **quando è stato usato**
> (`creataAlle` e `aggiornataAlle` dicono quando è stato *scritto*): C23 non è implementabile senza
> toccare la forma del dato, non è una riga di interfaccia mancante
> — prova: `harness-ui/.memory-store/3cbf09ba-89ca-47ad-b33f-1cb37a85cd94.json`

### Sul confronto con Hermes (C22)

Le cinque linguette sono **Tutti · Preferenze · Fatti · Procedure · Regole**: è una divisione per
**genere del contenuto**. C22 chiede gli **strati** di Hermes — *di lavoro*, *episodica*, *semantica* —
che sono una divisione per **durata e provenienza**. Sono due assi diversi, e il campo sul disco si
chiama `genere`: anche qui la decisione tocca la forma del dato, non solo l'etichetta.

### Cosa funziona

- Il ricordo si legge, si cerca, si filtra; il pulsante **«Correggi»** esiste nel DOM della riga (C23,
  metà buona).
- La pagina dichiara **dove** vivono i ricordi e che la lettura non li cambia: è la cosa che rende la
  app ispezionabile (C29).

## Verdetto

**PASSA CON RISERVA** — 4 difetti (2 medi, 2 minori). La Memoria è il luogo che funziona meglio dei
sei: mostra dati veri, scritti da un giro vero, e dice dove stanno.

> Base del codice: `c1984d79` (worktree `AVM-harness-prove`, istanza sulla porta **4188**).
