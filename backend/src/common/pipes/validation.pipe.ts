import { ValidationError, ValidationPipe } from '@nestjs/common';
import { FieldError, ValidationFailedException } from '../filters/all-exceptions.filter.js';

function flatten(errors: ValidationError[], parent = ''): FieldError[] {
  return errors.flatMap((err) => {
    const field = parent ? `${parent}.${err.property}` : err.property;
    const own = err.constraints ? [{ field, messages: Object.values(err.constraints) }] : [];
    return [...own, ...flatten(err.children ?? [], field)];
  });
}

/**
 * Strict global validation: unknown properties are rejected, payloads are
 * transformed into DTO instances, and failures come back as a field-by-field
 * `details` array the frontend can map straight onto form inputs.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    stopAtFirstError: false,
    exceptionFactory: (errors) => new ValidationFailedException(flatten(errors)),
  });
}
