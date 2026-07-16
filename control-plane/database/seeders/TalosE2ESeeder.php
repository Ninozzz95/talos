<?php

namespace Database\Seeders;

use App\Models\TalosModelProfile;
use App\Models\User;
use Illuminate\Database\Seeder;

class TalosE2ESeeder extends Seeder
{
    /**
     * Seed deterministic browser-test credentials only for TALOS E2E runs.
     */
    public function run(): void
    {
        $user = User::query()->updateOrCreate([
            'email' => 'test@example.com',
        ], [
            'name' => 'Test User',
            'password' => 'password',
        ]);

        TalosModelProfile::query()->updateOrCreate([
            'id' => '019f66f0-0000-7000-8000-000000000001',
        ], [
            'user_id' => $user->id,
            'provider' => 'ollama',
            'model' => 'talos-e2e-local',
            'display_name' => 'TALOS E2E local fixture',
            'encrypted_secret' => null,
            'base_url' => 'http://127.0.0.1:11434/v1',
            'timeout_seconds' => 5,
            'status' => 'healthy',
            'capabilities' => ['chat' => true],
            'probe_result' => [
                'ok' => true,
                'fixture' => true,
                'checked_at' => '2026-07-16T00:00:00Z',
            ],
        ]);
    }
}
