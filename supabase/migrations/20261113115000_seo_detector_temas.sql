-- Detector de temas SEO (guías de /guias/). Aplicada el 13/11/2026 con el conector de Supabase.
create table if not exists public.seo_senales (
  id bigserial primary key,
  semana date not null,
  fuente text not null check (fuente in ('ads_terminos','planificador','search_console','monitor_ia','foros')),
  consulta text not null,
  impresiones int, clics int, conversiones numeric, volumen_mensual int, competencia text, posicion numeric, pagina text,
  extra jsonb not null default '{}'::jsonb,
  creado timestamptz not null default now(),
  unique (semana, fuente, consulta)
);
create table if not exists public.seo_temas (
  id bigserial primary key,
  tema text not null,
  consulta_principal text not null unique,
  consultas text[] not null default '{}',
  volumen_mensual int,
  intencion text check (intencion in ('informativa','comparativa','compra','marca')),
  puntuacion numeric,
  estado text not null default 'pendiente' check (estado in ('pendiente','propuesto','en_redaccion','publicado','descartado')),
  url text, lab_codigo text,
  competidores jsonb not null default '[]'::jsonb,
  notas text,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
alter table public.seo_senales enable row level security;
alter table public.seo_temas enable row level security;
create policy seo_senales_ver on public.seo_senales for select using (es_equipo());
create policy seo_temas_ver on public.seo_temas for select using (es_equipo());
create policy seo_temas_edita on public.seo_temas for update using (es_admin()) with check (es_admin());
-- seo_cargar_internas(p_semana): Search Console (90 días) y monitor de IA (28 días) a seo_senales. Ver definición en la base de datos.
