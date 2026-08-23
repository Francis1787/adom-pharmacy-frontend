// Shared React Query hooks + toast helpers for the API layer.
import { useMutation, useQuery, useQueryClient, type UseMutationOptions } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ApiError,
  auditLogApi,
  batchesApi,
  customersApi,
  doctorsApi,
  drugsApi,
  prescriptionsApi,
  purchaseOrdersApi,
  salesApi,
  staffApi,
} from "@/api";

export const qk = {
  staff: ["staff"] as const,
  customers: ["customers"] as const,
  doctors: ["doctors"] as const,
  drugs: ["drugs"] as const,
  batches: ["batches"] as const,
  prescriptions: ["prescriptions"] as const,
  sales: ["sales"] as const,
  purchaseOrders: ["purchase-orders"] as const,
  auditLog: ["audit-log"] as const,
};

export const useStaff = () => useQuery({ queryKey: qk.staff, queryFn: staffApi.list });
export const useCustomers = () => useQuery({ queryKey: qk.customers, queryFn: customersApi.list });
export const useDoctors = () => useQuery({ queryKey: qk.doctors, queryFn: doctorsApi.list });
export const useDrugs = () => useQuery({ queryKey: qk.drugs, queryFn: drugsApi.list });
export const useBatches = () => useQuery({ queryKey: qk.batches, queryFn: batchesApi.list });
export const usePrescriptions = () => useQuery({ queryKey: qk.prescriptions, queryFn: prescriptionsApi.list });
export const useSales = () => useQuery({ queryKey: qk.sales, queryFn: salesApi.list });
export const usePurchaseOrders = () => useQuery({ queryKey: qk.purchaseOrders, queryFn: purchaseOrdersApi.list });
export const useAuditLog = () => useQuery({ queryKey: qk.auditLog, queryFn: auditLogApi.list });

export function toastApiError(e: unknown, fallback = "Something went wrong") {
  if (e instanceof ApiError) {
    if (e.isForbidden) {
      toast.error("You don't have permission to do that.");
      return;
    }
    if (e.isFieldError) {
      // Field errors handled at form level — still surface a note.
      toast.error(e.message || "Please correct the highlighted fields.");
      return;
    }
    toast.error(e.message || fallback);
    return;
  }
  if (e instanceof Error) toast.error(e.message || fallback);
  else toast.error(fallback);
}

export function useApiMutation<TData, TVariables = void>(
  fn: (v: TVariables) => Promise<TData>,
  opts: {
    invalidate?: readonly (readonly unknown[])[];
    successMessage?: string;
    onSuccess?: (data: TData, v: TVariables) => void;
    onError?: (err: unknown) => void;
  } = {},
) {
  const qc = useQueryClient();
  const mut: UseMutationOptions<TData, unknown, TVariables> = {
    mutationFn: fn,
    onSuccess: (data, v) => {
      opts.invalidate?.forEach((k) => qc.invalidateQueries({ queryKey: k as unknown[] }));
      if (opts.successMessage) toast.success(opts.successMessage);
      opts.onSuccess?.(data, v);
    },
    onError: (err) => {
      if (opts.onError) opts.onError(err);
      else toastApiError(err);
    },
  };
  return useMutation(mut);
}
