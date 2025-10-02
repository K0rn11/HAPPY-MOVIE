<!-- src/components/AdminPromotions.vue -->
<script setup lang="ts">
import { ref, computed, watch } from "vue";
import axios from "axios";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits(["close"]);

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ?? "http://localhost:3001";

/* ----------------- Auth helpers ----------------- */
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
function currentEmail(): string {
  try {
    const raw = localStorage.getItem("auth_user");
    if (!raw) return "";
    const u = JSON.parse(raw);
    return u?.email || u?.user?.email || "";
  } catch {
    return "";
  }
}
const authHeader = computed(() => ({
  headers: { Authorization: `Bearer ${getBearer()}` },
}));

/* ----------------- 🔔 Broadcaster: แจ้งหน้า Home ให้รีเฟรช Now Playing ----------------- */
function announceMoviesChanged() {
  // 1) ในแท็บ/หน้าเดียวกัน
  try {
    window.dispatchEvent(new CustomEvent("movies-changed"));
  } catch {}

  // 2) cross-tab ผ่าน localStorage (storage event ยิงในแท็บอื่น)
  try {
    localStorage.setItem("movies:updated", String(Date.now()));
  } catch {}

  // 3) cross-tab แบบทันทีผ่าน BroadcastChannel
  try {
    const bc = new BroadcastChannel("admin-updates");
    bc.postMessage("movies");
    bc.close();
  } catch {}
}

/* ----------------- List state ----------------- */
type Promo = {
  id: number;
  code: string;
  type: "PERCENT" | "FIXED";
  value: number;
  maxDiscount: number | null;
  minSpend: number | null;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  usagePerUser: number | null;
  active: boolean;
  createdAt?: string | null;
  usageCount: number;
  uniqueUsers: number;
};

const list = ref<Promo[]>([]);
const loading = ref(false);
const errorText = ref("");

/* filters / sort / search / pagination */
const q = ref("");
const statusFilter = ref<"ALL" | "ACTIVE" | "DISABLED">("ACTIVE");
const sortBy = ref<"createdAt" | "code" | "startsAt" | "endsAt">("createdAt");
const sortDir = ref<"desc" | "asc">("desc");
const page = ref(1);
const pageSize = ref(10);

/* ----------------- Form state ----------------- */
const emptyForm: Promo = {
  id: 0,
  code: "",
  type: "PERCENT",
  value: 10,
  maxDiscount: null,
  minSpend: null,
  startsAt: "",
  endsAt: "",
  usageLimit: null,
  usagePerUser: null,
  active: true,
  createdAt: null,
  usageCount: 0,
  uniqueUsers: 0,
};
const form = ref<Promo>({ ...emptyForm });
const saving = ref(false);

/* Preview discount */
const previewAmount = ref<number | null>(null);
const previewResult = ref<{ discount: number; final: number } | null>(null);
const previewLoading = ref(false);

/* ----------------- Fetch / map ----------------- */
function mapApiItem(p: any): Promo {
  return {
    id: Number(p.id),
    code: p.code,
    type: (p.type || "PERCENT").toUpperCase(),
    value: Number(p.value),
    maxDiscount: p.maxDiscount != null ? Number(p.maxDiscount) : null,
    minSpend: p.minSpend != null ? Number(p.minSpend) : null,
    startsAt: p.startsAt ? new Date(p.startsAt).toISOString() : null,
    endsAt: p.endsAt ? new Date(p.endsAt).toISOString() : null,
    usageLimit: p.usageLimit != null ? Number(p.usageLimit) : null,
    usagePerUser: p.usagePerUser != null ? Number(p.usagePerUser) : null,
    // กัน null = active
    active: p.active !== false,
    createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
    usageCount: Number(p.usageCount ?? 0),
    uniqueUsers: Number(p.uniqueUsers ?? 0),
  } as Promo;
}

