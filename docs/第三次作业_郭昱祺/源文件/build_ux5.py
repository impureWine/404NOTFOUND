from pathlib import Path
import csv, json, math, re, html, shutil, textwrap, zipfile
from xml.etree import ElementTree as ET

ROOT=Path(r'D:\DSH\软工实践\工程\UX_五项设计交付_v1.2')
REPO=Path(r'D:\DSH\软工实践\工程\.codex-project-review\404NOTFOUND')
BUILD=Path(__file__).parent
C={'primary':'#C86B8C','dark':'#984762','pale':'#F9EAF0','border':'#EBCBD8','bg':'#FDF5F8','text':'#342B33','muted':'#71616B','blue':'#EAF0F7','blueink':'#426384','green':'#E8F3EC','greenink':'#35654D','amber':'#FFF2D8','amberink':'#8A5A18','red':'#FAE8E8','redink':'#A33C47','line':'#8B6C7A'}
FONT='Microsoft YaHei, Noto Sans SC, sans-serif'
MANIFEST=[]
def esc(s): return html.escape(str(s),quote=True)
def mdfile(path,s):
    p=ROOT/path; p.parent.mkdir(parents=True,exist_ok=True);p.write_text(s.strip()+'\n',encoding='utf-8')
def width(s): return sum(1 if ord(c)>255 else .56 for c in s)
def wrap(s,cap):
    out=[]
    for para in str(s).split('\n'):
        line='';w=0
        tokens=re.findall(r'[A-Za-z0-9_]+|.',para)
        expanded=[]
        for token in tokens:
            expanded.extend(list(token) if width(token)>cap else [token])
        for c in expanded:
            cw=width(c)
            if w+cw>cap and line:out.append(line);line='';w=0
            line+=c;w+=cw
        out.append(line)
    return out

class Diagram:
    def __init__(self,folder,code,title,subtitle,w=1280,h=900):
        self.folder=folder;self.code=code;self.title=title;self.subtitle=subtitle;self.w=w;self.h=h;self.nodes=[];self.edges=[];self.bg=[]
    def node(self,id,x,y,w,h,label,kind='action',color='pale',fs=18):
        self.nodes.append(dict(id=id,x=x,y=y,w=w,h=h,label=label,kind=kind,color=color,fs=fs));return id
    def edge(self,a,b,label='',points=None,style='flow',side=None,labelpos=None):
        self.edges.append(dict(a=a,b=b,label=label,points=points,style=style,side=side,labelpos=labelpos))
    def note(self,x,y,w,h,label,color='bg',fs=16):return self.node('note'+str(len(self.nodes)),x,y,w,h,label,'note',color,fs)
    def endpoints(self,e):
        a=next(n for n in self.nodes if n['id']==e['a']);b=next(n for n in self.nodes if n['id']==e['b'])
        ax,ay=a['x']+a['w']/2,a['y']+a['h']/2;bx,by=b['x']+b['w']/2,b['y']+b['h']/2
        if e['points']:
            pts=e['points'];u=pts[0];v=pts[-1]
        else:u=(bx,by);v=(ax,ay);pts=[]
        def hit(n,c,t):
            dx=t[0]-c[0];dy=t[1]-c[1]
            if abs(dx)+abs(dy)<.01:return c
            k=min(n['w']/2/max(abs(dx),.001),n['h']/2/max(abs(dy),.001))
            if n['kind']=='decision':k=1/(abs(dx)/(n['w']/2)+abs(dy)/(n['h']/2))
            return (c[0]+dx*k,c[1]+dy*k)
        return [hit(a,(ax,ay),u)]+pts+[hit(b,(bx,by),v)]
    def save(self):
        folder=ROOT/self.folder;folder.mkdir(parents=True,exist_ok=True)
        p=folder/(self.code+'_'+self.title)
        svg=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" height="{self.h}" viewBox="0 0 {self.w} {self.h}" font-family="{FONT}">',f'<rect width="{self.w}" height="{self.h}" fill="white"/>',f'<rect width="12" height="{self.h}" fill="{C["primary"]}"/>','<defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0 0L8 4.5L0 9" fill="none" stroke="#8B6C7A" stroke-width="1.4"/></marker></defs>',f'<text x="42" y="48" font-size="29" font-weight="700" fill="{C["dark"]}">{esc(self.code+"  "+self.title)}</text>',f'<text x="42" y="80" font-size="15" fill="{C["muted"]}">{esc(self.subtitle)}</text>']
        svg+=self.bg
        mx=ET.Element('mxfile',host='app.diagrams.net',version='24.7.17'); dg=ET.SubElement(mx,'diagram',name=self.code,id=self.code);model=ET.SubElement(dg,'mxGraphModel',dx=str(self.w),dy=str(self.h),grid='1',gridSize='10',page='1',pageScale='1',pageWidth=str(self.w),pageHeight=str(self.h)); rt=ET.SubElement(model,'root');ET.SubElement(rt,'mxCell',id='0');ET.SubElement(rt,'mxCell',id='1',parent='0')
        def cell(id,x,y,w,h,label,style):
            ce=ET.SubElement(rt,'mxCell',id=id,value=label,style=style,vertex='1',parent='1');ET.SubElement(ce,'mxGeometry',x=str(x),y=str(y),width=str(w),height=str(h),attrib={'as':'geometry'})
        cell('title',30,15,self.w-60,55,self.code+' '+self.title,'text;html=0;fontSize=28;fontColor='+C['dark']+';fontFamily=Microsoft YaHei;align=left;')
        cell('subtitle',30,66,self.w-60,30,self.subtitle,'text;html=0;fontSize=15;fontColor='+C['muted']+';align=left;')
        for n in getattr(self,'backcells',[]):cell(**n)
        for e in self.edges:
            pts=self.endpoints(e);d='M'+' L'.join(f'{x:.1f} {y:.1f}' for x,y in pts);dash=' stroke-dasharray="7 5"' if e['style']=='dashed' else ''
            end='' if e['style']=='tree' else ' marker-end="url(#arrow)"'
            svg.append(f'<path d="{d}" stroke="{C["line"]}" stroke-width="1.7" fill="none"{dash}{end}/>')
            if e['label']:
                # Label on longest segment, offset from the stroke.
                a,b=max(zip(pts,pts[1:]),key=lambda ab:math.dist(*ab)); x=(a[0]+b[0])/2; y=(a[1]+b[1])/2
                if abs(a[0]-b[0])<8:x+=9;anchor='start'
                else:y-=10;anchor='middle'
                if e.get('labelpos'):x,y,anchor=e['labelpos']
                cap=24
                if abs(a[1]-b[1])<25 and not e.get('labelpos'):cap=max(8,min(24,abs(a[0]-b[0])/14))
                lines=wrap(e['label'],cap)
                for j,s in enumerate(lines):svg.append(f'<text x="{x}" y="{y+(j-(len(lines)-1)/2)*18}" text-anchor="{anchor}" font-size="14" fill="{C["muted"]}" stroke="white" stroke-width="5" paint-order="stroke">{esc(s)}</text>')
            ce=ET.SubElement(rt,'mxCell',id='edge'+str(len(rt)),value=e['label'],edge='1',parent='1',source=e['a'],target=e['b'],style='html=0;rounded=0;endArrow='+('none' if e['style']=='tree' else 'open')+';strokeColor='+C['line']+';fontFamily=Microsoft YaHei;fontSize=14;labelBackgroundColor=#FFFFFF;'+('dashed=1;' if e['style']=='dashed' else ''))
            geom=ET.SubElement(ce,'mxGeometry',relative='1',attrib={'as':'geometry'})
            if e['points']:
                arr=ET.SubElement(geom,'Array',attrib={'as':'points'})
                for x,y in e['points']: ET.SubElement(arr,'mxPoint',x=str(x),y=str(y))
        for n in self.nodes:
            x,y,w,h=n['x'],n['y'],n['w'],n['h'];kind=n['kind'];fill=C.get(n['color'],n['color']);stroke=C['border']; fs=n['fs']
            style=f'html=0;whiteSpace=wrap;fontFamily=Microsoft YaHei;fontSize={fs};fontColor={C["text"]};fillColor={fill};strokeColor={stroke};spacing=10;'
            if kind=='decision':
                svg.append(f'<polygon points="{x+w/2},{y} {x+w},{y+h/2} {x+w/2},{y+h} {x},{y+h/2}" fill="{fill}" stroke="{C["amberink"]}"/>');style+='rhombus;'
            elif kind in ['start','end']:
                r=min(w,h)/2;svg.append(f'<circle cx="{x+w/2}" cy="{y+h/2}" r="{r}" fill="'+('white' if kind=='end' else C['dark'])+f'" stroke="{C["dark"]}" stroke-width="2"/>')
                if kind=='end':svg.append(f'<circle cx="{x+w/2}" cy="{y+h/2}" r="{r*.64}" fill="{C["dark"]}"/>')
                style+='ellipse;'+('doubleEllipse;' if kind=='end' else 'fillColor='+C['dark']+';')
            elif kind=='store':
                svg.append(f'<path d="M{x+w} {y}H{x}V{y+h}H{x+w} M{x+28} {y}V{y+h}" fill="{fill}" stroke="{C["greenink"]}" stroke-width="1.7"/>');style+='shape=datastore;'
            elif kind=='note':
                svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="5" fill="{fill}" stroke="{stroke}" stroke-dasharray="5 4"/>');style+='shape=note;'
            else:
                rx=0 if kind=='entity' else 12;svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="1.5"/>');style+=('rounded=0;' if kind=='entity' else 'rounded=1;arcSize=12;')
            if kind not in ['start','end']:
                ls=wrap(n['label'],max(5,(w-24)/fs));lineh=fs*1.4
                if len(ls)*lineh>h-10:print('OVERFLOW',self.code,n['id'],len(ls),h)
                y0=y+h/2-(len(ls)-1)*lineh/2+fs*.35
                for i,s in enumerate(ls):svg.append(f'<text x="{x+w/2}" y="{y0+i*lineh}" text-anchor="middle" font-size="{fs}" fill="{C["text"]}">{esc(s)}</text>')
            cell(n['id'],x,y,w,h,n['label'],style)
        svg.append(f'<text x="42" y="{self.h-19}" font-size="13" fill="{C["muted"]}">404NOTFOUND · UX设计稿 · 仓库 fe60c90 · 2026-10-21 · 待团队复核</text></svg>')
        p.with_suffix('.svg').write_text('\n'.join(svg),encoding='utf-8');ET.ElementTree(mx).write(p.with_suffix('.drawio'),encoding='utf-8',xml_declaration=True)
        p.with_suffix('.json').write_text(json.dumps({'title':self.title,'subtitle':self.subtitle,'width':self.w,'height':self.h,'nodes':self.nodes,'edges':self.edges},ensure_ascii=False,indent=2),encoding='utf-8')
        MANIFEST.append({'section':self.folder,'code':self.code,'title':self.title,'svg':p.with_suffix('.svg').relative_to(ROOT).as_posix(),'png':p.with_suffix('.png').relative_to(ROOT).as_posix(),'drawio':p.with_suffix('.drawio').relative_to(ROOT).as_posix()})

