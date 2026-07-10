<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_browser_sessions', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('worker_session_id')->unique();
            $table->string('status');
            $table->string('mode');
            $table->text('current_url')->nullable();
            $table->text('current_title')->nullable();
            $table->unsignedInteger('viewport_width');
            $table->unsignedInteger('viewport_height');
            $table->json('capabilities');
            $table->json('policy')->nullable();
            $table->string('last_snapshot_artifact_id')->nullable();
            $table->string('last_screenshot_artifact_id')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_browser_sessions');
    }
};
