import React, { useId } from 'react';

export const PETS = [
  { id: 'blob', name: '团团', kind: '柔软圆团', color: '#82b6a1', hello: '我在这里，慢慢说就好。' },
  { id: 'cat', name: '404小猫', kind: '奶油色猫咪', color: '#dec588', hello: '想歇一会儿吗？我陪你。' },
  { id: 'robot', name: '小信使', kind: '404小机器人', color: '#9bbcc3', hello: '先放我这里，等你准备好。' },
];

function Face({ kind, state }) {
  const robot = kind === 'robot';
  const ink = robot ? '#d5e9d6' : kind === 'cat' ? '#665a42' : '#315c4e';
  const y = kind === 'cat' ? 105 : kind === 'blob' ? 128 : 116;
  const left = kind === 'cat' ? 99 : kind === 'blob' ? 99 : 104;
  const right = kind === 'cat' ? 162 : kind === 'blob' ? 158 : 162;
  return <g className={`dp-face ${state === 'breathing' ? 'dp-face-rest' : ''}`}>
    <g className="dp-eyes">
      {state === 'breathing' || state === 'happy' ? <>
        <path d={`M${left-6} ${y}q6 ${state === 'happy' ? -8 : 6} 12 0M${right-6} ${y}q6 ${state === 'happy' ? -8 : 6} 12 0`} fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round" />
      </> : robot ? <path d="M97 117l7-7 6 7m44 0 7-7 7 7" fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /> : <>
        <ellipse cx={left} cy={y} rx="5" ry="7" fill={ink} /><ellipse cx={right} cy={y} rx="5" ry="7" fill={ink} />
      </>}
    </g>
    {kind === 'cat' ? <><path d="M123 119h14l-7 7Z" fill="#aa7d69" /><path d="M117 128q6 8 13 0q7 8 13 0" fill="none" stroke={ink} strokeWidth="2.5" strokeLinecap="round" /></> : <path d={robot ? 'M123 134q10 6 19-1' : 'M121 144q9 8 18 0'} fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round" />}
  </g>;
}

function Parcel() {
  return <g className="dp-parcel"><rect x="96" y="157" width="69" height="43" rx="8" fill="#edd5a4" stroke="#9a895f" strokeWidth="2.5" /><path d="M130 158v42m-33-30h67" stroke="#b69f73" strokeWidth="3" /><path d="M127 160c-21-20-26-1 0 3m6-3c21-20 26-1 0 3" fill="none" stroke="#b69f73" strokeWidth="2" /><path d="M107 185h13" stroke="#fff4d8" strokeWidth="3" strokeLinecap="round" /></g>;
}

export function PetAvatar({ kind = 'blob', state = 'idle', parcel = false, className = '' }) {
  const gradient = `pet-gradient-${useId().replace(/:/g, '')}`;
  const name = PETS.find(p => p.id === kind)?.name || '团团';
  return <svg className={`dp-avatar dp-avatar-${kind} dp-avatar-${state} ${className}`} viewBox="0 0 260 250" role="img" aria-label={`${name}${parcel ? '抱着寄存包裹' : ''}`}>
    <ellipse className="dp-avatar-shadow" cx="132" cy="215" rx="77" ry="10" fill={kind === 'cat' ? '#bcb18b' : '#799e8c'} opacity=".22" />
    <g className="dp-character">
      {kind === 'blob' && <>
        <defs><linearGradient id={gradient} x1="0" y1="0" x2=".7" y2="1"><stop stopColor="#b9dccb" /><stop offset="1" stopColor="#82b6a1" /></linearGradient></defs>
        <path d="M95 77C75 47 94 26 118 51c9-32 30-26 28 10" fill="#a6ceb9" stroke="#528870" strokeWidth="3" strokeLinejoin="round" />
        <ellipse cx="82" cy="201" rx="19" ry="11" fill="#7cae96" /><ellipse cx="177" cy="201" rx="19" ry="11" fill="#7cae96" />
        <path d="M127 62c47 0 76 41 82 85 6 38-23 57-76 58-54 1-85-20-81-55 5-45 27-86 75-88Z" fill={`url(#${gradient})`} stroke="#528870" strokeWidth="3" />
        <path className="dp-left-hand" d="M71 145q-31-8-31 9 3 14 29 10" fill="#98c6af" stroke="#528870" strokeWidth="3" strokeLinecap="round" />
        <path className="dp-right-hand" d="M190 145q32-13 33 7-1 14-28 11" fill="#98c6af" stroke="#528870" strokeWidth="3" strokeLinecap="round" />
        <path d="M82 89q16-14 36-13" fill="none" stroke="#d6e9dd" strokeWidth="9" strokeLinecap="round" opacity=".75" />
        <ellipse cx="80" cy="145" rx="11" ry="6" fill="#e2afa0" opacity=".8" /><ellipse cx="177" cy="145" rx="11" ry="6" fill="#e2afa0" opacity=".8" />
        <Face kind={kind} state={state} /><path d="M121 176q9-8 18 0" fill="none" stroke="#e4f1e9" strokeWidth="3" strokeLinecap="round" />
      </>}
      {kind === 'cat' && <>
        <path className="dp-tail" d="M191 178c34 14 33-19 20-24-10-4-9-16 5-14 31 5 31 61-8 63" fill="#edddb5" stroke="#9d8d66" strokeWidth="3" />
        <path d="M94 143q-23 26-11 57 47 19 97 0 10-28-12-56" fill="#f5e5bf" stroke="#9d8d66" strokeWidth="3" />
        <path d="M65 96l4-55q4-15 28 16 33-14 65 0 22-33 27-16l7 56c9 35-18 59-66 60-50 0-74-26-65-61Z" fill="#faedcb" stroke="#9d8d66" strokeWidth="3" strokeLinejoin="round" />
        <path d="M77 51l15 14-14 7Zm102 0-13 14 18 7Z" fill="#e6b4a2" />
        <path d="M115 51l6 23m16-23-3 23" fill="none" stroke="#e4cb90" strokeWidth="7" strokeLinecap="round" />
        <Face kind={kind} state={state} />
        <ellipse cx="79" cy="120" rx="10" ry="5" fill="#e8b29d" opacity=".7" /><ellipse cx="182" cy="120" rx="10" ry="5" fill="#e8b29d" opacity=".7" />
        <path d="M88 151q41 18 88-1l-2 13q-46 19-85 1Z" fill="#7ba893" /><path d="M154 165l14 21-15-1-8-18" fill="#628e78" />
        <path d="M104 178l-2 20m49-19 2 19" fill="none" stroke="#c7b58c" strokeWidth="3" strokeLinecap="round" />
        <ellipse cx="100" cy="202" rx="17" ry="8" fill="#f5e5bf" stroke="#9d8d66" strokeWidth="2" /><ellipse cx="160" cy="202" rx="17" ry="8" fill="#f5e5bf" stroke="#9d8d66" strokeWidth="2" />
      </>}
      {kind === 'robot' && <>
        <path d="M131 68V43" stroke="#60838b" strokeWidth="4" strokeLinecap="round" /><circle className="dp-antenna" cx="131" cy="34" r="10" fill="#e4b85e" stroke="#a28c57" strokeWidth="2.5" />
        <path className="dp-left-hand" d="M66 132l-19 9q-9 9-3 20l20 10" fill="#9bbcc3" stroke="#60838b" strokeWidth="3" strokeLinecap="round" />
        <path className="dp-right-hand" d="M198 133l20 9q8 9 2 20l-19 10" fill="#9bbcc3" stroke="#60838b" strokeWidth="3" strokeLinecap="round" />
        <rect x="90" y="193" width="23" height="19" rx="7" fill="#87a9b0" /><rect x="151" y="193" width="23" height="19" rx="7" fill="#87a9b0" />
        <rect x="61" y="65" width="143" height="138" rx="37" fill="#bdd6db" stroke="#60838b" strokeWidth="3" />
        <path d="M79 85q19-12 40-9" fill="none" stroke="#e2edf0" strokeWidth="7" strokeLinecap="round" />
        <rect x="78" y="94" width="108" height="66" rx="23" fill="#4e6e74" /><Face kind={kind} state={state} />
        <text x="132" y="151" textAnchor="middle" fontSize="9" fontFamily="monospace" fill="#91b9ae" letterSpacing="3">404</text>
        <rect x="114" y="174" width="35" height="23" rx="4" fill="#edd5a4" stroke="#9a895f" strokeWidth="2" /><path d="M131 175v21m-15-15h31" stroke="#b69f73" strokeWidth="2" />
        <circle cx="92" cy="182" r="3" fill="#81aa97" /><circle cx="172" cy="182" r="3" fill="#81aa97" />
      </>}
      {parcel && <Parcel />}
    </g>
  </svg>;
}
