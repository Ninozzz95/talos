<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_context_sets', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('name');
            $table->string('status')->default('available');
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index('status');
            $table->index(['created_at', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_context_sets');
    }
};
