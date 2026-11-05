import { createApp } from './app.js';
import { config } from './config.js';
import { db } from './db.js';
import './seed.js';

const server = createApp().listen(config.PORT, () => {
  console.log(`Nexus API listening on http://localhost:${config.PORT}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
