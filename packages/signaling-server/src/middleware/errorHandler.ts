import { Request, Response, NextFunction } from 'express';

export const errorHandler = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error('Error:', error);

  // Prisma errors
  if (error.code === 'P2002') {
    res.status(409).json({
      success: false,
      error: 'A record with this unique field already exists'
    });
    return;
  }

  if (error.code === 'P2025') {
    res.status(404).json({
      success: false,
      error: 'Record not found'
    });
    return;
  }

  // Default error
  res.status(error.status || 500).json({
    success: false,
    error: error.message || 'Internal server error'
  });
};