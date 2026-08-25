# Consegna al main agent — debiti mobile post-Codice — 2026-08-25

Owner: Antonino  
Stato generale: **in corso**

## Fase DEBT-MOBILE-001 — diagnosi e piano

Stato: **completata**.

### Cosa è stato controllato

- Letta l'evidenza owner del documento Markdown appena generato.
- Tracciati entrambi i percorsi: la scheda Chat apre un viewer fullscreen;
  la Libreria rende il documento dentro una superficie già protetta.
- Confrontate le testate sorelle dell'app e le regole ufficiali Android/WebView.

### Cosa significa in modo semplice

Il documento non è difettoso e la Libreria non “fa una magia” diversa. Il solo
viewer aperto dalla scheda dimentica lo spazio occupato dalla barra di sistema
in alto. La correzione appartiene a quel viewer comune: sfondo fino al bordo,
ma nome file e pulsante X sempre sotto la barra del dispositivo.

### Decisione tecnica

Una sola modifica CSS già standard nell'app; nessuna libreria, nessuna misura
fissa e nessuna modifica Android. Dossier e ledger completi sono:

- `.claude/DOSSIER-RICERCA-DEBITI-MOBILE-POST-CODICE-2026-08-25.md`
- `.claude/LEDGER-DEBITI-MOBILE-POST-CODICE-2026-08-25.md`

### Prossimo gate

Scrivere il test che fallisce sul viewer attuale, dimostrare il RED, applicare
la singola correzione e rieseguire i percorsi scheda/Libreria prima della build
e della verifica visiva sul Pad.

## Fase DEBT-MOBILE-001 — prova RED

Stato: **completata**.

- Comando: `npx vitest run tests/unit/components/TalosMobileMarkdownViewer.test.ts`.
- Esito atteso e ottenuto: 1 fallimento nuovo, 4 test precedenti verdi.
- Motivo preciso: la testata non contiene ancora la protezione superiore
  `safe-area-inset-top`.

### Riassunto semplice

La prova dimostra che il problema è isolato nello spazio sopra la testata: il
file continua a caricarsi, il Markdown resta formattato, gli errori restano
visibili e la X continua a chiudere. Ora il codice può essere corretto senza
allargare il perimetro.

## Fase DEBT-MOBILE-001 — GREEN focalizzato

Stato: **completata**.

- Viewer Markdown: 5/5 test verdi.
- Scheda documento appena generato: 53/53 test verdi.
- Libreria e pannello media: 26/26 test verdi.
- Modifica di prodotto: una sola classe sulla testata del viewer condiviso.

### Riassunto semplice

Nome file e pulsante di chiusura ora chiedono al dispositivo quanto spazio è
occupato dalla barra superiore e si posizionano sotto di essa. Su schermi senza
ostacoli rimane il normale margine dell'app. Tutti i comportamenti vicini già
esistenti continuano a funzionare nei test.

### Prossimo gate

Controlli completi del progetto mobile, build Android, installazione e confronto
visivo reale dei due ingressi sul Pad nelle quattro forme richieste.

## Fase DEBT-MOBILE-001 — regressioni larghe

Stato: **completata**.

- TypeScript: pulito.
- Suite completa: 674 file verdi, 3 saltati; 6.336 test verdi, 10 saltati.
- Build web e parità: verdi.
- Budget iniziale: JavaScript `613.995 / 614.000` byte; CSS
  `215.338 / 220.000` byte.

### Riassunto semplice

La singola correzione non ha rotto nessuna delle migliaia di prove del mobile,
non ha aggiunto peso al pacchetto iniziale e non ha cambiato la parità delle
funzioni. Resta la parte decisiva: installarla sul Pad e guardare davvero il
risultato nei due percorsi e nelle quattro forme dello schermo.

## Fase DEBT-MOBILE-001 — Pad reale e confronto visivo

Stato: **verde sui due orientamenti landscape; portrait fisico pendente**.

### Prove eseguite e ispezionate interamente

- Scheda Chat appena generata, tablet landscape: `tablet-landscape-card.png`.
  WebView `1292×914` CSS, inset top `40px`, testata `100px`, X a `y=40px`.
- Scheda Chat appena generata, telefono landscape reale: 
  `phone-landscape-card-real.png`. Screenshot `2400×1080`, WebView `914×411`
  CSS, inset top `40px`, X interamente raggiungibile.
- Documento lungo reale, telefono landscape, fondo dello scroll:
  `phone-landscape-scroll-bottom.png`. `scrollTop=4407`, `scrollHeight=4719`,
  `clientHeight=311`; la testata resta stabile a `y=0`.
- Stesso file aperto dalla Libreria, tablet landscape:
  `tablet-landscape-library.png`; la superficie Libreria mantiene il proprio
  spazio superiore e non presenta la compenetrazione owner.

Percorso artefatti: `C:\Users\Antonino\AppData\Local\Temp\talos-debt-001-20260825`.

### Riassunto semplice

Sul Pad nella posizione fisica disponibile (landscape), il nome del documento
e la X ora stanno sempre sotto la barra di sistema, sia entrando dalla scheda
Chat sia dal documento lungo, e lo scroll resta utilizzabile. Ho scartato come
non valida una prima immagine ottenuta con assi scambiati: sembrava portrait ma
il Pad era ancora fisicamente landscape. Per chiudere il gate completo serve
solo ripetere le stesse due aperture dopo la rotazione fisica del Pad in
portrait; non dichiaro quella parte già verificata.

### APK installata

- `C:\Users\Antonino\Downloads\TALOS-dev-2026-08-25-debt-001.apk`
- 54.903.445 byte
- SHA-256 `3da7a50a47c66f89a04a26ec79362375a4b41a065b0c91abf23c2fec6850fa72`

### Prossimo gate

Rotazione fisica del Pad e ripetizione portrait; poi commit della fase e presa
in carico di DEBT-MOBILE-002 (verifica GPU reale).
