# crud.py
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc
from schemas import UserCreate, UserResponse, ProfileCreate, ProfileResponse, TestResultCreate, TestResultResponse
from models import User, Profile, TestResult

async def create_user(db: AsyncSession, user: UserCreate) -> UserResponse:
    existing = await get_user_by_email(db, user.email)
    if existing:
        return existing
    db_user = User(email=user.email, full_name=user.name)
    db.add(db_user)
    try:
        await db.commit()
        await db.refresh(db_user)
        return UserResponse.from_orm(db_user)
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"DB error: {str(e)}")

async def get_user_by_email(db: AsyncSession, email: str):
    result = await db.execute(select(User).filter_by(email=email))
    user = result.scalars().first()
    return UserResponse.from_orm(user) if user else None

async def get_profile_by_user_id(db: AsyncSession, user_id: int):
    result = await db.execute(select(Profile).filter_by(user_id=user_id))
    profile = result.scalars().first()
    return ProfileResponse.from_orm(profile) if profile else None

async def upsert_profile(db: AsyncSession, user_id: int, data: ProfileCreate) -> ProfileResponse:
    profile = (await db.execute(select(Profile).filter_by(user_id=user_id))).scalars().first()
    if profile:
        for key, val in data.dict().items():
            setattr(profile, key, val)
    else:
        profile = Profile(user_id=user_id, **data.dict())
        db.add(profile)
    try:
        await db.commit()
        await db.refresh(profile)
        return ProfileResponse.from_orm(profile)
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Profile error: {str(e)}")

# ─── Test Results ────────────────────────────────────────

async def create_test_result(db: AsyncSession, user_id: int, data: TestResultCreate) -> TestResultResponse:
    result = TestResult(user_id=user_id, **data.dict())
    db.add(result)
    try:
        await db.commit()
        await db.refresh(result)
        return TestResultResponse.from_orm(result)
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Test result error: {str(e)}")

async def get_test_results_by_user(db: AsyncSession, user_id: int, limit: int = 20):
    result = await db.execute(
        select(TestResult)
        .filter_by(user_id=user_id)
        .order_by(desc(TestResult.created_at))
        .limit(limit)
    )
    rows = result.scalars().all()
    return [TestResultResponse.from_orm(r) for r in rows]