import type {
  AvailabilityDto,
  BranchDto,
  MenuCategoryDto,
  MenuItemDto,
  PrivateAvailabilityDto,
  PublicMenuDto,
} from "@smartdine/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { apiRequest } from "@/services/api/client";

export type PublicBranch = BranchDto;

export interface PublicCompany {
  name: string;
  logoUrl: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  currency: string;
  reservationDurationMinutes: number;
  cancellationWindowHours: number;
}

export interface PublicPrivateRoom {
  id: string;
  branchId: string;
  name: string;
  description: string | null;
  capacity: number;
  minimumGuests: number;
  maximumGuests: number;
  images: string[];
  amenities: string[];
  minimumSpend: number | null;
  hourlyRate: number | null;
  deposit: number | null;
  specialRules: string | null;
}

export interface MenuFilters {
  q?: string;
  vegetarian?: boolean;
  vegan?: boolean;
  halal?: boolean;
  spicy?: boolean;
  featured?: boolean;
  popular?: boolean;
  isNew?: boolean;
}

export function usePublicBranches() {
  return useQuery({
    queryKey: ["public", "branches"],
    queryFn: ({ signal }) => apiRequest<PublicBranch[]>("/public/branches", { signal }),
    staleTime: 5 * 60_000,
  });
}

export function usePublicCompany() {
  return useQuery({
    queryKey: ["public", "company"],
    queryFn: ({ signal }) => apiRequest<PublicCompany>("/public/company", { signal }),
    staleTime: 5 * 60_000,
  });
}

export function usePublicMenu(branchId: string | undefined, filters: MenuFilters = {}) {
  const params = new URLSearchParams({ branchId: branchId ?? "" });
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== false && value !== "") params.set(key, String(value));
  }
  return useQuery({
    queryKey: ["public", "menu", branchId, filters],
    queryFn: ({ signal }) => apiRequest<PublicMenuDto>(`/menu?${params}`, { signal }),
    enabled: !!branchId,
    placeholderData: keepPreviousData,
  });
}

export function useMenuItemDetail(branchId: string | undefined, slug: string | undefined) {
  return useQuery({
    queryKey: ["public", "menu-item", branchId, slug],
    queryFn: ({ signal }) =>
      apiRequest<{ item: MenuItemDto; related: MenuItemDto[] }>(
        `/menu/items/${slug}?branchId=${branchId}`,
        { signal },
      ),
    enabled: !!branchId && !!slug,
  });
}

export function usePublicPrivateRooms(branchId: string | undefined) {
  return useQuery({
    queryKey: ["public", "private-rooms", branchId],
    queryFn: ({ signal }) =>
      apiRequest<PublicPrivateRoom[]>(`/public/private-rooms?branchId=${branchId}`, { signal }),
    enabled: !!branchId,
  });
}

export function useGallery(branchId: string | undefined) {
  return useQuery({
    queryKey: ["public", "gallery", branchId],
    queryFn: ({ signal }) =>
      apiRequest<{ src: string; caption: string }[]>(`/public/gallery?branchId=${branchId}`, {
        signal,
      }),
    enabled: !!branchId,
  });
}

export function useAvailability(branchId: string | undefined, date: string, guests: number) {
  return useQuery({
    queryKey: ["availability", branchId, date, guests],
    queryFn: ({ signal }) =>
      apiRequest<AvailabilityDto>(
        `/reservations/availability?branchId=${branchId}&date=${date}&guests=${guests}`,
        { signal },
      ),
    enabled: !!branchId && /^\d{4}-\d{2}-\d{2}$/.test(date) && guests >= 1,
    // Availability changes as others book; never serve a stale grid for long.
    staleTime: 10_000,
  });
}

export function usePrivateAvailability(roomId: string | undefined, date: string) {
  return useQuery({
    queryKey: ["availability", "private", roomId, date],
    queryFn: ({ signal }) =>
      apiRequest<PrivateAvailabilityDto>(
        `/reservations/private/availability?roomId=${roomId}&date=${date}`,
        { signal },
      ),
    enabled: !!roomId && /^\d{4}-\d{2}-\d{2}$/.test(date),
    staleTime: 10_000,
  });
}

export type { MenuCategoryDto, MenuItemDto };
