-- Rollback de oficina_ultima_venta: elimina la funcion de la oficina (no hay tablas ni datos asociados).
-- La oficina sigue funcionando sin ella (vuelve a detectar la venta con la lectura de facturacion cada ~5 min).
drop function if exists public.oficina_ultima_venta();
