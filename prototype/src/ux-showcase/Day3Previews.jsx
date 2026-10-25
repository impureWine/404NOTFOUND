import React, { useState } from 'react';
import { AsyncState, Button, InfoNotice, Panel, PreviewNotice } from './components.jsx';
import { EmotionCardPreview, EmotionWordPicker, TrainingControls, TrainingStepCard, TRAINING_STEPS } from './Day3Components.jsx';
import { codePoints } from './data.js';

export function EmotionPreview({ status, setStatus, navigate }) {
  const [selected, setSelected] = useState(status === 'empty' ? [] : ['有点累', '心里有点乱']);
  const [description, setDescription] = useState('');
  const [card, setCard] = useState(status === 'normal' ? { words: selected, description: '' } : null);
  const [includeDescription, setIncludeDescription] = useState(false);
  const canPreview = (selected.length > 0 || description.trim()) && codePoints(description) <= 4000;
  function previewCard() {
    if (!canPreview) { return; }
    setCard({ words: [...selected], description });
    setIncludeDescription(false);
    setStatus('normal');
  }
  function edit() {
    setCard(null);
    setIncludeDescription(false);
    setStatus('empty');
  }
  return <>
    <InfoNotice>选择由你决定；命名卡只保留在当前页。带到聊天需要点击确认，不会自动外发或保存。</InfoNotice>
    <div className="emotion-layout">
      <Panel className="emotion-editor">
        <h2>为此刻选几个词</h2>
        <EmotionWordPicker selected={selected} description={description} disabled={status === 'loading'}
          onToggle={word => { setSelected(previous => previous.includes(word) ? previous.filter(item => item !== word) : [...previous, word]); edit(); }}
          onDescription={value => { setDescription(value); edit(); }} />
        <div className="button-row"><Button loading={status === 'loading'} disabled={!canPreview} onClick={previewCard}>预览命名卡</Button>
          <Button variant="neutral" onClick={() => { setSelected([]); setDescription(''); edit(); }}>清空选择</Button></div>
      </Panel>
      <AsyncState status={card && status === 'normal' ? 'normal' : status === 'normal' ? 'empty' : status}
        title={status === 'loading' ? '正在准备命名卡预览' : status === 'error' ? '预览暂未准备好' : '还没有生成命名卡'}
        description={status === 'error' ? '已保留所选词语和描述。可以重新预览，不会自动发送。' : status === 'loading' ? '这是等待状态示例；这里不调用模型。' : '先选择词语或补充一句话，再点击预览。'}
        onRetry={status === 'error' && canPreview ? previewCard : undefined} retryLabel="重新预览命名卡">
        {card && <EmotionCardPreview card={card} includeDescription={includeDescription}
          onIncludeDescription={setIncludeDescription} onContinue={() => {
            const draft = [card.words.length ? `此刻我感到：${card.words.join('、')}。` : '', includeDescription ? card.description : ''].filter(Boolean).join('\n');
            navigate('chat', { draft });
          }} />}
      </AsyncState>
    </div>
  </>;
}

export function TrainingPreview({ status, setStatus }) {
  const [phase, setPhase] = useState('idle');
  const [stepIndex, setStepIndex] = useState(0);
  const [notice, setNotice] = useState('');
  function start() { setPhase('running'); setStepIndex(0); setStatus('normal'); setNotice(''); }
  return <>
    <InfoNotice>本地训练操作演示，步骤由点击推进，不运行计时器、音频或模型。感觉不适时可以随时退出。</InfoNotice>
    <Panel className="training-panel">
      <AsyncState status={status} title={status === 'loading' ? '正在准备练习说明' : status === 'error' ? '练习说明暂不可用' : '从一个小停顿开始'}
        description={status === 'error' ? '这是说明读取失败的示例，尚未开始练习。可以重新载入静态说明。' : status === 'loading' ? '等待期间不会开始或推进练习。' : '开始前不推进步骤；你可以暂停、继续，或随时退出。'}
        onRetry={status === 'error' ? () => { setStatus('normal'); setPhase('idle'); } : undefined} retryLabel="重载练习说明"
        onStart={status === 'empty' ? start : undefined} startLabel="开始练习">
        <TrainingStepCard phase={phase} stepIndex={stepIndex} />
      </AsyncState>
      {status === 'normal' && <TrainingControls phase={phase} onStart={start}
        onPause={() => setPhase('paused')} onResume={() => setPhase('running')}
        onNext={() => { if (stepIndex === TRAINING_STEPS.length - 1) { setPhase('completed'); } else { setStepIndex(previous => previous + 1); } }}
        onExit={() => { setPhase('stopped'); setNotice('本地练习已停止，不再推进步骤。重新开始会从第一步进入。'); }} onReset={start} />}
      {status === 'loading' && <div className="training-controls"><Button variant="neutral" onClick={() => { setStatus('empty'); setNotice('已停止本地准备状态，练习没有开始。'); }}>停止准备</Button></div>}
    </Panel>
    {notice && <PreviewNotice title={notice} onClose={() => setNotice('')} />}
  </>;
}
