import React from 'react';
import { ArrowRight, Check, Pause, Play, RotateCcw, Square } from 'lucide-react';
import { Button, Panel, StatusBadge } from './components.jsx';
import { codePoints } from './data.js';

export const EMOTION_WORDS = ['有点累', '心里有点乱', '紧张', '委屈', '难过', '生气', '平静', '有点期待'];
export const TRAINING_STEPS = [
  { title: '先安顿下来', description: '找一个舒服的位置，感受身体与椅子或地面的接触。不舒服时可以随时退出。' },
  { title: '看看身边', description: '按自己的节奏，留意身边一个看得见的物件。无需屏息，也不要求改变呼吸。' },
  { title: '决定下一步', description: '留意此刻的感受，然后选择继续休息、聊一会儿，或结束这次练习。' },
];

/** Controlled selection; words describe the user's choice and never infer a diagnosis. */
export function EmotionWordPicker({ selected, description, disabled, onToggle, onDescription }) {
  const count = codePoints(description);
  return <div className="emotion-input">
    <fieldset disabled={disabled} aria-describedby="emotion-word-limit">
      <legend>哪些词更接近此刻的你？</legend>
      <p id="emotion-word-limit">最多选 3 个，也可以只写自己的描述。</p>
      <div className="emotion-words">{EMOTION_WORDS.map(word => <button
        key={word} type="button" aria-pressed={selected.includes(word)}
        disabled={!selected.includes(word) && selected.length >= 3}
        onClick={() => onToggle(word)}
      >{selected.includes(word) && <Check size={14} aria-hidden="true" />}{word}</button>)}</div>
    </fieldset>
    <label htmlFor="emotion-description">想补充的一句话（可选）</label>
    <textarea id="emotion-description" rows={4} disabled={disabled} value={description}
      onChange={event => onDescription(event.target.value)} placeholder="可以用自己的话，不必解释原因。"
      aria-invalid={count > 4000} aria-describedby="emotion-description-limit" />
    <small id="emotion-description-limit" className={count > 4000 ? 'field-error' : ''}>
      {count} / 4000 码点{count > 4000 && ' · 已超出上限，请编辑后再继续'}
    </small>
  </div>;
}

/** User explicitly chooses the text carried to the next local preview; no storage or API. */
export function EmotionCardPreview({ card, includeDescription, onIncludeDescription, onContinue }) {
  const carriedText = [card.words.length ? `此刻我感到：${card.words.join('、')}。` : '', includeDescription ? card.description : ''].filter(Boolean).join('\n');
  const canCarry = carriedText.trim().length > 0 && codePoints(carriedText) <= 4000;
  return <Panel className="emotion-card-preview">
    <StatusBadge>由你命名 · 当前页临时内容</StatusBadge>
    <h2>此刻，我有一点……</h2>
    <div className="emotion-card-words">{card.words.map(word => <span key={word}>{word}</span>)}</div>
    {card.description && <p className="emotion-card-description">{card.description}</p>}
    <p className="emotion-card-note">这些词只是当下的描述，不是诊断，也不替你判断原因。</p>
    {card.description && <label className="carry-description"><input type="checkbox"
      checked={includeDescription} onChange={event => onIncludeDescription(event.target.checked)} />
      同时带入我补充的这句话
    </label>}
    <Button disabled={!canCarry} onClick={onContinue}>把选定内容带到聊天草稿<ArrowRight size={16} aria-hidden="true" /></Button>
    {!canCarry && <small className="field-error">{carriedText.trim() ? '携带内容超过 4000 码点，请返回缩短描述。' : '请选择带入的描述；未选择时不会自动携带正文。'}</small>}
    <small>不会自动发送或保存；进入聊天后可以编辑。</small>
  </Panel>;
}

/** Training controls expose intent; the preview advances only on user action, with no timer. */
export function TrainingControls({ phase, onStart, onPause, onResume, onNext, onExit, onReset }) {
  return <div className="training-controls" role="group" aria-label="训练操作">
    {phase === 'idle' && <Button onClick={onStart} icon={Play}>开始练习</Button>}
    {phase === 'running' && <><Button variant="neutral" onClick={onPause} icon={Pause}>暂停练习</Button><Button onClick={onNext}>完成本步</Button></>}
    {phase === 'paused' && <Button onClick={onResume} icon={Play}>继续练习</Button>}
    {['completed', 'stopped'].includes(phase) && <Button onClick={onReset} icon={RotateCcw}>重新开始</Button>}
    {['running', 'paused'].includes(phase) && <Button variant="neutral" onClick={onExit} icon={Square}>退出练习</Button>}
  </div>;
}

export function TrainingStepCard({ phase, stepIndex }) {
  const step = TRAINING_STEPS[stepIndex];
  const labels = { idle: '尚未开始', running: '进行中', paused: '已暂停', completed: '本次练习已完成', stopped: '已退出练习' };
  return <div className={`training-step ${phase}`}>
    <StatusBadge>{labels[phase]}</StatusBadge>
    <ol className="training-progress" aria-label="练习步骤">{TRAINING_STEPS.map((item, index) => <li
      key={item.title} aria-current={index === stepIndex ? 'step' : undefined}
    ><span>{index + 1}</span>{item.title}</li>)}</ol>
    <div role="status" aria-live="polite">
      <h2>{phase === 'completed' ? '给自己留过一个停顿，就很好' : phase === 'stopped' ? '这次先到这里' : step.title}</h2>
      <p>{phase === 'paused' ? '当前步骤保留，暂停期间不推进。准备好时再继续。' : phase === 'completed' ? '你可以按自己的意愿重来，或离开此页。没有生成成绩，也没有自动保存。' : phase === 'stopped' ? '练习已停止；重新开始会从第一步进入。' : step.description}</p>
    </div>
  </div>;
}
