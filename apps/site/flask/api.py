import time
import uuid
from typing import List, Optional, Any

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware

from src import chat

copilot_chatter = chat.GitHubCopilotChat()

app = FastAPI(title="Dummy OpenAI Compatible Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ModelInfo(BaseModel):
    id: str
    object: str = "model"
    created: int = Field(default_factory=lambda: int(time.time()))
    owned_by: str = "dummy-owner"


class ModelList(BaseModel):
    object: str = "list"
    data: List[ModelInfo]


class OpenAiCompatibleChatMessage(BaseModel):
    role: str
    content: str


class OpenAiCompatibleChatCompletionRequest(BaseModel):
    model: str = "dummy-gpt-4o"
    messages: List[OpenAiCompatibleChatMessage]
    max_tokens: Optional[int] = 1024
    temperature: Optional[float] = 0.7
    stream: Optional[bool] = False


class OpenAiCompatibleChoice(BaseModel):
    index: int = 0
    message: OpenAiCompatibleChatMessage
    finish_reason: Optional[str] = "stop"
    logprobs: Optional[Any] = None


class OpenAiCompatibleUsage(BaseModel):
    prompt_tokens: int = 5
    completion_tokens: int = 10
    total_tokens: int = 15


class OpenAiCompatibleChatCompletionResponse(BaseModel):
    id: str = Field(default_factory=lambda: f"chatcmpl-{uuid.uuid4()}")
    object: str = "chat.completion"
    created: int = Field(default_factory=lambda: int(time.time()))
    model: str
    choices: List[OpenAiCompatibleChoice]
    usage: OpenAiCompatibleUsage = Field(default_factory=OpenAiCompatibleUsage)
    system_fingerprint: Optional[str] = None


class OpenAiCompatibleDelta(BaseModel):
    content: Optional[str] = None
    role: Optional[str] = None


class OpenAiCompatibleChunkChoice(BaseModel):
    index: int = 0
    delta: OpenAiCompatibleDelta
    finish_reason: Optional[str] = None
    logprobs: Optional[Any] = None


class OpenAiCompatibleChatCompletionChunk(BaseModel):
    id: str = Field(default_factory=lambda: f"chatcmpl-{uuid.uuid4()}")
    object: str = "chat.completion.chunk"
    created: int = Field(default_factory=lambda: int(time.time()))
    model: str
    choices: List[OpenAiCompatibleChunkChoice]
    system_fingerprint: Optional[str] = None


REAL_MODELS = [
    ModelInfo(id=i, owned_by="copilot") for i in copilot_chatter.get_models_list()
]


@app.get("/models", response_model=ModelList)
async def list_models(authorization: Optional[str] = Header(None)):
    print(f"Received request for /v1/models (Auth: {authorization is not None})")
    return ModelList(data=REAL_MODELS)


@app.post("/chat/completions")
async def create_chat_completion(
    request: OpenAiCompatibleChatCompletionRequest,
    authorization: Optional[str] = Header(None),
):
    api_key = authorization.split(" ")[1] if authorization and authorization.startswith("Bearer ") else None
    print(f"Received request for /v1/chat/completions (Auth: {api_key is not None}, Stream: {request.stream})")
    print(f"Model: {request.model}, Messages: {request.messages}")

    if request.stream:
        stream_id = f"chatcmpl-{uuid.uuid4()}"
        return StreamingResponse(
            stream_real_response(request.model, stream_id, request.messages),
            media_type="text/event-stream",
        )
    return await create_real_response(request.model, request.messages)


async def create_real_response(model_id: str, messages: List[OpenAiCompatibleChatMessage]) -> OpenAiCompatibleChatCompletionResponse:
    copilot_chatter.set_model(model_id)
    formatted_messages = [{"role": msg.role, "content": msg.content} for msg in messages]
    response_content = await copilot_chatter.chat(message=formatted_messages)
    response_message = OpenAiCompatibleChatMessage(role="assistant", content=response_content)
    choice = OpenAiCompatibleChoice(message=response_message)
    return OpenAiCompatibleChatCompletionResponse(model=model_id, choices=[choice])


async def stream_real_response(model_id: str, stream_id: str, messages: List[OpenAiCompatibleChatMessage]):
    copilot_chatter.set_model(model_id)
    formatted_messages = [{"role": msg.role, "content": msg.content} for msg in messages]
    text = await copilot_chatter.chat(formatted_messages)
    words = text.split(" ")
    created_time = int(time.time())

    first_chunk_data = OpenAiCompatibleChatCompletionChunk(
        id=stream_id,
        model=model_id,
        created=created_time,
        choices=[OpenAiCompatibleChunkChoice(delta=OpenAiCompatibleDelta(role="assistant"), index=0)],
    )
    yield f"data: {first_chunk_data.model_dump_json(exclude_unset=True)}\n\n"

    for i, word in enumerate(words):
        delta_content = word + (" " if i < len(words) - 1 else "")
        chunk_data = OpenAiCompatibleChatCompletionChunk(
            id=stream_id,
            model=model_id,
            created=created_time,
            choices=[OpenAiCompatibleChunkChoice(delta=OpenAiCompatibleDelta(content=delta_content), index=0)],
        )
        yield f"data: {chunk_data.model_dump_json(exclude_unset=True)}\n\n"

    final_chunk_data = OpenAiCompatibleChatCompletionChunk(
        id=stream_id,
        model=model_id,
        created=created_time,
        choices=[OpenAiCompatibleChunkChoice(delta=OpenAiCompatibleDelta(), finish_reason="stop", index=0)],
    )
    yield f"data: {final_chunk_data.model_dump_json(exclude_unset=True)}\n\n"
    yield "data: [DONE]\n\n"


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8085)
