<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('talos_workspace_settings', 'revision')) {
            Schema::table('talos_workspace_settings', function (Blueprint $table): void {
                $table->unsignedBigInteger('revision')->default(0)->after('preferences');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('talos_workspace_settings', 'revision')) {
            Schema::table('talos_workspace_settings', function (Blueprint $table): void {
                $table->dropColumn('revision');
            });
        }
    }
};
