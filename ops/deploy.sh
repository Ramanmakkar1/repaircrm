#!/bin/bash
# Run as root with an extracted source release. Existing sites are untouched.
set -euo pipefail
source_dir=$(realpath "$1")
case "$source_dir" in /srv/repairshelper/releases/*) ;; *) echo 'Invalid release path'; exit 1;; esac
exec 9>/var/lock/repairshelper-deploy.lock
flock -n 9 || { echo 'Another deployment is running'; exit 1; }
chown -R repairshelper:repairshelper "$source_dir"
# Node reads dotenv correctly, including quoted passwords. Never source secrets.
cp /etc/repairshelper/app.env "$source_dir/.env.production"
chown repairshelper:repairshelper "$source_dir/.env.production"
chmod 600 "$source_dir/.env.production"
cd "$source_dir"
sudo -u repairshelper env PATH=/opt/node-v22.23.3-linux-x64/bin:/usr/local/bin:/usr/bin:/bin npm ci --no-audit --no-fund
sudo -u repairshelper env PATH=/opt/node-v22.23.3-linux-x64/bin:/usr/local/bin:/usr/bin:/bin NODE_OPTIONS=--max-old-space-size=2560 npm run build
/usr/local/sbin/repairshelper-backup
sudo -u repairshelper /usr/local/bin/node --env-file=.env.production node_modules/prisma/build/index.js migrate deploy
runtime="$source_dir/.next/standalone"
cp -a public "$runtime/"
mkdir -p "$runtime/.next"
cp -a .next/static "$runtime/.next/"
# Never package build-time environment into the runtime; systemd supplies it.
rm -f "$runtime/.env" "$runtime/.env.local" "$runtime/.env.production"
chown -R repairshelper:repairshelper "$runtime"
previous=$(readlink -f /srv/repairshelper/current || true)
ln -sfn "$runtime" /srv/repairshelper/current.next
mv -Tf /srv/repairshelper/current.next /srv/repairshelper/current
systemctl restart repairshelper
healthy=false
for attempt in $(seq 1 20); do
 if curl --fail -sS --max-time 5 http://127.0.0.1:3020/api/health >/dev/null; then healthy=true; break; fi
 sleep 2
done
if [ "$healthy" != true ]; then
 if [ -n "$previous" ] && [ -d "$previous" ]; then
  ln -sfn "$previous" /srv/repairshelper/current.next
  mv -Tf /srv/repairshelper/current.next /srv/repairshelper/current
  systemctl restart repairshelper
 fi
 echo 'Health check failed; previous code restored. Database migrations retained.'
 exit 1
fi
echo 'Repairs helper release is healthy.'
