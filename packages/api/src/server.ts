import { createApp } from './app.js';
import { config } from './config.js';
import { db } from './db.js';
import { seedDevelopmentUsers } from './seed.js';

await db.query('SELECT 1');
await seedDevelopmentUsers();
const server = createApp().listen(config.PORT, () => console.log(`Nexus API listening on http://localhost:${config.PORT}`));

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      void db.end();
      process.exit(0);
    });
  });
}
