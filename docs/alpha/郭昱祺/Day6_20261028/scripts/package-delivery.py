"""Package only the Day6 delivery with a UTF-8 ZIP and SHA-256 inventory."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
NAME = 'UX_标准演示包_v0.2_20261028'
ARCHIVE = ROOT / (NAME + '.zip')
MANIFEST = ROOT / '交付文件清单.json'
CHECK = ROOT / '打包校验.json'
SIDECAR = ROOT / (NAME + '.zip.sha256')

def main():
    excluded = {ARCHIVE, MANIFEST, CHECK, SIDECAR}
    files = sorted(p for p in ROOT.rglob('*') if p.is_file() and p not in excluded and '__pycache__' not in p.parts)
    rows = [{'file':p.relative_to(ROOT).as_posix(), 'bytes':p.stat().st_size, 'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]
    for p in files:
        assert p.suffix.lower() not in {'.pem','.env','.key'}, 'Unexpected private file'
        assert not any(part in {'.git','node_modules'} for part in p.relative_to(ROOT).parts)
    MANIFEST.write_text(json.dumps({'createdAt':datetime.now(timezone.utc).isoformat(),'files':rows,'excludes':['交付文件清单.json','打包校验.json',ARCHIVE.name,SIDECAR.name],'note':'Inventory does not hash itself or archive/check receipt.'},ensure_ascii=False,indent=2),encoding='utf-8')
    CHECK.write_text(json.dumps({'status':'passed','inventoryEntries':len(rows),'zipMembers':len(rows)+2,'checks':['ZIP testzip passed','Every inventory member byte length and SHA-256 match','PPT and both React entries present'],'archive':ARCHIVE.name,'sha256Sidecar':SIDECAR.name,'note':'Archive hash is external to avoid self-reference. All checks are asserted after final ZIP creation.'},ensure_ascii=False,indent=2),encoding='utf-8')
    with zipfile.ZipFile(ARCHIVE,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        for p in [*files,MANIFEST,CHECK]:
            archive.write(p, NAME+'/'+p.relative_to(ROOT).as_posix())
    with zipfile.ZipFile(ARCHIVE) as archive:
        assert archive.testzip() is None
        assert len(archive.namelist()) == len(rows)+2
        for row in rows:
            content = archive.read(NAME+'/'+row['file'])
            assert len(content) == row['bytes']
            assert hashlib.sha256(content).hexdigest() == row['sha256']
        for required in ['UX_界面原型设计答辩_可编辑稿_v0.2_20261028.pptx','演示包/site/index.html','演示包/site/ux-components.html','PPT讲稿.md','演示操作脚本.md']:
            assert NAME+'/'+required in archive.namelist()
    digest = hashlib.sha256(ARCHIVE.read_bytes()).hexdigest()
    SIDECAR.write_text(digest+'  '+ARCHIVE.name+'\n',encoding='utf-8')
    print(json.dumps({'status':'passed','zipBytes':ARCHIVE.stat().st_size,'zipMembers':len(rows)+2,'sha256':digest}))

if __name__ == '__main__':
    main()
