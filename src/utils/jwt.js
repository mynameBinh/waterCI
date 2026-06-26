/**
 * Decode a JWT token payload.
 * Hermes (và V8 hiện đại) đều hỗ trợ atob natively — không cần vòng lặp base64 thủ công.
 * @param {string} token
 * @returns {object|null}
 */
export function decodeJWT(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}
