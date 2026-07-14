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
            $table->unsignedBigInteger('worker_state_version')->default(0)->after('policy');
        });
    }

    public function down(): void
    {
        Schema::table('talos_browser_sessions', function (Blueprint $table): void {
            $table->dropColumn('worker_state_version');
        });
    }
};
