import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { apiClient } from '../api/client.js';
import { id } from './business.js';
const avatarLabels = {
  DEFAULT: '默认头像',
  CALM_BLUE: '静谧蓝',
  WARM_ORANGE: '暖橙',
  FOREST_GREEN: '森林绿',
};

const recordDestinations = {
  CONVERSATION: ['陪伴记录', 'records'],
  EMOTION: ['情绪日历', 'calendar'],
  WORRY_OBJECT: ['烦恼物件', 'worry'],
  REHEARSAL_DRAFT: ['排练表达', 'rehearsal-records'],
  DEPOSIT: ['烦恼寄存', 'deposit'],
  QUERY: ['查询记录', 'query-records'],
};

const entryLabels = { WEB: '网页', DESKTOP: '桌宠', WECHAT: '微信' };
export function Settings({ onLogout }) {
  const [profile, setProfile] = useState(null), [prefs, setPrefs] = useState(null), [summary, setSummary] = useState(null), [capabilities, setCapabilities] = useState(null);
  const [password, setPassword] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' }), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const lock = useRef(false), alive = useRef(true);
  useEffect(() => { const controller = new AbortController(); alive.current = true;
    Promise.all([apiClient.getProfile({ signal: controller.signal }), apiClient.getPreferences({ signal: controller.signal }), apiClient.getSummary({ signal: controller.signal }), apiClient.getCapabilities({ signal: controller.signal })]).then(([a,b,c,d]) => { if (!controller.signal.aborted) { setProfile(a); setPrefs(b); setSummary(c); setCapabilities(d); } }).catch(value => { if (!controller.signal.aborted) setError(value.message); });
    return () => { alive.current = false; controller.abort(); }; }, []);
  const action = async callback => { if (lock.current) return; lock.current = true; setBusy(true); setError(''); setNotice(''); try { await callback(); if (alive.current) setNotice('服务端已确认更新。'); } catch (value) { if (alive.current) setError(value.message); } finally { lock.current = false; if (alive.current) setBusy(false); } };
  function saveProfile(event) {
    event.preventDefault();
    action(async () => {
      const result = await apiClient.updateProfile({
        requestId: id(), expectedVersion: profile.version,
        nickname: profile.nickname.trim(), bio: profile.bio.trim(), avatarKey: profile.avatarKey,
      });
      if (alive.current) setProfile(result);
    });
  }

  function savePreference(event) {
    const offerHistorySave = event.target.checked;
    action(async () => {
      const result = await apiClient.updatePreferences({ requestId: id(), expectedVersion: prefs.version, offerHistorySave });
      if (alive.current) setPrefs(result);
    });
  }

  function savePassword(event) {
    event.preventDefault();
    action(async () => {
      await apiClient.changePassword(password);
      setPassword({ currentPassword: '', newPassword: '', confirmPassword: '' });
      await onLogout();
    });
  }

  return <section className="live-records workspace-tool workspace-settings" aria-busy={busy}>
    <header className="workspace-tool-heading">
      <h2>个人主页与隐私设置</h2>
      <p>编辑个人资料、管理保存偏好和登录密码。</p>
    </header>
    {error && <p className="workspace-tool-feedback" role="alert">{error}</p>}
    {notice && <p className="workspace-tool-feedback" role="status">{notice}</p>}
    {!profile && !error && <p className="workspace-tool-feedback" role="status">正在读取账户设置…</p>}

    <div className="workspace-tool-columns">
      <div className="workspace-settings-stack">
        <form className="workspace-tool-panel" onSubmit={saveProfile}>
          <h3>个人资料</h3>
          {profile ? <fieldset className="workspace-tool-fields" disabled={busy}>
            <div className="workspace-tool-field-grid">
              <label>昵称<input required maxLength={32} value={profile.nickname} onChange={event => setProfile(current => ({ ...current, nickname: event.target.value }))} /></label>
              <label>头像<select value={profile.avatarKey} onChange={event => setProfile(current => ({ ...current, avatarKey: event.target.value }))}>
                {Object.entries(avatarLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select></label>
            </div>
            <label>简介<textarea maxLength={200} value={profile.bio} onChange={event => setProfile(current => ({ ...current, bio: event.target.value }))} /></label>
            <div className="workspace-tool-actions"><button className="workspace-tool-primary" type="submit">保存资料</button></div>
          </fieldset> : <p className="workspace-tool-note">{error ? '暂时无法读取个人资料。' : '正在读取个人资料…'}</p>}
        </form>
        <form className="workspace-tool-panel workspace-settings-password" onSubmit={savePassword}>
          <h3>修改密码</h3>
          <p id="settings-password-note" className="workspace-tool-note">修改成功后，已有登录会话会撤销。新密码须为 12–128 个字符。</p>
          <fieldset className="workspace-tool-fields" disabled={busy}>
            <div className="workspace-tool-field-grid">
              {Object.entries({ currentPassword: '当前密码', newPassword: '新密码', confirmPassword: '确认新密码' }).map(([key, label]) => <label key={key}>
                {label}<input type="password" autoComplete={key === 'currentPassword' ? 'current-password' : 'new-password'}
                  required minLength={key === 'currentPassword' ? 1 : 12} maxLength={128} value={password[key]}
                  aria-describedby={key === 'newPassword' ? 'settings-password-note' : undefined}
                  onChange={event => setPassword(current => ({ ...current, [key]: event.target.value }))} />
              </label>)}
            </div>
            <div className="workspace-tool-actions"><button type="submit">确认修改密码</button></div>
          </fieldset>
        </form>
      </div>

      <div className="workspace-settings-stack">
        <section className="workspace-tool-panel" aria-labelledby="settings-privacy-title">
          <h3 id="settings-privacy-title">隐私偏好</h3>
          {prefs && <label className="workspace-settings-preference">
            <input type="checkbox" disabled={busy} checked={prefs.offerHistorySave} onChange={savePreference} aria-describedby="settings-privacy-note" />
            <span>显示主动保存提示</span>
          </label>}
          <p id="settings-privacy-note" className="workspace-tool-note">提示只提醒你主动保存。记录清除需逐条确认，文字销毁工具在本地处理正文。</p>
        </section>
        <section className="workspace-tool-panel" aria-labelledby="settings-records-title">
          <h3 id="settings-records-title">当前入口的记录</h3>
          {summary ? <ul className="workspace-settings-counts">
            {Object.entries(summary.counts).map(([kind, count]) => {
              const [label, route] = recordDestinations[kind] || [kind];
              const row = <><span>{label}</span><span className="record-count">{count} 条</span>{route && <ChevronRight size={16} aria-hidden="true" />}</>;
              return <li key={kind}>{route ? <a href={`#${route}`}>{row}</a> : <span>{row}</span>}</li>;
            })}
          </ul> : <p className="workspace-tool-note">{error ? '暂时无法读取记录数量。' : '正在读取记录数量…'}</p>}
        </section>
      </div>
    </div>

    {capabilities && <section className="workspace-tool-panel workspace-settings-services">
      <h3>服务状态</h3>
      <p className="workspace-tool-note">当前入口 {entryLabels[capabilities.entryPoint] || capabilities.entryPoint} · 模型{capabilities.modelConfigured ? '已配置' : '未配置'} · 检索 {capabilities.searchProvider || '未配置'} · 微信回调{capabilities.wechatConfigured ? '已配置' : '未配置'}</p>
    </section>}
  </section>;
}
