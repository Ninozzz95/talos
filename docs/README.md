# TALOS documentation

- [Help center](assistenza/README.md) (Italian): the pages TALOS itself shows when you ask for help inside the app — one page per feature, each answering what it does, what it does not do, how to use it and what to do when it goes wrong. The app reads them from this folder, so they describe the version you are running.
- [Project README](../README.md): what TALOS is, how to install and start it, and the license.

`assistenza/verifica-ancore.mjs` checks every statement of the help pages against the code it names, so a page cannot describe something the product does not do.

## TALOS CLI

The terminal product, published on npm as `talos-code` (`npm i -g talos-code`, then `talos`; Node.js 24).

- [Install](talos-cli/install.md): npm install, first project, update and uninstall.
- [Providers and models](talos-cli/providers.md): cloud providers, local engines, keys.
- [Configuration](talos-cli/configuration.md): scopes and precedence.
- [Permissions and trust](talos-cli/permissions.md): modes, project trust, MCP and hooks.
- [Extensions](talos-cli/extensions.md): plugins, custom commands, the package format.
- [Headless and CI use](talos-cli/ci.md): JSON results, event streams, CI install.
- [Troubleshooting](talos-cli/troubleshooting.md): doctor, logs, diagnostic bundle, terminal behaviour.
- [Command and key reference](talos-cli/command-reference.md): generated from the CLI's own catalogues.
- [Changelog](../cli/CHANGELOG.md): what changed in each version.
