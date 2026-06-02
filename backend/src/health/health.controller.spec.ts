import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(() => {
    controller = new HealthController();
  });

  it('should return status ok', () => {
    const result = controller.check();
    expect(result.status).toBe('ok');
  });

  it('should return a timestamp', () => {
    const result = controller.check();
    expect(result.timestamp).toBeDefined();
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });
});
