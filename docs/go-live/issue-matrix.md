# Matriz de achados — parcial

Esta matriz contém somente o achado que acionou a stop-rule. Ela não representa
a auditoria completa solicitada.

| ID | Domínio | Achado | Estado | Severidade | Risco | Evidência | Causa provável | PR | Dependência | Go-Live blocker |
|---|---|---|---|---|---|---|---|---|---|---|
| SEC-001 | Segurança / autenticação | Secrets JWT concretos estão em arquivo versionado e no histórico Git | CONFIRMADO | P0 | segurança | `.env.docker:14-16`; `git log --all -- .env.docker`; `docker-compose.prod.yml:17-24` | Configuração operacional foi commitada em vez de usar somente placeholders e secret manager | E0 emergencial | Responsável da VPS/secret manager; janela para invalidar sessões | Sim |

## Estado de produção

O uso dos mesmos valores no ambiente implantado está **BLOQUEADO POR AMBIENTE**:
o compose atual lê `.env`, e inspecionar a VPS ou o secret manager foi
expressamente proibido. Por segurança, os valores versionados devem ser tratados
como comprometidos até a rotação ser comprovada.
