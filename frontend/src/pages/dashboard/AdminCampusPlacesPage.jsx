import React, { useEffect, useMemo, useState } from "react";
import { MapPin, Plus, Save, RefreshCcw, Pencil, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  MdAccountBalance,
  MdBusinessCenter,
  MdDoorFront,
  MdLocalHospital,
  MdLocalLibrary,
  MdLocalParking,
  MdLocationCity,
} from "react-icons/md";
import { campusPlacesApi } from "../../services/campusPlacesApi";

const emptyForm = {
  name: "",
  name_ar: "",
  building_code: "",
  category: "service",
  icon_key: "business",
  latitude: "",
  longitude: "",
  description: "",
  description_ar: "",
};

const toNumOrNull = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const categoryIconKey = {
  service: "business",
  gate: "door",
  faculty: "university",
  library: "library",
  admin: "bank",
  medical: "hospital",
  parking: "parking",
};

const iconMeta = {
  business: { labelKey: "admin.places.categories.service", Icon: MdBusinessCenter },
  door: { labelKey: "admin.places.categories.gate", Icon: MdDoorFront },
  university: { labelKey: "admin.places.categories.faculty", Icon: MdLocationCity },
  school: { labelKey: "admin.places.categories.faculty", Icon: MdLocationCity },
  bank: { labelKey: "admin.places.categories.admin", Icon: MdAccountBalance },
  library: { labelKey: "admin.places.categories.library", Icon: MdLocalLibrary },
  hospital: { labelKey: "admin.places.categories.medical", Icon: MdLocalHospital },
  parking: { labelKey: "admin.places.categories.parking", Icon: MdLocalParking },
};

const getEffectiveIconKey = (category, iconKey) => {
  const direct = String(iconKey || "").trim();
  if (direct && iconMeta[direct]) return direct;
  return categoryIconKey[String(category || "").trim()] || "business";
};

const getIconMeta = (category, iconKey) => {
  const key = getEffectiveIconKey(category, iconKey);
  return iconMeta[key] || iconMeta.business;
};

const normalizeBuildingCode = (value) => String(value || "").trim().toUpperCase();

const formatBuildingCodeLabel = (value, t) => {
  const code = normalizeBuildingCode(value);
  if (!code) return "";
  return `${t("admin.places.table.buildingCode")} ${code}`;
};

