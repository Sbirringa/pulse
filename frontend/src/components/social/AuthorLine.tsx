import { useNav } from "../../nav";
import Avatar from "./Avatar";

/** Foto + nome (o @nickname) di chi ha scritto: toccandoli si apre il suo profilo. */
export function AuthorAvatar({ nickname, name, avatar, size = 36 }: { nickname: string | null; name: string | null; avatar: string | null; size?: number }) {
  const { openProfile } = useNav();
  if (!nickname) return <Avatar name={null} size={size} />;
  return (
    <button onClick={() => openProfile(nickname)} aria-label={`Profilo di ${name ?? nickname}`} className="shrink-0 rounded-full">
      <Avatar name={name ?? nickname} src={avatar} size={size} />
    </button>
  );
}

export function AuthorName({ nickname, name, small = false }: { nickname: string; name: string | null; small?: boolean }) {
  const { openProfile } = useNav();
  return (
    <button onClick={() => openProfile(nickname)} className="min-w-0 max-w-full truncate text-left hover:underline">
      <span className={`font-bold text-zinc-100 ${small ? "text-xs" : "text-sm"}`}>{name ?? `@${nickname}`}</span>
      {name && <span className={`ml-1 text-zinc-500 ${small ? "text-xs" : "text-sm"}`}>@{nickname}</span>}
    </button>
  );
}
