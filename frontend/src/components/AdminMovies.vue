<script setup lang="ts">
import { ref, computed, watch } from "vue";
import axios from "axios";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits(["close"]);

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ?? "http://localhost:3001";

/* ------------ Auth ------------ */
function getBearer(): string {
  try {
    const t = localStorage.getItem("auth_token");
    if (t) return t;
    const raw = localStorage.getItem("auth_user");
    if (!raw) return "";
    const u = JSON.parse(raw);
    return u?.token || "";
  } catch {
    return "";
  }
}
function isAdmin(): boolean {
  try {
    const raw = localStorage.getItem("auth_user");
    if (!raw) return false;
    const u = JSON.parse(raw);
    return u?.user?.role === "ADMIN" || u?.role === "ADMIN";
  } catch {
    return false;
  }
}
const authHeader = computed(() => ({
  headers: { Authorization: `Bearer ${getBearer()}` },
}));

/* ------------ Types & State ------------ */
type Movie = {
  id: number;
  title: string;
  durationMin: number;
  rating?: string | null;
  posterUrl?: string | null;
  overview?: string | null;
  active: boolean;
  createdAt?: string;
};

const list = ref<Movie[]>([]);
const loading = ref(false);
const errorText = ref("");
const q = ref("");
const onlyActive = ref(true);

const page = ref(1);
const pageSize = ref(10);

/* ------------ Form ------------ */
const emptyForm: Movie = {
  id: 0,
  title: "",
  durationMin: 120,
  rating: "",
  posterUrl: "",
  overview: "",
  active: true,
};
const form = ref<Movie>({ ...emptyForm });
const saving = ref(false);

/* ------------ Utils ------------ */
// อนุญาตเฉพาะคีย์ที่แบ็กเอนด์/สคีมารองรับจริง
// ถ้าหลังบ้านยังไม่มี posterUrl/overview ก็ลบคีย์นั้นก่อนส่งได้ตามต้องการ
const ALLOWED_KEYS = new Set([
  "title",
  "durationMin",
  "rating",
  "active",
  "posterUrl",
  "overview",
]);

function pickAllowed(src: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const k of Object.keys(src)) {
    if (!ALLOWED_KEYS.has(k)) continue;
    const v = src[k];
    // ตัดค่าว่าง ๆ ที่ไม่จำเป็น เพื่อกันสคีมาที่ไม่มีคอลัมน์นั้น
    if (v === "" || v === undefined) continue;
    out[k] = v;
  }
  // บังคับชนิดที่ใช้บ่อย
  if ("durationMin" in out) out.durationMin = Number(out.durationMin);
  if ("active" in out) out.active = Boolean(out.active);
  return out;
}

/* ------------ Load ------------ */
async function fetchMovies() {
  if (!isAdmin()) {
    errorText.value = "ต้องเป็นผู้ดูแลระบบเท่านั้น";
    return;
  }
  loading.value = true;
  errorText.value = "";
  try {
    const { data } = await axios.get(
      `${API_BASE}/api/admin/movies`,
      authHeader.value
    );
    if (!data?.ok) throw new Error(data?.error || "Load failed");

    const items = (data.movies || []).map((m: any) => ({
      id: Number(m.id),
      title: String(m.title ?? ""),
      durationMin: Number(m.durationMin ?? 0),
      rating: m.rating ?? "",
      posterUrl: m.posterUrl ?? "",
      overview: m.overview ?? "",
      active: m.active === false ? false : true, // กัน null -> true
      createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : "",
    })) as Movie[];

    // เผื่อ API ยังไม่ได้ sort ให้ เรียงใหม่สุดขึ้นก่อน
    items.sort((a, b) => {
      const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
      const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
      return tb - ta;
    });

    list.value = items;
    page.value = 1;
  } catch (e: any) {
    errorText.value =
      e?.response?.data?.error || e.message || "โหลดข้อมูลไม่สำเร็จ";
  } finally {
    loading.value = false;
  }
}

/* ------------ Derived ------------ */
const filtered = computed(() => {
  let arr = list.value.slice();
  if (onlyActive.value) arr = arr.filter((x) => x.active);
  if (q.value.trim()) {
    const s = q.value.trim().toLowerCase();
    arr = arr.filter(
      (x) =>
        x.title.toLowerCase().includes(s) ||
        (x.rating || "").toLowerCase().includes(s)
    );
  }
  return arr;
});
const totalPages = computed(() =>
  Math.max(1, Math.ceil(filtered.value.length / pageSize.value))
);
const paged = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return filtered.value.slice(start, start + pageSize.value);
});

/* ------------ Form helpers ------------ */
function resetForm() {
  form.value = { ...emptyForm };
}
function edit(m: Movie) {
  form.value = { ...m };
}

