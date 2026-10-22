const fs=require('fs');
const path=require('path');
const {pathToFileURL}=require('url');
const {chromium}=require('C:/Users/G2395/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve('UX_五项设计交付_v1.2');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--disable-gpu']});
 const page=await browser.newPage({deviceScaleFactor:1});
 let paths=[]; // This revision updates only the five template previews.
 const master=path.join(root,'05_图示视觉规范/pink-diagram-master_ppt169_20261021/templates');
 if(fs.existsSync(master)) paths.push(...fs.readdirSync(master).filter(x=>x.endsWith('.svg')).map(x=>path.relative(root,path.join(master,x))));
 for(const rel of paths){
  const file=path.join(root,rel);
  // Match the skill's concise review prompts; source {{...}} markers stay unchanged.
  const svg=fs.readFileSync(file,'utf8').replace(/\{\{([A-Z][A-Z0-9_]*)\}\}/g,(_,token)=>{
   if(['PAGE_NUM','SLIDE_NUM'].includes(token))return '1';
   if(token.endsWith('_NUM'))return '01';
   if(token==='DATE')return 'YYYY-MM-DD';
   return token.toLowerCase().replace(/_/g,' ').replace(/\b\w/g,s=>s.toUpperCase());
  });
  const vb=svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/); if(!vb)throw new Error('No viewBox '+file);
  await page.setViewportSize({width:Math.ceil(+vb[1]),height:Math.ceil(+vb[2])});
  await page.setContent('<!doctype html><meta charset="utf-8"><style>body{margin:0}svg{display:block}</style>'+svg);await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:file.replace(/\.svg$/,'.png'),fullPage:true,animations:'disabled',timeout:20000});
  console.log('Rendered '+rel);
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
