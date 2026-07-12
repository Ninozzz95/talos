<style data-talos-critical-boot-styles>
    :root {
        --talos-boot-accent: #c98b32;
        --talos-boot-bg: #080b11;
        --talos-boot-text: #edf2f7;
        --talos-boot-muted: #98a5b6;
    }

    body.talos-boot-shell {
        overflow: hidden;
        background: var(--talos-boot-bg);
    }

    #talos-workspace-root[data-talos-app-ready="false"] {
        opacity: 0;
    }

    #talos-workspace-root[data-talos-app-ready="true"] {
        opacity: 1;
    }

    .talos-boot-loader {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: grid;
        place-items: center;
        min-width: 100vw;
        min-height: 100dvh;
        overflow: hidden;
        background:
            radial-gradient(circle at 50% 44%, rgba(201, 139, 50, 0.08), transparent 19rem),
            var(--talos-boot-bg);
        color: var(--talos-boot-text);
        opacity: 1;
        visibility: visible;
        transition: opacity 180ms ease-out, visibility 180ms step-end;
    }

    .talos-boot-loader[data-state="leaving"] {
        pointer-events: none;
        opacity: 0;
        visibility: hidden;
    }

    .talos-boot-loader__timeout {
        position: fixed;
        top: calc(50% + 86px);
        left: 50%;
        width: min(300px, calc(100vw - 32px));
        max-width: 300px;
        margin: 0;
        color: var(--talos-boot-muted);
        font-family: "Segoe UI", ui-sans-serif, system-ui, sans-serif;
        font-size: 12px;
        line-height: 1.5;
        text-align: center;
        transform: translateX(-50%);
        opacity: 0;
        visibility: hidden;
        animation: talos-boot-timeout-reveal 1ms 12s forwards;
    }

    .talos-boot-loader[data-state="failed"] .talos-spinner {
        opacity: 0.58;
    }

    .talos-boot-loader[data-state="failed"] .talos-boot-loader__timeout {
        opacity: 1;
        visibility: visible;
        animation: none;
    }

    .talos-boot-loader__sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
    }

    @keyframes talos-boot-timeout-reveal {
        to {
            opacity: 1;
            visibility: visible;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .talos-boot-loader {
            transition: none;
        }

        .talos-boot-loader .talos-spinner *,
        .talos-boot-loader .talos-spinner *::before,
        .talos-boot-loader .talos-spinner *::after {
            animation: none !important;
            transition: none !important;
        }

        .talos-boot-loader__timeout {
            animation: talos-boot-timeout-reveal 1ms 12s forwards;
        }
    }
</style>
