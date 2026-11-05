import type { Request, Response } from 'express';
import { setAuthCookies } from '../auth.js';
import { loginSchemaForController } from '../schemas/auth.schema.js';
import { loginWithEmailAndPassword } from '../services/auth.service.js';

export async function loginController(request: Request, response: Response): Promise<void> {
  const parsed = loginSchemaForController.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      message: 'Dữ liệu không hợp lệ.',
      errors: parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
    });
    return;
  }

  const result = await loginWithEmailAndPassword(parsed.data.email, parsed.data.password);
  if (!result.ok) {
    response.status(401).json({ message: 'Email hoặc mật khẩu không chính xác, hoặc tài khoản chưa hoạt động.' });
    return;
  }
  await setAuthCookies(response, result.user);
  response.json({ user: result.user });
}
