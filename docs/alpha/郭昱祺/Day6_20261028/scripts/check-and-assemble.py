"""Read-only OOXML checks, notes extraction and preview contact sheet. No PPTX rewrite."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import zipfile
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DECK = ROOT / 'UX_界面原型设计答辩_可编辑稿_v0.2_20261028.pptx'
SOURCE = ROOT.parent / 'Day5_20261027/UX_界面原型设计答辩_初稿_v0.1_20261027.pptx'
NS = {'a':'http://schemas.openxmlformats.org/drawingml/2006/main', 'p':'http://schemas.openxmlformats.org/presentationml/2006/main'}

def main():
    if len(sys.argv) > 1:
        skill = Path(sys.argv[1])
        result = subprocess.run([sys.executable, str(skill / 'scripts/pptx_delivery_check.py'), str(DECK)], capture_output=True, text=True, encoding='utf-8', check=True)
        delivery = json.loads(result.stdout)
        assert delivery['status'] == 'passed'
        (ROOT / 'PPT交付结构检查.json').write_text(json.dumps(delivery, ensure_ascii=False, indent=2), encoding='utf-8')
    rows = []
    speech = ['# 12 页答辩讲稿', '', '约 8 分钟为排练预算，尚未实际计时。第 3～10 页沿用 10 月 27 日成果与原备注，其中“今天”指昨日修订；现场可表述为“上一轮”。第 1、2、11、12 页为本日更新。具体点击步骤见《演示操作脚本》。', '']
    with zipfile.ZipFile(DECK) as final, zipfile.ZipFile(SOURCE) as source:
        assert final.testzip() is None
        for i in range(1, 13):
            part = f'ppt/slides/slide{i}.xml'
            note = f'ppt/notesSlides/notesSlide{i}.xml'
            tree = ET.fromstring(final.read(part))
            notes = ET.fromstring(final.read(note))
            text = [node.text or '' for node in tree.findall('.//a:t', NS)]
            note_text = []
            for shape in notes.findall('.//p:sp', NS):
                placeholder = shape.find('.//p:ph', NS)
                if placeholder is not None and placeholder.get('type') == 'body':
                    note_text += [n.text or '' for n in shape.findall('.//a:t', NS)]
            assert note_text, f'Missing notes {i}'
            same = final.read(part) == source.read(part)
            notes_same = final.read(note) == source.read(note)
            assert same == (3 <= i <= 10), f'Unexpected slide edit {i}'
            assert notes_same == (3 <= i <= 10), f'Unexpected notes edit {i}'
            rows.append({'page':i, 'title':text[0], 'nativeTextRuns':len(text), 'pictures':len(tree.findall('.//p:pic', NS)), 'slideXmlUnchanged':same, 'notesXmlUnchanged':notes_same, 'sha256':hashlib.sha256(final.read(part)).hexdigest()})
            speech.extend([f'## 第 {i} 页 · {text[0]}', '', '\n\n'.join(note_text), ''])
    (ROOT / 'PPT讲稿.md').write_text('\n'.join(speech), encoding='utf-8')
    (ROOT / 'PPT可编辑性与保留校验.json').write_text(json.dumps({'status':'passed', 'slides':12, 'notes':12, 'unchangedSlides':list(range(3,11)), 'editedSlides':[1,2,11,12], 'pages':rows, 'boundary':'Headings, labels, native geometry and notes editable; embedded UI screenshots are images.'}, ensure_ascii=False, indent=2), encoding='utf-8')
    preview = ROOT / 'PPT预览'
    pictures = sorted([p for p in preview.glob('*.PNG') if re.search(r'\d+', p.stem)], key=lambda p:int(re.search(r'\d+', p.stem).group()))
    assert len(pictures) == 12
    font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 22)
    canvas = Image.new('RGB', (1620, 4*340+20), '#eceaeb')
    draw = ImageDraw.Draw(canvas)
    for index, file in enumerate(pictures):
        image = Image.open(file).convert('RGB')
        assert image.size == (1280,720)
        image.thumbnail((510,287))
        x, y = 20+(index%3)*535, 15+(index//3)*340
        canvas.paste(image, (x,y))
        draw.text((x,y+292), f'{index+1:02d}', fill='#45313a', font=font)
    canvas.save(preview / '12页总览.png')
    print(json.dumps({'status':'passed','slides':12,'notes':12,'unchangedSlideAndNoteXml':8,'previewPng':12,'nativeTextRuns':sum(r['nativeTextRuns'] for r in rows)}))

if __name__ == '__main__':
    main()
