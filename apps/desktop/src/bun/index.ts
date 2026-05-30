import { BrowserWindow, Updater } from "electrobun/bun";

const DEV_SERVER_PORT = 3001;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;
const BUNDLED_MAIN_VIEW_URL = "views://mainview/index.html";

const BUNDLED_MAIN_VIEW_NAVIGATION_RULES = [
  "^*",
  `${BUNDLED_MAIN_VIEW_URL}*`,
];

const DEV_MAIN_VIEW_NAVIGATION_RULES = [
  ...BUNDLED_MAIN_VIEW_NAVIGATION_RULES,
  DEV_SERVER_URL,
  `${DEV_SERVER_URL}/*`,
  `${DEV_SERVER_URL}/@*`,
  `${DEV_SERVER_URL}/src/*`,
  `${DEV_SERVER_URL}/node_modules/*`,
];

// Check if the web dev server is running for HMR
async function getMainViewUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel();
  if (channel === "dev") {
    try {
      const response = await fetch(DEV_SERVER_URL);
      const contentType = response.headers.get("content-type") ?? "";
      const body = response.ok && contentType.includes("text/html") ? await response.text() : "";

      if (!response.ok || !body.includes("<title>DCRM</title>")) {
        throw new Error("Local service did not return the DCRM web app.");
      }

      console.log(`HMR enabled: Using web dev server at ${DEV_SERVER_URL}`);
      return DEV_SERVER_URL;
    } catch {
      console.log('Web dev server not running. Run "pnpm run dev:hmr" for HMR support.');
    }
  }

  return BUNDLED_MAIN_VIEW_URL;
}

const url = await getMainViewUrl();
const navigationRules = url === DEV_SERVER_URL ? DEV_MAIN_VIEW_NAVIGATION_RULES : BUNDLED_MAIN_VIEW_NAVIGATION_RULES;

new BrowserWindow({
  title: "DCRM",
  url,
  sandbox: true,
  navigationRules: JSON.stringify(navigationRules),
  frame: {
    width: 1280,
    height: 820,
    x: 120,
    y: 120,
  },
});

console.log("Electrobun desktop shell started.");
