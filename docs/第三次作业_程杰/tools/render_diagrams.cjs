const fs = require('fs');
const path = require('path');
const deps = process.env.CODEX_DEPENDENCIES || 'C:/Users/29575/.cache/codex-runtimes/codex-primary-runtime/dependencies';
const { instance } = require(path.join(deps, 'node/node_modules/@viz-js/viz/dist/viz.cjs'));
const sharp = require(path.join(deps, 'node/node_modules/sharp'));
const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'figures');
fs.mkdirSync(dir,{recursive:true});
const header = `digraph G {
graph [bgcolor="white", pad="0.30", nodesep="0.48", ranksep="0.70", fontname="Microsoft YaHei", fontsize=17, splines=spline];
node [shape=box, style="rounded,filled", fillcolor="#edf3fa", color="#50657f", fontname="Microsoft YaHei", fontsize=16, margin="0.16,0.12", penwidth=1.2];
edge [fontname="Microsoft YaHei", fontsize=13, color="#50657f", arrowsize=0.75];
`;
const graphs = {
F01_components: header + `
rankdir=TB;
shell [label="普通业务入口\nAppShell / Router"];
pages [label="业务页面\n账号 陪伴 记录 查询 排练"];
ui [label="公共交互组件\n表单 弹窗 来源与状态"];
mode [label="模式与任务协调\nModeController / TaskCoordinator"];
stores [label="内存状态\n身份 会话 记录缓存"];
local [label="端侧活动控制\n训练 敲击 弹珠 资源释放"];
api [label="同源接口适配\nApiClient + 共享Zod契约"];
server [label="应用API\n认证 授权 任务 数据",fillcolor="#e1e9f1"];
resources [label="本地资源\n物理 音频 动画"];
bridge [label="Electron适配\n白名单preload桥"];
destroy [label="独立销毁入口\nTextDestructionView\n私有buffer与本地效果", fillcolor="#fff2e5",color="#946a3c"];
rule [label="不连接账号 聊天 API\n模型 存储 日志 遥测",shape=note,fillcolor="#fffaf3",color="#946a3c"];
{rank=same; pages;ui;destroy;}
{rank=same; mode;stores;local;}
{rank=same; api;resources;bridge;}
shell -> pages; pages -> ui; pages -> mode; pages -> stores; pages -> local;
mode -> stores; mode -> api; stores -> api; local -> resources; pages -> bridge;
api -> server;
destroy -> rule [style=dashed,arrowhead=none,color="#946a3c"];
}
`,
F02_local_states: header + `
rankdir=TB;
ready [label="ready 开始前\n零推进 零自动发声"];
running [label="running 进行中\n训练或本地模拟推进",fillcolor="#e4f0e9"];
paused [label="paused 已暂停\n冻结进度 停止声音",fillcolor="#fff2df"];
complete [label="completed 已完成\n仅训练达到结束条件"];
exited [label="exited 已退出\n清进度 循环 监听 捕获 音频",fillcolor="#e5e9ee"];
{rank=same; running;paused;}
ready -> running [label="用户开始"];
running -> paused [label="暂停 隐藏 收起"];
paused -> running [label="用户继续"];
paused -> ready [label="重置"];
running -> complete [label="训练结束"];
complete -> ready [label="再来一轮"];
running -> exited [label="退出或失去条件"];
paused -> exited [label="退出"];
exited -> ready [label="主动重新进入"];
}
`,
F04_rehearsal: header + `
rankdir=TB;
ready [label="ready 场景设置\nsimulation + AI模拟说明"];
run [label="running 角色模拟",fillcolor="#e4f0e9"];
pause [label="paused 已暂停\n旧回复失效",fillcolor="#fff2df"];
review [label="reviewing 选择本人表达\n停止角色 保留本轮本人消息"];
preview [label="整理稿预览\n只用选中表达 可编辑"];
saved [label="主动保存\nREHEARSAL_DRAFT + SAVE"];
end [label="ended 结束会话\n正文 选择 任务 临时许可清空",fillcolor="#e5e9ee"];
{rank=same;run;pause;}
ready -> run [label="开始并获许可"];
run -> pause [label="PAUSE"];
pause -> run [label="RESUME 不重放"];
run -> ready [label="RESTART 新活动",constraint=false];
pause -> ready [label="RESTART",constraint=false];
run -> review [label="FINISH_REHEARSAL"];
pause -> review [label="FINISH_REHEARSAL"];
review -> preview [label="选ID + SUMMARIZE"];
preview -> saved [label="确认并获SAVE"];
review -> end [label="END"];
saved -> end [label="END"];
run -> end [label="END",constraint=false];
}
`,
F05_destroy: header + `
rankdir=TB;
empty [label="EMPTY 空输入\n独立本地入口"];
editing [label="EDITING 临时输入\n私有buffer 最多4000码点",fillcolor="#fff2e5"];
anim [label="ANIMATING 销毁效果\nSHRED / BURN / BLACK_HOLE",fillcolor="#fff2e5"];
clear [label="clearOwnedContent\n清buffer DOM 纹理 粒子引用\n取消帧 监听 与原文闭包",fillcolor="#e4f0e9"];
cleared [label="CLEARED 内容已清空\n无记录 无恢复 无外发"];
closed [label="CLOSED 已离开\n不自动恢复正文",fillcolor="#e5e9ee"];
empty -> editing [label="用户输入"];
editing -> anim [label="选择效果并完成"];
anim -> clear [label="完成 跳过 异常"];
editing -> clear [label="关闭 切页 直接清空"];
clear -> cleared [label="仍在页面"];
clear -> closed [label="离开或关闭"];
cleared -> editing [label="再次输入",constraint=false];
}
`,
F07_electron: header + `
rankdir=TB;
react [label="React渲染层\n宠物 快捷面板 任务状态"];
preload [label="preload白名单\nmove / alwaysOnTop / clickThrough\nclose / getCapabilities"];
main [label="Electron主进程\n验调用窗口与参数 管窗口与退出"];
window [label="Windows原生能力验证\n透明 置顶 拖动 穿透\n缩放 多屏 退出"];
safe [label="安全配置\ncontextIsolation与sandbox开启\nnodeIntegration关闭",shape=note,fillcolor="#fff2e5"];
scope [label="验证工程只用合成数据\n真实DESKTOP认证另行冻结\n未实测不标AVAILABLE",shape=note,fillcolor="#fff2e5"];
react -> preload [label="仅有限窗口方法"];
preload -> main [label="白名单IPC"];
main -> window [label="工作区与生命周期约束"];
safe -> preload [style=dashed,arrowhead=none];
scope -> window [style=dashed,arrowhead=none];
{rank=same;preload;safe;}
{rank=same;window;scope;}
}
`
};
const sequences = {
F03_task_sequence: {
  title:'外部任务暂停与取消时序',
  actors:[['User','用户'],['UI','前端与协调器'],['API','应用 API'],['Model','外部模型']],
  messages:[
    [0,1,'选择本次处理范围'],[1,2,'创建会话并确认用途'],[2,1,'会话标识 双代次 许可'],
    [1,2,'POST tasks 含requestId'],[2,1,'202 pending'],[2,3,'受限模型调用'],
    [1,2,'按间隔轮询 最多一个在途'],[0,1,'暂停或切换活动'],
    [1,1,'立即失效旧接收资格 停轮询'],[1,2,'PAUSE 或 switch 并申请取消'],
    [2,2,'更新代次 撤销旧结果读取'],[2,1,'返回实际状态和新代次'],
    [3,2,'供应商可能迟到返回'],[2,2,'失效结果不返回正文'],[1,1,'旧回调与身份代次不符则丢弃']
  ]
},
F06_record_sequence: {
  title:'主动保存与确认清除时序',
  actors:[['User','用户'],['UI','前端'],['API','应用 API'],['DB','PostgreSQL']],
  messages:[
    [0,1,'选择保存并确认范围'],[1,2,'POST consents 用途SAVE'],[2,1,'consentId 绑定载荷'],
    [1,2,'POST records 同载荷与requestId'],[2,3,'记录 授权 幂等元数据同事务'],[3,2,'提交成功'],[2,1,'201 Record 与版本'],
    [0,1,'选择清除某条记录'],[1,2,'clear-confirmations 含版本'],[2,1,'确认ID 范围 2分钟有效'],
    [1,0,'展示对象与范围 可取消'],[0,1,'明确确认 取消则不发请求'],
    [1,2,'clear 含确认ID 版本 true'],[2,3,'事务清主从数据与关联'],[2,1,'200 cleared 后失效缓存']
  ]
}
};
const esc = s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function sequenceSvg(s){
 const width=1320, height=195+s.messages.length*55;
 const xs=[110,460,810,1160];
 const out=[`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="white"/><defs><marker id="arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0,0 L10,4 L0,8 Z" fill="#455d77"/></marker></defs><style>text{font-family:'Microsoft YaHei',sans-serif;fill:#172a3f} .msg{font-size:22px}</style><text x="660" y="42" font-size="30" text-anchor="middle">${esc(s.title)}</text>`];
 for(let a=0;a<4;a++) out.push(`<rect x="${xs[a]-100}" y="70" width="200" height="52" rx="8" fill="#edf3fa" stroke="#50657f"/><text x="${xs[a]}" y="103" text-anchor="middle" font-size="22">${esc(s.actors[a][1])}</text><line x1="${xs[a]}" x2="${xs[a]}" y1="122" y2="${height-25}" stroke="#a2afbc" stroke-dasharray="6 6"/>`);
 s.messages.forEach(([from,to,label],i)=>{
   const y=170+i*55, x1=xs[from],x2=xs[to];
   if(from===to){
     const right=from===3?-135:135;
     out.push(`<path d="M${x1},${y} h${right} v22 h${-right}" fill="none" stroke="#455d77" stroke-width="2" marker-end="url(#arrow)"/><text class="msg" x="${x1+(right>0?12:-12)}" y="${y-10}" text-anchor="${right>0?'start':'end'}">${i+1} ${esc(label)}</text>`);
   }else{
     out.push(`<line x1="${x1}" x2="${x2}" y1="${y}" y2="${y}" stroke="#455d77" stroke-width="2" marker-end="url(#arrow)"/><text class="msg" x="${(x1+x2)/2}" y="${y-12}" text-anchor="middle">${i+1} ${esc(label)}</text>`);
   }
 });
 out.push('</svg>'); return out.join('\n');
}
function localStateSvg(){
 const out=[`<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="760" viewBox="0 0 1120 760"><rect width="100%" height="100%" fill="white"/><defs><marker id="a" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0 0 L10 4 L0 8Z" fill="#50657f"/></marker></defs><style>text{font-family:'Microsoft YaHei',sans-serif;fill:#172a3f}.event{font-size:19px}</style>`];
 const edge=(d,label,x,y)=>out.push(`<path d="${d}" fill="none" stroke="#50657f" stroke-width="2" marker-end="url(#a)"/><text class="event" x="${x}" y="${y}" text-anchor="middle">${label}</text>`);
 edge('M550 130 V210 H245 V320','START',385,198);
 edge('M420 365 H700','PAUSE',560,351);
 edge('M700 410 H420','RESUME',560,440);
 edge('M875 320 V80 H700','RESET',910,205);
 edge('M245 430 V590','COMPLETE',305,520);
 edge('M245 430 V500 H875 V590','STOP',560,488);
 edge('M875 430 V590','STOP',910,530);
 edge('M70 645 H30 V80 H400','RESET',72,232);
 edge('M1050 645 H1090 V15 H550 V30','REOPEN',1010,40);
 const box=(x,y,w,h,fill,lines)=>{
   out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${fill}" stroke="#50657f" stroke-width="2"/>`);
   const start=y+h/2-(lines.length-1)*17;
   lines.forEach((line,i)=>out.push(`<text x="${x+w/2}" y="${start+i*34+8}" font-size="24" text-anchor="middle">${esc(line)}</text>`));
 };
 box(400,30,300,100,'#edf3fa',['ready 开始前','零推进 零自动发声']);
 box(70,320,350,110,'#e4f0e9',['running 进行中','训练或本地模拟推进']);
 box(700,320,350,110,'#fff2df',['paused 已暂停','冻结进度 停止声音']);
 box(70,590,350,110,'#edf3fa',['completed 已完成','仅训练达到结束条件']);
 box(700,590,350,110,'#e5e9ee',['exited 已退出','清进度 循环与监听','释放捕获与音频']);
 out.push('</svg>');return out.join('\n');
}
(async()=>{
 const viz=await instance();
 for(const [name,sourceDot] of Object.entries(graphs)){
   // Graphviz WASM does not reliably measure Windows CJK fonts. Provide
   // minimum node geometry using the displayed label rather than its fallback metrics.
   let dot=sourceDot.replace(/^(\w+) \[label="([^"]*)"/gm,(match,id,label)=>{
     const lines=label.split(/\\n|\n/);
     const units=Math.max(...lines.map(line=>Array.from(line).reduce((n,c)=>n+(/[\u2e80-\uffff]/.test(c)?1:0.59),0)));
     return `${id} [width="${((units*16+38)/72).toFixed(2)}",height="${((lines.length*23+24)/72).toFixed(2)}",label="${label}"`;
   });
   const replacements={
     F02_local_states:{'用户开始':'START','暂停 隐藏 收起':'PAUSE','用户继续':'RESUME','重置':'RESET','训练结束':'COMPLETE','再来一轮':'RESET','退出或失去条件':'STOP','退出':'STOP','主动重新进入':'REOPEN'},
     F04_rehearsal:{'开始并获许可':'START','RESUME 不重放':'RESUME','RESTART 新活动':'RESTART','选ID + SUMMARIZE':'SUMMARIZE','确认并获SAVE':'SAVE'},
     F05_destroy:{'用户输入':'INPUT','选择效果并完成':'DESTROY','完成 跳过 异常':'DONE / SKIP / ERROR','关闭 切页 直接清空':'CLEAR / LEAVE','仍在页面':'STAY','离开或关闭':'CLOSE','再次输入':'INPUT'}
   };
   for(const [before,after] of Object.entries(replacements[name]||{})) dot=dot.replaceAll(`label="${before}"`,`label="${after}"`);
   if(name==='F04_rehearsal') dot=dot.replace('run -> ready [label="RESTART",constraint=false];','').replace('run -> end [label="END",constraint=false];','');
   fs.writeFileSync(path.join(dir,name+'.dot'),dot,'utf8');
   const svg=name==='F02_local_states'?localStateSvg():viz.renderString(dot,{format:'svg',engine:'dot'});
   fs.writeFileSync(path.join(dir,name+'.svg'),svg,'utf8');
   await sharp(Buffer.from(svg),{density:180}).png().toFile(path.join(dir,name+'.png'));
 }
 for(const [name,spec] of Object.entries(sequences)){
   let mmd='sequenceDiagram\n';
   spec.actors.forEach(([id,label])=>mmd+=`    participant ${id} as ${label}\n`);
   spec.messages.forEach(([from,to,label])=>mmd+=`    ${spec.actors[from][0]}->>${spec.actors[to][0]}: ${label}\n`);
   fs.writeFileSync(path.join(dir,name+'.mmd'),mmd,'utf8');
   const svg=sequenceSvg(spec);
   fs.writeFileSync(path.join(dir,name+'.svg'),svg,'utf8');
   await sharp(Buffer.from(svg)).png().toFile(path.join(dir,name+'.png'));
 }
 console.log(JSON.stringify({diagrams:Object.keys(graphs).length+Object.keys(sequences).length,formats:['source','svg','png']}));
})().catch(e=>{console.error(e);process.exit(1)});
