# Consegna al main agent — debiti mobile post-Codice — 2026-08-25

Owner: Antonino  
Stato generale: **in corso**

## Fase DEBT-MOBILE-010 — immagine nella scheda Hugging Face

Stato: **fix codice GREEN; prova Pad rinviata alla campagna unica finale**.

La scheda modello ora rende l'immagine remota mostrata in `aaa.jpg`, ma solo
quando proviene via HTTPS dal CDN ufficiale Hugging Face. Il renderer della
Chat non cambia: continua a omettere immagini esterne. HTML generico, stile
inline, handler ed host diversi restano esclusi dalla sanificazione. Il RED
dedicato è verde e la suite model card passa 14/14, compresa la prova inversa
con un dominio non autorizzato.

### Riassunto semplice

L'immagine vera della scheda ora viene mostrata e si adatta alla larghezza
dello schermo. Non abbiamo aperto la porta a qualunque immagine o HTML: solo il
CDN ufficiale della scheda è accettato.

## Fase DEBT-MOBILE-008 — drag della sidebar globale

Stato: **fix codice GREEN; prova Pad rinviata alla campagna unica finale**.

La drawer globale mantiene `direction="left"`, quindi il componente Vaul
gestisce nativamente il trascinamento della propria superficie da destra verso
sinistra. Il bug era che durante una risposta occupata `dismissible` diventava
falso: la X chiudeva, il drag no. Ora il drag resta abilitato e il test RED
dedicato è verde (suite sidebar 12/12). Un gesto iniziato sul contenuto sotto
l'overlay non viene considerato valido; nel gate finale verranno provati drag
sulla sidebar, X, scroll interno e Back.

### Riassunto semplice

La sidebar ora può essere chiusa nello stesso modo sia premendo X sia
trascinando proprio il pannello verso sinistra, anche mentre la Chat sta
elaborando. La prova con il dito sul Pad è rimandata alla verifica unica finale.

## Fase DEBT-MOBILE-007 — pinch-to-zoom nella Chat

Stato: **fix codice GREEN; prova Pad rinviata alla campagna unica finale**.

Il thread scrollabile della Chat ora dichiara `touch-pan-y`. Questo mantiene
lo scroll verticale normale, ma impedisce che il gesto a due dita trasformi la
viewport della Chat in uno zoom senza limite. Il RED era il test
`DEBT-MOBILE-007 RED: chat thread allows vertical scroll but not viewport pinch
zoom`, che falliva prima della classe; il test focalizzato è ora verde (42/42).

### Riassunto semplice

La Chat scorre ancora come prima, ma il gesto di allargare due dita non può più
ingrandirla all'infinito. La conferma sul dispositivo verrà fatta una sola
volta, insieme a tutti gli altri debiti.

## Fase DEBT-MOBILE-009 — stato OAuth OpenRouter

Stato: **fix codice GREEN; prova Pad rinviata alla campagna unica finale**.

Il pannello non mostra più un errore di accesso OAuth ormai superato quando la
chiave OpenRouter è stata salvata e il catalogo è disponibile. Il RED dedicato
falliva nello scenario “errore OAuth precedente + chiave presente”; il test
provider runtime è ora verde (6/6). Gli errori reali del catalogo restano
separati e visibili.

### Riassunto semplice

La app non dirà più “accesso fallito” dopo che la chiave è stata davvero
aggiunta. Se il provider ha ancora un problema reale nel caricare i modelli,
continuerà a mostrarlo.

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

Stato: **gate storici verdi; riesecuzione 2026-08-26 con due rossi fuori
perimetro da chiudere prima dell’APK**.

- `npm run typecheck`: verde.
- `npm run build`: verde; controllo iniziale automatico entro il budget
  JavaScript `614.000` byte e parità verde. Il primo tentativo aveva superato
  il limite (`614.684` byte); il probe è stato spostato nel modulo motore già
  lazy, senza alzare la soglia.
- Riesecuzione build 2026-08-26: Vite completa la compilazione, ma il gate
  `verify-initial-chunk.mjs` misura `614.051` byte (`614.000` consentiti).
  Il budget è fuori dal perimetro di questi debiti e il worktree ha modifiche
  parallele; soglia e codice estraneo non sono stati alterati.
- `npx vitest run` rieseguito dopo DEBT-012: 673 file verdi, 3 saltati; 6.345
  test verdi, 10 saltati. Resta un solo rosso in
  `tests/unit/upstream/desktopPortedConformance.test.ts`: hash divergente di
  `mobile/src/lib/talosMessageMarkdown.ts`, file già modificato fuori da questa
  campagna; non è stato toccato né corretto qui.
- Test focalizzati del controller: 84/84 verdi, compreso successo, caricamento
  e rifiuto del ponte.

### Riassunto semplice

I debiti coperti in questa campagna non hanno rossi nella suite completa. Restano
due gate da chiudere prima dell'APK: il controllo di parità del file portato dal
desktop e il budget del chunk iniziale, entrambi già presenti fuori dal
perimetro di questi debiti. Il typecheck resta pulito e la verifica non
appesantisce l'avvio dell'app: il motore viene caricato solo quando serve. La
prova fisica di questo debito sarà accorpata alla campagna finale, insieme agli
altri debiti.

### Prossimo gate

La verifica Pad dei debiti non verrà più eseguita per singola correzione:
prima si chiudono tutti i debiti a codice con i relativi test automatici, poi
si produce una sola APK debug, la si copia nella cartella Download del PC e si
esegue una campagna visiva congiunta. La rotazione portrait del debito 001
resterà nello stesso gate finale.

## Fase DEBT-MOBILE-003 — strutture Markdown in streaming

