# TALOS Desktop changelog

Format: [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/). Versions follow
[SemVer](https://semver.org/): in 0.y.z anything may still change. The version lives in
`package.json` and in the `desktop-vX.Y.Z` tag.

## desktop-v0.2.3 — 2026-11-17

### Added

- **Privacy: on its own, TALOS Desktop goes online only for what you leave on.** The public model list from OpenRouter is
  now off by default: TALOS reads it only after you pick an OpenRouter model, add an OpenRouter key or turn it on in Settings →
  Security and privacy → Public model list. While it is off, the model picker uses the list built into TALOS and says so
  («built-in list»); with the switch off, picking an OpenRouter model or adding its key is your choice to use OpenRouter, and
  TALOS reads the list again (one request when the window opens). If a read fails, TALOS tries once more after 30 seconds, then at most once every 10 minutes. The assistant can change it too, always with a card. An
  administrator can keep it off for the whole computer with `TALOS_HARNESS_UI_CATALOGO_PUBBLICO=off`: then there is no request
  for the list at all, even with an OpenRouter key and an OpenRouter model chosen. The automatic update check (Settings →
  Updates → Automatic updates) can be kept off the same way with `TALOS_DESKTOP_AGGIORNAMENTI=off`. A setup tool can turn both
  off with a `preferenze-iniziali.json` file in the TALOS data folder, read at the first start that finds it (shape in
  `harness-ui/desktop/PREFERENZE-INIZIALI.md`). What TALOS Desktop sends on its own, and to whom, is in the privacy policy,
  PRIVACY.md at the root of the repository; it does not cover the TALOS CLI or the phone app yet.
- **Doctor: «Test the local engine».** A new row of the Doctor sends the local model one minimal request (a single token)
  and says whether it answered and in how long, or that it did not answer within 30 s. The test goes only to the model that
  is already loaded and awake: with models installed but none loaded it says «No model loaded» and does not load one; when
  the loaded model is asleep after a pause it says so and does not send the test, because it would wake the model up (only
  one local read of the model list, GET /models, goes to the engine at the click, and it neither loads nor wakes the model);
  with no local model installed it says so, downloads nothing and leads to the models you can download. It runs only from
  the PC window, never from the phone.
- **Settings: the search also finds the names of the choices.** Typing «English» or «Italian» finds the menu language,
  «French» or «Japanese» the reply language; the names work in English and in Italian whatever the language of the menus.
- Outside Full access, a shell command that names the computer use settings files now asks you first. The assistant's
  file tools (write and edit) ask you first for these two files at every permission level, Full access included.
- **Outside Full access, TALOS puts back the computer use settings if a command changes them.** Shell commands and test
  runs are both checked before and after they run. A change is moved aside next to the file (never deleted), the approved
  version comes back, and you get one line in the chat of that command. The approved version is also remembered in the
  system keychain, and TALOS checks the files every time it starts: a change made while TALOS was closed is moved aside
  then. If no approved version is saved yet (for example right after updating from an older version), the files are moved
  aside and computer use stays off, with one notice, until you turn it on once more. If the keychain can't be read or
  saved, computer use stays off. In Full access TALOS does not step in on a command: what the command leaves becomes the
  approved version, with no copy and no notice; a change made between two commands is still put back before the next one.
  Two exceptions keep Full access to its own conversation. First: if a command in another conversation, not in Full
  access, is running when the Full access command ends, the change is moved aside and put back and the notice goes to
  that other conversation, never to the one in Full access. A command left running in the background counts as running
  until its own process exits, also after TALOS restarts; when it exits, TALOS checks the files again as at the end of
  any command. Second: while computer use is off because no approved version is saved yet or the keychain can't be read
  or saved, a command in Full access does not turn it back on: only you do, in Settings or on a card. With no approved
  version saved, a file that a command in Full access writes is moved aside, with its copy and one notice in that chat.
  This counts for each file on its own, also when its approved version is «no file»: if you turned computer use on but the
  remembered places file was never created, a command in Full access that creates it has it moved aside (one copy, one
  notice in that chat) and computer use stays on.
  TALOS keeps the last 10 changed versions of each file, never removing the newest.
  Computer use always works from the approved version, never from the file on disk.
- **«No to this tool until your next message».** In the «⋯» menu of the question of a connector, plugin or Tool Forge
  tool (or with a right click on it): the assistant cannot use that tool again, with any details, until you write to it
  or answer one of its questions, and it is told that you said no. It allows nothing and does not change your
  permission mode. A no that does not come from you (a rule or an automatic answer) never turns it on.

### Changed

- **The «A lato» tab is now the «Assistant».** It answers questions about the chat while the agent works, and it can only
  read: files of the chat folder, the command outputs and the transcript, the git status, diff and history, the context and
  the spend (when the chat has no tools loaded on demand, it answers from the conversation and says so). It cannot write,
  run commands or change anything. Its answers look like the chat's (tables, code, bold), and a
  `file:lines` reference opens a peek of those lines; in the chat the same reference opens the file in «Files». Three ready
  questions are under the field, one click asks. Questions and answers are now saved with the chat and come back after a
  restart. Under the field you always see what the Assistant spent in this chat and in all chats, also at $0.00. Secret
  files recognised by name (keys, credentials, `.env`) are refused and never shown, and files outside the chat folder only
  if the agent already read them, judged on the real path (a link or a short name that leads outside counts as outside).
  Because it reads the chat, every web address it wants to open first shows you a card with the full address, also in Full
  access, and says when the address seems to carry text it read: with a no nothing is sent. An address longer than the card
  can show (4,000 characters) is refused and the list of what it did says why. After two no's the question stops with one
  line, like the chat. Without a web search provider the Assistant does not search the web at all, and no card asks you
  about it. The panel says «I read this chat and its files only when you ask», keeps its «Read-only» pill at every width,
  and counts the files it read the same way in the header and in «Last turn checked». The panel has its own Stop, and
  the chat's Stop ends its question too. A question asked from another window shows up in the panel while it runs. What it
  read is listed in plain words with your local time («read src/a.js, lines 1-60»), each answer has references to the
  message, the step or the file it looked at, and «Last turn checked» says what the last question read. It uses the chat's
  model by default: you can pick another one, in the cloud or on this PC, from the panel or from Settings, Memory and
  context, Assistant; a model on this PC waits for the turn to end. An exported chat writes its questions and answers as
  text. Wide answer tables wrap or scroll inside their box.
- **«Full-width questions» is now on by default.** The questions you send in the chat take the full width of the chat, like
  the replies. If you never changed it, the update turns it on. If TALOS has a record that you chose «off» (you asked the
  assistant, you used `/settings`, or you undid a change that had turned it on), it stays off. Turning it off with the
  switch in Settings of an older version left no record, just like the old default, so it turns on: turn it off again in
  Settings, and from this version on the choice stays.
- **Computer use: a click by coordinates on a confirmation window now goes, after a card.** In 0.2.1 a click on a point with
  no readable button under it was not carried out: in Normal it asked a card and then did nothing, in Full access it stopped
  the task. Now TALOS judges it by the strongest button of the window (send, payment, deletion), asks the card that button
  needs, and clicks. Whenever something that pays shows on the screen, a click by coordinates with nothing under it asks the
  payment card, inside or outside a checkout and even with another window open (a cookie banner), in Normal and in Full
  access; on a checkout page the same holds when only the page itself or a container is under the point (a click 5 px beside
  «Paga ora»). A button, or a link, a text, a picture or a field whose whole name is a command to pay («Acquista ora», «Paga
  ora →», «Pay $49.99», «Buy with Google Pay») counts; «Checkout», «PayPal» or «Come pagare» in the menu of a shop do not, and
  the 20 typical computer-use tasks (19 without a payment) ask the same cards as before. Outside a checkout a click on the
  page beside a button that pays still goes without a card, as in 0.2.1. A button or a link named only «Paga» or «Pay» is
  the exception you chose on 11/11: a click on it, or on the page within 5 px of it, asks the payment card, in Full access
  too; farther away the click goes as before. Only buttons, links and whatever behaves like one count (an element the screen
  reader reports as pressable, such as a clickable box): «Paga» written as plain text asks nothing, beside it or with nothing
  under the point. A page whose title starts with «Cassa» («Cassa - Negozio», «Cassa / Negozio», «Alla cassa») counts as a
  checkout, as «Checkout» and «Pagamento» did; «Registratore di cassa - Wikipedia», «INPS - Cassa» or «Cassa integrazione»
  do not. Over 10 typical payment tasks: 10 payment cards in Normal and 8 in Full access, plus 7 and 8 questions of the
  checkout guard, 17 and 16 questions in all (0.2.1: 17 and 10, when 6 of the 10 tasks stopped halfway). Under a spending
  limit, a step on a checkout that does not say it pays («Avanti») only reserves its sum in the limit; the button that pays
  the same sum on the same site is not asked again, and the log says «paid» only when that button goes.
- **Computer use: at most 3 sends for each yes, beyond the one you approved.** In 0.2.1 one yes to a send covered every later
  send on the same page: 20 sends asked once. Now a yes covers at most 3 more sends to the same recipient, then TALOS asks
  again: 20 sends ask 5 times, whether the model clicks «Send», «Submit» or a button that shows only an icon, presses Enter
  or Ctrl+Enter in the message, or clicks by coordinates on a confirmation window. A yes covers the place where you gave it:
  the same button (also pressed with Enter, by a click on its confirmation window, or with the window's own shortcut such as
  Alt+S), or Ctrl+Enter in the same message or chat field. Another button such as «Publish», Ctrl+Enter or Enter in another
  field, opening an address that carries your data, dropping a file on an upload area, a program that goes on the network or
  an exit action ask their own card.
- **Computer use: the recipients are read whole, and a change asks again.** In 0.2.1 the recipient was read only from the
  title of the conversation, so six different addresses in the «To» field asked once. Now TALOS also reads the «To», «Cc»,
  «Bcc» and «Recipients» fields (also «Cc recipients», «Bcc recipients», «Cc/Bcc» and drop-down lists), every entry in them,
  and the name tags shown next to an empty «To» field: six addresses ask six times, and a name or a group next to the same
  address («Tutti i dipendenti», «and 3 more») or a recipient moved from Bcc to To asks again. Recipients that change while
  the card is open stop the send, and the next card shows the new ones. The same address written another way (capitals,
  spaces, a «;», a final dot, a name before it, «Rossi, Mario <…>») and the same names in another order are still the same
  recipient. A send to a person named in your words goes without a card only when every recipient on the screen is that
  person.
- **Computer use: the card of a send says who it goes to.** In 0.2.1 the card said only «a send or submit». Now it lists
  every recipient field with all the names read on the screen, never «and N more»; a list too long for the card is shown
  whole next to the choices, and the panel says when it scrolls. Past 2,000 characters or 20 lines of names the card says
  the true number of recipients, counted on the whole field, and that it does not show them all; a button opens the whole
  list, and «Allow», chosen or written in «Other», goes only after the list has been opened on the PC. When the recipient
  cannot be read, or the screen itself shortens the list, the card says so; the heading of a new-message window («New
  message», «Nuovo messaggio») is not shown as the recipient.
- **Computer use: when the model asks several sends at once, your yes covers exactly the sends you saw.** In 0.2.1 one
  answer to the list of a group of sends covered all the sends after it: 40 sends in groups of 10 asked once. Now each send
  in the list goes once, to the recipient the question showed, and anything else asks again: 40 sends in groups of 10 ask
  4 times. This costs more questions when the model sends in small groups: 20 sends in groups of 2 ask 10 times (once in
  0.2.1). When the model writes a different recipient into each send of a group, every send asks its own card after the
  question of the group: 20 invitations in groups of 5, each to another address, ask 21 times (once in 0.2.1).
- **Computer use: fewer loops that run to the step limit.** A model that keeps rewriting the same field while «Save» is
  refused is stopped at its 5th request; a click that does nothing, repeated in front of a refused button, at the 6th (both
  ran to the step limit, 20, in 0.2.1). A button that appears a moment late inside a group of actions no longer stops the
  task: a reader of 16 pages reaches the end (0.2.1 stopped at page 1).
- **The computer use settings ask you even in Full access.** Writing or editing `.computer-use-impostazione.json` or
  `.computer-use-luoghi.json` with the assistant's file tools now shows the card in Full access too, and only your yes
  counts (up to 0.2.1 included, Full access wrote them without a card). The other control files keep no card in Full access.
- **When the assistant calls the same tool of a connector, plugin or Tool Forge several times in one answer, you get
  one question instead of one for each call.** The question shows how many calls it covers («8 calls in this reply»)
  and lists every call, numbered, with all its details; past three calls, the rest opens with «Show all». «Allow all»
  and «Deny all» answer for all of them at once. A call with more details than the question can show whole (more than
  12, one longer than 300 characters, or one whose name is longer than 64 characters; lengths count UTF-16 code units,
  so an emoji or a rare character counts as two) never shares a question: then
  every call of that tool asks on its own, and if a list ever leaves details out it says how many («+2 fields»). A long
  name of a detail goes on more lines and never hides its value, on this question and on the question of a call the
  assistant wrote as text; the same wrapping applies to the questions of the automations. A call that needs your
  attention on its own (for example when your data could leave the PC) still asks on its own question. These questions never cover several calls:
  a connector tool that its connector does not declare as not destructive (a tool declared only «read-only» included),
  the deletes that always ask, computer use, and a reply in which two calls carry the same identifier. On the phone and
  in the command line each call of these tools asks on its own question (up to 0.2.1 the tools of a connector, a
  plugin or Tool Forge did not ask at all).

### Fixed

- **Typing in a long chat is lighter.** In chats with thousands of turns every letter typed in the message box redrew
  the whole right column (turns, tool events, agent tree), and every key searched the whole page for an open dialog. Now a
  letter only grows the box; the box and its buttons are updated when the text goes from empty to written or back, or
  starts or stops with `!` or `/`, and the column is redrawn by the events that change it. Measured on a chat of 3000
  turns with a turn running (3 commands, 2 agents, Processes tab open, CPU slowed down 4 times): 60 letters drew the column
  61 times before and 3 times now (once for each 5-second reading of the commands' CPU and memory), and the 95th percentile
  from key to painted frame went from 1376 ms to 208 ms. It is not yet under 16 ms, and no key gets there yet: every key
  still costs the browser's own style and layout work on a page of 70,000 elements, and while agents or commands are
  running each of their events still redraws the whole column (with them, the 95th percentile stays about the same,
  above one second). Both come with the next block (the column redrawn by difference, and a cap on the turns kept on the page).
- **The Processes and Agents tabs no longer rebuild themselves when nothing changed.** A redraw with the same data now
  leaves the tab as it is: 200 equal redraws went from 4400 and 10600 rebuilt parts to 0. The «running for» time of a
  running command keeps counting.
- **Opening a long chat no longer reads the chat list once for each permission request.** While the history of a chat
  loads, each permission request, question or MCP request in it, and each answer, asked the server for the whole chat
  list again: a chat of 200 turns with 400 such events made 403 reads. Now the list is read once when the history ends (4
  reads in all), a request during a live turn still reads it, and requests made while a read is running share it.
- **The activity clock no longer searches the whole page every second.** It keeps the places it updates: from 3-4 searches
  of the whole page every 3.5 seconds to 0.
- **A web page made by the model can no longer take the others down with it.** Each page shown beside the chat, in the file
  reader or in its own window now runs on its own. If one stops working, the others keep going, and TALOS reloads it once by
  itself. If it stops again, the page leaves its place and you see «Page not loaded.» with «Try again» (under the artifact card,
  or in the reader). A page in its own window that stops twice stays open and says «Page not loaded.», «It stopped working
  twice. Try again, or open it again from its card in the chat.», with «Try again». Nothing leaves the PC in the meantime.
  To do this, each page now opens on a local address of its own, used only by TALOS on this PC and never looked up on the
  network. TALOS refuses any call that such a page makes to the rest of the app.
- **A page in its own window whose pass has expired no longer shows a raw error.** It says «Page not loaded.», «It could not
  be loaded. Try again, or open it again from its card in the chat.», with «Try again».
- **A page beside the chat that was idle for more than half an hour comes back when it reloads.** Its reload now asks for a
  fresh pass to the page, like the file reader already did, instead of reusing one that had expired.
- **The same network protection when the app address is written another way.** A page made by the model and opened through
  `localhost` or `[::1]` instead of `127.0.0.1` gets the same block on the network as the others.

- **Settings: «/» and Ctrl K wait while a panel or menu is open over the page.** With the ChatGPT plan panel or the «⋯»
  menu of a conversation open over Settings and the focus back in Settings, «/» moved the focus to the search under it
  and Ctrl K opened the commands: now they do nothing until it is closed, as with the notifications panel.
- **Doctor: «Export» writes each rechecked row once.** After «Check this one again» the file carried the whole new check for
  every rechecked row (30, then 62, then 94 KB, with values of rows the page does not show). Now a rechecked row carries
  only the data of that row and its own time, once: a small row adds about 0.1 KB, the providers row about 29 KB, and
  checking the same row again does not make the file grow.
- **Doctor: the result of a rechecked row is written in lower case inside the sentence** («Check run again: now failure.»,
  not «now Failure.»).
- Saying No with a reason on a control file card, or an automatic answer from a rule or a mode, no longer lets the write through.
- **From the phone, a chat continued somewhere else opens with what was written there.** If the chat was continued in
  another TALOS window or in the terminal, the phone now opens it with that new part and stays in step; before, it showed
  only what this PC had in memory. Reopening after the last event the phone saw brings only the part written elsewhere.
- **From the phone, a chat opened again gets every event once.** When the phone asked again for a chat that had changed
  elsewhere, the same events could arrive twice (measured: events 1 to 7, then 3 to 7 again); now each one arrives once.
- **From the phone, a chat deleted while it opens answers «not found».** Before, the phone opened it empty and silent.
  The app on the phone (0.1.48) shows «The session no longer exists» and does not retry by itself.
- **The engine on the phone no longer continues a half-written reply of the Assistant.** The phone engine does not resume
  an unfinished reply, so TALOS no longer sends it one to resume and asks for a new reply instead; the engine on the PC
  still continues it.
- **Computer use: what you do in the bubble now reaches TALOS.** «Stop» in the bubble stops the task (it did nothing);
  a message written in the bubble goes to the running task, like one written in the chat while TALOS works (it was lost);
  the computer use card also shows in the bubble, with the same question and choices as in the chat, on purpose: you
  answer where you are looking, one answer is enough, and it closes the card in both places (until now a card answered in
  the bubble was lost, and the task waited up to ten minutes). A choice that needs the full list opened first («Allow» in front of a long list of recipients) stays in the
  chat; the bubble shows the other choices and «Open in TALOS». A message written in the bubble when no task has run yet
  goes nowhere.
- **Computer use: the bubble says which element TALOS is about to use.** Before a step the bubble showed «[object Object]»;
  it now shows the element's name («Save»), and keeps the sentence it had when the step has no named element.
- **Computer use: only one cursor on the screen.** The PC helper turns its own cursor off only while the TALOS cursor is
  shown, so it can no longer draw a second cursor next to the TALOS one. The page of the TALOS cursor now tells TALOS,
  twice a second, that it has drawn the cursor, and TALOS counts its cursor as shown only after that signal has come from
  every screen (before, it counted it as shown even before the page loaded, so a page that loaded but drew nothing, or
  froze, left no cursor at all until TALOS restarted). If the signal stops for 2 seconds, Windows says the page is not
  responding, or the page's process ends, TALOS hides its cursor and the helper takes its own cursor back as soon as the
  action in progress ends (an action is never cut in half), before the next step. If the page is missing, does not load,
  or sends no first signal within 15 seconds, the TALOS cursor stays off until TALOS restarts and the helper keeps its own
  cursor. If the signal comes back, the TALOS cursor comes back only after the helper running with its own cursor has
  closed (five minutes after TALOS last used it), never while it runs: there are never two cursors. While the TALOS cursor
  is not shown (see «Known limits», or on a Windows 10 older than version 2004), the helper's cursor stays, as in 0.2.1, so
  you see where TALOS is about to click. If the TALOS cursor stops showing while the helper is starting, the task goes on
  in the same way (before, it ended with «computer use is not available on this computer»). If the helper cannot restart,
  the task stops and the chat says why, instead of going on without a cursor.
- **Computer use: reduced motion is respected.** With «Reduce motion» on in TALOS, or reduced motion asked by Windows, the
  TALOS cursor no longer flies to the next click, the border of the window TALOS is watching no longer pulses, the ring
  of the click no longer grows, and TALOS no longer waits for the flight before clicking (up to 0.85 s each step). Before,
  the wait always happened, and the cursor, the border and the ring followed only the Windows setting. A change of
  «Reduce motion» reaches the TALOS cursor and border while TALOS is open, without a restart; the wait follows it from
  your next message.
- **Computer use: no more seconds without a cursor between two slow steps.** When the TALOS cursor stopped during a task,
  the helper's cursor came back only with TALOS's next action, so with slow steps the screen showed no cursor for up to
  about 8.6 seconds. Now the helper starts again at once and draws its cursor where the TALOS cursor last was, without
  waiting for the next action. It moves only the drawn cursor, never your mouse.
- **Computer use: the page of the TALOS cursor also starts while its window is still hidden.** Its window is shown only
  after the page says it has drawn, but a window never shown did not let the page draw, so the TALOS cursor and the
  border of the watched window could stay off for the whole session. The page now gives its first signal within half a
  second even while hidden.
- **Computer use: the bubble grows with what it shows.** The bubble stayed a thin strip: the computer use card was there
  but could not be seen or clicked, the message field could not be reached, and the top of the bar was cut. The bubble
  now takes the height of its content, up to 24 points from the edge of the screen; a long card scrolls inside it and the
  bar at the bottom always stays whole. It also takes the width of its content: before, the card and the bar were cut on
  the right, because the bubble never learned how wide they were.
- **Computer use: one «Using the computer…» row in the chat.** After you answered a computer use card, the live row under
  the card (with its seconds and Stop) did not come back, and the heading of the group above it said «Using the
  computer…» again. Now the live row comes back under the card, and the heading names the same step without «…».
- **Computer use stays on the window of the task, and stops when you use the PC (was a known limit of 0.2.1 and 0.2.2).**
  The first window computer use picks is the window of the task: later it reads only that window, and the windows the task
  itself opens (a «Save as» dialog, a window of an app the task started). If another window covers it, or the task window
  is closed or minimized, TALOS reads nothing else and sends nothing of the other window to the model; before any action it
  asks you with the card of a new place, which names the window in front, also when that window belongs to the same app or
  to an app you gave «Always allow». In Full access, where there are no cards, the task stops. If the task was asked to
  use an app and no window of that app is open, TALOS no longer reads the window on top: it opens the app. When you move
  the mouse or type during a task, the task stops with «You took the computer», and nothing more is done; what the helper
  types or clicks itself does not stop it, and neither does your click on a card. On 10 typical tasks this costs no card
  more for a task in one window, or with the windows the task opens itself; a card more only when another window comes in
  front and the model wants to act. The limit that is left: TALOS tells your input apart from the helper's by time (an
  input during an action of the helper counts as the helper's), so a movement of yours in that fraction of a second is
  seen only at your next movement.
- **Computer use: an app name that names two programs follows only the new windows of the first one.** When the task
  opens an app with a name in which TALOS recognizes two or more programs, only the new windows of the program written
  first become windows of the task; if the first one cannot be told, none do. Before, a new window of the second program
  became a window of the task too, so TALOS could read it.

### Known limits

- **«Writes to the project»: a command that deletes or changes a folder outside the project does not ask, unless the place is a
  sensitive one.** File tools ask before they write outside the session folder; shell commands ask only for sensitive places (home,
  the project and the folder above it, the phone's folders). The card of the level now says so. It has been this way since the level
  exists; asking for every write outside the project from a command is planned for 0.2.4.
- Search does not find the Assistant's questions and answers yet.
- Secret files whose name TALOS does not recognise yet (for example `terraform.tfstate`, `.htpasswd`, `wp-config.php`) are
  read by the Assistant like other files; the shared rule for the whole app will learn them separately.
- From the phone (app 0.1.48) the Assistant does not open web pages after a read, because the phone cannot show the card
  yet: it says so and asks you to open the PC. On the phone an exported chat still shows the Assistant's exchanges as raw
  data. A question from the phone gets at most 105 seconds, so the PC answers before the phone stops waiting. The Assistant
  has no switch of its own to turn the network off: it follows the chat's permissions and your cards.
- **From the phone, a chat continued elsewhere can open first with its older part.** If a deletion on the PC starts while
  the phone opens the chat and is refused (because the chat changed elsewhere), and the chat is already back when the
  phone's open checks again, the open is not empty but it is not whole either: it shows only what this PC had (in the
  test, 2 events of 7, without the part written elsewhere). The phone keeps listening, and the other 5 events arrive once
  at the next realignment of that chat, for example the next time it is opened. In the same case, if the chat is not back
  yet, the phone says «The session no longer exists» of a chat that is still there; opening it again from the list brings
  it back whole (7 events of 7 in the test).
- **Going back to an older version and then updating again can lose your choice for «Full-width questions».** Versions
  before this one (v0.2.1 and earlier) do not keep the mark that says your choice was already carried over. If you install
  one of them again and change any setting there (appearance, language, updates): if you had turned «Full-width questions»
  off with the switch in Settings, the next update to this version turns it back on. Going back to an older version is not
  supported: turn it off again in Settings.
- **«Full-width questions» can wait to be confirmed after the update.** To carry your choice over, TALOS reads the file
  that records the settings it changed for you. If that file is there but cannot be read (an antivirus or a sync program
  is holding it, or it cannot be opened), TALOS does not guess: the switch in Settings shows «on», while the assistant
  still reads the setting as «off». A line under the switch says so, and goes away as soon as the two agree. Flip the
  switch once and they agree («off»); flip it once more to keep it on. When the file can be read again, it settles the next
  time a setting changes or the next time TALOS starts, not before. If the file can never be read, it stays this way until
  one of you decides: you with the switch or with `/settings`, or the assistant when you ask it. If the assistant sets it to
  «off», the switch turns off, and like any change the assistant makes it shows «Changed by TALOS» with «Undo».
- A page made by the model that uses live calls between browsers (WebRTC) inside a frame of its own does not work: it stops,
  is reloaded once and then shows «Page not loaded.» with «Try again». Nothing leaves the PC.
- Memory: each open page made by the model now has a process of its own, about 23 MB of its own memory each (measured with a
  small page: 1 page 23 MB, 5 pages 116 MB, 20 pages 484 MB, against 26, 26 and 38 MB before). Today the app shows one page
  beside the chat, plus the reader and up to 8 windows. Websites in the Browser panel are not affected: a site with 20 closed
  frames stays in one process, 37 MB, as before.
- If TALOS restarts on a new address while a page window from before is still open, that old window stops loading new pages:
  close it and open the page again from its card.

- Settings search, arrows in the results: Left from the first cell of the first row leaves the results and moves the
  cursor in the field instead of going to the last cell; after Home or End the arrows still move between cells; Down with
  the cursor in the middle of the text marks a row but Right still moves the cursor. The W3C pattern for this kind of list
  does the opposite in all three cases.
- Doctor, local engine: at the click the Doctor first reads the model list from the local engine (one GET /models, which
  neither loads nor wakes a model) and does not send the test if the model is asleep or if the engine does not answer
  within 3 s. If the model falls asleep or is closed in the instant between
  that question and the test, the test wakes it up or loads it again.
- The ChatGPT plan panel stays open over Settings when you reach Settings with Ctrl K; it closes with Esc or a click
  outside.
- Computer use: a task that has to retry a button that stays disabled while it only scrolls, waits or presses keys in between
  (a licence to scroll to the end, a document still loading) reaches the end when the button gives way by the 4th try, as in
  0.2.1; a 4th refusal closes it (in 0.2.1 it went on).
- Computer use: send buttons named in other languages (such as «Verzenden», «Wyślij», «送信») or with no name are not
  recognised as sends and ask no card, as in 0.2.1.
- Computer use: name tags of recipients are read only next to an empty «To» field; tags next to a field that still holds
  typed text are not read.
- Computer use: on the phone the card of a send shows no list of recipients: the list the PC shows next to the choices is
  not shown there, and «Allow» goes; on a list too long for the card «Allow» is refused, the card says in English to open
  the list on the PC, and the question stays open; «Don't allow» and «Stop» still work from the phone (phone app 0.1.48).
- Computer use: a click by coordinates on an empty point of the page goes without the payment card when the only thing on
  the screen named «Paga» or «Pay» is a tab (84 of 1,764 cases in the test; your choice of 11/11 names buttons and links);
  a click on the tab itself asks the card.
- Computer use: a program connected to TALOS that falsely says it has shown the whole list of recipients can allow the
  send without it; the model cannot do this.
- Computer use: a button or a link named only «Paga» or «Pay» (the menu of a bank) asks the payment card for a click on it
  or within 5 px of it, in Full access too and also on a page that does not pay (your choice of 11/11: a payment never goes
  without you). Something else counts as a button only when the screen reader reports it as pressable: a box that shows
  a hand pointer or can be reached with Tab, but is not reported as pressable, counts as plain text and asks nothing.
- Computer use: «can be pressed» means a button, a link, or an element the screen reader reports as pressable; plain text
  «Paga» or «Pay» asks nothing beside it or with nothing under the point, but a click right on the word still asks the
  payment card, because the screen reader may not say that it can be pressed.
- Computer use: two chat windows on the same page, each with the same message field, that swap places after a send share
  one yes (1 card for 2 sends) when the screen does not name the frame of each chat; with named frames each chat asks its
  own card.
- Computer use: a clock or counter that is not plain text (a progress bar, a picture, a «Resend in 0:nn» button, the window
  title) lets the model retry a blinking button up to the step limit.
- Computer use: when the amount changes only in the picture and not in the readable text, Full access keeps one card for the
  payment. On the PC the payment card never shows the total, in any case.
- Computer use: the same site with the same window title in another browser (Chrome, then Edge) counts as the same window for a
  yes you already gave.
- **A change made in Full access while another conversation runs a command is not kept.** If a command in Full access
  changes the computer use settings while a command in another conversation is running, TALOS can't tell which of the
  two made the change: it moves the change aside next to the file, puts the approved version back and tells the other
  conversation, not the one in Full access. This happens when the other conversation is not in Full access and its
  command is still running when the Full access command ends, and also when a command of another conversation, at any
  permission level, starts while the Full access command runs, because every command checks the files first. A command
  left in the background counts until its own process exits. To keep the change, make it again when no other command is
  running, in the foreground or in the background; the copy moved aside is next to the file.
- **Some programs started by a command don't count.** A program that a command starts and leaves running after the
  command's own process exits (for example with `start "" /b`, or a program that detaches itself) is not followed: if it
  writes the computer use settings while a command in Full access runs in another conversation, the change becomes the
  approved version. This was already so in 0.2.1, where TALOS did not check these files at all. A command you run
  yourself with «!» is yours: it never counts as a command of another conversation, also after a restart.
- **A command you approved that names the computer use settings keeps whatever is in the file when it ends.** If another
  program writes the same file while that command runs, that write becomes part of the approved version too. A command
  left in the background ends when its process exits.
- **If you leave Full access while a command started in Full access runs, that command still ends as in Full access:**
  what it leaves becomes the approved version, with no copy and no notice.
- **A file you approve on a card counts at once, also while computer use is off.** If you approve the card of the
  assistant writing or editing the settings file (at any permission level), or of a shell command that names it, the file
  becomes the approved version right away: computer use follows it, and is on if the file says on, even if it was off
  because no approved version was saved or the keychain entry could not be read. After a restart it stays so, unless
  there is no keychain at all.
- **After a restart, some commands that are still running no longer count.** TALOS takes back the background commands
  that survived a restart only when it can recognise their process again, which it can't for a command run inside WSL
  (nor on macOS); a command that was still running in the foreground when TALOS closed, even with a normal close, is not
  taken back either. If such a command writes the computer use settings while a command in Full access runs in another
  conversation, the change becomes the approved version.
- **After the update, a command left in the background by the previous version no longer counts.** Its record from the
  previous version does not say that the assistant started it, so after the restart that installs this version it no
  longer holds the change of a command in Full access in another conversation: if it writes the computer use settings,
  the change becomes the approved version.
- **Programs a command leaves running on Windows: the limits of the new helper.** On Windows a command now starts through
  a small helper that keeps together every program the command starts. A program the command leaves running (a server
  started with `start`, a detached process) still belongs to it: the command counts as running until the last of them
  exits, and Stop closes them all. What it does not do, or does not do yet:
  - A program a command leaves running stays tied to it: Stop or closing the conversation also closes it, and while it
    runs the row of its command cannot be removed from the list (TALOS answers that the command is still running).
  - A one-shot run (also from the terminal) does not exit until the programs its commands left running have exited:
    measured, a run whose command left a program running for seven seconds ended after 7.4 seconds instead of 0.2.
  - Commands that run in Linux (WSL) do not go through the helper: there a program left running is not followed, as
    before. *Report a problem* says so for a conversation set to run its commands in Linux; for a conversation that
    picks the place command by command, that line speaks of the commands that run in Windows.
  - The helper is checked against its fingerprint before every command (about one thousandth of a second each time,
    measured on a file of 276,992 bytes), so a helper replaced or damaged while TALOS is open is not started. Stop
    starts no file at all: it asks the helper that is already running, the only one that holds the group of the
    command, to close that group. The fingerprint is kept in a file next to the helper: a program
    that can write in the TALOS folder can replace both,
    or change the helper in the instant between the check and the start, and this check does not stop it.
  - If the helper is missing, does not match, is not allowed to start, or stops before the command could start, the
    command runs as before and the programs it leaves running are not followed; *Report a problem* says which of these
    happened. A helper that starts and then does not answer is closed after ten seconds: the command then runs as
    before, ten seconds late, and the programs it leaves running are not followed (Stop during that wait stops at
    once). If the helper announces the command in the very instant it is being closed, the command is not started a
    second time: its result says that it may not have run. If the helper stops right after announcing the command,
    TALOS does not start that command a second time: it may have run or not (the helper can stop just before the
    command starts or while it runs), and TALOS cannot know which. The result of the command says that it may not
    have run, and *Report a problem* says that the helper stopped before saying how a command ended. A command that
    was already sent to the background when this happens gets no such note: its result had already been given. It
    keeps running on its own, and the log says that TALOS no longer sees when it ends and that Stop no longer reaches
    it (before this change the log said that it may not have run, 10 times out of 10).
  - While a command runs in the foreground, the helper keeps its group tied to itself, as Codex does: if the helper
    stops (it crashes or is closed, or TALOS closes), the command and every program it started stop with it. Measured
    on 10 commands with the helper stopped while they ran: before this change the command, a program it had started
    and a program started with `start` kept running 10 times out of 10, no longer followed; with this change 0 times
    out of 10. Closing TALOS during such a command: the same, 10 out of 10 before and 0 out of 10 now. The tie is
    removed once, when the shell of the command exits or when the command is sent to the background: from then on the
    programs it left running, and a background command, keep running if the helper or TALOS stops (10 out of 10 in
    each case, as before). So a program started with `start` while the command still runs in the foreground stops too
    if the helper stops before the command ends (10 out of 10 in the same measure): send the command to the
    background, or let it end, before closing TALOS. The same holds for every way of starting a program from a command
    in the foreground: `start`, `start /b`, `cmd /c start`, PowerShell's `Start-Process` and a dev server such as
    `npm run dev` (0 out of 10 left running for each, with the helper or TALOS stopped).
  - The group of a command has no name: no other program can take it first or open it, and Stop reaches the command
    and every program it left running through the helper. Before this change a name already taken by another program
    left the command outside the group: Stop reached it 0 times out of 5 (the command and a program it had left
    running stayed alive), and a Stop given before the command started closed the group of the other program 5 times
    out of 5. With this change, on the same commands, Stop reaches both 5 times out of 5 and the other program is
    never touched. If Windows refuses to create the group, the command starts outside it, as before: the programs it
    leaves running are not followed, and *Report a problem* says that Windows did not allow it. Outside the group Stop
    closes the shell of the command and the programs it started, found in a list of the running programs and each
    checked by its start time (a program that started before its parent has a number Windows gave again, and is not
    touched): with that refusal forced on purpose, nothing was left running 5 times out of 5; before this change 4
    programs out of 4 kept running and Stop waited more than eight seconds, 5 times out of 5. A program started in the instant between the list and the
    stop can be missed, so the log still says that the programs of the command may keep running until they end.
    A program whose parent has already exited is not found outside the group: with the refusal forced on purpose such
    a program kept running after Stop 5 times out of 5 (inside the group 0 times out of 5). If
    Windows does not let the helper close the group, the helper ties the group to itself again and exits, and Windows
    closes the group with it: forced on purpose, nothing left running 5 times out of 5 (before, 4 programs out of 4
    kept running and Stop waited more than eight seconds, 5 times out of 5). If Windows refuses that too, the helper
    closes one by one the programs that Windows confirms are in the group, as Codex does: with both refusals forced on
    purpose, nothing left running 10 times out of 10, for a command in the foreground and 10 out of 10 in the
    background (before, the helper answered that it could not in all 10 tries, 5 in the foreground and 5 in the
    background, and the programs of a command in the background kept running). If TALOS can no longer write to the helper,
    it closes the helper, and while the command runs in the foreground the group closes with it: 5 times out of 5
    nothing left running and Stop over at once (before, 4 programs out of 4 kept running and Stop waited more than
    eight seconds, 5 times out of 5); for a command already sent to the background its programs keep running, and the
    log says so. If TALOS can no longer write to the helper when the command is sent to the background, the command
    still stops if the helper or TALOS stops, and the log now says so (before, it said nothing). Outside the group there is also no safety net for the very first instant: if the
    helper is closed right then, the command can stay paused without ever running. The same happens inside the group
    if Windows refuses that safety net, and then *Report a problem* says so. Then the tie of the foreground is missing
    too: a command in the foreground keeps running if the helper or TALOS stops, and the log says so.
  - Two rare races are not closed, and neither was seen in our tries. If Windows refuses to close the group at Stop in
    the very instant the shell of the command exits, the group can keep running while Stop says that it closed it
    (Codex orders the two with a lock). Outside the group, if Windows gives the number of a program of the command, in
    the instant between the list and the stop, to a program started after the shell, that program can be stopped.
  - A Stop given just before a command that ends at once has started does not prevent it: the command still runs, as
    it did before the helper existed.
  - TALOS never stops the helper by its number. It closes the group of a command through the helper (Windows closes
    every program of the group at once), and the helper itself only through the link to it that TALOS has held since
    it started: while that link is held Windows does not give that number to another program, and once the helper has
    exited the link stops nothing. Before this change a forced stop by number took 70 to 100 thousandths of a second
    to act, and the helper often exited by itself in that time: when the helper is closed because it did not answer
    in time, 24 of 54 forced stops found the number already free (82 commands), so Windows could have given it to
    another program. TALOS sees an exit 0.86 thousandths of a second after it happens in the middle, 3.39 at most (200
    commands): that window no longer matters, because a link cannot point at another program. With this change, on
    the same 82 commands, no stop by number. A command that runs without the helper (see above) is still stopped by
    its number, as before the helper existed.
  - If you update or close TALOS while a command runs in the foreground, the command and the programs it started stop
    (see above). If you update TALOS while programs a finished command left running are still running, they keep
    running and are no longer followed: after the update Stop does not reach them. A command sent to the background
    keeps running too, and after the restart TALOS takes it back and Stop reaches it again, checking each of its
    programs by its start time before every stop (the helper itself has stopped with TALOS and is never among them).
    Measured on 20 background commands with TALOS stopped at once and started again: 20 taken back, one stop each,
    never on the helper nor on a program of someone else, nothing left running after Stop. If Windows gives the number
    of a program already stopped to another program while TALOS waits for it to exit, TALOS checks its start time
    again and closes the row, without a second stop (before, the row stayed in progress until that other program
    exited, 45 to 51 seconds, 3 times out of 3).
    If Windows refuses to let the programs go when the command ends or goes to the background, they stop when TALOS
    closes or is updated instead, and *Report a problem* says so (Windows has not refused it on the PC where this was
    tried). Stop still reaches them then: with that refusal forced on purpose, 5 times out of 5.
  - The release builds the helper itself, from the same commit as the app, runs the helper's own smoke test on it and
    takes its fingerprint there; the package copies the helper only if the copy has that fingerprint, with the licences
    of the Rust crates it contains, and the release stops if the fingerprint is missing or does not match: no release
    goes out without the helper. Nothing is written by hand and no separate build is needed. The installed app checks
    the helper against that fingerprint before every command (see above).
  - A package built on a PC without a fixed fingerprint carries no helper and says so in its build log and in its
    manifest: there every command runs as before, and *Report a problem* says that this version has no checked helper.
    The terminal version of TALOS does not carry the helper in its package, so for whoever uses it nothing changes.
  - The messages between TALOS and the helper carry no version number: the two always travel in the same package.
    The terminal version of TALOS carries the part of TALOS that talks to the helper but not the helper, so there the
    helper is never started and commands run as before.
  - After Stop on a command in the background taken back after a restart, while one of its programs is still running
    and is still the same program, TALOS checks again now and then whether Windows has given that number to another
    program. Each check reads the start times of the programs and takes 1.7 to 2.1 seconds (15 checks measured on our
    PC with the processor 23 to 37% busy). Before this change it ran every 5 seconds for as long as that program lived
    (11 checks in 50 seconds, 22.8 seconds spent checking); now the checks grow further apart, after 5, 10, 20 and 40
    seconds and then once a minute (13 checks in the first ten minutes instead of 120). The limit that is left: a
    number given to another program is seen about a minute late (60 seconds, 3 times out of 3 with the processor 23 to
    37% busy), and later when the PC is busy (73 seconds, once, with the processor 56% busy); until then the row stays
    in progress. A second Stop given while a check runs now waits for it and then stops
    the program (before, it was ignored 6 times out of 6 while TALOS answered that it had stopped it). When the
    program really exits, the row closes within 5 seconds as before.
  - Inside the installed app the helper has not been tried yet on a PC without the Microsoft C++ libraries, and its
    release build has not been timed: with the build made on our PC a command starts about 12 thousandths of a
    second later (33 against 22, the middle value of 30 commands).
- **Computer use: the TALOS cursor, the border of the watched window and the bubble are still not shown.** The notes of
  0.2.0 said they were; they are not, even with computer use on. The fixes above prepare them, and they will be turned
  on in a later version. While TALOS uses the computer, its cards and Stop are in the chat.
- **Computer use: when the TALOS cursor stops, the helper's cursor takes up to about 2 seconds, plus the end of the action
  in progress, to come back.** During that time the screen may show no moving cursor. If the screens change (one added,
  removed, or rescaled) during a task, the helper's cursor is used for the rest of that task.

### In italiano

#### Aggiunto

- **Privacy: di sua iniziativa TALOS Desktop va in rete solo per ciò che lasci acceso.** L'elenco pubblico dei modelli di
  OpenRouter ora è spento di serie: TALOS lo legge solo dopo che scegli un modello di OpenRouter, aggiungi una sua chiave o lo
  accendi in Impostazioni → Sicurezza e privacy → Catalogo pubblico dei modelli. Finché è spento, il selettore dei modelli usa
  l'elenco incorporato in TALOS e lo dice («elenco incorporato»); con l'interruttore spento, scegliere un modello di OpenRouter
  o aggiungere una sua chiave è una tua scelta di usare OpenRouter, e TALOS torna a leggere l'elenco (una richiesta all'apertura
  della finestra). Se la lettura non riesce, TALOS riprova una volta dopo 30 secondi, poi al più una volta ogni 10 minuti. Può cambiarlo anche l'assistente, sempre con una carta. Un amministratore può tenerlo spento per tutto il
  computer con `TALOS_HARNESS_UI_CATALOGO_PUBBLICO=off`: allora nessuna richiesta per l'elenco, anche con una chiave di
  OpenRouter e un modello di OpenRouter scelto. Il controllo automatico degli aggiornamenti (Impostazioni → Aggiornamenti →
  Aggiornamenti automatici) si tiene spento allo stesso modo con `TALOS_DESKTOP_AGGIORNAMENTI=off`. Un programma d'installazione
  può spegnerli tutti e due con un file `preferenze-iniziali.json` nella cartella dei dati di TALOS, letto al primo avvio che lo
  trova (forma in `harness-ui/desktop/PREFERENZE-INIZIALI.md`). Cosa manda TALOS Desktop da solo, e a chi, è nell'informativa
  sulla privacy, PRIVACY.md alla radice del repository; non copre ancora la CLI di TALOS né l'app del telefono.
- **«No a questo strumento fino al tuo prossimo messaggio».** Nel menu «⋯» della domanda di uno strumento di un
  connettore, di un plugin o di Tool Forge (o col tasto destro sulla domanda): l'assistente non può più usare quello
  strumento, con nessun dettaglio, finché non gli scrivi o non rispondi a una sua domanda, e gli si dice che hai detto
  di no. Non consente niente e non cambia il tuo permesso. Un no che non viene da te (una regola o una risposta
  automatica) non lo accende mai.

#### Cambiato

- **La scheda «A lato» ora è l'«Assistente».** Risponde a domande sulla chat mentre l'agente lavora, e può solo leggere: i
  file della cartella della chat, le uscite dei comandi e il trascritto, lo stato, le differenze e la storia di git, il
  contesto e la spesa (se la chat non ha attrezzi caricati a richiesta, risponde dalla conversazione e lo dice). Non può
  scrivere, lanciare comandi né cambiare niente. Le risposte si vedono come in chat (tabelle,
  codice, grassetto), e un riferimento `file:righe` apre una sbirciata di quelle righe; in chat lo stesso riferimento apre il
  file in «File». Sotto il campo ci sono tre domande pronte: un clic e parte. Domande e risposte ora si salvano con la chat e
  tornano dopo un riavvio. Sotto il campo vedi sempre quanto ha speso l'Assistente in questa chat e in tutte, anche a $0.00.
  I file segreti riconosciuti dal nome (chiavi, credenziali, `.env`) si rifiutano e non si mostrano mai, e i file fuori
  dalla cartella della chat solo se l'agente li ha già letti, giudicati sul percorso vero (un collegamento o un nome corto
  che porta fuori conta come fuori). Siccome legge la chat, ogni indirizzo web che vuole aprire ti mostra prima una carta
  con l'indirizzo intero, anche in Accesso pieno, e dice se l'indirizzo sembra portare testo letto: con un no non parte
  niente. Un indirizzo più lungo di quanto la carta sa mostrare (4.000 caratteri) si rifiuta, e l'elenco di ciò che ha
  fatto dice perché. Dopo due no la domanda si ferma con una riga, come la chat. Senza un fornitore della ricerca web
  l'Assistente non cerca sul web, e nessuna carta te lo chiede. Il pannello dice «Leggo questa chat e i suoi file solo
  quando mi chiedi», tiene la pillola «Sola lettura» a ogni larghezza e conta i file letti allo stesso modo nella testata
  e in «Ultimo giro guardato». Il pannello ha il suo Stop, e lo Stop della chat ferma anche la sua domanda. Una domanda fatta da un'altra
  finestra si vede nel pannello mentre corre. Ciò che ha letto è elencato a parole semplici con la tua ora («ha letto
  src/a.js, righe 1-60»), ogni risposta ha i riferimenti al messaggio, al passo o al file che ha guardato, e «Ultimo giro
  guardato» dice cosa ha letto l'ultima domanda. Di serie usa il modello della chat: puoi sceglierne un altro, in cloud o su
  questo PC, dal pannello o da Impostazioni, Memoria e contesto, Assistente; un modello su questo PC aspetta che il giro
  finisca. Una chat esportata scrive le sue domande e risposte come testo. Le tabelle larghe delle risposte vanno a capo o
  scorrono dentro la loro casella.
