import time
import uuid
import json
import asyncio
from typing import List, Optional, Dict, Any, Union

from fastapi import FastAPI, Request, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware

from src import chat

copilot_chatter = chat.GitHubCopilotChat()

# --- FastAPI Application ---
app = FastAPI(title="Dummy OpenAI Compatible Server")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# --- Pydantic Models (Data Transfer Objects) ---
# Based on OpenAI API structure

class ModelInfo(BaseModel):
    id: str
    object: str = "model"
    created: int = Field(default_factory=lambda: int(time.time()))
    owned_by: str = "dummy-owner"

class ModelList(BaseModel):
    object: str = "list"
    data: List[ModelInfo]

# --- Chat Completion Models ---

# Simplified Content: only supporting string content for this dummy server
class OpenAiCompatibleChatMessage(BaseModel):
    role: str
    content: str # Simplified from the original Kotlin example

class OpenAiCompatibleChatCompletionRequest(BaseModel):
    model: str = "dummy-gpt-4o"
    messages: List[OpenAiCompatibleChatMessage]
    max_tokens: Optional[int] = 1024 # Renamed from maxCompletionTokens for Python style
    temperature: Optional[float] = 0.7
    stream: Optional[bool] = False
    # Add other common parameters if needed, e.g., top_p, n, stop, etc.

# -- Non-Streaming Response --
class OpenAiCompatibleChoice(BaseModel):
    index: int = 0
    message: OpenAiCompatibleChatMessage
    finish_reason: Optional[str] = "stop"
    logprobs: Optional[Any] = None # Added for more compatibility

class OpenAiCompatibleUsage(BaseModel):
    prompt_tokens: int = 5 # Dummy value
    completion_tokens: int = 10 # Dummy value
    total_tokens: int = 15 # Dummy value

class OpenAiCompatibleChatCompletionResponse(BaseModel):
    id: str = Field(default_factory=lambda: f"chatcmpl-{uuid.uuid4()}")
    object: str = "chat.completion"
    created: int = Field(default_factory=lambda: int(time.time()))
    model: str
    choices: List[OpenAiCompatibleChoice]
    usage: OpenAiCompatibleUsage = Field(default_factory=OpenAiCompatibleUsage)
    system_fingerprint: Optional[str] = None # Added for more compatibility

# -- Streaming Response --
class OpenAiCompatibleDelta(BaseModel):
    content: Optional[str] = None
    role: Optional[str] = None

class OpenAiCompatibleChunkChoice(BaseModel):
    index: int = 0
    delta: OpenAiCompatibleDelta
    finish_reason: Optional[str] = None
    logprobs: Optional[Any] = None # Added for more compatibility

class OpenAiCompatibleChatCompletionChunk(BaseModel):
    id: str = Field(default_factory=lambda: f"chatcmpl-{uuid.uuid4()}")
    object: str = "chat.completion.chunk"
    created: int = Field(default_factory=lambda: int(time.time()))
    model: str
    choices: List[OpenAiCompatibleChunkChoice]
    system_fingerprint: Optional[str] = None # Added for more compatibility

# --- FastAPI Application ---

app = FastAPI(title="Dummy OpenAI Compatible Server")

# --- Dummy Data ---

FAKE_MODELS = [
    ModelInfo(id="dummy-gpt-4o", owned_by="dummy-inc"),
    ModelInfo(id="dummy-gpt-3.5-turbo", owned_by="dummy-inc"),
    ModelInfo(id="dummy-claude-3-opus", owned_by="dummy-other"),
]

REAL_MODELS = [
    ModelInfo(id=i, owned_by="copilot") for i in copilot_chatter.get_models_list()
]

# --- API Endpoints ---

@app.get("/models", response_model=ModelList)
async def list_models(authorization: Optional[str] = Header(None)):
    # You could add auth validation here if needed
    print(f"Received request for /v1/models (Auth: {authorization is not None})")
    return ModelList(data=REAL_MODELS)

@app.post("/chat/completions")
async def create_chat_completion(
    request: OpenAiCompatibleChatCompletionRequest,
    authorization: Optional[str] = Header(None) # Capture auth header
):
    """
    Handles chat completion requests, supporting both streaming and non-streaming.
    """
    # You could add auth validation here using the 'authorization' header if needed
    api_key = authorization.split(" ")[1] if authorization and authorization.startswith("Bearer ") else None
    print(f"Received request for /v1/chat/completions (Auth: {api_key is not None}, Stream: {request.stream})")
    print(f"Model: {request.model}, Messages: {request.messages}")

    if request.stream:
        # Return a streaming response
        stream_id = f"chatcmpl-{uuid.uuid4()}" # Unique ID for the whole stream
        return StreamingResponse(
            stream_real_response(request.model, stream_id, request.messages),
            media_type="text/event-stream"
        )
    else:
        # Return a standard JSON response
        return await create_real_response(request.model, request.messages)

# --- Helper Functions for Responses ---

async def create_real_response(model_id: str, messages: List[OpenAiCompatibleChatMessage]) -> OpenAiCompatibleChatCompletionResponse:
    """Generates a real non-streaming chat completion response using copilot_chatter."""
    try:
        # Set the model in copilot_chatter
        copilot_chatter.set_model(model_id)
        print(f"Setting model in copilot_chatter to: {model_id}")

        # Convert messages to the format expected by copilot_chatter
        formatted_messages = [{"role": msg.role, "content": msg.content} for msg in messages]
        
        # Call the chat function from copilot_chatter
        response_content = await copilot_chatter.chat(message=formatted_messages)
        
        # Create the response message
        response_message = OpenAiCompatibleChatMessage(role="assistant", content=response_content)
        choice = OpenAiCompatibleChoice(message=response_message)
        
        # Build the final response
        response = OpenAiCompatibleChatCompletionResponse(
            model=model_id,
            choices=[choice],
        )
        print(f"Generated real response: {response.model_dump_json(indent=2)}")
        return response
    except Exception as e:
        print(f"Error generating real response: {e}")
        raise HTTPException(status_code=500, detail="Error generating response")