Stato: **verde focalizzato; Pad rinviato alla campagna finale congiunta**.

### Cosa è stato corretto

Quando l'ultimo blocco della risposta è una tabella, il tail non viene più
trattato come una riga di testo libera: il caret lampeggiante da prompt viene
soppresso e il frammento usa il fade già previsto per il rendering progressivo.
Il parser Markdown e il renderer a blocchi esistenti restano invariati.

### Prove

- RED riprodotto prima del fix: il test trovava il caret fuori dalla tabella.
- GREEN: `rtk npm exec vitest run tests/unit/chat/streamingUi.test.ts` — 18/18.
- La suite completa, typecheck, build e il Pad restano nel gate unico finale
  richiesto dall'owner.

### Riassunto semplice

La tabella non mostra più il cursore come se fosse una riga di comando. Durante
la generazione la struttura segue il movimento morbido già usato dalla Chat;
la verifica sul dispositivo verrà fatta insieme a tutti gli altri debiti.

## Fase DEBT-MOBILE-004 — default caratteri della prima installazione

Stato: **verde focalizzato; Pad rinviato alla campagna finale congiunta**.

### Cosa è stato corretto

Le installazioni nuove ora partono dalla scala dell'interfaccia «Molto
piccola», con un gradino reale `xsmall` sotto «Piccola». Le scale più grandi
restano disponibili e una preferenza già salvata non viene cancellata.

### Prove

- RED: il parser di installazione nuova restituiva `default` e non aveva una
  voce `xsmall`.
- GREEN: `rtk npm exec vitest run tests/unit/stores/predefinitiInstallazioneNuova.test.ts tests/unit/lib/talosFontScale.test.ts` — 13/13.
- Suite completa, typecheck, build e prova visiva sul Pad sono nel gate unico
  finale.

### Riassunto semplice

Alla prima installazione i testi dell'interfaccia saranno davvero «Molto
piccoli», non semplicemente «Piccoli». L'utente potrà comunque ingrandirli e
la sua scelta resterà dopo il riavvio.

## Fase DEBT-MOBILE-005 — «Autorizza tutti · Sempre»

Stato: **verde focalizzato; Pad rinviato alla campagna finale congiunta**.

### Cosa è stato corretto

Quando nell'introduzione si sceglie «Autorizza tutti» con durata «Sempre»,
l'app abilita anche i due switch che prima restavano spenti: «Gestisci la
policy Libreria» e «Usa un’app al posto tuo». «Chiedi», «Nega» e il passaggio
senza toccare la scheda non li attivano.

### Prove

- RED: il percorso accendeva la Libreria ma lasciava vuoti i due controlli
  agente.
- GREEN: `rtk npm exec vitest run tests/unit/components/TalosMobileSetupIntro.test.ts` — 26/26, incluse le prove inverse.
- Suite completa, typecheck, build e prova visiva sono nel gate unico finale.

### Riassunto semplice

La scelta “Sempre” ora vale davvero per i due interruttori indicati: quando
l'owner autorizza tutto, ritrova quelle capacità abilitate in Strumenti agente;
le scelte più prudenti restano prudenti.

## Fase DEBT-MOBILE-006 — tastiera, focus e composer compatto

Stato: **verde focalizzato sull'implementazione già presente; Pad rinviato alla
campagna finale congiunta**.

### Cosa è stato verificato

Il listener globale della tastiera usa l'evento ufficiale `keyboardDidHide` e
rilascia il focus dal campo. Il composer riceve il blur e torna compatto quando
il campo è vuoto e la preferenza immersive lo prevede. Non è stato aggiunto un
secondo listener dentro il composer.

### Prove

- `rtk npm exec vitest run tests/unit/services/nativeFraming.test.ts tests/unit/chat/TalosMobileComposer.drawer.test.ts` — 36/36.
- La prova fisica con Back/gesture, riapertura e bozza è nel gate Pad unico.

### Riassunto semplice

La base tecnica per togliere il focus quando sparisce la tastiera è già
centralizzata e coperta: quando il Pad confermerà il gesto reale, il composer
si richiuderà senza perdere la bozza.

## Nuovo finding owner — DEBT-MOBILE-010

È stato registrato il finding mostrato in
`C:\Users\Antonino\Downloads\aaa.jpg`: nella scheda modello Hugging Face il
tag HTML dell'immagine viene mostrato come testo/link grezzo. La diagnosi e il
fix saranno eseguiti dopo ricerca primaria e RED dedicati, prima dell'unica
campagna Pad finale. Il fallback per immagini remote non consentite resterà
esplicito e sicuro.

## Fase DEBT-MOBILE-011 — think e tool call nello streaming

Stato: **GREEN focalizzato; nessun test Pad intermedio**.

L'evidenza `C:\Users\Antonino\Downloads\abc.jpg` mostra che, con
`LFM2.5-2.6B-Q6_K`, durante lo streaming il blocco di ragionamento viene
renderizzato nel messaggio pubblico e il marker `</think>` resta visibile. La
seconda evidenza `C:\Users\Antonino\Downloads\tool.jpg` mostra anche i marker
`<tool_call_start>…<tool_call_end>`. Quando lo stream termina il testo è
corretto, quindi il difetto è nel percorso incrementale. Il fix dovrà consumare
entrambi i tipi di marker anche spezzati tra chunk, tenere think e tool call
fuori dalla risposta visibile e conservare il testo finale.
La ricerca primaria di llama.cpp documenta la separazione tra contenuto,
ragionamento e tool call e i marker LFM2/LFM2.5. Il punto unico già presente
`mobile/src/lib/chat/thinkStream.ts` ora consuma anche
`<|tool_call_start|>…<|tool_call_end|>`; il test RED nominato riproduce marker
spezzati tra chunk e ora è verde. Non è stato aggiunto un parser nel DOM o una
regola legata al nome del modello.

