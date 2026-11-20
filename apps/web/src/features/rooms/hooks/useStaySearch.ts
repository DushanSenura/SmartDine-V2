import { ROOM_RULES } from "@smartdine/shared";
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { usePublicBranch } from "@/features/public/hooks/usePublicBranch";
import { addDays, todayInZone } from "@/utils/format";

import type { StaySearch } from "../api/roomQueries";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const int = (value: string | null, fallback: number, min: number, max: number) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};

/**
 * The stay being searched, kept in the URL so results, room details and booking pages share it
 * and links can be bookmarked or shared. Falls back to a sensible default (tomorrow, 2 nights).
 */
export function useStaySearch() {
  const { branch } = usePublicBranch();
  const [params, setParams] = useSearchParams();
  const today = todayInZone(branch?.timezone ?? "UTC");

  const search: StaySearch = useMemo(() => {
    const rawIn = params.get("checkIn");
    const checkIn = rawIn && DATE.test(rawIn) && rawIn >= today ? rawIn : addDays(today, 1);
    const rawOut = params.get("checkOut");
    const checkOut = rawOut && DATE.test(rawOut) && rawOut > checkIn ? rawOut : addDays(checkIn, 2);
    return {
      checkIn,
      checkOut,
      adults: int(params.get("adults"), 2, 1, ROOM_RULES.maxGuestsPerBooking),
      children: int(params.get("children"), 0, 0, ROOM_RULES.maxGuestsPerBooking),
    };
  }, [params, today]);

  const setSearch = useCallback(
    (next: StaySearch) =>
      setParams(
        {
          checkIn: next.checkIn,
          checkOut: next.checkOut,
          adults: String(next.adults),
          children: String(next.children),
        },
        { replace: true },
      ),
    [setParams],
  );

  /** Query string to carry the current search to another page. */
  const queryString = new URLSearchParams({
    checkIn: search.checkIn,
    checkOut: search.checkOut,
    adults: String(search.adults),
    children: String(search.children),
  }).toString();

  return { search, setSearch, queryString, today };
}
