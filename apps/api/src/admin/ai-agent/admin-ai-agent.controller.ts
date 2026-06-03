import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  BadRequestException,
} from '@nestjs/common';
import axios from 'axios';
import {
  IsOptional,
  IsBoolean,
  IsNumber,
  IsString,
  Min,
  Max,
} from 'class-validator';
import { AiAgentConfigService, UpdateAiAgentConfigDto } from '../../ai-agent/services/ai-agent-config.service';
import { AiProviderRegistryService } from '../../ai-agent/services/ai-provider-registry.service';
import { AiProviderConfigService } from '../../ai-agent/services/ai-provider-config.service';
import { AiProviderType } from '@prisma/client';
import { AiAgentPlanPresetService, UpdateAiAgentPlanPresetDto } from './ai-agent-plan-preset.service';
import { SystemConfigService } from '../services/system-config.service';
import { AgentToolsService } from '../../ai-agent/services/agent-tools.service';
import { AiToolDefinition } from '../../ai-agent/interfaces/ai-provider.interface';
import { AI_TOOL_MODULE_REQUIREMENTS } from '../../ai-agent/constants/agent-tool-modules';
import {
  DEFAULT_GLOBAL_BASE_AI_PROMPT,
  RECOMMENDED_GLOBAL_DELIVERY_PROMPT,
  buildToolsManifestForPrompt,
} from '../../ai-agent/constants/global-base-prompt';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminPermissionsGuard } from '../rbac/admin-permissions.guard';
import { RequireAdminPermissions as Permissions } from '../../common/decorators';

type AiToolStatus = 'active' | 'filtered_by_module' | 'unavailable';

interface AdminAiToolGuideItem {
  name: string;
  label: string;
  description: string;
  whenToUse: string;
  parameters: Record<string, unknown>;
  exampleCall: Record<string, unknown>;
  exampleReturn: Record<string, unknown>;
  requiredModules: string[];
  enabledByDefault: boolean;
  category: string;
  status: AiToolStatus;
  risk: string;
}

interface PromptPreviewBlock {
  source: string;
  title: string;
  content: string;
}

// DTO legado de memória — mantido para compatibilidade com frontend antigo
export class UpdateAiAgentMemoryConfigDto {
  @IsOptional() @IsBoolean() memoryEnabled?: boolean;
  @IsOptional() @IsBoolean() rememberCustomerName?: boolean;
  @IsOptional() @IsBoolean() rememberAddresses?: boolean;
  @IsOptional() @IsBoolean() rememberLastOrder?: boolean;
  @IsOptional() @IsBoolean() rememberPreferences?: boolean;
  @IsOptional() @IsBoolean() allowRepeatLastOrder?: boolean;
  @IsOptional() @IsNumber() @Min(7) @Max(365) memoryRetentionDays?: number;

  // Campos extras que podem vir do frontend (ignorados silenciosamente)
  @IsOptional() id?: string;
  @IsOptional() tenantId?: string;
  @IsOptional() updatedAt?: string | Date;
  @IsOptional() createdAt?: string | Date;
  @IsOptional() agentName?: string;
  @IsOptional() greetingMessage?: string;
  @IsOptional() tone?: string;
  @IsOptional() customInstructions?: string;
  @IsOptional() operatingMode?: string;
  @IsOptional() handoffPolicy?: string;
  @IsOptional() fallbackMessage?: string;
  @IsOptional() maxRetries?: number;
  @IsOptional() sessionTimeoutMin?: number;
  @IsOptional() dailyMessageLimit?: number;
  @IsOptional() customerCooldownMin?: number;
  @IsOptional() simulateTyping?: boolean;
  @IsOptional() debounceMs?: number;
}

// DTO para atualizar a config global de IA no SystemConfig
export class UpdateGlobalAiConfigDto {
  @IsOptional() @IsString() baseAiPrompt?: string;
  @IsOptional() @IsBoolean() confirmEmptyPromptFallback?: boolean;
  @IsOptional() @IsString() aiDefaultAgentName?: string;
  @IsOptional() @IsString() aiDefaultTone?: string;
  @IsOptional() @IsBoolean() aiMemoryEnabled?: boolean;
  @IsOptional() @IsBoolean() aiRememberCustomerName?: boolean;
  @IsOptional() @IsBoolean() aiRememberAddresses?: boolean;
  @IsOptional() @IsBoolean() aiRememberLastOrder?: boolean;
  @IsOptional() @IsBoolean() aiRememberPreferences?: boolean;
  @IsOptional() @IsBoolean() aiAllowRepeatLastOrder?: boolean;
  @IsOptional() @IsNumber() @Min(7) @Max(365) aiMemoryRetentionDays?: number;
  @IsOptional() @IsNumber() @Min(1000) @Max(30000) aiDebounceMs?: number;
  @IsOptional() @IsBoolean() aiSimulateTyping?: boolean;
  @IsOptional() @IsBoolean() aiRequireCustomerName?: boolean;
  @IsOptional() @IsBoolean() aiRequireConfirmation?: boolean;
  @IsOptional() @IsBoolean() aiEnableUpsell?: boolean;
  @IsOptional() @IsBoolean() aiEnableHumanHandoff?: boolean;

