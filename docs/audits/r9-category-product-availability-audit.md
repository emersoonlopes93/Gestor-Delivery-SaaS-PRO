# R9 — disponibilidade de categorias e produtos

`TenantSettings.timezone` é a fonte canônica, com fallback `America/Sao_Paulo`.
R9 adiciona `ProductCategory.activeDays`: array vazio significa todos os dias; valores usam o enum canônico `CategoryActiveDay`.

O `AvailabilityService` centraliza estado da loja, publicação, produto e categoria. Storefront, preview, showcase e checkout usam essa decisão; ações em lote alteram somente `isActive` e não propagam mudanças aos filhos.
