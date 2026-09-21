# Modelli

## Cosa fa

È il posto dove si sceglie **con quale modello** TALOS lavora, e dove si
guardano quelli disponibili.

Le fonti sono schede separate:

- **OpenRouter** — il catalogo dei modelli raggiungibili con un accesso solo.
- **Locali** — i modelli che girano su questo computer. Vedi
  [Motore locale](motore-locale.md).
- **Una scheda per ciascun fornitore diretto** — per esempio Anthropic, Gemini,
  OpenAI: il fornitore è l'asse della scelta, non un contenitore generico.

Per ogni modello del catalogo si vedono: il fornitore, quanto contesto regge,
cosa accetta in ingresso e produce in uscita (testo, immagini, audio, file), se
sa usare gli attrezzi, e i prezzi.

## Cosa non fa

- ⛔ **Un prezzo che il fornitore non dichiara si scrive «Non dichiarato»**, mai
  zero.
- Un modello nell'elenco non garantisce che il tuo accesso lo copra: l'elenco
  dice cosa esiste, non cosa è già pagato.
- I fornitori senza accesso configurato non compaiono fra i selezionabili: si
  passa prima da [Fornitori e chiavi](fornitori-e-chiavi.md).

## Come si usa

- Il modello di una sessione si cambia dalla barra in alto.
- Il catalogo completo, con i dettagli, sta nelle Impostazioni →
  **Laboratorio modelli**.
- Il catalogo si aggiorna da sé; quando mostra dati salvati invece che appena
  letti, lo dichiara.

## Se va storto

- **Il catalogo non si carica** — serve un accesso configurato. Il Doctor dice
  se c'è.
- **Un modello risponde male o subito** — vedi [Motore locale](motore-locale.md)
  per i modelli locali: spesso è il formato di conversazione o la finestra piena.

> Verificato in `harness-ui/frontend/src/components/catalogo-modelli.js`: «Non
> dichiarato» al posto dello zero per i prezzi (righe 8-9 e 28), per le modalità
> di ingresso e uscita (riga 13) e per la finestra di contesto (riga 16).
