# Third-Party Notices

This file records direct runtime integrations distributed or referenced by
TALOS. Package manifests and lockfiles remain the authoritative inventory for
transitive dependencies.

## TALOS Artifact Worker

The private artifact worker distributes the following exact direct runtime
dependencies. Their transitive graph and integrity values are frozen in
`artifact-worker/package-lock.json`; package license files remain bundled in
`artifact-worker/node_modules` in the runtime image.

| Component | Upstream | License |
|---|---|---|
| @pdf-lib/fontkit 1.1.1 | https://github.com/Hopding/fontkit | MIT |
| docx 9.7.1 | https://github.com/dolanmiu/docx | MIT |
| Fastify 5.10.0 | https://github.com/fastify/fastify | MIT |
| file-type 22.0.1 | https://github.com/sindresorhus/file-type | MIT |
| officeparser 7.5.0 | https://github.com/harshankur/officeParser | MIT |
| pdf-lib 1.17.1 | https://github.com/Hopding/pdf-lib | MIT |
| PptxGenJS 4.0.1 | https://github.com/gitbrent/PptxGenJS | MIT |
| sharp 0.35.3 | https://github.com/lovell/sharp | Apache-2.0 |
| SheetJS CE 0.20.3 | https://git.sheetjs.com/SheetJS/sheetjs | Apache-2.0 |
| Zod 4.4.3 | https://github.com/colinhacks/zod | MIT |

SheetJS CE is obtained directly from the upstream CDN as
`xlsx-0.20.3.tgz` (2,409,319 bytes), SHA-256
`8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`.

Container stages are pinned to:

- Node.js official image `node:24.18.0-bookworm-slim`, OCI index digest
  `sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d`;
  Node.js is licensed under the MIT License and bundled components retain
  their respective notices.
- Distroless `gcr.io/distroless/nodejs24-debian13:nonroot`, OCI index digest
  `sha256:af85d11ce7ef10172855a6e3649e3e8125b1b9e3ca41849ec2918036f05cb212`;
  the Distroless build project is Apache-2.0 and the image retains Debian and
  Node.js component notices.

### Noto Sans CJK JP Regular 2.004

- Upstream: https://github.com/notofonts/noto-cjk/releases/tag/Sans2.004
- Pinned commit: `523d033d6cb47f4a80c58a35753646f5c3608a78`
- File: `artifact-worker/assets/fonts/NotoSansCJKjp-Regular.otf`
- Size: 16,467,736 bytes
- SHA-256:
  `68a3fc98800b2a27b371f2fb79991daf3633bd89309d4ffaa6946fd587f375b5`
