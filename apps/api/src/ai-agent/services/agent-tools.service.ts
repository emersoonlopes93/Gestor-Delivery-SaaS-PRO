import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { OrdersService } from '../../orders/orders.service';
import { DeliveryRateService } from '../../delivery/delivery-rate.service';
import { AiToolDefinition } from '../interfaces/ai-provider.interface';
import { CreateOrderDTO } from '@gestor/types';

import { PrismaService } from '../../database/prisma.service';
import { StorefrontService } from '../../storefront/storefront.service';

@Injectable()
export class AgentToolsService {
  private readonly logger = new Logger('AgentToolsService');

  constructor(
    private readonly ordersService: OrdersService,
    private readonly deliveryRateService: DeliveryRateService,
    private readonly prisma: PrismaService,
    private readonly storefrontService: StorefrontService,
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
        description: 'Cria um pedido final no sistema. Só chame esta função quando o cliente confirmar todos os itens, endereço e forma de pagamento.',
        parameters: {
          type: 'object',
          properties: {
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
              properties: {
                street: { type: 'string' },
                number: { type: 'string' },
                neighborhood: { type: 'string' },
                city: { type: 'string' },
                state: { type: 'string' },
                zipCode: { type: 'string' },
              },
              required: ['street', 'number', 'neighborhood', 'city'],
            },
            formaPagamento: { type: 'string', enum: ['pix', 'credit_card', 'cash'] },
          },
          required: ['itens', 'endereco', 'formaPagamento'],
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
    ];
  }

  /**
   * Executa uma tool específica requisitada pelo LLM.
   */
  async executeTool(
    tenantId: string,
    toolName: string,
    args: Record<string, any>,
    sessionContext?: any,
  ): Promise<any> {
    this.logger.log(`Executing tool ${toolName} with args: ${JSON.stringify(args)}`);

    try {
      switch (toolName) {
        case 'consultar_cardapio':
          return await this.executeConsultarCardapio(tenantId, args);

        case 'consultar_taxa_entrega':
          return await this.executeConsultarTaxaEntrega(tenantId, args);

        case 'criar_pedido':
          return await this.executeCriarPedido(tenantId, args, sessionContext);

        case 'transferir_atendimento_humano':
          return { status: 'success', message: 'Transferência solicitada, aguardando operador humano.' };

        default:
          throw new Error(`Tool desconhecida: ${toolName}`);
      }
    } catch (error: any) {
      this.logger.error(`Error executing tool ${toolName}: ${error.message}`);
      return { status: 'error', message: error.message };
    }
  }

  private async executeConsultarCardapio(tenantId: string, args: any) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new Error('Loja não encontrada');

    const payload = await this.storefrontService.getStorefrontPayload(tenant.slug);
    
    // Simplificamos o retorno para não estourar os tokens do LLM
    let result = payload.categories.map((cat: any) => ({
      categoria: cat.name,
      produtos: cat.products.map((p: any) => ({
        id: p.id,
        nome: p.name,
        preco: Number(p.basePrice),
        descricao: p.description,
      })),
    }));

    if (args.categoria) {
      const search = args.categoria.toLowerCase();
      result = result.filter((c: any) => c.categoria.toLowerCase().includes(search));
    }

    if (args.busca) {
      const search = args.busca.toLowerCase();
      result.forEach((c: any) => {
        c.produtos = c.produtos.filter((p: any) => 
          p.nome.toLowerCase().includes(search) || 
          (p.descricao && p.descricao.toLowerCase().includes(search))
        );
      });
      // Remove categorias vazias após o filtro
      result = result.filter((c: any) => c.produtos.length > 0);
    }

    return result;
  }

  private async executeConsultarTaxaEntrega(tenantId: string, args: any) {
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
        this.logger.error(`Geocoding error: ${(err as any).message}`);
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

  private async executeCriarPedido(tenantId: string, args: any, sessionContext: any) {
    if (!sessionContext?.customerId) {
      return { status: 'error', message: 'Cliente não identificado no sistema. Necessário cadastro prévio.' };
    }

    try {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) throw new Error('Loja não encontrada');

      const orderDto: CreateOrderDTO = {
        idempotencyKey: Math.random().toString(36).substring(7),
        items: args.itens.map((i: any) => ({
          lineType: 'product',
          productId: i.productId,
          quantity: i.quantity,
          notes: i.notes,
        })),
        customerName: sessionContext?.customerName || 'Cliente WhatsApp',
        customerPhone: sessionContext?.customerPhone || '00000000000',
        fulfillmentType: 'delivery',
        deliveryAddress: args.endereco,
        payment: {
          method: args.formaPagamento,
        },
      };

      const order = await this.ordersService.createOrder(
        tenant.slug,
        orderDto,
      );

      return {
        status: 'success',
        orderId: order.id,
        orderNumber: order.orderNumber,
        totalAmount: Number(order.total),
        message: `Pedido #${order.orderNumber} criado com sucesso! O total é R$ ${order.total}.`,
      };
    } catch (error: any) {
      return { status: 'error', message: `Erro ao criar pedido: ${error.message}` };
    }
  }
}
