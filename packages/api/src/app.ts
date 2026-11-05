import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { apiRouter } from './routes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '16kb' }));
  app.use(cookieParser());
  app.get('/api/health', (_request, response) => response.json({ status: 'ok' }));
  app.use('/api', apiRouter);
  app.use((_request, response) => response.status(404).json({ message: 'Không tìm thấy tài nguyên.' }));
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    console.error(error);
    response.status(500).json({ message: 'Lỗi máy chủ.' });
  });
  return app;
}
