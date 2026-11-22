import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import { COMMUNITY_SESSION_KEY, setCommunitySessionStore } from "../app/community-client";

/**
 * Keeps the community sign-in token in the Android Keystore / iOS Keychain so
 * it survives app restarts. Only the session (username, token, expiry) is
 * stored; the password never leaves the sign-in form.
 *
 * The value is read once at start-up into memory because the shared account
 * code reads it synchronously. Writes go back to secure storage in order.
 */
export async function keepCommunitySessionInKeystore() {
  await SecureStorage.setKeyPrefix("twnc_");
  let cached: string | null = null;
  try {
    cached = await SecureStorage.getItem(COMMUNITY_SESSION_KEY);
  } catch (error) {
    // A restored backup cannot decrypt with this device's key: sign in again.
    console.warn("Stored community session could not be read", error);
    await SecureStorage.removeItem(COMMUNITY_SESSION_KEY).catch(() => {});
  }

  let pending = Promise.resolve();
  setCommunitySessionStore({
    read: () => cached,
    write: value => {
      cached = value;
      pending = pending
        .then(() => (value ? SecureStorage.setItem(COMMUNITY_SESSION_KEY, value) : SecureStorage.removeItem(COMMUNITY_SESSION_KEY)))
        .catch(error => console.warn("Community session could not be saved", error));
    },
  });
}
