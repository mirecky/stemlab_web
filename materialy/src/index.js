// Read-only prehliadač súborov nad R2 bucketom pre materialy.stemlab.sk.
// Worker nemá žiadnu cestu na zápis – nahráva sa iba cez R2 API (rclone) alebo dashboard.

export default {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }

    const url = new URL(request.url);
    let key;
    try {
      key = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    if (isHidden(key)) return notFound(env);

    if (key === "" || key.endsWith("/")) {
      return listing(env, key, request.method);
    }

    const object = await env.BUCKET.get(key, {
      range: request.headers,
      onlyIf: request.headers,
    });

    if (object === null) {
      // Zložka zadaná bez lomky na konci → presmerovať.
      const probe = await env.BUCKET.list({ prefix: key + "/", limit: 1 });
      if (probe.objects.length > 0 || probe.delimitedPrefixes.length > 0) {
        url.pathname += "/";
        return Response.redirect(url.toString(), 301);
      }
      return notFound(env);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("ETag", object.httpEtag);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "public, max-age=300");
    if (!headers.has("Content-Type")) headers.set("Content-Type", guessType(key));

    // onlyIf nesplnené (If-None-Match / If-Modified-Since) → telo chýba.
    if (!("body" in object)) {
      return new Response(null, { status: 304, headers });
    }

    let status = 200;
    if (object.range && request.headers.has("Range")) {
      const { offset, length } = resolveRange(object.range, object.size);
      headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
      headers.set("Content-Length", String(length));
      status = 206;
    } else {
      headers.set("Content-Length", String(object.size));
    }

    return new Response(request.method === "HEAD" ? null : object.body, { status, headers });
  },
};

function resolveRange(range, size) {
  if ("suffix" in range) {
    const length = Math.min(range.suffix, size);
    return { offset: size - length, length };
  }
  const offset = range.offset ?? 0;
  const length = range.length ?? size - offset;
  return { offset, length };
}

async function listing(env, prefix, method) {
  const folders = [];
  const files = [];
  let cursor;
  do {
    const page = await env.BUCKET.list({ prefix, delimiter: "/", cursor, include: ["httpMetadata"] });
    folders.push(...page.delimitedPrefixes);
    files.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  const visibleFolders = folders.filter((p) => !isHidden(p));
  const visibleFiles = files.filter((o) => o.key !== prefix && !isHidden(o.key));

  if (prefix !== "" && visibleFolders.length === 0 && visibleFiles.length === 0) {
    return notFound(env);
  }

  const collator = new Intl.Collator("sk", { numeric: true, sensitivity: "base" });
  visibleFolders.sort(collator.compare);
  visibleFiles.sort((a, b) => collator.compare(a.key, b.key));

  const title = env.SITE_TITLE || "Materiály";
  const html = page(title, prefix, renderBreadcrumbs(prefix) + renderTable(prefix, visibleFolders, visibleFiles));
  return new Response(method === "HEAD" ? null : html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=60",
    },
  });
}

function renderBreadcrumbs(prefix) {
  const parts = prefix.split("/").filter(Boolean);
  let href = "/";
  const crumbs = [`<a href="/">Materiály</a>`];
  for (const part of parts) {
    href += encodeURIComponent(part) + "/";
    crumbs.push(`<a href="${href}">${escapeHtml(part)}</a>`);
  }
  return `<nav class="crumbs">${crumbs.join('<span class="sep">/</span>')}</nav>`;
}

function renderTable(prefix, folders, files) {
  const rows = [];
  if (prefix !== "") {
    rows.push(`<tr><td colspan="3"><a class="up" href="../">← o úroveň vyššie</a></td></tr>`);
  }
  for (const folder of folders) {
    const name = folder.slice(prefix.length, -1);
    rows.push(
      `<tr><td><a class="item" href="${encodePath(name)}/"><span class="icon" aria-hidden="true">📁</span>${escapeHtml(name)}</a></td><td class="num">—</td><td class="num">—</td></tr>`,
    );
  }
  for (const file of files) {
    const name = file.key.slice(prefix.length);
    rows.push(
      `<tr><td><a class="item" href="${encodePath(name)}"><span class="icon" aria-hidden="true">${fileIcon(name)}</span>${escapeHtml(name)}</a></td>` +
        `<td class="num">${formatSize(file.size)}</td><td class="num">${formatDate(file.uploaded)}</td></tr>`,
    );
  }
  if (folders.length === 0 && files.length === 0) {
    rows.push(`<tr><td colspan="3" class="empty">Zatiaľ tu nič nie je.</td></tr>`);
  }
  return `<table>
<thead><tr><th>Názov</th><th class="num">Veľkosť</th><th class="num">Nahrané</th></tr></thead>
<tbody>${rows.join("\n")}</tbody>
</table>`;
}

