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
            $table->string('execution_lease_token', 64)->nullable()->after('revision');
            $table->timestamp('execution_lease_expires_at')->nullable()->after('execution_lease_token');
            $table->string('execution_lease_phase', 64)->nullable()->after('execution_lease_expires_at');
            $table->string('provider_operation_key', 71)->nullable()->after('execution_lease_phase');
            $table->string('provider_operation_hash', 71)->nullable()->after('provider_operation_key');
            $table->string('provider_operation_status', 32)->nullable()->after('provider_operation_hash');
            $table->unsignedInteger('provider_round')->default(0)->after('provider_operation_status');
            $table->unsignedTinyInteger('repair_attempt')->default(0)->after('provider_round');
            $table->index(['execution_lease_expires_at', 'status'], 'talos_tool_turns_lease_status_idx');
        });

        Schema::table('talos_tool_calls', function (Blueprint $table): void {
            $table->string('execution_token', 64)->nullable()->after('attempt');
            $table->timestamp('execution_lease_expires_at')->nullable()->after('execution_token');
            $table->string('effect_key', 71)->nullable()->after('execution_lease_expires_at');
            $table->string('effect_status', 32)->nullable()->after('effect_key');
            $table->index(['tool_turn_id', 'effect_status'], 'talos_tool_calls_turn_effect_idx');
        });
    }

    public function down(): void
    {
        Schema::table('talos_tool_calls', function (Blueprint $table): void {
            $table->dropIndex('talos_tool_calls_turn_effect_idx');
            $table->dropColumn(['execution_token', 'execution_lease_expires_at', 'effect_key', 'effect_status']);
        });

        Schema::table('talos_tool_turns', function (Blueprint $table): void {
            $table->dropIndex('talos_tool_turns_lease_status_idx');
            $table->dropColumn([
                'execution_lease_token',
                'execution_lease_expires_at',
                'execution_lease_phase',
                'provider_operation_key',
                'provider_operation_hash',
                'provider_operation_status',
                'provider_round',
                'repair_attempt',
            ]);
        });
    }
};
