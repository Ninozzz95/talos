/* R3 lane S+P: the approval dialog's question, choices and hints (gate E11, Q-R3-5/6/13/14). */
export const approval={
  'approval.question':'Allow this?',
  /* UI Phase 0 D17: the rules engine's `no rule matched`, in words (the engine's reason is unchanged). */
  'approval.reason.noRule':'no rule allows or blocks this, so TALOS asks',
  /* One question per permission tool (gate E11: "a question sentence"). */
  'approval.question.Bash':'Run this command?',
  'approval.question.Write':'Write this file?',
  'approval.question.Edit':'Make this edit?',
  'approval.question.Read':'Read this file?',
  'approval.question.WebFetch':'Open this address?',
  'approval.question.Mcp':'Call this tool?',
  'approval.question.Hook':'Run this hook?',
  'approval.question.Plugin':'Run this plugin tool?',
  'approval.question.TalosService':'Allow this?',
  /* Q-R3-13 (R0 decision 4): the title of a command approval on a host with no verified sandbox. */
  'approval.unsandboxed':'(unsandboxed)',
  /* P13 (owner decision 8): who asks, when a sub-agent does. */
  'approval.origin.agent':'· from agent · {task}',
  'approval.origin.agentUnnamed':'· from an agent',
  /* Q-R3-6: four choices, Deny highlighted; "deny always" only in the full review (or /permissions). */
  'approval.choice.startResearch':'Start','approval.choice.cancelResearch':'Cancel','approval.choice.editQuestion':'Change the question',
  'approval.editQuestion.keys':'enter start · esc back',
  'approval.choice.once':'Allow once',
  'approval.choice.thisChat':'Allow for this chat',
  'approval.choice.session':'Allow for this session',
  'approval.choice.always':'Always allow',
  'approval.choice.deny':'Deny',
  'approval.choice.denyAlways':'Deny always',
  /* A5j (owner 13/11/2026 04:35, road B): the PC's words, desktop 0.2.3 chat.js:1498 `approval.noToTool` */
  'approval.choice.noToTool':'No to this tool until your next message',
  /* Row 126, road A (owner 13/11/2026 04:35): one card for the same calls of one answer, the PC's list (desktop 0.2.3 chat.js:1479-1490).
     In Italian, as the PC says them (chat.js:169-180): «Consenti tutte le chiamate uguali di questa risposta», «Le {count} chiamate a cui
     vale la risposta», «Chiamata {n} di {count}», «E altre {count} chiamate, non elencate qui: la tua risposta vale anche per loro.» */
  'approval.choice.allCalls':'Allow all the same calls of this answer',
  'approval.group.title':'The {count} calls this answer covers','approval.group.call':'Call {n} of {count}',
  'approval.group.more.one':'And {count} more call, not listed here: your answer covers it too.',
  'approval.group.more.other':'And {count} more calls, not listed here: your answer covers them too.',
  /* Q-R3-5 / Q-R3-14: Esc denies and stops the turn from the summary, and goes back from the full review. */
  'approval.hint.summary':'↑↓ Enter · v full review · Esc deny and stop',
  'approval.hint.review':'Enter choose · [5] deny always · v/Esc back',
  'approval.hint.compact':'Esc deny and stop',
  /* network-path series (owner 02/10, dialog preview approved): */
  'approval.network.title':'Permission: {label} on a network computer',
  'approval.network.reason':'Opening it sends your Windows credentials to {host}.',
  'approval.network.folder':'The project folder is on {host}: opening it sends your Windows credentials to that computer. TALOS asks once for this session.',
  'approval.network.unknownHost':'a network computer',
  'approval.hint.reviewNoAlways':'Enter choose · v/Esc back',
  /* The full review, for a person (gate E11, §0.10: no raw JSON, no kernel keys). */
  'approval.review.tool':'Tool',
  'approval.review.path':'Path',
  'approval.review.command':'Command',
  'approval.review.format':'Format',
  'approval.review.address':'Address',
  'approval.review.server':'Server',
  'approval.review.operation':'Operation',
  'approval.review.sensitive':'It touches a file that may hold keys or passwords: {path}',
  'approval.review.outside':'It reads outside the project: {path}',
  'approval.review.sensitiveHidden':'It touches a file that may hold keys or passwords.',
  /* candidate 04/11/2026: the kernel's two reasons (path-policy.mjs server.approval.command.signInLink / tooComplex), said as a fact */
  'approval.review.signInLink':'It can create a sign-in link to TALOS, or read the key that makes those links. Whoever holds one gets in as you.',
  'approval.review.tooComplex':'It is too complex for TALOS to check what it reads.',
  'approval.review.trifecta':'This conversation now holds private data, untrusted content and a way to send data out, so TALOS asks again.',
  'approval.review.other':'Other details',
  /* Owner 09/10/2026: the card of a change of OpenRouter's excluded downstream providers. */
  /* Owner 09/10/2026: a command that asks for the network, outside Full access. */
  'approval.internet.title':'{label} with network access',
  'approval.provider.excludeEvery':'Exclude {slug} on OpenRouter, for every model',
  'approval.provider.exclude':'Exclude {slug} on OpenRouter',
  'approval.provider.allowEvery':'Allow {slug} again on OpenRouter, for every model',
  'approval.provider.allow':'Allow {slug} again on OpenRouter',
  'approval.provider.list':'excluded: {before} → {after}',
  'approval.provider.default':'excluded by default for {model}: {before} → {after}',
  'approval.provider.none':'none',
  'approval.provider.yes':'yes',
  'approval.provider.no':'no',
  /* 0.6.15 T6 (owner «come nel desktop»): the cards of the devices' tools say which device, which folder, which file */
  'approval.device.revoke':'Revoke “{device}” (id {id}) · it is disconnected now and must be paired again to come back',
  'approval.device.folderAllow':'Allow “{device}” (id {id}) to work in {path} · from the device it can read, write and run commands there until you revoke it',
  /* blocked folders step B: unblocking does not allow the folder by itself; the device reaches it again through the folders it is allowed */
  'approval.device.folderUnblock':'Unblock {path} for “{device}” (id {id}) · it can reach that folder again through the folders it is allowed',
  'approval.device.folderRevoke':'Stop “{device}” (id {id}) working in {path} · it can no longer open that folder from the device',
  'approval.device.on':'Turn remote control on · {relay} · paired devices: {devices}',
  'approval.device.relayN0':'through the free servers (n0)',
  'approval.device.relayOwn':'through your own server',
  'approval.device.relayNone':'how devices reach this computer is chosen here first',
  'approval.device.off':'Turn remote control off · connected devices disconnect: {online} of {devices}',
  'approval.device.sendFile':'Send {file} ({size}) to “{device}” (id {id}) · {path}',
  'approval.device.unnamed':'Unnamed device',
  'approval.chatgpt.signOut':'Sign out of ChatGPT · requests stop using your plan until you sign in again',
  'approval.chatgpt.signOutOf':'Sign out of ChatGPT ({email}) · requests stop using your plan until you sign in again',
  /* Owner 09/10/2026: the kernel's question after the model repeated the same call with the same result. */
  'approval.loop':'The model called {tool} {count} times with the same arguments and got the same result · let it go on?',
  /* Q-R3-4: a write or an edit shows its change in the approval, before it happens. */
  'approval.change.newFile':'new file · {lines} lines',
  'approval.change.counts':'+{added} −{removed}',
  'approval.change.none':'no change to the file',
  'approval.change.more':'… {count} more diff lines — press v to review in full',
  /* twin repair of desktop 0.2.2 (0.6.15): what a connector, plugin or Tool Forge call sends, masked and cut by TALOS */
  'approval.arguments.title':'What it sends:',
  'approval.review.plugin':'Plugin',
  'approval.review.itsTool':'Its tool',
  /* riga 91 (0.6.18): the collapsed card of a plugin or Tool Forge tool names which one */
  'approval.outside.pluginTool':'plugin {plugin}, tool {tool}','approval.outside.tool':'tool {tool}',
  'approval.arguments.more':'… {count} more lines — press v to review in full',
  'approval.arguments.cut':'Values cut on this card (…): {count}. The tool receives them whole.',
} as const;
