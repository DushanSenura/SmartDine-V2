import { create } from "zustand";

export type ToastTone = "info" | "success" | "warning" | "danger";

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
  /** Where clicking the toast goes, when it is about something. */
  to?: string;
}

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, "id">, durationMs?: number) => number;
  dismiss: (id: number) => void;
}

const MAX_VISIBLE = 4;
let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (toast, durationMs = 6000) => {
    const id = nextId++;
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }].slice(-MAX_VISIBLE) }));
    if (durationMs > 0)
      timers.set(
        id,
        setTimeout(() => get().dismiss(id), durationMs),
      );
    return id;
  },
  dismiss: (id) => {
    clearTimeout(timers.get(id));
    timers.delete(id);
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
  },
}));

/** Imperative helper for code outside React (socket handlers, mutation callbacks). */
export const toast = {
  show: (toast: Omit<Toast, "id">, durationMs?: number) =>
    useToastStore.getState().push(toast, durationMs),
  dismiss: (id: number) => useToastStore.getState().dismiss(id),
};
