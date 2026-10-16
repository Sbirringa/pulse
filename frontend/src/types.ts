export type Vote = -1 | 0 | 1;

export interface Me {
  nickname: string;
  city: string | null;
  answered: number;
  name: string | null;
  bio: string | null;
  avatar: string | null;
  approve_followers: boolean;
  /** profilo privato: post e sondaggi solo per chi si segue a vicenda */
  is_private: boolean;
  /** città dichiarate ("sono di qui"), oltre a quella del profilo */
  places: string[];
  is_admin: boolean;
  pending_requests: number;
  followers: number;
  following: number;
  posts: number;
  /** persone diverse che hanno risposto ai post o votato i sondaggi (ognuna conta una volta) */
  reached: number;
  reached_recent: number;
  reached_polls: number;
  reached_posts: number;
  /** il contenuto che ha coinvolto più persone (da 2 in su) */
  top: { type: "poll" | "post"; id: number; text: string; people: number } | null;
  polls: number;
}

export interface Relation {
  following: "none" | "pending" | "accepted" | "self";
  follows_you: boolean;
  requested_you: boolean;
}

export interface PersonCard {
  nickname: string;
  name: string | null;
  avatar: string | null;
  relation?: Relation;
}

export interface Profile extends PersonCard {
  bio: string | null;
  followers: number;
  following: number;
  posts: number;
  reached: number;
  reached_recent: number;
  reached_polls: number;
  reached_posts: number;
  /** il contenuto che ha coinvolto più persone (da 2 in su) */
  top: { type: "poll" | "post"; id: number; text: string; people: number } | null;
  polls: number;
  relation: Relation;
  approve_followers: boolean;
  is_private: boolean;
  /** chi guarda può vedere post e sondaggi (pubblico, se stesso, o vi seguite a vicenda) */
  can_see: boolean;
}

export interface AuthResult {
  user: Me;
  recovery_code?: string;
}

export interface PrivacyInfo {
  controller: string | null;
  contact: string | null;
  version: string;
  min_age: number;
  min_results: number;
  min_city_results: number;
}

export interface Meta {
  cities: string[];
  categories: string[];
  privacy: PrivacyInfo | null;
  /** indirizzo pubblico del codice (GitHub); null finché non è configurato */
  source_url?: string | null;
  terms_version?: string;
  report_threshold?: number;
  proposal_goal?: number;
}

export interface Question {
  id: number;
  title: string;
  description: string;
  category: string;
  scope: "national" | "local";
  city: string | null;
  participants: number;
  ends_at?: string | null;
  ended?: boolean;
  image?: ImageRef | null;
}

/** Sondaggio completo: foto, autore, scadenza, il tuo voto e (se puoi vederli) i risultati. */
export interface Poll extends Question {
  type: "poll";
  ends_at: string | null;
  ended: boolean;
  created_at: string;
  author: PersonCard | null;
  is_author: boolean;
  image: ImageRef | null;
  divisive: boolean;
  my_vote: Vote | null;
  my_resident: boolean | null;
  is_resident: boolean;
  /** sondaggio di una città: all = votano tutti · local = solo chi è di lì */
  audience: "all" | "local";
  can_vote: boolean;
  reported: boolean;
  /** le ragioni: quante per lato, la più utile di ciascun lato, se posso aggiungerne */
  arguments?: ArgumentSummary;
  /** presente solo nella domanda del giorno */
  today?: { local: boolean };
  // pct e counts sono null finché non votano abbastanza persone (il voto resta segreto)
  results: { total: number; pct: Pct | null; counts: Pct | null; low_sample: boolean; local?: LocalSplit | null } | null;
  status?: string;
}

/** Una ragione sotto un sondaggio: senza nome, "Utile" la fa salire. */
export interface Argument {
  id: number;
  side: "yes" | "no";
  body: string;
  useful: number;
  voted: boolean;
  mine: boolean;
  hidden: boolean;
}

export interface ArgumentSummary {
  yes: number;
  no: number;
  top_yes: Argument | null;
  top_no: Argument | null;
  can_add: boolean;
}

/** Sondaggi di una città: voti di chi è "di qui" e di chi è "di fuori" (pct null = troppo pochi per mostrarlo). */
export interface LocalSplit {
  residents: { total: number; pct: Pct | null };
  outside: { total: number; pct: Pct | null };
}

export type FeedItem = (Post & { type: "post" }) | Poll;

/** In evidenza: un contenuto con le persone coinvolte negli ultimi 7 giorni. */
export type TrendingItem = FeedItem & { week_people: number };
export interface Trending {
  where: "italy" | "city";
  city: string | null;
  days: number;
  items: TrendingItem[];
}

export interface NotificationItem {
  id: number;
  kind: "follow" | "follow_request" | "follow_accepted" | "comment" | "reply" | "poll_ended" | "proposal_poll";
  read: boolean;
  created_at: string;
  actor: PersonCard | null;
  post_id: number | null;
  comment_id: number | null;
  question_id: number | null;
  text: string | null;
  post_text?: string | null;
  following_back?: boolean;
  poll?: { total: number; pct: Pct | null; mine: boolean };
  /** proposal_poll: la proposta era tua */
  mine?: boolean;
}

export interface Pct {
  yes: number;
  depends: number;
  no: number;
}

export interface Results {
  question_id: number;
  total: number;
  counts: Pct | null;
  pct: Pct | null;
  low_sample: boolean;
  city: { name: string; total: number; pct: Pct } | null;
  mine: Vote | null;
  ended?: boolean;
  local?: LocalSplit | null;
}

export interface PulseData {
  answered: number;
  comparable: number;
  aligned_pct: number | null;
  streak: number;
  categories: { category: string; answered: number }[];
  recent: {
    question_id: number;
    title: string;
    category: string;
    mine: Vote;
    total: number;
    pct: Pct | null;
  }[];
  min_results: number;
}

export interface ProposalItem {
  id: number;
  title: string;
  category: string;
  status: "pending" | "approved" | "rejected" | "hidden";
}

export interface ImageRef {
  id: string;
  w: number;
  h: number;
  sm: string;
  lg: string;
}

export interface Post {
  id: number;
  author: string;
  author_name: string | null;
  author_avatar: string | null;
  mine: boolean;
  body: string;
  category: string | null;
  scope: "national" | "local";
  city: string | null;
  status: "visible" | "hidden";
  created_at: string;
  images: ImageRef[];
  comment_count: number;
  people: number;
  reported: boolean;
  /** post: racconto · proposal: proposta che con abbastanza sostenitori diventa un sondaggio */
  kind: "post" | "proposal";
  headline: string | null;
  /** quante persone hanno toccato "Anch'io" / "Sostengo" (solo il numero) */
  supports: number;
  supported: boolean;
  goal: number | null;
  poll_id: number | null;
  /** post di una città: all = partecipano tutti · local = solo chi è di lì */
  audience: "all" | "local";
}

export interface CommentItem {
  id: number;
  parent_id: number | null;
  author: string | null;
  author_name: string | null;
  author_avatar: string | null;
  mine: boolean;
  body: string;
  status: "visible" | "hidden" | "deleted";
  image: ImageRef | null;
  reply_to: string | null;
  created_at: string;
  reported: boolean;
}

export interface Thread extends CommentItem {
  replies: CommentItem[];
}

export interface ReportReason {
  id: string;
  label: string;
}

export interface AdminItem {
  type: "post" | "comment" | "question" | "argument" | "user";
  id: number;
  status: string;
  reports: number;
  reasons: Record<string, number>;
  author: string | null;
  author_banned: boolean;
  body: string;
  post_id: number | null;
  images: string[];
}
