import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://hfevopcpbxqgiolvnmhc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_KTJfgYW3EOgwO3-2q5GZ0Q_InE2RAHP';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

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

    const { data, error } = await supabase
      .from('company_settings')
      .select('company_name, contact_name, business_email, phone, website, currency, timezone')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (error) throw error;
    if (data) {
      for (const [key, value] of Object.entries(data)) {
        if (form.elements[key]) form.elements[key].value = value ?? '';
      }
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

      const { error } = await supabase
        .from('company_settings')
        .upsert(record, { onConflict: 'user_id' });

      if (error) throw error;
      window.dispatchEvent(new CustomEvent('company-settings-updated', { detail: record }));
      message.textContent = 'Company settings saved to your private workspace.';
    } catch (error) {
      message.textContent = error.message || 'Could not save company settings.';
    } finally {
      button.disabled = false;
    }
  });

  loadCompanySettings().catch(error => {
    message.textContent = 'Could not load settings: ' + (error.message || 'Unknown error');
  });
}
