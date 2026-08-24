// Real HTTP client for Adom Pharmacy backend.
// Every response is wrapped in { success, data, message, timestamp }.

const BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://localhost:8080/api/v1";

const TOKEN_KEY = "adom_token";

export const tokenStore = {
  get: () => (typeof localStorage === "undefined" ? null : localStorage.getItem(TOKEN_KEY)),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

// ---------- Types ----------

export type Role = "Pharmacist" | "Technician" | "Admin";
export type DosageForm = "Tablet" | "Syrup" | "Injection" | "Capsule" | "Cream" | "Other";
export type ApprovalStatus = "Pending" | "Approved" | "Rejected";
export type PaymentMethod = "Cash" | "MobileMoney" | "Card";
export type PurchaseOrderStatus = "Pending" | "Received" | "Cancelled";

export interface RefSummary {
  id: string;
  label: string;
}

export interface Envelope<T> {
  success: boolean;
  data: T;
  message: string;
  timestamp: string;
}

export interface LoginResponse {
  token: string;
  staffId: string;
  fullName: string;
  role: Role;
  mustResetPassword: boolean;
}

export interface Staff {
  id: string;
  fullName: string;
  role: Role;
  licenseNumber?: string | null;
  phoneNumber: string;
  email: string;
  hireDate: string;
  activeStatus: boolean;
  mustResetPassword: boolean;
}

export interface Customer {
  id: string;
  fullName: string;
  phoneNumber: string;
  address: string;
}

export interface Doctor {
  id: string;
  fullName: string;
  licenseNumber: string;
  contactInfo: string;
}

export interface Drug {
  id: string;
  name: string;
  genericName: string;
  dosageForm: DosageForm;
  strength: string;
  unitPrice: number;
  isControlledSubstance: boolean;
  reorderThreshold: number;
  quantityInStock?: number;
}

export interface Batch {
  id: string;
  drug: RefSummary;
  batchNumber: string;
  quantityInStock: number;
  expiryDate: string;
  supplier: string | RefSummary;
  purchaseOrderItemId?: string | null;
  verifiedByPharmacist: RefSummary | null;
  isExpired: boolean;
  isControlledSubstance: boolean;
  dateReceived?: string;
}

export interface PrescriptionItem {
  drug: RefSummary;
  dosageInstructions: string;
  quantityPrescribed: number;
}

export interface Prescription {
  id: string;
  customer: RefSummary;
  doctor: RefSummary;
  dateIssued: string;
  approvalStatus: ApprovalStatus;
  approvingPharmacist: RefSummary | null;
  notes: string;
  items: PrescriptionItem[];
  sold: boolean;
  rejectionReason?: string | null;
}

export interface SaleItem {
  drug: RefSummary;
  batchId?: string;
  quantity: number;
  unitPriceAtSale: number;
}

export interface Sale {
  id: string;
  prescription: RefSummary;
  cashier: RefSummary;
  dispensingPharmacist: RefSummary;
  saleDate: string;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  items?: SaleItem[];
}

export interface PurchaseOrderItem {
  drug: RefSummary;
  quantityOrdered: number;
  unitCost: number;
}

export interface PurchaseOrder {
  id: string;
  supplier: string | RefSummary;
  orderDate: string;
  expectedDeliveryDate: string;
  actualDeliveryDate?: string | null;
  status: PurchaseOrderStatus;
  createdBy: RefSummary;
  items: PurchaseOrderItem[];
  isOverdue: boolean;
}

export interface AuditLogEntry {
  id: string;
  staff: RefSummary;
  actionType: string;
  reference: string;
  timestamp: string;
  notes: string;
}

// ---------- Error class ----------

export class ApiError extends Error {
  status: number;
  fieldErrors?: Record<string, string>;
  constructor(message: string, status: number, fieldErrors?: Record<string, string>) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
  get isFieldError() {
    return this.status === 400 && !!this.fieldErrors;
  }
  get isForbidden() { return this.status === 403; }
  get isUnauthorized() { return this.status === 401; }
  get isConflict() { return this.status === 409; }
  get isNotFound() { return this.status === 404; }
  get isBusinessRule() { return this.status === 422; }
}

// ---------- HTTP core ----------

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RequestOpts {
  method?: Method;
  body?: unknown;
  auth?: boolean; // default true
}

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (h: () => void) => { onUnauthorized = h; };

async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { method = "GET", body, auth = true } = opts;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const t = tokenStore.get();
    if (t) headers.Authorization = `Bearer ${t}`;
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    throw new ApiError(
      "Cannot reach the server. Check your connection or that the API is running.",
      0,
    );
  }

  let env: Envelope<unknown> | null = null;
  try {
    env = (await res.json()) as Envelope<unknown>;
  } catch {
    // no body / non-JSON — fall through to status-based error
  }

  if (res.status === 401) {
    tokenStore.clear();
    if (onUnauthorized) onUnauthorized();
  }

  if (env && env.success) return env.data as T;

  const msg = env?.message ?? `Request failed (${res.status})`;
  const fieldErrors =
    res.status === 400 && env && env.data && typeof env.data === "object" && !Array.isArray(env.data)
      ? (env.data as Record<string, string>)
      : undefined;

  throw new ApiError(msg, res.status, fieldErrors);
}

