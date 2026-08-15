const form = document.querySelector("#lookup-form");
const usernameInput = document.querySelector("#username");
const periodInput = document.querySelector("#period");
const focusInput = document.querySelector("#focus");
const gridInput = document.querySelector("#grid");
const statusMessage = document.querySelector("#status");
const submitButton = form.querySelector("button[type=submit]");
const emptyArt = document.querySelector("#empty-art");
const preview = document.querySelector("#preview");

let currentData = null;

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = usernameInput.value.trim();
  if (!username) return;

  setLoading(true);
  setStatus("buscando a sua seleção...", "");

  try {
    const params = new URLSearchParams({
      username,
      period: periodInput.value,
      focus: focusInput.value,
      grid: gridInput.value,
    });
    const response = await fetch(`/api/weekly?${params}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Não foi possível montar sua arte.");

    currentData = data;
    renderPreview(data);
    const primaryItems = data.focus === "artists" ? data.artists : data.albums;
    const primaryLabel = data.focus === "artists" ? "artistas" : "álbuns";
    setStatus(`${primaryItems.length} ${primaryLabel} em uma grade ${data.grid.size}×${data.grid.size}.`, "success");
  } catch (error) {
    setStatus(error.message || "Não foi possível consultar o Last.fm.", "");
  } finally {
    setLoading(false);
  }
});

function renderPreview(data) {
  const primaryItems = data.items || (data.focus === "artists" ? data.artists : data.albums);
  const gridSize = data.grid?.size || 5;
  const period = formatPeriod(data.period);

  preview.innerHTML = `
    <article class="grid-result" id="result-art">
      <div class="cover-grid" style="--grid-size: ${gridSize};">
        ${Array.from({ length: gridSize * gridSize }, (_, index) => gridTileMarkup(primaryItems[index], index)).join("")}
      </div>
      <div class="grid-caption">
        <span>@${escapeHtml(data.username)} · ${escapeHtml(period)}</span>
        <span>${gridSize}×${gridSize}</span>
      </div>
    </article>
    <div class="result-actions">
      <button class="download-button" id="download-button" type="button">baixar imagem ↓</button>
      <button class="new-search-button" id="new-search-button" type="button" aria-label="Fazer nova busca">↺</button>
    </div>
  `;

  emptyArt.hidden = true;
  preview.hidden = false;
  preview.querySelectorAll("img").forEach((image) => {
    image.addEventListener("error", () => {
      image.hidden = true;
      image.closest(".grid-tile, .cover")?.classList.add("cover-failed");
    });
  });
  preview.querySelector("#download-button").addEventListener("click", downloadImage);
  preview.querySelector("#new-search-button").addEventListener("click", resetSearch);

  const stage = document.querySelector("#card-stage");
  if (stage) {
    stage.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function gridTileMarkup(item, index) {
  const image = item?.image ? `<img src="${imageUrl(item.image)}" alt="${escapeAttribute(item.name)}" />` : "";
  const placeholder = item ? initials(item.name) : "—";
  return `
    <div class="grid-tile" title="${escapeAttribute(item?.name || `posição ${index + 1}`)}">
      ${image}<span class="grid-placeholder">${escapeHtml(placeholder)}</span>
    </div>
  `;
}

function primaryItemMarkup(item, focus) {
  const image = item.image ? `<img src="${imageUrl(item.image)}" alt="" />` : "";
  const secondary = focus === "artists" ? `${formatNumber(item.playcount)} plays` : item.artist;
  return `
    <div class="album-tile">
      <div class="cover">
        <span class="album-rank">0${item.rank}</span>
        ${image}<span class="cover-placeholder">${escapeHtml(initials(item.name))}</span>
      </div>
      <span class="album-name" title="${escapeAttribute(item.name)}">${escapeHtml(item.name)}</span>
      <span class="album-artist" title="${escapeAttribute(secondary)}">${escapeHtml(secondary)}</span>
    </div>
  `;
}

function emptyPrimaryMarkup(focus) {
  const label = focus === "artists" ? "artista" : "álbum";
  return [1, 2, 3].map((rank) => `
    <div class="album-tile">
      <div class="cover"><span class="album-rank">0${rank}</span><span class="cover-placeholder">—</span></div>
      <span class="album-name">sem ${label}</span>
      <span class="album-artist">sem scrobble</span>
    </div>
  `).join("");
}

function trackMarkup(track) {
  return `
    <div class="track-row">
      <span class="track-rank">0${track.rank}</span>
      <span class="track-info">
        <span class="track-name" title="${escapeAttribute(track.name)}">${escapeHtml(track.name)}</span>
        <span class="track-artist" title="${escapeAttribute(track.artist)}">/ ${escapeHtml(track.artist)}</span>
      </span>
      <span class="track-count">${formatNumber(track.playcount)}</span>
    </div>
  `;
}

function emptyTrackMarkup() {
  return `<div class="track-row"><span class="track-rank">—</span><span class="track-info"><span class="track-name">nenhuma faixa encontrada</span></span><span class="track-count">0</span></div>`;
}

async function downloadImage() {
  if (!currentData) return;
  const button = preview.querySelector("#download-button");
  button.disabled = true;
  button.textContent = "preparando imagem...";

  try {
    if (document.fonts?.ready) await document.fonts.ready;
    const canvas = await buildGridCanvas(currentData);
    const link = document.createElement("a");
    const gridSize = currentData.grid?.size || 5;
    link.download = `semaninha-${slugify(currentData.username)}-${gridSize}x${gridSize}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    button.textContent = "imagem baixada ✓";
  } catch (error) {
    console.error(error);
    button.textContent = "não foi possível baixar";
  } finally {
    setTimeout(() => {
      button.disabled = false;
      button.textContent = "baixar imagem ↓";
    }, 2200);
  }
}

