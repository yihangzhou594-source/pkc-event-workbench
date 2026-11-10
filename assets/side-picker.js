function chooseFirstGameBlue(firstTeam, secondTeam) {
  if (document.querySelector(".side-picker[open]")) return Promise.resolve(null);

  const dialog = document.createElement("dialog");
  dialog.className = "side-picker";
  dialog.setAttribute("aria-labelledby", "side-picker-title");
  dialog.innerHTML = '<form method="dialog"><h2 id="side-picker-title">确认第一局红蓝方</h2><p>点选本局的红蓝方安排</p><div class="side-options"></div><button class="side-cancel" value="cancel">取消</button></form>';

  const options = dialog.querySelector(".side-options");
  for (const [index, blue, red] of [[0, firstTeam, secondTeam], [1, secondTeam, firstTeam]]) {
    const button = document.createElement("button");
    button.value = String(index);
    for (const [side, team] of [["蓝方", blue], ["红方", red]]) {
      const row = document.createElement("span");
      const label = document.createElement("small");
      label.textContent = side;
      row.append(label, team);
      button.append(row);
    }
    options.append(button);
  }

  const trigger = document.activeElement;
  document.body.append(dialog);
  return new Promise(resolve => {
    dialog.addEventListener("close", () => {
      const choice = dialog.returnValue;
      dialog.remove();
      if (trigger instanceof HTMLElement) trigger.focus();
      resolve(choice === "0" || choice === "1" ? Number(choice) : null);
    }, { once: true });
    dialog.showModal();
  });
}
