import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient, apiMode } from '../api/client.js';

const recordMessage = error => {
  if (error?.code === 'API_NOT_CONNECTED') return '记录 API 未连接；本次没有创建或清除记录。';
  if (error?.code === 'NETWORK_ERROR') return '网络中断，服务端结果待核实；保留本次操作标识，可安全重试。';
  if (error?.code === 'CSRF_CONFIG_MISSING') return '认证上下文已失效；请重新核验登录后再操作。';
  if (error?.code === 'CONFLICT') return '记录版本或一次性确认已变化/过期；请刷新列表后重新确认。';
  if (error?.code === 'AUTH_REQUIRED') return '登录会话已失效；私密记录保持隐藏。';
  return error?.message || '记录操作未完成。';
};

const resultMayBeUnknown = error => [
  'NETWORK_ERROR',
  'INVALID_API_RESPONSE',
  'SERVICE_UNAVAILABLE',
].includes(error?.code);

const requestId = () => {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new Error('当前环境无法生成安全请求标识。');
  }
  return globalThis.crypto.randomUUID();
};

export function useRecordVault({ authenticated, accountKey }) {
  const [items, setItems] = useState([]);
  const [loadState, setLoadState] = useState('idle');
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [detail, setDetail] = useState(null);
  const pendingSave = useRef(null);
  const pendingClear = useRef(null);
  const currentGeneration = useRef(0);
  const controllers = useRef(new Set());
  const activeOperations = useRef(0);

  const beginOperation = useCallback(() => {
    activeOperations.current += 1;
    setBusy(true);
  }, []);

  const endOperation = useCallback(() => {
    activeOperations.current = Math.max(0, activeOperations.current - 1);
    setBusy(activeOperations.current > 0);
  }, []);

  const startController = useCallback(() => {
    const controller = new AbortController();
    controllers.current.add(controller);
    return controller;
  }, []);

  const finishController = useCallback(controller => {
    controllers.current.delete(controller);
  }, []);

  const refresh = useCallback(async signal => {
    if (!authenticated || apiMode !== 'real') {
      setItems([]);
      setLoadState('unavailable');
      setLoadError(apiMode === 'mock' ? '当前为模拟模式，记录列表不会显示虚构历史。' : '需要先登录，私密记录不会向访客请求。');
      return;
    }
    setLoadState('loading');
    setLoadError('');
    const ownedController = signal ? null : startController();
    const requestSignal = signal || ownedController.signal;
    const generation = currentGeneration.current;
    try {
      const result = await apiClient.listRecords({ limit: 20 }, { signal: requestSignal });
      if (requestSignal.aborted || generation !== currentGeneration.current) return;
      if (!Array.isArray(result?.items)) throw new Error('记录列表响应格式无效；未按空列表处理。');
      setItems(result.items);
      setLoadState('ready');
    } catch (error) {
      if (requestSignal.aborted || generation !== currentGeneration.current) return;
      setItems([]);
      setLoadState('error');
      setLoadError(recordMessage(error));
    } finally {
      if (ownedController) finishController(ownedController);
    }
  }, [authenticated, finishController, startController]);

  useEffect(() => {
    const generation = ++currentGeneration.current;
    const controller = startController();
    pendingSave.current = null;
    pendingClear.current = null;
    setItems([]);
    setDetail(null);
    setNotice('');
    void refresh(controller.signal);
    return () => {
      controller.abort();
      finishController(controller);
      for (const active of controllers.current) active.abort();
      controllers.current.clear();
      if (currentGeneration.current === generation) currentGeneration.current += 1;
      pendingSave.current = null;
      pendingClear.current = null;
    };
  }, [accountKey, finishController, refresh, startController]);

  const save = useCallback(async snapshot => {
    const generation = currentGeneration.current;
    const intent = pendingSave.current || {
      requestId: requestId(),
      content: { title: snapshot.title, body: snapshot.body },
      consentRequestId: requestId(),
      recordRequestStarted: false,
      resultUnknown: false,
    };
    pendingSave.current = intent;
    const controller = startController();
    beginOperation();
    setNotice('');
    try {
      const consent = await apiClient.createConsent({
        requestId: intent.consentRequestId,
        purpose: 'SAVE',
        operation: 'RECORD_CREATE',
        payload: { kind: 'CONVERSATION', content: intent.content },
      }, { signal: controller.signal });
      intent.recordRequestStarted = true;
      const created = await apiClient.createRecord({
        requestId: intent.requestId,
        consentId: consent.consentId,
        kind: 'CONVERSATION',
        content: intent.content,
      }, { signal: controller.signal });
      if (!created?.id || !Number.isSafeInteger(created.version)) {
        throw Object.assign(new Error('保存响应缺少记录标识或版本；服务端状态待核实。'), { code: 'INVALID_API_RESPONSE' });
      }
      if (controller.signal.aborted || generation !== currentGeneration.current) return false;
      pendingSave.current = null;
      setNotice('服务端已确认保存；记录只在本人当前入口列表中读取。');
      await refresh();
      return true;
    } catch (error) {
      if (!controller.signal.aborted && generation === currentGeneration.current) {
        if (intent.recordRequestStarted && resultMayBeUnknown(error)) intent.resultUnknown = true;
        setNotice(recordMessage(error));
      }
      return false;
    } finally {
      finishController(controller);
      endOperation();
    }
  }, [beginOperation, endOperation, finishController, refresh, startController]);

  const cancelSave = useCallback(() => {
    if (pendingSave.current?.resultUnknown) return false;
    pendingSave.current = null;
    setNotice('已取消本地保存确认；未继续提交保存请求。');
    return true;
  }, []);

  const openDetail = useCallback(async id => {
    const generation = currentGeneration.current;
    const controller = startController();
    beginOperation();
    setNotice('');
    try {
      const result = await apiClient.getRecord(id, { signal: controller.signal });
      if (!controller.signal.aborted && generation === currentGeneration.current) {
        setDetail({ id: result.id, kind: result.kind, version: result.version, createdAt: result.createdAt, updatedAt: result.updatedAt });
      }
    } catch (error) {
      if (!controller.signal.aborted && generation === currentGeneration.current) setNotice(recordMessage(error));
    } finally {
      finishController(controller);
      endOperation();
    }
  }, [beginOperation, endOperation, finishController, startController]);

  const requestClear = useCallback(async (record, { renew = false } = {}) => {
    const generation = currentGeneration.current;
    const current = pendingClear.current;
    const confirmationTime = Date.parse(current?.confirmation?.expiresAt || '');
    const expired = current?.confirmation && (!Number.isFinite(confirmationTime) || confirmationTime <= Date.now());
    const intent = !renew && !expired && current?.recordId === record.id
      ? current
      : { recordId: record.id, requestId: requestId(), expectedVersion: record.version, confirmation: null };
    pendingClear.current = intent;
    const controller = startController();
    beginOperation();
    setNotice('');
    try {
      const confirmation = await apiClient.createRecordClearConfirmation(record.id, {
        requestId: intent.requestId,
        expectedVersion: intent.expectedVersion,
      }, { signal: controller.signal });
      if (!controller.signal.aborted && generation === currentGeneration.current) {
        if (!confirmation?.confirmationId || !Number.isFinite(Date.parse(confirmation.expiresAt))) {
          intent.confirmationResultUnknown = true;
          throw Object.assign(new Error('服务端确认响应不完整；可用同一请求标识重新核实。'), { code: 'INVALID_API_RESPONSE' });
        }
        intent.confirmation = confirmation;
        intent.confirmationResultUnknown = false;
        setNotice(`已申请一次性清除确认，约于 ${new Date(confirmation.expiresAt).toLocaleTimeString('zh-CN')} 过期。再次点击“确认清除”才会提交清除请求。`);
      }
    } catch (error) {
      if (!controller.signal.aborted && generation === currentGeneration.current) {
        if (resultMayBeUnknown(error)) intent.confirmationResultUnknown = true;
        if (error?.code === 'CONFLICT') {
          pendingClear.current = null;
          void refresh();
        }
        setNotice(recordMessage(error));
      }
    } finally {
      finishController(controller);
      endOperation();
    }
  }, [beginOperation, endOperation, finishController, refresh, startController]);

  const confirmClear = useCallback(async record => {
    const generation = currentGeneration.current;
    const intent = pendingClear.current;
    if (!intent || intent.recordId !== record.id || !intent.confirmation?.confirmationId) return;
    if (!intent.clearResultUnknown && Date.parse(intent.confirmation.expiresAt) <= Date.now()) {
      pendingClear.current = null;
      setNotice('一次性清除确认已过期，正在重新申请；仍需你再次确认才会提交清除。');
      void requestClear(record, { renew: true });
      return;
    }
    const controller = startController();
    beginOperation();
    setNotice('');
    try {
      const result = await apiClient.clearRecord(record.id, {
        requestId: intent.confirmRequestId || (intent.confirmRequestId = requestId()),
        expectedVersion: intent.expectedVersion,
        confirmationId: intent.confirmation.confirmationId,
      }, { signal: controller.signal });
      if (controller.signal.aborted || generation !== currentGeneration.current) return;
      pendingClear.current = null;
      setDetail(null);
      setNotice(result?.cleared
        ? '服务端已确认清除；当前列表和本地详情已更新。'
        : '服务端未确认清除，列表未作成功处理。');
      if (result?.cleared) await refresh();
    } catch (error) {
      if (!controller.signal.aborted && generation === currentGeneration.current) {
        if (error?.code === 'CONFLICT') {
          pendingClear.current = null;
          setDetail(null);
          setNotice(recordMessage(error));
          void refresh();
        } else {
          if (resultMayBeUnknown(error)) intent.clearResultUnknown = true;
          setNotice(recordMessage(error));
        }
      }
    } finally {
      finishController(controller);
      endOperation();
    }
  }, [beginOperation, endOperation, finishController, refresh, requestClear, startController]);

  const cancelClear = useCallback(() => {
    if (pendingClear.current?.clearResultUnknown) return false;
    pendingClear.current = null;
    setNotice('已取消本地清除确认；未提交清除请求。');
    return true;
  }, []);

  const closeDetail = useCallback(() => setDetail(null), []);

  return {
    items,
    loadState,
    loadError,
    busy,
    notice,
    detail,
    refresh,
    save,
    cancelSave,
    openDetail,
    requestClear,
    confirmClear,
    cancelClear,
    closeDetail,
    hasPendingSave: Boolean(pendingSave.current),
    saveResultUnknown: Boolean(pendingSave.current?.resultUnknown),
    pendingClearId: pendingClear.current?.recordId || null,
    clearExpiresAt: pendingClear.current?.confirmation?.expiresAt || null,
    clearConfirmationResultUnknown: Boolean(pendingClear.current?.confirmationResultUnknown),
    clearResultUnknown: Boolean(pendingClear.current?.clearResultUnknown),
    clearConfirmationReady: Boolean(pendingClear.current?.confirmation?.confirmationId)
      && Date.parse(pendingClear.current?.confirmation?.expiresAt || '') > Date.now(),
  };
}
