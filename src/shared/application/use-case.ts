import type { Result } from '../domain/result.js';
import type { AppError } from './app-error.js';

/** One class, one public `execute`. Input and output are DTOs of primitives. */
export interface UseCase<TInput, TOutput> {
  execute(input: TInput): Promise<Result<TOutput, AppError>>;
}
