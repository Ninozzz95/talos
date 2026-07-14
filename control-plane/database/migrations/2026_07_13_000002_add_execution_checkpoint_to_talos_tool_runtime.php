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
            $table->string('browser_session_id')->nullable()->after('session_id');
            $table->foreign('browser_session_id')
                ->references('id')
                ->on('talos_browser_sessions')
                ->nullOnDelete();
            $table->longText('dag_state')->nullable()->after('provider_state_sha256');
            $table->string('dag_state_sha256', 71)->nullable()->after('dag_state');
            $table->index(['browser_session_id', 'status'], 'talos_tool_turns_browser_status_idx');
        });

        Schema::table('talos_tool_calls', function (Blueprint $table): void {
            $table->longText('canonical_call')->nullable()->after('arguments');
            $table->longText('execution_context')->nullable()->after('canonical_call');
        });
    }

    public function down(): void
    {
        Schema::table('talos_tool_calls', function (Blueprint $table): void {
            $table->dropColumn(['canonical_call', 'execution_context']);
        });

        Schema::table('talos_tool_turns', function (Blueprint $table): void {
            $table->dropIndex('talos_tool_turns_browser_status_idx');
            $table->dropForeign(['browser_session_id']);
            $table->dropColumn(['browser_session_id', 'dag_state', 'dag_state_sha256']);
        });
    }
};
