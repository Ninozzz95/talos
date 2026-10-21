# talos-relay

Your own relay server for [TALOS](https://talos-code.com) remote control.

Your phone reaches TALOS on your computer directly when it can. When it can't, for example on mobile data, the
traffic goes through a relay. The connection is end-to-end encrypted either way, so the relay never sees what you
send. By default TALOS uses the free public relays run by [n0](https://www.iroh.computer). These are rate-limited and
come with no guarantees. talos-relay runs your own relay on a machine you control, with one command.

## What it does

- Downloads the official `iroh-relay` v1.3.0 binary from the
  [iroh release](https://github.com/n0-computer/iroh/releases/tag/v1.3.0), and runs it only if its size and sha256
  match the values pinned in this package. It checks the binary again at every start.
- Creates a secret token. Only clients that present it can use the relay. TALOS on your computer still accepts only
  the phones you paired.
- Gets a free Let's Encrypt certificate for your domain, or uses your own.
- Keeps the metrics port closed.

## Start it

You need Node.js 20 or newer, a domain name that points to the machine, and these ports open to the internet:
TCP 80, TCP 443 and UDP 7842.

```sh
npx talos-relay --domain relay.example.com --email you@example.com
```

On Linux, ports 80 and 443 need root, or allow the binary to use them once:
`sudo setcap cap_net_bind_service=+ep ~/.talos-relay/bin/iroh-relay-v1.3.0`.

With your own certificate:

```sh
npx talos-relay --domain relay.example.com --cert fullchain.pem --key privkey.pem
```

talos-relay prints an address like `https://relay.example.com/?token=…`. On your computer, open TALOS, go to
**Paired phones**, choose **My own server**, paste the address, and pair your phones. Keep the address private,
because whoever has it can use your relay.

The next time, `npx talos-relay` alone starts it again with the same settings.

## Other commands

| Command | What it does |
|---|---|
| `talos-relay address` | Prints the address again. |
| `talos-relay rotate-token` | Makes a new token. Restart the relay, paste the new address in TALOS and pair your phones again. Do this if the address leaked, or after you remove a phone that you no longer trust. |
| `talos-relay --dev [--port 3340]` | Plain HTTP on 127.0.0.1, only to try it on this machine. |

talos-relay keeps its files in `~/.talos-relay`, or in the folder set by `TALOS_RELAY_DIR` or `--dir`. The folder
holds the token, the settings, the generated `iroh-relay.toml`, the certificates and the binary.

## License

AGPL-3.0-only. `iroh-relay` is © N0, INC., licensed under MIT or Apache-2.0, and is downloaded from its official
release.
