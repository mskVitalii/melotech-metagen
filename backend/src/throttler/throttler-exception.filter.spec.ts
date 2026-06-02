import { ArgumentsHost } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { ThrottlerExceptionFilter } from './throttler-exception.filter';

describe('ThrottlerExceptionFilter', () => {
  let filter: ThrottlerExceptionFilter;
  let mockResponse: {
    status: jest.Mock;
    header: jest.Mock;
    json: jest.Mock;
  };
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new ThrottlerExceptionFilter();

    // Chain-able mock response
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: jest.fn().mockReturnValue(mockResponse),
      }),
    } as unknown as ArgumentsHost;
  });

  it('should set HTTP status 429', () => {
    filter.catch(new ThrottlerException(), mockHost);
    expect(mockResponse.status).toHaveBeenCalledWith(429);
  });

  it('should set Retry-After: 60 header', () => {
    filter.catch(new ThrottlerException(), mockHost);
    expect(mockResponse.header).toHaveBeenCalledWith('Retry-After', '60');
  });

  it('should return exact D-18 body: { statusCode: 429, message: "Too Many Requests", retryAfter: 60 }', () => {
    filter.catch(new ThrottlerException(), mockHost);
    expect(mockResponse.json).toHaveBeenCalledWith({
      statusCode: 429,
      message: 'Too Many Requests',
      retryAfter: 60,
    });
  });

  it('should chain status -> header -> json in correct order', () => {
    const callOrder: string[] = [];
    mockResponse.status.mockImplementation(() => {
      callOrder.push('status');
      return mockResponse;
    });
    mockResponse.header.mockImplementation(() => {
      callOrder.push('header');
      return mockResponse;
    });
    mockResponse.json.mockImplementation(() => {
      callOrder.push('json');
      return mockResponse;
    });

    filter.catch(new ThrottlerException(), mockHost);

    expect(callOrder).toEqual(['status', 'header', 'json']);
  });
});
