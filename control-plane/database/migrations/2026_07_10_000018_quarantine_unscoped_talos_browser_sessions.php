<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('talos_browser_sessions')
            ->whereNull('talos_session_id')
            ->update([
                'status' => 'expired',
                'expires_at' => now(),
                'updated_at' => now(),
            ]);
    }

    public function down(): void
    {
        // Legacy sessions cannot be assigned to a chat without trustworthy provenance.
    }
};
