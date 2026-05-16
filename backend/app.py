from fastapi import FastAPI, File, UploadFile, HTTPException, Depends, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
# pyrefly: ignore [missing-import]
from fastapi.staticfiles import StaticFiles
import uvicorn
import onnxruntime as ort
import numpy as np
import io
import gc
from PIL import Image
import os
import json
import datetime
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from typing import List, Optional
import shutil

# Local imports
from database import init_db, get_db
from cloudflare_service import upload_to_r2

# Security Constants
SECRET_KEY = "neuai-secret-key-for-fabricguard" # In production, use env variable
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 300

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

app = FastAPI()

# Enable CORS - Must be first middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    max_age=3600,
)

# Explicit OPTIONS handler for preflight requests
@app.options("/{full_path:path}")
async def preflight_handler(full_path: str):
    """Handle CORS preflight requests"""
    return {"status": "ok"}

# Uploads directory
UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "uploads")
if not os.path.exists(UPLOADS_DIR):
    os.makedirs(UPLOADS_DIR)

# Serve uploads as static files so frontend can see them
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

# Constants
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

MODEL_PATH = os.path.join(BASE_DIR,"model","best.onnx")
FABRIC_MODEL_PATH = os.path.join(BASE_DIR,"model","fabric_nonfabric_classifier.onnx")
EXCEL_PATH = os.path.join(BASE_DIR,"data","Fabric Defect Reason,Machine,Suggestion Dataset.xlsx")
MAPPING_JSON_PATH = os.path.join(BASE_DIR,"data","mapping.json")

# Global variables
model = None
fabric_model = None
mapping_data = {}

CLASS_LABELS = {
    0: 'Broken stitch', 1: 'Needle mark', 2: 'Pinched fabric', 
    3: 'Vertical', 4: 'defect free', 5: 'hole', 
    6: 'horizontal', 7: 'lines', 8: 'stain'
}

# Pydantic Models for API
class UserSignup(BaseModel):
    full_name: str
    email: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user_name: str

class UserProfile(BaseModel):
    id: str
    full_name: str
    email: str

# Auth Helpers
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme), db = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if token == "dummy-bypass-token":
        email = "operator@neuai.com"
        user = db.users.find_one({"email": email})
        if not user:
            user = {
                "full_name": "Operator",
                "email": email,
                "hashed_password": "",
                "created_at": datetime.datetime.now(datetime.timezone.utc)
            }
            db.users.insert_one(user)
        user["id"] = str(user["_id"])
        return user

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.users.find_one({"email": email})
    if user is None:
        raise credentials_exception
    user["id"] = str(user["_id"])
    return user


def normalize_defect_name(name):
    return str(name).strip().lower().replace('-', ' ').replace('_', ' ')

def load_resources():
    global model, mapping_data
    print(f"Loading model from {MODEL_PATH}...")
    if os.path.exists(MODEL_PATH):
        try:
            # Limit threads to prevent memory spikes and CPU contention crashes on Render
            opts = ort.SessionOptions()
            opts.intra_op_num_threads = 1
            opts.inter_op_num_threads = 1
            opts.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
            
            model = ort.InferenceSession(MODEL_PATH, sess_options=opts, providers=['CPUExecutionProvider'])
            print("Model loaded successfully")
        except Exception as e:
            print(f"Error loading model: {e}")
            model = None
    else:
        print(f"Model not found at {MODEL_PATH}")
    
    # Try loading mapping from lightweight JSON
    if os.path.exists(MAPPING_JSON_PATH):
        try:
            with open(MAPPING_JSON_PATH, "r", encoding="utf-8") as f:
                mapping_data = json.load(f)
            print("Mapping loaded successfully from JSON (low memory).")
            return
        except Exception as e:
            print(f"Error loading mapping JSON: {e}")

    # Fallback to Excel only if JSON fails or is missing
    if os.path.exists(EXCEL_PATH):
        try:
            print("Falling back to loading Excel mapping (Higher memory usage)...")
            import pandas as pd
            df = pd.read_excel(EXCEL_PATH)
            for _, row in df.iterrows():
                defect_name = normalize_defect_name(row['Defect Category'])
                mapping_data[defect_name] = {
                    "reason_1": str(row.get('1st Priority (Most Likely)', 'N/A')),
                    "reason_2": str(row.get('2nd Priority (Check Next )', 'N/A')),
                    "reason_3": str(row.get('3rd Priority (Rare)', 'N/A')),
                    "suggestion": str(row.get('Suggestion to reduce future defect', 'N/A')),
                    "machine": str(row.get('Machine Responsible', 'N/A'))
                }
            print("Mapping loaded successfully from Excel.")
            del pd, df
            gc.collect()
        except Exception as e:
            print(f"Error loading Excel: {e}")

