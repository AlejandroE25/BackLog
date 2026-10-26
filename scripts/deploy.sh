#!/usr/bin/env bash
# Create (idempotent) and deploy Backlog to Azure App Service. Needs `az login` first.
# Secrets come from .env (BACKLOG_PASSCODE, COOKIE_SECRET); see README.
set -euo pipefail
cd "$(dirname "$0")/.."

APP=${APP:-backlog-ae42}
RG=${RG:-backlog-rg}
LOC=${LOC:-eastus}
SKU=${SKU:-F1}

set -a; . ./.env; set +a
: "${BACKLOG_PASSCODE:?missing in .env}" "${COOKIE_SECRET:?missing in .env}" "${OMDB_API_KEY:?missing in .env}"

# Create only what is missing. Never re-run `plan create`/`webapp update` on existing resources:
# that would reset the plan SKU and fight custom domains/certs added in the portal.
if ! az webapp show -g "$RG" -n "$APP" -o none 2>/dev/null; then
  az group create -n "$RG" -l "$LOC" -o none
  az appservice plan show -g "$RG" -n "$APP-plan" -o none 2>/dev/null ||
    az appservice plan create -g "$RG" -n "$APP-plan" --is-linux --sku "$SKU" -l "$LOC" -o none
  az webapp create -g "$RG" -p "$APP-plan" -n "$APP" --runtime "NODE:22-lts" -o none
  az webapp update -g "$RG" -n "$APP" --https-only true -o none
  az webapp config set -g "$RG" -n "$APP" --startup-file "npm start" --generic-configurations '{"healthCheckPath":"/healthz"}' -o none
fi
az webapp config appsettings set -g "$RG" -n "$APP" -o none --settings \
  BACKLOG_PASSCODE="$BACKLOG_PASSCODE" COOKIE_SECRET="$COOKIE_SECRET" OMDB_API_KEY="$OMDB_API_KEY" \
  DB_PATH=/home/data/backlog.db SCM_DO_BUILD_DURING_DEPLOYMENT=true

ZIP=$(mktemp -d)/backlog.zip
zip -qr "$ZIP" . -x 'node_modules/*' 'data/*' '.git/*' '.env' 'tasks/*'
az webapp deploy -g "$RG" -n "$APP" --src-path "$ZIP" --type zip -o none
echo "https://$APP.azurewebsites.net"