/* ------------ Save ------------ */
async function save() {
  if (!isAdmin()) return;
  saving.value = true;
  try {
    if (!form.value.title) throw new Error("กรอกชื่อเรื่องก่อน");
    if (!Number(form.value.durationMin))
      throw new Error("กรอกเวลาความยาว (นาที)");

    // เตรียม payload แบบปลอดภัย
    const base = {
      title: form.value.title,
      durationMin: Number(form.value.durationMin),
      rating: form.value.rating ?? "",
      active: Boolean(form.value.active),
      posterUrl: form.value.posterUrl ?? "",
      overview: form.value.overview ?? "",
    };
    let payload = pickAllowed(base);

    // update / create
    if (form.value.id && Number(form.value.id) > 0) {
      await axios.patch(
        `${API_BASE}/api/admin/movies/${form.value.id}`,
        payload,
        authHeader.value
      );
    } else {
      await axios.post(
        `${API_BASE}/api/admin/movies`,
        payload,
        authHeader.value
      );
    }

    await fetchMovies();
    resetForm();
  } catch (e: any) {
    alert(e?.response?.data?.error || e.message || "บันทึกไม่สำเร็จ");
  } finally {
    saving.value = false;
  }
}

/* ------------ Toggle / Remove (soft) ------------ */
async function toggleActive(m: Movie) {
  try {
    await axios.patch(
      `${API_BASE}/api/admin/movies/${m.id}`,
      { active: !m.active },
      authHeader.value
    );
    await fetchMovies();
  } catch (e: any) {
    alert(e?.response?.data?.error || e.message || "อัปเดตไม่สำเร็จ");
  }
}
async function removeSoft(id: number) {
  if (!confirm("ซ่อนหนังเรื่องนี้ (active=false)?")) return;
  try {
    await axios.delete(`${API_BASE}/api/admin/movies/${id}`, authHeader.value);
    await fetchMovies();
  } catch (e: any) {
    alert(e?.response?.data?.error || e.message || "ลบไม่สำเร็จ");
  }
}

