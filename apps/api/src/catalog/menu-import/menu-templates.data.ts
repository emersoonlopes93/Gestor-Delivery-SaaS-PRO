/**
 * Dados estáticos dos templates de cardápio base.
 * Cada template define categorias e produtos para um segmento de negócio.
 * As searchTags são usadas para buscar imagens correspondentes na MediaLibrary.
 */

export interface ProductTemplate {
  name: string;
  shortDescription: string;
  basePrice: number;
  /** Tags para busca de imagem na system_gallery / tenant_library */
  searchTags: string[];
}

export interface CategoryTemplate {
  name: string;
  order: number;
  products: ProductTemplate[];
}

export interface MenuTemplate {
  id: string;
  name: string;
  description: string;
  /** Valor que pode estar em tenant.settings.businessCategory */
  businessSegment: string;
  /** Ícone emoji para exibição no frontend */
  emoji: string;
  categories: CategoryTemplate[];
}

// ─── Templates ────────────────────────────────────────────────────────────────

export const MENU_TEMPLATES: MenuTemplate[] = [
  // ── Pizzaria ────────────────────────────────────────────────────────────────
  {
    id: 'pizzaria',
    name: 'Pizzaria',
    description: 'Pizzas tradicionais, especiais, bebidas e sobremesas',
    businessSegment: 'pizzaria',
    emoji: '🍕',
    categories: [
      {
        name: 'Pizzas Tradicionais',
        order: 1,
        products: [
          {
            name: 'Pizza Margherita',
            shortDescription: 'Molho de tomate, mussarela e manjericão fresco',
            basePrice: 42.9,
            searchTags: ['pizza', 'margherita', 'tradicional'],
          },
          {
            name: 'Pizza Calabresa',
            shortDescription: 'Molho de tomate, calabresa fatiada e cebola',
            basePrice: 44.9,
            searchTags: ['pizza', 'calabresa', 'tradicional'],
          },
          {
            name: 'Pizza Portuguesa',
            shortDescription: 'Presunto, ovos, azeitona, cebola e mussarela',
            basePrice: 47.9,
            searchTags: ['pizza', 'portuguesa', 'tradicional'],
          },
        ],
      },
      {
        name: 'Pizzas Especiais',
        order: 2,
        products: [
          {
            name: 'Pizza Quatro Queijos',
            shortDescription: 'Mussarela, parmesão, catupiry e provolone',
            basePrice: 54.9,
            searchTags: ['pizza', 'quatro queijos', 'especial'],
          },
          {
            name: 'Pizza Frango com Catupiry',
            shortDescription: 'Frango desfiado, catupiry e milho verde',
            basePrice: 52.9,
            searchTags: ['pizza', 'frango', 'catupiry', 'especial'],
          },
        ],
      },
      {
        name: 'Bebidas',
        order: 3,
        products: [
          {
            name: 'Refrigerante Lata',
            shortDescription: 'Coca-Cola, Guaraná ou Sprite 350ml',
            basePrice: 6.0,
            searchTags: ['refrigerante', 'lata', 'bebida'],
          },
          {
            name: 'Refrigerante 2L',
            shortDescription: 'Garrafa 2 litros, várias marcas',
            basePrice: 14.0,
            searchTags: ['refrigerante', '2l', 'bebida', 'garrafa'],
          },
          {
            name: 'Suco Natural',
            shortDescription: 'Laranja, limão ou maracujá',
            basePrice: 10.0,
            searchTags: ['suco', 'natural', 'bebida'],
          },
        ],
      },
      {
        name: 'Sobremesas',
        order: 4,
        products: [
          {
            name: 'Pudim',
            shortDescription: 'Pudim de leite condensado com calda de caramelo',
            basePrice: 12.0,
            searchTags: ['pudim', 'sobremesa', 'doce'],
          },
          {
            name: 'Brownie',
            shortDescription: 'Brownie de chocolate com sorvete de creme',
            basePrice: 14.0,
            searchTags: ['brownie', 'chocolate', 'sobremesa'],
          },
        ],
      },
    ],
  },

  // ── Hamburgueria ────────────────────────────────────────────────────────────
  {
    id: 'hamburgueria',
    name: 'Hamburgueria',
    description: 'Hambúrgueres artesanais, combos, porções e bebidas',
    businessSegment: 'hamburgueria',
    emoji: '🍔',
    categories: [
      {
        name: 'Hambúrgueres',
        order: 1,
        products: [
          {
            name: 'X-Burger',
            shortDescription: 'Hambúrguer artesanal 180g, queijo, alface e tomate',
            basePrice: 28.9,
            searchTags: ['hamburguer', 'xburger', 'burger'],
          },
          {
            name: 'X-Salada',
            shortDescription: 'Hambúrguer 180g, queijo, alface, tomate e maionese',
            basePrice: 29.9,
            searchTags: ['hamburguer', 'xsalada', 'burger', 'salada'],
          },
          {
            name: 'X-Bacon',
            shortDescription: 'Hambúrguer 180g, bacon crocante, queijo e barbecue',
            basePrice: 34.9,
            searchTags: ['hamburguer', 'xbacon', 'bacon', 'burger'],
          },
          {
            name: 'X-Tudo',
            shortDescription: 'Hambúrguer duplo, bacon, ovo, queijo e todos os molhos',
            basePrice: 42.9,
            searchTags: ['hamburguer', 'xtudo', 'burger', 'especial'],
          },
        ],
      },
      {
        name: 'Combos',
        order: 2,
        products: [
          {
            name: 'Combo Individual',
            shortDescription: 'Hambúrguer + batata frita + refrigerante',
            basePrice: 39.9,
            searchTags: ['combo', 'hamburguer', 'batata', 'refrigerante'],
          },
          {
            name: 'Combo Duplo',
            shortDescription: '2 hambúrgueres + batata grande + 2 refrigerantes',
            basePrice: 72.9,
            searchTags: ['combo', 'duplo', 'hamburguer'],
          },
        ],
      },
      {
        name: 'Porções',
        order: 3,
        products: [
          {
            name: 'Batata Frita',
            shortDescription: 'Batata frita crocante com sal e ketchup',
            basePrice: 18.9,
            searchTags: ['batata', 'frita', 'porcao'],
          },
          {
            name: 'Onion Rings',
            shortDescription: 'Anéis de cebola empanados e crocantes',
            basePrice: 19.9,
            searchTags: ['onion rings', 'cebola', 'porcao'],
          },
          {
            name: 'Nuggets',
            shortDescription: '10 unidades de frango empanado crocante',
            basePrice: 22.9,
            searchTags: ['nuggets', 'frango', 'porcao'],
          },
        ],
      },
      {
        name: 'Bebidas',
        order: 4,
        products: [
          {
            name: 'Refrigerante Lata',
            shortDescription: 'Coca-Cola, Guaraná ou Sprite 350ml',
            basePrice: 6.0,
            searchTags: ['refrigerante', 'lata', 'bebida'],
          },
          {
            name: 'Milk Shake',
            shortDescription: 'Chocolate, morango ou baunilha 400ml',
            basePrice: 18.9,
            searchTags: ['milkshake', 'milk shake', 'shake', 'bebida'],
          },
        ],
      },
    ],
  },

  // ── Restaurante ─────────────────────────────────────────────────────────────
  {
    id: 'restaurante',
    name: 'Restaurante',
    description: 'Pratos executivos, massas, bebidas e sobremesas',
    businessSegment: 'restaurante',
    emoji: '🍽️',
    categories: [
      {
        name: 'Pratos Executivos',
        order: 1,
        products: [
          {
            name: 'Prato Executivo de Frango',
            shortDescription: 'Frango grelhado, arroz, feijão, salada e farofa',
            basePrice: 29.9,
            searchTags: ['prato', 'frango', 'executivo', 'almoco'],
          },
          {
            name: 'Prato Executivo de Carne',
            shortDescription: 'Filé bovino, arroz, feijão, salada e farofa',
            basePrice: 34.9,
            searchTags: ['prato', 'carne', 'executivo', 'bife'],
          },
          {
            name: 'Prato Executivo de Peixe',
            shortDescription: 'Peixe grelhado, arroz, feijão e salada',
            basePrice: 32.9,
            searchTags: ['prato', 'peixe', 'executivo', 'grelhado'],
          },
        ],
      },
      {
        name: 'Massas',
        order: 2,
        products: [
          {
            name: 'Lasanha',
            shortDescription: 'Lasanha de carne ao molho bolonhesa gratinada',
            basePrice: 34.9,
            searchTags: ['lasanha', 'massa', 'italiana'],
          },
          {
            name: 'Macarrão à Bolonhesa',
            shortDescription: 'Espaguete com molho bolonhesa caseiro',
            basePrice: 29.9,
            searchTags: ['macarrao', 'bolonhesa', 'espaguete', 'massa'],
          },
          {
            name: 'Nhoque ao Sugo',
            shortDescription: 'Nhoque de batata ao molho de tomate fresco',
            basePrice: 28.9,
            searchTags: ['nhoque', 'sugo', 'massa', 'italiana'],
          },
        ],
      },
      {
        name: 'Bebidas',
        order: 3,
        products: [
          {
            name: 'Refrigerante',
            shortDescription: 'Lata 350ml, várias marcas',
            basePrice: 6.0,
            searchTags: ['refrigerante', 'lata', 'bebida'],
          },
          {
            name: 'Suco Natural',
            shortDescription: 'Laranja, limão ou maracujá 300ml',
            basePrice: 10.0,
            searchTags: ['suco', 'natural', 'bebida', 'fruta'],
          },
          {
            name: 'Água Mineral',
            shortDescription: 'Garrafa 500ml com ou sem gás',
            basePrice: 4.0,
            searchTags: ['agua', 'mineral', 'bebida'],
          },
        ],
      },
      {
        name: 'Sobremesas',
        order: 4,
        products: [
          {
            name: 'Pudim',
            shortDescription: 'Pudim de leite condensado tradicional',
            basePrice: 12.0,
            searchTags: ['pudim', 'sobremesa', 'doce'],
          },
          {
            name: 'Mousse de Chocolate',
            shortDescription: 'Mousse cremoso de chocolate meio amargo',
            basePrice: 14.0,
            searchTags: ['mousse', 'chocolate', 'sobremesa'],
          },
        ],
      },
    ],
  },

  // ── Mercado ─────────────────────────────────────────────────────────────────
  {
    id: 'mercado',
    name: 'Mercado',
    description: 'Bebidas, mercearia, higiene e limpeza',
    businessSegment: 'mercado',
    emoji: '🛒',
    categories: [
      {
        name: 'Bebidas',
        order: 1,
        products: [
          {
            name: 'Água Mineral 500ml',
            shortDescription: 'Água mineral natural sem gás',
            basePrice: 3.0,
            searchTags: ['agua', 'mineral', 'garrafa', 'bebida'],
          },
          {
            name: 'Refrigerante 2L',
            shortDescription: 'Garrafa 2 litros, várias marcas',
            basePrice: 11.9,
            searchTags: ['refrigerante', '2l', 'garrafa', 'bebida'],
          },
          {
            name: 'Suco de Caixinha',
            shortDescription: 'Del Valle ou Ades 200ml',
            basePrice: 4.5,
            searchTags: ['suco', 'caixinha', 'bebida', 'fruta'],
          },
        ],
      },
      {
        name: 'Mercearia',
        order: 2,
        products: [
          {
            name: 'Arroz',
            shortDescription: 'Arroz branco tipo 1 kg 5kg',
            basePrice: 22.9,
            searchTags: ['arroz', 'mercearia', 'graos'],
          },
          {
            name: 'Feijão Carioca',
            shortDescription: 'Feijão carioca 1kg',
            basePrice: 8.9,
            searchTags: ['feijao', 'mercearia', 'graos'],
          },
          {
            name: 'Macarrão',
            shortDescription: 'Espaguete 500g',
            basePrice: 5.9,
            searchTags: ['macarrao', 'espaguete', 'mercearia', 'massa'],
          },
          {
            name: 'Óleo de Soja',
            shortDescription: 'Óleo de soja 900ml',
            basePrice: 8.5,
            searchTags: ['oleo', 'soja', 'mercearia', 'cozinha'],
          },
        ],
      },
      {
        name: 'Higiene',
        order: 3,
        products: [
          {
            name: 'Papel Higiênico',
            shortDescription: 'Pacote com 12 rolos folha dupla',
            basePrice: 19.9,
            searchTags: ['papel higienico', 'higiene', 'banheiro'],
          },
          {
            name: 'Sabonete',
            shortDescription: 'Sabonete em barra 90g',
            basePrice: 3.5,
            searchTags: ['sabonete', 'higiene', 'banho'],
          },
          {
            name: 'Shampoo',
            shortDescription: 'Shampoo 400ml, várias fragrâncias',
            basePrice: 14.9,
            searchTags: ['shampoo', 'higiene', 'cabelo'],
          },
        ],
      },
      {
        name: 'Limpeza',
        order: 4,
        products: [
          {
            name: 'Detergente',
            shortDescription: 'Detergente líquido 500ml',
            basePrice: 4.9,
            searchTags: ['detergente', 'limpeza', 'cozinha'],
          },
          {
            name: 'Desinfetante',
            shortDescription: 'Desinfetante 500ml pinho ou lavanda',
            basePrice: 6.9,
            searchTags: ['desinfetante', 'limpeza', 'pinho'],
          },
          {
            name: 'Esponja de Louça',
            shortDescription: 'Esponja dupla face, pacote com 3',
            basePrice: 5.9,
            searchTags: ['esponja', 'louça', 'limpeza'],
          },
        ],
      },
    ],
  },
];

/**
 * Retorna todos os templates disponíveis (sem produtos detalhados, apenas metadados).
 */
export function listTemplatesSummary() {
  return MENU_TEMPLATES.map(({ id, name, description, businessSegment, emoji, categories }) => ({
    id,
    name,
    description,
    businessSegment,
    emoji,
    totalCategories: categories.length,
    totalProducts: categories.reduce((sum, c) => sum + c.products.length, 0),
  }));
}

/**
 * Retorna template completo por ID.
 */
export function getTemplateById(id: string): MenuTemplate | undefined {
  return MENU_TEMPLATES.find((t) => t.id === id);
}

/**
 * Retorna template pelo segmento do negócio (businessSegment).
 */
export function getTemplateBySegment(segment: string): MenuTemplate | undefined {
  const normalized = segment.toLowerCase().trim();
  return MENU_TEMPLATES.find((t) => t.businessSegment === normalized);
}