MODULES=[
 ('账号与个人中心',[
 ('REQ16','注册与登录',['注册成功后去登录','登录／已登录改密','退出并撤销旧会话']),('REQ17','个人主页',['私密资料与偏好','主动保存内容入口','本人／本入口权限'])]),
 ('陪伴与沟通',[
 ('REQ01','陪伴交流',['倾听／澄清／梳理','限定正文并授权AI','临时回复／结束']),('REQ09','情绪命名卡',['词语／强度可跳过','选择后续任务','不自动保存或分析']),('REQ11','平行宇宙排练室',['场景／角色／目标','暂停／换说法／重来','认可表达→预览→保存'])]),
 ('记录与整理',[
 ('REQ08','情绪与事件日历',['自愿记录日期与事件','按日回看／编辑','主动保存／确认清除']),('REQ10','烦恼物件化',['线团／石头／便利贴','放旁边／找小步骤','外观与正文分别处理']),('REQ12','烦恼寄存所',['选择未来再打开时间','到期后本人取出','选择延期／确认清除'])]),
 ('压力缓解',[
 ('REQ02','压力缓解小训练',['呼吸／五感／暂停整理','任务拆分／步骤调整','开始／暂停／继续／退出']),('REQ13','屏幕无损发泄（敲击回弹）',['网页画布内敲击','减弱动效／主动音效','停止与释放资源']),('REQ14','文字焚化与重力黑洞',['独立私有正文缓冲','选择销毁／跳过动画','退出清空／不外发']),('REQ15','禅意编曲弹珠机',['轨道／构件／材质','限定音阶／碰撞反馈','暂停／停止／音频释放'])]),
 ('信息支持',[
 ('REQ03','信息查询',['限定问题并授权检索','逐条主张关联来源','时效／冲突／空结果说明'])]),
 ('基础与多端',[
 ('REQ04','模式切换',['显示当前任务','选择携带内容并确认','旧任务失效／切换回执']),('REQ05','会话控制',['临时会话／主动保存','本人记录／版本核实','结束／确认清除']),('REQ06','多入口及隔离',['Web／桌宠／微信能力','可信入口与身份隔离','跳转不自动携带正文']),('REQ07','安全与隐私',['最小数据／归属检查','AI／检索／保存分别授权','敏感场景边界与脱敏'])])]

def hierarchy():
    d=Diagram('01_功能模块层次图','H00','六模块与17项需求总览','连线表示功能包含关系；非页面导航、技术架构或执行顺序。',1600,1120)
    d.node('root',550,125,500,72,'404NOTFOUND\n用户自主选择的情绪支持工具',fs=22)
    for i,(name,reqs) in enumerate(MODULES):
        x=40+i*260;y=310
        d.node('m'+str(i),x,y,240,60,name,fs=21)
        d.edge('root','m'+str(i),points=[(800,255),(x+120,255)],style='tree')
        label='\n\n'.join(f'{id}\n{title}\n'+('／'.join(sub[:2])) for id,title,sub in reqs)
        d.node('r'+str(i),x,y+88,240,630,label,'action','bg',17);d.edge('m'+str(i),'r'+str(i),style='tree')
    d.save()
    for i,(name,reqs) in enumerate(MODULES):
        h=max(650,210+len(reqs)*185);d=Diagram('01_功能模块层次图',f'H{i+1:02d}',name+'功能展开','模块 → 需求 → 关键子功能；需求编号沿用仓库当前REQ01—REQ17。',1360,h)
        d.node('m',40,160,230,h-245,name,fs=24)
        for j,(id,title,subs) in enumerate(reqs):
            y=140+j*185;d.node(id,340,y,360,130,id+'\n'+title,fs=20);d.edge('m',id,points=[(300,160+(h-245)/2),(300,y+65)],style='tree')
            for k,s in enumerate(subs):
                d.node(id+str(k),790,y+k*45,520,37,s,'action','bg',17);d.edge(id,id+str(k),points=[(745,y+65),(745,y+k*45+18.5)],style='tree')
        d.save()
    rows=['| 模块 | 需求 | 功能 | 关键子功能 |','|---|---|---|---|']
    for m,rs in MODULES:
        for rid,t,sub in rs:rows.append(f'|{m}|{rid}|{t}|'+ '；'.join(sub)+'|')
    mdfile(Path('01_功能模块层次图/需求映射.md'),'# 功能模块与需求映射\n\n'+ '\n'.join(rows)+'\n\n范围：六模块、17项需求各出现一次。漂流瓶、公开主页、找回密码、注销和自动跨入口同步不在当前范围。\n\n说明：文字销毁REQ14在本次仓库范围内；不能套用旧工作区删去该功能的18项稿件。')

def lane(code,title,h,desc):
    d=Diagram('02_关键泳道图',code,title,desc,1400,h)
    d.backcells=[]
    for i,n in enumerate(['用户','界面','应用服务','数据存储','外部模型／检索']):
        x=40+i*264
        d.bg.append(f'<rect x="{x}" y="110" width="264" height="{h-155}" fill="{C["bg"] if i%2==0 else "#FFFFFF"}" stroke="{C["border"]}"/>')
        d.bg.append(f'<rect x="{x}" y="110" width="264" height="46" fill="{C["pale"]}"/><text x="{x+132}" y="140" text-anchor="middle" font-size="20" fill="{C["dark"]}">{n}</text>')
        d.backcells.append(dict(id='lane-bg'+str(i),x=x,y=110,w=264,h=h-155,label='',style='rounded=0;fillColor='+ (C['bg'] if i%2==0 else '#FFFFFF')+';strokeColor='+C['border']+';'))
        d.node('lane'+str(i),x,110,264,46,n,'entity','pale',20)
    return d
def act(d,id,l,y,label,kind='action',color='pale',h=88):
    w=214 if kind!='decision' else 180;x=40+l*264+(264-w)/2
    if kind in ['start','end']:w=h=22;x=40+l*264+121
    return d.node(id,x,y,w,h,label,kind,color,17)
def chain(d,*ids):
    for a,b in zip(ids,ids[1:]):d.edge(a,b)
def guard(d,a,b,label):
    for e in d.edges:
        if e['a']==a and e['b']==b:e['label']=label;return
def endings(d,y,normal='完成；返回或继续',cancel='取消；不新增处理',fail='失败；保留可重试范围'):
    for id,l,label,color in [('ok',1,normal,'green'),('cancel',0,cancel,'amber'),('fail',2,fail,'red')]:
        act(d,id,l,y,label,color=color,h=88);act(d,id+'End',l,y+115,'','end');d.edge(id,id+'End')

