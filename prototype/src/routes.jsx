import { Home, MessageCircle, Search, ShieldCheck, UserRound, Wind } from 'lucide-react';
import { HomePage, CompanionPage, SearchPage, PrivacyPage, EntriesPage } from './pages/Workspace.jsx';
import { ReliefPage, BreathingPage, GuidedPage, TaskPage } from './pages/Exercises.jsx';
import { EmotionPage, CalendarPage, RoomPage, DialoguePage, WorryPage, DestroyPage, ToyPage, BottlePage } from './pages/Tools.jsx';
import { LoginPage, RegisterPage, ProfilePage } from './pages/Account.jsx';

export const NAV = [
  ['home', '首页', Home],
  ['companion', '陪伴交流', MessageCircle],
  ['relief', '压力缓解', Wind],
  ['search', '信息查询', Search],
  ['profile', '个人主页', UserRound],
  ['privacy', '会话与隐私', ShieldCheck],
];

export const ROUTES = Object.freeze({
  home: { title: '首页', nav: 'home', page: HomePage },
  companion: { title: '陪伴交流', nav: 'companion', page: CompanionPage },
  search: { title: '信息查询', nav: 'search', page: SearchPage },
  privacy: { title: '会话与隐私', nav: 'privacy', page: PrivacyPage },
  relief: { title: '压力缓解', nav: 'relief', page: ReliefPage },
  breathing: { title: '呼吸调节', nav: 'relief', page: BreathingPage },
  senses: { title: '五感定向', nav: 'relief', page: GuidedPage },
  pause: { title: '暂停整理', nav: 'relief', page: GuidedPage },
  task: { title: '任务拆分', nav: 'relief', page: TaskPage },
  emotion: { title: '情绪命名', nav: 'home', page: EmotionPage },
  calendar: { title: '情绪日历', nav: 'home', page: CalendarPage },
  room: { title: '担忧具象化', nav: 'home', page: RoomPage },
  dialogue: { title: '对话排练', nav: 'home', page: DialoguePage },
  worry: { title: '担忧暂存', nav: 'home', page: WorryPage },
  destroy: { title: '文本销毁', nav: 'home', page: DestroyPage },
  toy: { title: '弹珠机演示', nav: 'relief', page: ToyPage },
  click: { title: '点击互动演示', nav: 'relief', page: ToyPage },
  bottle: { title: '担忧瓶演示', nav: 'home', page: BottlePage },
  entries: { title: '多入口规划', nav: 'home', page: EntriesPage },
  login: { title: '演示登录', nav: null, page: LoginPage, auth: true },
  register: { title: '演示注册', nav: null, page: RegisterPage, auth: true },
  profile: { title: '个人主页', nav: 'profile', page: ProfilePage },
  pet: { title: '桌宠陪伴', nav: 'home', page: HomePage },
});

export const routeTitle = route => ROUTES[route]?.title || ROUTES.home.title;
export const routeNav = route => ROUTES[route]?.nav || route;
