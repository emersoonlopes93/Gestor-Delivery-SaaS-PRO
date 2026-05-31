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
import { ConversationService } from './conversation.service';
import { validateOrderDraft } from '../utils/order-draft-validator.util';

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

/**
 * Normaliza campos enviados pelo LLM em snake_case para camelCase.
 * O Gemini serializa campos camelCase como snake_case ao invocar tools
 * (ex: `forma_pagamento` em vez de `formaPagamento`).
 */
function normalizeCriarPedidoArgs(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const obj = raw as Record<string, unknown>;

  // Normaliza campos top-level
  const normalized: Record<string, unknown> = { ...obj };
  if (obj['forma_pagamento'] !== undefined && obj['formaPagamento'] === undefined) {
    normalized['formaPagamento'] = obj['forma_pagamento'];
    delete normalized['forma_pagamento'];
  }
  if (obj['fulfillment_type'] !== undefined && obj['fulfillmentType'] === undefined) {
    normalized['fulfillmentType'] = obj['fulfillment_type'];
    delete normalized['fulfillment_type'];
  }
  if (obj['scheduled_for'] !== undefined && obj['scheduledFor'] === undefined) {
    normalized['scheduledFor'] = obj['scheduled_for'];
    delete normalized['scheduled_for'];
  }
  if (obj['time_slot_id'] !== undefined && obj['timeSlotId'] === undefined) {
    normalized['timeSlotId'] = obj['time_slot_id'];
    delete normalized['time_slot_id'];
  }

  // Normaliza campos dentro de cada item
  if (Array.isArray(obj['itens'])) {
    normalized['itens'] = obj['itens'].map((item: unknown) => {
      if (typeof item !== 'object' || item === null) return item;
      const it = item as Record<string, unknown>;
      const normItem: Record<string, unknown> = { ...it };
      if (it['product_id'] !== undefined && it['productId'] === undefined) {
        normItem['productId'] = it['product_id'];
        delete normItem['product_id'];
      }
      if (it['combo_id'] !== undefined && it['comboId'] === undefined) {
        normItem['comboId'] = it['combo_id'];
        delete normItem['combo_id'];
      }
      if (it['combo_selections'] !== undefined && it['comboSelections'] === undefined) {
        normItem['comboSelections'] = it['combo_selections'];
        delete normItem['combo_selections'];
      }
      // Normaliza dentro de complements
      if (Array.isArray(it['complements'])) {
        normItem['complements'] = it['complements'].map((c: unknown) => {
          if (typeof c !== 'object' || c === null) return c;
          const comp = c as Record<string, unknown>;
          const normComp: Record<string, unknown> = { ...comp };
          if (comp['group_id'] !== undefined && comp['groupId'] === undefined) {
            normComp['groupId'] = comp['group_id'];
            delete normComp['group_id'];
          }
          if (comp['item_id'] !== undefined && comp['itemId'] === undefined) {
            normComp['itemId'] = comp['item_id'];
            delete normComp['item_id'];
          }
          return normComp;
        });
      }
      // Normaliza dentro de comboSelections
      if (Array.isArray(normItem['comboSelections'])) {
        normItem['comboSelections'] = (normItem['comboSelections'] as unknown[]).map((s: unknown) => {
          if (typeof s !== 'object' || s === null) return s;
          const sel = s as Record<string, unknown>;
          const normSel: Record<string, unknown> = { ...sel };
          if (sel['block_id'] !== undefined && sel['blockId'] === undefined) {
            normSel['blockId'] = sel['block_id'];
            delete normSel['block_id'];
          }
          if (sel['block_item_id'] !== undefined && sel['blockItemId'] === undefined) {
            normSel['blockItemId'] = sel['block_item_id'];
            delete normSel['block_item_id'];
          }
          return normSel;
        });
      }
      return normItem;
    });
  }

  return normalized;
}

