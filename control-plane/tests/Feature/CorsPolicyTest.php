<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

final class CorsPolicyTest extends TestCase
{
    public function test_validator_dashboard_origin_can_call_control_plane_api(): void
    {
        $response = $this->options('/api/files/ingest', [], [
            'Origin' => 'http://127.0.0.1:3000',
            'Access-Control-Request-Method' => 'POST',
        ]);

        $response->assertHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:3000');
    }
}
