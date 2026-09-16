// The reset page itself. Decisions live in action.js and password-rules.js; this only draws them.
import { askFirebase, firstCall, isRightToLeft, openAppLink, pickLanguage, readLink } from "./action.js";
import { MIN_CLASSES, isAcceptable, problem } from "./password-rules.js";

const card = document.getElementById("card");
const link = readLink(location.search);
// The code is read once and taken out of the address bar, so a screenshot or a shared tab does not carry it.
history.replaceState(null, "", location.pathname);

let words = {};
const say = (key, number) => (words[key] ?? key).replace(/%(\d+\$)?d/, number ?? "");

function element(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  for (const child of children) node.append(child);
  return node;
}

function showResult(kind, sentence) {
  const mark = element("div", { className: kind === "done" ? "mark" : "mark refused", textContent: kind === "done" ? "✓" : "!" });
  mark.setAttribute("aria-hidden", "true");
  const parts = [mark, element("p", { textContent: sentence })];
  const open = kind === "done" ? openAppLink(navigator.userAgent) : null;
  if (open) {
    const logo = element("img", { src: "/assets/turquoise-ai-logo.svg", alt: "" });
    parts.push(element("a", { className: "open", href: open }, [logo, element("span", { textContent: "Turquoise" }), element("span", { textContent: "↗" })]));
  }
  card.replaceChildren(element("div", { className: "result" }, parts));
}

function showResetForm(email, apiKey, code) {
  const title = element("h1", { textContent: say("Reset password") });
  const who = element("p", { className: "who", textContent: email ?? "" });
  // For password managers: the account the new password belongs to.
  const username = element("input", { type: "email", autocomplete: "username", value: email ?? "", hidden: true, readOnly: true });
  const first = element("input", { type: "password", autocomplete: "new-password", required: true });
  const second = element("input", { type: "password", autocomplete: "new-password", required: true });
  const note = element("p", { className: "note", role: "status" });
  const save = element("button", { type: "submit", textContent: say("Save"), disabled: true });

  const check = () => {
    const missing = problem(first.value);
    const mismatch = second.value.length > 0 && first.value !== second.value;
    note.textContent = missing ? say(missing[0], missing[1] ?? MIN_CLASSES) : mismatch ? say("Passwords do not match.") : "";
    save.disabled = !isAcceptable(first.value) || first.value !== second.value;
  };
  first.addEventListener("input", check);
  second.addEventListener("input", check);

  const form = element("form", {}, [
    title, who, username,
    element("label", {}, [say("New password"), first]),
    element("label", {}, [say("Repeat it"), second]),
    note, save,
  ]);
  form.style.display = "grid";
  form.style.gap = "16px";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    check();
    if (save.disabled) return;
    save.disabled = true;
    try {
      await askFirebase("accounts:resetPassword", apiKey, { oobCode: code, newPassword: first.value });
      showResult("done", say("Your password has been changed. Sign in with the new one."));
    } catch (refusal) {
      note.textContent = say(refusal.key ?? "That didn't go through. Try again in a moment.");
      // A spent or expired code cannot be tried again; everything else can.
      if (refusal.key?.startsWith("This link")) showResult("refused", note.textContent);
      else save.disabled = false;
    }
  });
  card.replaceChildren(form);
  first.focus();
}

async function start() {
  let available = ["en"];
  try {
    available = await (await fetch("./strings/languages.json")).json();
  } catch { /* English, from the keys themselves */ }
  const language = pickLanguage(link.language, navigator.languages, available);
  document.documentElement.lang = language;
  document.documentElement.dir = isRightToLeft(language) ? "rtl" : "ltr";
  try {
    words = await (await fetch(`./strings/${language}.json`)).json();
  } catch { words = {}; }

  const call = firstCall(link.mode);
  if (!call || !link.code || !link.apiKey) {
    showResult("refused", say("This link has expired or was already used. Ask for a new one in the app."));
    return;
  }
  try {
    if (link.mode === "resetPassword") {
      // Only checks the code; nothing changes until Save.
      const answer = await askFirebase(call, link.apiKey, { oobCode: link.code });
      showResetForm(answer.email, link.apiKey, link.code);
    } else {
      await askFirebase(call, link.apiKey, { oobCode: link.code });
      showResult("done", say(link.mode === "verifyEmail" ? "Verified" : "Done"));
    }
  } catch (refusal) {
    showResult("refused", say(refusal.key ?? "That didn't go through. Try again in a moment."));
  }
}

start();
