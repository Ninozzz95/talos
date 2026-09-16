# Prompt per Astra — 05/09/2026, sera (dall'orchestratore Claude, per conto dell'owner)

> Da incollare così com'è. Sostituisce e completa la nota sul commit `c2985683`.

```
Astra, nota dall'orchestratore (Claude) — 05/09/2026, dopo la review del tuo commit c2985683.

1. Il tuo commit (dialogo «Modello e ragionamento», maniglie dei dialoghi) è ACCETTATO e già UNITO in lane/harness-desktop (fb0e5fda). Stile giusto, dentro il mockup, cancelli verdi anche sul mio albero: statico 135/135, componenti 24/24.

2. Una tua regola CSS rompeva il disegno approvato: `.talos-topbar:has([data-vistetab]){height:auto; flex-wrap:wrap}` faceva andare la testata su DUE righe con la quarta scheda «Browser». L'ho riportata su UNA riga: la testata si adatta NASCONDENDO (percorso ≤900px, «Comprimi» ≤820, «Comandi» ≤720 di larghezza della testata, via @container), mai andando a capo. Non rimetterla.

3. La tua scheda «Browser» nella testata non aveva `data-vaia`: gliel'ho aggiunto (`data-vaia="browser"`) e per ora apre la vista browser del monolite; quando innesti `#schermoBrowser` (parte B) usi quel canale, non una regia tua.

4. Prima di continuare: `git -C AVM-astra-anteprima merge lane/harness-desktop` (ultimo commit 81cc5cc5: roving tabindex sulle sessioni, anello di fuoco sulla maniglia del composer, testata a una riga, scheda Browser instradata).

5. Le maniglie dei dialoghi: nella parte B si innestano su `setupModalResize` del monolite (chiave `talos-harness-modal-sizes-v1`), non si duplica il gestore. Le rotte che il mockup promette e non ha (pin, Accetta/Scarta, ricevute, percorso dei progetti, schede terminale, costo) sono elencate in .claude/LEDGER-FASE-3-RICHIESTE-2026-09-05.md: nella parte B i pulsanti che le aspettano restano nascosti con `data-richiede="fase3"`, mai un pulsante che non fa niente.

6. Prossima consegna attesa: Intro con l'albero delle cartelle compatto (F3-F6, H16-H20), poi Palette con i 15 comandi, poi Model Lab. Un commit per consegna; nel ledger le tre domande: Cosa deve fare l'owner · Cosa fai tu dopo · Cosa rimane.

7. BROWSER — ordine dell'owner (05/09): «la pagina Browser deve essere esattamente come Hermes e Codex: schede tab, vero e proprio browser integrato nella app». Il tuo «lettore delle pagine acquisite» NON basta: è un visualizzatore di testo, non un browser. Ricerca fatta il 05/09/2026:
   - Hermes Desktop (hermes-agent.nousresearch.com/docs/user-guide/desktop; hermes-agent-lab.com «In-App Browser Lands», merge del 05/08/2026): browser in-app e «preview rail» come SCHEDE dell'albero di layout; l'agente apre pagine con `open_preview(url)` e le legge con `read_preview()` (paginato start/count) — legge la pagina che ha davvero aperto; pannello webview con annotazione degli elementi (si marca un elemento e l'agente lo trova e lo modifica).
   - Codex desktop (OpenAI, aprile 2026 — helpnetsecurity.com 17/04/2026, pasqualepillitteri.it): «in-app browser» come vista CONDIVISA fra persona e agente: carica pagine web o dev server locali, si allegano commenti visivi; con il plugin Browser l'agente clicca, scrive, ispeziona il DOM, fa screenshot e verifica le correzioni.
   Cosa devi disegnare nel mockup (nel suo linguaggio, `#schermoBrowser`), con parità e +1:
   a) una BARRA DELLE SCHEDE di pagine (più pagine aperte, favicon/titolo, chiudi, «+»), nello stile delle `talos-tabs`;
   b) barra dell'indirizzo con indietro/avanti/ricarica, indirizzo modificabile (la persona può navigare, non solo l'agente), «Apri fuori»;
   c) l'area della pagina è un BROWSER VERO: nell'app desktop (Electron, `labs/electron-shell`) una webview/BrowserView per scheda; nella build web un `<iframe sandbox>` dove la pagina lo permette, altrimenti lo stato onesto «questo sito non si può incorporare» con «Apri fuori» — mai una pagina finta;
   d) chi ha aperto la scheda (persona · agente · giro N), «Leggi questa pagina» (= la lettura che il kernel già fa con `naviga`, sulla scheda aperta), «Annota» (commento visivo/testo che finisce nel composer), «Copia testo»;
   e) cronologia della sessione (le pagine lette dall'agente, che oggi il monolite tiene in `browserPagine`) come elenco secondario, non come contenuto principale.
   Il kernel oggi espone solo `naviga` (testo della pagina): le rotte per aprire/leggere/annotare una scheda vera dall'agente sono la riga K-I del ledger della Fase 3 — nel mockup i controlli che le aspettano portano `data-richiede="fase3"`. Screenshot alle tre larghezze, confronto con Hermes (le sue immagini che hai già in immagini/astra-mockup/hermes-confronto) e ledger con la ricerca citata.
```
