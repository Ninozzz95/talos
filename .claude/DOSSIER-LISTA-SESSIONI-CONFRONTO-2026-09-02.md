# Dossier — la lista sessioni: TALOS contro Claude, Codex e Hermes

> Richiesta dell'owner, 02/09: «possiamo fare un po' come fa Claude, che
> nella lista delle sessioni ci sono gli spinner che mostrano il
> caricamento, l'esito, l'ultimo messaggio — fai una ricerca dei
> competitor, punti deboli, punti di forza e miglioramento di tutti i
> punti di TALOS».
>
> Screenshot di riferimento fornito dall'owner: l'app mobile Claude,
> sezione «Codice» — righe con icona, nome, pallino verde + «Connesso»,
> repo, timestamp, e per una sessione **l'ultimo messaggio** in una bolla
> sotto la riga.

## 1. Cosa mostrano gli altri, verificato

### Claude Code (app mobile + Remote Control)

- Riga: icona del tipo di sessione, **pallino di stato verde** quando
  online, nome, repo, quando.¹
- **L'ultimo messaggio in anteprima** sotto la riga (visibile nello
  screenshot dell'owner: *«send the zip to ChatGPT yourself; agent
  resumes at step 3.d»*).
- Stati tracciati: **Working · Needs Approval · Waiting · Idle**, più
  *Compacting* (compattazione in corso).²
- Uno **spinner** mentre lavora, con suggerimenti a rotazione dentro lo
  spinner stesso.³

### Codex (`codex agents`, dashboard TUI, dalla 0.149.0)

- Dashboard a schermo intero che carica le sessioni radice dall'app
  server condiviso, **con lo stato dei sotto-agenti riflesso in ogni
  riga**.⁴
- Riga: nome o **anteprima**, poi timestamp, **cwd** e **branch**.
  Vista densa di default, comoda come alternativa.⁵
- Ricerca, raggruppamento **per progetto o per stato**, ordinamento per
  aggiornato/creato/cwd. Si aggiorna sulle notifiche del thread
  **preservando selezione e preferenze di vista**.⁴
- ⛔ **Punto debole documentato**: mancano *«last event received»*,
  *«last review attempted»* e **il motivo del fallimento** per
  repository.⁶ E la dashboard d'uso ha un difetto di onestà noto: mostra
  quota disponibile mentre la CLI rifiuta per limite raggiunto.⁷

### Hermes (dashboard web, `hermes dashboard`)

- Riga: titolo, **icona della piattaforma di origine** (CLI, Telegram,
  Discord, Slack, cron), **modello**, **numero di messaggi**, **numero
  di tool call**, quanto tempo fa era attiva.⁸
- Pagina stato: sessioni attive negli ultimi 5 minuti, le 20 più
  recenti con modello, messaggi, **token** e **anteprima della
  conversazione**, auto-aggiornata ogni 5 s.⁸
- Ricerca **full-text su tutto il contenuto dei messaggi**, cronologia
  espandibile con ruoli a colori, blocchi tool-call ripiegabili, e un
  **pulsante Riprendi** sulla riga.⁸
- Filtro per **costo** (`--min/--max-cost`), con *«actual falling back
  to estimated»* — il costo reale se c'è, stimato se non c'è.

## 2. Cosa mostra TALOS oggi

Riga (`aggiornaElencoSessioniReali`, `app.js`): **nome** (+ « · fork»),
**una stringa di stato** (`concluso` / `in corso · live`), **l'ora**.
Niente altro.

⭐ **Ma il server ne manda già molto di più.** `GET /api/v1/sessions`
restituisce per ogni sessione, verificato dal vivo:

```
sessionId · taskId · nome · avviataAlle · conclusa · forkDa · modello ·
modelloPlanner · reasoning · permessi · permessiPerAttrezzo · provider ·
runtimeId · modelId · fallbackProvider · interrotta ·
inAttesaApprovazione · ultimoEsito · usage{prompt_tokens,
completion_tokens, cached_tokens, giri}
```

⇒ **Il divario non è di dati, è di resa.** `ultimoEsito`
(successo/errore), `interrotta`, `inAttesaApprovazione`, `modello`,
`usage` e `giri` esistono già e non arrivano a schermo.

## 3. Punti di forza di TALOS — dove siamo già avanti

1. ⭐⭐⭐ **`inAttesaApprovazione` come dato di prima classe.** Claude
   ha lo stato *Needs Approval* nella lista; noi abbiamo il **campo
   vero** e non lo mostriamo. Non dobbiamo inventarlo: dobbiamo
   renderlo.
2. ⭐⭐ **Stato onesto a tre valori** (concluso / interrotto / in corso),
   già distinto lato server, invece di dedurre «attivo» dalla presenza
   di un processo — il difetto che Codex paga con la dashboard che
   contraddice la CLI.⁷
