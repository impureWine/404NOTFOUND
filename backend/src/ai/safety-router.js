const IMMINENT_SELF_HARM_PATTERNS = [
  /(?:我|自己).{0,12}(?:自杀|轻生|结束生命|伤害自己)/u,
  /(?:我要|我想|我准备|我打算).{0,8}(?:去死|不活了|结束这一切)/u,
];

const IMMINENT_OTHER_HARM_PATTERNS = [
  /(?:我要|我想|我准备|我打算).{0,12}(?:杀死|杀了|捅伤|砍伤|伤害)(?:他|她|别人|他们|她们|同学|同事|家人)/u,
];

export const FIXED_SAFETY_RESPONSE = Object.freeze({
  text: '我很在意你和身边人的安全。请先远离可能造成伤害的物品或场所，并尽快联系一位可信赖的人陪在身边。如果危险正在发生或可能马上发生，请立即联系所在地紧急服务或前往最近的急诊。这个系统不能替代紧急或专业支持，也无法代你报警。',
  route: 'SAFETY',
});

/**
 * A deliberately narrow pre-route for explicit, imminent harm statements.
 * It is deterministic and auditable, but it is not a clinical risk assessment
 * or a production-grade content safety classifier.
 */
export function routeSafetyInput(input) {
  if (typeof input !== 'string') return null;
  const text = input.normalize('NFKC').trim();
  if (!text) return null;

  if (IMMINENT_SELF_HARM_PATTERNS.some((pattern) => pattern.test(text))) {
    return Object.freeze({ ...FIXED_SAFETY_RESPONSE, reason: 'EXPLICIT_SELF_HARM' });
  }
  if (IMMINENT_OTHER_HARM_PATTERNS.some((pattern) => pattern.test(text))) {
    return Object.freeze({ ...FIXED_SAFETY_RESPONSE, reason: 'EXPLICIT_OTHER_HARM' });
  }
  return null;
}

