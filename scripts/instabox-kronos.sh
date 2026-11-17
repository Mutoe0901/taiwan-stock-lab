#!/usr/bin/env bash
# Optional isolated CPU environment. Does not download model weights or expose an API.
set -euo pipefail
base=${STOCKLAB_KRONOS_DIR:-/data/stocklab/kronos}
revision=67b630e67f6a18c9e9be918d9b4337c960db1e9a
python_bin=${STOCKLAB_PYTHON:-python3.12}
command -v "$python_bin" >/dev/null || { echo '需要 Python 3.12；避免使用預設 Python 3.13 安裝舊版依賴。' >&2; exit 1; }
mkdir -p "$base"
if [[ ! -d "$base/source/.git" ]]; then
  git clone https://github.com/shiyu-coder/Kronos.git "$base/source"
fi
[[ -z $(git -C "$base/source" status --porcelain) ]] || { echo 'Kronos 有未提交修改，停止安裝。' >&2; exit 1; }
git -C "$base/source" fetch origin "$revision"
git -C "$base/source" checkout --detach "$revision"
"$python_bin" -m venv "$base/venv"
"$base/venv/bin/python" -m pip install torch==2.15.0+cpu --index-url https://download.pytorch.org/whl/cpu
"$base/venv/bin/python" -m pip install -r "$base/source/requirements.txt"
(cd "$base/source" && "$base/venv/bin/python" -c 'from model import Kronos, KronosTokenizer, KronosPredictor; print("Kronos 匯入成功；尚未下載模型或驗證預測。")')
"$base/venv/bin/python" -m pip freeze > "$base/environment-lock.txt"
