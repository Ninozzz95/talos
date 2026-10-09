# TALOS Desktop changelog

Format: [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/). Versions follow
[SemVer](https://semver.org/): in 0.y.z anything may still change. The version lives in
`package.json` and in the `desktop-vX.Y.Z` tag.

## Unreleased

## desktop-v0.1.25 — 2026-10-09

The first regular release after the 0.1.24 beta: installs of 0.1.21 and later receive it automatically (automatic updates
started with 0.1.21; the 0.1.22 and 0.1.24 betas were skipped by the updater on purpose). It hardens the local server
against other web pages and other local servers, lets you and the model decide which OpenRouter providers serve a model,
and makes long sessions, the sidebar and the terminal faster.

### Added
- OpenRouter: some providers are excluded by default for a model when they are known not to work with it (today:
  OpenInference for glm-5.3-flash, which does not call tools). The default exclusions are shown in OpenRouter's
  settings, can be removed with ×, and put back with "Exclude again".
- The model can list, exclude and allow OpenRouter providers from the chat; excluding or allowing asks you first with a
  card. An automation run cannot change them.
- Notes, tasks and memories are listed and written even with no session open.

### Changed
- The local server accepts changes only from the TALOS window (the same address and port) or the phone app, and answers
  only requests addressed to localhost: other web pages and other servers on the same computer (a project's dev server,
  for example) can no longer read or change anything, even on a server without the TALOS token.
- Saving OpenRouter's settings writes the provider list and the default exclusions together: all of it or nothing. A
  change the model makes with a card is saved the same way.
- One context measure everywhere: the size of the last call's prompt, like Hermes.
- A command moved to the background is shown as "in background", not as a failed retention.

### Fixed
- Switching terminal tabs no longer freezes the page for seconds.
- A session that ends elsewhere stops saying "running" in the sidebar within 2 seconds.
- Reopening a session saves the work mode once, not once per replayed turn; the chat no longer re-scans the conversation
  while it streams.
- A saved address equal to the default no longer says "Custom address".
- Two TALOS servers sharing the same data folder (for example a development server and the installed app) no longer take
  each other's shutdown token; a graceful shutdown removes its own file.
- Scrolling back to the bottom of a conversation resumes following the answer, even with reduced motion or a fast wheel.
- An open reasoning box keeps showing its latest lines while the model thinks, until you scroll up inside it.
- An underscore inside a word is no longer emphasis.
- The search palette no longer says "0 results" before anything is typed.

## desktop-v0.1.24 — 2026-10-08 (beta)

A beta: installs of 0.1.22 do not receive it automatically. It carries everything listed under 0.1.23 below (never
published) and adds a large round on agents, automations and safety: agents now work strictly inside your permissions,
automations can be created from any chat, and search never shows the contents of secret files.

### Added
- Delegated agents ask through their parent: a child's permission request appears in the parent session, a "yes for
  this session" given to the parent also holds for its children (never upward or sideways), a "Deny" set after a card
  wins, and a rule a child inherited is shown as inherited. A delegated agent can also ask you a question, with the card
  in the parent session.
- "Coordination": decides whether the model starts agents on its own. Off by default; when off, the model asks first
  with a card. A tree of agents has a total cap.
- Automations with two doors: create one from its page, or ask any chat and confirm a card. The card warns when the
  automation would do more than the chat it came from (another folder, more permission, Coordination). An automation
  may move its own next run time, but a change to its own instructions waits for your approval in "To review".
- OpenRouter: the answer says which provider actually served it ("via DeepInfra"). You can exclude that provider from
  the answer's "⋯" menu or from OpenRouter's settings. When every provider of a model is excluded, the chat says so and
  where to change it.
- "Show reasoning": show the model's reasoning, or keep only how long it thought.
- Native Anthropic effort by name, with a real "Max".

### Changed
- Search never returns secret files: no lines, no names, no counts from `.env`, private keys, `.ssh` and the like (the
  same files reading asks about). It says how many it left out. `.envrc` now counts as a secret file.
- Reading a file through a link (a symbolic link or a Windows junction) asks when the real file is a secret, and the
  card names the real file. Network and device paths are never resolved to check.
- A shell command that names a secret file through quotes, wildcards, variables or command substitution is recognised
  like the plain name, and asks.
- The server speaks English and hands the interface a key for every sentence a person reads.

### Fixed
- Notes, tasks and memories you write from the app are now saved in TALOS's data folder, where the list and the model
  read them. In the installed app they were saved next to the program instead: they did not show in the list, and an
  update could delete them. Ones written with 0.1.22 are not moved.
- Long sessions open behind a veil and land on the latest turn; the turn index lists every turn of a long chat.
- Background commands show up in Processes when they start, say when they really end, show their real duration, and
  stay stoppable until they exit; after a restart they show as "no longer tracked". The Processes count only counts what
  is alive.
- The Markdown export keeps the order in which things appear.
- A session reopened while the model reasons, or after a run died mid-answer, shows what was already there.
- Many permission fixes: "For this session" merges one tool instead of replacing the map, and a child never acts above
  its parent, even mid-run.

## desktop-v0.1.23 — 2026-10-05 (beta — NOT published: the release gates stopped the build on 2026-10-05, T-04 protection gate conflict; publication still pending, last published version is desktop-v0.1.22)

A beta: installs of 0.1.22 do not receive it automatically. The headline of this round: when the provider's
answer is cut mid-flight and its outcome is unknown, TALOS now retries on its own instead of leaving a dead
turn and a manual "continua".

### Added
- Automatic retry of uncertain provider outcomes (BUG-16): up to 10 guarded resends per turn, only when
  nothing visible has happened (no text delivered, no tool started, no tool call announced), each with a
  visible wait banner, an honest reason, and a Stop that wakes the wait immediately. When the budget runs
  out you get the explicit "outcome uncertain" card instead of silence.
- Read-only sub-agents whose provider response was cut get one safe resume of the same session (history
  intact, prefix cache preserved); their result always says whether they were relaunched, or why not.
- Stuck commands get a per-line "background" button, and timeouts now break through instead of hanging
  (default 120 s, tunable from 500 ms up to 600 s) (BUG-3/BUG-14).
- Provider-adaptive reasoning levels (BUG-18): the reasoning-effort level is mapped to what each provider
  actually supports — out-of-scale, empty or absent resolves to null instead of guessing, a level the provider
  cannot serve is refused up front rather than silently costing more, "xhigh" is a silent alias, and providers
  that mandate thinking keep a "none" floor. Mapping decisions land in telemetry notes, never in user warnings.

### Changed
- In Full access, terminal commands no longer ask for consent — not on secret paths, not for suspicious
  content, not for the once-per-session WSL-root approval. Delegated sub-agents inherit the permission
  (F-022), so they can no longer hang forever on a consent card nobody can see. Secret reads and every
  lower permission level still ask exactly as before; per-tool "ask" overrides stay sovereign (BUG-17).

### Fixed
- Approval prompts that went unanswered while the window was away are replayed to live clients, with a
  silence watchdog (BUG-8).
- The section list no longer goes stale after "Add" (BUG-11).
- The composer textarea scrolls instead of overflowing (BUG-12).
- Compaction: the real model window reaches the kernel, the summary input is bounded, and summary failures
  are classified and shown (BUG-5).

## desktop-v0.1.22 — 2026-10-03 (beta, published as a GitHub pre-release)

A beta: installs of 0.1.21 do not receive it automatically. TALOS now speaks English and Italian across the interface,
asks before reading or listing anything outside the project, and lets you queue a message that goes in right after the
current step.

### Added
- Every screen, dialog and fragment of the interface speaks both English and Italian, including the server's messages
  people read (Doctor, providers, web-search sources, GitHub, files, the approval card's sentence before a secret).
  A language gate keeps it so: no hard-coded text, no Italian sentence in the code, a pseudo-language check on every
  section, the open session and the main dialogs.
- The short description under each command follows the interface language.
- The model can list its sub-agents and stop one (with the ones it started); a sub-agent's result is never stuck behind
  a Stop, and the parent picks it up.
- A message queued while tools run goes in right after their results, in the same turn.

### Changed
- Reading or listing outside the project folder asks first; credentials always ask. With Full access only credentials ask.
- The kernel writes to the model in English.

### Fixed
- Opening the Terminal of a session whose folder no longer exists no longer brings the server down; the terminal says why.
- A sub-agent's suspicious result delivered in the middle of a turn still makes the next change ask for confirmation.

### Known
- A part of the server's texts is still being translated (lane K4b); a few kernel sentences for people (the WSL root
  consent, the local engine notice, provider notices in the chat) are still Italian only.

## desktop-v0.1.21 — 2026-10-02

TALOS now updates itself: it looks for a new version in the background, checks our signature, and installs it when you
close the app. The agent's commands get read-only tabs of their own in the Terminal, MCP servers can ask you for details
or to open a page, and the model can read Word, Excel, PowerPoint and PDF files.

### Added

- **Automatic updates.** Thirty seconds after start and then every four hours, the app looks for a newer desktop
  release, downloads it in the background and installs it when you close the app, or right away with *Riavvia ora*.
  Every update manifest is signed with our Ed25519 key, and the app checks the signature before downloading anything.
  A band under the title bar says when an update is ready; a card at the top of *Account, Doctor e backup* holds the
  switch, on by default. If a session is working, *Riavvia ora* asks before restarting. Preview builds are not updated.
- **The agent's commands in the Terminal.** Each turn of the agent gets a read-only tab, *agente · giro N*, with its
  commands one under the other: the command, its output and how it ended. The tab appears without taking the one you
  are using; its dot is green when every command succeeded and red when one failed; it can be closed but not renamed,
  and it is rebuilt when you reopen the session. The commands you type with `!` stay in the chat and in *Processi*.
- **MCP servers can ask you.** When a server needs details (a form with text, numbers, yes/no and choices) or wants
  you to open a page (a sign-in, a payment), the chat shows a card that names the server. The page opens only when you
  click, and what you type in the form goes to the server without staying on screen.
- **Office and PDF files can be read.** The model gets the text of docx, xlsx, pptx and pdf files, with Hermes' limits,
  instead of being told that they are binary.
- **A Stop for each command.** In *Processi* every running command has its own Stop. The model is told that you
  stopped it and not to run it again unless you ask, and the chat says *Annullato*, not that it failed. A command
  waiting for your consent says so and has no Stop; a command you typed is marked *tu*.
- On a first start with no provider ready, the Home shows *Imposta un provider*, which opens the Provider tab of the
  model lab. Ollama and LM Studio with a saved address count as ready.

### Changed

- **The floor for commands that cannot be undone is Hermes' in full, and looks behind wrappers.** Deleting the root,
  formatting a disk, shutting down and the like are refused at every permission level, now also behind `sudo -u`,
  `timeout`, `nice`, `env`, `eval` and similar wrappers, while the same words inside quotes no longer trigger it. The
  refusal says what the floor is and what it is not.
- *Scrive nel progetto* keeps writes inside the session folder, measured on the real path: absolute paths, `../` and
  junctions included. The path is measured again right before the write.
- Network paths (`\\server\share`) are never contacted without a yes. Reading, listing and writing ask first, with one
  card per file; a session folder on a share asks once per session.
- A delegated sub-agent gets its parent's permissions by default, and never more: under a read-only parent it starts
  read-only.
- The delegation graph uses the Workflow graph's controls and movements, and its minimap shows only when the graph does
  not fit.
- The default interface size is back to *Predefinita*, and the TALOS mark fills the orb.

### Fixed

- A command now ends when it exits, even if a program it started in the background keeps its output open; before, the
  reply waited and Stop did not end it.
- Editing a file that is not UTF-8 no longer damages it: a Windows-1252 file lost its accented letters for good while
  the reply said the rest was untouched. The edit is now refused and names the first byte that is not UTF-8, and file
  tools report sizes in bytes.
- In the Linux home, *Consenti in questa cartella* covers the whole folder, and a file changed by someone else while
  its approval card was open is not overwritten.
- On a worktree created by Git for Windows, Linux git's «not a git repository» is explained, with its cause and the fix
  (`git worktree repair --relative-paths`).
- A long delegation no longer fills the memory: its timeline is capped and each round costs the same as the first.
- The loading indicator of a long conversation shows from the click.
- In the chat, the outcome of a consent card (*Approvato*, *Negato*) and of an MCP card is again a small pill in its
  colour, and the reason on a consent card is small and muted. The retained-output reader keeps its size and speaks
  plainly; the command card no longer shows the line about retained output that is meant for the model; and the right
  side of a command row shows the command instead of repeating its description.
- Reopening a session no longer says «da un’altra finestra» for an answer given in this window, and no longer shows an
  invented duration for a command you typed.

### Known limits

- Automatic updates start with this version: from 0.1.20, install 0.1.21 by hand once.
- The outcome lines of commands are in Italian even when the interface is in English.
- The limits listed for 0.1.20 still apply, except the one about a background program keeping a command's output open,
  which is fixed.

## desktop-v0.1.20 — 2026-10-01

Commands and file tools now work in the same place: with WSL installed, a session's shell and its reads, writes and
searches run in the same Linux, using a Node.js and a ripgrep for Linux that ship inside the installer. Long files,
large projects, long web pages and command output are also easier for the model to read in full.

### Added

- **One place for commands and files.** With WSL installed and commands set to *Automatico* or *Linux (WSL2)*, the
  model's file tools — read, write, edit, list and search — run in the same Linux as its commands, through Node.js
  24.18.0 and ripgrep 15.0.0 for Linux bundled in the installer (hashes pinned and checked again when the package is
  built). Nothing is installed in your distribution. The model works with Linux paths; permissions, receipts and the
  Review show the Windows path of the same file. *Windows* keeps everything on Windows, as before.
- **The Linux user is stated.** The permissions sheet says which Linux user runs the commands and what holds on the
  Windows drives: there is no isolation, and `/mnt/c` is your Windows disk. A switch, on by default, uses a normal
  user when the distribution has one, and shows the command to create one when it has none. When a command would run
  as root and nobody would otherwise be asked, TALOS asks once per session.
- **Searches that keep going.** In a very large project a search is no longer stopped at 20 seconds and handed to a
  slower fallback: the reply shows what was found so far, the search keeps running in the session (at most two at a
  time, ten minutes each), and the model picks it up again by reference. Results come in pages. Folders inside WSL
  get 60 seconds, and when the system runs out of threads ripgrep is retried on one thread.
- **Long web pages are kept whole.** When a page is too long for the model, the full text is saved with the session
  and the note at the top of the page says exactly how to read the part in the middle. The saved pages are deleted
  with the session.
- **Files are read by lines.** The model reads up to 2,000 lines or 100 KB at a time and continues where it stopped;
  a single line too long to show is continued from the byte where it was cut. Binary files can be read as hex, and an
  empty file says that it is empty.
- **Command output that lasts.** The output of the model's commands is kept per session: it can be read back after a
  restart or a crash, viewed in its own panel, downloaded in full and deleted. Output that a Windows program writes in
  an OEM code page (cp850 in Italy, for example) can be read in that code page instead of being reported as binary,
  and the preview says when it is not faithful UTF-8.
- **Provider retries you can see.** When a provider fails, the chat shows the automatic retry with a countdown and a
  Stop, and the wait the provider asks for is honoured, in seconds or milliseconds.
- Long conversations open already scrolled to the end, behind a loading indicator, instead of being built in view and
  stopping above the last answer.
- A sub-agent's result in the chat is rendered as Markdown, with *Mostra tutto* when it is long.

### Changed

- The model must have read a file in full before it replaces it, and the file must not have changed since; otherwise
  the write is refused, with the two ways out (read it first, or edit only the part that changes). A replacement says
  that it replaced a file.
- A read-only session, and every workflow step, can still show an artifact but no longer copies it into the
  Library.
- The dialog that configures a provider has a single *Salva*: it saves the key you pasted and the changed address or
  timeout, closes, and confirms. Errors stay inside the dialog.
- *Riprendi il lavoro* on the Home lists your conversations, not the helper sessions of a delegation.
- Choice cards (permissions, web search source, model files) align their content to the top, so the titles in a row
  line up.
- When the context does not fit, a long first turn can be compacted inside the turn; your request stays word for word
  above the summary.
- The model is told how long a workflow run has been idle, not only how long it ran up to its last event.

### Fixed

- In the desktop app, *Accedi con OpenRouter* did nothing: the window only let github.com addresses reach the system
  browser. It now opens OpenRouter's sign-in page in the system browser, and only that page, only when the sign-in comes
  back to this app or shows its code on screen.
- A command that reaches its time limit now stops together with everything it started. On Windows the program under
  the shell kept running, and the reply waited for it to end by itself.
- Stopping a command that has already exited no longer targets its process id, which Windows may have given to
  another program in the meantime.
- In the installed app, a test run in a folder with no test suite reported success, because it started a second copy
  of TALOS. It now exits 127 and says that no test suite is configured.
- A Linux symbolic link on a Windows drive, which Windows cannot follow, is explained — where it points and what to
  do — instead of being reported as a permission error or a missing file.
- A local provider that answers 401 or 403 when no key was sent no longer reports a rejected key.
- An error whose outcome is uncertain says so, without claiming that the request was not sent. After a crash, an
  interrupted request is not sent again at startup, and what had already arrived is recovered.
- OpenRouter's 402 answers are told apart: a budget that is only temporarily committed is waited for; a key limit or
  exhausted credit is reported, never worked around with another key or provider.
- A tool that changes files no longer reports success when its reply is missing, false or invalid.
- A read inside a long line that hits an invalid byte says which byte it is and how to inspect it.
- Searches name the paths ripgrep could not read instead of reporting a generic error, and searches by file name are
  complete.
- Artifacts and Library cards keep pointing to the exact item they were made from.
- On Windows, a path that starts with a single slash, which can mean two different places, is refused instead of
  guessed.

### Known limits

- Running file tools in Linux needs WSL 2 and a project folder reachable from Linux. Under heavy load the WSL service
  can stop answering for about 30 seconds; TALOS retries once before its Linux process is ready and records the
  retry.
- A forked conversation reads its parent's saved web pages only after asking.
- If the app is killed, a search still running in the background ends on its own.
- On Windows, a command that leaves a program running in the background with its output still open (for example
  `start /b` in cmd) keeps the reply waiting, and Stop does not end it; in Linux (WSL) the reply arrives only at the
  time limit, and what the command printed may be lost. Use a separate terminal for servers that must keep running.
- The model has no tool to stop one of its own commands: Stop and the time limit do.
- TALOS records when an answer was cut by the output limit, but the desktop app does not show it yet.

## desktop-v0.1.19 — 2026-09-29

This release candidate addresses workflow results, chat attachments and settings lost after a
restart. It also adds visible history and output controls to the workflow Board.

### Added

- Non-image files chosen, pasted or dropped into chat are copied into the session workspace before
  they are attached. The UI waits for the upload receipt and passes the real relative path to the
  agent. Each file is limited to 25 MiB; collisions receive a distinct name.
- Workflow history can be searched and filtered by state. The Board opens a run by its exact ID,
  pages through its results and offers the complete text or an explicit download for binary output.

### Fixed

- A dependent workflow step can read a completed direct predecessor's result without gaining
  workflow control. Multiple results require an explicit selection; binary results are not decoded
  as text, and links are not downloaded implicitly.
- Results from delegated child sessions remain queued durably and wake an idle parent once with the
  pending results. Stopped or unsettled parents keep the results for explicit recovery.
- A request to enter Plan mode takes effect only after the turn and settings write succeed. The
  banner and next turn follow the persisted mode, including after a restart.
- A workflow start receipt opens the run it created, even when another run of the same version
  exists; ambiguous starts do not claim an unrelated run.
- System settings, including sidebar widths and chat/interface text sizes, persist across normal
  restarts. New profiles start with a large interface, default chat text and compact lists. The
  last recorded origin from a 0.1.18 installation is reused on upgrade without deleting older
  browser data.
- Chat file uploads use a bounded stream and a verified workspace root. The upload helper does not
  inherit server credentials, and Playwright reports no longer serialize the test server's full
  environment.

### Known limits

- Settings stored in origins older than the last recorded 0.1.18 origin, or in an origin without a
  reliable launch record, remain intact but are not imported automatically.
- A real Space Bunny Alpha run verified file reading, the exact answer and chat/model replay after
  reload. The other model-driven workflow, delegation and upload-to-reading scenarios have
  deterministic contract and browser coverage but have not all been certified with a live model.

## desktop-v0.1.18 — 2026-09-28

Same product as `desktop-v0.1.16` and `desktop-v0.1.17`, which never published: both release jobs
stopped at the install smoke, and a published tag is never rewritten, so this attempt gets a new
number. The fixes for those stops are the first four under Fixed.

The biggest release so far: the model can plan, ask and run workflows with you, the app reads your
files and your git repository, and the window and the installer become TALOS's own.

### Added

- **Workflows.** The model can propose a workflow — steps grouped in phases — as a short draft that
  the server compiles and checks. It appears as a card in the chat: you approve it (or change its
  limits, which makes a new version to approve), start it, and follow it in a diagram at the centre
  of the chat. Steps run as read-only sessions, several at once, and a failed step is retried
  according to why it failed. A run can be paused, resumed, cancelled, and its failed steps retried;
  after a restart, a run picks up where it was. The Agents column follows the same run.
- **Plan mode.** The mode selector offers *Normale* and *Piano*. In *Piano* the model presents a
  plan on a single card that updates in place, and you choose: proceed asking before edits, proceed
  accepting edits, proceed in a clean conversation, or keep planning with your feedback. A pending
  plan survives a restart. Sub-agents started before the switch keep working.
- **Questions from the model.** The model can stop and ask: up to four questions at a time, each
  with two to four options and room for your own answer. Questions come one at a time, a question
  survives a restart, and the sidebar shows which conversations are waiting for you. A time limit
  for unanswered questions is optional, in Settings.
- **File reader.** Files open in the right column, full screen, or from the Library: text, code,
  Markdown, CSV, images, PDF, Word, Excel and PowerPoint, and HTML pages (their scripts run, the
  network stays blocked, and the source is one click away). The type is told from the name and
  from the bytes.
- **The GitHub tab.** Your changes grouped as git sees them, with the diff of each file in the
  column; stage, unstage or discard a whole file or a single hunk; commit what is staged; amend or
  undo the last commit; create, switch, rename and delete branches; stash and restore; a history
  graph with what is incoming and outgoing, where a commit opens its own changes. Fetch, pull and
  push from the tab header — a push is never forced and always says where it goes. Pull requests
  through the GitHub CLI: see, draft, create and check them. A commit message can be generated
  with the session's model, or the commit handed to the agent. A folder that is not a repository
  offers **Initialize Repository**, as in VS Code: local only, no GitHub account needed.
- **Sections the model can use.** Your memories reach every new chat, and the model can list and
  search them by words; it can also search and read your notes, tasks and research, browse the
  Board, and find and read your past conversations, with a link that opens them.
- **A compact activity segment** in the chat: what the model did in a turn, summarised in one row,
  with a live phrase while it works, the failure pinned when there is one, and filters.
- **Context you can see.** A warning before the context fills up, a live bar while a summary is
  written, and a "X → Y tokens" row with Undo. The Context Manager button always opens its window;
  compacting asks first.
- **The window has its own title bar**: the window buttons follow the theme, and the "⋯" button
  opens the app menu.
- **An assisted installer**, in Italian: a welcome page, the AGPL licence with a plain summary of
  what it allows, install for the current user without administrator rights, and "Avvia TALOS" at
  the end. Uninstalling also removes TALOS's temporary files.
- A deep research shows a progress bar with its phase and real counts.
- An automation remembers the model it was created with, and says so.
- Forge is the default theme, and the theme studio lists it first.

### Changed

- The *Workflow* mode is retired: delegation and questions are tools of *Normale*. A session saved
  in *Workflow* mode opens with a banner that says so.
- Library and research files live in TALOS's own data folder, no longer inside your project folder.
- Providers and keys are managed only in the Model lab.
- Notifications sit at the bottom beside the composer, and climb over it only when the sides are
  full.
- The conversation is saved as small deltas with checkpoints instead of being rewritten: long
  sessions open and save faster, and a file cut short by a crash is repaired on the next start.

### Performance

- Reads the model asks for in the same answer run together, and they start while the answer is
  still streaming.
- Searches use ripgrep, and the git state is read from files when a session starts.
- A long workflow history replays in linear time instead of quadratic.

### Fixed

- **The installed app's local server now starts.** Packaging dropped `src/scratch.mjs`: a rule meant
  to keep scratch folders out of the package also matched that file's name, so the installed server
  failed five times in a row with "module not found" and gave up. It was invisible to the tests,
  which run the app from source; launching the packaged `TALOS.exe` before this release found it.
  The rule now applies only to folders, and a new test requires every production source file to be
  in the package.
- The install smoke recognises the app's uninstall entry. The installer registers it as
  "TALOS 0.1.18" (product name and version); the smoke looked for exactly "TALOS", found nothing,
  and its registry checks had been passing without looking at anything.
- The install smoke looks for the app where the new installer puts it. The assisted installer
  installs to `Programs\TALOS`, named after the product; the one-click installer used the package
  name, `Programs\talos-desktop` (electron-builder 26.16.1, `NsisTarget.js:179`). The installer
  had worked, and the smoke looked in the old folder and reported "installed EXE missing". It now
  also reads the folder the installer declares in the registry, and if the two differ it says
  where the app went. An update from an earlier version keeps its folder, because the installer
  reads the previous location first.
- A test of delegation from a local model no longer races with itself. The parent does not wait
  for its child, so the parent's next request — which repeats the delegated task inside its own
  tool call — could reach the engine first. The test took that echo for the child and stopped the
  child before it spoke, about one run in five. It now waits for the child's own request.

- An answer cut off mid-stream continues instead of ending the turn; an empty answer
  is no longer mistaken for an interrupted one, and a failed turn keeps the work it did.
- A reasoning level costlier than the one you chose is never sent.
- Reading a file stops at 1 MiB and says so, and a binary file's bytes never end up in the
  conversation.
- While following a streaming answer, the view never jumps up; a conversation that fits the screen
  no longer scrolls.
- The orb stops on Stop and on any error.
- Sessions can be created on disks without hard links (exFAT, FAT32, ReFS).
- A missing or failing local engine, a full context and a model too big for memory are each said
  for what they are, instead of looking like a provider refusal.
- Automatic compaction pauses after a refused summary, says for how long, and shortens the kept
  tail under pressure instead of giving up.
- Tooltips no longer reopen after a click; chip labels in the composer are no longer cut; select
  arrows use the icon.

### Verification

- The release gates, in the order the release workflow runs them, on this commit:
  - server: 4,643 of 4,653, 10 skipped, no failures;
  - kernel: 615 passed, 1 skipped;
  - frontend unit: 1,698;
  - desktop pure: 105;
  - the real Electron shell: 3;
  - the installer builds (156.6 MB).
- The packaged app, launched before tagging with the release smoke's own launcher and a separate
  data folder:
  - the page is ready in 1.6 s and health answers 200 with the cookie;
  - it closes in 1.2 s;
  - 648 MiB at rest.
  This is the step that found the missing module.
- The install and uninstall part of the smoke runs in the release job only. The machine that built
  this release has an earlier TALOS installed, and the smoke refuses to touch it by design.
- Known intermittent, not seen in this run: a test server can hit an internal libuv assertion while
  it exits after a clean shutdown (about one run in ten under full load).
- `kernel:controlla` still reports the declared divergence from the mobile kernel source (11,711
  lines against 6,260), as in `desktop-v0.1.15`.

## desktop-v0.1.17 — 2026-09-28 (tag only, no release published)

Its release job stopped at the install smoke: the smoke looked for the uninstall entry under the
wrong name. Everything it would have shipped is in `desktop-v0.1.18`.

## desktop-v0.1.16 — 2026-09-28 (tag only, no release published)

Its release job stopped at the install smoke, which looked for the app in the folder of the old
one-click installer. Everything it would have shipped is in `desktop-v0.1.17`.

## desktop-v0.1.15 — 2026-09-20

A day of fixes on what the chat *shows* you, and on one that was changing what it *told* you.

### Added

- A command's result keeps its two streams apart: **output** and **diagnostics** are drawn as two
  labelled sections instead of one merged run, so an `npm` progress notice no longer reads like a
  `git` error. The two sections are deliberately the same tone — **diagnostics are not a failure**, and
  many tools write progress and hints there. Only a non-zero exit code is a failure, and the tool row
  already says so.
- A command's outcome now says **where it ran**, in words: `on Windows, without sandboxing`, or
  `in Linux (WSL), not on Windows`. It had been silently dropped: the reader compared a short level
  name against a label that had since grown an explanation around it.

### Fixed

- **A command stopped by the time limit is no longer shown as successful.** The exit code the kernel
  writes when a command is killed halfway was not recognised, so the row's dot stayed green with
  nothing to contradict it. The sub-agent panel told a different story from the chat about the same
  call; they now read the same contract. The line also no longer claims *why* a command stopped: from
  where it is read, the cause is not knowable, and it now states the fact it has.
- **A test run that executed zero tests no longer reads as a passing test**, and the line that declares
  it is written once instead of twice.
- The outcome line **no longer appears on every command**. It was printed even on a plain success,
  where it adds nothing the row above does not already say — and stamping it everywhere is exactly what
  makes a real failure hard to notice. It now appears only when it has something to say, in Italian,
  and the raw technical header is no longer shown. The "Esito:" label above it went with it: one
  labelling level, not two.
- A file whose first line happens to read like an exit code is no longer mistaken for a command result.
- The sidebar footer stays at the bottom of the column on tall windows instead of floating up under
  the last session.
- "Reset" in Appearance no longer duplicates the preview panel.
- Dragging the composer's resize handle no longer lags on a long conversation.
- The commands list in the right-hand column leads with the description the model wrote, with the
  technical command as the secondary line — the hierarchy the chat already used.

### Verification

- Server 3,540 tests, kernel 611, frontend unit 1,451, desktop pure 81, and the real Electron shell 3:
  all green on this commit. The browser suite runs against the live server with the same known,
  pre-existing reds as `desktop-v0.1.14`, attributed one by one rather than counted.
- `kernel:controlla` still reports the declared divergence between the repository copy of the kernel
  and the mobile source (10,451 lines against 6,260). It is the same debt as in `desktop-v0.1.14`, not
  a regression, and it does not block this release.

## desktop-v0.1.14 — 2026-09-20

Release candidate assembled from the verified desktop worktree after the
`desktop-v0.1.13` comparison. This entry is published only with the installer,
runtime, and smoke gates from `.github/workflows/release.yml` green.

### Fixed

- Chat streaming keeps rendering smoothly while the conversation is scrolled;
  the scroll position remains user-controlled and the live response does not
  rebuild the entire message list on every token.
- Model Lab and the agent graph retain their real navigation/replay contracts,
  including model-page routes, download actions, persistent timeline state, and
  the graph/sidebar hand-off.
- The desktop package carries the same version in `package.json`, the lockfile,
  installer names, and release metadata so a tag cannot publish a mismatched
  binary.

### Verification

- Backend, kernel tests, frontend unit tests (1,447), desktop pure tests (81),
  and real Electron shell tests (3) pass on the release candidate commit.

## desktop-v0.1.13 — 2026-09-16

Same product as `desktop-v0.1.12`, which never published: its release job died building the
installer, and a published tag is never rewritten, so this attempt gets a new number.

### Fixed
- The installer now builds. The uninstall-page work added an NSIS variable used only by the
  uninstaller, but the installer build compiles the uninstaller in a separate pass (the template
  includes it only when `BUILD_UNINSTALLER` is defined); the variable was declared in both passes
  and used in one, and in this build every NSIS warning is an error — so the declaration now lives
  only in the pass that uses it. The 0.1.12 run died exactly there: the uninstaller stub compiled
  clean, then the main compile failed on `warning 6001` treated as an error.
- A failed build no longer masquerades as success. The build script printed its failure and kept
  going with a zero exit, so the release job's build step passed and the install smoke failed
  seconds later against a truncated installer, reporting the smoke's confusion instead of the real
  cause. Measured locally: the deep build failure loads `signal-exit@3.0.7` (via
  `proper-lockfile`), which replaces `process.reallyExit` and zeroes the exit code with
  `code || 0` when the process ends by draining the event loop — an instrumented run showed the
  code at 1 in `beforeExit` and 0 at process exit. The script now exits non-zero explicitly at
  the moment of the failure.
- Running all six release gates locally for the first time — a new rule after 0.1.12 — caught one
  more test describing the machine it was written on: the icon-fallback mutation check matched a
  regex against the message Node generates for a failed `assert.equal`, and Node's colored diff
  interleaves the compared characters, so the dead icon name stopped being contiguous and the
  check failed wherever colors are forced (this machine's shell) while passing on CI. The check
  now bites on the error's structured `actual` field, which does not depend on how the message is
  rendered.

## desktop-v0.1.12 — 2026-09-16

Same product as `desktop-v0.1.11`, which never published: its release job stopped at the
version-coherence gate (the package version was bumped without the lockfile), and a published
tag is never rewritten, so this attempt gets a new number.

Cure of the three findings from the engineering review of the keys work — no new features.

### Fixed
- With the desktop keyring scope, the installed app no longer falls back to the
  `OPENROUTER_API_KEY` environment seed: a provider without a key in the app's own keyring
  stays disconnected. Development from source keeps both paths.
- Two test files wrote scratch folders to real disk paths through the research orchestrator's
  disk-write ports; they now inject no-op ports.
- Coming from 0.1.10 or earlier, the first launch copies (never moves) your provider and
  search keys from the old keyring services into the app's `-desktop` namespace, pool and
  priorities included. Keys already in the app — or deleted there — are never touched: the
  copy happens once per machine (a marker file), providers with any trace in the new
  namespace are skipped, and a deaf keyring retries next boot instead of burning the marker.

## desktop-v0.1.10 — 2026-09-16

Same product as `desktop-v0.1.9`, which never published: its release job stopped at the
gates, and a published tag is never rewritten, so this attempt gets a new number.

### Fixed
- The gate that refused `desktop-v0.1.9` was the critical-tools hotfix transformer itself,
  failing closed exactly as its own guard test demands. Its last patch was anchored to a
  dispatch-ladder shape the kernel does not have: it sought `if (nome === 'leggi')` as the
  head of the chain, but the kernel dispatches `elenca` and `cerca` first, so `leggi` has
  been an `else if` at every commit the transformer ever existed in. That test lives in
  `test:puri`, which only the release job executes, so this release run was its first CI
  execution — the mismatch reached the tag undetected. Nothing unsafe shipped.
- The `prova` refusal now inserts as an intermediate branch of the chain the kernel
  actually has, still ahead of the legacy `prova` branch it must refuse; `elenca` and
  `cerca` never capture `prova`, so nothing about the refusal changes.

### Verification
- Full `test:puri` locally, 60 tests, 0 failures, 4 declared-premise skips, with the
  desktop dependencies installed the way the runner does; the transformer test applies
  the four HIGH findings to the real kernel, 2/2.

## desktop-v0.1.9 — 2026-09-15 (tag only, no release published)

### Added
- **Built-in assistance.** A new `/api/v1/assistenza` route answers questions about the product from
  the `docs/assistenza` corpus shipped with the repository, returning quoted sources for every claim.
  A question outside the corpus gets an explicit "I don't know" rather than an invented answer.
  Requests accept a single bounded `domanda` field (1–500 characters), and the route is listed in the
  HTTP inventory. The corpus carries its own adversarial verification script (`verifica-ancore.mjs`)
  that checks every quoted anchor against the page it cites.
- **Multiselect with one batch delete.** Library, notes, tasks, memory and research lists support
  selecting several entries and deleting them with a single confirmation. Partial outcomes stay
  visible — which items were deleted, which failed and why — and the failed ones can be retried.

### Changed
- Streaming renders smoother: the cursor and the fade reach the DOM on the next frame instead of
  accumulating, and the `desktop-streaming-red` workflow now also runs the STREAMING-LIVE-SMOOTH-03
  coverage.
- The improve-prompt panel gained clipboard copy; the voice module and the detail-list section were
  adjusted for the batch selection flow.

### Verification
- Full server suite (3028 tests) green on a fresh install; kernel suite 597/597; the fused parity
  spec runs the phase-3 flows (assistance against the real corpus, batch selection, smooth streaming)
  6/6 against a fresh build; the lab suite runs 135/135.
- The batch response keeps the refined #9 shape: counts live in `riepilogo`, per-item outcomes in
  `esiti[]`; the frontend reads exactly that shape, not the older flat draft.

## desktop-v0.1.8 — 2026-09-14

### Fixed
- Desktop response streaming now renders received text without the artificial fade/typewriter backlog. Embedded hosts retain their own animation preference.
- Prompt Enhance now uses the provider and model selected by the current session. Direct-provider sessions no longer require an unrelated OpenRouter credential.

### Verification
- Browser coverage checks streaming order and completeness, a final drain within two frames, embedded isolation, and the Prompt Enhance flow through the real HTTP route to explicit replacement in the composer.
- Provider responses in the browser integration test are deterministic fixtures; no live-provider quality benchmark is claimed.

## desktop-v0.1.7 — 2026-09-14

Same product as `desktop-v0.1.6`, which never published: its release job died at the gates. For the
seventh time in a row, not one of the failures was the product — all three were tests describing the
machine they were written on.

### Fixed
- A test handed a session the **system temp folder** as its workspace, and the registry puts a real
  watcher on a session's workspace. On a GitHub runner that folder has a short 8.3 name, libuv then
  fails an internal assertion and **aborts the process**, taking the whole file down with it — while
  the same file ran green locally. The fixture now lives inside the repository, under a folder git
  already ignores, which always has a long name. It is the same cure the watcher's own tests took on
  13/09; it had simply never been applied here.
- Two guard tests asserted as a hard premise that `/Users` and `src` answer yes to the disk. That is
  true on the machine where they were written and false on a runner working from `D:`. The premise is
  now declared, and the case is skipped with its reason when it does not hold. What those tests
  actually watch — a malformed folder is refused and no child process starts — is unchanged.
- One cache test relied on a new file moving the containing folder's mtime. It does on this machine's
  NTFS; it did not on the runner. The test now moves the mtime itself, so it measures the cache
  rather than the timestamp resolution of whatever disk it runs on.

## desktop-v0.1.6 — 2026-09-14 (tag only, no release published)

Everything below it was prepared and never reached anyone: `desktop-v0.1.5` was written but never
tagged, and the five tags before it stopped at the gates. This one carries all of that work plus
what the product gained since.

### Added
- **A message queue that belongs to the session, not to the window.** Type while a run is going and
  the message waits its turn; open the same session in another window, or reload, and the queue is
  still there with its position. After you stop a run the queue says it is paused instead of
  promising to send at the end of a turn that is no longer running.
- **The model can edit a file** instead of rewriting it whole, and that edit asks for its own
  permission.
- While the model is thinking you now see **one** indicator, and it says what the model is thinking
  about. That reasoning is **compressed rather than hidden**, and it survives a reload — reopening a
  session no longer loses how much the model reasoned.
- `TALOS_MCP_STARTUP_CONCURRENCY` (1..8, default `1`): how many trusted MCP servers start at once
  when a session begins. Starting a server is waiting, not computing, so raising it shortens
  startup when you trust several servers. Off by default, and any malformed value falls back to `1`
  rather than refusing to start.

### Fixed
- Changing your mind mid-run is no longer treated as a failure: no red card, no error wording, and
  pressing Enter twice does not redirect the run any more.
- A session that is still alive reopens as alive, phantom turns no longer appear in the list, and a
  stopped run does not colour its tick red.
- The terminal kept its whole output in memory when a single burst was larger than the declared
  200,000-byte cap — a `cat` of a big file, for instance. The cap now holds in that case too, and
  the trim never splits a UTF-8 character, so nothing the shell never wrote can appear on screen.
- A terminal watched from a second window was treated as abandoned and killed ten minutes later.
  "Orphaned" now means nobody is watching it.
- Two overlapping scheduler ticks could start the same automation twice — two real, paid sessions.
  One turn at a time now.

### Security
- File names coming from the model can no longer step outside the Notes, Tasks and Memory folders.
  Confirmed live before it was fixed: a delete removed a file outside the store.
- `.mcp-trust` and `.plugin-trust` are control files, like `.hooks-trust` already was. Without that,
  a write tool could grant itself trust for MCP servers and plugins with no approval.
- Exporting a Library file into the workspace now reads bytes as bytes. A `.docx`, a `.pdf` or any
  other binary used to arrive irreversibly corrupted while the tool reported success with a byte
  count that was not the file's.

### Changed
- Release notes are now written in English, like everything else that gets published, and they
  carry this changelog section. A tag whose version has no section in this file is refused before
  the build starts.

## desktop-v0.1.5 — 2026-09-13 (never tagged, no release published)

Carries everything below. The five tags before it published nothing, and not once was the product
at fault: every time a test or a build script described the developer's machine instead of the
software.

### Fixed
- The release smoke test could not start on a clean CI machine. It asked the system for the Node
  executable and passed the answer straight to the process launcher, but a machine with more than
  one Node on its path answers with a list, not a single path. The developer's machine has exactly
  one, so the fault was invisible here. It now takes the first match, the one the path would pick,
  and refuses to continue if there is none.

  Worth recording: the run that found this had already installed the application in 81 seconds,
  started it, closed it and uninstalled it, leaving no stray processes, no shortcuts and the user
  data intact. The product passed. Only the script that watches it did not.

## desktop-v0.1.4 — 2026-09-13 (tag only, no release published)

Carries everything below. The four tags before it published nothing: their release jobs stopped at
the gates, and a published tag is never rewritten, so each attempt gets a new number. Not once was
the product at fault: every time it was a test describing something other than the software.

### Fixed
- Two browser tests that had been failing for days. The first refused an image the app serves at
  runtime, because the test's bundler read the address as a path on disk; addresses are now left to
  the network, exactly as fonts already were. The second waited for a message the product no longer
  writes: the component's wording changed twice after the test was written, so the test hung for
  thirty seconds and reported only a timeout. It now expects what the product actually says, still
  as an exact match, so it fails again if that path stops working.
- Both of those gates now name what they refuse and what they saw instead of failing silently.
  The silent version cost two release attempts before the cause was visible.

## desktop-v0.1.3 — 2026-09-13 (tag only, no release published)

Carried everything below it at the time:

### Fixed
- Test teardown on Windows. A test deleted its temporary folder and the deletion failed with
  "directory not empty", because a file handle closes a few milliseconds after the test ends. The
  same test passed locally and had passed on the previous CI run, which is what a race looks like.
  The deletions in that file now retry briefly, using the options the runtime provides for exactly
  this case, and still fail loudly if the folder never empties. The rest of the suite does the same
  unretried deletion in many other files and is recorded as open work.

## desktop-v0.1.2 — 2026-09-13 (tag only, no release published)

Carried everything below it at the time:

### Fixed
- A test wrote into the drive root and, on a machine where that succeeds (a CI runner running as
  administrator), reached a cleanup path that used a function it had never imported. It now
  imports it, and says out loud that the premise about drive-root permissions does not hold there.
- The folder watcher tests no longer build their fixture inside the system temp folder. On GitHub
  runners that folder has a short 8.3 name, and libuv then fails an internal assertion and
  **aborts the process** instead of failing a test, taking the whole suite down with it. The first
  attempted cure was wrong and is documented as such in the test: resolving the real path does not
  expand short names on Windows. The fixture now lives inside the repository, under a folder git
  already ignores, which always has a long name.

## desktop-v0.1.1 — 2026-09-13 (tag only, no release published)

Compared with the `desktop-v0.1.0` tag:

### Fixed
- Release pipeline: tests that measure the development repository (per-folder agent
  instructions, mockup fidelity, a benchmark against an old commit) now declare themselves
  skipped in the public tree instead of failing; tests that assumed the owner's machine
  (short 8.3 temp paths, a non-writable drive root, Italian PowerShell messages) now hold on a
  GitHub runner too.
- `labs/feature-flags.json` ships with the package: it is product configuration read by the
  server (`TALOS_LABS`).
- First-run: with the local engine selected and no model on disk, the setup screen listed the
  cloud catalogue; it now lists only local models and says when there are none.
- Downloading a model without a licence field answered "Internal error"; the request is now
  rejected up front with the missing field named.
- The session list showed the raw local model identifier (`local:…-gguf`); it now shows a
  readable name.

## desktop-v0.1.0 — 2026-09-13 (tag only, no release published)

**What it does not do yet:** it is not code-signed (Windows shows SmartScreen), it does not
update itself, it ships no GGUF models (download them from the app), and it has not been tested on
Windows 10 1809 nor on a machine without a Vulkan driver. With very small models a run that uses
a tool may stop at the second turn.

### Added
- **Electron 44.3.0** shell of the same TALOS interface, with Node included, local service,
  kernel and context engine.
- **Per-user NSIS installer**, no administrator rights, **unsigned**, plus a complete zip; user
  data is kept after uninstall.
- **llama.cpp b10517** engine, CPU and Vulkan builds, bundled and verified by SHA-256; GGUF
  models are not bundled.
- The local engine is chosen from the machine: Vulkan only if it lists a device; if the card is
  missing or lost while loading, the model restarts once on the processor; **Local engine** menu
  (Automatic · Graphics card · Processor); engine state in the Model Lab.
- Windows release workflow for `desktop-vX.Y.Z` tags: regression gates, build, silent install /
  start / reload / uninstall smoke test, SHA-256 sums and provenance attestations.

### Changed
- Project licence: **AGPL-3.0-only** across the monorepo; third-party components keep their own
  licences.
- The public repository is a monorepo: the mobile app in `mobile/`, the desktop in `harness-ui/`
  and `context-engine/`.

### Security
- No telemetry. Remote providers and model downloads use the network only for that action.
- Renderer without Node or preload, context isolation and sandbox on, navigation and new windows
  outside the local origin blocked (official Electron security checklist).

### Measured (owner's machine: Windows 11 Pro 26200 x64, Ryzen 7 7800X3D, ~32 GB RAM)

| Measure | Value |
| --- | --- |
| Installer | **145.0 MiB** (152,067,178 bytes) |
| RAM at rest, shell + service | **611 MiB**, 10 s after the page is ready |
| First visible window | **3.82 s** from the instrumented launch of the installed executable |
| Download of a 639 MB GGUF from Hugging Face, checksum verified | 15 s |
| Model load on Vulkan (0.6B, Q8_0) | 2.1 s |
| First response token, local model, no tools | 125 ms |

Times are measured with Playwright and do not include a manual double-click or SmartScreen;
they are not a guarantee on other machines.
