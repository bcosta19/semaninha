const ALLOWED_HOSTS = new Set([
  "lastfm.freetls.fastly.net",
  "lastfm-img.freetls.fastly.net",
  "lastfm-img2.akamaized.net",
  "img2-ak.lst.fm",
  "img3-ak.lst.fm",
  "img4-ak.lst.fm",
  "img5-ak.lst.fm",
]);

export async function onRequestGet({ request }) {
  const requestUrl = new URL(request.url);
  const rawTarget = requestUrl.searchParams.get("url");

  if (!rawTarget) return new Response("Imagem ausente.", { status: 400 });

  let target;
  try {
    target = new URL(rawTarget);
  } catch {
    return new Response("Imagem inválida.", { status: 400 });
  }

  if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) {
    return new Response("Origem de imagem não permitida.", { status: 403 });
  }

  const imageResponse = await fetch(target, {
    headers: { "User-Agent": "semaninha/0.1 (Cloudflare Pages)" },
  });

  if (!imageResponse.ok) {
    return new Response("Imagem não encontrada.", { status: imageResponse.status });
  }

  const headers = new Headers(imageResponse.headers);
  headers.set("cache-control", "public, max-age=86400, immutable");
  headers.set("access-control-allow-origin", "*");
  return new Response(imageResponse.body, { status: 200, headers });
}