async function fetchList() {
  if (!isAdmin()) {
    errorText.value = "ต้องเป็นผู้ดูแลระบบเท่านั้น";
    return;
  }
  loading.value = true;
  errorText.value = "";
  try {
    const params = new URLSearchParams({ status: statusFilter.value });
    const { data } = await axios.get(
      `${API_BASE}/api/admin/promotions?${params.toString()}`,
      authHeader.value
    );
    if (!data?.ok) throw new Error(data?.error || "Load failed");
    list.value = (data.promotions || []).map(mapApiItem);
    page.value = 1;
  } catch (e: any) {
    errorText.value =
      e?.response?.data?.error || e.message || "โหลดข้อมูลไม่สำเร็จ";
  } finally {
    loading.value = false;
  }
}

/* ----------------- Derived list ----------------- */
const filtered = computed(() => {
  let arr = list.value.slice();

  if (statusFilter.value === "ACTIVE") arr = arr.filter((x) => x.active);
  if (statusFilter.value === "DISABLED") arr = arr.filter((x) => !x.active);

  if (q.value.trim()) {
    const s = q.value.trim().toUpperCase();
    arr = arr.filter(
      (x) =>
        x.code.toUpperCase().includes(s) ||
        (x.type || "").toString().toUpperCase().includes(s)
    );
  }

  arr.sort((a, b) => {
    const dir = sortDir.value === "asc" ? 1 : -1;
    const key = sortBy.value;
    let va: any = (a as any)[key];
    let vb: any = (b as any)[key];

    if (key === "createdAt" || key === "startsAt" || key === "endsAt") {
      va = va ? new Date(va).getTime() : 0;
      vb = vb ? new Date(vb).getTime() : 0;
    }
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });

  return arr;
});

const totalPages = computed(() =>
  Math.max(1, Math.ceil(filtered.value.length / pageSize.value))
);
const paged = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return filtered.value.slice(start, start + pageSize.value);
});

/* ----------------- Form helpers ----------------- */
function resetForm() {
  form.value = { ...emptyForm };
  previewAmount.value = null;
  previewResult.value = null;
}
function edit(item: Promo) {
  form.value = {
    ...item,
    startsAt: item.startsAt ? item.startsAt.slice(0, 16) : "",
    endsAt: item.endsAt ? item.endsAt.slice(0, 16) : "",
  };
  previewAmount.value = null;
  previewResult.value = null;
}
function duplicate(item: Promo) {
  form.value = {
    ...emptyForm,
    code: (item.code || "") + "-COPY",
    type: item.type,
    value: item.value,
    maxDiscount: item.maxDiscount,
    minSpend: item.minSpend,
    startsAt: item.startsAt ? item.startsAt.slice(0, 16) : "",
    endsAt: item.endsAt ? item.endsAt.slice(0, 16) : "",
    usageLimit: item.usageLimit,
    usagePerUser: item.usagePerUser,
    active: item.active,
  };
  previewAmount.value = null;
  previewResult.value = null;
}
watch(
  () => form.value.code,
  (v) => {
    if (v == null) return;
    form.value.code = String(v).toUpperCase().replace(/\s+/g, "");
  }
);
watch(
  () => form.value.type,
  (t) => {
    if (t === "PERCENT") {
      form.value.value = Math.min(100, Math.max(1, Number(form.value.value || 10)));
      if (form.value.maxDiscount == null) form.value.maxDiscount = 200;
    }
  }
);

/* ----------------- Save / Toggle / Disable ----------------- */
async function save() {
  if (!isAdmin()) return;
  saving.value = true;
  try {
    const payload: any = { ...form.value };
    payload.value = Number(payload.value);
    payload.maxDiscount =
      payload.maxDiscount != null ? Number(payload.maxDiscount) : null;
    payload.minSpend =
      payload.minSpend != null ? Number(payload.minSpend) : null;
    payload.usageLimit =
      payload.usageLimit != null ? Number(payload.usageLimit) : null;
    payload.usagePerUser =
      payload.usagePerUser != null ? Number(payload.usagePerUser) : null;
    payload.startsAt = payload.startsAt ? new Date(payload.startsAt).toISOString() : null;
    payload.endsAt = payload.endsAt ? new Date(payload.endsAt).toISOString() : null;
    payload.type = String(payload.type || "PERCENT").toUpperCase();

    if (!payload.code) throw new Error("กรุณากรอก CODE");
    if (payload.type === "PERCENT" && (payload.value < 1 || payload.value > 100))
      throw new Error("เปอร์เซ็นต์ต้องอยู่ระหว่าง 1–100");

    if (payload.id && Number(payload.id) > 0) {
      await axios.patch(
        `${API_BASE}/api/admin/promotions/${Number(payload.id)}`,
        payload,
        authHeader.value
      );
    } else {
      await axios.post(
        `${API_BASE}/api/admin/promotions`,
        payload,
        authHeader.value
      );
    }

    // ✅ แจ้งหน้า Home ว่ามีการเปลี่ยนแปลง (กันเคสที่มีหน้า Now Playing เปิดอยู่)
    announceMoviesChanged();

    await fetchList();
    resetForm();
  } catch (e: any) {
    alert(e?.response?.data?.error || e.message || "บันทึกไม่สำเร็จ");
  } finally {
    saving.value = false;
  }
}

