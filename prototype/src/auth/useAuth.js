import { useCallback, useEffect, useState } from 'react';
import { apiClient, apiMode } from '../api/client.js';

const initialStatus = apiMode === 'real' ? 'checking' : 'anonymous';

function makeRequestId() {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new Error('当前环境无法生成安全请求标识。');
  }
  return globalThis.crypto.randomUUID();
}
function messageFor(error) {
  if (error?.code === 'API_NOT_CONNECTED') return '认证 API 未连接，当前不会模拟成功。';
  if (error?.code === 'NETWORK_ERROR') return '网络请求失败；本地状态已停止，服务器状态需要重新核实。';
  if (error?.code === 'CSRF_CONFIG_MISSING') return '认证上下文未提供可用的 CSRF 状态，写请求未发送。';
  return error?.message || '认证请求未完成，请检查服务状态后重试。';
}
export function useAuth() {
  const [status, setStatus] = useState(initialStatus);
  const [profile, setProfile] = useState(null);
  const [authView, setAuthView] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pageNotice, setPageNotice] = useState(apiMode === 'mock' ? '认证 API 未连接；登录、注册和退出请求不会模拟成功。' : '');
  const [logoutPending, setLogoutPending] = useState(false);

  const clearLocalIdentity = useCallback(() => {
    apiClient.clearAuthContext();
    setProfile(null);
    setStatus('anonymous');
    setAuthView(null);
    setError('');
    setNotice('');
  }, []);

  const refreshIdentity = useCallback(async signal => {
    const context = await apiClient.getAuthContext({ signal });
    if (!context?.authenticated) return null;
    return apiClient.getProfile({ signal });
  }, []);

  useEffect(() => {
    if (apiMode !== 'real') return undefined;
    const controller = new AbortController();
    refreshIdentity(controller.signal).then(currentProfile => {
      if (controller.signal.aborted) return;
      setProfile(currentProfile);
      setStatus(currentProfile ? 'authenticated' : 'anonymous');
      setPageNotice(currentProfile ? '' : '当前为未登录访客。');
    }).catch(errorValue => {
      if (controller.signal.aborted) return;
      apiClient.clearAuthContext();
      setProfile(null);
      setStatus('unavailable');
      setPageNotice(`认证服务暂不可用：${messageFor(errorValue)}`);
    });
    return () => controller.abort();
  }, [refreshIdentity]);

  const openAuth = useCallback(view => {
    setError('');
    setNotice('');
    setAuthView(view);
  }, []);

  const closeAuth = useCallback(() => {
    setAuthView(null);
    setError('');
    setNotice('');
  }, []);

  const submit = useCallback(async (mode, form) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const context = await apiClient.getAuthContext();
      if (mode === 'register') {
        if (context?.authenticated) throw new Error('请先退出当前账户，再注册另一个账户。');
        const result = await apiClient.register({
          requestId: makeRequestId(),
          loginName: form.loginName.trim(),
          password: form.password,
          confirmPassword: form.confirmPassword,
        });
        setNotice(`注册请求已成功，账号标识：${result?.accountId || '已创建'}。请使用新账户登录。`);
        setAuthView('login');
        return;
      }
      if (context?.authenticated) {
        const currentProfile = await apiClient.getProfile();
        setProfile(currentProfile);
        setStatus('authenticated');
        setPageNotice('登录身份已由认证服务核验。');
        closeAuth();
        return;
      }
      await apiClient.login({ loginName: form.loginName.trim(), password: form.password, target: 'home' });
      const currentProfile = await refreshIdentity();
      if (!currentProfile) throw new Error('登录请求已完成，但服务端身份上下文未确认；私密界面保持锁定。');
      setProfile(currentProfile);
      setStatus('authenticated');
      setPageNotice('登录成功，身份与个人资料已从认证服务读取。');
      closeAuth();
    } catch (errorValue) {
      if (errorValue?.code === 'NETWORK_ERROR' || errorValue?.code === 'API_NOT_CONNECTED' || errorValue?.code === 'CSRF_CONFIG_MISSING') {
        setStatus(apiMode === 'real' ? 'unavailable' : 'anonymous');
      }
      setError(messageFor(errorValue));
    } finally {
      setBusy(false);
    }
  }, [closeAuth, refreshIdentity]);

  const logout = useCallback(async () => {
    clearLocalIdentity();
    setLogoutPending(false);
    setPageNotice('本机私密界面已清理，正在确认服务器会话状态。');
    if (apiMode !== 'real') {
      setPageNotice('本机私密界面已清理；认证 API 未连接，因此没有可确认的服务器退出结果。');
      return;
    }
    try {
      const context = await apiClient.getAuthContext();
      if (context?.authenticated) await apiClient.logout();
      else apiClient.clearAuthContext();
      setPageNotice('本机私密界面已清理，服务器已确认当前会话无效。');
    } catch (errorValue) {
      apiClient.clearAuthContext();
      setLogoutPending(true);
      setPageNotice(`本机已退出；服务器撤销状态待确认：${messageFor(errorValue)}`);
    }
  }, [clearLocalIdentity]);

  const retryLogout = useCallback(async () => {
    setPageNotice('正在重新核实服务器退出状态。');
    try {
      const context = await apiClient.getAuthContext();
      if (context?.authenticated) await apiClient.logout();
      else apiClient.clearAuthContext();
      setLogoutPending(false);
      setPageNotice('服务器已确认当前会话无效。');
    } catch (errorValue) {
      apiClient.clearAuthContext();
      setLogoutPending(true);
      setPageNotice(`服务器撤销状态仍待确认：${messageFor(errorValue)}`);
    }
  }, []);

  return {
    status,
    profile,
    authView,
    busy,
    error,
    notice,
    pageNotice,
    logoutPending,
    openAuth,
    closeAuth,
    submit,
    logout,
    retryLogout,
  };
}
