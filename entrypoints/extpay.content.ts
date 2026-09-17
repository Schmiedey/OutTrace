import "extpay";

export default defineContentScript({
  matches: ["https://extensionpay.com/*"],
  runAt: "document_start",
  main() {},
});
