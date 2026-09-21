# La ricerca sul web

## Cosa fa

Dà all'agente un attrezzo per cercare in rete e per leggere una pagina.

La sorgente della ricerca si sceglie nelle Impostazioni, sezione **Strumenti
agente e permessi**. Le possibilità:

- **DuckDuckGo (senza chiave)** — è il comportamento predefinito, quello che
  funziona senza configurare niente;
- **Tavily** — con chiave;
- **Brave Search** — con chiave;
- **SearXNG (istanza tua)** — vuole l'indirizzo della tua istanza;
- **Endpoint personalizzato** — qualunque altra API che risponda con un elenco
  `results` al primo livello; la chiave è facoltativa.

E una sesta scelta, che non è una fonte:

- **Nessuna ricerca web** — la ricerca si può **spegnere del tutto**. In quel
  caso il prodotto dice «Ricerca web disattivata», e non è un guasto.

Quando una fonte è scelta ma le manca qualcosa, il prodotto lo dice per nome:
«Serve una chiave API» oppure «Serve l'indirizzo del servizio» — e finché manca,
**la ricerca resta disattivata**.

La chiave, quando serve, sta nel portachiavi del sistema operativo. L'indirizzo
sta in un file di configurazione accanto al server.

## Cosa non fa

- ⛔ **DuckDuckGo senza chiave non è un servizio ufficiale.** TALOS legge la
  pagina pubblica dei risultati. Sotto uso intenso può rifiutare, e quando
  succede **il risultato lo dice** invece di restituire una lista vuota.
- Non cerca da sola: è l'agente che decide quando usarla, secondo il permesso di
  quell'attrezzo.
- Il Doctor dice se la ricerca è **configurata**, non se una ricerca vera
  riuscirebbe: non ne esegue una per controllare.

## Come si usa

1. Impostazioni → **Strumenti agente e permessi** → origine della ricerca web.
2. Se scegli un servizio con chiave, inseriscila: viene salvata nel portachiavi
   del sistema, non nel browser.
3. Se non scegli niente, funziona già con DuckDuckGo.

## Se va storto

- **«La ricerca è stata rifiutata»** — è quasi sempre il limite di traffico di
  DuckDuckGo senza chiave. Riprova più tardi, o configura un servizio con
  chiave.
- **L'agente non cerca mai** — controlla il permesso dell'attrezzo di ricerca in
  Capability: potrebbe essere su «Nega».
- **Una pagina non si legge** — alcuni siti non si lasciano leggere. Vedi
  [Browser](browser.md).

> Verificato in `harness-ui/src/search-source-store.mjs`: le cinque fonti sono
> `['duckduckgo','tavily','brave','searxng','custom']` (riga 2 di
> `harness-ui/frontend/src/components/fonte-ricerca.js`), la scelta di partenza è
> `{ source: 'duckduckgo' }` (riga 77 dello store) e l'endpoint personalizzato è
> descritto alla riga 38 dello store: «Qualsiasi altra API di ricerca che
> restituisca un array "results" al primo livello (chiave opzionale, inviata come
> Bearer)». Le frasi «Ricerca web disattivata.», «Serve una chiave API. La ricerca
> resta disattivata.» e «Serve l'indirizzo del servizio. La ricerca resta
> disattivata.» sono alla riga 12 di `fonte-ricerca.js`. Che la scelta e
> l'indirizzo stiano in un file JSON accanto al server, e le chiavi mai nel
> browser, è dichiarato alle righe 12-13 dello store; il portachiavi è
> `harness-ui/src/provider-credential-store.mjs`. Che DuckDuckGo sia una pagina
> pubblica letta senza accordo è scritto alla riga 9 dello store e in
> `harness-ui/src/duckduckgo-search.mjs`.
