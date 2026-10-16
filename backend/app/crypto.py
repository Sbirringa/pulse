"""Cifratura dei dati personali e delle foto (AES-256-GCM).

COSA PROTEGGE
- Nel database (Neon) nickname, nome reale, bio, città, testi di post e commenti sono salvati cifrati:
  chi apre le tabelle (tu dalla console, il fornitore, chi ruba un backup) vede solo stringhe illeggibili.
- Nello storage (Tigris) le foto sono file cifrati: senza chiave non si aprono.
- La chiave (PULSE_DATA_KEY) non sta né nel database né nello storage: è un secret dell'app su Fly.io.

COSA NON PUÒ FARE (onestà)
- L'app deve mostrare nomi, post e foto agli utenti, quindi il server li decifra quando servono.
  Chi controlla il server e la chiave (cioè l'amministratore) potrebbe tecnicamente leggerli: per i contenuti
  pubblici di un social non esiste una cifratura "end-to-end" come in una chat privata.
- Le ricerche sui campi cifrati usano "indici ciechi" HMAC (nickname, prefissi del nome, città) che permettono il
  confronto senza conservare il valore in chiaro. I voti non contengono il codice utente: vedi votes.py (vote_owner).

FORMATO
- testo cifrato: "e1:" + base64url(nonce 12 byte + ciphertext + tag)
- file cifrato:  b"PLS1" + nonce 12 byte + ciphertext + tag
I dati salvati prima della cifratura (senza prefisso) vengono ancora letti, così le migrazioni non si rompono.
"""
import base64
import hashlib
import hmac
import os

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from sqlalchemy.sql import operators
from sqlalchemy.types import Text, TypeDecorator

from .config import DATA_KEY

TEXT_PREFIX = "e1:"
BLOB_MAGIC = b"PLS1"


def _derive(purpose: bytes) -> bytes:
    # una chiave diversa per ogni uso, tutte ricavate dalla chiave principale
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=purpose).derive(DATA_KEY)


_FIELDS = AESGCM(_derive(b"pulse/fields/v1"))
_MEDIA = AESGCM(_derive(b"pulse/media/v1"))
_INDEX_KEY = _derive(b"pulse/index/v1")


class DecryptionError(RuntimeError):
    pass


def encrypt_text(plain: str, aad: bytes) -> str:
    nonce = os.urandom(12)
    data = _FIELDS.encrypt(nonce, plain.encode("utf-8"), aad)
    return TEXT_PREFIX + base64.urlsafe_b64encode(nonce + data).decode("ascii")


def decrypt_text(value: str, aad: bytes) -> str:
    if not value.startswith(TEXT_PREFIX):
        return value  # dato salvato prima della cifratura
    raw = base64.urlsafe_b64decode(value[len(TEXT_PREFIX):])
    try:
        return _FIELDS.decrypt(raw[:12], raw[12:], aad).decode("utf-8")
    except Exception as e:  # chiave sbagliata o dato manomesso: meglio un errore chiaro che dati falsi
        raise DecryptionError("Impossibile decifrare un dato: PULSE_DATA_KEY è cambiata?") from e


def blind_index(value: str, purpose: str) -> str:
    """HMAC deterministico: permette 'questo nickname esiste già?' senza salvare il nickname in chiaro."""
    normalized = value.strip().lower()
    return hmac.new(_INDEX_KEY, f"{purpose}:{normalized}".encode("utf-8"), hashlib.sha256).hexdigest()


def nick_index(nickname: str) -> str:
    return blind_index(nickname, "nickname")


def city_index(city: str) -> str:
    return blind_index(city, "city")


def vote_owner(user_id: str) -> str:
    """Impronta di chi vota: nel database i voti non contengono il codice dell'utente.
    Senza la chiave non si risale alla persona; con uno scopo diverso dagli altri indici, non si incrocia con loro."""
    return blind_index(user_id, "vote-owner")


def encrypt_blob(data: bytes, name: str) -> bytes:
    nonce = os.urandom(12)
    return BLOB_MAGIC + nonce + _MEDIA.encrypt(nonce, data, name.encode("utf-8"))


def decrypt_blob(blob: bytes, name: str) -> bytes:
    if not blob.startswith(BLOB_MAGIC):
        return blob  # foto caricata prima della cifratura
    body = blob[len(BLOB_MAGIC):]
    try:
        return _MEDIA.decrypt(body[:12], body[12:], name.encode("utf-8"))
    except Exception as e:
        raise DecryptionError("Impossibile decifrare una foto: PULSE_DATA_KEY è cambiata?") from e


_FORBIDDEN_OPS = {
    operators.eq, operators.ne, operators.in_op, operators.not_in_op, operators.like_op, operators.ilike_op,
    operators.contains_op, operators.startswith_op, operators.endswith_op,
}


class Encrypted(TypeDecorator):
    """Colonna di testo cifrata in modo trasparente: nel codice è una normale stringa,
    nel database è illeggibile. Il nome della colonna è legato al dato (AAD): un valore copiato
    in un'altra colonna non si decifra."""

    impl = Text
    cache_ok = True

    class comparator_factory(Text.Comparator):
        # Ogni cifratura è diversa anche per lo stesso testo: un confronto SQL sarebbe sempre falso,
        # in silenzio. Meglio un errore subito: per cercare si usano gli indici ciechi (nickname_key, city_idx).
        def operate(self, op, *other, **kwargs):
            if op in _FORBIDDEN_OPS:
                raise TypeError("Campo cifrato: non si può confrontare in SQL. Usa l'indice cieco (es. nickname_key).")
            return super().operate(op, *other, **kwargs)

    def __init__(self, column: str):
        super().__init__()
        self.column = column
        self._aad = column.encode("utf-8")

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return encrypt_text(str(value), self._aad)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return decrypt_text(value, self._aad)

    def copy(self, **kw):
        return Encrypted(self.column)
