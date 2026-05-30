import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import axios from 'axios';
import { OrdersService } from '../../orders/orders.service';
import { DeliveryRateService } from '../../delivery/delivery-rate.service';
import { AiToolDefinition } from '../interfaces/ai-provider.interface';
import { AvailabilityService } from '../../catalog/publication/availability.service';
import { CashbackService } from '../../promotions/cashback.service';
import { CouponsService } from '../../promotions/coupons.service';
import { SchedulingService } from '../../scheduling/scheduling.service';
import { CreateOrderDTO, DeliveryAddressDTO } from '@gestor/types';

import { PrismaService } from '../../database/prisma.service';
import { StorefrontService } from '../../storefront/storefront.service';
import { ZodError, z } from 'zod';
import { PaymentMethod } from '@gestor/types';
import type {
  StorefrontComboPayload,
  StorefrontPayload,
  StorefrontProductPayload,
} from '@gestor/types';
import { AgentToolsFilterService } from './agent-tools-filter.service';
import {
  mapStorefrontComboToAgentDetail,
  mapStorefrontProductToAgentDetail,
  type AgentComboDetailResult,
  type AgentProductDetailResult,
} from '../utils/agent-product-detail.mapper';
import { buildAgentPaymentMethodsResult } from '../utils/agent-payment-methods.util';

export interface AgentSessionContext {
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  sessionId?: string;
  [key: string]: unknown;
}

const ConsultarCardapioSchema = z.object({
  categoria: z.string().optional(),
  busca: z.string().optional(),
});

const ConsultarTaxaEntregaSchema = z.object({
  enderecoCompleto: z.string(),
  cep: z.string().optional(),
});

const CriarPedidoSchema = z.object({
  itens: z.array(z.object({
    productId: z.string(),
    quantity: z.number().int(),
    notes: z.string().optional(),
  })),
  fulfillmentType: z.enum(['delivery', 'pickup']).default('delivery'),
  endereco: z.object({
    street: z.string(),
    number: z.string(),
    neighborhood: z.string(),
    city: z.string(),
    state: z.string().optional(),
    zipCode: z.string().optional(),
    complement: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
  }).optional(),
  formaPagamento: z.string(),
  troco: z.number().optional(),
  scheduledFor: z.string().optional(),
  timeSlotId: z.string().optional(),
});

const TransferirAtendimentoSchema = z.object({
  motivo: z.string().optional(),
});

const AplicarCupomSchema = z.object({
  cupom: z.string(),
  valorCarrinho: z.number(),
});

const ConsultarTempoEsperaSchema = z.object({
  tipo: z.enum(['delivery', 'pickup']).optional(),
});

const VerificarIngredienteSchema = z.object({
  productId: z.string(),
  ingrediente: z.string(),
});

const ConsultarSlotsSchema = z.object({
  data: z.string().optional(),
});

const ConsultarDetalheProdutoSchema = z
  .object({
    productId: z.string().optional(),
    comboId: z.string().optional(),
    nomeOuBusca: z.string().optional(),
  })
  .refine(
    (data) =>
      Boolean(data.productId?.trim()) ||
      Boolean(data.comboId?.trim()) ||
      Boolean(data.nomeOuBusca?.trim()),
    { message: 'Informe productId, comboId ou nomeOuBusca.' },
  );

@Injectable()
export class AgentToolsService {
  private readonly logger = new Logger('AgentToolsService');

