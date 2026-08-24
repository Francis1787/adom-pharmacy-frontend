// Fixture builders for the Adom Pharmacy domain.
// Every builder returns a valid object and takes a partial override, so each test
// only states the fields that matter to the rule under test.
import type {
  AuditLogEntry,
  Batch,
  Customer,
  Doctor,
  Drug,
  Envelope,
  Prescription,
  PurchaseOrder,
  Sale,
  Staff,
} from "@/api";

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

export const resetIds = () => {
  seq = 0;
};

export const envelope = <T>(data: T, overrides: Partial<Envelope<T>> = {}): Envelope<T> => ({
  success: true,
  data,
  message: "OK",
  timestamp: "2026-08-24T09:00:00Z",
  ...overrides,
});

export const makeStaff = (o: Partial<Staff> = {}): Staff => ({
  id: nextId("staff"),
  fullName: "Ama Mensah",
  role: "Pharmacist",
  licenseNumber: "PH-1234",
  phoneNumber: "0244000000",
  email: "ama@adom.test",
  hireDate: "2024-01-15",
  activeStatus: true,
  mustResetPassword: false,
  ...o,
});

export const makeCustomer = (o: Partial<Customer> = {}): Customer => ({
  id: nextId("cust"),
  fullName: "Kofi Boateng",
  phoneNumber: "0201111111",
  address: "12 Ring Road, Accra",
  ...o,
});

export const makeDoctor = (o: Partial<Doctor> = {}): Doctor => ({
  id: nextId("doc"),
  fullName: "Dr. Yaa Asantewaa",
  licenseNumber: "MD-9911",
  contactInfo: "0209999999",
  ...o,
});

export const makeDrug = (o: Partial<Drug> = {}): Drug => ({
  id: nextId("drug"),
  name: "Paracetamol",
  genericName: "Acetaminophen",
  dosageForm: "Tablet",
  strength: "500mg",
  unitPrice: 2.5,
  isControlledSubstance: false,
  reorderThreshold: 20,
  ...o,
});

export const makeBatch = (o: Partial<Batch> = {}): Batch => ({
  id: nextId("batch"),
  drug: { id: "drug-1", label: "Paracetamol" },
  batchNumber: "BN-001",
  quantityInStock: 100,
  expiryDate: "2027-12-31",
  supplier: "Ernest Chemists",
  purchaseOrderItemId: null,
  verifiedByPharmacist: null,
  isExpired: false,
  isControlledSubstance: false,
  ...o,
});

export const makePrescription = (o: Partial<Prescription> = {}): Prescription => ({
  id: nextId("rx"),
  customer: { id: "cust-1", label: "Kofi Boateng" },
  doctor: { id: "doc-1", label: "Dr. Yaa Asantewaa" },
  dateIssued: "2026-08-20",
  approvalStatus: "Pending",
  approvingPharmacist: null,
  notes: "",
  items: [
    {
      drug: { id: "drug-1", label: "Paracetamol" },
      dosageInstructions: "1 tablet twice daily",
      quantityPrescribed: 10,
    },
  ],
  sold: false,
  ...o,
});

export const makeSale = (o: Partial<Sale> = {}): Sale => ({
  id: nextId("sale"),
  prescription: { id: "rx-1", label: "RX-1" },
  cashier: { id: "staff-2", label: "Kwesi Owusu" },
  dispensingPharmacist: { id: "staff-1", label: "Ama Mensah" },
  saleDate: "2026-08-24T10:30:00Z",
  totalAmount: 25,
  paymentMethod: "Cash",
  ...o,
});

export const makePurchaseOrder = (o: Partial<PurchaseOrder> = {}): PurchaseOrder => ({
  id: nextId("po"),
  supplier: "Ernest Chemists",
  orderDate: "2026-08-01",
  expectedDeliveryDate: "2026-08-15",
  actualDeliveryDate: null,
  status: "Pending",
  createdBy: { id: "staff-3", label: "Admin User" },
  items: [{ drug: { id: "drug-1", label: "Paracetamol" }, quantityOrdered: 500, unitCost: 1.2 }],
  isOverdue: false,
  ...o,
});

export const makeAuditEntry = (o: Partial<AuditLogEntry> = {}): AuditLogEntry => ({
  id: nextId("audit"),
  staff: { id: "staff-1", label: "Ama Mensah" },
  actionType: "PRESCRIPTION_APPROVED",
  reference: "rx-1",
  timestamp: "2026-08-24T10:00:00Z",
  notes: "Approved after stock check",
  ...o,
});
