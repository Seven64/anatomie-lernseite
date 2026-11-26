import "./styles/main.css";
import { App } from "./App";

async function main(): Promise<void> {
  const app = new App();
  await app.init();
}

main().catch(error => {
  console.error("Failed to initialize the application:", error);
  const app = document.getElementById("app");
  if (!app) return;

  const message = document.createElement("p");
  message.setAttribute("role", "alert");
  message.textContent = "Die Anwendung konnte nicht gestartet werden. Bitte laden Sie die Seite erneut.";
  message.style.padding = "24px";
  message.style.color = "var(--fg-primary)";
  app.replaceChildren(message);
});