#!/bin/sh
set -eu

target=${1:-/opt/merchportal/.env}
if [ -e "$target" ]; then
  echo "Existing environment file preserved: $target" >&2
  exit 1
fi

umask 077
postgres_password=$(openssl rand -hex 24)
jwt_secret=$(openssl rand -hex 32)
cookie_secret=$(openssl rand -hex 32)
typesense_key=$(openssl rand -hex 24)
storage_password=$(openssl rand -hex 24)
media_proxy_secret=$(openssl rand -hex 32)

{
  printf 'POSTGRES_DB=merchportal\nPOSTGRES_USER=merchportal\nPOSTGRES_PASSWORD=%s\n' "$postgres_password"
  printf 'JWT_SECRET=%s\nCOOKIE_SECRET=%s\n' "$jwt_secret" "$cookie_secret"
  printf 'TYPESENSE_API_KEY=%s\n' "$typesense_key"
  printf 'MINIO_ROOT_USER=merchportal\nMINIO_ROOT_PASSWORD=%s\nMINIO_BUCKET=merchportal\n' "$storage_password"
  printf 'MEDIA_PROXY_SECRET=%s\n' "$media_proxy_secret"
  printf 'STOREFRONT_URL=https://merchportal.customislandgifts.mt\n'
  printf 'BACKEND_URL=https://api.merchportal.customislandgifts.mt\n'
  printf 'ADMIN_URL=https://api.merchportal.customislandgifts.mt\n'
  printf 'STOREFRONT_PORT=8100\nBACKEND_PORT=9100\n'
  printf 'NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_setup_required\nNEXT_PUBLIC_DEFAULT_REGION=mt\n'
  printf 'STRICKER_ACCESS_KEY=\nMIDOCEAN_API_KEY=\n'
} > "$target"

echo "Created $target with permissions restricted to its owner. Secrets were not printed."