  @IsOptional() @IsString() defaultAiProvider?: string;
  @IsOptional() @IsString() googleAiModel?: string;
  @IsOptional() @IsString() openaiModel?: string;
  @IsOptional() @IsString() anthropicModel?: string;
  @IsOptional() @IsString() fallbackAiProvider?: string | null;
  @IsOptional() @IsString() fallbackAiModel?: string | null;
}

export class TestAiProviderDto {
  @IsString() provider!: string;
  @IsOptional() @IsString() model?: string;
}

@Controller('admin/ai-agent')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class AdminAiAgentController {
  constructor(
    private readonly configService: AiAgentConfigService,
    private readonly planPresetService: AiAgentPlanPresetService,
    private readonly systemConfigService: SystemConfigService,
    private readonly agentToolsService: AgentToolsService,
    private readonly aiRegistry: AiProviderRegistryService,
    private readonly providerConfig: AiProviderConfigService,
  ) {}

  // ─── Config Global de IA ──────────────────────────────────────────────────

  /**
   * GET /admin/ai-agent/global-config
   * Retorna as configurações globais do Agente IA (campos do SystemConfig).
   */
  @Get('global-config')
  @Permissions('saas.ai.read')
  async getGlobalConfig() {
    return this.systemConfigService.getConfig();
  }

  /**
   * PATCH /admin/ai-agent/global-config
   * Atualiza as configurações globais do Agente IA.
   */
  @Patch('global-config')
  @HttpCode(200)
  @Permissions('saas.ai.manage')
  async updateGlobalConfig(@Body() dto: UpdateGlobalAiConfigDto) {
    this.assertPromptSaveAllowed(dto);
    const { confirmEmptyPromptFallback: _confirmEmptyPromptFallback, ...updateData } = dto;
    return this.systemConfigService.updateConfig(updateData as Record<string, unknown>);
  }

  /**
   * POST /admin/ai-agent/test-provider
   * Executa uma requisição de teste para o provedor/modelo selecionado.
   */
  @Post('test-provider')
  @HttpCode(200)
  @Permissions('saas.ai.manage')
  async testProvider(@Body() body: TestAiProviderDto) {
    const { provider, model } = body;
    const providerType = provider as AiProviderType;
    const resolvedProvider = this.aiRegistry.getProvider(providerType);
    const runtimeConfig = await this.providerConfig.resolveRuntimeConfig(
      providerType,
      model,
      { log: true, providerSource: 'request', modelOverrideSource: model ? 'request' : undefined },
    );

    if (!runtimeConfig.apiKeyPresent) {
      return {
        success: false,
        statusCode: 400,
        error: 'Provedor nao configurado ou API Key ausente no sistema.',
        friendlyError: 'Configure a API key no SaaS Admin ou ENV.',
        keySource: runtimeConfig.apiKeySource,
        apiKeySource: runtimeConfig.apiKeySource,
        apiKeyFingerprint: runtimeConfig.apiKeyFingerprint,
        model: runtimeConfig.model,
        modelSource: runtimeConfig.modelSource,
      };
    }

    try {
      const res = await resolvedProvider.complete({
        messages: [{ role: 'user', content: 'Responder apenas com a palavra OK.' }],
        temperature: 0.1,
        model,
        providerSource: 'request',
        modelSource: model ? 'request' : undefined,
      });

      if (res.finishReason === 'error') {
        const type = res.error?.type || 'unknown';
        const msg = res.error?.message || 'Erro desconhecido';
        return {
          success: false,
          statusCode: res.error?.statusCode ?? 500,
          error: `Falha no provedor (${type}): ${msg}`,
          friendlyError: this.toFriendlyProviderError(type),
          errorType: type,
          keySource: runtimeConfig.apiKeySource,
          apiKeySource: runtimeConfig.apiKeySource,
          apiKeyFingerprint: runtimeConfig.apiKeyFingerprint,
          model: runtimeConfig.model,
          modelSource: runtimeConfig.modelSource,
        };
      }

      return {
        success: true,
        statusCode: 200,
        response: res.content,
        keySource: runtimeConfig.apiKeySource,
        apiKeySource: runtimeConfig.apiKeySource,
        apiKeyFingerprint: runtimeConfig.apiKeyFingerprint,
        model: runtimeConfig.model,
        modelSource: runtimeConfig.modelSource,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Erro interno ao testar o provedor.';
      return {
        success: false,
        statusCode: 500,
        error: errMsg,
        friendlyError: 'Nao foi possivel testar o provedor agora.',
        keySource: runtimeConfig.apiKeySource,
        apiKeySource: runtimeConfig.apiKeySource,
        apiKeyFingerprint: runtimeConfig.apiKeyFingerprint,
        model: runtimeConfig.model,
        modelSource: runtimeConfig.modelSource,
      };
    }
  }

  /**
   * GET /admin/ai-agent/providers/google/models
   * Lista os modelos disponíveis na API do Google AI para a key configurada.
   * Filtra apenas modelos que suportam generateContent.
   */
  @Get('providers/google/models')
  @Permissions('saas.ai.read')
  async listGoogleModels() {
    const runtimeConfig = await this.providerConfig.resolveRuntimeConfig(
      'google_ai' as import('@prisma/client').AiProviderType,
      undefined,
      { log: false },
    );

    if (!runtimeConfig.apiKeyPresent) {
      return {
        success: false,
        error: 'API Key do Google AI não está configurada no sistema.',
        models: [],
      };
    }

    const baseUrl =
      process.env.GOOGLE_AI_BASE_URL ||
      'https://generativelanguage.googleapis.com/v1beta';

    try {
      const { data } = await axios.get(`${baseUrl}/models`, {
        params: { key: runtimeConfig.apiKey },
        headers: { 'Content-Type': 'application/json' },
        timeout: 15_000,
      });

      interface GoogleModelEntry {
        name: string;
        displayName?: string;
        description?: string;
        supportedGenerationMethods?: string[];
        inputTokenLimit?: number;
        outputTokenLimit?: number;
      }

      const allModels: GoogleModelEntry[] = data?.models ?? [];

      const generateContentModels = allModels
        .filter((m) =>
          Array.isArray(m.supportedGenerationMethods) &&
          m.supportedGenerationMethods.includes('generateContent'),
        )
        .map((m) => {
          const modelId = m.name?.replace('models/', '') ?? m.name;
          const supportsFunctionCalling =
            Array.isArray(m.supportedGenerationMethods) &&
            m.supportedGenerationMethods.includes('generateContent');

          return {
            id: modelId,
            displayName: m.displayName ?? modelId,
            description: m.description ?? '',
            supportsFunctionCalling,
            inputTokenLimit: m.inputTokenLimit,
            outputTokenLimit: m.outputTokenLimit,
          };
        });

      return {
        success: true,
        models: generateContentModels,
        total: generateContentModels.length,
        apiKeySource: runtimeConfig.apiKeySource,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Erro ao listar modelos do Google AI.';
      const statusCode = axios.isAxiosError(err) ? err.response?.status : undefined;
      return {
        success: false,
        error: errMsg,
        statusCode,
        models: [],
      };
    }
  }
  @Get('recommended-prompt')
  @Permissions('saas.ai.read')
  getRecommendedPrompt() {
    return {
      prompt: RECOMMENDED_GLOBAL_DELIVERY_PROMPT,
      characterCount: RECOMMENDED_GLOBAL_DELIVERY_PROMPT.length,
    };
  }

  @Post('global-config/restore-recommended-prompt')
  @HttpCode(200)
  @Permissions('saas.ai.manage')
  async restoreRecommendedPrompt() {
    return this.systemConfigService.updateConfig({
      baseAiPrompt: RECOMMENDED_GLOBAL_DELIVERY_PROMPT,
    });
  }

  @Get('tools')
  @Permissions('saas.ai.read')
  async listTools(@Query('tenantId') tenantId?: string): Promise<AdminAiToolGuideItem[]> {
    return this.buildToolsGuide(tenantId);
  }

  @Get('effective-prompt-preview')
  @Permissions('saas.ai.read')
  async getEffectivePromptPreview(@Query('tenantId') tenantId?: string) {
    const systemConfig = await this.systemConfigService.getConfig();
    const databasePrompt = systemConfig?.baseAiPrompt?.trim() ?? '';
    const isDatabasePromptActive = databasePrompt.length > 0;
    const globalPrompt = isDatabasePromptActive ? databasePrompt : DEFAULT_GLOBAL_BASE_AI_PROMPT;
    const globalSource = isDatabasePromptActive ? 'database_global' : 'fallback_code';
    const tools = tenantId
      ? await this.agentToolsService.getAvailableToolsForTenant(tenantId)
      : this.agentToolsService.getAvailableTools();
    const tenantConfig = tenantId
      ? await this.configService.getEffectiveAiAgentConfig(tenantId)
      : null;
    const tenantPrompt = tenantConfig?.customInstructions?.trim() ?? '';
    const tenantPromptAppended = tenantPrompt.length > 0;
    const automaticContextBlocks = this.buildSimulatedAutomaticContextBlocks(tools);

    const blocks: PromptPreviewBlock[] = [
      {
        source: globalSource,
        title: 'Prompt Mestre Global',
        content: globalPrompt,
      },
      {
        source: tenantPromptAppended ? 'tenant_config' : 'tenant_config_empty',
        title: 'Prompt complementar do tenant',
        content: tenantPromptAppended
          ? tenantPrompt
          : 'Nenhum prompt complementar do tenant será anexado.',
      },
      ...automaticContextBlocks,
    ];

    return {
      source: globalSource,
      tenantPromptAppended,
      globalPrompt: {
        source: globalSource,
        characterCount: globalPrompt.length,
        content: globalPrompt,
      },
      tenantPrompt: {
        source: tenantPromptAppended ? 'tenant_config' : 'not_configured',
        appended: tenantPromptAppended,
        characterCount: tenantPrompt.length,
        content: tenantPrompt,
      },
      automaticContext: automaticContextBlocks,
      tools: tools.map((tool) => ({ name: tool.name, description: tool.description })),
      blocks,
      effectivePrompt: blocks.map((block) => `## ${block.title}\n${block.content}`).join('\n\n'),
    };
  }

  // ─── Presets por Plano ────────────────────────────────────────────────────

  /**
   * GET /admin/ai-agent/plan-presets
   * Lista todos os presets de configuração de IA por plano.
   */
  @Get('plan-presets')
  @Permissions('saas.settings.read')
  async listPlanPresets() {
    return this.planPresetService.listPresets();
  }

  /**
   * PATCH /admin/ai-agent/plan-presets/:plan
   * Cria ou atualiza o preset de IA para um plano específico (basic | pro | premium).
   */
  @Patch('plan-presets/:plan')
  @HttpCode(200)
  @Permissions('saas.settings.manage')
  async updatePlanPreset(
    @Param('plan') plan: string,
    @Body() dto: UpdateAiAgentPlanPresetDto,
  ) {
    return this.planPresetService.upsertPreset(plan, dto);
  }

  // ─── Config Efetiva por Tenant ────────────────────────────────────────────

  /**
   * GET /admin/ai-agent/tenants/:tenantId/effective-config
   * Retorna a configuração efetiva resolvida (global → plano → override).
   * Útil para diagnóstico e debug.
   */
  @Get('tenants/:tenantId/effective-config')
  @Permissions('saas.tenants.ai.read')
  async getTenantEffectiveConfig(@Param('tenantId') tenantId: string) {
    return this.configService.getEffectiveAiAgentConfig(tenantId);
  }

  /**
   * GET /admin/ai-agent/tenants/:tenantId/config
   * Retorna a configuração raw do tenant (override próprio).
   */
  @Get('tenants/:tenantId/config')
  @Permissions('saas.tenants.ai.read')
  async getTenantConfig(@Param('tenantId') tenantId: string) {
    return this.configService.getConfig(tenantId);
  }

  /**
   * PATCH /admin/ai-agent/tenants/:tenantId/config
   * Atualiza a configuração do tenant (inclui useGlobalDefaults).
   */
  @Patch('tenants/:tenantId/config')
  @HttpCode(200)
  @Permissions('saas.tenants.ai.manage')
  async updateTenantConfig(
    @Param('tenantId') tenantId: string,
    @Body() dto: UpdateAiAgentConfigDto,
  ) {
    return this.configService.updateConfig(tenantId, dto);
  }

  private assertPromptSaveAllowed(dto: UpdateGlobalAiConfigDto): void {
    const promptWasSubmitted = Object.prototype.hasOwnProperty.call(dto, 'baseAiPrompt');
    if (!promptWasSubmitted) return;

    const promptIsEmpty = (dto.baseAiPrompt ?? '').trim().length === 0;
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction && promptIsEmpty && dto.confirmEmptyPromptFallback !== true) {
      throw new BadRequestException(
        'Prompt Mestre vazio em produção exige confirmação explícita de uso do fallback.',
      );
    }
  }

  private toFriendlyProviderError(type: string): string {
    if (type === 'quota_exhausted') {
      return 'Quota ou limite do provedor esgotado. Troque a key, aguarde a quota renovar ou configure fallback.';
    }
    if (type === 'model_unavailable') {
      return 'Esse modelo não está disponível para esta chave/projeto. Clique em "Listar modelos disponíveis" para ver os modelos válidos.';
    }
    return 'Falha ao chamar o provedor de IA.';
  }

  private async buildToolsGuide(tenantId?: string): Promise<AdminAiToolGuideItem[]> {
    const tools = this.agentToolsService.getAvailableTools();
    const availableNames = tenantId
      ? new Set((await this.agentToolsService.getAvailableToolsForTenant(tenantId)).map((tool) => tool.name))
      : null;

    return tools.map((tool) => this.buildToolGuideItem(tool, availableNames));
  }

  private buildToolGuideItem(
    tool: AiToolDefinition,
    availableNames: Set<string> | null,
  ): AdminAiToolGuideItem {
    const metadata = this.getToolMetadata(tool.name);
    const requiredModule = AI_TOOL_MODULE_REQUIREMENTS[tool.name];
    const requiredModules = requiredModule ? [requiredModule] : [];
    const status: AiToolStatus = availableNames && !availableNames.has(tool.name)
      ? 'filtered_by_module'
      : 'active';

    return {
      name: tool.name,
      label: metadata.label,
      description: tool.description,
      whenToUse: metadata.whenToUse,
      parameters: tool.parameters,
      exampleCall: metadata.exampleCall,
      exampleReturn: metadata.exampleReturn,
      requiredModules,
      enabledByDefault: requiredModules.length === 0,
      category: metadata.category,
      status,
      risk: metadata.risk,
    };
  }

  private getToolMetadata(name: string): {
    label: string;
    whenToUse: string;
    category: string;
    risk: string;
    exampleCall: Record<string, unknown>;
    exampleReturn: Record<string, unknown>;
  } {
    const map: Record<string, {
      label: string;
      whenToUse: string;
      category: string;
      risk: string;
      exampleCall: Record<string, unknown>;
      exampleReturn: Record<string, unknown>;
    }> = {
      adicionar_item_pedido: {
        label: 'Adicionar item ao pedido',
        whenToUse: 'Quando o cliente escolher um produto e quantidade.',
        category: 'Pedido',
        risk: 'Não cria pedido real; apenas atualiza o draft.',
        exampleCall: { nomeOuBusca: 'Pizza de Calabresa', quantidade: 2, notas: 'sem cebola' },
        exampleReturn: { status: 'success', draft: { items: [{ name: 'Pizza de Calabresa', quantity: 2 }] } },
      },
      definir_entrega_retirada: {
        label: 'Definir entrega ou retirada',
        whenToUse: 'Quando o cliente informar delivery ou retirada no balcão.',
        category: 'Pedido',
        risk: 'Nunca altere delivery para retirada sem pedido explícito do cliente.',
        exampleCall: { tipo: 'delivery' },
        exampleReturn: { status: 'success', fulfillmentType: 'delivery' },
      },
      definir_endereco_entrega: {
        label: 'Salvar endereço de entrega',
        whenToUse: 'Quando o cliente informar rua, número, bairro, cidade ou complemento.',
        category: 'Pedido',
        risk: 'Mantenha fulfillmentType=delivery ao salvar endereço.',
        exampleCall: { rua: 'Rua José Moraes de Aguiar', numero: '1626', bairro: 'Conjunto Mazzeo', cidade: 'Mongaguá' },
        exampleReturn: { status: 'success', address: { street: 'Rua José Moraes de Aguiar', number: '1626' } },
      },
      definir_forma_pagamento: {
        label: 'Definir pagamento',
        whenToUse: 'Quando o cliente informar Pix, cartão, dinheiro ou troco.',
        category: 'Pedido',
        risk: 'Para dinheiro, registre troco ou confirmação de sem troco.',
        exampleCall: { metodo: 'cash', troco: 100 },
        exampleReturn: { status: 'success', paymentMethod: 'cash', changeFor: 100 },
      },
      consultar_resumo_pedido: {
        label: 'Consultar resumo do draft',
        whenToUse: 'Antes de mostrar resumo final ou decidir quais campos faltam.',
        category: 'Pedido',
        risk: 'Use o retorno para não pedir itens ou dados já salvos.',
        exampleCall: {},
        exampleReturn: { status: 'success', missingFields: [], readyToConfirm: true },
      },
      criar_pedido: {
        label: 'Criar pedido real',
        whenToUse: 'Somente após missingFields=[] e confirmação explícita do cliente.',
        category: 'Pedido',
        risk: 'Nunca usar se faltar nome, endereço para delivery, pagamento ou itens.',
        exampleCall: { fulfillmentType: 'delivery', itens: [{ productId: 'prod_123', quantity: 2 }], formaPagamento: 'cash' },
        exampleReturn: { status: 'success', orderId: 'order_123', orderNumber: 42 },
      },
      consultar_slots_agendamento: {
        label: 'Consultar slots de agendamento',
        whenToUse: 'Quando a loja estiver fechada/pausada ou o cliente pedir agendamento.',
        category: 'Agendamento',
        risk: 'Nunca invente datas ou horários; use CURRENT_DATETIME e slots reais.',
        exampleCall: { data: '2026-05-31', fulfillmentType: 'delivery' },
        exampleReturn: { status: 'success', slots: [{ startsAt: '2026-05-31T21:00:00-03:00' }] },
      },
      transferir_atendimento_humano: {
        label: 'Transferir para humano',
        whenToUse: 'Quando o cliente pedir atendente ou houver erro crítico/repetido.',
        category: 'Atendimento',
        risk: 'Use em falhas críticas em vez de improvisar respostas.',
        exampleCall: { motivo: 'Cliente solicitou atendente' },
        exampleReturn: { status: 'success', message: 'Transferência solicitada' },
      },
    };

    return map[name] ?? {
      label: this.humanizeToolName(name),
      whenToUse: 'Use quando a intenção do cliente corresponder exatamente à descrição da tool.',
      category: this.inferToolCategory(name),
      risk: 'Use apenas com dados reais retornados pelo backend.',
      exampleCall: {},
      exampleReturn: { status: 'success' },
    };
  }

  private buildSimulatedAutomaticContextBlocks(tools: AiToolDefinition[]): PromptPreviewBlock[] {
    const now = new Date();
    const simulatedToolsManifest = buildToolsManifestForPrompt(tools);
    return [
      {
        source: 'backend_simulated',
        title: 'STORE_STATUS',
        content: [
          'STORE_STATUS:',
          '- status: open | closed | paused',
          '- acceptsScheduling: true | false',
          '- nextOpenAt: valor simulado para preview, sem consultar dados reais do tenant',
        ].join('\n'),
      },
      {
        source: 'backend_simulated',
        title: 'CURRENT_DATETIME',
        content: [
          'CURRENT_DATETIME:',
          `- generatedAt: ${now.toISOString()}`,
          '- timezone: America/Sao_Paulo',
          '- today/tomorrow/dia da semana são calculados pelo backend em runtime',
        ].join('\n'),
      },
      {
        source: 'backend_simulated',
        title: 'MEMORY_CONFIG',
        content: [
          'MEMORY_CONFIG:',
          '- memoryEnabled: conforme configuração efetiva',
          '- não inclui dados pessoais reais neste preview',
        ].join('\n'),
      },
      {
        source: 'backend_simulated',
        title: 'CURRENT_ORDER_DRAFT',
        content: [
          'CURRENT_ORDER_DRAFT:',
          '- items: []',
          '- missingFields: ["items", "customerName", "fulfillmentType", "paymentMethod"]',
          '- preview simulado, sem dados reais de sessão',
        ].join('\n'),
      },
      {
        source: 'backend_tools',
        title: 'AVAILABLE_TOOLS',
        content: simulatedToolsManifest,
      },
    ];
  }

  private humanizeToolName(name: string): string {
    return name
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private inferToolCategory(name: string): string {
    if (name.includes('pedido') || name.includes('entrega') || name.includes('pagamento')) return 'Pedido';
    if (name.includes('cardapio') || name.includes('produto')) return 'Cardápio';
    if (name.includes('agendamento') || name.includes('horario')) return 'Agendamento';
    if (name.includes('cupom') || name.includes('ofertas') || name.includes('fidelidade')) return 'CRM';
    return 'Geral';
  }
}