- **«Domande a tutta larghezza» ora è accesa di serie.** Le domande che mandi in chat prendono tutta la larghezza della
  chat, come le risposte. Se non l'avevi mai cambiata, l'aggiornamento la accende. Se TALOS ha traccia che l'avevi scelta
  spenta (l'hai chiesto all'assistente, hai usato `/settings`, o hai annullato un cambio che l'aveva accesa), resta spenta.
  Spegnerla con l'interruttore delle Impostazioni di una versione precedente non lasciava traccia, proprio come il vecchio
  valore di serie, quindi si accende: spegnila di nuovo nelle Impostazioni, e da questa versione in poi la scelta resta.
- **Uso del computer: un clic per coordinate su una finestra di conferma ora parte, dopo una carta.** Nella 0.2.1 un clic su
  un punto senza un pulsante leggibile sotto non partiva: in Normale chiedeva una carta e poi non faceva nulla, in Accesso
  pieno fermava il compito. Ora TALOS lo giudica dal pulsante più forte della finestra (invio, pagamento, cancellazione),
  chiede la carta che quel pulsante vuole e fa il clic. Quando sullo schermo c'è qualcosa che paga, un clic per coordinate
  senza niente sotto chiede la carta di pagamento, dentro o fuori da una cassa e anche con un'altra finestra aperta (un banner
  dei cookie), in Normale e in Accesso pieno; in una pagina di cassa vale anche quando sotto il punto c'è solo la pagina o un
  contenitore (un clic 5 px accanto a «Paga ora»). Conta un pulsante, o un collegamento, un testo, un'immagine o un campo il
  cui nome intero è un comando di pagare («Acquista ora», «Paga ora →», «Pay $49.99», «Buy with Google Pay»); «Checkout»,
  «PayPal» o «Come pagare» nel menu di un negozio no, e i 20 compiti tipici (19 senza pagamento) chiedono le stesse carte di
  prima. Fuori da una cassa un clic sulla pagina accanto a un pulsante che paga parte ancora senza carta, come nella 0.2.1.
  Fa eccezione, per tua scelta dell'11/11, un pulsante o un collegamento che si chiama solo «Paga» o «Pay»: un clic su di
  esso, o sulla pagina entro 5 px, chiede la carta di pagamento, anche in Accesso pieno; più lontano il clic parte come prima.
  Contano solo pulsanti, collegamenti e ciò che si comporta come tale (un elemento che il lettore dello schermo dice
  premibile, come un riquadro cliccabile): «Paga» scritto come testo semplice non chiede nulla, né accanto né senza niente
  sotto il punto. Una pagina il cui titolo comincia con «Cassa» («Cassa - Negozio», «Cassa / Negozio», «Alla cassa») conta
  come una cassa, come «Checkout» e «Pagamento»; «Registratore di cassa - Wikipedia», «INPS - Cassa» o «Cassa integrazione»
  no. Su 10 pagamenti tipici: 10 carte di pagamento in Normale e 8 in Accesso pieno, più 7 e 8 domande della guardia della
  cassa, 17 e 16 domande in tutto (0.2.1: 17 e 10, quando 6 compiti su 10 si fermavano a metà). Con un tetto di spesa, un
  passo in cassa che non dice di pagare («Avanti») riserva soltanto la sua cifra nel tetto; il pulsante che paga la stessa
  cifra sullo stesso sito non chiede di nuovo, e la storia dice «pagati» solo quando quel pulsante parte.
- **Uso del computer: al più 3 invii per ogni sì, oltre a quello che hai approvato.** Nella 0.2.1 un sì a un invio copriva
  tutti gli invii dopo sulla stessa pagina: 20 invii chiedevano una volta. Ora un sì copre al più altri 3 invii allo stesso
  destinatario, poi TALOS chiede di nuovo: 20 invii chiedono 5 volte, che il modello faccia clic su «Invia», «Submit» o su un
  pulsante che mostra solo un'icona, prema Invio o Ctrl+Invio nel messaggio, o faccia clic per coordinate su una finestra di
  conferma. Un sì copre il posto in cui l'hai dato: lo stesso pulsante (anche premuto con Invio, con un clic sulla sua
  finestra di conferma o con la scorciatoia della finestra, come Alt+S), o Ctrl+Invio nello stesso campo del messaggio o
  della chat. Un altro pulsante come «Pubblica», Ctrl+Invio o Invio in un altro campo, aprire un indirizzo che porta i tuoi
  dati, trascinare un file in un'area di caricamento, un programma che va in rete o un'azione di uscita chiedono la loro carta.
- **Uso del computer: i destinatari si leggono interi, e un cambio chiede di nuovo.** Nella 0.2.1 il destinatario si leggeva
  solo dal titolo della conversazione, e sei indirizzi diversi nel campo «A» chiedevano una volta. Ora TALOS legge anche i
  campi «A», «Cc», «Ccn», «Destinatario» e «Destinatari» (anche «Cc recipients», «Bcc recipients», «Cc/Ccn» e gli elenchi a
  discesa), ogni voce che contengono e le etichette coi nomi accanto a un campo «A» vuoto: sei indirizzi chiedono sei volte, e
  un nome o un gruppo accanto allo stesso indirizzo («Tutti i dipendenti», «e altri 3») o un destinatario spostato da Ccn ad A
  chiedono di nuovo. Destinatari che cambiano mentre la carta è aperta fermano l'invio, e la carta dopo mostra quelli nuovi.
  Lo stesso indirizzo scritto in un altro modo (maiuscole, spazi, un «;», un punto in fondo, un nome davanti, «Rossi, Mario
  <…>») e gli stessi nomi in un altro ordine restano lo stesso destinatario. Un invio a una persona nominata nelle tue parole
  parte senza carta solo se ogni destinatario sullo schermo è quella persona.
- **Uso del computer: la carta di un invio dice a chi va.** Nella 0.2.1 la carta diceva solo «un invio». Ora elenca ogni campo
  dei destinatari con tutti i nomi letti sullo schermo, mai «e altri N»; un elenco troppo lungo per la carta si vede intero
  accanto alle scelte, e il riquadro dice quando scorre. Oltre 2000 caratteri o 20 righe di nomi la carta dice il numero vero
  dei destinatari, contato sul campo intero, e che non li mostra tutti; un pulsante apre l'elenco intero, e «Consenti», scelto
  o scritto in «Altro», parte solo dopo che l'elenco è stato aperto sul PC. Se il destinatario non si legge, o è lo schermo
  stesso ad accorciare l'elenco, la carta lo dice; la testata di una finestra di nuovo messaggio («Nuovo messaggio», «New
  message») non compare come destinatario.
- **Uso del computer: quando il modello chiede più invii insieme, il tuo sì copre esattamente gli invii che hai visto.** Nella
  0.2.1 una risposta all'elenco di un gruppo di invii copriva tutti gli invii dopo: 40 invii a gruppi di 10 chiedevano una
  volta. Ora ogni invio dell'elenco parte una volta, al destinatario che la domanda mostrava, e tutto il resto chiede di nuovo:
  40 invii a gruppi di 10 chiedono 4 volte. Costa più domande quando il modello manda a gruppi piccoli: 20 invii a gruppi di
  2 chiedono 10 volte (una nella 0.2.1). Quando il modello scrive un destinatario diverso in ogni invio del gruppo, ogni invio
  chiede la sua carta dopo la domanda del gruppo: 20 inviti a gruppi di 5, ognuno a un altro indirizzo, chiedono 21 volte
  (una nella 0.2.1).
- **Uso del computer: meno giri a vuoto fino al tetto dei passi.** Un modello che riscrive sempre lo stesso campo mentre
  «Salva» viene rifiutato si ferma alla 5ª richiesta; un clic che non fa nulla, ripetuto davanti a un pulsante rifiutato,
  alla 6ª (nella 0.2.1 arrivavano entrambi al tetto dei passi, 20). Un pulsante che compare un attimo dopo dentro un gruppo
  di azioni non ferma più il compito: un lettore di 16 pagine arriva in fondo (la 0.2.1 si fermava alla pagina 1).
