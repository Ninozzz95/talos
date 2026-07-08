<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_messages', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('session_id');
            $table->string('role');
            $table->text('content');
            $table->string('model_profile_id')->nullable();
            $table->string('run_id')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->foreign('session_id')
                ->references('id')
                ->on('talos_sessions')
                ->cascadeOnDelete();

            $table->index(['session_id', 'created_at']);
            $table->index('model_profile_id');
            $table->index('run_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_messages');
    }
};
