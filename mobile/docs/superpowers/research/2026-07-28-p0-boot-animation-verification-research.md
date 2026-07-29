# P0 boot animation verification research

Date: 2026-07-28  
Lane: `lane/kimi-mobile`  
Baseline: `0e66f3b27f771e37f43b5b7502307c8ee34f6569`

## Problem named from owner evidence

The immutable Claude transcript records four launch defects:

- the app became visible before the boot sequence ended;
- the sequence felt too fast;
- it janked on the owner's Android device;
- traversed lines and nodes disappeared instead of remaining assembled.

Commits already present in the baseline changed the hold to 1,500 ms, made the
sequence finite, retained the final mark, and removed animated fill,
stroke-width and filter changes. Current inspection found one remaining
paint-bound property: every edge still animates `stroke-dashoffset`.

## Current primary sources

1. Android SplashScreen guide  
   <https://developer.android.com/develop/ui/views/launch/splash-screen>
   - Android 12+ provides the platform launch screen and recommends a stable
     visual handoff instead of exposing an incomplete interface.
   - Platform icon animation should normally stay at or below 1,000 ms and be
     safely skippable.

2. AndroidX SplashScreen API  
   <https://developer.android.com/reference/androidx/core/splashscreen/SplashScreen>
   - `KeepOnScreenCondition` is evaluated before every draw and must remain
     fast; it is not a general animation engine.

3. Android WebView startup guidance  
   <https://developer.android.com/develop/ui/views/layout/webapps/optimize-webview-startup>
   - implicit WebView startup is expensive on the UI thread;
   - the new background startup API requires AndroidX WebKit 1.16.0+;
   - if WebView is the immediate core journey, prewarming cannot replace the
     required first WebView.

4. web.dev animation performance  
   <https://web.dev/articles/animations-and-performance>  
   <https://web.dev/articles/animations-guide>
   - prefer `opacity` and `transform`, which can remain on the compositor;
   - geometry and paint-triggering animation is a common source of jank;
   - use `will-change` narrowly for imminent animation, not globally.

5. MDN `prefers-reduced-motion`  
   <https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion>
   - the established media feature communicates that non-essential motion
     should be removed, reduced or replaced.

## Upstream decision

- **Adopt directly:** retain `androidx.core:core-splashscreen:1.2.0` and the
  existing `Theme.SplashScreen` Android launch theme.
- **Adapt behind AVM UI:** the owner's deliberately longer branded sequence
  remains an in-WebView one-shot overlay, not a platform icon animation.
- **Reject for this slice:** do not add/upgrade to AndroidX WebKit 1.16 solely
  for `startUpWebView`; WebView is the immediate product surface and a
  dependency upgrade is not evidence for this animation regression.
- **Replace locally:** reveal the four simple SVG edges with `scaleY` plus
  opacity instead of `stroke-dashoffset`. All animated boot properties then
  stay inside the compositor-friendly `transform`/`opacity` set.

## Competitor-informed one-up

The one-up is not a longer decorative wait. It is a deterministic handoff:
the complete DAG is visible before the overlay fades, the underlying app never
flashes through mid-build, reduced-motion users get the settled mark, and no
per-frame SVG geometry/filter repaint is required.

