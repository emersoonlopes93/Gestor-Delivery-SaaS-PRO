# P7.3 - Editor Comercial Simples dos Cardápios Base

Este documento resume o fluxo operacional do SaaS Admin para editar Cardápios Base sem expor detalhes técnicos ao operador.

## 1. Como abrir um Cardápio Base

1. Acesse `Cardápios Base` no SaaS Admin.
2. Abra um cardápio existente.
3. Clique em `Editar cardápio`.
4. Se já existir uma versão em edição, ela continua automaticamente.
5. Se não existir, o sistema cria a edição por trás da interface.

## 2. Como editar produtos

Na aba `Produtos`, cada produto mostra:

* imagem ou placeholder;
* nome;
* descrição curta;
* preço;
* categoria;
* status;
* resumo dos complementos;
* ações rápidas.

Ações rápidas disponíveis:

* `Editar`;
* `Trocar imagem`;
* `Complementos`;
* `Duplicar`;
* `Excluir`;
* `Mover para cima`;
* `Mover para baixo`.

## 3. Como trocar a imagem de um produto

1. Clique em `Trocar imagem`.
2. Abra a `Galeria Base`.
3. Filtre ou pesquise a imagem desejada.
4. Selecione a miniatura.
5. Salve.

O produto passa a usar a imagem escolhida para a versão em edição.

## 4. Como adicionar complementos

1. Clique em `Complementos`.
2. Adicione um grupo.
3. Defina nome, descrição, tipo de seleção, mínimo, máximo e ordem.
4. Adicione os itens do grupo.
5. Defina nome, descrição, preço adicional, quantidade e status de cada item.
6. Salve.

O operador não precisa editar JSON nem entender `OptionGroup` ou `OptionItem`.

## 5. Como organizar produtos e complementos

* Use `Mover para cima` e `Mover para baixo` para ordenar produtos.
* Use as ações de ordem do editor de complementos para reorganizar grupos e itens.
* Não há necessidade de drag and drop para este fluxo.

## 6. Como publicar alterações

1. Revise a edição.
2. Clique em `Publicar alterações`.
3. Digite `PUBLICAR` na confirmação forte.
4. Confirme.

Mensagens importantes:

* `Alterações não publicadas` significa que existe uma edição pronta para revisão.
* `Descartar alterações` remove a edição atual.
* Imagem ausente não bloqueia a publicação.
* Produto sem nome, preço inválido ou complemento inválido bloqueiam a publicação.

Texto de orientação ao operador:

> Você está publicando alterações deste Cardápio Base. Novos lojistas que importarem este modelo receberão a nova versão. Lojistas que já importaram antes não serão alterados automaticamente.

## 7. Efeito sobre tenants existentes

* Editar um Cardápio Base não altera tenants que já importaram.
* Apenas novas importações recebem a versão publicada.
* O catálogo do tenant continua independente.
* Não existe sincronização automática.

## 8. O que não está coberto nesta fase

* meio a meio;
* combos avançados;
* sync automático;
* estoque de adicionais;
* editor paralelo;
* nova galeria;
* nova fonte da verdade.