def swims():
    d=lane('A01','命名卡→陪伴→主动保存',1480,'REQ09／01／05／07；命名与AI处理不自动转为日历或持久记录。')
    act(d,'start',0,178,'','start');act(d,'input',0,225,'选择情绪词／强度\n选择倾听或梳理');act(d,'scope',1,340,'展示所选正文与用途\n申请AI_PROCESS许可');act(d,'agree',0,445,'同意外发？','decision','amber',105)
    act(d,'check',2,575,'验证身份／可信入口\n用途、版本和代次');act(d,'model',4,575,'仅处理已选定正文\n生成限定任务回应','action','blue');act(d,'reply',1,705,'展示临时回应\n可停止、重试或结束');act(d,'pick',0,810,'选择要保存的快照\n未登录先登录并重确认');act(d,'save',1,925,'预览范围并确认SAVE\n取消则无持久写');act(d,'write',3,1035,'事务写记录与授权\n幂等回执／对象版本','action','green');act(d,'result',2,1140,'写入结果明确？','decision','amber',98)
    chain(d,'start','input','scope','agree');d.edge('agree','check','[同意]');d.edge('agree','cancel','[取消]',[(172,497),(172,1280)]);d.edge('check','model','[校验通过]');d.edge('model','reply','[有效且代次匹配]');chain(d,'reply','pick','save','write','result');d.edge('result','ok','[确认成功]');d.edge('result','fail','[明确失败]');d.edge('check','fail','[拒绝／任务失败]',[(788,613),(788,1305)])
    endings(d,1280,'确认成功才显示已保存\nEND只清临时会话','取消许可／保存\n不外发或不写入','写入超时：待核实\n同requestId同载荷重放')
    guard(d,'save','write','[确认SAVE]');d.edge('save','cancel','[取消保存]',[(285,969),(285,1240),(172,1240)])
    d.note(1100,820,212,260,'约束\n撤销许可／取消任务会使旧响应失效。\n临时正文默认内存。\n主动保存内容不会被END连带删除。',fs=16);d.save()

    d=lane('A02','烦恼物件化与房间引用',1200,'REQ10／04／05；物件外观与正文分开，放旁边不调用AI。')
    act(d,'start',0,178,'','start');act(d,'input',0,220,'输入烦恼并选择\n线团／石头／便利贴');act(d,'preview',1,325,'端侧生成外观预览\n放旁边不自动保存');act(d,'choice',0,430,'选择下一步','decision','amber',110);act(d,'ai',2,565,'如选择AI梳理：\n限定正文＋新AI许可');act(d,'ext',4,565,'仅处理本次选定正文','action','blue');act(d,'save',1,700,'主动保存物件\n登录＋SAVE范围预览');act(d,'db',3,815,'保存物件后允许\n房间引用该记录ID','action','green')
    endings(d,1000,'显示已保存／放置结果\n移出房间不清正文','放旁边／取消确认\n不保存、不外发','失败保留本次预览\n409读取权威版本')
    chain(d,'start','input','preview','choice');d.edge('choice','ai','[AI梳理]');chain(d,'ai','ext','save','db');d.edge('choice','save','[直接保存]',[(280,485),(280,738)]);d.edge('choice','cancel','[放旁边／取消]',[(172,550),(172,1000)]);d.edge('db','ok','[写入确认]');d.edge('ai','fail','[拒绝／任务失败]',[(810,605),(810,1044)]);d.edge('db','fail','[写入失败／待核实]');guard(d,'ai','ext','[许可有效]');guard(d,'save','db','[确认SAVE]');d.edge('save','cancel','[取消保存]',[(285,744),(285,965),(172,965)]);d.save()

    d=lane('A03','烦恼寄存→取出或延期',1460,'REQ12／05；列表不返回正文；到期仅变为可取出，不自动展开、通知或分析。')
    act(d,'start',0,180,'','start');act(d,'input',0,220,'输入标题、正文\n选择未来再打开时间');act(d,'consent',1,325,'校验未来时间\n确认SAVE与本入口范围');act(d,'save',3,430,'保存DEPOSIT\n状态STORED／版本','action','green');act(d,'list',1,545,'列表仅显示标题、时间\nSTORED／AVAILABLE');act(d,'action',0,655,'取出或延期？','decision','amber',108);act(d,'check',2,795,'校验本人／本入口\n到期状态＋expectedVersion');act(d,'db',3,900,'取出：到期才读正文\n延期：更新未来时间／版本','action','green');act(d,'view',1,1020,'本人主动取出后显示正文\n延期仅更新日期与状态')
    endings(d,1250,'完成后可收起正文\n清除需另行二次确认','取消保存／操作\n不修改寄存状态','未到期409：不可取出\n冲突刷新／超时核实')
    chain(d,'start','input','consent','save','list','action');d.edge('action','check','[取出／延期]');d.edge('action','cancel','[取消]',[(172,735),(172,1250)]);chain(d,'check','db','view');d.edge('view','ok','[完成]');d.edge('check','fail','[未到期／版本冲突]',[(805,833),(805,1290)]);d.edge('db','fail','[存储失败／结果未明]',[(1040,940),(1040,1215),(705,1215)]);guard(d,'check','db','[校验通过]');guard(d,'db','view','[结果明确]');guard(d,'consent','save','[确认SAVE]');d.edge('consent','cancel','[取消保存]',[(285,369),(285,1205),(172,1205)]);d.note(1110,410,210,300,'外部模型／检索\n本流程无调用。\n\n到期转换：\nSTORED → AVAILABLE\n版本递增，但不会自动发起retrieve。',fs=16);d.save()

    d=lane('A04','排练→认可表达→草稿',1810,'REQ11／05／07；reviewing阶段保留本轮本人消息供选择，END阶段才清空。')
    act(d,'start',0,180,'','start');act(d,'setup',0,220,'设场景／角色／目标\n选正文并授权AI');act(d,'run',2,330,'setup→ready→running\n校验代次后创建任务');act(d,'role',4,330,'生成模拟角色回复','action','blue');act(d,'pause',1,445,'running ⇄ paused\n暂停取消任务，不补发');act(d,'finish',0,555,'点击完成排练\nFINISH_REHEARSAL');act(d,'review',2,665,'进入reviewing\n旧许可任务失效\n暂留本轮本人消息',h=92);act(d,'pick',1,795,'仅可勾选本轮本人句子\n不得选择AI或跨轮消息');act(d,'grant',0,905,'确认整理范围\n新AI_PROCESS许可');act(d,'summary',4,1015,'只接收认可表达\n及必要场景，整理草稿','action','blue');act(d,'preview',1,1125,'预览并修改草稿\n另行确认SAVE');act(d,'db',3,1235,'保存REHEARSAL_DRAFT\n非完整对话归档','action','green');act(d,'end',2,1360,'用户END：清本轮对话\n选择／预览／许可／任务')
    endings(d,1600,'回显草稿保存结果\n或结束未保存排练','取消整理／保存：不写入\nEND清空；重来新轮','任务失败可重选重试\n写超时同ID核实')
    chain(d,'start','setup','run','role','pause','finish','review','pick','grant','summary','preview','db','end');d.edge('end','ok');d.edge('grant','cancel','[取消]',[(290,949),(290,1560),(172,1560)]);d.edge('summary','fail','[failed／expired]',[(1360,1050),(1360,1550),(700,1550)]);d.edge('db','fail','[明确失败／超时待核实]');guard(d,'grant','summary','[同意AI整理]');guard(d,'summary','preview','[有效结果]');guard(d,'preview','db','[确认SAVE]');guard(d,'db','end','[写入确认／选择结束]');d.edge('preview','cancel','[取消保存]',[(285,1169),(285,1580),(172,1580)])
    for n in d.nodes:
        if n['id']=='grant':n['kind']='decision';n['w']=180;n['x']=82;n['h']=105
    d.note(55,1110,225,295,'分支语义\n暂停：可继续。\nFINISH：停止角色回复，进入选择。\nRESTART：清旧选择，新轮。\nEND：清临时内容。\n取消SAVE：不写入。',fs=16);d.save()

    d=lane('A05','注册与登录切换身份',1410,'REQ16／17／06；注册201不自动登录；游客草稿不自动转移至账号。')
    act(d,'start',0,180,'','start');act(d,'input',0,220,'输入注册或登录凭据\n新密码12～128码点');act(d,'csrf',1,330,'获取auth/context\n提交附X-CSRF-Token');act(d,'verify',2,445,'校验凭据与限流\n区分register／login');act(d,'db',3,565,'注册：创建账号\n登录：写登录会话／轮换','action','green');act(d,'result',2,695,'成功的操作？','decision','amber',100);act(d,'registered',1,810,'201注册成功\n提示另行登录，不建身份');act(d,'clean',1,955,'登录成功：重建当前身份\n清旧临时正文与任务\n不自动认领游客内容',h=108)
    endings(d,1190,'注册后：去登录\n登录后：进本人私密主页','取消输入／返回访客\n不创建新登录会话','错误显示字段／请求反馈\n不伪装已登录')
    chain(d,'start','input','csrf','verify','db','result');d.edge('result','registered','[注册201]');d.edge('result','clean','[登录成功]');d.edge('registered','ok',points=[(548,854),(548,1150),(436,1150)]);d.edge('clean','ok');d.edge('input','cancel','[取消]',[(173,310),(173,1190)]);d.edge('verify','fail','[校验／服务失败]',[(925,489),(925,1135),(700,1135)]);guard(d,'input','csrf','[提交]');guard(d,'verify','db','[校验通过]');d.note(1110,440,210,330,'外部服务无调用。\n\n登录会话持久保存；业务会话正文默认内存。\n\n注册成功与登录成功是不同界面状态。',fs=16);d.save()

    d=lane('A06','退出登录／改密与身份清理',1210,'REQ16／05／06；退出保留已主动保存业务记录，改密成功后重新登录。')
    act(d,'start',0,180,'','start');act(d,'choice',0,220,'选择退出登录\n或已登录修改密码');act(d,'mask',1,335,'先遮蔽私密视图\n冻结旧身份响应');act(d,'service',2,450,'logout撤销当前会话\nchange-password校验旧密');act(d,'db',3,565,'退出：撤销登录会话\n改密：撤销全部旧会话','action','green');act(d,'cleanup',2,685,'取消旧会话任务\n旧代次／许可失效');act(d,'view',1,800,'清身份缓存与临时正文\n退出到访客／改密去登录')
    endings(d,1000,'204确认后显示完成\n保存记录继续保留','提交前取消\n恢复原表单／当前身份','断网：本地已遮蔽\n服务撤销状态待确认')
    chain(d,'start','choice','mask','service','db','cleanup','view','ok');d.edge('choice','cancel','[取消]',[(172,310),(172,1000)]);d.edge('service','fail','[失败／状态未明]',[(808,485),(808,1044)]);guard(d,'choice','mask','[提交]');guard(d,'service','db','[请求有效]');d.note(1110,400,210,340,'外部服务无调用。\n\n退出／换账号不会自动删除持久记录。\n\n下一身份必须重新获得正文范围与用途许可。',fs=16);d.save()

    d=lane('A07','独立端侧文字销毁',1190,'REQ14；独立私有内存，不接入账号正文、应用服务、AI、检索、数据库或遥测。')
    act(d,'start',0,180,'','start');act(d,'input',0,220,'在独立输入区写文字');act(d,'buffer',1,325,'setBuffer：仅本页私有内存\n不复用共享正文状态');act(d,'choice',0,440,'销毁或退出？','decision','amber',110);act(d,'destroy',1,595,'destroy：先清正文缓冲\n再演示焚化／黑洞动画');act(d,'dispose',1,710,'跳过动画／关闭／卸载\n均clear＋dispose\n释放监听、timer、rAF',h=94)
    endings(d,975,'正文从当前界面清空\n可重新开始','返回／退出同样清空\n取消动画不恢复正文','动画异常仍清缓冲\n停止并返回独立页')
    chain(d,'start','input','buffer','choice');d.edge('choice','destroy','[销毁]');d.edge('choice','dispose','[退出／跳过]',[(280,495),(280,757)]);chain(d,'destroy','dispose','ok');d.edge('dispose','cancel','[退出]');d.edge('destroy','fail','[动画异常]',[(550,633),(550,1015),(700,1015)]);guard(d,'destroy','dispose','[动画完成／跳过]');guard(d,'dispose','ok','[留在本页]')
    for l in [2,3,4]:act(d,'none'+str(l),l,370,'无调用\n不得接收文字正文','note','bg',150)
    d.note(55,670,224,200,'界面承诺限定为本功能不发送、不保存。\n不宣称操作系统级绝对无痕或可审计远程销毁。',fs=16);d.save()

    d=lane('A08','查询证据与逐条不确定性',1460,'REQ03／07／05；SEARCH_PROCESS与AI_PROCESS分开授权，无结果不伪造来源。')
    act(d,'start',0,180,'','start');act(d,'query',0,220,'输入问题与必要材料\n选择检索范围');act(d,'grant',1,330,'预览并确认\nSEARCH_PROCESS许可');act(d,'service',2,445,'校验入口／用途／代次\n创建search任务');act(d,'search',4,565,'检索限定问题\n返回证据与检索时间','action','blue');act(d,'result',1,685,'主张→sourceIds逐条关联\n来源标题／链接／时间\nCURRENT／STALE／UNKNOWN',h=130);act(d,'select',0,845,'可选AI整理另行授权\n可选主动保存有效结果');act(d,'save',2,955,'QUERY仅提交有效\nsearchRequestId＋SAVE');act(d,'db',3,1060,'服务端复制有效证据\n保存主张／来源关联','action','green')
    endings(d,1250,'展示完整／部分／冲突\nEMPTY另呈现；不伪造来源','取消许可不外发\n取消任务丢弃旧响应','失败／过期可重试\n503≠EMPTY；写超时核实')
    chain(d,'start','query','grant','service','search','result','select','save','db','ok');d.edge('grant','cancel','[取消]',[(280,374),(280,1215),(172,1215)]);d.edge('service','fail','[拒绝／任务失败]',[(810,485),(810,1290)]);d.edge('search','fail','[failed／expired]',[(1350,600),(1350,1208),(700,1208)]);guard(d,'grant','service','[同意检索]');guard(d,'service','search','[许可有效]');guard(d,'search','result','[completed]');guard(d,'select','save','[选择保存有效结果]');guard(d,'db','ok','[写入确认]');d.edge('select','ok','[仅查看／EMPTY]',[(285,889),(285,1200),(436,1200)]);d.note(1110,790,210,280,'结果细节\n发布时间允许为空。\n检索时间独立展示。\n事实／推断／无法核实分别标注。\nEMPTY不等于服务503。',fs=16);d.save()

