<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('talos_browser_sessions', function (Blueprint $table): void {
            // Legacy rows are truthful at 1: the artifact reader already
            // enforces PNG IHDR dimensions == recorded metadata == viewport,
            // which only holds at device scale 1.
            $table->unsignedTinyInteger('device_scale_factor')->default(1)->after('viewport_height');
        });
    }

    public function down(): void
    {
        Schema::table('talos_browser_sessions', function (Blueprint $table): void {
            $table->dropColumn('device_scale_factor');
        });
    }
};
