import serverless from "serverless-http";

import type { Express } from "express";

let app: Express | undefined;

async function loadApp() {
  if (app) return app;

  // พยายามนำเข้าแบบ ESM ปกติ
  try {
    const mod = await import("./server");
    // รองรับได้ทั้ง export default app / export const app / export function createApp()
    app =
      (mod as any).app ||
      (mod as any).default ||
      (typeof (mod as any).createApp === "function" ? (mod as any).createApp() : undefined);
  } catch (e) {
    console.error("Failed to import server.ts as ESM:", e);
  }

  if (!app) {
    throw new Error("Cannot locate Express app from server.ts — please export `app` or `createApp()`.");
  }
  return app;
}

export const handler = async (event: any, context: any) => {
  const expressApp = await loadApp();
  const wrapped = serverless(expressApp);
  return wrapped(event, context);
};
