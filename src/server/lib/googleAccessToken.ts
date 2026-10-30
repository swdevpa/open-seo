import { getGoogleAccessToken } from "@/server/features/google/googleOAuth";

const RETRY_DELAY_MS = 500;

/** Mint (and auto-refresh) a Google access token from a stored grant, retrying
 *  once. A refresh can fail transiently (network blip, Google 5xx), so retry
 *  before callers surface a reconnect prompt for a healthy grant. Throws the
 *  last error; callers wrap it in their own token error. */
export async function mintGoogleAccessToken(input: {
  providerId: string;
  userId: string;
  accountId?: string;
}): Promise<string> {
  const logFailure = (attempt: number, error: unknown) =>
    console.warn("google.token_mint_failed", {
      providerId: input.providerId,
      accountId: input.accountId,
      attempt,
      error: String(error),
    });

  try {
    return await getGoogleAccessToken(input);
  } catch (error) {
    logFailure(1, error);
  }
  await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  try {
    return await getGoogleAccessToken(input);
  } catch (error) {
    logFailure(2, error);
    throw error;
  }
}
