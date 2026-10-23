export function createSyntheticModelRequest(overrides = {}) {
  const base = {
    contract_version: '1.1',
    request_id: 'req-synthetic-001',
    session_id: 'session-synthetic-001',
    mode: 'COMPANION',
    task_type: 'COMPANION_REPLY',
    locale: 'zh-CN',
    state: {
      session_state: 'IDLE',
      confirmed_goal: null,
      history_retention: false,
      long_term_memory_enabled: false,
    },
    context: {
      summary: null,
      recent_messages: [{ role: 'user', content: '这是一条不含真实隐私的合成测试输入。' }],
      sources: [],
      relevant_memories: [],
    },
    constraints: {
      max_output_tokens: 256,
      require_sources: false,
      allowed_actions: ['STAY', 'ASK_CLARIFICATION'],
      forbidden_claims: ['DIAGNOSIS', 'TREATMENT_GUARANTEE'],
    },
    metadata: {
      trace_id: 'trace-synthetic-001',
      prompt_version: 'companion-v1',
    },
  };

  return {
    ...base,
    ...overrides,
    state: { ...base.state, ...overrides.state },
    context: { ...base.context, ...overrides.context },
    constraints: { ...base.constraints, ...overrides.constraints },
    metadata: { ...base.metadata, ...overrides.metadata },
  };
}
