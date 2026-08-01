import 'reflect-metadata';
import { DriverAuthController } from './driver-auth.controller';

describe('DriverAuthController rate limiting', () => {
  it('keeps slugless login and tenant selection on the hardened auth bucket', () => {
    expect(Reflect.getMetadata('THROTTLER:LIMITauth', DriverAuthController.prototype.login)).toBe(5);
    expect(Reflect.getMetadata('THROTTLER:TTLauth', DriverAuthController.prototype.login)).toBe(60);
    expect(Reflect.getMetadata('THROTTLER:LIMITauth', DriverAuthController.prototype.selectTenant)).toBe(5);
    expect(Reflect.getMetadata('THROTTLER:TTLauth', DriverAuthController.prototype.selectTenant)).toBe(60);
  });
});
