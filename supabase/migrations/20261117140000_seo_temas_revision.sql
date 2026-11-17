-- Revisión SEO de las guías publicadas (17/11/2026): fechas para que la tarea semanal sepa cuándo toca.
alter table seo_temas
  add column if not exists publicado_en date,
  add column if not exists revisado_en date,
  add column if not exists cambiado_en date;
comment on column seo_temas.publicado_en is 'Fecha en que la guía pasó a orozcoimport.es (indexable)';
comment on column seo_temas.revisado_en is 'Última revisión SEO con datos de Search Console (la haga o no cambios)';
comment on column seo_temas.cambiado_en is 'Último cambio publicado por la revisión SEO (para dejar 3 semanas antes de volver a tocarla)';
