import React, { useEffect, useState } from 'react';
import { LogIn, LogOut, UserCircle, X } from 'lucide-react';
import { apiMode, apiStatusLabel } from '../api/client.js';

export function AuthDialog({ mode, status, profile, busy, error, notice, onModeChange, onClose, onSubmit, onLogout }) {
  const [form, setForm] = useState({ loginName: '', password: '', confirmPassword: '' });
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));

  useEffect(() => {
    setForm({ loginName: '', password: '', confirmPassword: '' });
  }, [mode]);

  const handleSubmit = event => {
    event.preventDefault();
    onSubmit(mode, form);
  };
  const accountName = profile?.nickname || profile?.loginName || '已登录用户';

  return <div className="auth-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-dialog-title">
      <button type="button" className="auth-dialog-close" aria-label="关闭" onClick={onClose}><X size={19} /></button>
      {mode === 'account' ? <>
        <span className="auth-dialog-mark"><UserCircle size={21} /></span>
        <h2 id="auth-dialog-title">账户信息</h2>
        <p className="auth-dialog-description">当前服务已确认登录身份。</p>
        <div className="auth-account-card"><strong>{accountName}</strong><span>{profile?.bio || '暂无个人简介'}</span></div>
        <p className="auth-api-status">{apiStatusLabel}</p>
        <div className="auth-dialog-actions"><button type="button" className="button button-outline" onClick={onClose}>关闭</button><button type="button" className="button button-primary" onClick={onLogout}><LogOut size={15} />退出登录</button></div>
      </> : <>
        <span className="auth-dialog-mark"><LogIn size={21} /></span>
        <h2 id="auth-dialog-title">{mode === 'register' ? '创建账户' : '登录'}</h2>
        <p className="auth-dialog-description">账号凭据只提交给当前配置的认证 API，不会保存在浏览器。</p>
        <p className={`auth-api-status ${apiMode === 'real' ? 'is-real' : ''}`} role="status">{apiStatusLabel}</p>
        {notice && <p className="auth-notice" role="status">{notice}</p>}
        <form className="auth-dialog-form" onSubmit={handleSubmit}>
          <label>登录名<input name="loginName" autoComplete="username" value={form.loginName} onChange={event => update('loginName', event.target.value)} maxLength={32} required /></label>
          <label>密码<input name="password" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={form.password} onChange={event => update('password', event.target.value)} maxLength={128} required /></label>
          {mode === 'register' && <label>确认密码<input name="confirmPassword" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={event => update('confirmPassword', event.target.value)} maxLength={128} required /></label>}
          {error && <p className="auth-form-error" role="alert">{error}</p>}
          <button type="submit" className="button button-primary" disabled={busy || status === 'checking'}>{busy ? '正在提交…' : mode === 'register' ? '创建账户' : '登录'}</button>
        </form>
        <button type="button" className="auth-mode-switch" onClick={() => onModeChange(mode === 'register' ? 'login' : 'register')}>
          {mode === 'register' ? '已有账户？登录' : '还没有账户？创建账户'}
        </button>
      </>}
    </section>
  </div>;
}
