# Third-Party Notices

This file records direct runtime integrations distributed or referenced by
TALOS. Package manifests and lockfiles remain the authoritative inventory for
transitive dependencies.

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
- TALOS use: direct server-side validation of provider tool arguments against
  server-owned JSON Schema contracts before AVM compilation or physical tool
  dispatch. Remote schemas and provider-supplied schemas are not loaded.

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
