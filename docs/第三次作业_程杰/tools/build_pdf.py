from pathlib import Path
import os, re, html, json
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak, KeepTogether, CondPageBreak
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image as PILImage

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output'/'404烦恼未找到_前端设计交付包_v1.0.pdf'
pdfmetrics.registerFont(TTFont('CJK','C:/Windows/Fonts/msyh.ttc'))
pdfmetrics.registerFont(TTFont('CJKBold','C:/Windows/Fonts/msyhbd.ttc'))
pdfmetrics.registerFontFamily('CJK',normal='CJK',bold='CJKBold',italic='CJK',boldItalic='CJKBold')
styles={
'title':ParagraphStyle('Title',fontName='CJKBold',fontSize=23,leading=33,textColor=colors.black,spaceAfter=15),
'subtitle':ParagraphStyle('Subtitle',fontName='CJK',fontSize=11,leading=18,spaceAfter=14),
'h1':ParagraphStyle('Heading1',fontName='CJKBold',fontSize=17,leading=25,textColor=colors.black,spaceBefore=8,spaceAfter=10),
'h2':ParagraphStyle('Heading2',fontName='CJKBold',fontSize=13,leading=20,textColor=colors.black,spaceBefore=12,spaceAfter=7),
'h3':ParagraphStyle('Heading3',fontName='CJKBold',fontSize=11,leading=17,textColor=colors.black,spaceBefore=9,spaceAfter=5),
'h4':ParagraphStyle('Heading4',fontName='CJKBold',fontSize=10.5,leading=16,textColor=colors.black,spaceBefore=9,spaceAfter=4,keepWithNext=True),
'body':ParagraphStyle('Body',fontName='CJK',fontSize=10.5,leading=18,spaceAfter=8,wordWrap='CJK',splitLongWords=True,allowWidows=0,allowOrphans=0),
'cell':ParagraphStyle('Cell',fontName='CJK',fontSize=8.7,leading=14,spaceAfter=0,wordWrap='CJK',splitLongWords=True),
'headcell':ParagraphStyle('Headcell',fontName='CJKBold',fontSize=8.8,leading=14,textColor=colors.black,wordWrap='CJK'),
'code':ParagraphStyle('Code',fontName='CJK',fontSize=9,leading=15,spaceAfter=4,wordWrap='CJK'),
'caption':ParagraphStyle('Caption',fontName='CJK',fontSize=9,leading=15,alignment=TA_CENTER,spaceAfter=10),
}
WIDTH=A4[0]-108
def inline(s):
    s=html.escape(s)
    s=re.sub(r'\[([^\]]+)\]\(([^)]+)\)',lambda m:m.group(1),s)
    s=re.sub(r'\*\*(.+?)\*\*',r'<b>\1</b>',s)
    s=re.sub(r'`([^`]+)`',r'\1',s)
    return s
def para(text, style='body'):
    return Paragraph(inline(text),styles[style])
def table(rows):
    cols=len(rows[0])
    first=rows[0]
    if cols==4: ratios=[0.15,0.22,0.32,0.31]
    elif cols==3: ratios=[0.20,0.38,0.42]
    elif cols==2: ratios=[0.30,0.70]
    else: ratios=[1/cols]*cols
    if first[0] in ['编号','需求'] and cols==4: ratios=[0.12,0.30,0.25,0.33]
    if first[0]=='页面组': ratios=[0.19,0.22,0.59]
    if first[0]=='接口': ratios=[0.19,0.31,0.50]
    if first[0]=='字段': ratios=[0.20,0.43,0.37]
    if first[0]=='kind': ratios=[0.22,0.35,0.43]
    if first[0]=='编号' and cols==4 and first[-1]=='执行状态': ratios=[0.10,0.34,0.42,0.14]
    data=[[para(cell,'headcell' if r==0 else 'cell') for cell in row] for r,row in enumerate(rows)]
    t=Table(data,colWidths=[WIDTH*r for r in ratios],repeatRows=1,hAlign='LEFT')
    settings=[('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e6edf4')),('GRID',(0,0),(-1,-1),0.45,colors.HexColor('#D9D9D9')),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]
    for r in range(2,len(rows),2): settings.append(('BACKGROUND',(0,r),(-1,r),colors.HexColor('#f8fafc')))
    t.setStyle(TableStyle(settings))
    return [t,Spacer(1,10)]
