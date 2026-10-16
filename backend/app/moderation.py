"""Filtro automatico per i sondaggi proposti: blocca insulti e bestemmie prima della pubblicazione.

Non è perfetto (nessun filtro lo è): serve a fermare i casi più evidenti senza che un moderatore
debba approvare ogni proposta. Il resto lo fanno le segnalazioni degli utenti.
Per aggiungere parole: in minuscolo e senza accenti, in ROOTS (radici) o WORDS (parole intere).
"""
import re
import unicodedata

# RADICI: bloccano anche le varianti (es. "coglion" → coglione, coglioni, coglionata)
ROOTS = {
    "porco dio", "porcodio", "dio porco", "dioporco", "dio cane", "diocane", "porca madonna", "madonna puttana",
    "porco cristo", "vaffanculo", "fanculo", "affanculo", "stronz", "coglion", "cazzo", "cazzi", "minchia",
    "puttan", "troia", "merda", "frocio", "froci", "ricchion", "mongoloid", "impiccat",
}
# PAROLE INTERE: bloccate solo da sole (così "Cristoforo" o "Ammazzacaffè" passano)
WORDS = {"bastardo", "bastardi", "bastarda", "bastarde", "negro", "negri", "uccidete", "ammazzatelo", "ammazzateli"}
_LEET = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s"})


def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))   # niente accenti
    text = text.translate(_LEET)
    text = re.sub(r"[^a-z]+", " ", text)                                 # punteggiatura → spazio
    return f" {text.strip()} "


def _squeeze(text: str) -> str:
    return re.sub(r"(.)\1+", r"\1", text)  # "cazzzzo" e "cazzo" → "cazo": le lettere ripetute non aggirano il filtro


def contains_blocked(*texts: str) -> bool:
    for raw in texts:
        norm = _squeeze(_normalize(raw))
        for root in ROOTS:
            if " " + _squeeze(_normalize(root).strip()) in norm:          # inizio di parola + radice
                return True
        for word in WORDS:
            if " " + _squeeze(_normalize(word).strip()) + " " in norm:    # parola intera
                return True
    return False


# --- argomenti scelti dalle persone (oltre a quelli proposti) ---------------------------------
import re as _re

TOPIC_RE = _re.compile(r"^[^\W_][\w '’\-]*$")


def clean_topic(value: str | None, suggested: list[str]) -> str | None:
    """Argomento di un post o sondaggio: uno di quelli proposti oppure uno scritto da chi pubblica.
    Lancia ValueError con un messaggio chiaro se non va bene."""
    v = " ".join((value or "").split())
    if not v:
        return None
    for s in suggested:  # "trasporti" → "Trasporti"
        if v.lower() == s.lower():
            return s
    if not 2 <= len(v) <= 24:
        raise ValueError("L'argomento deve avere tra 2 e 24 caratteri.")
    if not TOPIC_RE.match(v):
        raise ValueError("Nell'argomento usa solo lettere, numeri e spazi.")
    if contains_blocked(v):
        raise ValueError("L'argomento contiene parole offensive.")
    return v[0].upper() + v[1:]
