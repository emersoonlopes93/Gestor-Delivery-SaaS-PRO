/**
 * DTOs do Onboarding Readiness Score.
 * Sem `any`, sem `unknown` sem narrowing.
 */

export type ReadinessStatus =
  | 'not_configured'
  | 'partially_configured'
  | 'almost_ready'
  | 'ready';

export interface ReadinessCheckDto {
  key: string;
  label: string;
  passed: boolean;
}

export interface ReadinessDimensionDto {
  key: string;
  label: string;
  /** Percentual atingido desta dimensão (0–100) */
  score: number;
  /** Peso desta dimensão no score geral (soma = 1.0) */
  weight: number;
  /** Passou no critério mínimo da dimensão */
  passed: boolean;
  /** Rota existente para corrigir */
  actionPath: string;
  checks: ReadinessCheckDto[];
}

export interface ReadinessScoreDto {
  /** Score geral 0–100 */
  score: number;
  status: ReadinessStatus;
  dimensions: ReadinessDimensionDto[];
  /** Chaves dos itens obrigatórios ainda não configurados */
  missingRequirements: string[];
  /** score >= 90 E missingRequirements.length === 0 */
  canActivate: boolean;
  calculatedAt: string;
}