### Prove

- RED: il test lasciava passare i marker LFM2.5 nel testo.
- GREEN: `rtk npm exec vitest run tests/unit/chat/thinkStream.test.ts tests/unit/chat/toolCallNonAschermo.test.ts` — 23/23 verdi.
- La verifica visiva sarà eseguita insieme a tutti gli altri debiti nell'unica
  campagna finale sul Pad.

### Riassunto semplice dello step

Durante la scrittura la app sta mostrando una parte interna che dovrebbe
restare nascosta. La correzione deve nasconderla mentre arriva, senza rompere
la risposta normale che oggi, a fine generazione, è già corretta.

### Riassunto semplice

Il formato LFM2.5 mostrato nello screenshot non entra più nella bolla: il
separatore condiviso lo riconosce anche se il marker arriva spezzato, scarta la
chiamata interna e lascia inalterata la risposta normale.

## Nuovo finding owner — DEBT-MOBILE-012

Stato: **fix codice GREEN; verifica Pad rinviata alla campagna unica finale**.

`C:\Users\Antonino\Downloads\gemini.jpg` e il log diagnostico mostrano che
con OpenRouter e `Google: Gemini 3.7 Flash` il round `generate_image` viene
eseguito ma termina con `TALOS_IMAGE_PERSIST_FAILED`. La risposta comunica
quindi un'immagine generata ma non disponibile nella memoria locale cifrata.
La ricerca ufficiale distingue l'Image API, il server tool e le capacità
`output_modalities=image`. Il tracing locale ha confermato che l'app usa la
Image API (`POST /api/v1/images`) e legge `data[].b64_json`; il server tool beta
restituisce invece un `imageUrl` al modello e non è il percorso attuale.
`TALOS_IMAGE_PERSIST_FAILED` è emesso quando `sources.save` lancia dopo la
risposta del provider, quindi non identifica da solo un guasto del vault.

Il fix normalizza line-break/whitespace nel base64 prima della `data:` URL e
impedisce al picker OpenRouter di scegliere candidati privi della capacità
esplicita `output_modalities: image`; questo esclude il modello testuale Gemini
3.7 Flash dalla chiamata immagini e lascia la scelta al catalogo immagine.
GREEN locale: suite immagini 6 file/60 test; focus DEBT-011 + DEBT-012 4
file/54 test. Il test controller `IMAGE-OR-05 IMAGE-DUR-01/02/03
DEBT-MOBILE-012` attraversa inoltre Image API, decoder, vault, rendering e
reload con un `b64_json` spezzato e conferma che il decoder riceva una URL
compatta.

### Riassunto semplice dello step

Il problema non è “Gemini non genera”: il log prova che il tool viene chiamato e
che il fallimento avviene nel salvataggio. Il codice ora protegge i due confini
misurati (base64 non normalizzato e modello OpenRouter testuale non dichiarato
come immagine). Resta una sola verifica reale: sul Pad generare con il profilo
Gemini 3.7, controllare il modello immagine scoperto, verificare persistenza e
rendering dopo reload, poi ripetere con un provider alternativo nella campagna
finale congiunta di tutti i debiti.

### Gate automatici dello step

- `rtk npm exec vitest run tests/unit/images tests/unit/chat/thinkStream.test.ts
  tests/unit/chat/toolCallNonAschermo.test.ts`: verde, 83/83.
- `rtk npm exec vitest run`: 673 file verdi, 3 saltati; 6.345 test verdi, 10
  saltati; unico rosso il drift del manifest desktop-portato già descritto
  sopra.
- `rtk npm run build`: compilazione Vite completata, ma il gate del chunk
  iniziale è rosso a 614.051/614.000; nessun file estraneo è stato modificato
  per aggirarlo.
- `rtk npm run typecheck`: verde.

## Audit di completezza DEBT-MOBILE-001…012 — 2026-08-26

Stato: **tutti i fix a codice hanno copertura focalizzata GREEN; nessun debito
è ancora chiuso end-to-end**.

La riesecuzione unica di tutti i file di test nominati dai dodici ledger è
verde: **23 file, 424 test**. Il registro principale è stato corretto perché
DEBT-MOBILE-011 risultava ancora «da correggere» e una parte della descrizione
DEBT-MOBILE-010 era finita sotto la sezione sbagliata.

Restano obbligatori prima di dichiarare chiuso il lotto:

- risolvere il budget chunk `614.051/614.000`;
- risolvere o ricondurre al proprietario il drift hash di
  `mobile/src/lib/talosMessageMarkdown.ts`;
- produrre una sola APK finale e copiarla nei Download del PC;
- eseguire sul Pad la campagna unica in tablet/telefono, portrait/landscape,
  con tutti i gesti, stati puliti, reload e percorsi provider reali;
- ispezionare interamente tutti gli screenshot e registrare gli esiti.

### Riassunto semplice

Il codice previsto per i dodici debiti c'è e i relativi test passano insieme.
Non basta ancora per dire «tutto risolto»: mancano due gate automatici globali
e soprattutto la prova finale completa sul dispositivo reale concordata con
l'owner.

## Fase DEBT-MOBILE-002 — APK e Pad reale

Stato: **verde sul percorso Privacy e sui gate statici; prima scelta locale e
portrait del debito 001 rinviati alla campagna Pad finale congiunta**.

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

## Audit di chiusura software e campagna Pad — 2026-08-26

### Gate automatici