- Copyright: Copyright 2014-2021 Adobe (http://www.adobe.com/).
- License: SIL Open Font License Version 1.1

SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007

PREAMBLE

The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and open
framework in which fonts may be shared and improved in partnership with
others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The fonts,
including any derivative works, can be bundled, embedded, redistributed and/or
sold with any software provided that any reserved names are not used by
derivative works. The fonts and derivatives, however, cannot be released under
any other type of license. The requirement for fonts to remain under this
license does not apply to any document created using the fonts or their
derivatives.

DEFINITIONS

"Font Software" refers to the set of files released by the Copyright Holder(s)
under this license and clearly marked as such. This may include source files,
build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the copyright
statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting, or
substituting, in part or in whole, any of the components of the Original
Version, by changing formats or by porting the Font Software to a new
environment.

"Author" refers to any designer, engineer, programmer, technical writer or
other person who contributed to the Font Software.

PERMISSION AND CONDITIONS

Permission is hereby granted, free of charge, to any person obtaining a copy
of the Font Software, to use, study, copy, merge, embed, modify, redistribute,
and sell modified and unmodified copies of the Font Software, subject to the
following conditions:

1. Neither the Font Software nor any of its individual components, in Original
   or Modified Versions, may be sold by itself.
2. Original or Modified Versions of the Font Software may be bundled,
   redistributed and/or sold with any software, provided that each copy
   contains the above copyright notice and this license. These can be included
   either as stand-alone text files, human-readable headers or in the
   appropriate machine-readable metadata fields within text or binary files as
   long as those fields can be easily viewed by the user.
3. No Modified Version of the Font Software may use the Reserved Font Name(s)
   unless explicit written permission is granted by the corresponding
   Copyright Holder. This restriction only applies to the primary font name as
   presented to the users.
4. The name(s) of the Copyright Holder(s) or the Author(s) of the Font Software
   shall not be used to promote, endorse or advertise any Modified Version,
   except to acknowledge the contribution(s) of the Copyright Holder(s) and
   the Author(s) or with their explicit written permission.
5. The Font Software, modified or unmodified, in part or in whole, must be
   distributed entirely under this license, and must not be distributed under
   any other license. The requirement for fonts to remain under this license
   does not apply to any document created using the Font Software.

TERMINATION

This license becomes null and void if any of the above conditions are not met.

DISCLAIMER

THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF COPYRIGHT, PATENT,
TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE LIABLE FOR
ANY CLAIM, DAMAGES OR OTHER LIABILITY, INCLUDING ANY GENERAL, SPECIAL,
INDIRECT, INCIDENTAL, OR CONSEQUENTIAL DAMAGES, WHETHER IN AN ACTION OF
CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF THE USE OR INABILITY TO USE
THE FONT SOFTWARE OR FROM OTHER DEALINGS IN THE FONT SOFTWARE.

## Docker Desktop 4.82.0

- Upstream: https://docs.docker.com/desktop/release-notes/#4820
- Windows build: `233772`
- On-demand artifact: `https://desktop.docker.com/win/main/amd64/233772/Docker%20Desktop%20Installer.exe`
- SHA-256: `a5b5837542f2f57fadbb09db90a60c84f8efc0a65f8d6dcd2e5b9fca3a2b87e6`
- License: Docker Subscription Service Agreement
- Terms: https://www.docker.com/legal/docker-subscription-service-agreement/
- TALOS use: optional workstation runtime downloaded directly from Docker only
  after explicit operator acceptance. TALOS does not redistribute the installer
  and does not install Docker Desktop on Windows Server.

## Podman 6.0.1

- Upstream: https://github.com/podman-container-tools/podman/releases/tag/v6.0.1
- Pinned release commit: `4cabbe6`
- On-demand artifact: `podman-remote-release-windows_amd64.zip`
- SHA-256: `127d02930ac25c80088817502e833916cd3ee1ed1e771dbd42a4ce81b2e0d415`
- License: Apache License 2.0
- License text: https://github.com/containers/podman/blob/v6.0.1/LICENSE
- TALOS use: repo-local Windows Server container engine with Podman Machine on
  Hyper-V, isolated behind the TALOS runtime adapter.

## Docker Compose 5.1.4

- Upstream: https://github.com/docker/compose/releases/tag/v5.1.4
- Pinned release commit: `4732a2e`
- On-demand artifact: `docker-compose-windows-x86_64.exe`
- SHA-256: `e1a8faff28c7433635201a2222171b727f33ecdb0ed367e54d162d00432f39aa`
- License: Apache License 2.0
- License text: https://github.com/docker/compose/blob/v5.1.4/LICENSE
- TALOS use: pinned Compose provider for the repo-local Podman integration.

## ClamAV 1.5.3

- Upstream: https://github.com/Cisco-Talos/clamav/tree/clamav-1.5.3
- Container: `clamav/clamav:1.5.3`
- Image index digest: `sha256:7f5389ccaa2368c383fa80e167ccfe44348d71e685f926fce4755eed1757673a`
- License: GNU General Public License v2.0
- License text: https://github.com/Cisco-Talos/clamav/blob/clamav-1.5.3/COPYING.txt
- TALOS use: required private malware-scanning sidecar. Laravel streams
  quarantined bytes using the official clamd `INSTREAM` protocol and never
  shares a host path or exposes the daemon publicly.

## Apache Tika Server 3.3.1

- Upstream: https://tika.apache.org/3.3.1/
- Container source: https://github.com/apache/tika-docker
- Container: `apache/tika:3.3.1.0`
- Image index digest: `sha256:90b7fa1dc018434075fce9e1d9b88b1e3d0ea6979d0cf86e116c79a8073ae973`
- Server JAR SHA-512: `2ca66e2445f8463aefad6a6396725cdb64eb23f94d3948a295daf83bba2b5c3bd51b6e29cc52cf6dce8a71948d6a8431dc39efc56500f9bfe30fdbe0a3ee1d48`
- License: Apache License 2.0
- License text: https://github.com/apache/tika-docker/blob/main/LICENSE
- TALOS use: required private PDF/OOXML extraction sidecar behind a bounded
  AVM-owned adapter. Per-request configuration and public exposure are not
  enabled; Tika is not treated as a security boundary.

## Model Context Protocol TypeScript SDK 1.29.0

- Upstream: https://github.com/modelcontextprotocol/typescript-sdk
- Package: https://www.npmjs.com/package/@modelcontextprotocol/sdk/v/1.29.0
- License: MIT License
- Copyright: Copyright (c) 2024 Anthropic, PBC
- TALOS use: pinned official MCP v1 server and client implementation for the
  browser worker's internal stateless Streamable HTTP transport. TALOS keeps
  policy, ownership, evidence, and replay semantics behind an AVM-owned
  adapter; the existing Laravel worker calls remain a separate REST adapter.

MIT License

Copyright (c) 2024 Anthropic, PBC

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## DeepSeek OCR-2

- Upstream code: https://github.com/deepseek-ai/DeepSeek-OCR/tree/2f3699ebbb96fa8af32212e8c170f2cc28730fad
- Pinned code commit: `2f3699ebbb96fa8af32212e8c170f2cc28730fad`
- Model: https://huggingface.co/deepseek-ai/DeepSeek-OCR-2/tree/aaa02f3811945a91062062994c5c4a3f4c0af2b0
- Pinned model and tokenizer revision: `aaa02f3811945a91062062994c5c4a3f4c0af2b0`
- License: Apache License 2.0
- License text: https://github.com/deepseek-ai/DeepSeek-OCR/blob/2f3699ebbb96fa8af32212e8c170f2cc28730fad/LICENSE
- TALOS use: optional local document OCR model served behind the private vLLM
  runtime. TALOS uses a fixed prompt, exact revision and AVM-owned bounded
  worker contract; model output remains untrusted evidence.

## vLLM 0.25.1

- Upstream: https://github.com/vllm-project/vllm/tree/752a3a504485790a2e8491cacbb35c137339ad34
- Pinned commit: `752a3a504485790a2e8491cacbb35c137339ad34`
- Container: `vllm/vllm-openai:v0.25.1`
- Image digest: `sha256:e4f88a835143cd22aee2397a26ec6bb80b3a4a6fe0c882bcbc63822904766089`
- License: Apache License 2.0
- License text: https://github.com/vllm-project/vllm/blob/752a3a504485790a2e8491cacbb35c137339ad34/LICENSE
- TALOS use: optional GPU inference runtime for the exact DeepSeek OCR-2
  revision. It has no public port, uses vLLM's native model implementation and
  is isolated behind the TALOS OCR worker.

## pypdfium2 5.12.1 and PDFium

- Upstream: https://github.com/pypdfium2-team/pypdfium2/tree/b3e7e67a1e35c9436b52cb043d476b89ec8c38cb
- Pinned commit: `b3e7e67a1e35c9436b52cb043d476b89ec8c38cb`
- Package: https://pypi.org/project/pypdfium2/5.12.1/
- License: Apache License 2.0 OR BSD 3-Clause License
- PDFium license: https://pdfium.googlesource.com/pdfium/+/refs/heads/main/LICENSE
- PDFium third-party notices: https://pdfium.googlesource.com/pdfium/+/refs/heads/main/third_party/
- TALOS use: pinned, serialized rendering of bounded image-only PDF pages inside
  the OCR worker. Distributed wheels include PDFium and remain subject to its
  license and third-party notices.

## TALOS OCR worker runtime packages

- Python `3.12.13` image: Python Software Foundation License 2.0,
  https://docs.python.org/3.12/license.html
- uv `0.11.29`: Apache License 2.0 OR MIT License,
  https://github.com/astral-sh/uv/tree/901092ee11a89ba287f274e3c6e3a2e18ec2fba2
- FastAPI `0.139.2`: MIT License,
  https://github.com/fastapi/fastapi/tree/0.139.2
- Uvicorn `0.51.0`: BSD 3-Clause License,
  https://github.com/encode/uvicorn/tree/0.51.0
- HTTPX `0.28.1`: BSD 3-Clause License,
  https://github.com/encode/httpx/tree/0.28.1
- Pillow `12.3.0`: HPND License,
  https://github.com/python-pillow/Pillow/tree/12.3.0
- TALOS use: exact direct runtime dependencies of the isolated OCR worker.
  `ocr-worker/uv.lock` is the authoritative hash-pinned transitive inventory.

## Microsoft Playwright MCP 0.0.78

- Upstream: https://github.com/microsoft/playwright-mcp/tree/v0.0.78
- Package: https://www.npmjs.com/package/@playwright/mcp/v/0.0.78
- Integrity: `sha512-XLTUeA6mEN9sQ+hJ4dfG8EIkDbxS0K3Trc2RBkUJuf02TgE2FQRNTMtq/aJfhyRMINsRl/Ybc4sxcWLtFn4/TQ==`
- Tarball SHA-1: `305c96c4ac0179bd37622fe4ed4162493513b33e`
- Direct transitive runtime pin: `playwright@1.62.0-alpha-1783623505000`
- License: Apache-2.0
- License text: https://github.com/microsoft/playwright-mcp/blob/v0.0.78/LICENSE
- Copyright: Copyright (c) Microsoft Corporation
- TALOS use: direct in-process browser automation server connected through the
  official MCP SDK in-memory transport to the TALOS-owned Playwright
  `BrowserContext`. An AVM gateway exposes only the pinned safe-tool allowlist
  and retains URL policy, capabilities, ownership, one-tab enforcement,
  idempotency, lifecycle, and recovery control. The upstream unsafe code tool
  is never advertised or dispatched.

## PHP Domain Parser 6.4.0

- Upstream: https://github.com/jeremykendall/php-domain-parser/tree/6.4.0
- Package: https://packagist.org/packages/jeremykendall/php-domain-parser#6.4.0
- Source reference: `98401b32371fc1a75d93d4653d311b38e71f0d82`
- License: MIT
- Copyright: Copyright (C) 2013 Jeremy Kendall
- License text: `control-plane/vendor/jeremykendall/php-domain-parser/LICENSE`
- TALOS use: direct, pinned Public Suffix List evaluation behind the
  `TalosPublicSuffixList` adapter. URL parsing remains owned by PHP 8.5's
  built-in WHATWG URL implementation.

## Symfony Polyfill Intl Normalizer 1.38.0

- Upstream: https://github.com/symfony/polyfill-intl-normalizer/tree/v1.38.0
- Package: https://packagist.org/packages/symfony/polyfill-intl-normalizer#v1.38.0
- Pinned commit: `2d446c214bdbe5b71bde5011b060a05fece3ae6b`
- License: MIT License
- License text:
  https://github.com/symfony/polyfill-intl-normalizer/blob/v1.38.0/LICENSE
- TALOS use: direct, pinned NFKC normalization fallback for canonical Library
  search comparison keys when the PHP Intl extension is unavailable. Display
  text, filenames, hashes and evidence remain unchanged.

## Public Suffix List 9b5c8144

- Upstream: https://publicsuffix.org/list/public_suffix_list.dat
- Repository commit: `9b5c814414374aa19a93dc6dd7e47c01909524cc`
- SHA-256: `d2ae7d02585e00b8cb5427dc660d3d45e2a49f618d61c83344fc80502236194c`
- License: Mozilla Public License 2.0
- Bundled license: `control-plane/resources/talos/public_suffix_list.LICENSE`
- Provenance: `control-plane/resources/talos/public_suffix_list.provenance.json`
- TALOS use: reproducible offline public-suffix and registrable-domain
  evaluation for canonical Browser URL intents. Runtime network updates are
  disabled; upgrades require an explicit commit/hash change and regression
  gate.

## Model Context Protocol PHP SDK 0.6.0

- Upstream: https://github.com/modelcontextprotocol/php-sdk
- Package: https://packagist.org/packages/mcp/sdk#v0.6.0
- Pinned commit: `433c84b58af346dd32f15f9909679e96a46ebe23`
- License: Apache-2.0
- License text: https://github.com/modelcontextprotocol/php-sdk/blob/433c84b58af346dd32f15f9909679e96a46ebe23/LICENSE
- TALOS use: development conformance client for the live Browser Worker MCP
  Streamable HTTP integration gate. Runtime product ownership remains in the
  Laravel control plane and its AVM-owned adapter.

## ipaddr.js 2.4.0

- Upstream: https://github.com/whitequark/ipaddr.js
- Package: https://www.npmjs.com/package/ipaddr.js/v/2.4.0
- License: MIT License
- Copyright: Copyright (C) 2011-2017 whitequark
- TALOS use: canonical IP parsing and range classification inside the Browser
  Worker egress boundary before a destination is admitted or pinned.

MIT License

Copyright (C) 2011-2017 whitequark <whitequark@whitequark.org>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Opis JSON Schema 2.6.0

- Upstream: https://github.com/opis/json-schema
- Pinned release: https://github.com/opis/json-schema/releases/tag/2.6.0
- Pinned commit: `8458763e0dd0b6baa310e04f1829fc73da4e8c8a`
- License: Apache-2.0
- License text: https://github.com/opis/json-schema/blob/2.6.0/LICENSE
- TALOS use: direct server-side validation of provider tool arguments and
  package-local Browser v1 contracts before AVM compilation, persistence or
  physical tool dispatch. Remote schemas and provider-supplied schemas are not
  loaded.

## SearXNG 2026.7.12-c19d86faa

- Upstream: https://github.com/searxng/searxng
- Pinned source: https://github.com/searxng/searxng/commit/c19d86faa393bdd696a5708e3c294f956d750683
- Container digest: `sha256:f433294b46a93564993c4371005341e013d94aa8ea4662d8ee521cd2cccb08e8`
- License: AGPL-3.0-or-later
- License text: https://github.com/searxng/searxng/blob/c19d86faa393bdd696a5708e3c294f956d750683/LICENSE
- TALOS use: optional isolated sidecar for the self-hosted `web_search`
  provider. It is disabled by default, runs behind the Compose `search`
  profile, and is accessed through an AVM-owned policy and normalization
  adapter.

The corresponding source for the pinned image is the upstream commit linked
above. Deployments that modify or expose this network service must preserve
the GNU Affero General Public License obligations, including offering the
complete corresponding source of the deployed modified version to its network
users.

## eventsource-parser 3.1.0

- Upstream: https://github.com/rexxars/eventsource-parser/tree/v3.1.0
- Package: https://www.npmjs.com/package/eventsource-parser/v/3.1.0
- Integrity: `sha512-kJezFj9YFAMLeORyi7aCLxLbD5/qWMQnoMVlVPyHIll7lgRJCc3JVln9Vgl9nwQi0YkMnhdGTMNn7CkRRAptMg==`
- License: MIT License
- Copyright: Copyright (c) 2026 Espen Hovlandsdal
  <espen@hovlandsdal.com>
- TALOS use: pinned, source-agnostic Server-Sent Events parsing for the
  browser-side durable chat stream. TALOS retains event validation, ownership,
  sequence, cancellation, retry, persistence, and reconciliation semantics
  behind AVM-owned adapters.

MIT License

Copyright (c) 2026 Espen Hovlandsdal <espen@hovlandsdal.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## interactjs 1.10.27

- Upstream: https://github.com/taye/interact.js
- Package: https://www.npmjs.com/package/interactjs/v/1.10.27
- License: MIT License
- TALOS use: pointer-driven window drag and resize primitives, restriction
  modifiers, and lifecycle cleanup behind the TALOS window adapter.

Copyright (c) 2012-present Taye Adeyemi <dev@taye.me>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## shadcn-vue 2.7.4

- Upstream: https://github.com/unovue/shadcn-vue
- Pinned CLI package: https://www.npmjs.com/package/shadcn-vue/v/2.7.4
- Pinned registry source:
  https://raw.githubusercontent.com/unovue/shadcn-vue/v2.7.4/apps/v4/public/r/styles/default/{name}.json
- License: MIT License
- License text: https://raw.githubusercontent.com/unovue/shadcn-vue/v2.7.4/LICENSE
- Copyright: Copyright (c) 2023 unovue
- TALOS use: upstream-generated Drawer, Dialog, AlertDialog, Collapsible, and Button
  Vue primitives. AVM-owned portal-target wiring and token integration are
  layered at the consumer boundary.

MIT License

Copyright (c) 2023 unovue

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## reka-ui 2.10.1

- Upstream: https://github.com/unovue/reka-ui
- Pinned package: https://www.npmjs.com/package/reka-ui/v/2.10.1
- License: MIT License
- License text: https://raw.githubusercontent.com/unovue/reka-ui/v2.10.1/LICENSE
- Copyright: Copyright (c) 2023 UnoVue <https://github.com/unovue>
- TALOS use: upstream Dialog, AlertDialog, Collapsible, and Primitive
  behavior used by the generated components. TALOS carries the version-scoped
  `control-plane/patches/reka-ui+2.10.1.patch` to make modal accessibility
  cleanup idempotent across repeated Drawer/Dialog lifecycles. The patch is
  removed when an upstream release passes the repeated-modal regression gate.

MIT License

Copyright (c) 2023 UnoVue <https://github.com/unovue>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## patch-package 8.0.1

- Upstream: https://github.com/ds300/patch-package
- Pinned package: https://www.npmjs.com/package/patch-package/v/8.0.1
- Integrity: `sha512-VsKRIA8f5uqHQ7NGhwIna6Bx6D9s/1iXlA1hthBVBEbkq+t4kXD0HHt+rJhf/Z+Ci0F/HCB2hvn0qLdLG+Qxlw==`
- License: MIT License
- Copyright: Copyright (c) 2017-Present David Sheldrick
- TALOS use: build-time application and verification of the version-scoped
  Reka UI modal accessibility cleanup patch. It is not part of the browser
  runtime and receives no TALOS data, credentials, or network authority.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## tw-animate-css 1.4.0

- Upstream: https://github.com/Wombosvideo/tw-animate-css
- Pinned package: https://www.npmjs.com/package/tw-animate-css/v/1.4.0
- License: MIT License
- License text: https://github.com/Wombosvideo/tw-animate-css/blob/v1.4.0/LICENSE
- Copyright: Copyright (c) 2025 Wombosvideo
- TALOS use: upstream Tailwind v4 enter/exit and state animation utilities
  consumed by the shadcn-vue generated primitives.

MIT License

Copyright (c) 2025 Wombosvideo

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
