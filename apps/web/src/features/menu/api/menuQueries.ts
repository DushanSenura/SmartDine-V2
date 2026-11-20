import {
  SocketEvents,
  type AllergenDto,
  type AvailabilityStatus,
  type CreateCategoryInput,
  type CreateMenuItemInput,
  type MenuCategoryDto,
  type MenuItemDto,
  type UpdateCategoryInput,
  type UpdateMenuItemInput,
} from "@smartdine/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { apiRequest } from "@/services/api/client";
import { getSocket } from "@/services/socket/socket";
import { useBranchRoom } from "@/services/socket/useBranchRoom";

export const menuKeys = {
  admin: (branchId?: string) => ["menu", "admin", branchId] as const,
  categories: ["menu", "categories"] as const,
  allergens: ["menu", "allergens"] as const,
};

export function useAdminMenu(branchId: string | undefined) {
  return useQuery({
    queryKey: menuKeys.admin(branchId),
    queryFn: ({ signal }) =>
      apiRequest<MenuItemDto[]>(`/menu/admin?branchId=${branchId}`, { signal }),
    enabled: !!branchId,
  });
}

export function useAdminCategories(enabled = true) {
  return useQuery({
    queryKey: menuKeys.categories,
    queryFn: ({ signal }) => apiRequest<MenuCategoryDto[]>("/categories/admin", { signal }),
    enabled,
  });
}

export function useAllergens() {
  return useQuery({
    queryKey: menuKeys.allergens,
    queryFn: ({ signal }) => apiRequest<AllergenDto[]>("/menu/allergens", { signal }),
    staleTime: Infinity,
  });
}

/** Availability flips made on any screen (kitchen, manager) appear here without a refresh. */
export function useLiveMenu(branchId: string | undefined) {
  const queryClient = useQueryClient();
  useBranchRoom(branchId);

  useEffect(() => {
    if (!branchId) return;
    const socket = getSocket();
    const key = menuKeys.admin(branchId);
    const onUpdate = (payload: MenuItemDto | { id: string; deleted: true }) => {
      queryClient.setQueryData<MenuItemDto[]>(key, (current) => {
        if (!current) return current;
        if ("deleted" in payload) return current.filter((i) => i.id !== payload.id);
        if (payload.branchId !== branchId) return current;
        const existing = current.find((i) => i.id === payload.id);
        // The socket payload never carries cost data; keep what this staff member already sees.
        const merged = {
          ...payload,
          ...(existing && "costPrice" in existing && { costPrice: existing.costPrice }),
        };
        return existing
          ? current.map((i) => (i.id === payload.id ? merged : i))
          : [...current, merged];
      });
    };
    socket.on(SocketEvents.MENU_ITEM_UPDATED, onUpdate);
    return () => {
      socket.off(SocketEvents.MENU_ITEM_UPDATED, onUpdate);
    };
  }, [branchId, queryClient]);
}

function useMenuMutation<TVars, TData>(fn: (vars: TVars) => Promise<TData>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["menu"] });
      void queryClient.invalidateQueries({ queryKey: ["public"] });
    },
  });
}

export const useSaveMenuItem = () =>
  useMenuMutation(
    ({ id, input }: { id?: string; input: CreateMenuItemInput | UpdateMenuItemInput }) =>
      id
        ? apiRequest<MenuItemDto>(`/menu/items/${id}`, { method: "PATCH", body: input })
        : apiRequest<MenuItemDto>("/menu/items", { method: "POST", body: input }),
  );

export const useDeleteMenuItem = () =>
  useMenuMutation((id: string) => apiRequest<null>(`/menu/items/${id}`, { method: "DELETE" }));

export const useSetAvailability = () =>
  useMenuMutation(({ id, availability }: { id: string; availability: AvailabilityStatus }) =>
    apiRequest<MenuItemDto>(`/menu/items/${id}/availability`, {
      method: "PATCH",
      body: { availability },
    }),
  );

export const useSaveCategory = () =>
  useMenuMutation(
    ({ id, input }: { id?: string; input: CreateCategoryInput | UpdateCategoryInput }) =>
      id
        ? apiRequest<MenuCategoryDto>(`/categories/${id}`, { method: "PATCH", body: input })
        : apiRequest<MenuCategoryDto>("/categories", { method: "POST", body: input }),
  );

export const useDeleteCategory = () =>
  useMenuMutation((id: string) => apiRequest<null>(`/categories/${id}`, { method: "DELETE" }));
