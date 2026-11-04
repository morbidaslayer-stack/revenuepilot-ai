import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://hfevopcpbxqgiolvnmhc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_KTJfgYW3EOgwO3-2q5GZ0Q_InE2RAHP';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const formatMoney = (amount, currency) => new Intl.NumberFormat('en-US', {
  style:'currency', currency:/^[A-Z]{3}$/.test(currency || '') ? currency : 'USD'
}).format(Number(amount) || 0);
const formatDate = value => value ? new Date(value + 'T12:00:00').toLocaleDateString('en-US', {
  year:'numeric', month:'long', day:'numeric'
}) : '—';

function addPdfButtons() {
  const rows = document.getElementById('invoiceRows');
  if (!rows) return;
  const addButtons = () => rows.querySelectorAll('.row-actions').forEach(actions => {
    if (actions.querySelector('[data-pdf]')) return;
    const edit = actions.querySelector('[data-edit]');
    if (!edit) return;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'tiny-button';
    button.textContent = 'PDF'; button.dataset.pdf = edit.dataset.edit;
    button.setAttribute('aria-label','Prepare PDF invoice');
    actions.insertBefore(button, actions.firstChild);
  });
  new MutationObserver(addButtons).observe(rows,{childList:true,subtree:true});
  addButtons();
}

