import React from 'react';
import { ArrowRight, CalendarDays, ChevronRight, MessageCircle } from 'lucide-react';
import { ToolsSection } from './SiteChrome.jsx';
import './workspace-directories.css';

const personalGroups = [
  { title: '日常记录', entries: [['calendar'], ['notes'], ['records'], ['query-records']] },
  { title: '整理与账户', entries: [['worry'], ['deposit'], ['rehearsal-records'], ['settings']] },
];

const activityGroups = [
  {
    title: '引导练习',
    entries: [
      ['breathing', '按提示调整吸气和呼气的节奏。'],
      ['training', '用五感留意此刻周围的事物。'],
      ['pause-organize', '停一停，逐步梳理眼下的感受和想法。'],
      ['task-splitting', '把一件难开始的事拆成小步骤。'],
    ],
  },
  {
    title: '互动小游戏',
    entries: [
      ['pressure', '点击画布，看裂纹和回弹逐渐消失。'],
      ['private-text', '写下想放下的话，再选择如何销毁。'],
      ['marbles', '让弹珠沿轨道落下，听它们碰出旋律。'],
    ],
  },
];

function DirectoryGroups({ groups, titles }) {
  return <div className="workspace-directory-groups">
    {groups.map(({ title, entries }) => <div className="workspace-directory-group" key={title}>
      <h3>{title}</h3>
      <ul>
        {entries.map(([route, description]) => <li key={route}>
          <a className="workspace-directory-link" href={`#${route}`}>
            <span><strong>{titles[route]}</strong>{description && <small>{description}</small>}</span>
            <ChevronRight size={17} aria-hidden="true" />
          </a>
        </li>)}
      </ul>
    </div>)}
  </div>;
}

export function HomeOverview({ titles, onNavigate }) {
  return <>
    <section className="workspace-welcome" aria-labelledby="workspace-welcome-title">
      <div>
        <h2 id="workspace-welcome-title">先和自己待一会儿，<br />再决定下一步。</h2>
        <p>想说的话可以从陪伴交流开始，也可以在情绪日历记下一笔。登录后可查看和保存个人记录。</p>
      </div>
      <div className="workspace-welcome-actions">
        <a className="workspace-start-action" href="#companion">
          <MessageCircle size={18} aria-hidden="true" /><span>开始陪伴交流</span><ArrowRight size={17} aria-hidden="true" />
        </a>
        <a className="workspace-calendar-action" href="#calendar">
          <CalendarDays size={18} aria-hidden="true" /><span>打开情绪日历</span><ChevronRight size={17} aria-hidden="true" />
        </a>
      </div>
    </section>
    <ToolsSection onNavigate={onNavigate} />
    <section className="workspace-directory" aria-labelledby="workspace-personal-title">
      <h2 id="workspace-personal-title">我的内容</h2>
      <DirectoryGroups groups={personalGroups} titles={titles} />
    </section>
  </>;
}

export function ActivityDirectory({ titles }) {
  return <section id="games" className="workspace-directory workspace-activities" aria-labelledby="workspace-activities-title">
    <h2 id="workspace-activities-title">{titles.games}</h2>
    <p>练习与小游戏在本机运行。练习由你开始或暂停，离开页面时停止。</p>
    <DirectoryGroups groups={activityGroups} titles={titles} />
  </section>;
}
