# ============================================================
# Vercel Python Serverless 代理
# 在服务端持有令牌，转发到后端 coze.site 的 /run 与 /export_report
# 绕开浏览器跨域被强制鉴权网关拦截的问题。
#
# 通过 vercel.json 的 rewrite 把 /api/run、/api/export_report 指到本函数。
# 本文件采用 Vercel Python Runtime 标准写法（零依赖标准库）。
# ============================================================
import json
import os
import urllib.request
from http.server import BaseHTTPRequestHandler

# 后端服务地址（部署 API 网关域名）
BACKEND = "https://tumorthink.coze.site"

# 内置令牌：优先读环境变量（更安全），未设置则用内置值。
# 建议在 Vercel Settings → Environment Variables 配置 BACKEND_TOKEN 以便轮换。
TOKEN = os.environ.get("BACKEND_TOKEN") or "sat_rFs7ntdplKddOq8bv7ZfAM9fxkbuYrxQf0ZoF7yGgCNknf4Qj21CZMm1FYtriVHC"


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        # 读取前端请求体
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length > 0 else b"{}"

        # 归一化路径：/api/run -> /run, /api/export_report -> /export_report
        path = self.path
        if path.startswith("/api/"):
            path = path[len("/api"):]  # "/api/run" -> "/run"
        if not path.startswith("/"):
            path = "/" + path

        try:
            req = urllib.request.Request(
                BACKEND + path,
                data=body,
                method="POST",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + TOKEN,
                },
            )
            with urllib.request.urlopen(req, timeout=180) as resp:
                data = resp.read()
                ctype = resp.headers.get("Content-Type", "application/json")
                status = resp.getcode()
                self._respond(status, ctype, data)
        except urllib.error.HTTPError as e:
            data = e.read()
            self._respond(e.code, "application/json", data)
        except Exception as e:
            msg = json.dumps({"error": "代理转发失败: " + str(e)}).encode("utf-8")
            self._respond(502, "application/json", msg)

    def _respond(self, status, ctype, data):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        # 静默访问日志，避免刷屏
        pass
