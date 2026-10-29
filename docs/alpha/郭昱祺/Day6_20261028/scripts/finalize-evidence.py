"""Record copied report provenance and hash today's actual browser captures."""
import hashlib
import json
from pathlib import Path
from PIL import Image

DAY = Path(__file__).resolve().parents[1]
REPO = DAY.parents[3]
BASELINE = 'a0118cbe7b093fc732efde0f0fd9cb85999319fb'
SOURCES = [
    ('docs/alpha/曾俊涛/Day5_20261027/01_最新主线独立复核_34d751c.md', '测试岗_最新主线独立复核_34d751c.md'),
    ('backend/evidence/daily/Day6_迁移隔离恢复与答辩交接.md','数据岗_Day6_迁移隔离恢复与答辩交接.md'),
    ('docs/alpha/关欣/Day5_安全复核表_20261027.md','关欣_Day5_安全复核表_20261027.md'),
]

def main():
    # Windows PowerShell 5.1 needs a BOM to read the Chinese launcher reliably.
    for script in [DAY/'演示包/启动演示.ps1', DAY/'scripts/render-native-ppt.ps1']:
        script.write_text(script.read_text(encoding='utf-8-sig'), encoding='utf-8-sig', newline='')
    provenance = []
    for original, copied in SOURCES:
        source = REPO / original
        copy = DAY / '引用证据' / copied
        assert source.read_bytes() == copy.read_bytes()
        provenance.append({'originalPath':original,'copy':copied,'repositoryBaseline':BASELINE,'sha256':hashlib.sha256(copy.read_bytes()).hexdigest(),'url':f'https://github.com/impureWine/404NOTFOUND/blob/{BASELINE}/{original}','warning':'Read relative links using original repository path; copy does not rebase report links.'})
    (DAY/'引用证据/来源.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2),encoding='utf-8')
    report = json.loads((DAY/'成品验证/演示包冒烟报告.json').read_text(encoding='utf-8'))
    assert report['status'] == 'passed'
    shots = []
    for row in report['screenshots']:
        file = DAY/'成品验证'/row['file']
        with Image.open(file) as image:
            size = list(image.size)
        shots.append({**row,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'size':size,'newCapture':True,'mode':'packaged static mock, no backend'})
    (DAY/'成品验证/本日截图哈希.json').write_text(json.dumps(shots,ensure_ascii=False,indent=2),encoding='utf-8')
    previous = json.loads((DAY/'素材来源与哈希.json').read_text(encoding='utf-8'))
    assert len(previous) == 30
    for row in previous:
        assert hashlib.sha256((DAY/row['file']).read_bytes()).hexdigest() == row['sha256']
    print(json.dumps({'status':'passed','copiedReports':len(provenance),'originalScreenshots':len(previous),'newScreenshots':len(shots)}))

if __name__ == '__main__':
    main()
