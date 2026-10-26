const ACCESS_COOKIE = "pkc_auth_access";
const REFRESH_COOKIE = "pkc_auth_refresh";
const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/api/auth/register",
  "/healthz",
  "/favicon.ico",
]);

function authError(status, error, message) {
  return { ok: false, status, error, message };
}

export function createAuthGate(options = {}) {
  const supabaseUrl = String(
    options.supabaseUrl ?? process.env.SUPABASE_URL ?? "",
  ).replace(/\/+$/, "");
  const anonKey = String(options.anonKey ?? process.env.SUPABASE_ANON_KEY ?? "");
  const enabled = options.enabled ?? (
    process.env.PKC_CLOUD === "1" && !!supabaseUrl && !!anonKey
  );
  const secureCookies = options.secureCookies ?? process.env.PKC_CLOUD === "1";
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = options.now || Date.now;
  const validationCache = new Map();

  async function request(pathname, init = {}) {
    const url = fetchImpl === globalThis.fetch ? supabaseUrl + pathname : pathname;
    const response = await fetchImpl(url, init);
    const text = await response.text();
    let body = null;
    if (text) {
      try { body = JSON.parse(text); } catch { body = text; }
    }
    return { response, body };
  }

  function headers(accessToken = "") {
    return {
      apikey: anonKey,
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: "Bearer " + accessToken } : {}),
    };
  }

  async function validateAccess(accessToken) {
    if (!accessToken) return null;
    const cached = validationCache.get(accessToken);
    if (cached && cached.expiresAt > now()) return cached.user;
    const { response, body } = await request("/auth/v1/user", {
      headers: headers(accessToken),
    });
    if (!response.ok || !body?.id) {
      validationCache.delete(accessToken);
      return null;
    }
    const user = {
      id: String(body.id),
      email: String(body.email || "").toLowerCase(),
      lastSignInAt: body.last_sign_in_at || "",
    };
    validationCache.set(accessToken, { user, expiresAt: now() + 60_000 });
    return user;
  }

  async function refreshSession(refreshToken) {
    const { response, body } = await request(
      "/auth/v1/token?grant_type=refresh_token",
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ refresh_token: refreshToken }),
      },
    );
    if (!response.ok || !body?.access_token) return null;
    const user = body.user
      ? {
          id: String(body.user.id || ""),
          email: String(body.user.email || "").toLowerCase(),
        }
      : await validateAccess(body.access_token);
    if (!user) return null;
    validationCache.set(body.access_token, { user, expiresAt: now() + 60_000 });
    return {
      ok: true,
      user,
      accessToken: String(body.access_token),
      refreshToken: String(body.refresh_token || refreshToken),
      expiresIn: Number(body.expires_in) || 3600,
      refreshed: true,
    };
  }

  async function login(email, password) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail || !password) {
      return authError(400, "credentials_required", "请输入邮箱和密码");
    }
    if (!enabled) {
      return {
        ok: true,
        local: true,
        user: { id: "local", email: normalizedEmail || "local" },
        accessToken: "",
        refreshToken: "",
        expiresIn: 0,
      };
    }
    const { response, body } = await request(
      "/auth/v1/token?grant_type=password",
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ email: normalizedEmail, password }),
      },
    );
    if (!response.ok || !body?.access_token) {
      const code = String(body?.code || body?.error_code || "");
      if (code === "email_not_confirmed") {
        return authError(403, "email_not_confirmed", "邮箱尚未验证，请先点击验证邮件中的链接");
      }
      return authError(
        response.status === 400 ? 401 : response.status || 401,
        "invalid_credentials",
        body?.error_description || body?.message || "邮箱或密码不正确",
      );
    }
    const user = {
      id: String(body.user?.id || ""),
      email: String(body.user?.email || normalizedEmail).toLowerCase(),
      lastSignInAt: body.user?.last_sign_in_at || "",
    };
    validationCache.set(body.access_token, { user, expiresAt: now() + 60_000 });
    return {
      ok: true,
      user,
      accessToken: String(body.access_token),
      refreshToken: String(body.refresh_token || ""),
      expiresIn: Number(body.expires_in) || 3600,
    };
  }

  async function register(email, password, redirectTo = "") {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedPassword = String(password || "");
    if (!normalizedEmail || !normalizedPassword) {
      return authError(400, "credentials_required", "请输入邮箱和密码");
    }
    if (normalizedPassword.length < 8) {
      return authError(400, "weak_password", "密码至少需要 8 个字符");
    }
    if (!enabled) {
      return authError(400, "cloud_mode_required", "注册功能仅在云端模式开放");
    }
    const query = redirectTo
      ? "?redirect_to=" + encodeURIComponent(redirectTo)
      : "";
    const { response, body } = await request("/auth/v1/signup" + query, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        email: normalizedEmail,
        password: normalizedPassword,
        data: {},
      }),
    });
    if (!response.ok) {
      const code = String(body?.code || body?.error_code || "registration_failed");
      const message = code === "weak_password"
        ? "密码强度不足，请使用至少 8 个字符"
        : code === "over_email_send_rate_limit"
          ? "验证邮件发送过于频繁，请稍后再试"
          : body?.message || body?.error_description || body?.msg || "注册失败，请稍后重试";
      return authError(response.status || 400, code, message);
    }
    const user = body?.user || body || {};
    const session = body?.session || (
      body?.access_token && body?.refresh_token ? body : null
    );
    if (session?.access_token) {
      const confirmedUser = {
        id: String(user.id || ""),
        email: String(user.email || normalizedEmail).toLowerCase(),
        lastSignInAt: user.last_sign_in_at || "",
      };
      validationCache.set(session.access_token, {
        user: confirmedUser,
        expiresAt: now() + 60_000,
      });
      return {
        ok: true,
        requiresConfirmation: false,
        user: confirmedUser,
        accessToken: String(session.access_token),
        refreshToken: String(session.refresh_token || ""),
        expiresIn: Number(session.expires_in) || 3600,
        message: "注册成功，已自动登录",
      };
    }
    return {
      ok: true,
      requiresConfirmation: true,
      email: String(user.email || normalizedEmail).toLowerCase(),
      message: "验证邮件已发送，请前往邮箱完成验证后登录",
    };
  }

  async function resolveSession({ accessToken = "", refreshToken = "" } = {}) {
    if (!enabled) {
      return {
        ok: true,
        local: true,
        user: { id: "local", email: "local" },
        accessToken: "",
        refreshToken: "",
      };
    }
    if (accessToken) {
      try {
        const user = await validateAccess(accessToken);
        if (user) {
          return {
            ok: true,
            user,
            accessToken,
            refreshToken,
            expiresIn: 3600,
            refreshed: false,
          };
        }
      } catch { /* try refresh below */ }
    }
    if (refreshToken) {
      try {
        const refreshed = await refreshSession(refreshToken);
        if (refreshed) return refreshed;
      } catch { /* invalid session */ }
    }
    return authError(401, "auth_required", "请先登录");
  }

  async function logout(accessToken) {
    if (!enabled || !accessToken) return;
    try {
      await request("/auth/v1/logout", {
        method: "POST",
        headers: headers(accessToken),
        body: "{}",
      });
    } finally {
      validationCache.delete(accessToken);
    }
  }

  function cookie(name, value, maxAge) {
    return [
      `${name}=${encodeURIComponent(value)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Strict",
      secureCookies ? "Secure" : "",
      `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
    ].filter(Boolean).join("; ");
  }

  function sessionCookies(session) {
    if (!enabled || !session?.accessToken) return [];
    return [
      cookie(ACCESS_COOKIE, session.accessToken, session.expiresIn || 3600),
      cookie(REFRESH_COOKIE, session.refreshToken || "", 30 * 24 * 60 * 60),
    ];
  }

  function clearCookies() {
    return [
      cookie(ACCESS_COOKIE, "", 0),
      cookie(REFRESH_COOKIE, "", 0),
    ];
  }

  function publicPath(pathname) {
    return !enabled || PUBLIC_PATHS.has(pathname);
  }

  return {
    enabled,
    supabaseUrl,
    accessCookie: ACCESS_COOKIE,
    refreshCookie: REFRESH_COOKIE,
    publicPath,
    login,
    register,
    logout,
    resolveSession,
    sessionCookies,
    clearCookies,
  };
}
