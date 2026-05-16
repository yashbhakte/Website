import os
import logging
import boto3
from botocore.config import Config
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("uvicorn.error")

# Load cloudflare credentials from environment variables
CLOUDFLARE_ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID", "")
CLOUDFLARE_R2_ACCESS_KEY_ID = os.getenv("CLOUDFLARE_R2_ACCESS_KEY_ID", "")
CLOUDFLARE_R2_SECRET_ACCESS_KEY = os.getenv("CLOUDFLARE_R2_SECRET_ACCESS_KEY", "")
CLOUDFLARE_R2_BUCKET_NAME = os.getenv("CLOUDFLARE_R2_BUCKET_NAME", "")
CLOUDFLARE_R2_PUBLIC_URL = os.getenv("CLOUDFLARE_R2_PUBLIC_URL", "").rstrip("/")

def is_cloudflare_configured() -> bool:
    """Check if all required Cloudflare R2 configuration keys exist in .env"""
    return all([
        CLOUDFLARE_ACCOUNT_ID,
        CLOUDFLARE_R2_ACCESS_KEY_ID,
        CLOUDFLARE_R2_SECRET_ACCESS_KEY,
        CLOUDFLARE_R2_BUCKET_NAME
    ])

def upload_to_r2(local_file_path: str, cloud_filename: str) -> str:
    """
    Uploads a local file to Cloudflare R2 bucket and returns its public access URL.
    If Cloudflare credentials are not set, returns None to fallback to local URL.
    """
    if not is_cloudflare_configured():
        logger.warning("Cloudflare R2 not fully configured in .env. Skipping cloud upload.")
        return None
        
    if not os.path.exists(local_file_path):
        logger.error(f"Local file does not exist for upload: {local_file_path}")
        return None
        
    try:
        # Create S3 compatible client for Cloudflare R2 endpoint
        endpoint_url = f"https://{CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com"
        
        s3_client = boto3.client(
            service_name='s3',
            endpoint_url=endpoint_url,
            aws_access_key_id=CLOUDFLARE_R2_ACCESS_KEY_ID,
            aws_secret_access_key=CLOUDFLARE_R2_SECRET_ACCESS_KEY,
            region_name='auto', # Cloudflare R2 operates region auto-routing
            config=Config(signature_version='s3v4')
        )
        
        # Detect content type based on file suffix
        content_type = "image/jpeg"
        if local_file_path.lower().endswith((".png", ".webp")):
            content_type = f"image/{local_file_path.split('.')[-1]}"
        elif local_file_path.lower().endswith((".mp4", ".avi", ".mov")):
            content_type = "video/mp4"
            
        # Perform upload to R2 bucket
        logger.info(f"Uploading {cloud_filename} to Cloudflare R2 Bucket: {CLOUDFLARE_R2_BUCKET_NAME}...")
        with open(local_file_path, "rb") as f:
            s3_client.upload_fileobj(
                f,
                CLOUDFLARE_R2_BUCKET_NAME,
                cloud_filename,
                ExtraArgs={
                    "ContentType": content_type
                }
            )
            
        # Generate final public URL
        if CLOUDFLARE_R2_PUBLIC_URL:
            public_url = f"{CLOUDFLARE_R2_PUBLIC_URL}/{cloud_filename}"
        else:
            public_url = f"r2://{CLOUDFLARE_R2_BUCKET_NAME}/{cloud_filename}"
        logger.info(f"Successfully uploaded to Cloudflare R2! URL: {public_url}")
        return public_url
        
    except Exception as e:
        logger.error(f"Failed to upload to Cloudflare R2: {str(e)}")
        return None
