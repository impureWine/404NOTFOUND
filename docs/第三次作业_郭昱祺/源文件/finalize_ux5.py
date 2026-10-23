from pathlib import Path
from xml.etree import ElementTree as ET
import csv,json,re,zipfile,shutil,sys,tempfile,hashlib,collections

ROOT=Path(r'D:\DSH\软工实践\工程\UX_五项设计交付_v1.2')
BUILD=Path(__file__).parent
SKILL=Path(r'C:\Users\G2395\.codex\skills\ppt-master\scripts')
sys.path[:0]=[str(BUILD/'python-deps'),str(SKILL)]
from svg_to_pptx.drawingml.theme_fonts import apply_master_text_style_spec,MasterTextStyleSpec
from template_preview_pptx import _verify_output

PPT=ROOT/'05_图示视觉规范/404NOTFOUND_图示PPT母版_定稿.pptx'
with tempfile.TemporaryDirectory(dir=BUILD,prefix='master-polish-') as tmp:
    tmp=Path(tmp)
    with zipfile.ZipFile(PPT) as z:z.extractall(tmp)
    apply_master_text_style_spec(tmp,MasterTextStyleSpec(title_hpt=3300,body_hpt=2400))
    candidate=BUILD/'pink-master-polished.pptx'
    with zipfile.ZipFile(candidate,'w',zipfile.ZIP_DEFLATED) as z:
        for p in tmp.rglob('*'):
            if p.is_file():z.write(p,p.relative_to(tmp).as_posix())
    shutil.copy2(candidate,PPT)

counts=_verify_output(PPT,require_full_placeholder_frames=True)
P='http://schemas.openxmlformats.org/presentationml/2006/main'
A='http://schemas.openxmlformats.org/drawingml/2006/main'
R='http://schemas.openxmlformats.org/package/2006/relationships'
with zipfile.ZipFile(PPT) as z:
    master_names=[n for n in z.namelist() if re.fullmatch(r'ppt/slideMasters/slideMaster\d+.xml',n)]
    layouts=[n for n in z.namelist() if re.fullmatch(r'ppt/slideLayouts/slideLayout\d+.xml',n)]
    mr=ET.fromstring(z.read(master_names[0]));ids=[e.get('id') for e in mr.findall(f'.//{{{P}}}sldLayoutId')]
    if len(ids)!=len(set(ids)) or len(ids)!=5:raise ValueError('Master/Layout registration mismatch')
    body=mr.find(f'{{{P}}}txStyles/{{{P}}}bodyStyle/{{{A}}}lvl1pPr/{{{A}}}defRPr')
    if body is None or body.get('sz')!='2400':raise ValueError('Master body typography mismatch')
    creation=[]
    for n in master_names+layouts:
        for el in ET.fromstring(z.read(n)).iter():
            if el.tag.endswith('}creationId') and 'id' in el.attrib:creation.append(el.get('id'))
    if len(creation)!=len(set(creation)):raise ValueError('Duplicate creationId')
    for n in layouts:
        relpath=n.replace('slideLayouts/','slideLayouts/_rels/')+'.rels'
        rels=ET.fromstring(z.read(relpath))
        if sum(el.get('Type','').endswith('/slideMaster') for el in rels)!=1:raise ValueError('Layout master reference mismatch')

manifest=json.loads((ROOT/'图表清单.json').read_text(encoding='utf-8'))
merged=ET.Element('mxfile',host='app.diagrams.net',version='24.7.17')
for it in manifest:
    f=ROOT/it['drawio'];root=ET.parse(f).getroot()
    merged.append(root.find('diagram'))
    for ext in ['svg','png','drawio','json']:
        p=(ROOT/it['svg']).with_suffix('.'+ext)
        if not p.is_file() or p.stat().st_size<50:raise ValueError('Missing diagram asset '+str(p))
ET.ElementTree(merged).write(ROOT/'全部设计图_可编辑.drawio',encoding='utf-8',xml_declaration=True)
with (ROOT/'04_交互状态表/页面交互状态表.csv').open(encoding='utf-8-sig') as f:state=list(csv.DictReader(f))
if len(state)!=57:raise ValueError('State row count mismatch')
HTMLFILES={p.name for p in (Path(r'D:\DSH\软工实践\工程\.codex-project-review\404NOTFOUND')/'web-prototype').glob('*.html')}
HTMLROWS={x['代码证据（仓库相对路径:行）'].split(':')[0].split('/')[-1] for x in state if x['入口']=='HTML'}
if HTMLFILES!=HTMLROWS:raise ValueError('HTML page inventory mismatch')

