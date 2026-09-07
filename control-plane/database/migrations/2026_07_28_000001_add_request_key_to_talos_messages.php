<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('talos_messages', function (Blueprint $table): void {
            $table->string('request_key', 512)->nullable()->after('run_id');
            $table->unique('request_key', 'talos_messages_request_key_unique');
        });
    }

    public function down(): void
    {
        Schema::table('talos_messages', function (Blueprint $table): void {
            $table->dropUnique('talos_messages_request_key_unique');
            $table->dropColumn('request_key');
        });
    }
};