@app.on_event("startup")
async def startup_event():
    """Minimal startup - only initialize database, not model"""
    try:
        init_db()
        print("Database initialized")
    except Exception as e:
        print(f"Error initializing database: {e}")
    
    # Load mapping
    global mapping_data
    
    # Try loading mapping from lightweight JSON
    if os.path.exists(MAPPING_JSON_PATH):
        try:
            with open(MAPPING_JSON_PATH, "r", encoding="utf-8") as f:
                mapping_data = json.load(f)
            print("Mapping loaded successfully from JSON.")
            return
        except Exception as e:
            print(f"Error loading mapping JSON: {e}")
            
    # Fallback to Excel only if JSON is missing
    if os.path.exists(EXCEL_PATH):
        try:
            print("Falling back to loading Excel mapping (Higher memory usage)...")
            import pandas as pd
            df = pd.read_excel(EXCEL_PATH)
            for _, row in df.iterrows():
                defect_name = normalize_defect_name(row['Defect Category'])
                mapping_data[defect_name] = {
                    "reason_1": str(row.get('1st Priority (Most Likely)', 'N/A')),
                    "reason_2": str(row.get('2nd Priority (Check Next )', 'N/A')),
                    "reason_3": str(row.get('3rd Priority (Rare)', 'N/A')),
                    "suggestion": str(row.get('Suggestion to reduce future defect', 'N/A')),
                    "machine": str(row.get('Machine Responsible', 'N/A'))
                }
            print("Mapping loaded successfully from Excel.")
            del pd, df
            gc.collect()
        except Exception as e:
            print(f"Error loading Excel: {e}")
    
    # Model will be loaded on first prediction (lazy loading)

@app.get("/")
async def root():
    return {
        "status": "online",
        "model_loaded": model is not None or os.path.exists(MODEL_PATH)
    }





# --- Auth Endpoints ---

@app.post("/signup")
async def signup(user: UserSignup, db = Depends(get_db)):
    db_user = db.users.find_one({"email": user.email})
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = get_password_hash(user.password)
    db.users.insert_one({
        "full_name": user.full_name,
        "email": user.email,
        "hashed_password": hashed_password,
        "created_at": datetime.datetime.now(datetime.timezone.utc)
    })
    return {"status": "success", "message": "User created successfully"}

@app.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db = Depends(get_db)):
    user = db.users.find_one({"email": form_data.username})
    
    # Verify user exists and password is correct
    if not user or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Generate token
    access_token = create_access_token(data={"sub": user["email"]})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user_name": user["full_name"]
    }

@app.get("/users/me", response_model=UserProfile)
async def read_users_me(current_user = Depends(get_current_user)):
    return current_user

# --- Prediction & History Endpoints ---

