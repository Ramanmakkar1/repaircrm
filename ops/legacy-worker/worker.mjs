export default {
  fetch(request, env) {
    if (env.MAINTENANCE === '1') return new Response('Repairs helper is moving to repairshelper.com. Please try again shortly.', {status:503,headers:{'Retry-After':'120','Cache-Control':'no-store'}});
    const url = new URL(request.url);
    // Re-issue API/webhook requests to the new HTTPS origin without losing method/body.
    url.protocol = 'https:';
    url.host = 'repairshelper.com';
    return Response.redirect(url.toString(), 307);
  },
  scheduled() {},
};
