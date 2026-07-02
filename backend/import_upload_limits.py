"""CSV upload size limits for import preview routes."""

from fastapi import HTTPException, UploadFile

MAX_CSV_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MiB


async def read_csv_bytes_limited(
    file: UploadFile, max_bytes: int = MAX_CSV_UPLOAD_BYTES
) -> bytes:
    """Read upload body; reject when cumulative size exceeds max_bytes."""
    chunks: list[bytes] = []
    total = 0
    chunk_size = 64 * 1024
    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"CSV upload exceeds {max_bytes // (1024 * 1024)}MB limit",
            )
        chunks.append(chunk)
    return b"".join(chunks)