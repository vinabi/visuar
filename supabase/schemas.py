# schemas.py
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

class UserCreate(BaseModel):
    email: EmailStr
    name: str

class UserResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    class Config:
        from_attributes = True

class ProfileBase(BaseModel):
    occupation: str
    average_screen_time: int
    glasses_user: str
    lens_power: Optional[str] = None
    lighting_environment: str
    work_environment: str
    diet_habits: str
    eye_pain_or_headache: str
    sleep_hours: int
    medical_history: Optional[str] = None
    smoker: Optional[str] = None
    alcohol_consumption: Optional[str] = None
    exercise_frequency: Optional[str] = None
    water_intake: Optional[str] = None

class ProfileCreate(ProfileBase):
    pass

class ProfileResponse(ProfileBase):
    id: int
    user_id: int
    class Config:
        from_attributes = True

# ─── Test Results ────────────────────────────────────────

class TestResultCreate(BaseModel):
    test_type: str = "snellen-acuity"
    left_eye_acuity: Optional[str] = None
    right_eye_acuity: Optional[str] = None
    left_eye_diopter: Optional[float] = None
    right_eye_diopter: Optional[float] = None
    overall_score: int = 0

class TestResultResponse(BaseModel):
    id: int
    user_id: int
    test_type: str
    left_eye_acuity: Optional[str] = None
    right_eye_acuity: Optional[str] = None
    left_eye_diopter: Optional[float] = None
    right_eye_diopter: Optional[float] = None
    overall_score: int
    created_at: datetime
    class Config:
        from_attributes = True