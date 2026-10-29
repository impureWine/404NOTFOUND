const REJECTED_OUTPUT_PATTERNS = [
  /(?:保证|一定|肯定).{0,8}(?:治好|治愈|痊愈|有效)/u,
  /(?:你只需要我|只依赖我|不用找任何人).{0,12}/u,
  /(?:我|系统).{0,8}(?:已经|已)(?:替你)?(?:报警|联系急救|通知警方)/u,
];

/**
 * Rejects a small, explicit set of boundary-breaking synthetic outputs.
 * This complements schema validation; it does not claim semantic coverage.
 */
export function containsRejectedModelClaim(content) {
  if (typeof content !== 'string') return false;
  const normalized = content.normalize('NFKC');
  return REJECTED_OUTPUT_PATTERNS.some((pattern) => pattern.test(normalized));
}

