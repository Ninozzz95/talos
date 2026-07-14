<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('talos_browser_events', function (Blueprint $table): void {
            $table->string('command_id', 128)->nullable()->after('actor');
        });

        Schema::table('talos_browser_events', function (Blueprint $table): void {
            $table->unique(
                ['browser_session_id', 'type', 'command_id'],
                'talos_browser_events_command_type_unique',
            );
        });
    }

    public function down(): void
    {
        Schema::table('talos_browser_events', function (Blueprint $table): void {
            $table->dropUnique('talos_browser_events_command_type_unique');
            $table->dropColumn('command_id');
        });
    }
};
