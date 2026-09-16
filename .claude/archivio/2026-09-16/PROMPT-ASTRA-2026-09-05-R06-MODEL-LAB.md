# Prompt per Astra — 05/09/2026, notte: review R-06 (R05 etichette + B6.4 Catalogo modelli)

> Da incollare così com'è.

```
Astra, review R-06 dall'orchestratore (Claude) — 05/09/2026.

8e338c1f (etichette R05) e bb836a25 (CatalogoModelli nel Model Lab): ACCETTATI e UNITI in lane/harness-desktop (fast-forward sul tuo merge 7de75f24). Cancelli sulla lane unita: template fedele al generatore, unit 72/72, statico 195/195, componenti 78/78. Codice letto: bene il tono onesto («Non dichiarato», «L'elenco dei modelli non verifica le credenziali»), le parole umane in PAROLE, il ripristino di fuoco e scroll, «Usa nella sessione» marcato fase3.

Due cose, dal tuo stesso screenshot app-catalogo-1440.png (guardalo tutto, non solo il catalogo):
1. Sopra il catalogo restano le righe GREZZE del Model Lab originale, senza il linguaggio del mockup: «Runtime locale · non scelto», «MisurataCapacità macchina», «5 con chiave · nessuno ancora provatoAccessi server», «3 modelli osservatiModelli osservati», «GatedRuntime locale», e la striscia «PanoramicaProviderCatalogo APIInstallatiHugging FaceDownload» tutta attaccata. È esattamente il difetto che l'owner ha appena chiamato «bruttissimo» sui toast (T-16, curato da me in cab47a07): una superficie del monolite che affiora nuda dentro il mockup. Le sei schede restanti di B6 le sai; fino a che non arrivano, quella testata va comunque vestita (le statistiche come `talos-kv`/badge del mockup e la striscia come `talos-tabs`), mai lasciata grezza in una consegna.
2. H22: «Gated» è un nome tecnico a schermo. Nome umano («Con accesso limitato» o quello che il contesto del runtime locale dice davvero), dalla stessa logica delle etichette che hai appena corretto.

Nota per il tuo verso contrario: con il catalogo caricato prova anche la ricerca che NON trova nulla e il fornitore senza modelli — il testo «Nessun modello corrisponde ai filtri» c'è nel codice, voglio lo screenshot.

Prossimo, nell'ordine di sempre: resto di B6 (le sei schede, con la testata vestita), B2 colonna destra, B7 dialoghi su setupModalResize (ricorda: le modali ridimensionate e RICORDATE, e l'Intro col file tree compatto), B1 Terminale (K-G: scheda per processo dell'agente seminata col comando, scheda utente con PTY, cwd e scrollback ricordati — è la parità con Hermes, letta nel suo codice: apps/desktop/src/app/right-sidebar/terminal/terminals.ts), B8, Browser a schede (K-I). Prima di ogni innesto: `git -C AVM-astra-fase2 merge lane/harness-desktop` (ora contiene il Toast del mockup: se ti serve un messaggio, chiama `toast(titolo, messaggio)` del monolite, non costruirne un altro).
```
