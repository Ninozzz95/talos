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
            $table->string('persistence_mode')->default('persistent')->after('mode');
            $table->index('persistence_mode');
        });
    }

    public function down(): void
    {
        Schema::table('talos_sessions', function (Blueprint $table): void {
            $table->dropIndex(['persistence_mode']);
            $table->dropColumn('persistence_mode');
        });
    }
};
