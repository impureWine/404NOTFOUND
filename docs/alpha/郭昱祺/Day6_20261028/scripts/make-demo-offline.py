"""Apply the existing local hero fallback to the demo build only; app sources stay unchanged."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / '演示包/site'
REMOTE = 'https://modao.cc/agent-py/media/generated_images/2026-10-14/18e087a80afa4d258a4c0fc7bf3b5e4d.jpg'
OLD = f'src:"{REMOTE}",alt:"安静的桌面与茶杯"'
NEW = 'src:"./assets/worry-pet.png",alt:"本地备用桌宠插图",className:"local-fallback"'
assert (SITE / 'assets/worry-pet.png').is_file()
changes = []
for path in (SITE / 'assets').glob('*.js'):
    content = path.read_text(encoding='utf-8')
    if OLD not in content:
        continue
    assert content.count(OLD) == 1
    before = hashlib.sha256(path.read_bytes()).hexdigest()
    path.write_text(content.replace(OLD, NEW), encoding='utf-8', newline='')
    changes.append({'file':path.relative_to(ROOT).as_posix(), 'beforeSha256':before, 'afterSha256':hashlib.sha256(path.read_bytes()).hexdigest()})
assert len(changes) == 1, 'Run once on a fresh Vite build.'
(ROOT / '离线素材修订.json').write_text(json.dumps({'scope':'demo build only', 'reason':'Remove automatic network dependency of HeroGuest decorative image.', 'sourceComponent':'prototype/src/components/SiteChrome.jsx#HeroGuest', 'replacement':'existing web-prototype/assets/worry-pet.png fallback', 'sourceFilesModified':False, 'changes':changes}, ensure_ascii=False, indent=2), encoding='utf-8')
print('Applied existing local hero fallback to one demo bundle; source unchanged.')
