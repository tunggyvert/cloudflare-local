import test from 'node:test'
import assert from 'node:assert/strict'
import { CloudflareProvider } from '../src/core/providers/cloudflare.ts'

test('CloudflareProvider: queryD1ReadOnly allows valid read-only SQL', async () => {
  const provider = new CloudflareProvider({
    apiToken: 'dummy-token',
    accountId: 'dummy-account',
  })

  // Valid read-only queries should pass validation (and only fail because dummy credentials can't reach Cloudflare network)
  const queries = [
    'SELECT * FROM users LIMIT 10;',
    'SELECT id, name, email FROM accounts WHERE active = 1',
    'PRAGMA table_info(users);',
    'PRAGMA table_list;',
    'EXPLAIN QUERY PLAN SELECT * FROM items;',
    'WITH active_users AS (SELECT * FROM users WHERE active = 1) SELECT count(*) FROM active_users;',
  ]

  for (const q of queries) {
    const result = await provider.queryD1ReadOnly('fake-db-id', q)
    // If validation fails, error message mentions 'Mutation/DDL query rejected' or 'Only SELECT...'
    const isValidationError =
      result.error?.includes('Mutation/DDL query rejected') ||
      result.error?.includes('Only SELECT') ||
      result.error?.includes('Empty SQL')

    assert.equal(isValidationError, false, `Query "${q}" should pass read-only validation`)
  }
})

test('CloudflareProvider: queryD1ReadOnly blocks dangerous/mutating SQL', async () => {
  const provider = new CloudflareProvider({
    apiToken: 'dummy-token',
    accountId: 'dummy-account',
  })

  const dangerousQueries = [
    'INSERT INTO users (name) VALUES ("hacker");',
    'UPDATE users SET role = "admin";',
    'DELETE FROM users WHERE 1=1;',
    'DROP TABLE secrets;',
    'ALTER TABLE users ADD COLUMN pass TEXT;',
    'CREATE TABLE evil (x INT);',
    'VACUUM;',
    'ATTACH DATABASE "other.db" AS other;',
    'COMMIT;',
  ]

  for (const q of dangerousQueries) {
    const result = await provider.queryD1ReadOnly('fake-db-id', q)
    assert.equal(result.columns.length, 0)
    assert.equal(result.rows.length, 0)
    assert.ok(
      result.error?.includes('Mutation/DDL query rejected') || result.error?.includes('Only SELECT'),
      `Query "${q}" must be rejected by read-only validator`
    )
  }
})
