import 'dotenv/config';
import { z } from 'zod';

const developmentSecret = 'local-demo-secret-change-before-deploy-32';
const configSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_PATH: z.string().default('./data/nexus.sqlite'),
  JWT_SECRET: z.string().min(32).default(developmentSecret),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
}).superRefine((values, context) => {
  if (values.NODE_ENV === 'production' &&
      (!process.env.JWT_SECRET || values.JWT_SECRET === developmentSecret)) {
    context.addIssue({
      code: 'custom',
      path: ['JWT_SECRET'],
      message: 'JWT_SECRET must be explicitly configured outside development.',
    });
  }
});

export const config = configSchema.parse(process.env);
