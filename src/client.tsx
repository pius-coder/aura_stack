/**
 * TanStack Start Client Entry Point
 *
 * This file hydrates the client-side application after server-side rendering.
 * It uses the StartClient component from @tanstack/react-start/client which
 * handles the hydration process seamlessly.
 *
 * Requirement 2.2: TanStack Start as the React meta-framework
 */
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
  );
});
