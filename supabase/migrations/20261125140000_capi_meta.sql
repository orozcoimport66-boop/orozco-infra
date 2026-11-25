-- API de conversiones de Meta (25/11/2026, Lab MED-24).
-- 1) Datos del navegador en cada lead para casar los eventos con la persona (fbp, fbc, IP, navegador, URL de entrada)
--    y el event_id que comparte el píxel del navegador con el envío por servidor (Meta deduplica por event_id).
-- 2) Fecha de venta = último pago (lead_fecha_pagado), también para el panel.
-- 3) Cola y log de envíos (capi_envios): una fila por evento y destino, con reintentos.
--    Lead, Lead_Cualificado y Lead_Setting los encola registrar_lead en el alta.
--    Schedule, Llamada_Realizada, Reserva y Purchase los encola capi_encolar() desde el CRM.
-- El flujo de n8n «Meta · API de conversiones» llama a capi_preparar(), manda cada evento y llama a capi_resultado().

alter table public.leads
  add column if not exists meta_event_id text,
  add column if not exists fbp text,
  add column if not exists fbc text,
  add column if not exists ip text,
  add column if not exists user_agent text,
  add column if not exists url_entrada text,
  add column if not exists gbraid text,
  add column if not exists wbraid text,
  add column if not exists fecha_venta timestamptz;

comment on column public.leads.fecha_venta is 'Venta = último pago: cuando reserva + cobros cubren el precio acordado (margen 5 €), o la fecha de Proceso terminado si es antes. Lo mantiene un trigger con lead_fecha_pagado.';

-- 2) Fecha de venta mantenida por triggers
create or replace function public.lead_actualizar_fecha_venta(p_lead uuid)
returns void language sql security definer set search_path to 'public' as $$
  update leads set fecha_venta = lead_fecha_pagado(p_lead)
   where id = p_lead and fecha_venta is distinct from lead_fecha_pagado(p_lead);
$$;

create or replace function public.tg_lead_fecha_venta() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  perform lead_actualizar_fecha_venta(new.id);
  return null;
end $$;

drop trigger if exists lead_fecha_venta on public.leads;
create trigger lead_fecha_venta after insert or update of precio_acordado, facturacion, importe_reserva, fecha_reserva, estado, fecha_terminado
  on public.leads for each row execute function public.tg_lead_fecha_venta();

create or replace function public.tg_cobro_fecha_venta() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform lead_actualizar_fecha_venta(old.lead_id); end if;
  if tg_op in ('INSERT', 'UPDATE') then perform lead_actualizar_fecha_venta(new.lead_id); end if;
  return null;
end $$;

drop trigger if exists cobro_fecha_venta on public.cobros;
create trigger cobro_fecha_venta after insert or update or delete on public.cobros
  for each row execute function public.tg_cobro_fecha_venta();

update public.leads set fecha_venta = lead_fecha_pagado(id) where fecha_reserva is not null or estado = 'Proceso terminado';

-- Última venta de la pantalla de oficina: misma definición
create or replace function public.oficina_ultima_venta()
returns table(total bigint, ultima timestamp with time zone) language sql stable set search_path to '' as $$
  select count(*)::bigint, max(l.fecha_venta) from public.leads l where l.fecha_venta is not null;
$$;

-- 3) Cola y log de envíos
create table if not exists public.capi_envios (
  id bigint generated always as identity primary key,
  lead_id uuid references public.leads(id) on delete cascade,
  plataforma text not null default 'meta',
  evento text not null,
  event_id text not null,
  event_time timestamptz not null,
  valor numeric,
  origen text not null default 'crm',          -- web (alta del formulario) o crm (etapas)
  ip text, user_agent text, url text,          -- foto del envío del formulario (solo eventos web)
  estado text not null default 'pendiente',    -- pendiente, enviado, error, descartado
  intentos int not null default 0,
  ultimo_error text,
  respuesta jsonb,
  claves text[],                               -- datos de usuario que se mandaron (sin valores)
  creado timestamptz not null default now(),
  enviado_en timestamptz,
  unique (plataforma, event_id)
);
create index if not exists capi_envios_pendientes on public.capi_envios (estado, creado) where estado in ('pendiente', 'error');
alter table public.capi_envios enable row level security;
drop policy if exists capi_envios_ver on public.capi_envios;
create policy capi_envios_ver on public.capi_envios for select using (es_equipo());

