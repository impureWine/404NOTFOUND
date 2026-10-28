"""Update only the four pages confirmed for Day 6 in an imported round-trip workspace."""
import argparse
import hashlib
import json
from pathlib import Path

DAY = Path(__file__).resolve().parents[1]
CHANGES = {
    1: {
        'UX 交互修订与界面原型初稿': 'UX 界面原型答辩 · 可编辑稿 v0.2',
        '2026-10-27': '2026-10-28',
    },
    2: {
        '本轮重点：组件与交互规范': '本轮：可编辑稿与演示素材',
        '提供可运行组件展示、状态证据和答辩材料。': '附截图、组件演示及脚本；约 8 分钟讲解。',
        '个人范围沿用 10 月 23 日确认；组件演示不代表生产系统验收。': '个人负责组件与规范；合成数据演示不代表生产验收。',
    },
    11: {
        '交互修订：问题、修改与证据': '最新复核：通过项与未通过项',
        '表单反馈：规则与错误可见': '复核：后端 120／120',
        '密码码点上限／确认密码；标题空白与超限均有明确提示。': '10 月 27 日 @34d751c；API 6／6，双入口构建通过。',
        '操作恢复：每个状态有下一步': '未通过：正文／模型授权',
        '无匹配清除筛选；结束默认保留；遮罩关闭后焦点归还。': '跨层探针 11／13；正式保存／历史闭环仍未通过。',
        '验证证据：36 组新增走查 + 77 组回归': '今日数据：隔离验证 49／49',
        '1440／390／320 px 运行检查；构建及既有 6 项测试通过。': 'PGlite 恢复守卫已自测；真实来源请求失败，未验收。',
        '本地浏览器自查结论 · 认证忙碌态使用拦截响应验证；仍待非作者复核。': '不同基线分别报告；UX 昨日 113 组未获独立复跑，发布仍阻塞。',
    },
    12: {
        '初稿交付与后续整合': '交付边界与现场演示预案',
        '已准备：交互修订与 12 页 PPT 初稿': '已实现：组件演示与本地交互',
        '附运行截图、可复现脚本、修订记录和逐页说明。': '文字可编辑；附高清截图、演示包及操作脚本。',
        '待协作：正式页面装配与业务接口联调': '原型：聊天、来源与保存／历史',
        '组件状态展示已可运行；真实会话、来源和记录闭环待整合验收。': '采用合成／内存数据；刷新重置，未连接真实业务服务。',
        '待评审：非作者走查与本人试讲': '未通过：业务闭环与发布',
        '按约 8 分钟组织；根据团队反馈修订讲述顺序和演示截图。': '断网切换截图；真实来源、正式数据库与本人试讲待完成。',
        'Day 5 · 2026-10-27 · 仅汇报有证据的设计与交互成果，不提前宣称整体验收。': 'Day 6 · 2026-10-28 · 已实现／原型／未通过分别说明；发布结论仍为阻塞。',
    },
}
NOTES = {
    1: '今天展示的是 404NOTFOUND 的 UX 界面原型答辩可编辑稿，我负责组件、交互规范和设计交接。接下来沿用户路径介绍页面与状态，再说明最新复核结果、交付范围和现场演示预案。',
    2: '我的设计任务包括用户场景与操作流程、原型主稿、说明书对应章节和答辩材料，本轮继续采用已确认的组件方案。今天交付十二页可编辑稿、高清截图、可点击组件演示包及操作脚本，按约八分钟组织。正式页面装配与业务接口联调仍由团队协作完成，组件演示使用合成数据。',
    11: '这里分别引用不同执行者的报告，不合算总通过率。测试岗在十月二十七日对主线三四d七五一c复核，后端一百二十项、前端适配器六项和双入口构建通过，但跨层探针只通过十三项中的十一项，历史正文不可读和内部模型授权绕过仍未通过。测试岗没有独立复跑 UX 昨日的一百一十三组检查。今日数据岗在 PGlite 隔离环境完成四十九项迁移、隔离和恢复检查，但恢复守卫不等于正式删除日志重放，真实 Wikipedia 请求失败且未取得来源，发布仍阻塞。',
    12: '已实现的个人成果是可运行组件和本地交互，以及这份文字与备注可编辑的 PPT。聊天、来源和保存历史仍是合成或内存数据演示，刷新后重置，不能当作正式业务闭环已经通过。演示用本地包，启动失败时切换备用截图，实网来源失败就如实展示失败状态。正式数据库验证、未关闭项复核和本人约八分钟试讲仍待完成。',
}

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('workspace', type=Path)
    args = parser.parse_args()
    workspace = args.workspace.resolve()
    root = workspace / 'authoring-svg-flat'
    before = {i: digest(root / f'slide_{i:02}.svg') for i in range(1, 13)}
    for number, replacements in CHANGES.items():
        target = root / f'slide_{number:02}.svg'
        svg = target.read_text(encoding='utf-8')
        for old, new in replacements.items():
            if svg.count(old) != 1:
                raise ValueError(f'Expected one occurrence on page {number}: {old}')
            svg = svg.replace(old, new)
        target.write_text(svg, encoding='utf-8')
        (workspace / 'notes' / f'slide_{number:02}.md').write_text(NOTES[number] + '\n', encoding='utf-8')
    roster = []
    for i in range(1, 13):
        after = digest(root / f'slide_{i:02}.svg')
        if i not in CHANGES and after != before[i]:
            raise AssertionError('A referenced page changed')
        roster.append({'output_page': i, 'source_slide': i, 'action': 'edited' if i in CHANGES else 'referenced',
                       'before_sha256': before[i], 'after_sha256': after})
    (DAY / 'PPT页序与编辑校验.json').write_text(json.dumps(roster, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Edited 1, 2, 11, 12; SVG 3–10 hashes unchanged; notes changed only for the four planned pages.')

if __name__ == '__main__':
    main()
