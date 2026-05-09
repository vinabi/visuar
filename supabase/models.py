# models.py
from sqlalchemy import Column, ForeignKey, Integer, String, Float, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True)
    full_name = Column(String)

    profile = relationship("Profile", back_populates="user", uselist=False,
                           cascade="all, delete-orphan", passive_deletes=True)
    test_results = relationship("TestResult", back_populates="user",
                                cascade="all, delete-orphan", passive_deletes=True,
                                order_by="TestResult.created_at.desc()")

class Profile(Base):
    __tablename__ = "profile"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    occupation = Column(String)
    average_screen_time = Column(Integer)
    glasses_user = Column(String)
    lens_power = Column(String, nullable=True)
    lighting_environment = Column(String)
    work_environment = Column(String)
    diet_habits = Column(String)
    eye_pain_or_headache = Column(String)
    sleep_hours = Column(Integer)
    medical_history = Column(String, nullable=True)
    smoker = Column(String, nullable=True)
    alcohol_consumption = Column(String, nullable=True)
    exercise_frequency = Column(String, nullable=True)
    water_intake = Column(String, nullable=True)

    user = relationship("User", back_populates="profile")

class TestResult(Base):
    __tablename__ = "test_results"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    test_type = Column(String, default="snellen-acuity")
    left_eye_acuity = Column(String, nullable=True)
    right_eye_acuity = Column(String, nullable=True)
    left_eye_diopter = Column(Float, nullable=True)
    right_eye_diopter = Column(Float, nullable=True)
    overall_score = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="test_results")