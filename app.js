import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://hfevopcpbxqgiolvnmhc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_KTJfgYW3EOgwO3-2q5GZ0Q_InE2RAHP';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = id => document.getElementById(id);
const iso = d => new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
let invoices = [], currentUser = null, authMode = 'login';

function money(n){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n)||0);}
function dateLabel(s){return s?new Date(s+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—';}
function status(i){return i.paid?'paid':i.dueDate<iso(new Date())?'overdue':'pending';}
function statusLabel(s){return s==='paid'?'Paid':s==='overdue'?'Overdue':'Pending';}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function setAuthMode(mode){
 authMode=mode;$('authTitle').textContent=mode==='signup'?'Create your account':'Welcome back';
 $('authIntro').textContent=mode==='signup'?'Create a secure workspace for your business.':'Sign in to access your invoices and follow-ups.';
 $('authSubmit').textContent=mode==='signup'?'Create account':'Sign in';
 $('authSwitch').firstChild.textContent=mode==='signup'?'Already have an account? ':'New to RevenuePilot AI? ';
 $('authToggle').textContent=mode==='signup'?'Sign in':'Create an account';$('authMessage').textContent='';
}
$('authToggle').addEventListener('click',()=>setAuthMode(authMode==='login'?'signup':'login'));
$('authForm').addEventListener('submit',async e=>{
 e.preventDefault();const f=new FormData(e.currentTarget),email=String(f.get('email')).trim(),password=String(f.get('password'));
 $('authSubmit').disabled=true;$('authMessage').textContent=authMode==='signup'?'Creating your account…':'Signing in…';
 try{
  if(authMode==='signup'){
   const {data,error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:'https://morbidaslayer-stack.github.io/revenuepilot-ai/'}});
   if(error)throw error;
   $('authMessage').textContent=data.session?'Account created. Opening your workspace…':'Account created. Check your email and confirm your address, then return here to sign in.';
  }else{const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;}
 }catch(err){$('authMessage').textContent=err.message||'Unable to complete authentication.';}
 finally{$('authSubmit').disabled=false;}
});

