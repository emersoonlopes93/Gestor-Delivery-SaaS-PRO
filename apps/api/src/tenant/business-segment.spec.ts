import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';

describe('UpdateTenantSettingsDto businessSegment', () => {
  it.each(['PIZZARIA', 'ACAI', 'MERCADO', 'OTHER'])('accepts canonical value %s', async (businessSegment) => {
    const dto = plainToInstance(UpdateTenantSettingsDto, { businessSegment });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects values outside the canonical domain', async () => {
    const dto = plainToInstance(UpdateTenantSettingsDto, { businessSegment: 'SUSHI' });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'businessSegment')).toBe(true);
  });
});