def create_dummy_response(model_id: str) -> OpenAiCompatibleChatCompletionResponse:
    """Generates a dummy non-streaming chat completion response."""
    dummy_content = f"TEST OUTPUT FROM {model_id}"
    response_message = OpenAiCompatibleChatMessage(role="assistant", content=dummy_content)
    choice = OpenAiCompatibleChoice(message=response_message)
    response = OpenAiCompatibleChatCompletionResponse(
        model=model_id,
        choices=[choice],
        # ID and Created are handled by default_factory in the model
    )
    print(f"Generated non-streaming response: {response.model_dump_json(indent=2)}")
    return response

async def stream_dummy_response(model_id: str, stream_id: str):
    """Async generator for dummy streaming chat completion response chunks (SSE)."""
    dummy_text = f"TEST OUTPUT FROM {model_id}"
    words = dummy_text.split(" ")
    created_time = int(time.time())

    # 1. Send the first chunk with role (optional but good practice)
    first_chunk_data = OpenAiCompatibleChatCompletionChunk(
        id=stream_id,
        model=model_id,
        created=created_time,
        choices=[OpenAiCompatibleChunkChoice(
            delta=OpenAiCompatibleDelta(role="assistant"),
            index=0
        )]
    )
    yield f"data: {first_chunk_data.model_dump_json(exclude_unset=True)}\n\n"
    print(f"Sent chunk: {first_chunk_data.model_dump_json(exclude_unset=True)}")
    await asyncio.sleep(0.1) # Simulate processing time

    # 2. Send content chunks
    for i, word in enumerate(words):
        delta_content = word + (" " if i < len(words) - 1 else "") # Add space back
        chunk_data = OpenAiCompatibleChatCompletionChunk(
            id=stream_id,
            model=model_id,
            created=created_time,
            choices=[OpenAiCompatibleChunkChoice(
                delta=OpenAiCompatibleDelta(content=delta_content),
                index=0
            )]
        )
        yield f"data: {chunk_data.model_dump_json(exclude_unset=True)}\n\n"
        print(f"Sent chunk: {chunk_data.model_dump_json(exclude_unset=True)}")
        await asyncio.sleep(0.1) # Simulate processing time

    # 3. Send the final chunk with finish_reason
    final_chunk_data = OpenAiCompatibleChatCompletionChunk(
        id=stream_id,
        model=model_id,
        created=created_time,
        choices=[OpenAiCompatibleChunkChoice(
            delta=OpenAiCompatibleDelta(), # Empty delta
            finish_reason="stop",
            index=0
        )]
    )
    yield f"data: {final_chunk_data.model_dump_json(exclude_unset=True)}\n\n"
    print(f"Sent chunk: {final_chunk_data.model_dump_json(exclude_unset=True)}")
    await asyncio.sleep(0.1)

    # 4. Send the [DONE] signal
    yield "data: [DONE]\n\n"
    print("Sent: [DONE]")

async def stream_real_response(model_id: str, stream_id: str, messages: List[OpenAiCompatibleChatMessage]):
    """Async generator for streaming real chat completion response chunks using copilot_chatter."""
    # Convert messages to the format expected by copilot_chatter
    copilot_chatter.set_model(model_id)
    formatted_messages = [{"role": msg.role, "content": msg.content} for msg in messages]
    
    # Call the chat function from copilot_chatter
    dummy_text = await copilot_chatter.chat(formatted_messages)
    print(f"Response type: {type(dummy_text)}")
    
    # Split text into words for streaming
    words = dummy_text.split(" ")
    created_time = int(time.time())

    # 1. Send the first chunk with role (optional but good practice)
    first_chunk_data = OpenAiCompatibleChatCompletionChunk(
        id=stream_id,
        model=model_id,
        created=created_time,
        choices=[OpenAiCompatibleChunkChoice(
            delta=OpenAiCompatibleDelta(role="assistant"),
            index=0
        )]
    )
    yield f"data: {first_chunk_data.model_dump_json(exclude_unset=True)}\n\n"
    print(f"Sent chunk: {first_chunk_data.model_dump_json(exclude_unset=True)}")

    # 2. Send content chunks
    for i, word in enumerate(words):
        delta_content = word + (" " if i < len(words) - 1 else "") # Add space back
        chunk_data = OpenAiCompatibleChatCompletionChunk(
            id=stream_id,
            model=model_id,
            created=created_time,
            choices=[OpenAiCompatibleChunkChoice(
                delta=OpenAiCompatibleDelta(content=delta_content),
                index=0
            )]
        )
        yield f"data: {chunk_data.model_dump_json(exclude_unset=True)}\n\n"
        print(f"Sent chunk: {chunk_data.model_dump_json(exclude_unset=True)}")

    # 3. Send the final chunk with finish_reason
    final_chunk_data = OpenAiCompatibleChatCompletionChunk(
        id=stream_id,
        model=model_id,
        created=created_time,
        choices=[OpenAiCompatibleChunkChoice(
            delta=OpenAiCompatibleDelta(), # Empty delta
            finish_reason="stop",
            index=0
        )]
    )
    yield f"data: {final_chunk_data.model_dump_json(exclude_unset=True)}\n\n"
    print(f"Sent chunk: {final_chunk_data.model_dump_json(exclude_unset=True)}")

    # 4. Send the [DONE] signal
    yield "data: [DONE]\n\n"
    print("Sent: [DONE]")

# --- Run the server ---
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8085)