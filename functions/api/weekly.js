const LASTFM_ENDPOINT = "https://ws.audioscrobbler.com/2.0/";
const USERNAME_PATTERN = /^[a-zA-Z0-9_\-\.]{1,64}$/;

export async function onRequestGet({ request, env }) {
  const requestUrl = new URL(request.url);
  const username = (requestUrl.searchParams.get("username") || "").trim();

  if (!USERNAME_PATTERN.test(username)) {
    return respond({ error: "Digite um usuário Last.fm válido." }, 400);
  }

  if (!env.LASTFM_API_KEY) {
    return respond(
      { error: "A chave da API do Last.fm ainda não foi configurada no servidor." },
      503,
    );
  }

  try {
    const [albumPayload, trackPayload] = await Promise.all([
      queryLastFm("user.getWeeklyAlbumChart", { user: username }, env.LASTFM_API_KEY),
      queryLastFm("user.getWeeklyTrackChart", { user: username }, env.LASTFM_API_KEY),
    ]);

    const albumChart = albumPayload.weeklyalbumchart || {};
    const trackChart = trackPayload.weeklytrackchart || {};
    const period = getPeriod(albumChart, trackChart);
    const albums = await addAlbumArtwork(
      toList(albumChart.album).slice(0, 5).map((album, index) => normalizeAlbum(album, index)),
      env.LASTFM_API_KEY,
    );

    return respond({
      username: getText(albumChart["@attr"]?.user) || getText(trackChart["@attr"]?.user) || username,
      period,
      albums,
      tracks: toList(trackChart.track).slice(0, 5).map((track, index) => normalizeTrack(track, index)),
      source: "Last.fm",
    });
  } catch (error) {
    const status = error.code === 6 ? 404 : 502;
    return respond({ error: error.message || "Não foi possível consultar o Last.fm." }, status);
  }
}

async function queryLastFm(method, parameters, apiKey) {
  const params = new URLSearchParams({
    method,
    api_key: apiKey,
    format: "json",
    ...parameters,
  });
  const response = await fetch(`${LASTFM_ENDPOINT}?${params}`, {
    headers: { "User-Agent": "semaninha/0.1 (Cloudflare Pages)" },
  });
  const payload = await response.json();

  if (!response.ok || payload.error) {
    const code = Number(payload.error);
    const message = payload.message || "O Last.fm não conseguiu responder agora.";
    const error = new Error(code === 6 ? "Usuário Last.fm não encontrado." : message);
    error.code = code;
    throw error;
  }

  return payload;
}

async function addAlbumArtwork(albums, apiKey) {
  return Promise.all(albums.map(async (album) => {
    if (album.image || !album.artist || !album.name) return album;

    try {
      const payload = await queryLastFm("album.getInfo", {
        artist: album.artist,
        album: album.name,
        autocorrect: "1",
      }, apiKey);
      return { ...album, image: getImage(payload.album?.image) };
    } catch {
      return album;
    }
  }));
}

function getPeriod(albumChart, trackChart) {
  const attributes = albumChart["@attr"] || trackChart["@attr"] || {};
  return {
    from: Number(attributes.from) || null,
    to: Number(attributes.to) || null,
  };
}

function normalizeAlbum(album, index) {
  return {
    rank: getRank(album, index),
    name: getText(album.name) || "Álbum sem nome",
    artist: getText(album.artist?.name || album.artist) || "Artista desconhecido",
    playcount: getNumber(album.playcount),
    image: getImage(album.image),
  };
}

function normalizeTrack(track, index) {
  return {
    rank: getRank(track, index),
    name: getText(track.name) || "Faixa sem nome",
    artist: getText(track.artist?.name || track.artist) || "Artista desconhecido",
    playcount: getNumber(track.playcount),
    image: getImage(track.image),
  };
}

function toList(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function getRank(item, index) {
  return Number(item["@attr"]?.rank || item.rank || index + 1) || index + 1;
}

function getNumber(value) {
  return Number(getText(value)) || 0;
}

function getText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return value["#text"] || value.name || "";
  return String(value);
}

function getImage(images) {
  const list = toList(images);
  const preferred = ["extralarge", "large", "medium", "small"];
  for (const size of preferred) {
    const image = list.find((candidate) => candidate?.size === size);
    const value = getText(image);
    if (value) return value.replace(/^http:\/\//i, "https://");
  }
  return "";
}

function respond(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": status === 200 ? "public, max-age=300" : "no-store",
      "access-control-allow-origin": "*",
    },
  });
}
