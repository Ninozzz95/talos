<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('talos_files', function (Blueprint $table): void {
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->index(['user_id', 'created_at']);
        });

        Schema::table('talos_context_sets', function (Blueprint $table): void {
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::table('talos_context_sets', function (Blueprint $table): void {
            $table->dropIndex(['user_id', 'created_at']);
            $table->dropConstrainedForeignId('user_id');
        });

        Schema::table('talos_files', function (Blueprint $table): void {
            $table->dropIndex(['user_id', 'created_at']);
            $table->dropConstrainedForeignId('user_id');
        });
    }
};
