#!/usr/bin/env sh
set -eu

cd /app/control-plane

if [ ! -f .env ]; then
    cp .env.example .env
fi

database_path="${DB_DATABASE:-/app/control-plane/storage/app/talos/database.sqlite}"
case "$database_path" in
    /*) ;;
    *) database_path="/app/control-plane/$database_path" ;;
esac

mkdir -p "$(dirname "$database_path")" storage/framework/cache storage/framework/sessions storage/framework/views storage/logs bootstrap/cache
touch "$database_path"
chown -R www-data:www-data "$(dirname "$database_path")" storage bootstrap/cache
chmod -R ug+rw "$(dirname "$database_path")" storage bootstrap/cache

if [ -z "${APP_KEY:-}" ] && ! grep -Eq '^APP_KEY=base64:.+' .env; then
    php artisan key:generate --force
fi

rm -f bootstrap/cache/packages.php bootstrap/cache/services.php
php artisan package:discover --ansi
php artisan migrate --force
php artisan config:clear

exec "$@"
