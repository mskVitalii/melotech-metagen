import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Response } from 'express';

// D-18: Custom filter for exact 429 response body + Retry-After header
// Default ThrottlerException body has "ThrottlerException: Too Many Requests" — not D-18 shape
@Catch(ThrottlerException)
export class ThrottlerExceptionFilter implements ExceptionFilter {
  catch(exception: ThrottlerException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    response
      .status(429)
      .header('Retry-After', '60')
      .json({ statusCode: 429, message: 'Too Many Requests', retryAfter: 60 });
  }
}