async function buildGridCanvas(data) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext("2d");
  const gridSize = data.grid?.size || 5;
  const items = data.items || (data.focus === "artists" ? data.artists : data.albums) || [];
  const tileSize = canvas.width / gridSize;
  const fallbackColors = ["#ff735f", "#d8f36a", "#93aef9", "#393c47"];

  for (let index = 0; index < gridSize * gridSize; index += 1) {
    const item = items[index];
    const x = (index % gridSize) * tileSize;
    const y = Math.floor(index / gridSize) * tileSize;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, tileSize, tileSize);
    ctx.clip();
    const image = item?.image ? await loadImage(imageUrl(item.image)) : null;
    if (image) {
      drawCover(ctx, image, x, y, tileSize, tileSize);
    } else {
      ctx.fillStyle = fallbackColors[index % fallbackColors.length];
      ctx.fillRect(x, y, tileSize, tileSize);
      ctx.fillStyle = "rgba(17, 17, 17, .72)";
      ctx.font = `700 ${Math.max(22, tileSize * 0.2)}px 'Space Grotesk', sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(item ? initials(item.name) : "—", x + tileSize / 2, y + tileSize / 2);
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    }
    ctx.restore();
  }

  return canvas;
}

async function buildCanvas(data) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  const lime = "#d8f36a";
  const paper = "#f4f1e9";
  const muted = "rgba(244, 241, 233, .54)";

  ctx.fillStyle = "#14161a";
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(870, 190, 0, 870, 190, 460);
  glow.addColorStop(0, "rgba(255, 115, 95, .28)");
  glow.addColorStop(1, "rgba(255, 115, 95, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = lime;
  ctx.font = "500 22px 'DM Mono', monospace";
  ctx.fillText("semaninha / 01", 60, 67);
  ctx.fillStyle = lime;
  ctx.font = "500 48px 'Space Grotesk', sans-serif";
  ctx.fillText("✳", 965, 73);

  ctx.fillStyle = lime;
  ctx.font = "500 26px 'Space Grotesk', sans-serif";
  ctx.fillText(`${data.focus === "artists" ? "artistas" : "álbuns"},`, 60, 145);
  ctx.fillStyle = paper;
  ctx.font = "600 88px 'Space Grotesk', sans-serif";
  ctx.fillText(`@${truncate(data.username, 18)}`, 60, 225);
  ctx.fillStyle = muted;
  ctx.font = "400 18px 'DM Mono', monospace";
  ctx.fillText(formatPeriod(data.period), 60, 263);

  const primaryItems = (data.focus === "artists" ? data.artists : data.albums).slice(0, 3);
  const albumSize = 294;
  const albumGap = 30;
  const albumY = 315;
  for (let index = 0; index < 3; index += 1) {
    const item = primaryItems[index];
    const x = 60 + index * (albumSize + albumGap);
    ctx.save();
    roundedRect(ctx, x, albumY, albumSize, albumSize, 2);
    ctx.clip();
    const image = item?.image ? await loadImage(imageUrl(item.image)) : null;
    if (image) {
      drawCover(ctx, image, x, albumY, albumSize, albumSize);
    } else {
      ctx.fillStyle = index === 0 ? "#ff735f" : index === 1 ? lime : "#93aef9";
      ctx.fillRect(x, albumY, albumSize, albumSize);
      ctx.fillStyle = "rgba(17, 17, 17, .72)";
      ctx.font = "700 46px 'Space Grotesk', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(item ? initials(item.name) : "—", x + albumSize / 2, albumY + albumSize / 2);
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    }
    ctx.restore();
    ctx.fillStyle = paper;
    ctx.font = "500 17px 'DM Mono', monospace";
    ctx.fillText(`0${item?.rank || index + 1}`, x + 13, albumY + 30);
    if (item) {
      ctx.fillStyle = paper;
      ctx.font = "600 22px 'Space Grotesk', sans-serif";
      ctx.fillText(truncate(item.name, 19), x, albumY + albumSize + 35);
      ctx.fillStyle = muted;
      ctx.font = "400 14px 'DM Mono', monospace";
      const secondary = data.focus === "artists" ? `${formatNumber(item.playcount)} plays` : item.artist;
      ctx.fillText(truncate(secondary, 24), x, albumY + albumSize + 59);
    }
  }

  const tracksY = 765;
  ctx.fillStyle = muted;
  ctx.font = "400 15px 'DM Mono', monospace";
  ctx.fillText("FAIXAS MAIS OUVIDAS", 60, tracksY);
  ctx.textAlign = "right";
  ctx.fillText("PLAYS", 1020, tracksY);
  ctx.textAlign = "start";
  ctx.strokeStyle = "rgba(244, 241, 233, .25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, tracksY + 18);
  ctx.lineTo(1020, tracksY + 18);
  ctx.stroke();

  data.tracks.slice(0, 5).forEach((track, index) => {
    const y = tracksY + 64 + index * 72;
    ctx.fillStyle = muted;
    ctx.font = "400 15px 'DM Mono', monospace";
    ctx.fillText(`0${track.rank}`, 60, y);
    ctx.fillStyle = paper;
    ctx.font = "600 22px 'Space Grotesk', sans-serif";
    ctx.fillText(truncate(track.name, 35), 115, y);
    ctx.fillStyle = muted;
    ctx.font = "400 14px 'DM Mono', monospace";
    ctx.fillText(`/ ${truncate(track.artist, 34)}`, 115, y + 25);
    ctx.textAlign = "right";
    ctx.fillText(formatNumber(track.playcount), 1020, y);
    ctx.textAlign = "start";
    ctx.strokeStyle = "rgba(244, 241, 233, .11)";
    ctx.beginPath();
    ctx.moveTo(60, y + 38);
    ctx.lineTo(1020, y + 38);
    ctx.stroke();
  });

  ctx.fillStyle = "rgba(244, 241, 233, .42)";
  ctx.font = "400 14px 'DM Mono', monospace";
  ctx.fillText("OUVINDO VIA LAST.FM", 60, 1282);
  ctx.textAlign = "right";
  ctx.fillText("✳", 1020, 1282);
  ctx.textAlign = "start";
  return canvas;
}

function loadImage(source) {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

function drawCover(ctx, image, x, y, width, height) {
  const ratio = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * ratio;
  const drawHeight = image.height * ratio;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function resetSearch() {
  currentData = null;
  preview.hidden = true;
  preview.innerHTML = "";
  emptyArt.hidden = false;
  setStatus("", "");
  usernameInput.focus();
}

function setLoading(isLoading) {
  submitButton.disabled = isLoading;
  submitButton.querySelector("span").textContent = isLoading ? "buscando..." : "montar arte";
}

function setStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = `status ${type}`.trim();
}

function imageUrl(source) {
  return `/api/image?url=${encodeURIComponent(source)}`;
}

function formatPeriod(period) {
  if (period?.label) return period.label;
  if (!period?.from || !period?.to) return "últimos 7 dias";
  const format = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });
  return `${format.format(new Date(period.from * 1000)).replace(".", "")} — ${format.format(new Date(period.to * 1000)).replace(".", "")}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR").format(Number(value) || 0);
}

function initials(value) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "—";
}

function truncate(value, maxLength) {
  const text = String(value || "");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function slugify(value) {
  return String(value || "semana").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "semana";
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[character]));
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
