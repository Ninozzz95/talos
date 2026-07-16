<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_browser_session_leases', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('schema_version', 64);
            $table->string('task_id');
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('talos_session_id');
            $table->foreign('talos_session_id', 'talos_browser_leases_session_fk')
                ->references('id')->on('talos_sessions')->cascadeOnDelete();
            $table->foreign(['task_id', 'user_id', 'talos_session_id'], 'talos_browser_leases_task_scope_fk')
                ->references(['id', 'user_id', 'talos_session_id'])->on('talos_browser_tasks')->cascadeOnDelete();
            $table->string('owner_type', 32);
            $table->string('owner_id', 256);
            $table->string('fencing_token_hash', 71);
            $table->string('status', 32);
            $table->timestamp('acquired_at');
            $table->timestamp('expires_at');
            $table->timestamp('released_at')->nullable();
            $table->timestamps();

            $table->unique(['task_id', 'fencing_token_hash'], 'talos_browser_leases_task_token_unique');
            $table->index(
                ['task_id', 'user_id', 'talos_session_id'],
                'talos_browser_leases_task_scope_idx',
            );
            $table->index(['task_id', 'status', 'expires_at'], 'talos_browser_leases_task_status_expiry_idx');
            $table->index(['user_id', 'status'], 'talos_browser_leases_owner_status_idx');
            $table->index(['talos_session_id', 'created_at'], 'talos_browser_leases_session_created_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_browser_session_leases');
    }
};
