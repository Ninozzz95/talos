<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('talos_tool_turns', function (Blueprint $table): void {
            $table->longText('loop_guard_state')->nullable()->after('provider_outcome_sha256');
            $table->string('loop_guard_state_sha256', 71)->nullable()->after('loop_guard_state');
        });
    }

    public function down(): void
    {
        Schema::table('talos_tool_turns', function (Blueprint $table): void {
            $table->dropColumn(['loop_guard_state', 'loop_guard_state_sha256']);
        });
    }
};
