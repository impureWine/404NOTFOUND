import { Router } from 'express';
import {
  updatePreferencesRequestSchema,
  updateProfileRequestSchema,
} from '@404notfound/contracts';
import { unavailableHandler, validateBody } from '../http.js';

export const createProfileRouter = () => {
  const router = Router();
  router.get('/profile', unavailableHandler);
  router.patch('/profile', validateBody(updateProfileRequestSchema), unavailableHandler);
  router.get('/profile/summary', unavailableHandler);
  router.get('/preferences', unavailableHandler);
  router.patch('/preferences', validateBody(updatePreferencesRequestSchema), unavailableHandler);
  return router;
};