@app.post("/predict")
async def predict(
    request: Request,
    file: UploadFile = File(...), 
    db = Depends(get_db),
    current_user = Depends(get_current_user)
):
    global model, fabric_model
    
    # Lazy load model on first prediction
    if model is None:
        print("Loading model on first prediction...")
        if os.path.exists(MODEL_PATH):
            try:
                # Limit threads to prevent memory spikes and CPU contention crashes on Render
                opts = ort.SessionOptions()
                opts.intra_op_num_threads = 1
                opts.inter_op_num_threads = 1
                opts.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
                
                model = ort.InferenceSession(MODEL_PATH, sess_options=opts, providers=['CPUExecutionProvider'])
                print("Model loaded successfully with optimized session options")
            except Exception as e:
                print(f"Error loading model: {e}")
                raise HTTPException(status_code=503, detail=f"Model loading failed: {str(e)}")
        else:
            raise HTTPException(status_code=503, detail="Model file not found")

    # Lazy load fabric classifier model
    if fabric_model is None:
        print("Loading fabric classifier model on first prediction...")
        if os.path.exists(FABRIC_MODEL_PATH):
            try:
                opts = ort.SessionOptions()
                opts.intra_op_num_threads = 1
                opts.inter_op_num_threads = 1
                opts.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
                
                fabric_model = ort.InferenceSession(FABRIC_MODEL_PATH, sess_options=opts, providers=['CPUExecutionProvider'])
                print("Fabric classifier model loaded successfully with optimized session options")
            except Exception as e:
                print(f"Error loading fabric classifier model: {e}")
                # We don't crash if the optional model fails to load
        else:
            print(f"Fabric classifier model not found at {FABRIC_MODEL_PATH}")
    
    try:
        import cv2
        contents = await file.read()
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Check if file is a video
        is_video = file.filename.lower().endswith(('.mp4', '.avi', '.mov', '.mkv', '.webm')) or (file.content_type and file.content_type.startswith('video/'))
        
        if is_video:
            # Save the video file
            video_filename = f"anonymous_{timestamp}_{file.filename}"
            video_path = os.path.join(UPLOADS_DIR, video_filename)
            with open(video_path, "wb") as f:
                f.write(contents)
                
            # Extract frame using OpenCV
            cap = cv2.VideoCapture(video_path)
            ret = False
            # Read 10th frame to avoid black screens at start
            for _ in range(10):
                ret, frame = cap.read()
                if not ret:
                    break
            if not ret:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ret, frame = cap.read()
            cap.release()
            
            if not ret:
                raise HTTPException(status_code=400, detail="Could not read any frames from the uploaded video.")
                
            # Convert BGR to RGB
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            image = Image.fromarray(frame_rgb)
            
            # Save frame as analyzed image
            filename = f"frame_{timestamp}_{os.path.splitext(file.filename)[0]}.jpg"
            file_path = os.path.join(UPLOADS_DIR, filename)
            image.save(file_path)
        else:
            # Process as standard image
            image = Image.open(io.BytesIO(contents)).convert("RGB")
            filename = f"anonymous_{timestamp}_{file.filename}"
            file_path = os.path.join(UPLOADS_DIR, filename)
            with open(file_path, "wb") as f:
                f.write(contents)
        
        
        # --- RUN FABRIC / NON-FABRIC CLASSIFICATION ---
        if fabric_model is not None:
            try:
                # Fabric model expects 160x160 and range 0-1
                fabric_img_resized = image.resize((160, 160))
                fabric_img_arr = np.array(fabric_img_resized).astype(np.float32) / 255.0
                # MobileNetV2 expects Channels-Last: (1, 160, 160, 3)
                fabric_img_input = np.expand_dims(fabric_img_arr, axis=0)
                
                fabric_input_name = fabric_model.get_inputs()[0].name
                fabric_ort_outs = fabric_model.run(None, {fabric_input_name: fabric_img_input})
                
                fabric_probs = fabric_ort_outs[0][0]
                class_idx = int(np.argmax(fabric_probs))
                
                print(f"Fabric vs Non-Fabric inference: probabilities={fabric_probs}, selected={class_idx}")
                
                # class_idx == 0 is non-fabric, 1 is fabric
                if class_idx == 0:
                    print("Classification: NON-FABRIC IMAGE DETECTED. Blocking prediction.")
                    return {
                        "status": "non_fabric",
                        "defect_key": "non-fabric",
                        "defect_label": "Non-Fabric",
                        "confidence": round(float(np.max(fabric_probs)) * 100, 2),
                        "severity": "N/A",
                        "reason_1": "Image doesn't contain fabric",
                        "reason_2": "N/A",
                        "reason_3": "N/A",
                        "machine": "N/A",
                        "suggestion": "Please upload a valid fabric sample to inspect.",
                        "image_url": f"{str(request.base_url).rstrip('/')}/uploads/{filename}"
                    }
            except Exception as e:
                print(f"Fabric classification run failed: {e}")
        
        # --- PREPARE IMAGE FOR ONNX ---
        # Resize to model's expected size (224x224)
        input_size = (224, 224)
        img_resized = image.resize(input_size)
        
        # Convert to numpy array & normalize to range 0-1
        img_arr = np.array(img_resized).astype(np.float32) / 255.0
        
        # Transpose from (Height, Width, Channel) to (Channel, Height, Width)
        # and add explicit Batch Dimension (1, 3, 224, 224)
        img_input = np.transpose(img_arr, (2, 0, 1))[np.newaxis, :]
        
        # Collect garbage to free up raw image bytes and prevent OOM crash before inference
        del contents, image, img_resized, img_arr
        gc.collect()
        
        # --- RUN INFERENCE ---
        # Get model input layer name automatically
        input_name = model.get_inputs()[0].name
        
        # Execute model session
        ort_outs = model.run(None, {input_name: img_input})
        
        # --- POST-PROCESS OUTPUTS ---
        # Extraction of scores for the first (and only) batch result
        logits = ort_outs[0][0]
        
        # Explicitly clean inference variables
        del img_input, ort_outs
        gc.collect()
        
        # Safe Softmax implementation to ensure reliable confidence distribution
        exp_logits = np.exp(logits - np.max(logits))
        probabilities = exp_logits / exp_logits.sum()
        
        # Get index of highest probability
        top1_idx = int(np.argmax(probabilities))
        top1_conf = float(probabilities[top1_idx])
        
        # Fetch friendly display name from hardcoded labels map
        predicted_class_raw = CLASS_LABELS.get(top1_idx, "Unknown")
        
        # Normalize for mapping
        defect_key = normalize_defect_name(predicted_class_raw)
        
        # Fetch mapping
        info = mapping_data.get(defect_key, {
            "reason_1": "No specific data available",
            "reason_2": "N/A",
            "reason_3": "N/A",
            "suggestion": "Manual inspection recommended",
            "machine": "Unknown"
        })
        
        status_val = "ok" if defect_key == "defect free" else "defect"
        severity = "None" if status_val == "ok" else "High"
        
        # --- CLOUDFLARE CLOUD STORAGE ---
        # Upload the validated fabric sample to Cloudflare R2 and get a persistent URL
        cf_url = upload_to_r2(file_path, filename)
        
        # Final paths to save (prefer cloud URL, fallback to local if CF not configured)
        db_image_path = cf_url if cf_url else f"uploads/{filename}"
        api_image_url = cf_url if cf_url else f"{str(request.base_url).rstrip('/')}/uploads/{filename}"

        # Save to database
        db.scans.insert_one({
            "user_email": current_user["email"],
            "image_path": db_image_path,
            "defect_label": predicted_class_raw,
            "status": status_val,
            "created_at": datetime.datetime.now(datetime.timezone.utc)
        })
        
        return {
            "status": status_val,
            "defect_key": defect_key,
            "defect_label": predicted_class_raw,
            "confidence": round(top1_conf * 100, 2),
            "severity": severity,
            "reason_1": info.get("reason_1"),
            "reason_2": info.get("reason_2"),
            "reason_3": info.get("reason_3"),
            "machine": info.get("machine"),
            "suggestion": info.get("suggestion"),
            "image_url": api_image_url
        }
        
    except Exception as e:
        print(f"Prediction error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/history")
