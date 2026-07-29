# R7 design - Localized new-chat welcome library

Date: 2026-07-29  
Status: approved by owner

## Scope

The empty new-chat hero keeps the existing TALOS logo, wordmark, composer and
real setup checklist, but replaces the fixed headline/subtitle pair with one
dynamic localized title.

The supported catalog is deliberately bounded to:

- locales: English and Italian;
- day periods: morning, afternoon, evening and night;
- special dates: New Year's Day, Valentine's Day, Halloween, Christmas Eve,
  Christmas Day and New Year's Eve;
- at least ten titles for every condition in every locale.

With ten curated titles for each of four day periods and six special dates,
each locale contains 100 titles and the complete V1 library contains 200.

## Data contract

Each packaged JSON file conforms to `talos.welcome/1`:

```json
{
  "schema": "talos.welcome/1",
  "locale": "en",
  "dayPeriods": {
    "morning": {
      "condition": { "from": "00:00", "before": "12:00" },
      "titles": ["..."]
    }
  },
  "specialDates": {
    "christmas_day": {
      "condition": { "month": 12, "day": 25 },
      "titles": ["..."],
      "easterEgg": "gift"
    }
  }
}
```

The parser is strict:

- no unknown or missing keys;
- exact schema and locale;
- exact CLDR 48.2 day-period intervals for the locale;
- complete, non-overlapping 1,440-minute coverage;
- exact six dates and allowlisted decorations;
- at least ten non-empty, trimmed, unique titles per condition;
- title maximum of 72 Unicode code points;
- no pictographic emoji in title copy.

Invalid data fails closed to the existing localized
`chat.welcomeHeadline`; it never blanks or blocks the chat.

## Resolution

`resolveTalosWelcome(catalog, { at, seed })`:

1. reads only local month, day, hour and minute from the captured `Date`;
2. gives an exact special-date match precedence over day period;
3. selects the applicable CLDR-backed period otherwise;
4. hashes the session seed deterministically and selects one array index;
5. returns the title, condition identifier, index and optional easter egg.

The seed is the persisted chat-session ID. Before a session exists, a secure
ephemeral TALOS ID is used. The date/time and seed are captured when the
active-session identity changes; rerender, focus, rotation and locale changes
do not recapture them.

Changing locale keeps the captured seed and instant. Because EN/IT arrays have
matching counts and semantic ordering, the same index yields the translated
equivalent whenever both locales resolve the same condition. Locale-specific
CLDR boundaries remain authoritative when the conditions differ.

## Async lifecycle

The complete welcome-title component, parser/resolver runtime, resolved locale
JSON and special-date renderer are explicit nested dynamic boundaries. The
screen supplies one immediate localized `h1` as both the loading and error
component of `defineAsyncComponent`, with zero delay and local async-state
ownership. The empty state therefore never flashes blank while the title
component loads or if its import fails. Once loaded, the zero-prop component
consumes the existing i18n and chat-controller singletons and owns
`useTalosWelcome`; a monotonic request revision prevents an older catalog load
from overwriting a newer locale or session activation. The parent hero's
existing `data-composer-expanded` state controls the shared semantic title
class in global CSS, so fallback and resolved headings have identical
typography without eager prop/class duplication. The special-date renderer is
requested only when a matching decoration exists.

During load, and on any import or validation failure:

- the existing localized fallback title is rendered;
- no easter egg is rendered;
- the composer remains usable;
- no network request or model call is attempted.

The final title replacement has no additional animation. It cannot retrigger
the hero entrance or reflow the surrounding logo/composer shell.

## Visual and accessibility contract

The subtitle paragraph is removed from the Vue template, not hidden with CSS.
The hero has exactly one `h1`.

Special-date mapping:

| Condition | Existing Lucide component |
| --- | --- |
| New Year's Day | `PartyPopper` |
| Valentine's Day | `Heart` |
| Halloween | `Ghost` |
| Christmas Eve | `Snowflake` |
| Christmas Day | `Gift` |
| New Year's Eve | `Clock` |

The easter egg:

- is an inline, theme-colored, static 20 px decoration;
- is `aria-hidden="true"` and receives no focus;
- has `pointer-events: none`;
- injects no markup, URL, class or component name from JSON;
- uses an exhaustive AVM-owned allowlist;
- does not change the heading's accessible name.

## Editorial contract

- Original TALOS wording informed by documented greeting patterns.
- Short title or focused question; no explanatory subtitle.
- Professional, helpful and action-oriented.
- No user name, demographic, belief or protected-trait inference.
- No feature claim beyond the actual TALOS chat surface.
- EN/IT entries remain semantic translations at the same array index.
- Event wording is contextual but does not assume the user's beliefs or
  participation.

## Compatibility

Preserve:

- existing `chat.welcomeHeadline` as the synchronous fallback;
- the logo, TALOS wordmark, setup checklist and composer layout;
- active session creation/selection and encrypted persistence;
- system/default and explicit locale behavior;
- ChatScreen's dynamic route boundary;
- initial JavaScript and CSS ceilings;
- all existing chat, setup, locale, reduced-motion and Android flows.

## Acceptance and rollback

The slice closes only after catalog, resolver, reactive race, component,
ChatScreen, build-boundary and real browser gates pass. Browser proof covers
phone, tablet, explicit locale switch, same-index translation, reload
stability, title-only DOM, decorative icon and reduced motion.

Rollback removes only the dedicated welcome files and reconnects
`ChatScreen.vue` to `chat.welcomeHeadline`. No database, native resource,
stored chat, API, dependency or migration rollback is required.
