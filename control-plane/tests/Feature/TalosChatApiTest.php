<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class TalosChatApiTest extends TestCase
{
    public function test_talos_chat_proxies_to_the_validator_chat_endpoint(): void
    {
        config(['services.avm_validator.url' => 'http://validator.test']);

        Http::fake([
            'validator.test/chat' => Http::response([
                'text' => 'Risposta reale da Kadmos',
                'mutations' => [
                    ['action' => 'SPAWN_NODE', 'node_id' => 'n1', 'node_type' => 'HTTP_REQUEST'],
                ],
                'dag' => 'Node: n1 | Type: HTTP_REQUEST | Status: SUCCESS | Result: ok',
            ]),
        ]);

        $response = $this->postJson('/api/talos/chat', [
            'message' => 'Analizza questo workflow',
            'api_key' => 'sk-test',
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('text', 'Risposta reale da Kadmos')
            ->assertJsonPath('mutations.0.action', 'SPAWN_NODE');

        Http::assertSent(fn ($request): bool => $request->url() === 'http://validator.test/chat'
            && $request['message'] === 'Analizza questo workflow'
            && $request['api_key'] === 'sk-test');
    }

    public function test_talos_chat_requires_a_message(): void
    {
        $this->postJson('/api/talos/chat', [
            'message' => '',
        ])->assertUnprocessable();
    }
}