def dataflows():
    d=Diagram('03_数据流图','D00','上下文数据流图','系统边界含浏览器端与应用API；上下文层不展开内部处理、数据库或临时存储。',1500,900)
    d.node('u',60,330,220,190,'E1 用户','entity','pale',25)
    d.node('p',520,290,450,280,'P0 404NOTFOUND\n情绪支持系统\n\nWeb／桌宠适配／微信能力提示\n（后两者以实际能力为限）','action','pale',24)
    d.node('ai',1190,180,240,130,'E2 外部模型','entity','blue',22);d.node('s',1190,590,240,130,'E3 外部检索','entity','blue',22)
    d.edge('u','p','F01 身份／资料／偏好\nF02 临时正文与任务范围\nF03 授权及记录操作\nF04 端侧互动与销毁输入',[(360,350),(360,330)])
    d.edge('p','u','F05 身份／资料状态\nF06 临时回应与证据\nF07 记录／处理回执\nF08 端侧交互反馈',[(350,540),(350,500)])
    d.edge('p','ai','F09 限定模型任务＋正文',[(1080,350),(1080,210)],labelpos=(1080,166,'middle'));d.edge('ai','p','F10 模型结果／失败信息',[(1140,290),(1140,425)])
    d.edge('p','s','F11 限定检索问题',[(1080,505),(1080,620)],labelpos=(1070,600,'middle'));d.edge('s','p','F12 来源／主张／质量信息',[(1140,685),(1140,550)],labelpos=(1260,770,'middle'))
    d.note(510,690,500,100,'外发前分别确认AI_PROCESS／SEARCH_PROCESS。\n端侧互动与独立销毁正文不流向外部服务。',fs=19);d.save()

    d=Diagram('03_数据流图','D01','一级总体数据流图','外部实体E1重复绘制便于阅读（同一用户）；处理编号与功能模块编号无绑定关系。',1780,1710)
    rows=[('p1',220,'P1 身份与个人空间','F01 凭据／资料／偏好','F05 身份／资料状态'),('p2',510,'P2 临时任务与外发','F02 临时正文／任务范围\nF03 处理许可／取消','F06 回应／证据／处理状态'),('p3',850,'P3 主动保存与记录管理','F03 SAVE／记录操作','F07 记录／处理回执'),('p4',1175,'P4 端侧训练与互动','F04 端侧互动输入','F08 训练／物理／音频反馈'),('p5',1450,'P5 独立端侧文字销毁','F04 独立销毁输入','F08 清空／销毁画面')]
    for i,(id,y,t,fi,fo) in enumerate(rows):
        d.node('u'+str(i),50,y,220,100,'E1 用户（重复）','entity','pale',20);d.node(id,590,y,330,100,t,fs=22)
        d.edge('u'+str(i),id,fi,[(390,y+23),(450,y+23)],labelpos=(430,y+6,'middle'));d.edge(id,'u'+str(i),fo,[(450,y+145),(380,y+145),(380,y+80)],labelpos=(430,y+135,'middle'))
    d.node('d1',1230,195,440,100,'D1 身份持久存储\n账号／凭据／登录会话／资料／偏好','store','green',18)
    d.edge('p1','d1','身份／资料更新',[(1050,245)],labelpos=(1070,225,'middle'));d.edge('d1','p1','本人资料／身份状态',[(1160,335),(1000,335)])
    d.node('t1',1230,430,440,95,'T1 临时会话／任务／处理许可\n服务内存，重启失效','store','amber',18)
    d.edge('p2','t1','临时正文／任务范围／许可',[(1050,530),(1050,458)]);d.edge('t1','p2','有效上下文／代次',[(1150,560),(1050,560)])
    d.node('e2',1230,600,200,85,'E2 外部模型','entity','blue',19);d.node('e3',1470,600,200,85,'E3 外部检索','entity','blue',19)
    d.edge('p2','e2','F09 限定模型任务',[(1020,585),(1020,620)]);d.edge('e2','p2','F10 模型结果',[(1150,700),(960,700),(960,585)])
    d.edge('p2','e3','F11 限定问题',[(1010,570),(1010,590),(1565,590)]);d.edge('e3','p2','F12 检索证据',[(1570,750),(990,750),(990,590)])
    d.node('d2',1230,830,440,105,'D2 主动保存业务存储\n记录／日历／物件／寄存／草稿／证据','store','green',18)
    d.node('d3',1230,990,440,100,'D3 保存授权与控制元数据\nSAVE授权／幂等／清除作业','store','green',18)
    d.edge('p3','d2','本人本入口记录写入／操作',[(1040,875)]);d.edge('d2','p3','列表／正文／版本／回执',[(1130,970),(1000,970),(1000,925)])
    d.edge('p3','d3','SAVE授权／幂等核实信息',[(1100,950),(1100,1020)]);d.edge('d3','p3','授权状态／幂等结果',[(1160,1080),(980,1080),(980,930)])
    d.edge('t1','p3','选定快照／有效查询证据',[(1730,478),(1730,800),(1020,800),(1020,860)])
    d.node('t2',1230,1175,440,100,'T2 端侧交互内存\ntimer／物理／音频状态（非正文存档）','store','amber',18);d.edge('p4','t2','本地步骤／运行参数');d.edge('t2','p4','本次进度／运行状态',[(1120,1330),(1020,1330),(1020,1250)])
    d.node('t3',1230,1450,440,100,'T3 独立私有buffer\n仅文字销毁页，退出即清空','store','amber',18);d.edge('p5','t3','本页文字／清空后的空缓冲');d.edge('t3','p5','当前输入视图',[(1120,1600),(1020,1600),(1020,1520)])
    d.note(50,1600,870,60,'P4／P5均无应用API、数据库、AI或检索正文通路。',fs=20);d.save()

    d=Diagram('03_数据流图','D02','P2展开：临时正文与外发许可','输入输出与D01.P2平衡；处理框内是数据变换，箭头为数据，不表达控制顺序。',1600,1130)
    d.node('u',50,150,210,100,'E1 用户','entity','pale',23);d.node('p21',410,150,360,100,'P2.1 限定任务范围\n正文最小化／用途分离',fs=20);d.node('p22',410,410,360,110,'P2.2 校验处理许可\n入口／账号／版本／代次',fs=20);d.node('t1',1100,150,430,110,'T1 临时正文／许可／任务\n默认服务内存','store','amber',20)
    d.node('ai',1100,410,200,100,'E2 外部模型','entity','blue',20);d.node('se',1330,410,200,100,'E3 外部检索','entity','blue',20);d.node('p23',410,690,360,120,'P2.3 过滤旧响应并组织结果\n主张关联来源与不确定性',fs=20)
    d.edge('u','p21','F02 临时正文\n与任务范围',labelpos=(335,173,'middle'));d.edge('u','p22','F03 处理许可／取消',[(300,210),(300,465)])
    d.edge('p21','t1','限定快照／请求元数据');d.edge('t1','p22','当前对象版本／许可／代次',[(980,205),(980,465)]);d.edge('p21','p22','任务类型与最小正文')
    d.edge('p22','ai','F09 许可限定模型载荷');d.edge('p22','se','F11 许可限定检索问题',[(900,555),(1430,555)])
    d.edge('ai','p23','F10 模型结果／失败信息',[(1200,620),(940,620),(940,745)]);d.edge('se','p23','F12 来源／主张／质量',[(1430,650),(990,650),(990,775)])
    d.edge('p22','t1','撤销状态／失效代次',[(900,465),(900,270)])
    d.edge('p23','u','F06 临时回应／证据／状态',[(310,745),(310,290),(150,290)],labelpos=(165,570,'middle'))
    d.edge('p23','t1','有效临时回应／查询证据',[(850,745),(850,315),(1270,315)])
    d.note(1100,840,430,160,'相邻P3可在用户主动保存时读取T1中选定快照或有效查询证据。该存储读取在D03展开，不属于P2内部处理。',fs=19)
    d.note(50,900,720,135,'授权边界：AI_PROCESS与SEARCH_PROCESS各自确认。\n登录不等于授权；正文不会因一次许可自动进入其他任务。\n取消／失效代次产生状态信息，旧正文响应不进入界面。',fs=18);d.save()

    d=Diagram('03_数据流图','D03','P3展开：主动保存与寄存管理','E1与D2／D3可重复绘制，编号相同表示同一实体或存储；数据流聚合后与父层P3平衡。',1800,1770)
    d.node('u',50,205,230,110,'E1 用户','entity','pale',23);d.node('t1',1260,190,450,105,'T1 本人本入口选定快照\n或有效查询证据','store','amber',19)
    d.node('p31',590,200,360,115,'P3.1 确定保存对象\nSAVE范围／requestId',fs=21);d.node('p32',590,475,360,120,'P3.2 校验并事务保存\n归属／许可／幂等／版本',fs=21)
    d.node('d2',1260,475,450,105,'D2 主动保存记录\n正文／版本／证据关联','store','green',20);d.node('d3',1260,690,450,105,'D3 SAVE授权／幂等记录','store','green',20)
    d.edge('u','p31','F03 保存选择／SAVE确认');d.edge('t1','p31','选定快照／有效查询证据');d.edge('p31','p32','经确认的保存对象与许可')
    d.edge('p32','d2','本人本入口业务记录');d.edge('d2','p32','保存版本／写入结果',[(1140,645),(1050,645),(1050,555)])
    d.edge('p32','d3','SAVE授权／requestId载荷摘要',[(1080,570),(1080,723)],labelpos=(1155,657,'middle'));d.edge('d3','p32','幂等核实结果',[(1180,830),(990,830),(990,580)],labelpos=(1080,815,'middle'))
    d.edge('p32','u','F07 保存／核实回执',[(380,655),(165,655),(165,315)])
    d.node('u2',50,940,230,110,'E1 用户（重复）','entity','pale',23);d.node('p33',590,930,360,125,'P3.3 过滤并读取寄存\n列表摘要／到期主动取出',fs=21);d.node('d2b',1260,930,450,110,'D2 主动保存记录（重复）','store','green',20)
    d.edge('u2','p33','F03 列表／主动取出请求');d.edge('p33','d2b','归属／可信入口／到期查询');d.edge('d2b','p33','摘要或允许取出的正文／版本',[(1120,1135),(1030,1135),(1030,1015)]);d.edge('p33','u2','F07 列表摘要或取出正文',[(470,1140),(165,1140),(165,1050)])
    d.node('u3',50,1320,230,110,'E1 用户（重复）','entity','pale',23);d.node('p34',590,1310,360,125,'P3.4 更新延期或清除\n未来时间／版本／确认令牌',fs=21);d.node('d2c',1260,1310,450,110,'D2 主动保存记录（重复）','store','green',20);d.node('d3b',1260,1540,450,105,'D3 清除作业／确认元数据\n（重复）','store','green',20)
    d.edge('u3','p34','F03 延期／清除确认');d.edge('p34','d2c','未来reopenAt／expectedVersion\n或经确认的清除范围');d.edge('d2c','p34','更新版本／操作回执',[(1160,1490),(1000,1490),(1000,1390)])
    d.edge('p34','d3b','一次确认令牌／清除作业',[(1100,1410),(1100,1570)],labelpos=(1160,1518,'middle'));d.edge('d3b','p34','令牌核实／清除状态',[(1190,1705),(1010,1705),(1010,1410)],labelpos=(1090,1680,'middle'));d.edge('p34','u3','F07 延期／清除结果',[(440,1590),(165,1590),(165,1430)])
    d.note(50,725,870,95,'临时处理许可在T1，SAVE随保存持久化；写超时同ID同载荷核实。\n寄存列表无正文；取出须到期。清除令牌两分钟且仅一次有效。',fs=19);d.save()

    d=Diagram('03_数据流图','D04','P5展开：独立文字销毁边界','全图仅端侧，T3不与T1共享；不绘制正文通向应用API、数据库、AI、检索或日志的边。',1550,850)
    d.node('u',45,280,220,140,'E1 用户','entity','pale',24);d.node('p51',470,180,340,115,'P5.1 独立接收文字\n私有组件与输入视图',fs=21);d.node('t3',1100,180,380,115,'T3 本页私有buffer\n非共享状态／非localStorage','store','amber',20);d.node('p52',470,480,340,135,'P5.2 清缓冲并释放资源\ndestroy／clear／dispose\n动画只保留非正文参数',fs=21)
    d.edge('u','p51','F04 独立输入文字');d.edge('p51','t3','当前本页正文');d.edge('t3','p51','输入视图文字',[(1040,350),(900,350),(900,255)])
    d.edge('u','p52','F04 销毁／跳过／退出操作',[(350,370),(350,545)]);d.edge('p52','t3','空缓冲／释放后的状态',[(990,545),(990,240)])
    d.edge('p52','u','F08 空输入框／销毁画面\n及本页清空反馈',[(380,710),(145,710),(145,420)])
    d.note(1080,470,410,180,'无正文外发、持久化或遥测通路。\n退出／动画失败同样清空。\n该边界为设计要求，原型尚未完成安全审计。',fs=20);d.save()

