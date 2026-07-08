<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_file_chunks', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('file_id');
            $table->unsignedInteger('sequence');
            $table->longText('content');
            $table->string('content_hash', 64);
            $table->unsignedInteger('start_offset');
            $table->unsignedInteger('end_offset');
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->foreign('file_id')->references('id')->on('talos_files')->cascadeOnDelete();
            $table->unique(['file_id', 'sequence']);
            $table->index('content_hash');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_file_chunks');
    }
};