  constructor(
    @Inject(forwardRef(() => OrdersService))
    private readonly ordersService: OrdersService,
    @Inject(forwardRef(() => DeliveryRateService))
    private readonly deliveryRateService: DeliveryRateService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => StorefrontService))
    private readonly storefrontService: StorefrontService,
    @Inject(forwardRef(() => AvailabilityService))
    private readonly availabilityService: AvailabilityService,
    @Inject(forwardRef(() => CashbackService))
    private readonly cashbackService: CashbackService,
    @Inject(forwardRef(() => CouponsService))
    private readonly couponsService: CouponsService,
    @Inject(forwardRef(() => SchedulingService))
    private readonly schedulingService: SchedulingService,
    private readonly toolsFilterService: AgentToolsFilterService,
  ) {}

  /**
   * Retorna as definições das tools disponíveis para o LLM.
   */
  getAvailableTools(): AiToolDefinition[] {
    return [
      {
        name: 'consultar_cardapio',
        description: 'Consulta os produtos disponíveis no cardápio, incluindo preços e descrições. Opcionalmente filtra por categoria ou termo de busca.',
        parameters: {
          type: 'object',
          properties: {
            categoria: { type: 'string', description: 'Nome da categoria para filtrar (opcional)' },
            busca: { type: 'string', description: 'Termo de busca para encontrar produtos específicos (opcional)' },
          },
        },
      },
      {
        name: 'consultar_detalhe_produto',
        description:
          'Consulta detalhes reais de um produto ou combo: preço, disponibilidade, complementos, grupos de opções e blocos do combo. Use antes de responder sobre tamanhos, bordas, adicionais ou composição.',
        parameters: {
          type: 'object',
          properties: {
            productId: { type: 'string', description: 'ID do produto no cardápio' },
            comboId: { type: 'string', description: 'ID do combo (produto tipo combo ou combo legado)' },
            nomeOuBusca: {
              type: 'string',
              description: 'Nome ou termo para buscar no cardápio quando o ID não for conhecido',
            },
          },
        },
      },
      {
        name: 'consultar_formas_pagamento',
        description:
          'Lista as formas de pagamento aceitas pela loja (Pix, cartão, dinheiro, etc.) conforme configuração real. Use antes de responder sobre pagamento — não invente chave Pix.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'consultar_taxa_entrega',
        description: 'Calcula a taxa de entrega baseada no endereço ou CEP do cliente.',
        parameters: {
          type: 'object',
          properties: {
            enderecoCompleto: { type: 'string', description: 'Endereço completo para calcular a taxa (Rua, Número, Bairro, Cidade)' },
            cep: { type: 'string', description: 'CEP (opcional se enviar endereço completo)' },
          },
          required: ['enderecoCompleto'],
        },
      },
      {
        name: 'criar_pedido',
        description: 'Cria um pedido final no sistema. Só chame esta função quando o cliente confirmar explicitamente todos os itens, endereço (para delivery) e forma de pagamento. Para pickup (retirada no balcão), omita o campo endereco.',
        parameters: {
          type: 'object',
          properties: {
            fulfillmentType: {
              type: 'string',
              enum: ['delivery', 'pickup'],
              description: 'Tipo de entrega: delivery (entrega no endereço) ou pickup (retirada no balcão)',
            },
            itens: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  productId: { type: 'string' },
                  quantity: { type: 'integer' },
                  notes: { type: 'string' },
                },
                required: ['productId', 'quantity'],
              },
            },
            endereco: {
              type: 'object',
              description: 'Obrigatório para delivery. Omitir para pickup.',
              properties: {
                street: { type: 'string', description: 'Nome da rua' },
                number: { type: 'string', description: 'Número do imóvel' },
                neighborhood: { type: 'string', description: 'Bairro (obrigatório para calcular entrega)' },
                city: { type: 'string', description: 'Cidade' },
                state: { type: 'string' },
                zipCode: { type: 'string' },
                complement: { type: 'string' },
              },
              required: ['street', 'number', 'neighborhood', 'city'],
            },
            formaPagamento: { type: 'string', enum: ['pix', 'credit_card', 'cash'], description: 'Forma de pagamento confirmada pelo cliente' },
            troco: { type: 'number', description: 'Valor para troco quando formaPagamento=cash (ex: 100 para troco de R$100)' },
            scheduledFor: { type: 'string', description: 'Data/hora para agendamento (ISO string) se aplicável' },
            timeSlotId: { type: 'string', description: 'ID do slot de tempo se for agendado' },
          },
          required: ['itens', 'fulfillmentType', 'formaPagamento'],
        },
      },
      {
        name: 'transferir_atendimento_humano',
        description: 'Transfere o atendimento atual para um operador humano se o cliente solicitar ou em caso de problemas complexos.',
        parameters: {
          type: 'object',
          properties: {
            motivo: { type: 'string', description: 'Motivo resumido da transferência' },
          },
        },
      },
      {
        name: 'consultar_horario_atendimento',
        description: 'Consulta os horários de funcionamento da loja e se ela está aberta no momento.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'consultar_status_pedido',
        description: 'Verifica o status atual do último pedido realizado pelo cliente.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'consultar_fidelidade',
        description: 'Consulta o saldo de cashback ou pontos de fidelidade do cliente.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'repetir_ultimo_pedido',
        description: 'Busca os itens do último pedido do cliente para sugerir a repetição.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'aplicar_cupom_desconto',
        description: 'Valida e aplica um cupom de desconto ao carrinho/pedido.',
        parameters: {
          type: 'object',
          properties: {
            cupom: { type: 'string', description: 'Código do cupom (ex: BEMVINDO10)' },
            valorCarrinho: { type: 'number', description: 'Valor total atual dos produtos no carrinho' },
          },
          required: ['cupom', 'valorCarrinho'],
        },
      },
      {
        name: 'consultar_tempo_espera',
        description: 'Consulta o tempo estimado de entrega ou retirada baseado na carga atual da cozinha.',
        parameters: {
          type: 'object',
          properties: {
            tipo: { type: 'string', enum: ['delivery', 'pickup'], description: 'Se deseja saber o tempo para entrega ou retirada' },
          },
        },
      },
      {
        name: 'obter_link_rastreamento',
        description: 'Gera e envia o link do mapa de rastreamento em tempo real do último pedido.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'verificar_disponibilidade_ingrediente',
        description: 'Consulta se um produto específico contém um determinado ingrediente (ex: glúten, lactose).',
        parameters: {
          type: 'object',
          properties: {
            productId: { type: 'string', description: 'ID do produto a ser verificado' },
            ingrediente: { type: 'string', description: 'Nome do ingrediente para buscar na ficha técnica' },
          },
          required: ['productId', 'ingrediente'],
        },
      },
      {
        name: 'consultar_slots_agendamento',
        description: 'Consulta horários (slots) disponíveis para agendamento de pedidos em uma data específica.',
        parameters: {
          type: 'object',
          properties: {
            data: { type: 'string', description: 'Data desejada (YYYY-MM-DD). Se omitido, usa hoje.' },
          },
        },
      },
      {
        name: 'consultar_ofertas_checkout',
        description: 'Consulta ofertas globais e acompanhamentos (upsells) sugeridos para aumentar o pedido antes de finalizar.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    ];
  }

  /**
   * Tools filtradas por módulo do tenant (mapeamento em agent-tool-modules.ts).
   */
  async getAvailableToolsForTenant(tenantId: string): Promise<AiToolDefinition[]> {
    const all = this.getAvailableTools();
    return this.toolsFilterService.filterForTenant(tenantId, all);
  }

  /**
   * Executa uma tool específica requisitada pelo LLM.
   */
  async executeTool(
    tenantId: string,
    toolName: string,
    args: unknown,
    sessionContext?: AgentSessionContext,
  ): Promise<unknown> {
    const argKeys = args && typeof args === 'object' && !Array.isArray(args)
      ? Object.keys(args as Record<string, unknown>)
      : [];
    const sessionId = typeof sessionContext?.sessionId === 'string' ? sessionContext.sessionId : undefined;
    this.logger.log(`Executing tool ${toolName} (tenantId=${tenantId}${sessionId ? `, sessionId=${sessionId}` : ''}, argKeys=${argKeys.join(',')})`);

    try {
      switch (toolName) {
        case 'consultar_cardapio': {
          const parsedArgs = ConsultarCardapioSchema.parse(args || {});
          return await this.executeConsultarCardapio(tenantId, parsedArgs);
        }

        case 'consultar_detalhe_produto': {
          const parsedArgs = ConsultarDetalheProdutoSchema.parse(args || {});
          return await this.executeConsultarDetalheProduto(tenantId, parsedArgs);
        }

        case 'consultar_formas_pagamento':
          return await this.executeConsultarFormasPagamento(tenantId);

        case 'consultar_taxa_entrega': {
          const parsedArgs = ConsultarTaxaEntregaSchema.parse(args || {});
          return await this.executeConsultarTaxaEntrega(tenantId, parsedArgs);
        }

        case 'criar_pedido': {
          const parsedArgs = CriarPedidoSchema.parse(args || {});
          return await this.executeCriarPedido(tenantId, parsedArgs, sessionContext);
        }

        case 'transferir_atendimento_humano': {
          TransferirAtendimentoSchema.parse(args || {});
          return { status: 'success', message: 'Transferência solicitada, aguardando operador humano.' };
        }

        case 'consultar_horario_atendimento':
          return await this.executeConsultarHorarioAtendimento(tenantId);

        case 'consultar_status_pedido':
          return await this.executeConsultarStatusPedido(tenantId, sessionContext);

        case 'consultar_fidelidade':
          return await this.executeConsultarFidelidade(tenantId, sessionContext);

        case 'repetir_ultimo_pedido':
          return await this.executeRepetirUltimoPedido(tenantId, sessionContext);

        case 'aplicar_cupom_desconto': {
          const parsedArgs = AplicarCupomSchema.parse(args || {});
          return await this.executeAplicarCupom(tenantId, parsedArgs);
        }

        case 'consultar_tempo_espera': {
          const parsedArgs = ConsultarTempoEsperaSchema.parse(args || {});
          return await this.executeConsultarTempoEspera(tenantId, parsedArgs);
        }

        case 'obter_link_rastreamento':
          return await this.executeObterLinkRastreamento(tenantId, sessionContext);

        case 'verificar_disponibilidade_ingrediente': {
          const parsedArgs = VerificarIngredienteSchema.parse(args || {});
          return await this.executeVerificarIngrediente(tenantId, parsedArgs);
        }

        case 'consultar_slots_agendamento': {
          const parsedArgs = ConsultarSlotsSchema.parse(args || {});
          return await this.executeConsultarSlots(tenantId, parsedArgs);
        }

        case 'consultar_ofertas_checkout':
          return await this.executeConsultarOfertasCheckout(tenantId);

        default:
          throw new Error(`Tool desconhecida: ${toolName}`);
      }
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = error.issues.map((i) => ({
          path: i.path.join('.'),
          code: i.code,
        }));
        this.logger.warn(`Invalid tool args (tenantId=${tenantId}, tool=${toolName}): ${JSON.stringify(issues)}`);
        return {
          status: 'error',
          code: 'INVALID_TOOL_ARGS',
          message: 'Parâmetros inválidos para executar a ferramenta.',
        };
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error executing tool (tenantId=${tenantId}, tool=${toolName}): ${message}`);
      return {
        status: 'error',
        code: 'TOOL_EXECUTION_ERROR',
        message,
      };
    }
  }

  private async executeConsultarCardapio(tenantId: string, args: z.infer<typeof ConsultarCardapioSchema>) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new Error('Loja não encontrada');

    const payload = await this.storefrontService.getStorefrontPayload(tenant.slug);
    
    // Simplificamos o retorno para não estourar os tokens do LLM
    let result = payload.categories.map((cat) => ({
      categoria: cat.name,
      produtos: cat.products.map((p) => ({
        id: p.id,
        nome: p.name,
        preco: Number(p.basePrice),
        descricao: 'description' in p ? String((p as { description?: string }).description) : '',
        sugestoesAdicionais: p.upsells?.map((u) => ({
          nome: u.name,
          itens: u.items.map((i) => ({
            nome: i.name,
            preco: i.finalPrice
          }))
        }))
      })),
    }));

    if (args.categoria) {
      const search = args.categoria.toLowerCase();
      result = result.filter((c) => c.categoria.toLowerCase().includes(search));
    }

    if (args.busca) {
      const search = args.busca.toLowerCase();
      result.forEach((c) => {
        c.produtos = c.produtos.filter((p) => 
          p.nome.toLowerCase().includes(search) || 
          (p.descricao && p.descricao.toLowerCase().includes(search))
        );
      });
    }

    // Remove categorias vazias após o filtro
    result = result.filter((c) => c.produtos.length > 0);

    return result;
  }

  private async executeConsultarTaxaEntrega(tenantId: string, args: z.infer<typeof ConsultarTaxaEntregaSchema>) {
    if (!args.enderecoCompleto) {
      return { disponivel: false, mensagem: 'Por favor, informe o endereço completo para calcularmos a taxa de entrega.' };
    }

    let lat: number;
    let lng: number;

    const apiKey = process.env.GOOGLE_MAPS_KEY || process.env.VITE_GOOGLE_MAPS_KEY;
    
    if (apiKey) {
      try {
        const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
          params: {
            address: args.enderecoCompleto,
            key: apiKey,
            components: 'country:BR',
          },
        });

        if (response.data.status === 'OK' && response.data.results.length > 0) {
          const location = response.data.results[0].geometry.location;
          lat = location.lat;
          lng = location.lng;
        } else {
          return { disponivel: false, mensagem: 'Não conseguimos localizar este endereço com precisão. Poderia confirmar o nome da rua e o bairro?' };
        }
      } catch (err) {
        this.logger.error(`Geocoding error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        return { disponivel: false, mensagem: 'Tivemos um problema temporário ao consultar o endereço. Deseja falar com um atendente?' };
      }
    } else {
      // Fallback fallback: se não tiver chave, pedimos desculpas (evita mock fixo)
      return { disponivel: false, mensagem: 'O cálculo automático de taxa está indisponível no momento devido a falta de configuração de mapas.' };
    }
    
    try {
      const decision = await this.deliveryRateService.calculateDeliveryDecision({
        tenantId,
        address: {
          neighborhood: '',
          lat,
          lng,
        }
      });

      return {
        disponivel: decision.canDeliver,
        taxa: decision.fee ? Number(decision.fee) : 0,
        distanciaKm: decision.distanceKm ? Number(decision.distanceKm) : 0,
        mensagem: decision.canDeliver 
          ? `Entrega disponível. Taxa: R$ ${decision.fee}` 
          : 'Infelizmente não entregamos neste endereço.',
      };
    } catch {
      return { disponivel: false, mensagem: 'Erro ao calcular taxa. Peça mais detalhes do endereço.' };
    }
  }

  private normalizePaymentMethod(value: string): PaymentMethod | null {
    const normalized = value.trim().toLowerCase();
    const map: Record<string, PaymentMethod> = {
      pix: PaymentMethod.pix,
      credit_card: PaymentMethod.credit_card,
      'credit card': PaymentMethod.credit_card,
      cartao: PaymentMethod.credit_card,
      cartão: PaymentMethod.credit_card,
      debit_card: PaymentMethod.debit_card,
      'debit card': PaymentMethod.debit_card,
      dinheiro: PaymentMethod.cash,
      cash: PaymentMethod.cash,
      money: PaymentMethod.cash,
    };
    return map[normalized] || null;
  }

  private async geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
    const apiKey = process.env.GOOGLE_MAPS_KEY || process.env.VITE_GOOGLE_MAPS_KEY;
    if (!apiKey) {
      this.logger.warn('[AI_ORDER] geocoding_skipped reason=no_google_maps_key');
      return null;
    }

    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: {
          address,
          key: apiKey,
          components: 'country:BR',
        },
      });

      if (response.data.status === 'OK' && response.data.results.length > 0) {
        const location = response.data.results[0].geometry.location;
        this.logger.log(`[AI_ORDER] geocoding_success address="${address}"`);
        return { lat: location.lat, lng: location.lng };
      }
      this.logger.warn(`[AI_ORDER] geocoding_no_results address="${address}" status=${response.data.status}`);
    } catch (error) {
      this.logger.warn(`[AI_ORDER] geocoding_failed address="${address}" error=${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return null;
  }

  /**
   * Resolve o endereço de entrega. Geocoding é best-effort:
   * se não tiver Google Maps Key ou se falhar, prossegue com lat/lng nulo.
   * O CheckoutValidatorService calculará a taxa por bairro/fixo.
   */
  private async resolveDeliveryAddress(
    endereco: NonNullable<z.infer<typeof CriarPedidoSchema>['endereco']>,
  ): Promise<DeliveryAddressDTO> {
    const address: DeliveryAddressDTO = {
      street: endereco.street,
      number: endereco.number,
      neighborhood: endereco.neighborhood,
      city: endereco.city,
      state: endereco.state || '',
      zipCode: endereco.zipCode || '',
      complement: endereco.complement || undefined,
      reference: undefined,
      lat: endereco.lat ?? null,
      lng: endereco.lng ?? null,
    };

    if (!address.lat || !address.lng) {
      const fullAddress = [
        address.street,
        address.number,
        address.neighborhood,
        address.city,
        address.state,
        address.zipCode,
      ].filter(Boolean).join(', ');
      const coords = await this.geocodeAddress(fullAddress);
      if (coords) {
        address.lat = coords.lat;
        address.lng = coords.lng;
      } else {
        // Best-effort: continua sem coordenadas; CheckoutValidator usará taxa por bairro/fixa
        this.logger.warn(`[AI_ORDER] geocoding_best_effort_failed address="${fullAddress}" — proceeding without coords`);
      }
    }

    return address;
  }

  private async executeCriarPedido(tenantId: string, args: z.infer<typeof CriarPedidoSchema>, sessionContext?: AgentSessionContext) {
    const fulfillmentType = args.fulfillmentType ?? 'delivery';
    this.logger.log(
      `[AI_ORDER] create_order_start tenantId=${tenantId} fulfillmentType=${fulfillmentType} itemsCount=${args.itens?.length ?? 0}`,
    );

    let ctx = sessionContext;
    if (!ctx?.customerId && ctx?.customerPhone) {
      const cleanPhone = ctx.customerPhone.replace(/\D/g, '');
      const customer = await this.prisma.customer.upsert({
        where: { tenantId_phone: { tenantId, phone: cleanPhone } },
        create: { tenantId, phone: cleanPhone, name: ctx.customerName || 'Cliente WhatsApp' },
        update: { name: ctx.customerName || undefined },
        select: { id: true, name: true, phone: true },
      });
      ctx = {
        ...ctx,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
      };
    }

    if (!ctx?.customerId) {
      this.logger.warn('[AI_ORDER_ERROR] missing_required_fields fields=[customerId]');
      return {
        status: 'error',
        code: 'CUSTOMER_NOT_IDENTIFIED',
        message: 'Cliente não identificado. Confirme o telefone ou transfira para atendente.',
      };
    }

    // Validate required fields
    const missingFields: string[] = [];
    if (!args.itens || args.itens.length === 0) missingFields.push('itens');
    if (!args.formaPagamento) missingFields.push('forma de pagamento');
    if (!ctx.customerPhone) missingFields.push('telefone do cliente');

    if (fulfillmentType === 'delivery') {
      if (!args.endereco?.street) missingFields.push('rua do endereço');
      if (!args.endereco?.number) missingFields.push('número do endereço');
      if (!args.endereco?.neighborhood) missingFields.push('bairro do endereço');
      if (!args.endereco?.city) missingFields.push('cidade do endereço');
    }

    if (missingFields.length > 0) {
      this.logger.warn(`[AI_ORDER_ERROR] missing_required_fields fields=[${missingFields.join(',')}]`);
      return {
        status: 'error',
        code: 'MISSING_REQUIRED_FIELDS',
        message: `Dados obrigatórios faltando: ${missingFields.join(', ')}.`,
        missingFields,
      };
    }

    try {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) throw new Error('Loja não encontrada');

      const paymentMethod = this.normalizePaymentMethod(args.formaPagamento);
      if (!paymentMethod) {
        return {
          status: 'error',
          code: 'INVALID_PAYMENT_METHOD',
          message: 'Forma de pagamento inválida. Use pix, credit_card ou cash.',
        };
      }

      // Resolve delivery address (geocoding is best-effort — won't throw if Maps key is absent)
      let deliveryAddress: DeliveryAddressDTO | undefined;
      if (fulfillmentType === 'delivery' && args.endereco) {
        deliveryAddress = await this.resolveDeliveryAddress(args.endereco);
        this.logger.log(
          `[AI_ORDER] delivery_address_resolved hasCoords=${Boolean(deliveryAddress.lat && deliveryAddress.lng)}`,
        );
      }

      const orderDto: CreateOrderDTO = {
        idempotencyKey: Math.random().toString(36).substring(7),
        items: args.itens.map((i) => ({
          lineType: 'product',
          productId: i.productId,
          quantity: i.quantity,
          notes: i.notes,
        })),
        customerName: ctx.customerName || 'Cliente WhatsApp',
        customerPhone: ctx.customerPhone || '00000000000',
        fulfillmentType,
        deliveryAddress,
        payment: {
          method: paymentMethod,
          changeFor: paymentMethod === PaymentMethod.cash ? args.troco : undefined,
        },
        scheduledFor: args.scheduledFor,
        timeSlotId: args.timeSlotId,
        sourceChannel: 'whatsapp_ai',
      };

      this.logger.log(`[AI_ORDER] checkout_validator_called tenantId=${tenantId} slug=${tenant.slug}`);

      const order = await this.ordersService.createOrder(
        tenant.slug,
        orderDto,
      );

      this.logger.log(
        `[AI_ORDER] create_order_success orderId=${order.id} orderNumber=${order.orderNumber} total=${order.total}`,
      );

      return {
        status: 'success',
        success: true,
        orderId: order.id,
        orderNumber: order.orderNumber,
        totalAmount: Number(order.total),
        message: `Pedido #${order.orderNumber} criado com sucesso! O total é R$ ${order.total}.`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`[AI_ORDER_ERROR] create_order_failed tenantId=${tenantId} error=${message}`);
      return { status: 'error', code: 'ORDER_CREATION_FAILED', message: `Erro ao criar pedido: ${message}` };
    }
  }

  private async executeConsultarHorarioAtendimento(tenantId: string) {
    const hours = await this.prisma.tenantOperatingHours.findMany({
      where: { tenantId },
      orderBy: { dayOfWeek: 'asc' },
    });

    const status = await this.availabilityService.getStoreStatus(tenantId);
    const dayNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

    const formattedHours = hours.map(h => ({
      dia: dayNames[h.dayOfWeek],
      status: h.isOpen ? 'Aberto' : 'Fechado',
      horario: h.isOpen ? `${h.openTime} às ${h.closeTime}` : '-',
    }));

    return {
      statusAtual: status.message,
      isOpen: status.isOpen,
      proximaAbertura: status.nextOpenAt,
      escalaSemanal: formattedHours.length > 0 ? formattedHours : 'Horário não configurado (Aberto 24h)',
    };
  }

  private async executeConsultarStatusPedido(tenantId: string, sessionContext?: AgentSessionContext) {
    if (!sessionContext?.customerId) return { status: 'error', message: 'Cliente não identificado.' };
    
    const order = await this.ordersService.getLatestCustomerOrder(tenantId, sessionContext.customerId);
    if (!order) return { message: 'Você ainda não possui pedidos realizados.' };

    const statusLabels: Record<string, string> = {
      pending: 'Aguardando confirmação',
      confirmed: 'Confirmado e em fila',
      preparing: 'Sendo preparado com carinho',
      ready_for_delivery: 'Pronto para entrega',
      out_for_delivery: 'Em rota de entrega',
      completed: 'Entregue / Concluído',
      cancelled: 'Cancelado',
    };

    return {
      pedidoNumero: order.orderNumber,
      status: statusLabels[order.status] || order.status,
      data: order.createdAt,
      ultimaAtualizacao: order.timeline[0]?.note || 'Pedido recebido',
      total: Number(order.total),
    };
  }

  private async executeConsultarFidelidade(tenantId: string, sessionContext?: AgentSessionContext) {
    if (!sessionContext?.customerId) return { status: 'error', message: 'Cliente não identificado.' };
    
    const balance = await this.cashbackService.getCashbackBalance(tenantId, sessionContext.customerId);
    return {
      saldoCashback: balance,
      mensagem: balance > 0 
        ? `Você tem R$ ${balance.toFixed(2)} de saldo para usar!` 
        : 'Você ainda não possui saldo de cashback, mas ganhará nesta compra!'
    };
  }

  private async executeRepetirUltimoPedido(tenantId: string, sessionContext?: AgentSessionContext) {
    if (!sessionContext?.customerId) {
      return { status: 'error', message: 'Cliente não identificado.' };
    }

    if (sessionContext.allowRepeatLastOrder === false) {
      return {
        status: 'error',
        code: 'REPEAT_ORDER_DISABLED',
        message: 'Repetir último pedido não está habilitado para este tenant.',
      };
    }

    const order = await this.ordersService.getLatestCustomerOrder(tenantId, sessionContext.customerId);
    if (!order) {
      return { message: 'Não encontramos pedidos anteriores para repetir.' };
    }

    // Build summary of last order for memory
    const itemsSummary = order.items
      .map((i) => `${i.quantity}x ${i.snapshotName}`)
      .join(', ');

    const lastOrderSummary = `#${order.orderNumber}: ${itemsSummary} (${new Date(order.createdAt).toLocaleDateString('pt-BR')})`;

    this.logger.log(
      `[AI_MEMORY] last_order_loaded customerId=${sessionContext.customerId} orderId=${order.id}`,
    );

    return {
      hasLastOrder: true,
      orderId: order.id,
      orderNumber: order.orderNumber,
      items: order.items.map((i) => ({
        productId: i.productId,
        nome: i.snapshotName,
        quantidade: i.quantity,
        notas: i.notes,
      })),
      total: Number(order.total),
      createdAt: order.createdAt.toISOString(),
      summary: lastOrderSummary,
      mensagem: `Seu último pedido foi o ${order.orderNumber} com ${itemsSummary}. Deseja repetir esses itens? Vou recalcular preços e confirmar a entrega.`,
    };
  }

  private async executeAplicarCupom(tenantId: string, args: z.infer<typeof AplicarCupomSchema>) {
    try {
      const result = await this.couponsService.validateCouponForTotal(tenantId, args.cupom, args.valorCarrinho);
      return {
        status: 'success',
        desconto: result.discountAmount,
        mensagem: `Cupom ${args.cupom} aplicado! Desconto de R$ ${result.discountAmount.toFixed(2)}.`
      };
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async executeConsultarTempoEspera(tenantId: string, args: z.infer<typeof ConsultarTempoEsperaSchema>) {
    const orders = await this.prisma.order.count({
      where: {
        tenantId,
        status: { in: ['confirmed', 'preparing'] }
      }
    });

    const baseTime = args.tipo === 'pickup' ? 15 : 30;
    const additionalTime = orders * 5; // 5 min por pedido na fila
    const minTime = baseTime + additionalTime;
    const maxTime = minTime + 15;

    return {
      tempoEstimado: `${minTime}-${maxTime} minutos`,
      pedidosNaFila: orders,
      mensagem: `O tempo estimado para ${args.tipo === 'pickup' ? 'retirada' : 'entrega'} é de ${minTime} a ${maxTime} minutos.`
    };
  }

  private async executeObterLinkRastreamento(tenantId: string, sessionContext?: AgentSessionContext) {
    if (!sessionContext?.customerId) return { status: 'error', message: 'Cliente não identificado.' };
    
    const order = await this.ordersService.getLatestCustomerOrder(tenantId, sessionContext.customerId);
    if (!order) return { message: 'Não encontramos pedidos ativos para rastreio.' };

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const trackingUrl = `https://${tenant?.slug}.gestordelivery.com.br/track/${order.orderNumber}`;

    return {
      pedido: order.orderNumber,
      status: order.status,
      linkRastreamento: trackingUrl,
      mensagem: `Você pode acompanhar seu pedido em tempo real aqui: ${trackingUrl}`
    };
  }

  private async executeVerificarIngrediente(tenantId: string, args: z.infer<typeof VerificarIngredienteSchema>) {
    const productId = args.productId;
    const term = args.ingrediente.toLowerCase();

    const recipe = await this.prisma.productRecipeIngredient.findMany({
      where: { productId, tenantId },
      include: { ingredient: true }
    });

    const found = recipe.some(r => r.ingredient.name.toLowerCase().includes(term));
    const list = recipe.map(r => r.ingredient.name).join(', ');

    return {
      contemIngrediente: found,
      listaIngredientes: list,
      mensagem: found 
        ? `Sim, este item contém ${args.ingrediente}.` 
        : `Não encontramos ${args.ingrediente} na ficha técnica deste item. Ingredientes principais: ${list}`
    };
  }

  private async executeConsultarSlots(tenantId: string, args: z.infer<typeof ConsultarSlotsSchema>) {
    const date = args.data ? new Date(args.data) : new Date();
    const slots = await this.schedulingService.getAvailableTimeSlots(date, tenantId);

    return {
      data: date.toISOString().split('T')[0],
      slotsDisponiveis: slots.map(s => ({
        id: s.id,
        horario: new Date(s.startTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        vagas: s.availableCapacity
      })),
      mensagem: slots.length > 0 
        ? `Temos ${slots.length} horários disponíveis para agendamento nesta data.` 
        : 'Infelizmente não há horários disponíveis para a data selecionada.'
    };
  }

  private async executeConsultarOfertasCheckout(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new Error('Loja não encontrada');

    const payload = await this.storefrontService.getStorefrontPayload(tenant.slug);
    
    return {
      ofertas: payload.upsells.map((u: { name: string, description?: string | null, items: { productId: string, name: string, finalPrice: number }[] }) => ({
        titulo: u.name,
        descricao: u.description || '',
        opcoes: u.items.map((i) => ({
          productId: i.productId,
          nome: i.name,
          preco: i.finalPrice
        }))
      })),
      mensagem: 'Aqui estão algumas sugestões para acompanhar seu pedido!'
    };
  }

  private async executeConsultarFormasPagamento(
    tenantId: string,
  ): Promise<ReturnType<typeof buildAgentPaymentMethodsResult>> {
    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: {
        paymentMethods: true,
        pixKey: true,
        mercadoPagoAccessToken: true,
      },
    });

    if (!settings) {
      return {
        methods: [],
        notes: 'Configurações de pagamento não encontradas para esta loja.',
        pixAutomaticAvailable: false,
      };
    }

    return buildAgentPaymentMethodsResult({
      paymentMethodsRaw: settings.paymentMethods,
      pixKey: settings.pixKey,
      mercadoPagoAccessToken: settings.mercadoPagoAccessToken,
    });
  }

  private async executeConsultarDetalheProduto(
    tenantId: string,
    args: z.infer<typeof ConsultarDetalheProdutoSchema>,
  ): Promise<
    | AgentProductDetailResult
    | AgentComboDetailResult
    | { status: 'multiple'; matches: Array<{ id: string; name: string; type: string }> }
    | { status: 'error'; code: string; message: string }
  > {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      return { status: 'error', code: 'TENANT_NOT_FOUND', message: 'Loja não encontrada.' };
    }

    const payload = await this.storefrontService.getStorefrontPayload(tenant.slug);
    const targetId = args.productId?.trim() || args.comboId?.trim();

    if (targetId) {
      const byId = await this.resolveCatalogDetailById(tenantId, payload, targetId);
      if (byId) {
        return byId;
      }
      const legacyCombo = await this.resolveLegacyComboDetail(tenantId, targetId);
      if (legacyCombo) {
        return legacyCombo;
      }
      return {
        status: 'error',
        code: 'NOT_FOUND',
        message: 'Produto ou combo não encontrado ou indisponível no cardápio.',
      };
    }

    const term = args.nomeOuBusca?.trim().toLowerCase() ?? '';
    const matches = this.searchCatalogMatches(payload, term);

    if (matches.length === 0) {
      return {
        status: 'error',
        code: 'NOT_FOUND',
        message: 'Nenhum produto ou combo encontrado com esse nome. Peça mais detalhes ou use consultar_cardapio.',
      };
    }

    if (matches.length > 1) {
      return {
        status: 'multiple',
        matches: matches.slice(0, 8).map((m) => ({
          id: m.id,
          name: m.name,
          type: m.kind,
        })),
      };
    }

    const single = matches[0];
    const detail = await this.resolveCatalogDetailById(tenantId, payload, single.id);
    if (detail) {
      return detail;
    }

    if (single.kind === 'combo') {
      const legacyCombo = await this.resolveLegacyComboDetail(tenantId, single.id);
      if (legacyCombo) {
        return legacyCombo;
      }
    }

    return {
      status: 'error',
      code: 'NOT_AVAILABLE',
      message: 'Item encontrado mas indisponível no momento.',
    };
  }

  private searchCatalogMatches(
    payload: StorefrontPayload,
    term: string,
  ): Array<{ id: string; name: string; kind: 'product' | 'combo' }> {
    const results: Array<{ id: string; name: string; kind: 'product' | 'combo' }> = [];

    for (const category of payload.categories) {
      for (const product of category.products) {
        const haystack = `${product.name} ${product.shortDescription ?? ''} ${product.longDescription ?? ''}`.toLowerCase();
        if (haystack.includes(term)) {
          results.push({
            id: product.id,
            name: product.name,
            kind: product.type === 'combo' ? 'combo' : 'product',
          });
        }
      }
    }

    for (const combo of payload.combos) {
      const haystack = `${combo.name} ${combo.description ?? ''}`.toLowerCase();
      if (haystack.includes(term)) {
        results.push({ id: combo.id, name: combo.name, kind: 'combo' });
      }
    }

    return results;
  }

  private async resolveCatalogDetailById(
    tenantId: string,
    payload: StorefrontPayload,
    id: string,
  ): Promise<AgentProductDetailResult | AgentComboDetailResult | null> {
    for (const combo of payload.combos) {
      if (combo.id === id) {
        if (!combo.isAvailable) {
          return null;
        }
        return mapStorefrontComboToAgentDetail(combo);
      }
    }

    for (const category of payload.categories) {
      for (const product of category.products) {
        if (product.id !== id) {
          continue;
        }
        if (!product.isAvailable) {
          return null;
        }
        if (product.type === 'combo') {
          const fromCombos = payload.combos.find((c) => c.id === id);
          if (fromCombos?.isAvailable) {
            return mapStorefrontComboToAgentDetail(fromCombos);
          }
          const comboShape: StorefrontComboPayload = {
            id: product.id,
            name: product.name,
            slug: product.slug,
            description: product.longDescription ?? product.shortDescription,
            basePrice: product.basePrice,
            image: product.image,
            isAvailable: product.isAvailable,
            blocks: this.extractComboBlocksFromProduct(product),
            bundleItems: this.extractBundleItemsFromProduct(product),
          };
          return mapStorefrontComboToAgentDetail(comboShape);
        }
        return mapStorefrontProductToAgentDetail(product, category.name);
      }
    }

    const inactive = await this.prisma.product.findFirst({
      where: { id, tenantId, deletedAt: null, isActive: false },
      select: { id: true, name: true },
    });
    if (inactive) {
      return null;
    }

    return null;
  }

  private extractComboBlocksFromProduct(
    product: StorefrontProductPayload,
  ): StorefrontComboPayload['blocks'] {
    const extended = product as StorefrontProductPayload & {
      blocks?: StorefrontComboPayload['blocks'];
    };
    return extended.blocks;
  }

  private extractBundleItemsFromProduct(
    product: StorefrontProductPayload,
  ): StorefrontComboPayload['bundleItems'] {
    const extended = product as StorefrontProductPayload & {
      bundleItems?: StorefrontComboPayload['bundleItems'];
    };
    return extended.bundleItems;
  }

  private async resolveLegacyComboDetail(
    tenantId: string,
    comboId: string,
  ): Promise<AgentComboDetailResult | null> {
    const combo = await this.prisma.productCombo.findFirst({
      where: { id: comboId, tenantId, deletedAt: null },
      include: {
        blocks: {
          orderBy: { order: 'asc' },
          include: {
            items: {
              orderBy: { order: 'asc' },
              include: { product: true },
            },
          },
        },
      },
    });

    if (!combo || !combo.isActive) {
      return null;
    }

    return {
      type: 'combo',
      id: combo.id,
      name: combo.name,
      description: combo.description,
      basePrice: Number(combo.basePrice),
      isAvailable: true,
      blocks: combo.blocks.map((block) => ({
        name: block.name,
        minSelect: block.minSelect,
        maxSelect: block.maxSelect,
        items: block.items
          .filter((item) => item.product.isActive && item.product.deletedAt === null)
          .map((item) => ({
            productId: item.productId,
            name: item.product.name,
            additionalPrice: Number(item.additionalPrice),
          })),
      })),
    };
  }
}
