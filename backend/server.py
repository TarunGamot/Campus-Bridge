from fastapi import FastAPI, APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
from enum import Enum

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-change-this-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Security
security = HTTPBearer()

# Enums
class UserRole(str, Enum):
    STUDENT = "student"
    ALUMNI = "alumni"
    ADMIN = "admin"

# Auth Models
class UserRegister(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: UserRole
    college: str
    graduation_year: Optional[int] = None
    department: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    full_name: str
    role: UserRole
    college: str
    graduation_year: Optional[int] = None
    department: Optional[str] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: User

# Helper Functions
def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a hash"""
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def create_access_token(user_id: str, email: str, role: str) -> str:
    """Create a JWT access token"""
    expires = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    payload = {
        'user_id': user_id,
        'email': email,
        'role': role,
        'exp': expires
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> User:
    """Dependency to get current authenticated user"""
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get('user_id')
        
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials"
            )
        
        # Get user from database
        user_doc = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
        if not user_doc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found"
            )
        
        # Convert datetime strings back to datetime objects if needed
        if isinstance(user_doc.get('created_at'), str):
            user_doc['created_at'] = datetime.fromisoformat(user_doc['created_at'])
        if isinstance(user_doc.get('updated_at'), str):
            user_doc['updated_at'] = datetime.fromisoformat(user_doc['updated_at'])
        
        return User(**user_doc)
    
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired"
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )

async def require_role(required_roles: List[UserRole]):
    """Dependency to check if user has required role"""
    async def role_checker(current_user: User = Depends(get_current_user)):
        if current_user.role not in required_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions"
            )
        return current_user
    return role_checker

# Auth Routes
@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserRegister):
    """Register a new user"""
    # Check if user already exists
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create user
    user_dict = user_data.model_dump(exclude={'password'})
    user = User(**user_dict)
    
    # Hash password
    password_hash = hash_password(user_data.password)
    
    # Prepare document for MongoDB
    doc = user.model_dump()
    doc['password_hash'] = password_hash
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    # Insert into database
    await db.users.insert_one(doc)
    
    # Create access token
    access_token = create_access_token(user.id, user.email, user.role)
    
    return TokenResponse(access_token=access_token, user=user)

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    """Login user"""
    # Find user
    user_doc = await db.users.find_one({"email": credentials.email})
    if not user_doc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # Verify password
    if not verify_password(credentials.password, user_doc['password_hash']):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # Check if user is active
    if not user_doc.get('is_active', True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated"
        )
    
    # Convert datetime strings
    if isinstance(user_doc.get('created_at'), str):
        user_doc['created_at'] = datetime.fromisoformat(user_doc['created_at'])
    if isinstance(user_doc.get('updated_at'), str):
        user_doc['updated_at'] = datetime.fromisoformat(user_doc['updated_at'])
    
    # Create user object (exclude password_hash and _id)
    user_data = {k: v for k, v in user_doc.items() if k not in ['password_hash', '_id']}
    user = User(**user_data)
    
    # Create access token
    access_token = create_access_token(user.id, user.email, user.role)
    
    return TokenResponse(access_token=access_token, user=user)

@api_router.get("/auth/me", response_model=User)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current user info"""
    return current_user

# ============= PROFILE MODELS =============

class Education(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    institution: str
    degree: str
    field_of_study: Optional[str] = None
    start_year: int
    end_year: Optional[int] = None
    description: Optional[str] = None

class WorkExperience(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company: str
    position: str
    location: Optional[str] = None
    start_date: str
    end_date: Optional[str] = None
    current: bool = False
    description: Optional[str] = None

class Project(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str
    technologies: List[str] = []
    link: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class Achievement(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str
    date: Optional[str] = None

class SocialLinks(BaseModel):
    linkedin: Optional[str] = None
    github: Optional[str] = None
    twitter: Optional[str] = None
    website: Optional[str] = None

class Profile(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    user_id: str
    bio: Optional[str] = None
    location: Optional[str] = None
    phone: Optional[str] = None
    profile_picture: Optional[str] = None
    
    # Professional Info
    headline: Optional[str] = None
    skills: List[str] = []
    interests: List[str] = []
    
    # Detailed sections
    education: List[Education] = []
    work_experience: List[WorkExperience] = []
    projects: List[Project] = []
    achievements: List[Achievement] = []
    
    # Social
    social_links: Optional[SocialLinks] = None
    
    # Mentorship
    available_for_mentorship: bool = False
    mentorship_areas: List[str] = []
    
    # Privacy
    profile_visibility: str = "public"  # public, connections, private
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ProfileUpdate(BaseModel):
    bio: Optional[str] = None
    location: Optional[str] = None
    phone: Optional[str] = None
    profile_picture: Optional[str] = None
    headline: Optional[str] = None
    skills: Optional[List[str]] = None
    interests: Optional[List[str]] = None
    education: Optional[List[Education]] = None
    work_experience: Optional[List[WorkExperience]] = None
    projects: Optional[List[Project]] = None
    achievements: Optional[List[Achievement]] = None
    social_links: Optional[SocialLinks] = None
    available_for_mentorship: Optional[bool] = None
    mentorship_areas: Optional[List[str]] = None
    profile_visibility: Optional[str] = None

class UserProfile(BaseModel):
    """Combined user and profile data"""
    user: User
    profile: Profile

class UserSearchResult(BaseModel):
    """User search result with basic info"""
    id: str
    full_name: str
    email: EmailStr
    role: UserRole
    college: str
    graduation_year: Optional[int]
    department: Optional[str]
    headline: Optional[str]
    profile_picture: Optional[str]
    skills: List[str]
    available_for_mentorship: bool

# ============= PROFILE ROUTES =============

@api_router.get("/profile/{user_id}", response_model=UserProfile)
async def get_user_profile(user_id: str, current_user: User = Depends(get_current_user)):
    """Get user profile by user_id"""
    # Get user info
    user_doc = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Convert datetime strings
    if isinstance(user_doc.get('created_at'), str):
        user_doc['created_at'] = datetime.fromisoformat(user_doc['created_at'])
    if isinstance(user_doc.get('updated_at'), str):
        user_doc['updated_at'] = datetime.fromisoformat(user_doc['updated_at'])
    
    user = User(**user_doc)
    
    # Get profile
    profile_doc = await db.profiles.find_one({"user_id": user_id}, {"_id": 0})
    
    if profile_doc:
        # Convert datetime strings
        if isinstance(profile_doc.get('created_at'), str):
            profile_doc['created_at'] = datetime.fromisoformat(profile_doc['created_at'])
        if isinstance(profile_doc.get('updated_at'), str):
            profile_doc['updated_at'] = datetime.fromisoformat(profile_doc['updated_at'])
        profile = Profile(**profile_doc)
    else:
        # Create default profile if doesn't exist
        profile = Profile(user_id=user_id)
        doc = profile.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        doc['updated_at'] = doc['updated_at'].isoformat()
        await db.profiles.insert_one(doc)
    
    return UserProfile(user=user, profile=profile)

@api_router.put("/profile", response_model=Profile)
async def update_profile(profile_update: ProfileUpdate, current_user: User = Depends(get_current_user)):
    """Update current user's profile"""
    # Get existing profile or create new one
    profile_doc = await db.profiles.find_one({"user_id": current_user.id}, {"_id": 0})
    
    if profile_doc:
        # Convert datetime strings
        if isinstance(profile_doc.get('created_at'), str):
            profile_doc['created_at'] = datetime.fromisoformat(profile_doc['created_at'])
        if isinstance(profile_doc.get('updated_at'), str):
            profile_doc['updated_at'] = datetime.fromisoformat(profile_doc['updated_at'])
        profile = Profile(**profile_doc)
    else:
        profile = Profile(user_id=current_user.id)
    
    # Update fields
    update_data = profile_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(profile, field, value)
    
    profile.updated_at = datetime.now(timezone.utc)
    
    # Save to database
    doc = profile.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await db.profiles.update_one(
        {"user_id": current_user.id},
        {"$set": doc},
        upsert=True
    )
    
    return profile

@api_router.get("/profile/search/users", response_model=List[UserSearchResult])
async def search_users(
    query: Optional[str] = None,
    role: Optional[UserRole] = None,
    college: Optional[str] = None,
    skills: Optional[str] = None,
    graduation_year: Optional[int] = None,
    available_for_mentorship: Optional[bool] = None,
    limit: int = 20,
    current_user: User = Depends(get_current_user)
):
    """Search users with filters"""
    # Build search query
    search_filter = {}
    
    if query:
        search_filter["$or"] = [
            {"full_name": {"$regex": query, "$options": "i"}},
            {"email": {"$regex": query, "$options": "i"}},
            {"department": {"$regex": query, "$options": "i"}}
        ]
    
    if role:
        search_filter["role"] = role
    
    if college:
        search_filter["college"] = {"$regex": college, "$options": "i"}
    
    if graduation_year:
        search_filter["graduation_year"] = graduation_year
    
    # Get users
    users_cursor = db.users.find(search_filter, {"_id": 0, "password_hash": 0}).limit(limit)
    users = await users_cursor.to_list(length=limit)
    
    # Get profiles for these users
    user_ids = [u["id"] for u in users]
    profiles_cursor = db.profiles.find({"user_id": {"$in": user_ids}}, {"_id": 0})
    profiles = await profiles_cursor.to_list(length=limit)
    
    # Create profile lookup
    profile_map = {p["user_id"]: p for p in profiles}
    
    # Build results
    results = []
    for user in users:
        profile = profile_map.get(user["id"], {})
        
        # Apply profile filters
        if skills and skills not in profile.get("skills", []):
            continue
        
        if available_for_mentorship is not None and profile.get("available_for_mentorship", False) != available_for_mentorship:
            continue
        
        result = UserSearchResult(
            id=user["id"],
            full_name=user["full_name"],
            email=user["email"],
            role=user["role"],
            college=user["college"],
            graduation_year=user.get("graduation_year"),
            department=user.get("department"),
            headline=profile.get("headline"),
            profile_picture=profile.get("profile_picture"),
            skills=profile.get("skills", []),
            available_for_mentorship=profile.get("available_for_mentorship", False)
        )
        results.append(result)
    
    return results

@api_router.get("/")
async def root():
    return {"message": "CAMPUS-BRIDGE API v1.0"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()