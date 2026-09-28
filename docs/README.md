# TALOS documentation

- [Help center](assistenza/README.md) (Italian): the pages TALOS itself shows when you ask for help inside the app — one page per feature, each answering what it does, what it does not do, how to use it and what to do when it goes wrong. The app reads them from this folder, so they describe the version you are running.
- [Project README](../README.md): what TALOS is, how to install and start it, and the license.

`assistenza/verifica-ancore.mjs` checks every statement of the help pages against the code it names, so a page cannot describe something the product does not do.