async function toggleActive(item: Promo) {
  if (!isAdmin()) return;
  try {
    await axios.patch(
      `${API_BASE}/api/admin/promotions/${item.id}`,
      { active: !item.active },
      authHeader.value
    );

    // ✅ แจ้งเปลี่ยนแปลง
    announceMoviesChanged();

    await fetchList();
  } catch (e: any) {
    alert(e?.response?.data?.error || e.message || "อัปเดตไม่สำเร็จ");
  }
}

async function disableItem(id: number) {
  if (!isAdmin()) return;
  if (!confirm("ปิดใช้งานโปรโมชันนี้?")) return;
  try {
    // server จะทำ soft delete = active:false
    await axios.delete(`${API_BASE}/api/admin/promotions/${id}`, authHeader.value);

    // เอาออกจาก list ในทันที (รู้สึกไวขึ้น)
    list.value = list.value.filter((x) => x.id !== id);

    // ✅ แจ้งเปลี่ยนแปลง
    announceMoviesChanged();

    // รีคำนวณหน้าเพจ (กันหน้าเกิน)
    const maxPage = Math.max(1, Math.ceil(list.value.length / pageSize.value));
    if (page.value > maxPage) page.value = maxPage;

    // ดึงข้อมูลตาม filter ปัจจุบัน
    await fetchList();
  } catch (e: any) {
    alert(e?.response?.data?.error || e.message || "ปิดใช้งานไม่สำเร็จ");
  }
}

/* ----------------- Preview discount ----------------- */
async function doPreview() {
  previewResult.value = null;
  if (!form.value.code || !previewAmount.value || previewAmount.value <= 0) {
    return;
  }
  previewLoading.value = true;
  try {
    const params = new URLSearchParams({
      code: form.value.code,
      amount: String(previewAmount.value),
      email: currentEmail() || "",
    });
    const { data } = await axios.get(
      `${API_BASE}/api/promotions/preview?${params.toString()}`
    );
    if (!data?.ok) throw new Error(data?.error || "Preview failed");
    previewResult.value = {
      discount: Number(data.discount || 0),
      final: Number(data.final || previewAmount.value),
    };
  } catch (e: any) {
    alert(e?.response?.data?.error || e.message || "พรีวิวไม่สำเร็จ");
  } finally {
    previewLoading.value = false;
  }
}

/* ----------------- Open/Close + filter watch ----------------- */
watch(
  () => props.open,
  (v) => {
    if (v) {
      document.body.style.overflow = "hidden";
      fetchList();
    } else {
      document.body.style.overflow = "";
    }
  },
  { immediate: true }
);

