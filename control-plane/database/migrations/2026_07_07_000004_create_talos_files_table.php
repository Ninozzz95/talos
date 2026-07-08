<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_files', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('original_name');
            $table->string('mime_type')->nullable();
            $table->unsignedBigInteger('size_bytes');
            $table->string('checksum', 64);
            $table->string('status')->default('uploaded');
            $table->string('storage_disk')->default('local');
            $table->string('storage_path', 2048);
            $table->string('parser')->nullable();
            $table->text('failure_reason')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index('checksum');
            $table->index('status');
            $table->index(['created_at', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_files');
    }
};
