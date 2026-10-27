"""Fill the confirmed native template workspace; no synthetic product screenshots."""
from pathlib import Path
import json
import hashlib
import xml.etree.ElementTree as ET
from PIL import Image

BASE = Path(__file__).resolve().parent.parent
WORK = BASE / 'presentation-workspace'
SVG = WORK / 'authoring-svg-flat'
IMAGES = WORK / 'images'
NOTES = WORK / 'notes'
IMAGES.mkdir(exist_ok=True)
NOTES.mkdir(exist_ok=True)
NS = 'http://www.w3.org/2000/svg'
ET.register_namespace('', NS)
def tag(name): return f'{{{NS}}}{name}'

# Cache the imported editable SVGs for repeatable content edits; never inspect native backing.
cache = WORK / 'template-svg-source'
cache.mkdir(exist_ok=True)
for i in range(1, 6):
    original = cache / f'slide_{i:02}.svg'
    if not original.exists(): original.write_bytes((SVG / original.name).read_bytes())
source = {i: (cache / f'slide_{i:02}.svg').read_text(encoding='utf-8') for i in range(1, 6)}
assets = {}
crop_plan = {
    'login-feedback': ('03b-formal-login-form.png', (0, 102, 378, 275)),
    'home-empty': ('12-home-empty.png', (345, 112, 775, 305)),
    'home-failure': ('13-home-error.png', (290, 112, 830, 305)),
    'chat-end': ('11-chat-end-confirmation.png', None),
    'source-unknown': ('15-sources.png', (608, 126, 1077, 291)),
    'emotion-carry': ('16-emotion.png', (589, 109, 929, 275)),
    'training-start': ('17-training.png', (20, 146, 545, 312)),
    'save-consent': ('07-save-confirmation.png', (20, 305, 277, 414)),
    'history-filter': ('08-history-filter-empty.png', (330, 128, 786, 337)),
    'record-keep': ('10-record-clear-confirmation.png', (20, 197, 440, 289)),
}
for name, (filename, rect) in crop_plan.items():
    original = BASE / 'screenshots' / filename
    image = Image.open(original)
    if rect:
        assert rect[0] >= 0 and rect[1] >= 0 and rect[2] <= image.width and rect[3] <= image.height, (name, image.size)
        image = image.crop(rect)
    output = IMAGES / f'{name}.png'
    image.save(output)
    assets[name] = {'source': f'screenshots/{filename}', 'source_sha256': hashlib.sha256(original.read_bytes()).hexdigest(),
                    'crop_xyxy': rect, 'output': f'images/{name}.png', 'size': list(image.size),
                    'processing': '仅裁切真实运行截图；未改写界面内容'}
