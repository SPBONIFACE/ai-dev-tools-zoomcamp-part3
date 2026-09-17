from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.routers import auth, boards, realtime, sessions

app = FastAPI(
    title="Collaborative System Design Interview Platform API",
    description="Backend REST & WebSocket service for interview sessions and real-time canvas collaboration",
    version="1.0.0",
)

# Enable CORS for frontend development (supporting localhost:8080, 3000, 5173, etc.)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include sub-routers
app.include_router(auth.router)
app.include_router(sessions.router)
app.include_router(boards.router)
app.include_router(realtime.router)

@app.get("/api/health", tags=["Health"])
def health_check():
    return {"status": "ok", "service": "interview-platform-backend"}

import os
import httpx
from fastapi import Request
from fastapi.responses import JSONResponse, Response

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://127.0.0.1:3000")

@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"], include_in_schema=False)
async def frontend_proxy(request: Request, path: str = ""):
    # Do not proxy API or WebSocket routes
    if path.startswith("api/") or path.startswith("ws/") or path in ("docs", "openapi.json", "redoc"):
        return JSONResponse(status_code=404, content={"detail": "Not Found"})
    
    target_path = f"/{path}" if path else "/"
    query_str = request.url.query
    url_target = f"{FRONTEND_URL}{target_path}" + (f"?{query_str}" if query_str else "")
    
    headers = {k: v for k, v in request.headers.items() if k.lower() not in ("host", "content-length")}
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            content = await request.body()
            rp_resp = await client.request(
                method=request.method,
                url=url_target,
                headers=headers,
                content=content,
            )
            # Filter hop-by-hop headers
            excluded_headers = {"content-encoding", "content-length", "transfer-encoding", "connection"}
            response_headers = {
                k: v for k, v in rp_resp.headers.items() if k.lower() not in excluded_headers
            }
            return Response(
                content=rp_resp.content,
                status_code=rp_resp.status_code,
                headers=response_headers,
            )
    except (httpx.ConnectError, httpx.ConnectTimeout):
        # Fallback if frontend SSR server is not running (e.g. backend standalone dev)
        if not path or path == "":
            return {
                "message": "Collaborative System Design Interview Platform API is running",
                "docs": "/docs",
                "health": "/api/health",
            }
        return JSONResponse(
            status_code=502,
            content={"detail": "Frontend server is unavailable on internal port 3000"},
        )
