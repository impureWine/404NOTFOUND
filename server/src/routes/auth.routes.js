import { Router } from 'express';
import {
  changePasswordRequestSchema,
  loginRequestSchema,
  logoutRequestSchema,
  registerRequestSchema,
} from '@404notfound/contracts';
import { unavailableHandler, validateBody } from '../http.js';

export const createAuthRouter = () => {
  const router = Router();
  router.get('/context', unavailableHandler);
  router.post('/register', validateBody(registerRequestSchema), unavailableHandler);
  router.post('/login', validateBody(loginRequestSchema), unavailableHandler);
  router.post('/logout', validateBody(logoutRequestSchema), unavailableHandler);
  router.post('/change-password', validateBody(changePasswordRequestSchema), unavailableHandler);
  return router;
};
