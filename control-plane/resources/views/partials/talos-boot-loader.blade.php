<div
    class="talos-boot-loader"
    data-talos-boot-loader="true"
    data-state="loading"
    role="status"
    aria-live="polite"
    aria-atomic="true"
    style="--talos-boot-accent: {{ $bootAccent ?? '#c98b32' }}"
>
    @include('partials.talos-loading-logo')
    <span class="talos-boot-loader__sr-only" data-talos-boot-status>Starting TALOS.</span>
    <p class="talos-boot-loader__timeout" data-talos-boot-timeout>
        TALOS is taking longer than expected. Reload the page; if the issue persists, check the control plane with Doctor.
    </p>
    <noscript>
        <p class="talos-boot-loader__timeout" style="opacity: 1; visibility: visible; animation: none;">
            TALOS requires JavaScript to render the workspace.
        </p>
    </noscript>
</div>
