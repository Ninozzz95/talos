# labs/stores/ — lab data, separated by construction

Each lab writes ONLY inside `labs/stores/<lab-name>/`. The contents are ignored by git
(see `.gitignore` at the repository root): only this file stays in the repo, plus one
`README.md` per lab saying what its folder holds and how to reset it.

Never a path into the product's stable stores (`harness-ui/.sessions-store/`,
`.automations/`, `.memory-store/`, `.notes-store/`, `.tasks-store/`): a lab that is off
must have left nothing there.
