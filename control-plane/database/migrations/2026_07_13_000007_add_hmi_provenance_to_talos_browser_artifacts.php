<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('talos_browser_artifacts', function (Blueprint $table): void {
            $table->string('worker_capture_id')->nullable()->after('user_id');
            $table->string('source_command_id')->nullable()->after('worker_capture_id');
            $table->unsignedBigInteger('source_state_version')->nullable()->after('source_command_id');
            $table->unsignedBigInteger('state_version')->nullable()->after('source_state_version');
            $table->string('trust_boundary')->nullable()->after('state_version');
            $table->index(['worker_capture_id', 'type'], 'talos_browser_artifacts_capture_type_index');
            $table->index(['source_command_id', 'type'], 'talos_browser_artifacts_command_type_index');
        });
    }

    public function down(): void
    {
        Schema::table('talos_browser_artifacts', function (Blueprint $table): void {
            $table->dropIndex('talos_browser_artifacts_capture_type_index');
            $table->dropIndex('talos_browser_artifacts_command_type_index');
            $table->dropColumn(['worker_capture_id', 'source_command_id', 'source_state_version', 'state_version', 'trust_boundary']);
        });
    }
};
