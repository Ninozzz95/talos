# Ricerca e rationale delle scelte

Consultazione di fonti primarie il 17 settembre 2026. Si distinguono comportamenti documentati e applicazione proposta a Talos. Non sono state eseguite prove comparative dei prodotti concorrenti, audit dei loro screenshot o benchmark numerici. Le fonti non attestano le prestazioni del laboratorio.

## Fonti e applicazione

| Riferimento | Comportamento o contratto consultato | Scelta per Talos / cosa non adottare |
| --- | --- | --- |
| [W3C APG Tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) | Tab selezionata, relazione con tabpanel e navigazione da tastiera | La tab possiede la visibilità; il dettaglio non possiede il routing. Non introdurre cambio lento dipendente dal caricamento del dettaglio |
| [W3C APG Tree View](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/) | Distinzione focus/selezione, frecce, gruppi e metadati di posizione | Roving focus e navigazione della collezione virtuale. Non equiparare più checkbox a piena accessibilità |
| [W3C APG Menu Button](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/) | Pulsante con stato expanded e accesso tastiera al menu | Azioni contestuali con nome e focus. Non nascondere funzioni dietro un hover senza percorso da tastiera |
| [W3C APG Menu / Menubar](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/) | Movimento fra voci, Home/End, Escape e uscita dal menu | Contratto tastiera dei menu del laboratorio, non trasformazione della sidebar in un menubar |
| [VS Code Custom Layout](https://code.visualstudio.com/docs/configure/custom-layout) | Aree di lavoro e viste collocabili/ridimensionabili | Separazione fra sidebar e superficie operativa ampia; non comprimere il grafo complesso in 300 px |
| [VS Code Tree View API](https://code.visualstudio.com/api/extension-guides/tree-view) | Viste ad albero, provider dei dati e azioni nella vista | Controlli del progetto nell'explorer; non sostituire Chat con un IDE generico né copiare la palette |
| [MDN :has()](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/:has) | Selettore relazionale, supporto e invalidazione di selettori non riconosciuti | Regola `[hidden]` indipendente e feature query. Non dichiarare corretto un motore non testato |
| [Claude Code Subagents](https://code.claude.com/docs/en/sub-agents) | Contesti e strumenti dei sotto-agenti separati, risultato sintetico alla conversazione principale | Dettaglio e task separati dalla chat del padre. Non mostrare pensieri interni né permessi simulati come autorizzazioni effettive |
| [Aider Repository Map](https://aider.chat/docs/repomap.html) | Mappa del repository per selezionare contesto utile al modello | Selezione di contesto esplicita come direzione progettuale. Non chiamare una ricerca su fixture un indice semantico |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | Repository e documentazione di un agente estensibile | Riferimento architetturale consultato, non prova di un pattern visuale desktop identico. Nessun runtime Hermes importato |
| [Pi](https://github.com/earendil-works/pi) | Repository dell'ambiente agentico; il riferimento originario pi-mono reindirizza qui | Riferimento per separazione del motore e interfacce, non fonte per clonare una sidebar. Nessun codice Pi importato |

## Matrice delle decisioni principali

**File più calma:** confronto tra Tree View API e layout VS Code, APG Tree, Menu Button e Menu/Menubar. Sono cinque riferimenti pertinenti allo stesso problema: mantenere capacità e tastiera riducendo comandi concorrenti. Scelta: un selettore di vista, ricerca persistente, menu contestuali e barra della selezione solo quando serve. Alternativa scartata: ridurre le funzioni per far sembrare la vista pulita. Trade-off: un clic aggiuntivo su opzioni secondarie.

**Navigazione e stato del dettaglio:** Tabs, Tree, MDN :has(), Claude Subagents e VS Code Custom Layout aiutano a separare selezione, focus, visibilità e contesto operativo. La specifica locale del ponte Talos resta l'evidenza decisiva. Scelta: guardia CSS minima per il prodotto e stato indipendente nella demo. Alternativa scartata: smontaggio sistematico o riscrittura globale del routing per questo checkpoint.

**Robustezza delle interazioni:** Tree, Tabs, Menu Button, Menu/Menubar e MDN :has() offrono contratti verificabili. Nomi, copie, snapshot e conflitti sono invece correzioni motivate dai difetti del codice e dalle regressioni locali, non attribuite ai concorrenti.

Per le future funzioni avanzate (indice semantico, autorizzazioni reali, worktree, stream e grafo su larga scala) questa ricognizione non sostituisce un benchmark dedicato né la verifica dei rispettivi contratti runtime.
