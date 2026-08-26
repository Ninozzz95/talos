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

## Fase DEBT-MOBILE-002 — diagnosi, RED e GREEN UI

Stato: **GREEN focalizzato; gate largo e Pad finale ancora da eseguire**.

### Cosa è stato verificato

- Il percorso reale della prima scelta locale passa da
  `chatController.decideLocalEngineProbeConsent`; la modale si chiudeva senza
  una superficie di stato.
- Il comando Privacy passava da
  `TalosMobileSettingsPrivacyPanel.runLocalEngineProbeFromSettings`; in caso
  di rifiuto nativo il `finally` toglieva il busy senza mostrare l'errore.
- Sul Pad il ponte nativo ha prodotto `TalosQualify: cpu: verdetto=VALID` in
  circa cinque secondi: la verifica è reale e non un pannello dimostrativo.

### Modifica applicata

- La prima verifica pubblica ora un toast persistente «In corso…» e lo sostituisce
  con esito reale, temperatura già misurata, risultato inconclusivo o errore.
- Privacy mantiene il bottone disabilitato durante la corsa e pubblica il
  rifiuto del ponte nel toast globale; nessun errore resta silenzioso.
- Nessuna modifica al ponte Android, nessuna percentuale inventata e nessuna
  nuova stringa: l'errore riusa il messaggio generico già tradotto.

### RED → GREEN

- RED osservato: 82 test verdi, 2 rossi e una rejection non gestita; mancavano
  toast di caricamento/esito e gestione del rifiuto.
- GREEN focalizzato: `tests/unit/chat/chatController.test.ts`, 84/84 verdi,
  inclusi caricamento, successo e rifiuto del ponte.

### Riassunto semplice

Ora, quando premi «Sì, verifica ora», la modale può chiudersi per non bloccare la
chat, ma non sparisce più nel nulla: compare chiaramente che la verifica è in
corso e poi arriva il risultato. Se il telefono o il ponte non riescono a
completarla, l'app lo dice invece di tornare silenziosamente allo stato iniziale.

### Prossimo gate

## Fase DEBT-MOBILE-002 — gate statici

Stato: **verde**.

- `npm run typecheck`: verde.
- `npm run build`: verde; controllo iniziale automatico entro il budget
  JavaScript `614.000` byte e parità verde. Il primo tentativo aveva superato
  il limite (`614.684` byte); il probe è stato spostato nel modulo motore già
  lazy, senza alzare la soglia.
- `npx vitest run`: 674 file verdi, 3 saltati; 6.338 test verdi, 10 saltati.
- Test focalizzati del controller: 84/84 verdi, compreso successo, caricamento
  e rifiuto del ponte.

### Riassunto semplice

Il fix ora passa tutti i controlli automatici del progetto. La verifica non
appesantisce l'avvio dell'app: il motore viene caricato solo quando serve,
come prima. Il controllo iniziale resta invariato e non è stato aggirato.

### Prossimo gate

Compilare e installare l'APK debug sul Pad, copiarla nella cartella Download
del PC, quindi controllare con screenshot interi la prima scelta locale e il
comando Privacy prima/durante/dopo. La rotazione portrait del debito 001 resta
indipendentemente pendente.

## Fase DEBT-MOBILE-002 — APK e Pad reale

Stato: **verde sul percorso Privacy; prima scelta locale da ripetere con consenso azzerato; portrait del debito 001 ancora pendente**.

### APK installata e consegnata

- `C:\Users\Antonino\Downloads\TALOS-dev-2026-08-26-debt-002.apk`
- 54.903.445 byte
- SHA-256 `5c445d577fafd056e454dee6a6985d40fb6d71d809edc6f60bedcf5968ed9779`
- installazione sul Pad `2ea6573c`: `Success`

### Evidenza visiva interamente ispezionata

- `C:\Users\Antonino\Desktop\projects\AVM\.claude\pad-debt-002-account.png` —
  apertura fisica di Centro impostazioni; sidebar, testata, card e barra di
  sistema coerenti.
- `C:\Users\Antonino\Desktop\projects\AVM\.claude\pad-debt-002-privacy-real.png` —
  ingresso fisico in Privacy e autorizzazioni; nessuna compenetrazione e
  nessun elemento tagliato.
- `C:\Users\Antonino\Desktop\projects\AVM\.claude\pad-debt-002-privacy-scroll1.png`
  e `pad-debt-002-privacy-scroll2.png` — scroll reale fino alla card GPU;
  contenuti e card sorelle restano leggibili.
- `C:\Users\Antonino\Desktop\projects\AVM\.claude\pad-debt-002-probe-running.png` —
  dopo il tap reale, la card mostra il risultato persistente del probe già
  misurato; il test automatico copre lo stato intermedio «In corso…».

### Riassunto semplice

L'APK che ho installato è la stessa copia disponibile nei Download del PC.
Sul Pad la sezione Privacy ora non chiude più il tentativo senza spiegazione:
il comando resta usabile, la card mostra lo stato reale già registrato e la
verifica non inventa percentuali o dati. La prima scelta locale va ancora
ripetuta partendo da un consenso azzerato, perché su questo Pad il consenso è
già stato registrato durante la riproduzione precedente.
