# Dossier di ricerca — token semantici del tema chiaro

Data: 2026-09-01

## Problema misurato

Lo screenshot stabile della sessione reale Qwen mostra il testo finale della
risposta quasi invisibile nel tema chiaro. Il browser misura
`rgb(214, 210, 202)` per `.assistant-copy` sul fondale chiaro: non è
un'animazione residua. La causa locale è precisa: `applicaThemeDesktop()`
imposta `--talos-text`, ma non `--talos-assistant-text`; il `var()` CSS usa
quindi il fallback chiaro progettato per Calm scuro (`#d6d2ca`). Anche
`--talos-panel-soft`, `--talos-card`, `--talos-window-bg` e
`--talos-border-strong` cadono su fallback scuri non coerenti con la modalità
chiara.

## Fonti primarie aggiornate

- W3C WCAG 2.2, criterio 1.4.3: il testo normale deve raggiungere almeno
  4.5:1. Fonte: https://www.w3.org/TR/WCAG22/#contrast-minimum
- MDN, `var()` e custom properties: il fallback di `var()` entra in gioco
  quando il token richiesto non è definito; non è un secondo tema. Fonti:
  https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/var e
  https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Cascading_variables/Using_custom_properties
- VS Code Theme Color Reference: editor, pannelli, sidebar, widget e testo
  secondario hanno token semantici distinti; il tema deve fornire valori
  coerenti per ogni superficie, invece di riusare un colore da un'altra
  modalità. Fonte: https://code.visualstudio.com/api/references/theme-color
- Pin dell'implementazione VS Code consultata: commit
  `2bb7d705d30c913050328ddc74a23e59d1b9a5c8`.

## Confronto e decisione upstream

- VS Code è il confronto diretto utile: separa foreground primario,
  description foreground, editor, sidebar, pannelli e widget. Punto forte:
  nessun fallback di un tema scuro viene riusato come valore effettivo nel
  tema chiaro. Punto debole per TALOS: copiare l'intero catalogo introdurrebbe
  molti token senza semantica di prodotto.
- Claude Code e Codex CLI lavorano soprattutto nel tema del terminale host:
  non offrono un contratto grafico desktop trasferibile per questa superficie.
  Hermes non fornisce un theme contract browser più completo di quello già
  posseduto da TALOS.
- Decisione: **adattare**, non copiare. `applicaThemeDesktop()` deve completare
  il piccolo contratto `--talos-*` già posseduto da TALOS per entrambe le
  modalità. I fallback in `styles.css` restano soltanto per l'apertura statica
  standalone, non devono più diventare valori runtime involontari.

## Criterio One-up TALOS

TALOS conserva un solo theme engine e rende osservabile il contratto reale con
test sui valori calcolati nel browser. Il gate copre risposta, testo
secondario, pannelli e controlli; il rapporto della risposta finale sul suo
fondale deve essere almeno 4.5:1 in light e dark.