/* ------------ Watch open ------------ */
watch(
  () => props.open,
  (v) => {
    if (v) {
      document.body.style.overflow = "hidden";
      fetchMovies();
    } else {
      document.body.style.overflow = "";
    }
  },
  { immediate: true }
);
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-[10000]">
    <transition name="fade">
      <div class="absolute inset-0 bg-black/70" @click="$emit('close')" />
    </transition>

    <transition name="pop">
      <div
        class="relative mx-auto my-8 w-[95vw] max-w-6xl rounded-2xl bg-zinc-900 text-white shadow-2xl border border-zinc-800/50"
      >
        <!-- header -->
        <div
          class="sticky top-0 z-10 flex items-center justify-between px-5 py-4 rounded-t-2xl bg-gradient-to-b from-zinc-900 to-zinc-900/80 border-b border-zinc-800/60"
        >
          <div class="text-lg font-semibold">Admin • Movies</div>
          <div class="flex gap-2">
            <button
              class="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700"
              @click="fetchMovies"
              :disabled="loading"
            >
              {{ loading ? "Loading…" : "Refresh" }}
            </button>
            <button
              class="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700"
              @click="$emit('close')"
            >
              ปิด
            </button>
          </div>
        </div>

        <div v-if="!isAdmin()" class="p-5">
          <div
            class="p-4 rounded-xl bg-red-900/30 border border-red-700 text-red-100"
          >
            คุณไม่มีสิทธิ์เข้าหน้านี้
          </div>
        </div>

        <div v-else class="px-5 pb-5">
          <!-- toolbar -->
          <div class="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              v-model="q"
              class="px-3 py-2 rounded-lg text-black"
              placeholder="ค้นหาชื่อเรื่อง / เรตติ้ง"
            />
            <label class="flex items-center gap-2 text-sm">
              <input type="checkbox" v-model="onlyActive" />
              แสดงเฉพาะที่ Active
            </label>
            <div class="flex items-center justify-between gap-2">
              <button
                class="px-3 py-2 rounded-lg bg-primary/90 hover:bg-primary text-white"
                @click="resetForm"
              >
                + New
              </button>
              <div class="flex items-center gap-2 text-xs opacity-70">
                <span>ต่อหน้า</span>
                <select v-model.number="pageSize" class="px-2 py-1 rounded text-black">
                  <option :value="10">10</option>
                  <option :value="20">20</option>
                  <option :value="50">50</option>
                </select>
              </div>
            </div>
          </div>

          <div class="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
            <!-- form -->
            <div
              class="lg:col-span-1 rounded-2xl border border-zinc-800/60 bg-zinc-900/50 p-4"
            >
              <div class="font-semibold mb-3">Movie Editor</div>
              <div class="grid gap-3">
                <div>
                  <label class="text-xs text-zinc-400">Title</label>
                  <input
                    v-model="form.title"
                    class="w-full px-3 py-2 rounded-lg text-black"
                    placeholder="ชื่อเรื่อง"
                  />
                </div>
                <div class="grid grid-cols-3 gap-2">
                  <div>
                    <label class="text-xs text-zinc-400">Duration (min)</label>
                    <input
                      v-model.number="form.durationMin"
                      type="number"
                      min="1"
                      class="w-full px-3 py-2 rounded-lg text-black"
                    />
                  </div>
                  <div class="col-span-2">
                    <label class="text-xs text-zinc-400">Rating</label>
                    <input
                      v-model="form.rating"
                      class="w-full px-3 py-2 rounded-lg text-black"
                      placeholder="เช่น G / PG-13 / 18+"
                    />
                  </div>
                </div>
                <div>
                  <label class="text-xs text-zinc-400">Poster URL</label>
                  <input
                    v-model="form.posterUrl"
                    class="w-full px-3 py-2 rounded-lg text-black"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label class="text-xs text-zinc-400">Overview</label>
                  <textarea
                    v-model="form.overview"
                    rows="4"
                    class="w-full px-3 py-2 rounded-lg text-black"
                    placeholder="เรื่องย่อสั้น ๆ"
                  ></textarea>
                </div>
                <label class="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" v-model="form.active" />
                  Active
                </label>

                <div class="flex gap-2">
                  <button
                    class="px-4 py-2 rounded-lg bg-primary/90 hover:bg-primary text-white disabled:opacity-50"
                    :disabled="saving"
                    @click="save"
                  >
                    {{ saving ? "Saving…" : form.id ? "Update" : "Create" }}
                  </button>
                  <button
                    class="px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600"
                    @click="resetForm"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>

            <!-- list -->
            <div class="lg:col-span-2">
              <div
                class="rounded-2xl border border-zinc-800/60 bg-zinc-900/50 overflow-hidden"
              >
                <div class="overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead
                      class="text-left text-zinc-400 bg-zinc-900/60 border-b border-zinc-800/60"
                    >
                      <tr>
                        <th class="py-3 px-4">Title</th>
                        <th class="px-2">Duration</th>
                        <th class="px-2">Rating</th>
                        <th class="px-2">Status</th>
                        <th class="px-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <transition-group tag="tbody" name="list">
                      <tr
                        v-for="m in paged"
                        :key="m.id"
                        class="border-b border-zinc-800/40"
                      >
                        <td class="py-3 px-4">
                          <div class="font-semibold">{{ m.title }}</div>
                          <div class="text-xs opacity-70 line-clamp-2">
                            {{ m.overview || "-" }}
                          </div>
                        </td>
                        <td class="px-2">{{ m.durationMin }} min</td>
                        <td class="px-2">{{ m.rating || "-" }}</td>
                        <td class="px-2">
                          <span
                            :class="m.active ? 'text-emerald-400' : 'text-zinc-400'"
                            >{{ m.active ? "Active" : "Hidden" }}</span
                          >
                        </td>
                        <td class="px-2 text-right whitespace-nowrap">
                          <button
                            class="px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600 mr-2"
                            @click="edit(m)"
                          >
                            Edit
                          </button>
                          <button
                            class="px-2 py-1 rounded"
                            :class="
                              m.active
                                ? 'bg-amber-600/80 hover:bg-amber-600'
                                : 'bg-emerald-600/80 hover:bg-emerald-600'
                            "
                            @click="toggleActive(m)"
                          >
                            {{ m.active ? "Disable" : "Enable" }}
                          </button>
                          <button
                            class="ml-2 px-2 py-1 rounded bg-red-600/80 hover:bg-red-600"
                            @click="removeSoft(m.id)"
                          >
                            Hide
                          </button>
                        </td>
                      </tr>
                    </transition-group>
                  </table>
                </div>
                <div class="flex items-center justify-between px-4 py-3 text-sm">
                  <div class="opacity-70">
                    Page {{ page }} / {{ totalPages }} •
                    {{ filtered.length.toLocaleString() }} items
                  </div>
                  <div class="flex items-center gap-2">
                    <button
                      class="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50"
                      :disabled="page <= 1"
                      @click="page = Math.max(1, page - 1)"
                    >
                      Prev
                    </button>
                    <button
                      class="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50"
                      :disabled="page >= totalPages"
                      @click="page = Math.min(totalPages, page + 1)"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>

              <div v-if="loading" class="text-center py-4 opacity-70">
                Loading…
              </div>
              <div v-if="errorText" class="mt-3 text-red-300">
                {{ errorText }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease;
}
.pop-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}
.pop-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}
.pop-enter-active,
.pop-leave-active {
  transition: transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.22s;
}
.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
.list-enter-active,
.list-leave-active {
  transition: all 0.16s ease;
}
.list-move {
  transition: transform 0.18s ease;
}
</style>
