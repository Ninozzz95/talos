<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('talos_browser_hmi_approvals', function (Blueprint $table): void {
            $table->string('command_id', 128)->nullable()->after('browser_session_id');
            $table->timestamp('execution_started_at')->nullable()->after('approved_at');
            $table->json('result_payload')->nullable()->after('consumed_at');
            $table->unique(['browser_session_id', 'command_id'], 'talos_browser_hmi_command_unique');
        });
    }

    public function down(): void
    {
        Schema::table('talos_browser_hmi_approvals', function (Blueprint $table): void {
            $table->dropUnique('talos_browser_hmi_command_unique');
            $table->dropColumn(['command_id', 'execution_started_at', 'result_payload']);
        });
    }
};
