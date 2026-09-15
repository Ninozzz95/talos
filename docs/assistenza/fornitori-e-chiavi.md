# Fornitori e chiavi

## Cosa fa

È dove si dichiara **con chi** TALOS parla per usare un modello in rete, e dove
si custodiscono gli accessi.

Oltre a OpenRouter ci sono i fornitori diretti (fra cui Anthropic, Gemini,
OpenAI), Hugging Face per i modelli da scaricare, e la voce **Agente esterno**
per un agente già installato su questo computer.

Per ogni fornitore, tre fatti tenuti **distinti**, perché sono distinti davvero:

1. **La credenziale c'è** — e da dove arriva.
2. **L'indirizzo del servizio** — predefinito, personalizzato, o da impostare.
3. **La prova** — se qualcuno ha davvero provato a contattarlo, e com'è andata.

Sull'origine della credenziale il prodotto distingue: **chiave salvata**
(l'hai messa qui), **accesso fatto** (ti sei autenticato), **chiave
dall'ambiente**.

## Cosa non fa

- ⛔ **«Chiave dall'ambiente» non si toglie da qui.** L'ha impostata qualcuno
  fuori da TALOS, **vince** su quella salvata, e da questa pagina non si rimuove.
  Senza dirlo, una chiave vecchia continuerebbe a essere usata e nessuno
  capirebbe perché.
- ⛔ **«Chiave salvata» non vuol dire «funziona».** La configurazione non
  conferma una chiamata riuscita: per quello c'è il pulsante di prova, e il
  risultato è un fatto a parte.
- Le chiavi **non stanno nel browser**: stanno nel portachiavi del sistema
  operativo.
- Senza alcun accesso configurato, il server si avvia comunque, ma in sola
  lettura: le sessioni non partono.

## Come si usa

Impostazioni → **Provider e accessi**. Per ogni fornitore: inserisci la
credenziale (o fai l'accesso), eventualmente l'indirizzo, poi **prova**.

Gli esiti della prova sono parole precise: servizio raggiunto (con quanti
modelli ha risposto), credenziale rifiutata, non raggiungibile, da configurare,
prova non riuscita.

## Se va storto

- **«Credenziale rifiutata»** — la chiave non è valida per quel servizio.
- **«Non raggiungibile»** — è la rete o l'indirizzo, non la chiave.
- **«Portachiavi non disponibile»** (nel Doctor) — il sistema operativo non
  offre il deposito sicuro: finché non c'è, le chiavi non si salvano.
- **Cambi la chiave e non cambia niente** — controlla se ce n'è una
  dall'ambiente: quella vince.

> Verificato in `harness-ui/frontend/src/components/provider-card.js`: le origini
> della credenziale alle righe 18-21 («Chiave dall'ambiente», che vince, «Accesso
> fatto», «Chiave salvata», e «Agente configurato» / «Agente da configurare» per
> l'agente esterno), e gli esiti della prova alla riga 5 («Prova in corso…»,
> «Credenziale rifiutata», «Non raggiungibile», «Da configurare», «Prova non
> riuscita») più «Servizio raggiunto» col conteggio dei modelli alla riga 7. Che
> le chiavi vivano nel portachiavi del sistema e non nel browser è dichiarato in
> testa a `harness-ui/src/provider-credential-store.mjs`. «Portachiavi non
> disponibile» è il controllo del Doctor
> (`harness-ui/frontend/src/components/doctor.js:26`).
