// Render's free tier spins the backend down after ~15 min idle, and a cold
// boot can outright refuse/drop connections for a while before the server
// is ready to accept them — not just respond slowly. Axios surfaces that as
// an error with no `.response` at all (nothing came back), which is exactly
// what distinguishes "the network/connection failed" from "the server
// answered with an error status" (4xx/5xx, which retrying won't fix).
//
// Used on the public WAEC results flow specifically because a visitor's
// very first request is the one most likely to hit a cold instance, and
// there's no in-app way to "warm it up" first — the alternative is the
// request just failing outright with no way for the app to show a friendly
// message, since nothing ever came back to catch.
export function isNetworkError(err: any): boolean {
  return !!err && !err.response;
}

export async function withRetry<T>(fn: () => Promise<T>, delaysMs: number[] = [3000, 6000, 10000]): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isNetworkError(err) || attempt >= delaysMs.length) throw err;
      await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
    }
  }
}
