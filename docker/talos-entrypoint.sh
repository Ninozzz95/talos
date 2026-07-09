#!/usr/bin/env sh
set -eu

cd /app/control-plane

if [ ! -f .env ]; then
    cp .env.example .env
fi

mkdir -p database storage/framework/cache storage/framework/sessions storage/framework/views storage/logs bootstrap/cache
touch database/database.sqlite

if ! grep -Eq '^APP_KEY=base64:.+' .env; then
    php artisan key:generate --force
fi

php artisan migrate --force
php artisan config:clear

exec "$@"