- **Le impostazioni dell'uso del computer chiedono anche in Accesso pieno.** Scrivere o modificare
  `.computer-use-impostazione.json` o `.computer-use-luoghi.json` con gli attrezzi dei file dell'assistente ora mostra la
  carta anche in Accesso pieno, e conta solo il tuo sì (fino alla 0.2.1 compresa l'Accesso pieno li scriveva senza carta). Gli altri
  file di controllo restano senza carta in Accesso pieno.
- **Quando l'assistente usa più volte lo stesso strumento di un connettore, di un plugin o di Tool Forge in una sola
  risposta, ricevi una domanda sola invece di una per ogni chiamata.** La domanda dice quante chiamate copre («8
  chiamate in questa risposta») ed elenca ogni chiamata, numerata, con tutti i suoi dettagli; oltre tre chiamate, le
  altre si aprono con «Mostra tutte». «Consenti tutte» e «Nega tutte» rispondono per tutte insieme. Una chiamata con più
  dettagli di quanti la domanda ne possa mostrare interi (più di 12, uno più lungo di 300 caratteri, o uno con un nome
  più lungo di 64 caratteri; le lunghezze contano le unità UTF-16, quindi un'emoji o un carattere raro vale due) non
  condivide mai una domanda: allora ogni chiamata di quello strumento chiede da sola, e se
  un elenco lascia fuori dei dettagli dice quanti («+2 campi»). Il nome lungo di un dettaglio va su più righe e non
  nasconde mai il suo valore, in questa domanda e in quella di una chiamata che l'assistente ha scritto come testo; lo stesso a
  capo vale per le domande delle automazioni. Una chiamata che ha bisogno della tua attenzione da sola (per esempio
  quando i tuoi dati potrebbero uscire dal PC) chiede comunque con la sua domanda. Queste domande non coprono mai più
  chiamate: uno strumento di un connettore che il connettore non dichiara non distruttivo (compreso uno dichiarato solo «di sola
  lettura»), le cancellazioni che chiedono sempre, l'uso del computer, e una risposta in cui due chiamate portano lo
  stesso identificativo. Sul telefono e nella riga di comando ogni chiamata di questi strumenti chiede con la
  sua domanda (fino alla 0.2.1 gli strumenti di un connettore, di un plugin o di Tool Forge non chiedevano affatto).

#### Corretto

- **L'uso del computer resta sulla finestra del compito, e si ferma quando usi il PC (era un limite noto della 0.2.1 e
  della 0.2.2).** La prima finestra che sceglie è la finestra del compito: dopo legge solo quella, e le finestre che il
  compito apre da sé (una finestra «Salva con nome», la finestra di un'app avviata dal compito). Se un'altra finestra la
  copre, o la finestra del compito viene chiusa o ridotta, TALOS non legge altro e non manda niente dell'altra finestra al
  modello; prima di ogni azione ti chiede con la carta del luogo nuovo, che dice il nome della finestra davanti, anche
  quando quella finestra è della stessa app o di un'app a cui hai dato «Consenti sempre». In Accesso pieno, dove le carte
  non ci sono, il compito si ferma. Se il compito doveva usare un'app e nessuna sua finestra è aperta, TALOS non legge più
  la finestra in cima: apre l'app. Quando muovi il mouse o scrivi durante un compito, il compito si ferma con «Hai preso il
  computer» e non fa più niente; ciò che l'aiutante scrive o clicca da sé non lo ferma, e nemmeno il tuo clic su una carta.
  Su 10 compiti tipici non costa nessuna carta in più per un compito in una finestra sola, o con le finestre che il compito
  apre da sé; una carta in più solo quando un'altra finestra passa davanti e il modello vuole agire. Il limite che resta:
  TALOS distingue il tuo input da quello dell'aiutante per tempo (un input durante un'azione dell'aiutante conta come suo),
  quindi un tuo movimento in quella frazione di secondo si vede solo al tuo movimento successivo.
- **Uso del computer: il nome di un'app che nomina due programmi segue solo le finestre nuove del primo.** Quando il
  compito apre un'app con un nome in cui TALOS riconosce due o più programmi, diventano finestre del compito solo le
  finestre nuove del programma scritto per primo; se il primo non si può stabilire, nessuna. Prima diventava finestra del
  compito anche una finestra nuova del secondo programma, e TALOS poteva leggerla.
- **Scrivere in una chat lunga è più leggero.** Nelle chat con migliaia di giri ogni lettera scritta nella casella del
  messaggio ridisegnava tutta la colonna di destra (giri, eventi degli attrezzi, albero degli agenti), e ogni tasto cercava
  in tutta la pagina una finestra aperta. Ora una lettera fa solo crescere la casella; la casella e i suoi pulsanti si
  aggiornano quando il testo passa da vuoto a scritto o al contrario, o comincia o smette di cominciare con `!` o `/`, e
  la colonna la ridisegnano gli eventi che la cambiano. Misurato su una chat da 3000 giri con un giro in corso (3 comandi, 2
  agenti, scheda Processi aperta, CPU rallentata 4 volte): 60 lettere disegnavano la colonna 61 volte, ora 3 (una per ogni
  lettura di CPU e memoria dei comandi, ogni 5 secondi), e il 95° percentile dal tasto al fotogramma dipinto è passato da
  1376 ms a 208 ms. Non è ancora sotto i 16 ms, e nessun tasto ci arriva ancora: ogni tasto costa ancora al browser stile e
  impaginazione su una pagina da 70.000 elementi, e mentre agenti o comandi lavorano ogni loro evento ridisegna ancora tutta
  la colonna (con loro il 95° percentile resta circa lo stesso, oltre un secondo). Arrivano col blocco dopo (la colonna per
  differenza e il tetto dei giri sulla pagina).
- **Le schede Processi e Agenti non si rifanno più quando non è cambiato niente.** Un ridisegno con gli stessi dati lascia
  la scheda com'è: 200 ridisegni uguali sono passati da 4400 e 10600 parti rifatte a 0. Il tempo «da quanto» di un comando
  acceso continua a contare.
- **Aprire una chat lunga non rilegge più l'elenco delle chat a ogni richiesta di permesso.** Mentre si carica la storia
  di una chat, ogni richiesta di permesso, domanda o richiesta MCP, e ogni risposta, chiedeva di nuovo al server l'elenco
  intero: una chat da 200 giri con 400 eventi così faceva 403 letture. Ora l'elenco si legge una volta a fine storia (4
  letture in tutto), una richiesta durante un giro dal vivo lo rilegge ancora, e le richieste fatte mentre una lettura è in
  corso la condividono.
- **L'orologio dell'attività non cerca più in tutta la pagina ogni secondo.** Tiene i posti che aggiorna: da 3-4 ricerche
  in tutta la pagina ogni 3,5 secondi a 0.
- **Una pagina web fatta dal modello non può più far cadere le altre.** Ogni pagina accanto alla chat, nel lettore dei file o
  in una finestra sua gira da sola. Se una smette di funzionare le altre vanno avanti, e TALOS la ricarica una volta da sé. Se
  si ferma di nuovo, la pagina lascia il suo posto e compare «Pagina non caricata.» con «Riprova» (sotto la carta
  dell'artefatto, o nel lettore). Una pagina nella sua finestra che si ferma due volte resta aperta e dice «Pagina non
  caricata.», «Si è fermata due volte. Riprova, oppure riaprila dalla sua carta nella chat.», con «Riprova». Intanto dal PC non
  esce niente. Per farlo ogni pagina si apre ora su un indirizzo locale suo, usato solo da TALOS su questo PC e mai cercato in
  rete. TALOS rifiuta ogni chiamata che una di queste pagine fa al resto dell'app.
- **Una pagina nella sua finestra col lasciapassare scaduto non mostra più un errore grezzo.** Dice «Pagina non caricata.», «Non
  si è potuta caricare. Riprova, oppure riaprila dalla sua carta nella chat.», con «Riprova».
- **Una pagina accanto alla chat ferma da più di mezz'ora torna quando si ricarica:** la ricarica chiede un lasciapassare
  nuovo, come già faceva il lettore, invece di riusare quello scaduto.
- **La stessa protezione di rete quando l'indirizzo dell'app è scritto in un altro modo** (`localhost` o `[::1]`).
- **Dal telefono, una chat continuata altrove si apre con ciò che è stato scritto lì.** Se la chat è stata continuata in
  un'altra finestra di TALOS o nel terminale, ora il telefono la apre con quella parte nuova e resta al passo; prima mostrava
  solo ciò che questo PC aveva in memoria. Riaprendola dopo l'ultimo evento visto, il telefono riceve solo la parte scritta
  altrove.
- **Dal telefono, una chat riaperta riceve ogni evento una volta.** Quando il telefono chiedeva di nuovo una chat cambiata
  altrove, gli stessi eventi potevano arrivare due volte (misurato: eventi da 1 a 7, poi di nuovo da 3 a 7); ora ognuno arriva
  una volta.
- **Dal telefono, una chat cancellata mentre si apre risponde «non trovata».** Prima il telefono la apriva vuota e muta.
  L'app del telefono (0.1.48) mostra «The session no longer exists» e non riprova da sola.
- **Il motore del telefono non prosegue più una risposta dell'Assistente lasciata a metà.** Il motore del telefono non
  riprende una risposta incompiuta, quindi TALOS non gliene manda più una da proseguire e chiede una risposta nuova; il motore
  del PC continua a proseguirla.
- **Computer use: ciò che fai nella bolla ora arriva a TALOS.** «Ferma» nella bolla ferma il compito (non faceva niente);
  un messaggio scritto nella bolla va al compito in corso, come uno scritto nella chat mentre TALOS lavora (andava perso);
  la carta del computer use compare anche nella bolla, con la stessa domanda e le stesse scelte della chat, apposta: rispondi
  dove stai guardando, basta una risposta, e chiude la carta in tutti e due i posti (finora una carta risposta nella bolla
  andava persa, e il compito aspettava fino a dieci minuti). Una scelta che vuole prima l'elenco intero aperto («Consenti» davanti a un lungo elenco di
  destinatari) resta nella chat; la bolla mostra le altre scelte e «Apri in TALOS». Un messaggio scritto nella bolla quando
  nessun compito è ancora partito non va da nessuna parte.
- **Computer use: la bolla dice quale elemento TALOS sta per usare.** Prima di un passo la bolla mostrava «[object Object]»;
  ora mostra il nome dell'elemento («Salva»), e tiene la frase di prima quando il passo non ha un elemento con un nome.
- **Computer use: un cursore solo sullo schermo.** L'aiutante del PC spegne il suo cursore solo mentre il cursore di TALOS si
  vede, così non può più disegnare un secondo cursore accanto a quello di TALOS. La pagina del cursore di TALOS ora dice a
  TALOS, due volte al secondo, che ha disegnato il cursore, e TALOS conta il suo cursore come visibile solo dopo che quel
  segnale è arrivato da ogni schermo (prima lo contava visibile già prima che la pagina si caricasse, così una pagina
  caricata che non disegnava niente, o bloccata, lasciava senza nessun cursore fino al riavvio di TALOS). Se il segnale si
  ferma per 2 secondi, Windows dice che la pagina non risponde, o il processo della pagina finisce, TALOS nasconde il suo
  cursore e l'aiutante riprende il suo appena finisce l'azione in corso (un'azione non si taglia mai a metà), prima del
  passo dopo. Se la pagina manca, non si carica o non manda il primo segnale entro 15 secondi, il cursore di TALOS resta
  spento fino al prossimo avvio di TALOS e l'aiutante tiene il suo cursore. Se il segnale torna, il cursore di TALOS torna
  solo dopo che l'aiutante col suo cursore si è chiuso (cinque minuti dopo l'ultima volta che TALOS l'ha usato), mai
  mentre è acceso: due cursori insieme non ci sono mai. Finché il cursore di TALOS non si vede (vedi «Limiti noti», o su un
  Windows 10 più vecchio della versione 2004), il cursore dell'aiutante resta, come nella 0.2.1, così vedi dove TALOS sta
  per cliccare. Se il cursore di TALOS smette di vedersi mentre l'aiutante sta partendo, il compito continua allo stesso
  modo (prima si chiudeva con «il computer use non è disponibile su questo computer»). Se l'aiutante non riesce a
  ripartire, il compito si ferma e la chat dice perché, invece di andare avanti senza un cursore.
- **Computer use: il movimento ridotto è rispettato.** Con «Riduci movimento» acceso in TALOS, o col movimento ridotto
  chiesto da Windows, il cursore di TALOS non vola più verso il clic dopo, il bordo della finestra che TALOS guarda non
  pulsa più, l'anello del clic non si allarga più, e TALOS non aspetta più il volo prima di cliccare (fino a 0,85 s a ogni
  passo). Prima l'attesa c'era sempre, e cursore, bordo e anello seguivano solo l'impostazione di Windows. Se cambi
  «Riduci movimento» con TALOS aperto, cursore e bordo seguono la scelta nuova subito, senza riavviare; l'attesa la segue
  dal tuo prossimo messaggio.
- **Computer use: niente più secondi senza cursore fra due passi lenti.** Quando il cursore di TALOS si fermava durante un
  compito, il cursore dell'aiutante tornava solo con l'azione dopo di TALOS, così coi passi lenti lo schermo restava senza
  cursore fino a circa 8,6 secondi. Ora l'aiutante riparte subito e disegna il suo cursore dove era l'ultima volta il
  cursore di TALOS, senza aspettare l'azione dopo. Muove solo il cursore disegnato, mai il tuo mouse.
- **Computer use: la pagina del cursore di TALOS parte anche con la finestra ancora nascosta.** La sua finestra si mostra solo
  dopo che la pagina dice di aver disegnato, ma una finestra mai mostrata non lasciava disegnare la pagina, così il cursore
  di TALOS e il bordo della finestra guardata potevano restare spenti per tutta la sessione. Ora la pagina dà il primo
  segnale entro mezzo secondo anche da nascosta.
- **Computer use: la bolla cresce con ciò che mostra.** La bolla restava una striscia sottile: la carta del computer use
  c'era ma non si vedeva e non si cliccava, il campo del messaggio non si raggiungeva e la barra era tagliata in alto. Ora
  la bolla prende l'altezza del suo contenuto, fino a 24 punti dal bordo dello schermo; una carta lunga scorre al suo
  interno e la barra in basso resta sempre intera. Prende anche la larghezza del suo contenuto: prima la carta e la barra
  erano tagliate a destra, perché la bolla non sapeva quanto fossero larghe.
- **Computer use: una sola riga «Uso del computer…» nella chat.** Dopo la risposta a una carta del computer use, la riga
  viva sotto la carta (coi secondi e Ferma) non tornava, e la testa del gruppo sopra ripeteva «Uso del computer…». Ora la
  riga viva torna sotto la carta, e la testa nomina lo stesso passo senza «…».

#### Limiti noti

- **«Scrive nel progetto»: un comando che cancella o cambia una cartella fuori dal progetto non chiede, se il posto non è
  delicato.** Gli attrezzi dei file chiedono prima di scrivere fuori dalla cartella della sessione; i comandi chiedono solo per i posti
  delicati (la casa, il progetto e la cartella sopra, le cartelle del telefono). La scheda del livello ora lo dice. È così da quando
  il livello esiste; chiedere per ogni scrittura fuori dal progetto fatta da un comando è in programma per la 0.2.4.
- La ricerca non trova ancora le domande e le risposte dell'Assistente.
- I file segreti con un nome che TALOS non riconosce ancora (per esempio `terraform.tfstate`, `.htpasswd`, `wp-config.php`)
  l'Assistente li legge come gli altri; la regola comune di tutta l'app li imparerà a parte.
- Dal telefono (app 0.1.48) l'Assistente non apre pagine web dopo una lettura, perché il telefono non sa ancora mostrare la
  carta: lo dice e ti chiede di aprire il PC. Sul telefono una chat esportata mostra ancora gli scambi dell'Assistente come
  dati grezzi. Una domanda dal telefono ha al più 105 secondi, così il PC risponde prima che il telefono smetta di
  aspettare. L'Assistente non ha un interruttore suo per spegnere la rete: segue i permessi della chat e le tue carte.
- **Dal telefono, una chat continuata altrove può aprirsi prima con la sua parte vecchia.** Se una cancellazione sul PC parte
  mentre il telefono apre la chat e viene rifiutata (perché la chat è cambiata altrove), e la chat è già tornata quando
  l'apertura del telefono ricontrolla, l'apertura non è vuota ma non è nemmeno intera: mostra solo ciò che aveva questo PC
  (nella prova, 2 eventi su 7, senza la parte scritta altrove). Il telefono resta in ascolto, e gli altri 5 eventi arrivano
  una volta al riallineamento successivo di quella chat, per esempio alla prossima apertura. Nello stesso caso, se la chat non
  è ancora tornata, il telefono dice «The session no longer exists» di una chat che c'è ancora; riaprendola dall'elenco torna
  intera (7 eventi su 7 nella prova).
- **Tornare a una versione precedente e poi aggiornare di nuovo può perdere la tua scelta per «Domande a tutta
  larghezza».** Le versioni prima di questa (v0.2.1 e precedenti) non tengono il segno che dice che la tua scelta è già
  stata riportata. Se ne installi di nuovo una e lì cambi un'impostazione qualunque (aspetto, lingua, aggiornamenti): se
  l'avevi spenta con l'interruttore delle Impostazioni, l'aggiornamento dopo a questa versione la riaccende. Tornare a una
  versione precedente non è previsto: spegnila di nuovo nelle Impostazioni.
- **«Domande a tutta larghezza» può restare da confermare dopo l'aggiornamento.** Per riportare la tua scelta, TALOS legge
  il file che tiene le impostazioni cambiate per te. Se quel file c'è ma non si legge (lo tiene un antivirus o un programma
  di sincronizzazione, o non si apre), TALOS non tira a indovinare: l'interruttore nelle Impostazioni mostra «accesa»,
  mentre l'assistente la legge ancora «spenta». Una riga sotto l'interruttore lo dice, e va via appena i due sono
  d'accordo. Tocca l'interruttore una volta e sono d'accordo («spenta»); toccalo un'altra volta per tenerla accesa. Quando
  il file torna leggibile, si sistema al prossimo cambio di un'impostazione o al prossimo avvio di TALOS, non prima. Se il
  file non si legge mai, resta così finché uno dei due non decide: tu con l'interruttore o con `/settings`, o l'assistente
  quando glielo chiedi. Se l'assistente la mette «spenta», l'interruttore si spegne e, come ogni cambio dell'assistente,
  mostra «Cambiata da TALOS» con «Annulla».
- Una pagina del modello che usa le chiamate dal vivo fra browser (WebRTC) dentro una sua cornice non funziona: si
  ferma, si ricarica una volta e poi mostra «Pagina non caricata.» con «Riprova»; dal PC non esce niente.
- Memoria: ogni pagina del modello aperta ha ora un processo suo, circa 23 MB di memoria propria ciascuna (misurato con una
  pagina piccola: 1 pagina 23 MB, 5 pagine 116 MB, 20 pagine 484 MB, contro 26, 26 e 38 MB di prima). Oggi l'app mostra una
  pagina accanto alla chat, più il lettore e al massimo 8 finestre. I siti nel pannello Browser non cambiano: un sito con 20
  cornici chiuse resta in un processo solo, 37 MB, come prima.
- Se TALOS riparte su un indirizzo nuovo mentre una finestra di pagina di prima è ancora aperta, quella finestra non carica più
  pagine nuove: chiudila e riapri la pagina dalla sua carta.
- Limiti noti dell'uso del computer:
  - un compito che deve ritentare un pulsante che resta spento mentre in mezzo scorre, aspetta o preme tasti (una licenza da
    scorrere fino in fondo, un documento che sta caricando) arriva in fondo se il pulsante cede entro il 4° tentativo, come
    nella 0.2.1; un 4° rifiuto lo chiude (nella 0.2.1 andava avanti);
  - i pulsanti d'invio con nomi in altre lingue (come «Verzenden», «Wyślij», «送信») o senza nome non si riconoscono come
    invii e non chiedono carta, come nella 0.2.1;
  - le etichette coi nomi dei destinatari si leggono solo accanto a un campo «A» vuoto; accanto a un campo che contiene ancora
    testo scritto no;
  - sul telefono la carta di un invio non mostra l'elenco dei destinatari: quello che il PC mostra accanto alle scelte lì non si
    vede, e «Consenti» parte; su un elenco troppo lungo per la carta «Consenti» si rifiuta, la carta dice in inglese di aprire
    l'elenco sul PC e la domanda resta aperta; «Non consentire» e «Ferma» funzionano ancora dal telefono (app del telefono 0.1.48);
  - un clic per coordinate su un punto vuoto della pagina parte senza la carta di pagamento quando l'unica cosa sullo schermo che
    si chiama «Paga» o «Pay» è una scheda (84 casi su 1764 nella prova; la tua scelta dell'11/11 parla di pulsanti e
    collegamenti); un clic sulla scheda stessa chiede la carta;
  - un programma collegato a TALOS che dichiara il falso, cioè di aver mostrato l'elenco intero dei destinatari, può consentire
    l'invio senza averlo mostrato; il modello non può farlo;
  - un pulsante o un collegamento che si chiama solo «Paga» o «Pay» (il menu di una banca) chiede la carta di pagamento per un
    clic su di esso o entro 5 px, anche in Accesso pieno e in una pagina che non paga (tua scelta dell'11/11: nessun
    pagamento parte senza di te). Altro conta come un pulsante solo se il lettore dello schermo lo dice premibile: un riquadro
    che mostra la manina o si raggiunge col Tab, ma non è detto premibile, vale come testo semplice e non chiede nulla;
  - «si preme» vuol dire un pulsante, un collegamento o un elemento che il lettore dello schermo dice premibile; il testo
    semplice «Paga» o «Pay» non chiede nulla accanto né senza niente sotto il punto, ma un clic proprio sulla parola chiede
    ancora la carta di pagamento, perché il lettore dello schermo può non dire che si preme;
  - due finestrelle di chat sulla stessa pagina, ognuna con lo stesso campo del messaggio, che si scambiano di posto dopo un
    invio condividono un sì (1 carta per 2 invii) quando lo schermo non dà un nome al riquadro di ogni chat; coi riquadri
    col nome ogni chat chiede la sua carta;
  - un orologio o un contatore che non è testo semplice (una barra di avanzamento, un'immagine, un pulsante «Reinvia fra
    0:nn», il titolo della finestra) lascia ritentare un pulsante che lampeggia fino al tetto dei passi;
  - se la cifra cambia solo nell'immagine e non nel testo, in Accesso pieno resta una carta per il pagamento; sul PC la carta
    di pagamento non mostra mai il totale, in nessun caso;
  - lo stesso sito con lo stesso titolo in un altro browser (Chrome, poi Edge) conta come la stessa finestra per un sì già dato.
- **Programmi lasciati accesi da un comando su Windows: i limiti del nuovo aiutante.** Su Windows un comando parte ora
  attraverso un piccolo aiutante che tiene insieme tutti i programmi che il comando avvia. Un programma che il comando
  lascia acceso (un server partito con `start`, un processo staccato) resta suo: il comando conta come «in corso» finché
  l'ultimo esce, e Stop li chiude tutti. Che cosa non fa, o non fa ancora:
  - Un programma lasciato acceso da un comando resta legato a lui: Stop o la chiusura della conversazione chiudono anche
    lui, e finché gira la riga del suo comando non si può togliere dall'elenco (TALOS risponde che il comando è ancora
    in corso).
  - Una corsa a colpo singolo (anche dal terminale) non esce finché i programmi lasciati accesi dai suoi comandi non sono
    usciti: misurato, una corsa il cui comando lasciava acceso un programma per sette secondi è finita dopo 7,4 secondi
    invece di 0,2.
  - I comandi che girano in Linux (WSL) non passano dall'aiutante: lì un programma lasciato acceso non è seguito, come
    prima. *Segnala un problema* lo dice per una conversazione impostata per far girare i comandi in Linux; per una
    conversazione che sceglie il posto comando per comando, quella riga parla dei comandi che girano in Windows.
  - L'aiutante si controlla con la sua impronta prima di ogni comando (circa un millesimo di secondo ogni volta,
    misurato su un file di 276.992 byte), così un aiutante sostituito o rovinato mentre TALOS è aperto non parte. Stop
    non avvia nessun file: chiede all'aiutante che sta già girando, il solo che tiene il gruppo del comando, di
    chiudere quel gruppo. L'impronta sta in un file accanto
    all'aiutante: un programma che può scrivere nella cartella di
    TALOS può sostituirli tutti e due, o cambiare l'aiutante nell'istante fra il controllo e la partenza, e questo
    controllo non lo ferma.
  - Se l'aiutante manca, non corrisponde, non viene lasciato partire, o si ferma prima che il comando parta, il comando
    gira come prima e i programmi che lascia accesi non sono seguiti; *Segnala un problema* dice quale di questi casi è
    successo. Un aiutante che parte e poi non risponde viene chiuso dopo dieci secondi: il comando gira allora come
    prima, con dieci secondi di ritardo, e i programmi che lascia accesi non sono seguiti (Stop durante quell'attesa
    ferma subito). Se l'aiutante annuncia il comando proprio nell'istante in cui viene chiuso, il comando non viene
    fatto partire una seconda volta: il suo esito dice che può non essere girato. Se l'aiutante si ferma subito dopo
    aver annunciato il comando, TALOS non fa partire quel comando una seconda volta: può essere girato o no (l'aiutante
    può fermarsi appena prima che il comando parta o mentre gira), e TALOS non può sapere quale dei due. L'esito del
    comando dice che può non essere girato, e *Segnala un problema* dice che l'aiutante si è fermato prima di dire
    com'è finito un comando. Un comando già mandato in sottofondo quando succede non riceve questa nota: il suo esito
    era già stato dato. Continua da solo, e il log dice che TALOS non vede più quando finisce e che Stop non lo
    raggiunge più (prima di questa modifica il log diceva che poteva non essere girato, 10 volte su 10).
  - Mentre un comando gira in primo piano, l'aiutante tiene il suo gruppo legato a sé, come fa Codex: se l'aiutante si
    ferma (si guasta o viene chiuso, o TALOS si chiude), il comando e ogni programma che ha avviato si fermano con lui.
    Misurato su 10 comandi con l'aiutante fermato mentre giravano: prima di questa modifica il comando, un programma
    che aveva avviato e un programma partito con `start` restavano accesi 10 volte su 10, senza più essere seguiti; con
    questa modifica 0 volte su 10. Chiudendo TALOS durante un comando così: lo stesso, 10 su 10 prima e 0 su 10 ora. Il
    legame si toglie una volta, quando la shell del comando esce o quando il comando va in sottofondo: da lì i
    programmi che ha lasciato accesi, e un comando in sottofondo, restano accesi se l'aiutante o TALOS si fermano (10 su
    10 in ogni caso, come prima). Quindi anche un programma partito con `start` mentre il comando gira ancora in primo
    piano si ferma se l'aiutante si ferma prima che il comando finisca (10 su 10 nella stessa misura): manda il comando
    in sottofondo, o lascialo finire, prima di chiudere TALOS. Lo stesso vale per ogni modo di far partire un programma
    da un comando in primo piano: `start`, `start /b`, `cmd /c start`, `Start-Process` di PowerShell e un server di
    sviluppo come `npm run dev` (0 su 10 rimasti accesi per ciascuno, con l'aiutante o TALOS fermati).
  - Il gruppo di un comando non ha un nome: nessun altro programma può prenderlo prima o aprirlo, e Stop raggiunge il
    comando e ogni programma che ha lasciato acceso attraverso l'aiutante. Prima di questa modifica un nome già preso da
    un altro programma lasciava il comando fuori dal gruppo: Stop lo raggiungeva 0 volte su 5 (il comando e un
    programma che aveva lasciato acceso restavano vivi), e uno Stop dato prima che il comando partisse chiudeva il
    gruppo dell'altro programma 5 volte su 5. Con questa modifica, sugli stessi comandi, Stop li raggiunge tutti e due 5
    volte su 5 e l'altro programma non viene mai toccato. Se Windows rifiuta di creare il gruppo, il comando parte fuori
    dal gruppo, come prima: i programmi che lascia accesi non sono seguiti, e *Segnala un problema* dice che Windows non
    lo ha permesso. Fuori dal gruppo Stop chiude la shell del comando e i programmi che ha avviato, trovati in un elenco
    dei programmi accesi e controllati uno per uno con l'ora in cui sono partiti (un programma partito prima del suo
    padre ha un numero che Windows ha ridato, e non si tocca): con quel rifiuto forzato apposta, niente è rimasto
    acceso 5 volte su 5; prima di questa modifica 4 programmi su 4 restavano accesi e Stop aspettava più di otto
    secondi, 5 volte su 5. Un programma partito nell'istante fra l'elenco e l'arresto può sfuggire, e per questo il log
    dice ancora che i programmi del comando possono restare accesi finché non finiscono. Fuori dal gruppo un programma
    il cui padre è già uscito non si trova: con il rifiuto forzato apposta un programma così è rimasto acceso dopo Stop
    5 volte su 5 (dentro il gruppo 0 volte su 5). Se Windows non lascia
    all'aiutante chiudere il gruppo, l'aiutante lo rilega a sé ed esce, e Windows chiude il gruppo con lui: forzato
    apposta, niente acceso 5 volte su 5 (prima 4 programmi su 4 restavano accesi e Stop aspettava più di otto secondi, 5
    volte su 5). Se Windows rifiuta anche questo, l'aiutante chiude uno per uno i programmi che Windows conferma nel
    gruppo, come fa Codex: con tutti e due i rifiuti forzati apposta, niente acceso 10 volte su 10 per un comando in
    primo piano e 10 su 10 in sottofondo (prima l'aiutante rispondeva che non ci riusciva in tutte e 10 le prove, 5 in primo piano e 5 in sottofondo, e i programmi di un comando in
    sottofondo restavano accesi). Se TALOS non può più scrivere all'aiutante, lo chiude, e mentre il comando gira in primo piano il
    gruppo si chiude con lui: 5 volte su 5 niente acceso e Stop finito subito (prima 4 programmi su 4 restavano accesi
    e Stop aspettava più di otto secondi, 5 volte su 5); per un comando già mandato in sottofondo i suoi programmi
    restano accesi, e il log lo dice. Se TALOS non può più scrivere all'aiutante quando il comando va in sottofondo, il
    comando si ferma lo stesso se l'aiutante o TALOS si fermano, e ora il log lo dice (prima non diceva niente). Fuori dal gruppo manca anche l'appoggio
    per il primissimo istante: se l'aiutante viene chiuso proprio allora, il comando può restare sospeso senza mai
    girare. Lo stesso succede dentro il gruppo se Windows rifiuta quell'appoggio, e allora *Segnala un problema* lo
    dice. Allora manca anche il legame del primo piano: un comando in primo piano resta acceso se l'aiutante o TALOS si
    fermano, e il log lo dice.
  - Due gare rare non sono chiuse, e nessuna delle due si è vista nelle nostre prove. Se Windows rifiuta di chiudere il
    gruppo allo Stop proprio nell'istante in cui la shell del comando esce, il gruppo può restare acceso mentre Stop
    dice di averlo chiuso (Codex mette in fila le due cose con un lucchetto). Fuori dal gruppo, se Windows dà il numero
    di un programma del comando, nell'istante fra l'elenco e l'arresto, a un programma partito dopo la shell, quel
    programma può essere fermato.
  - Uno Stop dato appena prima che parta un comando che finisce subito non lo ferma: il comando gira lo stesso, come
    prima che l'aiutante esistesse.
  - TALOS non ferma mai l'aiutante per numero. Chiude il gruppo di un comando attraverso l'aiutante (Windows chiude
    tutti i programmi del gruppo insieme), e l'aiutante stesso solo dal collegamento che TALOS tiene con lui da quando
    è partito: finché quel collegamento è tenuto Windows non dà quel numero a un altro programma, e uscito l'aiutante
    il collegamento non ferma più niente. Prima di questa modifica un arresto forzato per numero agiva dopo 70-100
    millesimi di secondo, e l'aiutante spesso usciva da solo in quel tempo: quando l'aiutante viene chiuso perché non
    ha risposto in tempo, 24 arresti forzati su 54 hanno trovato il numero già libero (82 comandi), quindi Windows
    poteva averlo dato a un altro programma. TALOS vede un'uscita 0,86 millesimi di secondo dopo che è successa il
    valore di mezzo, 3,39 al massimo (200 comandi): quella finestra non conta più, perché un collegamento non può
    indicare un altro programma. Con questa modifica, sugli stessi 82 comandi, nessun arresto per numero. Un comando
    che gira senza l'aiutante (vedi sopra) si ferma ancora per numero, come prima che l'aiutante esistesse.
  - Se aggiorni o chiudi TALOS mentre un comando gira in primo piano, il comando e i programmi che ha avviato si
    fermano (vedi sopra). Se aggiorni TALOS mentre programmi lasciati accesi da un comando finito sono ancora accesi,
    restano accesi e non sono più seguiti: dopo l'aggiornamento Stop non li raggiunge. Anche un comando mandato in
    sottofondo resta acceso, e dopo la ripartenza TALOS lo riprende e Stop lo raggiunge di nuovo, controllando ognuno
    dei suoi programmi con l'ora in cui è partito prima di ogni arresto (l'aiutante stesso si è fermato con TALOS e non
    è mai fra loro). Misurato su 20 comandi in sottofondo con TALOS fermato di colpo e fatto ripartire: 20 ripresi, un
    arresto ciascuno, mai sull'aiutante né su un programma di altri, niente acceso dopo Stop. Se Windows dà il numero di
    un programma già fermato a un altro programma mentre TALOS aspetta che esca, TALOS ricontrolla l'ora in cui è
    partito e chiude la riga, senza un secondo arresto (prima la riga restava in corso finché quell'altro programma non
    usciva, da 45 a 51 secondi, 3 volte su 3). Se Windows rifiuta di
    lasciare andare i programmi quando il comando finisce o va in sottofondo, si fermano invece quando TALOS si chiude
    o si aggiorna, e *Segnala un problema* lo dice (Windows non lo ha rifiutato sul PC dove è stato provato). Stop li raggiunge anche allora: con quel rifiuto forzato apposta, 5 volte su 5.
  - Il rilascio costruisce l'aiutante da sé, dallo stesso commit dell'app, gli fa la prova di fumo dell'aiutante e ne
    prende l'impronta lì; il pacchetto copia l'aiutante solo se la copia ha quell'impronta, con le licenze delle crate Rust
    che contiene, e il rilascio si ferma se l'impronta manca o non torna: nessun rilascio esce senza l'aiutante. Niente si
    scrive a mano e non serve una costruzione a parte. L'app installata controlla l'aiutante con quell'impronta prima di
    ogni comando (vedi sopra).
  - Un pacchetto costruito su un PC senza un'impronta fissata non porta l'aiutante e lo dice nel log della costruzione e
    nel suo manifesto: lì ogni comando gira come prima, e *Segnala un problema* dice che questa versione non ha un aiutante
    verificato. La versione di TALOS per il terminale non porta l'aiutante nel suo pacchetto, quindi per chi la usa non
    cambia niente.
  - I messaggi fra TALOS e l'aiutante non portano un numero di versione: i due viaggiano sempre nello stesso pacchetto.
    La versione di TALOS per il terminale porta la parte di TALOS che parla con l'aiutante ma non l'aiutante, quindi lì
    l'aiutante non parte mai e i comandi girano come prima.
  - Dopo Stop su un comando in sottofondo ripreso dopo una ripartenza, finché uno dei suoi programmi è ancora acceso ed è
    ancora lo stesso programma, TALOS ricontrolla ogni tanto se Windows ha dato quel numero a un altro programma. Ogni
    controllo legge l'ora in cui sono partiti i programmi e dura da 1,7 a 2,1 secondi (15 controlli misurati sul nostro
    PC col processore occupato dal 23 al 37%). Prima di questa modifica girava ogni 5 secondi per tutta la vita di quel
    programma (11 controlli in 50 secondi, 22,8 secondi passati a controllare); ora i controlli si distanziano, dopo 5,
    10, 20 e 40 secondi e poi uno al minuto (13 controlli nei primi dieci minuti invece di 120). Il limite che resta: un
    numero dato a un altro programma si vede circa un minuto più tardi (60 secondi, 3 volte su 3 col processore occupato
    dal 23 al 37%), e più tardi ancora se il PC è carico (73 secondi, una volta, col processore occupato al 56%); fino ad
    allora la riga resta in corso. Uno Stop dato di nuovo mentre un controllo gira ora lo aspetta e poi ferma il
    programma (prima veniva ignorato 6 volte su 6 mentre TALOS rispondeva di averlo fermato). Quando il programma esce
    davvero, la riga si chiude entro 5 secondi come prima.
  - Dentro l'app installata l'aiutante non è ancora stato provato su un PC senza le librerie C++ di Microsoft, e la sua
    costruzione di rilascio non è stata cronometrata: con la costruzione fatta sul nostro PC un comando parte
    circa 12 millesimi di secondo più tardi (33 contro 22, il valore di mezzo di 30 comandi).
