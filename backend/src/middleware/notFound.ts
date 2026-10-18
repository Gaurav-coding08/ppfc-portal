import type { Request, Response } from 'express';

// Catches any URL that didn't match a route. Kept as its own middleware
// (instead of folding into errorHandler) so the 404 shape stays identical
// to every other error response.
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `No route for ${req.method} ${req.originalUrl}`,
      requestId: req.id,
    },
  });
}
