// A copied sessionStorage must not create a second owner of a single-use refresh token.
// The browser releases the lock when the document is destroyed (including reload).
export async function claimSession(ownerId: string): Promise<(() => void) | null | undefined> {
  if (typeof navigator === 'undefined' || !navigator.locks) return undefined;
  return new Promise((resolve) => {
    void navigator.locks
      .request(`app-resto-session:${ownerId}`, { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve(null);
          return;
        }
        return new Promise<void>((release) => resolve(release));
      })
      .catch(() => resolve(undefined));
  });
}