- **Computer use: il cursore di TALOS, il bordo della finestra guardata e la bolla non si vedono ancora.** Le note della
  0.2.0 dicevano che c'erano; non ci sono, nemmeno col computer use acceso. Le cure qui sopra li preparano, e si
  accenderanno in una versione successiva. Mentre TALOS usa il computer, le sue carte e Ferma sono nella chat.
- **Computer use: quando il cursore di TALOS si ferma, il cursore dell'aiutante ci mette fino a circa 2 secondi, più la
  fine dell'azione in corso, a tornare.** In quel tempo sullo schermo può non esserci un cursore che si muove. Se gli
  schermi cambiano durante un compito (uno aggiunto, tolto o ridimensionato), per il resto di quel compito si usa il
  cursore dell'aiutante.

#### Impostazioni e Doctor

- **Doctor: «Prova il motore locale».** Una riga nuova del Doctor manda al modello locale una richiesta minima (un token
  solo) e dice se ha risposto e in quanto tempo, oppure che non ha risposto entro 30 s. La prova va solo al modello già
  caricato e sveglio: con modelli installati ma nessuno caricato dice «Nessun modello caricato» e non ne carica uno; quando
  il modello caricato dorme dopo una pausa lo dice e non manda la prova, perché lo sveglierebbe (al clic parte solo una
  lettura locale dell'elenco dei modelli, GET /models, che non carica e non sveglia il modello); senza modelli locali
  installati lo dice, non scarica nulla e porta ai modelli da scaricare. Parte solo dalla finestra del PC, mai dal telefono.
- **Impostazioni: la ricerca trova anche i nomi delle scelte.** «inglese» o «italiano» trova la lingua dei menu,
  «francese» o «giapponese» la lingua delle risposte; i nomi valgono in italiano e in inglese, qualunque sia la lingua dei
  menu.
- **Impostazioni: «/» e Ctrl K aspettano mentre sopra la pagina è aperto un pannello o un menu.** Col pannello del piano
  ChatGPT o col menu «⋯» di una conversazione aperto sopra le Impostazioni e il fuoco tornato nelle Impostazioni, «/»
  portava il fuoco nella ricerca lì sotto e Ctrl K apriva i comandi: ora non fanno nulla finché non si chiude, come col
  pannello delle notifiche.
- **Doctor: «Esporta» scrive ogni riga ricontrollata una volta.** Dopo «Ricontrolla solo questo» il file portava il
  controllo intero nuovo per ogni riga ricontrollata (30, poi 62, poi 94 KB, con valori di righe che la pagina non mostra).
  Ora una riga ricontrollata porta solo i dati di quella riga e la sua ora, una volta: una riga piccola aggiunge circa
  0,1 KB, quella dei fornitori circa 29 KB, e ricontrollare di nuovo la stessa riga non fa crescere il file.
- **Doctor: l'esito di una riga ricontrollata è scritto in minuscolo dentro la frase** («Controllo rifatto: ora
  guasto.», non «ora Guasto.»).
- Limiti noti. Ricerca delle Impostazioni, frecce nei risultati: Sinistra dalla prima cella della prima riga esce dai
  risultati e muove il cursore nel campo invece di andare all'ultima cella; dopo Inizio o Fine le frecce muovono ancora fra
  le celle; Giù col cursore in mezzo al testo segna una riga ma Destra muove ancora il cursore. Lo schema W3C per questo
  tipo di elenco fa il contrario in tutti e tre i casi. Doctor, motore locale: al clic il Doctor legge prima l'elenco dei
  modelli dal motore locale (una GET /models, che non carica e non sveglia un modello) e non manda la prova se il modello
  dorme o se il motore non risponde entro 3 s; se il modello si
  addormenta o viene chiuso nell'istante fra quella domanda e la prova, la prova lo sveglia o lo ricarica. Il pannello
  del piano ChatGPT resta aperto sopra le Impostazioni quando ci si arriva con Ctrl K; si chiude con Esc o un clic fuori.

#### Uso del computer: i file delle impostazioni

- Fuori da Accesso pieno, un comando di shell che nomina i file delle impostazioni dell'uso del computer ora chiede prima.
  Gli attrezzi dei file dell'assistente (scrivere e modificare) chiedono prima per questi due file a ogni livello di
  permessi, anche in Accesso pieno.
- **Fuori da Accesso pieno, TALOS rimette le impostazioni dell'uso del computer se un comando le cambia.** I comandi di shell
  e le prove si controllano prima e dopo. Un cambio si mette da parte accanto al file (mai cancellato), torna la versione
  approvata e compare una riga nella chat di quel comando. La versione approvata è ricordata anche nel portachiavi del
  sistema, e TALOS controlla i file a ogni avvio: un cambio fatto mentre TALOS era chiuso si mette da parte allora. Se non
  c'è ancora una versione approvata salvata (per esempio subito dopo l'aggiornamento da una versione precedente), i file si
  mettono da parte e l'uso del computer resta spento, con un avviso, finché non lo riaccendi una volta. Se il portachiavi
  non si può leggere o salvare, l'uso del computer resta spento. In Accesso pieno TALOS non interviene su un comando: ciò
  che il comando lascia diventa la versione approvata, senza copia e senza avviso; un cambio fatto fra due comandi si
  rimette comunque prima del comando dopo. Due eccezioni tengono l'Accesso pieno nella sua conversazione. La prima: se
  quando il comando in Accesso pieno finisce è in corso un comando di un'altra conversazione, non in Accesso pieno, il
  cambio si mette da parte e si rimette e l'avviso va a quell'altra conversazione, mai a quella in Accesso pieno. Un
  comando lasciato in sottofondo conta come in corso finché non esce il suo processo, anche dopo un riavvio di TALOS;
  quando esce, TALOS ricontrolla i file come alla fine di ogni comando. La seconda: mentre l'uso del computer è spento
  perché non c'è ancora una versione approvata salvata o il portachiavi non si può leggere o salvare, un comando in
  Accesso pieno non lo riaccende: lo riaccendi solo tu, nelle Impostazioni o su una carta. Senza una versione approvata
  salvata, il file che un comando in Accesso pieno scrive si mette da parte, con la copia e un avviso in quella chat.
  Vale per ogni file da solo, anche quando la sua versione approvata è «nessun file»: se hai acceso l'uso del computer ma il
  file dei luoghi ricordati non è mai stato creato, un comando in Accesso pieno che lo crea lo vede messo da parte (una
  copia, un avviso in quella chat) e l'uso del computer resta acceso.
  TALOS tiene le ultime 10 versioni cambiate di ogni file, senza mai togliere la più nuova. L'uso del
  computer lavora sempre dalla versione approvata, mai dal file sul disco.
- Corretto: dire No con un motivo sulla carta di un file di controllo, o una risposta automatica di una regola o di una
  modalità, non lascia più passare la scrittura.
- Limiti noti. **Un cambio fatto in Accesso pieno mentre un'altra conversazione ha un comando in corso non resta.** Se un
  comando in Accesso pieno cambia le impostazioni dell'uso del computer mentre è in corso un comando di un'altra
  conversazione, TALOS non sa dire quale dei due ha fatto il cambio: lo mette da parte accanto al file, rimette la
  versione approvata e lo dice all'altra conversazione, non a quella in Accesso pieno. Succede quando l'altra
  conversazione non è in Accesso pieno e il suo comando è ancora in corso quando finisce quello in Accesso pieno, e anche
  quando un comando di un'altra conversazione, a qualunque livello di permessi, parte mentre gira quello in Accesso
  pieno, perché ogni comando controlla prima i file. Un comando lasciato in sottofondo conta finché non esce il suo
  processo. Per tenere il cambio, rifallo quando non c'è nessun altro comando in corso, né in primo piano né in
  sottofondo; la copia messa da parte è accanto al file. **Alcuni programmi lanciati da un comando non contano.** Un
  programma che un comando lancia e lascia acceso dopo che il processo del comando è uscito (per esempio con
  `start "" /b`, o un programma che si stacca da solo) non è seguito: se scrive le impostazioni dell'uso del computer
  mentre in un'altra conversazione gira un comando in Accesso pieno, il cambio diventa la versione approvata. Era già
  così nella 0.2.1, dove TALOS non controllava affatto questi file. Un comando che lanci tu con «!» è tuo: non conta mai
  come comando di un'altra conversazione, nemmeno dopo un riavvio. **Un comando che hai approvato e che nomina le
  impostazioni dell'uso del computer tiene ciò che c'è nel file quando finisce.** Se un altro programma scrive lo stesso
  file mentre quel comando gira, anche quella scrittura entra nella versione approvata. Un comando lasciato in sottofondo
  finisce quando esce il suo processo. **Se esci dall'Accesso pieno mentre gira un comando partito in Accesso pieno, quel
  comando finisce comunque come in Accesso pieno:** ciò che lascia diventa la versione approvata, senza copia e senza
  avviso. **Un file che approvi su una carta conta subito, anche mentre l'uso del computer è spento.** Se approvi la carta
  dell'assistente che scrive o modifica il file delle impostazioni (a qualunque livello di permessi), o di un comando di
  shell che lo nomina, il file diventa subito la versione approvata: l'uso del computer lo segue, ed è acceso se il file
  dice acceso, anche se era spento perché non c'era una versione approvata salvata o la voce del portachiavi non si
  leggeva. Dopo un riavvio resta così, a meno che non ci sia nessun portachiavi. **Dopo un riavvio, alcuni comandi ancora
  in corso non contano più.** TALOS riprende i comandi in sottofondo sopravvissuti a un riavvio solo se riconosce di nuovo
  il loro processo, e per un comando lanciato dentro WSL (o su macOS) non può; non riprende nemmeno un comando che era
  ancora in primo piano quando TALOS si è chiuso, anche con una chiusura normale. Se un comando così scrive le
  impostazioni dell'uso del computer mentre in un'altra conversazione gira un comando in Accesso pieno, il cambio diventa
  la versione approvata. **Dopo l'aggiornamento, un comando lasciato in sottofondo dalla versione precedente non conta
  più.** Ciò che la versione precedente ha registrato non dice che l'ha lanciato l'assistente, quindi dopo il riavvio che
  installa questa versione non tiene più il cambio di un comando in Accesso pieno in un'altra conversazione: se scrive le
  impostazioni dell'uso del computer, il cambio diventa la versione approvata.

### Permissions repair: spellings of a disk and deletions (this branch)

> PROVVISORIO: testo da approvare. PROVISIONAL: this text is waiting for approval.

#### Fixed
- A delete command that names the home or the project with a negated set (`rm -rf ../[!P]rogetto`, `rm -rf /Users/[![:upper:]]izio`) now asks on Windows, macOS and the phone's shared storage. Before, it passed with no card.

- **Everywhere: a delete that starts from an empty or missing variable now asks.** When the target of a delete begins with
  a variable that is empty or not set, followed by a slash (for example a folder variable that was never filled in), the
  shell reads it from the root of the disk, but TALOS did not see it, so in Full access it could run with no card (in 0.2.1
  too). Now TALOS reads it the way the shell does and shows the usual card for the root, in every permission mode, for
  bash, cmd and PowerShell. A variable with a value, one TALOS cannot know (filled by `read`, a loop or a command), and the
  names the system always sets are read as before. Cost, measured on the five groups of everyday commands (74 commands,
  both permission levels, Windows, Linux, Android and macOS, also with only the home folder in the environment): no extra
  card. On 10,000 generated delete commands (160,000 checks) every card of 0.2.1 is still shown (measured on part of the round).
