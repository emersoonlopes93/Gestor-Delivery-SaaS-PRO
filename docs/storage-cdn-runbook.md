# Storage And CDN Runbook

## Politica

Storage local e proibido em producao. Use R2/S3 com CDN para midias publicas.

## Configuracao Obrigatoria

- `STORAGE_DRIVER=r2` ou provider S3 equivalente.
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` configurados.
- `R2_PUBLIC_BASE_URL` ou `MEDIA_CDN_BASE_URL` configurado.
- Bucket privado para escrita; publicacao por dominio/CDN controlado.
- Cache CDN definido para assets publicos.

## Validacao De Upload

1. Login tenant com permissao `catalog.update`.
2. Upload de imagem de produto.
3. Confirmar URL publica via CDN.
4. Abrir storefront e validar imagem renderizada.
5. Confirmar key com prefixo `tenants/{tenantId}/...`.

## Isolamento Multi-Tenant

- Midias de tenant devem usar prefixo por tenant.
- APIs de listagem/edicao consultam sempre tenant atual.
- Nunca aceitar key arbitraria fora do prefixo permitido.
- Midias privadas nao devem ser servidas por URL publica.

## LGPD E Retencao

- Excluir midia quando solicitada por tenant/usuario autorizado.
- Garantir que delete remova objeto remoto.
- Definir retencao para backups de midia conforme contrato.
- Registrar pedidos de exclusao e conclusao.

## Cache CDN

- Imagens versionadas/hash podem usar cache longo.
- Imagens substituiveis devem usar nova key a cada upload.
- Purge manual somente para incidente ou exposicao indevida.

## NO-GO

- `STORAGE_DRIVER=local` em producao.
- URL publica vazia.
- Bucket com listagem publica.
- Upload funcionando sem tenant isolation.