README='''# 404NOTFOUND · UX五项设计交付 v1.2

## 打开方式

解压后先打开 `交付索引.html`，可浏览图表、打开全文说明与可筛选状态表。图片可直接插入报告；图表修改优先用diagrams.net打开 `全部设计图_可编辑.drawio`，内含21个标签页；也可逐张打开drawio、SVG或JSON源文件。

## 仅交付截图中的五项

|任务|交付|
|---|---|
|功能模块层次图|7张：六模块17项总览＋6模块局部；需求映射|
|关键泳道图|8张：命名陪伴保存、物件房间、寄存、排练、注册登录、退出改密、文字销毁、查询；修改说明|
|数据流图|5张：上下文、一级总体、临时外发、主动保存寄存、独立销毁；字典与层级平衡|
|交互状态表|57行页面／视图；HTML、CSV、Markdown；32接口映射、通用状态、20项原型差异|
|图示视觉规范|配色、命名、图例、箭头、字号；视觉样张；1母版5版式可编辑PPTX及SVG模板源|

图表共21张（含视觉样张），每张提供PNG、SVG、drawio、JSON。PPTX包含5个版式样页与18个占位区，不是完整答辩PPT。完整状态表不塞入投影页面；答辩使用总览和局部版式。

## v1.2 简化母版

依据用户选择“减少粉色底框和装饰、增加留白”，去掉全部内容底框、通高侧条、页脚横线。白底配深粉标题和64px粉色短线；两栏仅用浅灰细线分区。左右边距96px，正文区域高度312px；页标题33磅、正文24磅沿用上一版。5种版式与18个可编辑占位区保留，状态表建议每页约3条。用户已于2026-10-22选择方案1确认此版母版定稿，旧版另外保留。本轮修订日期：2026-10-22。

## 依据与状态

- 仓库： https://github.com/impureWine/404NOTFOUND
- 快照：fe60c90c1ed3c392bd0946f794c96ea53cc29711；2026-10-21，`docs: refresh Li Quanyi third assignment`。
- 需求依据：`docs/需求范围_v0.3.md`与`docs/当前任务分工.md`（T02）。本次采用六模块、17项，不沿用工作区旧18项稿。
- HTTP方法、路径、字段与错误唯一依据：`docs/第三次作业_张王昊/09_全功能接口与限制规范.md`；结合李泉毅04号接口目录、程杰前端章节和数据库设计核对。
- 状态表现状取自`web-prototype/`、`prototype/src/`和桌宠组件；对应行号为上述快照下源码位置。
- 粉色经用户选择；图示与母版为课程设计稿。原型为演示，不宣称已接真实后端、检索、数据库、Electron或微信。
- 母版样张已由用户确认定稿（2026-10-22）；全部设计材料待团队非作者复核，不冒充验收通过。图示设计不代表代码已修复。

## 编辑与复用

1. drawio中的文字、节点与连线可分别编辑；SVG可在矢量编辑器修改，PNG仅供预览。
2. PowerPoint使用“视图→幻灯片母版”可见唯一简洁粉色母版和5个版式；用“新建幻灯片→版式”复用。页面内容区为可编辑占位符；插入PNG后图片本身不能编辑文字。
3. 若需在PPT逐字修改图，先编辑drawio，导出SVG插入后用PowerPoint支持的“转换为形状”；不要把整张PNG称为可编辑原图。
4. `源文件/`保留生成脚本和构建说明。普通查看与修改drawio、SVG、CSV、PPTX无需运行脚本或安装Python。

## 本次检查的范围

已进行图表浏览器渲染与版面查看、需求与页面清单对照、PPTX结构读回及交付文件完整性检查。未执行产品测试，未在PowerPoint GUI中打开；不能据包结构检查宣称所有办公软件打开均无提示。
'''
(ROOT/'README.md').write_text(README,encoding='utf-8')
report=f'''# 交付构建记录

- 图表：21张，各有PNG／SVG／drawio／JSON；另有合并21页drawio。
- HTML状态表覆盖24个现有HTML文件；React覆盖22个PAGES页面、1个pet容器路由及10个桌宠视图，共57行。
- 需求：六模块、17项；HTTP方法／路径：32个；原型差异：20项。
- PPT模板SVG：5页通过ppt-master template-mode canonical-authoring检查，0警告、0错误。
- PPTX包读回：{counts[0]}张样页、{counts[1]}个Master、{counts[2]}个Layout、{counts[3]}个完整占位框；Slide与Layout占位类型、索引和边界一致。
- Master/Layout注册和creationId去重已核对；字号锚点为标题44px＝33磅／正文32px＝24磅（页码16px＝12磅，封面标题52px＝39磅）。正文默认值由技能原生txStyles函数显式设为24磅，避免小页码参与自动字号推断。
- v1.2反馈修订（2026-10-22）：移除全部粉色底框、通高侧条和页脚横线；仅保留64px粉色短线。左右边距80→96px，正文高度352→312px；两栏使用1px浅灰分隔线，所有5张母版SVG已重新渲染并查看。
- PNG使用本地Edge无头渲染；没有下载外部图片或字体。版式样张对应SVG源，PPTX没有经过PowerPoint GUI打开。
- 设计稿待团队复核；PPT母版样张已由用户选择方案1确认定稿（2026-10-22），Prototype review: user-reviewed。不记录虚构测试通过、老师反馈或验收结论。
'''
(ROOT/'交付构建记录.md').write_text(report,encoding='utf-8')