(BASE / 'PPT截图裁切清单.json').write_text(json.dumps(assets, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def group(root, ident, bounds):
    return ET.SubElement(root, tag('g'), {'id': ident, 'data-pptx-bounds': ' '.join(map(str, bounds))})
def text(parent, x, y, lines, size=32, color='#342B33', bold=False, step=None):
    if isinstance(lines, str): lines = [lines]
    attrs = {'x': str(x), 'y': str(y), 'font-size': str(size), 'fill': color}
    if bold: attrs['font-weight'] = 'bold'
    node = ET.SubElement(parent, tag('text'), attrs)
    node.text = lines[0]
    for line in lines[1:]:
        child = ET.SubElement(node, tag('tspan'), {'x': str(x), 'dy': str(step or size * 1.5)})
        child.text = line
    return node
def set_slot(root, slot_id, value):
    node = root.find(f".//{tag('g')}[@id='{slot_id}']/{tag('text')}")
    assert node is not None, slot_id
    for child in list(node): node.remove(child)
    node.text = value
def prepare(source_slide, title, number):
    root = ET.fromstring(source[source_slide])
    title_id = 'shape-8' if source_slide in (3, 4) else 'shape-6'
    number_id = 'shape-11' if source_slide in (3, 4) else 'shape-8'
    set_slot(root, title_id, title)
    if source_slide != 1:
        set_slot(root, number_id, f'{number:02}')
        # Delete only intended slide-local body placeholders; inherited labels stay native.
        for child in list(root):
            if child.get('data-pptx-source-ref', '').startswith('slide:') and child.get('data-pptx-placeholder-index') in ('1', '2') and child.get('data-ph-type') != 'sldNum':
                root.remove(child)
    return root
def picture(root, key, bounds):
    x, y, width, height = bounds
    g = group(root, f'evidence-{key}', bounds)
    iw, ih = assets[key]['size']
    scale = min(width / iw, height / ih)
    w, h = iw * scale, ih * scale
    ET.SubElement(g, tag('image'), {'href': f'../images/{key}.png', 'x': str(x + (width-w)/2),
        'y': str(y + (height-h)/2), 'width': str(w), 'height': str(h), 'preserveAspectRatio': 'xMidYMid meet'})
def caption(root, value):
    g = group(root, 'evidence-caption', (96, 594, 1088, 38))
    text(g, 96, 622, value, 23, '#71616B')
def statements(root, items):
    for n, (heading, description) in enumerate(items):
        y = 252 + n * 104
        g = group(root, f'overview-{n+1}', (96, y, 1088, 100))
        text(g, 96, y + 38, f'0{n+1}', 40, '#984762')
        text(g, 180, y + 34, heading, 32, bold=True)
        text(g, 180, y + 78, description, 26, '#71616B')
def detail(root, image, lines, cap):
    picture(root, image, (96, 252, 624, 312))
    g = group(root, 'decision-and-recovery', (832, 252, 352, 312))
    for n, line in enumerate(lines): text(g, 832, 292 + n * 98, line, 32)
    caption(root, cap)
def comparison(root, left, right, labels, cap):
    picture(root, left, (96, 252, 496, 230))
    picture(root, right, (688, 252, 496, 230))
    g = group(root, 'left-conclusion', (96, 502, 496, 62))
    text(g, 96, 542, labels[0], 30, bold=True)
    g = group(root, 'right-conclusion', (688, 502, 496, 62))
    text(g, 688, 542, labels[1], 30, bold=True)
    caption(root, cap)

pages = []
def save(root, source_slide, filename, note):
    ET.indent(root, space='  ')
    ET.ElementTree(root).write(SVG / filename, encoding='utf-8', xml_declaration=True)
    pages.append({'source_slide': source_slide, 'svg': filename})
    (NOTES / f'{Path(filename).stem}.md').write_text(note + '\n', encoding='utf-8')

r = prepare(1, '404NOTFOUND', 1)
set_slot(r, 'shape-7', 'UX 交互修订与界面原型初稿')
set_slot(r, 'shape-8', '郭昱祺 · UX / 产品设计')
set_slot(r, 'shape-9', '2026-10-27')
save(r, 1, 'slide_01.svg', '今天展示的是 404NOTFOUND 的 UX 交互修订与界面原型初稿，我负责组件、状态规范和设计交接。接下来会沿用户操作路径说明页面怎样帮助用户理解当前状态，再介绍今天修了什么，以及哪些内容仍需要团队整合。')

r = prepare(2, '个人范围与当前交付层次', 2)
statements(r, [
    ('设计交付：场景、流程、原型与说明', '将用户目标落实到页面、按钮和可恢复的操作状态。'),
    ('本轮重点：组件与交互规范', '提供可运行组件展示、状态证据和答辩材料。'),
    ('团队协作：正式页面装配与业务联调', '独立展示入口使用合成数据，业务接入仍需前端整合。'),
])
caption(r, '个人范围沿用 10 月 23 日确认；组件演示不代表生产系统验收。')
save(r, 2, 'slide_02.svg', '我的完整设计任务包括用户场景与操作流程、原型主稿、说明书对应章节和原型答辩材料。本轮沿用已经确认的组件方案，主要提供组件、状态规范和可检查的设计交接。正式页面装配与业务接口联调仍需要前端负责人整合，所以我会明确区分正式首页的界面修订与独立组件入口的演示结果。')

r = prepare(2, '从用户目标到操作路径', 3)
statements(r, [
    ('倾诉与自助：选择心情 → 聊天草稿', '带入内容需主动确认；进入聊天后仍可编辑、发送或结束。'),
    ('信息查询：输入问题 → 摘要与逐条来源', '展开来源核对时间；空结果与读取失败使用不同恢复路径。'),
    ('主动保存：选择 → 预览 → 确认 → 本人历史', '只有明确确认的片段进入示例历史，打开详情后再决定清除。'),
])
caption(r, '这是操作路径总览；路径与组件展示代码对应，不表示已完成真实后端闭环。')
save(r, 2, 'p03-user-flows.svg', '这页先把页面放回用户目标中看。想倾诉的用户可以先给心情命名，再把自己确认的内容带进聊天草稿；想查资料的用户需要看到摘要和对应来源，而不是只有一句结论。想留下内容的用户则先选片段、核对范围，再确认保存并主动打开历史。我们用这些路径检查入口、反馈和恢复操作是否连贯。')

r = prepare(3, '登录：规则可见，焦点可进可退', 4)
detail(r, 'login-feedback', ['关闭后回到入口', '密码超限明确提示', '断连保持未登录'], '正式首页运行局部 · mock 配置：API 未连接，不模拟登录成功。')
save(r, 3, 'slide_03.svg', '这是当前正式首页认证表单的实际运行局部，不是成功登录的截图。今天把弹窗改为原生模态对话框，检查了初始焦点、键盘操作、Escape 关闭和关闭后的焦点归还。密码按 Unicode 码点做边界反馈，保留原始输入，不用字符截断掩盖超限。右侧的 API 未连接反馈保持访客身份，不能把本地校验通过写成认证成功。')

r = prepare(4, '主页：空记录与读取失败分开', 5)
comparison(r, 'home-empty', 'home-failure', ['空记录：引导开始', '读取失败：提供重试'], 'HP-E / HP-F · 组件固定示例；记录分区状态不阻断其余功能入口。')
save(r, 4, 'slide_04.svg', '首页承担入口分发，同时要让用户读懂最近记录分区的状态。左侧是确认没有记录的空态，提供开始聊天的方向；右侧是读取失败，明确告诉用户失败不代表没有历史，并提供重试。两者使用不同文案和操作，避免把服务问题误讲成用户没有保存过内容。这一页展示的是独立组件入口中的固定示例。')

r = prepare(3, '聊天：结束可取消，超时可核实', 6)
detail(r, 'chat-end', ['取消保留当前草稿', '确认清空当前页', '超时不自动重发'], 'CH-N 结束确认局部 · 安全默认焦点为“继续留在这里”；本页仅模拟会话。')
save(r, 3, 'p06-chat.svg', '聊天既要支持发送，也要考虑用户想退出或网络没有明确结果时怎么办。结束确认现在把焦点放在继续留在这里，按 Escape 会保留草稿，只有明确选择结束才清空当前页的演示消息和草稿。超时则单独提示结果待确认，保留提交快照，不自动重发。这些按钮演示的是本地状态切换，不代表已经执行了服务端取消或模型请求。')

r = prepare(3, '来源展示：让依据和未知都可见', 7)
detail(r, 'source-unknown', ['摘要绑定来源编号', '未知时间保持未知', '标签不等于可信度'], 'SR-N 来源详情局部 · 固定引用关系，未实时抓取或核验原文。')
save(r, 3, 'p07-sources.svg', '信息查询的重点是让用户能够核查，而不是只看到一段看似确定的回答。组件中每条摘要绑定来源编号，点击后可以定位并展开对应来源。发布时间未知时直接写未知，获取时间没有发生时也保持未抓取。时效标签只表达时间限制，不能代替事实核验；这页采用固定示例，不能作为真实检索成功的证据。')

r = prepare(4, '情绪与训练：由用户控制下一步', 8)
comparison(r, 'emotion-carry', 'training-start', ['选定内容带入聊天草稿', '开始、暂停、退出与完成'], 'EC-N / TR-N 局部 · 当前页临时内容；训练按点击推进，无计时、音频或模型。')
save(r, 4, 'p08-emotion-training.svg', '情绪命名卡让用户选择贴近当下的词语，也允许补充描述。带入聊天要由用户主动点击，补充描述还需要单独选择，进入草稿后不会自动发送或保存。训练演示提供开始、暂停、继续、退出和完成的明确状态，重新开始回到第一步。这里的训练按点击推进，不把界面状态当作计时训练或专业判断。')

r = prepare(3, '主动保存：每次范围都要再确认', 9)
detail(r, 'save-consent', ['默认不勾选许可', '只保存确认片段', '保存与 AI 许可分开'], 'SV-N 确认控件局部 · 页面内存演示；完整范围截图随交付资料附上。')
save(r, 3, 'p09-save.svg', '主动保存的操作顺序是先选片段，再预览范围，最后确认。截图放大了确认控件：许可默认不勾选，返回修改后再进入也需要重新确认，而不是沿用上一份范围的许可。今天给标题为空白或超过八十码点的情况补了明确错误提示，用户不必只看一个禁用按钮猜原因。保存许可与 AI 处理许可分开，这里只把确认的片段加入页面内存中的示例历史。')

r = prepare(4, '本人历史：可返回，也可保留', 10)
comparison(r, 'history-filter', 'record-keep', ['无匹配：一键清除筛选', '清除前：默认保留记录'], 'HS-N / RD-N 局部 · 列表只显示元数据；示例清除不代表删除服务器数据。')
save(r, 4, 'p10-history.svg', '本人历史列表先展示标题、类型和时间，用户主动打开后才看正文。今天修正了筛选无匹配时的主操作，让用户一键清除筛选回到全部记录；真正没有记录时才引导去选择保存内容。清除记录先弹出范围确认，并把安全默认操作设为保留记录。取消不会改变正文，确认后的本地移除也不能描述为已经清除服务器或备份数据。')

report = json.loads((BASE / '浏览器验证与截图清单.json').read_text(encoding='utf-8-sig'))
regression = json.loads((BASE / 'regression-day4/验证与截图清单.json').read_text(encoding='utf-8-sig'))
assert report['status'] == regression['status'] == 'passed'
assert len(report['checks']) == 36 and len(regression['checks']) == 77
r = prepare(5, '交互修订：问题、修改与证据', 11)
statements(r, [
    ('表单反馈：规则与错误可见', '密码码点上限／确认密码；标题空白与超限均有明确提示。'),
    ('操作恢复：每个状态有下一步', '无匹配清除筛选；结束默认保留；遮罩关闭后焦点归还。'),
    ('验证证据：36 组新增走查 + 77 组回归', '1440／390／320 px 运行检查；构建及既有 6 项测试通过。'),
])
caption(r, '本地浏览器自查结论 · 认证忙碌态使用拦截响应验证；仍待非作者复核。')
save(r, 5, 'slide_05.svg', '今天把修订整理成可以追踪的问题、改动与证据。表单补了码点边界和可读错误，筛选空态补了返回路径，聊天结束确认采用安全默认焦点。走查还发现点击登录弹窗遮罩后焦点没有回到入口，修复后重新运行通过。本轮新增三十六组浏览器检查，加上保存与历史的七十七组回归，以及既有六项测试和构建通过；这些是本地自查结果，仍需要非作者复核。')

r = prepare(2, '初稿交付与后续整合', 12)
statements(r, [
    ('已准备：交互修订与 12 页 PPT 初稿', '附运行截图、可复现脚本、修订记录和逐页说明。'),
    ('待协作：正式页面装配与业务接口联调', '组件状态展示已可运行；真实会话、来源和记录闭环待整合验收。'),
    ('待评审：非作者走查与本人试讲', '按约 8 分钟组织；根据团队反馈修订讲述顺序和演示截图。'),
])
caption(r, 'Day 5 · 2026-10-27 · 仅汇报有证据的设计与交互成果，不提前宣称整体验收。')
save(r, 2, 'p12-delivery.svg', '这份初稿把用户路径、组件状态和今天的交互修订连成一个可讲述的交付。代码、截图、验证记录和逐页说明可以供团队继续复核。下一步需要前端完成正式页面与业务接口整合，并由非作者走查，再由我按约八分钟试讲调整。当前可以汇报的是有证据的本地设计和交互成果，项目整体运行验收仍以团队最新验证为准。')

(WORK / 'page_plan.json').write_text(json.dumps({'schema': 'ppt-master.roundtrip-page-plan.v1', 'pages': pages}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
sections = []
for i, page in enumerate(pages, 1):
    root = ET.fromstring((SVG / page['svg']).read_text(encoding='utf-8'))
    title_id = 'shape-8' if page['source_slide'] in (3, 4) else 'shape-6'
    title_node = root.find(f".//{tag('g')}[@id='{title_id}']/{tag('text')}")
    title = ''.join(title_node.itertext())
    note = (NOTES / (Path(page['svg']).stem + '.md')).read_text(encoding='utf-8').strip()
    sections.append(f'## {i:02} · {title}\n\n{note}')
(BASE / 'PPT内容与备注.md').write_text('# 12 页 PPT 初稿内容与备注\n\n用户已于 2026-10-27 确认方案 1：完整链路 12 页。按约 8 分钟组织，需本人试讲计时。\n\n' + '\n\n'.join(sections) + '\n', encoding='utf-8')
print(json.dumps({'pages': len(pages), 'notes': len(pages), 'images': len(assets), 'workspace': str(WORK)}, ensure_ascii=False))
