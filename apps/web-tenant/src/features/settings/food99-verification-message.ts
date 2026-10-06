import { ApiError } from "../../lib/api-client";

export function food99VerificationErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Ainda não conseguimos confirmar a autorização. Tente novamente em instantes.";
  }

  switch (error.code) {
    case "AUTH_TOKEN_NOT_AVAILABLE":
      return "A 99Food ainda não disponibilizou a autorização desta loja. Conclua a autorização na 99Food e tente novamente.";
    case "AUTH_TOKEN_REFRESHED_WAIT_RETRY":
      return "A 99Food atualizou a autorização. Aguarde 2 minutos e verifique novamente.";
    case "APP_ID_INVALID":
    case "APP_SECRET_INVALID":
      return "A configuração da 99Food precisa de atenção. Consulte as informações para suporte.";
    case "TOKEN_REFRESH_FAILED":
    case "PROVIDER_SYSTEM_ERROR":
    case "PROVIDER_UNAVAILABLE":
      return "A 99Food não respondeu à confirmação agora. Tente novamente em instantes.";
    case "PROVIDER_PARAMETER_ERROR":
      return "A 99Food não aceitou os dados desta confirmação. Consulte as informações para suporte.";
    case "PROVIDER_AUTHORIZATION_REJECTED":
      return "A 99Food não concluiu a consulta dos estabelecimentos autorizados. As informações técnicas foram registradas para diagnóstico. Tente novamente mais tarde ou consulte as informações para suporte.";
    case "PROVIDER_AUTHORIZATION_UNAVAILABLE":
    case "INVALID_AUTHORIZED_SHOP_RESPONSE":
      return "A 99Food respondeu, mas não foi possível identificar a loja autorizada. Tente novamente em instantes ou consulte o suporte.";
    case "SHOP_ALREADY_BOUND":
      return "Esta loja já está vinculada a outra identificação. Consulte o suporte da 99Food para continuar.";
    case "AUTHORIZED_SHOP_SELECTION_REQUIRED":
      return "Encontramos mais de um estabelecimento autorizado. A confirmação segura do vínculo ainda depende da 99Food.";
    case "SHOP_BIND_NOT_CONFIRMED":
      return "A autorização foi encontrada, mas o vínculo do estabelecimento ainda precisa ser confirmado pela 99Food.";
    case "AUTHORIZED_SHOP_NOT_FOUND":
      return "Nenhum estabelecimento autorizado está disponível para concluir esta conexão.";
    default:
      return "Ainda não conseguimos confirmar a autorização. Tente novamente em instantes.";
  }
}
