// config.js — public Supabase connection details.
//
// The anon key is public by design: it only grants what Row Level Security
// allows, which is the real security boundary (see sql/003_rls.sql). The
// service_role key must NEVER appear in this repo, in any file, ever.

export const SUPABASE_URL = 'https://ccaggjhyeygyosbdnxmq.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjYWdnamh5ZXlneW9zYmRueG1xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNjMzNzksImV4cCI6MjA5NjgzOTM3OX0.Z2NJXnSNoJtugQ0Co-R_SMH3dXbErVcCcItgxj_PQxs';