function page(title, prefix, body) {
  const heading = prefix === "" ? title : prefix.slice(0, -1).split("/").pop();
  return `<!doctype html>
<html lang="sk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(heading)} · ${escapeHtml(title)}</title>
<style>
:root { --bg:#fafafa; --fg:#1d1d1f; --muted:#6b6b70; --line:#e3e3e6; --link:#0b63c5; --hover:#f0f3f8; }
@media (prefers-color-scheme: dark) {
  :root { --bg:#121214; --fg:#ececef; --muted:#9a9aa2; --line:#2a2a2f; --link:#6cb0ff; --hover:#1c1f26; }
}
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width: 960px; margin: 0 auto; padding: 24px 16px 48px; }
h1 { font-size: 1.5rem; margin: 0 0 4px; }
.crumbs { color: var(--muted); margin-bottom: 20px; word-break: break-word; }
.crumbs .sep { margin: 0 6px; }
a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-weight: 600; color: var(--muted); font-size: .85rem; border-bottom: 1px solid var(--line); padding: 8px; }
td { border-bottom: 1px solid var(--line); padding: 8px; vertical-align: middle; }
tbody tr:hover { background: var(--hover); }
td:first-child { word-break: break-word; }
.num { text-align: right; white-space: nowrap; color: var(--muted); font-variant-numeric: tabular-nums; }
.icon { display: inline-block; width: 1.6em; }
.empty { color: var(--muted); text-align: center; padding: 32px 8px; }
@media (max-width: 560px) { th:nth-child(3), td:nth-child(3) { display: none; } }
</style>
</head>
<body>
<main>
<h1>${escapeHtml(heading)}</h1>
${body}
</main>
</body>
</html>`;
}

function isHidden(key) {
  return key.split("/").some((part) => part.startsWith("."));
}

function notFound(env) {
  const html = page(env.SITE_TITLE || "Materiály", "", `<p>Súbor alebo zložka neexistuje. <a href="/">Späť na materiály</a></p>`);
  return new Response(html, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function encodePath(name) {
  return name.split("/").map(encodeURIComponent).join("/");
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function formatSize(bytes) {
  const units = ["B", "kB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${i === 0 ? n : n.toFixed(1).replace(".", ",")} ${units[i]}`;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("sk-SK", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Europe/Bratislava" }).format(date);
}

const EXT_ICONS = {
  pdf: "📕", doc: "📝", docx: "📝", odt: "📝", txt: "📝", md: "📝",
  xls: "📊", xlsx: "📊", ods: "📊", csv: "📊",
  ppt: "📽️", pptx: "📽️", odp: "📽️",
  png: "🖼️", jpg: "🖼️", jpeg: "🖼️", gif: "🖼️", svg: "🖼️", webp: "🖼️",
  mp4: "🎬", webm: "🎬", mov: "🎬", mp3: "🎵",
  zip: "🗜️", rar: "🗜️", "7z": "🗜️",
  py: "💻", ino: "💻", c: "💻", cpp: "💻", h: "💻", js: "💻", html: "💻",
};

function fileIcon(name) {
  return EXT_ICONS[name.split(".").pop().toLowerCase()] || "📄";
}

const MIME = {
  pdf: "application/pdf", txt: "text/plain; charset=utf-8", md: "text/plain; charset=utf-8",
  py: "text/plain; charset=utf-8", ino: "text/plain; charset=utf-8", c: "text/plain; charset=utf-8",
  cpp: "text/plain; charset=utf-8", h: "text/plain; charset=utf-8", csv: "text/csv; charset=utf-8",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp",
  mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg",
};

function guessType(key) {
  return MIME[key.split(".").pop().toLowerCase()] || "application/octet-stream";
}
