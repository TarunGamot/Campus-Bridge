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

# ============= CONNECTION MODELS =============

class ConnectionStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"

class ConnectionRequest(BaseModel):
    receiver_id: str
    message: Optional[str] = None

class Connection(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    sender_id: str
    receiver_id: str
    status: ConnectionStatus = ConnectionStatus.PENDING
    message: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ConnectionWithUser(BaseModel):
    """Connection with user details"""
    connection: Connection
    user: UserSearchResult

# ============= CONNECTION ROUTES =============

@api_router.post("/connections/request", response_model=Connection)
async def send_connection_request(
    request: ConnectionRequest,
    current_user: User = Depends(get_current_user)
):
    """Send a connection request to another user"""
    # Check if user exists
    receiver = await db.users.find_one({"id": request.receiver_id}, {"_id": 0})
    if not receiver:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Can't connect to yourself
    if request.receiver_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot connect to yourself")
    
    # Check if connection already exists
    existing = await db.connections.find_one({
        "$or": [
            {"sender_id": current_user.id, "receiver_id": request.receiver_id},
            {"sender_id": request.receiver_id, "receiver_id": current_user.id}
        ]
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="Connection request already exists")
    
    # Create connection
    connection = Connection(
        sender_id=current_user.id,
        receiver_id=request.receiver_id,
        message=request.message
    )
    
    doc = connection.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await db.connections.insert_one(doc)
    
    return connection

@api_router.put("/connections/{connection_id}/accept", response_model=Connection)
async def accept_connection(
    connection_id: str,
    current_user: User = Depends(get_current_user)
):
    """Accept a connection request"""
    conn_doc = await db.connections.find_one({"id": connection_id}, {"_id": 0})
    
    if not conn_doc:
        raise HTTPException(status_code=404, detail="Connection request not found")
    
    # Only receiver can accept
    if conn_doc["receiver_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="You can only accept requests sent to you")
    
    # Update status
    await db.connections.update_one(
        {"id": connection_id},
        {"$set": {
            "status": ConnectionStatus.ACCEPTED,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Get updated connection
    updated_doc = await db.connections.find_one({"id": connection_id}, {"_id": 0})
    if isinstance(updated_doc.get('created_at'), str):
        updated_doc['created_at'] = datetime.fromisoformat(updated_doc['created_at'])
    if isinstance(updated_doc.get('updated_at'), str):
        updated_doc['updated_at'] = datetime.fromisoformat(updated_doc['updated_at'])
    
    return Connection(**updated_doc)

@api_router.put("/connections/{connection_id}/reject", response_model=Connection)
async def reject_connection(
    connection_id: str,
    current_user: User = Depends(get_current_user)
):
    """Reject a connection request"""
    conn_doc = await db.connections.find_one({"id": connection_id}, {"_id": 0})
    
    if not conn_doc:
        raise HTTPException(status_code=404, detail="Connection request not found")
    
    # Only receiver can reject
    if conn_doc["receiver_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="You can only reject requests sent to you")
    
    # Update status
    await db.connections.update_one(
        {"id": connection_id},
        {"$set": {
            "status": ConnectionStatus.REJECTED,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Get updated connection
    updated_doc = await db.connections.find_one({"id": connection_id}, {"_id": 0})
    if isinstance(updated_doc.get('created_at'), str):
        updated_doc['created_at'] = datetime.fromisoformat(updated_doc['created_at'])
    if isinstance(updated_doc.get('updated_at'), str):
        updated_doc['updated_at'] = datetime.fromisoformat(updated_doc['updated_at'])
    
    return Connection(**updated_doc)

@api_router.delete("/connections/{connection_id}")
async def remove_connection(
    connection_id: str,
    current_user: User = Depends(get_current_user)
):
    """Remove a connection"""
    conn_doc = await db.connections.find_one({"id": connection_id}, {"_id": 0})
    
    if not conn_doc:
        raise HTTPException(status_code=404, detail="Connection not found")
    
    # Only participants can remove
    if conn_doc["sender_id"] != current_user.id and conn_doc["receiver_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="You can only remove your own connections")
    
    await db.connections.delete_one({"id": connection_id})
    
    return {"message": "Connection removed"}

@api_router.get("/connections", response_model=List[ConnectionWithUser])
async def get_connections(
    status: Optional[ConnectionStatus] = None,
    current_user: User = Depends(get_current_user)
):
    """Get user's connections"""
    # Build query
    query = {
        "$or": [
            {"sender_id": current_user.id},
            {"receiver_id": current_user.id}
        ]
    }
    
    if status:
        query["status"] = status
    
    # Get connections
    connections_cursor = db.connections.find(query, {"_id": 0})
    connections = await connections_cursor.to_list(length=100)
    
    # Get user details for each connection
    results = []
    for conn in connections:
        # Determine the other user
        other_user_id = conn["receiver_id"] if conn["sender_id"] == current_user.id else conn["sender_id"]
        
        # Get user info
        user_doc = await db.users.find_one({"id": other_user_id}, {"_id": 0, "password_hash": 0})
        if not user_doc:
            continue
        
        # Get profile
        profile_doc = await db.profiles.find_one({"user_id": other_user_id}, {"_id": 0})
        profile = profile_doc if profile_doc else {}
        
        # Convert datetime strings
        if isinstance(conn.get('created_at'), str):
            conn['created_at'] = datetime.fromisoformat(conn['created_at'])
        if isinstance(conn.get('updated_at'), str):
            conn['updated_at'] = datetime.fromisoformat(conn['updated_at'])
        
        connection_obj = Connection(**conn)
        
        user_result = UserSearchResult(
            id=user_doc["id"],
            full_name=user_doc["full_name"],
            email=user_doc["email"],
            role=user_doc["role"],
            college=user_doc["college"],
            graduation_year=user_doc.get("graduation_year"),
            department=user_doc.get("department"),
            headline=profile.get("headline"),
            profile_picture=profile.get("profile_picture"),
            skills=profile.get("skills", []),
            available_for_mentorship=profile.get("available_for_mentorship", False)
        )
        
        results.append(ConnectionWithUser(connection=connection_obj, user=user_result))
    
    return results

@api_router.get("/connections/requests/received", response_model=List[ConnectionWithUser])
async def get_received_requests(current_user: User = Depends(get_current_user)):
    """Get connection requests received by current user"""
    connections_cursor = db.connections.find({
        "receiver_id": current_user.id,
        "status": ConnectionStatus.PENDING
    }, {"_id": 0})
    connections = await connections_cursor.to_list(length=100)
    
    results = []
    for conn in connections:
        # Get sender info
        user_doc = await db.users.find_one({"id": conn["sender_id"]}, {"_id": 0, "password_hash": 0})
        if not user_doc:
            continue
        
        profile_doc = await db.profiles.find_one({"user_id": conn["sender_id"]}, {"_id": 0})
        profile = profile_doc if profile_doc else {}
        
        if isinstance(conn.get('created_at'), str):
            conn['created_at'] = datetime.fromisoformat(conn['created_at'])
        if isinstance(conn.get('updated_at'), str):
            conn['updated_at'] = datetime.fromisoformat(conn['updated_at'])
        
        connection_obj = Connection(**conn)
        
        user_result = UserSearchResult(
            id=user_doc["id"],
            full_name=user_doc["full_name"],
            email=user_doc["email"],
            role=user_doc["role"],
            college=user_doc["college"],
            graduation_year=user_doc.get("graduation_year"),
            department=user_doc.get("department"),
            headline=profile.get("headline"),
            profile_picture=profile.get("profile_picture"),
            skills=profile.get("skills", []),
            available_for_mentorship=profile.get("available_for_mentorship", False)
        )
        
        results.append(ConnectionWithUser(connection=connection_obj, user=user_result))
    
    return results

@api_router.get("/connections/requests/sent", response_model=List[ConnectionWithUser])
async def get_sent_requests(current_user: User = Depends(get_current_user)):
    """Get connection requests sent by current user"""
    connections_cursor = db.connections.find({
        "sender_id": current_user.id,
        "status": ConnectionStatus.PENDING
    }, {"_id": 0})
    connections = await connections_cursor.to_list(length=100)
    
    results = []
    for conn in connections:
        # Get receiver info
        user_doc = await db.users.find_one({"id": conn["receiver_id"]}, {"_id": 0, "password_hash": 0})
        if not user_doc:
            continue
        
        profile_doc = await db.profiles.find_one({"user_id": conn["receiver_id"]}, {"_id": 0})
        profile = profile_doc if profile_doc else {}
        
        if isinstance(conn.get('created_at'), str):
            conn['created_at'] = datetime.fromisoformat(conn['created_at'])
        if isinstance(conn.get('updated_at'), str):
            conn['updated_at'] = datetime.fromisoformat(conn['updated_at'])
        
        connection_obj = Connection(**conn)
        
        user_result = UserSearchResult(
            id=user_doc["id"],
            full_name=user_doc["full_name"],
            email=user_doc["email"],
            role=user_doc["role"],
            college=user_doc["college"],
            graduation_year=user_doc.get("graduation_year"),
            department=user_doc.get("department"),
            headline=profile.get("headline"),
            profile_picture=profile.get("profile_picture"),
            skills=profile.get("skills", []),
            available_for_mentorship=profile.get("available_for_mentorship", False)
        )
        
        results.append(ConnectionWithUser(connection=connection_obj, user=user_result))
    
    return results

@api_router.get("/connections/status/{user_id}")
async def get_connection_status(
    user_id: str,
    current_user: User = Depends(get_current_user)
):
    """Check connection status with a specific user"""
    if user_id == current_user.id:
        return {"status": "self"}
    
    # Check if connection exists
    conn = await db.connections.find_one({
        "$or": [
            {"sender_id": current_user.id, "receiver_id": user_id},
            {"sender_id": user_id, "receiver_id": current_user.id}
        ]
    }, {"_id": 0})
    
    if not conn:
        return {"status": "none", "connection": None}
    
    # Convert datetime strings
    if isinstance(conn.get('created_at'), str):
        conn['created_at'] = datetime.fromisoformat(conn['created_at'])
    if isinstance(conn.get('updated_at'), str):
        conn['updated_at'] = datetime.fromisoformat(conn['updated_at'])
    
    return {
        "status": conn["status"],
        "connection": Connection(**conn),
        "is_sender": conn["sender_id"] == current_user.id
    }

@api_router.get("/connections/suggestions", response_model=List[UserSearchResult])
async def get_connection_suggestions(
    limit: int = 10,
    current_user: User = Depends(get_current_user)
):
    """Get suggested connections based on college, department, and interests"""
    # Get current user's profile
    current_profile = await db.profiles.find_one({"user_id": current_user.id}, {"_id": 0})
    
    # Get existing connections
    connections_cursor = db.connections.find({
        "$or": [
            {"sender_id": current_user.id, "status": "accepted"},
            {"receiver_id": current_user.id, "status": "accepted"}
        ]
    }, {"_id": 0})
    connections = await connections_cursor.to_list(length=1000)
    connected_user_ids = set()
    for conn in connections:
        if conn["sender_id"] == current_user.id:
            connected_user_ids.add(conn["receiver_id"])
        else:
            connected_user_ids.add(conn["sender_id"])
    
    # Get pending requests
    pending_cursor = db.connections.find({
        "$or": [
            {"sender_id": current_user.id, "status": "pending"},
            {"receiver_id": current_user.id, "status": "pending"}
        ]
    }, {"_id": 0})
    pending = await pending_cursor.to_list(length=1000)
    for conn in pending:
        if conn["sender_id"] == current_user.id:
            connected_user_ids.add(conn["receiver_id"])
        else:
            connected_user_ids.add(conn["sender_id"])
    
    # Build suggestion query - same college or department
    suggestion_query = {
        "id": {"$ne": current_user.id, "$nin": list(connected_user_ids)},
        "$or": [
            {"college": current_user.college},
            {"department": current_user.department}
        ]
    }
    
    # Get suggested users
    users_cursor = db.users.find(suggestion_query, {"_id": 0, "password_hash": 0}).limit(limit)
    users = await users_cursor.to_list(length=limit)
    
    # Get profiles
    user_ids = [u["id"] for u in users]
    profiles_cursor = db.profiles.find({"user_id": {"$in": user_ids}}, {"_id": 0})
    profiles = await profiles_cursor.to_list(length=limit)
    profile_map = {p["user_id"]: p for p in profiles}
    
    # Build results
    results = []
    for user in users:
        profile = profile_map.get(user["id"], {})
        
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

# ============= MENTORSHIP MODELS =============

class MentorshipStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    COMPLETED = "completed"

class MentorshipRequest(BaseModel):
    mentor_id: str
    goals: str
    message: Optional[str] = None

class Mentorship(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    student_id: str
    mentor_id: str
    status: MentorshipStatus = MentorshipStatus.PENDING
    goals: str
    message: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class MentorshipWithUser(BaseModel):
    """Mentorship with user details"""
    mentorship: Mentorship
    user: UserSearchResult

# ============= MENTORSHIP ROUTES =============

@api_router.post("/mentorship/request", response_model=Mentorship)
async def send_mentorship_request(
    request: MentorshipRequest,
    current_user: User = Depends(get_current_user)
):
    """Send a mentorship request to a mentor"""
    # Only students can request mentorship
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(status_code=403, detail="Only students can request mentorship")
    
    # Check if mentor exists and is alumni
    mentor = await db.users.find_one({"id": request.mentor_id}, {"_id": 0})
    if not mentor:
        raise HTTPException(status_code=404, detail="Mentor not found")
    
    if mentor["role"] != UserRole.ALUMNI:
        raise HTTPException(status_code=400, detail="Mentorship can only be requested from alumni")
    
    # Check if mentor is available
    mentor_profile = await db.profiles.find_one({"user_id": request.mentor_id}, {"_id": 0})
    if not mentor_profile or not mentor_profile.get("available_for_mentorship", False):
        raise HTTPException(status_code=400, detail="This alumni is not available for mentorship")
    
    # Can't request mentorship from yourself
    if request.mentor_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot request mentorship from yourself")
    
    # Check if mentorship request already exists
    existing = await db.mentorships.find_one({
        "student_id": current_user.id,
        "mentor_id": request.mentor_id,
        "status": {"$in": ["pending", "accepted"]}
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="Mentorship request already exists")
    
    # Create mentorship request
    mentorship = Mentorship(
        student_id=current_user.id,
        mentor_id=request.mentor_id,
        goals=request.goals,
        message=request.message
    )
    
    doc = mentorship.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await db.mentorships.insert_one(doc)
    
    return mentorship

@api_router.put("/mentorship/{mentorship_id}/accept", response_model=Mentorship)
async def accept_mentorship(
    mentorship_id: str,
    current_user: User = Depends(get_current_user)
):
    """Accept a mentorship request"""
    mentorship_doc = await db.mentorships.find_one({"id": mentorship_id}, {"_id": 0})
    
    if not mentorship_doc:
        raise HTTPException(status_code=404, detail="Mentorship request not found")
    
    # Only mentor can accept
    if mentorship_doc["mentor_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="You can only accept mentorship requests sent to you")
    
    # Update status
    await db.mentorships.update_one(
        {"id": mentorship_id},
        {"$set": {
            "status": MentorshipStatus.ACCEPTED,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Get updated mentorship
    updated_doc = await db.mentorships.find_one({"id": mentorship_id}, {"_id": 0})
    if isinstance(updated_doc.get('created_at'), str):
        updated_doc['created_at'] = datetime.fromisoformat(updated_doc['created_at'])
    if isinstance(updated_doc.get('updated_at'), str):
        updated_doc['updated_at'] = datetime.fromisoformat(updated_doc['updated_at'])
    
    return Mentorship(**updated_doc)

@api_router.put("/mentorship/{mentorship_id}/reject", response_model=Mentorship)
async def reject_mentorship(
    mentorship_id: str,
    current_user: User = Depends(get_current_user)
):
    """Reject a mentorship request"""
    mentorship_doc = await db.mentorships.find_one({"id": mentorship_id}, {"_id": 0})
    
    if not mentorship_doc:
        raise HTTPException(status_code=404, detail="Mentorship request not found")
    
    # Only mentor can reject
    if mentorship_doc["mentor_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="You can only reject mentorship requests sent to you")
    
    # Update status
    await db.mentorships.update_one(
        {"id": mentorship_id},
        {"$set": {
            "status": MentorshipStatus.REJECTED,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Get updated mentorship
    updated_doc = await db.mentorships.find_one({"id": mentorship_id}, {"_id": 0})
    if isinstance(updated_doc.get('created_at'), str):
        updated_doc['created_at'] = datetime.fromisoformat(updated_doc['created_at'])
    if isinstance(updated_doc.get('updated_at'), str):
        updated_doc['updated_at'] = datetime.fromisoformat(updated_doc['updated_at'])
    
    return Mentorship(**updated_doc)

@api_router.put("/mentorship/{mentorship_id}/complete", response_model=Mentorship)
async def complete_mentorship(
    mentorship_id: str,
    current_user: User = Depends(get_current_user)
):
    """Mark mentorship as completed"""
    mentorship_doc = await db.mentorships.find_one({"id": mentorship_id}, {"_id": 0})
    
    if not mentorship_doc:
        raise HTTPException(status_code=404, detail="Mentorship not found")
    
    # Both student and mentor can mark as completed
    if mentorship_doc["student_id"] != current_user.id and mentorship_doc["mentor_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="You can only complete your own mentorships")
    
    # Update status
    await db.mentorships.update_one(
        {"id": mentorship_id},
        {"$set": {
            "status": MentorshipStatus.COMPLETED,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Get updated mentorship
    updated_doc = await db.mentorships.find_one({"id": mentorship_id}, {"_id": 0})
    if isinstance(updated_doc.get('created_at'), str):
        updated_doc['created_at'] = datetime.fromisoformat(updated_doc['created_at'])
    if isinstance(updated_doc.get('updated_at'), str):
        updated_doc['updated_at'] = datetime.fromisoformat(updated_doc['updated_at'])
    
    return Mentorship(**updated_doc)

@api_router.delete("/mentorship/{mentorship_id}")
async def cancel_mentorship(
    mentorship_id: str,
    current_user: User = Depends(get_current_user)
):
    """Cancel/remove a mentorship"""
    mentorship_doc = await db.mentorships.find_one({"id": mentorship_id}, {"_id": 0})
    
    if not mentorship_doc:
        raise HTTPException(status_code=404, detail="Mentorship not found")
    
    # Only participants can cancel
    if mentorship_doc["student_id"] != current_user.id and mentorship_doc["mentor_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="You can only cancel your own mentorships")
    
    await db.mentorships.delete_one({"id": mentorship_id})
    
    return {"message": "Mentorship cancelled"}

@api_router.get("/mentorship/requests/received", response_model=List[MentorshipWithUser])
async def get_received_mentorship_requests(current_user: User = Depends(get_current_user)):
    """Get mentorship requests received (for mentors)"""
    mentorships_cursor = db.mentorships.find({
        "mentor_id": current_user.id,
        "status": MentorshipStatus.PENDING
    }, {"_id": 0})
    mentorships = await mentorships_cursor.to_list(length=100)
    
    results = []
    for mentorship in mentorships:
        # Get student info
        user_doc = await db.users.find_one({"id": mentorship["student_id"]}, {"_id": 0, "password_hash": 0})
        if not user_doc:
            continue
        
        profile_doc = await db.profiles.find_one({"user_id": mentorship["student_id"]}, {"_id": 0})
        profile = profile_doc if profile_doc else {}
        
        if isinstance(mentorship.get('created_at'), str):
            mentorship['created_at'] = datetime.fromisoformat(mentorship['created_at'])
        if isinstance(mentorship.get('updated_at'), str):
            mentorship['updated_at'] = datetime.fromisoformat(mentorship['updated_at'])
        
        mentorship_obj = Mentorship(**mentorship)
        
        user_result = UserSearchResult(
            id=user_doc["id"],
            full_name=user_doc["full_name"],
            email=user_doc["email"],
            role=user_doc["role"],
            college=user_doc["college"],
            graduation_year=user_doc.get("graduation_year"),
            department=user_doc.get("department"),
            headline=profile.get("headline"),
            profile_picture=profile.get("profile_picture"),
            skills=profile.get("skills", []),
            available_for_mentorship=profile.get("available_for_mentorship", False)
        )
        
        results.append(MentorshipWithUser(mentorship=mentorship_obj, user=user_result))
    
    return results

@api_router.get("/mentorship/requests/sent", response_model=List[MentorshipWithUser])
async def get_sent_mentorship_requests(current_user: User = Depends(get_current_user)):
    """Get mentorship requests sent (for students)"""
    mentorships_cursor = db.mentorships.find({
        "student_id": current_user.id,
        "status": MentorshipStatus.PENDING
    }, {"_id": 0})
    mentorships = await mentorships_cursor.to_list(length=100)
    
    results = []
    for mentorship in mentorships:
        # Get mentor info
        user_doc = await db.users.find_one({"id": mentorship["mentor_id"]}, {"_id": 0, "password_hash": 0})
        if not user_doc:
            continue
        
        profile_doc = await db.profiles.find_one({"user_id": mentorship["mentor_id"]}, {"_id": 0})
        profile = profile_doc if profile_doc else {}
        
        if isinstance(mentorship.get('created_at'), str):
            mentorship['created_at'] = datetime.fromisoformat(mentorship['created_at'])
        if isinstance(mentorship.get('updated_at'), str):
            mentorship['updated_at'] = datetime.fromisoformat(mentorship['updated_at'])
        
        mentorship_obj = Mentorship(**mentorship)
        
        user_result = UserSearchResult(
            id=user_doc["id"],
            full_name=user_doc["full_name"],
            email=user_doc["email"],
            role=user_doc["role"],
            college=user_doc["college"],
            graduation_year=user_doc.get("graduation_year"),
            department=user_doc.get("department"),
            headline=profile.get("headline"),
            profile_picture=profile.get("profile_picture"),
            skills=profile.get("skills", []),
            available_for_mentorship=profile.get("available_for_mentorship", False)
        )
        
        results.append(MentorshipWithUser(mentorship=mentorship_obj, user=user_result))
    
    return results

@api_router.get("/mentorship/active", response_model=List[MentorshipWithUser])
async def get_active_mentorships(current_user: User = Depends(get_current_user)):
    """Get active mentorships (as mentor or mentee)"""
    mentorships_cursor = db.mentorships.find({
        "$or": [
            {"student_id": current_user.id},
            {"mentor_id": current_user.id}
        ],
        "status": MentorshipStatus.ACCEPTED
    }, {"_id": 0})
    mentorships = await mentorships_cursor.to_list(length=100)
    
    results = []
    for mentorship in mentorships:
        # Determine the other user
        other_user_id = mentorship["mentor_id"] if mentorship["student_id"] == current_user.id else mentorship["student_id"]
        
        # Get user info
        user_doc = await db.users.find_one({"id": other_user_id}, {"_id": 0, "password_hash": 0})
        if not user_doc:
            continue
        
        profile_doc = await db.profiles.find_one({"user_id": other_user_id}, {"_id": 0})
        profile = profile_doc if profile_doc else {}
        
        if isinstance(mentorship.get('created_at'), str):
            mentorship['created_at'] = datetime.fromisoformat(mentorship['created_at'])
        if isinstance(mentorship.get('updated_at'), str):
            mentorship['updated_at'] = datetime.fromisoformat(mentorship['updated_at'])
        
        mentorship_obj = Mentorship(**mentorship)
        
        user_result = UserSearchResult(
            id=user_doc["id"],
            full_name=user_doc["full_name"],
            email=user_doc["email"],
            role=user_doc["role"],
            college=user_doc["college"],
            graduation_year=user_doc.get("graduation_year"),
            department=user_doc.get("department"),
            headline=profile.get("headline"),
            profile_picture=profile.get("profile_picture"),
            skills=profile.get("skills", []),
            available_for_mentorship=profile.get("available_for_mentorship", False)
        )
        
        results.append(MentorshipWithUser(mentorship=mentorship_obj, user=user_result))
    
    return results

@api_router.get("/mentorship/find-mentors", response_model=List[UserSearchResult])
async def find_mentors(
    query: Optional[str] = None,
    college: Optional[str] = None,
    department: Optional[str] = None,
    skills: Optional[str] = None,
    limit: int = 20,
    current_user: User = Depends(get_current_user)
):
    """Find available mentors"""
    # Build search query for alumni only
    search_filter = {"role": UserRole.ALUMNI}
    
    if query:
        search_filter["$or"] = [
            {"full_name": {"$regex": query, "$options": "i"}},
            {"department": {"$regex": query, "$options": "i"}}
        ]
    
    if college:
        search_filter["college"] = {"$regex": college, "$options": "i"}
    
    if department:
        search_filter["department"] = {"$regex": department, "$options": "i"}
    
    # Get users
    users_cursor = db.users.find(search_filter, {"_id": 0, "password_hash": 0}).limit(limit)
    users = await users_cursor.to_list(length=limit)
    
    # Get profiles for these users (only those available for mentorship)
    user_ids = [u["id"] for u in users]
    profiles_cursor = db.profiles.find({
        "user_id": {"$in": user_ids},
        "available_for_mentorship": True
    }, {"_id": 0})
    profiles = await profiles_cursor.to_list(length=limit)
    
    # Create profile lookup
    profile_map = {p["user_id"]: p for p in profiles}
    
    # Build results (only include users available for mentorship)
    results = []
    for user in users:
        profile = profile_map.get(user["id"])
        if not profile:  # Skip if not available for mentorship
            continue
        
        # Apply skill filter if provided
        if skills and skills not in profile.get("skills", []):
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
            available_for_mentorship=True
        )
        results.append(result)
    
    return results

@api_router.get("/mentorship/status/{user_id}")
async def get_mentorship_status(
    user_id: str,
    current_user: User = Depends(get_current_user)
):
    """Check mentorship status with a specific user"""
    # Check if mentorship exists
    mentorship = await db.mentorships.find_one({
        "$or": [
            {"student_id": current_user.id, "mentor_id": user_id},
            {"student_id": user_id, "mentor_id": current_user.id}
        ],
        "status": {"$in": ["pending", "accepted"]}
    }, {"_id": 0})
    
    if not mentorship:
        return {"status": "none", "mentorship": None}
    
    # Convert datetime strings
    if isinstance(mentorship.get('created_at'), str):
        mentorship['created_at'] = datetime.fromisoformat(mentorship['created_at'])
    if isinstance(mentorship.get('updated_at'), str):
        mentorship['updated_at'] = datetime.fromisoformat(mentorship['updated_at'])
    
    return {
        "status": mentorship["status"],
        "mentorship": Mentorship(**mentorship),
        "is_student": mentorship["student_id"] == current_user.id
    }

# ============= JOB & APPLICATION MODELS =============

class JobType(str, Enum):
    FULL_TIME = "full-time"
    PART_TIME = "part-time"
    INTERNSHIP = "internship"
    CONTRACT = "contract"

class ApplicationStatus(str, Enum):
    APPLIED = "applied"
    UNDER_REVIEW = "under_review"
    SHORTLISTED = "shortlisted"
    REJECTED = "rejected"
    ACCEPTED = "accepted"

class JobCreate(BaseModel):
    title: str
    company: str
    location: str
    job_type: JobType
    description: str
    requirements: Optional[str] = None
    responsibilities: Optional[str] = None
    salary_range: Optional[str] = None
    experience_level: Optional[str] = None
    application_deadline: Optional[str] = None
    skills_required: List[str] = []
    category: Optional[str] = None

class Job(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    company: str
    location: str
    job_type: JobType
    description: str
    requirements: Optional[str] = None
    responsibilities: Optional[str] = None
    salary_range: Optional[str] = None
    experience_level: Optional[str] = None
    posted_by: str  # admin user id
    posted_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    application_deadline: Optional[str] = None
    is_active: bool = True
    skills_required: List[str] = []
    category: Optional[str] = None

class JobApplication(BaseModel):
    job_id: str
    cover_letter: str
    resume_url: Optional[str] = None

class Application(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    job_id: str
    applicant_id: str
    status: ApplicationStatus = ApplicationStatus.APPLIED
    cover_letter: str
    resume_url: Optional[str] = None
    applied_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ApplicationWithJob(BaseModel):
    """Application with job details"""
    application: Application
    job: Job

class ApplicationWithUser(BaseModel):
    """Application with applicant details"""
    application: Application
    user: UserSearchResult

# ============= JOB ROUTES =============

@api_router.post("/jobs", response_model=Job)
async def create_job(
    job_data: JobCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a job posting (admin only)"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Only admins can create job postings")
    
    # Create job
    job = Job(
        **job_data.model_dump(),
        posted_by=current_user.id
    )
    
    doc = job.model_dump()
    doc['posted_at'] = doc['posted_at'].isoformat()
    
    await db.jobs.insert_one(doc)
    
    return job

@api_router.put("/jobs/{job_id}", response_model=Job)
async def update_job(
    job_id: str,
    job_data: JobCreate,
    current_user: User = Depends(get_current_user)
):
    """Update a job posting (admin only)"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Only admins can update job postings")
    
    job_doc = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job_doc:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Update job
    update_data = job_data.model_dump()
    await db.jobs.update_one(
        {"id": job_id},
        {"$set": update_data}
    )
    
    # Get updated job
    updated_doc = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if isinstance(updated_doc.get('posted_at'), str):
        updated_doc['posted_at'] = datetime.fromisoformat(updated_doc['posted_at'])
    
    return Job(**updated_doc)

@api_router.delete("/jobs/{job_id}")
async def delete_job(
    job_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a job posting (admin only)"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Only admins can delete job postings")
    
    result = await db.jobs.delete_one({"id": job_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return {"message": "Job deleted successfully"}

@api_router.get("/jobs", response_model=List[Job])
async def get_jobs(
    job_type: Optional[JobType] = None,
    category: Optional[str] = None,
    location: Optional[str] = None,
    query: Optional[str] = None,
    limit: int = 50,
    current_user: User = Depends(get_current_user)
):
    """Get all active jobs with filters"""
    # Build query
    search_filter = {"is_active": True}
    
    if job_type:
        search_filter["job_type"] = job_type
    
    if category:
        search_filter["category"] = {"$regex": category, "$options": "i"}
    
    if location:
        search_filter["location"] = {"$regex": location, "$options": "i"}
    
    if query:
        search_filter["$or"] = [
            {"title": {"$regex": query, "$options": "i"}},
            {"company": {"$regex": query, "$options": "i"}},
            {"description": {"$regex": query, "$options": "i"}}
        ]
    
    # Get jobs
    jobs_cursor = db.jobs.find(search_filter, {"_id": 0}).limit(limit).sort("posted_at", -1)
    jobs = await jobs_cursor.to_list(length=limit)
    
    # Convert datetime strings
    for job in jobs:
        if isinstance(job.get('posted_at'), str):
            job['posted_at'] = datetime.fromisoformat(job['posted_at'])
    
    return [Job(**job) for job in jobs]

@api_router.get("/jobs/{job_id}", response_model=Job)
async def get_job(
    job_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get job details"""
    job_doc = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job_doc:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if isinstance(job_doc.get('posted_at'), str):
        job_doc['posted_at'] = datetime.fromisoformat(job_doc['posted_at'])
    
    return Job(**job_doc)

@api_router.post("/jobs/{job_id}/apply", response_model=Application)
async def apply_for_job(
    job_id: str,
    application_data: JobApplication,
    current_user: User = Depends(get_current_user)
):
    """Apply for a job"""
    # Check if job exists
    job_doc = await db.jobs.find_one({"id": job_id, "is_active": True}, {"_id": 0})
    if not job_doc:
        raise HTTPException(status_code=404, detail="Job not found or inactive")
    
    # Check if already applied
    existing = await db.applications.find_one({
        "job_id": job_id,
        "applicant_id": current_user.id
    })
    if existing:
        raise HTTPException(status_code=400, detail="You have already applied for this job")
    
    # Create application
    application = Application(
        job_id=job_id,
        applicant_id=current_user.id,
        cover_letter=application_data.cover_letter,
        resume_url=application_data.resume_url
    )
    
    doc = application.model_dump()
    doc['applied_at'] = doc['applied_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await db.applications.insert_one(doc)
    
    return application

@api_router.get("/applications/my", response_model=List[ApplicationWithJob])
async def get_my_applications(current_user: User = Depends(get_current_user)):
    """Get user's job applications"""
    applications_cursor = db.applications.find(
        {"applicant_id": current_user.id},
        {"_id": 0}
    ).sort("applied_at", -1)
    applications = await applications_cursor.to_list(length=100)
    
    results = []
    for app in applications:
        # Get job details
        job_doc = await db.jobs.find_one({"id": app["job_id"]}, {"_id": 0})
        if not job_doc:
            continue
        
        # Convert datetime strings
        if isinstance(app.get('applied_at'), str):
            app['applied_at'] = datetime.fromisoformat(app['applied_at'])
        if isinstance(app.get('updated_at'), str):
            app['updated_at'] = datetime.fromisoformat(app['updated_at'])
        
        if isinstance(job_doc.get('posted_at'), str):
            job_doc['posted_at'] = datetime.fromisoformat(job_doc['posted_at'])
        
        application_obj = Application(**app)
        job_obj = Job(**job_doc)
        
        results.append(ApplicationWithJob(application=application_obj, job=job_obj))
    
    return results

@api_router.get("/jobs/{job_id}/applications", response_model=List[ApplicationWithUser])
async def get_job_applications(
    job_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get applications for a job (admin only)"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Only admins can view job applications")
    
    applications_cursor = db.applications.find(
        {"job_id": job_id},
        {"_id": 0}
    ).sort("applied_at", -1)
    applications = await applications_cursor.to_list(length=100)
    
    results = []
    for app in applications:
        # Get applicant details
        user_doc = await db.users.find_one({"id": app["applicant_id"]}, {"_id": 0, "password_hash": 0})
        if not user_doc:
            continue
        
        profile_doc = await db.profiles.find_one({"user_id": app["applicant_id"]}, {"_id": 0})
        profile = profile_doc if profile_doc else {}
        
        # Convert datetime strings
        if isinstance(app.get('applied_at'), str):
            app['applied_at'] = datetime.fromisoformat(app['applied_at'])
        if isinstance(app.get('updated_at'), str):
            app['updated_at'] = datetime.fromisoformat(app['updated_at'])
        
        application_obj = Application(**app)
        
        user_result = UserSearchResult(
            id=user_doc["id"],
            full_name=user_doc["full_name"],
            email=user_doc["email"],
            role=user_doc["role"],
            college=user_doc["college"],
            graduation_year=user_doc.get("graduation_year"),
            department=user_doc.get("department"),
            headline=profile.get("headline"),
            profile_picture=profile.get("profile_picture"),
            skills=profile.get("skills", []),
            available_for_mentorship=profile.get("available_for_mentorship", False)
        )
        
        results.append(ApplicationWithUser(application=application_obj, user=user_result))
    
    return results

@api_router.put("/applications/{application_id}/status")
async def update_application_status(
    application_id: str,
    status: ApplicationStatus,
    current_user: User = Depends(get_current_user)
):
    """Update application status (admin only)"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Only admins can update application status")
    
    result = await db.applications.update_one(
        {"id": application_id},
        {"$set": {
            "status": status,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Application not found")
    
    return {"message": "Application status updated"}

# ============= CONTENT & COMMUNITY MODELS =============

class PostType(str, Enum):
    BLOG = "blog"
    DISCUSSION = "discussion"
    ACHIEVEMENT = "achievement"

class PostVisibility(str, Enum):
    PUBLIC = "public"
    CONNECTIONS = "connections"
    PRIVATE = "private"

class PostCreate(BaseModel):
    title: str
    content: str
    post_type: PostType
    tags: List[str] = []
    visibility: PostVisibility = PostVisibility.PUBLIC

class Post(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    author_id: str
    title: str
    content: str
    post_type: PostType
    tags: List[str] = []
    visibility: PostVisibility = PostVisibility.PUBLIC
    like_count: int = 0
    comment_count: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PostWithAuthor(BaseModel):
    """Post with author details"""
    post: Post
    author: UserSearchResult
    is_liked: bool = False
    is_bookmarked: bool = False

class CommentCreate(BaseModel):
    content: str

class Comment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    post_id: str
    author_id: str
    content: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CommentWithAuthor(BaseModel):
    """Comment with author details"""
    comment: Comment
    author: UserSearchResult

# ============= CONTENT ROUTES =============

@api_router.post("/posts", response_model=Post)
async def create_post(
    post_data: PostCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new post"""
    post = Post(
        **post_data.model_dump(),
        author_id=current_user.id
    )
    
    doc = post.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await db.posts.insert_one(doc)
    
    return post

@api_router.put("/posts/{post_id}", response_model=Post)
async def update_post(
    post_id: str,
    post_data: PostCreate,
    current_user: User = Depends(get_current_user)
):
    """Update a post"""
    post_doc = await db.posts.find_one({"id": post_id}, {"_id": 0})
    if not post_doc:
        raise HTTPException(status_code=404, detail="Post not found")
    
    if post_doc["author_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="You can only edit your own posts")
    
    update_data = post_data.model_dump()
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.posts.update_one({"id": post_id}, {"$set": update_data})
    
    updated_doc = await db.posts.find_one({"id": post_id}, {"_id": 0})
    if isinstance(updated_doc.get('created_at'), str):
        updated_doc['created_at'] = datetime.fromisoformat(updated_doc['created_at'])
    if isinstance(updated_doc.get('updated_at'), str):
        updated_doc['updated_at'] = datetime.fromisoformat(updated_doc['updated_at'])
    
    return Post(**updated_doc)

@api_router.delete("/posts/{post_id}")
async def delete_post(
    post_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a post"""
    post_doc = await db.posts.find_one({"id": post_id}, {"_id": 0})
    if not post_doc:
        raise HTTPException(status_code=404, detail="Post not found")
    
    if post_doc["author_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="You can only delete your own posts")
    
    await db.posts.delete_one({"id": post_id})
    await db.comments.delete_many({"post_id": post_id})
    await db.likes.delete_many({"post_id": post_id})
    await db.bookmarks.delete_many({"post_id": post_id})
    
    return {"message": "Post deleted"}

@api_router.get("/posts/feed", response_model=List[PostWithAuthor])
async def get_feed(
    post_type: Optional[PostType] = None,
    tags: Optional[str] = None,
    limit: int = 50,
    current_user: User = Depends(get_current_user)
):
    """Get posts feed"""
    search_filter = {"visibility": {"$in": ["public", "connections"]}}
    
    if post_type:
        search_filter["post_type"] = post_type
    
    if tags:
        search_filter["tags"] = {"$in": [tags]}
    
    posts_cursor = db.posts.find(search_filter, {"_id": 0}).limit(limit).sort("created_at", -1)
    posts = await posts_cursor.to_list(length=limit)
    
    results = []
    for post in posts:
        author_doc = await db.users.find_one({"id": post["author_id"]}, {"_id": 0, "password_hash": 0})
        if not author_doc:
            continue
        
        profile_doc = await db.profiles.find_one({"user_id": post["author_id"]}, {"_id": 0})
        profile = profile_doc if profile_doc else {}
        
        if isinstance(post.get('created_at'), str):
            post['created_at'] = datetime.fromisoformat(post['created_at'])
        if isinstance(post.get('updated_at'), str):
            post['updated_at'] = datetime.fromisoformat(post['updated_at'])
        
        post_obj = Post(**post)
        
        author = UserSearchResult(
            id=author_doc["id"],
            full_name=author_doc["full_name"],
            email=author_doc["email"],
            role=author_doc["role"],
            college=author_doc["college"],
            graduation_year=author_doc.get("graduation_year"),
            department=author_doc.get("department"),
            headline=profile.get("headline"),
            profile_picture=profile.get("profile_picture"),
            skills=profile.get("skills", []),
            available_for_mentorship=profile.get("available_for_mentorship", False)
        )
        
        is_liked = await db.likes.find_one({"post_id": post["id"], "user_id": current_user.id}) is not None
        is_bookmarked = await db.bookmarks.find_one({"post_id": post["id"], "user_id": current_user.id}) is not None
        
        results.append(PostWithAuthor(post=post_obj, author=author, is_liked=is_liked, is_bookmarked=is_bookmarked))
    
    return results

@api_router.get("/posts/{post_id}", response_model=PostWithAuthor)
async def get_post(
    post_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get post details"""
    post_doc = await db.posts.find_one({"id": post_id}, {"_id": 0})
    if not post_doc:
        raise HTTPException(status_code=404, detail="Post not found")
    
    author_doc = await db.users.find_one({"id": post_doc["author_id"]}, {"_id": 0, "password_hash": 0})
    profile_doc = await db.profiles.find_one({"user_id": post_doc["author_id"]}, {"_id": 0})
    profile = profile_doc if profile_doc else {}
    
    if isinstance(post_doc.get('created_at'), str):
        post_doc['created_at'] = datetime.fromisoformat(post_doc['created_at'])
    if isinstance(post_doc.get('updated_at'), str):
        post_doc['updated_at'] = datetime.fromisoformat(post_doc['updated_at'])
    
    post_obj = Post(**post_doc)
    
    author = UserSearchResult(
        id=author_doc["id"],
        full_name=author_doc["full_name"],
        email=author_doc["email"],
        role=author_doc["role"],
        college=author_doc["college"],
        graduation_year=author_doc.get("graduation_year"),
        department=author_doc.get("department"),
        headline=profile.get("headline"),
        profile_picture=profile.get("profile_picture"),
        skills=profile.get("skills", []),
        available_for_mentorship=profile.get("available_for_mentorship", False)
    )
    
    is_liked = await db.likes.find_one({"post_id": post_id, "user_id": current_user.id}) is not None
    is_bookmarked = await db.bookmarks.find_one({"post_id": post_id, "user_id": current_user.id}) is not None
    
    return PostWithAuthor(post=post_obj, author=author, is_liked=is_liked, is_bookmarked=is_bookmarked)

@api_router.post("/posts/{post_id}/like")
async def toggle_like(
    post_id: str,
    current_user: User = Depends(get_current_user)
):
    """Toggle like on a post"""
    existing = await db.likes.find_one({"post_id": post_id, "user_id": current_user.id})
    
    if existing:
        await db.likes.delete_one({"post_id": post_id, "user_id": current_user.id})
        await db.posts.update_one({"id": post_id}, {"$inc": {"like_count": -1}})
        return {"liked": False, "message": "Post unliked"}
    else:
        like_doc = {
            "id": str(uuid.uuid4()),
            "post_id": post_id,
            "user_id": current_user.id,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.likes.insert_one(like_doc)
        await db.posts.update_one({"id": post_id}, {"$inc": {"like_count": 1}})
        return {"liked": True, "message": "Post liked"}

@api_router.post("/posts/{post_id}/comment", response_model=Comment)
async def add_comment(
    post_id: str,
    comment_data: CommentCreate,
    current_user: User = Depends(get_current_user)
):
    """Add a comment to a post"""
    post = await db.posts.find_one({"id": post_id})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    comment = Comment(
        post_id=post_id,
        author_id=current_user.id,
        content=comment_data.content
    )
    
    doc = comment.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await db.comments.insert_one(doc)
    await db.posts.update_one({"id": post_id}, {"$inc": {"comment_count": 1}})
    
    return comment

@api_router.get("/posts/{post_id}/comments", response_model=List[CommentWithAuthor])
async def get_comments(
    post_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get comments for a post"""
    comments_cursor = db.comments.find({"post_id": post_id}, {"_id": 0}).sort("created_at", -1)
    comments = await comments_cursor.to_list(length=100)
    
    results = []
    for comment in comments:
        author_doc = await db.users.find_one({"id": comment["author_id"]}, {"_id": 0, "password_hash": 0})
        if not author_doc:
            continue
        
        profile_doc = await db.profiles.find_one({"user_id": comment["author_id"]}, {"_id": 0})
        profile = profile_doc if profile_doc else {}
        
        if isinstance(comment.get('created_at'), str):
            comment['created_at'] = datetime.fromisoformat(comment['created_at'])
        if isinstance(comment.get('updated_at'), str):
            comment['updated_at'] = datetime.fromisoformat(comment['updated_at'])
        
        comment_obj = Comment(**comment)
        
        author = UserSearchResult(
            id=author_doc["id"],
            full_name=author_doc["full_name"],
            email=author_doc["email"],
            role=author_doc["role"],
            college=author_doc["college"],
            graduation_year=author_doc.get("graduation_year"),
            department=author_doc.get("department"),
            headline=profile.get("headline"),
            profile_picture=profile.get("profile_picture"),
            skills=profile.get("skills", []),
            available_for_mentorship=profile.get("available_for_mentorship", False)
        )
        
        results.append(CommentWithAuthor(comment=comment_obj, author=author))
    
    return results

@api_router.post("/posts/{post_id}/bookmark")
async def toggle_bookmark(
    post_id: str,
    current_user: User = Depends(get_current_user)
):
    """Toggle bookmark on a post"""
    existing = await db.bookmarks.find_one({"post_id": post_id, "user_id": current_user.id})
    
    if existing:
        await db.bookmarks.delete_one({"post_id": post_id, "user_id": current_user.id})
        return {"bookmarked": False, "message": "Bookmark removed"}
    else:
        bookmark_doc = {
            "id": str(uuid.uuid4()),
            "post_id": post_id,
            "user_id": current_user.id,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.bookmarks.insert_one(bookmark_doc)
        return {"bookmarked": True, "message": "Post bookmarked"}

@api_router.get("/posts/my/all", response_model=List[PostWithAuthor])
async def get_my_posts(current_user: User = Depends(get_current_user)):
    """Get current user's posts"""
    posts_cursor = db.posts.find({"author_id": current_user.id}, {"_id": 0}).sort("created_at", -1)
    posts = await posts_cursor.to_list(length=100)
    
    profile_doc = await db.profiles.find_one({"user_id": current_user.id}, {"_id": 0})
    profile = profile_doc if profile_doc else {}
    
    author = UserSearchResult(
        id=current_user.id,
        full_name=current_user.full_name,
        email=current_user.email,
        role=current_user.role,
        college=current_user.college,
        graduation_year=current_user.graduation_year,
        department=current_user.department,
        headline=profile.get("headline"),
        profile_picture=profile.get("profile_picture"),
        skills=profile.get("skills", []),
        available_for_mentorship=profile.get("available_for_mentorship", False)
    )
    
    results = []
    for post in posts:
        if isinstance(post.get('created_at'), str):
            post['created_at'] = datetime.fromisoformat(post['created_at'])
        if isinstance(post.get('updated_at'), str):
            post['updated_at'] = datetime.fromisoformat(post['updated_at'])
        
        post_obj = Post(**post)
        is_liked = await db.likes.find_one({"post_id": post["id"], "user_id": current_user.id}) is not None
        is_bookmarked = await db.bookmarks.find_one({"post_id": post["id"], "user_id": current_user.id}) is not None
        
        results.append(PostWithAuthor(post=post_obj, author=author, is_liked=is_liked, is_bookmarked=is_bookmarked))
    
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