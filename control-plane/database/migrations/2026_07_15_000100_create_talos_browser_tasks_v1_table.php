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
            $table->unique(['id', 'user_id'], 'talos_sessions_id_owner_browser_v1_unique');
        });
        Schema::table('talos_messages', function (Blueprint $table): void {
            $table->unique(['id', 'session_id'], 'talos_messages_id_session_browser_v1_unique');
        });
        Schema::table('talos_browser_sessions', function (Blueprint $table): void {
            $table->unique(
                ['id', 'user_id', 'talos_session_id'],
                'talos_browser_sessions_scope_v1_unique',
            );
        });

        Schema::create('talos_browser_tasks', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('schema_version', 64);
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('talos_session_id');
            $table->foreign(['talos_session_id', 'user_id'], 'talos_browser_tasks_session_owner_fk')
                ->references(['id', 'user_id'])->on('talos_sessions')->cascadeOnDelete();
            $table->string('origin_message_id');
            $table->foreign(['origin_message_id', 'talos_session_id'], 'talos_browser_tasks_message_session_fk')
                ->references(['id', 'session_id'])->on('talos_messages')->cascadeOnDelete();
            $table->string('browser_session_id')->nullable();
            $table->foreign('browser_session_id', 'talos_browser_tasks_browser_session_fk')
                ->references('id')->on('talos_browser_sessions')->nullOnDelete();
            $table->foreign(
                ['browser_session_id', 'user_id', 'talos_session_id'],
                'talos_browser_tasks_browser_scope_fk',
            )->references(['id', 'user_id', 'talos_session_id'])->on('talos_browser_sessions');
            $table->text('goal');
            $table->string('status', 32);
            $table->string('autonomy_profile', 32);
            $table->json('budget');
            $table->string('runtime_id', 256)->nullable();
            $table->string('active_tab_id', 256)->nullable();
            $table->unsignedBigInteger('state_version')->default(0);
            $table->timestamp('requested_at');
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('failed_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamp('reconciled_at')->nullable();
            $table->timestamps();

            $table->unique(['id', 'user_id', 'talos_session_id'], 'talos_browser_tasks_scope_unique');
            $table->index(['talos_session_id', 'user_id'], 'talos_browser_tasks_session_owner_idx');
            $table->index(['origin_message_id', 'talos_session_id'], 'talos_browser_tasks_message_session_idx');
            $table->index(
                ['browser_session_id', 'user_id', 'talos_session_id'],
                'talos_browser_tasks_browser_scope_idx',
            );
            $table->index(['user_id', 'status'], 'talos_browser_tasks_owner_status_idx');
            $table->index(['talos_session_id', 'requested_at'], 'talos_browser_tasks_session_requested_idx');
            $table->index('browser_session_id', 'talos_browser_tasks_browser_session_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_browser_tasks');
        Schema::table('talos_browser_sessions', function (Blueprint $table): void {
            $table->dropUnique('talos_browser_sessions_scope_v1_unique');
        });
        Schema::table('talos_messages', function (Blueprint $table): void {
            $table->dropUnique('talos_messages_id_session_browser_v1_unique');
        });
        Schema::table('talos_sessions', function (Blueprint $table): void {
            $table->dropUnique('talos_sessions_id_owner_browser_v1_unique');
        });
    }
};
