import type {
  Argument,
  Trending,
  AdminItem,
  AuthResult,
  PersonCard,
  Profile,
  CommentItem,
  Me,
  Meta,
  FeedItem,
  NotificationItem,
  Poll,
  Post,
  PulseData,
  Question,
  ReportReason,
  Results,
  Thread,
  Vote,
} from "./types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const errMsg = (e: unknown): string =>
  e instanceof Error ? e.message : "Errore imprevisto. Riprova.";

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      // con FormData il browser imposta da solo multipart/form-data e il "boundary"
      headers: body !== undefined && !isForm ? { "Content-Type": "application/json" } : undefined,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Connessione assente. Controlla la rete e riprova.");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const fallback =
      res.status === 413 ? "File troppo grandi." : "Qualcosa è andato storto. Riprova.";
    const detail = data && typeof data.detail === "string" ? data.detail : fallback;
    throw new ApiError(res.status, detail);
  }
  return data as T;
}

export const api = {
  meta: () => call<Meta>("GET", "/meta"),
  me: () => call<Me>("GET", "/me"),
  setCity: (city: string | null) => call<Me>("PATCH", "/me", { city }),
  register: (nickname: string, password: string, city: string | null, consent: boolean) =>
    call<AuthResult>("POST", "/auth/register", { nickname, password, city, consent }),
  changePassword: (current_password: string, new_password: string) =>
    call<void>("POST", "/me/password", { current_password, new_password }),
  newRecoveryCode: (password: string) => call<{ recovery_code: string }>("POST", "/me/recovery-code", { password }),
  deleteAccount: (password: string) => call<void>("POST", "/me/delete", { password }),
  login: (nickname: string, password: string) =>
    call<AuthResult>("POST", "/auth/login", { nickname, password }),
  recover: (nickname: string, recovery_code: string, new_password: string) =>
    call<AuthResult>("POST", "/auth/recover", { nickname, recovery_code, new_password }),
  logout: () => call<void>("POST", "/auth/logout"),
  publicQuestion: (id: number) => call<Question>("GET", `/public/questions/${id}`),
  next: (limit: number, first: number | null) =>
    call<Poll[]>("GET", `/questions/next?limit_n=${limit}${first ? `&first=${first}` : ""}`),
  poll: (id: number) => call<Poll>("GET", `/questions/${id}`),
  polls: (opts: { status?: "open" | "ended" | "all"; author?: string; city?: string; following?: boolean; before?: number | null }) => {
    const q = new URLSearchParams();
    if (opts.status) q.set("status", opts.status);
    if (opts.author) q.set("author", opts.author);
    if (opts.city) q.set("city", opts.city);
    if (opts.following) q.set("following", "true");
    if (opts.before) q.set("before", String(opts.before));
    return call<{ items: Poll[]; next: number | null }>("GET", `/polls?${q}`);
  },
  trending: (where: "italy" | "city", city?: string | null, exclude?: number | null) => {
    const q = new URLSearchParams({ where });
    if (city) q.set("city", city);
    if (exclude) q.set("exclude", String(exclude));
    return call<Trending>("GET", `/trending?${q}`);
  },
  pollToday: () => call<Poll | null>("GET", "/polls/today"),
  arguments: (qid: number) => call<{ yes: Argument[]; no: Argument[] }>("GET", `/questions/${qid}/arguments`),
  addArgument: (qid: number, side: "yes" | "no", body: string) =>
    call<Argument>("POST", `/questions/${qid}/arguments`, { side, body }),
  deleteArgument: (id: number) => call<void>("DELETE", `/arguments/${id}`),
  usefulArgument: (id: number, on: boolean) => call<Argument>(on ? "POST" : "DELETE", `/arguments/${id}/useful`),
  createPoll: (form: FormData) => call<Poll>("POST", "/polls", form),
  deletePoll: (id: number) => call<void>("DELETE", `/questions/${id}`),
  results: (id: number) => call<Results>("GET", `/questions/${id}/results`),
  vote: (id: number, value: Vote, resident?: boolean) =>
    call<Results>("POST", `/questions/${id}/vote`, resident === undefined ? { value } : { value, resident }),
  pulse: () => call<PulseData>("GET", "/me/pulse"),

  // Notifiche
  unread: () => call<{ count: number; pending_requests: number }>("GET", "/notifications/unread"),
  notifications: (before: number | null) =>
    call<{ items: NotificationItem[]; next: number | null }>("GET", `/notifications${before ? `?before=${before}` : ""}`),
  markRead: () => call<void>("POST", "/notifications/read"),

  // Piazza
  posts: (scope: "all" | "city" | "following", before: number | null, city?: string, kind: "all" | "posts" = "all") =>
    call<{ items: FeedItem[]; next: number | null }>(
      "GET",
      `/posts?scope=${scope}&limit_n=15&kind=${kind}${before ? `&before=${before}` : ""}${
        scope === "city" && city ? `&city=${encodeURIComponent(city)}` : ""
      }`,
    ),
  post: (id: number) => call<Post>("GET", `/posts/${id}`),
  createPost: (form: FormData) => call<Post>("POST", "/posts", form),
  deletePost: (id: number) => call<void>("DELETE", `/posts/${id}`),
  supportPost: (id: number, on: boolean) => call<Post>(on ? "POST" : "DELETE", `/posts/${id}/support`),
  addPlace: (city: string) => call<{ places: string[] }>("POST", "/me/places", { city }),
  removePlace: (city: string) => call<{ places: string[] }>("DELETE", "/me/places", { city }),
  comments: (postId: number) => call<{ threads: Thread[]; total: number }>("GET", `/posts/${postId}/comments`),
  createComment: (postId: number, form: FormData) => call<CommentItem>("POST", `/posts/${postId}/comments`, form),
  deleteComment: (id: number) => call<void>("DELETE", `/comments/${id}`),
  reportReasons: () => call<ReportReason[]>("GET", "/report-reasons"),
  report: (target_type: "post" | "comment" | "question" | "argument" | "user", target: number | string, reason: string) =>
    call<{ hidden: boolean }>(
      "POST",
      "/reports",
      target_type === "user"
        ? { target_type, target_nickname: target, reason }
        : { target_type, target_id: target, reason },
    ),

  // Profili e follow
  updateProfile: (p: { display_name?: string; bio?: string; approve_followers?: boolean; is_private?: boolean }) =>
    call<Me>("PATCH", "/me/profile", p),
  uploadAvatar: (form: FormData) => call<{ avatar: string }>("POST", "/me/avatar", form),
  deleteAvatar: () => call<void>("DELETE", "/me/avatar"),
  profile: (nick: string) => call<Profile>("GET", `/users/${encodeURIComponent(nick)}`),
  userPosts: (nick: string, before: number | null) =>
    call<{ items: Post[]; next: number | null }>(
      "GET",
      `/users/${encodeURIComponent(nick)}/posts${before ? `?before=${before}` : ""}`,
    ),
  people: (nick: string, kind: "followers" | "following", q = "") =>
    call<{ items: PersonCard[]; next: number | null }>(
      "GET",
      `/users/${encodeURIComponent(nick)}/${kind}${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`,
    ),
  follow: (nick: string) => call<Profile>("POST", `/users/${encodeURIComponent(nick)}/follow`),
  unfollow: (nick: string) => call<Profile>("DELETE", `/users/${encodeURIComponent(nick)}/follow`),
  removeFollower: (nick: string) => call<Profile>("DELETE", `/users/${encodeURIComponent(nick)}/follower`),
  requests: () => call<PersonCard[]>("GET", "/me/requests"),
  answerRequest: (nick: string, action: "accept" | "decline") =>
    call<{ pending_requests: number }>("POST", `/me/requests/${encodeURIComponent(nick)}/${action}`),
  searchUsers: (q: string) => call<PersonCard[]>("GET", `/users/search?q=${encodeURIComponent(q)}`),

  // Amministrazione (solo per gli amministratori)
  adminReports: () => call<AdminItem[]>("GET", "/admin/reports"),
  adminContent: (type: "post" | "comment" | "question" | "argument", id: number, action: "restore" | "remove") =>
    call<{ ok: boolean }>("POST", `/admin/content/${type}/${id}/${action}`),
  adminProfile: (nick: string, action: "restore" | "reset") =>
    call<{ ok: boolean }>("POST", `/admin/users/${encodeURIComponent(nick)}/profile/${action}`),
  adminBan: (nickname: string, purge: boolean) => call<{ banned: boolean }>("POST", "/admin/users/ban", { nickname, purge }),
};
