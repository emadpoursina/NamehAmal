#!/bin/sh
set -eu

# Apply pending Prisma migrations before starting the app.
# DATABASE_URL defaults to file:/workspace/dev.db (see Dockerfile / compose).
echo "Applying database migrations..."
NODE_PATH=/opt/prisma-cli/node_modules \
  node /opt/prisma-cli/node_modules/prisma/build/index.js migrate deploy

exec "$@"
