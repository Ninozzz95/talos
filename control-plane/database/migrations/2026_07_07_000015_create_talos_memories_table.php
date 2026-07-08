<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_memories', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('scope_type')->default('global');
            $table->string('scope_id')->nullable();
            $table->string('kind')->default('project_fact');
            $table->string('status')->default('active');
            $table->string('title');
            $table->text('content');
            $table->string('source')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();

            $table->index(['scope_type', 'scope_id', 'status']);
            $table->index(['kind', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_memories');
    }
};