create or replace function public.capi_es_prueba(p_email text, p_nombre text) returns boolean
language sql immutable as $$
  select coalesce(p_email ~* '(prueba|@example\.com$)', false) or coalesce(p_nombre ~* '^prueba', false)
$$;

-- Eventos del alta (los llama registrar_lead). Mismo criterio que la etiqueta Lead de GTM:
-- cuenta todo menos «Estoy valorando si merece la pena importar» (evaluating).
create or replace function public.capi_encolar_alta(p_lead uuid, p jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_eid text := nullif(trim(p->>'event_id'), '');
  v_sit text := coalesce(p->>'situacion', '');
  v_pres text := coalesce(p->>'presupuesto', '');
  v_tipo text := tipo_lead(nullif(v_pres, ''), nullif(v_sit, ''));
  v_valor numeric := case v_sit when 'decided' then 75 when 'undecided' then 37 else 50 end;
begin
  if v_eid is null or v_sit = 'evaluating' or capi_es_prueba(p->>'email', p->>'nombre') then return; end if;
  insert into capi_envios (lead_id, evento, event_id, event_time, valor, origen, ip, user_agent, url)
  values (p_lead, 'Lead', v_eid, now(), v_valor, 'web', p->>'ip', p->>'user_agent', p->>'pagina_origen')
  on conflict do nothing;
  if v_tipo = 'A' then
    insert into capi_envios (lead_id, evento, event_id, event_time, origen, ip, user_agent, url)
    values (p_lead, 'Lead_Cualificado', 'lq_' || v_eid, now(), 'web', p->>'ip', p->>'user_agent', p->>'pagina_origen')
    on conflict do nothing;
  end if;
  if es_lead_setting(v_tipo, v_pres) then
    insert into capi_envios (lead_id, evento, event_id, event_time, origen, ip, user_agent, url)
    values (p_lead, 'Lead_Setting', 'ls_' || v_eid, now(), 'web', p->>'ip', p->>'user_agent', p->>'pagina_origen')
    on conflict do nothing;
  end if;
end $$;

-- Eventos del CRM. Meta solo acepta eventos de los últimos 7 días, así que no se manda historia.
create or replace function public.capi_encolar() returns int
language plpgsql security definer set search_path to 'public' as $$
declare n int := 0; m int;
begin
  insert into capi_envios (lead_id, evento, event_id, event_time)
  select v.lead_id, 'Schedule', 'sch_' || v.id, v.creado
    from videollamadas v join leads l on l.id = v.lead_id
   where v.creado > now() - interval '7 days' and not capi_es_prueba(l.email, l.nombre)
  on conflict do nothing;
  get diagnostics m = row_count; n := n + m;

  insert into capi_envios (lead_id, evento, event_id, event_time)
  select l.id, 'Llamada_Realizada', 'llr_' || l.id, l.fecha_llamada
    from leads l where l.fecha_llamada > now() - interval '7 days' and l.fecha_llamada <= now()
     and not capi_es_prueba(l.email, l.nombre)
  on conflict do nothing;
  get diagnostics m = row_count; n := n + m;

  insert into capi_envios (lead_id, evento, event_id, event_time, valor)
  select l.id, 'Reserva', 'res_' || l.id, l.fecha_reserva, coalesce(nullif(l.importe_reserva, 0), 250)
    from leads l where l.fecha_reserva > now() - interval '7 days' and not capi_es_prueba(l.email, l.nombre)
  on conflict do nothing;
  get diagnostics m = row_count; n := n + m;

  insert into capi_envios (lead_id, evento, event_id, event_time, valor)
  select l.id, 'Purchase', 'pur_' || l.id, l.fecha_venta, coalesce(l.precio_acordado, l.facturacion, 1573)
    from leads l where l.fecha_venta > now() - interval '7 days' and not capi_es_prueba(l.email, l.nombre)
  on conflict do nothing;
  get diagnostics m = row_count; n := n + m;
  return n;
end $$;

create or replace function public.capi_sha(p text) returns text
language sql immutable as $$
  select case when nullif(trim(coalesce(p, '')), '') is null then null
              else encode(sha256(convert_to(lower(trim(p)), 'UTF8')), 'hex') end
$$;

-- Prepara los eventos pendientes (encola antes los del CRM) con el cuerpo listo para Meta.
-- Devuelve una fila por evento: id del envío y el objeto «data» de la API de conversiones.
create or replace function public.capi_preparar(p_limite int default 50)
returns table(envio_id bigint, evento text, cuerpo jsonb)
language plpgsql security definer set search_path to 'public' as $$
begin
  perform capi_encolar();
  -- Lo que ya no se puede mandar (más de 7 días) se descarta
  update capi_envios set estado = 'descartado', ultimo_error = coalesce(ultimo_error, 'más de 7 días')
   where estado in ('pendiente', 'error') and event_time < now() - interval '7 days' + interval '10 minutes';
  return query
  with e as (
    select c.*, l.email, l.telefono, l.nombre, l.codigo_postal, l.fbp, l.fbc, l.fbclid, l.creado lead_creado,
           l.ip lead_ip, l.user_agent lead_ua, coalesce(l.url_entrada, l.pagina_origen) lead_url,
           regexp_replace(coalesce(l.telefono, ''), '[^0-9]', '', 'g') tel
      from capi_envios c join leads l on l.id = c.lead_id
     where c.plataforma = 'meta' and c.estado in ('pendiente', 'error') and c.intentos < 5
       and (c.estado = 'pendiente' or c.creado < now() - (c.intentos * interval '10 minutes'))
     order by c.creado limit p_limite
  ), u as (
    select e.*,
      coalesce(e.ip, e.lead_ip) ip_f, coalesce(e.user_agent, e.lead_ua) ua_f, coalesce(e.url, e.lead_url) url_f,
      coalesce(e.fbc, case when e.fbclid is not null
        then 'fb.1.' || (extract(epoch from e.lead_creado) * 1000)::bigint || '.' || e.fbclid end) fbc_f,
      case when length(e.tel) = 9 then '34' || e.tel when e.tel = '' then null else e.tel end tel_f
    from e
  )
  select u.id, u.evento, jsonb_strip_nulls(jsonb_build_object(
    'event_name', u.evento,
    'event_time', extract(epoch from u.event_time)::bigint,
    'event_id', u.event_id,
    'action_source', case when u.ua_f is not null then 'website' else 'system_generated' end,
    'event_source_url', u.url_f,
    'user_data', jsonb_build_object(
      'em', case when u.email is not null then jsonb_build_array(capi_sha(u.email)) end,
      'ph', case when u.tel_f is not null then jsonb_build_array(capi_sha(u.tel_f)) end,
      'fn', case when nullif(split_part(trim(coalesce(u.nombre, '')), ' ', 1), '') is not null
                 then jsonb_build_array(capi_sha(split_part(trim(u.nombre), ' ', 1))) end,
      'zp', case when u.codigo_postal ~ '^[0-9]{5}$' then jsonb_build_array(capi_sha(u.codigo_postal)) end,
      'country', jsonb_build_array(capi_sha('es')),
      'external_id', jsonb_build_array(capi_sha(u.lead_id::text)),
      'client_ip_address', u.ip_f,
      'client_user_agent', u.ua_f,
      'fbc', u.fbc_f,
      'fbp', u.fbp),
    'custom_data', case when u.valor is not null then jsonb_build_object('value', u.valor, 'currency', 'EUR') end
  ))
  from u;
end $$;

-- Resultado de cada envío
create or replace function public.capi_resultado(p_envio bigint, p_ok boolean, p_respuesta jsonb, p_claves text[] default null)
returns void language sql security definer set search_path to 'public' as $$
  update capi_envios set
    intentos = intentos + 1,
    estado = case when p_ok then 'enviado' else 'error' end,
    enviado_en = case when p_ok then now() else enviado_en end,
    ultimo_error = case when p_ok then null else left(coalesce(p_respuesta->'error'->>'message', p_respuesta::text), 500) end,
    respuesta = p_respuesta,
    claves = coalesce(p_claves, claves)
  where id = p_envio;
$$;

revoke all on function public.capi_preparar(int) from public, anon, authenticated;
revoke all on function public.capi_resultado(bigint, boolean, jsonb, text[]) from public, anon, authenticated;
revoke all on function public.capi_encolar() from public, anon, authenticated;
revoke all on function public.capi_encolar_alta(uuid, jsonb) from public, anon, authenticated;

-- 1) registrar_lead: guarda los datos del navegador y encola los eventos del alta
create or replace function public.registrar_lead(p jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_email    text := nullif(lower(trim(p->>'email')), '');
  v_tel      text := nullif(trim(p->>'telefono'), '');
  v_id_email uuid;
  v_id_tel   uuid;
  v_id       uuid;
  v_nuevo    boolean := false;
begin
  if v_email is null and v_tel is null then
    raise exception 'Lead sin email ni teléfono';
  end if;

  if v_email is not null then
    select id into v_id_email from leads where lower(email) = v_email limit 1;
  end if;
  if v_tel is not null then
    select id into v_id_tel from leads where telefono = v_tel order by creado limit 1;
  end if;
  v_id := coalesce(v_id_email, v_id_tel);

  if v_id is null then
    insert into leads (nombre, email, telefono, codigo_postal, situacion, modelo, presupuesto, url_anuncio, mensaje,
                       canal, utm_source, utm_medium, utm_campaign, utm_content, utm_term, gclid, fbclid, pagina_origen, experimento, referente, guia_origen,
                       meta_event_id, fbp, fbc, ip, user_agent, url_entrada, gbraid, wbraid)
    values (p->>'nombre', v_email, v_tel, p->>'codigo_postal', p->>'situacion', p->>'modelo', p->>'presupuesto',
            p->>'url_anuncio', p->>'mensaje', p->>'canal', p->>'utm_source', p->>'utm_medium', p->>'utm_campaign',
            p->>'utm_content', p->>'utm_term', nullif(p->>'gclid',''), nullif(p->>'fbclid',''), p->>'pagina_origen', p->>'experimento',
            nullif(p->>'referente',''), nullif(p->>'guia_origen',''),
            nullif(p->>'event_id',''), nullif(p->>'fbp',''), nullif(p->>'fbc',''), nullif(p->>'ip',''), nullif(p->>'user_agent',''),
            nullif(p->>'url_entrada',''), nullif(p->>'gbraid',''), nullif(p->>'wbraid',''))
    returning id into v_id;
    v_nuevo := true;
  else
    update leads set
      actualizado   = now(),
      envios        = envios + 1,
      nombre        = coalesce(nullif(p->>'nombre',''), nombre),
      email         = coalesce(email, v_email),
      telefono      = coalesce(v_tel, telefono),
      codigo_postal = coalesce(nullif(p->>'codigo_postal',''), codigo_postal),
      situacion     = coalesce(nullif(p->>'situacion',''), situacion),
      modelo        = coalesce(nullif(p->>'modelo',''), modelo),
      presupuesto   = coalesce(nullif(p->>'presupuesto',''), presupuesto),
      url_anuncio   = coalesce(nullif(p->>'url_anuncio',''), url_anuncio),
      mensaje       = coalesce(nullif(p->>'mensaje',''), mensaje),
      gclid         = coalesce(gclid, nullif(p->>'gclid','')),
      fbclid        = coalesce(fbclid, nullif(p->>'fbclid','')),
      referente     = coalesce(referente, nullif(p->>'referente','')),
      guia_origen   = coalesce(guia_origen, nullif(p->>'guia_origen','')),
      -- Datos del navegador: los del último envío, que son los más frescos para casar eventos futuros
      meta_event_id = coalesce(nullif(p->>'event_id',''), meta_event_id),
      fbp           = coalesce(nullif(p->>'fbp',''), fbp),
      fbc           = coalesce(nullif(p->>'fbc',''), fbc),
      ip            = coalesce(nullif(p->>'ip',''), ip),
      user_agent    = coalesce(nullif(p->>'user_agent',''), user_agent),
      url_entrada   = coalesce(url_entrada, nullif(p->>'url_entrada','')),
      gbraid        = coalesce(gbraid, nullif(p->>'gbraid','')),
      wbraid        = coalesce(wbraid, nullif(p->>'wbraid',''))
    where id = v_id;
  end if;

  insert into envios (lead_id, nuevo, datos) values (v_id, v_nuevo, p);

  -- La cola de la API de conversiones nunca puede tumbar el alta del lead
  begin
    perform capi_encolar_alta(v_id, p);
  exception when others then
    raise warning 'capi_encolar_alta: %', sqlerrm;
  end;

  return jsonb_build_object('id', v_id, 'nuevo', v_nuevo);
end;
$function$;
