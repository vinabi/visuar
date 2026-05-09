# main.py
from fastapi import FastAPI, Request, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
import cv2
import numpy as np
import base64
from vision_module.vision import VisionModule
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os
from pathlib import Path
from supabase import create_client, Client
from schemas import UserCreate, UserResponse, ProfileCreate, ProfileResponse, TestResultCreate, TestResultResponse
from crud import create_user, get_user_by_email, get_profile_by_user_id, upsert_profile, create_test_result, get_test_results_by_user
from database import get_db, init_db
from models import User

# Load .env from the same directory as this file
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not all([SUPABASE_URL, SUPABASE_KEY]):
    raise ValueError("Missing SUPABASE_URL or SUPABASE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

vision_module_instance = VisionModule()

app = FastAPI()

@app.on_event("startup")
async def startup_event():
    vision_module_instance.start()
    try:
        await init_db()
    except Exception as e:
        print(f"Warning: Database initialization failed: {e}")
        print("Server will run but database operations may fail until credentials are fixed.")
        # Don't re-raise - let server continue running

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/", response_class=HTMLResponse)
async def serve_home():
    try:
        return FileResponse("index.html")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="index.html not found")

@app.post("/register-user", response_model=UserResponse)
async def register_user(user: UserCreate, db=Depends(get_db)):
    return await create_user(db, user)

# --- AUTH HELPER ---
async def get_current_user(request: Request, db):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization")

    token = auth_header.split(" ")[1]
    try:
        auth_user = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    if not auth_user.user:
        raise HTTPException(status_code=401, detail="Invalid user")

    email = auth_user.user.email
    db_user = await get_user_by_email(db, email)

    if not db_user:
        name = auth_user.user.user_metadata.get("full_name") or "User"
        db_user = await create_user(db, UserCreate(email=email, name=name))

    return {"supabase": auth_user.user, "db": db_user}

@app.get("/me")
async def get_me(request: Request, db=Depends(get_db)):
    cur = await get_current_user(request, db)
    return {
        "supabase_user": cur["supabase"].dict(),
        "db_user": cur["db"]
    }

# --- PROFILE ENDPOINTS ---
@app.post("/profile", response_model=ProfileResponse, status_code=status.HTTP_201_CREATED)
async def create_or_update_profile(payload: ProfileCreate, request: Request, db=Depends(get_db)):
    cur = await get_current_user(request, db)
    return await upsert_profile(db, cur["db"].id, payload)

@app.get("/profile", response_model=ProfileResponse)
async def read_profile(request: Request, db=Depends(get_db)):
    cur = await get_current_user(request, db)
    profile = await get_profile_by_user_id(db, cur["db"].id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile

# --- VISION MODULE ENDPOINTS ---
@app.websocket("/ws/vision")
async def vision_websocket(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            if "," in data:
                data = data.split(",")[1]
            try:
                img_data = base64.b64decode(data)
                np_arr = np.frombuffer(img_data, np.uint8)
                frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
                if frame is not None:
                    result = vision_module_instance.process_frame(frame)
                    await websocket.send_json(result)
            except Exception as e:
                print(f"Vision processing error: {e}")
    except WebSocketDisconnect:
        pass

@app.post("/api/vision/calibrate")
async def calibrate_vision(data: dict):
    img_b64 = data.get("image")
    distance = data.get("distance", 50.0)
    if not img_b64:
        raise HTTPException(status_code=400, detail="No image provided")
    
    if "," in img_b64:
        img_b64 = img_b64.split(",")[1]
        
    try:
        img_data = base64.b64decode(img_b64)
        np_arr = np.frombuffer(img_data, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        
        if frame is not None:
            success = vision_module_instance.calibrate(frame, distance)
            return {"success": success}
        return {"success": False, "error": "Invalid frame"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- TEST RESULTS ENDPOINTS ---
@app.post("/api/test-results", response_model=TestResultResponse, status_code=status.HTTP_201_CREATED)
async def save_test_result(payload: TestResultCreate, request: Request, db=Depends(get_db)):
    cur = await get_current_user(request, db)
    return await create_test_result(db, cur["db"].id, payload)

@app.get("/api/test-results")
async def list_test_results(request: Request, db=Depends(get_db)):
    cur = await get_current_user(request, db)
    results = await get_test_results_by_user(db, cur["db"].id)
    return results