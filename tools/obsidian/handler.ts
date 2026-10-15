export function createArchiveHandler(exportSnapshot: (token: string) => Promise<unknown>) {
  return async (request: Request): Promise<Response> => {
    const reply = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type':'application/json', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' } });
    if (request.method !== 'POST' || new URL(request.url).search) return reply(405, { error:'METHOD' });
    const token = request.headers.get('X-Workout-Archive-Token') ?? '';
    if (!/^[a-f0-9]{64}$/.test(token)) return reply(401, { error:'AUTH' });
    // No request payload or URL credentials accepted.
    if (request.body) {
      const reader = request.body.getReader();
      try { const part = await reader.read(); if (!part.done) { await reader.cancel(); return reply(400,{error:'BODY'}); } }
      finally { reader.releaseLock(); }
    }
    try {
      const result = await exportSnapshot(token);
      const text = JSON.stringify(result);
      if (new TextEncoder().encode(text).length > 20_000_000) return reply(413,{error:'CAPACITY'});
      return new Response(text,{headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    } catch { return reply(403,{error:'ARCHIVE_UNAVAILABLE'}); }
  };
}
