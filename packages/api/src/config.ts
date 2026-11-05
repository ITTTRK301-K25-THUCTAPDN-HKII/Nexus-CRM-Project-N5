import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const localEnv = resolve(process.cwd(), '.env');
const workspaceEnv = resolve(process.cwd(), '../../.env');
dotenv.config({ path: existsSync(localEnv) ? localEnv : workspaceEnv });

const developmentSecret = 'local-demo-secret-change-before-deploy-32';
const configSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_USER: z.string().default('root'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().default('nexus_crm'),
  JWT_SECRET: z.string().min(32).default(developmentSecret),
  CRM_PROVIDER_API_KEY: z.string().optional(),
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
