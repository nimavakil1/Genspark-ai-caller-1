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
    
    # Create the agent with instructions for interactive conversation
    agent = Agent(
        instructions="""You are a helpful AI sales assistant for a receipt roll sales company. 
        You can help customers with product information, pricing, and orders.
        Be friendly, professional, and respond to ALL user messages.
        When users speak to you, always respond conversationally.
        If they ask "Can you hear me?", respond "Yes, I can hear you perfectly!"
        Engage in natural conversation and answer all questions."""
    )
    
    # Create agent session with all components
    session = agents.AgentSession(
        stt=openai.STT(model="whisper-1"),
        llm=openai.LLM(model="gpt-4o-mini"),
        tts=openai.TTS(voice="alloy"),
        vad=silero.VAD.load(),
    )
    
    # Start the session
    await session.start(
        room=ctx.room,
        agent=agent,
    )
    
    # Generate initial greeting
    await session.generate_reply(
        instructions="Greet the user as a helpful AI sales assistant and offer your assistance with receipt roll sales."
    )
    
    logger.info("AI sales agent session started successfully")

if __name__ == "__main__":
    # Set up environment variables
    if not os.getenv("LIVEKIT_URL"):
        os.environ["LIVEKIT_URL"] = "ws://localhost:8881"
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