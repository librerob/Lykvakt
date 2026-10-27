import "./style.css";
import { openVault } from "./launch";

const status = document.querySelector<HTMLElement>("#launch-status")!;
const retry = document.querySelector<HTMLButtonElement>("#retry")!;
let opening = false;
async function launch(): Promise<void> {
  if (opening) return;
  opening = true;
  retry.hidden = true;
  status.textContent = "Opening Lykvakt…";
  try {
    await openVault();
    window.close();
  } catch {
    status.textContent = "Lykvakt could not open. Try again.";
    retry.hidden = false;
  } finally {
    opening = false;
  }
}
retry.addEventListener("click", () => void launch());
void launch();
