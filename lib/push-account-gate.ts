/** Strict final authorization for a claimed job. No successful fallback on errors. */
export async function dispatchAuthorizedPush(
 authorize: () => Promise<{data: unknown; error: unknown}>,
 send: () => Promise<void>,
): Promise<boolean> {
 const result = await authorize();
 if (result.error) throw new Error('Notification authorization unavailable');
 if (result.data === false) return false;
 if (result.data !== true) throw new Error('Invalid notification authorization');
 await send();
 return true;
}
