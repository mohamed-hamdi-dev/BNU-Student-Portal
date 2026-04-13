import { apiFetch, apiFetchPublic } from "./api";

let academicStateInFlight = null;
let academicStateSaveInFlight = null;
let lastAcademicStatePayloadHash = "";

const hasAccessToken = () => Boolean(localStorage.getItem("access_token"));
const stableStringify = (value) => {
  try {
    const normalize = (v) => {
      if (Array.isArray(v)) return v.map(normalize);
      if (v && typeof v === "object") {
        return Object.keys(v)
          .sort()
          .reduce((acc, key) => {
            acc[key] = normalize(v[key]);
            return acc;
          }, {});
      }
      return v;
    };
    return JSON.stringify(normalize(value));
  } catch {
    return JSON.stringify(value ?? null);
  }
};

export const fetchAcademicState = () => {
  if (!hasAccessToken()) return Promise.resolve(null);
  if (!academicStateInFlight) {
    academicStateInFlight = apiFetch("/api/academic/state").finally(() => {
      academicStateInFlight = null;
    });
  }
  return academicStateInFlight;
};

export const saveAcademicState = (payload) => {
  if (!hasAccessToken()) return Promise.resolve(null);
  const payloadHash = stableStringify(payload);
  if (payloadHash === lastAcademicStatePayloadHash) return Promise.resolve({ skipped: true });

  if (academicStateSaveInFlight && academicStateSaveInFlight.hash === payloadHash) {
    return academicStateSaveInFlight.promise;
  }

  const promise = apiFetch("/api/academic/state", {
    method: "PUT",
    body: JSON.stringify(payload),
  })
    .then((data) => {
      lastAcademicStatePayloadHash = payloadHash;
      return data;
    })
    .finally(() => {
      if (academicStateSaveInFlight?.hash === payloadHash) {
        academicStateSaveInFlight = null;
      }
    });

  academicStateSaveInFlight = { hash: payloadHash, promise };
  return promise;
};

export const fetchCollegesState = async () => {
  if (!hasAccessToken()) return [];
  const data = await apiFetch("/api/academic/colleges");
  return Array.isArray(data?.colleges) ? data.colleges : [];
};

export const saveCollegesState = (colleges) =>
  hasAccessToken()
    ? apiFetch("/api/academic/colleges", {
        method: "PUT",
        body: JSON.stringify({ colleges }),
      })
    : Promise.resolve(null);

export const fetchCollegePoliciesState = async () => {
  if (!hasAccessToken()) return {};
  const data = await apiFetch("/api/academic/college-policies");
  return data?.collegePolicies && typeof data.collegePolicies === "object" ? data.collegePolicies : {};
};

export const saveCollegePolicyState = (collegeKey, policy) =>
  hasAccessToken()
    ? apiFetch(`/api/academic/college-policies/${encodeURIComponent(collegeKey)}`, {
        method: "PUT",
        body: JSON.stringify({ policy }),
      })
    : Promise.resolve(null);

export const bootstrapDefaultCollegePolicies = () =>
  hasAccessToken()
    ? apiFetch("/api/academic/college-policies/bootstrap/defaults", {
        method: "POST",
      })
    : Promise.resolve(null);

export const fetchPublicAcademicCatalog = async () => {
  const data = await apiFetchPublic("/api/academic/public-catalog");
  return {
    colleges: Array.isArray(data?.colleges) ? data.colleges : [],
    years: Array.isArray(data?.years) ? data.years : [],
    settings: data?.registrationSettings && typeof data.registrationSettings === "object" ? data.registrationSettings : {},
  };
};
