const KEY = 'revenuepilot_invoices_v1';
const today = new Date();
const iso = d => new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
const daysAgo = n => { const d=new Date(); d.setDate(d.getDate()-n); return iso(d); };
const daysFromNow = n => { const d=new Date(); d.setDate(d.getDate()+n); return iso(d); };
const sampleInvoices = [
  {id:'1',client:'Northstar Creative',number:'INV-1042',amount:4800,issueDate:daysAgo(35),dueDate:daysAgo(5),email:'finance@northstar.example',paid:false},
  {id:'2',client:'Brightline Studio',number:'INV-1048',amount:2150,issueDate:daysAgo(21),dueDate:daysAgo(2),email:'accounts@brightline.example',paid:false},
  {id:'3',client:'Atlas Consulting',number:'INV-1051',amount:3200,issueDate:daysAgo(12),dueDate:daysFromNow(9),email:'billing@atlas.example',paid:false},
  {id:'4',client:'Fieldwork Media',number:'INV-1036',amount:1750,issueDate:daysAgo(44),dueDate:daysAgo(14),email:'ops@fieldwork.example',paid:true,paidDate:daysAgo(3)}
];
let invoices = loadInvoices();
function loadInvoices(){try{const saved=localStorage.getItem(KEY);return saved?JSON.parse(saved):sampleInvoices;}catch{return sampleInvoices;}}
function save(){localStorage.setItem(KEY,JSON.stringify(invoices));render();}
function money(n){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n)||0);}
function dateLabel(s){if(!s)return '—';return new Date(s+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}
function status(inv){if(inv.paid)return 'paid';return inv.dueDate<iso(new Date())?'overdue':'pending';}
function statusLabel(s){return s==='paid'?'Paid':s==='overdue'?'Overdue':'Pending';}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function render(){
 const unpaid=invoices.filter(i=>!i.paid), overdue=unpaid.filter(i=>status(i)==='overdue'), paid=invoices.filter(i=>i.paid&&i.paidDate&&i.paidDate.slice(0,7)===iso(new Date()).slice(0,7));
 document.getElementById('totalOutstanding').textContent=money(unpaid.reduce((s,i)=>s+Number(i.amount),0));
 document.getElementById('overdueAmount').textContent=money(overdue.reduce((s,i)=>s+Number(i.amount),0));
 document.getElementById('collectedAmount').textContent=money(paid.reduce((s,i)=>s+Number(i.amount),0));
 document.getElementById('openCount').textContent=unpaid.length;
 document.getElementById('overdueCount').textContent=overdue.length+' invoice'+(overdue.length===1?'':'s');
 const q=document.getElementById('searchInput').value.toLowerCase();
 const visible=invoices.filter(i=>(i.client+' '+i.number).toLowerCase().includes(q));
 document.getElementById('invoiceRows').innerHTML=visible.map(i=>{const s=status(i);return `<tr><td class="client-cell"><strong>${escapeHtml(i.client)}</strong><small>${escapeHtml(i.number)}${i.email?' · '+escapeHtml(i.email):''}</small></td><td class="amount">${money(i.amount)}</td><td>${dateLabel(i.dueDate)}</td><td><span class="status ${s}">${statusLabel(s)}</span></td><td><div class="row-actions">${i.paid?'':`<button class="tiny-button" data-remind="${i.id}">Draft reminder</button><button class="tiny-button" data-paid="${i.id}">Mark paid</button>`}</div></td></tr>`;}).join('');
 document.getElementById('emptyState').classList.toggle('hidden',visible.length!==0);
 document.getElementById('invoiceCountLabel').textContent=visible.length+' invoice'+(visible.length===1?'':'s');
 const priority=overdue.sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).slice(0,3);
 document.getElementById('priorityCards').innerHTML=priority.length?priority.map(i=>`<article class="priority-card"><div class="priority-card-top"><strong>${escapeHtml(i.client)}</strong><span class="priority-label">${Math.max(1,Math.floor((new Date(iso(new Date()))-new Date(i.dueDate+'T12:00:00'))/86400000))} days overdue</span></div><div class="priority-amount">${money(i.amount)}</div><p>${escapeHtml(i.number)} · Due ${dateLabel(i.dueDate)}<br>${i.email?'Contact: '+escapeHtml(i.email):'No client email added'}</p><button class="secondary-button" data-remind="${i.id}">Prepare follow-up →</button></article>`).join(''):'<article class="priority-card"><strong>You are all caught up.</strong><p>No overdue invoices right now. Add an invoice to start tracking your receivables.</p><button class="secondary-button" id="priorityAdd">＋ Add invoice</button></article>';
}
function openModal(id){document.getElementById(id).classList.remove('hidden');}
function closeModal(id){document.getElementById(id).classList.add('hidden');}
function openReminder(id){const i=invoices.find(x=>x.id===id);if(!i)return;const overdueDays=Math.max(0,Math.floor((new Date(iso(new Date()))-new Date(i.dueDate+'T12:00:00'))/86400000));const greeting=i.client.split(' ')[0];document.getElementById('draftMeta').textContent=`${i.client} · ${i.number} · ${money(i.amount)} · ${overdueDays} days overdue`;document.getElementById('reminderDraft').value=`Subject: Friendly reminder — ${i.number}\n\nHi ${greeting} team,\n\nI hope you are doing well. I wanted to send a quick reminder that invoice ${i.number} for ${money(i.amount)} was due on ${dateLabel(i.dueDate)}.\n\nCould you please let us know when we can expect payment? If payment has already been arranged, please disregard this note. I would be happy to resend the invoice or help with any questions.\n\nThank you for your continued business.\n\nBest regards,\n[Your name]`;document.getElementById('copyFeedback').textContent='';openModal('reminderModal');}
document.getElementById('addInvoice').addEventListener('click',()=>openModal('invoiceModal'));
document.getElementById('addInvoiceTop').addEventListener('click',()=>openModal('invoiceModal'));
document.getElementById('searchInput').addEventListener('input',render);
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closeModal(b.dataset.close)));
document.querySelectorAll('.modal-backdrop').forEach(el=>el.addEventListener('click',e=>{if(e.target===el)el.classList.add('hidden')}));
document.getElementById('invoiceForm').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target);const amount=Number(f.get('amount'));if(!Number.isFinite(amount)||amount<=0)return;invoices.unshift({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),client:f.get('client').trim(),number:f.get('number').trim(),amount,issueDate:f.get('issueDate'),dueDate:f.get('dueDate'),email:f.get('email').trim(),paid:false});save();e.target.reset();closeModal('invoiceModal');});
document.addEventListener('click',e=>{const remind=e.target.closest('[data-remind]');if(remind)openReminder(remind.dataset.remind);const paid=e.target.closest('[data-paid]');if(paid){const i=invoices.find(x=>x.id===paid.dataset.paid);if(i){i.paid=true;i.paidDate=iso(new Date());save();}}if(e.target.id==='priorityAdd')openModal('invoiceModal');});
document.getElementById('copyReminder').addEventListener('click',async()=>{const text=document.getElementById('reminderDraft').value;try{await navigator.clipboard.writeText(text);document.getElementById('copyFeedback').textContent='Reminder copied. Review it in your email app before sending.';}catch{document.getElementById('reminderDraft').select();document.getElementById('copyFeedback').textContent='Select and copy the reminder text manually.';}});
document.getElementById('menuButton').addEventListener('click',()=>document.getElementById('sidebar').classList.toggle('open'));
document.querySelectorAll('.nav-item').forEach(a=>a.addEventListener('click',()=>document.getElementById('sidebar').classList.remove('open')));
render();
