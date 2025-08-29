#!/usr/bin/env python3

import asyncio
import logging
import json
from aiohttp import web, ClientSession
from livekit.api import room_service, AccessToken, VideoGrants
import os

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("livekit-server")

# LiveKit configuration
LIVEKIT_URL = os.getenv("LIVEKIT_URL", "ws://localhost:8881")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY", "devkey")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "devkey-secret-that-is-long-enough-for-livekit-requirements-32plus-chars")

class LiveKitService:
    def __init__(self):
        self.session = None
        self.room_service = None
    
    async def init_session(self):
        """Initialize aiohttp session and room service"""
        if not self.session:
            self.session = ClientSession()
            self.room_service = room_service.RoomService(
                session=self.session,
                url=LIVEKIT_URL,
                api_key=LIVEKIT_API_KEY,
                api_secret=LIVEKIT_API_SECRET
            )
    
    async def create_room(self, room_name: str, agent_config: dict):
        """Create a new LiveKit room for voice conversation"""
        try:
            await self.init_session()
            # Create room
            room_create = room_service.CreateRoomRequest(name=room_name)
            room = await self.room_service.create_room(room_create)
            logger.info(f"Created room: {room.name}")
            
            # Generate participant token for customer
            token_request = AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
            token_request.with_identity("customer")
            token_request.with_name("Customer")
            token_request.with_grants(VideoGrants(
                room_join=True,
                room=room_name,
                can_publish=True,
                can_subscribe=True
            ))
            
            customer_token = token_request.to_jwt()
            
            return {
                "room_name": room.name,
                "customer_token": customer_token,
                "livekit_url": LIVEKIT_URL.replace("ws://", "http://").replace("wss://", "https://")
            }
            
        except Exception as e:
            logger.error(f"Error creating room: {e}")
            raise
    
    async def end_room(self, room_name: str):
        """End a LiveKit room"""
        try:
            await self.init_session()
            await self.room_service.delete_room(room_service.DeleteRoomRequest(room=room_name))
            logger.info(f"Ended room: {room_name}")
            return True
        except Exception as e:
            logger.error(f"Error ending room: {e}")
            return False

# Global service instance
livekit_service = LiveKitService()

async def create_voice_session(request):
    """Create a new voice session with LiveKit"""
    try:
        data = await request.json()
        agent_id = data.get('agent_id')
        agent_config = data.get('agent_config', {})
        
        if not agent_id:
            return web.json_response(
                {"success": False, "error": "Agent ID required"}, 
                status=400
            )
        
        # Create unique room name
        room_name = f"voice_session_{agent_id}_{int(asyncio.get_event_loop().time())}"
        
        # Create LiveKit room
        room_data = await livekit_service.create_room(room_name, agent_config)
        
        return web.json_response({
            "success": True,
            "session_data": room_data
        })
        
    except Exception as e:
        logger.error(f"Error creating voice session: {e}")
        return web.json_response(
            {"success": False, "error": str(e)}, 
            status=500
        )

async def end_voice_session(request):
    """End a voice session"""
    try:
        data = await request.json()
        room_name = data.get('room_name')
        
        if not room_name:
            return web.json_response(
                {"success": False, "error": "Room name required"}, 
                status=400
            )
        
        success = await livekit_service.end_room(room_name)
        
        return web.json_response({
            "success": success
        })
        
    except Exception as e:
        logger.error(f"Error ending voice session: {e}")
        return web.json_response(
            {"success": False, "error": str(e)}, 
            status=500
        )

async def health_check(request):
    """Health check endpoint"""
    return web.json_response({"status": "healthy"})

def create_app():
    """Create the aiohttp application"""
    app = web.Application()
    
    # Add CORS headers middleware
    @web.middleware
    async def add_cors_headers(request, handler):
        response = await handler(request)
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        return response
    
    app.middlewares.append(add_cors_headers)
    
    # Handle OPTIONS requests
    async def options_handler(request):
        return web.Response(
            headers={
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            }
        )
    
    # Handle GET requests to root with simple response
    async def root_handler(request):
        return web.json_response({"status": "LiveKit Service Running", "version": "1.0.0"})
    
    app.router.add_route('OPTIONS', '/{path:.*}', options_handler)
    app.router.add_get('/', root_handler)
    
    # API routes
    app.router.add_post('/create-session', create_voice_session)
    app.router.add_post('/end-session', end_voice_session)
    app.router.add_get('/health', health_check)
    
    return app

if __name__ == "__main__":
    app = create_app()
    web.run_app(app, host='0.0.0.0', port=3004)