- **Ovunque: una cancellazione che parte da una variabile vuota o che non c'è ora chiede.** Quando il bersaglio di una
  cancellazione comincia con una variabile vuota o non impostata, seguita da una barra (per esempio la variabile di una
  cartella mai riempita), la shell lo legge dalla radice del disco, ma TALOS non lo vedeva, quindi in Accesso pieno poteva
  partire senza carta (anche nella 0.2.1). Ora TALOS lo legge come la shell e mostra la solita carta della radice, con
  qualsiasi permesso, per bash, cmd e PowerShell. Una variabile con un valore, una che TALOS non può conoscere (riempita da
  `read`, da un ciclo o da un comando) e i nomi che il sistema mette sempre si leggono come prima. Costo, misurato sui
  cinque gruppi di comandi di ogni giorno (74 comandi, nei due livelli di permesso, su Windows, Linux, Android e macOS, anche
  con la sola cartella utente nell'ambiente): nessuna carta in più. Su 10.000 comandi di cancellazione generati (160.000 controlli) ogni carta della 0.2.1 resta (misurato su una parte del giro).

### Permissions repair: earlier rounds

> PROVVISORIO: testo da approvare. PROVISIONAL: this text is waiting for approval.

#### Fixed

- **Everywhere: a command too complex to read could pass without a card; now it always asks.** In 0.2.1 (measured) and in the
  test builds of this repair, when the permission check could not read a command to the end it answered as if the command
  deleted nothing critical, so a delete of your home, of the root or of the project written in the same command could run
  with no card, in Full access and in Workspace write. Update to this version. Now a command the check cannot read to the end
  always asks, with its own card («too complex to read before it runs»), in every permission mode. The check also has a fixed
  limit, a number and not a time, on how much text the variables of one command may add while it is read (4 MiB): past it,
  the same card. No honest command we measured comes near it: at most 43,513 characters in the 25,644 commands of the
  reviewers, the five groups of honest commands and the phone commands. When this check has asked, the decision of 0.2.1 that
  travels inside TALOS is not consulted again, so a short command that kept the whole check busy 1.6-4.3 s now asks in
  2-7 ms (four runs with the CPU under 50 %); when this check does not ask, that decision is consulted as before, so no card of 0.2.1 is lost (compared on
  the same 25,644 commands, in both permission levels, on Windows, Linux, Android and macOS). Some ways of writing a name
  pattern were read as a different name, so they gave no card (already in 0.2.1): now this check understands them or asks.
  It reads each pattern once, and all its work on patterns, each entry of a bracket set it tries and each letter of the names
  it compares included, counts against a fixed limit, a number and not a time (262,144 steps per command): past it, the same
  card. A bracket set answers once for each letter in a command, so a set of thousands of entries no longer slows it down.
  Measured on this repair through the whole check (three runs with the CPU at 28-36 % on average and every sample under
  50 %, this version and 0.2.1 taking turns, on Windows, Linux, Android and macOS): a command that compares a bracket set of
  4,000 entries 1,000 times takes 134-198 ms (0.2.1: 199-276 ms) and its variants 74-229 ms (0.2.1: 107-381 ms); the
  commands that reach the limit ask in 9-193 ms; the three long commands take 190-371 ms, 10-20 ms and 11-20 ms (0.2.1:
  0.55-1.01 s, 1.05-1.80 s and 0.79-1.42 s), and the short command that multiplies asks in 3-11 ms (0.2.1: 0.44-1.03 s). On
  the first call a 642-character command full of open brackets takes 39-50 ms, and a 578-character one 24-32 ms (0.2.1 on
  the same machine: 37-55 ms and 22-24 ms; CPU at 16-49 %).
- **Ovunque: un comando troppo complesso da leggere poteva passare senza carta; ora chiede sempre.** Nella 0.2.1 (misurato) e nelle
  versioni di prova di questa riparazione, quando il controllo dei permessi non riusciva a leggere un comando fino in fondo
  rispondeva come se il comando non cancellasse niente di critico, quindi una cancellazione della tua cartella utente, della
  radice o del progetto scritta nello stesso comando poteva partire senza carta, in Accesso pieno e in Scrive nel progetto.
  Aggiorna a questa versione. Ora un comando che il controllo non sa leggere fino in fondo chiede sempre, con la sua carta
  («troppo complesso per essere letto prima che parta»), con qualsiasi permesso. Il controllo ha anche un limite fisso, un
  numero e non un tempo, su quanto testo le variabili di un comando possono aggiungere mentre lo si legge (4 MiB): oltre, la
  stessa carta. Nessun comando onesto che abbiamo misurato ci si avvicina: al massimo 43.513 caratteri nei 25.644 comandi dei
  revisori, nei cinque gruppi di comandi onesti e nei comandi del telefono. Quando questo controllo ha chiesto, la decisione
  della 0.2.1 che viaggia dentro TALOS non si consulta di nuovo, quindi un comando corto che teneva occupato il controllo
  intero 1,6-4,3 s ora chiede in 2-7 ms (quattro corse con la CPU sotto il 50 %); quando questo controllo non chiede, quella decisione si consulta come prima,
  quindi nessuna carta della 0.2.1 si perde (confrontato sugli stessi 25.644 comandi, nei due livelli di permesso, su
  Windows, Linux, Android e macOS). Alcuni modi di scrivere un nome con un modello venivano letti come un nome diverso, quindi
  non davano la carta (già nella 0.2.1): ora questo controllo li capisce o chiede. Legge ogni modello una volta sola, e tutto il suo
  lavoro sui modelli, comprese le voci provate di un insieme fra parentesi quadre e le lettere dei nomi che confronta, si conta
  contro un limite fisso, un numero e non un tempo (262.144 passi per comando): oltre, la stessa carta. Un insieme fra
  parentesi quadre risponde una volta per lettera in un comando, quindi un insieme di migliaia di voci non lo rallenta più.
  Misurato in questa riparazione nel controllo intero (tre corse con la CPU al 28-36 % in media e ogni campione sotto il
  50 %, questa versione e la 0.2.1 a turno, su Windows, Linux, Android e macOS): un comando che confronta 1.000 volte un
  insieme di 4.000 voci ci mette 134-198 ms (0.2.1: 199-276 ms) e le sue varianti 74-229 ms (0.2.1: 107-381 ms); i comandi
  che arrivano al limite chiedono in 9-193 ms; i tre comandi lunghi ci mettono 190-371 ms, 10-20 ms e 11-20 ms (0.2.1:
  0,55-1,01 s, 1,05-1,80 s e 0,79-1,42 s), e il comando corto che moltiplica chiede in 3-11 ms (0.2.1: 0,44-1,03 s). Alla
  prima chiamata un comando di 642 caratteri pieno di parentesi quadre aperte ci mette 39-50 ms, e uno di 578 caratteri
  24-32 ms (0.2.1 sulla stessa macchina: 37-55 ms e 22-24 ms; CPU al 16-49 %).
- **macOS: a delete of your home or of the project written in another way had no card.** The disk of a Mac does not tell
  capitals apart, nor an accented letter typed as one character from the same letter typed as two, nor `ß` from `SS`; the
  check compared the names letter by letter and gave no card (already in 0.2.1, in Full access and Workspace write). Update
  to this version. Now on macOS names are compared as the disk compares them: the same form for accented letters, and
  without regard to capitals, `ß` and `SS` included, also inside name patterns. No honest command we measured gets a new
  card (the five groups of honest commands and the phone commands, on Windows, Linux, Android and macOS).
- **macOS: una cancellazione della tua cartella utente o del progetto scritta in un altro modo non aveva la carta.** Il disco
  di un Mac non distingue le maiuscole, né una lettera accentata scritta come un carattere solo dalla stessa lettera scritta
  come due, né `ß` da `SS`; il controllo confrontava i nomi lettera per lettera e non dava la carta (già nella 0.2.1, in
  Accesso pieno e in Scrive nel progetto). Aggiorna a questa versione. Ora su macOS i nomi si confrontano come li confronta
  il disco: la stessa forma per le lettere accentate, e senza badare alle maiuscole, `ß` e `SS` compresi, anche dentro i nomi
  scritti come modello. Nessun comando onesto che abbiamo misurato riceve una carta nuova (i cinque gruppi di comandi onesti e
  i comandi del telefono, su Windows, Linux, Android e macOS).
- **Android: in the shared storage of the phone a name pattern written with other capitals had no card.** The shared
  storage does not tell capitals apart, and the check already knew it for plain names, but not for name patterns: a delete of
  the projects folder written as a pattern with capitals gave no card (already in 0.2.1, in Full access and Workspace write).
  Update to this version. Now patterns follow the same rule as names there; outside the shared storage capitals still count.
  None of the 13 phone commands gets a new card.
- **Android: nella memoria condivisa del telefono un nome scritto come modello con altre maiuscole non aveva la carta.** La
  memoria condivisa non distingue le maiuscole, e il controllo lo sapeva già per i nomi scritti per intero, ma non per i nomi
  scritti come modello: una cancellazione della cartella dei progetti scritta come modello con le maiuscole non dava la carta
  (già nella 0.2.1, in Accesso pieno e in Scrive nel progetto). Aggiorna a questa versione. Ora lì i modelli seguono la stessa
  regola dei nomi; fuori dalla memoria condivisa le maiuscole contano ancora. Nessuno dei 13 comandi del telefono riceve una
  carta nuova.
- **Windows: three ways of writing a path made TALOS check a different place from the one the system opened.** The protection
  looked somewhere else, so it did not see the protected file or folder. It could happen only if the model wrote the path in
  one of these forms:
  1. **A folder at the top of the disk whose name is one letter** (your home or your project under it), named with forward
     slashes and no drive letter: it was read as a path on another drive. Affected: the card of a critical delete (the whole
     project or the home) in **Full access** and **Workspace write**, 0.2.0 to 0.2.1; reading a credential file of your home
     from a command in **Full access**, 0.1.33 to 0.2.1; a folder you **blocked for a device** named by a command, at every
     access level, 0.2.0 to 0.2.1.
  2. **A path with no drive letter, with TALOS started from one disk and the project on another:** it was checked on the disk
     of TALOS and opened on the disk of the project. Affected: writing or changing a credential file of your home at every
     access level, 0.1.31 to 0.2.1; reading one in **Full access**, 0.1.33 to 0.2.1; a folder blocked for a device read,
     written, changed or printed at every access level (or asked with an ordinary card where it must be refused), 0.2.0 to
     0.2.1; the secrets of the project behind a link (0.1.24 to 0.2.1), a second name of the same file (0.1.33 to 0.2.1) or
     an example file (0.1.31 to 0.2.1), read with no card; and a critical delete after the command moved to
     the other disk with the bare drive letter, 0.2.0 to 0.2.1.
  3. **A drive letter followed by a path with no slash** (relative to the current folder of that drive). This one needs one
     disk only. Affected: reading a credential file of your home in **Full access**, from a command and from the file tools,
     0.1.33 to 0.2.1; a folder blocked for a device, at every access level, 0.2.0 to 0.2.1.

  Windows only. **What to do: update.**

- **Windows: tre modi di scrivere un percorso facevano controllare a TALOS un posto diverso da quello che il sistema apriva.**
  La protezione guardava altrove, e non vedeva il file o la cartella protetti. Poteva succedere solo se il modello scriveva il
  percorso in una di queste forme:
  1. **Una cartella in cima al disco col nome di una sola lettera** (la tua casa o il tuo progetto lì sotto), nominata con le
     barre dritte e senza la lettera del disco: veniva letta come un percorso di un altro disco. Che cosa toccava: la carta
     della cancellazione critica (tutto il progetto o la casa) in **Accesso pieno** e in **Scrive nel progetto**, dalla 0.2.0
     alla 0.2.1; la lettura di un file di credenziali della tua casa da un comando in **Accesso pieno**, dalla 0.1.33 alla
     0.2.1; una cartella che hai **bloccato per un dispositivo** nominata da un comando, a ogni livello di accesso, dalla
     0.2.0 alla 0.2.1.
  2. **Un percorso senza la lettera del disco, con TALOS avviato da un disco e il progetto su un altro:** veniva controllato
     sul disco di TALOS e aperto sul disco del progetto. Che cosa toccava: scrivere o cambiare un file di credenziali della tua
     casa a ogni livello di accesso, dalla 0.1.31 alla 0.2.1; leggerlo in **Accesso pieno**, dalla 0.1.33 alla 0.2.1; una
     cartella bloccata per un dispositivo letta, scritta, cambiata o stampata a ogni livello di accesso (oppure chiesta con
     una carta qualunque dove va rifiutata), dalla 0.2.0 alla 0.2.1; i segreti del progetto dietro un collegamento (dalla
     0.1.24 alla 0.2.1), un secondo nome dello stesso file (dalla 0.1.33 alla 0.2.1) o un file di esempio (dalla 0.1.31 alla
     0.2.1), letti senza carta; e una cancellazione critica dopo che il comando era passato all'altro disco con la sola
     lettera, dalla 0.2.0 alla 0.2.1.
  3. **La lettera del disco seguita da un percorso senza barra** (relativo alla cartella corrente di quel disco). Qui basta un
     disco solo. Che cosa toccava: la lettura di un file di credenziali della tua casa in **Accesso pieno**, da un comando e
     dagli attrezzi dei file, dalla 0.1.33 alla 0.2.1; una cartella bloccata per un dispositivo, a ogni livello di accesso,
     dalla 0.2.0 alla 0.2.1.

  Solo Windows. **Che cosa fare: aggiornare.**

- **Windows: more spellings of the same protected places are recognised.** Slashes doubled after the drive letter were taken
  for a web address: a credential file of your home was read with no card at every access level, a secret file of the project
  was read or changed with no card, and a critical delete was not seen (from 0.1.14, the first version that read them so,
  to 0.2.1, each protection from the version it came in). The long form of a path and this computer's own network name are
  now read as the disk they are also when writing a credential file, for blocked folders and for a second name of a secret
  file. The other ways Windows has of naming your home in a command (the home without its drive, also after a drive letter
  as in `C:%HOMEPATH%`, the home in two pieces, the PowerShell form with braces) are read as the home: reading a credential
  file through the first one asks in Full access, and at the other access levels a file that is secret for what it contains
  is recognised through all of them. A command that first moves into a folder with `cd`, `chdir`, `pushd`, `sl`,
  `Set-Location` or `Push-Location` and then reads a credential file there by a relative name asks in Full access. A folder
  blocked for a device named by a command the way Git Bash writes a drive is refused. In cmd a critical delete is judged
  from the folder each drive was left in (a `cd` to another drive without `/d` does not move there); inside
  `powershell -Command` or `bash -c` a `cd` to another drive does move, and is read that way.
- **Windows: più grafie degli stessi posti protetti vengono riconosciute.** Le barre raddoppiate dopo la lettera del disco
  erano prese per un indirizzo web: un file di credenziali della tua casa veniva letto senza carta a ogni livello di accesso,
  un file segreto del progetto veniva letto o cambiato senza carta, e una cancellazione critica non veniva vista (dalla
  0.1.14, la prima versione che le leggeva così, alla 0.2.1, ogni protezione dalla versione in cui è arrivata). La forma
  lunga di un percorso e il nome di rete di questo stesso computer ora sono letti come il disco che sono anche per chi scrive
  un file di credenziali, per le cartelle bloccate e per un secondo nome di un file segreto. Gli altri modi che Windows ha di
  nominare la tua casa in un comando (la casa senza il suo disco, anche dopo una lettera di disco come in `C:%HOMEPATH%`, la
  casa in due pezzi, la forma di PowerShell con le graffe) sono letti come la casa: leggere un file di credenziali attraverso
  il primo chiede in Accesso pieno, e agli altri livelli di accesso un file che è segreto per ciò che contiene viene
  riconosciuto attraverso tutti. Un comando che prima si sposta in una cartella con `cd`, `chdir`, `pushd`, `sl`,
  `Set-Location` o `Push-Location` e poi lì legge un file di credenziali col nome relativo chiede in Accesso pieno. Una
  cartella bloccata per un dispositivo nominata da un comando come Git Bash scrive un disco viene rifiutata. In cmd una
  cancellazione critica viene giudicata dalla cartella in cui ogni disco è stato lasciato (un `cd` verso un altro disco
  senza `/d` non ci si sposta); dentro `powershell -Command` o `bash -c` un `cd` verso un altro disco si sposta davvero, e
  così viene letto.

- **Windows: the long form of a path with doubled slashes is recognised.** A credential file of your home or a secret file of
  the project written as `\\?\C:\\Users\\…` (the long form, with the slashes doubled after the drive letter) was read by the
  file tools with no card in Workspace write and in On request with only the ordinary card of a read, and the credential file
  also in Full access up to 0.2.1 (from 0.1.14, the first version that read doubled slashes, to 0.2.1). The same doubled
  slashes after `\\.\`, `\??\`, `\\?\GLOBALROOT\` and `\\?\UNC\` are joined too: a command such as
  `Get-Content '\\.\C:\\Users\\…'` that reads a credential file or a secret file of the project now asks in Workspace write,
  where it passed with no card. In Full access a credential file of your home written as `\??\C:\…` or
  `\\?\GLOBALROOT\??\C:\…`, also with the slashes doubled after the prefix, now asks, from a command and from the file tools.
- **Windows: la forma lunga di un percorso con le barre raddoppiate viene riconosciuta.** Un file di credenziali della tua casa
  o un file segreto del progetto scritto come `\\?\C:\\Users\\…` (la forma lunga, con le barre raddoppiate dopo la lettera del
  disco) veniva letto dagli attrezzi dei file senza carta in Scrive nel progetto e in Su richiesta con la sola carta di sempre
  di una lettura, e il file di credenziali fino alla 0.2.1 anche in Accesso pieno (dalla 0.1.14, la prima versione che leggeva
  le barre raddoppiate, alla 0.2.1). Si uniscono anche le stesse barre raddoppiate dopo `\\.\`, `\??\`, `\\?\GLOBALROOT\` e
  `\\?\UNC\`: un comando come `Get-Content '\\.\C:\\Users\\…'` che legge un file di credenziali o un file segreto del progetto
  ora chiede in Scrive nel progetto, dove passava senza carta. In Accesso pieno un file di credenziali della tua casa scritto
  come `\??\C:\…` o `\\?\GLOBALROOT\??\C:\…`, anche con le barre raddoppiate dopo il prefisso, ora chiede, da un comando e
  dagli attrezzi dei file.

- **The card of a critical delete names the place the system will delete.** For a path with a one-letter folder and no drive
  letter the card could show a drive that does not exist.
- **La carta della cancellazione critica nomina il posto che il sistema cancellerà.** Per un percorso con una cartella di una
  lettera e senza la lettera del disco la carta poteva mostrare un disco che non esiste.
- **Windows: a `cd` that does not stay no longer moves the commands after it.** In bash a `cd` sent to the background with
  `&`, closed in a subshell `( … )` or put in a pipe (also inside a group in braces, `{ cd x; } | true`) runs in a child
  process: the commands after it still run where they were, so `bash -c "cd /d/build & rm -rf *"` deletes the project. Inside
  a command given to bash with `bash -c`, `sh -c`, `bash <<<` or `echo … | bash` (not with `bash -s <<EOF`: see Known limits),
  and for a Git Bash `cd /x/…` sent to the background at the start of a command, such a `cd` no longer moves: the critical
  delete after it now asks, in Full access and in Workspace write. Up to 0.2.1 it passed with no card (measured). An `&`
  inside a subshell or a group sends only what is inside it to the background: `bash -c "cd src; cd .. && (npm run dev &) ;
  rm -rf *"` asks, as in 0.2.1.
- **Everywhere: before deleting a critical folder, TALOS asks at least every time 0.2.1 asked.** This version carries the
  check of 0.2.1 unchanged (its file, byte for byte; a test fails if one byte changes) next to the new one, and asks if
  either of the two asks; the reason on the card is the new check's when it asks. The new check also reads more: wherever
  it thinks a `cd` does not stay (sent to the background, in a subshell, in a pipe), it also reads the case where the `cd`
  stays, in every combination; a variable set inside `eval` keeps the values of every case (`cd src; eval 'cd .. && echo
  ${x/\}/&}; X=$PWD'; rm -rf "$X"` deletes the project in bash, and it asks); and an `&` inside `${…}` no longer splits the
  command (`echo ${x/\}/&} cd project && rm -rf "$PWD"` is a single `echo` for bash, and the delete after it asks). Before
  this, two forms like these passed with no card in the test builds of this repair (measured), while 0.2.1 asked. Measured
  against 0.2.1 taken from its own commit, with the whole permission check in Full access and in Workspace write, on 4,000
  random commands from two generators and on every form of the four reviews, on Windows, Linux, Android and macOS: no card of
  0.2.1 is missing. When only the check of 0.2.1 asks, the card is the one 0.2.1 showed: on 3,200,000 random commands this
  happened once (a Windows command too nested to follow). The 20 typical commands, 12 common ones, 14 Linux, 13 phone and 15
  macOS commands still get no card.
- **Windows: un `cd` che non resta non sposta più i comandi dopo di lui.** In bash un `cd` mandato in sottofondo con `&`,
  chiuso in una sottoshell `( … )` o messo in una pipe (anche dentro un gruppo fra graffe, `{ cd x; } | true`) gira in un
  processo figlio: i comandi dopo di lui girano ancora dov'erano, quindi `bash -c "cd /d/build & rm -rf *"` cancella il
  progetto. Dentro un comando dato a bash con `bash -c`, `sh -c`, `bash <<<` o `echo … | bash` (non con `bash -s <<EOF`: vedi
  Limiti noti), e per un `cd /x/…` di Git Bash mandato in sottofondo all'inizio di un comando, un `cd` così non sposta più:
  la cancellazione critica dopo di lui ora chiede, in Accesso pieno e in Scrive nel progetto. Fino alla 0.2.1 passava senza
  carta (misurato). Un `&` dentro una sottoshell o un gruppo manda in sottofondo solo ciò che sta dentro: `bash -c "cd src;
  cd .. && (npm run dev &) ; rm -rf *"` chiede, come nella 0.2.1.
- **Ovunque: prima di cancellare una cartella critica TALOS chiede almeno tutte le volte che chiedeva la 0.2.1.** Questa
  versione porta il controllo della 0.2.1 tale e quale (il suo file, byte per byte; una prova fallisce se cambia un byte)
  accanto a quello nuovo, e chiede se chiede uno dei due; il motivo sulla carta è quello del controllo nuovo quando chiede.
  Anche il controllo nuovo legge di più: dove pensa che un `cd` non resti (mandato in sottofondo, in una sottoshell, in una
  pipe), legge anche il caso in cui il `cd` resta, in ogni combinazione; una variabile scritta dentro `eval` tiene i valori di
  tutti i casi (`cd src; eval 'cd .. && echo ${x/\}/&}; X=$PWD'; rm -rf "$X"` in bash cancella il progetto, e chiede); e un `&`
  dentro `${…}` non spezza più il comando (`echo ${x/\}/&} cd progetto && rm -rf "$PWD"` per bash è un solo `echo`, e la
  cancellazione dopo chiede). Prima di questo, due forme come queste passavano senza carta nelle versioni di prova di questa
  riparazione (misurato), mentre la 0.2.1 chiedeva. Misurato contro la 0.2.1 presa dal suo commit, col controllo dei permessi
  intero in Accesso pieno e in Scrive nel progetto, su 4.000 comandi a caso di due generatori e su ogni forma delle quattro
  revisioni, su Windows, Linux, Android e macOS: non manca nessuna carta della 0.2.1. Quando chiede solo il controllo della
  0.2.1, la carta è quella che mostrava la 0.2.1: su 3.200.000 comandi a caso è successo una volta (un comando di Windows
  troppo annidato per seguirlo). I 20 comandi tipici, i 12 comuni, i 14 di Linux, i 13 del telefono e i 15 di macOS
  continuano a non avere carte.
- **Everywhere: two fixed ceilings on the work of checking one command.** The new check reads every `cd` that may not stay
  in both cases, and every reading goes over all the targets again, once for every value of a `for`; in the permission check a
  target ending with a slash also asks the disk for its real path. In the test builds of this repair the ceiling held for each
  level, so cases inside cases multiplied (eight `(cd x && npm i)` and eight more inside a `bash -c` took 2.8-3.8 s; with a
  third level more than 100 s), and the next test build, with a ceiling of 300 readings, still let an honest command of 551
  characters (eight `(cd packages/x && npm ci)` and a `for` of 16 packages with six folders each) keep the check busy for
  0.9-1.8 s, and one of 864 characters for 10-14 s, while TALOS waited (measured by the reviewer). Now each command has two
  fixed numbers, not times, summed over every level, every case, every Windows pass and every reading: at most 300 readings,
  and at most 10,000 units of work (a reading is 2 units plus one every 64 characters, a command 1, a target 3, a real path
  asked of the disk 12; a target counts once for each value of a `for` and each choice of braces). Past either ceiling it asks
  «too nested» instead of reading on. Measured with the whole permission check, CPU under 50 %: the commands of 551 and 864
  characters now ask in 40-64 ms on Windows, Linux, Android and macOS (0.2.1, which reads them less, 29-33 ms and 245-265 ms);
  eight and eight 21-33 ms, eight, eight and eight 12-18 ms; the 20 typical commands take as long as before (0.99-1.04 times
  the previous test build). The check of a command right under the ceiling takes at most about 60 ms. The slowest whole
  permission checks the reviewers found did not come from this ceiling: the decision of 0.2.1, which travels inside TALOS,
  read the whole environment again for every variable of the command and, for the project folders, for every target. One
  word made of an unknown variable repeated (`rm -rf "$a$a…$a"/x`, 16,011 characters, far under the ceiling) kept the check
  busy 1.2-1.9 s, in 0.2.1 too, and a delete of 3,237 folders (18,318 characters, right at the ceiling) 0.62-1.27 s. Now that
  decision reads the environment once for each command, never kept for the next one, with the same results (compared on
  15,558 commands with four sets of variables on Windows, Linux, Android and macOS: no difference). Measured with the whole
  permission check, four runs with the CPU of the machine under 50 % for the whole run (sampled every 10 s), on Windows,
  Linux, Android and macOS: the 16,011-character word 8.5-23 ms (0.2.1: 1.03-1.89 s), 12,021 characters inside `bash -c` on
  Windows 11-18 ms (0.2.1: 0.79-1.34 s), the 3,237 folders 0.21-0.45 s (0.2.1: 0.58-1.17 s). Why 10,000: no
  honest command we measured needs more than 6,528 units (the 23,272 random commands of the reviewers, the five groups of
  honest commands, the forms of the reviews), and the slowest thing it counts, a real path asked of the disk, costs about
  40 µs on Windows.
- **Ovunque: due tetti fissi sul lavoro del controllo di un comando.** Il controllo nuovo legge ogni `cd` che può non
  restare nei due casi, e ogni lettura ripassa tutti i bersagli, una volta per ogni valore di un `for`; nel controllo dei
  permessi un bersaglio con la barra in coda chiede anche al disco il suo percorso vero. Nelle versioni di prova di questa
  riparazione il tetto valeva per ogni livello, quindi i casi dentro i casi si moltiplicavano (otto `(cd x && npm i)` e altri
  otto dentro un `bash -c` chiedevano 2,8-3,8 s; con un terzo livello più di 100 s), e la versione di prova dopo, col tetto di
  300 letture, lasciava ancora un comando onesto di 551 caratteri (otto `(cd packages/x && npm ci)` e un `for` di 16 pacchetti
  con sei cartelle ciascuno) tenere occupato il controllo per 0,9-1,8 s, e uno di 864 caratteri per 10-14 s, mentre TALOS
  aspettava (misurato dal revisore). Ora ogni comando ha due numeri fissi, non tempi, sommati su ogni livello, ogni caso, ogni
  giro di Windows e ogni lettura: al massimo 300 letture, e al massimo 10.000 unità di lavoro (una lettura vale 2 unità più una
  ogni 64 caratteri, un comando 1, un bersaglio 3, un percorso vero chiesto al disco 12; un bersaglio conta una volta per ogni
  valore di un `for` e ogni scelta delle graffe). Oltre uno dei due tetti chiede «troppo annidato» invece di continuare a
  leggere. Misurato col controllo dei permessi intero, CPU sotto il 50 %: i comandi di 551 e 864 caratteri ora chiedono in
  40-64 ms su Windows, Linux, Android e macOS (la 0.2.1, che li legge meno, 29-33 ms e 245-265 ms); otto e otto 21-33 ms, otto,
  otto e otto 12-18 ms; i 20 comandi tipici ci mettono quanto prima (0,99-1,04 volte la versione di prova precedente). Il
  controllo di un comando appena sotto il tetto ci mette al massimo circa 60 ms. I controlli dei permessi interi più lenti
  trovati dai revisori non venivano da questo tetto: la decisione della 0.2.1, che viaggia dentro TALOS, rileggeva tutto
  l'ambiente per ogni variabile del comando e, per le cartelle dei progetti, per ogni bersaglio. Una parola fatta di una
  variabile sconosciuta ripetuta (`rm -rf "$a$a…$a"/x`, 16.011 caratteri, lontanissima dal tetto) teneva occupato il controllo
  1,2-1,9 s, anche nella 0.2.1, e una cancellazione di 3.237 cartelle (18.318 caratteri, proprio al tetto) 0,62-1,27 s. Ora
  quella decisione legge l'ambiente una volta per ogni comando, mai tenuto per il comando dopo, con gli stessi risultati
  (confrontati su 15.558 comandi con quattro insiemi di variabili su Windows, Linux, Android e macOS: nessuna differenza).
  Misurato col controllo dei permessi intero, quattro corse con la CPU della macchina sotto il 50 % per tutta la corsa
  (un campione ogni 10 s), su Windows, Linux, Android e macOS: la parola di 16.011 caratteri 8,5-23 ms (la 0.2.1: 1,03-1,89 s),
  12.021 caratteri dentro `bash -c` su Windows 11-18 ms (la 0.2.1: 0,79-1,34 s), le 3.237 cartelle 0,21-0,45 s (la 0.2.1:
  0,58-1,17 s). Perché 10.000: nessun
  comando onesto che abbiamo misurato ha bisogno di più di 6.528 unità (i 23.272 comandi a caso dei revisori, i cinque gruppi di
  comandi onesti, le forme delle revisioni), e la cosa più lenta che conta, un percorso vero chiesto al disco, costa circa 40 µs
  su Windows.
- **Linux, Android and macOS: a `cd` that does not stay no longer moves the commands after it.** There a POSIX shell runs
  the command, so the same rule of bash now holds: `cd /srv/dati/build & rm -rf *`, `(cd /srv/dati/build); rm -rf *`,
  `cd /srv/dati/build | true; rm -rf *` and `{ cd /srv/dati/build; } | tee log; rm -rf *`, at the start of a command or
  inside `bash -c` and `sh -c`, delete the folder of the command: the critical delete after them now asks, in Full access and
  in Workspace write. Up to 0.2.1 they passed with no card off Windows (measured). Honest commands such as `cd
  /srv/dati/build && rm -rf *` or `(cd src && npm run build) && rm -rf dist` still pass with no card. A compound command in a
  pipe (`if … fi | cat`, `while … done | cat`, `case … esac | cat`) also runs in a subshell: `if true; then cd /srv/x; fi |
  cat; rm -rf *` asks. The known limits of this rule are the ones listed below for a command given to bash by name (`CDPATH`,
  `pushd -n`, a group with a redirection before the pipe, a `)` in quotes inside `$( … )`, a function, a `cd` that fails, `\;&`);
  `bash -s <<EOF` is followed here.
- **Linux, Android e macOS: un `cd` che non resta non sposta più i comandi dopo di lui.** Lì il comando lo esegue una shell
  POSIX, quindi ora vale la stessa regola di bash: `cd /srv/dati/build & rm -rf *`, `(cd /srv/dati/build); rm -rf *`, `cd
  /srv/dati/build | true; rm -rf *` e `{ cd /srv/dati/build; } | tee log; rm -rf *`, all'inizio di un comando o dentro `bash
  -c` e `sh -c`, cancellano la cartella del comando: la cancellazione critica dopo di loro ora chiede, in Accesso pieno e in
  Scrive nel progetto. Fino alla 0.2.1 passavano senza carta fuori da Windows (misurato). I comandi onesti come `cd
  /srv/dati/build && rm -rf *` o `(cd src && npm run build) && rm -rf dist` passano ancora senza carta. Anche un comando
  composto in una pipe (`if … fi | cat`, `while … done | cat`, `case … esac | cat`) gira in una sottoshell: `if true; then cd
  /srv/x; fi | cat; rm -rf *` chiede. I limiti noti di questa regola sono quelli elencati sotto per un comando dato a bash per
  nome (`CDPATH`, `pushd -n`, un gruppo con una redirezione prima della pipe, una `)` fra virgolette dentro `$( … )`, una
  funzione, un `cd` che fallisce, `\;&`); `bash -s <<EOF` qui viene seguito.
- **Windows: a command given to bash inside WSL is read like bash.** `wsl bash -c "rm -rf *"`, `wsl -e bash -c …` and
  `wsl sh -c …` (also with `-d`, `-u`, `--shell-type` or `--cd`) start in the folder of the command, so they delete the
  project: the critical delete now asks, in Full access and in Workspace write. Up to 0.2.1 it passed with no card
  (measured, on the text of the command only).
- **Windows: un comando dato a bash dentro WSL viene letto come bash.** `wsl bash -c "rm -rf *"`, `wsl -e bash -c …` e
  `wsl sh -c …` (anche con `-d`, `-u`, `--shell-type` o `--cd`) partono nella cartella del comando, quindi cancellano il
  progetto: la cancellazione critica ora chiede, in Accesso pieno e in Scrive nel progetto. Fino alla 0.2.1 passava senza
  carta (misurato, solo sul testo del comando).
- **Windows: `%ComSpec% /c` is read as cmd also when the variable is missing from the environment TALOS started with.** A
  `cd` without `/d` inside it does not move, and the critical delete after it asks.
- **Windows: `%ComSpec% /c` viene letto come cmd anche quando la variabile manca dall'ambiente con cui TALOS è partito.** Un
  `cd` senza `/d` lì dentro non sposta, e la cancellazione critica dopo di lui chiede.

#### Known limits

- The check reads the command, it does not run it: a script that builds the path while it runs is not seen, and a credential
  read by a later command, after an earlier one moved to another folder, is judged from the folder of the session. A command
  that changes folder more than sixteen times asks instead of guessing, also in Full access (a Git Bash path like `/c/…`
  counts as one move); when every move goes to a different drive with a Git Bash path it asks at the tenth move (see below).
- Il controllo legge il comando, non lo esegue: uno script che costruisce il percorso mentre gira non si vede, e una
  credenziale letta da un comando successivo, dopo che uno precedente si è spostato in un'altra cartella, viene giudicata
  dalla cartella della sessione. Un comando che cambia cartella più di sedici volte chiede invece di tirare a indovinare,
  anche in Accesso pieno (un percorso di Git Bash come `/c/…` conta come uno spostamento); quando ogni spostamento va su un
  disco diverso con un percorso di Git Bash chiede al decimo spostamento (vedi sotto).
- When every `cd` goes to a different drive with a Git Bash path (`cd /a/…`, then `cd /b/…`, then `cd /d/…`) the ceiling of
  the folders a command can be followed through comes at the tenth move instead of the seventeenth: in Full access the
  command then asks, also when it is honest. With two drives that alternate (`cd /a/…`, `cd /b/…`, `cd /a/…`), as on one
  drive, it asks at the seventeenth move. New in this version: 0.2.1 had no ceiling and did not follow these moves (measured).
- Quando ogni `cd` va su un disco diverso con un percorso di Git Bash (`cd /a/…`, poi `cd /b/…`, poi `cd /d/…`) il tetto
  delle cartelle in cui un comando si può seguire arriva al decimo spostamento invece che al diciassettesimo: in Accesso pieno
  il comando allora chiede, anche quando è onesto. Con due dischi che si alternano (`cd /a/…`, `cd /b/…`, `cd /a/…`), come su
  un disco solo, chiede al diciassettesimo spostamento. Nuovo in questa versione: la 0.2.1 non aveva il tetto e non seguiva
  questi spostamenti (misurato).
- A `cd` that does not stay is still followed in these cases: at the start of a command not given to bash by name, a
  subshell, a pipe, a group in braces or a list sent to the background (for example `(cd build) && rm -rf *` or
  `{ cd x; } & rm -rf *`); and PowerShell's `Start-Job { cd … }`. A critical delete after it can pass with no card, as in
  0.2.1 (measured by the checker). The same inside `bash -s <<EOF` (its text is not read with the rule of bash), after
  `CDPATH=…` (a `cd` to a relative name can land in another folder), after `pushd -n` (it does not change folder) and for a
  group in braces with a redirection before the pipe (`{ cd x && make; } 2>&1 | tee log`): as in 0.2.1 (measured).
- Un `cd` che non resta viene ancora seguito in questi casi: all'inizio di un comando non dato a bash per nome, una
  sottoshell, una pipe, un gruppo fra graffe o una lista mandata in sottofondo (per esempio `(cd build) && rm -rf *` o
  `{ cd x; } & rm -rf *`); e `Start-Job { cd … }` di PowerShell. Una cancellazione critica dopo di lui può passare senza
  carta, come nella 0.2.1 (misurato dal controllore). Lo stesso dentro `bash -s <<EOF` (il suo testo non viene letto con la
  regola di bash), dopo `CDPATH=…` (un `cd` verso un nome relativo può finire in un'altra cartella), dopo `pushd -n` (non
  cambia cartella) e per un gruppo fra graffe con una redirezione prima della pipe (`{ cd x && make; } 2>&1 | tee log`): come
  nella 0.2.1 (misurato).
- The price of reading both cases: a `cd` that really does not stay, but would fall in a critical folder if it stayed, still
  asks when the command is honest, as in 0.2.1 (for example `bash -c "cd src; cd .. | true; rm -rf *"` or `bash -c "cd src;
  (cd .. && make); rm -rf *"`, where bash deletes inside `src`). Measured on the 368 forms of the reviews: 12 such cards (10 on
  Windows) that the previous test build did not show, all of them also in 0.2.1; none on the 20 typical commands, the 12
  common ones, 14 Linux and 13 phone commands.
- Four cards are new compared with 0.2.1. The check reads a `}` after a backslash both ways, also as closing `${`, so an `&`
  after it can look like a background: `bash -c 'cd /d/work/build && echo ${x/\}/&}; rm -rf *'` asks naming the project, while
  bash deletes inside `build`; and after an `eval` a variable keeps the values of both readings: `cd src; eval 'echo ${x/\}/&}
  cd ..; X=$PWD'; rm -rf "$X"` asks naming the project, while bash deletes `src` (measured). On Windows, inside `bash -c "…"`,
  a quote written `\"` keeps its backslash in the path, which then reads as a network path: `bash -c "X=/k/data/out; echo
  \${x/a/&}; rm -rf \"\$X\"/*"` asks naming the top-level folder `\\k\data\out`, while bash deletes inside `K:\data\out`;
  0.2.1 already asked the same for the form with the path written out (`rm -rf \"/k/data/out\"/*`), and the new one asks only
  with an `&` inside `${…}` (measured). The real reader of the shell will fix all three. And inside bash (off Windows, or in a
  command given to bash with `bash -c` on Windows) more than eight `cd` that may or may not stay in one command (for example
  nine `(cd x && npm i)` in a row, then `rm -rf dist`) ask instead of being followed, also when honest; at the first level of a
  Windows command they are not read this way (cmd has no subshells) and do not ask.
- The price of the ceiling of 300 readings: an honest command that would need more asks «too nested». Eight `(cd x && npm i)`
  with eight more inside a `bash -c` (also seven and seven, five and five, three levels of three or of four), eight `(cd x &&
  …)` and one `$(…)`, seven and two, six and four, 300 `$(…)` in one command (150 inside a `bash -c`), and on Windows a `cd` to
  another drive without `/d` with 100 `$(…)`. Measured on 13 such commands on Windows, Linux, Android and macOS: 11 ask on
  Windows and 10 on the others, where the previous test build asked for none (and took seconds for the first one); none of
  the 20 typical commands, the 12 common ones, 14 Linux, 13 phone and 15 macOS commands, and none of the 18,000 random commands
  of the reviewer.
