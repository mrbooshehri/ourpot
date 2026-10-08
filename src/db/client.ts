import { SQL } from 'bun';

export type SqlValue = string | number | boolean | Date | null;
export type SqlResult<Row extends object = Record<string, unknown>> = Readonly<{ rows: Row[] }>;

export type DatabaseClient = Readonly<{
  query<Row extends object = Record<string, unknown>>(sql: string, values?: readonly SqlValue[]): Promise<SqlResult<Row>>;
  transaction<T>(work: (client: DatabaseClient) => Promise<T>): Promise<T>;
}>;

type BunSqlHandle = {
  unsafe<T extends object = Record<string, unknown>>(query: string, values?: readonly SqlValue[]): Promise<T[]>;
  begin<T>(work: (transaction: BunSqlHandle) => Promise<T>): Promise<T>;
};
const handles = new Map<string, BunSqlHandle>();

function wrap(handle: BunSqlHandle): DatabaseClient {
  return {
    async query<Row extends object = Record<string, unknown>>(query: string, values: readonly SqlValue[] = []): Promise<SqlResult<Row>> {
      const rows = await handle.unsafe<Row>(query, values);
      return { rows };
    },
    transaction<T>(work: (client: DatabaseClient) => Promise<T>): Promise<T> {
      return handle.begin((transaction) => work(wrap(transaction)));
    },
  };
}

export function createDatabaseClient(connectionString = process.env.DATABASE_URL): DatabaseClient {
  if (!connectionString) throw new Error('Database connection string is required');
  let handle = handles.get(connectionString);
  if (!handle) {
    handle = new SQL(connectionString) as unknown as BunSqlHandle;
    handles.set(connectionString, handle);
  }
  return wrap(handle);
}
