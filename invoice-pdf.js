import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://hfevopcpbxqgiolvnmhc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_KTJfgYW3EOgwO3-2q5GZ0Q_InE2RAHP';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

const formatMoney = (amount, currency) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: /^[A-Z]{3}$/.test(currency || '') ? currency : 'USD'
}).format(Number(amount) || 0);

const formatDate = (value) => value
  ? new Date(value + 'T12:00:00').toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    })
  : '—';

function addPdfButtons() {
  const rows = document.getElementById('invoiceRows');
  if (!rows) return;

  const addButtons = () => {
    rows.querySelectorAll('.row-actions').forEach((actions) => {
      if (actions.querySelector('[data-pdf]')) return;
      const editButton = actions.querySelector('[data-edit]');
      if (!editButton) return;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tiny-button';
      button.textContent = 'PDF';
      button.dataset.pdf = editButton.dataset.edit;
      button.setAttribute('aria-label', 'Prepare PDF invoice');
      actions.insertBefore(button, actions.firstChild);
    });
  };

  new MutationObserver(addButtons).observe(rows, {
    childList: true,
    subtree: true
  });
  addButtons();
}

async function preparePdf(invoiceId, printWindow) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session?.user) throw new Error('Your session has expired. Please sign in again.');

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('client, invoice_number, amount, issue_date, due_date, email, paid, paid_date, issuer_snapshot')
    .eq('id', invoiceId)
    .single();

  if (invoiceError) throw invoiceError;

  let issuer = invoice.issuer_snapshot || {};
  if (!issuer.company_name) {
    const { data: profile, error: profileError } = await supabase
      .from('company_settings')
      .select('company_name, contact_name, business_email, phone, website, currency, timezone')
      .eq('user_id', session.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    issuer = profile || issuer;
  }

  const currency = issuer.currency || 'USD';
  const companyName = issuer.company_name || 'Your Company';
  const initials = companyName.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase() || 'CO';
  const status = invoice.paid ? 'PAID' : (invoice.due_date < new Date().toISOString().slice(0, 10) ? 'OVERDUE' : 'UNPAID');
  const contactLines = [
    issuer.contact_name,
    issuer.business_email,
    issuer.phone,
    issuer.website
  ].filter(Boolean);

  const contactHtml = contactLines.map(escapeHtml).join('<br>');
  const clientEmail = invoice.email ? `<br>${escapeHtml(invoice.email)}` : '';
  const paidLine = invoice.paid && invoice.paid_date
    ? `<p class="paid-line">Payment received: ${escapeHtml(formatDate(invoice.paid_date))}</p>`
    : '';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Invoice ${escapeHtml(invoice.invoice_number)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #1d293b; font: 14px/1.55 Arial, Helvetica, sans-serif; background: #fff; }
  .page { max-width: 800px; margin: 0 auto; }
  .top { display: flex; justify-content: space-between; gap: 30px; padding-bottom: 28px; border-bottom: 3px solid #7059df; }
  .brand { display: flex; gap: 13px; align-items: center; }
  .mark { width: 48px; height: 48px; display: grid; place-items: center; border-radius: 13px; background: #7059df; color: #fff; font-weight: 800; font-size: 18px; }
  h1 { margin: 0; font-size: 30px; letter-spacing: 1px; }
  .company { font-size: 14px; font-weight: 700; margin-bottom: 4px; }
  .muted { color: #68758a; font-size: 12px; }
  .invoice-title { text-align: right; }
  .invoice-title h2 { margin: 0 0 8px; font-size: 25px; }
  .status { display: inline-block; margin-top: 7px; padding: 5px 10px; border-radius: 20px; background: #f0edff; color: #6650cc; font-size: 10px; font-weight: 700; letter-spacing: 1px; }
  .details { display: grid; grid-template-columns: 1fr 1fr; gap: 35px; padding: 34px 0; }
  .label { margin-bottom: 8px; color: #8a95a6; font-size: 10px; font-weight: 700; letter-spacing: 1.3px; text-transform: uppercase; }
  .name { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
  .meta { text-align: right; }
  .meta-row { display: flex; justify-content: flex-end; gap: 18px; margin: 5px 0; font-size: 12px; }
  .meta-row span:first-child { color: #7c8799; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { padding: 13px 14px; background: #f5f6fa; color: #68758a; text-align: left; font-size: 10px; letter-spacing: 1px; }
  td { padding: 17px 14px; border-bottom: 1px solid #e8edf3; font-size: 13px; }
  th:last-child, td:last-child { text-align: right; }
  .totals { display: flex; justify-content: flex-end; padding: 18px 14px; }
  .total-row { min-width: 230px; display: flex; justify-content: space-between; gap: 30px; font-size: 16px; font-weight: 800; }
  .paid-line { color: #168663; text-align: right; font-size: 12px; }
  .footer { margin-top: 70px; padding-top: 18px; border-top: 1px solid #e8edf3; color: #68758a; font-size: 11px; text-align: center; }
  .footer strong { display: block; color: #26334a; font-size: 13px; margin-bottom: 5px; }
  .print-tip { margin: 20px 0; color: #7c8799; font-size: 11px; text-align: center; }
  @media print { .print-tip { display: none; } }
</style>
</head>
<body>
<div class="page">
  <header class="top">
    <div class="brand">
      <div class="mark">${escapeHtml(initials)}</div>
      <div><div class="company">${escapeHtml(companyName)}</div><div class="muted">${contactHtml || ' '}</div></div>
    </div>
    <div class="invoice-title">
      <h2>INVOICE</h2>
      <div class="muted"># ${escapeHtml(invoice.invoice_number)}</div>
      <span class="status">${status}</span>
    </div>
  </header>

  <section class="details">
    <div>
      <div class="label">Bill to</div>
      <div class="name">${escapeHtml(invoice.client)}</div>
      <div class="muted">${clientEmail || ''}</div>
    </div>
    <div class="meta">
      <div class="meta-row"><span>Invoice date</span><strong>${escapeHtml(formatDate(invoice.issue_date))}</strong></div>
      <div class="meta-row"><span>Due date</span><strong>${escapeHtml(formatDate(invoice.due_date))}</strong></div>
      ${invoice.paid_date ? `<div class="meta-row"><span>Paid date</span><strong>${escapeHtml(formatDate(invoice.paid_date))}</strong></div>` : ''}
    </div>
  </section>

  <table>
    <thead><tr><th>DESCRIPTION</th><th>AMOUNT</th></tr></thead>
    <tbody><tr><td>Services provided — Invoice ${escapeHtml(invoice.invoice_number)}</td><td>${escapeHtml(formatMoney(invoice.amount, currency))}</td></tr></tbody>
  </table>
  <div class="totals"><div class="total-row"><span>Total</span><span>${escapeHtml(formatMoney(invoice.amount, currency))}</span></div></div>
  ${paidLine}
  <footer class="footer">
    <strong>Thank you for your business.</strong>
    Please arrange payment by the due date shown above. Contact us if you have any questions about this invoice.
  </footer>
  <p class="print-tip">Choose “Save as PDF” in your browser's print destination to download this invoice.</p>
</div>
<script>
  window.addEventListener('load', () => {
    setTimeout(() => { window.focus(); window.print(); }, 350);
  });
</script>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-pdf]');
  if (!button) return;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Your browser blocked the PDF window. Please allow pop-ups for this website and try again.');
    return;
  }

  printWindow.document.write('<!doctype html><title>Preparing invoice…</title><p style="font:16px Arial;padding:30px">Preparing your invoice…</p>');
  try {
    await preparePdf(button.dataset.pdf, printWindow);
  } catch (error) {
    printWindow.document.body.innerHTML = `<p style="font:16px Arial;padding:30px;color:#a33">Could not prepare invoice: ${escapeHtml(error.message || 'Unknown error')}</p>`;
  }
});

addPdfButtons();
