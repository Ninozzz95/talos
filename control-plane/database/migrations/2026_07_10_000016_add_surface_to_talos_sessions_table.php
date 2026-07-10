<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('talos_sessions', function (Blueprint $table): void {
            $table->string('surface')->default('chat')->after('persistence_mode');
            $table->index(['user_id', 'surface', 'updated_at']);
        });
    }

    public function down(): void
    {
        Schema::table('talos_sessions', function (Blueprint $table): void {
            $table->dropIndex(['user_id', 'surface', 'updated_at']);
            $table->dropColumn('surface');
        });
    }
};
