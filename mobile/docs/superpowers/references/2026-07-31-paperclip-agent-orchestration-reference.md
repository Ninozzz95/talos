# Paperclip — riferimento per la piattaforma agentica (I = K)

Data: 2026-07-31
Fonte: owner, con due riferimenti espliciti
— video: https://youtube.com/shorts/KBB69FPcPNI
— repo: https://github.com/paperclipai/paperclip

Stato: **riferimento, non mandato di costruzione.** Si apre quando si apre I = K.

---

## L'istruzione dell'owner

Testuale: «in questa piattaforma agente che dobbiamo [fare], oltre a tutti gli
strumenti di coding esattamente come fanno i competitori, è meglio una sorta di
sistema simile a Paperclip».

Quindi la piattaforma agentica TALOS ha **due metà**, non una:

1. **gli strumenti di coding** — parità con Claude Code / Codex / Cursor
2. **l'orchestrazione sopra di essi** — la parte Paperclip

Il blocco **C** (tool, Termux, Shizuku, terminale bash) è stato spostato dentro
questa fase lo stesso giorno: è ciò che la piattaforma **usa**, non una fase a
sé — vedi la modifica d'ordine nel master backlog.

## Che cos'è Paperclip, in una riga

Non è un agente. È **il piano di controllo sopra un gruppo di agenti**: chi
lavora a cosa, con quale budget, con quale autorizzazione, e con quale traccia.

Lanciato il 2026-03-02, MIT, Node 20 + React + PostgreSQL, oltre 38.000 stelle
in cinque mesi — quindi non una curiosità: è il punto di riferimento che il
settore ha scelto in questa categoria.

## I pezzi che contano (e perché contano per noi)

| Pezzo di Paperclip | Cosa fa | Perché ci serve |
|---|---|---|
| **Org chart e ruoli** | agenti con ruolo, gerarchia, cicli di vita | un agente «che fa tutto» non è governabile |
| **Obiettivi e missione** | ogni compito risale a un obiettivo dichiarato | risponde a «perché l'agente ha fatto questo» |
| **Task con checkout atomico** | due agenti non prendono lo stesso lavoro | senza, si paga due volte lo stesso token |
| **Heartbeat** | l'agente si sveglia a intervalli o su evento | è il modello di esecuzione, non un dettaglio |
| **Budget per agente** | tetto di spesa, strozzatura automatica | **in BYOK paga l'utente**: è la voce più critica |
| **Governance e approvazioni** | passaggi che richiedono un sì umano | combacia con i 7 livelli di rischio della visione Shizuku |
| **Segreti cifrati** | credenziali fuori dal codice | già la nostra regola: nessuna chiave nell'APK (D0) |
| **Audit completo** | ogni azione risale a un attore | già principio TALOS |
| **Bring-your-own-agent** | Claude Code, Codex, Cursor, bash, qualsiasi HTTP | ci lascia liberi sul motore |

## Dove il loro disegno NON si trasferisce, e cosa faremo invece

Da decidere quando la fase si apre — annotato ora perché è la parte che si
dimentica:

- **PostgreSQL non gira sul telefono.** Il piano di controllo va su SQLCipher,
  che già usiamo. Il loro schema è un riferimento, non un artefatto da importare.
- **L'heartbeat contro Android.** Doze, limiti sui servizi in foreground e le
  regole del Play Store decidono cosa può davvero svegliarsi e quando. È il
  vincolo che modella la funzione, e va studiato **prima** di disegnarla.
- **I lavori lunghi non stanno su un telefono.** Esiste già la decisione del
  servizio cloud opzionale ([[cloud-service-predisposition]]): è lì che gli
  heartbeat lunghi migrano, senza riscrivere la logica.
- **Loro sono multi-tenant per aziende; noi siamo una persona.** L'org chart
  diventa «i tuoi agenti», non «i tuoi dipendenti» — e il budget non è di
  un'azienda, è la carta di credito dell'owner.

## La riga L3 da cercare (dottrina one-up)

Paperclip orchestra agenti **che girano altrove**. Il telefono è l'unico posto
dove l'agente, il piano di controllo, i segreti e il dispositivo su cui agire
sono **la stessa macchina** — quindi un'approvazione può essere biometrica e
immediata, e l'audit non deve fidarsi di nessun server. Nessuno può copiare
quello senza avere un client nativo sul dispositivo.

Da confermare con ricerca fresca quando la fase si apre: cinque mesi in questo
settore sono lunghi.
