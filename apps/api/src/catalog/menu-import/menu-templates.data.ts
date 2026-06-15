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
  /** Chave específica para busca de imagem na Biblioteca Global */
  mediaLookupKey?: string;
  /** Categoria sugerida para assets globais gerados automaticamente */
  mediaCategory?: string;
  /** Prompt base para geracao de imagem comercial generica */
  mediaPrompt?: string;
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
  /** Valores alternativos para recomendacao automatica */
  businessSegments?: string[];
  /** Ícone emoji para exibição no frontend */
  emoji: string;
  categories: CategoryTemplate[];
}

// ─── Templates ────────────────────────────────────────────────────────────────

function commercialFoodPrompt(subject: string): string {
  return `Foto comercial realista de ${subject}, apresentacao limpa e apetitosa, iluminacao profissional, foco no produto, fundo neutro ou levemente comercial, sem texto visivel, sem logotipos, sem marcas, sem pessoas, sem embalagens com marca, estilo de fotografia gastronomica para cardapio de delivery.`;
}

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
            mediaLookupKey: 'pizza-margherita',
          },
          {
            name: 'Pizza Calabresa',
            shortDescription: 'Molho de tomate, calabresa fatiada e cebola',
            basePrice: 44.9,
            searchTags: ['pizza', 'calabresa', 'tradicional'],
            mediaLookupKey: 'pizza-calabresa',
          },
          {
            name: 'Pizza Portuguesa',
            shortDescription: 'Presunto, ovos, azeitona, cebola e mussarela',
            basePrice: 47.9,
            searchTags: ['pizza', 'portuguesa', 'tradicional'],
            mediaLookupKey: 'pizza-portuguesa',
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
            mediaLookupKey: 'refrigerante-lata',
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
            mediaLookupKey: 'x-burger',
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
            mediaLookupKey: 'x-bacon',
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
  {
    id: 'acai',
    name: 'Açaí',
    description: 'Açaís tradicionais, especiais, complementos, cremes e bebidas',
    businessSegment: 'acai',
    emoji: '🍧',
    categories: [
      {
        name: 'Açaís Tradicionais',
        order: 1,
        products: [
          {
            name: 'Açaí 300ml',
            shortDescription: 'Açaí cremoso servido em copo de 300ml',
            basePrice: 16.9,
            searchTags: ['tag:acai', 'tag:sobremesa', 'tag:frio'],
            mediaLookupKey: 'lookup:acai_300ml',
            mediaCategory: 'Açaí',
            mediaPrompt: commercialFoodPrompt('um acai de 300ml servido em copo transparente, textura cremosa e cobertura simples'),
          },
          {
            name: 'Açaí 500ml',
            shortDescription: 'Açaí cremoso servido em copo de 500ml',
            basePrice: 22.9,
            searchTags: ['tag:acai', 'tag:sobremesa', 'tag:frio'],
            mediaLookupKey: 'lookup:acai_500ml',
            mediaCategory: 'Açaí',
            mediaPrompt: commercialFoodPrompt('um acai de 500ml servido em copo transparente, textura cremosa e cobertura apetitosa'),
          },
          {
            name: 'Açaí 700ml',
            shortDescription: 'Açaí cremoso em porção grande de 700ml',
            basePrice: 29.9,
            searchTags: ['tag:acai', 'tag:sobremesa', 'tag:frio'],
            mediaLookupKey: 'lookup:acai_700ml',
            mediaCategory: 'Açaí',
            mediaPrompt: commercialFoodPrompt('um acai de 700ml servido em copo grande transparente, textura cremosa e visual premium'),
          },
        ],
      },
      {
        name: 'Açaís Especiais',
        order: 2,
        products: [
          {
            name: 'Açaí com Banana e Granola',
            shortDescription: 'Açaí cremoso com banana fatiada e granola crocante',
            basePrice: 24.9,
            searchTags: ['tag:acai', 'tag:sobremesa', 'tag:frio'],
            mediaLookupKey: 'lookup:acai_banana_granola',
            mediaCategory: 'Açaí',
            mediaPrompt: commercialFoodPrompt('um copo de acai com banana fatiada e granola crocante por cima'),
          },
          {
            name: 'Açaí com Leite Ninho',
            shortDescription: 'Açaí cremoso com leite em pó e leite condensado',
            basePrice: 25.9,
            searchTags: ['tag:acai', 'tag:sobremesa', 'tag:frio'],
            mediaLookupKey: 'lookup:acai_ninho',
            mediaCategory: 'Açaí',
            mediaPrompt: commercialFoodPrompt('um copo de acai coberto com leite em po, textura cremosa e visual de delivery premium'),
          },
          {
            name: 'Açaí com Morango',
            shortDescription: 'Açaí cremoso com morangos frescos fatiados',
            basePrice: 25.9,
            searchTags: ['tag:acai', 'tag:sobremesa', 'tag:frio'],
            mediaLookupKey: 'lookup:acai_morango',
            mediaCategory: 'Açaí',
            mediaPrompt: commercialFoodPrompt('um copo de acai com morangos frescos fatiados por cima'),
          },
          {
            name: 'Açaí com Paçoca',
            shortDescription: 'Açaí cremoso com paçoca esfarelada',
            basePrice: 24.9,
            searchTags: ['tag:acai', 'tag:sobremesa', 'tag:frio'],
            mediaLookupKey: 'lookup:acai_pacoca',
            mediaCategory: 'Açaí',
            mediaPrompt: commercialFoodPrompt('um copo de acai com pacoca esfarelada e acabamento apetitoso'),
          },
          {
            name: 'Açaí Completo',
            shortDescription: 'Açaí com banana, morango, granola, leite em pó e leite condensado',
            basePrice: 32.9,
            searchTags: ['tag:acai', 'tag:sobremesa', 'tag:frio'],
            mediaLookupKey: 'lookup:acai_completo',
            mediaCategory: 'Açaí',
            mediaPrompt: commercialFoodPrompt('um acai completo em copo transparente com banana, morango, granola, leite em po e leite condensado'),
          },
        ],
      },
      {
        name: 'Complementos',
        order: 3,
        products: [
          {
            name: 'Granola',
            shortDescription: 'Porção extra de granola crocante',
            basePrice: 3.5,
            searchTags: ['tag:acai', 'tag:complemento'],
            mediaLookupKey: 'lookup:granola',
            mediaCategory: 'Complementos',
            mediaPrompt: commercialFoodPrompt('uma porcao de granola crocante em pote pequeno para acompanhamento'),
          },
          {
            name: 'Leite Condensado',
            shortDescription: 'Porção extra de leite condensado',
            basePrice: 3.5,
            searchTags: ['tag:acai', 'tag:complemento', 'tag:doce'],
            mediaLookupKey: 'lookup:leite_condensado',
            mediaCategory: 'Complementos',
            mediaPrompt: commercialFoodPrompt('uma porcao de leite condensado cremoso em pote pequeno para acompanhamento'),
          },
          {
            name: 'Leite em Pó',
            shortDescription: 'Porção extra de leite em pó',
            basePrice: 3.5,
            searchTags: ['tag:acai', 'tag:complemento', 'tag:doce'],
            mediaLookupKey: 'lookup:leite_em_po',
            mediaCategory: 'Complementos',
            mediaPrompt: commercialFoodPrompt('uma porcao de leite em po em pote pequeno para acompanhamento de sobremesa'),
          },
          {
            name: 'Paçoca',
            shortDescription: 'Porção extra de paçoca esfarelada',
            basePrice: 3.5,
            searchTags: ['tag:acai', 'tag:complemento', 'tag:doce'],
            mediaLookupKey: 'lookup:pacoca',
            mediaCategory: 'Complementos',
            mediaPrompt: commercialFoodPrompt('uma porcao de pacoca esfarelada em pote pequeno para acompanhamento'),
          },
          {
            name: 'Banana',
            shortDescription: 'Porção extra de banana fatiada',
            basePrice: 3.5,
            searchTags: ['tag:acai', 'tag:complemento', 'tag:fruta'],
            mediaLookupKey: 'lookup:banana',
            mediaCategory: 'Complementos',
            mediaPrompt: commercialFoodPrompt('uma porcao de banana fatiada em pote pequeno para acompanhamento'),
          },
          {
            name: 'Morango',
            shortDescription: 'Porção extra de morangos fatiados',
            basePrice: 4.5,
            searchTags: ['tag:acai', 'tag:complemento', 'tag:fruta'],
            mediaLookupKey: 'lookup:morango',
            mediaCategory: 'Complementos',
            mediaPrompt: commercialFoodPrompt('uma porcao de morangos frescos fatiados em pote pequeno para acompanhamento'),
          },
          {
            name: 'Nutella',
            shortDescription: 'Porção extra de creme de avelã',
            basePrice: 5.5,
            searchTags: ['tag:acai', 'tag:complemento', 'tag:doce'],
            mediaLookupKey: 'lookup:nutella',
            mediaCategory: 'Complementos',
            mediaPrompt: commercialFoodPrompt('uma porcao generica de creme de avela em pote pequeno, sem marca visivel'),
          },
        ],
      },
      {
        name: 'Cremes / Sorvetes',
        order: 4,
        products: [
          {
            name: 'Creme de Cupuaçu',
            shortDescription: 'Creme gelado de cupuaçu em porção individual',
            basePrice: 18.9,
            searchTags: ['tag:creme', 'tag:sobremesa', 'tag:frio'],
            mediaLookupKey: 'lookup:creme_cupuacu',
            mediaCategory: 'Açaí',
            mediaPrompt: commercialFoodPrompt('um creme de cupuacu servido em copo transparente, textura gelada e cremosa'),
          },
          {
            name: 'Creme de Ninho',
            shortDescription: 'Creme gelado de leite em pó em porção individual',
            basePrice: 18.9,
            searchTags: ['tag:creme', 'tag:sobremesa', 'tag:frio'],
            mediaLookupKey: 'lookup:creme_ninho',
            mediaCategory: 'Açaí',
            mediaPrompt: commercialFoodPrompt('um creme branco de leite em po servido em copo transparente, textura gelada e cremosa'),
          },
          {
            name: 'Sorvete de Creme',
            shortDescription: 'Sorvete de creme em porção individual',
            basePrice: 16.9,
            searchTags: ['tag:sorvete', 'tag:sobremesa', 'tag:frio'],
            mediaLookupKey: 'lookup:sorvete_creme',
            mediaCategory: 'Sobremesas',
            mediaPrompt: commercialFoodPrompt('uma porcao de sorvete de creme em pote individual, textura cremosa e visual apetitoso'),
          },
        ],
      },
      {
        name: 'Bebidas',
        order: 5,
        products: [
          {
            name: 'Água Mineral',
            shortDescription: 'Garrafa de água mineral 500ml com ou sem gás',
            basePrice: 4.0,
            searchTags: ['tag:bebida', 'tag:agua'],
            mediaLookupKey: 'lookup:acai_agua_mineral',
            mediaCategory: 'Bebidas',
            mediaPrompt: commercialFoodPrompt('uma garrafa generica de agua mineral sem marca visivel'),
          },
          {
            name: 'Refrigerante Lata',
            shortDescription: 'Refrigerante lata 350ml em sabores variados',
            basePrice: 6.0,
            searchTags: ['tag:bebida', 'tag:refrigerante'],
            mediaLookupKey: 'lookup:acai_refrigerante_lata',
            mediaCategory: 'Bebidas',
            mediaPrompt: commercialFoodPrompt('uma lata generica de refrigerante gelado sem marca, sem logotipo e sem texto'),
          },
          {
            name: 'Suco Natural',
            shortDescription: 'Suco natural em copo de 300ml',
            basePrice: 10.0,
            searchTags: ['tag:bebida', 'tag:suco'],
            mediaLookupKey: 'lookup:acai_suco_natural',
            mediaCategory: 'Bebidas',
            mediaPrompt: commercialFoodPrompt('um copo de suco natural fresco com visual limpo e comercial'),
          },
        ],
      },
    ],
  },
  {
    id: 'padaria-cafeteria',
    name: 'Padaria & Cafeteria',
    description: 'Pães, salgados, doces, cafés, bebidas e combos',
    businessSegment: 'padaria',
    businessSegments: ['padaria', 'cafeteria', 'padaria-cafeteria', 'padaria_cafeteria'],
    emoji: '☕',
    categories: [
      {
        name: 'Pães e Salgados',
        order: 1,
        products: [
          {
            name: 'Pão Francês',
            shortDescription: 'Unidade de pão francês fresco e crocante',
            basePrice: 1.2,
            searchTags: ['tag:padaria', 'tag:pao'],
            mediaLookupKey: 'lookup:pao_frances',
            mediaCategory: 'Padaria',
            mediaPrompt: commercialFoodPrompt('paes franceses frescos e dourados, casca crocante e miolo macio'),
          },
          {
            name: 'Pão de Queijo',
            shortDescription: 'Porção de pão de queijo dourado',
            basePrice: 8.9,
            searchTags: ['tag:padaria', 'tag:salgado', 'tag:lanche'],
            mediaLookupKey: 'lookup:pao_de_queijo',
            mediaCategory: 'Padaria',
            mediaPrompt: commercialFoodPrompt('uma porcao de pao de queijo dourado e apetitoso'),
          },
          {
            name: 'Misto Quente',
            shortDescription: 'Sanduíche quente de presunto e queijo',
            basePrice: 13.9,
            searchTags: ['tag:padaria', 'tag:lanche', 'tag:salgado'],
            mediaLookupKey: 'lookup:misto_quente',
            mediaCategory: 'Lanches',
            mediaPrompt: commercialFoodPrompt('um misto quente dourado com queijo derretido, cortado ao meio'),
          },
          {
            name: 'Croissant de Presunto e Queijo',
            shortDescription: 'Croissant recheado com presunto e queijo',
            basePrice: 15.9,
            searchTags: ['tag:padaria', 'tag:lanche', 'tag:salgado'],
            mediaLookupKey: 'lookup:croissant_presunto_queijo',
            mediaCategory: 'Padaria',
            mediaPrompt: commercialFoodPrompt('um croissant dourado recheado com presunto e queijo, apresentacao de cafeteria'),
          },
          {
            name: 'Coxinha',
            shortDescription: 'Coxinha de frango crocante',
            basePrice: 9.9,
            searchTags: ['tag:padaria', 'tag:salgado', 'tag:lanche'],
            mediaLookupKey: 'lookup:coxinha',
            mediaCategory: 'Salgados',
            mediaPrompt: commercialFoodPrompt('uma coxinha de frango dourada e crocante em apresentacao limpa'),
          },
          {
            name: 'Esfiha de Carne',
            shortDescription: 'Esfiha assada com recheio de carne temperada',
            basePrice: 8.9,
            searchTags: ['tag:padaria', 'tag:salgado', 'tag:lanche'],
            mediaLookupKey: 'lookup:esfiha_carne',
            mediaCategory: 'Salgados',
            mediaPrompt: commercialFoodPrompt('uma esfiha de carne assada, dourada e apetitosa'),
          },
          {
            name: 'Enroladinho de Salsicha',
            shortDescription: 'Salgado assado recheado com salsicha',
            basePrice: 8.9,
            searchTags: ['tag:padaria', 'tag:salgado', 'tag:lanche'],
            mediaLookupKey: 'lookup:enroladinho_salsicha',
            mediaCategory: 'Salgados',
            mediaPrompt: commercialFoodPrompt('um enroladinho de salsicha assado e dourado, estilo vitrine de padaria'),
          },
        ],
      },
      {
        name: 'Doces e Bolos',
        order: 2,
        products: [
          {
            name: 'Bolo de Cenoura',
            shortDescription: 'Fatia de bolo de cenoura com cobertura de chocolate',
            basePrice: 10.9,
            searchTags: ['tag:padaria', 'tag:doce', 'tag:bolo'],
            mediaLookupKey: 'lookup:bolo_cenoura',
            mediaCategory: 'Doces e Bolos',
            mediaPrompt: commercialFoodPrompt('uma fatia de bolo de cenoura com cobertura de chocolate brilhante'),
          },
          {
            name: 'Bolo de Chocolate',
            shortDescription: 'Fatia de bolo de chocolate úmido com cobertura',
            basePrice: 11.9,
            searchTags: ['tag:padaria', 'tag:doce', 'tag:bolo'],
            mediaLookupKey: 'lookup:bolo_chocolate',
            mediaCategory: 'Doces e Bolos',
            mediaPrompt: commercialFoodPrompt('uma fatia de bolo de chocolate com cobertura cremosa'),
          },
          {
            name: 'Sonho',
            shortDescription: 'Sonho recheado com creme e açúcar',
            basePrice: 9.9,
            searchTags: ['tag:padaria', 'tag:doce'],
            mediaLookupKey: 'lookup:sonho',
            mediaCategory: 'Doces e Bolos',
            mediaPrompt: commercialFoodPrompt('um sonho de padaria recheado com creme e finalizacao delicada de acucar'),
          },
          {
            name: 'Donut',
            shortDescription: 'Donut macio com cobertura doce',
            basePrice: 9.9,
            searchTags: ['tag:padaria', 'tag:doce'],
            mediaLookupKey: 'lookup:donut',
            mediaCategory: 'Doces e Bolos',
            mediaPrompt: commercialFoodPrompt('um donut macio com cobertura doce generica e sem texto'),
          },
          {
            name: 'Cookie',
            shortDescription: 'Cookie com gotas de chocolate',
            basePrice: 7.9,
            searchTags: ['tag:padaria', 'tag:doce'],
            mediaLookupKey: 'lookup:cookie',
            mediaCategory: 'Doces e Bolos',
            mediaPrompt: commercialFoodPrompt('cookies com gotas de chocolate em apresentacao comercial limpa'),
          },
          {
            name: 'Fatia de Torta',
            shortDescription: 'Fatia de torta doce do dia',
            basePrice: 13.9,
            searchTags: ['tag:padaria', 'tag:doce', 'tag:sobremesa'],
            mediaLookupKey: 'lookup:fatia_torta',
            mediaCategory: 'Doces e Bolos',
            mediaPrompt: commercialFoodPrompt('uma fatia de torta doce com acabamento premium de confeitaria'),
          },
        ],
      },
      {
        name: 'Cafés',
        order: 3,
        products: [
          {
            name: 'Café Expresso',
            shortDescription: 'Café expresso curto servido na hora',
            basePrice: 5.9,
            searchTags: ['tag:cafe', 'tag:bebida', 'tag:padaria'],
            mediaLookupKey: 'lookup:cafe_expresso',
            mediaCategory: 'Cafés',
            mediaPrompt: commercialFoodPrompt('um cafe expresso servido em xicara pequena, visual elegante e apetitoso'),
          },
          {
            name: 'Café com Leite',
            shortDescription: 'Café com leite cremoso em copo médio',
            basePrice: 7.9,
            searchTags: ['tag:cafe', 'tag:bebida', 'tag:padaria'],
            mediaLookupKey: 'lookup:cafe_com_leite',
            mediaCategory: 'Cafés',
            mediaPrompt: commercialFoodPrompt('um cafe com leite cremoso servido em xicara ou copo de cafeteria'),
          },
          {
            name: 'Capuccino',
            shortDescription: 'Capuccino cremoso com espuma de leite',
            basePrice: 10.9,
            searchTags: ['tag:cafe', 'tag:bebida', 'tag:padaria'],
            mediaLookupKey: 'lookup:capuccino',
            mediaCategory: 'Cafés',
            mediaPrompt: commercialFoodPrompt('um capuccino cremoso com espuma de leite em xicara de cafeteria'),
          },
          {
            name: 'Chocolate Quente',
            shortDescription: 'Chocolate quente cremoso servido em copo médio',
            basePrice: 10.9,
            searchTags: ['tag:cafe', 'tag:bebida', 'tag:doce'],
            mediaLookupKey: 'lookup:chocolate_quente',
            mediaCategory: 'Cafés',
            mediaPrompt: commercialFoodPrompt('um chocolate quente cremoso servido em xicara, visual aconchegante e comercial'),
          },
        ],
      },
      {
        name: 'Bebidas',
        order: 4,
        products: [
          {
            name: 'Suco de Laranja',
            shortDescription: 'Suco de laranja natural em copo de 300ml',
            basePrice: 9.9,
            searchTags: ['tag:bebida', 'tag:suco', 'tag:padaria'],
            mediaLookupKey: 'lookup:suco_laranja',
            mediaCategory: 'Bebidas',
            mediaPrompt: commercialFoodPrompt('um copo de suco de laranja natural fresco'),
          },
          {
            name: 'Refrigerante Lata',
            shortDescription: 'Refrigerante lata 350ml em sabores variados',
            basePrice: 6.0,
            searchTags: ['tag:bebida', 'tag:refrigerante'],
            mediaLookupKey: 'lookup:padaria_refrigerante_lata',
            mediaCategory: 'Bebidas',
            mediaPrompt: commercialFoodPrompt('uma lata generica de refrigerante gelado sem marca, sem logotipo e sem texto'),
          },
          {
            name: 'Água Mineral',
            shortDescription: 'Garrafa de água mineral 500ml com ou sem gás',
            basePrice: 4.0,
            searchTags: ['tag:bebida', 'tag:agua'],
            mediaLookupKey: 'lookup:padaria_agua_mineral',
            mediaCategory: 'Bebidas',
            mediaPrompt: commercialFoodPrompt('uma garrafa generica de agua mineral sem marca visivel'),
          },
        ],
      },
      {
        name: 'Combos',
        order: 5,
        products: [
          {
            name: 'Café da Manhã Simples',
            shortDescription: 'Café com leite, pão francês e manteiga',
            basePrice: 14.9,
            searchTags: ['tag:cafe', 'tag:padaria', 'tag:combo'],
            mediaLookupKey: 'lookup:cafe_manha_simples',
            mediaCategory: 'Combos',
            mediaPrompt: commercialFoodPrompt('um combo simples de cafe da manha com cafe com leite, pao frances e manteiga'),
          },
          {
            name: 'Combo Café + Pão de Queijo',
            shortDescription: 'Café expresso ou café com leite acompanhado de pão de queijo',
            basePrice: 13.9,
            searchTags: ['tag:cafe', 'tag:padaria', 'tag:combo'],
            mediaLookupKey: 'lookup:combo_cafe_pao_queijo',
            mediaCategory: 'Combos',
            mediaPrompt: commercialFoodPrompt('um combo de cafe com pao de queijo dourado em apresentacao de delivery'),
          },
          {
            name: 'Combo Café + Salgado',
            shortDescription: 'Café expresso ou café com leite acompanhado de salgado',
            basePrice: 15.9,
            searchTags: ['tag:cafe', 'tag:padaria', 'tag:combo', 'tag:salgado'],
            mediaLookupKey: 'lookup:combo_cafe_salgado',
            mediaCategory: 'Combos',
            mediaPrompt: commercialFoodPrompt('um combo de cafe com salgado assado ou frito em apresentacao comercial limpa'),
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
  return MENU_TEMPLATES.find((t) => {
    const segments = t.businessSegments ?? [t.businessSegment];
    return segments.includes(normalized);
  });
}
