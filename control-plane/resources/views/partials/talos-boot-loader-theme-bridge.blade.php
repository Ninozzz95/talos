<style data-talos-boot-theme-bridge>
    .talos-boot-loader .hex-border,
    .talos-boot-loader .edge,
    .talos-boot-loader .node {
        stroke: var(--talos-boot-accent, #F5A623);
    }

    .talos-boot-loader .node {
        animation-name: talosBootIgniteNode;
    }

    @keyframes talosBootIgniteNode {
        0%, 15% {
            fill: #0A0C10;
            stroke-width: 9;
            filter: drop-shadow(0 0 0 transparent);
        }

        35%, 65% {
            fill: var(--talos-boot-accent, #F5A623);
            stroke-width: 0;
            filter: drop-shadow(0 0 12px var(--talos-boot-accent, #F5A623));
        }

        85%, 100% {
            fill: #0A0C10;
            stroke-width: 9;
            filter: drop-shadow(0 0 0 transparent);
        }
    }
</style>
