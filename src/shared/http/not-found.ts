import type { RequestHandler } from 'express';
import { AppError } from '../application/app-error.js';
import { HTTP_MESSAGES } from './http.messages.js';

/** Mounted after every router and before the funnel. */
export const notFound: RequestHandler = (_request, _response, next) => {
  next(new AppError('NOT_FOUND', HTTP_MESSAGES.notFound, 404));
};
