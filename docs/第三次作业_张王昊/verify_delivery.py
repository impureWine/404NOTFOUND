"""Verify the T01 document package and export its traceability CSV. No deletion."""
from pathlib import Path
import csv
import re
import json

root = Path(__file__).resolve().parent
trace = root / '01_需求设计追踪表.md'
rows = [
    [cell.strip() for cell in line.strip().strip('|').split('|')]
    for line in trace.read_text(encoding='utf-8').splitlines()
    if line.startswith('| REQ')
]
assert len(rows) == 17
assert [row[0] for row in rows] == [f'REQ{i:02}' for i in range(1, 18)]
assert all(len(row) == 9 and all(row) for row in rows)
assert all(f'09号§{i+2}' in row[8] for i, row in enumerate(rows, 1))
spec = (root / '09_全功能接口与限制规范.md').read_text(encoding='utf-8')
assert re.findall(r'^## \d+\. (REQ\d{2}) ', spec, re.M) == [f'REQ{i:02}' for i in range(1,18)]
assert all(term in spec for term in ['sessionGeneration', 'activityGeneration', 'simulation', 'resourceVersion', 'NOT_FOUND', 'RATE_LIMITED', 'PostgreSQL', 'Zod', 'pg', 'Electron'])
assert '无HTTP/Agent/仓储接口' in spec
handoff = (root / '10_三项工程任务与验收交接.md').read_text(encoding='utf-8')
assert all(f'## C0{i} ' in handoff for i in range(1,4))
with (root / '需求设计追踪表.csv').open('w', encoding='utf-8-sig', newline='') as handle:
    writer = csv.writer(handle)
    writer.writerow(['需求', '模块/功能', '类或组件', '应用契约或端侧理由', '数据对象/候选表或不落库理由', '权限规则', '验收方法', '负责人', '设计位置'])
    writer.writerows(rows)

contribution = (root / '05_分工贡献与绩效记录.md').read_text(encoding='utf-8')
percentages = []
members = ['张王昊', '郭昱祺', '程杰', '李泉毅', '程群', '庄剀涵', '关欣', '曾俊涛']
for member in members:
    line = next(line for line in contribution.splitlines() if line.startswith(f'| {member} /'))
    percentages.append(int(re.search(r'\| (\d+)% \|', line).group(1)))
assert sum(percentages) == 100

plan = (root / '04_工作流程与逐周开发计划.md').read_text(encoding='utf-8')
assert all(f'| W{i} ' in plan for i in range(1, 7))
assert all(f'| {member} |' in plan for member in members)
speech = (root / '07_答辩组织与待办清单.md').read_text(encoding='utf-8')
speech_rows = speech.split('| 合计 |', 1)[0]
assert sum(int(n) for n in re.findall(r'^\| [^|]+ \| (\d+) \|', speech_rows, re.M)) == 480

local_link_count = 0
json_example_count = 0
for file in root.glob('*.md'):
    source = file.read_text(encoding='utf-8')
    for block in re.findall(r'```json\s*\n(.*?)\n```', source, re.S):
        json.loads(block)
        json_example_count += 1
    table = []
    for line in source.splitlines() + ['']:
        if line.startswith('|'):
            table.append(line)
        elif table:
            counts = [len(row.strip().strip('|').split('|')) for row in table]
            assert len(set(counts)) == 1, f'Inconsistent table in {file.name}'
            table = []
    for target in re.findall(r'\]\(([^)]+)\)', source):
        if target.startswith(('https://', 'http://', '#')):
            continue
        relative = target.split('#', 1)[0]
        if relative != '08_自查结果.md':
            assert (file.parent / relative).is_file(), f'Missing link in {file.name}: {target}'
        local_link_count += 1

report = f'''# T01材料自查结果

检查日期：2026-10-19；检查方式：本目录verify_delivery.py静态结构检查。

| 检查项 | 结果 | 范围/限制 |
|---|---|---|
| 需求编号 | 通过：REQ01～REQ17共17行，无重号/缺号 | 设计追踪覆盖，不等于功能通过 |
| 追踪字段 | 通过：每行9列均非空 | 包含模块、类/组件、契约、数据、权限、AT、负责人及位置；语义仍需专业复核 |
| 计划贡献 | 通过：8人，合计{sum(percentages)}% | 实际贡献待证据核定 |
| 周计划 | 通过：W1～W6；八人逐周职责齐备 | 10月19日至11月29日，未核定实际工时 |
| 演讲预算 | 通过：各段合计480秒 | 尚未试讲，非实际用时 |
| 本地Markdown文件链接 | 通过：{local_link_count}个目标存在 | 未验证线上链接、发布权限和Markdown锚点 |
| CSV导出 | 已生成17行，与Markdown同源 | UTF-8 BOM，仅作表格筛选用 |
| 全功能接口 | 通过：09号REQ01～17逐项章节，追踪均关联；含双代次/排练与物件字段/错误映射 | 检查覆盖与关键术语，不证明端点实现或Schema通过 |
| 三项工程任务 | 通过：10号C01/C02/C03齐备 | 负责人/节点/验收设计已写，编码和运行取证未执行 |
| 表格及JSON示例 | 通过：表格列数一致，{json_example_count}个JSON示例可解析 | 仅语法验证，未运行Zod或真实API |

## 材料审查与未完成事项

用户指定JS、LangChain JS和Agent接应用层API；其余React/Vite、Express、PostgreSQL/pg、Zod、Electron方案已按授权采纳，设计材料已同步。没有宣称已部署或建表。09号细化17项HTTP/端侧接口、输入/输出、鉴权、错误/任务状态、幂等、时限/限额和并发；10号给出三项任务及验收。文字销毁保持端侧独立；临时与主动保存、账号与入口隔离规则保留。

修订关联：旧说明书密码8～128、端侧仓储方向及原型500字等保留历史版本，由专业负责人按03号v1.2和09号更新专业新版/实现。双代次和排练/物件条件字段已在本包规范补齐；新增业务错误为NOT_FOUND/RATE_LIMITED，取消/超时归任务状态。结构检查不替代语义/安全/业务评审。

课程原帖通过agent-reach的Jina阅读后端访问未成功，web工具直接访问亦失败，搜索未取得目标帖子内容；未借用往年帖子要求。正式DDL、课程班级表和最新通知待张王昊核验。LangChain官方JS模型及Agent文档已通过web工具读取，参考链接在03号与06号文件。

未执行：模型真实调用、应用API/数据库运行、AT-01～17、团队签认、真实评审闭环、两轮试讲、commit/push、仓库发布、博客链接访问验收。本轮没有修改现有原型代码，也没有替代其他成员的专业稿。

原工作区未执行远程提交；本目录作为GitHub设计交付材料；commit/push仍须本人实际完成后登记。没有删除文件。

重新检查并更新CSV/本报告：在本目录运行 `python verify_delivery.py`。
'''
(root / '08_自查结果.md').write_text(report, encoding='utf-8')
assert (root / '08_自查结果.md').is_file()
print(f'PASS: 17 requirements and interface sections, 3 engineering tasks, contribution=100%, 6 weeks, speech=480s, {local_link_count} local links. CSV and report written.')
