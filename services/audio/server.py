"""MuScriptor Large and YouTube audio service for the Sites Worker."""

import hmac
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from threading import BoundedSemaphore

import uvicorn
from fastapi import HTTPException, Request, Response
from fastapi.responses import JSONResponse
from muscriptor import TranscriptionModel
from muscriptor.server import create_app


MODEL_ID = "muscriptor-large"
VIDEO_ID = re.compile(r"[A-Za-z0-9_-]{11}")
MAX_MP3_BYTES = 30 * 1024 * 1024
youtube_slot = BoundedSemaphore(1)


def youtube_to_mp3(video_id: str, ffmpeg: str) -> bytes:
    with tempfile.TemporaryDirectory(prefix="whistle-audio-") as temporary:
        directory = Path(temporary)
        output = directory / "audio.mp3"
        common = {"check": True, "stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL}
        try:
            subprocess.run(
                [
                    sys.executable, "-m", "yt_dlp", "--ignore-config", "--no-playlist",
                    "--no-progress", "--socket-timeout", "12", "--retries", "1",
                    "--match-filters", "duration <= 600 & !is_live",
                    "--max-filesize", "45M", "-f", "bestaudio/best",
                    "-o", str(directory / "source.%(ext)s"), "--",
                    f"https://www.youtube.com/watch?v={video_id}",
                ],
                timeout=65,
                **common,
            )
            source = next(directory.glob("source.*"), None)
            if source is None:
                raise HTTPException(422, "No supported audio. Use a video up to 10 minutes long.")
            subprocess.run(
                [
                    ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error",
                    "-protocol_whitelist", "file,pipe", "-i", str(source),
                    "-map", "0:a:0", "-vn", "-t", "600",
                    "-c:a", "libmp3lame", "-b:a", "128k", str(output),
                ],
                timeout=20,
                **common,
            )
        except subprocess.TimeoutExpired as error:
            raise HTTPException(504, "Audio conversion timed out.") from error
        except subprocess.CalledProcessError as error:
            raise HTTPException(422, "The video audio could not be converted.") from error

        if not 0 < output.stat().st_size <= MAX_MP3_BYTES:
            raise HTTPException(413, "The MP3 exceeds the audio size limit.")
        return output.read_bytes()


def make_app(token: str):
    model = TranscriptionModel.load_model("large", device=os.environ.get("MUSCRIPTOR_DEVICE") or None)
    app = create_app(model)
    ffmpeg = shutil.which("ffmpeg")
    expected_auth = f"Bearer {token}".encode()

    @app.middleware("http")
    async def authenticate(request: Request, call_next):
        actual_auth = request.headers.get("authorization", "").encode()
        if not hmac.compare_digest(actual_auth, expected_auth):
            return JSONResponse({"detail": "Unauthorized"}, status_code=401)
        response = await call_next(request)
        if request.url.path == "/transcribe" and response.status_code == 200:
            response.headers["X-Audio-Model"] = MODEL_ID
            if request.headers.get("x-audio-transport") == "sse-bytes":
                response.headers["Content-Type"] = "application/octet-stream"
                response.headers["X-Audio-Transport"] = "sse-bytes"
        return response

    @app.get("/capabilities")
    def capabilities():
        return {"model": MODEL_ID, "youtubeMp3": ffmpeg is not None}

    @app.post("/youtube/{video_id}/mp3")
    def convert_youtube(video_id: str):
        if not VIDEO_ID.fullmatch(video_id):
            raise HTTPException(400, "Invalid YouTube video ID.")
        if ffmpeg is None or not youtube_slot.acquire(blocking=False):
            raise HTTPException(503, "Audio conversion is unavailable or busy.")
        try:
            return Response(youtube_to_mp3(video_id, ffmpeg), media_type="audio/mpeg")
        finally:
            youtube_slot.release()

    return app


if __name__ == "__main__":
    secret = os.environ.get("AUDIO_SERVICE_TOKEN")
    if not secret:
        raise SystemExit("Set AUDIO_SERVICE_TOKEN before starting the audio service.")
    uvicorn.run(
        make_app(secret),
        host=os.environ.get("AUDIO_SERVICE_HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "8222")),
    )
