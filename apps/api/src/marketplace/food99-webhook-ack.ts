/**
 * Official 99Food acknowledgement for callbacks that were durably accepted.
 * Keep this envelope provider-specific: it is not the generic marketplace API
 * response and must not be returned before signature validation/inbox handling.
 */
export const FOOD99_WEBHOOK_SUCCESS_ACK = Object.freeze({
  errno: 0,
  errmsg: 'ok',
});
