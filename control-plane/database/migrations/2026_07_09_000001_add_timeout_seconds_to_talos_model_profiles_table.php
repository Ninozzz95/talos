<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('talos_model_profiles', function (Blueprint $table): void {
            $table->unsignedSmallInteger('timeout_seconds')->default(60)->after('base_url');
        });
    }

    public function down(): void
    {
        Schema::table('talos_model_profiles', function (Blueprint $table): void {
            $table->dropColumn('timeout_seconds');
        });
    }
};
