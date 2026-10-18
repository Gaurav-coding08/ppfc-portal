import type { NextFunction, Request, Response } from 'express';
import type { ZodSchema } from 'zod';

interface ValidateSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

// Parses req.body/query/params against the given zod schemas and replaces
// them with the parsed (and possibly coerced/defaulted) values, so
// downstream controllers never re-validate. A ZodError is forwarded to
// errorHandler, which already maps it to 400 VALIDATION_ERROR.
//
// req.body is reassigned directly (its type is `any`). req.query/params are
// mutated in place with Object.assign instead, since Express types those as
// ParsedQs/ParamsDictionary (string-keyed) and a schema may coerce values to
// other types (e.g. numbers for pagination) that wouldn't satisfy a direct
// reassignment under strict mode.
export function validate(schemas: ValidateSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) Object.assign(req.query, schemas.query.parse(req.query));
      if (schemas.params) Object.assign(req.params, schemas.params.parse(req.params));
      next();
    } catch (err) {
      next(err);
    }
  };
}