async function loadInvoices(){
 const {data,error}=await supabase.from('invoices').select('*').order('created_at',{ascending:false});if(error)throw error;
 invoices=(data||[]).map(r=>({id:r.id,client:r.client,number:r.invoice_number,amount:Number(r.amount),issueDate:r.issue_date,dueDate:r.due_date,email:r.email||'',paid:r.paid,paidDate:r.paid_date}));
 render();
}
function render(){
 const unpaid=invoices.filter(i=>!i.paid),overdue=unpaid.filter(i=>status(i)==='overdue'),paid=invoices.filter(i=>i.paid&&i.paidDate&&i.paidDate.slice(0,7)===iso(new Date()).slice(0,7));
 $('totalOutstanding').textContent=money(unpaid.reduce((s,i)=>s+i.amount,0));$('overdueAmount').textContent=money(overdue.reduce((s,i)=>s+i.amount,0));
 $('collectedAmount').textContent=money(paid.reduce((s,i)=>s+i.amount,0));$('openCount').textContent=unpaid.length;
 $('overdueCount').textContent=overdue.length+' invoice'+(overdue.length===1?'':'s');
 const q=$('searchInput').value.toLowerCase(),visible=invoices.filter(i=>(i.client+' '+i.number).toLowerCase().includes(q));
 $('invoiceRows').innerHTML=visible.map(i=>{const s=status(i);return `<tr><td class="client-cell"><strong>${esc(i.client)}</strong><small>${esc(i.number)}${i.email?' · '+esc(i.email):''}</small></td><td class="amount">${money(i.amount)}</td><td>${dateLabel(i.dueDate)}</td><td><span class="status ${s}">${statusLabel(s)}</span></td><td><div class="row-actions">${i.paid?'':`<button class="tiny-button" data-remind="${i.id}">Draft reminder</button><button class="tiny-button" data-paid="${i.id}">Mark paid</button>`}</div></td></tr>`}).join('');
 $('emptyState').classList.toggle('hidden',visible.length!==0);$('invoiceCountLabel').textContent=visible.length+' invoice'+(visible.length===1?'':'s');
 const top=[...overdue].sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).slice(0,3);
 $('priorityCards').innerHTML=top.length?top.map(i=>`<article class="priority-card"><div class="priority-card-top"><strong>${esc(i.client)}</strong><span class="priority-label">${Math.max(1,Math.floor((new Date(iso(new Date()))-new Date(i.dueDate+'T12:00:00'))/86400000))} days overdue</span></div><div class="priority-amount">${money(i.amount)}</div><p>${esc(i.number)} · Due ${dateLabel(i.dueDate)}<br>${i.email?'Contact: '+esc(i.email):'No client email added'}</p><button class="secondary-button" data-remind="${i.id}">Prepare follow-up →</button></article>`).join(''):'<article class="priority-card"><strong>You are all caught up.</strong><p>No overdue invoices right now. Add an invoice to start tracking your receivables.</p><button class="secondary-button" id="priorityAdd">＋ Add invoice</button></article>';
}
function openModal(id){$(id).classList.remove('hidden')}function closeModal(id){$(id).classList.add('hidden')}
function openReminder(id){
 const i=invoices.find(x=>x.id===id);if(!i)return;const days=Math.max(0,Math.floor((new Date(iso(new Date()))-new Date(i.dueDate+'T12:00:00'))/86400000));
 $('draftMeta').textContent=`${i.client} · ${i.number} · ${money(i.amount)} · ${days} days overdue`;
 $('reminderDraft').value=`Subject: Friendly reminder — ${i.number}\n\nHi ${i.client.split(' ')[0]} team,\n\nI hope you are doing well. I wanted to send a quick reminder that invoice ${i.number} for ${money(i.amount)} was due on ${dateLabel(i.dueDate)}.\n\nCould you please let us know when we can expect payment? If payment has already been arranged, please disregard this note. I would be happy to resend the invoice or help with any questions.\n\nThank you for your continued business.\n\nBest regards,\n[Your name]`;
 $('copyFeedback').textContent='';openModal('reminderModal');
}
$('addInvoice').addEventListener('click',()=>openModal('invoiceModal'));$('addInvoiceTop').addEventListener('click',()=>openModal('invoiceModal'));
$('searchInput').addEventListener('input',render);
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closeModal(b.dataset.close)));
document.querySelectorAll('.modal-backdrop').forEach(el=>el.addEventListener('click',e=>{if(e.target===el)el.classList.add('hidden')}));
$('invoiceForm').addEventListener('submit',async e=>{
 e.preventDefault();const f=new FormData(e.target),amount=Number(f.get('amount'));if(!Number.isFinite(amount)||amount<=0)return;
 const row={user_id:currentUser.id,client:String(f.get('client')).trim(),invoice_number:String(f.get('number')).trim(),amount,issue_date:f.get('issueDate'),due_date:f.get('dueDate'),email:String(f.get('email')).trim()||null};
 const btn=e.submitter;if(btn)btn.disabled=true;
 try{const {error}=await supabase.from('invoices').insert(row);if(error)throw error;await loadInvoices();e.target.reset();closeModal('invoiceModal')}
 catch(err){alert('Could not save invoice: '+err.message)}finally{if(btn)btn.disabled=false}
});
document.addEventListener('click',async e=>{
 const r=e.target.closest('[data-remind]');if(r)openReminder(r.dataset.remind);
 const p=e.target.closest('[data-paid]');if(p){const {error}=await supabase.from('invoices').update({paid:true,paid_date:iso(new Date())}).eq('id',p.dataset.paid);if(error)alert('Could not update invoice: '+error.message);else await loadInvoices()}
 if(e.target.id==='priorityAdd')openModal('invoiceModal');
});
$('copyReminder').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('reminderDraft').value);$('copyFeedback').textContent='Reminder copied. Review it in your email app before sending.'}catch{$('reminderDraft').select();$('copyFeedback').textContent='Select and copy the reminder text manually.'}});
$('menuButton').addEventListener('click',()=>$('sidebar').classList.toggle('open'));document.querySelectorAll('.nav-item').forEach(a=>a.addEventListener('click',()=>$('sidebar').classList.remove('open')));
$('logoutButton').addEventListener('click',async()=>{const {error}=await supabase.auth.signOut();if(error)alert(error.message)});
async function showWorkspace(user){currentUser=user;$('authScreen').classList.add('hidden');$('appShell').classList.remove('hidden');$('accountEmail').textContent=user.email||'';try{await loadInvoices()}catch(err){alert('Unable to load your cloud invoices: '+err.message)}}
supabase.auth.onAuthStateChange((event,session)=>{if(session?.user)showWorkspace(session.user);else{currentUser=null;invoices=[];$('appShell').classList.add('hidden');$('authScreen').classList.remove('hidden')}});
const {data:{session},error}=await supabase.auth.getSession();if(error)$('authMessage').textContent=error.message;if(session?.user)await showWorkspace(session.user);else setAuthMode('login');
