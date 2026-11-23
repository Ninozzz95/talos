/* R2 common words shared by every area (owner: coordinator). */
export const common={
  'common.details':'Details',
  /* Judge v1534 point 2 (11/11/2026): doctor, provider, session and remote in a folder nobody decided (src/commands/any-folder.ts). */
  'common.trust.projectSettingsIgnored':'This folder was never trusted: TALOS left out its project settings, instructions, hooks and connections. Trust it with `talos project trust`.',
  /* R7 (owner 2026-09-25): `talos update` of an npm install. */
  'common.update.npmAvailable':'TALOS CLI {version} is available (this is {current}). Update with: {command}',
  'common.update.upToDate':'TALOS CLI is up to date',
  /* 08/10/2026 (owner approved the opt-in session export): what `talos diagnostic bundle --session` tells the person about the file it wrote. */
  'common.diagnostic.sessionIncluded':'This bundle includes the conversation of session {session} ({kept} of {events} events).',
  'common.diagnostic.sessionOmitted':'{omitted} older events in the middle were left out to keep the file small.',
  'common.diagnostic.sessionMasked':'API keys, tokens and the paths of your home folder, this project and TALOS\'s own folders are masked. Other paths, names, code, file contents and anything you typed or the model wrote are NOT. Read it before you share it.',
  'common.help.header':'TALOS CLI {version}',
  'common.help.familyUsage':'Usage: talos {family} <operation> [options]',
  'common.help.familyOptions':'Usage: talos {family} {options}',
  'common.help.operations':'Operations: {list}',
  'common.help.options.doctor':'[--json] [--profile]',
  'common.help.options.logs':'[--tail N]',
  'common.help.options.diagnostic':'bundle --out FILE [--session ID|last]',
  'common.help.options.update':'[--check] [--channel stable|preview]',
  'common.help.options.init':'',
  'common.help.more':'Global options and the other command families: talos --help',
  /* 14/10/2026: `talos <family> <operation> --help` is that operation's own help (commands/family-help.ts OPERATION_HELP). */
  'common.help.operationUsage':'Usage: {usage}',
  'common.help.operationOptions':'Options:',
  'common.help.operationOthers':'The other operations of talos {family}: talos {family} --help',
  /* F-ENG-2 (rc.1 stress smoke, 08/10/2026): what the end of `talos -p` says about the background commands it stopped. */
  'common.background.stopped.one':'Stopped {count} background command so the run could end: {list}.',
  'common.background.stopped.other':'Stopped {count} background commands so the run could end: {list}.',
  'common.background.exited':'{command} (output: {file})',
  'common.background.notExited':'{command} (stop sent, not seen exiting within {seconds} s; output: {file})',
  'common.background.noCommand':'a command with no text',
  'common.background.noFile':'none',
  /* Measured by the desktop on 08/10/2026: the stop ends the whole Windows tree, interop children and plain Linux children included; only a Linux process the
     command detached inside WSL (setsid, nohup, a server that daemonizes) survives. */
  'common.background.wsl':'A Linux process that a command detached inside WSL (setsid, nohup, a server that daemonizes) can still be running.',
  /* A command line with an argument the operation does not take (config, provider). */
  'common.args.unexpected':'Unexpected argument: {arg}',
  /* F-P-004 (owner 09/10/2026): the command that trusts a project, named where its rules are left out. */
  'common.project.trustCommand':'talos project trust',
  /* review 1 of 0.6.13 (S2-1): the screen's exit waits for the summary of the conversation still on its way, bounded */
  'common.exit.summaryFinishing':'Finishing the summary of this conversation before closing (at most {seconds} seconds)…',
  'common.item.one':'{count} item',
  'common.item.other':'{count} items',
} as const;
