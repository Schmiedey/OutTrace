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
    name: "LinkScope",
    description:
      "Understand a page’s tracking exposure with a plain-English score, graph explanations, and private local scan history.",
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
    optional_host_permissions: ["*://*/*"],
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
      default_title: "LinkScope",
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: ["cytoscape", "cytoscape-fcose"],
    },
  }),
});
