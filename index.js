const generateButton = document.getElementById("generate");
const qrState = document.getElementById("qrState");
const qrHelp = document.getElementById("qrHelp");
const nameInput = document.getElementById("name");
const emailInput = document.getElementById("email");
const customAmountInput = document.getElementById("customAmount");
const amountDisplay = document.getElementById("amountDisplay");
const presetAmounts = document.getElementById("presetAmounts");

function formatAmount(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? `SGD ${numeric.toFixed(2)}` : "SGD 0.00";
}

function setActiveChip(amount) {
  const chips = presetAmounts ? Array.from(presetAmounts.querySelectorAll(".amount-chip")) : [];
  chips.forEach((chip) => {
    chip.classList.toggle("is-active", chip.dataset.amount === String(amount));
  });
}

if (presetAmounts && customAmountInput && amountDisplay) {
  presetAmounts.addEventListener("click", (event) => {
    const chip = event.target.closest(".amount-chip");
    if (!chip) return;
    const amount = chip.dataset.amount;
    customAmountInput.value = amount;
    amountDisplay.textContent = formatAmount(amount);
    setActiveChip(amount);
  });

  customAmountInput.addEventListener("input", () => {
    amountDisplay.textContent = formatAmount(customAmountInput.value);
    setActiveChip(customAmountInput.value);
  });
}

if (generateButton && qrState && qrHelp && nameInput && emailInput && customAmountInput) {
  generateButton.addEventListener("click", () => {
    const name = nameInput.value.trim() || "supporter";
    const email = emailInput.value.trim() || "their email";
    const amount = formatAmount(customAmountInput.value);

    qrState.textContent = "Ready to scan";
    qrHelp.textContent =
      `This page is now prepared for ${name}. In the live version, your backend would ask Airwallex for a real PayNow QR for ${amount}, then show it here and send confirmation to ${email}.`;

    generateButton.textContent = "QR requested";
    generateButton.disabled = true;
    generateButton.style.opacity = "0.75";
  });
}
