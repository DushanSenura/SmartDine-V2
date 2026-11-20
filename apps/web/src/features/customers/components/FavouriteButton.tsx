import { Heart } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "@/features/auth/hooks/useAuth";
import { cn } from "@/lib/utils";

import { useFavourites, useToggleFavourite } from "../api/customerQueries";

/**
 * A heart on a menu card. Signed-in customers save the dish; anyone else is taken to sign in and
 * brought back to the menu. Staff don't have favourites, so they don't see it.
 */
export function FavouriteButton({ menuItemId, name }: { menuItemId: string; name: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isCustomer = user?.role === "CUSTOMER";
  const favourites = useFavourites(isCustomer);
  const toggle = useToggleFavourite();
  if (user && !isCustomer) return null;

  const saved = !!favourites.data?.includes(menuItemId);
  return (
    <button
      type="button"
      aria-pressed={isCustomer ? saved : undefined}
      aria-label={saved ? `Remove ${name} from favourites` : `Save ${name} to favourites`}
      onClick={() => {
        if (!isCustomer) return navigate("/login", { state: { from: location.pathname } });
        toggle.mutate({ menuItemId, saved });
      }}
      className="absolute top-2 right-2 grid size-9 place-items-center rounded-full bg-background/90 shadow-sm transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none motion-reduce:hover:scale-100"
    >
      <Heart
        aria-hidden
        className={cn("size-5", saved ? "fill-danger text-danger" : "text-muted-foreground")}
      />
    </button>
  );
}
