<script lang="ts" setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from "vue";
import { useColorMode } from "@vueuse/core";
import { Menu, Film, Ticket, LifeBuoy, BadgePercent } from "lucide-vue-next";
import { logoutUser, isLoggedIn } from "@/store/store";
import AdminMovies from "./AdminMovies.vue";

import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import ToggleTheme from "./ToggleTheme.vue";
import Login from "./Login.vue";
import Signup from "./Signup.vue";
import Team from "./Team.vue";

/* ✅ ตั้งค่า default ให้เป็น Light mode และจดจำค่า */
const mode = useColorMode({
  initialValue: "light",
  storageKey: "color-scheme",
});

const isAdminMoviesOpen = ref(false);
const openAdminMovies = () => {
  isOpen.value = false;
  isAdminMoviesOpen.value = true;
};


/* ====== STATE ====== */
const isOpen = ref(false);
const isMovieOpen = ref(false);
const userIsLoggedIn = computed(() => isLoggedIn.value);

/* ====== DB ROLE (เช็คจากเซิร์ฟเวอร์เท่านั้น) ====== */
const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ?? "http://localhost:3001";

const dbRole = ref<string | null>(null);

/** เรียกเซิร์ฟเวอร์เพื่ออ่านข้อมูลผู้ใช้ (เช่น /api/auth/me) แล้วเก็บ role */
async function fetchRoleFromDB() {
  try {
    if (!userIsLoggedIn.value) {
      dbRole.value = null;
      return;
    }
    const token = localStorage.getItem("auth_token") || "";
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    dbRole.value = (data?.role ?? data?.user?.role ?? null) as string | null;
  } catch (e) {
    console.error("fetchRoleFromDB failed:", e);
    dbRole.value = null;
  }
}

/* ปุ่ม Admin จะแสดงก็ต่อเมื่อ role จาก DB เป็น ADMIN เท่านั้น */
const isAdmin = computed(() => dbRole.value === "ADMIN");

/* Sign out แล้วล้าง role ในแถบหัว */
const handleSignOut = () => {
  logoutUser();
  dbRole.value = null;
};

/* ====== NAV EVENTS ====== */
const openMyTicket = () => {
  isOpen.value = false;
  window.dispatchEvent(new CustomEvent("open-overlay", { detail: { target: "ticket" } }));
};
const openSupport = () => {
  isOpen.value = false;
  window.dispatchEvent(new CustomEvent("open-overlay", { detail: { target: "support" } }));
};
const openAdmin = () => {
  isOpen.value = false;
  window.dispatchEvent(new CustomEvent("open-overlay", { detail: { target: "admin" } }));
};

/* sync close-all-overlays → ปิด Movie overlay ด้วย */
const onCloseAllOverlays = () => { isMovieOpen.value = false; };

/* ====== LIFECYCLE ====== */
onMounted(() => {
  window.addEventListener("close-all-overlays", onCloseAllOverlays);
  fetchRoleFromDB();
});

/* เมื่อสถานะล็อกอินเปลี่ยน → ดึง role ใหม่จาก DB */
watch(userIsLoggedIn, (v) => {
  if (!v) dbRole.value = null;
  else fetchRoleFromDB();
});

/* เผื่อ token ถูกเปลี่ยนจากแท็บอื่น → ฟัง storage event แล้วโหลด role ใหม่ */
const onStorage = (e: StorageEvent) => {
  if (e.key === "auth_token" || e.key === "auth_user") {
    fetchRoleFromDB();
  }
};
onMounted(() => window.addEventListener("storage", onStorage));

onBeforeUnmount(() => {
  window.removeEventListener("close-all-overlays", onCloseAllOverlays);
  window.removeEventListener("storage", onStorage);
});
</script>

