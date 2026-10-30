(() => {
  const bridge=window.desktopPet;
  const $=selector=>document.querySelector(selector),all=selector=>Array.from(document.querySelectorAll(selector));
  let expanded=false,clickThrough=false,groundStep=0;
  const panel=$('#pet-panel'),toggle=$('[data-action="toggle"]'),status=$('[data-status]');
  function tell(text){status.hidden=false;status.textContent=text;}
  function route(name){if(bridge)bridge.openWorkspace(name);else tell('请在 Electron 桌宠中打开工作台。');}
  const breath=new PetSession.BreathingSession({onChange:s=>{
    $('[data-breath-title]').textContent=({ready:'准备开始',paused:'已暂停',completed:'练习完成'})[s.state]||(s.phase==='inhale'?'轻轻吸气':'慢慢呼气');
    $('[data-breath-count]').textContent=s.state==='running'?`${s.phaseSeconds} 秒`:s.state==='ready'?'按自己的节奏就好':s.state==='paused'?'准备好后再继续':'可以停在这里';
    $('[data-breath-progress]').value=s.elapsedMs;
    $('[data-breath-status]').textContent=s.state==='ready'?'吸气 4 秒 · 呼气 6 秒 · 不必憋气':`剩余 ${s.remainingSeconds} 秒 · ${s.state==='paused'?'暂停时不会计时':'按舒服的节奏'} `;
    const scale=s.state==='ready'?1:s.phase==='inhale'?1+s.progress*.2:1.2-s.progress*.2;
    $('.breath-ring').style.transform=`scale(${scale})`;
    for(const [action,visible] of Object.entries({'breath-start':s.state==='ready','breath-pause':s.state==='running','breath-resume':s.state==='paused','breath-reset':s.state!=='ready'}))$(`[data-action="${action}"]`).hidden=!visible;
  }});
  const ground=[['看见 5 样东西','慢慢环顾四周，留意能看见的东西。'],['感受 4 种触感','留意脚下地面、椅背，或手边安全的质地。'],['听见 3 种声音','听一听周围的声音，不必刻意寻找。'],['留意 2 种气味','留意能闻到或想起的气味，不方便时略过。'],['留意 1 种味道','留意此刻的味道，或只注意自然呼吸。']];
  function renderGround(){const done=groundStep===ground.length;$('[data-ground-number]').textContent=done?'已完成':`${groundStep+1} / 5`;$('[data-ground-title]').textContent=done?'已经走过这一小段':ground[groundStep][0];$('[data-ground-copy]').textContent=done?'可以停在这里，按自己的节奏回到当下。':ground[groundStep][1];$('[data-action="ground-previous"]').disabled=groundStep===0;$('[data-action="ground-next"]').textContent=done?'再做一次':groundStep===4?'完成':'继续 / 略过';}
  function chooseExercise(name){breath.reset();for(const el of all('[data-exercise]'))el.hidden=el.dataset.exercise!==name;for(const nameValue of ['breath','ground'])$(`[data-action="choose-${nameValue}"]`).setAttribute('aria-pressed',String(name===nameValue));groundStep=0;renderGround();}
  function showView(name){breath.reset();for(const el of all('[data-view]'))el.hidden=el.dataset.view!==name;$('.panel-scroll').scrollTop=0;status.hidden=true;}
  function resetLocal(){breath.reset();groundStep=0;renderGround();all('[data-mood]').forEach(el=>el.setAttribute('aria-pressed','false'));$('[data-mood-response]').textContent='这里没有标准答案。';showView('home');chooseExercise('breath');}
  function applyExpanded(value){expanded=Boolean(value);panel.hidden=!expanded;toggle.setAttribute('aria-expanded',String(expanded));toggle.setAttribute('aria-label',expanded?'点击团团，收起功能面板':'点击团团，展开功能面板');$('[data-dock-caption]').textContent=expanded?'我在这里':'点我，陪你一会儿';if(!expanded){resetLocal();toggle.focus();}else panel.querySelector('button')?.focus();}
  function setExpanded(value){if(bridge)bridge.setExpanded(Boolean(value));else applyExpanded(value);}
  for(const word of ['平静','疲惫','烦躁','担心','失落','期待','说不清']){const button=document.createElement('button');button.type='button';button.textContent=word;button.dataset.mood=word;button.setAttribute('aria-pressed','false');button.addEventListener('click',()=>{all('[data-mood]').forEach(el=>el.setAttribute('aria-pressed',String(el===button)));$('[data-mood-response]').textContent=word==='说不清'?'说不清也没关系，先陪自己待一会儿。':`此刻有些${word}。谢谢你愿意留意自己的感受。`;});$('.mood-options').append(button);}
  all('[data-open-view]').forEach(el=>el.addEventListener('click',()=>showView(el.dataset.openView)));
  all('[data-route]').forEach(el=>el.addEventListener('click',()=>{breath.reset();route(el.dataset.route);}));
  const actions={toggle:()=>setExpanded(!expanded),collapse:()=>setExpanded(false),back:()=>showView('home'),'choose-breath':()=>chooseExercise('breath'),'choose-ground':()=>chooseExercise('ground'),'breath-start':()=>breath.start(),'breath-pause':()=>breath.pause(),'breath-resume':()=>breath.resume(),'breath-reset':()=>breath.reset(),'ground-previous':()=>{groundStep=Math.max(0,groundStep-1);renderGround();},'ground-next':()=>{groundStep=groundStep===ground.length?0:groundStep+1;renderGround();},'open-pressure':()=>{breath.reset();if(bridge)bridge.openPressure();else tell('请在 Electron 桌宠中打开发泄浮层。');},'click-through':()=>{if(bridge)bridge.setClickThrough(!clickThrough);else tell('点击穿透只在 Electron 桌宠中可用。');},hide:()=>{resetLocal();bridge?.hide();},close:()=>{breath.dispose();bridge?.close();}};
  all('[data-action]').forEach(el=>el.addEventListener('click',()=>actions[el.dataset.action]?.()));
  const unsubscribers=[];
  if(bridge){unsubscribers.push(bridge.onExpandedChanged(applyExpanded),bridge.onClickThroughChanged(enabled=>{clickThrough=enabled;$('[data-action="click-through"]').setAttribute('aria-pressed',String(enabled));}));bridge.ready();}
  document.addEventListener('visibilitychange',()=>{if(document.hidden)breath.pause();});
  window.addEventListener('pagehide',()=>{breath.dispose();unsubscribers.forEach(unsubscribe=>unsubscribe());},{once:true});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')setExpanded(false);});
  breath.reset();renderGround();
})();
