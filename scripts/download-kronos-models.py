"""Download only pinned data weights/config, never execute Hub remote code."""
import json
import sys
from pathlib import Path
from huggingface_hub import snapshot_download

root = Path(sys.argv[1] if len(sys.argv)>1 else '/data/stocklab/kronos/models')
pins = {'tokenizer':'0e0117387f39004a9016484a186a908917e22426',
        'model':'901c26c1332695a2a8f243eb2f37243a37bea320'}
repos = {'tokenizer':'NeoQuasar/Kronos-Tokenizer-base', 'model':'NeoQuasar/Kronos-small'}
root.mkdir(parents=True, exist_ok=True)
for name, repo in repos.items():
    snapshot_download(repo, revision=pins[name], local_dir=str(root/name),
                      allow_patterns=['config.json','model.safetensors','README.md','LICENSE*'])
(root/'revisions.json').write_text(json.dumps(pins))
print('Kronos pinned weights ready')
