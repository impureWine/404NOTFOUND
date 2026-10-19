import { createContext, useContext, useEffect } from 'react';
export const PrototypeContext = createContext(null);
export const usePrototype = () => useContext(PrototypeContext);
export function useExitWarning(enabled, text = '当前内容仅用于本次演示。退出后不会自动保存，可以选择继续或退出。') {
  const { setExitWarning } = usePrototype();
  useEffect(() => { setExitWarning(enabled ? text : ''); return () => setExitWarning(''); }, [enabled, text, setExitWarning]);
}
export const emptyData = () => ({ settings: { session: false }, sessions: [], calendar: [], objects: [], expressions: [], worries: [], showExamples: true });
export const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
export const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export const stamp = () => new Date().toLocaleString('zh-CN', { hour12: false });
