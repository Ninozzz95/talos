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
            $table->json('effort_levels')->nullable()->after('capabilities');
            $table->boolean('supports_thinking')->default(false)->after('effort_levels');
            $table->boolean('show_in_composer')->default(true)->after('supports_thinking');
        });
    }

    public function down(): void
    {
        Schema::table('talos_model_profiles', function (Blueprint $table): void {
            $table->dropColumn(['effort_levels', 'supports_thinking', 'show_in_composer']);
        });
    }
};