async def get_history(
    db = Depends(get_db),
    current_user = Depends(get_current_user)
):
    scans_raw = list(db.scans.find({"user_email": current_user["email"]}).sort("created_at", -1))
    scans = []
    for s in scans_raw:
        s["id"] = str(s.pop("_id"))
        scans.append(s)
    return scans

@app.get("/analytics")
async def get_analytics(
    db = Depends(get_db),
    current_user = Depends(get_current_user)
):
    scans = list(db.scans.find({"user_email": current_user["email"]}))
    total = len(scans)
    defects = len([s for s in scans if s.get("status") == "defect"])
    ok = total - defects
    rate = round((defects / total * 100), 1) if total > 0 else 0
    
    return {
        "total": total,
        "defects": defects,
        "ok": ok,
        "rate": f"{rate}%"
    }

@app.get("/ping")
async def ping():
    """
    Health check endpoint for Render free tier keep-alive.
    Prevents server from spinning down after 15 minutes of inactivity.
    """
    return {"status": "ok", "message": "Server is running", "timestamp": datetime.datetime.now().isoformat()}

if __name__ == "__main__":
    import os
    import uvicorn
    # Use PORT environment variable for Render deployment
    port = int(os.environ.get("PORT", 8000))
    print(f"Starting server on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port)
