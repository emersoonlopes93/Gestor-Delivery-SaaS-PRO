import { MenuImportController } from './menu-import.controller';

describe('MenuImportController capability gate', () => {
  it('blocks before invoking the import service when baseMenu.import is OFF', async () => {
    const menuImportService = { importTemplate: jest.fn() };
    const featureControlService = {
      getTenantActionCapability: jest.fn().mockReturnValue({
        enabled: false,
        code: 'BASE_MENU_IMPORT_DISABLED',
        message: 'A importacao de cardapio base esta temporariamente indisponivel.',
      }),
    };
    const controller = new MenuImportController(
      menuImportService as never,
      featureControlService as never,
    );

    await expect(controller.executeImport({ templateId: 'acai' }))
      .rejects.toMatchObject({
        response: {
          code: 'BASE_MENU_IMPORT_DISABLED',
        },
      });
    expect(menuImportService.importTemplate).not.toHaveBeenCalled();
  });

  it('delegates one explicit operation when baseMenu.import is ON', async () => {
    const menuImportService = {
      importTemplate: jest.fn().mockResolvedValue({ success: true, templateId: 'acai' }),
    };
    const featureControlService = {
      getTenantActionCapability: jest.fn().mockReturnValue({ enabled: true }),
    };
    const controller = new MenuImportController(
      menuImportService as never,
      featureControlService as never,
    );

    await expect(controller.executeImport({ templateId: 'acai' })).resolves.toEqual({
      success: true,
      data: { success: true, templateId: 'acai' },
    });
    expect(menuImportService.importTemplate).toHaveBeenCalledTimes(1);
  });
});
