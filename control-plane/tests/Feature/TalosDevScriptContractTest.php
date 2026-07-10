<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

final class TalosDevScriptContractTest extends TestCase
{
    public function test_composer_dev_script_is_windows_safe_and_uses_canonical_ports(): void
    {
        $composer = json_decode((string) file_get_contents(base_path('composer.json')), true);

        $script = implode(' ', $composer['scripts']['dev'] ?? []);

        $this->assertStringNotContainsString('artisan pail', $script);
        $this->assertStringNotContainsString('"php artisan', $script);
        $this->assertStringNotContainsString('"npm run dev', $script);
        $this->assertStringContainsString('..\\.tools\\bin\\node.cmd scripts/dev-stack.mjs', $script);

        $devStack = (string) file_get_contents(base_path('scripts/dev-stack.mjs'));
        $this->assertStringContainsString('artisan serve --host=127.0.0.1 --port=8000', $devStack);
        $this->assertStringContainsString('artisan queue:listen --tries=1 --timeout=0', $devStack);
        $this->assertStringContainsString('run dev -- --host 127.0.0.1 --port 5173', $devStack);
        $this->assertStringContainsString("AVM_VALIDATOR_URL: 'http://127.0.0.1:3000'", $devStack);
        $this->assertStringContainsString('run build', $devStack);
        $this->assertStringContainsString('run start', $devStack);
        $this->assertStringContainsString("PORT: '3100'", $devStack);
        $this->assertStringContainsString('TALOS_BROWSER_WORKER_TOKEN', $devStack);
    }
}
