# Sidebar desktop — checkpoint 01

Data: 17 settembre 2026. Base del codice: `13f65c15cdeaf8986b882993a0773cdeafb867d2`.

**Stato: primo blocco implementativo verificato in isolamento. Refactor complessivo non completato; non pronto per il merge.**

L'audit iniziale e il benchmark sono in [sidebar-desktop-refactor-2026-09-17.md](sidebar-desktop-refactor-2026-09-17.md). Questo documento consuntiva il blocco A1 che nell'audit era ancora pianificato.

## Area, problema e soluzione

Due interventi in `frontend/src/components/session-item.js`, senza cambiare il markup, i token, i listener, la tassonomia condivisa, i contatori, la selezione o la politica di ordinamento.

1. **Novità temporale.** Prima, una data futura soddisfaceva `adesso - risposta <= 60.000` e accendeva il segnale. Dopo, il tempo trascorso deve anche essere non negativo. Restano inclusi gli esatti 60 secondi e resta esclusa la sessione corrente. Nessun evento viene cancellato: cambia solo la decisione di mostrare il segnale.
2. **Chiusura dei rami.** Prima, la determinazione di `ultima` copiava ogni suffisso dell'elenco con `slice`. Dopo, uno stack chiude le righe quando incontra il primo successore non discendente. Ogni riga entra ed esce al massimo una volta. Ordine, profondità, nomi distintivi e riferimenti alle sessioni rimangono invariati.

Alternative scartate: riscrivere tutto l'ordinamento, cambiare le priorità delle sessioni, introdurre virtualizzazione senza un profilo dell'app, aggiungere dipendenze o un nuovo stato globale. Il beneficio qui è togliere lavoro ridondante senza cambiare un interaction pattern.

## File del blocco

- `harness-ui/frontend/src/components/session-item.js`: due soli punti di modifica.
- `harness-ui/frontend/tests/unit/session-item-stabilita.test.mjs`: 22 test, incluse prove con 5, 50, 200 e 1.000 sessioni.
- Questo resoconto. Il documento di audit è stato committato prima dell'intervento.

## Verifiche effettivamente eseguite

| Verifica | Risultato |
| --- | --- |
| SHA Git del sorgente di base ricostruito localmente | `4d374130485a0685b98c06f4a7d296275f743a39`, identico al blob letto dal repository. |
| SHA Git del modulo consumo usato nelle prove | `a19e3280781e059432b4433cc127bec70d36e85f`, identico al repository. |
| Nuova suite sulla base, prima della correzione | 20 passati, 2 falliti: futuro di 1 ms e futuro di un giorno. Nessun altro fallimento nella suite isolata. |
| Nuova suite dopo la correzione | 22 passati, 0 falliti, 0 saltati. |
| Confronto differenziale separato fra funzione originale e modificata | 96 snapshot deterministici: 24 per ciascuna dimensione 5/50/200/1.000; output completo identico. |
| Sintassi del componente e del nuovo file di test | `node --check` passato per entrambi. |
| SHA Git del componente verificato dopo la modifica | `744f66c73c3f1891812eb4bd8161df81c3e3988c`. |

La suite copre confini della finestra temporale, date mancanti/nulle/invalide/future, sessione corrente, giri cumulativi e fermati, ordine e nomi delle deleghe, immutabilità dello snapshot, orfane, cicli, auto-riferimenti e chiusura dei rami a più profondità. Il double DOM serve solo alla costruzione della riga: non costituisce una prova di focus, layout, contrasto o screen reader.

### Misura delle copie dei suffissi

Strumentazione locale delle chiamate a `Array.prototype.slice` durante l'esecuzione della funzione su elenchi piatti. Non è un benchmark di rendering né una misura dei byte totali allocati.

| Sessioni | Riferimenti copiati da `slice`, prima | Dopo |
| ---: | ---: | ---: |
| 5 | 10 | 0 |
| 50 | 1.225 | 0 |
| 200 | 19.900 | 0 |
| 1.000 | 499.500 | 0 |

Sono eliminate le copie dei suffissi, **non tutte le allocazioni**. La passata finale diventa lineare; l'intera funzione mantiene i sort e gli altri passaggi preesistenti. Non viene rivendicato un miglioramento percentuale dei tempi dell'app.

## Ambiente e riproducibilità

Le prove sopra sono state eseguite con Node **22.16.0**, non con il runtime richiesto dal progetto (`>=24.18.0 <27`). Il clone locale non è disponibile per un errore DNS; il codice è stato letto e scritto tramite il connettore GitHub.

Nella prova isolata, i file `session-item.js` e `consumo-sessione.js` sono i sorgenti verificati tramite SHA. Un loader locale sostituisce soltanto l'import del formatter `nomeModelloUmano` da `chat-foot.js` con una funzione che **lancia un errore se chiamata**. Nessuna prova di questo blocco lo chiama: la formattazione GGUF e il grafo completo delle dipendenze della chat non sono quindi stati verificati. Questo loader e la copia della baseline non sono aggiunti al prodotto o alla suite del repository.

Comando eseguito nell'area di verifica isolata:

```sh
node --import ./local-verification/register.mjs --test harness-ui/frontend/tests/unit/session-item-stabilita.test.mjs
```

Per eseguire la nuova suite nel checkout completo, con il runtime del progetto e le dipendenze reali, il comando da verificare è:

```sh
cd harness-ui/frontend
node --test tests/unit/session-item-stabilita.test.mjs
```

Quest'ultimo percorso completo **non è stato eseguito qui**. Non sono stati eseguiti la suite generale, lint/typecheck globali, build desktop, test browser, gate visuali o CI. I 22 test isolati non sostituiscono quei controlli. I due fallimenti riprodotti sulla base riguardano solo la nuova suite di regressione, non la suite preesistente del progetto.

## Review e rischi residui

Diff del componente riesaminato integralmente: cambiati solo il calcolo finale di `ultima` e la guardia temporale. Nessuna dipendenza nuova, CSS, colore hardcoded, timer, API, modifica del backend o del routing. Gli input congelati rimangono immutati; le modifiche di `ultima` avvengono solo su oggetti derivati non ancora esposti al chiamante.

Non sono risolti dal checkpoint: refresh che ricrea tutta la lista, focus durante quel refresh, fonte realtime aggregata, replay/recovery, indicazione locale di stale/offline, dati parziali, semantica della selezione multipla, parsing del modello dal testo e scadenza autonoma della novità. Sono descritti nell'audit e non vanno nascosti dal risultato positivo delle prove isolate.

Il bundle frontend è utilizzato anche dall'host embedded: non sono cambiati file mobile o tablet, ma la verifica integrata dei consumatori resta necessaria. La tassonomia condivisa con Board è intenzionalmente invariata.

## Blocco successivo

Completare il contratto della sorgente eventi e separare snapshot/replay/freschezza; introdurre riconciliazione per `sessionId` con identità DOM e focus preservati. Poi verificare layout, accessibilità e comportamento visuale della sidebar nel runtime desktop reale. La PR deve restare in bozza fino al completamento dei requisiti e dei gate mancanti.
