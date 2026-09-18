# Redes sociales: referencia de diseno rescatada

Estado: propuesta archivada, no implementada ni aprobada para produccion.
No se conservaron rutas, migraciones, dependencias ni credenciales de la implementacion anterior.

## Funcionalidades originales

- Recibir comentarios y mensajes directos de Instagram, y comentarios de TikTok.
- Detectar consultas mediante patrones de preguntas, precios, disponibilidad y contacto.
- Preparar respuestas asistidas por IA usando contexto configurable del negocio.
- Activar canales, comentarios, mensajes privados y filtro de preguntas por propietario.
- Consultar historial y estadisticas de respuestas. La disponibilidad real de cada API debe validarse antes de implementar; el prototipo no demuestra que el proveedor permita todas estas operaciones.

## Modelo conceptual

- Cuenta de canal: tenant, propietario, plataforma, identificador externo, permisos, estado, vencimiento y referencia opaca al secreto en una boveda. Nunca un token en texto plano en tablas, navegador o logs.
- Politica de respuesta: cuenta, contexto revisado, modalidades permitidas, aprobacion requerida, limites y version de la politica.
- Evento entrante: tenant, cuenta, identificador del proveedor, tipo, fecha, hash del cuerpo, estado de verificacion y deduplicacion.
- Borrador: evento, texto propuesto, modelo/version cuando corresponda, estado de revision y aprobador.
- Intento de envio: borrador aprobado, destino externo, clave idempotente, identificador de proveedor, resultado y fechas.
- Auditoria: actor, tenant, accion, entidad, correlacion y resultado; retencion limitada, contenido sensible minimizado.

## Endpoints conceptuales, no contratos activos

- GET de verificacion de webhook: desafio del proveedor contra configuracion explicita; rechazar si falta.
- POST de eventos por plataforma: validar firma sobre bytes originales antes de procesar; resolver cuenta y tenant desde un registro controlado.
- GET/PUT de configuracion por cuenta: autenticacion, roles y pertenencia obligatorios. No devolver secretos.
- GET de historial/estadisticas: filtros y paginacion limitados al tenant.
- POST para aprobar/rechazar borradores y solicitar envio: permiso separado, auditoria e idempotencia.

## Riesgos del prototipo descartado

Habia un token fijo de verificacion como fallback y eventos POST sin validacion de firmas. Un token de desafio no autentica los eventos posteriores. Los tokens de canal se guardaban directamente en la base. La respuesta de IA podia enviarse sin aprobacion humana, sin deduplicacion robusta ni proteccion de replay. Los logs almacenaban mensajes y errores externos sin una politica de privacidad definida. No copiar esas decisiones.

## Requisitos antes de implementar

1. Configuracion explicita y rechazo seguro; secretos independientes por entorno, rotacion y boveda. Nunca incluir valores operativos en fixtures.
2. Firmas segun el protocolo real de cada proveedor, comparacion segura y conservacion de bytes originales. La prueba del desafio GET no sustituye la firma POST.
3. Verificar timestamps cuando existan, ventana de aceptacion, registro de IDs y hash del cuerpo. Rechazar replay y eventos repetidos; no inventar un timestamp si el proveedor no lo firma.
4. Mapeo verificado cuenta -> tenant -> propietario. No seleccionar el primer usuario ni aceptar un tenant elegido libremente por el payload.
5. Aprobacion humana configurable, activada por defecto; contenido fiscal/profesional requiere revision CPA. No usar texto del mensaje como instrucciones de sistema. No enviar datos de clientes a IA sin base y autorizacion apropiadas.
6. Bandeja de salida transaccional, unicidad por evento/accion, reintentos limitados y consulta al proveedor ante resultados ambiguos. No afirmar exactly-once externo sin soporte del proveedor.
7. Rate limits, cuotas, limites de costo, tamanos de payload, timeout, circuito de fallos y cola duradera. Confirmar recepcion solo despues de persistir el evento validado.
8. Logs sin secretos, control de acceso, retencion y borrado, trazabilidad de aprobacion, contenido final y estado real de entrega.

## Pruebas de aceptacion futuras

Firmas ausentes/invalidas; replay; duplicados concurrentes; cuenta desconocida; acceso cruzado entre tenants; secretos ausentes; falta de permisos del proveedor; borrador no aprobado; revocacion de aprobacion; timeout tras envio; reintento sin duplicacion; expiracion/rotacion de token; ausencia de datos sensibles en logs. Pruebas con proveedores simulados y datos sinteticos, nunca envios reales por defecto.
