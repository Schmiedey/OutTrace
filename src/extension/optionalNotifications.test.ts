import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  notificationsPermissionGranted,
  releaseNotificationsPermission,
  requestNotificationsPermission,
} from "./optionalNotifications";

describe("optional notification permission", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("treats an existing grant as already allowed", async () => {
    vi.stubGlobal("browser", {
      notifications: { create: vi.fn() },
      permissions: {
        contains: vi.fn().mockResolvedValue(true),
        request: vi.fn(),
      },
    });
    await expect(notificationsPermissionGranted()).resolves.toBe(true);
    await expect(requestNotificationsPermission()).resolves.toBe(true);
    expect(browser.permissions.request).not.toHaveBeenCalled();
  });

  it("requests the permission from a user gesture when missing", async () => {
    vi.stubGlobal("browser", {
      notifications: { create: vi.fn() },
      permissions: {
        contains: vi.fn().mockResolvedValue(false),
        request: vi.fn().mockResolvedValue(true),
        remove: vi.fn().mockResolvedValue(true),
      },
    });
    await expect(requestNotificationsPermission()).resolves.toBe(true);
    expect(browser.permissions.request).toHaveBeenCalledWith({
      permissions: ["notifications"],
    });
    await releaseNotificationsPermission();
    expect(browser.permissions.remove).toHaveBeenCalledWith({
      permissions: ["notifications"],
    });
  });

  it("does not prompt when the user declines", async () => {
    vi.stubGlobal("browser", {
      notifications: { create: vi.fn() },
      permissions: {
        contains: vi.fn().mockResolvedValue(false),
        request: vi.fn().mockResolvedValue(false),
      },
    });
    await expect(requestNotificationsPermission()).resolves.toBe(false);
  });
});
