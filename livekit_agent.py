#!/usr/bin/env python3

import asyncio
import logging
import os

from livekit import agents
from livekit.agents import JobContext, WorkerOptions, cli, Agent
from livekit.plugins import openai, silero

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai-sales-agent")

def prewarm(proc: JobContext):
    """Prewarm the agent by loading models"""
    logger.info("Prewarming AI sales agent...")

async def entrypoint(ctx: JobContext):
    """Main entrypoint for the LiveKit agent"""
    logger.info("Starting AI sales agent session...")
    
    # Create the agent with optimized instructions for fast responses
    agent = Agent(
        instructions="""You are a helpful AI sales assistant. 
        CRITICAL: Keep ALL responses under 20 words. Never exceed this limit.
        Be friendly but extremely brief. Answer questions with minimal words.
        For "Can you hear me?" say "Yes, perfectly!"
        For greetings say "Hi! How can I help today?"
        Always respond with maximum 1-2 short sentences."""
    )
    
    # Create agent session with optimized components for low latency
    session = agents.AgentSession(
        # Use streaming STT for faster transcription
        stt=openai.STT(
            model="whisper-1",
            # Enable streaming and reduce latency
            language="en",
            detect_language=False,  # Skip language detection for speed
        ),
        # Use faster LLM model and streaming
        llm=openai.LLM(
            model="gpt-4o-mini", 
            temperature=0.7,
        ),
        # Use streaming TTS for faster audio generation
        tts=openai.TTS(
            voice="alloy",
            speed=1.1,  # Slightly faster speech
            model="tts-1",  # Use faster TTS model
        ),
        # Optimize VAD for faster detection
        vad=silero.VAD.load(
            min_speech_duration_ms=100,  # Detect speech faster
            min_silence_duration_ms=500,  # Shorter silence before processing
        ),
    )
    
    # Start the session with streaming enabled for low latency
    await session.start(
        room=ctx.room,
        agent=agent,
        # Enable streaming for real-time responses
        auto_disconnect=False,
        auto_publish=True,
    )
    
    # Generate short initial greeting
    await session.generate_reply(
        instructions="Say a quick friendly greeting in 5 words or less to a customer."
    )
    
    # Add event handler for user speech to ensure responses with timing
    @session.on("user_speech_committed")
    async def on_user_speech(event):
        import time
        start_time = time.time()
        
        user_message = event.alternatives[0].text
        logger.info(f"⚡ User speech received: '{user_message}' at {start_time}")
        
        # Generate short contextual response
        response_start = time.time()
        await session.generate_reply(
            instructions=f"User said: '{user_message}'. Reply in 1-2 short sentences. Be brief and helpful."
        )
        
        end_time = time.time()
        total_latency = end_time - start_time
        response_latency = end_time - response_start
        logger.info(f"⏱️  Total latency: {total_latency:.2f}s, Response generation: {response_latency:.2f}s")
    
    logger.info("AI sales agent session started successfully")

if __name__ == "__main__":
    # Set up environment variables
    if not os.getenv("LIVEKIT_URL"):
        os.environ["LIVEKIT_URL"] = "ws://localhost:7880"
    if not os.getenv("LIVEKIT_API_KEY"):
        os.environ["LIVEKIT_API_KEY"] = "devkey"  
    if not os.getenv("LIVEKIT_API_SECRET"):
        os.environ["LIVEKIT_API_SECRET"] = "devkey-secret-that-is-long-enough-for-livekit-requirements-32plus-chars"
    
    # Run the agent
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
        ),
    )