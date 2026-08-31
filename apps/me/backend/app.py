import json
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

import agent
import passwordless
import timeline
import vault
from db import close_db, open_db
from fastapi.responses import StreamingResponse

STATIC = Path(os.environ.get("STATIC_DIR", str(Path(__file__).resolve().parent.parent / "frontend" / "dist" / "frontend" / "browser")))


@asynccontextmanager
async def lifespan(_app: FastAPI):
    open_db()
    passwordless.ensure_schema()
    vault.rebuild()
    agent.bootstrap()
    yield
    close_db()


app = FastAPI(lifespan=lifespan)


PUBLIC_API = (
    "/api/auth/passwordless/lookup",
    "/api/auth/passwordless/challenge",
    "/api/auth/passwordless/verify",
    "/api/auth/bootstrap-status",
    "/api/auth/bootstrap/passwordless",
)


@app.middleware("http")
async def gate(request: Request, call_next):
    path = request.url.path
    if path.startswith("/login") or path in PUBLIC_API:
        return await call_next(request)
    if path.startswith("/api/"):
        user = passwordless.session_user(request.cookies.get(passwordless.COOKIE))
        if not user:
            return JSONResponse({"error": "auth"}, status_code=401)
        if request.method not in ("GET", "HEAD", "OPTIONS") and not passwordless.csrf_ok(request, user):
            return JSONResponse({"error": "csrf"}, status_code=403)
        return await call_next(request)
    ext = Path(path).suffix
    if ext in {".js", ".css", ".ico", ".svg", ".woff", ".woff2", ".map"}:
        return await call_next(request)
    if passwordless.session_user(request.cookies.get(passwordless.COOKIE)) is None and path != "/login":
        return RedirectResponse("/login", status_code=303)
    return await call_next(request)


@app.get("/api/auth/bootstrap-status")
def auth_bootstrap_status():
    return {"needs_setup": passwordless.user_count() == 0}


@app.post("/api/auth/bootstrap/passwordless")
def auth_bootstrap(payload: dict):
    if passwordless.user_count():
        raise HTTPException(409, "already set up")
    session = passwordless.bootstrap(
        str(payload.get("username") or ""),
        str(payload.get("public_key_b64") or ""),
        payload.get("auth") or {},
    )
    if not session:
        raise HTTPException(400, "bad")
    res = JSONResponse({"ok": True, "username": session["username"]})
    passwordless.set_cookies(res, session)
    return res


@app.post("/api/auth/passwordless/lookup")
def auth_lookup(payload: dict):
    return passwordless.lookup(str(payload.get("username") or ""))


@app.post("/api/auth/passwordless/challenge")
def auth_challenge(payload: dict, request: Request):
    return passwordless.issue_challenge(str(payload.get("username") or ""), passwordless.origin(request))


@app.post("/api/auth/passwordless/verify")
def auth_verify(payload: dict, request: Request):
    session = passwordless.verify(
        str(payload.get("username") or ""),
        str(payload.get("challenge_id") or ""),
        str(payload.get("challenge") or ""),
        str(payload.get("message") or ""),
        str(payload.get("signature_b64") or payload.get("signature") or ""),
    )
    if not session:
        raise HTTPException(401, "Could not unlock.")
    res = JSONResponse({"ok": True, "username": session["username"]})
    passwordless.set_cookies(res, session)
    return res


@app.get("/api/auth/me")
def auth_me(request: Request):
    user = passwordless.session_user(request.cookies.get(passwordless.COOKIE))
    if not user:
        raise HTTPException(401, "auth")
    return {"username": user["username"]}


@app.post("/api/auth/logout")
def auth_logout(request: Request):
    passwordless.logout(request.cookies.get(passwordless.COOKIE))
    res = JSONResponse({"ok": True})
    passwordless.clear_cookies(res)
    return res


@app.get("/api/bootstrap")
def bootstrap():
    try:
        tl = timeline.project_life()
    except Exception:
        tl = None
    return {"timeline": tl}


@app.get("/api/notes")
def notes(n: str = ""):
    if not n or len(n) > 200 or "\0" in n:
        raise HTTPException(400, "invalid target")
    if timeline.WEEK_ID.match(n):
        return {"kind": "week", "id": n}
    return vault.resolve_target(n)


@app.get("/api/timeline/week/{wid}")
def week(wid: str):
    if not timeline.WEEK_ID.match(wid):
        raise HTTPException(400, "invalid week")
    return timeline.week_payload(wid)


def _sid(val) -> str | None:
    if not isinstance(val, str):
        return None
    s = val.strip()
    return s or None


@app.get("/api/agent")
def agent_history(id: str = ""):
    sid = _sid(id)
    path = agent.resolve(sid)
    return {
        "session": agent._meta(path) if path else None,
        "sessions": agent.sessions(),
        "lines": agent.history(sid),
    }


@app.post("/api/agent/reset")
def agent_reset(payload: dict | None = None):
    sid = _sid((payload or {}).get("id"))
    agent.reset(sid)
    return {"session": None, "sessions": agent.sessions(), "lines": []}


@app.post("/api/agent")
async def agent_route(payload: dict):
    q = payload.get("message")
    if not isinstance(q, str) or not q or len(q) > 8000 or "\0" in q:
        raise HTTPException(400, "invalid message")
    sid = _sid(payload.get("id"))
    fresh = bool(payload.get("fresh"))
    name = payload.get("name")
    if not isinstance(name, str) or not name.strip() or len(name) > 40:
        name = "wall"
    else:
        name = name.strip()

    async def stream():
        async for ev in agent.run(q.strip(), name=name, session_id=sid, fresh=fresh):
            yield f"data: {json.dumps(ev)}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


@app.get("/api/vault/status")
def vault_status():
    return vault.status()


@app.post("/api/vault/rebuild")
def vault_rebuild():
    return vault.rebuild()


def _index() -> FileResponse:
    return FileResponse(STATIC / "index.html")


if STATIC.is_dir():
    @app.get("/login")
    def login_page():
        return _index()

    app.mount("/", StaticFiles(directory=str(STATIC), html=True), name="static")
