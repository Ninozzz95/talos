# Doctor

## Cosa fa

È il **referto** dello stato locale: una lista di controlli, ciascuno con la sua
gravità — Guasto, Avviso, Nota, OK — ordinati dai più gravi.

Cosa guarda, al 13/09/2026:

- l'accesso a un fornitore;
- l'ambiente in cui girano i comandi;
- la presenza del sistema di versionamento;
- la disponibilità dell'attrezzo di navigazione;
- il servizio dell'agente;
- il catalogo delle attività predefinite;
- le cartelle di progetto consentite;
- la configurazione della ricerca web;
- i fornitori e il portachiavi;
- le funzioni sperimentali attive;
- il ripristino delle sessioni, con quali sono state scartate e perché.

## Cosa non fa

⛔ **Il Doctor è diagnostica, non assistenza.** Dice se una cosa è
**configurata**, non se funzionerebbe. È scritto nei controlli stessi, uno per
uno:

- «Configurata. La validità presso il fornitore non è verificata da questo
  controllo.»
- «Attrezzo disponibile. Questo controllo non apre una pagina e non verifica la
  connessione.»
- «Stato della configurazione; nessuna ricerca viene eseguita qui.»
- «La configurazione non conferma una chiamata al modello.»

E quando un controllo manca del tutto dalla risposta, non viene dato per buono:
dice **«Non osservato»**.

Il Doctor non ripara niente da solo, e non risponde a domande sul prodotto.

## Come si usa

Voce **Doctor** nella barra laterale. Si legge dall'alto: i guasti stanno in
cima.

## Se va storto

- **«Nessun ambiente disponibile»** (guasto) — i comandi non possono girare:
  senza questo, gran parte del lavoro non parte.
- **«Ripristino delle sessioni» in rosso** — una o più sessioni non si sono
  rilette. L'elenco nomina quali e il motivo.
- **Tutto «Non osservato»** — la diagnosi non è arrivata intera: riprova.

> Verificato in `harness-ui/frontend/src/components/doctor.js:17-29`: gli undici
> controlli nascono lì, nello stesso ordine in cui sono elencati qui sopra
> (`chiave`, `shell`, `git`, `browser`, `runtime`, `catalogo`, `cartelle`,
> `ricerca`, `fornitori`, `labs`, `sessioni`), e la riga 17 definisce `ignoto()`,
> che scrive «Non osservato: questa risposta non include il controllo.» quando un
> controllo manca dalla risposta. Le quattro frasi citate stanno alle righe 18
> («Configurata. La validità presso il fornitore non è verificata da questo
> controllo.»), 21 («Attrezzo disponibile. Questo controllo non apre una pagina e
> non verifica la connessione.»), 25 («Stato della configurazione; nessuna ricerca
> viene eseguita qui.») e 26 («La configurazione non conferma una chiamata al
> modello.», e «Portachiavi non disponibile.»). L'ordinamento per gravità è
> l'ultima riga della funzione.
> ⛔ Correzione del 13/09/2026: la prima frase era citata con «Chiave
> configurata»; il controllo scrive «Configurata».
