import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { BillingSettings } from '@prisma/client';

const DEFAULT_BILLING_SETTINGS_ID = 'global';

@Injectable()
export class BillingSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDefaultSettings(): Promise<BillingSettings | null> {
    return this.prisma.billingSettings.findUnique({
      where: { id: DEFAULT_BILLING_SETTINGS_ID },
    });
  }

  async ensureDefaultSettings(): Promise<BillingSettings> {
    const defaults = {
      id: DEFAULT_BILLING_SETTINGS_ID,
      includeDeliveryFeeByDefault: false,
      includeServiceFeeByDefault: false,
      countStorefrontOrders: true,
      countDirectOnlineOrders: true,
      countPosOrders: true,
      countWhatsappAiOrders: true,
      countManualOrders: false,
      countMarketplaceIfoodOrders: true,
      countMarketplaceRappiOrders: false,
      countMarketplaceUbereatsOrders: false,
      countMarketplace99foodOrders: false,
      countMarketplaceKettaOrders: false,
      countMarketplaceZeDeliveryOrders: false,
      countConfirmedOrders: true,
      countCompletedOrders: true,
      excludeCancelledOrders: true,
      discountReducesRevenue: true,
      defaultGracePeriodDays: 7,
      defaultTrialDays: 7,
      requirePaymentMethodForPaidPlans: false,
      trialProEnabled: false,
      trialIncludesAi: true,
      trialIncludesIfood: true,
      trialIncludesAdvancedReports: true,
      trialAutoConvertToBilling: false,
      aiIncludedForPaidTenants: true,
      aiIncludedMonthlyMessages: 200,
      aiFreeTrialMessages: 0,
      aiHardLimitMonthlyMessages: 1000,
      partnerLinksJson: [
        {
          key: 'maquininhas',
          title: 'Maquininhas',
          description: 'Solucoes de pagamento presencial para agilizar seu caixa.',
          ctaLabel: 'Conhecer parceiro',
          url: '',
        },
        {
          key: 'conta_pj',
          title: 'Conta PJ',
          description: 'Conta digital e servicos bancarios para separar o financeiro da loja.',
          ctaLabel: 'Conhecer parceiro',
          url: '',
        },
        {
          key: 'embalagens',
          title: 'Embalagens',
          description: 'Fornecedores para delivery com foco em custo, conservacao e apresentacao.',
          ctaLabel: 'Conhecer parceiro',
          url: '',
        },
        {
          key: 'marketing',
          title: 'Marketing',
          description: 'Apoio para atrair pedidos, melhorar criativos e aumentar recompra.',
          ctaLabel: 'Conhecer parceiro',
          url: '',
        },
        {
          key: 'contabilidade_mei',
          title: 'Contabilidade MEI',
          description: 'Rotina fiscal e orientacao basica para manter a operacao organizada.',
          ctaLabel: 'Conhecer parceiro',
          url: '',
        },
        {
          key: 'fotos_cardapio',
          title: 'Fotos para cardapio',
          description: 'Parceiros para fotos comerciais e melhoria visual do menu.',
          ctaLabel: 'Conhecer parceiro',
          url: '',
        },
      ],
    };

    return this.prisma.billingSettings.upsert({
      where: { id: DEFAULT_BILLING_SETTINGS_ID },
      update: {},
      create: defaults,
    });
  }
}
