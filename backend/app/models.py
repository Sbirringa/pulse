from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, validates

from .crypto import Encrypted, city_index, nick_index
from .db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)  # uuid4 hex, casuale
    # Dati personali CIFRATI nel database (vedi crypto.py). Gli *_key/_idx sono indici ciechi HMAC:
    # servono a confrontare (nickname già usato? stessa città?) senza conservare il valore in chiaro.
    nickname: Mapped[str] = mapped_column(Encrypted("users.nickname"))
    nickname_key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    display_name: Mapped[str | None] = mapped_column(Encrypted("users.display_name"), nullable=True)  # nome reale, facoltativo
    bio: Mapped[str | None] = mapped_column(Encrypted("users.bio"), nullable=True)
    avatar_id: Mapped[str | None] = mapped_column(String(32), nullable=True)  # foto profilo (cifrata nello storage)
    approve_followers: Mapped[bool] = mapped_column(Boolean, default=True)  # True: le richieste vanno approvate
    # profilo privato: post e sondaggi li vede solo chi si segue a vicenda (nome, foto e bio restano visibili)
    is_private: Mapped[bool] = mapped_column(Boolean, default=False)
    password_hash: Mapped[str] = mapped_column(String(255))
    recovery_hash: Mapped[str] = mapped_column(String(255))
    city: Mapped[str | None] = mapped_column(Encrypted("users.city"), nullable=True)
    city_idx: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    is_banned: Mapped[bool] = mapped_column(Boolean, default=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)  # amministratore: modera dall'app
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    # Consenso esplicito (GDPR art. 9: le risposte possono rivelare opinioni politiche)
    consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    privacy_version: Mapped[str | None] = mapped_column(String(20), nullable=True)

    @validates("nickname")
    def _sync_nickname_key(self, _key, value):
        self.nickname_key = nick_index(value)
        return value

    @validates("city")
    def _sync_city_idx(self, _key, value):
        self.city_idx = city_index(value) if value else None
        return value


class Follow(Base):
    """Chi segue chi. status: pending (richiesta in attesa) | accepted."""

    __tablename__ = "follows"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    follower_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    followee_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(10), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    __table_args__ = (
        UniqueConstraint("follower_id", "followee_id", name="uq_follow_pair"),
        CheckConstraint("follower_id <> followee_id", name="ck_follow_not_self"),
    )


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    seed_key: Mapped[str | None] = mapped_column(String(60), unique=True, nullable=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(40), index=True)
    scope: Mapped[str] = mapped_column(String(10), default="national")  # national | local
    city: Mapped[str | None] = mapped_column(String(60), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(10), default="approved", index=True)
    author_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    # scadenza scelta da chi crea il sondaggio (None = sempre aperto); dopo si vedono solo i risultati
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    ended_notified: Mapped[bool] = mapped_column(Boolean, default=False)
    # solo per i sondaggi di una città: all = votano tutti (chi è di fuori conta a parte) · local = solo chi è di lì
    audience: Mapped[str] = mapped_column(String(10), default="all")


class Post(Base):
    """Post della Piazza: testo e fino a 4 foto."""

    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    body: Mapped[str] = mapped_column(Encrypted("posts.body"), default="")
    category: Mapped[str | None] = mapped_column(String(40), nullable=True)
    scope: Mapped[str] = mapped_column(String(10), default="national")  # national | local
    city: Mapped[str | None] = mapped_column(String(60), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(10), default="visible", index=True)  # visible | hidden
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    # post | proposal. Una proposta ha una frase-titolo e, raggiunti i sostenitori, diventa un sondaggio (poll_id)
    kind: Mapped[str] = mapped_column(String(10), default="post")
    headline: Mapped[str | None] = mapped_column(Encrypted("posts.headline"), nullable=True)
    poll_id: Mapped[int | None] = mapped_column(ForeignKey("questions.id", ondelete="SET NULL"), nullable=True)
    # solo per i post di una città: all = partecipano tutti · local = commentano e sostengono solo le persone di lì
    audience: Mapped[str] = mapped_column(String(10), default="all")