def inline(s):
    s=html_escape(s)
    s=re.sub(r'`([^`]+)`',r'<code>\1</code>',s)
    s=re.sub(r'\*\*([^*]+)\*\*',r'<strong>\1</strong>',s)
    return s
def html_escape(s):
    import html
    return html.escape(str(s),quote=True)
CSS='''body{margin:0;background:#FDF5F8;color:#342B33;font:15px/1.8 "Microsoft YaHei",sans-serif}main{max-width:1300px;margin:40px auto;background:white;padding:40px 48px;border:1px solid #EBCBD8;border-radius:18px}h1,h2,h3{color:#984762}h1{font-size:30px}h2{font-size:22px;margin-top:36px}a{color:#984762}code{background:#F9EAF0;padding:2px 5px;border-radius:4px;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;font-size:14px;line-height:1.6}th,td{border:1px solid #EBCBD8;padding:12px;text-align:left;vertical-align:top}th{background:#F9EAF0}tr:nth-child(even){background:#FDF5F8}.table{overflow:auto}li{margin:8px 0}p{margin:14px 0}header{background:#F9EAF0;padding:12px 48px;border-bottom:1px solid #EBCBD8}'''
def md_to_html(p):
    # Local reading companion; Markdown stays the editable authority.
    lines=p.read_text(encoding='utf-8').splitlines();out=[];i=0;inul=False
    while i<len(lines):
        s=lines[i]
        if s.startswith('|'):
            if inul:out.append('</ul>');inul=False
            table=[]
            while i<len(lines) and lines[i].startswith('|'):
                line=lines[i];i+=1
                if re.match(r'^\|[\s:|\-]+\|?$',line):continue
                table.append([c.strip() for c in line.strip('|').split('|')])
            out.append('<div class="table"><table>')
            for n,row in enumerate(table):tag='th' if n==0 else 'td';out.append('<tr>'+''.join(f'<{tag}>'+inline(c)+f'</{tag}>' for c in row)+'</tr>')
            out.append('</table></div>');continue
        m=re.match(r'^(#{1,6}) (.*)',s)
        if m:
            if inul:out.append('</ul>');inul=False
            n=len(m[1]);out.append(f'<h{n}>'+inline(m[2])+f'</h{n}>')
        elif re.match(r'^[-\d]+[.)]? ',s):
            if not inul:out.append('<ul>');inul=True
            out.append('<li>'+inline(re.sub(r'^[-\d]+[.)]? ','',s))+'</li>')
        elif s.strip():
            if inul:out.append('</ul>');inul=False
            out.append('<p>'+inline(s)+'</p>')
        else:
            if inul:out.append('</ul>');inul=False
        i+=1
    if inul:out.append('</ul>')
    backlink='../交付索引.html' if p.parent!=ROOT else '交付索引.html'
    p.with_suffix('.html').write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>'+html_escape(p.stem)+'</title><style>'+CSS+'</style><header><a href="'+backlink+'">← 交付索引</a></header><main>'+''.join(out)+'</main></html>',encoding='utf-8')

