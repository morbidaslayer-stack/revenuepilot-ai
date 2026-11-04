import { supabase } from './supabase-client.js';
import './invoice-pdf.js';

const form = document.getElementById('companySettingsForm');
if (form) {
  const message = document.getElementById('settingsMessage');
  const button = document.getElementById('saveSettingsButton');

  async function loadCompanySettings() {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session?.user) {
      message.textContent = 'Sign in to manage company settings.';
      button.disabled = true;
      return;
    }
    const { data, error } = await supabase.from('company_settings')
      .select('company_name, contact_name, business_email, phone, website, currency, timezone')
      .eq('user_id', session.user.id).maybeSingle();
    if (error) throw error;
    if (data) for (const [key, value] of Object.entries(data)) {
      if (form.elements[key]) form.elements[key].value = value ?? '';
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.textContent = 'Saving…';
    button.disabled = true;
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session?.user) throw new Error('Your session has expired. Please sign in again.');
      const values = Object.fromEntries(new FormData(form).entries());
      const record = {
        user_id: session.user.id,
        company_name: String(values.company_name || '').trim(),
        contact_name: String(values.contact_name || '').trim() || null,
        business_email: String(values.business_email || '').trim() || null,
        phone: String(values.phone || '').trim() || null,
        website: String(values.website || '').trim() || null,
        currency: values.currency || 'USD',
        timezone: String(values.timezone || '').trim() || null,
        updated_at: new Date().toISOString()
      };
      if (!record.company_name) throw new Error('Company name is required.');
      const { error } = await supabase.from('company_settings').upsert(record, { onConflict: 'user_id' });
      if (error) throw error;
      window.dispatchEvent(new CustomEvent('company-settings-updated', { detail: record }));
      message.textContent = 'Company settings saved to your private workspace.';
    } catch (error) {
      message.textContent = error.message || 'Could not save settings.';
    } finally {
      button.disabled = false;
    }
  });
  loadCompanySettings().catch(error => { message.textContent = 'Could not load settings: ' + (error.message || 'Unknown error'); });

  // Inject the bank-transfer settings panel without changing the existing page markup.
  const section = document.getElementById('companySettings');
  if (section && !document.getElementById('paymentSettingsForm')) {
    const panel = document.createElement('div');
    panel.className = 'settings-card payment-settings-card';
    panel.innerHTML = `
      <div class="eyebrow">INVOICE PAYMENT OPTIONS</div>
      <h3>BIAT bank transfer</h3>
      <p class="payment-help">Your bank details are stored in your private workspace. They appear on PDF invoices only when you select “BIAT bank transfer” for that invoice.</p>
      <form id="paymentSettingsForm">
        <div class="settings-grid">
          <label>Bank name<input name="bank_name" maxlength="120" placeholder="BIAT" required></label>
          <label>Account holder name<input name="bank_account_name" maxlength="160" placeholder="Account holder as registered" required></label>
          <label>IBAN<input name="bank_iban" maxlength="40" autocomplete="off" placeholder="Enter your IBAN" required></label>
          <label>SWIFT / BIC<input name="bank_swift_bic" maxlength="20" placeholder="Bank SWIFT/BIC" required></label>
          <label>Bank transfer instructions<input name="bank_payment_instructions" maxlength="500" placeholder="Include invoice number as payment reference"></label>
        </div>
        <div class="settings-actions"><span id="paymentSettingsMessage" role="status"></span><button class="primary-button" id="savePaymentSettingsButton" type="submit">Save bank details</button></div>
      </form>`;
    section.appendChild(panel);

    const paymentForm = panel.querySelector('#paymentSettingsForm');
    const paymentMessage = panel.querySelector('#paymentSettingsMessage');
    const paymentButton = panel.querySelector('#savePaymentSettingsButton');

    async function loadPaymentSettings() {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session?.user) throw new Error('Sign in to manage payment details.');
      const { data, error } = await supabase.from('invoice_payment_settings')
        .select('bank_name, bank_account_name, bank_iban, bank_swift_bic, bank_payment_instructions')
        .eq('user_id', session.user.id).maybeSingle();
      if (error) throw error;
      if (data) for (const [key, value] of Object.entries(data)) {
        if (paymentForm.elements[key]) paymentForm.elements[key].value = value ?? '';
      }
    }

    paymentForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      paymentMessage.textContent = 'Saving securely…';
      paymentButton.disabled = true;
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session?.user) throw new Error('Your session has expired. Please sign in again.');
        const v = Object.fromEntries(new FormData(paymentForm).entries());
        const record = {
          user_id: session.user.id,
          bank_name: String(v.bank_name || '').trim(),
          bank_account_name: String(v.bank_account_name || '').trim(),
          bank_iban: String(v.bank_iban || '').replace(/\s+/g, '').toUpperCase(),
          bank_swift_bic: String(v.bank_swift_bic || '').trim().toUpperCase(),
          bank_payment_instructions: String(v.bank_payment_instructions || '').trim() || null,
          updated_at: new Date().toISOString()
        };
        if (!record.bank_name || !record.bank_account_name || !record.bank_iban || !record.bank_swift_bic) {
          throw new Error('Complete all required bank fields.');
        }
        const { error } = await supabase.from('invoice_payment_settings').upsert(record, { onConflict: 'user_id' });
        if (error) throw error;
        paymentMessage.textContent = 'Bank-transfer details saved to your private workspace.';
      } catch (error) {
        paymentMessage.textContent = error.message || 'Could not save bank details.';
      } finally {
        paymentButton.disabled = false;
      }
    });
    loadPaymentSettings().catch(error => { paymentMessage.textContent = 'Bank settings: ' + (error.message || 'Could not load. Check that the payment settings table exists.'); });
  }
}
