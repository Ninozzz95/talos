# CP18 — la ripetizione della sezione non cancella la ricerca

CP17 `a4b1c68` ha 45/45 impostazioni reali, 65/65 workspace, 1173 pass/1 skip frontend e tutti i test prototipo verdi. La consegna sorgenti 35275653284 passa anche sul runner Windows (app estratta, avvio, preferenze, PTY e arresto). Ma il gate esteso 35275653201 fallisce: Settings/Models registra 83 controlli passati e un timeout sulla ricerca Provider.

Correzione della diagnosi iniziale: `schema.ts` contiene già `api key`. Non manca un sinonimo. Nello screenshot negativo il campo di ricerca è tornato vuoto e la sezione Aspetto è visibile: l'immissione è stata cancellata. Il ponte `mostraSezioneImpostazioni` richiamava `view.select(selected)` con preserveSearch=false anche quando la sezione era già quella corrente.

Il ponte ora conserva la query quando ripete la stessa sezione, prima di aggiornare il dataset. Le scelte esplicite in SettingsView.choose() continuano a svuotarla, e il passaggio a una sezione differente la svuota. Nessun sinonimo inventato, timer o retry aggiunto al test. Le cinque regressioni eseguono la funzione produttiva estratta dal sorgente con collaboratori view/DOM isolati; non sono un test DOM completo. Il percorso reale di ricerca resta nel gate Settings/Models.

Questa correzione affronta il contratto di selezione; la correlazione con il timeout è un'ipotesi da verificare sul nuovo candidato, non una causalità misurata del ripristino all'avvio. Non sostituire i report negativi con un esito assunto. Nessun cambio a storage, default, autorizzazioni o API modello. PR Draft, senza merge/tag/release.
