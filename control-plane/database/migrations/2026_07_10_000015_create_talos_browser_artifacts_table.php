<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_browser_artifacts', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('browser_session_id');
            $table->foreign('browser_session_id')->references('id')->on('talos_browser_sessions')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('type');
            $table->string('mime');
            $table->string('storage_disk');
            $table->string('storage_path');
            $table->string('sha256')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->index(['browser_session_id', 'created_at']);
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_browser_artifacts');
    }
};