- `rtk npm run typecheck`: verde.
- `rtk npm exec vitest run`: **674 file passati, 3 saltati; 6.346 test
  passati, 10 saltati**.
- `rtk npm run build`: verde; chunk JavaScript iniziale **613.869/614.000**
  byte, CSS **215.338/220.000** byte, parità verificata.
- `rtk .\\gradlew.bat :app:assembleDebug :app:compileReleaseJavaWithJavac`:
  `BUILD SUCCESSFUL`.

Per rientrare nel budget non è stata alzata la soglia: l'elenco delle scale
tipografiche è stato spostato da `mobile/src/lib/talosFontScale.ts` a
`mobile/src/lib/talosFontScaleOptions.ts`, che resta nel percorso lazy delle
impostazioni. Il comportamento dell'utente è invariato, il boot pesa meno.
Il manifest di parità ora registra esplicitamente la divergenza mobile-only
del renderer Hugging Face in `mobile/upstream/desktop-ported-libs-manifest.json`.

### APK unica

- sorgente: `C:\Users\Antonino\Desktop\projects\AVM\mobile\\android\\app\\build\\outputs\\apk\\debug\\app-debug.apk`
- copia PC: `C:\Users\Antonino\Downloads\\talos-mobile-debt-audit-20260826-111031-5aa516a60135.apk`
- SHA-256: `5aa516a601355b29e099f8b88ae6c95cdf4aa3fe8b9bfb01614dd7abb92fdb28`
- installazione Pad `2ea6573c`: `Success`

### Campagna visuale unica

Le quattro forme sono state catturate dopo il caricamento completo e ogni
immagine è stata ispezionata per intero:

- `C:\Users\Antonino\Desktop\projects\AVM\\.claude\\pad-debt-campaign-2026-08-26\\tablet-form-a-ready.png` — forma tablet, rendering landscape.
- `C:\Users\Antonino\Desktop\projects\AVM\\.claude\\pad-debt-campaign-2026-08-26\\tablet-form-b-ready.png` — forma tablet, rendering portrait.
- `C:\Users\Antonino\Desktop\projects\AVM\\.claude\\pad-debt-campaign-2026-08-26\\phone-form-a-ready.png` — forma telefono, rendering landscape.
- `C:\Users\Antonino\Desktop\projects\AVM\\.claude\\pad-debt-campaign-2026-08-26\\phone-form-b-ready.png` — forma telefono, rendering portrait.
- `C:\Users\Antonino\Desktop\projects\AVM\\.claude\\pad-debt-campaign-2026-08-26\\phone-portrait-code-detail.png` — dettaglio Codice: composer fisso, scrollbar nascosta, badge leggibile.
- `C:\Users\Antonino\Desktop\projects\AVM\\.claude\\pad-debt-campaign-2026-08-26\\phone-portrait-code-after-scroll.png` e `phone-portrait-code-after-scroll-up.png` — test reale di scroll: testata compatta in discesa e ripristinata in risalita.

La campagna ha confermato il layout e il comportamento dello scroll, ma non ha
ancora esercitato tutti i percorsi funzionali richiesti dai dodici debiti
(primo avvio locale azzerato, provider OpenRouter/Gemini con persistenza reale,
streaming `think/tool`, scheda Hugging Face con rete, gesture della sidebar
globale). Perciò **DEBT-MOBILE-001…012 restano “fix codice GREEN, Pad finale
parziale”, non chiusi end-to-end**.

### Riassunto semplice

I controlli automatici e la compilazione sono puliti, l'APK consegnata è la
stessa installata sul Pad e le quattro forme principali sono state guardate.
La schermata Codice ora mantiene il composer in basso e nasconde la barra di
scorrimento; scendendo la testata si compatta e risalendo torna. Non sarebbe
corretto dire che tutti i debiti sono risolti: mancano ancora i percorsi reali
che richiedono dati/provider e stati puliti, quindi il registro resta aperto.

### Aggiornamento DEBT-MOBILE-008 — verifica gesto dal body

La segnalazione «dalla testata funziona, dal body no» è stata riprodotta e
corretta. Il body della sidebar usa scroll verticale e genera un `pointercancel`
prima dei `touchmove`; il fix conserva l'origine del touch fino alla fine del
gesto. Il test automatico della sequenza reale è verde e il gesto è stato
riprovato sul Pad con l'applicationId corretto `ai.talos`.

Screenshot interi ispezionati:

- `C:\Users\Antonino\Desktop\projects\AVM\.claude\pad-debt-campaign-2026-08-26\sidebar-open-final-apk.png`
- `C:\Users\Antonino\Desktop\projects\AVM\.claude\pad-debt-campaign-2026-08-26\sidebar-body-swipe-final-apk.png`
- `C:\Users\Antonino\Desktop\projects\AVM\.claude\pad-debt-campaign-2026-08-26\sidebar-header-swipe-correct-package-final.png`

Il secondo e il terzo mostrano la chiusura completata; la sidebar non resta
aperta dopo il trascinamento dal body o dalla testata. La prova è stata fatta
con il bundle nuovo verificato dentro l'APK, non con `ai.talos.dev` rimasto da
una build precedente.

### Gate aggiornati

- `npm run typecheck`: verde.
- `npm exec vitest run`: **674 file passati, 3 saltati; 6.349 test passati,
  10 saltati**.
- `npm run build` + `npx cap copy android`: verdi; il marker del nuovo
  contenitore swipe è presente nel chunk `TalosMobileSidebar-fMrnk4yF.js`.
- `:app:assembleDebug :app:compileReleaseJavaWithJavac --rerun-tasks`:
  `BUILD SUCCESSFUL`.