// ---------- Auth ----------

export const authApi = {
  login: (email: string, password: string) =>
    request<LoginResponse>("/auth/login", { method: "POST", body: { email, password }, auth: false }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<null>("/auth/change-password", {
      method: "POST",
      body: { currentPassword, newPassword },
    }),
};

// ---------- Staff ----------

export interface CreateStaffRequest {
  fullName: string;
  role: Role;
  licenseNumber?: string;
  phoneNumber: string;
  email: string;
  password: string;
  mustResetPassword: boolean;
  hireDate: string;
  activeStatus: boolean;
}

export interface CreateStaffResponse {
  staff: Staff;
  tempPassword: string;
}

export const staffApi = {
  list: () => request<Staff[]>("/staff"),
  get: (id: string) => request<Staff>(`/staff/${id}`),
  create: (data: CreateStaffRequest) =>
    request<CreateStaffResponse>("/staff", { method: "POST", body: data }),
  update: (id: string, patch: Partial<Omit<CreateStaffRequest, "password" | "mustResetPassword">>) =>
    request<Staff>(`/staff/${id}`, { method: "PATCH", body: patch }),
  generatePassword: () => Math.random().toString(36).slice(-10) + "!A1",
};

// ---------- Customers ----------

export const customersApi = {
  list: () => request<Customer[]>("/customers"),
  get: (id: string) => request<Customer>(`/customers/${id}`),
  create: (data: Omit<Customer, "id">) => request<Customer>("/customers", { method: "POST", body: data }),
  update: (id: string, patch: Partial<Omit<Customer, "id">>) =>
    request<Customer>(`/customers/${id}`, { method: "PATCH", body: patch }),
};

// ---------- Doctors ----------

export const doctorsApi = {
  list: () => request<Doctor[]>("/doctors"),
  get: (id: string) => request<Doctor>(`/doctors/${id}`),
  create: (data: Omit<Doctor, "id">) => request<Doctor>("/doctors", { method: "POST", body: data }),
  update: (id: string, patch: Partial<Omit<Doctor, "id">>) =>
    request<Doctor>(`/doctors/${id}`, { method: "PATCH", body: patch }),
};

// ---------- Drugs ----------

export interface CreateDrugRequest {
  name: string;
  genericName: string;
  dosageForm: DosageForm;
  strength: string;
  unitPrice: number;
  isControlledSubstance: boolean;
  reorderThreshold: number;
}

export const drugsApi = {
  list: () => request<Drug[]>("/drugs"),
  get: (id: string) => request<Drug>(`/drugs/${id}`),
  create: (data: CreateDrugRequest) => request<Drug>("/drugs", { method: "POST", body: data }),
  updateBasics: (id: string, patch: { name?: string; genericName?: string; reorderThreshold?: number; dosageForm?: DosageForm; strength?: string }) =>
    request<Drug>(`/drugs/${id}`, { method: "PATCH", body: patch }),
  updatePrice: (id: string, unitPrice: number) =>
    request<Drug>(`/drugs/${id}/price`, { method: "PATCH", body: { unitPrice } }),
  updateControlled: (id: string, isControlledSubstance: boolean) =>
    request<Drug>(`/drugs/${id}/controlled-status`, { method: "PATCH", body: { isControlledSubstance } }),
};

// ---------- Batches ----------

export interface CreateBatchRequest {
  drugId: string;
  batchNumber: string;
  quantityInStock: number;
  expiryDate: string;
  supplier: string;

  purchaseOrderItemId?: string | null;
  dateReceived?: string;
}

export const batchesApi = {
  list: () => request<Batch[]>("/batches"),
  create: (data: CreateBatchRequest) => request<Batch>("/batches", { method: "POST", body: data }),
  verify: (id: string) => request<Batch>(`/batches/${id}/verify`, { method: "PATCH" }),
};

// ---------- Prescriptions ----------

export interface CreatePrescriptionItem {
  drugId: string;
  dosageInstructions: string;
  quantityPrescribed: number;
}

export interface CreatePrescriptionRequest {
  customerId: string;
  doctorId: string;
  dateIssued: string;
  notes: string;
  items: CreatePrescriptionItem[];
}

export const prescriptionsApi = {
  list: () => request<Prescription[]>("/prescriptions"),
  get: (id: string) => request<Prescription>(`/prescriptions/${id}`),
  create: (data: CreatePrescriptionRequest) =>
    request<Prescription>("/prescriptions", { method: "POST", body: data }),
  approve: (id: string) => request<Prescription>(`/prescriptions/${id}/approve`, { method: "PATCH" }),
  reject: (id: string, reason: string) =>
    request<Prescription>(`/prescriptions/${id}/reject`, { method: "PATCH", body: { reason } }),
};

// ---------- Sales ----------

export interface CreateSaleItem {
  drugId: string;
  batchId: string;
  quantity: number;
}

export interface CreateSaleRequest {
  prescriptionId: string;
  paymentMethod: PaymentMethod;
  cashierId?: string;
  dispensingPharmacistId?: string;
  items: CreateSaleItem[];
}

export const salesApi = {
  list: () => request<Sale[]>("/sales"),
  get: (id: string) => request<Sale>(`/sales/${id}`),
  create: (data: CreateSaleRequest) => request<Sale>("/sales", { method: "POST", body: data }),
};

// ---------- Purchase Orders ----------

export interface CreatePurchaseOrderItem {
  drugId: string;
  quantityOrdered: number;
  unitCost: number;
}

export interface CreatePurchaseOrderRequest {
  supplier: string;
  expectedDeliveryDate: string;
  items: CreatePurchaseOrderItem[];
}

export const purchaseOrdersApi = {
  list: () => request<PurchaseOrder[]>("/purchase-orders"),
  overdue: () => request<PurchaseOrder[]>("/purchase-orders/overdue"),
  awaitingVerification: () => request<PurchaseOrder[]>("/purchase-orders/awaiting-verification"),
  create: (data: CreatePurchaseOrderRequest) =>
    request<PurchaseOrder>("/purchase-orders", { method: "POST", body: data }),
  markDelivered: (id: string) =>
    request<PurchaseOrder>(`/purchase-orders/${id}/mark-delivered`, { method: "PATCH" }),
};

// ---------- Audit Log ----------

export const auditLogApi = {
  list: () => request<AuditLogEntry[]>("/audit-log"),
};

// ---------- UI helpers ----------

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  Cash: "Cash",
  MobileMoney: "Mobile Money",
  Card: "Card",
};

export function apiErrorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong.";
}
