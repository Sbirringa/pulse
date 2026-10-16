"""Foto: elaborazione sicura e archiviazione.

Ogni foto caricata viene:
1. aperta con Pillow e accettata solo se è davvero JPEG, PNG o WebP (non conta l'estensione del file);
2. rifiutata se ha dimensioni enormi (protezione dalle "decompression bomb");
3. ruotata secondo l'orientamento EXIF e poi RICODIFICATA da zero in WebP: nel file finale non resta
   nessun metadato (niente posizione GPS, modello del telefono, data di scatto…) e nessun byte
   dell'originale, quindi anche eventuali contenuti malevoli nascosti nel file vengono eliminati;
4. salvata in due misure: "sm" (anteprima, 640 px) e "lg" (grande, 1600 px).

L'originale non viene mai salvato.
"""
import io
import logging
import threading
import uuid
from pathlib import Path

from PIL import Image as PILImage
from PIL import ImageOps, UnidentifiedImageError

from .config import (
    IMAGE_CONCURRENCY,
    MAX_IMAGE_PIXELS,
    MAX_UPLOAD_MB,
    MEDIA_DIR,
    S3_BUCKET,
    S3_ENDPOINT,
    S3_REGION,
    STORAGE_BACKEND,
)

from .crypto import decrypt_blob, encrypt_blob

log = logging.getLogger("pulse.media")

ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
VARIANTS = {"sm": 640, "lg": 1600}
AVATAR_SIDE = 400  # foto profilo: quadrata
ALL_VARIANTS = ("sm", "lg", "av")
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

# Pillow alza un errore per immagini oltre il doppio di questo valore; noi controlliamo comunque prima.
PILImage.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
# Decodificare una foto da 12 MP occupa ~50 MB di RAM: le elaborazioni simultanee sono limitate.
_slots = threading.BoundedSemaphore(IMAGE_CONCURRENCY)


class ImageError(ValueError):
    """Messaggio da mostrare all'utente."""


