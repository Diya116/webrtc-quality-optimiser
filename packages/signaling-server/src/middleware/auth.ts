import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../config/jwt';
//import { compileFunction } from 'vm';

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get token from header
    console.log("auth middleware called");
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'No token provided'
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer '
   console.log("Token:", token);
    // Verify token
    const payload = verifyToken(token);

    // Attach user to request
    (req as any).user = payload;
    console.log("User:", (req as any).user);
    next();
  } catch (error: any) {
    res.status(401).json({
      success: false,
      error: error.message || 'Invalid or expired token'
    });
  }
};