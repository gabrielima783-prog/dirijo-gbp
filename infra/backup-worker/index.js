function authorized(request, token) {
  if (!token) return false;
  const supplied = request.headers.get('authorization') || '';
  const expected = `Bearer ${token}`;
  if (supplied.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= supplied.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}
export default {
  async fetch(request, env) {
    if (!authorized(request, env.BACKUP_TOKEN)) return new Response('Unauthorized', {status:401});
    const name = new URL(request.url).pathname.match(/^\/backups\/([a-zA-Z0-9_.-]{1,180})$/)?.[1];
    if (!name) return new Response('Not found', {status:404});
    if (request.method === 'PUT') {
      const length = Number(request.headers.get('content-length'));
      if (!Number.isFinite(length) || length <= 0 || length > 1024 * 1024 * 1024) return new Response('Invalid length', {status:413});
      await env.BACKUPS.put(name, request.body, {httpMetadata:{contentType:'application/octet-stream'}});
      const stored = await env.BACKUPS.head(name);
      if (!stored || stored.size !== length) return new Response('Size mismatch', {status:500});
      return Response.json({stored:true, bytes:stored.size});
    }
    if (request.method === 'GET') {
      const object = await env.BACKUPS.get(name);
      if (!object) return new Response('Not found', {status:404});
      return new Response(object.body,{headers:{'content-type':'application/octet-stream','cache-control':'no-store'}});
    }
    return new Response('Method not allowed', {status:405});
  },
  async scheduled(_event, env) {
    const cutoff = Date.now() - 30 * 86400000;
    let cursor;
    do {
      const page = await env.BACKUPS.list({cursor});
      const expired = page.objects.filter(x => x.uploaded.getTime() < cutoff).map(x=>x.key);
      if (expired.length) await env.BACKUPS.delete(expired);
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  }
};
