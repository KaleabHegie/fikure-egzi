import { buildMariaDbPoolConfig } from './database-url.js';

describe('buildMariaDbPoolConfig', () => {
  it('parses credentials, host, port and database', () => {
    const cfg = buildMariaDbPoolConfig('mysql://app:p%40ss@db.example.com:3307/fikure', 5);
    expect(cfg).toMatchObject({
      host: 'db.example.com',
      port: 3307,
      user: 'app',
      password: 'p@ss',
      database: 'fikure',
      connectionLimit: 5,
    });
  });

  it('defaults the port to 3306', () => {
    expect(buildMariaDbPoolConfig('mysql://a:b@localhost/x', 1).port).toBe(3306);
  });

  it('requires a database name', () => {
    expect(() => buildMariaDbPoolConfig('mysql://a:b@localhost', 1)).toThrow();
  });
});
