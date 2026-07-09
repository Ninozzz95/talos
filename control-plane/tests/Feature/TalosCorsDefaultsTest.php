<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

final class TalosCorsDefaultsTest extends TestCase
{
    public function test_cors_defaults_follow_current_talos_ports(): void
    {
        $origins = config('cors.allowed_origins');

        $this->assertContains('http://127.0.0.1:8000', $origins);
        $this->assertContains('http://localhost:8000', $origins);
        $this->assertContains('http://127.0.0.1:8088', $origins);
        $this->assertContains('http://localhost:8088', $origins);
        $this->assertNotContains('http://127.0.0.1:8001', $origins);
        $this->assertNotContains('http://localhost:8001', $origins);
    }
}
