# Il pezzo per il kernel — P-13, due righe

Owner, 10/09: «2 approvo ma assicurati che sia effettivamente la via migliore con una ricerca tecnica
mirata». Fatta, e **ha smentito la mia raccomandazione**. Ecco perché, e che cosa serve davvero.

## Che cosa avevo consigliato, e perché era sbagliato

Avevo detto: l'elenco dei file entra **in coda alla consegna**, così il kernel non si tocca.

La ricerca (10/09/2026) dice il contrario, e con numeri:

> «Stable content should be at the top, dynamic content at the bottom. Put user-specific information
> in the user message where it belongs, **not** in the system prompt, so the cache can work on the
> system prompt while handling unique user context.»
> «Variable content … must live **after** the breakpoint. Move volatile content to the end to preserve
> **exact-prefix matches**, which are required for prompt cache hits.»
> Caso documentato: spostare il contenuto dinamico fuori dal prefisso porta la percentuale di cache
> hit **dal 7% al 74%**.

Fonti: Claude Platform Docs «Prompt caching»; OpenAI Cookbook «Prompt Caching 201»; ankitbko
«KV-Cache Aware Prompt Engineering»; arXiv 2601.06007 «Don't Break the Cache: An Evaluation of Prompt
Caching for Long-Horizon Agentic Tasks». Tutte lette il 10/09/2026.

⇒ L'elenco dei file è **contenuto stabile** (dipende dalla cartella, non dalla domanda). La consegna è
**variabile**. Mettere lo stabile *dopo* il variabile lo taglia fuori dal prefisso comune fra sessioni
diverse sulla stessa cartella — cioè esattamente il caso in cui la cache varrebbe di più.

E la posta in gioco è misurata, non teorica: la cache costa **un sesto** e prende dalla terza chiamata
(22/08, tre chiamate sullo stesso prefisso da 16.811 token: la terza legge 16.768 token dalla cache,
5,9 volte meno).

## Che cosa serve, ed è piccolo

`talosHarness.mjs`, **due punti**.

**1) La firma** (riga ~4193), un parametro opzionale in più:

```js
    messaggiIniziali, onGiro, onScrittura, segnaleStop, fetchDiRete, mobile = false,
    contestoDelProgetto,        // ⭐ P-13: testo stabile che descrive il progetto (l'elenco dei file)
```

**2) La costruzione dei messaggi** (riga 4607), una riga dopo le istruzioni:

```js
        messaggi = [{ role: 'system', content: ISTRUZIONI }]
        /*
         * ⭐ P-13 — il contesto STABILE del progetto (oggi: l'elenco dei file) va qui, subito dopo le
         * istruzioni e PRIMA della consegna: la cache dei fornitori funziona per prefisso esatto, e
         * un contenuto stabile messo dopo un contenuto variabile non viene mai riusato fra sessioni
         * diverse sulla stessa cartella. Misurato il 22/08: la cache costa un sesto e prende dalla
         * terza chiamata. Ricerca 10/09/2026: spostare il dinamico fuori dal prefisso porta la
         * percentuale di riuso dal 7% al 74%.
         * ⛔ Solo su sessione FRESCA, come l'ambiente del device qui sotto: una ripresa ha già il suo
         *   sistema di messaggi formato, e inserirsi lì cambierebbe il prefisso di una conversazione
         *   in corso — cioè romperebbe la cache invece di sfruttarla, il contrario di ciò che serve.
         */
        if (typeof contestoDelProgetto === 'string' && contestoDelProgetto.trim()) {
            messaggi.push({ role: 'system', content: contestoDelProgetto })
        }
```

Nient'altro. Nessun attrezzo nuovo, nessuna modifica a `elenca`, nessun cambiamento di comportamento
quando il parametro non arriva: senza `contestoDelProgetto` il kernel costruisce esattamente i
messaggi di oggi, byte per byte.

## Perché non si può fare senza toccarlo — le tre vie provate

1. **`messaggiIniziali`** — verificato nel kernel (riga 4603): se arrivano, il kernel **salta** le sue
   `ISTRUZIONI`, l'ambiente del device e il planner. Usarlo per iniettare l'elenco romperebbe ogni
   sessione nuova.
2. **In coda alla consegna** — non tocca il kernel, ma è la via che la ricerca smentisce: il contenuto
   stabile finirebbe dopo quello variabile.
3. **Ricostruire i messaggi lato server** (`[system ISTRUZIONI_COPIA, system ELENCO, user consegna]`)
   — vorrebbe dire tenere una **seconda copia di `ISTRUZIONI`** fuori dal kernel. Due copie che
   divergono in silenzio: peggio del problema che risolve.

## Che cosa faccio io, intanto

Il lato server è tutto mio e non aspetta questo pezzo: costruzione dell'elenco, potatura, `.gitignore`,
conteggio dei token, invalidazione quando i file cambiano, e il costo dichiarato nella ricevuta. Quando
porti le due righe, l'elenco comincia ad arrivare al modello; finché non le porti, tutto il resto è
già provato e non fa danni — il parametro semplicemente non viene letto da nessuno.
