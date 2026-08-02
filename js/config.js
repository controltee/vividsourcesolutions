// config.js — public Supabase connection details.
//
// The anon key is public by design: it only grants what Row Level Security
// allows, which is the real security boundary (see sql/003_rls.sql). The
// service_role key must NEVER appear in this repo, in any file, ever.

// Web3Forms identifies the destination inbox. Public by design too — it grants
// access to nothing, it only says where a submission is emailed. Lives here
// rather than in contact.js because the estimator posts to the same inbox and
// two copies of a key is one copy too many.
export const WEB3FORMS_ACCESS_KEY = '11d96307-207d-4c24-9378-dea299083f92';
export const WEB3FORMS_ENDPOINT = 'https://api.web3forms.com/submit';

export const SUPABASE_URL = 'https://ccaggjhyeygyosbdnxmq.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjYWdnamh5ZXlneW9zYmRueG1xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNjMzNzksImV4cCI6MjA5NjgzOTM3OX0.Z2NJXnSNoJtugQ0Co-R_SMH3dXbErVcCcItgxj_PQxs';
