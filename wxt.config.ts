import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  dev: {
    server: {
      port: 3000,
      strictPort: true,
    },
  },
  manifest: {
    name: "OutTrace",
    description:
      "Monitor website trackers and third-party services. Review changes and prepare client reports. Scan data stays local.",
    permissions: [
      "activeTab",
      "scripting",
      "tabs",
      "alarms",
      "storage",
      "notifications",
      "webRequest",
      "declarativeNetRequest",
    ],
    // These capabilities are requested only from an explicit OutTrace control.
    // They never grant access to a site by themselves.
    optional_permissions: ["contextMenus", "webNavigation"],
    optional_host_permissions: ["*://*/*"],
    chrome_url_overrides: {
      newtab: "newtab.html",
    },
    commands: {
      "scan-active-tab": {
        suggested_key: {
          default: "Alt+Shift+L",
          mac: "Alt+Shift+L",
        },
        description: "Scan the current page",
      },
    },
    action: {
      default_title: "OutTrace",
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: ["cytoscape", "cytoscape-fcose"],
    },
  }),
});
