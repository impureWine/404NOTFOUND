import React from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '../ui.jsx';
import { useTextDestructionState } from './useTextDestructionState.js';

export function TextDestructionTool() {
  const { text, phase, inputRef, setBuffer, destroy, clear } = useTextDestructionState();

  return <section className="text-destruction-tool" aria-labelledby="text-destruction-title">
    <div className="text-destruction-copy">
      <span className="eyebrow">REQ14 · 独立临时输入</span>
      <h2 id="text-destruction-title">写下，然后由你决定何时清除</h2>
      <p>这段文字只留在当前页面内存，不进入聊天、保存记录或 AI 请求。</p>
      <label htmlFor="text-destruction-input">临时文字</label>
      <textarea id="text-destruction-input" ref={inputRef} value={text} maxLength={4000} onChange={event => setBuffer(event.target.value)} placeholder="从空白开始；这里只接受你主动输入的文字。" />
      <div className="text-destruction-actions">
        <Button variant="danger" icon={Trash2} disabled={!text} onClick={destroy}>销毁文字</Button>
        <Button variant="neutral" icon={RotateCcw} disabled={!text} onClick={clear}>清空</Button>
        <span role="status">{phase === 'destroyed' ? '已从当前界面清除' : phase === 'cleared' ? '输入已清空' : phase === 'empty' ? '未输入内容' : '仅在当前页面临时显示'}</span>
      </div>
    </div>
    <div className="text-destruction-visual" data-phase={phase} aria-hidden="true"><span /></div>
  </section>;
}
