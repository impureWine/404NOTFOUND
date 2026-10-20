from pathlib import Path
import json, re, hashlib, zipfile
from pypdf import PdfReader
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[1]
manifest=json.loads((ROOT/'sources/manifest.json').read_text(encoding='utf-8'))
catalog=json.loads((ROOT/'sources/api-catalog.json').read_text(encoding='utf-8'))
checks=[]
def check(name,result,detail):
    checks.append(dict(name=name,passed=bool(result),detail=detail))

documents=[ROOT/p for p in manifest['documents']]
check('six_documents',len(documents)==6 and all(p.exists() for p in documents),'五项设计正文及验收交接附件存在')
trace=(ROOT/'06_需求追踪与验收交接.md').read_text(encoding='utf-8')
reqs=set(re.findall(r'\| (REQ\d{2}) \|',trace))
check('seventeen_requirements',reqs==set(manifest['requirements']),sorted(reqs))
check('unique_http_endpoints',len(catalog)==32 and len({(a['method'],a['path']) for a in catalog})==32,'日历过滤复用列表端点，不重复计数')
links=[]
for p in [ROOT/'README.md',*documents]:
    for link in re.findall(r'!?\[[^\]]*\]\(([^)]+)\)',p.read_text(encoding='utf-8')):
        if not link.startswith(('https:','http:','#')):
            links.append((p.name,link,(p.parent/link).exists()))
check('local_links',all(x[2] for x in links),{'checked':len(links),'missing':[x for x in links if not x[2]]})
pngs=sorted((ROOT/'figures').glob('*.png'))
check('seven_diagrams',len(pngs)==7 and all(p.with_suffix('.svg').exists() and (p.with_suffix('.dot').exists() or p.with_suffix('.mmd').exists()) for p in pngs),'七图均有SVG PNG及DOT或Mermaid源')
check('runtime_status_honest',manifest['runtimeValidation']=='未执行' and trace.count('| 未执行 |')==12,'12条运行验收均未标通过')
check('author_not_impersonated',manifest['gitSubmission']=='未提交' and manifest['peerReview']=='待专业负责人复核','未伪造commit push或签认')
pdf=next((ROOT/'output').glob('*.pdf'))
reader=PdfReader(pdf)
page_text=[page.extract_text() or '' for page in reader.pages]
alltext='\n'.join(page_text)
check('pdf_text_and_chinese',len(page_text)>5 and all(k in alltext for k in ['前端设计','REHEARSAL_DRAFT','4000','FINISH_REHEARSAL','RETRIEVED']),'中文及关键契约可提取')
check('no_blank_pdf_pages',all(len(t)>80 for t in page_text),[len(t) for t in page_text])
check('pdf_source_match',all(a['path'] in alltext.replace('\n','') for a in catalog),'32条路径出现在PDF文本中')
report=dict(kind='设计交付静态自查',runtimeTests='未执行',peerReview='待专业负责人复核',passed=all(c['passed'] for c in checks),checks=checks,pdf={'pages':len(reader.pages),'bytes':pdf.stat().st_size,'sha256':hashlib.sha256(pdf.read_bytes()).hexdigest()},visualReview='由交付者另行检查渲染页')
(ROOT/'qa/design-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

def contact(paths,filename,cols=3,box=(500,690)):
    width,height=box
    canvas=Image.new('RGB',(width*cols,height*((len(paths)+cols-1)//cols)),'#dce2e8')
    draw=ImageDraw.Draw(canvas)
    for i,p in enumerate(paths):
        im=Image.open(p).convert('RGB');im.thumbnail((width-20,height-40))
        x=(i%cols)*width+(width-im.width)//2;y=(i//cols)*height+30
        canvas.paste(im,(x,y));draw.text(((i%cols)*width+10,(i//cols)*height+9),p.stem,fill='black')
    canvas.save(ROOT/'qa'/filename)

contact(pngs,'diagrams-contact.png',3,(600,660))
pages=sorted((ROOT/'qa').glob('page-*.png'))[:len(reader.pages)]
for i in range(0,len(pages),9): contact(pages[i:i+9],f'pages-contact-{i//9+1}.png',3,(450,650))
print(json.dumps(report,ensure_ascii=False,indent=2))
if not report['passed']: raise SystemExit(1)
