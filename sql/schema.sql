-- =========================================================
-- PontoCerto — schema Supabase
-- Rode este script inteiro no SQL Editor do seu projeto Supabase
-- (Project > SQL Editor > New query > cole e clique em Run)
-- =========================================================

-- Extensão necessária para gerar UUIDs
create extension if not exists "pgcrypto";

-- Tabela principal: cada linha é UMA marcação (entrada ou saída)
create table if not exists public.marcacoes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  data        date not null,
  horario     time not null,
  tipo        text not null check (tipo in ('entrada', 'saida')),
  categoria   text check (categoria in (
                'entrada_antecipada',
                'saida_antecipada',
                'atraso',
                'outro'
              )), -- null = sem categoria (marcação normal, sem ocorrência)
  descricao   text,
  origem      text not null default 'web' check (origem in ('web', 'mobile', 'rep', 'manual')),
  justificado boolean not null default false, -- marcado quando o relatório do mês já foi enviado ao RH
  created_at  timestamptz not null default now()
);

create index if not exists marcacoes_user_data_idx
  on public.marcacoes (user_id, data desc, horario desc);

-- Row Level Security: cada usuário só enxerga e mexe nas próprias marcações
alter table public.marcacoes enable row level security;

drop policy if exists "select_own_marcacoes" on public.marcacoes;
create policy "select_own_marcacoes"
  on public.marcacoes for select
  using (auth.uid() = user_id);

drop policy if exists "insert_own_marcacoes" on public.marcacoes;
create policy "insert_own_marcacoes"
  on public.marcacoes for insert
  with check (auth.uid() = user_id);

drop policy if exists "update_own_marcacoes" on public.marcacoes;
create policy "update_own_marcacoes"
  on public.marcacoes for update
  using (auth.uid() = user_id);

drop policy if exists "delete_own_marcacoes" on public.marcacoes;
create policy "delete_own_marcacoes"
  on public.marcacoes for delete
  using (auth.uid() = user_id);

-- Fim do script.
-- Depois de rodar: vá em Authentication > Providers e confirme que "Email"
-- está habilitado (é o padrão). Para testes rápidos, em Authentication >
-- Settings você pode desabilitar "Confirm email" para não depender de SMTP.

-- =========================================================
-- Banco de Horas — histórico oficial extraído dos PDFs do RH
-- Rode este bloco também no SQL Editor (pode ser na mesma execução acima)
-- =========================================================

create table if not exists public.banco_horas_dias (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  data          date not null,
  saldo_minutos integer not null default 0, -- positivo = crédito, negativo = débito
  tipo          text, -- 'Crédito' | 'Débito' | 'Ímpar' | 'Falta' | null (dia neutro)
  ajustado      boolean not null default false, -- true = recalculado pelo PontoCerto (dia "Ímpar" corrigido)
  updated_at    timestamptz not null default now(),
  unique (user_id, data)
);

-- Se a tabela já existia antes desta atualização, rode só esta linha:
-- alter table public.banco_horas_dias add column if not exists ajustado boolean not null default false;

create index if not exists banco_horas_dias_user_data_idx
  on public.banco_horas_dias (user_id, data);

alter table public.banco_horas_dias enable row level security;

drop policy if exists "select_own_banco_horas" on public.banco_horas_dias;
create policy "select_own_banco_horas"
  on public.banco_horas_dias for select
  using (auth.uid() = user_id);

drop policy if exists "upsert_own_banco_horas" on public.banco_horas_dias;
create policy "upsert_own_banco_horas"
  on public.banco_horas_dias for insert
  with check (auth.uid() = user_id);

drop policy if exists "update_own_banco_horas" on public.banco_horas_dias;
create policy "update_own_banco_horas"
  on public.banco_horas_dias for update
  using (auth.uid() = user_id);

drop policy if exists "delete_own_banco_horas" on public.banco_horas_dias;
create policy "delete_own_banco_horas"
  on public.banco_horas_dias for delete
  using (auth.uid() = user_id);

