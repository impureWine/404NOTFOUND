import { useCallback, useEffect, useRef, useState } from 'react';

export const MAX_TEXT_CODE_POINTS = 4000;

const limitText = value => Array.from(String(value)).slice(0, MAX_TEXT_CODE_POINTS).join('');

export function useTextDestructionState(initialText = '') {
  const [text, setText] = useState(() => limitText(initialText));
  const [phase, setPhase] = useState(initialText ? 'ready' : 'empty');
  const buffer = useRef(text);

  const setBuffer = useCallback(value => {
    const next = limitText(value);
    buffer.current = next;
    setText(next);
    setPhase(next ? 'editing' : 'empty');
  }, []);

  const clear = useCallback(() => {
    buffer.current = '';
    setText('');
    setPhase('cleared');
  }, []);

  const destroy = useCallback(() => {
    try {
      buffer.current = '';
      setText('');
      setPhase('destroyed');
    } catch {
      buffer.current = '';
      setText('');
      setPhase('error-cleared');
    }
  }, []);

  const dispose = useCallback(() => {
    buffer.current = '';
    setText('');
    setPhase('cleared');
  }, []);

  useEffect(() => {
    const clearForPageExit = () => {
      buffer.current = '';
      setText('');
      setPhase('cleared');
    };
    window.addEventListener('pagehide', clearForPageExit);
    window.addEventListener('beforeunload', clearForPageExit);
    return () => {
      window.removeEventListener('pagehide', clearForPageExit);
      window.removeEventListener('beforeunload', clearForPageExit);
      buffer.current = '';
    };
  }, []);

  return { text, phase, setBuffer, destroy, clear, dispose };
}
