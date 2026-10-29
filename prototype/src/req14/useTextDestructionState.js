import { useCallback, useEffect, useRef, useState } from 'react';

export const MAX_TEXT_CODE_POINTS = 4000;

const limitText = value => Array.from(String(value)).slice(0, MAX_TEXT_CODE_POINTS).join('');

export function useTextDestructionState(initialText = '') {
  const [text, setText] = useState(() => limitText(initialText));
  const [phase, setPhase] = useState(initialText ? 'ready' : 'empty');
  const buffer = useRef(text);
  const inputRef = useRef(null);

  const eraseInput = useCallback(() => {
    buffer.current = '';
    if (inputRef.current) inputRef.current.value = '';
    setText('');
  }, []);

  const setBuffer = useCallback(value => {
    const next = limitText(value);
    buffer.current = next;
    setText(next);
    setPhase(next ? 'editing' : 'empty');
  }, []);

  const clear = useCallback(() => {
    eraseInput();
    setPhase('cleared');
  }, [eraseInput]);

  const destroy = useCallback(() => {
    try {
      eraseInput();
      setPhase('destroyed');
    } catch {
      buffer.current = '';
      if (inputRef.current) inputRef.current.value = '';
      setText('');
      setPhase('error-cleared');
    }
  }, [eraseInput]);

  const dispose = useCallback(() => {
    eraseInput();
    setPhase('cleared');
  }, [eraseInput]);

  useEffect(() => {
    const clearForPageExit = () => {
      buffer.current = '';
      if (inputRef.current) inputRef.current.value = '';
      setText('');
      setPhase('cleared');
    };
    window.addEventListener('pagehide', clearForPageExit);
    window.addEventListener('beforeunload', clearForPageExit);
    return () => {
      window.removeEventListener('pagehide', clearForPageExit);
      window.removeEventListener('beforeunload', clearForPageExit);
      buffer.current = '';
      if (inputRef.current) inputRef.current.value = '';
    };
  }, []);

  return { text, phase, inputRef, setBuffer, destroy, clear, dispose };
}
