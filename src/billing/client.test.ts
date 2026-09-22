import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  launchCheckout,
  launchLogin,
  launchManageBilling,
} from "./client";

const contains = vi.fn();
const request = vi.fn();
const sendMessage = vi.fn();

beforeEach(() => {
  contains.mockReset();
  request.mockReset();
  sendMessage.mockReset();
  vi.stubGlobal("browser", {
    permissions: { contains, request },
    runtime: { sendMessage },
  });
  contains.mockResolvedValue(false);
  request.mockResolvedValue(true);
  sendMessage.mockResolvedValue({ ok: true });
});

describe("billing-site permission", () => {
  it.each([
    [launchCheckout, "OPEN_PRO_CHECKOUT"],
    [launchLogin, "OPEN_PRO_LOGIN"],
    [launchManageBilling, "OPEN_BILLING_MANAGEMENT"],
  ] as const)("requests only extensionpay.com before a billing action", async (action, messageType) => {
    await action();
    expect(request).toHaveBeenCalledWith({
      origins: ["https://extensionpay.com/*"],
    });
    expect(sendMessage).toHaveBeenCalledWith({ type: messageType });
  });

  it("does not open billing when access is declined", async () => {
    request.mockResolvedValue(false);
    await expect(launchCheckout()).rejects.toThrow(
      "OutTrace needs access to extensionpay.com",
    );
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("does not prompt again after access is granted", async () => {
    contains.mockResolvedValue(true);
    await launchCheckout();
    expect(request).not.toHaveBeenCalled();
  });
});