- APK copiata nei Download del PC:
  `C:\Users\Antonino\Downloads\talos-mobile-debt-audit-20260826-132724-e2322111fa4d.apk`
  (SHA-256 `e2322111fa4d35fcc04fbc9d5f574c78666cca4fbf08e9df08b3e68b00f8f2eb`).

Gli altri debiti restano nel registro come fix codice GREEN con gate provider,
stato pulito o percorso end-to-end ancora da esercitare; questa fase non li
dichiara chiusi per analogia.

## Chiusura DEBT-MOBILE-008B + DEBT-MOBILE-010 — verifica finale 2026-08-26

### DEBT-MOBILE-008B — sidebar segue il dito

Il trascinamento orizzontale ora applica direttamente al drawer la distanza
percorsa (`translate3d`) durante `touchmove`/`pointermove`. La soglia viene
valutata soltanto al rilascio: oltre soglia chiude, sotto soglia torna animata
alla posizione iniziale. Lo scroll verticale del body resta disponibile e il
`pointercancel` non interrompe più il successivo flusso touch.

Prova fisica sul Pad `2ea6573c` con package `ai.talos`, screenshot interi:

- `C:\Users\Antonino\Desktop\projects\AVM\.claude\pad-debt-campaign-2026-08-26\sidebar-open-latest.png`
- `C:\Users\Antonino\Desktop\projects\AVM\.claude\pad-debt-campaign-2026-08-26\sidebar-drag-mid-200-latest.png`
- `C:\Users\Antonino\Desktop\projects\AVM\.claude\pad-debt-campaign-2026-08-26\sidebar-drag-after-latest.png`

Nel fotogramma intermedio il bordo del drawer avanza di 200 px, uguale al
movimento del dito; al rilascio il pannello è chiuso.

### DEBT-MOBILE-010 — immagini delle model card Hugging Face

La causa era un tag HTML `<img>` multilinea nel README ufficiale: la vecchia
normalizzazione lavorava per riga e quindi il renderer riceveva testo escapato.
La normalizzazione ora ricompone il tag multilinea, accetta soltanto immagini
HTTPS da `cdn-uploads.huggingface.co` e lo passa al renderer già sanitizzato.
Le immagini esterne restano disabilitate fuori dalla scheda modello.

Prova fisica sul Pad, screenshot intero:

- `C:\Users\Antonino\Desktop\projects\AVM\.claude\pad-debt-campaign-2026-08-26\model-card-img-fixed.png`

La scheda `LiquidAI/LFM2.5-2.6B-GGUF` mostra il logo Liquid come immagine
renderizzata; non compare più il markup `<img ...>` come testo.

### Gate finali di questa fase

- `npm run typecheck`: verde.
- `npx vitest run`: **6.351 passati, 10 saltati, 0 falliti**.
- `npm run build` + `npx cap copy android`: verdi.
- `:app:assembleDebug :app:compileReleaseJavaWithJavac --rerun-tasks`:
  `BUILD SUCCESSFUL`.
- APK installata sul Pad e copiata nei Download del PC:
  `C:\Users\Antonino\Downloads\talos-mobile-debt-audit-20260826-140232-d9cd32dbf381.apk`
- SHA-256: `d9cd32dbf3817bbec838ac796980bbddfb389ad18b95a386ae6bba86c29e8a21`.

Questa consegna aveva chiuso 008B e 010; la verifica end-to-end aggiunta sotto
chiude anche DEBT-MOBILE-012. Gli altri debiti del registro restano aperti
finché non hanno il loro percorso end-to-end e la verifica Pad prevista.

### Aggiornamento finale DEBT-MOBILE-013 — label del ragionamento esteso (2026-08-26)

Il label richiesto dall'owner è visibile nella testata del selettore, accanto
allo switch e sulla stessa riga del valore cangiante. La schermata reale del
Pad conferma che `DISATTIVATO`, `Ragionamento esteso` e lo switch sono allineati;
la barra sotto mantiene i quattro stop `Disattivato`, `Basso`, `Medio`, `Alto`.

Evidenza: `C:\Users\Antonino\Desktop\projects\AVM\.claude\pad-debt-campaign-2026-08-26\effort-slider-phone-portrait-final-label-visible.png`.

Gate aggiornati: test focalizzati **36/36** e typecheck verdi; suite completa
**6.358 passati, 1 fallito, 10 saltati**. Il solo fallimento è
`tests/unit/chat/streamingUi.test.ts` (`DEBT-MOBILE-003 RED`), già fuori da
questo lavoro. Vite build, Capacitor copy e Gradle debug/release sono verdi;
`npm run build` resta fermato dal tripwire globale del bundle
`614278 > 614000`.

APK finale: `C:\Users\Antonino\Downloads\talos-mobile-effort-slider-20260826-162452-8001a3c7f224.apk`.
SHA-256: `8001a3c7f2241cc057fcd934f24b383b23e1dbc85ced55af1fe1a78bf4623bde`.

## Chiusura DEBT-MOBILE-012 — OpenRouter/Gemini image persistence (2026-08-26)

Il difetto allegato dall'owner (`TALOS_IMAGE_PERSIST_FAILED`) è stato riprodotto
una volta sul Pad con l'APK precedente. Il provider rispondeva correttamente,
ma WebView/bridge rifiutavano il percorso di persistenza dell'immagine grande.
La correzione usa il decoder locale quando la data URL è troppo grande e divide
la scrittura nativa in blocchi da 256 KiB base64 (`writeFile` iniziale,
`appendFile` successivi), mantenendo lo stesso Vault cifrato e gli stessi hash.

