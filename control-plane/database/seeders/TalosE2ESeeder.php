<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class TalosE2ESeeder extends Seeder
{
    /**
     * Seed deterministic browser-test credentials only for TALOS E2E runs.
     */
    public function run(): void
    {
        User::query()->updateOrCreate([
            'email' => 'test@example.com',
        ], [
            'name' => 'Test User',
            'password' => 'password',
        ]);
    }
}
