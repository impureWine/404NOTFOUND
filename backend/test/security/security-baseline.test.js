/**
 * Alpha 冲刺 Day 1 安全基线用例（安全 / 内容审核岗，T07）。
 *
 * 目的：把《404烦恼未找到_安全设计附录》中当前**可以真正执行**的 SEC-AT 用例落成代码，
 * 让"隔离生效""撤销生效""错误响应不泄露""文字销毁无存储结构"这四类结论绑定到可复跑的运行证据，
 * 而不是只写在文档里。
 *
 * 边界声明（不得在日报中省略）：
 * 1. 本文件只覆盖仓储层、契约层与健康检查，不覆盖 HTTP 认证、Cookie/CSRF、模型链路与 Electron。
 * 2. 使用 PGlite 隔离 PostgreSQL 引擎，不能替代正式 PostgreSQL 16 服务、权限与备份恢复验收。
 * 3. 通过即"该条在本次运行环境下成立"，不等于系统整体已通过安全验收。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';

import { createApp } from '../../src/app.js';
import { recordCreateSchema, recordKinds } from '../../src/contracts/records.js';
import { NotFoundError } from '../../src/domain/errors.js';
import { IdentityRepository } from '../../src/repositories/identity-repository.js';
import { RecordRepository } from '../../src/repositories/record-repository.js';
import { createTestDatabase, seedScope } from '../helpers/database.js';

const cipher = (value) => Buffer.from(`synthetic:${value}`, 'utf8');

function conversationInput(scope, overrides = {}) {
  return {
    ...scope,
    requestId: randomUUID(),
    kind: 'CONVERSATION',
    titleCiphertext: cipher('title'),
    titleKeyVersion: 1,
    details: {
      messages: [
        { role: 'USER', contentCiphertext: cipher('message'), cipherKeyVersion: 1 },
      ],
    },
    ...overrides,
  };
}

async function withDatabase(run) {
  const database = await createTestDatabase();
  try {
    return await run(database);
  } finally {
    await database.close();
  }
}

test('SEC-03 / AT-SEC-02：客户端自报归属字段被契约拒绝，scope 不可省略', async () => {
  const scope = { accountId: randomUUID(), entryPointId: randomUUID() };
  const payload = conversationInput(scope);

  // 正例：服务端派生 scope 之后，合法载荷可以被契约接受。
  assert.equal(recordCreateSchema.safeParse(payload).success, true);

  // 反例 1：客户端额外塞入 ownerId（权限矩阵 P-24）必须被严格契约拒绝。
  const forged = recordCreateSchema.safeParse({ ...payload, ownerId: randomUUID() });
  assert.equal(forged.success, false, 'ownerId 不应能通过严格契约');
  assert.match(JSON.stringify(forged.error.issues), /ownerId/);

  // 反例 2：客户端额外塞入 entry（入口标识）同样必须被拒绝。
  const forgedEntry = recordCreateSchema.safeParse({ ...payload, entry: 'DESKTOP' });
  assert.equal(forgedEntry.success, false, 'entry 不应能通过严格契约');

  // 反例 3：省略 scope 时必须失败，防止出现"无主记录"。
  const { accountId, entryPointId, ...withoutScope } = payload;
  assert.equal(accountId !== undefined && entryPointId !== undefined, true);
  assert.equal(recordCreateSchema.safeParse(withoutScope).success, false);

  // 结论口径：仓储把 accountId/entryPointId 视为"已认证输入"，因此接入层一旦建立 HTTP DTO，
  // 必须在服务端重建 scope 后调用仓储，不能把本契约直接当作请求体契约使用。
});

test('SEC-03 / AT-SEC-01：他人记录编号无法读取，也无法签发清除确认', async () => {
  await withDatabase(async (database) => {
    const scopeA = await seedScope(database, 'sec_a');
    const scopeB = await seedScope(database, 'sec_b');
    const repository = new RecordRepository(database);
    const created = await repository.create(conversationInput(scopeA));

    // B 用自己的合法会话、拿着 A 的记录编号：读取被拒绝。
    await assert.rejects(
      repository.get({ ...scopeB, recordId: created.id }),
      NotFoundError,
    );

    // B 试图签发清除确认：同样被拒绝，且不泄露该记录是否存在。
    await assert.rejects(
      repository.issueClearConfirmation({
        ...scopeB,
        recordId: created.id,
        requestId: randomUUID(),
        expectedVersion: created.version,
      }),
      NotFoundError,
    );

    // A 的记录未受任何影响。
    assert.equal((await repository.list(scopeA)).items.length, 1);
    assert.equal((await repository.get({ ...scopeA, recordId: created.id })).id, created.id);
  });
});

test('SEC-09 / AT-SEC-03：同账号换入口默认读不到记录（跨入口隔离）', async () => {
  await withDatabase(async (database) => {
    const webScope = await seedScope(database, 'sec_entry');
    const desktopEntry = await database.query(
      "INSERT INTO entry_points (code) VALUES ('DESKTOP_SEC_ENTRY') RETURNING id",
    );
    const repository = new RecordRepository(database);
    const created = await repository.create(conversationInput(webScope));

    const desktopScope = {
      accountId: webScope.accountId,
      entryPointId: desktopEntry.rows[0].id,
    };

    assert.equal((await repository.list(desktopScope)).items.length, 0);
    await assert.rejects(
      repository.get({ ...desktopScope, recordId: created.id }),
      NotFoundError,
    );

    // Web 入口自身仍然正常，证明隔离没有误伤。
    assert.equal((await repository.get({ ...webScope, recordId: created.id })).id, created.id);
  });
});

test('SEC-02 / AT-SEC-04：会话撤销后旧令牌摘要不能再查到会话', async () => {
  await withDatabase(async (database) => {
    const scope = await seedScope(database, 'sec_session');
    const identity = new IdentityRepository(database);
    const tokenDigest = randomBytes(32);

    const session = await identity.createSession({
      ...scope,
      tokenDigest,
      deviceId: null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    const found = await identity.findActiveSession({ tokenDigest });
    assert.equal(found.sessionId, session.sessionId);

    assert.equal(await identity.revokeSession(session.sessionId), true);

    await assert.rejects(
      identity.findActiveSession({ tokenDigest }),
      NotFoundError,
    );

    // 改密场景依赖 revokeAllSessions：一次撤销该账号全部有效会话。
    const second = await identity.createSession({
      ...scope,
      tokenDigest: randomBytes(32),
      deviceId: null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    assert.ok(second.sessionId);
    assert.equal(await identity.revokeAllSessions(scope.accountId), 1);
  });
});

test('SEC-12：数据库不可用时健康检查只返回通用错误，不泄露连接串或异常细节', async () => {
  const secret = 'postgres://app_user:synthetic-secret@127.0.0.1:5432/404notfound';
  const database = {
    query: async () => {
      throw new Error(`connect ECONNREFUSED ${secret}`);
    },
  };
  const server = createApp({ database }).listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/health/ready`);

    assert.equal(response.status, 503);
    const body = await response.json();
    assert.deepEqual(body, {
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Database is unavailable' },
    });

    const serialized = JSON.stringify(body);
    assert.equal(serialized.includes('synthetic-secret'), false);
    assert.equal(serialized.includes('ECONNREFUSED'), false);
    assert.equal(serialized.includes('postgres://'), false);

    // 存活性检查不应因数据库故障而失败。
    const live = await fetch(`http://127.0.0.1:${port}/health/live`);
    assert.equal(live.status, 200);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('SEC-08 结构检查：数据库与记录类型中不存在文字销毁正文的存储位', async () => {
  await withDatabase(async (database) => {
    const columns = await database.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          table_name ~* '(destroy|burn|incinerat|cremat|ash_)'
          OR column_name ~* '(destroy|burn|incinerat|cremat|ash_)'
        )
    `);
    assert.deepEqual(columns.rows, [], '文字销毁不应存在任何表或列');

    // 记录类型枚举中也不应有可供销毁正文落库的 kind。
    assert.equal(
      recordKinds.some((kind) => /DESTROY|BURN|INCINERAT/.test(kind)),
      false,
      'recordKinds 不应包含销毁类记录',
    );
  });
});