<template>
  <header
    :class="{
      'shadow-light': mode === 'light',
      'shadow-dark': mode === 'dark',
      'w-[90%] md:w-[70%] lg:w-[75%] lg:max-w-screen-xl top-5 mx-auto sticky border z-40 rounded-2xl flex justify-between items-center p-2 bg-card shadow-md': true,
    }"
  >
    <!-- Brand -->
    <a href="/" class="font-bold text-lg flex items-center">
      <img
        src="@/assets/happymovie.png"
        alt="Happy Movie Logo"
        class="h-9 w-auto mr-2 select-none"
        draggable="false"
      />
      <span class="tracking-wide">HAPPY MOVIE</span>
    </a>

    <!-- Mobile -->
    <div class="flex items-center lg:hidden">
      <Sheet v-model:open="isOpen">
        <SheetTrigger as-child>
          <Menu @click="isOpen = true" class="cursor-pointer" />
        </SheetTrigger>

        <SheetContent side="left" class="flex flex-col justify-between rounded-tr-2xl rounded-br-2xl bg-card">
          <div>
            <SheetHeader class="mb-4 ml-4">
              <SheetTitle class="flex items-center">
                <a href="/" class="flex items-center">
                  <img
                    src="@/assets/happymovie.png"
                    alt="Happy Movie Logo"
                    class="h-9 w-auto mr-2 select-none"
                    draggable="false"
                  />
                  <span class="font-bold tracking-wide">HAPPY MOVIE</span>
                </a>
              </SheetTitle>
            </SheetHeader>

            <div class="flex flex-col gap-2">
              <Button as-child variant="ghost" class="justify-start text-base">
                <a @click.prevent="isMovieOpen = true; isOpen = false" href="#">
                  <Film class="inline-block mr-2 w-4 h-4" /> Movie
                </a>
              </Button>

              <Button as-child variant="ghost" class="justify-start text-base">
                <a @click.prevent="openMyTicket" href="#">
                  <Ticket class="inline-block mr-2 w-4 h-4" /> My Ticket
                </a>
              </Button>

              <Button as-child variant="ghost" class="justify-start text-base">
                <a @click.prevent="openSupport" href="#">
                  <LifeBuoy class="inline-block mr-2 w-4 h-4" /> Support
                </a>
              </Button>

              <Button
                v-if="isAdmin"
                as-child
                variant="outline"
                class="justify-start text-base border-primary/40"
              >
                <a @click.prevent="openAdmin" href="#">
                  <BadgePercent class="inline-block mr-2 w-4 h-4" /> Admin / Promotions
                </a>
              </Button>
            </div>
          </div>

          <SheetFooter class="flex-col sm:flex-col justify-start items-start">
            <Separator class="mb-2" />
            <ToggleTheme />
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>

    <!-- Desktop -->
    <NavigationMenu class="hidden lg:block">
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuLink asChild>
            <div class="flex items-center gap-1">
              <Button as-child variant="ghost" class="justify-start text-base">
                <a href="#" @click.prevent="isMovieOpen = true">
                  <Film class="inline-block mr-2 w-4 h-4" /> Movie
                </a>
              </Button>
              <Button as-child variant="ghost" class="justify-start text-base">
                <a href="#" @click.prevent="openMyTicket">
                  <Ticket class="inline-block mr-2 w-4 h-4" /> My Ticket
                </a>
              </Button>
              <Button as-child variant="ghost" class="justify-start text-base">
                <a href="#" @click.prevent="openSupport">
                  <LifeBuoy class="inline-block mr-2 w-4 h-4" /> Support
                </a>
              </Button>
              <Button
                v-if="isAdmin"
                as-child
                variant="outline"
                class="justify-start text-base ml-1 border-primary/40"
              >
                <a href="#" @click.prevent="openAdmin">
                  <BadgePercent class="inline-block mr-2 w-4 h-4" /> Admin / Promotions
                </a>
              </Button>

              <Button
                v-if="isAdmin"
                as-child
                variant="outline"
                class="justify-start text-base border-primary/40"
              >
                <a @click.prevent="openAdminMovies" href="#">
                  🎬 Admin / Movies
                </a>
              </Button>

            </div>
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>

    <!-- Auth -->
    <div class="hidden lg:flex gap-2 items-center">
      <ToggleTheme />
      <template v-if="userIsLoggedIn">
        <Button size="sm" @click="handleSignOut">Sign Out</Button>
      </template>
      <template v-else>
        <Login />
        <Signup />
      </template>
    </div>

    <AdminMovies :open="isAdminMoviesOpen" @close="isAdminMoviesOpen = false" />
    <!-- Movie overlay -->
    <Team :open="isMovieOpen" @close="isMovieOpen = false" />
  </header>
</template>

<style scoped>
.shadow-light { box-shadow: inset 0 0 5px rgba(0, 0, 0, 0.085); }
.shadow-dark  { box-shadow: inset 0 0 5px rgba(255, 255, 255, 0.141); }
</style>
