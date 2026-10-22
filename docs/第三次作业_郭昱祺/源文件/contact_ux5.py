from PIL import Image,ImageOps,ImageDraw,ImageFont
from pathlib import Path
import json
root=Path(r'D:\DSH\软工实践\工程\UX_五项设计交付_v1.2')
manifest=json.loads((root/'图表清单.json').read_text(encoding='utf-8'))
font=ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc',22)
labels=['01 封面','02 总览','03 局部放大','04 双图对照','05 状态与规范']
items=[{'png':str(p.relative_to(root)),'code':label,'title':''} for p,label in zip(sorted((root/'05_图示视觉规范/pink-diagram-master_ppt169_20261021/templates').glob('*.png')),labels)]
for group,items in [('PPT版式预览',items)]:
    n=len(items);tw,th=720,470;cols=2;sheet=Image.new('RGB',(tw*cols,th*((n+cols-1)//cols)), '#FDF5F8');draw=ImageDraw.Draw(sheet)
    for i,it in enumerate(items):
        x=i%cols*tw;y=i//cols*th
        im=Image.open(root/it['png']).convert('RGB');im.thumbnail((tw-24,th-65));sheet.paste(im,(x+(tw-im.width)//2,y+50))
        draw.text((x+14,y+10),it['code']+' '+it['title'],font=font,fill='#984762')
    sheet.save(root/(group+'.jpg'),quality=88)
print('Contact sheets saved')
