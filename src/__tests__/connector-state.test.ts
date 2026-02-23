import { setConnectorState, getConnectorState } from '../connector/state.js';

type ConnectorRow = {
  workspace_id: string;
  connector_id: string;
  state: string;
  data_json: string;
  created_at: string;
  updated_at: string;
};

class MockStatement {
  constructor(
    private readonly store: Map<string, ConnectorRow>,
    private readonly type: 'insert' | 'select',
  ) {}

  run(params: {
    workspace_id: string;
    connector_id: string;
    state: string;
    data_json: string;
    created_at: string;
    updated_at: string;
  }): void {
    if (this.type !== 'insert') throw new Error('Unsupported run() for statement');
    const key = `${params.workspace_id}:${params.connector_id}`;
    const existing = this.store.get(key);
    this.store.set(key, {
      workspace_id: params.workspace_id,
      connector_id: params.connector_id,
      state: params.state,
      data_json: params.data_json,
      created_at: existing?.created_at ?? params.created_at,
      updated_at: params.updated_at,
    });
  }

  get(workspaceId: string, connectorId: string): ConnectorRow | undefined {
    if (this.type !== 'select') throw new Error('Unsupported get() for statement');
    const key = `${workspaceId}:${connectorId}`;
    const row = this.store.get(key);
    if (!row) return undefined;
    return { ...row };
  }
}

class MockDatabase {
  private readonly store = new Map<string, ConnectorRow>();

  prepare(sql: string): MockStatement {
    if (sql.includes('INSERT INTO connector_state')) {
      return new MockStatement(this.store, 'insert');
    }
    if (sql.startsWith('SELECT workspace_id')) {
      return new MockStatement(this.store, 'select');
    }
    throw new Error(`Unsupported SQL in test: ${sql}`);
  }
}

describe('connector state persistence', () => {
  function setupDb() {
    return new MockDatabase() as unknown as import('better-sqlite3').Database;
  }

  it('upserts connector state and merges metadata', () => {
    const db = setupDb();

    const first = setConnectorState(db, 'ws1', 'connector.github.app', 'UserAuthed', {
      user_login: 'alice',
    });

    expect(first.state).toBe('UserAuthed');
    expect(first.data.user_login).toBe('alice');

    const second = setConnectorState(db, 'ws1', 'connector.github.app', 'AppInstalled', {
      app_installation_id: 1234,
    });

    expect(second.state).toBe('AppInstalled');
    expect(second.data.user_login).toBe('alice');
    expect(second.data.app_installation_id).toBe(1234);

    const record = getConnectorState(db, 'ws1', 'connector.github.app');
    expect(record?.state).toBe('AppInstalled');
    expect(record?.data.app_installation_id).toBe(1234);
  });

  it('can replace metadata when merge disabled', () => {
    const db = setupDb();

    setConnectorState(db, 'ws2', 'connector.youtube.app', 'UserAuthed', {
      mode: 'assist',
      scopes: 'read',
    });

    const updated = setConnectorState(
      db,
      'ws2',
      'connector.youtube.app',
      'AppActive',
      { mode: 'publish' },
      { mergeData: false },
    );

    expect(updated.state).toBe('AppActive');
    expect(updated.data.mode).toBe('publish');
    expect(updated.data.scopes).toBeUndefined();
  });
});
