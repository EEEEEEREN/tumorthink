// ============================================================
// Vercel Serverless 代理：在服务端持有令牌，转发到后端 coze.site
// 作用：绕开浏览器跨域被强制鉴权网关拦截的问题（Failed to fetch）
// 前端改为同源调用本代理 (/api/run, /api/export_report)，无跨域。
//
// 部署：将本文件（连同 index.html）放入你的 Vercel 项目（GitHub 仓库）
//      对应路径后推送，Vercel 会自动把它作为 Serverless 函数部署。
// ============================================================

// 后端服务地址（你的部署 API 网关域名）
const BACKEND = "https://tumorthink.coze.site";

// 内置令牌：优先读环境变量（更安全），未设置则用下面这个内置值。
// 建议在 Vercel 项目 Settings → Environment Variables 里配置 BACKEND_TOKEN 来轮换。
const TOKEN =
  process.env.BACKEND_TOKEN ||
  "sat_rFs7ntdplKddOq8bv7ZfAM9fxkbuYrxQf0ZoF7yGgCNknf4Qj21CZMm1FYtriVHC";

export default async function handler(req, res) {
  // 只允许本项目同源调用（允许你的 vercel 域名与本地 localhost）
  try {
    const url = new URL(req.url, "http://localhost");
    let path = url.pathname;

    // 归一化：支持 /api/run 与 /run 两种情况
    if (path.startsWith("/api/")) path = path.slice(4); // "/api/run" -> "/run"
    if (!path.startsWith("/")) path = "/" + path;

    if (req.method !== "POST") {
      res.setHeader("Content-Type", "application/json");
      return res.status(405).json({ error: "仅支持 POST" });
    }

    // 读取前端请求体
    let bodyText = "";
    for await (const chunk of req) bodyText += chunk;

    // 转发到后端
    const upRes = await fetch(BACKEND + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + TOKEN,
      },
      body: bodyText || "{}",
    });

    const contentType = upRes.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const data = await upRes.json();
      res.setHeader("Content-Type", "application/json");
      return res.status(upRes.status).json(data);
    }

    // PDF / 流式 / 其他：以二进制透传
    const buf = Buffer.from(await upRes.arrayBuffer());
    res.setHeader("Content-Type", contentType || "application/octet-stream");
    res.setHeader("Content-Disposition", upRes.headers.get("content-disposition") || "");
    return res.status(upRes.status).send(buf);
  } catch (e) {
    res.setHeader("Content-Type", "application/json");
    return res.status(502).json({ error: "代理转发失败: " + (e && e.message ? e.message : e) });
  }
}