def process_image(data: bytes) -> tuple[dict[str, bytes], int, int]:
    """Valida e ricodifica una foto. Restituisce ({"sm": bytes, "lg": bytes}, larghezza, altezza)."""
    if not data:
        raise ImageError("Il file è vuoto.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise ImageError(f"Foto troppo pesante: massimo {MAX_UPLOAD_MB} MB.")
    with _slots:
        try:
            img = PILImage.open(io.BytesIO(data))
            fmt = img.format
        except (UnidentifiedImageError, OSError, ValueError):
            raise ImageError("Il file non è un'immagine valida.")
        except PILImage.DecompressionBombError:
            raise ImageError("Immagine troppo grande.")
        if fmt not in ALLOWED_FORMATS:
            raise ImageError("Formato non supportato: usa foto JPG, PNG o WebP.")
        width, height = img.size
        if width * height > MAX_IMAGE_PIXELS or width < 1 or height < 1:
            raise ImageError("Immagine troppo grande: riducila e riprova.")
        try:
            if getattr(img, "n_frames", 1) > 1:
                img.seek(0)  # immagini animate: si tiene solo il primo fotogramma
            if fmt == "JPEG":
                # decodifica già ridotta: molta meno RAM per le foto grandi del telefono
                img.draft("RGB", (VARIANTS["lg"] * 2, VARIANTS["lg"] * 2))
            img.load()
            img = ImageOps.exif_transpose(img)
        except PILImage.DecompressionBombError:
            raise ImageError("Immagine troppo grande.")
        except Exception:  # file troncato o corrotto
            raise ImageError("L'immagine sembra danneggiata.")

        has_alpha = img.mode in ("RGBA", "LA", "PA") or (img.mode == "P" and "transparency" in img.info)
        img = img.convert("RGBA" if has_alpha else "RGB")
        out: dict[str, bytes] = {}
        final_size = img.size
        for name, side in VARIANTS.items():
            variant = img.copy()
            variant.info = {}  # nessun metadato viene trascinato nel nuovo file
            variant.thumbnail((side, side), PILImage.Resampling.LANCZOS)
            buf = io.BytesIO()
            variant.save(buf, "WEBP", quality=82 if name == "lg" else 76, method=4, exif=b"", icc_profile=None)
            out[name] = buf.getvalue()
            if name == "lg":
                final_size = variant.size
        return out, final_size[0], final_size[1]


def process_avatar(data: bytes) -> dict[str, bytes]:
    """Foto profilo: stessa pulizia delle altre foto, poi ritaglio quadrato centrato."""
    variants, _w, _h = process_image(data)
    with _slots:
        img = PILImage.open(io.BytesIO(variants["lg"]))
        img.load()
        img = ImageOps.fit(img.convert("RGB"), (AVATAR_SIDE, AVATAR_SIDE), PILImage.Resampling.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, "WEBP", quality=82, method=4, exif=b"", icc_profile=None)
    return {"av": buf.getvalue()}


# --------------------------------------------------------------------------------------------
# Archiviazione
# --------------------------------------------------------------------------------------------


def media_key(image_id: str, variant: str) -> str:
    return f"img/{image_id}/{variant}.webp"


class LocalStorage:
    def __init__(self, root: Path):
        self.root = Path(root).resolve()

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if self.root not in path.parents:
            raise ValueError("chiave non valida")
        return path

    def put(self, key: str, data: bytes, content_type: str) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_bytes(data)
        tmp.replace(path)

    def get(self, key: str) -> bytes | None:
        path = self._path(key)
        return path.read_bytes() if path.is_file() else None

    def delete(self, key: str) -> None:
        path = self._path(key)
        path.unlink(missing_ok=True)
        try:
            path.parent.rmdir()  # rimuove la cartella dell'immagine se è rimasta vuota
        except OSError:
            pass


class S3Storage:
    """Storage compatibile S3 (Tigris, Cloudflare R2, AWS S3...). Il bucket resta privato:
    le foto passano sempre dal backend, che controlla chi può vederle."""

    def __init__(self, bucket: str, endpoint: str | None, region: str):
        import boto3
        from botocore.config import Config

        self.bucket = bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            region_name=region,
            config=Config(signature_version="s3v4", retries={"max_attempts": 3, "mode": "standard"}),
        )

    def put(self, key: str, data: bytes, content_type: str) -> None:
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)

    def get(self, key: str) -> bytes | None:
        from botocore.exceptions import ClientError

        try:
            return self.client.get_object(Bucket=self.bucket, Key=key)["Body"].read()
        except ClientError as e:
            if e.response.get("Error", {}).get("Code") in ("NoSuchKey", "404", "NotFound"):
                return None
            raise

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)


_storage = None
_storage_lock = threading.Lock()


def get_storage():
    global _storage
    with _storage_lock:
        if _storage is None:
            _storage = (S3Storage(S3_BUCKET, S3_ENDPOINT, S3_REGION) if STORAGE_BACKEND == "s3"
                        else LocalStorage(MEDIA_DIR))
        return _storage


def set_storage(storage) -> None:
    """Per i test."""
    global _storage
    with _storage_lock:
        _storage = storage


def store_processed(variants: dict[str, bytes]) -> str:
    """Salva le varianti già elaborate e restituisce l'id della foto."""
    image_id = uuid.uuid4().hex
    storage = get_storage()
    saved = []
    try:
        for name, data in variants.items():
            # nello storage finisce solo il file CIFRATO (il nome del file fa parte della cifratura)
            storage.put(media_key(image_id, name), encrypt_blob(data, f"{image_id}/{name}"),
                        "application/octet-stream")
            saved.append(name)
    except Exception:
        for name in saved:
            _safe_delete(storage, media_key(image_id, name))
        raise
    return image_id


def _safe_delete(storage, key: str) -> None:
    try:
        storage.delete(key)
    except Exception:  # un file orfano non deve bloccare l'utente
        log.exception("Impossibile eliminare %s dallo storage", key)


def delete_image_files(image_ids) -> None:
    storage = get_storage()
    for image_id in image_ids:
        for name in ALL_VARIANTS:
            _safe_delete(storage, media_key(image_id, name))


def read_image(image_id: str, variant: str) -> bytes | None:
    blob = get_storage().get(media_key(image_id, variant))
    return None if blob is None else decrypt_blob(blob, f"{image_id}/{variant}")