La generazione reale autorizzata con OpenRouter/Gemini 3.7 Flash ora mostra
l'immagine nella chat; dopo riavvio l'immagine resta presente; la Libreria la
elenca come file generato. Screenshot completi:

- `C:\Users\Antonino\Desktop\projects\AVM\.claude\pad-debt-campaign-2026-08-26\openrouter-generation-fixed-real.png`
- `C:\Users\Antonino\Desktop\projects\AVM\.claude\pad-debt-campaign-2026-08-26\openrouter-generation-after-reload.png`
- `C:\Users\Antonino\Desktop\projects\AVM\.claude\pad-debt-campaign-2026-08-26\openrouter-generation-library.png`

File toccati in questa chiusura:
`mobile/src/services/attachmentFileStore.ts`,
`mobile/src/stores/chatController.ts`,
`mobile/src/lib/images/imageMultipart.ts`,
`mobile/tests/unit/services/attachmentFileStore.test.ts`,
`mobile/tests/unit/chat/chatController.test.ts`.

Verifica: suite completa **6.352 passati, 10 saltati, 0 falliti**; typecheck e
Gradle debug/release verdi. Il comando `npm run build` si ferma soltanto sul
tripwire di budget JS iniziale (614.068 > 614.000); Vite build, `npx cap copy
android` e APK debug sono riusciti.

APK installata e resa disponibile sul PC:
`C:\Users\Antonino\Downloads\talos-mobile-debt-audit-20260826-145025-403964f0ac74.apk`
(SHA-256 `403964f0ac74655b103d6de02eb19adb38d349538003638151bf567339cce04b`).