- The price of the ceiling of 10,000 units of work: an honest command with a lot of work asks «too nested». Eight `(cd x &&
  …)` followed by `rm -rf dist/ build/` (two targets with a slash, read in 256 cases), four and four `(cd x && …)` with `rm -rf
  dist/ build/` inside a `bash -c`, a monorepo cleanup with eight `(cd packages/x && npm ci)` and a `for` over 8 to 16 packages
  with two to six folders each, a `for` of 16 values with 42 folders each, one `rm -rf` of 700 folders with a slash (3,500
  without), on Windows `rd /s /q` of 700 folders or `Remove-Item` of 700 folders. Measured on 23 such commands on Windows,
  Linux, Android and macOS: 12 ask on Windows and 10 on the others, where the previous test build asked for none (and took
  seconds for the monorepo ones); eight `(cd x && …)` with `rm -rf dist/`, with six folders without a slash, or with a `for` of
  16 values and six folders without `cd`, still pass. None of the 20 typical commands, the 12 common ones, 14 Linux, 13 phone
  and 15 macOS commands, and none of the 23,272 random commands of the reviewers, asks for this.
- Il prezzo della lettura dei due casi: un `cd` che davvero non resta, ma che se restasse cadrebbe in una cartella critica,
  chiede ancora quando il comando è onesto, come nella 0.2.1 (per esempio `bash -c "cd src; cd .. | true; rm -rf *"` o
  `bash -c "cd src; (cd .. && make); rm -rf *"`, dove bash cancella dentro `src`). Misurato sulle 368 forme delle revisioni:
  12 carte così (10 su Windows) che la versione di prova precedente non mostrava, tutte presenti anche nella 0.2.1; nessuna sui
  20 comandi tipici, sui 12 comuni, su 14 comandi di Linux e 13 del telefono.
- Quattro carte sono nuove rispetto alla 0.2.1. Il controllo legge una `}` dopo una barra rovescia nei due modi, anche come
  fine di `${`, quindi un `&` dopo di lei può sembrare un sottofondo: `bash -c 'cd /d/work/build && echo ${x/\}/&}; rm -rf *'`
  chiede nominando il progetto, mentre bash cancella dentro `build`; e dopo un `eval` una variabile tiene i valori delle due
  letture: `cd src; eval 'echo ${x/\}/&} cd ..; X=$PWD'; rm -rf "$X"` chiede nominando il progetto, mentre bash cancella `src`
  (misurato). Su Windows, dentro `bash -c "…"`, una virgoletta scritta `\"` lascia la sua barra nel percorso, che allora si
  legge come un percorso di rete: `bash -c "X=/k/data/out; echo \${x/a/&}; rm -rf \"\$X\"/*"` chiede nominando la cartella di
  primo livello `\\k\data\out`, mentre bash cancella dentro `K:\data\out`; la 0.2.1 chiedeva già lo stesso per la forma col
  percorso scritto (`rm -rf \"/k/data/out\"/*`), e quella nuova chiede solo con un `&` dentro `${…}` (misurato). Le sistemerà
  tutte e tre il lettore vero della shell. E dentro bash (fuori da Windows, o in un comando dato a bash con `bash -c` su
  Windows) più di otto `cd` che possono restare o no in un comando solo (per esempio nove `(cd x && npm i)` di fila, poi `rm
  -rf dist`) chiedono invece di essere seguiti, anche quando sono onesti; al primo livello di un comando di Windows non si
  leggono così (cmd non ha sottoshell) e non chiedono.
- Il prezzo del tetto di 300 letture: un comando onesto che ne chiederebbe di più chiede «troppo annidato». Otto `(cd x && npm
  i)` con altri otto dentro un `bash -c` (anche sette e sette, cinque e cinque, tre livelli da tre o da quattro), otto `(cd x
  && …)` e un `$(…)`, sette e due, sei e quattro, 300 `$(…)` in un comando (150 dentro un `bash -c`), e su Windows un `cd`
  verso un altro disco senza `/d` con 100 `$(…)`. Misurato su 13 comandi così su Windows, Linux, Android e macOS: ne chiedono
  11 su Windows e 10 sugli altri, dove la versione di prova precedente non ne chiedeva nessuno (e per il primo ci metteva
  secondi); nessuno fra i 20 comandi tipici, i 12 comuni, i 14 di Linux, i 13 del telefono e i 15 di macOS, e nessuno dei
  18.000 comandi a caso del revisore.
- Il prezzo del tetto di 10.000 unità di lavoro: un comando onesto con tanto lavoro chiede «troppo annidato». Otto `(cd x &&
  …)` seguiti da `rm -rf dist/ build/` (due bersagli con la barra, letti in 256 casi), quattro e quattro `(cd x && …)` con `rm
  -rf dist/ build/` dentro un `bash -c`, una pulizia di monorepo con otto `(cd packages/x && npm ci)` e un `for` su 8-16
  pacchetti con da due a sei cartelle ciascuno, un `for` di 16 valori con 42 cartelle ciascuno, un `rm -rf` di 700 cartelle con
  la barra (3.500 senza), su Windows `rd /s /q` di 700 cartelle o `Remove-Item` di 700 cartelle. Misurato su 23 comandi così su
  Windows, Linux, Android e macOS: ne chiedono 12 su Windows e 10 sugli altri, dove la versione di prova precedente non ne
  chiedeva nessuno (e per quelli del monorepo ci metteva secondi); otto `(cd x && …)` con `rm -rf dist/`, con sei cartelle senza
  barra, o un `for` di 16 valori e sei cartelle senza `cd`, passano ancora. Nessuno fra i 20 comandi tipici, i 12 comuni, i 14
  di Linux, i 13 del telefono e i 15 di macOS, e nessuno dei 23.272 comandi a caso dei revisori, chiede per questo.
- Three cases are not followed, as in 0.2.1 (measured): a `)` in quotes inside `$( … )` hides the commands after it (`bash -c
  'x=$(echo ")"); rm -rf *'`), a `cd` inside a function (`function f { cd ..; }; cd src; f; rm -rf *`), and a `cd` that fails
  (`cd nonesiste; rm -rf *`: bash stays where it was). A critical delete after them can pass with no card.
