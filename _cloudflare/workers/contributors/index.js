const CONTRIBUTORS_KEY = "github/contributors.json";
const AVATAR_PREFIX = "github/avatars";
const AVATAR_SIZE = 128;

function getSizedAvatarUrl(rawUrl, size = AVATAR_SIZE) {
  try {
    const parsed = new URL(rawUrl);
    parsed.searchParams.set("s", String(size));
    return parsed.toString();
  } catch (_) {
    const sep = rawUrl.includes("?") ? "&" : "?";
    return `${rawUrl}${sep}s=${size}`;
  }
}

function extensionFromContentType(contentType = "", fallbackUrl = "") {
  const clean = contentType.split(";")[0].trim().toLowerCase();
  const map = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
    "image/svg+xml": "svg"
  };
  if (map[clean]) return map[clean];

  try {
    const pathname = new URL(fallbackUrl).pathname.toLowerCase();
    const match = pathname.match(/\.(png|jpe?g|webp|gif|avif|svg)$/);
    if (match) {
      return match[1] === "jpeg" ? "jpg" : match[1];
    }
  } catch (_) {
    // Ignore URL parse error
  }

  return "png";
}

async function mirrorAvatar(env, user, baseUrl) {
  const sizedUrl = getSizedAvatarUrl(user.avatar_url, AVATAR_SIZE);

  try {
    const imgRes = await fetch(sizedUrl, {
      headers: {
        "User-Agent": "shynotes-contributor-sync",
        "Accept": "image/*"
      }
    });

    if (!imgRes.ok) {
      return user.avatar_url;
    }

    const contentType = imgRes.headers.get("content-type") || "image/png";
    const ext = extensionFromContentType(contentType, user.avatar_url);
    const key = `${AVATAR_PREFIX}/${user.login}.${ext}`;
    const bytes = await imgRes.arrayBuffer();

    await env.CONTRIBUTORS_BUCKET.put(key, bytes, {
      httpMetadata: {
        contentType,
        cacheControl: "public, max-age=86400"
      }
    });

    return `${baseUrl}/${key}`;
  } catch (_) {
    return user.avatar_url;
  }
}

export default {
  async scheduled(event, env, ctx) {
    const apiUrl = `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/contributors?per_page=50`;
    const res = await fetch(apiUrl, {
      headers: {
        "User-Agent": "shynotes-contributor-sync",
        "Accept": "application/vnd.github+json",
        ...(env.GH_TOKEN ? { "Authorization": `Bearer ${env.GH_TOKEN}` } : {})
      }
    });

    if (!res.ok) {
      throw new Error(`GitHub API failed: ${res.status}`);
    }

    const raw = await res.json();
    const humans = (Array.isArray(raw) ? raw : []).filter((u) => u.type === "User");

    const baseUrl = (env.CDN_BASE_URL || "https://cdn.shynotes.org").replace(/\/+$/, "");

    const contributors = await Promise.all(
      humans.map(async (u) => ({
        login: u.login,
        avatar_url: await mirrorAvatar(env, u, baseUrl),
        html_url: u.html_url,
        contributions: u.contributions
      }))
    );

    const payload = {
      updated_at: new Date().toISOString(),
      contributors
    };

    await env.CONTRIBUTORS_BUCKET.put(CONTRIBUTORS_KEY, JSON.stringify(payload), {
      httpMetadata: {
        contentType: "application/json; charset=utf-8",
        cacheControl: "public, max-age=3600"
      }
    });
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const key = url.pathname.replace(/^\/+/, "");

    if (!key || key === CONTRIBUTORS_KEY) {
      const obj = await env.CONTRIBUTORS_BUCKET.get(CONTRIBUTORS_KEY);
      if (!obj) {
        return new Response(JSON.stringify({ updated_at: null, contributors: [] }), {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=300",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
      return new Response(obj.body, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    if (key.startsWith(`${AVATAR_PREFIX}/`)) {
      const avatarObj = await env.CONTRIBUTORS_BUCKET.get(key);
      if (!avatarObj) {
        return new Response("Not found", { status: 404 });
      }
      const headers = new Headers();
      avatarObj.writeHttpMetadata(headers);
      headers.set("Cache-Control", "public, max-age=86400");
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response(avatarObj.body, { headers });
    }

    return new Response("Not found", { status: 404 });
  }
};