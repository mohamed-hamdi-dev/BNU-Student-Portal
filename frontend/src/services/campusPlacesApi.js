import { apiFetch } from "./api";

const ensureArray = (value) => (Array.isArray(value) ? value : []);

export const campusPlacesApi = {
  async list(category = "") {
    const suffix = category ? `?category=${encodeURIComponent(category)}` : "";
    const data = await apiFetch(`/api/campus/places${suffix}`);
    return ensureArray(data);
  },
  async create(payload) {
    return apiFetch("/api/campus/places", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  async update(id, payload) {
    return apiFetch(`/api/campus/places/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  async remove(id) {
    return apiFetch(`/api/campus/places/${id}`, {
      method: "DELETE",
    });
  },
};

