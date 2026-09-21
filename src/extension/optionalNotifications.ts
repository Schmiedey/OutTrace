export async function notificationsPermissionGranted(): Promise<boolean> {
  if (typeof browser === "undefined" || !browser.notifications?.create) return false;
  if (!browser.permissions?.contains) return true;
  try {
    return await browser.permissions.contains({ permissions: ["notifications"] });
  } catch {
    return false;
  }
}

export async function requestNotificationsPermission(): Promise<boolean> {
  if (await notificationsPermissionGranted()) return true;
  if (typeof browser === "undefined" || !browser.permissions?.request) return false;
  try {
    return await browser.permissions.request({ permissions: ["notifications"] });
  } catch {
    return false;
  }
}

export async function releaseNotificationsPermission(): Promise<void> {
  if (typeof browser === "undefined" || !browser.permissions?.remove) return;
  await browser.permissions.remove({ permissions: ["notifications"] }).catch(() => false);
}
