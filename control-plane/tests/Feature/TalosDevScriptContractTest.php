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
        $this->assertStringContainsString('..\\.tools\\bin\\php.cmd artisan serve --host=127.0.0.1 --port=8000', $script);
        $this->assertStringContainsString('..\\.tools\\bin\\php.cmd artisan queue:listen --tries=1 --timeout=0', $script);
        $this->assertStringContainsString('..\\.tools\\bin\\npm.cmd run dev -- --host 127.0.0.1 --port 5173', $script);
    }
}
