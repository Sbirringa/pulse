import { createContext, useContext } from "react";
import type { Me } from "./types";

/** Navigazione condivisa: aprire un profilo o un post, oppure chiedere di registrarsi. */
export interface Nav {
  me: Me | null;
  /** Aggiorna i dati del profilo in tutta l'app (es. dopo aver scelto la città). */
  updateMe: (m: Partial<Me>) => void;
  openProfile: (nickname: string) => void;
  openPost: (id: number) => void;
  openPoll: (id: number) => void;
  /** Apre il feed di una città (post e sondaggi di lì). */
  openCity: (city: string) => void;
  /** Ospite che prova a fare qualcosa: apre la schermata di accesso con un messaggio. */
  requireAuth: (reason?: string, mode?: "register" | "login") => void;
}

export const NavContext = createContext<Nav>({
  me: null,
  updateMe: () => undefined,
  openProfile: () => undefined,
  openPost: () => undefined,
  openPoll: () => undefined,
  openCity: () => undefined,
  requireAuth: () => undefined,
});

export const useNav = () => useContext(NavContext);
