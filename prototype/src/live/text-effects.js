export const stageWidth = 800;
export const stageHeight = 440;

const centerX = stageWidth / 2;
const centerY = stageHeight / 2;
const turn = Math.PI * 2;
const clamp = value => Math.max(0, Math.min(1, value));
const mix = (from, to, amount) => from + (to - from) * amount;
const ink = '#f4eff3';

function dust(count, seed) {
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  return Array.from({ length: count }, () => Array.from({ length: 5 }, random));
}

const motes = dust(120, 9241);
const stars = dust(86, 3922);
const palettes = {
  burn: ['#18101a', '#4b2020', '#fe914a'],
  blackhole: ['#0d1324', '#302350', '#a898ff'],
  shred: ['#131d22', '#24413e', '#86d8cb'],
};

function haze(ctx, x, y, radius, color) {
  const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
  glow.addColorStop(0, color);
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function dot(ctx, x, y, size) {
  ctx.beginPath();
  ctx.arc(x, y, size, 0, turn);
  ctx.fill();
}

function backdrop(ctx, mode) {
  const [base, glow, accent] = palettes[mode];
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, stageWidth, stageHeight);
  haze(ctx, centerX, mode === 'burn' ? stageHeight : centerY, 390, glow);
  ctx.fillStyle = accent;
  for (const [x, y, size, brightness] of stars) {
    ctx.globalAlpha = .07 + brightness * .23;
    dot(ctx, x * stageWidth, y * stageHeight, .5 + size);
  }
  ctx.globalAlpha = 1;
}

function blackHole(ctx, progress, strength) {
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(-.23);
  const radius = 36 + strength * 12;
  haze(ctx, 0, 0, 156 + strength * 30, '#6e55a58c');
  ctx.globalCompositeOperation = 'screen';
  for (let ring = 0; ring < 8; ring++) {
    ctx.strokeStyle = ring % 2 ? '#e7a5dc' : '#978dff';
    ctx.globalAlpha = (.22 + strength * .34) * (1 - ring / 12);
    ctx.lineWidth = ring === 0 ? 3 : 1.2;
    ctx.beginPath();
    const angle = ring * .65 + progress * (8 - ring * .4);
    ctx.ellipse(0, 0, radius + 14 + ring * 12, radius * .28 + 5 + ring * 5, 0, angle, angle + 4.4);
    ctx.stroke();
  }
  for (const [seed, span, speed, size, light] of motes) {
    const distance = 55 + span * (145 - strength * 43);
    const angle = seed * turn + progress * (4 + speed * 13);
    ctx.fillStyle = light > .5 ? '#ffd4ec' : '#8ec8ff';
    ctx.globalAlpha = (.16 + light * .59) * (.45 + strength * .55);
    dot(ctx, Math.cos(angle) * distance, Math.sin(angle) * distance * .34, .7 + size * 1.6);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#080b16';
  dot(ctx, 0, 0, radius);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#d8c1f0';
  ctx.stroke();
  ctx.restore();
}

function fire(ctx, progress, strength) {
  const front = mix(40, 760, clamp(progress / .72));
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = strength;
  haze(ctx, front, 310, 156, '#db4c256e');
  for (let plume = 0; plume < 11; plume++) {
    const sway = Math.sin(progress * 16 + plume * .92);
    const rise = (58 + 72 * Math.abs(sway)) * strength;
    const x = front + (plume - 5) * 15;
    ctx.globalAlpha = strength * (.14 + .18 * Math.abs(sway));
    ctx.strokeStyle = plume % 3 === 0 ? '#ffd180' : '#fb693d';
    ctx.lineWidth = 1 + strength * (3 + plume % 4);
    ctx.beginPath();
    ctx.moveTo(x, 364);
    ctx.bezierCurveTo(x - sway * 24, 332, x + sway * 52, 338 - rise, x + sway * 24, 362 - rise);
    ctx.stroke();
  }
  const spread = strength ? 300 : 480;
  for (const [seed, spreadSeed, speed, size, phase] of motes) {
    const age = strength ? (progress * (1.3 + speed) + phase) % 1 : phase;
    const x = (strength ? front : centerX) + (spreadSeed - .5) * spread + Math.sin(age * 7 + seed * turn) * age * 25;
    const y = 365 - age * (90 + speed * 180);
    const opacity = (1 - age) * (.32 + strength * .68);
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = seed > .55 ? '#ffd386' : '#ff693c';
    ctx.lineWidth = .7 + size * 2.1;
    ctx.beginPath();
    ctx.moveTo(x, y + (4 + size * 19) * strength);
    ctx.lineTo(x + (seed - .5) * 5, y);
    ctx.stroke();
  }
  ctx.restore();
}

export function createTextScene(text, measureWidth) {
  const letters = [];
  const rowEnds = new Map();
  const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text);
  let x = 65;
  let y = 65;
  for (const { segment } of graphemes) {
    const advance = Math.max(12, measureWidth(segment) + 2);
    if (x + advance > 735 || segment.includes('\n')) {
      x = 65;
      y += 24;
    }
    if (y > 370) break;
    if (!/^\s+$/u.test(segment)) {
      letters.push({ segment, x, y, phase: Math.random(), drift: Math.random() - .5 });
      rowEnds.set(y, x + advance);
    }
    if (!segment.includes('\n')) x += advance;
  }
  if (!letters.length) return letters;
  const offsetY = centerY - (letters[0].y + letters.at(-1).y) / 2;
  for (const letter of letters) {
    letter.x += centerX - (65 + rowEnds.get(letter.y)) / 2;
    letter.y += offsetY;
  }
  return letters;
}

