# Research dossier - P0 composite tool permissions

Date: 2026-07-28

Subsystem: TALOS mobile tool authorization, web-source persistence, and AI
Defaults permission copy.

Lane: `<corsia locale>`

Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`

## Reproduction and root cause

The independent R3 review reproduced an authorization mismatch:

1. `web_search` and `web_read` declare only the primary action `outbound`;
2. both tools also create persistent, user-visible Library records through
   `rememberSearch` or `remember`;
3. the central executor and the schema-offer filter inspect only
   `tool.action`;
4. therefore `outbound=allow, write=deny` still performs a persistent write;
5. AI Defaults says `write` governs creating or changing things, while its
   outbound help text incorrectly says no current TALOS function uses it.

The encrypted source dossier is not an internal best-effort audit row. It is a
normal Library artifact that the owner can see, search, export, and delete.
Calling it an audit side effect does not remove the `write` capability.

## Current primary standards

### OWASP Authorization Cheat Sheet

- Source:
  `https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html`
- Repository pin:
  `OWASP/CheatSheetSeries@2a21d7eb677eb89acf7176bab0b150382818bbc0`
- Retrieved: 2026-07-28.
- Relevant requirements: enumerate operations on resources, enforce least
  privilege, deny by default, validate permissions on every request, centralize
  failure handling, and add unit/integration authorization tests.

Decision: **ADAPT** in the AVM-owned tool registry and central executor. A tool
that crosses more than one capability boundary declares the complete set; every
required action is evaluated before any tool body or network source runs.

### NIST SP 800-53 Rev. 5.1, AC-6

- Source:
  `https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final`
- Pin: NIST Special Publication 800-53 Revision 5.1, control AC-6.
- Retrieved: 2026-07-28.
- Relevant requirement: processes acting for a user receive no more privilege
  than is necessary for the task.

Decision: **ADOPT SEMANTICS**, not a package. `web_search` and `web_read`
require both outbound access and permission to write their persistent source
records.

### Android privacy guidance

- Source: `https://developer.android.com/privacy-and-security/about`
- Retrieved: 2026-07-28.
- Relevant requirement: request the minimum permission needed, remain
  transparent, preserve user control, and degrade safely when permission is
  denied.

Decision: **ADAPT** at the in-app capability layer. This is not an Android
runtime permission, so no manifest permission is added. Denial prevents the
tool from being offered or executed and produces an explicit policy result.

## Alternatives

### Treat Library persistence as an audit exception

Rejected. The records are ordinary Library content, not an isolated immutable
audit journal. This would preserve the bypass and contradict the Settings copy.

### Search/fetch first and skip persistence when write is denied

Rejected for this slice. TALOS currently promises that web evidence remains
auditable after a source changes or disappears. Silently dropping provenance
would weaken an established product contract. A future split
`web_search`/`library_archive_web_source` could be designed explicitly, but it
would materially change the agent loop and user experience.

### Add ad-hoc checks inside each web tool

Rejected. Tool bodies do not receive the permission state, the offer filter
would still advertise an impossible schema, and future compound tools could
repeat the defect. Authorization belongs at the existing central boundary.

## Upstream decision

No package is appropriate. TALOS will **adapt** OWASP/NIST least-privilege
semantics behind its own provider-neutral registry:

- keep the compatibility `action` as the primary audit/action label;
- add `requiredActions` for the complete capability set;
- default legacy tools to `[action]`;
- fail closed if any required permission is denied;
- request one explicit confirmation for the subset configured as `ask`;
- expose no schema when any required permission is `deny`;
- include the complete capability set in the audit payload;
- make the Settings copy state that web research uses both outbound and write.

No dependency, migration, protocol version, or provider-specific wire field is
introduced.

## R4 follow-up: remaining compound tools

Fresh review of the real tool bodies found two more operations crossing more
than their declared primary boundary:

- `generate_image` sends the prompt to a configured remote image provider and
  then persists the returned bytes. It therefore requires `outbound + write`;
  `write` alone lets a model-controlled prompt leave the device even when the
  owner set outbound to deny.
- `library_export` selects a private Library record, decrypts/reads its bytes,
  and writes a user-visible copy through the platform Save-As boundary. It
  therefore requires `read + write`; `write` alone bypasses an explicit read
  denial.

The 2026-07-28 live recheck of the primary sources above still supports the
existing decision: OWASP requires operation/resource enumeration, least
privilege, deny-by-default, centralized checks, and authorization regression
tests; NIST AC-6 requires processes to receive only the privileges needed for
the requested task. The implementation is an **ADAPT** of those semantics in
the already-shipped AVM-owned compound-capability contract. No package,
manifest permission, provider wire field, or new authorization abstraction is
appropriate.
