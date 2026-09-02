// =========================================================
// PontoCerto — Configuração do Supabase
// =========================================================
// 1. Crie um projeto grátis em https://supabase.com
// 2. Vá em Project Settings > API
// 3. Copie a "Project URL" e a chave "anon public"
// 4. Cole os valores abaixo
// =========================================================

const SUPABASE_URL = 'https://evbpjztglasdthtgtomv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2YnBqenRnbGFzZHRodGd0b212Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwNDQyMDksImV4cCI6MjEwMTYyMDIwOX0.Lnr4OEkXAamboHuH1ki5faXrjYaob3WBX_lYXdOTZ5s';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
