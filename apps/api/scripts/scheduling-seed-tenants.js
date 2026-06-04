const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const tenants = await prisma.tenant.findMany({
      select: {
        id: true,
        settings: {
          select: { timezone: true },
        },
      },
    });

    for (const tenant of tenants) {
      const timezone = tenant.settings?.timezone || 'America/Sao_Paulo';

      const existingSettings = await prisma.schedulingSettings.findUnique({
        where: { tenantId: tenant.id },
      });

      if (!existingSettings) {
        await prisma.schedulingSettings.create({
          data: {
            tenantId: tenant.id,
            enabled: true,
            acceptScheduledOrders: true,
            minimumAdvanceMinutes: 30,
            maximumAdvanceDays: 30,
            slotIntervalMinutes: 30,
            maxOrdersPerSlot: 5,
            timezone,
          },
        });
        console.log(`[SCHEDULING_SEED] tenant initialized ${tenant.id}`);
      }

      const existingWindows = await prisma.schedulingWindow.findMany({
        where: { tenantId: tenant.id },
      });

      if (!existingWindows || existingWindows.length === 0) {
        const defaultWindows = [
          { dayOfWeek: 1, startTime: '11:00', endTime: '23:00', active: true },
          { dayOfWeek: 2, startTime: '11:00', endTime: '23:00', active: true },
          { dayOfWeek: 3, startTime: '11:00', endTime: '23:00', active: true },
          { dayOfWeek: 4, startTime: '11:00', endTime: '23:00', active: true },
          { dayOfWeek: 5, startTime: '11:00', endTime: '23:59', active: true },
          { dayOfWeek: 6, startTime: '11:00', endTime: '23:59', active: true },
          { dayOfWeek: 0, startTime: '18:00', endTime: '23:00', active: true },
        ];
        await prisma.schedulingWindow.createMany({
          data: defaultWindows.map((window) => ({
            tenantId: tenant.id,
            dayOfWeek: window.dayOfWeek,
            startTime: window.startTime,
            endTime: window.endTime,
            active: window.active,
          })),
        });
        console.log(`[SCHEDULING_WINDOW] default created ${tenant.id}`);
      }
    }
  } catch (error) {
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