Ricerca primaria usata: [OpenRouter Image Generation](https://openrouter.ai/docs/guides/overview/multimodal/image-generation),
[OpenRouter Models](https://openrouter.ai/docs/guides/overview/models) e
[Capacitor Filesystem](https://capacitorjs.com/docs/apis/filesystem).

### Riassunto semplice

La sidebar adesso si muove insieme al dito e si chiude solo quando lasci il
dito oltre la soglia; se trascini poco, torna indietro con animazione. Nella
scheda Hugging Face l'immagine del README viene finalmente mostrata davvero.
La build è stata ricontrollata, installata sul Pad e resa disponibile nei
Download del PC. Non ho dichiarato risolti gli altri debiti non verificati.

## DEBT-MOBILE-013 — slider effort nel drawer modello e ragionamento

È stato integrato il drop-in owner
`C:\Users\Antonino\Downloads\talos-effort-slider-dropin.zip` (SHA-256
`35C7C508E0349EEC46A64BDC91FA73FA4AD8221559906D82AAB029A6914184B4`). Il
vecchio gruppo di pulsanti è ora uno slider discreto controllato, basato sul
primitivo Reka già presente nell'app, con ladder canonica, una sola maniglia,
testo accessibile del livello, tastiera e touch. Il parent, eventi e stato del
composer restano compatibili.

Il toggle di ragionamento esteso è nella stessa testata del valore cangiante
selezionato (accanto a "Basso/Medio/Alto"), non sotto la rail. È stata inoltre
tolta la sola intestazione parent ridondante "Ragionamento", lasciando
"Livello di ragionamento" come unica descrizione.

File toccati:

- `mobile/src/components/chat/TalosMobileEffortPicker.vue`
- `mobile/src/components/chat/TalosMobileModelEffortDrawer.vue`
- `mobile/src/components/talos/ui/TalosThemedSegmentedSlider.vue`
- `mobile/tests/unit/chat/TalosMobileEffortPicker.test.ts`
- `mobile/tests/unit/chat/TalosMobileComposer.test.ts`
- `mobile/tests/unit/ui/TalosThemedSegmentedSlider.test.ts`
- `mobile/tests/setup/jsdomShims.ts`

Gate locale storico: `npm run typecheck` verde; test focalizzati **14/14**;
Gradle `:app:assembleDebug` e `:app:compileReleaseJavaWithJavac` verdi. Il
primo run completo aveva un rosso temporaneo `talosFontScale`, poi risolto con
la tokenizzazione del font. `npm run build` segnala il tripwire preesistente
del bundle iniziale (614.278 > 614.000), mentre `vite build`,
`npx cap copy android` e l'APK sono riusciti.

APK installata e copiata nei Download del PC:
`C:\Users\Antonino\Downloads\talos-mobile-effort-slider-20260826-161028-2b03fa2d6172.apk`
(SHA-256 `2b03fa2d61728fab1bbc4337edb19480dbad79e4ff25904dc9ed8a484e2030bd5`).

Screenshot Pad ispezionato per intero:

- `C:\Users\Antonino\Desktop\projects\AVM\.claude\pad-debt-campaign-2026-08-26\effort-slider-phone-portrait-header-toggle.png`
- `C:\Users\Antonino\Desktop\projects\AVM\.claude\pad-debt-campaign-2026-08-26\effort-slider-phone-landscape-main2.png`
- `C:\Users\Antonino\Desktop\projects\AVM\.claude\pad-debt-campaign-2026-08-26\effort-slider-tablet-portrait.png`
- `C:\Users\Antonino\Desktop\projects\AVM\.claude\pad-debt-campaign-2026-08-26\effort-slider-tablet-landscape-visible.png`

Il controllo è stato portato da Disattivato a Basso con un tap reale sul Pad;
il thumb e il valore cangiante hanno seguito la selezione. Nessuna modifica a
TALOS-BANCO, backend, traduzioni o dipendenze.

### Riassunto semplice

Nel cassetto del modello il selettore non è più una fila di bottoni: è una
barra unica che si trascina e si usa anche da tastiera. Il livello scelto si
vede chiaramente sopra la barra e l'interruttore del ragionamento esteso è
proprio lì accanto, senza doppie intestazioni. L'ho provato sul Pad in più
forme e ho lasciato l'APK nei Download del PC. Il solo rosso residuo della
suite completa è ora `DEBT-MOBILE-003` in `streamingUi.test.ts`, fuori dal
comportamento del selettore; il tripwire generale del bundle resta registrato.

## DEBT-MOBILE-012 — nuova evidenza OpenRouter/Gemini allegata 2026-08-26

L'allegato conferma lo stesso confine già registrato: la chiamata OpenRouter
termina con `generate_image` fallito in `TALOS_IMAGE_PERSIST_FAILED`, dopo una
risposta positiva del modello e senza problemi nei check di rete o storage.
Il codice già presente normalizza il `b64_json` prima del decoder e sceglie
solo modelli OpenRouter dichiarati con `output_modalities: image`.

La documentazione ufficiale conferma che l'endpoint è `POST /api/v1/images`,
che il risultato è in `data[].b64_json` e che la lista modelli può essere
filtrata con `output_modalities=image` ([Image Generation](https://openrouter.ai/docs/guides/overview/multimodal/image-generation),
[Models API](https://openrouter.ai/docs/guides/overview/models)).

Gate locale aggiornato: `imageGateway.test.ts`, `chatController.test.ts` e
`imageTools.test.ts` **115/115 passati**; suite completa già eseguita con
**6.351 passati, 10 saltati, 0 falliti**. Il gate Pad del percorso reale resta
aperto perché nell'ambiente non è presente una chiave `TALOS_TEST_OPENROUTER_API_KEY`.
Non ho usato la chiave applicativa salvata per evitare una generazione esterna
potenzialmente a pagamento senza autorizzazione specifica.

### Riassunto semplice

Il fix tecnico esiste e supera tutti i test locali. Per dire che il debito è
chiuso manca una sola prova: generare davvero un'immagine con OpenRouter dal
Pad e verificare salvataggio, visualizzazione e reload. Questa prova non è
stata simulata né lanciata senza il tuo consenso, perché può consumare credito.

## Consegna di arresto al main agent — DEBT-MOBILE-014/015 — 2026-08-26

### Risultato già presente nel worktree

Il lavoro corrente risolve due regressioni senza introdurre nuove dipendenze.

Per i download del Model Lab, le azioni di testata non vengono più nascoste
automaticamente su qualunque tablet: vengono nascoste soltanto quando la rail
tablet che le ospita esiste davvero. Nella pagina della variante, il pulsante
di download viene sostituito nello stesso punto da una barra collegata al
trasferimento reale corrispondente per repository, revisione e file. Il menu
download è sopra la sidebar globale e resta cliccabile; la sidebar mantiene il
proprio livello, il proprio sfondo e il trascinamento.

Per lo streaming locale, il parser TypeScript ora conosce il caso in cui il
template abbia già inserito `<think>` alla fine del prompt. In quel caso il
primo token nasce nel canale del ragionamento e non nella risposta pubblica.
La soluzione non dipende dal nome LFM, non filtra il DOM e non modifica il
bridge C++: usa il prompt reale già prodotto dall'adapter.

### File di prodotto e test modificati

- `mobile/src/App.vue`
- `mobile/src/components/shell/TalosMobileDownloadCenterTrigger.vue`
- `mobile/src/components/shell/TalosMobileSidebar.vue`
- `mobile/src/components/talos/models/TalosMobileLocalRepoDetail.vue`
- `mobile/src/lib/chat/providers/localAdapter.ts`
- `mobile/src/lib/chat/thinkStream.ts`
- `mobile/src/style.css`
- `mobile/tests/e2e/mobile-model-download-center.e2e.spec.ts`
- `mobile/tests/unit/chat/localAdapter.test.ts`
- `mobile/tests/unit/chat/thinkStream.test.ts`
- `mobile/tests/unit/models/TalosMobileLocalRepoDetail.test.ts`
- `mobile/tests/unit/shell/TalosMobileDownloadCenterTrigger.test.ts`
- `mobile/tests/unit/shell/TalosMobileSidebar.test.ts`

### Verifiche già eseguite

- test focalizzati: **106 passati, 0 falliti**;
- test sidebar finali: verdi;
- `npm run typecheck`: verde;
- `npx vitest run`: **6.363 passati, 10 saltati, 0 falliti**;
- `npx playwright test tests/e2e/mobile-model-download-center.e2e.spec.ts`:
  **5 passati**;
- `npx vite build`: verde;
- `npx cap copy android`: verde;
- Gradle `:app:compileDebugKotlin :app:compileReleaseJavaWithJavac`: verde;
- Gradle `:app:assembleDebug`: verde;
- `git diff --check`: verde, con soli avvisi di normalizzazione CRLF/LF.

`npm run build` resta rosso soltanto sul controllo globale della dimensione
iniziale: **614288 byte contro limite 614000**. La build Vite termina e la
soglia non è stata alterata.

### APK finale

- Percorso:
  `C:\Users\Antonino\Downloads\talos-debug-2026-08-26-post-code-debts-final.apk`
- SHA-256:
  `AEE53F439E71A5CEA16AD16098F46B34CCDC8AF58C149D1B4075F2D304F4677E`
- Installazione sul Pad `2ea6573c`: riuscita (`ai.talos/.MainActivity`).

### Evidenza Pad già raccolta e ispezionata

Cartella completa:
`C:\Users\Antonino\Desktop\projects\AVM\.claude\pad-debt-campaign-2026-08-26`.

Catture finali più utili:

- `final-tablet-landscape-loaded.png`
- `final-phone-landscape.png`
- `final-phone-portrait.png`
- `final-code-navigation.png`
- `final-code-list-loaded.png`
- `final-library-route.png`
- `final-settings-route.png`
- `final-model-lab-header.png`
- `final-models-local-header.png`
- `05-sidebar-open-atomic.png`
- `06-sidebar-body-swipe-atomic.png`

Il layout Codice, il composer, la navigazione, la sidebar e il Model Lab sono
stati ispezionati. La scrollbar Codice resta nascosta, lo scroll resta attivo,
il composer resta contenuto e il gesto dal body chiude la sidebar.

### Cosa non deve essere dichiarato chiuso

1. **Tablet portrait:** sul Pad la richiesta portrait ha prodotto nuovamente
   un'immagine landscape. Il dispositivo riportava rotazione `1` e non ha
   applicato la forma richiesta; `final-tablet-portrait-requested-loaded.png`
   non è una prova portrait valida.
2. **Download reale attivo:** non c'era un trasferimento disponibile durante
   la campagna finale. Il progresso e il menu sopra sidebar sono coperti da
   unit/E2E, ma manca la cattura Pad con bytes reali in movimento.
3. **Streaming LFM2.5 reale:** il fix ha test sintetici e regressione completa
   verdi, ma non è stata avviata una generazione locale finale osservando
   thinking e tool call durante lo streaming e dopo reload.
4. **Budget iniziale:** il tripwire 614000 resta rosso; non alzare la soglia
   per nasconderlo.

### Stato Git

- Branch: `lane/voce-personale`.
- Base corrente: `8dc14d74 chore(mobile): consolida fix e consegne debiti`.
- Modifiche correnti: non committate.
- Push: mai autorizzato.
- L'owner aveva autorizzato il commit in questa sessione, ma ha poi ordinato
  lo stop immediato; questa consegna non ha eseguito né commit né push.

### Riassunto semplice

Il codice dei due ultimi debiti è pronto e tutti i test automatici passano.
L'APK finale è già nei Download ed è stata installata sul Pad. Prima di dire
"finito" mancano tre prove visibili precise: un vero tablet portrait, un
download reale in corso e una risposta LFM2.5 osservata mentre viene generata.
Tutto il resto, inclusi file, test, APK, screenshot e limite del bundle, è
registrato qui e nel prompt di ripresa.

## Chiusura DEBT-MOBILE-014/015 — agente mobile, 2026-08-26 (sera)

### Precisazione owner e nuovo lavoro

Durante la sessione l'owner ha chiarito un punto della consegna: il bottone
per scaricare una variante, quando diventa la barra di avanzamento, deve
portare anche i comandi **pausa/riprendi/annulla**, non solo la percentuale —
esattamente come già fa il Centro download in testata. È stato aggiunto
riusando le stesse funzioni già esistenti nello store dei trasferimenti
(nessun nuovo poller, nessuna nuova dipendenza): premuto realmente sul Pad,
il ciclo Scarica → Pausa → Riprendi → Annulla (con conferma) funziona per
intero. Dettagli tecnici, ricerca e file toccati nel ledger e nel dossier.

### DEBT-MOBILE-014 — CHIUSO

Sul Pad, un download vero (repo `MaziyarPanahi/Qwen3-0.6B-GGUF`, mai
scaricato prima) ha mostrato: icona attiva in testata, bottone trasformato
nella stessa barra con bytes reali in movimento (0% → 36% → 52%, 232 MB su
462 MB), il nuovo pulsante Pausa che ha davvero fermato il download (la card
è passata a "Riprendi"), Riprendi che l'ha rimesso in moto, e Annulla con
conferma che ha cancellato il file e riportato il bottone allo stato
iniziale. I modelli di prova sono stati rimossi al termine.

### DEBT-MOBILE-015 — CHIUSO

Sul Pad, con il modello locale LFM2.5-2.6B-Q8_0 e Ragionamento esteso attivo,
due domande reali hanno mostrato lo streaming dal vivo: durante la
generazione (catturata a intervalli, non solo alla fine) la bolla pubblica
non ha mai mostrato `<think>`, marker di chiusura o sintassi di chiamata
strumento; il ragionamento è comparso in un blocco separato e richiudibile
sopra la risposta. Dopo un riavvio completo dell'app (`force-stop` +
riapertura) la risposta persistita è rimasta identica e pulita.

### Tablet portrait — CHIUSO (2026-08-26, notte)

L'owner non era davanti al Pad per ruotarlo fisicamente e ha chiesto di
procedere comunque. Il tentativo con solo `wm size` (fatto in precedenza)
scambia le dimensioni dichiarate ma il dispositivo resta internamente in
landscape; questa volta il comando giusto (`user_rotation` +
`accelerometer_rotation=0`) ha cambiato lo stato di rotazione vero usato dal
sistema, confermato da un secondo controllo indipendente e da uno screenshot
letto per byte (2400×3392, contenuto davvero impaginato in verticale, non
testo ruotato). La rotazione automatica è stata ripristinata a fine prova.

### Riassunto semplice

Tutto e tre i punti sono chiusi con prove vere sul telefono: il download si
vede scaricare davvero e ora si può mettere in pausa, riprendere o annullare
direttamente dal bottone; la chat col modello locale non mostra più il suo
"pensiero" interno mentre scrive, nemmeno per un istante durante la
generazione, e la risposta resta pulita anche dopo aver chiuso e riaperto
l'app; e il tablet in verticale ora si vede davvero, girato da un comando dato
che l'owner non era fisicamente davanti al dispositivo, verificato con lo
stesso rigore delle altre prove — screenshot vero, non solo il comando che
dice di averlo fatto.
