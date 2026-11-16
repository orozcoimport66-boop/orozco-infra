-- Valores fiscales de turismos (Orden HAC/1501/2025, BOE-A-2025-26357, anexo I) para la calculadora
-- del impuesto de matriculación de la web. Datos públicos del BOE: lectura abierta (anon) y escritura solo
-- con la clave de servicio (n8n, flujo «IEDMT · tablas del BOE → Supabase», que se relanza cada enero).

create table if not exists iedmt_vehiculos (
  id bigserial primary key,
  anio int not null,                 -- año de la orden (2026)
  marca text not null,
  modelo text not null,              -- «Modelo-Tipo» tal cual en el BOE
  inicio int,                        -- periodo comercial
  fin int,                           -- vacío = se sigue vendiendo
  cc int,
  cil int,
  motor text,                        -- G, D, Elc, S, GyE, PHEV, M, DyE, SyE, H
  kw numeric,
  cvf numeric,
  cv int,
  valor int not null                 -- euros, precio medio el primer año
);
create index if not exists iedmt_vehiculos_marca on iedmt_vehiculos (anio, marca, inicio);

alter table iedmt_vehiculos enable row level security;
drop policy if exists iedmt_lectura on iedmt_vehiculos;
create policy iedmt_lectura on iedmt_vehiculos for select to anon, authenticated using (true);
grant select on iedmt_vehiculos to anon, authenticated;

-- Marcas del año vigente, para el primer selector
create or replace function iedmt_marcas(p_anio int default null)
returns table (marca text, n bigint)
language sql stable security invoker as $$
  select marca, count(*) from iedmt_vehiculos
  where anio = coalesce(p_anio, (select max(anio) from iedmt_vehiculos))
  group by marca order by marca
$$;
grant execute on function iedmt_marcas(int) to anon, authenticated;

-- Versiones de una marca comercializadas alrededor del año de primera matriculación
create or replace function iedmt_versiones(p_marca text, p_anio_matric int, p_anio int default null)
returns table (id bigint, modelo text, inicio int, fin int, cc int, motor text, kw numeric, cv int, valor int, exacto boolean)
language sql stable security invoker as $$
  select id, modelo, inicio, fin, cc, motor, kw, cv, valor,
         (coalesce(inicio, 0) <= p_anio_matric and coalesce(fin, 9999) >= p_anio_matric) as exacto
  from iedmt_vehiculos
  where anio = coalesce(p_anio, (select max(anio) from iedmt_vehiculos))
    and marca = p_marca
    and coalesce(inicio, 0) <= p_anio_matric + 1
    and coalesce(fin, 9999) >= p_anio_matric - 1
  order by modelo, inicio
$$;
grant execute on function iedmt_versiones(text, int, int) to anon, authenticated;
