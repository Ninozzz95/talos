<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('talos_api_tokens', function (Blueprint $table): void {
            $table->string('role')->default('admin')->after('name');
        });
    }

    public function down(): void
    {
        Schema::table('talos_api_tokens', function (Blueprint $table): void {
            $table->dropColumn('role');
        });
    }
};
