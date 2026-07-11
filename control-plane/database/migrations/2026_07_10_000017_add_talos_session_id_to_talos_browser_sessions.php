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
            $table->string('talos_session_id')->nullable()->after('user_id');
            $table->foreign('talos_session_id')
                ->references('id')
                ->on('talos_sessions')
                ->cascadeOnDelete();
            $table->index(['user_id', 'talos_session_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::table('talos_browser_sessions', function (Blueprint $table): void {
            $table->dropForeign(['talos_session_id']);
            $table->dropIndex(['user_id', 'talos_session_id', 'created_at']);
            $table->dropColumn('talos_session_id');
        });
    }
};