for rel in ['README.md','交付构建记录.md','01_功能模块层次图/需求映射.md','02_关键泳道图/修改说明.md','03_数据流图/数据字典与层级平衡.md','04_交互状态表/接口映射与通用状态.md','04_交互状态表/原型差异清单.md','05_图示视觉规范/图示视觉规范.md','05_图示视觉规范/母版调整说明_v1.2.md']:md_to_html(ROOT/rel)
docs={
'01_功能模块层次图':[('需求映射','需求映射.html')],
'02_关键泳道图':[('修改说明','修改说明.html')],
'03_数据流图':[('数据字典与层级平衡','数据字典与层级平衡.html')],
'04_交互状态表':[('打开57行交互状态表','页面交互状态表.html'),('Excel可读CSV','页面交互状态表.csv'),('接口映射与通用状态','接口映射与通用状态.html'),('20项原型差异','原型差异清单.html')],
'05_图示视觉规范':[('图示视觉规范','图示视觉规范.html'),('本轮简化版式调整','母版调整说明_v1.2.html'),('可编辑PPT母版（用户已确认定稿）','404NOTFOUND_图示PPT母版_定稿.pptx')]}
sections=[]
for i,(section,links) in enumerate(docs.items(),1):
    cards=[]
    for it in manifest:
        if it['section']!=section:continue
        base=Path(it['svg']).with_suffix('').as_posix()
        cards.append(f'<article><a href="{it["png"]}" target="_blank"><img src="{it["png"]}" loading="lazy" alt="{html_escape(it["title"])}"></a><h3>{it["code"]} {html_escape(it["title"])}</h3><p>'+ ' · '.join(f'<a href="{base}.{ext}" target="_blank">{label}</a>' for ext,label in [('png','PNG'),('svg','SVG'),('drawio','drawio源'),('json','JSON源')])+'</p></article>')
    sections.append(f'<section id="s{i}"><h2>{section.replace("_"," · ")}</h2><div class="links">'+''.join(f'<a href="{section}/{f}">{label} ↗</a>' for label,f in links)+'</div><div class="cards">'+''.join(cards)+'</div></section>')