export default function AdminCampusPlacesPage() {
  const { t } = useTranslation("admin");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    setLoading(true);
    try {
      const data = await campusPlacesApi.list();
      const sorted = [...data].sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
      setRows(sorted);
    } catch (err) {
      setMessage(err?.message || t("admin.places.messages.loadError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [t]);

  const filteredRows = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((item) =>
      [item?.name, item?.name_ar, item?.building_code, item?.category, item?.icon_key, item?.description, item?.description_ar]
        .map((v) => String(v || "").toLowerCase())
        .some((text) => text.includes(q))
    );
  }, [rows, query]);

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      if (!form.name.trim()) {
        throw new Error(t("admin.places.messages.nameEnRequired"));
      }
      const payload = {
        name: form.name.trim(),
        name_ar: form.name_ar.trim() || null,
        building_code: normalizeBuildingCode(form.building_code) || null,
        category: form.category.trim() || null,
        icon_key: getEffectiveIconKey(form.category, form.icon_key),
        latitude: toNumOrNull(form.latitude),
        longitude: toNumOrNull(form.longitude),
        description: form.description.trim() || null,
        description_ar: form.description_ar.trim() || null,
      };
      if (editingId) {
        await campusPlacesApi.update(editingId, payload);
        setMessage(t("admin.places.messages.updated"));
      } else {
        await campusPlacesApi.create(payload);
        setMessage(t("admin.places.messages.created"));
      }
      resetForm();
      await load();
    } catch (err) {
      setMessage(err?.message || t("admin.places.messages.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setForm({
      name: item?.name || "",
      name_ar: item?.name_ar || "",
      building_code: normalizeBuildingCode(item?.building_code || ""),
      category: item?.category || "service",
      icon_key: getEffectiveIconKey(item?.category || "service", item?.icon_key || ""),
      latitude: item?.latitude ?? "",
      longitude: item?.longitude ?? "",
      description: item?.description || "",
      description_ar: item?.description_ar || "",
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t("admin.places.messages.confirmDelete"))) return;
    setMessage("");
    try {
      await campusPlacesApi.remove(id);
      setMessage(t("admin.places.messages.deleted"));
      await load();
      if (editingId === id) resetForm();
    } catch (err) {
      setMessage(err?.message || t("admin.places.messages.deleteError"));
    }
  };

  const selectedIcon = getIconMeta(form.category, form.icon_key);
  const SelectedIcon = selectedIcon.Icon;
  const buildingCodeLabel = formatBuildingCodeLabel(form.building_code, t);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="rounded-3xl border border-slate-200 bg-white p-4 md:p-6">
        <h2 className="text-xl font-black text-slate-800 inline-flex items-center gap-2">
          <MapPin size={20} className="text-cyan-600" /> {t("admin.places.title")}
        </h2>
        <p className="mt-1 text-sm text-slate-500">{t("admin.places.subtitle")}</p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-3xl border border-slate-200 bg-white p-4 md:p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2" placeholder={t("admin.places.nameEn")} />
          <input value={form.name_ar} onChange={(e) => setForm((s) => ({ ...s, name_ar: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2" placeholder={t("admin.places.nameAr")} />
          <input value={form.building_code} onChange={(e) => setForm((s) => ({ ...s, building_code: normalizeBuildingCode(e.target.value) }))} className="rounded-xl border border-slate-200 px-3 py-2" placeholder={t("admin.places.buildingCode")} />

          <select
            value={form.category}
            onChange={(e) => {
              const next = e.target.value;
              setForm((s) => ({ ...s, category: next, icon_key: getEffectiveIconKey(next, "") }));
            }}
            className="rounded-xl border border-slate-200 px-3 py-2"
          >
            <option value="service">{t("admin.places.categories.service")}</option>
            <option value="gate">{t("admin.places.categories.gate")}</option>
            <option value="faculty">{t("admin.places.categories.faculty")}</option>
            <option value="library">{t("admin.places.categories.library")}</option>
            <option value="admin">{t("admin.places.categories.admin")}</option>
            <option value="medical">{t("admin.places.categories.medical")}</option>
            <option value="parking">{t("admin.places.categories.parking")}</option>
          </select>

          <div className="rounded-xl border border-slate-200 px-3 py-2 inline-flex items-center">
            <div className="inline-flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-700">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-cyan-50 text-cyan-700">
                <SelectedIcon size={16} />
              </span>
              <span>{t(selectedIcon.labelKey)}</span>
              {buildingCodeLabel ? (
                <span className="inline-flex items-center rounded-full bg-white px-2 py-0.5 text-[11px] font-black text-cyan-700 shadow-sm">
                  {buildingCodeLabel}
                </span>
              ) : null}
            </div>
          </div>

          <input value={form.latitude} onChange={(e) => setForm((s) => ({ ...s, latitude: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2" placeholder={t("admin.places.latitude")} />
          <input value={form.longitude} onChange={(e) => setForm((s) => ({ ...s, longitude: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2" placeholder={t("admin.places.longitude")} />
          <input value={form.description} onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2" placeholder={t("admin.places.descriptionEn")} />
          <input value={form.description_ar} onChange={(e) => setForm((s) => ({ ...s, description_ar: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 md:col-span-2 lg:col-span-3" placeholder={t("admin.places.descriptionAr")} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-white font-bold disabled:opacity-60">
            {editingId ? <Save size={16} /> : <Plus size={16} />}
            {saving ? t("admin.common.saving") : editingId ? t("admin.places.saveChanges") : t("admin.places.addPlace")}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-slate-700 font-bold">
              <X size={16} /> {t("admin.common.cancel")}
            </button>
          )}
          <button type="button" onClick={load} className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-slate-700 font-bold">
            <RefreshCcw size={16} /> {t("admin.common.refresh")}
          </button>
          {message && <span className="text-sm font-semibold text-slate-600">{message}</span>}
        </div>
      </form>

      <div className="rounded-3xl border border-slate-200 bg-white p-4 md:p-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-black text-slate-800">{t("admin.places.listTitle")}</h3>
          <input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full max-w-xs rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder={t("admin.places.searchPlaceholder")} />
        </div>

        {loading ? (
          <div className="text-sm text-slate-500">{t("admin.common.loading")}</div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-slate-50">
                <tr className="text-slate-600">
                  <th className="p-3 text-right">ID</th>
                  <th className="p-3 text-right">{t("admin.places.table.name")}</th>
                  <th className="p-3 text-right">{t("admin.places.table.buildingCode")}</th>
                  <th className="p-3 text-right">{t("admin.places.table.category")}</th>
                  <th className="p-3 text-right">{t("admin.places.table.icon")}</th>
                  <th className="p-3 text-right">{t("admin.places.table.latitude")}</th>
                  <th className="p-3 text-right">{t("admin.places.table.longitude")}</th>
                  <th className="p-3 text-right">{t("admin.places.table.action")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((item) => {
                  const icon = getIconMeta(item.category, item.icon_key);
                  const RowIcon = icon.Icon;
                  const buildingLabel = formatBuildingCodeLabel(item.building_code, t);
                  return (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="p-3 font-semibold">{item.id}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap items-center gap-2 font-semibold text-slate-800">
                          <span>{item.name_ar || item.name}</span>
                          {buildingLabel ? (
                            <span className="inline-flex items-center rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] font-black text-cyan-700">
                              {buildingLabel}
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs text-slate-500">{item.name}</div>
                      </td>
                      <td className="p-3">{buildingLabel || "-"}</td>
                      <td className="p-3">{item.category || "-"}</td>
                      <td className="p-3">
                        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700">
                          <RowIcon size={14} />
                          {t(icon.labelKey)}
                        </span>
                      </td>
                      <td className="p-3">{item.latitude ?? "-"}</td>
                      <td className="p-3">{item.longitude ?? "-"}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => startEdit(item)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1.5 text-emerald-700 font-bold">
                            <Pencil size={14} /> {t("admin.common.edit")}
                          </button>
                          <button type="button" onClick={() => handleDelete(item.id)} className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-3 py-1.5 text-rose-700 font-bold">
                            <Trash2 size={14} /> {t("admin.common.delete")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!filteredRows.length && (
                  <tr>
                    <td colSpan={8} className="p-4 text-center text-slate-500">{t("admin.common.noData")}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
