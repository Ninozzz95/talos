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
            $table->longText('provider_outcome')->nullable()->after('provider_state_sha256');
            $table->string('provider_outcome_sha256', 71)->nullable()->after('provider_outcome');
        });
    }

    public function down(): void
    {
        Schema::table('talos_tool_turns', function (Blueprint $table): void {
            $table->dropColumn(['provider_outcome', 'provider_outcome_sha256']);
        });
    }
};
