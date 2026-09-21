# Migliora il prompt

## Cosa fa

Prende quello che hai scritto nel composer e lo **riscrive meglio**, prima di
mandarlo. Serve quando sai cosa vuoi ma l'hai scritto di fretta: il pannello ti
propone una versione più chiara, e sei tu a decidere se tenerla.

Quanto riscrivere lo scegli tu, fra tre profondità:

| profondità | cosa fa |
|---|---|
| **Asciutta** | stessa lunghezza. Chiarisce obiettivo e risultato atteso, senza aggiungere sezioni. |
| **Equilibrata** | un briefing chiaro: obiettivo, risultato atteso, i vincoli che hai già scritto, due o tre verifiche. |
| **Estesa** | un briefing completo: ambito, formato della risposta, vincoli, casi limite e criteri di accettazione. |

**Equilibrata** è quella di partenza.

Si sceglie anche **chi** lo riscrive: il modello che fa il lavoro può essere
diverso da quello della conversazione.

## Cosa non fa

- **Non invia niente da solo.** Ti mostra la proposta; l'invio resta un tuo
  gesto.
- **Non sa cosa vuoi.** Riordina e completa quello che hai scritto: se il testo
  di partenza non dice il vincolo che ti sta a cuore, la riscrittura non lo
  inventa. La profondità «Asciutta» esiste proprio per questo — quando il tuo
  testo è già giusto e va solo chiarito.
- **Costa una chiamata al modello.** È un lavoro vero, non una formattazione
  locale.

## Come si usa

1. Scrivi il messaggio come ti viene.
2. Apri **Migliora il prompt** dal composer.
3. Scegli la profondità, e se vuoi il modello che deve farlo.
4. Leggi la proposta accanto all'originale, e tienila o scartala.

Per un lavoro lungo conviene la profondità **Estesa**: i criteri di accettazione
scritti prima sono quello che poi permette di dire se il lavoro è finito.

## Se va storto

- **La proposta è più lunga ma non più chiara** — scendi a «Asciutta»: su un
  testo già buono, riscrivere molto peggiora.
- **Non arriva niente** — è una chiamata al modello come le altre: senza un
  accesso configurato non parte. Vedi
  [Fornitori e chiavi](fornitori-e-chiavi.md).

> Verificato in `harness-ui/frontend/src/components/migliora-prompt.js`
> (`PROFONDITA`, `PROFONDITA_PREDEFINITA = 'equilibrata'`).
