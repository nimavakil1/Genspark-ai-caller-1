#!/usr/bin/env python3

import asyncio
import logging
import os
from typing import Annotated

from livekit.agents import (
    AutoSubscribe,
    JobContext,
    WorkerOptions,
    cli,
    llm
)
from livekit.agents.multimodal import MultimodalAgent
from livekit.plugins import openai, silero
import livekit

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai-sales-agent")

def prewarm(proc: JobContext):
    """Prewarm the agent by loading models"""
    logger.info("Prewarming agent...")
    proc.wait_for_participant = True

async def entrypoint(ctx: JobContext):
    """Main entrypoint for the LiveKit agent"""
    
    # Wait for participant to connect
    await ctx.wait_for_participant()
    logger.info(f"Participant connected: {ctx.room.remote_participants}")
    
    # Get participant
    participant = ctx.room.remote_participants[0] if ctx.room.remote_participants else None
    if not participant:
        logger.error("No participant found")
        return
    
    # Create OpenAI Realtime model with voice settings
    model = openai.realtime.RealtimeModel(
        voice="alloy",
        temperature=0.7,
        instructions="""You are a helpful AI sales assistant for a receipt roll sales company. 
        You can help customers with product information, pricing, and orders.
        Be friendly, professional, and concise in your responses.
        If you don't know something, say so clearly.""",
        modalities=["audio", "text"],
        turn_detection=openai.realtime.ServerVadOptions(
            threshold=0.5,
            prefix_padding_ms=300,
            silence_duration_ms=500
        ),
    )
    
    # Create the multimodal agent
    agent = MultimodalAgent(
        model=model,
        vad=silero.VAD.load(),
    )
    
    # Start the agent
    logger.info("Starting AI sales agent...")
    await agent.start(ctx.room, participant)
    
    # Keep the agent running
    await agent.aclose()

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