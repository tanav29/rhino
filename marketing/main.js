// Illustrative sessions only; this marketing page never connects to a machine.
const sessions = {
  local: {
    name: "MacBook",
    shell: "zsh",
    kind: "local",
    prompt: "you@macbook",
    path: "~/projects/term",
    command: "git status --short",
    lines: ["M  src/mainview/App.tsx", "M  src/mainview/globals.css"],
  },
  server: {
    name: "dev-server",
    shell: "bash",
    kind: "remote",
    prompt: "dev@dev-server",
    path: "~/projects/api",
    command: "bun run dev",
    lines: [
      "$ bun --watch src/index.ts",
      "Listening on http://localhost:3000",
      "Ready for your next idea.",
    ],
  },
  home: {
    name: "home-lab",
    shell: "bash",
    kind: "remote",
    prompt: "you@home-lab",
    path: "~/services",
    command: "docker compose ps --format '{{.Name}}  {{.Status}}'",
    lines: ["media-server   Up 3 hours", "home-assistant Up 3 hours", "backup         Up 3 hours"],
  },
};

const machineButtons = document.querySelectorAll("[data-machine]");
const output = document.getElementById("shell-output");

function line(...parts) {
  const element = document.createElement("p");
  element.append(...parts);
  return element;
}

function styled(text, className) {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = text;
  return element;
}

function selectMachine(button) {
  const session = sessions[button.dataset.machine];
  if (!session) return;

  for (const machine of machineButtons) {
    const selected = machine === button;
    machine.classList.toggle("selected", selected);
    machine.setAttribute("aria-pressed", String(selected));
  }

  document.getElementById("session-name").textContent = session.name;
  document.getElementById("shell-type").textContent = session.shell;
  document.getElementById("connection").textContent = `Connected to ${session.name}`;
  document.getElementById("connection-kind").textContent = session.kind;
  document.getElementById("session-location").textContent =
    `${session.kind === "local" ? "Local" : "Remote"} session`;

  const prompt = () => line(styled(session.prompt, "prompt"), " ", styled(session.path, "path"));
  const result = session.lines.map((text) => {
    const element = line(text);
    element.className = "output-muted";
    return element;
  });
  const nextPrompt = prompt();
  nextPrompt.className = "output-gap";
  const cursor = styled("", "cursor");
  cursor.setAttribute("aria-hidden", "true");
  output.replaceChildren(
    prompt(),
    line(styled("❯", "prompt-arrow"), session.command),
    ...result,
    nextPrompt,
    line(styled("❯", "prompt-arrow"), cursor),
  );
}

for (const button of machineButtons) {
  button.addEventListener("click", () => selectMachine(button));
}

const initialMachine = document.querySelector('[data-machine][aria-pressed="true"]');
if (initialMachine) selectMachine(initialMachine);