3. ⭐⭐ **`ultimoEsito` esplicito** (successo/errore). È esattamente il
   *«failure reason»* che manca a Codex per repository.⁶
4. ⭐ **Cache token già contati** (`cached_tokens`): nessuno dei tre lo
   espone per sessione nella lista.
5. ⭐ **Selezione multipla e menu contestuale** già presenti sulla riga.

## 4. Punti deboli di TALOS — il divario vero

| | Claude | Codex | Hermes | TALOS |
|---|---|---|---|---|
| spinner/stato vivo | ✅ | ✅ | ✅ (5 s) | ⛔ solo testo |
| esito ultimo giro | parziale | ⛔ | ✅ | **dato c'è, non reso** |
| in attesa di approvazione | ✅ | — | — | **dato c'è, non reso** |
| ultimo messaggio in anteprima | ✅ | ✅ | ✅ | ⛔ **manca il dato** |
| modello sulla riga | — | — | ✅ | **dato c'è, non reso** |
| token / costo | — | ✅ (separato) | ✅ | **dato c'è, non reso** |
| ricerca full-text nei messaggi | — | ✅ | ✅ | ⛔ solo per titolo |
| filtro/raggruppamento per stato | ✅ | ✅ | ✅ | ⛔ |
| cwd / branch sulla riga | — | ✅ | — | ⛔ |
| origine (CLI/telefono/cron) | ✅ | — | ✅ | ⛔ |

⛔ **Il difetto peggiore non è l'estetica: è che una riga non dice se il
giro è andato bene.** Una sessione fallita e una riuscita si leggono
identiche («concluso»).

## 5. Miglioramenti proposti, in ordine di rapporto valore/costo

### A — Gratis: rendere ciò che il server già manda (nessun backend)

1. **Pallino di stato + esito** sulla riga: in corso (spinner) ·
   in attesa di approvazione · interrotta · conclusa con successo ·
   conclusa con errore. Cinque stati, tutti già nei dati.
   ⛔ Mai il solo colore: glifo + parola, come già fatto per il verdetto
   di compatibilità dei modelli.
2. **Modello** sulla riga (come Hermes).
3. **Token e giri** in forma compatta (come Hermes), coi valori veri di
   `usage` — e «non tracciato» dove mancano, mai uno zero finto.

### B — Piccolo backend: l'ultimo messaggio

`session-registry` conserva già `messaggiFinali`. Serve esporne
**l'ultimo, troncato**, in `GET /api/v1/sessions`. È la cosa che
l'owner ha indicato per prima nello screenshot, ed è l'unica del gruppo
A+B che richiede lavoro lato server.

### C — Dove possiamo superarli, non solo pareggiare

1. ⭐⭐⭐ **Il motivo del fallimento sulla riga.** Codex ha proprio
   questo buco documentato.⁶ Noi abbiamo `ultimoEsito`: mostrare *perché*
   è fallita, non solo che è fallita, è un vantaggio diretto.
2. ⭐⭐ **«In attesa di approvazione» che porta all'approvazione.**
   Claude mostra lo stato; noi possiamo far sì che la riga sia
   **l'azione** — un clic e sei sul punto che aspetta il tuo sì.
3. ⭐⭐ **Costo reale vs stimato, dichiarato.** Hermes fa *«actual
   falling back to estimated»*; noi abbiamo già la disciplina di non
   inventare numeri, quindi possiamo dire «non tracciato» dove gli altri
   stimano in silenzio.
4. ⭐ **Filtro per stato** con i nostri cinque stati veri.

### D — Più avanti

Ricerca full-text nei messaggi (Codex e Hermes ce l'hanno, noi
cerchiamo solo nel titolo); origine della sessione; cwd/branch.

## 6. Rischio noto da evitare

⛔ Codex paga un difetto che ci riguarda da vicino: la dashboard mostra
uno stato che **contraddice** la realtà (quota disponibile a schermo,
CLI che rifiuta).⁷ Ogni indicatore che aggiungiamo deve venire da un
fatto osservato e restare **«non osservato»** quando non lo è — la
regola che già applichiamo ovunque.

---

**Fonti**: ¹[Claude Code Remote Control](https://code.claude.com/docs/en/remote-control) ·
²[Session dashboard (issue #35607)](https://github.com/anthropics/claude-code/issues/35607) ·
³[Claude Code changelog](https://claudefa.st/blog/guide/changelog) ·
⁴[Codex changelog](https://developers.openai.com/codex/changelog) ·
⁵[Redesign session picker (PR #20065)](https://github.com/openai/codex/pull/20065) ·
⁶[CLI Agent Dashboard (issue #30713)](https://github.com/openai/codex/issues/30713) ·
⁷[Codex quota/dashboard mismatch (issue #30041)](https://github.com/openai/codex/issues/30041) ·
⁸[Hermes Web Dashboard](https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard)
