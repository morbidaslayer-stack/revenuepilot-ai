import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://hfevopcpbxqgiolvnmhc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_lwC30xXVr6wgU2KATUlMBw_oCdS_57z';

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);
