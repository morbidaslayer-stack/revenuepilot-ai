import { supabase } from './supabase-client.js';
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
    .select('client, invoice_number, amount, line_items, issue_date, due_date, email, paid, paid_date, issuer_snapshot, payment_method')
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

  const {data:receivedRows,error:receivedError}=await supabase.from('invoice_payments').select('amount,payment_date,method,reference').eq('invoice_id',invoiceId).order('payment_date',{ascending:false});
  if(receivedError) throw new Error('Could not load payment history: '+receivedError.message);
  const recordedPayments=receivedRows||[];
  const receivedAmount=recordedPayments.reduce((sum,p)=>sum+Number(p.amount||0),0);
  const legacyPaid=!!invoice.paid&&!recordedPayments.length;
  const amountReceived=legacyPaid?Number(invoice.amount):receivedAmount;
  const balanceDue=Math.max(0,Number(invoice.amount)-amountReceived);
  const isFullyPaid=legacyPaid||balanceDue<0.005;

  let payments=null;
  if(invoice.payment_method==='bank_transfer'){
    const {data,error}=await supabase.from('invoice_payment_settings')
      .select('bank_name,bank_account_name,bank_iban,bank_swift_bic,bank_payment_instructions')
      .eq('user_id',session.user.id).maybeSingle();
    if(error) throw new Error('Could not load bank-transfer settings: '+error.message);
    payments=data;
  }

  const currency=issuer.currency||'USD';
  const companyName=issuer.company_name||'Your Company';
  const initials=companyName.split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'CO';
  const state=isFullyPaid?'PAID':(invoice.due_date<new Date().toISOString().slice(0,10)?'OVERDUE':(amountReceived>0?'PARTIALLY PAID':'UNPAID'));
  const contact=[issuer.contact_name,issuer.business_email,issuer.phone,issuer.website].filter(Boolean).map(escapeHtml).join('<br>');
  const clientEmail=invoice.email?`<br>${escapeHtml(invoice.email)}`:'';

  const bankTransferHtml=invoice.payment_method==='bank_transfer'?`
      <h3>BANK TRANSFER DETAILS</h3>
      ${payments?`
      <div class="payment-card">
        <div class="payment-kicker">BIAT BANK TRANSFER</div>
        <strong>${escapeHtml(payments.bank_name||'Bank transfer')}</strong>
        <div class="bank-row"><span>Account holder</span><b>${escapeHtml(payments.bank_account_name||'Not configured')}</b></div>
        <div class="bank-row"><span>IBAN</span><b class="iban">${escapeHtml(payments.bank_iban||'Not configured')}</b></div>
        <div class="bank-row"><span>SWIFT / BIC</span><b>${escapeHtml(payments.bank_swift_bic||'Not configured')}</b></div>
        ${payments.bank_payment_instructions?`<p class="bank-instructions">${escapeHtml(payments.bank_payment_instructions)}</p>`:''}
        <p class="bank-instructions">Please include invoice ${escapeHtml(invoice.invoice_number)} as the payment reference.</p>
      </div>`:`<p class="missing">Bank-transfer details have not been configured. Please contact the business before making payment.</p>`}
  `:'';

  const paymentHtml=isFullyPaid?`<div class="paid-note">Payment received in full. Thank you.</div>`:`
    <section class="payment-section">
      <h3>PAYMENT SUMMARY</h3>
      <div class="bank-row"><span>Invoice total</span><b>${escapeHtml(formatMoney(invoice.amount,currency))}</b></div>
      <div class="bank-row"><span>Payments received</span><b>${escapeHtml(formatMoney(amountReceived,currency))}</b></div>
      <div class="bank-row"><span>Remaining balance</span><b>${escapeHtml(formatMoney(balanceDue,currency))}</b></div>
      ${recordedPayments.length?`<p class="bank-instructions">Recorded payments: ${recordedPayments.map(p=>escapeHtml(formatDate(p.payment_date))+" — "+escapeHtml(formatMoney(p.amount,currency))+" ("+escapeHtml(p.method)+")").join("; ")}</p>`:""}
      ${bankTransferHtml}
    </section>`;

  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invoice ${escapeHtml(invoice.invoice_number)}</title>
  <style>
  @page{size:A4;margin:15mm}*{box-sizing:border-box}body{margin:0;color:#1d293b;font:12px/1.5 Arial,Helvetica,sans-serif;background:#fff}.page{max-width:800px;margin:0 auto}
  .top{display:flex;justify-content:space-between;gap:24px;padding-bottom:22px;border-bottom:3px solid #e58a35}.brand{display:flex;gap:12px;align-items:center}.mark{width:45px;height:45px;display:grid;place-items:center;border-radius:12px;background:#14243a;color:#fff;font-weight:800;font-size:17px}h1{margin:0;font-size:22px;letter-spacing:.2px}.company{font-weight:700;margin-bottom:4px}.muted{color:#68758a;font-size:10px}.invoice-title{text-align:right}.invoice-title h2{margin:0 0 6px;font-size:23px}.status{display:inline-block;margin-top:6px;padding:4px 9px;border-radius:20px;background:#fff2e5;color:#a85d19;font-size:9px;font-weight:700;letter-spacing:1px}
  .details{display:grid;grid-template-columns:1fr 1fr;gap:25px;padding:25px 0}.label{margin-bottom:7px;color:#8994a5;font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase}.name{font-size:14px;font-weight:700;margin-bottom:3px}.meta{text-align:right}.meta-row{display:flex;justify-content:flex-end;gap:14px;margin:4px 0;font-size:10px}.meta-row span:first-child{color:#7c8799}
  table{width:100%;border-collapse:collapse;margin-top:4px}th{padding:11px;background:#f3f5f8;color:#68758a;text-align:left;font-size:9px;letter-spacing:1px}td{padding:14px 11px;border-bottom:1px solid #e8edf3;font-size:11px}th:last-child,td:last-child{text-align:right}.totals{display:flex;justify-content:flex-end;padding:15px 11px}.total-row{min-width:210px;display:flex;justify-content:space-between;gap:25px;font-size:15px;font-weight:800}
  .payment-section{margin-top:12px;border-top:1px solid #e7ebf1;padding-top:15px}.payment-section h3{font-size:10px;letter-spacing:1.3px;margin:0 0 10px;color:#69768a}.payment-card{border:1px solid #e1e6ed;border-radius:9px;padding:13px;break-inside:avoid;max-width:430px}.payment-kicker{font-size:8px;letter-spacing:1px;color:#8994a5;font-weight:700;margin-bottom:7px}.payment-card strong{font-size:12px}.payment-card p{font-size:9px;color:#68758a;margin:6px 0}.bank-row{display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid #f0f2f5;font-size:9px}.bank-row span{color:#788497}.bank-row b{text-align:right;overflow-wrap:anywhere}.iban{letter-spacing:.3px}.bank-instructions{font-size:8px!important;line-height:1.4}.missing{color:#b45309!important}.paid-note{margin:18px 0;padding:12px;border-radius:7px;background:#eaf7f1;color:#167454;font-weight:700;text-align:center}
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
