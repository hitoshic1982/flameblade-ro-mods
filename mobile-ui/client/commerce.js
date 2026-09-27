// Tap actions around native shop/storage handlers. DOM references and listeners
// are owned by the component attachment and released with it.
export function attachCommerce({
  component,
  api,
  on,
  add,
  button,
  label,
  attribute,
}) {
  const { name, root } = component;
  let selected = null;
  const select = (selector) =>
    on(root, "click", (event) => {
      const item = event.target.closest?.(selector);
      if (!item) return;
      selected?.classList.remove("ro-mobile-selected");
      selected = item;
      selected.classList.add("ro-mobile-selected");
    });
  const act = (callback) => {
    if (selected?.isConnected) callback(selected);
  };
  const toolbar = () => {
    const node = document.createElement("div");
    node.className = "ro-mobile-toolbar";
    return node;
  };
  if (root.querySelector("#win_popup")) {
    for (const [key, text] of [
      ["buy", "購買"],
      ["sell", "販賣"],
      ["cancel", "取消"],
      ["ok", "確定"],
      ["close", "關閉"],
    ]) {
      label(
        root.querySelector(`button[data-background="btn_${key}.bmp"]`),
        text,
      );
    }
  }
  if (name === "InputBox") {
    label(root.querySelector("ui-button"), "確定");
    attribute(root.querySelector("input"), "aria-label", "數量");
  }
  if (name === "NpcStore") {
    label(root.querySelector(".btn.buy"), "購買");
    label(root.querySelector(".btn.sell"), "販賣");
    label(root.querySelector(".btn.cancel"), "取消");
    label(root.querySelector(".btn.ok"), "確定");
    select(".item[data-index]");
    for (const [selector, text] of [
      [".InputWindow", "加入選取的道具"],
      [".OutputWindow", "移除選取的道具"],
    ]) {
      const panel = root.querySelector(selector),
        bar = toolbar();
      add(
        bar,
        button(text, () =>
          act((item) => {
            if (panel.contains(item))
              item.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
          }),
        ),
      );
      add(
        bar,
        button("道具資訊", () =>
          act((item) => {
            item.querySelector(".icon")?.dispatchEvent(
              new MouseEvent("contextmenu", {
                bubbles: true,
                cancelable: true,
                button: 2,
              }),
            );
          }),
        ),
      );
      add(panel, bar);
    }
  }
  if (name === "Storage" || /^Inventory/.test(name)) {
    const deposit = name !== "Storage",
      bar = toolbar();
    bar.classList.add("ro-storage-controls");
    if (deposit) bar.hidden = true;
    const quantity = document.createElement("input");
    quantity.type = "number";
    quantity.inputMode = "numeric";
    quantity.min = "1";
    quantity.step = "1";
    quantity.value = "1";
    quantity.setAttribute(
      "aria-label",
      deposit ? "存入數量" : "取出數量",
    );
    const message = document.createElement("output");
    message.setAttribute("aria-live", "polite");
    const transfer = (count) =>
      act((item) => {
        const dispatched = api.actions.perform("storage:transfer", {
          direction: deposit ? "deposit" : "withdraw",
          index: Number(item.dataset.index),
          count,
        });
        message.textContent = dispatched
          ? "已送出。"
          : "請選擇未裝備的道具，以及持有範圍內的數量。";
      });
    add(bar, quantity);
    add(
      bar,
      button(deposit ? "存入" : "取出", () =>
        transfer(Number(quantity.value)),
      ),
    );
    add(
      bar,
      button(deposit ? "全部存入" : "全部取出", () => transfer("all")),
    );
    add(
      bar,
      button(deposit ? "回到倉庫" : "打開背包", () =>
        api.actions.perform("window", {
          name: deposit ? "Storage" : "Inventory",
          open: true,
        }),
      ),
    );
    add(bar, message);
    add(root.querySelector(".ui-component-root"), bar);
    select(".content .item[data-index]");
    if (!deposit) {
      label(root.querySelector(".close"), "關閉倉庫");
      label(root.querySelector(".search-button"), "搜尋");
      attribute(
        root.querySelector(".search-input"),
        "aria-label",
        "搜尋倉庫",
      );
      for (const [key, title] of [
        ["item", "消耗"],
        ["kafra", "商城"],
        ["armor", "防具"],
        ["arms", "武器"],
        ["ammo", "彈藥"],
        ["card", "卡片"],
        ["etc", "其他"],
      ])
        label(root.querySelector(`.tabs button.${key}`), title);
    }
  }
  return () => selected?.classList.remove("ro-mobile-selected");
}
