import json
from typing import Any, Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from backend.store import store

router = APIRouter(tags=["Realtime"])

@router.websocket("/ws/board/{token}")
async def websocket_board_endpoint(
    websocket: WebSocket,
    token: str,
    name: Optional[str] = "Anonymous",
    role: Optional[str] = "candidate",
):
    await websocket.accept()

    if token not in store.room_connections:
        store.room_connections[token] = set()
    store.room_connections[token].add(websocket)

    # Broadcast join event to all peers in room
    join_notice = {
        "type": "presence",
        "action": "join",
        "participant": {"name": name, "role": role},
        "count": len(store.room_connections[token]),
    }
    for peer in list(store.room_connections[token]):
        if peer != websocket:
            try:
                await peer.send_json(join_notice)
            except Exception:
                pass

    try:
        while True:
            text = await websocket.receive_text()
            try:
                data = json.loads(text)
            except Exception:
                continue

            # If message contains board operations, persist them in the store
            ops = None
            if data.get("type") == "board_ops" and "ops" in data:
                ops = data["ops"]
            elif data.get("type") == "broadcast" and data.get("event") == "ops" and "payload" in data:
                ops = data["payload"].get("ops")

            if ops:
                session = store.get_session_by_token(token)
                if session and not session.link_revoked and session.status != "completed":
                    store.apply_board_ops(session.id, ops)
                    await websocket.send_json({"type": "ops_ack", "status": "ok"})

            # Broadcast to all other peers in the room
            for peer in list(store.room_connections.get(token, [])):
                if peer != websocket:
                    try:
                        await peer.send_text(text)
                    except Exception:
                        pass

    except WebSocketDisconnect:
        pass
    finally:
        if token in store.room_connections:
            store.room_connections[token].discard(websocket)
            leave_notice = {
                "type": "presence",
                "action": "leave",
                "participant": {"name": name, "role": role},
                "count": len(store.room_connections[token]),
            }
            for peer in list(store.room_connections[token]):
                try:
                    await peer.send_json(leave_notice)
                except Exception:
                    pass