API=[
('I01','GET','/api/auth/context','CSRF上下文'),('I02','POST','/api/auth/register','注册，不自动登录'),('I03','POST','/api/auth/login','登录并轮换会话'),('I04','POST','/api/auth/logout','撤销当前登录'),('I05','POST','/api/auth/change-password','已登录改密并撤销全部旧会话'),
('I06','GET','/api/profile','本人资料'),('I07','PATCH','/api/profile','更新资料'),('I08','GET','/api/profile/summary','本人内容摘要'),('I09','GET','/api/preferences','读取偏好'),('I10','PATCH','/api/preferences','更新偏好'),
('I11','POST','/api/sessions','建立临时业务会话'),('I12','POST','/api/sessions/:id/switch','切换模式并选择携带范围'),('I13','POST','/api/sessions/:id/actions','暂停／继续／FINISH／RESTART／END等动作'),('I14','POST','/api/consents','用途授权'),('I15','POST','/api/consents/:id/revoke','撤销用途授权'),
('I16','POST','/api/agent/tasks','创建AI任务'),('I17','GET','/api/agent/tasks/:requestId','查询AI任务'),('I18','POST','/api/agent/tasks/:requestId/cancel','取消AI任务'),('I19','POST','/api/search/tasks','创建检索任务'),('I20','GET','/api/search/tasks/:requestId','查询检索任务'),('I21','POST','/api/search/tasks/:requestId/cancel','取消检索任务'),
('I22','POST','/api/records','主动保存'),('I23','GET','/api/records','按kind/date筛选列表'),('I24','GET','/api/records/:id','本人本入口记录详情'),('I25','PATCH','/api/records/:id','允许范围内的版本更新'),('I26','POST','/api/records/:id/clear-confirmations','申请一次清除确认令牌'),('I27','POST','/api/records/:id/clear','提交已确认的清除'),('I28','GET','/api/room','读取本入口房间'),('I29','PUT','/api/room','更新已保存物件引用'),('I30','POST','/api/deposits/:id/retrieve','到期主动取出'),('I31','POST','/api/deposits/:id/postpone','更新未来再打开时间'),('I32','GET','/api/capabilities','当前入口实际能力')]

def line_for(file,pattern):
    for i,s in enumerate((REPO/file).read_text(encoding='utf-8-sig').splitlines(),1):
        if re.search(pattern,s):return i
    return 1

