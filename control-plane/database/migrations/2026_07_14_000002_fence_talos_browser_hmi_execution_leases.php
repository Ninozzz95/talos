<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('talos_browser_hmi_approvals', function (Blueprint $table): void {
            $table->uuid('execution_lease_token')->nullable()->after('execution_payload');
        });
    }

    public function down(): void
    {
        Schema::table('talos_browser_hmi_approvals', function (Blueprint $table): void {
            $table->dropColumn('execution_lease_token');
        });
    }
};