def markdown_blocks(text):
    lines=text.splitlines(); result=[]; i=0; code=False
    while i<len(lines):
        line=lines[i].strip()
        if not line: i+=1; continue
        if line.startswith('```'):
            code=not code;i+=1;continue
        if code:
            result.append(para(line,'code'));i+=1;continue
        match=re.match(r'!\[([^\]]*)\]\(([^)]+)\)',line)
        if match:
            p=ROOT/match.group(2)
            w,h=PILImage.open(p).size
            maxheight=340 if p.stem in ['F05_destroy','F07_electron'] else 360 if p.stem=='F04_rehearsal' else 410
            scale=min(WIDTH/w,maxheight/h)
            result.append(KeepTogether([Image(str(p),width=w*scale,height=h*scale),para(match.group(1),'caption')]))
            i+=1;continue
        if line.startswith('|') and i+1<len(lines) and re.match(r'^\|[- :|]+\|$',lines[i+1].strip()):
            rows=[[cell.strip() for cell in line.strip('|').split('|')]];i+=2
            while i<len(lines) and lines[i].strip().startswith('|'):
                rows.append([cell.strip() for cell in lines[i].strip().strip('|').split('|')]);i+=1
            if any(len(row)!=len(rows[0]) for row in rows): raise ValueError('Malformed table: '+str(rows))
            result.extend(table(rows));continue
        heading=re.match(r'^(#{1,4})\s+(.+)$',line)
        if heading:
            level=len(heading.group(1))
            if level==4:
                endpoint_items=[para(heading.group(2),'h4')];i+=1
                while i<len(lines) and not lines[i].strip().startswith('#'):
                    if lines[i].strip(): endpoint_items.append(para(lines[i].strip()))
                    i+=1
                result.append(KeepTogether(endpoint_items));continue
            result.extend([CondPageBreak(75),para(heading.group(2),'h'+str(level))]);i+=1;continue
        if line.startswith('- '):
            result.append(para('• '+line[2:]));i+=1;continue
        result.append(para(line));i+=1
    return result

story=[]
story.append(para('404烦恼未找到','title'))
story.append(para('前端设计交付包','title'))
story.append(para('T03 前端工程师　版本 v1.0　2026年10月20日','subtitle'))
story.append(para('本包用于系统设计说明书整合、前后端契约复核及后续编码交接，完成前端设计章节、组件关系、关键状态与时序、多入口能力矩阵、接口使用清单五项设计交付。'))
story.append(para('业务范围覆盖六模块和REQ01至REQ17。Web采用JavaScript、React与Vite，Electron提前验证原生窗口能力，微信按实际接入状态展示。文字销毁保持独立端侧流程。'))
story.append(para('设计来源固定到仓库提交8308f0735ae7c33a2055b486f10a620ec3560d31。业务范围按需求v0.3，技术按03号，接口细节按09号；本包包含设计方案与待执行验收，不将原型写成真实生产系统。'))
story.append(Spacer(1,16))
story.append(para('内容导航','h2'))
nav=[['章节','内容'],['01','前端设计章节与页面状态边界'],['02','组件关系与Electron进程依赖'],['03','关键状态与任务 保存 清除时序'],['04','多入口矩阵与原生能力验证方案'],['05','32个唯一HTTP端点与端侧契约'],['06','17项追踪 验收设计与交接说明']]
story.extend(table(nav))
story.append(para('合并说明书时以可编辑Markdown和原始图源为准；本文档可直接用于评审。复核和实际提交证据在发生后据实登记，不以本包生成代替本人提交。'))
manifest=json.loads((ROOT/'sources/manifest.json').read_text(encoding='utf-8'))
for name in manifest['documents']:
    story.append(PageBreak());story.extend(markdown_blocks((ROOT/name).read_text(encoding='utf-8')))
story.append(PageBreak())
story.append(para('设计依据与版本','h1'))
refs=(ROOT/'sources/依据与版本.md').read_text(encoding='utf-8')
story.append(para('仓库 impureWine/404NOTFOUND，核对提交8308f0735ae7c33a2055b486f10a620ec3560d31。远程main核对结果与本次阅读快照一致。'))
for line in refs.splitlines():
    if line.startswith('- '):
        m=re.search(r'\[([^\]]+)\]\(([^)]+)\)',line)
        if m:
            story.append(para(m.group(1),'h3'))
            url=m.group(2)
            url=url.replace('/8308f0735ae7c33a2055b486f10a620ec3560d31/','/main/')
            story.append(Paragraph(f'<link href="{html.escape(m.group(2))}" color="#284d72">{html.escape(url)}</link>',styles['code']))

def footer(canvas,doc):
    canvas.saveState();canvas.setFont('CJK',8);canvas.setFillColor(colors.HexColor('#526173'))
    canvas.drawString(54,29,'404烦恼未找到  前端设计  v1.0')
    canvas.drawRightString(A4[0]-54,29,str(doc.page))
    canvas.restoreState()

doc=SimpleDocTemplate(str(OUT),pagesize=A4,rightMargin=54,leftMargin=54,topMargin=46,bottomMargin=49,title='404烦恼未找到前端设计交付包',author='T03 前端设计',pageCompression=1)
doc.build(story,onFirstPage=footer,onLaterPages=footer)
print(str(OUT))