def tables():
    rows=[]
    def add(id,entry,page,source,pattern,states,feedback,ops,cleanup,apis,gap='演示原型；未连接真实API。'):
        line=line_for(source,pattern)
        rows.append([id,entry,page,f'{source}:{line}',states,feedback,ops,cleanup,apis,gap])
    H='web-prototype/'
    htmlrows=[
('home','首页','访客／登录外观切换；点击功能卡','账号外观与示例卡片切换','进入功能／进入登录','离开只导航；不代表撤销真实身份','I06 I08 I32','登录外观为演示，不是真实会话。'),
('companion','陪伴交流','输入→发送；切换倾听／梳理；结束','预设交流内容与操作提示','发送／切换／结束／去训练','退出演示页面；无真实任务取消','I11–I18 I22','未覆盖正文选择许可、真实请求代次与保存回执。'),
('companion-loading','陪伴加载态','直接打开独立状态页','加载占位与等待提示','按页内链接返回／结束','退出静态状态页；无后台请求','I17 I18','独立展示态，不是发送后自动出现的真实请求状态。'),
('companion-empty','陪伴空态','直接打开独立空态页','暂无内容与引导','开始交流／返回入口','无正文和任务可清理','I11 I23','空态演示未绑定真实空列表响应。'),
('companion-error','陪伴错误态','直接打开独立错误页','请求异常示例','重试／返回','无真实任务；重试为演示','I16–I18','未区分failed、expired与本地断网待核实。'),
('calendar','情绪与事件日历','选择日期／月份；点新增或已有条目','预置记录与选中日期详情','新增／编辑／清除演示','离开不代表服务端保存或删除','I22–I27','保存、清除多为页面反馈，未形成跨页数据链。'),
('calendar-empty','日历空态','直接打开空日历页','无主动记录','新增／去命名卡／返回','无记录可清理','I23','静态空态未与日历页同一数据源联动。'),
('worry-room','烦恼物件化','选择物件／处理方式','外观、房间和放置反馈','拆解／放旁边／小步骤／保存演示','离开不等于清除已保存正文','I14 I16–I18 I22 I28 I29','无真实保存引用、版本及正文授权；不是系统桌面房间。'),
('rehearsal','平行宇宙排练室','选择场景／目标后开始；输入或暂停','预设角色对话与运行提示','发送／暂停／换说法／重来／完成','停止演示；未实现FINISH reviewing契约','I11 I13–I18','完成页为独立页面，本轮本人消息选择未贯通。'),
('rehearsal-complete','排练完成页','从排练或直接打开；点击保存','预设建议／句子与保存提示','返回／再练／保存到日历演示','无本轮临时对话的统一清理','I13 I14 I16 I22','目标应是认可本人表达→预览REHEARSAL_DRAFT，不是固定建议存日历。'),
('games','减压工具入口／呼吸／弹珠','选择工具；主动开始；暂停／重新开始','呼吸进度或弹珠演示反馈','开始／暂停／继续／返回','目标：离页停计时、声音与物理','本地；可选I22','弹珠演示单趟结束；目标是持续到主动停止。'),
('pressure-toy','屏幕无损发泄','开始后点击画布；暂停／重置','本地敲击次数和图形反馈','开始／暂停／重置／返回','停本地动效与监听；目标释放声音','本地；I32用于入口能力','网页画布内演示，未验证客户端系统浮层。'),
('five-senses','五感定向','主动开始；逐步输入／跳过','五步提示与完成页','上一步／继续／跳过／再做一次','离页不自动保存可选文字','本地；可选I22','目标统一后台暂停与离页清理。'),
('things-organize','物件整理练习','从工具入口进入；按步骤整理','本地整理步骤和反馈','选择／继续／重做／返回','离页不自动存个人记录','本地；可选I22','物件整理练习不是新的第18项需求；属REQ02。'),
('pause-organize','暂停整理','三步填写可选；完成／清空','本地结果摘要；清空确认','上一步／继续／返回修改／确认清空','离页不自动保存；清空确认后擦除当前输入','本地；可选I22','需与React直接清空行为统一。'),
('task-splitting','任务拆分','填写任务并生成步骤；调整排序','本地步骤；剪贴板成功或失败提示','增删改／排序／复制／完成／退出确认','退出确认后返回工具页；不自动保存','本地；可选I22','复制需浏览器权限，不应失败仍显示复制成功。'),
('emotion-card','情绪命名卡','选词／强度／备注；选择后续入口','命名预览；保存提示','多选／跳过／倾听／梳理／查询／保存','目标离页或END清临时词与备注','I12 I14 I22','现有跨页正文与真实保存未贯通；完成命名不等于已保存。'),
('info-query','信息查询','输入关键词；提交查询','本地条目与来源占位说明','查询／查看来源样例／重试','无真实检索任务；目标取消旧查询','I14 I19–I24','不是实时检索；未形成claim→sourceIds证据链。'),
('info-empty','查询空态','直接打开无结果页','无匹配信息','修改问题／返回','无有效检索结果可保存','I20','EMPTY展示示例不等于503、failed或expired。'),
('login','登录','填写非空演示凭据并提交','加载遮罩后跳登录外观首页','登录演示／去注册／访客使用','不发送凭据；离页不等于真实logout','I01 I03','非真实凭据验证、Cookie或CSRF。'),
('register','注册','填写演示资料后提交','注册并进入登录外观首页','提交／返回登录／访客使用','不创建真实账号','I01 I02','与注册201不自动登录契约不同。'),
('profile','个人主页','进入私密资料展示；编辑入口','预设资料、偏好、内容入口','编辑／进入记录／设置／退出','退出只是页面切换；目标清身份缓存','I04–I10 I23','预设本人内容不代表真实权限校验。'),
('settings','设置与隐私','切换偏好；点击清除','演示开关与范围提示','切换／清除确认／返回','目标清当前身份本入口数据，不波及其他账号','I09 I10 I26 I27','无服务端两分钟一次令牌或清除作业。'),
('prototype-guide','原型说明','直接进入说明页','入口／演示范围说明','打开相关页面／返回','无业务正文与任务','无业务API','说明页，不计入17项新增业务功能。')]
    for i,(name,title,st,fb,op,cl,api,gap) in enumerate(htmlrows,1):add(f'H{i:02d}','HTML',title,H+name+'.html','<title>',st,fb,op,cl,api,gap)
    R='prototype/src/pages/'
    reactrows=[
('home','首页','Workspace','HomePage','访客／账号；示例与记录','示例卡明确为示例','进入工具／查看记录','路由退出；身份桶仍在本次内存','I06 I08 I23 I32','示例数据不可当真实账户历史。'),
('companion','陪伴交流','Workspace','CompanionPage','idle→typing→临时回复；结束确认','650ms预设回复','发送／结束／设置留存','卸载clearTimeout；当前组件消息清空','I11–I18 I22','session偏好可能结束时保存全对话，需改为本次选内容＋SAVE确认。'),
('search','信息查询','Workspace','SearchPage','idle／loading／success及演示场景','可选模拟结果，来源示例','查询／切换示例场景／改问题','卸载清模拟timer','I14 I19–I24','场景切换不是真实错误；待接证据与不确定性字段。'),
('privacy','会话与隐私','Workspace','PrivacyPage','按当前身份统计；清除确认','各类内存条目数与保存偏好','设置留存／查看／清除','清Web当前身份桶；桌宠桶独立','I09 I10 I23 I26 I27','仍展示出范围的担忧瓶；无真实删除令牌／作业。'),
('relief','训练入口','Exercises','ReliefPage','进入ready工具列表','时长和工具说明','选择呼吸／五感／暂停／拆分','未启动训练，无计时清理','本地；I32','工具入口演示。'),
('breathing','呼吸调节','Exercises','BreathingPage','ready→running⇄paused→done；离开确认','阶段／进度／完成','开始／暂停／继续／重设／退出','卸载clearInterval；离路由不保留进度','本地；可选I22','未见后台自动暂停逻辑；与桌宠暂停保进度不同。'),
('senses','五感定向','Exercises','GuidedPage','五步输入或跳过→done','当前提示／完成反馈','上一步／继续／跳过／再做','有未完成输入时离开确认；卸载丢本页草稿','本地；可选I22','不自动保存；按目标补统一paused。'),
('pause','暂停整理','Exercises','GuidedPage','三步填写→done；直接清空','结果摘要与本地重置','返回修改／清空／返回工具','离开确认后丢本页草稿','本地；可选I22','清空未二次确认，与HTML不同。'),
('task','任务拆分','Exercises','TaskPage','输入→步骤生成／修改→完成','步骤清单；复制失败模态提示','增删改／复制／完成／退出','未完成离开确认；卸载丢本页草稿','本地；可选I22','复制失败可手动复制；不等于主动持久保存。'),
('emotion','情绪命名卡','Tools','EmotionPage','填写→done预览→加入日历','词语／强度／原因预览','返回修改／加入日历／不保存退出','组件卸载清本页输入；日历桶另保留','I12 I14 I22','访客可写访客内存日历；目标登录后重确认SAVE。'),
('calendar','情绪与事件日历','Tools','CalendarPage','选月日／空／有记录／编辑','当前身份记录；提交反馈','新增／编辑／取消／删除确认','换月关闭编辑；账号桶刷新清空','I22–I27','无登录持久门槛、expectedVersion或服务器回执。'),
('room','烦恼物件化','Tools','RoomPage','建外观→临时预览→保留','几何形状、颜色、大小','放旁边／保存／编辑／清除当前／删除记录','当前物件与保存记录分离；离页清临时预览','I14 I16–I18 I22 I28 I29','圆等几何演示应映射TANGLE／STONE／NOTE；无真实房间引用。'),
('dialogue','平行宇宙排练室','Tools','DialoguePage','started；paused；typing；勾选保存','预设模拟角色；本人句子可选','发送／暂停／重写／选择／保存／退出确认','卸载清timer；仅主动保存expressions留内存桶','I11 I13–I18 I22','缺FINISH→reviewing→新许可整理→草稿预览的完整阶段。'),
('worry','烦恼寄存所','Tools','WorryPage','表单→确认保存；列表／查看／改时间','正文摘要；到期标签','现在打开／修改时间／删除确认','离页清本页草稿；已存条目留身份桶','I22–I27 I30 I31','未到期也可查看；列表含正文摘要，未来时间校验不足。'),
('destroy','文字焚化与重力黑洞','Tools','DestroyPage','独立text→清空反馈','默认演示文字；清空提示','销毁文本／返回','卸载组件丢本页text，不入业务桶','仅端侧；无正文接口','文本清空演示；非完整焚化／黑洞物理及安全审计。'),
('toy','禅意编曲弹珠机','Tools','ToyPage','ready→running⇄paused；stop/reset','模拟球位、计数、可选声音','开始／暂停／继续／停止／音效','卸载清interval、媒体监听和AudioContext','仅端侧','离开路由资源清理；后台暂停待统一。'),
('click','屏幕无损发泄','Tools','ToyPage','ready→running；点击计数；暂停','画布内反馈／计数／音效','开始／点击／暂停／停止','卸载关闭音频和媒体监听','仅端侧；I32','非操作系统浮层。'),
('bottle','担忧瓶（历史遗留）','Tools','BottlePage','输入→提交确认→当前视图列表','本地模拟投稿，非真实社区','编辑／确认／返回','离页丢组件列表和草稿','无当前需求接口','出当前17项范围，应从菜单、隐私和答辩主流程移除。'),
('entries','多入口规划','Workspace','EntriesPage','点击桌宠／微信','桌宠模拟；微信规划说明','打开pet／查看微信提示','跳转不默认携带正文','I32','微信不是已接入登录或消息能力。'),
('login','登录','Account','LoginPage','输入→字段校验→演示登录','demo_a／demo_b；成功提示','登录／填示例／注册／访客','切换owner；访客条目不迁移','I01 I03','浏览器内存凭据；无真实Cookie与CSRF。'),
('register','注册','Account','RegisterPage','资料校验→创建并登录','密码至少8位的演示提示','创建／转登录／访客','刷新清账号；不创建服务账户','I01 I02','当前自动登录，密码8位且maxLength40；目标注册不自动登录、新密12～128码点。'),
('profile','个人主页','Account','ProfilePage','访客空态／已登录／编辑资料／改密','私密模拟资料与条目入口','编辑／保存／取消／改密／退出','退出确认切身份；已保存内存桶保留','I04–I10 I23','资料、密码均本地模拟，改密需接撤销所有旧会话契约。')]
    for i,(route,title,file,fn,st,fb,op,cl,api,gap) in enumerate(reactrows,1):add(f'R{i:02d}','React Web',f'{title}（{route}）',R+file+'.jsx',f'export function {fn}',st,fb,op,cl,api,gap)
    add('R23','React 容器','桌宠专用路由（pet）','prototype/src/App.jsx',r'<DesktopPet active','route=pet／非pet','active控制桌宠可见性；组件常驻','打开桌宠／回Web','非active时暂停训练；组件未随路由卸载','I32','22个PAGES键＋单独pet路由；桌宠视图另逐项列出。')
    petrows=[
('collapsed','收起态','点击宠物／Esc／收起','问候气泡与暂停提示','展开／拖动／键盘移动／摸摸','收起暂停呼吸；未结束聊天或删除已存条目','无业务API','浏览器模拟桌面；不是Electron系统桌宠。'),
('home','快捷首页','展开或返回快捷入口','角色、入口卡片、访客状态','聊聊／记心情／呼吸／更多','导航先暂停运行中的呼吸','I32','三角色仅外观方案；本轮不替用户选最终形象。'),
('chat','陪伴聊天','输入→typing→预设回复；切模式确认','倾听／梳理；500字限制','发送／确认切换／结束会话／求助','结束确认清消息草稿与训练；日历寄存单独留存','I11–I18','切模式保留全文演示；目标须选择携带范围并处理旧任务代次。'),
('emotion','记录这一刻','选词／强度／备注；点击保存','未登录阻断；登录后当前账号记录','选择／保存／取消编辑','导航保留本身份临时表单；END或清除再清理','I22 I25','真实SAVE许可／requestId与版本尚未接入。'),
('calendar','心情日历','选月／日期；空／有记录','日期详情、编辑、删除确认','记录这天／编辑／删除／返回','收起仅隐藏；退出身份遮蔽私密视图','I23–I27','仅桌宠账户内存，与Web桶独立，不是真实持久化。'),
('breath','一起慢慢呼吸','ready→running⇄paused→complete／exited','总时长与进度；暂停保留','开始／暂停／继续／退出／再一轮','收起、导航或后台暂停；主动继续不补算','本地；可选I22','切角色保进度；切身份清旧运行状态；目标状态名统一completed。'),
('worry','烦恼先放一放','填写→登录门槛→确认保存；展开／延期','寄存中／可取出状态','保存／取出看看／延期一天／删除确认','草稿与记录留本身份桌宠桶；清除范围单独','I22–I27 I30 I31','未到期也可展开正文；延期固定一天，目标应由用户选未来时间。'),
('more','更多入口','点击完整页面入口','转完整页前说明不自动带正文','查资料／物件／排练／销毁／弹珠','导航暂停训练；跳转不携带桌宠正文','I12 I32','复杂任务需Web承载；不称其他入口已同步。'),
('settings','桌宠偏好','调整安静／大小／位置；清除确认','即时外观反馈；清除范围','调整／恢复位置／清当前身份桌宠／求助','清除取消保留；确认清桶并取消回复timer','I09 I10；业务记录I26 I27','同一按钮同时清临时与多类记录，目标须定义批量策略；当前目录无批量清除端点。'),
('help','操作说明与求助','点击帮助入口','现实支持建议与原型说明','返回／按说明寻求现实支持','不创建自动救援或上传正文','无正文外发API','提示不代表医疗诊断、自动报警或已联系第三方。')]
    PF='prototype/src/pet/DesktopPet.jsx'
    for i,(view,title,st,fb,op,cl,api,gap) in enumerate(petrows,1):add(f'P{i:02d}','桌宠',f'{title}（{view}）',PF,{'collapsed':'const closePanel','home':'const renderHome','chat':'const renderChat','emotion':'const renderEmotion','calendar':'const renderCalendar','breath':'const renderBreath','worry':'const renderWorry','more':'const renderMore','settings':'const renderSettings','help':'const renderHelp'}.get(view,'const TITLES'),st,fb,op,cl,api,gap)
    cols=['编号','入口','页面／视图','代码证据（仓库相对路径:行）','状态与触发条件（源码现状）','页面反馈（源码现状）','可用操作（源码现状）','退出与清理（现状或明确目标）','对应目标接口编号','差异与限制']
    folder=ROOT/'04_交互状态表';folder.mkdir(exist_ok=True)
    with (folder/'页面交互状态表.csv').open('w',encoding='utf-8-sig',newline='') as f: w=csv.writer(f);w.writerow(cols);w.writerows(rows)
    mdfile(Path('04_交互状态表/页面交互状态表.md'),'# 页面交互状态表\n\n依据仓库fe60c90静态源码核对；未运行产品测试。现状和目标分别标记，所有API均为待对接目标。共57行：HTML 24页、React Web 22页及pet容器1行、桌宠10视图。状态页也逐页列出。接口编号见《接口映射与通用状态》。\n\n|'+ '|'.join(cols)+'|\n|'+'|'.join(['---']*len(cols))+'|\n'+'\n'.join('|'+ '|'.join(str(c).replace('|','／').replace('\n','<br>') for c in row)+'|' for row in rows))
    (folder/'页面交互状态表.html').write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>页面交互状态表</title><style>body{font:15px Microsoft YaHei;margin:30px;background:#FDF5F8;color:#342B33}h1{color:#984762}input{padding:12px;width:600px}table{border-collapse:collapse;width:2700px;background:white;margin-top:18px}th,td{border:1px solid #EBCBD8;text-align:left;padding:12px;min-width:125px;vertical-align:top}th{background:#F9EAF0;position:sticky;top:0}tr:nth-child(even){background:#FDF5F8}.wrap{overflow:auto}p{max-width:1100px}</style><h1>页面交互状态表</h1><p>源码快照fe60c90。57行覆盖全部HTML页面、React页面及桌宠视图。所有API为目标契约，原型未连接真实后端。输入页名、状态、接口编号或差异关键词即可筛选；横向滚动查看清理与差异。</p><input id="filter" placeholder="搜索，例如：寄存、paused、I22、自动登录"><div class="wrap"><table><thead><tr>'+''.join('<th>'+esc(c)+'</th>' for c in cols)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+esc(c)+'</td>' for c in row)+'</tr>' for row in rows)+'</tbody></table></div><script>document.querySelector("input").oninput=e=>{for(const r of document.querySelectorAll("tbody tr"))r.hidden=!r.innerText.toLowerCase().includes(e.target.value.toLowerCase())}</script></html>',encoding='utf-8')
    mdfile(Path('04_交互状态表/接口映射与通用状态.md'),'''# 接口映射与通用状态

## 依据与使用方式

HTTP契约唯一依据：`docs/第三次作业_张王昊/09_全功能接口与限制规范.md`。本表只建立UX追踪，不新增接口，不说明后端已经实现。I编号为本交付导航编号，不替换仓库接口命名。

所有变更请求附`X-CSRF-Token`。更新带expectedVersion；业务活动使用sessionGeneration/activityGeneration过滤迟到响应。用途许可限定账号、可信入口、用途与对象版本，AI_PROCESS、SEARCH_PROCESS、SAVE不互相替代。

## 32个方法／路径

|编号|方法|路径|用途|
|---|---|---|---|
'''+ '\n'.join(f'|{a}|{b}|`{c}`|{d}|' for a,b,c,d in API)+'''

## 页面目标状态：适用所有需要请求的页面

|状态／触发|页面反馈|可用操作|退出与清理|
|---|---|---|---|
|idle：尚未开始|说明任务和处理范围，不自动外发|填写、选范围、返回|清本页临时草稿或按明确保留策略暂停|
|loading：已提交且未明确完成|展示进度或等待；禁重复提交|取消、返回；写入不换ID重试|取消外部任务并使旧代次失效；持久写须核实结果|
|ready：有可展示结果|正文／来源／版本与可用操作|编辑、下一步、另行主动保存|隐藏正文；结束清临时内容，保留已保存记录|
|empty：有效查询成功但无条目|明确暂无记录／无结果|新增或改问题|不构造来源或虚假历史|
|error：明确失败|可理解的原因及可恢复范围|同任务重试或返回|禁止显示保存成功；不把503当空列表|
|blocked：未登录／无权限／能力不支持|说明当前阻断与可行入口|登录、返回、查看入口能力|遮蔽私密正文并清旧身份缓存|
|paused：用户暂停或页面后台|冻结计时、物理和声音，显示主动继续|继续、重来、退出|不补算后台进度、不重发旧任务|
|ended：明确结束|结束反馈；返回入口|新会话／返回|清临时正文、选择、许可、timer、rAF和监听|
|write-unconfirmed：写入超时或断网（UI附加状态）|本地已停止／保存结果待核实|同requestId同载荷核实|不新建ID重复写，不提前展示已保存|

`write-unconfirmed`是UX展示状态，不是新服务任务状态或HTTP错误码。标准任务状态为pending/running/completed/cancelled/failed/expired；failureReason如TIMEOUT、PROVIDER_UNAVAILABLE、OUTPUT_INVALID只解释失败。取消为任务状态。

## 错误与回退

|HTTP／事件|UI处理|
|---|---|
|400 INVALID_INPUT／413 INVALID_INPUT|定位输入问题或长度；保留可安全重填范围|
|401 AUTH_REQUIRED|遮蔽正文、清身份缓存、取消旧响应，登录后重新确认范围|
|403 ACCESS_DENIED|停止操作，不外泄授权范围和他人数据|
|404 NOT_FOUND|不存在／非本人／非本入口统一提示，不暴露归属|
|409 CONFLICT／INVALID_STATE|读权威版本；不自动覆盖，不提前取出寄存|
|429 RATE_LIMITED|说明稍后重试，保留草稿；不自动连发|
|503 SERVICE_UNAVAILABLE|服务暂不可用；不是空记录、已清除或已退出|
|本地取消请求／断网|仅可确认本地停止；服务任务或写入状态待核实|

## 特殊动作规则

- 模式切换有现有正文、活动任务或未保存内容时，先展示目标任务与所选携带内容；取消留原模式，成功回执后才切状态。跨入口跳转默认不携带正文。
- 训练正常完成用completed；敲击与弹珠持续至主动停止，不能通用自动标completed。暂停停timer／rAF／音频／物理；退出释放监听与捕获。
- 清除流程I26→展示对象范围→用户确认I27；令牌两分钟、一次有效。现有目录没有批量清除端点，多条清除不能用假接口代替。
- 日历使用I23的kind/date筛选；查询保存仅提交有效searchRequestId，由服务端复制来源与主张。
- REQ14完全独立端侧：setBuffer／destroy／clear／dispose；无上传、恢复、远程销毁或正文遥测接口。
- 排练FINISH_REHEARSAL进入reviewing，暂留本轮本人消息；勾选recognizedMessageIds→新AI_PROCESS整理→预览→SAVE→REHEARSAL_DRAFT。END才清选择与临时正文。
''')
    diffs=[
('D01','高','注册与密码',R+'Account.jsx','RegisterPage','React8位／40字符上限且自动登录；HTML注册并进入。','新密码12～128 Unicode码点；201仅成功注册，转登录。','待前端与服务对齐'),
('D02','高','陪伴保存',R+'Workspace.jsx','const end=','React会话留存偏好开启后结束时保存整轮。','逐次选择消息／快照；登录后单独SAVE，不因偏好自动保存整轮。','待前端修订'),
('D03','高','寄存正文',R+'Tools.jsx','WorryPage','列表含正文摘要，未到期可现在打开。','列表只含标题与时间；到期后本人retrieve才读正文；未到期409。','待前后端对齐'),
('D04','高','桌宠寄存',PF,'const renderWorry','未到期可展开；延期固定一天；仅检查时间有效。','只在到期后取出；用户选未来时间；版本冲突刷新。','待桌宠原型修订'),
('D05','高','排练阶段',R+'Tools.jsx','DialoguePage','勾选本人句子直接存expressions，缺reviewing与整理草稿。','FINISH保本轮本人消息→选择→新AI许可整理→可编辑预览→SAVE草稿。','待前端修订'),
('D06','高','排练完成页',H+'rehearsal-complete.html','carryToCalendar','固定建议、固定日期保存提示，与当前排练不贯通。','只保存认可本人表达生成的REHEARSAL_DRAFT；不可冒充真实保存。','待HTML修订'),
('D07','高','真实API与权限','prototype/src/App.jsx','const value=','身份与记录在浏览器内存桶，登录不校验真实服务。','接同源Cookie／CSRF；服务校验可信入口与归属；示例持续标注。','待实现'),
('D08','高','用途许可',R+'Workspace.jsx','CompanionPage','预设AI和检索演示没有真实外发许可或代次。','AI／SEARCH／SAVE分开预览确认；取消与换身份使迟到结果失效。','待实现'),
('D09','高','来源与不确定性',R+'Workspace.jsx','SearchPage','本地场景与示例链接，无真实claim/sourceIds。','逐条关联来源、发布时间与检索时间；partial、冲突、陈旧、无法核实分开。','待对接'),
('D10','高','清除语义','prototype/src/App.jsx','clearRecords:','当前身份桶一次清空，无服务确认令牌与结果核实。','每个记录I26/I27确认；批量范围需团队另定，不自创批量API。','待接口与UX同步'),
('D11','高','保存超时',R+'Tools.jsx','CalendarPage','内存更新即时成功，无409、幂等重放或写状态未明。','同requestId同载荷核实；确认成功再回显保存；冲突读权威版本。','待实现'),
('D12','中','呼吸后台',R+'Exercises.jsx','BreathingPage','React Web运行计时未见visibilitychange暂停；桌宠已实现。','Web与桌宠统一后台暂停；显式继续、不补算。','待原型统一'),
('D13','中','暂停整理清空',R+'Exercises.jsx','GuidedPage','React结果清空直接执行；HTML有二次确认。','清当前输入前说明范围并可取消；普通离页按未保存策略处理。','待统一'),
('D14','中','弹珠完成语义',H+'games.html','<title>','HTML弹珠单趟结束，React以运行／暂停／停止演示。','持续互动由用户停止；完成状态仅用于有终点的小训练。','待统一'),
('D15','高','销毁承诺',R+'Tools.jsx','DestroyPage','仅text清空示例，未完成独立页面全链路安全审计。','私有buffer隔离；退出和异常仍清空，不进网络／共享状态／存储／日志。','待实现与专项复核'),
('D16','中','多端能力',R+'Workspace.jsx','EntriesPage','桌宠仅浏览器模拟，微信无授权消息服务。','capabilities明确可用／模拟／不可用；系统浮层须另验证。','待能力验证'),
('D17','中','出范围功能',R+'Tools.jsx','BottlePage','React仍有bottle路由与隐私入口。','从本次17项主流程、图表和答辩移除；保留差异证据。','待范围清理'),
('D18','中','视觉与命名',R+'Tools.jsx','RoomPage','React绿色、HTML粉色；心情／情绪日历与担忧等别名并存。','本交付粉色；六模块与REQ名统一，旧页面别名在映射中保留。','待团队复核'),
('D19','中','HTML反馈真实性',H+'calendar.html','<title>','保存和清除多为toast或DOM提示，独立状态页不由真实请求驱动。','持续标演示；对接后以权威回执进入loading／ready／empty／error。','待对接'),
('D20','低','HTML外部依赖',H+'home.html','tailwind','页面引用远程Tailwind／图标资源，不能保证离线呈现。','本次交付图、状态表和母版全部本地可读；原型离线资源另归团队实现。','记录限制')]
    ds=['|编号|优先级|主题|现状证据|现状|目标／修订建议|状态|','|---|---|---|---|---|---|---|']
    for id,pr,t,f,p,cur,target,status in diffs:ds.append(f'|{id}|{pr}|{t}|`{f}:{line_for(f,p)}`|{cur}|{target}|{status}|')
    mdfile(Path('04_交互状态表/原型差异清单.md'),'# 原型差异清单\n\n以接口规范09号为目标契约；以下为静态源码差异，不是产品测试结果或已经修复记录。优先级表示对权限、保存和任务流程的影响。\n\n'+'\n'.join(ds)+'\n\n归档规则：原型代码的旧功能不等于当前需求范围；设计图中的目标状态不等于原型已经实现。团队非作者复核前统一标记“待团队复核”。')
    return rows

def notes():
    mdfile(Path('02_关键泳道图/修改说明.md'),'''# 关键泳道图与修改说明

## 图表范围

本交付是依据当前接口契约重绘的UX活动设计稿，不修改仓库代码。A01～A08均分用户、界面、应用服务、数据存储、外部模型／检索五泳道；独立端侧流程对后三者标“无调用”。起点实心圆、终点同心圆；动作圆角矩形、判断菱形、带守卫控制流符合UML活动图基本记法。暂停循环在动作内用状态转换简写，避免将整个状态机混入泳道图。

|图号|关键场景|与旧原型／旧描述相比的修改|正常／取消／失败出口|
|---|---|---|---|
|A01|命名→陪伴→主动保存|命名保持临时；AI许可与SAVE分开；保存确认后才回显|确认成功／取消无外发或无写入／任务失败或写结果待核实|
|A02|物件→放旁边或梳理→房间|放旁边无AI；物件外观与正文分开；房间仅引用已保存记录|物件／房间回执／取消保临时预览／冲突读权威版本|
|A03|寄存→取出或延期|列表无正文；到期不自动打开；未到期不能取出；延期时间由用户选择|到期取出或延期回执／取消不更新／409或写结果待核实|
|A04|排练→认可表达→草稿|补FINISH→reviewing，暂留本轮本人消息供选择；新许可整理草稿；END才清空|保存草稿或结束／取消不写入／任务失败、过期或写核实|
|A05|注册／登录|注册201不自动登录；新密码12～128码点；登录轮换身份并清旧临时内容|本人私密空间／取消留访客／字段、凭据或服务错误|
|A06|退出／改密|先遮蔽私密视图；退出撤当前会话，改密撤全部旧会话；已保存记录保留|204后完成或重新登录／提交前取消／断网撤销状态待确认|
|A07|独立文字销毁|正文使用独立私有buffer；先清正文再动画；跳过、退出、异常均清理|空缓冲／退出同样清空／动画失败仍清空|
|A08|查询来源与不确定性|逐claim关联sourceIds；独立检索许可；AI整理另许可；保存复制有效证据|有效结果及保存回执／取消丢旧响应／EMPTY与失败、503分开|

## 全流程约束

1. 账号、可信入口、用途许可与对象版本共同决定范围；客户端不能随意声明可信入口。登录不代表允许外发、保存或跨入口迁移。
2. 外部任务只用pending、running、completed、cancelled、failed、expired。页面关闭或网络中断不保证服务器已取消，必须显示“本地已停止，服务器状态待确认”。
3. 写入超时不等于写入失败。保持相同requestId及相同载荷核实，不换ID重复写，不提前显示已保存。
4. 清除先I26取得两分钟、一次使用的确认令牌，再I27提交；取消清除保留记录。移出房间不等于删除物件正文。
5. 小训练无逐步模型请求。暂停停timer／rAF／声音与物理；继续不补算后台；离开释放监听、捕获、计时及音频。
6. 明显危机表达按既定安全边界停止常规引导并提示现实支持，不宣称自动救援。检索材料仅作为资料，不作为系统指令。

## 复核关注点（待团队复核）

- 后端：SAVE幂等事务、两类代次、迟到回执、到期版本与retrieve契约。
- 数据库：SAVE授权／幂等及清除作业字段与DDL稿一致性；设计存在不等于迁移已执行。
- 前端：reviewing暂留窗口、旧身份遮蔽、取消外发、写状态未明的反馈。
- UX：每个取消出口是否保留了明确承诺的内容，是否误把停止、结束、清除、退出登录当同一动作。

来源：需求范围v0.3、09号全功能接口规范、李泉毅04号接口目录、程杰03号关键状态与时序、数据库设计及当前原型源码。所有图的输入输出为设计目标，不能当作系统已交付证据。
''')
    mdfile(Path('03_数据流图/数据字典与层级平衡.md'),'''# 数据字典与层级平衡

## 图表层级

|图号|层级|含义|
|---|---|---|
|D00|上下文|P0系统、E1用户、E2模型、E3检索；无内部存储|
|D01|一级总体|P1身份、P2临时外发、P3保存记录、P4端侧互动、P5独立销毁|
|D02|P2关键展开|P2.1限定任务、P2.2校验许可、P2.3组织有效结果|
|D03|P3关键展开|P3.1确认保存对象、P3.2事务保存、P3.3寄存读取、P3.4延期／清除|
|D04|P5关键展开|P5.1独立输入、P5.2清空与释放|

本交付采用Gane-Sarson风格：外部实体为矩形，处理为带编号圆角框，存储为右侧开放且带标识分隔线的框；有向箭头必须命名。重复绘制E1仅改善阅读，始终代表同一外部用户。处理编号不是REQ编号，也不是执行顺序。DFD不使用UML判断、起终点或控制流。P4是端侧运行参数变换，P5是独立正文清空，不因画在系统边界内就允许连接应用API。

## 外部平衡

|上下文数据流|D01对应处理|展开平衡|
|---|---|---|
|F01 凭据／资料／偏好 → 系统|E1→P1|P1未进一步展开|
|F02 临时正文／任务范围 → 系统|E1→P2|D02 E1→P2.1|
|F03 授权及记录操作 → 系统|E1→P2处理许可；E1→P3 SAVE及记录操作|D02 E1→P2.2；D03 E1→P3.1／3.3／3.4|
|F04 端侧互动及独立销毁输入 → 系统|E1→P4；E1→P5|D04 E1→P5.1文字、→P5.2销毁操作|
|F05 身份／资料状态 → 用户|P1→E1|保持父层|
|F06 临时回应／证据／状态 → 用户|P2→E1|D02 P2.3→E1|
|F07 记录／处理回执 → 用户|P3→E1|D03 P3.2／3.3／3.4→E1聚合|
|F08 端侧交互反馈 → 用户|P4→E1；P5→E1|D04 P5.2→E1空输入框／销毁画面|
|F09 限定模型任务 → E2|P2→E2|D02 P2.2→E2|
|F10 模型结果 → 系统|E2→P2|D02 E2→P2.3|
|F11 限定检索问题 → E3|P2→E3|D02 P2.2→E3|
|F12 来源／主张／质量 → 系统|E3→P2|D02 E3→P2.3|

## 存储平衡

|存储|父层读写|子层读写与范围|
|---|---|---|
|T1|P2写／读；T1→P3选定快照与证据|D02 P2.1写快照、P2.2读版本许可及写撤销、P2.3写有效结果；D03 T1→P3.1|
|D2|P3写本人记录及读列表、正文、版本、回执|D03 P3.2事务写／读回执；P3.3只读允许范围；P3.4版本更新／清除|
|D3|P3写授权与幂等、清除元数据并读核实结果|D03 P3.2保存授权与幂等；P3.4清除令牌／作业及核实|
|T3|P5写／读本页正文与空缓冲|D04 P5.1写／读；P5.2写空缓冲与释放状态|

## 核心数据字典

|编号／名|关键组成|保留位置／边界|
|---|---|---|
|F01 身份资料|凭据、资料字段、非正文偏好、同源身份上下文|凭据只至认证处理；不得写日志或外发AI|
|F02 临时任务|选定正文、taskType、对象版本、requestId、sessionGeneration/activityGeneration|T1服务内存；浏览器草稿另为本地临时状态，不自动保存|
|F03 授权与操作|用途、对象范围、入口身份上下文、expectedVersion；保存或清除确认|AI／SEARCH许可临时；SAVE随记录持久化；入口由服务可信识别|
|F06 回应与证据|临时回应；claims[sourceIds]、sources、partial和不确定性|未主动保存时临时；旧代次结果丢弃|
|F09 模型载荷|经AI_PROCESS许可的最小正文与任务；排练仅选定本人表达和必要场景|只能到E2；不能附未选历史、销毁输入或其他入口记录|
|F11 检索载荷|经SEARCH_PROCESS许可的问题与必要材料|只能到E3；AI整理需另许可|
|F12 检索证据|来源title/url、可空publishedAt、retrievedAt、quality；主张sourceIds|quality为CURRENT／STALE／UNKNOWN，EMPTY不造来源|
|D1 身份持久存储|user_accounts、password_credentials、login_sessions、user_profiles、account_preferences、entry_points|PostgreSQL；登录会话持久不代表业务正文也持久|
|D2 保存业务存储|saved_records、saved_messages、emotion_records、worry_objects、rooms、room_objects、rehearsal_drafts、worry_deposits、saved_queries、sources、claims、evidence_links|仅主动SAVE后进入；本人本入口隔离|
|D3 控制元数据|consent_grants中SAVE授权、idempotency_records、deletion_jobs/outbox/log、audit_events脱敏元数据|不放临时正文、密码或独立销毁输入；设计字段须与DDL同步|
|T1 临时服务存储|业务会话正文、任务、外发许可、有效查询证据、双代次|服务内存，重启失效；不是PostgreSQL聊天历史|
|T2 端侧互动内存|训练步骤、timer/rAF、物理参数、音频状态|暂停冻结，退出释放；非正文偏好可本地保留|
|T3 独立销毁buffer|只含当前销毁页输入；销毁后的空缓冲|独立私有内存；不进入共享正文状态、localStorage、API或日志|

## 三条边界

1. **临时正文**：进入T1只服务本次任务，默认不写D2。页面、服务内存与登录会话是不同生命周期。
2. **主动保存**：用户选对象、确认SAVE后，P3事务写D2／D3。QUERY只接受有效searchRequestId并复制服务证据；不信任客户端伪造来源。持久写状态未明时同ID同载荷核实。
3. **外发授权**：P2.2校验后仅向对应E2或E3发送最小范围；用途、入口或版本变化需重新确认。独立销毁T3没有这条通路。

寄存特例：保存未来reopenAt；列表无body；到期STORED→AVAILABLE且版本递增；主动retrieve校验到期；延期另选未来时间；清除另行令牌确认。没有自动通知、自动打开或自动AI分析。

说明：图中持久表名表示设计映射，不代表DDL已经执行。数据库稿的其他授权用途与09号三用途接口的差别留待团队同步，本交付不据此虚构API。
''')
    mdfile(Path('05_图示视觉规范/图示视觉规范.md'),'''# 图示视觉规范 v1.2

## 1. 视觉来源与范围

用户选择方案2：沿用HTML原型柔和粉色。精确色值来自`web-prototype/theme.css`，正文和辅助语义色为本交付补充。图表是课程设计稿；页面现状依据fe60c90源码，不能用视觉统一推断产品已实现。

## 2. 模块名称

六模块固定为：账号与个人中心、陪伴与沟通、记录与整理、压力缓解、信息支持、基础与多端。REQ01～17沿用《需求范围_v0.3.md》。旧原型“心情日历”对应“情绪与事件日历”，“担忧具象化”对应“烦恼物件化”，“对话排练”对应“平行宇宙排练室”，“担忧暂存”对应“烦恼寄存所”。别名只用于代码追踪，不新增需求。

## 3. 配色与可读性

|用途|色值|使用规则|
|---|---|---|
|主色|#C86B8C|结构条、强调边线；小字号正文不用白字叠加主色|
|深主色|#984762|标题、关键标签；白底对比明确|
|浅粉／边线|#F9EAF0／#EBCBD8|模块背景、分区与细边线|
|浅底／正文|#FDF5F8／#342B33|页面底、主要文字；辅文#71616B|
|保存／持久|#E8F3EC＋#35654D|配“主动保存／持久”文字，不单靠绿色|
|许可／临时／待确认|#FFF2D8＋#8A5A18|配“授权／临时／待核实”文字|
|外部服务|#EAF0F7＋#426384|配“外部模型／检索”实体名|
|失败|#FAE8E8＋#A33C47|配错误解释与可用操作，不仅涂红|

不用六种颜色强行区分六模块；模块依靠编号与名称，辅助色专门表达数据边界与状态。

## 4. 图形、图例与箭头

|图种|图形|线条规则|
|---|---|---|
|功能模块层次图|模块、需求、子功能用矩形层次|无箭头实线＝包含；不表示请求、导航或时间|
|UML活动泳道|五泳道；实心圆起点，同心圆终点，圆角动作，菱形判断|实线开放箭头＝控制流；判断分支用[同意]、[取消]、[失败]等守卫；注释虚线边框|
|DFD|矩形外部实体、编号圆角处理、右开放存储符号|命名有向箭头＝数据流；读写分开，不用菱形或起终点；E1重复绘制要标重复|
|边界注释|虚线框＋完整文字|没有数据流的边界不连箭头；不得用红色“禁止边”混作真实通路|

线宽1.5～2px；文字尽量不压线；相反方向的数据流分别画，避免一根双箭头不清输入输出。所有SVG与drawio保留独立文字、形状和连线。JSON记录节点与路由，生成脚本随附。

## 5. 字号与版面

- 字体：Microsoft YaHei为中文与拉丁主字体，Noto Sans SC为浏览回退；SVG、drawio和PPT使用同一文字风格。
- 图表标题29px，主体17～24px，流名14px，注释16～20px。图表为高分辨率导出稿，密集总览配模块或流程局部图，不能把完整长图缩进一页PPT后朗读。
- PPT 16:9，1280×720；封面52px（39磅）、页标题44px（33磅）、正文与副标题32px（24磅）、标签22px（16.5磅）、页脚16px（12磅）。SVG的1px对应PowerPoint的0.75磅。页面左右安全边距96px；正文区从y=252到y=564，高312px。白底无填色底框；双栏页以1px浅灰细线和96～112px列间留白区分。
- 总览页只讲关系，局部放大页讲条件、状态与异常。放大保持相同颜色与ID，并用图号关联原图。

## 6. 可编辑PPT母版

项目专用workspace：`pink-diagram-master_ppt169_20261021`，不写全局模板库。1个Slide Master，5个Layout，每个有独立可编辑占位区与对应SVG原稿。

|版式|用途|槽位|
|---|---|---|
|01封面|图表材料标题与来源|标题、副标题、作者、日期|
|02总览|功能层次或DFD总览|页标题、总览内容、页码|
|03局部放大|单模块／关键分支放大|页标题、局部图、解释栏、页码|
|04双图对照|现状与目标／两个流程比较|页标题、左图、右图、页码|
|05状态与规范|状态表、差异或视觉规则|页标题、表格内容区、页码|

母版PPTX为可审阅的模板文件，不是完整答辩PPT；空内容槽用来插入本次图表。图表需要在PPT继续改文字时，可从drawio编辑后导出SVG，或使用随附SVG在PowerPoint中转换为形状。不能把PNG称为原生可编辑图。

## 7. 交付与状态

每图提供PNG预览、SVG矢量稿、drawio图形源、JSON节点源。状态表提供UTF-8 BOM CSV、Markdown、可筛选HTML；没有新增Word章节或完整答辩稿。PPT母版样张已于2026-10-22由用户选择方案1确认定稿；全部材料待团队非作者复核，不声称验收已通过。
''')

def visual_sample():
    d=Diagram('05_图示视觉规范','V01','图示符号与视觉样张','粉色结构、深色正文；辅助色只表达许可、存储、外部服务和失败。',1400,890)
    items=[('模块／需求',60,155,'action','pale'),('UML判断\n[同意]／[取消]',410,145,'decision','amber'),('外部模型／检索',830,155,'entity','blue'),('D2 主动保存存储',60,390,'store','green'),('待核实／失败反馈',525,390,'action','red')]
    for i,(t,x,y,k,c) in enumerate(items):d.node('s'+str(i),x,y,300 if k!='decision' else 270,120,t,k,c,22)
    d.node('child',60,640,300,80,'关键子功能',fs=22);d.edge('s0','child','包含（无箭头）',[(390,215),(390,680)],style='tree')
    d.node('process',945,640,310,80,'P3 事务保存处理',fs=22);d.edge('s3','process','本人本入口记录',[(450,560),(1100,560)])
    d.note(880,380,410,150,'UML：守卫＋控制流\nDFD：命名数据＋数据流\n两种图不能混用判断和存储语义。',fs=21);d.save()

if __name__=='__main__':
    ROOT.mkdir(parents=True,exist_ok=True)
    hierarchy();swims();dataflows();tables();notes();visual_sample()
    (ROOT/'图表清单.json').write_text(json.dumps(MANIFEST,ensure_ascii=False,indent=2),encoding='utf-8')
    print('Generated',len(MANIFEST),'diagrams')
