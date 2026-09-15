# Impostazioni

## Cosa fa

Raccoglie tutte le regolazioni, in dieci sezioni divise in due famiglie.

**Comportamento** — come la app si comporta con te:

- **Aspetto e movimento** — tema, colori, quanta animazione.
- **Chat e composer** — come si scrive e come si legge.
- **Strumenti agente e permessi** — cosa può usare l'agente, e la sorgente della
  [ricerca web](ricerca-web.md).
- **Memoria e contesto** — cosa ricorda e cosa legge prima di rispondere.
- **Sicurezza e privacy**.

**Infrastruttura** — con cosa lavora:

- **Laboratorio modelli** — catalogo, modelli installati, motore locale.
- **Provider e accessi** — vedi [Fornitori e chiavi](fornitori-e-chiavi.md).
- **Costi e consumo**.
- **File e workspace**.
- **Account, Doctor e backup**.

C'è una ricerca che attraversa tutte le sezioni: si cerca per parola, anche
senza accenti.

## Cosa non fa

- Non sincronizza niente in rete: le impostazioni restano su questo computer.
- Non manda telemetria.

## Come si usa

Si aprono dalla barra laterale. Se non trovi una voce, usa la ricerca in cima
invece di aprire le sezioni una per una.

## Se va storto

- **Una regolazione non ha effetto** — alcune valgono dalla sessione successiva.
  Aprine una nuova per verificare.

> Verificato nel markup di `harness-ui/frontend/index.template.html`: le sezioni
> sono **dieci**, divise in due gruppi `data-settings-gruppo` — «comportamento»
> (Aspetto e movimento · Chat e composer · Strumenti agente e permessi · Memoria e
> contesto · Sicurezza e privacy) e «infrastruttura» (Laboratorio modelli ·
> Provider e accessi · Costi e consumo · File e workspace · Account, Doctor e
> backup). La ricerca che ignora gli accenti è
> `harness-ui/frontend/src/components/impostazioni.js:3` (`normalize('NFD')` e
> rimozione dei segni diacritici).
