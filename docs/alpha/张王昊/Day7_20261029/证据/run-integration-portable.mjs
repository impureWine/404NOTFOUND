// 仅枚举测试文件并运行；不删除或修改项目文件。
import {readdir} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const backend=path.resolve(process.argv[2]??'backend');
async function walk(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())out.push(...await walk(p));else if(e.name.endsWith('.test.js'))out.push(p);}return out;}
const files=(await walk(path.join(backend,'test/integration'))).sort();
if(files.length===0)throw Error('No integration test files found');
const run=spawnSync(process.execPath,['--test','--test-reporter=tap',...files],{cwd:backend,stdio:'inherit'});
if(run.error)throw run.error;process.exitCode=run.status??1;
