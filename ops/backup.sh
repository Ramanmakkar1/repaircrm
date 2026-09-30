#!/bin/bash
set -euo pipefail
umask 077
folder=/var/backups/repairshelper
install -d -m 700 "$folder"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
sudo -u postgres pg_dump -Fc repairshelper > "$folder/$stamp.dump.tmp"
pg_restore --list "$folder/$stamp.dump.tmp" >/dev/null
mv "$folder/$stamp.dump.tmp" "$folder/$stamp.dump"
find "$folder" -name '*.dump' -mtime +14 -not -name 'initial-source-import.dump' -delete
