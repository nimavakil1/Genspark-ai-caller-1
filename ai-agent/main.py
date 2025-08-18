import asyncio
import logging
import os
from fastapi import FastAPI, HTTPException
from dotenv import load_dotenv
import openai
import redis
# Remove livekit api import for now - will add when needed for room management

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(title="LiveKit AI Agent", version="1.0.0")

# OpenAI configuration - client will be initialized per request

# Initialize Redis client
redis_client = redis.Redis.from_url(os.getenv("REDIS_URL", "redis://redis:6379"))

# LiveKit configuration
LIVEKIT_URL = os.getenv("LIVEKIT_URL", "ws://livekit:7880")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY", "devkey")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "secret")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        # Test Redis connection
        redis_client.ping()
        redis_status = "connected"
    except Exception as e:
        logger.error(f"Redis connection failed: {e}")
        redis_status = "disconnected"
    
    return {
        "status": "healthy",
        "service": "ai-agent",
        "redis": redis_status,
        "openai_configured": bool(os.getenv("OPENAI_API_KEY"))
    }

@app.post("/webhook/livekit")
async def livekit_webhook(webhook_data: dict):
    """Handle LiveKit webhook events"""
    logger.info(f"Received LiveKit webhook: {webhook_data}")
    
    event_type = webhook_data.get("event")
    
    if event_type == "participant_joined":
        logger.info("Participant joined - starting AI conversation")
        # TODO: Implement AI conversation logic
        
    elif event_type == "participant_disconnected":
        logger.info("Participant disconnected - ending AI conversation")
        # TODO: Clean up conversation state
    
    return {"status": "processed"}

@app.post("/test/openai")
async def test_openai(message: dict):
    """Test OpenAI integration"""
    try:
        from openai import OpenAI
        
        user_message = message.get("message", "Hello, how are you?")
        
        # Initialize OpenAI client with the new API
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        
        # Test OpenAI API call with new syntax
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are a helpful AI assistant for phone calls."},
                {"role": "user", "content": user_message}
            ],
            max_tokens=150,
            temperature=0.7
        )
        
        ai_response = response.choices[0].message.content
        
        return {
            "status": "success",
            "user_message": user_message,
            "ai_response": ai_response,
            "model": "gpt-3.5-turbo"
        }
    except Exception as e:
        logger.error(f"OpenAI API error: {e}")
        return {
            "status": "error",
            "error": str(e)
        }

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "LiveKit AI Agent is running",
        "health_endpoint": "/health",
        "webhook_endpoint": "/webhook/livekit",
        "test_endpoint": "/test/openai"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)