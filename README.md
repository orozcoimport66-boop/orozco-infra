# orozco-infra

Infraestructura del marketing de Orozco Import: servidor, webs, automatizaciones.

**Repositorio público: nunca claves, tokens ni datos de clientes.**

| Ruta | Qué es |
| --- | --- |
| `server/bootstrap.sh` | Preparación inicial del servidor (Ubuntu 24.04): parches automáticos, swap, SSH sin contraseña, cortafuegos 80/443 y Caddy |
| `server/oi-site` | Añade/quita sitios en Caddy validando antes y restaurando si algo falla |
| `server/install-mcp.sh` | Instala/actualiza el conector MCP de archivos en `mcp.orozcoimport.es` |
| `mcp/` | Conector MCP: herramientas solo sobre `/srv/sites`, historial de versiones, OAuth con contraseña |

Servidor: Hetzner CAX11 `orozco-01` · 2.28.141.211 · 2a01:4f8:c012:53::1

Subdominios: `pre.` (vista previa de webs), `mcp.` (conector de Claude), `n8n.` (automatizaciones), `panel.` (CRM).
