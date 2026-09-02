# Dossier ricerca — indicatore attività risposta desktop

Data: 2026-09-01  
Perimetro: sola UI desktop in `harness-ui/public`; mobile consultato in sola
lettura come riferimento di grammatica TALOS.

## Finding osservato

Lo screenshot owner `C:\Users\Antonino\Downloads\ScreenShot Tool -20260901183450.png`
mostra la riga «TALOS sta elaborando la risposta…» con il piccolo loader a
tre nodi, ma senza un’attività percepibile lungo la riga. Il risultato sembra
bloccato anche se il turno è ancora vivo.

## Ispezione locale

- Il simbolo riconoscibile del prodotto sono i tre nodi. La traccia, la testa
  luminosa e lo shimmer introdotti in seguito aggiungono tre segnali concorrenti
  alla stessa riga e l'owner li ha misurati come una barra inutile.
- Il mobile non richiede una barra separata per comunicare che la risposta è
  viva: il riferimento utile è la cadenza dei tre punti, non la decorazione.
- L’attesa usa già `role="status"` e `aria-live="polite"`.
- `styles.css` disabilita correttamente il movimento quando l’owner o il
  sistema richiedono movimento ridotto.

## Fonti primarie e confronto

1. MDN CSS Animations: le animazioni dichiarative sono gestite e ottimizzate
   dal browser; per un micro-feedback sono preferibili a un loop JS di paint.
   https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Animations
2. MDN animation performance: trasformazioni/opacità e CSS animations evitano
   lavoro di layout continuo e mantengono più facilmente un frame rate stabile.
   https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/Animation_performance_and_frame_rate
3. MDN `prefers-reduced-motion`: il movimento non essenziale va rimosso o
   sostituito quando la preferenza è attiva.
   https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion
4. WAI-ARIA `status`: un aggiornamento di stato deve restare una live region
   polite e non rubare il focus.
   https://www.w3.org/TR/wai-aria-1.0/roles#status
5. Hermes `display.py`: lo stato attivo usa verbi specifici (“Running code”,
   “Reading skill”, “Generating image”) invece di un generico spinner muto.
   https://github.com/NousResearch/hermes-agent/blob/main/agent/display.py
6. Hermes, finding upstream #6946: durante i silenzi di streaming un indicatore
   persistente e il tempo trascorso distinguono elaborazione e blocco.
   https://github.com/NousResearch/hermes-agent/issues/6946

Claude/Codex privilegiano una singola riga compatta che cambia con lo stato
del turno; TALOS mantiene lo stesso principio già implementato
(`attesa/reasoning/preparing/redirect`) e aggiunge un’identità visiva propria,
senza creare una card o un pannello separato.

## Decisione upstream

- **Adattare**, non introdurre un package: il marchio TALOS resta il componente
  canonico e non serve una seconda dipendenza grafica.
- Usare esattamente tre punti con pulsazione sequenziale basata su
  `transform`/`opacity` e sul token motion esistente. Nessuna traccia, testa,
  barra, sweep o shimmer: un solo segnale visivo, immediatamente leggibile.
- Mostrare il tempo trascorso come testo visivo `aria-hidden`: conferma che il
  ciclo è vivo anche quando le animazioni interfaccia sono spente, senza far
  annunciare ogni secondo alla live region.
- In movimento ridotto: tre punti statici leggibili e tempo trascorso ancora
  aggiornato. La funzione informativa non dipende dal moto.

Nessun package nuovo. Fonti e upstream verificati il 2026-09-01.