nav=''.join(f'<a href="#s{i}">{i:02d} {s.split("_",1)[1]}</a>' for i,s in enumerate(docs,1))
master='05_图示视觉规范/pink-diagram-master_ppt169_20261021/templates/'
mastercards=''.join(f'<article><a href="{master}{p.stem}.png" target="_blank"><img src="{master}{p.stem}.png" alt="{p.stem}"></a><h3>{label}</h3><p><a href="{master}{p.name}">SVG模板源</a></p></article>' for p,label in zip(sorted((ROOT/master).glob('*.svg')),['01 封面','02 总览','03 局部放大','04 双图对照','05 状态与规范']))
indexcss=CSS+'''main{background:transparent;border:none;padding:0 40px;max-width:1440px}nav{display:flex;gap:10px;flex-wrap:wrap;margin:24px 0}nav a,.links a,.button{background:white;border:1px solid #EBCBD8;border-radius:9px;padding:9px 14px;text-decoration:none;display:inline-block}.hero{background:#F9EAF0;padding:35px 40px;border-radius:20px;border:1px solid #EBCBD8}.hero h1{margin-top:0}.hero small{color:#71616B}.badge{display:inline-block;padding:4px 12px;background:#FFF2D8;border-radius:12px;color:#8A5A18}section{margin:45px 0 60px;scroll-margin:30px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:20px;margin-top:22px}article{background:white;border:1px solid #EBCBD8;border-radius:14px;padding:16px}article img{width:100%;height:240px;object-fit:contain;background:white}article h3{font-size:16px;margin:12px 0}article p{font-size:14px}.links{display:flex;gap:12px;flex-wrap:wrap}.note{padding:16px 22px;background:#FFF2D8;border-radius:12px}.stat{display:flex;gap:35px;flex-wrap:wrap;margin:20px 0}.stat strong{font-size:26px;color:#984762}footer{color:#71616B;margin:30px 0}@media(max-width:700px){main{padding:0 14px}.hero{padding:24px}.cards{grid-template-columns:1fr}}'''
(ROOT/'交付索引.html').write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>404NOTFOUND UX五项设计交付</title><style>'+indexcss+'</style><main><div class="hero"><small>404NOTFOUND / UX DESIGN / V1.2</small><h1>图表、交互状态与视觉规范</h1><p>依据仓库当前六模块、17项需求制作。<span class="badge">设计稿 · 待团队复核</span></p><div class="stat"><span><strong>7</strong> 功能层次图</span><span><strong>8</strong> 关键泳道图</span><span><strong>5</strong> 数据流图</span><span><strong>57</strong> 页面／视图状态</span><span><strong>5</strong> PPT版式</span></div><div class="links"><a href="全部设计图_可编辑.drawio">全部设计图 · drawio可编辑源</a><a href="README.html">交付说明</a><a href="交付构建记录.html">构建记录</a></div></div><nav>'+nav+'</nav><p class="note">点击图可打开原尺寸PNG；每图另附SVG、drawio与JSON源。状态表明确区分原型现状与目标接口。PPT母版样张已由用户确认定稿；图表不是后端已经实现的证据。</p>'+''.join(sections)+'<section><h2>PPT母版 · 5种版式样张</h2><p>1套原生Slide Master / 5个Layout / 18个可编辑占位区；按用户选择简化：白底无底框，页标题33磅、正文24磅，左右边距96px；两栏仅用浅灰细线分区。字体和分隔线可在幻灯片母版中调整。</p><div class="cards">'+mastercards+'</div></section><footer>仓库 fe60c90c1ed3 · 源码快照2026-10-21 · 母版修订2026-10-22 · 离线本地交付，无远程资源依赖</footer></main></html>',encoding='utf-8')

sources=ROOT/'源文件';sources.mkdir(exist_ok=True)
for f in ['build_ux5.py','build_ux5_master.py','render_ux5.cjs','contact_ux5.py','finalize_ux5.py']:shutil.copy2(BUILD/f,sources/f)
(sources/'构建说明.md').write_text('''# 源文件说明

- 首选用drawio或矢量编辑器编辑，普通浏览无需运行脚本。
- JSON记录每图节点、连线与路由；全部设计图_可编辑.drawio含21个分页。
- Python脚本记录本轮生成逻辑；默认ROOT和REPO为本次工作区绝对路径。迁移机器后需修改ROOT／REPO，或按各图JSON重新生成。
- 主图构建只用Python标准库；联系图需Pillow；PNG渲染脚本需Playwright及Edge，路径在脚本顶部。
- 母版通过ppt-master技能的template-mode检查和template_preview_pptx导出；本轮补充PyYAML安装在构建目录，不打包第三方库。finalize脚本将Master标题／正文锚点明确为44px／32px（33磅／24磅），并读回Master/Layout与18个占位框。
- 原型代码没有被修改。本包不含产品、用户账号或真实业务数据；表格内容来自公开仓库静态源码。
''',encoding='utf-8')

# Keep only the five deliverables and supporting source/readme files in the archive.
archive=ROOT.parent/'404NOTFOUND_UX五项设计交付_柔和粉_简洁版_v1.2_定稿.zip'
files=[]
for p in ROOT.rglob('*'):
    if not p.is_file():continue
    rel=p.relative_to(ROOT)
    if rel.name in {'404NOTFOUND_图示PPT母版_待审阅.pptx','母版调整说明_v1.1.md','母版调整说明_v1.1.html'}:continue
    if 'pink-diagram-master_ppt169_20261021' in rel.parts and 'templates' not in rel.parts:continue
    files.append(p)
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for p in files:z.write(p,ROOT.name+'/'+p.relative_to(ROOT).as_posix())
with zipfile.ZipFile(archive) as z:
    for info in z.infolist():
        if info.file_size==0:raise ValueError('Empty deliverable '+info.filename)
print(json.dumps({'archive':str(archive),'MB':round(archive.stat().st_size/1024**2,2),'files':len(files),'PPT':counts,'state_rows':len(state),'diagrams':len(manifest)},ensure_ascii=False))