function drawLetter(ctx, letter, mode, progress) {
  const { x, y, phase, drift, segment } = letter;
  let p, px, py, angle, scale, color;
  if (mode === 'blackhole') {
    p = clamp((progress - phase * .17) / .72);
    const pull = p * p;
    const radius = Math.hypot(x - centerX, y - centerY) * (1 - pull);
    angle = Math.atan2(y - centerY, x - centerX) + pull * (5 + phase * 3);
    px = centerX + Math.cos(angle) * radius;
    py = centerY + Math.sin(angle) * radius;
    scale = 1 - pull * .82;
    color = p > .45 ? '#c1baff' : ink;
    angle = pull * (4 + drift);
  } else if (mode === 'burn') {
    p = clamp((progress - (x / stageWidth) * .54 - phase * .06) / .40);
    px = x + drift * 100 * p;
    py = y - (25 + phase * 105) * p;
    angle = drift * p * 2;
    scale = 1 - p * .42;
    color = p > .55 ? '#bd8079' : p > .1 ? '#ffc17c' : ink;
  } else {
    p = clamp((progress - phase * .12) / .83);
    px = x + drift * 380 * p;
    py = y + p * (phase * 130 + p * 125);
    angle = drift * p * 7;
    scale = 1 - p * .35;
    color = p > .2 ? '#98dacc' : ink;
  }
  if (p >= 1 || (mode === 'blackhole' && p > .35 && Math.hypot(px - centerX, py - centerY) < 35)) return;
  if (mode === 'burn' && p > 0 && p < .85) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = Math.sin(p * Math.PI) * .75;
    ctx.fillStyle = phase > .5 ? '#ffd180' : '#fa6942';
    dot(ctx, px + drift * 21, py - phase * 19, 1 + phase);
    dot(ctx, px - drift * 28, py + 12, 1);
    ctx.restore();
  }
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.globalAlpha = 1 - p * p;
  ctx.fillStyle = color;
  ctx.fillText(segment, 0, 0);
  ctx.restore();
}

export const textSceneFont = '19px system-ui, sans-serif';

export function drawTextScene(ctx, mode, letters = [], progress = 0) {
  const strength = letters.length ? Math.sin(Math.PI * clamp(progress)) : 0;
  backdrop(ctx, mode);
  if (mode === 'blackhole') blackHole(ctx, progress, strength);
  if (mode === 'burn') fire(ctx, progress, strength);
  if (mode === 'shred') {
    ctx.fillStyle = '#94d5ca';
    for (const [x, y, drift, size, light] of motes) {
      ctx.globalAlpha = .05 + light * strength * .5;
      ctx.fillRect(x * stageWidth + (drift - .5) * progress * 120, y * stageHeight + progress * 80, 1 + size * 3, 1 + size * 2);
    }
    ctx.globalAlpha = 1;
  }
  ctx.font = textSceneFont;
  for (const letter of letters) drawLetter(ctx, letter, mode, progress);
}
