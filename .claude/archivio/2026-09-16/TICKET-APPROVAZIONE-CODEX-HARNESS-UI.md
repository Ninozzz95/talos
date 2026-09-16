# Ticket — Audit finale e autorizzazione Codex Harness UI

## Obiettivo

Eseguire un ultimo audit **in sola lettura** della ricerca e del ledger di
Harness UI, raccogliere **tutte insieme** le eventuali domande decisionali
ancora realmente necessarie e stabilire se l'implementazione può partire.

Non implementare, non copiare il mockup, non avviare server o report, non
creare commit e non modificare TALOS-BANCO durante questo ticket.

## File obbligatori da leggere integralmente

1. `C:\Users\Antonino\Desktop\projects\AVM\.claude\DECISIONI-CODEX-HARNESS-UI.md`
2. `C:\Users\Antonino\Desktop\projects\AVM\.claude\DOSSIER-RICERCA-CODEX-HARNESS-UI.md`
3. `C:\Users\Antonino\Desktop\projects\AVM\.claude\LEDGER-CODEX-HARNESS-UI.md`
4. `C:\Users\Antonino\Desktop\projects\AVM\.claude\PROMPT-CODEX-HARNESS-UI.md`
5. `C:\Users\Antonino\Desktop\projects\AVM\.claude\PROPOSTA-CODEX-HARNESS-UI.md`
6. `C:\Users\Antonino\Desktop\projects\AVM\.claude\CONSEGNA-CODEX-HARNESS-UI.md`

## Percorsi da verificare in sola lettura

- Worktree di futura implementazione:
  `C:\Users\Antonino\Desktop\projects\AVM-harness-ui`
- Mockup sorgente:
  `C:\Users\Antonino\Desktop\projects\TALOS-RICERCHE\harness-ui-mockup-2026-08-20\talos-responsive-harness-mockup`
- Banco dati, esclusivamente read-only:
  `C:\Users\Antonino\Desktop\projects\TALOS-BANCO`
- Campagne iniziali:
  - `C:\Users\Antonino\Desktop\projects\TALOS-BANCO\esiti-22ago-progetti`
  - `C:\Users\Antonino\Desktop\projects\TALOS-BANCO\esiti-22ago-storia`

## Gerarchia da rispettare

La sezione 9 del registro decisionale è la decisione finale dell'owner e
sostituisce le risposte precedenti soltanto dove le contraddice.

Non riproporre come domande queste decisioni già chiuse:

1. **DEC-015 + DEC-054 — rapporto:** Harness UI non avvia processi. Legge
   `<campagna>/rapporto.txt` come blocco opaco. Il proprietario della corsa
   produce il file con redirect di shell quando la campagna è pronta.
2. I due `rapporto.txt` reali oggi non esistono: è una dipendenza esterna del
   gate, non una decisione progettuale e non è già soddisfatta.
3. **DEC-026 — costo:** fonte primaria `<harness>.costo.json`; fallback alla
   somma `costoUsd` delle righe marcata `~`; assenza `null`, mai zero.
4. Niente modifiche al codice o ai dati esistenti di TALOS-BANCO da parte della
   lane Harness UI.
5. Niente Vue/Vite/framework/dipendenze npm e nessun collegamento tecnico al
   commit mobile.
6. Una sola UI statica responsive per mobile e desktop.
7. Qualità da strumento interno: Chrome dell'owner, sei stati canonici del
   mockup, niente offline/IndexedDB/service worker, niente WCAG o performance
   come gate bloccanti.
8. Tutto il mockup entra; Board/Dashboard usa dati reali; il resto è dummy UI
   funzionante e localmente marcata `Demo UI · non collegato`.
9. Commit piccoli autorizzati durante l'implementazione; push sempre vietato
   senza nuova autorizzazione.
10. Alla fine di ogni step è obbligatorio un riepilogo semplice, esaustivo,
    non tecnico ed esplicativo.

## Verifiche richieste al main agent

1. Confermare che dossier e ledger riflettano fedelmente le decisioni sopra.
2. Confermare che il ledger enumeri tutti i file, simboli pubblici, test RED,
   comandi GREEN, regressioni, gate reale, prova visibile e rollback.
3. Segnalare eventuali contraddizioni residue distinguendo chiaramente:
   - fatto osservato;
   - decisione già dell'owner;
   - vera nuova decisione necessaria.
4. Non trasformare una dipendenza esterna già identificata in una domanda.
5. Non inventare requisiti da prodotto pubblico.

## Domande decisionali — rispondere tutte insieme

### Q1 — Autorizzazione a iniziare

- **A — Approvo il ledger e autorizzo l'implementazione ora (consigliata).**
  Si implementa anche lo stato onesto `Rapporto non ancora prodotto`; il gate
  end-to-end dei report resta in attesa dei due file esterni.
- **B — Approvo il ledger ma si aspetta la produzione dei due `rapporto.txt`.**
  Nessun codice prodotto finché entrambi i file non esistono.
- **C — Non approvo ancora il ledger.**
  Il main agent deve elencare nel dettaglio le correzioni richieste prima di
  qualsiasi implementazione.

### Q2 — Trattamento del gate report durante l'implementazione

Questa domanda si applica soltanto se Q1 = A.

- **A — Gate parziale esplicito (consigliata).** I test con fixture e lo stato
  di assenza devono essere verdi; il test sui due report reali resta rosso/non
  soddisfatto finché li produce il proprietario delle corse. La feature non
  viene dichiarata interamente chiusa prima di allora.
- **B — Escludere temporaneamente il report dalla prima chiusura.** Il pannello
  viene implementato ma la sua integrazione reale diventa un ticket successivo
  esplicito. Non si finge che sia collegato.

### Q3 — Risultato dell'audit del main agent

Il main agent deve scegliere una sola conclusione e motivarla con riferimenti
precisi ai file:

- **A — Pronto (consigliata se non emergono omissioni).** Nessun'altra domanda
  decisionale; dopo le risposte Q1/Q2 può iniziare il lavoro autorizzato.
- **B — Non pronto.** Deve elencare **tutte insieme** le decisioni mancanti,
  ciascuna con 2-3 opzioni mutuamente esclusive e una raccomandata, senza
  riproporre decisioni già chiuse.

## Formato obbligatorio della risposta

```text
ESITO AUDIT: PRONTO | NON PRONTO

RISPOSTE OWNER
Q1: A | B | C
Q2: A | B | NON APPLICABILE

DECISIONI GIÀ CONFERMATE
- elenco breve e completo

EVENTUALI DECISIONI MANCANTI
- nessuna
oppure
- Q4 ... opzioni A/B/C, con raccomandata

DIPENDENZE NON ANCORA SODDISFATTE
- elenco esplicito, senza trasformarle in decisioni

RIEPILOGO SEMPLICE DELLO STEP
- cosa è stato controllato
- cosa significa per l'owner
- cosa resta prima del codice
```

Non basta rispondere genericamente “va bene”: l'esito, Q1 e Q2 devono essere
espliciti.
