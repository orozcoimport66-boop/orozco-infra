-- Oficina virtual: bandera a cuadros al instante.
-- Funcion de SOLO LECTURA que devuelve unicamente dos agregados de los leads terminados:
--   total  = numero de leads con estado 'Proceso terminado'
--   ultima = max(fecha_terminado) de esos leads
-- No devuelve ids, nombres, emails, telefonos ni importes. No toca captacion, etapas ni flujos.
--
-- SECURITY INVOKER (a proposito, en lugar de DEFINER): se ejecuta con los permisos de quien llama,
-- asi que la politica RLS leads_lee (es_equipo()) sigue mandando: un usuario sin sesion de equipo ve 0 / null.
-- Ademas evita el aviso del linter "authenticated_security_definer_function_executable" (21 -> 22).
-- search_path vacio (todo calificado) para que no sea secuestrable.
create or replace function public.oficina_ultima_venta()
returns table (total bigint, ultima timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::bigint, max(l.fecha_terminado)
  from public.leads l
  where l.estado = 'Proceso terminado';
$$;

comment on function public.oficina_ultima_venta() is
  'Oficina virtual: contador y fecha de la ultima venta (Proceso terminado). Solo agregados, sin datos de cliente. Invoker: respeta RLS.';

-- Permisos: solo el rol que usa la oficina (authenticated, con sesion). Nada para anon ni PUBLIC.
revoke all on function public.oficina_ultima_venta() from public, anon;
grant execute on function public.oficina_ultima_venta() to authenticated, service_role;