// เปลี่ยนตัวกรอง → โหลดจากเซิร์ฟเวอร์ใหม่เสมอ
watch(statusFilter, () => {
  page.value = 1;
  fetchList();
});
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-[10000]">
    <!-- Backdrop -->
    <transition name="fade">
      <div class="absolute inset-0 bg-black/70" @click="$emit('close')" />
    </transition>

    <!-- Modal -->
    <transition name="pop">
      <div
        class="relative mx-auto my-8 w-[95vw] max-w-6xl rounded-2xl bg-zinc-900 text-white shadow-2xl border border-zinc-800/50"
      >
        <!-- Header -->
        <div
          class="sticky top-0 z-10 flex items-center justify-between px-5 py-4 rounded-t-2xl bg-gradient-to-b from-zinc-900 to-zinc-900/80 backdrop-blur supports-[backdrop-filter]:bg-zinc-900/70 border-b border-zinc-800/60"
        >
          <div class="flex items-center gap-3">
            <div
              class="w-9 h-9 rounded-xl bg-primary/20 border border-primary/30 grid place-items-center"
            >
              %
            </div>
            <div>
              <h2 class="text-lg font-semibold leading-tight">
                Admin • Promotions
              </h2>
              <p class="text-xs text-zinc-400">
                จัดการโค้ดส่วนลด / เปิด-ปิด / พรีวิวผลส่วนลดแบบเรียลไทม์
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <button
              class="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700"
              @click="fetchList"
              :disabled="loading"
            >
              {{ loading ? 'Loading…' : 'Refresh' }}
            </button>
            <button
              class="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700"
              @click="$emit('close')"
            >
              ปิด
            </button>
          </div>
        </div>

        <!-- Admin gate -->
        <div v-if="!isAdmin()" class="p-5">
          <div
            class="p-4 rounded-xl bg-red-900/30 border border-red-700 text-red-100"
          >
            คุณไม่มีสิทธิ์เข้าหน้านี้
          </div>
        </div>

        <div v-else class="px-5 pb-5">
          <!-- Toolbar -->
          <div class="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <div class="flex">
              <input
                v-model="q"
                type="text"
                class="w-full px-3 py-2 rounded-lg text-black"
                placeholder="ค้นหา (CODE / TYPE)"
              />
            </div>
            <div class="flex items-center gap-2">
              <select
                v-model="statusFilter"
                class="w-full px-3 py-2 rounded-lg text-black"
              >
                <option value="ALL">ทั้งหมด</option>
                <option value="ACTIVE">ใช้งานอยู่</option>
                <option value="DISABLED">ปิดใช้งาน</option>
              </select>
            </div>
            <div class="flex items-center gap-2">
              <select
                v-model="sortBy"
                class="w-full px-3 py-2 rounded-lg text-black"
              >
                <option value="createdAt">ล่าสุด</option>
                <option value="code">CODE</option>
                <option value="startsAt">เริ่ม</option>
                <option value="endsAt">สิ้นสุด</option>
              </select>
              <select
                v-model="sortDir"
                class="w-full px-3 py-2 rounded-lg text-black"
              >
                <option value="desc">⬇️</option>
                <option value="asc">⬆️</option>
              </select>
            </div>
            <div class="flex items-center justify-between gap-2 lg:col-span-2">
              <button
                class="px-3 py-2 rounded-lg bg-primary/90 hover:bg-primary text-white"
                @click="resetForm"
                title="New promotion"
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

          <!-- Body: Form + List -->
          <div class="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
            <!-- Form -->
            <div class="lg:col-span-1 rounded-2xl border border-zinc-800/60 bg-zinc-900/50 p-4">
              <div class="font-semibold mb-3">Promotion Editor</div>

              <div class="grid grid-cols-1 gap-3">
                <div class="grid grid-cols-3 gap-2">
                  <div class="col-span-2">
                    <label class="text-xs text-zinc-400">CODE</label>
                    <input
                      v-model="form.code"
                      class="w-full px-3 py-2 rounded-lg text-black font-mono"
                      placeholder="MOVIE50"
                    />
                  </div>
                  <div>
                    <label class="text-xs text-zinc-400">Type</label>
                    <select
                      v-model="form.type"
                      class="w-full px-3 py-2 rounded-lg text-black"
                    >
                      <option value="PERCENT">PERCENT %</option>
                      <option value="FIXED">FIXED ฿</option>
                    </select>
                  </div>
                </div>

                <div class="grid grid-cols-3 gap-2">
                  <div>
                    <label class="text-xs text-zinc-400">
                      Value <span v-if="form.type==='PERCENT'">(%)</span><span v-else>(฿)</span>
                    </label>
                    <input
                      v-model.number="form.value"
                      type="number"
                      step="0.01"
                      min="0"
                      class="w-full px-3 py-2 rounded-lg text-black"
                      placeholder="10"
                    />
                  </div>
                  <div>
                    <label class="text-xs text-zinc-400">Max Discount (฿)</label>
                    <input
                      v-model.number="form.maxDiscount"
                      type="number"
                      step="0.01"
                      min="0"
                      class="w-full px-3 py-2 rounded-lg text-black"
                      placeholder="เช่น 200"
                    />
                  </div>
                  <div>
                    <label class="text-xs text-zinc-400">Min Spend (฿)</label>
                    <input
                      v-model.number="form.minSpend"
                      type="number"
                      step="0.01"
                      min="0"
                      class="w-full px-3 py-2 rounded-lg text-black"
                      placeholder="เช่น 300"
                    />
                  </div>
                </div>

                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label class="text-xs text-zinc-400">Starts At</label>
                    <input
                      v-model="form.startsAt"
                      type="datetime-local"
                      class="w-full px-3 py-2 rounded-lg text-black"
                    />
                  </div>
                  <div>
                    <label class="text-xs text-zinc-400">Ends At</label>
                    <input
                      v-model="form.endsAt"
                      type="datetime-local"
                      class="w-full px-3 py-2 rounded-lg text-black"
                    />
                  </div>
                </div>

                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label class="text-xs text-zinc-400">Usage Limit</label>
                    <input
                      v-model.number="form.usageLimit"
                      type="number"
                      min="0"
                      class="w-full px-3 py-2 rounded-lg text-black"
                      placeholder="ทั้งหมด"
                    />
                  </div>
                  <div>
                    <label class="text-xs text-zinc-400">Per User</label>
                    <input
                      v-model.number="form.usagePerUser"
                      type="number"
                      min="0"
                      class="w-full px-3 py-2 rounded-lg text-black"
                      placeholder="ต่อคน"
                    />
                  </div>
                </div>

                <label class="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" v-model="form.active" />
                  Active
                </label>

                <!-- Preview -->
                <div class="mt-1 p-3 rounded-xl bg-zinc-800/40 border border-zinc-700/50">
                  <div class="text-xs text-зinc-400 mb-2">
                    พรีวิวส่วนลด (กรอกยอดคำสั่งซื้อ)
                  </div>
                  <div class="flex gap-2">
                    <input
                      v-model.number="previewAmount"
                      type="number"
                      min="0"
                      class="flex-1 px-3 py-2 rounded-lg text-black"
                      placeholder="เช่น 450"
                    />
                    <button
                      class="px-3 py-2 rounded-lg bg-primary/90 hover:bg-primary text-white disabled:opacity-50"
                      @click="doPreview"
                      :disabled="!form.code || !previewAmount || previewLoading"
                    >
                      {{ previewLoading ? '...' : 'Preview' }}
                    </button>
                  </div>
                  <div v-if="previewResult" class="mt-2 text-sm flex items-center justify-between">
                    <div class="text-emerald-300">
                      ส่วนลด: -{{ previewResult.discount.toLocaleString() }} ฿
                    </div>
                    <div class="font-semibold">
                      ชำระจริง: {{ previewResult.final.toLocaleString() }} ฿
                    </div>
                  </div>
                </div>

                <div class="flex gap-2 mt-1">
                  <button
                    class="px-4 py-2 rounded-lg bg-primary/90 hover:bg-primary text-white disabled:opacity-50"
                    :disabled="saving"
                    @click="save"
                  >
                    {{ saving ? 'Saving…' : (form.id ? 'Update' : 'Create') }}
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

            <!-- List -->
            <div class="lg:col-span-2">
              <div class="rounded-2xl border border-zinc-800/60 bg-zinc-900/50 overflow-hidden">
                <div class="overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead class="text-left text-zinc-400 bg-zinc-900/60 border-b border-zinc-800/60">
                      <tr>
                        <th class="py-3 px-4">Code</th>
                        <th class="px-2">Type</th>
                        <th class="px-2">Value</th>
                        <th class="px-2">Rules</th>
                        <th class="px-2">Window</th>
                        <th class="px-2">Usage</th>
                        <th class="px-2">Status</th>
                        <th class="px-2 text-right">Actions</th>
                      </tr>
                    </thead>

                    <transition-group tag="tbody" name="list">
                      <tr v-for="p in paged" :key="p.id" class="border-b border-зinc-800/40">
                        <td class="py-3 px-4 font-mono">{{ p.code }}</td>
                        <td class="px-2">{{ p.type }}</td>
                        <td class="px-2">
                          <span v-if="p.type==='PERCENT'">{{ p.value }}%</span>
                          <span v-else>{{ p.value.toLocaleString() }} ฿</span>
                        </td>
                        <td class="px-2 text-xs text-zinc-300">
                          <div v-if="p.minSpend">min {{ p.minSpend }} ฿</div>
                          <div v-if="p.maxDiscount">cap {{ p.maxDiscount }} ฿</div>
                          <div v-if="p.usageLimit">limit {{ p.usageLimit }}</div>
                          <div v-if="p.usagePerUser">per user {{ p.usagePerUser }}</div>
                        </td>
                        <td class="px-2 text-xs">
                          <div>
                            <span class="opacity-70">Start:</span>
                            <span class="ml-1">{{ p.startsAt ? new Date(p.startsAt).toLocaleString() : "-" }}</span>
                          </div>
                          <div>
                            <span class="opacity-70">End:</span>
                            <span class="ml-1">{{ p.endsAt ? new Date(p.endsAt).toLocaleString() : "-" }}</span>
                          </div>
                        </td>
                        <td class="px-2">
                          <div class="text-xs">
                            <div>Used: <span class="font-medium">{{ p.usageCount }}</span></div>
                            <div class="opacity-80">Users: {{ p.uniqueUsers }}</div>
                          </div>
                        </td>
                        <td class="px-2">
                          <span :class="p.active ? 'text-emerald-400' : 'text-zinc-400'">
                            {{ p.active ? "Active" : "Disabled" }}
                          </span>
                        </td>
                        <td class="px-2 text-right whitespace-nowrap">
                          <button class="px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600 mr-2" @click="edit(p)">
                            Edit
                          </button>
                          <button class="px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600 mr-2" @click="duplicate(p)">
                            Duplicate
                          </button>
                          <button
                            class="px-2 py-1 rounded"
                            :class="p.active ? 'bg-amber-600/80 hover:bg-amber-600' : 'bg-emerald-600/80 hover:bg-emerald-600'"
                            @click="toggleActive(p)"
                          >
                            {{ p.active ? 'Disable' : 'Enable' }}
                          </button>
                          <button
                            class="ml-2 px-2 py-1 rounded bg-red-600/80 hover:bg-red-600"
                            @click="disableItem(p.id)"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    </transition-group>
                  </table>
                </div>

                <!-- Paging -->
                <div class="flex items-center justify-between px-4 py-3 text-sm">
                  <div class="opacity-70">
                    Page {{ page }} / {{ totalPages }} •
                    {{ filtered.length.toLocaleString() }} items
                  </div>
                  <div class="flex items-center gap-2">
                    <button
                      class="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50"
                      :disabled="page<=1"
                      @click="page = Math.max(1, page - 1)"
                    >
                      Prev
                    </button>
                    <button
                      class="px-3 py-1.5 rounded bg-зinc-800 hover:bg-зinc-700 disabled:opacity-50"
                      :disabled="page>=totalPages"
                      @click="page = Math.min(totalPages, page + 1)"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>

              <div v-if="loading" class="text-center py-4 opacity-70">Loading…</div>
              <div v-if="errorText" class="mt-3 text-red-300">{{ errorText }}</div>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
/* transitions */
.fade-enter-from, .fade-leave-to { opacity: 0 }
.fade-enter-active, .fade-leave-active { transition: opacity .18s ease }

.pop-enter-from   { opacity: 0; transform: translateY(8px) scale(.98) }
.pop-leave-to     { opacity: 0; transform: translateY(8px) scale(.98) }
.pop-enter-active,
.pop-leave-active { transition: transform .22s cubic-bezier(.2,.8,.2,1), opacity .22s }

.list-enter-from, .list-leave-to { opacity: 0; transform: translateY(4px) }
.list-enter-active, .list-leave-active { transition: all .16s ease }
.list-move { transition: transform .18s ease }

:deep(input[type="checkbox"]) { width: 16px; height: 16px; }
</style>
