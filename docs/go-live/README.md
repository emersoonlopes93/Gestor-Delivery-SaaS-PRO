# Go-Live 1.0

Estado atualizado: E0 está **MITIGADA**. E0-OPS (redeploy, revogação global e
smokes), E0H (purga histórica) e a classificação de `DB_PASSWORD` continuam
pendentes e bloqueiam o Go-Live definitivo, mas não a continuidade documental R0.

Consulte também [escopo](./release-scope-v1.md), [roadmap](./pr-roadmap.md) e
[checklist](./acceptance-checklist.md).

Status em 2026-07-31: **BLOQUEADO**.

A auditoria R0 foi interrompida pela regra de parada definida no briefing após a
confirmação de credenciais JWT concretas em um arquivo versionado. Consulte:

- [Auditoria de prontidão](./readiness-audit-2026-07-31.md)
- [Matriz parcial de achados](./issue-matrix.md)

Os documentos de escopo do release, roadmap R1-R10 e checklist de aceitação não
foram produzidos porque continuar a auditoria após um P0 de segurança contrariaria
a stop-rule. Eles devem ser retomados em uma nova execução, depois da contenção e
da evidência de rotação.
