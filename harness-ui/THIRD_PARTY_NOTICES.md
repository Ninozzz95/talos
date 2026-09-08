# Native model provider adapters

Pinned 2026-09-08 in package-lock.json with npm integrity hashes:

| Package | Version | License | Upstream |
| --- | --- | --- | --- |
| ai | 7.0.93 | Apache-2.0 | https://github.com/vercel/ai |
| @ai-sdk/anthropic | 4.0.49 | Apache-2.0 | https://github.com/vercel/ai/tree/main/packages/anthropic |
| @ai-sdk/google | 4.0.64 | Apache-2.0 | https://github.com/vercel/ai/tree/main/packages/google |
| @ai-sdk/openai | 4.0.61 | Apache-2.0 | https://github.com/vercel/ai/tree/main/packages/openai |
| zod | 4.5.4 | MIT | https://github.com/colinhacks/zod |

Original LICENSE files are shipped by the installed npm distributions. Preserve
those files when redistributing the application and its dependencies. TALOS
uses the SDK as a transport adapter; execution policy, tools, checkpoints and
the agent loop remain owned by TALOS. The adapter does not use AI Gateway.

Upgrade gate: native-provider-adapter.test.mjs, model-destination.test.mjs,
kernel tests, full affected backend suite and real multi-turn composer tests
with images and a file tool for each direct provider. Verify exact Node support
and npm audit before changing pins. Rollback uses the previous package manifest
and lock with npm ci, together with the corresponding adapter commit. Persisted
image references and conversation originals must not be deleted during rollback.

Audit on this date also reports existing image-size/pptxgenjs findings outside
these new packages. No forced downgrade or unrelated dependency change applied.
