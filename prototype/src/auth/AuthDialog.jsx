import React, { useEffect, useRef, useState } from 'react';
import { LogIn, LogOut, UserCircle, X } from 'lucide-react';
import { apiMode, apiStatusLabel } from '../api/client.js';

export function AuthDialog({ mode, status, profile, busy, error, notice, onModeChange, onClose, onSubmit, onLogout }) {
  const [form, setForm] = useState({ loginName: '', password: '', confirmPassword: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const dialog = useRef(null);
  const update = (key, value) => {
    setForm(current => ({ ...current, [key]: value }));
    setFieldErrors(current => ({ ...current, [key]: '' }));
  };

  useEffect(() => {
    const trigger = document.activeElement;
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);

  useEffect(() => {
    setForm({ loginName: '', password: '', confirmPassword: '' });
    setFieldErrors({});
    dialog.current?.querySelector(mode === 'account' ? '.auth-dialog-close' : '[name="loginName"]')?.focus();
  }, [mode]);

  const handleSubmit = event => {
    event.preventDefault();
    if (busy || status === 'checking') return;
    const nextErrors = {};
    const passwordLength = Array.from(form.password).length;
    if (passwordLength > 128) nextErrors.password = '密码超过 128 个 Unicode 码点，请检查后再提交；输入未被截断。';
    else if (mode === 'register' && passwordLength < 12) nextErrors.password = '注册密码至少需要 12 个 Unicode 码点。';
    if (mode === 'register' && form.confirmPassword !== form.password) nextErrors.confirmPassword = '两次密码不一致，请重新确认。';
    setFieldErrors(nextErrors);
    const firstInvalid = Object.keys(nextErrors)[0];
    if (firstInvalid) {
      dialog.current?.querySelector(`[name="${firstInvalid}"]`)?.focus();
      return;
    }
    onSubmit(mode, form);
  };
  const accountName = profile?.nickname || profile?.loginName || '已登录用户';

  return <dialog ref={dialog} className="auth-dialog" aria-labelledby="auth-dialog-title" aria-describedby="auth-dialog-description"
    onCancel={event => { event.preventDefault(); onClose(); }} onMouseDown={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
        event.preventDefault();
        onClose();
      }
    }}>
      <button type="button" className="auth-dialog-close" aria-label="关闭" onClick={onClose}><X size={19} /></button>
      {mode === 'account' ? <>
        <span className="auth-dialog-mark"><UserCircle size={21} /></span>
        <h2 id="auth-dialog-title">账户信息</h2>
        <p id="auth-dialog-description" className="auth-dialog-description">当前服务已确认登录身份。</p>
        <div className="auth-account-card"><strong>{accountName}</strong><span>{profile?.bio || '暂无个人简介'}</span></div>
        <p className="auth-api-status">{apiStatusLabel}</p>
        <div className="auth-dialog-actions"><button type="button" className="button button-outline" onClick={onClose}>关闭</button><button type="button" className="button button-primary" onClick={onLogout}><LogOut size={15} />退出登录</button></div>
      </> : <>
        <span className="auth-dialog-mark"><LogIn size={21} /></span>
        <h2 id="auth-dialog-title">{mode === 'register' ? '创建账户' : '登录'}</h2>
        <p id="auth-dialog-description" className="auth-dialog-description">账号凭据只提交给当前配置的认证 API，不会保存在浏览器。</p>
        <p className={`auth-api-status ${apiMode === 'real' ? 'is-real' : ''}`} role="status">{apiStatusLabel}</p>
        {notice && <p className="auth-notice" role="status">{notice}</p>}
        <form className="auth-dialog-form" onSubmit={handleSubmit} aria-busy={busy || status === 'checking'}>
          <label>登录名<input name="loginName" autoComplete="username" value={form.loginName} onChange={event => update('loginName', event.target.value)} maxLength={64} required disabled={busy} aria-describedby="auth-name-hint" /></label>
          <small id="auth-name-hint" className="auth-field-hint">3～64 位字母、数字或下划线；最终由认证服务校验。</small>
          <label>密码<input name="password" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={form.password} onChange={event => update('password', event.target.value)} required disabled={busy} aria-invalid={!!fieldErrors.password} aria-describedby={`auth-password-hint${fieldErrors.password ? ' auth-password-error' : ''}`} /></label>
          <small id="auth-password-hint" className="auth-field-hint">{mode === 'register' ? '12～128 个 Unicode 码点；不裁剪或改写密码。' : '请输入原密码；不裁剪或改写，最多 128 个 Unicode 码点。'}</small>
          {fieldErrors.password && <small id="auth-password-error" className="auth-form-error" role="alert">{fieldErrors.password}</small>}
          {mode === 'register' && <><label>确认密码<input name="confirmPassword" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={event => update('confirmPassword', event.target.value)} required disabled={busy} aria-invalid={!!fieldErrors.confirmPassword} aria-describedby={fieldErrors.confirmPassword ? 'auth-confirm-error' : undefined} /></label>
            {fieldErrors.confirmPassword && <small id="auth-confirm-error" className="auth-form-error" role="alert">{fieldErrors.confirmPassword}</small>}</>}
          {error && <p className="auth-form-error" role="alert">{error}</p>}
          <button type="submit" className="button button-primary" disabled={busy || status === 'checking'}>{busy ? '正在提交…' : mode === 'register' ? '创建账户' : '登录'}</button>
        </form>
        <button type="button" className="auth-mode-switch" disabled={busy} onClick={() => onModeChange(mode === 'register' ? 'login' : 'register')}>
          {mode === 'register' ? '已有账户？登录' : '还没有账户？创建账户'}
        </button>
      </>}
  </dialog>;
}
