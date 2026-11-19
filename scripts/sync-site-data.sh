#!/usr/bin/env bash
# 把私有数据仓库里的数据文件复制到 _data/，供本地预览使用。
# 数据文件不提交到这个公开仓库（见 .gitignore）。
#
# 用法：
#   scripts/sync-site-data.sh                 # 默认从 ../site-data 读取
#   SITE_DATA_DIR=/path/to/site-data scripts/sync-site-data.sh
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="${SITE_DATA_DIR:-../site-data}"
if [ -d "$SRC/.git" ]; then git -C "$SRC" pull --ff-only --quiet || true; fi
for f in trainings.yml; do
  if [ -f "$SRC/$f" ]; then cp "$SRC/$f" "_data/$f"; echo "synced $f"; else echo "missing $SRC/$f" >&2; fi
done
