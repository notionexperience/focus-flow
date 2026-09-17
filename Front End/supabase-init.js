// supabase-init.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js'

// Replace these with YOUR values from Supabase
const SUPABASE_URL = 'https://nfezdvgckxpualotctqu.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mZXpkdmdja3hwdWFsb3RjdHF1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTYzNjIzNSwiZXhwIjoyMTA1MjEyMjM1fQ.OoF9tziZkKVAjzB_w7wk0Zm4CFxQQ4ZDojBCIXdmRuY'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)