const CriarPedidoSchema = z.preprocess(
  normalizeCriarPedidoArgs,
  z.object({
    itens: z.array(z.object({
      productId: z.string().optional(),
      comboId: z.string().optional(),
      quantity: z.number().int(),
      notes: z.string().optional(),
      complements: z.array(z.object({
        groupId: z.string(),
        itemId: z.string(),
      })).optional(),
      comboSelections: z.array(z.object({
        blockId: z.string(),
        blockItemId: z.string(),
      })).optional(),
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
  }),
);

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
  fulfillmentType: z.enum(['delivery', 'pickup']).optional(),
});

const AdicionarItemPedidoSchema = z.object({
  productId: z.string().optional(),
  nomeOuBusca: z.string().optional(),
  quantidade: z.number().int().min(1),
  notas: z.string().optional(),
});

const DefinirEntregaRetiradaSchema = z.object({
  tipo: z.enum(['delivery', 'pickup']),
});

const DefinirEnderecoEntregaSchema = z.object({
  rua: z.string().optional(),
  numero: z.string().optional(),
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  estado: z.string().optional(),
  cep: z.string().optional(),
  complemento: z.string().optional(),
  referencia: z.string().optional(),
});

const DefinirFormaPagamentoSchema = z.object({
  metodo: z.string(),
  troco: z.number().optional(),
  semTroco: z.boolean().optional(),
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
    @Inject(forwardRef(() => ConversationService))
    private readonly conversationService: ConversationService,
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
        description: 'Cria um pedido final no sistema. Só chame esta função quando o cliente confirmar explicitamente todos os itens, endereço (para delivery) e forma de pagamento. Para pickup (retirada no balcão), omita o campo endereco. IMPORTANTE: se o produto tiver complementos obrigatórios (ex: escolha de borda de pizza), você DEVE chamar consultar_detalhe_produto antes para obter os groupId e itemId corretos e incluí-los no campo complements do item. Nunca crie o pedido sem os complementos obrigatórios.',
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
              description: 'Lista de itens do pedido. Para produtos com complementos obrigatórios, inclua o campo complements com os IDs obtidos via consultar_detalhe_produto.',
              items: {
                type: 'object',
                properties: {
                  productId: { type: 'string', description: 'ID do produto (use consultar_cardapio ou consultar_detalhe_produto para obter)' },
                  comboId: { type: 'string', description: 'ID do combo — use este OU productId, nunca ambos' },
                  quantity: { type: 'integer', description: 'Quantidade solicitada pelo cliente' },
                  notes: { type: 'string', description: 'Observações do item (ex: sem cebola, bem passado)' },
                  complements: {
                    type: 'array',
                    description: 'Seleções de complementos (borda, tamanho, adicionais). Obrigatório quando o produto tem grupos obrigatórios. Use consultar_detalhe_produto para obter groupId e itemId.',
                    items: {
                      type: 'object',
                      properties: {
                        groupId: { type: 'string', description: 'ID do grupo de complemento (ex: grupo "Escolha a Borda")' },
                        itemId: { type: 'string', description: 'ID do item dentro do grupo (ex: item "Catupiry")' },
                      },
                      required: ['groupId', 'itemId'],
                    },
                  },
                  comboSelections: {
                    type: 'array',
                    description: 'Seleções de blocos do combo. Use consultar_detalhe_produto para obter blockId e blockItemId.',
                    items: {
                      type: 'object',
                      properties: {
                        blockId: { type: 'string', description: 'ID do bloco do combo' },
                        blockItemId: { type: 'string', description: 'ID do item selecionado no bloco' },
                      },
                      required: ['blockId', 'blockItemId'],
                    },
                  },
                },
                required: ['quantity'],
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
      {
        name: 'adicionar_item_pedido',
        description: 'Adiciona um item ao rascunho do pedido (orderDraft) e persiste no backend. Use IMEDIATAMENTE quando o cliente informar o que quer pedir. Resolve o produto real no cardápio antes de adicionar.',
        parameters: {
          type: 'object',
          properties: {
            productId: { type: 'string', description: 'ID do produto (se conhecido). Prefira este campo.' },
            nomeOuBusca: { type: 'string', description: 'Nome ou termo para buscar no cardápio quando o ID não for conhecido' },
            quantidade: { type: 'integer', description: 'Quantidade solicitada pelo cliente' },
            notas: { type: 'string', description: 'Observações do item (ex: sem cebola)' },
          },
          required: ['quantidade'],
        },
      },
      {
        name: 'definir_entrega_retirada',
        description: 'Define se o pedido será entrega (delivery) ou retirada (pickup) no balcão. Salva no orderDraft. Use quando o cliente informar o tipo de entrega.',
        parameters: {
          type: 'object',
          properties: {
            tipo: {
              type: 'string',
              enum: ['delivery', 'pickup'],
              description: 'delivery = entrega no endereço; pickup = retirada no balcão',
            },
          },
          required: ['tipo'],
        },
      },
      {
        name: 'definir_endereco_entrega',
        description: 'Define ou atualiza o endereço de entrega no orderDraft. Mantenha fulfillmentType=delivery. Use sempre que o cliente informar qualquer parte do endereço.',
        parameters: {
          type: 'object',
          properties: {
            rua: { type: 'string', description: 'Nome da rua' },
            numero: { type: 'string', description: 'Número do imóvel' },
            bairro: { type: 'string', description: 'Bairro (obrigatório para delivery)' },
            cidade: { type: 'string', description: 'Cidade' },
            estado: { type: 'string', description: 'Estado (sigla)' },
            cep: { type: 'string', description: 'CEP (opcional)' },
            complemento: { type: 'string', description: 'Complemento (apto, bloco, etc.)' },
            referencia: { type: 'string', description: 'Ponto de referência' },
          },
        },
      },
      {
        name: 'definir_forma_pagamento',
        description: 'Define a forma de pagamento e o troco no orderDraft. Use quando o cliente informar como vai pagar.',
        parameters: {
          type: 'object',
          properties: {
            metodo: {
              type: 'string',
              enum: ['pix', 'credit_card', 'debit_card', 'cash'],
              description: 'Forma de pagamento: pix, credit_card, debit_card ou cash (dinheiro)',
            },
            troco: { type: 'number', description: 'Valor para troco quando metodo=cash (ex: 100 para troco de R$100). Use 0 se não precisar de troco.' },
            semTroco: { type: 'boolean', description: 'true se o cliente confirmar que não precisa de troco' },
          },
          required: ['metodo'],
        },
      },
      {
        name: 'consultar_resumo_pedido',
        description: 'Retorna o resumo atual do orderDraft com todos os campos preenchidos e os campos faltantes. Use para verificar o estado do pedido antes de mostrar o resumo final.',
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

        case 'adicionar_item_pedido': {
          const parsedArgs = AdicionarItemPedidoSchema.parse(args || {});
          return await this.executeAdicionarItemPedido(tenantId, parsedArgs, sessionContext);
        }

        case 'definir_entrega_retirada': {
          const parsedArgs = DefinirEntregaRetiradaSchema.parse(args || {});
          return await this.executeDefinirEntregaRetirada(parsedArgs, sessionContext);
        }

        case 'definir_endereco_entrega': {
          const parsedArgs = DefinirEnderecoEntregaSchema.parse(args || {});
          return await this.executeDefinirEnderecoEntrega(parsedArgs, sessionContext);
        }

        case 'definir_forma_pagamento': {
          const parsedArgs = DefinirFormaPagamentoSchema.parse(args || {});
          return await this.executeDefinirFormaPagamento(parsedArgs, sessionContext);
        }

        case 'consultar_resumo_pedido':
          return await this.executeConsultarResumoPedido(sessionContext);

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
          lineType: i.comboId ? 'combo' : 'product',
          productId: i.productId || undefined,
          comboId: i.comboId || undefined,
          quantity: i.quantity,
          notes: i.notes || undefined,
          complements: i.complements?.map((c) => ({
            groupId: c.groupId,
            itemId: c.itemId,
          })),
          comboSelections: i.comboSelections?.map((c) => ({
            blockId: c.blockId,
            blockItemId: c.blockItemId,
          })),
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

      // When the error is about missing required complements, return the complement groups
      // with their IDs so the LLM can retry with the correct complement selections.
      const isComplementError = message.includes('Selecione pelo menos') ||
        message.toLowerCase().includes('complement') ||
        message.toLowerCase().includes('opções em');

      if (isComplementError) {
        try {
          const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
          if (tenant) {
            const payload = await this.storefrontService.getStorefrontPayload(tenant.slug);
            // Collect missing complement groups for the items that were in the order
            const itemProductIds = args.itens
              .map((i) => i.productId)
              .filter((id): id is string => Boolean(id));

            const missingGroups: Array<{
              productName: string;
              groupId: string;
              groupName: string;
              required: boolean;
              options: Array<{ id: string; name: string; additionalPrice: number }>;
            }> = [];

            for (const cat of payload.categories) {
              for (const prod of cat.products) {
                if (!itemProductIds.includes(prod.id)) continue;
                for (const comp of prod.complements) {
                  if (!comp.isRequired) continue;
                  const alreadySelected = args.itens.some((i) =>
                    i.productId === prod.id &&
                    i.complements?.some((c) => c.groupId === comp.id),
                  );
                  if (!alreadySelected) {
                    missingGroups.push({
                      productName: prod.name,
                      groupId: comp.id,
                      groupName: comp.name,
                      required: true,
                      options: comp.items
                        .filter((item) => item.isAvailable)
                        .map((item) => ({ id: item.id, name: item.name, additionalPrice: item.additionalPrice })),
                    });
                  }
                }
              }
            }

            if (missingGroups.length > 0) {
              this.logger.warn(`[AI_ORDER_ERROR] missing_complements count=${missingGroups.length} groups=${missingGroups.map((g) => g.groupName).join(',')}`);
              return {
                status: 'error',
                code: 'MISSING_REQUIRED_COMPLEMENTS',
                message: `Complementos obrigatórios faltando. Chame criar_pedido novamente incluindo as seleções abaixo no campo complements de cada item.`,
                missingComplements: missingGroups,
                instruction: 'Para cada grupo abaixo, escolha uma opção e inclua {groupId, itemId} no array complements do item correspondente em itens[].',
              };
            }
          }
        } catch (lookupError) {
          this.logger.warn(`[AI_ORDER_ERROR] complement_lookup_failed error=${lookupError instanceof Error ? lookupError.message : 'Unknown'}`);
        }
      }

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
    // Buscar timezone do tenant (TenantSettings)
    const tenantSettings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: { timezone: true } as { timezone: true },
    }).catch(() => null);

    // Fallback para America/Sao_Paulo se não configurado
    const timezone = (tenantSettings as { timezone?: string } | null)?.timezone || 'America/Sao_Paulo';

    let date: Date;
    if (args.data) {
      // Interpretar a data no timezone do tenant para evitar off-by-one
      const [year, month, day] = args.data.split('-').map(Number);
      // Cria a data às 00:00 no timezone do tenant
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      // Usar a data informada diretamente
      date = new Date(year, (month ?? 1) - 1, day ?? 1, 12, 0, 0);
    } else {
      // Data atual no timezone do tenant
      const nowInTz = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
      const [y, m, d] = nowInTz.split('-').map(Number);
      date = new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0);
    }

    const slots = await this.schedulingService.getAvailableTimeSlots(date, tenantId);

    // Formatar horários no timezone do tenant
    const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
    });

    const dateLabel = new Intl.DateTimeFormat('pt-BR', {
      timeZone: timezone,
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    }).format(date);

    const slotsFormatados = slots.map((s) => ({
      id: s.id,
      horario: timeFormatter.format(new Date(s.startTime)),
      vagas: s.availableCapacity,
    }));

    this.logger.log(
      `[AI_SCHEDULING] slots_consulted date=${args.data ?? 'today'} tz=${timezone} count=${slots.length} fulfillmentType=${args.fulfillmentType ?? 'any'}`,
    );

    return {
      data: new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date),
      dataLabel: dateLabel,
      timezone,
      slotsDisponiveis: slotsFormatados,
      mensagem: slots.length > 0
        ? `Temos ${slots.length} horários disponíveis para agendamento em ${dateLabel}: ${slotsFormatados.map((s) => s.horario).join(', ')}.`
        : `Infelizmente não há horários disponíveis para ${dateLabel}.`,
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
    const bestMatch = this.pickBestCatalogMatch(matches, term);

    if (matches.length === 0) {
      return {
        status: 'error',
        code: 'NOT_FOUND',
        message: 'Nenhum produto ou combo encontrado com esse nome. Peça mais detalhes ou use consultar_cardapio.',
      };
    }

    if (matches.length > 1 && !bestMatch) {
      return {
        status: 'multiple',
        matches: matches.slice(0, 8).map((m) => ({
          id: m.id,
          name: m.name,
          type: m.kind,
        })),
      };
    }

    const single = bestMatch ?? matches[0];
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

  private normalizeCatalogSearchText(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  private pickBestCatalogMatch(
    matches: Array<{ id: string; name: string; kind: 'product' | 'combo' }>,
    term: string,
  ): { id: string; name: string; kind: 'product' | 'combo' } | null {
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0];

    const normalizedTerm = this.normalizeCatalogSearchText(term);
    const exact = matches.filter((match) => this.normalizeCatalogSearchText(match.name) === normalizedTerm);
    if (exact.length > 0) return exact[0];

    const words = normalizedTerm.split(' ').filter((word) => word.length > 2);
    const wordMatches = matches
      .filter((match) => {
        const normalizedName = this.normalizeCatalogSearchText(match.name);
        return words.length > 0 && words.every((word) => normalizedName.includes(word));
      })
      .sort((a, b) => a.name.length - b.name.length);

    if (wordMatches.length === 1) return wordMatches[0];
    if (wordMatches.length > 1 && this.normalizeCatalogSearchText(wordMatches[0].name) !== this.normalizeCatalogSearchText(wordMatches[1].name)) {
      return wordMatches[0];
    }

    return null;
  }

  private searchCatalogMatches(
    payload: StorefrontPayload,
    term: string,
  ): Array<{ id: string; name: string; kind: 'product' | 'combo' }> {
    const results: Array<{ id: string; name: string; kind: 'product' | 'combo' }> = [];
    const normalizedTerm = this.normalizeCatalogSearchText(term);

    for (const category of payload.categories) {
      for (const product of category.products) {
        const haystack = this.normalizeCatalogSearchText(`${product.name} ${product.shortDescription ?? ''} ${product.longDescription ?? ''}`);
        const words = normalizedTerm.split(' ').filter((word) => word.length > 2);
        if (haystack.includes(normalizedTerm) || words.every((word) => haystack.includes(word))) {
          results.push({
            id: product.id,
            name: product.name,
            kind: product.type === 'combo' ? 'combo' : 'product',
          });
        }
      }
    }

    for (const combo of payload.combos) {
      const haystack = this.normalizeCatalogSearchText(`${combo.name} ${combo.description ?? ''}`);
      const words = normalizedTerm.split(' ').filter((word) => word.length > 2);
      if (haystack.includes(normalizedTerm) || words.every((word) => haystack.includes(word))) {
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
        blockId: block.id,
        name: block.name,
        minSelect: block.minSelect,
        maxSelect: block.maxSelect,
        items: block.items
          .filter((item) => item.product.isActive && item.product.deletedAt === null)
          .map((item) => ({
            blockItemId: item.id,
            productId: item.productId,
            name: item.product.name,
            additionalPrice: Number(item.additionalPrice),
          })),
      })),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Novas tools de coleta do orderDraft
  // ─────────────────────────────────────────────────────────────────────────

  private async executeAdicionarItemPedido(
    tenantId: string,
    args: z.infer<typeof AdicionarItemPedidoSchema>,
    sessionContext?: AgentSessionContext,
  ) {
    const sessionId = typeof sessionContext?.sessionId === 'string' ? sessionContext.sessionId : null;
    if (!sessionId) {
      return { status: 'error', code: 'NO_SESSION', message: 'Sessão não identificada.' };
    }

    // Resolver produto no catálogo
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return { status: 'error', code: 'TENANT_NOT_FOUND', message: 'Loja não encontrada.' };

    const payload = await this.storefrontService.getStorefrontPayload(tenant.slug);

    let resolvedId: string | null = args.productId?.trim() || null;
    let resolvedName: string | null = null;
    let resolvedPrice: number | null = null;

    if (resolvedId) {
      // Buscar por ID direto
      for (const cat of payload.categories) {
        const found = cat.products.find((p) => p.id === resolvedId && p.isAvailable);
        if (found) {
          resolvedName = found.name;
          resolvedPrice = Number(found.basePrice);
          break;
        }
      }
      if (!resolvedName) {
        const foundCombo = payload.combos.find((c) => c.id === resolvedId && c.isAvailable);
        if (foundCombo) {
          resolvedName = foundCombo.name;
          resolvedPrice = Number(foundCombo.basePrice);
        }
      }
    } else if (args.nomeOuBusca) {
      // Busca por nome
      const term = args.nomeOuBusca.trim().toLowerCase();
      const matches = this.searchCatalogMatches(payload, term);
      const bestMatch = this.pickBestCatalogMatch(matches, term);
      if (bestMatch) {
        resolvedId = bestMatch.id;
        resolvedName = bestMatch.name;
        // Buscar preço
        for (const cat of payload.categories) {
          const found = cat.products.find((p) => p.id === resolvedId);
          if (found) { resolvedPrice = Number(found.basePrice); break; }
        }
        if (!resolvedPrice) {
          const foundCombo = payload.combos.find((c) => c.id === resolvedId);
          if (foundCombo) resolvedPrice = Number(foundCombo.basePrice);
        }
      } else if (matches.length > 1) {
        return {
          status: 'multiple_matches',
          message: `Encontrei ${matches.length} produtos com esse nome. Qual você quer?`,
          matches: matches.slice(0, 5).map((m) => ({ id: m.id, nome: m.name })),
        };
      } else {
        return { status: 'error', code: 'NOT_FOUND', message: `Produto "${args.nomeOuBusca}" não encontrado no cardápio. Use consultar_cardapio para ver os itens disponíveis.` };
      }
    } else {
      return { status: 'error', code: 'INVALID_ARGS', message: 'Informe productId ou nomeOuBusca.' };
    }

    if (!resolvedId || !resolvedName) {
      return { status: 'error', code: 'NOT_FOUND', message: 'Produto não encontrado ou indisponível no cardápio.' };
    }

    // Carregar draft atual e adicionar/atualizar item
    const memory = await this.conversationService.getSessionAiMemory(sessionId);
    const existingItems = memory.orderDraft.items;

    const existingIndex = existingItems.findIndex((i) => i.productId === resolvedId);
    let updatedItems: typeof existingItems;

    if (existingIndex >= 0) {
      // Atualizar quantidade do item existente. Em runtime alguns providers podem
      // emitir a mesma tool duas vezes no mesmo turno; usar max evita duplicar.
      updatedItems = existingItems.map((item, idx) =>
        idx === existingIndex
          ? { ...item, quantity: Math.max(item.quantity, args.quantidade), notes: args.notas ?? item.notes }
          : item,
      );
    } else {
      // Adicionar novo item
      updatedItems = [
        ...existingItems,
        {
          productId: resolvedId,
          name: resolvedName,
          productName: resolvedName,
          quantity: args.quantidade,
          unitPrice: resolvedPrice,
          notes: args.notas ?? null,
        },
      ];
    }

    // Recalcular subtotal
    const subtotal = updatedItems.reduce((acc, item) => {
      const price = typeof item.unitPrice === 'number' ? item.unitPrice : 0;
      return acc + price * item.quantity;
    }, 0);

    // Atualizar draft
    await this.conversationService.updateOrderDraft(sessionId, {
      items: updatedItems,
      subtotal,
      customerPhone: memory.orderDraft.customerPhone || sessionContext?.customerPhone || null,
    });

    this.logger.log(
      `[AI_DRAFT] item_added product=${resolvedName} qty=${args.quantidade} sessionId=${sessionId} subtotal=${subtotal}`,
    );

    return {
      status: 'success',
      mensagem: `${args.quantidade}x ${resolvedName} adicionado ao pedido.`,
      item: { productId: resolvedId, nome: resolvedName, quantidade: args.quantidade, precoUnitario: resolvedPrice },
      subtotalAtual: subtotal,
    };
  }

  private async executeDefinirEntregaRetirada(
    args: z.infer<typeof DefinirEntregaRetiradaSchema>,
    sessionContext?: AgentSessionContext,
  ) {
    const sessionId = typeof sessionContext?.sessionId === 'string' ? sessionContext.sessionId : null;
    if (!sessionId) return { status: 'error', code: 'NO_SESSION', message: 'Sessão não identificada.' };

    await this.conversationService.updateOrderDraft(sessionId, {
      fulfillmentType: args.tipo,
    });

    this.logger.log(`[AI_DRAFT] fulfillment_set ${args.tipo} sessionId=${sessionId}`);

    const msg = args.tipo === 'delivery'
      ? 'Entrega em domicílio confirmada! Qual é o seu endereço?'
      : 'Retirada no balcão confirmada!';

    return { status: 'success', tipo: args.tipo, mensagem: msg };
  }

  private async executeDefinirEnderecoEntrega(
    args: z.infer<typeof DefinirEnderecoEntregaSchema>,
    sessionContext?: AgentSessionContext,
  ) {
    const sessionId = typeof sessionContext?.sessionId === 'string' ? sessionContext.sessionId : null;
    if (!sessionId) return { status: 'error', code: 'NO_SESSION', message: 'Sessão não identificada.' };

    const memory = await this.conversationService.getSessionAiMemory(sessionId);
    const existing = memory.orderDraft.deliveryAddress;

    const merged = {
      street: args.rua ?? existing.street,
      number: args.numero ?? existing.number,
      neighborhood: args.bairro ?? existing.neighborhood,
      city: args.cidade ?? existing.city,
      state: args.estado ?? existing.state,
      zipCode: args.cep ?? existing.zipCode,
      complement: args.complemento ?? existing.complement,
      reference: args.referencia ?? existing.reference,
      lat: existing.lat,
      lng: existing.lng,
    };

    await this.conversationService.updateOrderDraft(sessionId, {
      deliveryAddress: merged,
      // Garantir que o tipo de entrega permanece delivery
      fulfillmentType: 'delivery',
    });

    this.logger.log(`[AI_DRAFT] address_updated sessionId=${sessionId} street=${merged.street ?? ''} neighborhood=${merged.neighborhood ?? ''} city=${merged.city ?? ''}`);

    const partsPreenchidos = [
      merged.street ? `Rua: ${merged.street}` : null,
      merged.number ? `Nº ${merged.number}` : null,
      merged.neighborhood ? `Bairro: ${merged.neighborhood}` : null,
      merged.city ? `Cidade: ${merged.city}` : null,
    ].filter(Boolean);

    return {
      status: 'success',
      fulfillmentType: 'delivery',
      enderecoAtual: merged,
      mensagem: `Endereço atualizado: ${partsPreenchidos.join(', ')}.`,
    };
  }

  private async executeDefinirFormaPagamento(
    args: z.infer<typeof DefinirFormaPagamentoSchema>,
    sessionContext?: AgentSessionContext,
  ) {
    const sessionId = typeof sessionContext?.sessionId === 'string' ? sessionContext.sessionId : null;
    if (!sessionId) return { status: 'error', code: 'NO_SESSION', message: 'Sessão não identificada.' };

    const method = this.normalizePaymentMethod(args.metodo);
    if (!method) {
      return { status: 'error', code: 'INVALID_METHOD', message: 'Forma de pagamento inválida. Use pix, credit_card, debit_card ou cash.' };
    }

    const payment: { method: string; changeFor: number | null; changeConfirmed?: boolean | null } = {
      method,
      changeFor: null,
      changeConfirmed: null,
    };

    if (method === PaymentMethod.cash) {
      if (args.semTroco === true) {
        payment.changeFor = 0;
        payment.changeConfirmed = true;
        this.logger.log(`[AI_DRAFT] change_for_set 0 (sem_troco) sessionId=${sessionId}`);
      } else if (typeof args.troco === 'number') {
        payment.changeFor = args.troco;
        this.logger.log(`[AI_DRAFT] change_for_set ${args.troco} sessionId=${sessionId}`);
      }
    }

    await this.conversationService.updateOrderDraft(sessionId, { payment });

    this.logger.log(`[AI_DRAFT] payment_set ${method} sessionId=${sessionId}`);

    const methodLabels: Record<string, string> = {
      cash: 'Dinheiro',
      pix: 'Pix',
      credit_card: 'Cartão de crédito',
      debit_card: 'Cartão de débito',
    };

    const needsChange = method === PaymentMethod.cash && payment.changeFor === null;
    return {
      status: 'success',
      metodo: method,
      methodLabel: methodLabels[method] ?? method,
      troco: payment.changeFor,
      mensagem: needsChange
        ? `Pagamento em dinheiro confirmado. Precisa de troco? Para quanto?`
        : `Forma de pagamento definida: ${methodLabels[method] ?? method}${payment.changeFor ? ` (troco para R$${payment.changeFor})` : payment.changeFor === 0 ? ' (sem troco)' : ''}.`,
    };
  }

  private async executeConsultarResumoPedido(sessionContext?: AgentSessionContext) {
    const sessionId = typeof sessionContext?.sessionId === 'string' ? sessionContext.sessionId : null;
    if (!sessionId) return { status: 'error', code: 'NO_SESSION', message: 'Sessão não identificada.' };

    const memory = await this.conversationService.getSessionAiMemory(sessionId);
    const draft = memory.orderDraft;

    const missingFields = validateOrderDraft(draft);
    const readyToConfirm = missingFields.length === 0 && draft.items.length > 0;

    // Atualizar missingFields e readyToConfirm no draft
    await this.conversationService.updateOrderDraft(sessionId, {
      missingFields,
      readyToConfirm,
    });

    this.logger.log(
      `[AI_DRAFT] missing_fields fields=[${missingFields.join(',')}] ready=${readyToConfirm} sessionId=${sessionId}`,
    );
    if (readyToConfirm) {
      this.logger.log(`[AI_DRAFT] ready_to_confirm true sessionId=${sessionId}`);
    }

    return {
      status: 'success',
      draft: {
        items: draft.items.map((i) => ({ nome: i.name ?? i.productName ?? i.productId, quantidade: i.quantity, preco: i.unitPrice })),
        cliente: draft.customerName,
        fulfillmentType: draft.fulfillmentType,
        endereco: draft.deliveryAddress,
        pagamento: draft.payment,
        taxaEntrega: draft.deliveryFee,
        subtotal: draft.subtotal,
        total: draft.total,
        agendadoPara: draft.scheduledFor,
      },
      missingFields,
      readyToConfirm,
      mensagem: readyToConfirm
        ? 'Pedido pronto para confirmação! Mostre o resumo ao cliente e peça confirmação.'
        : `Dados faltantes: ${missingFields.join(', ')}.`,
    };
  }
}
