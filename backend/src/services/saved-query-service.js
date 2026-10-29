import { SavedQueryRepository } from '../repositories/saved-query-repository.js';
import { encryptProfileText } from '../security/crypto.js';
export function createSavedQueries(database, taskService, key) {
  return new SavedQueryRepository(database, { resolveCompletedSearch: async ({ accountId, entryPointId, searchRequestId }) => {
    const task = taskService.searchTasks.get(searchRequestId);
    if (!task || task.ownerKey !== taskService.ownerKey({ accountId, entryPointId }) || task.entryPointId !== entryPointId) return null;
    return { accountId, entryPointId, searchRequestId, status: task.status, searchState: task.searchState,
      rawQueryCiphertext: encryptProfileText(task.question, key), normalizedQueryCiphertext: encryptProfileText(task.question, key), cipherKeyVersion: 1,
      partial: Boolean(task.partial), hasConflict: Boolean(task.hasConflict), uncertaintyNote: '来源摘录仅作检索线索，未经独立事实核验。',
      sources: (task.sources || []).map(({ snippet, id, ...source }) => source),
      claims: (task.sources || []).filter(source => source.snippet).map(source => ({ claimTextCiphertext: encryptProfileText(source.snippet, key), cipherKeyVersion: 1, status: 'UNKNOWN', evidence: [{ sourceUrl: source.url, relation: 'CONTEXT' }] })),
    };
  } });
}
