/** @param {object} receipt Same shape as ReceiptModal. @param {*} mod Driver module namespace. */
function buildThermalReceiptNodes(receipt, mod) {
  const { text, line, feed, cut } = mod;

  function fit(s, max) {
    const t = String(s ?? '').replace(/\r?\n/g, ' ').trim();
    if (t.length <= max) return t;
    return `${t.slice(0, Math.max(0, max - 1))}…`;
  }

  function money(n) {
    return `$${Number(n).toFixed(2)}`;
  }

  const when = receipt.createdAtDisplay || receipt.createdAt || '';
  const cashier = receipt.cashierName ?? '—';
  const nodes = [];

  nodes.push(text(fit(receipt.shopName, 20), { align: 'center', bold: true, size: 2 }));
  if (receipt.shopAddress) nodes.push(text(fit(receipt.shopAddress, 32), { align: 'center' }));
  if (receipt.shopPhone) nodes.push(text(fit(receipt.shopPhone, 32), { align: 'center' }));
  nodes.push(line());
  nodes.push(text(`Invoice ${receipt.invoiceNumber}`, { bold: true }));
  nodes.push(text(fit(`Date ${when}`, 32)));
  nodes.push(text(fit(`Payment ${receipt.paymentMethod}`, 32)));
  nodes.push(line({ style: 'dashed' }));

  for (const row of receipt.lines || []) {
    const nm = fit(row.name, 32);
    nodes.push(text(nm, { bold: true }));
    const qty = String(row.quantity);
    const unit = money(row.unitPrice);
    const tot = money(row.lineTotal);
    nodes.push(text(`${qty} x ${unit}  =  ${tot}`, { align: 'right' }));
    nodes.push(feed(1));
  }

  nodes.push(line({ style: 'dashed' }));
  nodes.push(text(`TOTAL     ${money(receipt.invoiceTotal)}`, { bold: true, align: 'right' }));
  nodes.push(text(`Tax       ${money(receipt.tax)}`, { align: 'right' }));
  nodes.push(text(`Paid      ${money(receipt.paidAmount)}`, { align: 'right' }));
  nodes.push(text(`Change    ${money(receipt.change)}`, { align: 'right' }));
  nodes.push(line());
  nodes.push(text(fit(`Cashier: ${cashier}`, 32), { align: 'center' }));
  nodes.push(text('Thank you!', { align: 'center', bold: true }));
  nodes.push(feed(2));
  nodes.push(cut());
  return nodes;
}

/**
 * @param {object} receipt
 * @param {{ address: string }} printer
 */
export async function printThermalInvoice(receipt, printer) {
  const mod = await import('react-native-thermal-printer-driver');
  const ThermalPrinter = mod.default;
  const address = printer.address;
  const nodes = buildThermalReceiptNodes(receipt, mod);
  await ThermalPrinter.connect(address, { timeout: 15000 });
  try {
    await ThermalPrinter.print(address, nodes, { paperWidthMm: 58, timeout: 30000 });
  } finally {
    await ThermalPrinter.disconnect(address);
  }
}
