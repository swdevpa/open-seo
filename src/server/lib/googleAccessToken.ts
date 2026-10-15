import { getAuth } from "@/lib/auth";

const RETRY_DELAY_MS = 500;

/** Mint (and auto-refresh) a Google access token from a stored genericOAuth
 *  grant. Better Auth collapses every refresh failure (network blip, Google
 *  5xx, discovery fetch, invalid_grant) into one error and drops the cause, so
 *  retry once before callers surface a reconnect prompt for a healthy grant.
 *  Throws the last error; callers wrap it in their own token error. */
export async function mintGoogleAccessToken(input: {
  providerId: string;
  userId: string;
  accountId?: string;
}): Promise<string | undefined> {
  // Headerless call: getAccessToken trusts body.userId when no request
  // session is present. Works in every auth mode — self-hosted builds the same
  // Better Auth instance once BETTER_AUTH_SECRET is set.
  const mint = () =>
    getAuth().api.getAccessToken({
      body: {
        providerId: input.providerId,
        userId: input.userId,
        ...(input.accountId ? { accountId: input.accountId } : {}),
      },
    });
  const logFailure = (attempt: number, error: unknown) =>
    console.warn("google.token_mint_failed", {
      providerId: input.providerId,
      accountId: input.accountId,
      attempt,
      error: String(error),
    });

  try {
    return (await mint()).accessToken;
  } catch (error) {
    logFailure(1, error);
  }
  await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  try {
    return (await mint()).accessToken;
  } catch (error) {
    logFailure(2, error);
    throw error;
  }
}