class Argument(Base):
    """Una ragione sotto un sondaggio: "perché sì" (side=1) o "perché no" (side=-1). Senza nome visibile
    (chi scrive non rivela come vota); testo cifrato. Una per lato per persona."""

    __tablename__ = "arguments"
    __table_args__ = (UniqueConstraint("question_id", "author_id", "side", name="uq_argument_side"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    side: Mapped[int] = mapped_column(Integer)
    body: Mapped[str] = mapped_column(Encrypted("arguments.body"))
    status: Mapped[str] = mapped_column(String(10), default="visible")  # visible | hidden
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class ArgumentVote(Base):
    """"Utile": una persona, una volta per ragione."""

    __tablename__ = "argument_votes"
    __table_args__ = (UniqueConstraint("argument_id", "user_id", name="uq_argument_vote"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    argument_id: Mapped[int] = mapped_column(ForeignKey("arguments.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class CityPlace(Base):
    """Città di cui una persona ha dichiarato di essere (ci vive, lavora o studia). Si chiede una volta per città.
    Il nome è cifrato; city_idx (indice cieco) serve per il confronto."""

    __tablename__ = "city_places"
    __table_args__ = (UniqueConstraint("user_id", "city_idx", name="uq_city_place"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    city: Mapped[str] = mapped_column(Encrypted("city_places.city"))
    city_idx: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class PostSupport(Base):
    """"Anch'io" su un post o "Sostengo" su una proposta: una persona, una volta. Si mostra solo il numero."""

    __tablename__ = "post_supports"
    __table_args__ = (UniqueConstraint("post_id", "user_id", name="uq_post_support"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Comment(Base):
    """Commento a un post. Un solo livello di risposte: parent_id è sempre il commento principale,
    reply_to_id è il commento a cui si risponde (per mostrare "@nickname")."""

    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("comments.id", ondelete="CASCADE"), nullable=True, index=True
    )
    reply_to_id: Mapped[int | None] = mapped_column(
        ForeignKey("comments.id", ondelete="SET NULL"), nullable=True
    )
    body: Mapped[str] = mapped_column(Encrypted("comments.body"), default="")
    status: Mapped[str] = mapped_column(String(10), default="visible")  # visible | hidden | deleted
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Image(Base):
    """Foto caricata (già ripulita dai metadati e convertita in WebP). I file stanno nello storage:
    img/<id>/sm.webp (anteprima) e img/<id>/lg.webp (grande)."""

    __tablename__ = "images"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    post_id: Mapped[int | None] = mapped_column(
        ForeignKey("posts.id", ondelete="CASCADE"), nullable=True, index=True
    )
    comment_id: Mapped[int | None] = mapped_column(
        ForeignKey("comments.id", ondelete="CASCADE"), nullable=True, index=True
    )
    question_id: Mapped[int | None] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), nullable=True, index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0)
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Report(Base):
    """Segnalazione di un post o commento. Ogni utente può segnalare un contenuto una sola volta."""

    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    reporter_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    target_type: Mapped[str] = mapped_column(String(10))  # post | comment | question | user
    target_id: Mapped[int] = mapped_column(Integer)  # id del post/commento (0 per i profili)
    # id utente per i profili; "" per post e commenti (non NULL: nei vincoli UNIQUE i NULL non si confrontano)
    target_ref: Mapped[str] = mapped_column(String(32), default="", server_default="")
    reason: Mapped[str] = mapped_column(String(20))
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    __table_args__ = (
        UniqueConstraint("reporter_id", "target_type", "target_id", "target_ref", name="uq_report_once"),
        Index("ix_reports_target", "target_type", "target_id"),
    )


class Vote(Base):
    """Un voto, protetto: non contiene il codice dell'utente ma un'impronta (owner, HMAC con chiave segreta)
    e il contenuto è cifrato. Chi apre il database non sa né chi ha votato né cosa.
    - owner: impronta della persona (un voto per persona per sondaggio, "Le tue risposte")
    - user_ref: chi ha votato, CIFRATO (serve solo per avvisare quando il sondaggio si conclude)
    - value / resident / city_ref: il voto, "di qui o da fuori" e l'indice della città al momento del voto, CIFRATI
    Le percentuali si leggono dai contatori (VoteTally), non dai singoli voti."""

    __tablename__ = "votes"
    __table_args__ = (UniqueConstraint("question_id", "owner", name="uq_vote_owner"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"), index=True)
    owner: Mapped[str] = mapped_column(String(64), index=True)
    user_ref: Mapped[str] = mapped_column(Encrypted("votes.user_ref"))
    value: Mapped[str] = mapped_column(Encrypted("votes.value"))  # "1" favorevole, "0" dipende, "-1" contrario
    resident: Mapped[str | None] = mapped_column(Encrypted("votes.resident"), nullable=True)  # "1" di qui, "0" da fuori
    city_ref: Mapped[str | None] = mapped_column(Encrypted("votes.city_ref"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class VoteTally(Base):
    """Contatori dei voti per sondaggio: valore × (di qui / da fuori / non indicato). Solo numeri, nessuna persona."""

    __tablename__ = "vote_tallies"

    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"), primary_key=True)
    value: Mapped[int] = mapped_column(Integer, primary_key=True)
    resident: Mapped[int] = mapped_column(Integer, primary_key=True)  # 1 di qui, 0 da fuori, -1 non indicato
    n: Mapped[int] = mapped_column(Integer, default=0)


class Notification(Base):
    """Avviso per un utente. Non contiene testi: il contenuto si legge (decifrato) solo quando lo apri.
    kind: follow | follow_request | follow_accepted | comment | reply | poll_ended"""

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    kind: Mapped[str] = mapped_column(String(20))
    post_id: Mapped[int | None] = mapped_column(ForeignKey("posts.id", ondelete="CASCADE"), nullable=True)
    comment_id: Mapped[int | None] = mapped_column(ForeignKey("comments.id", ondelete="CASCADE"), nullable=True)
    question_id: Mapped[int | None] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"), nullable=True)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    __table_args__ = (Index("ix_notifications_user", "user_id", "read", "id"),)


class NamePrefix(Base):
    """Impronte (HMAC) dei pezzi iniziali di nome utente e nome reale, per la ricerca mentre si scrive.
    Nel database non c'è mai il nome in chiaro: solo "questa persona ha una parola che inizia con …"."""

    __tablename__ = "name_prefixes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    h: Mapped[str] = mapped_column(String(32), index=True)

    __table_args__ = (UniqueConstraint("user_id", "h", name="uq_name_prefix"),)
