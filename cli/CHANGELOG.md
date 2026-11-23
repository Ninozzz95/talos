# TALOS CLI changelog

Format: [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/). Versions follow
[SemVer](https://semver.org/): in 0.y.z anything may still change. The version lives in `package.json` and
`src/version.ts`, and in the `talos-cli-vX.Y.Z` tag. The package is published on npm as
[`talos-code`](https://www.npmjs.com/package/talos-code); the command is `talos`.

## talos-cli-v0.7.0 — 2026-11-24

### Added
- **A Projects page.** `/projects` (and the folder shown in the footer, now clickable) opens the list of the folders you have
  worked in: for each one, when you last used it, how many sessions it holds, and the model requests and tokens they used.
  In italiano: una pagina Progetti. `/projects` (e la cartella nel piede, ora cliccabile) apre l'elenco delle cartelle in cui hai lavorato: per ognuna quando l'hai usata l'ultima volta, quante sessioni ha, e le richieste al modello e i token che hanno usato.
- **New session: filters for where to start.** The page that starts a session has four filters (all, recent folders, quick
  folders, disks); an empty filter says so in one line.
  In italiano: Nuova sessione ha quattro filtri per scegliere da dove partire (tutte, cartelle recenti, cartelle rapide, dischi); un filtro vuoto lo dice in una riga.
- **«No to this tool until your next message» on a connector's, plugin's or Tool Forge's card** (key 6), as on the PC: the
  other calls of that tool in the same turn are refused without a card, another tool still asks, and your next message brings
  the card back. It is only a no: nothing is saved, and if TALOS cannot take it, the card's answer is a plain Deny. In our
  measure, ten refused calls of one tool asked ten times with Deny and once with 6.
  In italiano: «No a questo strumento fino al tuo prossimo messaggio» sulla carta di un connettore, di un plugin o di Tool Forge (tasto 6), come sul PC: le altre chiamate di quello strumento nello stesso giro sono rifiutate senza carta, un altro strumento chiede ancora, e il tuo prossimo messaggio riporta la carta. È solo un no: non si salva niente, e se TALOS non può prenderlo la risposta della carta è un Nega semplice. Nella nostra misura, dieci chiamate rifiutate dello stesso strumento hanno chiesto dieci volte con Nega e una volta con 6.
- **One card for the same calls of one answer** (key 7), as on the PC: when the model calls the same connector, plugin or Tool
  Forge tool several times in one answer, and TALOS lets that tool share a card, the first card lists up to 20 of the calls with
  what each one sends, says how many more it covers, and offers «Allow all the same calls of this answer». The other calls of
  that answer then run without a card, and each of their rows says «you allowed all N calls»; a call TALOS marks for a closer
  look still asks on its own card, and its row keeps that card's answer. A plain «Allow once» covers its call only, and nothing
  is saved.
  In italiano: una carta sola per le chiamate uguali di una risposta (tasto 7), come sul PC: quando il modello chiama più volte nella stessa risposta lo stesso strumento di un connettore, di un plugin o di Tool Forge, e TALOS lascia che quello strumento condivida una carta, la prima carta elenca fino a 20 chiamate con ciò che ognuna manda, dice quante altre ne copre e offre «Consenti tutte le chiamate uguali di questa risposta». Le altre chiamate di quella risposta partono poi senza carta, e la riga di ognuna dice «hai consentito tutte e N le chiamate»; una chiamata che TALOS segna per un controllo in più chiede ancora sulla sua carta, e la sua riga tiene la risposta di quella carta. Un semplice «Consenti una volta» vale solo per la sua chiamata, e non si salva niente.

### Changed
- **Home (Alt+H) is grouped as in the design:** «Start a job», «Pick up your work», «Organize your work», in place of the row of
  filters.
  In italiano: la Home (Alt+H) è divisa in gruppi come nel disegno («Start a job», «Pick up your work», «Organize your work») al posto della riga dei filtri.
- **The card that asks whether to trust a folder** draws its title in the top border and the folder as code. It turns on after
  one second and says so, so that a key pressed by mistake does not answer it; Enter alone still answers No.
  In italiano: la carta che chiede se fidarsi di una cartella ha il titolo nel bordo alto e la cartella scritta come codice. Si attiva dopo un secondo e lo dice, così un tasto premuto per sbaglio non risponde; Invio da solo risponde ancora No.
- **Disks page:** the notice on a disk whose job has not started yet is yellow, and in plain mode the key row no longer shows a
  key that does nothing there.
  In italiano: pagina dei dischetti: l'avviso su un dischetto il cui lavoro non è ancora partito è giallo, e in modo plain la riga dei tasti non mostra più un tasto che lì non fa niente.
- **A model that stops "for the context" is sent on without a notice:** TALOS compacts by itself, so it asks the model once to
  continue and no longer says «The model stopped early…» for that case; the other continuations still say why. In `talos -p` the
  text is the resumed answer when it brings text, in place of the one that stopped; when the resumed answer brings no text (empty,
  or reasoning only), the text stays the answer that stopped.
  In italiano: un modello che si ferma «per il contesto» viene fatto ripartire senza avviso: TALOS compatta da solo, quindi chiede una volta al modello di continuare e non dice più «The model stopped early…» per questo caso; le altre riprese dicono ancora perché. In `talos -p` il testo è la risposta ripresa quando porta testo, al posto di quella che si era fermata; quando la risposta ripresa non porta testo (vuota, o solo ragionamento), il testo resta la risposta che si era fermata.
- **Requests to Gemini carry `store: false`, already since 0.6.18, whose notes did not say it.** From `talos -p`, from a
  prompt typed on the interactive screen and from a request without streaming such as the conversation summary.
  In italiano: le richieste a Gemini portano `store: false`, già dalla 0.6.18, le cui note non lo dicevano: da `talos -p`, da un prompt scritto nello schermo interattivo e da una richiesta senza streaming come il riassunto della conversazione.

### Security
- **Write and Edit on a TALOS control file always ask you, once each time; so does a command that names a computer use settings file.**
  The core marks these cards (the computer use settings `.computer-use-impostazione.json` and `.computer-use-luoghi.json`; hooks,
  MCP, instructions, memory) and accepts only a yes from a person there. Before, an allow rule, a «for this session», accept-edits
  or Full access answered the card by itself, the core turned that yes into a no, and you were never asked. Now the card says why,
  offers only «Allow once» and «Deny», keeps no rule, and with nobody to ask (`-p`, never ask) it is refused saying why.
  In italiano: Scrivi e Modifica su un file di controllo di TALOS chiedono sempre a te, una volta ogni volta, e così un comando che nomina un file delle impostazioni dell'uso del computer; prima una regola, «per questa sessione», accept-edits o l'Accesso completo rispondevano da soli, il nucleo trasformava quel sì in un no e nessuno ti chiedeva niente.
- **Where the core says «always» is not enough, the card offers only «Allow once» or «Deny».** That is the ordinary card of a write
  to a TALOS control file, the card that starts an agent, and an agent's card in Default, Plan and Auto modes. Before, the card
  offered «for this session» and «always», kept them, and the next card was answered by that grant or rule. Now nothing is kept
  from those cards and no «for this session» answers them. In Accept edits and Full access an agent's card of a command, a write,
  an edit, a test, a document or an image has three choices: «Allow once», «Allow for this session» and «Deny» (no «always»),
  unless the card has another reason to be asked once: a control file (also a command that copies or moves into a control folder,
  or one TALOS cannot read for where it writes), the network, a critical deletion, a secret or credential, root in WSL, the
  trifecta, suspicious content or a write outside the project. When you switch to Default, a «for this session» you gave on an
  agent's card stops answering the agents' cards, which ask again with two choices; it still answers the same command on your
  own session's card, as a «for this session» always did there. On every card with two choices [2] is Deny, as the row shows,
  and the full review no longer prints a «[3] always» line nor the core's raw `sempreNonBasta` key.
  In italiano: dove il nucleo dice che «sempre» non basta (la scrittura ordinaria di un file di controllo, l'avvio di un agente, la carta di un agente nei modi Default, Plan e Auto) la carta offre solo «Consenti una volta» o «Nega» e non tiene niente; in Accept edits e Accesso completo la carta di un agente ha tre scelte, «una volta», «per questa sessione» e «Nega», tranne quando ha un altro motivo per chiedere una volta sola; passando a Default il «per questa sessione» dato a un agente smette di rispondere alle carte degli agenti, non a quella della tua sessione.
- **A «for this session» yes belongs to the conversation that gave it.** Before, «Allow for this session» on a card answered the
  same card in every conversation of the process, without asking: after `/clear` and in any conversation opened with `/resume`
  (0.6.18 did the same). Now a new conversation asks again, and so does another conversation opened with `/resume`; back on the
  first one with `/resume`, its yes is there again. Its delegated agents share it, as before. A card you answer
  after moving to another conversation counts in the conversation that asked it.
  In italiano: un «sì per questa sessione» vale nella conversazione che l'ha dato. Prima «Consenti per questa sessione» rispondeva da solo alla stessa carta in ogni conversazione del processo, dopo `/clear` e in ogni conversazione aperta con `/resume` (anche la 0.6.18); ora una conversazione nuova chiede di nuovo, e così un'altra aperta con `/resume`; tornando con `/resume` alla prima, il suo sì c'è ancora. I suoi agenti delegati lo condividono, come prima. Una carta a cui rispondi dopo essere passato a un'altra conversazione vale in quella che l'ha chiesta.
- **`/clear` no longer carries Full access into the new conversation.** The new conversation starts in «Ask before edits», as
  `/resume` and `/fork` already did, and Full access asks its confirmation again there, as for any new session. Before, the
  first message of the new conversation ran in Full access, never confirmed for it (0.6.18 did the same).
  In italiano: `/clear` non porta più l'Accesso pieno nella conversazione nuova. Parte in «Chiedi prima delle modifiche», come già facevano `/resume` e `/fork`, e l'Accesso pieno chiede di nuovo la conferma, come per ogni sessione nuova; prima il primo messaggio della conversazione nuova girava in Accesso pieno senza conferma (anche la 0.6.18).
- **«Always» on an MCP card holds for that server's one tool, never for the whole server.** Before, a card that named only the
  server offered «always» and wrote `Mcp(<server>:*)`, a rule for every tool of that server, with a «wildcard» warning in the full
  review. Now such a card offers only «Allow once» and «Deny», and no rule or «for this session» is kept from it, whatever answer
  arrives. The same holds for a card whose server or tool is not named by a plain name: a card never writes a rule for every tool
  of a server, whatever the server is called. A card that names its server and its tool keeps its five choices and writes
  `Mcp(<server>:<tool>)` as before; a `Mcp(<server>:*)` rule you write yourself in your configuration (`talos config set`, or the
  file) still holds.
  In italiano: «sempre» su una carta MCP vale per quel solo strumento del server, mai per tutto il server; una carta che nomina solo il server prima offriva «sempre» e scriveva `Mcp(<server>:*)`, ora offre solo «Consenti una volta» e «Nega» e non tiene né regole né «per questa sessione»; lo stesso vale per una carta il cui server o strumento non ha un nome semplice: una carta non scrive mai una regola per tutti gli strumenti di un server, comunque si chiami il server. Con server e strumento nominati la carta tiene le sue cinque scelte e scrive `Mcp(<server>:<tool>)` come prima, e una regola `Mcp(<server>:*)` scritta da te nella configurazione (`talos config set`, o il file) continua a valere.
- **A credential check now resolves short Windows path names the same way as the rest of the security code.**
  In italiano: **Un controllo delle credenziali ora legge i nomi brevi dei percorsi di Windows come il resto del codice di sicurezza.**

### Fixed
- **After `/clear`, `/resume` or `/fork` nothing of the conversation before stays on screen.** The footer's tokens and context,
  the usage tab, the delegated agents, the line of how the last turn ended and a retry notice start empty. Before, they stayed
  until the next turn. Back on a conversation, its agents still at work are counted in the footer again.
  In italiano: dopo `/clear`, `/resume` o `/fork` a schermo non resta niente della conversazione di prima: token e contesto nel piede, la scheda dell'uso, gli agenti delegati, la riga di com'è finito l'ultimo giro e l'avviso di un nuovo tentativo partono vuoti; prima restavano fino al giro seguente. Tornando a una conversazione, i suoi agenti ancora al lavoro ricompaiono nel piede.
- **A plan approved «in a clean conversation» no longer brings the conversation before along.** The new conversation starts
  as empty as after `/clear`: the plan card, «Done in», the agents at work and the tokens of the conversation before are gone
  from the view (the agents keep working in the conversation before, only out of sight). A permission card still waiting
  stays on screen and answers the conversation it came from. A plan approved in the same conversation keeps its view as
  before.
  In italiano: un piano approvato «in una conversazione pulita» non si porta più dietro la conversazione di prima. La conversazione nuova parte vuota come dopo `/clear`: la carta del piano, «Done in», gli agenti al lavoro e i token della conversazione di prima spariscono dalla vista (gli agenti continuano a lavorare nella conversazione di prima, solo fuori vista). Una carta dei permessi ancora in attesa resta a schermo e risponde alla conversazione da cui viene. Un piano approvato nella stessa conversazione tiene la sua vista come prima.

### Known limits
- **After «No to this tool until your next message»** the call you answered says «denied», but the later calls of that tool in the
  same turn, refused without a card, say «failed» with the core's «REFUSED…» sentence: the core gives those results no field the
  terminal could read as a refusal. They did not run.
  In italiano: dopo «No a questo strumento fino al tuo prossimo messaggio» la chiamata a cui hai risposto dice «denied», ma le chiamate dopo di quello strumento nello stesso giro, rifiutate senza carta, dicono «failed» con la frase «REFUSED…» del nucleo: il nucleo non dà a quei risultati un campo che il terminale possa leggere come rifiuto. Non sono partite.

## talos-cli-v0.6.18 — 2026-11-21

### Security
- **A network path is no longer opened to check whether it is one of your login keys.** Before deciding, TALOS compares each path
  in a command or a tool call with this computer's login credentials (`~/.ssh`, `~/.npmrc`, `~/.aws`…). For a path on another
  computer that check opened it, so Windows contacted that computer with your credentials before any card, in every mode (so since
  0.6.8). Now the computer is read from the text and the path is never opened; cards and decisions stay as in 0.6.17, except the
  two cases below: the one under «Changed», and this computer's own share. Recognised: a share written with backslashes, forward
  slashes or both; a WebDAV address (`@SSL`, a port); a variable that holds one (`%LOGONSERVER%`); and the same share through
  Windows' device names: UNC after the `.` or `?` prefix, also behind the GLOBAL and GLOBALROOT/DosDevices names, and the network
  redirectors (Mup, the Windows file-sharing and WebDAV redirectors, Remote Desktop's drives), with or without a computer after
  them, also with a dot at the end of a name, which Windows drops there. A home folder on a share is still checked as before on its
  own computer. `\\localhost\C$\…` (also `127.0.0.1`, `::1` and this computer's exact name) is read as your own disk as well as
  written, so a key reached that way now asks, in Full access too.
  In italiano: un percorso di rete non si apre più per controllare se è una delle tue chiavi di accesso. Prima di decidere, TALOS
  confronta ogni percorso di un comando o di una chiamata di strumento con le credenziali di accesso di questo computer (`~/.ssh`,
  `~/.npmrc`, `~/.aws`…). Per un percorso su un altro computer quel controllo lo apriva, quindi Windows contattava quel computer con
  le tue credenziali prima di ogni carta, in ogni modalità (così dalla 0.6.8). Ora il computer si legge dal testo e il percorso non
  si apre mai; carte e decisioni restano come nella 0.6.17, tranne i due casi qui sotto: quello della voce «Changed» e la
  condivisione di questo stesso computer. Riconosciuti: una condivisione scritta con barre rovesciate, barre dritte o tutte e due;
  un indirizzo WebDAV (`@SSL`, una porta); una variabile che ne contiene uno (`%LOGONSERVER%`); e la stessa condivisione attraverso i
  nomi dei dispositivi di Windows: UNC dopo il prefisso `.` o `?`, anche dietro i nomi GLOBAL e GLOBALROOT/DosDevices, e i
  redirettori di rete (Mup, i redirettori della condivisione file di Windows e di WebDAV, i dischi di Desktop remoto), con o senza un
  computer dopo, anche con un punto alla fine di un nome, che Windows lì toglie. Una cartella di casa su una condivisione si
  controlla come prima sul suo computer. `\\localhost\C$\…` (anche `127.0.0.1`, `::1` e il nome esatto di questo computer) vale come
  il tuo disco oltre che come è scritto, quindi una chiave raggiunta così ora chiede, anche in Accesso pieno.
- **In Full access, the file tools (read, write, edit, list, search) now ask first before a shared folder on another computer
  when Windows is set to follow links from a share back to this computer, or when TALOS cannot tell.** In Full access, a shell
  command that spells out a shared folder on another computer now asks first in the same cases. With `-p`, where nobody can answer,
  they are refused. When that Windows setting is off, nothing changes. A share of this computer (`localhost`, `127.0.0.1`, `::1`, its
  own name) and the WSL folders are unchanged. For the shell, TALOS reads only what the command spells out (see «Known limits»).
  In italiano: in Accesso pieno, gli strumenti dei file (lettura, scrittura, modifica, elenco, ricerca) ora chiedono prima di
  aprire una cartella condivisa di un altro computer, quando Windows è impostato per seguire i collegamenti da una condivisione verso
  questo computer o quando TALOS non riesce a saperlo. In Accesso pieno, un comando della shell che scrive per esteso una cartella
  condivisa di un altro computer ora chiede prima negli stessi casi. Con `-p`, dove nessuno può rispondere, sono rifiutati. Quando
  quell'impostazione di Windows è spenta non cambia niente. Una condivisione di questo computer (`localhost`, `127.0.0.1`, `::1`, il
  suo nome) e le cartelle di WSL restano come prima. Per la shell TALOS legge solo ciò che il comando scrive per esteso (vedi
  «Known limits»).

### Changed
- **The core packaged with the terminal is now the one of TALOS Desktop 0.2.4.** More ways of writing the delete of a whole
  drive, a top folder, your user folder or the project are read, so a few more of them ask (for example one written with
  `$'…'` quotes). `view_image` can also look at an image from a web address already in the conversation; like the web reader,
  it does not ask. More names of secret fields are hidden in the row of a tool.
  In italiano: il nucleo che accompagna il terminale ora è quello di TALOS Desktop 0.2.4. Sono letti più modi di scrivere la
  cancellazione di un disco intero, di una cartella principale, della tua cartella utente o del progetto, quindi qualcuna in più
  chiede (per esempio una scritta con gli apici `$'…'`). `view_image` può anche guardare un'immagine da un indirizzo web già
  presente nella conversazione; come il lettore del web, non chiede. Nella riga di uno strumento sono nascosti più nomi di campi
  segreti.
- **A link on another computer's share that leads back to your home is no longer followed.** In 0.6.17 the credential check opened
  the share and, by following such a link, could find one of your keys behind a network path; since the share is no longer opened,
  that link is not seen. This needs a symbolic link on that computer's share and the Windows setting that lets a link on another
  computer point to this one (with it off, neither 0.6.17 nor this version reaches the key). With that setting on, Full access asks
  first and `-p` refuses, within «Known limits»; auto mode decides as for any other command.
  In italiano: un collegamento sulla condivisione di un altro computer che riporta alla tua casa non si segue più. Nella 0.6.17 il
  controllo delle credenziali apriva la condivisione e, seguendo quel collegamento, poteva trovare una tua chiave dietro un percorso
  di rete; ora che la condivisione non si apre, quel collegamento non si vede. Serve un collegamento simbolico sulla condivisione di
  quel computer e l'impostazione di Windows che permette a un collegamento su un altro computer di puntare a questo (spenta, né la
  0.6.17 né questa versione raggiungono la chiave). Con quell'impostazione accesa, l'Accesso pieno chiede prima e `-p` rifiuta, nei
  limiti dei «Known limits»; il modo auto decide come per ogni altro comando.

### Fixed
- **In «Read only» (plan mode) a saved rule or a yes for the session no longer runs a tool that works outside TALOS.** Measured
  on 0.6.17 with a test MCP tool and a saved «always» rule (`Mcp(github:create_pr)`): switching to «Read only» while the model was
  working (Shift+Tab during a turn) let the tool run without asking, and so did an automation with `--mode plan` run by
  `talos automation run`. Now, in the same two runs, the tool does not run and no card is shown: the row says «Not run: denied by
  the permission mode: plan mode allows only read-only actions.», and the automation's model reads `PLAN_MODE_READ_ONLY`. Without
  the rule the switch used to show a card in that turn; now the tool is refused the same way (measured; a tool its server declares
  read-only is under Known limits). A session started in «Read only» already refused it, with the core's own words. A plugin's
  tool and a Tool Forge tool are refused too (checked on the permission engine). In «ask before edits» the saved rule runs the MCP tool as before, on the screen, with `-p`
  and in an automation (measured).
  In italiano: in «Sola lettura» (modo piano) una regola salvata o un sì per la sessione non fanno più partire uno strumento che
  lavora fuori da TALOS. Misurato sulla 0.6.17 con uno strumento MCP di prova e una regola «sempre» salvata
  (`Mcp(github:create_pr)`): passando a «Sola lettura» mentre il modello lavorava (Shift+Tab durante un giro) lo strumento partiva
  senza chiedere, e così in un'automazione con `--mode plan` lanciata con `talos automation run`. Ora, negli stessi due giri, lo
  strumento non parte e nessuna carta compare: la riga dice «Not run: denied by the permission mode: plan mode allows only
  read-only actions.» e il modello dell'automazione legge `PLAN_MODE_READ_ONLY`. Senza la regola il passaggio mostrava una carta in
  quel giro; ora lo strumento è rifiutato allo stesso modo (misurato; uno strumento che il suo server dichiara di sola lettura è
  nei limiti noti). Una sessione avviata in «Sola lettura» lo rifiutava già, con le parole del nucleo. Anche lo strumento di un
  plugin e quello di Tool Forge sono rifiutati (verificato sul motore dei permessi). In «chiedi prima delle modifiche» la regola salvata fa partire lo strumento MCP come prima,
  sullo schermo, con `-p` e in un'automazione (misurato).
- **«Allow for this session» on a plugin's tool covers that one tool of that plugin.** Measured on 0.6.17 with two test plugins:
  the yes given to `uno` of plugin `alfa` also ran `due` of plugin `beta` without a card. Now `due` of `beta` and `altro` of `alfa`
  each show their own card, and `uno` of `alfa` runs again without one (measured). «Always allow» on a plugin's tool still writes
  no rule and answers only for that tool in this session. The card now names the plugin and the tool (`plugin alfa, tool uno`).
  For a Tool Forge tool, in «ask before edits», the card names the tool and the yes covers that one tool (measured by a reviewer).
  Two names that differ only in capitals are two plugins or two tools. The cost is one more card the first time each further
  plugin or Tool Forge tool is used in a session: over 20 typical tasks, 5 cards became 9 in our count on the permission engine
  and 6 became 11 in a reviewer's, with no card shown twice for the same tool.
  In italiano: «Consenti per questa sessione» sullo strumento di un plugin vale per quello strumento di quel plugin. Misurato sulla
  0.6.17 con due plugin di prova: il sì dato a `uno` del plugin `alfa` faceva partire senza carta anche `due` del plugin `beta`.
  Ora `due` di `beta` e `altro` di `alfa` mostrano ognuno la sua carta, e `uno` di `alfa` riparte senza (misurato). «Consenti sempre»
  sullo strumento di un plugin continua a non scrivere nessuna regola e risponde solo per quello strumento in questa sessione. La
  carta ora nomina il plugin e lo strumento (`plugin alfa, tool uno`). Per uno strumento di Tool Forge, in «chiedi prima delle
  modifiche», la carta nomina lo strumento e il sì vale per quello strumento soltanto (misurato da un revisore). Due nomi che
  differiscono solo per le maiuscole sono due plugin o due strumenti. Il costo è una carta in più la prima volta che in una
  sessione si usa ogni altro strumento di un plugin o di Tool Forge: su 20 compiti tipici, 5 carte sono diventate 9 nel nostro
  conteggio sul motore dei permessi e 6 sono diventate 11 in quello di un revisore, e nessuna carta compare due volte per lo
  stesso strumento.
- **The core's «only once» card** (the card it shows in «Read only» for a tool that works outside TALOS) is answered by the
  person, once: a saved rule, a yes for the session and the mode no longer answer it, with nobody in front (`-p`, «don't ask»,
  automations) it is refused, and the card offers «Allow once» and «Deny» only (checked on the permission engine and the card).
  In italiano: la carta «solo una volta» del nucleo (quella che mostra in «Sola lettura» per uno strumento che lavora fuori da
  TALOS) la risponde la persona, una volta: una regola salvata, un sì per la sessione e il modo non la rispondono più, senza nessuno
  davanti (`-p`, «non chiedere», automazioni) è rifiutata, e la carta offre solo «Consenti una volta» e «Nega» (verificato sul motore
  dei permessi e sulla carta).

### Known limits
- **An MCP tool that its server declares read-only**, after a switch to «Read only» while the model is working, runs in that same
  turn without a card, also without a rule. With «Read only» chosen before the turn it is refused. This comes from the core and
  is not changed here. Measured with a test MCP tool on the installed 0.6.17 package, and by a reviewer with this change.
  In italiano: uno strumento MCP che il suo server dichiara di sola lettura, dopo un passaggio a «Sola lettura» mentre il modello
  lavora, parte in quello stesso giro senza carta, anche senza regola. Con «Sola lettura» scelta prima del giro è rifiutato. Viene
  dal nucleo e qui non cambia. Misurato con uno strumento MCP di prova sul pacchetto 0.6.17 installato, e da un revisore con
  questa modifica.
- **Not measured live: Tool Forge in «Read only».**
  In italiano: non misurato dal vivo: Tool Forge in «Sola lettura».
- **Write and Edit toward another computer** can still be opened before the card by the core packaged with this version, while it
  checks whether the file is a control file; this is the same with the core of Desktop 0.2.4 packaged here (measured). A link inside the project
  that leads to a share is still followed before the card, because only its name is written in the command. A network file system
  reached through another driver name of Windows' device namespace is not recognised and is opened as in 0.6.17.
  In italiano: Scrivi e Modifica verso un altro computer possono ancora essere aperti prima della carta dal nucleo che accompagna
  questa versione, mentre controlla se il file è un file di controllo; è uguale col nucleo del Desktop 0.2.4 che accompagna questa
  versione (misurato). Un
  collegamento dentro il progetto che porta a una condivisione si segue ancora prima della carta, perché nel comando c'è solo il suo
  nome. Un file system di rete raggiunto con un altro nome di driver dei dispositivi di Windows non è riconosciuto e si apre come
  nella 0.6.17.
- **For the shell, TALOS reads only the command as written.** It does not see a share reached through a drive letter connected to
  it, a path kept in a variable or put together by the command, a path joined to an option without a space, a share written as a
  file address, a path inside a word too long to read, a command that first moves into a network folder and then uses relative
  paths, a script or program that opens the share by itself, or a network folder mounted inside WSL. A very long command may not
  be read to the end. It guards against a command written out in full, it is not a fence: for a fence, use a mode that asks, or
  the sandbox.
  In italiano: per la shell TALOS legge solo il comando come è scritto. Non vede una condivisione raggiunta con una lettera di disco
  collegata a essa, un percorso tenuto in una variabile o costruito dal comando, un percorso attaccato a un'opzione senza spazio, una
  condivisione scritta come indirizzo di tipo file, un percorso dentro una parola troppo lunga da leggere, un comando che prima entra
  in una cartella di rete e poi usa percorsi relativi, uno script o un programma che apre da sé la condivisione, o una cartella di
  rete montata dentro WSL. Un comando molto lungo può non essere letto fino in fondo. Fa da difesa per il comando scritto per
  esteso, non da recinto: per un recinto si usa un modo che chiede, o la sandbox.
- **A project opened directly from a network folder** asks once for the session in Full access when that Windows setting is on or
  unknown, not before each file of the project.
  In italiano: un progetto aperto direttamente da una cartella di rete chiede una volta per la sessione in Accesso pieno quando
  quell'impostazione di Windows è accesa o non si sa, non prima di ogni file del progetto.

## talos-cli-v0.6.17 — 2026-11-19

### Security
- **In «accept edits» a file command goes without asking only when it really stays inside the project.** In 0.6.16 the
  mode said yes by itself to `cp`, `mv`, `rm`, `rmdir`, `mkdir` and `touch` in cases where the shell works outside the project or
  where an edit would have asked. Each of these now asks (and is refused with `-p`, where nobody can answer):
  - **A path with `~` or a variable**: `rm -rf ~/something`, `mv x ~/something`, `cp a ~/.claude/settings.json`, `$HOME`,
    `${HOME}`, `%USERPROFILE%`. TALOS read `~/something` as a folder inside the project, while the shell goes to your home.
  - **Anything the shell would expand or read differently**: globs and brace lists (`rm *.log`, `cp {a,b} dist`), the cmd caret, a
    drive letter without a slash (`C:x`), a backslash inside quotes, and outside Windows any backslash.
  - **The folders where an edit already asks**: `.github`, `.vscode`, `.idea` and `.husky` join `.git` and `.talos-cli`, in any
    capitals and with a trailing dot or space; and a path whose real place, through a link, is outside the project or in one of them.
  - **An option that names where to write**: `--target-directory=…`, `-t`, or an option after a file name (`cp a b -t dir`).
  - **A line break inside the command** (also a carriage return and the Unicode line characters): bash and PowerShell run what
    follows it as a second command, which the mode never approved.
  - **A command that writes, moves or deletes a TALOS control file** (`CLAUDE.md`, `AGENTS.md`, `.talos/`, `.claude/`, the hook and
    MCP files, `skills/` at the root…): `cp x CLAUDE.md`, `cp x .talos/hooks.json`, `cp CLAUDE.md docs/`, `mv CLAUDE.md old.md`,
    `mkdir .talos`. These files decide what the agent may do; TALOS reads them with the core's own rule, the one that already guards
    the core's writes. A copy that only reads one into a new file (`cp CLAUDE.md backup.md`) still goes. A copy or move whose source
    ends in `.` or `..` (`cp -r tmp/a/. docs`) asks too: it brings a folder's content, whose names the command does not show.
  Everyday commands inside the project (`mkdir -p src/x`, `cp -r src/lib dist/lib`, `rm -rf dist`, `mv old.txt new.txt`…) still
  go without asking, and the other modes decide as before.
  In italiano: in «accetta le modifiche» un comando di file (cp, mv, rm, rmdir, mkdir, touch) parte da solo solo se resta davvero
  nel progetto; ora chiede con `~` e le variabili (`rm -rf ~/qualcosa`), coi glob e con ciò che la shell legge in altro modo, nelle
  cartelle dove già chiede una modifica (`.github`, `.vscode`, `.idea`, `.husky`), attraverso un collegamento che porta fuori, con
  `--target-directory=`/`-t`, con un a capo nel comando, e quando scrive, sposta o cancella un file di controllo di TALOS
  (`CLAUDE.md`, `.talos/`, `.claude/`…, letti con la regola del nucleo; una copia che lo legge soltanto parte ancora), e quando la
  sorgente di una copia o di uno spostamento finisce in `.` o `..`; i comandi di tutti i giorni nel progetto partono da soli come prima.
- **On Windows, a command that cmd.exe reads differently from TALOS asks.** There every command runs through cmd.exe, which reads
  single quotes, `\"`, `%VAR%`, `!VAR!` and, after its built-in commands, the separators `, ; =` its own way: `mkdir 'x&mkdir y'`
  runs a second command, `mkdir x,..\escaped` makes a folder outside the project. TALOS now recognizes these forms: `, ; =` and
  single quotes in a command that starts with the plain name `mkdir`, `md`, `rmdir`, `rd`, `del`, `erase`, `copy`, `move`, `ren`,
  `rename`, `type`, `dir` or `mklink`, also with a redirection before or inside it (`2>&1 dir x,..\..\outside`,
  `dir x 2>&1 ,..\..\outside`); anywhere in the line when a command of it starts with `if`, `for`, `call`, `cmd`, `start` or a
  redirection; `%VAR%` when a variable of that name exists, or anywhere in a line that sets or re-reads variables (`set`, `call`,
  `cmd`…); `!VAR!` always. A command in one of these forms asks in «accept edits», and neither an allow rule for its verb
  (`Bash(mkdir:*)`) nor the built-in allowance of read-only commands (`dir x,..\..\outside`) covers it any more: it asks where TALOS
  asks and is refused where nobody can answer (`-p`, «don't ask»); Full access runs it as before. It was already so in 0.6.16. The other commands of the same line (`npm test -- --a=b && dir`)
  are read as before, and percents that name no variable (`git log --format=%h%x09%s`) are judged as in 0.6.16: with an allow rule
  for its verb such a command still asks on Windows, as it did. On every system, `!` in a file command's path
  now asks in «accept edits», and a path that crosses a link and then `..` (`rm -rf link/../x`) is judged from where the link leads,
  as a POSIX shell walks it (on Windows, which drops `link/..` before looking, this asks a little more than needed).
  In italiano: su Windows ogni comando passa da cmd.exe, che legge a modo suo le virgolette semplici, `\"`, `%VAR%`, `!VAR!` e, dopo
  i suoi comandi interni, `, ; =`. TALOS ora riconosce queste forme: `, ; =` e gli apici nel comando che comincia col nome semplice
  `mkdir`, `md`, `rmdir`, `rd`, `del`, `erase`, `copy`, `move`, `ren`, `rename`, `type`, `dir` o `mklink`, anche con una redirezione
  prima o dentro (`2>&1 dir x,..\..\outside`, `dir x 2>&1 ,..\..\outside`); in tutta la riga se un suo comando comincia con `if`,
  `for`, `call`, `cmd`, `start` o con una redirezione; `%VAR%` se esiste una variabile con quel nome, o in tutta la riga se la riga imposta o
  rilegge le variabili (`set`, `call`, `cmd`…); `!VAR!` sempre. Un comando così chiede in «accetta le modifiche», e né una regola che
  consente il suo verbo né il permesso di serie dei comandi di sola lettura lo coprono più; chiede dove TALOS chiede, è rifiutato dove
  nessuno può rispondere (`-p`, «non chiedere»), in Accesso pieno parte come prima. C'era già nella 0.6.16. Gli altri comandi della
  stessa riga si leggono come prima, e le percentuali che non nominano una variabile sono giudicate come nella 0.6.16: con una
  regola allow per il suo verbo un comando così su Windows chiede ancora, come prima. Su ogni sistema `!` nel percorso chiede in
  «accetta le modifiche», e `collegamento/../x` si giudica da dove porta il collegamento, come lo percorre una shell POSIX (su Windows
  chiede un po' più del necessario).

### Known limits
- **Write and Edit on a TALOS control file** (`CLAUDE.md`, `.talos/hooks.json`, `.claude/settings.json`…): in «accept edits» and in
  Full access the core refuses the write without showing a card, so nothing is written and nobody is asked; in «ask before edits»
  the person is asked, as in 0.6.16.
  In italiano: Scrivi e Modifica su un file di controllo di TALOS: in «accetta le modifiche» e in Accesso pieno il nucleo rifiuta la
  scrittura senza mostrare una carta, quindi niente viene scritto e nessuno viene chiesto; in «chiedi prima delle modifiche» si
  chiede alla persona, come nella 0.6.16.
- **In Full access a shell command toward a control file** (a copy, a redirection)
  runs without a card, as in 0.6.16 and as in TALOS Desktop.
  In italiano: in Accesso pieno un comando della shell verso un file di controllo (una copia, una redirezione) parte senza carta,
  come nella 0.6.16 e come in TALOS Desktop.
- **On Windows, a critical deletion written after an apostrophe and an `&` on the same line**: a command that deletes a whole
  drive or folder, written that way, is not seen by the core's reader, so the critical-deletion card does not appear. In Full
  access the command runs without a card; in the other modes it is refused as a command TALOS cannot split. It was already so
  in 0.6.16.
  In italiano: su Windows, una cancellazione critica scritta dopo un apostrofo e un `&` sulla stessa riga: un comando che cancella
  un disco o una cartella intera, scritto così, non è visto dal lettore del nucleo, quindi la carta della cancellazione critica non
  compare. In Accesso pieno il comando parte senza carta, negli altri modi è rifiutato come comando che TALOS non sa dividere.
  C'era già nella 0.6.16.
- **On Windows, the card for a command cmd.exe reads differently** (`git commit -m "Wow!Great!"`) still offers «Always allow», but
  the saved rule does not cover that command next time: it asks again, and with `-p` it is refused.
  In italiano: su Windows la carta di un comando che cmd.exe legge diversamente (`git commit -m "Wow!Great!"`) offre ancora «Consenti
  sempre», ma la regola salvata non lo copre la volta dopo: chiede di nuovo, e con `-p` è rifiutato.
- **On Windows, single quotes around a blank in an external command** (`node script.js 'two words'`): what the program gets
  depends on the program. The Git for Windows tools read single quotes themselves (one word, as TALOS reads it); a native program
  such as `node` gets two words (`'two` and `words'`), while TALOS reads one. On the permission check, an allow rule for the
  program (`Bash(node:*)`) says yes, also with `-p`; without a rule it asks, and so does «accept edits».
  In italiano: su Windows, apici semplici attorno a uno spazio in un comando esterno (`node script.js 'two words'`): che cosa
  riceve il programma dipende dal programma. Gli strumenti di Git per Windows leggono gli apici da sé (una parola, come la legge
  TALOS); un programma nativo come `node` riceve due parole (`'two` e `words'`), mentre TALOS ne legge una. Nel controllo dei
  permessi una regola che consente il programma (`Bash(node:*)`) dice sì, anche con `-p`; senza regola chiede, e così «accetta le
  modifiche».
- **A folder of a control path written with a trailing dot or space**: in «accept edits» a file command toward it goes by
  itself, as in 0.6.16.
  In italiano: una cartella del percorso di un file di controllo scritta con un punto o uno spazio finale: in «accetta le
  modifiche» un comando di file verso di lei parte da solo, come nella 0.6.16.
- **Switching to «Read only» while the model is working** (Shift+Tab during a turn): a saved «always» rule for an MCP tool
  (`Mcp(github:create_pr)`) still lets that tool run without asking in that same turn. Without the rule, the card asks. A tool that
  its server declares read-only is different: after the switch it runs in that same turn without a card, also without the rule. When
  the session starts in «Read only», the tool does not run. Measured with a test MCP tool.
  In italiano: passando a «Sola lettura» mentre il modello lavora (Shift+Tab durante un giro), una regola «sempre» salvata per uno
  strumento MCP (`Mcp(github:create_pr)`) fa ancora partire quello strumento senza chiedere, nello stesso giro. Senza la regola la carta
  chiede. Uno strumento che il suo server dichiara di sola lettura è diverso: dopo il cambio parte in quello stesso giro senza carta,
  anche senza la regola. Con la sessione avviata in «Sola lettura» lo strumento non parte. Misurato con uno strumento MCP di prova.
- **An automation run with `--mode plan`** (`talos automation add … --mode plan`, then `talos automation run`): a saved «always» rule
  for an MCP tool lets that tool run. Without the rule, it is refused (`PERMISSION_REQUIRED`). Measured with a test MCP tool and
  `automation run`; the scheduled runner (`serve`) was not measured.
  In italiano: un'automazione con `--mode plan` (`talos automation add … --mode plan`, poi `talos automation run`): una regola «sempre»
  salvata per uno strumento MCP fa partire quello strumento. Senza la regola è rifiutato (`PERMISSION_REQUIRED`). Misurato con uno
  strumento MCP di prova e `automation run`; l'avvio pianificato (`serve`) non è stato misurato.
- **«Allow for this session» given to one plugin's tool** also lets the tools of another plugin run without a card in the same session.
  «Allow once» does not: the other plugin's tool shows its own card. Measured in «ask before edits» with two test plugins.
  In italiano: «Consenti per questa sessione» dato allo strumento di un plugin fa partire senza carta anche gli strumenti di un altro
  plugin, nella stessa sessione. «Consenti una volta» no: lo strumento dell'altro plugin mostra la sua carta. Misurato in «chiedi prima
  delle modifiche» con due plugin di prova.
- To keep an MCP tool from running in «Read only» or in a `--mode plan` automation, remove its saved «always» rule (`Mcp(…)` in
  `permissions.allow`). Without the rule, the card asks, or the call is refused when nobody is there. This does not cover a tool
  that its server declares read-only, after a switch during a turn.
  In italiano: perché uno strumento MCP non parta in «Sola lettura» o in un'automazione `--mode plan`, togli la sua regola «sempre»
  salvata (`Mcp(…)` in `permissions.allow`). Senza la regola la carta chiede, o la chiamata è rifiutata se non c'è nessuno. Questo non
  vale per uno strumento che il suo server dichiara di sola lettura, dopo un cambio a giro avviato.
- For a plugin's tool, answer «Allow once» instead of «Allow for this session»: then every other plugin's tool still asks.
  In italiano: allo strumento di un plugin rispondi «Consenti una volta» invece di «Consenti per questa sessione»: così ogni strumento
  degli altri plugin chiede ancora.

## talos-cli-v0.6.16 — 2026-11-18

### Changed
- The CLI carries the core of TALOS Desktop 0.2.3 (bb6d3799a), the same as the phone 0.1.49.
- La CLI porta il nucleo di TALOS Desktop 0.2.3 (bb6d3799a), lo stesso del telefono 0.1.49.

### Security
- **The permissions repair of TALOS Desktop 0.2.3 is in the CLI.** The engine that checks a shell command before it runs is the
  same file as the desktop's (`cancellazioni-critiche.mjs` and `path-policy.mjs`, byte for byte). What changes for you:
  - **A command too complex to read before it runs now always asks**, in every permission mode, Full access included, with its
    own reason («too complex to read before it runs, and it may delete something»). Before, the check could give up on a long or
    deeply nested command and let a delete of your home, of the root or of the project through with no question (already in 0.6.15).
  - **A delete that starts from an empty or missing variable asks** (`rm -rf $NOT_SET/x`): the shell reads it from the root of the
    disk, and so does TALOS now, for bash, cmd and PowerShell.
  - **A delete that names your home or the project with a negated set asks** (`rm -rf ../[!P]rogetto`,
    `rm -rf /Users/[![:upper:]]izio`) on Windows, macOS and the phone's shared storage. The shell matches capitals exactly even on a
    disk that ignores them, and the check now reads the set the same way.
  - **Windows: more spellings of the same disk reach the same protected place**: a path with no drive letter is read on the disk of
    the session folder (not of the process), doubled slashes after the drive letter, the long form with doubled slashes, the names
    of this computer (`\\127.x\C$`, `\\?\UNC\`) and the forms PowerShell and Git Bash accept. Credential files of your home ask for
    every spelling.
  - **macOS and the phone's shared storage: a name written with other capitals or another Unicode form** of your home or the
    project asks, as the disk sees the same folder.
  - **A `cd` that does not stay** (sent to the background, in a subshell or in a pipe) no longer moves the commands after it, and
    **bash inside WSL** (`wsl bash -c …`) and **`%ComSpec% /c`** are read like bash and cmd.
  - The check has fixed limits, numbers and not times, on how much work one command may cost; past them, the same «too complex»
    card. Every card the desktop's 0.2.1 engine gave is still given (measured on the desktop: 567,180 checks, 0 cards lost, 0 extra
    cards on 74 everyday commands and 13 phone commands).
- **The CLI says the new reason in English.** `--protocol v2` reports `criticalDelete.why: "tooComplex"` (not the engine's Italian
  word), and a card that arrives without the engine's sentence says «This command is too complex to read before it runs, and it
  may delete something.»; the error page of `CRITICAL_DELETE_NEEDS_PERSON` lists it too.
- **La riparazione dei permessi di TALOS Desktop 0.2.3 è nella CLI.** Il controllo che legge un comando prima che parta è lo stesso
  file del desktop. Un comando troppo complesso da leggere ora chiede sempre, anche in Full access; chiede una cancellazione che
  parte da una variabile vuota o che non c'è, o che nomina la tua cartella utente o il progetto con un insieme negato; su Windows
  più grafie dello stesso disco arrivano allo stesso posto protetto; su macOS e nella memoria condivisa del telefono un nome scritto
  con altre maiuscole chiede. `--protocol v2` dice il motivo nuovo in inglese (`tooComplex`).

### Known limits (EN)
- **The tool row can show some argument values in clear when the arguments arrive as a list**, instead of as named fields, as in
  0.6.14. The card is not affected. A later release reads a list the same way as named fields.
- **A less common bash quoting form** — when a command uses one of bash's less common quoting forms in an unusual way, the permission
  check can lose track of where the quotes end, and a critical deletion later in the same command is not recognised. With «Full access»
  it runs without asking, as in 0.6.14. A later release asks for the card whenever the check cannot read the quoting. Until then, do not
  leave «Full access» on for commands you have not read yourself.
- **Some commands with many wildcards can hold the permission check for a few seconds, as in 0.6.14.** TALOS can take a few seconds to
  decide whether to ask you, and the conversation waits meanwhile. Nothing runs before the decision. A later release makes this check
  fast in every case. Until then, prefer a short pattern or a list of names over one long pattern.
- **Some secret names on the connector card, as in 0.6.14** — the card masks a field when its name ends with a secret word
  (`db_password`, `api_key`); a name where the secret word sits elsewhere, or a very short one such as `pass`, can be shown in clear on
  the card. The tool row hides more of them. The model and the tool still receive the real values. Until a later release, prefer
  connectors that read secrets from their own settings rather than receiving them as arguments.
- **A device served by this terminal reads the public model list as «not reachable» when the list is off**, instead of «off». No request
  leaves for openrouter.ai either way.
- **On first start, right after «Yes, trust this folder», the input box can appear for a few milliseconds without the two footer rows (permission mode and model).** They appear immediately after. Nothing is lost and nothing runs differently. A later release draws the first screen whole.
- **Two shortcuts pressed within a few milliseconds of each other can count as one, as in 0.6.14.** For example a quick double Ctrl+A may open the first panel only. Press the second shortcut again. A later release reads every key on its own.
- **Starting TALOS CLI takes about 50 milliseconds longer than in 0.6.14 (about 480 instead of 430 on our test PC).** Nothing else changes. A later release makes start faster.

### Limiti noti (IT)
- **La riga dello strumento può mostrare in chiaro alcuni valori degli argomenti quando gli argomenti arrivano come lista**, invece che
  come campi con un nome, come nella 0.6.14. La carta non cambia. Una versione successiva legge una lista come i campi con un nome.
- **Una forma di virgolette di bash poco comune** — quando un comando usa in modo insolito una delle forme di virgolette meno comuni di
  bash, il controllo dei permessi può perdere il punto in cui le virgolette finiscono, e una cancellazione critica più avanti nello
  stesso comando non viene riconosciuta. Con «Full access» parte senza chiedere, come nella 0.6.14. Una versione successiva chiede la
  carta ogni volta che il controllo non sa leggere le virgolette. Fino ad allora non lasciare «Full access» acceso per comandi che non
  hai letto tu.
- **Alcuni comandi con molti caratteri jolly possono tenere fermo il controllo dei permessi per alcuni secondi, come nella 0.6.14.**
  TALOS può metterci alcuni secondi a decidere se chiederti il permesso, e intanto la conversazione aspetta. Prima della decisione non
  parte niente. Una versione successiva rende veloce questo controllo in ogni caso. Fino ad allora preferisci un modello corto o un
  elenco di nomi a un solo modello lungo.
- **Alcuni nomi di segreto sulla carta dei connettori, come nella 0.6.14** — la carta oscura un campo quando il suo nome finisce con una
  parola di segreto (`db_password`, `api_key`); un nome in cui la parola del segreto sta altrove, o uno cortissimo come `pass`, può
  vedersi in chiaro sulla carta. La riga dello strumento ne nasconde di più. Il modello e lo strumento ricevono comunque i valori veri.
  Fino a una versione successiva preferisci i connettori che leggono i segreti dalle proprie impostazioni invece di riceverli come
  argomenti.
- **Un dispositivo servito da questo terminale legge l'elenco pubblico dei modelli come «non raggiungibile» quando l'elenco è spento**,
  invece che «spento». In nessuno dei due casi parte una richiesta verso openrouter.ai.
- **Al primo avvio, subito dopo «Yes, trust this folder», la casella può comparire per pochi millisecondi senza le due righe del piede (modo dei permessi e modello).** Arrivano subito dopo. Non si perde niente e niente funziona in modo diverso. Una versione successiva disegna il primo schermo intero.
- **Due scorciatoie premute a pochi millisecondi l'una dall'altra possono contare come una sola, come nella 0.6.14.** Per esempio un doppio Ctrl+A molto rapido può aprire solo il primo pannello. Premi di nuovo la seconda scorciatoia. Una versione successiva legge ogni tasto per conto suo.
- **L'avvio di TALOS CLI richiede circa 50 millisecondi in più rispetto alla 0.6.14 (circa 480 invece di 430 sul nostro PC di prova).** Nient'altro cambia. Una versione successiva rende l'avvio più veloce.

## talos-cli-v0.6.15 — 2026-11-16

### Security
- **The tools of connectors (MCP servers), plugins and Tool Forge now ask before they run.** Up to 0.6.14 they ran without a question in
  every permission mode. Now a card asks each time in «Ask before edits» and in «Accept edits», also for a tool its connector declares
  read-only, and «Allow once» is worth that call only. «Full access» does not ask, as for the other tools. This comes from the engine of
  TALOS Desktop 0.2.2.
- **Gli strumenti dei connettori (i server MCP), dei plugin e di Tool Forge ora chiedono prima di partire.** Fino alla 0.6.14 partivano
  senza domanda in ogni modalità dei permessi. Ora una carta chiede ogni volta in «Ask before edits» e in «Accept edits», anche per uno
  strumento che il suo connettore dichiara di sola lettura, e «Allow once» vale solo per quella chiamata. «Full access» non chiede, come
  per gli altri strumenti. Viene dal motore di TALOS Desktop 0.2.2.
- **Deleting an important folder is yours in every mode.** Deleting a top-level folder, your user folder, the project or one of its
  parents asks every time, also in «Full access»; TALOS refuses your home folder (`rm -rf ~`), the root of a disk and the system
  folders outright, as in 0.6.14. A deletion TALOS cannot read whole asks too, with the reason.
- **Cancellare una cartella importante resta una tua scelta in ogni modalità.** Cancellare una cartella in cima, la tua cartella
  utente, il progetto o una delle cartelle che lo contengono chiede ogni volta, anche in «Full access»; TALOS rifiuta senza chiedere
  la tua cartella personale (`rm -rf ~`), la radice di un disco e le cartelle di sistema, come nella 0.6.14. Chiede anche una
  cancellazione che TALOS non riesce a leggere per intero, e dice perché.
- **This computer's credentials still ask in «Full access»**, like `~/.ssh`, and so does the key of TALOS's sign-in links. A tool call
  that a local model wrote as text is answered only by you, never by a rule or a mode.
- **Le credenziali di questo computer chiedono anche in «Full access»**, come `~/.ssh`, e così la chiave dei link d'accesso di TALOS.
  A una chiamata che un modello locale ha scritto come testo rispondi solo tu, mai una regola o una modalità.
- **A new folder asks whether you trust it.** The card offers Yes, Yes and the folder above, Only this time and No (the default). No opens
  TALOS without anything of that folder, and `/trust` asks again. `talos -p` does not run in a folder nobody decided, a folder above
  your home folder is never saved as trusted, and the trust is read again at every message you send. In a folder you did not trust,
  «Full access» works as «Ask before edits» and one line says so.
- **Una cartella nuova chiede se ti fidi.** La carta offre Sì, Sì e la cartella sopra, Solo questa volta e No (la scelta di serie). No
  apre TALOS senza niente di quella cartella, e `/trust` chiede di nuovo. `talos -p` non parte in una cartella che nessuno ha deciso,
  una cartella sopra la tua cartella di casa non si salva mai come fidata, e la fiducia si rilegge a ogni messaggio che mandi. In una
  cartella di cui non ti fidi, «Full access» lavora come «Ask before edits» e una riga lo dice.
- **Git is safe by default where TALOS starts it on its own** (checkpoints, `/undo`, `/diff`, the count in the footer): the settings a
  copied folder brings cannot run programs there.
- **Git è sicuro di serie dove TALOS lo avvia da solo** (punti di ripristino, `/undo`, `/diff`, il conto nel piè di pagina): le
  impostazioni che porta una cartella copiata non possono far partire programmi.

### Privacy
- **The public model list is off by default.** TALOS asks openrouter.ai for its list only after you give OpenRouter a key or choose an
  OpenRouter model, or turn the list on; a variable of the environment turns it off for good. Until then the built-in list is shown.
- **L'elenco pubblico dei modelli è spento di serie.** TALOS chiede l'elenco a openrouter.ai solo dopo che hai dato una chiave a
  OpenRouter, hai scelto un modello di OpenRouter o hai acceso l'elenco; una variabile dell'ambiente lo spegne del tutto. Fino ad allora
  si vede l'elenco incorporato.

### Added
- **Remote control from the terminal.** `talos remote` pairs a device with a QR code; `talos remote list`, `revoke`, `relay` and `folders`
  manage the devices and the folders each may work in. Inside TALOS, `/remote` shows the pairing in a card over the conversation. One
  window hosts the devices; the others say which one, and take over when it closes. A message sent from a device says which device sent
  it, a device's change of model, reasoning or mode shows at once, a device asks for a folder with a card, and the activity line says
  when a notification was sent to your device. A window opened as administrator can be controlled, with a fixed warning. The component
  remote control needs is downloaded from npm the first time and kept only if its fingerprint is the expected one.
- **Controllo remoto dal terminale.** `talos remote` collega un dispositivo con un codice QR; `talos remote list`, `revoke`, `relay` e
  `folders` gestiscono i dispositivi e le cartelle in cui ognuno può lavorare. Dentro TALOS, `/remote` mostra il collegamento in una
  carta sopra la conversazione. Una finestra ospita i dispositivi; le altre dicono quale, e prendono il suo posto quando si chiude. Un
  messaggio mandato da un dispositivo dice quale dispositivo l'ha mandato, un cambio di modello, ragionamento o modalità fatto dal
  dispositivo si vede subito, un dispositivo chiede una cartella con una carta, e la riga delle attività dice quando una notifica è stata
  mandata al tuo dispositivo. Una finestra aperta come amministratore si può controllare, con un avviso fisso. Il componente che serve al
  controllo remoto si scarica da npm la prima volta e si tiene solo se la sua impronta è quella attesa.
- **A new look for the interactive screen.** The Home is the first screen; a bar on the left, a panel on the right with the Context and
  Agents cards, and tabs in the header. Long commands open as pages: Review, Notes, Tasks, Library, Memory, Help, Research, Forge,
  Automations, Capability, Models, Conversations and Board, Context Manager, usage, Agents (list and timeline), Devices, Doctor,
  Processes and Settings, plus the shelf of your conversations. The element under the pointer lights up, queued messages sit in a band
  above the prompt, and a permission card takes the prompt's place and always fits the window.
- **Un aspetto nuovo per lo schermo interattivo.** La Home è il primo schermo; una barra a sinistra, un pannello a destra con le carte
  Contesto e Agenti, e le schede in alto. I comandi lunghi si aprono come pagine: Revisione, Note, Attività, Libreria, Memoria, Aiuto,
  Ricerca, Forge, Automazioni, Capacità, Modelli, Conversazioni e Bacheca, Gestione del contesto, uso, Agenti (elenco e linea del tempo),
  Dispositivi, Doctor, Processi e Impostazioni, più lo scaffale delle tue conversazioni. L'elemento sotto il puntatore si illumina, i
  messaggi in coda stanno in una fascia sopra il prompt, e una carta dei permessi prende il posto del prompt e sta sempre nella finestra.
- **The card of a connector, plugin or Tool Forge tool shows what the call sends.** Under «What it sends:» every argument is a row,
  `name: value`, and an object or a list opens under its name, indented; a very long name gets its own row and its value goes on the row
  under it, so the value is never folded away. TALOS masks a field named like a secret (a key, a token, a password, at any depth) and a
  value shaped like a key before the card shows it, and cuts a long value with «…»; the card then says how many values were cut. Two long
  names that start the same stay two rows, and the second shows its number first. The tool still receives every argument whole. The full
  review (`v`) names the server or plugin and the tool in words, never the arguments as raw JSON.
- **La carta di uno strumento di un connettore, di un plugin o di Tool Forge mostra che cosa manda la chiamata.** Sotto «What it sends:»
  ogni argomento è una riga, `nome: valore`, e un oggetto o una lista si apre sotto il suo nome, rientrato; un nome lunghissimo ha una
  riga sua e il valore va nella riga sotto, così non si nasconde mai. TALOS oscura un campo che ha il nome di un segreto (una chiave, un
  token, una password, a ogni profondità) e un valore che ha la forma di una chiave prima che la carta lo mostri, e taglia un valore lungo
  con «…»; la carta dice quanti valori ha tagliato. Due nomi lunghi che iniziano allo stesso modo restano due righe, e il secondo mostra
  prima il suo numero. Lo strumento riceve comunque ogni argomento intero. La revisione completa (`v`) nomina in parole il server o il
  plugin e lo strumento, mai gli argomenti come JSON grezzo.
- **`/retry` asks again in a branch**, instead of sending your last message a second time in the same conversation; when there is
  nothing to retry, it says so.
- **`/retry` richiede in un ramo**, invece di mandare una seconda volta il tuo ultimo messaggio nella stessa conversazione; quando non
  c'è niente da riprovare, lo dice.
- **The model can read the guide of TALOS CLI and look at an image** you point it to. The research card lets you change the question
  before it starts, and it is yours to answer in every mode.
- **Il modello può leggere la guida di TALOS CLI e guardare un'immagine** che gli indichi. La carta della ricerca ti lascia cambiare la
  domanda prima di partire, e rispondi tu in ogni modalità.

### Changed
- **The engine is the one of TALOS Desktop 0.2.2.**
- **Il motore è quello di TALOS Desktop 0.2.2.**
- **A turn never waits for a summary**: over the limit it goes on with a quick summary while the model's own is written behind it. A
  local model with a single slot still waits.
- **Un giro non aspetta mai un riassunto**: oltre il limite prosegue con un riassunto rapido mentre quello del modello si scrive dietro.
  Un modello locale con un solo posto aspetta ancora.
- **Each permission mode has one name everywhere**, and «Full access» says yes without asking as Claude Code's bypass mode does, except
  for the cards above. A yes given by a rule, a mode or the automatic check says who gave it.
- **Ogni modalità dei permessi ha un solo nome dappertutto**, e «Full access» dice sì senza chiedere come la modalità di bypass di
  Claude Code, tranne per le carte qui sopra. Un sì dato da una regola, da una modalità o dal controllo automatico dice chi l'ha dato.
- **A shell that asked for the network also reaches this computer's own local servers**; without the network both stay closed.
- **Una shell che ha chiesto la rete raggiunge anche i server locali di questo computer**; senza rete restano chiusi tutti e due.
- **When the model asks you to sign in to ChatGPT, TALOS gives you the command to run**, instead of a card the terminal cannot show.
- **Quando il modello ti chiede di accedere a ChatGPT, TALOS ti dà il comando da lanciare**, invece di una carta che il terminale non
  può mostrare.

### Fixed
- **The tool row hides the same secrets as the card.** Before, the row of a connector tool under its card printed `password`,
  `api_key` or a password inside an object in clear, also while the call was still arriving; now the row hides them as it is written and
  in the finished row. The tool still receives every argument whole.
- **La riga dello strumento nasconde gli stessi segreti della carta.** Prima la riga dello strumento di un connettore sotto la sua carta
  stampava in chiaro `password`, `api_key` o una password dentro un oggetto, anche mentre la chiamata arrivava; ora la riga li nasconde
  mentre si scrive e nella riga finita. Lo strumento riceve comunque ogni argomento intero.
- **While a call arrives, a value of a JSON argument that is not complete is never shown.** Before, the tool row showed the first part
  of a value still arriving, so most of a GitHub token, an access key or the password in a web address could be read in the row and in
  its title; now that value reads «…» until it is complete, then it is shown with its secrets hidden. Before, an invisible character
  inside a name such as `db_password` left its value readable on the row and on the card; now it is hidden.
- **Mentre una chiamata arriva, un valore non ancora completo di un argomento JSON non si vede mai.** Prima la riga mostrava la prima
  parte di un valore che stava ancora arrivando, e si leggeva quasi tutto un token GitHub, una chiave d'accesso o la password dentro un
  indirizzo web; ora quel valore si legge «…» finché non è completo, poi si vede coi segreti nascosti. Prima un carattere invisibile
  dentro un nome come `db_password` lasciava leggibile il suo valore nella riga e sulla carta; ora è nascosto.
- **While a call arrives, the tool row keeps what it already shows**, instead of going blank each time the name of the next value
  arrives.
- **Mentre una chiamata arriva, la riga dello strumento tiene ciò che mostra già**, invece di svuotarsi ogni volta che arriva il nome del
  valore dopo.
- **TALOS stops the conversations still at work when it exits**, `/resume` and `/fork` list conversations and not delegated agents, a
  stopped sub-agent reads stopped and a lost tool reads interrupted.
- **TALOS ferma le conversazioni ancora al lavoro quando esce**, `/resume` e `/fork` elencano le conversazioni e non gli agenti
  delegati, un sotto-agente fermato si legge fermato e uno strumento perso si legge interrotto.
- **Compaction says what happened**: a `/compact` that freed nothing is an outcome, not a failure; four failures have their own words;
  the emergency line says the threshold that acted, live and after `--resume`.
- **La compattazione dice che cosa è successo**: un `/compact` che non ha liberato niente è un esito, non un errore; quattro errori
  hanno le loro parole; la riga d'emergenza dice la soglia che ha agito, dal vivo e dopo `--resume`.
- **`talos doctor`, providers, sessions and remote control do not stop on a folder's trust**, and the doctor and its diagnostic bundle
  read no settings of a folder you do not trust now. Notices and tool details no longer cut words in the middle, and a number of error
  codes now have words.
- **`talos doctor`, i fornitori, le sessioni e il controllo remoto non si fermano sulla fiducia di una cartella**, e il doctor e il suo
  pacchetto diagnostico non leggono impostazioni di una cartella di cui ora non ti fidi. Gli avvisi e i dettagli degli strumenti non
  tagliano più le parole a metà, e diversi codici d'errore ora hanno parole.

### Known limits (EN)
- **The tool row can show some argument values in clear when the arguments arrive as a list**, instead of as named fields, as in
  0.6.14. The card is not affected. A later release reads a list the same way as named fields.
- **An empty variable in front of a slash** — a deletion built from a variable that is empty or not set may not be recognised as a
  critical deletion. With «Full access» it runs without asking, as in 0.6.14. A later release asks for the card here. Until then, do not
  leave «Full access» on for commands built from variables you have not set yourself.
- **A less common bash quoting form** — when a command uses one of bash's less common quoting forms in an unusual way, the permission
  check can lose track of where the quotes end, and a critical deletion later in the same command is not recognised. With «Full access»
  it runs without asking, as in 0.6.14. A later release asks for the card whenever the check cannot read the quoting. Until then, do not
  leave «Full access» on for commands you have not read yourself.
- **Some commands with many wildcards can hold the permission check for a few seconds, as in 0.6.14.** TALOS can take a few seconds to
  decide whether to ask you, and the conversation waits meanwhile. Nothing runs before the decision. A later release makes this check
  fast in every case. Until then, prefer a short pattern or a list of names over one long pattern.
- **Deleting an important folder may not ask on macOS and on Android, as in 0.6.14**, when its name is written in an unusual form. In
  these cases the deletion can run without asking. A later release asks for the card in these cases. Until then, do not use «Full
  access» for deletion commands you did not write yourself.
- **On any system, some very long commands can hide a deletion from the check, as in 0.6.14.** In these cases the deletion can run
  without asking. A later release asks for the card in these cases. Until then, do not use «Full access» for deletion commands you did
  not write yourself.
- **Some secret names on the connector card, as in 0.6.14** — the card masks a field when its name ends with a secret word
  (`db_password`, `api_key`); a name where the secret word sits elsewhere, or a very short one such as `pass`, can be shown in clear on
  the card. The tool row hides more of them. The model and the tool still receive the real values. Until a later release, prefer
  connectors that read secrets from their own settings rather than receiving them as arguments.
- **A device served by this terminal reads the public model list as «not reachable» when the list is off**, instead of «off». No request
  leaves for openrouter.ai either way.
- **On first start, right after «Yes, trust this folder», the input box can appear for a few milliseconds without the two footer rows (permission mode and model).** They appear immediately after. Nothing is lost and nothing runs differently. A later release draws the first screen whole.
- **Two shortcuts pressed within a few milliseconds of each other can count as one, as in 0.6.14.** For example a quick double Ctrl+A may open the first panel only. Press the second shortcut again. A later release reads every key on its own.
- **Starting TALOS CLI takes about 50 milliseconds longer than in 0.6.14 (about 480 instead of 430 on our test PC).** Nothing else changes. A later release makes start faster.

### Limiti noti (IT)
- **La riga dello strumento può mostrare in chiaro alcuni valori degli argomenti quando gli argomenti arrivano come lista**, invece che
  come campi con un nome, come nella 0.6.14. La carta non cambia. Una versione successiva legge una lista come i campi con un nome.
- **Una variabile vuota davanti a una barra** — una cancellazione costruita con una variabile vuota o non impostata può non essere
  riconosciuta come cancellazione critica. Con «Full access» parte senza chiedere, come nella 0.6.14. Una versione successiva qui chiede
  la carta. Fino ad allora non lasciare «Full access» acceso per comandi costruiti con variabili che non hai impostato tu.
- **Una forma di virgolette di bash poco comune** — quando un comando usa in modo insolito una delle forme di virgolette meno comuni di
  bash, il controllo dei permessi può perdere il punto in cui le virgolette finiscono, e una cancellazione critica più avanti nello
  stesso comando non viene riconosciuta. Con «Full access» parte senza chiedere, come nella 0.6.14. Una versione successiva chiede la
  carta ogni volta che il controllo non sa leggere le virgolette. Fino ad allora non lasciare «Full access» acceso per comandi che non
  hai letto tu.
- **Alcuni comandi con molti caratteri jolly possono tenere fermo il controllo dei permessi per alcuni secondi, come nella 0.6.14.**
  TALOS può metterci alcuni secondi a decidere se chiederti il permesso, e intanto la conversazione aspetta. Prima della decisione non
  parte niente. Una versione successiva rende veloce questo controllo in ogni caso. Fino ad allora preferisci un modello corto o un
  elenco di nomi a un solo modello lungo.
- **La cancellazione di una cartella importante può non chiedere conferma su macOS e su Android, come nella 0.6.14**, quando il suo nome
  è scritto in una forma insolita. In questi casi la cancellazione può partire senza chiedere. Una versione successiva chiede la carta in
  questi casi. Fino ad allora non usare «Full access» per comandi di cancellazione che non hai scritto tu.
- **Su ogni sistema, alcuni comandi molto lunghi possono nascondere una cancellazione al controllo, come nella 0.6.14.** In questi casi
  la cancellazione può partire senza chiedere. Una versione successiva chiede la carta in questi casi. Fino ad allora non usare «Full
  access» per comandi di cancellazione che non hai scritto tu.
- **Alcuni nomi di segreto sulla carta dei connettori, come nella 0.6.14** — la carta oscura un campo quando il suo nome finisce con una
  parola di segreto (`db_password`, `api_key`); un nome in cui la parola del segreto sta altrove, o uno cortissimo come `pass`, può
  vedersi in chiaro sulla carta. La riga dello strumento ne nasconde di più. Il modello e lo strumento ricevono comunque i valori veri.
  Fino a una versione successiva preferisci i connettori che leggono i segreti dalle proprie impostazioni invece di riceverli come
  argomenti.
- **Un dispositivo servito da questo terminale legge l'elenco pubblico dei modelli come «non raggiungibile» quando l'elenco è spento**,
  invece che «spento». In nessuno dei due casi parte una richiesta verso openrouter.ai.
- **Al primo avvio, subito dopo «Yes, trust this folder», la casella può comparire per pochi millisecondi senza le due righe del piede (modo dei permessi e modello).** Arrivano subito dopo. Non si perde niente e niente funziona in modo diverso. Una versione successiva disegna il primo schermo intero.
- **Due scorciatoie premute a pochi millisecondi l'una dall'altra possono contare come una sola, come nella 0.6.14.** Per esempio un doppio Ctrl+A molto rapido può aprire solo il primo pannello. Premi di nuovo la seconda scorciatoia. Una versione successiva legge ogni tasto per conto suo.
- **L'avvio di TALOS CLI richiede circa 50 millisecondi in più rispetto alla 0.6.14 (circa 480 invece di 430 sul nostro PC di prova).** Nient'altro cambia. Una versione successiva rende l'avvio più veloce.

## talos-cli-v0.6.14 — 2026-10-25

### Added
- **Artifacts the model updates keep every version.** When the model changes an artifact it made earlier, the change is a new
  version of the same Library entry, kept in the project's Library folder (`.harness-ui-library`), never in your own files. The
  version is part of the turn's checkpoint, so `talos checkpoint undo` takes it back. `talos library versions <id>` lists the versions,
  oldest first. `talos library restore <id> <version>` brings an old one back as a NEW version, so the history is never
  rewritten. An id or a version that is not there says so, with the commands that show the right ones.

### Fixed
- **`talos remote` no longer reaches the model.** Before, it was sent as the prompt «remote», which cost a paid turn. It now
  says that remote control is not in TALOS CLI yet, and where to find it (TALOS Desktop), without starting anything.

- **A compaction at the emergency threshold says so.** When the conversation reached 90% of the window (1.2 times the threshold
  when the window is unknown), the line said «at 75% of the window», which is the normal rule. It now says what started it, live
  and after `--resume`, and protocol v2 `context.compacted` carries `emergency`.
- **The read row is right in more cases.** An extracted document whose text starts indented no longer counts the coverage
  warning as lines of the file. In a terminal narrower than about 34 columns, the count moves to the detail line so the row
  stays on one line.

### Changed
- **The engine is TALOS Desktop's current one**, with its device folders, remote control and sending a file to a device. The CLI
  does not offer these to the model, because they need a paired device, which the CLI does not handle yet. If a saved
  conversation mentions them, they are shown by name.

## talos-cli-v0.6.13 — 2026-10-25

### Changed
- **A conversation is compacted the way TALOS Desktop compacts it.** The CLI now runs the Desktop's own kernel module for each
  turn instead of the bare kernel. Without the Context Engine (an unknown window, a window under 64,000 tokens, a local model) a long
  conversation was summarized every 8 rounds, the summary kept only the first two messages (often not the task), the
  summarizer was offered the tools, and every tool result was cut to 8,000 characters. Now:
  - the system messages at the start, your first request, the last three requests and the last two exchanges are kept word for
    word, and everything between them is summarized; a first request longer than 8,000 characters keeps its first 6,000 and last
    2,000, with a note of what was left out; a request with an image counts as a request;
  - it starts at 0.75 of the model's window, or at `context.compactAtTokens` when that is lower (200,000 by default);
  - the summarizer gets no tools;
  - a summary is asked only when it can make the conversation smaller. When what is kept word for word already fills the space
    (a long paste in your latest requests, with little before it), only the long tool results among them are shortened, if there
    are any, and no summary is paid for nothing; a summary that comes back longer than what it replaces is not used;
  - after three failed summaries in the same turn a mechanical one is used;
  - tool results are no longer cut at 8,000 characters: they reach the model whole, and are shortened only when the
    conversation would not fit, with a note of how many characters were left out.
  With the Context Engine, a failed preparation falls back to that compaction instead of failing the turn, and the screen says
  so in one line with its code.
- **The window of the model is known to the compaction.** The CLI's own model profile (your `models` setting, a local Ollama's
  window, the provider's list, models.dev) now gives the compaction its window and output limit. With an unknown window the
  conversation is compacted at 200,000 tokens.
- **Summaries are written by the provider's cheapest model.** A compaction's summary goes to the light model of the same
  provider (DeepSeek Pro's to DeepSeek Flash), measured on the smaller of the two windows. When the light model's window is
  unknown, or too small for the summary, the conversation's model writes it. The conversation keeps the model you chose.
- **The summary prepared after a long turn is used again** on the screen, when the conversation does not use the Context Engine.
  0.6.12 stopped asking for it because nothing read it; the new module starts the next turn from it. Leaving TALOS right after
  such a turn waits up to 5 seconds for the summary, and says so. With the Context Engine it is not asked: the engine summarizes
  by itself. `talos -p` and the other commands without a screen never ask for it, so they end as soon as the answer is out. A
  summary already written when your next message goes out is used by that turn. One still being written is waited for only when
  the conversation is already past its emergency limit, and only while it still covers this history; Stop ends the wait. If it
  arrives but is not enough, it is kept and only the rest is summarized on top of it, so the history is never summarized twice.
- **`/compact` without the Context Engine compacts the way the automatic compaction does**: on the light model, from what the
  model really sees, keeping what the automatic one keeps, and replacing the previous summary. Before, it kept only the first two
  messages and wrote on the conversation's model. Every summary now carries a fingerprint of the history it covers, and is
  never applied to another history.
- **A summary the turn waits for has a ceiling:** 10 minutes, or 5 minutes with nothing coming from the model; one that was
  already being written when the turn needed it is waited for 10 minutes at most. Past it TALOS
  stops waiting, compacts without the model (`CTX_COMPACTION_TIMEOUT` with the Context Engine) and the turn goes on.
- **The reasoning of past rounds is removed, no longer cut to 300 characters**, when the Context Engine clears old tool results,
  for every provider: a past reasoning cut short and ending in «…» is a changed reasoning, which Z.AI and Qwen answer worse to,
  while a missing one is accepted as it is. Reasoning of 300 characters or less stays as it is. Signed reasoning blocks were
  never touched and still are not.
- **Providers** (the Desktop's current engine): Z.AI and Qwen keep their past reasoning (`clear_thinking:false`,
  `preserve_thinking` on qwen3.8-flash); Vertex AI's thinking off, by model; DeepSeek's own request shape; the cache marker sent
  only to providers that accept it; together, deepinfra and novita; OpenRouter's `session_id` from the conversation; MiniMax
  M3.1 Flash's effort on its Anthropic address; Gemini without a limit asks for 65,535 output tokens.
- **A compaction that did not happen is said.** When the Context Engine fails and the simple compaction takes over, when the
  history had to be realigned, or when a summary failed, was cut short or came back empty, the conversation shows one warning with
  its reason and code (`COMPACTION_FALLBACK`, `COMPACTION_HISTORY_REALIGNED`, `COMPACTION_FAILED`). Before, all of these were
  silent. A model whose window is too small for TALOS's tools and the part a summary always keeps is said once for that window,
  with both numbers and `COMPACTION_WINDOW_TOO_SMALL`, and no summary is paid for it. The same warnings are in `talos -p` output:
  in `json` and `stream-json` (v1 and v2) as a `warning` event, in text on stderr.
- **A message too large for the model is neither summarized nor paid for.** When your newest message alone does not fit the
  model's window together with the system and the tools, the turn stops before anything is paid: before anything reaches the
  provider when TALOS knows the window, otherwise at the provider's refusal (after a free shortening, when one could help), whose
  window TALOS then remembers for that model while it stays open (so the next request is judged before it is sent, and the
  attachment goes at once; a new `talos -p`, even with `--resume`, meets one more refusal). The message goes back into the
  composer (unless you have already started typing a new one) and a small dialog says how big it is, the model's window and,
  when one is kept, the room for the answer, with one action, «Send as attachment»: the same text goes again, and the model gets its start
  and its end and reads the rest from a file saved with the conversation. «Edit the message» or Esc closes the dialog and leaves the text to
  shorten. When not even the attachment would fit, or the message has images, the dialog offers only «Edit the message» and
  says why. In the conversation the message stays, marked «Not sent», also after a restart. In `talos -p` the run ends with
  `REQUEST_TOO_LARGE` (exit 70) and its numbers: in text on stderr, and in `json` and `stream-json` (v1 and v2) as
  `requestTooLarge` (in v1 `json`, under `error.details`); protocol v2 also has the durable event `request.not_sent`.
  `--attach-if-too-large` sends such a message as an attachment instead, on a new turn, with `--resume` and when it waits in
  the queue; when the attachment cannot fit either, the error says to shorten the message or choose a larger model.
- **Paused automatic summaries are said once.** When the automatic summaries stop because the last ones did not make the
  conversation shorter, or because it filled up again right after each one, one warning says which and that `/compact`
  forces one (`COMPACTION_PAUSED`; in `talos -p` text on stderr). It is said again only when the summaries pause anew.
  Older long messages shortened for the model, with their full text saved, are not announced; older tool results shortened
  or older images replaced with a placeholder, without a summary, are said as that («Shortened older tool results for the
  model, nothing summarized», «Replaced 2 older images with a placeholder…»), not as a summary.
- **When the provider says the conversation does not fit, it is shortened toward what fits.** The free shortenings come first,
  then at most one paid summary, then a summary TALOS writes itself without a model; at most three retries, and never the same
  request twice. A summary is paid for only when it can remove at least a tenth of the compaction threshold, measured on the
  real summaries of this conversation (and, for how TALOS's count compares with the provider's, of this model). A compaction
  the refusal started is said as that, not by the automatic rule; a summary written without a model is said as that, with its
  reason («Shortened older messages without a model summary (the provider said the conversation did not fit)»), never as a
  model's. If the turn then fails, that shortening is undone and its line leaves the screen, so the next turn starts from the
  whole conversation and nothing says it was shortened. After `--resume`, and after a `/resume` of the conversation already
  open on the screen, each of these lines comes back once with the same words and numbers it had live (protocol v2 reads it
  from the saved conversation as a durable `context.compacted`, and its undoing as `context.compaction.undone`).
  When it still does not fit, the error says whether it was shortened first and the provider's own count when it gave one
  («The conversation is too long for this model even after shortening it (the provider counted 9,000 tokens; its maximum is
  8,192)»); `talos -p` in `json` and `stream-json` (v1 and v2) carries it as `contextFull`. On the screen such an error was
  said as «The model provider did not accept the request», and a provider's empty balance on HTTP 429 as a rate limit: the
  screen now keeps the provider's class of the failure (protocol v2 `providerClass`).
  Text in Chinese, Japanese and Korean is now counted the way the providers count it, so such a conversation is compacted in time.
- **`/compact` says why it did not compact.** «Context is already compact.» is said only when there is nothing to summarize.
  Otherwise the answer says what happened, with its code, and that nothing was replaced: a summary would save little because the
  older part is too small (`COMPACTION_LITTLE_GAIN`); what is kept word for word (your first request, your latest requests and the
  latest exchanges) already fills the space (`COMPACTION_AT_MINIMUM`); the summary was written but would have made the
  conversation longer, so it was not used (`COMPACTION_INEFFECTIVE`); or the summary failed, was cut off or came back empty.
  When the model's window is too small even for TALOS's tools and the part a summary always keeps, `/compact` says so after its
  answer, with both numbers, and points to `/model`.
- **A turn quiet for 45 seconds is noted in the development log** (`talos logs`), never printed on stderr in `talos -p`.
- **A shell result tells the model that stdout and stderr are mixed.** What the model reads of a command now starts with
  `[shell output: stdout and stderr combined in arrival order; stream identity is not preserved]`, before the `exit N` line, and
  so does the `content` of a shell tool's result in `talos -p --output-format json` and `stream-json` (v1 and v2); the exit code
  is still its own field. The screen does not show that line.

### Fixed
- **A full context window on Anthropic, OpenAI Responses or Gemini direct now compacts and tries again**, like every other
  provider. It came back as «response incomplete, try again», and in streaming it was sent again up to 10 times. A response cut
  by the output limit on those providers is now continued, as on the others.
- **`/compact` no longer says «Context is already compact» when it failed.** «Already compact» now means only that there was
  nothing to compact. A summary that failed, was cut short, came back empty, answered with a tool call or was refused, or a
  Context Engine summary that failed, says what went wrong, with its code, and that nothing was replaced.
- **A conversation with the characters U+2028 or U+2029 in it no longer reads as damaged after a restart.** The saved journal
  was read line by line with Node's `readline`, which takes them for line ends.
- **`/compact` while a tool call has no result yet** says so («A tool call in this conversation has no result yet…»), instead
  of «An extension failed».
- **A read row says how much of the file the model got.** Now that a read reaches the model whole, its row counted only the
  last 8 KB the screen keeps: a page of 2,000 of a file's 3,000 lines showed as «304 lines». It now says «2,000 of 3,000
  lines», and a whole long read counts all its lines.
- **The engine is TALOS Desktop's current one.**

## talos-cli-v0.6.12 — 2026-10-21

### Changed
- **Gemini connected directly gets the full list of tools again.** With the lighter list of 0.6.11, TALOS Desktop measured
  slightly fewer code tasks solved on Gemini direct (27 of 30 instead of 29), so for the `gemini` provider and `gemini:` models
  the tools used only on request are sent in full again. Every other provider keeps the lighter list, OpenRouter's Google models
  included; `TALOS_ATTREZZI_DIFFERITI=0` still sends the full list to all.
- **The trust of a hook or MCP server now also covers the scripts it loads through a link.** In 0.6.11 a script the command
  named through a junction or link pointing outside the project was pinned, but one it only imported through such a link was
  not. Now it is pinned by the name written in the project, and its own imports are followed too: a JavaScript file's from
  where the file really is, as Node resolves them, a Python file's from its written name. A file Node really runs outside the
  project, reached that way, is pinned by its real path (its own imports are not followed): one with an extension Node adds by
  itself (`.js`, `.cjs`, `.mjs`, `.json`, `.node`), or any file the import names in full, such as `import "../shared.ts"`.
  Two links that point at each other are followed once and no longer lengthen the list. On a project whose hooks or MCP servers import through such a link, the
  trust is asked once more, with the usual sentence.
- **Python imports are read as Python runs them**, inside the project too: `import a.b.c` covers `a/__init__.py` and
  `a/b/__init__.py`, `from . import x` and `from .. import x` count their dots as folder levels, and through a link
  `from pkg import a, b` covers `pkg/a.py` and `pkg/b.py` as well as `pkg/__init__.py`. The trust of a Python hook or MCP server
  may be asked once more if its scripts import several modules on one line (`import os, helper`), import a dotted name from a
  package with an `__init__.py` (`import a.b`, `from a.b import x`), or use relative imports (`from . import x`,
  `from .. import x`).
- **A trust check has a ceiling on the paths it resolves** (100,000 per check), like the ceiling of 2,000 scripts it already had:
  past it the rest is marked as not checked in the trust record, as past the other two ceilings. The trust question does not
  show that mark yet.
- **The engine is TALOS Desktop's current one.**

### Fixed
- **No more paid summary that nothing used.** After a turn with a long history (past 200,000 tokens) the CLI asked the model, in
  the background, for a summary of the conversation that it then never used; 0.6.11 paid for it too. It is no longer asked.
  `/compact` and the automatic compaction work as before.

## talos-cli-v0.6.11 — 2026-10-21

### Changed
- **The theme's background fills the whole window.** Around the screen TALOS draws, the terminal kept its own background: Windows
  Terminal's padding, the scrollbar gutter and, on Windows, the last row showed as a black border. While the screen is up TALOS
  now sets the terminal's default background to the theme's (OSC 11) and gives it back when it leaves (OSC 111), also on an error.
  Not inside tmux or GNU screen, not with the `mono` theme, and never with `TALOS_TUI_TERMINAL_BACKGROUND=0`. On Windows only
  inside Windows Terminal: the console Windows uses for other terminals (VS Code's, for example) drops the sequence that gives
  the background back, so there it stays off unless `TALOS_TUI_TERMINAL_BACKGROUND=1`. The same rule holds inside WSL. On
  Windows, a terminal that names itself (VS Code opened from a Windows Terminal tab, for example) does not count as Windows
  Terminal; inside WSL that terminal cannot be told apart, so there use `TALOS_TUI_TERMINAL_BACKGROUND=0` if the colour stays.
- **The model starts with a lighter list of tools.** The tools used only on request (notes, tasks, library, research,
  automations, provider exclusions and the like) are no longer sent in full with every request: the model finds and loads them
  when it needs them (`tool_search`, `tool_describe`, `tool_call`), and permissions, Plan mode and approvals apply to the real
  tool as before. The first request of a short task drops from 51 tools and about 54,000 characters to 23 tools and about
  29,000. A task that needs one of those tools can take a step or two more. `TALOS_ATTREZZI_DIFFERITI=0` sends the full list
  again. With Gemini connected directly (`gemini:` models) TALOS Desktop measured slightly fewer code tasks solved with the
  lighter list (27 of 30 instead of 29); the next version sends Gemini the full list, and until then
  `TALOS_ATTREZZI_DIFFERITI=0` does it.
- **The model is told where it is working.** The engine now gives the model the project folder's full path and the real
  platform (Windows, Linux, macOS); the old platform line is gone. When the model reads or lists `/<folder>/x` or
  `<folder>/x` and nothing by that first name exists, it gets `x` inside the project, before every permission check, and the
  tool result says so. Writes and edits keep the path exactly as written (only `~` is expanded), so a project laid out as
  `myproj/myproj/...` can still be created.
- **One rule, shared with TALOS Desktop, for the project scripts a trust covers.** A hook or MCP server is trusted together with
  the project scripts it runs; the CLI and the desktop app now read those scripts with the same code, and a repeated check reads
  an unchanged file only once (about 0.1 s instead of 1 s on a large project). Nothing changes for a trust you already gave,
  except one rare case: a script the command names through a junction or link that points outside the project is now pinned
  too, so that trust is asked once more. A script it only imports through such a link is still not covered, as in 0.6.10.
- **The engine is TALOS Desktop's current one.** A refused delegation now says only its reason, in plain English. Three new
  errors are worded with what to do next: a model the provider no longer serves, a hooks file TALOS cannot read, an MCP server
  script TALOS cannot read. The phone's local engine («On this device») is not offered by the CLI, and neither are the
  desktop's tools for undoing file changes and pairing phones.

### Privacy
- The project folder's full path now reaches the model's provider, a cloud provider too. On most computers that path contains
  the name of your user account (for example `C:\Users\<name>\...`).

## talos-cli-v0.6.10 — 2026-10-17

### Fixed
- **A long ChatGPT chat no longer breaks after the project changes.** When the project changed between two messages (a file
  written, a new folder, an edited `AGENTS.md`), TALOS adds a project update to the request; in a long chat that update was
  marked for caching in a form the ChatGPT plan and the OpenAI Responses API refuse (HTTP 400 «Invalid value: 'text'»), so that
  message and every later one of the chat failed at once with «The request to the ChatGPT plan did not complete». The same
  malformed request went to Anthropic, the Z.AI and MiniMax Anthropic-compatible endpoints and Gemini. The update is now sent as
  plain text to every provider TALOS talks to natively, Anthropic-style providers get the cache marker where their API reads
  it, and a chat that already broke works again.
- **A command that ends with a line break is no longer refused.** A command with a trailing or leading line break, a blank
  line, a break after `&&` or `|`, or a final `;` was refused as «unsupported shell composition», even in Full access. A line
  with nothing on it is now just skipped; a command left incomplete (`git status &&`) is still refused.
- The ChatGPT plan error no longer says «The ChatGPT sign-in failed» when the sign-in is fine and a request did not complete;
  it says so, and points at `talos logs`.

## talos-cli-v0.6.9 — 2026-10-17

### Fixed
- `talos mcp trust`, `talos mcp test`, `talos hook trust` and `talos hook dry-run` no longer fail with `MCP_TRUST_INVALIDATED`
  / `HOOK_TRUST_INVALIDATED` for a server or hook that runs a script of the project: they pin the same content as the project
  trust, the project scripts included. A script changed after the review is refused by `mcp test`, `hook dry-run` and the
  session until it is trusted again.
- `talos mcp test` works again: in 0.6.8 it failed for every server («Cannot read properties of undefined»), because the
  start-up line of the MCP client's bundled code read a name that the code itself redefined.

### Added
- When a trusted MCP server does not start, TALOS says so on the screen and in `-p` (on stderr in text, as a `warning` event
  with code `MCP_START_FAILED` and its `serverId` in `--json`, `stream-json` and `--protocol v2`): «MCP server "x" did not
  start: <reason>. Its tools are not available in this turn. Check it with: talos mcp test x». It is said on every run of a
  session where the server is down. Before, it was silent and the model only met an unknown tool.

## talos-cli-v0.6.8 — 2026-10-17

### Added
- In `--protocol v2`, `agent.changed` and a delegation result carry the agent's `name` (null for agents started before this
  version).

### Changed
- **A sub-agent is called by its name everywhere**: in the agents panel and page, the footer, the line that says which agent
  asks for a permission, and the «Agent finished» row and notification. Its name is its task's short name, and two sub-agents with the same task are told apart: «Write the
  tests» and «Write the tests-2». In the same TALOS, a conversation that starts with the name of another one gets «-2» too.
- **A long turn no longer stops to be summarised.** When a conversation grows past the point where TALOS starts summarising it,
  the summary is prepared in the background while the request goes out whole. A request that still fits the model's window is
  not held back for a summary already on its way. If the provider then says the context is full, TALOS waits for that summary
  and sends the request again, once.

- **With nobody in front** (`talos -p`, a command), TALOS tells the engine so on every turn instead of once for the whole
  process: what would wait for a person (a plan, a question, an MCP server's form, a file to adopt) is refused at once with the
  reason, and a conversation started with `talos -p` and resumed on the screen gets its plan card and questions back. The same
  holds for a conversation forked with nobody in front.
- **In Full access TALOS reads and writes a project's secret files without asking**, as it does for every other file. What
  still asks in Full access: reading a login credential of this computer (the SSH keys, `~/.npmrc`, `~/.aws` and the like), opening a
  network path (`\\server\share`), and the actions only a person may take; with nobody in front they are refused. A login
  credential is recognised however it is written (`%USERPROFILE%`, `$env:USERPROFILE`, any other variable, a short name, a link)
  and under another name too (a hard link), in a command as in a read, in every mode. A login credential of this computer is
  never written, in any mode. In the other permission modes a project secret still asks first.

### Security
- **A program planted in a project folder no longer runs in place of the real one.** On Windows a program called by its bare
  name (`git`, `node`) was looked for in the project folder first: a `git.exe` inside a cloned project ran on your computer as
  soon as you opened TALOS there, even in a folder you never trusted, and a `node.cmd` ran in place of Node inside the sandbox.
  TALOS now turns that search off for itself and for every command it runs; `.\program` still runs a program of the folder.
- **`talos -p --protocol v2` no longer approves reading a secret file on its own.** Asked to read a file such as `.env` or a
  private key, it answered «yes» by itself in every permission mode, and the content reached the provider; the other output
  formats refused it. Now every format decides it by the same rules: refused when nobody is there to answer, except a project's
  secret in Full access. A permission request in `--protocol v2` names a secret's class as `secret`.
- **A trusted project's hooks and MCP servers are pinned with their scripts.** Trusting a project remembered a hook's or a
  server's command line, not the project script it runs: editing that script afterwards (outside `.talos/`) ran the new code in
  the next session without asking. Now the trust covers what really runs: a hook's command is read the way the engine reads it,
  a name finds its file the way Node and Python do (`node srv`, `node .`, `python -m pkg`, `npm run start` with its pre and post
  scripts, `npm start`'s `server.js`), a script in a folder of its own pins that whole folder, and the files a pinned script imports
  are followed in turn, folders and packages included. A changed file asks for the trust again. A project always opens:
  installed libraries (`node_modules`, a Python virtual environment) are not checked, a link is remembered by where it points,
  a folder given to a server as data is not read, past 10,000 files a script folder is checked only in part, and past 2,000
  scripts the chain of imports is not followed further. A project
  trusted before whose hooks or servers run a project script asks once after the update, and says so: «TALOS now also checks
  the scripts».
- **`talos -p` answers a sub-agent's permission requests.** Only the main conversation's requests were answered: a sub-agent
  that asked to read `.env` held the run until it timed out. Each sub-agent's request is now decided by the same rules, so a
  secret is refused with nobody in front and a plain read inside the project is allowed.

### Fixed
- `talos -p` no longer stays open after its answer while a summary prepared in the background finishes: the summary is
  cancelled when TALOS leaves.
- A token-count endpoint that never answers no longer costs 10 seconds on every request: after the first time it is skipped for
  ten minutes, and TALOS estimates at once.

## talos-cli-v0.6.7 — 2026-10-16

### Changed
- **Stop ends a command's whole process tree on Linux and macOS.** Outside Windows each command TALOS runs starts in its own
  process group, so Stop, a time limit and leaving TALOS end the command and everything it started. A side effect: a command
  started by TALOS has no terminal of its own, so it can no longer ask for a password on your terminal (`git`, `ssh`, `sudo`);
  give it the password another way (a credential helper, an SSH agent, `sudo -n` or a sudoers rule).
- The short title of a conversation is at most 80 characters with «…», and ends on a whole word when one ends late enough.

### Fixed
- With a model whose window is known (set by you with `talos config set models.<id>.contextWindow`, or known to TALOS), an
  OpenAI-compatible server or proxy that does not count tokens could fail every turn: TALOS asks it to count the request first,
  and a «yes» without a count ended the turn. A count that cannot be read, a busy or failing counter, the network, or a counter
  slower than 10 seconds now give an estimate, never a failed turn.
- With OpenAI set to an address of your choice (an OpenAI-compatible server), its models whose names do not start with `gpt-`
  were left out: `/model` did not list them and a sub-agent asked to run on one was refused. Every model the server lists is now
  kept, except the ones that cannot hold a conversation (speech, embeddings, images, transcription, realtime). OpenAI's own
  address keeps its list as before.
- With `TALOS_MAX_RETRIES=0`, a provider's «too many requests» no longer says «TALOS retried»: it says that it did not retry.
- On the ChatGPT plan, a refusal the plan sends at the start of an answer is read at once, instead of being taken for a server
  error and sent again ten times.
- `talos -p --resume <id> --model <model>`: when another TALOS changed the conversation's model a moment before, the model you
  asked for is the one used.
- Automations: on Linux and macOS a Ctrl+C on `talos automation run` or `serve` stops gracefully again (with the new process
  groups the first Ctrl+C ended TALOS at once); when TALOS leaves on Ctrl+C it stops the sub-agents of its runs too, not only the runs; a Ctrl+C that has nothing
  left to stop says so; a run that could not start says why in words, never with a raw message from the disk; the error
  messages of `talos automation` say what happened and what to do; the task board no longer marks every linked automation as
  missing when its store cannot be loaded.
- Plan mode with nobody in front (`talos -p --permission-mode plan`) tells the model to write the plan in its answer, and a plan
  it tries to present anyway is refused with that sentence.

## talos-cli-v0.6.6 — 2026-10-15

### Changed
- **The start screen shows the TALOS medal.** The mark becomes a two-layer hexagonal medal — a bevelled rim lit from the top
  left, milled ticks, a raised inner layer with six rivets, fine guilloché rings and the mark in relief — drawn with the
  terminal's own cells: the background of each cell is the metal, the dots are the details. It is bigger on a wide terminal
  and smaller on a narrow or short one, and the block letters of «TALOS» now stay down to 48 columns. Same stages, same 5.2
  seconds, any key skips it. Where TALOS does not paint the background, only the gold dots are drawn.
- **The ChatGPT plan's usage limit is told plainly.** While TALOS waits for the limit to come back, the line under the
  conversation says so, with the time it tries again and that `/model` goes on now with another model. If the limit ends the
  turn, the message stands out (it was a grey line that read like any error) and says when the limit comes back, when
  ChatGPT says it.

- **Automations work again, and say what to do in plain words.** `talos automation add "check the build and tell me what
  broke" --when "weekdays 09:00"` makes one in this project; `--when` takes a short phrase: "every 30m", "every 2h", "hourly",
  "daily 09:00", "weekdays 09:00", "weekly mon 09:00", "once 2026-10-20 09:00", a cron line or "manual". It runs while
  `talos automation serve` is running (`talos automation install-runner --yes` starts it when you sign in to Windows), or now
  with `talos automation run <id>`, which waits for the end and prints the report. `list`, `show`, `history`, `edit`,
  `enable`, `disable` and `delete` do the rest. Nobody watches a run: it uses the mode you chose (`--mode`, by default it may
  edit files in its folder), and anything that would ask you is refused and the model is told, so a run never waits for
  you. It works only in a folder you have trusted. Automations made by 0.6.5 and before never ran (every run failed with
  «task list unavailable»): they are listed as «old format» and can be deleted and made again. `schedule` and `dry-run` are
  gone: `edit --when` and `show` replace them. In the conversation, `/automations` shows them; making and changing them from
  the screen comes later. One TALOS process runs a profile's automations at a time: while `serve` runs, `talos automation
  run <id>` hands the run to it and waits for the end; a second `serve` waits to take over; `serve --once` says another
  process is running them; a `run` that finds nobody running them runs the ones that come due meanwhile too, and on Ctrl+C
  stops what it runs before it leaves. A laptop that slept does not make a waiting process take over a live one. `history`,
  `show` and `/automations` say every run in words (done, failed, skipped, and why). A run whose model
  hands work to sub-agents waits for them before the process leaves, and their requests are answered in the run's mode too.
- **The model is told what its mode really does when nobody is in front.** In `talos -p`, in a one-shot command and in an
  automation, what would ask you is refused, and the model now reads that, instead of «being asked is not a refusal».

### Fixed
- A checkpoint no longer lists, and `/undo` no longer removes, the logs TALOS keeps for commands running in the background
  (`.talos/processi-sfondo`): they are TALOS's own, not your work.
- A second `talos provider login chatgpt` in another terminal now closes the sign-in already waiting in the first one, which
  says so; before, the two waited side by side.
- `talos automation install-runner` prints a real line and gives Task Scheduler the Windows account with one backslash.
- On the ChatGPT plan the prompt cache now holds from one message to the next: a resumed conversation reads most of its prompt
  from the cache (measured: 10,752 of about 11,300 tokens) instead of paying all of it again from the plan's limit. Two causes
  were cured: a resume with `--model` equal to the conversation's model rewrote it and rebuilt the start of the conversation,
  and a «project context update» (a file changed in the folder) was moved to the start instead of staying at the end.
- `talos -p --permission-mode plan` no longer waits until the time limit when the model presents its plan: with nobody to
  approve it, the model writes the plan in its answer. A question the model asks in `talos -p` is answered at once with
  «nobody can answer», instead of waiting for nobody.
- The engine's goals (a goal the model sets and a judge checks after every turn) are not part of the CLI yet: the model is not
  offered them, and one it tries anyway is refused, so nothing keeps calling the model after the turn ends.

## talos-cli-v0.6.5 — 2026-10-14

### Changed
- **A file you ask TALOS to follow is your request.** «Read SETUP.md and do what it says» works again with the models we
  tried: the instructions in a file you name in your own message, and ask TALOS to follow, count as yours — with the
  permissions and the mode you already have (never more access, never out of plan mode), also in a conversation begun with
  0.6.4. Everything else that comes from outside — a file that file names, command output, web pages, MCP servers, a
  sub-agent's result — is still data, never orders, and TALOS tells you when it asks for something. TALOS checks that the file
  read is the one you wrote in your message (the whole name or path, also in «quotes» or **bold**); a file named only inside
  an @-attached file, or in a message that waited in the queue while TALOS was working, does not count (send it when TALOS
  has finished). Sub-agents, workflow steps, the turn a fork starts with, and a turn started by a sub-agent's message do not
  get this exception: their task is not a message you just wrote. (0.6.4 refused such a file with some models, ChatGPT among
  them.)
- **A new start screen.** The animation that plays on the first launch and after an update is drawn from the real TALOS
  mark, built up the way the desktop app builds it, in continuous gold, with a smoother reveal; it lasts 5.2 seconds
  (7.2 before) and any key still skips it. Without Unicode it is drawn in plain ASCII.

### Fixed
- The start screen no longer jumps up and down while it plays, and on a short terminal (80×24) its last lines — the status
  line and «Press any key to skip» — are no longer cut off.

## talos-cli-v0.6.4 — 2026-10-14

### Added
- **Commands can go on in the background, and their end wakes the conversation.** A command the model starts with
  `background`, or one that outlives its time (the model's `timeout`, 2 minutes by default, at most 10), is no longer killed:
  it keeps running, the turn goes on, and its output goes to a file. When it ends, a conversation that is waiting wakes by
  itself and the model is told how it ended — unless you stopped it yourself. Inside the Windows sandbox the output reaches
  the file when the command ends (the sandbox does not hand it over piece by piece), and the model is told so. A command in
  the background lives at most 12 hours and may write at most 8 MB; its Stop ends it at any time. A command ended early keeps
  in its file what it wrote until then, with the reason.
- **/context shows what the last request was made of**: the instructions, the tools, MCP tools, memory (the project's rules
  included) and the conversation, as an estimate, next to the space still free.
- **Z.AI asks where your key goes.** The GLM Coding Plan and the pay-as-you-go balance (international or China) are billed
  apart, so TALOS asks which one when you add the key — in `/provider`, in `/setup` and in `talos provider set-key zai`
  (`--address plan|balance|plan-china|balance-china` answers in advance) — and sends the key only there. Change it with
  `talos provider configure zai --address …`. The provider list says which address is in use. If you already use Z.AI
  without having chosen one, nothing is sent to Z.AI until you choose — messages, summaries and checks alike: TALOS says how.
- `talos <command> <operation> --help` shows that operation's own help (for example `talos provider set-key --help`).
- `context.compactAtTokens`: the most a conversation may grow before it is summarised (see Changed).
- In `--protocol v2`, a background command's end and a workflow's result have their own queue origins (`background`,
  `workflow`) instead of `dialogue`.

### Changed
- **A question nobody answers in time no longer stops the turn.** The model is told nobody answered and goes on with its
  own judgment, saying what it assumed.
- **Very large context windows are summarised at 200,000 tokens at the latest** (instead of at half the window: for a
  1-million-token model that was past 400,000, slow and costly). `talos config set context.compactAtTokens <tokens>` changes
  it; `null` turns the cap off.
- **The Context Engine's summaries run on the provider's light model** (Anthropic: Haiku; OpenAI: gpt-5-nano; Z.AI:
  glm-4.7-flash…), never on another provider; a provider without one keeps the conversation's model, and so does the
  summary made without the Context Engine.
- **Two TALOS on the same conversation:** the second one is told the conversation is open in another TALOS (which, its
  process, since when) and nothing is sent; `-p` exits with code 15. A TALOS that closed or died frees it at once (if its
  process number was already reused by another program, within 30 seconds).

### Fixed
- A message typed just as a turn ended could stay in the queue for ever (and one queued while the next turn was starting
  could be lost).
- On Windows, a checkpoint could stay open — losing that command's undo — when something read it at the same moment.
- After «Remove it» on the `/provider` sheet the keyboard went to a window nothing drew, and Ctrl+C Ctrl+C did not close
  TALOS.
- Closing TALOS after its engine failed to restart now still waits for a ChatGPT sign-in renewal on its way; the notice at
  exit no longer crashes TALOS when the terminal is already gone.
- **A key withdrawn in another terminal is no longer used here.** Removing a key, or declining an environment key, in another
  TALOS used to leave an open screen still sending it; now the next message here does not, and the status row says so within a
  few seconds, with no request to the provider. The same holds for the Z.AI address: chosen or changed in another terminal, it
  is the one this TALOS uses from its next request; and a key you replace or add here is the one in use, even with another TALOS
  open.
- A TALOS closed just as an answer began could forget that turn: the next TALOS did not say «The last TALOS closed in the
  middle of …» nor how to pick it up.
- `talos doctor` no longer calls Z.AI ready while no address is chosen.
- Ctrl+C Ctrl+C with a command still running in the background now closes TALOS at once: the command is stopped and named.
- /context's «compacts by itself at N%» is now a share of the window it shows (it was a share of the input limit, so it read
  higher than the point where TALOS really summarises).
- `talos provider env-key <provider>` with nothing set names the variable to set (`--json`: `variables`).

## talos-cli-v0.6.3 — 2026-10-13

### Changed
- **The engine is aligned to the desktop's again.** A model that sends the very same call again is counted only when the
  copies come one after the other (a good answer in between starts the count over); a question whose short title is longer
  than 12 characters is asked with the title shortened instead of being refused; when two TALOS renew the ChatGPT sign-in at
  the same moment, the one that arrives second uses the session the first one stored instead of removing it. When a
  conversation's stored context has to be set aside and rebuilt, only the newest set-aside copy is kept (it is checked whole
  first); older copies of the same conversation are removed.

### Fixed
- **Closing while the ChatGPT sign-in is being renewed is no longer silent.** TALOS waits for that renewal before it ends
  (at most 15 seconds, so the sign-in is not lost; the same for a sign-in or sign-out on its way); after a second it now
  says so, instead of leaving the terminal still.
- When TALOS restarts its engine inside a session, a renewal on its way holds the restart two seconds, not fifteen.

## talos-cli-v0.6.2 — 2026-10-13

### Added
- **The status row says whether the provider was checked.** Next to the model: «<provider>: verified» when the provider
  answered and accepted your key (or is a local engine that needs none), «checking…» while the one check is under way,
  «not verified» otherwise: no key, the provider did not answer, or it answered without looking at the key. A «verified»
  is kept for an hour — on a screen left open it is checked again when the hour ends — and is never shown for a provider
  this terminal has no key for (or nobody signed in to), whatever an earlier check said; a «not verified» is checked again
  at the next start. A key set or removed in this screen, or a
  sign-in or sign-out, is followed at once; one changed from another terminal is seen at the next start, or at the next
  such change here. Under 100 columns the row shows the provider only when it is «not verified». The check asks the
  provider for nothing a model writes, so it costs no credit. The row was meant to be there since 0.5.0 and never
  appeared on the screen.
  - DeepInfra, Novita, Ollama Cloud and Hugging Face list their models to anyone, so the check cannot judge their key.
    Their key is judged once, when you set it (the test that says it may use a small amount of credit): it then reads
    «verified» for an hour and «not verified» afterwards, because TALOS does not repeat that test on its own.
  - Nothing is said of the external agent: checking it would start it.

### Fixed
- **The first key after start could be read wrong.** On Windows, a Shift+Tab pressed in the first instant after TALOS
  appeared could arrive as a plain Tab and open the command list instead of changing the permission mode.
- **Long conversations on a ChatGPT-plan model.** With a `chatgpt:` model, TALOS managed the context of a long conversation
  only if the model list had been opened in that same run; `talos -p --model chatgpt:…` and a resumed conversation ran
  without it. The size of the model's window is now asked from your plan when it is needed.
- **`talos model list --provider chatgpt --json`** with nobody signed in still prints `[]`, and now says how to sign in on
  the error stream. With `--json` the error stream gets only what you need to act on (nobody signed in, a provider or a
  local engine that could not be reached); a list that was read writes nothing there.
- **The empty folder of the account commands is checked.** Outside a trusted folder, account commands run on an empty
  folder TALOS keeps for them; if that folder is a link or holds anything, the command is refused and names it.
- The refusal «needs a person's yes» now also names signing out of ChatGPT and the command that does it.
- **TALOS ends when its screen does.** A request still on its way to a provider when you quit could keep the process
  alive after the screen had closed. Two seconds after its own clean-up TALOS now ends regardless; anything still
  running then is stopped. A renewal of the ChatGPT sign-in that is on its way when you quit is waited for first, for up
  to fifteen seconds, so that the sign-in is not lost.
- An error that stops TALOS while it starts is printed after the full-screen view has closed, not inside it.

## talos-cli-v0.6.1 — 2026-10-13

### Fixed
- **Enter on «ChatGPT plan» asked for an API key.** In 0.6.0, on the screen, `/provider` and `/setup` did not open the browser
  sign-in for the ChatGPT plan: they showed the key field of the other providers. `talos provider login chatgpt` worked. Now
  Enter opens the sign-in, as the 0.6.0 notes said.
- **Only you sign out of ChatGPT.** A model could ask to disconnect your ChatGPT account, and in Full access (or with an
  «always» rule) it was done without asking. Now only you can say yes, every time and whatever the mode, on a card that says
  what it does and for which account, with only «once» and «deny»; where nobody is asked (`talos -p`, «don't ask») it is refused.
- **`talos model list` answers in any folder.** After a sign-in TALOS says to run `talos model list --provider chatgpt`, and in
  a folder that is not trusted that command was refused. It lists models and reads nothing of the folder, so it now answers
  anywhere, like the provider commands.

## talos-cli-v0.6.0 — 2026-10-13

### Added
- **Continue with ChatGPT.** Sign in once in the browser with `talos provider login chatgpt` (or Enter on «ChatGPT plan» in
  `/provider` and `/setup`) and use the models of your ChatGPT plan like any other provider: `talos model list --provider
  chatgpt`, then `/model`. Your plan pays those requests, never an API key, and the two are never mixed. `talos provider status
  chatgpt` says who is signed in and what this TALOS sent; `talos provider logout chatgpt` signs out and revokes. The sign-in
  needs a browser on the same computer, and the system keyring: with the in-memory credential store it is refused, because
  nothing would be kept.
- **A sub-agent can be given a model.** When you ask for a specific model for a sub-task, TALOS accepts one of the models it
  can use right now (providers with a usable key, the ChatGPT plan when signed in, a local engine that answers). Before, a
  sub-agent always ran on the model of the conversation that started it.
- **`/context` says when the request was made lighter.** Old tool results are cleared from the request by rule, at no cost,
  before any summary is written; `/context` now says how many, and that nothing is lost.
- **Provider commands work from any folder.** Signing in, signing out, keys, `provider list` and `provider test` no longer ask
  for a trusted folder: they are about your account. A folder that is not trusted is still never read.

### Changed
- **The engine is aligned to the desktop's.** Tools that did the same thing are merged (their old names still work in saved
  conversations and in your rules); a model that repeats the very same call is told so instead of ending the turn, and the
  copies it sent are shown as «duplicate, skipped», not «interrupted»; in `-p --output-format json` (v2) such a result
  carries `duplicate: true`.
- **Changing model or permission between two messages no longer makes the saved context drift** from what was sent.

### Fixed
- **`talos -p alpha beta gamma` sends the whole sentence.** Only the first word reached the model.
- **`talos provider list` no longer calls the ChatGPT plan ready when nobody is signed in.**

## talos-cli-v0.5.6 — 2026-10-12

After the owner's stress test of 0.5.5.

### Fixed
- **A project opened through a Windows short name (`C:\Users\me\DOWNLO~1\…`) no longer crashes inside the sandbox.** TALOS
  exited with 0xC0000409 and left the file it was writing empty: inside the sandbox the short folder name could not be turned
  into the long one, and Node's file watcher aborts the process on a short-name folder. TALOS now finds the long name by
  matching the folder's identity among its parent's entries, which works inside the sandbox too.
- **A secret written with a Windows path separator asks like any other.** `type .\.e*v` and `type keys\id_*` could read
  `.env` and a private key, even in Full access: the check read `\` only as a Unix escape. Both readings are checked now.
- **Commands that only print, like `echo import * from fs`, are no longer refused** because a bare `*` could match `.env`.
  Commands that read files are judged as before.
- **A provider error before the first word comes back as itself.** On the OpenAI and Anthropic wires a 429, 400 or 503 looked
  like a successful answer that then broke, so TALOS could not wait the time the provider asked for. Now it sees the real
  status and `Retry-After`.
- **The `-p` result lists the files the run changed.** `changedFiles` was always empty; it now comes from the run's own
  checkpoints (the same comparison `/undo` restores), in `json` and `stream-json`, protocol v1 and v2.
- **An approval's secret class is in English in the JSON stream** (`secret`, not `segreto`).

## talos-cli-v0.5.5 — 2026-10-11

After the owner's stress test of 0.5.4.

### Added
- **A saved key can be replaced or removed from the screen.** In `/provider`, a provider whose key is in use first offers: use it
  (Enter, as before), sign in again (OpenRouter: in the browser, or paste a new key) or remove it. Before, it went straight to the
  models, and only `talos provider login` / `remove-key` could change the key.
- **Node programs run inside the sandbox work.** There Windows refuses the native path lookup, so tools like vite or eslint
  failed with EPERM; TALOS now gives them a fallback (`NODE_OPTIONS --require`, declared by `talos doctor`).
- **A hook that says no to a tool is shown**: "The hook <id> said no to <tool>: <reason>".

### Fixed
- **The permission dry-run in `auto` mode answers for `npm test` and the other safe commands.** It printed nothing and exited 0
  (since 0.5.4), because it waited for the sandbox check and nothing kept TALOS running meanwhile. It now waits for the answer.
  A command that can never finish now says so and exits 70; before, it exited 0 with an empty output.
- **TALOS works when it runs inside its own sandbox.** There Windows refuses the native "real path" lookup (EPERM), so
  `talos provider list` exited 70 and every write was refused as "could not be resolved". TALOS now falls back to walking the
  path itself, still following every link; a path it cannot fully prove (a short `PROGRA~1` name) is still refused.
- **Errors say what is missing and how to write the command.** `memory add`, `tasks add` and `notes add` answered with a bare
  code (`TITLE_REQUIRED`); they now say "The command is missing its title." and show the command's form. In `--json` the
  `message` of such an error is that sentence, and a new `todo` field carries the next step.
- **`memory add --content X` no longer saves a memory titled "--content".** An option is never taken as the title, and `add`
  accepts the same `--title`, `--content`, `--description` and `--body` options as `update`.
- **A failed run's `classe` is English in `--output-format stream-json` and `json`** ("credential", "rate-limited"…, the
  words the screen already used); it was the kernel's Italian ("credenziale"). The field's name is unchanged.
- **`talos hook dry-run` says whether the hook was allowed or refused**, with the reason; it only said "Executed hook". A hook
  whose command has shell operators (`>`, `|`, `&&`…) is refused, because hooks run without a shell: `hook trust` and
  `hook dry-run` now warn about it.
- **`checkpoint undo` with nothing to undo says so** and exits 15, like a session that is not found; it was an internal
  failure (exit 70).

## talos-cli-v0.5.4 — 2026-10-10

After the owner's stress test of 0.5.3.

### Fixed
- **A key you removed or declined is never used by `talos -p`.** After `talos provider remove-key <id>` (or
  `env-key <id> --decline`) the environment variable was shown as no longer used, but `talos -p`, `session resume`,
  `automation run` and `research start` still sent it to the provider ("used without asking"). They now leave out every
  variable you declined and stop with "No API key" before anything is sent. A variable you approved or never answered is used
  as before, and a new value in the same variable is a new key.
- **The permission dry-run in `auto` mode says what a session does.** It answered "ask" for everything, while a session lets
  the automatic classifier allow a write inside the project or refuse `mkdir` in `-p`. It now uses the same classifier.

## talos-cli-v0.5.3 — 2026-10-09

After the owner's stress test of 0.5.2: providers that keep answering "too many requests", and permissions that now do
what the dry-run says.

### Fixed
- **A provider that keeps answering "too many requests" is retried like Claude Code does.** TALOS retried a 429 or a server
  error 3 times in about 7 seconds and gave up (the 0.5.2 stress test stopped after 68 minutes on a Z.AI 429). It now retries
  up to 10 times, waiting 0.5 s, 1 s, 2 s … up to 32 s between tries (about 2.7 minutes in all), unless the provider says how
  long to wait. `TALOS_MAX_RETRIES` changes the number like Claude Code's `CLAUDE_CODE_MAX_RETRIES` (at most 15).
- **Accept edits now asks before any command that is not a file operation, like Claude Code.** In accept edits a command
  such as `echo x > f` or `npm test` ran without asking; now only file edits and `mkdir`, `touch`, `rm`, `rmdir`, `cp`, `mv`
  inside the project go without asking, every other command asks, and with `-p` it is refused and TALOS says so. The same
  happens after a plan approved with "accept edits".
- **Your deny rules hold in every mode.** A deny rule you wrote (for example `Bash(rm -rf build)`) was not applied in accept
  edits nor in Full access: the command ran. It is now refused in every mode, as in Claude Code; Full access still lets
  everything else go without asking.
- **The permission dry-run says what a session would really do.** `talos config permissions dry-run` and `/permissions
  dry-run` read the rules alone: they said "deny" for `mkdir` that accept edits runs and "allow" for reading `.env`, which a
  session always asks about. They now answer in the mode a session would use (`--permission-mode`, otherwise the configured
  one, or the current mode in the TUI), recognise secret files the way a session does, and say what happens in a session
  and with `-p`.
- **Removing a key also stops using an approved environment key.** `talos provider remove-key <id>` said "Removed key" while
  a variable approved with `env-key <id> --use` stayed in use. It now takes that approval back too and says so (`talos
  provider env-key <id> --use` uses it again).

## talos-cli-v0.5.2 — 2026-10-09

An urgent release after the owner's stress test of 0.5.1: long sessions with Z.AI's GLM stopped again and again.

### Fixed
- **Long sessions no longer stop after one minute of waiting for the model.** With a long conversation (about 365,000
  tokens in the stress test) Z.AI took more than a minute to start answering whenever its cache missed, and TALOS gave up
  after exactly 60 seconds with "The provider stopped before TALOS could tell whether the request finished", every time.
  TALOS now waits up to 10 minutes for the first answer, like Claude Code, Codex and the official OpenAI and Anthropic
  libraries, and up to 30 if you set it (`talos provider configure <id> --timeout <seconds>`). The 60 seconds TALOS had saved
  by itself are read as the new default; a time you chose stays.
- **When the model has not started answering, TALOS tries again by itself, up to 3 times, and says so.** The line shows
  "Retrying · attempt 1 of 3 · no response". Nothing is resent when part of an answer or a tool call already arrived, or
  when the connection broke after the request was sent. If all 3 fail, TALOS says the provider did not start answering in
  time, how many times it resent the request, and what to do (/compact for a very long conversation, a longer
  `--timeout`).
- **Changing only a provider's address keeps the time you chose.** It used to go back to the default.
- **`model effort` reaches the model on Z.AI's Anthropic port.** With `zai-anthropic:glm-5.3-flash`, `talos model effort max`
  was saved but `-p` warned "not affirmed" and sent no reasoning setting. The levels Z.AI documents for that port (low, high,
  max) now count for its listed models, and the request carries them.
- **The agents pill says "1 agent".** It said "← 1 agents".

### Security
- **The permission to use the network in one command is asked only where the network is really closed.** A host that does
  not close the network no longer offers it to the model or asks you about it. And "allow shell for this session" no
  longer opens the network without asking: a command that asks for the network is still asked, outside Full access.

### Changed
- **The guard against going round in circles counts a repeated command too.** The same successful command with the same
  output, repeated, used to reset the count and was never stopped; now only a new change (a new write or command, or a
  different result) starts the count again. At the 5th identical call you are asked, as before.

### Added
- **`talos doctor` says when another talos in PATH hides this one.** It lists every talos in PATH with its version, and if
  an older one comes first (so `talos` runs the old one) or a newer one is hidden behind it, the `path` check fails with
  both folders and the command that fixes it (`npm i -g talos-code@<version> --prefix "<folder>"`).
- **Claude Haiku 5.5** (`anthropic:claude-haiku-5-5`) is in the built-in model list.

## talos-cli-v0.5.1 — 2026-10-09

### Security
- **Read-only git commands that write or run a program now ask first.** `git diff`, `git log` and `git show` with
  `--output=<file>` write that file, `git grep -O <program>` starts the program and `git diff --ext-diff` runs the configured
  diff program; TALOS counted them as read-only and ran them without asking, in every mode that lets reads through. They
  are no longer read-only.
- **More secret file names are protected.** `secrets.json`, `secrets.yaml`, `secrets.yml`, `secrets.toml`, `.secrets`,
  `credentials.json` and service-account keys (`*service-account*.json`) now count as secrets like `.env`: reading one asks
  first, and searches leave them out and say how many. `secrets.example.json` and similar stay public.
- **An untrusted project's rules no longer look applied.** In a project you have not trusted, `talos config permissions
  dry-run` decided with the project's own rules and `talos config list` showed them as effective, while no turn can start
  there. `config list`, `get`, `origins` and the dry-run now leave the project's file out and say "N project rules not
  applied: this project is not trusted (talos project trust)"; once trusted, they show it as before.

### Fixed
- **Z.AI uses your GLM Coding Plan.** Z.AI bills the plan only on its own address, and TALOS always called the
  pay-as-you-go one: with a plan and no balance every request failed with "no credit". TALOS now tries the Z.AI addresses
  with your key (the plan first, then the balance; China too), uses the one that answers and remembers it for that key. If
  Z.AI says the credit is finished in the middle of a task, TALOS tries the other addresses once, says "Z.AI said there is no
  credit on the pay-as-you-go balance: TALOS switched to the GLM Coding Plan and goes on", and goes on. An address you set
  with `talos provider configure zai --endpoint` is always used as it is.
- **An empty balance is called an empty balance.** Z.AI answers it with HTTP 429, and TALOS said "The model provider is
  limiting requests; TALOS retried… wait a moment": nothing had been retried, and waiting does not help. It now says the
  account has no credit left and to add credit or pick another model. A real 429 still says rate limiting.
- **A session killed in the middle of a turn resumes.** After a crash, a power cut or the system closing TALOS for low
  memory, `--resume` stopped with "This conversation no longer matches its saved context". The resumed session now
  continues from the tool calls and results that turn had already completed, and keeps a note of what it cannot prove
  finished (a call with no result, an answer cut short). A session already broken this way resumes too.
- **`--output-format stream-json` (protocol v1) reports every tool's result.** Only shell commands reported anything after
  `tool.started` (their output, as `tool.completed` with `delta`); a read, an edit or a search had no result event. Every
  tool call now ends with one `tool.completed` carrying `content`, `status` (`completed`, `failed`, `cancelled`,
  `unknown`) and, for a command, `exitCode`. The shell's output chunks are unchanged.
- **An answer cut by the model's output limit is continued.** It used to end the turn with "generation stopped without an
  answer". TALOS now says "The answer hit the model's output limit: TALOS asked the model to continue (1 of 3)" and the
  answer goes on, up to 3 times in a row; past that the turn ends with its own reason (`OUTPUT_LIMIT`) and what to do.
- **A provider that stops sending in the middle of an answer is noticed in 5 minutes, not 30.** Once an answer has started,
  5 minutes with no text, reasoning or tool call (the provider's "still working" pings do not count) end that request: with
  text already shown, TALOS asks the model to continue; with nothing shown, it resends the request as before. Before the
  first word nothing changes, so a long local prompt is not cut. `TALOS_STREAM_IDLE_MS` changes the 5 minutes (`0` turns it off).
- **A right click pastes again.** With the mouse on, the terminal hands the right button to TALOS, which did nothing with it.
  TALOS now reads the clipboard and pastes it where a paste goes; several lines fold into `[Pasted text #N +X lines]` as usual.
- **Shift+Tab changes the permission mode at once, even while TALOS works.** On the way through plan mode it said "Change
  permission mode failed: That conversation is busy saving". The new mode now applies to the next action at once; the
  part that only a new turn can use (plan mode's planning tool) starts with the next turn. No message.
- **`git -C <folder> status` and `findstr` run without asking, like the other reads.** `git -C`, `--no-optional-locks` and
  `--no-pager` before a read-only git command, and `findstr` (unless `/F:`, `/G:` or `/D:` name files or folders), were
  asked for. The folder after `-C` is still checked against the project like any path.
- **GLM 5.3 Flash through OpenRouter calls its tools again.** OpenRouter sent `z-ai/glm-5.3-flash` to one of its providers
  (OpenInference) that answers without calling tools: the model wrote the call as text, or said it had no write tool, and
  stopped. Measured with the same requests: that provider failed every time, Z.AI and DeepInfra did not. TALOS now leaves
  that provider out for this model by default.
- **`talos provider configure <id> --endpoint <url>` saves the address again.** It answered "The provider settings are not
  valid" for every provider, whatever the address. A `--timeout` alone keeps the address in use.
- **A turn that changed many files no longer writes them all on its checkpoint row.** The row names three files and counts
  the rest ("+31 more"); `/undo` still lists every file.

### Changed
- **The shell's network follows the permission mode.** In Full access a command reaches the network (an install, a fetch,
  a push) and its result says "network allowed". In the other modes the network stays closed; when a command failed because
  of it, the model can ask to run it again with the network, which shows a card "… with network access" with only "Allow
  once" and "Deny": no rule or earlier yes opens it. In `-p`, with nobody to ask, it stays closed (`NETWORK_NEEDS_PERSON`).
  Only the network opens: the rest of the sandbox stays.
- **A model that goes round in circles is noticed.** When the model calls the same tool with the same arguments and gets the
  same result again, with nothing changed in between, it now gets a note instead of the same result; at the 5th time TALOS
  asks you whether to let it go on (in Full access too). "No", or `-p` where nobody can answer, ends the turn with the reason.
  A write or a command that worked counts as progress and starts the count again.
- **Hooks and MCP servers in `.talos/hooks.json` and `.talos/mcp.json` can be trusted.** TALOS read them, listed them and
  then refused to trust them (`HOOK_RESOURCE_NOT_FOUND`), so they never ran; only the older file names worked.
- **The conversation looks like the approved design.** Your message is a highlighted row that starts with `›`, the answer
  follows without a "TALOS" label, reasoning is one row (`▸ Thought for 4s  click to read`), and a turn's tool calls fold
  into two rows: `● Read 2 files, searched 1 pattern` and `● edited 1 file, ran 1 command` (a click or `ctrl+o` opens them).
  A call that failed, was denied or waits for you keeps its own row. While a call runs its row says which one.
- **"Jump to bottom" sits at the bottom of the conversation, centred.** It was drawn on the first row, at the right.
- **Every row of a turn stands two cells in**, like the answer: notices, errors and the calls that keep their own row.
- **The frame around it too.** The header is `TALOS  <folder> · <branch>`; the composer has rounded corners and says what
  typing does now ("Ask TALOS, / for commands, @ for files", or "Type to queue a message" while TALOS works); the footer is
  the permission mode and its key, and from 100 columns a second row with the model, the provider check, the tokens, the
  context and the folder. "full access" and "no sandbox" stay in the first row at every width.

### Added
- **Excluded providers on OpenRouter, from the model and from the command line.** The model can list the downstream providers
  OpenRouter must not use, and ask to exclude one or allow it again; that shows a card with what changes (before → after) and
  waits for your yes, once each time. You can do the same with `talos provider exclusions`, `talos provider exclude <name>` and
  `talos provider allow <name>` (`--model <id>` for one model). In `-p` the model can only read the list. `glm-5.3-flash`
  leaves out OpenInference by default, where it did not call tools.
- **A hand pointer over what a click opens**, in terminals that support it (kitty, Ghostty, foot). Windows Terminal does not
  support changing the pointer, so there nothing changes.
- **OpenRouter routing per model.** `models.<id>.providerRouting` in your configuration sets which OpenRouter providers serve a
  model: `only`, `ignore`, `order`, `quantizations` (`fp8`, `bf16`, …), `requireParameters`, `allowFallbacks`, `sort`.
  An entry you write replaces TALOS's default for that model; `providerRouting: {}` removes it. A repository cannot set it.

## talos-cli-v0.5.0 — 2026-10-08

### Added
- **`--help` on every command family.** `talos provider --help`, `talos session -h` and so on print the usage of that family and
  its operations (they answered "Unknown option: --help" before, and `talos provider --help` a provider failure). A missing
  provider id (`talos provider login` with nothing after it) now says so instead of "The model provider returned an error".
- **`talos diagnostic bundle --session <id|last>` adds the conversation of one session to the bundle (opt-in).** The
  default bundle is unchanged and holds no prompt or file content. With `--session`, the session's events are included
  after keys, tokens, PEM blocks, environment secret values and the paths of your home folder and this project are
  masked; other paths, names, code, file contents and anything typed or answered are NOT masked, and the command says
  so. If the conversation cannot be
  proved free of the environment's secret values, nothing is exported (`DIAGNOSTIC_REDACTION_FAILED`). The file is
  bounded (16 MiB; the first event and the most recent ones are kept, with a visible gap marker).

### Fixed
- **Claude models: the reasoning level can be chosen, and it reaches Anthropic.** The levels (`low` … `max`) are read from
  the provider's live model list (`capabilities.effort`) instead of being missing, so `/effort`, `/model` and a
  configured `reasoningEffort` work on Claude 5.x. The chosen level is sent by name; `xhigh` on a 4.6-class model, which
  the API refuses, is sent as `max` (the same level under its other name, as everywhere else in TALOS); a resumed Claude 5.1+ session no longer gets stuck on a thinking block whose
  conversation prefix changed (the API is asked to drop the stale block). A tool call without arguments now resumes
  correctly on native Anthropic sessions.
- **A secret file inside the project is asked about again (security).** Reading `.env` (or any file TALOS treats as holding
  keys) inside the project, or a read-only command such as `cat .env`, was approved without asking anyone: the built-in
  rule "reads inside the project are fine" answered before TALOS looked at the secret. In `talos -p` the question was
  answered yes by itself and the file reached the model. Now only a rule you wrote for it, or you, can allow it; a mode
  (`acceptEdits`, `bypassPermissions`, `auto`) never does, and without a person (`-p`, `dontAsk`) it is refused with the reason.
- **Running a command in the background no longer makes TALOS distrust its own project.** The output of a background command
  is kept in `.talos/processi-sfondo/`, and that log counted as a project resource: the folder's trust dropped, and the next
  `talos --resume` or `talos -p` in the project failed with `PROJECT_TRUST_INVALIDATED` until it was trusted again. Logs TALOS
  writes there are now left out; everything TALOS reads from `.talos/` (hooks, MCP servers, plugins, skills) still counts.
- **A configured reasoning effort is applied at start for models only the provider's live list describes**, waiting for
  that list at most 5 seconds instead of dropping the effort.
- **`talos -p` ends even when the model left a command running in the background.** The run used to finish its answer and
  then never exit, held open by the live command. Now the end of a headless run (last turn, failure, `--timeout`, Ctrl+C)
  stops the background commands of the session and of its delegated agents, and says which ones with their output files: a
  `BACKGROUND_COMMANDS_STOPPED` warning before the final event, and `backgroundStopped` in the `--json` result (v1 and v2). A
  command whose exit TALOS did not see within 3 s is reported as such. Inside WSL the stop ends the command and its plain
  children; a Linux process the command detached (`setsid`, `nohup`, a server that daemonizes) can survive, and the warning
  says so.
- **The search tool never shows a secret file (security).** `cerca` searched hidden files too, and in a project where `.env`,
  `id_ed25519`, `secrets.json` or a `.pem` were not git-ignored it returned their matching lines — keys included — to the model
  and the provider, with no question asked, while reading those files asks. Secret files are now left out of search results
  (lines, names and counts), the result says how many were left out, and reading one still asks first. `.envrc` is now treated
  as a secret file too.
- **A link to a secret file asks like the file itself (security).** Reading `config.txt` when it is a symbolic link or a
  junction to `.env` was judged by the link's name; now the real file is checked.
- **A mouse or focus report that arrives in two pieces is waited for longer.** An incomplete report is held 100 ms (it
  was 30 ms) before it is handed to the input as text, so a second piece that comes a little late is still put back
  together; a lone Esc is still never held.
- **A secret file named before shell syntax is still recognised** (for example `cat ~/.ssh/id_rsa*()`).
- **A wildcard on the name of a secret file now asks like the name itself.** `cat .e?v`, `cat .en*`, `cat ./.e*v`, `cat .en[v]`,
  `cat .en{v,}` and `cat cert.p?m` print `.env` or a key file in a real shell, and TALOS did not ask: it judged the text of the
  command, and the shell expands the wildcard afterwards. Braces and `* ? [..]` patterns (with the extended `@(..)` forms) are now
  expanded against the real files of the working folder, and the question names the file the shell would read. A pattern it cannot
  explore (a folder that does not open, too many folders) asks. Not covered, and the command text says so for the same reason as
  before: `eval`, a `cd` before the pattern, a variable that holds the whole name. On Windows the star also matches a file that starts with a dot
  (cmd and PowerShell do), so a bare `*` next to a `.env` asks there and does not on Linux or macOS.
- **Quotes and substitutions that rebuild a secret name now ask too.** `cat .e""nv`, `cat ".e"nv`, `cat .e\nv`, `cat .e"n"v`,
  `cat $'\x2eenv'` and `type .e^nv` (cmd) all read `.env`, and so does `cat .e${X}nv` when `X` is empty: the command is now read
  the way the shell reads it after removing quotes and escapes, and a variable or `$(..)` inside a name counts as "anything".
  The commands inside `$(..)` and backticks are checked as commands. Looking for the files behind a wildcard stops after 100 ms
  and asks instead of holding TALOS up, and only folders are opened for the middle of a pattern.
- **Resuming a long session no longer burns seconds in the development log (gate 2 cure A1, owner decision 07/10).**
  The dev log wrote synchronously per record with `existsSync`+`statSync` on every event, so a replayed history
  (thousands of `raw_event` rows) paid the filesystem tax line by line and pushed the resume past the 2 s threshold.
  The logger now serialises+redacts and queues pre-built lines (memory capped ~512 KiB) and flushes a batch per chunk
  — one `appendFileSync` per chunk, never per record — with flush-on-exit via the `process.on('exit')` hook, the
  uncaughtExceptionMonitor and `closeDevelopmentLogging` on every exit path; rotation is by size (internal counter,
  zero stats per record) and by time (new stamp, same `.part-N` convention), tunable via
  `TALOS_CLI_DEV_LOG_MAX_BYTES`/`_ROTATE_MS`/`_FLUSH_MS`. Measured 52.1× on the replay flood (36,652 ms → 703.9 ms
  for 9,600 records, zero rows lost). Known declared windows: rows buffered at the moment of a signal arriving before
  the handlers are installed, or of SIGKILL/SIGQUIT, are lost; on a failed append the size counter may lag the real
  file (chunk dropped, never re-queued — logging never breaks TALOS).
- **Replaying a session emits one replay summary instead of thousands of raw-event log rows (compat risk accepted by
  the owner 07/10).** While history replays, `runtime.raw_event` and `ui.runtime_event` development-log records are
  gated (`replaying()` on the controller, fail-open) and a single `runtime.replay.summary {sessionId, rawEvents}`
  lands in the finally of attach — symmetric with live runs, since `handleCheckpointRaw` consumes nothing before the
  gate.

### Known issues (to be fixed in 0.5.1)
- A session whose TALOS process is killed in the middle of a turn (a crash, a power cut, the system closing it for low memory)
  cannot be resumed: `--resume` fails with `CTX_HISTORY_DIVERGED`. The session's files are kept.
- A provider stream that stays silent and is then closed by the provider ends the turn with the code of a stop (`fermato`)
  instead of a provider error, and is not retried.
- In `--output-format stream-json` with protocol v1, only shell commands report their output; the other tools have a
  `tool.started` and no result event. Protocol v2 (`--protocol v2`) reports every tool's result.

## talos-cli-v0.5.0-beta.7 — 2026-10-06

### Fixed
- **The config default is no longer persisted over a session's saved model on a resume/fork given without `--model` (adversarial review B, 06/10).**
  The entry point always filled the run's `model` field with the configured default (never empty), and the override
  path read that field — so every headless `--resume`/`--fork` without the flag rewrote the session's durable model to
  the config default and ran on it, silently discarding what `/model` had saved. Only a flag the person actually typed
  is an override now (it travels in its own field), and a no-prompt replay that discards the flag says so in its warning.
- **A model id with spaces or control characters is refused before it can be saved.** The CLI reaches the kernel
  registry in-process, past the HTTP layer's validation, so a garbage `--model` was persisted and poisoned every later
  turn with a failure at provider-call time. The runtime now refuses it with `MODEL_INVALID` before any persistence,
  on resume, fork and live `/model` alike; the id is trimmed first, so only real garbage is rejected.
- **Changing the model of a `local` session now actually changes it.** The settings write updated the display model but
  left the engine's model id untouched, and the next turn silently restarted on the OLD local model — the same silent
  family this change exists to close. The two fields now move together (naked engine id, the registry's own
  convention), a malformed id is refused instead of persisted, and the cut child of a "fork before turn" inherits the
  parent's model like any other fork does.
- **If persisting the model fails, the TUI no longer shows it as changed.** The controller switched to the new model
  before the durable write and stayed there on failure: the picker offered a model the saved session had not taken.
  The controller is rolled back to the saved model and the error is shown. (A blank `--model ""` stays "no override",
  deliberately: only `setSessionModel` from the TUI treats a blank as `MODEL_REQUIRED`.)
- **`--model` now reaches a resumed or forked session, and `/model` on a live session persists (owner request, 05/10).**
  The flag changed only the CLI's copy of the model: a headless `--resume`/`--fork` run came back on the session's
  saved model (measured: `RunStarted.contesto.modello` carried the old model across `--model`), and a fork silently
  fell back to the server default instead of inheriting the parent's model. Now an explicit flag wins over the saved
  model and persists on the kernel's settings channel (`aggiornaImpostazioni{modello}` — admitted key, durable
  record); `forka` inherits the source session's model (like Codex's `side.rs` fork), with an explicit override
  applying to the child only; the TUI's `/model` on a live session goes through the same channel between turns
  (precedence flag > saved model > default: RICERCA-5x5x5x5-CAMBIO-MODELLO-RESUME-2026-10-05).
- **`talos update` recognises an npm install on every platform (audit R7).** The check parsed the package path with the
  host's own path rules, so on POSIX a Windows layout (`...\npm\node_modules\talos-code`) was not recognised as an
  npm install. Both layouts now parse everywhere; the running build's own package root decides the real answer.
- **The boot shows one light loading line while the runtime prepares (owner request, 05/10).** A stalled start or
  resume (measured 5-57 s behind a provider probe) held a static screen. One constant-height row — spinner glyph, the
  `starting` word, the elapsed clock — appears when the boot's own frames are over and the runtime is still not ready
  (a healthy boot never shows it), animates on the shared 120 ms frame, and dies with the boot region; with reduced
  motion it is a static bullet with a 1 Hz clock. It ticks on its own state: the rest of
  the tree never re-renders for it (RICERCA-5x5x5x5-TUI-LOADING-RESUME-2026-10-05).
- **The checkpoint store no longer grows unbounded (audit F-023).** Records were kept for ever and every record
  pinned its blobs, so the store grew with every unique file the workspace ever saw (measured live: 22 records
  pinning all 2,894 blobs, 287 MB and rising). The 256 MB limit was a per-capture budget, not a store cap.
  - New `talos checkpoint prune [--keep N] [--days D] [--dry-run]`: keeps the newest N records per workspace (an
    unfinished run and a record named by a pending restore transaction are never dropped), then collects the blobs no
    kept record still names and drops the stat-index rows that pointed at them (it is a cache: the next capture
    re-reads). A blob written in the last hour is never collected.
  - With no one running anything: once a workspace journal passes 100 records, a background prune brings it back to
    50 and never blocks the command (`TALOS_CHECKPOINT_AUTO_PRUNE=0` disables).
- **`active-runs` no longer fills up with markers of dead processes (audit F-022/RIF-1).** Every CLI process wrote a
  `<pid>.json` marker and only removed it on a clean exit: a closed console window (SIGHUP) or a second Ctrl+C left it
  behind, and nothing swept the folder — 30 markers declared live runs, 28 were dead (oldest 16 days).
  - At startup, before registering its own marker, TALOS reconciles the folder: markers that are unparsable, name a
    dead process, or are older than 30 days are removed (`TALOS_ACTIVE_RUN_RECONCILE=0` disables).
  - SIGHUP, SIGTERM and SIGBREAK now release the marker before exiting with the conventional 128+signal code; the
    second Ctrl+C of a headless run does the same before its forced exit.
  - Review round (adversarial, 2026-10-05): a marker caught between file creation and content write is no longer swept
    as junk — an unparsable file younger than 10 s still counts as an active run. The installed signal list follows the
    platform (SIGBREAK is Windows-only) and a handler install that fails mid-way rolls back the ones already made. A
    well-formed marker without a usable `startedAt` ages by the file's own mtime, so a corrupt marker cannot block an
    update for ever. Note: `hasActiveRuns` removes what it finds stale as a side effect (visible to `checkpoint`,
    `update` and `/undo`); the forced signal exits use 129/143/149.

### Known issues
- **Deep mouse-wheel scrolling can duplicate the shortcut strip and shift the bottom block (owner report, 06/10).** After
  a long scroll with the wheel the frame can come out one row taller than the terminal: the top row (header) scrolls off
  and the composer/shortcut/footer block sits one row higher for the rest of the session as far as measured. It survives
  Ctrl+L, a terminal resize and scrolling back to the tail — the extra row is inside the render tree, not a terminal
  paint artifact. It is NOT new in this release and no workaround is verified yet; a pinning test for the fixed bottom
  chrome is already in the suite (`test/tui/f023-fixed-bottom.test.ts`) and the cure is next.

### Verification
- Full suite on Windows Node on this exact tree: 2,798 tests — 2,794 passed, 0 failed, 4 skipped; typecheck clean.
- Adversarial review B (model-chain, sessions 04–06/10): 24/24 model-override tests green; the kernel registry tree
  shows no new failure against its HEAD baseline (the 74 failures seen under WSL pre-date this change and reproduce
  identically on unmodified HEAD).

## talos-cli-v0.5.0-beta.3 — 2026-10-03

`npm i -g talos-code@next`, or `talos update` on the preview channel.

A fix release. In a project with a large file, TALOS could no longer change anything.

### Fixed
- **Large files no longer block TALOS.** Before each change TALOS saves a copy of the project for `/undo`. If one file was
  over 64 MB, the project over 256 MB, or more than 50,000 files, that copy failed, and with it every write, command,
  test, sub-agent, note, task and memory, even after you approved them. Restarting did not help.
  - Now those files are left out of `/undo` and everything else is saved. TALOS says once which files `/undo` does not
    cover.
  - `/undo` never changes or removes a file it left out.
  - If the copy cannot be made at all, the turn goes on without `/undo` and says so, instead of refusing the tool.

### Verification
- Checked on commits `e942fa2d2` (this version) and `dfa6c24d3` (a test made independent of the capture order):
  - typecheck and build pass;
  - unit: 2,687 tests, 2,683 pass, 4 skipped, 0 fail;
  - acceptance on the built CLI in a real pseudo-terminal: 346 of 346;
  - kernel tests: no new failure by name;
  - the installed-package proof passes.
  - The owner's case with the real limits: a 65 MB file in the project, the write happens, the gap is said once, and `/undo` puts back the rest without touching the file. Mutation checks: every mutant killed.

## talos-cli-v0.5.0-beta.2 — 2026-10-03

`npm i -g talos-code@next`, or `talos update` on the preview channel.

The second beta of 0.5.0. It brings three things:
- A panel for the agents TALOS starts, which can ask you things.
- The mouse: click to choose, open or answer, and drag to select.
- The commands open as sheets in the composer's place, the same way everywhere.

The commands not changed yet keep the panels they had; they move to sheets in 0.5.0.

### Added
- **Agents panel.** The agents TALOS starts show in a panel on the left, or as a full page:
  - which agents are working, for how long, and what each did last;
  - a sub-agent can ask you a question there, and you answer it from the page.
- **Mouse.** The mouse is on by default:
  - click an option, a menu row, a card's choice or an approval to pick it;
  - click a transcript item to open it and click it again to close it;
  - drag to select text; Ctrl+C copies the selection.
- **Sheets for the commands.** These commands open as sheets with a row of keys:
  - `/busy`, `/plan`, `/retry`, `/rename`, `/effort`;
  - `/history`, `/resume`, `/fork`, `/undo`, `/export`, `/compact`;
  - `/model`, `/provider`, `/setup`;
  - `/status`, `/usage`, `/context` and `/config`, in one Settings sheet with four tabs;
  - `/clear`, `/queue`, `/copy`, `/diff`, `/help`, `/tasks`, `/notes`, `/permissions`.
  Each sheet takes the arrows, Enter, Esc and clicks. A sheet's row of keys goes on two rows when it does not fit.
- **`/theme`** is a page with each theme's colours, previewed as you move.
- **Transcript mode** (Ctrl+O): search the conversation, jump between your prompts, open every item, start a new
  conversation from before one of your prompts, or write it all to the terminal's scrollback or your editor.
- **`/diff`** shows what changed now (`git diff HEAD` and new files) and by each of your messages.
- **`/notes`** shows each note as Markdown beside the list, with what it is linked to. Enter attaches a note to your message,
  and `v` opens it in your editor.
- **`/permissions`** has three tabs:
  - **Mode**: choose a permission mode (Full access still asks you first). A row says whether the project is trusted.
  - **Rules**: add, edit, delete and switch allow / ask / deny. You choose where a rule is saved: only for you in this
    project, shared with the project, or for all your projects. A changed rule applies at once, with no restart.
  - **Recent**: the last 50 decisions in this project. `a` makes one an "allow" rule.
  The trust center moved to `/permissions trust`.

### Changed
- A typed key shows within 16 ms, even while an answer streams.
- The palette has seventeen colours in each theme, from the theme's two base colours.
- The boot animation is smoother, and the logo stays 600 ms again, as in 0.4.0.
- After a crash, the same message starts again; the turn that was cut is named once.

### Fixed
- Fork and resume wait for the turn to settle.
- Settings that cannot be read are reported, never shown as the defaults.
- `/undo` at 80 columns no longer ends on a broken key, and `/queue` and `/export` keep "esc close".

### Verification
- Checked on commits `e5317e228` (this version) and `e7fd9cea9` (a test that compared the Settings sheet to the old row of keys):
  - typecheck and build pass;
  - unit: 2,682 tests, 2,678 pass, 4 skipped, 0 fail;
  - acceptance on the built CLI in a real pseudo-terminal: 346 of 346;
  - kernel tests: no new failure by name.
  - Mutation checks on the new code: every mutant killed.
- Installed package, proved through a local npm registry from an outside folder into an isolated prefix and profile:
  - the main tarball is 6.3 MB (51 bundle files), plus the package for this platform (win32-x64 11.3 MB, win32-arm64 9.1 MB);
  - the install takes 5 s;
  - `talos --version` prints 0.5.0-beta.2, and `talos doctor --json` answers ok.

## talos-cli-v0.5.0-beta.1 — 2026-10-02

`npm i -g talos-code@next`, or `talos update` on the preview channel.

The first beta of 0.5.0. It brings two things:
- TALOS can now ask you things on screen: questions, plans and requests from MCP servers.
- The status line now says what TALOS is doing right now, with honest times.

It also starts faster and installs smaller.

### Added
- **Questions from the model.** When TALOS needs a decision it asks in a card where the composer was:
  - one question or several, single or multiple choice, with the recommended option first;
  - your own answer with Other, a note on any option with Tab, and a preview beside the options;
  - a review before sending, and a countdown you set in `/config` (`ui.questionTimeout`: never, 1, 5 or 10 minutes).
  - Your answers stay in the conversation as "Your answers".
  - `talos -p` never offers the tool, since nobody could answer.
- **Plan mode with a plan card.** In plan mode TALOS proposes a plan and waits for you:
  - approve and start, either asking before edits or accepting edits;
  - approve in a clean conversation;
  - edit the plan in your editor;
  - or keep planning.
  The screen follows the mode the kernel uses.
- **MCP servers can ask you for details.** A trusted server can ask through a form (text, numbers, yes/no, choices) or
  by asking you to open a page. A page opens in your browser only when you press Enter, and only over https; its domain
  is shown first. Declining or cancelling is said in the conversation, and the server is told.
- **Agents talking to each other** (a sub-agent asking its parent, and the parent's answer) now show in the conversation.

### Changed
- **The status line shows the real phase:**
  - what TALOS is doing: the title of its reasoning, or the tool in words ("Searching for "retry"", "Calling the github
    MCP server", "Delegating to 3 agents");
  - how long this phase has taken, with the whole turn's time beside it from 100 columns;
  - the tokens while the model writes;
  - "esc to stop".
  - After 30 seconds without data from the model it says so, while the request stays open.
  - At the end it shows "✓ Done in 1m 12s" (or "Stopped after", "Failed after") with the clock stopped, followed by
    what happened: files changed, a long silence of the model, a refused request, agents still working.
  - The clock moves even with animations off.
  - A long tool name gives way first, so the time and "esc to stop" stay visible on a narrow terminal.
- The composer appears before the kernel finishes loading.
- The package is an esbuild bundle: fewer files to install and load.
- Heavy libraries come as per-platform or build-time packages, so only what runs is installed: the Windows sandbox,
  node-pty and the document libraries.
- Only the rows that changed are redrawn on the alternate screen.

### Fixed
- The status line no longer counts the whole turn under "thinking"; the owner's report was "thinking 306.1s".
- Plan mode now reaches the kernel; before, it was sent as read-only.
- `talos update` now orders pre-releases correctly, so a beta is offered the next beta (SemVer §11).
- Console output while the TUI is up goes to `logs/console.log` instead of the screen.

### Known limits
- Clicking on cards, and the agents panel, come in a later beta.
- Typing echo has not been measured yet; that is the next stage.

### Verification
- Checked on commit `c9173f2b1`, gate g-q17:
  - typecheck and build pass;
  - unit: 2,338 tests, 2,334 pass, 4 skipped, 0 fail;
  - acceptance on the built CLI in a real pseudo-terminal: 323 of 323, including s40 (questions), s41 (plan), s42 (MCP
    requests from a real stdio server) and s43 (the activity line, with a 33-second silence of the model);
  - kernel tests: no new failure by name.
  - Mutation checks on the new code: every mutant killed.
- Installed package, proved through a local npm registry from an outside folder into an isolated prefix and profile:
  - the main tarball is 6.3 MB (51 bundle files), plus the package for this platform;
  - the install takes 6 s;
  - `talos --version` prints 0.5.0-beta.1, and `talos doctor` passes.

## talos-cli-v0.4.0 — 2026-10-01

`npm i -g talos-code@0.4.0`, or `talos update` to see it.

Sub-agents now work in the background while you keep talking to TALOS, and TALOS runs on the same kernel as the
TALOS desktop app.

### Added
- **Background sub-agents.** A delegated agent no longer holds the main agent's turn: the main agent answers at once,
  the agent works on, and when it ends TALOS answers its result in a new turn. The result is shown as an agent row
  ("◆ Agent finished · <task>", three lines of its summary, the rest with the transcript's expand), never as your
  message.
- **`/agents`** (also `/subagents`, and Alt+A): the agents of this session with what each one is doing (its last three
  steps). `x` or Ctrl+X stops the selected one; `/agents stop <n|id|all>` and `/agents show <n|id>` name them.
- The status line says "2 agents working" while only agents work, and "· 2 agents in background" while TALOS works too.
- **Leaving with agents at work asks first.** `/exit` offers: wait for them and exit by itself once TALOS has answered
  their results, stop them and exit, or stay. The first Ctrl+C says how many agents an exit stops.
- **`talos -p` waits for its agents** and the turn that answers them, and prints both answers. Ctrl+C, the timeout or a
  failed turn stop the agents still working.
- **`agents` in the configuration** (user or project-user file): `maxConcurrent` (1–32, default 10), `maxDepth` (1–4,
  default 2), `model` (`provider:model`) and `reasoningEffort` for the agents. A repository's `.talos-cli` cannot set
  them: they are ignored with a notice, like `reasoningEffort`.
- When an agent's work woke TALOS, the desktop notification says which agent finished; the terminal's progress
  indicator stays on while agents work.

### Changed
- TALOS uses the kernel of the TALOS desktop app (one kernel for both): long outputs are cut in the middle with the
  total kept, retries follow the provider's own wait, read rows show the file's real line count, Linux symbolic links
  on a Windows drive are explained instead of reported as a denied permission, and a WSL command declares its user.
- Answers wrapped in a ```` ```markdown ```` fence are drawn as Markdown, and `---` is a rule.
- A search row says "2+ results" when the scan was not complete (a file that could not be read, a Linux link, a time or
  size limit), instead of a count that read as final.

### Fixed
- Git submodules and nested repositories no longer block the tools; their files are covered by `/undo`, their Git
  history is not, and that is said.
- A local provider without a key (for example Ollama) that answers HTTP 401 or 403 is no longer reported as a refused
  key: TALOS says to check the endpoint or the server's permissions.
- A key benched after repeated provider errors (no provider for the model, a timeout, the network) now says to wait or
  choose another model with `/model`, instead of "add another key", which would not help.
- In a read-only session an artifact is no longer copied into the Library.
- `talos -p`: Ctrl+C with TALOS idle ends at once.

### Known limits
- Ollama with a real model was not tested for this release (owner decision); the provider is covered by fake-provider
  tests only.
- The physical mouse selection of 0.3.3 is still untested on a real terminal by the owner.
- macOS and Linux were not run; the private CI is blocked by Actions billing.

### Verification
- Typecheck and build pass. Unit: 2,084 tests, 2,080 pass, 4 skipped, 0 fail. Acceptance on the built CLI in a real
  pseudo-terminal: 297 of 297, including the new s39 (background agents: `/agents`, stop, `/exit` wait, `talos -p`).
  Standalone package check: pass.
- Tarball (2.4 MB, 508 files) installed with `npm install -g` from an outside folder into an isolated prefix and
  profile in 13 s: `talos --version` prints 0.4.0, and `talos doctor --json` passes every check (configuration, data
  and cache paths, git, keyring, kernel, project, MCP, hooks), asking only to choose a provider.

## talos-cli-v0.3.3 — 2026-09-30

`npm i -g talos-code@0.3.3`, or `talos update` to see it.

Reliability fixes: select and copy the conversation with the terminal's own mouse selection again, see how long
quick turns took, understand a paused compaction, and ask any subcommand for JSON.

### Changed
- Mouse tracking is now off by default, so dragging selects conversation text and right-click or Ctrl+C copies it,
  as in any terminal program. Wheel scrolling is still available: turn it on in `/config` for the current project
  (it applies from the next launch) or set `ui.mouse: true`. With it on, hold Shift while dragging to select.
  A saved `ui.mouse: true` keeps working as before.
- A turn that ends in under a second now shows its duration ("done 0.4s"). A resumed conversation no longer shows
  the time it took to replay a turn as if it were the turn's own duration.
- The room kept for the answer (sent to the model as `max_tokens`) is now the smaller of the model's stated maximum and
  32,000 tokens, never more than a quarter of the window, instead of the model's whole stated maximum. Conversations get
  more room before compaction. Your own `models.<provider:model>.maxOutputTokens` is kept as set; set it for answers
  longer than 32,000 tokens.

### Fixed
- Models whose provider states a maximum output close to the whole window (for example 943,717 of 1,048,576 tokens)
  no longer stop before the first request with "context window is too small". If your own setting still leaves no
  room, TALOS uses its simple mode instead of refusing, and the error, where it can still appear, names the reserve.
  `/context` shows the reserve and where it comes from.
- When compaction is paused after a refused summary, `/context` shows the error code, the number of attempts, the
  full date and time (UTC) of the next automatic try, and that `/compact` tries now and may call a billed model at a
  cost that is not estimated. The notice in the conversation shows the full date instead of only the hour, and the
  pause survives a restart until its deadline.
- `--json` after a subcommand (for example `talos config list --json`, `talos checkpoint list --json`) selects JSON
  output, like `--json` before it. Anything after `--` is still passed through as written.

### Known limits
- Tested on Windows 11 x64 with Node.js 24.18 or later in the 24 line; macOS/Linux and the native installer are not
  certified by these checks.
- Native mouse selection was checked with automated terminal tests and by hand in Windows Terminal (drag to select,
  right-click and Ctrl+C to copy, Ctrl+C without a selection still offers to exit); other terminals were not checked
  by hand.
- Compaction against a real Ollama server was not run; the compaction path was checked with an Ollama-shaped local
  test server.
- Unchanged from 0.3.2: the read tool describes binary files instead of passing images/audio; MCP non-text results and
  image budgets across long conversations need further work; long pastes can appear expanded in queued messages and
  resumed conversations.
- A local provider that answers 401/403 without a key can still suggest replacing a key; the fix is not in this
  release.
- An answer cut off because it reached the reserve is not yet announced as cut off.

### Verification
- CLI unit suite: 2,018 tests, 2,014 pass, 4 skip, zero failures. Complete terminal acceptance: 292/292 on an
  otherwise idle machine (two earlier runs under heavy parallel load each had one timing failure in the test harness,
  not reproduced alone; they are tracked as open).
- Installed package from the release tarball: standalone install from an empty prefix, fast-turn duration, compaction
  cooldown after restart, mouse off by default and on by opt-in, `--json` after a subcommand, no outbound traffic and
  no writes into the package.
- The bundled kernel is the same as in 0.3.2 (kernel files copied from the same kernel commit).
- These are Windows filesystem/terminal checks with local scripted providers, not live cloud-model evaluations.

## talos-cli-v0.3.2 — 2026-09-28

`npm i -g talos-code@0.3.2`, or `talos update` to see it.

Display settings in the terminal, clearer permission changes, and safer file reads, with conversation recovery
and workspace checkpoints preserved.

### Added
- `/config` changes response width, notifications, mouse-wheel scrolling and exit output. Settings are private to you
  in the current project. Response width updates immediately; the other settings apply on the next launch.
- Focus-aware completion, failure and approval notifications, with fixed messages that contain no prompts, filenames
  or model answers. Supported terminals also receive running/error progress indicators.

### Changed
- Entering Full access requires an explicit confirmation. Changing permission mode also updates the current session,
  so the next turn follows the mode shown on screen.
- Turns without mutations avoid preparing a workspace checkpoint when no extensions are present. The checkpoint still
  precedes writes and delegated work; projects with extensions retain the earlier preparation for compatibility.

### Fixed
- File reads check a bounded binary sample before decoding. Text reads stop at 1 MiB, even without line breaks or when
  a file grows during the read, and disclose incomplete reads at the beginning of the result. Binary sizes come from
  the original file. Edit and checkpoint operations retain their full reads.
- A completed turn settles its saved conversation before follow-up operations such as compaction and resume use it.
- Fragmented UTF-8 input preserves accents, CJK and emoji. Mouse-report filtering no longer alters matching sequences
  inside bracketed paste or leaks incomplete report prefixes into the composer.
- Command completion opens when fast typing arrives in one input chunk, preserving the whole prefix. Bracketed paste
  retains its separate text behavior.
- Builds refresh the bundled kernel, preventing a package from silently using a stale copy.

### Known limits
- Tested on Windows 11 x64 with Node.js 24.18 or later in the 24 line. macOS/Linux and the native installer are not
  certified by these checks.
- Native desktop notification delivery still needs physical checks; automated checks intercept delivery. Other
  terminal applications have not been verified on their target platforms.
- The read tool returns a description for binary files, not their image/audio content. MCP non-text results and image
  budgets across long conversations still need further work.
- Long pastes can still appear expanded in queued messages and resumed conversations. Mouse interaction is wheel-only.
- Compaction retry cooldowns and extension startup costs still need broader stress testing.

### Verification
- CLI unit suite: 1,998 tests, 1,994 pass, 4 skip, zero failures; complete terminal acceptance 292/292.
  Kernel suite: 603 pass, 1 skip; 12 bounded-read tests and five additional edge-case checks pass.
- The installed 0.3.2 candidate passes the bounded-read tests and real terminal flows through reading, command completion,
  restart and resume. Upgrade from published 0.3.1, real write, checkpoint undo, rollback and redo pass.
- Four independent mutations of the read limit, sample, byte count and tool dispatch are detected by the tests.
- The command-input regression and the test fixture's distinction between terminal controls and frames each detect
  an isolated reintroduction of the defect.
- These are Windows filesystem/terminal checks with local scripted providers, not live cloud-model evaluations.
  The broader backend suite retains three pre-existing documentation/test-inventory failures.

## talos-cli-v0.3.1 — 2026-09-27

`npm i -g talos-code@0.3.1`, or `talos update` to see it.

### Fixed
- A conversation no longer gets stuck after a failed turn. When a turn failed after its tools had answered (a context
  compaction that could not finish, for example), every later turn stopped with "This conversation no longer matches
  its saved context". The conversation now goes on from what was saved, results of the tools included.
- Reading an image or any other binary file no longer pours its bytes into the conversation. The model is told the
  file is binary, with its type and size, and that it was not read. Before, five screenshots put megabytes of unreadable
  text into the context, and the compaction that followed could not succeed.

### Added
- The mouse, on by default in the full-screen view: the wheel scrolls the conversation, three rows a step. Hold Shift to
  select text as usual. `ui.mouse: false` in the settings turns it off. TALOS switches the mouse off when it leaves.

### Known limits
- Tested on Windows 11 x64 only; Node.js 24 (24.18 or later in the 24 line).
- A conversation that was already stuck before this version stays stuck: start a new one.
- Clicks do nothing yet.
- A message sent while TALOS works (queued) and the messages of a resumed conversation still show a paste whole.

### Verification
- The owner's stuck session, rebuilt through the real runtime, kernel and context engine on a local fake: without the fix
  the next turn stops as it did; with it the conversation goes on.
- CLI unit suite: 1921 tests, 1916 pass, 4 skip, the one failure a test that read a file before its save ended (fixed).
  Acceptance on the built CLI in a synthetic terminal: 269/269, the mouse and a failed turn included.

## talos-cli-v0.3.0 — 2026-09-27

`npm i -g talos-code@0.3.0`, or `talos update` to see it.

A cleaner screen: long pastes, runs of file reads and the model's thinking now take one line each, and a batch of
display defects found by recording every screen in a synthetic terminal is fixed.

### Added
- A short welcome before the first message: the folder, the model, one example and four keys.
- The resume list names each conversation by its first message instead of its id (your own `/rename` still wins; the
  id stays searchable).
- A one-line preview while the model thinks, with reasoning collapsed: the last sentence so far, then
  "Thought for N s · Ctrl+T shows". Off with reduced motion.

### Changed
- Long pastes: over 800 characters or more than 2 line breaks, a paste shows as `[Pasted text #N +X lines]` (before:
  20 lines or 4,096 characters). The model still receives all of it. The placeholder is one block: Backspace removes it
  whole, and pasting the same text again right after it expands it ("paste again to expand"). Your message in the
  conversation shows the placeholder, not the whole paste.
- Consecutive file reads, searches and folder listings are one line — "Searched for 2 patterns, read 3 files, listed
  1 folder · Ctrl+O shows". Writes, commands and anything that failed or needs you keep their own line.
- Agents in the footer only while a subagent works, and the list follows it live; the finished ones leave it (they stay
  in the conversation and in Alt+A). The main line counts the turn, not the session.
- Tables are drawn with box lines; wrapped list items keep their text aligned.
- The whole screen takes the theme's background, borders included, and dim text reads at 4.5:1 or better in every theme.
- A long command output says "… +N earlier lines" above the lines it shows, and the path of the full output has a line
  of its own.
- Clearer words: the permission prompt says "no rule allows or blocks this, so TALOS asks"; `/status` says
  "6 calls so far" and "context window unknown"; an error ends with "see talos …".

### Fixed
- Windows command output no longer shows a blank line between every two lines.
- A queue or reasoning line no longer loses its row when no agent is listed.

### Known limits
- Tested on Windows 11 x64 only; Node.js 24 (24.18 or later in the 24 line).
- A message sent while TALOS works (queued) and the messages of a resumed conversation still show a paste whole.
- After a quick search turn, "done" may show without its duration.

### Verification
- CLI unit suite: 1913 tests, 1909 pass, 4 skip, 0 fail. Acceptance on the built CLI in a synthetic terminal: 263/263.
- Every screen recorded in a synthetic terminal at 60, 100 and 120 columns, with a colour audit (WCAG contrast on the
  painted background) and no network traffic.

## talos-cli-v0.2.2 — 2026-09-27

`npm i -g talos-code@0.2.2`, or `talos update` to see it.

### How TALOS compares
Same turns for every agent, on the same machine, against a local stand-in model that answers at once (so what is
measured is the agent itself, not a model): a git repository of 6,000 files, the median of 3 runs, the whole run in
seconds. Lower is better.

| Turn | TALOS 0.2.0 | **TALOS 0.2.2** | Pi 0.84 | OpenCode 1.18 |
|---|---|---|---|---|
| No tool (start, one answer, exit) | 2.62 | **1.13** | 1.23 | 2.69 |
| Six file reads in one answer | 2.41 | **1.10** | 1.23 | 3.34 |
| Four project searches in one answer | 14.04 | **1.32** | 1.59 | 3.61 |
| Three shell commands in one answer | 6.98 | 3.81 | 1.94 | 4.17 |

TALOS is now faster than Pi and OpenCode at starting a turn, reading and searching. Shell commands are still slower
by choice: they run one at a time, each in a Windows sandbox, because the safety check of each command depends on what
the previous ones did. Measured on Windows 11 with `scripts/bench-harness.ts`, which anyone can run again.

### Changed
- Faster turns again. The `/undo` snapshot looks at the files of a folder together instead of one by one: a turn in a
  folder of 6,000 files went from 1.8 s to 1.25 s (1.4 s to 1.28 s in a git repository), on par with Pi.
- Long sessions no longer slow down at every tool result: the context archive is written once per tool exchange instead
  of after every result, and is no longer read back whole at every write. At 1,350 messages, a turn with six tools
  spends 24 ms on it instead of 160 ms.

### Fixed
- A search asked in the same answer AFTER a file write could miss what that write had just changed (0.2.1: the searches
  of one answer started together, before the write). Only the searches before any other tool start together now.
- Stopping a turn also stops a search that is still walking the project when ripgrep is not available.

### Known limits
- Tested on Windows 11 x64 only; Node.js 24 (24.18 or later in the 24 line).
- Shell commands run one at a time, each in its sandbox: the safety check of each command depends on what the
  previous ones did.

### Verification
- Hermetic bench (`scripts/bench-harness.ts`, a git repository of 6,000 files, local fake provider): a turn with no
  tool 1.13 s (Pi 1.23, OpenCode 2.69, Codex 0.50); six reads 1.10 s (Pi 1.23, Codex 1.98, OpenCode 3.34); four
  searches 1.32 s (Pi 1.59, Codex 1.71, OpenCode 3.61).
- CLI unit suite: 1879 tests, 1875 pass, 4 skip, 0 fail. Acceptance on the built CLI in a synthetic terminal: 263/263.
  The package proof (`scripts/prove-standalone.ts`): 16/16 on `talos-code-0.2.2.tgz`.

## talos-cli-v0.2.1 — 2026-09-26

`npm i -g talos-code@0.2.1`, or `talos update` to see it.

### Changed
- Faster turns in large folders. The workspace snapshot that makes `/undo` possible no longer reads, rewrites and syncs
  every file at every turn: a file that has not changed since the last turn reuses what was stored. A turn in a plain
  folder of 6,000 files went from 39 s to 1.8 s, and from 2.6 s to 1.4 s in a git repository of the same size. What
  `/undo` covers is unchanged.
- Faster and complete project search. `cerca` runs ripgrep, shipped inside the package for your platform (no download),
  and each match now comes with its line: `path:line:text`. Four searches over 6,000 files took 9.3 s; now about 0.2 s.
  Before, a search stopped after reading 5,000 files and could miss matches in a bigger project. Several searches asked
  in the same answer run together. Without ripgrep, the previous search still works.

### Known limits
- Tested on Windows 11 x64 only; Node.js 24 (24.18 or later in the 24 line).
- Shell commands still run one at a time, each in its sandbox; a start of about one second remains.

### Verification
- Measured on a hermetic bench (`scripts/bench-harness.ts`): a local fake provider, no network, TALOS against Pi, Codex
  and OpenCode on the same turns.
- CLI unit suite: 1876 tests, 1872 pass, 4 skip, 0 fail. Acceptance on the built CLI in a synthetic terminal: 263/263.
- The package proof (`scripts/prove-standalone.ts`), 16/16 on `talos-code-0.2.1.tgz` (1.76 MB); the installed package
  resolves its own ripgrep.

## talos-cli-v0.2.0 — 2026-09-26

`npm i -g talos-code@0.2.0`, or `talos update` to see it from 0.1.0.

### Added
- Watch a sub-agent live: Alt+A, then Enter on an agent, and its own transcript takes the main view as it streams,
  read-only. Esc goes back to your session without stopping the turn; an agent that finishes stays on screen as done.
  While agents work, the status line says "Alt+A to watch".
- A guided setup on the first launch: trust this folder, then a provider (a local engine that runs comes
  first), its key or local engine, and a model, one window at a time with "Step N of 4"; Esc skips, and only what is
  missing is asked. It ends with "Ready" and the model. `/setup` or `talos setup` runs it again.
- Sign in to OpenRouter without pasting a key: choose OpenRouter, then "Sign in with OpenRouter (browser)". TALOS
  opens the browser and waits on 127.0.0.1; on another machine, paste the code OpenRouter shows. Also
  `talos provider login openrouter` (`--paste` for the code). The key that comes back is tested and saved like a pasted one.

### Changed
- Forge is the default theme. A theme you chose stays yours.

### Fixed
- A sub-agent that needed your approval (a command, a write) used to wait forever with nothing on screen. Its
  approval now opens like any other and says it comes from the agent and its task; the answer goes to that agent.
- While delegated sub-agents work, the status line says how many agents are working instead of "thinking" with a
  running clock; any tool that runs silently without asking is shown as running.
- Changing the theme with `/theme` no longer throws the conversation away. Crossing the colourless `mono` theme used to
  restart the whole screen and lose the session.
- A turn interrupted while a tool was about to run no longer breaks the session: resuming it used to fail at every turn
  with `CTX_HISTORY_DIVERGED`. A session already broken that way now says so in plain words and offers `/fork`, which
  continues the conversation in a new session.

### Known limits
- Tested on Windows 11 x64 only; Node.js 24 (24.18 or later in the 24 line).
- Context compaction with a local Ollama model is not yet verified end to end.
- A local provider that answers 401/403 without needing a key can be set aside as if its key were wrong.
- The OpenRouter sign-in is tested against a stand-in for OpenRouter; the exchange with the real service follows its
  published contract.

### Verification
- CLI unit suite on the release tree: 1870 tests, 1866 pass, 4 skip, 0 fail. Acceptance on the built CLI in a synthetic
  terminal: 263/263.
- The package proof (`scripts/prove-standalone.ts`), 16/16 on `talos-code-0.2.0.tgz` (1.76 MB, 407 files): installed
  into an empty prefix outside the repository, hermetic profile, fake provider on 127.0.0.1; every loaded module
  resolved inside the package; nothing written inside the package; no stale build output; no outbound request.

## talos-cli-v0.1.0 — 2026-09-25

The first public release: `npm i -g talos-code`, then `talos`.

### Added
- An interactive terminal screen and a headless mode (`talos -p`, `--json`, `--output-format stream-json`) on the
  TALOS kernel, the same one the desktop runs, carried inside the package: it reads no file of a TALOS checkout.
- Providers from the TALOS registry (OpenAI, Anthropic, Google Gemini, DeepSeek, OpenRouter, Mistral, Groq, xAI and
  more) and local engines with no key (Ollama, LM Studio, llama.cpp). Keys are typed in hidden input and kept in the
  operating system's credential store; a key already in the environment is used only after you agree once.
- Per-tool permissions (allow, ask, deny) with six modes, project trust for hooks, MCP servers, plugins and commands.
- `/undo` restores the files a turn changed, from checkpoints kept outside the repository and outside Git.
- Sessions: `/resume`, `/fork`, export and import (an imported session never runs anything by itself), prompt history.
- Context: with a known window of 64k tokens or more, compaction at half of it, said on screen; after a summary the
  model did not write properly, automatic compaction pauses (60 s, 5 min, 15 min) and says so, while `/compact` runs
  at once.
- `/theme` with ten accents, `/help` by group, `/status`, `/retry`, `/copy`, `@` file completion that respects
  `.gitignore`, `Ctrl+R` history search.
- `talos update` asks the npm registry whether a newer version exists and prints the npm command; it changes nothing.
- `talos doctor` and a redacted `talos diagnostic bundle`. No telemetry.

### Known limits
- Tested on Windows 11 x64 only; Node.js 24 (24.18 or later in the 24 line).
- Context compaction with a local Ollama model is not yet verified end to end.
- A local provider that answers 401/403 without needing a key can be set aside as if its key were wrong.
- Reported by the owner after the release, to fix in 0.1.x: changing the theme can crash the process; resuming a
  session can end with `CTX_HISTORY_DIVERGED`; sub-agents cannot yet be opened to watch their conversation live, and
  the thinking counter keeps running while they work.

### Verification
- CLI unit suite on the released tree: 1839 tests, 1835 pass, 4 skip, 0 fail. Acceptance on the built CLI in a
  synthetic terminal: 246/247 on the aligned kernel (the one red is a known idle-frame flake).
- The package proof (`scripts/prove-standalone.ts`), 16/16 on the tarball itself: installed into an empty prefix
  outside the repository, hermetic profile, fake provider on 127.0.0.1; every loaded module resolved inside the
  package; nothing written inside the package; no stale build output.
- Installed from the registry after publication: `talos --version` answered `0.1.0`, `talos update --check` answered
  up to date.
