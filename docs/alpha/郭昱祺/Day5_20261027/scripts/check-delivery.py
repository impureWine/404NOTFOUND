"""Check artifact links/counts and regenerate the PPT contact sheet and screenshot index."""
from pathlib import Path
import hashlib
import json
import re
import zipfile
from datetime import datetime, timezone
from urllib.parse import unquote
from PIL import Image, ImageDraw

BASE = Path(__file__).resolve().parent.parent
deck = BASE / 'UX_界面原型设计答辩_初稿_v0.1_20261027.pptx'
browser = json.loads((BASE / '浏览器验证与截图清单.json').read_text(encoding='utf-8-sig'))
regression = json.loads((BASE / 'regression-day4/验证与截图清单.json').read_text(encoding='utf-8-sig'))
assert browser['status'] == regression['status'] == 'passed'
assert len(browser['checks']) == 36 and len(regression['checks']) == 77
assert len(browser['screenshots']) == 21 and len(regression['screenshots']) == 29
assert not browser['errors'] and not regression['errors']
for report, folder in ((browser, BASE), (regression, BASE / 'regression-day4')):
    for shot in report['screenshots']:
        file = folder / shot['file']
        assert hashlib.sha256(file.read_bytes()).hexdigest() == shot['sha256'], file

lines = ['# Day 5 · 运行截图索引', '', '21 张本次交互截图＋29 张本日回归截图。所有记录均来自实际启动的本地页面；固定／内存数据与拦截响应仍属于演示或 UI 测试。', '',
         '## 本次交互与 PPT 证据', '', '| 截图 | 页面性质 | 视口 |', '| --- | --- | --- |']
for shot in browser['screenshots']:
    viewport = shot['viewport']
    lines.append(f"| [{Path(shot['file']).name}]({shot['file']}) | {shot['evidenceType']} | {viewport['width']}×{viewport['height']} |")
lines += ['', '## 本日保存／历史回归', '', '回归报告逐项保留场景 URL、视口、文件大小与 SHA-256；不覆盖昨日目录。', '', '| 截图 | 运行场景 |', '| --- | --- |']
for shot in regression['screenshots']:
    lines.append(f"| [{Path(shot['file']).name}](regression-day4/{shot['file']}) | `{shot['url'].split('?', 1)[-1]}` |")
(BASE / '截图索引.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')

preview = BASE / 'PPT预览'
slides = sorted([x for x in preview.iterdir() if re.fullmatch(r'幻灯片\d+\.PNG', x.name)], key=lambda x: int(re.search(r'\d+', x.stem).group()))
assert len(slides) == 12
sheet = Image.new('RGB', (1480, 1170), '#ECECEC')
draw = ImageDraw.Draw(sheet)
for i, file in enumerate(slides):
    slide = Image.open(file)
    assert slide.size == (1280, 720), (file, slide.size)
    sheet.paste(slide.convert('RGB').resize((480, 270)), (10 + (i % 3) * 490, 24 + (i // 3) * 290))
    draw.text((12 + (i % 3) * 490, 6 + (i // 3) * 290), f'{i+1:02}', fill='#333333')
sheet.save(preview / '12页总览.png')
delivery = json.loads((BASE / 'pptx-delivery.json').read_text(encoding='utf-8-sig'))
assert delivery['status'] == 'passed' and not delivery['errors'] and not delivery['advisories']
assert delivery['package']['parts']['slides'] == 12 and delivery['package']['parts']['notes'] == 12
assert delivery['package']['parts']['masters'] == 1 and delivery['package']['parts']['layouts'] == 5
with zipfile.ZipFile(deck) as package:
    assert package.testzip() is None
readback = (BASE / 'PPT回读核对.md').read_text(encoding='utf-8')
assert len(re.findall(r'^## Slide \d+', readback, re.M)) == 12
assert readback.count('### Speaker Notes') == 12
assert not re.search(r'Page Title|Content Area|Detail Area|Table Area|Subtitle|YYYY-MM-DD', readback)
links = []
for file in BASE.glob('*.md'):
    for match in re.finditer(r'\]\(([^)]+)\)', file.read_text(encoding='utf-8')):
        raw = match.group(1).strip('<>').split('#', 1)[0]
        if not raw or '://' in raw or raw.startswith(('mailto:', 'app:')): continue
        target = file.parent / unquote(raw)
        assert target.exists(), f'{file.name}: missing {raw}'
        links.append(raw)
report = {
    'checkedAt': datetime.now(timezone.utc).isoformat(), 'status': 'passed',
    'scope': '本地交付核对；不表示 GitHub 上传、非作者评审或真实服务验收',
    'browserCheckGroups': {'day5': 36, 'day4Regression': 77, 'total': 113},
    'screenshots': {'day5': 21, 'day4Regression': 29},
    'pptx': {'file': deck.name, 'bytes': deck.stat().st_size, 'sha256': hashlib.sha256(deck.read_bytes()).hexdigest(),
             'slides': 12, 'notes': 12, 'masters': 1, 'layouts': 5, 'renderedPages': 12, 'placeholders': 0},
    'localMarkdownLinksChecked': len(links), 'publishedToGitHub': False,
}
(BASE / '交付核对.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
