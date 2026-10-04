import { ApiError } from "../../lib/api-client";

export function food99VerificationErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Ainda não conseguimos confirmar a autorização. Tente novamente em instantes.";
  }

  switch (error.code) {
    case "AUTH_TOKEN_NOT_AVAILABLE":
      return "A 99Food ainda não disponibilizou a autorização desta loja. Conclua a autorização na 99Food e tente novamente.";
    case "AUTH_TOKEN_REFRESHED_WAIT_RETRY":
      return "A 99Food atualizou a autorização. Aguarde 30 segundos e verifique novamente.";
    case "APP_ID_INVALID":
    case "APP_SECRET_INVALID":
      return "A configuração da 99Food precisa de atenção. Consulte as informações para suporte.";
    case "TOKEN_REFRESH_FAILED":
    case "PROVIDER_SYSTEM_ERROR":
    case "PROVIDER_UNAVAILABLE":
      return "A 99Food não respondeu à confirmação agora. Tente novamente em instantes.";
    case "PROVIDER_PARAMETER_ERROR":
      return "A 99Food não aceitou os dados desta confirmação. Consulte as informações para suporte.";
    default:
      return "Ainda não conseguimos confirmar a autorização. Tente novamente em instantes.";
  }
}
