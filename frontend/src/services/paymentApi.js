import { apiFetch } from "./api";

export const createPaymentOrder = (payload) =>
  apiFetch("/api/payment/orders", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const getMyPaymentOverview = (academicYearLabel, semester) => {
  const qs = new URLSearchParams({
    academic_year_label: String(academicYearLabel || ""),
    semester: String(semester || ""),
  });
  return apiFetch(`/api/payment/my/overview?${qs.toString()}`);
};

export const initiatePaymentTransaction = (orderId, payload) =>
  apiFetch(`/api/payment/orders/${orderId}/transactions/initiate`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const confirmProviderWebhook = (provider, payload) =>
  apiFetch(`/api/payment/webhook/${encodeURIComponent(provider)}/confirm`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const submitBankReceipt = (orderId, transactionId, payload) =>
  apiFetch(`/api/payment/orders/${orderId}/transactions/${transactionId}/bank-receipt`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const uploadPublicStorageFile = (file) => {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch("/api/storage/upload-public", {
    method: "POST",
    body: formData,
  });
};

export const listPaymentConfigs = (params = {}) => {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    qs.set(k, String(v));
  });
  return apiFetch(`/api/payment/configs${qs.toString() ? `?${qs.toString()}` : ""}`);
};

export const upsertPaymentConfig = (payload) =>
  apiFetch("/api/payment/configs", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const listBankAccountSettings = (params = {}) => {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    qs.set(k, String(v));
  });
  return apiFetch(`/api/payment/bank-account-settings${qs.toString() ? `?${qs.toString()}` : ""}`);
};

export const upsertBankAccountSetting = (payload) =>
  apiFetch("/api/payment/bank-account-settings", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const deleteBankAccountSetting = (settingId) =>
  apiFetch(`/api/payment/bank-account-settings/${settingId}`, {
    method: "DELETE",
  });

export const listGpaDiscountPolicies = (params = {}) => {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    qs.set(k, String(v));
  });
  return apiFetch(`/api/payment/gpa-discount-policies${qs.toString() ? `?${qs.toString()}` : ""}`);
};

export const createGpaDiscountPolicy = (payload) =>
  apiFetch("/api/payment/gpa-discount-policies", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const deleteGpaDiscountPolicy = (policyId) =>
  apiFetch(`/api/payment/gpa-discount-policies/${policyId}`, {
    method: "DELETE",
  });

export const listAdminBankReceipts = (params = {}) => {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    qs.set(k, String(v));
  });
  return apiFetch(`/api/payment/admin/bank-receipts${qs.toString() ? `?${qs.toString()}` : ""}`);
};

export const reviewAdminBankReceipt = (receiptId, payload) =>
  apiFetch(`/api/payment/admin/bank-receipts/${receiptId}/review`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const listPaymentFeeItems = (params = {}) => {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    qs.set(k, String(v));
  });
  return apiFetch(`/api/payment/fee-items${qs.toString() ? `?${qs.toString()}` : ""}`);
};

export const createPaymentFeeItem = (payload) =>
  apiFetch("/api/payment/fee-items", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const deletePaymentFeeItem = (feeItemId) =>
  apiFetch(`/api/payment/fee-items/${feeItemId}`, {
    method: "DELETE",
  });

export const listLatePenaltyRules = (params = {}) => {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    qs.set(k, String(v));
  });
  return apiFetch(`/api/payment/late-penalty-rules${qs.toString() ? `?${qs.toString()}` : ""}`);
};

export const upsertLatePenaltyRule = (payload) =>
  apiFetch("/api/payment/late-penalty-rules", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const listStudentFeeAdjustments = (params = {}) => {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    qs.set(k, String(v));
  });
  return apiFetch(`/api/payment/student-adjustments${qs.toString() ? `?${qs.toString()}` : ""}`);
};

export const createStudentFeeAdjustment = (payload) =>
  apiFetch("/api/payment/student-adjustments", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const deleteStudentFeeAdjustment = (adjustmentId) =>
  apiFetch(`/api/payment/student-adjustments/${adjustmentId}`, {
    method: "DELETE",
  });