async function preparePdf(invoiceId, printWindow) {
  const {data:{session},error:sessionError}=await supabase.auth.getSession();
  if(sessionError) throw sessionError;
  if(!session?.user) throw new Error('Your session has expired. Please sign in again.');

  const {data:invoice,error:invoiceError}=await supabase.from('invoices')
    .select('client, invoice_number, amount, line_items, issue_date, due_date, email, paid, paid_date, issuer_snapshot')
    .eq('id',invoiceId).single();
  if(invoiceError) throw invoiceError;

  let issuer=invoice.issuer_snapshot||{};
  if(!issuer.company_name){
    const {data:profile,error}=await supabase.from('company_settings')
      .select('company_name,contact_name,business_email,phone,website,currency,timezone')
      .eq('user_id',session.user.id).maybeSingle();
    if(error) throw error;
    issuer=profile||issuer;
  }

  const {data:payments,error:paymentError}=await supabase.from('invoice_payment_settings')
    .select('lemon_squeezy_checkout_url,bank_name,bank_account_name,bank_iban,bank_swift_bic,bank_payment_instructions')
    .eq('user_id',session.user.id).maybeSingle();
  if(paymentError) throw new Error('Payment settings are not ready. Run payment-settings.sql and save your details in Company settings. ' + paymentError.message);

  const currency=issuer.currency||'USD';
  const companyName=issuer.company_name||'Your Company';
  const initials=companyName.split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'CO';
  const state=invoice.paid?'PAID':(invoice.due_date<new Date().toISOString().slice(0,10)?'OVERDUE':'UNPAID');
  const contact=[issuer.contact_name,issuer.business_email,issuer.phone,issuer.website].filter(Boolean).map(escapeHtml).join('<br>');
  const clientEmail=invoice.email?`<br>${escapeHtml(invoice.email)}`:'';
  const checkout=payments?.lemon_squeezy_checkout_url;
  const checkoutValid=checkout && /^https:\/\/[a-z0-9.-]+\.lemonsqueezy\.com\/checkout\/buy\/[a-z0-9-]+/i.test(checkout);
  const paymentHtml=invoice.paid?`<div class="paid-note">Payment received${invoice.paid_date?' on '+escapeHtml(formatDate(invoice.paid_date)):''}. Thank you.</div>`:`
    <section class="payment-section">
      <h3>PAYMENT OPTIONS</h3>
      <div class="payment-grid">
        <div class="payment-card online">
          <div class="payment-kicker">OPTION 1 · ONLINE PAYMENT</div>
          <strong>Pay securely online</strong>
          <p>Use the secure Lemon Squeezy checkout link below.</p>
          ${checkoutValid?`<a class="pay-link" href="${escapeHtml(checkout)}">Pay invoice online</a><div class="small-link">${escapeHtml(checkout)}</div>`:'<p class="missing">Online checkout link has not been configured.</p>'}
        </div>
        <div class="payment-card">
          <div class="payment-kicker">OPTION 2 · BANK TRANSFER</div>
          <strong>${escapeHtml(payments?.bank_name||'Bank transfer')}</strong>
          <div class="bank-row"><span>Account holder</span><b>${escapeHtml(payments?.bank_account_name||'Not configured')}</b></div>
          <div class="bank-row"><span>IBAN</span><b class="iban">${escapeHtml(payments?.bank_iban||'Not configured')}</b></div>
          <div class="bank-row"><span>SWIFT / BIC</span><b>${escapeHtml(payments?.bank_swift_bic||'Not configured')}</b></div>
          ${payments?.bank_payment_instructions?`<p class="bank-instructions">${escapeHtml(payments.bank_payment_instructions)}</p>`:''}
          <p class="bank-instructions">Please include invoice ${escapeHtml(invoice.invoice_number)} as the payment reference.</p>
        </div>
      </div>
      <p class="availability-note">Online checkout availability depends on the customer's country and Lemon Squeezy eligibility. If checkout is unavailable, use the bank transfer option and confirm any incoming-transfer requirements with your bank.</p>
    </section>`;

  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invoice ${escapeHtml(invoice.invoice_number)}</title>
  <style>
  @page{size:A4;margin:15mm}*{box-sizing:border-box}body{margin:0;color:#1d293b;font:12px/1.5 Arial,Helvetica,sans-serif;background:#fff}.page{max-width:800px;margin:0 auto}
  .top{display:flex;justify-content:space-between;gap:24px;padding-bottom:22px;border-bottom:3px solid #e58a35}.brand{display:flex;gap:12px;align-items:center}.mark{width:45px;height:45px;display:grid;place-items:center;border-radius:12px;background:#14243a;color:#fff;font-weight:800;font-size:17px}h1{margin:0;font-size:22px;letter-spacing:.2px}.company{font-weight:700;margin-bottom:4px}.muted{color:#68758a;font-size:10px}.invoice-title{text-align:right}.invoice-title h2{margin:0 0 6px;font-size:23px}.status{display:inline-block;margin-top:6px;padding:4px 9px;border-radius:20px;background:#fff2e5;color:#a85d19;font-size:9px;font-weight:700;letter-spacing:1px}
  .details{display:grid;grid-template-columns:1fr 1fr;gap:25px;padding:25px 0}.label{margin-bottom:7px;color:#8994a5;font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase}.name{font-size:14px;font-weight:700;margin-bottom:3px}.meta{text-align:right}.meta-row{display:flex;justify-content:flex-end;gap:14px;margin:4px 0;font-size:10px}.meta-row span:first-child{color:#7c8799}
  table{width:100%;border-collapse:collapse;margin-top:4px}th{padding:11px;background:#f3f5f8;color:#68758a;text-align:left;font-size:9px;letter-spacing:1px}td{padding:14px 11px;border-bottom:1px solid #e8edf3;font-size:11px}th:last-child,td:last-child{text-align:right}.totals{display:flex;justify-content:flex-end;padding:15px 11px}.total-row{min-width:210px;display:flex;justify-content:space-between;gap:25px;font-size:15px;font-weight:800}
  .payment-section{margin-top:12px;border-top:1px solid #e7ebf1;padding-top:15px}.payment-section h3{font-size:10px;letter-spacing:1.3px;margin:0 0 10px;color:#69768a}.payment-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.payment-card{border:1px solid #e1e6ed;border-radius:9px;padding:13px;break-inside:avoid}.payment-card.online{border-top:3px solid #e58a35}.payment-kicker{font-size:8px;letter-spacing:1px;color:#8994a5;font-weight:700;margin-bottom:7px}.payment-card strong{font-size:12px}.payment-card p{font-size:9px;color:#68758a;margin:6px 0}.pay-link{display:inline-block;margin-top:7px;padding:9px 13px;background:#14243a;color:#fff;text-decoration:none;border-radius:6px;font-weight:700;font-size:10px}.small-link{font-size:7px;color:#788497;overflow-wrap:anywhere;margin-top:6px}.bank-row{display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid #f0f2f5;font-size:9px}.bank-row span{color:#788497}.bank-row b{text-align:right;overflow-wrap:anywhere}.iban{letter-spacing:.3px}.bank-instructions{font-size:8px!important;line-height:1.4}.missing{color:#b45309!important}.availability-note{font-size:8px;color:#788497;margin:9px 0}.paid-note{margin:18px 0;padding:12px;border-radius:7px;background:#eaf7f1;color:#167454;font-weight:700;text-align:center}
  .footer{margin-top:25px;padding-top:13px;border-top:1px solid #e8edf3;color:#68758a;font-size:9px;text-align:center}.footer strong{display:block;color:#26334a;font-size:11px;margin-bottom:4px}.print-tip{margin:14px 0;color:#7c8799;font-size:9px;text-align:center}@media print{.print-tip{display:none}}
  </style></head><body><div class="page">
  <header class="top"><div class="brand"><div class="mark">RP</div><div><div class="company">${escapeHtml(companyName)}</div><div class="muted">${contact||' '}</div></div></div>
  <div class="invoice-title"><h2>INVOICE</h2><div class="muted"># ${escapeHtml(invoice.invoice_number)}</div><span class="status">${state}</span></div></header>
  <section class="details"><div><div class="label">Bill to</div><div class="name">${escapeHtml(invoice.client)}</div><div class="muted">${clientEmail}</div></div>
  <div class="meta"><div class="meta-row"><span>Invoice date</span><strong>${escapeHtml(formatDate(invoice.issue_date))}</strong></div><div class="meta-row"><span>Due date</span><strong>${escapeHtml(formatDate(invoice.due_date))}</strong></div>${invoice.paid_date?`<div class="meta-row"><span>Paid date</span><strong>${escapeHtml(formatDate(invoice.paid_date))}</strong></div>`:''}</div></section>
  <table><thead><tr><th>DESCRIPTION</th><th>QTY</th><th>UNIT PRICE</th><th>LINE TOTAL</th></tr></thead><tbody>${(Array.isArray(invoice.line_items)&&invoice.line_items.length?invoice.line_items:[{description:"Services provided — Invoice "+invoice.invoice_number,quantity:1,unit_price:invoice.amount}]).map(item=>`<tr><td>${escapeHtml(item.description||"Service")}</td><td>${escapeHtml(item.quantity??1)}</td><td>${escapeHtml(formatMoney(item.unit_price??invoice.amount,currency))}</td><td>${escapeHtml(formatMoney((Number(item.quantity)||1)*(Number(item.unit_price)||0),currency))}</td></tr>`).join("")}</tbody></table>
  <div class="totals"><div class="total-row"><span>Total due</span><span>${escapeHtml(formatMoney(invoice.amount,currency))}</span></div></div>
  ${paymentHtml}<footer class="footer"><strong>Thank you for your business.</strong>Please arrange payment by the due date shown above. Contact us if you have any questions.</footer>
  <p class="print-tip">Choose “Save as PDF” in your browser's print destination to download this invoice.</p></div>
  <script>window.addEventListener('load',()=>setTimeout(()=>{window.focus();window.print()},350));</script></body></html>`;
  printWindow.document.open();printWindow.document.write(html);printWindow.document.close();
}

document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-pdf]');
  if(!button)return;
  const win=window.open('','_blank');
  if(!win){alert('Your browser blocked the PDF window. Allow pop-ups for this website and try again.');return;}
  win.document.write('<!doctype html><title>Preparing invoice…</title><p style="font:16px Arial;padding:30px">Preparing invoice…</p>');
  try{await preparePdf(button.dataset.pdf,win)}
  catch(error){win.document.body.innerHTML=`<p style="font:14px Arial;padding:30px;color:#a33">Could not prepare invoice: ${escapeHtml(error.message||'Unknown error')}</p>`}
});
addPdfButtons();
