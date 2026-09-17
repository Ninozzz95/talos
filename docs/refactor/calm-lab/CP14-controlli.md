# CP14 — componenti custom collegati ai proprietari reali

Il renderer `src/components/calm-controls.js` viene montato da `src/main.js` dopo il ponte e il monolite, nelle Impostazioni, nello Studio temi e nelle superfici esplicitamente annotate. CSS nel bundle realmente servito. Nessun secondo store produttivo.

Select, checkbox, switch e slider sono disegnati da componenti custom. Gli elementi HTML originari restano nascosti come ponte interno di valore/eventi, fuori dal tab order e dall'albero accessibile: non sono la UI mostrata all'utente. Restano intatti ID, opzioni, normalizzatori, persistenza e applicazione delle 40 preferenze attuali, incluse le 14 palette dello studio. Le primitive semantiche native (button/input/dialog) non sono state abolite.

## Review aggiuntiva e correzioni

- Listener per istanza con AbortController e cleanup durante rimozione/rimontaggio; niente modifiche ai prototype globali.
- Osservazione DOM circoscritta ai controlli/etichette: non riscansionare per delta della chat o didascalie del canvas.
- Valori assegnati programmaticamente e reset HTML sincronizzano la UI custom.
- Popup nel dialog proprietario, Escape chiude prima il menu, focus esplicito, tastiera/typeahead e opzioni disabilitate.
- Validazione required sull'elemento originale reindirizzata al controllo visibile; stato di errore annunciato.
- Le scelte scorse con le frecce non si salvano: commit con Invio/Spazio/clic, Escape/Tab/clic esterno annullano il solo menu.
- Elementi nascosti dall'autore non vengono resi visibili dal componente.
- Ciclo pagehide/pageshow: dispose e ricostruzione nel caso BFCache.

## Evidenza locale al checkpoint

153 test Node del prototipo e del dominio, 17 contratti browser del componente, 58 verifiche browser delle 40 impostazioni/14 temi, 30 combinazioni responsive: superati nel sandbox Linux. I roundtrip browser del prototipo usano uno storage in memoria dichiarato, non una prova di persistenza del profilo Desktop. HTML esatto iniettato in Chromium: file://, localhost e navigazione a un'origine intercettata sono bloccati dall'ambiente.

Non ancora qualificato a questo checkpoint: bundle reale su Node 24.18, profilo/backend reale, Windows/Electron, tecnologie assistive. I test del prototipo non certificano questi percorsi. La release e il merge globale rimangono bloccati.

## Confine funzionale

Il catalogo v03 approvato e l'estensione dei temi v04 sono un prototipo di riferimento separato. I suoi provider, modelli di esempio, costi, stime e download NON vengono importati dal prodotto. Questo checkpoint collega al prodotto il renderer custom e conserva le sue impostazioni; non dichiara conclusa la migrazione del catalogo alle API reali.
