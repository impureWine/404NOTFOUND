"""Package original screenshots with provenance; never relabel old captures as new tests."""
import hashlib
import html
import json
import shutil
from pathlib import Path

DAY = Path(__file__).resolve().parents[1]
PREVIOUS = DAY.parent / 'Day5_20261027'

def main():
    shots = DAY / '演示包' / '备用截图'
    shots.mkdir(parents=True, exist_ok=True)
    chosen = []
    reports = [(PREVIOUS, '浏览器验证与截图清单.json', None),
               (PREVIOUS / 'regression-day4', '验证与截图清单.json', {
                   'SV-N_save_1440.png', 'SV-E_save_1440.png', 'SV-F_save_1440.png', 'SV-T_save_1440.png',
                   'HS-E_history_1440.png', 'HS-F_history_1440.png', 'RD-N_record-detail_1440.png',
                   'RD-F_record-detail_1440.png', 'RD-X_record-detail_1440.png'})]
    for origin, filename, names in reports:
        report = json.loads((origin / filename).read_text(encoding='utf-8-sig'))
        for item in report['screenshots']:
            name = Path(item['file']).name
            if names is not None and name not in names:
                continue
            source = origin / item['file']
            actual = hashlib.sha256(source.read_bytes()).hexdigest()
            if actual != item['sha256']:
                raise ValueError(f'Screenshot hash mismatch: {name}')
            shutil.copy2(source, shots / name)
            chosen.append({**item, 'file': f'演示包/备用截图/{name}',
                           'original_source': source.relative_to(DAY.parents[3]).as_posix(),
                           'original_report': (origin / filename).relative_to(DAY.parents[3]).as_posix(),
                           'original_captured_at': report['checkedAt'],
                           'copied_on': '2026-10-28', 'new_capture': False})
    assert len(chosen) == 30
    (DAY / '素材来源与哈希.json').write_text(json.dumps(chosen, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    cards = []
    for item in chosen:
        name = Path(item['file']).name
        caption = item.get('evidenceType') or item.get('url', '').split('?')[-1]
        cards.append(f'<figure><a href="备用截图/{html.escape(name)}"><img loading="lazy" src="备用截图/{html.escape(name)}" alt="{html.escape(caption)}"></a><figcaption>{html.escape(name)}<br>{html.escape(caption)}</figcaption></figure>')
    (DAY / '演示包' / '备用截图.html').write_text('''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UX 备用截图</title><style>body{max-width:1300px;margin:32px auto;padding:0 24px;font:18px/1.6 "Microsoft YaHei",sans-serif;color:#342b33;background:#fff}h1{color:#984762;font-size:32px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px}figure{margin:0;padding:16px;border:1px solid #e7dce1}img{width:100%;height:280px;object-fit:contain;object-position:top;background:#fafafa}figcaption{font-size:15px;overflow-wrap:anywhere}a{color:#984762}</style><h1>备用截图 · 点击打开原图</h1><p>30 张图来自 2026-10-27 的本地实际运行，2026-10-28 整理复用，未重绘界面内容。组件、固定示例与拦截认证反馈均不代表真实后端成功。文件来源、原始时间、视口及 SHA-256 见交付包“素材来源与哈希.json”。</p><div class="grid">''' + '\n'.join(cards) + '</div></html>', encoding='utf-8')
    lines = ['# 高清截图与素材索引', '', '30 张原图按原尺寸交付，来自 10 月 27 日实际本地运行；今天复用，不计作本日新测试。', '',
             '| 文件 | 状态／性质 |', '| --- | --- |']
    for item in chosen:
        lines.append(f"| [{Path(item['file']).name}]({item['file']}) | {item.get('evidenceType') or item.get('url', '').split('?')[-1]} |")
    lines += ['', '[离线备用图册](演示包/备用截图.html) · [来源、时间、视口与哈希](素材来源与哈希.json)', '']
    (DAY / '截图与素材索引.md').write_text('\n'.join(lines), encoding='utf-8')
    print(f'Prepared {len(chosen)} original screenshots with verified hashes and offline gallery.')

if __name__ == '__main__':
    main()