- Tre casi non vengono seguiti, come nella 0.2.1 (misurato): una `)` fra virgolette dentro `$( … )` nasconde i comandi dopo di
  lei (`bash -c 'x=$(echo ")"); rm -rf *'`), un `cd` dentro una funzione (`function f { cd ..; }; cd src; f; rm -rf *`), e un
  `cd` che fallisce (`cd nonesiste; rm -rf *`: bash resta dov'era). Una cancellazione critica dopo di loro può passare senza
  carta.
- An `&` right after `\;` or after a backslash at the end of a line is not seen as a background, as in 0.2.1 (measured): in
  `bash -c "cd /d/work/build && find . -exec ls {} \;& rm -rf *"` the `cd` goes to the background and `rm -rf *` deletes the
  project, with no card.
- Un `&` subito dopo `\;` o dopo una barra rovescia in fondo alla riga non viene visto come sottofondo, come nella 0.2.1
  (misurato): in `bash -c "cd /d/work/build && find . -exec ls {} \;& rm -rf *"` il `cd` va in sottofondo e `rm -rf *` cancella il
  progetto, senza carta.
- Inside WSL `~` is the Linux home: `wsl sh -c "rm -rf ~"` asks naming your Windows home, and `wsl ~ bash -c "rm -rf *"`
  (which starts in the Linux home) passes with no card, as in 0.2.1 (measured, on the text of the command only).
- Dentro WSL `~` è la casa di Linux: `wsl sh -c "rm -rf ~"` chiede nominando la tua casa di Windows, e `wsl ~ bash -c
  "rm -rf *"` (che parte nella casa di Linux) passa senza carta, come nella 0.2.1 (misurato, solo sul testo del comando).
- An example file (such as `.env.example`) that holds a real key, read by a relative name after a `cd` or `pushd` to another
  folder, is judged from the folder of the session: in Full access and Workspace write it passes with no card, as in 0.2.1
  (measured by the checker). The same file named with its full path asks.
- Un file d'esempio (come `.env.example`) che contiene una chiave vera, letto col nome relativo dopo un `cd` o un `pushd` verso
  un'altra cartella, viene giudicato dalla cartella della sessione: in Accesso pieno e in Scrive nel progetto passa senza carta,
  come nella 0.2.1 (misurato dal controllore). Lo stesso file nominato col percorso intero chiede.
- In Full access, a command that moves into your home without `cd`, `pushd` or `Set-Location` (a variable set in the same
  command, `cd..` written together, `git -C`, `start /d`, `Start-Process -WorkingDirectory`, `env -C`, or `cd C:%HOMEPATH%`)
  and then reads a credential file by a relative name is judged from the folder of the session, as in 0.2.1.
- In Accesso pieno, un comando che entra nella tua casa senza `cd`, `pushd` o `Set-Location` (una variabile assegnata nello
  stesso comando, `cd..` scritto attaccato, `git -C`, `start /d`, `Start-Process -WorkingDirectory`, `env -C`, oppure
  `cd C:%HOMEPATH%`) e poi legge un file di credenziali col nome relativo viene giudicato dalla cartella della sessione, come
  nella 0.2.1.
- In Full access a credential file of your home can still be read with no card after a bare drive letter followed by a
  relative path or a `cd` with no drive, after `cd/d` with no space, after `start /d`, or after moving with a PowerShell
  variable.
- In Accesso pieno un file di credenziali della tua casa si può ancora leggere senza carta dopo la sola lettera del disco
  seguita da un percorso relativo o da un `cd` senza disco, dopo `cd/d` senza spazio, dopo `start /d`, o dopo uno
  spostamento con una variabile di PowerShell.
- A `cd` to a folder written with a wildcard (`cd C:\Users\you\*`, `cd C:\Users\you\Doc*`) is not followed: a read after it
  is judged from the folder the command was in before, as in 0.2.1.
- Un `cd` verso una cartella scritta con un carattere jolly (`cd C:\Users\tu\*`, `cd C:\Users\tu\Doc*`) non viene seguito:
  una lettura dopo di lui viene giudicata dalla cartella in cui il comando era prima, come nella 0.2.1.
- A folder blocked for a device can still be read, at every access level, by a command that first moves next to it and then
  names it with a relative path (for example `cd ..` then `type blocked\file`).
- Una cartella bloccata per un dispositivo si può ancora leggere, a ogni livello di accesso, con un comando che prima si
  sposta accanto a lei e poi la nomina con un percorso relativo (per esempio `cd ..` e poi `type bloccata\file`).
- A command that first moves into the folder above a folder blocked for a device and then reads inside it is not refused
  (as in 0.2.0 and 0.2.1).
- Un comando che prima si sposta nella cartella sopra una cartella bloccata per un dispositivo e poi ci legge dentro non
  viene rifiutato (come nella 0.2.0 e nella 0.2.1).
- In Full access `git clean -fdx`, which also deletes ignored files such as `.env`, passes with no card, and so does a change
  to an `.env.example` file by the file tools (`robocopy /MIR` onto the project or the home is seen as a critical delete).
- In Accesso pieno `git clean -fdx`, che cancella anche i file ignorati come `.env`, passa senza carta, e così una modifica a
  un file `.env.example` dagli attrezzi dei file (`robocopy /MIR` sul progetto o sulla casa viene visto come cancellazione
  critica).
- Known limits on Windows: a drive letter that is an alias of a folder and a project opened through this computer's own
  network path are not always recognised as the protected place. A path written relative to a drive's current folder is read
  from the folder of the session and from the top of that drive, not from a folder an earlier command moved to.
- Limiti noti su Windows: una lettera di disco che è il nome di comodo di una cartella e un progetto aperto dal percorso di
  rete di questo stesso computer non sempre vengono riconosciuti come il posto protetto. Un percorso relativo alla cartella
  corrente di un disco viene letto dalla cartella della sessione e dalla cima di quel disco, non da una cartella in cui un
  comando precedente si era spostato.
- Known limits on Windows: a protected path written through an unusual alias (a file:// address, a prefix glued to the path,
  a variable other than the home ones, an NTFS stream on a folder, a Git Bash special folder) is not always recognised.
- Limiti noti su Windows: un percorso protetto scritto con un alias insolito (un indirizzo file://, un prefisso incollato al
  percorso, una variabile diversa da quelle della casa, un flusso NTFS su una cartella, una cartella speciale di Git Bash) non
  sempre è riconosciuto.
- A path that names the disk by its volume identifier, by this computer's network address, or with slashes doubled after
  this computer's name is not always recognised as the protected place: in Full access a credential file can be read or
  written with no card, a critical delete can go unseen, and a folder blocked for a device can be read (as in 0.2.1).
- Un percorso che nomina il disco col suo identificativo di volume, con l'indirizzo di rete di questo computer o con le barre
  raddoppiate dopo il nome di questo computer non sempre è riconosciuto come il posto protetto: in Accesso pieno un file di
  credenziali può essere letto o scritto senza carta, una cancellazione critica può passare non vista, e una cartella
  bloccata per un dispositivo può essere letta (come nella 0.2.1).
- In Workspace write, reading an ordinary file of the project written in the long form with doubled slashes
  (`\\?\C:\\…\\notes.txt`) now shows one card, "outside the working folder", where it showed none. A path in
  the long form is never read as inside the project: the long form without doubled slashes already asked the same way, and
  joining the slashes is what makes a credential written that way ask. Full access shows no card, On request its usual one;
  the same file written the normal way does not change.
- In Scrive nel progetto, leggere un file qualunque del progetto scritto nella forma lunga con le barre raddoppiate
  (`\\?\C:\\…\\note.txt`) ora mostra una carta, «fuori dalla cartella di lavoro», dove prima non ne mostrava. Un
  percorso nella forma lunga non viene mai letto come dentro il progetto: la forma lunga senza barre raddoppiate chiedeva già
  così, e unire le barre è ciò che fa chiedere una credenziale scritta in quel modo. In Accesso pieno nessuna carta, in Su
  richiesta la sua di sempre; lo stesso file scritto in modo normale non cambia.
- In Full access, the home written as its drive and its path with a slash between them, or with the system drive in place of
  the home drive, is not read as the home (as in 0.2.1).
- In Accesso pieno la casa scritta come il suo disco e il suo percorso con una barra in mezzo, o col disco di sistema al posto
  del disco della casa, non viene letta come la casa (come nella 0.2.1).
- In Full access these still pass with no card: the home, or a folder above it, written with a dot right after its name;
  quotes around the folder part only of a path; and, for a critical delete, a backtick or a backslash in the middle of the
  name.
- In Accesso pieno questi passano ancora senza carta: la casa, o una cartella sopra di lei, scritta con un punto subito dopo
  il nome; le virgolette attorno alla sola parte della cartella di un percorso; e, per una cancellazione critica, un accento
  grave o una barra rovescia in mezzo al nome.
- A drive-less path that is spelled like a protected one may ask or be refused even when it points to another disk: a command
  is also read on the disk of TALOS, on the disk of your home and on every disk it names; the file tools read it on the disk
  of the project and on the disk of TALOS.
- Un percorso senza disco scritto come uno protetto può chiedere o essere rifiutato anche se porta su un altro disco: un
  comando viene letto anche sul disco di TALOS, sul disco della tua casa e su ogni disco che nomina; gli attrezzi dei file lo
  leggono sul disco del progetto e sul disco di TALOS.
- With WSL installed and «Automatic», a command whose program also exists in Linux runs there, where the same path means
  another place: the card can show for a file that command would not have reached.
- Con WSL installato e «Automatico», un comando il cui programma esiste anche in Linux gira lì, dove lo stesso percorso
  indica un altro posto: la carta può comparire per un file che quel comando non avrebbe raggiunto.
## desktop-v0.2.2 — 2026-11-15

### Security

- **The tools of connectors (MCP servers), plugins and Tool Forge now ask before they run.** From 0.1.0 to 0.2.1 they ran
  without a question in every permission mode, «Read only» included. Now they ask each time you use them, also in
  «Writes to the project», where writing in the project does not ask, until you choose «For this tool in this session»,
  which stops the question for that tool of that connector, plugin or Tool Forge until the conversation ends or TALOS
  restarts; another tool, or the same tool of another
  connector or plugin, asks on its own. The question can come back for a tool you already allowed when your data could
  leave the PC: for example after the assistant has run a command or written a file in the same answer. «Full access» does
  not ask, as for the other tools; Plan mode does not offer them.
- **Gli strumenti dei connettori (i server MCP), dei plugin e di Tool Forge ora chiedono prima di partire.** Dalla 0.1.0
  alla 0.2.1 partivano senza domanda, con qualsiasi permesso, anche in «Solo lettura». Ora chiedono ogni volta che li
  usi, anche in «Scrive nel progetto», dove scrivere nel progetto non chiede, finché non scegli «Per questo strumento in
  questa sessione», che toglie la domanda per quello strumento di quel connettore, plugin o Tool Forge fino alla fine
  della conversazione o finché TALOS non si riavvia; un altro strumento, o lo stesso strumento di un altro connettore o plugin, chiede per conto suo. La domanda può
  tornare per uno strumento già consentito quando i tuoi dati potrebbero uscire dal PC: per esempio dopo che l'assistente
  ha lanciato un comando o scritto un file nella stessa risposta. «Accesso pieno» non chiede, come per gli altri
  strumenti; la modalità Piano non li offre.

- **In «Research only» these tools are now refused, without a question.** In 0.2.1 they ran there too; «Research only»
  lets the assistant search and read, not use the tools of connectors, plugins or Tool Forge.
- **In «Solo ricerca» questi strumenti ora sono rifiutati, senza domanda.** Nella 0.2.1 partivano anche lì; «Solo ricerca»
  lascia cercare e leggere, non usare gli strumenti dei connettori, dei plugin o di Tool Forge.

- **In «Read only» these tools ask each time, and only for that once.** From 0.1.0 to 0.2.1 «Read only» did not stop
  them. The question says that the tool can change things outside your PC, and offers only «Allow once» and «Deny». A
  tool that its connector declares as read-only runs without asking: in «Read only» TALOS trusts what the connector says
  about its own tools, unless the connector also declares that tool as destructive: then it asks. A connector that writes
  «read-only» or «destructive» as anything other than a plain yes or no breaks the connector standard: TALOS does not
  connect to it and offers none of its tools, so no question appears, and the chat says that the connector did not start.
  The core of TALOS asks for such a tool too, for a program built on it that does not check the standard. If the connector
  later says something different about that tool, TALOS asks again for the rest of the conversation, until TALOS restarts.
- **In «Solo lettura» questi strumenti chiedono ogni volta, e solo per quella volta.** Dalla 0.1.0 alla 0.2.1 «Solo
  lettura» non li fermava. La domanda dice che lo strumento può cambiare cose fuori dal tuo PC, e offre solo «Consenti una
  volta» e «Nega». Uno strumento che il suo connettore dichiara di sola lettura parte senza chiedere: in «Solo lettura»
  TALOS si fida di ciò che il connettore dice dei suoi strumenti, a meno che il connettore non lo dichiari anche
  distruttivo: allora chiede. Un connettore che scrive «sola lettura» o «distruttivo» in un modo diverso da un semplice sì o
  no non rispetta lo standard dei connettori: TALOS non si collega e non offre nessuno dei suoi strumenti, quindi non
  compare nessuna domanda, e la chat dice che il connettore non è partito. Il nucleo di TALOS chiede anche per uno strumento
  così, per un programma costruito su TALOS che non controlla lo standard. Se poi il connettore dice altro su quello
  strumento, TALOS chiede di nuovo per il resto della conversazione, finché TALOS non si riavvia.

- **If you say no to one of these tools, the assistant cannot ask again for the same request in that answer**, in every
  permission mode: the same tool with the same details gets your no at once, and the assistant is told that you already
  said no. The same details written in another order count as the same request. With other details it asks again, and
  if you write to the assistant or answer one of its questions after your no, the same request asks you again. A no that
  does not come from you (a rule or an automatic answer) does not count as yours: the assistant is told who refused.
- **Se dici di no a uno di questi strumenti, l'assistente non può chiedere di nuovo la stessa cosa in quella risposta**,
  con qualsiasi permesso: lo stesso strumento con gli stessi dettagli riceve subito il tuo no, e all'assistente si dice
  che hai già detto di no. Gli stessi dettagli scritti in un altro ordine contano come la stessa richiesta. Con dettagli
  diversi chiede di nuovo, e se dopo il tuo no scrivi all'assistente o rispondi a una sua domanda, la stessa richiesta ti
  chiede di nuovo. Un no che non viene da te (una regola o una risposta automatica) non conta come tuo: all'assistente si
  dice chi ha rifiutato.

- **«Allow all» never includes these questions**: each one is answered on its own card.
- **«Consenti tutte» non comprende mai queste domande**: a ognuna si risponde sulla sua carta.

- **The card names the tool once, in words you can read** («create issue», not «create_issue»), and the note near the
  buttons says what each yes is worth: «Allow once» this call only, «For this tool» the whole session. When your private
  data could leave the PC, the card says it first, in a red box.
- **La carta nomina lo strumento una volta sola, in parole che si leggono** («create issue», non «create_issue»), e la nota
  vicino ai pulsanti dice quanto vale ciascun sì: «Consenti una volta» solo questa chiamata, «Per questo strumento» tutta la
  sessione. Quando i tuoi dati privati potrebbero uscire dal PC, la carta lo dice per prima cosa, in un riquadro rosso.

- **On the phone these questions show neither the connector nor the tool yet**, and they offer only «Allow once» and
  «Deny». To allow a tool for the whole session, answer on the PC.
- **Sul telefono queste domande non mostrano ancora né il connettore né lo strumento**, e offrono solo «Consenti una
  volta» e «Nega». Per consentire uno strumento per tutta la sessione, rispondi dal PC.

### Known limits (connectors, plugins, Tool Forge)

- In «Read only» a connector that declares one of its tools as read-only, and then changes things with it, runs it
  without a question: TALOS cannot check what the connector really does.
- In «Solo lettura» un connettore che dichiara di sola lettura un suo strumento, e poi con quello cambia qualcosa, lo fa
  partire senza domanda: TALOS non può controllare che cosa fa davvero il connettore.

- A yes «For this tool in this session» also counts for the agents this conversation starts, even in another folder, for
  a connector there with the same name (it still needs your trust for that folder).
- Un sì «Per questo strumento in questa sessione» vale anche per gli agenti che questa conversazione avvia, anche in
  un'altra cartella, per un connettore lì con lo stesso nome (che deve comunque avere la tua fiducia per quella cartella).
- A plugin check that runs before each tool cannot stop these tools: it stops only the actions that change your files
  and your data in TALOS (as from 0.1.0).
- Un controllo di un plugin che parte prima di ogni strumento non può fermare questi strumenti: ferma solo le azioni che
  cambiano i tuoi file e i tuoi dati in TALOS (come dalla 0.1.0).
- The TALOS command line (talos-cli 0.1.0 to 0.6.14) has the same gap; this update of the desktop app does not change it.
- La riga di comando di TALOS (talos-cli dalla 0.1.0 alla 0.6.14) ha la stessa falla; questo aggiornamento dell'app per
  il PC non la cambia.

### Fixed

- **On the card of a call written as text, a very long field name now wraps and its value is always visible.** Up to
  0.2.1 a name of a few hundred characters pushed its value off the card, so you could not see what the call would do.
- **Nella carta di una chiamata scritta come testo, un nome di campo lunghissimo ora va a capo e il suo valore si vede
  sempre.** Fino alla 0.2.1 un nome di qualche centinaio di caratteri spingeva il valore fuori dalla carta, e non si
  vedeva che cosa avrebbe fatto la chiamata.
- **The card of a connector, plugin or Tool Forge tool now shows what the call sends.** Each argument is a row, name and
  value, with the same layout as above. TALOS hides a field named like a secret (a key, a token, a password, at any
  depth) and a value shaped like a key before the card shows it, and cuts a long value with «…»; the card then says how
  many values were cut. Two long names that start the same stay two rows: the second gets a number after it, «(2)».
  The tool still receives every argument whole. On the phone the card does not show them yet.
- **La carta di uno strumento di un connettore, di un plugin o di Tool Forge ora mostra che cosa manda la chiamata.**
  Ogni argomento è una riga, nome e valore, con la stessa impaginazione di sopra. TALOS nasconde un campo che ha il nome
  di un segreto (una chiave, un token, una password, a qualsiasi profondità) e un valore che ha la forma di una chiave
  prima che la carta lo mostri, e taglia un valore lungo con «…»; la carta dice poi quanti valori ha tagliato. Due nomi
  lunghi che iniziano allo stesso modo restano due righe: il secondo ha un numero dopo, «(2)». Lo
  strumento riceve comunque ogni argomento intero. Sul telefono la carta non li mostra ancora.
- **That card shows every argument the call sends, hides more secrets, and never makes TALOS wait.** Before, a
  call whose arguments were a list, a text or a number showed a card with no rows, an invisible character could make two
  names look the same, some secrets stayed readable (a name like `githubtoken`, a cookie, a key with no end line), and a
  hostile connector could keep TALOS busy for more than a second or send a card of megabytes; now that argument is one
  row, the invisible character is shown as `\u200b`, those secrets are hidden while names such as `token_limit`,
  `password_hint` or `clear_cookies: true` stay readable, the card is ready in a few milliseconds and never passes 24,000
  characters. A secret in a JSON text or between escaped quotes, a name like `DB_PASSWORD_2`, a field named `pass` and
  `secrets` written with spaces stay a known limit, fixed in 0.2.3.
- **Quella carta mostra ogni argomento che manda la chiamata, nasconde più segreti e non fa mai aspettare TALOS.** Prima una chiamata con argomenti fatti di una lista, di un testo o di un numero mostrava una carta
  senza righe, un carattere invisibile poteva far sembrare uguali due nomi, alcuni segreti restavano leggibili (un nome
  come `githubtoken`, un cookie, una chiave senza la riga di fine) e un connettore
  ostile poteva tenere TALOS occupato per più di un secondo o mandare una carta di megabyte; ora quell'argomento è una
  riga, il carattere invisibile si vede come `\u200b`, quei segreti sono nascosti mentre nomi come `token_limit`,
  `password_hint` o `clear_cookies: true` restano leggibili, la carta è pronta in pochi millisecondi e non supera mai 24.000
  caratteri. Un segreto dentro un testo JSON o fra virgolette protette, un nome come `DB_PASSWORD_2`, un campo chiamato
  `pass` e `secrets` scritto con gli spazi restano un limite noto, curato nella 0.2.3.
- **The tool row and the terminal hide the same secrets as the card.** Before, the row of a connector tool in the
  conversation showed `password`, `api_key` or a password inside an object in clear in its detail, also while the call was
  still arriving, while the card above it hid them; now the row hides them while the call arrives, while the tool runs,
  when it is over and after a reload. Before, the terminal printed those values on the tool row under its card; now it
  hides them in the row as it is written and in the finished row. Before, the card written as text showed a secret inside
  an object or a list in clear; now it hides it like the other card, at any depth. A row with no name now says «value».
  The tool still receives every argument whole.
- **La riga dello strumento e il terminale nascondono gli stessi segreti della carta.** Prima la riga di uno strumento di
  un connettore nella conversazione mostrava in chiaro nel suo dettaglio `password`, `api_key` o una password dentro un
  oggetto, anche mentre la chiamata arrivava, mentre la carta sopra li nascondeva; ora la riga li nasconde mentre la
  chiamata arriva, mentre lo strumento lavora, alla fine e dopo un ricaricamento. Prima il terminale stampava quei valori
  nella riga dello strumento sotto la sua carta; ora li nasconde nella riga mentre si scrive e nella riga finita. Prima la
  carta scritta come testo mostrava in chiaro un segreto dentro un oggetto o una lista; ora lo nasconde come l'altra
  carta, a qualsiasi profondità. Una riga senza nome ora dice «valore». Lo strumento riceve comunque ogni argomento intero.
- **While a call arrives, a value of a JSON argument that is not complete is never shown, and two commands in one turn hide their secrets.**
  Before, while the arguments of a call were still arriving, the tool row on the page and in the terminal showed the first
  part of a value: most of a GitHub token, an access key or the password in a web address could be read before the card
  hid it. Now a value of a JSON argument still arriving reads «…» until it is complete, then the row shows it with its secrets hidden; once
  the call has arrived the row shows every value as before. Before, with two commands in the same turn, the activity group
  showed the commands with their passwords in its rows, in its heading while a command ran and in the summary; now it
  hides them like the row. Before, an invisible character inside a name such as `db_password` let the terminal
  show its value; now it is hidden. Very large arguments (over a million characters or ten thousand names and values) end with «…»
  on the row and inside a value of the card written as text, instead of keeping the page busy for seconds; a value cut
  there is never shown in part. The tool still receives every argument whole.
- **Mentre una chiamata arriva, un valore non ancora completo di un argomento JSON non si vede mai, e due comandi nello stesso giro nascondono
  i loro segreti.** Prima, mentre gli argomenti di una chiamata arrivavano, la riga dello strumento nella pagina e nel
  terminale mostrava la prima parte di un valore: si poteva leggere quasi tutto un token GitHub, una chiave d'accesso o la
  password dentro un indirizzo web prima che la carta lo nascondesse. Ora un valore di un argomento JSON che sta ancora arrivando si legge «…»
  finché non è completo, poi la riga lo mostra coi segreti nascosti; quando la chiamata è arrivata la riga mostra ogni
  valore come prima. Prima, con due comandi nello stesso giro, il gruppo delle attività mostrava i comandi con le loro
  password nelle righe, nel titolo mentre un comando lavorava e nel riepilogo; ora le nasconde come la riga. Prima un
  carattere invisibile dentro un nome come `db_password` faceva mostrare al terminale il suo valore; ora è
  nascosto. Argomenti molto grandi (oltre un milione di caratteri o diecimila fra nomi e valori) finiscono con «…» nella riga e dentro
  un valore della carta scritta come testo, invece di tenere occupata la pagina per secondi; un valore tagliato lì non si
  vede mai a metà. Lo strumento riceve comunque ogni argomento intero.
- **When you already said no to a call of a connector, plugin or Tool Forge tool in this turn, its row now says so.** Before, when the model repeated
  the same call after your no, TALOS did not ask you again, as it should, but the tool row said «The tool rejected the
  request.», as if the tool had refused. Now it says «You had already said no to this same request in this turn, so you
  were not asked again.»
- **Quando in questo giro hai già detto di no a una chiamata di uno strumento di un connettore, di un plugin o di Tool Forge, ora la sua riga lo dice.** Prima, quando il
  modello ripeteva la stessa chiamata dopo il tuo no, TALOS non ti chiedeva di nuovo, come deve, ma la riga dello
  strumento diceva «Lo strumento ha rifiutato la richiesta.», come se avesse rifiutato lo strumento. Ora dice «In questo
  giro avevi già detto di no a questa stessa richiesta, quindi non ti è stato chiesto di nuovo.»

### Known limits of 0.2.2
- **An empty variable in front of a slash** — when the variable is empty or not set, `rm -rf "$EMPTY"/*` is not recognised as a critical deletion. With Full access it runs without asking, as in 0.2.1, and Bash reads it as `rm -rf /*`. 0.2.3 asks for the card here. Until then, do not leave Full access on for commands built from variables you have not set yourself.
- **Some secret shapes on the connector card** — 0.2.2 shows the connector's arguments on the card for the first time, with secrets masked. These four shapes are not recognised yet:
  - secrets inside escaped quotes in JSON text;
  - names with a number after the secret word, such as `DB_PASSWORD_2`;
  - the short name `pass`;
  - a `secrets` object written with spaces.

  The model and the tool still receive the real values; only what the card shows is affected. 0.2.3 masks them, with a test bench of hostile texts.
- **Two places that still show a connector's arguments unmasked, as in 0.2.1** — the phone's copy of the conversation page shows the tool row without the masks of the card, and the suggestion offered after a turn (for example «explain this command») can put an argument, unmasked, into the suggested message. Read the suggested message before you send it. Both were already so in 0.2.1; 0.2.3 puts them behind the same masks.
- **A less common bash quoting form** — when a command uses one of bash's less common quoting forms in an unusual way, the permission check can lose track of where the quotes end, and a critical deletion later in the same command is not recognised. With Full access it runs without asking, as in 0.2.1. A later release asks for the card whenever the check cannot read the quoting. Until then, do not leave Full access on for commands you have not read yourself, especially commands that mix unusual quoting with a deletion.
- **More places that can still show a connector's secret values, as in 0.2.1** — the masks recognise a secret field when its name ends with a secret word (`db_password`, `api_key`). A name where the secret word sits elsewhere, such as `password_confirmation` or `apiKeyValue`, is still shown in clear on the card and on the tool row. The same happens in the terminal row when the arguments arrive as a list, in the Processes column, and while arguments written inside a code fence are still arriving. A very large argument can also slow the tool row for about a fifth of a second when the call ends. All of these were already so in 0.2.1, where the tool row showed every argument unmasked. A later release reads secret words anywhere in a field name. Until then, prefer connectors that read secrets from their own settings rather than receiving them as arguments, and do not share your screen while a connector call carries a secret.
- **Some commands with many wildcards can hold the permission check for a few seconds, as in 0.2.1.** When a command removes files using a long pattern with many `*` or `?` characters, TALOS can take a few seconds to decide whether to ask you, and the chat waits meanwhile. Nothing runs before the decision. This was already so in 0.2.1. A later release makes this check fast in every case. Until then, prefer a short pattern or a list of names over one long pattern.
- **Computer use can look at a window of yours that comes to the front, as in 0.2.1** — while computer use works, it reads the window on top of the screen (or the top window of the app it was asked to use), not a window picked once at the start. What it sees there, including a screenshot, is sent to the model. If one of your windows comes to the front during a task, TALOS can read it and send it to the model. Before acting in an app that is not part of the task, it still asks you with a card. It does not ask when your window belongs to the same app as the task, or to an app you gave "Always allow". Moving the mouse or typing does not stop the task. A later release locks the task to the window chosen at the start, asks again if the window changes, and stops when you use the mouse or keyboard. Until then, do not use the PC while computer use is working, and do not give "Always allow" to an app where you keep windows of your own.
- **Deleting an important folder may not ask on macOS and on Android, as in 0.2.1.** On macOS the permission check can miss an important folder when its name is written with different capital letters, with an accented letter in the other Unicode form, or with `ß` in place of `SS`. On Android the same can happen with capital letters in the phone's shared storage. In these cases the deletion can run without asking. This was already so in 0.2.1. A later release asks for the card in these cases. Until then, do not use Full access for deletion commands you did not write yourself.
- **On any system, some very long commands can hide a deletion from the check, as in 0.2.1.** In these cases the deletion can run without asking. This was already so in 0.2.1. A later release asks for the card in these cases. Until then, do not use Full access for deletion commands you did not write yourself.
- **The automatic tests in the source code can reach the system keyring used by the installed app, as in 0.2.1.** This concerns only people who run those tests from the source; using the app does not run them. A later release keeps the tests apart from the app's keyring. Until then, do not run the source tests on a PC where the installed TALOS keeps your keys.
- **Some secret values placed in a list under certain field names can still show in clear on the permission card and on the tool row, as in 0.2.1.** The model and the tool receive the same values as before; only what you see is affected. A later release hides them. Until then, keep a connector's keys and tokens in that connector's own settings, rather than having the model pass them in the chat.

### Limiti noti della 0.2.2
- **Una variabile vuota davanti a una barra** — quando la variabile è vuota o non impostata, `rm -rf "$VUOTA"/*` non viene riconosciuto come cancellazione critica. Con Accesso pieno parte senza chiedere, come nella 0.2.1, e bash lo legge come `rm -rf /*`. La 0.2.3 qui chiede la carta. Fino ad allora non lasciare Accesso pieno acceso per comandi costruiti con variabili che non hai impostato tu.
- **Alcune forme di segreto sulla carta dei connettori** — la 0.2.2 mostra per la prima volta sulla carta gli argomenti del connettore, con i segreti oscurati. Queste quattro forme non sono ancora riconosciute:
  - i segreti fra virgolette protette in un testo JSON;
  - i nomi con un numero dopo la parola del segreto, come `DB_PASSWORD_2`;
  - il nome corto `pass`;
  - un oggetto `secrets` scritto con gli spazi.

  Il modello e l attrezzo ricevono comunque i valori veri; cambia solo ciò che mostra la carta. La 0.2.3 li oscura, con un banco di testi ostili.
- **Due punti che mostrano ancora gli argomenti di un connettore senza maschera, come nella 0.2.1** — la copia della pagina della conversazione sul telefono mostra la riga dell attrezzo senza le maschere della carta, e il suggerimento proposto dopo un giro (per esempio «spiega questo comando») può mettere un argomento, senza maschera, nel messaggio proposto. Rileggi il messaggio proposto prima di inviarlo. Erano già così nella 0.2.1; la 0.2.3 li mette dietro le stesse maschere.
- **Una forma di virgolette di bash poco comune** — quando un comando usa in modo insolito una delle forme di virgolette meno comuni di bash, il controllo dei permessi può perdere il punto in cui le virgolette finiscono, e una cancellazione critica più avanti nello stesso comando non viene riconosciuta. Con Accesso pieno parte senza chiedere, come nella 0.2.1. Una versione successiva chiede la carta ogni volta che il controllo non sa leggere le virgolette. Fino ad allora non lasciare Accesso pieno acceso per comandi che non hai letto tu, soprattutto se mescolano virgolette insolite e una cancellazione.
- **Altri punti che possono ancora mostrare i valori segreti di un connettore, come nella 0.2.1** — le maschere riconoscono un campo segreto quando il suo nome finisce con una parola di segreto (`db_password`, `api_key`). Un nome in cui la parola del segreto sta altrove, come `password_confirmation` o `apiKeyValue`, si vede ancora in chiaro sulla carta e sulla riga dell attrezzo. Lo stesso succede nella riga del terminale quando gli argomenti arrivano come lista, nella colonna Processi e mentre arrivano argomenti scritti dentro un blocco di codice. Un argomento molto grande può anche rallentare la riga dell attrezzo per circa un quinto di secondo a fine chiamata. Erano già così nella 0.2.1, dove la riga dell attrezzo mostrava ogni argomento senza maschera. Una versione successiva legge le parole di segreto in ogni punto del nome del campo. Fino ad allora preferisci i connettori che leggono i segreti dalle proprie impostazioni invece di riceverli come argomenti, e non condividere lo schermo mentre una chiamata a un connettore porta un segreto.
- **Alcuni comandi con molti caratteri jolly possono tenere fermo il controllo dei permessi per alcuni secondi, come nella 0.2.1.** Quando un comando cancella file con un modello lungo pieno di `*` o `?`, TALOS può metterci alcuni secondi a decidere se chiederti il permesso, e intanto la chat aspetta. Prima della decisione non parte niente. Era già così nella 0.2.1. Una versione successiva rende veloce questo controllo in ogni caso. Fino ad allora preferisci un modello corto o un elenco di nomi a un solo modello lungo.
- **L'uso del computer può guardare una tua finestra che passa davanti, come nella 0.2.1** — mentre lavora, l'uso del computer legge la finestra che sta sopra le altre sullo schermo (o la prima finestra dell'app che gli hai chiesto di usare), non una finestra scelta una volta sola all'inizio. Quello che vede, compresa una foto, va al modello. Se durante il compito una tua finestra passa davanti, TALOS può leggerla e mandarla al modello. Prima di agire in un'app che non fa parte del compito ti chiede comunque il permesso con una carta. Non te lo chiede se la tua finestra è della stessa app del compito, o di un'app a cui hai dato «Consenti sempre». Muovere il mouse o scrivere non ferma il compito. Una versione successiva lega il compito alla finestra scelta all'inizio, ti richiede il permesso se la finestra cambia e si ferma quando usi mouse o tastiera. Fino ad allora non usare il PC mentre lavora l'uso del computer, e non dare «Consenti sempre» a un'app in cui tieni finestre tue.
- **La cancellazione di una cartella importante può non chiedere conferma su macOS e su Android, come nella 0.2.1.** Su macOS il controllo dei permessi può non riconoscere una cartella importante quando il suo nome è scritto con maiuscole diverse, con una lettera accentata nell'altra forma Unicode o con `ß` al posto di `SS`. Su Android può succedere lo stesso con le maiuscole nella memoria condivisa del telefono. In questi casi la cancellazione può partire senza chiedere. Era già così nella 0.2.1. Una versione successiva chiede la carta in questi casi. Fino ad allora non usare Accesso pieno per comandi di cancellazione che non hai scritto tu.
- **Su ogni sistema, alcuni comandi molto lunghi possono nascondere una cancellazione al controllo, come nella 0.2.1.** In questi casi la cancellazione può partire senza chiedere. Era già così nella 0.2.1. Una versione successiva chiede la carta in questi casi. Fino ad allora non usare Accesso pieno per comandi di cancellazione che non hai scritto tu.
- **Le prove automatiche del codice sorgente possono raggiungere il portachiavi di sistema usato dall'app installata, come nella 0.2.1.** Riguarda solo chi fa girare quelle prove dal sorgente; usare l'app non le fa partire. Una versione successiva tiene le prove separate dal portachiavi dell'app. Fino ad allora non far girare le prove del sorgente su un PC dove il TALOS installato tiene le tue chiavi.
- **Alcuni valori segreti messi in un elenco sotto certi nomi di campo possono ancora vedersi in chiaro sulla carta del permesso e sulla riga dello strumento, come nella 0.2.1.** Il modello e lo strumento ricevono gli stessi valori di prima; cambia solo ciò che vedi. Una versione successiva li nasconde. Fino ad allora, tieni le chiavi e i token di un connettore nelle impostazioni del connettore stesso, invece di farli passare dal modello nella chat.

## desktop-v0.2.1 — 2026-11-10

### Fixed

- **Collapsible sections in replies.** When the model wrote a section to open and close (`<details>` with a `<summary>`
  title), the chat showed the raw tags as text. It is now a block you open with a click, Enter or Space; the title follows
  the chat text and Markdown works inside. While the answer arrives the block stays open, so you see the text as it comes,
  and no tag ever shows half written. A section with nothing inside is a plain title line, with nothing to open. Only these
  two tags become a block: any other HTML the model writes stays text, and «Copy» still copies the reply exactly as written.

### Known limits

- The phone app still shows these sections as text.

## desktop-v0.2.0 — 2026-11-09

### Added

- **Long code stays easy to copy and save.** In the chat, the bar of a code block (language, Copy and «⋯») stays pinned at the
  top while you scroll through the code, and leaves with the block. «⋯», or a right-click on the bar, downloads the code as a
  file of its language, as Markdown or as plain text, named after the file the model wrote in the block (otherwise
  `talos-<language>-<date>`), and collapses a block longer than 40 lines. Copy and «⋯» wait until the block has fully arrived.
- **Live blocks in replies.** The model can answer with interactive blocks (choices, tables, charts, comparisons, sliders,
  metrics, diagrams) that you use in the chat, open on the side or full screen, save to the Library with versions, and export
  as CSV, image or text from their «⋯» menu or a right-click. On by default; «Live blocks in replies» in Settings turns them off.
- **Computer use (Preview).** When you turn it on, the model can see and use apps and the browser on this PC: a TALOS cursor
  shows where it clicks, the window it watches gets a border, and a small bubble says what it is doing. It asks before steps
  that change things and remembers the places you allow. See Known limits.
- **A side chat.** Ask a question about the conversation while TALOS works: it reads the chat, writes nothing to it, does not
  interrupt the turn and is not saved. It shows the estimated cost in dollars when the model's price is known.
- **Change TALOS settings from the chat.** Ask the model, or type `/settings`: every change shows a card with what changes and
  why, a line with Undo, a mark in Settings and a notification. The model hears about the changes you make yourself, and a
  change pushed by a suspicious reason is shown in a danger box.
- **A notification centre on the PC.** «To do» and «All» list cards waiting for you, finished chats, automations and changes,
  shared with your paired devices: what you mark as seen on one is seen everywhere.
- **Deep research.** Start it with «New research» at the top of the Deep research section, or ask the model for one, and
  choose how deep it goes; when the model proposes one, you get a card where you can edit the question and see the depth and
  estimated cost.
- **A list of steps above the live row.** The model can keep a short plan of the turn; the chat shows the current step with its
  seconds, and a revised plan replaces the old one, which folds into a row.
- **Allow all.** With two or more requests waiting, a bar above the composer lists them all in full and allows them in one press.
- **Trust this folder?** TALOS asks once when you open a new folder. After a No the conversation works as Asks first and the
  folder's instructions, hooks and connected tools stay off; you can trust it later from the permissions menu.
- **Stop the chat and its agents together.** With sub-agents at work, Stop asks whether to stop everything or only the chat;
  stopping one agent from the Agents tab stops everything it started.
- **A Resume button** lights up when a turn stopped, failed or was interrupted, and picks up where it left off. After a Stop
  your next message is a new request, and the stop note offers «Pick up where you left off».
- **Fast mode on the ChatGPT plan.** A switch in the reasoning menu asks for faster answers on the models that offer it, one
  conversation at a time, off by default.
- **«Continue now with…» on the ChatGPT plan limit card**, to go on with another model at once.
- **A Board kanban.** The Board switches between Table and Kanban: running, waiting for you, to resume, done.
- **A sky view for New session (Beta).** In Settings → Chat, «How New session opens» can show your projects, sessions, agents
  and automations as a sky; the window stays the default.
- **The model can look at images and open your local dev servers.** It views an image file in the project (shown as a
  thumbnail in its row) and opens a dev server of the conversation in the Browser tab you see; a «Server ready» row and a
  «Local servers» strip tell you when one starts.
- **Local models from the chat.** The model can open, switch and free local models; TALOS shows the measured speed of a model
  on this PC, says when the graphics card is still busy or a model is still loading, and Stop cancels a first load.
- **Images on local models that can see**, with a clear message when the model in use cannot.
- **Conversation memory for local models.** A local conversation picks up where it was without reading everything again; set
  its disk space in Settings → Models (8 GB by default, 0 turns it off).
- **Keep the PC awake.** The PC does not go to sleep while TALOS works (Settings → Tools and permissions: never, while working,
  always).
- **Report a problem…** in the window menu: a window to describe it, with the app version and diagnostics, that warns you when
  your text looks like a key or a folder path.
- **Reply and dictation language.** TALOS replies in the language you write or speak in; a setting (Automatic by default)
  fixes one, and dictation follows it.
- **The model answers questions about TALOS from the guide** shipped with this version.
- **Pinned chats** are kept on the PC and seen from every device; starred and recent models in the model picker too (F toggles
  the star).
- **A side-by-side preview** for question options that carry one.
- **The default for where commands run**, for new conversations, in Settings → Tools.
- **Updates** is a settings section of its own in the installed app.
- **Paired devices can do more with this PC:** the Git tab, research, the Library, the conversation goal and the context
  engine settings work from a device, which can also see and mark the PC notifications.

### Changed

- **The chat never waits for a summary.** Compaction writes a quick summary at once and improves it with the model at the end
  of the turn; the line says who wrote it and why. You can choose the model that writes summaries and the one that stands in
  when it fails, and each summary's cost shows in the Context tab and in the session's spend.
- **A calm Context panel.** While automatic compaction is on, the panel and the chat no longer warn about the threshold: one
  line says the conversation compacts by itself. When an automatic summary fails, it says what to do. «Compact now» never opens
  the Context Manager window, and `/compact` typed in the composer compacts at once.
- **The model no longer stops «because the context is full»**, since TALOS compacts by itself.
- **The model finishes the job more often.** A turn that ends on a failing test or command is reopened once; an answer cut by
  the output limit is retried with a changed request; a tool call lost in a dropped stream or in blank space is sent again.
- **A tool call written as text** by a model is no longer run on its own: it never ends the turn, and on local models it runs
  only with your yes, from a card.
- **Full access no longer shows cards for control files, `.git`, project secrets or network paths.** Deleting the whole project
  or a folder above it still asks in every mode, and in Full access deleting a top-level folder such as `C:\Users` asks too.
- **The Browser page is no longer sent with every message.** The model reads the open page when it needs it, so each message
  costs up to about 5,000 tokens less.
- **The ChatGPT plan is faster to start each step** (an open connection sends only what is new), retries a stream that drops,
  and renews the sign-in in the middle of a turn, with «Sign in and resume» when that is not enough.
- **The prompt cache is used more**, and the Context tab says when the provider's cache started over, and why.
- **Local models load without a second copy in RAM** by default, and a local model's window grows by itself before TALOS
  summarises.
- **A redesigned right panel, Context Manager and New session window.** Tabs for Agents, Processes, Files, Git and Context with
  counts; the Context Manager has an index on the left; New session has one field to search folders by name or paste a path.
- **Attachments up to 100 MB.** Files attached to a chat are kept in TALOS's data, not in the project or git; the picker takes
  many files at once and says how many stayed out; an unsent draft and its attachments survive a reload.
- **A cleaner look.** One header and search row for every section, a tidier sidebar with pop-up menus when closed, an icon for
  every meaning, a lighter animated background (on by default), live rows that count seconds, the person's question pinned at
  the top while its answer is read, and «Thinking · topic · 12 s» while the model reasons.
- **A No on a card reads «You said no»**, in grey, and the model takes it as your choice, not as a failure to retry.
- **The folder chooser reaches every disk**, and the installed app starts with no project instead of its own folder.
- **English state labels say «In progress»**, and the remaining server messages speak the interface language.

### Fixed

- **Switching chats never waits for a long history**; the Context tab says it is reading, with seconds.
- **Reloading reopens the right chat**, with its draft, photo and attachments.
- **A new chat is named after what you wrote**, or after the image when you sent only an image.
- **A refused model answer gets its own card** with one way forward, survives a reload and keeps its images; an old photo no
  longer breaks a chat on a model without vision.
- **«Send as attachment» keeps your text** when the send fails, and is offered only for your own message.
- **The Files tab no longer flickers** when files change on disk, and numbers in file names sort naturally.
- **The Processes tab no longer shows a client's port as a listening server on Windows**, and always shows a real one.
- **Notifications:** one «Finished» per chat, a deleted conversation opens nothing, and a burst of notices redraws once.
- **«N files edited» counts files, not calls**, and a new file counts its real lines.
- **A server that cannot start says why** instead of staying silent, and a child process that cannot start no longer takes it
  down.
- **Stop always ends as stopped**, never as an internal error, also during a delegation that waits for a permission.
- **Undo never reverts a file someone else changed during the turn**, and the turn snapshot no longer slows the start of a turn.
- **Model names and labels**: a local model keeps the name from its catalogue (dots included), the chip shows the catalogue name,
  and the model picker opens on the model in use.
- **Report PDFs no longer produce blank pages.**
- **Editing a file whose only difference is Windows line endings works**, and the file keeps its own line endings.
- **The computer use settings card** keeps its place, with the Preview badge by its title, and a delegation card shows the
  model's short name whole next to «Failed».
- **No network** is said in plain words in the model picker and status bar, which recover by themselves; a window that lost
  access says so at once, with the way back in.
- **A model that thinks and then stops without answering is asked to continue from its reasoning** before TALOS retries or
  reports an empty answer.
- **A context window that fills up during a reply is recognised** also when OpenRouter reports it inside the stream, and a
  continuation that no longer fits is sent again once without the carried-over reasoning instead of failing.
- **The phone's file list shows only files that were really written**, so a failed edit is no longer listed.
- **Your messages keep their line breaks.** A message written on several lines showed as one line in your bubble.
- **The message box hint belongs to the open conversation.** After you switched conversations, the box could show the
  suggestion left by the conversation you came from.

### Security

- **Every TALOS server needs its token.** The window enters with a one-time ticket, so a program on the PC without TALOS's
  ticket cannot answer a card, raise permissions or run a command through TALOS.
- **A local page shown in TALOS runs apart from TALOS**, cannot open windows or frame other local servers.
- **Git reads are safer:** automatic reads no longer run commands set in a copied folder's configuration, and the Git key
  lookup no longer sees the whole server environment.
- **Secrets stay hidden** in more forms: prefixed key names, Z.AI keys, whole PEM blocks, passwords and tokens in addresses,
  and secret parameters of a page the model reads.
- **The sign-in command and key folders ask** in every shell spelling, and a blocked folder holds in every form of its path.
- **Files outside the chat folder** open, download or go to a device only when that chat wrote them.
- **The OpenRouter key goes only to the address you chose.**
- **A folder blocked for a paired device stays closed** to its files, goal and delegations; unblocking it always asks.
- **TALOS control files are guarded under every spelling of their path (write tools).** Outside Full access, writing the
  agent rules, hooks or settings files through another form of the path shows the control file card, and creating a
  document or exporting from the library no longer writes them.
- **Control files and secrets follow the permission level you set now**, also when you lower it during a turn; outside Full
  access, a library export no longer writes credential files.

### Known limits

- **Computer use is a Preview, and it is off by default.** You turn it on yourself in Settings → Agent tools and
  permissions («Computer use», marked Preview). This version does not have the Esc key brake yet, nor the protection of
  password fields: to stop it, use the Stop button.
- **In Full access the model can change the computer use settings without a card.** This is a choice, as in Claude Code
  and Codex: in Full access TALOS writes files and runs commands without asking you anything.
- **Outside Full access, a command can change the computer use settings without TALOS noticing.** A shell command that
  names these settings gets no card of its own: in Asks first every command already asks you, but in Writes to the
  project, the default, a command can reach them without asking, for example when it doesn't spell their full path.
  TALOS does not check these settings around a command and does not tell you when one changes them. A changed list of
  always-allowed places counts at once; a change that turns computer use on counts the next time TALOS starts.
- **If a model writes a tool call as plain text instead of making a real call, TALOS never runs it.** Sometimes TALOS
  asks the model to retry on its own; in some shapes (several calls in a row, or an example in a code block before the
  real call) the call stays on screen as text, and you need to ask the model to try again.
- **Right after TALOS starts, a branch can open without the earlier conversation.** A branch made with Retry or Edit and
  resend can open before the conversation list has loaded; it then shows only its own messages, without the earlier
  conversation.
- **In a narrow window, Open on the side opens the right panel over the chat.** After Close the panel stays open; close
  it by hand.
- **If another device stops and deletes a chat while this computer is offline, the chat stays on screen as if it
  were still working once the network is back.** The bar switches between "Connected again" and "Connection lost"
  and does not stop by itself. This was already in v0.1.38; it will be fixed after the release.
- **An option in an interactive block is written by the model.** If it contains a command, such as /settings, clicking
  it does not run it: it is sent as a message. The model can still answer by proposing that change, for example a card
  from Asks first to Full access. Nothing changes until you press Apply; Not now leaves everything as it is.
- **A branch made with Retry or Edit and resend can show the earlier conversation again each time you send a message
  in it.** The saved conversation is correct: the duplicates are only on screen. This was already in v0.1.38; it will
  be fixed after the release.
- **With LM Studio models, TALOS does not yet know how much text the model can hold.** With a small-window model it
  does not warn you first or summarize the conversation in time: the model refuses the request or cuts it short. This
  was already in v0.1.38; it will be fixed after the release.
- After "Retry" in a branch, the model picker can show the earlier model while replies come from the current one;
  picking that model again does not switch to it.
- **Interactive blocks in an older TALOS.** If a chat answered with this version is opened in an older TALOS, an
  interactive block can show as unanswered there, and clicking it sends a second answer.

## desktop-v0.1.38 — 2026-10-25

### Fixed

- **Attachments work again in the installed app.** Adding a file to a conversation, from the window or from a paired device,
  failed with «could not copy the file into the attachments folder»: the installer shipped the small program that saves
  attachments without the fingerprint TALOS checks before running it, so every attachment was refused, and the attempt to
  rebuild it could open a second TALOS window. The fingerprint now ships with the program, and the package is not built
  without it. Images sent to the model were not affected.

## desktop-v0.1.37 — 2026-10-25

### Added

- **Send a file from the PC to a device.** A file in the conversation has «Send to <device>» in its «⋯» menu and on right-click,
  and the model can do the same with a card you confirm (no card in Full access). The file card then says whether it was sent,
  is downloading, was downloaded, or changed on the PC before the download; a device that is offline gets the file when it
  connects again. Files up to 25 MB. A file the device already downloaded and that then changed stays «Downloaded», with «Send
  the new version» in its menu. When a send fails, the row says why in plain words; the technical text is under «Technical
  details».
- **Devices can work in folders of this PC.** A device asks once for a folder; you allow it from a card, and you can revoke it
  in Settings › Connected devices or from the chat. The model can list, allow and revoke folders too, always behind a card.
- **Turn remote control on or off from the chat.** Ask TALOS, or use the card it shows; the pairing QR can be shown in the chat.
- **The permission card from a device appears at once.** The PC learns of a new request the moment it is made, instead of
  checking every few seconds. After «Allow», a short line confirms it for a few seconds, with «Manage» or «Open», and stays
  above the next card when more requests are waiting.
- **Retry and Edit and resend keep both answers.** They start a branch instead of cutting the conversation: arrows on the point
  where the branches split let you go back and forth, and the branch tree shows them all.
- **A reasoning pill in the composer.** It shows the level chosen for the model («Auto» when none) and changes it in one click.
- **Artifacts have versions.** The model updates the same artifact instead of making a new one, and each card says which
  version it shows («v2 of 3»).
- **Recent conversations that ended with an error say «To resume»**, not «failed»: the last turn does not judge the whole chat.
- **A device can attach files and images to a conversation on this PC.** From the paired phone or tablet, a file goes into the
  conversation's folder, in pieces, and an image goes to the model as the window sends it, even before the conversation starts.
  A transfer pauses when the connection drops and resumes where it stopped, also after the PC restarts; a reply lost on the way
  never makes a second copy; a draft removed on the device stops its upload and frees its place on the PC at once; and when the
  PC is busy with other transfers from the same device, the device waits for a free place instead of failing.

### Changed

- **When the model says the conversation is too long, TALOS shortens it by what the model asked, and pays only when that helps.**
  It reads how many tokens the provider counted and its limit when the error says so, and aims for that. It first shortens what
  costs nothing (long tool output, old long messages, old images); it pays for a summary only if a summary can bring the
  conversation under the limit, at most once per turn; otherwise it shortens without a summary. It tries up to three times, each
  time lighter, never sends the same request twice, and never uses a summary that came back longer. If your newest message is
  what does not fit, it says so and offers to send it as an attachment, without paying for anything. When the model's numbers
  show that even the shortest version cannot fit, it stops at the first refusal and says the model's window is too small,
  instead of replacing the conversation with an index and sending it again to be refused. The provider's numbers now reach
  this step for every provider (before, the connection layer dropped them and TALOS fell back to fixed percentages). It says
  the window is too small only when even a summary written without the model cannot fit, and a summary paid in a turn that
  then fails is kept, so the next turn does not pay for it again. Your message is judged against the model's real window with
  room for the answer, and the numbers are said as the model counts them; code or data the model counts heavier in older
  messages no longer makes a message that fits look too large. When the model states its window while refusing, TALOS remembers
  it for the rest of the session: the next requests are sized to it, and «Send as attachment» goes at once instead of sending
  the refused message again. It remembers that window for each model, and never one smaller than a request the same model has
  already accepted in the session, so a single odd refusal no longer shrinks the session for good. Code or data that the model
  counts heavier in older messages (base64, for example) no longer makes TALOS say the window is too small when shortening those
  messages makes the request fit; when TALOS cannot be sure, the model decides, and once the model has refused the very request
  TALOS would send again, TALOS says the window is too small with the model's own numbers. All of this now works with the
  context engine too (windows of 64k and more): before, a refusal there ended the turn without shortening, numbers or memory.
  When the context engine falls back to the simple compaction turn after turn for the same reason, TALOS says so once, not every
  turn, until the engine works again. When a pasted message is what does not fit, TALOS now says so (with «Send as attachment»)
  even when the model counts some fixed part of every request that TALOS cannot see, instead of blaming the model's window; the
  message's numbers now add up, room for the answer included; and a free shortening done in a turn that then fails is undone,
  so «Nothing was summarized» stays true. With the context engine a message that was too large costs nothing on the next turn
  either: it no longer makes the engine set its archive aside and pay its summaries again, and the model and the engine see a
  short note in its place. A message sent as an attachment, or shortened once because it was too long, stays short in the
  following turns instead of coming back whole. When the model has said its window while refusing, the context engine no longer
  sends a too-long request on every turn.
- **A refused request no longer changes your conversation.** When the model refused a request as too long and TALOS shortened it
  to try again, the shortened copy could take the place of the real conversation in the session. Now only the request is
  shortened, and the conversation is kept whole.
- **TALOS stops paying for summaries that do not help.** If, after a summary, the conversation is still over the limit twice in a
  row, or three summaries were paid within three turns, automatic summaries pause and TALOS says so once; the free shortening
  steps go on. After the first case they come back on their own when the conversation has grown enough for a summary to remove
  more; after three summaries in three turns only when you change model or window, or ask for one with /compact, because a
  conversation that keeps repeating itself grows by just enough every turn. The pause survives a restart. It is said once per
  pause even when a summary prepared at the end of the previous turn arrives while you are working, and a new pause after one
  has lifted is said again. Shortening only old tool output at the end of a turn no longer reads as a summary. Every paid summary
  counts, even two in the same turn; the pause is said after the summary that caused it, and nothing is paid right after it; a
  summary that turned out useless in a turn is not paid again, identical, at its end. While summaries are paused, a conversation
  that is certainly over the model's window is shortened without the model before it is sent, instead of waiting to be refused.
- **A message is called too long only when it certainly is.** TALOS stops a new message before sending only when, with the system
  prompt and tools, it is over the model's window; between nine tenths and the full window it goes, and the model decides.
  «Send as attachment» is offered only when the attached form fits, and no copy is left behind when it does not. Chinese,
  Japanese and Korean text is counted at about one token per character, so a long message in those languages no longer reaches
  the model just to be refused. Shortening only old tool output no longer counts as a summary.
- **TALOS learns how your model counts and how long its summaries are.** It compares the model's own token count with its
  estimate, and remembers the size of the summaries it actually received in the session; it uses both to decide whether a
  summary is worth paying, instead of fixed guesses.

### Fixed

- **Model names are short everywhere.** «Resume work» on the Home showed the raw model id (for example «chatgpt:gpt-6-luna» or a
  local file's whole tag) while the sidebar showed its short name; now both show the same. Local model names are cleaner too: a
  0.6B model no longer reads as 6B, the quantisation no longer ends up inside the name, and an empty tag shows nothing.
- **Sending a file to a device: the outcome keeps the file's true path** (names with special characters, very long paths), so the
  file card can find it again.

## desktop-v0.1.36 — 2026-10-22

### Added

- **Remote control is usable.** The package now ships the iroh binding, downloaded from a pinned CI run whose attestation is
  checked (signing workflow, source branch and commit) together with its SHA-256; the licences of the Rust crates inside it
  ship next to it. Pair a device from Settings › Connected devices.

### Changed

- Everything you read says **devices**, not phones: the remote control screens, its messages and errors, the chat tools that
  list, pair and revoke devices.
- **Manual compaction works like the automatic one.** «Compact» writes a summary record over the conversation, as the
  summary prepared at the end of a turn does: your first request is kept word for word (a very long one keeps its start and
  its end), the last three requests too, and the compaction can be undone. Undoing while a compaction is still writing
  stops it instead of losing the undo.
- On the Context Engine, a manual compaction shows its progress while the engine works, and when it fails it says so with its
  reason instead of «nothing to compact».

### Fixed

- A model answer that contains the characters U+2028 or U+2029 no longer breaks the session's journal: such a session could
  not be reopened after a restart. Journals written by earlier versions read correctly again.
- A turn never waits behind a summary prepared in the background below the emergency line: the summary is used at the first
  request after it is written, and it is never paid twice. In an emergency the turn waits for it only if it still matches
  the conversation, and the wait shows its line, with **Skip**, **Stop** and the time ceiling.
- A summary that matches the conversation but is not enough on its own is kept as the starting point: only what came after
  it is summarised, instead of paying again for the whole conversation.
- **Skip** applies to the summary you skipped, not to the rest of the turn: a later summary in the same turn can be skipped
  again, and a real engine failure later in the turn is still reported.
- After **Skip**, no «fallback» line contradicts the outcome line.
- A compaction, manual or at the end of a turn, now also shortens the long results of the last exchanges, as the one inside a
  turn does: it never writes a summary larger than what it replaces, and above the threshold with nothing left to reduce it
  says so instead of «nothing to compact».
- A summary written by a separate, lighter model can no longer hold up the conversation's own key when it fails, including
  when the provider asks it to wait.
- A summary that would make the conversation longer is no longer applied inside a turn either. Images count toward the
  length, so a summary that replaces images with a few lines of text is still applied.
- A summary is paid for only when it helps: what it removes, after the summary it will write, must be at least a tenth of the
  compaction threshold. Right after you paste a long log into a short conversation, turns no longer pay for summaries that are
  thrown away or that save only a few tokens, and a small gain no longer brings the next compaction right back. When only the
  last results are long, they are shortened without a summary. Images and the tools' descriptions are counted too, so a picture
  in your first message or a model with a small window no longer throws the count off.
- An impossible token count from a provider (far above the model's window, or near zero) no longer moves the count: it no
  longer starts summaries on a short conversation, nor lets a small window fill up. Changing model starts the count afresh.
- A model whose window is smaller than TALOS's tools and the part it always keeps no longer pays for a summary on every failed
  turn: nothing is summarised, and the conversation says once that a model with a larger window is needed.
- **Stop** during a summary also stops the `git log` behind it on Windows, with everything it started, and that log no longer
  checks commit signatures.
- On a small window with many tools (an MCP server, for example) a request no longer goes out too large, to be refused first
  and summarised after: the summary happens before. The conversation's own tool count is kept across a restart.
- A summary is paid only when it removes at least a tenth of the threshold, near the window's limit too, unless the request
  would not fit at all; and a summary that arrives from the end of the previous turn is not paid for twice.
- When the provider says the conversation does not fit, a summary still on its way is waited for with **Stop**, **Skip** and
  the time ceiling, like everywhere else; before, the turn could sit silent for minutes.
- When **Compact** does not compact, it says why: the conversation is already at its minimum, or the summary would not have
  made it shorter.
- **Stop** during a summary closes its line.
- Images in a summarised stretch reach the summarizer as a short placeholder, so a text-only model can summarise it.
- Reading a very long journal line is linear again (32 MB in tens of milliseconds instead of seconds).
- DeepSeek prices name their source.

## desktop-v0.1.35 — 2026-10-21

### Security

- Remote control: the phone's diagnostics no longer carry provider secrets or paths of your PC; from the phone a session
  opens only in a folder you allowed; a session id made only of dots can no longer leave its fixed route; a refusal
  reaches the phone with its reason, cleaned.
- Trust in project scripts follows what Node and Python really load: imports reached through a link or a junction are
  resolved from the real path and followed, a linked script is pinned by its target, Python submodules and packages count,
  and link loops stop.

### Added

- **Undo the file changes of a turn**, from the computer and from the phone: a window, a card in the chat, and a tool the
  model can use to propose it — you decide.
- **Remote control, more complete.** A phone that is not connected is woken with a notification when a run fails or a
  session waits for you (never for a sub-agent); the phone sees the PC's models in its picker, can close a session on the
  PC and test an MCP server; from the chat you can list the paired phones, show the pairing QR and revoke a phone;
  `talos-relay` runs your own relay with one command; the name the phone shows for your PC can be chosen.
  **Not usable yet in this version:** remote control needs the iroh binding, which our CI builds after this release; until a
  release ships it, the Remote control page says it is not available.
- **The phone's own model as a source on the PC** (`locale-ospite`): it gets the 11 essential tools, answers in your
  language, and its context is counted exactly by the phone's engine.
- **The summary of a long conversation never blocks the chat.** While a turn waits for it, one line shows the progress and
  an estimated time, with **Skip** (go on with a summary written without the model) and **Stop**; the wait has a time
  ceiling; on a slow local engine TALOS estimates first and does not even ask for a summary that would not fit the ceiling;
  when the summarizer fails, the summary is written without the model and the row says why.
- Workflows: the overview says which budget ran out.
- A compatibility bench for llama.cpp updates (models × controls).

### Changed

- The model now knows where it is working: the prompt gives the full path of the working folder, as the file tools see it
  (`/mnt/c/...` when they run in Linux), and says whether the shell and the file tools run on Windows or in Linux (WSL2).
  The old line said «win32» even when the tools worked in Linux, and a local model went looking in `/`, `/Desktop` and
  `/workspace`. **Privacy:** that path contains your Windows user name, and it is now sent to every model, cloud providers
  included, the same way Hermes, Claude Code, pi and opencode do.
- A path that names the working folder as if it were inside itself (`/Desktop/notes` while working in Desktop) is read as
  `notes` when `/Desktop` does not exist, and the result says so. Every permission check sees the rewritten path.
- Listing a folder that does not exist now suggests up to three real names close to the one asked for.
- A local model with a small context window gets only the essential tools up front, like the phone does; the others stay one
  search away. With a 16K or 32K window, the tool definitions shrink from about 6,400 to about 4,400 tokens.
- When the model that writes conversation summaries keeps failing, TALOS no longer leaves a long conversation over the window:
  it writes the summary itself (your requests, the files, the errors and the last actions) and says so in it.
- On a local engine that serves one request at a time (the PC's llama.cpp, the phone's engine), the summary prepared at the
  end of a turn gives way to your next message at once, instead of making it wait in line.
- Providers, each aligned with its own documentation: reasoning is sent in each provider's own shape (DeepSeek, Kimi,
  MiniMax, Cerebras, Together, DeepInfra, Novita), past reasoning is kept where the provider wants it back (Z.AI, Qwen),
  prompt caching is used where it exists (xAI and the providers that document a cache key; the cache marker only where it
  is declared), the output limit never exceeds the model's declared maximum, and fields that strict providers reject are no
  longer sent. Qwen's parallel tool calls are an option, off by default.

### Fixed

- A context window that fills up, even when the provider says so in the middle of an answer, is handled as a full window:
  the conversation is compacted and continues, instead of ending with an uncertain outcome.
- The PC's local engine: compaction knows its real window (at least 64K when the machine can hold it), it serves one request
  at a time, and summaries ask for reasoning off — and «off» really switches it off.
- Reasoning that a model writes inside its answer (a `<think>` block) no longer shows up as the reply.
- /goal: the reviewer gets the real state of the repository from the server, and when it cannot reach a verdict the goal
  strip says why.
- A paused sub-agent is no longer shown as working or failed, and the conversation does not say it is waiting for it.
- The composer and the branch tree follow a change of language.
- Vertex and Mistral: «off» really turns Gemini's thinking off on Vertex, and Mistral's reasoning effort goes only to the
  models that take it.
- The sidebar header no longer clips its third button.

## desktop-v0.1.34 — 2026-10-18

### Security

- Trust in the project scripts that hooks and MCP servers run no longer relies on a timestamp taken in the same instant the
  file was being written: like git, a file changed within two seconds of being read is hashed again before it is trusted.

### Added

- An app that hosts the TALOS server (the Android app) can keep the ChatGPT plan sign-in itself and hand the server
  short-lived access tokens, so there is one sign-in and one place that renews it.

### Fixed

- Gemini: the free tier's per-minute quota is now treated as a rate limit and TALOS waits the time Google asks for, instead
  of reporting a credit problem. A model Google has retired says so, with a clear card, instead of a generic error; the
  catalog lists Gemini 3.5 Flash-Lite.
- Several tests that depended on timing or on Windows short folder names (`RUNNER~1`) are now reliable on slow machines.

## desktop-v0.1.33 — 2026-10-18

### Security

- Reading a credential in your home folder (SSH keys, cloud and package-manager tokens) now asks even in Full access, whatever
  path, drive spelling, hard link or symbolic link leads to it, and also when a glob or a nested shell (`bash -c`, `cmd //c`)
  would reach it. A project that lives inside a credential folder still reads its own files freely.
- Hooks and MCP servers are trusted together with the project scripts they run: if one of those scripts changes, the trust
  falls and the list says why. The same rule is shared with the TALOS CLI, so trust saved there stays valid.

### Added

- An MCP server that does not start is said in the conversation, once, with the reason and where to fix it (Capability ›
  Connectors), and the connector list shows the same reason. The Markdown export carries the same note.
- Background commands that outlived a server crash are adopted again: they show in Processes and can be stopped. Nothing is
  ever killed automatically.

### Changed

- The model starts each conversation with a short list of tools and finds the others when it needs them (deferred
  tools, like Hermes). The first request of a turn is about half the size it was, with the same results on our coding and
  sections benchmark; a turn that needs a less common tool takes one or two steps more.
- In Full access, creating an automation or excluding a provider no longer asks for a confirmation card. The conversation
  says what the card would have shown, and the warning stays visible with the activity row closed.
- When the same tool keeps failing, the model gets a note to change approach instead of retrying blindly; a refused
  delegation now carries a stable code.
- The Context Engine summary follows the conversation's language.

### Fixed

- The Markdown export no longer prints internal bookkeeping as «unrecognized event»: compactions read as in the chat, and
  the count of left-out internal events is at the end.
- The sandbox label and the «not found on PATH» refusal read correctly in English and Italian.
- With the interface in English, an empty chat no longer says «Nessuna sessione» in its header.

## desktop-v0.1.32 — 2026-10-17

### Fixed

- /goal reaches «done» again when a check is a command. In 0.1.31 the read-only reviewer that must fail to refute the goal
  could not run the contract command (its approval was refused), so the goal paused with «The reviewer could not reach a
  verdict» even with every check passed. The reviewer now runs the commands of the contract, exactly as confirmed (spaces at
  the edges are ignored), with the shell or the test tool, and nothing else. The same fix applies to the contract checks run
  in the conversation of a session that asks before commands.
- The Terminal no longer loses what you type right after opening it. Keystrokes typed before the shell is attached were
  dropped in silence, so a command typed at once could vanish; now they wait and are sent, in order, as soon as the shell is
  ready. If the shell that comes back is a new one, what you typed for the old one is not sent, and the Terminal says so.

## desktop-v0.1.31 — 2026-10-16

A regular release: installs of 0.1.21 and later receive it automatically. The headline is /goal: give a conversation a goal and
TALOS keeps working, turn after turn, until the checks you confirmed pass. Delegations get their own diagram, Z.AI keys go only
where you choose, and the app speaks your system's language.

### New: /goal
- Type `/goal` in the composer, or let the model propose one: TALOS writes the checks that prove the goal is reached, shows them
  on a card for you to confirm, and then keeps working on its own.
- After every turn the checks run in the session folder. A check that fails three times pauses the goal instead of looping; a
  check that cannot be verified does not use up a try.
- «Done» has to be earned: a judge must point to a file that is there now, and a read-only reviewer tries to prove the goal is
  NOT complete before it is declared done. Refuted twice, the goal pauses and says why.
- The goal strip sits above the composer and folds to one line; it opens by itself only when the goal pauses or ends. The goal
  pauses when there is no progress, when a check cannot be verified, on an error, or when you stop it, and the reason is on the
  strip.
- A conversation with nobody in front of it (an automation) never gets a goal or a question about one.

### Added
- Delegations are drawn on the Workflow diagram: the agents a conversation started, live, one request at a time with the earlier
  requests one click away; «Follow», a state filter, isolate a branch, the folder scope, the files each agent touched, and a
  replay of what the history saved. The old list view is gone.
- Z.AI asks where your key goes: GLM Coding Plan or pay-as-you-go balance, International or China. The key is sent only to the
  address you chose; a chat on Z.AI without a choice stops before sending anything and opens the choice.
- With your ChatGPT plan, TALOS reads the limits the service declares (5 hours, weekly) and waits until they reset.
- Instant compaction: the summary of a long conversation is prepared in the background before the limit, and at the limit it
  is swapped in at once instead of stopping the chat for minutes. A summary still being prepared does not hold back a request
  that fits.
- Every turn shows when it started and ended, live and in the replay.
- Two conversations with the same automatic name get a number («-2», «-3»), and older twins are numbered on screen without
  touching your files.

### Changed
- The app follows your system's language instead of always starting in Italian; the installer is in English, Italian on an Italian
  system.
- Example files (`.example`, `.sample`, `.template`) are read without asking, unless they contain something that looks like a real
  key.
- «Read INSTRUCTIONS.md and do it» now works: when you name a file in your own message and ask TALOS to follow it, its
  instructions count as your request, with the same permissions. A file named by another file, a tool result or a sub-agent
  stays data, as before.
- A question that expires no longer stops the turn.
- The Browser tab always opens a page as a web page, at your screen's pixel density.
- A terminal opened outside a conversation is created by the server, one per window.
- Writing a file that may hold keys or passwords now asks, like reading it, except in Full access; a «for this session» yes to
  read such a file does not cover writing it. Your computer's login credentials (`~/.ssh`, `.aws`, `.netrc`, `.npmrc`…) are
  never written, at any access level.

### Fixed
- When the provider says the conversation is too long, TALOS compacts and retries instead of failing; a «too many requests»
  answer is treated as traffic and waited out, not as a full conversation.
- Pressing Stop before a request leaves, or while the conversation is being prepared, ends the turn as stopped and says so.
- A new chat that cannot start keeps your text, attachments and the pending chat.
- An automation run that cannot be opened stops its session, and an end that could not be saved says so; automations retry when
  Windows briefly locks their file.
- An agent has one name everywhere; a name made only of invisible characters falls back to its task.
- Refusals in the file tree, and the refusal of a second answer to a question, say why.
- The model pill names the origin only for direct providers; a ChatGPT plan refusal sent inside the stream is read as the
  plan's refusal.
- A late system message stays in place, so the provider's prompt cache survives between turns; a settings update that changes
  nothing writes nothing.
- The permission line appears only in the main conversation.
- Doctor sentences are complete in both languages.
- Keychain faults and temporary file names in the context engine no longer collide.
- Repeated identical tool calls no longer stop the conversation.
- The context archive repairs itself when the history no longer matches, keeps only the last copy it set aside, and can export it.
- «Compact now» on the nearly-full notice starts at once.
- A passing fault of the ChatGPT plan service is retried instead of ending a sub-agent; two processes renewing the sign-in together
  no longer throw away the good session.
- A failed conversation no longer reads «Succeeded» on top of the diagram.
- A question title longer than 12 characters is shortened instead of blocking the question.
- The installed app ignores an inherited engine variable and says which engine it loaded.
- A file name with an NTFS stream (`.env::$DATA`) no longer hides a secret from the permission check.
- A program placed in the project folder (for example a `node.cmd`) can no longer start in place of the real one when an MCP
  server, an external agent or a hook starts.
- On Anthropic, Gemini and OpenAI direct, a call to a tool that does not exist is refused with the reason instead of ending the
  turn as a dropped connection.
- In an empty folder the model still knows the permission of the turn.

## desktop-v0.1.30 — 2026-10-12

A regular release: installs of 0.1.21 and later receive it automatically. Full access stops asking, sub-tasks start reliably,
and a context failure no longer stops the chat.

### Added
- A link in the chat can open in the TALOS Browser tab or in your system browser. The confirmation shows both buttons, remembers
  where you opened a trusted site, and with «Don't ask me where» stops asking. Pages that grant keys or sign you in always open
  in your system browser. Settings → Trusted sites shows and changes where each site opens.

### Changed
- Full access never asks for permission. Reading a secret file such as `.env`, writing after the model read suspicious content,
  starting a sub-agent and going past 20 sub-agents in one conversation all go ahead without a card. A per-tool «Ask» or «Deny»
  you chose yourself still applies.

### Fixed
- If the context engine fails while preparing a request, the chat goes on with the simple compaction and says so once in the
  turn, instead of stopping every turn with an error.
- With a ChatGPT plan model, sub-tasks and workflow steps no longer fail because the model filled optional fields with empty
  values.
- A sub-task can use any model TALOS can use right now: your ChatGPT plan, providers with a key, Ollama, LM Studio and the local
  engine, not only OpenRouter models.
- A project opened through a Windows short path (`C:\PROGRA~1\…`) no longer stops the server when files change.

## desktop-v0.1.29 — 2026-10-12

A regular release: installs of 0.1.21 and later receive it automatically. It brings your ChatGPT plan into TALOS.

### Added
- «Continue with ChatGPT»: sign in with your ChatGPT account in Providers → OpenAI → Configure, next to the API key, and the
  models of your ChatGPT plan appear in the model selector. Requests on those models use your plan instead of a key. The
  sign-in happens in your browser; the tokens stay in the system keyring and are renewed by themselves.
- When a plan model is in use, a small «ChatGPT plan» badge sits in the composer. Click it to see who is signed in, the usage
  TALOS counted in the last 5 hours and 7 days, and «Manage usage», which opens your ChatGPT usage settings.
- At the plan usage limit the turn waits and continues on its own, with a card that says so and «Manage usage» as its first
  action.
- The model can tell you whether ChatGPT is connected and, after your confirmation in the chat, disconnect it.
- Links in the model's answers can be clicked: TALOS shows the full site and asks before opening it in your browser, with
  «Trust this site» for the ones you open often.
- Updates download only the parts of the installer that changed, instead of the whole installer.

### Changed
- The «Send N» counter left the composer: how many requests this send has used, against its limit, is now the first row of
  the turn index in the Context tab, and it turns amber near the limit.
- The fallback providers («if it does not respond, continue with…») are gone. A chat stays on the model you chose; old
  sessions that had fallbacks open and continue without them.

### Fixed
- In the new-session dialog the «Show reasoning» switch no longer spills out of its row, and the sentence under the button is
  shown once.
- After disconnecting ChatGPT from the chat, the turn ends with a clear card instead of an untranslated error, and the badge
  leaves the composer.
- With a native provider (OpenAI, Anthropic and Anthropic-compatible ones) a rate limit or an error before the first word now
  arrives with its real status and «Retry-After», so TALOS waits the time the provider asks.
- A command that names a secret file through a Windows path (`type .\.e*v`) asks for your confirmation like any other
  spelling, while `echo *` no longer asks without a reason.
- The installed app ships the TypeScript library the code check reads.

## desktop-v0.1.28 — 2026-10-11

A regular release about updating TALOS itself: installs of 0.1.21 and later receive it automatically.

This update, coming from 0.1.27 or earlier, still installs without a window: after «Restart now» TALOS is gone for a few
minutes and then reopens by itself. From 0.1.28 on you see it happen.

### Changed
- «Restart now» shows the installer with its progress bar, skips the pages you do not need when updating, and reopens
  TALOS by itself at the end. Before it closes, TALOS says what is about to happen.
- The app installs 57% fewer files (9,251 → 3,963), so installing and updating have much less to write.

### Fixed
- With the interface in English, three approval cards showed their reason in Italian: running as root in WSL, writing
  outside the session folder, and opening a folder on a network computer. They now follow the language you chose.
- The Context tab and the Context Manager show the same percentage for the same measure, and a count that is an estimate
  is called an estimate, with «~».

## desktop-v0.1.27 — 2026-10-11

A regular, small release: installs of 0.1.21 and later receive it automatically. It fixes a Stop that did not hold.

### Fixed
- Stop in the chat now holds when the turn had left a command running in the background. The Stop ends that command
  too, and its end no longer starts a new turn by itself: the model reads that you stopped it with your next message.
  A command started by an earlier turn keeps running, and when it ends the conversation resumes as before.
- A background command you stop from the Processes tab reads «Cancelled», not «Failed · exit 1».
- The turn index in the Context tab names turns and your messages apart («2 turns · 2 messages»), instead of adding them up.
- The diagram of a Workflow started in another TALOS window opens read-only, instead of failing to load.

## desktop-v0.1.26 — 2026-10-10

A regular release: installs of 0.1.21 and later receive it automatically. It makes long conversations hold up, with a context
engine on by default for new chats and a redesigned Context tab. Workflows and delegated agents can now start, pause and
recover on their own. The live browser is reliable, and the model gets sharper tools for lists and searches.

### Added
- New conversations use the context engine by default: rules first, then a summary that keeps your own requests word for
  word. A switch in Settings turns it off; older conversations keep their previous behaviour.
- The Context tab shows the limit that actually applies, the last request broken down by category, and the compactions.
  Its cards are collapsed by default.
- The Context Manager is redone: an overview on the limit that acts, then one tab at a time. «Compact now…» asks first.
- The Processes tab shows the CPU and memory of running commands, on Windows and in WSL. Its actions sit in a «⋯» menu
  and on right click: Remove, Stop all, and a background section.
- The composer's permission chip says what passes without asking («Plan: read only» in Plan mode).
- With Coordination on, a proposed Workflow starts on its own, and its outcome wakes the conversation. A failed or
  uncertain step can be marked done, set aside, redone with another model, or resumed after checking first. At the run
  ceiling, «Raise the ceiling and resume» continues it.
- Delegated agents can be paused, resumed and retried, by you or by the model. A paused agent is still paused after a
  restart, and its result is judged from what it did, not from the words of its task.
- When a background command ends, the model is told and the conversation resumes by itself.
- A loop guard: a repeated identical call becomes a note, and at the fifth you are asked.
- The model's tools for lists and searches come in pages with a cursor and answer in plain text lines.
  - Notes, tasks, memory, research and the Library each have one «find» tool.
  - Agents, automations and research each have one control tool.
  - Listing a big folder now comes in pages instead of being cut in the middle.
  - Hooks also see the tool the model called.
- A chat open in another live TALOS window is read-only here, and one continued elsewhere reloads by itself.

### Changed
- Provider errors 429 and 5xx are retried 10 times, waiting from 0.5 s and doubling up to 32 s.
  `TALOS_MAX_RETRIES` is capped at 15.
- A permission change made while the model works applies from its next tool call, and the model is told.
- Permission levels have one grammar: an unknown word is refused, and anything unreadable counts as read-only.
- The desktop runs the kernel of the TALOS CLI 0.5.2.
- The source control tab is called Git, and refreshes by itself when files change.

### Fixed
- The live browser no longer stops the server, survives a crashed Chromium, shows the page, and reopens a paused tab by
  itself.
- After a reload, your message keeps its own bubble and attachment chips, and the session title comes from your sentence.
  The chip words follow the interface language.
- A file that changed, or can no longer be read, since the model read it is not overwritten after your approval.
- A context limit not yet known is marked «~» and refreshed by itself, without a reload.
- A paused agent is shown as paused everywhere, never as a red error. A parent ends its turn instead of waiting for its
  children.
- The activity row counts the tools running in parallel.
- A backslash escape shows the character, not the backslash.
- Each question card keeps its own choices.

## desktop-v0.1.25 — 2026-10-09

A regular release: installs of 0.1.21 and later receive it automatically (automatic updates started with 0.1.21). It
hardens the local server against other web pages and other local servers, lets you and the model decide which
OpenRouter providers serve a model, and makes long sessions, the sidebar and the terminal faster.

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

## desktop-v0.1.24 — 2026-10-08

Published as a beta, then made a regular release: installs of 0.1.21 and later receive it automatically. It carries everything listed under 0.1.23 below (never
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
